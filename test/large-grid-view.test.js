import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel, LargeGridStore, LargeGridView, ensureRuntimeRegistries, refreshSettingsCache, runtime, settingsCache,
} from "../src/extension.js";

ensureRuntimeRegistries();

const NO_STORAGE = { getItem: () => null, setItem: () => {} };

function withSettings(values) {
  refreshSettingsCache({ settings: { getAll: () => ({ ...values }) } }, NO_STORAGE);
}

function installRoamMock(initial) {
  initial = initial || {};
  var uidCounter = 0;
  var fileCounter = 0;
  var blocks = new Map();
  var files = new Map();

  var clone = function(block) { return { uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) }; };
  for (var k in initial.blocks || {}) blocks.set(k, { uid: k, string: initial.blocks[k].string, order: 0, children: [] });

  globalThis.window = {
    addEventListener: function() {}, removeEventListener: function() {}, dispatchEvent: function() { return true; },
    roamAlphaAPI: {
      util: { generateUID: function() { return "uid" + String(++uidCounter).padStart(6, "0"); } },
      q: function(query, bound) { var uid = bound ? String(bound) : /:block\/uid "([^"]+)"/.exec(query)?.[1]; return uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []; },
      data: { block: {
        create: async function(opts) { blocks.set(opts.block.uid, { uid: opts.block.uid, string: opts.block.string, order: 0, children: [] }); },
        update: async function(opts) { blocks.get(opts.block.uid).string = opts.block.string; },
      } },
      file: {
        upload: async function(opts) { var url = "https://mock/" + (++fileCounter); files.set(url, await opts.file.text()); return url; },
        get: async function(opts) { if (!files.has(opts.url)) throw new Error("missing " + opts.url); return new File([files.get(opts.url)], "grid.json", { type: "application/json" }); },
        delete: async function(opts) { files.delete(opts.url); },
      },
    },
  };
  return { blocks: blocks, files: files, dispose: function() { delete globalThis.window; } };
}

var MiniClassList = function() { this.values = new Set(); };
MiniClassList.prototype = {
  add: function() { var args = arguments; for (var i = 0; i < args.length; i += 1) this.values.add(args[i]); },
  remove: function() { var args = arguments; for (var i = 0; i < args.length; i += 1) this.values.delete(args[i]); },
  contains: function(v) { return this.values.has(v); },
  toggle: function(v, f) { if (f == null ? this.values.has(v) : !f) this.values.delete(v); else this.values.add(v); return this.values.has(v); },
};

var MiniNode = function(tagName, text) {
  this.tagName = (tagName || "#text").toUpperCase(); this.parentNode = null; this.children = []; this.listeners = new Map();
  this.classList = new MiniClassList(); this.dataset = {}; this.style = { setProperty: function() {}, removeProperty: function() {} };
  this.hidden = false; this._text = text || ""; this._id = "";
  this.scrollTop = 0; this.scrollLeft = 0; this.clientHeight = 600; this.clientWidth = 800;
};
MiniNode.prototype = {
  get id() { return this._id; },
  set id(v) { this._id = String(v); },
  set textContent(v) { this._text = String(v || ""); this.children = []; },
  get textContent() { if (this.children.length) { var out = ""; for (var i = 0; i < this.children.length; i += 1) out += this.children[i].textContent; return out; } return this._text; },
  get isConnected() { for (var cur = this; cur; cur = cur.parentNode) if (cur === globalThis.document?.body) return true; return false; },
  append: function() { for (var i = 0; i < arguments.length; i += 1) { var n = arguments[i]; this.appendChild(typeof n === "string" ? new MiniNode("#text", n) : n); } },
  appendChild: function(node) { if (node.parentNode) node.remove(); node.parentNode = this; this.children.push(node); return node; },
  prepend: function() { var nodes = Array.prototype.slice.call(arguments).map(function(n) { return typeof n === "string" ? new MiniNode("#text", n) : n; }); for (var i = nodes.length - 1; i >= 0; i -= 1) { var n = nodes[i]; if (n.parentNode) n.remove(); n.parentNode = this; this.children.unshift(n); } },
  replaceChildren: function() { for (var i = 0; i < this.children.length; i += 1) this.children[i].parentNode = null; this.children = []; this.append.apply(this, arguments); },
  remove: function() { if (!this.parentNode) return; var p = this.parentNode; p.children = p.children.filter(function(c) { return c !== this; }.bind(this)); this.parentNode = null; },
  contains: function(node) { for (var cur = node; cur; cur = cur.parentNode) if (cur === this) return true; return false; },
  closest: function(sel) { for (var cur = this; cur; cur = cur.parentNode) if (cur.matches && cur.matches(sel)) return cur; return null; },
  matches: function(sel) { return String(sel || "").split(",").some(function(s) { var v = s.trim(); return v.startsWith(".") && this.classList.contains(v.slice(1)); }.bind(this)); },
  querySelector: function(sel) { return this.querySelectorAll(sel)[0] || null; },
  querySelectorAll: function(sel) { var found = []; for (var i = 0; i < this.children.length; i += 1) { var c = this.children[i]; if (c.matches && c.matches(sel)) found.push(c); Array.prototype.push.apply(found, c.querySelectorAll(sel)); } return found; },
  addEventListener: function(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); },
  removeEventListener: function(type, listener) { var ls = this.listeners.get(type); if (ls) this.listeners.set(type, ls.filter(function(l) { return l !== listener; })); },
  setAttribute: function(name, value) { this[name] = String(value); this.dataset[name] = String(value); },
  getAttribute: function(name) { return this[name] == null ? null : String(this[name]); },
  getBoundingClientRect: function() { return { left: 10, right: 300, top: 20, bottom: 600, width: 290, height: 580 }; },
  focus: function() {},
  scrollTo: function() {},
};

function installMiniDom() {
  var body = new MiniNode("body");
  var doc = { body: body, activeElement: null, documentElement: { clientWidth: 1024 },
    createElement: function(name) { return new MiniNode(name); },
    createTextNode: function(text) { return new MiniNode("#text", text); },
    head: new MiniNode("head"),
    addEventListener: function() {}, removeEventListener: function() {},
    querySelector: function(sel) { return body.querySelector(sel); },
    querySelectorAll: function(sel) { return body.querySelectorAll(sel); },
  };
  globalThis.document = doc;
  var frames = [];
  globalThis.requestAnimationFrame = function(cb) { frames.push(cb); return frames.length; };
  globalThis.cancelAnimationFrame = function() {};
  return { body: body, doc: doc, flush: function() { while (frames.length) frames.shift()(); } };
}

function emptyRows(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

async function mountLargeView(uid, { rows = 4, cols = 3 } = {}) {
  var store = await new LargeGridStore(uid).initialize(new GridModel({ rows: emptyRows(rows, cols), showHeaders: false }));
  var dom = installMiniDom();
  var host = new MiniNode("div");
  dom.body.appendChild(host);
  var view = new LargeGridView({ host: host, store: store });
  await view.renderVisible();
  return { store, dom, host, view };
}

function firePointerDown(cell, x, y) {
  var listener = cell.listeners.get("pointerdown")[0];
  listener({ button: 0, shiftKey: false, clientX: x, clientY: y, target: cell, preventDefault: function() {}, stopPropagation: function() {} });
}

function firePointerEnter(cell, x, y) {
  var listener = cell.listeners.get("pointerenter")[0];
  listener({ clientX: x, clientY: y });
}

test("F1a: pointerdown focuses the grid root with { preventScroll: true }", async function() {
  withSettings({ "new-grid-rows": 4, "new-grid-cols": 3, "large-chunk-rows": 500 });
  var mock = installRoamMock({ blocks: { viewFocus: { string: "{{[[roam/grid]]}}", children: [] } } });
  try {
    var m = await mountLargeView("viewFocus");
    try {
      var cell = m.view.cells.get("0:0");
      var focusCalls = [];
      m.view.root.focus = function() { focusCalls.push([].slice.call(arguments)); };
      firePointerDown(cell, 5, 5);
      assert.equal(focusCalls.length, 1, "pointerdown focuses the grid root");
      assert.deepEqual(focusCalls[0], [{ preventScroll: true }], "root focus carries preventScroll so the cursor stays on the clicked cell");
    } finally { m.view.dispose(); }
  } finally { mock.dispose(); settingsCache.clear(); runtime.largeStores.clear(); runtime.largeMounts.clear(); }
});

test("F1b: stationary pointerenter after pointerdown does not extend selection", async function() {
  withSettings({ "new-grid-rows": 4, "new-grid-cols": 3, "large-chunk-rows": 500 });
  var mock = installRoamMock({ blocks: { viewStationary: { string: "{{[[roam/grid]]}}", children: [] } } });
  try {
    var m = await mountLargeView("viewStationary");
    try {
      firePointerDown(m.view.cells.get("0:0"), 5, 5);
      firePointerEnter(m.view.cells.get("2:2"), 5, 5);
      assert.deepEqual(m.view.selection, { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, "no pointer movement keeps a 1x1 selection");
    } finally { m.view.dispose(); }
  } finally { mock.dispose(); settingsCache.clear(); runtime.largeStores.clear(); runtime.largeMounts.clear(); }
});

test("F1b: a real drag extends the selection to the entered cell", async function() {
  withSettings({ "new-grid-rows": 4, "new-grid-cols": 3, "large-chunk-rows": 500 });
  var mock = installRoamMock({ blocks: { viewDrag: { string: "{{[[roam/grid]]}}", children: [] } } });
  try {
    var m = await mountLargeView("viewDrag");
    try {
      firePointerDown(m.view.cells.get("0:0"), 10, 10);
      firePointerEnter(m.view.cells.get("2:2"), 80, 80);
      assert.deepEqual(m.view.selection, { startRow: 0, endRow: 2, startCol: 0, endCol: 2 }, "movement past the threshold extends the range");
    } finally { m.view.dispose(); }
  } finally { mock.dispose(); settingsCache.clear(); runtime.largeStores.clear(); runtime.largeMounts.clear(); }
});

test("F1c: drag-extend repaints in place via updateLargeSelection, not a full render", async function() {
  withSettings({ "new-grid-rows": 4, "new-grid-cols": 3, "large-chunk-rows": 500 });
  var mock = installRoamMock({ blocks: { viewNoRender: { string: "{{[[roam/grid]]}}", children: [] } } });
  try {
    var m = await mountLargeView("viewNoRender");
    try {
      var scheduleCalls = 0;
      m.view.scheduleRender = function() { scheduleCalls += 1; };
      firePointerDown(m.view.cells.get("0:0"), 10, 10);
      firePointerEnter(m.view.cells.get("2:2"), 80, 80);
      assert.equal(scheduleCalls, 0, "the enter handler toggles classes in place instead of scheduling a full render");
    } finally { m.view.dispose(); }
  } finally { mock.dispose(); settingsCache.clear(); runtime.largeStores.clear(); runtime.largeMounts.clear(); }
});

test("F1e: partially overlapped merge paints rg-cell--selected identically on render and selection update", async function() {
  withSettings({ "new-grid-rows": 4, "new-grid-cols": 3, "large-chunk-rows": 500 });
  var mock = installRoamMock({ blocks: { viewMerge: { string: "{{[[roam/grid]]}}", children: [] } } });
  try {
    var m = await mountLargeView("viewMerge");
    await m.store.merge({ startRow: 2, endRow: 2, startCol: 0, endCol: 1 });
    m.view.selection = { startRow: 2, endRow: 2, startCol: 1, endCol: 1 };
    try {
      await m.view.renderVisible();
      var anchor = m.view.cells.get("2:0");
      assert.ok(anchor, "merge anchor cell is mounted");
      assert.ok(anchor.classList.contains("rg-cell--selected"), "renderVisible paints a merge the selection overlaps selected");
      m.view.updateLargeSelection();
      assert.ok(anchor.classList.contains("rg-cell--selected"), "updateLargeSelection paints the same overlapped merge selected");
    } finally { m.view.dispose(); }
  } finally { mock.dispose(); settingsCache.clear(); runtime.largeStores.clear(); runtime.largeMounts.clear(); }
});
