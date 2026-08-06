import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SETTINGS,
  SETTINGS_MAINTENANCE,
  applyDisplayDefaults,
  applyDisplayDefaultsToOpenGrids,
  displayDefaults,
  applyGridMaxWidth,
  applySettingsChange,
  applyToolbarPreset,
  autocompleteEnabled,
  buildSettingsPanelConfig,
  clipPasteMatrix,
  coerceSetting,
  deviceSettingsKey,
  enterMovement,
  formulaTintEnabled,
  getSetting,
  graphCacheKey,
  GridModel,
  gridSessions,
  GridView,
  gridViews,
  headersVisible,
  LargeGridView,
  initializeSettings,
  largeGridMounts,
  notificationAllowed,
  pinnedGridThemePalette,
  planSettingsMigration,
  readDeviceSettings,
  readEnhancedUidCache,
  refreshSettingsCache,
  repaintFormulaTint,
  resolveSettingValue,
  runMaintenanceAction,
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
  "editing-autocomplete": true,
  "editing-autocomplete-debounce-ms": 90,
  "editing-autocomplete-limit": 8,
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
  "comments-open-in-sidebar": false,
  "ranges-live-references": true,
  "ranges-max-rendered-cells": 2000,
  "large-cache-enabled": true,
  "large-cache-max-mb": 256,
  "large-verify-checksums": true,
  "large-gc-orphans": false,
};

/**
 * Empty since GOAL-3H: every declared key now has a read site. The list stays because the panel
 * arithmetic below is written in terms of it, and because the schema sweep asserts that nothing may
 * become `stage: "pending"` without being listed here.
 */
const PENDING_KEYS = [];

const COMMENT_KEYS = ["comments-enabled", "comments-affordance-trigger", "comments-badges", "comments-open-in-sidebar"];

const RANGE_KEYS = ["ranges-live-references", "ranges-max-rendered-cells"];

const LARGE_STORAGE_KEYS = ["large-cache-enabled", "large-cache-max-mb", "large-verify-checksums", "large-gc-orphans"];

const MAINTENANCE_KEYS = ["maintenance-apply-display", "maintenance-forget-device", "maintenance-clear-caches", "maintenance-reset"];

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
    assert.ok(["live", "pending"].includes(descriptor.stage), `${key}: unknown stage ${descriptor.stage}`);
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
  const ids = buildSettingsPanelConfig().settings.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, "panel row ids must be unique");
  assert.equal(Object.keys(SETTINGS).length, ids.length + PENDING_KEYS.length - MAINTENANCE_KEYS.length);
  for (const key of PENDING_KEYS) assert.ok(SETTINGS[key], `${key} must exist in the schema`);
  for (const key of MAINTENANCE_KEYS) assert.ok(!SETTINGS[key], `${key} is an action, not a stored setting`);
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
  assert.deepEqual(plan.writes, [["writes-native-budget", 900], ["settingsVersion", 1]]);
  assert.equal(plan.from, 0);
  assert.equal(plan.to, 1);
});

test("migration coerces the legacy value and skips it when the new key already exists", () => {
  assert.deepEqual(planSettingsMigration(0, { nativeMutationBudget: "99999" }).writes, [["writes-native-budget", 5000], ["settingsVersion", 1]]);
  assert.deepEqual(planSettingsMigration(0, { nativeMutationBudget: 900, "writes-native-budget": 700 }).writes, [["settingsVersion", 1]]);
  assert.deepEqual(planSettingsMigration(0, {}).writes, [["settingsVersion", 1]]);
});

test("migration is idempotent at the current version and never downgrades a future one", () => {
  const atCurrent = planSettingsMigration(1, { nativeMutationBudget: 900 });
  assert.deepEqual(atCurrent.writes, []);
  assert.equal(atCurrent.to, 1);
  const fromFuture = planSettingsMigration(7, { nativeMutationBudget: 900 });
  assert.deepEqual(fromFuture.writes, [], "a future version must not be rewritten backwards");
  assert.equal(fromFuture.from, 7);
  assert.equal(fromFuture.to, 7, "the plan must keep the future version, not downgrade to 1");
  assert.deepEqual(planSettingsMigration("7", {}).writes, []);
  const replay = planSettingsMigration(atCurrent.to, { nativeMutationBudget: 900, "writes-native-budget": 900, settingsVersion: 1 });
  assert.deepEqual(replay.writes, [], "re-running the plan after applying it writes nothing");
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
  for (let index = 0; index < 200; index += 1) getSetting("comments-open-in-sidebar");
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
  const config = buildSettingsPanelConfig();
  const ids = config.settings.map((row) => row.id);
  assert.equal(config.tabTitle, "Roam Grid");
  for (const key of PENDING_KEYS) {
    assert.ok(!ids.includes(key), `${key} must not be rendered while it is pending`);
    assert.equal(SETTINGS[key].stage, "pending");
  }
  // PENDING_KEYS is empty today, so the loop above proves nothing on its own. This is the assertion
  // that keeps it honest: a row may only be invisible if it is listed as pending.
  for (const [key, descriptor] of Object.entries(SETTINGS)) {
    if (descriptor.stage === "pending") assert.ok(PENDING_KEYS.includes(key), `${key} is pending but is not listed in PENDING_KEYS`);
    else assert.ok(ids.includes(key), `${key} is live and must be rendered`);
  }
  // GOAL-3H wired these and deleted `ranges-read-only`: RangeGridView has no commitMutation and no
  // onKeydown, so a toggle claiming a writable range could never have a true branch.
  for (const key of RANGE_KEYS) {
    assert.ok(ids.includes(key), `${key} backs a shipped feature and must be rendered`);
    assert.equal(SETTINGS[key].stage, "live");
  }
  assert.equal(SETTINGS["ranges-read-only"], undefined, "a setting whose true branch cannot exist must not be declared");
  for (const key of COMMENT_KEYS) {
    assert.ok(ids.includes(key), `${key} ships with the comments feature and must be rendered`);
    assert.equal(SETTINGS[key].stage, "live");
  }
  assert.deepEqual([...SETTINGS["comments-affordance-trigger"].items], ["Hover", "Cmd/Ctrl + hover"]);
  assert.equal(SETTINGS["comments-affordance-trigger"].default, "Hover", "GOAL-2H: plain hover is what the user asked for");
  // Their features landed in the 3B/3C/3F storage chain. A setting whose feature ships but whose
  // control stays hidden is the mirror image of the defect this schema replaced, so the visibility
  // of these four is asserted directly rather than only implied by their absence from PENDING_KEYS.
  for (const key of LARGE_STORAGE_KEYS) {
    assert.ok(ids.includes(key), `${key} backs a shipped feature and must be rendered`);
    assert.equal(SETTINGS[key].stage, "live");
  }
  assert.equal(SETTINGS["large-gc-orphans"].default, false, "irreversible deletion is opt-in");
  assert.match(SETTINGS["large-gc-orphans"].name, /irreversible/i, "the row must say so where the user reads it");
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(getSetting("comments-open-in-sidebar"), false);
  assert.equal(getSetting("large-cache-max-mb"), 256);
  assert.ok(ids.includes("writes-native-budget"));
  for (const key of MAINTENANCE_KEYS) assert.ok(ids.includes(key), `${key} must be rendered as a maintenance button`);
  assert.equal(ids.length, Object.keys(SETTINGS).length - PENDING_KEYS.length + MAINTENANCE_KEYS.length);
});

test("panel rows carry the group naming convention, a className, and a supported action", () => {
  const rows = buildSettingsPanelConfig().settings;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const budget = byId.get("writes-native-budget");
  assert.equal(budget.name, "Writes — Native write budget");
  assert.equal(budget.className, "rg-settings-writes");
  assert.equal(budget.action.type, "input");
  assert.equal(budget.action.placeholder, "1200");
  const theme = byId.get("appearance-theme");
  assert.equal(theme.name, "Appearance — Theme");
  assert.equal(theme.action.type, "select");
  assert.deepEqual(theme.action.items, ["Follow Roam", "Light", "Dark"]);
  assert.notEqual(theme.action.items, SETTINGS["appearance-theme"].items, "the panel must not hand out the frozen schema array");
  const headers = byId.get("appearance-show-headers");
  assert.equal(headers.action.type, "switch");
  assert.equal(byId.get("new-grid-rows").className, "rg-settings-new-grids");
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
  byId.get("writes-native-budget").action.onChange({ target: { value: "640" } });
  byId.get("editing-tab-direction").action.onChange("Down");
  assert.deepEqual(seen, [
    ["appearance-show-headers", false],
    ["appearance-theme", "Dark"],
    ["writes-native-budget", "640"],
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
  assert.deepEqual(fake.writes.slice(0, 2), [["writes-native-budget", 900], ["settingsVersion", 1]], "migration writes come first");
  const written = new Map(fake.writes);
  assert.equal(written.get("writes-native-budget"), 900, "the migrated value must not be overwritten by the default");
  assert.ok(!written.has("editing-tab-direction"), "an already-set key is not reseeded");
  for (const key of PENDING_KEYS) assert.ok(!written.has(key), `${key} must not be seeded while it is pending`);
  assert.equal(fake.writes.length, Object.keys(SETTINGS).length - PENDING_KEYS.length - 1 + 1, "one write per unseeded live key plus the version row");
  assert.equal(getSetting("writes-native-budget"), 900);
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
  assert.equal(fake.panels[0].settings.length, Object.keys(SETTINGS).length - PENDING_KEYS.length + MAINTENANCE_KEYS.length);
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

  const row = fake.panels[1].settings.find((entry) => entry.id === "appearance-max-width");
  row.action.onChange({ target: { value: "2000" } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(getSetting("appearance-max-width"), 2000);
  assert.deepEqual(readDeviceSettings(storage), { "appearance-max-width": 2000 });
});

test("applySettingsChange reaches every registered view, large mount, and session", (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();
  refreshSettingsCache(makeApi().api, makeStorage());

  const badgeCalls = [];
  for (let index = 0; index < 5; index += 1) {
    gridViews.add({ id: index, updateReferenceCountBadges() { badgeCalls.push(index); } });
  }
  const badges = applySettingsChange(SETTINGS["appearance-reference-badges"], false);
  assert.equal(gridViews.size, 5);
  assert.equal(badges.views, 5, "every registered view must be visited");
  assert.deepEqual(badgeCalls, [0, 1, 2, 3, 4]);
  assert.equal(badges.value, false);
  assert.equal(badges.failed, 0);

  const renders = [];
  largeGridMounts.set("large-a", { scheduleRender: () => renders.push("a") });
  largeGridMounts.set("large-b", { scheduleRender: () => renders.push("b") });
  const overscan = applySettingsChange(SETTINGS["large-overscan-rows"], 20);
  assert.equal(overscan.largeMounts, 2);
  assert.deepEqual(renders, ["a", "b"]);
  assert.equal(overscan.views, 0, "a large-only setting must not walk the view registry");

  const rearmed = [];
  gridSessions.set("t1", { rescheduleIdle: () => rearmed.push("t1") });
  gridSessions.set("t2", { rescheduleIdle: () => rearmed.push("t2") });
  const idle = applySettingsChange(SETTINGS["session-idle-ms"], 4000);
  assert.equal(idle.sessions, 2);
  assert.deepEqual(rearmed, ["t1", "t2"]);
});

test("a view that throws is counted, isolated, and does not truncate the walk", (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();
  refreshSettingsCache(makeApi().api, makeStorage());
  const reached = [];
  gridViews.add({ updateReferenceCountBadges() { reached.push("first"); } });
  gridViews.add({ updateReferenceCountBadges() { reached.push("boom"); throw new Error("detached node"); } });
  gridViews.add({ updateReferenceCountBadges() { reached.push("last"); } });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = applySettingsChange("appearance-reference-badges", true);
    assert.deepEqual(reached, ["first", "boom", "last"], "the walk must continue past a failing surface");
    assert.equal(result.views, 3);
    assert.equal(result.failed, 1);
  } finally { console.warn = warn; }
});

test("applySettingsChange resolves a key string, an unknown key, and an omitted value", (t) => {
  t.after(() => { clearRegistries(); settingsCache.clear(); });
  clearRegistries();
  refreshSettingsCache(makeApi({ values: { "appearance-max-width": 1800 } }).api, makeStorage());
  const seen = [];
  gridViews.add({ root: makeElement() });
  const resolved = applySettingsChange("appearance-max-width");
  assert.equal(resolved.value, 1800, "an omitted value is read from the cache");
  assert.equal(resolved.views, 1);
  assert.deepEqual(applySettingsChange("not-a-setting", 1), { key: null, value: 1, views: 0, largeMounts: 0, sessions: 0, failed: 0 });
  assert.deepEqual(seen, []);
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
  assert.ok(Object.hasOwn(displayDefaults(), "fitToWidth"), "it is the one flag the display-defaults button still restamps");
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
  // Headers are a live mask now: the button must NOT write the per-grid flag, or a grid pressed while
  // the global was off would stay headerless after the global came back on.
  assert.equal(model.showHeaders, true, "the button must not restamp a live-masked flag");
  assert.equal(manifest.showHeaders, true, "the button must not restamp a live-masked flag");
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
  const storage = makeStorage({ [deviceSettingsKey()]: '{"appearance-theme":"Dark","appearance-max-width":2400}' });
  refreshSettingsCache(fake.api, storage);
  assert.equal(getSetting("appearance-theme"), "Dark");
  const root = makeElement();
  gridViews.add({ root });
  let rebuilt = 0;
  assert.equal(await runMaintenanceAction("maintenance-forget-device", { extensionAPI: fake.api, storage, rebuildPanel: () => { rebuilt += 1; } }), true);
  assert.deepEqual(readDeviceSettings(storage), {});
  assert.equal(getSetting("appearance-theme"), "Light", "the graph seed takes over");
  assert.equal(getSetting("appearance-max-width"), 1200);
  assert.equal(rebuilt, 1, "Roam renders row values once, so the panel must be rebuilt");
  assert.equal(root.style.properties.get("--rg-max-width"), "1200px", "device-scoped changes are pushed to live grids");
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
    assert.equal(getSetting(key), descriptor.default, `${key} must resolve to its default`);
    if (PENDING_KEYS.includes(key)) assert.ok(!written.has(key), `${key} must not be written while it is pending`);
    else assert.equal(written.get(key), descriptor.default, `${key} must be written back to its default`);
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
  assert.match(SETTINGS_MAINTENANCE["maintenance-apply-display"].description, /Existing grids keep their own fit setting/);
  // The two live-masked flags must not be advertised here, or the button promises work it no longer does.
  assert.doesNotMatch(SETTINGS_MAINTENANCE["maintenance-apply-display"].description, /Rewrite headers/);
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
