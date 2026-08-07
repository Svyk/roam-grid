import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  claimRangeMounts,
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
  rangeRenderPlan,
  rangeTextHostsWithin,
  resolveSourceModel,
  selectionBlockReferenceMatrix,
  settingsCache,
  traceRange,
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
      if (value.startsWith(".")) return value.slice(1).split(".").every((name) => this.classList.contains(name));
      const prefix = /^\[id\^='([^']+)'\]$/.exec(value);
      if (prefix) return String(this.id || "").startsWith(prefix[1]);
      const exists = /^\[data-([a-z-]+)\]$/.exec(value);
      if (exists) {
        const key = exists[1].replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
        return this.dataset?.[key] != null || this.getAttribute?.(exists[0].slice(1, -1)) != null;
      }
      return false;
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

test("rangeRenderPlan drops whole rows first and never exceeds the cap", () => {
  const range = (startRow, endRow, startCol, endCol) => ({ startRow, endRow, startCol, endCol });
  const under = rangeRenderPlan(range(0, 4, 0, 4), 25);
  assert.equal(under.truncated, false);
  assert.equal(under.total, 25);
  assert.equal(under.rendered, 25);
  assert.deepEqual(under.range, range(0, 4, 0, 4), "a rectangle at the cap is handed back untouched");

  const clipped = rangeRenderPlan(range(0, 99, 0, 4), 12);
  assert.equal(clipped.truncated, true);
  assert.equal(clipped.total, 500);
  assert.equal(clipped.rendered, 10, "two whole five-column rows, not a ragged twelve cells");
  assert.deepEqual(clipped.range, range(0, 1, 0, 4), "the full column shape survives");

  const wider = rangeRenderPlan(range(3, 40, 2, 101), 10);
  assert.equal(wider.rendered, 10);
  assert.deepEqual(wider.range, range(3, 3, 2, 11), "a range wider than the cap keeps one clipped row");

  assert.equal(rangeRenderPlan(range(0, 9, 0, 9), 1).rendered, 1);
  assert.deepEqual(rangeRenderPlan(range(0, 9, 0, 9), 1).range, range(0, 0, 0, 0));
  assert.equal(rangeRenderPlan(range(0, 9, 0, 9), 0).rendered, 100, "a nonsense cap falls back to the default, not to zero cells");
  assert.equal(rangeRenderPlan(range(0, 9, 0, 9), "nonsense").truncated, false);
});

test("a range past the cell cap mounts exactly the cap and reports the truncation in its caption", (t) => {
  t.after(() => settingsCache.clear());
  settingsCache.set("ranges-max-rendered-cells", 6);
  const { view, model } = mountRange("A1:E5");

  // 25 coordinates capped at 6: five columns fit, so one whole row renders and nothing below it.
  assert.equal(view.cells.size, 5, "only the clamped rectangle may build nodes");
  assert.deepEqual(mountedCoordinates(view), ["0:0", "0:1", "0:2", "0:3", "0:4"]);
  assert.equal(view.gridElement.style.gridTemplateRows, gridTrackTemplate(model, "row", 0, 0), "the track template is capped too");
  assert.equal(view.root.querySelector(".rg-range-truncated").textContent, "showing first 5 of 25 cells");
  assert.equal(view.root.querySelector(".rg-range-label").textContent, "A1:E5", "the caption still names the authored range");

  // A repeat render must not rewrite the note, or the zero-write guarantee above dies with it.
  const before = textWrites;
  view.render();
  assert.equal(textWrites - before, 0);
  assert.equal(view.cells.size, 5);
});

test("a range inside the cell cap renders whole and carries an empty truncation note", (t) => {
  t.after(() => settingsCache.clear());
  settingsCache.set("ranges-max-rendered-cells", 2000);
  const { view } = mountRange("B2:D4");
  assert.equal(view.cells.size, 6);
  assert.equal(view.root.querySelector(".rg-range-truncated").textContent, "", "no note when nothing was dropped");
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
    // `applyMatrix` hands back one record per cell; this test is about routing, so it records none.
    // The manifest is real because the paste path reads its bounds before deciding whether to grow.
    store: { manifest: { rowCount: 100, colCount: 26 }, applyMatrix: async (row, col, matrix) => { applied.push({ row, col, matrix }); return []; } },
    invalidateLargeCells: () => [], recordLargeEdit() {}, scheduleSave() {}, scheduleRender() {},
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
    store: { manifest: { rowCount: 100, colCount: 26 }, applyMatrix: async (row, col, matrix) => { applied.push({ row, col, matrix }); return []; } },
    invalidateLargeCells: () => [], recordLargeEdit() {}, scheduleSave() {}, scheduleRender() {},
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

/**
 * The read sites, not the helper. Both paste paths grow their grid today; with
 * `editing-paste-grows-grid` off neither may insert a row or a column, and the native path is checked
 * by row/column count rather than by cell values so a clip that still grew and then overwrote would fail.
 */
test("the paste-growth switch stops both paste paths inserting rows and columns", async (t) => {
  t.after(() => settingsCache.clear());
  const grow = fakeView(new GridModel({ rows: [["", ""], ["", ""]] }));
  settingsCache.set("editing-paste-grows-grid", true);
  await GridView.prototype.pasteMatrix.call(grow, [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"]]);
  assert.deepEqual([grow.model.rowCount, grow.model.colCount], [3, 3], "growing is the default");
  assert.deepEqual(grow.commits, [{ label: "Paste cells", structural: true }]);

  const clamp = fakeView(new GridModel({ rows: [["", ""], ["", ""]] }));
  settingsCache.set("editing-paste-grows-grid", false);
  await GridView.prototype.pasteMatrix.call(clamp, [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"]]);
  assert.deepEqual([clamp.model.rowCount, clamp.model.colCount], [2, 2], "a clipped paste must not resize the grid");
  assert.deepEqual(clamp.commits, [{ label: "Paste cells", structural: false }], "and must not claim a structural write");
  assert.deepEqual(clamp.model.rows.map((row) => row.map((cell) => cell.raw)), [["a", "b"], ["d", "e"]]);

  const applied = [];
  const largeView = {
    selection: { startRow: 1, endRow: 1, startCol: 1, endCol: 1 },
    store: { manifest: { rowCount: 3, colCount: 3 }, applyMatrix: async (row, col, matrix) => { applied.push({ row, col, matrix }); return []; } },
    invalidateLargeCells: () => [], recordLargeEdit() {}, scheduleSave() {}, scheduleRender() {},
  };
  await LargeGridView.prototype.onPaste.call(largeView, pasteEvent("a\tb\tc\nd\te\tf\ng\th\ti"));
  assert.deepEqual(applied, [{ row: 1, col: 1, matrix: [["a", "b"], ["d", "e"]] }], "applyMatrix calls ensureSize, so the clip has to happen before it");
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

/**
 * The host-node shape is parameterized so locator assertions cannot pass by construction: the
 * hardened selector must find the host from ANY one of its signals (BEM class, legacy single-dash
 * class, `block-input-` id prefix), and the uid from the id suffix or a data-uid attribute.
 */
function rangeHostVariant(variant, uid = "blk123456") {
  const host = new MiniNode("div");
  if (variant === "bem") { host.className = "rm-block__input"; host.id = `block-input-main-window-${uid}`; }
  else if (variant === "dash") { host.className = "rm-block-input"; host.id = `block-input-main-window-${uid}`; }
  else if (variant === "id") { host.id = `block-input-main-window-${uid}`; }
  else if (variant === "data-uid") { host.className = "rm-block__input"; host.dataset.uid = uid; }
  else throw new Error(`unknown range host variant: ${variant}`);
  return host;
}
const RANGE_HOST_VARIANTS = ["bem", "dash", "id", "data-uid"];

function rangeButtonIn(host) {
  const button = new MiniNode("button"); button.className = "rm-xparser-default-roam-grid-range"; host.appendChild(button);
  return button;
}

for (const variant of RANGE_HOST_VARIANTS) {
  test(`a range spec is cached per block and re-validated against a fresh read on every lookup (${variant} host)`, () => {
    installMiniDom();
    const reads = [];
    const readString = (uid) => { reads.push(uid); return "{{roam-grid-range: ((tbl00001)) B2:D5}}"; };
    const entries = new Map();
    const input = rangeHostVariant(variant);
    const button = rangeButtonIn(input);

    const first = rangeInstanceInfo(button, entries, readString);
    assert.deepEqual(first, { tableUid: "tbl00001", range: { startRow: 1, endRow: 4, startCol: 1, endCol: 3 }, label: "B2:D5", blockUid: "blk123456" });
    assert.equal(rangeInstanceInfo(button, entries, readString), first, "an unchanged string returns the cached spec by identity");
    assert.deepEqual(reads, ["blk123456", "blk123456"], "the string is re-read on every lookup so an edit is seen — the cache spares the re-parse, not the read");

    const replacement = rangeButtonIn(input);
    rangeInstanceInfo(replacement, entries, readString);
    assert.deepEqual(reads, ["blk123456", "blk123456", "blk123456"], "a replaced button node re-parses even for an identical string");

    const orphan = new MiniNode("button"); orphan.className = "rm-xparser-default-roam-grid-range";
    assert.equal(rangeInstanceInfo(orphan, entries, readString), null, "a button with no block input resolves to nothing");

    const plain = rangeHostVariant(variant, "blk999999");
    const plainButton = rangeButtonIn(plain);
    assert.equal(rangeInstanceInfo(plainButton, entries, () => "just some text"), null);
    assert.equal(rangeInstanceInfo(plainButton, entries, () => { throw new Error("pull failed"); }), null, "a failed read is not a crash");
  });
}

test("an empty read is never cached, but a definitive non-spec caches its null", () => {
  installMiniDom();
  const entries = new Map();
  const button = rangeButtonIn(rangeHostVariant("bem"));
  const reads = [];
  let value = "";
  const readString = (uid) => { reads.push(uid); return value; };

  assert.equal(rangeInstanceInfo(button, entries, readString), null, "an empty read resolves to nothing");
  assert.equal(entries.size, 0, "a transient empty read must not be cached — the next scan retries");
  value = "{{roam-grid-range: ((tbl00001)) B2:D5}}";
  assert.equal(rangeInstanceInfo(button, entries, readString)?.tableUid, "tbl00001", "the retried read parses");
  assert.deepEqual(reads, ["blk123456", "blk123456"]);

  const garbageEntries = new Map();
  const garbageButton = rangeButtonIn(rangeHostVariant("bem", "blk777777"));
  const garbageReads = [];
  const readGarbage = (uid) => { garbageReads.push(uid); return "just some text"; };
  assert.equal(rangeInstanceInfo(garbageButton, garbageEntries, readGarbage), null);
  assert.deepEqual(garbageEntries.get("blk777777"), { button: garbageButton, text: "just some text", info: null }, "a non-empty non-spec is definitive and caches the null with its source string");
  assert.equal(rangeInstanceInfo(garbageButton, garbageEntries, readGarbage), null);
  assert.deepEqual(garbageReads, ["blk777777", "blk777777"], "the cached null is re-validated against a fresh read, so an edit into a real spec recovers");
});

test("with live range references off no spec is parsed, read, or cached", (t) => {
  t.after(() => settingsCache.clear());
  installMiniDom();
  const reads = [];
  const readString = (uid) => { reads.push(uid); return "{{roam-grid-range: ((tbl00001)) B2:D5}}"; };
  const entries = new Map();
  const button = rangeButtonIn(rangeHostVariant("bem"));

  settingsCache.set("ranges-live-references", false);
  assert.equal(rangeInstanceInfo(button, entries, readString), null, "off means the claim pass never gets a spec to mount");
  assert.deepEqual(reads, [], "and the source block is never read");
  assert.equal(entries.size, 0, "a null must not be cached, or turning the setting back on would stay dead");

  settingsCache.set("ranges-live-references", true);
  assert.equal(rangeInstanceInfo(button, entries, readString).tableUid, "tbl00001", "back on parses on the very next scan");
  assert.deepEqual(reads, ["blk123456"]);
});

test("text-content candidate hosts are found by the hardened selector and the marker substring", () => {
  installMiniDom();
  const host = rangeHostVariant("bem");
  host.textContent = "see {{roam-grid-range: ((tbl00001)) B2:D5}} here";
  const plain = new MiniNode("div"); plain.textContent = "nothing relevant";
  const marked = new MiniNode("div"); marked.textContent = "roam-grid-range with no block-input signal";
  const root = new MiniNode("div"); root.append(host, plain, marked);

  assert.deepEqual(rangeTextHostsWithin(root), [host], "only block-input hosts containing the marker qualify");
  assert.deepEqual(rangeTextHostsWithin(host), [host], "a host passed as the scan root matches itself");
  assert.deepEqual(rangeTextHostsWithin(null), []);
});

// ---------------------------------------------------------------------------
// GOAL-U3 — claimRangeMounts: crash isolation, caching gates, text-host fallback
// ---------------------------------------------------------------------------

function claimDeps({ strings = new Map(), tables = new Map([["tbl00001", "native"]]), mount, traced = [], reads = [] } = {}) {
  return {
    entries: new Map(),
    metadataEntries: new Map([...tables].map(([uid, mode]) => [uid, { value: { mode } }])),
    readString: (uid) => { reads.push(uid); return strings.get(uid) ?? ""; },
    mount: mount || (() => {}),
    trace: (stage, detail) => traced.push({ stage, detail }),
    viewsByNative: new Map(),
  };
}

test("claimRangeMounts mounts a claimed range button and traces the success", () => {
  installMiniDom();
  const host = rangeHostVariant("bem"); const button = rangeButtonIn(host);
  const root = new MiniNode("div"); root.appendChild(host);
  const mounted = []; const traced = [];
  claimRangeMounts(root, claimDeps({
    strings: new Map([["blk123456", "{{roam-grid-range: ((tbl00001)) B2:D5}}"]]),
    mount: (element, info) => mounted.push({ element, info }),
    traced,
  }));

  assert.equal(mounted.length, 1);
  assert.equal(mounted[0].element, button);
  assert.equal(mounted[0].info.tableUid, "tbl00001");
  assert.deepEqual(traced.map((entry) => entry.stage), ["mounted"]);
  assert.equal(button.classList.contains("rg-range-restored"), false, "a claimed button stays hidden");
});

test("a throw while processing one button still processes the rest and fails visible", () => {
  installMiniDom();
  const firstHost = rangeHostVariant("bem", "blk111111"); const first = rangeButtonIn(firstHost);
  const secondHost = rangeHostVariant("bem", "blk222222"); const second = rangeButtonIn(secondHost);
  const root = new MiniNode("div"); root.append(firstHost, secondHost);
  const mounted = []; const traced = [];
  let calls = 0;
  claimRangeMounts(root, claimDeps({
    strings: new Map([
      ["blk111111", "{{roam-grid-range: ((tbl00001)) B2:D5}}"],
      ["blk222222", "{{roam-grid-range: ((tbl00001)) A1:B2}}"],
    ]),
    mount: (element) => { calls += 1; if (calls === 1) throw new Error("mount exploded"); mounted.push(element); },
    traced,
  }));

  assert.equal(mounted.length, 1, "button #2 is processed even though button #1's mount threw");
  assert.equal(mounted[0], second);
  assert.equal(first.classList.contains("rg-range-restored"), true, "the failed button fails VISIBLE");
  assert.match(String(globalThis.window.__RG_U3_LAST_ERROR || ""), /mount exploded/, "the forensic surface records the throw");
  assert.deepEqual(traced.map((entry) => entry.stage), ["mount-error", "mounted"]);
});

test("an unclaimed button is un-hidden and the degrade stage is traced", () => {
  installMiniDom();
  const noMetaHost = rangeHostVariant("bem", "blk111111"); const noMeta = rangeButtonIn(noMetaHost);
  const largeHost = rangeHostVariant("bem", "blk222222"); const large = rangeButtonIn(largeHost);
  const root = new MiniNode("div"); root.append(noMetaHost, largeHost);
  const mounted = []; const traced = [];
  claimRangeMounts(root, claimDeps({
    strings: new Map([
      ["blk111111", "{{roam-grid-range: ((tbl00001)) B2:D5}}"],
      ["blk222222", "{{roam-grid-range: ((tbl00002)) A1:B2}}"],
    ]),
    tables: new Map([["tbl00002", "large"]]),
    mount: (element) => mounted.push(element),
    traced,
  }));

  assert.equal(mounted.length, 0);
  assert.equal(noMeta.classList.contains("rg-range-restored"), true, "no metadata → raw component stays visible");
  assert.equal(large.classList.contains("rg-range-restored"), true, "a large-mode source is never range-mounted");
  assert.deepEqual(traced.map((entry) => entry.stage), ["no-metadata", "large-source"]);
});

test("with live range references off the claim pass reads nothing", (t) => {
  t.after(() => settingsCache.clear());
  installMiniDom();
  const host = rangeHostVariant("bem"); const button = rangeButtonIn(host);
  const root = new MiniNode("div"); root.appendChild(host);
  const reads = []; const traced = []; const mounted = [];
  settingsCache.set("ranges-live-references", false);
  claimRangeMounts(root, claimDeps({
    strings: new Map([["blk123456", "{{roam-grid-range: ((tbl00001)) B2:D5}}"]]),
    mount: (element) => mounted.push(element),
    traced, reads,
  }));

  assert.deepEqual(reads, [], "off means no Datascript reads at all");
  assert.equal(mounted.length, 0);
  assert.equal(button.classList.contains("rg-range-restored"), true, "off un-hides the raw component");
  assert.deepEqual(traced.map((entry) => entry.stage), ["refs-off"]);
});

test("a raw-text host with no rendered button mounts with the host-hide class", () => {
  installMiniDom();
  const host = rangeHostVariant("bem");
  host.textContent = "{{roam-grid-range: ((tbl00001)) B2:D5}}";
  const root = new MiniNode("div"); root.appendChild(host);
  const mounted = []; const traced = [];
  claimRangeMounts(root, claimDeps({
    strings: new Map([["blk123456", "{{roam-grid-range: ((tbl00001)) B2:D5}}"]]),
    mount: (element, info) => mounted.push({ element, info }),
    traced,
  }));

  assert.equal(mounted.length, 1);
  assert.equal(mounted[0].element, host, "the text host itself is the mount element");
  assert.equal(mounted[0].info.blockUid, "blk123456");
  assert.equal(host.classList.contains("rg-range-host"), true, "the host-hide class lands only after a successful mount");
  assert.deepEqual(traced.map((entry) => entry.stage), ["text-mounted"]);
});

test("the button path wins: a host with a claimed button is never text-claimed", () => {
  installMiniDom();
  const host = rangeHostVariant("bem"); const button = rangeButtonIn(host);
  button.textContent = "{{roam-grid-range: ((tbl00001)) B2:D5}}";
  const root = new MiniNode("div"); root.appendChild(host);
  const mounted = []; const traced = [];
  claimRangeMounts(root, claimDeps({
    strings: new Map([["blk123456", "{{roam-grid-range: ((tbl00001)) B2:D5}}"]]),
    mount: (element, info) => mounted.push({ element, info }),
    traced,
  }));

  assert.equal(mounted.length, 1, "exactly one mount — the text pass must skip the host");
  assert.equal(mounted[0].element, button);
  assert.equal(host.classList.contains("rg-range-host"), false);
  assert.deepEqual(traced.map((entry) => entry.stage), ["mounted"]);
});

test("traceRange keeps a 32-entry ring buffer plus the latest entry", () => {
  installMiniDom();
  for (let index = 0; index < 40; index += 1) traceRange("mounted", `detail-${index}`);
  const diag = globalThis.window.__rgDiag;
  assert.equal(diag.rangeTrace.length, 32, "the buffer is capped");
  assert.equal(diag.rangeTrace[0].detail, "detail-8", "the oldest entries fall off");
  assert.equal(diag.rangeLast.detail, "detail-39");
});

test("disposing a range view lifts a raw-text host's hide", () => {
  const { view, host } = mountRange("A1:B2");
  host.classList.add("rg-range-host");
  view.dispose({ releaseNative: true });
  assert.equal(host.classList.contains("rg-range-host"), false);
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
  assert.match(css, /\.rg-range-host:not\(:focus-within\) > :not\(\.rg-root\)\s*\{\s*display: none !important;\s*\}/, "the raw-text host hide is rg-scoped and focus-within exempt");

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

/**
 * The menu matches Roam's metrics through our own classes rather than Roam's. `.rm-autocomplete__*`
 * would carry every installed theme's overrides of those names — including `position` and `z-index`
 * rules written for a menu Roam mounts itself, which is not where ours lives — and a subject with no
 * `.rg-` class would break the one-exception sweep above as well.
 */
test("the autocomplete parity rules key on our classes, never on Roam's", async () => {
  const css = (await readFile(new URL("../extension.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [];
  for (const rule of css.matchAll(/([^{}]+)\{/g)) {
    for (const part of rule[1].split(",")) { const value = part.trim(); if (value && !value.startsWith("@")) selectors.push(value); }
  }
  assert.ok(selectors.some((selector) => /^\.rg-portal\s+\.rg-autocomplete-row$/.test(selector)), "the row rule exists and is scoped to the portal");
  assert.deepEqual(selectors.filter((selector) => /rm-autocomplete/.test(selector)), [], "Roam's own menu classes are never a subject here");
});

// node:test has no layout engine, so this cannot see a 28px row. It is a CSS-level guard for the two
// declarations the live measurement turned on. Measured in the running app against a 360px popover:
// without the ellipsis a long block suggestion wrapped to three lines and a 102px row, and with the
// flexible track left on the detail instead of the primary, the detail was squeezed to zero width and
// vanished from every long row.
test("the suggestion primary is the flexible track and clips to one line", async () => {
  const css = (await readFile(new URL("../extension.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");

  const row = css.match(/\.rg-portal \.rg-autocomplete-row \{([^}]*)\}/);
  assert.ok(row, "the sweep must actually find the row rule");
  assert.match(row[1], /grid-template-columns:\s*minmax\(\d+px, 1fr\)/, "the primary track takes the free space, not the detail");

  const primary = css.match(/\.rg-portal \.rg-autocomplete-primary \{([^}]*)\}/);
  assert.ok(primary, "the sweep must actually find the primary rule");
  assert.match(primary[1], /overflow:\s*hidden;/);
  assert.match(primary[1], /text-overflow:\s*ellipsis;/);
  assert.match(primary[1], /white-space:\s*nowrap;/);
});

// node:test has no layout engine, so this cannot observe wrapping behavior. It is a CSS-level
// regression guard only: `overflow-wrap: anywhere` breaks a word at any character (shredding
// "Protein / 100g" into "Protei" / "n /" / "100g"), while `break-word` only breaks a word that
// cannot fit on a line of its own. Formula source is the one place an unbroken run of characters
// genuinely should break anywhere, so `.rg-formula-expression` is asserted the other way.
test("cell and inline-reference text wraps at word boundaries, not mid-word", async () => {
  const css = (await readFile(new URL("../extension.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");

  const cellRule = css.match(/\.rg-cell\s*\{([^}]*)\}/);
  assert.ok(cellRule, "the sweep must actually find the .rg-cell rule");
  assert.match(cellRule[1], /overflow-wrap:\s*break-word;/);
  assert.doesNotMatch(cellRule[1], /overflow-wrap:\s*anywhere/);

  const inlineReferenceRule = css.match(/\.rg-inline-reference-block\s*\{([^}]*)\}/);
  assert.ok(inlineReferenceRule, "the sweep must actually find the .rg-inline-reference-block rule");
  assert.match(inlineReferenceRule[1], /overflow-wrap:\s*break-word;/);
  assert.doesNotMatch(inlineReferenceRule[1], /overflow-wrap:\s*anywhere/);

  const formulaExpressionRule = css.match(/\.rg-formula-expression\s*\{([^}]*)\}/);
  assert.ok(formulaExpressionRule, "the sweep must actually find the .rg-formula-expression rule");
  assert.match(formulaExpressionRule[1], /overflow-wrap:\s*anywhere;/, "formula source is a single unbroken run, unlike prose — it keeps the aggressive break");
});

// ---------------------------------------------------------------------------
// GOAL-FIX-B — editing-surface safety + claim hygiene
// ---------------------------------------------------------------------------

test("a live editing form control is never a text-claim candidate, even with the marker in it", () => {
  installMiniDom();
  // Probe-confirmed: Roam's editing <textarea> carries the same block-input-<window>-<uid> id
  // shape as the block host div, and its textContent is the raw block string — the marker included.
  const textarea = new MiniNode("textarea"); textarea.id = "block-input-main-window-blk123456";
  textarea.textContent = "{{roam-grid-range: ((tbl00001)) B2:D5}}";
  const input = new MiniNode("input"); input.id = "block-input-main-window-blk999999";
  input.textContent = "{{roam-grid-range: ((tbl00001)) B2:D5}}";
  const root = new MiniNode("div"); root.append(textarea, input);

  assert.deepEqual(rangeTextHostsWithin(root), [], "form controls are Roam's live editor — hands off");
  assert.deepEqual(rangeTextHostsWithin(textarea), [], "even passed as the scan root itself");
});

test("a host whose block is being edited is never text-claimed", () => {
  installMiniDom();
  const host = rangeHostVariant("bem");
  const editor = new MiniNode("textarea");
  editor.textContent = "{{roam-grid-range: ((tbl00001)) B2:D5}}";
  host.appendChild(editor);
  globalThis.document.activeElement = editor;
  try {
    assert.deepEqual(rangeTextHostsWithin(host), [], "a focused Roam input inside the host means edit mode — hands off");
  } finally { globalThis.document.activeElement = null; }
  assert.deepEqual(rangeTextHostsWithin(host), [host], "once the editor blurs, the host is a candidate again");
});

test("a marker wrapped in prose keeps Roam's native render — no text claim", () => {
  installMiniDom();
  const host = rangeHostVariant("bem");
  const prose = "Q3 summary {{roam-grid-range: ((tbl00001)) B2:D5}} — see C2";
  host.textContent = prose;
  const root = new MiniNode("div"); root.appendChild(host);
  const mounted = []; const traced = [];
  claimRangeMounts(root, claimDeps({
    strings: new Map([["blk123456", prose]]),
    mount: (element, info) => mounted.push({ element, info }),
    traced,
  }));

  assert.equal(mounted.length, 0, "mixed-content blocks keep Roam's native render");
  assert.equal(host.classList.contains("rg-range-host"), false, "the host-hide would erase the sibling prose");
  assert.deepEqual(traced.map((entry) => entry.stage), ["no-spec"]);

  // Positive control: the marker alone (surrounding whitespace tolerated) still claims.
  const clean = "  {{roam-grid-range: ((tbl00001)) B2:D5}}  ";
  host.textContent = clean;
  claimRangeMounts(root, claimDeps({
    strings: new Map([["blk123456", clean]]),
    mount: (element, info) => mounted.push({ element, info }),
    traced: [],
  }));
  assert.equal(mounted.length, 1);
  assert.equal(host.classList.contains("rg-range-host"), true);
});

test("a button rendered after a text claim replaces the text view — one excerpt per block", () => {
  installMiniDom();
  const marker = "{{roam-grid-range: ((tbl00001)) B2:D5}}";
  const host = rangeHostVariant("bem");
  host.textContent = marker;
  const root = new MiniNode("div"); root.appendChild(host);
  const mounted = [];
  const deps = claimDeps({
    strings: new Map([["blk123456", marker]]),
    mount: (element, info) => mounted.push({ element, info }),
  });
  const textView = { root: new MiniNode("section"), disposed: 0, dispose() { this.disposed += 1; host.classList.remove("rg-range-host"); } };
  deps.mount = (element, info) => { mounted.push({ element, info }); deps.viewsByNative.set(element, element === host ? textView : { root: new MiniNode("section"), dispose() {} }); };

  claimRangeMounts(root, deps);
  assert.equal(mounted.length, 1);
  assert.equal(mounted[0].element, host, "scan one text-claims the buttonless host");
  assert.equal(host.classList.contains("rg-range-host"), true);

  // Roam then renders the component button inside the same block.
  const button = rangeButtonIn(host);
  claimRangeMounts(root, deps);

  assert.equal(mounted.length, 2, "the button mounts");
  assert.equal(mounted[1].element, button);
  assert.equal(textView.disposed, 1, "the text view is disposed exactly once");
  assert.equal(deps.viewsByNative.get(host), undefined, "the text claim's registry entry is gone");
  assert.equal(host.classList.contains("rg-range-host"), false, "the host-hide lifts with the text view");
});

test("a cached range spec re-parses when the block string changes under the same button node", () => {
  installMiniDom();
  const entries = new Map();
  const button = rangeButtonIn(rangeHostVariant("bem"));
  let value = "{{roam-grid-range: ((tbl00001)) B2:D5}}";
  const readString = () => value;

  const first = rangeInstanceInfo(button, entries, readString);
  assert.equal(first.label, "B2:D5");
  assert.equal(rangeInstanceInfo(button, entries, readString), first, "an unchanged string returns the cached spec by identity");

  value = "{{roam-grid-range: ((tbl00001)) A1:A2}}";
  const next = rangeInstanceInfo(button, entries, readString);
  assert.notEqual(next, first);
  assert.equal(next.label, "A1:A2", "an edited range string must not serve the stale spec");
  assert.equal(entries.get("blk123456").info, next);

  value = "no marker any more";
  assert.equal(rangeInstanceInfo(button, entries, readString), null, "editing the marker away drops the spec");
  assert.equal(entries.get("blk123456").info, null, "the negative caches with its source string");
  assert.equal(entries.get("blk123456").text, "no marker any more");

  value = "{{roam-grid-range: ((tbl00001)) C3:C4}}";
  assert.equal(rangeInstanceInfo(button, entries, readString)?.label, "C3:C4", "a cached negative recovers when the string becomes a spec again");
});

test("dispose adds rg-range-restored to a real component button only, never to a text host", () => {
  installMiniDom();
  const model = persistedModel();
  const session = sessionFor(model);
  const host = rangeHostVariant("bem");
  // mountRangeTextHost passes the plain block div as nativeElement — that is the case under test.
  const view = new RangeGridView({ host, session, range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, nativeElement: host });
  host.classList.add("rg-range-host");

  view.dispose({ releaseNative: true });
  assert.equal(host.classList.contains("rg-range-host"), false, "the hide lifts on every dispose path");
  assert.equal(host.classList.contains("rg-range-restored"), false, "a plain block div has no raw component to restore — the class would be stray");
});

test("portal dark-mode never resolves from the OS hint alone", async () => {
  const css = (await readFile(new URL("../extension.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/prefers-color-scheme:\s*dark/.test(css), false, "the host's own dark markers decide portal chrome — a dark OS over a light Roam must not paint dark portals");
});
