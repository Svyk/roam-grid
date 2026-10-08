# Live AI table completion

Roam Grid and Live AI share the same UID-preserving native table model. The
compatibility adapter first asks `window.roamGrid.v1.getTableModel(tableUid)` for
an opted-in enhanced table and otherwise reads Roam's nested blocks exactly as it
did before.

AI cell results for an enhanced table are written with:

```js
await window.roamGrid.v1.applyPatch(tableUid, {
  op: "set",
  row,
  col,
  value,
});
```

This keeps formula invalidation, grid undo, metadata, conflict detection, and
serialized block writes inside one owner. When Roam Grid is absent or the table
is not enhanced, Live AI continues to call `roamAlphaAPI.updateBlock` with the
cell UID. The integration therefore adds no hard dependency in either direction.

The same writes are also available as Extension Tools on
`window.RoamExtensionTools["roam-grid"]`: `rg_list_grids`, `rg_get_grid`,
`rg_enhance_table`, `rg_restore_native`, `rg_create_table`, `rg_set_cell`,
`rg_add_formula`, `rg_apply_patch`, `rg_list_templates`,
`rg_create_from_template`. Chief of Staff uses that registry, not a second
write path. The adapter still asks `v1.getTableModel` / `applyPatch`, so
formula invalidation, undo, metadata, conflict detection, and serialized
block writes stay in one owner.

The local Live AI source adapter lives in
`~/roam-extension-live-ai-assistant/src/utils/roamTable.js` and its streamed
completion writer in `src/ai/tableCompletion.js`.

## Creating a table from rows

`window.roamGrid.v1.createTableFromModel(spec)` writes a native `{{[[table]]}}` and, by default, enhances it. Pass exactly one of `parentUid` or `afterUid`.

```js
const uid = await window.roamGrid.v1.createTableFromModel({
  parentUid,
  order: "last",
  rows: [["Name", "# of samples"], ["A", ""]],
  merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }],
  headerRows: 1,
  alignments: { "1,0": "right" },
  columnAlignments: ["left", "center"],
  widths: { 1: 160 },
  enhance: true,
});
```

`rows` is a string matrix. Ragged rows are padded with `""`. A merge's covered cells must be `""`, and a merge must cover more than one cell. `headerRows` (default 0) is how many leading rows are headers. Alignments are `left`, `center`, or `right`. Widths are pixels and are clamped to the column-width settings. `order` is `"last"` (default), `"first"`, or a 0-based index. The table is at most 500 rows by 50 columns.

The write is one `roamAlphaAPI.data.block.fromMarkdown` call, so it is one undo entry. Cell text that would not survive markdown (a heading marker, a fence, a list marker on a later line, a tab, or leading or trailing spaces) sends the whole table down the existing cell-by-cell path. Pass `returnInfo: true` for `{ uid, writes, path }` where `path` is `"markdown"` or `"sequential"`. The markdown path reports `writes: 1`. The sequential path reports one write per block, and only that path counts against the native write budget.

`v1.version` is the extension version. `v1.capabilities` includes `"createTableFromModel"`.

The Extension Tool `rg_create_table_from_rows` takes the same options in snake_case (`parent_uid` or `after_uid`, `rows`, `merges`, `header_rows`, `alignments`, `column_alignments`, `widths`, `enhance`). It returns `{ ok, uid, path, writes }`.

## Layout requests (agents outside the browser)

An agent that writes through the Roam API, such as an MCP server, cannot call `window.roamGrid`. It leaves a request block as a top-level child of `[[roam/grid/metadata]]`:

```
roam-grid/layout-request:: {"tableUid":"zNoXiJVfD","merges":[{"row":0,"col":0,"rowSpan":1,"colSpan":12}],"headerRows":[0,2],"frozenRows":3,"alignments":{"0,0":"center"},"widths":{"0":260}}
```

Roam Grid applies pending requests when it loads, and at once while Roam is open (a pull watch on the metadata page). **Roam Grid: Apply pending layout requests** runs them by hand. A plain table is enhanced first. A mounted grid takes the request as one undoable edit; an unmounted one is saved straight to its metadata, so the request never races the grid's own in-memory layout the way a hand-edited `roam-grid/table::` block does.

Every field except `tableUid` is optional. An absent field keeps the current layout; a present one replaces it.

- `merges`: `{ row, col, rowSpan, colSpan }`, 0-based. Covered cells must be empty.
- `headerRows`: a count of leading rows, or a list of row indexes. A count also sets `frozenRows`.
- `frozenRows`: rows frozen at the top.
- `alignments` (keyed `"row,col"`) and `columnAlignments`: `left`, `center`, or `right`. Either one replaces all cell alignments.
- `widths`: pixels keyed by column index.
- `fitToWidth`: `true` or `false`.

An applied request is deleted. A request that fails is rewritten as `roam-grid/layout-request-error:: <reason> · <original JSON>` and is not retried; fix it and change the prefix back to resend it.

The same layout is available in the browser as `roamGrid.v1.applyLayout(tableUid, spec)` and the Extension Tool `rg_apply_layout` (snake_case fields). `v1.capabilities` includes `"applyLayout"` and `"layoutRequests"`.
