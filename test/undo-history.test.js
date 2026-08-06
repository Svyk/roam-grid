import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel,
  NativeGridSession,
  NativeTableAdapter,
  UndoHistory,
  clearUndoHistories,
  externalContentUndoEntry,
  gridShapeSignature,
  releaseUndoHistory,
  undoHistories,
  undoHistoryFor,
} from "../src/extension.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

function grid(rows = 3, cols = 3, options = {}) {
  return new GridModel({
    rows: Array.from({ length: rows }, (_row, row) => Array.from({ length: cols }, (_col, col) => ({ uid: `c${row}${col}`, raw: `${row}:${col}` }))),
    columnIds: Array.from({ length: cols }, (_col, col) => `col${col}`),
    ...options,
  });
}

function corruptUndoOp(op) {
  switch (op.op) {
    case "setRaw": return { ...op, raw: `${op.raw}__control__` };
    case "setAlignment": return { ...op, alignment: op.alignment === "center" ? "right" : "center" };
    case "setRowHeight": return { ...op, height: (op.height ?? 0) + 13 };
    case "setWidth": return { ...op, width: (op.width ?? 0) + 13 };
    case "insertRowAt": return { ...op, cells: op.cells.map((cell, index) => (index === 0 ? { ...cell, raw: `${cell.raw}__control__` } : cell)) };
    case "insertColAt": return { ...op, cells: op.cells.map((cell, index) => (index === 0 ? { ...cell, raw: `${cell.raw}__control__` } : cell)) };
    case "removeRowByUid": return { ...op, rowUid: "__control__" };
    case "removeColById": return { ...op, columnId: "__control__" };
    case "orderRows": return { ...op, rowUids: [...op.rowUids].reverse() };
    case "orderCols": return { ...op, columnIds: [...op.columnIds].reverse() };
    case "setMerges": return { ...op, merges: op.merges.length ? [] : [{ id: "ctl", row: 0, col: 0, rowSpan: 2, colSpan: 1 }] };
    case "setHeaderRows": return { ...op, rowUids: op.rowUids.length ? [] : ["c00"] };
    case "setHeaderCols": return { ...op, columnIds: op.columnIds.length ? [] : ["col0"] };
    case "setCharts": return { ...op, charts: op.charts.length ? [] : [{ id: "ctl", type: "line", range: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, title: "ctl" }] };
    case "setFlags": return { ...op, flags: Object.fromEntries(Object.entries(op.flags).map(([key, value]) => [key, typeof value === "boolean" ? !value : (Number(value) || 0) + 7])) };
    default: return op;
  }
}

const scenarios = [
  { name: "setRaw", ops: ["setRaw"], run: (model) => model.setRaw(1, 1, "edited") },
  { name: "insertRows", ops: ["removeRowByUid", "insertRowAt"], run: (model) => model.insertRows(1, 2) },
  { name: "deleteRows", ops: ["insertRowAt", "removeRowByUid"], run: (model) => model.deleteRows(1, 1) },
  { name: "insertCols", ops: ["removeColById", "insertColAt"], run: (model) => model.insertCols(1, 2) },
  { name: "deleteCols", ops: ["insertColAt", "removeColById"], run: (model) => model.deleteCols(1, 1) },
  { name: "reorderRows", ops: ["orderRows"], run: (model) => model.reorderRows(0, 2) },
  { name: "reorderCols", ops: ["orderCols"], run: (model) => model.reorderCols(2, 0) },
  { name: "sortBy", ops: ["orderRows"], run: (model) => model.sortBy(0, "desc", 0) },
  { name: "setRowHeight", ops: ["setRowHeight"], run: (model) => model.setRowHeight(1, 71) },
  { name: "setAlignment", ops: ["setAlignment"], run: (model) => model.setAlignment(2, 2, "center") },
  { name: "setWidth", ops: ["setWidth"], run: (model) => { model.widths[model.columnIds[1]] = 210; } },
  { name: "setMerges", ops: ["setMerges"], run: (model) => { model.setRaw(0, 1, ""); model.setRaw(1, 0, ""); model.setRaw(1, 1, ""); model.merge({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }); } },
  { name: "setHeaderRows", ops: ["setHeaderRows"], run: (model) => model.toggleHeaderRow(2) },
  { name: "setHeaderCols", ops: ["setHeaderCols"], run: (model) => model.toggleHeaderColumn(1) },
  { name: "setFlags", ops: ["setFlags"], run: (model) => { model.showHeaders = false; model.frozenCols = 2; } },
  { name: "setCharts", ops: ["setCharts"], run: (model) => model.charts.push({ id: "chart-1", type: "line", range: { startRow: 0, endRow: 2, startCol: 0, endCol: 1 }, title: "chart" }) },
  { name: "moveRange", ops: ["setRaw"], run: (model) => model.moveRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 }, 2, 0) },
];

test("every recorded op type round-trips inverse then forward exactly", () => {
  const observed = new Set();
  for (const scenario of scenarios) {
    const model = grid();
    const before = clone(model.snapshot());
    model.transact(scenario.name, () => scenario.run(model));
    const after = clone(model.snapshot());
    const entry = model.history.entries.at(-1);
    assert.ok(entry, `${scenario.name} recorded an entry`);
    assert.notDeepEqual(after, before, `${scenario.name} actually changed the model`);
    for (const op of [...entry.inverse, ...entry.forward]) observed.add(op.op);
    for (const name of scenario.ops) {
      assert.ok([...entry.inverse, ...entry.forward].some((op) => op.op === name), `${scenario.name} produced a ${name} op`);
    }

    model.transactSilently(() => model.history.applyInverse(model, entry));
    assert.deepEqual(clone(model.snapshot()), before, `${scenario.name} inverse restores the pre-transaction model`);
    model.transactSilently(() => model.history.applyForward(model, entry));
    assert.deepEqual(clone(model.snapshot()), after, `${scenario.name} forward restores the post-transaction model`);

    // Positive control 1 (non-vacuity): an entry with no inverse ops must fail the same assertion.
    const empty = new GridModel(clone(after));
    assert.throws(() => {
      new UndoHistory().applyInverse(empty, { ...entry, inverse: [], checkpoint: null });
      assert.deepEqual(clone(empty.snapshot()), before);
    }, `${scenario.name} round-trip assertion is not vacuous`);

    // Positive control 2 (discrimination): corrupting the last-applied inverse op must fail it.
    const control = new GridModel(clone(after));
    const corrupted = { ...entry, checkpoint: null, inverse: [...entry.inverse.slice(0, -1), corruptUndoOp(entry.inverse.at(-1))] };
    assert.throws(() => {
      new UndoHistory().applyInverse(control, corrupted);
      assert.deepEqual(clone(control.snapshot()), before);
    }, `${scenario.name} round-trip assertion catches a corrupted inverse op`);
  }

  assert.deepEqual([...observed].sort(), [
    "insertColAt", "insertRowAt", "orderCols", "orderRows", "removeColById", "removeRowByUid",
    "setAlignment", "setCharts", "setFlags", "setHeaderCols", "setHeaderRows", "setMerges", "setRaw", "setRowHeight", "setWidth",
  ]);
});

test("a no-op transaction neither pushes an undo entry nor clears redo", () => {
  const model = grid(2, 2);
  model.transact("edit", () => model.setRaw(0, 0, "changed"));
  assert.equal(model.undoStack.length, 1);
  assert.equal(model.undo(), true);
  assert.equal(model.getRaw(0, 0), "0:0");
  assert.equal(model.undoStack.length, 0);
  assert.equal(model.redoStack.length, 1);

  model.transact("no-op write", () => model.setRaw(0, 0, "0:0"));
  model.transact("no-op reorder", () => model.reorderRows(1, 1));
  model.transact("no-op width", () => { model.widths[model.columnIds[0]] = model.widths[model.columnIds[0]]; });
  assert.equal(model.undoStack.length, 0, "no-op transactions push nothing");
  assert.equal(model.redoStack.length, 1, "no-op transactions leave redo intact");

  assert.equal(model.redo(), true);
  assert.equal(model.getRaw(0, 0), "changed");
  assert.equal(model.undoStack.length, 1);

  model.transact("real edit", () => model.setRaw(0, 1, "next"));
  assert.equal(model.redoStack.length, 0, "a real transaction still clears redo");
});

test("a history survives model replacement and keeps addressing cells by uid", () => {
  const registry = new Map();
  const history = undoHistoryFor("table-live", registry);
  const first = new GridModel({ rows: [[{ uid: "a1", raw: "a" }, { uid: "b1", raw: "b" }]], tableUid: "table-live", history });
  first.transact("edit", () => first.setRaw(0, 0, "changed"));

  const replacement = new GridModel({ ...clone(first.snapshot()), tableUid: "table-live", history });
  assert.equal(replacement.undoStack.length, 1, "the replacement model inherits the durable stack");
  assert.equal(replacement.undo(), true);
  assert.equal(replacement.getRaw(0, 0), "a");
  assert.equal(replacement.redo(), true);
  assert.equal(replacement.getRaw(0, 0), "changed");
});

test("remapUids rewrites inverse, forward, touched and checkpoint without invalidating redo", () => {
  const model = grid(2, 2);
  model.transact("hard edit", () => model.setRaw(0, 0, "changed"), { hard: true });
  model.transact("second edit", () => model.setRaw(1, 1, "other"));
  assert.equal(model.undo(), true);
  assert.equal(model.redoStack.length, 1);

  const entry = model.history.entries.at(-1);
  assert.ok(entry.checkpoint, "a hard transaction carries a checkpoint");
  const shapeBefore = entry.shapeSignature;
  const uidMap = new Map([["c00", "roam000001"]]);
  model.history.remapUids(uidMap);

  assert.ok(entry.inverse.some((op) => op.uid === "roam000001"), "inverse remapped");
  assert.ok(entry.forward.some((op) => op.uid === "roam000001"), "forward remapped");
  assert.ok(entry.touched.includes("roam000001"), "touched remapped");
  assert.ok(entry.checkpoint.rows.flat().some((cell) => cell.uid === "roam000001"), "checkpoint remapped");
  assert.notEqual(entry.shapeSignature, shapeBefore, "shape signature remapped");
  assert.equal(model.redoStack.length, 1, "remapping does not invalidate redo");

  // The remapped entry still applies against a model whose uids were rewritten the same way.
  for (const row of model.rows) for (const cell of row) if (uidMap.has(cell.uid)) cell.uid = uidMap.get(cell.uid);
  assert.equal(model.undo(), true);
  assert.equal(model.getRaw(0, 0), "0:0");

  // Positive control: a partial remap that only rewrites `inverse` must fail the four-field assertion.
  const partialModel = grid(2, 2);
  partialModel.transact("hard edit", () => partialModel.setRaw(0, 0, "changed"), { hard: true });
  const partial = partialModel.history.entries.at(-1);
  partial.inverse = partial.inverse.map((op) => (op.op === "setRaw" && op.uid === "c00" ? { ...op, uid: "roam000001" } : op));
  assert.throws(() => {
    assert.ok(partial.inverse.some((op) => op.uid === "roam000001"));
    assert.ok(partial.forward.some((op) => op.uid === "roam000001"));
    assert.ok(partial.touched.includes("roam000001"));
    assert.ok(partial.checkpoint.rows.flat().some((cell) => cell.uid === "roam000001"));
  }, "the remap assertion catches a remap that only rewrote inverse");
});

test("onExternalContent marks stale uids and drops that setRaw when the entry is applied", () => {
  const model = grid(2, 2);
  model.transact("edit", () => { model.setRaw(0, 0, "local"); model.setRaw(1, 1, "also-local"); });
  const entry = model.history.entries.at(-1);

  const result = model.history.onExternalContent([{ uid: "c00", raw: "remote" }]);
  assert.equal(result.marked, 1);
  assert.ok(entry.stale.has("c00"));
  assert.ok(!entry.stale.has("c11"));

  model.rows[0][0].raw = "remote";
  const applied = model.history.applyInverse(model, entry);
  assert.deepEqual(applied.dropped, ["c00"], "the caller is told which setRaw was dropped");
  assert.equal(model.getRaw(0, 0), "remote", "the external value wins");
  assert.equal(model.getRaw(1, 1), "1:1", "untouched cells still revert");

  // Positive control: without the stale mark the same apply clobbers the external value.
  const control = grid(2, 2);
  control.transact("edit", () => { control.setRaw(0, 0, "local"); control.setRaw(1, 1, "also-local"); });
  const controlEntry = control.history.entries.at(-1);
  control.rows[0][0].raw = "remote";
  assert.throws(() => {
    const clobbered = control.history.applyInverse(control, controlEntry);
    assert.deepEqual(clobbered.dropped, ["c00"]);
    assert.equal(control.getRaw(0, 0), "remote");
  }, "the stale-drop assertion catches an entry whose stale set was not marked");
  assert.equal(control.getRaw(0, 0), "0:0", "the unmarked entry did overwrite the external value");
});

test("a checkpoint entry keeps an externally edited cell instead of clobbering it", () => {
  const model = grid(2, 2);
  model.transact("hard edit", () => { model.setRaw(0, 0, "local"); model.setRaw(1, 1, "also-local"); }, { hard: true });
  const entry = model.history.entries.at(-1);
  assert.ok(entry.checkpoint, "the hard transaction carries a checkpoint");
  assert.ok(entry.forwardCheckpoint, "and a forward checkpoint");

  assert.equal(model.history.onExternalContent([{ uid: "c00", raw: "remote" }]).marked, 1);
  model.rows[0][0].raw = "remote";

  const applied = model.history.applyInverse(model, entry);
  assert.deepEqual(applied.dropped, ["c00"], "the checkpoint path reports the kept uid like the op path does");
  assert.equal(model.getRaw(0, 0), "remote", "the external value survives the checkpoint restore");
  assert.equal(model.getRaw(1, 1), "1:1", "every other cell still reverts through the checkpoint");

  const redone = model.history.applyForward(model, entry);
  assert.deepEqual(redone.dropped, ["c00"], "the forward checkpoint honours stale identically");
  assert.equal(model.getRaw(0, 0), "remote", "redo never overwrites the external value either");
  assert.equal(model.getRaw(1, 1), "also-local");

  // Positive control: with the stale mark removed the checkpoint clobbers the external value.
  const control = grid(2, 2);
  control.transact("hard edit", () => { control.setRaw(0, 0, "local"); control.setRaw(1, 1, "also-local"); }, { hard: true });
  const controlEntry = control.history.entries.at(-1);
  control.rows[0][0].raw = "remote";
  assert.throws(() => {
    const clobbered = control.history.applyInverse(control, controlEntry);
    assert.deepEqual(clobbered.dropped, ["c00"]);
    assert.equal(control.getRaw(0, 0), "remote");
  }, "the checkpoint stale assertion catches an entry whose stale set was not marked");
  assert.equal(control.getRaw(0, 0), "0:0", "the unmarked checkpoint did overwrite the external value");
});

test("onExternalContent only invalidates redo when it touches a redo entry", () => {
  const model = grid(2, 2);
  model.transact("edit", () => model.setRaw(0, 0, "local"));
  assert.equal(model.undo(), true);
  assert.equal(model.redoStack.length, 1);

  assert.equal(model.history.onExternalContent([{ uid: "c11", raw: "remote" }]).redoInvalidated, false);
  assert.equal(model.redoStack.length, 1, "an unrelated external edit keeps redo");

  assert.equal(model.history.onExternalContent([{ uid: "c00", raw: "remote" }]).redoInvalidated, true);
  assert.equal(model.redoStack.length, 0, "an external edit to a redo entry's touched uid clears redo");
});

test("onExternalStructural truncates at the first mismatched shape rather than clearing", () => {
  const model = grid(3, 2);
  model.transact("content", () => model.setRaw(0, 0, "one"));
  model.transact("insert", () => model.insertRows(1, 1));
  model.transact("content again", () => model.setRaw(0, 1, "two"));
  assert.equal(model.undoStack.length, 3);

  const external = new GridModel(clone(model.snapshot()));
  assert.equal(gridShapeSignature(external), gridShapeSignature(model));
  const result = model.history.onExternalStructural(external);

  assert.equal(result.dropped, 1, "only the entry recorded under the older shape is dropped");
  assert.equal(model.undoStack.length, 2, "matching entries survive");
  assert.equal(model.undoStack[0].label, "insert");
  assert.equal(model.undo(), true);
  assert.equal(model.getRaw(0, 1), "0:1");
});

test("onExternalStructural keeps a matched echo intact and leaves redo alone", () => {
  const model = grid(2, 2);
  model.transact("edit", () => model.setRaw(0, 0, "local"));
  assert.equal(model.undo(), true);
  const echo = new GridModel(clone(model.snapshot()));
  const result = model.history.onExternalStructural(echo);
  assert.equal(result.dropped, 0);
  assert.equal(result.redoInvalidated, false);
  assert.equal(model.redoStack.length, 1);
});

test("invalidateRedo reports how many entries it dropped", () => {
  const history = new UndoHistory();
  assert.equal(history.invalidateRedo("save-error"), 0);
  history.pushRedo({ id: "a", inverse: [], forward: [], touched: [], stale: new Set(), shapeSignature: "" });
  assert.equal(history.invalidateRedo("save-error"), 1);
  assert.equal(history.lastInvalidation, "save-error");
  assert.equal(history.canRedo, false);
});

test("checkpoint eviction truncates the stack below the evicted checkpoint", () => {
  const history = new UndoHistory({ checkpointLimit: 2 });
  const entry = (label, checkpoint) => ({ id: label, label, inverse: [{ op: "setRaw", uid: "c00", raw: label }], forward: [], touched: [], stale: new Set(), shapeSignature: "", checkpoint });
  history.push(entry("a", { rows: [] }));
  history.push(entry("b", null));
  history.push(entry("c", { rows: [] }));
  history.push(entry("d", null));
  assert.deepEqual(history.entries.map((item) => item.label), ["a", "b", "c", "d"]);

  history.push(entry("e", { rows: [] }));
  assert.deepEqual(history.entries.map((item) => item.label), ["b", "c", "d", "e"], "the oldest checkpoint and everything below it are gone");
  assert.equal(history.entries.filter((item) => item.checkpoint).length, 2);
});

test("the entry limit trims the oldest entries", () => {
  const history = new UndoHistory({ limit: 3 });
  for (const label of ["a", "b", "c", "d", "e"]) {
    history.push({ id: label, label, inverse: [{ op: "setRaw", uid: "c00", raw: label }], forward: [], touched: [], stale: new Set(), shapeSignature: "", checkpoint: null });
  }
  assert.deepEqual(history.entries.map((item) => item.label), ["c", "d", "e"]);
});

test("the module registry caps histories at 24 and evicts the least recently used", () => {
  const registry = new Map();
  const uids = Array.from({ length: 24 }, (_value, index) => `table-${index}`);
  for (const uid of uids) undoHistoryFor(uid, registry);
  assert.equal(registry.size, 24);

  const first = undoHistoryFor("table-0", registry);
  assert.equal(registry.size, 24, "reading an existing history does not create a new one");
  assert.strictEqual(undoHistoryFor("table-0", registry), first, "the same uid resolves to the same history");

  undoHistoryFor("table-24", registry);
  assert.equal(registry.size, 24, "the cap holds");
  assert.ok(registry.has("table-0"), "the freshly touched history survives");
  assert.ok(!registry.has("table-1"), "the least recently used history is evicted");

  assert.equal(releaseUndoHistory("table-0", registry), true);
  assert.ok(!registry.has("table-0"));
  clearUndoHistories(registry);
  assert.equal(registry.size, 0);
});

test("the shared runtime registry is a module-level map that undoHistoryFor defaults to", () => {
  clearUndoHistories();
  const history = undoHistoryFor("shared-table");
  assert.strictEqual(undoHistories.get("shared-table"), history);
  assert.equal(undoHistoryFor(null), null);
  clearUndoHistories();
  assert.equal(undoHistories.size, 0);
});

test("transactSilently reports changed coordinates and structural intent without recording", () => {
  const model = grid(2, 2);
  const content = model.transactSilently(() => model.setRaw(0, 1, "quiet"));
  assert.deepEqual(content.changedCoordinates, [[0, 1]]);
  assert.deepEqual(content.changedUids, ["c01"]);
  assert.equal(content.structural, false);
  assert.equal(model.undoStack.length, 0, "a silent transaction records nothing");

  const structural = model.transactSilently(() => model.insertRows(0, 1));
  assert.equal(structural.structural, true);
  assert.equal(model.undoStack.length, 0);
});

test("entry lane and metadata separate a content edit from a layout change", () => {
  const model = grid(2, 2);
  model.transact("edit", () => model.setRaw(0, 0, "value"));
  const content = model.history.entries.at(-1);
  assert.equal(content.lane, "content");
  assert.equal(content.metadata, false);
  assert.deepEqual(content.touched, ["c00"]);

  model.transact("resize", () => { model.widths[model.columnIds[0]] = 200; });
  const layout = model.history.entries.at(-1);
  assert.equal(layout.lane, "structural");
  assert.equal(layout.metadata, true);
});

// ---------------------------------------------------------------------------
// GOAL-2A: the history wired into NativeGridSession.
// ---------------------------------------------------------------------------

function sessionHarness({ rows = null, tableUid = "table-undo", base = new Map([["c00", "0:0"], ["c01", "0:1"]]) } = {}) {
  const model = new GridModel({ rows: rows || [[{ uid: "c00", raw: "0:0" }, { uid: "c01", raw: "0:1" }]], columnIds: ["col0", "col1"], tableUid });
  const history = new UndoHistory();
  model.history = history;
  const flushed = [];
  const session = Object.assign(Object.create(NativeGridSession.prototype), {
    tableUid, model, history, views: new Set(),
    adapter: {
      model,
      getBaseRaw: (uid) => (base && base.has(uid) ? base.get(uid) : null),
      saveContent: async (batch) => { flushed.push([...batch.values()]); return { saved: [...batch.values()], skipped: [] }; },
      load: () => model,
      acceptExternalTree() {},
    },
    dirtyCells: new Map(), editRevisions: new Map(),
    metadataDirty: false, structuralPending: false, contentSavePromise: null, disposed: false,
    changeVersion: 0, savedVersion: 0, saveTimer: null, renders: 0, refreshes: 0,
    renderStructural() { this.renders += 1; },
    refreshValues() { this.refreshes += 1; },
    scheduleReferenceCountRefresh() {},
    setSaving() {},
  });
  return { model, history, session, flushed };
}

function captureTimeouts(t) {
  const delays = []; const real = globalThis.setTimeout;
  globalThis.setTimeout = (fn, delay, ...rest) => { delays.push(delay); return real(fn, delay, ...rest); };
  t.after(() => { globalThis.setTimeout = real; });
  return delays;
}

test("a content undo restores the cell, takes the 220 ms lane, and never sets metadataDirty", (t) => {
  const delays = captureTimeouts(t);
  const { model, session } = sessionHarness({ base: new Map([["c00", "edited"]]) });
  model.transact("edit", () => model.setRaw(0, 0, "edited"));
  session.queueChangedCells();
  assert.equal(session.dirtyCells.size, 0, "the edit already matches its saved base");

  delays.length = 0;
  assert.equal(session.undo(), true);
  clearTimeout(session.saveTimer);

  assert.equal(model.getRaw(0, 0), "0:0", "the cell is restored");
  assert.equal(session.refreshes, 1, "a content undo refreshes values");
  assert.equal(session.renders, 0, "a content undo never does a structural render");
  assert.equal(session.metadataDirty, false, "a content undo does not dirty the layout metadata");
  assert.deepEqual(delays, [220], "a content undo schedules the 220 ms content lane, not the 0 ms structural lane");

  // Positive control: the pre-2A `markChanged(true)` undo fails both assertions.
  const controlDelays = []; const real = globalThis.setTimeout;
  const control = sessionHarness({ tableUid: "table-control", base: new Map([["c00", "edited"]]) });
  control.model.transact("edit", () => control.model.setRaw(0, 0, "edited"));
  const controlEntry = control.history.popUndo();
  control.model.transactSilently(() => control.history.applyInverse(control.model, controlEntry));
  globalThis.setTimeout = (fn, delay, ...rest) => { controlDelays.push(delay); return real(fn, delay, ...rest); };
  control.session.metadataDirty ||= true;
  control.session.markChanged(true);
  globalThis.setTimeout = real;
  clearTimeout(control.session.saveTimer);
  assert.throws(() => {
    assert.equal(control.session.metadataDirty, false);
    assert.deepEqual(controlDelays, [220]);
  }, "the content-lane assertions catch an undo that takes the structural lane");
});

test("a structural undo renders, prunes, and takes the 0 ms structural lane", (t) => {
  const delays = captureTimeouts(t);
  const { model, session } = sessionHarness();
  model.transact("insert", () => model.insertRows(1, 1));
  delays.length = 0;
  assert.equal(session.undo(), true);
  clearTimeout(session.saveTimer);

  assert.equal(model.rowCount, 1);
  assert.equal(session.renders, 1); assert.equal(session.refreshes, 0);
  assert.equal(session.metadataDirty, true, "a layout inverse carries metadata");
  assert.deepEqual(delays, [0], "a structural undo flushes immediately");
});

test("edit, undo, then edit another cell never resurrects the undone value", async () => {
  const { model, session, flushed } = sessionHarness();
  model.transact("poison", () => model.setRaw(0, 0, "poison"));
  session.queueChangedCells();
  assert.deepEqual([...session.dirtyCells.keys()], ["c00"], "the edit is pending");

  assert.equal(session.undo(), true);
  clearTimeout(session.saveTimer);
  assert.equal(session.dirtyCells.size, 0, "the undo removed the poisoned dirty entry");

  model.transact("next cell", () => model.setRaw(0, 1, "next"));
  session.queueChangedCells();
  session.markChanged(false);
  clearTimeout(session.saveTimer);
  await NativeGridSession.prototype.flushContentSave.call(session);

  assert.deepEqual(flushed.map((batch) => batch.map((change) => change.uid)), [["c01"]]);
  assert.ok(!JSON.stringify(flushed).includes("poison"), "the flushed batch never carries the undone value");

  // Positive control: the pre-2A undo (no re-queue after the inverse) flushes the undone value.
  const controlFlushed = [];
  const control = sessionHarness({ tableUid: "table-control-2" });
  control.session.adapter.saveContent = async (batch) => { controlFlushed.push([...batch.values()]); return { saved: [...batch.values()], skipped: [] }; };
  control.model.transact("poison", () => control.model.setRaw(0, 0, "poison"));
  control.session.queueChangedCells();
  const controlEntry = control.history.popUndo();
  control.model.transactSilently(() => control.history.applyInverse(control.model, controlEntry));
  control.model.transact("next cell", () => control.model.setRaw(0, 1, "next"));
  control.session.queueChangedCells();
  await NativeGridSession.prototype.flushContentSave.call(control.session);
  clearTimeout(control.session.saveTimer);
  assert.throws(() => {
    assert.ok(!JSON.stringify(controlFlushed).includes("poison"));
  }, "the resurrection assertion catches an undo that leaves the poisoned dirty entry behind");
  assert.ok(JSON.stringify(controlFlushed).includes("poison"), "the unqueued undo really did re-flush the undone value");
});

test("undo survives a self-echo that missed the fingerprint and reached handleExternalChange", () => {
  const { model, session } = sessionHarness();
  model.transact("edit", () => model.setRaw(0, 0, "mine"));
  const external = new GridModel({ rows: [[{ uid: "c00", raw: "mine" }, { uid: "c01", raw: "0:1" }]] });

  session.handleExternalChange(external, { type: "content", structural: false, tree: {}, changes: [{ uid: "c00", raw: "mine" }] });

  assert.equal(session.history.entries.length, 1, "the echo records no entry of its own");
  assert.equal(session.history.entries[0].stale.size, 0, "the echo does not mark the local entry stale");
  assert.equal(session.refreshes, 0, "an echo that changes nothing repaints nothing");
  assert.equal(session.undo(), true);
  clearTimeout(session.saveTimer);
  assert.equal(model.getRaw(0, 0), "0:0", "the undo still restores the pre-edit value");
});

test("undo after an external non-conflicting change keeps the external value and clears redo", () => {
  const { model, session, history } = sessionHarness();
  model.transact("edit", () => { model.setRaw(0, 0, "local-a"); model.setRaw(0, 1, "local-b"); });
  model.transact("second", () => model.setRaw(0, 0, "local-a2"));
  assert.equal(session.undo(), true);
  clearTimeout(session.saveTimer);
  assert.equal(history.redoEntries.length, 1);
  session.dirtyCells.clear(); // the local edits are already persisted, so the external edit is non-conflicting

  const external = new GridModel({ rows: [[{ uid: "c00", raw: "remote" }, { uid: "c01", raw: "local-b" }]], columnIds: ["col0", "col1"] });
  session.handleExternalChange(external, { type: "content", structural: false, tree: {}, changes: [{ uid: "c00", raw: "remote" }] });

  assert.equal(model.getRaw(0, 0), "remote");
  assert.equal(history.redoEntries.length, 0, "the external edit hit a redo entry's uid and cleared redo");
  assert.equal(history.entries.length, 1, "a rebasable uid records no separate external entry");

  assert.equal(session.undo(), true);
  clearTimeout(session.saveTimer);
  assert.equal(model.getRaw(0, 0), "remote", "the external value survives the undo");
  assert.equal(model.getRaw(0, 1), "0:1", "every other cell in the entry still reverts");
});

test("an external change to a cell the history does not own becomes its own undoable entry", () => {
  const { model, session, history } = sessionHarness();
  const external = new GridModel({ rows: [[{ uid: "c00", raw: "remote" }, { uid: "c01", raw: "0:1" }]] });
  session.handleExternalChange(external, { type: "content", structural: false, tree: {}, changes: [{ uid: "c00", raw: "remote" }] });

  assert.equal(history.entries.length, 1, "the external edit is recorded rather than invisible");
  assert.equal(history.entries[0].lane, "content");
  assert.equal(history.entries[0].metadata, false);
  assert.equal(session.undo(), true);
  clearTimeout(session.saveTimer);
  assert.equal(model.getRaw(0, 0), "0:0", "undo reverts the external edit");
  assert.equal(session.redo(), true);
  clearTimeout(session.saveTimer);
  assert.equal(model.getRaw(0, 0), "remote");
});

test("externalContentUndoEntry drops no-op changes and derives a content-lane entry", () => {
  const model = grid(2, 2);
  assert.equal(externalContentUndoEntry(model, [{ uid: "c00", from: "same", to: "same" }]), null);
  const entry = externalContentUndoEntry(model, [{ uid: "c00", from: "was", to: "now" }, { uid: "c11", from: "x", to: "x" }]);
  assert.deepEqual(entry.inverse, [{ op: "setRaw", uid: "c00", raw: "was" }]);
  assert.deepEqual(entry.forward, [{ op: "setRaw", uid: "c00", raw: "now" }]);
  assert.deepEqual(entry.touched, ["c00"]);
  assert.equal(entry.checkpoint, null); assert.equal(entry.metadata, false);
  assert.equal(entry.shapeSignature, gridShapeSignature(model));
});

test("an external structural change truncates the history instead of discarding it", () => {
  const { model, session, history } = sessionHarness();
  model.transact("edit", () => model.setRaw(0, 0, "local"));
  const external = new GridModel({ ...clone(model.snapshot()), tableUid: model.tableUid });

  session.handleExternalChange(external, { type: "structural", structural: true, tree: {}, changes: [] });

  assert.equal(history.entries.length, 1, "a matching shape keeps the entry");
  assert.strictEqual(session.model.history, history, "the replacement model inherits the durable history");
  assert.strictEqual(session.history, history);
});

test("a failed structural save preserves undo and clears only redo", async () => {
  const { model, session, history } = sessionHarness();
  model.transact("edit", () => model.setRaw(0, 0, "a"));
  model.transact("more", () => model.setRaw(0, 1, "b"));
  assert.equal(session.undo(), true);
  clearTimeout(session.saveTimer);
  assert.equal(history.redoEntries.length, 1);
  const undoDepth = history.entries.length;

  model.baseSnapshot = model.snapshot(); model.baseFingerprint = "base";
  session.adapter.save = async () => { throw new Error("structural save failed"); };
  session.structuralPending = true; session.changeVersion = 9; session.savedVersion = 0;
  await NativeGridSession.prototype.flushSave.call(session);
  clearTimeout(session.saveTimer);

  assert.equal(history.entries.length, undoDepth, "undo survives the failed save");
  assert.equal(history.redoEntries.length, 0, "redo is invalidated");
  assert.equal(history.lastInvalidation, "structural-save-error");
});

test("a failed content save invalidates redo without touching undo", async () => {
  const { model, session, history } = sessionHarness();
  model.transact("edit", () => model.setRaw(0, 0, "a"));
  model.transact("more", () => model.setRaw(0, 1, "b"));
  assert.equal(session.undo(), true);
  clearTimeout(session.saveTimer);
  const undoDepth = history.entries.length;

  session.adapter.saveContent = async () => { throw new Error("content save failed"); };
  session.dirtyCells.set("c00", { uid: "c00", baseRaw: "0:0", raw: "a", revision: 1 });
  await NativeGridSession.prototype.flushContentSave.call(session);
  clearTimeout(session.saveTimer);

  assert.equal(history.entries.length, undoDepth);
  assert.equal(history.redoEntries.length, 0);
  assert.equal(history.lastInvalidation, "content-save-error");
});

test("the history outlives session dispose and remount as the same object", () => {
  clearUndoHistories();
  const rows = () => [[{ uid: "c00", raw: "0:0" }]];
  const adapter = { model: null, load: () => new GridModel({ rows: rows(), tableUid: "table-remount" }), watchExternal: () => () => {}, dispose() {} };
  const first = new NativeGridSession("table-remount", { adapter });
  first.model.transact("edit", () => first.model.setRaw(0, 0, "kept"));
  assert.equal(first.history.entries.length, 1);

  first.dispose();
  assert.ok(undoHistories.has("table-remount"), "dispose does not release the history");

  const second = new NativeGridSession("table-remount", { adapter });
  assert.strictEqual(second.history, first.history, "the remounted session resumes the same history object");
  assert.equal(second.model.getRaw(0, 0), "0:0", "the remounted model is a fresh load");
  assert.equal(second.undo(), true);
  clearTimeout(second.saveTimer);
  assert.equal(second.history.redoEntries.length, 1, "the entry moved to redo across the remount");
  second.dispose();
  clearUndoHistories();
});

function installGraphApi(t) {
  const calls = { creates: [], updates: [], moves: [], deletes: [] };
  let sequence = 0;
  globalThis.window = {
    roamAlphaAPI: {
      util: { generateUID: () => `roam${String(sequence += 1).padStart(5, "0")}` },
      data: {
        block: {
          create: async ({ block }) => { calls.creates.push(block.uid); },
          update: async ({ block }) => { calls.updates.push(block.uid); },
          move: async ({ block }) => { calls.moves.push(block.uid); },
          delete: async ({ block }) => { calls.deletes.push(block.uid); },
        },
      },
    },
  };
  t.after(() => { delete globalThis.window; });
  return calls;
}

function treeFromModel(model) {
  return {
    uid: model.tableUid, string: "{{[[table]]}}", order: 0,
    children: model.rows.map((row, index) => {
      let node = null;
      for (let col = row.length - 1; col >= 0; col -= 1) {
        node = { uid: row[col].uid, string: row[col].raw === "" ? " " : row[col].raw, order: col ? 0 : index, children: node ? [node] : [] };
      }
      return node;
    }),
  };
}

function localGrid() {
  return new GridModel({
    rows: [[{ uid: "rg_a", raw: "a" }, { uid: "rg_b", raw: "b" }], [{ uid: "rg_c", raw: "c" }, { uid: "rg_d", raw: "d" }]],
    columnIds: ["col0", "col1"], tableUid: "table0001",
  });
}

function stubAdapter(model) {
  return Object.assign(Object.create(NativeTableAdapter.prototype), {
    tableUid: "table0001", model, metadataStore: { createStaging: async () => "staging01" }, getBaseRaw: () => null,
  });
}

test("undo after a uid remap addresses the new uids and stays on the sameShape save path", async (t) => {
  const calls = installGraphApi(t);
  const model = localGrid();
  const history = new UndoHistory(); model.history = history;
  model.transact("hard edit", () => model.setRaw(0, 0, "checkpointed"), { hard: true });
  assert.ok(history.entries.at(-1).checkpoint, "the checkpoint holds the pre-mint uids");

  const adapter = stubAdapter(model);
  await NativeTableAdapter.prototype.reconcile.call(adapter, model, { uid: "table0001", string: "{{[[table]]}}", order: 0, children: [] });
  assert.equal(calls.creates.length, 4, "the first save minted a Roam uid per cell");
  assert.ok(model.rows.flat().every((cell) => !cell.uid.startsWith("rg_")), "the model now carries Roam uids");
  assert.ok(history.entries.at(-1).checkpoint.rows.flat().every((cell) => !cell.uid.startsWith("rg_")), "the checkpoint was remapped with it");

  const graphTree = treeFromModel(model);
  const { session } = sessionHarness({ tableUid: "table0001" });
  session.model = model; session.history = history; session.adapter = adapter;
  model.transact("later edit", () => model.setRaw(1, 1, "later"));

  assert.equal(session.undo(), true); clearTimeout(session.saveTimer);
  assert.equal(session.undo(), true); clearTimeout(session.saveTimer);
  assert.equal(model.getRaw(0, 0), "a", "the checkpoint restored the pre-edit content");

  calls.creates.length = 0; calls.updates.length = 0;
  await NativeTableAdapter.prototype.persistModel.call(adapter, model, graphTree);
  assert.deepEqual(calls.creates, [], "zero createBlock calls: every cell block, and every inbound ((ref)) to it, survives");
  assert.ok(calls.updates.length > 0, "the sameShape path issued plain updates instead");

  // Positive control: without the remap the checkpoint restores the pre-mint uids and
  // persistModel falls through to reconcile, recreating every cell block.
  const controlCalls = calls;
  const controlModel = localGrid();
  const controlHistory = new UndoHistory(); controlModel.history = controlHistory;
  controlModel.transact("hard edit", () => controlModel.setRaw(0, 0, "checkpointed"), { hard: true });
  const controlAdapter = stubAdapter(controlModel);
  controlHistory.remapUids = () => 0;
  await NativeTableAdapter.prototype.reconcile.call(controlAdapter, controlModel, { uid: "table0001", string: "{{[[table]]}}", order: 0, children: [] });
  const controlTree = treeFromModel(controlModel);
  const controlEntry = controlHistory.popUndo();
  controlModel.transactSilently(() => controlHistory.applyInverse(controlModel, controlEntry));
  controlCalls.creates.length = 0;
  await NativeTableAdapter.prototype.persistModel.call(controlAdapter, controlModel, controlTree);
  assert.throws(() => {
    assert.deepEqual(controlCalls.creates, []);
  }, "the zero-createBlock assertion catches an unremapped checkpoint");
  assert.equal(controlCalls.creates.length, 4, "the unremapped undo really did recreate every cell block");
});

test("rebasableUids reports every uid the history can rebase in place", () => {
  const model = grid(2, 2);
  model.transact("edit", () => { model.setRaw(0, 0, "a"); model.setRaw(1, 1, "b"); });
  model.transact("resize", () => { model.widths[model.columnIds[0]] = 180; });
  assert.deepEqual([...model.history.rebasableUids()].sort(), ["c00", "c11"]);
  assert.deepEqual([...new UndoHistory().rebasableUids()], []);
});

test("undo after a same-cell conflict reload keeps the external value and reports it dropped", () => {
  const { model, session, history } = sessionHarness();
  model.transact("edit", () => { model.setRaw(0, 0, "local-a"); model.setRaw(0, 1, "local-b"); });
  session.queueChangedCells();
  clearTimeout(session.saveTimer);
  assert.ok(session.dirtyCells.has("c00"), "the conflicted cell is pending locally");
  const entry = history.entries.at(-1);

  // The graph kept our unsaved c01 edit out and took someone else's c00 value.
  const external = new GridModel({ rows: [[{ uid: "c00", raw: "remote" }, { uid: "c01", raw: "0:1" }]], columnIds: ["col0", "col1"] });
  session.handleExternalChange(external, { type: "content", structural: false, tree: {}, changes: [{ uid: "c00", raw: "remote" }] });

  assert.equal(session.dirtyCells.size, 0, "the conflict reload discarded the pending local edits");
  assert.strictEqual(session.model, external, "the conflict branch reloaded the model");
  assert.ok(entry.stale.has("c00"), "the conflicted uid is marked stale on the entry that writes it");

  const applyInverse = history.applyInverse.bind(history);
  let reported = null;
  history.applyInverse = (target, item) => { const result = applyInverse(target, item); reported = result.dropped; return result; };
  assert.equal(session.undo(), true);
  clearTimeout(session.saveTimer);
  history.applyInverse = applyInverse;

  assert.equal(session.model.getRaw(0, 0), "remote", "the undo keeps the value written elsewhere");
  assert.deepEqual(reported, ["c00"], "and reports it dropped like every other stale path");

  // Positive control: without the conflict-branch marking the same undo clobbers the
  // external value and reports nothing dropped.
  const control = sessionHarness({ tableUid: "table-control-conflict" });
  control.model.transact("edit", () => { control.model.setRaw(0, 0, "local-a"); control.model.setRaw(0, 1, "local-b"); });
  control.session.queueChangedCells();
  clearTimeout(control.session.saveTimer);
  const controlExternal = new GridModel({ rows: [[{ uid: "c00", raw: "remote" }, { uid: "c01", raw: "0:1" }]], columnIds: ["col0", "col1"] });
  control.session.dirtyCells.clear(); control.session.structuralPending = false;
  control.session.replaceModel(controlExternal, { render: false }); // the reload, minus the stale marking
  const controlApply = control.history.applyInverse.bind(control.history);
  let controlReported = null;
  control.history.applyInverse = (target, item) => { const result = controlApply(target, item); controlReported = result.dropped; return result; };
  assert.equal(control.session.undo(), true);
  clearTimeout(control.session.saveTimer);
  assert.throws(() => {
    assert.equal(control.session.model.getRaw(0, 0), "remote");
    assert.deepEqual(controlReported, ["c00"]);
  }, "the conflict-branch assertions catch a reload that skipped the stale marking");
  assert.equal(control.session.model.getRaw(0, 0), "0:0", "the unmarked reload really did clobber the external value");
  assert.deepEqual(controlReported, [], "and reported nothing dropped");
});
