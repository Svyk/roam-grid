# Architecture

## Native-backed tables

Roam's nested table blocks remain canonical. Roam Grid pulls the row roots and
first-child column chains into a UID-preserving `GridModel`; formulas remain raw
cell strings. Layout-only state lives in versioned blocks on
`[[roam/grid/metadata]]` and never in internal block props. That page is created
lazily on the first enhancement, not during `onload`, so installing the extension
writes nothing to the graph.

Column widths are keyed by stable column IDs. Native row heights are keyed by
the first cell's Roam UID, so they follow rows through sorting and reordering;
newly created row UIDs are migrated into metadata during structural saves.
Cell alignment is keyed by the anchor cell's stable UID, and fit-to-width is a
table-level preference. Responsive mode treats saved column widths as relative
weights; fixed mode uses the same values as pixels and exposes horizontal
scrolling.

Native mutations are optimistic model transactions followed by a serialized
write queue. The adapter compares a tree fingerprint before writing, preserves
cell UIDs when reconciling structure, reloads after success, and rolls back then
repulls after failure. Pull watches surface external edits without silently
overwriting them.

Formula reference transforms run inside the same model transaction as row and
column insertion/deletion. Structural shifts apply to relative and absolute A1
references alike; partial range deletion produces the contiguous surviving
range, while a fully removed reference becomes explicit `#REF!`. Formula edit
highlighting is presentation-only and never writes derived color state into
Roam blocks or metadata. Keyboard point mode is part of the same shared editor:
when a formula is waiting for an operand, arrows insert or move one transient A1
token, Shift+Arrow extends its range, and F4 changes its lock mask. Beginning
point mode promotes an inline draft to the persistent floating editor so a
large-grid canvas may virtualize and scroll without owning the draft DOM.

### Discovery, sessions, and references

Enhanced table UIDs are cached per graph in local storage. A small startup style
guard hides only the native renderers belonging to those known UIDs while
preserving their layout footprint. `enhancedUidGuardCss` emits three selector
families per uid — `[id$="<uid>"]`, `.rm-block-ref[data-uid="<uid>"]`, and
`[data-uid="<uid>"]` — each qualified with `:not(.rg-native-hidden)`, and refuses
to emit anything at all past `MAX_GUARD_UIDS` (2000 **uids**, not selectors; the
worst case is ~6000 selectors and the cap is sized for that). A `MutationObserver`
scans only added nodes, claims canonical tables and `.rm-block-ref[data-uid]`
instances before the next paint, and verifies cached UIDs against
`[[roam/grid/metadata]]`. Stale entries, explicit restore, clean unload, and
failed mounts release the guard without changing table blocks.

Each canonical table UID owns one `NativeGridSession`: one adapter, model, pull
watch, persistence queue, formula engine, and undo history. Any number of
`GridView` instances can attach to that session from the source block, linked
references, inline references, or nested references. Content and structural
changes repaint every visible instance through targeted updates. Selection,
scrolling, handles, and responsive toolbar state stay view-local, while a
session permits only one active draft editor and commits it before editing from
another instance.

### Surface matrix

`instanceSurface(element)` classifies where a mount actually lives, independently
of the older `context` contract (`"source"` / `"reference"`), which other code
still reads. The value is threaded through `mountNativeInstance` into the view
and published as `root.dataset.rgSurface`.

| Surface | Detected by | Mounts today | Writes | What it needed |
| --- | --- | --- | --- | --- |
| main | default | yes | yes | the `.roam-app` subtree observer; `[id$="<uid>"]` guard family |
| inline / block reference | `.rm-block-ref[data-uid]` | yes | yes | reference claiming in the added-node scan; the `.rm-block-ref[data-uid]` guard family; a shared session so a reference edits the same model |
| linked references | inside `.roam-app`, classified `main` | yes | yes | nothing beyond the main path — linked-reference blocks are ordinary blocks |
| sidebar | `#right-sidebar, #roam-right-sidebar-content` | yes | yes | nothing beyond the main path; the sidebar is inside the observed subtree |
| embed | `.rm-embed-container` | yes | yes | the `[data-uid="<uid>"]` guard family, since embeds key on `data-uid` rather than an id suffix |
| preview | `.bp3-portal, .bp3-tooltip, .bp3-popover` | yes | **no** | a `<body>`-level `childList`-only observer, because Blueprint portals hang off `<body>` outside `.roam-app` while the guard `<style>` is document-global — an unclaimed portal table was blank space; plus the read-only boundary below |

Portal observation is deliberately narrow: one `childList`-only observer on
`<body>` (no `subtree`) attaches a dedicated subtree observer plus a synchronous
`scheduleScan` to each `.bp3-portal` as it appears, and disconnects and forgets
it when the portal is removed. Portals already present at install are swept once.
Every observer is tracked in `runtime.portalObservers` and torn down in
`onunload`. This stays added-node scoped and synchronous; it must not become a
document scan.

### The read-only boundary

A preview-surface `GridView` shares the *same* `NativeGridSession` as the
main-document view, so any write it performs hits the real source table. A
tooltip that vanishes on mouse-out is not a safe place to edit, and a
per-operation guard is not sufficient — the destructive entry points include
drop, dragstart, the fill handle, both context menus, the toolbar, row/column
reorder, resize, and the command palette. The gate is therefore at the boundary,
in three places:

- `claimKeyboard` refuses a view whose `surface === "preview"` or that has no
  `onKeydown`, and **releases** the previous owner rather than retaining it — so
  clicking a read-only excerpt cannot leave keystrokes driving an off-screen grid.
- `GridView.commitMutation` is a no-op on a preview surface. This is the single
  funnel for the view-level mutation sites. `NativeGridSession.commitMutation` is
  deliberately **not** gated: it is also called with `sourceView = null` from the
  discarded-edit recovery and external-patch paths.
- `addCellComment` and `undo`/`redo` bypass `commitMutation`, so each is guarded
  directly.

`RangeGridView` implements none of `onKeydown` / `undo` / `redo` on purpose.
Adding no-op versions would stop the Cmd+Z fallback short-circuiting, so
`preventDefault()` would run and ⌘Z would be silently swallowed on a read-only
excerpt — worse than the noisy failure it replaced. `activeMount()` resolves a
`RangeGridView` to its source `GridView` through `view.session`, so palette
commands still work when focus sits in an excerpt.

### Live range references

`{{roam-grid-range: ((tableUid)) B2:D5}}` renders a read-only excerpt of another
grid. Roam turns an unknown component into a button carrying a single
`rm-xparser-default-roam-grid-range` class, and the `((uid))` inside the braces
produces a real `:block/refs` datom, so every live range is discoverable from
the source table's linked references.

`RangeGridView` is deliberately not a `GridView` subclass: subclassing would
pull in the editor controller, selection, drag-fill, paste, and a window keydown
listener, none of which may exist on a surface that never writes. It satisfies
the session's view contract, attaches to the source table's existing
`NativeGridSession` through `addView`, and therefore repaints through the same
`refreshValues` / `renderStructural` fan-out as every other instance. Because it
never writes it can never produce an echo, and it never becomes the session's
active editor view. It owns no reference or comment badges — those belong to the
source grid — so the session's badge fan-out simply skips it.
Cell content, the theme bridge, and the `grid-template-*` track math are the
shared helpers, so a repeat render writes nothing. Mounting mirrors the native
trio (`rangeButtonsWithin` / `rangeInstanceInfo` / `mountRangeInstance`) inside
the same added-node-scoped, synchronous scan; specs are cached per block uid,
invalidated when Roam replaces the button node, and re-validated against a fresh
string read on every lookup — an edited range string re-parses and a cached
negative recovers. An empty Datascript read is
transient — the block is still mounting — so it is never cached and the next
scan retries; only a definitive non-empty non-spec caches a null. The block host
is located by `roamBlockInputFor`, which accepts the current BEM
`rm-block__input` class, the legacy single-dash class, or the `block-input-` id
prefix, so a Roam class rename cannot orphan the pipeline.

The range loop is factored into `claimRangeMounts` and every element is
processed in its own try/catch: one throw restores that button visible
(`rg-range-restored`), records `window.__RG_U3_LAST_ERROR`, and lets the rest of
the loop run — a single failure can no longer leave every later pre-hidden
button invisible. Every degrade and success point also calls `traceRange`, a
32-entry ring buffer at `window.__rgDiag.rangeTrace` (plus `rangeLast`), so a
silent invisibility can be reconstructed after the fact; the console line
appears only with `localStorage["roam-grid:debug"]` set. Blocks where Roam
renders no component button at all are found by `rangeTextHostsWithin` — a
textContent prefilter only, always verified by the Datascript read — and mount
with the host given `rg-range-host`, whose CSS hides the host's other children
until `:focus-within` lifts the hide for editing; view disposal removes the
class. The text claim is deliberately narrow: the block-input id prefix also
matches Roam's live editing `<textarea>`, so form controls and any host
containing a focused Roam input are excluded (edit mode = hands off), and the
trimmed Datascript string must be the marker alone — a block with prose around
the marker keeps Roam's native render, since the host-hide would erase it (the
button path may still claim the rendered button inside a mixed block). A host
containing any range button is owned by the button path and never text-claimed;
a button that arrives after a text claim disposes the text view before
mounting, so a block never paints two excerpts.

The pre-paint rule
`.rm-xparser-default-roam-grid-range:not(.rg-range-restored)` is the single
justified exception to the rule that every CSS rule's subject is a `.rg-*`
class. It is a one-class selector with no descendant combinator, and the only
nodes it can match exist because this extension defined the component. Any
button the scan does not claim — an unresolvable spec, a target that is not an
enhanced native grid, or a failed mount — is given `rg-range-restored` so the
raw Roam component stays visible rather than leaving blank space.

## Templates

Saved templates live on `[[roam/grid/templates]]` as real, editable tables, not
serialized JSON. Each template is a top-level `roam-grid/template:: <name>` block
whose first `{{[[table]]}}` child IS the template — an ordinary enhanced native
table whose widths, merges, alignments, charts, frozen, and header flags sit in
the normal MetadataStore keyed by that table's uid. Opening the page mounts each
template as a regular GridView, so editing the template is editing a grid; no
template-specific rendering exists.

`GridTemplateStore.reload()` is synchronous (one `getTree` of one page) and runs
at the top of `list`, `get`, and `save`, so the store can never act on a
load-once snapshot. A top-level block whose remainder parses as a v1
`roam-grid-template` JSON record is a legacy entry and reads through the old
`templateModelFromValue` path; anything else with the prefix is a v2 name block.
`get(name)` loads the live table through a watch-free `NativeTableAdapter` and
returns the positional uid-remap round-trip
(`templateModelFromValue(serializeTemplateModel(live, name))`) so no real cell
uid ever leaks into an inserted copy; a missing metadata entry degrades to raw
rows rather than throwing. `save` disposes any existing table's session first,
drops its metadata record, then deletes the subtree — in that order, so a crash
mid-overwrite leaves a restorable table instead of an orphaned layout record —
reuses the name block (a legacy JSON block becomes the name block in place,
keeping its uid and position), materializes the replacement table as the name
block's last child, and writes metadata last.

Legacy JSON records are rewritten once, idly: four seconds after load, and only
when the load-time reload actually found legacy entries, so steady state pays no
timer and no writes. `migrateLegacyTemplates` backs each record up to
`[[roam/grid/metadata]]` as `roam-grid/template-backup:: <original JSON>` BEFORE
touching the block, rewrites the block into the v2 name block, materializes the
table, and verifies by re-reading the tree (cell count must match rows × cols).
A failed verify restores the original JSON string and stops the run; over-budget
records are skipped untouched. Idempotency is re-detection — a run that finds
nothing legacy performs zero writes. The settings-panel maintenance action
**Migrate legacy grid templates** is the manual retry.

## Cell editing

A cell edit takes one of three editors, decided in `GridView.beginEditLocal`:

1. a **registered custom editor**, if one matches — it wins outright;
2. **Roam's own block editor**, mounted over the cell by
   `NativeCellEditorOverlay` — the default for a plain cell;
3. the **grid's own editor**, `GridEditorController` — the fallback, and the
   only editor for a formula, an F2 floating edit, a large grid, a preview or
   reference surface, and anything the overlay could not start.

### The native overlay

`renderBlock({uid, el})` mounts the real Roam block editor inside a
`.rg-native-cell-editor` node in the cell, so `[[`, `((`, `#`, `{{` and `/` open
**Roam's own menus**, not the extension's approximations of them. The setting
`editing-native-editor` (Editing, graph-scoped, default on) plus
`nativeEditorEnabled()` gate it; two CONSECUTIVE mount or focus failures set
`runtime.nativeEditorDisabled` for the rest of the session and say so once. Every
failure falls through to the grid editor — the overlay never fails toward an
empty cell.

Five measured facts about Roam shape the whole class:

- **Focus comes from a synthetic click.** `setBlockFocusAndSelection` does not
  reach a `renderBlock` window. A `mousedown` + `mouseup` + `click` on the
  `.rm-block__input` does, and a focused `<textarea>` appears in-host.
- **The textarea is the only truth.** While typing, Roam has not written
  `:block/string`; Datascript still holds the old value seconds later. Every
  commit reads `textarea.value` first and only falls back to
  `pullNativeCell(uid).raw` when focus is already gone.
- **The chained cells render.** A native table stores the next column as the
  block's CHILD, so the mount paints the rest of the row inside the cell unless
  `.rm-block-children` is hidden — and a caret can still walk into one, which the
  overlay's `focusin` guard commits on.
- **Enter splits the block.** With the menu closed and the caret mid-value, Enter
  truncates the cell and turns the remainder into a new child block. That is why
  Enter is intercepted; `repairStructure` is the safety net for the passed-through
  case, and it detects the damage by novel uid — NOT by
  `nativeStructureSignature`, which walks row roots and first-child chains and so
  reports a split table as healthy.
- **The menu portal is a body child.** `nativeAutocompleteOpen()` reads
  `.rm-autocomplete__results`. Only on a session where that selector has never
  matched anything does it fall back to treating an open
  `roamEditorTriggerContext` as a plausibly-open menu.

`interceptKeydown` is a capture-phase listener on the overlay root, so a swallow
stops the event before Roam's own handlers see it. Escape alone is answered by
`handleEscapeKey`, which the overlay listener and two document-capture backstops
(keydown, then keyup) share: an ancestor capture handler that calls
`stopPropagation` would otherwise keep the cancel Escape from ever arriving, and
an edit that cannot be cancelled is an overlay wedged over the cell.

| Key | Menu open | Menu closed |
|---|---|---|
| Enter | pass (select a row) + schedule the split check | commit, `enterMovement()` |
| Tab / Shift+Tab | pass + schedule the split check | commit, `tabMovement()` |
| Escape | pass ONCE per typing episode (Roam closes the menu); every later Escape cancels | cancel |
| Backspace at caret 0 | swallow — would merge the cell into the previous chain block |
| Delete at the end | swallow — would forward-merge the hidden next-column cell |
| ArrowUp/Down past the line | pass (menu nav) | swallow (caret clamp) |
| ⌘Enter, block-move chords | swallow | swallow |

Shift+Enter (soft break) and ⌘Z / ⌘⇧Z pass through, and a `composing` flag from
`compositionstart`/`compositionend` yields the whole table to an IME. A
multi-line paste is flattened to one line, because a grid cell is one block.

`commit()` writes the live value, patches the adapter base, syncs the model cell
and finishes through the editor controller's own `onFinish` closure — the same
one the grid editor uses, so the cell renders, the selection moves and the grid
re-claims the keyboard exactly as before. `cancel()` restores `beforeRaw`
byte-for-byte, recording both the blur flush and the restore as self-writes so
neither surfaces as somebody else's edit; `reconcileCancelWrite` then re-reads
the block for a few frames, because Roam's blur flush can land AFTER the restore
and re-persist the value the user just cancelled. `dispose()` unmounts and NEVER
writes: a mid-edit disposal must not clobber what Roam last saved. If focus
leaves the overlay for something outside the grid with no menu open,
`finishIfFocusLeft` finishes the edit a frame later rather than leaving the
overlay mounted.

Keyboard ownership needs no new code. The mounted input matches the hardened
`ROAM_BLOCK_INPUT_SELECTOR`, so focusing it already runs `onGlobalFocusIn` →
`releaseKeyboard()`, and the commit path re-claims through `onFinish`.

On the session, `nativeOverlayUids` marks the block Roam is typing into. Its
flushes arrive as external content changes, so they are skipped when collecting
novel undo entries; `endNativeOverlayEdit` then pushes exactly one entry for the
whole edit, by rewinding the cell to `beforeRaw` and re-applying the committed
value through `commitMutation`. Because the base was already patched, that
transaction leaves the dirty-cell diff empty and issues no second write.

## Cell autocomplete

`roamEditorTriggerContext(raw, caret, { formula })` is the single scanner. It
returns the nearest unclosed opener as one of six types — `page` (`[[`),
`block` (`((`), `tag` (`#`), `tag-page` (`#[[`), `component` (`{{`), `command`
(`/`) — with the indices the accept path needs. `#[[` beats `[[` by looking at
the character before `startIndex`. Inside a formula it suppresses `block`,
`component`, `command` and `tag` outright and allows `page` only where
`formulaPositionIsQuoted` says the caret is inside a string, which is what stops
`=SUM((A1` from opening the block picker. `/` additionally requires index 0 or a
preceding space, which is what stops `=A1/B2`.

`GridEditorController` is constructed identically by `GridView` and
`LargeGridView`, so everything below lands on both surfaces.

### The never-empty-popover invariant

> The popover is visible only when the suggestion list is showing rows, or the
> editor is floating, or the cell holds a formula.

`syncPopoverVisibility` is the only place that decides it; every other path
mutates `this.suggestions` and then calls it. That one rule covers what used to
be separate cases: a bare opener whose query is still in flight has no rows and
so paints no empty shell, a catalog whose setting is off produces no rows and so
opens nothing, and an Escape-dismissed list cannot reopen on the next paint.
`renderSuggestionRows` keeps `hidden`, `aria-hidden` and the editor's
`aria-expanded` in step with the same row count.

### The recents path

A bare opener takes a separate path from a search. `[[` / `#` / `#[[` read the
most-recently-edited pages; `((` reads blocks edited within
`RECENT_BLOCK_WINDOW_MS` (7 days). Two grid-specific corrections apply:

- **The current table's own cell uids are excluded** from the block list. Every
  cell edit touches a block, so unfiltered the list is the table the user is
  sitting in. Large-grid cells are not blocks and contribute no uids, which is
  correct rather than a gap.
- **`runtime.recentlyAcceptedPages`** (LRU, 25, in memory only) is promoted
  ahead of the graph's own edit times. It is the one recency signal this
  extension owns, and inside a grid it is the one that matches muscle memory.

Both result sets are cached in `roamRecentsCache`, keyed by graph and by
page-vs-block, for `RECENTS_TTL_MS` (60 s). `recentsCacheReady(type)` is what
`searchDelay` consults: a cache-resolvable bare opener returns 0 and skips the
debounce entirely, because there is nothing to debounce. Each query is timed;
over `RECENTS_BUDGET_MS` (250 ms) the result is still used — it is already paid
for — and `runtime.recentsDisabled` turns the bare-opener path off for the rest
of the session with a `console.info` and never a toast. The page query returns
every page in the graph, so this switch is what makes the feature safe to ship
before it is measured on a large one. `editing-autocomplete` and
`editing-autocomplete-empty-opener` are both read **ahead** of the timer, so an
off switch issues no query rather than issuing one and discarding it.

### The eight render bounds

Block suggestions are drawn with `roamAlphaAPI.ui.components.renderString`,
reusing the hidden-host anti-flash pattern `paintRichCellContent` established.
At the default limit of 8 rows and a 90 ms debounce a fast typist produces about
eleven result sets a second, so an unbounded per-row render is roughly 88 React
mounts a second while typing. Eight bounds hold it to **6 mounts per query and 0
per navigation keystroke**:

| | Bound |
| --- | --- |
| B1 | `renderSuggestionRows` rebuilds only when the result-set signature changes; `paintActiveSuggestion` moves the active row. |
| B2 | Only `kind === "roam-block"` rows render. A typical `[[` menu issues zero. |
| B3 | Within a set, only rows where `requiresRoamRichRender(raw)` is true. |
| B4 | `MAX_RENDERED_SUGGESTION_ROWS = 6` — a module constant, not a setting. |
| B5 | Renders are issued through a `queueMicrotask` chain with a stale-token check between each, so a newer set aborts the remainder mid-batch. |
| B6 | A per-controller LRU of 12 rendered fragments, keyed by row signature, so backspacing reuses hosts. |
| B7 | `disposeSuggestionRows` unmounts every host, on accept, Escape, finish and dispose. |
| B8 | `editing-autocomplete-render-rows`, plus auto-off after two batches over `SUGGESTION_RENDER_BUDGET_MS` (32 ms). |

**B1 is load-bearing, not an optimisation.** Before the split, the arrow-key
branch of `onKeydown` called an unconditional `replaceChildren()` on every
keypress. That was survivable while rows were `textContent`; with rows rendering
through React it would mean a full unmount/remount of the visible list on every
↓. Hover-to-highlight (`mouseenter` → set index → `paintActiveSuggestion`) is
only affordable for the same reason: a rebuild there would drop the row the
pointer is sitting on, on every mouse move. The regression guard is a node
identity assertion across ↓ then ↑.

Rows are never blank in the meantime. `roamSuggestionPlainText(raw)` is a pure
normalizer that fills `.rg-suggestion-text` on the first frame; the hidden host
replaces it on success. Being pure it unit-tests with no DOM, and it is the
permanent fallback when `renderString` is absent.

Enrichment (reference counts, page breadcrumbs) runs as **one batched query per
settled result set**, after the rows are on screen, and paints onto the existing
nodes rather than going back through `renderSuggestionRows` — a rebuild would
discard the node identity B1 pins and re-mount the hosts B4 bounded, for
decoration on a result set that did not change.

### Large-grid reference shards

A large-grid cell is a row in a chunk file, so a `[[page]]` typed into one is a
link Roam has never indexed. `large-refs-sync` (default **false**) mirrors them
into blocks Roam *will* index.

Each manifest chunk entry carries a derived `refs` list, computed by regex over
that chunk's rows at save time. After a successful commit — **after** the
pointer swap, inside the same `MutationQueue` turn, not per CAS retry attempt —
`manifestReferenceUnion` takes the union across chunk entries and
`referenceShardPlan` materialises it under the grid's own anchor:

```
{{[[roam/grid]]}} anchor
  roam-grid/manifest:: <url>
  roam-grid/refs:: v1              (collapsed marker parent)
    <shard 0: "[[A]] [[B]] ((uid)) …">   (LARGE_REFS_PER_SHARD = 100)
    <shard 1: …>
```

Roam's own indexer then creates the `:block/refs` datoms, so the references are
real by construction rather than emulated.

**References are a set union, not positional data.** That single property is why
this design needs no structural-op handling at all: a reference moving from row
50 to row 51, or across a chunk boundary, leaves the union identical and every
shard byte-for-byte unchanged, so row insert and delete write nothing. It is
also why block count is bounded by *distinct references* rather than by cells —
100,000 cells naming `[[Foo]]` produce one ref, and the realistic steady state
is a handful of blocks with one `updateBlock` per save.

The rest follows from the same property:

- `planReferenceShardWrites` diffs against the existing children, so a save that
  changed no reference costs zero transactor writes.
- Shard content is a pure function of manifest content, so two correct devices
  compute byte-identical strings and converge regardless of write order.
  Truncation at `large-refs-max` is therefore taken **after** sorting, never in
  encounter order, and the marker records it as `roam-grid/refs:: v1 (truncated
  at N)`.
- A chunk merge recomputes shards from the merged manifest. Deleting the grid's
  anchor subtree removes the marker and Roam retracts the datoms, so there is no
  GC pass. A shard write that fails after a successful commit leaves the mirror
  **stale, never wrong**, and `initialize()` reconciles on next open.
- `normalizeManifest` defaults a missing `refs` to `[]`, so existing v2
  manifests load unchanged and references appear lazily as chunks are saved.

Click-through is grid-precision: the page lists the grid, not the cell.

## Undo

`UndoHistory` stores inverse-op entries, not snapshots. Each entry carries its
`inverse` and `forward` op lists, the set of block uids it `touched`, a shape
signature, and — for structural entries — a full `checkpoint` clone. Content and
structural work are separate lanes; the checkpoint budget
(`MAX_UNDO_CHECKPOINTS`) is enforced by dropping everything at or below the
evicted checkpoint, because a later entry cannot be replayed past a checkpoint
that no longer exists.

Three things make the history survive the write path rather than being
invalidated by it:

- **Echoes.** Roam replays the extension's own structural writes back through the
  pull watch. Those are absorbed as the recorded before→after transition, not
  treated as external edits.
- **Uid remapping.** Roam may mint uids other than the ones a write requested.
  `remapUids(uidMap)` rewrites every entry's op targets and `touched` set, so an
  entry recorded before the write still applies after it.
- **Genuinely external edits.** A uid an existing entry owns is marked `stale`
  on that entry rather than discarding the history; a change the history cannot
  rebase becomes its own synthesized `externalContentUndoEntry`. Checkpoint
  entries widen the stale set to every incoming uid, because restoring a
  checkpoint touches the whole table, not only the uids in its op list.

Keyboard ownership is explicit rather than inferred from focus. `claimKeyboard`
and `releaseKeyboard` maintain one `runtime.keyboardOwner`; a pointerdown on a
Roam block input releases it immediately, so ⌘Z falls through to Roam whenever a
grid is not genuinely in control.

Sessions are disposed on idle. Histories are keyed separately in `undoHistories`
and bounded by `MAX_UNDO_HISTORIES`, so remounting a table shortly after leaving
it recovers its undo stack rather than starting empty.

`LargeGridHistory` extends `UndoHistory` for the virtualized store, addressed by
`(rowId, columnId)` instead of block uid — the store's addressing and its apply
target differ, which is why `applyInverse` / `applyForward` / `remapUids` are
overridden rather than reused.

### Recovering edits a conflict reload discarded

When an external change forces a full repull, unsaved local edits in the dirty
set would otherwise be dropped silently. They are captured instead (bounded by
`MAX_DISCARDED_EDITS`), and the user is offered a Restore action — as a toast if
`conflict-restore-prompt` is on, and always through the **Roam Grid: Restore
discarded edits** command. Restore refuses to resurrect a block the external
change deleted.

## Comments

A cell comment is a real Roam comment thread, written in the exact structure
Roam's own comment UI reads, on the **cell's own page** — the `roam/comments`
page itself has no children; containers merely reference it.

```
<page of the target block>
└─ "[[roam/comments]]"        :block/open false     order: last
   └─ "[[<today's daily note>]]"                    order: first
      └─ "[[<author's display page>]]"              order: last
         └─ "((<cellUid>))"   thread anchor         order: last
            └─ "<comment text>"
```

`commentThreadPlan` is pure: given the page tree it reuses every level that
already exists, matching on exact block string, and returns only the ops needed
to reach the anchor. Re-running it against a tree containing its own output
yields `ops: []`. `applyCommentThreadPlan` executes the plan and remaps planned
uids from whatever `create` actually returns, so an API that ignores a requested
uid cannot break the chain.

`queryCommentThreadIndex(pageUid)` returns `Map<cellUid, [{threadUid, count}]>`
from two `:in`-parameterized queries. The `roam/comments` entity is resolved
first, so a graph with no comments costs exactly one query and returns an empty
Map. `queryBlockReferenceCounts` is left untouched: a measured single-query
`or-join` partition costs 150 ms/400 uids against 58 ms today and cannot return
thread uids, so two queries are both cheaper and strictly more capable.

Because a thread anchor is a real `((cellUid))` reference, it inflates the raw
linked-reference count. The badge partition subtracts the thread count from the
reference count and renders a separate comment badge; when the remainder is
zero, the reference badge is removed entirely and only the comment badge stays.

`comments-affordance-trigger` chooses between `Hover` (the default) and
`Cmd/Ctrl + hover`. `GridView.commentAffordanceWanted()` is the only place that
decides, so the modifier keyup path cannot tear down a listener `Hover` mode
wants permanent; `syncCommentAffordance()` applies that decision and is what
`mount`, `setCommentArming`, and the two Comments settings hooks all call.

Either way the affordance is one delegated `pointerover` per visible grid and
one reused button node moved into the hovered cell. There is no `mousemove` and
no per-cell listener. In `Hover` mode that listener is permanent for the life of
the mount, which is affordable only because `onCommentPointerOver` does nothing
but `closest(".rg-cell")` and a move, and short-circuits when the node already
sits in the hovered cell — `pointerover` bubbles, so crossing a cell's children
re-fires it. In `Cmd/Ctrl + hover` mode two window listeners on Meta/Control
keydown/keyup (plus `blur` and `visibilitychange` to disarm) toggle
`runtime.commentArmed`, and disarmed still means zero listeners and zero nodes.

A `preview`-surface view installs nothing in either mode: it is read-only, and a
write affordance on a read-only surface is the defect GOAL-R1 closed.

Comment writes land on the page rather than the table subtree, so the table's
pull watch never sees them. The new anchor uid is merged optimistically into
`session.commentThreads`, and the later datalog refresh diffs to an empty set.
The merge is gated on a comment block actually being written: an empty-body
thread write (`ensureCommentThread`) creates the chain but merges nothing,
because a merged anchor with no comment would invent a badge the refresh then
has to retract.

`comments-compose-mode` (device scope, default **In place**) routes
`GridView.addCellComment` to one of three composers, and `openCellComments`
reads the same value to decide where an existing thread opens. **Comment box**
is the pre-0.12 prompt dialog, extracted unchanged. **In place** opens the
inline comments panel and appends an ephemeral composer textarea into it,
registered in the panel's disposer list so closing the panel takes the composer
with it; the composer writes nothing until Enter, so the default mode has no
abandoned-block lifecycle at all. **Right sidebar** is the only mode that
creates an empty comment block before the user types: `beginSidebarComment`
ensures the thread, then reuses the anchor's trailing empty child or creates
one, opens `sidebar-block-<anchorUid>` (a deterministic window-id, verified
against `getWindows()`), and focuses the body with `setBlockFocusAndSelection`,
retried against the sidebar's async mount. Because the empty body exists before
any typing, the gesture arms `armCommentAbandonCleanup`: one capture-phase
`focusin` listener (focus landing anywhere but the body ends the gesture) plus
a 90 s tracked-timeout safety net, first fire wins. The sweep re-reads the body
string and the anchor's live child count at fire time — a concurrent writer
must never lose blocks to a stale plan — and `commentComposeCleanupPlan`
unwinds child→parent only the levels the gesture itself created. The legacy
`comments-open-in-sidebar` switch is migrated onto the enum by
`planSettingsMigration` (graph) and `planDeviceSettingsMigration` (the
localStorage shadow, where a device-scoped value actually lives).

`LargeGridView` intentionally implements neither `syncCommentAffordance` nor
`setCommentArmed`: large-grid
cells are JSON rows with no block uid, so there is nothing to anchor a native
thread to. The status element explains this and points at **Copy/convert table**.
No alternate comment store exists.

## Theme bridge

Before the native renderer is hidden, the view samples Roam's actual host,
native borders, background, text, and accent into scoped `--rg-*` properties.
The palette is cached by graph/theme signature and reused across views. Body-
mounted editors, menus, and dialogs map those cached tokens to portal tokens,
so mounting a closed editor does not invoke `getComputedStyle` or force layout.
Theme-boundary and OS color-scheme changes are observed and coalesced to one
animation frame. All rules remain under `.rg-root` or `.rg-portal`; Blueprint
and personal `roam/css` remain untouched.

## Merge contract

A merge is a rectangle with one top-left anchor. Every covered raw cell must be
empty. Covered positions contribute no duplicate value to formulas or exports,
and the renderer treats the rectangle as one navigation stop. Invalid metadata
is discarded without changing raw block strings.

Sorting moves horizontal merges with their row and refuses operations that
would split a multi-row merge. Insertions expand or shift spans; deletion can
transfer an anchor to the first survivor and removes one-cell remnants.

## Large grids

`{{[[roam/grid]]}}` owns a manifest-pointer child. Rows are stored in immutable
JSON chunk files. A save uploads dirty chunks, uploads and reads back a new
manifest, then changes the pointer. Prior manifests remain retained. A pointer
revision mismatch does not blindly overwrite another writer.

Rows and columns are virtualized. `ensureRows(start, end)` resolves the visible
band and `peekRaw(row, col)` reads it synchronously, so `renderVisible` no longer
allocates an array-of-arrays every frame. A one-cell edit changes one in-memory
chunk and never rebuilds or uploads the full dataset; sizing changes upload only
a new manifest.

### Manifest v2

`normalizeManifest` accepts both v1 and v2; `migrateManifestToV2` is a pure
function over the manifest object.

- **Stable row ids.** `r_<manifestRev>_<chunk>_<local>` is synthesized lazily in
  `loadChunk`, so two clients migrating independently produce identical ids and
  **no chunk is ever uploaded merely to add ids**.
- **Re-keyed metadata.** `rowHeights` and `alignments` move from array index to
  stable row id. The legacy `rowHeightsByIndex` / `alignmentsByIndex` maps stay
  as a read fallback. Alignment and fit mode are manifest metadata, so changing
  either marks no immutable row chunk dirty.
- **Row metrics.** `rebuildRowMetrics` includes `metricsVersion` in its cache key
  (omitting row heights was a latent staleness bug), and the prefix sum is sparse
  — O(overrides) rather than an 800 KB `Float64Array` at 100k rows.
- **`chunkRows` is per-manifest.** The rows-per-chunk setting applies to newly
  created grids only; an existing grid keeps the chunk size it was written with,
  because changing it would misaddress every chunk.

### Chunk integrity

Each chunk descriptor carries a SHA-256 digest computed via `crypto.subtle`.
`downloadJson` is split into `downloadText` plus a parse step so the digest is
verified against the **raw bytes before parsing** — that is what catches a
truncated response that still happens to parse. Three retries with backoff, then
`GridError("CHUNK_DIGEST")`; `renderVisible` paints that row band as an error
band rather than failing the frame. Legacy chunks with `digest: null` skip
verification.

### Chunk cache

`ChunkCache` is an IndexedDB store (`roam-grid-chunks`) behind an injectable
backend, so tests use an in-memory backend and a deliberately throwing one. The
chunk url is the natural key: uploads always mint a fresh url, so entries are
immutable and never need invalidation. If IndexedDB is unavailable the cache
reports `available = false`, every method becomes a no-op, behaviour is
byte-identical to having no cache, and nothing throws. A bounded resident-chunk
LRU is sized from the viewport, and **dirty chunks are pinned** — evicting one
would lose the edit.

### Transfers and conflicts

`mapWithConcurrency` bounds parallel transfers: 4 on commit, 6 on prefetch.
`saveAsCopy` streams chunk by chunk rather than accumulating every row.

The manifest carries a 16-entry `lineage`, which makes "behind" versus "forked"
decidable with zero extra downloads. A conflicting save is merged only when the
live manifest descends from our base **and** our dirty chunk indexes are disjoint
from theirs **and** dimensions/merges changed on at most one side **and** no
metadata key differs on both. The compare-and-swap loop is bounded at three
attempts inside the existing `MutationQueue`; fork, overlap, or exhausted CAS
still refuse the save, with a specific `reason`.

An edit that arrives while `commit()` is awaiting its uploads is no longer lost:
the dirty set is snapshotted at commit start and only the committed indexes are
cleared, so the late edit survives into the next commit.

### Orphan collection

Superseded files accumulate in `garbage[]` with a 7-day grace clock. Collection
is **off by default**, runs at most once per session, is skipped if the manifest
was touched within the hour, and never deletes the current manifest, anything in
`retained[]`, or an entry whose `deadAt` cannot be parsed. It is irreversible,
and the setting says so.

## Settings

The schema is a flat array of descriptors. Roam's settings panel supports
switch / input / select / button rows only, so grouping is the
`"<group> — <name>"` label convention plus a per-row `className`. Duplicate keys
throw at module load.

Each descriptor declares its `scope` (`graph` values go through
`extensionAPI.settings`; `device` values go to one `localStorage` key per graph)
and its `apply` mode (`immediate` or `next-op`). `onView` / `onLarge` /
`onSession` are the propagation callbacks `applySettingsChange` invokes for each
registered surface; a descriptor with no callback is read live at its use site,
so there is one source of truth rather than a flag plus a separate handler table.

`stage: "pending"` rows are reachable through `getSetting` but are never
rendered. That is deliberate: a visible control that does nothing is exactly the
defect the schema replaces. No descriptor is pending today: every declared key
has a read site.

The `Ranges` group is where that rule was last enforced.
`ranges-live-references` is read in `rangeInstanceInfo`, the mount path's only
discovery call, so off means no spec is parsed and `scanMounts` un-hides the raw
component. `ranges-max-rendered-cells` is read by `rangeRenderPlan`, which
clamps the rectangle `RangeGridView.render` paints and reports the drop in the
caption. A third descriptor, `ranges-read-only`, was deleted rather than wired:
`RangeGridView` has no `commitMutation` and no `onKeydown`, and `claimKeyboard`
refuses a view without one, so the toggle's "false" branch could not exist.

Maintenance rows are actions, not settings: they hold no value, so they stay out
of `SETTINGS` (nothing to seed, cache, coerce, or reset) and are appended to the
rendered panel separately.

## Lifecycle

The Depot `onload` installs the pre-paint guard, registers commands, settings,
the public API, shared sessions, pull watches, the `.roam-app` added-node
observer, and the `<body>` portal observer. `onunload` removes views, sessions,
commands, listeners, observers, portal observers, dialogs, guards, and the public
API. The native table becomes visible immediately because suppression exists only
while the enhanced UID remains actively claimed.
