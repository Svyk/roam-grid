import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel,
  GridView,
  NativeGridSession,
  claimKeyboard,
  clearUndoHistories,
  installKeyboardOwnership,
  keyboardOwner,
  portalOwnerUid,
  releaseKeyboard,
} from "../src/extension.js";

class ClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const next = force == null ? !this.values.has(value) : Boolean(force);
    if (next) this.values.add(value); else this.values.delete(value);
    return next;
  }
}

class Style {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  getPropertyValue(name) { return this.values.get(name) || ""; }
  removeProperty(name) { this.values.delete(name); }
}

function matchesSelector(node, selector) {
  return String(selector).split(",").map((part) => part.trim()).filter(Boolean).some((part) => {
    if (part.startsWith(".")) return part.slice(1).split(".").every((name) => node.classList.contains(name));
    if (part.startsWith("[")) {
      const body = part.slice(1, -1);
      const prefix = /^([\w-]+)\^=['"]?([^'"\]]+)['"]?$/.exec(body);
      if (prefix) return String(node.getAttribute(prefix[1]) ?? "").startsWith(prefix[2]);
      const exact = /^([\w-]+)=['"]?([^'"\]]+)['"]?$/.exec(body);
      if (exact) return String(node.getAttribute(exact[1]) ?? "") === exact[2];
      return node.getAttribute(body) != null;
    }
    return node.tagName === part.toUpperCase();
  });
}

function datasetKey(name) {
  return name.startsWith("data-") ? name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase()) : null;
}

class Node {
  constructor(tagName = "div", text = "") {
    this.tagName = String(tagName).toUpperCase();
    this.parentNode = null; this.children = []; this.listeners = new Map();
    this.classList = new ClassList(); this.style = new Style(); this.dataset = {};
    this.attributes = new Map(); this._text = text; this.hidden = false; this.value = "";
  }
  set className(value) { this._className = value; this.classList = new ClassList(); String(value).split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name)); }
  get className() { return this._className || ""; }
  set textContent(value) { this._text = String(value ?? ""); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join("") : this._text; }
  get parentElement() { return this.parentNode; }
  get isConnected() { for (let current = this; current; current = current.parentNode) if (current === globalThis.document?.body) return true; return false; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(typeof node === "string" ? new Node("#text", node) : node)); }
  appendChild(node) { if (node.parentNode) node.remove(); node.parentNode = this; this.children.push(node); return node; }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter((node) => node !== this); this.parentNode = null; }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
  matches(selector) { return matchesSelector(this, selector); }
  closest(selector) { for (let current = this; current; current = current.parentNode) if (current.matches?.(selector)) return current; return null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) { if (child.matches?.(selector)) found.push(child); found.push(...child.querySelectorAll(selector)); }
    return found;
  }
  setAttribute(name, value) { const key = datasetKey(name); if (key) this.dataset[key] = String(value); else this.attributes.set(name, String(value)); }
  getAttribute(name) {
    const key = datasetKey(name);
    if (key) return this.dataset[key] ?? null;
    if (this.attributes.has(name)) return this.attributes.get(name);
    return this[name] == null ? null : String(this[name]);
  }
  removeAttribute(name) { const key = datasetKey(name); if (key) delete this.dataset[key]; else this.attributes.delete(name); }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter((value) => value !== listener)); }
  dispatch(type, fields = {}) {
    const event = makeEvent(type, this, fields);
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
    return event;
  }
  focus() { globalThis.document.activeElement = this; this.focusCount = (this.focusCount || 0) + 1; }
  getBoundingClientRect() { return { left: 10, right: 110, top: 20, bottom: 54, width: 100, height: 34 }; }
  scrollIntoView() {}
}

function makeEvent(type, target, fields = {}) {
  return {
    type, target, currentTarget: target, relatedTarget: null, key: "", button: 0,
    metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    defaultPrevented: false, immediateStopped: false, propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    stopImmediatePropagation() { this.immediateStopped = true; },
    ...fields,
  };
}

function installDom() {
  const body = new Node("body");
  const listeners = new Map();
  const windowListeners = new Map();
  globalThis.document = {
    body,
    documentElement: { clientWidth: 1024 },
    activeElement: null,
    createElement: (name) => new Node(name),
    createTextNode: (text) => new Node("#text", text),
    querySelector: (selector) => body.querySelector(selector),
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    removeEventListener(type, listener) { listeners.set(type, (listeners.get(type) || []).filter((value) => value !== listener)); },
  };
  globalThis.window = {
    addEventListener(type, listener) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(listener); },
    removeEventListener(type, listener) { windowListeners.set(type, (windowListeners.get(type) || []).filter((value) => value !== listener)); },
    dispatchEvent() { return true; },
  };
  globalThis.innerWidth = 1024; globalThis.innerHeight = 768;
  delete globalThis.getComputedStyle; delete globalThis.MutationObserver; delete globalThis.matchMedia;
  return {
    body,
    windowListenerCount: (type) => (windowListeners.get(type) || []).length,
    documentListenerCount: (type) => (listeners.get(type) || []).length,
    firePointerDown(target) {
      const event = makeEvent("pointerdown", target);
      for (const listener of [...(listeners.get("pointerdown") || [])]) listener(event);
      return event;
    },
    fireFocusIn(target) {
      const event = makeEvent("focusin", target);
      for (const listener of [...(listeners.get("focusin") || [])]) listener(event);
      return event;
    },
    fireKeydown(target, fields = {}) {
      const event = makeEvent("keydown", target, fields);
      for (const listener of [...(windowListeners.get("keydown") || [])]) listener(event);
      return event;
    },
  };
}

function makeGrid(dom, { rows = [[{ uid: "a1", raw: "1" }], [{ uid: "b1", raw: "2" }]], uid = "table-a" } = {}) {
  const model = new GridModel({ rows, tableUid: uid });
  const adapter = {
    model,
    load: () => model,
    watchExternal: () => () => {},
    getBaseRaw: () => "",
    saveContent: async () => ({ saved: [], skipped: [] }),
    save: async (value) => value,
    dispose() {},
  };
  clearUndoHistories();
  const session = new NativeGridSession(uid, { adapter, model });
  const root = new Node("section"); root.className = "rg-root"; root.dataset.roamGridUid = uid;
  const cell = new Node("div"); cell.className = "rg-cell"; root.appendChild(cell);
  dom.body.appendChild(root);
  const view = {
    root, session, model, adapter, context: "source", disposed: false,
    selection: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    renders: 0, undoCalls: 0,
    commitMutation: GridView.prototype.commitMutation,
    openMenu: GridView.prototype.openMenu,
    openAxisMenu: GridView.prototype.openAxisMenu,
    onKeydown: GridView.prototype.onKeydown,
    undo() { this.undoCalls += 1; return GridView.prototype.undo.call(this); },
    redo() { return GridView.prototype.redo.call(this); },
    captureRowDeletionContext: () => null,
    patchRowDeletion: () => false,
    render() { this.renders += 1; },
    refreshValues() {},
    select() {},
    moveSelection() {},
    beginEdit() {},
    clearSelection() {},
  };
  root.__rgView = view;
  session.addView(view);
  view.model = model; view.session = session;
  return { model, session, view, root, cell };
}

function roamBlockInput(dom, uid = "roam-block") {
  const input = new Node("textarea");
  input.className = "rm-block-input";
  input.id = `block-input-${uid}`;
  dom.body.appendChild(input);
  return input;
}

test("pointerdown inside an owned portal keeps keyboard ownership; an unowned target releases it", () => {
  const dom = installDom();
  releaseKeyboard();
  const uninstall = installKeyboardOwnership();
  const { view, cell, session } = makeGrid(dom);
  try {
    dom.firePointerDown(cell);
    assert.equal(keyboardOwner()?.view, view);
    assert.equal(keyboardOwner()?.uid, "table-a");
    assert.equal(keyboardOwner()?.kind, "native");

    const portal = new Node("div"); portal.className = "rg-context-menu"; portal.dataset.rgOwner = "table-a";
    const portalItem = new Node("button"); portal.appendChild(portalItem); dom.body.appendChild(portal);
    assert.equal(portalOwnerUid(portalItem), "table-a");
    dom.firePointerDown(portalItem);
    assert.equal(keyboardOwner()?.view, view, "a pointerdown on our own body-mounted portal must not drop ownership");
    assert.equal(view.root.classList.contains("rg-root--interaction-active"), true);

    const outside = new Node("div"); dom.body.appendChild(outside);
    dom.firePointerDown(outside);
    assert.equal(keyboardOwner(), null);
    assert.equal(view.root.classList.contains("rg-root--interaction-active"), false);
  } finally { uninstall(); session.dispose(); }
});

test("a Roam block input takes the keyboard back and Cmd+Z is left to Roam", () => {
  const dom = installDom();
  releaseKeyboard();
  const uninstall = installKeyboardOwnership();
  const { view, cell, session } = makeGrid(dom);
  try {
    dom.firePointerDown(cell);
    assert.equal(keyboardOwner()?.view, view);

    const input = roamBlockInput(dom);
    dom.firePointerDown(input);
    assert.equal(keyboardOwner(), null);
    const released = dom.fireKeydown(input, { metaKey: true, key: "z" });
    assert.equal(released.defaultPrevented, false, "native browser undo must survive when Roam owns the keyboard");
    assert.equal(view.undoCalls, 0);

    dom.firePointerDown(cell);
    dom.fireFocusIn(input);
    assert.equal(keyboardOwner(), null, "focus moving into a Roam block releases ownership");

    claimKeyboard(view);
    const guarded = dom.fireKeydown(input, { metaKey: true, key: "z" });
    assert.equal(guarded.defaultPrevented, false, "a stale claim must not swallow undo while a Roam block has focus");
    assert.equal(view.undoCalls, 0);
  } finally { uninstall(); session.dispose(); }
});

test("Cmd+Z inside the grid's own editor is left to the textarea", () => {
  const dom = installDom();
  releaseKeyboard();
  const uninstall = installKeyboardOwnership();
  const { view, cell, root, session } = makeGrid(dom);
  try {
    dom.firePointerDown(cell);
    const inline = new Node("textarea"); inline.className = "rg-editor"; root.appendChild(inline);
    const floating = new Node("textarea"); floating.className = "rg-floating-editor-input";
    const popover = new Node("div"); popover.className = "rg-editor-popover"; popover.dataset.rgOwner = "table-a";
    popover.appendChild(floating); dom.body.appendChild(popover);

    const inlineEvent = dom.fireKeydown(inline, { metaKey: true, key: "z" });
    assert.equal(inlineEvent.defaultPrevented, false);
    assert.equal(view.undoCalls, 0);

    dom.firePointerDown(floating);
    assert.equal(keyboardOwner()?.view, view, "the editor popover is an owned portal");
    const floatingEvent = dom.fireKeydown(floating, { metaKey: true, key: "z" });
    assert.equal(floatingEvent.defaultPrevented, false);
    assert.equal(view.undoCalls, 0);
  } finally { uninstall(); session.dispose(); }
});

test("after a context-menu row delete the next Cmd+Z reaches the grid", () => {
  const dom = installDom();
  releaseKeyboard();
  const uninstall = installKeyboardOwnership();
  const { view, cell, model, session } = makeGrid(dom);
  try {
    dom.firePointerDown(cell);
    const anchor = new Node("button"); dom.body.appendChild(anchor);
    view.openMenu(anchor);
    const menu = dom.body.querySelector(".rg-context-menu");
    assert.equal(menu.dataset.rgOwner, "table-a", "the body-mounted context menu must be tagged with its owning grid");

    const deleteItem = menu.children.find((child) => child.textContent === "Delete selected rows");
    assert.ok(deleteItem, "context menu exposes the row delete item");

    dom.firePointerDown(deleteItem);
    assert.equal(keyboardOwner()?.view, view, "the pre-click pointerdown must not hand the keyboard back to Roam");
    deleteItem.dispatch("click");

    assert.equal(model.rowCount, 1);
    assert.equal(menu.isConnected, false);
    assert.ok(view.root.focusCount > 0, "dismiss() refocuses the grid root");
    assert.equal(keyboardOwner()?.view, view);

    const undoEvent = dom.fireKeydown(dom.body, { metaKey: true, key: "z" });
    assert.equal(view.undoCalls, 1);
    assert.equal(model.rowCount, 2, "the deleted row comes back");
    assert.equal(undoEvent.defaultPrevented, true, "preventDefault is what suppresses Roam's native browser undo");
    assert.equal(undoEvent.immediateStopped, true);
  } finally { uninstall(); session.dispose(); }
});

test("POSITIVE CONTROL: the pre-fix per-view listeners drop the same Cmd+Z", () => {
  const dom = installDom();
  releaseKeyboard();
  const { view, cell, model, session } = makeGrid(dom);
  // Verbatim reproduction of the listener pair this goal replaced.
  const legacy = { keyboardActive: false };
  const legacyPointerDown = (event) => {
    legacy.keyboardActive = view.root.contains(event.target) || Boolean(view.editorController?.popover.contains(event.target));
    view.root.classList.toggle("rg-root--interaction-active", legacy.keyboardActive);
  };
  const legacyKeydown = (event) => { if (legacy.keyboardActive) view.onKeydown(event); };
  document.addEventListener("pointerdown", legacyPointerDown, true);
  globalThis.window.addEventListener("keydown", legacyKeydown, true);
  try {
    dom.firePointerDown(cell);
    assert.equal(legacy.keyboardActive, true);

    const anchor = new Node("button"); dom.body.appendChild(anchor);
    view.openMenu(anchor);
    const menu = dom.body.querySelector(".rg-context-menu");
    const deleteItem = menu.children.find((child) => child.textContent === "Delete selected rows");

    dom.firePointerDown(deleteItem);
    assert.equal(legacy.keyboardActive, false, "the legacy defect: a body-mounted menu drops keyboard ownership on pointerdown");
    deleteItem.dispatch("click");
    assert.equal(model.rowCount, 1);

    const undoEvent = dom.fireKeydown(dom.body, { metaKey: true, key: "z" });
    assert.equal(view.undoCalls, 0, "pre-fix, the next Cmd+Z never reaches the grid");
    assert.equal(model.rowCount, 1, "pre-fix, the deleted row stays deleted");
    assert.equal(undoEvent.defaultPrevented, false);
  } finally {
    document.removeEventListener("pointerdown", legacyPointerDown, true);
    globalThis.window.removeEventListener("keydown", legacyKeydown, true);
    session.dispose();
  }
});

test("axis-menu dismiss reclaims the keyboard for its grid", () => {
  const dom = installDom();
  releaseKeyboard();
  const uninstall = installKeyboardOwnership();
  const { view, cell, session } = makeGrid(dom);
  try {
    dom.firePointerDown(cell);
    const grip = new Node("div"); grip.className = "rg-axis-grabber"; dom.body.appendChild(grip);
    view.openAxisMenu("row", 0, grip);
    const menu = dom.body.querySelector(".rg-axis-menu");
    assert.equal(menu.dataset.rgOwner, "table-a");

    const outside = new Node("div"); dom.body.appendChild(outside);
    dom.firePointerDown(outside);
    assert.equal(keyboardOwner(), null);

    menu.__rgDismiss();
    assert.equal(keyboardOwner()?.view, view, "dismiss() refocuses the root and reclaims the keyboard");
    assert.equal(menu.isConnected, false);
  } finally { uninstall(); session.dispose(); }
});

test("mounted views register no window keydown listener; the module registers exactly one", () => {
  const dom = installDom();
  releaseKeyboard();
  assert.equal(dom.windowListenerCount("keydown"), 0);
  const mounted = [];
  for (let index = 0; index < 3; index += 1) {
    const root = new Node("section"); root.className = "rg-root";
    const fake = { nativeElement: null, host: dom.body, root, boundPaste: () => {}, boundPointerUp: () => {}, renders: 0, render() { this.renders += 1; } };
    GridView.prototype.mount.call(fake);
    mounted.push(fake);
  }
  assert.equal(mounted.every((fake) => fake.renders === 1), true);
  assert.equal(dom.windowListenerCount("keydown"), 0, "per-view window keydown listeners are gone");

  const uninstall = installKeyboardOwnership();
  assert.equal(dom.windowListenerCount("keydown"), 1);
  assert.equal(dom.documentListenerCount("pointerdown"), 1);
  assert.equal(dom.documentListenerCount("focusin"), 1);
  uninstall();
  assert.equal(dom.windowListenerCount("keydown"), 0);
  assert.equal(dom.documentListenerCount("pointerdown"), 0);
  assert.equal(dom.documentListenerCount("focusin"), 0);
  assert.equal(keyboardOwner(), null);
});

test("keyboard ownership tracks the large-grid kind and only the owning view can release it", () => {
  const dom = installDom();
  releaseKeyboard();
  const nativeRoot = new Node("section"); nativeRoot.className = "rg-root"; dom.body.appendChild(nativeRoot);
  const largeRoot = new Node("section"); largeRoot.className = "rg-root rg-large-root"; dom.body.appendChild(largeRoot);
  const nativeView = { root: nativeRoot, model: { tableUid: "native-uid" }, disposed: false };
  const largeView = { root: largeRoot, store: { anchorUid: "large-uid" }, disposed: false };

  assert.equal(claimKeyboard(nativeView).kind, "native");
  assert.equal(keyboardOwner().uid, "native-uid");
  assert.equal(claimKeyboard(largeView).kind, "large");
  assert.equal(keyboardOwner().uid, "large-uid");
  assert.equal(nativeRoot.classList.contains("rg-root--interaction-active"), false);
  assert.equal(largeRoot.classList.contains("rg-root--interaction-active"), true);

  assert.equal(releaseKeyboard(nativeView)?.view, largeView, "a non-owner cannot release the keyboard");
  assert.equal(releaseKeyboard(largeView), null);
  assert.equal(largeRoot.classList.contains("rg-root--interaction-active"), false);

  largeView.disposed = true;
  assert.equal(claimKeyboard(largeView), null, "a disposed view cannot claim the keyboard");
});
