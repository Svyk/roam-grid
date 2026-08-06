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
  settingsCache,
  toast,
} from "../src/extension.js";

function installFakeDom() {
  const created = [];
  const appendedToBody = [];
  const makeElement = () => {
    const element = { className: "", textContent: "", id: "", isConnected: false, children: [], style: { setProperty() {} }, classList: { add() {}, remove() {} }, addEventListener() {} };
    element.appendChild = (child) => { element.children.push(child); return child; };
    element.remove = () => {};
    element.querySelectorAll = () => [];
    created.push(element);
    return element;
  };
  const body = makeElement();
  body.appendChild = (child) => { appendedToBody.push(child); child.isConnected = true; return child; };
  const document = {
    body,
    querySelector: (selector) => (selector === ".rg-toasts" ? appendedToBody.find((node) => node.className === "rg-toasts") || null : null),
    querySelectorAll: () => [],
    createElement: makeElement,
    addEventListener() {},
    removeEventListener() {},
  };
  return { document, created, appendedToBody, makeElement };
}


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
  await initializeSettings(readOnly, { storage: null });
  assert.deepEqual(writes, []);
  assert.equal(panels.length, 1);
  assert.equal(panels[0].tabTitle, "Roam Grid");
  assert.ok(panels[0].settings.some((row) => row.id === "writes-native-budget"));

  const writable = { settings: { get: () => null, set: async (key, value) => writes.push([key, value]), panel: { create: async () => {} } } };
  await initializeSettings(writable, { storage: null });
  assert.deepEqual(writes[0], ["settingsVersion", 1]);
  assert.ok(writes.some(([key, value]) => key === "writes-native-budget" && value === 1200));
  const seeded = writes.length;

  const alreadySet = { settings: { canSet: true, get: () => 500, set: async (key, value) => writes.push([key, value]), panel: { create: async () => {} } } };
  await initializeSettings(alreadySet, { storage: null });
  assert.equal(writes.length, seeded, "a graph that already holds every key must not be reseeded");
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

/**
 * The read site, not the predicate. `toast` is where every message in the file converges, so the
 * level has to be consulted there — a gate placed in any single caller would leave the other 70-odd
 * unaffected. The actionable message is asserted separately because suppressing it would delete the
 * only control the user has for that action.
 */
test("the notification level suppresses notices inside toast itself, but never an actionable one", async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousObserver = globalThis.MutationObserver;
  const mock = installMetadataRoamMock();
  const dom = installFakeDom();
  globalThis.document = dom.document;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  const extensionAPI = {
    settings: { canSet: false, get: () => null, set: async () => {}, panel: { create: async () => {} } },
    ui: { commandPalette: { addCommand() {} }, slashCommand: { addCommand() {} } },
  };
  try {
    await extension.onload({ extensionAPI });
    await Promise.resolve();
    settingsCache.set("appearance-notifications", "Errors only");
    toast("saved", "success", 60_000);
    toast("careful", "warning", 60_000);
    toast("broke", "danger", 60_000);
    toast("edits were discarded", "warning", 60_000, { action: { label: "Restore", onClick() {} } });
    const container = dom.appendedToBody.find((node) => node.className === "rg-toasts");
    assert.ok(container, "the error still had to paint, so the container exists");
    assert.deepEqual(container.children.map((child) => child.className), ["rg-toast rg-toast--danger", "rg-toast rg-toast--warning"]);
    assert.equal(container.children[0].textContent, "broke");

    settingsCache.set("appearance-notifications", "All");
    toast("saved", "success", 60_000);
    assert.equal(container.children.length, 3, "restoring the default lets a success notice through again");
  } finally {
    await extension.onunload();
    for (const id of pendingTimers) clearTimeout(id);
    pendingTimers.clear();
    mock.dispose();
    if (previousObserver === undefined) delete globalThis.MutationObserver; else globalThis.MutationObserver = previousObserver;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});

test("toast paints while loaded and is inert once the runtime is torn down", async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousObserver = globalThis.MutationObserver;
  const mock = installMetadataRoamMock();
  const dom = installFakeDom();
  globalThis.document = dom.document;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  const extensionAPI = {
    settings: { canSet: false, get: () => null, set: async () => {}, panel: { create: async () => {} } },
    ui: { commandPalette: { addCommand() {} }, slashCommand: { addCommand() {} } },
  };
  try {
    await extension.onload({ extensionAPI });
    await Promise.resolve();
    const timersWhileLoaded = pendingTimers.size;
    toast("loaded", "primary", 60_000);
    const container = dom.appendedToBody.find((node) => node.className === "rg-toasts");
    assert.ok(container, "toast must create its container while the extension is loaded");
    assert.equal(container.children.length, 1);
    assert.equal(container.children[0].textContent, "loaded");
    assert.equal(pendingTimers.size, timersWhileLoaded + 1, "a loaded toast must register a tracked dismiss timer");

    await extension.onunload();
    const bodyNodesAfterUnload = dom.appendedToBody.length;
    const childrenAfterUnload = container.children.length;
    assert.equal(pendingTimers.size, 0);

    toast("after unload", "danger");
    assert.equal(dom.appendedToBody.length, bodyNodesAfterUnload, "a post-unload toast must not append a .rg-toasts container");
    assert.equal(container.children.length, childrenAfterUnload, "a post-unload toast must not append into a surviving container");
    assert.equal(pendingTimers.size, 0, "a post-unload toast must not register a timer");
  } finally {
    for (const id of pendingTimers) clearTimeout(id);
    pendingTimers.clear();
    mock.dispose();
    if (previousObserver === undefined) delete globalThis.MutationObserver; else globalThis.MutationObserver = previousObserver;
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
