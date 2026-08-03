import test from "node:test";
import assert from "node:assert/strict";
import {
  FormulaEngine,
  GridModel,
  RegistrySet,
  activeFormulaCall,
  cycleFormulaReferenceLocks,
  formulaAutocompleteContext,
  parseCellReference,
  rankFormulaFunctions,
} from "../src/extension.js";

test("formula autocomplete detects expression identifiers but not text", () => {
  assert.deepEqual(formulaAutocompleteContext("=", 1), { query: "", startIndex: 1, endIndex: 1, hasFollowingParenthesis: false });
  assert.deepEqual(formulaAutocompleteContext("=su", 3), { query: "SU", startIndex: 1, endIndex: 3, hasFollowingParenthesis: false });
  const nested = "=IF(A1, su";
  assert.deepEqual(formulaAutocompleteContext(nested, nested.length), { query: "SU", startIndex: 8, endIndex: 10, hasFollowingParenthesis: false });
  assert.deepEqual(formulaAutocompleteContext("=SUM(A1)", 2), { query: "S", startIndex: 1, endIndex: 4, hasFollowingParenthesis: true });
  assert.deepEqual(formulaAutocompleteContext("=SUM(A1)", 4), { query: "SUM", startIndex: 1, endIndex: 4, hasFollowingParenthesis: true });
  assert.equal(formulaAutocompleteContext("=A1", 3), null);
  assert.equal(formulaAutocompleteContext('="SUM"', 5), null);
  assert.equal(formulaAutocompleteContext("plain", 5), null);
  assert.equal(formulaAutocompleteContext("==literal", 9), null);
});

test("formula autocomplete ranking is deterministic and carries metadata", () => {
  const catalog = new Map([
    ["SUMIF", { parameters: ["range", "condition"], description: "Conditional sum", volatile: false }],
    ["ABS", { parameters: ["number"], description: "Absolute value", volatile: false }],
    ["SUM", { parameters: ["number1"], description: "Sum", volatile: false }],
    ["SUBTOTAL", { parameters: ["function", "range"], description: "Subtotal", volatile: false }],
  ]);
  assert.deepEqual(rankFormulaFunctions("su", catalog).map(({ name }) => name), ["SUM", "SUMIF", "SUBTOTAL"]);
  const exact = rankFormulaFunctions("sum", catalog, 1)[0];
  assert.deepEqual(exact, { name: "SUM", parameters: ["number1"], description: "Sum", volatile: false, score: 0 });
  assert.deepEqual(rankFormulaFunctions("", catalog, 2).map(({ name }) => name), ["ABS", "SUBTOTAL"]);
  assert.deepEqual(rankFormulaFunctions("zzz", catalog), []);
});

test("active formula call follows nested calls and ignores quoted commas", () => {
  const formula = '=ROUND(SUM(A1:A3),2)+IF(A1,CONCAT("a,b",C1),D1)';
  const insideSum = formula.indexOf("A3") + 2;
  assert.deepEqual(activeFormulaCall(formula, insideSum), { name: "SUM", argumentIndex: 0, openIndex: 10, callStartIndex: 7 });
  const roundDigits = formula.indexOf(",2") + 2;
  assert.deepEqual(activeFormulaCall(formula, roundDigits), { name: "ROUND", argumentIndex: 1, openIndex: 6, callStartIndex: 1 });
  const concatSecond = formula.indexOf("C1") + 2;
  assert.equal(activeFormulaCall(formula, concatSecond)?.name, "CONCAT");
  assert.equal(activeFormulaCall(formula, concatSecond)?.argumentIndex, 1);
  const ifThird = formula.indexOf("D1") + 2;
  assert.equal(activeFormulaCall(formula, ifThird)?.name, "IF");
  assert.equal(activeFormulaCall(formula, ifThird)?.argumentIndex, 2);
  assert.equal(activeFormulaCall("=SUM(A1)", 8), null);
});

test("F4 cycles one reference through Excel lock states", () => {
  let state = { value: "=A1", selectionStart: 2, selectionEnd: 2 };
  for (const expected of ["=$A$1", "=A$1", "=$A1", "=A1"]) {
    state = cycleFormulaReferenceLocks(state.value, state.selectionStart, state.selectionEnd);
    assert.equal(state.value, expected);
    assert.equal(state.changed, true);
  }
});

test("F4 locks both range endpoints and every selected reference", () => {
  const range = cycleFormulaReferenceLocks("=SUM(A1:B2)", 8, 8);
  assert.equal(range.value, "=SUM($A$1:$B$2)");
  assert.deepEqual(range.references.map(({ text }) => text), ["$A$1:$B$2"]);

  const selected = cycleFormulaReferenceLocks("=A1+B2+C3", 1, 6);
  assert.equal(selected.value, "=$A$1+$B$2+C3");
  assert.equal(selected.selectionStart, 1);
  assert.equal(selected.selectionEnd, 10);
  assert.deepEqual(selected.references.map(({ text }) => text), ["$A$1", "$B$2"]);
});

test("F4 recognizes spaced ranges and preserves their authored separator", () => {
  const formula = "=SUM(A1 :  B2)";
  const cycled = cycleFormulaReferenceLocks(formula, formula.indexOf(":"), formula.indexOf(":"));
  assert.equal(cycled.value, "=SUM($A$1 :  $B$2)");
  assert.deepEqual(cycled.references.map(({ text }) => text), ["$A$1 :  $B$2"]);
});

test("unsafe formula coordinates are rejected without entering label formatting", () => {
  const hugeColumnReference = `${"Z".repeat(220)}1`;
  const hugeRowReference = `A${"9".repeat(400)}`;
  assert.equal(parseCellReference(hugeColumnReference), null);
  assert.equal(parseCellReference(hugeRowReference), null);
  const formula = `=${hugeColumnReference}`;
  const result = cycleFormulaReferenceLocks(formula, 2, 2);
  assert.equal(result.value, formula);
  assert.equal(result.changed, false);
});

test("F4 is a no-op away from a reference or inside quoted text", () => {
  assert.deepEqual(cycleFormulaReferenceLocks("=A1 + B2", 5, 5), {
    value: "=A1 + B2", selectionStart: 5, selectionEnd: 5, changed: false, references: [],
  });
  assert.equal(cycleFormulaReferenceLocks('="A1"', 3, 3).changed, false);
});

test("formula registry includes complete built-in metadata", () => {
  const registries = new RegistrySet();
  assert.ok(registries.formulaFunctions.size > 20);
  assert.equal(registries.formulaFunctions.size, registries.formulaFunctionMetadata.size);
  for (const [name, fn] of registries.formulaFunctions) {
    const metadata = registries.formulaFunctionMetadata.get(name);
    assert.equal(typeof fn, "function");
    assert.ok(Array.isArray(metadata?.parameters), `${name} has parameters`);
    assert.ok(metadata?.description, `${name} has a description`);
    assert.equal(metadata?.volatile, false, `${name} is non-volatile`);
  }
});

test("two-argument custom registration stays compatible and disposes metadata", () => {
  const registries = new RegistrySet();
  const dispose = registries.registerFormulaFunction("double", (value) => Number(value) * 2);
  assert.deepEqual(registries.formulaFunctionMetadata.get("DOUBLE"), { parameters: [], description: "", volatile: true });
  const model = new GridModel({ rows: [["3", "=DOUBLE(A1)"]] });
  assert.equal(new FormulaEngine(model, registries.formulaFunctions).evaluateCell(0, 1), 6);
  assert.equal(dispose(), true);
  assert.equal(dispose(), false);
  assert.equal(registries.formulaFunctions.has("DOUBLE"), false);
  assert.equal(registries.formulaFunctionMetadata.has("DOUBLE"), false);
});

test("custom formula metadata honors explicit non-volatility", () => {
  const registries = new RegistrySet();
  registries.registerFormulaFunction("MY_FN", (value, fallback) => value ?? fallback, {
    parameters: ["value", "[fallback]"],
    description: "Returns a fallback for an empty value.",
    volatile: false,
  });
  assert.deepEqual(registries.formulaFunctionMetadata.get("MY_FN"), {
    parameters: ["value", "[fallback]"],
    description: "Returns a fallback for an empty value.",
    volatile: false,
  });
});
