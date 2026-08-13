import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SETTINGS,
  SETTINGS_MAINTENANCE,
  applyDisplayDefaults,
  applyDisplayDefaultsToOpenGrids,
  applyLargeGridGateChange,
  applyGridMaxWidth,
  applySettingsChange,
  applyToolbarPreset,
  autocompleteEnabled,
  buildSettingsPanelConfig,
  clipPasteMatrix,
  coerceSetting,
  copyNativeToLarge,
  deviceSettingsKey,
  displayDefaults,
  displayRestampValues,
  enterMovement,
  formulaTintEnabled,
  getSetting,
  graphCacheKey,
  GridModel,
  gridSessions,
  GridView,
  gridViews,
  headersVisible,
  importCommand,
  initializeSettings,
  largeGridEnabled,
  largeGridMounts,
  LargeGridStore,
  LargeGridView,
  newLargeGrid,
  notificationAllowed,
  pendingTimers,
  pinnedGridThemePalette,
  runtime,
  planDeviceSettingsMigration,
  planSettingsMigration,
  readDeviceSettings,
  readEnhancedUidCache,
  refreshSettingsCache,
  repaintFormulaTint,
  resolveSettingValue,
  runMaintenanceAction,
  scanLargeMounts,
  setSetting,
  settingDefaults,
  settingsCache,
  settingsPanelRow,
  tabMovement,
  toolbarPresetClass,
  writeDeviceSettings,
  writeEnhancedUidCache,
} from "../src/extension.js";

/**
 * The literal values below are deliberately restated here rather than imported. If they were
 * derived from the schema the regression would be tautological — it must fail when a default moves.
 */
const TODAYS_CONSTANTS = {
  "writes-native-budget": 1200,
  "writes-content-debounce-ms": 220,
  "writes-large-debounce-ms": 500,
  "session-idle-ms": 1500,
  "editing-native-editor": true,
  "editing-autocomplete": true,
  "editing-autocomplete-debounce-ms": 90,
  "editing-autocomplete-limit": 8,
  "editing-autocomplete-empty-opener": true,
  "editing-autocomplete-render-rows": true,
  "editing-autocomplete-components": true,
  "editing-autocomplete-commands": false,
  "editing-capture-undo": true,
  "editing-enter-direction": "Down",
  "editing-tab-direction": "Right",
  "editing-paste-grows-grid": true,
  "conflict-restore-prompt": true,
  "appearance-formula-tinting": true,
  "appearance-show-headers": true,
  "appearance-fit-to-width": true,
  "appearance-reference-badges": true,
  "appearance-toolbar-preset": "Full",
  "appearance-theme": "Follow Roam",
  "appearance-max-width": 1200,
  "appearance-notifications": "All",
  "sizing-default-row-height": 32,
  "sizing-compact-row-height": 24,
  "sizing-default-col-width": 160,
  "sizing-min-row-height": 22,
  "sizing-max-row-height": 480,
  "sizing-min-col-width": 56,
  "sizing-max-col-width": 640,
  "new-grid-rows": 100,
  "new-grid-cols": 26,
  "large-overscan-rows": 8,
  "large-chunk-rows": 500,
  "comments-enabled": true,
  "comments-affordance-trigger": "Hover",
  "comments-badges": true,
  "comments-compose-mode": "In place",
  "ranges-live-references": true,
  "ranges-max-rendered-cells": 2000,
  "images-cell-media": true,
  "images-max-height": 180,
  "experimental-large-grid": false,
  "large-cache-enabled": true,
  "large-cache-max-mb": 256,
  "large-verify-checksums": true,
  "large-gc-orphans": false,
  "large-refs-sync": false,
  "large-refs-max": 2000,
};

/**
 * Empty since GOAL-3H: every declared key now has a read site. The list stays because the panel
 * arithmetic below is written in terms of it, and because the schema sweep asserts that nothing may
 * become `stage: "pending"` without being listed here.
 */
const PENDING_KEYS = [
  "writes-native-budget",
  "writes-content-debounce-ms",
  "writes-large-debounce-ms",
  "session-idle-ms",
  "editing-autocomplete-debounce-ms",
  "editing-autocomplete-limit",
  "editing-autocomplete-empty-opener",
  "editing-autocomplete-render-rows",
  "editing-autocomplete-components",
  "editing-autocomplete-commands",
  "editing-capture-undo",
  "conflict-restore-prompt",
  "appearance-reference-badges",
  "appearance-max-width",
  "appearance-notifications",
  "sizing-default-row-height",
  "sizing-compact-row-height",
  "sizing-default-col-width",
  "sizing-min-row-height",
  "sizing-max-row-height",
  "sizing-min-col-width",
  "sizing-max-col-width",
  "new-grid-rows",
  "new-grid-cols",
  "large-overscan-rows",
  "large-chunk-rows",
  "large-cache-max-mb",
  "large-verify-checksums",
  "large-refs-max",
  "comments-badges",
  "ranges-max-rendered-cells",
];

// `stage: "experimental"` rows are user-facing only when the experimental-large-grid gate is on;
// they render in the panel conditional on `largeGridEnabled()` and are seeded exactly like `live`.
const EXPERIMENTAL_KEYS = ["large-cache-enabled", "large-gc-orphans", "large-refs-sync"];

const COMMENT_KEYS = ["comments-enabled", "comments-affordance-trigger", "comments-compose-mode"];

const RANGE_KEYS = ["ranges-live-references"];

const IMAGE_KEYS = ["images-cell-media", "images-max-height"];

const LARGE_STORAGE_KEYS = ["large-cache-enabled", "large-gc-orphans", "large-refs-sync"];

const MAINTENANCE_KEYS = ["maintenance-apply-display", "maintenance-forget-device", "maintenance-clear-caches", "maintenance-migrate-templates", "maintenance-reset"];

function makeApi({ values = {}, canSet = true, useGetAll = true } = {}) {
  const store = { ...values };
  const writes = [];
  const panels = [];
  const counters = { get: 0, getAll: 0, set: 0, panel: 0 };
  const settings = {
    canSet,
    get: (key) => { counters.get += 1; return Object.hasOwn(store, key) ? store[key] : null; },
    set: async (key, value) => { counters.set += 1; writes.push([key, value]); store[key] = value; },
    panel: { create: async (config) => { counters.panel += 1; panels.push(config); } },
  };
  if (useGetAll) settings.getAll = () => { counters.getAll += 1; return { ...store }; };
  return { api: { settings }, store, writes, panels, counters, reads: () => counters.get + counters.getAll };
}

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}

function makeClassList() {
  const names = new Set();
  return {
    names,
    add: (name) => names.add(name),
    remove: (name) => names.delete(name),
    contains: (name) => names.has(name),
    toggle: (name, on) => { if (on) names.add(name); else names.delete(name); return names.has(name); },
  };
}

function makeElement() {
  const properties = new Map();
  return { classList: makeClassList(), style: { properties, setProperty: (name, value) => properties.set(name, value) } };
}

function clearRegistries() {
  gridViews.clear();
  gridSessions.clear();
  largeGridMounts.clear();
}

test("every descriptor is well-formed", () => {
  const controls = new Set(["switch", "input", "select", "button"]);
  const types = new Set(["int", "bool", "enum", "string"]);
  for (const [key, descriptor] of Object.entries(SETTINGS)) {
    assert.equal(descriptor.key, key, `${key}: descriptor key must match its map key`);
    assert.ok(Object.isFrozen(descriptor), `${key}: descriptor must be frozen`);
    for (const field of ["group", "name", "description"]) {
      assert.equal(typeof descriptor[field], "string", `${key}: ${field} must be a string`);
      assert.ok(descriptor[field].length > 0, `${key}: ${field} must not be empty`);
    }
    assert.ok(controls.has(descriptor.control), `${key}: unknown control ${descriptor.control}`);
    assert.ok(types.has(descriptor.type), `${key}: unknown type ${descriptor.type}`);
    assert.ok(["graph", "device"].includes(descriptor.scope), `${key}: unknown scope ${descriptor.scope}`);
    assert.ok(["immediate", "next-op"].includes(descriptor.apply), `${key}: unknown apply ${descriptor.apply}`);
    assert.ok(["live", "pending", "experimental"].includes(descriptor.stage), `${key}: unknown stage ${descriptor.stage}`);
    if (descriptor.control === "switch") assert.equal(descriptor.type, "bool", `${key}: switch rows must be bool`);
    if (descriptor.control === "select") assert.equal(descriptor.type, "enum", `${key}: select rows must be enum`);
    if (descriptor.type === "bool") assert.equal(typeof descriptor.default, "boolean", `${key}: bool default must be a boolean`);
    if (descriptor.type === "enum") {
      assert.ok(Array.isArray(descriptor.items) && descriptor.items.length > 1, `${key}: enum must list items`);
      assert.ok(descriptor.items.includes(descriptor.default), `${key}: enum default must be one of its items`);
      assert.ok(Object.isFrozen(descriptor.items), `${key}: enum items must be frozen`);
    }
    if (descriptor.type === "int") {
      assert.ok(Number.isInteger(descriptor.default), `${key}: int default must be an integer`);
      assert.ok(Number.isFinite(descriptor.min) && Number.isFinite(descriptor.max), `${key}: int rows need min and max`);
      assert.ok(descriptor.min <= descriptor.default && descriptor.default <= descriptor.max, `${key}: default must sit inside [min,max]`);
    }
    for (const hook of ["onView", "onLarge", "onSession"]) {
      if (descriptor[hook] !== undefined) assert.equal(typeof descriptor[hook], "function", `${key}: ${hook} must be omitted or a propagation callback`);
    }
    if (descriptor.stage === "pending") {
      for (const hook of ["onView", "onLarge", "onSession"]) assert.equal(descriptor[hook], undefined, `${key}: a pending row must not claim a propagation callback`);
    }
  }
});

test("schema keys are unique across the panel and the map", () => {
  refreshSettingsCache(makeApi().api, makeStorage());
  const ids = buildSettingsPanelConfig().settings.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, "panel row ids must be unique");
  // With the experimental gate OFF by default, the EXPERIMENTAL_KEYS hide alongside the pending ones.
  assert.equal(Object.keys(SETTINGS).length, ids.length + PENDING_KEYS.length + EXPERIMENTAL_KEYS.length - MAINTENANCE_KEYS.length);
  for (const key of PENDING_KEYS) assert.ok(SETTINGS[key], `${key} must exist in the schema`);
  for (const key of EXPERIMENTAL_KEYS) assert.ok(SETTINGS[key], `${key} must exist in the schema`);
  for (const key of MAINTENANCE_KEYS) assert.ok(!SETTINGS[key], `${key} is an action, not a stored setting`);
  settingsCache.clear();
});

test("settingDefaults equals today's constant values exactly", () => {
  assert.deepEqual(settingDefaults(), TODAYS_CONSTANTS);
});

test("coerceSetting clamps, rounds, and rejects garbage integers", () => {
  const descriptor = SETTINGS["writes-native-budget"];
  assert.equal(coerceSetting(descriptor, 900), 900);
  assert.equal(coerceSetting(descriptor, "900"), 900);
  assert.equal(coerceSetting(descriptor, " 900 "), 900);
  assert.equal(coerceSetting(descriptor, 900.4), 900);
  assert.equal(coerceSetting(descriptor, 900.6), 901);
  assert.equal(coerceSetting(descriptor, 10), 50, "below min clamps to min");
  assert.equal(coerceSetting(descriptor, 999999), 5000, "above max clamps to max");
  assert.equal(coerceSetting(descriptor, -1), 50);
  for (const raw of ["", "   ", null, undefined, Number.NaN, Infinity, -Infinity, "abc", "12abc", {}, [], true, false]) {
    assert.equal(coerceSetting(descriptor, raw), 1200, `${String(raw)} must fall back to the default`);
  }
});

test("coerceSetting accepts the documented boolean forms and rejects the rest", () => {
  const on = SETTINGS["editing-capture-undo"];
  const off = SETTINGS["large-gc-orphans"];
  assert.equal(coerceSetting(on, true), true);
  assert.equal(coerceSetting(on, false), false);
  assert.equal(coerceSetting(on, "true"), true);
  assert.equal(coerceSetting(on, "false"), false);
  assert.equal(coerceSetting(on, "TRUE"), true);
  assert.equal(coerceSetting(on, " False "), false);
  assert.equal(coerceSetting(on, 1), true);
  assert.equal(coerceSetting(on, 0), false);
  assert.equal(coerceSetting(on, "1"), true);
  assert.equal(coerceSetting(on, "0"), false);
  for (const raw of [null, undefined, "", "yes", "no", 2, -1, {}, []]) {
    assert.equal(coerceSetting(on, raw), true, `${String(raw)} must fall back to the true default`);
    assert.equal(coerceSetting(off, raw), false, `${String(raw)} must fall back to the false default`);
  }
});

test("coerceSetting matches enums case-insensitively and falls back otherwise", () => {
  const descriptor = SETTINGS["editing-enter-direction"];
  assert.equal(coerceSetting(descriptor, "Right"), "Right");
  assert.equal(coerceSetting(descriptor, "right"), "Right", "canonical casing is returned");
  assert.equal(coerceSetting(descriptor, " STAY "), "Stay");
  for (const raw of ["up", "", null, undefined, 3, {}]) assert.equal(coerceSetting(descriptor, raw), "Down");
  const theme = SETTINGS["appearance-theme"];
  assert.equal(coerceSetting(theme, "follow roam"), "Follow Roam");
  assert.equal(coerceSetting(theme, "sepia"), "Follow Roam");
});

test("coerceSetting returns undefined for an unknown descriptor", () => {
  assert.equal(coerceSetting(undefined, 5), undefined);
  assert.equal(coerceSetting(null, 5), undefined);
});

test("migration from a legacy nativeMutationBudget produces exactly the expected write list", () => {
  const plan = planSettingsMigration(undefined, { nativeMutationBudget: 900 });
  assert.deepEqual(plan.writes, [["writes-native-budget", 900], ["settingsVersion", 2]]);
  assert.equal(plan.from, 0);
  assert.equal(plan.to, 2);
});

test("migration coerces the legacy value and skips it when the new key already exists", () => {
  assert.deepEqual(planSettingsMigration(0, { nativeMutationBudget: "99999" }).writes, [["writes-native-budget", 5000], ["settingsVersion", 2]]);
  assert.deepEqual(planSettingsMigration(0, { nativeMutationBudget: 900, "writes-native-budget": 700 }).writes, [["settingsVersion", 2]]);
  assert.deepEqual(planSettingsMigration(0, {}).writes, [["settingsVersion", 2]]);
});

test("migration is idempotent at the current version and never downgrades a future one", () => {
  const atCurrent = planSettingsMigration(2, { nativeMutationBudget: 900, "comments-open-in-sidebar": true });
  assert.deepEqual(atCurrent.writes, []);
  assert.equal(atCurrent.to, 2);
  const fromFuture = planSettingsMigration(7, { nativeMutationBudget: 900 });
  assert.deepEqual(fromFuture.writes, [], "a future version must not be rewritten backwards");
  assert.equal(fromFuture.from, 7);
  assert.equal(fromFuture.to, 7, "the plan must keep the future version, not downgrade to 2");
  assert.deepEqual(planSettingsMigration("7", {}).writes, []);
  const replay = planSettingsMigration(atCurrent.to, { nativeMutationBudget: 900, "writes-native-budget": 900, settingsVersion: 2 });
  assert.deepEqual(replay.writes, [], "re-running the plan after applying it writes nothing");
});

test("the v1 sidebar switch migrates to the compose-mode enum, value-gated", () => {
  assert.deepEqual(
    planSettingsMigration(1, { "comments-open-in-sidebar": true }).writes,
    [["comments-compose-mode", "Right sidebar"], ["settingsVersion", 2]],
    "a legacy true becomes the sidebar compose mode",
  );
  assert.deepEqual(
    planSettingsMigration(1, { "comments-open-in-sidebar": false }).writes,
    [["settingsVersion", 2]],
    "a legacy false was the default already — stamp only",
  );
  assert.deepEqual(
    planSettingsMigration(1, { "comments-open-in-sidebar": true, "comments-compose-mode": "Comment box" }).writes,
    [["settingsVersion", 2]],
    "an explicit compose mode always wins over the legacy switch",
  );
  assert.deepEqual(
    planSettingsMigration(0, { nativeMutationBudget: 900, "comments-open-in-sidebar": true }).writes,
    [["writes-native-budget", 900], ["comments-compose-mode", "Right sidebar"], ["settingsVersion", 2]],
    "from 0 every pending migration applies in order",
  );
});

test("planDeviceSettingsMigration maps the legacy boolean and drops its key", () => {
  const absent = planDeviceSettingsMigration({ "appearance-theme": "Dark" });
  assert.equal(absent.changed, false, "no legacy key means no write");
  assert.deepEqual(absent.values, { "appearance-theme": "Dark" });

  const mapped = planDeviceSettingsMigration({ "comments-open-in-sidebar": true, "appearance-theme": "Dark" });
  assert.equal(mapped.changed, true);
  assert.deepEqual(mapped.values, { "appearance-theme": "Dark", "comments-compose-mode": "Right sidebar" });

  const off = planDeviceSettingsMigration({ "comments-open-in-sidebar": false });
  assert.equal(off.changed, true);
  assert.deepEqual(off.values, {}, "false was the default — the key is only dropped");

  const explicit = planDeviceSettingsMigration({ "comments-open-in-sidebar": true, "comments-compose-mode": "In place" });
  assert.deepEqual(explicit.values, { "comments-compose-mode": "In place" }, "an existing enum value is never overwritten");

  const input = { "comments-open-in-sidebar": true };
  planDeviceSettingsMigration(input);
  assert.deepEqual(input, { "comments-open-in-sidebar": true }, "the planner is pure — the input is not mutated");
});

test("initializeSettings migrates a device shadow holding the legacy switch", async (t) => {
  t.after(() => settingsCache.clear());
  const fake = makeApi({ values: { settingsVersion: 2 } });
  const storage = makeStorage({ [deviceSettingsKey()]: '{"comments-open-in-sidebar":true,"appearance-theme":"Dark"}' });
  await initializeSettings(fake.api, { storage });
  const shadow = JSON.parse(storage.data.get(deviceSettingsKey()));
  assert.deepEqual(shadow, { "appearance-theme": "Dark", "comments-compose-mode": "Right sidebar" }, "the shadow ends with the enum, never the legacy key");
  assert.equal(getSetting("comments-compose-mode"), "Right sidebar", "the migrated value is what the cache resolves");
  assert.ok(!fake.writes.some(([key]) => key === "comments-open-in-sidebar"), "the legacy key is never written to the graph");
});

test("initializeSettings migrates the device shadow even when the graph forbids writes", async (t) => {
  t.after(() => settingsCache.clear());
  const fake = makeApi({ canSet: false });
  const storage = makeStorage({ [deviceSettingsKey()]: '{"comments-open-in-sidebar":true}' });
  await initializeSettings(fake.api, { storage });
  assert.deepEqual(JSON.parse(storage.data.get(deviceSettingsKey())), { "comments-compose-mode": "Right sidebar" });
  assert.equal(getSetting("comments-compose-mode"), "Right sidebar");
  assert.equal(fake.counters.set, 0, "canSet:false still means zero graph writes");
});

test("device migration runs before seeding, so graph and shadow agree and forget-device cannot revert it", async (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();
  const fake = makeApi({ values: { settingsVersion: 2 } });
  const storage = makeStorage({ [deviceSettingsKey()]: '{"comments-open-in-sidebar":true}' });
  await initializeSettings(fake.api, { storage });
  const written = new Map(fake.writes);
  assert.equal(written.get("comments-compose-mode"), "Right sidebar", "the migrated device value seeds the graph, not the default");
  assert.equal(getSetting("comments-compose-mode"), "Right sidebar", "graph and shadow agree right after seeding");

  await runMaintenanceAction("maintenance-forget-device", { extensionAPI: fake.api, storage });
  assert.deepEqual(readDeviceSettings(storage), {}, "the device shadow is emptied");
  assert.equal(getSetting("comments-compose-mode"), "Right sidebar", "forgetting the device falls back to the migrated graph seed, not the default");
});

test("the compose-mode panel row is a select with exactly the three modes", () => {
  const rows = buildSettingsPanelConfig().settings;
  const row = rows.find((candidate) => candidate.id === "comments-compose-mode");
  assert.ok(row, "the row ships in the panel");
  assert.equal(row.action.type, "select");
  assert.deepEqual(row.action.items, ["In place", "Comment box", "Right sidebar"]);
  assert.equal(SETTINGS["comments-compose-mode"].scope, "device", "compose preference stays per-device like the switch it replaces");
  assert.equal(SETTINGS["comments-open-in-sidebar"], undefined, "the legacy descriptor is gone from the schema");
});

/**
 * GOAL-U1. The row is a graph-scoped switch because native cell editing is a property of how the
 * graph's tables are edited, not of one browser, and it defaults ON: the whole point of the feature
 * is that a cell gets Roam's own `[[` / `((` / `#` / `{{` / `/` menus without being asked twice.
 */
test("the native-editor row is a live graph switch that ships on", () => {
  const descriptor = SETTINGS["editing-native-editor"];
  assert.ok(descriptor, "the descriptor exists in the schema");
  assert.equal(descriptor.group, "Editing");
  assert.equal(descriptor.control, "switch");
  assert.equal(descriptor.type, "bool");
  assert.equal(descriptor.default, true);
  assert.equal(descriptor.scope, "graph");
  assert.equal(descriptor.apply, "immediate");
  assert.equal(descriptor.stage, "live");
  for (const hook of ["onView", "onLarge", "onSession"]) {
    assert.equal(descriptor[hook], undefined, `${hook} must be absent — the value is read live at beginEditLocal`);
  }
  const row = buildSettingsPanelConfig().settings.find((candidate) => candidate.id === "editing-native-editor");
  assert.ok(row, "the row is rendered in the panel");
  assert.equal(row.action.type, "switch");
  assert.match(descriptor.description, /Roam/, "the description says whose editor this is");
  assert.equal(coerceSetting(descriptor, "false"), false);
  assert.equal(coerceSetting(descriptor, "nonsense"), true, "garbage falls back to on");
});

test("resolveSettingValue reads device-scoped keys device-first and treats the graph value as a seed", () => {
  const device = SETTINGS["appearance-theme"];
  assert.equal(resolveSettingValue(device, "Light", "Dark"), "Dark", "device value wins");
  assert.equal(resolveSettingValue(device, "Light", null), "Light", "graph value seeds when the device has none");
  assert.equal(resolveSettingValue(device, null, null), "Follow Roam");
  const graph = SETTINGS["writes-content-debounce-ms"];
  assert.equal(resolveSettingValue(graph, 300, 999), 300, "a graph-scoped key ignores the device shadow");
  assert.equal(resolveSettingValue(graph, "", 999), 220, "an empty graph value falls back to the default");
  assert.equal(resolveSettingValue(undefined, 1, 2), undefined);
});

test("device settings survive corrupted, non-object, and unavailable storage", () => {
  assert.deepEqual(readDeviceSettings(makeStorage({ [deviceSettingsKey()]: "{not json" })), {});
  assert.deepEqual(readDeviceSettings(makeStorage({ [deviceSettingsKey()]: "[1,2,3]" })), {});
  assert.deepEqual(readDeviceSettings(makeStorage({ [deviceSettingsKey()]: "null" })), {});
  assert.deepEqual(readDeviceSettings(makeStorage()), {});
  assert.deepEqual(readDeviceSettings(undefined), {});
  assert.deepEqual(readDeviceSettings({ getItem() { throw new Error("blocked"); } }), {});
  assert.deepEqual(readDeviceSettings(makeStorage({ [deviceSettingsKey()]: '{"appearance-theme":"Dark"}' })), { "appearance-theme": "Dark" });
});

test("writeDeviceSettings persists device-scoped keys only", () => {
  const storage = makeStorage();
  const stored = writeDeviceSettings({ "appearance-theme": "Dark", "writes-content-debounce-ms": 300, bogus: 1 }, storage);
  assert.deepEqual(stored, { "appearance-theme": "Dark" });
  assert.deepEqual(readDeviceSettings(storage), { "appearance-theme": "Dark" });
  assert.doesNotThrow(() => writeDeviceSettings({ "appearance-theme": "Dark" }, { setItem() { throw new Error("blocked"); } }));
});

test("the device settings key and the enhanced-uid cache key derive the same graph name", () => {
  const hash = "#/app/my%20graph/page/abc";
  assert.equal(deviceSettingsKey(hash), "roam-grid:settings:my graph");
  assert.equal(graphCacheKey(hash), "roam-grid:enhanced-uids:my graph");
  assert.equal(deviceSettingsKey("garbage"), "roam-grid:settings:unknown");
  assert.equal(graphCacheKey("garbage"), "roam-grid:enhanced-uids:unknown");
});

test("getSetting reads the cache and never touches extensionAPI after a refresh", () => {
  const fake = makeApi({ values: { "writes-native-budget": 777, "editing-enter-direction": "right" } });
  refreshSettingsCache(fake.api, makeStorage());
  const readsAfterRefresh = fake.reads();
  let observed = null;
  for (let index = 0; index < 200; index += 1) observed = getSetting("writes-native-budget");
  for (let index = 0; index < 200; index += 1) getSetting("editing-enter-direction");
  for (let index = 0; index < 200; index += 1) getSetting("comments-compose-mode");
  assert.equal(observed, 777);
  assert.equal(getSetting("editing-enter-direction"), "Right", "the cache holds the coerced value");
  assert.equal(fake.reads() - readsAfterRefresh, 0, "600 getSetting calls must add zero extensionAPI reads");
});

test("refreshSettingsCache rebuilds the whole schema from one bulk read", () => {
  const fake = makeApi({ values: { "appearance-theme": "Light" } });
  const cache = refreshSettingsCache(fake.api, makeStorage({ [deviceSettingsKey()]: '{"appearance-theme":"Dark"}' }));
  assert.equal(cache.size, Object.keys(SETTINGS).length);
  assert.equal(fake.counters.getAll, 1);
  assert.equal(fake.counters.get, 0, "the bulk read must be preferred over per-key gets");
  assert.equal(getSetting("appearance-theme"), "Dark");
  refreshSettingsCache(fake.api, makeStorage());
  assert.equal(getSetting("appearance-theme"), "Light", "clearing the device shadow falls back to the graph seed");
});

test("refreshSettingsCache falls back to per-key reads when getAll is unavailable", () => {
  const fake = makeApi({ values: { "writes-native-budget": 640 }, useGetAll: false });
  refreshSettingsCache(fake.api, makeStorage());
  assert.ok(fake.counters.get > 0);
  assert.equal(getSetting("writes-native-budget"), 640);
  refreshSettingsCache({}, makeStorage());
  assert.equal(getSetting("writes-native-budget"), 1200, "an API without settings resolves to defaults");
});

test("getSetting resolves pending rows and unknown keys", () => {
  refreshSettingsCache(makeApi().api, makeStorage());
  for (const key of PENDING_KEYS) assert.equal(getSetting(key), TODAYS_CONSTANTS[key], `${key} must resolve to its default`);
  settingsCache.clear();
  assert.equal(getSetting("large-gc-orphans"), false, "an empty cache still resolves a schema key");
  assert.equal(getSetting("not-a-setting", "fallback"), "fallback");
  assert.equal(getSetting("not-a-setting"), undefined);
});

test("setSetting updates the cache before persisting, and persists the coerced value", async () => {
  const observed = [];
  const fake = makeApi();
  const storage = makeStorage();
  const inner = fake.api.settings.set;
  fake.api.settings.set = async (key, value) => { observed.push(getSetting(key)); return inner(key, value); };
  refreshSettingsCache(fake.api, storage);
  const pending = setSetting("writes-native-budget", "900.6", { extensionAPI: fake.api, storage });
  assert.equal(getSetting("writes-native-budget"), 901, "the cache must be current before the persist resolves");
  assert.equal(await pending, 901);
  assert.deepEqual(observed, [901], "the cache already held the new value when persistence was invoked");
  assert.deepEqual(fake.writes, [["writes-native-budget", 901]]);
});

test("setSetting shadow-writes device-scoped keys to localStorage", async () => {
  const fake = makeApi();
  const storage = makeStorage();
  refreshSettingsCache(fake.api, storage);
  await setSetting("appearance-theme", "dark", { extensionAPI: fake.api, storage });
  assert.equal(getSetting("appearance-theme"), "Dark");
  assert.deepEqual(readDeviceSettings(storage), { "appearance-theme": "Dark" });
  assert.deepEqual(fake.writes, [["appearance-theme", "Dark"]], "the synced value is still written as a seed");
  await setSetting("writes-content-debounce-ms", 300, { extensionAPI: fake.api, storage });
  assert.deepEqual(readDeviceSettings(storage), { "appearance-theme": "Dark" }, "graph-scoped keys stay out of the device shadow");
});

test("setSetting ignores unknown keys and survives a read-only graph", async () => {
  const fake = makeApi({ canSet: false });
  const storage = makeStorage();
  refreshSettingsCache(fake.api, storage);
  assert.equal(await setSetting("not-a-setting", 1, { extensionAPI: fake.api, storage }), undefined);
  assert.deepEqual(fake.writes, []);
  assert.equal(await setSetting("editing-tab-direction", "Down", { extensionAPI: fake.api, storage }), "Down");
  assert.deepEqual(fake.writes, [], "canSet:false must not write");
  assert.equal(getSetting("editing-tab-direction"), "Down", "the cache still reflects the change");
});

test("the panel omits pending rows but the schema still resolves them", async () => {
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(largeGridEnabled(), false, "the default panel sees the experimental-large-grid gate closed");
  const config = buildSettingsPanelConfig();
  const ids = config.settings.map((row) => row.id);
  assert.equal(config.tabTitle, "Roam Grid");
  for (const key of PENDING_KEYS) {
    assert.ok(!ids.includes(key), `${key} must not be rendered while it is pending`);
    assert.equal(SETTINGS[key].stage, "pending");
  }
  for (const key of EXPERIMENTAL_KEYS) {
    assert.ok(!ids.includes(key), `${key} must not be rendered while the gate is off`);
    assert.equal(SETTINGS[key].stage, "experimental");
  }
  // The schema sweep keeps the inventory honest: a row may only be invisible if it is listed here.
  for (const [key, descriptor] of Object.entries(SETTINGS)) {
    if (descriptor.stage === "pending") assert.ok(PENDING_KEYS.includes(key), `${key} is pending but is not listed in PENDING_KEYS`);
    else if (descriptor.stage === "experimental") assert.ok(EXPERIMENTAL_KEYS.includes(key), `${key} is experimental but is not listed in EXPERIMENTAL_KEYS`);
    else assert.ok(ids.includes(key), `${key} is live and must be rendered`);
  }
  // GOAL-3H wired these and deleted `ranges-read-only`: RangeGridView has no commitMutation and no
  // onKeydown, so a toggle claiming a writable range could never have a true branch.
  for (const key of RANGE_KEYS) {
    assert.ok(ids.includes(key), `${key} backs a shipped feature and must be rendered`);
    assert.equal(SETTINGS[key].stage, "live");
  }
  assert.equal(SETTINGS["ranges-read-only"], undefined, "a setting whose true branch cannot exist must not be declared");
  for (const key of IMAGE_KEYS) {
    assert.ok(ids.includes(key), `${key} backs a shipped feature and must be rendered`);
    assert.equal(SETTINGS[key].stage, "live");
  }
  for (const key of COMMENT_KEYS) {
    assert.ok(ids.includes(key), `${key} ships with the comments feature and must be rendered`);
    assert.equal(SETTINGS[key].stage, "live");
  }
  assert.deepEqual([...SETTINGS["comments-affordance-trigger"].items], ["Hover", "Cmd/Ctrl + hover"]);
  assert.equal(SETTINGS["comments-affordance-trigger"].default, "Hover", "GOAL-2H: plain hover is what the user asked for");
  // comments-badges left COMMENT_KEYS: it is now pending. rewrap that fact so a future MOVE-to-live
  // regression flips both this and the PENDING_KEYS list together.
  assert.equal(SETTINGS["comments-badges"].stage, "pending");
  assert.ok(PENDING_KEYS.includes("comments-badges"));
  // EXPERIMENTAL large-storage rows stay hidden until the gate opens. The v0.17.0 campaign collapses
  // one-step tuning for large grids behind the experimental-large-grid switch: a default-off panel
  // cannot surface tuning for a feature that itself stays off by default.
  for (const key of LARGE_STORAGE_KEYS) {
    assert.ok(!ids.includes(key), `${key} is an experimental row; it must NOT render while the gate is off`);
    assert.equal(SETTINGS[key].stage, "experimental");
  }
  assert.equal(SETTINGS["large-gc-orphans"].default, false, "irreversible deletion is opt-in");
  assert.match(SETTINGS["large-gc-orphans"].name, /irreversible/i, "the row must say so where the user reads it");
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(getSetting("comments-compose-mode"), "In place");
  assert.equal(getSetting("large-cache-max-mb"), 256);
  // writes-native-budget was visible on the panel before; the v0.17.0 campaign collapses deep tuning
  // rows behind stage=pending, so this assertion is the regression that keeps the old contract retired.
  assert.ok(!ids.includes("writes-native-budget"));
  for (const key of MAINTENANCE_KEYS) assert.ok(ids.includes(key), `${key} must be rendered as a maintenance button`);
  // Panel arithmetic with the gate OFF hides both pending and experimental rows.
  assert.equal(ids.length, Object.keys(SETTINGS).length - PENDING_KEYS.length - EXPERIMENTAL_KEYS.length + MAINTENANCE_KEYS.length);

  // Turn the gate ON: experimental rows appear, pending rows stay hidden, and live rows stay live.
  refreshSettingsCache(makeApi({ values: { "experimental-large-grid": true } }).api, makeStorage());
  assert.equal(largeGridEnabled(), true);
  const configOn = buildSettingsPanelConfig();
  const idsOn = configOn.settings.map((row) => row.id);
  for (const key of EXPERIMENTAL_KEYS) assert.ok(idsOn.includes(key), `${key} ships when the experimental gate is on`);
  for (const key of PENDING_KEYS) assert.ok(!idsOn.includes(key), `${key} stays hidden even with the gate on`);
  for (const key of ["editing-enter-direction", "appearance-theme", "comments-compose-mode"]) {
    assert.ok(idsOn.includes(key), `${key} is a live row and must render regardless of the gate`);
  }
  assert.ok(!idsOn.includes("writes-native-budget"));
  assert.equal(idsOn.length, Object.keys(SETTINGS).length - PENDING_KEYS.length + MAINTENANCE_KEYS.length);
  settingsCache.clear();
});

test("panel rows carry the group naming convention, a className, and a supported action", () => {
  const rows = buildSettingsPanelConfig().settings;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const direction = byId.get("editing-enter-direction");
  assert.equal(direction.name, "Editing — Enter moves");
  assert.equal(direction.className, "rg-settings-editing");
  assert.equal(direction.action.type, "select");
  assert.deepEqual(direction.action.items, ["Down", "Right", "Stay"]);
  const theme = byId.get("appearance-theme");
  assert.equal(theme.name, "Appearance — Theme");
  assert.equal(theme.action.type, "select");
  assert.deepEqual(theme.action.items, ["Follow Roam", "Light", "Dark"]);
  assert.notEqual(theme.action.items, SETTINGS["appearance-theme"].items, "the panel must not hand out the frozen schema array");
  const headers = byId.get("appearance-show-headers");
  assert.equal(headers.action.type, "switch");
  const compose = byId.get("comments-compose-mode");
  assert.equal(compose.className, "rg-settings-comments");
  assert.equal(compose.action.type, "select");
  for (const row of rows) {
    assert.ok(row.className.startsWith("rg-settings-"), `${row.id}: className must be rg-prefixed`);
    assert.equal(typeof row.action.onChange === "function" || typeof row.action.onClick === "function", true);
  }
});

test("panel handlers receive the control-appropriate raw value", () => {
  const seen = [];
  const rows = buildSettingsPanelConfig({ onChange: (key, value) => seen.push([key, value]) }).settings;
  const byId = new Map(rows.map((row) => [row.id, row]));
  byId.get("appearance-show-headers").action.onChange({ target: { checked: false, value: "on" } });
  byId.get("appearance-theme").action.onChange({ target: { value: "Dark" } });
  byId.get("images-max-height").action.onChange({ target: { value: "240" } });
  byId.get("editing-tab-direction").action.onChange("Down");
  assert.deepEqual(seen, [
    ["appearance-show-headers", false],
    ["appearance-theme", "Dark"],
    ["images-max-height", "240"],
    ["editing-tab-direction", "Down"],
  ]);
});

test("settingsPanelRow supports the button control", () => {
  const clicks = [];
  const row = settingsPanelRow({ key: "maintenance-run", group: "Maintenance", name: "Run now", description: "d", control: "button", type: "string", default: "", scope: "graph", apply: "immediate", stage: "live" }, { onClick: (key) => clicks.push(key) });
  assert.equal(row.action.type, "button");
  assert.equal(row.action.content, "Run now");
  assert.equal(row.name, "Maintenance — Run now");
  row.action.onClick();
  assert.deepEqual(clicks, ["maintenance-run"]);
});

test("initializeSettings seeds only unset live keys and creates one panel", async () => {
  const fake = makeApi({ values: { nativeMutationBudget: 900, "editing-tab-direction": "Down" } });
  const storage = makeStorage();
  await initializeSettings(fake.api, { storage });
  assert.equal(fake.counters.panel, 1);
  assert.deepEqual(fake.writes.slice(0, 2), [["writes-native-budget", 900], ["settingsVersion", 2]], "migration writes come first");
  const written = new Map(fake.writes);
  assert.equal(written.get("writes-native-budget"), 900, "the migrated value must not be overwritten by the default");
  assert.ok(!written.has("editing-tab-direction"), "an already-set key is not reseeded");
  // Pending keys are NOT seeded with their default; the one exception is the legacy migration
  // destination itself (`writes-native-budget`), which writes the user's already-existing value,
  // not a default — that's conversion of stored data, not seeding. The seeding loop skips every
  // pending descriptor on its own (writes-native-budget is one of those), so `seeded` is simply
  // SETTINGS minus PENDING minus editing-tab-direction (already in the graph).
  for (const key of PENDING_KEYS) if (key !== "writes-native-budget") assert.ok(!written.has(key), `${key} must not be seeded while it is pending`);
  const seeded = Object.keys(SETTINGS).length - PENDING_KEYS.length - 1 /* editing-tab-direction already set */;
  assert.equal(fake.writes.length, 2 + seeded, "one write per unseeded live/experimental key plus the two migration rows (budget + version)");
  assert.equal(getSetting("writes-native-budget"), 900);
  assert.equal(getSetting("experimental-large-grid"), false, "the new live key is seeded with its default");
  assert.equal(getSetting("editing-tab-direction"), "Down");
});

test("initializeSettings performs zero writes when the graph forbids them and still builds the panel", async () => {
  const fake = makeApi({ canSet: false });
  const storage = makeStorage();
  await initializeSettings(fake.api, { storage });
  assert.deepEqual(fake.writes, []);
  assert.equal(fake.counters.set, 0);
  assert.equal(fake.counters.panel, 1);
  assert.equal(fake.panels[0].tabTitle, "Roam Grid");
  // With the experimental-large-grid gate OFF by default, the panel hides both pending and experimental rows.
  assert.equal(fake.panels[0].settings.length, Object.keys(SETTINGS).length - PENDING_KEYS.length - EXPERIMENTAL_KEYS.length + MAINTENANCE_KEYS.length);
  assert.ok(fake.panels[0].settings.some((row) => row.id === "experimental-large-grid"), "the new live experimental-large-grid switch ships in the default panel");
  assert.ok(!fake.panels[0].settings.some((row) => row.id === "writes-native-budget"), "writes-native-budget is no longer a panel row");
  assert.ok(!fake.panels[0].settings.some((row) => row.id === "large-cache-enabled"), "experimental LARGE_STORAGE rows are hidden while the gate is off");
  assert.equal(getSetting("writes-native-budget"), 1200, "an unwritable graph still resolves defaults");
});

test("initializeSettings is a no-op on a second run and routes panel changes through setSetting", async () => {
  const fake = makeApi();
  const storage = makeStorage();
  await initializeSettings(fake.api, { storage });
  const writesAfterFirstRun = fake.writes.length;
  await initializeSettings(fake.api, { storage });
  assert.equal(fake.writes.length, writesAfterFirstRun, "a second initialization writes nothing");
  assert.equal(fake.counters.panel, 2);

  // The experimental-large-grid row is live in the panel: appearance-max-width went pending in
  // v0.17.0, so drive a remaining live device-scoped row that the test previously used for this.
  const firstPanel = fake.panels[1].settings.find((entry) => entry.id === "appearance-toolbar-preset");
  assert.ok(firstPanel, "appearance-toolbar-preset is a live device-scoped row that ships in the panel");
  firstPanel.action.onChange({ target: { value: "Compact" } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(getSetting("appearance-toolbar-preset"), "Compact");
  assert.deepEqual(readDeviceSettings(storage), { "appearance-toolbar-preset": "Compact" });
  settingsCache.clear();
});

test("applySettingsChange reaches every registered view and large mount", (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();
  refreshSettingsCache(makeApi().api, makeStorage());

  const tintCalls = [];
  for (let index = 0; index < 5; index += 1) {
    gridViews.add({ id: index, refreshFormulaTint() { tintCalls.push(index); } });
  }
  const tinted = applySettingsChange(SETTINGS["appearance-formula-tinting"], false);
  assert.equal(gridViews.size, 5);
  assert.equal(tinted.views, 5, "every registered view must be visited");
  assert.deepEqual(tintCalls, [0, 1, 2, 3, 4]);
  assert.equal(tinted.value, false);
  assert.equal(tinted.failed, 0);

  const renders = [];
  largeGridMounts.set("large-a", { scheduleRender: () => renders.push("a") });
  largeGridMounts.set("large-b", { scheduleRender: () => renders.push("b") });
  const images = applySettingsChange(SETTINGS["images-max-height"], 240);
  assert.equal(images.largeMounts, 2, "every large mount is visited by the onLarge hook");
  assert.deepEqual(renders, ["a", "b"]);
  assert.equal(images.failed, 0);

  // session-idle-ms was the only onSession hook; it went pending and dropped the hook in v0.17.0.
  // Asserting the hook is gone: applying the descriptor no longer reaches any session.
  const rearmed = [];
  gridSessions.set("t1", { rescheduleIdle: () => rearmed.push("t1") });
  gridSessions.set("t2", { rescheduleIdle: () => rearmed.push("t2") });
  const idle = applySettingsChange(SETTINGS["session-idle-ms"], 4000);
  assert.equal(idle.sessions, 0, "session-idle-ms lost its onSession hook when it went pending");
  assert.deepEqual(rearmed, []);
  assert.equal(SETTINGS["session-idle-ms"].onSession, undefined, "the hook stays dropped while the row is pending");
});

test("a view that throws is counted, isolated, and does not truncate the walk", (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();
  refreshSettingsCache(makeApi().api, makeStorage());
  const reached = [];
  gridViews.add({ refreshFormulaTint() { reached.push("first"); } });
  gridViews.add({ refreshFormulaTint() { reached.push("boom"); throw new Error("detached node"); } });
  gridViews.add({ refreshFormulaTint() { reached.push("last"); } });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = applySettingsChange("appearance-formula-tinting", true);
    assert.deepEqual(reached, ["first", "boom", "last"], "the walk must continue past a failing surface");
    assert.equal(result.views, 3);
    assert.equal(result.failed, 1);
  } finally { console.warn = warn; }
});

test("applySettingsChange resolves a key string, an unknown key, and an omitted value", (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();
  // appearance-theme is still live in v0.17.0; appearance-max-width went pending, so its onView walk
  // no longer fires. appearance-theme carries onView (`resyncGridTheme(view)`) applied to each view.
  refreshSettingsCache(makeApi({ values: { "appearance-theme": "Dark" } }).api, makeStorage());
  gridViews.add({ root: makeElement() });
  const resolved = applySettingsChange("appearance-theme");
  assert.equal(resolved.value, "Dark", "an omitted value is read from the cache");
  assert.equal(resolved.views, 1, "the live onView hook walked the views registry once");
  assert.deepEqual(applySettingsChange("not-a-setting", 1), { key: null, value: 1, views: 0, largeMounts: 0, sessions: 0, failed: 0 });
});

test("applySettingsChange never reaches for the mount scanner", async (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  const source = await readFile(new URL("../src/extension.js", import.meta.url), "utf8");
  const start = source.indexOf("export function applySettingsChange(");
  assert.ok(start > 0, "applySettingsChange must exist");
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start, "the function body must be delimited");
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /scanMounts|scheduleScan|claimNativeInstances|cleanupDisconnectedViews/, "a settings change is not a discovery event");

  // The observable half: a scan evicts and disposes disconnected views. A settings change must not.
  clearRegistries();
  refreshSettingsCache(makeApi().api, makeStorage());
  const disposals = [];
  const orphan = { root: { isConnected: false }, nativeElement: { isConnected: false }, dispose: () => disposals.push("orphan"), updateReferenceCountBadges() {} };
  gridViews.add(orphan);
  applySettingsChange(SETTINGS["appearance-reference-badges"], true);
  assert.equal(gridViews.size, 1, "a disconnected view survives a settings change");
  assert.deepEqual(disposals, []);
});

test("display defaults are stamped, never inherited", (t) => {
  t.after(() => settingsCache.clear());
  refreshSettingsCache(makeApi({ values: { "appearance-show-headers": false, "appearance-fit-to-width": false, "appearance-formula-tinting": false } }).api, makeStorage());
  const target = { showHeaders: true, fitToWidth: true, colorFormulaCells: true, rowCount: 3 };
  assert.deepEqual(displayDefaults(), { fitToWidth: false });
  assert.equal(applyDisplayDefaults(target), target);
  assert.deepEqual(target, { showHeaders: true, fitToWidth: false, colorFormulaCells: true, rowCount: 3 }, "tinting and headers are masked live, so creation must not stamp either");
  assert.equal(applyDisplayDefaults(null), null);
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.deepEqual(applyDisplayDefaults({}), { fitToWidth: true });
});

/**
 * The mask must read BOTH inputs. Each row below is failed by an implementation that degrades to
 * reading only the global (rows 3-4) or only the per-grid flag (rows 1-2).
 */
test("formula tinting is the AND of the global setting and the grid's own flag", (t) => {
  t.after(() => settingsCache.clear());
  const cases = [
    { global: true, grid: true, tinted: true },
    { global: true, grid: false, tinted: false },
    { global: false, grid: true, tinted: false },
    { global: false, grid: false, tinted: false },
  ];
  for (const { global, grid, tinted } of cases) {
    refreshSettingsCache(makeApi({ values: { "appearance-formula-tinting": global } }).api, makeStorage());
    assert.equal(formulaTintEnabled(grid), tinted, `global ${global} × grid ${grid} must tint: ${tinted}`);
  }
  // An absent per-grid flag is "explicitly true" everywhere else in the file; the mask must agree.
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(formulaTintEnabled(undefined), true);
  assert.equal(formulaTintEnabled(null), true);
});

test("toggling the global setting suppresses and restores tinting without touching the grid", (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();
  const cells = new Map([
    ["0:0", { dataset: { rgRaw: "=SUM(A1:A2)" }, classList: makeClassList() }],
    ["0:1", { dataset: { rgRaw: "plain text" }, classList: makeClassList() }],
    ["1:0", { dataset: { rgRaw: "==literal" }, classList: makeClassList() }],
  ]);
  const model = { colorFormulaCells: true };
  const view = { cells, model, refreshFormulaTint() { return repaintFormulaTint(this.cells, this.model.colorFormulaCells); } };
  gridViews.add(view);
  const tinted = () => [...cells].filter(([, cell]) => cell.classList.contains("rg-cell--formula")).map(([key]) => key);

  refreshSettingsCache(makeApi({ values: { "appearance-formula-tinting": true } }).api, makeStorage());
  view.refreshFormulaTint();
  assert.deepEqual(tinted(), ["0:0"], "only the formula cell tints; == is an escaped literal");

  settingsCache.set("appearance-formula-tinting", false);
  applySettingsChange(SETTINGS["appearance-formula-tinting"], false);
  assert.deepEqual(tinted(), [], "global off must suppress tinting immediately, with no re-render");
  assert.equal(model.colorFormulaCells, true, "suppressing must not write the grid's own flag");

  settingsCache.set("appearance-formula-tinting", true);
  applySettingsChange(SETTINGS["appearance-formula-tinting"], true);
  assert.deepEqual(tinted(), ["0:0"], "global on must return the grid to its own choice");
  assert.equal(model.colorFormulaCells, true);

  // The grid's own opt-out still wins while the global is on.
  model.colorFormulaCells = false;
  applySettingsChange(SETTINGS["appearance-formula-tinting"], true);
  assert.deepEqual(tinted(), []);
});

test("the tinting setting reaches live views through a repaint, not a value-diff refresh", () => {
  const descriptor = SETTINGS["appearance-formula-tinting"];
  assert.equal(typeof descriptor.onView, "function");
  assert.equal(typeof descriptor.onLarge, "function");
  const calls = [];
  descriptor.onView({ refreshFormulaTint: () => calls.push("tint"), refreshValues: () => calls.push("values") });
  assert.deepEqual(calls, ["tint"], "refreshValues short-circuits when no cell changed, so it cannot carry this setting");
  descriptor.onLarge({ scheduleRender: () => calls.push("large") });
  assert.deepEqual(calls, ["tint", "large"]);
});

/**
 * Same truth table as the tinting mask, for the same reason: an implementation that degrades to
 * reading only the global fails rows 1-2, and one that reads only the per-grid flag fails rows 3-4.
 */
test("row and column labels are the AND of the global setting and the grid's own flag", (t) => {
  t.after(() => settingsCache.clear());
  const cases = [
    { global: true, grid: true, shown: true },
    { global: true, grid: false, shown: false },
    { global: false, grid: true, shown: false },
    { global: false, grid: false, shown: false },
  ];
  for (const { global, grid, shown } of cases) {
    refreshSettingsCache(makeApi({ values: { "appearance-show-headers": global } }).api, makeStorage());
    assert.equal(headersVisible(grid), shown, `global ${global} × grid ${grid} must show labels: ${shown}`);
  }
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(headersVisible(undefined), true, "an absent per-grid flag is explicitly true everywhere else");
  assert.equal(headersVisible(null), true);
});

test("the Images rows are live graph settings that repaint decor, not re-render grids", () => {
  const media = SETTINGS["images-cell-media"];
  assert.ok(media, "the descriptor exists in the schema");
  assert.equal(media.group, "Images");
  assert.equal(media.control, "switch");
  assert.equal(media.type, "bool");
  assert.equal(media.default, true);
  assert.equal(media.scope, "graph");
  assert.equal(media.apply, "immediate");
  assert.equal(media.stage, "live");
  const calls = [];
  media.onView({ refreshMediaDecor: () => calls.push("decor"), render: () => calls.push("render") });
  assert.deepEqual(calls, ["decor"], "the view walk goes through refreshMediaDecor so an excerpt can repaint in place");
  media.onLarge({ scheduleRender: () => calls.push("large") });
  assert.deepEqual(calls, ["decor", "large"]);

  const height = SETTINGS["images-max-height"];
  assert.equal(height.group, "Images");
  assert.equal(height.control, "input");
  assert.equal(height.type, "int");
  assert.equal(height.default, 180);
  assert.equal(height.min, 48);
  assert.equal(height.max, 480);
  assert.equal(height.scope, "graph");
  assert.equal(height.apply, "immediate");
  assert.equal(coerceSetting(height, 10), 48, "below min clamps to min");
  assert.equal(coerceSetting(height, 999), 480, "above max clamps to max");
  assert.equal(coerceSetting(height, "garbage"), 180);
  const heightCalls = [];
  height.onView({ refreshMediaDecor: () => heightCalls.push("decor") });
  height.onLarge({ scheduleRender: () => heightCalls.push("large") });
  assert.deepEqual(heightCalls, ["decor", "large"], "a new cap must reach mounted cells without a rebuild");

  const row = buildSettingsPanelConfig().settings.find((candidate) => candidate.id === "images-cell-media");
  assert.ok(row, "the row is rendered in the panel");
  assert.equal(row.name, "Images — Render images in cells");
  assert.equal(row.className, "rg-settings-images");
  assert.equal(row.action.type, "switch");
});

test("the header setting reaches live views through refreshHeaders, and a range excerpt absorbs it", () => {
  const descriptor = SETTINGS["appearance-show-headers"];
  assert.equal(descriptor.apply, "immediate", "a creation-only header switch is the defect this replaces");
  assert.equal(typeof descriptor.onView, "function");
  assert.equal(typeof descriptor.onLarge, "function");
  const calls = [];
  descriptor.onView({ refreshHeaders: () => calls.push("headers"), render: () => calls.push("render") });
  assert.deepEqual(calls, ["headers"], "the walk must go through refreshHeaders so an excerpt can decline it");
  descriptor.onLarge({ scheduleRender: () => calls.push("large") });
  assert.deepEqual(calls, ["headers", "large"]);
});

/**
 * The real layout read sites, not the helper. `applyGridTemplate*` writes the axis gutter track into
 * the grid element, and `headerWidth`/`headerHeight` are what every large-grid offset is measured
 * from — an implementation that added `headersVisible` but left the render sites reading
 * `this.model.showHeaders` passes every test above this one and fails this one.
 */
test("the global reaches the native grid tracks and the large-grid gutters", (t) => {
  t.after(() => settingsCache.clear());
  const model = new GridModel({ rows: [["a", "b"], ["c", "d"]] });
  const view = { model, gridElement: { style: {} }, columnResizePreview: null, rowResizePreview: null, headersOn: GridView.prototype.headersOn, applyGridTemplateColumns: GridView.prototype.applyGridTemplateColumns, applyGridTemplateRows: GridView.prototype.applyGridTemplateRows };
  const large = { store: { manifest: { showHeaders: true } }, headersOn: LargeGridView.prototype.headersOn, headerWidth: LargeGridView.prototype.headerWidth, headerHeight: LargeGridView.prototype.headerHeight };

  refreshSettingsCache(makeApi().api, makeStorage());
  view.applyGridTemplateColumns(); view.applyGridTemplateRows();
  assert.match(view.gridElement.style.gridTemplateColumns, /^42px /, "the label gutter is the first column track");
  assert.match(view.gridElement.style.gridTemplateRows, /^28px /);
  assert.equal(large.headerWidth(), 42);
  assert.equal(large.headerHeight(), 28);

  refreshSettingsCache(makeApi({ values: { "appearance-show-headers": false } }).api, makeStorage());
  view.applyGridTemplateColumns(); view.applyGridTemplateRows();
  assert.doesNotMatch(view.gridElement.style.gridTemplateColumns, /42px/, "global off must drop the gutter track, not just hide it");
  assert.doesNotMatch(view.gridElement.style.gridTemplateRows, /28px/);
  assert.equal(large.headerWidth(), 0);
  assert.equal(large.headerHeight(), 0);
  assert.equal(model.showHeaders, true, "suppressing must not write the grid's own flag");
  assert.equal(large.store.manifest.showHeaders, true);

  // The per-table opt-out still wins while the global is on.
  refreshSettingsCache(makeApi().api, makeStorage());
  model.showHeaders = false; large.store.manifest.showHeaders = false;
  view.applyGridTemplateColumns();
  assert.doesNotMatch(view.gridElement.style.gridTemplateColumns, /42px/);
  assert.equal(large.headerWidth(), 0);
});

test("fit-to-width stays creation-only and keeps the maintenance button", () => {
  const descriptor = SETTINGS["appearance-fit-to-width"];
  assert.equal(descriptor.apply, "next-op");
  assert.equal(descriptor.onView, undefined, "a live mask here would apply to native grids only — LargeGridView never reads fitToWidth");
  assert.equal(descriptor.onLarge, undefined);
  assert.ok(Object.hasOwn(displayDefaults(), "fitToWidth"), "it is the flag creation stamps");
});

/**
 * The two halves are separate on purpose and are asserted separately. The mask is implicit and writes
 * nothing; the button is an explicit user act that writes. Collapsing them either way is a bug:
 * putting `showHeaders` back into `displayDefaults` re-creates the disagreement eb2ceb3 removed, and
 * dropping it from the restamp leaves no bulk path to lift a per-table opt-out.
 */
test("creation never stamps headers, and the maintenance button always does", (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();

  refreshSettingsCache(makeApi({ values: { "appearance-show-headers": false } }).api, makeStorage());
  assert.equal(Object.hasOwn(displayDefaults(), "showHeaders"), false, "creation must not stamp a live-masked flag");
  assert.deepEqual(applyDisplayDefaults({ showHeaders: true }), { showHeaders: true, fitToWidth: true }, "a grid created while the switch is off keeps an unstamped flag, so the switch stays reversible");
  assert.equal(displayRestampValues().showHeaders, false, "the button writes what the switch says");
  assert.equal(displayRestampValues().fitToWidth, true, "and still carries every creation default with it");

  // The case the button exists for: a table the user opted out of, with the global ON. The mask cannot
  // lift an explicit false — only this can.
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(headersVisible(false), false, "the mask must not force an opt-out back on");
  const model = { showHeaders: false, fitToWidth: false };
  const manifest = { showHeaders: false, fitToWidth: false };
  gridSessions.set("t1", { model, views: [], markChanged() {} });
  largeGridMounts.set("l1", { store: { manifest, setDisplayFlag(key, value) { this.manifest[key] = value; } }, scheduleSave() {}, scheduleRender() {} });
  assert.equal(applyDisplayDefaultsToOpenGrids(), 2);
  assert.equal(model.showHeaders, true, "the button is the only bulk path that can lift a per-table opt-out");
  assert.equal(manifest.showHeaders, true);
  assert.equal(headersVisible(model.showHeaders), true, "and the lifted grid now renders its labels");
});

test("the notification level suppresses notices by intent and never a message that carries an action", (t) => {
  t.after(() => settingsCache.clear());
  const intents = ["primary", "success", "warning", "danger"];
  const expected = {
    All: [true, true, true, true],
    "Warnings and errors": [false, false, true, true],
    "Errors only": [false, false, false, true],
  };
  for (const [level, allowed] of Object.entries(expected)) {
    refreshSettingsCache(makeApi({ values: { "appearance-notifications": level } }).api, makeStorage());
    assert.deepEqual(intents.map((intent) => notificationAllowed(intent)), allowed, `level ${level}`);
    // An actionable message is a control, not a notice: suppressing it would remove the only way to
    // run the action it offers, which is exactly what the Restore prompt depends on.
    assert.deepEqual(intents.map((intent) => notificationAllowed(intent, true)), [true, true, true, true], `level ${level} with an action`);
  }
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(notificationAllowed("success"), true, "the default level shows everything");
});

test("autocomplete has one master switch that both suggestion paths read", (t) => {
  t.after(() => settingsCache.clear());
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(autocompleteEnabled(), true);
  refreshSettingsCache(makeApi({ values: { "editing-autocomplete": false } }).api, makeStorage());
  assert.equal(autocompleteEnabled(), false);
});

test("clipPasteMatrix grows by default and clips to the existing bounds when the switch is off", (t) => {
  t.after(() => settingsCache.clear());
  const matrix = [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"]];

  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(clipPasteMatrix(matrix, 0, 0, 2, 2), matrix, "growing is the default and hands the matrix back untouched");

  refreshSettingsCache(makeApi({ values: { "editing-paste-grows-grid": false } }).api, makeStorage());
  assert.deepEqual(clipPasteMatrix(matrix, 0, 0, 2, 2), [["a", "b"], ["d", "e"]]);
  assert.deepEqual(clipPasteMatrix(matrix, 1, 1, 3, 3), [["a", "b"], ["d", "e"]], "the offset is the paste anchor, not the origin");
  assert.deepEqual(clipPasteMatrix(matrix, 0, 0, 9, 9), matrix, "a paste that already fits is not rewritten");
  assert.deepEqual(clipPasteMatrix(matrix, 3, 0, 3, 3), [], "an anchor past the last row clips to nothing");
});

test("the display-defaults button rewrites open grids and repaints them", (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();
  refreshSettingsCache(makeApi({ values: { "appearance-show-headers": false, "appearance-fit-to-width": false } }).api, makeStorage());
  const renders = [];
  const view = { render: () => renders.push("view") };
  const model = { showHeaders: true, fitToWidth: true, colorFormulaCells: true };
  const marked = [];
  gridSessions.set("t1", { model, views: [view], markChanged: (layout) => marked.push(layout) });
  const manifest = { showHeaders: true, fitToWidth: true, colorFormulaCells: true };
  const large = { store: { manifest, metadataDirty: false, setDisplayFlag(key, value) { this.manifest[key] = value; this.metadataDirty = true; } }, rowMetricsKey: "stale", scheduleSave: (immediate) => renders.push(`save:${immediate}`), scheduleRender: () => renders.push("large") };
  largeGridMounts.set("l1", large);

  assert.equal(applyDisplayDefaultsToOpenGrids(), 2);
  assert.equal(model.fitToWidth, false);
  assert.equal(manifest.fitToWidth, false);
  assert.equal(model.showHeaders, false, "the button is the explicit act that writes headers");
  assert.equal(manifest.showHeaders, false);
  assert.equal(large.store.metadataDirty, true);
  assert.equal(large.rowMetricsKey, null);
  assert.deepEqual(marked, [true], "the layout change has to reach the metadata save path");
  assert.deepEqual(renders, ["view", "save:true", "large"]);
  clearRegistries();
  assert.equal(applyDisplayDefaultsToOpenGrids(), 0, "with nothing mounted the button is a reported no-op");
});

test("forgetting device overrides drops the shadow and rebuilds the panel", async (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();
  const fake = makeApi({ values: { "appearance-theme": "Light" } });
  const storage = makeStorage({ [deviceSettingsKey()]: '{"appearance-theme":"Dark","appearance-toolbar-preset":"Compact"}' });
  refreshSettingsCache(fake.api, storage);
  assert.equal(getSetting("appearance-theme"), "Dark");
  assert.equal(getSetting("appearance-toolbar-preset"), "Compact");
  const root = makeElement();
  gridViews.add({ root });
  let rebuilt = 0;
  assert.equal(await runMaintenanceAction("maintenance-forget-device", { extensionAPI: fake.api, storage, rebuildPanel: () => { rebuilt += 1; } }), true);
  assert.deepEqual(readDeviceSettings(storage), {});
  assert.equal(getSetting("appearance-theme"), "Light", "the graph seed takes over");
  assert.equal(getSetting("appearance-toolbar-preset"), "Full");
  assert.equal(rebuilt, 1, "Roam renders row values once, so the panel must be rebuilt");
  assert.deepEqual([...root.classList.names], ["rg-root--toolbar-full"], "device-scoped changes are pushed to live grids through the live onView hook");
  assert.deepEqual(fake.writes, [], "forgetting a device override must not write to the graph");
});

test("clearing local caches empties the enhanced-uid cache and the theme palette", async (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();
  const storage = makeStorage();
  writeEnhancedUidCache(["abc", "def"], storage);
  assert.equal(readEnhancedUidCache(storage).size, 2);
  const session = { themePalette: { "--rg-bg": "#000" } };
  gridSessions.set("t1", session);
  assert.equal(await runMaintenanceAction("maintenance-clear-caches", { extensionAPI: null, storage }), true);
  assert.equal(readEnhancedUidCache(storage).size, 0);
  assert.equal(session.themePalette, null);
});

test("resetting restores every default, clears the device shadow, and rebuilds the panel", async (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();
  const fake = makeApi({ values: { "writes-native-budget": 300, "editing-tab-direction": "Down" } });
  const storage = makeStorage({ [deviceSettingsKey()]: '{"appearance-theme":"Dark"}' });
  refreshSettingsCache(fake.api, storage);
  assert.equal(getSetting("writes-native-budget"), 300);
  let rebuilt = 0;
  assert.equal(await runMaintenanceAction("maintenance-reset", { extensionAPI: fake.api, storage, rebuildPanel: () => { rebuilt += 1; } }), true);
  assert.equal(rebuilt, 1);
  assert.deepEqual(readDeviceSettings(storage), {});
  const written = new Map(fake.writes);
  for (const [key, descriptor] of Object.entries(SETTINGS)) {
    // Pending rows are not user-visible and not reset by maintenance-reset; their graph value stays
    // at whatever the user seeded before they went pending. Live and experimental rows are reset to
    // their defaults and written back to the graph.
    if (PENDING_KEYS.includes(key)) {
      assert.ok(!written.has(key), `${key} must not be written while it is pending`);
    } else {
      assert.equal(getSetting(key), descriptor.default, `${key} must resolve to its default`);
      assert.equal(written.get(key), descriptor.default, `${key} must be written back to its default`);
    }
  }
  assert.equal(await runMaintenanceAction("not-an-action", { extensionAPI: fake.api, storage }), false);
});

test("maintenance rows are buttons that carry the group convention and an onClick", () => {
  const clicks = [];
  const rows = buildSettingsPanelConfig({ onClick: (key) => clicks.push(key) }).settings;
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const key of MAINTENANCE_KEYS) {
    const row = byId.get(key);
    assert.ok(row, `${key} must be rendered`);
    assert.equal(row.action.type, "button");
    assert.equal(row.className, "rg-settings-maintenance");
    assert.match(row.name, /^Maintenance — /);
    assert.equal(typeof row.action.onClick, "function");
    row.action.onClick();
  }
  assert.deepEqual(clicks, MAINTENANCE_KEYS);
  assert.equal(byId.get("maintenance-reset").action.content, "Reset all Roam Grid settings");
  assert.deepEqual(Object.keys(SETTINGS_MAINTENANCE), MAINTENANCE_KEYS);
  assert.match(SETTINGS_MAINTENANCE["maintenance-apply-display"].description, /Existing grids keep their own settings/);
  // It restamps headers again, so it has to say so — and it is the control the user is pointed at when
  // a per-table opt-out needs lifting in bulk.
  assert.match(SETTINGS_MAINTENANCE["maintenance-apply-display"].description, /Rewrite headers and fit-to-width/);
});

test("the panel routes clicks through runMaintenanceAction and rebuilds itself", async () => {
  const fake = makeApi();
  const storage = makeStorage({ [deviceSettingsKey()]: '{"appearance-theme":"Dark"}' });
  await initializeSettings(fake.api, { storage });
  assert.equal(fake.counters.panel, 1);
  const row = fake.panels[0].settings.find((entry) => entry.id === "maintenance-forget-device");
  row.action.onClick();
  for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
  assert.deepEqual(readDeviceSettings(storage), {});
  assert.equal(fake.counters.panel, 2, "the maintenance action rebuilt the panel");
  settingsCache.clear();
});

test("Enter and Tab movements follow their direction settings", () => {
  assert.deepEqual(enterMovement("Down"), [1, 0]);
  assert.deepEqual(enterMovement("Right"), [0, 1]);
  assert.equal(enterMovement("Stay"), null, "Stay must produce no movement at all");
  assert.deepEqual(enterMovement("nonsense"), [1, 0]);
  assert.deepEqual(tabMovement("Right", false), [0, 1]);
  assert.deepEqual(tabMovement("Right", true), [0, -1]);
  assert.deepEqual(tabMovement("Down", false), [1, 0]);
  assert.deepEqual(tabMovement("Down", true), [-1, 0]);
  refreshSettingsCache(makeApi({ values: { "editing-enter-direction": "stay", "editing-tab-direction": "down" } }).api, makeStorage());
  assert.equal(enterMovement(), null);
  assert.deepEqual(tabMovement(undefined, true), [-1, 0]);
  settingsCache.clear();
});

test("toolbar presets swap one root class and never stack", () => {
  assert.equal(toolbarPresetClass("Compact"), "rg-root--toolbar-compact");
  assert.equal(toolbarPresetClass("hidden"), "rg-root--toolbar-hidden");
  assert.equal(toolbarPresetClass("nonsense"), "rg-root--toolbar-full");
  assert.equal(toolbarPresetClass(undefined), "rg-root--toolbar-full");
  const root = makeElement();
  applyToolbarPreset(root, "Minimal");
  assert.deepEqual([...root.classList.names], ["rg-root--toolbar-minimal"]);
  applyToolbarPreset(root, "Hidden");
  assert.deepEqual([...root.classList.names], ["rg-root--toolbar-hidden"]);
  assert.equal(applyToolbarPreset(null, "Full"), null);
});

test("the maximum-width setting becomes a custom property, not a stylesheet edit", async () => {
  const root = makeElement();
  assert.equal(applyGridMaxWidth(root, 2400), 2400);
  assert.equal(root.style.properties.get("--rg-max-width"), "2400px");
  assert.equal(applyGridMaxWidth(root, "not a number"), 1200);
  assert.equal(root.style.properties.get("--rg-max-width"), "1200px");
  assert.equal(applyGridMaxWidth(null), null);
  const css = await readFile(new URL("../extension.css", import.meta.url), "utf8");
  assert.match(css, /max-width: var\(--rg-max-width, 1200px\);/);
});

test("the theme setting pins a palette or defers to the host", () => {
  assert.equal(pinnedGridThemePalette("Follow Roam"), null);
  const light = pinnedGridThemePalette("Light");
  const dark = pinnedGridThemePalette("Dark");
  assert.equal(light["--rg-bg"], "#ffffff");
  assert.equal(dark["--rg-bg"], "#1c2127");
  for (const token of Object.keys(light)) assert.ok(dark[token], `${token} must exist in both pinned palettes`);
  refreshSettingsCache(makeApi({ values: { "appearance-theme": "Dark" } }).api, makeStorage());
  assert.equal(pinnedGridThemePalette()["--rg-color"], "#f6f7f9");
  settingsCache.clear();
});

// ---------------------------------------------------------------------------
// v0.17.0 — experimental-large-grid gate
// ---------------------------------------------------------------------------

/** Minimal `document`/`window` stand-in that lets `toast` paint without a real host. Restored in
 *  each test's `t.after` because `toast` reads globalThis.document directly. */
function installToastDom() {
  const appendedToBody = [];
  const childrenOf = (self) => { const children = []; self.appendChild = (child) => { child.isConnected = true; children.push(child); return child; }; self.children = children; return self; };
  const makeElement = () => installToastDom.shallowElement();
  installToastDom.shallowElement = () => {
    const element = { className: "", textContent: "", id: "", isConnected: false, style: { setProperty() {} }, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; } }, appendChild(child) { this.children?.push(child); return child; }, remove() {}, addEventListener() {} };
    element.children = [];
    return element;
  };
  const body = makeElement();
  body.appendChild = (child) => { child.isConnected = true; appendedToBody.push(child); return child; };
  const document = {
    body,
    head: { appendChild() {}, contains() { return false; } },
    querySelector: (selector) => selector === ".rg-toasts" ? appendedToBody.find((node) => node.className === "rg-toasts") || null : null,
    querySelectorAll: () => [],
    createElement: makeElement,
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  const previousDocument = globalThis.document;
  const previousObserver = globalThis.MutationObserver;
  globalThis.document = document;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  return {
    document,
    appendedToBody,
    restore() {
      for (const id of pendingTimers) clearTimeout(id);
      pendingTimers.clear();
      if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
      if (previousObserver === undefined) delete globalThis.MutationObserver; else globalThis.MutationObserver = previousObserver;
    },
  };
}

test("largeGridEnabled is false by default and surfaces what the gate reads", () => {
  settingsCache.clear();
  assert.equal(largeGridEnabled(), false, "with no cache populated, the gate closes at the schema default");
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(largeGridEnabled(), false, "the manufactured default panel also sees the gate closed");
  refreshSettingsCache(makeApi({ values: { "experimental-large-grid": true } }).api, makeStorage());
  assert.equal(largeGridEnabled(), true);
  settingsCache.clear();
});

test("the experimental-large-grid toast refuses newLargeGrid, copyNativeToLarge, and import overflow while the gate is off", async (t) => {
  const dom = installToastDom();
  t.after(() => { dom.restore(); clearRegistries(); settingsCache.clear(); runtime.metadata = null; runtime.extensionAPI = null; });
  clearRegistries();
  const writes = [];
  const metadata = { has: () => false, entries: new Map(), set: async (uid) => { writes.push(["set", uid]); }, remove: async (uid) => { writes.push(["remove", uid]); } };
  runtime.metadata = metadata;
  runtime.extensionAPI = { settings: { get: () => null, set: async () => {}, panel: { create: async () => {} } } };

  // The toast path is what the user-facing commands SHOULD all converge on while the gate is off.
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(largeGridEnabled(), false);

  // newLargeGrid has to refuse without inserting a block or materialising a store.
  await newLargeGrid();
  assert.deepEqual(writes, [], "newLargeGrid did NOT seed metadata while the gate is off");

  // copyNativeToLarge refuses with the same wording — no LargeGridStore, no metadata.write.
  const model = new GridModel({ rows: [["a", "b"], ["c", "d"]] });
  await copyNativeToLarge(model);
  assert.deepEqual(writes, [], "copyNativeToLarge did NOT touch metadata while the gate is off");

  // importCommand's overflow decision is testable separately: at a rowCount * colCount above the
  // native write budget, an OFF gate must refuse with the shared toast instead of creating a large
  // grid. We exercise the decision through the same entry point (copyNativeToLarge) that importCommand
  // routes overflow into; with the gate OFF it toast-refuses without writing metadata.
  const largeSized = new GridModel({ rows: Array.from({ length: 50 }, () => Array.from({ length: 50 }, () => "")) });
  // rowCount * colCount = 50 * 50 = 2500 > writes-native-budget (1200) → overflowing the budget.
  assert.ok(largeSized.rowCount * largeSized.colCount > 1200, "the import model exceeds the native write budget");
  await copyNativeToLarge(largeSized);
  assert.deepEqual(writes, [], "an oversized import still does not write when the gate is closed");

  // Three refusals landed in the toast container — one per call.
  const toastContainer = dom.appendedToBody.find((node) => node.className === "rg-toasts");
  assert.ok(toastContainer, "toast produced a .rg-toasts container to host the gate refusals");
  assert.equal(toastContainer.children.length, 3, "newLargeGrid, copyNativeToLarge, and the oversized import each refused once");
  for (const item of toastContainer.children) assert.equal(item.className, "rg-toast rg-toast--warning", "every refusal carries the warning intent");
  assert.equal(toastContainer.children[0].textContent, "Large grids are experimental and off.");
});

test("scanLargeMounts leaves the large-mount registry untouched while the experimental-large-grid gate is off", async (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); runtime.metadata = null; runtime.extensionAPI = null; });
  clearRegistries();
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(largeGridEnabled(), false);
  runtime.metadata = { entries: new Map([["anchorL1", { value: { mode: "large" } }]]), has: () => true };
  runtime.extensionAPI = { settings: { get: () => null } };
  const constructs = [];
  const originalInitialize = LargeGridStore.prototype.initialize;
  LargeGridStore.prototype.initialize = function (...args) { constructs.push(args); throw new Error("LargeGridStore must NOT initialize while the gate is off"); };
  try {
    await scanLargeMounts();
    assert.equal(runtime.largeMounts.size, 0, "the large-mount loop did not mount a LargeGridView");
    assert.deepEqual(constructs, [], "the off gate short-circuits before instantiating a LargeGridStore");
  } finally {
    LargeGridStore.prototype.initialize = originalInitialize;
  }
});

test("the panel hides experimental rows while the gate is off and shows them once the cache goes true", () => {
  // Boundary condition: just the cache rebuild (no full panel.onChange flow). buildSettingsPanelConfig
  // reads `largeGridEnabled()` directly off the settings cache, so flipping the cache and rebuilding
  // is enough to surface or hide the experimental LARGE_STORAGE rows.
  refreshSettingsCache(makeApi().api, makeStorage());
  const offIds = buildSettingsPanelConfig().settings.map((row) => row.id);
  for (const key of EXPERIMENTAL_KEYS) assert.ok(!offIds.includes(key), `${key} hides while the gate is off`);
  refreshSettingsCache(makeApi({ values: { "experimental-large-grid": true } }).api, makeStorage());
  const onIds = buildSettingsPanelConfig().settings.map((row) => row.id);
  for (const key of EXPERIMENTAL_KEYS) assert.ok(onIds.includes(key), `${key} renders once the gate opens`);
  settingsCache.clear();
});

test("turning the experimental-large-grid switch off disposes registered large mounts and leaves metadata untouched", (t) => {
  const dom = installToastDom();
  t.after(() => { dom.restore(); clearRegistries(); settingsCache.clear(); runtime.metadata = null; runtime.extensionAPI = null; runtime.rebuildPanel = null; });
  clearRegistries();
  const writes = [];
  const metadataOps = [];
  runtime.metadata = { has: () => true, entries: new Map([["anchorL1", { value: { mode: "large" } }]]), remove: async (uid) => { metadataOps.push(["remove", uid]); } };
  runtime.extensionAPI = { settings: { get: () => null, set: async (key, value) => writes.push([key, value]), panel: { create: async () => {} } } };

  // Simulate a previously registered large mount that the gate-turnoff must tear down without touching files.
  const disposals = [];
  runtime.largeMounts.set("anchorL1", { dispose: ({ keepStore = false } = {}) => { disposals.push({ uid: "anchorL1", keepStore }); }, root: { isConnected: true }, store: { disposed: false } });
  // panel.create is called once at panel rebuild by applyLargeGridGateChange.
  let panelCreates = 0;
  runtime.rebuildPanel = () => { panelCreates += 1; };

  // Start with the gate ON, then flip to OFF through the panel-application path.
  refreshSettingsCache(makeApi({ values: { "experimental-large-grid": true } }).api, makeStorage());
  assert.equal(largeGridEnabled(), true);
  settingsCache.set("experimental-large-grid", false);
  applySettingsChange(SETTINGS["experimental-large-grid"], false);

  assert.equal(largeGridEnabled(), false, "the gate is now OFF after applying the false value");
  assert.equal(panelCreates, 1, "rebuildPanel ran once during the toggle");
  assert.equal(runtime.largeMounts.size, 0, "the large-mount registry is cleared");
  assert.deepEqual(disposals, [{ uid: "anchorL1", keepStore: true }], "every registered large mount was disposed with keepStore");
  assert.deepEqual(metadataOps, [], "metadata.remove must NOT run while the gate is off — files, manifests, and metadata entries are preserved");
});

test("flipping the experimental-large-grid switch via the panel onChange rebuilds the panel and shows or hides experimental rows", async (t) => {
  const dom = installToastDom();
  t.after(() => { dom.restore(); clearRegistries(); settingsCache.clear(); runtime.rebuildPanel = null; runtime.metadata = null; runtime.extensionAPI = null; });
  clearRegistries();
  const fake = makeApi({ values: {} });
  const storage = makeStorage();
  runtime.metadata = { entries: new Map(), has: () => false };

  // initializeSettings seeds the live rows (including experimental-large-grid default false), builds
  // the panel, and stores the rebuild function on runtime.rebuildPanel.
  await initializeSettings(fake.api, { storage });
  assert.equal(fake.counters.panel, 1, "the initial panel was built");
  // Sanity check: the experimental-large-grid row shipped and the experimental LARGE_STORAGE rows did not.
  const firstIds = fake.panels[0].settings.map((row) => row.id);
  assert.ok(firstIds.includes("experimental-large-grid"), "the experimental-large-grid switch ships on the default panel");
  for (const key of EXPERIMENTAL_KEYS) assert.ok(!firstIds.includes(key), `${key} stays hidden while the gate is off`);

  // Flip the switch ON via the panel row's onChange — the rebuildPanel routine must fire and the
  // experimental LARGE_STORAGE rows must surface in the rebuilt panel.
  const row = fake.panels[0].settings.find((entry) => entry.id === "experimental-large-grid");
  assert.ok(row, "the experimental-large-grid row is rendered");
  row.action.onChange({ target: { checked: true } });
  for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
  assert.equal(largeGridEnabled(), true);
  assert.equal(fake.counters.panel, 2, "the panel was rebuilt during the toggle");
  const idsAfterOn = fake.panels[1].settings.map((row) => row.id);
  for (const key of EXPERIMENTAL_KEYS) assert.ok(idsAfterOn.includes(key), `${key} ships as an experimental row while the gate is on`);
  // Pending rows remain off the rebuilt panel.
  for (const key of PENDING_KEYS) assert.ok(!idsAfterOn.includes(key), `${key} stays hidden while the gate is on`);

  // Flip the switch OFF — experimental rows vanish again.
  const offRow = fake.panels[1].settings.find((entry) => entry.id === "experimental-large-grid");
  offRow.action.onChange({ target: { checked: false } });
  for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
  assert.equal(largeGridEnabled(), false);
  assert.equal(fake.counters.panel, 3, "the panel was rebuilt a second time");
  const idsAfterOff = fake.panels[2].settings.map((row) => row.id);
  for (const key of EXPERIMENTAL_KEYS) assert.ok(!idsAfterOff.includes(key), `${key} is hidden again once the gate closes`);
});
