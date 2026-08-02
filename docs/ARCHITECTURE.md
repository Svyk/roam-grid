# Architecture

## Native-backed tables

Roam's nested table blocks remain canonical. Roam Grid pulls the row roots and
first-child column chains into a UID-preserving `GridModel`; formulas remain raw
cell strings. Layout-only state lives in versioned blocks on
`[[roam/grid/metadata]]` and never in internal block props.

Native mutations are optimistic model transactions followed by a serialized
write queue. The adapter compares a tree fingerprint before writing, preserves
cell UIDs when reconciling structure, reloads after success, and rolls back then
repulls after failure. Pull watches surface external edits without silently
overwriting them.

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

Rows and columns are virtualized. A one-cell edit changes one in-memory chunk
and never rebuilds or uploads the full dataset.

## Lifecycle

The Depot `onload` registers commands, settings, the public API, pull watches,
and DOM observers. `onunload` removes views, listeners, observers, dialogs, and
the public API. The native table becomes visible immediately because its DOM is
hidden only while an enhanced view is mounted.
