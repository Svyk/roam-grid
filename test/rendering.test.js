import test from "node:test";
import assert from "node:assert/strict";
import { renderStableCellContent, requiresRoamRichRender } from "../src/extension.js";

test("rich rendering detection covers Roam and Markdown syntax conservatively", () => {
  for (const raw of [
    "[[Page]]",
    "((block-uid))",
    "{{embed: ((block-uid))}}",
    "#tag",
    "#[[nested tag]]",
    "key:: value",
    "**bold**",
    "_italic_",
    "^^highlight^^",
    "`code`",
    "[label](https://example.com)",
    "![alt](https://example.com/image.png)",
    "https://example.com",
    "first line\nsecond line",
  ]) assert.equal(requiresRoamRichRender(raw), true, raw);

  for (const raw of ["", "42", "$1.20", "plain text", "=SUM(A1:A2)", "email@example.com"])
    assert.equal(requiresRoamRichRender(raw), false, raw);
});

test("stable cell content skips unchanged text and unchanged rich source", () => {
  let writes = 0;
  let textValue = "existing";
  const content = {
    dataset: {},
    get textContent() { return textValue; },
    set textContent(value) { writes += 1; textValue = value; },
  };
  const identity = content;

  assert.equal(renderStableCellContent(content, { raw: "42" }), true);
  assert.equal(textValue, "42");
  assert.equal(writes, 1);
  assert.equal(renderStableCellContent(content, { raw: "42" }), false);
  assert.equal(writes, 1);

  assert.equal(renderStableCellContent(content, { raw: "=A1*2", value: 84, formula: true }), true);
  assert.equal(textValue, "84");
  assert.equal(renderStableCellContent(content, { raw: "=A1*2", value: 84, formula: true }), false);
  assert.equal(renderStableCellContent(content, { raw: "=A1*2", value: 86, formula: true }), true);
  assert.equal(textValue, "86");

  const richCalls = [];
  const renderRich = (target, raw, token) => richCalls.push({ target, raw, token });
  assert.equal(renderStableCellContent(content, { raw: "[[Page]]", renderRich }), true);
  assert.equal(renderStableCellContent(content, { raw: "[[Page]]", renderRich }), false);
  assert.equal(renderStableCellContent(content, { raw: "[[Other]]", renderRich }), true);
  assert.equal(richCalls.length, 2);
  assert.equal(richCalls[0].target, identity);
  assert.notEqual(richCalls[0].token, richCalls[1].token);
  assert.equal(content, identity);
});
