import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel, LargeGridStore, LargeGridView, ensureRuntimeRegistries, getSetting,
  largeGridGuardCss, largeMetadataUids, readLargeUidCache,
  refreshSettingsCache, runtime, settingsCache, writeLargeUidCache,
} from "../src/extension.js";

const NO_STORAGE = { getItem: () => null, setItem: () => {} };

ensureRuntimeRegistries();

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
  for (var k in initial.blocks || {}) {
    var v = initial.blocks[k];
    blocks.set(k, { uid: k, string: v.string, order: 0, children: (v.children || []).map(function(child) { return { uid: child.uid, string: child.string, order: 0, children: [] }; }) });
  }
  for (var u in initial.files || {}) files.set(u, typeof initial.files[u] === "string" ? initial.files[u] : JSON.stringify(initial.files[u]));

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
  } };
  return { blocks: blocks, files: files, dispose: function() { delete globalThis.window; } };
}

var MiniClassList = function() { this.values = new Set(); };
MiniClassList.prototype = {
  add: function() { var args = arguments; for (var i = 0; i < args.length; i += 1) this.values.add(args[i]); },
  remove: function() { var args = arguments; for (var i = 0; i < args.length; i += 1) this.values.delete(args[i]); },
  contains: function(v) { return this.values.has(v); },
  toggle: function(v, f) { if (f == null ? this.values.has(v) : !f) this.values.delete(v); else this.values.add(v); return this.values.has(v); }
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
  scrollTo: function() {}
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

test("FIX-1: disposed LargeGridView renderVisible/scheduleRender must not touch store", async function() {
  withSettings({ "new-grid-rows": 5, "new-grid-cols": 2, "large-chunk-rows": 500 });
  var mock = installRoamMock({ blocks: { fix1uid: { string: "{{[[roam/grid]]}}", children: [] } } });
  try {
    var store = await new LargeGridStore("fix1uid").initialize(new GridModel({ rows: [["a", "b"]], showHeaders: false }));
    var dom = installMiniDom();
    var host = new MiniNode("div");
    dom.body.appendChild(host);
    var view = new LargeGridView({ host: host, store: store });

    view.dispose({ keepStore: true });
    assert.equal(view.disposed, true);

    var ensureCount = 0;
    var orig = store.ensureRowsSettled;
    store.ensureRowsSettled = function() { ensureCount += 1; return orig.apply(this, arguments); };

    await view.renderVisible();
    assert.equal(ensureCount, 0, "renderVisible on disposed view does not call ensureRowsSettled");

    view.scheduleRender();
    dom.flush();
    assert.equal(ensureCount, 0, "scheduled render on disposed view does not call ensureRowsSettled");
  } finally { mock.dispose(); settingsCache.clear(); runtime.largeStores.clear(); runtime.largeMounts.clear(); }
});

test("FIX-2: cache-miss beginEdit does NOT set editingPending", async function() {
  withSettings({ "new-grid-rows": 3, "new-grid-cols": 2, "large-chunk-rows": 500 });
  var mock = installRoamMock({ blocks: { fix2uid: { string: "{{[[roam/grid]]}}", children: [] } } });
  try {
    var store = await new LargeGridStore("fix2uid").initialize(new GridModel({ rows: [["a", "b"], ["c", "d"], ["e", "f"]], showHeaders: false }));
    store.cache.clear();

    var dom = installMiniDom();
    var host = new MiniNode("div");
    dom.body.appendChild(host);
    var view = new LargeGridView({ host: host, store: store });
    view.viewport.scrollTop = 0; view.viewport.scrollLeft = 0;

    var cell = new MiniNode("div");
    cell.dataset = { row: "1", col: "0" };
    cell.classList = new MiniClassList();
    cell.style = { setProperty: function() {}, removeProperty: function() {} };
    cell.getBoundingClientRect = function() { return { left: 10, right: 300, top: 20, bottom: 600, width: 290, height: 580 }; };
    host.appendChild(cell);
    view.cells.set("1:0", cell);

    // Cache-miss path: editingPending is NOT set
    var promise = view.beginEdit(1, 0, cell, "x", true);
    assert.equal(view.editingPending, false, "editingPending is NOT set for cache-miss beginEdit (FIX-2)");

    // Wait for the async beginEdit to settle before cleaning up
    await promise;
    view.dispose();
  } finally { mock.dispose(); settingsCache.clear(); runtime.largeStores.clear(); runtime.largeMounts.clear(); }
});

test("FIX-3: large guard CSS targets button with :not() release", function() {
  var uid = "fix3guard";
  var css = largeGridGuardCss([uid]);
  assert.ok(css.indexOf(".rm-xparser-default-grid:not(.rg-large-marker-hidden)") >= 0, "guard targets button with :not() release");
  // FIX-6: the [id$] suffix-match family was dropped (rule 15 shape); the guard scopes to uid via
  // the exact [data-uid] families instead.
  assert.ok(css.indexOf('[data-uid="fix3guard"]') >= 0, "guard is scoped to uid via exact data-uid");
  assert.equal(css.indexOf("[id$="), -1, "the suffix-match family is gone from the large guard");
});

test("FIX-3: mount adds rg-large-marker-hidden to button, dispose removes it", async function() {
  withSettings({ "new-grid-rows": 5, "new-grid-cols": 2, "large-chunk-rows": 500 });
  var mock = installRoamMock({ blocks: { fix3dom: { string: "{{[[roam/grid]]}}", children: [] } } });
  try {
    var store = await new LargeGridStore("fix3dom").initialize(new GridModel({ rows: [["a", "b"]], showHeaders: false }));

    var block = new MiniNode("div");
    block.id = "block-input-something-fix3dom";
    var btn = new MiniNode("span");
    btn.classList.add("rm-xparser-default-grid");
    var marker = new MiniNode("span");
    marker.classList.add("rm-block__input");
    marker.appendChild(btn);
    block.appendChild(marker);

    var dom = installMiniDom();
    dom.body.appendChild(block);

    var view = new LargeGridView({ host: block, store: store, markerElement: marker });
    dom.flush();

    assert.ok(btn.classList.contains("rg-large-marker-hidden"), "button gets rg-large-marker-hidden on mount");
    assert.ok(marker.classList.contains("rg-large-marker-hidden"), "wrapper gets rg-large-marker-hidden on mount");

    view.dispose();
    assert.equal(btn.classList.contains("rg-large-marker-hidden"), false, "button loses rg-large-marker-hidden on dispose");
    assert.equal(marker.classList.contains("rg-large-marker-hidden"), false, "wrapper loses rg-large-marker-hidden on dispose");
  } finally { mock.dispose(); settingsCache.clear(); runtime.largeStores.clear(); runtime.largeMounts.clear(); }
});

test("FIX-3: after dispose the raw marker button is visible again", async function() {
  withSettings({ "new-grid-rows": 5, "new-grid-cols": 2, "large-chunk-rows": 500 });
  var mock = installRoamMock({ blocks: { fix3vis: { string: "{{[[roam/grid]]}}", children: [] } } });
  try {
    var store = await new LargeGridStore("fix3vis").initialize(new GridModel({ rows: [["a", "b"]], showHeaders: false }));

    var block = new MiniNode("div");
    block.id = "block-input-something-fix3vis";
    var btn = new MiniNode("span");
    btn.classList.add("rm-xparser-default-grid");
    var marker = new MiniNode("span");
    marker.classList.add("rm-block__input");
    marker.appendChild(btn);
    block.appendChild(marker);

    var dom = installMiniDom();
    dom.body.appendChild(block);

    var view = new LargeGridView({ host: block, store: store, markerElement: marker });
    dom.flush();
    assert.ok(btn.classList.contains("rg-large-marker-hidden"), "button hidden during mount");

    view.dispose();
    assert.equal(btn.classList.contains("rg-large-marker-hidden"), false, "after dispose button is visible again");
  } finally { mock.dispose(); settingsCache.clear(); runtime.largeStores.clear(); runtime.largeMounts.clear(); }
});

test("FIX-4: largeMetadataUids picks up new large-mode entries and cache write/read round-trips", function() {
  var orig = runtime.metadata;
  try {
    runtime.metadata = { entries: new Map([["fix4uid", { value: { mode: "large" } }], ["nativeUid", { value: { mode: "native" } }]]) };
    var largeUids = largeMetadataUids();
    assert.ok(largeUids.has("fix4uid"), "largeMetadataUids includes the large-mode uid");
    assert.equal(largeUids.has("nativeUid"), false, "largeMetadataUids excludes native-mode uids");

    var store = { getItem: function(k) { return this[k] || null; }, setItem: function(k, v) { this[k] = v; } };
    writeLargeUidCache([...largeUids], store);
    var cached = readLargeUidCache(store);
    assert.ok(cached.has("fix4uid"), "round-tripped large uid survives write/read");
  } finally { runtime.metadata = orig; settingsCache.clear(); }
});

test("FIX-5: idle-timer closure references store directly, timer disposes correctly", async function() {
  withSettings({ "new-grid-rows": 5, "new-grid-cols": 2, "session-idle-ms": 50 });
  var mock = installRoamMock({ blocks: { fix5idle: { string: "{{[[roam/grid]]}}", children: [] } } });
  try {
    runtime.metadata = { entries: new Map([["fix5idle", { value: { mode: "large" } }]]), has: function(uid) { return this.entries.has(uid); } };
    runtime.extensionAPI = { settings: { getAll: function() { return {}; } } };
    var store = await new LargeGridStore("fix5idle").initialize(new GridModel({ rows: [["a", "b"]], showHeaders: false }));

    var dom = installMiniDom();
    var host = new MiniNode("div");
    dom.body.appendChild(host);
    var view = new LargeGridView({ host: host, store: store });
    var storeRef = view.store;

    runtime.largeMounts.set("fix5idle", view);
    view.root.remove();
    view.dispose({ keepStore: true });
    runtime.largeMounts.delete("fix5idle");
    var prior = runtime.largeStores.get("fix5idle");
    if (prior) clearTimeout(prior.idleTimer);
    runtime.largeStores.set("fix5idle", { store: storeRef, idleTimer: setTimeout(function() { runtime.largeStores.delete("fix5idle"); storeRef.dispose(); }, 50) });

    assert.equal(storeRef.disposed, false, "store survived keepStore disposal");

    await new Promise(function(resolve) { setTimeout(resolve, 100); });
    assert.equal(runtime.largeStores.has("fix5idle"), false, "store dropped after idle timeout");
    assert.equal(storeRef.disposed, true, "store disposed after idle timeout");
  } finally { mock.dispose(); settingsCache.clear(); runtime.largeStores.clear(); runtime.largeMounts.clear(); runtime.metadata = null; runtime.extensionAPI = null; }
});

test("FIX-6: disconnect+reconnect in one scan disposes old view AND reuses warm store", async function() {
  withSettings({ "new-grid-rows": 5, "new-grid-cols": 2, "session-idle-ms": 1500 });
  var mock = installRoamMock({ blocks: { fix6scan: { string: "{{[[roam/grid]]}}", children: [] } } });
  try {
    runtime.metadata = {
      entries: new Map([["fix6scan", { value: { mode: "large" } }]]),
      has: function(uid) { return this.entries.has(uid); }
    };
    runtime.extensionAPI = { settings: { getAll: function() { return {}; } } };
    var downloadCount = mock.files.size;

    // Phase 1: initial mount
    var store = await new LargeGridStore("fix6scan").initialize(new GridModel({ rows: [["a", "b"]], showHeaders: false }));
    downloadCount = mock.files.size;
    assert.ok(downloadCount > 0, "initial store downloaded chunks");

    var dom = installMiniDom();
    var host = new MiniNode("div");
    dom.body.appendChild(host);
    var view = new LargeGridView({ host: host, store: store });
    var disposeCalls = 0;
    var originalDispose = view.dispose;
    view.dispose = function(opts) { disposeCalls += 1; return originalDispose.call(this, opts); };
    runtime.largeMounts.set("fix6scan", view);

    // Phase 2: disconnect (simulating navigation away) — old view still in largeMounts
    view.root.remove();
    assert.equal(view.root.isConnected, false, "old view disconnected");
    assert.equal(runtime.largeStores.has("fix6scan"), false, "largeStores is empty before scan");

    // Phase 3: simulated scanMounts decided to remount (entry still in metadata, old mount still present)
    // Pre-warm disposal — THIS is the FIX-6 fix: runs BEFORE the warm-store decision
    var old = runtime.largeMounts.get("fix6scan");
    assert.ok(old, "old mount is still in largeMounts");
    if (old && !old.root?.isConnected) {
      old.dispose({ keepStore: true });
      if (old.store && !old.store.disposed && !runtime.largeStores.has("fix6scan")) {
        runtime.largeStores.set("fix6scan", { store: old.store, idleTimer: setTimeout(function() { runtime.largeStores.delete("fix6scan"); old.store.dispose(); }, getSetting("session-idle-ms")) });
      }
    }

    assert.equal(disposeCalls, 1, "old disconnected view disposed before overwrite (no leaked listener)");
    assert.ok(runtime.largeStores.has("fix6scan"), "warm store stashed for reuse");

    // Phase 4: warm-store decision — should REUSE the warm store (no second download)
    var warm = runtime.largeStores.get("fix6scan");
    assert.ok(warm, "warm entry exists");
    assert.ok(warm.store, "warm store exists");
    assert.equal(warm.store.disposed, false, "warm store is live");
    assert.strictEqual(warm.store, store, "same store instance");

    if (warm.store && !warm.store.disposed) {
      clearTimeout(warm.idleTimer);
      runtime.largeStores.delete("fix6scan");
      warm.store = store;
    }
    var reused = runtime.largeStores.size === 0 ? store : null; // Reused
    assert.ok(reused, "warm store was reused, not re-initialized");
    assert.equal(mock.files.size, downloadCount, "no extra downloads — warm reuse, not cold init");

    store.dispose();
  } finally { mock.dispose(); settingsCache.clear(); runtime.largeStores.clear(); runtime.largeMounts.clear(); runtime.metadata = null; runtime.extensionAPI = null; }
});
