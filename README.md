# Roam Grid

Native-first advanced tables for Roam Research.

## Status

Version 0.2 is a functional public-source beta and live demo. Native
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
later Roam launches and are downloaded again whenever Roam opens or developer
extensions are reloaded, so a pushed build does not require choosing the local
folder again. Developer extensions remain local to each Roam client.

The four public files at that URL are `README.md`, `extension.js`,
`extension.css`, and `CHANGELOG.md`. `npm run build` assembles those exact files
in `deploy/`, and GitHub Actions publishes that directory without any deploy
keys or long-lived secrets.

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
- Run **Roam Grid: New large grid** to insert a file-backed grid.
- Enhanced-table metadata is stored on `[[roam/grid/metadata]]`; cell contents
  stay in their original Roam blocks.
- Use the `⋯` menu → **Hide row/column labels** for a clean native-table look.
  The choice is stored per table and can be reversed at any time.

## Interaction

- Arrow keys navigate; typing, Enter, or F2 edits; Tab advances; Escape cancels.
- Drag across cells to select a rectangle. Drag headers to reorder, the header
  edge to resize columns, any row boundary to resize that individual row, a
  selected range to move it, or the fill handle to repeat it. Double-click a
  resize edge to restore automatic sizing.
- Row heights and column widths are stored per table. Row sizes follow their
  stable Roam row UID through sorting and reordering; both dimensions survive
  extension reloads, native/large-grid copies, and large-grid manifest saves.
- The `⋯` menu can set exact pixel sizes, compact selected rows to 24 px, or
  reset selected rows/columns to automatic sizing—even when labels are hidden.
- Tables fit the available Roam pane by default, preserving saved column-width
  ratios so every stage stays visible in a smaller window. The `⋯` menu can
  switch back to fixed widths and horizontal scrolling when preferred.
- The same menu applies persistent left, center, or right alignment and copies
  either the active cell's or the whole table's native `((block reference))`.
- Copy/cut/paste understands matrices and TSV/CSV text. Pasting image files
  uploads them through Roam and stores ordinary `![](url)` markup in the cell.
- Merged regions are one navigation stop. Partial-merge moves and destructive
  merges are rejected with the blocking coordinates.

## Formats and charts

CSV, TSV, Markdown, Org, reStructuredText, Roam Grid JSON, and the documented
grid-table v1/v2 interchange shapes are supported. Deterministic SVG charts
include bar, column, line, multiline, scatter, histogram, boxplot, density,
count, and sparklines.

## Public API

`window.roamGrid.v1` exposes disposable registration methods for safe formula
functions, renderers/editors, importers/exporters, and data sources, plus
`getTableModel` and transactional `applyPatch`. Cell editors return an input or
textarea-like element whose `value` is committed through the normal transaction
path. Registered formula functions
receive evaluated values only; arbitrary JavaScript or `=elisp:` execution is
never allowed.

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
