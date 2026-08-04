import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  GridModel,
  NativeGridSession,
  createGridThemeBridge,
  enhancedUidGuardCss,
  graphCacheKey,
  nativeTableInstanceInfo,
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
  assert.equal(first.renderCount, 1); assert.equal(second.renderCount, 1);
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

test("extension CSS owns Blueprint dark and compact referenced toolbar behavior", async () => {
  const css = await readFile(new URL("../extension.css", import.meta.url), "utf8");
  assert.match(css, /body\.bt-theme-dark \.rg-root/);
  assert.match(css, /body\.bt-theme-dark \.rg-portal/);
  assert.match(css, /@container \(max-width: 560px\)/);
  assert.match(css, /\.rg-source-button/);
});
