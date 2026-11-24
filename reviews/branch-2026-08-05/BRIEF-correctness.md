# Review brief — CORRECTNESS (Roam Grid v0.9.0 campaign)

You are a senior engineer reviewing a large change to a Roam Research browser extension.
Scope: **correctness, bugs, edge cases only.** Not style, not architecture, not security.

Read `reviews/branch-2026-08-05/diff.txt` (the full source + CSS diff, ~4000 lines).
The full current file is `src/extension.js` — read it for context around any hunk.

## What this change did
Sixteen commits: deleted a dead duplicate persistence lane; added a rebasable inverse-op
undo history that survives model replacement and session disposal; explicit keyboard
ownership; MutationObservers for Blueprint portals; a settings schema + live wiring;
native Roam comment threads per cell; live read-only range views; recovery of edits
discarded by a conflict reload.

## Invariants the code is SUPPOSED to hold — check each one actually does
1. An undo NEVER silently overwrites a value written elsewhere. `entry.stale` marks uids an
   external edit touched; applying an inverse must DROP those `setRaw` ops and report them.
   This must hold for op-based entries AND checkpoint-restoring entries, on both
   `applyInverse` and `applyForward`.
2. Undo history survives: model replacement (`replaceModel`), session disposal after 1500ms
   idle, uid remapping (`remapUids`), and self-echoes of our own writes.
3. After a uid remap, undo must keep `persistModel`'s `sameShape` fast path. Falling through
   to `reconcile` recreates every cell block and destroys inbound `((block-ref))`s.
4. `queueChangedCells()` after applying an inverse must remove the pre-undo dirty entry —
   otherwise the next keystroke flushes the undone value back to Roam.
5. Discarded-edit capture must run BEFORE `replaceModel`; after it, comparisons are vacuously
   equal and nothing is captured.
6. Decoration discovery is synchronous and scoped to added nodes. No debounced document scan.

## Report format, per issue
## [Title]
**File:** path:line
**Severity:** critical | warning | suggestion
**What is wrong:** concrete
**Failure scenario:** exact inputs/state -> wrong output. If you cannot construct one, say so
and downgrade to suggestion.
**Fix:** specific

Be adversarial but concrete. A finding without a reproducible failure path is a suggestion,
not a bug. Write your findings to `reviews/branch-2026-08-05/review-correctness.md`.
