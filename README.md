# Roam Grid

Turn a native Roam table into a real spreadsheet — formulas, merges, sorting,
resizing, charts, comments — without moving a single cell out of your graph.

Version 0.10.0. Your table's rows and columns stay ordinary nested Roam blocks,
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
| Large-grid reference mirror | Collapsed blocks under that same `{{[[roam/grid]]}}` block, listing the distinct `[[page]]`, `#tag` and `((block))` references that grid's cells contain | Only while **Mirror large-grid references into Roam** is on, which is **off** by default |
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
- Database queries bind their parameters (`:in $ ?since`, `:in $ [?uid ...]`) or
  go through `pull` with the uid as an argument. Three legacy fallbacks — used
  only when `roamAlphaAPI.data.pull` is unavailable — interpolate a uid into the
  query text, and strip `"` and `\` from it first so it cannot leave the string
  literal it sits in.

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

Copy, cut, and paste understand rectangular ranges and TSV/CSV text. Pasted
images upload through Roam and become ordinary `![](url)` markup.

### References and completion in a cell

Type `[[`, `((`, `#`, or `#[[` in any cell editor. The menu opens on the bare
opener, the way Roam's own does: `[[`, `#` and `#[[` offer the pages you edited
most recently, `((` the blocks you edited in the last seven days. The block list
leaves out the cells of the table you are sitting in — every cell edit touches a
block, so without that filter a grid's own rows would be most of the list. Keep
typing and it searches instead. Pages you insert are promoted to the top of the
next bare opener.

When no result matches what you typed exactly — including when there are no
results at all, which used to be a dead end — the last row offers to create that
page. Accepting it inserts `[[Name]]` and creates nothing else: Roam materialises the
page when the committed cell string is parsed, so abandoning the edit leaves no
orphan page behind. A tag inserts as `#Name`, or `#[[Name With Spaces]]` when
the name needs the brackets.

Block rows are shown the way Roam renders them rather than as the raw markdown
behind them. Page rows carry their reference count and block rows the page they
live on. Paste a nine-character uid after `((` and that exact block is offered
first, instead of being searched for as text.

`{{` completes Roam's components from a fixed catalog of 16 — TODO, query,
embed, calc, video, table and the rest — landing the caret inside the braces.
Rows that need child bullets, or that do not render inside a cell at all, say so
rather than being left out. `/` opens a slash menu that is **off by default**
and is a deliberate subset; see [known limitations](#known-limitations).

Arrow keys move the highlight, and hovering a row moves it too, so `Enter`
always accepts the row that looks selected. Moving the caret out of the query
closes the menu. Outside a formula, `[`, `(`, `{` and `"` wrap the selection
rather than replacing it.

The picker inserts real `[[page]]` and `((uid))` syntax, so the reference
behaves like any other Roam reference. Everything here works the same in a large
grid's editor, though what a large grid can do with the resulting reference is
limited — again, see known limitations.

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

A large-grid cell is a row in a chunk file, not a block, so a `[[page]]` typed
into one is a link Roam has never indexed: it looks live in the cell, but the
page it names shows nothing. **Mirror large-grid references into Roam** collects
the distinct references a grid contains and writes them into collapsed blocks
under the grid, which is what makes Roam create the real reference — so the page
lists the grid in its linked references. It is **off by default**, because it
puts a write on Roam's transactor on every save, which is exactly the cost the
chunk format exists to avoid. **Maximum mirrored references** (2000) bounds it.

## Where grids appear

An enhanced table renders in the main pane, in linked references, inside block
references and inline reference views, in the right sidebar, and inside block
embeds. Every visible copy shares one model and one undo history while keeping
its own selection and scroll position. Grids inside hover previews and other
popovers render too, but are strictly read-only — a surface that disappears on
mouse-out is not a safe place to edit.

## Settings

**Settings → Roam Depot → Roam Grid.** Forty-six controls in eight groups —
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

Two more ship off: **Offer / commands in cells (partial)**, because what it
offers is a fraction of Roam's own menu, and **Mirror large-grid references into
Roam**, because it is the one feature here that adds a write.

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
- **The `/` menu is a subset, not parity.** Roam's own slash registry carries 47
  commands; Roam Grid offers 21. Missing on purpose: the commands that open a
  Roam dialog (date picker, image/file upload, the template picker) cannot be
  summoned from outside Roam's own editor at all; the commands whose output only
  renders under a real block (`word count`, `diagram`, `kanban`, `mermaid`) come
  back as a failure or a "nest a bullet under here" hint in a cell, and are
  reachable under `{{` — where the row says so — rather than offered as a
  command that fails; and the four `Query (…)` commands seed `[[ex-A]]` /
  `[[ex-B]]` placeholder pages that an unedited cell would commit into your
  graph. This is why the setting is off by default.
- **Ranking differs from Roam's.** Roam orders its menu from an in-memory index
  we cannot read. Ours comes from datalog queries and the pages this extension
  has inserted, so for the same keystrokes the top result can differ from the
  one Roam's own menu would put there.
- **Large-grid references are grid-precision, not cell-precision.** With
  mirroring on, the page lists the grid; clicking through lands on the grid, not
  on the cell that mentioned it.
- **Roam does not retract a page it auto-created.** Committing `[[New Page]]`
  into a cell makes the page; deleting that text afterwards leaves the empty
  page behind. That is Roam's behaviour for any block, and the create-page row
  inherits it.
- Some workspaces carry a dark-theme `roam/css` override that sets suggestion
  colours with `!important`. Our menu is scoped to its own `.rg-` classes and
  reads the grid's resolved palette, but an `!important` rule aimed broadly
  enough will still win over it.
- Grids in hover previews are read-only by design.
- Formula coverage is broad but not exhaustive; unknown functions evaluate to an
  error value rather than failing the grid.
- A cell whose content Roam renders richly (page links, block references,
  images, embeds) is painted by Roam's own renderer, so it inherits Roam's
  rendering behaviour for that content.

## Big-graph check

The bare `[[` / `((` openers are budget-gated at `RECENTS_BUDGET_MS` (250 ms).
To time the two recents queries against a live graph, open the browser console
on that graph and run:

```js
t0 = performance.now(); roamAlphaAPI.q('[:find ?title ?uid ?time :where [?p :node/title ?title] [?p :block/uid ?uid] [(get-else $ ?p :edit/time 0) ?time]]'); console.log("pages", performance.now() - t0);
t0 = performance.now(); roamAlphaAPI.q('[:find ?uid ?string ?time :in $ ?since :where [?b :edit/time ?time] [(> ?time ?since)] [?b :block/string ?string] [(!= ?string "")] [?b :block/uid ?uid]]', Date.now() - 7*24*60*60*1000); console.log("blocks", performance.now() - t0);
```

Compare each against 250 ms. Two consecutive over-budget inline fetches disarm
bare openers to cached recents only; any fetch at or under budget re-arms them.
`window.__rgDiag.recentsBudget` shows the live ledger.

## License

MIT. Roam Grid is an independent MIT implementation. The GPL-licensed
[`yibie/grid-table`](https://github.com/yibie/grid-table) project is used only as
a behavioral reference; no source code is copied.

Developers: see [Architecture](docs/ARCHITECTURE.md),
[Development](docs/DEVELOPMENT.md), [Testing](docs/TESTING.md), and the
[Live AI compatibility adapter](docs/LIVE_AI.md).
