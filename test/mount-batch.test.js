import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel,
  NativeGridSession,
  cancelBadgeBatch,
  clearUndoHistories,
  deferOffscreenMount,
  disposeDeferredMounts,
  enqueueBadgeRefresh,
  flushBadgeBatch,
  invalidateThemeSample,
  syncGridThemeFromHost,
} from "../src/extension.js";

function withIdleQueue(run) {
  const previous = { ric: globalThis.requestIdleCallback, cic: globalThis.cancelIdleCallback, window: globalThis.window };
  const idle = [];
  globalThis.requestIdleCallback = (callback, options) => { idle.push({ callback, options }); return idle.length; };
  globalThis.cancelIdleCallback = () => {};
  cancelBadgeBatch();
  try { return run(idle); }
  finally {
    cancelBadgeBatch();
    globalThis.requestIdleCallback = previous.ric; globalThis.cancelIdleCallback = previous.cic; globalThis.window = previous.window;
  }
}

function stubSession(uids) {
  return { disposed: false, model: { rows: [uids.map((uid) => ({ uid }))] }, shared: null, refreshCellBadges(shared) { this.shared = shared; } };
}

test("grids asking in one tick share one reference-count query, issued from idle", () => {
  withIdleQueue((idle) => {
    const queries = [];
    globalThis.window = { roamAlphaAPI: { q: (query, uids) => { queries.push(uids); return [["a1", 2], ["c1", 5]]; } } };
    const sessions = [stubSession(["a1", "a2"]), stubSession(["b1", "a1"]), stubSession(["c1"])];
    for (const session of sessions) enqueueBadgeRefresh(session);
    assert.equal(idle.length, 1, "one idle callback for every grid");
    assert.equal(idle[0].options.timeout, 1000);
    assert.equal(queries.length, 0, "nothing is queried during the mount tick");
    idle[0].callback();
    assert.equal(queries.length, 1);
    assert.deepEqual([...queries[0]].sort(), ["a1", "a2", "b1", "c1"]);
    assert.equal(sessions[0].shared.counts.get("a1"), 2);
    assert.equal(sessions[2].shared.counts.get("c1"), 5);
    assert.equal(sessions[1].shared.counts.get("b1"), 0);
  });
});

test("a disposed grid drops out of the batch and a late grid starts a new one", () => {
  withIdleQueue((idle) => {
    const queries = [];
    globalThis.window = { roamAlphaAPI: { q: (query, uids) => { queries.push(uids); return []; } } };
    const gone = stubSession(["gone1"]); const kept = stubSession(["kept1"]);
    enqueueBadgeRefresh(gone); enqueueBadgeRefresh(kept);
    gone.disposed = true;
    idle[0].callback();
    assert.deepEqual([...queries[0]], ["kept1"]);
    assert.equal(gone.shared, null);
    const late = stubSession(["late1"]);
    enqueueBadgeRefresh(late);
    assert.equal(idle.length, 2);
    idle[1].callback();
    assert.equal(queries.length, 2);
  });
});

test("real sessions fan the shared counts back out to their own cells", () => {
  withIdleQueue((idle) => {
    clearUndoHistories();
    let queries = 0;
    globalThis.window = { roamAlphaAPI: { q: (query, uids) => { if (String(query).includes(":block/refs ?target")) { queries += 1; return [["x1", 3], ["y1", 1]]; } return []; } } };
    const make = (tableUid, uid) => {
      const model = new GridModel({ rows: [[{ uid, raw: "v" }]], tableUid });
      return new NativeGridSession(tableUid, { adapter: { model, load: () => model, watchExternal: () => () => {}, dispose() {} }, model });
    };
    const first = make("t1", "x1"); const second = make("t2", "y1");
    enqueueBadgeRefresh(first); enqueueBadgeRefresh(second);
    idle[0].callback();
    assert.equal(queries, 1);
    assert.deepEqual([...first.referenceCounts], [["x1", 3]]);
    assert.deepEqual([...second.referenceCounts], [["y1", 1]]);
    first.dispose(); second.dispose();
  });
});

test("without requestIdleCallback the batch falls back to a timer and still coalesces", async () => {
  const previous = { ric: globalThis.requestIdleCallback, window: globalThis.window };
  globalThis.requestIdleCallback = undefined; cancelBadgeBatch();
  try {
    let queries = 0;
    globalThis.window = { roamAlphaAPI: { q: () => { queries += 1; return []; } } };
    const a = stubSession(["a"]); const b = stubSession(["b"]);
    enqueueBadgeRefresh(a); enqueueBadgeRefresh(b);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(queries, 1);
    assert.ok(a.shared && b.shared);
  } finally { cancelBadgeBatch(); globalThis.requestIdleCallback = previous.ric; globalThis.window = previous.window; }
});

test("theme is sampled once for N grids in one frame and again after the frame boundary", () => {
  const previous = { document: globalThis.document, raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
  const frames = [];
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  const body = { parentElement: null, className: "" };
  globalThis.document = { body };
  invalidateThemeSample();
  let reads = 0;
  const getStyle = () => ({ getPropertyValue: (name) => { reads += 1; return name === "background-color" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)"; } });
  const makeNative = () => { const host = { parentElement: body }; return { parentElement: host, querySelector: () => ({}), closest: () => null }; };
  const makeRoot = () => ({ style: { setProperty() {} }, parentElement: null });
  try {
    syncGridThemeFromHost(makeNative(), makeRoot(), getStyle);
    const perGrid = reads;
    assert.ok(perGrid > 0);
    for (let i = 0; i < 9; i += 1) syncGridThemeFromHost(makeNative(), makeRoot(), getStyle);
    assert.equal(reads, perGrid, "nine more grids in the same frame read no styles");
    for (const callback of frames.splice(0)) callback();
    syncGridThemeFromHost(makeNative(), makeRoot(), getStyle);
    assert.equal(reads, perGrid * 2, "the next frame samples again");
    invalidateThemeSample();
    syncGridThemeFromHost(makeNative(), makeRoot(), getStyle);
    assert.equal(reads, perGrid * 3, "an explicit invalidation samples again");
  } finally {
    invalidateThemeSample();
    globalThis.document = previous.document; globalThis.requestAnimationFrame = previous.raf; globalThis.cancelAnimationFrame = previous.caf;
  }
});

class FakeIntersectionObserver {
  static instances = [];
  constructor(callback, options) { this.callback = callback; this.options = options; this.observed = new Set(); FakeIntersectionObserver.instances.push(this); }
  observe(node) { this.observed.add(node); }
  unobserve(node) { this.observed.delete(node); }
  disconnect() { this.observed.clear(); }
  fire(node, isIntersecting) { this.callback([{ target: node, isIntersecting }]); }
}

test("an offscreen table is not enhanced until it intersects, and stays enhanced", () => {
  FakeIntersectionObserver.instances.length = 0; disposeDeferredMounts();
  const mounted = [];
  const node = { isConnected: true };
  assert.equal(deferOffscreenMount(node, (target) => mounted.push(target), { IntersectionObserverClass: FakeIntersectionObserver, enabled: true }), true);
  assert.equal(deferOffscreenMount(node, (target) => mounted.push(target), { IntersectionObserverClass: FakeIntersectionObserver, enabled: true }), true, "a rescan does not double-register");
  const observer = FakeIntersectionObserver.instances[0];
  assert.equal(FakeIntersectionObserver.instances.length, 1);
  assert.equal(observer.options.rootMargin, "100% 0px");
  assert.equal(mounted.length, 0);
  observer.fire(node, false);
  assert.equal(mounted.length, 0);
  observer.fire(node, true);
  assert.deepEqual(mounted, [node]);
  assert.equal(observer.observed.has(node), false, "observation drops once enhanced");
  disposeDeferredMounts();
});

test("the kill switch restores eager mount", () => {
  FakeIntersectionObserver.instances.length = 0; disposeDeferredMounts();
  const node = { isConnected: true };
  assert.equal(deferOffscreenMount(node, () => {}, { IntersectionObserverClass: FakeIntersectionObserver, enabled: false }), false);
  assert.equal(FakeIntersectionObserver.instances.length, 0);
  assert.equal(deferOffscreenMount(node, () => {}, { IntersectionObserverClass: undefined, enabled: true }), false, "no IntersectionObserver also mounts eagerly");
});
