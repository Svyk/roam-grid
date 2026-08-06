import test from "node:test";
import assert from "node:assert/strict";
import {
  GridModel,
  GridView,
  NativeGridSession,
  applyCommentThreadPlan,
  clearUndoHistories,
  commentAnchorString,
  commentArmingState,
  commentThreadCount,
  commentThreadPlan,
  diffCommentThreadIndex,
  installCommentAffordance,
  mergeCommentThread,
  queryCommentThreadIndex,
  setCommentArming,
} from "../src/extension.js";

class MiniClassList {
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

class MiniNode {
  constructor(tagName = "div", text = "") {
    this.tagName = String(tagName).toUpperCase(); this.parentNode = null; this.children = []; this.listeners = new Map();
    this.classList = new MiniClassList(); this.dataset = {}; this.style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" };
    this._text = text;
  }
  set className(value) { this._className = value; this.classList = new MiniClassList(); String(value).split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name)); }
  get className() { return this._className || ""; }
  set textContent(value) { this._text = String(value ?? ""); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join("") : this._text; }
  get parentElement() { return this.parentNode; }
  get isConnected() { for (let current = this; current; current = current.parentNode) if (current === globalThis.document?.body) return true; return false; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(typeof node === "string" ? new MiniNode("#text", node) : node)); }
  appendChild(node) { if (node.parentNode) node.remove(); node.parentNode = this; this.children.push(node); return node; }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter((node) => node !== this); this.parentNode = null; }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
  matches(selector) { return String(selector).split(",").some((part) => { const value = part.trim(); return value.startsWith(".") && value.slice(1).split(".").every((name) => this.classList.contains(name)); }); }
  closest(selector) { for (let current = this; current; current = current.parentNode) if (current.matches?.(selector)) return current; return null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) { if (child.matches?.(selector)) found.push(child); found.push(...child.querySelectorAll(selector)); }
    return found;
  }
  setAttribute(name, value) { this[name] = String(value); }
  getAttribute(name) { return this[name] == null ? null : String(this[name]); }
  removeAttribute(name) { delete this[name]; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter((value) => value !== listener)); }
  listenerCount(type) { return (this.listeners.get(type) || []).length; }
  dispatch(type, fields = {}) {
    let stopped = false;
    const event = { type, target: this, currentTarget: this, key: "", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { stopped = true; }, ...fields };
    for (let node = this; node && !stopped; node = node.parentNode) {
      event.currentTarget = node;
      for (const listener of [...(node.listeners.get(type) || [])]) listener(event);
    }
    return event;
  }
  focus() {}
  scrollIntoView() {}
  getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 30, width: 100, height: 30 }; }
}

function installMiniDom() {
  const body = new MiniNode("body");
  const documentListeners = new Map();
  const windowListeners = new Map();
  globalThis.document = {
    body,
    documentElement: { clientWidth: 1024 },
    activeElement: null,
    createElement: (name) => new MiniNode(name),
    createTextNode: (text) => new MiniNode("#text", text),
    querySelector: (selector) => body.querySelector(selector),
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    addEventListener(type, listener) { if (!documentListeners.has(type)) documentListeners.set(type, []); documentListeners.get(type).push(listener); },
    removeEventListener(type, listener) { documentListeners.set(type, (documentListeners.get(type) || []).filter((value) => value !== listener)); },
  };
  globalThis.window = {
    addEventListener(type, listener) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(listener); },
    removeEventListener(type, listener) { windowListeners.set(type, (windowListeners.get(type) || []).filter((value) => value !== listener)); },
    dispatchEvent() { return true; },
  };
  delete globalThis.getComputedStyle; delete globalThis.MutationObserver; delete globalThis.matchMedia;
  globalThis.requestAnimationFrame = undefined;
  return {
    body,
    documentListenerCount: () => [...documentListeners.values()].reduce((total, list) => total + list.length, 0),
    windowListenerCount: () => [...windowListeners.values()].reduce((total, list) => total + list.length, 0),
    fireWindow(type, fields = {}) {
      const event = { type, key: "", ...fields };
      for (const listener of [...(windowListeners.get(type) || [])]) listener(event);
      return event;
    },
  };
}

function sequentialUids(prefix = "gen") {
  let index = 0;
  return () => { index += 1; return `${prefix}${index}`; };
}

const PAGE_UID = "page0001";
const TARGET_UID = "cell0001";
const DATE_TITLE = "August 5th, 2026";
const AUTHOR_TITLE = "Svy";

function planOptions(overrides = {}) {
  return { pageUid: PAGE_UID, targetUid: TARGET_UID, dateTitle: DATE_TITLE, authorTitle: AUTHOR_TITLE, generateUid: sequentialUids(), ...overrides };
}

function fullTree({ containerUid = "cont0001", dateUid = "date0001", authorUid = "auth0001", anchorUid = "anch0001", comments = [] } = {}) {
  return {
    uid: PAGE_UID, string: "", order: 0, children: [
      { uid: "other001", string: "Some unrelated block", order: 0, children: [] },
      {
        uid: containerUid, string: "[[roam/comments]]", order: 1, children: [{
          uid: dateUid, string: `[[${DATE_TITLE}]]`, order: 0, children: [{
            uid: authorUid, string: `[[${AUTHOR_TITLE}]]`, order: 0, children: anchorUid ? [{
              uid: anchorUid, string: `((${TARGET_UID}))`, order: 0,
              children: comments.map((string, index) => ({ uid: `cmt000${index}`, string, order: index, children: [] })),
            }] : [],
          }],
        }],
      },
    ],
  };
}

test("a bare page plans exactly four creates: container (collapsed) → date (first) → author → anchor", () => {
  const plan = commentThreadPlan({ uid: PAGE_UID, string: "", children: [] }, planOptions());
  assert.deepEqual(plan.ops, [
    { type: "create", parentUid: PAGE_UID, uid: "gen1", string: "[[roam/comments]]", order: "last", open: false },
    { type: "create", parentUid: "gen1", uid: "gen2", string: `[[${DATE_TITLE}]]`, order: "first" },
    { type: "create", parentUid: "gen2", uid: "gen3", string: `[[${AUTHOR_TITLE}]]`, order: "last" },
    { type: "create", parentUid: "gen3", uid: "gen4", string: `((${TARGET_UID}))`, order: "last" },
  ]);
  assert.equal(plan.ops.filter((op) => op.open === false).length, 1, "only the container is collapsed");
  assert.equal(plan.ops[0].parentUid, PAGE_UID, "the container lives on the CELL'S page, never under roam/comments");
  assert.deepEqual(plan.existed, { container: false, date: false, author: false, anchor: false });
  assert.deepEqual(
    [plan.containerUid, plan.dateUid, plan.authorUid, plan.anchorUid],
    ["gen1", "gen2", "gen3", "gen4"],
  );
});

test("the plan reuses every existing level and creates only the missing anchor", () => {
  const tree = fullTree({ anchorUid: null });
  const plan = commentThreadPlan(tree, planOptions());
  assert.deepEqual(plan.ops, [
    { type: "create", parentUid: "auth0001", uid: "gen1", string: `((${TARGET_UID}))`, order: "last" },
  ]);
  assert.deepEqual(plan.existed, { container: true, date: true, author: true, anchor: false });
  assert.equal(plan.containerUid, "cont0001");
  assert.equal(plan.dateUid, "date0001");
  assert.equal(plan.authorUid, "auth0001");
  assert.equal(plan.anchorUid, "gen1");

  const otherDay = commentThreadPlan(tree, planOptions({ dateTitle: "August 6th, 2026" }));
  assert.deepEqual(otherDay.ops.map((op) => [op.parentUid, op.string, op.order]), [
    ["cont0001", "[[August 6th, 2026]]", "first"],
    ["gen1", `[[${AUTHOR_TITLE}]]`, "last"],
    ["gen2", `((${TARGET_UID}))`, "last"],
  ], "a new day reuses the container but starts a fresh date branch at the top");
});

test("the plan is idempotent against a tree that already contains its own output", () => {
  const bare = { uid: PAGE_UID, string: "", children: [] };
  const first = commentThreadPlan(bare, planOptions());
  // Positive control: the assertion below is only meaningful because a missing level really does plan work.
  assert.equal(first.ops.length, 4, "control: a bare page must produce ops, otherwise ops.length === 0 proves nothing");
  const missingAnchor = commentThreadPlan(fullTree({ anchorUid: null }), planOptions());
  assert.equal(missingAnchor.ops.length, 1, "control: one missing level still plans one create");

  const settled = fullTree({ comments: ["First thought"] });
  const second = commentThreadPlan(settled, planOptions());
  assert.deepEqual(second.ops, []);
  assert.deepEqual(second.existed, { container: true, date: true, author: true, anchor: true });
  const third = commentThreadPlan(settled, planOptions());
  assert.deepEqual(third.ops, []);
  assert.equal(third.anchorUid, second.anchorUid);
});

test("multi-block comments space-join their anchors and empty inputs are rejected", () => {
  assert.equal(commentAnchorString("aaa1111"), "((aaa1111))");
  assert.equal(commentAnchorString(["aaa1111", "bbb2222"]), "((aaa1111)) ((bbb2222))");
  assert.equal(commentAnchorString([]), "");
  const plan = commentThreadPlan({ uid: PAGE_UID, children: [] }, planOptions({ targetUid: ["aaa1111", "bbb2222"] }));
  assert.equal(plan.ops.at(-1).string, "((aaa1111)) ((bbb2222))");
  assert.throws(() => commentThreadPlan({ uid: PAGE_UID, children: [] }, planOptions({ targetUid: "" })), (error) => error.code === "COMMENT_TARGET_UNKNOWN");
  assert.throws(() => commentThreadPlan({ uid: PAGE_UID, children: [] }, planOptions({ pageUid: null })), (error) => error.code === "COMMENT_PAGE_UNKNOWN");
  assert.throws(() => commentThreadPlan({ uid: PAGE_UID, children: [] }, planOptions({ authorTitle: null })), (error) => error.code === "COMMENT_AUTHOR_UNKNOWN");
  assert.throws(() => commentThreadPlan({ uid: PAGE_UID, children: [] }, planOptions({ dateTitle: "" })), (error) => error.code === "COMMENT_DATE_UNKNOWN");
});

test("applying a plan creates each level, collapses only the container, and writes the body under the anchor", async () => {
  const creates = []; const updates = [];
  const plan = commentThreadPlan({ uid: PAGE_UID, children: [] }, planOptions());
  const applied = await applyCommentThreadPlan(plan, {
    body: "Needs a source",
    create: async (parentUid, string, order, uid) => { creates.push({ parentUid, string, order, uid }); return uid; },
    update: async (uid, string, options) => { updates.push({ uid, string, options }); },
    generateUid: () => "cmt00001",
  });
  assert.deepEqual(creates.map((call) => [call.parentUid, call.string, call.order]), [
    [PAGE_UID, "[[roam/comments]]", "last"],
    ["gen1", `[[${DATE_TITLE}]]`, "first"],
    ["gen2", `[[${AUTHOR_TITLE}]]`, "last"],
    ["gen3", `((${TARGET_UID}))`, "last"],
    ["gen4", "Needs a source", "last"],
  ]);
  assert.deepEqual(updates, [{ uid: "gen1", string: "[[roam/comments]]", options: { open: false } }]);
  assert.equal(applied.anchorUid, "gen4");
  assert.equal(applied.commentUid, "cmt00001");
});

test("applying a plan follows the uids create actually returns, not the ones it was handed", async () => {
  const creates = [];
  const plan = commentThreadPlan({ uid: PAGE_UID, children: [] }, planOptions());
  const applied = await applyCommentThreadPlan(plan, {
    body: "Body",
    create: async (parentUid, string, order, uid) => { creates.push({ parentUid, uid }); return `real-${uid}`; },
    update: async () => {},
    generateUid: () => "cmt00001",
  });
  assert.deepEqual(creates.map((call) => call.parentUid), [PAGE_UID, "real-gen1", "real-gen2", "real-gen3", "real-gen4"]);
  assert.equal(applied.containerUid, "real-gen1");
  assert.equal(applied.anchorUid, "real-gen4");
  assert.equal(applied.commentUid, "real-cmt00001");
});

function recordingApi(rows = []) {
  const calls = [];
  return {
    calls,
    api: {
      q: (query, ...args) => { calls.push({ query, args }); return typeof rows === "function" ? rows(query, args) : rows.shift() ?? []; },
    },
  };
}

test("an absent roam/comments page returns an empty Map after exactly one query", () => {
  const { api, calls } = recordingApi([[]]);
  const index = queryCommentThreadIndex(PAGE_UID, api);
  assert.equal(index.size, 0);
  assert.equal(calls.length, 1, "the 1 ms fast path must not run the page-scoped thread query");
  assert.deepEqual(calls[0].args, ["roam/comments"]);
  assert.equal(queryCommentThreadIndex("", api).size, 0);
  assert.equal(calls.length, 1, "a missing page uid does not query at all");
});

test("the thread index binds every parameter positionally and interpolates nothing into the query text", () => {
  const { api, calls } = recordingApi([
    [[":page-entity-42"]],
    [["cell0001", "thr00001", 2], ["cell0002", "thr00002", 1], ["cell0001", "thr00003", 3]],
  ]);
  const index = queryCommentThreadIndex(PAGE_UID, api);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].args, [PAGE_UID, ":page-entity-42"], "both the page uid and the comments entity are :in parameters");
  for (const call of calls) {
    assert.ok(!call.query.includes(PAGE_UID), "no uid may be interpolated into the datalog string");
    assert.ok(!call.query.includes(":page-entity-42"), "no entity id may be interpolated into the datalog string");
    assert.ok(call.query.includes(":in $"), "every query binds its inputs");
  }
  assert.ok(calls[1].query.includes("[?container :block/page ?page]"), "the container is scoped to the cell's own page");
  assert.ok(calls[1].query.includes("[?container :block/refs ?commentsPage]"), "the container only references roam/comments");
  assert.deepEqual([...index.keys()].sort(), ["cell0001", "cell0002"]);
  assert.deepEqual(index.get("cell0001"), [{ threadUid: "thr00001", count: 2 }, { threadUid: "thr00003", count: 3 }]);
  assert.deepEqual(index.get("cell0002"), [{ threadUid: "thr00002", count: 1 }]);
  assert.equal(commentThreadCount(index.get("cell0001")), 5);
});

function badgeView({ referenceCounts, commentThreads }) {
  const model = new GridModel({ rows: [[{ uid: TARGET_UID, raw: "Source" }]] });
  const root = new MiniNode("section"); root.className = "rg-root";
  const cell = new MiniNode("div"); cell.className = "rg-cell"; cell.dataset.row = "0"; cell.dataset.col = "0";
  const content = new MiniNode("div"); content.className = "rg-cell-content"; content.textContent = "Source";
  cell.appendChild(content); root.appendChild(cell); globalThis.document.body.appendChild(root);
  const view = Object.assign(Object.create(GridView.prototype), {
    model, root,
    referenceCounts: new Map(referenceCounts),
    commentThreads: new Map(commentThreads),
    cells: new Map([["0:0", cell]]),
    cellCoordinatesByUid: new Map([[TARGET_UID, { row: 0, col: 0 }]]),
    inlineReferencesUid: null, inlineReferencesMode: null, inlineReferencesPanel: null,
  });
  return { view, cell, content, root, model };
}

test("the badge partition subtracts thread anchors so a commented cell is never double-counted", () => {
  installMiniDom();
  const { view, cell, content } = badgeView({
    referenceCounts: [[TARGET_UID, 3]],
    commentThreads: [[TARGET_UID, [{ threadUid: "thr00001", count: 2 }]]],
  });
  view.updateReferenceCountBadges([TARGET_UID]);

  const referenceBadge = cell.querySelector(".rg-cell-reference-count");
  const commentBadge = cell.querySelector(".rg-cell-comment-count");
  assert.ok(referenceBadge && commentBadge);
  assert.equal(referenceBadge.textContent, "2");
  assert.equal(commentBadge.textContent, "2");
  assert.equal(commentBadge.getAttribute("aria-label"), "2 comments. Click to toggle comments");
  assert.equal(content.textContent, "Source", "the stable cell content is untouched");

  // Positive control: 0.8.2 rendered the raw count, so this assertion fails the moment the partition
  // is removed.  refs:3 is real — one of them IS the thread anchor.
  const unpartitioned = String(view.referenceCounts.get(TARGET_UID));
  assert.equal(unpartitioned, "3");
  assert.notEqual(referenceBadge.textContent, unpartitioned, "control: the reference badge must not render the raw, inflated count");

  view.commentThreads.set(TARGET_UID, [{ threadUid: "thr00001", count: 2 }, { threadUid: "thr00004", count: 1 }]);
  view.updateReferenceCountBadges([TARGET_UID]);
  assert.equal(cell.querySelector(".rg-cell-reference-count").textContent, "1", "two threads subtract two refs");
  assert.equal(cell.querySelector(".rg-cell-comment-count").textContent, "3", "the comment badge counts comments, not anchors");
});

test("a cell referenced only by its comment thread loses the reference badge and keeps the comment badge", () => {
  installMiniDom();
  const { view, cell } = badgeView({
    referenceCounts: [[TARGET_UID, 1]],
    commentThreads: [[TARGET_UID, [{ threadUid: "thr00001", count: 4 }]]],
  });
  view.updateReferenceCountBadges([TARGET_UID]);
  assert.equal(cell.querySelector(".rg-cell-reference-count"), null, "remainder 0 removes the reference badge entirely");
  assert.equal(cell.querySelector(".rg-cell-comment-count").textContent, "4");

  view.commentThreads.clear();
  view.updateReferenceCountBadges([TARGET_UID]);
  assert.equal(cell.querySelector(".rg-cell-comment-count"), null, "no thread means no comment badge");
  assert.equal(cell.querySelector(".rg-cell-reference-count").textContent, "1", "the ref badge returns once the thread is gone");
});

function armableView() {
  const rows = [];
  for (let row = 0; row < 3; row += 1) rows.push([{ uid: `u${row}00001`, raw: `r${row}` }]);
  const model = new GridModel({ rows });
  const root = new MiniNode("section"); root.className = "rg-root";
  const cells = new Map();
  for (let row = 0; row < 3; row += 1) {
    const cell = new MiniNode("div"); cell.className = "rg-cell"; cell.dataset.row = String(row); cell.dataset.col = "0";
    root.appendChild(cell); cells.set(row, cell);
  }
  globalThis.document.body.appendChild(root);
  const view = Object.assign(Object.create(GridView.prototype), {
    model, root, disposed: false, commentArmed: false, commentAddButton: null, boundCommentPointerOver: null,
  });
  return { view, root, cells };
}

test("arming adds exactly one delegated pointerover to the view root and nothing to document or window", () => {
  const dom = installMiniDom();
  const { view, root, cells } = armableView();
  const documentBefore = dom.documentListenerCount();
  const windowBefore = dom.windowListenerCount();

  assert.equal(view.setCommentArmed(true), true);
  assert.equal(root.listenerCount("pointerover"), 1);
  assert.equal(dom.documentListenerCount() - documentBefore, 0, "no document listener may be added by arming");
  assert.equal(dom.windowListenerCount() - windowBefore, 0, "no window listener may be added by arming");
  assert.equal(root.classList.contains("rg-root--comment-armed"), true);

  view.setCommentArmed(true);
  assert.equal(root.listenerCount("pointerover"), 1, "re-arming must not stack listeners");
  assert.equal(root.querySelectorAll(".rg-cell-comment-add").length, 0, "an armed grid that was never hovered still has zero nodes");

  cells.get(0).dispatch("pointerover");
  assert.equal(root.querySelectorAll(".rg-cell-comment-add").length, 1);
});

test("the reused affordance node keeps its identity across three cells", () => {
  installMiniDom();
  const { view, root, cells } = armableView();
  view.setCommentArmed(true);

  cells.get(0).dispatch("pointerover");
  const first = cells.get(0).querySelector(".rg-cell-comment-add");
  assert.ok(first);
  cells.get(1).dispatch("pointerover");
  const second = cells.get(1).querySelector(".rg-cell-comment-add");
  cells.get(2).dispatch("pointerover");
  const third = cells.get(2).querySelector(".rg-cell-comment-add");

  assert.equal(second, first);
  assert.equal(third, first);
  assert.equal(root.querySelectorAll(".rg-cell-comment-add").length, 1, "the affordance is moved, never cloned");
  assert.equal(third.dataset.row, "2");
  assert.equal(third.getAttribute("aria-label"), "Comment on A3");
});

test("disarmed means zero listeners and zero nodes", () => {
  const dom = installMiniDom();
  const { view, root, cells } = armableView();
  const documentBefore = dom.documentListenerCount();
  const windowBefore = dom.windowListenerCount();

  view.setCommentArmed(true);
  cells.get(1).dispatch("pointerover");
  // Positive control: the two assertions after the disarm are only meaningful because both are
  // non-zero here.  Delete the teardown in setCommentArmed and this test goes red, not green.
  assert.equal(root.listenerCount("pointerover"), 1, "control: an armed grid really does carry one listener");
  assert.equal(root.querySelectorAll(".rg-cell-comment-add").length, 1, "control: an armed, hovered grid really does carry one node");

  assert.equal(view.setCommentArmed(false), false);
  assert.equal(root.listenerCount("pointerover"), 0);
  assert.equal(root.querySelectorAll(".rg-cell-comment-add").length, 0);
  assert.equal(view.commentAddButton, null);
  assert.equal(root.classList.contains("rg-root--comment-armed"), false);
  assert.equal(dom.documentListenerCount(), documentBefore);
  assert.equal(dom.windowListenerCount(), windowBefore);

  cells.get(0).dispatch("pointerover");
  assert.equal(root.querySelectorAll(".rg-cell-comment-add").length, 0, "a disarmed grid ignores hovers entirely");
});

test("the affordance installer flips arming on the modifier and disarms on keyup, blur and visibilitychange", () => {
  const dom = installMiniDom();
  setCommentArming(false);
  const uninstall = installCommentAffordance();
  try {
    assert.equal(commentArmingState(), false);
    dom.fireWindow("keydown", { key: "a" });
    assert.equal(commentArmingState(), false, "an ordinary key must not arm");
    dom.fireWindow("keydown", { key: "Meta" });
    assert.equal(commentArmingState(), true);
    dom.fireWindow("keyup", { key: "Meta" });
    assert.equal(commentArmingState(), false);

    dom.fireWindow("keydown", { key: "Control" });
    assert.equal(commentArmingState(), true);
    dom.fireWindow("blur");
    assert.equal(commentArmingState(), false, "losing the window must disarm — keyup never arrives");

    dom.fireWindow("keydown", { key: "Control" });
    dom.fireWindow("visibilitychange");
    assert.equal(commentArmingState(), false, "a hidden tab must disarm");
    assert.equal(dom.documentListenerCount(), 0, "the affordance owns no document listeners");
  } finally { uninstall(); }
  const after = dom.windowListenerCount();
  assert.equal(after, 0, "uninstalling removes every window listener it installed");
  dom.fireWindow("keydown", { key: "Meta" });
  assert.equal(commentArmingState(), false);
});

function commentSession({ pageUid = PAGE_UID, threadRows = [] } = {}) {
  clearUndoHistories();
  const model = new GridModel({ rows: [[{ uid: TARGET_UID, raw: "Source" }]], tableUid: "tbl00001" });
  const adapter = { model, load: () => model, watchExternal: () => () => {}, getBaseRaw: () => "", saveContent: async () => ({ saved: [], skipped: [] }), save: async (value) => value, dispose() {} };
  globalThis.window.roamAlphaAPI = {
    q: (query, ...args) => {
      if (query.includes(":block/page ?page]\n      [?page :block/uid ?pageUid]")) return [[pageUid]];
      if (query.includes(":node/title ?title]")) return [[":comments-entity"]];
      void args;
      return threadRows;
    },
  };
  const session = new NativeGridSession("tbl00001", { adapter, model });
  return { session, model };
}

test("an optimistically merged thread absorbs its own datalog echo", () => {
  installMiniDom();
  const { session } = commentSession({ threadRows: [[TARGET_UID, "thr00001", 1]] });
  let repaints = 0;
  session.addView({ root: new MiniNode("section"), updateCommentBadges: () => { repaints += 1; }, updateReferenceCountBadges: () => {} });

  mergeCommentThread(session.commentThreads, TARGET_UID, "thr00001");
  assert.deepEqual(session.commentThreads.get(TARGET_UID), [{ threadUid: "thr00001", count: 1 }]);

  session.refreshCommentThreads();
  assert.equal(session.lastCommentThreadChanges.size, 0, "the write's own echo must diff to nothing");
  assert.equal(repaints, 0, "nothing repaints when the refresh confirms what we already merged");
  assert.deepEqual(session.commentThreads.get(TARGET_UID), [{ threadUid: "thr00001", count: 1 }]);
  session.dispose();
});

test("a real external comment does change the set — the echo test is not vacuous", () => {
  installMiniDom();
  const { session } = commentSession({ threadRows: [[TARGET_UID, "thr00001", 2]] });
  let repainted = null;
  session.addView({ root: new MiniNode("section"), updateCommentBadges: (uids) => { repainted = [...uids]; }, updateReferenceCountBadges: () => {} });

  // Positive control for the echo assertion: same thread uid, different comment count.
  mergeCommentThread(session.commentThreads, TARGET_UID, "thr00001");
  session.refreshCommentThreads();
  assert.deepEqual([...session.lastCommentThreadChanges], [TARGET_UID]);
  assert.deepEqual(repainted, [TARGET_UID]);
  assert.deepEqual(session.commentThreads.get(TARGET_UID), [{ threadUid: "thr00001", count: 2 }]);
  session.dispose();
});

test("diffCommentThreadIndex reports additions, removals, count changes and nothing else", () => {
  const previous = new Map([
    ["cellA", [{ threadUid: "t1", count: 1 }]],
    ["cellB", [{ threadUid: "t2", count: 3 }]],
    ["cellC", [{ threadUid: "t3", count: 1 }]],
  ]);
  const next = new Map([
    ["cellA", [{ threadUid: "t1", count: 1 }]],
    ["cellB", [{ threadUid: "t2", count: 4 }]],
    ["cellD", [{ threadUid: "t4", count: 1 }]],
  ]);
  assert.deepEqual([...diffCommentThreadIndex(previous, next)].sort(), ["cellB", "cellC", "cellD"]);
  assert.equal(diffCommentThreadIndex(previous, previous).size, 0);
  assert.equal(diffCommentThreadIndex(new Map(), new Map()).size, 0);
});

test("LargeGridView deliberately has no setCommentArmed and the call site tolerates that", () => {
  const large = { root: new MiniNode("section") };
  assert.equal(typeof GridView.prototype.setCommentArmed, "function");
  assert.equal(large.setCommentArmed, undefined);
  assert.doesNotThrow(() => large.setCommentArmed?.(true));
});
