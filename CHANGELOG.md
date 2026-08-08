# Changelog

## 0.16.0

Large-grid selection + native-editor reliability.

- **First click on a large grid no longer paints a multi-cell range.** The
  pointerdown focus call scrolled the grid into view under a stationary cursor,
  and the per-cell drag-extend read the resulting `pointerenter` as a drag.
  Focus now uses `preventScroll`, drag-extend ignores enters until the pointer
  has actually moved (~4px), repaints in place instead of tearing down the
  canvas mid-press, and the render/update selection paints now agree on merged
  cells.
- **Native `[[` / `((` sticks instead of falling back.** The post-click textarea
  poll budget (50ms) sat inside the measured 30–60ms hydration latency, and two
  misses retired the native lane for the whole session. Polls are now time-based
  (250/350ms), the breaker is a 30s cooldown (3 strikes) instead of permanent,
  and rAF waits can no longer wedge in background tabs.
- **Scratch-block rotation.** Every large-cell edit gets a fresh scratch child
  uid, so the previous edit's commit/blank write echoes can no longer unmount
  the next edit's editor; a live edit is committed before the next cell's
  acquire so rapid cell→cell edits can't grab the pre-rotation uid.
- **Editing large grids no longer loses edits around saves.** Saves defer while
  an editor is open (the manifest pointer write force-remounted the view
  mid-typing), a warm remount with dirty chunks reschedules its save, the
  settle wait only trusts quiet frames after hydration has started, a
  virtualization detach during the chunk fetch re-resolves the cell, the grace
  refocus can recover twice, and a stale-blank textarea now cancels instead of
  committing — including on dispose.
- Suite: 721 tests.

## 0.15.0

Large-grid native editor.

- **Large grids now use Roam's real block editor.** Typing `[[` / `((` (and `#`,
  `{{`, `/`) in a `{{roam/grid}}` large-grid cell opens Roam's own native menus
  — the same "Search for a Page" popover native grids get, with full page/block
  search, autocomplete, and component insertion. A scratch host block on the
  metadata page provides a uid for `renderBlock` for the duration of the edit.
  Formula cells, the F2 floating editor, and registered custom editors keep using
  the grid editor (the v0.14 custom popover remains the fallback).
- **Mouse isolation for large-grid native edits.** While the native editor
  overlay is active over a large cell, mouse and pointer events from inside the
  overlay do not reach the large grid's selection/drag handlers, so typing and
  clicking inside the menu cannot trigger grid selection changes.
- **Setting description updated.** `Edit cells with Roam's own block editor` no
  longer says large grids are excluded.

## 0.14.0

Large-grid polish.

- **`[[` / `((` autocomplete now works reliably in large grids.** The in-cell
  editor opened by typing in a `{{roam/grid}}` large grid raced the grid's own
  virtualization: it read the cell's bytes asynchronously before mounting the
  editor, and a re-render in that window could detach the cell so the reference
  popover never positioned. The editor now reads the (always-resident) visible
  cell synchronously and holds a lock that blocks the re-render until the editor
  is mounted. (Large-grid cells are chunk-file rows with no Roam block id, so
  they get the same custom `[[`/`((`/`#`/`{{`/`/` popover a native grid shows
  with Roam's own editor off — not the renderBlock native menu, which needs a
  block id.)
- **No more flash when you navigate back to a large grid.** Large grids now get
  a pre-paint guard (like native tables already had) that hides the raw
  `{{roam/grid}}` marker for grids you've enhanced, and the parsed store is kept
  warm for a short idle window so a quick away-and-back reuses it instead of
  re-downloading the manifest and rebuilding from scratch.
- Suite: 682 tests.

## 0.13.0

Images in cells.

- **Cells render images properly.** `![](url)` markdown renders contained in
  the cell — Roam's persisted resize width on its own wrapper no longer defeats
  the cap — with the height ceiling at **Images — Maximum image height in
  cells (px)** (default 180). A broken or dead image collapses to a chip naming
  it, fixed-height rows clip with a `+n hidden` chip, and **Images — Render
  images in cells** switches the whole decoration off for the exact pre-0.13
  rendering. Encrypted (`.enc`) uploads work everywhere, decrypted by Roam's
  own renderer.
- **Lightbox.** Click an image in the selected cell, press `Shift+Space`, or
  click a clip chip to open a gallery of the column's images: arrow-key paging,
  fit ↔ actual size, open in tab, copy markdown, download (hidden for encrypted
  uploads), and an undoable delete that splices just that image out of the
  cell. Live range references open the same lightbox.
- **Per-table layout.** The `⋯` menu sets image size (Small / Medium / Large /
  Extra large / Fill width) and fit (Contain / Fill & crop / Original size) per
  column or per selected cells, persisted in the table's metadata and fully
  undoable. Row-height presets (32/56/96/160) land on both grid types, and
  **Auto-fit selected rows** measures the rendered content once and pins the
  height that fits.
- **Image input parity.** Pasting an image into a LARGE grid now appends after
  the cell's existing content instead of overwriting it (the 0.12 bug), and
  image files can be dragged straight from the OS onto a cell in either grid
  type — the target cell highlights, the upload runs through Roam's storage,
  and the markdown appends. Non-image files still belong to Roam.
- Suite: 667 tests.

## 0.12.0

Native editing, live templates, the range fix, and comment compose modes.

- **Cells edit in Roam's own block editor.** A non-formula cell on an enhanced
  native grid now mounts Roam's real editor over the cell, so `[[`, `((`, `#`,
  `{{` and `/` open Roam's OWN menus — the same ones native `{{[[table]]}}`
  cells get. Enter/Tab/Escape keep their grid meanings when no menu is open;
  when a menu is open they drive the menu. Formula cells, the F2 floating
  editor, large grids and registered custom editors keep the grid editor.
  Setting: `Editing — Edit cells with Roam's own block editor` (default on);
  two consecutive mount failures fall back to the grid editor for the session.
- **Templates are real, editable tables.** `[[roam/grid/templates]]` now holds
  a `roam-grid/template:: <name>` block with an actual `{{[[table]]}}` child
  per template — open the page and edit the template like any other grid.
  Legacy JSON records migrate automatically shortly after load (each original
  is backed up to `[[roam/grid/metadata]]` first); a maintenance button retries
  any that were skipped for exceeding the write budget.
- **Live range references render again.** The claim pipeline is crash-isolated
  per element (one bad block can no longer leave later embeds invisible),
  transient empty reads are retried instead of cached as dead, the block
  locator matches Roam's current DOM, and a raw-text fallback mounts ranges
  even when Roam renders no component button. Degrades are traced at
  `window.__rgDiag.rangeTrace`.
- **Comment compose modes.** New `Comments — Composing and opening threads`
  select (per device): "In place" (default) opens the inline Comments panel
  with the cursor in an empty composer — nothing is written until Enter;
  "Comment box" keeps the pre-0.12 dialog; "Right sidebar" opens the thread
  the way Roam's own comment button does and starts the comment there, and
  abandoning it unwinds exactly the blocks the gesture created. The old
  sidebar switch migrates into the new select (settings schema v2, graph and
  device layers).
- Suite: 561 tests.

## 0.11.0

Recents hardening. No new surface; this release makes the bare-opener recents
path fast on the first use and resilient on large graphs.

- **Idle-time cache warm.** The recents caches (pages + blocks) are warmed on
  idle after load, so the first bare `[[` / `((` opens from cache instead of
  paying the query inline. Re-warms fire just before TTL expiry only while a
  grid is mounted and the tab is visible. Background warms never count toward
  the budget disarm. Diagnostics at `window.__rgDiag.recentsWarm`.
- **Self-healing budget gate.** One slow fetch no longer kills bare openers for
  the session: disarm now requires two consecutive over-budget inline fetches,
  any fetch back under budget re-arms, and a fresh cache opens the menu whether
  the gate is armed or not. State at `window.__rgDiag.recentsBudget`.
- **Regression coverage.** DOM-level bare-opener tests across both tiers
  (native tables and large grids), plus big-graph pipeline benchmarks
  (20k pages / 30k blocks, operation-counting) and a static guard pinning the
  budget semantics. Suite: 497 tests.
- README gained a "Big-graph check" section with the live timing procedure.

## 0.10.0

Cell autocomplete. The reported bug was that typing `[[` in a cell and stopping
produced nothing at all, where Roam's own menu opens immediately; fixing it
pulled in the rest of the reference surface a cell was missing. The storage
model did not change, and the single new graph write in this release is off by
default.

### The reported bug

- **`[[` and `((` open on the bare opener now.** `[[`, `#` and `#[[` offer the
  pages you edited most recently; `((` offers the blocks you edited in the last
  seven days. Two empty-query guards used to return before anything was looked
  up, so a bare opener was silent — you had to already know the name of the
  thing you were reaching for. Native and large grids build the same editor, so
  both get this.
- The recent-blocks list **excludes the cells of the table you are editing**.
  Every cell edit touches a block, so unfiltered it was eight rows of the table
  you were sitting in. Large-grid cells are not blocks and contribute nothing to
  it, which is correct.
- Both result sets are cached per graph for 60 seconds, so the second and every
  later opener in a session resolves without a query and without a debounce. If
  either query takes longer than 250 ms, the result is still used — it is
  already paid for — and the bare-opener path switches itself off for the rest
  of the session with a `console.info`, never a toast. Typing a query still
  searches.

### New in the menu

- **Create page.** A page opener with a typed name that no result matches
  exactly gets a last row offering to create it, including when the search
  returned nothing — the case that used to be a dead end. Accepting it inserts
  `[[Name]]` and **calls no page-creation API**: Roam materialises the page when
  the committed cell string is parsed. Eager creation would have orphaned a page
  every time a draft was cancelled, and this editor, unlike Roam's own, has real
  drafts and a real cancel.
- **`#` and `#[[` tag completion,** inserting `#Name` or `#[[Name With Spaces]]`
  by Roam's own rule.
- **`{{` component completion** from a fixed catalog of 16 — TODO, DONE, query,
  embed, mentions, calc, POMO, slider, video, table, kanban, attr-table,
  word-count, diagram, mermaid, roam/render — with the caret landing inside the
  braces. It is a static list, so it costs no graph read and opens with no
  delay. Rows that need child bullets or that do not render inside a cell say so
  on the row instead of being quietly dropped.
- **`/` commands — a partial subset, off by default.** 21 rows against the 47 in
  Roam's own slash registry. Every name and static template is read out of that
  registry rather than guessed. Three classes are left out on purpose and are
  listed under known limitations in the README; the short version is that Roam's
  modal commands cannot be summoned from outside its editor, some commands only
  render under a real block, and the `Query (…)` commands would commit
  placeholder pages into the graph. The three day rows appear only when
  `roamAlphaAPI.util.dateToPageTitle` is present to format the title, because a
  hand-rolled daily-page title is a reference to a page that does not exist.
- **Block suggestions render through Roam** instead of showing the raw markdown
  behind them, so a hit reads as Roam would draw it rather than as
  `[[Foo]] **bar** ((abc123))`. Rendering is bounded: only block rows, only rows
  that actually contain markup, at most six per result set, issued through a
  microtask chain that a newer result set aborts, with every host unmounted on
  every teardown path. Two batches over 32 ms and the session falls back to
  plain text. Rows are never empty in the meantime — a pure text normalizer
  fills each one on the first frame and is the permanent fallback when
  `renderString` is absent.
- **Reference counts and page breadcrumbs,** from one batched query per result
  set, never one per row.
- **Paste a nine-character uid after `((`** and that exact block is offered
  first. Previously the uid was searched for as block *text*, which finds
  nothing.

### Keyboard

- A caret that leaves the query **closes the menu**. Arrow keys in a
  `<textarea>` fire neither `select` nor `input`, so pressing ← after `[[Pro`
  used to leave a menu open against a caret that had walked out of it.
- **Hovering a row moves the highlight,** so `Enter` accepts the row that looks
  selected. Hover used to be CSS only, and Enter accepted a different row.
- `[`, `(`, `{` and `"` **wrap a selection** rather than replacing it, outside
  formulas. This is also how an aliased reference gets built by hand.
- Arrow-key navigation no longer rebuilds the suggestion rows; it repaints the
  active one.

### Large grids

- **Reference mirroring — opt-in, off by default** (**Mirror large-grid
  references into Roam**). A large-grid cell is a row in a chunk file, so a
  `[[page]]` typed into one is a link Roam has never indexed. With this on, the
  distinct references a grid contains are written into collapsed blocks under
  the grid's own `{{[[roam/grid]]}}` anchor, and Roam's indexer creates the real
  `:block/refs` datoms — so the page lists the grid in its linked references.
  It is off by default because each shard write lands on Roam's transactor,
  which is the cost the chunk format exists to avoid.
  - Block count is bounded by *distinct references*, not cells: 100,000 cells
    all naming `[[Foo]]` produce one. **Maximum mirrored references** (2000)
    caps it, and the cut is taken in sort order so two devices agree; the marker
    block says when it truncated.
  - Shards are rewritten only when their content changed, so the ordinary save
    costs zero writes. Row insert and delete change nothing at all — the mirror
    is a set union, and moving a reference between rows leaves the union
    identical.
  - Deleting the grid's anchor subtree removes the marker and Roam retracts the
    datoms; there is no separate cleanup pass. A shard write that fails after a
    successful commit leaves the mirror stale, never wrong, and it is reconciled
    the next time the grid opens.
  - Manifests written before this release load unchanged; references appear as
    chunks are next saved.

### Fixed

- **A Roam block-input id was parsed into something that was not a uid.** The id
  carries a window path before the uid — `block-input-sidebar-block-<window>-<uid>`
  and `block-input-<user>-body-outline-<page>-<uid>` are both real — and the
  parse anchored on the prefix and took the whole tail. The DOM-provided uid now
  wins, and the id is parsed for its trailing nine-character uid. Consequences
  this removes: **Roam Grid: Enhance this table** could refuse with "Focus a
  cell in a native table first" while a table cell was genuinely focused, and an
  insert-near-focus could be aimed at a uid that does not exist.
- `=SUM((A1` no longer opens the block picker and `=A1/B2` no longer opens the
  command menu — the trigger scanner is formula-aware now, and `/` additionally
  requires the start of the cell or a preceding space. Inside a formula, a page
  opener is honoured only in a quoted position.

### Settings

Six new controls, taking the panel to 46 in eight groups.

| Setting | Group | Default |
| --- | --- | --- |
| Open the reference menu on a bare `[[` or `((` | Editing | on |
| Render `((block))` suggestions the way Roam does | Editing | on |
| Complete `{{components}}` in cells | Editing | on |
| Offer `/` commands in cells (partial) | Editing | **off** |
| Mirror large-grid references into Roam | Large grids | **off** |
| Maximum mirrored references | Large grids | 2000 |

The existing master switch, **Suggest functions and pages while typing**, gates
all of them: with it off, no recents query is issued and no catalog is offered.

### Notes for review

- **New graph reads, all through `roamAlphaAPI`.** Two datalog queries for the
  recents lists (most-recently-edited pages; blocks edited in the last seven
  days, bound with `:in $ ?since`); two batched enrichment queries for reference
  counts and page breadcrumbs, both bound with `:in $ [?key ...]` and capped at
  the results limit (25 maximum); and one `pull` by uid when a `((` query is
  uid-shaped. Nothing is interpolated into a query string by any of them.
- **Exactly one new graph write, and it is off by default:** the large-grid
  reference shards described above. Everything else in this release inserts text
  into the cell you are editing and nothing more. In particular the create-page
  row writes no page.
- **Suggestion rendering uses Roam's own `roamAlphaAPI.ui.components.renderString`**
  and unmounts every host it mounts, through the same official unmount path the
  rich cell renderer already used. Cell content is passed to Roam's renderer, not
  to `innerHTML`.
- **Still no network, no telemetry, no dependencies, no `eval`.** No `fetch`,
  no `XMLHttpRequest`, no external import was added.
- The menu is styled through our own `.rg-autocomplete*` classes under the
  existing `.rg-portal` scope. It deliberately does **not** reuse Roam's
  `.rm-autocomplete__*` class names, which would inherit every installed theme's
  overrides of them.

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

A real settings panel at **Settings → Roam Depot → Roam Grid**: 40 controls in
eight groups (Writes, Editing, Appearance, Sizing, New grids, Large grids,
Comments, Ranges) plus four maintenance actions — apply display defaults to open
grids, forget this device's overrides, clear local caches, and reset everything.
Presentation choices that are properly per-device (toolbar, theme, maximum
width, overscan, notifications, chunk cache size) are stored per device; the rest
sync with your graph.

**Show row and column headers** is a live global. Turning it off hides the A/B/C
and 1/2/3 labels on every grid at once — including large grids — and turning it
back on returns each grid to its own **Labels** choice. Nothing per-grid is
written either way, so it is instantly reversible. **Tint formula cells** works
the same way.

What the switch deliberately will not do is override a table you opted out of by
hand: with the switch on, a grid whose own **Labels** setting is off stays off.
**Apply display defaults to open grids** is the bulk path for that — it is an
explicit act, so it writes, rewriting headers and fit-to-width on every grid
currently on screen to match the Appearance defaults.

**Fit grids to the block width** stays a per-table decision (it depends on how
many columns a particular table has, and a native grid's own resize handles turn
it off), so it remains a creation default that the same button retro-applies.

Also new: **Suggest functions and pages while typing** turns autocomplete off
entirely rather than only tuning its delay and result count; **Grow the grid to
fit a paste** can be turned off so an over-large paste is clipped to the grid's
current size rather than inserting rows and columns; and **Notifications** cuts
the corner messages down to warnings-and-errors or errors-only. A message that
offers an action, such as Restore, is never suppressed.

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
