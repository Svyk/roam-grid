import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel,
  GridTemplateStore,
  MetadataStore,
  RegistrySet,
  migrateLegacyTemplates,
  pendingTimers,
  resolveTemplateModel,
  runtime,
  savedTemplateNameList,
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
function installTemplateRoamMock({ dropStrings = new Set(), throwStrings = new Set() } = {}) {
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
    ui: { getFocusedBlock: () => null },
    data: {
      pull: (_pattern, [, title]) => (pages.has(title) ? { ":block/uid": pages.get(title) } : null),
      page: { create: async ({ page }) => { pages.set(page.title, page.uid); blocks.set(page.uid, { uid: page.uid, string: page.title, order: 0, children: [] }); ops.push(["page", page.title]); } },
      block: {
        create: async ({ location, block }) => {
          ops.push(["create", block.uid, block.string, location["parent-uid"], location.order]);
          const node = { uid: block.uid, string: block.string, order: 0, children: [] };
          blocks.set(block.uid, node);
          if (throwStrings.has(block.string)) throw new Error(`simulated write failure for ${block.string}`);
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

/** Document stub that can host a `showChoice` dialog (overwrite confirm) and capture toasts. */
function installDialogDocumentStub() {
  const previous = globalThis.document;
  const nodes = [];
  const makeElement = (tag) => {
    const listeners = {};
    const element = {
      tagName: String(tag || "div").toUpperCase(), className: "", textContent: "", title: "", value: "", isConnected: false,
      children: [], style: { setProperty() {}, removeProperty() {} }, dataset: {},
      classList: { add() {}, remove() {}, contains: () => false },
      setAttribute() {}, appendChild(child) { element.children.push(child); child.isConnected = true; return child; },
      append(...children) { for (const child of children) if (child) element.appendChild(child); },
      remove() { element.isConnected = false; }, addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
      dispatch(type, ...args) { for (const handler of listeners[type] || []) handler(...args); },
      querySelector: () => null, querySelectorAll: () => [],
    };
    nodes.push(element);
    return element;
  };
  const body = makeElement();
  globalThis.document = {
    body,
    createElement: makeElement,
    querySelector: (selector) => (selector === ".rg-toasts" ? nodes.find((node) => node.className === "rg-toasts") || null : null),
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  return {
    nodes,
    buttons: (label) => nodes.filter((node) => node.tagName === "BUTTON" && node.textContent === label),
    toastItems: () => nodes.filter((node) => node.className === "rg-toast rg-toast--danger" || node.className === "rg-toast rg-toast--success"),
    restore: () => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; },
  };
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

test("overwrite materializes the new table first, then drops the old table and its metadata", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  await seeded.templates.initialize();
  await seeded.templates.save("Calc", new GridModel({ rows: [["A"]] }), { confirmOverwrite: false });
  const first = seeded.templates.entries.get("CALC");
  const oldMetaBlock = seeded.metadata.entries.get(first.tableUid).blockUid;
  mock.ops.length = 0;

  await seeded.templates.save("Calc", new GridModel({ rows: [["B", "C"]] }), { confirmOverwrite: false });
  const kinds = mock.ops.map(([op, uid]) => [op, uid]);
  const deleteMeta = kinds.findIndex(([op, uid]) => op === "delete" && uid === oldMetaBlock);
  const deleteTable = kinds.findIndex(([op, uid]) => op === "delete" && uid === first.tableUid);
  const updateName = kinds.findIndex(([op, uid]) => op === "update" && uid === first.nameBlockUid);
  const tableCreateOp = mock.ops.findIndex(([op, , string]) => op === "create" && string === "{{[[table]]}}");
  assert.ok(tableCreateOp >= 0, "the new table is created");
  assert.ok(tableCreateOp < deleteTable, "the new table is materialized BEFORE the old one is deleted");
  assert.ok(deleteMeta >= 0, "old metadata record is removed");
  assert.ok(deleteMeta < deleteTable, "metadata remove lands before the table subtree delete");
  assert.equal(mock.ops.filter(([op, uid]) => op === "create" && uid === first.nameBlockUid).length, 0, "the name block is reused, not recreated");
  assert.equal(mock.ops.filter(([op]) => op === "create").at(-1)[2].startsWith("roam-grid/table:: "), true, "metadata is still the last write");
  const next = seeded.templates.entries.get("CALC");
  assert.equal(next.nameBlockUid, first.nameBlockUid);
  assert.notEqual(next.tableUid, first.tableUid);
  assert.equal(seeded.metadata.has(first.tableUid), false, "no orphaned layout record survives");
  assert.ok(updateName >= 0, "the reused name block is restamped with the canonical name");
});

test("overwrite asks before replacing an existing template and aborts when declined", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  const dialog = installDialogDocumentStub();
  await seeded.metadata.initialize();
  await seeded.templates.initialize();
  await seeded.templates.save("Calc", new GridModel({ rows: [["A"]] }), { confirmOverwrite: false });
  mock.ops.length = 0;

  const pending = seeded.templates.save("Calc", new GridModel({ rows: [["B"]] }));
  const cancel = dialog.buttons("Cancel")[0];
  assert.ok(cancel, "the confirm dialog offers a cancel");
  cancel.dispatch("click");
  const result = await pending;
  assert.equal(result, null, "declining the overwrite aborts the save");
  assert.deepEqual(mock.ops, [], "a declined overwrite writes nothing");
  const entry = seeded.templates.entries.get("CALC");
  assert.equal(mock.blocks.get(entry.tableUid).string, "{{[[table]]}}", "the old table is untouched");
});

test("save rewrites a legacy JSON block into the v2 name block in place", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  mock.addPage(TEMPLATE_PAGE, "tplpage01");
  mock.addBlock("legacy001", legacyTemplateString(new GridModel({ rows: [["Old"]] }), "Old Grid"), "tplpage01");
  await seeded.templates.initialize();

  await seeded.templates.save("Old Grid", new GridModel({ rows: [["New"]] }), { confirmOverwrite: false });
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

test("migration restores a failed entry's JSON and continues to the entries after it", async (t) => {
  const mock = installTemplateRoamMock({ dropStrings: new Set(["lost-cell"]) });
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  mock.addPage(TEMPLATE_PAGE, "tplpage01");
  const original = legacyTemplateString(new GridModel({ rows: [["a", "b"], ["c", "lost-cell"]] }), "Broken");
  mock.addBlock("legacy001", original, "tplpage01");
  mock.addBlock("legacy002", legacyTemplateString(new GridModel({ rows: [["next"]] }), "Next"), "tplpage01");
  await seeded.templates.initialize();

  const result = await migrateLegacyTemplates();
  assert.equal(result.migrated, 1, "the entry after the failed one is still migrated — no run abort");
  assert.equal(result.legacy, 2);
  const updates = mock.ops.filter(([op, uid]) => op === "update" && uid === "legacy001");
  assert.equal(updates.length, 2, "rewrite then restore");
  assert.deepEqual(updates[1][2], original, "the original JSON string is restored byte-for-byte");
  assert.equal(mock.blocks.get("legacy001").string, original);
  const tableCreate = mock.ops.findIndex(([op, , string]) => op === "create" && string === "{{[[table]]}}");
  const tableUid = mock.ops[tableCreate][1];
  const tableDelete = mock.ops.findIndex(([op, uid]) => op === "delete" && uid === tableUid);
  const restore = mock.ops.findIndex(([op, uid, string]) => op === "update" && uid === "legacy001" && string === original);
  assert.ok(tableDelete > tableCreate, "the failed table subtree is deleted");
  assert.ok(tableDelete < restore, "the delete lands before the JSON restore so no broken table survives a retry");
  assert.equal(mock.blocks.get("legacy001").children.length, 0, "the name block has no leftover table child");
  assert.ok(globalThis.window.__RG_U2_LAST_ERROR.includes("Broken"), "the failure lands on the forensic surface");
  assert.equal(mock.blocks.get("legacy002").string, "roam-grid/template:: Next", "the run continues — the next entry is rewritten to v2");
  assert.equal(mock.blocks.get("legacy002").children[0].string, "{{[[table]]}}");
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

test("a failed overwrite deletes the partial new table and leaves the old template intact", async (t) => {
  const mock = installTemplateRoamMock({ throwStrings: new Set(["bomb"]) });
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  await seeded.templates.initialize();
  await seeded.templates.save("Calc", new GridModel({ rows: [["A"]] }), { confirmOverwrite: false });
  const first = seeded.templates.entries.get("CALC");
  const nameBlockUid = first.nameBlockUid;
  mock.ops.length = 0;

  await assert.rejects(
    () => seeded.templates.save("Calc", new GridModel({ rows: [["bomb"]] }), { confirmOverwrite: false }),
    (error) => /simulated write failure/.test(error.message),
  );
  assert.equal(seeded.metadata.has(first.tableUid), true, "the old metadata survives the failed overwrite");
  assert.ok(mock.blocks.get(first.tableUid), "the old table block survives");
  assert.equal(mock.blocks.get(nameBlockUid).children.length, 1, "only the old table remains under the name block");
  const entry = seeded.templates.entries.get("CALC");
  assert.equal(entry.tableUid, first.tableUid, "the store entry still resolves to the old table");
  const tableCreates = mock.ops.filter(([op, , string]) => op === "create" && string === "{{[[table]]}}");
  assert.equal(tableCreates.length, 1, "one partial table was created");
  assert.equal(mock.blocks.has(tableCreates[0][1]), false, "the partial new table is deleted");
  assert.ok(globalThis.window.__RG_U2_LAST_ERROR, "the failure lands on the forensic surface");
  delete globalThis.window.__RG_U2_LAST_ERROR;
});

test("migration restores JSON on a throw and continues to the entries after it", async (t) => {
  const mock = installTemplateRoamMock({ throwStrings: new Set(["boom-cell"]) });
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  mock.addPage(TEMPLATE_PAGE, "tplpage01");
  const original = legacyTemplateString(new GridModel({ rows: [["boom-cell"]] }), "Doomed");
  mock.addBlock("legacy001", original, "tplpage01");
  mock.addBlock("legacy002", legacyTemplateString(new GridModel({ rows: [["next"]] }), "Next"), "tplpage01");
  await seeded.templates.initialize();

  const result = await migrateLegacyTemplates();
  assert.equal(result.legacy, 2);
  assert.equal(result.migrated, 1, "the throw does not abort the run — the next entry still migrates");
  assert.equal(mock.blocks.get("legacy001").string, original, "the thrown entry's JSON is restored byte-for-byte");
  assert.equal(mock.blocks.get("legacy001").children.length, 0, "no partial table survives under the thrown entry");
  assert.equal(mock.blocks.get("legacy002").string, "roam-grid/template:: Next");
  assert.ok(globalThis.window.__RG_U2_LAST_ERROR.includes("simulated write failure"), "the throw lands on the forensic surface");
  delete globalThis.window.__RG_U2_LAST_ERROR;
});

test("migration skips a second backup when an identical one already exists", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  mock.addPage(METADATA_PAGE, "metapage01");
  await seeded.metadata.initialize();
  mock.addPage(TEMPLATE_PAGE, "tplpage01");
  const legacyModel = new GridModel({ rows: [["a", "b"]] });
  const original = legacyTemplateString(legacyModel, "Dup");
  mock.addBlock("legacy001", original, "tplpage01");
  const payload = original.slice("roam-grid/template::".length).trim();
  mock.addBlock("backup001", `roam-grid/template-backup:: ${payload}`, "metapage01");
  await seeded.templates.initialize();

  const result = await migrateLegacyTemplates();
  assert.equal(result.migrated, 1);
  const backupCreates = mock.ops.filter(([op, , string]) => op === "create" && string.startsWith("roam-grid/template-backup:: "));
  assert.equal(backupCreates.length, 0, "an identical pre-existing backup means no second backup block");
});

test("migration is guarded against re-entrancy", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  mock.addPage(TEMPLATE_PAGE, "tplpage01");
  mock.addBlock("legacy001", legacyTemplateString(new GridModel({ rows: [["a"]] }), "Solo"), "tplpage01");
  await seeded.templates.initialize();

  const first = migrateLegacyTemplates();
  const second = await migrateLegacyTemplates();
  assert.equal(second.reentered, true, "a concurrent call short-circuits on the in-flight flag");
  assert.deepEqual(second.migrated, 0);
  const result = await first;
  assert.equal(result.migrated, 1, "the in-flight run completes normally");
  const after = await migrateLegacyTemplates();
  assert.deepEqual(after, { legacy: 0, migrated: 0, skipped: 0 }, "the flag is released once the run settles — a later call runs normally");
});

test("a zero-progress migration run toasts danger, never success", async (t) => {
  const mock = installTemplateRoamMock({ throwStrings: new Set(["boom-cell"]) });
  const seeded = seedRuntime(t, mock);
  const dialog = installDialogDocumentStub();
  seeded.extensionAPI = {};
  t.after(() => { runtime.extensionAPI = null; for (const id of pendingTimers) clearTimeout(id); pendingTimers.clear(); });
  await seeded.metadata.initialize();
  mock.addPage(TEMPLATE_PAGE, "tplpage01");
  mock.addBlock("legacy001", legacyTemplateString(new GridModel({ rows: [["boom-cell"]] }), "Doomed"), "tplpage01");
  await seeded.templates.initialize();

  const result = await migrateLegacyTemplates();
  assert.equal(result.legacy, 1);
  assert.equal(result.migrated, 0);
  const dangers = dialog.toastItems().filter((node) => node.className === "rg-toast rg-toast--danger");
  assert.equal(dangers.length, 1, "a zero-progress run must not claim success");
  assert.match(dangers[0].textContent, /no progress/, "the danger toast says nothing moved");
  assert.match(dangers[0].textContent, /__RG_U2_LAST_ERROR/, "the danger toast points at the forensic surface");
  delete globalThis.window.__RG_U2_LAST_ERROR;
});

test("savedTemplateNameList dedupes case-insensitively and lets the registry display name win", async (t) => {
  const mock = installTemplateRoamMock();
  const seeded = seedRuntime(t, mock);
  await seeded.metadata.initialize();
  await seeded.templates.initialize();
  await seeded.templates.save("Calc", new GridModel({ rows: [["A"]] }), { confirmOverwrite: false });
  const registry = new RegistrySet();
  registry.registerTemplate("calc", { rows: [["registry-cell"]] });
  assert.deepEqual(savedTemplateNameList(registry, seeded.templates), ["calc"], "the registry's display casing wins, and the saved template is not duplicated");
  registry.templates.delete("CALC");
  registry.templateDisplayNames.delete("CALC");
  assert.deepEqual(savedTemplateNameList(registry, seeded.templates), ["Calc"], "without the registry, the saved template shows its own casing");
  registry.registerTemplate("Zebra", { rows: [["z"]] });
  assert.deepEqual(savedTemplateNameList(registry, seeded.templates), ["Calc", "Zebra"], "distinct names still sort together");

  registry.registerTemplate("calc", { rows: [["registry-cell"]] });
  seeded.registries = registry;
  const fromRegistry = await resolveTemplateModel("calc");
  assert.equal(fromRegistry.getRaw(0, 0), "registry-cell", "resolution precedence is unchanged — the registry wins by normalized key");
});
