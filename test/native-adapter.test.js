import test from "node:test";
import assert from "node:assert/strict";
import { GridModel, NativeGridSession, NativeTableAdapter, UndoHistory, nativeOverlayStrayRepair, nativeTreeToModel } from "../src/extension.js";

function rawTree() {
  return {
    uid: "table0001", string: "{{[[table]]}}", order: 0, children: [
      { uid: "row000001", string: "Name", order: 0, children: [{ uid: "cell00001", string: "Value", order: 0, children: [] }] },
      { uid: "row000002", string: "A", order: 1, children: [{ uid: "cell00002", string: " ", order: 0, children: [] }] },
    ],
  };
}

function keywordTree(tree) {
  return {
    ":block/uid": tree.uid, ":block/string": tree.string, ":block/order": tree.order,
    ":block/children": tree.children.map(keywordTree),
  };
}

test("native tree parser follows Roam row roots and first-child column chains", () => {
  const model = nativeTreeToModel(rawTree(), { frozenRows: 1 });
  assert.equal(model.tableUid, "table0001");
  assert.deepEqual(model.rows.map((row) => row.map((cell) => cell.raw)), [["Name", "Value"], ["A", ""]]);
  assert.deepEqual(model.rows.map((row) => row.map((cell) => cell.uid)), [["row000001", "cell00001"], ["row000002", "cell00002"]]);
});

test("native tree parser accepts keyword-shaped Roam pull results", () => {
  const model = nativeTreeToModel({ uid: "table0001", string: "{{[[table]]}}", order: 0, children: rawTree().children.map(keywordTree) });
  assert.equal(model.getRaw(1, 1), "");
});

test("native save updates changed content and requested layout metadata", async (t) => {
  const tree = rawTree(); const updates = []; const metadataWrites = []; let metadataValue = null;
  globalThis.window = { roamAlphaAPI: {
    q: () => [[tree]],
    data: { block: { update: async ({ block }) => { updates.push(block); const cell = tree.children[1].children[0]; cell.string = block.string; } } },
  } };
  t.after(() => { delete globalThis.window; });
  const metadata = { get: () => metadataValue, set: async (...args) => {
    metadataWrites.push(args); const saved = args[1];
    metadataValue = { columnIds: [...saved.columnIds], merges: structuredClone(saved.merges), widths: { ...saved.widths }, rowHeights: { ...saved.rowHeights }, alignments: { ...saved.alignments }, headerColumns: [...saved.headerColumns], headerRows: [...saved.headerRows], frozenRows: saved.frozenRows, frozenCols: saved.frozenCols, charts: structuredClone(saved.charts), showHeaders: saved.showHeaders, fitToWidth: saved.fitToWidth, colorFormulaCells: saved.colorFormulaCells };
  } };
  const adapter = new NativeTableAdapter("table0001", metadata); const model = adapter.load(); model.setRaw(1, 1, "42"); model.widths[model.columnIds[0]] = 212; model.setRowHeight(1, 46); model.setAlignment(1, 1, "right"); model.toggleHeaderColumn(0); model.toggleHeaderRow(1); model.fitToWidth = false;
  const saved = await adapter.save(model);
  assert.deepEqual(updates, [{ uid: "cell00002", string: "42" }]);
  assert.equal(metadataWrites.length, 1);
  assert.equal(metadataWrites[0][1].widths[model.columnIds[0]], 212);
  assert.equal(metadataWrites[0][1].getRowHeight(1), 46);
  assert.equal(saved.getRaw(1, 1), "42");
  assert.equal(saved.getRowHeight(1), 46);
  assert.equal(saved.getAlignment(1, 1), "right");
  assert.equal(saved.isHeaderColumn(0), true);
  assert.equal(saved.isHeaderRow(1), true);
  assert.equal(saved.fitToWidth, false);
});

test("content-only native save does not spend a metadata mutation", async (t) => {
  const tree = rawTree(); const updates = []; let metadataWrites = 0;
  globalThis.window = { roamAlphaAPI: {
    q: () => [[tree]],
    data: { block: { update: async ({ block }) => { updates.push(block); tree.children[1].children[0].string = block.string; } } },
  } };
  t.after(() => { delete globalThis.window; });
  const adapter = new NativeTableAdapter("table0001", { get: () => null, set: async () => { metadataWrites += 1; } });
  const model = adapter.load(); model.setRaw(1, 1, "fast edit");
  const saved = await adapter.save(model, { saveMetadata: false });
  assert.deepEqual(updates, [{ uid: "cell00002", string: "fast edit" }]);
  assert.equal(metadataWrites, 0);
  assert.equal(saved.getRaw(1, 1), "fast edit");
});

test("native save detects an external edit before writing", async (t) => {
  const tree = rawTree(); let writes = 0;
  globalThis.window = { roamAlphaAPI: { q: () => [[tree]], data: { block: { update: async () => { writes += 1; } } } } };
  t.after(() => { delete globalThis.window; });
  const adapter = new NativeTableAdapter("table0001", { get: () => null, set: async () => {} }); const model = adapter.load(); model.setRaw(1, 1, "42");
  tree.children[1].string = "external";
  await assert.rejects(adapter.save(model), { code: "CONFLICT" });
  assert.equal(writes, 0);
});

/* --------------------------------------------------------------------------------------------
 * GOAL-U1 — what the adapter and the session owe a cell being edited in Roam's own block editor.
 * ------------------------------------------------------------------------------------------ */

function overlaySessionHarness({ tableUid = "table0001" } = {}) {
  const model = new GridModel({ tableUid, columnIds: ["col0", "col1"], rows: [[{ uid: "cell00001", raw: "Alpha" }, { uid: "cell00002", raw: "Beta" }]] });
  const history = new UndoHistory();
  model.history = history;
  const base = new Map([["cell00001", "Alpha"], ["cell00002", "Beta"]]);
  const session = Object.assign(Object.create(NativeGridSession.prototype), {
    tableUid, model, history, views: new Set(), nativeOverlayUids: new Set(),
    adapter: { model, getBaseRaw: (uid) => base.get(uid) ?? null, acceptExternalTree() {}, load: () => model, saveContent: async () => ({ saved: [], skipped: [] }) },
    dirtyCells: new Map(), editRevisions: new Map(), metadataDirty: false, structuralPending: false,
    contentSavePromise: null, disposed: false, changeVersion: 0, savedVersion: 0, saveTimer: null,
    renderStructural() {}, refreshValues() {}, scheduleReferenceCountRefresh() {}, setSaving() {},
  });
  return { model, history, session, base };
}

test("the overlay's seed write comes back as an echo, not as an edit from somewhere else", (t) => {
  const tree = rawTree(); let handler = null;
  globalThis.window = { roamAlphaAPI: {
    q: () => [[tree]],
    data: { addPullWatch: (_pattern, _entity, fn) => { handler = fn; }, removePullWatch: () => {}, block: { update: async () => {} } },
  } };
  t.after(() => { delete globalThis.window; });
  const adapter = new NativeTableAdapter("table0001", { get: () => null, set: async () => {} });
  adapter.load();
  const events = [];
  adapter.watchExternal((_model, event) => events.push(event));

  // A typed character seeds the block before Roam's editor opens: cell00002 goes from " " to "x".
  adapter.recordSelfWrite("cell00002", "", "x");
  const seeded = structuredClone(tree); seeded.children[1].children[0].string = "x";
  handler(structuredClone(tree), seeded);
  assert.deepEqual(events, [], "our own seed must not surface as an external change");

  const remote = structuredClone(seeded); remote.children[1].children[0].string = "someone else";
  handler(seeded, remote);
  assert.equal(events.length, 1, "a write we did not record still reaches the session");
  assert.deepEqual(events[0].changes, [{ uid: "cell00002", from: "x", raw: "someone else", row: 1, col: 1 }]);
});

test("keystrokes flushed from a cell held by a native overlay take the non-conflict lane and record no undo entry", () => {
  const { model, history, session } = overlaySessionHarness();
  session.beginNativeOverlayEdit("cell00001");

  const typing = new GridModel({ columnIds: ["col0", "col1"], rows: [[{ uid: "cell00001", raw: "Alph" }, { uid: "cell00002", raw: "Beta" }]] });
  session.handleExternalChange(typing, { type: "content", structural: false, tree: {}, changes: [{ uid: "cell00001", raw: "Alph" }] });
  assert.equal(model.getRaw(0, 0), "Alph", "the model still follows what Roam wrote");
  assert.equal(history.entries.length, 0, "per-keystroke flushes are not undo entries — endNativeOverlayEdit pushes the single one");

  const elsewhere = new GridModel({ columnIds: ["col0", "col1"], rows: [[{ uid: "cell00001", raw: "Alph" }, { uid: "cell00002", raw: "remote" }]] });
  session.handleExternalChange(elsewhere, { type: "content", structural: false, tree: {}, changes: [{ uid: "cell00002", raw: "remote" }] });
  assert.equal(history.entries.length, 1, "a cell no overlay owns still records its external edit");
  assert.equal(history.entries[0].touched.includes("cell00002"), true);
});

test("endNativeOverlayEdit pushes exactly one undo entry and issues no second write", (t) => {
  const { model, history, session, base } = overlaySessionHarness();
  globalThis.window = { dispatchEvent() {} };
  t.after(() => { clearTimeout(session.saveTimer); delete globalThis.window; });
  session.beginNativeOverlayEdit("cell00001");
  // The overlay has already written the value and patched the adapter base before it ends the edit.
  base.set("cell00001", "Committed");
  model.getCell(0, 0).raw = "Committed";

  session.endNativeOverlayEdit("cell00001", { beforeRaw: "Alpha", afterRaw: "Committed", commit: true });

  assert.equal(session.nativeOverlayUids.has("cell00001"), false);
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].label, "Edit cell");
  assert.equal(history.entries[0].lane, "content");
  assert.deepEqual(history.entries[0].inverse, [{ op: "setRaw", uid: "cell00001", raw: "Alpha" }]);
  assert.deepEqual(history.entries[0].forward, [{ op: "setRaw", uid: "cell00001", raw: "Committed" }]);
  assert.equal(model.getRaw(0, 0), "Committed");
  assert.equal(session.dirtyCells.size, 0, "the patched base makes the dirty-cell diff empty, so no duplicate write is queued");

  session.beginNativeOverlayEdit("cell00002");
  session.endNativeOverlayEdit("cell00002", { beforeRaw: "Beta", afterRaw: "Beta", commit: true });
  assert.equal(history.entries.length, 1, "a commit that changed nothing is not an undo entry");
  session.beginNativeOverlayEdit("cell00002");
  session.endNativeOverlayEdit("cell00002", { beforeRaw: "Beta", afterRaw: "Escaped", commit: false });
  assert.equal(history.entries.length, 1, "a cancelled edit is not an undo entry");
  assert.equal(model.getRaw(0, 1), "Beta");
  assert.equal(session.nativeOverlayUids.size, 0);
});

test("the split-remainder repair plan recognises exactly the damage pinned fact 6 describes", () => {
  const base = rawTree();
  const split = rawTree();
  split.children[1].string = "A";
  split.children[1].children.push({ uid: "strayblok", string: "lpha", order: 1, children: [] });
  assert.deepEqual(nativeOverlayStrayRepair(base, split, "row000002"), { cellUid: "row000002", strays: [{ uid: "strayblok", text: "lpha" }] });

  const empty = rawTree();
  empty.children[1].children.push({ uid: "strayblok", string: "", order: 1, children: [] });
  assert.deepEqual(nativeOverlayStrayRepair(base, empty, "row000002"), { cellUid: "row000002", strays: [{ uid: "strayblok", text: "" }] });

  const twoStrays = rawTree();
  twoStrays.children[1].children.push({ uid: "strayblok", string: "lpha", order: 1, children: [] });
  twoStrays.children[1].children.push({ uid: "strayblo2", string: "more", order: 2, children: [] });
  assert.deepEqual(nativeOverlayStrayRepair(base, twoStrays, "row000002"), {
    cellUid: "row000002",
    strays: [{ uid: "strayblok", text: "lpha" }, { uid: "strayblo2", text: "more" }],
  }, "every childless stray merges back in document order — the signature watch sees none of them");

  const wrongCell = rawTree();
  wrongCell.children[0].children.push({ uid: "strayblok", string: "lpha", order: 1, children: [] });
  assert.equal(nativeOverlayStrayRepair(base, wrongCell, "row000002"), null);
  assert.equal(nativeOverlayStrayRepair(base, rawTree(), "row000002"), null, "an intact table needs no repair");
  assert.equal(nativeOverlayStrayRepair(null, split, "row000002"), null, "with no verified base there is nothing to diff against");
});

/* --------------------------------------------------------------------------------------------
 * FIX-2 — a dirty native cell whose debounce has not fired must survive a Depot disable/reload.
 * `dispose` alone clears `dirtyCells` without flushing; the unload path now calls the async
 * `flushBeforeUnload` first, which awaits any in-flight save and runs one final content flush.
 * ------------------------------------------------------------------------------------------ */
function flushBeforeUnloadHarness({ saveContentImpl } = {}) {
  const tableUid = "table0001";
  const model = new GridModel({ tableUid, columnIds: ["col0", "col1"], rows: [[{ uid: "cell00001", raw: "Alpha" }, { uid: "cell00002", raw: "Beta" }]] });
  model.baseSnapshot = model.snapshot();
  const history = new UndoHistory();
  model.history = history;
  const base = new Map([["cell00001", "Alpha"], ["cell00002", "Beta"]]);
  const saveCalls = [];
  const adapter = {
    model,
    getBaseRaw: (uid) => base.get(uid) ?? null,
    acceptExternalTree() {},
    load: () => model,
    async saveContent(batch) { saveCalls.push([...batch.keys()]); return (saveContentImpl || (async (b) => ({ saved: [...b.values()], skipped: [] })))(batch); },
  };
  const session = Object.assign(Object.create(NativeGridSession.prototype), {
    tableUid, model, history, views: new Set(), nativeOverlayUids: new Set(), adapter,
    dirtyCells: new Map(), editRevisions: new Map(), metadataDirty: false, structuralPending: false,
    contentSavePromise: null, disposed: false, changeVersion: 1, savedVersion: 0, saveTimer: null,
    referenceCounts: new Map(), referenceCountFrame: null, referenceCountTimer: null,
    commentThreads: new Map(), commentPageUid: null, discardedEdits: null,
    renderStructural() {}, refreshValues() {}, scheduleReferenceCountRefresh() {}, setSaving() {},
  });
  return { model, session, saveCalls };
}

test("dispose alone never flushes — the dirty value would be lost on reload without flushBeforeUnload (FIX-2)", () => {
  const { session, saveCalls } = flushBeforeUnloadHarness();
  session.dirtyCells.set("cell00001", { uid: "cell00001", baseRaw: "Alpha", raw: "Typed", revision: 1 });
  session.dispose();
  assert.equal(session.disposed, true);
  assert.equal(saveCalls.length, 0, "dispose on its own drops a dirty cell — the reload would lose the last ~220ms of typing");
  assert.equal(session.dirtyCells.size, 0, "dispose clears the dirty queue without flushing");
});

test("flushBeforeUnload flushes still-dirty cells before dispose (FIX-2)", async () => {
  const { session, model, saveCalls } = flushBeforeUnloadHarness();
  // The model holds the typed value, so the flush settles the dirty entry instead of rescheduling.
  model.getCell(0, 0).raw = "Typed";
  session.dirtyCells.set("cell00001", { uid: "cell00001", baseRaw: "Alpha", raw: "Typed", revision: 1 });
  await session.flushBeforeUnload();
  assert.ok(saveCalls.length >= 1, "flushBeforeUnload ran a final content flush for the still-dirty cell");
  assert.equal(session.dirtyCells.size, 0, "the dirty cell was settled by the final flush, not silently dropped");
  assert.equal(session.disposed, false, "flush does not dispose — the unload path disposes after");
  session.dispose();
});

test("flushBeforeUnload awaits an in-flight save and survives its rejection without throwing (FIX-2)", async () => {
  const { session, saveCalls } = flushBeforeUnloadHarness();
  // An in-flight content save is mid-roundtrip; it settles BEFORE the unload's final flush runs.
  // A rejection there must not abort the unload — its own flush lane already recorded any discard.
  let settleInflight;
  session.contentSavePromise = new Promise((_, reject) => { settleInflight = reject; });
  const flush = session.flushBeforeUnload();
  settleInflight(new Error("in-flight save failed"));
  await flush;
  assert.equal(session.disposed, false, "an in-flight rejection must not abort the unload flush path");
  // No dirty cell remained, so the final flush is a no-op; the in-flight promise was merely awaited.
  assert.equal(saveCalls.length, 0, "nothing dirty remained to re-flush after the in-flight save settled");
  session.contentSavePromise = null;
  session.dispose();
});
