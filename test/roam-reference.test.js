import test from "node:test";
import assert from "node:assert/strict";
import { ROAM_COMMAND_CATALOG, ROAM_COMPONENT_CATALOG, enrichRoamSuggestions, exactBlockSuggestion, roamCommandInsertion, roamCommandSuggestions, roamComponentInsertion, roamComponentSuggestions, roamEditorTriggerContext, roamSuggestionPlainText, roamTriggerInsertion, searchRoamReferenceSuggestions, withCreatePageSuggestion } from "../src/extension.js";

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

/**
 * The unit this whole enrichment design exists for. At the default limit of eight rows and a 90 ms
 * debounce, one query per ROW would be up to twenty datalog queries per settled keystroke; one query
 * per SET is one, whatever the row count. That is what this asserts, and it is the assertion the
 * per-row positive control is aimed at.
 */
test("enrichment is one batched query per result set, never one per row", async () => {
  const calls = [];
  const api = { q: (query, keys) => { calls.push({ query, keys }); return keys.map((uid, index) => [uid, `Owning Page ${index}`]); } };
  const rows = Array.from({ length: 8 }, (whole, index) => ({ kind: "roam-block", name: `block ${index}`, description: `Block · blkrow000${index}`, uid: `blkrow000${index}` }));

  const enriched = await enrichRoamSuggestions(rows, { api, limit: 8 });
  assert.equal(calls.length, 1, "eight rows, one query — a per-row implementation would issue eight");
  assert.deepEqual(calls[0].keys, rows.map((row) => row.uid), "and the whole set goes in as one input binding");
  assert.deepEqual(enriched.map((row) => row.breadcrumb), rows.map((whole, index) => `Owning Page ${index}`));
  assert.deepEqual(rows.map((row) => row.breadcrumb), rows.map(() => undefined), "the caller's rows are never mutated");
});

test("counts land on page rows, breadcrumbs on block rows, and unanswered rows come back untouched", async () => {
  const pageCalls = [];
  const quiet = { kind: "roam-page", name: "Quiet Page", description: "Page", uid: "pagequiet" };
  const pageApi = { q: (query, keys) => { pageCalls.push({ query, keys }); return [["Project Alpha", 12]]; } };
  const pages = await enrichRoamSuggestions([alpha, quiet, CREATE_ROW], { api: pageApi, limit: 8 });
  assert.equal(pageCalls.length, 1);
  assert.match(pageCalls[0].query, /\(count \?r\)/, "a page row is enriched with its linked-reference count");
  assert.deepEqual(pageCalls[0].keys, ["Project Alpha", "Quiet Page"], "a create-page row names a page that does not exist yet, so it is never keyed");
  assert.equal(pages[0].referenceCount, 12);
  assert.equal("referenceCount" in pages[1], false, "a page with no references gets no badge rather than a zero");
  assert.equal(pages[2], CREATE_ROW, "and a row the query cannot answer for comes back as the object it went in as");
  assert.equal(pages[1], quiet);

  const blockCalls = [];
  const first = { kind: "roam-block", name: "first block", description: "Block · blkfirst01", uid: "blkfirst01" };
  const orphan = { kind: "roam-block", name: "orphan block", description: "Block · blkorphan1", uid: "blkorphan1" };
  const blockApi = { q: (query, keys) => { blockCalls.push({ query, keys }); return [["blkfirst01", "Owning Page"]]; } };
  const blocks = await enrichRoamSuggestions([first, orphan], { api: blockApi, limit: 8 });
  assert.equal(blockCalls.length, 1);
  assert.match(blockCalls[0].query, /:block\/page/, "a block row is enriched with the page that owns it");
  assert.equal(blocks[0].breadcrumb, "Owning Page");
  assert.equal(blocks[1], orphan);
  assert.equal("referenceCount" in blocks[0], false, "a block row carries a breadcrumb, not a count");
});

test("enrichment bounds its input, skips a set it has nothing to key, and survives a failing query", async () => {
  let calls = 0;
  const counting = { q: () => { calls += 1; return []; } };
  assert.deepEqual(await enrichRoamSuggestions([], { api: counting }), []);
  assert.deepEqual(await enrichRoamSuggestions([CREATE_ROW], { api: counting }), [CREATE_ROW]);
  assert.equal(calls, 0, "no keys means no query at all, not a query over an empty binding");
  assert.deepEqual(await enrichRoamSuggestions([alpha], { api: {} }), [alpha], "and a graph with no q is simply an unenriched menu");

  const seen = [];
  const many = Array.from({ length: 40 }, (whole, index) => ({ kind: "roam-block", name: `b${index}`, uid: `blk${String(index).padStart(6, "0")}` }));
  await enrichRoamSuggestions([...many, many[0]], { api: { q: (query, keys) => { seen.push(keys); return []; } }, limit: 500 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].length, 20, "the input binding is capped at the same twenty that bounds the search");
  assert.equal(new Set(seen[0]).size, 20, "and deduplicated, so a repeated row cannot widen it");

  const warn = console.warn; const warns = [];
  console.warn = (message) => warns.push(message);
  const failing = { q: () => { throw new Error("datalog"); } };
  assert.deepEqual(await enrichRoamSuggestions([alpha], { api: failing }), [alpha], "a failed enrichment leaves the menu exactly as it was");
  console.warn = warn;
  assert.equal(warns.length, 1);
});

/**
 * The paste-a-uid case. `data.search` matches block TEXT, so before this a pasted nine-character uid
 * searched for its own characters and found nothing — the block it names was never a candidate.
 */
test("a uid-shaped (( query also pulls the exact block and puts it first", async () => {
  const pulls = [];
  const searched = [{ ":block/string": "mentions abc-12_XY in passing", ":block/uid": "blkother1" }];
  const makeApi = (hit) => ({
    data: { search: () => searched },
    pull: (pattern, eid) => { pulls.push({ pattern, eid }); return hit; },
  });

  const hits = await searchRoamReferenceSuggestions({ type: "block", query: "abc-12_XY" }, 8, makeApi({ ":block/string": "  the pasted   block ", ":block/uid": "abc-12_XY" }));
  assert.deepEqual(pulls, [{ pattern: "[:block/string :block/uid]", eid: [":block/uid", "abc-12_XY"] }], "one pull, on the uid index");
  assert.deepEqual(hits, [
    { kind: "roam-block", name: "the pasted block", description: "Exact block · abc-12_XY", uid: "abc-12_XY" },
    { kind: "roam-block", name: "mentions abc-12_XY in passing", description: "Block · blkother1", uid: "blkother1" },
  ], "the exact block leads, and the text search's own hits follow it");

  pulls.length = 0;
  const miss = await searchRoamReferenceSuggestions({ type: "block", query: "abc-12_XY" }, 8, makeApi(null));
  assert.equal(pulls.length, 1);
  assert.deepEqual(miss.map((row) => row.uid), ["blkother1"], "a uid Roam does not know changes nothing");

  pulls.length = 0;
  const duplicated = await searchRoamReferenceSuggestions({ type: "block", query: "blkother1" }, 8, makeApi({ ":block/string": "mentions abc-12_XY in passing", ":block/uid": "blkother1" }));
  assert.deepEqual(duplicated.map((row) => row.description), ["Exact block · blkother1"], "a block the text search also found is promoted, not listed twice");
});

test("only a uid-shaped block query issues a pull at all", async () => {
  const pulls = [];
  const api = { data: { search: () => [] }, pull: (pattern, eid) => { pulls.push(eid); return null; } };
  for (const context of [
    { type: "block", query: "abc" },
    { type: "block", query: "abcdefghij" },
    { type: "block", query: "abc 12_XY" },
    { type: "block", query: "abc.12_XY" },
    { type: "page", query: "abc-12_XY" },
    { type: "tag", query: "abc-12_XY" },
  ]) await searchRoamReferenceSuggestions(context, 8, api);
  assert.deepEqual(pulls, [], "a query that is not Roam's uid shape, or is not a block opener, pulls nothing");

  assert.equal(exactBlockSuggestion({ type: "block", query: "abc-12_XY" }, {}), null, "and a graph with no pull simply offers no exact row");
  assert.equal(exactBlockSuggestion(null, api), null);
  assert.deepEqual(pulls, []);
});

/**
 * `[label]([[Page]])` — a `[[` opened directly after `](` is filling in an alias TARGET. The existing
 * `replaceEndIndex` logic already stops at the page closer and leaves the alias's `)` alone; the flag
 * is what lets the row list say which of the two the user is in.
 */
test("a [[ opened inside an alias target is flagged, and the ) is not swallowed", () => {
  const open = roamEditorTriggerContext("[label]([[Proj", 14);
  assert.equal(open.type, "page");
  assert.equal(open.aliasTarget, true);
  assert.equal(open.startIndex, 8, "the replacement starts at the [[, not at the alias's own [");
  assert.equal(open.query, "Proj");
  assert.equal(open.replaceEndIndex, 14, "with no closer typed yet the replacement stops at the caret, well short of any )");

  const closed = roamEditorTriggerContext("[label]([[Proj]])", 14);
  assert.equal(closed.aliasTarget, true);
  assert.equal(closed.replaceEndIndex, 16, "an existing ]] is swallowed; the ) that follows it is not");

  assert.equal(roamEditorTriggerContext("See [[Proj", 10).aliasTarget, undefined, "an ordinary page trigger carries no flag at all");
  assert.equal(roamEditorTriggerContext("[[Proj", 6).aliasTarget, undefined, "and neither does one with no room for a ]( in front of it");
  assert.equal(roamEditorTriggerContext("](((uid", 7).aliasTarget, undefined, "a block opener after ]( is not an alias target — Roam aliases point at pages");
  assert.equal(roamEditorTriggerContext("](((uid", 7).type, "block");
});

/**
 * The caret offset is the whole substance of a catalog entry: a template inserted with the caret
 * past `}}` is worse than typing the component by hand. Rather than restating the sixteen numbers —
 * which would only mirror the source — this simulates the gesture: split the template at its own
 * offset, type a character there, and require the result to still be one well-formed component with
 * the typed character INSIDE its braces and after the component's own name.
 */
test("every catalog entry leaves the caret inside its braces, ready for what is typed next", () => {
  assert.equal(ROAM_COMPONENT_CATALOG.length, 16);
  for (const entry of ROAM_COMPONENT_CATALOG) {
    const { template, caret, name } = entry;
    const typed = `${template.slice(0, caret)}X${template.slice(caret)}`;
    assert.ok(caret >= 0 && caret <= template.length, `${name}: the offset is inside its own template`);
    assert.ok(template.startsWith("{{") && template.endsWith("}}"), `${name}: the template is a component`);
    assert.ok(template.includes(name), `${name}: the template names the component it inserts`);
    assert.ok(/^\{\{.*\}\}$|^\{\{.*\}\}X$/.test(typed), `${name}: typing at the offset cannot break the braces`);
    const tail = template.slice(caret);
    assert.ok(/^\}*$/.test(tail), `${name}: nothing but closing braces may follow the caret — ${JSON.stringify(tail)}`);
    if (tail) {
      assert.ok(typed.endsWith(tail), `${name}: what is typed stays inside the braces`);
      assert.ok(template.slice(0, caret).endsWith(": ") || template.slice(0, caret).endsWith(" "),
        `${name}: an argument component parks the caret after its separator`);
    } else {
      assert.equal(typed, `${template}X`, `${name}: a component with no argument parks the caret at the end`);
    }
    assert.ok(entry.description.length <= 26, `${name}: the detail track ellipsizes past 26ch — ${entry.description}`);
  }

  const query = ROAM_COMPONENT_CATALOG.find((entry) => entry.name === "query");
  assert.equal(`${query.template.slice(0, query.caret)}{and: [[A]]}${query.template.slice(query.caret)}`.length, query.template.length + 12);
  assert.equal(`${query.template.slice(0, query.caret)}[[A]]${query.template.slice(query.caret)}`, "{{[[query]]: {and: [[A]]}}}");
  const todo = ROAM_COMPONENT_CATALOG.find((entry) => entry.name === "TODO");
  assert.equal(`${todo.template.slice(0, todo.caret)} buy milk`, "{{[[TODO]]}} buy milk");
});

/** Roam renders a cell through `renderString`, which carries no block uid, so a component that reads
 *  its own block or its children cannot work there. The rows say so rather than letting the grid
 *  take the blame. Verified live on 2026-08-06 through that same call — see the catalog comment. */
test("components that misbehave inside a grid cell say so in their own row", () => {
  const described = (name) => ROAM_COMPONENT_CATALOG.find((entry) => entry.name === name).description;
  assert.equal(described("kanban"), "Needs child bullets");
  assert.equal(described("mermaid"), "Needs child bullets");
  assert.equal(described("attr-table"), "Does not render in a cell");
  assert.equal(described("word-count"), "Fails to render in a cell");
  assert.equal(described("diagram"), "Fails to render in a cell");
  assert.equal(described("TODO"), "Checkbox", "a component that works carries no warning it does not deserve");
  assert.equal(described("calc"), "Inline calculation");
});

test("the component catalog filters on what was typed, prefix first, and bounds itself", () => {
  const names = (query, limit) => roamComponentSuggestions(query, limit).map((row) => row.name);
  assert.deepEqual(names("", 100), ROAM_COMPONENT_CATALOG.map((entry) => entry.name), "a bare {{ offers the whole catalog — there is no query to run");
  assert.deepEqual(names("", 3), ["TODO", "DONE", "query"], "and the results setting bounds it");
  // `e` is the discriminator: `query` comes before `embed` in the catalog and only `embed` starts
  // with it, so catalog order alone would put `query` first. `ta` cannot tell the two rules apart.
  assert.deepEqual(names("e", 100), ["embed", "DONE", "query", "mentions", "slider", "video", "table", "attr-table", "mermaid", "roam/render"],
    "a name that starts with the query leads one that merely contains it, and catalog order breaks both ties");
  assert.deepEqual(names("ta", 100), ["table", "attr-table"]);
  assert.deepEqual(names("QUER", 100), ["query"], "matching is case-insensitive");
  assert.deepEqual(names("todo", 100), ["TODO"]);
  assert.deepEqual(names("  calc  ", 100), ["calc"], "a query is trimmed the same way every other trigger trims it");
  assert.deepEqual(names("count", 100), ["word-count"]);
  assert.deepEqual(names("roam/", 100), ["roam/render"]);
  assert.deepEqual(names("zzz", 100), []);
  assert.deepEqual(names("[[query]]: {and: ", 100), [], "the query typed after an accepted component matches nothing, so the menu stays shut");

  const row = roamComponentSuggestions("kan", 8)[0];
  assert.deepEqual(row, { kind: "roam-component", name: "kanban", description: "Needs child bullets", template: "{{[[kanban]]}}", caret: 14 });
  assert.equal(roamTriggerInsertion("component", row), "{{[[kanban]]}}", "the generic insertion path returns the template unchanged");
  assert.deepEqual(roamComponentInsertion(row), { text: "{{[[kanban]]}}", caret: 14 });
  assert.deepEqual(roamComponentInsertion({ template: "{{x}}" }), { text: "{{x}}", caret: 5 }, "an entry with no offset parks the caret at the end rather than at zero");
  assert.deepEqual(roamComponentInsertion({ template: "{{x}}", caret: 900 }), { text: "{{x}}", caret: 5 }, "and an offset past the template is clamped into it");
  assert.deepEqual(roamComponentInsertion(null), { text: "", caret: 0 });
});

/**
 * Two thirds of Roam's own commands have a space in their name, so a `/` query that dies on the
 * first space can never reach `Block Quote` or `Current Time`. It is loosened to interior single
 * spaces, and the guard moves to the shape of the run instead: a LEADING space is prose (`in / out`
 * is a slash between two words, not a command), so is a double space, and so is anything longer
 * than Roam's longest command name.
 */
test("a command query carries the spaces its own names need, and nothing longer", () => {
  assert.equal(roamEditorTriggerContext("/block quote", 12).query, "block quote", "a name Roam spells with a space is reachable");
  assert.equal(roamEditorTriggerContext("/Mentions of Page or Block", 26).query, "Mentions of Page or Block");
  assert.equal(roamEditorTriggerContext("note /current time", 18).query, "current time");

  assert.equal(roamEditorTriggerContext("input / output", 14), null, "a space straight after the slash is prose, not a query");
  assert.equal(roamEditorTriggerContext("/ ", 2), null);
  assert.equal(roamEditorTriggerContext("/block  quote", 13), null, "and so is a double space");
  assert.equal(roamEditorTriggerContext("/see [[Page", 11).type, "page", "a bracket inside a command query hands the trigger to the page opener");
  assert.equal(roamEditorTriggerContext(`/${"a".repeat(32)}`, 33).query.length, 32, "Roam's longest command name still fits");
  assert.equal(roamEditorTriggerContext(`/${"a".repeat(33)}`, 34), null, "one character more cannot be a command name");

  assert.equal(roamEditorTriggerContext("a/b", 3), null, "the start-or-whitespace rule is untouched");
  assert.equal(roamEditorTriggerContext("=A1/B2", 6), null, "and so is the formula guard");
  assert.equal(roamEditorTriggerContext("=A1 /B2", 7), null);
});

/**
 * The subset IS the feature. Every name here is one Roam's own `/` registry carries — read out of it
 * rather than guessed — and the rows Roam has but a cell cannot honour are absent rather than present
 * and failing. This test pins both halves, because a catalog that quietly grows a row Roam does not
 * have, or quietly regains one that renders "Failed to render" in a cell, has broken the claim the
 * setting description makes.
 */
test("the command catalog is a subset of Roam's own, and says so by what it leaves out", () => {
  assert.equal(ROAM_COMMAND_CATALOG.length, 21, "21 of the 47 commands Roam's registry carries");
  const names = new Set(ROAM_COMMAND_CATALOG.map((entry) => entry.name));
  // Verified live on 2026-08-06 against Roam's slash-menu registry: these are simply not commands.
  for (const absent of ["Horizontal Rule", "DONE", "Italic", "attr-table", "roam/render"]) {
    assert.equal(names.has(absent), false, `${absent} is not a Roam command, so it must not be a row`);
  }
  // Verified live through renderString, the call a cell renders with: block-bound output.
  for (const absent of ["Word Count", "Diagram", "Kanban Board", "Mermaid", "Character Count"]) {
    assert.equal(names.has(absent), false, `${absent} cannot render in a cell, so it must not be a row`);
  }
  // And the modal ones, which are what "do not fake the unreachable" was written about.
  for (const absent of ["Date Picker", "Upload Image, Audio, or File", "Template", "Query (and)"]) {
    assert.equal(names.has(absent), false, `${absent} needs a Roam dialog, so it must not be a row`);
  }
  assert.equal(names.has("Italics"), true, "Roam spells it Italics, and the row uses Roam's spelling");
  assert.equal(ROAM_COMMAND_CATALOG.find((entry) => entry.name === "Block Quote").template, "[[>]] ", "Roam's blockquote is [[>]], not >");
  assert.equal(ROAM_COMMAND_CATALOG.find((entry) => entry.name === "Pomodoro Timer").template, "{{[[POMO]]: 25}}", "POMO is uppercase and carries its minutes");
  for (const entry of ROAM_COMMAND_CATALOG) {
    assert.ok(entry.description.length <= 26, `${entry.name}: the detail track ellipsizes past 26ch — ${entry.description}`);
    assert.ok(entry.template != null || entry.dynamic, `${entry.name}: a row resolves to text or it is not a row`);
  }
});

/**
 * The caret offset simulated as the gesture, the way the component catalog does it: split the
 * resolved text at its own offset, type there, and require what was typed to land where the row
 * promised. The chaining half is the same assertion read through the trigger parser — a row that
 * claims to open a picker has to actually leave the caret somewhere the parser calls one.
 */
test("every command lands its caret where the next keystroke belongs, and the picker rows open a picker", () => {
  const api = { util: { dateToPageTitle: () => "August 6th, 2026" } };
  const chains = { "Page Reference": "page", "Block Reference": "block", "Block Embed": "block", "Mentions of Page or Block": "page", "Inline Calculator": "block" };
  for (const entry of ROAM_COMMAND_CATALOG) {
    const placed = roamCommandInsertion(entry, { now: new Date(2026, 7, 6, 9, 5), api });
    assert.ok(placed, `${entry.name}: resolves`);
    assert.ok(placed.caret >= 0 && placed.caret <= placed.text.length, `${entry.name}: the offset is inside its own text`);
    const type = roamEditorTriggerContext(placed.text, placed.caret)?.type ?? null;
    if (chains[entry.name]) assert.equal(type, chains[entry.name], `${entry.name}: the caret lands inside a ${chains[entry.name]} opener`);
    else assert.notEqual(type, "page", `${entry.name}: a row that does not claim a picker must not open one`);
    if (!chains[entry.name]) assert.notEqual(type, "block", `${entry.name}: nor a block picker`);
  }

  const typed = (name) => { const placed = roamCommandInsertion(ROAM_COMMAND_CATALOG.find((entry) => entry.name === name), { api }); return `${placed.text.slice(0, placed.caret)}X${placed.text.slice(placed.caret)}`; };
  assert.equal(typed("Bold"), "**X**", "a wrapping pair parks the caret at its midpoint, as Roam's own rule does");
  assert.equal(typed("Italics"), "__X__");
  assert.equal(typed("Highlight"), "^^X^^");
  assert.equal(typed("Strikethrough"), "~~X~~");
  assert.equal(typed("Code Inline"), "`X`");
  assert.equal(typed("Code Block"), "```javascript\nX\n```", "the fenced block opens on the line the code goes on");
  assert.equal(typed("Embed Video"), "{{[[video]]: X}}");
  assert.equal(typed("Block Embed"), "{{[[embed]]: ((X))}}");
  assert.equal(typed("TODO"), "{{[[TODO]]}}X", "a row with nothing left to fill in parks the caret at the end");
  assert.equal(typed("Block Quote"), "[[>]] X");
});

/**
 * The one thing in this unit that could write a reference to a page that does not exist. Roam's
 * daily-page title is Roam's format to produce — `dateToPageTitle` returned "August 6th, 2026" live
 * on 2026-08-06 — and a hand-rolled ordinal suffix that is off by one gives a link to nowhere. So
 * the day rows use that call verbatim and, when it is missing, are not offered at all.
 */
test("the day commands take their title from Roam, and vanish when Roam cannot give one", () => {
  const now = new Date(2026, 7, 6, 9, 5);
  const api = { util: { dateToPageTitle: (date) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "August"][date.getMonth()]} ${date.getDate()}th, ${date.getFullYear()}` } };
  const insert = (name) => roamCommandInsertion(ROAM_COMMAND_CATALOG.find((entry) => entry.name === name), { now, api }).text;
  assert.equal(insert("Today"), "[[August 6th, 2026]]", "the title is whatever Roam formatted, wrapped and nothing else");
  assert.equal(insert("Tomorrow"), "[[August 7th, 2026]]");
  assert.equal(insert("Yesterday"), "[[August 5th, 2026]]");
  assert.equal(insert("Current Time"), "09:05", "and the clock is zero-padded 24-hour, as Roam's own is");
  assert.equal(roamCommandInsertion({ dynamic: "time" }, { now: new Date(2026, 7, 6, 18, 0) }).text, "18:00");

  const offered = (options) => roamCommandSuggestions("", { limit: 100, ...options }).map((row) => row.name);
  assert.equal(offered({ api }).includes("Today"), true);
  assert.equal(offered({ api: {} }).includes("Today"), false, "no dateToPageTitle, no day rows — never a guessed format");
  assert.deepEqual(offered({ api: {} }).filter((name) => ["Today", "Tomorrow", "Yesterday"].includes(name)), []);
  assert.equal(offered({ api: { util: { dateToPageTitle: () => "" } } }).includes("Today"), false, "an empty title is no title");
  assert.equal(offered({ api: {} }).includes("Current Time"), true, "a clock needs nothing from Roam, so it stays");
  assert.equal(roamCommandInsertion({ dynamic: "day", offset: 0 }, { api: {} }), null);
});

test("the command catalog filters on what was typed, prefix first, and bounds itself", () => {
  const api = { util: { dateToPageTitle: () => "August 6th, 2026" } };
  const names = (query, limit = 100) => roamCommandSuggestions(query, { limit, api }).map((row) => row.name);
  assert.deepEqual(names(""), ROAM_COMMAND_CATALOG.map((entry) => entry.name), "a bare / offers the whole catalog — there is no query to run");
  assert.deepEqual(names("", 3), ["TODO", "Page Reference", "Block Reference"], "and the results setting bounds it");
  assert.deepEqual(names("block"), ["Block Reference", "Block Embed", "Block Quote", "Mentions of Page or Block", "Code Block"],
    "a name that starts with the query leads one that merely contains it, and catalog order breaks both ties");
  assert.deepEqual(names("BOLD"), ["Bold"], "matching is case-insensitive");
  assert.deepEqual(names("current time"), ["Current Time"], "a name Roam spells with a space matches when it is typed with one");
  assert.deepEqual(names("  today  "), ["Today"], "a query is trimmed the same way every other trigger trims it");
  assert.deepEqual(names("video"), ["Embed Video"]);
  assert.deepEqual(names("zzz"), []);

  const row = roamCommandSuggestions("bold", { api })[0];
  assert.deepEqual(row, { kind: "roam-command", name: "Bold", template: "****", caret: 2, description: "Bold text" });
  assert.deepEqual(roamCommandInsertion(row), { text: "****", caret: 2 });
  assert.deepEqual(roamCommandInsertion({ template: "{{x}}" }), { text: "{{x}}", caret: 5 }, "an entry with no offset parks the caret at the end rather than at zero");
  assert.deepEqual(roamCommandInsertion({ template: "{{x}}", caret: 900 }), { text: "{{x}}", caret: 5 }, "and an offset past the template is clamped into it");
  assert.equal(roamCommandInsertion(null), null, "a row that resolves to nothing inserts nothing");
});

/**
 * The text every suggestion row carries from its first frame, and the permanent fallback wherever
 * `renderString` is unavailable or fails. Pure by design: no DOM, no Roam, no controller.
 */
test("the suggestion normalizer strips each markdown form Roam would have rendered", () => {
  assert.equal(roamSuggestionPlainText("[[Project Alpha]] status"), "Project Alpha status");
  assert.equal(roamSuggestionPlainText("#[[Long Name]] and [[Short]]"), "Long Name and Short");
  assert.equal(roamSuggestionPlainText("#ctx/computer done"), "ctx/computer done");
  assert.equal(roamSuggestionPlainText("a #tag mid-sentence"), "a tag mid-sentence");
  assert.equal(roamSuggestionPlainText("**bold** __italic__ ^^highlight^^ ~~struck~~ `code`"), "bold italic highlight struck code");
  assert.equal(roamSuggestionPlainText("see [the docs](https://example.test/a) now"), "see the docs now");
  assert.equal(roamSuggestionPlainText("![](https://example.test/a.png)"), "image", "an image with no alt text still says something");
  assert.equal(roamSuggestionPlainText("![a chart](https://example.test/a.png)"), "a chart");
  assert.equal(roamSuggestionPlainText("[label]([[Aliased Page]])"), "label", "an alias shows its label, not its target");
  assert.equal(roamSuggestionPlainText("see ((abc-12_XY)) here"), "see (block) here",
    "a block ref cannot be resolved without a graph read, so it collapses instead of showing a uid");
  assert.equal(roamSuggestionPlainText("first\n\n   second\tthird"), "first second third");
  assert.equal(roamSuggestionPlainText("   "), "");
  assert.equal(roamSuggestionPlainText(null), "");
  assert.equal(roamSuggestionPlainText(undefined), "");
  assert.equal(roamSuggestionPlainText("Status:: Active"), "Status:: Active",
    "an attribute is content, not markup — it renders as itself");
  assert.equal(roamSuggestionPlainText("plain sentence"), "plain sentence");
  assert.equal(roamSuggestionPlainText("{{[[TODO]]}} write it up"), "{{TODO}} write it up");
});
