import test from "node:test";
import assert from "node:assert/strict";
import {
  recentsDisabled,
  resetRoamRecents,
  searchRoamRecentSuggestions,
  warmRecentsCache,
} from "../src/extension.js";

/** Counts only the recents queries; anything else Roam-side gets an empty result. */
function installRecentsApi({ pageRows = [["Budget Page", "pagebudget1", 10]], blockRows = [["blkbudget1", "a budget block", 20]] } = {}) {
  const counts = { page: 0, block: 0 };
  globalThis.window = {
    roamAlphaAPI: {
      util: { generateUID: () => "uid000001" },
      q: (query) => {
        if (/:node\/title/.test(query)) { counts.page += 1; return pageRows; }
        if (/edit\/time/.test(query)) { counts.block += 1; return blockRows; }
        return [];
      },
      data: { pull: () => null, page: { create: async () => {} }, block: { create: async () => {}, update: async () => {} } },
    },
  };
  return counts;
}

/** A clock whose every read advances by `step`, so one fetch (two reads) measures exactly `step`. */
function installClock(state) {
  let tick = 0;
  globalThis.performance = { now: () => (tick += state.step) };
}

function captureInfo(state) {
  const original = console.info;
  console.info = (message) => state.infos.push(String(message));
  return original;
}

const SLOW = 500; // over the 250ms budget
const FAST = 10; // under it
const TTL = 61_000; // past RECENTS_TTL_MS, so the next call re-queries
const BARE_PAGE = { type: "page", query: "" };

function saveGlobals() {
  return { window: globalThis.window, performance: globalThis.performance };
}
function restoreGlobals(saved) {
  for (const [key, value] of [["window", saved.window], ["performance", saved.performance]]) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}

function setup(t) {
  const saved = saveGlobals();
  const state = { step: FAST, infos: [] };
  const restoreInfo = captureInfo(state);
  const counts = installRecentsApi();
  installClock(state);
  t.after(() => { console.info = restoreInfo; resetRoamRecents(); restoreGlobals(saved); });
  return { state, counts, api: globalThis.window.roamAlphaAPI };
}

test("one over-budget inline fetch does not disarm; two in a row do, with one console transition", async (t) => {
  const { state, api } = setup(t);
  state.step = SLOW;

  await searchRoamRecentSuggestions(BARE_PAGE, { api, now: 1_000_000 });
  assert.equal(recentsDisabled(), false, "a single slow fetch can be a GC pause — the gate holds");
  assert.equal(state.infos.length, 0);
  assert.equal(globalThis.window.__rgDiag.recentsBudget.overruns, 1);

  await searchRoamRecentSuggestions(BARE_PAGE, { api, now: 1_000_000 + TTL });
  assert.equal(recentsDisabled(), true, "two consecutive over-budget inline fetches disarm");
  assert.equal(state.infos.length, 1, "the disarm transition reports exactly once");
  assert.match(state.infos[0], /over the 250ms budget/);
  const diag = globalThis.window.__rgDiag.recentsBudget;
  assert.deepEqual({ disarmed: diag.disarmed, overruns: diag.overruns, lastMs: diag.lastMs }, { disarmed: true, overruns: 2, lastMs: SLOW });
});

test("alternating slow and fast inline fetches never disarm — any under-budget fetch resets the streak", async (t) => {
  const { state, api } = setup(t);
  let now = 1_000_000;
  for (const step of [SLOW, FAST, SLOW, FAST]) {
    state.step = step;
    await searchRoamRecentSuggestions(BARE_PAGE, { api, now });
    now += TTL; // past the TTL each round, so every fetch really runs
  }
  assert.equal(recentsDisabled(), false);
  assert.equal(state.infos.length, 0, "no transition, no console noise");
  assert.equal(globalThis.window.__rgDiag.recentsBudget.overruns, 0, "the fast fetch reset the streak");
});

test("a disarmed gate blocks a new query but a fresh cache still opens the menu", async (t) => {
  const { state, counts, api } = setup(t);
  state.step = SLOW;
  await searchRoamRecentSuggestions(BARE_PAGE, { api, now: 1_000_000 });
  await searchRoamRecentSuggestions(BARE_PAGE, { api, now: 1_000_000 + TTL });
  assert.equal(recentsDisabled(), true);
  assert.equal(counts.page, 2);

  // Cold cache: the gate applies to the run-the-query decision, so nothing is offered.
  state.step = FAST;
  const blocked = await searchRoamRecentSuggestions(BARE_PAGE, { api, now: 1_000_000 + 2 * TTL });
  assert.deepEqual(blocked, []);
  assert.equal(counts.page, 2, "disarmed means no new recents query runs");

  // Warm the cache behind the gate, then a bare opener is answered from rows already paid for.
  warmRecentsCache({ api, now: 1_000_000 + 3 * TTL, force: true });
  assert.equal(counts.page, 3);
  const hits = await searchRoamRecentSuggestions(BARE_PAGE, { api, now: 1_000_000 + 3 * TTL });
  assert.ok(hits.some((row) => row.kind === "roam-page" && row.name === "Budget Page"), "cached recents open armed or not");
  assert.equal(counts.page, 3, "a cache hit issues no query");
});

test("an under-budget fetch re-arms a disarmed gate, once, and a later warm does not report again", async (t) => {
  const { state, api } = setup(t);
  state.step = SLOW;
  await searchRoamRecentSuggestions(BARE_PAGE, { api, now: 1_000_000 });
  await searchRoamRecentSuggestions(BARE_PAGE, { api, now: 1_000_000 + TTL });
  assert.equal(recentsDisabled(), true);
  assert.equal(state.infos.length, 1);

  state.step = FAST;
  warmRecentsCache({ api, now: 1_000_000 + 2 * TTL, force: true });
  assert.equal(recentsDisabled(), false, "an under-budget fetch — warm or inline — re-arms the gate");
  assert.equal(state.infos.length, 2, "the re-arm transition reports exactly once");
  assert.match(state.infos[1], /re-armed/);
  const diag = globalThis.window.__rgDiag.recentsBudget;
  assert.equal(diag.disarmed, false);
  assert.equal(diag.overruns, 0, "re-arm cleared the streak");
  assert.equal(diag.lastMs, FAST);
  assert.equal(typeof diag.rearmedAt, "number");

  warmRecentsCache({ api, now: 1_000_000 + 3 * TTL, force: true });
  assert.equal(state.infos.length, 2, "an already-armed gate has no transition to report");
});

test("an over-budget background warm never counts toward the streak", async (t) => {
  const { state, api } = setup(t);
  state.step = SLOW;
  warmRecentsCache({ api, now: 1_000_000, force: true });
  warmRecentsCache({ api, now: 1_000_000 + TTL, force: true });
  warmRecentsCache({ api, now: 1_000_000 + 2 * TTL, force: true });
  assert.equal(recentsDisabled(), false, "warms run off the critical path — they can never disarm");
  assert.equal(globalThis.window.__rgDiag.recentsBudget.overruns, 0, "a warm is never an overrun");
  assert.equal(state.infos.length, 0);
});
