import test from "node:test";
import assert from "node:assert/strict";
import { deferredStructuralConflict, GridModel, NativeGridSession, NativeTableAdapter, nativeTreeToModel } from "../src/extension.js";

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

test("the session coalesces repeated UID edits and drops a revert to base", () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "base" }]] });
  const session = { model, adapter: { getBaseRaw: () => "base" }, dirtyCells: new Map(), editRevisions: new Map() };
  model.transact("first", () => model.setRaw(0, 0, "one")); NativeGridSession.prototype.queueChangedCells.call(session);
  model.transact("second", () => model.setRaw(0, 0, "two")); NativeGridSession.prototype.queueChangedCells.call(session);
  assert.deepEqual([...session.dirtyCells.values()], [{ uid: "cell00001", baseRaw: "base", raw: "two", revision: 2 }]);
  model.transact("revert", () => model.setRaw(0, 0, "base")); NativeGridSession.prototype.queueChangedCells.call(session);
  assert.equal(session.dirtyCells.size, 0);
});

test("an edit made during an in-flight save survives and is rebased", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "one" }]] });
  let resolveSave;
  const adapter = { saveContent: () => new Promise((resolve) => { resolveSave = resolve; }) };
  const session = {
    model, adapter, disposed: false, structuralPending: false,
    dirtyCells: new Map([["cell00001", { uid: "cell00001", baseRaw: "base", raw: "one", revision: 1 }]]),
    editRevisions: new Map([["cell00001", 1]]),
    changeVersion: 1, savedVersion: 0, contentSavePromise: null, saveTimer: null,
    coordinateForUid: NativeGridSession.prototype.coordinateForUid, scheduleReferenceCountRefresh() {},
  };
  const saving = NativeGridSession.prototype.flushContentSave.call(session);
  model.rows[0][0].raw = "two"; session.editRevisions.set("cell00001", 2);
  session.dirtyCells.set("cell00001", { uid: "cell00001", baseRaw: "base", raw: "two", revision: 2 });
  resolveSave({ saved: [{ uid: "cell00001", baseRaw: "base", raw: "one", revision: 1 }] });
  await saving; clearTimeout(session.saveTimer);
  assert.deepEqual(session.dirtyCells.get("cell00001"), { uid: "cell00001", baseRaw: "one", raw: "two", revision: 2 });
});

test("a deferred scalar save never renders, focuses, or changes scroll", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "value" }]] });
  const viewport = { scrollLeft: 37, scrollTop: 91 }; let saves = 0;
  const view = { viewport, render: () => { throw new Error("rendered"); }, root: { focus: () => { throw new Error("focused"); } } };
  const session = {
    model, adapter: { saveContent: async () => { saves += 1; return { saved: [{ uid: "cell00001", baseRaw: "base", raw: "value", revision: 1 }] }; } },
    disposed: false, structuralPending: false,
    dirtyCells: new Map([["cell00001", { uid: "cell00001", baseRaw: "base", raw: "value", revision: 1 }]]),
    editRevisions: new Map([["cell00001", 1]]),
    changeVersion: 1, savedVersion: 0, contentSavePromise: null, saveTimer: null, views: new Set([view]),
    coordinateForUid: NativeGridSession.prototype.coordinateForUid, scheduleReferenceCountRefresh() {},
    replaceModel: () => { throw new Error("replaced the model"); },
  };
  await NativeGridSession.prototype.flushContentSave.call(session);
  assert.equal(saves, 1); assert.deepEqual([viewport.scrollLeft, viewport.scrollTop], [37, 91]);
});

test("a content edit made during a structural save is retained for a follow-up flush", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "one" }]], tableUid: "table0001" });
  model.baseSnapshot = model.snapshot(); model.baseFingerprint = "base";
  let resolveSave;
  const adapter = { model, save: () => new Promise((resolve) => { resolveSave = resolve; }) };
  const session = {
    model, adapter, tableUid: "table0001", disposed: false, structuralPending: true, metadataDirty: true,
    dirtyCells: new Map([["cell00001", { uid: "cell00001", baseRaw: "base", raw: "one", revision: 1 }]]),
    editRevisions: new Map([["cell00001", 1]]),
    changeVersion: 1, savedVersion: 0, saveTimer: null, views: new Set(),
    setSaving() {}, prunePersistenceUids: NativeGridSession.prototype.prunePersistenceUids,
  };
  const saving = NativeGridSession.prototype.flushSave.call(session);
  model.rows[0][0].raw = "two"; session.changeVersion = 2; session.editRevisions.set("cell00001", 2);
  session.dirtyCells.set("cell00001", { uid: "cell00001", baseRaw: "base", raw: "two", revision: 2 });
  const saved = new GridModel({ rows: [[{ uid: "cell00001", raw: "one" }]], tableUid: "table0001" });
  saved.baseSnapshot = saved.snapshot(); saved.baseFingerprint = "saved"; resolveSave(saved);
  await saving; clearTimeout(session.saveTimer);
  assert.equal(session.structuralPending, false);
  assert.deepEqual(session.dirtyCells.get("cell00001"), { uid: "cell00001", baseRaw: "one", raw: "two", revision: 2 });
});

test("structural cleanup prunes persistence state for a subsequently deleted cell UID", () => {
  const model = new GridModel({ rows: [[{ uid: "keep00001", raw: "keep" }], [{ uid: "gone00001", raw: "local" }]] });
  const session = {
    model,
    dirtyCells: new Map([["gone00001", { uid: "gone00001", baseRaw: "base", raw: "local", revision: 1 }]]),
    editRevisions: new Map([["keep00001", 1], ["gone00001", 1]]),
  };
  model.transact("delete", () => model.deleteRows(1, 1));
  NativeGridSession.prototype.prunePersistenceUids.call(session);
  assert.deepEqual([...session.dirtyCells], []); assert.deepEqual([...session.editRevisions.keys()], ["keep00001"]);
  assert.deepEqual(NativeGridSession.prototype.coordinateForUid.call(session, "keep00001"), { row: 0, col: 0 });
  assert.equal(NativeGridSession.prototype.coordinateForUid.call(session, "gone00001"), null);
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

test("a delayed committed structural echo keeps a newer local edit, DOM, and undo stack", async (t) => {
  const before = makeTree(3, 2); const original = clone(before); const { calls, emit } = installApi(t, before); const staging = { uid: "staging01", children: [] };
  installStagingBehavior(before, calls, staging);
  const store = { get: () => null, set: async () => {}, createStaging: async () => staging.uid };
  const adapter = new NativeTableAdapter(before.uid, store); const model = adapter.load();
  model.transact("delete row", () => model.deleteRows(1, 1));
  await adapter.save(model, { saveMetadata: false });
  assert.equal(adapter.expectedStructuralTransitions.length, 1, "verified save captures one expected committed transition");
  adapter.model = model; // The session retains this local instance after flushSave.
  const surviving = model.getCell(0, 0); model.transact("newer local edit", () => model.setRaw(0, 0, "newer-local"));
  const undoDepth = model.undoStack.length; let renders = 0; let replacements = 0;
  const session = {
    model,
    adapter: { acceptExternalTree: () => { replacements += 1; } },
    dirtyCells: new Map([[surviving.uid, { uid: surviving.uid, baseRaw: "0:0", raw: "newer-local", revision: 1 }]]), structuralPending: false, contentSavePromise: null, metadataDirty: false, saveTimer: null,
    changeVersion: 1, savedVersion: 0, coordinateForUid: NativeGridSession.prototype.coordinateForUid,
    refreshValues() {}, renderStructural() { renders += 1; },
    replaceModel(next) { renders += 1; this.model = next; return next; },
  };
  adapter.watchExternal((external, event) => {
    replacements += 1;
    NativeGridSession.prototype.handleExternalChange.call(session, external, event);
  });

  emit(original, before);

  assert.equal(replacements, 0, "matching self echo never reaches the session");
  assert.equal(renders, 0, "matching self echo does not repaint the grid");
  assert.strictEqual(session.model, model, "the live model object is retained");
  assert.equal(model.getRaw(0, 0), "newer-local", "the post-save local edit survives");
  assert.equal(session.dirtyCells.get(surviving.uid).raw, "newer-local", "the pending local persistence entry survives");
  assert.equal(model.undoStack.length, undoDepth, "local structural undo remains available");
  assert.equal(model.undo(), true);
  assert.equal(model.getRaw(0, 0), "0:0");
  assert.equal(model.undo(), true); assert.equal(model.rowCount, 3);
});

test("a structural echo fingerprint rejects sibling, order, and content divergence", (t) => {
  const before = makeTree(3, 2); const expected = clone(before); expected.children.splice(1, 1);
  const { emit } = installApi(t, before); const adapter = new NativeTableAdapter(before.uid, metadata()); const model = adapter.load();
  model.transact("delete row", () => model.deleteRows(1, 1));
  const events = []; adapter.watchExternal((_external, event) => events.push(event));
  const sibling = clone(expected); sibling.children[0].children.push({ uid: "side00001", string: "side branch", order: 1, children: [] });
  const reordered = clone(expected); reordered.children[1].order = 77;
  const changed = clone(expected); changed.children[0].children[0].string = "outside";

  for (const divergent of [sibling, reordered, changed]) {
    adapter.recordExpectedStructuralTransition(before, expected);
    emit(before, divergent);
  }

  assert.equal(events.length, 3, "no divergent full tree is consumed as our echo");
  assert.ok(events.every((event) => event.structural));
  assert.equal(adapter.expectedStructuralTransitions.length, 0, "a genuine structural divergence clears stale transitions");
});

test("a genuine structural transition clears a stale echo before an external undo", (t) => {
  const f0 = makeTree(3, 2); const f1 = clone(f0); f1.children.splice(1, 1);
  const f2 = clone(f1); f2.children.push({ uid: "external01", string: "external row", order: 2, children: [{ uid: "external02", string: "external cell", order: 0, children: [] }] });
  const { emit } = installApi(t, f0); const adapter = new NativeTableAdapter(f0.uid, metadata()); adapter.load();
  const events = []; adapter.watchExternal((_external, event) => events.push(event));
  adapter.recordExpectedStructuralTransition(f0, f1);

  emit(f1, f2); // Real external F1→F2 is not our F0→F1 transition.
  assert.equal(events.length, 1); assert.equal(adapter.expectedStructuralTransitions.length, 0);
  emit(f2, f1); // An external undo must not consume the now-stale F0→F1 token.

  assert.equal(events.length, 2);
  assert.ok(events.every((event) => event.structural));
});

test("verified local structural intermediates may transition to the committed final tree", (t) => {
  const f0 = makeTree(3, 2); const intermediate = clone(f0); intermediate.children.splice(2, 1);
  const f1 = clone(intermediate); f1.children.splice(1, 1);
  const { emit } = installApi(t, f0); const adapter = new NativeTableAdapter(f0.uid, metadata()); adapter.load();
  let callbacks = 0; adapter.watchExternal(() => { callbacks += 1; });
  adapter.recordExpectedStructuralTransition(f0, f1, [intermediate]);

  emit(intermediate, f1);

  assert.equal(callbacks, 0, "a verified local intermediate→final callback is consumed");
  assert.equal(adapter.expectedStructuralTransitions.length, 1, "only the matching intermediate transition was consumed");
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
  const session = {
    tableUid: "table-external", model, adapter: { acceptExternalTree: () => { accepted += 1; } }, dirtyCells: new Map(), structuralPending: false,
    contentSavePromise: null, metadataDirty: false, saveTimer: null, changeVersion: 0, savedVersion: 0, discardedEdits: null,
    coordinateForUid: NativeGridSession.prototype.coordinateForUid,
    rememberDiscardedEdits: NativeGridSession.prototype.rememberDiscardedEdits,
    promptDiscardedEdits: NativeGridSession.prototype.promptDiscardedEdits,
    refreshValues: () => { refreshes += 1; }, renderStructural: () => { renders += 1; },
    replaceModel(next) { this.model = next; return next; },
  };
  const external = new GridModel({ rows: [[{ uid: "cell00001", raw: "outside" }, { uid: "cell00002", raw: "b" }]] });
  model.rows[0][1].raw = "local"; session.dirtyCells.set("cell00002", { uid: "cell00002", baseRaw: "b", raw: "local", revision: 1 });
  NativeGridSession.prototype.handleExternalChange.call(session, external, { type: "content", structural: false, tree: {}, changes: [{ uid: "cell00001", raw: "outside" }] });
  assert.equal(model.getRaw(0, 0), "outside"); assert.equal(model.getRaw(0, 1), "local"); assert.equal(session.dirtyCells.size, 1);
  assert.equal(refreshes, 1); assert.equal(renders, 0); assert.equal(accepted, 1);
  NativeGridSession.prototype.handleExternalChange.call(session, external, { type: "content", structural: false, tree: {}, changes: [{ uid: "cell00002", raw: "conflict" }] });
  assert.equal(renders, 1); assert.equal(session.dirtyCells.size, 0);
  assert.deepEqual(session.discardedEdits.edits, [{ uid: "cell00002", raw: "local", baseRaw: "b" }], "the reload sets the discarded local value aside");
  session.dirtyCells.set("cell00001", { uid: "cell00001" });
  NativeGridSession.prototype.handleExternalChange.call(session, external, { type: "structural", structural: true, tree: {}, changes: [] });
  assert.equal(renders, 2); assert.equal(session.dirtyCells.size, 0);
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

/** Minimal session harness for the flush lanes: a plain object plus the real prototype methods. */
function flushHarness({ model, adapter }) {
  return {
    model, adapter, tableUid: model.tableUid || "table0001", disposed: false,
    structuralPending: false, metadataDirty: false, dirtyCells: new Map(), editRevisions: new Map(),
    changeVersion: 0, savedVersion: 0, saveTimer: null, contentSavePromise: null, idleTimer: null,
    views: new Set(), history: null, discardedEdits: null, nativeOverlayUids: new Set(),
    setSaving() {}, scheduleReferenceCountRefresh() {}, refreshValues() {}, renderStructural() {},
    coordinateForUid: NativeGridSession.prototype.coordinateForUid,
    prunePersistenceUids: NativeGridSession.prototype.prunePersistenceUids,
    queueChangedCells: NativeGridSession.prototype.queueChangedCells,
    markChanged: NativeGridSession.prototype.markChanged,
    flushSave: NativeGridSession.prototype.flushSave,
    flushContentSave: NativeGridSession.prototype.flushContentSave,
    commitMutation: NativeGridSession.prototype.commitMutation,
    rememberDiscardedEdits: NativeGridSession.prototype.rememberDiscardedEdits,
    promptDiscardedEdits: NativeGridSession.prototype.promptDiscardedEdits,
    replaceModel(next) { this.model = next; return next; },
  };
}

function structuralAdapterSpy(model, counters) {
  return {
    model,
    save: async (payload) => {
      counters.saves += 1;
      const saved = new GridModel({ ...payload.snapshot(), tableUid: model.tableUid || "table0001" });
      saved.baseSnapshot = saved.snapshot(); saved.baseFingerprint = "saved";
      return saved;
    },
    saveContent: async () => { counters.contentSaves += 1; return { saved: [], skipped: [] }; },
  };
}

test("a content edit landing behind a pending structural flush still flushes both", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "one" }]], tableUid: "table0001" });
  model.baseSnapshot = model.snapshot(); model.baseFingerprint = "base";
  const counters = { saves: 0, contentSaves: 0 };
  const session = flushHarness({ model, adapter: structuralAdapterSpy(model, counters) });
  NativeGridSession.prototype.markChanged.call(session, true);
  // A content-lane markChanged lands before the 0ms structural timer fires.
  session.dirtyCells.set("cell00001", { uid: "cell00001", baseRaw: "base", raw: "one", revision: 1 });
  session.editRevisions.set("cell00001", 1);
  NativeGridSession.prototype.markChanged.call(session, false);
  await new Promise((resolve) => setTimeout(resolve, 20));
  clearTimeout(session.saveTimer);
  assert.equal(counters.saves, 1, "the structural flush survived the content-lane markChanged");
  assert.equal(session.structuralPending, false);
  assert.equal(session.dirtyCells.size, 0, "the structural payload carried the pending content edit");
});

test("an empty content touch cannot advance savedVersion past a pending structural change", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "one" }]], tableUid: "table0001" });
  model.baseSnapshot = model.snapshot(); model.baseFingerprint = "base";
  const counters = { saves: 0, contentSaves: 0 };
  const session = flushHarness({ model, adapter: structuralAdapterSpy(model, counters) });
  NativeGridSession.prototype.markChanged.call(session, true);
  NativeGridSession.prototype.markChanged.call(session, false); // no dirty cells: a revert/no-op
  await new Promise((resolve) => setTimeout(resolve, 20));
  clearTimeout(session.saveTimer);
  assert.equal(counters.saves, 1, "the structural flush was not swallowed by the version guard");
  assert.equal(session.structuralPending, false);
});

test("flushContentSave under a pending structural change reschedules the structural flush", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "one" }]], tableUid: "table0001" });
  model.baseSnapshot = model.snapshot(); model.baseFingerprint = "base";
  const counters = { saves: 0, contentSaves: 0 };
  const session = flushHarness({ model, adapter: structuralAdapterSpy(model, counters) });
  session.structuralPending = true; session.metadataDirty = true; session.changeVersion = 1;
  session.dirtyCells.set("cell00001", { uid: "cell00001", baseRaw: "base", raw: "one", revision: 1 });
  await NativeGridSession.prototype.flushContentSave.call(session);
  assert.equal(counters.saves, 0, "the content lane deferred to the structural lane");
  await new Promise((resolve) => setTimeout(resolve, 20));
  clearTimeout(session.saveTimer);
  assert.equal(counters.saves, 1, "the structural flush was rescheduled, not dropped");
  assert.equal(session.dirtyCells.size, 0, "the structural payload drained the content edit");
});

test("a dirty entry whose value already matches its base drains instead of respinning the saver", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "same" }]] });
  let saves = 0;
  const adapter = { saveContent: async () => { saves += 1; return { saved: [], skipped: ["cell00001"] }; } };
  const session = flushHarness({ model, adapter });
  // The shape a flushSave reconcile leaves behind when the value matched but the revision advanced.
  session.dirtyCells.set("cell00001", { uid: "cell00001", baseRaw: "same", raw: "same", revision: 2 });
  session.editRevisions.set("cell00001", 2);
  session.changeVersion = 1;
  await NativeGridSession.prototype.flushContentSave.call(session);
  assert.equal(saves, 1);
  assert.equal(session.dirtyCells.size, 0, "the no-op entry drained");
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(saves, 1, "the debounce did not re-arm");
});

test("a failed content save sets the pending edits aside for restore", async (t) => {
  const tree = makeTree(); installApi(t, tree);
  const adapter = new NativeTableAdapter(tree.uid, metadata());
  const model = adapter.load();
  const uid = model.getCell(0, 1).uid;
  flatten(tree).get(uid).node.string = "external"; // saveContent throws CONFLICT before writing
  const session = flushHarness({ model, adapter });
  session.dirtyCells.set(uid, { uid, baseRaw: "0:1", raw: "local", revision: 1 });
  session.editRevisions.set(uid, 1);
  session.changeVersion = 1;
  await NativeGridSession.prototype.flushContentSave.call(session);
  assert.equal(session.dirtyCells.size, 0);
  assert.equal(session.structuralPending, false);
  assert.deepEqual(session.discardedEdits?.edits, [{ uid, raw: "local", baseRaw: "0:1" }], "the failed save's pending edit is restorable");
});

test("a failed structural save sets the pending edits aside for restore", async (t) => {
  const tree = makeTree(); installApi(t, tree);
  const adapter = new NativeTableAdapter(tree.uid, metadata());
  const model = adapter.load();
  const uid = model.getCell(1, 1).uid;
  const session = flushHarness({ model, adapter });
  session.structuralPending = true;
  session.dirtyCells.set(uid, { uid, baseRaw: "1:1", raw: "local", revision: 1 });
  session.editRevisions.set(uid, 1);
  session.changeVersion = 1;
  tree.children[0].string = "retitled elsewhere"; // fingerprint mismatch: adapter.save throws CONFLICT
  await NativeGridSession.prototype.flushSave.call(session);
  assert.equal(session.structuralPending, false);
  assert.equal(session.dirtyCells.size, 0);
  assert.deepEqual(session.discardedEdits?.edits, [{ uid, raw: "local", baseRaw: "1:1" }], "the failed save's pending edit is restorable");
});

test("an overlay-owned external change does not stale prior undo entries", () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "base" }]], tableUid: "table0001" });
  model.transact("grid edit", () => model.setRaw(0, 0, "ours"));
  const entry = model.history.entries.at(-1);
  assert.ok(entry, "the earlier grid edit was recorded");
  const session = flushHarness({ model, adapter: { acceptExternalTree() {} } });
  session.history = model.history;
  session.nativeOverlayUids.add("cell00001");
  NativeGridSession.prototype.handleExternalChange.call(session, model, { type: "content", structural: false, tree: {}, changes: [{ uid: "cell00001", raw: "typed" }] });
  assert.equal(model.getRaw(0, 0), "typed", "the overlay keystroke still lands in the model");
  assert.equal(entry.stale.has("cell00001"), false, "the prior entry was not poisoned");
  assert.equal(model.history.entries.length, 1, "no per-keystroke undo entry was pushed");
});

test("a same-shape structural save absorbs its own watch echo", async (t) => {
  const tree = makeTree(); const { emit } = installApi(t, tree);
  const adapter = new NativeTableAdapter(tree.uid, { get: () => null, set: async () => {} });
  const model = adapter.load();
  const events = [];
  adapter.watchExternal((next, event) => events.push(event));
  const before = clone(tree);
  model.setRaw(1, 1, "rewritten");
  await adapter.save(model, { saveMetadata: false });
  emit(before, tree);
  assert.equal(events.length, 0, "the save's own echo was consumed as a self-write");
});

test("an exact self-write match beats a lingering null-from overlay entry", () => {
  const adapter = new NativeTableAdapter("table0001", { get: () => null });
  adapter.recordSelfWrite("cell00001", null, "flushed");
  adapter.recordSelfWrite("cell00001", "flushed", "before");
  adapter.recordSelfWrite("cell00001", "a", "b");
  assert.equal(adapter.consumeSelfWrite("cell00001", "a", "b"), true, "the exact match is found past the wildcard");
  assert.equal(adapter.selfWrites.get("cell00001")?.length, 2, "the unrelated wildcard pair survives");
  assert.equal(adapter.consumeSelfWrite("cell00001", "flushed", "before"), true);
  assert.equal(adapter.selfWrites.has("cell00001"), false, "consuming the restore write drops its paired wildcard");
});

test("a committing overlay edit records exactly one undo entry that rewinds to beforeRaw", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "typed" }]], tableUid: "table0001" });
  const session = flushHarness({ model, adapter: { getBaseRaw: () => "typed" } });
  await NativeGridSession.prototype.endNativeOverlayEdit.call(session, "cell00001", { beforeRaw: "before", afterRaw: "typed", commit: true });
  clearTimeout(session.saveTimer);
  assert.equal(model.getRaw(0, 0), "typed");
  assert.equal(session.dirtyCells.size, 0, "the patched base leaves no dirty diff behind");
  assert.equal(model.history.entries.length, 1, "one undo entry for the whole overlay edit");
  assert.equal(model.undo(), true);
  assert.equal(model.getRaw(0, 0), "before");
});

test("a merge-covered overlay commit keeps the model at the written value", async () => {
  const model = new GridModel({ rows: [[{ uid: "cell00001", raw: "a" }, { uid: "cell00002", raw: "typed" }]], tableUid: "table0001" });
  // The merge landed externally AFTER the overlay wrote "typed": covered, non-empty. Pushed
  // directly because a merge over a non-empty cell can never be built through the constructor.
  model.merges.push({ row: 0, col: 0, rowSpan: 1, colSpan: 2, id: "merge0001" });
  const session = flushHarness({ model, adapter: { getBaseRaw: () => "typed" } });
  // cell00002 is merge-covered: recording the undo entry fails, but the graph and the adapter
  // base already hold "typed" — the model must not be stranded at "before".
  await NativeGridSession.prototype.endNativeOverlayEdit.call(session, "cell00002", { beforeRaw: "before", afterRaw: "typed", commit: true });
  clearTimeout(session.saveTimer);
  assert.equal(model.getRaw(0, 1), "typed", "the model matches the graph and base after the failed undo entry");
});
