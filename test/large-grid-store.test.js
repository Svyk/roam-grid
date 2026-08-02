import test from "node:test";
import assert from "node:assert/strict";
import { GridModel, LargeGridStore } from "../src/extension.js";

function installRoamMock(initial = {}) {
  let uidCounter = 0;
  let fileCounter = 0;
  const blocks = new Map();
  const files = new Map();
  const uploads = [];
  const downloads = [];

  const add = (uid, string, children = []) => {
    const block = { uid, string, order: 0, children };
    blocks.set(uid, block);
    for (const child of children) addExisting(child);
    return block;
  };
  const addExisting = (block) => {
    blocks.set(block.uid, block);
    for (const child of block.children || []) addExisting(child);
  };
  for (const [uid, value] of Object.entries(initial.blocks || {})) add(uid, value.string, value.children || []);
  for (const [url, value] of Object.entries(initial.files || {})) files.set(url, typeof value === "string" ? value : JSON.stringify(value));

  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  const findParent = (uid) => [...blocks.values()].find((block) => block.children?.some((child) => child.uid === uid));
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (query) => { const uid = /:block\/uid \"([^\"]+)\"/.exec(query)?.[1]; return uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []; },
    data: { block: {
      create: async ({ location, block }) => { const created = { ...block, order: location.order === "last" ? 999 : location.order, children: [] }; blocks.set(block.uid, created); blocks.get(location["parent-uid"]).children.push(created); },
      update: async ({ block }) => { blocks.get(block.uid).string = block.string; },
      move: async ({ location, block }) => { const parent = findParent(block.uid); if (parent) parent.children = parent.children.filter((child) => child.uid !== block.uid); blocks.get(location["parent-uid"]).children.push(blocks.get(block.uid)); },
      delete: async ({ block }) => { const parent = findParent(block.uid); if (parent) parent.children = parent.children.filter((child) => child.uid !== block.uid); blocks.delete(block.uid); },
    } },
    file: {
      upload: async ({ file }) => { const url = `https://mock/${++fileCounter}`; const text = await file.text(); files.set(url, text); uploads.push({ url, text: JSON.parse(text) }); return url; },
      get: async ({ url }) => { downloads.push(url); if (!files.has(url)) throw new Error(`missing ${url}`); return new File([files.get(url)], "grid.json", { type: "application/json" }); },
      delete: async ({ url }) => files.delete(url),
    },
  } };
  return { blocks, files, uploads, downloads, dispose: () => delete globalThis.window };
}

test("large grid seeds immutable chunks and verified manifest pointer", async (t) => {
  const mock = installRoamMock({ blocks: { anchor001: { string: "{{[[roam/grid]]}}", children: [] } } });
  t.after(mock.dispose);
  const rows = Array.from({ length: 501 }, (_, row) => [String(row), `v${row}`]);
  const store = await new LargeGridStore("anchor001").initialize(new GridModel({ rows, showHeaders: false }));
  assert.equal(store.manifest.chunks.length, 2);
  assert.equal(store.manifest.rowCount, 501);
  assert.equal(store.manifest.showHeaders, false);
  assert.match(mock.blocks.get(store.pointerUid).string, /^roam-grid\/manifest:: https:\/\/mock\//);
  assert.equal(mock.uploads.filter((item) => item.text.schema === "roam-grid/chunk").length, 2);
  assert.equal((await store.getRows(499, 501))[1][1], "v500");
});

test("single-cell edit uploads only its dirty chunk and a new manifest", async (t) => {
  const mock = installRoamMock({ blocks: { anchor002: { string: "{{[[roam/grid]]}}", children: [] } } });
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor002").initialize(new GridModel({ rows: Array.from({ length: 700 }, (_, row) => [String(row)]) }));
  const before = mock.uploads.length;
  await store.setCell(510, 0, "changed");
  await store.commit();
  const newUploads = mock.uploads.slice(before);
  assert.equal(newUploads.filter((item) => item.text.schema === "roam-grid/chunk").length, 1);
  assert.equal(newUploads.filter((item) => item.text.schema === "roam-grid/manifest").length, 1);
  assert.equal(await store.getRaw(510, 0), "changed");
  assert.ok(store.manifest.previous);
});

test("large-grid row heights and column widths persist in manifest-only saves", async (t) => {
  const mock = installRoamMock({ blocks: { anchor006: { string: "{{[[roam/grid]]}}", children: [] } } });
  t.after(mock.dispose);
  const model = new GridModel({ rows: [[{ uid: "row-one", raw: "a" }, { uid: "cell-two", raw: "b" }]], columnIds: ["col-a", "col-b"], widths: { "col-a": 190 }, rowHeights: { "row-one": 44 }, alignments: { "cell-two": "right" }, fitToWidth: false });
  const store = await new LargeGridStore("anchor006").initialize(model);
  assert.equal(store.rowHeight(0), 44);
  assert.equal(store.manifest.widths["col-a"], 190);
  assert.equal(store.getAlignment(0, 1), "right");
  assert.equal(store.manifest.fitToWidth, false);
  const before = mock.uploads.length;
  store.setRowHeight(0, 58);
  store.setColumnWidth(1, 230);
  store.setAlignment(0, 0, "center");
  await store.commit();
  const uploads = mock.uploads.slice(before);
  assert.equal(uploads.filter((item) => item.text.schema === "roam-grid/chunk").length, 0);
  assert.equal(uploads.filter((item) => item.text.schema === "roam-grid/manifest").length, 1);
  assert.equal(store.rowHeight(0), 58);
  assert.equal(store.manifest.widths["col-b"], 230);
  const roundTrip = await store.toModel();
  assert.equal(roundTrip.getRowHeight(0), 58);
  assert.equal(roundTrip.widths["col-b"], 230);
  assert.equal(roundTrip.getAlignment(0, 0), "center");
  assert.equal(roundTrip.getAlignment(0, 1), "right");
  assert.equal(roundTrip.fitToWidth, false);
});

test("large grid refuses stale manifest overwrite", async (t) => {
  const mock = installRoamMock({ blocks: { anchor003: { string: "{{[[roam/grid]]}}", children: [] } } });
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor003").initialize(new GridModel({ rows: [["a"]] }));
  await store.setCell(0, 0, "b");
  mock.blocks.get(store.pointerUid).string = "roam-grid/manifest:: https://mock/external";
  await assert.rejects(store.commit(), { code: "CONFLICT" });
  assert.equal(store.dirty.size, 1);
});

test("large grid merge enforces non-destructive issue #9 invariant", async (t) => {
  const mock = installRoamMock({ blocks: { anchor004: { string: "{{[[roam/grid]]}}", children: [] } } });
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor004").initialize(new GridModel({ rows: [["anchor", "blocked"], ["", ""]] }));
  await assert.rejects(store.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 }), { code: "MERGE_NONEMPTY" });
  await store.setCell(0, 1, "");
  await store.merge({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 });
  assert.equal(store.mergeAt(1, 1).rowSpan, 2);
  await assert.rejects(store.setCell(1, 1, "hidden"), { code: "MERGE_COVERED" });
});

test("100k-row manifest loads only the visible chunk", async (t) => {
  const chunks = Array.from({ length: 200 }, (_, index) => ({ index, startRow: index * 500, rowCount: 500, url: `https://mock/chunk-${index}` }));
  const manifest = { schema: "roam-grid/manifest", version: 1, revision: "rev", rowCount: 100000, colCount: 26, columnIds: Array.from({ length: 26 }, (_, index) => `col${index}`), widths: {}, frozenRows: 1, frozenCols: 0, merges: [], charts: [], chunks, retained: [] };
  const mock = installRoamMock({
    blocks: { anchor005: { string: "{{[[roam/grid]]}}", children: [{ uid: "pointer05", string: "roam-grid/manifest:: https://mock/manifest", order: 0, children: [] }] } },
    files: { "https://mock/manifest": manifest, "https://mock/chunk-100": { schema: "roam-grid/chunk", version: 1, index: 100, startRow: 50000, rows: Array.from({ length: 500 }, (_, row) => [`row${50000 + row}`]) } },
  });
  t.after(mock.dispose);
  const store = await new LargeGridStore("anchor005").initialize();
  mock.downloads.length = 0;
  const rows = await store.getRows(50010, 50030);
  assert.equal(rows[0][0], "row50010");
  assert.deepEqual(mock.downloads, ["https://mock/chunk-100"]);
});
