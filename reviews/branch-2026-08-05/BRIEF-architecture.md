# Review brief - ARCHITECTURE (Roam Grid v0.9.0)

You are reviewing the ARCHITECTURE of a Roam Research browser extension after a 16-commit
campaign. **Do not read the raw diff** - it is 4000 lines and reading it linearly will cost you
coherence. Work from this inventory and read src/extension.js selectively at the anchors below.

The file is ONE browser-native ES module, ~7900 lines, zero dependencies, no bundler. It cannot
be split: Roam Depot serves exactly one extension.js and a relative import would not resolve.
So "split this file" is NOT an actionable recommendation - do not make it.

## Changed files
 docs/ARCHITECTURE.md            |   32 +
 docs/TESTING.md                 |  118 ++
 extension.css                   |  162 ++-
 extension.js                    | 2588 +++++++++++++++++++++++++++++++++------
 src/extension.js                | 2588 +++++++++++++++++++++++++++++++++------
 test/comments.test.js           |  525 ++++++++
 test/editor-dom.test.js         |    7 +-
 test/keyboard-ownership.test.js |  417 +++++++
 test/large-grid-store.test.js   |   64 +-
 test/lifecycle.test.js          |  262 ++++
 test/mounting.test.js           |  145 ++-
 test/persistence-lane.test.js   |  121 +-
 test/range-reference.test.js    |  582 +++++++++
 test/settings.test.js           |  815 ++++++++++++
 test/undo-history.test.js       |  912 ++++++++++++++
 15 files changed, 8537 insertions(+), 801 deletions(-)


## Exported symbols (138)
110: export const SETTINGS_MAINTENANCE = Object.freeze(Object.fromEntries(MAINTENANCE_ACTIONS.map((descriptor) => [descriptor.key, descriptor])));
112: export const SETTINGS = Object.freeze(Object.fromEntries(SETTING_DESCRIPTORS.map((descriptor, index) => {
118: export const settingsCache = new Map();
120: export const undoHistories = new Map();
121: export const portalObservers = new Map();
125: export const gridSessions = new Map();
126: export const largeGridMounts = new Map();
127: export const gridViews = new Set();
154: export const pendingTimers = new Set();
171: export function graphKeyName(hash = globalThis.location?.hash || "") {
176: export function graphCacheKey(hash = globalThis.location?.hash || "") {
180: export function deviceSettingsKey(hash = globalThis.location?.hash || "") {
184: export function readEnhancedUidCache(storage = globalThis.localStorage, key = graphCacheKey()) {
191: export function writeEnhancedUidCache(uids, storage = globalThis.localStorage, key = graphCacheKey()) {
197: export function coerceSetting(descriptor, raw) {
227: export function settingDefaults() {
232: export function planSettingsMigration(storedVersion, storedValues = {}) {
244: export function resolveSettingValue(descriptor, graphValue, deviceValue) {
251: export function readDeviceSettings(storage = globalThis.localStorage, key = deviceSettingsKey()) {
258: export function writeDeviceSettings(values, storage = globalThis.localStorage, key = deviceSettingsKey()) {
278: export function refreshSettingsCache(extensionAPI = runtime.extensionAPI, storage = globalThis.localStorage) {
287: export function getSetting(key, fallback) {
292: export async function setSetting(key, value, { extensionAPI = runtime.extensionAPI, storage = globalThis.localStorage } = {}) {
310: export function applySettingsChange(descriptor, value) {
331: export function displayDefaults() {
338: export function applyDisplayDefaults(target) {
348: export function formulaTintEnabled(gridFlag) {
354: export function repaintFormulaTint(cells, gridFlag) {
363: export function applyGridMaxWidth(root, value = getSetting("appearance-max-width")) {
372: export function toolbarPresetClass(preset) {
377: export function applyToolbarPreset(root, preset = getSetting("appearance-toolbar-preset")) {
385: export function enterMovement(direction = getSetting("editing-enter-direction")) {
391: export function tabMovement(direction = getSetting("editing-tab-direction"), shiftKey = false) {
405: export function settingsPanelRow(descriptor, { onChange = () => {}, onClick = () => {} } = {}) {
414: export function buildSettingsPanelConfig(handlers = {}) {
424: export function enhancedUidGuardCss(uids) {
442: export class GridError extends Error {
461: export function fittedTrackResize(widths, targetId, requestedWidth, minimum = getSetting("sizing-min-col-width")) {
486: export function columnLabel(index) {
498: export function parseCellReference(reference) {
520: export function formulaReferences(raw) {
558: export function formulaAutocompleteContext(raw, caret = String(raw ?? "").length) {
579: export function formulaCanPointReference(raw, caret = String(raw ?? "").length) {
598: export function moveFormulaReferenceCoordinate(base, movement, dimensions, mergeAt = () => null) {
653: export function rankFormulaFunctions(query, catalog, limit = 8) {
663: export function activeFormulaCall(raw, caret = String(raw ?? "").length) {
706: export function cycleFormulaReferenceLocks(raw, selectionStart, selectionEnd = selectionStart) {
773: export function rewriteFormulaForStructure(raw, { axis, index, insertCount = 0, deleteCount = 0, formulaRow = null, formulaCol = null }) {
803: export function normalizeRange(range) {
828: export function formatRangeComponent(model, selection) {
836: export function parseRangeComponent(text) {
1088: export class FormulaDependencyCache {
1144: export class FormulaEngine {
1263: export function gridShapeSignature(model) {
1324: export function applyUndoOp(model, op) {
1408: export function restoreCheckpointKeepingStale(model, snapshot, stale = null) {
1427: export function applyUndoOps(model, ops, entry = null) {
1496: export function externalContentUndoEntry(model, changes) {
1509: export class UndoHistory {
1611: export function undoHistoryFor(tableUid, histories = undoHistories) {
1621: export function releaseUndoHistory(tableUid, histories = undoHistories) { return histories.delete(tableUid); }
1623: export function clearUndoHistories(histories = undoHistories) { histories.clear(); }
1625: export class GridModel {
2090: export function rewriteFormula(raw, rowDelta, colDelta) {
2107: export function parseDelimited(text, delimiter = ",") {
2133: export function importGrid(text, format = "auto") {
2154: export function exportGrid(model, format = "csv") {
2229: export function importGridTableSexpr(text) {
2263: export function renderChartSvg(model, spec, width = 640, height = 240) {
2312: export class RegistrySet {
2485: export function deferredStructuralConflict(baseTree, desiredModel, watchedTrees) {
2537: export function nativeTreeToModel(tree, metadata = {}) {
2546: export function serializeTemplateModel(model, name = "Untitled grid") {
2568: export function templateModelFromValue(value) {
2594: export class MetadataStore {
2720: export class NativeTableAdapter {
3110: export function captureDiscardedEdits(dirtyCells, externalModel, limit = MAX_DISCARDED_EDITS) {
3127: export function discardedRestorePrompt(record) {
3136: export class NativeGridSession {
3621: export function chunkRowsFor(manifest) {
3628: export class LargeGridStore {
3890: export function keyboardOwner() { return runtime.keyboardOwner; }
3893: export function claimKeyboard(view) {
3903: export function releaseKeyboard(view = null) {
3912: export function portalOwnerUid(target) {
3932: export function onGlobalPointerDown(event) {
3943: export function onGlobalFocusIn(event) {
3951: export function onGlobalKeydown(event) {
3965: export function installKeyboardOwnership() {
3979: export function commentArmingState() { return Boolean(runtime.commentArmed); }
3983: export function setCommentArming(armed) {
3996: export function installCommentAffordance({ target = globalThis.window } = {}) {
4123: export function toast(message, intent = "primary", timeout = 4500, { action = null } = {}) {
4182: export function pinnedGridThemePalette(mode = getSetting("appearance-theme")) {
4239: export function syncGridThemeFromHost(nativeElement, gridRoot, getStyle = globalThis.getComputedStyle) {
4269: export function createGridThemeBridge(nativeElement, gridRoot, {
4367: export function syncPortalThemeFromRoot(ownerRoot, portal, getStyle = globalThis.getComputedStyle) {
4407: export function createPortalThemeBridge(ownerRoot, portal, {
4508: export function selectionBlockReferenceMatrix(model, selection) {
4526: export function selectionBlockReferenceText(model, selection) {
4535: export function resolveSourceModel(tableUid, { sessions = runtime.sessions, loadModel = (uid) => new NativeTableAdapter(uid).load() } = {}) {
4543: export function queryBlockReferenceCounts(uids, api = roam()) {
4556: export function queryBlockReferenceSources(uid, api = roam()) {
4581: export function commentAnchorString(targetUid) {
4592: export function commentThreadPlan(tree, { pageUid, targetUid, dateTitle, authorTitle, generateUid = cryptoId } = {}) {
4619: export async function applyCommentThreadPlan(plan, { body = "", create = createBlock, update = updateBlock, generateUid = cryptoId } = {}) {
4636: export function blockPageUid(uid, api = roam()) {
4648: export function commentAuthorTitle(api = roam()) {
4667: export function queryCommentThreadIndex(pageUid, api = roam()) {
4701: export function commentThreadSignature(entries) {
4706: export function diffCommentThreadIndex(previous, next) {
4715: export function mergeCommentThread(index, cellUid, threadUid) {
4727: export function commentThreadCount(entries) {
4733: export function requiresRoamRichRender(raw) {
4767: export function releaseRichCellHosts(container) {
4775: export function replaceGridViewportContents(viewport, nextGrid) {
4792: export function gridTrackTemplate(model, axis, from = 0, to = (axis === "col" ? model.columnIds.length : model.rowCount) - 1, { fit = false, widths = 
4817: export function paintRichCellContent(content, raw, token) {
4843: export function renderStableCellContent(content, { raw = "", value = raw, formula = false, renderRich = null } = {}) {
4884: export function roamReferenceAutocompleteContext(raw, caret = String(raw ?? "").length) {
4899: export async function searchRoamReferenceSuggestions(context, limit = getSetting("editing-autocomplete-limit"), api = globalThis.window?.roamAlphaAPI)
4925: export class GridEditorController {
5443: export class GridView {
6836: export class RangeGridView {
7033: export class AsyncFormulaEngine {
7133: export class LargeGridView {
7586: export const mounting = new Set();
7614: export function nativeTableInstanceInfo(nativeElement, entries = runtime.metadata?.entries || new Map()) {
7634: export function instanceSurface(element) {
7681: export function rangeButtonsWithin(root) {
7690: export function rangeBlockUid(element) {
7701: export function rangeInstanceInfo(button, entries = runtime.rangeSpecs, readString = blockString) {
7788: export function disposePortalObservers() {
7798: export function installPortalObservers({ MutationObserverClass = globalThis.MutationObserver, ownerDocument = globalThis.document, scan = scheduleScan
7882: export function applyDisplayDefaultsToOpenGrids() {
7902: export async function runMaintenanceAction(key, { extensionAPI = runtime.extensionAPI, storage = globalThis.localStorage, rebuildPanel = null } = {}) 
7937: export async function initializeSettings(extensionAPI, { storage = globalThis.localStorage } = {}) {
8000: export default { onload, onunload };

## Classes (19)
352: /** Toggles the tint class on already-mounted cells from their stored raw text — no re-render, no
442: export class GridError extends Error {
862: class FormulaParser {
1088: export class FormulaDependencyCache {
1144: export class FormulaEngine {
1509: export class UndoHistory {
1625: export class GridModel {
2312: export class RegistrySet {
2594: export class MetadataStore {
2656: class GridTemplateStore {
2711: class MutationQueue {
2720: export class NativeTableAdapter {
3136: export class NativeGridSession {
3628: export class LargeGridStore {
4925: export class GridEditorController {
5443: export class GridView {
6836: export class RangeGridView {
7033: export class AsyncFormulaEngine {
7133: export class LargeGridView {

## Architecture questions to answer

1. **Layering.** Intended model: native Roam blocks are canonical; one NativeGridSession per
   table owns model/adapter/pull-watch/write-queue/undo-history; N views (source block, inline
   block-ref, read-only range excerpt) attach to it. Does the code hold that, or do views reach
   around the session?
2. **Registries.** runtime.views, runtime.sessions, runtime.largeMounts, runtime.undoHistories,
   runtime.portalObservers, runtime.rangeSpecs. Are lifetimes and ownership coherent? Which can
   leak? Is eviction symmetric with insertion? Note undoHistories is deliberately NOT released
   on session dispose - surviving disposal is the point - but it is LRU-capped at 24.
3. **runtime.views is heterogeneous** - it holds both GridView and RangeGridView, which
   implement different subsets of the view contract. Is that contract written down anywhere, or
   only implied by optional calls at fan-out sites? What breaks when a third view type is added?
4. **Two storage tiers** - native-block-backed grids and file-chunk-backed large grids - share
   GridModel but diverge everywhere else (large grids have no undo yet; separate paste, render
   and save paths). Is the divergence principled or accidental duplication?
5. **Settings.** A 36-descriptor schema with a read cache, device-scoped keys, and
   onView/onLarge/onSession callbacks dispatched over the three registries. Is the dispatch
   sound? Any setting whose declared apply mode disagrees with what its handler actually does?
6. **Cohesion.** Name the seams where this file could later be split IF a bundler were ever
   introduced, in dependency order. That is the useful form of the "it is too big" observation.

Report per finding: area, severity, what is structurally wrong, what it costs later, and a
concrete change. Prefer 5 well-argued findings over 20 shallow ones.
Write your findings to reviews/branch-2026-08-05/review-architecture.md
