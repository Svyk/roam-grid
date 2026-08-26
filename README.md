# Roam Grid

Version 0.18.0

Turn a native Roam `{{table}}` into a spreadsheet — formulas, merges, sorting, resizing, charts, comments — without moving a cell out of your graph.

Rows and columns stay ordinary nested Roam blocks, so links, `((block references))`, search, exports, and the plain Roam renderer keep working exactly as before. Turn Roam Grid off and the table is still there.

## Install

**Roam Depot → Roam Grid → Install.** No account, no key, no configuration.

## Quick start

1. Put the cursor in any native `{{[[table]]}}` block.
2. Run **Roam Grid: Enhance this table** from the command palette.

The table becomes a grid. Arrow keys navigate, typing edits, `Enter` commits, `F2` opens the larger editor, `=` starts a formula, `Cmd/Ctrl-Z` undoes.

To go back, run **Roam Grid: Restore native table**. Your content does not change; only the layout notes Roam Grid kept for that table are dropped.

## What you can do

- Edit with Roam's own block editor or the grid's fast editor. `[[`, `((`, `#`, and `{{` complete the way Roam's own menus do.
- Formulas: `=SUM(A1:A10)` and a broad function library, with autocomplete, signature help, and `F4` reference cycling.
- Sort, resize, reorder, merge, fill, hide the axis headers, fit the grid to its block width.
- Paste or drag images into cells, capped to the cell, with a lightbox and per-column sizing.
- Comment on cells with real Roam comment threads.
- Embed a live, read-only view of part of another grid with `{{roam-grid-range: ((uid)) B2:D5}}`.
- Deterministic SVG charts: bar, column, line, scatter, histogram, boxplot, density, sparklines.
- Import and export CSV, TSV, Markdown, Org, reStructuredText, and Roam Grid JSON.

## Commands

All in the command palette:

- **Roam Grid: Enhance this table**
- **Roam Grid: Restore native table**
- **Roam Grid: Save current grid as template**
- **Roam Grid: New from saved template**
- **Roam Grid: New large grid** — available when **Experimental — Large grids** is on
- **Roam Grid: Copy/convert table**
- **Roam Grid: Import**
- **Roam Grid: Export**
- **Roam Grid: Restore discarded edits**
- **Roam Grid: Undo**
- **Roam Grid: Redo**
- **Roam Grid: Insert chart**
- **Roam Grid: Merge**
- **Roam Grid: Unmerge**

## What it writes to your graph

Everything Roam Grid can put in your graph, in one table. There is nothing else.

| What | Where | When |
| --- | --- | --- |
| Cell contents | The original Roam blocks, unchanged in structure | Whenever you edit a cell |
| Table layout (column widths, row heights, merges, alignment, header visibility, chart specs) | Blocks on the `[[roam/grid/metadata]]` page, one per table | The page is created **on the first table you enhance**, never on install |
| Saved templates | A name block per template on the `[[roam/grid/templates]]` page, with the template itself as a real `{{[[table]]}}` table under it | Only when you run **Roam Grid: Save current grid as template** |
| Legacy template backups | `roam-grid/template-backup::` blocks on the `[[roam/grid/metadata]]` page | Only if a one-time migration rewrites a pre-0.12 JSON template into an editable table |
| Comment threads | A collapsed `[[roam/comments]]` block on the **commented cell's own page**, exactly the structure Roam's own comments use | Only when you add a comment to a cell |
| Large-grid data (experimental, off by default) | JSON files in Roam's file storage, pointed at by a manifest block under the `{{[[roam/grid]]}}` block | Only for large grids you explicitly create |
| Large-grid reference mirror (experimental, off by default) | Collapsed blocks under that same `{{[[roam/grid]]}}` block, listing the distinct `[[page]]`, `#tag` and `((block))` references that grid's cells contain | Only while **Large grids — Mirror large-grid references into Roam** is on |
| Live range views | The `{{roam-grid-range: ((uid)) A1:D5}}` text you type into a block | Only when you paste a range reference |

Cell contents never leave the blocks they already live in. Layout is kept separately so that turning Roam Grid off leaves a normal Roam table.

Saved templates are ordinary enhanced tables on `[[roam/grid/templates]]`: open the page and edit one like any other grid. Templates saved by older versions as JSON blocks are converted in place once, automatically — the original JSON is backed up first — and **Maintenance — Migrate legacy grid templates** retries anything that was skipped.

Locally, on your device only: two `localStorage` keys per graph — `roam-grid:enhanced-uids:<graph>` (which tables you enhanced, so they render without a flash) and `roam-grid:settings:<graph>` (device-only settings). Only if you turn the experimental large-grid switch on, an IndexedDB database named `roam-grid-chunks` also caches downloaded chunks. None of it is data: deleting any of it costs speed, not content. **Maintenance — Clear local caches** and **Maintenance — Forget this device's overrides** reset the first two.

## Privacy and network

- **No network requests.** No `fetch`, no `XMLHttpRequest`, no WebSocket, no external `import`. Every read and write goes through `roamAlphaAPI`, including large-grid files.
- **No telemetry, no analytics, no error reporting.** Nothing is measured and nothing is sent.
- **No `eval`, no `new Function`.** Formulas run on the extension's own expression engine; arbitrary JavaScript is not supported and never will be.
- **No runtime dependencies.**

## Settings

**Settings → Roam Depot → Roam Grid.** The panel shows these rows:

- **Editing — Edit cells with Roam's own block editor**
- **Editing — Suggest functions and pages while typing**
- **Editing — Enter moves**
- **Editing — Tab moves**
- **Editing — Grow the grid to fit a paste**
- **Appearance — Tint formula cells**
- **Appearance — Show row and column headers**
- **Appearance — Fit grids to the block width**
- **Appearance — Toolbar**
- **Appearance — Theme**
- **Comments — Enable cell comments**
- **Comments — Show the comment button**
- **Comments — Composing and opening threads**
- **Ranges — Render live range references**
- **Images — Render images in cells**
- **Images — Maximum image height in cells (px)**
- **Experimental — Large grids** — off by default

Plus five maintenance actions:

- **Maintenance — Apply display defaults to open grids**
- **Maintenance — Forget this device's overrides**
- **Maintenance — Clear local caches**
- **Maintenance — Migrate legacy grid templates**
- **Maintenance — Reset all Roam Grid settings**

## Experimental: large grids

Large grids are for datasets too big to keep as blocks. They are **off until you turn Experimental — Large grids on**. Turning the switch off unmounts the views and leaves the files in the graph.

With the switch on, three more rows appear in the panel:

- **Large grids — Cache large-grid chunks on this device**
- **Large grids — Permanently delete superseded large-grid files (irreversible)**
- **Large grids — Mirror large-grid references into Roam**

## Extension Tools API

Roam Grid registers tools on `window.RoamExtensionTools["roam-grid"]` so Chief of Staff (and other extensions) can list, create, and edit grids by uid when you enable Roam Grid under Extension Tools.

| Tool | Description |
|------|-------------|
| `rg_list_grids` | List every enhanced grid (native and large) with uid, mode, rows, cols |
| `rg_get_grid` | Return the JSON model of an enhanced grid by uid |
| `rg_enhance_table` | Enhance a native `{{table}}` block by uid without focusing it |
| `rg_restore_native` | Restore an enhanced native grid to a plain Roam table by uid |
| `rg_create_table` | Create a new native grid. Requires `parent_uid` or `after_uid` |
| `rg_set_cell` | Set a cell value (row/col 0-indexed). Formulas begin with `=` but not `==` |
| `rg_add_formula` | Set a formula cell. A leading `=` is added if missing; `==` is refused |
| `rg_apply_patch` | Apply one or more v1 grid patches (object or array) by uid |
| `rg_list_templates` | List saved grid template names |
| `rg_create_from_template` | Insert a grid from a saved template. Requires `parent_uid` |

## License

MIT. See [LICENSE](LICENSE).

Developers: [docs/](docs/) covers architecture, development, testing, and the Live AI adapter. `window.roamGrid.v1` is the extension API; the Extension Tools registry is `window.RoamExtensionTools["roam-grid"]`.
