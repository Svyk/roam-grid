import test from "node:test";
import assert from "node:assert/strict";
import { NativeTableAdapter, nativeTreeToModel } from "../src/extension.js";

function rawTree() {
  return {
    uid: "table0001", string: "{{[[table]]}}", order: 0, children: [
      { uid: "row000001", string: "Name", order: 0, children: [{ uid: "cell00001", string: "Value", order: 0, children: [] }] },
      { uid: "row000002", string: "A", order: 1, children: [{ uid: "cell00002", string: " ", order: 0, children: [] }] },
    ],
  };
}

function keywordTree(tree) {
  return {
    ":block/uid": tree.uid, ":block/string": tree.string, ":block/order": tree.order,
    ":block/children": tree.children.map(keywordTree),
  };
}

test("native tree parser follows Roam row roots and first-child column chains", () => {
  const model = nativeTreeToModel(rawTree(), { frozenRows: 1 });
  assert.equal(model.tableUid, "table0001");
  assert.deepEqual(model.rows.map((row) => row.map((cell) => cell.raw)), [["Name", "Value"], ["A", ""]]);
  assert.deepEqual(model.rows.map((row) => row.map((cell) => cell.uid)), [["row000001", "cell00001"], ["row000002", "cell00002"]]);
});

test("native tree parser accepts keyword-shaped Roam pull results", () => {
  const model = nativeTreeToModel({ uid: "table0001", string: "{{[[table]]}}", order: 0, children: rawTree().children.map(keywordTree) });
  assert.equal(model.getRaw(1, 1), "");
});

test("content-only native save updates changed block and metadata", async (t) => {
  const tree = rawTree(); const updates = []; const metadataWrites = [];
  globalThis.window = { roamAlphaAPI: {
    q: () => [[tree]],
    data: { block: { update: async ({ block }) => { updates.push(block); const cell = tree.children[1].children[0]; cell.string = block.string; } } },
  } };
  t.after(() => { delete globalThis.window; });
  const metadata = { get: () => null, set: async (...args) => metadataWrites.push(args) };
  const adapter = new NativeTableAdapter("table0001", metadata); const model = adapter.load(); model.setRaw(1, 1, "42");
  const saved = await adapter.save(model);
  assert.deepEqual(updates, [{ uid: "cell00002", string: "42" }]);
  assert.equal(metadataWrites.length, 1);
  assert.equal(saved.getRaw(1, 1), "42");
});

test("native save detects an external edit before writing", async (t) => {
  const tree = rawTree(); let writes = 0;
  globalThis.window = { roamAlphaAPI: { q: () => [[tree]], data: { block: { update: async () => { writes += 1; } } } } };
  t.after(() => { delete globalThis.window; });
  const adapter = new NativeTableAdapter("table0001", { get: () => null, set: async () => {} }); const model = adapter.load(); model.setRaw(1, 1, "42");
  tree.children[1].string = "external";
  await assert.rejects(adapter.save(model), { code: "CONFLICT" });
  assert.equal(writes, 0);
});

