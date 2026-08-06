import test from "node:test";
import assert from "node:assert/strict";
import extension, {
  GridModel,
  LargeGridStore,
  MetadataStore,
  enhancedUidGuardCss,
  initializeSettings,
  mounting,
  pendingTimers,
} from "../src/extension.js";

function installMetadataRoamMock() {
  let uidCounter = 0;
  const pages = new Map();
  const blocks = new Map();
  const created = { pages: [], blocks: [], updates: [] };
  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (_query, uid) => (uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []),
    data: {
      pull: (_pattern, [, title]) => (pages.has(title) ? { ":block/uid": pages.get(title) } : null),
      page: { create: async ({ page }) => { pages.set(page.title, page.uid); blocks.set(page.uid, { uid: page.uid, string: page.title, order: 0, children: [] }); created.pages.push(page.title); } },
      block: {
        create: async ({ location, block }) => { const node = { ...block, order: 0, children: [] }; blocks.set(block.uid, node); blocks.get(location["parent-uid"])?.children.push(node); created.blocks.push(block.uid); },
        update: async ({ block }) => { blocks.get(block.uid).string = block.string; created.updates.push(block.uid); },
      },
    },
  } };
  return { pages, blocks, created, dispose: () => delete globalThis.window };
}

function installLargeGridRoamMock(initial = {}) {
  let uidCounter = 0;
  let fileCounter = 0;
  const blocks = new Map();
  const files = new Map();
  const pointerWrites = [];
  const add = (uid, string, children = []) => blocks.set(uid, { uid, string, order: 0, children });
  for (const [uid, value] of Object.entries(initial.blocks || {})) add(uid, value.string, value.children || []);
  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (_query, uid) => (uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []),
    data: { block: {
      create: async ({ location, block }) => { const node = { ...block, order: 0, children: [] }; blocks.set(block.uid, node); blocks.get(location["parent-uid"]).children.push(node); },
      update: async ({ block }) => { blocks.get(block.uid).string = block.string; pointerWrites.push(block.string); },
    } },
    file: {
      upload: async ({ file }) => { const url = `https://mock/${++fileCounter}`; files.set(url, await file.text()); return url; },
      get: async ({ url }) => { if (!files.has(url)) throw new Error(`missing ${url}`); return new File([files.get(url)], "grid.json", { type: "application/json" }); },
    },
  } };
  return { blocks, pointerWrites, dispose: () => delete globalThis.window };
}

test("metadata store initializes read-only and defers page creation to the first write", async (t) => {
  const mock = installMetadataRoamMock();
  t.after(mock.dispose);
  const store = new MetadataStore();
  await store.initialize();
  assert.equal(store.pageUid, null);
  assert.deepEqual(mock.created.pages, []);
  assert.equal(mock.pages.has("roam/grid/metadata"), false);
  assert.equal(store.get("table001"), null);
  assert.equal(store.has("table001"), false);

  await store.set("table001", new GridModel({ rows: [["A"], ["B"]] }));
  assert.deepEqual(mock.created.pages, ["roam/grid/metadata"]);
  assert.equal(store.pageUid, mock.pages.get("roam/grid/metadata"));
  assert.equal(mock.created.blocks.length, 1);
  assert.equal(store.has("table001"), true);

  await store.set("table002", new GridModel({ rows: [["C"]] }));
  assert.deepEqual(mock.created.pages, ["roam/grid/metadata"]);
  assert.equal(mock.created.blocks.length, 2);
});

test("metadata store reuses an existing page and creates staging blocks lazily", async (t) => {
  const mock = installMetadataRoamMock();
  t.after(mock.dispose);
  const store = new MetadataStore();
  await store.initialize();
  assert.equal(store.pageUid, null);
  const staging = await store.createStaging("table003");
  assert.deepEqual(mock.created.pages, ["roam/grid/metadata"]);
  assert.equal(mock.blocks.get(staging).string, "roam-grid/staging:: table003");

  const second = new MetadataStore();
  await second.initialize();
  assert.equal(second.pageUid, mock.pages.get("roam/grid/metadata"));
  assert.deepEqual(mock.created.pages, ["roam/grid/metadata"]);
});

test("pre-paint guard emits nothing above the uid cap and warns once", () => {
  const warnings = [];
  const previousWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const under = new Set(Array.from({ length: 2000 }, (_, index) => `uid${index}`));
    assert.notEqual(enhancedUidGuardCss(under), "");
    assert.deepEqual(warnings, []);

    const over = new Set(Array.from({ length: 2001 }, (_, index) => `uid${index}`));
    assert.equal(enhancedUidGuardCss(over), "");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /2001 cached table uids exceeds the 2000 cap/);
  } finally {
    console.warn = previousWarn;
  }
});

test("settings initialization performs zero writes when the graph forbids them", async () => {
  const writes = [];
  const panels = [];
  const readOnly = { settings: { canSet: false, get: () => null, set: async (key, value) => writes.push([key, value]), panel: { create: async (config) => panels.push(config) } } };
  await initializeSettings(readOnly);
  assert.deepEqual(writes, []);
  assert.equal(panels.length, 1);
  assert.equal(panels[0].tabTitle, "Roam Grid");

  const writable = { settings: { get: () => null, set: async (key, value) => writes.push([key, value]), panel: { create: async () => {} } } };
  await initializeSettings(writable);
  assert.deepEqual(writes, [["nativeMutationBudget", 1200]]);

  const alreadySet = { settings: { canSet: true, get: () => 500, set: async (key, value) => writes.push([key, value]), panel: { create: async () => {} } } };
  await initializeSettings(alreadySet);
  assert.equal(writes.length, 1);
});

test("large grid store refuses the pointer write after dispose", async (t) => {
  const mock = installLargeGridRoamMock({ blocks: { anchorLc1: { string: "{{[[roam/grid]]}}", children: [] } } });
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchorLc1").initialize(new GridModel({ rows: [["a", "b"], ["c", "d"]] }));
  const writesAfterSeed = mock.pointerWrites.length;
  const pointerString = mock.blocks.get(store.pointerUid).string;

  await store.setCell(0, 0, "changed");
  store.dispose();
  assert.equal(store.disposed, true);
  await assert.rejects(() => store.commit(), (error) => error.code === "DISPOSED");
  assert.equal(mock.pointerWrites.length, writesAfterSeed);
  assert.equal(mock.blocks.get(store.pointerUid).string, pointerString);

  store.cache.clear();
  const chunk = await store.loadChunk(0);
  assert.equal(chunk.rows.length, 2);
  assert.equal(store.cache.size, 0);
});

test("unload clears the tracked timer registry and the in-flight mount set", async () => {
  const removed = [];
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = { querySelectorAll: () => [{ remove: () => removed.push("toasts") }] };
  delete globalThis.window;
  const timer = setTimeout(() => {}, 60_000);
  pendingTimers.add(timer);
  mounting.add("mount-in-flight");
  try {
    await extension.onunload();
    assert.equal(pendingTimers.size, 0);
    assert.equal(mounting.size, 0);
    assert.deepEqual(removed, ["toasts"]);
  } finally {
    clearTimeout(timer);
    pendingTimers.clear();
    mounting.clear();
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});

test("unload removes the window.roamGrid husk it created but keeps a pre-existing namespace", async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = { querySelectorAll: () => [] };
  try {
    globalThis.window = { roamGrid: { v1: { version: "0.0.0-test" } } };
    await extension.onunload();
    assert.deepEqual(globalThis.window.roamGrid, { v1: { version: "0.0.0-test" } });

    globalThis.window = { roamGrid: {} };
    await extension.onunload();
    assert.equal("roamGrid" in globalThis.window, false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});
