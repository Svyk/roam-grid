# Architecture review — Roam Grid v0.9.0 (branch-2026-08-05)

## Finding 1: View contract is entirely implied — RangeGridView correctness is manual and fragile

**Area:** runtime.views heterogeneity  
**Severity:** Medium

`runtime.views` is a `Set` holding both `GridView` and `RangeGridView`. Nothing in code declares what a "view" must implement. The contract is distributed across call sites:

| Fan-out site | Location | Required method/property | RangeGridView has? |
|---|---|---|---|
| `session.replaceModel()` | :3284 | `.render()`, `.model` | yes |
| `session.renderStructural()` | :3291 | `.patchRowDeletion()`, `.render()` | stub returns false |
| `session.refreshValues()` | :3300 | `.refreshValues()` | yes |
| `session.refreshCellBadges()` | :3238 | `.updateReferenceCountBadges(changed)` | stub returns false |
| `session.refreshCommentThreads()` | :3256 | `.updateCommentBadges?.(changed)` | absent (uses `?.`) |
| `applySettingsChange` | :320 | `onView: (view) => view.refreshFormulaTint()` | yes |
| `applySettingsChange` | :320 | `onView: (view) => view.updateReferenceCountBadges()` | stub (no-op) |
| `applySettingsChange` | :320 | `onView: (view) => applyToolbarPreset(view.root)` | has `.root` but no toolbar |
| `cleanupDisconnectedViews()` | :7727 | `.root`, `.nativeElement`, `.dispose()` | yes |
| `getOrCreateNativeSession` | :7668 | editorFinished, removeView | not called in paths that reach RangeGridView |

RangeGridView survives this through deliberate stubs at lines 6996–7003 and the session's use of `?.` at line 3258–3259. But the stubs exist because someone read ALL the fan-out sites — there is no single place to check.

**Cost:** Adding a new method to `NativeGridSession` that iterates `this.views` silently breaks RangeGridView. Adding a new view type forces a full audit of every session method and every `applySettingsChange` callback. The `onView` lambdas in `SETTINGS` are especially dangerous — a new `onView: (view) => view.someMethod()` added to a setting will fail at runtime on every loaded range excerpt.

**Fix:** Extract the view contract into a JSDoc `/** @interface */` block or a flat comment at the top of the `GridView` class listing required methods and properties. Add a `rangeGridViewExports` helper that returns `{ proper: "stub" }` for contractual clarity, or at minimum add a lint-time contract check: a map of contract entries → `assert(hasMethod(view, name))` in `addView`.

---

## Finding 2: LargeGridView has no theme bridge — "Follow Roam" setting is ignored

**Area:** Theme infrastructure  
**Severity:** Medium

`GridView` and `RangeGridView` both use `createGridThemeBridge` (:5497, :6872), which observes Roam's theme changes and syncs CSS custom properties to the grid root. `LargeGridView` uses a radically simpler path (:7148–7149):

```js
const pinnedTheme = pinnedGridThemePalette();
if (pinnedTheme) applyGridThemeValues(this.root, pinnedTheme);
```

It only applies a theme when the user explicitly picks "Light" or "Dark." When set to "Follow Roam", no theme properties are written at all — the large grid falls back to hardcoded CSS defaults. When the Roam theme changes while a large grid is open, it gets zero updates.

The settings dispatch for theme changes calls `resyncGridTheme(mount)` (:74), which does `mount.themeBridge?.sync()` — but `LargeGridView` has no `themeBridge` property, so the call silently does nothing.

**Cost:** A user on the "Follow Roam" theme who switches between light and dark Roam themes while a large grid is active sees the large grid stay in whatever colors were the CSS defaults, likely mismatched with the surrounding UI.

**Fix:** Either give `LargeGridView` a `createGridThemeBridge` instance (the function expects a `nativeElement`; the large-grid marker block would work), or at minimum call `syncGridThemeFromHost` once on mount to import initial values. Document the `themeBridge` property as part of the contract in finding 1.

---

## Finding 3: Cleanup runs through two independent paths that hold inconsistent state

**Area:** Registries — lifetimes and ownership  
**Severity:** Medium

The cleanup topology:

```
// Path A — disconnected-view cleanup (called after every scanMounts)
cleanupDisconnectedViews() {
  for (view in runtime.views)      // removes views from runtime.views, disposes them
  for (session in runtime.sessions) // calls disposeNativeSession(uid, true) for orphaned sessions
  for (mount in runtime.largeMounts) // disposes stale mounts
}

// Path B — explicit disposal (called from onunload, external-content handler)
disposeNativeSession(uid, releaseNative) {
  for (view in session.views)      // removes from runtime.views, disposes
  session.dispose()
  runtime.sessions.delete(uid)
}
```

The two paths agree on the final state but disagree on the `releaseNative` flag. Path A passes `releaseNative: false` to `view.dispose()` for individual views but `releaseNative: true` to `disposeNativeSession` (which is a no-op since the session already has zero views by that point). Path B uniformly uses whichever flag the caller passed.

More importantly, `cleanupDisconnectedViews` calls `disposeNativeSession(uid, true)` only for sessions whose table UID is no longer in `runtime.metadata`. A session whose metadata was garbage-collected but whose table UID was reassigned will never be cleaned up by Path A — it survives until `onunload`.

**Cost:** On a graph with many tables created and deleted over a long session, sessions accumulate in `runtime.sessions` until metadata pruning catches up or the extension unloads. Each retained session holds a pull watch, dirty-cells trackers, and timers.

**Fix:** Give `cleanupDisconnectedViews` a timeout-based fallback — if `runtime.views` is empty for a session, and the session has been in that state for > session-idle-ms, dispose it regardless of metadata. The idle timer in `NativeGridSession` already does this for views reaching zero count; the disconnect path should mirror it.

---

## Finding 4: Native and large-grid paths share GridModel but diverge on every operational concern — undo, save, merge, and paste are duplicated

**Area:** Two-tier storage  
**Severity:** High

The architectural intent (docs/ARCHITECTURE.md:44–52) describes one `NativeGridSession` owning the persistence queue, undo, and pull-watch for native tables. Large grids use no session at all. Comparison:

| Concern | Native (via session) | Large (via LargeGridView) |
|---|---|---|
| Persistence | NativeTableAdapter → save block strings | LargeGridStore → upload JSON chunks |
| Undo | UndoHistory (100 entries, 8 checkpoints) | None (:382) |
| Pull-watch | adapter.watchExternal → handleExternalChange | None |
| Comment threads | session comment index | None (explicitly omitted, :7154) |
| Paste | GridView.onPaste → commitMutation → session | LargeGridView.onPaste (:7341) — separate implementation |
| Merge | GridView.mergeSelection → commitMutation → session | LargeGridView.merge (:7379) — separate implementation |
| Export | GridView exports through session model | LargeGridView.exportSelection (:7386) — separate implementation |
| Save debounce | session.saveTimer + markChanged | own saveTimer + scheduleSave (:7384) |

The split is principled where storage is different (save/load). It is NOT principled where logic is the same but separately implemented: paste, merge, unmerge, and export. The paste paths are 30+ lines each and share no code.

The undo gap is the biggest cost. A user deletes a row in a large grid and has no `⌘Z`. The code has a TODO-like comment in the architecture doc ("large grids have no undo yet") but the brief should reflect that this is a major feature gap, not a minor omission.

**Cost:** Every paste/merge/export bug must be fixed twice. Adding features like block-reference paste or clipboard image handling requires parallel implementation. The undo absence is user-facing data loss risk.

**Fix:** Extract shared paste/merge logic into standalone functions that accept a `{ getRaw, setRaw, mergeAt, rowCount, colCount }` interface. Both GridView.commitMutation and LargeGridView can call them. For undo, `LargeGridStore` could carry a `GridModel` skeleton for the visible window and delegate through an `UndoHistory` — it already has the merges/alignments in the manifest.

---

## Finding 5: Settings dispatch fires onView callbacks at RangeGridView for toolbar and comment badges — harmless now, brittle later

**Area:** Settings dispatch soundness  
**Severity:** Low

`applySettingsChange` (:310–323) walks `runtime.views` and calls every `onView` handler. `runtime.views` contains `RangeGridView` instances. The following settings have `onView` callbacks that don't fully apply to range excerpts:

- `appearance-toolbar-preset` → `view => applyToolbarPreset(view.root)` — adds CSS classes to root; RangeGridView has no toolbar elements in its DOM.
- `appearance-reference-badges` → `view => view.updateReferenceCountBadges()` — RangeGridView returns `false` (no-op by design).
- `comments-enabled`, `comments-badges` → same as above.

All three are currently safe. The concern is forward-looking: a developer adding a new `onView` callback to a setting must remember that `runtime.views` is heterogeneous. The only enforcement is manual review.

The `apply` column in the schema (`"immediate"` vs `"next-op"`) is also misleading. `"immediate"` means "call the onView/onLarge/onSession callback right now." `"next-op"` means "the value is read at the next operation." But several descriptors (e.g. `sizing-min-col-width`, `appearance-show-headers`) have `apply: "next-op"` and no callbacks — which is correct, they're read live — but a reader scanning the schema might expect a callback.

**Fix:** This is architectural hygiene, not a bug. In `buildSettingsPanelConfig`, document the `apply` semantics in a JSDoc block. For RangeGridView safety, add a one-line comment on the `onView` key in `SETTINGS` entries: `// fired for GridView and RangeGridView`.

---

## Summary

| # | Area | Severity | Core issue |
|---|---|---|---|
| 1 | View contract | Medium | Implied contract at fan-out sites; fragile to extension |
| 2 | Theme bridge | Medium | LargeGridView ignores "Follow Roam" theme setting |
| 3 | Registry cleanup | Medium | Two cleanup paths; metadata-gated disposal can stall |
| 4 | Two-tier divergence | High | Paste/merge/export duplicated; no large-grid undo |
| 5 | Settings dispatch | Low | onView fires at RangeGridView; harmless now, brittle |

---

## Seams for bundler-based splitting (Q6)

If a bundler were introduced, the file splits naturally into these dependency layers:

| Layer | Lines | Exports | Depends on |
|---|---|---|---|
| 1. constants | 1–47 | VERSION, markers, sizing limits | nothing |
| 2. settings schema + cache | 48–400 | SETTINGS, getSetting, setSetting, applySettingsChange | layer 1 |
| 3. formula utilities | 486–860 | parseCellReference, formulaReferences, cycleFormulaReferenceLocks | layer 1 |
| 4. FormulaEngine + parser + dependency cache | 860–1260 | FormulaParser, FormulaDependencyCache, FormulaEngine | layer 3, layer 1 |
| 5. GridModel | 1625–2100 | GridModel, gridShapeSignature | layer 3, layer 1 |
| 6. UndoHistory | 1300–1620 | UndoHistory, applyUndoOp, restoreCheckpointKeepingStale | layer 5, layer 1 |
| 7. Adapters (NativeTableAdapter, MetadataStore, GridTemplateStore) | 2590–3125 | NativeTableAdapter, MetadataStore | layer 5, Roam API wrappers, layer 1 |
| 8. NativeGridSession | 3136–3620 | NativeGridSession | layer 5–7, layer 4, layer 2 |
| 9. GridEditorController | 4925–5440 | GridEditorController | layer 5, layer 4, layer 2 |
| 10. Theme + layout + rich-render utilities | 4123–4900 | themeBridge, toast, renderCell helpers | layer 2, layer 1 |
| 11. GridView + RangeGridView | 5443–7035 | GridView, RangeGridView | layer 7–10, layer 5 |
| 12. LargeGridStore + LargeGridView + AsyncFormulaEngine | 3628–3850, 7033–7397 | LargeGridStore, LargeGridView | layer 5, layer 2, Roam API wrappers |
| 13. Mount/scan/lifecycle + public API | 7586–8000 | onload, onunload, scanMounts | layer 10–12, layer 7–8 |

The natural seams are: constants+settings, formula, model+undo, adapters, session, theme+DOM-util, views (native+range), large-grid, and lifecycle. Layers 6–12 form a diamond: GridModel is used by both the native path (session→GridView) and the large path (store→LargeGridView). A bundler would resolve this with a shared GridModel module.
