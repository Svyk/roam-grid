import test from "node:test";
import assert from "node:assert/strict";
import { GridModel, exportGrid, importGrid, importGridTableSexpr, parseDelimited, renderChartSvg } from "../src/extension.js";

test("CSV parser handles quotes, commas, escaped quotes and newlines", () => {
  assert.deepEqual(parseDelimited('a,"b,c","say ""hi"""\n1,2,3', ","), [["a", "b,c", 'say "hi"'], ["1", "2", "3"]]);
});

test("CSV and TSV round trip", () => {
  const grid = new GridModel({ rows: [["a", "b,c"], ["line\nbreak", '"quote"']] });
  const csv = exportGrid(grid, "csv");
  assert.deepEqual(importGrid(csv, "csv").rows.map((row) => row.map((cell) => cell.raw)), grid.rows.map((row) => row.map((cell) => cell.raw)));
  const tsv = exportGrid(grid, "tsv");
  assert.deepEqual(importGrid(tsv, "tsv").rows.map((row) => row.map((cell) => cell.raw)), grid.rows.map((row) => row.map((cell) => cell.raw)));
});

test("Markdown, Org and RST exporters produce structured text", () => {
  const grid = new GridModel({ rows: [["Name", "Value"], ["A", "1"]] });
  assert.match(exportGrid(grid, "markdown"), /\| --- \| --- \|/);
  assert.match(exportGrid(grid, "org"), /\| Name \| Value \|/);
  assert.match(exportGrid(grid, "rst"), /=+  =+/);
});

test("Markdown importer removes separator row", () => {
  const grid = importGrid("| Name | Value |\n| --- | ---: |\n| A | 1 |", "markdown");
  assert.deepEqual(grid.rows.map((row) => row.map((cell) => cell.raw)), [["Name", "Value"], ["A", "1"]]);
});

test("grid-table tagged v2 import preserves safe horizontal merge", () => {
  const grid = importGridTableSexpr('(grid-table-file :version 2 :headers ("A" "B") :rows (("x" "")) :merges ((1 0 1)))');
  assert.equal(grid.rowCount, 2);
  assert.equal(grid.merges.length, 1);
  assert.deepEqual([grid.merges[0].row, grid.merges[0].colSpan], [1, 2]);
});

test("grid-table future versions fail clearly", () => {
  assert.throws(() => importGridTableSexpr('(grid-table-file :version 99 :rows (("x")))'), { code: "UNSUPPORTED_SCHEMA" });
});

test("all chart types render deterministic accessible SVG", () => {
  const grid = new GridModel({ rows: [[1, 2, 3], [3, 2, 1]] });
  for (const type of ["bar", "column", "line", "scatter", "histogram", "boxplot", "density", "count", "sparkline"]) {
    const first = renderChartSvg(grid, { type, title: `A & ${type}`, range: { startRow: 0, endRow: 1, startCol: 0, endCol: 2 } });
    const second = renderChartSvg(grid, { type, title: `A & ${type}`, range: { startRow: 0, endRow: 1, startCol: 0, endCol: 2 } });
    assert.equal(first, second);
    assert.match(first, /^<svg/);
    assert.match(first, /A &amp; /);
  }
});

