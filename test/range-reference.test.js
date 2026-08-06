import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  clearUndoHistories,
  formatRangeComponent,
  GridModel,
  GridView,
  gridTrackTemplate,
  LargeGridView,
  NativeGridSession,
  parseRangeComponent,
  RangeGridView,
  rangeBlockUid,
  rangeButtonsWithin,
  rangeInstanceInfo,
  resolveSourceModel,
  selectionBlockReferenceMatrix,
} from "../src/extension.js";

function persistedModel() {
  const rows = [];
  for (let row = 0; row < 5; row += 1) {
    const cells = [];
    for (let col = 0; col < 5; col += 1) {
      const covered = row >= 1 && row <= 2 && col >= 1 && col <= 2 && !(row === 1 && col === 1);
      cells.push({ uid: `u${row}${col}real01`, raw: covered ? "" : `${row}:${col}` });
    }
    rows.push(cells);
  }
  const model = new GridModel({ rows, tableUid: "tbl00001" });
  model.merge({ startRow: 1, endRow: 2, startCol: 1, endCol: 2 });
  return model;
}

function fakeView(model) {
  return {
    model,
    selection: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    commits: [],
    referenced: [],
    commitMutation(label, mutation, structural) { this.commits.push({ label, structural }); mutation(); return Promise.resolve(); },
    pasteReferencedRange(spec) { this.referenced.push(spec); return Promise.resolve(); },
    pasteMatrix: GridView.prototype.pasteMatrix,
  };
}

function pasteEvent(text) {
  let prevented = false;
  return { prevented: () => prevented, preventDefault() { prevented = true; }, clipboardData: { files: [], getData: () => text } };
}

test("range component parse accepts single-cell, rectangular, spaced and locked forms", () => {
  assert.deepEqual(parseRangeComponent("{{roam-grid-range: ((abc123XYZ)) A1}}"), {
    tableUid: "abc123XYZ", range: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, label: "A1",
  });
  assert.deepEqual(parseRangeComponent("{{roam-grid-range: ((abc123XYZ)) B2:D5}}"), {
    tableUid: "abc123XYZ", range: { startRow: 1, endRow: 4, startCol: 1, endCol: 3 }, label: "B2:D5",
  });
  assert.deepEqual(parseRangeComponent("{{ roam-grid-range : ((abc123XYZ)) B2 : D5 }}"), {
    tableUid: "abc123XYZ", range: { startRow: 1, endRow: 4, startCol: 1, endCol: 3 }, label: "B2:D5",
  });
  assert.deepEqual(parseRangeComponent("{{roam-grid-range: ((abc123XYZ)) $B$2:$D$5}}"), {
    tableUid: "abc123XYZ", range: { startRow: 1, endRow: 4, startCol: 1, endCol: 3 }, label: "B2:D5",
  });
  assert.deepEqual(parseRangeComponent("see {{roam-grid-range: ((abc123XYZ)) aa10:ab12}} inline"), {
    tableUid: "abc123XYZ", range: { startRow: 9, endRow: 11, startCol: 26, endCol: 27 }, label: "AA10:AB12",
  });
});

test("range component parse normalizes reversed selections", () => {
  assert.deepEqual(parseRangeComponent("{{roam-grid-range: ((tbl00001)) D5:B2}}").range, { startRow: 1, endRow: 4, startCol: 1, endCol: 3 });
  assert.deepEqual(parseRangeComponent("{{roam-grid-range: ((tbl00001)) D2:B5}}").range, { startRow: 1, endRow: 4, startCol: 1, endCol: 3 });
  assert.equal(parseRangeComponent("{{roam-grid-range: ((tbl00001)) D5:B2}}").label, "B2:D5");
});

test("range component parse rejects malformed, foreign and plain-reference input", () => {
  assert.equal(parseRangeComponent(""), null);
  assert.equal(parseRangeComponent(null), null);
  assert.equal(parseRangeComponent(undefined), null);
  assert.equal(parseRangeComponent(42), null);
  assert.equal(parseRangeComponent("{{roam-grid-range: ((abc123XYZ))}}"), null);
  assert.equal(parseRangeComponent("{{roam-grid-range: ((abc123XYZ)) }}"), null);
  assert.equal(parseRangeComponent("{{roam-grid-range: abc123XYZ A1}}"), null);
  assert.equal(parseRangeComponent("{{roam-grid-range: (()) A1}}"), null);
  assert.equal(parseRangeComponent("{{roam-grid-range: ((abc123XYZ)) A0}}"), null);
  assert.equal(parseRangeComponent("{{roam-grid-range: ((abc123XYZ)) 12}}"), null);
  assert.equal(parseRangeComponent("{{other-component: ((abc123XYZ)) A1}}"), null);
  assert.equal(parseRangeComponent("{{[[table]]}}"), null);
  assert.equal(parseRangeComponent("{{roam/grid}}"), null);
  assert.equal(parseRangeComponent("((aaa1111))\t((bbb2222))"), null);
  assert.equal(parseRangeComponent("((aaa1111))"), null);
});

test("range component format refuses a grid without a persisted Roam uid", () => {
  const selection = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 };
  const local = new GridModel({ rows: [["a", "b"], ["c", "d"]], tableUid: "rg_localdraft" });
  assert.throws(() => formatRangeComponent(local, selection), (error) => error.code === "REFERENCE_PENDING");
  const anonymous = new GridModel({ rows: [["a", "b"], ["c", "d"]] });
  assert.throws(() => formatRangeComponent(anonymous, selection), (error) => error.code === "REFERENCE_PENDING");
  const saved = new GridModel({ rows: [["a", "b"], ["c", "d"]], tableUid: "tbl00001" });
  assert.equal(formatRangeComponent(saved, selection), "{{roam-grid-range: ((tbl00001)) A1:B2}}");
  assert.equal(formatRangeComponent(saved, { startRow: 1, endRow: 1, startCol: 1, endCol: 1 }), "{{roam-grid-range: ((tbl00001)) B2}}");
});

test("range component format and parse round-trip 20 generated rectangles", () => {
  const model = new GridModel({ rows: [["a"]], tableUid: "tbl00001" });
  let seed = 20260805;
  const next = (bound) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % bound; };
  for (let index = 0; index < 20; index += 1) {
    const startRow = next(60); const endRow = startRow + next(12);
    const startCol = next(60); const endCol = startCol + next(12);
    const reversed = { startRow: endRow, endRow: startRow, startCol: endCol, endCol: startCol };
    const text = formatRangeComponent(model, reversed);
    const parsed = parseRangeComponent(text);
    assert.equal(parsed.tableUid, "tbl00001");
    assert.deepEqual(parsed.range, { startRow, endRow, startCol, endCol });
    assert.equal(parsed.label, text.slice(text.indexOf(")) ") + 3, -2));
    assert.equal(formatRangeComponent(model, parsed.range), text);
  }
});

test("a round-tripped component drives selectionBlockReferenceMatrix identically to the raw selection", () => {
  const model = persistedModel();
  const selections = [
    { startRow: 3, endRow: 0, startCol: 3, endCol: 0 },
    { startRow: 1, endRow: 2, startCol: 1, endCol: 2 },
    { startRow: 4, endRow: 4, startCol: 4, endCol: 4 },
  ];
  for (const selection of selections) {
    const direct = selectionBlockReferenceMatrix(model, selection);
    const parsed = parseRangeComponent(formatRangeComponent(model, selection));
    assert.deepEqual(selectionBlockReferenceMatrix(model, parsed.range), direct);
  }
  const covering = selectionBlockReferenceMatrix(model, selections[0]);
  assert.deepEqual(covering[1], ["((u10real01))", "((u11real01))", "", "((u13real01))"]);
  assert.deepEqual(covering[2], ["((u20real01))", "", "", "((u23real01))"]);
});

test("pasting a live range component routes to pasteReferencedRange and never the delimited path", async () => {
  const view = fakeView(new GridModel({ rows: [["", ""], ["", ""]] }));
  const event = pasteEvent("{{roam-grid-range: ((src00001)) B2:C3}}");
  await GridView.prototype.onPaste.call(view, event);
  assert.equal(event.prevented(), true);
  assert.deepEqual(view.referenced, [{ tableUid: "src00001", range: { startRow: 1, endRow: 2, startCol: 1, endCol: 2 }, label: "B2:C3" }]);
  assert.deepEqual(view.commits, []);
  assert.deepEqual([view.model.getRaw(0, 0), view.model.getRaw(0, 1), view.model.getRaw(1, 0), view.model.getRaw(1, 1)], ["", "", "", ""]);
});

test("a plain block-reference TSV still takes the delimited paste path", async () => {
  const view = fakeView(new GridModel({ rows: [["", ""], ["", ""]] }));
  const event = pasteEvent("((aaa1111))\t((bbb2222))\n((ccc3333))\t((ddd4444))");
  await GridView.prototype.onPaste.call(view, event);
  assert.equal(event.prevented(), true);
  assert.deepEqual(view.referenced, []);
  assert.deepEqual(view.commits, [{ label: "Paste cells", structural: false }]);
  assert.deepEqual([
    [view.model.getRaw(0, 0), view.model.getRaw(0, 1)],
    [view.model.getRaw(1, 0), view.model.getRaw(1, 1)],
  ], [["((aaa1111))", "((bbb2222))"], ["((ccc3333))", "((ddd4444))"]]);
});

test("the referenced matrix lands through the shared Paste cells mutation, merge holes included", async () => {
  const source = persistedModel();
  const spec = parseRangeComponent(formatRangeComponent(source, { startRow: 0, endRow: 2, startCol: 0, endCol: 2 }));
  const view = fakeView(new GridModel({ rows: [["x", "x"], ["x", "x"]] }));
  await GridView.prototype.pasteMatrix.call(view, selectionBlockReferenceMatrix(source, spec.range));
  assert.deepEqual(view.commits, [{ label: "Paste cells", structural: true }]);
  assert.deepEqual(view.model.rows.map((row) => row.map((cell) => cell.raw)), [
    ["((u00real01))", "((u01real01))", "((u02real01))"],
    ["((u10real01))", "((u11real01))", ""],
    ["((u20real01))", "", ""],
  ]);
});

// ---------------------------------------------------------------------------
// GOAL-2C — RangeGridView + the range mount pipeline
// ---------------------------------------------------------------------------

let textWrites = 0;

class MiniClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const next = force == null ? !this.values.has(value) : Boolean(force);
    if (next) this.values.add(value); else this.values.delete(value);
    return next;
  }
}

class MiniNode {
  constructor(tagName = "div", text = "") {
    this.tagName = String(tagName).toUpperCase(); this.parentNode = null; this.children = []; this.listeners = new Map();
    this.classList = new MiniClassList(); this.dataset = {}; this.style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" };
    this._text = text;
  }
  set className(value) { this._className = value; this.classList = new MiniClassList(); String(value).split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name)); }
  get className() { return this._className || ""; }
  set textContent(value) { textWrites += 1; this._text = String(value ?? ""); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join("") : this._text; }
  get parentElement() { return this.parentNode; }
  get isConnected() { for (let current = this; current; current = current.parentNode) if (current === globalThis.document?.body) return true; return false; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(typeof node === "string" ? new MiniNode("#text", node) : node)); }
  appendChild(node) { if (node.parentNode) node.remove(); node.parentNode = this; this.children.push(node); return node; }
  prepend(...nodes) { for (const node of [...nodes].reverse()) { if (node.parentNode) node.remove(); node.parentNode = this; this.children.unshift(node); } }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter((node) => node !== this); this.parentNode = null; }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
  matches(selector) {
    return String(selector).split(",").some((part) => {
      const value = part.trim();
      return value.startsWith(".") && value.slice(1).split(".").every((name) => this.classList.contains(name));
    });
  }
  closest(selector) { for (let current = this; current; current = current.parentNode) if (current.matches?.(selector)) return current; return null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const value = String(selector).trim();
    if (value.startsWith(":scope >")) {
      const child = value.slice(":scope >".length).trim();
      return this.children.filter((node) => node.matches?.(child));
    }
    const found = [];
    for (const child of this.children) { if (child.matches?.(value)) found.push(child); found.push(...child.querySelectorAll(value)); }
    return found;
  }
  setAttribute(name, value) { this[name] = String(value); }
  getAttribute(name) { return this[name] == null ? null : String(this[name]); }
  removeAttribute(name) { delete this[name]; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter((value) => value !== listener)); }
  listenerCount(type) { return (this.listeners.get(type) || []).length; }
  totalListeners() { return [...this.listeners.values()].reduce((total, list) => total + list.length, 0); }
  dispatch(type, fields = {}) {
    let stopped = false;
    const event = { type, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { stopped = true; }, ...fields };
    for (let node = this; node && !stopped; node = node.parentNode) {
      event.currentTarget = node;
      for (const listener of [...(node.listeners.get(type) || [])]) listener(event);
    }
    return event;
  }
  focus() {}
  scrollIntoView() {}
  getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 30, width: 100, height: 30 }; }
}

function installMiniDom() {
  const body = new MiniNode("body");
  const documentListeners = new Map();
  const windowListeners = new Map();
  textWrites = 0;
  globalThis.document = {
    body,
    documentElement: { clientWidth: 1024 },
    activeElement: null,
    createElement: (name) => new MiniNode(name),
    createTextNode: (text) => new MiniNode("#text", text),
    querySelector: (selector) => body.querySelector(selector),
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    addEventListener(type, listener) { if (!documentListeners.has(type)) documentListeners.set(type, []); documentListeners.get(type).push(listener); },
    removeEventListener(type, listener) { documentListeners.set(type, (documentListeners.get(type) || []).filter((value) => value !== listener)); },
  };
  globalThis.window = {
    addEventListener(type, listener) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(listener); },
    removeEventListener(type, listener) { windowListeners.set(type, (windowListeners.get(type) || []).filter((value) => value !== listener)); },
    dispatchEvent() { return true; },
  };
  delete globalThis.getComputedStyle; delete globalThis.MutationObserver; delete globalThis.matchMedia;
  globalThis.requestAnimationFrame = undefined;
  return {
    body,
    documentListenerCount: () => [...documentListeners.values()].reduce((total, list) => total + list.length, 0),
    windowListenerCount: () => [...windowListeners.values()].reduce((total, list) => total + list.length, 0),
  };
}

function sessionFor(model) {
  const adapter = { model, load: () => model, watchExternal: () => () => {}, dispose() {} };
  clearUndoHistories();
  return new NativeGridSession(model.tableUid, { adapter, model });
}

/** Mounts a range view over `persistedModel()` for the given A1 range. */
function mountRange(rangeText = "B2:D4", { model = persistedModel(), surface = "main" } = {}) {
  const dom = installMiniDom();
  const session = sessionFor(model);
  const host = new MiniNode("div");
  const button = new MiniNode("button"); button.className = `bp3-button rm-xparser-default-${"roam-grid-range"}`;
  host.appendChild(button); dom.body.appendChild(host);
  const spec = parseRangeComponent(`{{roam-grid-range: ((${model.tableUid})) ${rangeText}}}`);
  const view = new RangeGridView({ host, session, range: spec.range, label: spec.label, nativeElement: button, surface });
  return { dom, session, view, host, button, model };
}

function mountedCoordinates(view) {
  return [...view.cells.values()].map((cell) => `${cell.dataset.row}:${cell.dataset.col}`).sort();
}

test("a range view renders only its rectangle, with each merge anchor mounted exactly once", () => {
  const { view, model } = mountRange("B2:D4");

  // B2:D4 is rows 1-3 x cols 1-3 = 9 coordinates.  The 2x2 merge anchored at B2 covers three of
  // them, so six cells mount and the anchor appears once.
  assert.equal(view.cells.size, 6);
  assert.deepEqual(mountedCoordinates(view), ["1:1", "1:3", "2:3", "3:1", "3:2", "3:3"]);
  assert.equal([...view.cells.values()].filter((cell) => cell.dataset.uid === "u11real01").length, 1);
  for (const cell of view.cells.values()) {
    assert.ok(Number(cell.dataset.row) >= 1 && Number(cell.dataset.row) <= 3, "no row outside the rectangle may mount");
    assert.ok(Number(cell.dataset.col) >= 1 && Number(cell.dataset.col) <= 3, "no column outside the rectangle may mount");
  }
  const anchor = view.cells.get("1:1");
  assert.equal(anchor.style.gridRow, "1 / span 2", "the merge is clipped and re-based to the excerpt origin");
  assert.equal(anchor.style.gridColumn, "1 / span 2");
  assert.equal(view.gridElement.style.gridTemplateColumns, gridTrackTemplate(model, "col", 1, 3));
  assert.equal(view.gridElement.style.gridTemplateRows, gridTrackTemplate(model, "row", 1, 3));
  assert.equal(view.root.querySelector(".rg-range-caption").querySelector(".rg-range-label").textContent, "B2:D4");
});

test("a range view carries no toolbar, no fill handle, no editor controller, and is not focusable", () => {
  const { view, session } = mountRange("A1:B2");
  assert.equal(view.root.querySelector(".rg-toolbar"), null);
  assert.equal(view.root.querySelector(".rg-fill-handle"), null);
  assert.equal(view.root.querySelector(".rg-status"), null);
  assert.equal(view.editorController, undefined, "a read-only view never builds an editor controller");
  assert.equal(view.root.tabIndex, -1);
  assert.equal(view.patchRowDeletion({}), false);
  assert.equal(view.captureRowDeletionContext(), null);
  assert.equal(view.updateReferenceCountBadges(["u00real01"]), false);
  assert.equal(typeof view.updateCommentBadges, "undefined", "badge fan-out is optional-chained; the range view opts out");
  assert.notEqual(session.activeEditorView, view);
  assert.equal(session.activeEditorView, null);
});

test("a repeat render of unchanged content performs zero textContent writes", () => {
  const { view, model } = mountRange("B2:D4");
  assert.ok(textWrites > 0, "the first render must write cell text");

  const beforeRepeat = textWrites;
  view.render();
  assert.equal(textWrites - beforeRepeat, 0, "an unchanged repeat render must not touch textContent");
  assert.equal(view.cells.size, 6, "the mounted cell nodes are reused, not rebuilt");

  // Positive control: the counter is live, so a real content change still writes.  Without this,
  // a broken instrument (or a render that silently stopped rendering) would pass the assertion above.
  const reused = view.cells.get("3:3");
  model.setRaw(3, 3, "changed");
  const beforeChange = textWrites;
  view.render();
  assert.ok(textWrites - beforeChange > 0, "control: a changed cell must still write textContent");
  assert.equal(view.cells.get("3:3"), reused, "control: the write happened in the reused node");
  assert.equal(reused.querySelector(".rg-cell-content").textContent, "changed");
});

test("a session value refresh repaints only the cells the range actually intersects", () => {
  const { view, session, model } = mountRange("B2:D4");
  model.setRaw(0, 0, "outside");
  model.setRaw(3, 3, "inside");
  model.lastChangedCells = [[0, 0], [3, 3]];

  const before = textWrites;
  session.refreshValues();
  assert.equal(textWrites - before, 1, "only the intersecting cell may repaint");
  assert.equal(view.cells.get("3:3").querySelector(".rg-cell-content").textContent, "inside");
  assert.equal(view.cells.get("0:0"), undefined, "a coordinate outside the rectangle has no node to repaint");
});

test("disposing a range view removes it from the session, releases rich hosts, and restores the raw component", () => {
  const { view, session, button, host } = mountRange("A1:B2");
  assert.equal(session.views.has(view), true);
  assert.equal(button.classList.contains("rg-range-restored"), false, "a mounted range keeps the raw button hidden");

  const content = view.cells.get("0:0").querySelector(".rg-cell-content");
  const richHost = new MiniNode("span"); richHost.className = "rg-rich-host";
  content.appendChild(richHost); content.__rgRichHosts = new Set([richHost]);

  view.dispose({ releaseNative: true });
  assert.equal(session.views.has(view), false);
  assert.equal(richHost.__rgDisposed, true, "rich hosts must be unmounted before the root leaves the tree");
  assert.equal(content.__rgRichHosts.size, 0);
  assert.equal(host.querySelector(".rg-range"), null, "the root is detached");
  assert.equal(button.classList.contains("rg-range-restored"), true);
  assert.equal(view.disposed, true);
});

test("a range view owns exactly one listener on its root and none on document or window", () => {
  const dom = installMiniDom();
  const documentBefore = dom.documentListenerCount();
  const windowBefore = dom.windowListenerCount();

  const model = persistedModel();
  const session = sessionFor(model);
  const host = new MiniNode("div"); dom.body.appendChild(host);
  const button = new MiniNode("button"); button.className = "rm-xparser-default-roam-grid-range"; host.appendChild(button);
  const view = new RangeGridView({ host, session, range: { startRow: 0, endRow: 2, startCol: 0, endCol: 2 }, nativeElement: button });

  assert.equal(view.root.totalListeners(), 1, "one delegated listener, nothing else");
  assert.equal(view.root.listenerCount("click"), 1);
  assert.equal(dom.documentListenerCount() - documentBefore, 0, "no document listener may be added");
  assert.equal(dom.windowListenerCount() - windowBefore, 0, "no window listener may be added");
  for (const cell of view.cells.values()) assert.equal(cell.totalListeners(), 0, "cells are delegated to, never bound individually");

  // Positive control: all three counters must be able to observe a listener, or the assertions
  // above would pass against an instrument that never counts anything.
  view.root.addEventListener("keydown", () => {});
  globalThis.document.addEventListener("pointerup", () => {});
  globalThis.window.addEventListener("keydown", () => {});
  assert.equal(view.root.totalListeners(), 2, "control: the root counter observes a new listener");
  assert.equal(dom.documentListenerCount() - documentBefore, 1, "control: the document counter observes a new listener");
  assert.equal(dom.windowListenerCount() - windowBefore, 1, "control: the window counter observes a new listener");

  view.dispose({ releaseNative: false });
  assert.equal(view.root.listenerCount("click"), 0, "disposal removes the delegated listener");
});

test("a structural session render keeps the range view in sync and drops vanished coordinates", () => {
  const { view, session, model } = mountRange("B2:D4");
  assert.equal(view.cells.size, 6);
  model.transact("Delete rows", () => model.deleteRows(3, 2));
  session.renderStructural();
  assert.deepEqual(mountedCoordinates(view), ["1:1", "1:3", "2:3"], "a shrunk model clamps the rectangle");
  for (const cell of view.cells.values()) assert.equal(cell.isConnected, true);
});

test("the delegated click opens the clicked cell's source block and the caption opens the table", () => {
  const { view } = mountRange("B2:D4");
  const opened = [];
  const previousWindow = globalThis.window;
  globalThis.window = { ...previousWindow, roamAlphaAPI: { ui: { mainWindow: { openBlock: ({ block }) => { opened.push(block.uid); return null; } } } } };
  try {
    view.cells.get("3:3").dispatch("click");
    view.root.querySelector(".rg-range-caption").querySelector(".rg-range-source").dispatch("click");
    assert.deepEqual(opened, ["u33real01", "tbl00001"]);
  } finally { globalThis.window = previousWindow; }
});

test("a preview surface scrolls internally instead of growing the Blueprint portal", () => {
  const { view } = mountRange("A1:E5", { surface: "preview" });
  assert.equal(view.root.classList.contains("rg-range--preview"), true);
  assert.equal(view.root.dataset.rgSurface, "preview");
  assert.equal(view.root.querySelector(".rg-range-viewport") != null, true);
});

test("resolveSourceModel prefers a live session and otherwise reads the table cold", () => {
  const live = new GridModel({ rows: [["live"]], tableUid: "tbl00001" });
  const cold = new GridModel({ rows: [["cold"]], tableUid: "tbl00002" });
  const sessions = new Map([["tbl00001", { model: live }]]);
  const loads = [];
  const loadModel = (uid) => { loads.push(uid); return uid === "tbl00002" ? cold : null; };

  assert.equal(resolveSourceModel("tbl00001", { sessions, loadModel }), live);
  assert.deepEqual(loads, [], "a live session must never trigger a cold read — it holds unsaved edits");

  assert.equal(resolveSourceModel("tbl00002", { sessions, loadModel }), cold);
  assert.deepEqual(loads, ["tbl00002"]);

  assert.equal(resolveSourceModel("", { sessions, loadModel }), null);
  assert.equal(resolveSourceModel(null, { sessions, loadModel }), null);
  assert.deepEqual(loads, ["tbl00002"], "an empty uid must not reach the loader");

  assert.equal(resolveSourceModel("gone", { sessions, loadModel: () => null }), null);
  assert.throws(() => resolveSourceModel("boom", { sessions, loadModel: () => { throw new Error("NOT_TABLE"); } }), /NOT_TABLE/);
  assert.equal(resolveSourceModel("tbl00001", { sessions: new Map([["tbl00001", {}]]), loadModel }), cold === null ? null : loadModel("tbl00001"), "a session without a model falls through to the cold read");
});

test("both paste paths resolve their source through the shared resolver", async () => {
  const source = persistedModel();
  const asked = [];
  const resolve = (uid) => { asked.push(uid); return source; };

  const nativeView = fakeView(new GridModel({ rows: [["x", "x"], ["x", "x"]] }));
  await GridView.prototype.pasteReferencedRange.call(nativeView, parseRangeComponent("{{roam-grid-range: ((tbl00001)) A1:B2}}"), resolve);
  assert.deepEqual(asked, ["tbl00001"]);
  assert.deepEqual(nativeView.model.rows.map((row) => row.map((cell) => cell.raw)), [
    ["((u00real01))", "((u01real01))"],
    ["((u10real01))", "((u11real01))"],
  ]);

  const applied = [];
  const largeView = {
    selection: { startRow: 2, endRow: 2, startCol: 1, endCol: 1 },
    store: { applyMatrix: async (row, col, matrix) => applied.push({ row, col, matrix }) },
    invalidateLargeCells: () => [], scheduleSave() {}, scheduleRender() {},
  };
  await LargeGridView.prototype.pasteReferencedRange.call(largeView, parseRangeComponent("{{roam-grid-range: ((tbl00001)) A1:B2}}"), resolve);
  assert.deepEqual(asked, ["tbl00001", "tbl00001"]);
  assert.deepEqual(applied, [{ row: 2, col: 1, matrix: [["((u00real01))", "((u01real01))"], ["((u10real01))", "((u11real01))"]] }]);
});

test("a range component pasted into a large grid pastes referenced values, not literal text", async () => {
  const source = persistedModel();
  const applied = [];
  const largeView = {
    selection: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    store: { applyMatrix: async (row, col, matrix) => applied.push({ row, col, matrix }) },
    invalidateLargeCells: () => [], scheduleSave() {}, scheduleRender() {},
    pasteReferencedRange(spec) { return LargeGridView.prototype.pasteReferencedRange.call(this, spec, () => source); },
  };
  const event = pasteEvent("{{roam-grid-range: ((tbl00001)) A1:B2}}");
  await LargeGridView.prototype.onPaste.call(largeView, event);
  assert.equal(event.prevented(), true);
  assert.deepEqual(applied, [{ row: 0, col: 0, matrix: [["((u00real01))", "((u01real01))"], ["((u10real01))", "((u11real01))"]] }]);
  for (const row of applied[0].matrix) for (const value of row) {
    assert.doesNotMatch(value, /roam-grid-range/, "0.8.2 landed the component as literal text — this is the regression");
  }

  applied.length = 0;
  const tsv = pasteEvent("one\ttwo\nthree\tfour");
  await LargeGridView.prototype.onPaste.call(largeView, tsv);
  assert.deepEqual(applied, [{ row: 0, col: 0, matrix: [["one", "two"], ["three", "four"]] }], "a plain TSV still takes the delimited path");
});

test("range buttons are discovered by their single Roam-rendered class", () => {
  installMiniDom();
  const host = new MiniNode("div");
  const first = new MiniNode("button"); first.className = "bp3-button bp3-small dont-focus-block rm-xparser-default-roam-grid-range";
  const other = new MiniNode("button"); other.className = "bp3-button rm-xparser-default-something-else";
  const nested = new MiniNode("div"); const second = new MiniNode("button"); second.className = "rm-xparser-default-roam-grid-range";
  nested.appendChild(second); host.append(first, other, nested);

  assert.deepEqual(rangeButtonsWithin(host), [first, second]);
  assert.deepEqual(rangeButtonsWithin(first), [first], "a button passed as the scan root matches itself");
  assert.deepEqual(rangeButtonsWithin(other), []);
  assert.deepEqual(rangeButtonsWithin(null), []);
});

test("a range spec is read once per block and re-read when Roam replaces the button node", () => {
  installMiniDom();
  const reads = [];
  const readString = (uid) => { reads.push(uid); return "{{roam-grid-range: ((tbl00001)) B2:D5}}"; };
  const entries = new Map();
  const input = new MiniNode("div"); input.className = "rm-block__input"; input.id = "block-input-main-window-blk123456";
  const button = new MiniNode("button"); button.className = "rm-xparser-default-roam-grid-range"; input.appendChild(button);

  const first = rangeInstanceInfo(button, entries, readString);
  assert.deepEqual(first, { tableUid: "tbl00001", range: { startRow: 1, endRow: 4, startCol: 1, endCol: 3 }, label: "B2:D5", blockUid: "blk123456" });
  assert.equal(rangeInstanceInfo(button, entries, readString), first, "a cached spec is returned by identity");
  assert.deepEqual(reads, ["blk123456"], "the cache spares the second read");

  const replacement = new MiniNode("button"); replacement.className = "rm-xparser-default-roam-grid-range"; input.appendChild(replacement);
  rangeInstanceInfo(replacement, entries, readString);
  assert.deepEqual(reads, ["blk123456", "blk123456"], "a replaced button node invalidates the cache");

  const orphan = new MiniNode("button"); orphan.className = "rm-xparser-default-roam-grid-range";
  assert.equal(rangeInstanceInfo(orphan, entries, readString), null, "a button with no block input resolves to nothing");

  const plain = new MiniNode("div"); plain.className = "rm-block__input"; plain.id = "block-input-main-window-blk999999";
  const plainButton = new MiniNode("button"); plainButton.className = "rm-xparser-default-roam-grid-range"; plain.appendChild(plainButton);
  assert.equal(rangeInstanceInfo(plainButton, entries, () => "just some text"), null);
  assert.equal(rangeInstanceInfo(plainButton, entries, () => { throw new Error("pull failed"); }), null, "a failed read is not a crash");
});

test("range block uids come from the dataset first and the block-input id suffix second", () => {
  installMiniDom();
  const dataset = new MiniNode("div"); dataset.dataset.uid = "datasetUid";
  assert.equal(rangeBlockUid(dataset), "datasetUid");
  const byId = new MiniNode("div"); byId.id = "block-input-main-window-blk123456";
  assert.equal(rangeBlockUid(byId), "blk123456");
  const sidebar = new MiniNode("div"); sidebar.id = "block-input-sidebar-window-2-Ab-9_zQx1";
  assert.equal(rangeBlockUid(sidebar), "Ab-9_zQx1");
  assert.equal(rangeBlockUid(new MiniNode("div")), null);
  assert.equal(rangeBlockUid(null), null);
});

test("the raw range component's pre-paint rule is the only CSS selector without a .rg- class", async () => {
  const css = (await readFile(new URL("../extension.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.rm-xparser-default-roam-grid-range:not\(\.rg-range-restored\)\s*\{\s*display: none !important;\s*\}/);

  const selectors = [];
  for (const rule of css.matchAll(/([^{}]+)\{/g)) {
    for (const part of rule[1].split(",")) { const value = part.trim(); if (value && !value.startsWith("@")) selectors.push(value); }
  }
  assert.ok(selectors.length > 200, "the sweep must actually see the stylesheet");
  // `:not()` arguments are stripped so a non-rg subject cannot launder itself through the guard class.
  const unscoped = [...new Set(selectors.filter((selector) => !/\.rg-/.test(selector.replace(/:not\([^)]*\)/g, ""))))];
  assert.deepEqual(unscoped, [".rm-xparser-default-roam-grid-range:not(.rg-range-restored)"], "exactly one justified exception, documented in docs/ARCHITECTURE.md");

  const docs = await readFile(new URL("../docs/ARCHITECTURE.md", import.meta.url), "utf8");
  assert.match(docs, /rm-xparser-default-roam-grid-range/);
});
