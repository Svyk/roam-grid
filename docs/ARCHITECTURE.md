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
Roam blocks or metadata.

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

The Depot `onload` registers commands, settings, the public API, pull watches,
and DOM observers. `onunload` removes views, listeners, observers, dialogs, and
the public API. The native table becomes visible immediately because its DOM is
hidden only while an enhanced view is mounted.
