# Security & Performance review — Roam Grid v0.9.0 (branch‑2026‑08‑05)

Reviewer lane: OpenCode (glm‑5.2). Scope: `src/extension.js` (8000 lines), the v0.9.0
diff (`reviews/branch-2026-08-05/diff.txt`), and `extension.css`. Every claim below is
pinned to `file:line` and分类ed FINE / NOTE / LOW / MEDIUM. No HIGH or CRITICAL findings.

The brief asked six security questions and four performance questions; this report
answers them in order.

---

## A. Datalog injection (`getTree`, `queryBlockReferenceCounts`, `queryCommentThreadIndex`)

**Verdict: FINE — every uid is bound as an `:in` parameter, not interpolated.**

| Function | file:line | Binding |
|---|---|---|
| `getTree`                   | `src/extension.js:2377` | `:in $ ?uid` ← `String(uid)` |
| `queryBlockReferenceCounts` | `src/extension.js:4547` | `:in $ [?uid ...]` ← `unique` array |
| `queryBlockReferenceSources`| `src/extension.js:4559` | `:in $ ?targetUid` ← `targetUid` |
| `blockPageUid`              | `src/extension.js:4639` | `:in $ ?uid` ← `target` |
| `commentAuthorTitle`        | `src/extension.js:4651` | `:in $ ?userUid` ← `String(userUid)` |
| `queryCommentThreadIndex`   | `src/extension.js:4676-4688` | `:in $ ?title` ← `COMMENTS_PAGE` constant, then `:in $ ?pageUid ?commentsPage` ← `page, commentsPage` |

`queryBlockReferenceCounts` even pre‑filters uids that start with `rg_` (locals) before
binding (`src/extension.js:4544`), so locally minted uids never reach the query.

### A.1 NOTE — pull‑watch entity string‑interpolates `tableUid` (LOW; not exploitable)

`NativeTableAdapter.watchExternal` (`src/extension.js:2827-2858`) builds the pull‑watch
entity as a string literal:

```js
const entity = `[:block/uid \"${this.tableUid}\"]`;   // src/extension.js:2830
```

Unlike the `q` queries, this is **not** an `:in`‑bound parameter. `roam().data.addPullWatch`
takes `pattern`/`entity` as plain strings and has no `:in` surface, so interpolation is the
only way to scope the watch. In practice `tableUid` is a Roam‑generated 9‑char UID taken
from the graph via `getTree`, never user‑typed free text, so it cannot carry a `"]`
breakout. Threat model: a graph collaborator who can write a block whose UID contains
`\"` would first have to defeat Roam's UID generator. Verdict: not exploitable, but
worth flagging because it is the one place the codebase departs from the parameterization
discipline the rest of the queries follow.

**Fix (optional, defense‑in‑depth):** validate `tableUid` against `/^[A-Za-z0-9_-]{1,32}$/`
before constructing `entity`, and throw a `GridError("TABLE_UID_INVALID", …)` otherwise.

---

## B. `innerHTML` sinks

### B.1 FINE — Chart SVG rendering (`src/extension.js:5606`, `renderChartSvg` at `2263`)

Every interpolated value in the SVG body is numeric‑coerced through `numeric()`
(`src/extension.js:848-853` → finite number or 0) or hardcoded:

- `y(value)` returns a finite number; `pad`, `width`, `height`, `barWidth`, `index` are arithmetic on finite numbers.
- `palette[index % palette.length]` (`src/extension.js:2287`) is a constant hex‑literal array; no user input.
- The one user‑facing field — `spec.title` — goes through `escapeHtml` (`src/extension.js:2250`, applied at `2309`).
- `type` (`String(spec.type || "line").toLowerCase()`) is only used in `includes(...)` branches and as the fallback inside the `escapeHtml(... \`${type} chart\`)` aria‑label; it is never interpolated raw.

A malicious `spec.title` containing `</svg><script>...` cannot break out: it is escaped.
A malicious `spec.type` cannot reach the body unescaped: it appears only in control‑flow
checks and inside the escaped aria‑label/title. Verdict: clean.

### B.2 NOTE — Third‑party cell renderer returns HTML by contract (LOW; trust boundary, not a bug)

`renderCellValue` (`src/extension.js:6015-6028`):

```js
const rendered = renderer.render({ raw, value, row, col, model: this.model });
if (rendered instanceof Node) content.replaceChildren(rendered);
else content.innerHTML = String(rendered ?? "");      // src/extension.js:6024
```

The `cellRenderers` registry starts empty (`src/extension.js:2317`) and is only mutated
through `registerCellRenderer` (`src/extension.js:4088`), which is exposed solely on the
public `window.roamGrid.v1` API (`src/extension.js:4082-4088`, mounted at `7966`). No
built‑in code registers a renderer that hits this branch — the extension's own cells go
through `renderStableCellContent` (`src/extension.js:6030`), which uses `textContent`
(`4855`) or delegates to Roam's own `ui.components.renderString` (`4834`).

So this `innerHTML` sink is **the renderer author's contract**: the registered renderer
opts into HTML output and owns its own escaping. This is the documented extensibility
surface, not a flaw in Roam Grid itself.

**Threat model:** registering a renderer requires running code in the extension context
(via `window.roamGrid.v1.registerCellRenderer`), at which point the attacker already has
graph‑level access and does not need this sink to do damage. The brief asks "is every
interpolated value numeric or escaped?" — for this sink the honest answer is **the renderer
author decides**. No values from grid cell contents reach this sink untransformed: `raw`
and `value` are passed to the renderer as arguments, not interpolated by Roam Grid.

**Recommendation:** add a one‑line note to the public API docs (e.g. README or
`docs/ARCHITECTURE.md`) stating that `registerCellRenderer` renderers returning a string
are trusted with the cell's HTML. No code change required.

---

## C. `eval` / `new Function` / external HTTP import / network calls

**Verdict: FINE — ZERO matches.**

A regex sweep for `\beval\s*\(`, `new Function`, `importScripts`, `import.meta`,
`require(`, `fetch(`, `XMLHttpRequest`, `navigator.send`, `WebSocket`, `EventSource`,
`new Worker`, `new SharedWorker` returned **no results** in `src/extension.js`.

The only "network" surface is Roam's own API, accessed via the `roam()` helper:
`roam().q`, `roam().data.addPullWatch`, `roam().data.pull`, `roam().data.block.create/update/move/delete`,
`roam().createPage`, `roam().file.upload`, `roam().file.get`, `roam().ui.components.renderString`,
`roam().ui.mainWindow.openBlock`. All blob/file URLs in the large‑grid path come from
`roam().file.upload` and are stored back into the manifest as Roam‑hosted file URLs
(`src/extension.js:3678-3686`); chunk fetches go through `roam().file.get`
(`downloadJson` at `3573-3575`). No `https://*` URL is ever constructed by the extension.

The browser‑side `URL.createObjectURL`/`URL.revokeObjectURL` pair (`src/extension.js:7400-7402`)
is for the local CSV/JSON export download only; the object URL is revoked 1 s later via
`trackedTimeout` (so unload also clears it).

---

## D. localStorage

**Verdict: FINE — three keys, all JSON‑parsed in try/catch with shape validation, all writes are
extension‑owned.**

Keys (all prefixed `roam-grid:`):

| Key | Read | Write | On corrupt JSON |
|---|---|---|---|
| `roam-grid:enhanced-uids:<graph>` | `readEnhancedUidCache` `src/extension.js:184-189` | `writeEnhancedUidCache` `191-195` | `catch { return new Set(); }`; non‑array also returns empty Set; entries filtered to `typeof uid === "string" && uid.length > 0` |
| `roam-grid:settings:<graph>`     | `readDeviceSettings` `src/extension.js:251-256` | `writeDeviceSettings` `258-263` | `catch { return {}; }`; non‑object / array shape rejected |
| `settingsVersion` + 36 setting keys (graph‑synced) | `readGraphSettings` `src/extension.js:265-275` via `extensionAPI.settings` | `setSetting` `292-303` via `extensionAPI.settings.set` | `extensionAPI.settings.get` per‑key; only `value != null` accepted |

### What is stored

- **enhanced‑uids** — a sorted array of Roam table UIDs the extension has previously
  rendered, for the pre‑paint guard (see §E). Source: `runtime.metadata` (graph‑owned) via
  `syncEnhancedUidGuard` (`src/extension.js:7601-7604`).
- **device settings** — only keys with `descriptor.scope === "device"`
  (`src/extension.js:260` filters by `SETTINGS[name]?.scope === "device"`). Unknown
  keys are dropped on write. Values were coerced by `coerceSetting` (`197-225`) before
  reaching the writer.
- **graph settings** — written via `extensionAPI.settings.set`, the standard Roam panel
  pattern (`src/extension.js:299`).

### Poisoning analysis

- A non‑extension process with localStorage access could write the `enhanced-uids` key
  with arbitrary strings. On reload, those uids are filtered (`typeof uid === "string"`
  + non‑empty), then CSS‑escaped via `cssAttributeValue` (`src/extension.js:167-169`:
  backslash‑doubled, double‑quotes escaped, `\n\r\f` stripped) before insertion into the
  pre‑paint guard selectors. A poisoned uid cannot break out of the attribute selector.
  The `MAX_GUARD_UIDS = 2000` cap (`src/extension.js:426-430`) skips the guard entirely
  when exceeded, so a poisoned huge array disables the pre‑paint flash suppression
  rather than hiding everything.
- A non‑extension process could write the `settings` key with arbitrary values. They
  flow through `resolveSettingValue` → `coerceSetting` (`src/extension.js:244-249`,
  `197-225`), which clamps ints to `[min, max]`, validates enums against the items list,
  coerces bools, and falls back to the descriptor default on any malformed value. A
  poisoned value never becomes a string that escapes its declared type.
- The graph‑synced settings path goes through `extensionAPI.settings`; this is Roam's
  own storage, not part of localStorage poisoning.

### What happens on corrupt JSON

`JSON.parse` is wrapped in `try { … } catch { return <safe default>; }` in both
readers. `readEnhancedUidCache` returns `new Set()`; `readDeviceSettings` returns `{}`.
Neither throws, neither leaks the corrupt JSON. Verdict: clean.

---

## E. Document‑global `<style>` that hides native Roam UI for cached uids

**Verdict: FINE — capped at 2000 uids, scoped to `.rm-table` only, escaped, and removed
on `onunload`.**

The guard lives in `enhancedUidGuardCss` (`src/extension.js:424-440`) and is installed
by `installEnhancedUidGuard` (`7592-7599`):

```css
[id$="<escaped-uid>"] .rm-table:not(.rg-native-hidden) { visibility: hidden !important; pointer-events: none !important; }
.rm-block-ref[data-uid="<escaped-uid>"] .rm-table:not(.rg-native-hidden) { … }
[data-uid="<escaped-uid>"] .rm-table:not(.rg-native-hidden) { … }
```

### Can a corrupted cache hide unrelated content?

The selectors target `.rm-table` (Roam's native table element) inside three matching
scopes — they cannot hide arbitrary blocks, text, images, or anything that is not a
`.rm-table`. A poisoned uid that happens to match an unrelated element with `id$=…` and
a `.rm-table` descendant would hide only that native table until `syncEnhancedUidGuard`
runs with the real `runtime.metadata` and reseeds the cache
(`src/extension.js:7601-7604`). If the metadata page is empty / unreadable, the guard
keeps the cached uids as‑is and a stale uid could keep hiding a table the user deleted.
Mitigations:

1. `MAX_GUARD_UIDS = 2000` cap skips the guard entirely (`427-430`) — the failure mode is
   *showing everything*, not *hiding everything*.
2. The visibility is `hidden`, not `display: none`, so layout is preserved and the table
   reappears once the guard is removed or the extension mounts (`rg-native-hidden`
   class swap on the live table).
3. The guard is removed on every `onunload` (`src/extension.js:7987`).
4. `maintenance-clear-caches` (`src/extension.js:7913`) removes the cache key entirely
   for users who notice a stale state.

The brief specifically asks "is it removed on unload?" — **yes**, `runtime.guardStyle?.remove()`
plus `runtime.guardStyle = null` (`7987`). Verdict: clean, with the `MAX_GUARD_UIDS` cap
as the documented safety net.

### E.1 NOTE — pre‑paint guard uses `visibility: hidden` with `!important`, so a transient bug in
mounting a grid would leave its native table permanently invisible until the next scan

The guard is reseeded every time `syncEnhancedUidGuard` runs, which happens on metadata
update and on `scheduleScan` accepted mounts. If the extension loaded the guard from a
stale cache and then failed to mount (e.g. the metadata entry was deleted between
sessions), the matching `.rm-table` stays hidden until the user opens the settings panel
or the next metadata refresh. This is the intended trade‑off (avoid the FOUC of a 200‑row
table flashing native before the grid mounts) and is recoverable, but worth noting because
it is the one place a stale cache visibly affects non‑extension content.

---

## F. Does anything write to the user's graph without explicit user action?

**Verdict: FINE — no content writes; settings seeding on first load is the only automatic
write, and it writes to the extension's settings namespace, not user blocks.**

I traced every callsite of `createBlock`, `updateBlock`, `moveBlock`, `deleteBlock`,
`createPage`, and `commitMutation`:

| Caller | file:line | User action |
|---|---|---|
| `flushContentSave` / `flushSave` | `3334`, `3382`, `3420` | Debounced writes after user edits to a grid cell |
| `applyCommentThreadPlan` (comment thread create) | `4619-4634`, called via `session.addCellComment` | ⌘⌥= (`src/extension.js:6441`) or the *Add comment* button (`6280`) |
| `restoreDiscardedEdits` | `3498-3514` | Toast "Restore" button or the "Roam Grid: Restore discarded edits" command |
| `createNativeTableFromModel` | `7416-7434` | "Native copy" toolbar button (`7151`) |
| Large‑grid `seed` / `commit` | `3672-3691`, `7385` | User edits / Save button |
| `pasteMatrix`, `pasteReferencedRange`, `mergeSelection`, etc. | `6505`, `6494`, `6519` | Paste, merge menu items, etc. |

### F.1 Settings seeding on first load (LOW; expected, not an issue)

`initializeSettings` (`src/extension.js:7937-7956`) writes:
- migration rows from `planSettingsMigration` (`237-241`): renames the legacy
  `nativeMutationBudget` to `writes-native-budget` and stamps `settingsVersion = 1`;
- every `SETTINGS` descriptor's `default` for descriptors that are not `stage: "pending"`
  and have no stored value.

These writes go through `extensionAPI.settings.set`, which is Roam's extension‑settings
storage (the panel row config backing store), not user content blocks. They happen exactly
once per graph on first load and are idempotent. The code is careful **not** to write
`stage: "pending"` rows even on reset (`src/extension.js:7922-7923`) — a pending
descriptor is reachable through `getSetting` but never appears in the panel, so it never
gets a default stamp that implies "the user chose this".

This matches the standard Roam extension pattern and is not a content write. Verdict:
clean. (Worth flagging in the writeup only because the brief explicitly asked "without
explicit user action", and `initializeSettings` is the closest thing to an automatic
write — but it's settings seeding, not graph mutation.)

---

## G. Per‑keystroke path

**Verdict: FINE — the global keydown listener does O(1) work; nothing on the typing path
runs a Datalog query, `getComputedStyle`, a forced layout, or a full re‑render.**

### The window‑level capture listener

`onGlobalKeydown` (`src/extension.js:3951-3963`) is the only `window`‑level `keydown`
listener the extension installs (`3966`). On every keystroke *anywhere on the page* it
does:

1. Read `runtime.keyboardOwner` (Map ref, O(1)).
2. If null (no grid owns the keyboard — the default when the user is typing in any Roam
   block, because `onGlobalFocusIn` releases ownership on `isRoamBlockInput` matches,
   `src/extension.js:3943-3944`), **return immediately**. No further work.
3. If a grid owns the keyboard:
   - For ⌘Z/⌃Z: check `isRoamBlockInput` / `isGridEditorInput` (two `closest()` calls)
     and dispatch `undo`/`redo`. These methods go through the history stack and
     `commitMutation`, which schedules a render — but only for the undo combo, not normal
     typing.
   - For every other key: `owner.view.onKeydown(event)` (`3955`).

`GridView.onKeydown` (`6437-6458`) is a flat switch on `event.key`: navigation mutates
`this.selection` and calls `moveSelection` (one `scrollIntoView`), and the only branches
that touch the model are explicit commands (⌘C, ⌘X, ⌘Z, ⌘⇧M, ⌘⌥=, Delete/Backspace,
Alt+Arrow move, plain‑char to enter edit mode). None of those branches issue a Datalog
query or call `getComputedStyle`.

### The cell‑editor keydown path

`GridEditorController.onKeydown` (`src/extension.js:5075-5118`) handles F4
(`cycleFormulaReferenceLocks`, a pure string transform), arrow‑key reference pointing
(`moveKeyboardReference`), suggestion list navigation, Escape/Enter/Tab. None of these
talk to Roam.

Reference autocomplete is **debounced** through `updateReferenceAutocomplete`
(`src/extension.js:5322-5339`): the search async runs inside
`this.referenceSearchTimer = setTimeout(..., this.searchDelay())` where
`searchDelay()` returns `editing-autocomplete-debounce-ms` (default 90 ms, `5344`). A
new keystroke increments `referenceSearchToken` and clears the timer (`5326`), so no
Datalog query fires per keystroke — only after the debounce.

### `getComputedStyle` / forced layout

`getComputedStyle` is called from:
- `syncGridThemeFromHost` (`src/extension.js:4239`) and `syncPortalThemeFromRoot` (`4367`),
  both wrapped in a `requestAnimationFrame`‑throttled `schedule` (`4284`, `4416`) that
  coalesces multiple triggers into one frame. Not on the typing path.
- Two resize handlers (`5879`, `5946`) that read `gridTemplateColumns`/`gridTemplateRows`
  during column/row drag — user‑initiated drag, not typing.

`renderVisible` for large grids reads `viewport.scrollTop`/`clientWidth`/`scrollLeft`
inside a `requestAnimationFrame` (`src/extension.js:7214-7218`), batched with a
`renderToken` invalidation. Triggered by scroll, not by keystroke.

### Full re‑renders

`renderStructural` is only triggered by a structural mutation, not by typing. Per‑keystroke
typing into a cell calls `renderCellValue` for one cell, plus `scheduleReferenceCountRefresh`
which is throttled by `requestAnimationFrame` + a 0 ms timeout
(`src/extension.js:3208-3219`) — exactly one refresh per paint, never per keystroke.

Verdict: clean.

---

## H. MutationObserver scopes

**Verdict: FINE — three observers, each scoped to the minimum it needs.**

| Observer | file:line | Target | Options | Handler does |
|---|---|---|---|---|
| `runtime.observer` (DOM) | `7971` | `.roam-app` \|\| `document.body` | `{ childList: true, subtree: true }` | `handleDomMutations` schedules a scan iff any `addedNodes` are present (`7750-7760`). Text edits in Roam blocks produce `characterData` mutations, **not** `childList`, so typing in a block does not fire this observer. |
| `runtime.portalBodyObserver` | `7801-7807` | `document.body` | `{ childList: true }` (no subtree) | Watches only direct children of body for `.bp3-portal` add/remove (`7768`, `7803-7804`). |
| Per‑portal observer (`attachPortalObserver`) | `7772-7778` | a single `.bp3-portal` | `{ childList: true, subtree: true }` | `handlePortalMutations` schedules an added‑node‑first scan (`7764-7766`). Necessary scope: hover previews can mount anywhere inside a portal. |
| Theme bridge observers | `4289-4296`, `4420-4425` | `documentElement`, `body`, and the closest `[data-theme]`/`[data-color-mode]`/`.bp3-dark`/`[class*='theme-']` ancestor | `{ attributes: true, attributeFilter: ["class", "style"] }` | Not subtree, not characterData. Minimum scope to detect theme swaps. |
| Portal theme bridge observer | `4420-4425` | the portal subtree | `{ attributes: true, attributeFilter: ["class", "style"] }` | Same discipline. |

The brief specifically asks "are any observing more than they need?" — No:
- The DOM observer is on `childList` only (no `characterData`/`attributes`), so the
  subtree filter is the cheapest possible way to catch both block inserts and table adds
  anywhere Roam mounts them. The handler's `addedNodes?.length` short‑circuit makes text
  edits free.
- The portal body observer is `childList: true` with no subtree — the smallest possible
  scope for detecting `.bp3-portal` mount/unmount on body.
- Theme observers are attribute‑filtered to `["class", "style"]`, not subtree — the
  smallest signal they need.

Verdict: clean.

---

## I. Unbounded growth

Three runtime structures that grow without bound during a session:

### I.1 MEDIUM — `LargeGridStore.cache` is an unbounded `Map<number, chunk>` (`src/extension.js:3634`, `3697`, `3707`)

A `LargeGridStore` instance keeps every chunk it has ever loaded in `this.cache`. The
cache is never pruned:

```js
async loadChunk(index) {
  if (this.cache.has(index)) return this.cache.get(index);     // 3697
  …
  this.cache.set(index, chunk);                                 // 3707
  return chunk;
}
```

For a 100 000‑row grid with the default 500‑row chunk size, that is 200 chunk objects,
each holding 500 × N strings. `large-cache-max-mb` (`src/extension.js:94`, default 256 MB)
exists in the settings schema but is `stage: "pending"` — it is reachable through `getSetting`
but never enforced anywhere in the code. Same for `large-cache-enabled` (`93`) and
`large-verify-checksums` (`95`). The promised chunk cache eviction is unwired.

**Concrete impact:** open a 100 000 × 26 large grid, scroll end‑to‑end, and the in‑memory
chunk cache holds the entire grid's data for the lifetime of the mount. With one large grid
open per graph, several simultaneously‑mounted graphs, and a long Roam session, this can
grow into hundreds of MB. The Map dies when `LargeGridView.dispose` → `store.dispose`
fires on unload (`src/extension.js:3641`, `7396`), and `runtime.largeMounts` drops the
store reference, so GC reclaims it — but **during** a long session the cache is monotonic.

**Fix:** implement the eviction the `large-cache-max-mb` setting already promises. The
simplest LRU: keep `this.cache` as a `Map` and on `loadChunk` hit, `delete` + `set` to
reorder to most‑recent; on miss, after `set`, evict the oldest entry while an estimated
byte size (sum of `JSON.stringify(rows).length` over cached chunks, or a chunk count cap
like `Math.max(8, large-cache-max-mb / chunkRowsFor(manifest) / colCount)`) exceeds the
configured budget. Mark the descriptors that are dirty and in‑flight so they are not
evicted mid‑write. Wire `large-cache-enabled` to disable caching entirely when off.

If the IndexedDB‑backed persistence implied by the `large-cache-*` settings is not
landing in v0.9.0, at minimum change the in‑memory `Map` to an LRU with a hard chunk
count cap so a single large grid cannot grow the heap unbounded.

### I.2 LOW — `redoEntries` array has no explicit cap (`src/extension.js:1537`)

`UndoHistory.pushRedo` (`1537`) does not call `enforceLimits()`:

```js
pushRedo(entry) { this.redoEntries.push(entry); return entry; }
```

`enforceLimits` (`1521-1527`) caps `entries` at `MAX_UNDO_ENTRIES = 100` and checkpoints
at `MAX_UNDO_CHECKPOINTS = 8` but ignores `redoEntries`. In practice `redoEntries` is
bounded *indirectly*: taking one undo (`3517-3523`) pops one entry off `entries` and
pushes one onto `redoEntries`, so `redoEntries.length` can never exceed the number of
entries that were on the stack at the first undo (≤ 100). Any new mutation calls `push`
which clears `redoEntries.length = 0` (`1531`); any external change calls
`invalidateRedo` (`1592`, `1606`) which also clears.

**Concrete impact:** routine use is bounded; a pathological script that called
`pushRedo` without a matching `popUndo` could grow it, but no code path does this.
At worst, a session that undoes a full 100‑entry stack and never edits again holds 100
`{ inverse, forward, checkpoint, forwardCheckpoint, stale }` objects — small,
bounded, GC‑able when the history is released. `MAX_UNDO_HISTORIES = 24` caps the number
of per‑table histories (`1617`), so even worst case across all grids is bounded.

**Fix (optional, defense‑in‑depth):** add `while (this.redoEntries.length > this.limit)
this.redoEntries.shift();` to `enforceLimits`, or call it from `pushRedo`. Trivial.

### FINE — every other long‑lived structure is bounded or self‑pruning

| Structure | file:line | Bound |
|---|---|---|
| `enhancedUidGuardCss` cache | `426` | `MAX_GUARD_UIDS = 2000`; cache is json‑array over localStorage |
| `UndoHistory.entries` | `1521-1527` | `MAX_UNDO_ENTRIES = 100` + `MAX_UNDO_CHECKPOINTS = 8` |
| `undoHistories` Map | `1617` | `MAX_UNDO_HISTORIES = 24` LRU |
| `discardedEdits` per session | `3484` | single payload, superseded by next, dropped on dispose; edits list capped at `MAX_DISCARDED_EDITS = 200` (`3110-3115`) |
| `portalObservers` Map | `7773-7786`, `7982` | entries added on portal attach, removed on detach; cleared by `disposePortalObservers` on unload |
| `rangeSpecs` Map | `143`, `7982` | cleared on unload; range components are bounded by what's rendered on the page |
| `pendingTimers` Set | `154` | self‑deleting on fire; cleared by `clearTrackedTimers` on unload |
| `selfWrites` Map (adapter) | `2730-2797`, `3095` | entries have `expires` timestamps; `consumeSelfWrite` prunes expired entries every read; cleared in `dispose` |
| `expectedStructuralTransitions` | `2814` | capped at 8 via `splice` |
| `dirtyCells` Map | `3155` | cleared on `commitMutation` flush and on `dispose` |
| `inlineReferenceDisposers` Set | `5477`, `6120-6150` | each disposer invoked on `closeInlineReferences` and on `dispose` |
| Theme bridge observers | `4289-4296` | `attributeFilter` + (no subtree); disposed via `themeBridge.dispose` from the owning view |

---

## J. Listener / observer / timer leaks reachable from `onunload`

**Verdict: FINE — every long‑lived registration is paired with a disposer reachable from
`onunload`, with one LOW finding on the large‑grid rAF.**

`onunload` (`src/extension.js:7981-7997`) runs, in order:

1. `runtime.observer?.disconnect()` — main DOM observer.
2. `disposePortalObservers()` (`7788-7791`) — disconnects `runtime.portalBodyObserver`
   and every per‑portal observer in `portalObservers`.
3. `runtime.pendingScanRoots.clear()`, `runtime.rangeSpecs.clear()`,
   `runtime.scanQueued = false`.
4. `for uid of runtime.sessions.keys(): disposeNativeSession(uid, true)` —
   `NativeGridSession.dispose` (`3554-3560`) clears `saveTimer`, `idleTimer`,
   `referenceCountTimer`, `referenceCountFrame` (via `cancelAnimationFrame`),
   invokes `adapter.dispose` (which calls the pull‑watch disposer, `3095`),
   clears `views`, `activeEditorView`, `dirtyCells`, `discardedEdits`.
5. `for mount of runtime.largeMounts.values(): mount.dispose()` — see J.1.
6. `clearUndoHistories()` — empties the `undoHistories` Map.
7. `settingsCache.clear()`.
8. `runtime.guardStyle?.remove(); runtime.guardStyle = null` — pre‑paint guard removed
   (the specific concern in the brief; see §E).
9. `for dispose of runtime.disposers.splice(0): try { dispose(); } catch {}` — runs
   every registered disposer, which covers:
   - `document.removeEventListener("focusin", rememberFocusedUid, true)` (`7968`)
   - `installKeyboardOwnership`'s disposer (`3969-3974`):
     `removeEventListener("keydown"/"pointerdown"/"focusin")` + `releaseKeyboard()`
   - `installCommentAffordance`'s disposer (`4005-4012`):
     `removeEventListener("keydown"/"keyup"/"blur"/"visibilitychange")`
10. `clearTrackedTimers()` — cancels every pending `trackedTimeout` (`4146`, `7402`).
11. DOM sweep for `.rg-toasts,.rg-dialog-overlay,.rg-context-menu` calling
    `element.__rgDismiss?.()` (`4471`, `4490`, `6612`, `6693`) or `element.remove()`.
12. `runtime.views.clear(); runtime.viewsByNative = new WeakMap()`; runtime metadata/
    templates/registries set to null.

### J.1 LOW — `LargeGridView.scheduleRender` issues an untracked `requestAnimationFrame`
that is not cancelled in `dispose` (`src/extension.js:7212-7218`, `7396`)

```js
scheduleRender() {
  const token = ++this.renderToken;
  requestAnimationFrame(() => {                              // 7214
    if (token !== this.renderToken) return;
    void this.renderVisible(token).catch(...);
  });
}
```

`LargeGridView.dispose` (`7396`) does not call `cancelAnimationFrame` on the pending
frame handle — it doesn't keep one. If a scroll fires `scheduleRender` and `dispose` runs
before the frame paints, the rAF callback still fires. The `token !== this.renderToken`
guard prevents stale renders from doing work *unless* `dispose` itself doesn't increment
`renderToken` (it doesn't) — so the in‑flight callback passes the guard and calls
`renderVisible`, which now runs against a disposed store:

- `this.store?.dispose()` already set `this.store.disposed = true` (`3641`).
- `renderVisible` awaits `this.store.getRaw(...)` → `loadChunk` checks
  `if (this.disposed) return chunk;` (`3706`) and returns whatever it has without
  caching. Then it operates on the now‑detached `this.canvas` (removed in `dispose` at
  `7396`). Most DOM writes silently no‑op on detached nodes.
- The `.catch` (`7216`) swallows any error and calls `toast(...)` — which, post‑unload,
  appends to `document.body` *after* the rest of `onunload` has cleaned up, producing a
  stray toast that no `__rgDismiss` callback will catch because the toast list itself was
  just swept (`7990-7992`).

**Concrete impact:** at most one spurious "Large grid render failed" toast after
unload, in the narrow race where unload happens between `scheduleRender` and the next
paint. Severity is LOW: it's a cosmetic post‑unload artifact, not a leak — the rAF fires
exactly once and the closure is then GC‑able.

**Fix:** store the rAF handle on `this` and cancel it in `dispose`, *and* check
`this.disposed` at the top of the callback:

```js
scheduleRender() {
  if (this.disposed) return;
  if (this.renderFrame != null) return;
  const token = ++this.renderToken;
  this.renderFrame = requestAnimationFrame(() => {
    this.renderFrame = null;
    if (this.disposed || token !== this.renderToken) return;
    void this.renderVisible(token).catch((e) => toast(`Large grid render failed: ${e.message}`, "danger", 8000));
  });
}
// in dispose:
if (this.renderFrame != null) globalThis.cancelAnimationFrame?.(this.renderFrame);
this.renderFrame = null;
```

### J.2 FINE — pull‑watch on the native adapter is reachable from `onunload`

`NativeTableAdapter.watchExternal` registers `roam().data.addPullWatch` and stores the
disposer as `this.watch` (`src/extension.js:2856-2858`). `NativeTableAdapter.dispose`
(`3095`) calls `this.watch?.()`, which is invoked from `NativeGridSession.dispose`
(`3559`), which is invoked from `onunload` step 4 above. Verified reachable.

### J.3 FINE — every document/window listener pushed to `runtime.disposers`

Every document‑ or window‑level `addEventListener` in the extension either:
- is created inside a menu/dialog scope that sets `__rgDismiss` and is swept by
  step 11 above (e.g. `6579`, `6636`), or
- pushes a disposer to `runtime.disposers` and is reached by step 9.

Spot checks:
- `installKeyboardOwnership` (`3965-3977`): 3 listeners, 1 disposer pushed.
- `installCommentAffordance` (`3998-4013`): 4 listeners, 1 disposer pushed.
- `rememberFocusedUid` (`7967`): 1 listener, 1 disposer pushed (`7968`).
- `LargeGridView` viewport scroll (`7190`), `pointerup` (`7190`): cleaned in `dispose`
  (`7396`), reached from step 5.
- Resize listeners on `window` and `viewport` from the editor controller (`5436-5437`):
  removed in `GridEditorController.dispose` (`5431-5440`), reached from `GridView.dispose`
  (`6817`) and `LargeGridView.dispose` (`7396`).
- Color‑scheme `matchMedia` listener (theme bridges `4302`, `4420`): removed in the
  theme bridge's `dispose` (`4312-4313`, `4442-4443`), reached from the owning view's
  `dispose`.

No orphaned document‑level listener found.

---

## Summary table

| § | Topic | Severity | Status |
|---|---|---|---|
| A   | Datalog `:in` parameterization | — | FINE |
| A.1 | Pull‑watch entity interpolates `tableUid` | LOW | NOTE (not exploitable, defense‑in‑depth only) |
| B.1 | Chart SVG `innerHTML` | — | FINE (all numeric/escaped) |
| B.2 | Third‑party renderer `innerHTML` | LOW | NOTE (renderer author's contract) |
| C   | `eval`/`new Function`/network | — | FINE (ZERO) |
| D   | localStorage: corrupt JSON, poisoning | — | FINE |
| E   | Pre‑paint guard `<style>` | — | FINE (capped, scoped, removed on unload) |
| E.1 | Stale cache can briefly hide a deleted native table | LOW | NOTE (recoverable via `maintenance-clear-caches`) |
| F   | Graph writes without user action | — | FINE (settings seeding only, not content) |
| F.1 | Settings seeding on first load | LOW | NOTE (expected Roam extension pattern) |
| G   | Per‑keystroke path | — | FINE |
| H   | MutationObserver scopes | — | FINE |
| I.1 | `LargeGridStore.cache` unbounded | MEDIUM | **ACTION REQUIRED** — wire `large-cache-max-mb` or hard LRU cap |
| I.2 | `redoEntries` no explicit cap | LOW | NOTE (bounded indirectly) |
| J.1 | `LargeGridView` rAF not cancelled in `dispose` | LOW | **ACTION RECOMMENDED** — cancel + `disposed` guard |
| J.2 | Pull‑watch disposer reachable from `onunload` | — | FINE |
| J.3 | Document listeners all disposed | — | FINE |

### Items I'd ask the author to land before Depot submission

1. **I.1 (MEDIUM)** — the `LargeGridStore.cache` eviction. Either ship the
   `large-cache-max-mb` / `large-cache-enabled` machinery (which is already in the schema
   as `stage: "pending"`, so the UI implies a feature that does not exist), or rename
   those descriptors to remove the false promise, and add a hard chunk‑count LRU cap in
   `loadChunk` itself. A 100 000‑row grid that holds every chunk forever is a real heap
   risk on a long Roam session.
2. **J.1 (LOW)** — cancel the large‑grid rAF in `dispose` and guard on `this.disposed`
   in the callback. Trivial change, closes the one after‑unload cosmetic race I found.

### Clean bills worth noting explicitly

- **Datalog queries are uniformly parameterized** — this is unusual for an extension
  of this size and is exactly the discipline the brief asks about.
- **Zero `eval`/`new Function`/fetch/XHR** — the network surface is entirely Roam's
  own API.
- **Two `innerHTML` sinks, both audited**: chart SVG is all‑numeric/escaped, and the
  third‑party renderer sink is the documented extensibility contract, not an injection
  from grid cell contents.
- **All caches have caps except `LargeGridStore.cache`** — every other bounded structure
  has a typed `MAX_*` constant and an enforced limit.
- **The pre‑paint guard is correctly scoped to `.rm-table`, escaped, capped at 2000,
  and removed on unload.**
- **Every document/window listener is paired with a disposer reachable from `onunload`.**

The extension is in good shape for a Depot submission; the I.1 cache eviction is the
one item I'd treat as a blocker, with J.1 as a same‑day polish follow‑up.