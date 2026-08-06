import test from "node:test";
import assert from "node:assert/strict";
import {
  LargeGridStore, mapWithConcurrency, refreshSettingsCache, resetChunkCache, settingsCache, sha256Hex,
} from "../src/extension.js";

const NO_STORAGE = { getItem: () => null, setItem: () => {} };

function withSettings(values) {
  refreshSettingsCache({ settings: { getAll: () => ({ ...values }) } }, NO_STORAGE);
}

/** One real macrotask, so anything started before it is still in flight when the next one starts. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The harness from `chunk-cache.test.js` with two additions that are the whole point of this file:
 * every file read and write is held open across a macrotask, and each records the peak number of
 * calls simultaneously inside it. A limiter that has been replaced by `Promise.all` shows up here as
 * a peak equal to the item count rather than the limit. `events` keeps the start order of both, which
 * is what distinguishes a streamed copy from one that reads everything before it writes anything.
 */
function installRoamMock(initial = {}) {
  let uidCounter = 0;
  let fileCounter = 0;
  const blocks = new Map();
  const files = new Map();
  const uploads = [];
  const downloads = [];
  const events = [];
  const live = { upload: 0, get: 0 };
  const peak = { upload: 0, get: 0 };

  for (const [uid, value] of Object.entries(initial.blocks || {})) {
    const block = { uid, string: value.string, order: 0, children: value.children || [] };
    blocks.set(uid, block);
    for (const child of block.children) blocks.set(child.uid, child);
  }
  for (const [url, value] of Object.entries(initial.files || {})) files.set(url, typeof value === "string" ? value : JSON.stringify(value));

  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  const enter = (kind) => { live[kind] += 1; peak[kind] = Math.max(peak[kind], live[kind]); };
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (query, bound) => { const uid = bound ?? /:block\/uid "([^"]+)"/.exec(query)?.[1]; return uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []; },
    data: { block: {
      create: async ({ location, block }) => { const created = { ...block, order: location.order === "last" ? 999 : location.order, children: [] }; blocks.set(block.uid, created); blocks.get(location["parent-uid"]).children.push(created); },
      update: async ({ block }) => { blocks.get(block.uid).string = block.string; },
    } },
    file: {
      upload: async ({ file }) => {
        enter("upload");
        const url = `https://mock/${++fileCounter}`;
        const text = await file.text();
        const parsed = JSON.parse(text);
        events.push(`upload:${parsed.schema === "roam-grid/chunk" ? `chunk-${parsed.index}` : "manifest"}`);
        await tick();
        files.set(url, text);
        uploads.push({ url, text: parsed });
        live.upload -= 1;
        return url;
      },
      get: async ({ url }) => {
        enter("get");
        downloads.push(url);
        events.push(`get:${url}`);
        await tick();
        live.get -= 1;
        if (!files.has(url)) throw new Error(`missing ${url}`);
        return new File([files.get(url)], "grid.json", { type: "application/json" });
      },
      delete: async ({ url }) => files.delete(url),
    },
  } };
  return { blocks, files, uploads, downloads, events, peak, dispose: () => delete globalThis.window };
}

// 50 is the floor `large-chunk-rows` coerces to, so a source chunk and a destination chunk are the
// same size and a streamed copy reads exactly one source chunk per uploaded chunk.
const CHUNK_ROWS = 50;

/** A v2 grid whose chunk files already exist, so nothing is seeded and every read is a download. */
async function chunkGrid(anchorUid, count, extra = {}) {
  const files = {};
  const chunks = [];
  for (let index = 0; index < count; index += 1) {
    const url = `https://mock/chunk-${index}`;
    const text = JSON.stringify({ schema: "roam-grid/chunk", version: 1, index, startRow: index * CHUNK_ROWS, rows: Array.from({ length: CHUNK_ROWS }, (_, local) => [`r${index * CHUNK_ROWS + local}`, "x"]) });
    files[url] = text;
    chunks.push({ index, startRow: index * CHUNK_ROWS, rowCount: CHUNK_ROWS, url, digest: await sha256Hex(text) });
  }
  files["https://mock/manifest"] = JSON.stringify({
    schema: "roam-grid/manifest", version: 2, revision: "rev1", rowIdRevision: "rev1", previous: null,
    rowCount: count * CHUNK_ROWS, colCount: 2, columnIds: ["cA", "cB"], widths: {}, chunkRows: CHUNK_ROWS,
    rowHeights: {}, rowHeightsByIndex: {}, alignments: {}, alignmentsByIndex: {},
    frozenRows: 0, frozenCols: 0, merges: [], charts: [], showHeaders: false, fitToWidth: true, colorFormulaCells: true, chunks, retained: [], ...extra,
  });
  return installRoamMock({
    blocks: { [anchorUid]: { string: "{{[[roam/grid]]}}", children: [{ uid: `p-${anchorUid}`, string: "roam-grid/manifest:: https://mock/manifest", order: 0, children: [] }] } },
    files,
  });
}

/* --------------------------------------------------------------------------- limiter ---- */

test("mapWithConcurrency holds the peak at its limit and returns results in input order", async () => {
  const observed = { live: 0, peak: 0 };
  const started = [];
  const results = await mapWithConcurrency(Array.from({ length: 12 }, (_, index) => `v${index}`), 4, async (value, index) => {
    observed.live += 1;
    observed.peak = Math.max(observed.peak, observed.live);
    started.push(index);
    // Uneven durations: a limiter that collects results in completion order fails the order check.
    for (let step = 0; step <= index % 3; step += 1) await tick();
    observed.live -= 1;
    return `${value}!`;
  });

  assert.equal(observed.peak, 4, "POSITIVE CONTROL: `Promise.all` over the same twelve items records a peak of 12");
  assert.deepEqual(results, Array.from({ length: 12 }, (_, index) => `v${index}!`), "result i belongs to item i");
  assert.deepEqual(started.slice(0, 4), [0, 1, 2, 3], "the first wave is the first four items, not an arbitrary four");
  assert.equal(started.length, 12);
  assert.equal(observed.live, 0);
});

test("mapWithConcurrency degrades cleanly at its edges", async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async () => { throw new Error("must never run"); }), []);

  const seen = [];
  assert.deepEqual(await mapWithConcurrency([1, 2], 99, async (value) => { seen.push(value); return value * 2; }), [2, 4]);
  assert.deepEqual(seen, [1, 2], "a limit above the item count runs every item exactly once");

  // A zero or negative limit still makes progress instead of hanging on nothing.
  assert.deepEqual(await mapWithConcurrency([1, 2, 3], 0, async (value) => value + 1), [2, 3, 4]);
  await assert.rejects(mapWithConcurrency([1, 2, 3], 2, async (value) => { if (value === 2) throw new Error("worker failed"); return value; }), /worker failed/);
});

/* ------------------------------------------------------------------ parallel uploads ---- */

test("commit uploads dirty chunks four at a time with every digest still on its own chunk", async (t) => {
  const mock = await chunkGrid("parallelA", 12);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings({});

  const store = await new LargeGridStore("parallelA").initialize();
  for (let index = 0; index < 12; index += 1) await store.setCell(index * CHUNK_ROWS, 0, `edit-${index}`);
  assert.equal(store.dirty.size, 12);

  mock.peak.upload = 0;
  const manifest = await store.commit();

  assert.ok(mock.peak.upload > 1, "the uploads really did overlap rather than serializing");
  assert.equal(mock.peak.upload, 4, "POSITIVE CONTROL: `Promise.all` here opens all twelve uploads at once");

  // 3B pairs a digest with a chunk. Crossing them under concurrency would produce a manifest whose
  // every chunk fails verification on the next read, so check the pairing on the bytes themselves.
  for (const descriptor of manifest.chunks) {
    const body = mock.files.get(descriptor.url);
    assert.equal(await sha256Hex(body), descriptor.digest, `chunk ${descriptor.index} carries the digest of its own bytes`);
    const parsed = JSON.parse(body);
    assert.equal(parsed.index, descriptor.index, "and the body at that url is the chunk the manifest claims");
    assert.equal(parsed.rows[0][0], `edit-${descriptor.index}`);
    assert.equal(descriptor.rowCount, CHUNK_ROWS);
  }
  assert.deepEqual(manifest.retained.slice(1), Array.from({ length: 12 }, (_, index) => `https://mock/chunk-${index}`), "the superseded urls stay in dirty-index order");

  const reopened = await new LargeGridStore("parallelA").initialize();
  assert.equal(await reopened.getRaw(6 * CHUNK_ROWS, 0), "edit-6", "and every chunk verifies on the way back in");
  assert.equal(await reopened.getRaw(11 * CHUNK_ROWS, 0), "edit-11");
});

/* ------------------------------------------------------------------- bounded prefetch ---- */

test("a wide band prefetches at most six chunks at a time, on both read paths", async (t) => {
  const mock = await chunkGrid("parallelB", 30);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings({});

  const store = await new LargeGridStore("parallelB").initialize();
  mock.peak.get = 0;
  await store.ensureRows(0, 30 * CHUNK_ROWS);

  assert.equal(mock.peak.get, 6, "POSITIVE CONTROL: `Promise.all` here opens all thirty reads at once");
  assert.equal(store.cache.size, 30, "the whole band is still resident when the prefetch resolves");
  assert.equal(store.peekRaw(0, 0), "r0", "including its head, which the bound was raised to cover");
  assert.equal(store.peekRaw(30 * CHUNK_ROWS - 1, 0), `r${30 * CHUNK_ROWS - 1}`);

  store.cache.clear();
  mock.peak.get = 0;
  assert.deepEqual([...await store.ensureRowsSettled(0, 30 * CHUNK_ROWS)], []);
  assert.equal(mock.peak.get, 6, "the render-path sibling is bounded the same way");
});

/* -------------------------------------------------------------------- streamed copy ---- */

test("saveAsCopy streams: each destination chunk is uploaded before the next source band is read", async (t) => {
  const mock = await chunkGrid("parallelC", 8, {
    rowHeights: { r_rev1_1_0: 61 }, alignments: { "r_rev1_2_1::cB": "right" }, widths: { cA: 175 },
    merges: [{ id: "m1", row: 300, col: 0, rowSpan: 2, colSpan: 2 }], frozenRows: 1, frozenCols: 1, showHeaders: true, fitToWidth: false,
  });
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings({ "large-chunk-rows": CHUNK_ROWS });

  const source = await new LargeGridStore("parallelC").initialize();
  mock.blocks.set("copyAnchorC", { uid: "copyAnchorC", string: "{{[[roam/grid]]}}", order: 0, children: [] });
  mock.events.length = 0;

  const copy = await source.saveAsCopy("copyAnchorC");

  const firstUpload = mock.events.findIndex((event) => event.startsWith("upload:chunk-"));
  const lastSourceRead = mock.events.reduce((at, event, index) => (event.startsWith("get:https://mock/chunk-") ? index : at), -1);
  assert.ok(firstUpload >= 0 && lastSourceRead >= 0, "the copy both read the source and wrote chunks");
  assert.ok(firstUpload < lastSourceRead, "0.8.2 accumulated every source row before it uploaded anything");
  assert.deepEqual(mock.events.slice(0, 4), ["get:https://mock/chunk-0", "upload:chunk-0", "get:https://mock/chunk-1", "upload:chunk-1"], "read one band, write one band, drop it");

  assert.notEqual(copy.manifestUrl, source.manifestUrl);
  assert.equal(copy.manifest.rowCount, 8 * CHUNK_ROWS);
  assert.equal(copy.manifest.colCount, 2);
  assert.equal(copy.manifest.chunks.length, 8);
  assert.notEqual(copy.manifest.rowIdRevision, source.manifest.rowIdRevision, "the copy owns its own id namespace");
  assert.deepEqual(await copy.getRows(0, 8 * CHUNK_ROWS), await source.getRows(0, 8 * CHUNK_ROWS), "every row survived the stream");

  assert.equal(copy.manifest.widths.cA, 175);
  assert.equal(copy.rowHeight(CHUNK_ROWS), 61, "a row height is re-keyed onto the same row in the copy");
  assert.equal(copy.getAlignment(2 * CHUNK_ROWS + 1, 1), "right");
  assert.equal(copy.manifest.frozenRows, 1);
  assert.equal(copy.manifest.frozenCols, 1);
  assert.equal(copy.manifest.showHeaders, true);
  assert.equal(copy.manifest.fitToWidth, false);
  assert.equal(copy.mergeAt(301, 1).id, "m1");
  for (const descriptor of copy.manifest.chunks) assert.equal(await sha256Hex(mock.files.get(descriptor.url)), descriptor.digest, "3A/3B still hold on a streamed chunk");
});

test("POSITIVE CONTROL: streaming a copy cannot evict the source's unsaved edit or widen its bound", async (t) => {
  const mock = await chunkGrid("parallelD", 24);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  withSettings({ "large-chunk-rows": CHUNK_ROWS });

  const source = await new LargeGridStore("parallelD").initialize();
  await source.setCell(0, 0, "unsaved");
  source.boundResidentChunks(1);
  assert.equal(source.residentLimit, 8);
  mock.blocks.set("copyAnchorD", { uid: "copyAnchorD", string: "{{[[roam/grid]]}}", order: 0, children: [] });

  const copy = await source.saveAsCopy("copyAnchorD");

  assert.equal(source.residentLimit, 8, "a walk over all twenty-four chunks never widened the bound");
  assert.ok(source.cache.size <= 9, `the resident set stayed at its bound plus the pin, saw ${source.cache.size}`);
  assert.deepEqual([...source.dirty], [0], "the edit is still queued for upload");
  assert.equal(source.cache.get(0).rows[0][0], "unsaved", "and still in memory rather than evicted mid-copy");
  assert.equal(await copy.getRaw(0, 0), "unsaved", "the copy carries the live value, not the last saved one");
  assert.equal(await copy.getRaw(24 * CHUNK_ROWS - 1, 0), `r${24 * CHUNK_ROWS - 1}`);
});
