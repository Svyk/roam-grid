import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel,
  GridView,
  LargeGridView,
  RangeGridView,
  applyCellImageLayout,
  cellImageMarkdown,
  claimKeyboard,
  imageDimensionCache,
  keyboardOwner,
  onGlobalKeydown,
  openImageLightbox,
  paintRichCellContent,
  releaseKeyboard,
  removeImageFromRaw,
  renderStableCellContent,
  repaintMediaDecor,
  resolveImageLayout,
  runtime,
  settingsCache,
  uploadImageEmbeds,
  wireRichHostImages,
} from "../src/extension.js";

class MiniClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) {
    const next = force == null ? !this.values.has(value) : Boolean(force);
    if (next) this.values.add(value); else this.values.delete(value);
    return next;
  }
  contains(value) { return this.values.has(value); }
}

class MiniStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  getPropertyValue(name) { return this.values.get(name) || ""; }
  removeProperty(name) { this.values.delete(name); }
}

class MiniNode {
  constructor(tagName = "#text", text = "") {
    this.tagName = tagName.toUpperCase(); this.parentNode = null; this.children = []; this.listeners = new Map();
    this.classList = new MiniClassList(); this.style = new MiniStyle(); this.dataset = {}; this.hidden = false; this._text = text;
  }
  set className(value) { this._className = value; this.classList = new MiniClassList(); String(value).split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name)); }
  get className() { return this._className || ""; }
  set textContent(value) { this._text = String(value ?? ""); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join("") : this._text; }
  get childNodes() { return this.children; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(typeof node === "string" ? new MiniNode("#text", node) : node)); }
  appendChild(node) { if (node.parentNode) node.remove(); node.parentNode = this; this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children.forEach((node) => { node.parentNode = null; }); this.children = []; this.append(...nodes); }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter((node) => node !== this); this.parentNode = null; }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
  matches(selector) {
    return String(selector).split(",").some((part) => {
      const value = part.trim();
      if (value.startsWith(".")) return this.classList.contains(value.slice(1));
      return this.tagName === value.toUpperCase();
    });
  }
  closest(selector) { for (let current = this; current; current = current.parentNode) if (current.matches?.(selector)) return current; return null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) { if (child.matches?.(selector)) found.push(child); found.push(...child.querySelectorAll(selector)); }
    return found;
  }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter((value) => value !== listener)); }
  dispatch(type, fields = {}) {
    const event = { type, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...fields };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
  setAttribute(name, value) { this[name] = String(value); }
  getAttribute(name) { return this[name] == null ? null : String(this[name]); }
  removeAttribute(name) { delete this[name]; }
  focus() { globalThis.document.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch("close"); }
  get isConnected() { for (let current = this; current; current = current.parentNode) if (current === globalThis.document?.body) return true; return false; }
}

function installMiniDom() {
  const body = new MiniNode("body");
  globalThis.document = { body, activeElement: null, createElement: (name) => new MiniNode(name), createTextNode: (text) => new MiniNode("#text", text), querySelector: (selector) => body.querySelector(selector) };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  return { body };
}

function makeCell(raw, { mediaSetting = true } = {}) {
  settingsCache.set("images-cell-media", mediaSetting);
  const cell = new MiniNode("div"); cell.className = "rg-cell";
  cell.dataset.rgRaw = raw;
  const content = new MiniNode("div"); content.className = "rg-cell-content";
  cell.appendChild(content);
  return { cell, content };
}

function makeImage({ alt = "", src = "https://example.com/cat.png", complete = true, naturalWidth = 907, naturalHeight = 283, offsetTop = 0 } = {}) {
  const img = new MiniNode("img");
  img.alt = alt; img.src = src; img.complete = complete;
  img.naturalWidth = naturalWidth; img.naturalHeight = naturalHeight; img.offsetTop = offsetTop;
  return img;
}

test("cellImageMarkdown extracts every embed with offsets", () => {
  assert.deepEqual(cellImageMarkdown("plain text"), []);
  assert.deepEqual(cellImageMarkdown(null), []);
  assert.deepEqual(cellImageMarkdown(undefined), []);
  assert.deepEqual(cellImageMarkdown(42), []);

  const single = "![cat](https://example.com/cat.png)";
  assert.deepEqual(cellImageMarkdown(single), [{ alt: "cat", url: "https://example.com/cat.png", start: 0, end: single.length }]);

  const altLess = "![](https://example.com/dog.png)";
  assert.deepEqual(cellImageMarkdown(altLess), [{ alt: "", url: "https://example.com/dog.png", start: 0, end: altLess.length }]);

  const enc = "![scan](https://firebasestorage.googleapis.com/v0/b/o/scan.png.enc?alt=media&token=abc-123)";
  assert.deepEqual(cellImageMarkdown(enc).map(({ alt, url }) => ({ alt, url })), [{ alt: "scan", url: "https://firebasestorage.googleapis.com/v0/b/o/scan.png.enc?alt=media&token=abc-123" }]);

  const mixed = "before ![a](u1) middle ![b](u2) after";
  const found = cellImageMarkdown(mixed);
  assert.equal(found.length, 2);
  assert.deepEqual(found[0], { alt: "a", url: "u1", start: 7, end: 7 + "![a](u1)".length });
  assert.deepEqual(found[1], { alt: "b", url: "u2", start: 23, end: 23 + "![b](u2)".length });
  assert.equal(mixed.slice(found[0].start, found[0].end), "![a](u1)", "start/end delimit the spliceable span");
});

test("cellImageMarkdown rejects malformed and non-image markdown", () => {
  assert.deepEqual(cellImageMarkdown("![broken]("), []);
  assert.deepEqual(cellImageMarkdown("![missing"), []);
  assert.deepEqual(cellImageMarkdown("[link](https://example.com)"), []);
  assert.deepEqual(cellImageMarkdown("text ](u) more"), []);
  assert.deepEqual(cellImageMarkdown("![multi\nline](u)"), []);
});

test("resolveImageLayout reads only the two global settings", (t) => {
  t.after(() => settingsCache.clear());
  settingsCache.clear();
  assert.deepEqual(resolveImageLayout(null, 0, 0), { enabled: true, size: "m", maxHeight: 180, fit: "contain", layout: "inline" });
  settingsCache.set("images-cell-media", false);
  assert.equal(resolveImageLayout(null, 0, 0).enabled, false);
  settingsCache.set("images-cell-media", true);
  settingsCache.set("images-max-height", 320);
  assert.equal(resolveImageLayout(null, 0, 0).maxHeight, 320);
});

test("applyCellImageLayout decorates a media cell from the model raw", (t) => {
  t.after(() => settingsCache.clear());
  installMiniDom();
  settingsCache.clear();
  const { cell } = makeCell("![cat](https://example.com/cat.png)");
  const model = { getRaw: () => "![cat](https://example.com/cat.png)" };
  assert.equal(applyCellImageLayout(cell, model, 0, 0), true);
  assert.equal(cell.classList.contains("rg-cell--media"), true);
  assert.equal(cell.classList.contains("rg-cell--img-fit-contain"), true);
  assert.equal(cell.classList.contains("rg-cell--img-inline"), true);
  assert.equal(cell.style.getPropertyValue("--rg-img-max-h"), "180px");
});

test("applyCellImageLayout honours the height setting and the large-grid dataset path", (t) => {
  t.after(() => settingsCache.clear());
  installMiniDom();
  settingsCache.clear();
  settingsCache.set("images-max-height", 96);
  const { cell } = makeCell("![cat](u)");
  assert.equal(applyCellImageLayout(cell, null, 0, 0), true, "model null falls back to dataset.rgRaw (large grid)");
  assert.equal(cell.style.getPropertyValue("--rg-img-max-h"), "96px");
});

test("applyCellImageLayout leaves plain, formula, and switched-off cells untouched", (t) => {
  t.after(() => settingsCache.clear());
  installMiniDom();
  settingsCache.clear();

  const plain = makeCell("just words").cell;
  assert.equal(applyCellImageLayout(plain, null, 0, 0), false);
  assert.equal(plain.classList.contains("rg-cell--media"), false);
  assert.equal(plain.style.getPropertyValue("--rg-img-max-h"), "");

  const formula = makeCell('=CONCAT("![sneaky](u)")').cell;
  assert.equal(applyCellImageLayout(formula, null, 0, 0), false, "a formula cell never renders a rich host, so no media decor");
  assert.equal(formula.classList.contains("rg-cell--media"), false);

  const off = makeCell("![cat](u)", { mediaSetting: false }).cell;
  assert.equal(applyCellImageLayout(off, null, 0, 0), false, "images-cell-media off = exact pre-feature behavior");
  assert.equal(off.classList.contains("rg-cell--media"), false);
  assert.equal(off.style.getPropertyValue("--rg-img-max-h"), "");
});

test("applyCellImageLayout strips stale decor and chips when the raw loses its image", (t) => {
  t.after(() => settingsCache.clear());
  installMiniDom();
  settingsCache.clear();
  const { cell } = makeCell("![cat](u)");
  applyCellImageLayout(cell, null, 0, 0);
  const chip = new MiniNode("span"); chip.className = "rg-img-fallback"; cell.appendChild(chip);
  cell.dataset.rgRaw = "plain now";
  assert.equal(applyCellImageLayout(cell, null, 0, 0), false);
  assert.equal(cell.classList.contains("rg-cell--media"), false);
  assert.equal(cell.classList.contains("rg-cell--img-fit-contain"), false);
  assert.equal(cell.style.getPropertyValue("--rg-img-max-h"), "");
  assert.equal(cell.querySelector(".rg-img-fallback"), null, "a stale chip must not survive the re-render");
});

test("wireRichHostImages appends an alt-carrying fallback chip on the error event", (t) => {
  t.after(() => settingsCache.clear());
  const { body } = installMiniDom();
  settingsCache.clear();
  const { cell, content } = makeCell("![cat](https://example.com/cat.png)");
  body.appendChild(cell);
  applyCellImageLayout(cell, null, 0, 0);
  const host = new MiniNode("span"); host.className = "rg-rich-host";
  content.__rgRichHosts = new Set([host]); content.appendChild(host);
  const img = makeImage({ alt: "cat", src: "https://example.com/cat.png", complete: false, naturalWidth: 0, naturalHeight: 0 });
  host.appendChild(img);

  assert.equal(wireRichHostImages(content, host), true);
  assert.equal(cell.querySelector(".rg-img-fallback"), null, "a loading image is not broken yet");
  content.dispatch("error", { target: img });
  const chip = cell.querySelector(".rg-img-fallback");
  assert.ok(chip, "the error event appends the chip to the CELL, never the host");
  assert.equal(host.querySelector(".rg-img-fallback"), null);
  assert.match(chip.textContent, /cat/);
  assert.equal(chip.getAttribute("role"), "img");
  assert.match(chip.getAttribute("aria-label"), /cat/);
  assert.equal(chip.title, "https://example.com/cat.png");
});

test("wireRichHostImages flags an already-settled broken image without any event (LP-5)", (t) => {
  t.after(() => settingsCache.clear());
  const { body } = installMiniDom();
  settingsCache.clear();
  const { cell, content } = makeCell("![](https://dead.example/gone.png)");
  body.appendChild(cell);
  applyCellImageLayout(cell, null, 0, 0);
  const host = new MiniNode("span"); host.className = "rg-rich-host";
  content.__rgRichHosts = new Set([host]); content.appendChild(host);
  host.appendChild(makeImage({ alt: "", src: "https://dead.example/gone.png", complete: true, naturalWidth: 0, naturalHeight: 0 }));

  wireRichHostImages(content, host);
  const chip = cell.querySelector(".rg-img-fallback");
  assert.ok(chip, "complete && naturalWidth === 0 is broken even when the error event fired before wiring");
  assert.match(chip.textContent, /image/, "an empty alt falls back to the word image");
});

test("the load event caches natural size and sets hint attributes only", (t) => {
  t.after(() => { settingsCache.clear(); imageDimensionCache.clear(); });
  const { body } = installMiniDom();
  settingsCache.clear();
  imageDimensionCache.clear();
  const { cell, content } = makeCell("![cat](https://example.com/cat.png)");
  body.appendChild(cell);
  applyCellImageLayout(cell, null, 0, 0);
  const host = new MiniNode("span"); host.className = "rg-rich-host";
  content.__rgRichHosts = new Set([host]); content.appendChild(host);
  const img = makeImage({ alt: "cat" });
  host.appendChild(img);

  wireRichHostImages(content, host);
  content.dispatch("load", { target: img });
  assert.deepEqual(imageDimensionCache.get("https://example.com/cat.png"), { w: 907, h: 283 });
  assert.equal(img.loading, "lazy");
  assert.equal(img.decoding, "async");
  assert.equal(img.title, "cat");
  assert.equal(cell.querySelector(".rg-img-fallback"), null, "a healthy image earns no chip");
});

test("a suggestion-row host outside a cell is never wired", (t) => {
  t.after(() => settingsCache.clear());
  const { body } = installMiniDom();
  settingsCache.clear();
  const content = new MiniNode("div"); content.className = "rg-suggestion-content";
  body.appendChild(content);
  const host = new MiniNode("span"); host.className = "rg-rich-host";
  content.__rgRichHosts = new Set([host]); content.appendChild(host);
  host.appendChild(makeImage({ complete: false }));

  assert.equal(wireRichHostImages(content, host), false, "no .rg-cell ancestor, no wiring");
  assert.equal(content.__rgImgWired, undefined);
  content.dispatch("error", { target: host.children[0] });
  assert.equal(body.querySelector(".rg-img-fallback"), null);

  const rendered = [];
  globalThis.window.roamAlphaAPI = { ui: { components: {
    renderString: ({ el, string }) => { el.appendChild(new MiniNode("span", string)); rendered.push(el); },
    unmountNode: () => {},
  } } };
  renderStableCellContent(content, { raw: "![cat](u)", renderRich: paintRichCellContent });
  assert.equal(rendered.length, 1);
  assert.equal(content.__rgImgWired, undefined, "the activate path itself must skip non-cell hosts");
});

test("the clip chip counts images below the fold of a fixed-height cell and clears when it fits", (t) => {
  t.after(() => settingsCache.clear());
  const { body } = installMiniDom();
  settingsCache.clear();
  const { cell, content } = makeCell("![a](u1) ![b](u2)");
  body.appendChild(cell);
  applyCellImageLayout(cell, null, 0, 0);
  const host = new MiniNode("span"); host.className = "rg-rich-host";
  content.__rgRichHosts = new Set([host]); content.appendChild(host);
  host.appendChild(makeImage({ alt: "a", src: "u1", offsetTop: 0 }));
  host.appendChild(makeImage({ alt: "b", src: "u2", offsetTop: 80 }));
  cell.clientHeight = 50; content.scrollHeight = 140;

  wireRichHostImages(content, host);
  const chip = cell.querySelector(".rg-img-clip-chip");
  assert.ok(chip, "overflowing fixed-height cell gets the clip chip");
  assert.equal(chip.textContent, "+1 hidden", "only the image whose top is below the fold counts");
  assert.match(chip.title, /1 image/);

  content.scrollHeight = 40;
  content.dispatch("load", { target: host.children[0] });
  assert.equal(cell.querySelector(".rg-img-clip-chip"), null, "chip is removed once the content fits");

  cell.clientHeight = 0; content.scrollHeight = 140;
  content.dispatch("load", { target: host.children[0] });
  assert.equal(cell.querySelector(".rg-img-clip-chip"), null, "an auto row grows instead of clipping, so no chip");
});

test("repaintMediaDecor re-resolves every mounted cell from the live settings", (t) => {
  t.after(() => settingsCache.clear());
  installMiniDom();
  settingsCache.clear();
  const first = makeCell("![cat](u)").cell;
  const second = makeCell("plain").cell;
  const cells = new Map([["0:0", first], ["0:1", second]]);
  settingsCache.set("images-max-height", 240);
  const visited = repaintMediaDecor(cells, null);
  assert.equal(visited, 2);
  assert.equal(first.style.getPropertyValue("--rg-img-max-h"), "240px");
  assert.equal(first.classList.contains("rg-cell--media"), true);
  assert.equal(second.classList.contains("rg-cell--media"), false);

  settingsCache.set("images-cell-media", false);
  repaintMediaDecor(cells, null);
  assert.equal(first.classList.contains("rg-cell--media"), false, "switch off strips decor in place");
  assert.equal(first.style.getPropertyValue("--rg-img-max-h"), "");
});

// GOAL-IMG-3 — the per-table model layer under the resolver, the menus, and the measurement.

test("resolveImageLayout layers cell over column over the global defaults", (t) => {
  t.after(() => settingsCache.clear());
  settingsCache.clear();
  const model = {
    columnIds: ["c0", "c1"],
    imageLayout: { columns: { c1: { size: "l", fit: "cover", layout: "strip" } }, cells: { u9: { fit: "original", size: "s" } } },
    getCell: (row, col) => ({ uid: row === 3 && col === 1 ? "u9" : `u${row}${col}` }),
  };
  assert.deepEqual(resolveImageLayout(model, 0, 0), { enabled: true, size: "m", maxHeight: 180, fit: "contain", layout: "inline" }, "an unconfigured column resolves the defaults");
  assert.deepEqual(resolveImageLayout(model, 0, 1), { enabled: true, size: "l", maxHeight: 320, fit: "cover", layout: "strip" }, "the column entry applies whole");
  assert.deepEqual(resolveImageLayout(model, 3, 1), { enabled: true, size: "s", maxHeight: 64, fit: "original", layout: "strip" }, "a cell entry out-votes its column field by field, and layout stays the column's");

  settingsCache.set("images-max-height", 240);
  assert.equal(resolveImageLayout(model, 0, 0).maxHeight, 240, "Medium follows the global cap live");
  assert.equal(resolveImageLayout({ ...model, imageLayout: { columns: { c1: { size: "xl" } }, cells: {} } }, 0, 1).maxHeight, 480);
  assert.equal(resolveImageLayout({ ...model, imageLayout: { columns: { c1: { size: "fill" } }, cells: {} } }, 0, 1).maxHeight, 240, "Fill width keeps the global cap — it widens, never heightens");
  assert.equal(resolveImageLayout(model, 0, 1).maxHeight, 320, "an explicit size ignores the global");

  const junk = { columnIds: ["c0"], imageLayout: { columns: { c0: { size: "huge", fit: "weird", layout: "spiral" } }, cells: {} }, getCell: () => ({ uid: "u" }) };
  assert.deepEqual(resolveImageLayout(junk, 0, 0), { enabled: true, size: "m", maxHeight: 240, fit: "contain", layout: "inline" }, "hand-edited garbage tokens degrade to defaults");
  assert.equal(resolveImageLayout({ columnIds: ["c0"] }, 0, 0).maxHeight, 240, "a stripped imageLayout key (or the large-grid facade without one) resolves defaults");
});

test("applyCellImageLayout reads the model imageLayout: column entry, cell override, fill class", (t) => {
  t.after(() => settingsCache.clear());
  installMiniDom();
  settingsCache.clear();
  const { cell } = makeCell("![cat](u)");
  const model = {
    columnIds: ["c0"],
    imageLayout: { columns: { c0: { size: "l", fit: "cover", layout: "strip" } }, cells: {} },
    getRaw: () => "![cat](u)",
    getCell: () => ({ uid: "u1" }),
  };
  assert.equal(applyCellImageLayout(cell, model, 0, 0), true);
  assert.equal(cell.style.getPropertyValue("--rg-img-max-h"), "320px", "the Large preset caps at 320");
  assert.equal(cell.classList.contains("rg-cell--img-fit-cover"), true);
  assert.equal(cell.classList.contains("rg-cell--img-strip"), true);
  assert.equal(cell.classList.contains("rg-cell--img-fill"), false);

  model.imageLayout.cells.u1 = { size: "fill", fit: "contain" };
  applyCellImageLayout(cell, model, 0, 0);
  assert.equal(cell.classList.contains("rg-cell--img-fill"), true, "the cell's Fill width wins the size");
  assert.equal(cell.classList.contains("rg-cell--img-fit-contain"), true, "and its fit out-votes the column's");
  assert.equal(cell.style.getPropertyValue("--rg-img-max-h"), "180px", "fill keeps the global height cap");

  delete model.imageLayout.cells.u1;
  applyCellImageLayout(cell, model, 0, 0);
  assert.equal(cell.classList.contains("rg-cell--img-fill"), false, "removing the override drops the class with it");
});

test("setSelectionImageLayout writes the column layer for whole columns and cell entries otherwise", async (t) => {
  t.after(() => settingsCache.clear());
  settingsCache.clear();
  installMiniDom();
  const grid = new GridModel({ rows: [["a", "b"], ["c", "d"]] });
  const commits = [];
  const view = {
    model: grid,
    selection: { startRow: 0, endRow: 1, startCol: 1, endCol: 1 }, // every row of column B
    commitMutation: (label, mutation, structural) => { commits.push({ label, structural }); grid.transact(label, mutation); return Promise.resolve(grid); },
  };

  await GridView.prototype.setSelectionImageLayout.call(view, "size", "l");
  const columnId = grid.columnIds[1];
  assert.deepEqual(grid.imageLayout.columns[columnId], { size: "l" }, "a full-height selection writes the column entry");
  assert.deepEqual(grid.imageLayout.cells, {});
  assert.deepEqual(commits[0], { label: "Image size: Large", structural: true });

  view.selection = { startRow: 0, endRow: 0, startCol: 0, endCol: 1 }; // a sub-column range
  await GridView.prototype.setSelectionImageLayout.call(view, "fit", "cover");
  const uidA = grid.getCell(0, 0).uid; const uidB = grid.getCell(0, 1).uid;
  assert.deepEqual(grid.imageLayout.cells, { [uidA]: { fit: "cover" }, [uidB]: { fit: "cover" } }, "a sub-column range writes one entry per cell");
  assert.equal(commits[1].label, "Image fit: Fill & crop (may enlarge)");

  // Column default clears just the size field; with no fit beside it the entry disappears.
  view.selection = { startRow: 0, endRow: 1, startCol: 1, endCol: 1 };
  await GridView.prototype.setSelectionImageLayout.call(view, "size", null);
  assert.equal(grid.imageLayout.columns[columnId], undefined, "Column default clears the field — and the emptied entry with it");
  assert.equal(commits[2].label, "Image size: Column default");
  assert.deepEqual(grid.imageLayout.cells[uidB], { fit: "cover" }, "the cell layer is untouched by a column write");

  // Undo through the model history reverses the whole gesture.
  grid.undo();
  assert.deepEqual(grid.imageLayout.columns[columnId], { size: "l" }, "undo restores the column entry");
});

test("the menu descriptors scope image groups and list the row-height presets", () => {
  const grid = new GridModel({ rows: [["a"], ["b"]] });
  const columnView = { model: grid, selection: { startRow: 0, endRow: 1, startCol: 0, endCol: 0 } };
  const entries = GridView.prototype.imageLayoutMenuEntries.call(columnView);
  assert.equal(entries[0].section, "Image size · column A");
  assert.deepEqual(
    entries.filter((entry) => !entry.section).map((entry) => entry.label),
    ["Small", "Medium", "Large", "Extra large", "Fill width", "Column default", "Contain", "Fill & crop (may enlarge)", "Original size"],
  );

  const cellsView = { model: grid, selection: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 } };
  const scoped = GridView.prototype.imageLayoutMenuEntries.call(cellsView);
  assert.equal(scoped[0].section, "Image size · these cells only", "a sub-column range says so");
  assert.equal(scoped[7].section, "Image fit · these cells only");

  const rows = GridView.prototype.rowHeightMenuEntries.call(columnView);
  assert.equal(rows[0].section, "Row height");
  assert.deepEqual(
    rows.filter((entry) => !entry.section).map((entry) => entry.label),
    ["Short (32 px)", "Medium (56 px)", "Tall (96 px)", "Extra tall (160 px)", "Reset row height", "Auto-fit selected rows (measure)"],
  );
});

test("measureSelectedRowHeights persists the tallest mounted content, deletes near-defaults, and undoes", async (t) => {
  t.after(() => settingsCache.clear());
  settingsCache.clear();
  installMiniDom();
  const grid = new GridModel({ rows: [["a", "b"], ["c", "d"], ["e", "f"]] });
  const stubCell = (scrollHeight) => {
    const cell = new MiniNode("div"); cell.className = "rg-cell";
    const content = new MiniNode("div"); content.className = "rg-cell-content";
    content.scrollHeight = scrollHeight;
    cell.appendChild(content);
    return cell;
  };
  const cells = new Map([
    ["0:0", stubCell(140)], ["0:1", stubCell(90)],
    ["1:0", stubCell(32)], // exactly the default → no override pinned
    // row 2 mounts nothing → left alone
  ]);
  const view = {
    model: grid, cells,
    selection: { startRow: 0, endRow: 2, startCol: 0, endCol: 1 },
    commitMutation: (label, mutation) => { grid.transact(label, mutation); return Promise.resolve(grid); },
  };

  await GridView.prototype.measureSelectedRowHeights.call(view);
  assert.equal(grid.getRowHeight(0), 140, "the tallest mounted cell in the row wins");
  assert.equal(grid.getRowHeight(1), null, "a measurement at the default deletes the override instead of pinning it");
  assert.equal(grid.getRowHeight(2), null, "a row with nothing mounted is left alone");
  assert.equal(grid.history.entries.at(-1).label, "Auto-fit rows");

  grid.undo();
  assert.equal(grid.getRowHeight(0), null, "one undo restores the auto rows");
  grid.redo();
  assert.equal(grid.getRowHeight(0), 140, "and redo restores the measurement");
});

test("the large-grid facade resolves manifest imageLayout columns and the row preset writes through the store", (t) => {
  t.after(() => settingsCache.clear());
  settingsCache.clear();
  const facade = LargeGridView.prototype.imageLayoutModel.call({
    store: { manifest: { imageLayout: { columns: { cA: { size: "xl" } }, cells: { ghost: { size: "s" } } }, columnIds: ["cA", "cB"] } },
  });
  assert.equal(resolveImageLayout(facade, 0, 0).maxHeight, 480, "the column entry applies");
  assert.equal(resolveImageLayout(facade, 0, 1).maxHeight, 180, "an unlisted column defaults");
  assert.equal(facade.getRaw, undefined, "no getRaw — the render path owns the raw, a store read is async");
  assert.equal(facade.getCell, undefined, "large cells are JSON rows: no uid, so the cell layer is inert");

  const calls = [];
  const view = {
    selection: { startRow: 2, endRow: 4, startCol: 0, endCol: 0 },
    store: { setRowHeight: (row, height) => calls.push([row, height]) },
    scheduleSave: () => { view.saved = true; },
    scheduleRender: () => { view.rendered = true; },
  };
  LargeGridView.prototype.setSelectedRowHeights.call(view, 96);
  assert.deepEqual(calls, [[2, 96], [3, 96], [4, 96]], "every selected row is written through the store");
  assert.equal(view.saved, true);
  assert.equal(view.rendered, true);
  LargeGridView.prototype.setSelectedRowHeights.call(view, null);
  assert.deepEqual(calls.at(-1), [4, null], "reset deletes the override");
});


// GOAL-IMG-2 — the lightbox, its delete rewrite, and the keyboard gestures that open it.

test("removeImageFromRaw splices one image and preserves surrounding text and spacing", () => {
  // Only image → empty string.
  assert.equal(removeImageFromRaw("![cat](https://x/cat.png)", "https://x/cat.png"), "");
  assert.equal(removeImageFromRaw("![cat](u)", "u", 0), "");

  // Image embedded in prose keeps the text and both spaces around the removed token.
  assert.equal(removeImageFromRaw("before ![a](u1) after", "u1"), "before  after");
  assert.equal(removeImageFromRaw("![a](u1) tail", "u1"), " tail");

  // Duplicate URLs in one cell are removed by occurrence index.
  const dup = "![](u) mid ![](u) end";
  assert.equal(removeImageFromRaw(dup, "u", 0), " mid ![](u) end", "occurrence 0 removes the first");
  assert.equal(removeImageFromRaw(dup, "u", 1), "![](u) mid  end", "occurrence 1 removes the second");

  // An unmatched url or occurrence returns the source unchanged, never a corrupted cell.
  assert.equal(removeImageFromRaw("![a](u1)", "u2"), "![a](u1)");
  assert.equal(removeImageFromRaw("![a](u1)", "u1", 3), "![a](u1)");
  assert.equal(removeImageFromRaw(null, "u"), "");
});

function installLightboxRoam() {
  const renders = []; const unmounts = [];
  globalThis.window.roamAlphaAPI = { ui: { components: {
    renderString: ({ el, string }) => { el.appendChild(new MiniNode("span", string)); renders.push(string); },
    unmountNode: ({ el }) => unmounts.push(el),
  } } };
  return { renders, unmounts };
}

function makeLightboxOwner() {
  const ownerRoot = new MiniNode("section"); ownerRoot.className = "rg-owner";
  const calls = { keydown: 0 };
  const ownerView = { root: ownerRoot, surface: "main", disposed: false, onKeydown: () => { calls.keydown += 1; } };
  ownerRoot.__rgView = ownerView;
  return { ownerRoot, ownerView, calls };
}

const footerButtons = (dialog) => dialog.querySelectorAll("button");
const footerLabels = (dialog) => footerButtons(dialog).map((b) => b.textContent);

test("openImageLightbox builds the dialog, counter, and header, and pages entries in order", (t) => {
  const { body } = installMiniDom();
  const { renders } = installLightboxRoam();
  t.after(() => releaseKeyboard());
  const { ownerRoot } = makeLightboxOwner();
  const entries = [
    { raw: "![a](u1)", alt: "a", url: "u1", row: 0, col: 0, cellImageIndex: 0, occurrence: 0 },
    { raw: "![b](u2)", alt: "b", url: "u2", row: 1, col: 0, cellImageIndex: 0, occurrence: 0 },
    { raw: "![c](u3)", alt: "c", url: "u3", row: 2, col: 0, cellImageIndex: 0, occurrence: 0 },
  ];
  const dialog = openImageLightbox({ ownerRoot, entries, startIndex: 0 });
  assert.ok(dialog, "the lightbox returns its dialog");
  assert.equal(dialog.classList.contains("rg-lightbox"), true);
  assert.equal(dialog.classList.contains("rg-portal"), true);
  assert.equal(dialog.open, true, "showModal was called");
  assert.equal(body.contains(dialog), true);
  assert.equal(dialog.querySelector(".rg-lightbox-title").textContent, "a");
  assert.equal(dialog.querySelector(".rg-lightbox-counter").textContent, "1 / 3");
  assert.equal(renders.at(-1), "![a](u1)", "the current image is rendered through renderString");

  dialog.dispatch("keydown", { key: "ArrowRight", preventDefault() {} });
  assert.equal(dialog.querySelector(".rg-lightbox-counter").textContent, "2 / 3");
  assert.equal(renders.at(-1), "![b](u2)");

  dialog.dispatch("keydown", { key: "ArrowLeft", preventDefault() {} });
  assert.equal(dialog.querySelector(".rg-lightbox-counter").textContent, "1 / 3");
  assert.equal(renders.at(-1), "![a](u1)");

  dialog.dispatch("keydown", { key: "ArrowLeft", preventDefault() {} });
  assert.equal(dialog.querySelector(".rg-lightbox-counter").textContent, "3 / 3", "ArrowLeft wraps from the first to the last");
  assert.equal(renders.at(-1), "![c](u3)");
});

test("the open lightbox releases the grid keyboard and __rgDismiss returns focus and re-claims it", (t) => {
  installMiniDom();
  installLightboxRoam();
  t.after(() => releaseKeyboard());
  const { ownerRoot, ownerView, calls } = makeLightboxOwner();
  claimKeyboard(ownerView);
  assert.equal(keyboardOwner()?.view, ownerView, "the grid owns the keyboard before the lightbox opens");

  const entries = [{ raw: "![a](u1)", alt: "a", url: "u1", row: 0, col: 0, cellImageIndex: 0, occurrence: 0 }];
  const dialog = openImageLightbox({ ownerRoot, entries, startIndex: 0 });
  assert.equal(keyboardOwner(), null, "opening the modal releases keyboard ownership");

  // With ownership released, the extension's single window keydown handler must not reach the grid.
  onGlobalKeydown({ key: "ArrowDown", metaKey: false, ctrlKey: false, shiftKey: false, target: { closest: () => null } });
  assert.equal(calls.keydown, 0, "grid onKeydown does not fire while the lightbox is open");

  dialog.__rgDismiss();
  assert.equal(dialog.open, false, "__rgDismiss closes the dialog");
  assert.equal(globalThis.document.body.contains(dialog), false, "the dialog is removed from the body");
  assert.equal(globalThis.document.activeElement, ownerRoot, "focus returns to the grid root");
  assert.equal(keyboardOwner()?.view, ownerView, "the grid re-claims the keyboard on close");

  onGlobalKeydown({ key: "ArrowDown", metaKey: false, ctrlKey: false, shiftKey: false, target: { closest: () => null } });
  assert.equal(calls.keydown, 1, "after close the grid keydown lane works again");
});

test("the lightbox Delete action rewrites the cell raw and invokes the commit callback", (t) => {
  installMiniDom();
  installLightboxRoam();
  t.after(() => releaseKeyboard());
  const { ownerRoot } = makeLightboxOwner();
  const deleted = [];
  const entries = [{ raw: "text ![a](u1) more", alt: "a", url: "u1", row: 2, col: 1, cellImageIndex: 0, occurrence: 0 }];
  const dialog = openImageLightbox({ ownerRoot, entries, startIndex: 0, onDelete: (payload) => deleted.push(payload) });

  const remove = footerButtons(dialog).find((b) => b.textContent === "Delete");
  assert.ok(remove, "a delete affordance exists when onDelete is supplied");
  remove.dispatch("click");

  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].raw, "text  more", "the callback receives the raw with the image spliced out");
  assert.equal(deleted[0].entry, entries[0]);
  assert.equal(dialog.open, false, "the lightbox closes after a delete");
});

test("the lightbox hides Download for .enc images but keeps it otherwise, and omits Delete without a callback", (t) => {
  installMiniDom();
  installLightboxRoam();
  t.after(() => releaseKeyboard());
  const { ownerRoot } = makeLightboxOwner();

  const enc = openImageLightbox({ ownerRoot, entries: [{ raw: "![s](u)", alt: "s", url: "https://f/scan.png.enc?alt=media&token=abc", row: 0, col: 0, cellImageIndex: 0, occurrence: 0 }], startIndex: 0 });
  const encLabels = footerLabels(enc);
  assert.equal(encLabels.includes("Download"), false, "a .enc blob cannot be fetched directly, so Download is hidden");
  assert.equal(encLabels.includes("Copy markdown"), true);
  assert.equal(encLabels.includes("Delete"), false, "no onDelete, no Delete button");
  enc.__rgDismiss();

  const plain = openImageLightbox({ ownerRoot, entries: [{ raw: "![p](u)", alt: "p", url: "https://x/p.png", row: 0, col: 0, cellImageIndex: 0, occurrence: 0 }], startIndex: 0 });
  assert.equal(footerLabels(plain).includes("Download"), true, "a plain URL keeps Download");
  plain.__rgDismiss();
});

test("Shift+Space opens the lightbox at the selected cell instead of beginning an edit", () => {
  const spaceEvent = (fields) => ({ key: " ", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: { matches: () => false }, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...fields });

  const shiftCalls = { beginEdit: [], lightbox: [] };
  const shiftView = {
    selection: { startRow: 1, endRow: 1, startCol: 2, endCol: 2 },
    beginEdit: (...a) => shiftCalls.beginEdit.push(a),
    openCellImageLightbox: (...a) => shiftCalls.lightbox.push(a),
  };
  const shiftSpace = spaceEvent({ shiftKey: true });
  GridView.prototype.onKeydown.call(shiftView, shiftSpace);
  assert.deepEqual(shiftCalls.beginEdit, [], "Shift+Space must NOT begin an edit seeded with a space");
  assert.deepEqual(shiftCalls.lightbox, [[1, 2, 0]], "it opens the column lightbox at the selected cell's first image");
  assert.equal(shiftSpace.defaultPrevented, true);

  // A plain space still begins an edit — the new branch must not swallow ordinary typing.
  const plainCalls = { beginEdit: [], lightbox: [] };
  const plainView = {
    selection: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    beginEdit: (...a) => plainCalls.beginEdit.push(a),
    openCellImageLightbox: (...a) => plainCalls.lightbox.push(a),
  };
  GridView.prototype.onKeydown.call(plainView, spaceEvent({ shiftKey: false }));
  assert.deepEqual(plainCalls.beginEdit, [[0, 0, " "]], "a plain space still begins an edit");
  assert.deepEqual(plainCalls.lightbox, []);
});

test("the armed-click state machine only opens the lightbox on the second click of a selected image", () => {
  installMiniDom();
  const opened = [];
  const view = {
    selection: { startRow: 5, endRow: 5, startCol: 0, endCol: 0 }, // a different cell is selected first
    imageClickArmed: false, imageClickDragged: false,
    openCellImageLightbox: (...a) => opened.push(a),
  };
  const cell = new MiniNode("div"); cell.className = "rg-cell"; cell.dataset.row = "0"; cell.dataset.col = "0";
  const content = new MiniNode("div"); content.className = "rg-cell-content"; cell.appendChild(content);
  const host = new MiniNode("span"); host.className = "rg-rich-host"; content.appendChild(host);
  const img = new MiniNode("img"); host.appendChild(img);
  const imgEvent = (fields = {}) => ({ target: img, shiftKey: false, ...fields });

  // First gesture: the cell is not yet the sole-selected cell, so the pointerdown does not arm.
  GridView.prototype.armImageClick.call(view, 0, 0, imgEvent());
  assert.equal(view.imageClickArmed, false, "an image click on an unselected cell does not arm");
  view.selection = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }; // the click now selects the cell
  assert.equal(GridView.prototype.handleCellImageClick.call(view, cell, imgEvent()), false, "the first click only selects");
  assert.deepEqual(opened, []);

  // Second gesture: the cell is now the sole-selected cell, so the pointerdown arms and the click opens.
  GridView.prototype.armImageClick.call(view, 0, 0, imgEvent());
  assert.equal(view.imageClickArmed, true, "a second pointerdown on the selected image arms");
  assert.equal(GridView.prototype.handleCellImageClick.call(view, cell, imgEvent()), true);
  assert.deepEqual(opened, [[0, 0, 0]], "the armed click opens the lightbox at the clicked image index");

  // Shift disqualifies arming; a drag between down and up disqualifies the open.
  GridView.prototype.armImageClick.call(view, 0, 0, imgEvent({ shiftKey: true }));
  assert.equal(view.imageClickArmed, false, "a shift-click extends selection, it never opens the lightbox");
  view.imageClickArmed = true; view.imageClickDragged = true;
  assert.equal(GridView.prototype.handleCellImageClick.call(view, cell, imgEvent()), false, "a drag-select does not open the lightbox");

  // The clip chip opens at image 0 regardless of the arm flag.
  opened.length = 0; view.imageClickArmed = false; view.imageClickDragged = false;
  const clip = new MiniNode("span"); clip.className = "rg-img-clip-chip"; cell.appendChild(clip);
  assert.equal(GridView.prototype.handleCellImageClick.call(view, cell, { target: clip }), true);
  assert.deepEqual(opened, [[0, 0, 0]], "clicking the +n clip chip opens the lightbox at the first image");
});

// GOAL-IMG-4 — the shared upload helper, paste/drop append parity, and range click branching.

function installUploadRoam(upload) {
  globalThis.window.roamAlphaAPI = { file: { upload } };
}

function imagePasteEvent(files) {
  return { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, clipboardData: { files, getData: () => "" } };
}

test("uploadImageEmbeds uploads serially in file order and returns the verbatim markup (LP-7)", async (t) => {
  t.after(() => { delete globalThis.window.roamAlphaAPI; });
  installMiniDom();
  const log = [];
  installUploadRoam(async ({ file }) => {
    log.push(`start:${file.name}`);
    await new Promise((resolve) => setTimeout(resolve, 1));
    log.push(`end:${file.name}`);
    return `![](https://up/${file.name})`;
  });
  const files = [{ name: "a.png", type: "image/png" }, { name: "b.png", type: "image/png" }];
  const embeds = await uploadImageEmbeds(files);
  assert.deepEqual(embeds, ["![](https://up/a.png)", "![](https://up/b.png)"], "the full markdown strings come back in drop/paste order");
  assert.deepEqual(log, ["start:a.png", "end:a.png", "start:b.png", "end:b.png"], "uploads stay serial, one file at a time");
  assert.deepEqual(await uploadImageEmbeds([]), [], "no files short-circuits before any upload or toast");
  assert.deepEqual(await uploadImageEmbeds(null), [], "a missing file list is an empty result, not a crash");
});

test("uploadImageEmbeds toasts the failure, records the forensic trace, and rethrows", async (t) => {
  t.after(() => { delete globalThis.window.roamAlphaAPI; runtime.extensionAPI = null; delete globalThis.window.__RG_IMG_LAST_ERROR; });
  const { body } = installMiniDom();
  runtime.extensionAPI = {};
  installUploadRoam(async ({ file }) => {
    if (file.name === "bad.png") throw new Error("upload exploded");
    return `![](https://up/${file.name})`;
  });
  const files = [{ name: "ok.png", type: "image/png" }, { name: "bad.png", type: "image/png" }];
  await assert.rejects(() => uploadImageEmbeds(files), /upload exploded/);
  assert.match(String(globalThis.window.__RG_IMG_LAST_ERROR), /upload exploded/, "the forensic surface carries the stack");
  const danger = body.querySelectorAll(".rg-toast--danger");
  assert.equal(danger.length, 1, "the helper owns the failure toast so no caller double-toasts");
  assert.match(danger[0].textContent, /Image upload failed: upload exploded/);
});

test("GridView.onPaste appends uploaded embeds after the cell's existing text", async (t) => {
  t.after(() => { delete globalThis.window.roamAlphaAPI; });
  installMiniDom();
  installUploadRoam(async ({ file }) => `![](https://up/${file.name})`);
  const grid = new GridModel({ rows: [["existing text", ""], ["", ""]] });
  const commits = [];
  const view = {
    model: grid,
    selection: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    commitMutation: (label, mutation, structural) => { commits.push({ label, structural }); grid.transact(label, mutation); return Promise.resolve(grid); },
  };
  const event = imagePasteEvent([{ name: "cat.png", type: "image/png" }]);
  await GridView.prototype.onPaste.call(view, event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(grid.getRaw(0, 0), "existing text ![](https://up/cat.png)", "paste appends, it never overwrites");
  assert.deepEqual(commits, [{ label: "Paste image", structural: false }]);
});

test("LargeGridView.onPaste appends after the existing cell content like GridView (LP-7 parity)", async (t) => {
  t.after(() => { delete globalThis.window.roamAlphaAPI; });
  installMiniDom();
  installUploadRoam(async ({ file }) => `![](https://up/${file.name})`);
  const writes = [];
  const view = {
    selection: { startRow: 4, endRow: 4, startCol: 2, endCol: 2 },
    store: {
      manifest: { rowCount: 100, colCount: 26 },
      getRaw: async (row, col) => (row === 4 && col === 2 ? "existing text" : ""),
      setCell: async (row, col, raw) => { writes.push({ row, col, raw }); return [{ row, col, value: raw }]; },
    },
    recordLargeEdit() {}, invalidateLargeCells: () => [], repaintLargeCells: async () => {}, scheduleSave() {},
  };
  const event = imagePasteEvent([{ name: "cat.png", type: "image/png" }]);
  await LargeGridView.prototype.onPaste.call(view, event);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(writes, [{ row: 4, col: 2, raw: "existing text ![](https://up/cat.png)" }], "the large-grid paste must APPEND — overwriting silently destroys the cell (the overwrite bug)");
});

test("a file drop writes the DROPPED-ON cell, not the selection", async (t) => {
  t.after(() => { delete globalThis.window.roamAlphaAPI; });
  installMiniDom();
  installUploadRoam(async ({ file }) => `![](https://up/${file.name})`);
  const grid = new GridModel({ rows: [["", ""], ["", ""], ["", ""]] });
  grid.transact("seed", () => grid.setRaw(2, 1, "prior"));
  const commits = [];
  const view = {
    model: grid,
    selection: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, // the selection sits elsewhere
    commitMutation: (label, mutation, structural) => { commits.push({ label, structural }); grid.transact(label, mutation); return Promise.resolve(grid); },
    dropImageFiles: GridView.prototype.dropImageFiles,
  };
  const cell = new MiniNode("div"); cell.className = "rg-cell rg-cell--drop-target"; cell.dataset.row = "2"; cell.dataset.col = "1";
  const event = {
    defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
    dataTransfer: { types: ["Files"], files: [{ name: "drop.png", type: "image/png" }], getData: () => "" },
  };
  assert.equal(GridView.prototype.handleCellDrop.call(view, cell, event), "images");
  assert.equal(event.defaultPrevented, true);
  await new Promise((resolve) => setTimeout(resolve, 10)); // dropImageFiles is fire-and-forget
  assert.equal(grid.getRaw(2, 1), "prior ![](https://up/drop.png)", "the drop appends at the dropped-on cell");
  assert.equal(grid.getRaw(0, 0), "", "the selection's cell is untouched");
  assert.equal(commits.at(-1).label, "Drop image");
  assert.equal(cell.classList.contains("rg-cell--drop-target"), false, "the highlight clears on drop");
});

test("handleCellDrop keeps the range-move lane and lets non-image files fall through", async () => {
  installMiniDom();
  const grid = new GridModel({ rows: [["a", ""], ["", ""]] });
  const commits = [];
  const view = {
    model: grid,
    commitMutation: (label, mutation, structural) => { commits.push({ label, structural }); grid.transact(label, mutation); return Promise.resolve(grid); },
  };
  const cell = new MiniNode("div"); cell.className = "rg-cell"; cell.dataset.row = "1"; cell.dataset.col = "1";

  const move = {
    defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
    dataTransfer: { types: ["application/x-roam-grid-range"], files: [], getData: (type) => (type === "application/x-roam-grid-range" ? JSON.stringify({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }) : "") },
  };
  assert.equal(GridView.prototype.handleCellDrop.call(view, cell, move), "range");
  assert.equal(move.defaultPrevented, true);
  assert.equal(commits[0].label, "Move range", "the in-grid drag still moves the range");
  assert.equal(grid.getRaw(1, 1), "a");

  const pdf = {
    defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
    dataTransfer: { types: ["Files"], files: [{ name: "spec.pdf", type: "application/pdf" }], getData: () => "" },
  };
  assert.equal(GridView.prototype.handleCellDrop.call(view, cell, pdf), null, "a non-image file is not ours");
  assert.equal(pdf.defaultPrevented, false, "Roam keeps its own file-drop behavior for non-images");
});

test("cell dragover preventDefaults only for Files and grid-range transfers", () => {
  installMiniDom();
  const cell = new MiniNode("div"); cell.className = "rg-cell";
  const over = (types) => ({ defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, dataTransfer: { types } });

  const files = over(["Files"]);
  assert.equal(GridView.prototype.handleCellDragOver.call({}, cell, files), true);
  assert.equal(files.defaultPrevented, true, "claiming the drop beats Roam's global handler (LP-8)");
  assert.equal(cell.classList.contains("rg-cell--drop-target"), true, "the highlight says the cell takes the file");

  const text = over(["text/plain"]);
  assert.equal(GridView.prototype.handleCellDragOver.call({}, cell, text), false);
  assert.equal(text.defaultPrevented, false, "a text drag is none of the grid's business");
  assert.equal(cell.classList.contains("rg-cell--drop-target"), false, "and earns no highlight");

  const range = over(["application/x-roam-grid-range"]);
  assert.equal(GridView.prototype.handleCellDragOver.call({}, cell, range), true);
  assert.equal(range.defaultPrevented, true, "the in-grid range drag still works");
  assert.equal(cell.classList.contains("rg-cell--drop-target"), false, "a range move gets no file highlight");

  cell.classList.add("rg-cell--drop-target");
  GridView.prototype.handleCellDragLeave.call({}, cell, { relatedTarget: null });
  assert.equal(cell.classList.contains("rg-cell--drop-target"), false, "leaving the cell clears the highlight");
  cell.classList.add("rg-cell--drop-target");
  const child = new MiniNode("span"); cell.appendChild(child);
  GridView.prototype.handleCellDragLeave.call({}, cell, { relatedTarget: child });
  assert.equal(cell.classList.contains("rg-cell--drop-target"), true, "dragleave into a child is not a leave");
});

test("LargeGridView.dropImageFiles appends at the dropped cell through the store", async (t) => {
  t.after(() => { delete globalThis.window.roamAlphaAPI; });
  installMiniDom();
  installUploadRoam(async ({ file }) => `![](https://up/${file.name})`);
  const writes = []; let saved = false; let repainted = 0;
  const view = {
    store: {
      mergeAt: () => null,
      getRaw: async () => "prior",
      setCell: async (row, col, raw) => { writes.push({ row, col, raw }); return [{ row, col, value: raw }]; },
    },
    recordLargeEdit() {}, invalidateLargeCells: () => [], repaintLargeCells: async () => { repainted += 1; }, scheduleSave() { saved = true; },
  };
  await LargeGridView.prototype.dropImageFiles.call(view, [{ name: "d.png", type: "image/png" }], 7, 3);
  assert.deepEqual(writes, [{ row: 7, col: 3, raw: "prior ![](https://up/d.png)" }], "append, never overwrite");
  assert.equal(saved, true);
  assert.equal(repainted, 1);
});

test("RangeGridView.onClick branches: source icon → table, image → lightbox, else the cell's block", (t) => {
  t.after(() => { delete globalThis.window.roamAlphaAPI; });
  installMiniDom();
  const opened = [];
  globalThis.window.roamAlphaAPI = { ui: { mainWindow: { openBlock: ({ block }) => opened.push(block.uid) } } };
  const lightboxes = [];
  const view = {
    model: { tableUid: "tbl00001" },
    openRangeCellImageLightbox: (cell, img) => { lightboxes.push([cell.dataset.uid, Boolean(img)]); return { fake: true }; },
  };

  const source = new MiniNode("span"); source.className = "rg-range-source";
  RangeGridView.prototype.onClick.call(view, { target: source });
  assert.deepEqual(opened, ["tbl00001"], "the caption icon opens the source table");

  const cell = new MiniNode("div"); cell.className = "rg-cell"; cell.dataset.uid = "celluid01"; cell.dataset.row = "0"; cell.dataset.col = "0";
  const content = new MiniNode("div"); content.className = "rg-cell-content"; cell.appendChild(content);
  const host = new MiniNode("span"); host.className = "rg-rich-host"; content.appendChild(host);
  const img = new MiniNode("img"); host.appendChild(img);
  RangeGridView.prototype.onClick.call(view, { target: img });
  assert.deepEqual(lightboxes, [["celluid01", true]], "an image click opens the lightbox…");
  assert.deepEqual(opened, ["tbl00001"], "…and never navigates away");

  const text = new MiniNode("span"); content.appendChild(text);
  RangeGridView.prototype.onClick.call(view, { target: text });
  assert.deepEqual(opened, ["tbl00001", "celluid01"], "any other click keeps navigate-to-source");
});
