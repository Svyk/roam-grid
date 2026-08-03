# Roam Grid

Native-first advanced tables for Roam Research.

## Status

Version 0.5.1 is a functional public-source beta and live demo. Native
opt-in tables, safe merges, core formulas, interactions, imports/exports,
charts, chunked large-grid persistence, the public API, and clean fallback are
implemented. Before a public Depot release, the project still needs the full
Thymer formula-function vocabulary, broader browser interaction automation, and
a measured 100,000 × 26 live 50+ FPS acceptance run. See
[Testing](docs/TESTING.md) for the exact evidence already collected.

Roam Grid enhances only the native `{{[[table]]}}` blocks you explicitly opt in.
The original nested Roam blocks remain the source of truth, so links, references,
search, exports, and native fallback continue to work. A separate
`{{[[roam/grid]]}}` component provides virtualized, file-backed storage for very
large datasets.

## Install from the auto-updating URL

The public repository deploys a Roam-ready build to GitHub Pages after every
push to `main` or the current release branch. The extension root is:

`https://svyk.github.io/roam-grid`

In Roam, open **Settings → Roam Depot → Developer Extensions**, choose
**Load extension → URL**, and paste that root URL. URL extensions auto-start on
later Roam launches, so a pushed build does not require choosing the local
folder again. Developer extensions remain local to each Roam client.

For an immediate update after a push, wait for the GitHub Pages deployment and
press the circular reload button beside this URL. Hover the grid-size badge to
confirm the running version (for example, `Roam Grid v0.5.1`). Roam can reuse a
cached remote bundle during the same app session; if the badge still shows the
older version, remove only this developer-extension URL and add the same URL
again. The reinstall remounts the renderer and does not alter any table blocks,
saved templates, or `[[roam/grid/metadata]]`.

The four public files at that URL are `README.md`, `extension.js`,
`extension.css`, and `CHANGELOG.md`. `npm run build` assembles those exact files
in `deploy/`, and GitHub Actions publishes that directory without any deploy
keys or long-lived secrets.

The release workflow is: run the tests and `npm run build`, push the release
branch, wait for the GitHub Pages workflow to complete, then reload the same URL
entry in Depot developer mode. No reinstall or graph migration is required for
v0.5, and a reload preserves native cell blocks, table metadata, and large-grid
manifests.

## Install for local development

1. Run `npm run build` in this folder.
2. In Roam, open **Settings → Roam Depot → Developer Extensions**.
3. Load this folder once as a local extension.
4. After later builds, press `Ctrl-D`, then `Ctrl-R`, or reload developer
   extensions from the Roam Depot settings panel.

For continuous builds, run `npm run dev` and use the same reload shortcut after
an edit. Roam intentionally cannot auto-start a local-folder extension after a
full page/app reload because the browser requires a fresh user gesture for file
access. Press `Ctrl-D`, then `Ctrl-R`, or use the URL install above. This is an
installation-mode limitation—not lost table data or metadata.

The extension deliberately does not use `roam/js`.

## Start

- Focus an existing native table and run **Roam Grid: Enhance this table**.
- Focus any enhanced table and run **Roam Grid: Save current grid as template**.
  Reinsert it later with **Roam Grid: New from saved template**. Saved templates
  keep formulas, merges, sizing, alignment, headers, charts, and visual options
  on `[[roam/grid/templates]]`; the public extension does not ship personal
  recipe or meal-prep data.
- Run **Roam Grid: New large grid** to insert a file-backed grid.
- Enhanced-table metadata is stored on `[[roam/grid/metadata]]`; cell contents
  stay in their original Roam blocks.
- Use the `⋯` menu → **Hide row/column labels** for a clean native-table look.
  The choice is stored per table and can be reversed at any time.

## Interaction

- Arrow keys navigate. Typing, Enter, and double-click keep the fast in-cell
  editor; F2 opens the shared floating editor and focuses its textarea at the
  end of the current value. The same floating editor is used by enhanced native
  tables and large grids. Enter or Tab commits, while Escape closes the active
  suggestion list first and then cancels the edit.
- Type `[[` followed by text to search Roam pages, or `((` to search blocks,
  from either the in-cell or F2 editor. Arrow keys choose a result; Enter, Tab,
  or a click inserts complete native `[[page]]` or `((block UID))` syntax
  without moving focus. Committed references use Roam's normal rich rendering,
  so they remain clickable and participate in the graph like ordinary table
  block content.
- Drag across cells to select a rectangle. Drag headers to reorder, any vertical
  gridline or a selected cell's right edge to resize its column, and the
  selected cell's bottom edge or any horizontal boundary to resize its row.
  These grips remain available when A/B/C and row labels are hidden. On a
  merged cell they control the merge's outermost row or column. Double-click a
  resize edge to restore automatic sizing.
- In fit-to-window mode, a dragged column now follows the pointer in pixels while
  adjacent columns contract proportionally. The final proportions are persisted,
  so the resized column stays the same after a developer-extension reload. If
  every neighboring column is already at its minimum, dragging wider switches
  that table to fixed-width horizontal scrolling so the requested size still wins.
- Row heights and column widths are stored per table. Row sizes follow their
  stable Roam row UID through sorting and reordering; both dimensions survive
  extension reloads, native/large-grid copies, and large-grid manifest saves.
- The `⋯` menu can set exact pixel sizes, compact selected rows to 24 px, or
  reset selected rows/columns to automatic sizing—even when labels are hidden.
- Selecting a cell also reveals Roam-style column and row grabbers. Their menus
  retain the familiar header, sorting, insertion, clearing, and deletion
  actions, then add a separate **Roam Grid** section for merges, sizing,
  alignment, references, charts, and conversion. The menu exposes the native
  compatibility hooks used by Live AI, whose injected table commands continue
  to write through `window.roamGrid.v1`.
- Selecting a rectangular range replaces the single-cell grabbers with one
  outlined selection and a compact `rows × columns` badge. Click the badge for
  range actions; drag the bottom-right square to fill.
- Tables fit the available Roam pane by default, preserving saved column-width
  ratios so every stage stays visible in a smaller window. The `⋯` menu can
  switch back to fixed widths and horizontal scrolling when preferred.
- The same menu applies persistent left, center, or right alignment and copies
  either the active cell's or the whole table's native `((block reference))`.
- Formula cells use a subtle blue Blueprint-aware treatment by default. Toggle
  **Hide formula coloring** in the table menu; the choice persists per grid.
- Editing a formula opens a compact `fx` expression bar above the cell. Cell and
  range references are colored in the expression and outlined with the same
  colors in the grid. Click a cell while editing to insert its A1 reference;
  Shift-click after a reference to extend it into a range without moving focus
  away from the formula.
- Formula assistance suggests functions after `=` or while a function name is
  being typed. Arrow keys choose a suggestion; Enter, Tab, or a click inserts
  it. Signature help shows the active function and argument, including inside
  nested calls. Press F4 with the caret on a reference to cycle
  `A1 → $A$1 → A$1 → $A1 → A1`; both ends of a selected range lock together.
- Inserting or deleting a row/column rewrites formulas transactionally. Relative
  and `$`-absolute references follow structural moves, ranges expand or shrink,
  and `#REF!` appears only when the referenced cell or complete range was
  deleted. Inserting an item row directly above an adjacent total also expands
  that total's range, which keeps saved calculators practical to modify. A
  native row deletion stages only the removed row roots and updates only formula
  blocks whose text changed; surviving row chains are left in place, and a
  failed save attempts to restore the staged rows and formula text before
  reporting the error. If that restoration is interrupted too, Roam Grid keeps
  the staging block rather than deleting the recoverable row data.
- Copy/cut/paste understands matrices and TSV/CSV text. Pasting image files
  uploads them through Roam and stores ordinary `![](url)` markup in the cell.
- Merged regions are one navigation stop. Partial-merge moves and destructive
  merges are rejected with the blocking coordinates. Enhanced rendering hides
  internal cell seams so a merge reads as one surface, while its outer-right
  and outer-bottom edges remain available for column and row resizing.

## Formats and charts

CSV, TSV, Markdown, Org, reStructuredText, Roam Grid JSON, and the documented
grid-table v1/v2 interchange shapes are supported. Deterministic SVG charts
include bar, column, line, multiline, scatter, histogram, boxplot, density,
count, and sparklines.

## Public API

`window.roamGrid.v1` exposes disposable registration methods for safe formula
functions, renderers/editors, importers/exporters, data sources, and reusable
templates, plus `listTemplates`, `saveTemplate`, `createFromTemplate`,
`getTableModel`, and transactional `applyPatch`. Registered templates live only
for the current extension session; `saveTemplate` writes a reusable graph-owned
copy to `[[roam/grid/templates]]`. Cell editors return an input or
textarea-like element whose `value` is committed through the normal transaction
path. Registered formula functions
receive evaluated values only; arbitrary JavaScript or `=elisp:` execution is
never allowed.

```js
const dispose = window.roamGrid.v1.registerTemplate("MY_MEAL", () => ({
  rows: [["Ingredient", "Cost"], ["Pasta", "2.50"]],
  showHeaders: false,
}));
await window.roamGrid.v1.createFromTemplate("MY_MEAL");
dispose();
```

Formula functions can optionally provide metadata for autocomplete and
signature help. Existing two-argument registrations remain compatible. Built-in
functions are known to be non-volatile; third-party functions default to
`volatile: true` so dependency invalidation stays safe. Calling the returned
disposer removes both the implementation and its assistant metadata.

```js
const disposeFormula = window.roamGrid.v1.registerFormulaFunction(
  "MY_FN",
  (value, fallback) => value ?? fallback,
  {
    parameters: ["value", "[fallback]"],
    description: "Return a fallback for an empty value",
    volatile: false,
  },
);

disposeFormula();
```

Plain values are painted synchronously into stable cell-content elements, so a
commit is visible without an empty frame. Roam's richer renderer is reserved for
page links, block references, images, embeds, and other detected rich content.
Formula and reverse-dependency caches repaint only changed results and their
transitive dependents. Rich-rendered hosts remain connected during structural
grid swaps and are explicitly unmounted before a native or virtualized surface
is discarded.

Ordinary edits travel through a coalesced content-only persistence lane: only
dirty cell blocks are validated and updated, matching pull-watch events from the
extension's own writes are consumed, and layout metadata is not rewritten.
Non-conflicting external cell edits are merged; a same-cell or structural
conflict uses the full repull/rollback path. Structural operations continue to
use the serialized full reconciliation path.

## Showcase

The development smoke page `[[roam-grid/dev]]` contains a merged-cell brownie
workflow based on [King Arthur Baking's Fudge Brownies](https://www.kingarthurbaking.com/recipes/fudge-brownies-recipe).
It demonstrates hidden labels, full-width preparation bands, multi-row action
stages, source links, and safe empty covered cells without modifying any of the
graph's existing native tables.

## Safety

- Merging never overwrites covered content.
- Covered coordinates are semantically empty in formulas and flat exports.
- Structural writes are serialized and refresh from Roam after a failed write.
- Arbitrary JavaScript formulas are not supported.

Roam Grid is an independent MIT implementation. The GPL-licensed
[`yibie/grid-table`](https://github.com/yibie/grid-table) project is used only as
a behavioral reference; no source code is copied.

See [Architecture](docs/ARCHITECTURE.md), [Testing](docs/TESTING.md), and the
[Live AI compatibility adapter](docs/LIVE_AI.md) for the persistence contracts,
verification matrix, and integration details.
