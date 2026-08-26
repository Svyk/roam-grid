import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel,
  MetadataStore,
  RegistrySet,
  createExtensionToolsRegistration,
  createPublicApi,
  installOwnedWindowRegistryEntry,
  runtime,
  savedTemplateNameList,
} from "../src/extension.js";

function installMetadataRoamMock() {
  let uidCounter = 0;
  const pages = new Map();
  const blocks = new Map();
  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (_query, uid) => (uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []),
    data: {
      pull: (_pattern, [, title]) => (pages.has(title) ? { ":block/uid": pages.get(title) } : null),
      page: { create: async ({ page }) => { pages.set(page.title, page.uid); blocks.set(page.uid, { uid: page.uid, string: page.title, order: 0, children: [] }); } },
      block: {
        create: async ({ location, block }) => { const node = { ...block, order: 0, children: [] }; blocks.set(block.uid, node); blocks.get(location["parent-uid"])?.children.push(node); },
        update: async ({ block }) => { blocks.get(block.uid).string = block.string; },
      },
    },
  } };
  return { pages, blocks, dispose: () => delete globalThis.window };
}

function installDocumentStub() {
  const previous = globalThis.document;
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
  return () => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; };
}

function installTableRoamMock() {
  let uidCounter = 0;
  const pages = new Map();
  const blocks = new Map();
  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  const register = (node) => {
    blocks.set(node.uid, node);
    for (const child of node.children || []) register(child);
  };
  const add = (uid, string, children = []) => register({ uid, string, order: 0, children });
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (_query, uid) => (uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []),
    ui: { getFocusedBlock: () => null, mainWindow: { getOpenPageOrBlockUid: async () => null } },
    data: {
      pull: (_pattern, [, title]) => (pages.has(title) ? { ":block/uid": pages.get(title) } : null),
      page: { create: async ({ page }) => { pages.set(page.title, page.uid); add(page.uid, page.title); } },
      block: {
        create: async ({ location, block }) => {
          const order = typeof location.order === "number" ? location.order : "last";
          const node = { ...block, order, children: [] };
          blocks.set(block.uid, node);
          const parent = blocks.get(location["parent-uid"]);
          if (parent) {
            if (typeof order === "number") {
              const insertAt = parent.children.findIndex((child) => (child.order ?? 0) >= order);
              if (insertAt < 0) parent.children.push(node); else parent.children.splice(insertAt, 0, node);
            } else {
              parent.children.push(node);
            }
          }
        },
        update: async ({ block }) => { if (blocks.has(block.uid)) blocks.get(block.uid).string = block.string; },
        delete: async ({ block }) => {
          for (const node of blocks.values()) {
            const index = (node.children || []).findIndex((child) => child.uid === block.uid);
            if (index >= 0) node.children.splice(index, 1);
          }
          blocks.delete(block.uid);
        },
        move: async ({ location, block }) => {
          const node = blocks.get(block.uid);
          if (!node) return;
          for (const parent of blocks.values()) {
            const index = (parent.children || []).findIndex((child) => child.uid === block.uid);
            if (index >= 0) parent.children.splice(index, 1);
          }
          const target = blocks.get(location["parent-uid"]);
          if (!target) return;
          const order = typeof location.order === "number" ? location.order : "last";
          if (typeof order === "number") {
            const insertAt = target.children.findIndex((child) => (child.order ?? 0) >= order);
            if (insertAt < 0) target.children.push(node); else target.children.splice(insertAt, 0, node);
          } else {
            target.children.push(node);
          }
          node.order = typeof order === "number" ? order : (target.children.length - 1);
        },
      },
    },
  }, dispatchEvent() {} };
  return {
    pages, blocks,
    addBlock(uid, string, parentUid = null, children = []) { add(uid, string, children); },
    addPage(title, uid) { pages.set(title, uid); add(uid, title); },
    dispose: () => delete globalThis.window,
  };
}

function rawTable(uid = "table0001") {
  return {
    uid, string: "{{[[table]]}}", order: 0, children: [
      { uid: "row000001", string: "Name", order: 0, children: [{ uid: "cell00001", string: "Value", order: 0, children: [] }] },
      { uid: "row000002", string: "A", order: 1, children: [{ uid: "cell00002", string: " ", order: 0, children: [] }] },
    ],
  };
}

function toolByName(registration, name) {
  return registration.tools.find((tool) => tool.name === name);
}

async function callTool(registration, name, args = {}) {
  const tool = toolByName(registration, name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool.execute(args);
}

test("installOwnedWindowRegistryEntry requires a window-like object", () => {
  assert.throws(() => installOwnedWindowRegistryEntry(null, "RoamExtensionTools", "roam-grid", {}), TypeError);
  assert.throws(() => installOwnedWindowRegistryEntry(undefined, "RoamExtensionTools", "roam-grid", {}), TypeError);
  assert.throws(() => installOwnedWindowRegistryEntry("window", "RoamExtensionTools", "roam-grid", {}), TypeError);
});

test("installOwnedWindowRegistryEntry refuses a foreign non-object registry", () => {
  const windowLike = { RoamExtensionTools: "not-an-object" };
  assert.throws(() => installOwnedWindowRegistryEntry(windowLike, "RoamExtensionTools", "roam-grid", {}), TypeError);
});

test("install creates the registry, removes it, and clears the husk when we created it", () => {
  const windowLike = {};
  const entry = { name: "Roam Grid" };
  const remove = installOwnedWindowRegistryEntry(windowLike, "RoamExtensionTools", "roam-grid", entry);
  assert.equal(windowLike.RoamExtensionTools["roam-grid"], entry);
  remove();
  assert.equal("RoamExtensionTools" in windowLike, false, "created registry is removed when empty");
});

test("disposer is idempotent", () => {
  const windowLike = {};
  const remove = installOwnedWindowRegistryEntry(windowLike, "RoamExtensionTools", "roam-grid", {});
  remove();
  remove();
  assert.equal("RoamExtensionTools" in windowLike, false);
});

test("overlapping reload: the first disposer does not remove the second registration", () => {
  const windowLike = {};
  const first = installOwnedWindowRegistryEntry(windowLike, "RoamExtensionTools", "roam-grid", { version: "0.17.1" });
  const second = installOwnedWindowRegistryEntry(windowLike, "RoamExtensionTools", "roam-grid", { version: "0.18.0" });
  first();
  assert.equal(windowLike.RoamExtensionTools["roam-grid"].version, "0.18.0", "second entry survives first unload");
  second();
  assert.equal(windowLike.RoamExtensionTools["roam-grid"], undefined, "second entry is removed");
  assert.ok(windowLike.RoamExtensionTools, "the registry the first install created remains as an empty husk because the second disposer did not create it");
});

test("foreign replacement: disposer does not delete a replacement it no longer owns", () => {
  const windowLike = {};
  const ours = { version: "ours" };
  const remove = installOwnedWindowRegistryEntry(windowLike, "RoamExtensionTools", "roam-grid", ours);
  const foreign = { version: "foreign" };
  windowLike.RoamExtensionTools["roam-grid"] = foreign;
  remove();
  assert.equal(windowLike.RoamExtensionTools["roam-grid"], foreign, "foreign replacement survives our unload");
});

test("sibling keys survive disposer and the pre-existing registry is left in place", () => {
  const sibling = { name: "Other" };
  const windowLike = { RoamExtensionTools: { "other-extension": sibling } };
  const ours = { name: "Roam Grid" };
  const remove = installOwnedWindowRegistryEntry(windowLike, "RoamExtensionTools", "roam-grid", ours);
  assert.equal(windowLike.RoamExtensionTools["other-extension"], sibling);
  remove();
  assert.equal(windowLike.RoamExtensionTools["other-extension"], sibling, "sibling survives");
  assert.ok(windowLike.RoamExtensionTools, "pre-existing registry stays (we did not create it)");
  assert.equal("roam-grid" in windowLike.RoamExtensionTools, false);
});

test("createExtensionToolsRegistration exposes the roam-grid contract", () => {
  const registration = createExtensionToolsRegistration();
  assert.equal(registration.name, "Roam Grid");
  assert.equal(registration.version, "0.18.1");
  const names = registration.tools.map((tool) => tool.name);
  assert.deepEqual(names.sort(), [
    "rg_add_formula", "rg_apply_patch", "rg_create_from_template", "rg_create_table",
    "rg_delete_cols", "rg_delete_rows", "rg_enhance_table", "rg_export_grid", "rg_fill",
    "rg_get_cell", "rg_get_grid", "rg_insert_chart", "rg_insert_cols", "rg_insert_rows",
    "rg_list_grids", "rg_list_templates", "rg_merge", "rg_resize_table", "rg_restore_native",
    "rg_set_cell", "rg_sort", "rg_unmerge",
  ]);
  for (const readOnly of ["rg_list_grids", "rg_get_grid", "rg_list_templates", "rg_get_cell", "rg_export_grid"]) {
    assert.equal(toolByName(registration, readOnly).readOnly, true, `${readOnly} is readOnly`);
  }
  for (const writable of ["rg_enhance_table", "rg_set_cell", "rg_create_table"]) {
    assert.notEqual(toolByName(registration, writable).readOnly, true, `${writable} is not readOnly`);
  }
  for (const tool of registration.tools) {
    assert.equal(tool.parameters?.type, "object", `${tool.name} parameters is JSON Schema`);
    assert.equal(typeof tool.parameters?.properties, "object", `${tool.name} has properties`);
    assert.equal(Array.isArray(tool.parameters), false, `${tool.name} is not a name-array`);
  }
  assert.deepEqual(toolByName(registration, "rg_get_grid").parameters.required, ["uid"]);
});

test("rg_list_grids lists metadata entries with mode and dimensions", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addBlock("tableA", "{{[[table]]}}", null, rawTable("tableA").children);
  await callTool(createExtensionToolsRegistration(), "rg_enhance_table", { uid: "tableA" });
  await runtime.metadata.set("uidL", new GridModel({ rows: [["x"]] }), "large");
  const grids = await callTool(createExtensionToolsRegistration(), "rg_list_grids");
  assert.equal(grids.ok, true);
  const byUid = new Map(grids.grids.map((grid) => [grid.uid, grid]));
  assert.equal(byUid.get("tableA").mode, "native");
  assert.equal(byUid.get("tableA").rows, 2);
  assert.equal(byUid.get("tableA").cols, 2);
  assert.equal(byUid.get("uidL").mode, "large");
  runtime.metadata = null; runtime.registries = null;
});

test("rg_get_grid returns the model JSON for an enhanced uid and an error for a missing one", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addBlock("tableA", "{{[[table]]}}", null, rawTable("tableA").children);
  const registration = createExtensionToolsRegistration();
  await callTool(registration, "rg_enhance_table", { uid: "tableA" });

  const ok = await callTool(registration, "rg_get_grid", { uid: "tableA" });
  assert.equal(ok.ok, true);
  assert.equal(ok.model.rows.length, 2);
  const missing = await callTool(registration, "rg_get_grid", { uid: "doesNotExist" });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /No enhanced grid/);
  runtime.metadata = null; runtime.registries = null;
});

test("tools never throw: a missing uid returns { ok:false, error } instead", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  const registration = createExtensionToolsRegistration();
  try {
    const list = await callTool(registration, "rg_list_grids", {});
    assert.equal(list.ok, true);
    const get = await callTool(registration, "rg_get_grid", {});
    assert.equal(get.ok, false);
    assert.match(get.error, /uid is required/);
    const enhance = await callTool(registration, "rg_enhance_table", {});
    assert.equal(enhance.ok, false);
    const restore = await callTool(registration, "rg_restore_native", {});
    assert.equal(restore.ok, false);
    const setCell = await callTool(registration, "rg_set_cell", { uid: "x", row: "a", col: 0, value: "1" });
    assert.equal(setCell.ok, false);
    assert.match(setCell.error, /row and col must be numeric/);
    const addFormula = await callTool(registration, "rg_add_formula", { uid: "x", row: 0, col: 0, formula: "==bad" });
    assert.equal(addFormula.ok, false);
    assert.match(addFormula.error, /`==`/);
    const create = await callTool(registration, "rg_create_table", {});
    assert.equal(create.ok, false);
    assert.match(create.error, /parent_uid or after_uid is required/);
  } finally {
    runtime.metadata = null; runtime.registries = null;
  }
});

test("rg_enhance_table enhances a native table by uid and refuses a non-table", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addBlock("table0001", "{{[[table]]}}", null, rawTable("table0001").children);
  mock.addBlock("notATable", "Plain text block", null, []);
  const registration = createExtensionToolsRegistration();

  const ok = await callTool(registration, "rg_enhance_table", { uid: "table0001" });
  assert.equal(ok.ok, true);
  assert.equal(ok.uid, "table0001");
  assert.equal(runtime.metadata.has("table0001"), true);

  const again = await callTool(registration, "rg_enhance_table", { uid: "table0001" });
  assert.equal(again.ok, false);
  assert.match(again.error, /already enhanced/);

  const notTable = await callTool(registration, "rg_enhance_table", { uid: "notATable" });
  assert.equal(notTable.ok, false);
  assert.match(notTable.error, /not a native/);

  runtime.metadata = null; runtime.registries = null;
});

test("rg_restore_native restores by uid and refuses large grids", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addBlock("table0001", "{{[[table]]}}", null, rawTable("table0001").children);
  const registration = createExtensionToolsRegistration();
  await callTool(registration, "rg_enhance_table", { uid: "table0001" });

  const restored = await callTool(registration, "rg_restore_native", { uid: "table0001" });
  assert.equal(restored.ok, true);
  assert.equal(runtime.metadata.has("table0001"), false);

  await runtime.metadata.set("largeUid", new GridModel({ rows: [["x"]] }), "large");
  const large = await callTool(registration, "rg_restore_native", { uid: "largeUid" });
  assert.equal(large.ok, false);
  assert.match(large.error, /Large grids cannot/);

  const missing = await callTool(registration, "rg_restore_native", { uid: "never" });
  assert.equal(missing.ok, false);

  runtime.metadata = null; runtime.registries = null;
});

test("rg_create_table creates a 3x3 native table by default and clamps to 20x20", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addPage("Home", "pageHome");
  const registration = createExtensionToolsRegistration();

  const created = await callTool(registration, "rg_create_table", { parent_uid: "pageHome" });
  assert.equal(created.ok, true);
  assert.ok(created.uid);
  assert.equal(runtime.metadata.has(created.uid), true);
  const model = createPublicApi().getTableModel(created.uid);
  assert.equal(model.rows.length, 3);
  assert.equal(model.columnIds.length, 3);

  const huge = await callTool(registration, "rg_create_table", { parent_uid: "pageHome", rows: 99, cols: 99 });
  assert.equal(huge.ok, true);
  const hugeModel = createPublicApi().getTableModel(huge.uid);
  assert.equal(hugeModel.rows.length, 20);
  assert.equal(hugeModel.columnIds.length, 20);

  const noParent = await callTool(registration, "rg_create_table", {});
  assert.equal(noParent.ok, false);

  runtime.metadata = null; runtime.registries = null;
});

test("rg_set_cell and rg_add_formula route through v1.applyPatch and return the model", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addBlock("table0001", "{{[[table]]}}", null, rawTable("table0001").children);
  const registration = createExtensionToolsRegistration();
  await callTool(registration, "rg_enhance_table", { uid: "table0001" });

  const set = await callTool(registration, "rg_set_cell", { uid: "table0001", row: 1, col: 1, value: "42" });
  assert.equal(set.ok, true);
  assert.equal(set.model.rows[1][1].raw, "42");

  const formula = await callTool(registration, "rg_add_formula", { uid: "table0001", row: 1, col: 0, formula: "=1+2" });
  assert.equal(formula.ok, true);
  assert.equal(formula.model.rows[1][0].raw, "=1+2");

  const prefixed = await callTool(registration, "rg_add_formula", { uid: "table0001", row: 0, col: 1, formula: "B2+B2" });
  assert.equal(prefixed.ok, true);
  assert.equal(prefixed.model.rows[0][1].raw, "=B2+B2", "a missing leading = is added");

  const bad = await callTool(registration, "rg_add_formula", { uid: "table0001", row: 0, col: 0, formula: "==bad" });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /`==`/);

  runtime.metadata = null; runtime.registries = null;
});

test("rg_apply_patch routes an object or array through v1.applyPatch", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addBlock("table0001", "{{[[table]]}}", null, rawTable("table0001").children);
  const registration = createExtensionToolsRegistration();
  await callTool(registration, "rg_enhance_table", { uid: "table0001" });

  const single = await callTool(registration, "rg_apply_patch", { uid: "table0001", patch: { op: "set", row: 0, col: 0, value: "X" } });
  assert.equal(single.ok, true);
  assert.equal(single.model.rows[0][0].raw, "X");

  const array = await callTool(registration, "rg_apply_patch", { uid: "table0001", patch: [
    { op: "set", row: 1, col: 0, value: "P" },
    { op: "set", row: 1, col: 1, value: "Q" },
  ] });
  assert.equal(array.ok, true);
  assert.equal(array.model.rows[1][0].raw, "P");
  assert.equal(array.model.rows[1][1].raw, "Q");

  const bad = await callTool(registration, "rg_apply_patch", { uid: "table0001", patch: "not-a-patch" });
  assert.equal(bad.ok, false);

  runtime.metadata = null; runtime.registries = null;
});

test("rg_list_templates returns the saved template name list", async (t) => {
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  runtime.templates = { list: () => ["Meal Plan", "Budget"], get: () => null };
  const registration = createExtensionToolsRegistration();
  const list = await callTool(registration, "rg_list_templates");
  assert.equal(list.ok, true);
  assert.deepEqual(list.templates, ["Budget", "Meal Plan"]);
  runtime.metadata = null; runtime.registries = null; runtime.templates = null;
});

test("v1.listGrids / enhanceTable / restoreNative / createTable mirror the tool implementations", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addBlock("table0001", "{{[[table]]}}", null, rawTable("table0001").children);
  mock.addPage("Home", "pageHome");

  const api = createPublicApi();
  assert.deepEqual(api.listGrids(), []);

  await api.enhanceTable("table0001");
  const grids = api.listGrids();
  assert.equal(grids.length, 1);
  assert.equal(grids[0].uid, "table0001");
  assert.equal(grids[0].mode, "native");
  assert.equal(grids[0].rows, 2);

  await api.restoreNative("table0001");
  assert.equal(runtime.metadata.has("table0001"), false);

  const newUid = await api.createTable({ parentUid: "pageHome", rows: 4, cols: 2 });
  assert.equal(runtime.metadata.has(newUid), true);
  assert.equal(api.getTableModel(newUid).rows.length, 4);

  await assert.rejects(api.createTable({}), /parentUid or afterUid/);

  runtime.metadata = null; runtime.registries = null;
});

test("savedTemplateNameList still works without a runtime (no throw on null stores)", () => {
  const previousRegistries = runtime.registries;
  const previousTemplates = runtime.templates;
  runtime.registries = null;
  runtime.templates = null;
  try {
    assert.deepEqual(savedTemplateNameList(), []);
  } finally {
    runtime.registries = previousRegistries;
    runtime.templates = previousTemplates;
  }
});

test("rg_create_table builds a nested table: 4 row roots each holding nested col cells, not 20 flat siblings", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addPage("Home", "pageHome");
  const registration = createExtensionToolsRegistration();

  const created = await callTool(registration, "rg_create_table", { parent_uid: "pageHome", rows: 4, cols: 5 });
  assert.equal(created.ok, true);

  const tableNode = mock.blocks.get(created.uid);
  assert.equal(tableNode.children.length, 4, "table has 4 row roots, not 20 flat siblings");
  let chainDepth = 0; let cursor = tableNode.children[0];
  while (cursor) { chainDepth += 1; cursor = (cursor.children || [])[0] || null; }
  assert.equal(chainDepth, 5, "first row root holds a 5-deep first-child chain (1 root + 4 nested cols), not flat siblings");

  const model = createPublicApi().getTableModel(created.uid);
  assert.equal(model.rows.length, 4);
  assert.equal(model.columnIds.length, 5);

  runtime.metadata = null; runtime.registries = null;
});

test("a flat 20-sibling {{table}} enhances to 20x1 then resizes to a nested 4x4 tree", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();

  const flatChildren = Array.from({ length: 20 }, (_, index) => ({ uid: `flat${String(index).padStart(2, "0")}`, string: " ", order: index, children: [] }));
  mock.addBlock("flatTable", "{{[[table]]}}", null, flatChildren);

  const registration = createExtensionToolsRegistration();
  const enhanced = await callTool(registration, "rg_enhance_table", { uid: "flatTable" });
  assert.equal(enhanced.ok, true);

  const beforeModel = createPublicApi().getTableModel("flatTable");
  assert.equal(beforeModel.rows.length, 20, "flat siblings walk as 20 rows");
  assert.equal(beforeModel.columnIds.length, 1, "each flat sibling has no nested col chain, so 1 col");

  const resized = await callTool(registration, "rg_resize_table", { uid: "flatTable", rows: 4, cols: 4 });
  assert.equal(resized.ok, true);

  const afterModel = createPublicApi().getTableModel("flatTable");
  assert.equal(afterModel.rows.length, 4);
  assert.equal(afterModel.columnIds.length, 4);

  const tableNode = mock.blocks.get("flatTable");
  assert.equal(tableNode.children.length, 4, "resize nests into 4 row roots");
  assert.ok(tableNode.children[0].children.length >= 1, "first row now has nested col children (cols > 1)");

  runtime.metadata = null; runtime.registries = null;
});

test("rg_set_cell + rg_add_formula produce a computed formula value via GridModel.fromJSON", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addPage("Home", "pageHome");
  const registration = createExtensionToolsRegistration();

  const created = await callTool(registration, "rg_create_table", { parent_uid: "pageHome", rows: 3, cols: 3 });
  const uid = created.uid;

  await callTool(registration, "rg_set_cell", { uid, row: 0, col: 0, value: "10" });
  await callTool(registration, "rg_set_cell", { uid, row: 0, col: 1, value: "20" });
  await callTool(registration, "rg_add_formula", { uid, row: 0, col: 2, formula: "A1+B1" });

  const model = GridModel.fromJSON(createPublicApi().getTableModel(uid));
  assert.equal(model.getValue(0, 2), 30, "formula cell evaluates A1+B1 = 10+20");

  const cell = await callTool(registration, "rg_get_cell", { uid, row: 0, col: 2 });
  assert.equal(cell.ok, true);
  assert.equal(cell.value, 30, "rg_get_cell value evaluates the formula");
  assert.ok(String(cell.raw).startsWith("="), "rg_get_cell raw is the formula string");

  runtime.metadata = null; runtime.registries = null;
});

test("rg_apply_patch merge produces a nonempty merges list (single-cell and nonempty covers are refused)", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addPage("Home", "pageHome");
  const registration = createExtensionToolsRegistration();

  const created = await callTool(registration, "rg_create_table", { parent_uid: "pageHome", rows: 3, cols: 3 });
  const uid = created.uid;

  const merged = await callTool(registration, "rg_apply_patch", { uid, patch: { op: "merge", range: { startRow: 0, startCol: 0, endRow: 0, endCol: 1 } } });
  assert.equal(merged.ok, true);
  assert.ok(merged.model.merges.length > 0, "merge produced a nonempty merges list");

  runtime.metadata = null; runtime.registries = null;
});

test("rg_insert_cols/rg_delete_cols/rg_merge/rg_unmerge/rg_sort/rg_export_grid cover the full toolbar by uid", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addPage("Home", "pageHome");
  const registration = createExtensionToolsRegistration();

  const created = await callTool(registration, "rg_create_table", { parent_uid: "pageHome", rows: 4, cols: 3 });
  const uid = created.uid;
  assert.equal(created.ok, true);

  // Fill unique strings so sort/export have content. Row 0 is the frozen header.
  await callTool(registration, "rg_fill", { uid, start_row: 1, start_col: 0, values: [["zebra", "apple", "mango"], ["pear", "banana", "cherry"], ["fig", "date", "kiwi"]] });

  // insert_cols then delete_cols restores colCount to original (3).
  const inserted = await callTool(registration, "rg_insert_cols", { uid, index: 1, count: 1 });
  assert.equal(inserted.ok, true);
  assert.equal(inserted.model.columnIds.length, 4, "insert_cols grows colCount to 4");
  const deleted = await callTool(registration, "rg_delete_cols", { uid, index: 1, count: 1 });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.model.columnIds.length, 3, "delete_cols restores colCount to 3");

  // merge then unmerge leaves merges empty.
  const merged = await callTool(registration, "rg_merge", { uid, start_row: 0, start_col: 0, end_row: 0, end_col: 1 });
  assert.equal(merged.ok, true);
  assert.ok(merged.model.merges.length > 0, "merge produced a merge");
  const unmerged = await callTool(registration, "rg_unmerge", { uid, row: 0, col: 0 });
  assert.equal(unmerged.ok, true);
  assert.equal(unmerged.model.merges.length, 0, "unmerge cleared merges");

  // Sort by col 0 desc — data rows reorder, header row 0 stays put (headerRows = frozenRows = 1).
  const headerBefore = createPublicApi().getTableModel(uid).rows[0].map((cell) => cell.raw);
  const sorted = await callTool(registration, "rg_sort", { uid, col: 0, direction: "desc" });
  assert.equal(sorted.ok, true);
  const sortedModel = createPublicApi().getTableModel(uid);
  const headerAfter = sortedModel.rows[0].map((cell) => cell.raw);
  assert.deepEqual(headerAfter, headerBefore, "header row is unchanged by sort");
  const dataCol = sortedModel.rows.slice(1).map((row) => row[0].raw);
  assert.deepEqual(dataCol, ["zebra", "pear", "fig"], "data rows sorted desc by col 0");

  // Export to CSV: contains a comma (delimiter) and a newline (row break). No download.
  const exported = await callTool(registration, "rg_export_grid", { uid, format: "csv" });
  assert.equal(exported.ok, true);
  assert.ok(exported.text.includes(","), "csv contains a comma delimiter");
  assert.ok(exported.text.includes("\n"), "csv contains a newline row break");

  // tsv contains a tab.
  const tsv = await callTool(registration, "rg_export_grid", { uid, format: "tsv" });
  assert.equal(tsv.ok, true);
  assert.ok(tsv.text.includes("\t"), "tsv contains a tab delimiter");

  runtime.metadata = null; runtime.registries = null;
});

test("rg_insert_chart pushes a chart spec onto the model", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addPage("Home", "pageHome");
  const registration = createExtensionToolsRegistration();

  const created = await callTool(registration, "rg_create_table", { parent_uid: "pageHome", rows: 3, cols: 3 });
  const uid = created.uid;

  const before = createPublicApi().getTableModel(uid).charts.length;
  const chart = await callTool(registration, "rg_insert_chart", { uid, type: "line", start_row: 0, start_col: 0, end_row: 2, end_col: 2 });
  assert.equal(chart.ok, true);
  assert.equal(chart.charts, before + 1, "model.charts grew by 1");
  const after = createPublicApi().getTableModel(uid).charts.length;
  assert.equal(after, before + 1, "chart persisted in the stored model");

  const bad = await callTool(registration, "rg_insert_chart", { uid, type: "pie", start_row: 0, start_col: 0, end_row: 1, end_col: 1 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /type must be/);

  runtime.metadata = null; runtime.registries = null;
});

test("rg_delete_rows refuses the last row and rg_delete_cols refuses the last column", async (t) => {
  const mock = installTableRoamMock();
  t.after(mock.dispose);
  const restoreDocument = installDocumentStub();
  t.after(restoreDocument);
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addPage("Home", "pageHome");
  const registration = createExtensionToolsRegistration();

  const created = await callTool(registration, "rg_create_table", { parent_uid: "pageHome", rows: 2, cols: 2 });
  const uid = created.uid;

  // Delete all rows (2) -> refuses.
  const allRows = await callTool(registration, "rg_delete_rows", { uid, index: 0, count: 2 });
  assert.equal(allRows.ok, false);
  assert.match(allRows.error, /at least one row/);

  // Delete all cols (2) -> refuses.
  const allCols = await callTool(registration, "rg_delete_cols", { uid, index: 0, count: 2 });
  assert.equal(allCols.ok, false);
  assert.match(allCols.error, /at least one column/);

  // A 1-row table: delete the single row -> refuses.
  const single = await callTool(registration, "rg_create_table", { parent_uid: "pageHome", rows: 1, cols: 2 });
  const singleUid = single.uid;
  const lastRow = await callTool(registration, "rg_delete_rows", { uid: singleUid, index: 0, count: 1 });
  assert.equal(lastRow.ok, false);
  assert.match(lastRow.error, /at least one row/);

  // A 1-col table: delete the single col -> refuses.
  const singleCol = await callTool(registration, "rg_create_table", { parent_uid: "pageHome", rows: 2, cols: 1 });
  const singleColUid = singleCol.uid;
  const lastCol = await callTool(registration, "rg_delete_cols", { uid: singleColUid, index: 0, count: 1 });
  assert.equal(lastCol.ok, false);
  assert.match(lastCol.error, /at least one column/);

  runtime.metadata = null; runtime.registries = null;
});