# Correctness review — Roam Grid v0.9.0 campaign

Reviewer: opencode (Kimi K3), full read of `reviews/branch-2026-08-05/diff.txt` plus targeted
reads of `src/extension.js` for every hunk flagged below.

## Invariant scorecard

1. **Undo never silently overwrites external values** — holds for op-based entries on both
   `applyInverse` and `applyForward` (`applyUndoOps` drops stale `setRaw` ops, src/extension.js:1424).
   **Violated for checkpoint-restoring entries** — see "Checkpoint restore" below.
2. **History survives replaceModel / idle disposal / remapUids / self-echoes** — holds.
   `replaceModel` re-attaches the shared history (3283); `disposeNativeSession` never releases it
   (7650-7657, release only on unenhance at 7523 and onunload); echoes are filtered by the
   raw-equality check before `onExternalContent` (3444-3452).
3. **sameShape fast path after remap** — holds. `remapUids` is called on both mint paths
   (reconcile at 3086, flushSave at 3443) and also rewrites `shapeSignature`, so
   `persistModel`'s uid comparison (2984) stays aligned.
4. **queueChangedCells after inverse** — holds. `settleHistoryApply` always calls it (3540) and
   the base-equality delete (3326) removes the pre-undo dirty entry.
5. **Discarded-edit capture before replaceModel** — holds in both the structural branch (3421)
   and the content-conflict branch (3447).
6. **Synchronous added-node decoration discovery** — holds for the new portal path
   (`handlePortalMutations`, 7764-7766). The removal-only full-document scan at 7760 is
   pre-existing context, not new code.

---

## RangeGridView can own the keyboard but has no `onKeydown`, `undo`, or `redo` — every keystroke throws

**File:** src/extension.js:3955 (also 3959, 3935, 6861, 7502)
**Severity:** critical
**What is wrong:** `RangeGridView` sets `this.root.__rgView = this` (6861) on a root that carries
the `.rg-root` class. `onGlobalPointerDown` claims any `.rg-root` as keyboard owner (3935), and
`onGlobalKeydown` then calls `owner.view.onKeydown(event)` unconditionally for non-undo keys
(3955) and as the fallback for ⌘Z when `undo` is missing (3959). `RangeGridView` implements
neither method. Two more paths reach the same gap: `activeMount()` returns the range view when
focus is inside it (7502), so the "Roam Grid: Undo"/"Roam Grid: Redo" commands throw; and
`RangeGridView.dispose` (7011) never calls `releaseKeyboard(this)`, unlike `GridView.dispose`
(6820) and `LargeGridView.dispose` (7396).
**Failure scenario:** Mount `{{roam-grid-range: ((tableUid)) A1:B2}}` for an enhanced table, click
the rendered range (it becomes keyboard owner), press any key — `TypeError: owner.view.onKeydown
is not a function` from the capture-phase window listener, once per keystroke. ⌘Z does the same.
With focus on the range, run "Roam Grid: Undo" from the command palette — `mount.undo is not a
function` in `commandOnActive`. After the range unmounts while owning the keyboard, ownership
leaks until the next pointerdown.
**Fix:** Don't claim keyboards for read-only surfaces: in `onGlobalPointerDown`, skip views
without `onKeydown` (e.g. `root.__rgView?.context === "range"` → `releaseKeyboard()`), and add
`releaseKeyboard(this)` to `RangeGridView.dispose`. Defensive minimum: guard
`typeof owner.view.onKeydown === "function"` at 3955/3959 and filter range views out of
`activeMount`.

## Preview-surface grids still allow destructive edits — only `beginEdit` is gated

**File:** src/extension.js:6449 (Delete/Backspace), 6473→6515 (⌘X → `clearSelection`), 6476 (`onPaste`)
**Severity:** critical
**What is wrong:** The `surface === "preview"` guard was added to `beginEdit` only (6415).
A Blueprint hover preview of an enhanced table mounts a full `GridView` (portal observers make
this the common case now), and every destructive key path bypasses the guard: Delete/Backspace →
`clearSelection` → `commitMutation("Clear cells", …)` empties cells in the source table; ⌘X cuts;
⌘V pastes a matrix (or a range component) into the source table.
**Failure scenario:** Hover a `((block-ref))` to an enhanced table. The preview grid appears.
Click a cell (this also claims the keyboard), press Delete — the source table's cell is cleared
and persisted by the shared session, on a surface the user treats as transient and read-only.
The preview then vanishes on mouseout, leaving no UI trace of what happened.
**Fix:** Return early from `onKeydown` and `onPaste` when `this.surface === "preview"` (or gate
`commitMutation` itself on surface), matching the `beginEdit` guard.

## Checkpoint-restoring undo entries can silently overwrite external edits (invariant 1)

**File:** src/extension.js:1406-1421 (`restoreCheckpointKeepingStale`), 1578-1589 (`onExternalContent`), 1479-1487 (`buildUndoEntry`)
**Severity:** warning
**What is wrong:** `entry.stale` is only populated for uids that appear in an `entry.inverse`
`setRaw` op (1578-1584). A checkpointed entry's snapshot covers **every** cell, but cells the
original mutation didn't touch appear in no inverse op, so an external edit to such a cell never
marks the entry stale. `restoreCheckpointKeepingStale` then restores the checkpoint wholesale and
only re-applies current values for uids in `stale` — the external value for an untouched-cell is
overwritten silently, exactly the failure invariant 1 forbids for checkpoint entries. `touched`
(1485) has the same blind spot, so `onExternalStructural`'s redo bookkeeping undercounts too.
**Failure scenario:** (Latent today — see below.) A checkpointed entry exists covering cells
C1..C9; the mutation only rewrote C1. An external writer edits C5. `onExternalContent` finds no
`setRaw` op for C5 in `entry.inverse` → not stale. User undoes → checkpoint restore reverts C5 to
the pre-mutation value, clobbering the external edit with no toast and no drop record.
**Latency note:** I could not find a UI path that produces a checkpointed entry: no caller passes
`hard: true` (`transact` is called only at 3305 and 4075), and every built-in shape mutation
records a shape op, so `reshaped` at 1479 is always false. If checkpoints are intentionally
unreachable, the dead `checkpoint`/`forwardCheckpoint`/`restoreCheckpointKeepingStale` machinery
(including the `enforceLimits` eviction at 1523-1526) should be removed; if they are the escape
hatch for future unrecorded reshapes, fix `onExternalContent` to stale-mark any changed uid that
exists in `entry.checkpoint`'s rows, not just uids named in inverse ops.

## `editing-capture-undo: off` still records external-edit entries

**File:** src/extension.js:3454-3456 (`handleExternalChange` non-conflict path) vs 1748
**Severity:** warning
**What is wrong:** Local mutations respect the switch (`getSetting("editing-capture-undo")` gates
`buildUndoEntry` at 1748), but the external-content entry is pushed unconditionally:
`if (externalEntry) this.history.pushUndo(externalEntry)` with no setting check. The switch's
label is "Capture grid undo history" — with it off, ⌘Z is still live and reverts external edits
while the user's own edits leave no trail, the most surprising possible combination.
**Failure scenario:** Turn "Capture grid undo history" off. Edit cell A1 (not recorded). Another
device edits A2; the merge pushes an "External edit" entry. Press ⌘Z expecting nothing — A2's
external value is reverted and your A1 edit cannot be redone/undone at all.
**Fix:** Gate the `pushUndo` on the same setting (or document that the switch only covers local
edits and rename it accordingly).

## Theme switch back to "Follow Roam" leaves large grids on the stale pinned palette

**File:** src/extension.js:4191-4195 (`resyncGridTheme`)
**Severity:** warning
**What is wrong:** `appearance-theme` propagates to large mounts via `resyncGridTheme(mount)`,
but `LargeGridView` has no `themeBridge` (only `GridView` 5497 and `RangeGridView` 6872 create
one), so the `themeBridge.sync()` branch is skipped and the function returns `null` whenever the
palette is *not* pinned. The large grid keeps the previously pinned Light/Dark values applied by
`applyGridThemeValues` at mount (7153).
**Failure scenario:** Set Theme = Dark (large grid repaints dark). Set Theme = Follow Roam with
Roam in light mode — native grids resync from the host; the large grid stays dark until the
extension reloads.
**Fix:** When unpinned and the surface has no theme bridge, re-derive from the host
(`syncGridThemeFromHost(null, mount.root)`) or clear the applied custom properties so the CSS
fallbacks take over.

## `restoreCheckpointKeepingStale` over-reports "kept" cells

**File:** src/extension.js:1413-1420
**Severity:** suggestion
**What is wrong:** `dropped.push(uid)` runs before the `cell.raw === raw` no-op check, so a stale
uid whose checkpoint value already equals the externally written value is counted as "kept
elsewhere" even though nothing was preserved or dropped.
**Failure scenario:** Stale uid where checkpoint already contains the external value → undo →
toast claims "1 cell changed elsewhere and was kept" despite a no-op.
**Fix:** Move `dropped.push(uid)` after the equality check.

## An exception during undo/redo loses the entry entirely

**File:** src/extension.js:3524-3536 (`NativeGridSession.undo/redo`), 1766-1779 (`GridModel.undo/redo`)
**Severity:** suggestion
**What is wrong:** The entry is popped before `transactSilently` runs; if the apply throws
(`#run` rethrows after restoring), the entry is in neither stack. I could not construct a
realistic throw from current op types (only the unknown-op guard at 1522 throws), hence
suggestion.
**Failure scenario:** Not constructible with today's op set; a future op that throws mid-apply
would silently burn the entry.
**Fix:** Wrap the apply in try/catch and re-push the entry to the stack it came from on error.

## Range-mount failure cleanup can remove a sibling's healthy range view

**File:** src/extension.js:7852 (in `scanMounts`)
**Severity:** suggestion
**What is wrong:** On mount failure the cleanup runs
`button.parentElement?.querySelector?.(".rg-range")?.remove()` — `querySelector` returns the
first `.rg-range` under the parent, which may be a different, healthy range view mounted on a
sibling button. The orphaned view stays registered until `cleanupDisconnectedViews` catches it,
then re-mounts — a visible flicker and a wasted session attach/detach cycle.
**Failure scenario:** Two range components in the same block container; the second one's session
load throws → the first one's root is removed while its view object lives on.
**Fix:** Remove only the root belonging to the failed mount
(`runtime.viewsByNative.get(button)?.root` or a root created in this attempt), not a selector
match.
