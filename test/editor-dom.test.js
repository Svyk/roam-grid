import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FormulaEngine, GridEditorController, GridModel, GridView, NativeGridSession, formulaCanPointReference, moveFormulaReferenceCoordinate, paintRichCellContent, queryBlockReferenceSources, releaseRichCellHosts, renderStableCellContent, replaceGridViewportContents, settingsCache, syncPortalThemeFromRoot } from "../src/extension.js";

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
  const controller = new GridEditorController({ root }, {
    viewport: null,
    dimensions: () => ({ rowCount: 3, colCount: 3 }),
    cellAt: (row, col) => cells.get(`${row}:${col}`) || null,
    mountedCells: () => cells.values(),
    onFinish: async (value) => { finishes.push(value); },
    ...options,
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

test("bare Roam reference openers do not flash an empty inline portal", async () => {
  let searches = 0;
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => { searches += 1; return []; },
  });
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "[[", floating: false });
  flush(); await waitForSearch();
  assert.equal(searches, 0);
  assert.equal(controller.popover.hidden, true);
  assert.equal(controller.suggestionList.hidden, true);
  assert.equal(editor.getAttribute("aria-expanded"), "false");
  editor.value = "(("; editor.setSelectionRange(2, 2); editor.dispatch("input"); flush(); await waitForSearch();
  assert.equal(searches, 0);
  assert.equal(controller.popover.hidden, true);
  controller.dispose();
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
  t.after(() => settingsCache.clear());
  let searches = 0;
  const { controller, cells, flush } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => { searches += 1; return [{ kind: "roam-page", name: "Project Alpha", description: "Page" }]; },
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
  controller.dispose();
});

test("Roam reference suggestions take keyboard precedence and Escape closes them before editing", async () => {
  const { controller, cells, flush, finishes } = makeController({
    referenceSearchDelay: 0,
    searchReferences: async () => [{ kind: "roam-page", name: "Project", description: "Page" }],
  });
  const editor = await controller.start({ row: 0, col: 0, cell: cells.get("0:0"), raw: "=SUM(A1)+[[Pro", floating: true });
  flush(); await waitForSearch();
  assert.equal(controller.suggestionKind, "roam-reference");
  assert.equal(controller.address.textContent, "fx  A1");
  assert.equal(controller.suggestions.every((suggestion) => suggestion.kind === "roam-page"), true);
  assert.equal(controller.popover.dataset.mode, "reference");
  controller.onKeydown({ key: "Escape", preventDefault() {}, stopPropagation() {}, isComposing: false });
  assert.ok(controller.state); assert.equal(controller.suggestionList.hidden, true);
  controller.onKeydown({ key: "Escape", preventDefault() {}, stopPropagation() {}, isComposing: false }); await Promise.resolve();
  assert.equal(controller.state, null); assert.equal(finishes.at(-1).commit, false); assert.equal(editor.value, "=SUM(A1)+[[Pro");
  controller.dispose();
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
