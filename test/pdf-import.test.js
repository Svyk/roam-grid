import test from "node:test";
import assert from "node:assert/strict";
import {
  describePdfTable,
  pdfBlocksOnPage,
  pdfImportNotice,
  pdfLabelOfUrl,
  pdfUrlOfBlockString,
  planTableFromModel,
  runPdfImport,
} from "../src/extension.js";

const SPEC = {
  rows: [["Group", "", "n"], ["A", "x", "1"], ["B", "y", "2"]],
  merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }],
  headerRows: 1,
  columnAlignments: [null, null, "right"],
  widths: { 0: 96, 1: 120, 2: 48 },
  enhance: true,
};
const table = (page, caption = "Table 1") => ({ id: `t${page}`, page, caption, rows: 3, cols: 3, merged: 1, spec: SPEC });
const PLEXUS = (tablesFromPdf) => ({ capabilities: ["tablesFromPdf"], tablesFromPdf });
const PDF = { uid: "pdfblock1", url: "https://f/o/imgs%2Fapp%2Fg%2Freport.pdf?alt=media", label: "report.pdf" };

function harness({ plexus, pdfs = [PDF], picks = [] } = {}) {
  const log = { notes: [], choices: [], created: [] };
  return {
    log,
    run: () => runPdfImport({
      plexus,
      pdfs,
      choose: async (title, choices) => { log.choices.push({ title, choices }); return picks.length ? picks.shift() : null; },
      notify: (message, intent) => log.notes.push({ message, intent }),
      create: async (spec) => { log.created.push(spec); return { uid: "newtable1", writes: 1, path: "markdown" }; },
    }),
  };
}

test("pdf block strings: macro forms, label from an encoded firebase url", () => {
  assert.equal(pdfUrlOfBlockString("{{[[pdf]]: https://x/y.pdf}}"), "https://x/y.pdf");
  assert.equal(pdfUrlOfBlockString("{{pdf: https://x/y.pdf }}"), "https://x/y.pdf");
  assert.equal(pdfUrlOfBlockString("{{[[PDF]]: https://x/y.pdf}} note"), "https://x/y.pdf");
  assert.equal(pdfUrlOfBlockString("{{[[table]]}}"), null);
  assert.equal(pdfUrlOfBlockString(null), null);
  assert.equal(pdfLabelOfUrl(PDF.url), "report.pdf");
  assert.equal(pdfLabelOfUrl(""), "PDF");
});

test("pdfBlocksOnPage lists page pdf blocks, the focused one first, without duplicates", () => {
  const rows = [["b1", "intro"], ["b2", "{{[[pdf]]: https://x/a.pdf}}"], ["b3", "{{[[pdf]]: https://x/b.pdf}}"]];
  const api = {
    q: (_query, page) => (page === "pg" ? rows : []),
    data: { pull: (_p, [, uid]) => ({ ":block/string": uid === "b3" ? "{{[[pdf]]: https://x/b.pdf}}" : "" }) },
  };
  const out = pdfBlocksOnPage("pg", { focusedUid: "b3", api });
  assert.deepEqual(out.map((p) => p.uid), ["b3", "b2"]);
  assert.equal(out[1].label, "a.pdf");
  assert.deepEqual(pdfBlocksOnPage("other", { api }), []);
});

test("describePdfTable shows page, caption, size and merged count", () => {
  assert.equal(describePdfTable(table(3)), "p. 3 · Table 1 · 3×3 · 1 merged");
  assert.equal(describePdfTable({ page: 2, caption: "", rows: 4, cols: 2, merged: 0 }), "p. 2 · Table · 4×2");
});

test("without Plexus the flow explains and writes nothing", async () => {
  for (const plexus of [undefined, {}, { capabilities: [], tablesFromPdf() {} }, { capabilities: ["tablesFromPdf"] }]) {
    const h = harness({ plexus });
    assert.equal(await h.run(), null);
    assert.match(h.log.notes[0].message, /needs Plexus Diagram/);
    assert.equal(h.log.created.length, 0);
  }
});

test("no pdf block on the page says so", async () => {
  const h = harness({ plexus: PLEXUS(async () => ({ tables: [table(1)] })), pdfs: [] });
  assert.equal(await h.run(), null);
  assert.match(h.log.notes[0].message, /no \{\{\[\[pdf\]\]\}\} block/);
});

test("one pdf and one table: no pickers, grid created after the pdf block with the full spec", async () => {
  const asked = [];
  const h = harness({ plexus: PLEXUS(async (o) => { asked.push(o); return { tables: [table(2)], needsOcr: [], ocr: { state: "none" } }; }) });
  const out = await h.run();
  assert.deepEqual(asked, [{ url: PDF.url, scan: "auto" }]);
  assert.equal(h.log.choices.length, 0);
  assert.equal(h.log.created.length, 1);
  assert.equal(h.log.created[0].afterUid, "pdfblock1");
  assert.deepEqual(h.log.created[0].merges, SPEC.merges);
  assert.equal(h.log.created[0].headerRows, 1);
  assert.deepEqual(h.log.created[0].widths, SPEC.widths);
  assert.equal(h.log.created[0].returnInfo, true);
  assert.deepEqual(out, { uid: "newtable1", page: 2, rows: 3, cols: 3 });
  assert.equal(h.log.notes.at(-1).intent, "success");
});

test("several pdfs and several tables: both pickers, the picked ones are used", async () => {
  const other = { uid: "pdfblock2", url: "https://x/b.pdf", label: "b.pdf" };
  const asked = [];
  const h = harness({
    pdfs: [PDF, other],
    picks: [1, 2],
    plexus: PLEXUS(async (o) => { asked.push(o.url); return { tables: [table(1), table(2), table(5, "Table 9")], needsOcr: [] }; }),
  });
  await h.run();
  assert.deepEqual(asked, ["https://x/b.pdf"]);
  assert.equal(h.log.choices[0].choices.length, 2);
  assert.equal(h.log.choices[1].choices[2].label, "p. 5 · Table 9 · 3×3 · 1 merged");
  assert.equal(h.log.created[0].afterUid, "pdfblock2");
});

test("dismissing a picker writes nothing", async () => {
  const h = harness({ pdfs: [PDF, { ...PDF, uid: "p2" }], picks: [], plexus: PLEXUS(async () => ({ tables: [table(1)] })) });
  assert.equal(await h.run(), null);
  const h2 = harness({ picks: [], plexus: PLEXUS(async () => ({ tables: [table(1), table(2)] })) });
  assert.equal(await h2.run(), null);
  assert.equal(h.log.created.length + h2.log.created.length, 0);
});

test("scanned pdf, no reader: the message points to Plexus Engines and nothing is written", async () => {
  const h = harness({ plexus: PLEXUS(async () => ({ tables: [], scanned: true, scanPages: [1, 2], needsOcr: [1, 2], ocr: { source: null, state: "not-running" } })) });
  assert.equal(await h.run(), null);
  const note = h.log.notes.at(-1);
  assert.equal(note.intent, "warning");
  assert.match(note.message, /scanned pages 1, 2/);
  assert.match(note.message, /Plexus Engines/);
  assert.equal(h.log.created.length, 0);
});

test("a table found plus leftover scan pages imports and then warns", async () => {
  const h = harness({ plexus: PLEXUS(async () => ({ tables: [table(1)], needsOcr: [4], ocr: { source: null, state: "none" } })) });
  assert.ok(await h.run());
  assert.match(h.log.notes.at(-1).message, /Scanned page 4 has not been read/);
});

test("pdfImportNotice: none when clean, plain message when no tables", () => {
  assert.equal(pdfImportNotice({ tables: [table(1)], needsOcr: [] }), null);
  assert.equal(pdfImportNotice({ tables: [], needsOcr: [] }), "No tables found in this PDF.");
  assert.doesNotMatch(pdfImportNotice({ tables: [], needsOcr: [3], ocr: { source: "helper", state: "ready" } }), /Plexus Engines/);
});

test("Plexus errors and createTableFromModel errors are reported, not thrown", async () => {
  const h = harness({ plexus: PLEXUS(async () => { throw new Error("CORS"); }) });
  assert.equal(await h.run(), null);
  assert.match(h.log.notes.at(-1).message, /Could not read the PDF: CORS/);
  const notes = [];
  const out = await runPdfImport({
    plexus: PLEXUS(async () => ({ tables: [table(1)] })),
    pdfs: [PDF], choose: async () => 0, notify: (m, i) => notes.push({ m, i }),
    create: async () => { throw new Error("too large"); },
  });
  assert.equal(out, null);
  assert.match(notes.at(-1).m, /Import failed: too large/);
});

test("the spec Plexus returns is accepted by createTableFromModel's planner (merges, header rows, widths, alignment)", () => {
  const plan = planTableFromModel({ ...SPEC, afterUid: "pdfblock1" });
  assert.equal(plan.rowCount, 3);
  assert.equal(plan.colCount, 3);
  assert.deepEqual(plan.merges.map((m) => [m.row, m.col, m.rowSpan, m.colSpan]), [[0, 0, 1, 2]]);
  assert.equal(plan.headerRows, 1);
  assert.deepEqual(plan.widths, [96, 120, 48]);
  assert.equal(plan.alignments[1][2], "right");
  assert.equal(planTableFromModel({ ...SPEC, columnAlignments: null, widths: null }).widths.every((w) => w == null), true);
});
