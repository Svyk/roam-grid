import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rememberAcceptedPage,
  resetRoamRecents,
  searchRoamRecentSuggestions,
} from "../src/extension.js";

// GOAL-U4: the recents pipeline sees every page / every recent block in the graph. These tests
// push a big-graph-sized result set through it and pin both the algorithm shape (one Map pass,
// one sort, one Number read per surviving row — no quadratic re-scan) and a generous wall-clock
// ceiling as a backstop, then statically pin the budget semantics so an edit that removes the
// re-arm or the cache-hit bypass fails loudly instead of silently degrading big graphs.

const PAGE_ROWS = 20_000;
const BLOCK_ROWS = 30_000;
const CLOCK_CEILING_MS = 1000; // CI-safe backstop; the algorithmic assertions above are the real guard

function stubApi(rowsByQuery) {
  return {
    q: (query) => {
      if (/:node\/title/.test(query)) return rowsByQuery.page || [];
      if (/edit\/time/.test(query)) return rowsByQuery.block || [];
      return [];
    },
  };
}

/** A time value whose every Number() read is counted — one read per surviving row is the proof
 *  the pipeline is a single pass, because a quadratic re-scan would multiply the count. */
function countedTime(state, value) {
  return { valueOf: () => { state.timeReads += 1; return value; } };
}

/** Counts Array.prototype.sort invocations (and the lengths sorted) for the life of one test. */
function countSorts(t, state) {
  const original = Array.prototype.sort;
  Array.prototype.sort = function (...args) {
    state.sorts.push(this.length);
    return original.apply(this, args);
  };
  t.after(() => { Array.prototype.sort = original; });
}

function makePageRows(state) {
  const rows = [["Accepted Page", "pgaccepted", countedTime(state, 50_000)]];
  for (let i = 0; i < 17_999; i += 1) rows.push([`Page ${i}`, `pg${i}`, countedTime(state, i)]);
  // Duplicate titles exercise the Map dedupe; their times stay far below the top ranks.
  for (let i = 0; i < 2_000; i += 1) rows.push(["Dupe Page", "pgdupe", countedTime(state, i)]);
  assert.equal(rows.length, PAGE_ROWS);
  return rows;
}

function makeBlockRows(state, excludeUids) {
  const rows = [];
  for (let i = 0; i < 29_000; i += 1) {
    // Every 1000th label carries raw newlines and runs of spaces, as real block strings do.
    const label = i % 1000 === 0 ? `block\ntext   ${i}` : `block text ${i}`;
    rows.push([`bk${i}`, label, countedTime(state, i)]);
  }
  for (let i = 0; i < 500; i += 1) rows.push([`bex${i}`, "excluded block", countedTime(state, 99_999 + i)]);
  for (let i = 0; i < 500; i += 1) rows.push([`bempty${i}`, "   ", countedTime(state, 199_999 + i)]);
  for (const row of rows) if (row[0].startsWith("bex")) excludeUids.add(row[0]);
  assert.equal(rows.length, BLOCK_ROWS);
  return rows;
}

test("big-graph page pipeline: 20k rows, one Map pass, one sort, promoted page first", async (t) => {
  resetRoamRecents();
  t.after(() => resetRoamRecents());
  const state = { timeReads: 0, sorts: [] };
  countSorts(t, state);
  const api = stubApi({ page: makePageRows(state) });
  rememberAcceptedPage("Accepted Page");

  const started = performance.now();
  const results = await searchRoamRecentSuggestions({ type: "page", query: "" }, { api, limit: 20, now: 1_000_000 });
  const elapsed = performance.now() - started;

  assert.equal(state.timeReads, PAGE_ROWS, "every row's time is read exactly once — a single linear pass");
  assert.deepEqual(state.sorts, [18_000], "one sort over the deduped titles (18,001 unique minus the promoted one)");
  assert.equal(results.length, 20);
  assert.equal(results[0].name, "Accepted Page", "the accepted-page LRU promotes ahead of graph recency");
  assert.equal(results[1].uid, "pg17998", "then strict recency order from the top");
  assert.equal(results[2].uid, "pg17997");
  assert.ok(elapsed < CLOCK_CEILING_MS, `20k page rows through the pipeline took ${elapsed.toFixed(1)}ms`);
});

test("big-graph block pipeline: 30k rows, exclusions and empties filtered before the time read", async (t) => {
  resetRoamRecents();
  t.after(() => resetRoamRecents());
  const state = { timeReads: 0, sorts: [] };
  countSorts(t, state);
  const excludeUids = new Set();
  const api = stubApi({ block: makeBlockRows(state, excludeUids) });

  const started = performance.now();
  const results = await searchRoamRecentSuggestions({ type: "block", query: "" }, { api, limit: 20, excludeUids, now: 1_000_000 });
  const elapsed = performance.now() - started;

  assert.equal(state.timeReads, 29_000, "excluded and empty rows never reach the time read");
  assert.deepEqual(state.sorts, [29_000], "one sort over the surviving entries");
  assert.equal(results.length, 20);
  assert.equal(results[0].uid, "bk28999", "strict recency order from the top");
  assert.equal(results[1].uid, "bk28998");
  assert.ok(results.every((row) => !excludeUids.has(row.uid)), "the caller's own cells never appear");
  assert.ok(results.every((row) => !/\n|  /.test(row.name)), "labels are whitespace-normalized");
  assert.ok(elapsed < CLOCK_CEILING_MS, `30k block rows through the pipeline took ${elapsed.toFixed(1)}ms`);
});

// Static guard: pins the budget SEMANTICS in source, so a future edit that re-introduces
// session-permanent disarm, drops the re-arm, or gates cache hits fails here — loudly and by
// name — rather than eroding headroom silently. Behavior itself lives in recents-budget.test.js.
test("budget semantics are pinned in source: consecutive disarm, re-arm, cache-hit bypass", () => {
  const source = readFileSync(new URL("../src/extension.js", import.meta.url), "utf8");
  const pins = [
    ["250ms budget constant", /const RECENTS_BUDGET_MS = 250;/],
    ["60s cache TTL constant", /const RECENTS_TTL_MS = 60000;/],
    ["7d recent-block window constant", /const RECENT_BLOCK_WINDOW_MS = 7 \* 24 \* 60 \* 60 \* 1000;/],
    ["disarm threshold of 2 consecutive overruns", /const RECENTS_DISARM_OVERRUNS = 2;/],
    ["disarm requires the consecutive-overrun threshold", /runtime\.recentsOverruns >= RECENTS_DISARM_OVERRUNS/],
    ["background warms never count toward the streak", /\} else if \(!background\) \{/],
    ["an under-budget fetch resets the streak", /runtime\.recentsOverruns = 0;/],
    ["a re-arm path exists", /runtime\.recentsDisabled = false;/],
    ["the re-arm is timestamped for the diag ledger", /runtime\.recentsRearmedAt = Date\.now\(\);/],
    ["the disarm decision is mirrored to __rgDiag", /recentsBudget = \{ disarmed: runtime\.recentsDisabled/],
    ["the gate lets a fresh cache open armed or not", /if \(recentsDisabled\(\) && !recentsCacheReady\(context\.type, now\)\) return \[\];/],
    ["readRecentRows bypasses the query on a fresh cache", /if \(!force && cached && now - cached\.at < RECENTS_TTL_MS\) return cached\.rows;/],
  ];
  for (const [name, pattern] of pins) assert.match(source, pattern, `missing budget semantic: ${name}`);
});
