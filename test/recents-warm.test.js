import test from "node:test";
import assert from "node:assert/strict";
import extension, {
  cancelRecentsWarm,
  gridSessions,
  largeGridMounts,
  pendingTimers,
  recentsCacheReady,
  recentsDisabled,
  resetRoamRecents,
  roamRecentsCache,
  scheduleRecentsWarm,
  warmRecentsCache,
} from "../src/extension.js";

/** Counts only the recents queries; anything else Roam-side gets an empty result. */
function installRecentsApi({ pageRows = [["Warm Page", "pagewarm12", 10]], blockRows = [["blkwarm001", "a warm block", 20]] } = {}) {
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

function installFakeDom({ visibilityState } = {}) {
  const makeElement = () => {
    const element = { className: "", textContent: "", id: "", isConnected: false, children: [], style: { setProperty() {} }, classList: { add() {}, remove() {} }, addEventListener() {} };
    element.appendChild = (child) => { element.children.push(child); return child; };
    element.remove = () => {};
    element.querySelectorAll = () => [];
    return element;
  };
  globalThis.document = {
    body: makeElement(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: makeElement,
    addEventListener() {},
    removeEventListener() {},
  };
  if (visibilityState !== undefined) globalThis.document.visibilityState = visibilityState;
}

function saveGlobals() {
  return { document: globalThis.document, window: globalThis.window, observer: globalThis.MutationObserver, performance: globalThis.performance };
}
function restoreGlobals(saved) {
  for (const [key, value] of [["document", saved.document], ["window", saved.window], ["MutationObserver", saved.observer], ["performance", saved.performance]]) {
    if (value === undefined) delete globalThis[key === "MutationObserver" ? "MutationObserver" : key]; else globalThis[key === "MutationObserver" ? "MutationObserver" : key] = value;
  }
}

test("onload schedules no recents warm; the warm arms on the first grid mount and unload disposes every handle", async (t) => {
  const saved = saveGlobals();
  t.after(() => { resetRoamRecents(); restoreGlobals(saved); });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const counts = installRecentsApi();
  installFakeDom();
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  const extensionAPI = {
    settings: { canSet: false, get: () => null, set: async () => {}, panel: { create: async () => {} } },
    ui: { commandPalette: { addCommand() {} }, slashCommand: { addCommand() {} } },
  };
  await extension.onload({ extensionAPI });
  // FIX-5: onload no longer arms the recents warm — an idle graph with the extension installed pays
  // zero Datascript scans. No fallback timer is lifecycle-tracked from load.
  assert.deepEqual(counts, { page: 0, block: 0 }, "onload does not run or schedule any recents query");
  assert.equal(pendingTimers.size, 0, "no warm timer is tracked from onload");

  // The warm arms from the first grid mount (see mountNativeInstance / scanLargeMounts), not onload.
  gridSessions.set("fake-native-uid", {});
  scheduleRecentsWarm();
  t.mock.timers.tick(2500);
  assert.deepEqual(counts, { page: 1, block: 1 }, "the warm ran both recents queries once a grid is mounted");
  assert.equal(recentsCacheReady("page"), true);
  assert.equal(recentsCacheReady("block"), true);
  assert.equal(pendingTimers.size, 1, "the re-warm chain is armed after a successful warm");

  // No grid stays mounted for the whole tick. The next re-warm fires, sees no mount, and stops.
  gridSessions.clear();
  t.mock.timers.tick(55_000);
  assert.deepEqual(counts, { page: 1, block: 1 }, "an idle graph with no grids runs no perpetual background queries");
  assert.equal(pendingTimers.size, 0, "the chain stopped instead of rescheduling");

  await extension.onunload();
  assert.equal(pendingTimers.size, 0);
});

test("an idle-callback warm runs on the callback and registers no timer", async (t) => {
  const saved = saveGlobals();
  t.after(() => { resetRoamRecents(); restoreGlobals(saved); });
  const counts = installRecentsApi();
  let idleCallback = null;
  const cancelled = [];
  scheduleRecentsWarm({ requestIdle: (callback) => { idleCallback = callback; return 7; }, cancelIdle: (id) => cancelled.push(id) });
  assert.equal(pendingTimers.size, 0, "idle scheduling uses no fallback timer");
  assert.deepEqual(counts, { page: 0, block: 0 });

  idleCallback();
  assert.deepEqual(counts, { page: 1, block: 1 });
  assert.equal(recentsCacheReady("page"), true);
  assert.equal(recentsCacheReady("block"), true);

  cancelRecentsWarm();
  assert.equal(pendingTimers.size, 0, "disposal clears the re-warm timer too");

  scheduleRecentsWarm({ requestIdle: () => 9, cancelIdle: (id) => cancelled.push(id) });
  cancelRecentsWarm();
  assert.deepEqual(cancelled, [9], "a pending idle handle is cancelled on dispose");
});

test("a background warm never disarms but an over-budget warm stops the re-warm chain (FIX-5c)", (t) => {
  const saved = saveGlobals();
  t.after(() => { resetRoamRecents(); restoreGlobals(saved); });
  installRecentsApi();
  let clock = 0;
  globalThis.performance = { now: () => (clock += 500) }; // SLOW: 1000ms per fetch, over the 250ms budget
  // FIX-5c: an over-budget background warm still never disarms (off the critical path), but it now
  // returns false so the re-warm chain does not keep re-running the slow query every TTL-lead ms.
  assert.equal(warmRecentsCache({ api: globalThis.window.roamAlphaAPI }), false, "an over-budget warm stops the re-warm chain");
  assert.equal(recentsDisabled(), false, "a slow warm is off the critical path, so it never disarms");
  const diag = globalThis.window.__rgDiag?.recentsWarm;
  assert.ok(diag, "the warm recorded forensics");
  assert.equal(diag.type, "block");
  assert.equal(diag.ms, 500);
  assert.equal(diag.rows, 1);
  assert.equal(typeof diag.at, "number");
});

test("a warm failure records lastError forensics and stops the re-warm chain", (t) => {
  const saved = saveGlobals();
  t.after(() => { resetRoamRecents(); restoreGlobals(saved); });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  globalThis.window = { roamAlphaAPI: { q: () => { throw new Error("datascript exploded"); } } };
  scheduleRecentsWarm();
  t.mock.timers.tick(2500);
  assert.match(String(globalThis.window.__rgDiag?.lastError), /datascript exploded/);
  assert.equal(recentsDisabled(), false);
  assert.equal(pendingTimers.size, 0, "a failed warm does not keep the chain alive");
  assert.equal(roamRecentsCache.size, 0);
});

test("the re-warm refreshes a mounted, visible grid and stops when the tab hides", (t) => {
  const saved = saveGlobals();
  t.after(() => { resetRoamRecents(); gridSessions.clear(); largeGridMounts.clear(); restoreGlobals(saved); });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const counts = installRecentsApi();
  installFakeDom({ visibilityState: "visible" });
  gridSessions.set("fake-native-uid", {});
  scheduleRecentsWarm();
  t.mock.timers.tick(2500);
  assert.deepEqual(counts, { page: 1, block: 1 });

  t.mock.timers.tick(55_000);
  assert.deepEqual(counts, { page: 2, block: 2 }, "a mounted, visible grid keeps the cache warm ahead of TTL expiry");
  assert.equal(pendingTimers.size, 1, "the chain re-armed");

  globalThis.document.visibilityState = "hidden";
  t.mock.timers.tick(55_000);
  assert.deepEqual(counts, { page: 2, block: 2 }, "a hidden tab runs no background queries");
  assert.equal(pendingTimers.size, 0, "the chain stopped while hidden");
});

test("a fresh cache is not re-queried, and full disposal happens on unload", async (t) => {
  const saved = saveGlobals();
  t.after(() => { resetRoamRecents(); restoreGlobals(saved); });
  const counts = installRecentsApi();
  installFakeDom();
  assert.equal(warmRecentsCache(), true);
  assert.equal(warmRecentsCache(), true);
  assert.deepEqual(counts, { page: 1, block: 1 }, "a second warm inside the TTL hits the cache");

  scheduleRecentsWarm();
  assert.equal(pendingTimers.size, 1);
  await extension.onunload();
  assert.equal(pendingTimers.size, 0, "unload cancels a pending warm timer");
});

test("cancelRecentsWarm can invoke a window host cancelIdleCallback without Illegal invocation", (t) => {
  const saved = saveGlobals();
  t.after(() => { resetRoamRecents(); restoreGlobals(saved); });
  installRecentsApi();
  const cancelled = [];
  function cancelIdle(id) {
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    cancelled.push(id);
  }
  scheduleRecentsWarm({ requestIdle: () => 7, cancelIdle });
  scheduleRecentsWarm({ requestIdle: () => 9, cancelIdle }); // live path: second mount cancels the first
  assert.deepEqual(cancelled, [7]);
  cancelRecentsWarm();
  assert.deepEqual(cancelled, [7, 9]);
});
