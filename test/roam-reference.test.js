import test from "node:test";
import assert from "node:assert/strict";
import { roamReferenceAutocompleteContext, searchRoamReferenceSuggestions, withCreatePageSuggestion } from "../src/extension.js";

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

const CREATE_ROW = { kind: "roam-create-page", name: "Project Beta", description: "Create page" };
const alpha = { kind: "roam-page", name: "Project Alpha", description: "Page", uid: "pageuid01" };

test("the create-page row is offered last, only for a page opener whose name is new", () => {
  const partial = withCreatePageSuggestion({ type: "page", query: "Project Beta" }, [alpha]);
  assert.deepEqual(partial, [alpha, CREATE_ROW], "a partial match still offers the name being typed, appended last");

  assert.deepEqual(
    withCreatePageSuggestion({ type: "page", query: "Project Beta" }, []),
    [CREATE_ROW],
    "zero hits is the dead end this closes — a new page name used to produce nothing at all",
  );

  const exact = { kind: "roam-page", name: "  Project Beta ", description: "Page", uid: "pageuid02" };
  assert.deepEqual(withCreatePageSuggestion({ type: "page", query: " project beta " }, [alpha, exact]), [alpha, exact],
    "an exact title match, compared trimmed and case-folded, needs no create row");

  assert.deepEqual(withCreatePageSuggestion({ type: "block", query: "Project Beta" }, []), [],
    "(( never offers to create a page");
  assert.deepEqual(withCreatePageSuggestion({ type: "page", query: "" }, [alpha]), [alpha]);
  assert.deepEqual(withCreatePageSuggestion({ type: "page", query: "   " }, [alpha]), [alpha],
    "a whitespace-only query is an empty query");
  assert.deepEqual(withCreatePageSuggestion(null, [alpha]), [alpha]);

  assert.deepEqual(withCreatePageSuggestion({ type: "page", query: "Project Beta" }, partial), partial,
    "applying it twice cannot produce two create rows");

  const source = [alpha];
  withCreatePageSuggestion({ type: "page", query: "Project Beta" }, source);
  assert.deepEqual(source, [alpha], "the caller's result array is never mutated");
});
