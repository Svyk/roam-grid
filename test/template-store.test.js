import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel,
  GridTemplateStore,
  MetadataStore,
  RegistrySet,
  migrateLegacyTemplates,
  resolveTemplateModel,
  runtime,
  serializeTemplateModel,
  settingsCache,
} from "../src/extension.js";

const TEMPLATE_PAGE = "roam/grid/templates";
const METADATA_PAGE = "roam/grid/metadata";

/**
 * Fake roamAlphaAPI in the comments.test.js style: a real block tree behind `q`, with every
 * page/block create, update, and delete recorded in `ops` so ordering pins (metadata LAST,
 * backup BEFORE rewrite, dispose→remove→delete) are asserted against the actual write stream.
 */
function installTemplateRoamMock({ dropStrings = new Set() } = {}) {
  let uidCounter = 0;
  const pages = new Map();
  const blocks = new Map();
  const ops = [];
  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  const detach = (uid) => {
    for (const node of blocks.values()) {
      const index = (node.children || []).findIndex((child) => child.uid === uid);
      if (index >= 0) { node.children.splice(index, 1); return; }
    }
  };
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (_query, uid) => (uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []),
    data: {
      pull: (_pattern, [, title]) => (pages.has(title) ? { ":block/uid": pages.get(title) } : null),
      page: { create: async ({ page }) => { pages.set(page.title, page.uid); blocks.set(page.uid, { uid: page.uid, string: page.title, order: 0, children: [] }); ops.push(["page", page.title]); } },
      block: {
        create: async ({ location, block }) => {
          ops.push(["create", block.uid, block.string, location["parent-uid"], location.order]);
          const node = { uid: block.uid, string: block.string, order: 0, children: [] };
          blocks.set(block.uid, node);
          if (dropStrings.has(block.string)) return; // recorded but never attached — simulates a lost write
          const siblings = blocks.get(location["parent-uid"])?.children;
          if (!siblings) throw new Error(`missing parent ${location["parent-uid"]}`);
          if (location.order === "first") node.order = Math.min(0, ...siblings.map((child) => child.order)) - 1;
          else if (typeof location.order === "number") node.order = location.order;
          else node.order = siblings.length ? Math.max(...siblings.map((child) => child.order)) + 1 : 0;
          siblings.push(node);
        },
        update: async ({ block }) => { ops.push(["update", block.uid, block.string]); blocks.get(block.uid).string = block.string; },
        delete: async ({ block }) => { ops.push(["delete", block.uid]); detach(block.uid); blocks.delete(block.uid); },
      },
    },
  } };
  return {
    pages,
    blocks,
    ops,
    addBlock(uid, string, parentUid = null, children = []) {
      const node = { uid, string, order: 0, children };
      blocks.set(uid, node);
      if (parentUid) blocks.get(parentUid).children.push(node);
      return node;
    },
    addPage(title, uid) {
      pages.set(title, uid);
      blocks.set(uid, { uid, string: title, order: 0, children: [] });
    },
    dispose: () => delete globalThis.window,
  };
}

function installDocumentStub() {
  const previous = globalThis.document;
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
  return () => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; };
}

function legacyTemplateString(model, name) {
  return `roam-grid/template:: ${JSON.stringify(serializeTemplateModel(model, name))}`;
}

function seedRuntime(t, mock) {
  const restoreDocument = installDocumentStub();
  runtime.metadata = new MetadataStore();
  runtime.templates = new GridTemplateStore();
  t.after(async () => {
    await runtime.metadata.initialize().catch(() => {});
    runtime.metadata = null;
    runtime.templates = null;
    runtime.registries = null;
    settingsCache.clear();
    mock.dispose();
    restoreDocument();
  });
  return runtime;
}

test("reload classifies legacy JSON, v2 name blocks, and malformed junk", async (t) => {
  const mock = installTemplateRoamMock();
  const warnings = [];
  const previousWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  t.after(() => { console.warn = previousWarn; });
  seedRuntime(t, mock);
  mock.addPage(TEMPLATE_PAGE, "tplpage01");
  const legacyModel = new GridModel({ rows: [["Old", "1"]] });
  mock.addBlock("legacy001", legacyTemplateString(legacyModel, "Old Grid"), "tplpage01");
  const table = { uid: "table0001", string: "{{[[table]]}}", order: 0, children: [
    { uid: "cell00001", string: "New", order: 0, children: [{ uid: "cell00002", string: "2", order: 0, children: [] }] },
  ] };
  mock.addBlock("table0001", table.string, null, table.children);
  mock.addBlock("name00001", "roam-grid/template:: New Grid", "tplpage01", [table]);
  mock.addBlock("junk00001", "roam-grid/template:: {not json", "tplpage01");
  mock.addBlock("junk00002", "roam-grid/template:: ", "tplpage01");

  const store = runtime.templates;
  await store.initialize();
  assert.deepEqual(store.list(), ["New Grid", "Old Grid"]);
  const legacy = store.entries.get("OLD GRID");
  assert.equal(legacy.nameBlockUid, "legacy001");
  assert.equal(legacy.tableUid, null);
  assert.ok(legacy.legacyValue, "the JSON block stays a legacy entry");
  const v2 = store.entries.get("NEW GRID");
  assert.equal(v2.nameBlockUid, "name00001");
  assert.equal(v2.tableUid, "table0001");
  assert.equal(v2.legacyValue, null);
  assert.equal(store.entries.has("{NOT JSON"), false, "malformed junk is warn-skipped");
  assert.ok(warnings.length >= 2, "both junk blocks warn (each fresh reload re-warns)");
});

test("save creates the name block, materializes cells row-major, and writes metadata LAST", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  await seeded.templates.initialize();
  const model = new GridModel({ rows: [["A", "B"], ["C", "D"]] });

  const cleanName = await seeded.templates.save("Calc", model);
  assert.equal(cleanName, "Calc");
  const strings = mock.ops.filter(([op]) => op === "create").map(([, , string]) => string);
  assert.deepEqual(strings.slice(0, 6), [
    "roam-grid/template:: Calc",
    "{{[[table]]}}",
    "A", "B", "C", "D",
  ]);
  const lastCreate = mock.ops.filter(([op]) => op === "create").at(-1);
  assert.ok(lastCreate[2].startsWith("roam-grid/table:: "), "the metadata block is the LAST write");
  assert.ok(lastCreate[2].includes(seeded.templates.entries.get("CALC").tableUid));
  const cellCreates = mock.ops.filter(([op, , string]) => op === "create" && ["A", "B", "C", "D"].includes(string));
  assert.equal(cellCreates[0][3], cellCreates[2][3], "row roots share the table parent");
  assert.equal(cellCreates[1][3], cellCreates[0][1], "column chains hang off the row root");
  assert.equal(mock.pages.has(METADATA_PAGE), true);
});

test("overwrite disposes, drops metadata, then deletes the old table before reusing the name block", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  await seeded.templates.initialize();
  await seeded.templates.save("Calc", new GridModel({ rows: [["A"]] }));
  const first = seeded.templates.entries.get("CALC");
  const oldMetaBlock = seeded.metadata.entries.get(first.tableUid).blockUid;
  mock.ops.length = 0;

  await seeded.templates.save("Calc", new GridModel({ rows: [["B", "C"]] }));
  const kinds = mock.ops.map(([op, uid]) => [op, uid]);
  const deleteMeta = kinds.findIndex(([op, uid]) => op === "delete" && uid === oldMetaBlock);
  const deleteTable = kinds.findIndex(([op, uid]) => op === "delete" && uid === first.tableUid);
  const updateName = kinds.findIndex(([op, uid]) => op === "update" && uid === first.nameBlockUid);
  assert.ok(deleteMeta >= 0, "old metadata record is removed");
  assert.ok(deleteMeta < deleteTable, "metadata remove lands before the table subtree delete");
  assert.ok(deleteTable < updateName, "the old table is gone before the name block is reused");
  assert.equal(mock.ops.filter(([op, uid]) => op === "create" && uid === first.nameBlockUid).length, 0, "the name block is reused, not recreated");
  assert.equal(mock.ops.filter(([op]) => op === "create").at(-1)[2].startsWith("roam-grid/table:: "), true, "metadata is still the last write");
  const next = seeded.templates.entries.get("CALC");
  assert.equal(next.nameBlockUid, first.nameBlockUid);
  assert.notEqual(next.tableUid, first.tableUid);
  assert.equal(seeded.metadata.has(first.tableUid), false, "no orphaned layout record survives");
});

test("save rewrites a legacy JSON block into the v2 name block in place", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  mock.addPage(TEMPLATE_PAGE, "tplpage01");
  mock.addBlock("legacy001", legacyTemplateString(new GridModel({ rows: [["Old"]] }), "Old Grid"), "tplpage01");
  await seeded.templates.initialize();

  await seeded.templates.save("Old Grid", new GridModel({ rows: [["New"]] }));
  const entry = seeded.templates.entries.get("OLD GRID");
  assert.equal(entry.nameBlockUid, "legacy001", "the legacy block becomes the name block — uid preserved");
  assert.equal(entry.legacyValue, null);
  assert.equal(mock.blocks.get("legacy001").string, "roam-grid/template:: Old Grid");
  assert.equal(mock.blocks.get("legacy001").children[0].string, "{{[[table]]}}");
});

test("get round-trips a live v2 table with charts, and degrades to content-only without metadata", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  await seeded.templates.initialize();
  const model = new GridModel({ rows: [["H", "V"], ["1", "=A2*2"]], frozenCols: 1, charts: [{ id: "c", type: "bar" }] });
  model.widths[model.columnIds[0]] = 200;
  await seeded.templates.save("Charted", model);

  const restored = seeded.templates.get("Charted");
  assert.equal(restored.tableUid, null);
  assert.deepEqual(restored.rows.map((row) => row.map((cell) => cell.raw)), [["H", "V"], ["1", "=A2*2"]]);
  assert.deepEqual(restored.charts, [{ id: "c", type: "bar" }]);
  assert.equal(restored.frozenCols, 1);
  assert.equal(restored.widths[restored.columnIds[0]], 200);
  const tableUid = seeded.templates.entries.get("CHARTED").tableUid;
  assert.notEqual(restored.rows[0][0].uid, mock.blocks.get(tableUid).children[0].uid, "the round-trip strips real cell uids");

  await seeded.metadata.remove(tableUid);
  const degraded = seeded.templates.get("Charted");
  assert.deepEqual(degraded.rows.map((row) => row.map((cell) => cell.raw)), [["H", "V"], ["1", "=A2*2"]], "missing metadata degrades to raw rows, never a throw");
  assert.deepEqual(degraded.charts, []);
});

test("migration backs up BEFORE rewriting, then materializes a verified table", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  mock.addPage(TEMPLATE_PAGE, "tplpage01");
  const legacyModel = new GridModel({ rows: [["H1", "H2"], ["a", "b"]] });
  const original = legacyTemplateString(legacyModel, "Meal Prep");
  mock.addBlock("legacy001", original, "tplpage01");
  await seeded.templates.initialize();

  const result = await migrateLegacyTemplates();
  assert.deepEqual(result, { legacy: 1, migrated: 1, skipped: 0 });
  const backup = mock.ops.findIndex(([op, , string]) => op === "create" && string.startsWith("roam-grid/template-backup:: "));
  const rewrite = mock.ops.findIndex(([op, uid]) => op === "update" && uid === "legacy001");
  assert.ok(backup >= 0 && backup < rewrite, "the backup lands on the metadata page BEFORE the JSON block is rewritten");
  assert.equal(mock.blocks.get("legacy001").string, "roam-grid/template:: Meal Prep");
  const table = mock.blocks.get("legacy001").children[0];
  assert.equal(table.string, "{{[[table]]}}");
  const entry = seeded.templates.entries.get("MEAL PREP");
  assert.equal(entry.legacyValue, null);
  assert.equal(entry.tableUid, table.uid);
  const restored = seeded.templates.get("Meal Prep");
  assert.deepEqual(restored.rows.map((row) => row.map((cell) => cell.raw)), [["H1", "H2"], ["a", "b"]]);

  mock.ops.length = 0;
  const again = await migrateLegacyTemplates();
  assert.deepEqual(again, { legacy: 0, migrated: 0, skipped: 0 });
  assert.deepEqual(mock.ops, [], "re-detection makes the idle run a zero-write no-op");
});

test("migration restores the original JSON and stops when verification fails", async (t) => {
  const mock = installTemplateRoamMock({ dropStrings: new Set(["lost-cell"]) });
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  mock.addPage(TEMPLATE_PAGE, "tplpage01");
  const original = legacyTemplateString(new GridModel({ rows: [["a", "b"], ["c", "lost-cell"]] }), "Broken");
  mock.addBlock("legacy001", original, "tplpage01");
  mock.addBlock("legacy002", legacyTemplateString(new GridModel({ rows: [["next"]] }), "Next"), "tplpage01");
  await seeded.templates.initialize();

  const result = await migrateLegacyTemplates();
  assert.equal(result.migrated, 0);
  const updates = mock.ops.filter(([op, uid]) => op === "update" && uid === "legacy001");
  assert.equal(updates.length, 2, "rewrite then restore");
  assert.deepEqual(updates[1][2], original, "the original JSON string is restored byte-for-byte");
  assert.equal(mock.blocks.get("legacy001").string, original);
  assert.ok(globalThis.window.__RG_U2_LAST_ERROR.includes("Broken"), "the failure lands on the forensic surface");
  assert.equal(mock.blocks.get("legacy002").string.startsWith("roam-grid/template:: {"), true, "the run stops — later entries wait for the maintenance action");
  delete globalThis.window.__RG_U2_LAST_ERROR;
});

test("migration skips over-budget templates and leaves their JSON untouched", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  mock.addPage(TEMPLATE_PAGE, "tplpage01");
  const original = legacyTemplateString(new GridModel({ rows: [["a", "b"], ["c", "d"]] }), "Huge");
  mock.addBlock("legacy001", original, "tplpage01");
  await seeded.templates.initialize();
  settingsCache.set("writes-native-budget", 5);

  const result = await migrateLegacyTemplates();
  assert.deepEqual(result, { legacy: 1, migrated: 0, skipped: 1 });
  assert.equal(mock.blocks.get("legacy001").string, original, "an over-budget record is left exactly as found");
  assert.equal(mock.ops.filter(([op]) => op === "create").length, 0, "no backup, no table");
});

test("resolveTemplateModel keeps registry → v2 → legacy precedence", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  mock.addPage(TEMPLATE_PAGE, "tplpage01");
  await seeded.templates.initialize();
  seeded.registries = new RegistrySet();

  await seeded.templates.save("Live", new GridModel({ rows: [["v2-cell"]] }));
  mock.addBlock("legacy001", legacyTemplateString(new GridModel({ rows: [["legacy-cell"]] }), "Old"), "tplpage01");

  seeded.registries.register(seeded.registries.templates, "Live", { rows: [["registry-cell"]] });
  const fromRegistry = await resolveTemplateModel("Live");
  assert.equal(fromRegistry.getRaw(0, 0), "registry-cell", "a registered template always wins");
  seeded.registries.templates.delete("LIVE");

  const fromV2 = await resolveTemplateModel("Live");
  assert.equal(fromV2.getRaw(0, 0), "v2-cell");
  const fromLegacy = await resolveTemplateModel("Old");
  assert.equal(fromLegacy.getRaw(0, 0), "legacy-cell");
  await assert.rejects(() => resolveTemplateModel("Missing"), (error) => error.code === "TEMPLATE_NOT_FOUND");
});
