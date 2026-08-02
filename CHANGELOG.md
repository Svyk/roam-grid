# Changelog

## 0.2.0

- Added drag, exact-pixel, compact, and automatic per-row sizing with stable
  UID-backed persistence for native tables.
- Made column resizing transactional and explicitly verified width persistence.
- Added persistent row/column sizing to large-grid manifests and their
  virtualized layout calculations.
- Added a GitHub Pages workflow and deploy bundle for Roam's URL Developer
  Extension install mode, which auto-starts and refreshes after pushes.
- Added persistent left/center/right cell alignment, native block-reference copy
  actions, and responsive fit-to-window columns with a fixed-width toggle.
- Documented Roam's required reload gesture for local-folder extensions.

## 0.1.0

Private release candidate; remaining public-release gates are documented in
`docs/TESTING.md`.

- Native-backed enhanced tables with safe formulas, merges, movement, rich
  Roam rendering, images, imports/exports, charts, and explicit native restore.
- Optional row/column labels and Blueprint/Roam-aware light/dark styling.
- Virtualized file-backed large grids with immutable chunks and verified
  revisioned manifests.
- `window.roamGrid.v1` integration API, disposable custom cell editors, and a
  Live AI transactional-write/native-fallback adapter.
