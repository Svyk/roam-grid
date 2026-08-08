import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel,
  GridView,
  LargeGridStore,
  LargeGridView,
  claimKeyboard,
  ensureRuntimeRegistries,
  installKeyboardOwnership,
  keyboardOwner,
  recentsCacheReady,
  recentsDisabled,
  resetChunkCache,
  resetRoamRecents,
  resetSuggestionRendering,
  settingsCache,
  warmRecentsCache,
} from "../src/extension.js";

/**
 * GOAL-U3 — the bare-opener regression net. Every test here mounts a REAL view (native `GridView`
 * for tier-1, `LargeGridView` for tier-2 over a real seeded `LargeGridStore`), types a bare `[[` /
 * `((` through the view's own key path, and asserts the menu PORTAL appears in `document.body` with
 * rows — so a v0.8.2-style regression (bare opener produces silence) fails these tests outright.
 * Unit-level recents semantics live in recents-warm.test.js / recents-budget.test.js and are not
 * re-asserted here; what is pinned here is the per-tier DOM behavior end to end.
 */

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
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  getPropertyValue(name) { return this.values.get(name) || ""; }
  removeProperty(name) { this.values.delete(name); }
}

/** editor-dom's MiniNode plus the two things the real views need: `prepend` (cell content) and tag
 *  selectors in `matches` (`view.onKeydown` guards on `"textarea,input"`). */
class MiniNode {
  constructor(tagName = "#text", text = "") {
    this.tagName = String(tagName).toUpperCase(); this.parentNode = null; this.children = []; this.listeners = new Map();
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
  prepend(...nodes) { for (const node of [...nodes].reverse()) this.children.unshift(typeof node === "string" ? new MiniNode("#text", node) : (node.parentNode = this, node)); }
  replaceChildren(...nodes) { this.children.forEach((node) => { node.parentNode = null; }); this.children = []; this.append(...nodes); }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter((node) => node !== this); this.parentNode = null; }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
  matches(selector) {
    return String(selector).split(",").some((part) => {
      const value = part.trim();
      if (value.startsWith(".")) return this.classList.contains(value.slice(1));
      return this.tagName === value.toUpperCase();
    });
  }
  closest(selector) { for (let current = this; current; current = current.parentNode) if (current.matches?.(selector)) return current; return null; }
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
}

/**
 * Window listeners keep capture and bubble lanes, because the non-leak claim IS the lanes: the
 * extension's one keydown listener is capture-phase, Roam's document handlers are bubble-phase, and
 * `fireKeydown` models capture → target → bubble with real stopPropagation semantics. A "Roam
 * handler" in a test is just a listener on the bubble lane.
 */
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
  const fireKeydown = (target, fields = {}) => {
    const event = {
      type: "keydown", target, key: "", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, isComposing: false,
      defaultPrevented: false, propagationStopped: false, immediateStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() { this.immediateStopped = true; this.propagationStopped = true; },
      ...fields,
    };
    const lanes = windowListeners.get("keydown") || { capture: [], bubble: [] };
    for (const listener of [...lanes.capture]) { listener(event); if (event.propagationStopped) return event; }
    for (let node = target; node; node = node.parentNode) {
      for (const listener of [...(node.listeners?.get("keydown") || [])]) { listener(event); if (event.propagationStopped) return event; }
      if (node === body) break;
    }
    for (const listener of [...lanes.bubble]) { listener(event); if (event.propagationStopped) return event; }
    return event;
  };
  return { body, fireKeydown, flush: () => { while (frames.length) frames.shift()(); } };
}

const waitForSearch = () => new Promise((resolve) => setTimeout(resolve, 2));
const tick = async (times = 10) => { for (let index = 0; index < times; index += 1) await Promise.resolve(); };

const PAGE_ROWS = [["Older Page", "pageold12", 10], ["Newest Page", "pagenew12", 90]];
/** Two of these uids belong to the native fixture's own cells; the third is an outsider. */
const BLOCK_ROWS = [["owncell001", "mine", 99], ["blkother12", "a block somewhere else", 50], ["owncell002", "also mine", 98]];
const SEARCH_HITS = [{ "node.title": "Searched Page", "block.uid": "pagesearched" }];

/**
 * One roamAlphaAPI per test serving recents, typed search, and (for the large tier) store traffic.
 * The recents counters discriminate on the query text itself — the enrichment pass also carries
 * `:node/title`, so a naive match would fold it into the recents count and "a warm cache answers
 * without a second query" would stop meaning that.
 */
function installReferenceApi() {
  const counts = { page: 0, block: 0, search: 0 };
  globalThis.window.roamAlphaAPI = {
    util: { generateUID: () => "uid000001" },
    q: (query) => {
      if (/\?title \?uid \?time/.test(query)) { counts.page += 1; return PAGE_ROWS; }
      if (/\?uid \?string \?time/.test(query)) { counts.block += 1; return BLOCK_ROWS; }
      return [];
    },
    data: {
      search: () => { counts.search += 1; return SEARCH_HITS; },
      pull: () => null,
      page: { create: async () => {} },
      block: { create: async () => {}, update: async () => {} },
    },
  };
  return counts;
}

/** The first opener character arrives as a real keydown through the view's own handler — the way a
 *  keystroke over a selected cell behaves — and the rest as textarea input, the editor-dom idiom. */
async function typeOpener(dom, view, controller, opener) {
  const first = dom.fireKeydown(view.root, { key: opener[0] });
  assert.equal(first.defaultPrevented, true, "the view claims the opener's first keystroke");
  await tick(); dom.flush();
  const editor = controller.state?.editor;
  assert.ok(editor, `typing "${opener[0]}" opened the cell editor`);
  editor.value = opener;
  editor.setSelectionRange(opener.length, opener.length);
  editor.dispatch("input");
  dom.flush(); await waitForSearch(); dom.flush();
  return editor;
}

const menuRowText = (controller) => controller.suggestionList.children.map((row) => row.textContent);

/** The regression-relevant assertion: not "a function returned rows" but a visible portal, attached
 *  to `document.body`, whose list holds the expected rows. A dead autocomplete fails every line. */
function assertMenuOpen(controller, expected, label) {
  assert.equal(controller.popover.hidden, false, `${label}: the popover shows`);
  assert.equal(controller.popover.isConnected, true, `${label}: the portal is in document.body`);
  assert.equal(controller.suggestionList.hidden, false, `${label}: the list shows`);
  assert.ok(controller.suggestionList.children.length > 0, `${label}: the list has rows`);
  assert.equal(controller.suggestionKind, "roam-reference", `${label}: the reference menu, not the function list`);
  const text = menuRowText(controller);
  for (const expectedText of expected) assert.ok(text.some((row) => row.includes(expectedText)), `${label}: a row shows "${expectedText}"`);
}

function setup(t) {
  const dom = installMiniDom();
  ensureRuntimeRegistries();
  resetRoamRecents(); settingsCache.clear(); resetSuggestionRendering();
  // A 0ms debounce keeps the suite on real timers without 90ms of dead waiting per opener; the
  // cold/warm debounce distinction itself is editor-dom's territory.
  settingsCache.set("editing-autocomplete-debounce-ms", 0);
  t.after(() => { resetRoamRecents(); settingsCache.clear(); resetSuggestionRendering(); });
  return dom;
}

/** Tier-1: a real native GridView whose model carries cell uids, so own-table filtering is live. */
async function mountNative(t, dom) {
  const model = new GridModel({
    rows: [[{ uid: "owncell001", raw: "mine" }, { uid: "owncell002", raw: "also mine" }], ["plain", ""]],
    columnIds: ["a", "b"],
    tableUid: "table-a",
  });
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new GridView({ host, model, adapter: {} });
  const disposeOwnership = installKeyboardOwnership();
  claimKeyboard(view);
  t.after(() => { disposeOwnership(); view.dispose(); });
  return { view, controller: view.editorController };
}

/** Tier-2: a real LargeGridView over a real seeded store, chunk-integrity's harness idiom. */
async function mountLarge(t, dom, anchorUid) {
  settingsCache.set("editing-native-editor", false);
  const blocks = new Map(); const files = new Map();
  blocks.set(anchorUid, { uid: anchorUid, string: "{{[[roam/grid]]}}", order: 0, children: [] });
  let uidCounter = 0; let fileCounter = 0;
  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  const referenceQ = globalThis.window.roamAlphaAPI.q;
  globalThis.window.roamAlphaAPI = {
    ...globalThis.window.roamAlphaAPI,
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (query, bound) => {
      if (/\?title \?uid \?time/.test(query) || /\?uid \?string \?time/.test(query)) return referenceQ(query);
      const uid = bound ?? /:block\/uid "([^"]+)"/.exec(query)?.[1];
      return uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : [];
    },
    file: {
      upload: async ({ file }) => { const url = `https://mock/${++fileCounter}`; files.set(url, await file.text()); return url; },
      get: async ({ url }) => { if (!files.has(url)) throw new Error(`missing ${url}`); return new File([files.get(url)], "grid.json", { type: "application/json" }); },
      delete: async ({ url }) => files.delete(url),
    },
  };
  const store = await new LargeGridStore(anchorUid).initialize(new GridModel({ rows: [["a0", "b0"], ["a1", "b1"], ["a2", "b2"]], showHeaders: false }));
  store.retryDelay = () => 0;
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const view = new LargeGridView({ host, store });
  const disposeOwnership = installKeyboardOwnership();
  claimKeyboard(view);
  t.after(() => { disposeOwnership(); view.dispose(); resetChunkCache(); });
  // A zero-size mini viewport renders no cells; give it a window and render once, synchronously.
  view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0; view.viewport.clientHeight = 600; view.viewport.clientWidth = 800;
  await view.renderVisible();
  dom.flush();
  return { view, controller: view.editorController };
}

const TIERS = [
  { label: "tier-1 native grid", mount: mountNative },
  { label: "tier-2 large grid", mount: (t, dom) => mountLarge(t, dom, "anchor301") },
];

for (const tier of TIERS) {
  test(`${tier.label}: a bare [[ and (( open the reference menu — one cold inline fetch each, then warm opens are free`, async (t) => {
    const dom = setup(t);
    const counts = installReferenceApi();
    const { view, controller } = await tier.mount(t, dom);

    // Cold [[: the first opener of the session pays one inline pages fetch and still opens.
    await typeOpener(dom, view, controller, "[[");
    assert.equal(counts.page, 1, "a cold bare [[ pays exactly one inline pages fetch");
    assertMenuOpen(controller, ["Newest Page", "Older Page"], "tier cold [[");
    assert.equal(recentsCacheReady("page"), true);
    await controller.finish(false);

    // Cold ((: the block type caches separately, so this pays its own one fetch.
    await typeOpener(dom, view, controller, "((");
    assert.equal(counts.block, 1, "a cold bare (( pays exactly one inline blocks fetch");
    assertMenuOpen(controller, ["a block somewhere else"], "tier cold ((");
    await controller.finish(false);

    // Warm: a background warm populates the cache, and the next opener spends NO inline fetch.
    resetRoamRecents();
    assert.equal(warmRecentsCache(), true);
    assert.equal(recentsCacheReady("page"), true);
    const spent = counts.page;
    await typeOpener(dom, view, controller, "[[");
    assert.equal(counts.page, spent, "a warm cache opens the menu without an inline fetch");
    assertMenuOpen(controller, ["Newest Page", "Older Page"], "tier warm [[");
    await controller.finish(false);
  });

  test(`${tier.label}: two consecutive over-budget inline fetches disarm; a fresh cache still opens and a typed query still searches`, async (t) => {
    const dom = setup(t);
    const counts = installReferenceApi();
    const { view, controller } = await tier.mount(t, dom);
    const realPerformance = globalThis.performance; const realInfo = console.info;
    console.info = () => {}; // the transition messages are recents-budget.test.js's assertion, not this file's
    let reading = 0;
    globalThis.performance = { now: () => (reading += 500) }; // every inline fetch measures 500ms, over the 250ms budget
    t.after(() => { globalThis.performance = realPerformance; console.info = realInfo; });

    // First over-budget fetch: the gate holds (one slow fetch can be a GC pause) and the rows —
    // already paid for — still open the menu.
    await typeOpener(dom, view, controller, "[[");
    assertMenuOpen(controller, ["Newest Page"], "first slow [[");
    assert.equal(recentsDisabled(), false, "one over-budget fetch does not disarm");
    await controller.finish(false);

    // Second consecutive over-budget inline fetch (the other opener's cache is cold, so it queries).
    await typeOpener(dom, view, controller, "((");
    assertMenuOpen(controller, ["a block somewhere else"], "second slow ((");
    assert.equal(recentsDisabled(), true, "two consecutive over-budget inline fetches disarm");
    await controller.finish(false);

    // Disarmed with a fresh cache: the menu opens from what is already paid for, no new query.
    const pageFetches = counts.page;
    await typeOpener(dom, view, controller, "[[");
    assert.equal(counts.page, pageFetches, "a disarmed gate runs no new recents query against a fresh cache");
    assertMenuOpen(controller, ["Newest Page", "Older Page"], "disarmed warm [[");
    assert.equal(recentsDisabled(), true, "a cache hit does not re-arm — only a fetch at budget does");

    // Disarmed with a TYPED query: the search path is not gated at all.
    const editor = controller.state.editor;
    editor.value = "[[Sea"; editor.setSelectionRange(5, 5); editor.dispatch("input");
    dom.flush(); await waitForSearch(); dom.flush();
    assert.equal(counts.search, 1, "a typed query still reaches Roam search while disarmed");
    assertMenuOpen(controller, ["Searched Page"], "typed query while disarmed");
    await controller.finish(false);
  });

  test(`${tier.label}: keystrokes never reach Roam's document-level handlers, menu open or closed`, async (t) => {
    const dom = setup(t);
    installReferenceApi();
    const { view, controller } = await tier.mount(t, dom);
    const roam = []; // stands in for Roam's bubble-phase document handlers
    globalThis.window.addEventListener("keydown", (event) => roam.push(event.key));
    assert.equal(keyboardOwner()?.view, view, "the mounted view owns the keyboard");

    // Menu absent: a printable key over the grid opens the editor, and the event stops at the view.
    const opened = dom.fireKeydown(view.root, { key: "x" });
    assert.equal(opened.defaultPrevented, true);
    assert.deepEqual(roam, [], "nothing leaked with no menu");
    await tick(); dom.flush();
    const editor = controller.state?.editor;
    assert.ok(editor, "the keystroke opened the editor");
    assert.equal(editor.value, "x");

    // Menu open: arrows drive the menu, characters the textarea — Roam sees neither.
    editor.value = "[["; editor.setSelectionRange(2, 2); editor.dispatch("input");
    dom.flush(); await waitForSearch(); dom.flush();
    assertMenuOpen(controller, ["Newest Page", "Older Page"], "keyboard [[");
    assert.equal(controller.suggestionIndex, 0);
    dom.fireKeydown(editor, { key: "ArrowDown" });
    assert.equal(controller.suggestionIndex, 1, "the menu owned the arrow key");
    dom.fireKeydown(editor, { key: "q" });
    assert.deepEqual(roam, [], "nothing leaked with the menu open");
    assert.equal(keyboardOwner()?.view, view, "ownership survived the whole exchange");
    await controller.finish(false);
  });
}

test("tier-1 native: a bare (( filters the table's own cells out of recent blocks", async (t) => {
  const dom = setup(t);
  installReferenceApi();
  const { view, controller } = await mountNative(t, dom);
  await typeOpener(dom, view, controller, "((");
  assertMenuOpen(controller, ["a block somewhere else"], "native ((");
  assert.deepEqual(controller.suggestions.map((row) => row.uid), ["blkother12"], "owncell001/owncell002 belong to this table and are filtered");
  assert.ok(!menuRowText(controller).some((row) => row.includes("mine") || row.includes("also mine")), "no own-cell text shows");
  await controller.finish(false);
});

test("tier-2 large: a bare (( keeps every recent block — JSON cells have no uids to exclude", async (t) => {
  const dom = setup(t);
  installReferenceApi();
  const { view, controller } = await mountLarge(t, dom, "anchor302");
  await typeOpener(dom, view, controller, "((");
  assert.equal(controller.currentTableUids(), null, "a large grid contributes no exclusions");
  assert.deepEqual(controller.suggestions.map((row) => row.uid), ["owncell001", "owncell002", "blkother12"], "the same fixture tier-1 filters, tier-2 keeps whole");
  await controller.finish(false);
});
