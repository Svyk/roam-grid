# Changelog

## 0.9.0

The first release intended for Roam Depot. Nothing about the storage model
changed: your cells are still ordinary Roam blocks, and uninstalling still
leaves a working native table.

### New capabilities that touch your graph

- **Comments on cells.** Hover a cell for a 💬, or press `Cmd/Ctrl-Alt-=`. A
  grid cell is a much denser target than a block, so plain hover is the default;
  **Comments — Show the comment button** switches it back to `Cmd/Ctrl + hover`,
  Roam's own gesture. A comment is a **real Roam comment thread** — the same
  `[[roam/comments]]` structure Roam writes itself, placed on the commented
  cell's own page — so it shows up in Roam's own comment UI and outlives this
  extension. Nothing is written until you actually add a comment. Commented
  cells get their own badge; the linked-reference count now subtracts comment
  anchors, so neither number is inflated any more (they were, in 0.8.2).
- **Live range references.** Paste `{{roam-grid-range: ((tableUid)) A1:D5}}` into
  a block and it renders a read-only mini-grid that follows the source. The
  `((uid))` is a real reference, so every live view appears in the source
  table's linked references. A range view can never write to its source.
- **Large-grid storage v2.** Rows now carry stable ids, every chunk file carries
  a SHA-256 digest that is checked before the data is trusted, uploads run in
  parallel, and two people editing different parts of the same large grid are
  merged instead of one being refused. New: an optional, **off by default**,
  clearly irreversible cleanup that deletes chunk and manifest files no revision
  still references — only on grids untouched for an hour, and only once a file
  has been superseded for seven days.

### Fixes that prevented data loss

- **Undo now survives the write path.** Grid `Cmd/Ctrl-Z` used to be invalidated
  by Roam echoing back the extension's own writes, by Roam minting a different
  block uid than the one requested, and by a session being disposed on idle. All
  three are handled: echoes are absorbed, entries are remapped, and a table's
  history is recovered when you return to it. Structural operations undo as one
  step. Keyboard ownership is now explicit — `Cmd/Ctrl-Z` falls through to Roam
  the moment a grid is not genuinely in control, instead of being guessed at.
- **Read-only surfaces are now genuinely read-only.** A grid rendered inside a
  hover preview shares the real table's data. Editing one — clicking a cell in
  the popover and pressing Delete, using the fill handle, or using a context
  menu — could permanently overwrite the source blocks. Preview grids can no
  longer take the keyboard or reach the write path at all.
- **Grids inside hover previews render again.** Blueprint mounts popovers
  outside the area the extension was watching, so an enhanced table in a hover
  preview was hidden but never claimed — it appeared as blank space. Previews,
  block embeds, and the right sidebar are all claimed now.
- **The right table wins.** When enhanced tables were nested, the extension
  could resolve to the wrong one depending on internal map ordering; it now
  always picks the nearest enclosing table.
- **Edits discarded by a conflict reload can be recovered.** When someone else
  changes a table and the grid reloads it, your unsaved edits used to vanish
  silently. You are now offered a Restore action, and **Roam Grid: Restore
  discarded edits** stays in the command palette either way. Restore refuses to
  resurrect a block the other change deleted.
- **A keystroke landing mid-save is no longer lost.** In large grids, an edit
  made while a save was in flight was wiped when that save finished.

### Settings

A real settings panel at **Settings → Roam Depot → Roam Grid**: 37 controls in
eight groups (Writes, Editing, Appearance, Sizing, New grids, Large grids,
Comments, Ranges) plus four maintenance actions — apply display defaults to open
grids, forget this device's overrides, clear local caches, and reset everything.
Presentation choices that are properly per-device (toolbar, theme, maximum
width, overscan, chunk cache size) are stored per device; the rest sync with
your graph.

Every control does something. **Maximum cells in a rendered range** (2000) now
bounds what a range reference paints — a bigger range renders whole rows up to
that many cells and says so in its caption, instead of trying to draw the whole
rectangle at once. **Render live range references** (on) is the escape hatch: off
leaves the component as its raw text. A third range setting that promised
editable ranges was removed rather than shipped — a range view has no write path
at all, so the toggle would have been a lie.

### Notes for review

- **No graph writes on install.** `[[roam/grid/metadata]]` is created on the
  first table you enhance, not during load. This changed in this release.
- **Local storage on your device only:** two `localStorage` keys per graph
  (`roam-grid:enhanced-uids:<graph>`, `roam-grid:settings:<graph>`) and, for
  large grids, an IndexedDB database named `roam-grid-chunks` that caches
  downloaded chunks under a size limit you set. The maintenance actions clear
  the first two; nothing in the graph changes either way.
- **Still no network, no telemetry, no dependencies, no `eval`.** There is no
  `fetch`, `XMLHttpRequest`, `WebSocket`, or external `import` anywhere in the
  source; all file transfer goes through `roamAlphaAPI`. Every database query
  binds its parameters — no block uid is concatenated into a query string.
- **Full teardown.** `onunload` removes every command, listener, observer, pull
  watch, timer, dialog, style guard, and the public API, and restores the native
  Roam renderer.
- Formula evaluation still cannot run arbitrary JavaScript. Registered functions
  receive evaluated values only; `=elisp:` is not supported.
- Removed a dead persistence path that could write without an owning session.

## 0.8.2

- Replaced the hidden-native-count bridge with a view-local inline references
  section. Clicking an enhanced cell's superscript count now opens beneath the
  exact grid instance that was clicked, including referenced and inline grids;
  clicking it again closes the section.
- Kept referenced blocks native by mounting them with Roam's block component,
  while adding a compact page breadcrumb, reference count, close control, and
  extension-scoped light/dark styling around the native content.
- Removed the right-sidebar fallback, so a missing hidden native control can no
  longer turn a reference-count click into an unrelated Block Outline window.
- Added coverage for source-query normalization, local toggle behavior, native
  block rendering, and the guarantee that the right sidebar is not invoked.

## 0.8.1

- Made enhanced-cell reference counts delegate to the closest hidden native
  Roam count control. Clicking a count now toggles Roam's inline references
  beneath the table instead of opening a right-sidebar Block Outline.
- Matched Roam's subdued superscript presentation, native tooltip, hover/focus
  treatment, and forgiving hit target without interfering with cell selection.
- Added regression coverage for sibling UID/count DOM layouts, selecting the
  correct cell among multiple native counts, and excluding Roam Grid's own badge.

## 0.8.0

- Added **Copy selected cells as block references** to range and axis menus.
  The clipboard receives a rectangular TSV matrix of the selected cells'
  native `((uid))` references, ready to paste into another Roam table as a live
  referenced range rather than a text copy.
- Preserved merged-cell semantics while copying references: the merge anchor is
  emitted once and covered coordinates remain blank.
- Added native-style superscript linked-reference counts to enhanced cells,
  including ordinary rich-link cells such as a recipe source. Counts are loaded
  in one batched Datalog query per shared table session after the grid paints.
- Refresh reference counts after content saves and rendered block-reference DOM
  changes without replacing stable cell content, repainting the grid, or adding
  work to the keystroke commit path.
- Added model and DOM coverage for live range-reference matrices, pending UIDs,
  batched count queries, zero-count cleanup, badge clicks, and stable content.

## 0.7.0

- Added Excel-style keyboard point mode for formulas. After `=` or an operator,
  arrow keys select and insert a cell reference, subsequent arrows move that
  reference, and typing another operator starts the next reference from the
  previously selected cell.
- Added Shift+Arrow range construction while point mode is active. F4 preserves
  its existing lock cycle and applies the chosen absolute/relative axes as the
  keyboard-selected cell or range moves.
- Promoted an inline formula draft to the shared floating `fx` editor only when
  keyboard point mode begins. This keeps focus authoritative and allows the
  virtualized large grid to scroll and repaint referenced cells without losing
  the result-cell draft.
- Reused merge-anchor normalization, colored reference outlines, autocomplete,
  signature help, Enter/Tab commit, and Escape cancellation across enhanced
  native and large-grid modes. Ordinary caret arrows remain untouched when the
  formula is not waiting for a reference.
- Added DOM regression coverage for operator-separated keyboard formulas,
  point-mode focus promotion, Shift+Arrow ranges, F4-locked range movement,
  ordinary caret behavior, and both grid navigation adapters.

## 0.6.0

- Added a graph-scoped pre-paint guard for enhanced table UIDs and replaced the
  delayed whole-document scan with synchronous added-node claims. Canonical and
  referenced tables no longer expose a native renderer frame during navigation,
  while restore, unload, stale metadata, and mount failures still reveal the
  ordinary Roam table.
- Replaced the one-view native mount with one shared session per canonical table
  UID and any number of source or referenced views. Models, pull watches,
  persistence queues, formula dependencies, structural operations, and undo
  history are shared; selection, scrolling, sizing controls, and editor
  presentation remain local to each visible instance.
- Made enhanced tables fully editable inside block references and inline
  reference views, including source-absent references. A compact responsive
  toolbar keeps Undo, Redo, Source, and overflow controls available in narrow
  reference contexts.
- Added an extension-scoped theme bridge that samples Roam and Blueprint host
  colors before hiding the native renderer, supports live light/dark switching,
  and styles every Roam Grid portal without graph-global CSS overrides.
- Removed first-mount viewport scroll reads and reused the cached grid palette
  for the persistent floating editor, eliminating Roam Grid's remaining
  route-mount computed-style read.
- Added regression coverage for UID guards, stale-cache release, canonical and
  reference resolution, shared sessions, cross-view editing, compact toolbars,
  runtime theming, first-mount layout reads, and cached portal theming.

## 0.5.2

- Added a Roam Grid-owned portal palette so the F2 editor, formula and Roam
  reference suggestions, context menus, and dialogs inherit the active grid's
  resolved light/dark colors even though those surfaces mount under `body`.
- Matched Blueprint's contextual editing model: ordinary inline text shows no
  assistant, formulas show `fx` assistance after `=`, and native page/block
  completion appears only for non-empty `[[query` or `((query` searches.
- Added explicit combobox/listbox state and theme-change synchronization for the
  persistent editor without adding a per-keystroke computed-style read.

## 0.5.1

- Suppressed late structural pull-watch echoes only when the full Roam
  UID/order/content tree exactly matches the already-committed local model.
  Row deletion therefore keeps its keyed DOM update and undo history instead
  of being followed by a redundant full repaint. Divergent external edits
  still take the conflict-and-repull path.

## 0.5.0

- Made plain-value commits visible synchronously in stable cell-content nodes,
  with targeted formula-dependent repainting and rich Roam rendering only when
  the changed value requires it.
- Added a coalesced content-only persistence lane that updates dirty cell blocks
  without rewriting layout metadata, suppresses matching self-watch events, and
  falls back to full reconciliation for conflicts and structural changes.
- Added one shared F2 floating editor for enhanced native and large grids, with
  focused caret placement, persistent formula-reference highlighting, IME-safe
  commit/cancel behavior, and click-to-insert references.
- Added formula-function autocomplete, nested signature and active-argument
  hints, and F4 reference locking through
  `A1 → $A$1 → A$1 → $A1 → A1`, including range endpoints.
- Extended `registerFormulaFunction(name, fn, options)` with disposable
  `parameters`, `description`, and `volatile` metadata while preserving existing
  two-argument registrations.
- Removed internal grid lines from merged regions while retaining resize access
  on their outer-right and outer-bottom edges and keeping selection controls
  above the merged surface.
- Added native Roam reference assistance while editing any cell: `[[` searches
  pages, `((` searches blocks, keyboard or pointer selection inserts the
  completed native syntax without stealing focus, and the committed result is
  rendered through Roam's rich renderer.
- Made native row deletion proportional to the actual change. Roam Grid stages
  only the removed row roots, updates only formulas whose text changed, and
  leaves surviving row chains in place; rollback restores staged rows, formulas,
  and metadata when the API permits and retains recoverable staging data when a
  restore itself cannot complete.
- Kept rich-rendered cell hosts connected across structural swaps and explicitly
  unmounted them before native-grid, virtual-canvas, or extension teardown, so
  links and references do not disappear during refreshes.
- Made native selection movement delta-based: only the previous and next cell
  anchors change classes, while owned resize handles, grabbers, range overlays,
  and fill handles are updated without a root query or unrelated-cell scan.
- Documented the v0.5 build, GitHub Pages deployment, and Depot developer-mode
  reload workflow; the release requires no persisted table-schema migration.

## 0.4.0

- Added an Excel-like formula editing layer: the raw expression floats above the
  edited cell, each reference token receives a stable color, and every referenced
  cell or range is outlined in the matching color.
- While a formula is open, clicking another cell inserts its A1 reference at the
  caret; Shift-click after a reference extends it into a range.
- Row and column insertion now shifts both relative and `$`-absolute references,
  expands ranges inserted through their interior, and includes an adjacent new
  item row when a total formula sits immediately below the range.
- Row and column deletion now shifts surviving references, trims partially
  overlapping ranges, and emits `#REF!` only when the referenced cell or entire
  range was actually deleted. All formula and structural changes remain inside
  the same undoable model transaction.

## 0.3.4

- Added save/insert template actions directly to the grid `⋯` menu so the
  workflow does not depend on Roam's command-palette focus behavior.
- Exposed the running extension version through the grid status accessibility
  label and tooltip for reliable hosted-reload verification.

## 0.3.3

- Added cell-edge resize detection as a fallback beneath the transparent overlay,
  so Electron hit-testing cannot turn a column-width drag into cell selection.

## 0.3.2

- Made resize gestures capture their pointer and temporarily disable the active
  cell's HTML range drag, preventing column/range gesture competition.
- Enlarged the invisible column-edge target while retaining the smaller visible
  Roam-style grabbers.

## 0.3.1

- Allowed a column to expand when every neighboring fit-to-window column is
  already at minimum width. The table switches to persistent fixed-width
  scrolling instead of silently rejecting the drag.

## 0.3.0

- Fixed fit-to-window column dragging so the selected edge tracks the pointer in
  pixels, adjacent tracks contract proportionally, and the resulting geometry
  survives reload.
- Stopped content-only edits and API patches from rewriting layout metadata;
  unchanged rich Roam cells are no longer rerendered after every edit.
- Added graph-owned reusable templates with **Save current grid as template** and
  **New from saved template**. Templates live on `[[roam/grid/templates]]` and
  preserve formulas, merges, sizing, alignment, and visual configuration.
- Removed the personal meal-prep calculator from the public bundle; an existing
  calculator can be saved privately as a reusable graph template instead.
- Added Blueprint-aware formula-cell coloring, enabled by default and persisted
  per table, with menu and large-grid toolbar toggles.
- Preserved the smaller native-style grabbers and compact multi-range action
  badge while separating their pointer targets from row/column resize grips.

## 0.2.3

- Made native-style row and column grabbers visually smaller while retaining a
  forgiving invisible pointer target.
- Raised active-cell controls above global resize tracks so the left row menu
  no longer competes with row resizing.
- Replaced single-cell grabbers on rectangular selections with a compact range
  outline and `rows × columns` action badge.

## 0.2.2

- Added a built-in Meat + Pasta Meal Prep Calculator with editable example
  inputs and formulas for batch cost, calories, protein, carbs, and fat plus
  per-meal totals.
- Added disposable template registration, discovery, and creation through
  `window.roamGrid.v1`, making reusable grid templates an extension point.
- Preserved UID-backed header-row styling when a generated model becomes a
  native Roam table.

## 0.2.1

- Made every visible vertical gridline a direct column-resize target, including
  clean tables with row/column labels hidden.
- Added right-edge and bottom-edge resize grips to the selected cell. For a
  merged cell, the grips resize its outermost column and row.
- Made responsive column dragging track the rendered width directly and then
  persist the resulting proportions without a first-drag jump.
- Added Roam-native top/left cell grabbers with familiar header, sort, insert,
  clear, and delete actions, followed by a separated Roam Grid action section.
- Made the grabber menus compatible with native table-menu augmentations, so
  the existing Live AI row/column commands can inject and keep using the
  transactional Roam Grid adapter.

## 0.2.0

- Added drag, exact-pixel, compact, and automatic per-row sizing with stable
  UID-backed persistence for native tables.
- Made column resizing transactional and explicitly verified width persistence.
- Added persistent row/column sizing to large-grid manifests and their
  virtualized layout calculations.
- Added a GitHub Pages workflow and deploy bundle for Roam's URL Developer
  Extension install mode, which auto-starts and refreshes after pushes.
- Added persistent left/center/right cell alignment, native block-reference copy
  actions, and responsive fit-to-window columns with a fixed-width toggle.
- Documented Roam's required reload gesture for local-folder extensions.

## 0.1.0

Private release candidate; remaining public-release gates are documented in
`docs/TESTING.md`.

- Native-backed enhanced tables with safe formulas, merges, movement, rich
  Roam rendering, images, imports/exports, charts, and explicit native restore.
- Optional row/column labels and Blueprint/Roam-aware light/dark styling.
- Virtualized file-backed large grids with immutable chunks and verified
  revisioned manifests.
- `window.roamGrid.v1` integration API, disposable custom cell editors, and a
  Live AI transactional-write/native-fallback adapter.
