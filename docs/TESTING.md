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
F4 reference locking, bounded formula highlighting, and native `[[page]]` /
`((block))` completion. They also verify stale-search suppression, keyboard and
pointer insertion, stable scalar rendering, connected rich-render hosts,
official unmount cleanup, structural viewport swaps, and virtual-canvas
teardown. Delta-selection coverage makes root queries and mounted-cell scans
fail during movement, verifies that only the symmetric difference changes, and
checks covered merge coordinates, merged-edge handles, range badges, and fill
handles.

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

Current release acceptance:

- 111 automated tests pass in the v0.5 release run. They exercise model,
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

Remaining public-release gates:

- Measure 50+ FPS scrolling with an actual 100,000 × 26 live grid on the
  development Mac; the automated test currently verifies bounded chunk loading,
  not browser frame rate.
- Bring the remaining host-neutral Thymer formula functions into the Roam
  evaluator while retaining the safe registration boundary.
- Add browser-level coverage for the complete pointer, clipboard-image,
  encrypted-file read, interrupted upload, and orphan-cleanup paths.
