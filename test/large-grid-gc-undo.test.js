import test from "node:test";
import assert from "node:assert/strict";
import {
  GridView, LargeGridHistory, LargeGridStore, LargeGridView, alignmentKey, applyLargeUndoOps,
  clearUndoHistories, largeGridHistoryFor, manifestGarbage, manifestRetained, normalizeManifest,
  planOrphanCollection, refreshSettingsCache, resetChunkCache, resetOrphanCollection, settingsCache,
  sha256Hex,
} from "../src/extension.js";

const NO_STORAGE = { getItem: () => null, setItem: () => {} };
const withSettings = (values = {}) => refreshSettingsCache({ settings: { getAll: () => ({ ...values }) } }, NO_STORAGE);

const CHUNK_ROWS = 50;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

/**
 * Same shape as the merge suite's harness plus a delete ledger: `deletes` records every url the
 * store asked Roam to remove, which is the only way a test can prove GC did NOT touch a live file.
 * `failDelete` makes `file.delete` reject, standing in for the unverified behaviour on a url that is
 * already gone.
 */
function installRoamMock(initial = {}) {
  let uidCounter = 0;
  let fileCounter = 0;
  const blocks = new Map();
  const files = new Map();
  const uploads = [];
  const deletes = [];
  const hooks = { afterUpload: null, failDelete: new Set() };

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
      get: async ({ url }) => { if (!files.has(url)) throw new Error(`missing ${url}`); return new File([files.get(url)], "grid.json", { type: "application/json" }); },
      delete: async ({ url }) => {
        deletes.push(url);
        if (hooks.failDelete.has(url)) throw new Error(`refused ${url}`);
        files.delete(url);
      },
    },
  } };
  return { blocks, files, uploads, deletes, hooks, dispose: () => delete globalThis.window };
}

async function chunkPayload(index, marker) {
  const text = JSON.stringify({ schema: "roam-grid/chunk", version: 1, index, startRow: index * CHUNK_ROWS, rows: Array.from({ length: CHUNK_ROWS }, (_, local) => [`${marker}${index * CHUNK_ROWS + local}`, "x"]) });
  return { text, digest: await sha256Hex(text) };
}

async function baseGrid(anchorUid, count = 3, extra = {}) {
  const files = {};
  const chunks = [];
  for (let index = 0; index < count; index += 1) {
    const url = `https://mock/chunk-${index}`;
    const { text, digest } = await chunkPayload(index, "r");
    files[url] = text;
    chunks.push({ index, startRow: index * CHUNK_ROWS, rowCount: CHUNK_ROWS, url, digest });
  }
  const manifest = {
    schema: "roam-grid/manifest", version: 2, revision: "rev-base", rowIdRevision: "rev-base", previous: null, lineage: [],
    createdAt: iso(0), rowCount: count * CHUNK_ROWS, colCount: 2, columnIds: ["cA", "cB"], widths: {}, chunkRows: CHUNK_ROWS,
    rowHeights: {}, rowHeightsByIndex: {}, alignments: {}, alignmentsByIndex: {},
    frozenRows: 0, frozenCols: 0, merges: [], charts: [], showHeaders: false, fitToWidth: true, colorFormulaCells: true,
    chunks, retained: [], garbage: [], ...extra,
  };
  files["https://mock/manifest-base"] = JSON.stringify(manifest);
  const pointerUid = `p-${anchorUid}`;
  const mock = installRoamMock({
    blocks: { [anchorUid]: { string: "{{[[roam/grid]]}}", children: [{ uid: pointerUid, string: "roam-grid/manifest:: https://mock/manifest-base", order: 0, children: [] }] } },
    files,
  });
  mock.manifest = manifest;
  mock.pointerUid = pointerUid;
  return mock;
}

const cleanup = (t, mock) => t.after(() => { mock.dispose(); resetChunkCache(); resetOrphanCollection(); clearUndoHistories(); settingsCache.clear(); });

/**
 * `initialize` fires its own sweep, so a test that wants to drive the collector at a controlled
 * clock has to let that one settle and hand the grid its session budget back first. Opening with the
 * setting off is also what production does — the row defaults to off — so this is the ordinary path,
 * not a contrivance to dodge the trigger.
 */
async function openQuietly(anchorUid, settings = {}) {
  withSettings();
  const store = await new LargeGridStore(anchorUid).initialize();
  assert.equal((await store.orphanSweep).skipped, "disabled", "opening with the setting off must not delete anything");
  withSettings(settings);
  resetOrphanCollection(anchorUid);
  return store;
}

/* ------------------------------------------------------- the collector's refusal set ---- */

test("planOrphanCollection refuses every url it cannot prove is both unreferenced and stale", () => {
  const now = 100 * DAY;
  const stale = iso(now - 8 * DAY);
  const manifest = {
    chunks: [{ index: 0, url: "https://mock/live-chunk" }],
    retained: ["https://mock/retained"],
    previous: "https://mock/previous",
    garbage: [
      { url: "https://mock/live-chunk", deadAt: stale },
      { url: "https://mock/retained", deadAt: stale },
      { url: "https://mock/previous", deadAt: stale },
      { url: "https://mock/current", deadAt: stale },
      { url: "https://mock/no-date", deadAt: null },
      { url: "https://mock/bad-date", deadAt: "not a date" },
      { url: "https://mock/fresh", deadAt: iso(now - 6 * DAY) },
      { url: "https://mock/collectable", deadAt: stale },
    ],
  };

  const plan = planOrphanCollection(manifest, "https://mock/current", now);
  assert.deepEqual(plan.collect.map((entry) => entry.url), ["https://mock/collectable"]);

  const kept = plan.keep.map((entry) => entry.url);
  assert.ok(kept.includes("https://mock/live-chunk"), "POSITIVE CONTROL: a url the manifest still serves is never collected, however old the garbage entry claims it is");
  assert.ok(kept.includes("https://mock/retained"), "retained[] is the rollback window and is off limits");
  assert.ok(kept.includes("https://mock/previous"), "the previous manifest is still reachable");
  assert.ok(kept.includes("https://mock/current"), "and the manifest being read right now most of all");
  assert.ok(kept.includes("https://mock/no-date"), "an entry with no deadAt cannot be shown to be past grace");
  assert.ok(kept.includes("https://mock/bad-date"), "and neither can one whose deadAt does not parse");
  assert.ok(kept.includes("https://mock/fresh"), "POSITIVE CONTROL: one day short of the seven-day grace window is still kept");
  assert.equal(plan.keep.length + plan.collect.length, manifest.garbage.length, "every entry is accounted for exactly once");
});

test("planOrphanCollection collects only at the far edge of the grace window", () => {
  const now = 100 * DAY;
  const at = (age) => planOrphanCollection({ chunks: [], retained: [], garbage: [{ url: "u", deadAt: iso(now - age) }] }, "m", now);
  assert.equal(at(7 * DAY - 1).collect.length, 0, "one millisecond short still waits");
  assert.equal(at(7 * DAY).collect.length, 1);
  assert.equal(at(0).collect.length, 0);
  assert.equal(at(-DAY).collect.length, 0, "a deadAt in the future is not past anything");
});

test("manifestGarbage keeps unusable timestamps and drops only unusable urls", () => {
  const garbage = manifestGarbage({ garbage: [{ url: "a", deadAt: "x" }, { url: "", deadAt: "x" }, { deadAt: "x" }, null, "b", { url: "c" }] });
  assert.deepEqual(garbage, [{ url: "a", deadAt: "x" }, { url: "c", deadAt: null }]);
  assert.deepEqual(manifestGarbage({}), [], "an absent list is empty, not undefined");
  assert.equal(manifestGarbage({ garbage: Array.from({ length: 400 }, (_, index) => ({ url: `u${index}`, deadAt: "x" })) }).length, 256, "the list is bounded so the manifest cannot grow without end");
  assert.deepEqual(manifestRetained({ retained: ["a", "", null, 7, "b"] }), ["a", "b"]);
});

test("normalizeManifest carries garbage and retained through both schema versions", async () => {
  const v2 = normalizeManifest({ schema: "roam-grid/manifest", version: 2, rowCount: 1, colCount: 1, chunks: [], garbage: [{ url: "g", deadAt: "x" }], retained: ["r"] });
  assert.deepEqual(v2.garbage, [{ url: "g", deadAt: "x" }]);
  assert.deepEqual(v2.retained, ["r"]);
  const v1 = normalizeManifest({ schema: "roam-grid/manifest", version: 1, rowCount: 1, colCount: 1, chunks: [] });
  assert.deepEqual(v1.garbage, [], "a v1 manifest migrates to an empty list rather than undefined");
  assert.deepEqual(v1.retained, []);
});

/* ------------------------------------------------------------- the collector, running ---- */

test("orphan collection is off by default and deletes nothing", async (t) => {
  const mock = await baseGrid("gcOff", 2, { updatedAt: iso(0), garbage: [{ url: "https://mock/dead", deadAt: iso(0) }] });
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("gcOff").initialize();
  assert.equal((await store.orphanSweep).skipped, "disabled", "the sweep initialize fires is refused too");
  const result = await store.collectOrphans({ now: () => 100 * DAY });
  assert.equal(result.skipped, "disabled");
  assert.deepEqual(mock.deletes, [], "POSITIVE CONTROL: the whole feature is inert until the user opts in");
  assert.deepEqual(store.manifest.garbage.map((entry) => entry.url), ["https://mock/dead"], "and the list is left exactly as it was found");
});

test("a grid something saved within the hour is left alone", async (t) => {
  const now = 100 * DAY;
  const mock = await baseGrid("gcRecent", 2, { updatedAt: iso(now - 30 * 60 * 1000), garbage: [{ url: "https://mock/dead", deadAt: iso(0) }] });
  cleanup(t, mock);

  const store = await openQuietly("gcRecent", { "large-gc-orphans": true });
  assert.equal((await store.collectOrphans({ now: () => now })).skipped, "recent");
  assert.deepEqual(mock.deletes, [], "a save may still be in flight on another client");

  // The same grid, one hour older, is collectable — so the refusal above was the clock and not
  // some other gate quietly swallowing the sweep.
  resetOrphanCollection("gcRecent");
  store.manifest.updatedAt = iso(now - HOUR - 1);
  assert.deepEqual((await store.collectOrphans({ now: () => now })).deleted, ["https://mock/dead"]);
});

test("a manifest that cannot say when it was written is never collected from", async (t) => {
  const now = 100 * DAY;
  const mock = await baseGrid("gcUndated", 2, { createdAt: "whenever", garbage: [{ url: "https://mock/dead", deadAt: iso(0) }] });
  cleanup(t, mock);

  const store = await openQuietly("gcUndated", { "large-gc-orphans": true });
  assert.equal((await store.collectOrphans({ now: () => now })).skipped, "unknown-age");
  assert.deepEqual(mock.deletes, []);
});

test("a quiet grid collects only what is past grace, and never a live chunk", async (t) => {
  const now = 100 * DAY;
  const liveChunkUrl = "https://mock/chunk-1";
  const mock = await baseGrid("gcRun", 3, {
    updatedAt: iso(now - 2 * HOUR),
    garbage: [
      { url: "https://mock/old-chunk", deadAt: iso(now - 9 * DAY) },
      { url: "https://mock/old-manifest", deadAt: iso(now - 8 * DAY) },
      { url: liveChunkUrl, deadAt: iso(now - 9 * DAY) },
      { url: "https://mock/fresh", deadAt: iso(now - HOUR) },
    ],
  });
  mock.files.set("https://mock/old-chunk", "{}");
  mock.files.set("https://mock/old-manifest", "{}");
  cleanup(t, mock);

  const store = await openQuietly("gcRun", { "large-gc-orphans": true });
  const result = await store.collectOrphans({ now: () => now });

  assert.deepEqual(result.deleted, ["https://mock/old-chunk", "https://mock/old-manifest"]);
  assert.deepEqual(mock.deletes, ["https://mock/old-chunk", "https://mock/old-manifest"], "POSITIVE CONTROL: the live chunk url was never even offered to file.delete");
  assert.equal(mock.files.has(liveChunkUrl), true, "and the file the grid is serving is still there");
  assert.deepEqual(store.manifest.garbage.map((entry) => entry.url), [liveChunkUrl, "https://mock/fresh"], "collected entries leave the list; refused ones stay for next time");
  assert.equal(store.metadataDirty, true, "the pruned list rides along with the next ordinary save rather than uploading a manifest of its own");

  // Reading rows out of the live chunk still works, which is the end-to-end version of the same claim.
  const rows = await store.getRows(CHUNK_ROWS, CHUNK_ROWS + 2);
  assert.deepEqual(rows[0], ["r50", "x"]);
});

test("a delete the API refuses keeps its url in garbage instead of assuming it is gone", async (t) => {
  const now = 100 * DAY;
  const mock = await baseGrid("gcFail", 2, {
    updatedAt: iso(now - 2 * HOUR),
    garbage: [{ url: "https://mock/refuses", deadAt: iso(now - 9 * DAY) }, { url: "https://mock/accepts", deadAt: iso(now - 9 * DAY) }],
  });
  mock.hooks.failDelete.add("https://mock/refuses");
  cleanup(t, mock);

  const store = await openQuietly("gcFail", { "large-gc-orphans": true });
  const result = await store.collectOrphans({ now: () => now });

  assert.deepEqual(result.deleted, ["https://mock/accepts"]);
  assert.deepEqual(result.failed, ["https://mock/refuses"]);
  assert.deepEqual(store.manifest.garbage.map((entry) => entry.url), ["https://mock/refuses"], "a rejection is not evidence the file was already deleted, so it is retried next session");
});

test("orphan collection runs at most once per grid per session", async (t) => {
  const now = Date.now();
  // Dated at the epoch on purpose: this grid is swept by `initialize` at the real clock, so the
  // quiet window and the grace window both have to be satisfied without a stubbed `now`.
  const mock = await baseGrid("gcOnce", 2, { updatedAt: iso(0), garbage: [{ url: "https://mock/a", deadAt: iso(0) }, { url: "https://mock/b", deadAt: iso(0) }] });
  cleanup(t, mock);
  withSettings({ "large-gc-orphans": true });

  const store = await new LargeGridStore("gcOnce").initialize();
  // `initialize` already spent this grid's one sweep; that it did is the point of the assertion.
  assert.deepEqual((await store.orphanSweep).deleted, ["https://mock/a", "https://mock/b"]);
  assert.equal((await store.collectOrphans({ now: () => now })).skipped, "session");
  assert.equal(mock.deletes.length, 2, "the sweep initialize fired is the one that ran");

  store.manifest.garbage = [{ url: "https://mock/c", deadAt: iso(0) }];
  assert.equal((await store.collectOrphans({ now: () => now })).skipped, "session");
  assert.equal(mock.deletes.length, 2, "a second sweep in the same session is refused even with fresh work to do");

  resetOrphanCollection("gcOnce");
  assert.equal((await store.collectOrphans({ now: () => now })).skipped, null, "and the next session starts the budget over");
});

test("a disposed store stops collecting", async (t) => {
  const now = 100 * DAY;
  const mock = await baseGrid("gcDisposed", 2, { updatedAt: iso(now - 2 * HOUR), garbage: [{ url: "https://mock/a", deadAt: iso(0) }] });
  cleanup(t, mock);

  const store = await openQuietly("gcDisposed", { "large-gc-orphans": true });
  store.dispose();
  assert.equal((await store.collectOrphans({ now: () => now })).skipped, "disposed");
  assert.deepEqual(mock.deletes, []);
});

/* ------------------------------------------------------------ commit fills the list ---- */

test("commit retires the urls that fall out of retained into garbage, timestamped", async (t) => {
  const mock = await baseGrid("gcFill", 2);
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("gcFill").initialize();
  const originalChunk = mock.manifest.chunks[0].url;

  await store.setCell(0, 0, "one");
  const first = await store.commit();
  assert.deepEqual(first.garbage, [], "nothing has fallen out of the window on a grid's first save");
  assert.ok(first.retained.includes(originalChunk), "the chunk this commit replaced is still one reload away");
  assert.ok(first.retained.includes("https://mock/manifest-base"));

  await store.setCell(0, 0, "two");
  const second = await store.commit();
  assert.deepEqual(second.garbage.map((entry) => entry.url), [originalChunk], "the chunk the previous commit superseded has now aged out of the window");
  assert.ok(second.retained.includes("https://mock/manifest-base"), "while two generations of manifest are still held for rollback");

  await store.setCell(0, 0, "three");
  const third = await store.commit();
  const retired = third.garbage.map((entry) => entry.url);
  assert.ok(retired.includes(originalChunk), "and an entry once retired stays retired");
  assert.ok(retired.includes("https://mock/manifest-base"), "the base manifest reaches the far edge of the window one commit later");
  for (const entry of third.garbage) assert.ok(Number.isFinite(Date.parse(entry.deadAt)), "every entry carries a parseable clock, or the collector refuses it forever");
  for (const url of manifestRetained(third)) assert.equal(retired.includes(url), false, "nothing is in both lists");
  for (const chunk of third.chunks) assert.equal(retired.includes(chunk.url), false, "and no live chunk is ever retired");
  assert.equal(store.manifestUrl && retired.includes(store.manifestUrl), false, "nor the manifest being read right now");
});

/* --------------------------------------------------- the lost-edit-during-commit race ---- */

test("POSITIVE CONTROL: an edit arriving mid-commit survives and lands in the next commit", async (t) => {
  const mock = await baseGrid("raceA", 3);
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("raceA").initialize();
  await store.setCell(0, 0, "chunk0-first");
  await store.setCell(CHUNK_ROWS, 0, "chunk1-first");

  // Fire one edit into chunk 0 the moment its bytes are uploaded — the exact window in which the
  // old wholesale `dirty.clear()` erased the mark while the value stayed in the resident chunk.
  let fired = false;
  mock.hooks.afterUpload = async (payload) => {
    if (fired || payload.schema !== "roam-grid/chunk" || payload.index !== 0) return;
    fired = true;
    await store.setCell(0, 1, "typed-mid-commit");
  };

  await store.commit();
  mock.hooks.afterUpload = null;

  assert.equal(fired, true, "the race window was actually entered — otherwise this test proves nothing");
  assert.equal(await store.getRaw(0, 1), "typed-mid-commit", "the keystroke is still in the resident chunk");
  assert.equal(store.dirty.has(0), true, "and chunk 0 is still marked dirty, so something will save it");
  assert.equal(store.dirty.has(1), false, "POSITIVE CONTROL: the chunk nothing touched mid-commit was cleared, so the fix is selective and not a blanket refusal to clear");

  const beforeSecond = mock.uploads.length;
  await store.commit();
  const resaved = mock.uploads.slice(beforeSecond).filter((item) => item.text.schema === "roam-grid/chunk");
  assert.equal(resaved.length, 1, "exactly the one chunk that moved is re-uploaded");
  assert.equal(resaved[0].text.rows[0][1], "typed-mid-commit", "and the manifest now points at bytes that contain the keystroke");

  const persisted = JSON.parse(mock.files.get(store.manifest.chunks.find((chunk) => chunk.index === 0).url));
  assert.equal(persisted.rows[0][1], "typed-mid-commit");
  assert.equal(store.dirty.size, 0, "nothing is left dirty once the edit has actually been written");
});

test("an edit into a chunk the commit never uploaded is not cleared either", async (t) => {
  const mock = await baseGrid("raceB", 3);
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("raceB").initialize();
  await store.setCell(0, 0, "chunk0");

  let fired = false;
  mock.hooks.afterUpload = async (payload) => {
    if (fired || payload.schema !== "roam-grid/chunk") return;
    fired = true;
    await store.setCell(2 * CHUNK_ROWS, 0, "chunk2-new");
  };
  await store.commit();
  mock.hooks.afterUpload = null;

  assert.equal(fired, true);
  assert.equal(store.dirty.has(2), true, "a chunk that was not in the commit's snapshot keeps its mark");
  assert.equal(await store.getRaw(2 * CHUNK_ROWS, 0), "chunk2-new");
  await store.commit();
  assert.equal(JSON.parse(mock.files.get(store.manifest.chunks.find((chunk) => chunk.index === 2).url)).rows[0][0], "chunk2-new");
});

test("setCell reports what it overwrote and stamps the chunk it touched", async (t) => {
  const mock = await baseGrid("record", 2);
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("record").initialize();
  const first = await store.setCell(1, 1, "next");
  assert.equal(first.previous, "x", "the value the undo entry has to restore");
  assert.equal(first.raw, "next");
  assert.equal(first.index, 0);
  assert.equal(first.rowId, store.rowIdAt(1));
  assert.equal(first.columnId, "cB");

  const stamp = store.dirtyEpoch.get(0);
  const second = await store.setCell(1, 1, "later");
  assert.equal(second.previous, "next", "a second write reports the first write's value, not the stored one");
  assert.ok(store.dirtyEpoch.get(0) > stamp, "every write moves the stamp, which is what a commit compares against");
  assert.equal((await store.setCell(1, 1, "later")).previous, "later", "an unchanged write still reports honestly");
});

/* ------------------------------------------------------------------ large-grid undo ---- */

test("a large-grid undo restores the previous value and redo puts it back", async (t) => {
  const mock = await baseGrid("undoA", 2);
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("undoA").initialize();
  const history = new LargeGridHistory();
  history.record({ label: "Edit cell", cells: [await store.setCell(0, 0, "typed")] });

  assert.equal(await store.getRaw(0, 0), "typed");
  assert.equal(history.canUndo, true);
  assert.equal(history.canRedo, false);

  const entry = history.popUndo();
  const undone = await applyLargeUndoOps(store, entry.inverse, entry);
  history.pushRedo(entry);
  assert.equal(await store.getRaw(0, 0), "r0", "POSITIVE CONTROL: the cell is back to the value it held before the edit");
  assert.deepEqual(undone.dropped, []);
  assert.equal(undone.applied.length, 1);

  const redo = history.popRedo();
  await applyLargeUndoOps(store, redo.forward, redo);
  assert.equal(await store.getRaw(0, 0), "typed", "and redo replays it");
});

test("POSITIVE CONTROL: undo keeps an external change instead of clobbering it", async (t) => {
  const mock = await baseGrid("undoB", 2);
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("undoB").initialize();
  const history = new LargeGridHistory();
  const mine = await store.setCell(0, 0, "mine");
  const alsoMine = await store.setCell(1, 0, "mine-too");
  history.record({ label: "Edit", cells: [mine, alsoMine] });

  // Another writer's value arrives for the first cell only.
  await store.setCell(0, 0, "theirs");
  const marked = history.onExternalCells([alignmentKey(mine.rowId, mine.columnId)]);
  assert.equal(marked.marked, 1);

  const entry = history.popUndo();
  const result = await applyLargeUndoOps(store, entry.inverse, entry);
  assert.equal(await store.getRaw(0, 0), "theirs", "the cell another writer owns is never overwritten by an undo");
  assert.equal(await store.getRaw(1, 0), "r1", "while the cell nobody else touched still undoes normally");
  assert.deepEqual(result.dropped, [alignmentKey(mine.rowId, mine.columnId)], "and the caller is told, so it can say so");
});

test("an entry whose row or column is gone is dropped rather than forced somewhere else", async (t) => {
  const mock = await baseGrid("undoC", 2);
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("undoC").initialize();
  const ops = [
    { op: "setCell", rowId: "r_nope_9_9", columnId: "cA", raw: "ghost" },
    { op: "setCell", rowId: store.rowIdAt(0), columnId: "cGone", raw: "ghost" },
    { op: "setCell", rowId: store.rowIdAt(0), columnId: "cB", raw: "real" },
  ];
  const result = await applyLargeUndoOps(store, ops);
  assert.equal(result.applied.length, 1);
  assert.equal(await store.getRaw(0, 1), "real");
  assert.equal(result.dropped.length, 2);
});

test("an undo entry addresses its cell by row id, so it survives the rows above it moving", async (t) => {
  const mock = await baseGrid("undoD", 2);
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("undoD").initialize();
  const history = new LargeGridHistory();
  const record = await store.setCell(3, 0, "typed");
  history.record({ label: "Edit", cells: [record] });

  // Re-point the row id at a different index, the way a row insert eventually does. The entry names
  // the id, so it has to follow — an entry that had captured `row: 3` would rewrite a stranger.
  store.rowIndexById.set(record.rowId, 7);
  const entry = history.popUndo();
  const result = await applyLargeUndoOps(store, entry.inverse, entry);

  assert.equal(result.applied[0].row, 7, "the undo followed the id rather than the index it was recorded at");
  assert.equal(await store.getRaw(3, 0), "typed", "the row that merely sits at the old index is untouched");
});

test("recording a new edit drops the redo stack, and unchanged cells never become an entry", () => {
  const history = new LargeGridHistory();
  const cell = (rowId, previous, raw) => ({ rowId, columnId: "cA", previous, raw });

  assert.equal(history.record({ label: "noop", cells: [cell("r1", "same", "same")] }), null, "a write that changed nothing is not something to undo");
  assert.equal(history.record({ label: "noop", cells: [] }), null);
  assert.equal(history.record({ label: "noop", cells: [{ columnId: "cA", previous: "a", raw: "b" }] }), null, "a cell with no stable id has no address to undo to");
  assert.equal(history.canUndo, false);

  history.record({ label: "one", cells: [cell("r1", "a", "b")] });
  const entry = history.popUndo();
  history.pushRedo(entry);
  assert.equal(history.canRedo, true);
  history.record({ label: "two", cells: [cell("r2", "c", "d")] });
  assert.equal(history.canRedo, false, "a fresh edit invalidates the redo stack, exactly as it does for a native grid");
});

test("the inverse of a multi-cell entry runs in reverse order", () => {
  const history = new LargeGridHistory();
  const entry = history.record({ label: "Paste", cells: [
    { rowId: "r1", columnId: "cA", previous: "1", raw: "one" },
    { rowId: "r2", columnId: "cA", previous: "2", raw: "two" },
  ] });
  assert.deepEqual(entry.inverse.map((op) => op.rowId), ["r2", "r1"]);
  assert.deepEqual(entry.forward.map((op) => op.rowId), ["r1", "r2"]);
  assert.deepEqual(entry.touched, [alignmentKey("r1", "cA"), alignmentKey("r2", "cA")]);
});

test("a large grid answers the same undo/redo surface a native grid does", () => {
  // `commandOnActive` dispatches "Roam Grid: Undo"/"Redo" by looking the method up on the mount and
  // toasting when it is absent, so these two names are the whole contract between the command
  // palette and a large grid. Before 3F they were missing and the command fell through to the toast.
  for (const method of ["undo", "redo", "applyLargeHistory", "recordLargeEdit"]) {
    assert.equal(typeof LargeGridView.prototype[method], "function", `LargeGridView must expose ${method}`);
  }
  assert.equal(typeof GridView.prototype.undo, "function", "and the native surface is unchanged");
});

test("largeGridHistoryFor hands back one LargeGridHistory per anchor", () => {
  const histories = new Map();
  const first = largeGridHistoryFor("anchor", histories);
  assert.ok(first instanceof LargeGridHistory);
  assert.equal(largeGridHistoryFor("anchor", histories), first, "the same anchor keeps the same stack");
  assert.notEqual(largeGridHistoryFor("other", histories), first);
  assert.equal(largeGridHistoryFor("", histories), null);
});

/* ------------------------------------------------- undo serializes against a commit ---- */

test("an undo issued mid-commit serializes behind it and still reaches the next save", async (t) => {
  const mock = await baseGrid("undoRace", 2);
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("undoRace").initialize();
  const history = new LargeGridHistory();
  history.record({ label: "Edit", cells: [await store.setCell(0, 0, "typed")] });

  // Undo is issued while the commit's uploads are in flight. Because both go through the store's
  // MutationQueue it cannot land between the upload and the pointer swap; it runs after.
  let undone = null;
  mock.hooks.afterUpload = async (payload) => {
    if (undone || payload.schema !== "roam-grid/chunk") return;
    const entry = history.popUndo();
    undone = store.queue.run(() => applyLargeUndoOps(store, entry.inverse, entry));
  };
  await store.commit();
  mock.hooks.afterUpload = null;
  await undone;

  assert.equal(await store.getRaw(0, 0), "r0", "the undo applied");
  assert.equal(store.dirty.has(0), true, "and left the chunk dirty, so the next commit carries it");
  await store.commit();
  assert.equal(JSON.parse(mock.files.get(store.manifest.chunks.find((chunk) => chunk.index === 0).url)).rows[0][0], "r0");
});
