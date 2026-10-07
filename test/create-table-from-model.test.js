import test from "node:test";
import assert from "node:assert/strict";
import {
  GridError,
  GridModel,
  MetadataStore,
  RegistrySet,
  TABLE_FROM_MODEL_MAX_COLS,
  TABLE_FROM_MODEL_MAX_ROWS,
  buildNativeTableMarkdown,
  createExtensionToolsRegistration,
  createPublicApi,
  createTableFromModel,
  encodeNativeTableCell,
  planTableFromModel,
  runtime,
  settingsCache,
} from "../src/extension.js";

const CONSUMED = new Set(["\\", "#", "`", "*", "-", ".", ">", "[", "]", "(", ")"]);

/** The mock stores bullet text literally. This is the 2026-10-07 fromMarkdown rule for a
 *  backslash: it is removed only when the next character is one we measured. */
function unescapeMeasured(line) {
  let out = "";
  for (let index = 0; index < line.length; index += 1) {
    const next = line[index + 1];
    if (line[index] === "\\" && next != null && CONSUMED.has(next)) {
      out += next;
      index += 1;
    } else out += line[index];
  }
  return out;
}

function installDocumentStub() {
  const previous = globalThis.document;
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
  return () => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; };
}

function installCreateTableMock({ fromMarkdown = "parse" } = {}) {
  let uidCounter = 0;
  const pages = new Map();
  const blocks = new Map();
  const calls = { create: 0, fromMarkdown: 0, markdown: [] };
  const clone = (block) => ({ uid: block.uid, string: block.string, order: block.order, children: (block.children || []).map(clone) });
  const register = (node) => {
    blocks.set(node.uid, node);
    for (const child of node.children || []) register(child);
  };
  const nextUid = () => `uid${String(++uidCounter).padStart(6, "0")}`;
  const add = (uid, string, children = [], order = 0) => register({ uid, string, order, children });
  const attach = (parentUid, node, order) => {
    const parent = blocks.get(parentUid);
    if (!parent) return;
    if (order === "first") {
      for (const child of parent.children) child.order = (child.order ?? 0) + 1;
      node.order = 0;
      parent.children.unshift(node);
    } else if (typeof order === "number") {
      node.order = order;
      const insertAt = parent.children.findIndex((child) => (child.order ?? 0) >= order);
      if (insertAt < 0) parent.children.push(node); else parent.children.splice(insertAt, 0, node);
    } else {
      node.order = parent.children.reduce((max, child) => Math.max(max, (child.order ?? -1) + 1), 0);
      parent.children.push(node);
    }
    register(node);
  };
  const parseMarkdown = (markdown) => {
    const root = { uid: nextUid(), string: "", order: 0, children: [] };
    const stack = [{ depth: -1, node: root }];
    let current = null;
    for (const line of String(markdown).split("\n")) {
      const bullet = /^(\s*)- (.*)$/.exec(line);
      if (bullet) {
        const depth = bullet[1].length / 2;
        const node = { uid: nextUid(), string: unescapeMeasured(bullet[2]), order: 0, children: [] };
        while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
        const parent = stack[stack.length - 1].node;
        node.order = parent.children.length;
        parent.children.push(node);
        stack.push({ depth, node });
        current = node;
      } else if (current && line.startsWith(" ".repeat(stack[stack.length - 1].depth * 2 + 2))) {
        current.string += `\n${unescapeMeasured(line.slice(stack[stack.length - 1].depth * 2 + 2))}`;
      } else {
        throw new Error(`unparsed markdown line ${JSON.stringify(line)}`);
      }
    }
    return root.children[0];
  };
  globalThis.window = { roamAlphaAPI: {
    util: { generateUID: nextUid },
    q: (query, uid) => {
      if (uid && blocks.has(uid)) return [[clone(blocks.get(uid))]];
      const match = typeof query === "string" && !uid ? /:block\/uid "([^"]+)"/.exec(query) : null;
      if (!match) return [];
      for (const parent of blocks.values()) {
        const child = (parent.children || []).find((item) => item.uid === match[1]);
        if (child) return [[parent.uid, child.order ?? 0]];
      }
      return [];
    },
    ui: { getFocusedBlock: () => null, mainWindow: { getOpenPageOrBlockUid: async () => null } },
    data: {
      pull: (_pattern, [, title]) => (pages.has(title) ? { ":block/uid": pages.get(title) } : null),
      page: { create: async ({ page }) => { pages.set(page.title, page.uid); add(page.uid, page.title); } },
      block: {
        create: async ({ location, block }) => {
          calls.create += 1;
          const order = typeof location.order === "number" ? location.order : "last";
          const node = { ...block, order, children: [] };
          blocks.set(block.uid, node);
          const parent = blocks.get(location["parent-uid"]);
          if (!parent) return;
          if (typeof order === "number") {
            const insertAt = parent.children.findIndex((child) => (child.order ?? 0) >= order);
            if (insertAt < 0) parent.children.push(node); else parent.children.splice(insertAt, 0, node);
          } else parent.children.push(node);
        },
        update: async ({ block }) => { if (blocks.has(block.uid)) blocks.get(block.uid).string = block.string; },
        delete: async ({ block }) => { blocks.delete(block.uid); },
      },
    },
  }, dispatchEvent() {} };
  if (fromMarkdown === "parse") {
    globalThis.window.roamAlphaAPI.data.block.fromMarkdown = async ({ location, "markdown-string": markdown }) => {
      calls.fromMarkdown += 1;
      calls.markdown.push(markdown);
      const table = parseMarkdown(markdown);
      attach(location["parent-uid"], table, location.order);
      return { uids: [table.uid] };
    };
  } else if (typeof fromMarkdown === "function") {
    globalThis.window.roamAlphaAPI.data.block.fromMarkdown = async (args) => {
      calls.fromMarkdown += 1;
      calls.markdown.push(args["markdown-string"]);
      return fromMarkdown(args, { blocks, add, attach, nextUid });
    };
  }
  return {
    pages, blocks, calls,
    addBlock(uid, string, _parentUid = null, children = [], order = 0) { add(uid, string, children, order); },
    addPage(title, uid) { pages.set(title, uid); add(uid, title); },
    dispose: () => delete globalThis.window,
  };
}

async function boot(t, options) {
  const mock = installCreateTableMock(options);
  const restoreDocument = installDocumentStub();
  t.after(() => {
    mock.dispose();
    restoreDocument();
    runtime.metadata = null;
    runtime.registries = null;
    settingsCache.delete("writes-native-budget");
  });
  runtime.registries = new RegistrySet();
  runtime.metadata = new MetadataStore();
  await runtime.metadata.initialize();
  mock.addPage("Home", "pageHome");
  return mock;
}

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof GridError && error.code === code);
}

async function rejectsCode(fn, code) {
  await assert.rejects(fn, (error) => error instanceof GridError && error.code === code);
}

function modelOf(uid) {
  return GridModel.fromJSON(createPublicApi().getTableModel(uid));
}

test("encodeNativeTableCell escapes only what fromMarkdown would change", () => {
  assert.deepEqual(encodeNativeTableCell(""), [""]);
  assert.deepEqual(encodeNativeTableCell("hello"), ["hello"]);
  assert.deepEqual(encodeNativeTableCell("# of samples"), ["\\# of samples"]);
  assert.deepEqual(encodeNativeTableCell("#"), ["\\#"]);
  assert.deepEqual(encodeNativeTableCell("## Title"), ["\\## Title"]);
  assert.deepEqual(encodeNativeTableCell("#nospace"), ["#nospace"]);
  assert.deepEqual(encodeNativeTableCell("```"), ["\\```"]);
  assert.deepEqual(encodeNativeTableCell("```js"), ["\\```js"]);
  assert.deepEqual(encodeNativeTableCell("{{[[TODO]]}} x"), ["{{[[TODO]]}} x"]);
  assert.deepEqual(encodeNativeTableCell("[[Page]]"), ["[[Page]]"]);
  assert.deepEqual(encodeNativeTableCell("> quote"), ["> quote"]);
  assert.deepEqual(encodeNativeTableCell("- item"), ["- item"]);
  assert.deepEqual(encodeNativeTableCell("a\\.b"), ["a\\\\.b"]);
  assert.deepEqual(encodeNativeTableCell("\\foo"), ["\\foo"]);
  assert.deepEqual(encodeNativeTableCell("line1\nline2"), ["line1", "line2"]);
  assert.deepEqual(encodeNativeTableCell("line1\n- item"), ["line1", "\\- item"]);
  assert.deepEqual(encodeNativeTableCell("line1\n* item"), ["line1", "\\* item"]);
  assert.deepEqual(encodeNativeTableCell("line1\n# Title"), ["line1", "\\# Title"]);
  assert.deepEqual(encodeNativeTableCell("line1\n```"), ["line1", "\\```"]);
  assert.deepEqual(encodeNativeTableCell("line1\n1. item"), ["line1", "1\\. item"]);
  assert.deepEqual(encodeNativeTableCell("line1\n> quote"), ["line1", "> quote"]);
  assert.equal(encodeNativeTableCell("  lead"), null);
  assert.equal(encodeNativeTableCell("trail  "), null);
  assert.equal(encodeNativeTableCell("a\tb"), null);
  assert.equal(encodeNativeTableCell("line1\n\nline3"), null);
  assert.equal(encodeNativeTableCell("\nline2"), null);
  assert.equal(encodeNativeTableCell("line1\n"), null);
  assert.equal(encodeNativeTableCell("a\n+ item"), null);
  assert.equal(encodeNativeTableCell("a\n1) item"), null);
  assert.equal(encodeNativeTableCell("---"), null);
  assert.equal(encodeNativeTableCell("a\\ "), null);
  assert.equal(encodeNativeTableCell("a\\1"), null);
  assert.equal(encodeNativeTableCell("a\n\\b"), null);
});

test("buildNativeTableMarkdown nests columns and leaves covered cells empty", () => {
  assert.equal(buildNativeTableMarkdown([["Name", "# of samples"], ["A", ""]]), [
    "- {{[[table]]}}",
    "  - Name",
    "    - \\# of samples",
    "  - A",
    "    - ",
  ].join("\n"));
  assert.equal(buildNativeTableMarkdown([["line1\n- item", "ok"]]), [
    "- {{[[table]]}}",
    "  - line1",
    "    \\- item",
    "    - ok",
  ].join("\n"));
  assert.equal(buildNativeTableMarkdown([["H", "", "x"], ["a", "b", "c"]]), [
    "- {{[[table]]}}",
    "  - H",
    "    - ",
    "      - x",
    "  - a",
    "    - b",
    "      - c",
  ].join("\n"));
  assert.equal(buildNativeTableMarkdown([["  lead"]]), null);
});

test("planTableFromModel pads ragged rows and rejects a bad spec before any write", () => {
  const ragged = planTableFromModel({ rows: [["a", "b", "c"], ["d"]] });
  assert.deepEqual(ragged.matrix, [["a", "b", "c"], ["d", "", ""]]);
  assert.equal(ragged.path, "markdown");
  assert.equal(ragged.writes, 1);
  assert.match(ragged.markdown, /  - d\n    - \n      - /);

  const merged = planTableFromModel({
    rows: [["H", "", "x"], ["a", "b", "c"]],
    merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2, id: "keep" }],
    headerRows: "1",
    columnAlignments: ["left", "center", "right"],
    alignments: { "1,1": "center" },
    widths: { 0: 120, 2: "200" },
  });
  assert.equal(merged.headerRows, 1);
  assert.equal(merged.merges[0].id, "keep");
  assert.equal(merged.alignments[0][0], "left");
  assert.equal(merged.alignments[0][1], null);
  assert.equal(merged.alignments[1][1], "center");
  assert.deepEqual(merged.widths, [120, null, 200]);

  const sequential = planTableFromModel({ rows: [["  lead", "ok"]] });
  assert.equal(sequential.path, "sequential");
  assert.equal(sequential.markdown, null);
  assert.equal(sequential.writes, 3);

  throwsCode(() => planTableFromModel({}), "TABLE_SHAPE");
  throwsCode(() => planTableFromModel({ rows: [] }), "TABLE_SHAPE");
  throwsCode(() => planTableFromModel({ rows: ["nope"] }), "TABLE_SHAPE");
  throwsCode(() => planTableFromModel({ rows: [[1]] }), "TABLE_CELL");
  throwsCode(() => planTableFromModel({ rows: [[]] }), "TABLE_SHAPE");
  throwsCode(() => planTableFromModel({ rows: [Array.from({ length: TABLE_FROM_MODEL_MAX_COLS + 1 }, () => "")] }), "TABLE_TOO_LARGE");
  throwsCode(() => planTableFromModel({ rows: Array.from({ length: TABLE_FROM_MODEL_MAX_ROWS + 1 }, () => [""]) }), "TABLE_TOO_LARGE");
  throwsCode(() => planTableFromModel({ rows: [["a"]], merges: "nope" }), "INVALID_MERGE");
  throwsCode(() => planTableFromModel({ rows: [["a", "b"]], merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1 }] }), "INVALID_MERGE");
  throwsCode(() => planTableFromModel({ rows: [["a", "b"]], merges: [{ row: 0, col: 0, rowSpan: 0, colSpan: 2 }] }), "INVALID_MERGE");
  throwsCode(() => planTableFromModel({ rows: [["a", "b"]], merges: [{ row: 0, col: 1, rowSpan: 1, colSpan: 2 }] }), "INVALID_MERGE");
  throwsCode(() => planTableFromModel({ rows: [["a", "x"], ["", ""]] , merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }] }), "INVALID_MERGE");
  throwsCode(() => planTableFromModel({ rows: [["a", "", ""], ["", "", ""]] , merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }, { row: 0, col: 1, rowSpan: 2, colSpan: 1 }] }), "INVALID_MERGE");
  throwsCode(() => planTableFromModel({ rows: [["a"]], headerRows: -1 }), "HEADER_ROWS");
  throwsCode(() => planTableFromModel({ rows: [["a"]], headerRows: 2 }), "HEADER_ROWS");
  throwsCode(() => planTableFromModel({ rows: [["a"]], alignments: { "1,0": "left" } }), "ALIGNMENT");
  throwsCode(() => planTableFromModel({ rows: [["a", ""], ["", ""]], merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }], alignments: { "0,1": "left" } }), "ALIGNMENT");
  throwsCode(() => planTableFromModel({ rows: [["a"]], alignments: { "0,0": "justify" } }), "ALIGNMENT");
  throwsCode(() => planTableFromModel({ rows: [["a"]], columnAlignments: ["left", "right"] }), "ALIGNMENT");
  throwsCode(() => planTableFromModel({ rows: [["a"]], widths: [] }), "WIDTH");
  throwsCode(() => planTableFromModel({ rows: [["a"]], widths: { 3: 10 } }), "WIDTH");
  throwsCode(() => planTableFromModel({ rows: [["a"]], widths: { 0: "wide" } }), "WIDTH");

  settingsCache.set("writes-native-budget", 1);
  try {
    throwsCode(() => planTableFromModel({ rows: [["  lead", "b"], ["c", "d"]] }), "MUTATION_BUDGET");
    const underBudget = planTableFromModel({ rows: [["# Title", "ok"], ["c", "d"]] });
    assert.equal(underBudget.path, "markdown");
    assert.equal(underBudget.writes, 1);
  } finally {
    settingsCache.delete("writes-native-budget");
  }
});

test("createTableFromModel writes one nested table and stores merges, headers, alignment, and widths", async (t) => {
  const mock = await boot(t);
  const rows = [
    ["Name", "# of samples", ""],
    ["line1\n- item", "{{[[TODO]]}} x", "[[Page]]"],
    ["((abcdefghij))", "> quote", "```"],
    ["$$x$$", "a\\.b", "\\foo"],
  ];
  const info = await createTableFromModel({
    parentUid: "pageHome",
    rows,
    merges: [{ row: 0, col: 1, rowSpan: 1, colSpan: 2 }],
    headerRows: 1,
    columnAlignments: ["left", "center", "right"],
    alignments: { "1,0": "right" },
    widths: { 0: 10, 1: 120, 2: 900 },
    returnInfo: true,
  });
  assert.equal(info.path, "markdown");
  assert.equal(info.writes, 1);
  assert.equal(mock.calls.fromMarkdown, 1);
  assert.equal(mock.calls.create, 1, "the only block.create is the metadata record");
  const table = mock.blocks.get(info.uid);
  assert.equal(table.string, "{{[[table]]}}");
  assert.equal(table.children.length, 4);
  assert.equal(table.children[0].children[0].string, "# of samples");
  assert.equal(table.children[0].children[0].children[0].string, "");
  assert.equal(table.children[1].string, "line1\n- item");

  const model = modelOf(info.uid);
  assert.equal(model.rowCount, 4);
  assert.equal(model.colCount, 3);
  assert.equal(model.frozenRows, 1);
  assert.equal(model.isHeaderRow(0), true);
  assert.equal(model.isHeaderRow(1), false);
  assert.equal(model.merges.length, 1);
  assert.equal(model.merges[0].row, 0);
  assert.equal(model.merges[0].col, 1);
  assert.equal(model.merges[0].rowSpan, 1);
  assert.equal(model.merges[0].colSpan, 2);
  assert.ok(model.merges[0].id);
  assert.equal(model.getAlignment(0, 0), "left");
  assert.equal(model.getAlignment(0, 1), "center");
  assert.equal(model.getAlignment(1, 0), "right");
  assert.equal(model.getAlignment(2, 2), "right");
  assert.equal(model.widths[model.columnIds[0]], 56);
  assert.equal(model.widths[model.columnIds[1]], 120);
  assert.equal(model.widths[model.columnIds[2]], 640);
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < rows[row].length; col += 1) assert.equal(model.getRaw(row, col), rows[row][col]);
  }
});

test("createTableFromModel returns a uid, and enhance:false skips metadata", async (t) => {
  const mock = await boot(t);
  const uid = await createTableFromModel({ parentUid: "pageHome", rows: [["A", "B"], ["", "C"]] });
  assert.equal(typeof uid, "string");
  assert.equal(runtime.metadata.has(uid), true);
  assert.equal(modelOf(uid).frozenRows, 0);
  assert.equal(modelOf(uid).isHeaderRow(0), false);
  assert.equal(mock.blocks.get(uid).children[1].string, "");
  assert.equal(mock.blocks.get(uid).children[1].children[0].string, "C");

  const plain = await createTableFromModel({ parentUid: "pageHome", rows: [["Z"]], enhance: false, returnInfo: true });
  assert.equal(plain.path, "markdown");
  assert.equal(runtime.metadata.has(plain.uid), false);
  assert.equal(mock.calls.create, 1, "the unenhanced table does not write metadata");
  assert.equal(createPublicApi().getTableModel(plain.uid), null);
});

test("a cell that cannot round-trip uses the sequential path, and the budget applies only there", async (t) => {
  const mock = await boot(t);
  const info = await createTableFromModel({
    parentUid: "pageHome",
    rows: [["  lead", "ok"]],
    returnInfo: true,
  });
  assert.equal(info.path, "sequential");
  assert.equal(info.writes, 3);
  assert.equal(mock.calls.fromMarkdown, 0);
  assert.equal(mock.blocks.get(info.uid).children[0].string, "  lead");
  assert.equal(modelOf(info.uid).getRaw(0, 0), "  lead");

  settingsCache.set("writes-native-budget", 1);
  await rejectsCode(() => createTableFromModel({ parentUid: "pageHome", rows: [["  lead", "b"], ["c", "d"]] }), "MUTATION_BUDGET");
  const markdown = await createTableFromModel({ parentUid: "pageHome", rows: [["# Title", "ok"], ["c", "d"]], returnInfo: true });
  assert.equal(markdown.path, "markdown");
  assert.equal(markdown.writes, 1);
  assert.equal(mock.blocks.get(markdown.uid).children[0].string, "# Title");
});

test("a missing fromMarkdown falls back to sequential, and refuses when that would exceed the budget", async (t) => {
  const mock = await boot(t, { fromMarkdown: false });
  const info = await createTableFromModel({ parentUid: "pageHome", rows: [["Hi"]], returnInfo: true });
  assert.equal(info.path, "sequential");
  assert.equal(info.writes, 2);
  assert.equal(mock.calls.fromMarkdown, 0);
  assert.equal(mock.blocks.get(info.uid).string, "{{[[table]]}}");
  settingsCache.set("writes-native-budget", 1);
  const before = mock.calls.create;
  await rejectsCode(() => createTableFromModel({ parentUid: "pageHome", rows: [["A", "B"]] }), "MUTATION_BUDGET");
  assert.equal(mock.calls.create, before);
});

test("afterUid, order, and a bad location are resolved before the write", async (t) => {
  const mock = await boot(t);
  mock.addBlock("pageHome", "Home", null, [{ uid: "sib", string: "Before", order: 0, children: [] }]);
  const after = await createTableFromModel({ afterUid: "sib", rows: [["After"]], returnInfo: true });
  const home = mock.blocks.get("pageHome");
  assert.equal(home.children.map((child) => child.uid).indexOf(after.uid), 1);
  assert.equal(home.children[1].order, 1);

  const first = await createTableFromModel({ parentUid: "pageHome", order: "first", rows: [["First"]] });
  assert.equal(mock.blocks.get("pageHome").children[0].uid, first);

  const indexed = await createTableFromModel({ parentUid: "pageHome", order: "0", rows: [["Zero"]] });
  assert.equal(mock.blocks.get("pageHome").children[0].uid, indexed);

  await rejectsCode(() => createTableFromModel({ rows: [["A"]] }), "MISSING_PARENT");
  await rejectsCode(() => createTableFromModel({ parentUid: "pageHome", afterUid: "sib", rows: [["A"]] }), "MISSING_PARENT");
  await rejectsCode(() => createTableFromModel({ afterUid: "missing", rows: [["A"]] }), "MISSING_PARENT");
  await rejectsCode(() => createTableFromModel({ parentUid: "pageHome", order: "middle", rows: [["A"]] }), "TABLE_ORDER");
  await rejectsCode(() => createTableFromModel({ parentUid: "pageHome", order: -1, rows: [["A"]] }), "TABLE_ORDER");
});

test("a written table whose shape does not match the plan is removed and rewritten cell by cell", async (t) => {
  let wrongUid = null;
  const mock = await boot(t, { fromMarkdown: (_args, { nextUid, attach }) => {
    const uid = nextUid();
    wrongUid = uid;
    const table = { uid, string: "{{[[table]]}}", order: 0, children: [{ uid: nextUid(), string: "only", order: 0, children: [] }] };
    attach("pageHome", table, "last");
    return { uids: [uid] };
  } });
  const info = await createTableFromModel({ parentUid: "pageHome", rows: [["A", "B"], ["C", "D"]], returnInfo: true });
  assert.equal(info.path, "sequential");
  assert.equal(info.writes, 5);
  assert.notEqual(info.uid, wrongUid);
  assert.equal(mock.blocks.has(wrongUid), false);
  const tables = [...mock.blocks.values()].filter((block) => block.string === "{{[[table]]}}");
  assert.equal(tables.length, 1);
  assert.equal(runtime.metadata.has(info.uid), true);
});

test("v1 exposes createTableFromModel without a version bump", () => {
  const api = createPublicApi();
  assert.equal(api.version, "0.18.2");
  assert.deepEqual(api.capabilities, ["createTableFromModel"]);
  assert.equal(typeof api.createTableFromModel, "function");
});

test("rg_create_table_from_rows returns ok, uid, and path", async (t) => {
  const mock = await boot(t);
  const registration = createExtensionToolsRegistration();
  const tool = registration.tools.find((item) => item.name === "rg_create_table_from_rows");
  assert.ok(tool);
  assert.notEqual(tool.readOnly, true);
  assert.deepEqual(tool.parameters.required, ["rows"]);
  for (const key of ["parent_uid", "after_uid", "order", "rows", "merges", "header_rows", "alignments", "column_alignments", "widths", "enhance"]) {
    assert.ok(tool.parameters.properties[key], key);
  }

  const missing = await tool.execute({});
  assert.equal(missing.ok, false);
  assert.match(missing.error, /parent_uid or after_uid/);
  assert.equal(mock.calls.fromMarkdown, 0);

  const created = await tool.execute({
    parent_uid: "pageHome",
    rows: [["H", ""], ["a", "b"]],
    merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }],
    header_rows: 1,
    column_alignments: ["center"],
  });
  assert.equal(created.ok, true);
  assert.equal(created.path, "markdown");
  assert.equal(created.writes, 1);
  assert.equal(typeof created.uid, "string");
  const model = modelOf(created.uid);
  assert.equal(model.merges[0].colSpan, 2);
  assert.equal(model.frozenRows, 1);
  assert.equal(model.getAlignment(1, 0), "center");
  assert.equal(model.getRaw(0, 1), "");

  const fallback = await tool.execute({ parent_uid: "pageHome", rows: [["\t"]] });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.path, "sequential");

  const rejected = await tool.execute({ parent_uid: "pageHome", rows: [[1]] });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /must be a string/);
});
