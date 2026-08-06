import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel, LargeGridStore, LargeGridView, alignmentKey, chunkRowsFor, deriveRowId, getSetting,
  migrateManifestToV2, normalizeManifest, parseRowId, refreshSettingsCache, rowIdRevisionFor,
  settingsCache, splitAlignmentKey, synthesizeChunkRowIds,
} from "../src/extension.js";

const NO_STORAGE = { getItem: () => null, setItem: () => {} };

/** Seeds the settings cache the way `refreshSettingsCache` does at load, without any Roam API. */
function withSettings(values) {
  refreshSettingsCache({ settings: { getAll: () => ({ ...values }) } }, NO_STORAGE);
}

function installRoamMock(initial = {}) {
  let uidCounter = 0;
  let fileCounter = 0;
  const blocks = new Map();
  const files = new Map();
  const uploads = [];
  const downloads = [];

  const add = (uid, string, children = []) => {
    const block = { uid, string, order: 0, children };
    blocks.set(uid, block);
    for (const child of children) addExisting(child);
    return block;
  };
  const addExisting = (block) => {
    blocks.set(block.uid, block);
    for (const child of block.children || []) addExisting(child);
  };
  for (const [uid, value] of Object.entries(initial.blocks || {})) add(uid, value.string, value.children || []);
  for (const [url, value] of Object.entries(initial.files || {})) files.set(url, typeof value === "string" ? value : JSON.stringify(value));

  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  const findParent = (uid) => [...blocks.values()].find((block) => block.children?.some((child) => child.uid === uid));
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (query, bound) => { const uid = bound ?? /:block\/uid \"([^\"]+)\"/.exec(query)?.[1]; return uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []; },
    data: { block: {
      create: async ({ location, block }) => { const created = { ...block, order: location.order === "last" ? 999 : location.order, children: [] }; blocks.set(block.uid, created); blocks.get(location["parent-uid"]).children.push(created); },
      update: async ({ block }) => { blocks.get(block.uid).string = block.string; },
      move: async ({ location, block }) => { const parent = findParent(block.uid); if (parent) parent.children = parent.children.filter((child) => child.uid !== block.uid); blocks.get(location["parent-uid"]).children.push(blocks.get(block.uid)); },
      delete: async ({ block }) => { const parent = findParent(block.uid); if (parent) parent.children = parent.children.filter((child) => child.uid !== block.uid); blocks.delete(block.uid); },
    } },
    file: {
      upload: async ({ file }) => { const url = `https://mock/${++fileCounter}`; const text = await file.text(); files.set(url, text); uploads.push({ url, text: JSON.parse(text) }); return url; },
      get: async ({ url }) => { downloads.push(url); if (!files.has(url)) throw new Error(`missing ${url}`); return new File([files.get(url)], "grid.json", { type: "application/json" }); },
      delete: async ({ url }) => files.delete(url),
    },
  } };
  return { blocks, files, uploads, downloads, dispose: () => delete globalThis.window };
}

test("large grid seeds immutable chunks and verified manifest pointer", async (t) => {
  const mock = installRoamMock({ blocks: { anchor001: { string: "{{[[roam/grid]]}}", children: [] } } });
  t.after(mock.dispose);
  const rows = Array.from({ length: 501 }, (_, row) => [String(row), `v${row}`]);
  const store = await new LargeGridStore("anchor001").initialize(new GridModel({ rows, showHeaders: false }));
  assert.equal(store.manifest.chunks.length, 2);
  assert.equal(store.manifest.rowCount, 501);
  assert.equal(store.manifest.showHeaders, false);
  assert.match(mock.blocks.get(store.pointerUid).string, /^roam-grid\/manifest:: https:\/\/mock\//);
  assert.equal(mock.uploads.filter((item) => item.text.schema === "roam-grid/chunk").length, 2);
  assert.equal((await store.getRows(499, 501))[1][1], "v500");
});

test("single-cell edit uploads only its dirty chunk and a new manifest", async (t) => {
  const mock = installRoamMock({ blocks: { anchor002: { string: "{{[[roam/grid]]}}", children: [] } } });
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor002").initialize(new GridModel({ rows: Array.from({ length: 700 }, (_, row) => [String(row)]) }));
  const before = mock.uploads.length;
  await store.setCell(510, 0, "changed");
  await store.commit();
  const newUploads = mock.uploads.slice(before);
  assert.equal(newUploads.filter((item) => item.text.schema === "roam-grid/chunk").length, 1);
  assert.equal(newUploads.filter((item) => item.text.schema === "roam-grid/manifest").length, 1);
  assert.equal(await store.getRaw(510, 0), "changed");
  assert.ok(store.manifest.previous);
});

test("large-grid row heights and column widths persist in manifest-only saves", async (t) => {
  const mock = installRoamMock({ blocks: { anchor006: { string: "{{[[roam/grid]]}}", children: [] } } });
  t.after(mock.dispose);
  const model = new GridModel({ rows: [[{ uid: "row-one", raw: "a" }, { uid: "cell-two", raw: "b" }]], columnIds: ["col-a", "col-b"], widths: { "col-a": 190 }, rowHeights: { "row-one": 44 }, alignments: { "cell-two": "right" }, fitToWidth: false });
  const store = await new LargeGridStore("anchor006").initialize(model);
  assert.equal(store.rowHeight(0), 44);
  assert.equal(store.manifest.widths["col-a"], 190);
  assert.equal(store.getAlignment(0, 1), "right");
  assert.equal(store.manifest.fitToWidth, false);
  const before = mock.uploads.length;
  store.setRowHeight(0, 58);
  store.setColumnWidth(1, 230);
  store.setAlignment(0, 0, "center");
  await store.commit();
  const uploads = mock.uploads.slice(before);
  assert.equal(uploads.filter((item) => item.text.schema === "roam-grid/chunk").length, 0);
  assert.equal(uploads.filter((item) => item.text.schema === "roam-grid/manifest").length, 1);
  assert.equal(store.rowHeight(0), 58);
  assert.equal(store.manifest.widths["col-b"], 230);
  const roundTrip = await store.toModel();
  assert.equal(roundTrip.getRowHeight(0), 58);
  assert.equal(roundTrip.widths["col-b"], 230);
  assert.equal(roundTrip.getAlignment(0, 0), "center");
  assert.equal(roundTrip.getAlignment(0, 1), "right");
  assert.equal(roundTrip.fitToWidth, false);
});

test("large grid refuses stale manifest overwrite", async (t) => {
  const mock = installRoamMock({ blocks: { anchor003: { string: "{{[[roam/grid]]}}", children: [] } } });
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor003").initialize(new GridModel({ rows: [["a"]] }));
  await store.setCell(0, 0, "b");
  mock.blocks.get(store.pointerUid).string = "roam-grid/manifest:: https://mock/external";
  await assert.rejects(store.commit(), { code: "CONFLICT" });
  assert.equal(store.dirty.size, 1);
});

test("large grid merge enforces non-destructive issue #9 invariant", async (t) => {
  const mock = installRoamMock({ blocks: { anchor004: { string: "{{[[roam/grid]]}}", children: [] } } });
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor004").initialize(new GridModel({ rows: [["anchor", "blocked"], ["", ""]] }));
  await assert.rejects(store.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 }), { code: "MERGE_NONEMPTY" });
  await store.setCell(0, 1, "");
  await store.merge({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 });
  assert.equal(store.mergeAt(1, 1).rowSpan, 2);
  await assert.rejects(store.setCell(1, 1, "hidden"), { code: "MERGE_COVERED" });
});

test("chunkRowsFor pins a legacy manifest to 500 even when the setting says otherwise", async (t) => {
  const chunks = [
    { index: 0, startRow: 0, rowCount: 500, url: "https://mock/legacy-0" },
    { index: 1, startRow: 500, rowCount: 100, url: "https://mock/legacy-1" },
  ];
  // Deliberately no `chunkRows` key — this is what every manifest written before 0.9.0 looks like.
  const manifest = { schema: "roam-grid/manifest", version: 1, revision: "rev", rowCount: 600, colCount: 1, columnIds: ["col0"], widths: {}, frozenRows: 1, frozenCols: 0, merges: [], charts: [], chunks, retained: [] };
  const mock = installRoamMock({
    blocks: { anchor007: { string: "{{[[roam/grid]]}}", children: [{ uid: "pointer07", string: "roam-grid/manifest:: https://mock/legacy-manifest", order: 0, children: [] }] } },
    files: {
      "https://mock/legacy-manifest": manifest,
      "https://mock/legacy-1": { schema: "roam-grid/chunk", version: 1, index: 1, startRow: 500, rows: [["five-hundred"]] },
    },
  });
  t.after(() => { mock.dispose(); settingsCache.clear(); });
  // A live global would address row 500 as chunk 2 — which does not exist — and silently read "".
  withSettings({ "large-chunk-rows": 250 });
  const store = await new LargeGridStore("anchor007").initialize();
  assert.equal(chunkRowsFor(store.manifest), 500, "an absent chunkRows is always 500, never the setting");
  assert.equal(store.manifest.chunkRows, 500, "loading normalizes the legacy manifest in place");
  assert.equal(store.chunkIndexForRow(500), 1);
  assert.equal(store.chunkIndexForRow(499), 0);
  assert.equal(await store.getRaw(500, 0), "five-hundred");
  assert.deepEqual(mock.downloads.filter((url) => url === "https://mock/legacy-1").length, 1);
});

test("chunkRowsFor falls back for every shape a manifest field can arrive in", () => {
  assert.equal(chunkRowsFor(undefined), 500);
  assert.equal(chunkRowsFor(null), 500);
  assert.equal(chunkRowsFor({}), 500);
  for (const raw of [0, -1, 1.5, "", " ", "abc", Number.NaN, Infinity, null, true, [], {}]) {
    assert.equal(chunkRowsFor({ chunkRows: raw }), 500, `${String(raw)} must fall back to 500`);
  }
  assert.equal(chunkRowsFor({ chunkRows: 250 }), 250);
  assert.equal(chunkRowsFor({ chunkRows: "250" }), 250, "a JSON round-trip may hand back a string");
});

test("a new large grid records its own chunk size and takes its dimensions from the settings", async (t) => {
  const mock = installRoamMock({ blocks: { anchor008: { string: "{{[[roam/grid]]}}", children: [] } } });
  t.after(() => { mock.dispose(); settingsCache.clear(); });
  withSettings({ "new-grid-rows": 130, "new-grid-cols": 4, "large-chunk-rows": 50 });
  const store = await new LargeGridStore("anchor008").initialize();
  assert.equal(store.manifest.rowCount, 130);
  assert.equal(store.manifest.colCount, 4);
  assert.equal(store.manifest.chunkRows, 50, "the seeding size is persisted, not re-derived");
  assert.equal(store.manifest.chunks.length, 3);
  assert.equal(store.chunkIndexForRow(125), 2);
  // Moving the setting afterwards must not re-address the grid that was already written.
  withSettings({ "large-chunk-rows": 500 });
  assert.equal(store.chunkIndexForRow(125), 2);
  assert.equal(chunkRowsFor(store.manifest), 50);
});

test("100k-row manifest loads only the visible chunk", async (t) => {
  const chunks = Array.from({ length: 200 }, (_, index) => ({ index, startRow: index * 500, rowCount: 500, url: `https://mock/chunk-${index}` }));
  const manifest = { schema: "roam-grid/manifest", version: 1, revision: "rev", rowCount: 100000, colCount: 26, columnIds: Array.from({ length: 26 }, (_, index) => `col${index}`), widths: {}, frozenRows: 1, frozenCols: 0, merges: [], charts: [], chunks, retained: [] };
  const mock = installRoamMock({
    blocks: { anchor005: { string: "{{[[roam/grid]]}}", children: [{ uid: "pointer05", string: "roam-grid/manifest:: https://mock/manifest", order: 0, children: [] }] } },
    files: { "https://mock/manifest": manifest, "https://mock/chunk-100": { schema: "roam-grid/chunk", version: 1, index: 100, startRow: 50000, rows: Array.from({ length: 500 }, (_, row) => [`row${50000 + row}`]) } },
  });
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor005").initialize();
  mock.downloads.length = 0;
  const rows = await store.getRows(50010, 50030);
  assert.equal(rows[0][0], "row50010");
  assert.deepEqual(mock.downloads, ["https://mock/chunk-100"]);
});

/** A v1 manifest exactly as 0.8.2 wrote it: positional row heights, `"row:col"` alignments. */
function legacyManifest(overrides = {}) {
  return {
    schema: "roam-grid/manifest", version: 1, revision: "v1rev", previous: null, rowCount: 1200, colCount: 2,
    columnIds: ["colA", "colB"], widths: {}, rowHeights: { 0: 44, 501: 60, 1199: 33 }, alignments: { "0:1": "right", "700:0": "center" },
    frozenRows: 1, frozenCols: 0, merges: [], charts: [], chunks: [], retained: [], ...overrides,
  };
}

test("two independent migrations of one v1 manifest synthesize identical row ids", () => {
  const source = legacyManifest();
  // Two clients, no communication, same input — the ids have to agree or a later disjoint-chunk
  // merge would be reconciling two different namings of the same rows.
  const first = migrateManifestToV2(structuredClone(source));
  const second = migrateManifestToV2(structuredClone(source));
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first.rowHeights), ["r_v1rev_0_0", "r_v1rev_1_1", "r_v1rev_2_199"]);
  assert.deepEqual(first.alignments, { "r_v1rev_0_0::colB": "right", "r_v1rev_1_200::colA": "center" });
  assert.equal(first.version, 2);
  assert.equal(first.rowIdRevision, "v1rev");

  // Pure: the manifest handed in is not touched, so a caller can migrate the same object twice.
  assert.deepEqual(source, legacyManifest());

  // Lossless: the original positional maps survive verbatim as the legacy read fallback.
  assert.deepEqual(first.rowHeightsByIndex, { 0: 44, 501: 60, 1199: 33 });
  assert.deepEqual(first.alignmentsByIndex, { "0:1": "right", "700:0": "center" });
});

test("migration keys ids off the manifest's own chunk size, not the global", () => {
  const wide = migrateManifestToV2(legacyManifest({ chunkRows: 250, rowHeights: { 501: 60 }, alignments: {} }));
  assert.deepEqual(Object.keys(wide.rowHeights), ["r_v1rev_2_1"], "row 501 is chunk 2 local 1 at 250 rows per chunk");
  const unnamed = migrateManifestToV2(legacyManifest({ revision: undefined, rowHeights: { 3: 40 }, alignments: {} }));
  assert.equal(unnamed.rowIdRevision, "v1", "a manifest with no revision still lands in one agreed namespace");
  assert.deepEqual(Object.keys(unnamed.rowHeights), ["r_v1_0_3"]);
});

test("migration drops only the entries no stable key exists for", () => {
  const junk = migrateManifestToV2(legacyManifest({
    rowHeights: { 0: 44, "-1": 20, abc: 30 },
    alignments: { "0:1": "right", "0:9": "left", "x:1": "center", "2": "right" },
  }));
  assert.deepEqual(junk.rowHeights, { "r_v1rev_0_0": 44 });
  assert.deepEqual(junk.alignments, { "r_v1rev_0_0::colB": "right" }, "column 9 has no id, so it has no v2 key");
  assert.deepEqual(junk.alignmentsByIndex, { "0:1": "right", "0:9": "left", "x:1": "center", 2: "right" }, "nothing is deleted — the v1 map is kept whole");
});

test("normalizeManifest accepts v1 and v2 and rejects everything else", () => {
  assert.equal(normalizeManifest(legacyManifest()).version, 2);
  const v2 = normalizeManifest(legacyManifest());
  const again = normalizeManifest(v2);
  assert.deepEqual(again, v2, "normalizing a v2 manifest is idempotent, never a second migration");
  assert.equal(again.rowIdRevision, "v1rev", "the id namespace is pinned once and carried, never re-derived");
  assert.notEqual(again, v2, "the input is copied, not normalized in place");

  assert.equal(normalizeManifest({ ...legacyManifest(), rowHeights: undefined, alignments: undefined }).rowHeights !== undefined, true);
  for (const bad of [null, undefined, {}, { schema: "roam-grid/manifest", version: 3, rowCount: 1, colCount: 1, chunks: [] }, { ...legacyManifest(), schema: "other" }, { ...legacyManifest(), rowCount: 1.5 }, { ...legacyManifest(), chunks: null }]) {
    assert.throws(() => normalizeManifest(bad), { code: "UNSUPPORTED_SCHEMA" }, `${JSON.stringify(bad)} must be refused`);
  }
});

test("row id derivation, parsing, and chunk synthesis round-trip", () => {
  assert.equal(deriveRowId("abc", 3, 17), "r_abc_3_17");
  assert.deepEqual(parseRowId("r_abc_3_17", "abc"), { chunk: 3, local: 17 });
  assert.deepEqual(parseRowId("r_rev_with_underscores_2_5", "rev_with_underscores"), { chunk: 2, local: 5 });
  for (const bad of ["r_other_3_17", "abc", "", null, 17, "r_abc_x_17", "r_abc_3_x", "r_abc_-1_2", "r_abc_3"]) {
    assert.equal(parseRowId(bad, "abc"), null, `${String(bad)} is not a row id in this namespace`);
  }
  assert.equal(rowIdRevisionFor({ rowIdRevision: "pinned", revision: "newer" }), "pinned");
  assert.equal(rowIdRevisionFor({ revision: "newer" }), "newer");
  assert.equal(rowIdRevisionFor({}), "v1");

  const chunk = { index: 4, rows: [["a"], ["b"], ["c"]], rowIds: ["kept", "", null] };
  assert.deepEqual(synthesizeChunkRowIds(chunk, "rev"), ["kept", "r_rev_4_1", "r_rev_4_2"]);
  assert.deepEqual(synthesizeChunkRowIds({ index: 0, rows: [] }, "rev"), []);
  assert.deepEqual(synthesizeChunkRowIds({ index: 1, rows: [["a"]] }, "rev", 3), ["r_rev_1_0", "r_rev_1_1", "r_rev_1_2"]);

  assert.equal(alignmentKey("r_rev_0_1", "colA"), "r_rev_0_1::colA");
  assert.deepEqual(splitAlignmentKey("r_rev_0_1::colA"), { rowId: "r_rev_0_1", columnId: "colA" });
  assert.equal(splitAlignmentKey("nothing-here"), null);
});

/** Installs a graph holding one v1 grid: a 3-row chunk, a positional height and alignment. */
function legacyGridMock(anchorUid) {
  const manifest = legacyManifest({
    rowCount: 3, colCount: 2, rowHeights: { 1: 70 }, alignments: { "1:0": "right" },
    chunks: [{ index: 0, startRow: 0, rowCount: 3, url: "https://mock/v1-chunk-0" }],
  });
  return installRoamMock({
    blocks: { [anchorUid]: { string: "{{[[roam/grid]]}}", children: [{ uid: `p-${anchorUid}`, string: "roam-grid/manifest:: https://mock/v1-manifest", order: 0, children: [] }] } },
    files: {
      "https://mock/v1-manifest": manifest,
      "https://mock/v1-chunk-0": { schema: "roam-grid/chunk", version: 1, index: 0, startRow: 0, rows: [["a0", "b0"], ["a1", "b1"], ["a2", "b2"]] },
    },
  });
}

test("a v1 manifest opens with no rewrite and upgrades only when something is actually saved", async (t) => {
  const mock = legacyGridMock("anchor009");
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor009").initialize();
  assert.equal(store.manifest.version, 2, "the in-memory manifest is v2");
  assert.equal(mock.uploads.length, 0, "opening a v1 grid uploads nothing at all");
  assert.equal(JSON.parse(mock.files.get("https://mock/v1-manifest")).version, 1, "the stored file is untouched");
  assert.equal(store.rowHeight(1), 70, "the migrated height reads through");
  assert.equal(store.getAlignment(1, 0), "right");
  assert.equal(await store.getRaw(2, 1), "b2");

  await store.setCell(0, 0, "edited");
  await store.commit();
  const written = mock.uploads.filter((item) => item.text.schema === "roam-grid/manifest").at(-1).text;
  assert.equal(written.version, 2, "the upgrade lands with the first real save");
  assert.equal(written.rowIdRevision, "v1rev");
  assert.deepEqual(written.rowHeights, { "r_v1rev_0_1": 70 });
  assert.deepEqual(written.rowHeightsByIndex, { 1: 70 }, "the v1 map is carried forward, not dropped");
  assert.deepEqual(written.alignments, { "r_v1rev_0_1::colA": "right" });
});

test("loading a chunk to synthesize its ids never makes it dirty", async (t) => {
  const mock = legacyGridMock("anchor010");
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor010").initialize();
  await store.ensureRows(0, 3);
  assert.deepEqual(store.cache.get(0).rowIds, ["r_v1rev_0_0", "r_v1rev_0_1", "r_v1rev_0_2"]);
  assert.equal(store.dirty.size, 0, "ids are derived, so reading them changes nothing to upload");

  const before = mock.uploads.length;
  store.setRowHeight(0, 60);
  await store.commit();
  assert.equal(mock.uploads.slice(before).filter((item) => item.text.schema === "roam-grid/chunk").length, 0, "no chunk is uploaded just to carry ids");

  const mark = mock.uploads.length;
  await store.setCell(1, 1, "changed");
  await store.commit();
  const chunkUpload = mock.uploads.slice(mark).find((item) => item.text.schema === "roam-grid/chunk");
  assert.deepEqual(chunkUpload.text.rowIds, ["r_v1rev_0_0", "r_v1rev_0_1", "r_v1rev_0_2"], "ids become durable on a chunk that was being written anyway");
});

test("row height and alignment follow the row across an insert; the array index does not", async (t) => {
  const mock = legacyGridMock("anchor011");
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor011").initialize();
  await store.ensureRows(0, 3);
  const moved = store.rowIdAt(1);
  assert.equal(store.rowHeight(1), 70);
  assert.equal(store.getAlignment(1, 0), "right");

  // Exactly what a row insert does to a resident chunk: splice the row in and give it an id.
  const chunk = store.cache.get(0);
  chunk.rows.splice(0, 0, ["new", ""]);
  chunk.rowIds.splice(0, 0, "r_manual_inserted");
  store.ensureSize(store.manifest.rowCount + 1, 2);
  store.syncRowIds(0, chunk);

  assert.equal(store.rowIdAt(2), moved, "the row kept its id at its new index");
  assert.equal(store.rowHeight(2), 70, "its height travelled with it");
  assert.equal(store.getAlignment(2, 0), "right", "so did its alignment");
  assert.equal(store.rowIndexForRowId(moved), 2);

  const base = getSetting("sizing-default-row-height");
  assert.equal(store.rowHeight(1), base, "the vacated index inherits nothing");
  assert.equal(store.getAlignment(1, 0), null);
  assert.equal(store.rowHeight(0), base, "and neither does the inserted row");
  assert.equal(store.getAlignment(0, 0), null);
  assert.equal(store.manifest.rowHeightsByIndex["1"], 70, "the v1 positional map still points at index 1 — that is the rule-10 bug the re-key fixes");

  // The rebuilt native model must agree with the store, not with the stale positional map.
  assert.deepEqual(store.rowHeightIndexMap(), { 2: 70 });
  assert.deepEqual(store.alignmentIndexMap(), { "2:0": "right" });
});

test("clearing a height or alignment cannot be resurrected by the legacy positional map", async (t) => {
  const mock = legacyGridMock("anchor012");
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor012").initialize();
  const base = getSetting("sizing-default-row-height");
  store.setRowHeight(1, null);
  store.setAlignment(1, 0, "auto");
  assert.equal(store.rowHeight(1), base);
  assert.equal(store.getAlignment(1, 0), null);
  assert.deepEqual(store.manifest.rowHeightsByIndex, {});
  assert.deepEqual(store.manifest.alignmentsByIndex, {});
  assert.deepEqual(store.rowHeightIndexMap(), {});
  assert.deepEqual(store.alignmentIndexMap(), {});
});

/** A 100k-row v1 grid with two populated chunks, for the metrics and residency tests. */
function hugeGridMock(anchorUid) {
  const chunks = Array.from({ length: 200 }, (_, index) => ({ index, startRow: index * 500, rowCount: 500, url: `https://mock/huge-${index}` }));
  return installRoamMock({
    blocks: { [anchorUid]: { string: "{{[[roam/grid]]}}", children: [{ uid: `p-${anchorUid}`, string: "roam-grid/manifest:: https://mock/huge-manifest", order: 0, children: [] }] } },
    files: {
      "https://mock/huge-manifest": legacyManifest({ rowCount: 100000, colCount: 4, columnIds: ["c0", "c1", "c2", "c3"], rowHeights: {}, alignments: {}, showHeaders: false, chunks }),
      "https://mock/huge-100": { schema: "roam-grid/chunk", version: 1, index: 100, startRow: 50000, rows: Array.from({ length: 500 }, (_, row) => [`row${50000 + row}`]) },
      "https://mock/huge-101": { schema: "roam-grid/chunk", version: 1, index: 101, startRow: 50500, rows: Array.from({ length: 500 }, (_, row) => [`row${50500 + row}`]) },
    },
  });
}

function metricsView(store) {
  return Object.assign(Object.create(LargeGridView.prototype), {
    store, rowResizePreview: null, rowMetricsKey: null, metricsRows: [], metricsExtra: new Float64Array(1), metricsDefaultHeight: 0,
  });
}

test("row metrics stay sparse and reprice a resized row without a row-count change", async (t) => {
  const mock = hugeGridMock("anchor013");
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor013").initialize();
  const view = metricsView(store);
  const base = getSetting("sizing-default-row-height");

  assert.equal(view.rowOffset(10), base * 10);
  assert.equal(view.metricsExtra.length, 1, "a 100k-row grid with no overrides holds no per-row offsets at all");

  store.setRowHeight(3, base + 40);
  assert.equal(view.rowOffset(3), base * 3, "rows above the override are unmoved");
  assert.equal(view.rowOffset(4), base * 4 + 40, "0.8.2 kept the pre-resize offset here: the cache key omitted row heights");
  assert.equal(view.rowOffset(100000), base * 100000 + 40);
  assert.equal(view.metricsExtra.length, 2, "one prefix-sum entry per override, not one per row");
  assert.equal(view.rowTop(4), base * 4 + 40, "headers are off in this fixture, so rowTop is the offset");
  assert.equal(view.rowSpanHeight(3), base + 40);
  assert.equal(view.rowAtOffset(base * 4 + 41), 4);
  assert.equal(view.rowAtOffset(0), 0);

  store.setRowHeight(3, null);
  assert.equal(view.rowOffset(4), base * 4, "clearing the override reprices immediately too");
  assert.equal(view.metricsExtra.length, 1);

  view.rowResizePreview = { row: 0, height: base + 10 };
  assert.equal(view.rowOffset(1), base + 10, "a drag preview still shifts everything below it");
  view.rowResizePreview = null;
  assert.equal(view.rowOffset(1), base);
});

test("ensureRows loads exactly the chunks a band needs and peekRaw reads them synchronously", async (t) => {
  const mock = hugeGridMock("anchor014");
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor014").initialize();
  mock.downloads.length = 0;

  assert.equal(store.peekRaw(50010, 0), "", "an unloaded row peeks empty instead of throwing");
  await store.ensureRows(50010, 50030);
  assert.deepEqual(mock.downloads, ["https://mock/huge-100"]);
  assert.equal(store.peekRaw(50010, 0), "row50010");
  assert.equal(store.peekRaw(50010, 3), "", "a column the chunk never stored is empty, not undefined");
  assert.equal(store.peekRaw(-1, 0), "");
  assert.equal(store.peekRaw(0, 99), "");
  assert.equal(store.peekRaw(100000, 0), "");

  await store.ensureRows(50490, 50510);
  assert.deepEqual(mock.downloads, ["https://mock/huge-100", "https://mock/huge-101"], "a band spanning a boundary loads both, and only both");

  mock.downloads.length = 0;
  await store.ensureRows(100000, 100010);
  assert.deepEqual(mock.downloads, [], "a band entirely past the last row loads nothing");
  await store.ensureRows(50010, 50011);
  assert.deepEqual(mock.downloads, [], "a resident band re-downloads nothing");
});
