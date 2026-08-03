# Changelog

## 0.3.4

- Added save/insert template actions directly to the grid `⋯` menu so the
  workflow does not depend on Roam's command-palette focus behavior.
- Exposed the running extension version through the grid status accessibility
  label and tooltip for reliable hosted-reload verification.

## 0.3.3

- Added cell-edge resize detection as a fallback beneath the transparent overlay,
  so Electron hit-testing cannot turn a column-width drag into cell selection.

## 0.3.2

- Made resize gestures capture their pointer and temporarily disable the active
  cell's HTML range drag, preventing column/range gesture competition.
- Enlarged the invisible column-edge target while retaining the smaller visible
  Roam-style grabbers.

## 0.3.1

- Allowed a column to expand when every neighboring fit-to-window column is
  already at minimum width. The table switches to persistent fixed-width
  scrolling instead of silently rejecting the drag.

## 0.3.0

- Fixed fit-to-window column dragging so the selected edge tracks the pointer in
  pixels, adjacent tracks contract proportionally, and the resulting geometry
  survives reload.
- Stopped content-only edits and API patches from rewriting layout metadata;
  unchanged rich Roam cells are no longer rerendered after every edit.
- Added graph-owned reusable templates with **Save current grid as template** and
  **New from saved template**. Templates live on `[[roam/grid/templates]]` and
  preserve formulas, merges, sizing, alignment, and visual configuration.
- Removed the personal meal-prep calculator from the public bundle; an existing
  calculator can be saved privately as a reusable graph template instead.
- Added Blueprint-aware formula-cell coloring, enabled by default and persisted
  per table, with menu and large-grid toolbar toggles.
- Preserved the smaller native-style grabbers and compact multi-range action
  badge while separating their pointer targets from row/column resize grips.

## 0.2.3

- Made native-style row and column grabbers visually smaller while retaining a
  forgiving invisible pointer target.
- Raised active-cell controls above global resize tracks so the left row menu
  no longer competes with row resizing.
- Replaced single-cell grabbers on rectangular selections with a compact range
  outline and `rows × columns` action badge.

## 0.2.2

- Added a built-in Meat + Pasta Meal Prep Calculator with editable example
  inputs and formulas for batch cost, calories, protein, carbs, and fat plus
  per-meal totals.
- Added disposable template registration, discovery, and creation through
  `window.roamGrid.v1`, making reusable grid templates an extension point.
- Preserved UID-backed header-row styling when a generated model becomes a
  native Roam table.

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
