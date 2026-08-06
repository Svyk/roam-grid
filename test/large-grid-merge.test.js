import test from "node:test";
import assert from "node:assert/strict";
import {
  GridError, LargeGridStore, changedChunkIndexes, descendsFrom, extendLineage, manifestLineage,
  mergeMetadataMaps, normalizeManifest, planManifestMerge, refreshSettingsCache, resetChunkCache,
  settingsCache, sha256Hex,
} from "../src/extension.js";

const NO_STORAGE = { getItem: () => null, setItem: () => {} };
const withSettings = (values = {}) => refreshSettingsCache({ settings: { getAll: () => ({ ...values }) } }, NO_STORAGE);

// 50 is the floor `large-chunk-rows` coerces to, so one chunk is one small, readable band of rows.
const CHUNK_ROWS = 50;

/**
 * The concurrency harness plus one hook: `afterUpload` fires once every file lands, which is the
 * only place a test can move the pointer *between* a manifest upload and the compare-and-swap read
 * that guards the write. Without it the CAS loop can only ever be exercised on its first attempt.
 */
function installRoamMock(initial = {}) {
  let uidCounter = 0;
  let fileCounter = 0;
  const blocks = new Map();
  const files = new Map();
  const uploads = [];
  const downloads = [];
  const hooks = { afterUpload: null };

  for (const [uid, value] of Object.entries(initial.blocks || {})) {
    const block = { uid, string: value.string, order: 0, children: value.children || [] };
    blocks.set(uid, block);
    for (const child of block.children) blocks.set(child.uid, child);
  }
  for (const [url, value] of Object.entries(initial.files || {})) files.set(url, typeof value === "string" ? value : JSON.stringify(value));

  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (query, bound) => { const uid = bound ?? /:block\/uid "([^"]+)"/.exec(query)?.[1]; return uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []; },
    data: { block: {
      create: async ({ location, block }) => { const created = { ...block, order: location.order === "last" ? 999 : location.order, children: [] }; blocks.set(block.uid, created); blocks.get(location["parent-uid"]).children.push(created); },
      update: async ({ block }) => { blocks.get(block.uid).string = block.string; },
    } },
    file: {
      upload: async ({ file }) => {
        const url = `https://mock/upload-${++fileCounter}`;
        const text = await file.text();
        const parsed = JSON.parse(text);
        files.set(url, text);
        uploads.push({ url, text: parsed });
        await hooks.afterUpload?.(parsed, url);
        return url;
      },
      get: async ({ url }) => { downloads.push(url); if (!files.has(url)) throw new Error(`missing ${url}`); return new File([files.get(url)], "grid.json", { type: "application/json" }); },
      delete: async ({ url }) => files.delete(url),
    },
  } };
  return { blocks, files, uploads, downloads, hooks, dispose: () => delete globalThis.window };
}

const manifestUploads = (mock) => mock.uploads.filter((item) => item.text.schema === "roam-grid/manifest");
const chunkUploads = (mock) => mock.uploads.filter((item) => item.text.schema === "roam-grid/chunk");

async function chunkPayload(index, marker) {
  const text = JSON.stringify({ schema: "roam-grid/chunk", version: 1, index, startRow: index * CHUNK_ROWS, rows: Array.from({ length: CHUNK_ROWS }, (_, local) => [`${marker}${index * CHUNK_ROWS + local}`, "x"]) });
  return { text, digest: await sha256Hex(text) };
}

/** A published grid whose chunk files already exist, so every read is a real download. */
async function baseGrid(anchorUid, count = 4, extra = {}) {
  const files = {};
  const chunks = [];
  for (let index = 0; index < count; index += 1) {
    const url = `https://mock/chunk-${index}`;
    const { text, digest } = await chunkPayload(index, "r");
    files[url] = text;
    chunks.push({ index, startRow: index * CHUNK_ROWS, rowCount: CHUNK_ROWS, url, digest });
  }
  const manifest = {
    schema: "roam-grid/manifest", version: 2, revision: "rev-base", rowIdRevision: "rev-base", previous: null, lineage: ["rev-ancestor"],
    rowCount: count * CHUNK_ROWS, colCount: 2, columnIds: ["cA", "cB"], widths: {}, chunkRows: CHUNK_ROWS,
    rowHeights: {}, rowHeightsByIndex: {}, alignments: {}, alignmentsByIndex: {},
    frozenRows: 0, frozenCols: 0, merges: [], charts: [], showHeaders: false, fitToWidth: true, colorFormulaCells: true, chunks, retained: [], ...extra,
  };
  files["https://mock/manifest-base"] = JSON.stringify(manifest);
  const pointerUid = `p-${anchorUid}`;
  const mock = installRoamMock({
    blocks: { [anchorUid]: { string: "{{[[roam/grid]]}}", children: [{ uid: pointerUid, string: "roam-grid/manifest:: https://mock/manifest-base", order: 0, children: [] }] } },
    files,
  });
  mock.manifest = manifest;
  mock.pointerUid = pointerUid;
  mock.rivals = 0;
  return mock;
}

/** Rewrites one chunk of a rival manifest to a fresh content-addressed url, the way `commit` does. */
async function rewriteChunk(mock, manifest, index, marker) {
  const { text, digest } = await chunkPayload(index, marker);
  const url = `https://mock/chunk-${index}-${marker}`;
  mock.files.set(url, text);
  const descriptor = manifest.chunks.find((chunk) => chunk.index === index);
  descriptor.url = url;
  descriptor.digest = digest;
}

/** Publishes another writer's manifest and repoints the pointer block at it. */
async function publishRival(mock, mutate, { descends = true, from = mock.manifest } = {}) {
  const next = JSON.parse(JSON.stringify(from));
  next.revision = `rev-rival-${++mock.rivals}`;
  next.previous = "https://mock/manifest-base";
  next.lineage = descends ? [from.revision, ...(from.lineage || [])].slice(0, 16) : ["rev-somewhere-else"];
  await mutate?.(next, mock);
  const url = `https://mock/manifest-rival-${mock.rivals}`;
  mock.files.set(url, JSON.stringify(next));
  mock.blocks.get(mock.pointerUid).string = `roam-grid/manifest:: ${url}`;
  return { url, manifest: next };
}

const reasonOf = (error) => (error instanceof GridError && error.code === "CONFLICT" ? error.details.reason : `${error.code}:${error.message}`);

/* ------------------------------------------------------------------------- lineage ---- */

test("lineage answers descent from the manifest alone and never grows past sixteen", () => {
  assert.deepEqual(manifestLineage({ lineage: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(manifestLineage({}), [], "an absent lineage is empty, not undefined");
  assert.deepEqual(manifestLineage({ lineage: ["a", 7, null, "", "b"] }), ["a", "b"], "garbage entries are dropped rather than compared against");

  const deep = { revision: "r20", lineage: Array.from({ length: 16 }, (_, index) => `r${19 - index}`) };
  const extended = extendLineage(deep);
  assert.equal(extended.length, 16, "the window is fixed, so the manifest cannot grow without bound");
  assert.deepEqual(extended.slice(0, 2), ["r20", "r19"], "newest first");
  assert.equal(extended.includes("r4"), false, "the oldest entry falls off");

  assert.equal(descendsFrom({ revision: "r2", lineage: ["r1"] }, "r1"), true);
  assert.equal(descendsFrom({ revision: "r1", lineage: [] }, "r1"), true, "the same revision descends from itself");
  assert.equal(descendsFrom({ revision: "r2", lineage: ["other"] }, "r1"), false, "POSITIVE CONTROL: a fork is not rescued by having a lineage at all");
  assert.equal(descendsFrom({ revision: "r2", lineage: extended }, "r4"), false, "falling out of the window reads as forked, which refuses rather than guesses");
  assert.equal(descendsFrom({ revision: "r2", lineage: ["r1"] }, undefined), false);
});

test("changedChunkIndexes reads the other writer's edits off the content-addressed urls", () => {
  const base = { chunks: [{ index: 0, url: "a" }, { index: 1, url: "b" }, { index: 2, url: "c" }] };
  assert.deepEqual([...changedChunkIndexes(base, base)], [], "identical urls mean nobody rewrote anything");
  assert.deepEqual([...changedChunkIndexes(base, { chunks: [{ index: 0, url: "a" }, { index: 1, url: "B2" }, { index: 2, url: "c" }] })], [1]);
  assert.deepEqual([...changedChunkIndexes(base, { chunks: [...base.chunks, { index: 3, url: "d" }] })], [3], "an appended chunk counts as theirs");
  assert.deepEqual([...changedChunkIndexes(base, { chunks: base.chunks.slice(0, 2) })], [2], "and so does a removed one");
});

test("mergeMetadataMaps takes each key from whichever side moved it, and refuses the ones both moved", () => {
  const base = { keep: 1, mine: 2, yours: 3, both: 4, gone: 5 };
  const ours = { keep: 1, mine: 20, yours: 3, both: 40 };
  const theirs = { keep: 1, mine: 2, yours: 30, both: 400, gone: 5, added: 6 };

  const result = mergeMetadataMaps(base, ours, theirs);
  assert.deepEqual(result.conflicts, ["both"], "only the key both sides moved is a conflict");
  assert.equal(result.merged.mine, 20, "our edit survives a key they never touched");
  assert.equal(result.merged.yours, 30, "their edit survives a key we never touched");
  assert.equal(result.merged.added, 6, "a key only they added comes across");
  assert.equal("gone" in result.merged, false, "and a key only we deleted stays deleted");

  assert.deepEqual(mergeMetadataMaps({ x: 1 }, {}, {}).conflicts, [], "both sides deleting the same key agree rather than conflict");
  assert.deepEqual(mergeMetadataMaps({ x: 1 }, { x: 2 }, { x: 2 }).conflicts, [], "both sides making the identical edit agree too");
  assert.deepEqual(mergeMetadataMaps(undefined, undefined, undefined).merged, {});
});

/* ---------------------------------------------------------------------- merge path ---- */

test("POSITIVE CONTROL: a disjoint-chunk conflict merges instead of refusing", async (t) => {
  const mock = await baseGrid("mergeA", 4);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings();

  const store = await new LargeGridStore("mergeA").initialize();
  await store.setCell(0, 0, "mine");
  assert.equal(await store.getRaw(2 * CHUNK_ROWS, 0), "r100", "chunk 2 is resident and clean before they rewrite it");
  const rival = await publishRival(mock, (next) => rewriteChunk(mock, next, 2, "theirs-"));

  const merged = await store.commit();

  assert.equal(store.dirty.size, 0, "0.8.2 threw CONFLICT here and left the edit unsaved");
  assert.equal(merged.previous, rival.url, "the merge is built onto their manifest, not around it");
  assert.deepEqual(merged.lineage.slice(0, 3), ["rev-rival-1", "rev-base", "rev-ancestor"], "and records that it descends from theirs");
  assert.equal(merged.chunks.find((chunk) => chunk.index === 2).url, "https://mock/chunk-2-theirs-", "their chunk is carried through untouched");
  assert.notEqual(merged.chunks.find((chunk) => chunk.index === 0).url, "https://mock/chunk-0", "ours is the freshly uploaded one");
  assert.equal(merged.retained[0], rival.url, "their manifest is retained, so the merge is reversible by url");

  assert.equal(store.cache.has(2), false, "the stale copy of their chunk is dropped rather than served from memory");
  assert.equal(store.cache.get(0).rows[0][0], "mine", "and our dirty chunk is never dropped, because disjointness guarantees it is not theirs");
  assert.equal(await store.getRaw(0, 0), "mine");
  assert.equal(await store.getRaw(2 * CHUNK_ROWS, 0), "theirs-100", "both writers' rows are readable after the merge");

  const reopened = await new LargeGridStore("mergeA").initialize();
  assert.equal(await reopened.getRaw(0, 0), "mine");
  assert.equal(await reopened.getRaw(2 * CHUNK_ROWS, 0), "theirs-100", "and survive a reload, with every digest still verifying");
});

test("POSITIVE CONTROL: an overlapping-chunk conflict still refuses, before it uploads anything", async (t) => {
  const mock = await baseGrid("mergeB", 4);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings();

  const store = await new LargeGridStore("mergeB").initialize();
  await store.setCell(0, 0, "mine");
  await store.setCell(3 * CHUNK_ROWS, 0, "mine-too");
  await publishRival(mock, async (next) => { await rewriteChunk(mock, next, 3, "theirs-"); });
  const before = mock.uploads.length;

  await assert.rejects(store.commit(), (error) => {
    assert.equal(error.code, "CONFLICT");
    assert.equal(reasonOf(error), "chunk-overlap");
    assert.deepEqual(error.details.chunks, [3], "the refusal names the block that collided, not just that one did");
    assert.equal(error.details.liveUrl, "https://mock/manifest-rival-1");
    return true;
  });

  assert.equal(mock.uploads.length, before, "a refusal costs zero uploads, so it leaves no orphan behind");
  assert.deepEqual([...store.dirty].sort((a, b) => a - b), [0, 3], "both edits are still queued");
  assert.equal(store.cache.get(3).rows[0][0], "mine-too", "and still in memory — a refused save is recoverable");
});

test("POSITIVE CONTROL: a forked lineage refuses even when the chunks are disjoint", async (t) => {
  const mock = await baseGrid("mergeC", 4);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings();

  const store = await new LargeGridStore("mergeC").initialize();
  await store.setCell(0, 0, "mine");
  const forked = await publishRival(mock, (next) => rewriteChunk(mock, next, 2, "forked-"), { descends: false });

  await assert.rejects(store.commit(), (error) => {
    assert.equal(reasonOf(error), "fork", "disjoint chunks do not make two histories one history");
    assert.equal(error.details.liveRevision, "rev-rival-1");
    assert.equal(error.details.baseRevision, "rev-base");
    return true;
  });
  assert.equal(store.dirty.size, 1);
  assert.equal(mock.blocks.get(mock.pointerUid).string.endsWith(forked.url), true, "the pointer still belongs to the other writer");

  // The control: the identical chunk-level change, published as a descendant, merges. So the refusal
  // above is about lineage and nothing else.
  await publishRival(mock, (next) => rewriteChunk(mock, next, 2, "descended-"));
  const merged = await store.commit();
  assert.equal(merged.chunks.find((chunk) => chunk.index === 2).url, "https://mock/chunk-2-descended-");
  assert.equal(await store.getRaw(0, 0), "mine");
});

test("a metadata key changed on one side merges, and the same key changed on both refuses", async (t) => {
  const mock = await baseGrid("mergeD", 4);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings();

  const store = await new LargeGridStore("mergeD").initialize();
  store.setColumnWidth(0, 200);
  store.setRowHeight(0, 61);
  await publishRival(mock, (next) => { next.widths.cA = 300; });

  await assert.rejects(store.commit(), (error) => {
    assert.equal(reasonOf(error), "metadata");
    assert.deepEqual(error.details.keys, ["widths.cA"], "the refusal names the exact key, so the user can see what collided");
    return true;
  });

  await publishRival(mock, (next) => { next.widths.cB = 300; next.rowHeights.r_rev_base_other = 44; next.frozenRows = 1; });
  const merged = await store.commit();

  assert.equal(merged.widths.cA, 200, "our width survives");
  assert.equal(merged.widths.cB, 300, "theirs does too");
  assert.equal(merged.rowHeights.r_rev_base_other, 44);
  assert.equal(merged.rowHeights[store.rowIdAt(0)], 61);
  assert.equal(merged.frozenRows, 1, "a scalar only they moved is adopted");
});

test("a v1 legacy positional entry is never resurrected as a change by the merge", async (t) => {
  const mock = await baseGrid("mergeE", 4, { version: 1, rowHeights: { 5: 44, 7: 55 }, alignments: { "3:1": "right" }, rowHeightsByIndex: undefined, alignmentsByIndex: undefined });
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings();

  const store = await new LargeGridStore("mergeE").initialize();
  assert.equal(store.manifest.rowHeights.r_rev_base_0_5, undefined);
  assert.equal(store.manifest.rowHeights["r_rev-base_0_5"], 44, "3A migrated the positional entry onto a stable id");
  store.setRowHeight(5, null);
  store.setRowHeight(1, 61);

  // Their manifest is the same v1 bytes with one chunk rewritten, so both sides migrate identically.
  await publishRival(mock, (next) => rewriteChunk(mock, next, 2, "theirs-"));
  const merged = await store.commit();

  assert.equal(merged.rowHeights["r_rev-base_0_5"], undefined, "the height we cleared stays cleared");
  assert.equal(merged.rowHeightsByIndex[5], undefined, "and its legacy twin goes with it, rather than reappearing as their value");
  assert.equal(merged.rowHeights["r_rev-base_0_1"], 61, "our new height is keyed by id");
  assert.equal(merged.rowHeights["r_rev-base_0_7"], 55, "an untouched migrated entry is carried, not reported as a change");
  assert.equal(merged.rowHeightsByIndex[7], 55);
  assert.equal(merged.alignments["r_rev-base_0_3::cB"], "right");
  assert.equal(store.rowHeight(1), 61);
  assert.equal(store.rowHeightRaw(5), undefined);
});

test("dimensions and merged regions are mergeable from one side and refused from both", async (t) => {
  const mock = await baseGrid("mergeF", 4);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings();

  const store = await new LargeGridStore("mergeF").initialize();
  await store.setCell(4 * CHUNK_ROWS, 0, "grown");
  assert.equal(store.manifest.rowCount, 4 * CHUNK_ROWS + 1);

  await publishRival(mock, (next) => { next.rowCount = 900; rewriteChunk(mock, next, 3, "theirs-"); });
  await assert.rejects(store.commit(), (error) => {
    assert.equal(reasonOf(error), "dimensions");
    assert.equal(error.details.key, "rowCount");
    return true;
  });

  store.manifest.merges.push({ id: "m-ours", row: 0, col: 0, rowSpan: 2, colSpan: 2 });
  store.metadataDirty = true;
  await publishRival(mock, (next) => { next.merges.push({ id: "m-theirs", row: 10, col: 0, rowSpan: 2, colSpan: 2 }); });
  await assert.rejects(store.commit(), (error) => (assert.equal(reasonOf(error), "merges"), true));

  await publishRival(mock, (next) => rewriteChunk(mock, next, 1, "theirs-"));
  const merged = await store.commit();
  assert.equal(merged.rowCount, 4 * CHUNK_ROWS + 1, "the side that resized wins when only one side did");
  assert.deepEqual(merged.merges.map((merge) => merge.id), ["m-ours"]);
  assert.equal(merged.chunks.length, 5, "and the chunk our growth created is appended");
  assert.equal(await store.getRaw(4 * CHUNK_ROWS, 0), "grown");
});

test("a live manifest that cannot be read or understood refuses with its own reason", async (t) => {
  const mock = await baseGrid("mergeG", 2);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings();

  const store = await new LargeGridStore("mergeG").initialize();
  await store.setCell(0, 0, "mine");

  mock.blocks.get(mock.pointerUid).string = "roam-grid/manifest:: https://mock/never-uploaded";
  await assert.rejects(store.commit(), (error) => (assert.equal(reasonOf(error), "unreadable"), true));

  await publishRival(mock, (next) => { next.version = 3; });
  await assert.rejects(store.commit(), (error) => (assert.equal(reasonOf(error), "version"), true));

  await publishRival(mock, (next) => { next.chunkRows = 100; });
  await assert.rejects(store.commit(), (error) => (assert.equal(reasonOf(error), "addressing"), true));

  assert.equal(store.dirty.size, 1, "three refusals, and the edit is still there for a fourth attempt");
});

/* ------------------------------------------------------------------ compare-and-swap ---- */

test("a pointer that moves mid-save is retried, with the chunks uploaded exactly once", async (t) => {
  const mock = await baseGrid("mergeH", 4);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings();

  const store = await new LargeGridStore("mergeH").initialize();
  await store.setCell(0, 0, "mine");

  // Fires after our manifest has been uploaded and before the guard read, which is the exact window
  // a pointer read taken at the top of `commit` cannot see.
  let raced = 0;
  mock.hooks.afterUpload = async (parsed) => {
    if (parsed.schema !== "roam-grid/manifest" || raced) return;
    raced += 1;
    await publishRival(mock, (next) => rewriteChunk(mock, next, 3, "raced-"));
  };

  const merged = await store.commit();

  assert.equal(raced, 1);
  assert.equal(manifestUploads(mock).length, 2, "the first manifest lost the swap and a second was built on the winner");
  assert.equal(chunkUploads(mock).length, 1, "chunk bytes are content-addressed, so the retry reuses them rather than minting an orphan");
  assert.equal(merged.previous, "https://mock/manifest-rival-1", "the manifest that actually landed is the one built on the pointer we then claimed");
  assert.equal(merged.chunks.find((chunk) => chunk.index === 3).url, "https://mock/chunk-3-raced-");
  assert.equal(await store.getRaw(0, 0), "mine");
  assert.equal(await store.getRaw(3 * CHUNK_ROWS, 0), "raced-150");
});

test("three lost swaps refuse rather than loop, and the edit is left recoverable", async (t) => {
  const mock = await baseGrid("mergeI", 4);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings();

  const store = await new LargeGridStore("mergeI").initialize();
  await store.setCell(0, 0, "mine");

  let raced = 0;
  mock.hooks.afterUpload = async (parsed) => {
    if (parsed.schema !== "roam-grid/manifest") return;
    raced += 1;
    await publishRival(mock, (next) => rewriteChunk(mock, next, 3, `raced-${raced}-`), { from: mock.manifest });
  };

  await assert.rejects(store.commit(), (error) => {
    assert.equal(reasonOf(error), "cas");
    assert.equal(error.details.attempts, 3);
    return true;
  });

  assert.equal(manifestUploads(mock).length, 3, "bounded at three attempts, not retried until the contention stops");
  assert.equal(chunkUploads(mock).length, 1);
  assert.deepEqual([...store.dirty], [0]);
  assert.equal(store.cache.get(0).rows[0][0], "mine");
  assert.equal(store.manifestUrl, "https://mock/manifest-base", "and the store still knows what it was based on");
});

/* --------------------------------------------------------------- uncontended commit ---- */

test("an uncontended commit is unchanged apart from the lineage it now records", async (t) => {
  const mock = await baseGrid("mergeJ", 2);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings();

  const store = await new LargeGridStore("mergeJ").initialize();
  await store.setCell(0, 0, "mine");
  const first = await store.commit();

  assert.equal(first.previous, "https://mock/manifest-base");
  assert.deepEqual(first.lineage, ["rev-base", "rev-ancestor"]);
  assert.deepEqual(first.retained.slice(0, 2), ["https://mock/manifest-base", "https://mock/chunk-0"]);
  assert.equal(manifestUploads(mock).length, 1, "one manifest, one swap — the loop costs nothing when nobody is racing");

  await store.setCell(0, 1, "again");
  const second = await store.commit();
  assert.deepEqual(second.lineage, [first.revision, "rev-base", "rev-ancestor"], "each commit prepends exactly its parent");

  assert.equal(await store.commit(), second, "a commit with nothing dirty is still a no-op");
  assert.equal(manifestUploads(mock).length, 2);
});

/* ------------------------------------------------------------------- planner direct ---- */

test("planManifestMerge refuses a base it cannot place at all", () => {
  const live = normalizeManifest({ schema: "roam-grid/manifest", version: 2, revision: "r2", rowIdRevision: "ids", lineage: ["r1"], rowCount: 1, colCount: 1, columnIds: ["c"], chunks: [] });
  const base = { revision: "r1", rowIdRevision: "ids", chunkRows: live.chunkRows, rowCount: 1, colCount: 1 };
  assert.throws(() => planManifestMerge(null, {}, live, []), (error) => (assert.equal(reasonOf(error), "fork", "no base snapshot means no provable descent"), true));
  assert.equal(planManifestMerge(base, { ...base }, live, []).manifest.revision, "r2", "and a base the lineage names is placed");
});
