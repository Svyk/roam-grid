import test from "node:test";
import assert from "node:assert/strict";
import * as rg from "../src/extension.js";

const { NativeTableAdapter } = rg;
const TABLE = "tbl00001";

/** In-memory Roam block tree with create/move/update/delete + order semantics and write counting. */
function makeRoam(cells, { failIf = null } = {}) {
  const nodes = new Map();
  const log = [];
  let counter = 0;
  const node = (uid, string, parent) => { const item = { uid, string, parent, children: [] }; nodes.set(uid, item); return item; };
  const table = node(TABLE, "{{[[table]]}}", null);
  cells.forEach((row, r) => {
    let parent = table;
    row.forEach((string, c) => {
      const item = node(`c${r}_${c}`, string, parent.uid);
      parent.children.push(item.uid);
      parent = item;
    });
  });
  node("metapage", "roam/grid/metadata", null);
  const detach = (uid) => { const parent = nodes.get(nodes.get(uid).parent); parent.children.splice(parent.children.indexOf(uid), 1); };
  const attach = (uid, parentUid, order) => {
    const parent = nodes.get(parentUid);
    if (!parent) throw new Error(`no parent ${parentUid}`);
    const index = order === "last" ? parent.children.length : Math.max(0, Math.min(Number(order), parent.children.length));
    parent.children.splice(index, 0, uid);
    nodes.get(uid).parent = parentUid;
  };
  const gate = (op, args) => {
    log.push({ op, ...args });
    const error = failIf?.(op, args, log);
    if (error) throw (error instanceof Error ? error : new Error("injected failure"));
  };
  const descendants = (uid) => [uid, ...nodes.get(uid).children.flatMap(descendants)];
  const toTree = (uid, order = 0) => { const item = nodes.get(uid); return { uid, string: item.string, order, children: item.children.map((child, index) => toTree(child, index)) }; };
  const api = {
    util: { generateUID: () => `n${String((counter += 1)).padStart(8, "0")}` },
    q: (_query, uid) => (nodes.has(uid) ? [[toTree(uid)]] : []),
    data: {
      pull: (_pattern, [, uid]) => (nodes.has(uid) ? { ":block/uid": uid } : null),
      block: {
        create: async ({ location, block }) => { gate("create", { uid: block.uid, parent: location["parent-uid"], order: location.order, string: block.string }); node(block.uid, block.string, null); attach(block.uid, location["parent-uid"], location.order); },
        move: async ({ location, block }) => { gate("move", { uid: block.uid, parent: location["parent-uid"], order: location.order }); detach(block.uid); attach(block.uid, location["parent-uid"], location.order); },
        update: async ({ block }) => { gate("update", { uid: block.uid, string: block.string }); nodes.get(block.uid).string = block.string; },
        delete: async ({ block }) => { gate("delete", { uid: block.uid }); if (!nodes.has(block.uid)) return; detach(block.uid); for (const uid of descendants(block.uid)) nodes.delete(uid); },
      },
    },
  };
  const matrix = () => nodes.get(TABLE).children.map((rowUid) => {
    const row = []; let current = rowUid;
    while (current) { const item = nodes.get(current); row.push([current, item.string]); current = item.children[0] || null; }
    return row;
  });
  const metadata = {
    get: () => null, set: async () => {},
    createStaging: async (tableUid) => { const uid = api.util.generateUID(); gate("create", { uid, parent: "metapage", order: "last", string: `roam-grid/staging:: ${tableUid}` }); node(uid, `roam-grid/staging:: ${tableUid}`, null); attach(uid, "metapage", "last"); return uid; },
  };
  const counts = () => ({ create: log.filter((e) => e.op === "create").length, move: log.filter((e) => e.op === "move").length, update: log.filter((e) => e.op === "update").length, delete: log.filter((e) => e.op === "delete").length });
  return { api, nodes, log, matrix, metadata, counts, staging: () => [...nodes.values()].filter((item) => item.string.startsWith("roam-grid/staging::")) };
}

function setup(t, cells, options) {
  const roam = makeRoam(cells, options);
  const originalConsoleError = console.error;
  console.error = () => {};
  globalThis.window = { roamAlphaAPI: roam.api };
  rg.setRoamWriteRetryDelays([0, 0, 0, 0, 0, 0]);
  t.after(() => { delete globalThis.window; console.error = originalConsoleError; rg.setRoamWriteRetryDelays(); });
  const adapter = new NativeTableAdapter(TABLE, roam.metadata);
  const model = adapter.load();
  return { ...roam, adapter, model };
}

const GRID = () => [["a0", "b0", "c0", "d0"], ["a1", "b1", "c1", "d1"], ["a2", "b2", "c2", "d2"]];

test("column insert in the middle writes one create and one move per row, and never stages", async (t) => {
  const h = setup(t, GRID());
  const before = h.matrix();
  h.model.insertCols(2); for (let r = 0; r < 3; r += 1) h.model.setRaw(r, 2, `new${r}`);
  await h.adapter.save(h.model, { saveMetadata: false });
  assert.deepEqual(h.counts(), { create: 3, move: 3, update: 0, delete: 0 });
  const after = h.matrix();
  after.forEach((row, r) => {
    assert.equal(row.length, 5);
    assert.deepEqual(row.map(([, s]) => s), [`a${r}`, `b${r}`, `new${r}`, `c${r}`, `d${r}`]);
    assert.deepEqual([row[0][0], row[1][0], row[3][0], row[4][0]], [before[r][0][0], before[r][1][0], before[r][2][0], before[r][3][0]]);
  });
  assert.equal(h.staging().length, 0);
  assert.deepEqual(h.model.rows.map((row) => row.map((c) => c.uid)), after.map((row) => row.map(([uid]) => uid)));
});

test("column append writes one create per row and no moves", async (t) => {
  const h = setup(t, GRID());
  h.model.insertCols(4);
  await h.adapter.save(h.model, { saveMetadata: false });
  assert.deepEqual(h.counts(), { create: 3, move: 0, update: 0, delete: 0 });
  assert.equal(h.matrix()[2].length, 5);
});

test("column insert at index 0 re-roots each row under a new root; row heights and alignments follow the minted uid", async (t) => {
  const h = setup(t, GRID());
  const before = h.matrix();
  h.model.insertCols(0);
  const remaps = []; const history = h.adapter.model.history; const original = history.remapUids.bind(history);
  history.remapUids = (map) => { remaps.push(new Map(map)); return original(map); };
  const localUid = h.model.rows[1][0].uid;
  h.model.rowHeights[localUid] = 44; h.model.alignments[localUid] = "right";
  await h.adapter.save(h.model, { saveMetadata: false });
  assert.deepEqual(h.counts(), { create: 3, move: 3, update: 0, delete: 0 });
  const after = h.matrix();
  after.forEach((row, r) => { assert.equal(row.length, 5); assert.equal(row[1][0], before[r][0][0]); });
  assert.deepEqual(h.nodes.get(TABLE).children, after.map((row) => row[0][0]));
  const minted = after[1][0][0];
  assert.equal(h.model.rowHeights[minted], 44);
  assert.equal(h.model.alignments[minted], "right");
  assert.equal(Object.hasOwn(h.model.rowHeights, localUid), false);
  assert.equal(remaps.length, 1);
  assert.equal(remaps[0].get(localUid), minted);
});

test("row insert in the middle writes one create per column and no moves", async (t) => {
  const h = setup(t, GRID());
  const before = h.matrix();
  h.model.insertRows(2);
  await h.adapter.save(h.model, { saveMetadata: false });
  assert.deepEqual(h.counts(), { create: 4, move: 0, update: 0, delete: 0 });
  const after = h.matrix();
  assert.equal(after.length, 4);
  assert.equal(after[0][0][0], before[0][0][0]);
  assert.equal(after[1][0][0], before[1][0][0]);
  assert.equal(after[3][0][0], before[2][0][0]);
  assert.equal(after[2].length, 4);
  assert.equal(h.staging().length, 0);
});

test("structural formula rewrites ride along as updates", async (t) => {
  const h = setup(t, [["1", "=A1+1"], ["2", "=A2+1"]]);
  h.model.insertCols(0);
  await h.adapter.save(h.model, { saveMetadata: false });
  assert.equal(h.counts().create, 2);
  assert.equal(h.counts().update, 2);
  assert.deepEqual(h.matrix().map((row) => row.map(([, s]) => s)), [[" ", "1", "=B1+1"], [" ", "2", "=B2+1"]]);
});

test("mixed growth and reorders are not insertion-only and still reconcile", async (t) => {
  const h = setup(t, GRID());
  const mixed = h.adapter.load(); mixed.insertRows(1); mixed.insertCols(1);
  assert.equal(h.adapter.persistInsertionOnly(mixed, rg.getTree(TABLE)), null);
  const swapped = h.adapter.load();
  [swapped.rows[0], swapped.rows[1]] = [swapped.rows[1], swapped.rows[0]];
  assert.equal(h.adapter.persistInsertionOnly(swapped, rg.getTree(TABLE)), null);
  const grown = h.adapter.load(); grown.insertRows(1); grown.insertCols(1);
  await h.adapter.save(grown, { saveMetadata: false });
  assert.equal(h.log.some((e) => e.op === "create" && e.string.startsWith("roam-grid/staging::")), true);
  assert.equal(h.matrix().length, 4);
  assert.equal(h.matrix()[0].length, 5);
});

const SCENARIOS = {
  "column in the middle": (model) => model.insertCols(2),
  "column at index 0": (model) => model.insertCols(0),
  "column append": (model) => model.insertCols(4),
  "row in the middle": (model) => model.insertRows(1),
};

for (const [name, mutate] of Object.entries(SCENARIOS)) {
  test(`insertion rollback restores the exact tree for ${name}, whichever write fails`, async (t) => {
    const probe = setup(t, GRID());
    mutate(probe.model); probe.model.setRaw(0, 0, "edited");
    await probe.adapter.save(probe.model, { saveMetadata: false });
    const total = probe.log.length;
    assert.ok(total >= 4);
    for (let failAt = 1; failAt <= total; failAt += 1) {
      let seen = 0;
      const h = setup(t, GRID(), { failIf: () => { seen += 1; return seen === failAt; } });
      const original = h.matrix(); const originalSize = h.nodes.size;
      mutate(h.model); h.model.setRaw(0, 0, "edited");
      const uidsBefore = h.model.rows.map((row) => row.map((c) => c.uid));
      let caught = null;
      try { await h.adapter.save(h.model, { saveMetadata: false }); } catch (error) { caught = error; }
      assert.ok(caught, `write ${failAt} must fail the save`);
      assert.equal(caught.rgRollbackAttempted, true);
      assert.equal(caught.rgRollbackComplete, true);
      assert.equal(caught.rgRollbackGraphRestored, true);
      assert.deepEqual(h.matrix(), original, `tree restored after failure at write ${failAt}`);
      assert.equal(h.nodes.size, originalSize, "created blocks are gone");
      assert.equal(h.staging().length, 0);
      assert.deepEqual(h.model.rows.map((row) => row.map((c) => c.uid)), uidsBefore, "model keeps its local uids");
    }
  });
}

test("insertion transaction rollback() after success restores the tree and the model uids", async (t) => {
  const h = setup(t, GRID());
  const original = h.matrix();
  h.model.insertCols(1);
  const localUids = h.model.rows.map((row) => row[1].uid);
  const transaction = await h.adapter.persistInsertionOnly(h.model, rg.getTree(TABLE));
  assert.notDeepEqual(h.matrix(), original);
  const result = await transaction.rollback();
  assert.equal(result.complete, true);
  assert.equal(result.graphRestored, true);
  assert.deepEqual(h.matrix(), original);
  assert.deepEqual(h.model.rows.map((row) => row[1].uid), localUids);
});

test("insertion rollback that cannot move a cell back deletes nothing", async (t) => {
  let armed = false; let moveFailures = 0;
  const h = setup(t, GRID(), { failIf: (op, args, log) => {
    if (!armed) return false;
    if (op === "update" && args.string === "edited") return true;
    if (op === "move" && log.some((e) => e.op === "update" && e.string === "edited")) { moveFailures += 1; return true; }
    return false;
  } });
  h.model.insertCols(2); h.model.setRaw(0, 0, "edited");
  armed = true;
  await assert.rejects(h.adapter.save(h.model, { saveMetadata: false }));
  assert.ok(moveFailures > 0);
  assert.equal(h.log.some((e) => e.op === "delete"), false);
});

function reconcileFailure(t, { alsoFailRestore = false } = {}) {
  let phase = "forward"; let staging = null; let failedFinal = false;
  const h = setup(t, GRID(), { failIf: (op, args) => {
    if (op === "create" && args.string.startsWith("roam-grid/staging::")) { staging = args.uid; return false; }
    if (op !== "move" || !staging || args.parent === staging) return false;
    if (phase === "forward" && !failedFinal && args.uid === "c1_1") { failedFinal = true; phase = "restore"; return true; }
    if (phase === "restore" && alsoFailRestore && args.uid === "c1_2") return true;
    return false;
  } });
  h.model.insertRows(1); h.model.insertCols(1);
  return h;
}

test("a reconcile that fails mid final moves restores every original cell and deletes only what it minted", async (t) => {
  const h = reconcileFailure(t);
  const original = h.matrix(); const originalUids = [...h.nodes.keys()].filter((uid) => uid.startsWith("c"));
  let caught = null;
  try { await h.adapter.save(h.model, { saveMetadata: false }); } catch (error) { caught = error; }
  assert.ok(caught);
  assert.equal(caught.rgRollbackAttempted, true);
  assert.equal(caught.rgRollbackComplete, true);
  assert.equal(caught.rgRollbackGraphRestored, true);
  assert.deepEqual(h.matrix(), original);
  for (const uid of originalUids) assert.equal(h.nodes.has(uid), true, `${uid} survives`);
  assert.equal(h.staging().length, 0, "staging block removed");
  assert.equal([...h.nodes.keys()].filter((uid) => uid.startsWith("n")).length, 0, "every minted block removed");
  assert.equal(h.log.filter((e) => e.op === "create" && !e.string.startsWith("roam-grid/staging::")).length > 0, true);
  assert.equal(h.log.some((e) => e.op === "delete" && originalUids.includes(e.uid)), false, "no original block was deleted");
  assert.equal(h.model.rows.flat().every((cell) => !cell.uid.startsWith("n")), true, "model uids are local again");
});

test("removed cells are not deleted before the final moves land, so a late failure cannot lose them", async (t) => {
  let staging = null; let fired = false; let deletesBeforeFailure = null;
  const h = setup(t, GRID(), { failIf: (op, args, log) => {
    if (op === "create" && args.string.startsWith("roam-grid/staging::")) { staging = args.uid; return false; }
    if (op === "move" && staging && args.parent !== staging && !fired) { fired = true; deletesBeforeFailure = log.filter((e) => e.op === "delete").length; return true; }
    return false;
  } });
  h.model.deleteCols(1, 1);
  h.model.insertRows(1);
  await assert.rejects(h.adapter.save(h.model, { saveMetadata: false }));
  assert.equal(deletesBeforeFailure, 0);
  assert.deepEqual(h.matrix().map((row) => row.map(([, s]) => s)), GRID());
  assert.equal(h.staging().length, 0);
});

test("a reconcile whose restore also fails deletes nothing, keeps staging and warns", async (t) => {
  const messages = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, delay) => { const id = realSetTimeout(fn, delay); id.unref?.(); return id; };
  const priorApi = rg.runtime.extensionAPI;
  rg.runtime.extensionAPI = {};
  const element = () => ({ appendChild() {}, remove() {}, set textContent(value) { messages.push(value); }, className: "" });
  globalThis.document = { querySelector: () => element(), createElement: () => element(), body: { appendChild() {} } };
  t.after(() => { globalThis.setTimeout = realSetTimeout; rg.runtime.extensionAPI = priorApi; delete globalThis.document; });
  const h = reconcileFailure(t, { alsoFailRestore: true });
  let caught = null;
  try { await h.adapter.save(h.model, { saveMetadata: false }); } catch (error) { caught = error; }
  assert.ok(caught);
  assert.equal(caught.rgRollbackAttempted, true);
  assert.equal(caught.rgRollbackComplete, false);
  assert.equal(caught.rgRollbackGraphRestored, false);
  assert.equal(h.log.some((e) => e.op === "delete"), false, "nothing deleted");
  assert.equal(h.staging().length, 1, "staging kept");
  assert.equal(messages.some((m) => /roam-grid\/staging::/.test(m)), true, "the user is told where the cells are");
  const original = GRID().flat();
  const remaining = [...h.nodes.values()].map((n) => n.string);
  for (const string of original) assert.ok(remaining.includes(string), `${string} still exists`);
});

test("write retry waits out a rate limit and resumes", async (t) => {
  let calls = 0;
  const h = setup(t, GRID(), { failIf: (op) => { if (op !== "update") return false; calls += 1; return calls <= 2 ? new Error("roamAlphaApi maximum mutation rate limit exceeded: 1500 per 60000 milliseconds") : false; } });
  h.model.setRaw(0, 0, "x");
  await h.adapter.save(h.model, { saveMetadata: false });
  assert.equal(calls, 3);
  assert.equal(h.nodes.get("c0_0").string, "x");
});

test("write retry gives up after the schedule and does not retry other errors", async (t) => {
  let limited = 0;
  const h = setup(t, GRID(), { failIf: (op) => { if (op !== "update") return false; limited += 1; return new Error("Rate limit exceeded"); } });
  h.model.setRaw(0, 0, "x");
  await assert.rejects(h.adapter.save(h.model, { saveMetadata: false }), /rate limit exceeded/i);
  assert.equal(limited, 7, "one attempt plus six retries");
  let other = 0;
  const g = setup(t, GRID(), { failIf: (op) => { if (op !== "update") return false; other += 1; return new Error("boom"); } });
  g.model.setRaw(0, 0, "x");
  await assert.rejects(g.adapter.save(g.model, { saveMetadata: false }), /boom/);
  assert.equal(other, 1);
});

test("a create whose rate-limit rejection arrived after the block landed is not repeated", async (t) => {
  let creates = 0;
  const h = setup(t, GRID(), { failIf: () => false });
  const create = h.api.data.block.create;
  h.api.data.block.create = async (args) => {
    creates += 1;
    await create(args);
    if (creates === 1) throw new Error("roamAlphaApi maximum mutation rate limit exceeded");
  };
  h.model.insertCols(4);
  await h.adapter.save(h.model, { saveMetadata: false });
  assert.equal(creates, 3, "three creates for three rows; the landed one is not retried");
  assert.equal(h.matrix().every((row) => row.length === 5), true);
  assert.equal([...h.nodes.values()].filter((n) => n.string === " ").length, 3);
});

test("disposeRichHost (via releaseRichCellHosts) swallows a rejected unmountNode promise", async (t) => {
  const unhandled = [];
  const listener = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", listener);
  t.after(() => process.off("unhandledRejection", listener));
  globalThis.window = { roamAlphaAPI: { ui: { components: { unmountNode: () => Promise.reject(new Error("roamAlphaApi maximum mutation rate limit exceeded")) } } } };
  t.after(() => { delete globalThis.window; });
  const host = { remove() {}, __rgDisposed: false };
  const content = { __rgRichHosts: new Set([host]), matches: () => true, querySelectorAll: () => [] };
  rg.releaseRichCellHosts(content);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(unhandled, []);
  assert.equal(content.__rgRichHosts.has(host), false);
});

/* ---------------------------- minimal-write column deletion ---------------------------- */

const COLUMN_DELETIONS = {
  "a middle column": { mutate: (m) => m.deleteCols(1, 1), expect: (r) => [`a${r}`, `c${r}`, `d${r}`], counts: { create: 1, move: 6, update: 0, delete: 1 } },
  "column 0": { mutate: (m) => m.deleteCols(0, 1), expect: (r) => [`b${r}`, `c${r}`, `d${r}`], counts: { create: 1, move: 6, update: 0, delete: 1 } },
  "the last column": { mutate: (m) => m.deleteCols(3, 1), expect: (r) => [`a${r}`, `b${r}`, `c${r}`], counts: { create: 1, move: 3, update: 0, delete: 1 } },
  "a middle run of two": { mutate: (m) => m.deleteCols(1, 2), expect: (r) => [`a${r}`, `d${r}`], counts: { create: 1, move: 6, update: 0, delete: 1 } },
  "two non-adjacent columns": { mutate: (m) => { m.deleteCols(2, 1); m.deleteCols(0, 1); }, expect: (r) => [`b${r}`, `d${r}`], counts: { create: 1, move: 12, update: 0, delete: 1 } },
};

for (const [name, spec] of Object.entries(COLUMN_DELETIONS)) {
  test(`column deletion of ${name} writes minimal moves through one staging block`, async (t) => {
    const h = setup(t, GRID());
    const before = h.matrix();
    spec.mutate(h.model);
    const kept = h.model.rows.map((row) => row.map((c) => c.uid));
    await h.adapter.save(h.model, { saveMetadata: false });
    assert.deepEqual(h.counts(), spec.counts);
    const after = h.matrix();
    after.forEach((row, r) => assert.deepEqual(row.map(([, s]) => s), spec.expect(r)));
    assert.deepEqual(after.map((row) => row.map(([uid]) => uid)), kept, "survivor uids unchanged");
    const survivors = new Set(kept.flat());
    for (const [uid] of before.flat()) assert.equal(h.nodes.has(uid), survivors.has(uid), `${uid} presence`);
    assert.equal(h.staging().length, 0);
    assert.equal(h.nodes.get(TABLE).children.length, 3);
  });

  test(`column deletion rollback of ${name} restores the exact tree at every write`, async (t) => {
    const probe = setup(t, GRID());
    spec.mutate(probe.model); probe.model.setRaw(0, 0, probe.model.getRaw(0, 0) + "!");
    await probe.adapter.save(probe.model, { saveMetadata: false });
    const writes = probe.log.length;
    for (let failAt = 1; failAt <= writes; failAt += 1) {
      let seen = 0;
      const h = setup(t, GRID(), { failIf: () => { seen += 1; return seen === failAt; } });
      const original = h.matrix(); const size = h.nodes.size;
      spec.mutate(h.model); h.model.setRaw(0, 0, h.model.getRaw(0, 0) + "!");
      let caught = null;
      try { await h.adapter.save(h.model, { saveMetadata: false }); } catch (error) { caught = error; }
      assert.ok(caught, `write ${failAt} must fail the save`);
      if (failAt < writes) { assert.equal(caught.rgRollbackAttempted, true); assert.equal(caught.rgRollbackGraphRestored, true); }
      assert.deepEqual(h.matrix(), original, `tree restored after failure at write ${failAt}`);
      assert.equal(h.nodes.size, size);
      assert.equal(h.staging().length, 0);
    }
  });
}

test("column deletion applies formula rewrites as updates", async (t) => {
  const h = setup(t, [["1", "2", "=B1"], ["3", "4", "=B2"]]);
  h.model.deleteCols(0, 1);
  await h.adapter.save(h.model, { saveMetadata: false });
  assert.equal(h.counts().update, 2);
  assert.equal(h.counts().move, 4);
  assert.deepEqual(h.matrix().map((row) => row.map(([, s]) => s)), [["2", "=A1"], ["4", "=A2"]]);
});

test("column deletion that also deletes rows or inserts anything is not column-deletion-only", async (t) => {
  const h = setup(t, GRID());
  const mixed = h.adapter.load(); mixed.deleteCols(1, 1); mixed.deleteRows(0, 1);
  assert.equal(h.adapter.persistColumnDeletionOnly(mixed, rg.getTree(TABLE)), null);
  const swapped = h.adapter.load(); swapped.deleteCols(1, 1); swapped.insertCols(0, 1);
  assert.equal(h.adapter.persistColumnDeletionOnly(swapped, rg.getTree(TABLE)), null);
  const inserted = h.adapter.load(); inserted.deleteCols(1, 1); inserted.insertRows(1, 1);
  assert.equal(h.adapter.persistColumnDeletionOnly(inserted, rg.getTree(TABLE)), null);
  const reordered = h.adapter.load(); reordered.deleteCols(1, 1);
  for (const row of reordered.rows) row.reverse();
  assert.equal(h.adapter.persistColumnDeletionOnly(reordered, rg.getTree(TABLE)), null);
  const uneven = h.adapter.load(); uneven.deleteCols(1, 1);
  uneven.rows[1] = [uneven.rows[1][1], uneven.rows[1][2]];
  assert.equal(h.adapter.persistColumnDeletionOnly(uneven, rg.getTree(TABLE)), null);
  await h.adapter.save(mixed, { saveMetadata: false });
  assert.equal(h.matrix().length, 2);
  assert.equal(h.matrix()[0].length, 3);
});
