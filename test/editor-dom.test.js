import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FormulaEngine, GridEditorController, GridModel, GridView, NativeCellEditorOverlay, NativeGridSession, RegistrySet, claimKeyboard, formulaCanPointReference, keyboardOwner, moveFormulaReferenceCoordinate, nativeEditorEnabled, nativeOverlayStrayRepair, paintRichCellContent, queryBlockReferenceSources, recentsCacheReady, recentsDisabled, releaseKeyboard, releaseRichCellHosts, renderStableCellContent, replaceGridViewportContents, resetNativeEditorHealth, resetRoamRecents, resetSuggestionRendering, roamSuggestionPlainText, runtime, sanitizeNativePasteText, searchRoamRecentSuggestions, settingsCache, syncPortalThemeFromRoot, wrapSelectionOnPair } from "../src/extension.js";

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
}

function installMiniDom({ getStyle = null, MutationObserverClass = null, matchMedia = null } = {}) {
  const body = new MiniNode("body");
  const documentElement = { clientWidth: 1024 };
  globalThis.document = { body, documentElement, activeElement: null, createElement: (name) => new MiniNode(name), createTextNode: (text) => new MiniNode("#text", text), querySelector: (selector) => body.querySelector(selector) };
  globalThis.innerWidth = 1024;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  if (getStyle) globalThis.getComputedStyle = getStyle; else delete globalThis.getComputedStyle;
  if (MutationObserverClass) globalThis.MutationObserver = MutationObserverClass; else delete globalThis.MutationObserver;
  if (matchMedia) globalThis.matchMedia = matchMedia; else delete globalThis.matchMedia;
  const frames = [];
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  return { body, flush: () => { while (frames.length) frames.shift()(); } };
}

function makeController(options = {}, domOptions = {}) {
  const dom = installMiniDom(domOptions);
  const root = new MiniNode("section"); root.className = "rg-root"; dom.body.appendChild(root);
  const cells = new Map();
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) {
    const cell = new MiniNode("div"); cell.dataset.row = String(row); cell.dataset.col = String(col); root.appendChild(cell); cells.set(`${row}:${col}`, cell);
  }
  const finishes = [];
  const { view: viewExtra = null, ...controllerOptions } = options;
  const controller = new GridEditorController({ root, ...viewExtra }, {
    viewport: null,
    dimensions: () => ({ rowCount: 3, colCount: 3 }),
    cellAt: (row, col) => cells.get(`${row}:${col}`) || null,
    mountedCells: () => cells.values(),
    onFinish: async (value) => { finishes.push(value); },
    ...controllerOptions,
  });
  return { ...dom, root, cells, finishes, controller };
}

test("F2-style floating editing owns one body textarea and focuses at caret end", async () => {
  const { controller, cells, flush } = makeController();
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "hello", floating: true });
  flush();
  assert.equal(editor, controller.input);
  assert.equal(editor.parentNode.parentNode, controller.popover);
  assert.equal(globalThis.document.activeElement, editor);
  assert.equal(editor.selectionStart, 5);
  assert.equal(editor.selectionEnd, 5);
  assert.equal(controller.popover.hidden, false);
  assert.equal(controller.address.textContent, "A1");
  assert.equal(controller.suggestionList.hidden, true);
  assert.equal(editor.getAttribute("aria-expanded"), "false");
  await controller.finish(false);
  controller.dispose();
});

test("ordinary inline text has no assistant while inline formulas show fx and function help", async () => {
  const { controller, cells, flush } = makeController();
  let editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "ordinary text", floating: false });
  flush();
  assert.equal(controller.popover.hidden, true);
  assert.equal(controller.popover.getAttribute("aria-hidden"), "true");
  assert.equal(controller.address.textContent, "A1");
  await controller.finish(false);

  editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "=SU", floating: false });
  flush();
  assert.equal(controller.popover.hidden, false);
  assert.equal(controller.address.textContent, "fx  A1");
  assert.equal(controller.popover.dataset.mode, "formula");
  assert.equal(controller.suggestionList.hidden, false);
  assert.equal(controller.suggestionList.getAttribute("role"), "listbox");
  assert.equal(editor.getAttribute("aria-expanded"), "true");
  assert.equal(controller.suggestionList.children[0].getAttribute("role"), "option");
  assert.equal(controller.suggestionList.children[0].getAttribute("aria-selected"), "true");
  assert.equal(editor.getAttribute("aria-activedescendant"), controller.suggestionList.children[0].id);
  controller.dispose();
});

test("portal palette copies resolved grid colors and skips unchanged writes", () => {
  const { body } = installMiniDom();
  const root = new MiniNode("section"); root.className = "rg-root";
  const header = new MiniNode("div"); header.className = "rg-header";
  const status = new MiniNode("div"); status.className = "rg-status";
  root.append(header, status); body.appendChild(root);
  const portal = new MiniNode("div"); body.appendChild(portal);
  const style = (values) => ({ getPropertyValue: (name) => values[name] || "" });
  const getStyle = (element) => element === root ? style({
    "background-color": "rgb(31, 43, 52)", color: "rgb(245, 248, 250)", "border-top-color": "rgb(91, 103, 112)",
    "--rg-active": "rgb(72, 175, 240)", "--rg-success": "rgb(15, 153, 96)", "--rg-warning": "rgb(217, 130, 43)", "--rg-danger": "rgb(219, 55, 55)",
  }) : element === header ? style({ "background-color": "rgb(48, 64, 77)" }) : style({ color: "rgb(171, 179, 191)" });
  const first = syncPortalThemeFromRoot(root, portal, getStyle);
  assert.equal(first.changed, true);
  assert.equal(portal.style.getPropertyValue("--rg-portal-bg"), "rgb(31, 43, 52)");
  assert.equal(portal.style.getPropertyValue("--rg-portal-color"), "rgb(245, 248, 250)");
  assert.equal(portal.style.getPropertyValue("--rg-portal-border"), "rgb(91, 103, 112)");
  assert.equal(portal.style.getPropertyValue("--rg-portal-header"), "rgb(48, 64, 77)");
  assert.equal(portal.style.getPropertyValue("--rg-portal-status"), "rgb(171, 179, 191)");
  assert.equal(portal.classList.contains("rg-portal"), true);
  const writes = portal.style.writeCount;
  assert.equal(syncPortalThemeFromRoot(root, portal, getStyle).changed, false);
  assert.equal(portal.style.writeCount, writes);
});

test("portal palette reuses the grid theme cache without computed-style reads", () => {
  const { body } = installMiniDom();
  const root = new MiniNode("section"); root.className = "rg-root";
  root.__rgGridPalette = {
    "--rg-bg": "rgb(41, 55, 66)",
    "--rg-color": "rgb(245, 248, 250)",
    "--rg-header": "rgb(48, 64, 77)",
    "--rg-border": "rgb(91, 103, 112)",
    "--rg-muted": "rgb(171, 179, 191)",
    "--rg-active": "rgb(72, 175, 240)",
  };
  const portal = new MiniNode("div"); body.append(root, portal);
  let computedReads = 0;
  const result = syncPortalThemeFromRoot(root, portal, () => { computedReads += 1; return {}; });
  assert.equal(result.changed, true);
  assert.equal(computedReads, 0);
  assert.equal(portal.style.getPropertyValue("--rg-portal-bg"), "rgb(41, 55, 66)");
  assert.equal(portal.style.getPropertyValue("--rg-portal-header"), "rgb(48, 64, 77)");
  assert.equal(portal.style.getPropertyValue("--rg-portal-border"), "rgb(91, 103, 112)");
});

test("no-owner portals leave inline palette unset so Blueprint dark CSS remains authoritative", async () => {
  const { body } = installMiniDom(); body.className = "bp3-dark";
  const portal = new MiniNode("div"); body.appendChild(portal);
  let computedReads = 0;
  const result = syncPortalThemeFromRoot(null, portal, () => { computedReads += 1; return {}; });
  assert.deepEqual(result.values, {});
  assert.equal(result.changed, false);
  assert.equal(computedReads, 0);
  assert.equal(portal.classList.contains("rg-portal"), true);
  assert.equal(portal.style.getPropertyValue("--rg-portal-bg"), "");
  const css = await readFile(new URL("../extension.css", import.meta.url), "utf8");
  assert.match(css, /body\.bp3-dark \.rg-portal/);
  assert.match(css, /body\.rm-dark-theme \.rg-portal/);
});

test("persistent editor resyncs on host and OS theme changes, not input, and disposes listeners", async () => {
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; this.observed = []; observers.push(this); }
    observe(node, options) { this.observed.push({ node, options }); }
    disconnect() { this.disconnected = true; }
  }
  const schemeListeners = new Set(); let removedSchemeListeners = 0;
  const colorSchemeQuery = {
    addEventListener(type, listener) { if (type === "change") schemeListeners.add(listener); },
    removeEventListener(type, listener) { if (type === "change" && schemeListeners.delete(listener)) removedSchemeListeners += 1; },
  };
  const matchMedia = (query) => { assert.equal(query, "(prefers-color-scheme: dark)"); return colorSchemeQuery; };
  let dark = false; let computedReads = 0;
  const getStyle = () => {
    computedReads += 1;
    const values = dark
      ? { "background-color": "rgb(31, 43, 52)", color: "rgb(245, 248, 250)", "border-top-color": "rgb(91, 103, 112)" }
      : { "background-color": "rgb(255, 255, 255)", color: "rgb(24, 32, 38)", "border-top-color": "rgb(197, 203, 211)" };
    return { getPropertyValue: (name) => values[name] || "" };
  };
  const { controller, cells, flush } = makeController({}, { getStyle, MutationObserverClass: FakeMutationObserver, matchMedia });
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "plain", floating: true });
  flush();
  const readsAfterStart = computedReads;
  editor.value = "plain typing"; editor.dispatch("input"); flush();
  assert.equal(computedReads, readsAfterStart, "typing does not re-read computed theme styles");
  dark = true; observers[0].callback([{ type: "attributes", attributeName: "class" }]); flush();
  assert.ok(computedReads > readsAfterStart);
  assert.equal(controller.popover.style.getPropertyValue("--rg-portal-bg"), "rgb(31, 43, 52)");
  const schemeCallback = [...schemeListeners][0]; assert.equal(typeof schemeCallback, "function");
  const readsBeforeSchemeChange = computedReads;
  dark = false; schemeCallback({ matches: false }); flush();
  assert.ok(computedReads > readsBeforeSchemeChange);
  assert.equal(controller.popover.style.getPropertyValue("--rg-portal-bg"), "rgb(255, 255, 255)");
  controller.dispose();
  assert.equal(observers[0].disconnected, true);
  assert.equal(removedSchemeListeners, 1); assert.equal(schemeListeners.size, 0);
  const readsAfterDispose = computedReads;
  observers[0].callback([{ type: "attributes", attributeName: "class" }]); flush();
  schemeCallback({ matches: true }); flush();
  assert.equal(computedReads, readsAfterDispose);
});

test("formula assistant highlights references, locks with F4, and closes suggestions before edit", async () => {
  const { controller, cells, flush, finishes } = makeController();
  const editor = await controller.start({ row: 0, col: 2, cell: cells.get("0:2"), raw: "=SUM(A1:A2)", floating: true });
  flush();
  assert.equal(cells.get("0:0").classList.contains("rg-cell--formula-reference"), true);
  assert.equal(cells.get("1:0").classList.contains("rg-cell--formula-reference"), true);
  editor.setSelectionRange(editor.value.indexOf("A1") + 1, editor.value.indexOf("A1") + 1);
  controller.onKeydown({ key: "F4", preventDefault() {}, stopPropagation() {}, isComposing: false });
  flush();
  assert.equal(editor.value, "=SUM($A$1:$A$2)");

  editor.value = "=su"; editor.setSelectionRange(3, 3); editor.dispatch("input"); flush();
  assert.equal(controller.suggestionList.hidden, false);
  let suggestionPrevented = false;
  controller.onKeydown({ key: "ArrowDown", preventDefault() { suggestionPrevented = true; }, stopPropagation() {}, isComposing: false });
  assert.equal(suggestionPrevented, true);
  assert.equal(editor.value, "=su", "function autocomplete keeps arrow-key precedence while a name is being typed");
  controller.onKeydown({ key: "Escape", preventDefault() {}, stopPropagation() {}, isComposing: false });
  assert.ok(controller.state, "first Escape only dismisses autocomplete");
  controller.onKeydown({ key: "Escape", preventDefault() {}, stopPropagation() {}, isComposing: false });
  assert.equal(controller.state, null);
  assert.equal(finishes.at(-1).commit, false);
  controller.dispose();
});

/**
 * The regression guard for rendering rows through anything heavier than textContent: moving the
 * active index must repaint the active row, never rebuild the list. Node identity is the assertion
 * because a rebuilt row is a different object even when it looks identical.
 */
test("arrow-key suggestion navigation repaints the active row without rebuilding any row", async () => {
  const { controller, cells, flush } = makeController();
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "=co", floating: true });
  flush();
  assert.ok(controller.suggestions.length > 1, "navigation needs at least two rows to mean anything");
  const [first, second] = controller.suggestionList.children;
  assert.equal(first.getAttribute("aria-selected"), "true");

  controller.onKeydown({ key: "ArrowDown", preventDefault() {}, stopPropagation() {}, isComposing: false });
  assert.equal(controller.suggestionList.children[0], first, "ArrowDown must not rebuild row 0");
  assert.equal(controller.suggestionList.children[1], second, "ArrowDown must not rebuild row 1");
  assert.equal(controller.suggestionIndex, 1);
  assert.equal(second.getAttribute("aria-selected"), "true");
  assert.equal(second.classList.contains("rg-formula-suggestion--active"), true);
  assert.equal(first.getAttribute("aria-selected"), "false");
  assert.equal(first.classList.contains("rg-formula-suggestion--active"), false);
  assert.equal(editor.getAttribute("aria-activedescendant"), second.id);

  editor.dispatch("click"); flush();
  assert.equal(controller.suggestionList.children[0], first, "a repaint over an unchanged result set must not rebuild row 0");
  assert.equal(controller.suggestionList.children[1], second, "a repaint over an unchanged result set must not rebuild row 1");
  assert.equal(controller.suggestionIndex, 1, "and it must not lose the active row either");
  assert.equal(second.getAttribute("aria-selected"), "true");
  assert.equal(editor.getAttribute("aria-activedescendant"), second.id);

  controller.onKeydown({ key: "ArrowUp", preventDefault() {}, stopPropagation() {}, isComposing: false });
  assert.equal(controller.suggestionList.children[0], first, "ArrowUp must not rebuild row 0");
  assert.equal(controller.suggestionList.children[1], second, "ArrowUp must not rebuild row 1");
  assert.equal(controller.suggestionIndex, 0);
  assert.equal(first.getAttribute("aria-selected"), "true");
  assert.equal(first.classList.contains("rg-formula-suggestion--active"), true);
  assert.equal(second.getAttribute("aria-selected"), "false");
  assert.equal(editor.getAttribute("aria-activedescendant"), first.id);
  controller.dispose();
});

test("a changed result set does rebuild the rows, and accepting a suggestion drops the cached signature", async () => {
  const { controller, cells, flush } = makeController();
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "=co", floating: true });
  flush();
  const stale = controller.suggestionList.children[0];
  const staleSignature = controller.suggestionSignature;

  editor.value = "=av"; editor.setSelectionRange(3, 3); editor.dispatch("input"); flush();
  assert.notEqual(controller.suggestionSignature, staleSignature, "a different query is a different result set");
  assert.notEqual(controller.suggestionList.children[0], stale, "a changed result set must rebuild the rows");
  assert.equal(controller.suggestionList.children[0].textContent.startsWith("AVG"), true);

  const accepted = controller.suggestionList.children[0];
  controller.onKeydown({ key: "Enter", preventDefault() {}, stopPropagation() {}, isComposing: false });
  assert.equal(accepted.parentNode, null, "accepting tears the rows down through the dispose seam");
  assert.equal(controller.suggestionSignature, null, "a torn-down list must not look up to date to the next render");
  flush();
  assert.equal(controller.suggestionList.children.length, 0);
  assert.equal(controller.suggestionList.hidden, true);
  controller.dispose();
});

test("formula point mode builds a calculation with arrows, operators, and Enter", async () => {
  const revealed = [];
  const { controller, cells, flush, finishes } = makeController({
    revealReference: (row, col) => revealed.push([row, col]),
  });
  const inlineEditor = await controller.start({ row: 0, col: 2, cell: cells.get("0:2"), raw: "", initial: "=", floating: false });
  flush();

  let prevented = false;
  controller.onKeydown({ key: "ArrowLeft", shiftKey: false, preventDefault() { prevented = true; }, stopPropagation() {}, isComposing: false });
  flush();
  assert.equal(prevented, true);
  assert.equal(inlineEditor.parentNode, null, "keyboard pointing promotes the draft out of the virtualizable cell");
  assert.equal(controller.currentEditor(), controller.input);
  assert.equal(globalThis.document.activeElement, controller.input);
  assert.equal(controller.input.value, "=B1");
  assert.deepEqual(revealed, [[0, 1]]);
  assert.equal(cells.get("0:1").classList.contains("rg-cell--formula-reference"), true);
  assert.equal(controller.pointHint.hidden, false);

  controller.input.value += "+";
  controller.input.setSelectionRange(controller.input.value.length, controller.input.value.length);
  controller.input.dispatch("input");
  flush();
  controller.onKeydown({ key: "ArrowDown", shiftKey: false, preventDefault() {}, stopPropagation() {}, isComposing: false });
  flush();
  assert.equal(controller.input.value, "=B1+B2");
  assert.deepEqual(revealed, [[0, 1], [1, 1]]);
  assert.equal(cells.get("0:1").classList.contains("rg-cell--formula-reference"), true);
  assert.equal(cells.get("1:1").classList.contains("rg-cell--formula-reference"), true);

  controller.onKeydown({ key: "Enter", shiftKey: false, preventDefault() {}, stopPropagation() {}, isComposing: false });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(finishes.at(-1).commit, true);
  assert.equal(finishes.at(-1).value, "=B1+B2");
  assert.deepEqual(finishes.at(-1).movement, [1, 0]);
  controller.dispose();
});

test("formula point mode extends locked ranges and leaves ordinary caret arrows alone", async () => {
  assert.equal(formulaCanPointReference("=", 1), true);
  assert.equal(formulaCanPointReference("=SUM(", 5), true);
  assert.equal(formulaCanPointReference("=A1+", 4), true);
  assert.equal(formulaCanPointReference("=A1+2", 5), false);
  assert.equal(formulaCanPointReference('="text"', 7), false);
  const mergeAt = (row, col) => row === 0 && [1, 2].includes(col) ? { row: 0, col: 1, rowSpan: 1, colSpan: 2 } : null;
  assert.deepEqual(moveFormulaReferenceCoordinate({ row: 0, col: 0 }, [0, 1], { rowCount: 1, colCount: 4 }, mergeAt), { row: 0, col: 1 });
  assert.deepEqual(moveFormulaReferenceCoordinate({ row: 0, col: 1 }, [0, 1], { rowCount: 1, colCount: 4 }, mergeAt), { row: 0, col: 3 });
  assert.deepEqual(moveFormulaReferenceCoordinate({ row: 0, col: 2 }, [0, -1], { rowCount: 1, colCount: 4 }, mergeAt), { row: 0, col: 0 });

  const { controller, cells, flush } = makeController();
  await controller.start({ row: 0, col: 2, cell: cells.get("0:2"), raw: "=", floating: true });
  controller.onKeydown({ key: "ArrowLeft", shiftKey: false, preventDefault() {}, stopPropagation() {}, isComposing: false });
  flush();
  controller.onKeydown({ key: "ArrowDown", shiftKey: true, preventDefault() {}, stopPropagation() {}, isComposing: false });
  flush();
  assert.equal(controller.input.value, "=B1:B2");

  controller.onKeydown({ key: "F4", preventDefault() {}, stopPropagation() {}, isComposing: false });
  flush();
  assert.equal(controller.input.value, "=$B$1:$B$2");
  controller.onKeydown({ key: "ArrowDown", shiftKey: true, preventDefault() {}, stopPropagation() {}, isComposing: false });
  flush();
  assert.equal(controller.input.value, "=$B$1:$B$3");
  controller.input.value += "+C1";
  controller.input.setSelectionRange(controller.input.value.length - 1, controller.input.value.length - 1);
  controller.input.dispatch("click");
  let caretPrevented = false;
  controller.onKeydown({ key: "ArrowLeft", shiftKey: false, preventDefault() { caretPrevented = true; }, stopPropagation() {}, isComposing: false });
  assert.equal(caretPrevented, false, "clicking outside the pointed token returns arrows to caret editing");

  await controller.finish(false);
  await controller.start({ row: 0, col: 2, cell: cells.get("0:2"), raw: "=B1+2", floating: true });
  let prevented = false;
  controller.onKeydown({ key: "ArrowLeft", shiftKey: false, preventDefault() { prevented = true; }, stopPropagation() {}, isComposing: false });
  assert.equal(prevented, false);
  assert.equal(controller.input.value, "=B1+2");
  controller.dispose();
});

test("formula highlighting is bounded by mounted cells for huge ranges", async () => {
  const { body, flush } = installMiniDom();
  const root = new MiniNode("section"); body.appendChild(root);
  const cells = new Map(); let visits = 0;
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) {
    const cell = new MiniNode("div"); cell.dataset.row = String(row); cell.dataset.col = String(col); root.appendChild(cell); cells.set(`${row}:${col}`, cell);
  }
  const controller = new GridEditorController({ root }, {
    viewport: null,
    dimensions: () => ({ rowCount: 100_000, colCount: 26 }),
    cellAt: (row, col) => cells.get(`${row}:${col}`) || null,
    mountedCells: function* () { for (const cell of cells.values()) { visits += 1; yield cell; } },
    onFinish: async () => {},
  });
  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "=SUM(A1:Z100000)", floating: true });
  flush();
  assert.equal(visits, cells.size);
  assert.equal([...cells.values()].every((cell) => cell.classList.contains("rg-cell--formula-reference")), true);
  controller.dispose();
});

test("rich rendering keeps Roam output inside connected hosts and disposes stale roots", async () => {
  const { body } = installMiniDom();
  const content = new MiniNode("div"); body.appendChild(content);
  const pending = []; const rendered = []; const unmounted = [];
  globalThis.window.roamAlphaAPI = { ui: { components: {
    renderString: ({ el, string }) => {
      assert.equal(el.isConnected, true, "Roam renderer always receives a connected host");
      const output = new MiniNode("a", string); el.appendChild(output); rendered.push({ el, output, string });
      return new Promise((resolve) => pending.push(resolve));
    },
    unmountNode: ({ el }) => { unmounted.push(el); },
  } } };

  renderStableCellContent(content, { raw: "[[First]]", renderRich: paintRichCellContent });
  renderStableCellContent(content, { raw: "[[Second]]", renderRich: paintRichCellContent });
  assert.equal(rendered.length, 2);
  const firstHost = rendered[0].el; const secondHost = rendered[1].el;
  pending[1](); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(content.children, [secondHost]);
  assert.equal(rendered[1].output.parentNode, secondHost, "React-owned output is not transplanted");
  pending[0](); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(content.children, [secondHost], "late stale completion cannot replace the active host");
  assert.equal(firstHost.parentNode, null);

  renderStableCellContent(content, { raw: "plain" });
  assert.equal(content.textContent, "plain");
  assert.equal(secondHost.parentNode, null);
  assert.equal(unmounted.includes(firstHost), true);
  assert.equal(unmounted.includes(secondHost), true);
});

test("structural grid swaps preserve viewport identity and scroll while releasing rich roots", () => {
  const { body } = installMiniDom(); const unmounted = [];
  globalThis.window.roamAlphaAPI = { ui: { components: { unmountNode: ({ el }) => unmounted.push(el) } } };
  const viewport = new MiniNode("div"); viewport.scrollLeft = 41; viewport.scrollTop = 73; body.appendChild(viewport);
  const oldGrid = new MiniNode("div"); const content = new MiniNode("div"); content.className = "rg-cell-content";
  const richHost = new MiniNode("span"); content.__rgRichHosts = new Set([richHost]); content.appendChild(richHost); oldGrid.appendChild(content); viewport.appendChild(oldGrid);
  const nextGrid = new MiniNode("div"); const identity = viewport;
  assert.equal(replaceGridViewportContents(viewport, nextGrid), identity);
  assert.deepEqual(viewport.children, [nextGrid]);
  assert.equal(viewport.scrollLeft, 41); assert.equal(viewport.scrollTop, 73);
  assert.deepEqual(unmounted, [richHost]);
});

test("first grid mount skips layout-backed scroll reads", () => {
  installMiniDom();
  const viewport = new MiniNode("div");
  Object.defineProperty(viewport, "scrollLeft", { get() { throw new Error("scrollLeft forced layout"); }, set() {} });
  Object.defineProperty(viewport, "scrollTop", { get() { throw new Error("scrollTop forced layout"); }, set() {} });
  const nextGrid = new MiniNode("div");
  assert.equal(replaceGridViewportContents(viewport, nextGrid), viewport);
  assert.deepEqual(viewport.children, [nextGrid]);
});

test("virtual teardown releases every Roam-rendered host before canvas replacement", () => {
  const { body } = installMiniDom(); const unmounted = [];
  globalThis.window.roamAlphaAPI = { ui: { components: { unmountNode: ({ el }) => unmounted.push(el) } } };
  const canvas = new MiniNode("div"); body.appendChild(canvas);
  for (let index = 0; index < 2; index += 1) {
    const content = new MiniNode("div"); content.className = "rg-cell-content"; const host = new MiniNode("span");
    content.__rgRichHosts = new Set([host]); content.appendChild(host); canvas.appendChild(content);
  }
  releaseRichCellHosts(canvas); canvas.replaceChildren();
  assert.equal(unmounted.length, 2); assert.equal(canvas.children.length, 0);
});

test("a pending rich render cannot activate after its host becomes detached", async () => {
  const { body } = installMiniDom(); let resolveRender; const unmounted = [];
  globalThis.window.roamAlphaAPI = { ui: { components: {
    renderString: ({ el }) => new Promise((resolve) => { resolveRender = resolve; el.appendChild(new MiniNode("a", "result")); }),
    unmountNode: ({ el }) => unmounted.push(el),
  } } };
  const content = new MiniNode("div"); body.appendChild(content);
  renderStableCellContent(content, { raw: "[[Detached]]", renderRich: paintRichCellContent });
  const host = content.children[0]; content.remove(); resolveRender(); await Promise.resolve(); await Promise.resolve();
  assert.equal(host.parentNode, null); assert.deepEqual(unmounted, [host]);
});

test("native row deletion preserves surviving cell DOM and releases only deleted rich hosts", async () => {
  const { body } = installMiniDom(); const unmounted = [];
  globalThis.window.roamAlphaAPI = { ui: { components: { unmountNode: ({ el }) => unmounted.push(el) } } };
  const model = new GridModel({
    columnIds: ["col-a", "col-b"],
    rows: [
      [{ uid: "keep-rich", raw: "[[Keep]]" }, { uid: "formula", raw: "=A3" }],
      [{ uid: "remove-rich", raw: "[[Remove]]" }, { uid: "remove-plain", raw: "" }],
      [{ uid: "keep-value", raw: "9" }, { uid: "keep-formula", raw: "=LEN(A1)" }],
    ],
  });
  const root = new MiniNode("section"); const viewport = new MiniNode("div"); const grid = new MiniNode("div");
  viewport.scrollLeft = 37; viewport.scrollTop = 61; root.appendChild(viewport); viewport.appendChild(grid); body.appendChild(root);
  let viewportReplacements = 0;
  const originalReplaceChildren = viewport.replaceChildren.bind(viewport);
  viewport.replaceChildren = (...nodes) => { viewportReplacements += 1; originalReplaceChildren(...nodes); };
  const cells = new Map(); const coordinates = new Map(); const contents = new Map(); const richHosts = new Map();
  const formulaEngine = new FormulaEngine(model); formulaEngine.evaluateAll();
  for (let row = 0; row < model.rowCount; row += 1) for (let col = 0; col < model.colCount; col += 1) {
    const source = model.getCell(row, col); const cell = new MiniNode("div"); cell.className = "rg-cell";
    cell.dataset.uid = source.uid; cell.dataset.row = String(row); cell.dataset.col = String(col);
    const content = new MiniNode("div"); content.className = "rg-cell-content";
    const formula = source.raw.startsWith("=");
    content.dataset.rgRenderKey = formula ? `text:${formulaEngine.evaluateCell(row, col)}` : `${source.raw.includes("[[") ? "rich" : "text"}:${source.raw}`;
    if (source.raw.includes("[[")) {
      const host = new MiniNode("span"); content.__rgRichHosts = new Set([host]); content.appendChild(host); richHosts.set(source.uid, host);
    } else content.textContent = formula ? String(formulaEngine.evaluateCell(row, col)) : source.raw;
    cell.appendChild(content); grid.appendChild(cell); cells.set(`${row}:${col}`, cell); coordinates.set(source.uid, { row, col }); contents.set(source.uid, content);
  }
  const headers = new Map(); const resizes = new Map();
  for (let row = 0; row < model.rowCount; row += 1) {
    const rowUid = model.rowKey(row);
    const header = new MiniNode("div"); header.className = "rg-row-header"; header.dataset.row = String(row); header.dataset.rowUid = rowUid; header.textContent = String(row + 1);
    const resize = new MiniNode("span"); resize.className = "rg-row-resize"; resize.dataset.row = String(row); resize.dataset.rowUid = rowUid;
    grid.append(header, resize); headers.set(rowUid, header); resizes.set(rowUid, resize);
  }
  const status = new MiniNode("span"); const formulaPaints = []; let fullRenders = 0; let selectionUpdates = 0;
  const view = Object.assign(Object.create(GridView.prototype), {
    model, root, viewport, gridElement: grid, statusElement: status, cells, cellCoordinatesByUid: coordinates, formulaEngine,
    selection: { startRow: 2, endRow: 2, startCol: 0, endCol: 0 }, anchor: { row: 2, col: 0 },
    editorController: { state: null }, resizeCleanup: null, rowResizePreview: null, columnResizePreview: null, dragSelecting: false, fillStart: null,
    render: () => { fullRenders += 1; },
    renderCellValue: (_cell, row, col) => formulaPaints.push(model.getCell(row, col).uid),
    updateSelection: () => { selectionUpdates += 1; },
  });
  view.session = Object.assign(Object.create(NativeGridSession.prototype), {
    model, adapter: {}, tableUid: model.tableUid, views: new Set([view]),
    dirtyCells: new Map(), editRevisions: new Map(), markChanged() {},
  });
  const survivingCell = cells.get("2:0"); const survivingContent = contents.get("keep-value");
  const survivingRichHost = richHosts.get("keep-rich"); const removedRichHost = richHosts.get("remove-rich");
  globalThis.document.activeElement = survivingRichHost;

  const result = await GridView.prototype.applyPatch.call(view, { op: "deleteRows", index: 1, count: 1 });

  assert.equal(result.rows.length, 2); assert.equal(fullRenders, 0); assert.equal(viewportReplacements, 0);
  assert.equal(viewport.children[0], grid); assert.equal(viewport.scrollLeft, 37); assert.equal(viewport.scrollTop, 61);
  assert.equal(view.cells.get("1:0"), survivingCell); assert.equal(survivingCell.children[0], survivingContent);
  assert.equal(richHosts.get("keep-rich"), survivingRichHost); assert.equal(survivingRichHost.isConnected, true);
  assert.deepEqual(unmounted, [removedRichHost]); assert.equal(removedRichHost.parentNode, null);
  assert.equal(headers.get("keep-value").dataset.row, "1"); assert.equal(headers.get("keep-value").textContent, "2");
  assert.equal(resizes.get("keep-value").dataset.row, "1"); assert.equal(headers.get("remove-rich").parentNode, null); assert.equal(resizes.get("remove-rich").parentNode, null);
  assert.equal(model.getRaw(0, 1), "=A2"); assert.deepEqual(formulaPaints, ["formula"]);
  assert.equal(view.formulaEngine.invalidateCell(0, 0).has("1:1"), true, "unaffected formula dependencies survive coordinate shifts");
  assert.deepEqual(view.selection, { startRow: 1, endRow: 1, startCol: 0, endCol: 0 }); assert.deepEqual(view.anchor, { row: 1, col: 0 });
  assert.equal(selectionUpdates, 1); assert.equal(status.textContent, "2 × 2"); assert.equal(globalThis.document.activeElement, survivingRichHost);
});

test("row deletion fast path refuses custom renderer DOM before mutating it", () => {
  installMiniDom();
  const viewport = new MiniNode("div"); const grid = new MiniNode("div"); const sentinel = new MiniNode("div");
  viewport.appendChild(grid); grid.appendChild(sentinel);
  const view = Object.assign(Object.create(GridView.prototype), {
    model: new GridModel({ rows: [["A"], ["B"]] }), viewport, gridElement: grid,
    editorController: { state: null }, resizeCleanup: null, rowResizePreview: null, columnResizePreview: null, dragSelecting: false, fillStart: null,
    hasCustomCellRenderers: () => true,
  });
  assert.equal(GridView.prototype.patchRowDeletion.call(view, { viewport, gridElement: grid }), false);
  assert.equal(grid.children[0], sentinel); assert.equal(sentinel.parentNode, grid);
});

test("repositioned native cells and row controls resolve their current dataset coordinates", () => {
  installMiniDom();
  const model = new GridModel({ rows: [["A", "B"], ["C", "D"]], columnIds: ["a", "b"] });
  const selected = []; const edited = []; const committed = [];
  const view = {
    model,
    selection: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    root: new MiniNode("section"),
    renderCellValue() {},
    insertFormulaReference: () => false,
    select: (range) => selected.push(range),
    beginEdit: (row, col) => edited.push({ row, col }),
    commitMutation: (label, mutation) => { committed.push(label); mutation(); },
  };
  const cell = GridView.prototype.cellElement.call(view, 1, 0, null, new FormulaEngine(model), 1);
  cell.dataset.row = "0"; cell.dataset.col = "1"; cell.dispatch("dblclick");
  assert.deepEqual(edited, [{ row: 0, col: 1 }]);

  const header = GridView.prototype.rowHeader.call(view, 1); header.dataset.row = "0"; header.dispatch("click");
  assert.deepEqual(selected.at(-1), { startRow: 0, endRow: 0, startCol: 0, endCol: 1 });

  const resize = GridView.prototype.rowResizeHandle.call(view, 1, 1); resize.dataset.row = "0"; resize.dispatch("dblclick");
  assert.deepEqual(committed, ["Auto-fit row"]); assert.equal(model.getRowHeight(0), null);
});

test("native selection movement updates only its delta and maps covered merge coordinates to the anchor", () => {
  const { body } = installMiniDom();
  const model = new GridModel({
    showHeaders: false,
    columnIds: ["a", "b", "c", "d"],
    rows: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => "")),
  });
  model.merge({ startRow: 1, endRow: 2, startCol: 1, endCol: 2 });
  const root = new MiniNode("section"); const grid = new MiniNode("div"); root.appendChild(grid); body.appendChild(root);
  const cells = new Map();
  for (let row = 0; row < model.rowCount; row += 1) for (let col = 0; col < model.colCount; col += 1) {
    if (model.isCovered(row, col)) continue;
    const cell = new MiniNode("div"); cell.dataset.row = String(row); cell.dataset.col = String(col); cell.scrollIntoView = () => {};
    cells.set(`${row}:${col}`, cell); grid.appendChild(cell);
  }
  const view = Object.assign(Object.create(GridView.prototype), {
    model, root, gridElement: grid, cells,
    selection: { startRow: 2, endRow: 2, startCol: 3, endCol: 3 }, anchor: { row: 2, col: 3 },
    selectedCellElements: new Set(), activeCellElement: null, selectionControls: new Set(),
  });
  view.updateSelection();
  const previous = cells.get("2:3"); const mergedAnchor = cells.get("1:1"); const unrelated = cells.get("0:3");
  const previousControls = [...view.selectionControls]; let unrelatedMutations = 0;
  for (const method of ["add", "remove", "toggle"]) {
    const original = unrelated.classList[method].bind(unrelated.classList);
    unrelated.classList[method] = (...args) => { unrelatedMutations += 1; return original(...args); };
  }
  root.querySelectorAll = () => { throw new Error("selection must not query the root"); };
  cells.values = () => { throw new Error("selection must not scan mounted cells"); };

  view.select({ startRow: 2, endRow: 2, startCol: 2, endCol: 2 });

  assert.deepEqual(view.selection, { startRow: 2, endRow: 2, startCol: 2, endCol: 2 });
  assert.equal(previous.classList.contains("rg-cell--selected"), false); assert.equal(previous.classList.contains("rg-cell--active"), false);
  assert.equal(mergedAnchor.classList.contains("rg-cell--selected"), true); assert.equal(mergedAnchor.classList.contains("rg-cell--active"), true);
  assert.equal(unrelatedMutations, 0); assert.equal(previousControls.every((control) => control.parentNode == null), true);
  assert.equal([...view.selectionControls].some((control) => control.classList.contains("rg-cell-width-resize") && control.title === "Resize column C"), true);
  assert.equal([...view.selectionControls].some((control) => control.classList.contains("rg-cell-height-resize") && control.title === "Resize row 3"), true);

  view.select({ startRow: 1, endRow: 3, startCol: 1, endCol: 3 });
  const overlay = [...view.selectionControls].find((control) => control.classList.contains("rg-range-overlay"));
  assert.ok(overlay); assert.equal(overlay.children.some((child) => child.classList.contains("rg-range-badge")), true);
  assert.equal(overlay.children.some((child) => child.classList.contains("rg-fill-handle")), true);
  assert.equal(unrelatedMutations, 0);
});

test("native-style cell reference counts update without replacing stable content", () => {
  const { body } = installMiniDom();
  const model = new GridModel({ rows: [[{ uid: "source-cell", raw: "Source" }]] });
  const root = new MiniNode("section"); const cell = new MiniNode("div"); cell.className = "rg-cell";
  const content = new MiniNode("div"); content.className = "rg-cell-content"; content.textContent = "Source";
  cell.appendChild(content); root.appendChild(cell); body.appendChild(root);
  let opened = null;
  const view = Object.assign(Object.create(GridView.prototype), {
    model, root, referenceCounts: new Map([["source-cell", 1]]),
    cells: new Map([["0:0", cell]]), cellCoordinatesByUid: new Map([["source-cell", { row: 0, col: 0 }]]),
    openCellReferences: (uid) => { opened = uid; },
  });

  view.updateReferenceCountBadges(new Set(["source-cell"]));
  const badge = cell.querySelector(".rg-cell-reference-count");
  assert.ok(badge); assert.equal(badge.textContent, "1"); assert.equal(badge.title, "Click for references");
  assert.equal(badge.getAttribute("aria-label"), "1 linked reference. Click to toggle references");
  assert.equal(cell.children[0], content); assert.equal(content.textContent, "Source");
  badge.dispatch("click"); assert.equal(opened, "source-cell");

  view.referenceCounts.set("source-cell", 0); view.updateReferenceCountBadges(new Set(["source-cell"]));
  assert.equal(cell.querySelector(".rg-cell-reference-count"), null);
  assert.equal(cell.children[0], content); assert.equal(content.textContent, "Source");
});

test("reference source query deduplicates and sorts Roam blocks", () => {
  const api = { q: (_query, uid) => {
    assert.equal(uid, "source-cell");
    return [["z-source", "Later", "Z Page"], ["a-source", "First", "A Page"], ["a-source", "Duplicate", "A Page"]];
  } };
  assert.deepEqual(queryBlockReferenceSources("source-cell", api), [
    { uid: "a-source", string: "First", pageTitle: "A Page" },
    { uid: "z-source", string: "Later", pageTitle: "Z Page" },
  ]);
});

test("cell reference clicks toggle a local native-rendered references panel", async () => {
  const { body } = installMiniDom();
  const root = new MiniNode("section"); root.className = "rg-root"; body.appendChild(root);
  const cell = new MiniNode("div"); cell.className = "rg-cell"; root.appendChild(cell);
  const badge = new MiniNode("button"); badge.className = "rg-cell-reference-count"; cell.appendChild(badge);
  let sidebarCalls = 0; let unmountCalls = 0; const rendered = [];
  globalThis.window.roamAlphaAPI = {
    q: () => [["reference-1", "A referencing ((source-cell)) block", "roam-grid/dev"]],
    ui: {
      components: {
        renderBlock: ({ uid, el }) => { rendered.push(uid); el.textContent = "Rendered by Roam"; },
        unmountNode: ({ el }) => { assert.equal(el.classList.contains("rg-inline-reference-block"), true); unmountCalls += 1; },
      },
      mainWindow: { openBlock() {} },
      rightSidebar: { addWindow: () => { sidebarCalls += 1; } },
    },
  };
  const model = new GridModel({ rows: [[{ uid: "source-cell", raw: "Source · King Arthur Baking" }]] });
  const view = Object.assign(Object.create(GridView.prototype), {
    model, root, inlineReferencesUid: null, inlineReferencesPanel: null, inlineReferenceDisposers: new Set(),
    cells: new Map([["0:0", cell]]), cellCoordinatesByUid: new Map([["source-cell", { row: 0, col: 0 }]]),
  });

  assert.equal(view.openCellReferences("source-cell"), true);
  await Promise.resolve();
  const panel = root.querySelector(".rg-inline-references");
  assert.ok(panel); assert.equal(panel.querySelector(".rg-inline-references-title").textContent, "References to: Source · King Arthur Baking");
  assert.equal(panel.querySelector(".rg-inline-reference-breadcrumb").textContent, "roam-grid/dev  ›");
  assert.equal(panel.querySelector(".rg-inline-reference-block").textContent, "Rendered by Roam");
  assert.deepEqual(rendered, ["reference-1"]); assert.equal(sidebarCalls, 0);
  assert.equal(badge.getAttribute("aria-expanded"), "true");

  assert.equal(view.openCellReferences("source-cell"), true);
  assert.equal(root.querySelector(".rg-inline-references"), null);
  assert.equal(badge.getAttribute("aria-expanded"), "false");
  assert.equal(unmountCalls, 1);
});

const waitForSearch = () => new Promise((resolve) => setTimeout(resolve, 2));

/**
 * Replaces "bare Roam reference openers do not flash an empty inline portal". That test asserted
 * `searches === 0` on a bare opener, which WAS the reported bug — Roam opens its own menu the moment
 * you type `[[`, and typing `[[` here produced silence. Its letter is gone; its intent — never an
 * empty shell, never a flash — is preserved below and strengthened into the invariant the whole
 * popover is now governed by, asserted across both trigger types × cold / warm / empty / disabled.
 */
test("a bare [[ opens on recent pages and a bare (( on recent blocks", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents();
  let searches = 0;
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => { searches += 1; return [{ kind: "roam-page", name: "Searched", description: "Page" }]; },
  });
  globalThis.window.roamAlphaAPI = { q: (query) => (/:node\/title/.test(query)
    ? [["Older Page", "pageold12", 10], ["Newest Page", "pagenew12", 90]]
    : [["blkolder12", "an older block", 20], ["blknewer12", "a newer block", 80]]) };

  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "[[", floating: false });
  flush(); await waitForSearch();
  assert.equal(searches, 0, "a bare opener takes the recents path, never the search path");
  assert.equal(controller.suggestionKind, "roam-reference");
  assert.deepEqual(controller.suggestions.map((suggestion) => suggestion.name), ["Newest Page", "Older Page"]);
  assert.equal(controller.popover.hidden, false);
  assert.equal(controller.suggestionList.hidden, false);
  assert.equal(editor.getAttribute("aria-expanded"), "true");

  editor.value = "(("; editor.setSelectionRange(2, 2); editor.dispatch("input"); flush(); await waitForSearch();
  assert.equal(searches, 0);
  assert.deepEqual(controller.suggestions.map((suggestion) => suggestion.uid), ["blknewer12", "blkolder12"]);
  assert.equal(controller.popover.hidden, false);

  editor.value = "((que"; editor.setSelectionRange(5, 5); editor.dispatch("input"); flush(); await waitForSearch();
  assert.equal(searches, 1, "a typed query still goes to the search path");
  controller.dispose();
});

/**
 * The invariant that replaces the old test's intent, pinned rather than sampled: the popover is
 * visible only when the list is showing rows, or the editor is floating, or the cell holds a formula.
 */
test("the popover is never an empty shell across trigger type and recents state", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  const rows = { page: [["Alpha", "pagealpha", 40]], block: [["blockalpha", "alpha block", 40]] };
  rows.tag = rows.page;
  const openers = [["[[", "page"], ["((", "block"], ["#", "tag"]];

  const assertInvariant = (controller, label) => {
    const state = controller.state;
    const raw = state.editor.value;
    const formula = raw.startsWith("=") && !raw.startsWith("==");
    const showingRows = Boolean(controller.suggestions.length) && !controller.suggestionList.hidden;
    if (!controller.popover.hidden) assert.ok(showingRows || state.floating || formula, `${label}: a visible popover must have rows, be floating, or be a formula`);
    assert.equal(state.editor.getAttribute("aria-expanded"), String(Boolean(controller.suggestions.length)), `${label}: aria-expanded tracks the rows`);
    if (!controller.suggestions.length) assert.equal(controller.suggestionList.hidden, true, `${label}: an empty list is hidden`);
  };

  for (const [opener, type] of openers) {
    for (const scenario of ["cold", "warm", "empty", "disabled"]) {
      resetRoamRecents(); settingsCache.clear();
      let queries = 0;
      const { controller, cells, flush } = makeController({ referenceSearchDelay: 0 });
      // Counts RECENTS queries only. The enrichment pass issues its own `q`, and folding the two into
      // one counter would make "a warm cache answers without a second query" stop meaning that.
      globalThis.window.roamAlphaAPI = { q: (query) => { if (!/edit\/time/.test(query)) return []; queries += 1; return scenario === "empty" ? [] : rows[type]; } };
      if (scenario === "warm") { await searchRoamRecentSuggestions({ type, query: "" }); assert.equal(queries, 1); }
      if (scenario === "disabled") settingsCache.set("editing-autocomplete-empty-opener", false);
      const label = `${opener} ${scenario}`;

      const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: opener, floating: false });
      flush(); await waitForSearch();
      assertInvariant(controller, label);
      const expectRows = scenario === "cold" || scenario === "warm";
      assert.equal(controller.popover.hidden, !expectRows, `${label}: popover visibility follows the rows`);
      assert.equal(controller.suggestions.length, expectRows ? 1 : 0, `${label}: row count`);
      if (scenario === "warm") assert.equal(queries, 1, "a warm cache answers without a second query");
      if (scenario === "disabled") assert.equal(queries, 0, "the empty-opener switch sits ahead of the query");
      assert.equal(recentsCacheReady(type), scenario !== "disabled", `${label}: only a switched-off opener leaves the cache cold`);

      editor.value = `=1+${opener}`; editor.setSelectionRange(5, 5); editor.dispatch("input"); flush(); await waitForSearch();
      assertInvariant(controller, `${label} formula`);
      assert.equal(controller.popover.hidden, false, `${label}: a formula cell always shows the assistant`);
      controller.dispose();
    }
  }
});

test("recent blocks exclude the cells of the table being edited", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents();
  const model = new GridModel({ rows: [[{ uid: "owncell001", raw: "mine" }, { uid: "owncell002", raw: "also mine" }]] });
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0, view: { model } });
  globalThis.window.roamAlphaAPI = { q: () => [
    ["owncell001", "mine", 99],
    ["outsider01", "a block somewhere else", 50],
    ["owncell002", "also mine", 98],
  ] };

  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "((", floating: false });
  flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions.map((suggestion) => suggestion.uid), ["outsider01"]);
  assert.equal(controller.popover.hidden, false);
  controller.dispose();
});

test("a large grid has no cell uids to exclude and still gets its recents", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents();
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0 });
  assert.equal(controller.currentTableUids(), null, "a view with no model contributes no exclusions");
  globalThis.window.roamAlphaAPI = { q: () => [["anyblock01", "a block", 10]] };
  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "((", floating: false });
  flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions.map((suggestion) => suggestion.uid), ["anyblock01"]);
  controller.dispose();
});

test("pages this extension inserted are promoted ahead of the graph's own edit times", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents();
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => [{ kind: "roam-page", name: "Chosen Page", description: "Page" }],
  });
  globalThis.window.roamAlphaAPI = { q: () => [["Chosen Page", "pagechosen", 1], ["Busy Page", "pagebusy12", 999]] };

  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "[[Cho", floating: false });
  flush(); await waitForSearch();
  controller.onKeydown({ key: "Enter", preventDefault() {}, stopPropagation() {}, isComposing: false }); flush();
  assert.equal(editor.value, "[[Chosen Page]]");

  editor.value = "[[Chosen Page]] [["; editor.setSelectionRange(18, 18); editor.dispatch("input"); flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions.map((suggestion) => suggestion.name), ["Chosen Page", "Busy Page"], "the accepted page outranks the more recently edited one");
  controller.dispose();
});

/**
 * The create-page row's whole point is the case with no hits: before it, typing a page name that did
 * not exist yet produced an empty menu and no way forward. Accepting it must insert `[[Name]]` and
 * call nothing on `data.page` — Roam materializes the page from the committed string itself, and
 * creating it here would orphan a page every time the user then cancels the draft.
 */
test("a page name with no hits still offers to create it, inserting [[Name]] and creating nothing", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents();
  const pageCalls = [];
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0, searchReferences: async () => [] });
  globalThis.window.roamAlphaAPI = {
    q: () => [["Busy Page", "pagebusy12", 999]],
    data: { page: { create: (...args) => { pageCalls.push(args); } }, block: { create: (...args) => { pageCalls.push(args); } } },
  };

  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "[[Brand New Page", floating: false });
  flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions, [{ kind: "roam-create-page", name: "Brand New Page", description: "Create page" }]);
  assert.equal(controller.popover.hidden, false, "the row is real, so the popover opens on it");
  assert.equal(controller.suggestionList.children[0].textContent, "Brand New PageCreate page");

  controller.onKeydown({ key: "Enter", preventDefault() {}, stopPropagation() {}, isComposing: false }); flush();
  assert.equal(editor.value, "[[Brand New Page]]");
  assert.deepEqual(pageCalls, [], "accepting creates no page — the committed string does that");

  editor.value = "[[Brand New Page]] [["; editor.setSelectionRange(21, 21); editor.dispatch("input"); flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions.map((suggestion) => suggestion.name), ["Brand New Page", "Busy Page"],
    "a created page joins the LRU, so the next bare opener offers it first");
  controller.dispose();
});

/**
 * `#` and `#[[` reuse the page search and recents paths verbatim; only detection and insertion
 * differ. `/` is recognised so that `[[` and `((` stop firing inside it, and with its own switch at
 * its default it must render nothing, query nothing, and leave the popover shut — which is the
 * never-empty invariant doing its job rather than a special case bolted onto it. That default is
 * the point: the command subset is the one autocomplete that ships OFF.
 */
test("# and #[[ take the page path while / is recognised and answers nothing by default", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents(); settingsCache.clear();
  let queries = 0; const searched = [];
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async (context) => { searched.push(context.type); return [{ kind: "roam-page", name: "Name With Spaces", description: "Page" }]; },
  });
  // Recents queries only — see the counter note in the never-an-empty-shell test above.
  globalThis.window.roamAlphaAPI = { q: (query) => { if (!/edit\/time/.test(query)) return []; queries += 1; return [["Recent Page", "pagerecent", 40]]; } };

  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "#", floating: false });
  flush(); await waitForSearch();
  assert.equal(controller.referenceContext.type, "tag");
  assert.deepEqual(controller.suggestions.map((suggestion) => suggestion.name), ["Recent Page"], "a bare # offers recent pages, exactly as a bare [[ does");
  assert.equal(queries, 1);

  editor.value = "#Name"; editor.setSelectionRange(5, 5); editor.dispatch("input"); flush(); await waitForSearch();
  assert.deepEqual(searched, ["tag"], "a typed tag goes to the page search path");
  controller.onKeydown({ key: "Enter", preventDefault() {}, stopPropagation() {}, isComposing: false }); flush();
  assert.equal(editor.value, "#[[Name With Spaces]]", "a name Roam cannot read bare is bracketed, and the # is kept");

  editor.value = "#[[Nam"; editor.setSelectionRange(6, 6); editor.dispatch("input"); flush(); await waitForSearch();
  assert.equal(controller.referenceContext.type, "tag-page");
  controller.onKeydown({ key: "Enter", preventDefault() {}, stopPropagation() {}, isComposing: false }); flush();
  assert.equal(editor.value, "#[[Name With Spaces]]", "#[[ replaces its own # rather than doubling it");

  for (const [raw, type] of [["/dat", "command"]]) {
    editor.value = raw; editor.setSelectionRange(raw.length, raw.length); editor.dispatch("input"); flush(); await waitForSearch();
    assert.equal(controller.referenceContext.type, type, `${raw} is recognised`);
    assert.deepEqual(controller.suggestions, [], `${raw} answers nothing while its switch is at its default`);
    assert.equal(controller.popover.hidden, true, `${raw} opens no empty shell`);
    assert.equal(controller.suggestionList.hidden, true);
    assert.equal(editor.getAttribute("aria-expanded"), "false");
  }
  assert.equal(queries, 1, "a trigger with no catalog issues no recents query");
  assert.deepEqual(searched, ["tag", "tag-page"], "and no search either");
  controller.dispose();
});

/**
 * The `{{` catalog end to end, through the same controller path every other trigger uses. Two things
 * it pins that the pure catalog tests cannot: the rows resolve with NO Roam call at all — no search,
 * no recents, no `q` — and the caret after an accept lands where the argument is typed, which is
 * checked by typing one and reading the finished cell rather than by reading `selectionStart`.
 */
test("{{ offers the component catalog with no Roam call, and accepting parks the caret inside the braces", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents(); settingsCache.clear();
  let searches = 0; let recents = 0; let queries = 0;
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => { searches += 1; return []; },
    searchRecents: async () => { recents += 1; return []; },
  });
  globalThis.window.roamAlphaAPI = { q: () => { queries += 1; return []; } };

  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "{{", floating: false });
  flush(); await waitForSearch();
  assert.equal(controller.referenceContext.type, "component");
  assert.deepEqual(controller.suggestions.slice(0, 3).map((row) => row.name), ["TODO", "DONE", "query"], "a bare {{ opens on the catalog");
  assert.equal(controller.suggestions.length, 8, "bounded by the same results setting as every other menu");
  assert.equal(controller.popover.hidden, false);
  assert.equal(editor.getAttribute("aria-expanded"), "true");
  assert.equal(controller.suggestionList.children[0].textContent, "TODOCheckbox");
  assert.equal(searches + recents + queries, 0, "a static catalog asks Roam nothing");

  editor.value = "{{quer"; editor.setSelectionRange(6, 6); editor.dispatch("input"); flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions.map((row) => row.name), ["query"]);
  controller.onKeydown({ key: "Enter", preventDefault() {}, stopPropagation() {}, isComposing: false }); flush();
  assert.equal(editor.value, "{{[[query]]: {and: }}}");
  editor.setRangeText("[[Alpha]]", editor.selectionStart, editor.selectionEnd, "end");
  assert.equal(editor.value, "{{[[query]]: {and: [[Alpha]]}}}", "what is typed next lands inside the braces, not after them");

  editor.value = "{{tod"; editor.setSelectionRange(5, 5); editor.dispatch("input"); flush(); await waitForSearch();
  controller.onKeydown({ key: "Enter", preventDefault() {}, stopPropagation() {}, isComposing: false }); flush();
  assert.equal(editor.value, "{{[[TODO]]}}");
  editor.setRangeText(" buy milk", editor.selectionStart, editor.selectionEnd, "end");
  assert.equal(editor.value, "{{[[TODO]]}} buy milk", "a component with no argument parks the caret past its own closing braces");
  assert.deepEqual(controller.suggestions, [], "and the menu closes on the component it just inserted");
  assert.equal(searches + recents + queries, 0);

  editor.value = "{{zzzz"; editor.setSelectionRange(6, 6); editor.dispatch("input"); flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions, [], "a name no component matches opens nothing");
  assert.equal(controller.popover.hidden, true, "and opens no empty shell either");
  controller.dispose();
});

test("both switches over the component catalog gate it ahead of the rows", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents(); settingsCache.clear();
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0 });
  globalThis.window.roamAlphaAPI = { q: () => [] };

  settingsCache.set("editing-autocomplete-components", false);
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "{{ta", floating: false });
  flush(); await waitForSearch();
  assert.equal(controller.referenceContext.type, "component", "the trigger is still recognised, so [[ and (( stay suppressed inside it");
  assert.deepEqual(controller.suggestions, [], "its own switch silences the catalog");
  assert.equal(controller.popover.hidden, true);

  settingsCache.set("editing-autocomplete-components", true);
  editor.dispatch("input"); flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions.map((row) => row.name), ["table", "attr-table"], "and a switch moved mid-edit lands on the next keystroke");

  settingsCache.set("editing-autocomplete", false);
  editor.dispatch("input"); flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions, [], "the master switch covers the catalog too");
  assert.equal(controller.popover.hidden, true);
  controller.dispose();
});

/**
 * The `/` subset end to end. Its switch defaults OFF, so the first half of this is the gate itself:
 * a recognised trigger with a silent catalog behind it. The second half pins that turning it on
 * costs Roam nothing — the catalog is static, so no search, no recents and no `q` — and that the
 * master switch still covers it.
 */
test("/ answers nothing until its own switch is on, and asks Roam nothing once it is", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents(); settingsCache.clear();
  let searches = 0; let recents = 0; let queries = 0;
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => { searches += 1; return []; },
    searchRecents: async () => { recents += 1; return []; },
  });
  globalThis.window.roamAlphaAPI = { q: () => { queries += 1; return []; } };

  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "/tab", floating: false });
  flush(); await waitForSearch();
  assert.equal(controller.referenceContext.type, "command", "the trigger is recognised either way, so [[ and (( stay suppressed inside it");
  assert.deepEqual(controller.suggestions, [], "and its default is off");
  assert.equal(controller.popover.hidden, true);
  assert.equal(editor.getAttribute("aria-expanded"), "false");

  settingsCache.set("editing-autocomplete-commands", true);
  editor.dispatch("input"); flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions.map((row) => row.name), ["Table"], "a switch moved mid-edit lands on the next keystroke");
  assert.equal(controller.popover.hidden, false);
  assert.equal(editor.getAttribute("aria-expanded"), "true");
  assert.equal(controller.suggestionList.children[0].textContent, "TableTable creator");

  editor.value = "/"; editor.setSelectionRange(1, 1); editor.dispatch("input"); flush(); await waitForSearch();
  assert.equal(controller.suggestions.length, 8, "a bare / opens on the catalog, bounded by the same results setting as every other menu");
  assert.equal(controller.suggestions[0].name, "TODO");
  assert.equal(searches + recents + queries, 0, "a static catalog asks Roam nothing");

  settingsCache.set("editing-autocomplete", false);
  editor.dispatch("input"); flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions, [], "the master switch covers the catalog too");
  assert.equal(controller.popover.hidden, true);
  controller.dispose();
});

/**
 * The half of the subset that is worth more than the rest of it: a command whose caret lands inside
 * `((` or `[[` hands straight over to the picker for what it just wrote, in one gesture. Nothing
 * special implements it — the accept simply leaves the reference path open, and the next paint reads
 * the text the command inserted. The Bold half is the control: a command that IS the whole answer
 * must leave the menu shut.
 */
test("a picker command hands the picker the reference it just wrote", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents(); settingsCache.clear();
  settingsCache.set("editing-autocomplete-commands", true);
  const opened = [];
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchRecents: async (context) => { opened.push(context.type); return [{ kind: "roam-block", name: "Recent block", description: "Block · blk000001", uid: "blk000001" }]; },
  });
  globalThis.window.roamAlphaAPI = { q: () => [] };

  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "/block r", floating: false });
  flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions.map((row) => row.name), ["Block Reference"], "a query with a space in it reaches a name with a space in it");
  controller.onKeydown({ key: "Enter", preventDefault() {}, stopPropagation() {}, isComposing: false }); flush(); await waitForSearch();
  assert.equal(editor.value, "(())");
  assert.equal(editor.selectionStart, 2, "the caret is parked between the parens, not past them");
  assert.deepEqual(opened, ["block"], "and the block picker opened on it without a second keystroke");
  assert.deepEqual(controller.suggestions.map((row) => row.name), ["Recent block"]);

  editor.value = "/mentions"; editor.setSelectionRange(9, 9); editor.dispatch("input"); flush(); await waitForSearch();
  controller.onKeydown({ key: "Enter", preventDefault() {}, stopPropagation() {}, isComposing: false }); flush(); await waitForSearch();
  assert.equal(editor.value, "{{[[mentions]]: [[]]}}");
  assert.deepEqual(opened, ["block", "page"], "a component whose argument is a page opens the page picker instead");

  editor.value = "/bold"; editor.setSelectionRange(5, 5); editor.dispatch("input"); flush(); await waitForSearch();
  controller.onKeydown({ key: "Enter", preventDefault() {}, stopPropagation() {}, isComposing: false }); flush(); await waitForSearch();
  assert.equal(editor.value, "****");
  editor.setRangeText("loud", editor.selectionStart, editor.selectionEnd, "end");
  assert.equal(editor.value, "**loud**", "what is typed next lands between the markers");
  assert.deepEqual(opened, ["block", "page"], "and a command that is the whole answer opens nothing");
  assert.deepEqual(controller.suggestions, []);
  controller.dispose();
});

/**
 * The day rows through the controller, because the pure test can only prove the wrapper: what
 * matters live is that the title comes from `roamAlphaAPI.util.dateToPageTitle` and is never
 * assembled here. Probed on the Svy graph on 2026-08-06, that call returned "August 6th, 2026" and
 * pulling `[:node/title "August 6th, 2026"]` returned the real daily page — so the row writes a
 * reference that resolves. With the call missing there is no format to fall back to, and the rows go.
 */
test("the day commands write the title Roam formats, and are absent when Roam cannot format one", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents(); settingsCache.clear();
  settingsCache.set("editing-autocomplete-commands", true);
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0 });
  const asked = [];
  globalThis.window.roamAlphaAPI = { q: () => [], util: { dateToPageTitle: (date) => { asked.push(date instanceof Date); return "August 6th, 2026"; } } };

  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "/tod", floating: false });
  flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions.map((row) => row.name), ["TODO", "Today"]);
  controller.suggestionList.children[1].dispatch("click"); flush(); await waitForSearch();
  assert.equal(editor.value, "[[August 6th, 2026]]", "the row inserts what Roam formatted, wrapped and nothing else");
  assert.equal(asked.every(Boolean), true, "and it is handed a Date, which is what that call takes");
  assert.deepEqual(controller.suggestions, [], "a completed page reference is not a page query");

  globalThis.window.roamAlphaAPI = { q: () => [] };
  editor.value = "/tod"; editor.setSelectionRange(4, 4); editor.dispatch("input"); flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions.map((row) => row.name), ["TODO"], "no dateToPageTitle, no day row — never a guessed date format");

  // The guard behind that filter, reached the only way it can be: a row that cannot resolve must
  // write NOTHING. Without it the accept falls through to the generic insert and the cell gets
  // `[[Today]]` — a reference to a page named after the command, which is worse than no command.
  controller.suggestions = [{ kind: "roam-command", name: "Today", description: "Today's daily page", dynamic: "day", offset: 0 }];
  controller.acceptSuggestion(0); flush();
  assert.equal(editor.value, "/tod", "an unresolvable command inserts nothing rather than a page named after itself");
  controller.dispose();
});

test("a block opener never offers to create a page, however little it matches", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents();
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0, searchReferences: async () => [] });
  globalThis.window.roamAlphaAPI = { q: () => [] };
  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "((nothing matches this", floating: false });
  flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions, []);
  assert.equal(controller.popover.hidden, true);
  controller.dispose();
});

test("a cache-resolvable bare opener drops the debounce it has nothing to debounce", async (t) => {
  t.after(() => { resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents(); settingsCache.clear();
  const { controller } = makeController();
  globalThis.window.roamAlphaAPI = { q: () => [["Alpha", "pagealpha", 40]] };
  assert.equal(controller.searchDelay({ type: "page", query: "" }), 90, "a cold bare opener still settles");
  await searchRoamRecentSuggestions({ type: "page", query: "" });
  assert.equal(controller.searchDelay({ type: "page", query: "" }), 0, "a warm cache resolves with no debounce");
  assert.equal(controller.searchDelay({ type: "page", query: "Alp" }), 90, "a typed query is not cache-resolvable");
  assert.equal(controller.searchDelay({ type: "block", query: "" }), 90, "the two openers cache separately");
  assert.equal(controller.searchDelay(), 90);
  controller.dispose();
});

test("two consecutive over-budget recents queries disarm bare openers through console.info, not a toast", async (t) => {
  const info = console.info; const warn = console.warn;
  const infos = []; const warns = [];
  console.info = (message) => infos.push(message); console.warn = (message) => warns.push(message);
  t.after(() => { console.info = info; console.warn = warn; resetRoamRecents(); settingsCache.clear(); });
  resetRoamRecents(); settingsCache.clear();

  const elapsed = 290; const real = globalThis.performance;
  let reading = 0;
  globalThis.performance = { now: () => { reading += 1; return reading % 2 === 0 ? elapsed : 0; } };
  const api = { q: () => [["Slow Page", "pageslow12", 5]] };

  const first = await searchRoamRecentSuggestions({ type: "page", query: "" }, { api, now: 1_000_000 });
  assert.deepEqual(first.map((suggestion) => suggestion.name), ["Slow Page"], "the result that blew the budget is still used — it is already paid for");
  assert.equal(recentsDisabled(), false, "one slow fetch can be a GC pause — the gate holds");
  assert.equal(infos.length, 0);

  const second = await searchRoamRecentSuggestions({ type: "page", query: "" }, { api, now: 1_061_000 });
  assert.equal(recentsDisabled(), true, "two consecutive over-budget fetches disarm");
  assert.equal(infos.length, 1);
  assert.match(infos[0], /over the 250ms budget/);

  const blocked = await searchRoamRecentSuggestions({ type: "block", query: "" }, { api, now: 1_122_000 });
  assert.deepEqual(blocked, [], "a cold cache behind a disarmed gate runs no query");
  assert.equal(infos.length, 1, "and says so exactly once");
  assert.deepEqual(warns, []);
  globalThis.performance = real;
});

test("plain Roam reference queries open only after results and use a plain address", async () => {
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => [{ kind: "roam-page", name: "Project Alpha", description: "Page" }],
  });
  const editor = await controller.start({ row: 0, col: 1, cell: cells.get("0:1"), raw: "[[Proj", floating: false });
  flush();
  assert.equal(controller.popover.hidden, true, "pending search has no empty shell");
  await waitForSearch();
  assert.equal(controller.popover.hidden, false);
  assert.equal(controller.address.textContent, "B1");
  assert.equal(controller.popover.dataset.mode, "reference");
  assert.equal(controller.suggestionKind, "roam-reference");
  assert.equal(editor.getAttribute("aria-expanded"), "true");
  controller.onKeydown({ key: "Escape", preventDefault() {}, stopPropagation() {}, isComposing: false });
  assert.ok(controller.state); assert.equal(controller.suggestionList.hidden, true); assert.equal(controller.popover.hidden, true);
  editor.dispatch("click"); flush();
  assert.equal(controller.popover.hidden, true, "dismissed plain reference results stay closed until input changes");
  controller.dispose();
});

test("Roam reference search ignores stale async results", async () => {
  const pending = [];
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: (context) => new Promise((resolve) => pending.push({ context, resolve })),
  });
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "[[old", floating: true });
  flush(); await waitForSearch();
  editor.value = "[[new"; editor.setSelectionRange(5, 5); editor.dispatch("input"); flush(); await waitForSearch();
  assert.equal(pending.length, 2);
  pending[1].resolve([{ kind: "roam-page", name: "New Page", description: "Page" }]); await Promise.resolve(); await Promise.resolve();
  assert.equal(controller.suggestions[0].name, "New Page");
  pending[0].resolve([{ kind: "roam-page", name: "Old Page", description: "Page" }]); await Promise.resolve(); await Promise.resolve();
  assert.equal(controller.suggestions[0].name, "New Page");
  controller.dispose();
});

test("Roam page and block suggestions insert native syntax without stealing editor focus", async () => {
  const searchReferences = async (context) => context.type === "page"
    ? [{ kind: "roam-page", name: "Project Alpha", description: "Page" }]
    : [{ kind: "roam-block", name: "Matching block", description: "Block · blockuid1", uid: "blockuid1" }];
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0, searchReferences });
  let editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "See [[Proj]]", floating: false });
  editor.setSelectionRange(10, 10);
  editor.dispatch("input");
  flush(); await waitForSearch();
  assert.equal(controller.suggestionKind, "roam-reference");
  assert.equal(controller.popover.hidden, false, "inline reference search opens the shared popover");
  controller.onKeydown({ key: "Enter", preventDefault() {}, stopPropagation() {}, isComposing: false }); flush();
  assert.equal(editor.value, "See [[Project Alpha]]"); assert.equal(globalThis.document.activeElement, editor);
  await controller.finish(false);

  editor = await controller.start({ row: 0, col: 1, cell: cells.get("0:1"), raw: "Use ((match", floating: true });
  flush(); await waitForSearch();
  controller.suggestionList.children[0].dispatch("click"); flush();
  assert.equal(editor.value, "Use ((blockuid1))"); assert.equal(globalThis.document.activeElement, editor);
  const richCalls = []; const preview = { dataset: {} };
  renderStableCellContent(preview, { raw: editor.value, renderRich: (_target, raw) => richCalls.push(raw) });
  assert.deepEqual(richCalls, ["Use ((blockuid1))"]);
  controller.dispose();
});

/**
 * `editing-autocomplete` is the master switch over BOTH suggestion paths, and the reference half is
 * asserted by call count rather than by the popover: gating after the debounced search would still
 * hide the list while querying Roam on every keystroke, which is the cost the switch exists to avoid.
 */
test("the autocomplete switch silences the function list and stops the Roam query being issued", async (t) => {
  t.after(() => { settingsCache.clear(); resetRoamRecents(); });
  resetRoamRecents();
  let searches = 0; let recents = 0;
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => { searches += 1; return [{ kind: "roam-page", name: "Project Alpha", description: "Page" }]; },
    searchRecents: async () => { recents += 1; return [{ kind: "roam-page", name: "Recent Alpha", description: "Page" }]; },
  });

  settingsCache.set("editing-autocomplete", true);
  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "=SU", floating: false });
  flush();
  assert.equal(controller.suggestionKind, "formula");
  assert.ok(controller.suggestions.length > 0, "the function list is the baseline this test degrades from");
  await controller.finish(false);

  await controller.start({ row: 0, col: 1, cell: cells.get("0:1"), raw: "[[Proj", floating: false });
  flush(); await waitForSearch();
  assert.equal(searches, 1);
  assert.equal(controller.suggestionKind, "roam-reference");
  await controller.finish(false);

  await controller.start({ row: 2, col: 2, cell: cells.get("2:2"), raw: "[[", floating: false });
  flush(); await waitForSearch();
  assert.equal(recents, 1, "the bare opener is the baseline the switch degrades from too");
  await controller.finish(false);

  settingsCache.set("editing-autocomplete", false);
  const editor = await controller.start({ row: 1, col: 0, cell: cells.get("1:0"), raw: "=SU", floating: false });
  flush();
  assert.deepEqual(controller.suggestions, []);
  assert.equal(controller.suggestionList.hidden, true);
  assert.equal(editor.getAttribute("aria-expanded"), "false");
  await controller.finish(false);

  await controller.start({ row: 1, col: 1, cell: cells.get("1:1"), raw: "[[Proj", floating: false });
  flush(); await waitForSearch();
  assert.equal(searches, 1, "the gate must sit ahead of the debounced query, not after its results");
  assert.deepEqual(controller.suggestions, []);
  assert.equal(controller.suggestionList.hidden, true);
  await controller.finish(false);

  await controller.start({ row: 2, col: 1, cell: cells.get("2:1"), raw: "((", floating: false });
  flush(); await waitForSearch();
  assert.equal(recents, 1, "the master switch gates the recents lookup too, ahead of it for the same reason");
  assert.deepEqual(controller.suggestions, []);
  assert.equal(controller.popover.hidden, true);
  controller.dispose();
});

test("Roam reference suggestions take keyboard precedence and Escape closes them before editing", async () => {
  const { controller, cells, flush, finishes } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => [{ kind: "roam-page", name: "Project", description: "Page" }],
  });
  // Quoted, because a `[[` outside a string literal is a formula syntax error rather than a
  // reference — the same guard that stops `=SUM((A1` being read as a block opener.
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: '=SUM(A1)&"[[Pro', floating: true });
  flush(); await waitForSearch();
  assert.equal(controller.suggestionKind, "roam-reference");
  assert.equal(controller.address.textContent, "fx  A1");
  assert.deepEqual(controller.suggestions.map((suggestion) => suggestion.kind), ["roam-page", "roam-create-page"]);
  assert.equal(controller.popover.dataset.mode, "reference");
  controller.onKeydown({ key: "Escape", preventDefault() {}, stopPropagation() {}, isComposing: false });
  assert.ok(controller.state); assert.equal(controller.suggestionList.hidden, true);
  controller.onKeydown({ key: "Escape", preventDefault() {}, stopPropagation() {}, isComposing: false }); await Promise.resolve();
  assert.equal(controller.state, null); assert.equal(finishes.at(-1).commit, false); assert.equal(editor.value, '=SUM(A1)&"[[Pro');
  controller.dispose();
});

/**
 * A `<textarea>` fires neither `select` nor `input` for a caret move, so before the keyup path
 * existed the menu opened on `[[Pro` survived arrow keys that had walked the caret out of its query.
 */
test("an arrow key that walks the caret out of the query closes the menu", async () => {
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => [{ kind: "roam-page", name: "Project Alpha", description: "Page" }],
  });
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "[[Pro", floating: false });
  flush(); await waitForSearch();
  assert.equal(controller.suggestionList.hidden, false, "the open menu is the baseline this test closes");
  assert.equal(editor.getAttribute("aria-expanded"), "true");

  editor.setSelectionRange(1, 1);
  editor.dispatch("keyup", { key: "ArrowLeft" });
  flush(); await waitForSearch();
  assert.deepEqual(controller.suggestions, []);
  assert.equal(controller.suggestionList.hidden, true, "the menu must not outlive the caret leaving its query");
  assert.equal(editor.getAttribute("aria-expanded"), "false");
  assert.equal(controller.popover.hidden, true);

  editor.setSelectionRange(5, 5);
  editor.dispatch("keyup", { key: "End" });
  flush(); await waitForSearch();
  assert.equal(controller.suggestionList.hidden, false, "a caret move back into the query reopens it");

  editor.dispatch("keyup", { key: "Shift" });
  flush(); await waitForSearch();
  assert.equal(controller.suggestionList.hidden, false, "a key that cannot move the caret changes nothing");
  controller.dispose();
});

/**
 * Hover used to be CSS-only while `suggestionIndex` stayed put, so the row that looked selected and
 * the row Enter accepted were different rows. Node identity is asserted alongside because a rebuild
 * on mouse movement would undo the split painting this repaint depends on.
 */
test("hovering a row moves the highlight, and Enter accepts the row that looks selected", async () => {
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => [
      { kind: "roam-page", name: "Alpha", description: "Page" },
      { kind: "roam-page", name: "Beta", description: "Page" },
    ],
  });
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "[[A", floating: false });
  flush(); await waitForSearch();
  const [first, second] = controller.suggestionList.children;
  assert.equal(controller.suggestionIndex, 0);
  assert.equal(first.getAttribute("aria-selected"), "true");

  second.dispatch("mouseenter");
  assert.equal(controller.suggestionIndex, 1, "hover owns the active index, not just a hover tint");
  assert.equal(second.getAttribute("aria-selected"), "true");
  assert.equal(second.classList.contains("rg-formula-suggestion--active"), true);
  assert.equal(first.getAttribute("aria-selected"), "false");
  assert.equal(editor.getAttribute("aria-activedescendant"), second.id);
  assert.equal(controller.suggestionList.children[0], first, "hover repaints row 0, it must not rebuild it");
  assert.equal(controller.suggestionList.children[1], second, "hover repaints row 1, it must not rebuild it");

  controller.onKeydown({ key: "Enter", preventDefault() {}, stopPropagation() {}, isComposing: false });
  flush();
  assert.equal(editor.value, "[[Beta]]", "Enter takes the hovered row, not the one the keyboard left behind");
  controller.dispose();
});

/**
 * U6's shared fixtures. `installSuggestionRenderer` stands in for Roam's React renderer: it records
 * every mount, writes recognisable output into the host, and lets a test re-enter the controller from
 * inside a render, which is the only deterministic way to supersede a batch mid-flight.
 */
function installSuggestionRenderer(onRender = null) {
  const rendered = []; const unmounted = [];
  globalThis.window.roamAlphaAPI = { ui: { components: {
    renderString: ({ el, string }) => { rendered.push({ el, string }); el.appendChild(new MiniNode("em", `roam:${string}`)); onRender?.(rendered.length); },
    unmountNode: ({ el }) => { unmounted.push(el); },
  } } };
  return { rendered, unmounted };
}

const richBlock = (index) => ({ kind: "roam-block", name: `row ${index} [[Ref${index}]] **bold**`, description: `Block · blkrow000${index}`, uid: `blkrow000${index}` });
const drainRenders = async () => { for (let index = 0; index < 40; index += 1) await Promise.resolve(); };
const keypress = (key) => ({ key, shiftKey: false, preventDefault() {}, stopPropagation() {}, isComposing: false });

test("only block rows render through Roam — page, tag and create-page rows stay plain text", async (t) => {
  t.after(() => { resetSuggestionRendering(); settingsCache.clear(); });
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => [
      { kind: "roam-page", name: "A **Page** [[link]]", description: "Page", uid: "pageaaaa1" },
      richBlock(1),
      { kind: "roam-create-page", name: "New **Page**", description: "Create page" },
    ],
  });
  const { rendered } = installSuggestionRenderer();
  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "((q", floating: false });
  flush(); await waitForSearch(); await drainRenders();

  assert.equal(rendered.length, 1, "a page title and a create-page name are already their own labels — zero renders");
  assert.equal(rendered[0].string, richBlock(1).name);
  const [page, block, create] = controller.suggestionList.children;
  assert.equal(page.querySelector(".rg-suggestion-text").textContent, "A **Page** [[link]]", "and they show their own name, verbatim");
  assert.equal(create.querySelector(".rg-suggestion-text").textContent, "New **Page**");
  assert.equal(block.textContent.includes(`roam:${richBlock(1).name}`), true, "the block row shows what Roam rendered");
  controller.dispose();
});

/**
 * The normalizer makes block CONTENT legible, because block content genuinely is Roam markdown. A
 * page title is a name: its literal characters are part of what the row inserts, and a label that
 * disagrees with the insertion is the same class of defect as a setting that does not do what it
 * says. So the normalizer stops at the row kind, not at the markdown.
 */
test("a page title is shown verbatim while a block row normalizes", async (t) => {
  t.after(() => { resetSuggestionRendering(); settingsCache.clear(); });
  const starred = { kind: "roam-page", name: "Notes on **emphasis**", description: "Page", uid: "pagestar1" };
  const hashed = { kind: "roam-page", name: "#hashtag-named page", description: "Page", uid: "pagehash1" };
  const block = { kind: "roam-block", name: "a block about **emphasis**", description: "Block · blkemph001", uid: "blkemph001" };
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0, searchReferences: async () => [starred, hashed, block] });
  installSuggestionRenderer();
  settingsCache.set("editing-autocomplete-render-rows", false);
  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "((q", floating: false });
  flush(); await waitForSearch(); await drainRenders();

  const label = (index) => controller.suggestionList.children[index].querySelector(".rg-suggestion-text").textContent;
  assert.equal(label(0), "Notes on **emphasis**", "the asterisks are part of the title the row inserts");
  assert.equal(label(1), "#hashtag-named page", "and so is a leading #");
  assert.equal(label(2), "a block about emphasis", "block content still normalizes — that is what it is for");
  assert.equal(controller.suggestions[0].name, starred.name, "the insertion source is untouched either way");
  controller.dispose();
});

test("within a result set only the block rows that actually carry markup are rendered", async (t) => {
  t.after(() => { resetSuggestionRendering(); settingsCache.clear(); });
  const plain = { kind: "roam-block", name: "a plain sentence", description: "Block · blkplain01", uid: "blkplain01" };
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0, searchReferences: async () => [plain, richBlock(2)] });
  const { rendered } = installSuggestionRenderer();
  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "((q", floating: false });
  flush(); await waitForSearch(); await drainRenders();

  assert.equal(rendered.length, 1, "text with no markup in it has nothing to render");
  assert.equal(rendered[0].string, richBlock(2).name);
  assert.equal(controller.suggestionList.children[0].querySelector(".rg-suggestion-text").textContent, "a plain sentence");
  controller.dispose();
});

/**
 * The parity rules are keyed on classes the runtime has to emit, and node:test has no layout engine to
 * notice when it stops emitting one. So the stylesheet and the painted menu are checked against each
 * other: every `.rg-autocomplete-*` class the stylesheet styles must land on a real element of a real
 * rendered list. It fails in both directions — a rule for a class nobody paints is dead CSS, and a
 * dropped class silently un-styles the menu.
 */
test("every .rg-autocomplete class the stylesheet styles lands on the painted menu", async (t) => {
  t.after(() => { resetSuggestionRendering(); settingsCache.clear(); });
  const css = await readFile(new URL("../extension.css", import.meta.url), "utf8");
  const styled = [...new Set([...css.matchAll(/\.(rg-autocomplete[\w-]*)\b/g)].map((match) => match[1]))];
  assert.ok(styled.length >= 3, "the sweep must actually see the parity rules");

  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => [{ kind: "roam-block", name: "a block about **emphasis**", description: "Block · blkparity1", uid: "blkparity1" }],
  });
  settingsCache.set("editing-autocomplete-render-rows", false);
  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "((q", floating: false });
  flush(); await waitForSearch();

  const painted = (node, found = new Set()) => {
    for (const name of node.classList?.values || []) found.add(name);
    for (const child of node.children) painted(child, found);
    return found;
  };
  const names = painted(controller.suggestionList);
  for (const name of styled) assert.equal(names.has(name), true, `${name} is styled but never painted`);
  controller.dispose();
});

test("the render cap is six rows, every row is non-empty from its first frame, and arrows re-render nothing", async (t) => {
  t.after(() => { resetSuggestionRendering(); settingsCache.clear(); });
  const rows = Array.from({ length: 8 }, (whole, index) => richBlock(index));
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0, searchReferences: async () => rows });
  let firstFrame = null;
  const { rendered } = installSuggestionRenderer((count) => {
    if (count === 1) firstFrame = [...controller.suggestionList.children].map((option) => option.textContent);
  });
  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "((q", floating: false });
  flush(); await waitForSearch(); await drainRenders();

  assert.equal(controller.suggestionList.children.length, 8);
  assert.equal(rendered.length, 6, "the cap is a module constant no setting can raise");
  assert.deepEqual(rendered.map((entry) => entry.string), rows.slice(0, 6).map((row) => row.name), "and it takes the rows above the fold");
  assert.equal(firstFrame.length, 8, "the whole list exists before the first render is issued");
  assert.equal(firstFrame.every((text) => text.trim().length > 0), true, "no row is ever blank, not even for one frame");
  assert.equal(firstFrame[7].startsWith(roamSuggestionPlainText(rows[7].name)), true, "an uncapped row keeps the normalizer's text for good");
  assert.equal(controller.suggestionList.children[7].querySelector(".rg-suggestion-text").textContent, roamSuggestionPlainText(rows[7].name));

  const [first, second] = controller.suggestionList.children;
  controller.onKeydown(keypress("ArrowDown"));
  controller.onKeydown(keypress("ArrowUp"));
  await drainRenders();
  assert.equal(controller.suggestionList.children[0], first, "U1's guard still holds once the rows are rendered");
  assert.equal(controller.suggestionList.children[1], second);
  assert.equal(rendered.length, 6, "navigation mounts nothing");
  controller.dispose();
});

test("a superseded result set aborts the render batch mid-flight and leaves no host mounted", async (t) => {
  t.after(() => { resetSuggestionRendering(); settingsCache.clear(); });
  const later = [{ kind: "roam-page", name: "Quiet Page", description: "Page", uid: "pagequiet" }];
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => Array.from({ length: 6 }, (whole, index) => richBlock(index)),
  });
  const abortedRows = [];
  const { rendered, unmounted } = installSuggestionRenderer((count) => {
    if (count !== 2) return;
    abortedRows.push(...controller.suggestionList.children);
    controller.suggestions = later; controller.suggestionIndex = 0; controller.renderSuggestionRows();
  });
  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "((q", floating: false });
  flush(); await waitForSearch(); await drainRenders();

  assert.equal(rendered.length, 2, "the batch stops on the row the newer result set arrived on — the remaining four never mount");
  assert.equal(controller.suggestionList.children.length, 1, "and the list belongs to the newer set");
  // The discriminating assertion. A detached host falls back to text instead of calling Roam and then
  // disposes itself, so the DOM an aborted batch leaves behind is identical to the DOM a batch that
  // ran to completion against dead rows leaves behind — and the mount count is identical too. The
  // unrun tail of the queue is the only thing that tells the two apart.
  assert.deepEqual(
    controller.pendingSuggestionRenders.map((job) => job.raw),
    [2, 3, 4, 5].map((index) => richBlock(index).name),
    "the remaining four jobs are dropped unrun, not merely aimed at detached rows",
  );
  assert.equal(abortedRows.length, 6);
  const skipped = abortedRows.slice(2);
  assert.equal(skipped.every((option) => option.querySelector(".rg-rich-host") == null), true, "and no orphan host is left attached to them");
  assert.equal(skipped.every((option) => option.querySelector(".rg-suggestion-text") != null), true, "while they keep the plain text they were built with");
  const hosts = rendered.map((entry) => entry.el);
  assert.equal(hosts.some((host) => controller.suggestionList.contains(host)), false, "no host from the aborted batch is left in the list");
  controller.dispose();
  for (const host of hosts) assert.equal(unmounted.filter((element) => element === host).length, 1, "every host the aborted batch made unmounts exactly once");
});

test("a row that comes back reuses the host it already mounted", async (t) => {
  t.after(() => { resetSuggestionRendering(); settingsCache.clear(); });
  const setA = [richBlock(1)]; const setB = [richBlock(2)];
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0, searchReferences: async () => setA });
  const { rendered, unmounted } = installSuggestionRenderer();
  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "((q", floating: false });
  flush(); await waitForSearch(); await drainRenders();
  assert.equal(rendered.length, 1);
  const host = rendered[0].el;

  controller.suggestions = setB; controller.renderSuggestionRows(); await drainRenders();
  assert.equal(rendered.length, 2, "a different row is a different mount");
  assert.equal(unmounted.includes(host), false, "the row that left the list is parked, not thrown away");

  controller.suggestions = setA; controller.renderSuggestionRows(); await drainRenders();
  assert.equal(rendered.length, 2, "backspacing to a previous query re-attaches the parked host instead of mounting again");
  assert.equal(controller.suggestionList.children[0].textContent.includes(`roam:${setA[0].name}`), true, "and the row still shows what Roam rendered");
  assert.equal(controller.suggestionList.contains(host), true);

  controller.dispose();
  assert.equal(unmounted.length, 2, "the cache goes down with the rows");
});

test("every teardown path unmounts every rendered suggestion host", async (t) => {
  t.after(() => { resetSuggestionRendering(); settingsCache.clear(); });
  for (const path of ["accept", "escape", "finish", "dispose"]) {
    const { controller, cells, flush } = makeController({ referenceSearchDelay: 0, searchReferences: async () => [richBlock(1), richBlock(2)] });
    const { rendered, unmounted } = installSuggestionRenderer();
    await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "((q", floating: false });
    flush(); await waitForSearch(); await drainRenders();
    assert.equal(rendered.length, 2, `${path}: two hosts to account for`);

    if (path === "accept") controller.onKeydown(keypress("Enter"));
    if (path === "escape") controller.onKeydown(keypress("Escape"));
    if (path === "finish") await controller.finish(false);
    if (path === "dispose") controller.dispose();

    assert.deepEqual(unmounted, rendered.map((entry) => entry.el), `${path}: every host unmounts, exactly once, in row order`);
    assert.equal(controller.suggestionList.children.length, 0, `${path}: and no row node survives`);
    if (path !== "dispose") controller.dispose();
  }
});

test("two slow batches switch rendering off for the session, and the setting does the same on its own", async (t) => {
  const realPerformance = globalThis.performance; const realInfo = console.info;
  t.after(() => { globalThis.performance = realPerformance; console.info = realInfo; resetSuggestionRendering(); settingsCache.clear(); });
  resetSuggestionRendering(); settingsCache.clear();
  const notices = []; console.info = (message) => notices.push(String(message));
  let ticks = 0;
  globalThis.performance = { now: () => { ticks += 40; return ticks; } };

  const setA = [richBlock(1)]; const setB = [richBlock(2)]; const setC = [richBlock(3)];
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0, searchReferences: async () => setA });
  const { rendered } = installSuggestionRenderer();
  await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "((q", floating: false });
  flush(); await waitForSearch(); await drainRenders();
  assert.equal(rendered.length, 1, "the first slow batch still renders — one slow batch is a cold bundle");
  assert.equal(notices.length, 0);

  controller.suggestions = setB; controller.renderSuggestionRows(); await drainRenders();
  assert.equal(rendered.length, 2, "so does the second, which is the one that trips the switch");
  assert.equal(notices.length, 1, "and it says so once, through console.info and never a toast");

  controller.suggestions = setC; controller.renderSuggestionRows(); await drainRenders();
  assert.equal(rendered.length, 2, "after two slow batches the session is text-only");
  assert.equal(controller.suggestionList.children[0].querySelector(".rg-suggestion-text").textContent, roamSuggestionPlainText(setC[0].name),
    "text-only still means readable text, never raw markdown");
  controller.dispose();

  resetSuggestionRendering();
  settingsCache.set("editing-autocomplete-render-rows", false);
  const off = makeController({ referenceSearchDelay: 0, searchReferences: async () => setA });
  const offRenderer = installSuggestionRenderer();
  await off.controller.start({ row: 0, col: 0, cell: off.cells.get("0:0"), raw: "((q", floating: false });
  off.flush(); await waitForSearch(); await drainRenders();
  assert.equal(offRenderer.rendered.length, 0, "the switch alone is enough");
  assert.equal(off.controller.suggestionList.children[0].querySelector(".rg-suggestion-text").textContent, roamSuggestionPlainText(setA[0].name));
  off.controller.dispose();
});

/**
 * The controller half of U7, run against the REAL `enrichRoamSuggestions` rather than an injected
 * stub, so a per-row implementation reds this test too and not only the unit one. `beforeEnrichment`
 * is captured from inside the query itself — the rows are already built at that point, which is what
 * makes the identity assertion at the end mean "enrichment painted these rows" rather than "the rows
 * that exist now are the rows that exist now".
 */
test("one enrichment query per result set lands counts and breadcrumbs on the rows it was given", async (t) => {
  t.after(() => { resetSuggestionRendering(); settingsCache.clear(); });
  const pages = [
    { kind: "roam-page", name: "Project Alpha", description: "Page", uid: "pagealpha" },
    { kind: "roam-page", name: "Quiet Page", description: "Page", uid: "pagequiet" },
  ];
  const blocks = [
    { kind: "roam-block", name: "first block", description: "Block · blkfirst01", uid: "blkfirst01" },
    { kind: "roam-block", name: "orphan block", description: "Block · blkorphan1", uid: "blkorphan1" },
  ];
  let set = pages;
  const queries = []; let beforeEnrichment = null;
  const { controller, cells, flush } = makeController({ referenceSearchDelay: 0, searchReferences: async () => set });
  globalThis.window.roamAlphaAPI = { q: (query, keys) => {
    queries.push({ query, keys });
    beforeEnrichment = [...controller.suggestionList.children];
    return /\(count \?r\)/.test(query) ? [["Project Alpha", 12]] : [["blkfirst01", "Owning Page"]];
  } };

  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "[[Pro", floating: false });
  flush(); await waitForSearch(); await drainRenders();

  assert.equal(queries.length, 1, "two page rows plus the create row, and one query for the set");
  assert.deepEqual(queries[0].keys, ["Project Alpha", "Quiet Page"]);
  const rows = [...controller.suggestionList.children];
  assert.equal(rows.length, 3);
  assert.equal(rows[0].querySelector(".rg-suggestion-count").textContent, "12");
  assert.equal(rows[0].querySelector(".rg-suggestion-count").getAttribute("aria-label"), "12 linked references");
  assert.equal(rows[0].querySelector(".rg-suggestion-breadcrumb"), null, "a page has no owning page to breadcrumb");
  assert.equal(rows[1].querySelector(".rg-suggestion-count"), null, "a page with no references gets no badge");
  assert.equal(rows[2].querySelector(".rg-suggestion-count"), null, "and neither does the create-page row");
  assert.equal(controller.suggestions[0].referenceCount, 12, "the enriched set is the one the controller now holds");
  assert.equal(rows.length, beforeEnrichment.length);
  rows.forEach((row, index) => assert.equal(row, beforeEnrichment[index], "enrichment paints the rows it was given — it never rebuilds them"));

  set = blocks;
  editor.value = "((fir"; editor.setSelectionRange(5, 5); editor.dispatch("input"); flush(); await waitForSearch(); await drainRenders();
  assert.equal(queries.length, 2, "one more result set, one more query");
  assert.deepEqual(queries[1].keys, ["blkfirst01", "blkorphan1"]);
  const blockRows = [...controller.suggestionList.children];
  assert.equal(blockRows[0].querySelector(".rg-suggestion-breadcrumb").textContent, "Owning Page");
  assert.equal(blockRows[0].querySelector(".rg-suggestion-count"), null, "a block row carries a breadcrumb, not a count");
  assert.equal(blockRows[1].querySelector(".rg-suggestion-breadcrumb"), null, "and a block whose page the query did not answer for carries neither");

  controller.onKeydown(keypress("ArrowDown"));
  assert.equal(controller.suggestionList.children[0], blockRows[0], "U1's guard still holds with enrichment on the rows");
  assert.equal(controller.suggestionList.children[0].querySelector(".rg-suggestion-breadcrumb").textContent, "Owning Page");
  controller.dispose();
});

test("an alias target is labelled on every row and accepting one leaves the alias's ) alone", async () => {
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => [{ kind: "roam-page", name: "Project Alpha", description: "Page", uid: "pagealpha" }],
  });
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "[label]([[Pro)", floating: false });
  editor.setSelectionRange(13, 13); editor.dispatch("select"); flush(); await waitForSearch();

  assert.equal(controller.referenceContext.aliasTarget, true);
  assert.equal(controller.suggestionList.children[0].querySelector(".rg-suggestion-detail").textContent, "Page · alias target");
  assert.equal(controller.suggestionList.children[1].querySelector(".rg-suggestion-detail").textContent, "Create page · alias target");

  controller.onKeydown(keypress("Enter")); flush();
  assert.equal(editor.value, "[label]([[Project Alpha]])", "the replacement stops at the page closer, so the alias keeps its )");

  editor.value = "See [[Pro"; editor.setSelectionRange(9, 9); editor.dispatch("input"); flush(); await waitForSearch();
  assert.equal(controller.referenceContext.aliasTarget, undefined);
  assert.equal(controller.suggestionList.children[0].querySelector(".rg-suggestion-detail").textContent, "Page",
    "and the label goes away with the alias, even though the rows themselves are identical");
  controller.dispose();
});

test("a pair key over a selection wraps it, and a formula keeps its own brackets", async () => {
  const { controller, cells, flush } = makeController();
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "sel", floating: false });
  flush();

  editor.setSelectionRange(0, 3);
  let prevented = false;
  controller.onKeydown({ key: "[", preventDefault() { prevented = true; }, stopPropagation() {}, isComposing: false });
  assert.equal(prevented, true);
  assert.equal(editor.value, "[sel]");
  assert.equal(editor.selectionStart, 1); assert.equal(editor.selectionEnd, 4, "the selection survives so the gesture repeats");
  controller.onKeydown({ key: "[", preventDefault() {}, stopPropagation() {}, isComposing: false });
  assert.equal(editor.value, "[[sel]]", "which is how an aliased ref gets built by hand");

  editor.setSelectionRange(3, 3);
  let collapsedPrevented = false;
  controller.onKeydown({ key: "[", preventDefault() { collapsedPrevented = true; }, stopPropagation() {}, isComposing: false });
  assert.equal(collapsedPrevented, false, "with nothing selected the key types normally");
  assert.equal(editor.value, "[[sel]]");
  await controller.finish(false);

  const formulaEditor = await controller.start({ row: 1, col: 0, cell: cells.get("1:0"), raw: "=SUM(A1)", floating: false });
  flush();
  formulaEditor.setSelectionRange(5, 7);
  let formulaPrevented = false;
  controller.onKeydown({ key: "(", preventDefault() { formulaPrevented = true; }, stopPropagation() {}, isComposing: false });
  assert.equal(formulaPrevented, false, "inside a formula `(` opens a call and must not wrap");
  assert.equal(formulaEditor.value, "=SUM(A1)");
  controller.dispose();

  for (const [key, wrapped] of [["(", "(sel)"], ["{", "{sel}"], ['"', '"sel"']]) {
    const node = new MiniNode("textarea"); node.value = "sel"; node.setSelectionRange(0, 3);
    assert.equal(wrapSelectionOnPair(node, key), true);
    assert.equal(node.value, wrapped);
  }
  const untouched = new MiniNode("textarea"); untouched.value = "sel"; untouched.setSelectionRange(0, 3);
  assert.equal(wrapSelectionOnPair(untouched, "a"), false, "only the four pair keys wrap");
  assert.equal(untouched.value, "sel");
});

test("inline editing keeps its custom editor in-cell and commits movement", async () => {
  const { controller, cells, finishes, flush } = makeController();
  const custom = new MiniNode("textarea");
  await controller.start({ row: 1, col: 1, cell: cells.get("1:1"), raw: "old", initial: "n", floating: false, customEditor: custom });
  flush();
  assert.equal(custom.parentNode, cells.get("1:1"));
  assert.equal(cells.get("1:1").classList.contains("rg-cell--editing"), true);
  controller.onKeydown({ key: "Enter", shiftKey: false, preventDefault() {}, stopPropagation() {}, isComposing: false });
  await Promise.resolve();
  assert.equal(finishes.at(-1).commit, true);
  assert.deepEqual(finishes.at(-1).movement, [1, 0]);
  assert.equal(custom.parentNode, null);
  controller.dispose();
});

test("native and large views route Enter inline and F2 floating without legacy editor state", async () => {
  const source = await readFile(new URL("../src/extension.js", import.meta.url), "utf8");
  assert.equal((source.match(/new GridEditorController\(/g) || []).length, 2);
  assert.equal((source.match(/event\.key === "F2"[^\n]+true\)/g) || []).length, 2);
  assert.equal((source.match(/event\.key === "Enter"[^\n]+beginEdit/g) || []).length, 2);
  assert.match(source, /replaceGridViewportContents\(viewport, grid\)/);
  assert.match(source, /releaseRichCellHosts\(this\.canvas\);\s*this\.canvas\.replaceChildren\(\)/);
  assert.ok((source.match(/releaseRichCellHosts\(this\.root\);\s*this\.root\.remove\(\)/g) || []).length >= 2);
  assert.doesNotMatch(source, /this\.formulaEdit|this\.formulaPopover/);
  assert.equal((source.match(/navigateReference:/g) || []).length, 2);
  assert.equal((source.match(/revealReference:/g) || []).length, 2);
});

/* --------------------------------------------------------------------------------------------
 * GOAL-U1 — native cell editing through Roam's real block editor.
 *
 * The harness below mounts a stand-in for `renderBlock`: a `.rm-block__input` host that grows a
 * focused `<textarea>` when it is clicked, which is the mechanism pinned fact 4 identified as the
 * only way into edit mode on a renderBlock mount. `document` gains real listener plumbing so the
 * overlay's document-level click-away listener can be exercised, and `requestAnimationFrame` runs
 * on the microtask queue so the poll loops resolve inside a single `await`.
 * ------------------------------------------------------------------------------------------ */

class OverlayNode extends MiniNode {
  matches(selector) {
    return String(selector).split(",").some((part) => {
      const value = part.trim();
      if (!value) return false;
      if (value.startsWith(".")) return value.slice(1).split(".").every((name) => this.classList.contains(name));
      const prefix = /^\[([\w-]+)\^=['"]?([^'"\]]+)['"]?\]$/.exec(value);
      if (prefix) return String(this.getAttribute(prefix[1]) ?? "").startsWith(prefix[2]);
      return this.tagName === value.toUpperCase();
    });
  }
  closest(selector) { for (let current = this; current; current = current.parentNode) if (current.matches?.(selector)) return current; return null; }
  getBoundingClientRect() { return { left: 40, top: 60, right: 160, bottom: 88, width: 120, height: 28 }; }
  dispatchEvent(event) {
    const type = event?.type ?? String(event);
    const payload = { type, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    for (const listener of [...(this.listeners.get(type) || [])]) listener(payload);
    return true;
  }
}

function installOverlayDom() {
  const body = new OverlayNode("body");
  const listeners = new Map();
  const popup = new OverlayNode("div"); popup.className = "rm-autocomplete__results";
  const state = { popupOpen: false };
  globalThis.document = {
    body,
    documentElement: { clientWidth: 1024 },
    activeElement: null,
    createElement: (name) => new OverlayNode(name),
    createTextNode: (text) => new OverlayNode("#text", text),
    querySelector: (selector) => (selector === ".rm-autocomplete__results" ? (state.popupOpen ? popup : null) : body.querySelector(selector)),
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    removeEventListener(type, listener) { listeners.set(type, (listeners.get(type) || []).filter((value) => value !== listener)); },
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  globalThis.requestAnimationFrame = (callback) => { queueMicrotask(callback); return 1; };
  globalThis.cancelAnimationFrame = () => {};
  delete globalThis.getComputedStyle; delete globalThis.MutationObserver; delete globalThis.matchMedia;
  return {
    body, state, popup,
    documentListenerCount: (type) => (listeners.get(type) || []).length,
    firePointerDown(target) {
      const event = { type: "pointerdown", target, preventDefault() {}, stopPropagation() {} };
      for (const listener of [...(listeners.get("pointerdown") || [])]) listener(event);
      return event;
    },
    // Roam owns the capture phase above our overlay node. Firing at document level is how the
    // wedge reaches us when Roam has already stopped the event from travelling any further down.
    fireDocument(type, fields = {}) {
      const event = { type, key: "", isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...fields };
      for (const listener of [...(listeners.get(type) || [])]) listener(event);
      return event;
    },
  };
}

/** `renderBlock` stand-in. `mode` picks the failure being characterised. */
function installOverlayRoam({ strings = {}, tree = null, mode = "ok" } = {}) {
  const record = { updates: [], deletes: [], mounts: [], unmounts: [], strings: { ...strings } };
  const components = {
    unmountNode: ({ el }) => record.unmounts.push(el),
    renderBlock: ({ uid, el }) => {
      record.mounts.push(uid);
      const host = new OverlayNode("div");
      host.className = "rm-block__input";
      host.id = `block-input-render-block-path-tbl-uuid7788-${uid}`;
      el.appendChild(host);
      if (mode !== "no-textarea") {
        host.addEventListener("click", () => {
          if (host.querySelector("textarea")) return;
          const textarea = new OverlayNode("textarea");
          textarea.id = host.id;
          const stored = String(record.strings[uid] ?? "");
          textarea.value = stored;
          textarea.setSelectionRange(stored.length, stored.length);
          host.appendChild(textarea);
          globalThis.document.activeElement = textarea;
        });
      }
      // Roam persists the textarea's CONTENT on the blur that unmount triggers — capture it so a
      // test can assert what the graph would receive (it must be the cancelled-to value).
      return () => { record.unmounts.push(uid); record.flushedAtBlur = el.querySelector("textarea")?.value ?? null; };
    },
  };
  if (mode === "no-render-block") delete components.renderBlock;
  globalThis.window.roamAlphaAPI = {
    q: () => (tree ? [[tree]] : []),
    data: {
      pull: (_pattern, reference) => {
        const uid = Array.isArray(reference) ? reference[1] : reference;
        return Object.hasOwn(record.strings, uid) ? { uid, string: record.strings[uid] } : null;
      },
      block: {
        update: async ({ block }) => { record.updates.push({ ...block }); record.strings[block.uid] = block.string; },
        delete: async ({ block }) => { record.deletes.push(block.uid); },
      },
    },
    ui: { components },
  };
  return record;
}

function overlayModel() {
  return new GridModel({ tableUid: "table0001", rows: [[{ uid: "cell00001", raw: "Alpha" }, { uid: "cell00002", raw: "Beta" }]] });
}

function overlayAdapter(model, baseTree = null) {
  const selfWrites = []; const patches = []; const transitions = [];
  return {
    model, baseTree, selfWrites, patches, transitions,
    baseCells: new Map(model.rows.flat().map((cell) => [cell.uid, { uid: cell.uid, raw: cell.raw }])),
    recordSelfWrite: (uid, from, to) => selfWrites.push({ uid, from, to }),
    patchBaseContent: (changes) => patches.push(...changes.map((change) => ({ ...change }))),
    recordExpectedStructuralTransition: (before, after, verified) => transitions.push({ before, after, verified }),
  };
}

function overlaySession() {
  const calls = { begin: [], end: [], flushes: 0 };
  return {
    calls, structuralPending: false, dirtyCells: new Map(),
    flushContentSave: async () => { calls.flushes += 1; },
    beginNativeOverlayEdit: (uid) => calls.begin.push(uid),
    endNativeOverlayEdit: (uid, detail) => calls.end.push({ uid, ...detail }),
  };
}

function makeOverlayHarness({ strings = { cell00001: "Alpha", cell00002: "Beta" }, tree = null, mode = "ok" } = {}) {
  const dom = installOverlayDom();
  const roamRecord = installOverlayRoam({ strings, tree, mode });
  const model = overlayModel();
  const adapter = overlayAdapter(model, tree);
  const session = overlaySession();
  const root = new OverlayNode("section"); root.className = "rg-root"; dom.body.appendChild(root);
  const cell = new OverlayNode("div"); cell.className = "rg-cell"; root.appendChild(cell);
  const finishes = [];
  const view = { model, adapter, session, root, surface: "main", context: "source" };
  const overlay = new NativeCellEditorOverlay(view, { onFinish: async (result) => { finishes.push(result); } });
  view.nativeOverlay = overlay;
  return { dom, roamRecord, model, adapter, session, root, cell, view, overlay, finishes };
}

async function startOverlay(harness, { row = 0, col = 0, uid = "cell00001", raw = "Alpha", initial = null } = {}) {
  const started = await harness.overlay.start({ row, col, cell: harness.cell, uid, raw, initial });
  return started;
}

function keydownOn(overlayRoot, fields) {
  const stops = [];
  const event = overlayRoot.dispatch("keydown", { stopPropagation() { stops.push(true); }, ...fields });
  return { event, stopped: stops.length > 0 };
}

test("a plain source cell edits through Roam's block editor and a formula, F2, preview or registry editor never does", async (t) => {
  t.after(() => { settingsCache.clear(); resetNativeEditorHealth(); runtime.registries = null; delete globalThis.HTMLElement; });
  installOverlayDom();
  resetNativeEditorHealth();
  runtime.registries = new RegistrySet();
  globalThis.HTMLElement = OverlayNode;
  const model = new GridModel({ tableUid: "table0001", rows: [[{ uid: "cell00001", raw: "Alpha" }, { uid: "cell00002", raw: "=SUM(A1)" }], [{ uid: "cell00003", raw: "==escaped" }, { uid: "cell00004", raw: "Delta" }]] });
  const cells = new Map();
  for (let row = 0; row < 2; row += 1) for (let col = 0; col < 2; col += 1) cells.set(`${row}:${col}`, new OverlayNode("div"));
  const overlayStarts = []; const controllerStarts = [];
  let overlayResult = { started: true };
  const view = Object.assign(Object.create(GridView.prototype), {
    model, cells, surface: "main", context: "source", session: { id: "session" },
    nativeOverlay: { start: async (args) => { overlayStarts.push(args); return overlayResult; } },
    editorController: { start: async (args) => { controllerStarts.push(args); return "custom"; } },
  });

  assert.equal(await view.beginEditLocal(0, 0), overlayResult, "a plain source cell takes the native overlay");
  assert.deepEqual(overlayStarts.at(-1), { row: 0, col: 0, cell: cells.get("0:0"), uid: "cell00001", raw: "Alpha", initial: null });
  assert.equal(controllerStarts.length, 0);

  assert.equal(await view.beginEditLocal(0, 1), "custom", "a formula cell keeps the grid editor and its fx assistant");
  assert.equal(overlayStarts.length, 1);

  assert.ok(await view.beginEditLocal(1, 0), "the == escape is text, not a formula");
  assert.equal(overlayStarts.length, 2);

  await view.beginEditLocal(0, 0, null, true);
  assert.equal(controllerStarts.at(-1).floating, true, "F2 floating editing is never native");
  assert.equal(overlayStarts.length, 2);

  settingsCache.set("editing-native-editor", false);
  assert.equal(await view.beginEditLocal(0, 0), "custom", "the setting off routes to the grid editor");
  assert.equal(overlayStarts.length, 2);
  settingsCache.set("editing-native-editor", true);

  view.surface = "preview";
  assert.equal(await view.beginEditLocal(0, 0), "custom");
  view.surface = "main"; view.context = "reference";
  assert.equal(await view.beginEditLocal(0, 0), "custom", "a reference-context grid is not the source of truth for the block");
  view.context = "source";

  const registered = new OverlayNode("textarea");
  runtime.registries.register(runtime.registries.cellEditors, "stars", { match: () => true, create: () => registered });
  assert.equal(await view.beginEditLocal(0, 0), "custom");
  assert.equal(controllerStarts.at(-1).customEditor, registered, "a registered cell editor wins outright");
  assert.equal(overlayStarts.length, 2);
  runtime.registries.cellEditors.clear();

  overlayResult = null;
  assert.equal(await view.beginEditLocal(0, 0), "custom", "an overlay that cannot start falls through to the grid editor");
  assert.equal(overlayStarts.length, 3);
  assert.equal(controllerStarts.at(-1).customEditor, null);
});

test("two consecutive mount failures retire the native editor for the session with one toast", async (t) => {
  t.after(() => { resetNativeEditorHealth(); runtime.extensionAPI = null; settingsCache.clear(); });
  resetNativeEditorHealth();
  runtime.extensionAPI = { settings: {} };
  const harness = makeOverlayHarness({ mode: "no-render-block" });

  assert.equal(await startOverlay(harness), null);
  assert.equal(runtime.nativeEditorFailures, 1);
  assert.equal(runtime.nativeEditorDisabled, false);
  assert.equal(nativeEditorEnabled(), true, "one failure is a fallback, not a retirement");
  assert.equal(harness.cell.classList.contains("rg-cell--native-editing"), false, "a failed mount leaves no overlay chrome behind");
  assert.equal(harness.cell.children.length, 0);

  assert.equal(await startOverlay(harness), null);
  assert.equal(runtime.nativeEditorDisabled, true);
  assert.equal(nativeEditorEnabled(), false);
  assert.equal(globalThis.document.body.querySelectorAll(".rg-toast").length, 1);

  assert.equal(await startOverlay(harness), null);
  assert.equal(globalThis.document.body.querySelectorAll(".rg-toast").length, 1, "the retirement toast is said once");

  resetNativeEditorHealth();
  const focusFailure = makeOverlayHarness({ mode: "no-textarea" });
  focusFailure.overlay.nextFrame = async () => {};
  assert.equal(await startOverlay(focusFailure), null, "a mount with no reachable textarea is a focus failure");
  assert.equal(runtime.nativeEditorFailures, 1);
  assert.equal(focusFailure.roamRecord.unmounts.length > 0, true, "the failed mount is unmounted, not leaked");
});

test("a successful mount clicks into Roam's input, claims the overlay uid, and resets the failure streak", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  runtime.nativeEditorFailures = 1;
  const harness = makeOverlayHarness();
  const started = await startOverlay(harness);
  assert.ok(started);
  assert.equal(runtime.nativeEditorFailures, 0, "a success clears the streak — the two failures must be CONSECUTIVE");
  assert.equal(harness.roamRecord.mounts.at(-1), "cell00001");
  assert.equal(harness.cell.classList.contains("rg-cell--editing"), true);
  assert.equal(harness.cell.classList.contains("rg-cell--native-editing"), true);
  const overlayNode = harness.cell.querySelector(".rg-native-cell-editor");
  assert.ok(overlayNode);
  assert.equal(overlayNode.classList.contains("rg-native-cell-editor--ready"), true, "the overlay only paints once Roam's input exists");
  assert.equal(harness.overlay.textarea.value, "Alpha");
  assert.equal(harness.overlay.textarea.selectionStart, 5);
  assert.deepEqual(harness.session.calls.begin, ["cell00001"]);
  assert.equal(harness.dom.documentListenerCount("pointerdown"), 1);
  harness.overlay.dispose();
  assert.equal(harness.dom.documentListenerCount("pointerdown"), 0);
});

test("a typed character seeds the block before Roam's editor opens and parks the caret after it", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const harness = makeOverlayHarness();
  await startOverlay(harness, { initial: "x" });
  assert.deepEqual(harness.roamRecord.updates, [{ uid: "cell00001", string: "x" }]);
  assert.deepEqual(harness.adapter.selfWrites, [{ uid: "cell00001", from: "Alpha", to: "x" }], "the seed is recorded so its own echo is absorbed");
  assert.deepEqual(harness.adapter.patches, [{ uid: "cell00001", raw: "x" }]);
  assert.equal(harness.overlay.textarea.value, "x");
  assert.equal(harness.overlay.textarea.selectionStart, 1);
  assert.equal(harness.overlay.beforeRaw, "Alpha", "beforeRaw is the value the cell had before the seed");
});

test("the keydown table intercepts what would damage the row and passes what belongs to Roam", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const harness = makeOverlayHarness();
  await startOverlay(harness);
  const { overlay } = harness;
  const node = harness.cell.querySelector(".rg-native-cell-editor");
  const textarea = overlay.textarea;
  let popupOpen = false;
  overlay.nativeAutocompleteOpen = () => popupOpen;
  const commits = []; const cancels = []; const repairs = [];
  overlay.commit = async (movement) => { commits.push(movement); return null; };
  overlay.cancel = async () => { cancels.push(true); return null; };
  overlay.scheduleStructureRepair = () => { repairs.push(true); return null; };
  const setCaret = (value, start, end = start) => { textarea.value = value; textarea.setSelectionRange(start, end); };

  setCaret("Alpha", 3);
  let fired = keydownOn(node, { key: "Enter", shiftKey: false, target: textarea });
  assert.equal(fired.event.defaultPrevented, true);
  assert.equal(fired.stopped, true);
  assert.deepEqual(commits, [[1, 0]], "Enter with the menu closed commits and moves down");
  assert.deepEqual(repairs, []);

  popupOpen = true;
  fired = keydownOn(node, { key: "Enter", shiftKey: false, target: textarea });
  assert.equal(fired.event.defaultPrevented, false, "Enter selects the menu row — Roam owns it");
  assert.equal(commits.length, 1);
  assert.deepEqual(repairs, [true], "a passed-through Enter schedules the split check from pinned fact 6");

  fired = keydownOn(node, { key: "Tab", shiftKey: false, target: textarea });
  assert.equal(fired.event.defaultPrevented, false);
  assert.equal(repairs.length, 2);
  popupOpen = false;
  fired = keydownOn(node, { key: "Tab", shiftKey: true, target: textarea });
  assert.equal(fired.event.defaultPrevented, true);
  assert.deepEqual(commits.at(-1), [0, -1], "Shift+Tab commits leftward");

  popupOpen = true;
  fired = keydownOn(node, { key: "Escape", target: textarea });
  assert.equal(fired.event.defaultPrevented, false, "Escape closes Roam's menu first");
  assert.deepEqual(cancels, []);
  assert.equal(overlay.popupJustClosed, true);
  fired = keydownOn(node, { key: "Escape", target: textarea });
  assert.equal(fired.event.defaultPrevented, true, "the menu is gone one keystroke later, so Escape now cancels");
  assert.deepEqual(cancels, [true]);
  overlay.popupJustClosed = false;
  popupOpen = false;

  setCaret("Alpha", 0);
  fired = keydownOn(node, { key: "Backspace", target: textarea });
  assert.equal(fired.event.defaultPrevented, true, "Backspace at caret 0 would merge the cell into the previous chain block");
  assert.equal(fired.stopped, true);
  setCaret("Alpha", 0, 3);
  fired = keydownOn(node, { key: "Backspace", target: textarea });
  assert.equal(fired.event.defaultPrevented, false, "with a selection Backspace is an ordinary delete");
  setCaret("Alpha", 1);
  fired = keydownOn(node, { key: "Backspace", target: textarea });
  assert.equal(fired.event.defaultPrevented, false);

  setCaret("Alpha", 5);
  fired = keydownOn(node, { key: "Delete", target: textarea });
  assert.equal(fired.event.defaultPrevented, true, "Delete at the end would forward-merge the hidden next-column cell");
  setCaret("Alpha", 2);
  fired = keydownOn(node, { key: "Delete", target: textarea });
  assert.equal(fired.event.defaultPrevented, false);

  setCaret("one\ntwo", 1);
  fired = keydownOn(node, { key: "ArrowUp", target: textarea });
  assert.equal(fired.event.defaultPrevented, true, "the caret is clamped inside the cell");
  fired = keydownOn(node, { key: "ArrowDown", target: textarea });
  assert.equal(fired.event.defaultPrevented, false, "a second line below means ArrowDown stays in the cell");
  setCaret("one\ntwo", 5);
  fired = keydownOn(node, { key: "ArrowDown", target: textarea });
  assert.equal(fired.event.defaultPrevented, true);
  popupOpen = true;
  setCaret("one\ntwo", 1);
  fired = keydownOn(node, { key: "ArrowUp", target: textarea });
  assert.equal(fired.event.defaultPrevented, false, "with the menu open the arrows navigate it");
  popupOpen = false;

  setCaret("Alpha", 2);
  fired = keydownOn(node, { key: "Enter", shiftKey: true, target: textarea });
  assert.equal(fired.event.defaultPrevented, false, "Shift+Enter is a legal soft break");
  fired = keydownOn(node, { key: "z", metaKey: true, target: textarea });
  assert.equal(fired.event.defaultPrevented, false, "⌘Z mid-edit is the browser's native undo on Roam's textarea");
  fired = keydownOn(node, { key: "Enter", metaKey: true, target: textarea });
  assert.equal(fired.event.defaultPrevented, false, "⌘Enter is Roam's TODO toggle — content-only, not structural, so it passes through");
  fired = keydownOn(node, { key: "ArrowUp", metaKey: true, shiftKey: true, target: textarea });
  assert.equal(fired.event.defaultPrevented, true, "a block-move chord would take the cell out of its row chain");

  overlay.state.composing = true;
  setCaret("Alpha", 3);
  fired = keydownOn(node, { key: "Enter", shiftKey: false, target: textarea });
  assert.equal(fired.event.defaultPrevented, false, "an IME composition owns Enter");
  overlay.state.composing = false;
  const commitCount = commits.length;
  keydownOn(node, { key: "Enter", shiftKey: false, isComposing: true, target: textarea });
  assert.equal(commits.length, commitCount);
});

test("the popup probe reads Roam's portal and only falls back where that selector has never matched", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const harness = makeOverlayHarness();
  await startOverlay(harness);
  const { overlay, dom } = harness;
  assert.equal(overlay.nativeAutocompleteOpen(), false);
  overlay.textarea.value = "[[Pro"; overlay.textarea.setSelectionRange(5, 5);
  assert.equal(overlay.nativeAutocompleteOpen(), true, "with no portal ever seen an open trigger context stands in for it");
  dom.state.popupOpen = true;
  assert.equal(overlay.nativeAutocompleteOpen(), true);
  dom.state.popupOpen = false;
  assert.equal(overlay.nativeAutocompleteOpen(), false, "once the real portal has been seen, its absence is authoritative");
  dom.state.popupOpen = true;
  dom.popup.hidden = true;
  assert.equal(overlay.nativeAutocompleteOpen(), false, "a hidden portal is a closed menu");
  dom.popup.hidden = false;
});

test("a multi-line paste becomes one line instead of a block per line", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  assert.equal(sanitizeNativePasteText("one\r\n  two \n\nthree"), "one two three");
  assert.equal(sanitizeNativePasteText("single"), "single");
  const harness = makeOverlayHarness();
  await startOverlay(harness);
  const node = harness.cell.querySelector(".rg-native-cell-editor");
  harness.overlay.textarea.value = ""; harness.overlay.textarea.setSelectionRange(0, 0);
  const multi = node.dispatch("paste", { clipboardData: { getData: () => "one\ntwo" }, target: harness.overlay.textarea });
  assert.equal(multi.defaultPrevented, true);
  assert.equal(harness.overlay.textarea.value, "one two");
  const single = node.dispatch("paste", { clipboardData: { getData: () => "plain" }, target: harness.overlay.textarea });
  assert.equal(single.defaultPrevented, false, "a single-line paste is Roam's to handle");
});

test("commit reads the live textarea, writes it back, syncs the model and reports through onFinish", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const harness = makeOverlayHarness();
  await startOverlay(harness);
  // PINNED FACT 7: Roam has not written :block/string yet, so Datascript still says "Alpha".
  harness.overlay.textarea.value = "Typed live";
  const result = await harness.overlay.commit([1, 0]);
  assert.deepEqual(result, { uid: "cell00001", value: "Typed live", movement: [1, 0] });
  assert.deepEqual(harness.roamRecord.updates, [{ uid: "cell00001", string: "Typed live" }]);
  assert.deepEqual(harness.adapter.selfWrites, [{ uid: "cell00001", from: "Alpha", to: "Typed live" }]);
  assert.deepEqual(harness.adapter.patches, [{ uid: "cell00001", raw: "Typed live" }]);
  assert.equal(harness.model.getRaw(0, 0), "Typed live");
  assert.deepEqual(harness.finishes, [{ row: 0, col: 0, cell: harness.cell, raw: "Alpha", value: "Typed live", commit: true, movement: [1, 0] }]);
  assert.deepEqual(harness.session.calls.end, [{ uid: "cell00001", beforeRaw: "Alpha", afterRaw: "Typed live", commit: true }]);
  assert.equal(harness.cell.querySelector(".rg-native-cell-editor"), null);
  assert.equal(harness.cell.classList.contains("rg-cell--native-editing"), false);
  assert.equal(await harness.overlay.commit([1, 0]), null, "a second commit on a finished overlay is a no-op");
  assert.equal(harness.roamRecord.updates.length, 1);
});

test("commit falls back to the stored block string when focus has already left the overlay", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const harness = makeOverlayHarness();
  await startOverlay(harness);
  harness.roamRecord.strings.cell00001 = "Flushed by Roam";
  harness.overlay.textarea = null;
  await harness.overlay.commit(null);
  assert.equal(harness.model.getRaw(0, 0), "Flushed by Roam");
  assert.deepEqual(harness.roamRecord.updates, [], "the graph already holds that value; committing it again would be a redundant write");
  assert.deepEqual(harness.adapter.patches, [{ uid: "cell00001", raw: "Flushed by Roam" }]);
});

test("an emptied cell commits as Roam's single space and a spaced cell commits back to text", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const emptied = makeOverlayHarness();
  await startOverlay(emptied);
  emptied.overlay.textarea.value = "";
  await emptied.overlay.commit(null);
  assert.deepEqual(emptied.roamRecord.updates, [{ uid: "cell00001", string: " " }], "an empty cell is stored as a single space so Roam keeps the block");
  assert.deepEqual(emptied.adapter.patches, [{ uid: "cell00001", raw: "" }], "the base records the raw value, which is the empty string");
  assert.equal(emptied.model.getRaw(0, 0), "");

  const spaced = makeOverlayHarness({ strings: { cell00001: " ", cell00002: "Beta" } });
  const started = await startOverlay(spaced, { raw: "" });
  assert.ok(started);
  assert.equal(spaced.overlay.textarea.value, " ");
  spaced.overlay.textarea.value = "Filled";
  await spaced.overlay.commit(null);
  assert.deepEqual(spaced.roamRecord.updates, [{ uid: "cell00001", string: "Filled" }]);
  assert.deepEqual(spaced.adapter.selfWrites, [{ uid: "cell00001", from: "", to: "Filled" }], "the block held raw \"\", not \" \"");
  assert.deepEqual(spaced.session.calls.end.at(-1), { uid: "cell00001", beforeRaw: "", afterRaw: "Filled", commit: true });

  const unchanged = makeOverlayHarness({ strings: { cell00001: " ", cell00002: "Beta" } });
  await startOverlay(unchanged, { raw: "" });
  await unchanged.overlay.commit(null);
  assert.deepEqual(unchanged.roamRecord.updates, [{ uid: "cell00001", string: " " }], "an untouched empty cell is rewritten as \" \" rather than left to collapse");
  assert.deepEqual(unchanged.adapter.selfWrites, [], "nothing changed, so there is no echo to absorb");
});

test("cancel restores the exact bytes the cell held, absorbing whatever Roam flushed on blur", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const harness = makeOverlayHarness();
  await startOverlay(harness, { initial: "z" });
  harness.roamRecord.updates.length = 0; harness.adapter.selfWrites.length = 0; harness.adapter.patches.length = 0;
  harness.overlay.textarea.value = "zebra";
  harness.overlay.reconcileDelayMs = 3; // poll fast in the test
  const result = await harness.overlay.cancel();
  assert.deepEqual(result, { uid: "cell00001", value: "Alpha" });
  assert.deepEqual(harness.roamRecord.updates, [{ uid: "cell00001", string: "Alpha" }], "byte-identical restore, unconditionally");
  assert.deepEqual(harness.adapter.selfWrites, [
    { uid: "cell00001", from: null, to: "zebra" },
    { uid: "cell00001", from: "zebra", to: "Alpha" },
  ], "the blur flush and the restore are both absorbed, in order");
  assert.deepEqual(harness.adapter.patches, [{ uid: "cell00001", raw: "Alpha" }]);
  assert.equal(harness.model.getRaw(0, 0), "Alpha");
  assert.deepEqual(harness.finishes, [{ row: 0, col: 0, cell: harness.cell, raw: "Alpha", value: "Alpha", commit: false, movement: null }]);
  assert.deepEqual(harness.session.calls.end, [{ uid: "cell00001", beforeRaw: "Alpha", afterRaw: "Alpha", commit: false }]);
});

test("dispose is idempotent, unmounts, and never writes what Roam last saved", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const harness = makeOverlayHarness();
  await startOverlay(harness);
  harness.overlay.textarea.value = "half typed";
  harness.overlay.dispose();
  harness.overlay.dispose();
  assert.deepEqual(harness.roamRecord.updates, [], "a mid-edit disposal must not clobber whatever Roam last saved");
  assert.deepEqual(harness.adapter.selfWrites, []);
  assert.deepEqual(harness.finishes, []);
  assert.equal(harness.cell.querySelector(".rg-native-cell-editor"), null);
  assert.equal(harness.cell.classList.contains("rg-cell--editing"), false);
  assert.deepEqual(harness.session.calls.end, [{ uid: "cell00001", commit: false }], "the session's overlay claim is released without an undo entry");
  assert.equal(harness.overlay.active, false);
  assert.equal(await startOverlay(harness), null, "a disposed overlay refuses to start again");
});

test("a click outside the overlay commits, and a click inside Roam's own menu does not", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const harness = makeOverlayHarness();
  await startOverlay(harness);
  const commits = [];
  harness.overlay.commit = async (movement) => { commits.push(movement); return null; };
  harness.dom.firePointerDown(harness.overlay.textarea);
  assert.deepEqual(commits, [], "a click inside the overlay is ordinary caret placement");
  const menuRow = new OverlayNode("div");
  harness.dom.popup.appendChild(menuRow);
  harness.dom.body.appendChild(harness.dom.popup);
  harness.dom.firePointerDown(menuRow);
  assert.deepEqual(commits, [], "Roam's menu is mounted on the body, outside our node — accepting a row is not a click-away");
  const elsewhere = new OverlayNode("div"); harness.dom.body.appendChild(elsewhere);
  harness.dom.firePointerDown(elsewhere);
  assert.deepEqual(commits, [null], "a click anywhere else commits the edit in place");
});

test("a caret that escapes into a hidden chained cell commits, and one that lands on a stray repairs", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const harness = makeOverlayHarness();
  await startOverlay(harness);
  const node = harness.cell.querySelector(".rg-native-cell-editor");
  const commits = []; const repairs = [];
  harness.overlay.commit = async (movement) => { commits.push(movement); return null; };
  harness.overlay.scheduleStructureRepair = (options) => { repairs.push(options); return null; };

  const chained = new OverlayNode("div"); chained.className = "rm-block__input"; chained.id = "block-input-x-cell00002"; node.appendChild(chained);
  node.dispatch("focusin", { target: chained });
  assert.deepEqual(commits, [null], "the chained next-column cell is hidden, not absent — typing into it must not be possible");

  commits.length = 0;
  const stray = new OverlayNode("div"); stray.className = "rm-block__input"; stray.id = "block-input-x-strayblok"; node.appendChild(stray);
  node.dispatch("focusin", { target: stray });
  assert.deepEqual(commits, [], "a uid the table has never seen is a split remainder, not an escape");
  assert.deepEqual(repairs, [{ commitWhenClean: true }]);

  const own = new OverlayNode("div"); own.className = "rm-block__input"; own.id = "block-input-x-cell00001"; node.appendChild(own);
  node.dispatch("focusin", { target: own });
  assert.deepEqual(commits, []);
});

test("repairStructure merges Roam's split remainder back into the cell and deletes the stray", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const base = {
    uid: "table0001", string: "{{[[table]]}}", order: 0, children: [
      { uid: "cell00001", string: "Alpha", order: 0, children: [{ uid: "cell00002", string: "Beta", order: 0, children: [] }] },
    ],
  };
  const damaged = {
    uid: "table0001", string: "{{[[table]]}}", order: 0, children: [
      { uid: "cell00001", string: "Al", order: 0, children: [
        { uid: "cell00002", string: "Beta", order: 0, children: [] },
        { uid: "strayblok", string: "pha", order: 1, children: [] },
      ] },
    ],
  };
  assert.deepEqual(nativeOverlayStrayRepair(base, damaged, "cell00001"), { cellUid: "cell00001", strays: [{ uid: "strayblok", text: "pha" }] });
  assert.equal(nativeOverlayStrayRepair(base, base, "cell00001"), null, "an undamaged tree needs no repair");

  const twoStrays = structuredClone(damaged);
  twoStrays.children[0].children.push({ uid: "strayblo2", string: "more", order: 2, children: [] });
  assert.deepEqual(nativeOverlayStrayRepair(base, twoStrays, "cell00001"), {
    cellUid: "cell00001",
    strays: [{ uid: "strayblok", text: "pha" }, { uid: "strayblo2", text: "more" }],
  }, "every childless stray under the edited cell merges back in document order — the signature-based watch cannot see any of them");

  const nested = structuredClone(damaged);
  nested.children[0].children[1].children = [{ uid: "strayblo3", string: "deep", order: 0, children: [] }];
  assert.deepEqual(nativeOverlayStrayRepair(base, nested, "cell00001"), { cellUid: "cell00001", forceReload: true, strays: [] }, "a stray with children is more than a split remainder — the structural-reload lane must be forced");

  const elsewhere = structuredClone(base);
  elsewhere.children[0].children[0].children = [{ uid: "strayblo4", string: "x", order: 0, children: [] }];
  assert.equal(nativeOverlayStrayRepair(base, elsewhere, "cell00001"), null, "a stray under a different cell is not this cell's split");

  const harness = makeOverlayHarness({ strings: { cell00001: "Al", cell00002: "Beta", strayblok: "pha" }, tree: damaged });
  harness.adapter.baseTree = base;
  await startOverlay(harness, { raw: "Alpha" });
  harness.overlay.textarea.value = "Al";
  const plan = await harness.overlay.repairStructure();
  assert.deepEqual(plan, { cellUid: "cell00001", strays: [{ uid: "strayblok", text: "pha" }] });
  assert.deepEqual(harness.roamRecord.updates, [{ uid: "cell00001", string: "Alpha" }]);
  assert.deepEqual(harness.roamRecord.deletes, ["strayblok"]);
  assert.deepEqual(harness.adapter.selfWrites, [{ uid: "cell00001", from: "Al", to: "Alpha" }]);
  assert.equal(harness.adapter.transitions.length, 1, "the repair is declared so the pull-watch echo is absorbed rather than reloading the grid");
  assert.equal(harness.overlay.textarea.value, "Alpha");
  assert.equal(harness.overlay.textarea.selectionStart, 2, "the caret lands where the split happened");

  const emptyStray = structuredClone(damaged);
  emptyStray.children[0].children[1].string = "";
  const second = makeOverlayHarness({ strings: { cell00001: "Al", cell00002: "Beta", strayblok: "" }, tree: emptyStray });
  second.adapter.baseTree = base;
  await startOverlay(second, { raw: "Alpha" });
  second.overlay.textarea.value = "Al";
  await second.overlay.repairStructure();
  assert.deepEqual(second.roamRecord.updates, [], "an empty stray only needs deleting");
  assert.deepEqual(second.roamRecord.deletes, ["strayblok"]);
});

test("GridView.render wires exactly one native overlay and hands it the editor controller's finish closure", async (t) => {
  t.after(() => { settingsCache.clear(); resetNativeEditorHealth(); runtime.registries = null; releaseKeyboard(); });
  installOverlayDom();
  resetNativeEditorHealth();
  runtime.registries = new RegistrySet();
  globalThis.window.roamAlphaAPI = { ui: { components: {} } };
  const model = new GridModel({ tableUid: "table0001", rows: [[{ uid: "cell00001", raw: "Alpha" }, { uid: "cell00002", raw: "Beta" }]] });
  const commits = []; const moves = []; const finished = [];
  const root = new OverlayNode("section"); root.className = "rg-root"; globalThis.document.body.appendChild(root);
  const view = Object.assign(Object.create(GridView.prototype), {
    model, root, cells: new Map(), cellCoordinatesByUid: new Map(), selection: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    anchor: { row: 0, col: 0 }, selectedCellElements: new Set(), activeCellElement: null, selectionControls: new Set(),
    context: "source", surface: "main", disposed: false, editorController: null, nativeOverlay: null, viewport: null,
    referenceCounts: new Map(), commentThreads: new Map(), inlineReferenceDisposers: new Set(),
    session: { editorFinished: (value) => finished.push(value), scheduleReferenceCountRefresh() {}, removeView() {} },
    commitMutation: (label, mutation) => { commits.push(label); mutation(); return Promise.resolve(model); },
    moveSelection: (dr, dc) => moves.push([dr, dc]),
    renderCellValue() {},
    updateReferenceCountBadges() {},
    syncCommentAffordance() {},
  });

  view.render();
  const first = view.nativeOverlay;
  assert.ok(first instanceof NativeCellEditorOverlay);
  view.render();
  assert.notEqual(view.nativeOverlay, first, "a re-render replaces the overlay alongside its controller");
  assert.equal(first.disposed, true, "the previous overlay is disposed, not leaked");

  claimKeyboard({ root: new OverlayNode("section"), surface: "main", onKeydown() {} });
  await view.nativeOverlay.onFinish({ row: 0, col: 0, cell: new OverlayNode("div"), raw: "Alpha", value: "Committed", commit: true, movement: [1, 0] });
  assert.deepEqual(commits, ["Edit cell"], "the overlay finishes through the controller's own closure");
  assert.equal(model.getRaw(0, 0), "Committed");
  assert.deepEqual(moves, [[1, 0]]);
  assert.deepEqual(finished, [view]);
  assert.equal(keyboardOwner()?.view, view, "committing a native edit hands the keyboard back to the grid");

  view.dispose();
  assert.equal(view.nativeOverlay, null);
});

/* --------------------------------------------------------------------------------------------
 * GOAL-FIX-C2 — native overlay lifecycle: mid-edit renders, reentrancy, failed-start cleanup,
 * popup-probe gating, multi-stray repair, cancelled frames and the double-accept seam.
 * ------------------------------------------------------------------------------------------ */

test("a mid-edit re-render commits the live overlay instead of throwing the typed text away", async (t) => {
  t.after(() => { settingsCache.clear(); resetNativeEditorHealth(); runtime.registries = null; releaseKeyboard(); });
  installOverlayDom();
  resetNativeEditorHealth();
  runtime.registries = new RegistrySet();
  const roamRecord = installOverlayRoam({ strings: { cell00001: "Alpha", cell00002: "Beta" } });
  const model = new GridModel({ tableUid: "table0001", rows: [[{ uid: "cell00001", raw: "Alpha" }, { uid: "cell00002", raw: "Beta" }]] });
  const root = new OverlayNode("section"); root.className = "rg-root"; globalThis.document.body.appendChild(root);
  const session = { ...overlaySession(), editorFinished() {}, scheduleReferenceCountRefresh() {}, removeView() {} };
  const view = Object.assign(Object.create(GridView.prototype), {
    model, root, cells: new Map(), cellCoordinatesByUid: new Map(), selection: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    anchor: { row: 0, col: 0 }, selectedCellElements: new Set(), activeCellElement: null, selectionControls: new Set(),
    context: "source", surface: "main", disposed: false, editorController: null, nativeOverlay: null, viewport: null,
    referenceCounts: new Map(), commentThreads: new Map(), inlineReferenceDisposers: new Set(),
    session,
    commitMutation: (label, mutation) => { mutation(); return Promise.resolve(model); },
    moveSelection() {}, renderCellValue() {}, updateReferenceCountBadges() {}, syncCommentAffordance() {},
  });
  view.render();
  const overlay = view.nativeOverlay;
  const cell = view.cells.get("0:0");
  assert.ok(cell);
  assert.ok(await overlay.start({ row: 0, col: 0, cell, uid: "cell00001", raw: "Alpha" }));
  overlay.textarea.value = "Typed mid-edit";

  view.render();
  assert.equal(overlay.active, false, "the render finishes the edit rather than leaking a dead overlay");
  await new Promise((resolve) => setTimeout(resolve, 0));
  // PINNED FACT 7: Roam had not flushed, so the text existed only in the textarea. A dispose would
  // have written nothing; a commit captures it synchronously before the DOM is swapped.
  assert.deepEqual(roamRecord.updates, [{ uid: "cell00001", string: "Typed mid-edit" }], "the typed text reaches the graph");
  assert.equal(model.getRaw(0, 0), "Typed mid-edit");
  assert.ok(view.nativeOverlay);
  assert.notEqual(view.nativeOverlay, overlay, "the re-render wires a fresh overlay");
  assert.equal(view.nativeOverlay.active, false);

  view.dispose();
});

test("a row-deletion patch refuses to run under a live native overlay", async (t) => {
  t.after(() => { settingsCache.clear(); resetNativeEditorHealth(); releaseKeyboard(); });
  installOverlayDom();
  resetNativeEditorHealth();
  const viewport = new OverlayNode("div"); const grid = new OverlayNode("div");
  const view = Object.assign(Object.create(GridView.prototype), {
    viewport, gridElement: grid,
    editorController: { state: null }, nativeOverlay: { active: true },
    resizeCleanup: null, rowResizePreview: null, columnResizePreview: null, dragSelecting: false, fillStart: null,
    hasCustomCellRenderers: () => { throw new Error("reached past the overlay guard"); },
  });
  // The incremental path swaps cell DOM under the overlay's live textarea; it must fall through to
  // render(), which commits the edit first.
  assert.equal(view.patchRowDeletion({ viewport, gridElement: grid }), false);
});

test("a re-entrant start shares the in-flight mount instead of stacking a second editor", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const harness = makeOverlayHarness();
  const args = { row: 0, col: 0, cell: harness.cell, uid: "cell00001", raw: "Alpha", initial: "x" };
  // OS key auto-repeat fires beginEdit again while the first start is still awaiting Roam.
  const first = harness.overlay.start(args);
  const second = harness.overlay.start(args);
  const [one, two] = await Promise.all([first, second]);
  assert.ok(one);
  assert.equal(two, one, "the repeated keystroke joins the mount already in flight — falling back to the grid editor would stack two editors");
  assert.equal(harness.roamRecord.mounts.length, 1, "one overlay, one Roam mount");
  assert.equal(harness.roamRecord.updates.filter((update) => update.string === "x").length, 1, "one seed write");
  assert.equal(harness.cell.querySelectorAll(".rg-native-cell-editor").length, 1);
  harness.overlay.dispose();
});

test("a failed start releases the session claim and restores the cell it seeded", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  // Failure AFTER the claim: Roam mounted the block but never yielded a textarea.
  const harness = makeOverlayHarness({ mode: "no-textarea" });
  harness.overlay.nextFrame = async () => {};
  const result = await harness.overlay.start({ row: 0, col: 0, cell: harness.cell, uid: "cell00001", raw: "Alpha", initial: "x" });
  assert.equal(result, null);
  assert.deepEqual(harness.session.calls.begin, ["cell00001"]);
  assert.deepEqual(harness.session.calls.end, [{ uid: "cell00001", commit: false }], "a leaked claim makes every later external edit to this cell invisible to undo");
  assert.deepEqual(harness.roamRecord.updates, [
    { uid: "cell00001", string: "x" },
    { uid: "cell00001", string: "Alpha" },
  ], "the seed character is reverted — the fallback editor must open on the pre-seed value");
  assert.deepEqual(harness.adapter.patches.at(-1), { uid: "cell00001", raw: "Alpha" });
  assert.equal(harness.roamRecord.strings.cell00001, "Alpha");

  // Failure BEFORE the claim: renderBlock itself is missing. The seed is still reverted.
  const early = makeOverlayHarness({ mode: "no-render-block" });
  assert.equal(await early.overlay.start({ row: 0, col: 0, cell: early.cell, uid: "cell00001", raw: "Alpha", initial: "y" }), null);
  assert.deepEqual(early.session.calls.begin, []);
  assert.deepEqual(early.session.calls.end, [], "no claim was taken, so nothing is released");
  assert.deepEqual(early.roamRecord.updates, [
    { uid: "cell00001", string: "y" },
    { uid: "cell00001", string: "Alpha" },
  ]);
});

test("the popup fallback ignores a trigger context that was already open when the edit mounted", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  // The portal selector has never matched all session, so the trigger-context fallback is live. A
  // cell that simply READS `… #done` must not look like an open menu — that wedges Enter into a
  // block split and leaves repair focusing a detached textarea.
  const harness = makeOverlayHarness({ strings: { cell00001: "see #done", cell00002: "Beta" } });
  await startOverlay(harness, { raw: "see #done" });
  assert.equal(harness.overlay.textarea.value, "see #done");
  assert.equal(harness.overlay.nativeAutocompleteOpen(), false, "a pre-existing #tag context is text, not a menu");
  harness.overlay.textarea.value = "see #done [[Ne"; harness.overlay.textarea.setSelectionRange(13, 13);
  assert.equal(harness.overlay.nativeAutocompleteOpen(), true, "a context opened DURING this edit still stands in for the popup");
  harness.overlay.dispose();
});

test("a multi-stray split merges every childless stray back in document order", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const base = {
    uid: "table0001", string: "{{[[table]]}}", order: 0, children: [
      { uid: "cell00001", string: "Alpha", order: 0, children: [{ uid: "cell00002", string: "Beta", order: 0, children: [] }] },
    ],
  };
  const damaged = {
    uid: "table0001", string: "{{[[table]]}}", order: 0, children: [
      { uid: "cell00001", string: "Al", order: 0, children: [
        { uid: "cell00002", string: "Beta", order: 0, children: [] },
        { uid: "stray0001", string: "pha", order: 1, children: [] },
        { uid: "stray0002", string: "-more", order: 2, children: [] },
      ] },
    ],
  };
  const harness = makeOverlayHarness({ strings: { cell00001: "Al", cell00002: "Beta", stray0001: "pha", stray0002: "-more" }, tree: damaged });
  harness.adapter.baseTree = base;
  await startOverlay(harness, { raw: "Alpha" });
  harness.overlay.textarea.value = "Al";
  const plan = await harness.overlay.repairStructure();
  assert.deepEqual(plan, { cellUid: "cell00001", strays: [{ uid: "stray0001", text: "pha" }, { uid: "stray0002", text: "-more" }] });
  assert.deepEqual(harness.roamRecord.updates, [{ uid: "cell00001", string: "Alpha-more" }], "both remainders merge into the cell in document order");
  assert.deepEqual(harness.roamRecord.deletes, ["stray0001", "stray0002"]);
  assert.equal(harness.adapter.transitions.length, 1, "the repair is declared so the echo is absorbed");
  assert.equal(harness.overlay.textarea.value, "Alpha-more");
  harness.overlay.dispose();
});

test("a stray with children of its own forces the structural reload lane explicitly", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const base = {
    uid: "table0001", string: "{{[[table]]}}", order: 0, children: [
      { uid: "cell00001", string: "Alpha", order: 0, children: [{ uid: "cell00002", string: "Beta", order: 0, children: [] }] },
    ],
  };
  const damaged = {
    uid: "table0001", string: "{{[[table]]}}", order: 0, children: [
      { uid: "cell00001", string: "Al", order: 0, children: [
        { uid: "cell00002", string: "Beta", order: 0, children: [] },
        { uid: "stray0001", string: "pha", order: 1, children: [{ uid: "stray0002", string: "deep", order: 0, children: [] }] },
      ] },
    ],
  };
  const harness = makeOverlayHarness({ strings: { cell00001: "Al", cell00002: "Beta", stray0001: "pha", stray0002: "deep" }, tree: damaged });
  harness.adapter.baseTree = base;
  const reloads = [];
  harness.session.handleExternalChange = (externalModel, event) => reloads.push({ externalModel, event });
  await startOverlay(harness, { raw: "Alpha" });
  harness.overlay.textarea.value = "Al";
  const plan = await harness.overlay.repairStructure();
  assert.deepEqual(plan, { cellUid: "cell00001", forceReload: true, strays: [] });
  assert.equal(reloads.length, 1, "the signature-based watch computes structural === false for this shape — the reload must be forced");
  assert.equal(reloads[0].event.structural, true);
  assert.ok(reloads[0].externalModel, "the reload receives the live tree as a model");
  assert.deepEqual(harness.roamRecord.deletes, [], "a nested stray is the reload lane's, not the merge lane's");
  harness.overlay.dispose();
});

test("a frame cancelled by teardown still resolves the promise start() is awaiting", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); });
  resetNativeEditorHealth();
  const harness = makeOverlayHarness({ mode: "no-textarea" });
  let armed = false;
  globalThis.requestAnimationFrame = () => { armed = true; return 42; }; // never calls back
  globalThis.cancelAnimationFrame = () => {};
  let settled = null;
  const pending = harness.overlay.start({ row: 0, col: 0, cell: harness.cell, uid: "cell00001", raw: "Alpha" })
    .then((value) => { settled = value === null ? "null" : "state"; return settled; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(armed, true, "the textarea poll is parked on a frame that will never fire");
  harness.overlay.dispose();
  const raced = await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve("pending"), 50))]);
  assert.equal(raced, "null", "a cancelled frame must still resolve — otherwise beginEditLocal is retained forever");
  assert.equal(settled, "null");
});

/* --------------------------------------------------------------------------------------------
 * GOAL-FIX-E — the Escape wedge. Reproduced live: `test` + ` [[` opens Roam's menu and auto-pairs
 * to `test [[]]`, then two Escapes leave the overlay mounted and `test [[]]` in the graph. Every
 * test below is one of the seams that let that happen.
 * ------------------------------------------------------------------------------------------ */

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function autoPairHarness() {
  return makeOverlayHarness({ strings: { cell00001: "test", cell00002: "Beta" } });
}

test("a second Escape cancels even while Roam's portal still reads open over an auto-paired [[]]", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); releaseKeyboard(); });
  resetNativeEditorHealth();
  const harness = autoPairHarness();
  await startOverlay(harness, { raw: "test" });
  const node = harness.cell.querySelector(".rg-native-cell-editor");
  // Roam auto-paired the brackets and parked the caret between them.
  harness.overlay.textarea.value = "test [[]]";
  harness.overlay.textarea.setSelectionRange(7, 7);
  harness.dom.state.popupOpen = true;

  let fired = keydownOn(node, { key: "Escape", target: harness.overlay.textarea });
  assert.equal(fired.event.defaultPrevented, false, "the first Escape is lent to Roam so its menu closes");
  assert.equal(harness.overlay.active, true);
  assert.deepEqual(harness.roamRecord.updates, []);

  // A human's second keystroke is many frames later, so the one-frame marker has long expired…
  await settle();
  assert.equal(harness.overlay.popupJustClosed, false);
  // …and Roam re-renders its portal while the caret sits inside `[[]]`, so the probe still says OPEN.
  assert.equal(harness.overlay.nativeAutocompleteOpen(), true, "sanity: the probe reads the menu as open");

  fired = keydownOn(node, { key: "Escape", target: harness.overlay.textarea });
  assert.equal(fired.event.defaultPrevented, true, "the loan is spent — this Escape is the overlay's cancel");
  assert.equal(harness.overlay.active, false, "the overlay tears down instead of wedging");
  await settle();
  assert.equal(harness.cell.querySelector(".rg-native-cell-editor"), null);
  assert.equal(harness.cell.classList.contains("rg-cell--native-editing"), false);
  assert.deepEqual(harness.roamRecord.updates, [{ uid: "cell00001", string: "test" }], "byte-exact restore, not the auto-paired value");
  assert.deepEqual(harness.adapter.selfWrites, [
    { uid: "cell00001", from: null, to: "test [[]]" },
    { uid: "cell00001", from: "test [[]]", to: "test" },
  ], "Roam's flush and the restore are both absorbed");
  assert.equal(harness.roamRecord.strings.cell00001, "test");
  assert.deepEqual(harness.finishes.at(-1), { row: 0, col: 0, cell: harness.cell, raw: "test", value: "test", commit: false, movement: null });
});

test("typing after a menu closes lends Escape to the menu again", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); releaseKeyboard(); });
  resetNativeEditorHealth();
  const harness = autoPairHarness();
  await startOverlay(harness, { raw: "test" });
  const node = harness.cell.querySelector(".rg-native-cell-editor");
  harness.dom.state.popupOpen = true;
  keydownOn(node, { key: "Escape", target: harness.overlay.textarea });
  await settle();
  // A new trigger typed into the cell is a new menu episode, not a continuation of the old one.
  node.dispatch("input", { target: harness.overlay.textarea });
  const fired = keydownOn(node, { key: "Escape", target: harness.overlay.textarea });
  assert.equal(fired.event.defaultPrevented, false, "the fresh menu gets its own closing Escape");
  assert.equal(harness.overlay.active, true);
  harness.overlay.dispose();
});

test("an Escape Roam never lets reach the overlay still cancels the edit", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); releaseKeyboard(); });
  resetNativeEditorHealth();
  const harness = autoPairHarness();
  await startOverlay(harness, { raw: "test" });
  harness.overlay.textarea.value = "test [[]]";
  harness.overlay.textarea.setSelectionRange(7, 7);
  harness.dom.state.popupOpen = true;

  // Roam stops the keydown in the capture phase above us: the overlay-scoped listener never fires.
  let event = harness.dom.fireDocument("keydown", { key: "Escape", target: harness.overlay.textarea });
  assert.equal(event.defaultPrevented, false, "the menu-closing Escape is still Roam's");
  assert.equal(harness.overlay.active, true);
  await settle();

  harness.dom.state.popupOpen = false;
  event = harness.dom.fireDocument("keydown", { key: "Escape", target: harness.overlay.textarea });
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.overlay.active, false, "the document-level backstop owns the cancel");
  await settle();
  assert.deepEqual(harness.roamRecord.updates, [{ uid: "cell00001", string: "test" }]);
  assert.equal(harness.cell.querySelector(".rg-native-cell-editor"), null);
});

test("an Escape whose keydown is swallowed outright is recovered from the keyup", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); releaseKeyboard(); });
  resetNativeEditorHealth();
  const harness = autoPairHarness();
  await startOverlay(harness, { raw: "test" });
  harness.overlay.textarea.value = "test [[]]";
  harness.dom.state.popupOpen = true;

  harness.dom.fireDocument("keyup", { key: "Escape", target: harness.overlay.textarea });
  assert.equal(harness.overlay.active, true, "the first Escape still belongs to the open menu");
  await settle();
  harness.dom.state.popupOpen = false;
  harness.dom.fireDocument("keyup", { key: "Escape", target: harness.overlay.textarea });
  assert.equal(harness.overlay.active, false);
  await settle();
  assert.deepEqual(harness.roamRecord.updates, [{ uid: "cell00001", string: "test" }]);

  // A keyup that follows a keydown we already answered must not cancel a second time.
  const second = autoPairHarness();
  await startOverlay(second, { raw: "test" });
  const node = second.cell.querySelector(".rg-native-cell-editor");
  keydownOn(node, { key: "Escape", target: second.overlay.textarea });
  assert.equal(second.overlay.active, false, "no menu was ever open, so the first Escape cancels");
  await settle();
  second.dom.fireDocument("keyup", { key: "Escape", target: second.overlay.textarea });
  assert.equal(second.roamRecord.updates.length, 1, "the keyup is spent by its own keydown");

  // An Escape belonging to some other part of Roam is not ours to answer.
  const other = autoPairHarness();
  await startOverlay(other, { raw: "test" });
  const elsewhere = new OverlayNode("input"); other.dom.body.appendChild(elsewhere);
  globalThis.document.activeElement = elsewhere;
  other.dom.fireDocument("keydown", { key: "Escape", target: elsewhere });
  assert.equal(other.overlay.active, true, "the edit is not cancelled by an Escape aimed somewhere else");
  other.overlay.dispose();
});

test("cancel re-applies the restored bytes when Roam's blur flush lands after the restore write", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); releaseKeyboard(); });
  resetNativeEditorHealth();
  const harness = autoPairHarness();
  await startOverlay(harness, { raw: "test" });
  harness.overlay.textarea.value = "test [[]]";
  harness.overlay.reconcileDelayMs = 3; // poll fast in the test
  // Roam's blur flush is a MACROTASK that lands after the old 3-frame (microtask) reconcile window
  // had already closed, but inside the timed backstop's budget. This is what the old window missed.
  setTimeout(() => { harness.roamRecord.strings.cell00001 = "test [[]]"; }, 7);

  const result = await harness.overlay.cancel();
  assert.deepEqual(result, { uid: "cell00001", value: "test" });
  assert.equal(harness.roamRecord.strings.cell00001, "test", "the graph does not keep the value the user cancelled");
  assert.deepEqual(harness.roamRecord.updates, [
    { uid: "cell00001", string: "test" },
    { uid: "cell00001", string: "test" },
  ], "the late write-behind is detected and undone");
  assert.deepEqual(harness.adapter.selfWrites.at(-1), { uid: "cell00001", from: "test [[]]", to: "test" }, "the reconcile write is recorded so its echo is absorbed");
  assert.deepEqual(harness.adapter.patches.at(-1), { uid: "cell00001", raw: "test" });

  // A cancel Roam never overwrote must not write twice.
  const quiet = autoPairHarness();
  await startOverlay(quiet, { raw: "test" });
  quiet.overlay.textarea.value = "test [[]]";
  quiet.overlay.reconcileDelayMs = 3;
  await quiet.overlay.cancel();
  assert.deepEqual(quiet.roamRecord.updates, [{ uid: "cell00001", string: "test" }], "nothing diverged, so nothing is rewritten");
});

test("cancel settles the textarea to beforeRaw before teardown, so Roam's blur flush persists the cancelled value", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); releaseKeyboard(); });
  resetNativeEditorHealth();
  const harness = autoPairHarness();
  await startOverlay(harness, { raw: "test" });
  harness.overlay.textarea.value = "test [[]]"; // Roam auto-paired the brackets the user opened
  harness.overlay.reconcileDelayMs = 2;
  await harness.overlay.cancel();
  // The blur that unmount causes reads the textarea; cooperating means it already holds beforeRaw,
  // so Roam persists "test" for us rather than the "[[]]" we would then have to race to undo.
  assert.equal(harness.roamRecord.flushedAtBlur, "test", "the textarea is settled to beforeRaw before the blur, not left holding the typed value");
});

test("focus leaving the overlay for <body> finishes the edit instead of wedging it", async (t) => {
  t.after(() => { resetNativeEditorHealth(); settingsCache.clear(); releaseKeyboard(); });
  resetNativeEditorHealth();
  const harness = makeOverlayHarness();
  await startOverlay(harness);
  const node = harness.cell.querySelector(".rg-native-cell-editor");

  node.dispatch("focusout", { target: harness.overlay.textarea });
  await settle();
  assert.equal(harness.overlay.active, true, "focus that settles back inside the overlay is Roam re-rendering");

  globalThis.document.activeElement = null;
  harness.dom.state.popupOpen = true;
  node.dispatch("focusout", { target: harness.overlay.textarea });
  await settle();
  assert.equal(harness.overlay.active, true, "Roam's own menu owns focus while it is open");

  harness.dom.state.popupOpen = false;
  node.dispatch("focusout", { target: harness.overlay.textarea });
  await settle();
  assert.equal(harness.overlay.active, false, "focus on <body> with no menu open must finish the edit");
  assert.equal(harness.cell.querySelector(".rg-native-cell-editor"), null);
  assert.equal(harness.cell.classList.contains("rg-cell--editing"), false);
  assert.equal(harness.finishes.at(-1)?.commit, true, "the existing discrimination applies: a focus-away is a commit, like a click-away");

  // Focus that lands on another cell of this grid belongs to the pointerdown/focusin lanes.
  const grid = makeOverlayHarness();
  await startOverlay(grid);
  const sibling = new OverlayNode("div"); sibling.className = "rg-cell"; grid.root.appendChild(sibling);
  globalThis.document.activeElement = sibling;
  grid.cell.querySelector(".rg-native-cell-editor").dispatch("focusout", { target: grid.overlay.textarea });
  await settle();
  assert.equal(grid.overlay.active, true);
  grid.overlay.dispose();
});

test("accepting a function suggestion twice does not rewrite the committed text", async () => {
  const { controller, cells, flush } = makeController();
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "=su", floating: true });
  flush();
  assert.equal(controller.suggestionList.hidden, false);
  controller.acceptSuggestion(0);
  const committed = editor.value;
  assert.equal(committed, "=SUM(", "sanity: the first accept inserts the function");
  assert.equal(controller.suggestionList.hidden, true, "the menu hides on the accept frame, not a frame later");
  assert.equal(controller.suggestions.length, 0);
  assert.equal(controller.autocompleteContext, null);
  assert.equal(editor.getAttribute("aria-expanded"), "false");
  controller.acceptSuggestion(0);
  flush();
  assert.equal(editor.value, committed, "a stale menu frame must not rewrite what the first accept committed (=SUM(M()");
  controller.dispose();
});
