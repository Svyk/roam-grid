# Testing

Run:

```sh
npm test
npm run check
```

The dependency-free Node suite covers formulas, cycles, copy/fill and
structural reference rewrites (including absolute axes, adjacent totals,
partial ranges, and `#REF!`),
undo/redo, every destructive-merge invariant from grid-table issue #9,
insertion/deletion/sorting boundaries, malformed metadata recovery, imports,
exports, deterministic charts, native UID round trips, conflicts, and chunked
manifest persistence. Layout tests verify UID-backed row sizing through
sort/delete/undo/redo, native metadata reloads, exact column widths, and
manifest-only large-grid sizing saves. Alignment tests cover stable UID and
merge-anchor behavior plus native and large-grid persistence.

Editor and lightweight DOM tests cover the shared F2 editor, inline editing,
IME-safe commit/cancel behavior, formula autocomplete, nested signature help,
Excel-style arrow-key point mode, Shift+Arrow ranges, F4 reference locking,
bounded formula highlighting, and native `[[page]]` /
`((block))` completion. They also verify stale-search suppression, keyboard and
pointer insertion, stable scalar rendering, connected rich-render hosts,
official unmount cleanup, structural viewport swaps, and virtual-canvas
teardown. Delta-selection coverage makes root queries and mounted-cell scans
fail during movement, verifies that only the symmetric difference changes, and
checks covered merge coordinates, merged-edge handles, range badges, and fill
handles.

Portal-theme tests verify that the F2 editor, formula and Roam-reference
suggestions, context menus, axis menus, and dialogs receive the grid's resolved
light/dark palette even though they mount under `body`. The editor tests also
cover contextual assistant visibility: ordinary text has no menu, bare `[[` or
`((` has no empty shell, non-empty reference queries show native Roam results,
and formulas expose function suggestions and signature help. Combobox,
listbox, option, active-descendant, and selected-option state are asserted.
Mounting tests cover the graph-scoped enhanced-UID cache, synchronous guard
generation, canonical and referenced UID resolution, stale-cache release,
source-absent references, one adapter/watch per shared session, cross-view
repaints and editor handoff, responsive reference controls, and clean native
fallback. Theme performance tests also fail if a cached view or editor portal
performs a first-mount computed-style read.

Persistence tests cover dirty-UID coalescing, metadata-free scalar saves,
self-watch suppression, non-overlapping external edits, same-cell and
structural conflicts, partial-write rollback, and edits that arrive during an
in-flight save. Native row-deletion fixtures verify that only removed row roots
are staged, surviving chains are not moved, affected formulas are updated, and
rollback attempts restore every staged row and formula while preserving a
recoverable staging block if cleanup cannot safely complete.

Performance fixtures verify a 5,000-cell formula pass and a 100,000 × 26
manifest that loads only the requested visible chunk. The live smoke test is
restricted to `[[roam-grid/dev]]` in `svy`; existing native tables are not
opted in or changed.

Current v0.7 release acceptance:

- All 129 automated tests pass in the v0.7.0 release run. They exercise model,
  adapter, persistence, editor, DOM, and rendering behavior without claiming
  browser-frame performance.
- The existing host-neutral Thymer Grid baseline remains green at 343/343; the
  Roam adapter suite is additive and the original project was not modified.
- Native formulas and safe/blocked merges were exercised in Roam.
- Header-label visibility, row heights, column widths, alignment, and responsive
  fit mode persist per table.
- A 100 × 26 file-backed grid created, verified, edited one dirty chunk, and
  advanced its manifest pointer.
- Developer-extension reload exposes the untouched native block structure.
- In both Blueprint light and dark modes, every Roam Grid-owned portal matches
  the table palette; no graph-global Blueprint selector is overridden.
- The reported meal-prep table rendered as an editable enhanced grid inside its
  block reference while the source block was absent from the page. The Source
  control opened the canonical block, and canonical/reference instances shared
  one session.
- Twenty rapid source/reference back-and-forward transitions were sampled over
  59 animation frames: zero visible native-table frames, zero duplicate roots,
  and no layout collapse. The first-mount viewport and portal theme paths now
  have explicit zero-layout-read regression tests.

Remaining public-release gates:

- Measure 50+ FPS scrolling with an actual 100,000 × 26 live grid on the
  development Mac; the automated test currently verifies bounded chunk loading,
  not browser frame rate.
- Bring the remaining host-neutral Thymer formula functions into the Roam
  evaluator while retaining the safe registration boundary.
- Add browser-level coverage for the complete pointer, clipboard-image,
  encrypted-file read, interrupted upload, and orphan-cleanup paths.
