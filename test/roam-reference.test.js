import test from "node:test";
import assert from "node:assert/strict";
import { roamReferenceAutocompleteContext, searchRoamReferenceSuggestions } from "../src/extension.js";

test("Roam reference context finds the nearest unclosed page or block opener", () => {
  assert.deepEqual(roamReferenceAutocompleteContext("See [[Proj", 10), {
    type: "page", query: "Proj", startIndex: 4, queryStart: 6, endIndex: 10, replaceEndIndex: 10,
  });
  const blockSource = "[[closed]] then ((uid";
  assert.deepEqual(roamReferenceAutocompleteContext(blockSource, blockSource.length), {
    type: "block", query: "uid", startIndex: 16, queryStart: 18, endIndex: 21, replaceEndIndex: 21,
  });
  assert.deepEqual(roamReferenceAutocompleteContext("See [[Proj]]", 10), {
    type: "page", query: "Proj", startIndex: 4, queryStart: 6, endIndex: 10, replaceEndIndex: 12,
  });
  assert.equal(roamReferenceAutocompleteContext("[[closed]]", 10), null);
  assert.equal(roamReferenceAutocompleteContext("[[line\nbreak", 12), null);
});

test("Roam reference search is type-filtered, bounded, and normalizes results", async () => {
  const calls = [];
  const api = { data: { search: (options) => {
    calls.push(options);
    return options["search-pages"]
      ? [{ ":node/title": "Project Alpha", ":block/uid": "pageuid01" }]
      : [{ ":block/string": "A matching block", ":block/uid": "blockuid1" }];
  } } };
  const pages = await searchRoamReferenceSuggestions({ type: "page", query: "proj" }, 100, api);
  const blocks = await searchRoamReferenceSuggestions({ type: "block", query: "match" }, 8, api);
  assert.deepEqual(pages, [{ kind: "roam-page", name: "Project Alpha", description: "Page", uid: "pageuid01" }]);
  assert.deepEqual(blocks, [{ kind: "roam-block", name: "A matching block", description: "Block · blockuid1", uid: "blockuid1" }]);
  assert.deepEqual(calls[0], {
    "search-str": "proj", "search-pages": true, "search-blocks": false, "hide-code-blocks": false,
    limit: 20, pull: "[:node/title :block/uid]",
  });
  assert.equal(calls[1]["search-pages"], false);
  assert.equal(calls[1]["search-blocks"], true);
  assert.equal(calls[1]["hide-code-blocks"], true);
});
