import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS,
  buildSettingsPanelConfig,
  coerceSetting,
  deviceSettingsKey,
  getSetting,
  graphCacheKey,
  initializeSettings,
  planSettingsMigration,
  readDeviceSettings,
  refreshSettingsCache,
  resolveSettingValue,
  setSetting,
  settingDefaults,
  settingsCache,
  settingsPanelRow,
  writeDeviceSettings,
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
  "editing-autocomplete-debounce-ms": 90,
  "editing-autocomplete-limit": 8,
  "editing-capture-undo": true,
  "editing-enter-direction": "Down",
  "editing-tab-direction": "Right",
  "appearance-formula-tinting": true,
  "appearance-show-headers": true,
  "appearance-fit-to-width": true,
  "appearance-reference-badges": true,
  "appearance-toolbar-preset": "Full",
  "appearance-theme": "Follow Roam",
  "appearance-max-width": 1200,
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
  "comments-enabled": true,
  "comments-badges": true,
  "comments-open-in-sidebar": false,
  "ranges-live-references": true,
  "ranges-read-only": true,
  "ranges-max-rendered-cells": 2000,
  "large-cache-enabled": true,
  "large-cache-max-mb": 256,
  "large-verify-checksums": true,
  "large-gc-orphans": false,
};

const PENDING_KEYS = [
  "comments-enabled", "comments-badges", "comments-open-in-sidebar",
  "ranges-live-references", "ranges-read-only", "ranges-max-rendered-cells",
  "large-cache-enabled", "large-cache-max-mb", "large-verify-checksums", "large-gc-orphans",
];

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
  };
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
      if (descriptor[hook] !== undefined) assert.equal(descriptor[hook], true, `${key}: ${hook} must be omitted or true`);
    }
  }
});

test("schema keys are unique across the panel and the map", () => {
  const ids = buildSettingsPanelConfig().settings.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, "panel row ids must be unique");
  assert.equal(Object.keys(SETTINGS).length, ids.length + PENDING_KEYS.length);
  for (const key of PENDING_KEYS) assert.ok(SETTINGS[key], `${key} must exist in the schema`);
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
  refreshSettingsCache(makeApi().api, makeStorage());
  assert.equal(getSetting("comments-open-in-sidebar"), false);
  assert.equal(getSetting("large-cache-max-mb"), 256);
  assert.ok(ids.includes("writes-native-budget"));
  assert.equal(ids.length, Object.keys(SETTINGS).length - PENDING_KEYS.length);
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
  assert.equal(fake.panels[0].settings.length, Object.keys(SETTINGS).length - PENDING_KEYS.length);
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
