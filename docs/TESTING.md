# Testing

Run:

```sh
npm test
npm run check
```

The dependency-free Node suite covers formulas, cycles, reference rewrites,
undo/redo, every destructive-merge invariant from grid-table issue #9,
insertion/deletion/sorting boundaries, malformed metadata recovery, imports,
exports, deterministic charts, native UID round trips, conflicts, and chunked
manifest persistence.

Performance fixtures verify a 5,000-cell formula pass and a 100,000 × 26
manifest that loads only the requested visible chunk. The live smoke test is
restricted to `[[roam-grid/dev]]` in `svy`; existing native tables are not
opted in or changed.

Current release acceptance:

- 39 automated tests pass.
- The existing host-neutral Thymer Grid baseline remains green at 343/343; the
  Roam adapter suite is additive and the original project was not modified.
- Native formulas and safe/blocked merges were exercised in Roam.
- Header-label visibility persists per table.
- A 100 × 26 file-backed grid created, verified, edited one dirty chunk, and
  advanced its manifest pointer.
- Developer-extension reload exposes the untouched native block structure.
