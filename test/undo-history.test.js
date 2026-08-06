import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel,
  UndoHistory,
  clearUndoHistories,
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
