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
the same added-node-scoped, synchronous scan; specs are cached per block uid and
invalidated when Roam replaces the button node.

The pre-paint rule
`.rm-xparser-default-roam-grid-range:not(.rg-range-restored)` is the single
justified exception to the rule that every CSS rule's subject is a `.rg-*`
class. It is a one-class selector with no descendant combinator, and the only
nodes it can match exist because this extension defined the component. Any
button the scan does not claim — an unresolvable spec, a target that is not an
enhanced native grid, or a failed mount — is given `rg-range-restored` so the
raw Roam component stays visible rather than leaving blank space.

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
listeners, observers, portal observers, dialogs, guards, and the public API. The
native table becomes visible immediately because suppression exists only while
the enhanced UID remains actively claimed.
