# Architecture

## Native-backed tables

Roam's nested table blocks remain canonical. Roam Grid pulls the row roots and
first-child column chains into a UID-preserving `GridModel`; formulas remain raw
cell strings. Layout-only state lives in versioned blocks on
`[[roam/grid/metadata]]` and never in internal block props.

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
preserving their layout footprint. A `MutationObserver` scans only added nodes,
claims canonical tables and `.rm-block-ref[data-uid]` instances before the next
paint, and verifies cached UIDs against `[[roam/grid/metadata]]`. Stale entries,
explicit restore, clean unload, and failed mounts release the guard without
changing table blocks.

Each canonical table UID owns one `NativeGridSession`: one adapter, model, pull
watch, persistence queue, formula engine, and undo history. Any number of
`GridView` instances can attach to that session from the source block, linked
references, inline references, or nested references. Content and structural
changes repaint every visible instance through targeted updates. Selection,
scrolling, handles, and responsive toolbar state stay view-local, while a
session permits only one active draft editor and commits it before editing from
another instance.

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
source grid — so the session's optional-chained badge fan-out simply skips it.
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

### Theme bridge

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
500-row JSON files. A save uploads dirty chunks, uploads and reads back a new
manifest, then changes the pointer. The prior manifest remains retained. A
pointer revision mismatch refuses the save rather than overwriting another
writer.

Rows and columns are virtualized. Variable row heights use a cached prefix-sum
index for scroll positioning and merged-region spans. In this mode row heights
are manifest-indexed and column widths remain keyed by stable column IDs. A
one-cell edit changes one in-memory chunk and never rebuilds or uploads the full
dataset; sizing changes upload only a new manifest.
Alignment and fit mode are manifest metadata, so changing either does not mark
any immutable row chunk dirty.

## Lifecycle

The Depot `onload` installs the pre-paint guard, registers commands, settings,
the public API, shared sessions, pull watches, and added-node observers.
`onunload` removes views, sessions, listeners, observers, dialogs, guards, and
the public API. The native table becomes visible immediately because suppression
exists only while the enhanced UID remains actively claimed.
