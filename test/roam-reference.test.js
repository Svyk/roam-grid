import test from "node:test";
import assert from "node:assert/strict";
import { roamEditorTriggerContext, roamTriggerInsertion, searchRoamReferenceSuggestions, withCreatePageSuggestion } from "../src/extension.js";

test("the trigger context resolves six types against the nearest unclosed opener", () => {
  assert.deepEqual(roamEditorTriggerContext("See [[Proj", 10), {
    type: "page", query: "Proj", startIndex: 4, queryStart: 6, endIndex: 10, replaceEndIndex: 10, opener: "[[", closer: "]]",
  });
  const blockSource = "[[closed]] then ((uid";
  assert.deepEqual(roamEditorTriggerContext(blockSource, blockSource.length), {
    type: "block", query: "uid", startIndex: 16, queryStart: 18, endIndex: 21, replaceEndIndex: 21, opener: "((", closer: "))",
  }, "the nearest unclosed opener wins, and a closed one is not an opener at all");
  assert.deepEqual(roamEditorTriggerContext("#ctx", 4), {
    type: "tag", query: "ctx", startIndex: 0, queryStart: 1, endIndex: 4, replaceEndIndex: 4, opener: "#", closer: "",
  });
  assert.deepEqual(roamEditorTriggerContext("#[[Long Name", 12), {
    type: "tag-page", query: "Long Name", startIndex: 0, queryStart: 3, endIndex: 12, replaceEndIndex: 12, opener: "#[[", closer: "]]",
  }, "#[[ beats [[ by owning the # in front of it, so the whole trigger is replaced on accept");
  assert.deepEqual(roamEditorTriggerContext("{{tab", 5), {
    type: "component", query: "tab", startIndex: 0, queryStart: 2, endIndex: 5, replaceEndIndex: 5, opener: "{{", closer: "}}",
  });
  assert.deepEqual(roamEditorTriggerContext("/dat", 4), {
    type: "command", query: "dat", startIndex: 0, queryStart: 1, endIndex: 4, replaceEndIndex: 4, opener: "/", closer: "",
  });
  assert.equal(roamEditorTriggerContext("and /dat", 8).startIndex, 4, "whitespace ahead of it is enough, index 0 is not required");

  assert.deepEqual(roamEditorTriggerContext("See [[Proj]]", 10), {
    type: "page", query: "Proj", startIndex: 4, queryStart: 6, endIndex: 10, replaceEndIndex: 12, opener: "[[", closer: "]]",
  }, "an existing closer is swallowed by the replacement rather than duplicated");
  assert.equal(roamEditorTriggerContext("#[[Long Name]]", 12).replaceEndIndex, 14);
  assert.equal(roamEditorTriggerContext("[[closed]]", 10), null);
  assert.equal(roamEditorTriggerContext("[[line\nbreak", 12), null);

  assert.equal(roamEditorTriggerContext("[[a#b", 5).type, "page", "an unclosed bracket owns the # typed inside it");
  assert.equal(roamEditorTriggerContext("[[a/b", 5).type, "page", "and the / too");
  assert.equal(roamEditorTriggerContext("#ctx/work", 9).query, "ctx/work", "a namespaced tag is one tag, not a tag then a command");
  assert.equal(roamEditorTriggerContext("a/b", 3), null, "/ is rejected mid-word");
  assert.equal(roamEditorTriggerContext("and/or shipping", 15), null);
  assert.equal(roamEditorTriggerContext("#a b", 4), null, "a space ends a bare tag");
  assert.equal(roamEditorTriggerContext("#a[", 3), null, "so does a bracket");
  assert.equal(roamEditorTriggerContext("#a]", 3), null);
});

/**
 * Both guards were live bugs the moment the trigger set grew: `=SUM((A1` produced a `block` context
 * because the context function had never been formula-aware, and `=A1/B2` would open a command menu.
 */
test("a formula suppresses every trigger except a page reference inside a string literal", () => {
  assert.equal(roamEditorTriggerContext("=SUM((A1", 8), null, "(( inside a formula is arithmetic, not a block reference");
  assert.equal(roamEditorTriggerContext("=SUM((A1", 8, { formula: true }), null);
  assert.equal(roamEditorTriggerContext("=A1/B2", 6), null, "/ inside a formula is division");
  assert.equal(roamEditorTriggerContext("=A1 /B2", 7), null, "even where the / is whitespace-led");
  assert.equal(roamEditorTriggerContext("A1/B2", 5), null, "and the same division outside a formula is still no command — / must start a word");
  assert.equal(roamEditorTriggerContext("=1+{{x", 6), null);
  assert.equal(roamEditorTriggerContext("=1+#x", 5), null);

  assert.equal(roamEditorTriggerContext('="See [[P', 9).type, "page", "a quoted caret is where a page reference can legally be written");
  assert.equal(roamEditorTriggerContext('="x" & "[[P', 11).query, "P");
  assert.equal(roamEditorTriggerContext('="x" & [[P', 10), null, "outside the string literal it is a syntax error, not a reference");
  assert.equal(roamEditorTriggerContext('="#[[P', 6).type, "tag-page");

  assert.equal(roamEditorTriggerContext("=SUM((A1", 8, { formula: false }).type, "block", "the guard is the formula flag, not the text");
  assert.equal(roamEditorTriggerContext("==[[Proj", 8).type, "page", "== is an escaped literal, never a formula");
});

test("each trigger inserts what Roam itself would write", () => {
  const page = { kind: "roam-page", name: "Project Alpha" };
  const simple = { kind: "roam-page", name: "Simple" };
  assert.equal(roamTriggerInsertion("page", page), "[[Project Alpha]]");
  assert.equal(roamTriggerInsertion("block", { kind: "roam-block", uid: "blockuid1", name: "text" }), "((blockuid1))");
  assert.equal(roamTriggerInsertion("tag", simple), "#Simple");
  assert.equal(roamTriggerInsertion("tag", { kind: "roam-page", name: "ctx/work" }), "#ctx/work", "a namespace stays bare");
  assert.equal(roamTriggerInsertion("tag", { kind: "roam-page", name: "sprint-4" }), "#sprint-4");
  assert.equal(roamTriggerInsertion("tag", page), "#[[Project Alpha]]", "a name Roam cannot read bare is bracketed");
  assert.equal(roamTriggerInsertion("tag", { kind: "roam-page", name: "Q1: goals" }), "#[[Q1: goals]]");
  assert.equal(roamTriggerInsertion("tag-page", simple), "#[[Simple]]", "#[[ keeps its brackets and its #");
  assert.equal(roamTriggerInsertion("tag", { kind: "roam-create-page", name: "Brand New" }), "#[[Brand New]]");
  assert.equal(roamTriggerInsertion("tag", { kind: "roam-block", uid: "blockuid1" }), "((blockuid1))", "a block row is a block row whatever opened it");
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

  const tags = await searchRoamReferenceSuggestions({ type: "tag", query: "proj" }, 8, api);
  const tagPages = await searchRoamReferenceSuggestions({ type: "tag-page", query: "proj" }, 8, api);
  assert.deepEqual(tags, pages, "# reuses the page path verbatim — only detection and insertion differ");
  assert.deepEqual(tagPages, pages);
  assert.equal(calls[2]["search-pages"], true);
  assert.equal(calls[3]["search-pages"], true);
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

  assert.deepEqual(withCreatePageSuggestion({ type: "tag", query: "Project Beta" }, [alpha]), [alpha, CREATE_ROW],
    "# creates a page in Roam exactly as [[ does, so it gets the row too");
  assert.deepEqual(withCreatePageSuggestion({ type: "tag-page", query: "Project Beta" }, []), [CREATE_ROW]);
  assert.deepEqual(withCreatePageSuggestion({ type: "block", query: "Project Beta" }, []), [],
    "(( never offers to create a page");
  assert.deepEqual(withCreatePageSuggestion({ type: "component", query: "Project Beta" }, []), [],
    "and neither does a trigger with no catalog yet");
  assert.deepEqual(withCreatePageSuggestion({ type: "command", query: "Project Beta" }, []), []);
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
