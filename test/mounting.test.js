import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import extension, {
  GridModel,
  NativeGridSession,
  createGridThemeBridge,
  enhancedUidGuardCss,
  graphCacheKey,
  installPortalObservers,
  instanceSurface,
  nativeTableInstanceInfo,
  portalObservers,
  readEnhancedUidCache,
  syncGridThemeFromHost,
  writeEnhancedUidCache,
} from "../src/extension.js";

test("graph-scoped enhanced UID cache is sorted, validated, and corruption-safe", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const key = graphCacheKey("#/app/Svy/page/abc");
  assert.equal(key, "roam-grid:enhanced-uids:Svy");
  assert.deepEqual(writeEnhancedUidCache(["z-table", "a-table", "z-table"], storage, key), ["a-table", "z-table"]);
  assert.deepEqual([...readEnhancedUidCache(storage, key)], ["a-table", "z-table"]);
  values.set(key, "not-json");
  assert.deepEqual([...readEnhancedUidCache(storage, key)], []);
});

test("pre-paint guard covers canonical and referenced instances without collapsing layout", () => {
  const css = enhancedUidGuardCss(new Set(["NgPxePzgl", "abc"]));
  assert.match(css, /\[id\$="NgPxePzgl"\] \.rm-table/);
  assert.match(css, /\.rm-block-ref\[data-uid="NgPxePzgl"\] \.rm-table/);
  assert.match(css, /visibility: hidden !important/);
  assert.doesNotMatch(css, /display:\s*none/);
});

test("pre-paint guard emits exactly three selector families per uid, including bare data-uid surfaces", () => {
  const css = enhancedUidGuardCss(new Set(["NgPxePzgl", "abc"]));
  const selectors = css.slice(0, css.indexOf("{")).split(",").map((selector) => selector.trim()).filter(Boolean);
  assert.equal(selectors.length, 6);
  for (const uid of ["NgPxePzgl", "abc"]) {
    assert.ok(selectors.includes(`[id$="${uid}"] .rm-table:not(.rg-native-hidden)`));
    assert.ok(selectors.includes(`.rm-block-ref[data-uid="${uid}"] .rm-table:not(.rg-native-hidden)`));
    assert.ok(selectors.includes(`[data-uid="${uid}"] .rm-table:not(.rg-native-hidden)`));
  }
  assert.doesNotMatch(css, /display:\s*none/);
});

test("native table instance resolution prefers the canonical UID on a block reference", () => {
  const entries = new Map([
    ["sourceUid", { value: { mode: "native" } }],
    ["largeUid", { value: { mode: "large" } }],
  ]);
  const reference = { dataset: { uid: "sourceUid" }, getAttribute: () => "sourceUid" };
  const referencedTable = { closest: (selector) => selector === ".rm-block-ref[data-uid]" ? reference : null };
  assert.deepEqual(nativeTableInstanceInfo(referencedTable, entries), { uid: "sourceUid", context: "reference", referenceElement: reference });

  const block = { id: "block-input-sourceUid", dataset: {}, parentElement: null };
  const sourceTable = { closest: () => null, parentElement: block };
  assert.deepEqual(nativeTableInstanceInfo(sourceTable, entries), { uid: "sourceUid", context: "source", referenceElement: null });

  const largeReference = { dataset: { uid: "largeUid" }, getAttribute: () => "largeUid" };
  assert.equal(nativeTableInstanceInfo({ closest: () => largeReference }, entries), null);
});

test("native table instance resolution returns the nearest enhanced ancestor regardless of map insertion order", () => {
  const outer = { id: "block-input-w1-outerUid", dataset: {}, parentElement: null };
  const inner = { id: "block-input-w1-innerUid", dataset: {}, parentElement: outer };
  const table = { closest: () => null, id: "", dataset: {}, parentElement: inner };
  const native = { value: { mode: "native" } };

  const outerFirst = new Map([["outerUid", native], ["innerUid", native]]);
  const innerFirst = new Map([["innerUid", native], ["outerUid", native]]);
  assert.deepEqual(nativeTableInstanceInfo(table, outerFirst), { uid: "innerUid", context: "source", referenceElement: null });
  assert.deepEqual(nativeTableInstanceInfo(table, innerFirst), { uid: "innerUid", context: "source", referenceElement: null });

  const nearestLarge = { id: "block-input-w1-largeUid", dataset: {}, parentElement: outer };
  const belowLarge = { closest: () => null, id: "", dataset: {}, parentElement: nearestLarge };
  const withLarge = new Map([["largeUid", { value: { mode: "large" } }], ["outerUid", native]]);
  assert.deepEqual(nativeTableInstanceInfo(belowLarge, withLarge), { uid: "outerUid", context: "source", referenceElement: null });
});

test("native table instance resolution prefers a dataset uid over an id suffix on the same ancestor", () => {
  const block = { id: "block-input-w1-suffixUid", dataset: { uid: "datasetUid" }, parentElement: null };
  const table = { closest: () => null, id: "", dataset: {}, parentElement: block };
  const native = { value: { mode: "native" } };
  const suffixFirst = new Map([["suffixUid", native], ["datasetUid", native]]);
  assert.deepEqual(nativeTableInstanceInfo(table, suffixFirst), { uid: "datasetUid", context: "source", referenceElement: null });
});

test("instanceSurface classifies preview, sidebar, embed, and main ancestries", () => {
  const within = (...marks) => ({ closest: (selector) => (String(selector).split(",").map((part) => part.trim()).some((part) => marks.includes(part)) ? { marks } : null) });
  assert.equal(instanceSurface(within(".bp3-portal")), "preview");
  assert.equal(instanceSurface(within(".bp3-tooltip")), "preview");
  assert.equal(instanceSurface(within(".bp3-popover")), "preview");
  assert.equal(instanceSurface(within("#right-sidebar")), "sidebar");
  assert.equal(instanceSurface(within("#roam-right-sidebar-content")), "sidebar");
  assert.equal(instanceSurface(within(".rm-embed-container")), "embed");
  assert.equal(instanceSurface(within()), "main");
  assert.equal(instanceSurface(within(".bp3-portal", "#right-sidebar", ".rm-embed-container")), "preview");
  assert.equal(instanceSurface(null), "main");
  assert.equal(instanceSurface({}), "main");
});

test("host theme bridge samples Blueprint-style body colors and skips unchanged writes", () => {
  const writes = new Map(); let writeCount = 0;
  const root = { style: { setProperty(name, value) { writes.set(name, value); writeCount += 1; } }, parentElement: null };
  const body = { parentElement: null };
  const host = { parentElement: body };
  const cell = {};
  const native = { parentElement: host, querySelector: () => cell };
  const previousDocument = globalThis.document; globalThis.document = { body };
  const styles = new Map([
    [body, { "background-color": "rgb(32, 43, 51)", color: "rgb(245, 248, 250)" }],
    [host, { "background-color": "rgba(0, 0, 0, 0)", color: "rgb(245, 248, 250)" }],
    [native, { color: "rgb(167, 182, 194)" }],
    [cell, { "border-right-color": "rgb(206, 217, 224)" }],
  ]);
  const getStyle = (element) => ({ getPropertyValue: (name) => styles.get(element)?.[name] || "" });
  try {
    const first = syncGridThemeFromHost(native, root, getStyle);
    assert.equal(first.changed, true);
    assert.equal(writes.get("--rg-bg"), "rgb(32, 43, 51)");
    assert.equal(writes.get("--rg-color"), "rgb(245, 248, 250)");
    assert.equal(writes.get("--rg-active"), "#48aff0");
    const count = writeCount;
    assert.equal(syncGridThemeFromHost(native, root, getStyle).changed, false);
    assert.equal(writeCount, count);
  } finally { globalThis.document = previousDocument; }
});

test("cached view palette skips an initial style read and observes only theme boundaries", () => {
  const html = {}; const body = {}; const theme = {}; const observed = [];
  const previousDocument = globalThis.document;
  globalThis.document = { documentElement: html, body };
  class Observer {
    constructor(callback) { this.callback = callback; }
    observe(node) { observed.push(node); }
    disconnect() {}
  }
  const root = { style: {}, __rgGridPalette: { "--rg-bg": "#202b33" } };
  const native = { closest: () => theme };
  try {
    const bridge = createGridThemeBridge(native, root, {
      getStyle: () => { throw new Error("cached mount must not sample layout"); },
      MutationObserverClass: Observer,
      matchMedia: null,
      initialSync: false,
    });
    assert.deepEqual(observed, [html, body, theme]);
    bridge.dispose();
  } finally { globalThis.document = previousDocument; }
});

test("one native session shares a model, watch, repaint, and undo history across views", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell-a", raw: "1" }]], tableUid: "table-a" });
  let watchCount = 0; let disposed = 0;
  const adapter = {
    model,
    load: () => model,
    watchExternal(callback) { watchCount += 1; this.callback = callback; return () => {}; },
    getBaseRaw: () => "1",
    saveContent: async (changes) => ({ saved: [...changes.values()], skipped: [] }),
    save: async (value) => value,
    dispose: () => { disposed += 1; },
  };
  const session = new NativeGridSession("table-a", { adapter, model });
  const makeView = () => ({
    model, adapter, session: null,
    root: { classList: { toggle() {} } },
    captureRowDeletionContext: () => null,
    patchRowDeletion: () => false,
    renderCount: 0, refreshCount: 0,
    render() { this.renderCount += 1; },
    refreshValues() { this.refreshCount += 1; },
  });
  const first = makeView(); const second = makeView(); session.addView(first); session.addView(second);
  assert.equal(watchCount, 1);
  await session.commitMutation(second, "Edit", () => session.model.setRaw(0, 0, "2"), false);
  assert.equal(first.model, second.model);
  assert.equal(first.model.getRaw(0, 0), "2");
  assert.equal(first.refreshCount, 1); assert.equal(second.refreshCount, 1);
  assert.equal(session.undo(), true);
  assert.equal(first.model.getRaw(0, 0), "1");
  assert.equal(first.renderCount, 0); assert.equal(second.renderCount, 0);
  assert.equal(first.refreshCount, 2); assert.equal(second.refreshCount, 2);
  session.dispose(); assert.equal(disposed, 1);
});

test("a shared session commits the previous instance editor before opening another", async () => {
  const model = new GridModel({ rows: [[""]], tableUid: "table-a" });
  const adapter = { model, load: () => model, watchExternal: () => () => {}, dispose() {} };
  const session = new NativeGridSession("table-a", { adapter, model });
  let finishes = 0; let starts = 0;
  const first = { editorController: { state: {}, finish: async (commit) => { assert.equal(commit, true); finishes += 1; } } };
  const second = {};
  session.activeEditorView = first;
  await session.beginEdit(second, async () => { starts += 1; });
  assert.equal(finishes, 1); assert.equal(starts, 1); assert.equal(session.activeEditorView, second);
  session.dispose();
});

function makePortal(name) {
  return { nodeType: 1, name, matches: (selector) => selector === ".bp3-portal" };
}

function installPortalHarness(existing = []) {
  const instances = [];
  class FakeObserver {
    constructor(callback) { this.callback = callback; this.observed = []; this.disconnects = 0; instances.push(this); }
    observe(node, options) { this.observed.push({ node, options }); }
    disconnect() { this.disconnects += 1; }
  }
  const scans = [];
  const ownerDocument = { body: { name: "body" }, querySelectorAll: (selector) => (selector === ".bp3-portal" ? existing : []) };
  const dispose = installPortalObservers({ MutationObserverClass: FakeObserver, ownerDocument, scan: (root) => scans.push(root) });
  return { instances, scans, ownerDocument, dispose, body: instances[0] };
}

test("the portal watcher observes body with childList only and never subtree", (t) => {
  const harness = installPortalHarness();
  t.after(harness.dispose);
  assert.equal(harness.instances.length, 1);
  assert.equal(harness.body.observed.length, 1);
  assert.equal(harness.body.observed[0].node, harness.ownerDocument.body);
  assert.deepEqual(harness.body.observed[0].options, { childList: true });
  assert.equal("subtree" in harness.body.observed[0].options, false);
});

test("each Blueprint portal gets its own subtree observer and a synchronous scan", (t) => {
  const preexisting = makePortal("preexisting");
  const harness = installPortalHarness([preexisting]);
  t.after(harness.dispose);
  assert.equal(portalObservers.size, 1, "portals already mounted at install time must be swept");
  assert.deepEqual(harness.scans, [preexisting]);

  const added = makePortal("added");
  const ignored = { nodeType: 1, name: "not-a-portal", matches: () => false };
  harness.body.callback([{ addedNodes: [added, ignored], removedNodes: [] }]);
  assert.equal(portalObservers.size, 2);
  assert.deepEqual(harness.scans, [preexisting, added]);
  const observer = portalObservers.get(added);
  assert.notEqual(observer, portalObservers.get(preexisting));
  assert.deepEqual(observer.observed, [{ node: added, options: { childList: true, subtree: true } }]);

  harness.body.callback([{ addedNodes: [added], removedNodes: [] }]);
  assert.equal(portalObservers.size, 2, "a re-reported portal must not be observed twice");
  assert.deepEqual(harness.scans, [preexisting, added]);
});

test("a removed Blueprint portal disconnects and drops its observer", (t) => {
  const harness = installPortalHarness();
  t.after(harness.dispose);
  const portal = makePortal("transient");
  harness.body.callback([{ addedNodes: [portal], removedNodes: [] }]);
  const observer = portalObservers.get(portal);
  assert.ok(observer);

  harness.body.callback([{ addedNodes: [], removedNodes: [portal] }]);
  assert.equal(portalObservers.has(portal), false);
  assert.equal(observer.disconnects, 1);
  assert.equal(portalObservers.size, 0);
});

test("unload disconnects the body watcher and empties the portal observer map", async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = { querySelectorAll: () => [] };
  delete globalThis.window;
  const harness = installPortalHarness([makePortal("one")]);
  harness.body.callback([{ addedNodes: [makePortal("two")], removedNodes: [] }]);
  const portalWatchers = [...portalObservers.values()];
  assert.equal(portalWatchers.length, 2);
  try {
    await extension.onunload();
    assert.equal(portalObservers.size, 0);
    assert.equal(harness.body.disconnects, 1);
    for (const watcher of portalWatchers) assert.equal(watcher.disconnects, 1);
  } finally {
    harness.dispose();
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});

test("extension CSS owns Blueprint dark and compact referenced toolbar behavior", async () => {
  const css = await readFile(new URL("../extension.css", import.meta.url), "utf8");
  assert.match(css, /body\.bt-theme-dark \.rg-root/);
  assert.match(css, /body\.bt-theme-dark \.rg-portal/);
  assert.match(css, /@container \(max-width: 560px\)/);
  assert.match(css, /\.rg-source-button/);
});
