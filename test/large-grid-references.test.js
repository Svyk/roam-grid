import test from "node:test";
import assert from "node:assert/strict";
import {
  LargeGridStore, chunkReferences, deriveChunkReferences, manifestReferenceUnion, normalizeManifest,
  planReferenceShardWrites, referenceShardPlan, refreshSettingsCache, resetChunkCache, settingsCache,
  sha256Hex, sortReferences,
} from "../src/extension.js";

const NO_STORAGE = { getItem: () => null, setItem: () => {} };
const withSettings = (values = {}) => refreshSettingsCache({ settings: { getAll: () => ({ ...values }) } }, NO_STORAGE);

// 50 is the floor `large-chunk-rows` coerces to, so one chunk is one small, readable band of rows.
const CHUNK_ROWS = 50;
const MIRROR_ON = { "large-refs-sync": true };

/**
 * The store harness plus a block-write log, which is what the diff assertions read: "this shard was
 * not rewritten" is a claim about transactor traffic, and only the log can tell a shard that was
 * left alone from one that was rewritten with identical bytes.
 */
function installRoamMock(initial = {}) {
  let uidCounter = 0;
  let fileCounter = 0;
  const blocks = new Map();
  const files = new Map();
  const uploads = [];
  const writes = [];
  const hooks = { beforeBlockWrite: null };

  for (const [uid, value] of Object.entries(initial.blocks || {})) {
    const block = { uid, string: value.string, order: 0, children: value.children || [] };
    blocks.set(uid, block);
    for (const child of block.children) blocks.set(child.uid, child);
  }
  for (const [url, value] of Object.entries(initial.files || {})) files.set(url, typeof value === "string" ? value : JSON.stringify(value));

  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  const findParent = (uid) => [...blocks.values()].find((block) => block.children?.some((child) => child.uid === uid));
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (query, bound) => { const uid = bound ?? /:block\/uid "([^"]+)"/.exec(query)?.[1]; return uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []; },
    data: { block: {
      create: async ({ location, block }) => {
        hooks.beforeBlockWrite?.({ op: "create", uid: block.uid, string: block.string });
        writes.push({ op: "create", uid: block.uid, parent: location["parent-uid"], string: block.string, open: block.open });
        const created = { ...block, order: location.order === "last" ? 999 : location.order, children: [] };
        blocks.set(block.uid, created);
        blocks.get(location["parent-uid"]).children.push(created);
      },
      update: async ({ block }) => {
        hooks.beforeBlockWrite?.({ op: "update", uid: block.uid, string: block.string });
        writes.push({ op: "update", uid: block.uid, string: block.string });
        blocks.get(block.uid).string = block.string;
      },
      delete: async ({ block }) => {
        hooks.beforeBlockWrite?.({ op: "delete", uid: block.uid, string: blocks.get(block.uid)?.string });
        writes.push({ op: "delete", uid: block.uid });
        const parent = findParent(block.uid);
        if (parent) parent.children = parent.children.filter((child) => child.uid !== block.uid);
        blocks.delete(block.uid);
      },
    } },
    file: {
      upload: async ({ file }) => { const url = `https://mock/upload-${++fileCounter}`; const text = await file.text(); files.set(url, text); uploads.push({ url, text: JSON.parse(text) }); return url; },
      get: async ({ url }) => { if (!files.has(url)) throw new Error(`missing ${url}`); return new File([files.get(url)], "grid.json", { type: "application/json" }); },
      delete: async ({ url }) => files.delete(url),
    },
  } };
  return { blocks, files, uploads, writes, hooks, dispose: () => delete globalThis.window };
}

async function chunkPayload(index, rows) {
  const text = JSON.stringify({ schema: "roam-grid/chunk", version: 1, index, startRow: index * CHUNK_ROWS, rows });
  return { text, digest: await sha256Hex(text) };
}

const bandRows = (index, seed) => Array.from({ length: CHUNK_ROWS }, (_, local) => [`${seed}${index * CHUNK_ROWS + local}`, ""]);

/** A published grid whose chunk files already exist, so every read is a real download. */
async function baseGrid(anchorUid, bands, { refs = null } = {}) {
  const files = {};
  const chunks = [];
  for (let index = 0; index < bands.length; index += 1) {
    const url = `https://mock/chunk-${index}`;
    const { text, digest } = await chunkPayload(index, bands[index]);
    files[url] = text;
    const entry = { index, startRow: index * CHUNK_ROWS, rowCount: bands[index].length, url, digest };
    if (refs) entry.refs = refs[index] ?? [];
    chunks.push(entry);
  }
  const manifest = {
    schema: "roam-grid/manifest", version: 2, revision: "rev-base", rowIdRevision: "rev-base", previous: null, lineage: ["rev-ancestor"],
    rowCount: bands.reduce((total, band) => total + band.length, 0), colCount: 2, columnIds: ["cA", "cB"], widths: {}, chunkRows: CHUNK_ROWS,
    rowHeights: {}, rowHeightsByIndex: {}, alignments: {}, alignmentsByIndex: {},
    frozenRows: 0, frozenCols: 0, merges: [], charts: [], showHeaders: false, fitToWidth: true, colorFormulaCells: true, chunks, retained: [],
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

/** Publishes another writer's manifest and repoints the pointer block at it. */
async function publishRival(mock, mutate) {
  const next = JSON.parse(JSON.stringify(mock.manifest));
  next.revision = `rev-rival-${++mock.rivals}`;
  next.previous = "https://mock/manifest-base";
  next.lineage = [mock.manifest.revision, ...(mock.manifest.lineage || [])].slice(0, 16);
  await mutate?.(next, mock);
  const url = `https://mock/manifest-rival-${mock.rivals}`;
  mock.files.set(url, JSON.stringify(next));
  mock.blocks.get(mock.pointerUid).string = `roam-grid/manifest:: ${url}`;
  return { url, manifest: next };
}

const markerOf = (mock, anchorUid) => mock.blocks.get(anchorUid).children.find((child) => child.string.startsWith("roam-grid/refs::")) || null;
const shardWrites = (mock, uids) => mock.writes.filter((write) => uids.has(write.uid));

/* ---------------------------------------------------------------------- derivation ---- */

test("references are derived from the text the user typed, canonicalized and sorted", () => {
  const rows = [
    ["plain text", "see [[Alpha]] and #beta"],
    ["#[[Gamma Ray]]", "{{[[TODO]]}} finish"],
    ["((abc123def))", "[[Alpha]] again"],
    ["", null],
  ];
  assert.deepEqual(deriveChunkReferences(rows), ["((abc123def))", "[[Alpha]]", "[[Gamma Ray]]", "[[TODO]]", "[[beta]]"]);
});

test("derivation invents nothing a cell does not contain", () => {
  // Every one of these produced a page the moment it reached a shard, so each is a token the regex
  // must refuse: a formula's parentheses, an unclosed opener, an empty name, and a bare `#`.
  assert.deepEqual(deriveChunkReferences([["=SUM((A1+B1))", "=A1/B2"], ["[[unclosed", "[[]]"], ["# ", "a#notatag"]]), []);
  assert.deepEqual(deriveChunkReferences([]), []);
  assert.deepEqual(deriveChunkReferences(null), []);
});

test("a tag and its bracketed twin are one reference, because they name one page", () => {
  assert.deepEqual(deriveChunkReferences([["#Recipes"], ["#[[Recipes]]"], ["[[Recipes]]"]]), ["[[Recipes]]"]);
});

/* --------------------------------------------------------------------------- union ---- */

test("the union is taken across every chunk entry, deduplicated and sorted", () => {
  const manifest = { chunks: [
    { index: 0, refs: ["[[Beta]]", "[[Alpha]]"] },
    { index: 1, refs: ["[[Alpha]]", "((abc123def))"] },
    { index: 2 },
    { index: 3, refs: ["", null, 7, "[[Gamma]]"] },
  ] };
  assert.deepEqual(manifestReferenceUnion(manifest), ["((abc123def))", "[[Alpha]]", "[[Beta]]", "[[Gamma]]"]);
  assert.deepEqual(manifestReferenceUnion({}), []);
  assert.deepEqual(chunkReferences({ refs: "not an array" }), []);
});

test("a v2 manifest written before references existed loads clean and contributes nothing", () => {
  const legacy = {
    schema: "roam-grid/manifest", version: 2, revision: "r1", rowCount: 2, colCount: 1, chunkRows: 50,
    columnIds: ["cA"], chunks: [{ index: 0, startRow: 0, rowCount: 2, url: "https://mock/c0", digest: "d0" }],
  };
  const normalized = normalizeManifest(legacy);
  assert.deepEqual(normalized.chunks[0].refs, [], "the entry gains an empty list rather than staying undefined");
  assert.equal(normalized.chunks[0].url, "https://mock/c0", "and everything else survives untouched");
  assert.deepEqual(manifestReferenceUnion(normalized), []);
  assert.deepEqual(referenceShardPlan(manifestReferenceUnion(normalized)).shards, [], "so it asks for no shard at all");
});

test("references are a set union, so moving a row changes nothing", () => {
  // The claim this design rests on. A reference at row 0 and the same reference at row 40 — or in a
  // different chunk entirely — produce byte-identical shards, which is why row insert and row delete
  // need no handling anywhere in this feature.
  const before = deriveChunkReferences([["[[Alpha]]"], ["[[Beta]]"], [""], [""]]);
  const afterInsert = deriveChunkReferences([[""], ["[[Alpha]]"], [""], ["[[Beta]]"]]);
  const afterDelete = deriveChunkReferences([["[[Beta]]"], ["[[Alpha]]"]]);
  assert.deepEqual(afterInsert, before);
  assert.deepEqual(afterDelete, before);
  const inChunkZero = { chunks: [{ refs: ["[[Alpha]]", "[[Beta]]"] }, { refs: [] }] };
  const spilledIntoChunkOne = { chunks: [{ refs: ["[[Alpha]]"] }, { refs: ["[[Beta]]"] }] };
  assert.deepEqual(
    referenceShardPlan(manifestReferenceUnion(inChunkZero)),
    referenceShardPlan(manifestReferenceUnion(spilledIntoChunkOne)),
    "a reference that crossed a chunk boundary rewrites no shard",
  );
});

/* ----------------------------------------------------------------------- shard plan ---- */

test("shards carry at most the per-shard cap and the marker names the schema version", () => {
  const refs = Array.from({ length: 250 }, (_, index) => `[[P${String(index).padStart(3, "0")}]]`);
  const plan = referenceShardPlan(refs, { max: 2000 });
  assert.equal(plan.marker, "roam-grid/refs:: v1");
  assert.equal(plan.truncated, false);
  assert.deepEqual(plan.shards.map((shard) => shard.split(" ").length), [100, 100, 50]);
  assert.equal(plan.shards[0].split(" ")[0], "[[P000]]");
  assert.equal(plan.shards[2].split(" ").at(-1), "[[P249]]");
});

test("truncation is deterministic and says so in the marker", () => {
  const refs = Array.from({ length: 12 }, (_, index) => `[[P${index}]]`);
  const shuffled = [refs[7], refs[0], refs[11], ...refs.slice(1, 7), refs[8], refs[9], refs[10]];
  const plan = referenceShardPlan(refs, { max: 5, perShard: 100 });
  const fromShuffled = referenceShardPlan(shuffled, { max: 5, perShard: 100 });
  assert.equal(plan.marker, "roam-grid/refs:: v1 (truncated at 5)");
  assert.equal(plan.truncated, true);
  assert.equal(plan.total, 12);
  // Convergence: two devices holding the same set in different orders must compute the same bytes,
  // or each rewrites the other's shards forever.
  assert.deepEqual(fromShuffled.shards, plan.shards);
  // Code-unit order, not human order: `]` sorts after `0`, so `[[P10]]` precedes `[[P1]]`. The
  // property that matters is that every device agrees, and this is the one every engine agrees on.
  assert.equal(plan.shards[0], "[[P0]] [[P10]] [[P11]] [[P1]] [[P2]]");
  assert.deepEqual(sortReferences(["b", "a"]), ["a", "b"]);
});

test("the write plan rewrites only what changed", () => {
  const plan = referenceShardPlan(["[[A]]", "[[B]]"], { perShard: 1 });
  const existing = { uid: "m1", string: "roam-grid/refs:: v1", children: [{ uid: "s1", string: "[[A]]" }, { uid: "s2", string: "[[stale]]" }] };
  const ops = planReferenceShardWrites(plan, existing);
  assert.equal(ops.marker, null, "an unchanged marker is not rewritten");
  assert.deepEqual(ops.updates, [{ uid: "s2", string: "[[B]]" }], "only the shard whose bytes moved");
  assert.deepEqual(ops.creates, []);
  assert.deepEqual(ops.deletes, []);
});

test("the write plan grows, shrinks, and retires the marker when the union empties", () => {
  const existing = { uid: "m1", string: "roam-grid/refs:: v1", children: [{ uid: "s1", string: "[[A]]" }] };
  const grown = planReferenceShardWrites(referenceShardPlan(["[[A]]", "[[B]]"], { perShard: 1 }), existing);
  assert.deepEqual(grown.creates, ["[[B]]"]);
  assert.deepEqual(grown.updates, []);
  const shrunk = planReferenceShardWrites(referenceShardPlan(["[[A]]"], { perShard: 1 }), { ...existing, children: [...existing.children, { uid: "s2", string: "[[B]]" }] });
  assert.deepEqual(shrunk.deletes, ["s2"]);
  const emptied = planReferenceShardWrites(referenceShardPlan([], { perShard: 1 }), existing);
  assert.deepEqual(emptied.deletes, ["m1"], "an empty union takes the marker subtree with it");
  assert.equal(emptied.marker, null);
  const fresh = planReferenceShardWrites(referenceShardPlan(["[[A]]"], { perShard: 1 }), null);
  assert.deepEqual(fresh.marker, { uid: null, string: "roam-grid/refs:: v1" });
  assert.deepEqual(fresh.creates, ["[[A]]"]);
  const relabelled = planReferenceShardWrites(referenceShardPlan(["[[A]]", "[[B]]"], { max: 1, perShard: 1 }), existing);
  assert.deepEqual(relabelled.marker, { uid: "m1", string: "roam-grid/refs:: v1 (truncated at 1)" });
});

/* --------------------------------------------------------------------- the live path ---- */

test("a commit derives refs into the manifest and materializes them as collapsed blocks", async (t) => {
  const mock = await baseGrid("refsA", [bandRows(0, "r")]);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings(MIRROR_ON);

  const store = await new LargeGridStore("refsA").initialize();
  await store.refsSync;
  assert.equal(markerOf(mock, "refsA"), null, "a grid whose manifest carries no refs writes nothing on open");

  await store.setCell(0, 0, "see [[Alpha]] and #beta");
  await store.setCell(1, 0, "[[Alpha]] again");
  const committed = await store.commit();

  assert.deepEqual(committed.chunks[0].refs, ["[[Alpha]]", "[[beta]]"], "the chunk entry carries its own derived list");
  const marker = markerOf(mock, "refsA");
  assert.equal(marker.string, "roam-grid/refs:: v1");
  assert.equal(mock.writes.find((write) => write.uid === marker.uid).open, false, "the marker is created collapsed");
  assert.deepEqual(marker.children.map((child) => child.string), ["[[Alpha]] [[beta]]"]);
  assert.equal(store.pointerUid !== marker.uid && marker.string.startsWith("roam-grid/refs::"), true, "and it is a sibling of the manifest pointer, not a replacement for it");
});

test("a save that changes no reference rewrites no shard", async (t) => {
  const mock = await baseGrid("refsB", [bandRows(0, "r")]);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings(MIRROR_ON);

  const store = await new LargeGridStore("refsB").initialize();
  await store.setCell(0, 0, "[[Alpha]]");
  await store.commit();
  const marker = markerOf(mock, "refsB");
  const owned = new Set([marker.uid, ...marker.children.map((child) => child.uid)]);
  const before = shardWrites(mock, owned).length;
  assert.ok(before > 0, "the first save did write them");

  await store.setCell(2, 1, "an ordinary edit that names nothing");
  await store.commit();

  assert.equal(shardWrites(mock, owned).length, before, "POSITIVE CONTROL: delete the diff check in planReferenceShardWrites and this goes red");
  assert.deepEqual(markerOf(mock, "refsB").children.map((child) => child.string), ["[[Alpha]]"]);

  await store.setCell(3, 0, "[[Zeta]]");
  await store.commit();
  assert.deepEqual(markerOf(mock, "refsB").children.map((child) => child.string), ["[[Alpha]] [[Zeta]]"], "a save that DOES add one rewrites the shard");
});

test("with the setting off nothing is derived and no block is written", async (t) => {
  const mock = await baseGrid("refsC", [bandRows(0, "r")]);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings();

  const store = await new LargeGridStore("refsC").initialize();
  await store.refsSync;
  await store.setCell(0, 0, "[[Alpha]] and #beta");
  const committed = await store.commit();

  assert.deepEqual(committed.chunks[0].refs, [], "no derivation happens on the default path");
  assert.equal(markerOf(mock, "refsC"), null);
  assert.deepEqual(mock.writes.filter((write) => write.uid !== mock.pointerUid), [], "the only block write is the pointer swap the commit already made");
  assert.deepEqual(await store.syncReferenceShards(), { skipped: "disabled", writes: 0 });
});

test("a merged manifest mirrors the merged union, not just our half of it", async (t) => {
  const mock = await baseGrid("refsD", [bandRows(0, "r"), bandRows(1, "r"), bandRows(2, "r")]);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings(MIRROR_ON);

  const store = await new LargeGridStore("refsD").initialize();
  await store.setCell(0, 0, "[[Ours]]");
  // Another writer rewrote a chunk we never touched, and their manifest carries the references its
  // rows contain. The merge takes their chunks wholesale, so the union has to come out of both.
  await publishRival(mock, async (next) => {
    const rows = bandRows(2, "theirs-");
    rows[0][0] = "[[Theirs]]";
    const { text, digest } = await chunkPayload(2, rows);
    mock.files.set("https://mock/chunk-2-rival", text);
    const entry = next.chunks.find((chunk) => chunk.index === 2);
    entry.url = "https://mock/chunk-2-rival";
    entry.digest = digest;
    entry.refs = ["[[Theirs]]"];
  });

  const merged = await store.commit();

  assert.deepEqual(manifestReferenceUnion(merged), ["[[Ours]]", "[[Theirs]]"]);
  assert.deepEqual(markerOf(mock, "refsD").children.map((child) => child.string), ["[[Ours]] [[Theirs]]"]);
});

test("a shard write that fails leaves the commit intact and is repaired on the next open", async (t) => {
  const mock = await baseGrid("refsE", [bandRows(0, "r")]);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings(MIRROR_ON);

  const store = await new LargeGridStore("refsE").initialize();
  await store.setCell(0, 0, "[[Alpha]]");
  mock.hooks.beforeBlockWrite = (write) => { if (!String(write.string ?? "").startsWith("roam-grid/manifest::")) throw new Error("transactor refused"); };

  const committed = await store.commit();

  assert.equal(committed.chunks[0].refs[0], "[[Alpha]]", "the manifest committed");
  assert.equal(store.dirty.size, 0, "and the edit is saved, not left pending");
  assert.equal(mock.blocks.get(store.pointerUid).string, `roam-grid/manifest:: ${store.manifestUrl}`, "the pointer swap stands");
  assert.equal(markerOf(mock, "refsE"), null, "only the mirror is missing — stale, never wrong");

  mock.hooks.beforeBlockWrite = null;
  const reopened = await new LargeGridStore("refsE").initialize();
  await reopened.refsSync;
  assert.deepEqual(markerOf(mock, "refsE").children.map((child) => child.string), ["[[Alpha]]"], "reopening recomputes it from the manifest");
});
