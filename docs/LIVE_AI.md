# Live AI table completion

Roam Grid and Live AI share the same UID-preserving native table model. The
compatibility adapter first asks `window.roamGrid.v1.getTableModel(tableUid)` for
an opted-in enhanced table and otherwise reads Roam's nested blocks exactly as it
did before.

AI cell results for an enhanced table are written with:

```js
await window.roamGrid.v1.applyPatch(tableUid, {
  op: "set",
  row,
  col,
  value,
});
```

This keeps formula invalidation, grid undo, metadata, conflict detection, and
serialized block writes inside one owner. When Roam Grid is absent or the table
is not enhanced, Live AI continues to call `roamAlphaAPI.updateBlock` with the
cell UID. The integration therefore adds no hard dependency in either direction.

The local Live AI source adapter lives in
`~/roam-extension-live-ai-assistant/src/utils/roamTable.js` and its streamed
completion writer in `src/ai/tableCompletion.js`.
