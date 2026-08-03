import test from "node:test";
import assert from "node:assert/strict";
import { FormulaEngine, GridError, GridModel, columnLabel, fittedTrackResize, formulaReferences, parseCellReference, rewriteFormula, rewriteFormulaForStructure, serializeTemplateModel, templateModelFromValue } from "../src/extension.js";

const model = (rows, options = {}) => new GridModel({ rows, ...options });

test("column labels and references round trip", () => {
  assert.equal(columnLabel(0), "A");
  assert.equal(columnLabel(25), "Z");
  assert.equal(columnLabel(26), "AA");
  assert.deepEqual(parseCellReference("$AA$12"), { row: 11, col: 26, absoluteCol: true, absoluteRow: true });
});

test("fit-to-window resize expands the dragged column while preserving total width", () => {
  const resized = fittedTrackResize({ a: 200, b: 100, c: 100 }, "a", 260, 56);
  assert.equal(resized.a, 260);
  assert.ok(Math.abs(Object.values(resized).reduce((sum, width) => sum + width, 0) - 400) < 0.001);
  assert.ok(resized.b >= 56);
  assert.ok(resized.c >= 56);
  const overflow = fittedTrackResize({ a: 200, b: 100, c: 100 }, "a", 500, 56);
  assert.equal(overflow.a, 500);
  assert.ok(Math.abs(overflow.b - 56) < 0.001);
  assert.ok(Math.abs(overflow.c - 56) < 0.001);
  assert.ok(Object.values(overflow).reduce((sum, width) => sum + width, 0) > 400);
});

test("formula engine handles arithmetic, ranges, strings, and functions", () => {
  const grid = model([["2", "3", "=A1+B1", "=SUM(A1:C1)", '=IF(C1=5,"yes","no")']]);
  const values = new FormulaEngine(grid).evaluateAll()[0];
  assert.deepEqual(values, ["2", "3", 5, 10, "yes"]);
});

test("formula engine reports cycles, divide by zero, names, and references", () => {
  const grid = model([["=B1", "=A1", "=1/0", "=NOPE(1)", "=Z99"]]);
  const values = new FormulaEngine(grid).evaluateAll()[0];
  assert.equal(values[0], "#CYCLE!");
  assert.equal(values[1], "#CYCLE!");
  assert.equal(values[2], "#DIV/0!");
  assert.equal(values[3], "#NAME?");
  assert.equal(values[4], "#REF!");
});

test("formula rewrite preserves absolute axes", () => {
  assert.equal(rewriteFormula("=A1+$B1+C$2+$D$4", 2, 3), "=D3+$B3+F$2+$D$4");
  assert.equal(rewriteFormula("plain", 2, 3), "plain");
});

test("formula reference scanner returns ranges and ignores quoted text", () => {
  const refs = formulaReferences('=SUM($A$1:B3)+C4+"D5"');
  assert.deepEqual(refs.map((ref) => ref.text), ["$A$1:B3", "C4"]);
  assert.deepEqual(refs[0].range, { startRow: 0, endRow: 2, startCol: 0, endCol: 1 });
});

test("structural insertion shifts absolute and relative references and expands ranges", () => {
  assert.equal(
    rewriteFormulaForStructure("=A1+$B$2+SUM(C3:C5)", { axis: "row", index: 1, insertCount: 1 }),
    "=A1+$B$3+SUM(C4:C6)",
  );
  assert.equal(
    rewriteFormulaForStructure("=A1+$B$2+SUM(C3:C5)", { axis: "col", index: 1, insertCount: 1 }),
    "=A1+$C$2+SUM(D3:D5)",
  );
  assert.equal(
    rewriteFormulaForStructure("=SUM(A1:A3)", { axis: "row", index: 2, insertCount: 2 }),
    "=SUM(A1:A5)",
  );
});

test("structural deletion shifts survivors, trims ranges, and marks deleted references", () => {
  assert.equal(
    rewriteFormulaForStructure("=A1+A2+A4+SUM(B2:B5)", { axis: "row", index: 1, deleteCount: 2 }),
    "=A1+#REF!+A2+SUM(B2:B3)",
  );
  assert.equal(
    rewriteFormulaForStructure("=SUM(A2:A3)", { axis: "row", index: 1, deleteCount: 2 }),
    "=SUM(#REF!)",
  );
  assert.equal(
    rewriteFormulaForStructure('="A2"&A2', { axis: "row", index: 1, deleteCount: 1 }),
    '="A2"&#REF!',
  );
});

test("grid row and column mutations rewrite every surviving formula atomically", () => {
  const insertedRows = model([["1", "=A1"], ["2", ""]]);
  insertedRows.insertRows(0, 1);
  assert.equal(insertedRows.getRaw(1, 1), "=A2");

  const adjacentTotal = model([["1"], ["2"], ["=SUM(A1:A2)"]]);
  adjacentTotal.insertRows(2, 1);
  assert.equal(adjacentTotal.getRaw(3, 0), "=SUM(A1:A3)");
  assert.equal(new FormulaEngine(adjacentTotal).evaluateCell(3, 0), 3);

  const deletedRows = model([["formula", "=A2+A4"], ["one", ""], ["two", ""], ["three", ""]]);
  deletedRows.deleteRows(1, 2);
  assert.equal(deletedRows.getRaw(0, 1), "=#REF!+A2");
  assert.equal(new FormulaEngine(deletedRows).evaluateCell(0, 1), "#REF!");

  const insertedCols = model([["1", "=A1"]]);
  insertedCols.insertCols(0, 1);
  assert.equal(insertedCols.getRaw(0, 2), "=B1");

  const deletedCols = model([["1", "2", "3", "=A1+B1+C1"]]);
  deletedCols.deleteCols(1, 1);
  assert.equal(deletedCols.getRaw(0, 2), "=A1+#REF!+B1");
});

test("safe rectangular merge stores only structural coverage", () => {
  const grid = model([["title", "", ""], ["", "", ""]]);
  const merge = grid.merge({ startRow: 0, endRow: 1, startCol: 0, endCol: 2 });
  assert.deepEqual([merge.rowSpan, merge.colSpan], [2, 3]);
  assert.equal(grid.getRaw(0, 0), "title");
  assert.equal(grid.getRaw(1, 2), "");
  assert.equal(grid.isCovered(1, 2), true);
  assert.throws(() => grid.setRaw(1, 2, "hidden"), { code: "MERGE_COVERED" });
});

test("merge refuses values, formulas, and whitespace in covered cells", () => {
  for (const blocked of ["value", '=IF(FALSE,"x","")', " "]) {
    const grid = model([["anchor", blocked]]);
    assert.throws(() => grid.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 }), (error) => error.code === "MERGE_NONEMPTY" && error.details.cells.includes("B1"));
  }
});

test("merge refuses one cell and overlaps", () => {
  const grid = model([["", "", ""]]);
  assert.throws(() => grid.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }), { code: "MERGE_SINGLE" });
  grid.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 });
  assert.throws(() => grid.merge({ startRow: 0, endRow: 0, startCol: 1, endCol: 2 }), { code: "MERGE_OVERLAP" });
});

test("unmerge leaves anchor and covered cells intact", () => {
  const grid = model([["anchor", ""]]);
  grid.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 });
  assert.equal(grid.unmerge(0, 1), true);
  assert.deepEqual(grid.rows[0].map((cell) => cell.raw), ["anchor", ""]);
});

test("covered coordinates are empty in formulas and flat values", () => {
  const grid = model([["10", "", "", "=SUM(A1:C1)"]]);
  grid.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 2 });
  assert.equal(new FormulaEngine(grid).evaluateCell(0, 3), 10);
});

test("row insertion shifts or expands merges", () => {
  const shifted = model([["x", ""], ["", ""]]);
  shifted.merge({ startRow: 1, endRow: 1, startCol: 0, endCol: 1 });
  shifted.insertRows(0, 1);
  assert.equal(shifted.merges[0].row, 2);

  const expanded = model([["x", ""], ["", ""]]);
  expanded.merge({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 });
  expanded.insertRows(1, 1);
  assert.equal(expanded.merges[0].rowSpan, 3);
});

test("column insertion shifts or expands merges", () => {
  const shifted = model([["", "x", ""]]);
  shifted.merge({ startRow: 0, endRow: 0, startCol: 1, endCol: 2 });
  shifted.insertCols(0, 1);
  assert.equal(shifted.merges[0].col, 2);

  const expanded = model([["x", "", ""]]);
  expanded.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 2 });
  expanded.insertCols(1, 1);
  assert.equal(expanded.merges[0].colSpan, 4);
});

test("deleting an anchor column transfers anchor content", () => {
  const grid = model([["anchor", "", "tail"]]);
  grid.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 });
  grid.deleteCols(0, 1);
  assert.equal(grid.getRaw(0, 0), "anchor");
  assert.equal(grid.merges.length, 0);
});

test("deleting covered column shrinks a merge", () => {
  const grid = model([["anchor", "", ""]]);
  grid.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 2 });
  grid.deleteCols(2, 1);
  assert.equal(grid.merges[0].colSpan, 2);
});

test("deleting merged row removes merge", () => {
  const grid = model([["header", ""], ["anchor", ""], ["tail", ""]]);
  grid.merge({ startRow: 1, endRow: 1, startCol: 0, endCol: 1 });
  grid.deleteRows(1, 1);
  assert.equal(grid.merges.length, 0);
  assert.equal(grid.getRaw(1, 0), "tail");
});

test("stable sorting moves horizontal merge with its row", () => {
  const grid = model([["Name", "Value"], ["B", ""], ["A", ""]], { frozenRows: 1 });
  grid.merge({ startRow: 1, endRow: 1, startCol: 0, endCol: 1 });
  grid.sortBy(0, "asc");
  assert.equal(grid.getRaw(1, 0), "A");
  assert.equal(grid.merges[0].row, 2);
});

test("sorting and reordering refuse multi-row merges without mutation", () => {
  const grid = model([["H", ""], ["B", ""], ["", ""]], { frozenRows: 1 });
  grid.merge({ startRow: 1, endRow: 2, startCol: 0, endCol: 1 });
  const before = grid.snapshot();
  assert.throws(() => grid.sortBy(0), { code: "VERTICAL_MERGE_SORT" });
  assert.throws(() => grid.reorderRows(1, 2), { code: "VERTICAL_MERGE_REORDER" });
  assert.deepEqual(grid.snapshot(), before);
});

test("range move preserves merge and rewrites relative formulas", () => {
  const grid = model([["1", "", "", ""], ["=A1", "", "", ""]]);
  grid.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 });
  grid.moveRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, 0, 2);
  assert.equal(grid.getRaw(1, 2), "=C1");
  assert.equal(grid.merges[0].col, 2);
});

test("partial merge move is refused", () => {
  const grid = model([["x", "", ""]]);
  grid.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 });
  assert.throws(() => grid.moveRange({ startRow: 0, endRow: 0, startCol: 1, endCol: 1 }, 0, 2), { code: "PARTIAL_MERGE_MOVE" });
});

test("transactions rollback failures and support undo redo", () => {
  const grid = model([["a"]]);
  assert.throws(() => grid.transact("bad", () => { grid.setRaw(0, 0, "b"); throw new GridError("FAIL", "fail"); }), { code: "FAIL" });
  assert.equal(grid.getRaw(0, 0), "a");
  grid.transact("edit", () => grid.setRaw(0, 0, "b"));
  assert.equal(grid.getRaw(0, 0), "b");
  assert.equal(grid.undo(), true); assert.equal(grid.getRaw(0, 0), "a");
  assert.equal(grid.redo(), true); assert.equal(grid.getRaw(0, 0), "b");
});

test("row heights are UID-backed, transactional, and follow sorted rows", () => {
  const grid = model([
    [{ uid: "row-b", raw: "B" }, { uid: "b2", raw: "" }],
    [{ uid: "row-a", raw: "A" }, { uid: "a2", raw: "" }],
  ], { frozenRows: 0 });
  grid.transact("resize", () => grid.setRowHeight(0, 67));
  assert.equal(grid.getRowHeight(0), 67);
  assert.equal(grid.undo(), true);
  assert.equal(grid.getRowHeight(0), null);
  assert.equal(grid.redo(), true);
  grid.sortBy(0, "asc", 0);
  assert.equal(grid.getRaw(1, 0), "B");
  assert.equal(grid.getRowHeight(1), 67);
  assert.equal(grid.getRowHeight(0), null);
});

test("row height deletion prunes metadata and values clamp safely", () => {
  const grid = model([
    [{ uid: "row-one", raw: "one" }],
    [{ uid: "row-two", raw: "two" }],
  ]);
  grid.setRowHeight(0, 1);
  grid.setRowHeight(1, 9999);
  assert.equal(grid.getRowHeight(0), 22);
  assert.equal(grid.getRowHeight(1), 480);
  grid.deleteRows(0, 1);
  assert.equal(Object.hasOwn(grid.rowHeights, "row-one"), false);
  assert.equal(grid.getRowHeight(0), 480);
});

test("cell alignment follows stable UIDs and merged anchors", () => {
  const grid = model([
    [{ uid: "row-b", raw: "B" }, { uid: "b2", raw: "" }],
    [{ uid: "row-a", raw: "A" }, { uid: "a2", raw: "" }],
  ], { frozenRows: 0 });
  grid.setAlignment(0, 0, "right");
  grid.sortBy(0, "asc", 0);
  assert.equal(grid.getAlignment(1, 0), "right");
  grid.merge({ startRow: 1, endRow: 1, startCol: 0, endCol: 1 });
  assert.equal(grid.getAlignment(1, 1), "right");
  grid.setAlignment(1, 1, "center");
  assert.equal(grid.getAlignment(1, 0), "center");
  assert.throws(() => grid.setAlignment(0, 0, "justify"), { code: "ALIGNMENT" });
});

test("native-style header formatting follows stable row and column IDs", () => {
  const grid = model([
    [{ uid: "row-b", raw: "B" }, { uid: "b2", raw: "2" }],
    [{ uid: "row-a", raw: "A" }, { uid: "a2", raw: "1" }],
  ], { columnIds: ["c1", "c2"], frozenRows: 0 });
  grid.toggleHeaderRow(0);
  grid.toggleHeaderColumn(1);
  grid.sortBy(0, "asc", 0);
  assert.equal(grid.isHeaderRow(1), true);
  assert.equal(grid.isHeaderColumn(1), true);
  grid.deleteCols(1, 1);
  assert.deepEqual(grid.headerColumns, []);
  grid.deleteRows(1, 1);
  assert.deepEqual(grid.headerRows, []);
});

test("malformed merge metadata is dropped without touching raw data", () => {
  const grid = model([["a", "hidden"]], { merges: [{ id: "bad", row: 0, col: 0, rowSpan: 1, colSpan: 2 }] });
  assert.equal(grid.merges.length, 0);
  assert.deepEqual(grid.rows[0].map((cell) => cell.raw), ["a", "hidden"]);
});

test("JSON round trip preserves layout", () => {
  const grid = model([[{ uid: "row-one", raw: "a" }, { uid: "cell-two", raw: "" }]], { columnIds: ["c1", "c2"], widths: { c1: 200 }, rowHeights: { "row-one": 54 }, alignments: { "row-one": "center" }, headerColumns: ["c1"], headerRows: ["row-one"], frozenRows: 1, charts: [{ id: "chart", type: "line" }], showHeaders: false, fitToWidth: false, colorFormulaCells: false });
  grid.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 });
  const roundTrip = GridModel.fromJSON(JSON.parse(JSON.stringify(grid.toJSON())));
  assert.deepEqual(roundTrip.rows.map((row) => row.map((cell) => cell.raw)), [["a", ""]]);
  assert.equal(roundTrip.merges.length, 1);
  assert.equal(roundTrip.charts.length, 1);
  assert.equal(roundTrip.widths.c1, 200);
  assert.equal(roundTrip.getRowHeight(0), 54);
  assert.equal(roundTrip.getAlignment(0, 0), "center");
  assert.equal(roundTrip.isHeaderColumn(0), true);
  assert.equal(roundTrip.isHeaderRow(0), true);
  assert.equal(roundTrip.showHeaders, false);
  assert.equal(roundTrip.fitToWidth, false);
  assert.equal(roundTrip.colorFormulaCells, false);
});

test("saved templates remap UID-backed layout by position", () => {
  const grid = model([
    [{ uid: "source-r1", raw: "Title" }, { uid: "source-r1c2", raw: "" }],
    [{ uid: "source-r2", raw: "2" }, { uid: "source-r2c2", raw: "=A2*3" }],
  ], { columnIds: ["source-c1", "source-c2"], showHeaders: false, fitToWidth: true, colorFormulaCells: false });
  grid.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 });
  grid.widths[grid.columnIds[0]] = 240;
  grid.setRowHeight(1, 48);
  grid.setAlignment(1, 1, "right");
  grid.toggleHeaderRow(1);
  const restored = templateModelFromValue(serializeTemplateModel(grid, "Calculator"));
  assert.equal(restored.tableUid, null);
  assert.notEqual(restored.rows[1][0].uid, "source-r2");
  assert.deepEqual(restored.rows.map((row) => row.map((cell) => cell.raw)), [["Title", ""], ["2", "=A2*3"]]);
  assert.equal(restored.merges.length, 1);
  assert.equal(restored.widths[restored.columnIds[0]], 240);
  assert.equal(restored.getRowHeight(1), 48);
  assert.equal(restored.getAlignment(1, 1), "right");
  assert.equal(restored.isHeaderRow(1), true);
  assert.equal(restored.colorFormulaCells, false);
  assert.equal(new FormulaEngine(restored).evaluateCell(1, 1), 6);
});
