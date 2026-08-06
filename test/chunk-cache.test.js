import test from "node:test";
import assert from "node:assert/strict";
import {
  ChunkCache, GridModel, LargeGridStore, MemoryBackend, ThrowingBackend, chunkCacheMaxBytes,
  refreshSettingsCache, resetChunkCache, settingsCache, sharedChunkCache, sha256Hex,
} from "../src/extension.js";

const NO_STORAGE = { getItem: () => null, setItem: () => {} };

function withSettings(values) {
  refreshSettingsCache({ settings: { getAll: () => ({ ...values }) } }, NO_STORAGE);
}

/** The harness from `large-grid-store.test.js`, plus `serve` for replacing a body in transit. */
function installRoamMock(initial = {}) {
  let uidCounter = 0;
  let fileCounter = 0;
  const blocks = new Map();
  const files = new Map();
  const uploads = [];
  const downloads = [];

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
      upload: async ({ file }) => { const url = `https://mock/${++fileCounter}`; const text = await file.text(); files.set(url, text); uploads.push({ url, text: JSON.parse(text) }); return url; },
      get: async ({ url }) => { downloads.push(url); if (!files.has(url)) throw new Error(`missing ${url}`); return new File([files.get(url)], "grid.json", { type: "application/json" }); },
      delete: async ({ url }) => files.delete(url),
    },
  } };
  return {
    blocks, files, uploads, downloads,
    chunkDownloads: () => downloads.filter((url) => url.includes("chunk-")),
    serve: (url, body) => files.set(url, typeof body === "string" ? body : JSON.stringify(body)),
    dispose: () => delete globalThis.window,
  };
}

const CHUNK_ROWS = 3;

function chunkBody(index) {
  return { schema: "roam-grid/chunk", version: 1, index, startRow: index * CHUNK_ROWS, rows: Array.from({ length: CHUNK_ROWS }, (_, local) => [`r${index * CHUNK_ROWS + local}`, "x"]) };
}

/** A v2 grid whose chunk files already exist, so nothing is seeded and every read is a download. */
async function chunkGrid(anchorUid, count, { digests = false } = {}) {
  const files = {};
  const chunks = [];
  for (let index = 0; index < count; index += 1) {
    const url = `https://mock/chunk-${index}`;
    const text = JSON.stringify(chunkBody(index));
    files[url] = text;
    chunks.push({ index, startRow: index * CHUNK_ROWS, rowCount: CHUNK_ROWS, url, digest: digests ? await sha256Hex(text) : null });
  }
  files["https://mock/manifest"] = JSON.stringify({
    schema: "roam-grid/manifest", version: 2, revision: "rev1", rowIdRevision: "rev1", previous: null,
    rowCount: count * CHUNK_ROWS, colCount: 2, columnIds: ["cA", "cB"], widths: {}, chunkRows: CHUNK_ROWS,
    rowHeights: {}, rowHeightsByIndex: {}, alignments: {}, alignmentsByIndex: {},
    frozenRows: 0, frozenCols: 0, merges: [], charts: [], showHeaders: false, chunks, retained: [],
  });
  return installRoamMock({
    blocks: { [anchorUid]: { string: "{{[[roam/grid]]}}", children: [{ uid: `p-${anchorUid}`, string: "roam-grid/manifest:: https://mock/manifest", order: 0, children: [] }] } },
    files,
  });
}

/* ------------------------------------------------------------------- device cache ---- */

test("a chunk downloaded once is served from the device cache on the next open", async (t) => {
  const mock = await chunkGrid("cacheA", 4);
  const backend = new MemoryBackend();
  resetChunkCache(ChunkCache.open(backend));
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });

  const first = await new LargeGridStore("cacheA").initialize();
  assert.equal(first.chunkCache.available, true);
  await first.ensureRows(0, 12);
  assert.equal(mock.chunkDownloads().length, 4);
  assert.equal(backend.bodies.size, 4, "every accepted body is written through to the backend");

  mock.downloads.length = 0;
  const second = await new LargeGridStore("cacheA").initialize();
  await second.ensureRows(0, 12);
  assert.deepEqual(mock.chunkDownloads(), [], "the reopened grid downloads no chunk at all");
  assert.equal(await second.getRaw(7, 0), "r7");
  assert.equal(second.rowIdAt(7), "r_rev1_2_1", "a cached chunk still gets its row ids synthesized");
  assert.equal(second.dirty.size, 0, "and reading it queues nothing for upload");
});

test("a cached body that no longer matches its digest is dropped rather than trusted", async (t) => {
  const mock = await chunkGrid("cacheB", 2, { digests: true });
  const backend = new MemoryBackend();
  resetChunkCache(ChunkCache.open(backend));
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });

  const store = await new LargeGridStore("cacheB").initialize();
  store.retryDelay = () => 0;
  await store.ensureRows(0, 3);
  const url = store.manifest.chunks[0].url;
  const intact = backend.bodies.get(url);
  assert.equal(typeof intact, "string");

  // Exactly the shape 3B was built for, moved into the cache: schema-valid, index-valid, short.
  backend.bodies.set(url, JSON.stringify({ schema: "roam-grid/chunk", version: 1, index: 0, startRow: 0, rows: [["r0", "x"]] }));
  store.cache.clear();
  mock.downloads.length = 0;

  assert.equal(await store.getRaw(1, 0), "r1", "the good rows came from the network, not the cache");
  assert.deepEqual(mock.chunkDownloads(), [url], "one download, because the cache hit was refused not retried");
  assert.equal(backend.bodies.get(url), intact, "and the poisoned entry was replaced with the verified bytes");
});

test("a cached body that no longer parses falls through to the network", async (t) => {
  const mock = await chunkGrid("cacheC", 2);
  const backend = new MemoryBackend();
  resetChunkCache(ChunkCache.open(backend));
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });

  const store = await new LargeGridStore("cacheC").initialize();
  await store.ensureRows(0, 3);
  const url = store.manifest.chunks[0].url;
  // No digest on this manifest, so parseability is the only check standing between a rotted entry
  // and a `SyntaxError` thrown out of a render frame.
  backend.bodies.set(url, "{not json");
  store.cache.clear();
  mock.downloads.length = 0;

  assert.equal(await store.getRaw(2, 0), "r2");
  assert.deepEqual(mock.chunkDownloads(), [url]);
});

/* ----------------------------------------------------------- positive control: IDB ---- */

test("POSITIVE CONTROL: a throwing backend degrades to the uncached path and never throws", async (t) => {
  const mock = await chunkGrid("cacheD", 3);
  resetChunkCache(ChunkCache.open(new ThrowingBackend()));
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });

  const store = await new LargeGridStore("cacheD").initialize();
  assert.equal(store.chunkCache.available, false, "the first backend rejection switches the cache off");

  // Byte-identical to 0.8.2: one download per chunk, a resident band, no second round of downloads.
  await store.ensureRows(0, 9);
  assert.equal(mock.chunkDownloads().length, 3);
  assert.equal(await store.getRaw(4, 0), "r4");
  assert.equal(store.rowIdAt(4), "r_rev1_1_1");
  mock.downloads.length = 0;
  await store.ensureRows(0, 9);
  assert.deepEqual(mock.chunkDownloads(), []);

  // And every method on the switched-off cache answers the way "no cached copy" answers.
  await assert.doesNotReject(async () => {
    assert.equal(await store.chunkCache.get("https://mock/chunk-0"), null);
    assert.equal(await store.chunkCache.put("https://mock/chunk-0", "{}"), false);
    assert.equal(await store.chunkCache.delete("https://mock/chunk-0"), false);
    assert.equal(await store.chunkCache.enforceBudget(), 0);
    assert.equal(await store.chunkCache.hydrate(), store.chunkCache);
    store.chunkCache.close();
  });
  assert.equal(store.chunkCache.bytes, 0);
});

test("a backend that starts failing mid-session disables itself instead of failing the read", async (t) => {
  const mock = await chunkGrid("cacheE", 3);
  const backend = new MemoryBackend();
  backend.put = async () => { throw new Error("QuotaExceededError"); };
  resetChunkCache(ChunkCache.open(backend));
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });

  const store = await new LargeGridStore("cacheE").initialize();
  assert.equal(store.chunkCache.available, true, "open and hydrate succeeded; only writes fail");
  await store.ensureRows(0, 9);
  assert.equal(await store.getRaw(0, 0), "r0", "the grid loaded regardless");
  assert.equal(store.chunkCache.available, false, "the failed write took the cache down, not the read");
});

test("large-cache-enabled is checked before IndexedDB is ever opened", async (t) => {
  let opens = 0;
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = { open: () => { opens += 1; throw new Error("private browsing"); } };
  t.after(() => { if (previous === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = previous; resetChunkCache(); settingsCache.clear(); });

  withSettings({ "large-cache-enabled": false });
  resetChunkCache();
  assert.equal((await sharedChunkCache()).available, false);
  assert.equal(opens, 0, "the opt-out is honoured before the database is touched");

  withSettings({ "large-cache-enabled": true });
  resetChunkCache();
  assert.equal((await sharedChunkCache()).available, false, "a factory that throws degrades silently");
  assert.equal(opens, 1);

  withSettings({ "large-cache-max-mb": 64 });
  assert.equal(chunkCacheMaxBytes(), 64 * 1024 * 1024, "the size setting is read, not assumed");
  withSettings({ "large-cache-max-mb": "not a number" });
  assert.equal(chunkCacheMaxBytes(), 256 * 1024 * 1024, "and a junk value falls back to the default");
});

test("the byte budget evicts least-recently-used bodies and survives a reopen", async (t) => {
  t.after(() => settingsCache.clear());
  const backend = new MemoryBackend();
  const cache = await ChunkCache.open(backend, 30);

  for (const url of ["a", "b", "c"]) assert.equal(await cache.put(url, "0123456789"), true);
  assert.equal(cache.bytes, 30);

  await cache.get("a");
  assert.equal(await cache.put("d", "0123456789"), true);
  assert.equal(cache.bytes, 30, "the budget is a hard cap, not a target");
  assert.deepEqual([...backend.bodies.keys()].sort(), ["a", "c", "d"], "b was the least recently used");
  assert.deepEqual([...backend.meta.keys()].sort(), ["a", "c", "d"], "the size index tracks the bodies");

  assert.equal(await cache.put("e", "x".repeat(31)), false, "a body larger than the whole budget is simply not cached");
  assert.equal(await cache.get("e"), null);
  assert.equal(cache.bytes, 30);

  const reopened = await ChunkCache.open(backend, 30);
  assert.equal(reopened.bytes, 30, "the byte total is rebuilt from the index, not from the bodies");
  assert.equal(await reopened.get("d"), "0123456789");

  // A shrunken budget is enforced at open, so lowering the setting reclaims space on the next load.
  const shrunk = await ChunkCache.open(backend, 10);
  assert.equal(shrunk.bytes, 10);
  assert.equal(backend.bodies.size, 1);
});

/* ------------------------------------------------------- positive control: eviction ---- */

test("POSITIVE CONTROL: memory pressure never evicts a chunk holding an unsaved edit", async (t) => {
  const mock = await chunkGrid("cacheF", 12);
  resetChunkCache(ChunkCache.open(new MemoryBackend()));
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });

  const store = await new LargeGridStore("cacheF").initialize();
  await store.setCell(0, 0, "edited");
  assert.deepEqual([...store.dirty], [0]);

  // A one-chunk viewport, then a scroll across all twelve chunks: eight times the bound.
  store.boundResidentChunks(1);
  assert.equal(store.residentLimit, 8);
  for (let index = 0; index < 12; index += 1) await store.loadChunk(index);

  assert.equal(store.cache.size, 8, "the resident set stayed at its bound");
  assert.equal(store.cache.has(0), true, "the dirty chunk is pinned");
  assert.equal(store.cache.get(0).rows[0][0], "edited", "and still holds the edit");

  await store.commit();
  const uploaded = mock.uploads.filter((item) => item.text.schema === "roam-grid/chunk");
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].text.rows[0][0], "edited", "commit uploaded the edit, not an evicted blank");

  // And committing releases the pin: chunk 0 is ordinary again.
  store.boundResidentChunks(1);
  for (let index = 0; index < 12; index += 1) await store.loadChunk(index);
  assert.equal(store.cache.size, 8);
  assert.equal(store.cache.has(0), false);
});

test("every dirty chunk is pinned, even when they outnumber the bound", async (t) => {
  const mock = await chunkGrid("cacheG", 12);
  resetChunkCache(ChunkCache.open(new MemoryBackend()));
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });

  const store = await new LargeGridStore("cacheG").initialize();
  for (let index = 0; index < 10; index += 1) await store.setCell(index * 3, 0, `edit${index}`);
  assert.equal(store.dirty.size, 10);

  store.boundResidentChunks(1);
  for (let index = 0; index < 12; index += 1) await store.loadChunk(index);
  // Ten pinned chunks plus the one the last `loadChunk` handed back: over the bound rather than one
  // edit short of it.
  assert.equal(store.cache.size, 11, "the bound yields to the pins, never the other way round");
  for (let index = 0; index < 10; index += 1) assert.equal(store.cache.get(index).rows[0][0], `edit${index}`);
});

test("the resident bound follows the viewport band and releases chunks when it narrows", async (t) => {
  const mock = await chunkGrid("cacheH", 60);
  resetChunkCache(ChunkCache.open(new MemoryBackend()));
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });

  const store = await new LargeGridStore("cacheH").initialize();

  // A one-chunk band scrolled across all sixty: 0.8.2 finished with all sixty resident.
  for (let start = 0; start < 180; start += 3) await store.ensureRowsSettled(start, start + 3);
  assert.equal(store.residentLimit, 8);
  assert.equal(store.cache.size, 8, "a full scroll no longer pins the whole grid");
  assert.equal(store.peekRaw(177, 0), "r177", "and the band that is actually visible is still resident");

  // A band wider than the ceiling still has to fit — correctness beats the cap.
  await store.ensureRowsSettled(0, 120);
  assert.equal(store.residentLimit, 40);
  assert.equal(store.cache.size, 40);
  assert.equal(store.peekRaw(0, 0), "r0", "every row of the wide band reads, none was evicted mid-load");
  assert.equal(store.peekRaw(119, 0), "r119");

  await store.ensureRowsSettled(0, 3);
  assert.equal(store.residentLimit, 8, "narrowing the viewport lowers the bound");
  assert.equal(store.cache.size, 8, "and gives the memory back");
});

test("a render frame landing mid-export cannot blank the exported rows", async (t) => {
  const mock = await chunkGrid("cacheI", 60);
  resetChunkCache(ChunkCache.open(new MemoryBackend()));
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });

  const store = await new LargeGridStore("cacheI").initialize();
  // An export of the whole grid raises the bound to its band; a render frame arriving while it is
  // still loading lowers the bound back to the viewport and evicts most of that band.
  const exported = store.getRows(0, 180);
  await store.ensureRowsSettled(0, 3);
  const rows = await exported;

  assert.equal(store.residentLimit, 8, "the render frame really did narrow the bound");
  assert.ok(mock.chunkDownloads().length > 60, "and really did evict part of the export's band");
  assert.equal(rows.length, 180);
  assert.deepEqual(rows[0], ["r0", "x"]);
  assert.deepEqual(rows[179], ["r179", "x"]);
  assert.equal(rows.filter((row) => row[0] === "").length, 0, "a `peekRaw`-based read would blank the evicted head of this band");
});

test("an evicted chunk keeps its row ids and comes back from the device cache", async (t) => {
  const mock = await chunkGrid("cacheM", 12);
  resetChunkCache(ChunkCache.open(new MemoryBackend()));
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });

  const store = await new LargeGridStore("cacheM").initialize();
  store.boundResidentChunks(1);
  for (let index = 0; index < 12; index += 1) await store.loadChunk(index);

  assert.equal(store.cache.has(0), false, "chunk 0 was evicted");
  assert.equal(store.rowIdAt(1), "r_rev1_0_1", "its row ids outlive its payload");
  assert.equal(store.rowIndexForRowId("r_rev1_0_1"), 1);

  const registered = store.rowIndexById.size;
  mock.downloads.length = 0;
  const reloaded = await store.loadChunk(0);
  assert.deepEqual(mock.chunkDownloads(), [], "an evicted chunk comes back from the device cache, not the network");
  assert.equal(reloaded.rows[1][0], "r1");
  assert.equal(store.rowIndexById.size, registered, "the reload re-registers the same ids instead of growing the index");
  assert.equal(store.rowIndexForRowId("r_rev1_0_1"), 1);
});

test("an unreadable chunk stays sticky with the cache in the path", async (t) => {
  const mock = await chunkGrid("cacheJ", 3, { digests: true });
  resetChunkCache(ChunkCache.open(new MemoryBackend()));
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });

  const store = await new LargeGridStore("cacheJ").initialize();
  store.retryDelay = () => 0;
  const url = store.manifest.chunks[1].url;
  mock.serve(url, { schema: "roam-grid/chunk", version: 1, index: 1, startRow: 3, rows: [["r3", "x"]] });

  await assert.rejects(store.loadChunk(1), { code: "CHUNK_DIGEST" });
  assert.equal(mock.chunkDownloads().length, 4, "the initial download plus three retries; the cache took no attempt");

  mock.downloads.length = 0;
  await assert.rejects(store.loadChunk(1), { code: "CHUNK_DIGEST" });
  assert.equal(mock.chunkDownloads().length, 0, "and the failure is still sticky");
  assert.equal(store.chunkCache.index.has(url), false, "nothing that failed verification was cached");
});

test("a store built without initialize keeps the pre-cache behaviour", async (t) => {
  const mock = await chunkGrid("cacheK", 2);
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });
  const store = new LargeGridStore("cacheK");
  assert.equal(store.chunkCache.available, false);
  assert.equal(store.residentLimit, 8);
  assert.equal(await store.chunkCache.get("https://mock/chunk-0"), null);
});

test("seeding a new grid works with the cache installed", async (t) => {
  const mock = installRoamMock({ blocks: { cacheL: { string: "{{[[roam/grid]]}}", children: [] } } });
  const backend = new MemoryBackend();
  resetChunkCache(ChunkCache.open(backend));
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); });

  const store = await new LargeGridStore("cacheL").initialize(new GridModel({ rows: [["a", "b"], ["c", "d"]], showHeaders: false }));
  assert.equal(store.manifest.chunks.length, 1);
  // Seeding uploads; it does not download, so nothing is cached until something reads a chunk.
  assert.equal(backend.bodies.size, 0);
  store.cache.clear();
  assert.equal(await store.getRaw(1, 1), "d");
  assert.equal(backend.bodies.size, 1, "the first real read populates the cache");
});
