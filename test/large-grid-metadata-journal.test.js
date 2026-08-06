import test from "node:test";
import assert from "node:assert/strict";
import {
  LARGE_METADATA_JOURNAL_LIMIT, LargeGridStore, LargeGridView, alignmentKey, refreshSettingsCache,
  resetChunkCache, resetOrphanCollection, settingsCache, sha256Hex,
} from "../src/extension.js";

const NO_STORAGE = { getItem: () => null, setItem: () => {} };
const withSettings = (values = {}) => refreshSettingsCache({ settings: { getAll: () => ({ ...values }) } }, NO_STORAGE);

const CHUNK_ROWS = 50;
const iso = (ms) => new Date(ms).toISOString();

/**
 * The merge suite's harness: `afterUpload` fires as each file lands, which is the only place a
 * test can write metadata *between* the manifest snapshot and the pointer swap — the window in
 * which a commit used to discard the write with the manifest object it landed in.
 */
function installRoamMock(initial = {}) {
  let uidCounter = 0;
  let fileCounter = 0;
  const blocks = new Map();
  const files = new Map();
  const uploads = [];
  const hooks = { afterUpload: null };

  for (const [uid, value] of Object.entries(initial.blocks || {})) {
    const block = { uid, string: value.string, order: 0, children: value.children || [] };
    blocks.set(uid, block);
    for (const child of block.children) blocks.set(child.uid, child);
  }
  for (const [url, value] of Object.entries(initial.files || {})) files.set(url, typeof value === "string" ? value : JSON.stringify(value));

  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: () => `uid${String(++uidCounter).padStart(6, "0")}` },
    q: (query, bound) => { const uid = bound ?? /:block\/uid "([^"]+)"/.exec(query)?.[1]; return uid && blocks.has(uid) ? [[clone(blocks.get(uid))]] : []; },
    data: { block: {
      create: async ({ location, block }) => { const created = { ...block, order: location.order === "last" ? 999 : location.order, children: [] }; blocks.set(block.uid, created); blocks.get(location["parent-uid"]).children.push(created); },
      update: async ({ block }) => { blocks.get(block.uid).string = block.string; },
    } },
    file: {
      upload: async ({ file }) => {
        const url = `https://mock/upload-${++fileCounter}`;
        const text = await file.text();
        const parsed = JSON.parse(text);
        files.set(url, text);
        uploads.push({ url, text: parsed });
        await hooks.afterUpload?.(parsed, url);
        return url;
      },
      get: async ({ url }) => { if (!files.has(url)) throw new Error(`missing ${url}`); return new File([files.get(url)], "grid.json", { type: "application/json" }); },
      delete: async ({ url }) => files.delete(url),
    },
  } };
  return { blocks, files, uploads, hooks, dispose: () => delete globalThis.window };
}

const manifestUploads = (mock) => mock.uploads.filter((item) => item.text.schema === "roam-grid/manifest");

async function chunkPayload(index, marker) {
  const text = JSON.stringify({ schema: "roam-grid/chunk", version: 1, index, startRow: index * CHUNK_ROWS, rows: Array.from({ length: CHUNK_ROWS }, (_, local) => [`${marker}${index * CHUNK_ROWS + local}`, "x"]) });
  return { text, digest: await sha256Hex(text) };
}

async function baseGrid(anchorUid, count = 2, extra = {}) {
  const files = {};
  const chunks = [];
  for (let index = 0; index < count; index += 1) {
    const url = `https://mock/chunk-${index}`;
    const { text, digest } = await chunkPayload(index, "r");
    files[url] = text;
    chunks.push({ index, startRow: index * CHUNK_ROWS, rowCount: CHUNK_ROWS, url, digest });
  }
  const manifest = {
    schema: "roam-grid/manifest", version: 2, revision: "rev-base", rowIdRevision: "rev-base", previous: null, lineage: [],
    createdAt: iso(0), rowCount: count * CHUNK_ROWS, colCount: 2, columnIds: ["cA", "cB"], widths: {}, chunkRows: CHUNK_ROWS,
    rowHeights: {}, rowHeightsByIndex: {}, alignments: {}, alignmentsByIndex: {},
    frozenRows: 0, frozenCols: 0, merges: [], charts: [], showHeaders: false, fitToWidth: true, colorFormulaCells: true,
    chunks, retained: [], garbage: [], ...extra,
  };
  files["https://mock/manifest-base"] = JSON.stringify(manifest);
  const pointerUid = `p-${anchorUid}`;
  const mock = installRoamMock({
    blocks: { [anchorUid]: { string: "{{[[roam/grid]]}}", children: [{ uid: pointerUid, string: "roam-grid/manifest:: https://mock/manifest-base", order: 0, children: [] }] } },
    files,
  });
  mock.manifest = manifest;
  mock.pointerUid = pointerUid;
  mock.rivals = 0;
  return mock;
}

/** Rewrites one chunk of a rival manifest to a fresh content-addressed url, the way `commit` does. */
async function rewriteChunk(mock, manifest, index, marker) {
  const { text, digest } = await chunkPayload(index, marker);
  const url = `https://mock/chunk-${index}-${marker}`;
  mock.files.set(url, text);
  const descriptor = manifest.chunks.find((chunk) => chunk.index === index);
  descriptor.url = url;
  descriptor.digest = digest;
}

/** Publishes another writer's manifest and repoints the pointer block at it. */
async function publishRival(mock, mutate, { from = mock.manifest } = {}) {
  const next = JSON.parse(JSON.stringify(from));
  next.revision = `rev-rival-${++mock.rivals}`;
  next.previous = "https://mock/manifest-base";
  next.lineage = [from.revision, ...(from.lineage || [])].slice(0, 16);
  await mutate?.(next, mock);
  const url = `https://mock/manifest-rival-${mock.rivals}`;
  mock.files.set(url, JSON.stringify(next));
  mock.blocks.get(mock.pointerUid).string = `roam-grid/manifest:: ${url}`;
  return { url, manifest: next };
}

const cleanup = (t, mock) => t.after(() => { mock.dispose(); resetChunkCache(); resetOrphanCollection(); settingsCache.clear(); });

/** Fires `write` the next time a manifest upload lands, then disarms. */
function onNextManifestUpload(mock, write) {
  mock.hooks.afterUpload = async (payload) => {
    if (payload.schema !== "roam-grid/manifest") return;
    mock.hooks.afterUpload = null;
    await write();
  };
}

test("a row height landing mid-commit is replayed onto the swapped manifest and rides the next save", async (t) => {
  const mock = await baseGrid("metaHeight");
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("metaHeight").initialize();
  await store.setCell(0, 0, "dirty"); // chunk 0 resident, so row 3 has a resolvable id
  const rowId = store.rowIdAt(3);

  onNextManifestUpload(mock, () => store.setRowHeight(3, 90));
  await store.commit();

  const uploaded = manifestUploads(mock).at(-1).text;
  assert.equal(uploaded.rowHeights?.[rowId], undefined, "the edit landed after the snapshot, so the uploaded bytes cannot contain it");
  assert.equal(store.rowHeight(3), 90, "but the replay puts it back onto the verified manifest");
  assert.equal(store.metadataDirty, true, "and the flag says the replayed value still needs saving");
  assert.equal(store.metadataJournal.length, 0, "the replayed entry is spent, not kept");

  await store.commit();
  assert.equal(manifestUploads(mock).at(-1).text.rowHeights[rowId], 90, "the next save persists the replayed value");
  assert.equal(store.metadataDirty, false);
  assert.equal(store.metadataReplaySkipped, 0, "nothing was skipped on a live row");
});

test("an alignment landing mid-commit survives the swap", async (t) => {
  const mock = await baseGrid("metaAlign");
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("metaAlign").initialize();
  await store.setCell(0, 0, "dirty");
  const key = alignmentKey(store.rowIdAt(1), "cB");

  onNextManifestUpload(mock, () => store.setAlignment(1, 1, "center"));
  await store.commit();

  assert.equal(manifestUploads(mock).at(-1).text.alignments?.[key], undefined);
  assert.equal(store.getAlignment(1, 1), "center");
  assert.equal(store.metadataDirty, true);

  await store.commit();
  assert.equal(manifestUploads(mock).at(-1).text.alignments[key], "center");
  assert.equal(store.metadataDirty, false);
});

test("a display flag flipped mid-commit through the view survives the swap", async (t) => {
  const mock = await baseGrid("metaFlag");
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("metaFlag").initialize();
  await store.setCell(0, 0, "dirty");
  // The view's own write path, with the DOM-facing halves stubbed away: this is the exact call a
  // header-menu click makes, and it used to set `metadataDirty` without recording the value.
  const view = { store, scheduleSave() {}, scheduleRender() {} };

  onNextManifestUpload(mock, () => LargeGridView.prototype.toggleHeaders.call(view));
  await store.commit();

  assert.equal(manifestUploads(mock).at(-1).text.showHeaders, false, "the uploaded manifest predates the toggle");
  assert.equal(store.manifest.showHeaders, true, "the replay carries the toggle onto the verified manifest");
  assert.equal(store.metadataDirty, true);

  await store.commit();
  assert.equal(manifestUploads(mock).at(-1).text.showHeaders, true);
  assert.equal(store.metadataDirty, false);
});

test("a metadata edit landing during a CAS retry survives, on the merged manifest", async (t) => {
  const mock = await baseGrid("metaRetry");
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("metaRetry").initialize();
  await store.setCell(0, 0, "dirty");
  const rowId = store.rowIdAt(3);

  let uploads = 0;
  mock.hooks.afterUpload = async (payload) => {
    if (payload.schema !== "roam-grid/manifest") return;
    uploads += 1;
    if (uploads === 1) await publishRival(mock, (next) => rewriteChunk(mock, next, 1, "theirs")); // loses the swap, forces attempt 2
    else { mock.hooks.afterUpload = null; store.setRowHeight(3, 90); } // lands after attempt 2's snapshot
  };
  await store.commit();

  assert.equal(uploads, 2, "the retry actually happened");
  assert.equal(store.manifest.chunks.find((chunk) => chunk.index === 1).url, "https://mock/chunk-1-theirs", "the merged manifest won the swap");
  assert.equal(store.rowHeight(3), 90, "and the mid-retry edit was replayed onto it, not onto the stale local copy");
  assert.equal(store.metadataDirty, true);

  await store.commit();
  assert.equal(manifestUploads(mock).at(-1).text.rowHeights[rowId], 90);
  assert.equal(store.metadataDirty, false);
});

test("a replayed op whose row the merge deleted is skipped and counted, never resurrected", async (t) => {
  const mock = await baseGrid("metaGone");
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("metaGone").initialize();
  await store.setCell(0, 0, "dirty");
  const rowId = store.rowIdAt(CHUNK_ROWS + 10); // row 60, in the band the rival is about to delete

  let uploads = 0;
  mock.hooks.afterUpload = async (payload) => {
    if (payload.schema !== "roam-grid/manifest") return;
    uploads += 1;
    if (uploads === 1) {
      await publishRival(mock, (next) => { next.rowCount = CHUNK_ROWS; next.chunks = next.chunks.filter((chunk) => chunk.index === 0); });
    } else { mock.hooks.afterUpload = null; store.setRowHeight(CHUNK_ROWS + 10, 90); }
  };
  await store.commit();

  assert.equal(uploads, 2);
  assert.equal(store.manifest.rowCount, CHUNK_ROWS, "the merge took the other writer's dimensions");
  assert.equal(store.metadataReplaySkipped, 1, "the replay refused the dead row and said so");
  assert.equal(store.manifest.rowHeights?.[rowId], undefined, "no height was resurrected for a row that no longer exists");
  assert.equal(store.metadataDirty, false, "a skipped op is not pending work");
});

test("the metadata journal respects its cap", async (t) => {
  const mock = await baseGrid("metaCap");
  cleanup(t, mock);
  withSettings();

  const store = await new LargeGridStore("metaCap").initialize();
  const writes = LARGE_METADATA_JOURNAL_LIMIT + 25;
  for (let i = 0; i < writes; i += 1) store.setDisplayFlag("showHeaders", i % 2 === 0);

  assert.equal(store.metadataJournal.length, LARGE_METADATA_JOURNAL_LIMIT, "the journal is bounded");
  assert.equal(store.metadataJournalDropped, 25, "and the overflow is counted, oldest first");
  assert.equal(store.metadataJournal[0].epoch, 26);
  assert.equal(store.metadataJournal.at(-1).epoch, writes);
});
