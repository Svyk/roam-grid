import test from "node:test";
import assert from "node:assert/strict";
import { AsyncFormulaEngine, FormulaEngine, GridModel, GridView } from "../src/extension.js";

const sorted = (values) => [...values].sort();

test("formula cache invalidates only a changed cell and its transitive dependents", () => {
  const model = new GridModel({ rows: [[1, "=A1*2", "=B1+1", "=SUM(A1:C1)", "=40+2"]] });
  const engine = new FormulaEngine(model);
  assert.deepEqual(engine.evaluateAll()[0], ["1", 2, 3, 6, 42]);
  const unrelatedAst = engine.parsedFormulas.get("0:4");

  model.transact("edit", () => model.setRaw(0, 0, "2"));
  const affected = engine.invalidateCell(0, 0);
  assert.deepEqual(sorted(affected), ["0:0", "0:1", "0:2", "0:3"]);
  for (const key of affected) {
    const [row, col] = key.split(":").map(Number);
    engine.evaluateCell(row, col);
  }
  assert.deepEqual([engine.evaluateCell(0, 1), engine.evaluateCell(0, 2), engine.evaluateCell(0, 3)], [4, 5, 11]);
  assert.equal(engine.evaluateCell(0, 4), 42);
  assert.equal(engine.parsedFormulas.get("0:4"), unrelatedAst, "unrelated parsed AST stays cached");
});

test("editing a formula rewires its reverse dependencies", () => {
  const model = new GridModel({ rows: [[1, 2, "=A1"]] });
  const engine = new FormulaEngine(model);
  assert.equal(engine.evaluateCell(0, 2), "1");

  model.transact("rewire", () => model.setRaw(0, 2, "=B1"));
  engine.invalidateCell(0, 2);
  assert.equal(engine.evaluateCell(0, 2), "2");

  model.transact("old source", () => model.setRaw(0, 0, "3"));
  assert.deepEqual(sorted(engine.invalidateCell(0, 0)), ["0:0"]);
  model.transact("new source", () => model.setRaw(0, 1, "4"));
  assert.deepEqual(sorted(engine.invalidateCell(0, 1)), ["0:1", "0:2"]);
  assert.equal(engine.evaluateCell(0, 2), "4");
});

test("GridModel journals only actual transaction cell changes and clears on rollback", () => {
  const model = new GridModel({ rows: [["a", "b"]] });
  model.transact("one change", () => { model.setRaw(0, 0, "a"); model.setRaw(0, 1, "c"); });
  assert.deepEqual(model.lastChangedCells, [[0, 1]]);
  assert.throws(() => model.transact("rollback", () => { model.setRaw(0, 0, "x"); throw new Error("stop"); }));
  assert.deepEqual(model.lastChangedCells, []);
  assert.equal(model.getRaw(0, 0), "a");
});

test("native refresh preserves engine and selection DOM while repainting only affected cells", () => {
  const model = new GridModel({ rows: [[1, "=A1*2", "=B1+1", "=40+2"]] });
  const engine = new FormulaEngine(model); engine.evaluateAll();
  const cells = new Map(Array.from({ length: 4 }, (_value, col) => [`0:${col}`, { dataset: { rgRaw: model.getRaw(0, col) } }]));
  const repainted = [];
  const view = {
    model, formulaEngine: engine, cells,
    renderCellValue(_cell, row, col, usedEngine) { assert.equal(usedEngine, engine); repainted.push(`${row}:${col}`); },
  };
  model.transact("edit", () => model.setRaw(0, 0, "2"));
  GridView.prototype.refreshValues.call(view);
  assert.equal(view.formulaEngine, engine);
  assert.deepEqual(repainted, ["0:0", "0:1", "0:2"]);
});

test("async formula cache repaints a visible transitive chain without false concurrent cycles", async () => {
  const rows = [["1", "=A1*2", "=B1+1", "=40+2"]];
  const store = {
    manifest: { rowCount: 1, colCount: 4 },
    async getRaw(row, col) { await Promise.resolve(); return rows[row]?.[col] ?? ""; },
  };
  const engine = new AsyncFormulaEngine(store);
  assert.deepEqual(await Promise.all([engine.evaluateCell(0, 1), engine.evaluateCell(0, 2), engine.evaluateCell(0, 3)]), [2, 3, 42]);
  rows[0][0] = "3";
  const affected = engine.invalidateCell(0, 0);
  assert.deepEqual(sorted(affected), ["0:0", "0:1", "0:2"]);
  assert.deepEqual(await Promise.all([...affected].map((key) => {
    const [row, col] = key.split(":").map(Number); return engine.evaluateCell(row, col);
  })), ["3", 6, 7]);
  assert.equal(await engine.evaluateCell(0, 3), 42);
});

test("concurrent async evaluation of a real cycle terminates", async () => {
  const rows = [["=B1", "=A1"]];
  const store = {
    manifest: { rowCount: 1, colCount: 2 },
    async getRaw(row, col) { await Promise.resolve(); return rows[row]?.[col] ?? ""; },
  };
  const engine = new AsyncFormulaEngine(store);
  const values = await Promise.race([
    Promise.all([engine.evaluateCell(0, 0), engine.evaluateCell(0, 1)]),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error("cycle evaluation timed out")), 250)),
  ]);
  assert.deepEqual(values, ["#CYCLE!", "#CYCLE!"]);
});
