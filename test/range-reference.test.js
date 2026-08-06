import test from "node:test";
import assert from "node:assert/strict";
import { formatRangeComponent, GridModel, GridView, parseRangeComponent, selectionBlockReferenceMatrix } from "../src/extension.js";

function persistedModel() {
  const rows = [];
  for (let row = 0; row < 5; row += 1) {
    const cells = [];
    for (let col = 0; col < 5; col += 1) {
      const covered = row >= 1 && row <= 2 && col >= 1 && col <= 2 && !(row === 1 && col === 1);
      cells.push({ uid: `u${row}${col}real01`, raw: covered ? "" : `${row}:${col}` });
    }
    rows.push(cells);
  }
  const model = new GridModel({ rows, tableUid: "tbl00001" });
  model.merge({ startRow: 1, endRow: 2, startCol: 1, endCol: 2 });
  return model;
}

function fakeView(model) {
  return {
    model,
    selection: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    commits: [],
    referenced: [],
    commitMutation(label, mutation, structural) { this.commits.push({ label, structural }); mutation(); return Promise.resolve(); },
    pasteReferencedRange(spec) { this.referenced.push(spec); return Promise.resolve(); },
    pasteMatrix: GridView.prototype.pasteMatrix,
  };
}

function pasteEvent(text) {
  let prevented = false;
  return { prevented: () => prevented, preventDefault() { prevented = true; }, clipboardData: { files: [], getData: () => text } };
}

test("range component parse accepts single-cell, rectangular, spaced and locked forms", () => {
  assert.deepEqual(parseRangeComponent("{{roam-grid-range: ((abc123XYZ)) A1}}"), {
    tableUid: "abc123XYZ", range: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, label: "A1",
  });
  assert.deepEqual(parseRangeComponent("{{roam-grid-range: ((abc123XYZ)) B2:D5}}"), {
    tableUid: "abc123XYZ", range: { startRow: 1, endRow: 4, startCol: 1, endCol: 3 }, label: "B2:D5",
  });
  assert.deepEqual(parseRangeComponent("{{ roam-grid-range : ((abc123XYZ)) B2 : D5 }}"), {
    tableUid: "abc123XYZ", range: { startRow: 1, endRow: 4, startCol: 1, endCol: 3 }, label: "B2:D5",
  });
  assert.deepEqual(parseRangeComponent("{{roam-grid-range: ((abc123XYZ)) $B$2:$D$5}}"), {
    tableUid: "abc123XYZ", range: { startRow: 1, endRow: 4, startCol: 1, endCol: 3 }, label: "B2:D5",
  });
  assert.deepEqual(parseRangeComponent("see {{roam-grid-range: ((abc123XYZ)) aa10:ab12}} inline"), {
    tableUid: "abc123XYZ", range: { startRow: 9, endRow: 11, startCol: 26, endCol: 27 }, label: "AA10:AB12",
  });
});

test("range component parse normalizes reversed selections", () => {
  assert.deepEqual(parseRangeComponent("{{roam-grid-range: ((tbl00001)) D5:B2}}").range, { startRow: 1, endRow: 4, startCol: 1, endCol: 3 });
  assert.deepEqual(parseRangeComponent("{{roam-grid-range: ((tbl00001)) D2:B5}}").range, { startRow: 1, endRow: 4, startCol: 1, endCol: 3 });
  assert.equal(parseRangeComponent("{{roam-grid-range: ((tbl00001)) D5:B2}}").label, "B2:D5");
});

test("range component parse rejects malformed, foreign and plain-reference input", () => {
  assert.equal(parseRangeComponent(""), null);
  assert.equal(parseRangeComponent(null), null);
  assert.equal(parseRangeComponent(undefined), null);
  assert.equal(parseRangeComponent(42), null);
  assert.equal(parseRangeComponent("{{roam-grid-range: ((abc123XYZ))}}"), null);
  assert.equal(parseRangeComponent("{{roam-grid-range: ((abc123XYZ)) }}"), null);
  assert.equal(parseRangeComponent("{{roam-grid-range: abc123XYZ A1}}"), null);
  assert.equal(parseRangeComponent("{{roam-grid-range: (()) A1}}"), null);
  assert.equal(parseRangeComponent("{{roam-grid-range: ((abc123XYZ)) A0}}"), null);
  assert.equal(parseRangeComponent("{{roam-grid-range: ((abc123XYZ)) 12}}"), null);
  assert.equal(parseRangeComponent("{{other-component: ((abc123XYZ)) A1}}"), null);
  assert.equal(parseRangeComponent("{{[[table]]}}"), null);
  assert.equal(parseRangeComponent("{{roam/grid}}"), null);
  assert.equal(parseRangeComponent("((aaa1111))\t((bbb2222))"), null);
  assert.equal(parseRangeComponent("((aaa1111))"), null);
});

test("range component format refuses a grid without a persisted Roam uid", () => {
  const selection = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 };
  const local = new GridModel({ rows: [["a", "b"], ["c", "d"]], tableUid: "rg_localdraft" });
  assert.throws(() => formatRangeComponent(local, selection), (error) => error.code === "REFERENCE_PENDING");
  const anonymous = new GridModel({ rows: [["a", "b"], ["c", "d"]] });
  assert.throws(() => formatRangeComponent(anonymous, selection), (error) => error.code === "REFERENCE_PENDING");
  const saved = new GridModel({ rows: [["a", "b"], ["c", "d"]], tableUid: "tbl00001" });
  assert.equal(formatRangeComponent(saved, selection), "{{roam-grid-range: ((tbl00001)) A1:B2}}");
  assert.equal(formatRangeComponent(saved, { startRow: 1, endRow: 1, startCol: 1, endCol: 1 }), "{{roam-grid-range: ((tbl00001)) B2}}");
});

test("range component format and parse round-trip 20 generated rectangles", () => {
  const model = new GridModel({ rows: [["a"]], tableUid: "tbl00001" });
  let seed = 20260805;
  const next = (bound) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % bound; };
  for (let index = 0; index < 20; index += 1) {
    const startRow = next(60); const endRow = startRow + next(12);
    const startCol = next(60); const endCol = startCol + next(12);
    const reversed = { startRow: endRow, endRow: startRow, startCol: endCol, endCol: startCol };
    const text = formatRangeComponent(model, reversed);
    const parsed = parseRangeComponent(text);
    assert.equal(parsed.tableUid, "tbl00001");
    assert.deepEqual(parsed.range, { startRow, endRow, startCol, endCol });
    assert.equal(parsed.label, text.slice(text.indexOf(")) ") + 3, -2));
    assert.equal(formatRangeComponent(model, parsed.range), text);
  }
});

test("a round-tripped component drives selectionBlockReferenceMatrix identically to the raw selection", () => {
  const model = persistedModel();
  const selections = [
    { startRow: 3, endRow: 0, startCol: 3, endCol: 0 },
    { startRow: 1, endRow: 2, startCol: 1, endCol: 2 },
    { startRow: 4, endRow: 4, startCol: 4, endCol: 4 },
  ];
  for (const selection of selections) {
    const direct = selectionBlockReferenceMatrix(model, selection);
    const parsed = parseRangeComponent(formatRangeComponent(model, selection));
    assert.deepEqual(selectionBlockReferenceMatrix(model, parsed.range), direct);
  }
  const covering = selectionBlockReferenceMatrix(model, selections[0]);
  assert.deepEqual(covering[1], ["((u10real01))", "((u11real01))", "", "((u13real01))"]);
  assert.deepEqual(covering[2], ["((u20real01))", "", "", "((u23real01))"]);
});

test("pasting a live range component routes to pasteReferencedRange and never the delimited path", async () => {
  const view = fakeView(new GridModel({ rows: [["", ""], ["", ""]] }));
  const event = pasteEvent("{{roam-grid-range: ((src00001)) B2:C3}}");
  await GridView.prototype.onPaste.call(view, event);
  assert.equal(event.prevented(), true);
  assert.deepEqual(view.referenced, [{ tableUid: "src00001", range: { startRow: 1, endRow: 2, startCol: 1, endCol: 2 }, label: "B2:C3" }]);
  assert.deepEqual(view.commits, []);
  assert.deepEqual([view.model.getRaw(0, 0), view.model.getRaw(0, 1), view.model.getRaw(1, 0), view.model.getRaw(1, 1)], ["", "", "", ""]);
});

test("a plain block-reference TSV still takes the delimited paste path", async () => {
  const view = fakeView(new GridModel({ rows: [["", ""], ["", ""]] }));
  const event = pasteEvent("((aaa1111))\t((bbb2222))\n((ccc3333))\t((ddd4444))");
  await GridView.prototype.onPaste.call(view, event);
  assert.equal(event.prevented(), true);
  assert.deepEqual(view.referenced, []);
  assert.deepEqual(view.commits, [{ label: "Paste cells", structural: false }]);
  assert.deepEqual([
    [view.model.getRaw(0, 0), view.model.getRaw(0, 1)],
    [view.model.getRaw(1, 0), view.model.getRaw(1, 1)],
  ], [["((aaa1111))", "((bbb2222))"], ["((ccc3333))", "((ddd4444))"]]);
});

test("the referenced matrix lands through the shared Paste cells mutation, merge holes included", async () => {
  const source = persistedModel();
  const spec = parseRangeComponent(formatRangeComponent(source, { startRow: 0, endRow: 2, startCol: 0, endCol: 2 }));
  const view = fakeView(new GridModel({ rows: [["x", "x"], ["x", "x"]] }));
  await GridView.prototype.pasteMatrix.call(view, selectionBlockReferenceMatrix(source, spec.range));
  assert.deepEqual(view.commits, [{ label: "Paste cells", structural: true }]);
  assert.deepEqual(view.model.rows.map((row) => row.map((cell) => cell.raw)), [
    ["((u00real01))", "((u01real01))", "((u02real01))"],
    ["((u10real01))", "((u11real01))", ""],
    ["((u20real01))", "", ""],
  ]);
});
