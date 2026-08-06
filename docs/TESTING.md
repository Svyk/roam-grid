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
teardown.

Cell-autocomplete coverage resolves all six trigger types (`[[`, `((`, `#`,
`#[[`, `{{`, `/`), nearest-opener precedence with `#[[` beating `[[`, and the
formula guards — `=SUM((A1` yields no block context, `=A1/B2` no command
context, `="x" & [[P` a page context because the caret is quoted. On the recents
path it pins that the current table's own cell uids are excluded, that the
accepted-page LRU promotes on the next bare opener, and that the master
autocomplete switch suppresses the query by call count rather than by
discarding its results. On the render path it pins the plain-text normalizer per
markdown form, that only block rows and only rows carrying markup render, the
six-row cap, that a superseded result set aborts mid-batch and unmounts every
host it had already made, that every teardown path unmounts, the auto-off after
two slow batches, and — as the regression guard for all of it — that arrow-key
navigation leaves `suggestionList.children[0]` node-identical. Enrichment is
asserted to issue one query per result set regardless of row count. Large-grid
reference mirroring is covered for per-chunk derivation, the union across
chunks, diffed shard writes, row insert/delete changing no shard, deterministic
labelled truncation, a v2 manifest with no `refs` key loading clean, and a
failed shard write leaving the commit intact. Delta-selection coverage makes root queries and mounted-cell scans
fail during movement, verifies that only the symmetric difference changes, and
checks covered merge coordinates, merged-edge handles, range badges, and fill
handles.

Portal-theme tests verify that the F2 editor, formula and Roam-reference
suggestions, context menus, axis menus, and dialogs receive the grid's resolved
light/dark palette even though they mount under `body`. The editor tests also
cover contextual assistant visibility, which is pinned as one invariant rather
than as a list of cases:

> The popover is visible only when the suggestion list is showing rows, or the
> editor is floating, or the cell holds a formula.

`syncPopoverVisibility` is the single place that decides it, and the tests
assert it across every trigger type against a cold cache, a warm cache, an empty
recents result, and a disabled recents path — `aria-expanded` included. A bare
`[[` or `((` therefore opens on recents when it has rows and shows no empty
shell while its query is in flight, which is the same invariant producing two
different outcomes rather than two special cases. Ordinary text still has no
menu, non-empty reference queries still show native Roam results, and formulas
still expose function suggestions and signature help. Combobox,
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

v0.7.0 release acceptance, kept as a record of what was exercised by hand at
that release rather than as a current count:

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

## Optional-chaining audit (GOAL-2G) — Group 3 inventory

`src/extension.js` uses `receiver.method?.()` (or `receiver?.method?.()`) in roughly 40
places to call one of four DOM lookup methods: `closest`, `matches`, `querySelector`,
`querySelectorAll`. Unlike the nine GOAL-2D sites fixed in this same pass (real registry
members that always implement the method they're guarding), these calls exist because the
codebase's test doubles are several independently hand-rolled fake DOM node shapes with
inconsistent method coverage. The trailing `?.` before the call means a fake missing the
method takes the same silent not-found branch as a fake that correctly implements it and
returns no match — a test can stay green while asserting nothing about the branch it meant
to exercise. This is the same failure class as the fixed Group 1 sites, at roughly four
times the count, and it is pre-existing (not introduced by GOAL-2D). It is not fixed here;
this section is the scoped inventory the goal asked for.

### Site list

One row per call site. "Selector kind" flags whether the selector is a bare class selector
(the one shape every fake below can match) or uses attribute/tag/compound/`:scope`
syntax that only the fullest fake supports (see next section).

| Lines | Function | Call | Selector kind |
|---|---|---|---|
| 3870, 3872 | `uidFromFocusTarget(target)` | `target?.closest?.(".rm-block-input,[id^='block-input-']")`, `input?.closest?.("[data-uid]")` | attribute |
| 3913 | `portalOwnerUid(target)` | `target?.closest?.("[data-rg-owner]")` | attribute |
| 3930 | `isGridEditorInput(target)` | `target?.closest?.(".rg-editor,.rg-floating-editor-input,.rg-dialog-input")` | class list |
| 3934 | `onGlobalPointerDown(event)` | `target?.closest?.(".rg-root")` | class |
| 4211 | `gridThemeSignature(nativeElement)` | `nativeElement?.closest?.("[data-theme], [data-color-mode], .bp3-dark, .bp4-dark, .bp5-dark, [class*='theme-']")` | attribute + class |
| 4244 | `syncGridThemeFromHost(nativeElement, …)` | `nativeElement?.querySelector?.("td,th,[role='gridcell']")` | tag + attribute |
| 4292 | `createGridThemeBridge(…)` | same selector as `gridThemeSignature` (re-derived) | attribute + class |
| 4369 | `syncPortalThemeFromRoot(ownerRoot, …)` | `ownerRoot?.closest?.(".rg-root")` | class |
| 4382, 4383 | `syncPortalThemeFromRoot` | `root?.querySelector?.(".rg-header, .rg-toolbar")`, `root?.querySelector?.(".rg-status")` | class |
| 4452 ×2 | `portalOwnerRoot(explicitRoot)` | `document.querySelector?.(".rg-root:focus-within")`, `document.querySelector?.(".rg-root")` | pseudo-class + class |
| 4770, 4771 | `releaseRichCellHosts(container)` | `container.matches?.(".rg-cell-content")`, `container.querySelectorAll?.(".rg-cell-content")` | class |
| 5822 ×2 | `GridView.patchRowDeletion(context)` | `cell?.querySelector?.(":scope > .rg-cell-content")`, `cell?.querySelectorAll?.(".rg-cell-content")` | `:scope` combinator + class |
| 5874 | `GridView.startColumnResize(…)` | `pointerTarget?.closest?.(".rg-cell")` | class |
| 5941 | `GridView.startRowResize(…)` | `pointerTarget?.closest?.(".rg-cell")` | class |
| 5981 | `GridView.cellElement(…)` pointerdown handler | `event.target.closest?.(".rg-editor")` | class |
| 6045 | `GridView.updateCellReferenceCount(cell, uid)` | `cell.querySelector?.(".rg-cell-reference-count")` | class |
| 6071 | `GridView.updateCellCommentCount(cell, uid, …)` | `cell.querySelector?.(".rg-cell-comment-count")` | class |
| 6111 | `GridView.referenceBadge(uid)` | `this.cellForUid(uid)?.querySelector?.(".rg-cell-reference-count")` | class |
| 6115 | `GridView.commentBadge(uid)` | `this.cellForUid(uid)?.querySelector?.(".rg-cell-comment-count")` | class |
| 6260 | `GridView.onCommentPointerOver(event)` | `event?.target?.closest?.(".rg-cell")` | class |
| 7006, 7007 | `RangeGridView.onClick(event)` | `event.target?.closest?.(".rg-range-source")`, `event.target?.closest?.(".rg-cell")` | class |
| 7251 | `LargeGridView.renderVisible(…)` pointerdown handler | `event.target.closest?.(".rg-editor")` | class |
| 7494 | `activeGridUid()` | `document.activeElement?.closest?.("[data-roam-grid-uid]")` | attribute |
| 7501 | `activeMount()` | `document.activeElement?.closest?.("[data-roam-grid-uid]")` | attribute |
| 7609, 7610 | `nativeTablesWithin(root)` | `root.matches?.(".rm-table")`, `root.querySelectorAll?.(".rm-table")` | class |
| 7616 | `nativeTableInstanceInfo(nativeElement, …)` | `nativeElement.closest?.(".rm-block-ref[data-uid]")` | class + attribute |
| 7684, 7685 | `rangeButtonsWithin(root)` | `root.matches?.(RANGE_BUTTON_SELECTOR)`, `root.querySelectorAll?.(RANGE_BUTTON_SELECTOR)` | class |
| 7703 | `rangeInstanceInfo(button, …)` | `button.closest?.(".rm-block__input")` | class |
| 7747 ×2 | `containsRenderedBlockReference(node)` | `node.matches?.(".rm-block-ref")`, `node.querySelector?.(".rm-block-ref")` | class |
| 7769 | `isBlueprintPortal(node)` | `node.matches?.(".bp3-portal")` | class |
| 7809 | `installPortalObservers(…)` | `ownerDocument.querySelectorAll?.(".bp3-portal")` | class |
| 7824 | `scanMounts()` (native-mount failure cleanup) | `nativeElement.parentElement?.querySelector?.(".rg-root")` | class |
| 7838 | `scanMounts()` (range-mount failure cleanup) | `button.parentElement?.querySelector?.(".rg-range")` | class |

Where a leading `receiver?.` also appears (e.g. `document.activeElement?.closest?.(…)`,
`cell?.querySelector?.(…)`), that first `?.` is legitimate per the Group 1 rule — the
receiver really can be `null` (no focused element, no cell at that coordinate) — only the
**second** `?.`, guarding the method call itself, is the vacuity risk catalogued here.

### Which MiniDOM methods are missing

There is no single shared DOM test double. At least five independently hand-rolled fake
node shapes exist across the suite, with inconsistent coverage of the four methods above:

| Test file | Fake | `closest` | `matches` | `querySelector` | `querySelectorAll` | Selector support |
|---|---|---|---|---|---|---|
| `test/keyboard-ownership.test.js` | `Node` (`matchesSelector` helper) | yes | yes | yes | yes | class, attribute (`[x]`, `[x=y]`, `[x^=y]`), tag name, comma-lists — the fullest of the five |
| `test/comments.test.js` | `MiniNode` | yes | yes | yes | yes | class selectors only (`part.startsWith(".")`); anything else (tag, attribute, `:scope`) silently fails to match |
| `test/range-reference.test.js` | `MiniNode` | yes | yes | yes | yes | class selectors only, plus one hardcoded `:scope >` case in `querySelectorAll` |
| `test/editor-dom.test.js` | `MiniNode` | **no** | yes | yes | yes | class selectors only; no `closest` method at all, so any `?.closest?.()` against this fake returns `undefined` unconditionally, method-present-or-not |
| `test/settings.test.js` | `makeElement()` | no | no | no | no | only `classList` and `style` are implemented — a stand-in for `view.root`/`mount.root` in settings-application tests, not a DOM traversal target |
| `test/mounting.test.js` | ad hoc literals, one shape per test (no shared class) | sometimes (`closest: () => null` or a selector-specific closure) | sometimes (`matches: (selector) => selector === "…"`) | rarely (`querySelector: () => cell`) | never | each literal implements only the single method its own test expects to be called — a stray `?.`-guarded call to any other method on the same fixture silently no-ops rather than failing |

Two independent gaps compound here: (1) whether the method exists on the fake at all
(`editor-dom.test.js`'s `MiniNode` has no `closest`; `mounting.test.js` literals implement
one method each), and (2) whether the fake's `matches()` can evaluate the selector actually
used in production. Three of the five fakes only match bare class selectors — every row
above flagged `attribute`, `tag`, `pseudo-class`, or `:scope` in "Selector kind" would fail
to match against those fakes even if the method were present and called unconditionally.
`nativeTableInstanceInfo`, `activeGridUid`/`activeMount`, `uidFromFocusTarget`, and
`portalOwnerUid` are the sites most exposed to this, since their selectors are
attribute-based (`[data-uid]`, `[data-rg-owner]`, `[data-roam-grid-uid]`,
`[id^='block-input-']`).

### What a real fix would require

1. **One shared DOM test double**, not five. Consolidate on `keyboard-ownership.test.js`'s
   `Node` (the only one with attribute-selector and tag-name support) as the base, move it
   to a shared test helper module, and migrate `comments.test.js`, `editor-dom.test.js`,
   `range-reference.test.js`, and the ad hoc `mounting.test.js` literals onto it. Without
   this, dropping any of the ~40 `?.`s below just trades a silent no-op for a crash the
   first time a test exercises the path against an under-featured fake.
2. **Add `closest` to `editor-dom.test.js`'s `MiniNode`** (or replace it with the shared
   double) before touching the two sites that route through it — otherwise removing the
   `?.` turns every editor-dom test that reaches those call paths red for a reason unrelated
   to the bug being tested.
3. **Extend `matches()`/selector support** to cover attribute and tag selectors everywhere
   the shared double is used — `startsWith(".")`-only matching silently mismatches
   `[data-uid]`, `[data-rg-owner]`, `[id^='block-input-']`, `[data-roam-grid-uid]`,
   `[role='gridcell']`, and bare tag names (`td`, `th`), all of which appear in the
   production selectors above.
4. **Then drop each `?.`** (`receiver.method?.()` → `receiver.method()`), one group at a
   time as in Group 1, running the gate after each group — a test that goes red at that
   point was relying on the vacuity and is a real finding, not a regression to paper over.
5. **Re-verify intent, not just green.** Because the second `?.` has been masking whether
   these branches were ever really exercised, a currently-passing test suite is not proof
   the branch behavior is correct — each site's test coverage should be checked for a
   positive control (a fixture that should match) in addition to the existing negative
   cases, the same requirement GOAL-2F's capture test already established for ordering
   traps.
6. **Literal fixtures in `mounting.test.js` need the most care**: because each is
   purpose-built with exactly the one method its test expects, migrating them to the shared
   double will change what other methods on the same object resolve to (from `undefined`
   under `?.` to a real implementation) — existing assertions should be re-read against the
   new behavior, not just re-run.
