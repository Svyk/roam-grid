import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCellImageLayout,
  cellImageMarkdown,
  imageDimensionCache,
  paintRichCellContent,
  renderStableCellContent,
  repaintMediaDecor,
  resolveImageLayout,
  settingsCache,
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
  get isConnected() { for (let current = this; current; current = current.parentNode) if (current === globalThis.document?.body) return true; return false; }
}

function installMiniDom() {
  const body = new MiniNode("body");
  globalThis.document = { body, createElement: (name) => new MiniNode(name), createTextNode: (text) => new MiniNode("#text", text) };
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
  assert.deepEqual(resolveImageLayout(null, 0, 0), { enabled: true, maxHeight: 180, fit: "contain", layout: "inline" });
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
