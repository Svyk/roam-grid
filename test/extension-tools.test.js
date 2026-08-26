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
        create: async ({ location, block }) => { const node = { ...block, order: 0, children: [] }; blocks.set(block.uid, node); blocks.get(location["parent-uid"])?.children.push(node); },
        update: async ({ block }) => { if (blocks.has(block.uid)) blocks.get(block.uid).string = block.string; },
        delete: async ({ block }) => {
          for (const node of blocks.values()) {
            const index = (node.children || []).findIndex((child) => child.uid === block.uid);
            if (index >= 0) node.children.splice(index, 1);
          }
          blocks.delete(block.uid);
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
  assert.equal(registration.version, "0.18.0");
  const names = registration.tools.map((tool) => tool.name);
  assert.deepEqual(names.sort(), [
    "rg_add_formula", "rg_apply_patch", "rg_create_from_template", "rg_create_table",
    "rg_enhance_table", "rg_get_grid", "rg_list_grids", "rg_list_templates",
    "rg_restore_native", "rg_set_cell",
  ]);
  for (const readOnly of ["rg_list_grids", "rg_get_grid", "rg_list_templates"]) {
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