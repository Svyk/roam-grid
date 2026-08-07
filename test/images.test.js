import test from "node:test";
import assert from "node:assert/strict";
import {
  GridView,
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
