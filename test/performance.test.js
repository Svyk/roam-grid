import test from "node:test";
import assert from "node:assert/strict";
import { FormulaEngine, GridModel } from "../src/extension.js";

test("5,000-cell native model formula pass stays within the interaction budget envelope", () => {
  const rows = Array.from({ length: 100 }, (_, row) => Array.from({ length: 50 }, (_, col) => col === 49 ? `=A${row + 1}+B${row + 1}` : String(row + col)));
  const model = new GridModel({ rows });
  const started = performance.now();
  const values = new FormulaEngine(model).evaluateAll();
  const elapsed = performance.now() - started;
  assert.equal(values.length, 100);
  assert.equal(values[0].length, 50);
  assert.ok(elapsed < 250, `formula pass took ${elapsed.toFixed(1)}ms`);
});

test("single cell transaction does not clone or rebuild the rendered grid contract", () => {
  const model = new GridModel({ rows: Array.from({ length: 100 }, () => Array.from({ length: 50 }, () => "")) });
  const rowIdentity = model.rows[99];
  model.transact("edit", () => model.setRaw(0, 0, "x"));
  assert.equal(model.rows[99], rowIdentity);
  assert.equal(model.getRaw(0, 0), "x");
});

