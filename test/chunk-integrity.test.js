import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel, LargeGridStore, LargeGridView, chunkDigestOf, chunkRetryDelayMs, refreshSettingsCache,
  settingsCache, sha256Hex,
} from "../src/extension.js";

const NO_STORAGE = { getItem: () => null, setItem: () => {} };

function withSettings(values) {
  refreshSettingsCache({ settings: { getAll: () => ({ ...values }) } }, NO_STORAGE);
}

/**
 * `installRoamMock` mirrors the harness in `large-grid-store.test.js`, with one addition this suite
 * needs: `serve` replaces what a url hands back without changing what was uploaded, which is the
 * only way to reproduce a body that was damaged in transit.
 */
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
    return block;
  };
  for (const [uid, value] of Object.entries(initial.blocks || {})) {
    const block = add(uid, value.string, value.children || []);
    for (const child of block.children) blocks.set(child.uid, child);
  }
  for (const [url, value] of Object.entries(initial.files || {})) files.set(url, typeof value === "string" ? value : JSON.stringify(value));

  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (query, bound) => { const uid = bound ?? /:block\/uid \"([^\"]+)\"/.exec(query)?.[1]; return uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []; },
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
  return { blocks, files, uploads, downloads, serve: (url, body) => files.set(url, typeof body === "string" ? body : JSON.stringify(body)), dispose: () => delete globalThis.window };
}

/** A three-row grid, seeded and committed so its manifest carries a real digest for chunk 0. */
async function seededGrid(anchorUid) {
  const mock = installRoamMock({ blocks: { [anchorUid]: { string: "{{[[roam/grid]]}}", children: [] } } });
  const rows = [["a0", "b0"], ["a1", "b1"], ["a2", "b2"]];
  const store = await new LargeGridStore(anchorUid).initialize(new GridModel({ rows, showHeaders: false }));
  store.retryDelay = () => 0;
  return { mock, store, chunkUrl: store.manifest.chunks[0].url };
}

test("sha256Hex hashes the exact bytes and degrades to null without crypto.subtle", async () => {
  // Cross-checked against a known vector: SHA-256("abc").
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(await sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.notEqual(await sha256Hex('{"rows":[["a"],["b"]]}'), await sha256Hex('{"rows":[["a"]]}'));

  // `globalThis.crypto` is an accessor in Node, so the stand-in has to be defined, not assigned.
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const substitute = (value) => Object.defineProperty(globalThis, "crypto", { value, configurable: true, writable: true });
  try {
    substitute({});
    assert.equal(await sha256Hex("abc"), null, "an absent crypto.subtle records no digest instead of throwing");
    substitute({ subtle: {} });
    assert.equal(await sha256Hex("abc"), null, "a subtle without digest is treated the same way");
  } finally { Object.defineProperty(globalThis, "crypto", original); }
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "the real implementation is restored");
});

test("chunkDigestOf accepts only a well-formed hex digest", async () => {
  assert.equal(chunkDigestOf({ digest: await sha256Hex("abc") }), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  for (const bad of [undefined, null, "", "abc", "ZZ", 12, true, {}, "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015a"]) {
    assert.equal(chunkDigestOf({ digest: bad }), null, `${String(bad)} is not a digest claim`);
  }
  assert.equal(chunkDigestOf(undefined), null);
  assert.equal(chunkDigestOf({}), null, "a pre-0.9.0 descriptor simply has no claim");
});

test("chunkRetryDelayMs backs off and stays bounded", () => {
  assert.deepEqual([0, 1, 2, 3].map(chunkRetryDelayMs), [150, 300, 600, 1000]);
});

test("seeding and committing record a digest of the exact uploaded bytes", async (t) => {
  const { mock, store } = await seededGrid("anchor101");
  t.after(mock.dispose);
  const seeded = mock.uploads.find((item) => item.text.schema === "roam-grid/chunk");
  assert.equal(store.manifest.chunks[0].digest, await sha256Hex(mock.files.get(seeded.url)));

  await store.setCell(1, 1, "changed");
  await store.commit();
  const descriptor = store.manifest.chunks[0];
  assert.equal(descriptor.digest, await sha256Hex(mock.files.get(descriptor.url)), "the descriptor tracks the new url's bytes");
  assert.notEqual(descriptor.digest, store.manifest.chunks[0].digest === null ? "" : null);
});

test("a truncated body that still parses as a schema-valid chunk is rejected", async (t) => {
  const { mock, store, chunkUrl } = await seededGrid("anchor102");
  t.after(mock.dispose);
  store.cache.clear();
  store.rowIds.clear();

  // Exactly the shape today's validation waves through: same schema, same version, same index,
  // `rows` still an array — only shorter. Nothing downstream of `JSON.parse` can tell.
  const truncated = { schema: "roam-grid/chunk", version: 1, index: 0, startRow: 0, rows: [["a0", "b0"]] };
  mock.serve(chunkUrl, truncated);
  const parsed = JSON.parse(mock.files.get(chunkUrl));
  assert.equal(parsed.schema, "roam-grid/chunk");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.index, 0);
  assert.ok(Array.isArray(parsed.rows), "the damaged body passes every pre-0.9.0 check");

  mock.downloads.length = 0;
  const error = await store.loadChunk(0).then(() => null, (thrown) => thrown);
  assert.equal(error?.code, "CHUNK_DIGEST");
  assert.equal(error.details.index, 0);
  assert.equal(error.details.url, chunkUrl);
  assert.equal(error.details.expected, store.manifest.chunks[0].digest);
  assert.equal(error.details.actual, await sha256Hex(JSON.stringify(truncated)));
  assert.equal(mock.downloads.length, 4, "the initial download plus three retries");
  assert.equal(store.cache.has(0), false, "the short rows never reach the cache");
});

/**
 * The ordering control. A body damaged badly enough not to parse must still come back as
 * `CHUNK_DIGEST` with its expected/actual pair — which is only possible if the digest is compared
 * before `JSON.parse` runs. Move the verification below the parse and this goes red with a
 * `SyntaxError` instead, after a single download.
 */
test("verification happens on the raw bytes, before anything parses them", async (t) => {
  const { mock, store, chunkUrl } = await seededGrid("anchor103");
  t.after(mock.dispose);
  store.cache.clear();

  const whole = mock.files.get(chunkUrl);
  mock.serve(chunkUrl, whole.slice(0, Math.floor(whole.length / 2)));
  assert.throws(() => JSON.parse(mock.files.get(chunkUrl)), SyntaxError, "the fixture really is unparseable");

  mock.downloads.length = 0;
  const error = await store.loadChunk(0).then(() => null, (thrown) => thrown);
  assert.equal(error?.name, "GridError", "a parse-first implementation throws SyntaxError here");
  assert.equal(error.code, "CHUNK_DIGEST");
  assert.equal(error.details.expected, store.manifest.chunks[0].digest);
  assert.equal(typeof error.details.actual, "string");
  assert.equal(mock.downloads.length, 4, "a parse-first implementation gives up after one download");
});

test("an intact chunk verifies, caches, and never retries", async (t) => {
  const { mock, store } = await seededGrid("anchor104");
  t.after(mock.dispose);
  store.cache.clear();
  mock.downloads.length = 0;
  assert.equal((await store.loadChunk(0)).rows[2][1], "b2");
  assert.equal(mock.downloads.length, 1);
  assert.equal(store.unreadableChunks.size, 0);
});

test("a legacy chunk with no digest keeps its schema and index checks", async (t) => {
  const { mock, store, chunkUrl } = await seededGrid("anchor105");
  t.after(mock.dispose);
  store.cache.clear();
  delete store.manifest.chunks[0].digest;

  mock.serve(chunkUrl, { schema: "roam-grid/chunk", version: 1, index: 0, startRow: 0, rows: [["only", "row"]] });
  mock.downloads.length = 0;
  assert.deepEqual((await store.loadChunk(0)).rows, [["only", "row"]], "no claim means nothing to verify");
  assert.equal(mock.downloads.length, 1, "an unverifiable chunk is never retried");

  store.cache.clear();
  mock.serve(chunkUrl, { schema: "roam-grid/chunk", version: 1, index: 7, startRow: 0, rows: [] });
  await assert.rejects(store.loadChunk(0), { code: "CHUNK_CORRUPT" }, "the pre-0.9.0 checks still run");
});

test("the checksum setting turns verification off without touching the schema checks", async (t) => {
  const { mock, store, chunkUrl } = await seededGrid("anchor106");
  t.after(() => { mock.dispose(); settingsCache.clear(); });
  store.cache.clear();
  withSettings({ "large-verify-checksums": false });

  mock.serve(chunkUrl, { schema: "roam-grid/chunk", version: 1, index: 0, startRow: 0, rows: [["short"]] });
  mock.downloads.length = 0;
  assert.deepEqual((await store.loadChunk(0)).rows, [["short"]]);
  assert.equal(mock.downloads.length, 1);
});

test("a mismatch is sticky and edits into the band are refused until it is forgotten", async (t) => {
  const { mock, store, chunkUrl } = await seededGrid("anchor107");
  t.after(mock.dispose);
  store.cache.clear();
  const intact = mock.files.get(chunkUrl);
  mock.serve(chunkUrl, { schema: "roam-grid/chunk", version: 1, index: 0, startRow: 0, rows: [["a0", "b0"]] });
  await assert.rejects(store.loadChunk(0), { code: "CHUNK_DIGEST" });

  mock.downloads.length = 0;
  await assert.rejects(store.loadChunk(0), { code: "CHUNK_DIGEST" });
  await assert.rejects(store.setCell(1, 1, "written blind"), { code: "CHUNK_DIGEST" });
  await assert.rejects(store.getRaw(1, 1), { code: "CHUNK_DIGEST" });
  assert.equal(mock.downloads.length, 0, "a known-bad chunk is not re-downloaded on every read");
  assert.equal(store.dirty.size, 0, "nothing was queued for upload from rows that were never read");

  mock.serve(chunkUrl, intact);
  assert.equal(store.forgetChunkError(0), true);
  assert.equal((await store.loadChunk(0)).rows.length, 3, "asking again is what a Reload does");
  await store.setCell(1, 1, "now allowed");
  assert.equal(await store.getRaw(1, 1), "now allowed");
});

/** Three chunks at the smallest chunk size the schema allows, so a band can straddle them. */
async function bandedGrid(anchorUid, rowCount = 150) {
  const mock = installRoamMock({ blocks: { [anchorUid]: { string: "{{[[roam/grid]]}}", children: [] } } });
  withSettings({ "large-chunk-rows": 50 });
  const rows = Array.from({ length: rowCount }, (_, row) => [`r${row}`]);
  const store = await new LargeGridStore(anchorUid).initialize(new GridModel({ rows, showHeaders: false }));
  store.retryDelay = () => 0;
  store.cache.clear();
  return { mock, store };
}

test("ensureRowsSettled isolates the failing chunk and still rejects other failures", async (t) => {
  const { mock, store } = await bandedGrid("anchor108");
  t.after(() => { mock.dispose(); settingsCache.clear(); });
  mock.serve(store.manifest.chunks[1].url, { schema: "roam-grid/chunk", version: 1, index: 1, startRow: 50, rows: [] });

  const failed = await store.ensureRowsSettled(0, 150);
  assert.deepEqual([...failed], [1]);
  assert.equal(store.peekRaw(0, 0), "r0", "the readable chunks around it still loaded");
  assert.equal(store.peekRaw(120, 0), "r120");
  assert.equal(store.peekRaw(60, 0), "", "and the unreadable band reads empty rather than wrong");
  assert.deepEqual([...await store.ensureRowsSettled(100, 150)], [], "a band that misses the bad chunk reports nothing");

  // Anything that is not an integrity failure keeps surfacing exactly as it does today.
  store.cache.clear();
  store.unreadableChunks.clear();
  mock.files.delete(store.manifest.chunks[2].url);
  await assert.rejects(store.ensureRowsSettled(0, 150), /missing https:\/\/mock/);
});

/* ---------------------------------------------------------------------- render band ---- */

class Node {
  constructor(tagName = "#text", text = "") {
    this.tagName = tagName.toUpperCase(); this.parentNode = null; this.children = []; this.listeners = new Map();
    this.classList = { values: new Set(), add(...v) { v.forEach((n) => this.values.add(n)); }, remove(...v) { v.forEach((n) => this.values.delete(n)); }, contains(n) { return this.values.has(n); }, toggle(n, force) { const on = force == null ? !this.values.has(n) : Boolean(force); if (on) this.values.add(n); else this.values.delete(n); return on; } };
    this.style = {}; this.dataset = {}; this._text = text;
    this.scrollTop = 0; this.scrollLeft = 0; this.clientHeight = 400; this.clientWidth = 800;
  }
  set className(value) { this._className = value; this.classList.values = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get className() { return this._className || ""; }
  set textContent(value) { this._text = String(value ?? ""); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join("") : this._text; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(typeof node === "string" ? new Node("#text", node) : node)); }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  prepend(node) { node.parentNode = this; this.children.unshift(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((node) => node !== this); this.parentNode = null; }
  matches(selector) { return String(selector).replace(":scope > ", "").split(",").some((part) => part.trim().startsWith(".") && this.classList.contains(part.trim().slice(1))); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) { const found = []; for (const child of this.children) { if (child.matches?.(selector)) found.push(child); found.push(...(child.querySelectorAll?.(selector) || [])); } return found; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  dispatch(type) { for (const listener of this.listeners.get(type) || []) listener({ type, target: this, preventDefault() {}, stopPropagation() {} }); }
}

function installDom() {
  const previous = globalThis.document;
  globalThis.document = { body: new Node("body"), createElement: (name) => new Node(name), createTextNode: (text) => new Node("#text", text) };
  return () => { if (previous) globalThis.document = previous; else delete globalThis.document; };
}

/** The slice of `LargeGridView` that `renderVisible` actually reads, with no mount and no Roam UI. */
function renderView(store) {
  return Object.assign(Object.create(LargeGridView.prototype), {
    store, editorController: null, formulaEngine: null, renderToken: 0, renderCount: 0,
    selection: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, anchor: { row: 0, col: 0 },
    cells: new Map(), cellValueTokens: new WeakMap(),
    status: new Node("span"), canvas: new Node("div"), viewport: new Node("div"),
    rowResizePreview: null, columnResizePreview: null,
    rowMetricsKey: null, metricsRows: [], metricsExtra: new Float64Array(1), metricsDefaultHeight: 0,
    scheduleRender() { this.renderCount += 1; },
  });
}

test("renderVisible bands the unreadable rows instead of failing the frame", async (t) => {
  const restoreDom = installDom();
  const { mock, store } = await bandedGrid("anchor109", 100);
  t.after(() => { mock.dispose(); restoreDom(); settingsCache.clear(); });
  const badUrl = store.manifest.chunks[1].url;
  mock.serve(badUrl, { schema: "roam-grid/chunk", version: 1, index: 1, startRow: 50, rows: [] });

  // Scroll so the visible band straddles the chunk 0 / chunk 1 boundary at row 50.
  const view = renderView(store);
  view.viewport.clientHeight = 200;
  view.viewport.scrollTop = view.rowOffset(46);
  await view.renderVisible();

  const bands = view.canvas.children.filter((node) => node.classList.contains("rg-large-error-band"));
  assert.equal(bands.length, 1, "the frame rendered — one band, not a thrown render");
  assert.equal(bands[0].dataset.chunk, "1");
  assert.equal(bands[0].textContent, "⚠ chunk 1 unreadable — Reload");

  const painted = [...view.cells.keys()].map((key) => Number(key.split(":")[0]));
  assert.ok(painted.length >= 4, "the readable chunk still painted its rows");
  assert.ok(painted.every((row) => row < 50), "no cell is painted over rows we never read");
  assert.equal(view.cells.get("46:0").dataset.rgRaw, "r46");

  // The band's one action is to ask for the chunk again.
  mock.serve(badUrl, { schema: "roam-grid/chunk", version: 1, index: 1, startRow: 50, rows: Array.from({ length: 50 }, (_, row) => [`r${50 + row}`]) });
  const reload = bands[0].children.find((node) => node.tagName === "BUTTON");
  reload.dispatch("click");
  assert.equal(store.unreadableChunks.size, 0);
  assert.equal(view.renderCount, 1);

  await view.renderVisible();
  assert.equal(view.canvas.children.filter((node) => node.classList.contains("rg-large-error-band")).length, 0);
  assert.ok([...view.cells.keys()].some((key) => key.startsWith("50:")), "the recovered rows paint on the next frame");
  assert.equal(view.cells.get("50:0").dataset.rgRaw, "r50");
});

test("beginEdit refuses a cell whose chunk never arrived", async (t) => {
  const restoreDom = installDom();
  const { mock, store } = await bandedGrid("anchor110", 100);
  t.after(() => { mock.dispose(); restoreDom(); settingsCache.clear(); });
  const badUrl = store.manifest.chunks[1].url;
  mock.serve(badUrl, { schema: "roam-grid/chunk", version: 1, index: 1, startRow: 50, rows: [] });
  await assert.rejects(store.loadChunk(1), { code: "CHUNK_DIGEST" });

  const view = renderView(store);
  const started = [];
  view.editorController = { start: (options) => { started.push(options); return options; }, schedulePresentation() {} };

  await view.beginEdit(50, 0, new Node("div"));
  assert.deepEqual(started, [], "an edit into the band never opens");

  store.forgetChunkError(1);
  mock.serve(badUrl, { schema: "roam-grid/chunk", version: 1, index: 1, startRow: 50, rows: Array.from({ length: 50 }, (_, row) => [`r${50 + row}`]) });
  await view.beginEdit(50, 0, new Node("div"));
  assert.equal(started.length, 1, "and opens again once the chunk is readable");
  assert.equal(started[0].raw, "r50");
});
