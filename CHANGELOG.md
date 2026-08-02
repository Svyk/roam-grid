# Changelog

## 0.2.1

- Made every visible vertical gridline a direct column-resize target, including
  clean tables with row/column labels hidden.
- Added right-edge and bottom-edge resize grips to the selected cell. For a
  merged cell, the grips resize its outermost column and row.
- Made responsive column dragging track the rendered width directly and then
  persist the resulting proportions without a first-drag jump.
- Added Roam-native top/left cell grabbers with familiar header, sort, insert,
  clear, and delete actions, followed by a separated Roam Grid action section.
- Made the grabber menus compatible with native table-menu augmentations, so
  the existing Live AI row/column commands can inject and keep using the
  transactional Roam Grid adapter.

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
