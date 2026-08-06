# Roam Grid

Turn a native Roam table into a real spreadsheet — formulas, merges, sorting,
resizing, charts, comments — without moving a single cell out of your graph.

Version 0.9.0. Your table's rows and columns stay ordinary nested Roam blocks,
so links, `((block references))`, search, exports, and the plain Roam renderer
keep working exactly as before. Turn Roam Grid off and the table is still there.

## Install

**Roam Depot → Roam Grid → Install.** No account, no key, no configuration.

## Quick start

1. Put the cursor in any native `{{[[table]]}}` block.
2. Run **Roam Grid: Enhance this table** from the command palette.

That's it — the table becomes a grid. Arrow keys navigate, typing edits, `Enter`
commits, `F2` opens the larger editor, `=` starts a formula. `Cmd/Ctrl-Z` undoes.

To go back, run **Roam Grid: Restore native table**. Nothing about your content
changes; only the layout notes Roam Grid kept for that table are dropped.

Other commands, all under **Roam Grid:** in the palette — Save current grid as
template · New from saved template · New large grid · Copy/convert table ·
Import · Export · Insert chart · Merge · Unmerge · Undo · Redo · Restore
discarded edits.

## What it writes to your graph

This is the short version of everything Roam Grid can put in your graph. There
is nothing else.

| What | Where | When |
| --- | --- | --- |
| Cell contents | The original Roam blocks, unchanged in structure | Whenever you edit a cell |
| Table layout (column widths, row heights, merges, alignment, header visibility, chart specs) | Blocks on the `[[roam/grid/metadata]]` page, one per table | The page is created **on the first table you enhance**, never on install |
| Saved templates | Blocks on the `[[roam/grid/templates]]` page | Only when you run **Save current grid as template** |
| Comment threads | A collapsed `[[roam/comments]]` block on the **commented cell's own page**, exactly the structure Roam's own comments use | Only when you add a comment to a cell |
| Large-grid data | JSON files in Roam's file storage, pointed at by a manifest block under the `{{[[roam/grid]]}}` block | Only for large grids you explicitly create |
| Live range views | The `{{roam-grid-range: ((uid)) A1:D5}}` text you type into a block | Only when you paste a range reference |

Cell contents never leave the blocks they already live in. Layout is kept
separately so that turning Roam Grid off leaves a normal Roam table.

Locally, on your device only: two `localStorage` keys per graph —
`roam-grid:enhanced-uids:<graph>` (which tables you enhanced, so they render
without a flash) and `roam-grid:settings:<graph>` (the device-only settings
below) — and, if you use large grids, an IndexedDB database named
`roam-grid-chunks` caching downloaded chunks. None of it is data: deleting any
of it costs speed, not content. **Settings → Roam Grid → Clear local caches**
clears the enhanced-table list and the cached theme palette; **Forget this
device's overrides** clears the device settings; the chunk cache is bounded by
its own size setting and evicts itself.

## Privacy and network

- **No network requests.** No `fetch`, no `XMLHttpRequest`, no WebSocket, no
  external `import`. Every read and write goes through `roamAlphaAPI`, including
  large-grid files.
- **No telemetry, no analytics, no error reporting.** Nothing is measured and
  nothing is sent.
- **No external dependencies.** One dependency-free source file, no bundler, no
  runtime downloads.
- **No `eval`, no `new Function`.** Formulas are parsed and evaluated by Roam
  Grid's own expression engine, which can call only the built-in functions and
  any functions an extension explicitly registers. Arbitrary JavaScript and
  `=elisp:` are not supported and never will be.
- Every database query binds its parameters; no block uid is ever concatenated
  into a query string.

## Using it

### Editing

Arrow keys navigate; typing, `Enter`, or a double-click opens the fast in-cell
editor; `F2` opens the shared floating editor with the caret at the end of the
value. `Enter` and `Tab` commit — where the selection lands afterwards is a
setting. `Escape` closes an open suggestion list first, then cancels the edit.

`Cmd/Ctrl-Z` and `Cmd/Ctrl-Shift-Z` undo and redo inside the grid, including
structural changes such as inserting or deleting rows. Roam Grid takes the
keyboard only while a grid genuinely has focus and hands it straight back to
Roam when you click into an ordinary block.

Type `[[` or `((` in any cell editor to search pages or blocks; the picker
inserts real `[[page]]` and `((uid))` syntax, so the reference behaves like any
other Roam reference. Copy, cut, and paste understand rectangular ranges and
TSV/CSV text. Pasted images upload through Roam and become ordinary `![](url)`
markup.

### Formulas

`=SUM(A1:A10)` and friends. Function autocomplete appears after `=`, signature
help shows the active argument including inside nested calls, and `F4` cycles
`A1 → $A$1 → A$1 → $A1`. Click or arrow to a cell while editing to insert its
reference; `Shift` extends it to a range. Inserting or deleting rows and columns
rewrites every affected formula in the same transaction — ranges grow and
shrink, and `#REF!` appears only when the target really was deleted.

### Layout

Drag headers to reorder, gridlines to resize, the selection's corner to fill.
Merge a rectangle into one cell; covered cells must be empty and stay empty, and
a merge is one navigation stop. Set exact pixel sizes, compact rows, or reset to
automatic sizing from the `⋯` menu. Hide the A/B/C and 1/2/3 headers for a table
that still looks native. Tables fit their block width by default and can be
switched to fixed widths with horizontal scrolling.

### Comments

Hover a cell to reveal a 💬; click it (or press `Cmd/Ctrl-Alt-=`) to start a
comment thread on that cell. If you would rather the button stayed out of the
way, **Comments — Show the comment button** switches it to `Cmd/Ctrl + hover`,
which is Roam's own gesture for a block. Threads are **real
Roam comment threads** — the same `[[roam/comments]]` structure Roam writes
itself, on the cell's own page — so they appear in Roam's own comment UI and
survive uninstalling this extension. Commented cells get their own badge, kept
separate from the linked-reference count so neither number is inflated.

### Live range references

Paste `{{roam-grid-range: ((tableUid)) B2:D5}}` into any block to embed a
read-only, live view of part of another grid. It follows the source as the
source changes and can never write back to it. Because the `((uid))` is a real
reference, every live view shows up in the source table's linked references.

### Charts and formats

Deterministic SVG charts: bar, column, line, multiline, scatter, histogram,
boxplot, density, count, and sparklines. Import and export CSV, TSV, Markdown,
Org, reStructuredText, and Roam Grid JSON.

### Large grids

Run **Roam Grid: New large grid** for datasets too big to keep as blocks. Rows
and columns are virtualized and stored as immutable JSON chunk files in Roam's
file storage. Each chunk carries a SHA-256 digest that is verified before the
data is trusted, chunks are cached on your device, and two people editing
different parts of the same large grid are merged rather than refused.

## Where grids appear

An enhanced table renders in the main pane, in linked references, inside block
references and inline reference views, in the right sidebar, and inside block
embeds. Every visible copy shares one model and one undo history while keeping
its own selection and scroll position. Grids inside hover previews and other
popovers render too, but are strictly read-only — a surface that disappears on
mouse-out is not a safe place to edit.

## Settings

**Settings → Roam Depot → Roam Grid.** Thirty-eight controls in eight groups —
Writes, Editing, Appearance, Sizing, New grids, Large grids, Comments, Ranges —
plus four maintenance actions: apply display defaults to open grids, forget this
device's overrides, clear local caches, and reset every setting.

Most settings sync with your graph. Presentation choices that are properly
per-device — toolbar density, theme, maximum grid width, large-grid overscan,
chunk cache size, and whether comment threads open in the right sidebar — are
stored on the device instead.

Two settings deserve a note. **Capture grid undo history** (on) is what makes
`Cmd/Ctrl-Z` reverse grid edits. **Permanently delete superseded large-grid
files** is **off** by default and is irreversible when on; it deletes only chunk
and manifest files that no revision still references, only on grids nothing has
saved for an hour, and only once a file has been superseded for seven days.

## Public API

`window.roamGrid.v1` lets other extensions register formula functions,
renderers, editors, importers, exporters, data sources, and templates, and
exposes `listTemplates`, `saveTemplate`, `createFromTemplate`, `getTableModel`,
and transactional `applyPatch`. Every registration returns a disposer.

```js
const dispose = window.roamGrid.v1.registerTemplate("MY_MEAL", () => ({
  rows: [["Ingredient", "Cost"], ["Pasta", "2.50"]],
  showHeaders: false,
}));
await window.roamGrid.v1.createFromTemplate("MY_MEAL");
dispose();
```

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

Registered formula functions receive evaluated values only. Session
registrations last for the current extension session; `saveTemplate` writes a
reusable copy to `[[roam/grid/templates]]`. Third-party functions default to
`volatile: true` so dependency invalidation stays safe.

The native column and row menus expose the compatibility hooks used by Live AI,
whose injected table commands write through `window.roamGrid.v1`.

## Known limitations

- Large-grid cells are JSON rows, not Roam blocks, so they have no block uid:
  comments, block references, and reference counts are native-table features
  only. Use **Copy/convert table** to get a native copy.
- Grids in hover previews are read-only by design.
- Formula coverage is broad but not exhaustive; unknown functions evaluate to an
  error value rather than failing the grid.
- A cell whose content Roam renders richly (page links, block references,
  images, embeds) is painted by Roam's own renderer, so it inherits Roam's
  rendering behaviour for that content.

## License

MIT. Roam Grid is an independent MIT implementation. The GPL-licensed
[`yibie/grid-table`](https://github.com/yibie/grid-table) project is used only as
a behavioral reference; no source code is copied.

Developers: see [Architecture](docs/ARCHITECTURE.md),
[Development](docs/DEVELOPMENT.md), [Testing](docs/TESTING.md), and the
[Live AI compatibility adapter](docs/LIVE_AI.md).
