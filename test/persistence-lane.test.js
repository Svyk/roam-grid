import test from "node:test";
import assert from "node:assert/strict";
import { deferredStructuralConflict, GridModel, GridView, NativeTableAdapter, nativeTreeToModel } from "../src/extension.js";

const clone = (value) => structuredClone(value);
const stored = (raw) => raw === "" ? " " : raw;

function makeTree(rowCount = 2, colCount = 2) {
  const rows = [];
  for (let row = 0; row < rowCount; row += 1) {
    let child = [];
    for (let col = colCount - 1; col >= 0; col -= 1) {
      const uid = `r${String(row).padStart(4, "0")}c${String(col).padStart(4, "0")}`;
      child = [{ uid, string: `${row}:${col}`, order: col ? 0 : row, children: child }];
    }
    rows.push(child[0]);
  }
  return { uid: "table0001", string: "{{[[table]]}}", order: 0, children: rows };
}

function flatten(tree) {
  const result = new Map();
  const visit = (node, parentUid = null) => {
    result.set(node.uid, { node, parentUid });
    for (const child of node.children || []) visit(child, node.uid);
  };
  visit(tree); return result;
}

function installApi(t, tree, { failUpdate = null, watches = false } = {}) {
  const calls = { q: 0, pulls: 0, updates: [], moves: [], deletes: [] };
  let watchHandler = null; let updateCount = 0;
  const api = {
    q: () => { calls.q += 1; return [[clone(tree)]]; },
    data: {
      pull: (_pattern, entity) => {
        calls.pulls += 1;
        const uid = entity[1]; const found = flatten(tree).get(uid); if (!found) return null;
        return { ":block/uid": uid, ":block/string": found.node.string, ":block/order": found.node.order, ":block/_children": found.parentUid ? [{ ":block/uid": found.parentUid }] : [] };
      },
      addPullWatch: (_pattern, _entity, handler) => { watchHandler = handler; },
      removePullWatch: () => { watchHandler = null; },
      block: {
        update: async ({ block }) => {
          updateCount += 1; calls.updates.push({ ...block });
          if (failUpdate === updateCount) throw new Error("write failed");
          const found = flatten(tree).get(block.uid); if (!found) throw new Error("missing block"); found.node.string = block.string;
        },
        move: async ({ location, block }) => { calls.moves.push({ location: { ...location }, block: { ...block } }); },
        delete: async ({ block }) => { calls.deletes.push(block.uid); },
      },
    },
  };
  globalThis.window = { roamAlphaAPI: api };
  t.after(() => { delete globalThis.window; });
  return { calls, emit: (before, after) => watchHandler?.(clone(before), clone(after)) };
}

function installStagingBehavior(tree, calls, staging, { failRestore = new Set(), failDelete = new Set() } = {}) {
  const api = globalThis.window.roamAlphaAPI; let restoreCount = 0; let deleteCount = 0;
  api.data.block.move = async ({ location, block }) => {
    calls.moves.push({ location: { ...location }, block: { ...block } });
    const index = tree.children.findIndex((row) => row.uid === block.uid);
    if (location["parent-uid"] === staging.uid && index >= 0) staging.children.push(...tree.children.splice(index, 1));
    else if (location["parent-uid"] === tree.uid) {
      restoreCount += 1; if (failRestore.has(restoreCount)) throw new Error(`restore ${restoreCount} failed`);
      const staged = staging.children.findIndex((row) => row.uid === block.uid);
      if (staged >= 0) tree.children.splice(Number(location.order), 0, ...staging.children.splice(staged, 1));
    }
  };
  api.data.block.delete = async ({ block }) => {
    calls.deletes.push(block.uid); deleteCount += 1;
    if (failDelete.has(deleteCount)) throw new Error(`delete ${deleteCount} failed`);
    if (block.uid === staging.uid) staging.children.length = 0;
  };
}

const metadata = () => ({ get: () => null, set: async () => { throw new Error("metadata should not be written"); } });

test("one content edit performs one selective pull/update and no full pull or metadata write", async (t) => {
  const tree = makeTree(); const { calls } = installApi(t, tree); let metadataWrites = 0;
  const adapter = new NativeTableAdapter(tree.uid, { get: () => null, set: async () => { metadataWrites += 1; } });
  const model = adapter.load(); calls.q = 0;
  const uid = model.getCell(1, 1).uid;
  await adapter.saveContent([{ uid, baseRaw: "1:1", raw: "fast", revision: 1 }]);
  assert.equal(calls.q, 0); assert.equal(calls.pulls, 2);
  assert.deepEqual(calls.updates, [{ uid, string: "fast" }]); assert.equal(metadataWrites, 0);
});

test("GridView coalesces repeated UID edits and drops a revert to base", () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "base" }]] });
  const view = { model, adapter: { getBaseRaw: () => "base" }, dirtyCells: new Map(), editRevisions: new Map() };
  model.transact("first", () => model.setRaw(0, 0, "one")); GridView.prototype.queueChangedCells.call(view);
  model.transact("second", () => model.setRaw(0, 0, "two")); GridView.prototype.queueChangedCells.call(view);
  assert.deepEqual([...view.dirtyCells.values()], [{ uid: "cell00001", baseRaw: "base", raw: "two", revision: 2 }]);
  model.transact("revert", () => model.setRaw(0, 0, "base")); GridView.prototype.queueChangedCells.call(view);
  assert.equal(view.dirtyCells.size, 0);
});

test("an edit made during an in-flight save survives and is rebased", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "one" }]] });
  let resolveSave;
  const adapter = { saveContent: () => new Promise((resolve) => { resolveSave = resolve; }) };
  const view = {
    model, adapter, disposed: false, structuralPending: false,
    dirtyCells: new Map([["cell00001", { uid: "cell00001", baseRaw: "base", raw: "one", revision: 1 }]]),
    editRevisions: new Map([["cell00001", 1]]), cellCoordinatesByUid: new Map([["cell00001", { row: 0, col: 0 }]]),
    changeVersion: 1, savedVersion: 0, contentSavePromise: null, saveTimer: null,
  };
  const saving = GridView.prototype.flushContentSave.call(view);
  model.rows[0][0].raw = "two"; view.editRevisions.set("cell00001", 2);
  view.dirtyCells.set("cell00001", { uid: "cell00001", baseRaw: "base", raw: "two", revision: 2 });
  resolveSave({ saved: [{ uid: "cell00001", baseRaw: "base", raw: "one", revision: 1 }] });
  await saving; clearTimeout(view.saveTimer);
  assert.deepEqual(view.dirtyCells.get("cell00001"), { uid: "cell00001", baseRaw: "one", raw: "two", revision: 2 });
});

test("a deferred scalar save never renders, focuses, or changes scroll", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "value" }]] });
  const viewport = { scrollLeft: 37, scrollTop: 91 }; let saves = 0;
  const view = {
    model, adapter: { saveContent: async () => { saves += 1; return { saved: [{ uid: "cell00001", baseRaw: "base", raw: "value", revision: 1 }] }; } },
    disposed: false, structuralPending: false,
    dirtyCells: new Map([["cell00001", { uid: "cell00001", baseRaw: "base", raw: "value", revision: 1 }]]),
    editRevisions: new Map([["cell00001", 1]]), cellCoordinatesByUid: new Map([["cell00001", { row: 0, col: 0 }]]),
    changeVersion: 1, savedVersion: 0, contentSavePromise: null, saveTimer: null, viewport,
    render: () => { throw new Error("rendered"); }, root: { focus: () => { throw new Error("focused"); } },
  };
  await GridView.prototype.flushContentSave.call(view);
  assert.equal(saves, 1); assert.deepEqual([viewport.scrollLeft, viewport.scrollTop], [37, 91]);
});

test("a content edit made during a structural save is retained for a follow-up flush", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "one" }]], tableUid: "table0001" });
  model.baseSnapshot = model.snapshot(); model.baseFingerprint = "base";
  let resolveSave;
  const adapter = { model, save: () => new Promise((resolve) => { resolveSave = resolve; }) };
  const view = {
    model, adapter, disposed: false, structuralPending: true, metadataDirty: true,
    dirtyCells: new Map([["cell00001", { uid: "cell00001", baseRaw: "base", raw: "one", revision: 1 }]]),
    editRevisions: new Map([["cell00001", 1]]), cellCoordinatesByUid: new Map([["cell00001", { row: 0, col: 0 }]]),
    changeVersion: 1, savedVersion: 0, saveTimer: null,
    root: { classList: { add() {}, remove() {} } }, render() {}, prunePersistenceUids: GridView.prototype.prunePersistenceUids,
  };
  const saving = GridView.prototype.flushSave.call(view);
  model.rows[0][0].raw = "two"; view.changeVersion = 2; view.editRevisions.set("cell00001", 2);
  view.dirtyCells.set("cell00001", { uid: "cell00001", baseRaw: "base", raw: "two", revision: 2 });
  const saved = new GridModel({ rows: [[{ uid: "cell00001", raw: "one" }]], tableUid: "table0001" });
  saved.baseSnapshot = saved.snapshot(); saved.baseFingerprint = "saved"; resolveSave(saved);
  await saving; clearTimeout(view.saveTimer);
  assert.equal(view.structuralPending, false);
  assert.deepEqual(view.dirtyCells.get("cell00001"), { uid: "cell00001", baseRaw: "one", raw: "two", revision: 2 });
});

test("structural cleanup prunes persistence state for a subsequently deleted cell UID", () => {
  const model = new GridModel({ rows: [[{ uid: "keep00001", raw: "keep" }], [{ uid: "gone00001", raw: "local" }]] });
  const view = {
    model,
    dirtyCells: new Map([["gone00001", { uid: "gone00001", baseRaw: "base", raw: "local", revision: 1 }]]),
    editRevisions: new Map([["keep00001", 1], ["gone00001", 1]]),
    cellCoordinatesByUid: new Map([["keep00001", { row: 0, col: 0 }], ["gone00001", { row: 1, col: 0 }]]),
  };
  model.transact("delete", () => model.deleteRows(1, 1));
  GridView.prototype.prunePersistenceUids.call(view);
  assert.deepEqual([...view.dirtyCells], []); assert.deepEqual([...view.editRevisions.keys()], ["keep00001"]);
  assert.deepEqual([...view.cellCoordinatesByUid.keys()], ["keep00001"]);
});

test("content save validates the whole batch before any write on a same-cell conflict", async (t) => {
  const tree = makeTree(); const { calls } = installApi(t, tree);
  const adapter = new NativeTableAdapter(tree.uid, metadata()); const model = adapter.load();
  const first = model.getCell(0, 1); const second = model.getCell(1, 1);
  flatten(tree).get(second.uid).node.string = "external";
  await assert.rejects(adapter.saveContent([
    { uid: first.uid, baseRaw: "0:1", raw: "local-a" },
    { uid: second.uid, baseRaw: "1:1", raw: "local-b" },
  ]), { code: "CONFLICT" });
  assert.equal(calls.updates.length, 0);
});

test("content save refuses an externally reordered row before writing", async (t) => {
  const tree = makeTree(); const { calls } = installApi(t, tree);
  const adapter = new NativeTableAdapter(tree.uid, metadata()); const model = adapter.load(); const interior = model.getCell(1, 1);
  tree.children[1].order = 0;
  await assert.rejects(adapter.saveContent([{ uid: interior.uid, baseRaw: "1:1", raw: "local" }]), { code: "STRUCTURAL_CONFLICT" });
  assert.equal(calls.updates.length, 0);
});

test("content save validates every ancestor when a middle subtree carrying the dirty cell moved", async (t) => {
  const tree = makeTree(2, 3); const { calls } = installApi(t, tree);
  const adapter = new NativeTableAdapter(tree.uid, metadata()); const model = adapter.load();
  const middle = model.getCell(1, 1); const dirty = model.getCell(1, 2);
  const pull = globalThis.window.roamAlphaAPI.data.pull;
  globalThis.window.roamAlphaAPI.data.pull = (pattern, entity) => {
    if (entity[1] !== middle.uid) return pull(pattern, entity);
    calls.pulls += 1;
    return { ":block/uid": middle.uid, ":block/string": middle.raw, ":block/order": 0, ":block/_children": [{ ":block/uid": "outside01" }] };
  };
  await assert.rejects(adapter.saveContent([{ uid: dirty.uid, baseRaw: "1:2", raw: "local" }]), { code: "STRUCTURAL_CONFLICT" });
  assert.equal(calls.updates.length, 0);
});

test("partial content failure conditionally restores already-written cells", async (t) => {
  const tree = makeTree(); const { calls } = installApi(t, tree, { failUpdate: 2 });
  const adapter = new NativeTableAdapter(tree.uid, metadata()); const model = adapter.load();
  const first = model.getCell(0, 1); const second = model.getCell(1, 1);
  await assert.rejects(adapter.saveContent([
    { uid: first.uid, baseRaw: "0:1", raw: "local-a" },
    { uid: second.uid, baseRaw: "1:1", raw: "local-b" },
  ]), /write failed/);
  assert.equal(flatten(tree).get(first.uid).node.string, stored("0:1"));
  assert.deepEqual(calls.updates.map((item) => item.string), ["local-a", "local-b", "0:1"]);
});

test("pull watch consumes self writes but forwards mixed external content", (t) => {
  const tree = makeTree(); const { emit } = installApi(t, tree);
  const adapter = new NativeTableAdapter(tree.uid, metadata()); const model = adapter.load(); const events = [];
  adapter.watchExternal((next, event) => events.push({ next, event }));
  const ownUid = model.getCell(0, 1).uid; const externalUid = model.getCell(1, 1).uid;
  const before = clone(tree); const afterOwn = clone(tree); flatten(afterOwn).get(ownUid).node.string = "own";
  adapter.recordSelfWrite(ownUid, "0:1", "own"); emit(before, afterOwn); assert.equal(events.length, 0);
  const afterMixed = clone(afterOwn); flatten(afterMixed).get(externalUid).node.string = "outside";
  emit(afterOwn, afterMixed);
  assert.equal(events.length, 1); assert.equal(events[0].event.type, "content");
  assert.deepEqual(events[0].event.changes.map((item) => item.uid), [externalUid]);
});

test("pull watch consumes a coalesced contiguous self-write path", (t) => {
  const tree = makeTree(); const { emit } = installApi(t, tree);
  const adapter = new NativeTableAdapter(tree.uid, metadata()); const model = adapter.load(); let callbacks = 0;
  adapter.watchExternal(() => { callbacks += 1; });
  const uid = model.getCell(0, 1).uid; const after = clone(tree); flatten(after).get(uid).node.string = "two";
  adapter.recordSelfWrite(uid, "0:1", "one"); adapter.recordSelfWrite(uid, "one", "two");
  emit(tree, after);
  assert.equal(callbacks, 0); assert.equal(adapter.selfWrites.has(uid), false);
});

test("own structural reorder intermediates are accepted but unexpected deferred edits conflict", () => {
  const base = makeTree(); const desired = nativeTreeToModel(base);
  desired.transact("reorder", () => desired.reorderRows(1, 0));
  const empty = { ...clone(base), children: [] };
  const prefix = { ...clone(base), children: [clone(base.children[1])] };
  const final = { ...clone(base), children: [clone(base.children[1]), clone(base.children[0])] };
  assert.equal(deferredStructuralConflict(base, desired, [empty, prefix, final]), false);
  const unexpected = clone(prefix); unexpected.children[0].children[0].string = "outside";
  assert.equal(deferredStructuralConflict(base, desired, [empty, unexpected, final]), true);
});

test("an unexpected deferred structural-window edit is surfaced after the verified reload", async (t) => {
  const tree = makeTree(); const harness = installApi(t, tree); const events = [];
  const store = {
    get: () => null,
    set: async () => {
      const before = clone(tree); tree.children[1].children[0].string = "outside"; harness.emit(before, tree);
    },
  };
  const adapter = new NativeTableAdapter(tree.uid, store); const model = adapter.load(); adapter.watchExternal((next, event) => events.push({ next, event }));
  await adapter.save(model);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(events.length, 1); assert.equal(events[0].event.conflict, true);
  assert.equal(events[0].next.getRaw(1, 1), "outside");
});

test("external content merges by UID without a grid render; same-cell and structural conflicts reload", (t) => {
  const toastContainer = { appendChild() {} };
  globalThis.document = { querySelector: () => toastContainer, createElement: () => ({ className: "", textContent: "", remove() {} }) };
  t.after(() => { delete globalThis.document; });
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "a" }, { uid: "cell00002", raw: "b" }]] });
  let renders = 0; let refreshes = 0; let accepted = 0;
  const view = {
    model, adapter: { acceptExternalTree: () => { accepted += 1; } }, dirtyCells: new Map(), structuralPending: false,
    contentSavePromise: null, metadataDirty: false, saveTimer: null, changeVersion: 0, savedVersion: 0,
    cellCoordinatesByUid: new Map([["cell00001", { row: 0, col: 0 }], ["cell00002", { row: 0, col: 1 }]]),
    refreshValues: () => { refreshes += 1; }, render: () => { renders += 1; },
  };
  const external = new GridModel({ rows: [[{ uid: "cell00001", raw: "outside" }, { uid: "cell00002", raw: "b" }]] });
  model.rows[0][1].raw = "local"; view.dirtyCells.set("cell00002", { uid: "cell00002", baseRaw: "b", raw: "local", revision: 1 });
  GridView.prototype.handleExternalChange.call(view, external, { type: "content", structural: false, tree: {}, changes: [{ uid: "cell00001", raw: "outside" }] });
  assert.equal(model.getRaw(0, 0), "outside"); assert.equal(model.getRaw(0, 1), "local"); assert.equal(view.dirtyCells.size, 1);
  assert.equal(refreshes, 1); assert.equal(renders, 0); assert.equal(accepted, 1);
  GridView.prototype.handleExternalChange.call(view, external, { type: "content", structural: false, tree: {}, changes: [{ uid: "cell00002", raw: "conflict" }] });
  assert.equal(renders, 1); assert.equal(view.dirtyCells.size, 0);
  view.dirtyCells.set("cell00001", { uid: "cell00001" });
  GridView.prototype.handleExternalChange.call(view, external, { type: "structural", structural: true, tree: {}, changes: [] });
  assert.equal(renders, 2); assert.equal(view.dirtyCells.size, 0);
});

test("deleting one native row moves only that row root and never survivors", async (t) => {
  const tree = makeTree(10, 12); tree.children[8].children[0].string = "=A10";
  const { calls } = installApi(t, tree);
  const staging = { uid: "staging01", children: [] };
  const api = globalThis.window.roamAlphaAPI;
  api.data.block.move = async ({ location, block }) => {
    calls.moves.push({ location: { ...location }, block: { ...block } });
    const index = tree.children.findIndex((row) => row.uid === block.uid);
    if (location["parent-uid"] === staging.uid && index >= 0) staging.children.push(...tree.children.splice(index, 1));
    else if (location["parent-uid"] === tree.uid) {
      const staged = staging.children.findIndex((row) => row.uid === block.uid);
      if (staged >= 0) tree.children.splice(Number(location.order), 0, ...staging.children.splice(staged, 1));
    }
  };
  api.data.block.delete = async ({ block }) => { calls.deletes.push(block.uid); if (block.uid === staging.uid) staging.children.length = 0; };
  const store = { get: () => null, set: async () => {}, createStaging: async () => staging.uid };
  const adapter = new NativeTableAdapter(tree.uid, store); const model = adapter.load(); const removedUid = model.rows[4][0].uid;
  model.transact("delete", () => model.deleteRows(4, 1));
  await adapter.save(model, { saveMetadata: false });
  assert.deepEqual(calls.moves.map((item) => item.block.uid), [removedUid]);
  assert.deepEqual(calls.updates.map((item) => item.string), ["=A9"]); assert.deepEqual(calls.deletes, [staging.uid]);
  assert.equal(tree.children.length, 9);
});

test("row deletion restores staged roots and formula text when metadata commit fails", async (t) => {
  const tree = makeTree(10, 12); tree.children[8].children[0].string = "=A10";
  const { calls } = installApi(t, tree); const staging = { uid: "staging01", children: [] };
  const api = globalThis.window.roamAlphaAPI;
  api.data.block.move = async ({ location, block }) => {
    calls.moves.push({ location: { ...location }, block: { ...block } });
    const index = tree.children.findIndex((row) => row.uid === block.uid);
    if (location["parent-uid"] === staging.uid && index >= 0) staging.children.push(...tree.children.splice(index, 1));
    else if (location["parent-uid"] === tree.uid) {
      const staged = staging.children.findIndex((row) => row.uid === block.uid);
      if (staged >= 0) tree.children.splice(Number(location.order), 0, ...staging.children.splice(staged, 1));
    }
  };
  api.data.block.delete = async ({ block }) => { calls.deletes.push(block.uid); if (block.uid === staging.uid) staging.children.length = 0; };
  const store = { get: () => null, set: async () => { throw new Error("metadata failed"); }, createStaging: async () => staging.uid };
  const adapter = new NativeTableAdapter(tree.uid, store); const model = adapter.load(); const removedUid = model.rows[4][0].uid;
  model.transact("delete", () => model.deleteRows(4, 1));
  await assert.rejects(adapter.save(model), /metadata failed/);
  assert.equal(tree.children.length, 10); assert.equal(tree.children[4].uid, removedUid);
  assert.equal(tree.children[8].children[0].string, "=A10");
  assert.deepEqual(calls.moves.map((item) => item.block.uid), [removedUid, removedUid]);
});

test("staging-delete and cleanup failure still restores graph metadata consistently", async (t) => {
  const tree = makeTree(6, 3); const { calls } = installApi(t, tree); const staging = { uid: "staging01", children: [] };
  installStagingBehavior(tree, calls, staging, { failDelete: new Set([1, 2]) });
  let metadataValue = null; let metadataRemovals = 0;
  const store = {
    get: () => metadataValue, has: () => metadataValue != null,
    set: async (_uid, model) => { metadataValue = { rowCount: model.rowCount }; },
    remove: async () => { metadataValue = null; metadataRemovals += 1; },
    createStaging: async () => staging.uid,
  };
  const adapter = new NativeTableAdapter(tree.uid, store); const model = adapter.load(); const removedUid = model.rows[2][0].uid;
  model.transact("delete", () => model.deleteRows(2, 1));
  await assert.rejects(adapter.save(model), /delete 1 failed/);
  assert.equal(tree.children.length, 6); assert.equal(tree.children[2].uid, removedUid); assert.equal(staging.children.length, 0);
  assert.equal(metadataValue, null); assert.equal(metadataRemovals, 1);
});

test("row-deletion rollback attempts every root and formula restore after one move-back failure", async (t) => {
  const tree = makeTree(10, 4); tree.children[8].children[0].string = "=A10";
  const formulaUid = tree.children[8].children[0].uid; const { calls } = installApi(t, tree); const staging = { uid: "staging01", children: [] };
  installStagingBehavior(tree, calls, staging, { failRestore: new Set([1]) });
  const store = { get: () => null, set: async () => { throw new Error("metadata failed"); }, createStaging: async () => staging.uid };
  const adapter = new NativeTableAdapter(tree.uid, store); const model = adapter.load();
  model.transact("delete", () => model.deleteRows(4, 2));
  await assert.rejects(adapter.save(model), /metadata failed/);
  assert.equal(calls.moves.length, 4, "both staging moves and both move-back attempts run");
  assert.equal(staging.children.length, 1, "unrestored data remains recoverable in staging");
  assert.equal(flatten(tree).get(formulaUid).node.string, "=A10", "formula rollback continues after the move failure");
  assert.equal(calls.deletes.length, 0, "staging is retained when any row could not be restored");
});
