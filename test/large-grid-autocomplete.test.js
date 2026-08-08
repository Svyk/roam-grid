import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel, LargeGridStore, LargeGridView, claimKeyboard,
  ensureRuntimeRegistries, refreshSettingsCache, resetChunkCache,
  resetRoamRecents, resetSuggestionRendering, settingsCache,
} from "../src/extension.js";

const NO_STORAGE = { getItem: () => null, setItem: () => {} };

function withSettings(values) {
  refreshSettingsCache({ settings: { getAll: () => ({ ...values }) } }, NO_STORAGE);
}

class MiniClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) {
    const next = force == null ? !this.values.has(value) : Boolean(force);
    if (next) this.values.add(value); else this.values.delete(value);
    return next;
  }
  contains(value) { return this.values.has(value); }
}

class MiniStyle {
  constructor() { this.values = new Map(); this.writeCount = 0; }
  setProperty(name, value) { this.values.set(name, String(value)); this.writeCount += 1; }
  getPropertyValue(name) { return this.values.get(name) || ""; }
  removeProperty(name) { this.values.delete(name); }
}

class MiniNode {
  constructor(tagName = "#text", text = "") {
    this.tagName = tagName.toUpperCase(); this.parentNode = null; this.children = []; this.listeners = new Map();
    this.classList = new MiniClassList(); this.style = new MiniStyle(); this.dataset = {}; this.hidden = false; this._text = text;
    this.value = ""; this.selectionStart = 0; this.selectionEnd = 0;
  }
  set className(value) { this._className = value; this.classList = new MiniClassList(); String(value).split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name)); }
  get className() { return this._className || ""; }
  set textContent(value) { this._text = String(value ?? ""); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join("") : this._text; }
  get childNodes() { return this.children; }
  get parentElement() { return this.parentNode?.tagName === "#TEXT" ? null : this.parentNode; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(typeof node === "string" ? new MiniNode("#text", node) : node)); }
  appendChild(node) { if (node.parentNode) node.remove(); node.parentNode = this; this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children.forEach((node) => { node.parentNode = null; }); this.children = []; this.append(...nodes); }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter((node) => node !== this); this.parentNode = null; }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
  matches(selector) { return String(selector).split(",").some((part) => { const value = part.trim(); return value.startsWith(".") && this.classList.contains(value.slice(1)); }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) { if (child.matches?.(selector)) found.push(child); found.push(...child.querySelectorAll(selector)); }
    return found;
  }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter((value) => value !== listener)); }
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
  setRangeText(text, start, end, mode) {
    this.value = `${this.value.slice(0, start)}${text}${this.value.slice(end)}`;
    const caret = start + text.length;
    if (mode === "end") this.setSelectionRange(caret, caret);
  }
  getBoundingClientRect() { return { left: 100, right: 240, top: 120, bottom: 154, width: 140, height: 34 }; }
  get isConnected() { for (let current = this; current; current = current.parentNode) if (current === globalThis.document?.body) return true; return false; }
  prepend(...nodes) {
    nodes.forEach((node) => {
      if (typeof node === "string") node = new MiniNode("#text", node);
      if (node.parentNode) node.remove();
      node.parentNode = this;
      this.children.unshift(node);
    });
  }
  getContentDiv() { return { innerHTML: this.innerHTML || "" }; }
  get innerHTML() { return this.children.map((child) => child.tagName === "#text" ? child._text : `<${child.tagName.toLowerCase()}>`).join(""); }
  insertAdjacentElement(pos, node) {
    if (pos === "afterbegin") { this.prepend(node); return node; }
    if (pos === "beforeend") { this.appendChild(node); return node; }
    return node;
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
    const index = lane?.indexOf(listener) ?? -1;
    if (index >= 0) lane.splice(index, 1);
  };
  globalThis.document = {
    body, documentElement: { clientWidth: 1024 }, activeElement: null,
    createElement: (name) => new MiniNode(name), createTextNode: (text) => new MiniNode("#text", text),
    querySelector: (selector) => body.querySelector(selector),
    addEventListener: addTo(documentListeners), removeEventListener: removeFrom(documentListeners),
  };
  globalThis.innerWidth = 1024;
  globalThis.window = { addEventListener: addTo(windowListeners), removeEventListener: removeFrom(windowListeners), dispatchEvent() { return true; } };
  const frames = [];
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  return { body, flush: () => { while (frames.length) frames.shift()(); } };
}

function installRoamMock(anchorUid) {
  let uidCounter = 0;
  let fileCounter = 0;
  const blocks = new Map();
  const files = new Map();

  blocks.set(anchorUid, { uid: anchorUid, string: "{{[[roam/grid]]}}", order: 0, children: [] });

  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  globalThis.window.roamAlphaAPI = {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (query, bound) => { const uid = bound ?? /:block\/uid "([^"]+)"/.exec(query)?.[1]; return uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []; },
    data: {
      search: () => [],
      pull: () => null,
      page: { create: async () => {} },
      block: {
        create: async ({ location, block }) => {
          const created = { ...block, order: location.order === "last" ? 999 : location.order, children: [] };
          blocks.set(block.uid, created);
          blocks.get(location["parent-uid"]).children.push(created);
        },
        update: async ({ block }) => { blocks.get(block.uid).string = block.string; },
      },
    },
    file: {
      upload: async ({ file }) => { const url = `https://mock/${++fileCounter}`; files.set(url, await file.text()); return url; },
      get: async ({ url }) => { if (!files.has(url)) throw new Error(`missing ${url}`); return new File([files.get(url)], "grid.json", { type: "application/json" }); },
      delete: async ({ url }) => files.delete(url),
    },
  };
}

async function mountLargeTestView(dom, anchorUid) {
  installRoamMock(anchorUid);
  const store = await new LargeGridStore(anchorUid).initialize(
    new GridModel({ rows: Array.from({ length: 80 }, (_, row) => [String(row), `v${row}`]), showHeaders: false })
  );
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  const origWindow = globalThis.window;
  const listenerMap = new Map();
  globalThis.window = { ...origWindow, addEventListener: (t, l) => { if (!listenerMap.has(t)) listenerMap.set(t, []); listenerMap.get(t).push(l); }, removeEventListener: () => {} };
  claimKeyboard(view);
  const disposeOwnership = () => { globalThis.window = origWindow; };
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible();
  dom.flush();
  return { view, disposeOwnership };
}

test("beginEdit detach race: editingPending lock prevents renderVisible from clearing cells during floating edit", async (t) => {
  withSettings({ "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries();
  settingsCache.clear();
  resetSuggestionRendering();
  resetRoamRecents();
  const dom = installMiniDom();
  const { view, disposeOwnership } = await mountLargeTestView(dom, "anchor501");
  t.after(() => { disposeOwnership(); view.dispose(); resetChunkCache(); settingsCache.clear(); resetRoamRecents(); });

  const cell = view.cells.get("1:0");
  assert.ok(cell, "cell 1:0 is mounted after renderVisible");
  assert.equal(cell.isConnected, true, "cell is connected to the DOM");

  // Pre-fix bug: the await in getRaw (even for a cached chunk, loadChunk is async)
  // yields to the microtask queue, allowing a scheduled renderVisible to run
  // cells.clear() and detach the cell before editorController.start() sets state.
  // The lock prevents both: peekRaw reads synchronously, and editingPending blocks
  // any concurrent renderVisible.
  const p = view.beginEdit(1, 0, cell, "x", true);
  view.scheduleRender();
  dom.flush();
  await p;

  assert.equal(view.editingPending, false, "editingPending is cleared after beginEdit");
  const state = view.editorController?.state;
  assert.ok(state, "editorController.state is set after beginEdit");
  assert.equal(state.cell.isConnected, true, "the cell is still connected — renderVisible was blocked");
  assert.equal(view.cells.get("1:0"), state.cell, "the view still holds the same cell DOM node");

  // Position verifies isConnected — a detached cell would bail here and keep the popover hidden.
  view.editorController.position();
  assert.equal(view.editorController.popover.hidden, false, "popover shows for floating edit — position() stamped it");

  await view.editorController.finish(false);
});

test("beginEdit with uncached chunk does NOT hold editingPending (cache-miss)", async (t) => {
  withSettings({ "large-chunk-rows": 40, "large-overscan-rows": 0 });
  ensureRuntimeRegistries();
  settingsCache.clear();
  resetSuggestionRendering();
  resetRoamRecents();
  const dom = installMiniDom();
  const { view, disposeOwnership } = await mountLargeTestView(dom, "anchor502");
  t.after(() => { disposeOwnership(); view.dispose(); resetChunkCache(); settingsCache.clear(); resetRoamRecents(); });

  const chunkIndex = view.store.chunkIndexForRow(5);
  view.store.cache.delete(chunkIndex);
  assert.equal(view.store.cache.has(chunkIndex), false, "chunk is evicted");

  const cell = view.cells.get("5:0");
  assert.ok(cell, "cell 5:0 is mounted");

  assert.equal(view.editingPending, false, "no pending edit before beginEdit");
  const p = view.beginEdit(5, 0, cell, "x");
  // FIX-2: cache-miss does NOT set editingPending, so renderVisible can proceed
  assert.equal(view.editingPending, false, "editingPending is NOT set for cache-miss beginEdit");

  // renderVisible can proceed while the download is in flight
  view.scheduleRender();
  dom.flush();

  await p;
  assert.equal(view.editingPending, false, "editingPending cleared after beginEdit");
  assert.ok(view.editorController?.state, "editorController.state set");

  await view.editorController.finish(false);
});
