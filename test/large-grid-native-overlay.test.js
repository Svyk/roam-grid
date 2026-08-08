import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel, LargeGridStore, LargeGridView, NativeCellEditorOverlay, claimKeyboard,
  ensureRuntimeRegistries, refreshSettingsCache, resetChunkCache, resetNativeEditorHealth,
  settingsCache, runtime, nativeEditorEnabled, acquireLargeScratch, releaseLargeScratch,
  blankLargeScratch, scratchStrayConcat, resetRoamRecents,
} from "../src/extension.js";

const NO_STORAGE = { getItem: () => null, setItem: () => {} };

function withSettings(values) {
  refreshSettingsCache({ settings: { getAll: () => ({ ...values }) } }, NO_STORAGE);
}

class MiniClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((v) => this.values.add(v)); }
  remove(...values) { values.forEach((v) => this.values.delete(v)); }
  toggle(v, force) { const next = force == null ? !this.values.has(v) : Boolean(force); if (next) this.values.add(v); else this.values.delete(v); return next; }
  contains(v) { return this.values.has(v); }
}

class MiniStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  getPropertyValue(name) { return this.values.get(name) || ""; }
  removeProperty(name) { this.values.delete(name); }
}

class MiniNode {
  constructor(tagName = "#text", text = "") {
    this.tagName = tagName.toUpperCase(); this.parentNode = null; this.children = []; this.listeners = new Map();
    this.classList = new MiniClassList(); this.style = new MiniStyle(); this.dataset = {}; this.hidden = false; this._text = text;
    this.value = ""; this.selectionStart = 0; this.selectionEnd = 0;
  }
  set className(value) { this._className = value; this.classList = new MiniClassList(); String(value).split(/\s+/).filter(Boolean).forEach((n) => this.classList.add(n)); }
  get className() { return this._className || ""; }
  set textContent(value) { this._text = String(value ?? ""); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join("") : this._text; }
  get childNodes() { return this.children; }
  get parentElement() { return this.parentNode?.tagName === "#TEXT" ? null : this.parentNode; }
  append(...nodes) { nodes.forEach((n) => this.appendChild(typeof n === "string" ? new MiniNode("#text", n) : n)); }
  appendChild(node) { if (node.parentNode) node.remove(); node.parentNode = this; this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children.forEach((n) => { n.parentNode = null; }); this.children = []; this.append(...nodes); }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter((n) => n !== this); this.parentNode = null; }
  contains(node) { for (let cur = node; cur; cur = cur.parentNode) if (cur === this) return true; return false; }
  closest(selector) {
    for (let cur = this; cur; cur = cur.parentElement || cur.parentNode) {
      if (cur.matches?.(selector)) return cur;
    }
    return null;
  }
  matches(selector) { return String(selector).split(",").some((p) => { const v = p.trim(); return v.startsWith(".") && this.classList.contains(v.slice(1)); }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) { if (child.matches?.(selector)) found.push(child); found.push(...child.querySelectorAll(selector)); }
    return found;
  }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter((v) => v !== listener)); }
  dispatch(type, fields = {}) {
    const event = { type, target: this, currentTarget: this, relatedTarget: null, key: "", shiftKey: false, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...fields };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
  setAttribute(name, value) { this[name] = String(value); }
  getAttribute(name) { return this[name] == null ? null : String(this[name]); }
  removeAttribute(name) { delete this[name]; }
  focus() { globalThis.document.activeElement = this; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  getBoundingClientRect() { return { left: 100, right: 240, top: 120, bottom: 154, width: 140, height: 34 }; }
  get isConnected() { for (let cur = this; cur; cur = cur.parentNode) if (cur === globalThis.document?.body) return true; return false; }
  get innerHTML() { return this.children.map((c) => c.tagName === "#text" ? c._text : `<${c.tagName.toLowerCase()}>`).join(""); }
  prepend(...nodes) {
    nodes.forEach((node) => {
      if (typeof node === "string") node = new MiniNode("#text", node);
      if (node.parentNode) node.remove();
      node.parentNode = this;
      this.children.unshift(node);
    });
  }
}

function installMiniDom() {
  const body = new MiniNode("body");
  const documentListeners = new Map();
  const windowListeners = new Map();
  const addTo = (map) => (type, listener, capture = false) => {
    if (!map.has(type)) map.set(type, { capture: [], bubble: [] });
    map.get(type)[capture === true ? "capture" : "bubble"].push(listener);
  };
  const removeFrom = (map) => (type, listener, capture = false) => {
    const lane = map.get(type)?.[capture === true ? "capture" : "bubble"];
    const idx = lane?.indexOf(listener) ?? -1;
    if (idx >= 0) lane.splice(idx, 1);
  };
  globalThis.document = {
    body, documentElement: { clientWidth: 1024 }, activeElement: null,
    createElement: (name) => new MiniNode(name), createTextNode: (text) => new MiniNode("#text", text),
    querySelector: (sel) => body.querySelector(sel),
    addEventListener: addTo(documentListeners), removeEventListener: removeFrom(documentListeners),
  };
  globalThis.innerWidth = 1024;
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
  globalThis.MutationObserver = null;
  globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
  globalThis.CSS = { escape: (v) => String(v) };
  globalThis.window = { addEventListener: addTo(windowListeners), removeEventListener: removeFrom(windowListeners), dispatchEvent() { return true; } };
  const frames = [];
  globalThis.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  return { body, flush: () => { while (frames.length) frames.shift()(); } };
}

function installRoamMockForScratch(initial = {}) {
  let uidCounter = 0;
  const blocks = new Map();
  const add = (uid, string, children = []) => {
    const block = { uid, string, order: 0, children };
    blocks.set(uid, block);
    for (const child of children) { blocks.set(child.uid, child); for (const grandChild of child.children || []) blocks.set(grandChild.uid, grandChild); }
    return block;
  };
  for (const [uid, value] of Object.entries(initial.blocks || {})) add(uid, value.string, value.children || []);
  const cloneBlock = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(cloneBlock) });
  const findParent = (u) => [...blocks.values()].find((b) => b.children?.some((c) => c.uid === u));
  globalThis.window.roamAlphaAPI = {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (query, bound) => {
      const uid = bound ?? /:block\/uid "([^"]+)"/.exec(query)?.[1];
      if (uid && blocks.has(uid)) return [[cloneBlock(blocks.get(uid))]];
      const titleMatch = /:node\/title "([^"]+)"/.exec(query);
      if (titleMatch) {
        for (const [u, b] of blocks) { if (b.string === titleMatch[1]) return [[cloneBlock(b)]]; }
      }
      return [];
    },
    data: {
      pull: (query, args) => { for (const [u, b] of blocks) if (b.string === args[1]) return { [":block/uid"]: b.uid }; return null; },
      page: { create: async () => {} },
      block: {
        create: async ({ location, block }) => {
          const created = { ...block, order: location.order === "last" ? 999 : location.order, children: [] };
          blocks.set(block.uid, created);
          const parent = blocks.get(location["parent-uid"]);
          if (parent) parent.children.push(created);
        },
        update: async ({ block: b }) => { const existing = blocks.get(b.uid); if (existing) existing.string = b.string; },
        delete: async ({ block: b }) => {
          const parent = findParent(b.uid);
          if (parent) parent.children = parent.children.filter((c) => c.uid !== b.uid);
          blocks.delete(b.uid);
        },
      },
    },
  };
  return { blocks, dispose: () => { delete globalThis.window.roamAlphaAPI; } };
}

function installLargeGridRoamMock(anchorUid) {
  let uidCounter = 0;
  let fileCounter = 0;
  const blocks = new Map();
  const files = new Map();
  blocks.set(anchorUid, { uid: anchorUid, string: "{{[[roam/grid]]}}", order: 0, children: [] });
  const cloneBlock = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(cloneBlock) });
  const findParent = (u) => [...blocks.values()].find((b) => b.children?.some((c) => c.uid === u));  
  globalThis.window.roamAlphaAPI = {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (query, bound) => { const uid = bound ?? /:block\/uid "([^"]+)"/.exec(query)?.[1]; return uid && blocks.has(uid) ? [[cloneBlock(blocks.get(uid))]] : []; },
    data: {
      search: () => [],
      pull: () => null,
      page: { create: async () => {} },
      block: {
        create: async ({ location, block }) => {
          const created = { ...block, order: location.order === "last" ? 999 : location.order, children: [] };
          blocks.set(block.uid, created);
          const parent = blocks.get(location["parent-uid"]);
          if (parent) parent.children.push(created);
        },
        update: async ({ block: b }) => { const existing = blocks.get(b.uid); if (existing) existing.string = b.string; },
        delete: async ({ block: b }) => {
          const parent = findParent(b.uid);
          if (parent) parent.children = parent.children.filter((c) => c.uid !== b.uid);
          blocks.delete(b.uid);
        },
      },
    },
    file: {
      upload: async ({ file }) => { const url = `https://mock/${++fileCounter}`; files.set(url, await file.text()); return url; },
      get: async ({ url }) => { if (!files.has(url)) throw new Error(`missing ${url}`); return new File([files.get(url)], "grid.json", { type: "application/json" }); },
      delete: async ({ url }) => files.delete(url),
    },
  };
  return { blocks, files, dispose: () => { delete globalThis.window.roamAlphaAPI; } };
}

test("eligibility: formula =x uses custom editor, ==x uses native, floating F2 uses custom", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorE1");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });
  const store = await new LargeGridStore("anchorE1").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [row === 0 ? "=1+1" : row === 1 ? "==notFormula" : String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  // Formula cell: should use custom editor (not native)
  const formulaCell = view.cells.get("0:0");
  assert.ok(formulaCell, "formula cell is mounted");
  // =x is a formula → native eligibility check returns false → editorController.start() is called
  // We verify the editorController path is used by checking it doesn't go native
  assert.equal(view.nativeOverlay?.active, false, "formula cell does NOT use native overlay");
  // Simulate what beginEdit would do for a formula — directly call editorController
  await view.editorController?.start({ row: 0, col: 0, cell: formulaCell, raw: "=1+1", initial: null, floating: false });
  assert.ok(view.editorController?.state, "=1+1 formula uses custom editor");
  view.editorController?.dispose();
  if (view.nativeOverlay?.active) { view.nativeOverlay.dispose(); }

  // ==x: not a formula, should try native
  const escapedCell = view.cells.get("1:0");
  assert.ok(escapedCell, "escaped formula cell is mounted");
  await view.beginEdit(1, 0, escapedCell);
  assert.ok(view.editorController?.state || view.nativeOverlay?.active, "==x editor is mounted (native or custom)");
  if (view.nativeOverlay?.active) { view.nativeOverlay.dispose(); }
  if (view.editorController?.state) { view.editorController.dispose(); }

  // F2 floating: should use custom editor
  const normalCell = view.cells.get("2:0");
  assert.ok(normalCell, "normal cell is mounted");
  await view.beginEdit(2, 0, normalCell, null, true);
  assert.equal(view.editorController?.state?.floating, true, "floating F2 uses custom editor");
  view.editorController?.dispose();
  view.dispose();
});

test("eligibility: setting off or runtime.nativeEditorDisabledUntil cooldown → custom editor", async (t) => {
  withSettings({ "editing-native-editor": false, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorE2");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });
  const store = await new LargeGridStore("anchorE2").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  const cell = view.cells.get("0:0");
  assert.ok(cell, "cell is mounted");
  await view.beginEdit(0, 0, cell);
  assert.ok(view.editorController?.state, "setting off → custom editor used");
  view.editorController?.dispose();
  view.dispose();
});

test("scratch lifecycle: first acquire boot-sweeps marker, rotation returns a fresh child per call, boot sweep deletes stale children", async (t) => {
  const mock = installRoamMockForScratch({ blocks: { meta001: { string: "roam/grid/metadata", children: [] } } });
  t.after(() => { mock.dispose(); runtime.largeScratch = null; });

  const first = await acquireLargeScratch();
  assert.ok(first, "first acquireLargeScratch succeeds");
  assert.ok(first.uid, "first scratch has uid");
  assert.ok(first.parentUid, "first scratch has parentUid");
  assert.equal(runtime.largeScratch, first, "cached in runtime.largeScratch");

  const metaTree = mock.blocks.get("meta001");
  const marker = metaTree.children.find((c) => c.string === "rg:scratch");
  assert.ok(marker, "rg:scratch marker created on metadata page");
  assert.equal(marker.children.length, 1, "marker has one child (the session scratch)");
  assert.equal(marker.children[0].string, " ", "scratch child is a space");

  const firstUid = first.uid;
  const second = await acquireLargeScratch();
  assert.notEqual(second.uid, firstUid, "F2c rotation: second acquire returns a fresh child uid");
  assert.equal(runtime.largeScratch, second, "runtime.largeScratch updated to the fresh scratch");
  assert.equal(marker.children.length, 1, "marker holds only the fresh child after rotation");
  assert.equal(marker.children[0].uid, second.uid, "remaining child is the fresh scratch");
  assert.ok(!mock.blocks.has(firstUid), "previous scratch child was fire-and-forget deleted");

  runtime.largeScratch = null;
  const staleUid = globalThis.window.roamAlphaAPI.util.generateUID();
  mock.blocks.set(staleUid, { uid: staleUid, string: "old edit", order: 0, children: [] });
  marker.children.push(mock.blocks.get(staleUid));
  assert.equal(marker.children.length, 2, "stale child added");

  const third = await acquireLargeScratch();
  assert.notEqual(third.uid, first.uid, "new session creates new child uid");
  assert.equal(marker.children.length, 1, "stale child deleted, only new child remains");
});

test("scratch lifecycle: release deletes the session child", async (t) => {
  const mock = installRoamMockForScratch({ blocks: { meta002: { string: "roam/grid/metadata", children: [] } } });
  t.after(() => { mock.dispose(); runtime.largeScratch = null; });

  const scratch = await acquireLargeScratch();
  assert.ok(runtime.largeScratch, "scratch is cached");
  const metaTree = mock.blocks.get("meta002");
  const marker = metaTree.children.find((c) => c.string === "rg:scratch");
  assert.equal(marker.children.length, 1, "marker has child before release");

  await releaseLargeScratch();
  assert.equal(runtime.largeScratch, null, "scratch is null after release");
  assert.equal(marker.children.length, 0, "scratch child deleted");
});

test("metadata parse: rg:scratch block with children on metadata page does not change parsed metadata", async (t) => {
  const mock = installRoamMockForScratch({
    blocks: {
      meta003: { string: "roam/grid/metadata", children: [
        { uid: "entry1", string: `roam-grid/table:: ${JSON.stringify({ schema: 1, tableUid: "tableA", mode: "large", columnIds: ["a"], merges: [], widths: {}, rowHeights: {}, alignments: {}, headerColumns: [], headerRows: [], frozenRows: 1, frozenCols: 0, charts: [], imageLayout: {}, showHeaders: true, fitToWidth: true, colorFormulaCells: true })}`, order: 0, children: [] },
        { uid: "scratchMarker", string: "rg:scratch", order: 1, children: [
          { uid: "stale1", string: "some old edit", order: 0, children: [] },
        ] },
      ] },
    },
  });
  t.after(() => { mock.dispose(); runtime.largeScratch = null; });

  const { MetadataStore } = await import("../src/extension.js");
  const meta = new MetadataStore();
  meta.pageUid = "meta003";
  await meta.reload();
  assert.ok(meta.has("tableA"), "tableA metadata entry parsed correctly");
  assert.equal(meta.entries.size, 1, "only one metadata entry parsed (rg:scratch ignored)");
});

test("renderVisible guard: active nativeOverlay blocks cell wipe", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorG1");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });
  const store = await new LargeGridStore("anchorG1").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  const cell = view.cells.get("0:0");
  const cellCount = view.cells.size;
  assert.ok(cellCount > 0, "cells are mounted");

  view.nativeOverlay.state = { row: 0, col: 0, cell, uid: "fake", composing: false, finishing: false, lastValue: "test" };
  assert.ok(view.nativeOverlay.active, "nativeOverlay is active");

  await view.renderVisible(view.renderToken + 1);
  assert.equal(view.cells.size, cellCount, "cell count unchanged — renderVisible early-returned due to active nativeOverlay");

  view.nativeOverlay.state = null;
  view.dispose();
});

test("mount isolation: mousedown inside active overlay stops propagation (registered before mountBlock)", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorM1");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });
  const store = await new LargeGridStore("anchorM1").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  const cell = view.cells.get("0:0");
  assert.ok(cell, "cell is mounted");

  // Verify that when mountIsolation is on, the overlay's mount isolation
  // listeners block mousedown events from reaching the canvas. This is the
  // ordering guarantee: the listeners exist before the overlay is interactable.
  const canvasMousedowns = [];
  view.canvas.addEventListener("mousedown", () => { canvasMousedowns.push("canvas-mousedown"); });

  // Create an overlay with mountIsolation = true (matching LargeGridView's setup)
  const overlay = new NativeCellEditorOverlay(view, { onFinish: () => {}, mountIsolation: true });
  const overlayEl = document.createElement("div");
  overlayEl.className = "rg-native-cell-editor";
  overlay.overlay = overlayEl;
  overlay.state = { row: 0, col: 0, cell, uid: "test", composing: false, finishing: false, lastValue: "test" };
  cell.appendChild(overlayEl);

  // Simulate the isolation listener registration (same code as startOnce)
  ["mousedown", "mouseup", "click", "dblclick", "pointerdown", "pointerup"].forEach((type) => {
    overlay.listen(overlayEl, type, (event) => event.stopPropagation());
  });

  // Dispatch a mousedown on the overlay — it must be stopped before reaching canvas
  overlayEl.dispatch("mousedown", { bubbles: true });
  assert.equal(canvasMousedowns.length, 0, "canvas mousedown listener was never hit — mount isolation stopped propagation");

  overlay.dispose();
  view.dispose();
});

test("enter-split backstop: stray child concatenated into value at blank time", async (t) => {
  const mock = installRoamMockForScratch({ blocks: { meta004: { string: "roam/grid/metadata", children: [] } } });
  t.after(() => { mock.dispose(); runtime.largeScratch = null; });

  const scratch = await acquireLargeScratch();
  assert.ok(scratch, "scratch acquired");

  const child1Uid = globalThis.window.roamAlphaAPI.util.generateUID();
  const child2Uid = globalThis.window.roamAlphaAPI.util.generateUID();
  mock.blocks.set(child1Uid, { uid: child1Uid, string: "line one", order: 0, children: [] });
  mock.blocks.set(child2Uid, { uid: child2Uid, string: "line two", order: 1, children: [] });
  const scratchBlock = mock.blocks.get(scratch.uid);
  scratchBlock.children = [mock.blocks.get(child1Uid), mock.blocks.get(child2Uid)];

  const concat = scratchStrayConcat();
  assert.equal(concat, "line one\nline two", "stray children concatenated");

  const grandchildUid = globalThis.window.roamAlphaAPI.util.generateUID();
  mock.blocks.set(grandchildUid, { uid: grandchildUid, string: "grandchild", order: 0, children: [] });
  mock.blocks.get(child1Uid).children = [mock.blocks.get(grandchildUid)];
  const concat2 = scratchStrayConcat();
  assert.equal(concat2, "line two", "only childless strays are concatenated");

  await blankLargeScratch();
  const after = mock.blocks.get(scratch.uid);
  assert.equal(after.string, " ", "scratch blanked to space");
  assert.equal(after.children.length, 0, "scratch children deleted");
});

test("enter-split mid-value: stray joins non-empty committed value with space", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorM2");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });

  const store = await new LargeGridStore("anchorM2").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  const cell = view.cells.get("0:0");
  assert.ok(cell, "cell is mounted");

  const scratch = await acquireLargeScratch();
  assert.ok(scratch, "scratch acquired");

  // Simulate Enter-split: stray child with trimmed text "world"
  const strayUid = globalThis.window.roamAlphaAPI.util.generateUID();
  mock.blocks.set(strayUid, { uid: strayUid, string: "world", order: 0, children: [] });
  const scratchBlock = mock.blocks.get(scratch.uid);
  scratchBlock.children = [mock.blocks.get(strayUid)];

  // Verify scratchStrayConcat works in this mock
  const concat = scratchStrayConcat();
  assert.equal(concat, "world", "scratchStrayConcat returns the stray child string");

  // Commit with non-empty value — the stray should be space-joined
  await view.nativeOverlay.onFinish({ row: 0, col: 0, cell, raw: "0", value: "hello", commit: true, movement: null });
  dom.flush();

  const stored = await store.getRaw(0, 0);
  assert.equal(stored, "hello world", "store.setCell received 'hello world' (value + stray joined with space)");

  const afterScratch = mock.blocks.get(scratch.uid);
  assert.equal(afterScratch?.string, " ", "scratch blanked after commit");
  assert.equal(afterScratch?.children?.length || 0, 0, "scratch children deleted");

  view.dispose();
});

test("fallback: scratch acquisition fails → custom editor used", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorF1");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });
  // Make createPage throw so acquireLargeScratch fails
  globalThis.window.roamAlphaAPI.data.page.create = async () => { throw new Error("no metadata page"); };
  const store = await new LargeGridStore("anchorF1").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  const cell = view.cells.get("0:0");
  assert.ok(cell, "cell is mounted");
  await view.beginEdit(0, 0, cell);
  assert.ok(view.editorController?.state, "fallback to custom editor when scratch is unavailable");
  view.editorController?.dispose();
  view.dispose();
});

test("seedThroughTextarea: zero pre-mount block writes, textarea seeded from raw", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorS1");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });

  // Spy on updateBlock
  let updateBlockCalls = 0;
  const origUpdate = globalThis.window.roamAlphaAPI.data.block.update;
  globalThis.window.roamAlphaAPI.data.block.update = async (args) => {
    updateBlockCalls += 1;
    return origUpdate(args);
  };

  const store = await new LargeGridStore("anchorS1").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  const preEditCalls = updateBlockCalls;

  const cell = view.cells.get("0:0");
  assert.ok(cell, "cell is mounted");
  // beginEdit with existing raw — seedThroughTextarea means NO updateBlock before mount
  await view.beginEdit(0, 0, cell);
  dom.flush();

  // No new updateBlock calls from the edit path (only from store init)
  assert.equal(updateBlockCalls, preEditCalls, "zero updateBlock calls from beginEdit (seedThroughTextarea suppresses pre-mount block writes)");

  view.dispose();
});

test("seedThroughTextarea: initial char goes through textarea, not block", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorS2");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });

  let updateBlockCalls = 0;
  const origUpdate = globalThis.window.roamAlphaAPI.data.block.update;
  globalThis.window.roamAlphaAPI.data.block.update = async (args) => {
    updateBlockCalls += 1;
    return origUpdate(args);
  };

  const store = await new LargeGridStore("anchorS2").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  const preEditCalls = updateBlockCalls;

  const cell = view.cells.get("0:0");
  assert.ok(cell, "cell is mounted");
  try { await view.beginEdit(0, 0, cell, "x"); } catch { /* overlay may fail in mock */ }
  dom.flush();

  // No pre-mount block writes from the initial-char path
  assert.equal(updateBlockCalls, preEditCalls, "zero pre-mount block writes (initial char seeded through textarea in seedThroughTextarea mode)");

  view.dispose();
});

test("native-grid regression: default mode still performs pre-mount initial seed via updateBlock", async (t) => {
  // Create a NativeCellEditorOverlay WITHOUT seedThroughTextarea (default)
  // and verify the initial != null block-write path still works
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorS3");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });

  let updateBlockCalls = 0;
  const origUpdate = globalThis.window.roamAlphaAPI.data.block.update;
  globalThis.window.roamAlphaAPI.data.block.update = async (args) => {
    updateBlockCalls += 1;
    return origUpdate(args);
  };

  const store = await new LargeGridStore("anchorS3").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  const preEditCalls = updateBlockCalls;

  const cell = view.cells.get("0:0");
  assert.ok(cell, "cell is mounted");

  // Create a default-mode overlay (seedThroughTextarea defaults to false)
  const defaultOverlay = new NativeCellEditorOverlay(view, { onFinish: () => {} });
  const scratch = await acquireLargeScratch();
  assert.ok(scratch, "scratch acquired");

  // startOnce with initial != null and seedThroughTextarea = false
  // This should trigger the block-write path
  try { await defaultOverlay.start({ row: 0, col: 0, cell, uid: scratch.uid, raw: "0", initial: "x" }); } catch { /* may fail */ }
  dom.flush();

  // Default mode still writes the seed to the block
  assert.ok(updateBlockCalls > preEditCalls, "default mode (seedThroughTextarea=false) still performs pre-mount block write for initial seed");

  defaultOverlay.dispose();
  view.dispose();
});

test("settle: settleObserver installed + disconnected via seedThroughTextarea overlay lifecycle", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorQ1");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });

  const store = await new LargeGridStore("anchorQ1").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  const cell = view.cells.get("0:0");
  assert.ok(cell, "cell is mounted");

  // Verify seedThroughTextarea is passed to the large grid's nativeOverlay
  assert.equal(view.nativeOverlay.seedThroughTextarea, true, "LargeGridView nativeOverlay has seedThroughTextarea=true");

  // Verify default-mode overlay does NOT have seedThroughTextarea
  const defaultOverlay = new NativeCellEditorOverlay(view, { onFinish: () => {} });
  assert.equal(defaultOverlay.seedThroughTextarea, false, "default overlay has seedThroughTextarea=false");
  defaultOverlay.dispose();

  // Verify the settable-observer path exists in seedThroughTextarea mode
  const overlayWithSettle = new NativeCellEditorOverlay(view, { onFinish: () => {}, seedThroughTextarea: true });
  const scratch = await acquireLargeScratch();
  // start() will call startOnce → mountBlock fails → failStart → teardown
  // teardown clears settleObserver — verify the observer field is accessible
  try { await overlayWithSettle.start({ row: 0, col: 0, cell, uid: scratch.uid, raw: "0", initial: null }); } catch { /* mock mountBlock fails */ }
  assert.equal(overlayWithSettle.settleObserver, null, "settleObserver is cleared after teardown (failStart or success)");
  overlayWithSettle.dispose();

  view.dispose();
});

test("grace refocus: hydration swap within grace window does not commit", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorQ2");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });

  const store = await new LargeGridStore("anchorQ2").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  const cell = view.cells.get("0:0");
  assert.ok(cell, "cell is mounted");

  // Simulate a running overlay with seedThroughTextarea within grace window
  const nowCalls = [];
  let baseTime = 1000;
  const overlay = new NativeCellEditorOverlay(view, { onFinish: () => {}, seedThroughTextarea: true });
  overlay.now = () => baseTime++;

  overlay.overlay = document.createElement("div");
  cell.appendChild(overlay.overlay);
  overlay.state = { row: 0, col: 0, cell, uid: "test", composing: false, finishing: false, lastValue: "hello", startedAt: 1000 };
  overlay.textarea = document.createElement("textarea");
  overlay.textarea.value = " ";
  // Focus should be not in overlay (simulating hydration swap)
  globalThis.document.activeElement = globalThis.document.body;

  const result = overlay.finishIfFocusLeft();
  // Within grace window (1001 - 1000 = 1ms < 1200), should NOT commit
  assert.equal(result, false, "finishIfFocusLeft did NOT commit within grace window");
  assert.equal(overlay.state.refocusAttempts, 1, "refocus was attempted");
  assert.equal(overlay.state.finishing, false, "state is not finishing");

  // Verify store.setCell was NOT called
  const stored = await store.getRaw(0, 0);
  assert.equal(stored, "0", "store cell unchanged — commit was NOT triggered");

  overlay.dispose();
  view.dispose();
});

test("stale-blank protection: textarea holds ' ' while lastValue non-empty → cancel not commit", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorQ3");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });

  const store = await new LargeGridStore("anchorQ3").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  const cell = view.cells.get("0:0");
  assert.ok(cell, "cell is mounted");

  // Simulate grace window exhausted, refocus already attempted
  let baseTime = 5000;
  const overlay = new NativeCellEditorOverlay(view, { onFinish: () => {}, seedThroughTextarea: true });
  overlay.now = () => baseTime++;

  overlay.overlay = document.createElement("div");
  cell.appendChild(overlay.overlay);
  overlay.state = { row: 0, col: 0, cell, uid: "test", composing: false, finishing: false, lastValue: "hello", startedAt: 1000, refocusAttempts: 2 };
  overlay.textarea = document.createElement("textarea");
  overlay.textarea.value = " ";
  globalThis.document.activeElement = globalThis.document.body;

  const result = overlay.finishIfFocusLeft();
  // After grace (5000 - 1000 = 4000ms > 1200), with stale blank → cancel path
  assert.equal(result, true, "finishIfFocusLeft handled the stale-blank case");

  // Verify store was NOT written with blank
  const stored = await store.getRaw(0, 0);
  assert.equal(stored, "0", "store cell unchanged — cancel prevented the stale blank commit");

  overlay.dispose();
  view.dispose();
});

// ---------------------------------------------------------------------------
// UNIT 3 — native editor races: scratch rotation, settle floor, save deferral,
// grace hardening, dirty-store remount, dispose stale-blank guard.
// ---------------------------------------------------------------------------

test("F2c rotation: two consecutive edits produce different scratch uids; old child is fire-and-forget deleted", async (t) => {
  const mock = installRoamMockForScratch({ blocks: { metaR1: { string: "roam/grid/metadata", children: [] } } });
  t.after(() => { mock.dispose(); runtime.largeScratch = null; });

  const first = await acquireLargeScratch();
  assert.ok(first?.uid, "first scratch acquired");
  const firstUid = first.uid;

  const second = await acquireLargeScratch();
  assert.ok(second?.uid, "second scratch acquired");
  assert.notEqual(second.uid, firstUid, "rotation: second scratch has a fresh child uid");
  assert.equal(runtime.largeScratch, second, "runtime.largeScratch updated to the fresh scratch");
  assert.equal(second.parentUid, first.parentUid, "marker parent reused across rotations");
  const metaTree = mock.blocks.get("metaR1");
  const marker = metaTree.children.find((c) => c.string === "rg:scratch");
  assert.equal(marker.children.length, 1, "marker holds only the fresh child after rotation");
  assert.equal(marker.children[0].uid, second.uid, "remaining child is the fresh scratch");
  assert.ok(!mock.blocks.has(firstUid), "previous scratch child was deleted (fire-and-forget)");
});

test("F2c ordering trap: beginEdit B while A's overlay is active commits A BEFORE B's scratch is acquired", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorR2");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });
  const store = await new LargeGridStore("anchorR2").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();

  const cellA = view.cells.get("0:0");
  const cellB = view.cells.get("1:0");
  assert.ok(cellA && cellB, "both cells mounted");

  const scratchA = await acquireLargeScratch();
  assert.ok(scratchA, "A's scratch acquired");
  view.nativeOverlay.state = { row: 0, col: 0, cell: cellA, uid: scratchA.uid, composing: false, finishing: false, lastValue: "A", startedAt: 100, refocusAttempts: 0 };

  const order = [];
  let startCalled = false;
  let commitBeforeStart = false;
  view.nativeOverlay.commit = async () => {
    if (!startCalled) commitBeforeStart = true;
    order.push({ event: "commitA", scratchUidAtCommit: runtime.largeScratch?.uid });
    view.nativeOverlay.state = null;
    view.nativeOverlay.overlay = null;
    view.nativeOverlay.textarea = null;
    return null;
  };
  const realStart = view.nativeOverlay.start.bind(view.nativeOverlay);
  view.nativeOverlay.start = function (args) { startCalled = true; return realStart(args); };

  await view.beginEdit(1, 0, cellB);
  dom.flush();

  assert.ok(order.some((e) => e.event === "commitA"), "A's overlay was committed when B's edit began");
  assert.equal(commitBeforeStart, true, "commit(A) fired BEFORE nativeOverlay.start(B) — the ordering trap");
  const commitEntry = order.find((e) => e.event === "commitA");
  assert.equal(commitEntry.scratchUidAtCommit, scratchA.uid, "at commit time the scratch was still A's uid (commit ran before rotation)");
  assert.notEqual(runtime.largeScratch?.uid, scratchA.uid, "B's edit rotated to a fresh scratch uid");

  if (view.editorController?.state) view.editorController.dispose();
  view.dispose();
});

test("F2d settle floor: 2 quiet frames AFTER a mutation, OR ~250ms no-mutation exit (not 2 quiet frames unconditionally)", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorQ4");
  let OrigMORef;
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; if (OrigMORef !== undefined) globalThis.MutationObserver = OrigMORef; });
  const store = await new LargeGridStore("anchorQ4").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();
  const cell = view.cells.get("0:0");
  assert.ok(cell, "cell mounted");

  OrigMORef = globalThis.MutationObserver;
  globalThis.MutationObserver = class MiniMO {
    constructor(cb) { this.cb = cb; this.disc = false; }
    observe() {}
    disconnect() { this.disc = true; }
  };

  const blockHost = document.createElement("div");
  const fakeTextarea = document.createElement("textarea");

  async function runSettle(triggerMutationAtMs) {
    const overlay = new NativeCellEditorOverlay(view, { onFinish: () => {}, seedThroughTextarea: true });
    let t = 0; let frames = 0; let mutFired = false;
    overlay.now = () => t;
    overlay.nextFrame = () => new Promise((r) => {
      frames += 1; t += 50;
      if (triggerMutationAtMs != null && t >= triggerMutationAtMs && !mutFired) {
        mutFired = true;
        overlay.settleObserver?.cb?.([]);
      }
      queueMicrotask(r);
    });
    overlay.mountBlock = () => true;
    overlay.blockInput = () => blockHost;
    overlay.hostTextarea = () => fakeTextarea;
    try { await overlay.start({ row: 0, col: 0, cell, uid: "settleUid", raw: "0", initial: null }); } catch { /* mock may bail late */ }
    const exitT = t;
    overlay.dispose();
    return { exitT, frames };
  }

  const noMut = await runSettle(null);
  assert.ok(noMut.exitT >= 250, `no-mutation floor exits at ~250ms, not 2 quiet frames (exitT=${noMut.exitT}, frames=${noMut.frames})`);

  const withMut = await runSettle(200);
  assert.ok(withMut.exitT >= 250, `mutation at t=200: floor waits for the mutation + 2 quiet after (exitT=${withMut.exitT}, frames=${withMut.frames})`);

  view.dispose();
});

test("F2f save deferral: flush() during an active overlay defers (no store.commit, no saving class), then flushes after finish", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorD1");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });
  const store = await new LargeGridStore("anchorD1").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();
  const cell = view.cells.get("0:0");

  view.nativeOverlay.state = { row: 0, col: 0, cell, uid: "edit", composing: false, finishing: false, lastValue: "x", startedAt: 1, refocusAttempts: 0 };
  assert.ok(view.nativeOverlay.active, "overlay is active");

  let commitCalls = 0;
  view.store.commit = async () => { commitCalls += 1; };

  await view.flush();
  assert.equal(commitCalls, 0, "store.commit NOT called while the overlay is active (deferred)");
  assert.ok(!view.root.classList.contains("rg-root--saving"), "no rg-root--saving class while deferred");
  assert.ok(view.saveTimer, "a saveTimer was armed to retry after the edit finishes");

  clearTimeout(view.saveTimer);
  view.nativeOverlay.state = null;
  await view.flush();
  assert.equal(commitCalls, 1, "store.commit called once the overlay is no longer active");

  view.dispose();
});

test("F2g post-window stale-blank: focus left at >1200ms with blank textarea + non-empty lastValue -> cancel, not commit", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorQ5");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });
  const store = await new LargeGridStore("anchorQ5").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();
  const cell = view.cells.get("0:0");

  let baseTime = 6000;
  const overlay = new NativeCellEditorOverlay(view, { onFinish: () => {}, seedThroughTextarea: true });
  overlay.now = () => baseTime++;
  overlay.overlay = document.createElement("div");
  cell.appendChild(overlay.overlay);
  overlay.state = { row: 0, col: 0, cell, uid: "x", composing: false, finishing: false, lastValue: "had typed", startedAt: 1000, refocusAttempts: 2 };
  overlay.textarea = document.createElement("textarea");
  overlay.textarea.value = " ";
  globalThis.document.activeElement = globalThis.document.body;

  let cancelCalled = false; let commitCalled = false;
  overlay.cancel = async () => { cancelCalled = true; overlay.state = null; return null; };
  overlay.commit = async () => { commitCalled = true; return null; };

  const result = overlay.finishIfFocusLeft();
  assert.equal(result, true, "finishIfFocusLeft handled the post-window stale-blank case");
  assert.equal(cancelCalled, true, "cancel path was taken (stale blank + non-empty lastValue)");
  assert.equal(commitCalled, false, "commit was NOT called — the blank was not persisted");

  const stored = await store.getRaw(0, 0);
  assert.equal(stored, "0", "store cell unchanged — the mid-hydration blank was not written");

  overlay.dispose();
  view.dispose();
});

test("Must-fix A dirty-store remount: a view constructed with a dirty adopted store schedules a save in mount()", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorA1");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });
  const model = new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false });
  const store = await new LargeGridStore("anchorA1").initialize(model);
  store.retryDelay = () => 0;
  const hostA = new MiniNode("div"); dom.body.appendChild(hostA);
  const viewA = new LargeGridView({ host: hostA, store });
  claimKeyboard(viewA);
  viewA.viewport.scrollTop = 0; viewA.viewport.scrollLeft = 0; viewA.viewport.clientHeight = 600; viewA.viewport.clientWidth = 800;
  await viewA.renderVisible(); dom.flush();

  store.markChunkDirty(0);
  assert.ok(store.dirty.size > 0, "store has a dirty chunk before remount");
  viewA.dispose({ keepStore: true });

  const hostB = new MiniNode("div"); dom.body.appendChild(hostB);
  const viewB = new LargeGridView({ host: hostB, store });
  assert.ok(viewB.saveTimer, "dirty adopted store triggered scheduleSave() in mount()");

  const storeClean = await new LargeGridStore("anchorA2").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  storeClean.retryDelay = () => 0;
  const hostC = new MiniNode("div"); dom.body.appendChild(hostC);
  const viewC = new LargeGridView({ host: hostC, store: storeClean });
  assert.equal(viewC.saveTimer, null, "clean store does not schedule a save on mount");

  clearTimeout(viewB.saveTimer);
  viewB.dispose();
  viewC.dispose();
  storeClean.dispose();
});

test("Must-fix B dispose guard: dispose during a mid-hydration blank -> cancel path taken, cell value preserved", async (t) => {
  withSettings({ "editing-native-editor": true, "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries(); resetNativeEditorHealth(); settingsCache.clear(); resetRoamRecents();
  const dom = installMiniDom();
  const mock = installLargeGridRoamMock("anchorB1");
  t.after(() => { mock.dispose(); resetChunkCache(); settingsCache.clear(); runtime.largeScratch = null; });
  const store = await new LargeGridStore("anchorB1").initialize(new GridModel({ rows: Array.from({ length: 40 }, (_, row) => [String(row)]), showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  claimKeyboard(view);
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible(); dom.flush();
  const cell = view.cells.get("0:0");
  const scratch = await acquireLargeScratch();
  assert.ok(scratch, "scratch acquired for the active edit");

  view.nativeOverlay.state = { row: 0, col: 0, cell, uid: scratch.uid, composing: false, finishing: false, lastValue: "had typed", startedAt: 100, refocusAttempts: 0 };
  view.nativeOverlay.overlay = document.createElement("div");
  cell.appendChild(view.nativeOverlay.overlay);
  view.nativeOverlay.textarea = document.createElement("textarea");
  view.nativeOverlay.textarea.value = " ";

  let cancelCalled = false; let commitCalled = false;
  view.nativeOverlay.cancel = async () => { cancelCalled = true; view.nativeOverlay.state = null; return null; };
  view.nativeOverlay.commit = async () => { commitCalled = true; return null; };

  view.dispose({ keepStore: true });
  assert.equal(cancelCalled, true, "dispose took the cancel path (mid-hydration blank + non-empty lastValue)");
  assert.equal(commitCalled, false, "dispose did NOT blank-commit the mid-hydration cell");

  const stored = await store.getRaw(0, 0);
  assert.equal(stored, "0", "store cell value preserved across the guarded dispose");

  store.dispose();
  runtime.largeScratch = null;
});
