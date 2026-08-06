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

test("onload schedules an idle warm that fills both recents caches, and unload disposes every handle", async (t) => {
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
  assert.deepEqual(counts, { page: 0, block: 0 }, "the warm is scheduled, not run inline during load");
  assert.ok(pendingTimers.size >= 1, "the fallback warm timer is lifecycle-tracked");

  t.mock.timers.tick(2500);
  assert.deepEqual(counts, { page: 1, block: 1 }, "the warm ran both recents queries off the critical path");
  assert.equal(recentsCacheReady("page"), true);
  assert.equal(recentsCacheReady("block"), true);
  assert.equal(pendingTimers.size, 1, "the re-warm chain is armed after a successful warm");

  // No grid is mounted in this test, so the re-warm must fire once and stop the chain.
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

test("a background warm never sets recentsDisabled and records its outcome in __rgDiag", (t) => {
  const saved = saveGlobals();
  t.after(() => { resetRoamRecents(); restoreGlobals(saved); });
  installRecentsApi();
  let clock = 0;
  globalThis.performance = { now: () => (clock += 500) };
  assert.equal(warmRecentsCache({ api: globalThis.window.roamAlphaAPI }), true);
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
