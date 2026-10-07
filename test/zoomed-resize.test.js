import test from "node:test";
import assert from "node:assert/strict";
import { GridView, LargeGridView, elementScale, ensureRuntimeRegistries, refreshSettingsCache } from "../src/extension.js";

ensureRuntimeRegistries();
refreshSettingsCache({ settings: { getAll: () => ({}) } }, { getItem: () => null, setItem: () => {} });

const scaled = (factor, w = 400, h = 200) => ({
  offsetWidth: w, offsetHeight: h,
  getBoundingClientRect: () => ({ width: w * factor, height: h * factor, left: 0, top: 0 }),
});

function withDocument(run) {
  const prev = globalThis.document;
  const listeners = {};
  globalThis.document = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener: () => {},
  };
  try { return run(listeners); } finally { globalThis.document = prev; }
}

test("elementScale measures the zoom of an ancestor and falls back to 1", () => {
  assert.deepEqual(elementScale(scaled(0.5)), { x: 0.5, y: 0.5 });
  assert.deepEqual(elementScale(scaled(1)), { x: 1, y: 1 });
  assert.deepEqual(elementScale(scaled(1.005)), { x: 1, y: 1 });
  assert.deepEqual(elementScale(scaled(0.5, 0, 0)), { x: 1, y: 1 });
  assert.deepEqual(elementScale(null), { x: 1, y: 1 });
});

test("large grid column and row resize follow a scale(0.5) ancestor", () => {
  withDocument((listeners) => {
    const view = {
      root: scaled(0.5), resizeCleanup: null, columnResizePreview: null, rowResizePreview: null,
      columnWidth: () => 100, store: { rowHeight: () => 30 }, scheduleRender() {}, scheduleSave() {},
    };
    const ev = (x, y) => ({ clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} });
    LargeGridView.prototype.startColumnResize.call(view, 2, ev(10, 0));
    listeners.pointermove({ clientX: 40, clientY: 0 });
    assert.equal(view.columnResizePreview.width, 160);
    LargeGridView.prototype.startRowResize.call(view, 1, ev(0, 10));
    listeners.pointermove({ clientX: 0, clientY: 30 });
    assert.equal(view.rowResizePreview.height, 70);
  });
});

test("native grid column and row resize follow a scale(0.5) ancestor", () => {
  const prevCs = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ gridTemplateColumns: "42px 100px 100px", gridTemplateRows: "28px 30px 30px" });
  try {
    withDocument((listeners) => {
      const view = {
        root: Object.assign(scaled(0.5), { classList: { add() {}, remove() {} } }),
        gridElement: {}, resizeCleanup: null, headersOn: () => true,
        model: { columnIds: ["a", "b"], widths: {}, fitToWidth: false, getRowHeight: () => 30 },
        applyGridTemplateColumns() {}, applyGridTemplateRows() {},
      };
      const target = { closest: () => null, setPointerCapture() {} };
      const ev = (x, y) => ({ clientX: x, clientY: y, pointerId: 1, currentTarget: target, preventDefault() {}, stopPropagation() {} });
      GridView.prototype.startColumnResize.call(view, "a", ev(0, 0));
      listeners.pointermove({ clientX: 30, clientY: 0 });
      assert.equal(view.columnResizePreview.widths.a, 160);
      GridView.prototype.startRowResize.call(view, 0, ev(0, 0));
      listeners.pointermove({ clientX: 0, clientY: 20 });
      assert.equal(view.rowResizePreview.height, 70);
    });
  } finally { globalThis.getComputedStyle = prevCs; }
});
