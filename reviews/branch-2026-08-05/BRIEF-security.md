# Review brief — SECURITY & PERFORMANCE (Roam Grid v0.9.0)

You are reviewing a browser extension that will be submitted to the Roam Depot marketplace
and manually security-reviewed by the Roam team. This is the author's own code; a thorough
security review is exactly what is wanted.

Read `reviews/branch-2026-08-05/diff.txt`. Full file: `src/extension.js`. CSS: `extension.css`.

## Security questions
- Any injection surface? Datalog queries are built in `getTree`, `queryBlockReferenceCounts`,
  `queryCommentThreadIndex`. Are uids bound as `:in` parameters or interpolated into strings?
- Two `innerHTML` sinks exist (chart rendering, third-party cell renderer). Is every
  interpolated value numeric or escaped?
- Any `eval`, `new Function`, external HTTP import, or network call? There should be ZERO.
- localStorage writes: what is stored, can it be poisoned, what happens on corrupt JSON?
- The extension injects a document-global `<style>` that HIDES native Roam UI for a cached
  list of uids. Can a corrupted cache hide unrelated content? Is it removed on unload?
- Does anything write to the user's graph without explicit user action?

## Performance questions
- Anything on the per-keystroke path that should not be: datalog queries, `getComputedStyle`,
  forced layout, full re-renders?
- MutationObserver scopes — are any observing more than they need?
- Unbounded growth: caches, Maps, Sets, arrays, listener registrations, timers.
- Listener/observer/timer leaks: is every one paired with a disposer reachable from `onunload`?

Report per issue with file:line, severity, concrete impact, and a specific fix. Say plainly
when something is FINE — a clean bill on a specific question is useful signal.
Write to `reviews/branch-2026-08-05/review-security-perf.md`.
