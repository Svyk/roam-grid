const VERSION = "0.15.0";
const NATIVE_MARKER = /\{\{(?:\[\[)?table(?:\]\])?\}\}/i;
const LARGE_MARKER = /\{\{(?:\[\[)?roam\/grid(?:\]\])?\}\}/i;
const RANGE_COMPONENT_NAME = "roam-grid-range";
const RANGE_BUTTON_SELECTOR = `.rm-xparser-default-${RANGE_COMPONENT_NAME}`;
const RANGE_MARKER = /\{\{\s*roam-grid-range\s*:\s*\(\(([^()\s]+)\)\)\s*(\$?[A-Z]+\$?\d+)(?:\s*:\s*(\$?[A-Z]+\$?\d+))?\s*\}\}/i;
const METADATA_PAGE = "roam/grid/metadata";
const METADATA_PREFIX = "roam-grid/table::";
const TEMPLATE_PAGE = "roam/grid/templates";
const TEMPLATE_PREFIX = "roam-grid/template::";
const TEMPLATE_BACKUP_PREFIX = "roam-grid/template-backup::";
const COMMENTS_PAGE = "roam/comments";
const COMMENTS_CONTAINER_STRING = `[[${COMMENTS_PAGE}]]`;
const MANIFEST_PREFIX = "roam-grid/manifest::";
const REFS_PREFIX = "roam-grid/refs::";
const REFS_VERSION = "v1";
const MAX_NATIVE_MUTATIONS = 1200;
const CHUNK_ROWS = 500;
const DEFAULT_ROW_HEIGHT = 32;
const DEFAULT_COL_WIDTH = 160;
const MIN_ROW_HEIGHT = 22;
const MAX_ROW_HEIGHT = 480;
const MIN_COL_WIDTH = 56;
const MAX_COL_WIDTH = 640;
const FORMULA_REFERENCE_COLORS = ["#d9822b", "#8f398f", "#0f9960", "#106ba3", "#c23030", "#5c7080"];
const PREPAINT_STYLE_ID = "roam-grid-prepaint-guard";
const PREPAINT_LARGE_STYLE_ID = "roam-grid-prepaint-guard-large";
const ENHANCED_UID_CACHE_PREFIX = "roam-grid:enhanced-uids:";
const LARGE_UID_CACHE_PREFIX = "roam-grid:large-uids:";
const SESSION_IDLE_MS = 1500;
const MAX_GUARD_UIDS = 2000;
const MAX_UNDO_ENTRIES = 100;
const MAX_UNDO_CHECKPOINTS = 8;
const MAX_UNDO_HISTORIES = 24;
const MAX_DISCARDED_EDITS = 200;
const DEFAULT_CONTENT_SAVE_MS = 220;
const DEFAULT_LARGE_SAVE_MS = 500;
const DEFAULT_AUTOCOMPLETE_MS = 90;
const DEFAULT_AUTOCOMPLETE_LIMIT = 8;
// FIX-E4: Roam fires an `input` event on the mounted textarea while closing its `[[` menu, which
// clears the overlay's one-Escape loan (`escapeDeferred`) ~65ms before the blur-driven focus-floor
// reads it. A lent Escape within this window of a focus-leave IS that menu-close blur, so the floor
// cancels the auto-paired value rather than committing it. A genuine click-to-commit is
// human-reaction-delayed (hundreds of ms) and not temporally bound to an Escape, so it stays a commit.
const ESCAPE_BLUR_WINDOW_MS = 400;
const RECENTS_TTL_MS = 60000;
// The page query returns every page in the graph and has not been measured on a large one. Over
// budget the result is still used — it is already paid for — but the empty-opener path disarms
// after consecutive over-budget INLINE fetches and re-arms on the next fetch at or under budget,
// warm or inline. This is a nicety, so it reports through console.info and never a toast.
const RECENTS_BUDGET_MS = 250;
// One slow fetch can be a GC pause; two in a row is the graph. Background warms never count
// toward the streak — they run off the critical path, so they can only re-arm, never disarm.
const RECENTS_DISARM_OVERRUNS = 2;
const RECENT_BLOCK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_ACCEPTED_PAGES = 25;
// The idle warm pays the recents queries before the first bare opener does. 2.5 s is the fallback
// when requestIdleCallback is missing; the re-warm fires 5 s ahead of TTL expiry so the cache never
// goes cold in front of an active grid.
const RECENTS_WARM_FALLBACK_MS = 2500;
const RECENTS_REWARM_LEAD_MS = 5000;
// Rendering a suggestion row mounts React. At the default limit of 8 rows and a 90ms debounce a fast
// typist produces about eleven result sets a second, so an unbounded per-row render is ~88 mounts a
// second while typing. The list is 190px tall — roughly six rows — so capping renders at six renders
// nothing that was not already on screen. A module constant and NOT a setting, because a setting is
// something a user can raise back into a storm.
const MAX_RENDERED_SUGGESTION_ROWS = 6;
// A batch is timed end to end; two over budget and the session goes text-only. This is what protects
// a graph where `renderString` is slower than the one this was written against.
const SUGGESTION_RENDER_BUDGET_MS = 32;
const SLOW_SUGGESTION_BATCHES = 2;
const RENDERED_SUGGESTION_CACHE = 12;
const DEFAULT_COMPACT_ROW_HEIGHT = 24;
const DEFAULT_GRID_MAX_WIDTH = 1200;
const DEFAULT_NEW_GRID_ROWS = 100;
const DEFAULT_NEW_GRID_COLS = 26;
const DEFAULT_LARGE_OVERSCAN_ROWS = 8;
const DEFAULT_RANGE_RENDERED_CELLS = 2000;
const DEFAULT_IMAGE_MAX_HEIGHT = 180;
// The per-table imageLayout vocabulary (GOAL-IMG-3). Size tokens map to a pixel cap at resolve
// time except "fill", which keeps the global cap and spans the cell width instead.
export const IMAGE_SIZE_TOKENS = ["s", "m", "l", "xl", "fill"];
export const IMAGE_FIT_TOKENS = ["contain", "cover", "original"];
export const IMAGE_LAYOUT_TOKENS = ["inline", "strip"];
const IMAGE_SIZE_HEIGHTS = { s: 64, l: 320, xl: 480 }; // "m" and "fill" follow the images-max-height setting
export const IMAGE_SIZE_MENU = [["Small", "s"], ["Medium", "m"], ["Large", "l"], ["Extra large", "xl"], ["Fill width", "fill"]];
export const IMAGE_FIT_MENU = [["Contain", "contain"], ["Fill & crop (may enlarge)", "cover"], ["Original size", "original"]];
export const ROW_HEIGHT_PRESETS = [["Short", 32], ["Medium", 56], ["Tall", 96], ["Extra tall", 160]];
const DEFAULT_LARGE_CACHE_MB = 256;
const COMMENT_TRIGGER_HOVER = "Hover";
const COMMENT_TRIGGER_MODIFIER = "Cmd/Ctrl + hover";
const COMMENT_COMPOSE_IN_PLACE = "In place";
const COMMENT_COMPOSE_BOX = "Comment box";
const COMMENT_COMPOSE_SIDEBAR = "Right sidebar";
const NOTIFY_ALL = "All";
const NOTIFY_WARNINGS = "Warnings and errors";
const NOTIFY_ERRORS = "Errors only";
const LARGE_RESIDENT_MIN_CHUNKS = 8;
const LARGE_RESIDENT_MAX_CHUNKS = 32;
const LARGE_UPLOAD_CONCURRENCY = 4;
const LARGE_PREFETCH_CONCURRENCY = 6;
const LARGE_LINEAGE_LIMIT = 16;
const LARGE_COMMIT_ATTEMPTS = 3;
const LARGE_GARBAGE_LIMIT = 256;
// A commit swaps the manifest object, so every metadata write is journaled for replay onto the
// verified copy. The cap bounds a grid that never saves successfully: the values themselves live
// in `this.manifest` regardless, so a dropped entry only costs replay protection across a swap.
export const LARGE_METADATA_JOURNAL_LIMIT = 256;
const LARGE_GARBAGE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const LARGE_GC_QUIET_MS = 60 * 60 * 1000;
const LARGE_REFS_PER_SHARD = 100;
const DEFAULT_LARGE_REFS_MAX = 2000;
const CHUNK_CACHE_DB = "roam-grid-chunks";
const CHUNK_CACHE_DB_VERSION = 1;
const CHUNK_CACHE_BODIES = "bodies";
const CHUNK_CACHE_META = "meta";
const CHUNK_CACHE_OPEN_MS = 3000;
const DEVICE_SETTINGS_PREFIX = "roam-grid:settings:";
const SETTINGS_VERSION = 2;
const SETTINGS_VERSION_KEY = "settingsVersion";
const LEGACY_BUDGET_KEY = "nativeMutationBudget";
const NATIVE_BUDGET_KEY = "writes-native-budget";
const LEGACY_SIDEBAR_COMMENTS_KEY = "comments-open-in-sidebar";
const COMMENT_COMPOSE_MODE_KEY = "comments-compose-mode";

/**
 * Flat settings schema. Roam's panel supports switch/input/select/button rows only, so grouping is
 * the `"<group> — <name>"` label convention plus a per-row className. `stage: "pending"` rows are
 * reachable through `getSetting` but are never rendered — a visible control that does nothing is
 * exactly the defect this schema replaces.
 *
 * `onView` / `onLarge` / `onSession` are the propagation callbacks `applySettingsChange` invokes for
 * each registered surface. A missing callback means the value is read live at its use site, so no
 * propagation is needed — one source of truth instead of a flag plus a separate handler table.
 */
const SETTING_DESCRIPTORS = [
  { key: NATIVE_BUDGET_KEY, group: "Writes", name: "Native write budget", description: "Maximum Roam block mutations in one structural operation. Larger operations should use large-grid mode.", control: "input", type: "int", default: MAX_NATIVE_MUTATIONS, min: 50, max: 5000, scope: "graph", apply: "next-op", stage: "live" },
  { key: "writes-content-debounce-ms", group: "Writes", name: "Content save delay (ms)", description: "How long typing settles before edited cells are written back to Roam.", control: "input", type: "int", default: DEFAULT_CONTENT_SAVE_MS, min: 0, max: 5000, scope: "graph", apply: "next-op", stage: "live" },
  { key: "writes-large-debounce-ms", group: "Writes", name: "Large-grid save delay (ms)", description: "How long a large grid settles before its chunks are uploaded.", control: "input", type: "int", default: DEFAULT_LARGE_SAVE_MS, min: 0, max: 5000, scope: "graph", apply: "next-op", stage: "live" },
  { key: "session-idle-ms", group: "Writes", name: "Session idle timeout (ms)", description: "How long an unmounted grid session stays warm before it is released.", control: "input", type: "int", default: SESSION_IDLE_MS, min: 200, max: 60000, scope: "graph", apply: "immediate", stage: "live", onSession: (session) => session.rescheduleIdle() },
  { key: "editing-native-editor", group: "Editing", name: "Edit cells with Roam's own block editor", description: "Open Roam's real block editor over the cell instead of the grid's text box, so [[, ((, #, {{ and / open Roam's OWN menus with everything they carry. Formula cells, the F2 floating editor, and registered custom editors always use the grid editor. If the editor cannot be mounted twice in a row the grid editor takes over for the rest of the session.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live" },
  { key: "editing-autocomplete", group: "Editing", name: "Suggest functions and pages while typing", description: "Offer formula-function and [[page]] / ((block)) suggestions inside the cell editor. With this off nothing pops up while you type and the two delay/results rows below do nothing.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live" },
  { key: "editing-autocomplete-debounce-ms", group: "Editing", name: "Autocomplete delay (ms)", description: "How long a reference query settles before Roam is searched.", control: "input", type: "int", default: DEFAULT_AUTOCOMPLETE_MS, min: 0, max: 2000, scope: "graph", apply: "next-op", stage: "live" },
  { key: "editing-autocomplete-limit", group: "Editing", name: "Autocomplete results", description: "How many suggestions the formula and reference pickers offer.", control: "input", type: "int", default: DEFAULT_AUTOCOMPLETE_LIMIT, min: 1, max: 25, scope: "graph", apply: "next-op", stage: "live" },
  { key: "editing-autocomplete-empty-opener", group: "Editing", name: "Open the reference menu on a bare [[ or ((", description: "Offer recently edited pages the moment you type [[ and recently edited blocks the moment you type ((, the way Roam’s own menu does, before you have typed anything to search for. With this off the menu waits for a query.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live" },
  { key: "editing-autocomplete-render-rows", group: "Editing", name: "Render ((block)) suggestions the way Roam does", description: "Show block suggestions as Roam renders them — page links, bold, refs — instead of the raw markdown behind them. Page, tag and create-page rows are plain text either way. Rendering pauses itself for the rest of the session if it turns out to be slow on this graph.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live" },
  { key: "editing-autocomplete-components", group: "Editing", name: "Complete {{components}} in cells", description: "Offer Roam's own components — TODO, query, embed, calc, video and the rest — the moment you type {{ in a cell. The list is a fixed catalog, so it costs no graph read and opens with no delay. Rows say where a component needs child bullets or does not render inside a cell at all.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live" },
  { key: "editing-autocomplete-commands", group: "Editing", name: "Offer / commands in cells (partial)", description: "Open a slash menu when you type / at the start of a cell or after a space. This is deliberately a PARTIAL subset: 21 of the 47 commands Roam's own / menu carries — the ones a cell can perform by inserting text. Commands that open a Roam dialog (date picker, file upload, template picker) and commands that only render correctly under a real block (word count, diagram, kanban board, mermaid) are left out rather than listed and doing nothing. Off by default.", control: "switch", type: "bool", default: false, scope: "graph", apply: "immediate", stage: "live" },
  { key: "editing-capture-undo", group: "Editing", name: "Capture grid undo history", description: "Record grid edits in the extension's own undo history so ⌘Z reverses them.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live" },
  { key: "editing-enter-direction", group: "Editing", name: "Enter moves", description: "Where the selection lands after Enter finishes a cell edit.", control: "select", type: "enum", default: "Down", items: ["Down", "Right", "Stay"], scope: "graph", apply: "immediate", stage: "live" },
  { key: "editing-tab-direction", group: "Editing", name: "Tab moves", description: "Where the selection lands after Tab finishes a cell edit.", control: "select", type: "enum", default: "Right", items: ["Right", "Down"], scope: "graph", apply: "immediate", stage: "live" },
  { key: "editing-paste-grows-grid", group: "Editing", name: "Grow the grid to fit a paste", description: "Add the rows and columns a paste needs when it runs past the last cell. With this off the paste is clipped to the grid's current size and says so.", control: "switch", type: "bool", default: true, scope: "graph", apply: "next-op", stage: "live" },
  { key: "conflict-restore-prompt", group: "Editing", name: "Offer to restore edits a reload discarded", description: "When a table changes elsewhere and Roam Grid reloads it, show a Restore action for the unsaved edits that reload dropped. The “Roam Grid: Restore discarded edits” command stays available with this off.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live" },
  { key: "appearance-formula-tinting", group: "Appearance", name: "Tint formula cells", description: "Give cells that hold a formula their own background tint. Turning this off suppresses tinting on every grid at once; turning it back on returns each grid to its own “fx” setting.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live", onView: (view) => view.refreshFormulaTint(), onLarge: (mount) => mount.scheduleRender() },
  { key: "appearance-show-headers", group: "Appearance", name: "Show row and column headers", description: "Show the A/B/C and 1/2/3 axis headers. Turning this off hides them on every grid at once; turning it back on returns each grid to its own “Labels” setting.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live", onView: (view) => view.refreshHeaders(), onLarge: (mount) => mount.scheduleRender() },
  { key: "appearance-fit-to-width", group: "Appearance", name: "Fit grids to the block width", description: "Scale columns so a new grid fills the width of its block instead of scrolling.", control: "switch", type: "bool", default: true, scope: "graph", apply: "next-op", stage: "live" },
  { key: "appearance-reference-badges", group: "Appearance", name: "Show cell reference badges", description: "Show the linked-reference count badge on cells that other blocks reference.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live", onView: (view) => view.updateReferenceCountBadges() },
  { key: "appearance-toolbar-preset", group: "Appearance", name: "Toolbar", description: "How much of the grid toolbar is shown.", control: "select", type: "enum", default: "Full", items: ["Full", "Compact", "Minimal", "Hidden"], scope: "device", apply: "immediate", stage: "live", onView: (view) => applyToolbarPreset(view.root), onLarge: (mount) => applyToolbarPreset(mount.root) },
  { key: "appearance-theme", group: "Appearance", name: "Theme", description: "Follow the Roam theme or pin the grid to light or dark.", control: "select", type: "enum", default: "Follow Roam", items: ["Follow Roam", "Light", "Dark"], scope: "device", apply: "immediate", stage: "live", onView: (view) => resyncGridTheme(view), onLarge: (mount) => resyncGridTheme(mount) },
  { key: "appearance-max-width", group: "Appearance", name: "Maximum grid width (px)", description: "Widest a grid may grow before it scrolls horizontally.", control: "input", type: "int", default: DEFAULT_GRID_MAX_WIDTH, min: 480, max: 4000, scope: "device", apply: "immediate", stage: "live", onView: (view) => applyGridMaxWidth(view.root), onLarge: (mount) => applyGridMaxWidth(mount.root) },
  { key: "appearance-notifications", group: "Appearance", name: "Notifications", description: "Which Roam Grid messages appear in the corner. Errors always show, and a message that offers an action — such as “Restore” — is never suppressed, because it is a control rather than a notice.", control: "select", type: "enum", default: NOTIFY_ALL, items: [NOTIFY_ALL, NOTIFY_WARNINGS, NOTIFY_ERRORS], scope: "device", apply: "immediate", stage: "live" },
  { key: "sizing-default-row-height", group: "Sizing", name: "Default row height (px)", description: "Height a row starts at before it is resized.", control: "input", type: "int", default: DEFAULT_ROW_HEIGHT, min: 22, max: 480, scope: "graph", apply: "next-op", stage: "live" },
  { key: "sizing-compact-row-height", group: "Sizing", name: "Compact row height (px)", description: "Height applied by the “Compact selected rows” menu item.", control: "input", type: "int", default: DEFAULT_COMPACT_ROW_HEIGHT, min: 22, max: 480, scope: "graph", apply: "next-op", stage: "live" },
  { key: "sizing-default-col-width", group: "Sizing", name: "Default column width (px)", description: "Width a column starts at before it is resized.", control: "input", type: "int", default: DEFAULT_COL_WIDTH, min: 56, max: 640, scope: "graph", apply: "next-op", stage: "live" },
  { key: "sizing-min-row-height", group: "Sizing", name: "Minimum row height (px)", description: "Smallest height a row may be dragged to.", control: "input", type: "int", default: MIN_ROW_HEIGHT, min: 8, max: 480, scope: "graph", apply: "next-op", stage: "live" },
  { key: "sizing-max-row-height", group: "Sizing", name: "Maximum row height (px)", description: "Largest height a row may be dragged to.", control: "input", type: "int", default: MAX_ROW_HEIGHT, min: 22, max: 2000, scope: "graph", apply: "next-op", stage: "live" },
  { key: "sizing-min-col-width", group: "Sizing", name: "Minimum column width (px)", description: "Smallest width a column may be dragged to.", control: "input", type: "int", default: MIN_COL_WIDTH, min: 16, max: 640, scope: "graph", apply: "next-op", stage: "live" },
  { key: "sizing-max-col-width", group: "Sizing", name: "Maximum column width (px)", description: "Largest width a column may be dragged to.", control: "input", type: "int", default: MAX_COL_WIDTH, min: 56, max: 2000, scope: "graph", apply: "next-op", stage: "live" },
  { key: "new-grid-rows", group: "New grids", name: "Rows in a new large grid", description: "How many rows a freshly created large grid starts with.", control: "input", type: "int", default: DEFAULT_NEW_GRID_ROWS, min: 1, max: 100000, scope: "graph", apply: "next-op", stage: "live" },
  { key: "new-grid-cols", group: "New grids", name: "Columns in a new large grid", description: "How many columns a freshly created large grid starts with.", control: "input", type: "int", default: DEFAULT_NEW_GRID_COLS, min: 1, max: 702, scope: "graph", apply: "next-op", stage: "live" },
  { key: "large-overscan-rows", group: "Large grids", name: "Overscan rows", description: "Extra rows rendered above and below a large grid's viewport.", control: "input", type: "int", default: DEFAULT_LARGE_OVERSCAN_ROWS, min: 0, max: 200, scope: "device", apply: "immediate", stage: "live", onLarge: (mount) => mount.scheduleRender() },
  { key: "large-chunk-rows", group: "Large grids", name: "Rows per chunk file", description: "How many rows each chunk file holds. Applies to newly created large grids only — an existing grid keeps the chunk size it was written with, because changing it would misaddress every chunk.", control: "input", type: "int", default: CHUNK_ROWS, min: 50, max: 5000, scope: "graph", apply: "next-op", stage: "live" },
  { key: "comments-enabled", group: "Comments", name: "Enable cell comments", description: "Read and write native Roam comment threads from grid cells.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live", onView: (view) => { view.updateReferenceCountBadges(); view.syncCommentAffordance?.(); } },
  { key: "comments-affordance-trigger", group: "Comments", name: "Show the comment button", description: "Whether the 💬 button appears as soon as the pointer enters a cell, or only while Cmd/Ctrl is held — Roam's own gesture for a block. Hover is the default because a grid cell is a much denser, more deliberate target than a block.", control: "select", type: "enum", default: COMMENT_TRIGGER_HOVER, items: [COMMENT_TRIGGER_HOVER, COMMENT_TRIGGER_MODIFIER], scope: "graph", apply: "immediate", stage: "live", onView: (view) => view.syncCommentAffordance?.() },
  { key: "comments-badges", group: "Comments", name: "Show comment badges", description: "Mark cells that carry a comment thread.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live", onView: (view) => view.updateReferenceCountBadges() },
  { key: COMMENT_COMPOSE_MODE_KEY, group: "Comments", name: "Composing and opening threads", description: "Where a new comment is written and where a cell's thread opens. “In place” opens the inline Comments panel with the cursor in an empty comment, ready to type. “Comment box” asks in a dialog first — the pre-0.12 behaviour. “Right sidebar” sends the thread to the right sidebar and starts the comment there, the way Roam's own comment button works.", control: "select", type: "enum", default: COMMENT_COMPOSE_IN_PLACE, items: [COMMENT_COMPOSE_IN_PLACE, COMMENT_COMPOSE_BOX, COMMENT_COMPOSE_SIDEBAR], scope: "device", apply: "immediate", stage: "live" },
  { key: "ranges-live-references", group: "Ranges", name: "Render live range references", description: "Render {{roam-grid-range: …}} components as a live view of the source cells. With this off the component stays as its raw text; views already on screen keep rendering until Roam next redraws their block.", control: "switch", type: "bool", default: true, scope: "graph", apply: "next-op", stage: "live" },
  { key: "ranges-max-rendered-cells", group: "Ranges", name: "Maximum cells in a rendered range", description: "How many cells a rendered range may paint. A larger range renders whole rows up to this many cells and says so in its caption.", control: "input", type: "int", default: DEFAULT_RANGE_RENDERED_CELLS, min: 1, max: 50000, scope: "graph", apply: "next-op", stage: "live" },
  { key: "images-cell-media", group: "Images", name: "Render images in cells", description: "Render ![image](url) embeds inside cells, capped to the cell instead of overflowing it, with a fallback chip naming the image when it cannot load. Off restores the exact pre-image rendering.", control: "switch", type: "bool", default: true, scope: "graph", apply: "immediate", stage: "live", onView: (view) => view.refreshMediaDecor?.(), onLarge: (mount) => mount.scheduleRender?.() },
  { key: "images-max-height", group: "Images", name: "Maximum image height in cells (px)", description: "Tallest an image may render inside a cell. Larger images scale down to fit; a small image is never enlarged.", control: "input", type: "int", default: DEFAULT_IMAGE_MAX_HEIGHT, min: 48, max: 480, scope: "graph", apply: "immediate", stage: "live", onView: (view) => view.refreshMediaDecor?.(), onLarge: (mount) => mount.scheduleRender?.() },
  { key: "large-cache-enabled", group: "Large grids", name: "Cache large-grid chunks on this device", description: "Keep downloaded chunks in IndexedDB so reopening a large grid is instant. Takes effect the next time Roam Grid loads.", control: "switch", type: "bool", default: true, scope: "device", apply: "next-op", stage: "live" },
  { key: "large-cache-max-mb", group: "Large grids", name: "Chunk cache size (MB)", description: "How much device storage the large-grid chunk cache may use.", control: "input", type: "int", default: DEFAULT_LARGE_CACHE_MB, min: 8, max: 4096, scope: "device", apply: "next-op", stage: "live" },
  { key: "large-verify-checksums", group: "Large grids", name: "Verify chunk checksums", description: "Re-hash each downloaded chunk before trusting it.", control: "switch", type: "bool", default: true, scope: "graph", apply: "next-op", stage: "live" },
  { key: "large-gc-orphans", group: "Large grids", name: "Permanently delete superseded large-grid files (irreversible)", description: "Delete chunk and manifest files that no revision references any more. Runs once per session, only on grids nothing has saved for an hour, and only after a file has been superseded for seven days. This cannot be undone.", control: "switch", type: "bool", default: false, scope: "graph", apply: "next-op", stage: "live" },
  { key: "large-refs-sync", group: "Large grids", name: "Mirror large-grid references into Roam", description: "A large-grid cell lives in a chunk file, so a [[page]], #tag or ((block)) typed into one is a link Roam has never indexed — it looks live in the cell and the page it names shows nothing. Turning this on collects the distinct references a grid contains and writes them into collapsed blocks under the grid, which is what makes Roam create the real reference. Off by default: it puts a write on Roam's transactor on every save, which is the cost the chunk format exists to avoid. Click-through lands on the grid, not the cell.", control: "switch", type: "bool", default: false, scope: "graph", apply: "next-op", stage: "live" },
  { key: "large-refs-max", group: "Large grids", name: "Maximum mirrored references", description: "How many distinct references one grid may mirror. Past this the list is cut in sort order — the same cut on every device, so two devices still agree — and the marker block says it was truncated.", control: "input", type: "int", default: DEFAULT_LARGE_REFS_MAX, min: 1, max: 20000, scope: "graph", apply: "next-op", stage: "live" },
];

/**
 * Maintenance rows are actions, not settings: they hold no value, so they stay out of `SETTINGS`
 * (nothing to seed, cache, coerce, or reset) and are appended to the rendered panel instead.
 */
const MAINTENANCE_ACTIONS = Object.freeze([
  { key: "maintenance-apply-display", group: "Maintenance", name: "Apply display defaults to open grids", description: "Rewrite headers and fit-to-width on every grid currently on screen to match the Appearance defaults above. Existing grids keep their own settings until you press this. Use it when a grid you hid the labels on should follow the default again — the “Show row and column headers” switch hides labels everywhere while it is off, but on its own it never overrides a table you deliberately opted out.", control: "button", type: "string", default: "", scope: "graph", apply: "immediate", stage: "live" },
  { key: "maintenance-forget-device", group: "Maintenance", name: "Forget this device's overrides", description: "Drop the device-only values (toolbar, theme, notifications, maximum width, overscan, chunk cache, comment compose mode) and fall back to the graph-synced ones.", control: "button", type: "string", default: "", scope: "device", apply: "immediate", stage: "live" },
  { key: "maintenance-clear-caches", group: "Maintenance", name: "Clear local caches", description: "Forget the cached enhanced-table list and the theme palette. Nothing in your graph changes.", control: "button", type: "string", default: "", scope: "device", apply: "immediate", stage: "live" },
  { key: "maintenance-migrate-templates", group: "Maintenance", name: "Migrate legacy grid templates", description: "Rewrite any legacy JSON template records on [[roam/grid/templates]] into real, editable tables — a backup of each original record lands on [[roam/grid/metadata]] before anything is rewritten. This runs once automatically after Roam Grid loads; press it to convert templates that were skipped for exceeding the native-table write budget.", control: "button", type: "string", default: "", scope: "graph", apply: "immediate", stage: "live" },
  { key: "maintenance-reset", group: "Maintenance", name: "Reset all Roam Grid settings", description: "Restore every setting on this page to its default.", control: "button", type: "string", default: "", scope: "graph", apply: "immediate", stage: "live" },
].map((descriptor) => Object.freeze(descriptor)));

export const SETTINGS_MAINTENANCE = Object.freeze(Object.fromEntries(MAINTENANCE_ACTIONS.map((descriptor) => [descriptor.key, descriptor])));

export const SETTINGS = Object.freeze(Object.fromEntries(SETTING_DESCRIPTORS.map((descriptor, index) => {
  if (SETTING_DESCRIPTORS.findIndex((other) => other.key === descriptor.key) !== index) throw new Error(`Duplicate Roam Grid setting key: ${descriptor.key}`);
  if (descriptor.items) descriptor.items = Object.freeze([...descriptor.items]);
  return [descriptor.key, Object.freeze(descriptor)];
})));

export const settingsCache = new Map();

export const undoHistories = new Map();
export const portalObservers = new Map();

/** The three live-surface registries `applySettingsChange` walks. Exported so a test can drive the
 *  real propagation path instead of an injected stand-in; `onunload` clears them, never reassigns. */
export const gridSessions = new Map();
export const largeGridMounts = new Map();
export const gridViews = new Set();

export const runtime = {
  undoHistories,
  portalObservers,
  extensionAPI: null,
  observer: null,
  portalBodyObserver: null,
  metadata: null,
  templates: null,
  sessions: gridSessions,
  largeMounts: largeGridMounts,
  largeStores: new Map(),
  views: gridViews,
  viewsByNative: new WeakMap(),
  guardStyle: null,
  guardLargeStyle: null,
  pendingScanRoots: new Set(),
  rangeSpecs: new Map(),
  scanQueued: false,
  gridThemePalette: null,
  gridThemeSignature: null,
  disposers: [],
  registries: null,
  lastFocusedUid: null,
  keyboardOwner: null,
  commentArmed: false,
  // Native-overlay health is per session, never persisted: a graph that cannot mount Roam's editor
  // today may be able to after a reload, and a disabled flag on disk would outlive the cause.
  nativeEditorDisabledUntil: 0,
  nativeEditorFailures: 0,
  nativeEditorSawPopup: false,
  recentsDisabled: false,
  recentsOverruns: 0,
  recentsRearmedAt: null,
  recentlyAcceptedPages: [],
  suggestionRenderDisabled: false,
  slowSuggestionBatches: 0,
  largeScratch: null,
};

/** Recently-edited pages and blocks, keyed `<graph>:<page|block>`, 60 s TTL. The second and every
 *  later bare opener in a session resolves out of here, which is what removes the debounce. */
export const roamRecentsCache = new Map();

export const pendingTimers = new Set();

function trackedTimeout(callback, delay) {
  const id = setTimeout(() => { pendingTimers.delete(id); callback(); }, delay);
  pendingTimers.add(id);
  return id;
}

function clearTrackedTimers() {
  for (const id of pendingTimers) clearTimeout(id);
  pendingTimers.clear();
}

function cssAttributeValue(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/[\n\r\f]/g, "");
}

export function graphKeyName(hash = globalThis.location?.hash || "") {
  const graph = /#\/app\/([^/]+)/.exec(String(hash))?.[1] || "unknown";
  return decodeURIComponent(graph);
}

export function graphCacheKey(hash = globalThis.location?.hash || "") {
  return `${ENHANCED_UID_CACHE_PREFIX}${graphKeyName(hash)}`;
}

export function deviceSettingsKey(hash = globalThis.location?.hash || "") {
  return `${DEVICE_SETTINGS_PREFIX}${graphKeyName(hash)}`;
}

export function readEnhancedUidCache(storage = globalThis.localStorage, key = graphCacheKey()) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(key) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((uid) => typeof uid === "string" && uid.length > 0) : []);
  } catch { return new Set(); }
}

export function writeEnhancedUidCache(uids, storage = globalThis.localStorage, key = graphCacheKey()) {
  const values = [...new Set([...uids].map(String).filter(Boolean))].sort();
  try { storage?.setItem?.(key, JSON.stringify(values)); } catch { /* localStorage can be unavailable in hardened browsers */ }
  return values;
}

export function largeUidCacheKey(hash = globalThis.location?.hash || "") {
  return `${LARGE_UID_CACHE_PREFIX}${graphKeyName(hash)}`;
}

export function readLargeUidCache(storage = globalThis.localStorage, key = largeUidCacheKey()) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(key) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((uid) => typeof uid === "string" && uid.length > 0) : []);
  } catch (error) {
    if (globalThis.window) globalThis.window.__RG_LG_LAST_ERROR = String(error && error.stack || error);
    return new Set();
  }
}

export function writeLargeUidCache(uids, storage = globalThis.localStorage, key = largeUidCacheKey()) {
  const values = [...new Set([...uids].map(String).filter(Boolean))].sort();
  try { storage?.setItem?.(key, JSON.stringify(values)); } catch { /* localStorage can be unavailable in hardened browsers */ }
  return values;
}

export function coerceSetting(descriptor, raw) {
  if (!descriptor) return undefined;
  const fallback = descriptor.default;
  if (descriptor.type === "bool") {
    if (raw === true || raw === false) return raw;
    if (raw === 0 || raw === 1) return raw === 1;
    const text = typeof raw === "string" ? raw.trim().toLowerCase() : null;
    if (text === "true" || text === "1") return true;
    if (text === "false" || text === "0") return false;
    return fallback;
  }
  if (descriptor.type === "enum") {
    const text = raw == null ? "" : String(raw).trim().toLowerCase();
    return (descriptor.items || []).find((item) => String(item).toLowerCase() === text) ?? fallback;
  }
  if (descriptor.type === "int") {
    if (typeof raw !== "number" && typeof raw !== "string") return fallback;
    if (typeof raw === "string" && raw.trim() === "") return fallback;
    const value = typeof raw === "number" ? raw : Number(raw.trim());
    if (!Number.isFinite(value)) return fallback;
    const rounded = Math.round(value);
    const min = Number.isFinite(descriptor.min) ? descriptor.min : rounded;
    const max = Number.isFinite(descriptor.max) ? descriptor.max : rounded;
    return Math.min(max, Math.max(min, rounded));
  }
  if (raw == null) return fallback;
  const text = String(raw);
  return text === "" ? fallback : text;
}

export function settingDefaults() {
  return Object.fromEntries(Object.values(SETTINGS).map((descriptor) => [descriptor.key, descriptor.default]));
}

/** Pure migration planner: returns the exact write list, never performs I/O, never downgrades. */
export function planSettingsMigration(storedVersion, storedValues = {}) {
  const parsed = Number(storedVersion);
  const from = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  if (from >= SETTINGS_VERSION) return { from, to: from, writes: [] };
  const values = storedValues || {};
  const writes = [];
  if (values[LEGACY_BUDGET_KEY] != null && values[NATIVE_BUDGET_KEY] == null) writes.push([NATIVE_BUDGET_KEY, coerceSetting(SETTINGS[NATIVE_BUDGET_KEY], values[LEGACY_BUDGET_KEY])]);
  if (values[LEGACY_SIDEBAR_COMMENTS_KEY] === true && values[COMMENT_COMPOSE_MODE_KEY] == null) writes.push([COMMENT_COMPOSE_MODE_KEY, COMMENT_COMPOSE_SIDEBAR]);
  writes.push([SETTINGS_VERSION_KEY, SETTINGS_VERSION]);
  return { from, to: SETTINGS_VERSION, writes };
}

/**
 * Device-shadow counterpart to `planSettingsMigration`: the legacy sidebar switch was
 * device-scoped, so its value usually lives in the localStorage shadow rather than the graph.
 * Pure — the caller persists the returned values (`writeDeviceSettings` also drops any key the
 * current schema no longer declares).
 */
export function planDeviceSettingsMigration(deviceValues = {}) {
  const values = deviceValues && typeof deviceValues === "object" && !Array.isArray(deviceValues) ? deviceValues : {};
  if (!Object.hasOwn(values, LEGACY_SIDEBAR_COMMENTS_KEY)) return { changed: false, values };
  const next = { ...values };
  const legacy = next[LEGACY_SIDEBAR_COMMENTS_KEY];
  delete next[LEGACY_SIDEBAR_COMMENTS_KEY];
  if (legacy === true && next[COMMENT_COMPOSE_MODE_KEY] == null) next[COMMENT_COMPOSE_MODE_KEY] = COMMENT_COMPOSE_SIDEBAR;
  return { changed: true, values: next };
}

/** Device-scoped keys read device-first; the graph-synced value is only ever a seed. */
export function resolveSettingValue(descriptor, graphValue, deviceValue) {
  if (!descriptor) return undefined;
  if (descriptor.scope === "device" && deviceValue != null) return coerceSetting(descriptor, deviceValue);
  if (graphValue != null) return coerceSetting(descriptor, graphValue);
  return descriptor.default;
}

export function readDeviceSettings(storage = globalThis.localStorage, key = deviceSettingsKey()) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function writeDeviceSettings(values, storage = globalThis.localStorage, key = deviceSettingsKey()) {
  const stored = {};
  for (const [name, value] of Object.entries(values || {})) if (SETTINGS[name]?.scope === "device") stored[name] = value;
  try { storage?.setItem?.(key, JSON.stringify(stored)); } catch { /* localStorage can be unavailable in hardened browsers */ }
  return stored;
}

function readGraphSettings(extensionAPI) {
  const api = extensionAPI?.settings;
  if (typeof api?.getAll === "function") { try { return api.getAll() || {}; } catch { return {}; } }
  if (typeof api?.get !== "function") return {};
  const values = {};
  for (const key of [...Object.keys(SETTINGS), SETTINGS_VERSION_KEY, LEGACY_BUDGET_KEY, LEGACY_SIDEBAR_COMMENTS_KEY]) {
    const value = api.get(key);
    if (value != null) values[key] = value;
  }
  return values;
}

/** Rebuilds the whole cache from one bulk read so no later lookup touches extensionAPI. */
export function refreshSettingsCache(extensionAPI = runtime.extensionAPI, storage = globalThis.localStorage) {
  const graphValues = readGraphSettings(extensionAPI);
  const deviceValues = readDeviceSettings(storage);
  settingsCache.clear();
  for (const descriptor of Object.values(SETTINGS)) settingsCache.set(descriptor.key, resolveSettingValue(descriptor, graphValues[descriptor.key], deviceValues[descriptor.key]));
  return settingsCache;
}

/** O(1) Map read. Never call extensionAPI.settings.get from a render, keydown, or save path. */
export function getSetting(key, fallback) {
  if (settingsCache.has(key)) return settingsCache.get(key);
  return SETTINGS[key] ? SETTINGS[key].default : fallback;
}

export async function setSetting(key, value, { extensionAPI = runtime.extensionAPI, storage = globalThis.localStorage } = {}) {
  const descriptor = SETTINGS[key];
  if (!descriptor) return undefined;
  const coerced = coerceSetting(descriptor, value);
  settingsCache.set(key, coerced);
  if (descriptor.scope === "device") { const values = readDeviceSettings(storage); values[key] = coerced; writeDeviceSettings(values, storage); }
  if (extensionAPI?.settings?.canSet !== false) {
    try { await extensionAPI?.settings?.set?.(key, coerced); } catch (error) { console.warn("[roam-grid] Could not persist setting", key, error); }
  }
  applySettingsChange(descriptor, coerced);
  return coerced;
}

/**
 * Walks the three registries that are already maintained by the mount pipeline. It must never call
 * `scanMounts()` — a settings change is not a discovery event, and a scan from here would tear down
 * and remount every grid on the page.
 */
export function applySettingsChange(descriptor, value) {
  const resolved = typeof descriptor === "string" ? SETTINGS[descriptor] : descriptor;
  const counts = { key: resolved?.key ?? null, value, views: 0, largeMounts: 0, sessions: 0, failed: 0 };
  if (!resolved) return counts;
  counts.value = value === undefined ? getSetting(resolved.key) : value;
  const visit = (surface, handler, field) => {
    counts[field] += 1;
    try { handler(surface, counts.value); }
    catch (error) { counts.failed += 1; console.warn("[roam-grid] A setting could not reach a live grid", resolved.key, error); }
  };
  if (resolved.onView) for (const view of runtime.views) visit(view, resolved.onView, "views");
  if (resolved.onLarge) for (const mount of runtime.largeMounts.values()) visit(mount, resolved.onLarge, "largeMounts");
  if (resolved.onSession) for (const session of runtime.sessions.values()) visit(session, resolved.onSession, "sessions");
  return counts;
}

/** What CREATION stamps. `fitToWidth` uses `!== false` semantics in ~30 places, so "absent" cannot be
 *  told apart from "explicitly true"; it is therefore stamped at creation only, never inherited.
 *  `colorFormulaCells` and `showHeaders` are deliberately absent: both are masked live
 *  (`formulaTintEnabled`, `headersVisible`), and a value cannot be both an inherited creation default
 *  and a live mask without the two disagreeing — a grid created while the master switch was off would
 *  have stayed suppressed after the switch came back on. `displayRestampValues` is the separate set the
 *  maintenance button writes, and it does include `showHeaders`. */
export function displayDefaults() {
  return {
    fitToWidth: getSetting("appearance-fit-to-width") !== false,
  };
}

export function applyDisplayDefaults(target) {
  return target ? Object.assign(target, displayDefaults()) : target;
}

/**
 * What `maintenance-apply-display` writes, which is deliberately NOT what creation stamps.
 *
 * The mask is implicit and reversible; the button is an explicit user act that writes. `showHeaders`
 * therefore belongs here but not in `displayDefaults`: stamping it at creation would leave a grid made
 * while the switch was off permanently headerless once the switch came back on, whereas pressing this
 * button is the user saying "make the open grids match my default" out loud.
 *
 * It is also the only bulk path that can override an explicit per-table opt-out. The mask can suppress
 * globally but can never force a `false` flag back to true — that asymmetry is correct, and it is
 * exactly why this action has to exist.
 */
export function displayRestampValues() {
  return {
    ...displayDefaults(),
    showHeaders: getSetting("appearance-show-headers") !== false,
  };
}

/**
 * Formula tinting is a live global override, not a creation default: `renderCellValue` reads it per
 * render, so the mask costs one `Map.get` and is instantly reversible. Global off suppresses tinting
 * everywhere; global on hands each grid back to its own `colorFormulaCells`. Neither input is
 * written, so no metadata migration is involved.
 */
export function formulaTintEnabled(gridFlag) {
  return getSetting("appearance-formula-tinting") !== false && gridFlag !== false;
}

/** Toggles the tint class on already-mounted cells from their stored raw text — no re-render, no
 *  formula evaluation, and no write to the model. */
export function repaintFormulaTint(cells, gridFlag) {
  const enabled = formulaTintEnabled(gridFlag);
  for (const cell of cells?.values?.() || []) {
    const raw = cell?.dataset?.rgRaw ?? "";
    cell?.classList?.toggle("rg-cell--formula", enabled && raw.startsWith("=") && !raw.startsWith("=="));
  }
  return enabled;
}

/**
 * Media-decor equivalent of the tint repaint: re-resolves every mounted cell's image classes,
 * height cap, and chips from the live settings — no re-render, no formula evaluation, no model
 * write. Cell keys are the `row:col` form both grid classes already use.
 */
export function repaintMediaDecor(cells, model) {
  let visited = 0;
  for (const [key, cell] of cells?.entries?.() || []) {
    const [row, col] = String(key).split(":").map(Number);
    applyCellImageLayout(cell, model, row, col);
    visited += 1;
  }
  return visited;
}

/**
 * Row and column labels follow the same live-global mask as formula tinting: every layout read site
 * asks this instead of the stored flag, so a global off suppresses the axis gutters everywhere and a
 * global on hands each grid back to its own `⋯` / “Labels” choice. Neither input is written, so the
 * per-table choice survives and the global is instantly reversible with no metadata migration.
 * `fitToWidth` deliberately does NOT get this treatment — see the `appearance-fit-to-width` note.
 */
export function headersVisible(gridFlag) {
  return getSetting("appearance-show-headers") !== false && gridFlag !== false;
}

/** True while the cell editor may offer function or Roam-reference suggestions. Read live at both
 *  autocomplete sites so no open editor has to be rebuilt when the switch moves. */
export function autocompleteEnabled() {
  return getSetting("editing-autocomplete") !== false;
}

/** True while a bare `[[` / `((` may open on recents. Read live for the same reason. */
export function emptyOpenerEnabled() {
  return getSetting("editing-autocomplete-empty-opener") !== false;
}

/** True while a `{{` may offer the component catalog. Independent of the bare-opener switch above,
 *  which governs a Roam READ: this catalog is static, so there is nothing to budget or debounce. */
export function componentSuggestionsEnabled() {
  return getSetting("editing-autocomplete-components") !== false;
}

/** True while a `/` may offer the command subset. Defaults to OFF, unlike every other autocomplete
 *  switch, because what it offers is a fraction of Roam's own menu — see ROAM_COMMAND_CATALOG. */
export function commandSuggestionsEnabled() {
  return getSetting("editing-autocomplete-commands") === true;
}

/** True while the budget gate has disarmed bare openers — see RECENTS_BUDGET_MS. Self-healing:
 *  the next fetch at or under budget re-arms it. */
export function recentsDisabled() {
  return runtime.recentsDisabled === true;
}

/** True while a block suggestion may be rendered through Roam rather than shown as plain text. Both
 *  the setting and the session auto-off are read live, at the batch site, so a switch that moves
 *  mid-edit lands on the next result set instead of the next editor. */
export function suggestionRenderingEnabled() {
  return getSetting("editing-autocomplete-render-rows") !== false && runtime.suggestionRenderDisabled !== true;
}

/** Re-arms the session auto-off — see SUGGESTION_RENDER_BUDGET_MS. */
export function resetSuggestionRendering() {
  runtime.suggestionRenderDisabled = false;
  runtime.slowSuggestionBatches = 0;
}

/** B8's auto-off, counted per batch rather than per row: one slow batch is a cold React bundle, two
 *  is the graph. Reports through console.info and never a toast — rendered rows are a nicety. */
function noteSuggestionRenderBatch(elapsed) {
  if (elapsed <= SUGGESTION_RENDER_BUDGET_MS || runtime.suggestionRenderDisabled) return;
  runtime.slowSuggestionBatches += 1;
  if (runtime.slowSuggestionBatches < SLOW_SUGGESTION_BATCHES) return;
  runtime.suggestionRenderDisabled = true;
  console.info(`[roam-grid] Rendering suggestion rows went over the ${SUGGESTION_RENDER_BUDGET_MS}ms budget ${SLOW_SUGGESTION_BATCHES} times. Suggestion rows stay plain text for the rest of this session.`);
}

/** Drops the cached recents rows, the accepted-page LRU, and re-arms the budget switch. */
export function resetRoamRecents() {
  roamRecentsCache.clear();
  runtime.recentsDisabled = false;
  runtime.recentsOverruns = 0;
  runtime.recentsRearmedAt = null;
  runtime.recentlyAcceptedPages.length = 0;
}

/** Test hook: the registries `onload` builds, so a spec can mount a real view without a full load. */
export function ensureRuntimeRegistries() {
  if (!runtime.registries) runtime.registries = new RegistrySet();
  return runtime.registries;
}

/** `toast` gate. An error always shows, and a message carrying an action is a control rather than a
 *  notice, so it is never suppressed — suppressing it would remove the only way to run that action. */
export function notificationAllowed(intent, hasAction = false, level = getSetting("appearance-notifications")) {
  if (hasAction || intent === "danger") return true;
  if (level === NOTIFY_ERRORS) return false;
  if (level === NOTIFY_WARNINGS) return intent === "warning";
  return true;
}

/**
 * Returns the matrix a paste may actually write. With `editing-paste-grows-grid` on the matrix is
 * handed back untouched and the caller grows the grid as before; with it off the matrix is clipped to
 * the cells that already exist, so a paste can never insert rows or columns. The clip is announced
 * rather than silent — dropping cells without saying so is data loss the user never asked for.
 */
export function clipPasteMatrix(matrix, startRow, startCol, rowCount, colCount) {
  if (getSetting("editing-paste-grows-grid") !== false) return matrix;
  const rows = Math.max(0, Math.min(matrix.length, rowCount - startRow));
  const cols = Math.max(0, colCount - startCol);
  const clipped = matrix.slice(0, rows).map((row) => row.slice(0, cols));
  const dropped = rows < matrix.length || matrix.slice(0, rows).some((row) => row.length > cols);
  if (dropped) toast(`Paste clipped to the grid's current ${rowCount} × ${colCount} size.`, "warning");
  return clipped;
}

export function applyGridMaxWidth(root, value = getSetting("appearance-max-width")) {
  if (!root?.style?.setProperty) return null;
  const width = Math.round(Number(value) || DEFAULT_GRID_MAX_WIDTH);
  root.style.setProperty("--rg-max-width", `${width}px`);
  return width;
}

const TOOLBAR_PRESETS = Object.freeze(["Full", "Compact", "Minimal", "Hidden"]);

export function toolbarPresetClass(preset) {
  const match = TOOLBAR_PRESETS.find((item) => item.toLowerCase() === String(preset ?? "").trim().toLowerCase()) || "Full";
  return `rg-root--toolbar-${match.toLowerCase()}`;
}

export function applyToolbarPreset(root, preset = getSetting("appearance-toolbar-preset")) {
  if (!root?.classList) return null;
  const next = toolbarPresetClass(preset);
  for (const name of TOOLBAR_PRESETS) root.classList.remove(`rg-root--toolbar-${name.toLowerCase()}`);
  root.classList.add(next);
  return next;
}

export function enterMovement(direction = getSetting("editing-enter-direction")) {
  if (direction === "Right") return [0, 1];
  if (direction === "Stay") return null;
  return [1, 0];
}

export function tabMovement(direction = getSetting("editing-tab-direction"), shiftKey = false) {
  const step = shiftKey ? -1 : 1;
  return direction === "Down" ? [step, 0] : [0, step];
}

function settingsGroupClass(group) {
  return `rg-settings-${String(group).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function settingsEventValue(descriptor, event) {
  if (descriptor.control === "switch") return event?.target?.checked ?? event;
  return event?.target?.value ?? event;
}

export function settingsPanelRow(descriptor, { onChange = () => {}, onClick = () => {} } = {}) {
  const action = descriptor.control === "button"
    ? { type: "button", content: descriptor.name, onClick: () => onClick(descriptor.key) }
    : { type: descriptor.control, onChange: (event) => onChange(descriptor.key, settingsEventValue(descriptor, event)) };
  if (descriptor.control === "select") action.items = [...(descriptor.items || [])];
  if (descriptor.control === "input") action.placeholder = String(descriptor.default);
  return { id: descriptor.key, name: `${descriptor.group} — ${descriptor.name}`, description: descriptor.description, className: settingsGroupClass(descriptor.group), action };
}

export function buildSettingsPanelConfig(handlers = {}) {
  const settings = [];
  for (const descriptor of Object.values(SETTINGS)) {
    if (descriptor.stage === "pending") continue;
    settings.push(settingsPanelRow(descriptor, handlers));
  }
  for (const descriptor of MAINTENANCE_ACTIONS) settings.push(settingsPanelRow(descriptor, handlers));
  return { tabTitle: "Roam Grid", settings };
}

export function enhancedUidGuardCss(uids) {
  const selectors = [];
  const unique = [...new Set([...uids].map(String).filter(Boolean))].sort();
  if (unique.length > MAX_GUARD_UIDS) {
    console.warn(`[roam-grid] Skipping the pre-paint guard: ${unique.length} cached table uids exceeds the ${MAX_GUARD_UIDS} cap`);
    return "";
  }
  for (const uid of unique) {
    const escaped = cssAttributeValue(uid);
    selectors.push(
      `[id$="${escaped}"] .rm-table:not(.rg-native-hidden)`,
      `.rm-block-ref[data-uid="${escaped}"] .rm-table:not(.rg-native-hidden)`,
      `[data-uid="${escaped}"] .rm-table:not(.rg-native-hidden)`,
    );
  }
  return selectors.length ? `${selectors.join(",\n")} { visibility: hidden !important; pointer-events: none !important; }` : "";
}

// The large marker is Roam's grid xparser button (span.rm-xparser-default-grid); the guard targets
// only that button so prose or other renderings in the same block are never blanked, and the
// :not() handoff releases the instant LargeGridView.mount() adds .rg-large-marker-hidden to
// the button element itself.
export function largeGridGuardCss(uids) {
  const selectors = [];
  const unique = [...new Set([...uids].map(String).filter(Boolean))].sort();
  if (unique.length > MAX_GUARD_UIDS) {
    console.warn(`[roam-grid] Skipping the large-grid pre-paint guard: ${unique.length} cached grid uids exceeds the ${MAX_GUARD_UIDS} cap`);
    return "";
  }
  for (const uid of unique) {
    const escaped = cssAttributeValue(uid);
    selectors.push(
      `[id$="${escaped}"] .rm-xparser-default-grid:not(.rg-large-marker-hidden)`,
      `.rm-block-ref[data-uid="${escaped}"] .rm-xparser-default-grid:not(.rg-large-marker-hidden)`,
      `[data-uid="${escaped}"] .rm-xparser-default-grid:not(.rg-large-marker-hidden)`,
    );
  }
  return selectors.length ? `${selectors.join(",\n")} { visibility: hidden !important; pointer-events: none !important; }` : "";
}

export class GridError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GridError";
    this.code = code;
    this.details = details;
  }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const deepClone = (value) => JSON.parse(JSON.stringify(value));
const ordered = (items = []) => [...items].sort((a, b) => (a.order ?? a[":block/order"] ?? 0) - (b.order ?? b[":block/order"] ?? 0));
const makeLocalUid = () => `rg_${cryptoId()}`;
const cryptoId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
};
const cellLabel = (row, col) => `${columnLabel(col)}${row + 1}`;

export function fittedTrackResize(widths, targetId, requestedWidth, minimum = getSetting("sizing-min-col-width")) {
  const ids = Object.keys(widths);
  if (!ids.includes(targetId)) return { ...widths };
  if (ids.length === 1) return { [targetId]: clamp(requestedWidth, minimum, getSetting("sizing-max-col-width")) };
  const total = ids.reduce((sum, id) => sum + Math.max(minimum, Number(widths[id]) || minimum), 0);
  const requested = clamp(requestedWidth, minimum, getSetting("sizing-max-col-width"));
  const target = Math.min(requested, Math.max(minimum, total - minimum * (ids.length - 1)));
  const result = { [targetId]: target };
  let remaining = total - target;
  let pending = ids.filter((id) => id !== targetId);
  while (pending.length) {
    const baseTotal = pending.reduce((sum, id) => sum + Math.max(minimum, Number(widths[id]) || minimum), 0);
    const scale = baseTotal ? remaining / baseTotal : 1;
    const pinned = pending.filter((id) => (Number(widths[id]) || minimum) * scale <= minimum);
    if (!pinned.length) {
      for (const id of pending) result[id] = (Number(widths[id]) || minimum) * scale;
      break;
    }
    for (const id of pinned) { result[id] = minimum; remaining -= minimum; }
    pending = pending.filter((id) => !pinned.includes(id));
  }
  if (requested > target) result[targetId] = requested;
  return result;
}

export function columnLabel(index) {
  if (!Number.isSafeInteger(index) || index < 0) return "";
  let value = index + 1;
  let out = "";
  while (value > 0) {
    value -= 1;
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26);
  }
  return out;
}

export function parseCellReference(reference) {
  const match = /^\s*(\$?)([A-Z]+)(\$?)(\d+)\s*$/i.exec(reference);
  if (!match) return null;
  let col = 0;
  for (const char of match[2].toUpperCase()) {
    col = col * 26 + char.charCodeAt(0) - 64;
    if (!Number.isSafeInteger(col)) return null;
  }
  const row = Number(match[4]);
  if (!Number.isSafeInteger(row) || row < 1) return null;
  return {
    row: row - 1,
    col: col - 1,
    absoluteCol: Boolean(match[1]),
    absoluteRow: Boolean(match[3]),
  };
}

function formatCellReference(reference, row = reference.row, col = reference.col) {
  return `${reference.absoluteCol ? "$" : ""}${columnLabel(col)}${reference.absoluteRow ? "$" : ""}${row + 1}`;
}

export function formulaReferences(raw) {
  if (typeof raw !== "string" || !raw.startsWith("=") || raw.startsWith("==")) return [];
  const references = [];
  let index = 1;
  let quoted = false;
  while (index < raw.length) {
    if (raw[index] === '"') {
      if (quoted && raw[index + 1] === '"') { index += 2; continue; }
      quoted = !quoted; index += 1; continue;
    }
    if (quoted) { index += 1; continue; }
    const previous = raw[index - 1] || "";
    const match = /^(\$?[A-Z]+\$?\d+)(?:(\s*:\s*)(\$?[A-Z]+\$?\d+))?/i.exec(raw.slice(index));
    if (!match || /[A-Z0-9_.]/i.test(previous)) { index += 1; continue; }
    const next = raw[index + match[0].length] || "";
    if (/[A-Z0-9_.]/i.test(next)) { index += 1; continue; }
    const startRef = parseCellReference(match[1]);
    const endRef = parseCellReference(match[3] || match[1]);
    if (startRef && endRef) references.push({
      text: match[0], startIndex: index, endIndex: index + match[0].length,
      startText: match[1], endText: match[3] || match[1], separator: match[2] || null,
      startRef, endRef, range: normalizeRange({ startRow: startRef.row, endRow: endRef.row, startCol: startRef.col, endCol: endRef.col }),
    });
    index += match[0].length;
  }
  return references;
}

function formulaPositionIsQuoted(raw, caret) {
  let quoted = false;
  for (let index = 1; index < caret; index += 1) {
    if (raw[index] !== '"') continue;
    if (quoted && raw[index + 1] === '"' && index + 1 < caret) { index += 1; continue; }
    quoted = !quoted;
  }
  return quoted;
}

export function formulaAutocompleteContext(raw, caret = String(raw ?? "").length) {
  if (typeof raw !== "string" || !raw.startsWith("=") || raw.startsWith("==")) return null;
  const caretIndex = clamp(Number.isFinite(caret) ? caret : raw.length, 1, raw.length);
  if (formulaPositionIsQuoted(raw, caretIndex)) return null;
  let startIndex = caretIndex;
  while (startIndex > 1 && /[A-Z0-9_.]/i.test(raw[startIndex - 1])) startIndex -= 1;
  let endIndex = caretIndex;
  while (endIndex < raw.length && /[A-Z0-9_.]/i.test(raw[endIndex])) endIndex += 1;
  const token = raw.slice(startIndex, endIndex);
  if (token && !/^[A-Z_][A-Z0-9_.]*$/i.test(token)) return null;
  if (parseCellReference(token)) return null;
  const query = raw.slice(startIndex, caretIndex).toUpperCase();
  let boundaryIndex = startIndex - 1;
  while (boundaryIndex >= 1 && /\s/.test(raw[boundaryIndex])) boundaryIndex -= 1;
  const boundary = raw[boundaryIndex] || "";
  if (!/[=(,+\-*/^&%<>]/.test(boundary)) return null;
  let followingIndex = endIndex;
  while (followingIndex < raw.length && /\s/.test(raw[followingIndex])) followingIndex += 1;
  return { query, startIndex, endIndex, hasFollowingParenthesis: raw[followingIndex] === "(" };
}

export function formulaCanPointReference(raw, caret = String(raw ?? "").length) {
  if (typeof raw !== "string" || !raw.startsWith("=") || raw.startsWith("==")) return false;
  const caretIndex = clamp(Number.isFinite(caret) ? caret : raw.length, 1, raw.length);
  if (formulaPositionIsQuoted(raw, caretIndex)) return false;
  const prefix = raw.slice(1, caretIndex).trimEnd();
  if (!prefix) return true;
  return /[=(,:+\-*/^&%<>]$/.test(prefix);
}

function formatCoordinateLike(row, col, template = "") {
  const locks = parseCellReference(template);
  return formatCellReference({
    row,
    col,
    absoluteCol: Boolean(locks?.absoluteCol),
    absoluteRow: Boolean(locks?.absoluteRow),
  });
}

export function moveFormulaReferenceCoordinate(base, movement, dimensions, mergeAt = () => null) {
  const rowCount = Math.max(1, Number(dimensions?.rowCount) || 1);
  const colCount = Math.max(1, Number(dimensions?.colCount) || 1);
  const fromRow = clamp(Number(base?.row) || 0, 0, rowCount - 1);
  const fromCol = clamp(Number(base?.col) || 0, 0, colCount - 1);
  const dr = Number(movement?.[0]) || 0;
  const dc = Number(movement?.[1]) || 0;
  const source = mergeAt(fromRow, fromCol);
  let row = source ? (dr > 0 ? source.row + source.rowSpan : dr < 0 ? source.row - 1 : source.row) : fromRow + dr;
  let col = source ? (dc > 0 ? source.col + source.colSpan : dc < 0 ? source.col - 1 : source.col) : fromCol + dc;
  row = clamp(row, 0, rowCount - 1);
  col = clamp(col, 0, colCount - 1);
  const target = mergeAt(row, col);
  return { row: target?.row ?? row, col: target?.col ?? col };
}

function formulaCatalogEntries(catalog) {
  const source = catalog?.formulaFunctionMetadata || catalog;
  let entries;
  if (source instanceof Map) entries = [...source.entries()];
  else if (Array.isArray(source)) entries = source.map((value) => typeof value === "string" ? [value, {}] : [value?.name, value]);
  else if (source && typeof source === "object") entries = Object.entries(source);
  else entries = [];
  const seen = new Set();
  return entries.flatMap(([name, metadata]) => {
    const normalized = String(name || "").toUpperCase();
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    const value = metadata && typeof metadata === "object" && typeof metadata !== "function" ? metadata : {};
    return [{
      name: normalized,
      parameters: Array.isArray(value.parameters) ? value.parameters.map(String) : [],
      description: String(value.description || ""),
      volatile: value.volatile !== false,
    }];
  });
}

function formulaNameScore(name, query) {
  if (!query) return 100;
  if (name === query) return 0;
  if (name.startsWith(query)) return 10 + Math.min(20, name.length - query.length);
  const segmentIndex = name.split(/[._]/).findIndex((segment) => segment.startsWith(query));
  if (segmentIndex >= 0) return 35 + segmentIndex;
  const contains = name.indexOf(query);
  if (contains >= 0) return 50 + contains;
  let queryIndex = 0; let gaps = 0; let lastMatch = -1;
  for (let index = 0; index < name.length && queryIndex < query.length; index += 1) {
    if (name[index] !== query[queryIndex]) continue;
    if (lastMatch >= 0) gaps += index - lastMatch - 1;
    lastMatch = index; queryIndex += 1;
  }
  return queryIndex === query.length ? 80 + gaps : Number.POSITIVE_INFINITY;
}

export function rankFormulaFunctions(query, catalog, limit = 8) {
  const normalizedQuery = String(query || "").trim().toUpperCase();
  const count = Math.max(0, Number.isFinite(limit) ? Math.floor(limit) : 8);
  return formulaCatalogEntries(catalog)
    .map((entry) => ({ ...entry, score: formulaNameScore(entry.name, normalizedQuery) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, count);
}

export function activeFormulaCall(raw, caret = String(raw ?? "").length) {
  if (typeof raw !== "string" || !raw.startsWith("=") || raw.startsWith("==")) return null;
  const endIndex = clamp(Number.isFinite(caret) ? caret : raw.length, 1, raw.length);
  const stack = [];
  let quoted = false;
  for (let index = 1; index < endIndex; index += 1) {
    const char = raw[index];
    if (char === '"') {
      if (quoted && raw[index + 1] === '"' && index + 1 < endIndex) { index += 1; continue; }
      quoted = !quoted; continue;
    }
    if (quoted) continue;
    if (char === "(") {
      let nameEnd = index;
      while (nameEnd > 1 && /\s/.test(raw[nameEnd - 1])) nameEnd -= 1;
      let nameStart = nameEnd;
      while (nameStart > 1 && /[A-Z0-9_.]/i.test(raw[nameStart - 1])) nameStart -= 1;
      const candidate = raw.slice(nameStart, nameEnd);
      const validBoundary = nameStart === 1 || !/[A-Z0-9_.$]/i.test(raw[nameStart - 1]);
      const name = validBoundary && /^[A-Z_][A-Z0-9_.]*$/i.test(candidate) ? candidate.toUpperCase() : null;
      stack.push({ name, argumentIndex: 0, openIndex: index, callStartIndex: name ? nameStart : index });
    } else if (char === ")") stack.pop();
    else if (char === "," && stack.length) stack[stack.length - 1].argumentIndex += 1;
  }
  for (let index = stack.length - 1; index >= 0; index -= 1) if (stack[index].name) return { ...stack[index] };
  return null;
}

function cycleCellReferenceLock(reference) {
  const parsed = parseCellReference(reference);
  if (!parsed) return reference;
  if (!parsed.absoluteCol && !parsed.absoluteRow) { parsed.absoluteCol = true; parsed.absoluteRow = true; }
  else if (parsed.absoluteCol && parsed.absoluteRow) parsed.absoluteCol = false;
  else if (!parsed.absoluteCol && parsed.absoluteRow) { parsed.absoluteCol = true; parsed.absoluteRow = false; }
  else parsed.absoluteCol = false;
  return formatCellReference(parsed) || reference;
}

function cycleFormulaReferenceToken(token) {
  if (!token.separator) return cycleCellReferenceLock(token.startText || token.text);
  return `${cycleCellReferenceLock(token.startText)}${token.separator}${cycleCellReferenceLock(token.endText)}`;
}

export function cycleFormulaReferenceLocks(raw, selectionStart, selectionEnd = selectionStart) {
  const source = String(raw ?? "");
  const lower = clamp(Math.min(Number(selectionStart) || 0, Number(selectionEnd) || 0), 0, source.length);
  const upper = clamp(Math.max(Number(selectionStart) || 0, Number(selectionEnd) || 0), 0, source.length);
  const collapsed = lower === upper;
  const targets = formulaReferences(source).filter((token) => collapsed
    ? lower >= token.startIndex && lower <= token.endIndex
    : token.startIndex < upper && token.endIndex > lower);
  if (!targets.length) return { value: source, selectionStart: lower, selectionEnd: upper, changed: false, references: [] };

  let value = ""; let cursor = 0; let delta = 0;
  const replacements = [];
  for (const token of targets) {
    value += source.slice(cursor, token.startIndex);
    const text = cycleFormulaReferenceToken(token);
    const startIndex = token.startIndex + delta;
    value += text;
    replacements.push({ startIndex, endIndex: startIndex + text.length, text });
    delta += text.length - token.text.length;
    cursor = token.endIndex;
  }
  value += source.slice(cursor);

  const mapOffset = (offset) => {
    let shift = 0;
    for (let index = 0; index < targets.length; index += 1) {
      const token = targets[index]; const replacement = replacements[index];
      if (offset < token.startIndex) break;
      if (offset >= token.endIndex) { shift += replacement.text.length - token.text.length; continue; }
      return replacement.startIndex + Math.min(offset - token.startIndex, replacement.text.length);
    }
    return offset + shift;
  };
  const nextStart = collapsed ? replacements[0].endIndex : mapOffset(lower);
  const nextEnd = collapsed ? nextStart : mapOffset(upper);
  return { value, selectionStart: nextStart, selectionEnd: nextEnd, changed: true, references: replacements };
}

function transformStructuralIndex(value, { index, insertCount = 0, deleteCount = 0 }) {
  if (insertCount) return value >= index ? value + insertCount : value;
  const end = index + deleteCount - 1;
  if (value < index) return value;
  if (value > end) return value - deleteCount;
  return null;
}

function transformStructuralSpan(start, end, change) {
  const ascending = start <= end;
  let low = Math.min(start, end);
  let high = Math.max(start, end);
  if (change.insertCount) {
    if (change.index <= low) { low += change.insertCount; high += change.insertCount; }
    else if (change.index <= high || change.index === high + 1 && change.formulaIndex === change.index) high += change.insertCount;
  } else {
    const deletedEnd = change.index + change.deleteCount - 1;
    if (high < change.index) { /* unchanged */ }
    else if (low > deletedEnd) { low -= change.deleteCount; high -= change.deleteCount; }
    else if (low >= change.index && high <= deletedEnd) return null;
    else {
      const originalLow = low; const originalHigh = high;
      low = originalLow < change.index ? originalLow : change.index;
      high = originalHigh > deletedEnd ? originalHigh - change.deleteCount : change.index - 1;
    }
  }
  return ascending ? [low, high] : [high, low];
}

export function rewriteFormulaForStructure(raw, { axis, index, insertCount = 0, deleteCount = 0, formulaRow = null, formulaCol = null }) {
  if (!['row', 'col'].includes(axis) || (!insertCount && !deleteCount)) return raw;
  const tokens = formulaReferences(raw);
  if (!tokens.length) return raw;
  let output = ""; let cursor = 0;
  for (const token of tokens) {
    output += raw.slice(cursor, token.startIndex);
    if (token.separator) {
      const startValue = axis === "row" ? token.startRef.row : token.startRef.col;
      const endValue = axis === "row" ? token.endRef.row : token.endRef.col;
      const span = transformStructuralSpan(startValue, endValue, { index, insertCount, deleteCount, formulaIndex: axis === "row" ? formulaRow : formulaCol });
      if (!span) output += "#REF!";
      else {
        const startRow = axis === "row" ? span[0] : token.startRef.row;
        const startCol = axis === "col" ? span[0] : token.startRef.col;
        const endRow = axis === "row" ? span[1] : token.endRef.row;
        const endCol = axis === "col" ? span[1] : token.endRef.col;
        output += `${formatCellReference(token.startRef, startRow, startCol)}${token.separator}${formatCellReference(token.endRef, endRow, endCol)}`;
      }
    } else {
      const value = axis === "row" ? token.startRef.row : token.startRef.col;
      const next = transformStructuralIndex(value, { index, insertCount, deleteCount });
      if (next == null) output += "#REF!";
      else output += formatCellReference(token.startRef, axis === "row" ? next : token.startRef.row, axis === "col" ? next : token.startRef.col);
    }
    cursor = token.endIndex;
  }
  return output + raw.slice(cursor);
}

export function normalizeRange(range) {
  const startRow = Math.min(range.startRow, range.endRow);
  const endRow = Math.max(range.startRow, range.endRow);
  const startCol = Math.min(range.startCol, range.endCol);
  const endCol = Math.max(range.startCol, range.endCol);
  return { startRow, endRow, startCol, endCol };
}

function rangeContains(range, row, col) {
  const value = normalizeRange(range);
  return row >= value.startRow && row <= value.endRow && col >= value.startCol && col <= value.endCol;
}

function rangesOverlap(a, b) {
  const x = normalizeRange(a);
  const y = normalizeRange(b);
  return x.startRow <= y.endRow && x.endRow >= y.startRow && x.startCol <= y.endCol && x.endCol >= y.startCol;
}

function rangeLabel(range) {
  const start = cellLabel(range.startRow, range.startCol);
  const end = cellLabel(range.endRow, range.endCol);
  return start === end ? start : `${start}:${end}`;
}

export function formatRangeComponent(model, selection) {
  const tableUid = model?.tableUid;
  if (!tableUid || String(tableUid).startsWith("rg_")) {
    throw new GridError("REFERENCE_PENDING", "This grid does not have a persisted Roam UID yet");
  }
  return `{{${RANGE_COMPONENT_NAME}: ((${tableUid})) ${rangeLabel(normalizeRange(selection))}}}`;
}

export function parseRangeComponent(text) {
  if (typeof text !== "string") return null;
  const match = RANGE_MARKER.exec(text);
  if (!match) return null;
  const tableUid = match[1];
  const start = parseCellReference(match[2]);
  const end = parseCellReference(match[3] || match[2]);
  if (!start || !end) return null;
  const range = normalizeRange({ startRow: start.row, endRow: end.row, startCol: start.col, endCol: end.col });
  return { tableUid, range, label: rangeLabel(range) };
}

function numeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value == null || value === "") return 0;
  const parsed = Number(String(value).replaceAll(",", "").replace(/[%$]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function flatten(values) {
  const output = [];
  for (const value of values) Array.isArray(value) ? output.push(...flatten(value)) : output.push(value);
  return output;
}

class FormulaParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
    this.current = null;
    this.next();
  }

  next() {
    const source = this.source;
    while (/\s/.test(source[this.index] || "")) this.index += 1;
    if (this.index >= source.length) return (this.current = { type: "eof", value: "" });
    const rest = source.slice(this.index);
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(rest);
    if (number) {
      this.index += number[0].length;
      return (this.current = { type: "number", value: Number(number[0]) });
    }
    if (rest[0] === '"') {
      let value = "";
      this.index += 1;
      while (this.index < source.length) {
        if (source[this.index] === '"') {
          if (source[this.index + 1] === '"') {
            value += '"';
            this.index += 2;
            continue;
          }
          this.index += 1;
          return (this.current = { type: "string", value });
        }
        value += source[this.index++];
      }
      throw new GridError("FORMULA_PARSE", "Unterminated formula string");
    }
    const ref = /^\$?[A-Z]+\$?\d+/i.exec(rest);
    if (ref) {
      this.index += ref[0].length;
      return (this.current = { type: "ref", value: ref[0].toUpperCase() });
    }
    const identifier = /^[A-Z_][A-Z0-9_.]*/i.exec(rest);
    if (identifier) {
      this.index += identifier[0].length;
      return (this.current = { type: "identifier", value: identifier[0].toUpperCase() });
    }
    const operator = /^(<=|>=|<>|!=|==|[+\-*/^&%=<>,():])/i.exec(rest);
    if (operator) {
      this.index += operator[0].length;
      return (this.current = { type: "operator", value: operator[0] });
    }
    throw new GridError("FORMULA_PARSE", `Unexpected token near “${rest.slice(0, 12)}”`);
  }

  accept(value) {
    if (this.current.value !== value) return false;
    this.next();
    return true;
  }

  expect(value) {
    if (!this.accept(value)) throw new GridError("FORMULA_PARSE", `Expected “${value}”`);
  }

  parse() {
    const expression = this.comparison();
    if (this.current.type !== "eof") throw new GridError("FORMULA_PARSE", `Unexpected “${this.current.value}”`);
    return expression;
  }

  comparison() {
    let node = this.concat();
    while (["=", "==", "!=", "<>", "<", ">", "<=", ">="].includes(this.current.value)) {
      const op = this.current.value;
      this.next();
      node = { type: "binary", op, left: node, right: this.concat() };
    }
    return node;
  }

  concat() {
    let node = this.additive();
    while (this.current.value === "&") {
      this.next();
      node = { type: "binary", op: "&", left: node, right: this.additive() };
    }
    return node;
  }

  additive() {
    let node = this.multiplicative();
    while (["+", "-"].includes(this.current.value)) {
      const op = this.current.value;
      this.next();
      node = { type: "binary", op, left: node, right: this.multiplicative() };
    }
    return node;
  }

  multiplicative() {
    let node = this.power();
    while (["*", "/", "%"].includes(this.current.value)) {
      const op = this.current.value;
      this.next();
      node = { type: "binary", op, left: node, right: this.power() };
    }
    return node;
  }

  power() {
    let node = this.unary();
    if (this.current.value === "^") {
      this.next();
      node = { type: "binary", op: "^", left: node, right: this.power() };
    }
    return node;
  }

  unary() {
    if (["+", "-"].includes(this.current.value)) {
      const op = this.current.value;
      this.next();
      return { type: "unary", op, value: this.unary() };
    }
    return this.primary();
  }

  primary() {
    if (this.current.type === "number" || this.current.type === "string") {
      const node = { type: "literal", value: this.current.value };
      this.next();
      return node;
    }
    if (this.current.type === "ref") {
      const start = this.current.value;
      this.next();
      if (this.accept(":")) {
        if (this.current.type !== "ref") throw new GridError("FORMULA_PARSE", "Range requires two cell references");
        const end = this.current.value;
        this.next();
        return { type: "range", start, end };
      }
      return { type: "ref", value: start };
    }
    if (this.current.type === "identifier") {
      const name = this.current.value;
      this.next();
      if (this.accept("(")) {
        const args = [];
        if (!this.accept(")")) {
          do args.push(this.comparison()); while (this.accept(","));
          this.expect(")");
        }
        return { type: "call", name, args };
      }
      if (name === "TRUE") return { type: "literal", value: true };
      if (name === "FALSE") return { type: "literal", value: false };
      throw new GridError("FORMULA_NAME", `Unknown name ${name}`);
    }
    if (this.accept("(")) {
      const node = this.comparison();
      this.expect(")");
      return node;
    }
    throw new GridError("FORMULA_PARSE", `Expected a value near “${this.current.value}”`);
  }
}

function defaultFormulaFunctionDefinitions() {
  const values = (args) => flatten(args).filter((value) => value !== "" && value != null);
  const numbers = (args) => values(args).map(numeric);
  return new Map(Object.entries({
    SUM: { fn: (...args) => numbers(args).reduce((sum, value) => sum + value, 0), parameters: ["number1", "[number2, …]"], description: "Adds numbers and ranges." },
    AVERAGE: { fn: (...args) => { const list = numbers(args); return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0; }, parameters: ["number1", "[number2, …]"], description: "Returns the arithmetic mean." },
    AVG: { fn: (...args) => { const list = numbers(args); return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0; }, parameters: ["number1", "[number2, …]"], description: "Alias for AVERAGE." },
    MIN: { fn: (...args) => Math.min(...numbers(args)), parameters: ["number1", "[number2, …]"], description: "Returns the smallest number." },
    MAX: { fn: (...args) => Math.max(...numbers(args)), parameters: ["number1", "[number2, …]"], description: "Returns the largest number." },
    COUNT: { fn: (...args) => values(args).filter((value) => Number.isFinite(Number(value))).length, parameters: ["value1", "[value2, …]"], description: "Counts numeric values." },
    COUNTA: { fn: (...args) => values(args).length, parameters: ["value1", "[value2, …]"], description: "Counts non-empty values." },
    IF: { fn: (condition, yes, no = false) => condition ? yes : no, parameters: ["condition", "value_if_true", "[value_if_false]"], description: "Returns one value when true and another when false." },
    AND: { fn: (...args) => values(args).every(Boolean), parameters: ["condition1", "[condition2, …]"], description: "Returns true when every condition is true." },
    OR: { fn: (...args) => values(args).some(Boolean), parameters: ["condition1", "[condition2, …]"], description: "Returns true when any condition is true." },
    NOT: { fn: (value) => !value, parameters: ["condition"], description: "Reverses a logical value." },
    ABS: { fn: (value) => Math.abs(numeric(value)), parameters: ["number"], description: "Returns the absolute value." },
    ROUND: { fn: (value, digits = 0) => { const factor = 10 ** numeric(digits); return Math.round(numeric(value) * factor) / factor; }, parameters: ["number", "[digits]"], description: "Rounds a number to a number of digits." },
    FLOOR: { fn: (value, significance = 1) => Math.floor(numeric(value) / numeric(significance)) * numeric(significance), parameters: ["number", "[significance]"], description: "Rounds a number down to a multiple." },
    CEIL: { fn: (value, significance = 1) => Math.ceil(numeric(value) / numeric(significance)) * numeric(significance), parameters: ["number", "[significance]"], description: "Rounds a number up to a multiple." },
    CEILING: { fn: (value, significance = 1) => Math.ceil(numeric(value) / numeric(significance)) * numeric(significance), parameters: ["number", "[significance]"], description: "Alias for CEIL." },
    SQRT: { fn: (value) => Math.sqrt(numeric(value)), parameters: ["number"], description: "Returns the positive square root." },
    POW: { fn: (value, power) => numeric(value) ** numeric(power), parameters: ["number", "power"], description: "Raises a number to a power." },
    POWER: { fn: (value, power) => numeric(value) ** numeric(power), parameters: ["number", "power"], description: "Alias for POW." },
    MOD: { fn: (value, divisor) => numeric(value) % numeric(divisor), parameters: ["number", "divisor"], description: "Returns the remainder after division." },
    CONCAT: { fn: (...args) => flatten(args).join(""), parameters: ["value1", "[value2, …]"], description: "Joins values as text." },
    CONCATENATE: { fn: (...args) => flatten(args).join(""), parameters: ["value1", "[value2, …]"], description: "Alias for CONCAT." },
    LEN: { fn: (value) => String(value ?? "").length, parameters: ["text"], description: "Returns the number of characters." },
    LOWER: { fn: (value) => String(value ?? "").toLowerCase(), parameters: ["text"], description: "Converts text to lowercase." },
    UPPER: { fn: (value) => String(value ?? "").toUpperCase(), parameters: ["text"], description: "Converts text to uppercase." },
    TRIM: { fn: (value) => String(value ?? "").trim().replace(/\s+/g, " "), parameters: ["text"], description: "Removes extra whitespace." },
    LEFT: { fn: (value, count = 1) => String(value ?? "").slice(0, numeric(count)), parameters: ["text", "[count]"], description: "Returns characters from the start of text." },
    RIGHT: { fn: (value, count = 1) => String(value ?? "").slice(-numeric(count)), parameters: ["text", "[count]"], description: "Returns characters from the end of text." },
    MID: { fn: (value, start, count) => String(value ?? "").slice(numeric(start) - 1, numeric(start) - 1 + numeric(count)), parameters: ["text", "start", "count"], description: "Returns characters from the middle of text." },
    INDEX: { fn: (range, row, col = 1) => Array.isArray(range?.[0]) ? range[numeric(row) - 1]?.[numeric(col) - 1] ?? "" : flatten([range])[numeric(row) - 1] ?? "", parameters: ["range", "row", "[column]"], description: "Returns a value at a range position." },
    MATCH: { fn: (needle, range) => flatten([range]).findIndex((item) => item === needle) + 1, parameters: ["value", "range"], description: "Returns the one-based position of a value." },
  }));
}

function defaultFormulaFunctions(definitions = defaultFormulaFunctionDefinitions()) {
  return new Map([...definitions].map(([name, definition]) => [name, definition.fn]));
}

function defaultFormulaFunctionMetadata(definitions = defaultFormulaFunctionDefinitions()) {
  return new Map([...definitions].map(([name, definition]) => [name, {
    parameters: [...definition.parameters],
    description: definition.description,
    volatile: false,
  }]));
}

function formulaAstUsesVolatileFunction(node, metadata) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "call" && metadata?.get(node.name)?.volatile !== false) return true;
  if (node.type === "call") return node.args.some((argument) => formulaAstUsesVolatileFunction(argument, metadata));
  if (node.type === "unary") return formulaAstUsesVolatileFunction(node.value, metadata);
  if (node.type === "binary") return formulaAstUsesVolatileFunction(node.left, metadata) || formulaAstUsesVolatileFunction(node.right, metadata);
  return false;
}

export class FormulaDependencyCache {
  constructor(metadata = defaultFormulaFunctionMetadata()) {
    this.metadata = metadata;
    this.parsedFormulas = new Map();
    this.dependencies = new Map();
    this.reverseDependencies = new Map();
    this.volatileFormulas = new Set();
  }

  forgetFormula(key) {
    for (const source of this.dependencies.get(key) || []) {
      const dependents = this.reverseDependencies.get(source);
      dependents?.delete(key);
      if (!dependents?.size) this.reverseDependencies.delete(source);
    }
    this.dependencies.delete(key);
    this.parsedFormulas.delete(key);
    this.volatileFormulas.delete(key);
  }

  formula(key, raw) {
    const existing = this.parsedFormulas.get(key);
    if (existing?.raw === raw) return existing;
    this.forgetFormula(key);
    let ast = null; let error = null;
    try { ast = new FormulaParser(raw.slice(1)).parse(); } catch (cause) { error = cause; }
    const record = { raw, ast, error };
    this.parsedFormulas.set(key, record);
    if (ast && formulaAstUsesVolatileFunction(ast, this.metadata)) this.volatileFormulas.add(key);
    return record;
  }

  register(formulaKey, sourceKey) {
    if (!this.dependencies.has(formulaKey)) this.dependencies.set(formulaKey, new Set());
    if (!this.reverseDependencies.has(sourceKey)) this.reverseDependencies.set(sourceKey, new Set());
    this.dependencies.get(formulaKey).add(sourceKey);
    this.reverseDependencies.get(sourceKey).add(formulaKey);
  }

  affectedFrom(key, includeVolatile = true) {
    const affected = new Set([key]);
    const queue = [key];
    if (includeVolatile) for (const volatileKey of this.volatileFormulas) {
      if (affected.has(volatileKey)) continue;
      affected.add(volatileKey); queue.push(volatileKey);
    }
    for (let index = 0; index < queue.length; index += 1) {
      for (const dependent of this.reverseDependencies.get(queue[index]) || []) {
        if (affected.has(dependent)) continue;
        affected.add(dependent); queue.push(dependent);
      }
    }
    return affected;
  }
}

export class FormulaEngine {
  constructor(model, functions = defaultFormulaFunctions(), metadata = defaultFormulaFunctionMetadata()) {
    this.model = model;
    this.functions = functions;
    this.cache = new Map();
    this.stack = new Set();
    this.dependencyCache = new FormulaDependencyCache(metadata);
    this.parsedFormulas = this.dependencyCache.parsedFormulas;
    this.reverseDependencies = this.dependencyCache.reverseDependencies;
  }

  evaluateCell(row, col) {
    const key = `${row}:${col}`;
    const raw = this.model.getRaw(row, col);
    if (typeof raw !== "string" || !raw.startsWith("=") || raw.startsWith("==")) {
      if (this.parsedFormulas.has(key)) { this.dependencyCache.forgetFormula(key); this.cache.delete(key); }
      return raw;
    }
    const previousRaw = this.parsedFormulas.get(key)?.raw;
    const parsed = this.dependencyCache.formula(key, raw);
    if (previousRaw != null && previousRaw !== raw) this.cache.delete(key);
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.stack.has(key)) return "#CYCLE!";
    if (raw.includes("#REF!")) return "#REF!";
    this.stack.add(key);
    let result;
    try {
      if (parsed.error) throw parsed.error;
      result = this.evaluateNode(parsed.ast, key);
      if (typeof result === "number" && !Number.isFinite(result)) result = "#NUM!";
    } catch (error) {
      result = error?.code === "FORMULA_NAME" ? "#NAME?" : error?.code === "FORMULA_REF" ? "#REF!" : "#VALUE!";
    } finally {
      this.stack.delete(key);
    }
    this.cache.set(key, result);
    return result;
  }

  evaluateNode(node, ownerKey = null) {
    if (node.type === "literal") return node.value;
    if (node.type === "ref") {
      const ref = parseCellReference(node.value);
      if (!ref || !this.model.inBounds(ref.row, ref.col)) throw new GridError("FORMULA_REF", "Invalid cell reference");
      if (ownerKey) this.dependencyCache.register(ownerKey, `${ref.row}:${ref.col}`);
      return this.evaluateCell(ref.row, ref.col);
    }
    if (node.type === "range") {
      const start = parseCellReference(node.start);
      const end = parseCellReference(node.end);
      if (!start || !end) throw new GridError("FORMULA_REF", "Invalid range");
      const range = normalizeRange({ startRow: start.row, endRow: end.row, startCol: start.col, endCol: end.col });
      const rows = [];
      for (let row = range.startRow; row <= range.endRow; row += 1) {
        const values = [];
        for (let col = range.startCol; col <= range.endCol; col += 1) {
          if (ownerKey && this.model.inBounds(row, col)) this.dependencyCache.register(ownerKey, `${row}:${col}`);
          values.push(this.model.inBounds(row, col) ? this.evaluateCell(row, col) : "#REF!");
        }
        rows.push(values);
      }
      return rows;
    }
    if (node.type === "unary") return node.op === "-" ? -numeric(this.evaluateNode(node.value, ownerKey)) : numeric(this.evaluateNode(node.value, ownerKey));
    if (node.type === "binary") {
      const left = this.evaluateNode(node.left, ownerKey);
      const right = this.evaluateNode(node.right, ownerKey);
      switch (node.op) {
        case "+": return numeric(left) + numeric(right);
        case "-": return numeric(left) - numeric(right);
        case "*": return numeric(left) * numeric(right);
        case "/": return numeric(right) === 0 ? "#DIV/0!" : numeric(left) / numeric(right);
        case "%": return numeric(left) % numeric(right);
        case "^": return numeric(left) ** numeric(right);
        case "&": return `${left ?? ""}${right ?? ""}`;
        case "=": case "==": return left === right;
        case "!=": case "<>": return left !== right;
        case "<": return left < right;
        case ">": return left > right;
        case "<=": return left <= right;
        case ">=": return left >= right;
        default: throw new GridError("FORMULA_OPERATOR", `Unsupported operator ${node.op}`);
      }
    }
    if (node.type === "call") {
      const fn = this.functions.get(node.name);
      if (!fn) throw new GridError("FORMULA_NAME", `Unknown function ${node.name}`);
      return fn(...node.args.map((arg) => this.evaluateNode(arg, ownerKey)));
    }
    throw new GridError("FORMULA_PARSE", "Unknown formula expression");
  }

  evaluateAll() {
    const values = [];
    for (let row = 0; row < this.model.rowCount; row += 1) {
      const result = [];
      for (let col = 0; col < this.model.colCount; col += 1) result.push(this.evaluateCell(row, col));
      values.push(result);
    }
    return values;
  }

  invalidateCell(row, col) {
    const key = `${row}:${col}`;
    const affected = this.dependencyCache.affectedFrom(key);
    for (const affectedKey of affected) this.cache.delete(affectedKey);
    this.dependencyCache.forgetFormula(key);
    return affected;
  }
}

function normalizeCells(rows, width) {
  return rows.map((row) => Array.from({ length: width }, (_, col) => {
    const value = row[col];
    if (value && typeof value === "object" && Object.hasOwn(value, "raw")) return { uid: value.uid || makeLocalUid(), raw: String(value.raw ?? "") };
    return { uid: makeLocalUid(), raw: String(value ?? "") };
  }));
}

export function gridShapeSignature(model) {
  return [...model.rows.map((row) => row[0]?.uid || ""), "::", ...model.columnIds].join("\u0001");
}

const UNDO_SHAPE_OPS = new Set(["insertRowAt", "removeRowByUid", "insertColAt", "removeColById", "orderRows", "orderCols"]);
let undoEntrySequence = 0;

function rowIndexForUid(model, rowUid) {
  return model.rows.findIndex((row) => row[0]?.uid === rowUid);
}

function cellCoordinateForUid(model, uid) {
  for (let row = 0; row < model.rows.length; row += 1) {
    const col = model.rows[row].findIndex((cell) => cell.uid === uid);
    if (col >= 0) return { row, col };
  }
  return null;
}

function undoOpWriteUids(op) {
  switch (op.op) {
    case "setRaw": return [op.uid];
    case "setAlignment": return [op.uid];
    case "setRowHeight": return [op.rowUid];
    case "removeRowByUid": return [op.rowUid];
    case "insertRowAt": return op.cells.map((cell) => cell.uid);
    case "insertColAt": return op.cells.map((cell) => cell.uid);
    case "removeColById": return [op.columnId];
    default: return [];
  }
}

function remapUndoOp(op, uidMap) {
  const swap = (value) => (value != null && uidMap.has(value) ? uidMap.get(value) : value);
  switch (op.op) {
    case "setRaw": return { ...op, uid: swap(op.uid) };
    case "setAlignment": return { ...op, uid: swap(op.uid) };
    case "setRowHeight": return { ...op, rowUid: swap(op.rowUid) };
    case "setWidth": return { ...op, columnId: swap(op.columnId) };
    case "removeRowByUid": return { ...op, rowUid: swap(op.rowUid) };
    case "removeColById": return { ...op, columnId: swap(op.columnId) };
    case "insertRowAt": return { ...op, afterRowUid: swap(op.afterRowUid), cells: op.cells.map((cell) => ({ ...cell, uid: swap(cell.uid) })), alignments: Object.fromEntries(Object.entries(op.alignments || {}).map(([uid, value]) => [swap(uid), value])) };
    case "insertColAt": return { ...op, afterColumnId: swap(op.afterColumnId), columnId: swap(op.columnId), cells: op.cells.map((cell) => ({ ...cell, uid: swap(cell.uid) })) };
    case "orderRows": return { ...op, rowUids: op.rowUids.map(swap) };
    case "orderCols": return { ...op, columnIds: op.columnIds.map(swap) };
    case "setHeaderRows": return { ...op, rowUids: op.rowUids.map(swap) };
    case "setHeaderCols": return { ...op, columnIds: op.columnIds.map(swap) };
    case "setImageLayout": return { ...op, imageLayout: {
      columns: Object.fromEntries(Object.entries(op.imageLayout?.columns || {}).map(([key, value]) => [swap(key), value])),
      cells: Object.fromEntries(Object.entries(op.imageLayout?.cells || {}).map(([key, value]) => [swap(key), value])),
    } };
    default: return op;
  }
}

function remapUndoSnapshot(snapshot, uidMap) {
  const swap = (value) => (value != null && uidMap.has(value) ? uidMap.get(value) : value);
  const swapKeys = (record) => Object.fromEntries(Object.entries(record || {}).map(([key, value]) => [swap(key), value]));
  return {
    ...snapshot, rows: snapshot.rows.map((row) => row.map((cell) => ({ ...cell, uid: swap(cell.uid) }))), columnIds: snapshot.columnIds.map(swap),
    rowHeights: swapKeys(snapshot.rowHeights), alignments: swapKeys(snapshot.alignments), widths: swapKeys(snapshot.widths),
    headerRows: (snapshot.headerRows || []).map(swap), headerColumns: (snapshot.headerColumns || []).map(swap),
    imageLayout: { columns: swapKeys(snapshot.imageLayout?.columns), cells: swapKeys(snapshot.imageLayout?.cells) },
  };
}

export function applyUndoOp(model, op) {
  switch (op.op) {
    case "setRaw": {
      const at = cellCoordinateForUid(model, op.uid);
      if (!at) return false;
      const cell = model.rows[at.row][at.col];
      if (cell.raw === op.raw) return false;
      cell.raw = op.raw;
      model.collectingChangedCells?.add(`${at.row}:${at.col}`);
      return true;
    }
    case "insertRowAt": {
      const index = op.afterRowUid ? rowIndexForUid(model, op.afterRowUid) + 1 : 0;
      if (op.afterRowUid && index === 0) return false;
      const cells = deepClone(op.cells);
      model.rows.splice(clamp(index, 0, model.rows.length), 0, cells);
      if (op.rowHeight != null && cells[0]) model.rowHeights[cells[0].uid] = op.rowHeight;
      for (const [uid, alignment] of Object.entries(op.alignments || {})) if (alignment) model.alignments[uid] = alignment;
      return true;
    }
    case "removeRowByUid": {
      const index = rowIndexForUid(model, op.rowUid);
      if (index < 0) return false;
      const [removed] = model.rows.splice(index, 1);
      delete model.rowHeights[op.rowUid];
      for (const cell of removed) delete model.alignments[cell.uid];
      return true;
    }
    case "insertColAt": {
      const index = op.afterColumnId ? model.columnIds.indexOf(op.afterColumnId) + 1 : 0;
      if (op.afterColumnId && index === 0) return false;
      const at = clamp(index, 0, model.columnIds.length);
      const cells = deepClone(op.cells);
      model.columnIds.splice(at, 0, op.columnId);
      for (let row = 0; row < model.rows.length; row += 1) model.rows[row].splice(at, 0, cells[row] || { uid: makeLocalUid(), raw: "" });
      if (op.width != null) model.widths[op.columnId] = op.width;
      return true;
    }
    case "removeColById": {
      const index = model.columnIds.indexOf(op.columnId);
      if (index < 0) return false;
      model.columnIds.splice(index, 1);
      for (const row of model.rows) { const [cell] = row.splice(index, 1); if (cell) delete model.alignments[cell.uid]; }
      delete model.widths[op.columnId];
      return true;
    }
    case "orderRows": {
      const byUid = new Map(model.rows.map((row) => [row[0]?.uid, row]));
      const next = op.rowUids.map((uid) => byUid.get(uid)).filter(Boolean);
      if (next.length !== model.rows.length) return false;
      model.rows = next;
      return true;
    }
    case "orderCols": {
      const positions = op.columnIds.map((id) => model.columnIds.indexOf(id));
      if (positions.length !== model.columnIds.length || positions.some((position) => position < 0)) return false;
      model.rows = model.rows.map((row) => positions.map((position) => row[position]));
      model.columnIds = [...op.columnIds];
      return true;
    }
    case "setRowHeight": {
      if (op.height == null) delete model.rowHeights[op.rowUid]; else model.rowHeights[op.rowUid] = op.height;
      return true;
    }
    case "setAlignment": {
      if (op.alignment == null) delete model.alignments[op.uid]; else model.alignments[op.uid] = op.alignment;
      return true;
    }
    case "setWidth": {
      if (op.width == null) delete model.widths[op.columnId]; else model.widths[op.columnId] = op.width;
      return true;
    }
    case "setMerges": model.merges = deepClone(op.merges); return true;
    case "setHeaderRows": model.headerRows = [...op.rowUids]; return true;
    case "setHeaderCols": model.headerColumns = [...op.columnIds]; return true;
    case "setCharts": model.charts = deepClone(op.charts); return true;
    case "setImageLayout": model.imageLayout = normalizeImageLayout(op.imageLayout); return true;
    case "setFlags": {
      for (const [key, value] of Object.entries(op.flags || {})) model[key] = value;
      return true;
    }
    default: throw new GridError("UNDO_OP", `Unknown grid undo operation ${op.op}`);
  }
}

export function restoreCheckpointKeepingStale(model, snapshot, stale = null) {
  const external = [...(stale || [])].map((uid) => {
    const at = cellCoordinateForUid(model, uid);
    return at ? { uid, raw: model.rows[at.row][at.col].raw } : null;
  }).filter(Boolean);
  model.restore(snapshot);
  const dropped = [];
  for (const { uid, raw } of external) {
    const at = cellCoordinateForUid(model, uid);
    if (!at) continue;
    const cell = model.rows[at.row][at.col];
    dropped.push(uid);
    if (cell.raw === raw) continue;
    cell.raw = raw;
    model.collectingChangedCells?.add(`${at.row}:${at.col}`);
  }
  return { dropped };
}

export function applyUndoOps(model, ops, entry = null) {
  const dropped = [];
  for (const op of ops) {
    if (op.op === "setRaw" && entry?.stale?.has(op.uid)) { dropped.push(op.uid); continue; }
    applyUndoOp(model, op);
  }
  return { dropped };
}

function undoFieldOps(before, model) {
  const inverse = []; const forward = [];
  const keyed = (name, keyName, valueName, previousMap, nextMap) => {
    for (const key of new Set([...Object.keys(previousMap || {}), ...Object.keys(nextMap || {})])) {
      const previous = previousMap?.[key] ?? null; const next = nextMap?.[key] ?? null;
      if (previous === next) continue;
      inverse.push({ op: name, [keyName]: key, [valueName]: previous });
      forward.push({ op: name, [keyName]: key, [valueName]: next });
    }
  };
  keyed("setRowHeight", "rowUid", "height", before.rowHeights, model.rowHeights);
  keyed("setAlignment", "uid", "alignment", before.alignments, model.alignments);
  keyed("setWidth", "columnId", "width", before.widths, model.widths);
  const listed = (name, keyName, previousList, nextList) => {
    if (JSON.stringify(previousList) === JSON.stringify(nextList)) return;
    inverse.push({ op: name, [keyName]: [...previousList] });
    forward.push({ op: name, [keyName]: [...nextList] });
  };
  listed("setHeaderRows", "rowUids", before.headerRows || [], model.headerRows);
  listed("setHeaderCols", "columnIds", before.headerColumns || [], model.headerColumns);
  if (JSON.stringify(before.merges) !== JSON.stringify(model.merges)) {
    inverse.push({ op: "setMerges", merges: deepClone(before.merges) });
    forward.push({ op: "setMerges", merges: deepClone(model.merges) });
  }
  if (JSON.stringify(before.charts) !== JSON.stringify(model.charts)) {
    inverse.push({ op: "setCharts", charts: deepClone(before.charts) });
    forward.push({ op: "setCharts", charts: deepClone(model.charts) });
  }
  if (JSON.stringify(before.imageLayout) !== JSON.stringify(model.imageLayout)) {
    inverse.push({ op: "setImageLayout", imageLayout: deepClone(before.imageLayout) });
    forward.push({ op: "setImageLayout", imageLayout: deepClone(model.imageLayout) });
  }
  const previousFlags = {}; const nextFlags = {};
  for (const key of ["frozenRows", "frozenCols", "showHeaders", "fitToWidth", "colorFormulaCells", "revision"]) {
    if (before[key] === model[key]) continue;
    previousFlags[key] = before[key]; nextFlags[key] = model[key];
  }
  if (Object.keys(previousFlags).length) { inverse.push({ op: "setFlags", flags: previousFlags }); forward.push({ op: "setFlags", flags: nextFlags }); }
  return { inverse, forward };
}

function buildUndoEntry(model, { label = "", before, beforeShape, afterShape, recorded = [], hard = false }) {
  const pairs = recorded.filter((pair) => pair.inverse.op !== pair.forward.op || JSON.stringify(pair.inverse) !== JSON.stringify(pair.forward));
  const completion = undoFieldOps(before, model);
  const inverse = pairs.map((pair) => pair.inverse).reverse().concat(completion.inverse);
  const forward = pairs.map((pair) => pair.forward).concat(completion.forward);
  const reshaped = beforeShape !== afterShape && !pairs.some((pair) => UNDO_SHAPE_OPS.has(pair.inverse.op) || UNDO_SHAPE_OPS.has(pair.forward.op));
  const checkpointed = hard || reshaped;
  if (!inverse.length && !checkpointed) return null;
  const structural = checkpointed || inverse.some((op) => op.op !== "setRaw");
  const touched = [...new Set([...inverse, ...forward].flatMap(undoOpWriteUids).filter(Boolean))];
  undoEntrySequence += 1;
  return {
    id: `ue${undoEntrySequence}`, label, at: Date.now(), lane: structural ? "structural" : "content", metadata: structural,
    inverse, forward, touched, shapeSignature: afterShape, checkpoint: checkpointed ? deepClone(before) : null,
    forwardCheckpoint: checkpointed ? model.snapshot() : null, trashUid: null, stale: new Set(),
  };
}

// An external content merge is not recorded by `transact`, so its entry is
// synthesized from the forward direction: the caller supplies `from`/`to` per
// uid and the inverse is derived.  Only changes the history cannot already
// rebase (see `rebasableUids`) become an entry; a uid an existing entry owns is
// handled by `onExternalContent` marking it stale instead.
export function externalContentUndoEntry(model, changes) {
  const applicable = (changes || []).filter((change) => change?.uid && change.from !== change.to);
  if (!applicable.length) return null;
  undoEntrySequence += 1;
  return {
    id: `ue${undoEntrySequence}`, label: "External edit", at: Date.now(), lane: "content", metadata: false,
    inverse: applicable.map((change) => ({ op: "setRaw", uid: change.uid, raw: change.from })),
    forward: applicable.map((change) => ({ op: "setRaw", uid: change.uid, raw: change.to })),
    touched: [...new Set(applicable.map((change) => change.uid))], shapeSignature: gridShapeSignature(model),
    checkpoint: null, forwardCheckpoint: null, trashUid: null, stale: new Set(),
  };
}

export class UndoHistory {
  constructor({ limit = MAX_UNDO_ENTRIES, checkpointLimit = MAX_UNDO_CHECKPOINTS } = {}) {
    this.entries = [];
    this.redoEntries = [];
    this.limit = limit;
    this.checkpointLimit = checkpointLimit;
    this.lastInvalidation = null;
  }

  get canUndo() { return this.entries.length > 0; }
  get canRedo() { return this.redoEntries.length > 0; }

  enforceLimits() {
    while (this.entries.length > this.limit) this.entries.shift();
    const checkpoints = this.entries.filter((entry) => entry.checkpoint);
    if (checkpoints.length <= this.checkpointLimit) return;
    const evicted = checkpoints[checkpoints.length - this.checkpointLimit - 1];
    this.entries.splice(0, this.entries.indexOf(evicted) + 1);
  }

  push(entry) {
    this.entries.push(entry);
    this.redoEntries.length = 0;
    this.enforceLimits();
    return entry;
  }

  pushUndo(entry) { this.entries.push(entry); this.enforceLimits(); return entry; }
  pushRedo(entry) { this.redoEntries.push(entry); return entry; }
  popUndo() { return this.entries.pop() || null; }
  popRedo() { return this.redoEntries.pop() || null; }
  clear() { this.entries.length = 0; this.redoEntries.length = 0; }

  invalidateRedo(reason = "") {
    const dropped = this.redoEntries.length;
    this.redoEntries.length = 0;
    this.lastInvalidation = dropped ? reason : this.lastInvalidation;
    return dropped;
  }

  applyInverse(model, entry) {
    if (entry.checkpoint) return restoreCheckpointKeepingStale(model, entry.checkpoint, entry.stale);
    return applyUndoOps(model, entry.inverse, entry);
  }

  applyForward(model, entry) {
    if (entry.forwardCheckpoint) return restoreCheckpointKeepingStale(model, entry.forwardCheckpoint, entry.stale);
    return applyUndoOps(model, entry.forward, entry);
  }

  remapUids(uidMap) {
    if (!uidMap?.size) return 0;
    let remapped = 0;
    for (const entry of [...this.entries, ...this.redoEntries]) {
      entry.inverse = entry.inverse.map((op) => remapUndoOp(op, uidMap));
      entry.forward = entry.forward.map((op) => remapUndoOp(op, uidMap));
      entry.touched = entry.touched.map((uid) => uidMap.get(uid) || uid);
      entry.stale = new Set([...entry.stale].map((uid) => uidMap.get(uid) || uid));
      entry.shapeSignature = entry.shapeSignature.split("\u0001").map((token) => uidMap.get(token) || token).join("\u0001");
      if (entry.checkpoint) entry.checkpoint = remapUndoSnapshot(entry.checkpoint, uidMap);
      if (entry.forwardCheckpoint) entry.forwardCheckpoint = remapUndoSnapshot(entry.forwardCheckpoint, uidMap);
      remapped += 1;
    }
    return remapped;
  }

  rebasableUids() {
    const uids = new Set();
    for (const entry of [...this.entries, ...this.redoEntries]) for (const op of entry.inverse) if (op.op === "setRaw") uids.add(op.uid);
    return uids;
  }

  onExternalContent(changes = []) {
    const uids = new Set((changes || []).map((change) => change?.uid).filter(Boolean));
    if (!uids.size) return { marked: 0, redoInvalidated: false };
    let marked = 0;
    for (const entry of [...this.entries, ...this.redoEntries]) {
      // A checkpoint restores EVERY cell, not only the ones an inverse setRaw names, so
      // every incoming uid must survive it — not just the uids the entry itself wrote.
      // Scoping by `touched` would be equally wrong: it is derived from the entry's own
      // write uids, so it excludes exactly the untouched cells a wholesale restore eats.
      // `forwardCheckpoint` is guarded too because `applyForward` shares this stale set.
      if (entry.checkpoint || entry.forwardCheckpoint) {
        for (const uid of uids) if (!entry.stale.has(uid)) { entry.stale.add(uid); marked += 1; }
        continue;
      }
      for (const op of entry.inverse) {
        if (op.op !== "setRaw" || !uids.has(op.uid) || entry.stale.has(op.uid)) continue;
        entry.stale.add(op.uid); marked += 1;
      }
    }
    const redoInvalidated = this.redoEntries.some((entry) => entry.touched.some((uid) => uids.has(uid)));
    if (redoInvalidated) this.invalidateRedo("external-content");
    return { marked, redoInvalidated };
  }

  onExternalStructural(model) {
    const signature = gridShapeSignature(model);
    let keep = 0;
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      if (this.entries[index].shapeSignature !== signature) break;
      keep += 1;
    }
    const dropped = this.entries.length - keep;
    if (dropped) this.entries.splice(0, dropped);
    const redoInvalidated = dropped > 0 || !this.redoEntries.every((entry) => entry.shapeSignature === signature);
    if (redoInvalidated) this.invalidateRedo("external-structural");
    return { signature, dropped, redoInvalidated };
  }
}

/**
 * `UndoHistory`'s semantics over `(rowId, columnId)` instead of a block uid: a large-grid cell is a
 * JSON row inside a chunk file and has no Roam block whose uid an entry could name. The stack, the
 * limits, the redo invalidation and the `stale` rule — an external value is never overwritten — are
 * inherited rather than reinvented, so there is one undo contract in this file and not two. Only the
 * addressing and the apply target differ, which is why `applyInverse`/`applyForward`/`remapUids`
 * (all `GridModel`-shaped) are never called on this subclass; `applyLargeUndoOps` replaces them.
 */
export class LargeGridHistory extends UndoHistory {
  /**
   * `cells` are the records `store.setCell` hands back. A cell whose value did not actually move is
   * dropped here rather than at the call site, so every edit path records the same way.
   */
  record({ label = "", cells = [] } = {}) {
    const changed = cells.filter((cell) => cell?.rowId && cell?.columnId && cell.previous !== cell.raw);
    if (!changed.length) return null;
    undoEntrySequence += 1;
    return this.push({
      id: `lge${undoEntrySequence}`, label, at: Date.now(), lane: "content", metadata: false,
      inverse: changed.map((cell) => ({ op: "setCell", rowId: cell.rowId, columnId: cell.columnId, raw: cell.previous })).reverse(),
      forward: changed.map((cell) => ({ op: "setCell", rowId: cell.rowId, columnId: cell.columnId, raw: cell.raw })),
      touched: [...new Set(changed.map((cell) => alignmentKey(cell.rowId, cell.columnId)))],
      shapeSignature: "", checkpoint: null, forwardCheckpoint: null, trashUid: null, stale: new Set(),
    });
  }

  /**
   * The large-grid twin of `onExternalContent`: a cell another writer moved is pinned into every
   * entry's `stale` set, so undoing across it keeps their value rather than silently restoring ours
   * over the top of it. Keys are `alignmentKey(rowId, columnId)`.
   */
  onExternalCells(keys = []) {
    const external = new Set((keys || []).filter(Boolean));
    if (!external.size) return { marked: 0, redoInvalidated: false };
    let marked = 0;
    for (const entry of [...this.entries, ...this.redoEntries]) for (const key of external) if (!entry.stale.has(key)) { entry.stale.add(key); marked += 1; }
    const redoInvalidated = this.redoEntries.some((entry) => entry.touched.some((key) => external.has(key)));
    if (redoInvalidated) this.invalidateRedo("external-large-content");
    return { marked, redoInvalidated };
  }
}

/**
 * Applies one direction of a large-grid entry through `store.setCell`, so an undo takes exactly the
 * path a keystroke takes: same bounds and merge checks, same chunk, same dirty marking. Rows are
 * resolved by stable id, so an entry recorded before a row moved still lands on the row the user
 * edited. A row or column that no longer exists, and a cell another writer owns, are dropped rather
 * than forced — the same "refuse rather than guess" direction the merge planner takes.
 */
export async function applyLargeUndoOps(store, ops, entry = null) {
  const applied = []; const dropped = [];
  for (const op of ops) {
    const key = alignmentKey(op.rowId, op.columnId);
    if (entry?.stale?.has(key)) { dropped.push(key); continue; }
    const row = store.rowIndexForRowId(op.rowId);
    const col = (store.manifest.columnIds || []).indexOf(op.columnId);
    if (row == null || col < 0) { dropped.push(key); continue; }
    applied.push(await store.setCell(row, col, op.raw));
  }
  return { applied, dropped };
}

export function undoHistoryFor(tableUid, histories = undoHistories, Factory = UndoHistory) {
  if (!tableUid) return null;
  const existing = histories.get(tableUid);
  if (existing) { histories.delete(tableUid); histories.set(tableUid, existing); return existing; }
  const history = new Factory();
  histories.set(tableUid, history);
  while (histories.size > MAX_UNDO_HISTORIES) histories.delete(histories.keys().next().value);
  return history;
}

/** Same registry and same LRU as a native table's — an anchor uid is one or the other, never both. */
export function largeGridHistoryFor(anchorUid, histories = undoHistories) { return undoHistoryFor(anchorUid, histories, LargeGridHistory); }

export function releaseUndoHistory(tableUid, histories = undoHistories) { return histories.delete(tableUid); }

export function clearUndoHistories(histories = undoHistories) { histories.clear(); }

export class GridModel {
  constructor({ rows = [[]], tableUid = null, columnIds = [], merges = [], widths = {}, rowHeights = {}, alignments = {}, headerColumns = [], headerRows = [], frozenRows = 1, frozenCols = 0, charts = [], imageLayout = null, showHeaders = true, fitToWidth = true, colorFormulaCells = true, revision = null, history = null } = {}) {
    const width = Math.max(1, columnIds.length, ...rows.map((row) => row.length));
    this.tableUid = tableUid;
    this.rows = normalizeCells(rows.length ? rows : [[]], width);
    this.columnIds = Array.from({ length: width }, (_, index) => columnIds[index] || makeLocalUid());
    this.merges = deepClone(merges);
    this.widths = { ...widths };
    this.rowHeights = { ...rowHeights };
    this.alignments = { ...alignments };
    this.headerColumns = [...new Set(headerColumns)].filter((id) => this.columnIds.includes(id));
    const availableRowKeys = new Set(this.rows.map((row) => row[0]?.uid).filter(Boolean));
    this.headerRows = [...new Set(headerRows)].filter((id) => availableRowKeys.has(id));
    this.frozenRows = clamp(Number(frozenRows) || 0, 0, this.rows.length);
    this.frozenCols = clamp(Number(frozenCols) || 0, 0, width);
    this.charts = deepClone(charts);
    this.imageLayout = normalizeImageLayout(imageLayout);
    this.showHeaders = showHeaders !== false;
    this.fitToWidth = fitToWidth !== false;
    this.colorFormulaCells = colorFormulaCells !== false;
    this.revision = revision;
    this.history = history instanceof UndoHistory ? history : new UndoHistory();
    this.lastChangedCells = [];
    this.lastChangedCellUids = [];
    this.collectingChangedCells = null;
    this.collectingInverse = null;
    this.validateMerges({ repair: true });
  }

  get undoStack() { return this.history.entries; }
  get redoStack() { return this.history.redoEntries; }

  #record(inverse, forward) { this.collectingInverse?.push({ inverse, forward }); }

  get rowCount() { return this.rows.length; }
  get colCount() { return this.columnIds.length; }
  inBounds(row, col) { return row >= 0 && row < this.rowCount && col >= 0 && col < this.colCount; }
  getCell(row, col) { return this.rows[row]?.[col] || null; }
  getRaw(row, col) { return this.getCell(row, col)?.raw ?? ""; }
  getValue(row, col, engine = null) { return (engine || new FormulaEngine(this, runtime.registries?.formulaFunctions || defaultFormulaFunctions())).evaluateCell(row, col); }
  rowKey(row) { return this.rows[row]?.[0]?.uid || null; }
  getRowHeight(row) {
    const value = Number(this.rowHeights[this.rowKey(row)]);
    return Number.isFinite(value) ? clamp(Math.round(value), getSetting("sizing-min-row-height"), getSetting("sizing-max-row-height")) : null;
  }
  setRowHeight(row, height) {
    const key = this.rowKey(row);
    if (!key) throw new GridError("OUT_OF_BOUNDS", `Row ${row + 1} is outside the grid`);
    if (height == null || height === "") delete this.rowHeights[key];
    else {
      const value = Number(height);
      if (!Number.isFinite(value)) throw new GridError("ROW_HEIGHT", "Row height must be a number");
      this.rowHeights[key] = clamp(Math.round(value), getSetting("sizing-min-row-height"), getSetting("sizing-max-row-height"));
    }
  }
  alignmentKey(row, col) {
    const merge = this.mergeAt(row, col);
    return this.getCell(merge?.row ?? row, merge?.col ?? col)?.uid || null;
  }
  getAlignment(row, col) {
    const value = this.alignments[this.alignmentKey(row, col)];
    return ["left", "center", "right"].includes(value) ? value : null;
  }
  setAlignment(row, col, alignment) {
    const key = this.alignmentKey(row, col);
    if (!key) throw new GridError("OUT_OF_BOUNDS", `Cell ${cellLabel(row, col)} is outside the grid`);
    if (alignment == null || alignment === "auto") delete this.alignments[key];
    else if (["left", "center", "right"].includes(alignment)) this.alignments[key] = alignment;
    else throw new GridError("ALIGNMENT", `Unsupported alignment: ${alignment}`);
  }
  isHeaderColumn(col) { return this.headerColumns.includes(this.columnIds[col]); }
  isHeaderRow(row) { return this.headerRows.includes(this.rowKey(row)); }
  toggleHeaderColumn(col) {
    const id = this.columnIds[col];
    if (!id) throw new GridError("OUT_OF_BOUNDS", `Column ${columnLabel(col)} is outside the grid`);
    this.headerColumns = this.headerColumns.includes(id) ? this.headerColumns.filter((value) => value !== id) : [...this.headerColumns, id];
  }
  toggleHeaderRow(row) {
    const id = this.rowKey(row);
    if (!id) throw new GridError("OUT_OF_BOUNDS", `Row ${row + 1} is outside the grid`);
    this.headerRows = this.headerRows.includes(id) ? this.headerRows.filter((value) => value !== id) : [...this.headerRows, id];
  }

  /**
   * Writes one per-table image layout entry, keyed by column id or cell uid. A null patch deletes
   * the entry (the cell or column falls back to the next layer); a partial patch merges field by
   * field, an explicitly undefined field clears that key, and a patch that leaves the entry empty
   * deletes it. Undo comes free: `undoFieldOps` diffs `imageLayout` whole-object like `charts`.
   */
  setImageLayoutEntry({ columnId = null, cellUid = null, patch = null } = {}) {
    const bucket = cellUid != null ? "cells" : "columns";
    const key = cellUid ?? columnId;
    if (!key || typeof key !== "string") throw new GridError("IMAGE_LAYOUT", "An image layout entry keys on a column id or a cell uid");
    this.imageLayout = normalizeImageLayout(this.imageLayout);
    if (patch == null) { delete this.imageLayout[bucket][key]; return; }
    const merged = normalizeImageLayout({ [bucket]: { [key]: { ...this.imageLayout[bucket][key], ...patch } } })[bucket][key];
    if (merged) this.imageLayout[bucket][key] = merged;
    else delete this.imageLayout[bucket][key];
  }

  snapshot() {
    return {
      rows: deepClone(this.rows), columnIds: [...this.columnIds], merges: deepClone(this.merges), widths: { ...this.widths }, rowHeights: { ...this.rowHeights }, alignments: { ...this.alignments }, headerColumns: [...this.headerColumns], headerRows: [...this.headerRows],
      frozenRows: this.frozenRows, frozenCols: this.frozenCols, charts: deepClone(this.charts), imageLayout: deepClone(this.imageLayout), showHeaders: this.showHeaders, fitToWidth: this.fitToWidth, colorFormulaCells: this.colorFormulaCells, revision: this.revision,
    };
  }

  restore(snapshot) {
    this.rows = deepClone(snapshot.rows);
    this.columnIds = [...snapshot.columnIds];
    this.merges = deepClone(snapshot.merges);
    this.widths = { ...snapshot.widths };
    this.rowHeights = { ...(snapshot.rowHeights || {}) };
    this.alignments = { ...(snapshot.alignments || {}) };
    this.headerColumns = [...(snapshot.headerColumns || [])];
    this.headerRows = [...(snapshot.headerRows || [])];
    this.frozenRows = snapshot.frozenRows;
    this.frozenCols = snapshot.frozenCols;
    this.charts = deepClone(snapshot.charts);
    this.imageLayout = normalizeImageLayout(snapshot.imageLayout);
    this.showHeaders = snapshot.showHeaders !== false;
    this.fitToWidth = snapshot.fitToWidth !== false;
    this.colorFormulaCells = snapshot.colorFormulaCells !== false;
    this.revision = snapshot.revision;
  }

  #run(mutation, { record = false, label = "", hard = false } = {}) {
    const before = this.snapshot();
    const beforeShape = gridShapeSignature(this);
    const previousCollector = this.collectingChangedCells;
    const previousInverse = this.collectingInverse;
    const changedCells = new Set();
    const recorded = record ? [] : null;
    this.collectingChangedCells = changedCells;
    this.collectingInverse = recorded;
    try {
      const result = mutation(this);
      this.validateMerges();
      this.lastChangedCells = [...changedCells].map((key) => key.split(":").map(Number));
      this.lastChangedCellUids = this.lastChangedCells.map(([row, col]) => this.getCell(row, col)?.uid).filter(Boolean);
      const afterShape = gridShapeSignature(this);
      if (!record) return { result, changedCoordinates: this.lastChangedCells, changedUids: this.lastChangedCellUids, structural: beforeShape !== afterShape };
      const entry = getSetting("editing-capture-undo") ? buildUndoEntry(this, { label, before, beforeShape, afterShape, recorded, hard }) : null;
      if (entry) this.history.push(entry);
      return result;
    } catch (error) {
      this.restore(before);
      this.lastChangedCells = [];
      this.lastChangedCellUids = [];
      throw error;
    } finally {
      this.collectingChangedCells = previousCollector;
      this.collectingInverse = previousInverse;
    }
  }

  transact(label, mutation, { hard = false } = {}) { return this.#run(mutation, { record: true, label, hard }); }

  transactSilently(mutation) { return this.#run(mutation, { record: false }); }

  undo() {
    const entry = this.history.popUndo();
    if (!entry) return false;
    this.transactSilently(() => this.history.applyInverse(this, entry));
    this.history.pushRedo(entry);
    return true;
  }

  redo() {
    const entry = this.history.popRedo();
    if (!entry) return false;
    this.transactSilently(() => this.history.applyForward(this, entry));
    this.history.pushUndo(entry);
    return true;
  }

  mergeAt(row, col) {
    return this.merges.find((merge) => rangeContains({ startRow: merge.row, endRow: merge.row + merge.rowSpan - 1, startCol: merge.col, endCol: merge.col + merge.colSpan - 1 }, row, col)) || null;
  }

  isCovered(row, col) {
    const merge = this.mergeAt(row, col);
    return Boolean(merge && (merge.row !== row || merge.col !== col));
  }

  setRaw(row, col, raw) {
    if (!this.inBounds(row, col)) throw new GridError("OUT_OF_BOUNDS", `Cell ${cellLabel(row, col)} is outside the grid`);
    if (this.isCovered(row, col)) throw new GridError("MERGE_COVERED", `Cell ${cellLabel(row, col)} is covered by a merge`);
    const value = String(raw ?? "");
    const cell = this.rows[row][col];
    if (cell.raw === value) return false;
    this.#record({ op: "setRaw", uid: cell.uid, raw: cell.raw }, { op: "setRaw", uid: cell.uid, raw: value });
    cell.raw = value;
    this.collectingChangedCells?.add(`${row}:${col}`);
    return true;
  }

  rewriteStructuralFormulas(change) {
    for (let row = 0; row < this.rowCount; row += 1) for (let col = 0; col < this.colCount; col += 1) {
      const cell = this.rows[row][col];
      if (cell.raw.startsWith("=") && !cell.raw.startsWith("==")) {
        const rewritten = rewriteFormulaForStructure(cell.raw, { ...change, formulaRow: row, formulaCol: col });
        if (rewritten !== cell.raw) {
          this.#record({ op: "setRaw", uid: cell.uid, raw: cell.raw }, { op: "setRaw", uid: cell.uid, raw: rewritten });
          cell.raw = rewritten;
          this.collectingChangedCells?.add(`${row}:${col}`);
        }
      }
    }
  }

  merge(range) {
    const value = normalizeRange(range);
    if (!this.inBounds(value.startRow, value.startCol) || !this.inBounds(value.endRow, value.endCol)) throw new GridError("OUT_OF_BOUNDS", "Merge range is outside the grid");
    if (value.startRow === value.endRow && value.startCol === value.endCol) throw new GridError("MERGE_SINGLE", "Select at least two cells to merge");
    const overlap = this.merges.find((merge) => rangesOverlap(value, { startRow: merge.row, endRow: merge.row + merge.rowSpan - 1, startCol: merge.col, endCol: merge.col + merge.colSpan - 1 }));
    if (overlap) throw new GridError("MERGE_OVERLAP", "The selection overlaps an existing merged region", { merge: overlap });
    const blocking = [];
    for (let row = value.startRow; row <= value.endRow; row += 1) {
      for (let col = value.startCol; col <= value.endCol; col += 1) {
        if (row === value.startRow && col === value.startCol) continue;
        if (this.getRaw(row, col) !== "") blocking.push(cellLabel(row, col));
      }
    }
    if (blocking.length) throw new GridError("MERGE_NONEMPTY", `Merge blocked by non-empty cells: ${blocking.join(", ")}`, { cells: blocking });
    for (let row = value.startRow; row <= value.endRow; row += 1) for (let col = value.startCol; col <= value.endCol; col += 1) {
      if (row !== value.startRow || col !== value.startCol) delete this.alignments[this.getCell(row, col).uid];
    }
    const merge = { id: makeLocalUid(), row: value.startRow, col: value.startCol, rowSpan: value.endRow - value.startRow + 1, colSpan: value.endCol - value.startCol + 1 };
    this.merges.push(merge);
    return merge;
  }

  unmerge(row, col) {
    const merge = this.mergeAt(row, col);
    if (!merge) return false;
    this.merges = this.merges.filter((item) => item.id !== merge.id);
    return true;
  }

  validateMerges({ repair = false } = {}) {
    const valid = [];
    const warnings = [];
    for (const merge of this.merges) {
      const normalized = { ...merge, row: Number(merge.row), col: Number(merge.col), rowSpan: Number(merge.rowSpan), colSpan: Number(merge.colSpan) };
      const endRow = normalized.row + normalized.rowSpan - 1;
      const endCol = normalized.col + normalized.colSpan - 1;
      let reason = null;
      if (![normalized.row, normalized.col, normalized.rowSpan, normalized.colSpan].every(Number.isInteger)) reason = "non-integer coordinates";
      else if (normalized.rowSpan < 1 || normalized.colSpan < 1 || (normalized.rowSpan === 1 && normalized.colSpan === 1)) reason = "meaningless span";
      else if (!this.inBounds(normalized.row, normalized.col) || !this.inBounds(endRow, endCol)) reason = "out of bounds";
      else if (valid.some((item) => rangesOverlap({ startRow: normalized.row, endRow, startCol: normalized.col, endCol }, { startRow: item.row, endRow: item.row + item.rowSpan - 1, startCol: item.col, endCol: item.col + item.colSpan - 1 }))) reason = "overlap";
      else {
        for (let row = normalized.row; row <= endRow && !reason; row += 1) {
          for (let col = normalized.col; col <= endCol; col += 1) {
            if (row === normalized.row && col === normalized.col) continue;
            if (this.getRaw(row, col) !== "") { reason = `covered cell ${cellLabel(row, col)} is non-empty`; break; }
          }
        }
      }
      if (reason) {
        warnings.push({ merge, reason });
        if (!repair) throw new GridError("INVALID_MERGE", `Invalid merge: ${reason}`, { merge });
      } else valid.push({ ...normalized, id: normalized.id || makeLocalUid() });
    }
    if (repair) this.merges = valid;
    return warnings;
  }

  insertRows(index, count = 1) {
    const at = clamp(index, 0, this.rowCount);
    const additions = Array.from({ length: count }, () => normalizeCells([[]], this.colCount)[0]);
    this.rewriteStructuralFormulas({ axis: "row", index: at, insertCount: count });
    for (let offset = 0; offset < count; offset += 1) {
      const afterRowUid = offset === 0 ? this.rows[at - 1]?.[0]?.uid || null : additions[offset - 1][0].uid;
      this.#record({ op: "removeRowByUid", rowUid: additions[offset][0].uid }, { op: "insertRowAt", afterRowUid, cells: deepClone(additions[offset]), rowHeight: null, alignments: {} });
    }
    this.rows.splice(at, 0, ...additions);
    for (const merge of this.merges) {
      if (at <= merge.row) merge.row += count;
      else if (at <= merge.row + merge.rowSpan - 1) merge.rowSpan += count;
    }
  }

  deleteRows(index, count = 1) {
    if (this.rowCount - count < 1) throw new GridError("DELETE_ALL", "A grid must keep at least one row");
    const start = clamp(index, 0, this.rowCount - 1);
    const end = Math.min(this.rowCount - 1, start + count - 1);
    const removedRows = this.rows.slice(start, end + 1);
    const removedRowKeys = removedRows.map((row) => row[0]?.uid).filter(Boolean);
    const removedCellKeys = removedRows.flat().map((cell) => cell.uid);
    for (let offset = removedRows.length - 1; offset >= 0; offset -= 1) {
      const cells = deepClone(removedRows[offset]);
      const rowUid = cells[0]?.uid || null;
      const afterRowUid = offset === 0 ? this.rows[start - 1]?.[0]?.uid || null : removedRows[offset - 1][0]?.uid || null;
      const alignments = Object.fromEntries(cells.map((cell) => [cell.uid, this.alignments[cell.uid] ?? null]).filter(([, value]) => value != null));
      this.#record({ op: "insertRowAt", afterRowUid, cells, rowHeight: this.rowHeights[rowUid] ?? null, alignments }, { op: "removeRowByUid", rowUid });
    }
    this.rows.splice(start, end - start + 1);
    this.rewriteStructuralFormulas({ axis: "row", index: start, deleteCount: end - start + 1 });
    for (const key of removedRowKeys) delete this.rowHeights[key];
    this.headerRows = this.headerRows.filter((key) => !removedRowKeys.includes(key));
    for (const key of removedCellKeys) delete this.alignments[key];
    const next = [];
    for (const merge of this.merges) {
      const mStart = merge.row;
      const mEnd = merge.row + merge.rowSpan - 1;
      const removedInside = Math.max(0, Math.min(mEnd, end) - Math.max(mStart, start) + 1);
      if (removedInside >= merge.rowSpan) continue;
      if (end < mStart) merge.row -= end - start + 1;
      else if (removedInside) {
        if (start <= mStart) merge.row = start;
        merge.rowSpan -= removedInside;
        if (merge.rowSpan === 1 && merge.colSpan === 1) continue;
      }
      next.push(merge);
    }
    this.merges = next;
    this.frozenRows = Math.min(this.frozenRows, this.rowCount);
  }

  insertCols(index, count = 1) {
    const at = clamp(index, 0, this.colCount);
    const ids = Array.from({ length: count }, makeLocalUid);
    this.rewriteStructuralFormulas({ axis: "col", index: at, insertCount: count });
    const additions = this.rows.map(() => Array.from({ length: count }, () => ({ uid: makeLocalUid(), raw: "" })));
    for (let offset = 0; offset < count; offset += 1) {
      const afterColumnId = offset === 0 ? this.columnIds[at - 1] || null : ids[offset - 1];
      this.#record({ op: "removeColById", columnId: ids[offset] }, { op: "insertColAt", afterColumnId, columnId: ids[offset], width: null, cells: additions.map((cells) => ({ ...cells[offset] })) });
    }
    this.columnIds.splice(at, 0, ...ids);
    for (let rowIndex = 0; rowIndex < this.rows.length; rowIndex += 1) this.rows[rowIndex].splice(at, 0, ...additions[rowIndex]);
    for (const merge of this.merges) {
      if (at <= merge.col) merge.col += count;
      else if (at <= merge.col + merge.colSpan - 1) merge.colSpan += count;
    }
  }

  deleteCols(index, count = 1) {
    if (this.colCount - count < 1) throw new GridError("DELETE_ALL", "A grid must keep at least one column");
    const start = clamp(index, 0, this.colCount - 1);
    const end = Math.min(this.colCount - 1, start + count - 1);
    const removed = end - start + 1;
    for (const merge of this.merges) {
      const mStart = merge.col;
      const mEnd = merge.col + merge.colSpan - 1;
      if (start <= mStart && end >= mStart && end < mEnd) {
        const survivingCol = end + 1;
        const anchorRaw = this.getRaw(merge.row, mStart);
        const surviving = this.rows[merge.row][survivingCol];
        this.#record({ op: "setRaw", uid: surviving.uid, raw: surviving.raw }, { op: "setRaw", uid: surviving.uid, raw: anchorRaw });
        surviving.raw = anchorRaw;
      }
    }
    for (let offset = end - start; offset >= 0; offset -= 1) {
      const columnIndex = start + offset;
      const columnId = this.columnIds[columnIndex];
      const afterColumnId = offset === 0 ? this.columnIds[start - 1] || null : this.columnIds[columnIndex - 1];
      const cells = this.rows.map((row) => ({ ...row[columnIndex] }));
      this.#record({ op: "insertColAt", afterColumnId, columnId, width: this.widths[columnId] ?? null, cells }, { op: "removeColById", columnId });
    }
    const removedCellKeys = this.rows.flatMap((row) => row.slice(start, end + 1).map((cell) => cell.uid));
    const removedIds = this.columnIds.splice(start, removed);
    for (const id of removedIds) delete this.widths[id];
    this.headerColumns = this.headerColumns.filter((id) => !removedIds.includes(id));
    for (const key of removedCellKeys) delete this.alignments[key];
    for (const row of this.rows) row.splice(start, removed);
    this.rewriteStructuralFormulas({ axis: "col", index: start, deleteCount: removed });
    const next = [];
    for (const merge of this.merges) {
      const oldStart = merge.col;
      const oldEnd = merge.col + merge.colSpan - 1;
      const removedInside = Math.max(0, Math.min(oldEnd, end) - Math.max(oldStart, start) + 1);
      if (removedInside >= merge.colSpan) continue;
      if (end < oldStart) merge.col -= removed;
      else if (removedInside) {
        if (start <= oldStart) merge.col = start;
        merge.colSpan -= removedInside;
        if (merge.rowSpan === 1 && merge.colSpan === 1) continue;
      }
      next.push(merge);
    }
    this.merges = next;
    this.frozenCols = Math.min(this.frozenCols, this.colCount);
  }

  moveRange(range, targetRow, targetCol) {
    const source = normalizeRange(range);
    const height = source.endRow - source.startRow + 1;
    const width = source.endCol - source.startCol + 1;
    const destination = { startRow: targetRow, endRow: targetRow + height - 1, startCol: targetCol, endCol: targetCol + width - 1 };
    if (!this.inBounds(destination.startRow, destination.startCol) || !this.inBounds(destination.endRow, destination.endCol)) throw new GridError("OUT_OF_BOUNDS", "Move destination is outside the grid");
    for (const merge of this.merges) {
      const mergeRange = { startRow: merge.row, endRow: merge.row + merge.rowSpan - 1, startCol: merge.col, endCol: merge.col + merge.colSpan - 1 };
      if (rangesOverlap(source, mergeRange) && !(source.startRow <= mergeRange.startRow && source.endRow >= mergeRange.endRow && source.startCol <= mergeRange.startCol && source.endCol >= mergeRange.endCol)) throw new GridError("PARTIAL_MERGE_MOVE", "Move the entire merged region, not part of it");
    }
    const sourceCells = [];
    const sourceAlignments = [];
    for (let row = source.startRow; row <= source.endRow; row += 1) {
      sourceCells.push(this.rows[row].slice(source.startCol, source.endCol + 1).map((cell) => ({ ...cell })));
      sourceAlignments.push(Array.from({ length: width }, (_, col) => this.alignments[this.rows[row][source.startCol + col].uid] || null));
    }
    for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
      const sourceCell = this.rows[source.startRow + row][source.startCol + col];
      this.#record({ op: "setRaw", uid: sourceCell.uid, raw: sourceCell.raw }, { op: "setRaw", uid: sourceCell.uid, raw: "" });
    }
    for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
      const destinationCell = this.rows[targetRow + row][targetCol + col];
      this.#record({ op: "setRaw", uid: destinationCell.uid, raw: destinationCell.raw }, { op: "setRaw", uid: destinationCell.uid, raw: rewriteFormula(sourceCells[row][col].raw, targetRow - source.startRow, targetCol - source.startCol) });
    }
    const sourceMerges = this.merges.filter((merge) => rangeContains(source, merge.row, merge.col));
    this.merges = this.merges.filter((merge) => !sourceMerges.includes(merge) && !rangesOverlap(destination, { startRow: merge.row, endRow: merge.row + merge.rowSpan - 1, startCol: merge.col, endCol: merge.col + merge.colSpan - 1 }));
    for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
      const sourceCell = this.rows[source.startRow + row][source.startCol + col]; delete this.alignments[sourceCell.uid]; sourceCell.raw = "";
    }
    for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
      const destinationCell = this.rows[targetRow + row][targetCol + col];
      this.rows[targetRow + row][targetCol + col] = { uid: destinationCell.uid, raw: rewriteFormula(sourceCells[row][col].raw, targetRow - source.startRow, targetCol - source.startCol) };
      delete this.alignments[destinationCell.uid];
      if (sourceAlignments[row][col]) this.alignments[destinationCell.uid] = sourceAlignments[row][col];
    }
    for (const merge of sourceMerges) this.merges.push({ ...merge, row: merge.row + targetRow - source.startRow, col: merge.col + targetCol - source.startCol });
  }

  reorderRows(from, to) {
    if (from === to) return;
    if (this.merges.some((merge) => merge.rowSpan > 1)) throw new GridError("VERTICAL_MERGE_REORDER", "Unmerge multi-row regions before reordering rows");
    const previousOrder = this.rows.map((item) => item[0]?.uid || null);
    const nextOrder = [...previousOrder]; nextOrder.splice(to, 0, nextOrder.splice(from, 1)[0]);
    this.#record({ op: "orderRows", rowUids: previousOrder }, { op: "orderRows", rowUids: nextOrder });
    const row = this.rows.splice(from, 1)[0];
    this.rows.splice(to, 0, row);
    const map = Array.from({ length: this.rowCount }, (_, index) => index);
    const moved = map.splice(from, 1)[0];
    map.splice(to, 0, moved);
    const inverse = new Map(map.map((oldIndex, newIndex) => [oldIndex, newIndex]));
    for (const merge of this.merges) merge.row = inverse.get(merge.row);
  }

  reorderCols(from, to) {
    if (from === to) return;
    if (this.merges.some((merge) => merge.colSpan > 1 && (from >= merge.col && from < merge.col + merge.colSpan || to >= merge.col && to < merge.col + merge.colSpan))) throw new GridError("MERGED_COLUMN_REORDER", "Move the complete merged region instead of one of its columns");
    const previousOrder = [...this.columnIds];
    const nextOrder = [...previousOrder]; nextOrder.splice(to, 0, nextOrder.splice(from, 1)[0]);
    this.#record({ op: "orderCols", columnIds: previousOrder }, { op: "orderCols", columnIds: nextOrder });
    const id = this.columnIds.splice(from, 1)[0];
    this.columnIds.splice(to, 0, id);
    for (const row of this.rows) {
      const cell = row.splice(from, 1)[0];
      row.splice(to, 0, cell);
    }
    for (const merge of this.merges) {
      if (merge.col === from) merge.col = to;
      else if (from < merge.col && to >= merge.col) merge.col -= 1;
      else if (from > merge.col && to <= merge.col) merge.col += 1;
    }
  }

  sortBy(col, direction = "asc", headerRows = this.frozenRows) {
    if (this.merges.some((merge) => merge.rowSpan > 1 && merge.row + merge.rowSpan > headerRows)) throw new GridError("VERTICAL_MERGE_SORT", "Sorting would split a multi-row merged region");
    const data = this.rows.slice(headerRows).map((row, index) => ({ row, index, value: row[col]?.raw ?? "" }));
    data.sort((a, b) => {
      const an = Number(a.value);
      const bn = Number(b.value);
      const comparison = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(a.value).localeCompare(String(b.value), undefined, { numeric: true, sensitivity: "base" });
      return (direction === "desc" ? -comparison : comparison) || a.index - b.index;
    });
    const oldToNew = new Map(data.map((entry, index) => [entry.index + headerRows, index + headerRows]));
    const previousOrder = this.rows.map((row) => row[0]?.uid || null);
    this.rows = [...this.rows.slice(0, headerRows), ...data.map((entry) => entry.row)];
    this.#record({ op: "orderRows", rowUids: previousOrder }, { op: "orderRows", rowUids: this.rows.map((row) => row[0]?.uid || null) });
    for (const merge of this.merges) if (merge.row >= headerRows) merge.row = oldToNew.get(merge.row);
  }

  toJSON() {
    return { schema: "roam-grid", version: 1, tableUid: this.tableUid, rows: this.rows, columnIds: this.columnIds, merges: this.merges, widths: this.widths, rowHeights: this.rowHeights, alignments: this.alignments, headerColumns: this.headerColumns, headerRows: this.headerRows, frozenRows: this.frozenRows, frozenCols: this.frozenCols, charts: this.charts, imageLayout: this.imageLayout, showHeaders: this.showHeaders, fitToWidth: this.fitToWidth, colorFormulaCells: this.colorFormulaCells, revision: this.revision };
  }

  static fromJSON(value) {
    if (!value || value.schema !== "roam-grid" || value.version !== 1) throw new GridError("UNSUPPORTED_SCHEMA", "Unsupported Roam Grid document");
    return new GridModel(value);
  }
}

export function rewriteFormula(raw, rowDelta, colDelta) {
  if (typeof raw !== "string" || !raw.startsWith("=") || raw.startsWith("==")) return raw;
  return raw.replace(/\$?[A-Z]+\$?\d+/gi, (reference) => {
    const parsed = parseCellReference(reference);
    if (!parsed) return reference;
    const row = parsed.absoluteRow ? parsed.row : parsed.row + rowDelta;
    const col = parsed.absoluteCol ? parsed.col : parsed.col + colDelta;
    if (row < 0 || col < 0) return "#REF!";
    return `${parsed.absoluteCol ? "$" : ""}${columnLabel(col)}${parsed.absoluteRow ? "$" : ""}${row + 1}`;
  });
}

function quoteDelimited(value, delimiter) {
  const text = String(value ?? "");
  return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function parseDelimited(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"' && value === "") quoted = true;
    else if (char === delimiter) { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value !== "" || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function detectDelimiter(text) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const candidates = ["\t", ",", ";", "|"];
  return candidates.map((delimiter) => ({ delimiter, count: first.split(delimiter).length - 1 })).sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
}

export function importGrid(text, format = "auto") {
  const normalized = format.toLowerCase();
  if (normalized === "json" || (normalized === "auto" && text.trim().startsWith("{"))) return GridModel.fromJSON(JSON.parse(text));
  if (normalized === "markdown" || normalized === "md") {
    const rows = text.split(/\r?\n/).filter((line) => /^\s*\|/.test(line)).map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim().replaceAll("\\|", "|")));
    if (rows[1]?.every((cell) => /^:?-+:?$/.test(cell))) rows.splice(1, 1);
    return new GridModel({ rows });
  }
  if (normalized === "org") {
    const rows = text.split(/\r?\n/).filter((line) => /^\s*\|/.test(line) && !/^\s*\|[-+]+\|/.test(line)).map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
    return new GridModel({ rows });
  }
  if (normalized === "rst") {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() && !/^\s*[=+\-]+(?:\s+[=+\-]+)*\s*$/.test(line));
    return new GridModel({ rows: lines.map((line) => line.trim().split(/\s{2,}/)) });
  }
  if (["grid-table", "sexpr", "v1", "v2"].includes(normalized)) return importGridTableSexpr(text);
  const delimiter = normalized === "tsv" ? "\t" : normalized === "csv" ? "," : detectDelimiter(text);
  return new GridModel({ rows: parseDelimited(text, delimiter) });
}

export function exportGrid(model, format = "csv") {
  const rawRows = model.rows.map((row) => row.map((cell) => cell.raw));
  switch (format.toLowerCase()) {
    case "json": return JSON.stringify(model.toJSON(), null, 2);
    case "tsv": return rawRows.map((row) => row.map((value) => quoteDelimited(value, "\t")).join("\t")).join("\n");
    case "markdown": case "md": {
      const lines = rawRows.map((row) => `| ${row.map((value) => String(value).replaceAll("|", "\\|")).join(" | ")} |`);
      lines.splice(1, 0, `| ${Array.from({ length: model.colCount }, () => "---").join(" | ")} |`);
      return lines.join("\n");
    }
    case "org": return rawRows.map((row) => `| ${row.join(" | ")} |`).join("\n");
    case "rst": {
      const widths = Array.from({ length: model.colCount }, (_, col) => Math.max(3, ...rawRows.map((row) => String(row[col] ?? "").length)));
      const border = widths.map((width) => "=".repeat(width)).join("  ");
      return [border, ...rawRows.flatMap((row, index) => [row.map((value, col) => String(value).padEnd(widths[col])).join("  "), ...(index === 0 ? [border] : [])]), border].join("\n");
    }
    case "csv": default: return rawRows.map((row) => row.map((value) => quoteDelimited(value, ",")).join(",")).join("\n");
  }
}

function tokenizeSexpr(text) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    if (/\s/.test(text[index])) { index += 1; continue; }
    if (text[index] === ";") { while (index < text.length && text[index] !== "\n") index += 1; continue; }
    if (["(", ")", "[", "]"].includes(text[index])) { tokens.push(text[index++]); continue; }
    if (text[index] === '"') {
      let value = ""; index += 1;
      while (index < text.length && text[index] !== '"') {
        if (text[index] === "\\") { index += 1; const escaped = text[index++]; value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped; }
        else value += text[index++];
      }
      if (text[index] !== '"') throw new GridError("IMPORT", "Unterminated string in grid-table file");
      index += 1; tokens.push({ string: value }); continue;
    }
    let atom = "";
    while (index < text.length && !/\s/.test(text[index]) && !["(", ")", "[", "]"].includes(text[index])) atom += text[index++];
    tokens.push(atom);
  }
  return tokens;
}

function parseSexpr(tokens) {
  let index = 0;
  function parse() {
    const token = tokens[index++];
    if (token === "(" || token === "[") {
      const close = token === "(" ? ")" : "]";
      const result = [];
      while (tokens[index] !== close) {
        if (index >= tokens.length) throw new GridError("IMPORT", "Unbalanced grid-table file");
        result.push(parse());
      }
      index += 1;
      return result;
    }
    if (token === ")" || token === "]") throw new GridError("IMPORT", "Unexpected closing delimiter");
    if (typeof token === "object") return token.string;
    if (/^-?\d+(?:\.\d+)?$/.test(token)) return Number(token);
    if (token === "nil") return null;
    if (token === "t") return true;
    return token;
  }
  const value = parse();
  if (index !== tokens.length) throw new GridError("IMPORT", "Unexpected trailing grid-table data");
  return value;
}

function plistToObject(list) {
  const object = {};
  for (let index = 0; index < list.length - 1; index += 2) if (typeof list[index] === "string" && list[index].startsWith(":")) object[list[index].slice(1)] = list[index + 1];
  return object;
}

export function importGridTableSexpr(text) {
  const parsed = parseSexpr(tokenizeSexpr(text));
  const tagged = Array.isArray(parsed) && parsed[0] === "grid-table-file" ? plistToObject(parsed.slice(1)) : plistToObject(parsed);
  const version = Number(tagged.version || 1);
  if (![1, 2].includes(version)) throw new GridError("UNSUPPORTED_SCHEMA", `Unsupported grid-table version ${version}`);
  const headers = Array.isArray(tagged.headers) ? tagged.headers : [];
  const data = Array.isArray(tagged.rows) ? tagged.rows : Array.isArray(tagged.data) ? tagged.data : [];
  const rows = headers.length ? [headers, ...data] : data;
  if (!rows.length || !rows.every(Array.isArray)) throw new GridError("IMPORT", "grid-table file has no valid rows");
  const merges = [];
  if (version === 2 && Array.isArray(tagged.merges)) {
    for (const item of tagged.merges) {
      const triple = Array.isArray(item) ? item.map(Number) : [];
      if (triple.length === 3) merges.push({ id: makeLocalUid(), row: triple[0], col: triple[1], rowSpan: 1, colSpan: triple[2] - triple[1] + 1 });
      else if (triple.length === 4) merges.push({ id: makeLocalUid(), row: triple[0], col: triple[1], rowSpan: triple[2], colSpan: triple[3] });
    }
  }
  const model = new GridModel({ rows, merges });
  return model;
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function seriesFromRange(model, range) {
  const value = normalizeRange(range);
  const series = [];
  for (let row = value.startRow; row <= value.endRow; row += 1) {
    const points = [];
    for (let col = value.startCol; col <= value.endCol; col += 1) points.push(numeric(model.getValue(row, col)));
    series.push(points);
  }
  return series;
}

export function renderChartSvg(model, spec, width = 640, height = 240) {
  const type = String(spec.type || "line").toLowerCase();
  const source = seriesFromRange(model, spec.range || { startRow: 0, endRow: model.rowCount - 1, startCol: 0, endCol: model.colCount - 1 });
  let series = source;
  if (["histogram", "density", "count", "boxplot"].includes(type)) {
    const values = flatten(source).map(numeric).sort((a, b) => a - b);
    if (type === "count") {
      const counts = new Map(); for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
      series = [[...counts.values()]];
    } else if (type === "boxplot") {
      const quantile = (p) => values[Math.round((values.length - 1) * p)] || 0;
      series = [[values[0] || 0, quantile(0.25), quantile(0.5), quantile(0.75), values.at(-1) || 0]];
    } else {
      const bins = Math.max(5, Math.ceil(Math.sqrt(values.length || 1)));
      const min = values[0] || 0; const max = values.at(-1) || 1; const step = (max - min || 1) / bins;
      const counts = Array.from({ length: bins }, () => 0);
      for (const value of values) counts[Math.min(bins - 1, Math.floor((value - min) / step))] += 1;
      series = [type === "density" ? counts.map((count) => count / Math.max(1, values.length)) : counts];
    }
  }
  const all = flatten(series).map(numeric);
  const min = Math.min(0, ...all); const max = Math.max(1, ...all); const span = max - min || 1;
  const pad = 24; const plotWidth = width - pad * 2; const plotHeight = height - pad * 2;
  const y = (value) => pad + plotHeight - ((numeric(value) - min) / span) * plotHeight;
  const palette = ["#5b8def", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6"];
  const body = [];
  body.push(`<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="rg-chart-axis"/>`);
  if (["bar", "column", "histogram", "count"].includes(type)) {
    const values = series[0] || [];
    const barWidth = plotWidth / Math.max(1, values.length);
    values.forEach((value, index) => {
      const top = y(value); const baseline = y(0);
      body.push(`<rect x="${pad + index * barWidth + 2}" y="${Math.min(top, baseline)}" width="${Math.max(1, barWidth - 4)}" height="${Math.abs(baseline - top)}" rx="2" fill="${palette[index % palette.length]}"/>`);
    });
  } else if (type === "boxplot") {
    const [low, q1, median, q3, high] = series[0]; const cx = width / 2;
    body.push(`<line x1="${cx}" y1="${y(low)}" x2="${cx}" y2="${y(high)}" stroke="${palette[0]}"/>`);
    body.push(`<rect x="${cx - 45}" y="${y(q3)}" width="90" height="${Math.max(1, y(q1) - y(q3))}" fill="${palette[0]}33" stroke="${palette[0]}"/>`);
    body.push(`<line x1="${cx - 45}" y1="${y(median)}" x2="${cx + 45}" y2="${y(median)}" stroke="${palette[0]}" stroke-width="2"/>`);
  } else {
    series.forEach((values, seriesIndex) => {
      const points = values.map((value, index) => `${pad + index * (plotWidth / Math.max(1, values.length - 1))},${y(value)}`).join(" ");
      if (type === "scatter") values.forEach((value, index) => body.push(`<circle cx="${pad + index * (plotWidth / Math.max(1, values.length - 1))}" cy="${y(value)}" r="3" fill="${palette[seriesIndex % palette.length]}"/>`));
      else body.push(`<polyline points="${points}" fill="none" stroke="${palette[seriesIndex % palette.length]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
    });
  }
  return `<svg class="rg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(spec.title || `${type} chart`)}"><title>${escapeHtml(spec.title || `${type} chart`)}</title>${body.join("")}</svg>`;
}

export class RegistrySet {
  constructor() {
    const formulaDefinitions = defaultFormulaFunctionDefinitions();
    this.formulaFunctions = defaultFormulaFunctions(formulaDefinitions);
    this.formulaFunctionMetadata = defaultFormulaFunctionMetadata(formulaDefinitions);
    this.cellRenderers = new Map();
    this.cellEditors = new Map();
    this.importers = new Map();
    this.exporters = new Map();
    this.dataSources = new Map();
    this.templates = new Map();
    // Registry keys are uppercased, but a template's display label must keep the author's casing —
    // `templateNames()` dedupes case-insensitively with this map winning the label.
    this.templateDisplayNames = new Map();
  }

  register(map, key, value) {
    const normalized = String(key).toUpperCase();
    if (map.has(normalized)) throw new GridError("REGISTRY_DUPLICATE", `${key} is already registered`);
    map.set(normalized, value);
    return () => map.delete(normalized);
  }

  registerTemplate(name, template) {
    const normalized = String(name).toUpperCase();
    this.templateDisplayNames.set(normalized, String(name));
    return this.register(this.templates, name, template);
  }

  registerFormulaFunction(name, fn, options = {}) {
    if (typeof fn !== "function") throw new GridError("REGISTRY_VALUE", `${name} must be a function`);
    const normalized = String(name).toUpperCase();
    if (this.formulaFunctions.has(normalized)) throw new GridError("REGISTRY_DUPLICATE", `${name} is already registered`);
    const metadata = {
      parameters: Array.isArray(options?.parameters) ? options.parameters.map(String) : [],
      description: String(options?.description || ""),
      volatile: options?.volatile !== false,
    };
    this.formulaFunctions.set(normalized, fn);
    this.formulaFunctionMetadata.set(normalized, metadata);
    let disposed = false;
    return () => {
      if (disposed) return false;
      disposed = true;
      const removed = this.formulaFunctions.delete(normalized);
      this.formulaFunctionMetadata.delete(normalized);
      return removed;
    };
  }
}

function roam() {
  const api = globalThis.window?.roamAlphaAPI;
  if (!api) throw new GridError("ROAM_UNAVAILABLE", "Roam Alpha API is not available");
  return api;
}

function valueOf(block, key) {
  return block?.[key] ?? block?.[`:${key.replaceAll(".", "/")}`] ?? block?.[key.replace("block.", "")];
}

function normalizeTree(block) {
  if (!block) return null;
  const children = block.children ?? block[":block/children"] ?? [];
  return {
    uid: block.uid ?? block[":block/uid"],
    string: block.string ?? block[":block/string"] ?? "",
    order: block.order ?? block[":block/order"] ?? 0,
    editTime: block.editTime ?? block[":edit/time"] ?? null,
    children: ordered(children.map(normalizeTree)),
  };
}

export function getTree(uid) {
  const result = roam().q(`[:find (pull ?block [:block/uid :block/string :block/order :edit/time {:block/children ...}])
    :in $ ?uid
    :where [?block :block/uid ?uid]]`, String(uid));
  return normalizeTree(result?.[0]?.[0]);
}

export function getPageUid(title) {
  const result = roam().data?.pull?.("[:block/uid]", [":node/title", title]) || roam().pull?.("[:block/uid]", [":node/title", title]);
  return result?.[":block/uid"] || result?.uid || null;
}

async function createPage(title) {
  const uid = roam().util.generateUID();
  await (roam().data?.page?.create || roam().createPage).call(roam().data?.page || roam(), { page: { title, uid } });
  return uid;
}

async function createBlock(parentUid, string, order = "last", uid = null, open = null) {
  const blockUid = uid || roam().util.generateUID();
  const create = roam().data?.block?.create || roam().createBlock;
  const block = { uid: blockUid, string: String(string ?? "") };
  if (typeof open === "boolean") block.open = open;
  await create.call(roam().data?.block || roam(), { location: { "parent-uid": parentUid, order }, block });
  return blockUid;
}

async function updateBlock(uid, string, { open = null } = {}) {
  const update = roam().data?.block?.update || roam().updateBlock;
  const block = { uid, string: String(string ?? "") };
  if (typeof open === "boolean") block.open = open;
  return update.call(roam().data?.block || roam(), { block });
}

async function moveBlock(uid, parentUid, order = "last") {
  const move = roam().data?.block?.move || roam().moveBlock;
  return move.call(roam().data?.block || roam(), { location: { "parent-uid": parentUid, order }, block: { uid } });
}

async function deleteBlock(uid) {
  const remove = roam().data?.block?.delete || roam().deleteBlock;
  return remove.call(roam().data?.block || roam(), { block: { uid } });
}

export async function acquireLargeScratch() {
  if (runtime.largeScratch) return runtime.largeScratch;
  try {
    const pageUid = getPageUid(METADATA_PAGE) || await createPage(METADATA_PAGE);
    const tree = getTree(pageUid);
    const marker = (tree?.children || []).find((child) => child.string === "rg:scratch");
    let parentUid;
    if (marker) {
      parentUid = marker.uid;
      for (const child of marker.children || []) {
        await deleteBlock(child.uid).catch(() => {});
      }
    } else {
      parentUid = await createBlock(pageUid, "rg:scratch");
    }
    const childUid = roam().util.generateUID();
    await createBlock(parentUid, " ", "last", childUid);
    runtime.largeScratch = { parentUid, uid: childUid };
    return runtime.largeScratch;
  } catch (error) {
    if (globalThis.window) globalThis.window.__RG_U15_LAST_ERROR = String(error.stack || error);
    return null;
  }
}

export async function releaseLargeScratch() {
  const scratch = runtime.largeScratch;
  if (!scratch) return;
  runtime.largeScratch = null;
  try {
    await deleteBlock(scratch.uid).catch(() => {});
  } catch (error) {
    if (globalThis.window) globalThis.window.__RG_U15_LAST_ERROR = String(error.stack || error);
  }
}

export async function blankLargeScratch() {
  const scratch = runtime.largeScratch;
  if (!scratch) return;
  try {
    const tree = getTree(scratch.uid);
    const children = tree?.children || [];
    for (const child of children) {
      await deleteBlock(child.uid).catch(() => {});
    }
    await updateBlock(scratch.uid, " ").catch(() => {});
  } catch (error) {
    if (globalThis.window) globalThis.window.__RG_U15_LAST_ERROR = String(error.stack || error);
  }
}

export function scratchStrayConcat() {
  const scratch = runtime.largeScratch;
  if (!scratch) return null;
  const tree = getTree(scratch.uid);
  const strays = (tree?.children || []).filter((child) => !(child.children || []).length);
  if (!strays.length) return null;
  return strays.map((child) => nativeStoredRaw(child.string)).join("\n");
}

function treeFingerprint(tree) {
  const visit = (node) => [node.uid, node.string, node.children.map(visit)];
  return JSON.stringify(visit(tree));
}

// Unlike the native table signature, this intentionally includes every branch
// and numeric order.  Pull watches can arrive after a structural transaction
// settles, so this lets us recognize only the exact committed graph state we
// wrote, without deriving that expectation from a subsequently-mutated model.
function structuralEchoFingerprint(tree) {
  const visit = (node) => [
    String(node.uid ?? ""),
    String(node.string ?? ""),
    Number.isFinite(Number(node.order)) ? Number(node.order) : 0,
    (node.children || []).map(visit),
  ];
  const normalized = normalizeTree(tree);
  return normalized ? JSON.stringify(visit(normalized)) : null;
}

function tableCells(tree) {
  const rows = [];
  for (const rowNode of ordered(tree?.children || [])) {
    const cells = [];
    let current = rowNode;
    while (current) {
      cells.push(current);
      current = ordered(current.children || [])[0] || null;
    }
    rows.push(cells);
  }
  return rows;
}

function nativeStoredRaw(value) { return String(value ?? "") === " " ? "" : String(value ?? ""); }
function nativePersistedRaw(value) { return String(value ?? "") === "" ? " " : String(value ?? ""); }

function nativeCellIndex(tree) {
  const index = new Map();
  for (const [row, cells] of tableCells(tree).entries()) for (const [col, cell] of cells.entries()) {
    index.set(cell.uid, {
      uid: cell.uid, raw: nativeStoredRaw(cell.string), row, col,
      parentUid: col === 0 ? tree.uid : cells[col - 1].uid,
      order: col === 0 ? row : 0,
    });
  }
  return index;
}

function nativeStructureSignature(tree) {
  return JSON.stringify(tableCells(tree).map((row) => row.map((cell) => cell.uid)));
}

function nativeTreeMatchesModel(tree, model) {
  const rows = tableCells(tree);
  return rows.length === model.rowCount && rows.every((row, rowIndex) => row.length === model.colCount && row.every((cell, col) => {
    const desired = model.getCell(rowIndex, col);
    return desired?.uid === cell.uid && desired.raw === nativeStoredRaw(cell.string);
  }));
}

function sequenceIsSubsequence(values, expected) {
  let index = 0;
  for (const value of expected) if (value === values[index]) index += 1;
  return index === values.length;
}

export function deferredStructuralConflict(baseTree, desiredModel, watchedTrees) {
  if (!watchedTrees.length) return false;
  const base = nativeCellIndex(baseTree); const desired = new Map(desiredModel.rows.flat().map((cell) => [cell.uid, cell.raw]));
  const baseRoots = tableCells(baseTree).map((row) => row[0]?.uid); const desiredRoots = desiredModel.rows.map((row) => row[0]?.uid);
  for (const tree of watchedTrees) {
    for (const [uid, cell] of nativeCellIndex(tree)) {
      if (!base.has(uid) && !desired.has(uid)) return true;
      const allowed = new Set([base.get(uid)?.raw, desired.get(uid)]);
      if (!allowed.has(cell.raw)) return true;
    }
    const roots = tableCells(tree).map((row) => row[0]?.uid);
    if (!sequenceIsSubsequence(roots, baseRoots) && !sequenceIsSubsequence(roots, desiredRoots)) return true;
  }
  return false;
}

function patchTreeCellRaw(tree, uid, raw) {
  const visit = (node) => {
    if (node.uid === uid) { node.string = nativePersistedRaw(raw); return true; }
    return (node.children || []).some(visit);
  };
  return visit(tree);
}

function immediateParentUid(block) {
  const parents = block?.[":block/_children"] ?? block?.["block/_children"] ?? block?.parents ?? block?.[":block/parents"] ?? [];
  const values = Array.isArray(parents) ? parents : [parents];
  const parent = values[0];
  return parent?.uid ?? parent?.[":block/uid"] ?? (typeof parent === "string" ? parent : null);
}

function pullNativeCell(uid) {
  const api = roam();
  const pull = api.data?.pull || api.pull;
  let value = null;
  if (pull) value = pull.call(api.data || api, "[:block/uid :block/string :block/order :edit/time {:block/_children [:block/uid]}]", [":block/uid", uid]);
  else {
    const safeUid = String(uid).replace(/["\\]/g, "");
    value = api.q(`[:find (pull ?block [:block/uid :block/string :block/order :edit/time {:block/_children [:block/uid]}]) :where [?block :block/uid "${safeUid}"]]`)?.[0]?.[0];
  }
  if (!value) return null;
  const actualUid = value.uid ?? value[":block/uid"];
  if (actualUid !== uid) return null;
  return {
    uid: actualUid,
    raw: nativeStoredRaw(value.string ?? value[":block/string"] ?? ""),
    order: value.order ?? value[":block/order"] ?? null,
    editTime: value.editTime ?? value[":edit/time"] ?? null,
    parentUid: immediateParentUid(value),
  };
}

export function nativeTreeToModel(tree, metadata = {}) {
  tree = normalizeTree(tree);
  const rows = tableCells(tree).map((row) => row.map((cell) => ({ uid: cell.uid, raw: cell.string === " " ? "" : cell.string })));
  const model = new GridModel({ rows: rows.length ? rows : [[""]], tableUid: tree.uid, ...metadata });
  model.baseFingerprint = treeFingerprint(tree);
  model.baseSnapshot = model.snapshot();
  return model;
}

export function serializeTemplateModel(model, name = "Untitled grid") {
  const value = {
    schema: "roam-grid-template",
    version: 1,
    name: String(name).trim() || "Untitled grid",
    rows: rawRows(model),
    merges: deepClone(model.merges),
    widths: model.columnIds.map((id) => model.widths[id] ?? null),
    rowHeights: Array.from({ length: model.rowCount }, (_, row) => model.getRowHeight(row)),
    alignments: Array.from({ length: model.rowCount }, (_, row) => Array.from({ length: model.colCount }, (_, col) => model.getAlignment(row, col))),
    headerColumns: Array.from({ length: model.colCount }, (_, col) => col).filter((col) => model.isHeaderColumn(col)),
    headerRows: Array.from({ length: model.rowCount }, (_, row) => row).filter((row) => model.isHeaderRow(row)),
    frozenRows: model.frozenRows,
    frozenCols: model.frozenCols,
    charts: deepClone(model.charts),
    showHeaders: model.showHeaders !== false,
    fitToWidth: model.fitToWidth !== false,
    colorFormulaCells: model.colorFormulaCells !== false,
  };
  return value;
}

export function templateModelFromValue(value) {
  if (!value || value.schema !== "roam-grid-template" || value.version !== 1 || !Array.isArray(value.rows)) {
    throw new GridError("TEMPLATE_FORMAT", "This saved grid template uses an unsupported format");
  }
  const model = new GridModel({
    rows: deepClone(value.rows),
    merges: deepClone(value.merges || []),
    frozenRows: value.frozenRows ?? 1,
    frozenCols: value.frozenCols ?? 0,
    charts: deepClone(value.charts || []),
    showHeaders: value.showHeaders !== false,
    fitToWidth: value.fitToWidth !== false,
    colorFormulaCells: value.colorFormulaCells !== false,
  });
  (value.widths || []).forEach((width, col) => {
    if (model.columnIds[col] && Number.isFinite(width)) model.widths[model.columnIds[col]] = clamp(Math.round(width), getSetting("sizing-min-col-width"), getSetting("sizing-max-col-width"));
  });
  (value.rowHeights || []).forEach((height, row) => { if (row < model.rowCount && Number.isFinite(height)) model.setRowHeight(row, height); });
  (value.alignments || []).forEach((alignments, row) => (alignments || []).forEach((alignment, col) => {
    if (row < model.rowCount && col < model.colCount && alignment) model.setAlignment(row, col, alignment);
  }));
  for (const col of value.headerColumns || []) if (Number.isInteger(col) && col >= 0 && col < model.colCount) model.toggleHeaderColumn(col);
  for (const row of value.headerRows || []) if (Number.isInteger(row) && row >= 0 && row < model.rowCount) model.toggleHeaderRow(row);
  return model;
}

export class MetadataStore {
  constructor() {
    this.pageUid = null;
    this.entries = new Map();
  }

  async initialize() {
    this.pageUid = getPageUid(METADATA_PAGE);
    await this.reload();
  }

  async ensurePage() {
    if (!this.pageUid) this.pageUid = getPageUid(METADATA_PAGE) || await createPage(METADATA_PAGE);
    return this.pageUid;
  }

  async reload() {
    this.entries.clear();
    if (!this.pageUid) return;
    const tree = getTree(this.pageUid);
    for (const block of tree?.children || []) {
      if (!block.string.startsWith(METADATA_PREFIX)) continue;
      try {
        const value = JSON.parse(block.string.slice(METADATA_PREFIX.length).trim());
        if (value.schema === 1 && value.tableUid) this.entries.set(value.tableUid, { blockUid: block.uid, value });
      } catch (error) {
        console.warn("[roam-grid] Ignoring malformed metadata", block.uid, error);
      }
    }
  }

  get(tableUid) {
    const value = this.entries.get(tableUid)?.value;
    if (!value) return null;
    return { columnIds: value.columnIds || [], merges: value.merges || [], widths: value.widths || {}, rowHeights: value.rowHeights || {}, alignments: value.alignments || {}, headerColumns: value.headerColumns || [], headerRows: value.headerRows || [], frozenRows: value.frozenRows ?? 1, frozenCols: value.frozenCols ?? 0, charts: value.charts || [], imageLayout: value.imageLayout || {}, showHeaders: value.showHeaders !== false, fitToWidth: value.fitToWidth !== false, colorFormulaCells: value.colorFormulaCells !== false };
  }

  has(tableUid) { return this.entries.has(tableUid); }

  async set(tableUid, model, mode = "native") {
    const value = { schema: 1, mode, tableUid, columnIds: model.columnIds, merges: model.merges, widths: model.widths, rowHeights: model.rowHeights, alignments: model.alignments, headerColumns: model.headerColumns, headerRows: model.headerRows, frozenRows: model.frozenRows, frozenCols: model.frozenCols, charts: model.charts, imageLayout: model.imageLayout, showHeaders: model.showHeaders !== false, fitToWidth: model.fitToWidth !== false, colorFormulaCells: model.colorFormulaCells !== false, updatedAt: new Date().toISOString() };
    const string = `${METADATA_PREFIX} ${JSON.stringify(value)}`;
    const entry = this.entries.get(tableUid);
    const pageUid = await this.ensurePage();
    const blockUid = entry ? entry.blockUid : await createBlock(pageUid, string);
    if (entry) await updateBlock(blockUid, string);
    this.entries.set(tableUid, { blockUid, value });
    return blockUid;
  }

  async remove(tableUid) {
    const entry = this.entries.get(tableUid);
    if (!entry) return;
    await deleteBlock(entry.blockUid);
    this.entries.delete(tableUid);
  }

  async createStaging(tableUid) {
    return createBlock(await this.ensurePage(), `roam-grid/staging:: ${tableUid}`);
  }
}

/** The last `{{[[table]]}}` child of a name block — the one a failed materialize just appended.
 *  A partial materialize throws before its uid is returned, so the unwind locates it structurally. */
function lastTableChildUid(blockUid) {
  return [...(getTree(blockUid)?.children || [])].filter((child) => NATIVE_MARKER.test(child.string || "")).at(-1)?.uid || null;
}

/** Overwrite guard for `GridTemplateStore.save` — the "existing confirm dialog" of the codebase. */
function confirmTemplateOverwrite(name) {
  return showChoice(`A grid template named “${name}” already exists. Overwrite it?`, [
    { label: "Overwrite", value: true, primary: true },
    { label: "Cancel", value: false },
  ]);
}

/**
 * Templates live as real, editable native tables on `[[roam/grid/templates]]`: a top-level
 * `roam-grid/template:: <name>` block whose first `{{[[table]]}}` child IS the template. Its layout
 * is ordinary MetadataStore state keyed by the table's uid, so opening the page mounts each template
 * as a normal enhanced grid and editing it edits the template. A top-level block whose remainder
 * still parses as a v1 JSON record is a legacy entry — readable as before, and rewritten into the
 * v2 shape by `migrateLegacyTemplates` or the next `save`.
 */
export class GridTemplateStore {
  constructor() {
    this.pageUid = null;
    this.entries = new Map();
  }

  async initialize() {
    this.reload();
  }

  async ensurePage() {
    if (!this.pageUid) this.pageUid = getPageUid(TEMPLATE_PAGE) || await createPage(TEMPLATE_PAGE);
    return this.pageUid;
  }

  /** Synchronous re-read of the whole templates page — one `getTree`. `list`, `get`, and `save`
   *  all start here so a stale load-once snapshot can never outlive an edit made on the page. */
  reload() {
    this.entries.clear();
    if (!this.pageUid) this.pageUid = getPageUid(TEMPLATE_PAGE);
    if (!this.pageUid) return;
    const tree = getTree(this.pageUid);
    for (const block of tree?.children || []) {
      if (!block.string.startsWith(TEMPLATE_PREFIX)) continue;
      const rest = block.string.slice(TEMPLATE_PREFIX.length).trim();
      if (!rest) { console.warn("[roam-grid] Ignoring nameless saved template", block.uid); continue; }
      if (rest.startsWith("{")) {
        try {
          const value = JSON.parse(rest);
          if (value.schema !== "roam-grid-template" || value.version !== 1 || !value.name) throw new Error("Unsupported template record");
          const name = String(value.name);
          this.entries.set(name.toUpperCase(), { key: name.toUpperCase(), name, nameBlockUid: block.uid, tableUid: null, legacyValue: value });
        } catch (error) {
          console.warn("[roam-grid] Ignoring malformed saved template", block.uid, error);
        }
        continue;
      }
      const tableChild = (block.children || []).find((child) => NATIVE_MARKER.test(child.string || ""));
      this.entries.set(rest.toUpperCase(), { key: rest.toUpperCase(), name: rest, nameBlockUid: block.uid, tableUid: tableChild?.uid || null, legacyValue: null });
    }
  }

  list() {
    this.reload();
    return [...this.entries.values()].map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
  }

  /** Stays synchronous: `resolveTemplateModel` truth-tests the result without awaiting. */
  get(name) {
    this.reload();
    const entry = this.entries.get(String(name).toUpperCase());
    if (!entry) return null;
    if (entry.legacyValue) return templateModelFromValue(deepClone(entry.legacyValue));
    if (!entry.tableUid) return null;
    let live = null;
    try {
      // `load` merges the MetadataStore layout; a missing metadata entry degrades to the raw rows.
      live = new NativeTableAdapter(entry.tableUid, runtime.metadata ?? { get: () => null }).load();
    } catch (error) {
      console.warn("[roam-grid] Saved template table is gone", entry.tableUid, error);
      return null;
    }
    // The uid-remap round-trip strips the template table's real cell uids so an insert can never
    // carry a stale uid-keyed layout into the new grid.
    return templateModelFromValue(serializeTemplateModel(live, entry.name));
  }

  async save(name, model, { confirmOverwrite = true } = {}) {
    this.reload();
    const cleanName = String(name || "").trim();
    if (!cleanName) throw new GridError("TEMPLATE_NAME", "Give this grid template a name");
    if (model.rowCount * model.colCount > getSetting("writes-native-budget")) throw new GridError("TEMPLATE_SIZE", "Saved templates must fit within the native-table write budget");
    const key = cleanName.toUpperCase();
    const existing = this.entries.get(key);
    if (existing && confirmOverwrite) {
      const proceed = await confirmTemplateOverwrite(cleanName);
      if (!proceed) return null;
    }
    const pageUid = await this.ensurePage();
    const nameBlockUid = existing ? existing.nameBlockUid : await createBlock(pageUid, `${TEMPLATE_PREFIX} ${cleanName}`);
    const originalString = existing?.legacyValue ? `${TEMPLATE_PREFIX} ${JSON.stringify(existing.legacyValue)}` : null;
    if (existing) await updateBlock(nameBlockUid, `${TEMPLATE_PREFIX} ${cleanName}`);
    const clean = templateModelFromValue(serializeTemplateModel(model, cleanName));
    // The NEW table is materialized first; the old table is deleted only once its replacement
    // exists, so a mid-save failure can never destroy the template it was replacing.
    let tableUid = null;
    try {
      tableUid = await createNativeTableFromModel(clean, null, { parentUid: nameBlockUid });
    } catch (error) {
      const partialUid = tableUid || lastTableChildUid(nameBlockUid);
      if (partialUid) await deleteBlock(partialUid).catch(() => {});
      if (originalString != null) await updateBlock(nameBlockUid, originalString).catch(() => {});
      if (globalThis.window) globalThis.window.__RG_U2_LAST_ERROR = String(error?.stack || error);
      throw error;
    }
    if (existing?.tableUid) {
      // The old table's session dies before its blocks, or its pull watch would echo our own
      // delete back as an external change. Metadata goes before the subtree so a crash between
      // the two leaves a restorable table, never an orphaned layout record.
      disposeNativeSession(existing.tableUid, true);
      await runtime.metadata.remove(existing.tableUid);
      await deleteBlock(existing.tableUid);
    }
    this.entries.set(key, { key, name: cleanName, nameBlockUid, tableUid, legacyValue: null });
    return cleanName;
  }
}

/**
 * One-time, idempotent rewrite of legacy v1 JSON template blocks into the v2 name-block + real
 * table shape. Re-detection is the idempotency: a run that finds no legacy entries performs zero
 * writes. Each entry is backed up to `[[roam/grid/metadata]]` BEFORE its block is rewritten, and
 * the materialized table is verified by a fresh tree read — a failed verify (or a throw) restores
 * the original JSON, deletes the partial table, and moves on to the next entry rather than
 * aborting the run.
 */
let templateMigrationInFlight = false;

export async function migrateLegacyTemplates() {
  const store = runtime.templates;
  if (!store || !runtime.metadata) return { legacy: 0, migrated: 0, skipped: 0 };
  if (templateMigrationInFlight) return { legacy: 0, migrated: 0, skipped: 0, reentered: true };
  templateMigrationInFlight = true;
  try {
    store.reload();
    const legacy = [...store.entries.values()].filter((entry) => entry.legacyValue);
    if (!legacy.length) return { legacy: 0, migrated: 0, skipped: 0 };
    let migrated = 0;
    let skipped = 0;
    for (const entry of legacy) {
      const model = templateModelFromValue(deepClone(entry.legacyValue));
      if (model.rowCount * model.colCount + 3 > getSetting("writes-native-budget")) { skipped += 1; continue; }
      const original = getTree(entry.nameBlockUid)?.string || `${TEMPLATE_PREFIX} ${JSON.stringify(entry.legacyValue)}`;
      let tableUid = null;
      try {
        await createTemplateBackup(original);
        await updateBlock(entry.nameBlockUid, `${TEMPLATE_PREFIX} ${entry.name}`);
        tableUid = await createNativeTableFromModel(model, null, { parentUid: entry.nameBlockUid });
        const tree = getTree(tableUid);
        const cells = tableCells(tree).reduce((total, row) => total + row.length, 0);
        if (!tree || cells !== model.rowCount * model.colCount) throw new Error(`Template migration verify failed for "${entry.name}": ${cells} cells, expected ${model.rowCount * model.colCount}`);
      } catch (error) {
        if (globalThis.window) globalThis.window.__RG_U2_LAST_ERROR = String(error?.stack || error);
        console.warn("[roam-grid] Template migration failed; restored the original JSON", entry.nameBlockUid, error);
        // A THROW (vs verify failure) strips the JSON with nothing restored unless the same
        // delete-partial + restore-original unwind runs here — and one entry's failure must not
        // abort the run for the entries after it. The block re-parses as legacy on the next run,
        // so the partial table must not survive, or every retry stacks another broken table.
        const partialUid = tableUid || lastTableChildUid(entry.nameBlockUid);
        if (partialUid) await deleteBlock(partialUid).catch(() => {});
        await updateBlock(entry.nameBlockUid, original).catch(() => {});
        continue;
      }
      store.entries.set(entry.key, { key: entry.key, name: entry.name, nameBlockUid: entry.nameBlockUid, tableUid, legacyValue: null });
      migrated += 1;
    }
    if (migrated === 0 && legacy.length > skipped) {
      toast("Template migration made no progress. See window.__RG_U2_LAST_ERROR for the failure.", "danger", 8000);
    } else {
      toast(`Migrated ${migrated} grid template(s) to editable tables on [[${TEMPLATE_PAGE}]]${skipped ? ` — ${skipped} skipped (over write budget)` : ""}`, "success", 8000);
    }
    return { legacy: legacy.length, migrated, skipped };
  } finally {
    templateMigrationInFlight = false;
  }
}

/** Backup with dedupe: a re-run against an already-backed-up record skips a second identical backup. */
async function createTemplateBackup(original) {
  const pageUid = await runtime.metadata.ensurePage();
  const backupString = `${TEMPLATE_BACKUP_PREFIX} ${original.slice(TEMPLATE_PREFIX.length).trim()}`;
  const tree = getTree(pageUid);
  const exists = (tree?.children || []).some((block) => block.string === backupString);
  if (!exists) await createBlock(pageUid, backupString);
}

class MutationQueue {
  constructor() { this.tail = Promise.resolve(); }
  run(task) {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => {});
    return next;
  }
}

export class NativeTableAdapter {
  constructor(tableUid, metadataStore = runtime.metadata) {
    this.tableUid = tableUid;
    this.metadataStore = metadataStore;
    this.queue = new MutationQueue();
    this.model = null;
    this.watch = null;
    this.baseTree = null;
    this.baseCells = new Map();
    this.lastWatchTree = null;
    this.selfWrites = new Map();
    this.structuralSaving = false;
    this.deferredStructuralWatches = [];
    this.expectedStructuralTransitions = [];
    this.watchCallback = null;
  }

  /** `defaults` is only ever supplied on a first enhancement, where there is no stored layout yet;
   *  stored metadata always wins, so a grid's own display flags are never overwritten on reload. */
  load(defaults = null) {
    const tree = getTree(this.tableUid);
    if (!tree || !NATIVE_MARKER.test(tree.string)) throw new GridError("NOT_TABLE", "Focused block is not a native Roam table");
    this.model = nativeTreeToModel(tree, { ...(defaults || {}), ...(this.metadataStore.get(this.tableUid) || {}) });
    this.adoptBaseTree(tree);
    return this.model;
  }

  adoptBaseTree(tree) {
    this.baseTree = deepClone(normalizeTree(tree));
    this.baseCells = nativeCellIndex(this.baseTree);
    this.lastWatchTree = deepClone(this.baseTree);
    const fingerprint = treeFingerprint(this.baseTree);
    if (this.model) {
      this.model.baseFingerprint = fingerprint;
      this.model.baseSnapshot ||= this.model.snapshot();
    }
  }

  acceptExternalTree(tree, model = this.model, baseModel = model) {
    this.model = model;
    this.adoptBaseTree(tree);
    if (this.model && baseModel) this.model.baseSnapshot = baseModel.snapshot();
  }

  getBaseRaw(uid) { return this.baseCells.get(uid)?.raw; }

  getBaseAncestry(uid) {
    const ancestry = []; let cell = this.baseCells.get(uid); const seen = new Set();
    while (cell) {
      if (seen.has(cell.uid)) return null;
      seen.add(cell.uid); ancestry.push(cell);
      if (cell.parentUid === this.tableUid) return ancestry;
      cell = this.baseCells.get(cell.parentUid);
    }
    return null;
  }

  recordSelfWrite(uid, from, to) {
    const now = Date.now();
    const queue = (this.selfWrites.get(uid) || []).filter((item) => item.expires > now);
    queue.push({ from, to, expires: now + 10_000 });
    this.selfWrites.set(uid, queue);
  }

  consumeSelfWrite(uid, from, to) {
    const now = Date.now();
    const queue = (this.selfWrites.get(uid) || []).filter((item) => item.expires > now);
    // An exact `from` match beats a lingering null-from wildcard (overlay cancel() records one to
    // absorb Roam's blur flush): a wildcard found first would shadow a later exact match, turning
    // our own write into a spurious conflict or swallowing a genuine external one.
    let start = queue.findIndex((item) => item.from === from);
    // The wildcard is the sibling of the restore write `{flushed → beforeRaw}` recorded right
    // after it; when that sibling is consumed, the wildcard goes with it.
    if (start > 0 && queue[start - 1].from == null && queue[start - 1].to === from) start -= 1;
    if (start < 0) start = queue.findIndex((item) => item.from == null);
    let end = -1; let value = from;
    for (let index = start; index >= 0 && index < queue.length; index += 1) {
      const item = queue[index];
      if (item.from != null && item.from !== value) break;
      value = item.to;
      if (value === to) { end = index; break; }
    }
    if (start < 0 || end < start) { if (queue.length) this.selfWrites.set(uid, queue); else this.selfWrites.delete(uid); return false; }
    queue.splice(start, end - start + 1);
    if (queue.length) this.selfWrites.set(uid, queue); else this.selfWrites.delete(uid);
    return true;
  }

  pruneExpectedStructuralTransitions(now = Date.now()) {
    this.expectedStructuralTransitions = this.expectedStructuralTransitions.filter((item) => item.expires > now);
  }

  recordExpectedStructuralTransition(beforeTree, afterTree, verifiedIntermediateTrees = []) {
    const afterFingerprint = structuralEchoFingerprint(afterTree);
    if (!afterFingerprint) return;
    const now = Date.now(); this.pruneExpectedStructuralTransitions(now);
    const beforeFingerprints = new Set([beforeTree, ...verifiedIntermediateTrees].map(structuralEchoFingerprint).filter(Boolean));
    for (const beforeFingerprint of beforeFingerprints) {
      if (this.expectedStructuralTransitions.some((item) => item.beforeFingerprint === beforeFingerprint && item.afterFingerprint === afterFingerprint)) continue;
      this.expectedStructuralTransitions.push({ beforeFingerprint, afterFingerprint, expires: now + 10_000 });
    }
    if (this.expectedStructuralTransitions.length > 8) this.expectedStructuralTransitions.splice(0, this.expectedStructuralTransitions.length - 8);
  }

  consumeExpectedStructuralTransition(beforeTree, afterTree) {
    const beforeFingerprint = structuralEchoFingerprint(beforeTree); const afterFingerprint = structuralEchoFingerprint(afterTree);
    if (!beforeFingerprint || !afterFingerprint) return false;
    this.pruneExpectedStructuralTransitions();
    const index = this.expectedStructuralTransitions.findIndex((item) => item.beforeFingerprint === beforeFingerprint && item.afterFingerprint === afterFingerprint);
    if (index < 0) return false;
    this.expectedStructuralTransitions.splice(index, 1);
    return true;
  }

  watchExternal(callback) {
    this.watchCallback = callback;
    const pattern = "[:block/uid :block/string :block/order :edit/time {:block/children ...}]";
    const entity = `[:block/uid \"${this.tableUid}\"]`;
    const handler = (before, after) => {
      const nextTree = normalizeTree(after);
      if (!nextTree) return;
      if (this.structuralSaving) { this.deferredStructuralWatches.push(nextTree); return; }
      const previousTree = normalizeTree(before) || this.lastWatchTree || this.baseTree;
      const structural = !previousTree || nativeStructureSignature(previousTree) !== nativeStructureSignature(nextTree);
      const previous = previousTree ? nativeCellIndex(previousTree) : new Map();
      const next = nativeCellIndex(nextTree);
      const changes = [];
      for (const [uid, cell] of next) {
        const old = previous.get(uid);
        if (old && old.raw !== cell.raw) changes.push({ uid, from: old.raw, raw: cell.raw, row: cell.row, col: cell.col });
      }
      const externalChanges = changes.filter((change) => !this.consumeSelfWrite(change.uid, change.from, change.raw));
      this.lastWatchTree = deepClone(nextTree);
      // Roam may deliver a structural pull-watch after our save promise has
      // resolved. Consume only the exact, short-lived before→after transition
      // captured from the verified commit; never infer an echo from the mutable
      // live model, which may already contain a newer local edit.
      if (structural && this.consumeExpectedStructuralTransition(previousTree, nextTree)) return;
      if (structural) this.expectedStructuralTransitions.length = 0;
      if (!structural && !externalChanges.length) return;
      const model = nativeTreeToModel(nextTree, this.metadataStore.get(this.tableUid) || {});
      callback(model, { type: structural ? "structural" : "content", structural, changes: externalChanges, tree: nextTree });
    };
    roam().data.addPullWatch(pattern, entity, handler);
    this.watch = () => roam().data.removePullWatch(pattern, entity, handler);
    return this.watch;
  }

  normalizeContentChanges(changes) {
    const values = changes instanceof Map ? [...changes.values()] : Array.isArray(changes) ? changes : Object.values(changes || {});
    return values.map((change) => ({
      uid: String(change.uid),
      baseRaw: String(change.baseRaw ?? this.getBaseRaw(change.uid) ?? ""),
      raw: String(change.raw ?? ""),
      revision: Number(change.revision) || 0,
    }));
  }

  patchBaseContent(changes) {
    for (const change of changes) {
      patchTreeCellRaw(this.baseTree, change.uid, change.raw);
      const base = this.baseCells.get(change.uid); if (base) base.raw = change.raw;
      if (this.model?.baseSnapshot?.rows) for (const row of this.model.baseSnapshot.rows) {
        const cell = row.find((item) => item.uid === change.uid); if (cell) { cell.raw = change.raw; break; }
      }
    }
    if (this.baseTree && this.model) this.model.baseFingerprint = treeFingerprint(this.baseTree);
    this.lastWatchTree = deepClone(this.baseTree);
  }

  async saveContent(changes) {
    const requested = this.normalizeContentChanges(changes);
    return this.queue.run(async () => {
      const desired = requested.filter((change) => change.raw !== change.baseRaw);
      if (!desired.length) return { saved: [], skipped: requested.map((change) => change.uid) };
      const validation = [];
      const validatedCells = new Map();
      for (const change of desired) {
        const base = this.baseCells.get(change.uid);
        if (!base) throw new GridError("STRUCTURAL_CONFLICT", `Cell ${change.uid} is no longer part of this table`);
        const ancestry = this.getBaseAncestry(change.uid);
        if (!ancestry) throw new GridError("STRUCTURAL_CONFLICT", `Cell ${change.uid} has an invalid cached ancestry`);
        for (const expected of ancestry) {
          let currentAncestor = validatedCells.get(expected.uid);
          if (!currentAncestor) { currentAncestor = pullNativeCell(expected.uid); if (currentAncestor) validatedCells.set(expected.uid, currentAncestor); }
          if (!currentAncestor || currentAncestor.parentUid !== expected.parentUid || Number(currentAncestor.order) !== Number(expected.order)) {
            throw new GridError("STRUCTURAL_CONFLICT", "The table cell ancestry or order changed elsewhere. Reload before saving.");
          }
        }
        const current = validatedCells.get(change.uid);
        if (!current) throw new GridError("STRUCTURAL_CONFLICT", `Cell ${change.uid} no longer exists`);
        if (current.raw !== change.baseRaw) throw new GridError("CONFLICT", "This cell changed elsewhere. Reload before saving.", { uid: change.uid, expected: change.baseRaw, actual: current.raw });
        validation.push({ change, current });
      }
      const written = [];
      try {
        for (const item of validation) {
          this.recordSelfWrite(item.change.uid, item.current.raw, item.change.raw);
          try { await updateBlock(item.change.uid, nativePersistedRaw(item.change.raw)); }
          catch (error) { this.consumeSelfWrite(item.change.uid, item.current.raw, item.change.raw); throw error; }
          written.push(item);
        }
        this.patchBaseContent(validation.map((item) => item.change));
        return { saved: validation.map((item) => ({ ...item.change })), skipped: [] };
      } catch (error) {
        for (const item of [...written].reverse()) {
          try {
            const current = pullNativeCell(item.change.uid);
            if (current?.raw !== item.change.raw) continue;
            this.recordSelfWrite(item.change.uid, item.change.raw, item.change.baseRaw);
            await updateBlock(item.change.uid, nativePersistedRaw(item.change.baseRaw));
          } catch (rollbackError) { console.error("[roam-grid] Content rollback failed", rollbackError); }
        }
        try {
          const tree = getTree(this.tableUid);
          if (tree) this.adoptBaseTree(tree);
        } catch { /* preserve the last verified base when repull is unavailable */ }
        throw error;
      }
    });
  }

  async save(model, { saveMetadata = true } = {}) {
    return this.queue.run(async () => {
      const currentTree = getTree(this.tableUid);
      if (!currentTree) throw new GridError("TABLE_MISSING", "The source Roam table no longer exists");
      const expectedFingerprint = this.baseTree ? treeFingerprint(this.baseTree) : this.model?.baseFingerprint;
      if (expectedFingerprint && treeFingerprint(currentTree) !== expectedFingerprint) throw new GridError("CONFLICT", "The table changed elsewhere. Reload before saving.");
      const before = this.model;
      const metadataHadEntry = Boolean(this.metadataStore.has?.(this.tableUid) ?? this.metadataStore.get?.(this.tableUid));
      this.structuralSaving = true;
      this.deferredStructuralWatches = [];
      let transaction = null; let metadataTouched = false;
      try {
        transaction = await this.persistModel(model, currentTree);
        if (saveMetadata) { metadataTouched = true; await this.metadataStore.set(this.tableUid, model); }
        await transaction?.commit?.();
        const reloaded = this.load();
        const watched = this.deferredStructuralWatches.slice();
        const conflict = !nativeTreeMatchesModel(this.baseTree, model) || deferredStructuralConflict(currentTree, model, watched);
        if (!conflict) this.recordExpectedStructuralTransition(currentTree, this.baseTree, watched);
        if (conflict && this.watchCallback) {
          const tree = deepClone(this.baseTree); const callback = this.watchCallback;
          setTimeout(() => callback(reloaded, { type: "structural", structural: true, conflict: true, changes: [], tree }), 0);
        }
        return reloaded;
      } catch (error) {
        console.error("[roam-grid] Native save failed", error);
        let rollbackComplete = false; let graphRestored = false;
        if (transaction?.rollback) {
          try { const result = await transaction.rollback(); rollbackComplete = result?.complete !== false; graphRestored = result?.graphRestored ?? rollbackComplete; } catch (rollbackError) { console.error("[roam-grid] Structural rollback also failed", rollbackError); }
        } else if (error.rgRollbackAttempted) { rollbackComplete = error.rgRollbackComplete === true; graphRestored = error.rgRollbackGraphRestored ?? rollbackComplete; }
        else if (before?.baseSnapshot) {
          try { await this.reconcile(new GridModel({ ...before.baseSnapshot, tableUid: this.tableUid }), getTree(this.tableUid), true); rollbackComplete = true; graphRestored = true; } catch (rollbackError) { console.error("[roam-grid] Rollback also failed", rollbackError); }
        }
        if (metadataTouched && graphRestored) {
          try {
            if (metadataHadEntry && before?.baseSnapshot) await this.metadataStore.set(this.tableUid, new GridModel({ ...before.baseSnapshot, tableUid: this.tableUid }));
            else if (this.metadataStore.remove) await this.metadataStore.remove(this.tableUid);
          } catch (metadataError) { console.error("[roam-grid] Metadata rollback also failed", metadataError); }
        }
        throw error;
      } finally {
        this.structuralSaving = false;
        this.deferredStructuralWatches = [];
      }
    });
  }

  async persistModel(model, currentTree) {
    const currentCells = tableCells(currentTree);
    const sameShape = currentCells.length === model.rowCount && currentCells.every((row, rowIndex) => row.length === model.colCount && row.every((cell, colIndex) => cell.uid === model.rows[rowIndex][colIndex].uid));
    if (sameShape) {
      const updates = [];
      currentCells.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
        const raw = model.getRaw(rowIndex, colIndex);
        if (cell.string !== nativePersistedRaw(raw)) updates.push({ uid: cell.uid, from: nativeStoredRaw(cell.string), raw });
      }));
      if (updates.length > getSetting("writes-native-budget")) throw new GridError("MUTATION_BUDGET", `This edit requires ${updates.length} Roam writes; copy to a large grid instead`);
      // Record each rewrite so the pull watch absorbs our own echo instead of turning it into a
      // conflict reload — the same contract saveContent follows.
      for (const { uid, from, raw } of updates) {
        this.recordSelfWrite(uid, from, raw);
        try { await updateBlock(uid, nativePersistedRaw(raw)); }
        catch (error) { this.consumeSelfWrite(uid, from, raw); throw error; }
      }
      return;
    }
    return this.persistDeletionOnly(model, currentTree) || this.reconcile(model, currentTree);
  }

  persistDeletionOnly(model, currentTree) {
    const currentRows = tableCells(currentTree);
    if (!currentRows.length || currentRows.length <= model.rowCount) return null;
    if (currentRows.some((row) => row.length !== model.colCount) || model.rows.some((row) => row.length !== model.colCount)) return null;
    const desiredRoots = model.rows.map((row) => row[0].uid);
    const desiredRootSet = new Set(desiredRoots);
    const survivors = currentRows.filter((row) => desiredRootSet.has(row[0].uid));
    if (survivors.length !== model.rowCount || survivors.some((row, index) => row[0].uid !== desiredRoots[index])) return null;
    for (let row = 0; row < survivors.length; row += 1) {
      if (survivors[row].some((cell, col) => cell.uid !== model.rows[row][col].uid)) return null;
    }
    const removed = currentRows.map((row, index) => ({ row, index })).filter(({ row }) => !desiredRootSet.has(row[0].uid));
    if (!removed.length) return null;
    const removedIndexes = removed.map((item) => item.index);
    if (removedIndexes.at(-1) - removedIndexes[0] + 1 !== removedIndexes.length) return null;
    const updates = [];
    for (let row = 0; row < survivors.length; row += 1) for (let col = 0; col < model.colCount; col += 1) {
      const desired = model.getRaw(row, col); const current = nativeStoredRaw(survivors[row][col].string);
      if (desired !== current) updates.push({ uid: survivors[row][col].uid, from: current, raw: desired });
    }
    const mutationEstimate = 2 + removed.length * 2 + updates.length * 2;
    if (mutationEstimate > getSetting("writes-native-budget")) throw new GridError("MUTATION_BUDGET", `Row deletion requires about ${mutationEstimate} Roam writes; copy to a large grid instead`);
    return this.createDeletionTransaction(removed, updates);
  }

  async createDeletionTransaction(removed, updates) {
    const stagingUid = await this.metadataStore.createStaging(this.tableUid);
    const appliedUpdates = []; const moved = []; let rollbackResult = null; let committed = false;
    const rollback = async () => {
      if (rollbackResult) return rollbackResult;
      const errors = []; let moveFailed = false; let updateFailed = false; let cleanupFailed = false;
      for (const item of [...moved].sort((a, b) => a.index - b.index)) {
        try { await moveBlock(item.row[0].uid, this.tableUid, item.index); }
        catch (error) { moveFailed = true; errors.push(error); }
      }
      for (const item of [...appliedUpdates].reverse()) {
        try { await updateBlock(item.uid, nativePersistedRaw(item.from)); }
        catch (error) { updateFailed = true; errors.push(error); }
      }
      if (!moveFailed) {
        try { await deleteBlock(stagingUid); }
        catch (error) { cleanupFailed = true; errors.push(error); }
      }
      rollbackResult = { complete: errors.length === 0, graphRestored: !moveFailed && !updateFailed, cleanupFailed, errors };
      return rollbackResult;
    };
    try {
      for (const item of updates) { await updateBlock(item.uid, nativePersistedRaw(item.raw)); appliedUpdates.push(item); }
      for (const item of removed) { await moveBlock(item.row[0].uid, stagingUid, "last"); moved.push(item); }
      return { commit: async () => { await deleteBlock(stagingUid); committed = true; }, rollback: () => committed ? Promise.resolve({ complete: false, errors: [new Error("Deletion was already committed")] }) : rollback() };
    } catch (error) {
      const result = await rollback();
      error.rgRollbackAttempted = true;
      error.rgRollbackComplete = result.complete;
      error.rgRollbackGraphRestored = result.graphRestored;
      if (result.errors.length) console.error("[roam-grid] Row deletion rollback incomplete", result.errors);
      throw error;
    }
  }

  async reconcile(model, currentTree, force = false) {
    const currentRows = tableCells(currentTree);
    const current = currentRows.flat();
    const mutationEstimate = current.length * 2 + model.rowCount * model.colCount;
    if (!force && mutationEstimate > getSetting("writes-native-budget")) throw new GridError("MUTATION_BUDGET", `Structural edit requires about ${mutationEstimate} Roam writes; copy to a large grid instead`);
    const stagingUid = await this.metadataStore.createStaging(this.tableUid);
    try {
      for (const row of currentRows) for (const cell of [...row].reverse()) await moveBlock(cell.uid, stagingUid, "last");
      const desiredUids = new Set(); const minted = new Map();
      for (let rowIndex = 0; rowIndex < model.rowCount; rowIndex += 1) for (let colIndex = 0; colIndex < model.colCount; colIndex += 1) {
        const cell = model.rows[rowIndex][colIndex];
        const desired = cell.raw === "" ? " " : cell.raw;
        if (cell.uid.startsWith("rg_") || !current.some((old) => old.uid === cell.uid)) {
          const oldUid = cell.uid;
          cell.uid = await createBlock(stagingUid, desired);
          minted.set(oldUid, cell.uid);
          if (colIndex === 0 && Object.hasOwn(model.rowHeights, oldUid)) {
            model.rowHeights[cell.uid] = model.rowHeights[oldUid];
            delete model.rowHeights[oldUid];
          }
          if (Object.hasOwn(model.alignments, oldUid)) { model.alignments[cell.uid] = model.alignments[oldUid]; delete model.alignments[oldUid]; }
        }
        else if (current.find((old) => old.uid === cell.uid)?.string !== desired) await updateBlock(cell.uid, desired);
        desiredUids.add(cell.uid);
      }
      // Undo entries address cells by uid; a checkpoint restored under the
      // pre-mint uids would make the model disagree with the graph and force a
      // full reconcile, destroying every inbound block reference to those cells.
      if (minted.size) this.model?.history?.remapUids(minted);
      for (const cell of current) if (!desiredUids.has(cell.uid)) await deleteBlock(cell.uid);
      for (let rowIndex = 0; rowIndex < model.rowCount; rowIndex += 1) {
        const row = model.rows[rowIndex];
        await moveBlock(row[0].uid, this.tableUid, rowIndex);
        for (let col = 1; col < row.length; col += 1) await moveBlock(row[col].uid, row[col - 1].uid, 0);
      }
    } finally {
      try { await deleteBlock(stagingUid); } catch { /* best effort cleanup */ }
    }
  }

  dispose() { this.watchCallback = null; this.deferredStructuralWatches.length = 0; this.expectedStructuralTransitions.length = 0; this.selfWrites.clear(); return this.watch?.(); }
}

/**
 * Pending local values a conflict reload is about to throw away, as `[{uid, raw, baseRaw}]`.
 *
 * ORDERING IS THE WHOLE CONTRACT: this must run BEFORE `dirtyCells.clear()` and BEFORE
 * `replaceModel(externalModel)`. Afterwards the map is empty and the comparison is vacuous — it
 * would report zero discarded edits for every conflict. `test/undo-history.test.js` keeps a
 * positive control on that exact ordering.
 *
 * An entry whose pending value already equals the incoming one was not lost, so it is not captured.
 * A uid the incoming model no longer holds WAS lost, so it is captured here and skipped later by
 * `restoreDiscardedEdits`, which refuses to resurrect a block the external change deleted.
 */
export function captureDiscardedEdits(dirtyCells, externalModel, limit = MAX_DISCARDED_EDITS) {
  const incoming = new Map((externalModel.rows || []).flat().map((cell) => [cell.uid, cell.raw]));
  const edits = []; let truncated = 0;
  for (const change of dirtyCells.values()) {
    if (incoming.get(change.uid) === change.raw) continue;
    if (edits.length >= limit) { truncated += 1; continue; }
    edits.push({ uid: change.uid, raw: change.raw, baseRaw: change.baseRaw });
  }
  return { edits, truncated };
}

/**
 * The toast the reload offers, or `null` when there is nothing to offer or the user turned the
 * prompt off. Recovery is never bound to ⌘Z: a reload happens BECAUSE someone else wrote that cell,
 * so a reflex undo would put the remote value straight back under a local one. Restoring is an
 * explicit named act — this toast or the command palette — and it commits like any other edit.
 */
export function discardedRestorePrompt(record) {
  if (!record || !record.edits.length) return null;
  if (getSetting("conflict-restore-prompt") === false) return null;
  const count = record.edits.length;
  const capped = record.truncated ? ` ${record.truncated} older edit${record.truncated === 1 ? "" : "s"} could not be kept.` : "";
  return { message: `Roam Grid set aside ${count} unsaved edit${count === 1 ? "" : "s"} the reload discarded.${capped}`, label: "Restore", timeout: 12000 };
}

/** One canonical native-table model/persistence lane shared by every visible DOM instance. */
export class NativeGridSession {
  constructor(tableUid, { adapter = null, model = null, onIdle = null } = {}) {
    this.tableUid = tableUid;
    this.adapter = adapter || new NativeTableAdapter(tableUid);
    this.model = model || this.adapter.load();
    this.adapter.model = this.model;
    // The history is keyed by table uid and outlives this session on purpose:
    // unmount/remount must not silently throw the user's undo stack away.
    this.history = undoHistoryFor(tableUid) || this.model.history;
    this.model.history = this.history;
    this.onIdle = onIdle;
    this.views = new Set();
    this.themePalette = null;
    this.activeEditorView = null;
    this.changeVersion = 0;
    this.savedVersion = 0;
    this.saveTimer = null;
    this.idleTimer = null;
    this.metadataDirty = false;
    this.dirtyCells = new Map();
    this.editRevisions = new Map();
    this.structuralPending = false;
    this.contentSavePromise = null;
    this.referenceCounts = new Map();
    this.commentThreads = new Map();
    this.commentPageUid = null;
    this.referenceCountFrame = null;
    this.referenceCountTimer = null;
    this.discardedEdits = null;
    // Cell uids whose block is currently mounted in a `NativeCellEditorOverlay`. Roam writes a
    // native block through its own lane, so every keystroke can arrive as an external content
    // change; collecting those as novel undo entries would fill the history with per-keystroke noise.
    this.nativeOverlayUids = new Set();
    this.disposed = false;
    this.stopWatch = this.adapter.watchExternal?.((nextModel, event) => this.handleExternalChange(nextModel, event));
  }

  addView(view) {
    clearTimeout(this.idleTimer); this.idleTimer = null;
    view.session = this; view.model = this.model; view.adapter = this.adapter;
    view.referenceCounts = this.referenceCounts;
    view.commentThreads = this.commentThreads;
    this.views.add(view);
    return view;
  }

  removeView(view) {
    this.views.delete(view);
    if (this.activeEditorView === view) this.activeEditorView = null;
    if (!this.views.size) this.scheduleIdle();
  }

  scheduleIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.views.size) return;
      if (this.contentSavePromise || this.structuralPending || this.dirtyCells.size) return this.scheduleIdle();
      this.onIdle?.(this);
    }, getSetting("session-idle-ms"));
  }

  /** Re-arms an already-running idle timer against the new timeout; never starts one. */
  rescheduleIdle() { if (this.idleTimer != null) this.scheduleIdle(); }

  async beginEdit(view, start) {
    const previous = this.activeEditorView;
    if (previous && previous !== view) {
      // A live native overlay owns Roam's real block editor, so it has to be finished before another
      // view mounts one: two mounts of the same block fight over focus and the write-behind flush.
      if (previous.nativeOverlay?.active) await previous.nativeOverlay.commit(null);
      if (previous.editorController?.state) await previous.editorController.finish(true);
    }
    this.activeEditorView = view;
    return start();
  }

  editorFinished(view) { if (this.activeEditorView === view) this.activeEditorView = null; }

  /** Marks `uid` as owned by a native overlay for as long as Roam's editor is mounted over it. */
  beginNativeOverlayEdit(uid) { if (uid) this.nativeOverlayUids.add(uid); return this.nativeOverlayUids; }

  /**
   * Releases the overlay claim and, on a committing edit that actually changed the value, produces
   * the single undo entry for it. The overlay has already written the value to Roam and patched the
   * adapter base, so the cell is rewound to `beforeRaw` first: that is what makes `transact` record
   * a `setRaw` pair, and the patched base is what makes `queueChangedCells` drop the cell again
   * without issuing a second write.
   */
  endNativeOverlayEdit(uid, { beforeRaw = null, afterRaw = null, commit = false } = {}) {
    this.nativeOverlayUids.delete(uid);
    if (!commit || this.disposed) return null;
    const before = String(beforeRaw ?? ""); const after = String(afterRaw ?? "");
    if (before === after) return null;
    const coordinate = this.coordinateForUid(uid); if (!coordinate) return null;
    const cell = this.model.getCell(coordinate.row, coordinate.col); if (!cell) return null;
    return this.commitMutation(null, "Edit cell", (model) => {
      // The rewind lives INSIDE the transaction: the overlay already wrote `after` to the graph
      // and patched the adapter base, so if setRaw throws (e.g. the cell became merge-covered
      // mid-edit) #run restores its snapshot and the model keeps `after` — rewinding first would
      // strand the model at `before` while graph and base hold `after`.
      const target = model.getCell(coordinate.row, coordinate.col);
      if (!target || target.uid !== uid) return;
      target.raw = before;
      model.setRaw(coordinate.row, coordinate.col, after);
    }, false);
  }

  setSaving(value) { for (const view of this.views) view.root?.classList?.toggle("rg-root--saving", value); }

  scheduleReferenceCountRefresh() {
    if (this.disposed || this.referenceCountFrame != null || this.referenceCountTimer != null) return;
    const afterPaint = () => {
      this.referenceCountFrame = null;
      this.referenceCountTimer = setTimeout(() => {
        this.referenceCountTimer = null;
        this.refreshCellBadges();
      }, 0);
    };
    if (typeof globalThis.requestAnimationFrame === "function") this.referenceCountFrame = globalThis.requestAnimationFrame(afterPaint);
    else this.referenceCountTimer = setTimeout(() => { this.referenceCountTimer = null; this.refreshCellBadges(); }, 0);
  }

  refreshCellBadges() {
    const counts = this.refreshReferenceCounts();
    this.refreshCommentThreads();
    return counts;
  }

  refreshReferenceCounts() {
    if (this.disposed) return this.referenceCounts;
    const uids = this.model.rows.flat().map((cell) => cell.uid).filter(Boolean);
    let next;
    try { next = queryBlockReferenceCounts(uids); }
    catch (error) { console.warn("[roam-grid] Could not refresh cell reference counts", error); return this.referenceCounts; }
    const changed = new Set();
    for (const uid of new Set([...this.referenceCounts.keys(), ...next.keys()])) {
      if ((this.referenceCounts.get(uid) || 0) !== (next.get(uid) || 0)) changed.add(uid);
    }
    this.referenceCounts = next;
    for (const view of this.views) {
      view.referenceCounts = next;
      if (changed.size) view.updateReferenceCountBadges(changed);
    }
    return next;
  }

  /** Comment writes land on the page, not the table subtree, so the pull watch never sees them.  A
   *  thread merged optimistically by `addCellComment` makes this refresh diff to an empty set. */
  refreshCommentThreads() {
    if (this.disposed || !getSetting("comments-enabled")) return this.commentThreads;
    let next;
    try {
      this.commentPageUid = this.commentPageUid || blockPageUid(this.tableUid);
      next = this.commentPageUid ? queryCommentThreadIndex(this.commentPageUid) : new Map();
    } catch (error) { console.warn("[roam-grid] Could not refresh cell comment threads", error); return this.commentThreads; }
    const changed = diffCommentThreadIndex(this.commentThreads, next);
    this.commentThreads = next;
    for (const view of this.views) {
      view.commentThreads = next;
      // RangeGridView deliberately omits updateCommentBadges — this `?.` is what lets a range excerpt skip comment chrome. Keep it.
      if (changed.size) view.updateCommentBadges?.(changed);
    }
    this.lastCommentThreadChanges = changed;
    return next;
  }

  async writeCommentThread(targetUid, body) {
    const api = roam();
    const pageUid = blockPageUid(targetUid, api);
    if (!pageUid) throw new GridError("COMMENT_PAGE_UNKNOWN", "Could not resolve the page that holds this cell");
    const dateTitle = api.util?.dateToPageTitle?.(new Date());
    const plan = commentThreadPlan(getTree(pageUid), { pageUid, targetUid, dateTitle, authorTitle: commentAuthorTitle(api) });
    const applied = await applyCommentThreadPlan(plan, { body });
    // An empty body writes no comment block (`applyCommentThreadPlan` skips it), so merging the
    // anchor optimistically would invent a badge the next datalog refresh has to retract.
    if (applied.commentUid) {
      mergeCommentThread(this.commentThreads, String(targetUid), applied.anchorUid);
      for (const view of this.views) {
        view.commentThreads = this.commentThreads;
        // RangeGridView deliberately omits updateCommentBadges — this `?.` is what lets a range excerpt skip comment chrome. Keep it.
        view.updateCommentBadges?.([String(targetUid)]);
      }
    }
    return applied;
  }

  async addCellComment(targetUid, body) {
    return this.writeCommentThread(targetUid, body);
  }

  /** Creates the container → date → author → anchor chain with no body; a composer fills it in. */
  async ensureCommentThread(targetUid) {
    return this.writeCommentThread(targetUid, "");
  }

  /** Sidebar compose needs the thread on the page before Roam can focus a comment block in it. */
  async beginSidebarComment(targetUid) {
    const applied = await this.ensureCommentThread(targetUid);
    const anchorUid = applied.anchorUid;
    const children = getTree(anchorUid)?.children || [];
    const last = children[children.length - 1];
    // A reused trailing empty block pre-existed this gesture: the abandon sweep must not delete it,
    // so the provenance travels with the result as `createdBody`.
    const reused = Boolean(last) && !String(last.string ?? "").trim();
    const bodyUid = reused
      ? String(last.uid)
      : String(await createBlock(anchorUid, "", "last"));
    return { ...applied, anchorUid, bodyUid, createdBody: !reused };
  }

  replaceModel(model, { render = true } = {}) {
    this.model = model; this.adapter.model = model;
    if (this.history) model.history = this.history;
    for (const view of this.views) {
      view.model = model;
      if (render) view.render();
    }
    return model;
  }

  renderStructural(contexts = null) {
    for (const view of this.views) {
      let patched = false;
      try { patched = view.patchRowDeletion(contexts?.get(view) || null); }
      catch (error) { console.warn("[roam-grid] Incremental row deletion failed; using a full render", error); }
      if (!patched) view.render();
    }
  }

  refreshValues() { for (const view of this.views) view.refreshValues(); }

  commitMutation(sourceView, label, mutation, structural, { rowDeletion = false } = {}) {
    try {
      const contexts = structural && rowDeletion ? new Map([...this.views].map((view) => [view, view.captureRowDeletionContext()])) : null;
      this.model.transact(label, mutation);
      claimKeyboard(sourceView);
      if (!structural && !(this.model.lastChangedCells || []).length) return Promise.resolve(this.model);
      if (structural) this.renderStructural(contexts); else this.refreshValues();
      if (!structural) this.queueChangedCells();
      this.markChanged(structural);
      globalThis.window?.dispatchEvent(new CustomEvent("roam-grid:changed", { detail: { tableUid: this.tableUid, label } }));
      return Promise.resolve(this.model);
    } catch (error) {
      toast(error.message, "danger");
      return Promise.resolve(null);
    }
  }

  queueChangedCells() {
    for (const [row, col] of this.model.lastChangedCells || []) {
      const cell = this.model.getCell(row, col); if (!cell?.uid) continue;
      const revision = (this.editRevisions.get(cell.uid) || 0) + 1;
      this.editRevisions.set(cell.uid, revision);
      const existing = this.dirtyCells.get(cell.uid);
      const baseRaw = existing?.baseRaw ?? this.adapter.getBaseRaw?.(cell.uid) ?? cell.raw;
      if (cell.raw === baseRaw) this.dirtyCells.delete(cell.uid);
      else this.dirtyCells.set(cell.uid, { uid: cell.uid, baseRaw, raw: cell.raw, revision });
    }
  }

  markChanged(layoutChanged = false) {
    this.changeVersion += 1;
    this.metadataDirty ||= layoutChanged; this.structuralPending ||= layoutChanged;
    clearTimeout(this.saveTimer);
    // A content-lane change landing behind a pending structural one must neither cancel nor
    // downgrade the structural flush: flushSave persists the whole snapshot, content included.
    // Advancing savedVersion here would let flushSave's up-to-date guard swallow that save.
    if (!layoutChanged && !this.dirtyCells.size && !this.structuralPending) { this.savedVersion = this.changeVersion; return; }
    const structural = this.structuralPending;
    this.saveTimer = setTimeout(() => structural ? this.flushSave() : this.flushContentSave(), structural ? 0 : getSetting("writes-content-debounce-ms"));
  }

  coordinateForUid(uid) {
    for (let row = 0; row < this.model.rowCount; row += 1) for (let col = 0; col < this.model.colCount; col += 1) {
      if (this.model.getCell(row, col)?.uid === uid) return { row, col };
    }
    return null;
  }

  prunePersistenceUids() {
    const valid = new Set(this.model.rows.flat().map((cell) => cell.uid));
    for (const uid of this.dirtyCells.keys()) if (!valid.has(uid)) this.dirtyCells.delete(uid);
    for (const uid of this.editRevisions.keys()) if (!valid.has(uid)) this.editRevisions.delete(uid);
  }

  async flushContentSave() {
    if (this.disposed) return;
    if (this.structuralPending) {
      // Never strand a pending structural flush: the structural lane persists this content too,
      // and an early return with no reschedule stops all persistence.
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.flushSave(), 0);
      return;
    }
    if (!this.dirtyCells.size) return;
    if (this.contentSavePromise) return this.contentSavePromise;
    const batch = new Map([...this.dirtyCells].map(([uid, change]) => [uid, { ...change }]));
    const task = this.adapter.saveContent(batch); this.contentSavePromise = task;
    try {
      const result = await task;
      for (const saved of result.saved || []) {
        const coordinate = this.coordinateForUid(saved.uid);
        const currentRaw = coordinate ? this.model.getRaw(coordinate.row, coordinate.col) : null;
        const revision = this.editRevisions.get(saved.uid) || saved.revision;
        if (currentRaw == null || currentRaw === saved.raw) this.dirtyCells.delete(saved.uid);
        else this.dirtyCells.set(saved.uid, { uid: saved.uid, baseRaw: saved.raw, raw: currentRaw, revision });
      }
      for (const uid of result.skipped || []) {
        // saveContent skips a change whose raw already equals its base (a flushSave reconcile can
        // leave exactly that behind); keeping it would re-arm the debounce forever.
        const dirty = this.dirtyCells.get(uid);
        if (dirty && dirty.raw === dirty.baseRaw) this.dirtyCells.delete(uid);
      }
      this.scheduleReferenceCountRefresh();
      if (!this.dirtyCells.size && !this.structuralPending) this.savedVersion = this.changeVersion;
    } catch (error) {
      toast(error.message, "danger", 8000);
      // Capture BEFORE the clear/reload, exactly like the conflict lanes: a failed save must set
      // the pending edits aside for restore, never silently destroy them.
      let reloaded = null;
      try { reloaded = this.adapter.load(); } catch { /* table may have disappeared */ }
      const discarded = captureDiscardedEdits(this.dirtyCells, reloaded || { rows: [] });
      this.dirtyCells.clear(); this.structuralPending = false; this.metadataDirty = false;
      this.history?.invalidateRedo("content-save-error");
      if (reloaded) { this.replaceModel(reloaded); this.changeVersion = this.savedVersion; }
      this.rememberDiscardedEdits(discarded);
    } finally {
      if (this.contentSavePromise === task) this.contentSavePromise = null;
      if (!this.disposed && !this.structuralPending && this.dirtyCells.size) {
        clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.flushContentSave(), getSetting("writes-content-debounce-ms"));
      }
    }
  }

  async flushSave() {
    if (this.disposed || !this.structuralPending || this.savedVersion === this.changeVersion) return;
    const version = this.changeVersion;
    const payload = new GridModel({ ...this.model.snapshot(), tableUid: this.tableUid });
    const pendingUids = payload.rows.map((row) => row.map((cell) => cell.uid));
    const payloadRawByUid = new Map(payload.rows.flat().map((cell) => [cell.uid, cell.raw]));
    const payloadEditRevisions = new Map(this.editRevisions);
    payload.baseFingerprint = this.model.baseFingerprint; payload.baseSnapshot = this.model.baseSnapshot;
    const saveMetadata = this.metadataDirty; this.metadataDirty = false; this.setSaving(true);
    try {
      const saved = await this.adapter.save(payload, { saveMetadata });
      this.savedVersion = version;
      const uidMap = new Map();
      for (let row = 0; row < Math.min(pendingUids.length, saved.rowCount); row += 1) for (let col = 0; col < Math.min(pendingUids[row].length, saved.colCount); col += 1) {
        if (pendingUids[row][col] !== saved.rows[row][col].uid) uidMap.set(pendingUids[row][col], saved.rows[row][col].uid);
      }
      for (const row of this.model.rows) for (let col = 0; col < row.length; col += 1) {
        const oldUid = row[col].uid; const newUid = uidMap.get(oldUid); if (!newUid) continue;
        row[col].uid = newUid;
        if (col === 0 && Object.hasOwn(this.model.rowHeights, oldUid)) { this.model.rowHeights[newUid] = this.model.rowHeights[oldUid]; delete this.model.rowHeights[oldUid]; }
        if (Object.hasOwn(this.model.alignments, oldUid)) { this.model.alignments[newUid] = this.model.alignments[oldUid]; delete this.model.alignments[oldUid]; }
      }
      for (const [oldUid, newUid] of uidMap) {
        if (this.dirtyCells.has(oldUid)) { const dirty = this.dirtyCells.get(oldUid); this.dirtyCells.delete(oldUid); this.dirtyCells.set(newUid, { ...dirty, uid: newUid }); }
        if (this.editRevisions.has(oldUid)) { this.editRevisions.set(newUid, this.editRevisions.get(oldUid)); this.editRevisions.delete(oldUid); }
        if (payloadRawByUid.has(oldUid)) payloadRawByUid.set(newUid, payloadRawByUid.get(oldUid));
        if (payloadEditRevisions.has(oldUid)) payloadEditRevisions.set(newUid, payloadEditRevisions.get(oldUid));
      }
      if (uidMap.size) this.history?.remapUids(uidMap);
      this.prunePersistenceUids();
      this.model.baseFingerprint = saved.baseFingerprint; this.model.baseSnapshot = saved.baseSnapshot; this.adapter.model = this.model;
      for (const [uid, dirty] of [...this.dirtyCells]) {
        // A value match drains the entry regardless of revision: the graph already holds the
        // pending value, so keeping the entry would re-arm the content saver forever.
        if (dirty.raw === payloadRawByUid.get(uid)) this.dirtyCells.delete(uid);
        else if (payloadRawByUid.has(uid)) this.dirtyCells.set(uid, { ...dirty, baseRaw: payloadRawByUid.get(uid) });
      }
      this.structuralPending = false;
      if (uidMap.size) for (const view of this.views) view.render();
      if (version !== this.changeVersion) {
        clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.structuralPending ? this.flushSave() : this.flushContentSave(), getSetting("writes-content-debounce-ms"));
      }
    } catch (error) {
      this.metadataDirty ||= saveMetadata;
      toast(error.message, "danger", 8000);
      // Capture BEFORE the clear/reload, exactly like the conflict lanes: a failed save must set
      // the pending edits aside for restore, never silently destroy them.
      let reloaded = null;
      try { reloaded = this.adapter.load(); } catch { /* table may have disappeared */ }
      const discarded = captureDiscardedEdits(this.dirtyCells, reloaded || { rows: [] });
      this.dirtyCells.clear(); this.structuralPending = false;
      this.history?.invalidateRedo("structural-save-error");
      if (reloaded) { this.replaceModel(reloaded); this.changeVersion = this.savedVersion; }
      this.rememberDiscardedEdits(discarded);
    } finally { this.setSaving(false); }
  }

  handleExternalChange(externalModel, event) {
    const localPending = this.structuralPending || this.dirtyCells.size > 0 || this.contentSavePromise;
    if (event.structural || event.type === "structural") {
      const discarded = captureDiscardedEdits(this.dirtyCells, externalModel);
      this.dirtyCells.clear(); this.structuralPending = false; this.metadataDirty = false;
      clearTimeout(this.saveTimer); this.changeVersion = this.savedVersion;
      // Truncate to the entries recorded under the incoming shape instead of
      // letting `replaceModel` implicitly discard the whole history.
      this.history?.onExternalStructural(externalModel);
      this.replaceModel(externalModel, { render: false }); this.adapter.acceptExternalTree?.(event.tree, this.model); this.renderStructural();
      if (localPending || event.conflict) toast("Roam Grid reloaded because the table structure changed elsewhere.", "warning");
      this.rememberDiscardedEdits(discarded);
      return;
    }
    const conflicts = (event.changes || []).filter((change) => this.dirtyCells.has(change.uid));
    if (conflicts.length) {
      const discarded = captureDiscardedEdits(this.dirtyCells, externalModel);
      // The reload adopts the graph's values wholesale, so every external change it
      // brings in — not just the conflicting subset — must be marked stale first.
      // Otherwise a later undo silently overwrites a value someone else wrote, the
      // same failure the merge and checkpoint paths already refuse.
      this.history?.onExternalContent((event.changes || []).filter((change) => {
        const coordinate = this.coordinateForUid(change.uid); if (!coordinate) return false;
        return this.model.getCell(coordinate.row, coordinate.col)?.raw !== change.raw;
      }));
      this.dirtyCells.clear(); this.structuralPending = false; clearTimeout(this.saveTimer); this.changeVersion = this.savedVersion;
      this.replaceModel(externalModel, { render: false }); this.adapter.acceptExternalTree?.(event.tree, this.model); this.renderStructural();
      toast("Roam Grid reloaded because this cell changed elsewhere.", "warning");
      this.rememberDiscardedEdits(discarded);
      return;
    }
    const rebasable = this.history?.rebasableUids() || new Set();
    const changed = []; const novel = []; const effective = [];
    for (const change of event.changes || []) {
      const coordinate = this.coordinateForUid(change.uid); if (!coordinate) continue;
      const cell = this.model.getCell(coordinate.row, coordinate.col); if (!cell || cell.raw === change.raw) continue;
      // A block mounted in a native overlay is being typed into through Roam's own editor, so each
      // flush arrives here as an external change. Those are the user's in-flight keystrokes, not a
      // novel edit from elsewhere: the single undo entry is pushed by `endNativeOverlayEdit`, and
      // they must not mark prior history entries stale either — that would stop ⌘Z from rewinding
      // an earlier grid edit after an overlay edit lands.
      const overlayOwned = this.nativeOverlayUids?.has?.(cell.uid) === true;
      if (!overlayOwned) effective.push(change);
      if (!rebasable.has(cell.uid) && !overlayOwned) novel.push({ uid: cell.uid, from: cell.raw, to: change.raw });
      cell.raw = change.raw; changed.push([coordinate.row, coordinate.col]);
    }
    // Only changes that actually moved a cell reach the history: an echo that
    // reports the value we already hold must not mark an entry stale.
    this.history?.onExternalContent(effective);
    const externalEntry = this.history && novel.length ? externalContentUndoEntry(this.model, novel) : null;
    if (externalEntry) this.history.pushUndo(externalEntry);
    this.model.lastChangedCells = changed;
    this.model.lastChangedCellUids = changed.map(([row, col]) => this.model.getCell(row, col)?.uid).filter(Boolean);
    this.adapter.acceptExternalTree?.(event.tree, this.model, externalModel);
    if (changed.length) this.refreshValues();
  }

  /** Holds one payload at a time: the next discard supersedes it, and `dispose` drops it. */
  rememberDiscardedEdits({ edits, truncated }) {
    this.discardedEdits = edits.length ? { tableUid: this.tableUid, edits, truncated } : null;
    if (!this.discardedEdits) return false;
    return this.promptDiscardedEdits(this.discardedEdits);
  }

  promptDiscardedEdits(record) {
    const prompt = discardedRestorePrompt(record);
    if (!prompt) return false;
    toast(prompt.message, "warning", prompt.timeout, { action: { label: prompt.label, onClick: () => this.restoreDiscardedEdits() } });
    return true;
  }

  /** Re-applies the set-aside values ON TOP OF the reloaded model through `commitMutation`, so the
   *  overwrite is the user's deliberate choice, is persisted like any edit, and is itself undoable. */
  restoreDiscardedEdits() {
    const record = this.discardedEdits;
    if (!record || !record.edits.length) { toast("Roam Grid has no discarded edits to restore.", "warning"); return { restored: 0, skipped: 0 }; }
    this.discardedEdits = null;
    const targets = []; let skipped = 0;
    for (const edit of record.edits) {
      const coordinate = this.coordinateForUid(edit.uid);
      // The external change deleted that row, or a merge now covers the cell. Skip and count it —
      // restoring must never resurrect a block someone else removed.
      if (!coordinate || this.model.isCovered(coordinate.row, coordinate.col)) { skipped += 1; continue; }
      targets.push({ row: coordinate.row, col: coordinate.col, raw: edit.raw });
    }
    if (targets.length) this.commitMutation(null, "Restore discarded edits", (model) => { for (const target of targets) model.setRaw(target.row, target.col, target.raw); }, false);
    const tail = skipped ? ` ${skipped} could not be placed — the reload removed those cells.` : "";
    if (targets.length) toast(`Restored ${targets.length} discarded edit${targets.length === 1 ? "" : "s"}.${tail}`, "success");
    else toast(`No discarded edit could be placed — the reload removed those ${skipped} cell${skipped === 1 ? "" : "s"}.`, "warning");
    return { restored: targets.length, skipped };
  }

  undo() {
    const entry = this.history?.popUndo();
    if (!entry) return false;
    const applied = this.model.transactSilently(() => this.history.applyInverse(this.model, entry));
    this.history.pushRedo(entry);
    return this.settleHistoryApply(entry, applied);
  }

  redo() {
    const entry = this.history?.popRedo();
    if (!entry) return false;
    const applied = this.model.transactSilently(() => this.history.applyForward(this.model, entry));
    this.history.pushUndo(entry);
    return this.settleHistoryApply(entry, applied);
  }

  settleHistoryApply(entry, applied) {
    this.model.lastChangedCells = applied.changedCoordinates;
    this.model.lastChangedCellUids = applied.changedUids;
    if (applied.structural) { this.renderStructural(); this.prunePersistenceUids(); }
    else this.refreshValues();
    // `queueChangedCells` deletes any dirty entry whose raw is back at its base,
    // so this is what stops the next keystroke from re-flushing the undone value.
    this.queueChangedCells();
    this.metadataDirty ||= entry.metadata;
    this.markChanged(applied.structural);
    const kept = applied.result?.dropped?.length || 0;
    if (kept) toast(`${kept} cell${kept === 1 ? "" : "s"} changed elsewhere and ${kept === 1 ? "was" : "were"} kept.`, "warning");
    return true;
  }

  applyPatch(patch, sourceView = this.views.values().next().value || null) {
    const patches = Array.isArray(patch) ? patch : [patch];
    const rowDeletion = patches.length > 0 && patches.every((item) => item?.op === "deleteRows");
    return this.commitMutation(sourceView, "External patch", () => applyPatchToModel(this.model, patch, false), patchChangesLayout(patch), { rowDeletion }).then(() => this.model.toJSON());
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; clearTimeout(this.saveTimer); clearTimeout(this.idleTimer);
    clearTimeout(this.referenceCountTimer);
    if (this.referenceCountFrame != null) globalThis.cancelAnimationFrame?.(this.referenceCountFrame);
    this.adapter.dispose?.(); this.stopWatch = null; this.views.clear(); this.activeEditorView = null; this.dirtyCells.clear(); this.discardedEdits = null;
  }
}

function extractUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s)\]}]+/);
  return match?.[0] || String(value || "").trim();
}

async function uploadText(text, name) {
  const file = new File([text], name, { type: "application/json" });
  return extractUrl(await roam().file.upload({ file, toast: { hide: true } }));
}

async function uploadJson(value, name) { return uploadText(JSON.stringify(value), name); }

/**
 * Downloading and parsing are separate steps on purpose: a response truncated in transit can still
 * be valid JSON carrying the right schema, version and index, so every check that runs on the
 * parsed object waves it through. Integrity is decided on these raw bytes, before `JSON.parse`.
 */
async function downloadFileText(url) {
  const file = await roam().file.get({ url });
  return file.text();
}

async function downloadJson(url) { return JSON.parse(await downloadFileText(url)); }

/**
 * `roamAlphaAPI.file.delete` is confirmed to exist, but what it does when the url is already gone is
 * not — so a rejection is reported rather than read as "already deleted". The caller keeps failures
 * in `garbage` and retries them next session: a leaked file is recoverable and a deleted one is not.
 */
async function deleteFile(url) {
  try { await roam().file.delete({ url }); return true; }
  catch { return false; }
}

/**
 * The whole of the concurrency story: a fixed number of runners pulling from one shared cursor, so
 * the peak number of `worker` calls actually in flight is the limit and not the item count. Results
 * land at their input index rather than in completion order — that is what keeps a chunk's digest
 * attached to the chunk it was computed from when four uploads are running at once.
 */
export async function mapWithConcurrency(items, limit, worker) {
  const values = [...items];
  const results = new Array(values.length);
  let cursor = 0;
  const runner = async () => { while (cursor < values.length) { const index = cursor; cursor += 1; results[index] = await worker(values[index], index); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, values.length)) }, runner));
  return results;
}

const CHUNK_DIGEST_RETRIES = 3;

/** Bounded exponential backoff; instance-overridable on the store so tests do not sleep. */
export function chunkRetryDelayMs(attempt) { return Math.min(1000, 150 * 2 ** attempt); }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `crypto.subtle` is a verified capability of the Roam renderer and is real in Node, so this is
 * never a stub in practice. An absent one still degrades quietly to `null`: no digest is recorded
 * on upload and none is demanded on download, which is exactly how a pre-0.9.0 chunk behaves.
 */
export async function sha256Hex(text) {
  const subtle = globalThis.crypto?.subtle;
  if (typeof subtle?.digest !== "function") return null;
  const buffer = await subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Only a well-formed hex digest is a claim worth enforcing; anything else is a legacy chunk. */
export function chunkDigestOf(descriptor) {
  const value = descriptor?.digest;
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

/**
 * A cached body earns no more trust than a downloaded one: it goes through the same digest check and
 * the same parse, and anything that fails either is not a hit. Returns the parsed chunk or `null`.
 */
async function parseVerifiedChunk(text, expected) {
  if (expected) {
    const actual = await sha256Hex(text);
    if (actual !== null && actual !== expected) return null;
  }
  try { return JSON.parse(text); } catch { return null; }
}

function idbResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function idbSettled(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

/**
 * Bodies and their sizes live in separate stores so the byte budget can be rebuilt at open time from
 * a small index instead of reading every cached chunk back into memory to find out how big it is.
 */
export class IndexedDbBackend {
  constructor(db) { this.db = db; }

  static async open(factory = globalThis.indexedDB, timeoutMs = CHUNK_CACHE_OPEN_MS) {
    if (typeof factory?.open !== "function") return null;
    const request = factory.open(CHUNK_CACHE_DB, CHUNK_CACHE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHUNK_CACHE_BODIES)) db.createObjectStore(CHUNK_CACHE_BODIES);
      if (!db.objectStoreNames.contains(CHUNK_CACHE_META)) db.createObjectStore(CHUNK_CACHE_META);
    };
    // A version-change block from another tab leaves `open` pending indefinitely, and a large grid
    // must never wait on its own cache to finish mounting.
    let timer = null;
    const timeout = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error("IndexedDB open timed out")), timeoutMs); });
    try { return new IndexedDbBackend(await Promise.race([idbResult(request), timeout])); }
    finally { clearTimeout(timer); }
  }

  async get(url) {
    const stored = await idbResult(this.db.transaction(CHUNK_CACHE_BODIES, "readonly").objectStore(CHUNK_CACHE_BODIES).get(url));
    return stored ?? null;
  }

  async put(url, text, meta) {
    const transaction = this.db.transaction([CHUNK_CACHE_BODIES, CHUNK_CACHE_META], "readwrite");
    transaction.objectStore(CHUNK_CACHE_BODIES).put(text, url);
    transaction.objectStore(CHUNK_CACHE_META).put(meta, url);
    return idbSettled(transaction);
  }

  async delete(url) {
    const transaction = this.db.transaction([CHUNK_CACHE_BODIES, CHUNK_CACHE_META], "readwrite");
    transaction.objectStore(CHUNK_CACHE_BODIES).delete(url);
    transaction.objectStore(CHUNK_CACHE_META).delete(url);
    return idbSettled(transaction);
  }

  async entries() {
    const store = this.db.transaction(CHUNK_CACHE_META, "readonly").objectStore(CHUNK_CACHE_META);
    const [keys, values] = await Promise.all([idbResult(store.getAllKeys()), idbResult(store.getAll())]);
    return keys.map((url, index) => [url, values[index]]);
  }

  close() { this.db.close(); }
}

/** The test-facing backend: the same contract as IndexedDB with none of the environment. */
export class MemoryBackend {
  constructor() { this.bodies = new Map(); this.meta = new Map(); }
  async get(url) { return this.bodies.has(url) ? this.bodies.get(url) : null; }
  async put(url, text, meta) { this.bodies.set(url, text); this.meta.set(url, meta); return true; }
  async delete(url) { this.bodies.delete(url); this.meta.delete(url); return true; }
  async entries() { return [...this.meta]; }
  close() {}
}

/** Private browsing, a revoked quota, a corrupted database: every method rejects, including close. */
export class ThrowingBackend {
  async get() { throw new Error("chunk cache backend unavailable"); }
  async put() { throw new Error("chunk cache backend unavailable"); }
  async delete() { throw new Error("chunk cache backend unavailable"); }
  async entries() { throw new Error("chunk cache backend unavailable"); }
  close() { throw new Error("chunk cache backend unavailable"); }
}

export function chunkCacheMaxBytes() {
  const megabytes = Number(getSetting("large-cache-max-mb"));
  return (Number.isFinite(megabytes) && megabytes > 0 ? megabytes : DEFAULT_LARGE_CACHE_MB) * 1024 * 1024;
}

/**
 * Every upload mints a fresh url, so a chunk url addresses exactly one immutable body: an entry is
 * never stale, only superseded, and nothing here ever needs invalidating. That leaves one failure
 * mode — the backend not working — and the answer to it is to switch the whole cache off. With
 * `available` false every method is a no-op returning what "no cached copy" returns, which is
 * byte-for-byte how the store behaved before this class existed. No method can throw or reject.
 */
export class ChunkCache {
  constructor(backend = null, maxBytes = 0) {
    this.backend = backend || null;
    this.available = Boolean(backend);
    this.maxBytes = maxBytes;
    this.index = new Map();
    this.bytes = 0;
    this.clock = 0;
  }

  static disabled() { return new ChunkCache(null, 0); }

  /** `undefined` builds the real IndexedDB backend; an explicit `null` yields a disabled cache. */
  static async open(backend = undefined, maxBytes = chunkCacheMaxBytes()) {
    let resolved = backend;
    if (resolved === undefined) resolved = getSetting("large-cache-enabled") ? await IndexedDbBackend.open().catch(() => null) : null;
    const cache = new ChunkCache(resolved, maxBytes);
    await cache.hydrate();
    return cache;
  }

  disable() {
    const backend = this.backend;
    this.available = false; this.backend = null; this.index.clear(); this.bytes = 0;
    try { backend?.close?.(); } catch { /* a backend that cannot be closed is already gone */ }
  }

  /** The single place a backend rejection becomes "this cache no longer exists". */
  async attempt(operation, fallback = null) {
    if (!this.available) return fallback;
    try { return await operation(this.backend); } catch { this.disable(); return fallback; }
  }

  async hydrate() {
    for (const [url, meta] of (await this.attempt((backend) => backend.entries(), [])) || []) {
      const bytes = Number(meta?.bytes);
      if (typeof url !== "string" || !Number.isFinite(bytes) || bytes < 0) continue;
      const at = Number.isFinite(Number(meta?.at)) ? Number(meta.at) : 0;
      this.index.set(url, { bytes, at });
      this.bytes += bytes;
      this.clock = Math.max(this.clock, at);
    }
    await this.enforceBudget();
    return this;
  }

  async get(url) {
    const text = await this.attempt((backend) => backend.get(url));
    if (typeof text !== "string") return null;
    const entry = this.index.get(url);
    if (entry) entry.at = ++this.clock;
    return text;
  }

  async put(url, text) {
    if (!this.available || typeof url !== "string" || typeof text !== "string") return false;
    // Sizes are counted in characters, a stable proxy for the stored body that costs no encoding.
    // A body larger than the whole budget would evict everything and still not fit, so it is simply
    // not cached — the download path is unaffected either way.
    const bytes = text.length;
    if (bytes > this.maxBytes) return false;
    const at = ++this.clock;
    if (!await this.attempt(async (backend) => { await backend.put(url, text, { bytes, at }); return true; }, false)) return false;
    this.bytes += bytes - (this.index.get(url)?.bytes || 0);
    this.index.set(url, { bytes, at });
    await this.enforceBudget();
    return true;
  }

  async delete(url) {
    const entry = this.index.get(url);
    if (!await this.attempt(async (backend) => { await backend.delete(url); return true; }, false)) return false;
    this.index.delete(url);
    this.bytes -= entry?.bytes || 0;
    return true;
  }

  /** Least-recently-used first. A backend that starts failing mid-eviction stops the loop, not the caller. */
  async enforceBudget() {
    if (!this.available || this.bytes <= this.maxBytes) return 0;
    let evicted = 0;
    for (const [url] of [...this.index].sort((left, right) => left[1].at - right[1].at)) {
      if (this.bytes <= this.maxBytes) break;
      if (!await this.delete(url)) break;
      evicted += 1;
    }
    return evicted;
  }

  close() { this.disable(); }
}

let chunkCachePromise = null;

/** One connection per page, shared by every open large grid and torn down with the extension. */
export function sharedChunkCache() {
  chunkCachePromise ||= ChunkCache.open();
  return chunkCachePromise;
}

/** Swaps the shared cache, closing whatever it replaces. Tests inject; `onunload` passes nothing. */
export function resetChunkCache(replacement = null) {
  const previous = chunkCachePromise;
  chunkCachePromise = replacement;
  void Promise.resolve(previous).then((cache) => cache?.close?.()).catch(() => { /* a cache that cannot close is already gone */ });
}

function rawRows(model) {
  return model.rows.map((row) => row.map((cell) => cell.raw));
}

function rowHeightsForManifest(model, chunkRows, revision) {
  const rowHeights = {};
  for (let row = 0; row < model.rowCount; row += 1) {
    const height = model.getRowHeight(row);
    if (height != null) rowHeights[deriveRowId(revision, Math.floor(row / chunkRows), row % chunkRows)] = height;
  }
  return rowHeights;
}

function applyManifestRowHeights(model, rowHeights = {}) {
  for (const [row, height] of Object.entries(rowHeights)) {
    const index = Number(row);
    if (Number.isInteger(index) && index >= 0 && index < model.rowCount) model.setRowHeight(index, height);
  }
  return model;
}

function alignmentsForManifest(model, chunkRows, revision) {
  const alignments = {};
  for (let row = 0; row < model.rowCount; row += 1) for (let col = 0; col < model.colCount; col += 1) {
    const value = model.alignments[model.getCell(row, col).uid];
    if (value) alignments[alignmentKey(deriveRowId(revision, Math.floor(row / chunkRows), row % chunkRows), model.columnIds[col])] = value;
  }
  return alignments;
}

function applyManifestAlignments(model, alignments = {}) {
  for (const [coordinate, alignment] of Object.entries(alignments)) {
    const [row, col] = coordinate.split(":").map(Number);
    if (Number.isInteger(row) && Number.isInteger(col) && model.inBounds(row, col)) model.setAlignment(row, col, alignment);
  }
  return model;
}

/**
 * A streamed copy's answer to `rowHeightsForManifest`. It re-keys the source's overrides straight
 * into the destination revision's id namespace, which costs one pass over the overrides instead of
 * one pass over every row — the rows of a grid this path exists for are deliberately never all in
 * memory at once. Clamping matches `GridModel.getRowHeight`, which is what produced these values in
 * the accumulating version.
 */
function copiedRowHeights(source, chunkRows, revision, rowCount) {
  const heights = {};
  for (const [key, height] of Object.entries(source.rowHeightIndexMap())) {
    const row = Number(key);
    const value = Number(height);
    if (!Number.isInteger(row) || row < 0 || row >= rowCount || !Number.isFinite(value)) continue;
    heights[deriveRowId(revision, Math.floor(row / chunkRows), row % chunkRows)] = clamp(Math.round(value), getSetting("sizing-min-row-height"), getSetting("sizing-max-row-height"));
  }
  return heights;
}

/** The same trade for alignments, resolving each onto its merge anchor exactly as a model would. */
function copiedAlignments(source, columnIds, chunkRows, revision, rowCount) {
  const alignments = {};
  for (const [key, alignment] of Object.entries(source.alignmentIndexMap())) {
    const [row, col] = String(key).split(":").map(Number);
    if (!Number.isInteger(row) || row < 0 || row >= rowCount || !Number.isInteger(col) || col < 0 || !["left", "center", "right"].includes(alignment)) continue;
    const merge = source.mergeAt(row, col);
    const anchorRow = merge?.row ?? row;
    const columnId = columnIds[merge?.col ?? col];
    if (columnId) alignments[alignmentKey(deriveRowId(revision, Math.floor(anchorRow / chunkRows), anchorRow % chunkRows), columnId)] = alignment;
  }
  return alignments;
}

/**
 * Chunk size is a property of the manifest, never a live global: `chunkIndexForRow` and `loadChunk`
 * derive addresses from it, so changing it under an existing manifest misaddresses every chunk.
 * Manifests written before it was recorded are always 500 — the setting only seeds new grids.
 */
export function chunkRowsFor(manifest) {
  const raw = manifest?.chunkRows;
  if (typeof raw !== "number" && typeof raw !== "string") return CHUNK_ROWS;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : CHUNK_ROWS;
}

/**
 * Row ids are *derived* from position, never minted: two clients that migrate the same v1 manifest
 * independently produce byte-identical ids without exchanging anything, which is what lets a later
 * disjoint-chunk merge trust that their per-row state describes the same rows. A chunk is therefore
 * never uploaded just to carry ids — they ride along the next time its cells change, and until then
 * every reader re-derives them.
 */
export function deriveRowId(revision, chunkIndex, localIndex) { return `r_${revision}_${chunkIndex}_${localIndex}`; }

export function parseRowId(rowId, revision) {
  const prefix = `r_${revision}_`;
  if (typeof rowId !== "string" || !rowId.startsWith(prefix)) return null;
  const tail = rowId.slice(prefix.length);
  const split = tail.lastIndexOf("_");
  if (split <= 0) return null;
  const chunk = Number(tail.slice(0, split));
  const local = Number(tail.slice(split + 1));
  if (!Number.isInteger(chunk) || chunk < 0 || !Number.isInteger(local) || local < 0) return null;
  return { chunk, local };
}

/**
 * A stored id wins at every position it covers and the rest are derived, so a chunk that has never
 * been rewritten still resolves and a chunk whose rows moved keeps the ids its rows carried.
 */
export function synthesizeChunkRowIds(chunk, revision, length = chunk?.rows?.length ?? 0) {
  const stored = Array.isArray(chunk?.rowIds) ? chunk.rowIds : [];
  const index = Number.isInteger(chunk?.index) ? chunk.index : 0;
  return Array.from({ length }, (_, local) => (typeof stored[local] === "string" && stored[local] ? stored[local] : deriveRowId(revision, index, local)));
}

export function alignmentKey(rowId, columnId) { return `${rowId}::${columnId}`; }

export function splitAlignmentKey(key) {
  const split = String(key).lastIndexOf("::");
  return split <= 0 ? null : { rowId: String(key).slice(0, split), columnId: String(key).slice(split + 2) };
}

/** The id namespace is pinned once and carried forward, so a later revision never re-derives ids. */
export function rowIdRevisionFor(manifest) {
  for (const candidate of [manifest?.rowIdRevision, manifest?.revision]) if (typeof candidate === "string" && candidate) return candidate;
  return "v1";
}

/**
 * v1 keyed `rowHeights` by array index and `alignments` by `"row:col"` — rule-10 positional state
 * that a single row insert silently reassigns to whichever row slides into the vacated index. v2
 * keys both by stable id and keeps the original maps verbatim as `*ByIndex`, so nothing is lost and
 * the migration is a pure function of the v1 manifest.
 */
export function migrateManifestToV2(manifest) {
  const chunkRows = chunkRowsFor(manifest);
  const revision = rowIdRevisionFor(manifest);
  const columnIds = Array.isArray(manifest.columnIds) ? manifest.columnIds : [];
  const rowHeightsByIndex = { ...manifest.rowHeightsByIndex, ...manifest.rowHeights };
  const alignmentsByIndex = { ...manifest.alignmentsByIndex, ...manifest.alignments };
  const idFor = (row) => deriveRowId(revision, Math.floor(row / chunkRows), row % chunkRows);
  const rowHeights = {};
  for (const [key, value] of Object.entries(rowHeightsByIndex)) {
    const row = Number(key);
    if (Number.isInteger(row) && row >= 0) rowHeights[idFor(row)] = value;
  }
  const alignments = {};
  for (const [key, value] of Object.entries(alignmentsByIndex)) {
    const [row, col] = String(key).split(":").map(Number);
    if (!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0 || !columnIds[col]) continue;
    alignments[alignmentKey(idFor(row), columnIds[col])] = value;
  }
  return { ...manifest, version: 2, chunkRows, rowIdRevision: revision, rowHeights, rowHeightsByIndex, alignments, alignmentsByIndex };
}

/**
 * Accepts v1 and v2 and always hands back v2. Migration happens in memory only — the upgraded
 * manifest is written the next time something is actually saved, so opening a v1 grid read-only
 * rewrites nothing and loses nothing.
 */
export function normalizeManifest(manifest) {
  if (!manifest || manifest.schema !== "roam-grid/manifest" || (manifest.version !== 1 && manifest.version !== 2) || !Number.isInteger(manifest.rowCount) || !Number.isInteger(manifest.colCount) || !Array.isArray(manifest.chunks)) throw new GridError("UNSUPPORTED_SCHEMA", "Unsupported or malformed large-grid manifest");
  const normalized = manifest.version === 2 ? { ...manifest } : migrateManifestToV2(manifest);
  normalized.widths ||= {};
  normalized.rowHeights ||= {};
  normalized.alignments ||= {};
  normalized.rowHeightsByIndex ||= {};
  normalized.alignmentsByIndex ||= {};
  normalized.chunkRows = chunkRowsFor(normalized);
  normalized.rowIdRevision = rowIdRevisionFor(normalized);
  normalized.colorFormulaCells = normalized.colorFormulaCells !== false;
  normalized.lineage = manifestLineage(normalized);
  normalized.retained = manifestRetained(normalized);
  normalized.garbage = manifestGarbage(normalized);
  // A manifest written before references existed carries no `refs` at all, and one written with the
  // mirror off carries an empty one. Both read as "this chunk contributes nothing to the union",
  // which is exactly right: the entry fills in the next time that chunk is actually saved.
  normalized.chunks = normalized.chunks.map((chunk) => ({ ...chunk, refs: chunkReferences(chunk) }));
  return normalized;
}

const PAGE_REFERENCE_RE = /#?\[\[([^[\]\n]+)\]\]/g;
const TAG_REFERENCE_RE = /(?:^|\s)#([\p{L}\p{N}_/-]+)/gu;
const BLOCK_REFERENCE_RE = /\(\(([^()\n]+)\)\)/g;

/**
 * Code-unit order, never `localeCompare`: shard content has to be a pure function of manifest
 * content or two devices computing from the same merged manifest write different strings and never
 * converge, and collation is a property of the device's locale rather than of the manifest.
 */
export function sortReferences(refs) { return [...refs].sort(); }

/**
 * A large-grid cell is JSON inside a chunk file, so Roam never parses it and never indexes what it
 * names — the cell paints a link that looks live while the page it points at shows nothing. This is
 * the regex that recovers those references from the text the user actually typed. Nothing is
 * inferred and nothing is synthesized, because a token invented here becomes a real page the moment
 * a shard carrying it is committed. `#tag` and `#[[Tag]]` both canonicalize to `[[Tag]]`: they name
 * the same page, so a set union counts them once, and the bare form is the only one that carries no
 * component, attribute or tag-styling behaviour into the block the shard writes it to.
 *
 * A `((…))` run is kept only when its contents are uid-shaped, because `=SUM((A1+B1))` is a formula
 * and not a reference. That errs toward dropping a block reference written against a custom uid
 * longer than nine characters, which costs one missing entry in a mirror the design already fills in
 * lazily — where the other direction fills the shard with inert junk and spends the budget on it.
 */
export function deriveChunkReferences(rows) {
  const found = new Set();
  for (const row of rows || []) {
    for (const cell of row || []) {
      const value = typeof cell === "string" ? cell : "";
      if (!value) continue;
      for (const match of value.matchAll(PAGE_REFERENCE_RE)) { const name = match[1].trim(); if (name) found.add(`[[${name}]]`); }
      for (const match of value.matchAll(TAG_REFERENCE_RE)) { const name = match[1].trim(); if (name) found.add(`[[${name}]]`); }
      for (const match of value.matchAll(BLOCK_REFERENCE_RE)) { const uid = match[1].trim(); if (ROAM_UID_SHAPE.test(uid)) found.add(`((${uid}))`); }
    }
  }
  return sortReferences([...found]);
}

export function chunkReferences(chunk) {
  return (Array.isArray(chunk?.refs) ? chunk.refs : []).filter((ref) => typeof ref === "string" && ref);
}

/**
 * References are a set union, not positional data. That is the whole reason this design needs no
 * structural-op handling: a reference that moves from row 50 to row 51, or across a chunk boundary,
 * leaves the union identical and every shard byte-for-byte unchanged.
 */
export function manifestReferenceUnion(manifest) {
  const found = new Set();
  for (const chunk of manifest?.chunks || []) for (const ref of chunkReferences(chunk)) found.add(ref);
  return sortReferences([...found]);
}

/**
 * Sort first, then cut: truncation has to be deterministic for the same reason the sort does. A cut
 * taken in encounter order would keep a different two thousand on each device, and two devices that
 * disagree about the set never stop rewriting each other's shards.
 */
export function referenceShardPlan(refs, { max = getSetting("large-refs-max"), perShard = LARGE_REFS_PER_SHARD } = {}) {
  const sorted = sortReferences([...new Set((refs || []).filter((ref) => typeof ref === "string" && ref))]);
  const limit = Math.max(1, Math.round(Number(max) || DEFAULT_LARGE_REFS_MAX));
  const truncated = sorted.length > limit;
  const kept = truncated ? sorted.slice(0, limit) : sorted;
  const shards = [];
  for (let start = 0; start < kept.length; start += Math.max(1, perShard)) shards.push(kept.slice(start, start + Math.max(1, perShard)).join(" "));
  return { marker: `${REFS_PREFIX} ${REFS_VERSION}${truncated ? ` (truncated at ${limit})` : ""}`, shards, truncated, total: sorted.length };
}

/**
 * The diff is the whole point. Shard content is a pure function of manifest content, so the common
 * save — one cell edited, no reference added or removed — produces the identical strings and must
 * cost zero transactor writes; without this comparison every save would rewrite every shard.
 */
export function planReferenceShardWrites(plan, existing = null) {
  const current = existing?.children || [];
  if (!plan.shards.length) return { marker: null, creates: [], updates: [], deletes: existing ? [existing.uid] : [] };
  const marker = existing ? (existing.string === plan.marker ? null : { uid: existing.uid, string: plan.marker }) : { uid: null, string: plan.marker };
  const creates = []; const updates = []; const deletes = [];
  for (let index = 0; index < plan.shards.length; index += 1) {
    const block = current[index];
    if (!block) creates.push(plan.shards[index]);
    else if (block.string !== plan.shards[index]) updates.push({ uid: block.uid, string: plan.shards[index] });
  }
  for (let index = plan.shards.length; index < current.length; index += 1) deletes.push(current[index].uid);
  return { marker, creates, updates, deletes };
}

/**
 * The lineage is the whole reason a merge can decide "behind or forked" without fetching a single
 * ancestor: every revision carries the last sixteen it descends from, so the question is answered by
 * a lookup in the manifest that was going to be downloaded anyway. Walking `previous` instead would
 * cost one download per generation, on the exact path where a user is waiting for a save.
 */
export function manifestLineage(manifest) {
  const entries = Array.isArray(manifest?.lineage) ? manifest.lineage : [];
  return entries.filter((entry) => typeof entry === "string" && entry).slice(0, LARGE_LINEAGE_LIMIT);
}

export function extendLineage(manifest) {
  const revision = typeof manifest?.revision === "string" && manifest.revision ? [manifest.revision] : [];
  return [...revision, ...manifestLineage(manifest)].slice(0, LARGE_LINEAGE_LIMIT);
}

export function manifestRetained(manifest) {
  const entries = Array.isArray(manifest?.retained) ? manifest.retained : [];
  return entries.filter((url) => typeof url === "string" && url);
}

/**
 * Oldest first, so the entries closest to the end of their grace window are the ones a bounded list
 * keeps hold of, and the cap drops the eldest. An entry it drops leaks forever — which is the
 * pre-GC status quo and therefore not a regression, where a shorter grace window would not be.
 * `deadAt` is carried through verbatim, including when it is missing or unparseable: that is the
 * signal that makes the collector refuse the entry, so repairing it here would defeat it.
 */
export function manifestGarbage(manifest) {
  const entries = Array.isArray(manifest?.garbage) ? manifest.garbage : [];
  return entries.filter((entry) => entry && typeof entry.url === "string" && entry.url).map((entry) => ({ url: entry.url, deadAt: entry.deadAt ?? null })).slice(-LARGE_GARBAGE_LIMIT);
}

/**
 * Deleting a live chunk is unrecoverable data loss, so this answers "keep" to every question it
 * cannot answer with proof. The live set is rebuilt from the manifest at collection time rather than
 * trusted from whatever put the url in `garbage` — a merge takes the other writer's `chunks`, so a
 * url this client retired can still be the url that client is serving. Four refusals, in order: the
 * manifest still references it, the url is unusable, `deadAt` does not parse, or the grace window
 * has not closed. Everything else is provably unreachable and seven days stale.
 */
export function planOrphanCollection(manifest, manifestUrl, now = Date.now(), graceMs = LARGE_GARBAGE_GRACE_MS) {
  const live = new Set([manifestUrl, manifest?.previous, ...(manifest?.chunks || []).map((chunk) => chunk?.url), ...manifestRetained(manifest)].filter((url) => typeof url === "string" && url));
  const collect = []; const keep = [];
  for (const entry of manifestGarbage(manifest)) {
    const deadAt = Date.parse(entry.deadAt);
    if (live.has(entry.url) || !Number.isFinite(deadAt) || now - deadAt < graceMs) keep.push(entry);
    else collect.push(entry);
  }
  return { collect, keep, live };
}

/**
 * A grid older than sixteen revisions behind reads as forked, which is the safe direction: the only
 * cost is a refused save the user can resolve with a reload, where the unsafe direction silently
 * discards whichever side lost.
 */
export function descendsFrom(live, baseRevision) {
  if (typeof baseRevision !== "string" || !baseRevision) return false;
  return live?.revision === baseRevision || manifestLineage(live).includes(baseRevision);
}

/**
 * 3B made a chunk's url content-addressed — every upload mints a fresh one — so a url that differs
 * from the base is proof the other writer rewrote that chunk, and a url that matches is proof it did
 * not. That is what makes disjointness trustworthy rather than a guess about intent.
 */
export function changedChunkIndexes(base, live) {
  const remaining = new Map((base?.chunks || []).map((chunk) => [chunk.index, chunk]));
  const changed = new Set();
  for (const chunk of live?.chunks || []) {
    const previous = remaining.get(chunk.index);
    if (!previous || previous.url !== chunk.url) changed.add(chunk.index);
    remaining.delete(chunk.index);
  }
  for (const index of remaining.keys()) changed.add(index);
  return changed;
}

const sameManifestValue = (left, right) => (left === right) || (left !== undefined && right !== undefined && JSON.stringify(left) === JSON.stringify(right));

/**
 * Three-way, key by key, over the id-keyed maps 3A introduced: a key only one side touched takes
 * that side's value (including its deletion), a key both sides moved to different values is a
 * conflict, and a key neither touched keeps whatever the live manifest holds. The legacy `*ByIndex`
 * maps are merged as themselves and never read back into the id-keyed maps — a positional entry
 * that migration already projected onto an id would otherwise reappear here as a "change" nobody
 * made, and would then out-vote the id-keyed value the user actually set.
 */
export function mergeMetadataMaps(base = {}, ours = {}, theirs = {}) {
  const merged = { ...theirs };
  const conflicts = [];
  for (const key of new Set([...Object.keys(base || {}), ...Object.keys(ours || {})])) {
    const before = base?.[key];
    const mine = ours?.[key];
    if (sameManifestValue(mine, before)) continue;
    const yours = theirs?.[key];
    if (!sameManifestValue(yours, before)) { if (!sameManifestValue(yours, mine)) conflicts.push(key); continue; }
    if (mine === undefined) delete merged[key];
    else merged[key] = mine;
  }
  return { merged, conflicts };
}

const MERGEABLE_MANIFEST_MAPS = ["widths", "rowHeights", "alignments", "rowHeightsByIndex", "alignmentsByIndex"];
const MERGEABLE_MANIFEST_VALUES = ["columnIds", "charts", "imageLayout", "frozenRows", "frozenCols", "showHeaders", "fitToWidth", "colorFormulaCells"];

const refuseMerge = (reason, message, details = {}) => { throw new GridError("CONFLICT", message, { reason, ...details }); };

/**
 * The refusal set matters more than the merge set: a refused save is one reload away from recovery
 * and a wrong merge is not, so every question that is not provably safe answers "refuse". Merging is
 * allowed only when the live manifest descends from our base, our dirty chunks are disjoint from the
 * ones the other writer rewrote, dimensions and merges moved on at most one side, and no metadata
 * key moved on both. Anything else throws `CONFLICT` carrying the reason it refused.
 */
export function planManifestMerge(base, ours, live, dirtyChunks = []) {
  if (!descendsFrom(live, base?.revision)) refuseMerge("fork", "Large grid changed elsewhere along a different history. Reload or save as a copy.", { baseRevision: base?.revision ?? null, liveRevision: live?.revision ?? null });
  // Both addresses rows: a different chunk size or id namespace means every index and every row id
  // in our copy points somewhere else in theirs, which no key-level merge can reconcile.
  if (chunkRowsFor(live) !== chunkRowsFor(base) || rowIdRevisionFor(live) !== rowIdRevisionFor(base)) refuseMerge("addressing", "Large grid was re-chunked elsewhere. Reload or save as a copy.", { baseChunkRows: chunkRowsFor(base), liveChunkRows: chunkRowsFor(live) });
  const theirChunks = changedChunkIndexes(base, live);
  const overlap = [...new Set(dirtyChunks)].filter((index) => theirChunks.has(index)).sort((a, b) => a - b);
  if (overlap.length) refuseMerge("chunk-overlap", `Large grid rows ${overlap.length > 1 ? "in several blocks" : "in one block"} changed on both sides. Reload or save as a copy.`, { chunks: overlap });

  const dimensions = {};
  for (const key of ["rowCount", "colCount"]) {
    const changedOurs = base?.[key] !== ours?.[key];
    const changedTheirs = base?.[key] !== live?.[key];
    if (changedOurs && changedTheirs) refuseMerge("dimensions", "The large grid was resized on both sides. Reload or save as a copy.", { key, base: base?.[key] ?? null, ours: ours?.[key] ?? null, live: live?.[key] ?? null });
    dimensions[key] = changedOurs ? ours[key] : live?.[key];
  }

  const mergesChangedOurs = !sameManifestValue(ours?.merges, base?.merges);
  const mergesChangedTheirs = !sameManifestValue(live?.merges, base?.merges);
  if (mergesChangedOurs && mergesChangedTheirs) refuseMerge("merges", "Merged regions changed on both sides. Reload or save as a copy.");

  const merged = { ...deepClone(live), ...dimensions, merges: deepClone((mergesChangedOurs ? ours?.merges : live?.merges) || []) };
  const conflicts = [];
  for (const key of MERGEABLE_MANIFEST_MAPS) {
    const result = mergeMetadataMaps(base?.[key], ours?.[key], live?.[key]);
    merged[key] = result.merged;
    for (const conflict of result.conflicts) conflicts.push(`${key}.${conflict}`);
  }
  const scalars = mergeMetadataMaps(
    Object.fromEntries(MERGEABLE_MANIFEST_VALUES.map((key) => [key, base?.[key]])),
    Object.fromEntries(MERGEABLE_MANIFEST_VALUES.map((key) => [key, ours?.[key]])),
    Object.fromEntries(MERGEABLE_MANIFEST_VALUES.map((key) => [key, live?.[key]])),
  );
  conflicts.push(...scalars.conflicts);
  if (conflicts.length) refuseMerge("metadata", `Large grid settings changed on both sides (${conflicts.slice(0, 3).join(", ")}). Reload or save as a copy.`, { keys: conflicts });
  for (const key of MERGEABLE_MANIFEST_VALUES) {
    const value = scalars.merged[key];
    if (value === undefined) delete merged[key];
    else merged[key] = deepClone(value);
  }
  return { manifest: merged, theirChunks };
}

/** Anchor uids whose orphan sweep has already run this load. `onunload` clears it; tests reset it. */
const orphanCollections = new Set();

export function resetOrphanCollection(anchorUid = null) { if (anchorUid) orphanCollections.delete(anchorUid); else orphanCollections.clear(); }

export class LargeGridStore {
  constructor(anchorUid, pointerUid = null) {
    this.anchorUid = anchorUid;
    this.pointerUid = pointerUid;
    this.manifestUrl = null;
    this.manifest = null;
    // `manifest` is edited in place by every metadata setter, so a three-way merge has no way to ask
    // what we started from unless the loaded copy is kept beside it. This is that copy, and it is
    // replaced only when the pointer we own actually moves.
    this.baseManifest = null;
    this.cache = new Map();
    this.residentLimit = LARGE_RESIDENT_MIN_CHUNKS;
    this.chunkCache = ChunkCache.disabled();
    this.rowIds = new Map();
    this.rowIndexById = new Map();
    this.dirty = new Set();
    // Index → the edit that last touched that chunk. `dirty` alone cannot distinguish "this chunk is
    // exactly what the commit uploaded" from "a keystroke changed it while the upload was in
    // flight", and the wholesale clear at the end of a commit silently discarded the second case.
    this.dirtyEpoch = new Map();
    this.editSequence = 0;
    this.metadataDirty = false;
    // The metadata twin of `dirtyEpoch`/`editSequence`. Cell edits survive a commit's manifest swap
    // because their values live in chunk objects; metadata edits mutate `this.manifest` in place,
    // and the swap replaces that object wholesale — so the journal captures the VALUE of every
    // write, stamped with the epoch a commit compares against.
    this.metadataEpoch = 0;
    this.metadataJournal = [];
    this.metadataJournalDropped = 0;
    this.metadataReplaySkipped = 0;
    this.metricsVersion = 0;
    this.disposed = false;
    this.unreadableChunks = new Map();
    this.retryDelay = chunkRetryDelayMs;
    this.orphanSweep = null;
    this.queue = new MutationQueue();
  }

  dispose() { this.disposed = true; }

  async initialize(model = null, source = null) {
    // The device cache is shared across grids and outlives any one of them, so `dispose` does not
    // close it; `onunload` does.
    this.chunkCache = await sharedChunkCache();
    const tree = getTree(this.anchorUid);
    const pointer = tree?.children.find((child) => child.string.startsWith(MANIFEST_PREFIX));
    if (pointer) {
      this.pointerUid = pointer.uid;
      this.manifestUrl = extractUrl(pointer.string.slice(MANIFEST_PREFIX.length));
      this.manifest = normalizeManifest(await downloadJson(this.manifestUrl));
      this.baseManifest = deepClone(this.manifest);
      this.metricsVersion += 1;
      // Deliberately not awaited: opening a grid must not wait on file deletions, and a sweep that
      // fails must not fail the load. It is queued, so it still serializes behind any commit. The
      // promise is kept rather than dropped so the work is nameable — an unobservable background
      // deletion is not something a test can pin down, and this one deletes files.
      this.orphanSweep = this.collectOrphans().catch(() => ({ skipped: "error", deleted: [], failed: [] }));
      this.scheduleReferenceSync();
      return this;
    }
    if (!model && !source) {
      const newRows = Math.max(1, Math.round(Number(getSetting("new-grid-rows")) || DEFAULT_NEW_GRID_ROWS));
      const newCols = Math.max(1, Math.round(Number(getSetting("new-grid-cols")) || DEFAULT_NEW_GRID_COLS));
      model = applyDisplayDefaults(new GridModel({ rows: Array.from({ length: newRows }, (_, row) => Array.from({ length: newCols }, (_, col) => row === 0 ? columnLabel(col) : "")), frozenRows: 1 }));
    }
    this.pointerUid = await createBlock(this.anchorUid, `${MANIFEST_PREFIX} pending`);
    await (source ? this.seedFrom(source) : this.seed(model));
    this.scheduleReferenceSync();
    return this;
  }

  async seed(model) {
    const rows = rawRows(model);
    const chunkSize = this.manifest ? chunkRowsFor(this.manifest) : chunkRowsFor({ chunkRows: getSetting("large-chunk-rows") });
    const mirrorReferences = getSetting("large-refs-sync");
    const chunks = [];
    for (let start = 0, index = 0; start < rows.length; start += chunkSize, index += 1) {
      const chunkRows = rows.slice(start, start + chunkSize);
      // The digest covers the exact bytes that are uploaded, which is the only thing a reader can
      // compare against before it parses them.
      const text = JSON.stringify({ schema: "roam-grid/chunk", version: 1, index, startRow: start, rows: chunkRows });
      const digest = await sha256Hex(text);
      const url = await uploadText(text, `roam-grid-${this.anchorUid}-${index}.json`);
      chunks.push({ index, startRow: start, rowCount: chunkRows.length, url, digest, refs: mirrorReferences ? deriveChunkReferences(chunkRows) : [] });
    }
    // A fresh grid is born in the id namespace of its own first revision, and the chunks carry no
    // ids: every reader derives the same ones from position until a row actually moves.
    const revision = cryptoId();
    const manifest = {
      schema: "roam-grid/manifest", version: 2, revision, rowIdRevision: revision, previous: null, lineage: [], createdAt: new Date().toISOString(),
      rowCount: model.rowCount, colCount: model.colCount, chunkRows: chunkSize, columnIds: model.columnIds, widths: model.widths,
      rowHeights: rowHeightsForManifest(model, chunkSize, revision), rowHeightsByIndex: {}, alignments: alignmentsForManifest(model, chunkSize, revision), alignmentsByIndex: {},
      frozenRows: model.frozenRows, frozenCols: model.frozenCols, merges: model.merges, charts: model.charts, imageLayout: normalizeImageLayout(model.imageLayout), showHeaders: model.showHeaders !== false, fitToWidth: model.fitToWidth !== false, colorFormulaCells: model.colorFormulaCells !== false, chunks, retained: [],
    };
    const url = await uploadJson(manifest, `roam-grid-${this.anchorUid}-manifest.json`);
    const verified = normalizeManifest(await downloadJson(url));
    await updateBlock(this.pointerUid, `${MANIFEST_PREFIX} ${url}`);
    this.manifestUrl = url;
    this.manifest = verified;
    this.baseManifest = deepClone(verified);
    this.metricsVersion += 1;
  }

  /**
   * `seed` for a copy of a live grid, streamed: one destination chunk of rows is read, uploaded and
   * dropped before the next is read, so copying a 100k-row grid costs one chunk of memory instead of
   * the whole grid. Reads go through the source's own `getRows`, which is what keeps the walk inside
   * the source's resident bound — a band is one destination chunk wide, never the grid — and what
   * leaves its dirty chunks pinned, so copying can never evict an edit that has not been saved yet.
   * Row heights and alignments are re-keyed from the source manifest rather than replayed through a
   * `GridModel`, because building that model is exactly the whole-grid allocation being removed.
   */
  async seedFrom(source) {
    const chunkSize = this.manifest ? chunkRowsFor(this.manifest) : chunkRowsFor({ chunkRows: getSetting("large-chunk-rows") });
    const mirrorReferences = getSetting("large-refs-sync");
    const rowCount = source.manifest.rowCount;
    const colCount = Math.max(1, source.manifest.colCount, (source.manifest.columnIds || []).length);
    const columnIds = Array.from({ length: colCount }, (_, col) => source.manifest.columnIds?.[col] || makeLocalUid());
    const chunks = [];
    for (let start = 0, index = 0; start < rowCount; start += chunkSize, index += 1) {
      const band = await source.getRows(start, Math.min(rowCount, start + chunkSize));
      const chunkRows = band.map((row) => (row.length === colCount ? row : Array.from({ length: colCount }, (_, col) => row[col] ?? "")));
      const text = JSON.stringify({ schema: "roam-grid/chunk", version: 1, index, startRow: start, rows: chunkRows });
      const digest = await sha256Hex(text);
      const url = await uploadText(text, `roam-grid-${this.anchorUid}-${index}.json`);
      chunks.push({ index, startRow: start, rowCount: chunkRows.length, url, digest, refs: mirrorReferences ? deriveChunkReferences(chunkRows) : [] });
    }
    const revision = cryptoId();
    const manifest = {
      schema: "roam-grid/manifest", version: 2, revision, rowIdRevision: revision, previous: null, lineage: [], createdAt: new Date().toISOString(),
      rowCount, colCount, chunkRows: chunkSize, columnIds, widths: { ...source.manifest.widths },
      rowHeights: copiedRowHeights(source, chunkSize, revision, rowCount), rowHeightsByIndex: {}, alignments: copiedAlignments(source, columnIds, chunkSize, revision, rowCount), alignmentsByIndex: {},
      frozenRows: clamp(Number(source.manifest.frozenRows) || 0, 0, rowCount), frozenCols: clamp(Number(source.manifest.frozenCols) || 0, 0, colCount),
      merges: deepClone(source.manifest.merges || []), charts: deepClone(source.manifest.charts || []),
      imageLayout: normalizeImageLayout(source.manifest.imageLayout),
      showHeaders: source.manifest.showHeaders !== false, fitToWidth: source.manifest.fitToWidth !== false, colorFormulaCells: source.manifest.colorFormulaCells !== false, chunks, retained: [],
    };
    const url = await uploadJson(manifest, `roam-grid-${this.anchorUid}-manifest.json`);
    const verified = normalizeManifest(await downloadJson(url));
    await updateBlock(this.pointerUid, `${MANIFEST_PREFIX} ${url}`);
    this.manifestUrl = url;
    this.manifest = verified;
    this.baseManifest = deepClone(verified);
    this.metricsVersion += 1;
  }

  chunkIndexForRow(row) { return Math.floor(row / chunkRowsFor(this.manifest)); }

  /** Every write to a chunk goes through here, so no path can mark one dirty without stamping it. */
  markChunkDirty(index) {
    this.editSequence += 1;
    this.dirty.add(index);
    this.dirtyEpoch.set(index, this.editSequence);
    return this.editSequence;
  }

  /** Every write to manifest metadata goes through here, so no path can dirty it without a replayable record. */
  recordMetadataMutation(op, args) {
    this.metadataEpoch += 1;
    this.metadataJournal.push({ epoch: this.metadataEpoch, op, args });
    if (this.metadataJournal.length > LARGE_METADATA_JOURNAL_LIMIT) {
      const excess = this.metadataJournal.length - LARGE_METADATA_JOURNAL_LIMIT;
      this.metadataJournal.splice(0, excess);
      this.metadataJournalDropped += excess;
    }
    this.metadataDirty = true;
  }

  /**
   * Ids are synthesized when a chunk is read and re-synthesized whenever its rows move, so a row
   * carries its height and alignment across an insert instead of handing them to whoever slides into
   * its old index. They are attached to the cached chunk, so a chunk that is uploaded because its
   * cells changed makes them durable — nothing is ever uploaded just to add them.
   */
  syncRowIds(index, chunk = this.cache.get(index)) {
    if (!chunk) return [];
    const ids = synthesizeChunkRowIds(chunk, rowIdRevisionFor(this.manifest), chunk.rows.length);
    chunk.rowIds = ids;
    // Retire exactly the ids this chunk registered last time. Sweeping the whole index for rows in
    // this chunk's range was equivalent, but eviction makes re-loads routine and that sweep costs
    // one pass over every known row each time.
    for (const id of this.rowIds.get(index) || []) this.rowIndexById.delete(id);
    this.rowIds.set(index, ids);
    const chunkRows = chunkRowsFor(this.manifest);
    ids.forEach((id, local) => this.rowIndexById.set(id, index * chunkRows + local));
    this.metricsVersion += 1;
    return ids;
  }

  rowIdAt(row) {
    const chunkRows = chunkRowsFor(this.manifest);
    const index = Math.floor(row / chunkRows);
    const local = row - index * chunkRows;
    return this.rowIds.get(index)?.[local] ?? deriveRowId(rowIdRevisionFor(this.manifest), index, local);
  }

  /**
   * `*ByIndex` is only trustworthy for a row still sitting where its id was derived. Once a row
   * moves, its state travelled with its id and the legacy index describes a different row entirely.
   */
  unmovedRowId(row) {
    const chunkRows = chunkRowsFor(this.manifest);
    const index = Math.floor(row / chunkRows);
    const derived = deriveRowId(rowIdRevisionFor(this.manifest), index, row - index * chunkRows);
    return this.rowIdAt(row) === derived ? derived : null;
  }

  rowIndexForRowId(rowId) {
    const known = this.rowIndexById.get(rowId);
    if (known != null) return known;
    const parsed = parseRowId(rowId, rowIdRevisionFor(this.manifest));
    if (!parsed || this.rowIds.has(parsed.chunk)) return null;
    const row = parsed.chunk * chunkRowsFor(this.manifest) + parsed.local;
    return row < this.manifest.rowCount ? row : null;
  }

  /**
   * A digest mismatch is far more often a truncated or half-cached response than a file that rotted
   * at rest, so the download is retried with backoff before the chunk is declared unreadable. The
   * comparison runs on the raw body: a truncated response can still parse into a chunk with the
   * right schema, version and index, so checking the parsed object would accept the missing rows.
   */
  async downloadChunk(index, descriptor) {
    const expected = getSetting("large-verify-checksums") ? chunkDigestOf(descriptor) : null;
    // The device cache is consulted before the retry budget rather than inside it, so a rotted entry
    // still leaves all `CHUNK_DIGEST_RETRIES + 1` network attempts available.
    const cached = await this.chunkCache.get(descriptor.url);
    if (cached !== null) {
      const parsed = await parseVerifiedChunk(cached, expected);
      if (parsed) return parsed;
      await this.chunkCache.delete(descriptor.url);
    }
    let failure = null;
    for (let attempt = 0; attempt <= CHUNK_DIGEST_RETRIES; attempt += 1) {
      if (attempt) await sleep(this.retryDelay(attempt - 1));
      const text = await downloadFileText(descriptor.url);
      if (!expected) { await this.chunkCache.put(descriptor.url, text); return JSON.parse(text); }
      const actual = await sha256Hex(text);
      if (actual === null || actual === expected) { await this.chunkCache.put(descriptor.url, text); return JSON.parse(text); }
      failure = new GridError("CHUNK_DIGEST", `Large-grid chunk ${index} failed its checksum and may be truncated`, { index, url: descriptor.url, expected, actual });
    }
    this.unreadableChunks.set(index, failure);
    throw failure;
  }

  /**
   * A read is also a use: the chunk moves to the young end of the `Map`'s insertion order, which is
   * the entire LRU. `cache` stays a plain `Map` on purpose — `commit` and the tests read it
   * directly, and an opaque wrapper would hide the pinning invariant rather than expose it.
   */
  residentChunk(index) {
    if (!this.cache.has(index)) return undefined;
    const chunk = this.cache.get(index);
    this.cache.delete(index);
    this.cache.set(index, chunk);
    return chunk;
  }

  /**
   * Sized from the band the caller is about to read, never from a constant: everything in the band
   * has to be resident at once or `peekRaw` would read an evicted chunk back as empty. Four bands of
   * headroom keeps ordinary scrolling inside the cache, and the ceiling is what stops a 100k-row
   * grid scrolled end to end from pinning all 200 chunks for the rest of the Roam session.
   */
  boundResidentChunks(span) {
    this.residentLimit = Math.max(span, clamp(span * 4, LARGE_RESIDENT_MIN_CHUNKS, LARGE_RESIDENT_MAX_CHUNKS));
  }

  /**
   * A dirty chunk holds the only copy of an edit until `commit()` uploads it, so it is pinned and
   * the resident set is allowed to sit over its limit rather than lose one. Row ids survive
   * eviction: they are a fraction of a chunk's size, and dropping them would hand an evicted row's
   * height and alignment to whichever row is derived into its id next.
   */
  evictResidentChunks() {
    let evicted = 0;
    if (this.cache.size <= this.residentLimit) return evicted;
    // The youngest entry is the chunk whose load triggered this, and the caller is holding it —
    // `setCell` is about to write into it and only then mark it dirty. It is never a candidate.
    const candidates = [...this.cache.keys()];
    candidates.pop();
    for (const index of candidates) {
      if (this.cache.size <= this.residentLimit) break;
      if (this.dirty.has(index)) continue;
      this.cache.delete(index);
      evicted += 1;
    }
    return evicted;
  }

  async loadChunk(index) {
    const resident = this.residentChunk(index);
    if (resident !== undefined) return resident;
    // Sticky until something explicitly asks for a retry, so a failing chunk costs one round of
    // downloads rather than a fresh round on every frame, edit and formula read.
    const unreadable = this.unreadableChunks.get(index);
    if (unreadable) throw unreadable;
    const descriptor = this.manifest.chunks.find((chunk) => chunk.index === index);
    if (!descriptor) {
      const empty = { schema: "roam-grid/chunk", version: 1, index, startRow: index * chunkRowsFor(this.manifest), rows: [] };
      this.cache.set(index, empty);
      this.syncRowIds(index, empty);
      this.evictResidentChunks();
      return empty;
    }
    const chunk = await this.downloadChunk(index, descriptor);
    if (chunk.schema !== "roam-grid/chunk" || chunk.version !== 1 || chunk.index !== index || !Array.isArray(chunk.rows)) throw new GridError("CHUNK_CORRUPT", `Large-grid chunk ${index} is malformed`);
    if (this.disposed) return chunk;
    this.cache.set(index, chunk);
    // A chunk served from the device cache took the same path here, so it is given its row ids too.
    this.syncRowIds(index, chunk);
    this.evictResidentChunks();
    return chunk;
  }

  forgetChunkError(index) { return this.unreadableChunks.delete(index); }

  async ensureRows(start, end) {
    const limit = Math.min(end, this.manifest.rowCount);
    if (limit <= start) return;
    const first = this.chunkIndexForRow(Math.max(0, start));
    const last = this.chunkIndexForRow(limit - 1);
    // The caller asked for this whole band and is about to read it, so the bound is raised to cover
    // it instead of evicting chunks out from under the read. It is not lowered here — the next
    // render pass re-sizes it from the viewport, which is what gives the memory back.
    this.residentLimit = Math.max(this.residentLimit, last - first + 1);
    // Bounded: a band a hundred chunks wide used to open a hundred simultaneous file reads, which is
    // slower than six and starves every other request the page has in flight.
    await mapWithConcurrency(Array.from({ length: last - first + 1 }, (_, offset) => first + offset), LARGE_PREFETCH_CONCURRENCY, (index) => this.loadChunk(index));
  }

  /**
   * The render-time sibling of `ensureRows`: an unreadable chunk costs its own rows, not the whole
   * frame. Only a failed integrity check is absorbed — anything else still surfaces as it does now.
   */
  async ensureRowsSettled(start, end) {
    const failed = new Set();
    const limit = Math.min(end, this.manifest.rowCount);
    if (limit <= start) return failed;
    const first = this.chunkIndexForRow(Math.max(0, start));
    const last = this.chunkIndexForRow(limit - 1);
    // The render path is the one caller whose band IS the viewport, so it is where the resident
    // bound is set rather than merely raised, and where a shrinking viewport releases chunks.
    this.boundResidentChunks(last - first + 1);
    await mapWithConcurrency(Array.from({ length: last - first + 1 }, (_, offset) => first + offset), LARGE_PREFETCH_CONCURRENCY, async (index) => {
      try { await this.loadChunk(index); } catch (error) {
        if (error?.code !== "CHUNK_DIGEST") throw error;
        failed.add(index);
      }
    });
    this.evictResidentChunks();
    return failed;
  }

  /** Synchronous read of an already-resident row, so a render pass never materializes a matrix. */
  peekRaw(row, col) {
    if (row < 0 || col < 0 || row >= this.manifest.rowCount || col >= this.manifest.colCount) return "";
    const chunk = this.cache.get(this.chunkIndexForRow(row));
    return chunk?.rows[row - chunk.startRow]?.[col] ?? "";
  }

  /**
   * Reads through the chunk object it just resolved rather than through `peekRaw`, so a band wider
   * than the resident bound cannot have its earlier chunks evicted out from under it and silently
   * read back as empty rows. `ensureRows` still runs first — it is what makes the loads concurrent.
   */
  async getRows(start, end) {
    await this.ensureRows(start, end);
    const rows = [];
    const chunkRows = chunkRowsFor(this.manifest);
    const limit = Math.min(end, this.manifest.rowCount);
    const blank = () => Array.from({ length: this.manifest.colCount }, () => "");
    for (let row = start; row < limit;) {
      if (row < 0) { rows.push(blank()); row += 1; continue; }
      const index = this.chunkIndexForRow(row);
      const chunk = await this.loadChunk(index);
      const stop = Math.min(limit, (index + 1) * chunkRows);
      for (; row < stop; row += 1) {
        const source = chunk.rows[row - chunk.startRow];
        rows.push(source ? Array.from({ length: this.manifest.colCount }, (_, col) => source[col] ?? "") : blank());
      }
    }
    return rows;
  }

  async getRaw(row, col) {
    if (row < 0 || col < 0 || row >= this.manifest.rowCount || col >= this.manifest.colCount) return "";
    const chunk = await this.loadChunk(this.chunkIndexForRow(row));
    return chunk.rows[row - chunk.startRow]?.[col] ?? "";
  }

  ensureSize(rowCount, colCount) {
    if (rowCount > this.manifest.rowCount) { this.manifest.rowCount = rowCount; this.metadataDirty = true; this.metricsVersion += 1; }
    if (colCount > this.manifest.colCount) {
      for (let col = this.manifest.colCount; col < colCount; col += 1) this.manifest.columnIds.push(makeLocalUid());
      this.manifest.colCount = colCount; this.metadataDirty = true; this.metricsVersion += 1;
    }
  }

  rowHeightRaw(row) {
    const byId = this.manifest.rowHeights?.[this.rowIdAt(row)];
    if (byId != null) return byId;
    return this.unmovedRowId(row) ? this.manifest.rowHeightsByIndex?.[row] : undefined;
  }

  rowHeight(row) {
    const value = Number(this.rowHeightRaw(row));
    return Number.isFinite(value) ? clamp(Math.round(value), getSetting("sizing-min-row-height"), getSetting("sizing-max-row-height")) : getSetting("sizing-default-row-height");
  }

  setRowHeight(row, height) {
    if (!Number.isInteger(row) || row < 0 || row >= this.manifest.rowCount) throw new GridError("OUT_OF_BOUNDS", `Row ${row + 1} is outside the grid`);
    this.manifest.rowHeights ||= {};
    this.manifest.rowHeightsByIndex ||= {};
    const id = this.rowIdAt(row);
    // The legacy entry has to go with the write, or clearing a height would let the index-keyed
    // fallback resurrect the value the user just removed.
    delete this.manifest.rowHeightsByIndex[row];
    let applied = null;
    if (height == null || height === "") delete this.manifest.rowHeights[id];
    else {
      const value = Number(height);
      if (!Number.isFinite(value)) throw new GridError("ROW_HEIGHT", "Row height must be a number");
      applied = clamp(Math.round(value), getSetting("sizing-min-row-height"), getSetting("sizing-max-row-height"));
      this.manifest.rowHeights[id] = applied;
    }
    this.recordMetadataMutation("rowHeight", { rowId: id, row, value: applied });
    this.metricsVersion += 1;
  }

  /** The v1 shape on demand, for the two paths that rebuild a native `GridModel` from a manifest. */
  rowHeightIndexMap() {
    const out = {};
    for (const [id, value] of Object.entries(this.manifest.rowHeights || {})) {
      const row = this.rowIndexForRowId(id);
      if (row != null) out[row] = value;
    }
    for (const [key, value] of Object.entries(this.manifest.rowHeightsByIndex || {})) {
      const row = Number(key);
      if (Number.isInteger(row) && row >= 0 && !(row in out) && this.unmovedRowId(row)) out[row] = value;
    }
    return out;
  }

  alignmentIndexMap() {
    const columns = new Map((this.manifest.columnIds || []).map((id, col) => [id, col]));
    const out = {};
    for (const [key, value] of Object.entries(this.manifest.alignments || {})) {
      const parts = splitAlignmentKey(key);
      if (!parts) continue;
      const row = this.rowIndexForRowId(parts.rowId);
      const col = columns.get(parts.columnId);
      if (row != null && col != null) out[`${row}:${col}`] = value;
    }
    for (const [key, value] of Object.entries(this.manifest.alignmentsByIndex || {})) {
      const [row, col] = String(key).split(":").map(Number);
      if (Number.isInteger(row) && row >= 0 && Number.isInteger(col) && col >= 0 && !(key in out) && this.unmovedRowId(row)) out[key] = value;
    }
    return out;
  }

  setColumnWidth(col, width) {
    const id = this.manifest.columnIds[col];
    if (!id) throw new GridError("OUT_OF_BOUNDS", `Column ${columnLabel(col)} is outside the grid`);
    this.manifest.widths ||= {};
    let applied = null;
    if (width == null || width === "") delete this.manifest.widths[id];
    else {
      const value = Number(width);
      if (!Number.isFinite(value)) throw new GridError("COLUMN_WIDTH", "Column width must be a number");
      applied = clamp(Math.round(value), getSetting("sizing-min-col-width"), getSetting("sizing-max-col-width"));
      this.manifest.widths[id] = applied;
    }
    this.recordMetadataMutation("columnWidth", { columnId: id, value: applied });
  }

  getAlignment(row, col) {
    const columnId = this.manifest.columnIds[col];
    const byId = columnId ? this.manifest.alignments?.[alignmentKey(this.rowIdAt(row), columnId)] : null;
    if (byId) return byId;
    return (this.unmovedRowId(row) ? this.manifest.alignmentsByIndex?.[`${row}:${col}`] : null) || null;
  }

  setAlignment(row, col, alignment) {
    if (row < 0 || col < 0 || row >= this.manifest.rowCount || col >= this.manifest.colCount) throw new GridError("OUT_OF_BOUNDS", `Cell ${cellLabel(row, col)} is outside the grid`);
    const merge = this.mergeAt(row, col); const anchorRow = merge?.row ?? row; const anchorCol = merge?.col ?? col; const indexKey = `${anchorRow}:${anchorCol}`;
    const columnId = this.manifest.columnIds[anchorCol];
    const rowId = this.rowIdAt(anchorRow);
    const key = columnId ? alignmentKey(rowId, columnId) : null;
    this.manifest.alignments ||= {};
    this.manifest.alignmentsByIndex ||= {};
    let recorded = null;
    if (alignment == null || alignment === "auto") { if (key) delete this.manifest.alignments[key]; delete this.manifest.alignmentsByIndex[indexKey]; }
    else if (["left", "center", "right"].includes(alignment)) {
      recorded = alignment;
      // A manifest whose `columnIds` is short of `colCount` has no stable key to write, so the
      // legacy index map stays the store of record for that column rather than losing the value.
      if (key) { this.manifest.alignments[key] = alignment; delete this.manifest.alignmentsByIndex[indexKey]; }
      else this.manifest.alignmentsByIndex[indexKey] = alignment;
    }
    else throw new GridError("ALIGNMENT", `Unsupported alignment: ${alignment}`);
    this.recordMetadataMutation("alignment", { rowId, columnId: columnId || null, anchorRow, anchorCol, indexKey, alignment: recorded });
  }

  /**
   * Returns what it overwrote. A large-grid cell has no Roam block whose earlier string an undo
   * entry could read back later — the previous value exists only here, in the instant before it is
   * replaced — so recording it is the caller's only chance. The address travels with it as the
   * stable `(rowId, columnId)` pair from 3A rather than `(row, col)`, so an entry survives the rows
   * above it moving.
   */
  async setCell(row, col, raw) {
    if (row < 0 || col < 0) throw new GridError("OUT_OF_BOUNDS", "Large-grid edit is out of bounds");
    this.ensureSize(row + 1, col + 1);
    if (this.mergeAt(row, col) && (this.mergeAt(row, col).row !== row || this.mergeAt(row, col).col !== col)) throw new GridError("MERGE_COVERED", `Cell ${cellLabel(row, col)} is covered by a merge`);
    const index = this.chunkIndexForRow(row);
    const chunk = await this.loadChunk(index);
    const local = row - chunk.startRow;
    const grew = chunk.rows.length <= local;
    while (chunk.rows.length <= local) chunk.rows.push(Array.from({ length: this.manifest.colCount }, () => ""));
    while (chunk.rows[local].length < this.manifest.colCount) chunk.rows[local].push("");
    const previous = chunk.rows[local][col] ?? "";
    const next = String(raw ?? "");
    chunk.rows[local][col] = next;
    if (grew) this.syncRowIds(index, chunk);
    this.markChunkDirty(index);
    return { row, col, index, previous, raw: next, rowId: this.rowIdAt(row), columnId: this.manifest.columnIds[col] ?? null };
  }

  async applyMatrix(startRow, startCol, matrix) {
    this.ensureSize(startRow + matrix.length, startCol + Math.max(0, ...matrix.map((row) => row.length)));
    const records = [];
    for (let row = 0; row < matrix.length; row += 1) for (let col = 0; col < matrix[row].length; col += 1) records.push(await this.setCell(startRow + row, startCol + col, matrix[row][col]));
    return records;
  }

  mergeAt(row, col) {
    return (this.manifest.merges || []).find((merge) => rangeContains({ startRow: merge.row, endRow: merge.row + merge.rowSpan - 1, startCol: merge.col, endCol: merge.col + merge.colSpan - 1 }, row, col)) || null;
  }

  async merge(range) {
    const value = normalizeRange(range);
    if (value.startRow === value.endRow && value.startCol === value.endCol) throw new GridError("MERGE_SINGLE", "Select at least two cells to merge");
    const overlap = (this.manifest.merges || []).find((merge) => rangesOverlap(value, { startRow: merge.row, endRow: merge.row + merge.rowSpan - 1, startCol: merge.col, endCol: merge.col + merge.colSpan - 1 }));
    if (overlap) throw new GridError("MERGE_OVERLAP", "The selection overlaps an existing merged region");
    const blocking = [];
    for (let row = value.startRow; row <= value.endRow; row += 1) for (let col = value.startCol; col <= value.endCol; col += 1) {
      if (row === value.startRow && col === value.startCol) continue;
      if (await this.getRaw(row, col) !== "") blocking.push(cellLabel(row, col));
    }
    if (blocking.length) throw new GridError("MERGE_NONEMPTY", `Merge blocked by non-empty cells: ${blocking.join(", ")}`, { cells: blocking });
    this.manifest.merges ||= [];
    const region = { id: makeLocalUid(), row: value.startRow, col: value.startCol, rowSpan: value.endRow - value.startRow + 1, colSpan: value.endCol - value.startCol + 1 };
    this.manifest.merges.push(region);
    this.recordMetadataMutation("merge", { merge: deepClone(region) });
  }

  unmerge(row, col) {
    const merge = this.mergeAt(row, col);
    if (!merge) return false;
    this.manifest.merges = this.manifest.merges.filter((item) => item.id !== merge.id);
    this.recordMetadataMutation("unmerge", { id: merge.id });
    return true;
  }

  /** The three display flags are plain manifest keys; routing their writes here keeps them journaled. */
  setDisplayFlag(key, value) {
    if (!["showHeaders", "fitToWidth", "colorFormulaCells"].includes(key)) throw new GridError("METADATA", `Unknown display flag: ${key}`);
    this.manifest[key] = value;
    this.recordMetadataMutation("flag", { key, value });
  }

  /** Whole-object image layout write, journaled like the flags so a commit swap replays it. Large
   *  cells are JSON rows with no block uid, so only the column layer is ever meaningful here. */
  setImageLayout(imageLayout) {
    this.manifest.imageLayout = normalizeImageLayout(imageLayout);
    this.recordMetadataMutation("imageLayout", { value: deepClone(this.manifest.imageLayout) });
  }

  livePointerUrl() {
    const pointer = getTree(this.pointerUid);
    return extractUrl(pointer?.string?.slice(MANIFEST_PREFIX.length));
  }

  /**
   * Their chunk at this index is newer than the copy we are holding, and disjointness guarantees the
   * copy we are holding is clean — so dropping it is free and keeping it would serve stale rows out
   * of memory for the rest of the session.
   */
  dropResidentChunk(index) {
    this.cache.delete(index);
    for (const id of this.rowIds.get(index) || []) this.rowIndexById.delete(id);
    this.rowIds.delete(index);
    this.unreadableChunks.delete(index);
  }

  /**
   * One download of the manifest the pointer now names, and no more: the lineage inside it answers
   * descent, and 3B's content-addressed urls answer disjointness, so no ancestor is ever fetched. A
   * live manifest we cannot read or cannot understand is a refusal, not a merge.
   */
  async planLiveMerge(liveUrl, dirtyChunks) {
    let live = null;
    try { live = normalizeManifest(await downloadJson(liveUrl)); }
    catch (error) {
      const reason = error?.code === "UNSUPPORTED_SCHEMA" ? "version" : "unreadable";
      throw new GridError("CONFLICT", "Large grid changed elsewhere and the new version could not be read. Reload or save as a copy.", { reason, liveUrl, baseUrl: this.manifestUrl, cause: error?.message });
    }
    try { return { ...planManifestMerge(this.baseManifest, this.manifest, live, dirtyChunks), liveUrl }; }
    catch (error) {
      if (error instanceof GridError) { error.details = { ...error.details, liveUrl, baseUrl: this.manifestUrl }; }
      throw error;
    }
  }

  /**
   * Re-applies one journaled metadata write onto the manifest a commit just swapped in. Every op is
   * idempotent, so replaying a write the uploaded manifest already captured is a no-op. An op whose
   * row, column or range no longer exists in the merged result is refused (returns false) rather
   * than resurrected — the same rule the merge applies to a chunk the other writer rewrote.
   */
  applyMetadataOp({ op, args }) {
    const manifest = this.manifest;
    if (op === "rowHeight") {
      if (this.rowIndexForRowId(args.rowId) == null) return false;
      manifest.rowHeights ||= {};
      if (args.value == null) delete manifest.rowHeights[args.rowId];
      else manifest.rowHeights[args.rowId] = args.value;
      // The legacy index entry is cleared only when the index still addresses this exact row —
      // after a merge the slot may belong to a different row, whose entry is not ours to delete.
      if (this.unmovedRowId(args.row) === args.rowId) delete manifest.rowHeightsByIndex?.[args.row];
      return true;
    }
    if (op === "columnWidth") {
      if (!manifest.columnIds?.includes(args.columnId)) return false;
      manifest.widths ||= {};
      if (args.value == null) delete manifest.widths[args.columnId];
      else manifest.widths[args.columnId] = args.value;
      return true;
    }
    if (op === "alignment") {
      if (this.rowIndexForRowId(args.rowId) == null) return false;
      if (args.columnId) {
        if (!manifest.columnIds?.includes(args.columnId)) return false;
        manifest.alignments ||= {};
        const key = alignmentKey(args.rowId, args.columnId);
        if (args.alignment == null) delete manifest.alignments[key];
        else manifest.alignments[key] = args.alignment;
        if (this.unmovedRowId(args.anchorRow) === args.rowId) delete manifest.alignmentsByIndex?.[args.indexKey];
      } else {
        if (!(args.anchorRow < manifest.rowCount && args.anchorCol < manifest.colCount)) return false;
        manifest.alignmentsByIndex ||= {};
        if (args.alignment == null) delete manifest.alignmentsByIndex[args.indexKey];
        else manifest.alignmentsByIndex[args.indexKey] = args.alignment;
      }
      return true;
    }
    if (op === "merge") {
      const region = args.merge;
      if (region.row + region.rowSpan > manifest.rowCount || region.col + region.colSpan > manifest.colCount) return false;
      manifest.merges ||= [];
      if (manifest.merges.some((item) => item.id === region.id)) return true;
      const overlap = manifest.merges.find((item) => rangesOverlap({ startRow: region.row, endRow: region.row + region.rowSpan - 1, startCol: region.col, endCol: region.col + region.colSpan - 1 }, { startRow: item.row, endRow: item.row + item.rowSpan - 1, startCol: item.col, endCol: item.col + item.colSpan - 1 }));
      if (overlap) return false;
      manifest.merges.push(deepClone(region));
      return true;
    }
    if (op === "unmerge") { manifest.merges = (manifest.merges || []).filter((item) => item.id !== args.id); return true; }
    if (op === "flag") { manifest[args.key] = args.value; return true; }
    if (op === "imageLayout") { manifest.imageLayout = normalizeImageLayout(args.value); return true; }
    return false;
  }

  /**
   * The metadata half of the commit tail. Entries at or below the snapshot epoch went up with the
   * manifest bytes (or rode the merge plan), so they are simply subtracted — the same
   * "subtract what you committed, don't clear wholesale" shape as the chunk dirty set. Entries
   * after it landed in the manifest object the swap just discarded, so they are replayed onto the
   * verified manifest; the replay is what commits them, because the next save clones the object
   * they now live in. Replayed entries are then dropped too: their value is in `this.manifest`,
   * which is the only thing a later swap can discard.
   */
  replayMetadataJournal(snapshotEpoch) {
    const pending = this.metadataJournal.filter((entry) => entry.epoch > snapshotEpoch);
    this.metadataJournal = [];
    let applied = 0; let skipped = 0;
    for (const entry of pending) {
      if (this.applyMetadataOp(entry)) applied += 1;
      else skipped += 1;
    }
    this.metadataReplaySkipped += skipped;
    return { applied, skipped };
  }

  /** The marker block and its shards as they stand in the graph right now, or null if none exists. */
  readReferenceShards() {
    const marker = getTree(this.anchorUid)?.children.find((child) => child.string.startsWith(REFS_PREFIX));
    return marker ? { uid: marker.uid, string: marker.string, children: (marker.children || []).map((child) => ({ uid: child.uid, string: child.string })) } : null;
  }

  /**
   * Materializes the manifest's reference union into collapsed blocks under the anchor, so Roam's own
   * indexer creates the `:block/refs` datoms — real by construction rather than emulated. Block count
   * is bounded by DISTINCT references, not cells: a hundred thousand cells all naming `[[Foo]]` are
   * one reference and one shard.
   *
   * Not queued here. `commit` calls it inside its own queue turn, and `scheduleReferenceSync` wraps
   * it in one; taking the queue in both places would deadlock the commit path.
   */
  async syncReferenceShards() {
    if (!getSetting("large-refs-sync")) return { skipped: "disabled", writes: 0 };
    if (this.disposed || !this.manifest) return { skipped: "disposed", writes: 0 };
    const plan = referenceShardPlan(manifestReferenceUnion(this.manifest));
    const existing = this.readReferenceShards();
    const ops = planReferenceShardWrites(plan, existing);
    let writes = 0;
    for (const uid of ops.deletes) { await deleteBlock(uid); writes += 1; }
    // `open` is passed only on creation: a user who expands the marker to look inside should not
    // find it collapsed again by the next save.
    let markerUid = existing?.uid ?? null;
    if (ops.marker?.uid) { await updateBlock(ops.marker.uid, ops.marker.string); writes += 1; }
    else if (ops.marker) { markerUid = await createBlock(this.anchorUid, ops.marker.string, "last", null, false); writes += 1; }
    for (const update of ops.updates) { await updateBlock(update.uid, update.string); writes += 1; }
    for (const string of ops.creates) { await createBlock(markerUid, string); writes += 1; }
    return { skipped: null, writes, shards: plan.shards.length, truncated: plan.truncated, total: plan.total };
  }

  /**
   * Deliberately not awaited, for the same reason as the orphan sweep: opening a grid must not wait
   * on the reference mirror, and a mirror that fails to write leaves references stale rather than
   * wrong. This is also the reconciliation the design leans on — a shard write lost after a commit
   * is recomputed from the manifest the next time the grid is opened.
   */
  scheduleReferenceSync() {
    this.refsSync = this.queue.run(() => this.syncReferenceShards()).catch(() => ({ skipped: "error", writes: 0 }));
    return this.refsSync;
  }

  /**
   * A hard refuse on every concurrent write was throwing away the common case: content-addressed
   * immutable chunks make two writers who touched different row blocks trivially reconcilable. So
   * the pointer is now a compare-and-swap target — plan a merge against whatever it names, write the
   * merged manifest, and re-read the pointer immediately before claiming it. Three attempts, because
   * a pointer that keeps moving is contention a fourth round-trip will not resolve.
   */
  async commit() {
    return this.queue.run(async () => {
      if (!this.dirty.size && !this.metadataDirty) return this.manifest;
      const dirtyChunks = [...this.dirty].sort((a, b) => a - b);
      // Read once, outside the attempt loop: a setting that flipped mid-save would otherwise put
      // half a union in the manifest this commit writes.
      const mirrorReferences = getSetting("large-refs-sync");
      // Chunk bytes are content-addressed and say nothing about which manifest wins, so they are
      // uploaded once and reused across attempts rather than re-uploaded into fresh garbage.
      let uploaded = null;
      for (let attempt = 1; attempt <= LARGE_COMMIT_ATTEMPTS; attempt += 1) {
        // Read at the top of the attempt rather than beside the manifest snapshot: on a merge the
        // plan is computed from `this.manifest` several awaits before the clone, and only an epoch
        // taken before both guarantees every missed write lands after it and gets replayed. Ops are
        // idempotent, so the writes this does capture are replayed as no-ops.
        const metadataSnapshot = this.metadataEpoch;
        const liveUrl = this.livePointerUrl();
        const plan = liveUrl === this.manifestUrl ? null : await this.planLiveMerge(liveUrl, dirtyChunks);
        const source = plan ? plan.manifest : this.manifest;
        const chunks = source.chunks.map((chunk) => ({ ...chunk }));
        const replaced = [];
        // Serializing a hundred dirty chunks behind one another made saving a large paste as slow as
        // the round-trip count. Each upload carries its own text, digest and index through a single
        // worker and the results come back in input order, so four in-flight uploads cannot cross a
        // digest onto a neighbouring chunk and `chunks`/`replaced` end up identical to the serial form.
        uploaded ||= await mapWithConcurrency(dirtyChunks, LARGE_UPLOAD_CONCURRENCY, async (index) => {
          const chunk = this.cache.get(index);
          // The stamp is read in the same synchronous step that serializes the chunk. An edit can
          // only land at an `await`, so these bytes and this epoch describe the same chunk — which
          // is what lets the clear below tell an uploaded chunk from one a keystroke has moved on.
          const epoch = this.dirtyEpoch.get(index);
          const text = JSON.stringify(chunk);
          // Derived in the same synchronous step as the bytes, so the entry's `refs` describe the
          // exact rows its `digest` covers. A chunk this commit does not touch keeps whatever it
          // already carried, which is what makes the union incremental instead of a whole-grid read.
          const refs = mirrorReferences ? deriveChunkReferences(chunk.rows) : null;
          const digest = await sha256Hex(text);
          const url = await uploadText(text, `roam-grid-${this.anchorUid}-${index}-${cryptoId()}.json`);
          return { index, url, digest, epoch, refs, startRow: chunk.startRow, rowCount: chunk.rows.length };
        });
        for (const entry of uploaded) {
          const existing = chunks.find((item) => item.index === entry.index);
          if (existing) { replaced.push(existing.url); existing.url = entry.url; existing.digest = entry.digest; existing.rowCount = entry.rowCount; if (entry.refs) existing.refs = entry.refs; }
          else chunks.push({ index: entry.index, startRow: entry.startRow, rowCount: entry.rowCount, url: entry.url, digest: entry.digest, refs: entry.refs || [] });
        }
        const retained = [liveUrl, ...manifestRetained(source).slice(0, 1), ...replaced];
        // A url that falls out of `retained` is unreachable from every revision a reader can still
        // resolve, so this is where a superseded file becomes collectable. It carries the moment it
        // died rather than being deleted here: a client that loaded the previous manifest a second
        // ago is still reading these chunks, and the grace clock is what waits that reader out.
        const retired = manifestRetained(source).filter((url) => !retained.includes(url)).map((url) => ({ url, deadAt: new Date().toISOString() }));
        const next = { ...deepClone(source), revision: cryptoId(), previous: liveUrl, lineage: extendLineage(source), updatedAt: new Date().toISOString(), chunks, retained, garbage: manifestGarbage({ garbage: [...manifestGarbage(source), ...retired] }) };
        const url = await uploadJson(next, `roam-grid-${this.anchorUid}-manifest-${next.revision}.json`);
        const verified = normalizeManifest(await downloadJson(url));
        if (this.disposed) throw new GridError("DISPOSED", "Roam Grid unloaded before this large grid finished saving");
        // The comparison has to be the last thing before the swap. Everything above it is round
        // trips, and a pointer read taken before them proves nothing about the pointer now.
        if (this.livePointerUrl() !== liveUrl) continue;
        await updateBlock(this.pointerUid, `${MANIFEST_PREFIX} ${url}`);
        for (const index of plan?.theirChunks || []) this.dropResidentChunk(index);
        this.manifest = verified;
        this.baseManifest = deepClone(verified);
        this.manifestUrl = url;
        // Only the chunks whose exact bytes went into this manifest stop being dirty. `dirty.clear()`
        // also erased any chunk a keystroke had touched since its upload, which is a silently lost
        // edit: the value survives in the resident chunk, but nothing was left to say it needed
        // saving. A chunk whose stamp has moved keeps its mark and rides the next commit instead.
        for (const entry of uploaded) {
          if (this.dirtyEpoch.get(entry.index) !== entry.epoch) continue;
          this.dirty.delete(entry.index);
          this.dirtyEpoch.delete(entry.index);
        }
        const replayed = this.replayMetadataJournal(metadataSnapshot);
        this.metadataDirty = replayed.applied > 0;
        this.metricsVersion += 1;
        // After the pointer swap and inside this same queue turn — never per attempt. An attempt
        // that retried has written no shard, so there is nothing to roll back, and a shard write
        // that fails here leaves the mirror stale rather than wrong: the manifest is already
        // committed, and the next open recomputes the shards from it.
        try { await this.syncReferenceShards(); } catch { /* stale references are the designed failure mode */ }
        return verified;
      }
      throw new GridError("CONFLICT", "Large grid kept changing while this save was in flight. Reload or save as a copy.", { reason: "cas", attempts: LARGE_COMMIT_ATTEMPTS, baseUrl: this.manifestUrl });
    });
  }

  /**
   * Opt-in, at most once per grid per session, and only on a grid nothing has saved for an hour —
   * because the one thing this must never do is delete a file another client is still reading, and
   * a quiet grid is the cheapest available evidence that no save is in flight anywhere. It runs
   * inside the same `MutationQueue` as `commit`, so it cannot interleave with one that is uploading.
   *
   * Successes are dropped from `garbage` and failures are kept, so a url the API refused is retried
   * next session rather than assumed gone. The pruned list is only marked dirty — no manifest is
   * uploaded and no pointer is swapped for a garbage collection, which would itself create garbage;
   * it rides along with the next ordinary save.
   */
  async collectOrphans({ now = Date.now } = {}) {
    if (!getSetting("large-gc-orphans")) return { skipped: "disabled", deleted: [], failed: [] };
    if (this.disposed) return { skipped: "disposed", deleted: [], failed: [] };
    if (orphanCollections.has(this.anchorUid)) return { skipped: "session", deleted: [], failed: [] };
    orphanCollections.add(this.anchorUid);
    return this.queue.run(async () => {
      if (this.disposed) return { skipped: "disposed", deleted: [], failed: [] };
      const at = now();
      const touched = Date.parse(this.manifest?.updatedAt || this.manifest?.createdAt || "");
      // A manifest that cannot say when it was last written cannot be shown to be quiet.
      if (!Number.isFinite(touched)) return { skipped: "unknown-age", deleted: [], failed: [] };
      if (at - touched < LARGE_GC_QUIET_MS) return { skipped: "recent", deleted: [], failed: [] };
      const { collect, keep } = planOrphanCollection(this.manifest, this.manifestUrl, at);
      const deleted = []; const failed = [];
      for (const entry of collect) {
        if (this.disposed) { failed.push(entry); continue; }
        if (!await deleteFile(entry.url)) { failed.push(entry); continue; }
        deleted.push(entry.url);
        await this.chunkCache.delete(entry.url);
      }
      this.manifest.garbage = [...keep, ...failed];
      if (deleted.length) this.metadataDirty = true;
      return { skipped: null, deleted, failed: failed.map((entry) => entry.url) };
    });
  }

  /** Streamed through `seedFrom`: the copy never holds more than one destination chunk of rows. */
  async saveAsCopy(newAnchorUid) { return new LargeGridStore(newAnchorUid).initialize(null, this); }

  async toModel(limit = getSetting("writes-native-budget")) {
    if (this.manifest.rowCount * this.manifest.colCount > limit) throw new GridError("MUTATION_BUDGET", "Large grid exceeds the safe native-table conversion budget");
    const rows = []; const chunkSize = chunkRowsFor(this.manifest);
    for (let start = 0; start < this.manifest.rowCount; start += chunkSize) rows.push(...await this.getRows(start, Math.min(this.manifest.rowCount, start + chunkSize)));
    return applyManifestAlignments(applyManifestRowHeights(new GridModel({ rows, columnIds: this.manifest.columnIds, widths: this.manifest.widths, frozenRows: this.manifest.frozenRows, frozenCols: this.manifest.frozenCols, merges: this.manifest.merges, charts: this.manifest.charts, imageLayout: this.manifest.imageLayout, showHeaders: this.manifest.showHeaders !== false, fitToWidth: this.manifest.fitToWidth !== false, colorFormulaCells: this.manifest.colorFormulaCells !== false }), this.rowHeightIndexMap()), this.alignmentIndexMap());
  }
}

// BEM double-underscore is current Roam; the single-dash class is kept for compat and the
// `block-input-` id prefix is the safety net that never depends on Roam's class names.
const ROAM_BLOCK_INPUT_SELECTOR = ".rm-block__input,.rm-block-input,[id^='block-input-']";

function roamBlockInputFor(target) { return target?.closest?.(ROAM_BLOCK_INPUT_SELECTOR) || null; }

/**
 * A block-input id carries a window path before the uid — `block-input-sidebar-block-<window>-<uid>`
 * and `block-input-<user>-body-outline-<page>-<uid>` are both real — so anchoring on the prefix and
 * taking `(.+)` returns the whole tail, not a uid. The DOM-provided uid is unambiguous and wins;
 * the id is parsed the way `rangeBlockUid` parses it, as the trailing 9-character Roam uid.
 */
export function uidFromFocusTarget(target) {
  const input = roamBlockInputFor(target);
  if (!input) return null;
  return input.dataset?.uid || input.closest?.("[data-uid]")?.dataset?.uid || /-([\w-]{9})$/.exec(String(input.id || ""))?.[1] || null;
}

function rememberFocusedUid(event) {
  const uid = uidFromFocusTarget(event.target);
  if (uid) runtime.lastFocusedUid = uid;
}

function focusedUid() {
  const uid = roam().ui.getFocusedBlock?.()?.["block-uid"] || null;
  if (uid) runtime.lastFocusedUid = uid;
  return uid || runtime.lastFocusedUid;
}

function gridViewUid(view) {
  return view?.model?.tableUid || view?.store?.anchorUid || view?.root?.dataset?.roamGridUid || null;
}

export function keyboardOwner() { return runtime.keyboardOwner; }

/**
 * Marks `view` as the single grid that owns the keyboard until something else claims or releases it.
 * A hover-preview mount shares its session with the real document view, and a read-only excerpt has
 * no keydown handler at all, so neither may hold the keyboard. The refusal RELEASES rather than
 * returning the incumbent: leaving a previously focused grid as owner would let keystrokes aimed at
 * a popover drive an off-screen grid.
 */
export function claimKeyboard(view) {
  if (!view || view.disposed) return runtime.keyboardOwner;
  if (view.surface === "preview" || typeof view.onKeydown !== "function") return releaseKeyboard();
  const previous = runtime.keyboardOwner;
  if (previous?.view && previous.view !== view) previous.view.root?.classList?.toggle?.("rg-root--interaction-active", false);
  runtime.keyboardOwner = { uid: gridViewUid(view), view, kind: view.store ? "large" : "native" };
  view.root?.classList?.toggle?.("rg-root--interaction-active", true);
  return runtime.keyboardOwner;
}

/** Releases keyboard ownership. With a view argument it only releases when that view still owns it. */
export function releaseKeyboard(view = null) {
  const owner = runtime.keyboardOwner;
  if (!owner || (view && owner.view !== view)) return owner;
  owner.view?.root?.classList?.toggle?.("rg-root--interaction-active", false);
  runtime.keyboardOwner = null;
  return null;
}

/** Resolves the grid UID that owns a body-mounted portal (context menu, axis menu, editor popover, dialog). */
export function portalOwnerUid(target) {
  return target?.closest?.("[data-rg-owner]")?.dataset?.rgOwner || null;
}

function tagPortalOwner(node, uid) {
  if (node && uid) node.dataset.rgOwner = uid;
  return node;
}

function ownerViewForUid(uid) {
  if (!uid) return null;
  const session = runtime.sessions.get(uid);
  if (session) for (const view of session.views) if (view.root?.isConnected) return view;
  return runtime.largeMounts.get(uid) || null;
}

/** Asks whether Roam owns this input, which is true whether or not its uid can be recovered. */
export function isRoamBlockInput(target) { return Boolean(roamBlockInputFor(target)); }

function isGridEditorInput(target) { return Boolean(target?.closest?.(".rg-editor,.rg-floating-editor-input,.rg-dialog-input")); }

export function onGlobalPointerDown(event) {
  const target = event?.target;
  const root = target?.closest?.(".rg-root");
  if (root) return root.__rgView ? claimKeyboard(root.__rgView) : runtime.keyboardOwner;
  const portalUid = portalOwnerUid(target);
  if (!portalUid) return releaseKeyboard();
  if (runtime.keyboardOwner?.uid === portalUid) return runtime.keyboardOwner;
  const view = ownerViewForUid(portalUid);
  return view ? claimKeyboard(view) : runtime.keyboardOwner;
}

export function onGlobalFocusIn(event) {
  if (isRoamBlockInput(event?.target)) releaseKeyboard();
}

/**
 * The extension's only window keydown listener. Roam has no JS undo handler — it relies on the
 * browser's native undo — so `preventDefault()` is what keeps ⌘Z from reaching a text input.
 */
export function onGlobalKeydown(event) {
  // This window listener fires BEFORE any dialog-level listener, so a modal lightbox cannot rely on
  // stopImmediatePropagation alone to keep its keys off the concealed grid: if a stray re-claim left
  // the grid owning the keyboard, route nothing to it while a lightbox owns the screen (FIX-1). Keys
  // typed into the modal are handled by the lightbox's own capture listener on the dialog.
  if (event?.target?.closest?.(".rg-lightbox")) return;
  const owner = runtime.keyboardOwner;
  if (!owner?.view || owner.view.disposed) return;
  const undoCombo = (event.metaKey || event.ctrlKey) && String(event.key ?? "").toLowerCase() === "z";
  if (!undoCombo) return owner.view.onKeydown(event);
  if (isRoamBlockInput(event.target)) return;
  if (isGridEditorInput(event.target)) return;
  const method = event.shiftKey ? "redo" : "undo";
  if (typeof owner.view[method] !== "function") return owner.view.onKeydown(event);
  event.preventDefault();
  event.stopImmediatePropagation();
  return owner.view[method]();
}

export function installKeyboardOwnership() {
  globalThis.window?.addEventListener?.("keydown", onGlobalKeydown, true);
  document.addEventListener("pointerdown", onGlobalPointerDown, true);
  document.addEventListener("focusin", onGlobalFocusIn, true);
  const dispose = () => {
    globalThis.window?.removeEventListener?.("keydown", onGlobalKeydown, true);
    document.removeEventListener("pointerdown", onGlobalPointerDown, true);
    document.removeEventListener("focusin", onGlobalFocusIn, true);
    releaseKeyboard();
  };
  runtime.disposers.push(dispose);
  return dispose;
}

export function commentArmingState() { return Boolean(runtime.commentArmed); }

/** `Hover` is the default the user asked for: on a grid cell — a much denser, more deliberate target
 *  than a Roam block — the modifier that makes sense for a block is friction.  `Cmd/Ctrl + hover`
 *  stays available for anyone who finds a permanent hover target noisy, and for Roam-native parity. */
export function commentHoverAlways() { return getSetting("comments-affordance-trigger") === COMMENT_TRIGGER_HOVER; }

/** Records the modifier state and lets every mounted grid recompute what it wants.  Large grids do not
 *  implement `syncCommentAffordance` at all — their cells are JSON rows with no block uid to comment on. */
export function setCommentArming(armed) {
  const next = Boolean(armed);
  if (runtime.commentArmed === next) return next;
  runtime.commentArmed = next;
  // RangeGridView deliberately omits syncCommentAffordance — this `?.` is what lets a range excerpt skip comment chrome. Keep it.
  for (const view of runtime.views) view.syncCommentAffordance?.();
  return next;
}

/**
 * The modifier lane costs four window listeners and one flag.  No `mousemove`, no per-cell listeners,
 * and in `Cmd/Ctrl + hover` mode nothing at all in the DOM until the modifier is actually held.  In
 * `Hover` mode the modifier is not a gesture at all, so it must not arm — a keyup would otherwise tear
 * down the very listener that mode wants permanent.
 */
export function installCommentAffordance({ target = globalThis.window } = {}) {
  const isModifier = (event) => event?.key === "Meta" || event?.key === "Control";
  const onKeydown = (event) => { if (isModifier(event) && getSetting("comments-enabled") && !commentHoverAlways()) setCommentArming(true); };
  const onKeyup = (event) => { if (isModifier(event)) setCommentArming(false); };
  const disarm = () => setCommentArming(false);
  target?.addEventListener?.("keydown", onKeydown, true);
  target?.addEventListener?.("keyup", onKeyup, true);
  target?.addEventListener?.("blur", disarm);
  target?.addEventListener?.("visibilitychange", disarm);
  const dispose = () => {
    target?.removeEventListener?.("keydown", onKeydown, true);
    target?.removeEventListener?.("keyup", onKeyup, true);
    target?.removeEventListener?.("blur", disarm);
    target?.removeEventListener?.("visibilitychange", disarm);
    setCommentArming(false);
  };
  runtime.disposers.push(dispose);
  return dispose;
}

function blockString(uid) {
  const result = roam().data?.pull?.("[:block/string]", [":block/uid", uid]) || roam().pull?.("[:block/string]", [":block/uid", uid]);
  return result?.[":block/string"] ?? result?.string ?? "";
}

function ancestorWithMarker(uid, marker) {
  if (!uid) return null;
  if (marker.test(blockString(uid))) return uid;
  const safeUid = String(uid).replace(/["\\]/g, "");
  const result = roam().q(`[:find ?uid ?string :where [?child :block/uid "${safeUid}"] [?child :block/parents ?parent] [?parent :block/uid ?uid] [?parent :block/string ?string]]`);
  return result.find(([, string]) => marker.test(string || ""))?.[0] || null;
}

function blockParentPosition(uid) {
  if (!uid) return null;
  const safeUid = String(uid).replace(/["\\]/g, "");
  const result = roam().q(`[:find ?parentUid ?order :where [?block :block/uid "${safeUid}"] [?parent :block/children ?block] [?parent :block/uid ?parentUid] [?block :block/order ?order]]`);
  return result?.[0] ? { parentUid: result[0][0], order: result[0][1] } : null;
}

async function insertAfterBlock(uid, string) {
  const position = blockParentPosition(uid);
  if (position) return createBlock(position.parentUid, string, position.order + 1);
  const pageUid = await roam().ui.mainWindow.getOpenPageOrBlockUid();
  return createBlock(pageUid, string, "last");
}

async function insertNearFocus(string) {
  let current = focusedUid();
  if (!current) {
    const parentUid = await roam().ui.mainWindow.getOpenPageOrBlockUid();
    return createBlock(parentUid, string, "last");
  }
  current = ancestorWithMarker(current, NATIVE_MARKER) || ancestorWithMarker(current, LARGE_MARKER) || current;
  const position = blockParentPosition(current);
  if (position) return createBlock(position.parentUid, string, position.order + 1);
  return createBlock(current, string, "last");
}

function applyPatchToModel(model, patch, recordUndo = true) {
  const patches = Array.isArray(patch) ? patch : [patch];
  const apply = () => {
    for (const item of patches) {
      switch (item.op) {
        case "set": model.setRaw(item.row, item.col, item.value); break;
        case "merge": model.merge(item.range); break;
        case "unmerge": model.unmerge(item.row, item.col); break;
        case "insertRows": model.insertRows(item.index, item.count); break;
        case "deleteRows": model.deleteRows(item.index, item.count); break;
        case "insertCols": model.insertCols(item.index, item.count); break;
        case "deleteCols": model.deleteCols(item.index, item.count); break;
        case "moveRange": model.moveRange(item.range, item.row, item.col); break;
        case "reorderRows": model.reorderRows(item.from, item.to); break;
        case "reorderCols": model.reorderCols(item.from, item.to); break;
        case "sort": model.sortBy(item.col, item.direction, item.headerRows); break;
        default: throw new GridError("PATCH", `Unknown grid patch operation ${item.op}`);
      }
    }
  };
  return recordUndo ? model.transact("API patch", apply) : apply();
}

function patchChangesLayout(patch) {
  return (Array.isArray(patch) ? patch : [patch]).some((item) => item.op !== "set");
}

/** Case-insensitively deduped template list: registry display name wins the label over a saved
 *  template that differs only by case, and resolution precedence is unchanged (registry first). */
export function savedTemplateNameList(registry = runtime.registries, store = runtime.templates) {
  const byKey = new Map();
  for (const key of registry?.templates?.keys?.() || []) {
    const display = registry.templateDisplayNames?.get(key) || key;
    if (!byKey.has(key)) byKey.set(key, display);
  }
  for (const name of store?.list?.() || []) {
    const key = String(name).toUpperCase();
    if (!byKey.has(key)) byKey.set(key, name);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

function createPublicApi() {
  const registries = runtime.registries;
  return {
    version: VERSION,
    registerFormulaFunction: (name, fn, options) => registries.registerFormulaFunction(name, fn, options),
    registerCellRenderer: (name, renderer) => registries.register(registries.cellRenderers, name, renderer),
    registerCellEditor: (name, editor) => registries.register(registries.cellEditors, name, editor),
    registerImporter: (name, importer) => registries.register(registries.importers, name, importer),
    registerExporter: (name, exporter) => registries.register(registries.exporters, name, exporter),
    registerDataSource: (name, source) => registries.register(registries.dataSources, name, source),
    registerTemplate: (name, template) => registries.registerTemplate(name, template),
    listTemplates: () => savedTemplateNameList(registries, runtime.templates),
    saveTemplate: async (name, tableUid = activeGridUid()) => {
      const model = tableUid ? runtime.sessions.get(tableUid)?.model || (runtime.metadata.has(tableUid) ? new NativeTableAdapter(tableUid).load() : null) : null;
      if (!model) throw new GridError("TEMPLATE_SOURCE", "Focus an enhanced native grid before saving a template");
      return runtime.templates.save(name, model, { confirmOverwrite: false });
    },
    createFromTemplate: async (name) => createNativeTableFromModel(await resolveTemplateModel(name)),
    getTableModel: (tableUid) => {
      const session = runtime.sessions.get(tableUid);
      if (session?.model) return deepClone(session.model.toJSON());
      if (!runtime.metadata.has(tableUid)) return null;
      return new NativeTableAdapter(tableUid).load().toJSON();
    },
    applyPatch: async (tableUid, patch) => {
      const session = runtime.sessions.get(tableUid);
      if (session) return session.applyPatch(patch);
      const adapter = new NativeTableAdapter(tableUid);
      const model = adapter.load();
      applyPatchToModel(model, patch);
      const saved = await adapter.save(model, { saveMetadata: patchChangesLayout(patch) });
      globalThis.window?.dispatchEvent(new CustomEvent("roam-grid:changed", { detail: { tableUid, patch } }));
      return saved.toJSON();
    },
    importGrid,
    exportGrid,
    renderChartSvg,
  };
}

export function toast(message, intent = "primary", timeout = 4500, { action = null } = {}) {
  if (!runtime.extensionAPI) return;
  if (!notificationAllowed(intent, Boolean(action))) return;
  const container = document.querySelector(".rg-toasts") || (() => {
    const element = document.createElement("div");
    element.className = "rg-toasts";
    document.body.appendChild(element);
    return element;
  })();
  const item = document.createElement("div");
  item.className = `rg-toast rg-toast--${intent}`;
  if (!action) item.textContent = message;
  else {
    const text = document.createElement("span");
    text.className = "rg-toast-message";
    text.textContent = message;
    const control = document.createElement("button");
    control.type = "button";
    control.className = "rg-toast-action";
    control.textContent = action.label;
    control.addEventListener("click", () => { item.remove(); action.onClick(); });
    item.appendChild(text); item.appendChild(control);
  }
  container.appendChild(item);
  trackedTimeout(() => item.remove(), timeout);
}

function button(label, title, action, className = "") {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `bp3-button bp3-minimal rg-button ${className}`.trim();
  element.textContent = label;
  element.title = title;
  element.addEventListener("click", action);
  return element;
}

const GRID_THEME_FALLBACKS = Object.freeze({
  "--rg-bg": "#ffffff",
  "--rg-color": "#182026",
  "--rg-toolbar": "#ffffff",
  "--rg-header": "#f6f7f9",
  "--rg-border": "#d3d8de",
  "--rg-border-strong": "#c5cbd3",
  "--rg-muted": "#5f6b7c",
  "--rg-active": "#2d72d2",
});

const GRID_THEME_DARK = Object.freeze({
  "--rg-bg": "#1c2127",
  "--rg-color": "#f6f7f9",
  "--rg-toolbar": "#1c2127",
  "--rg-header": "#252a31",
  "--rg-border": "#404854",
  "--rg-border-strong": "#5f6b7c",
  "--rg-muted": "#abb3bf",
  "--rg-active": "#48aff0",
});

/** `Follow Roam` derives the palette from the host; the other two pin it and skip the host read. */
export function pinnedGridThemePalette(mode = getSetting("appearance-theme")) {
  if (mode === "Light") return GRID_THEME_FALLBACKS;
  if (mode === "Dark") return GRID_THEME_DARK;
  return null;
}

function resyncGridTheme(surface) {
  runtime.gridThemePalette = null;
  runtime.gridThemeSignature = null;
  if (surface?.session) surface.session.themePalette = null;
  if (typeof surface?.themeBridge?.sync === "function") return surface.themeBridge.sync();
  const pinned = pinnedGridThemePalette();
  return pinned ? applyGridThemeValues(surface?.root, pinned) : null;
}

function applyGridThemeValues(gridRoot, values) {
  if (!gridRoot?.style) return false;
  const previous = gridRoot.__rgGridPalette || {};
  let changed = false;
  for (const [property, value] of Object.entries(values || {})) {
    if (previous[property] === value) continue;
    gridRoot.style.setProperty(property, value); changed = true;
  }
  gridRoot.__rgGridPalette = { ...(values || {}) };
  return changed;
}

function gridThemeSignature(nativeElement) {
  let themeContainer = null;
  try { themeContainer = nativeElement?.closest?.("[data-theme], [data-color-mode], .bp3-dark, .bp4-dark, .bp5-dark, [class*='theme-']") || null; } catch { themeContainer = null; }
  const html = globalThis.document?.documentElement;
  const body = globalThis.document?.body;
  return [html?.className, html?.getAttribute?.("data-theme"), body?.className, body?.getAttribute?.("data-theme"), themeContainer?.className, themeContainer?.getAttribute?.("data-theme")].map((value) => String(value || "")).join("|");
}

function colorIsTransparent(value) {
  const color = String(value || "").trim().toLowerCase();
  return !color || color === "transparent" || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color);
}

function colorLooksDark(value) {
  const values = String(value || "").match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!values || values.length < 3) return false;
  return (0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]) < 128;
}

function nearestOpaqueBackground(element, getStyle) {
  const seen = new Set();
  for (let node = element; node && !seen.has(node); node = node.parentElement || node.parentNode) {
    seen.add(node);
    const color = styleValue(computedStyleOf(node, getStyle), "background-color");
    if (!colorIsTransparent(color)) return color;
  }
  return "";
}

/** Copies resolved host colors into extension-owned tokens before the native table is hidden. */
export function syncGridThemeFromHost(nativeElement, gridRoot, getStyle = globalThis.getComputedStyle) {
  if (!gridRoot?.style) return { changed: false, values: { ...GRID_THEME_FALLBACKS } };
  const pinned = pinnedGridThemePalette();
  if (pinned) return { changed: applyGridThemeValues(gridRoot, pinned), values: { ...pinned } };
  const host = nativeElement?.parentElement || gridRoot.parentElement || globalThis.document?.body || null;
  const cell = nativeElement?.querySelector?.("td,th,[role='gridcell']") || null;
  const hostStyle = computedStyleOf(host, getStyle);
  const cellStyle = computedStyleOf(cell, getStyle);
  const bodyStyle = computedStyleOf(globalThis.document?.body, getStyle);
  const background = nearestOpaqueBackground(host, getStyle) || styleValue(bodyStyle, "background-color", GRID_THEME_FALLBACKS["--rg-bg"]);
  const color = styleValue(hostStyle, "color", styleValue(bodyStyle, "color", GRID_THEME_FALLBACKS["--rg-color"]));
  const muted = styleValue(computedStyleOf(nativeElement, getStyle), "color", color);
  const nativeBorder = styleValue(cellStyle, "border-right-color", styleValue(cellStyle, "border-top-color"));
  const border = colorIsTransparent(nativeBorder) ? (colorLooksDark(background) ? "#5f6b7c" : GRID_THEME_FALLBACKS["--rg-border"]) : nativeBorder;
  const active = colorLooksDark(background) ? "#48aff0" : GRID_THEME_FALLBACKS["--rg-active"];
  const values = {
    "--rg-bg": background,
    "--rg-color": color,
    "--rg-toolbar": background,
    "--rg-header": `color-mix(in srgb, ${background} 88%, ${color} 12%)`,
    "--rg-border": `color-mix(in srgb, ${background} 62%, ${border} 38%)`,
    "--rg-border-strong": `color-mix(in srgb, ${background} 42%, ${border} 58%)`,
    "--rg-muted": muted,
    "--rg-active": active,
  };
  const changed = applyGridThemeValues(gridRoot, values);
  return { changed, values };
}

/** Observes host theme boundaries without adding computed-style work to the typing path. */
export function createGridThemeBridge(nativeElement, gridRoot, {
  getStyle = globalThis.getComputedStyle,
  MutationObserverClass = globalThis.MutationObserver,
  matchMedia = globalThis.matchMedia,
  initialSync = true,
  onSync = null,
} = {}) {
  let disposed = false; let frame = null;
  const sync = () => {
    const result = disposed ? { changed: false, values: gridRoot?.__rgGridPalette || {} } : syncGridThemeFromHost(nativeElement, gridRoot, getStyle);
    if (!disposed) onSync?.(result);
    return result;
  };
  const schedule = () => {
    if (disposed || frame != null) return;
    const requestFrame = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
    frame = requestFrame(() => { frame = null; sync(); });
  };
  let observer = null;
  if (typeof MutationObserverClass === "function") {
    observer = new MutationObserverClass(schedule);
    const seen = new Set();
    let themeContainer = null;
    try { themeContainer = nativeElement?.closest?.("[data-theme], [data-color-mode], .bp3-dark, .bp4-dark, .bp5-dark, [class*='theme-']") || null; } catch { themeContainer = null; }
    for (const node of [globalThis.document?.documentElement, globalThis.document?.body, themeContainer]) {
      if (!node || seen.has(node)) continue; seen.add(node);
      try { observer.observe(node, { attributes: true, attributeFilter: ["class", "style"] }); } catch { /* detached MiniDOM node */ }
    }
  }
  let colorSchemeQuery = null;
  if (typeof matchMedia === "function") {
    try {
      colorSchemeQuery = matchMedia.call(globalThis, "(prefers-color-scheme: dark)");
      if (typeof colorSchemeQuery?.addEventListener === "function") colorSchemeQuery.addEventListener("change", schedule);
      else colorSchemeQuery?.addListener?.(schedule);
    } catch { colorSchemeQuery = null; }
  }
  if (initialSync) sync();
  return {
    sync,
    dispose() {
      if (disposed) return;
      disposed = true; observer?.disconnect?.(); observer = null;
      if (typeof colorSchemeQuery?.removeEventListener === "function") colorSchemeQuery.removeEventListener("change", schedule);
      else colorSchemeQuery?.removeListener?.(schedule);
      colorSchemeQuery = null;
      if (frame != null && typeof globalThis.cancelAnimationFrame === "function") globalThis.cancelAnimationFrame(frame);
      frame = null;
    },
  };
}

const PORTAL_THEME_FALLBACKS = Object.freeze({
  "--rg-portal-bg": "#ffffff",
  "--rg-portal-color": "#182026",
  "--rg-portal-border": "#c5cbd3",
  "--rg-portal-header": "#f6f7f9",
  "--rg-portal-muted": "#5f6b7c",
  "--rg-portal-active": "#2d72d2",
  "--rg-portal-status": "#5f6b7c",
  "--rg-portal-success": "#087f5b",
  "--rg-portal-warning": "#a15c00",
  "--rg-portal-danger": "#b42318",
});

function styleValue(style, property, fallback = "") {
  if (!style) return fallback;
  const direct = typeof style.getPropertyValue === "function" ? style.getPropertyValue(property) : "";
  if (String(direct || "").trim()) return String(direct).trim();
  const camel = property.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
  return String(style[camel] || fallback || "").trim();
}

function computedStyleOf(element, getStyle) {
  if (!element || typeof getStyle !== "function") return null;
  try { return getStyle(element); } catch { return null; }
}

function portalThemeValuesFromGridPalette(palette) {
  if (!palette || typeof palette !== "object" || !Object.keys(palette).length) return null;
  return {
    "--rg-portal-bg": palette["--rg-bg"] || PORTAL_THEME_FALLBACKS["--rg-portal-bg"],
    "--rg-portal-color": palette["--rg-color"] || PORTAL_THEME_FALLBACKS["--rg-portal-color"],
    "--rg-portal-border": palette["--rg-border"] || palette["--rg-border-strong"] || PORTAL_THEME_FALLBACKS["--rg-portal-border"],
    "--rg-portal-header": palette["--rg-header"] || palette["--rg-toolbar"] || PORTAL_THEME_FALLBACKS["--rg-portal-header"],
    "--rg-portal-muted": palette["--rg-muted"] || PORTAL_THEME_FALLBACKS["--rg-portal-muted"],
    "--rg-portal-active": palette["--rg-active"] || PORTAL_THEME_FALLBACKS["--rg-portal-active"],
    "--rg-portal-status": palette["--rg-muted"] || PORTAL_THEME_FALLBACKS["--rg-portal-status"],
    "--rg-portal-success": palette["--rg-success"] || PORTAL_THEME_FALLBACKS["--rg-portal-success"],
    "--rg-portal-warning": palette["--rg-warning"] || PORTAL_THEME_FALLBACKS["--rg-portal-warning"],
    "--rg-portal-danger": palette["--rg-danger"] || PORTAL_THEME_FALLBACKS["--rg-portal-danger"],
  };
}

/**
 * Copies the owning grid's resolved palette onto a body-mounted Roam Grid portal.
 * The inline custom properties deliberately scope theme compatibility to our own UI.
 */
export function syncPortalThemeFromRoot(ownerRoot, portal, getStyle = globalThis.getComputedStyle) {
  if (!portal?.style) return { changed: false, values: { ...PORTAL_THEME_FALLBACKS } };
  const root = ownerRoot?.classList?.contains?.("rg-root") ? ownerRoot : ownerRoot?.closest?.(".rg-root") || null;
  portal.classList?.add?.("rg-portal");
  if (!root) {
    const previous = portal.__rgPortalPalette || {};
    let changed = false;
    for (const property of Object.keys(previous)) {
      portal.style.removeProperty?.(property); changed = true;
    }
    portal.__rgPortalPalette = {};
    return { changed, values: {} };
  }
  const cachedValues = portalThemeValuesFromGridPalette(root.__rgGridPalette);
  const rootStyle = cachedValues ? null : computedStyleOf(root, getStyle);
  const headerStyle = cachedValues ? null : computedStyleOf(root?.querySelector?.(".rg-header, .rg-toolbar"), getStyle);
  const statusStyle = cachedValues ? null : computedStyleOf(root?.querySelector?.(".rg-status"), getStyle);
  const values = cachedValues || {
    "--rg-portal-bg": styleValue(rootStyle, "background-color", styleValue(rootStyle, "--rg-bg", PORTAL_THEME_FALLBACKS["--rg-portal-bg"])),
    "--rg-portal-color": styleValue(rootStyle, "color", PORTAL_THEME_FALLBACKS["--rg-portal-color"]),
    "--rg-portal-border": styleValue(rootStyle, "border-top-color", styleValue(rootStyle, "border-color", styleValue(rootStyle, "--rg-border", PORTAL_THEME_FALLBACKS["--rg-portal-border"]))),
    "--rg-portal-header": styleValue(headerStyle, "background-color", styleValue(rootStyle, "--rg-header", PORTAL_THEME_FALLBACKS["--rg-portal-header"])),
    "--rg-portal-muted": styleValue(statusStyle, "color", styleValue(rootStyle, "--rg-muted", PORTAL_THEME_FALLBACKS["--rg-portal-muted"])),
    "--rg-portal-active": styleValue(rootStyle, "--rg-active", PORTAL_THEME_FALLBACKS["--rg-portal-active"]),
    "--rg-portal-status": styleValue(statusStyle, "color", styleValue(rootStyle, "--rg-muted", PORTAL_THEME_FALLBACKS["--rg-portal-status"])),
    "--rg-portal-success": styleValue(rootStyle, "--rg-success", PORTAL_THEME_FALLBACKS["--rg-portal-success"]),
    "--rg-portal-warning": styleValue(rootStyle, "--rg-warning", PORTAL_THEME_FALLBACKS["--rg-portal-warning"]),
    "--rg-portal-danger": styleValue(rootStyle, "--rg-danger", PORTAL_THEME_FALLBACKS["--rg-portal-danger"]),
  };
  const previous = portal.__rgPortalPalette || {};
  let changed = false;
  for (const [property, value] of Object.entries(values)) {
    if (previous[property] === value) continue;
    portal.style.setProperty(property, value); changed = true;
  }
  portal.__rgPortalPalette = values;
  return { changed, values };
}

/** Creates one cached theme bridge and observes grid ancestry plus OS color-scheme changes. */
export function createPortalThemeBridge(ownerRoot, portal, {
  getStyle = globalThis.getComputedStyle,
  MutationObserverClass = globalThis.MutationObserver,
  matchMedia = globalThis.matchMedia,
} = {}) {
  let disposed = false; let frame = null;
  const sync = () => disposed ? { changed: false, values: portal?.__rgPortalPalette || { ...PORTAL_THEME_FALLBACKS } } : syncPortalThemeFromRoot(ownerRoot, portal, getStyle);
  const schedule = () => {
    if (disposed || frame != null) return;
    const requestFrame = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
    frame = requestFrame(() => { frame = null; sync(); });
  };
  let observer = null;
  if (typeof MutationObserverClass === "function") {
    observer = new MutationObserverClass(schedule);
    const seen = new Set();
    for (let node = ownerRoot; node && !seen.has(node); node = node.parentElement || node.parentNode) {
      seen.add(node);
      try { observer.observe(node, { attributes: true, attributeFilter: ["class", "style"] }); } catch { /* MiniDOM or detached ancestor */ }
    }
  }
  let colorSchemeQuery = null;
  if (typeof matchMedia === "function") {
    try {
      colorSchemeQuery = matchMedia.call(globalThis, "(prefers-color-scheme: dark)");
      if (typeof colorSchemeQuery?.addEventListener === "function") colorSchemeQuery.addEventListener("change", schedule);
      else colorSchemeQuery?.addListener?.(schedule);
    } catch { colorSchemeQuery = null; }
  }
  sync();
  return {
    sync,
    dispose() {
      if (disposed) return;
      disposed = true; observer?.disconnect?.(); observer = null;
      if (typeof colorSchemeQuery?.removeEventListener === "function") colorSchemeQuery.removeEventListener("change", schedule);
      else colorSchemeQuery?.removeListener?.(schedule);
      colorSchemeQuery = null;
      if (frame != null && typeof globalThis.cancelAnimationFrame === "function") globalThis.cancelAnimationFrame(frame);
      frame = null;
    },
  };
}

function portalOwnerRoot(explicitRoot = null) {
  return explicitRoot || activeMount()?.root || document.querySelector?.(".rg-root:focus-within") || document.querySelector?.(".rg-root") || null;
}

function showPrompt(title, value = "", ownerRoot = null) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "rg-dialog-overlay";
    const dialog = document.createElement("form");
    dialog.className = "bp3-dialog rg-dialog";
    dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true");
    const heading = document.createElement("h4"); heading.className = "bp3-heading"; heading.textContent = title;
    const input = document.createElement("input"); input.className = "bp3-input rg-dialog-input"; input.value = value;
    const footer = document.createElement("div"); footer.className = "rg-dialog-footer";
    const cancel = button("Cancel", "Cancel", () => finish(null));
    const accept = button("OK", "Accept", () => finish(input.value), "bp3-intent-primary");
    footer.append(cancel, accept); dialog.append(heading, input, footer); overlay.appendChild(dialog);
    const owner = portalOwnerRoot(ownerRoot); tagPortalOwner(overlay, owner?.dataset?.roamGridUid); document.body.appendChild(overlay);
    const theme = createPortalThemeBridge(owner, overlay);
    const finish = (result) => { theme.dispose(); overlay.remove(); document.removeEventListener("keydown", onKey, true); resolve(result); };
    overlay.__rgDismiss = () => finish(null);
    const onKey = (event) => { if (event.key === "Escape") { event.preventDefault(); finish(null); } };
    dialog.addEventListener("submit", (event) => { event.preventDefault(); finish(input.value); });
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) finish(null); });
    document.addEventListener("keydown", onKey, true);
    setTimeout(() => { input.focus(); input.select(); });
  });
}

function showChoice(title, choices, ownerRoot = null) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div"); overlay.className = "rg-dialog-overlay";
    const dialog = document.createElement("div"); dialog.className = "bp3-dialog rg-dialog";
    dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true");
    const heading = document.createElement("h4"); heading.className = "bp3-heading"; heading.textContent = title;
    const list = document.createElement("div"); list.className = "rg-choice-list";
    const owner = portalOwnerRoot(ownerRoot); tagPortalOwner(overlay, owner?.dataset?.roamGridUid);
    const theme = createPortalThemeBridge(owner, overlay);
    const finish = (value) => { theme.dispose(); overlay.remove(); resolve(value); };
    overlay.__rgDismiss = () => finish(null);
    for (const choice of choices) list.appendChild(button(choice.label, choice.description || choice.label, () => finish(choice.value), choice.primary ? "bp3-intent-primary" : ""));
    dialog.append(heading, list); overlay.appendChild(dialog); document.body.appendChild(overlay);
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) finish(null); });
  });
}

/** A `.enc` firebase URL is an encrypted blob Roam decrypts through `renderString`; fetching it
 *  directly (a plain download or new-tab open) returns ciphertext, so the download affordance hides
 *  for it (LP-4). Matches `.enc` at the path end or before a query/fragment/param delimiter. */
function isEncryptedImageUrl(url) {
  return /\.enc(?:$|[?#&])/iu.test(String(url ?? ""));
}

/**
 * The image lightbox: a native modal `<dialog>` that pages the whole column of images. It reuses the
 * `showChoice` portal skeleton — `tagPortalOwner` + `createPortalThemeBridge` + `__rgDismiss` +
 * backdrop dismiss — and renders the current `![alt](url)` through `renderString` into a host so the
 * encrypted `.enc` blob decrypts exactly as it does in a cell (LP-3); we NEVER build an `<img src>`.
 * Because a modal dialog owns the keyboard, opening RELEASES grid keyboard ownership and closing
 * re-claims it after returning focus to the grid root — so a grid `onKeydown` can never fire under
 * the open dialog (LP-9 is verified live).
 * `entries:[{raw,alt,url,row,col,occurrence?}]`; `onDelete` (when supplied) receives
 * `{entry, raw}` where `raw` is the cell string with this image removed, and performs the mutation.
 */
export function openImageLightbox({ ownerRoot = null, entries = [], startIndex = 0, onDelete = null } = {}) {
  const list = Array.isArray(entries) ? entries.filter((entry) => entry && entry.url) : [];
  if (!list.length) return null;
  let index = clamp(Math.floor(Number(startIndex) || 0), 0, list.length - 1);
  let actualSize = false;
  const owner = portalOwnerRoot(ownerRoot);
  const ownerView = ownerRoot?.__rgView || owner?.__rgView || null;

  const dialog = document.createElement("dialog");
  dialog.className = "rg-portal rg-lightbox";
  dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true");
  const header = document.createElement("div"); header.className = "rg-lightbox-header";
  const title = document.createElement("span"); title.className = "rg-lightbox-title";
  const counter = document.createElement("span"); counter.className = "rg-lightbox-counter";
  header.append(title, counter);
  const body = document.createElement("div"); body.className = "rg-lightbox-body";
  const host = document.createElement("span"); host.className = "rg-rich-host rg-lightbox-image";
  body.appendChild(host);
  const footer = document.createElement("div"); footer.className = "rg-lightbox-footer";
  dialog.append(header, body, footer);
  // A modal lightbox must NOT carry the keyboard-owning `data-rg-owner` tag: a pointerdown inside it
  // would make `onGlobalPointerDown` re-claim the keyboard for the concealed grid, after which its
  // ←/→/printable keys drive the hidden grid instead of the lightbox (FIX-1). The theme bridge takes
  // the owner root directly and needs no tag; a passive `data-rg-lightbox-owner` marker lets the
  // session-teardown sweep (FIX-2) find this portal WITHOUT arming the pointerdown re-claim.
  const lightboxOwnerUid = owner?.dataset?.roamGridUid || gridViewUid(ownerView);
  if (lightboxOwnerUid) dialog.dataset.rgLightboxOwner = lightboxOwnerUid;
  document.body.appendChild(dialog);
  const theme = createPortalThemeBridge(owner, dialog);

  let closed = false;
  const unmountHost = () => { try { globalThis.window?.roamAlphaAPI?.ui?.components?.unmountNode?.({ el: host }); } catch { /* host may not be Roam-owned */ } };
  const finish = () => {
    if (closed) return; closed = true;
    unmountHost(); theme.dispose(); dialog.remove();
    ownerRoot?.focus?.({ preventScroll: true });
    if (ownerView && !ownerView.disposed) claimKeyboard(ownerView);
  };
  const close = () => { if (!closed && dialog.open && typeof dialog.close === "function") dialog.close(); else finish(); };
  dialog.__rgDismiss = () => close();
  dialog.addEventListener("close", finish);

  const updateFooter = (entry) => {
    footer.replaceChildren();
    footer.appendChild(button(actualSize ? "Fit" : "1:1", actualSize ? "Fit the image to the window" : "Show the image at actual size", () => {
      actualSize = !actualSize; dialog.classList.toggle("rg-lightbox--actual-size", actualSize); updateFooter(list[index]);
    }));
    // A `.enc` blob is only decryptable through Roam's renderString; a raw new-tab open (like a raw
    // download) returns undecryptable ciphertext, so both affordances hide for it (LP-4, FIX-4).
    if (!isEncryptedImageUrl(entry.url)) {
      footer.appendChild(button("Open in tab", "Open the image in a new browser tab", () => { globalThis.window?.open?.(entry.url, "_blank", "noopener"); }));
    }
    footer.appendChild(button("Copy markdown", "Copy the image markdown to the clipboard", () => { globalThis.navigator?.clipboard?.writeText?.(`![${entry.alt || ""}](${entry.url})`); toast("Image markdown copied"); }));
    if (!isEncryptedImageUrl(entry.url)) {
      footer.appendChild(button("Download", "Download the image", () => {
        try {
          const anchor = document.createElement("a"); anchor.href = entry.url; anchor.download = String(entry.alt || ""); anchor.rel = "noopener";
          document.body.appendChild(anchor); anchor.click?.(); anchor.remove();
        } catch (error) { if (globalThis.window) globalThis.window.__RG_IMG_LAST_ERROR = String(error?.stack || error); }
      }));
    }
    if (typeof onDelete === "function") {
      footer.appendChild(button("Delete", "Remove this image from the cell", () => {
        const raw = removeImageFromRaw(entry.raw, entry.url, entry.occurrence || 0);
        try { onDelete({ entry, raw }); } catch (error) { if (globalThis.window) globalThis.window.__RG_IMG_LAST_ERROR = String(error?.stack || error); }
        close();
      }, "bp3-intent-danger"));
    }
  };
  const renderCurrent = () => {
    const entry = list[index];
    title.textContent = String(entry.alt || "image");
    counter.textContent = `${index + 1} / ${list.length}`;
    updateFooter(entry);
    unmountHost(); host.replaceChildren();
    try {
      const result = roam().ui.components.renderString({ el: host, string: `![${entry.alt || ""}](${entry.url})` });
      if (result && typeof result.then === "function") result.catch(() => { host.textContent = String(entry.alt || entry.url); });
    } catch (error) {
      if (globalThis.window) globalThis.window.__RG_IMG_LAST_ERROR = String(error?.stack || error);
      host.textContent = String(entry.alt || entry.url);
    }
  };
  const go = (delta) => { index = (index + delta + list.length) % list.length; renderCurrent(); };

  // Capture-phase with stopImmediatePropagation so a key the open lightbox handles can never ALSO
  // reach the concealed grid — belt to the `onGlobalKeydown` `.rg-lightbox` guard's braces (FIX-1).
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") { event.preventDefault(); event.stopImmediatePropagation?.(); go(1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); event.stopImmediatePropagation?.(); go(-1); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation?.(); close(); }
  }, true);
  // A click landing on the dialog itself (not a child) is a click on the modal backdrop.
  dialog.addEventListener("mousedown", (event) => { if (event.target === dialog) close(); });

  releaseKeyboard();
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.open = true;
  renderCurrent();
  return dialog;
}

function selectionMatrix(model, selection) {
  const range = normalizeRange(selection);
  const rows = [];
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    const values = [];
    for (let col = range.startCol; col <= range.endCol; col += 1) values.push(model.getRaw(row, col));
    rows.push(values);
  }
  return rows;
}

export function selectionBlockReferenceMatrix(model, selection) {
  const range = normalizeRange(selection);
  const rows = [];
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    const values = [];
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      if (model.isCovered(row, col)) { values.push(""); continue; }
      const uid = model.getCell(row, col)?.uid;
      if (!uid || String(uid).startsWith("rg_")) {
        throw new GridError("REFERENCE_PENDING", `Cell ${cellLabel(row, col)} does not have a persisted Roam UID yet`);
      }
      values.push(`((${uid}))`);
    }
    rows.push(values);
  }
  return rows;
}

export function selectionBlockReferenceText(model, selection) {
  return selectionBlockReferenceMatrix(model, selection).map((row) => row.join("\t")).join("\n");
}

/**
 * Resolves the model a range reference points at.  A live session is authoritative because it
 * already holds unsaved edits; otherwise the table is read cold.  Both the paste path and the
 * range-view mount path go through here so there is exactly one resolution rule.
 */
export function resolveSourceModel(tableUid, { sessions = runtime.sessions, loadModel = (uid) => new NativeTableAdapter(uid).load() } = {}) {
  const uid = String(tableUid || "");
  if (!uid) return null;
  const live = sessions?.get?.(uid)?.model;
  if (live) return live;
  return loadModel(uid) || null;
}

export function queryBlockReferenceCounts(uids, api = roam()) {
  const unique = [...new Set((uids || []).map(String).filter((uid) => uid && !uid.startsWith("rg_")))];
  const counts = new Map(unique.map((uid) => [uid, 0]));
  if (!unique.length || typeof api?.q !== "function") return counts;
  const rows = api.q(`[:find ?uid (count ?source)
    :in $ [?uid ...]
    :where
      [?target :block/uid ?uid]
      [?source :block/refs ?target]]`, unique) || [];
  for (const [uid, count] of rows) if (counts.has(String(uid))) counts.set(String(uid), Math.max(0, Number(count) || 0));
  return counts;
}

export function queryBlockReferenceSources(uid, api = roam()) {
  const targetUid = String(uid || "");
  if (!targetUid || typeof api?.q !== "function") return [];
  const rows = api.q(`[:find ?sourceUid ?sourceString ?pageTitle
    :in $ ?targetUid
    :where
      [?target :block/uid ?targetUid]
      [?source :block/refs ?target]
      [?source :block/uid ?sourceUid]
      [?source :block/string ?sourceString]
      [?source :block/page ?page]
      [?page :node/title ?pageTitle]]`, targetUid) || [];
  const unique = new Map();
  for (const row of rows) {
    const sourceUid = String(row?.[0] || "");
    if (!sourceUid || unique.has(sourceUid)) continue;
    unique.set(sourceUid, {
      uid: sourceUid,
      string: String(row?.[1] || ""),
      pageTitle: String(row?.[2] || ""),
    });
  }
  return [...unique.values()].sort((first, second) => first.pageTitle.localeCompare(second.pageTitle) || first.uid.localeCompare(second.uid));
}

export function commentAnchorString(targetUid) {
  const uids = (Array.isArray(targetUid) ? targetUid : [targetUid]).map((uid) => String(uid ?? "").trim()).filter(Boolean);
  return uids.map((uid) => `((${uid}))`).join(" ");
}

/**
 * Roam's native comment thread lives on the COMMENTED BLOCK'S OWN PAGE as a collapsed container that
 * *references* `[[roam/comments]]`; the `roam/comments` page itself has no children.  Decoded from 59
 * live threads.  Shape: container -> `[[<date>]]` -> `[[<author>]]` -> `((targetUid))` -> comment bodies.
 * Pure: it only reads the supplied page tree and returns the ops a writer must run.
 */
export function commentThreadPlan(tree, { pageUid, targetUid, dateTitle, authorTitle, generateUid = cryptoId } = {}) {
  const anchorString = commentAnchorString(targetUid);
  if (!pageUid) throw new GridError("COMMENT_PAGE_UNKNOWN", "A comment thread needs the page that holds the commented block");
  if (!anchorString) throw new GridError("COMMENT_TARGET_UNKNOWN", "A comment thread needs at least one target block uid");
  if (!dateTitle) throw new GridError("COMMENT_DATE_UNKNOWN", "A comment thread needs a Roam daily-note title");
  if (!authorTitle) throw new GridError("COMMENT_AUTHOR_UNKNOWN", "A comment thread needs the author's display-page title");
  const ops = [];
  const level = (parentUid, children, string, order, extra = {}) => {
    const found = ordered(children || []).find((child) => String(child?.string ?? "") === string);
    if (found?.uid) return { uid: found.uid, children: found.children || [], existed: true };
    const uid = generateUid();
    ops.push({ type: "create", parentUid, uid, string, order, ...extra });
    return { uid, children: [], existed: false };
  };
  const container = level(pageUid, tree?.children, COMMENTS_CONTAINER_STRING, "last", { open: false });
  const date = level(container.uid, container.children, `[[${dateTitle}]]`, "first");
  const author = level(date.uid, date.children, `[[${authorTitle}]]`, "last");
  const anchor = level(author.uid, author.children, anchorString, "last");
  return {
    ops,
    containerUid: container.uid, dateUid: date.uid, authorUid: author.uid, anchorUid: anchor.uid,
    existed: { container: container.existed, date: date.existed, author: author.existed, anchor: anchor.existed },
  };
}

/** Runs a plan's ops, then writes the comment body under the anchor.  Planned uids are remapped from
 *  whatever `create` actually returns, so an API that ignores an explicit uid cannot break the chain. */
export async function applyCommentThreadPlan(plan, { body = "", create = createBlock, update = updateBlock, generateUid = cryptoId } = {}) {
  const remap = new Map();
  const resolve = (uid) => remap.get(uid) || uid;
  for (const op of plan?.ops || []) {
    const actual = String((await create(resolve(op.parentUid), op.string, op.order, op.uid)) || op.uid);
    if (actual !== op.uid) remap.set(op.uid, actual);
    if (op.open === false) await update(actual, op.string, { open: false });
  }
  const anchorUid = resolve(plan?.anchorUid);
  const text = String(body ?? "");
  const commentUid = text ? String((await create(anchorUid, text, "last", generateUid())) || "") : null;
  return {
    ops: plan?.ops || [], existed: plan?.existed || null, commentUid, anchorUid,
    containerUid: resolve(plan?.containerUid), dateUid: resolve(plan?.dateUid), authorUid: resolve(plan?.authorUid),
  };
}

export function blockPageUid(uid, api = roam()) {
  const target = String(uid || "");
  if (!target || typeof api?.q !== "function") return null;
  const rows = api.q(`[:find ?pageUid
    :in $ ?uid
    :where
      [?block :block/uid ?uid]
      [?block :block/page ?page]
      [?page :block/uid ?pageUid]]`, target) || [];
  return rows?.[0]?.[0] ? String(rows[0][0]) : null;
}

export function commentAuthorTitle(api = roam()) {
  const userUid = api?.user?.uid?.();
  if (!userUid || typeof api?.q !== "function") return null;
  const rows = api.q(`[:find ?title
    :in $ ?userUid
    :where
      [?user :user/uid ?userUid]
      [?user :user/display-page ?page]
      [?page :node/title ?title]]`, String(userUid)) || [];
  return rows?.[0]?.[0] ? String(rows[0][0]) : null;
}

/**
 * Page-scoped thread index: `Map<cellUid, [{threadUid, count}]>`.  Two parameterized queries, never
 * string interpolation.  The `roam/comments` entity is resolved first so a graph with no comments at
 * all costs exactly one query and returns an empty Map.  `queryBlockReferenceCounts` stays untouched:
 * a measured single-query `or-join` partition costs 150 ms/400 uids against 58 ms today and cannot
 * return thread uids.
 */
export function queryCommentThreadIndex(pageUid, api = roam()) {
  const index = new Map();
  const page = String(pageUid || "");
  if (!page || typeof api?.q !== "function") return index;
  const commentsRows = api.q(`[:find ?page
    :in $ ?title
    :where [?page :node/title ?title]]`, COMMENTS_PAGE) || [];
  const commentsPage = commentsRows?.[0]?.[0];
  if (commentsPage == null) return index;
  const rows = api.q(`[:find ?cellUid ?anchorUid (count ?comment)
    :in $ ?pageUid ?commentsPage
    :where
      [?page :block/uid ?pageUid]
      [?container :block/page ?page]
      [?container :block/refs ?commentsPage]
      [?container :block/children ?date]
      [?date :block/children ?author]
      [?author :block/children ?anchor]
      [?anchor :block/uid ?anchorUid]
      [?anchor :block/refs ?cell]
      [?cell :block/uid ?cellUid]
      [?anchor :block/children ?comment]]`, page, commentsPage) || [];
  for (const row of rows) {
    const cellUid = String(row?.[0] || ""); const threadUid = String(row?.[1] || "");
    if (!cellUid || !threadUid) continue;
    const entries = index.get(cellUid) || [];
    if (entries.some((entry) => entry.threadUid === threadUid)) continue;
    entries.push({ threadUid, count: Math.max(0, Number(row?.[2]) || 0) });
    index.set(cellUid, entries);
  }
  for (const entries of index.values()) entries.sort((first, second) => first.threadUid.localeCompare(second.threadUid));
  return index;
}

export function commentThreadSignature(entries) {
  return JSON.stringify((entries || []).map((entry) => [String(entry?.threadUid ?? ""), Math.max(0, Number(entry?.count) || 0)]));
}

/** Returns the cell uids whose thread list actually changed; an absorbed echo yields an empty set. */
export function diffCommentThreadIndex(previous, next) {
  const changed = new Set();
  for (const uid of new Set([...(previous?.keys?.() || []), ...(next?.keys?.() || [])])) {
    if (commentThreadSignature(previous?.get?.(uid)) !== commentThreadSignature(next?.get?.(uid))) changed.add(uid);
  }
  return changed;
}

/** Optimistic merge of a just-written thread so the later datalog refresh diffs to nothing. */
export function mergeCommentThread(index, cellUid, threadUid) {
  const key = String(cellUid || ""); const thread = String(threadUid || "");
  if (!index || !key || !thread) return index;
  const entries = [...(index.get(key) || [])];
  const position = entries.findIndex((entry) => entry.threadUid === thread);
  if (position >= 0) entries[position] = { threadUid: thread, count: (Math.max(0, Number(entries[position].count) || 0)) + 1 };
  else entries.push({ threadUid: thread, count: 1 });
  entries.sort((first, second) => first.threadUid.localeCompare(second.threadUid));
  index.set(key, entries);
  return index;
}

export function commentThreadCount(entries) {
  return (entries || []).reduce((total, entry) => total + Math.max(0, Number(entry?.count) || 0), 0);
}

/**
 * Sidebar compose writes the empty comment body BEFORE the user has typed anything, so abandoning
 * the gesture must unwind exactly the blocks that gesture created — never a level that pre-existed,
 * and never a level a SECOND gesture has since hung its own blocks on.  Pure: the caller re-reads
 * the live body string and the live child count of every level at fire time and passes them in, so
 * a concurrent writer cannot lose blocks to a stale plan — a level whose live child count exceeds
 * the one child this gesture created is treated as reused and aborts the unwind, regardless of the
 * plan-time `existed` flags.  The returned list is ordered child → parent.
 */
export function commentComposeCleanupPlan({ bodyUid, bodyString, existed = null, anchorChildCount = 0, anchorUid = null, authorUid = null, dateUid = null, containerUid = null, createdBody = true, authorChildCount = null, dateChildCount = null, containerChildCount = null } = {}) {
  const deletes = [];
  if (!bodyUid || String(bodyString ?? "").trim()) return deletes;
  // A reused pre-existing empty body belongs to no gesture: it stays, and because it stays the
  // anchor keeps a live child, so nothing above it may unwind either.
  if (createdBody === false) return deletes;
  deletes.push(bodyUid);
  if (existed?.anchor !== false || !anchorUid || Number(anchorChildCount) > 1) return deletes;
  deletes.push(anchorUid);
  if (existed?.author !== false || !authorUid || (authorChildCount != null && Number(authorChildCount) > 1)) return deletes;
  deletes.push(authorUid);
  if (existed?.date !== false || !dateUid || (dateChildCount != null && Number(dateChildCount) > 1)) return deletes;
  deletes.push(dateUid);
  if (existed?.container !== false || !containerUid || (containerChildCount != null && Number(containerChildCount) > 1)) return deletes;
  deletes.push(containerUid);
  return deletes;
}

/** The compose body is a live Roam textarea and Datascript lags until blur, so the sweep must read
 *  the editor itself: a comment the user already typed is only visible in the textarea's value. */
function liveCommentBodyValue(bodyUid) {
  const doc = globalThis.document;
  if (!doc) return null;
  const suffix = `-${String(bodyUid)}`;
  try {
    const node = typeof doc.querySelector === "function" ? doc.querySelector(`[id$="${suffix}"]`) : null;
    if (node && "value" in node) return String(node.value ?? "");
  } catch { /* a non-standard document may not support attribute selectors */ }
  const active = doc.activeElement;
  if (active && String(active.id || "").endsWith(suffix) && "value" in active) return String(active.value ?? "");
  return null;
}

/**
 * Arms the abandon sweep for one sidebar compose gesture: ONE capture-phase document `focusin`
 * listener (the first focus landing anywhere but the empty comment body ends the gesture) plus a
 * 90 s tracked-timeout safety net that RE-ARMS while the caret is still in the body.  First real
 * fire wins and disposes both, splicing the disposer out of `runtime.disposers`.  The sweep only
 * runs while the extension is still loaded, treats a live textarea value as authoritative over the
 * lagging Datascript read, and re-reads every level's live child count at fire time — the
 * concurrent-writer guard — then deletes the plan's blocks and refreshes the thread index so a
 * comment the user DID type in the sidebar reaches the badges.
 */
export function armCommentAbandonCleanup({ session, targetUid, bodyUid, anchorUid, applied } = {}) {
  if (!bodyUid || !anchorUid || !globalThis.document?.addEventListener) return null;
  let fired = false;
  let timer = null;
  const caretInBody = () => String(globalThis.document?.activeElement?.id || "").endsWith(`-${bodyUid}`);
  const onFocusIn = (event) => {
    // Focus inside the body itself (`block-input-<window-id>-<uid>`) means the user is composing.
    if (String(event?.target?.id || "").endsWith(`-${bodyUid}`)) return;
    fire();
  };
  const disposer = () => {
    globalThis.document?.removeEventListener?.("focusin", onFocusIn, true);
    if (timer != null) { clearTimeout(timer); pendingTimers.delete(timer); timer = null; }
    const index = runtime.disposers.indexOf(disposer);
    if (index >= 0) runtime.disposers.splice(index, 1);
  };
  const armTimer = () => { timer = trackedTimeout(() => fire({ viaTimer: true }), 90000); };
  const fire = ({ viaTimer = false } = {}) => {
    if (fired) return;
    // A timer maturing under a live caret means the user is still composing — re-arm, never sweep.
    if (viaTimer && caretInBody()) { armTimer(); return; }
    fired = true;
    disposer();
    void (async () => {
      try {
        // onunload nulled the API mid-gesture: deleting blocks now would be vandalism.
        if (!runtime.extensionAPI) return;
        const stored = blockString(bodyUid);
        const live = liveCommentBodyValue(bodyUid);
        // Sweep only when BOTH the live editor and the committed string are empty.
        const bodyString = live != null && String(live).trim() ? live : stored;
        const childCount = (uid) => (uid ? getTree(uid)?.children?.length ?? 0 : null);
        const deletes = commentComposeCleanupPlan({
          bodyUid,
          bodyString,
          existed: applied?.existed,
          createdBody: applied?.createdBody !== false,
          anchorChildCount: childCount(anchorUid) ?? 0,
          anchorUid,
          authorUid: applied?.authorUid,
          dateUid: applied?.dateUid,
          containerUid: applied?.containerUid,
          authorChildCount: childCount(applied?.authorUid),
          dateChildCount: childCount(applied?.dateUid),
          containerChildCount: childCount(applied?.containerUid),
        });
        for (const uid of deletes) await deleteBlock(uid);
        session?.refreshCommentThreads?.();
      } catch (error) {
        if (globalThis.window) globalThis.window.__RG_U4_LAST_ERROR = String(error?.stack || error);
        console.warn("[roam-grid] Comment abandon cleanup failed", targetUid, error);
      }
    })();
  };
  globalThis.document.addEventListener("focusin", onFocusIn, true);
  armTimer();
  runtime.disposers.push(disposer);
  return disposer;
}

function isMac() { return /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || ""); }

export function requiresRoamRichRender(raw) {
  const value = String(raw ?? "");
  if (!value) return false;
  return value.includes("\n")
    || /\[\[|\(\(|\{\{|::|https?:\/\/|mailto:|\bwww\./iu.test(value)
    || /!\[[^\]]*\]\(|\[[^\]\n]+\]\([^\n)]*\)/u.test(value)
    || /(?:^|\s)#(?:\[\[[^\]]+\]\]|[\p{L}\p{N}_/-]+)/u.test(value)
    || /\*\*|__|~~|\^\^|`/u.test(value)
    || /(?:^|[^\p{L}\p{N}])(?:\*[^*\n]+\*|_[^_\n]+_)(?![\p{L}\p{N}])/u.test(value)
    || /(?:^|\n)\s*(?:#{1,6}\s|>\s|[-+*]\s|\d+\.\s)/u.test(value);
}

function ensureCellContent(cell) {
  let content = cell.querySelector(":scope > .rg-cell-content");
  if (!content) {
    content = document.createElement("div");
    content.className = "rg-cell-content";
    cell.prepend(content);
  }
  return content;
}

/** `content` is null for a host parked outside its container — a suggestion row waiting in the
 *  rendered-row cache — which still has to unmount through exactly this path. */
function disposeRichHost(content, host) {
  if (!host || host.__rgDisposed) return;
  host.__rgDisposed = true;
  try { globalThis.window?.roamAlphaAPI?.ui?.components?.unmountNode?.({ el: host }); } catch { /* host may not be Roam-owned */ }
  host.remove();
  content?.__rgRichHosts?.delete(host);
}

function clearRichCellHosts(content, keep = null) {
  for (const host of [...(content.__rgRichHosts || [])]) if (host !== keep) disposeRichHost(content, host);
}

export function releaseRichCellHosts(container) {
  if (!container) return;
  const contents = [];
  if (container.matches?.(".rg-cell-content")) contents.push(container);
  for (const content of container.querySelectorAll?.(".rg-cell-content") || []) contents.push(content);
  for (const content of contents) clearRichCellHosts(content);
}

export function replaceGridViewportContents(viewport, nextGrid) {
  // A first mount has no scroll state to preserve. Avoid reading layout-backed
  // scroll properties after Roam has just inserted the native table: that read
  // forced a synchronous layout for every newly referenced view.
  const hasCurrentGrid = viewport.firstChild != null || Number(viewport.children?.length || 0) > 0;
  if (!hasCurrentGrid) {
    viewport.replaceChildren(nextGrid);
    return viewport;
  }
  const scrollLeft = viewport.scrollLeft; const scrollTop = viewport.scrollTop;
  releaseRichCellHosts(viewport);
  viewport.replaceChildren(nextGrid);
  viewport.scrollLeft = scrollLeft; viewport.scrollTop = scrollTop;
  return viewport;
}

/** One source of truth for `grid-template-*` track math, shared by the full grid and range excerpts. */
export function gridTrackTemplate(model, axis, from = 0, to = (axis === "col" ? model.columnIds.length : model.rowCount) - 1, { fit = false, widths = null, heights = null } = {}) {
  const tracks = [];
  if (axis === "col") {
    for (let col = from; col <= to; col += 1) {
      const id = model.columnIds[col];
      const width = widths?.[id] != null ? widths[id] : (model.widths[id] || getSetting("sizing-default-col-width"));
      tracks.push(fit ? `minmax(${getSetting("sizing-min-col-width")}px, ${width}fr)` : `${width}px`);
    }
    return tracks.join(" ");
  }
  for (let row = from; row <= to; row += 1) {
    const height = heights?.row === row ? heights.height : model.getRowHeight(row);
    tracks.push(height == null ? `minmax(${getSetting("sizing-default-row-height")}px, auto)` : `${height}px`);
  }
  return tracks.join(" ");
}

function activateRichHost(content, host, token) {
  if (content.dataset.rgRenderToken !== token || host.__rgDisposed || !host.isConnected) return disposeRichHost(content, host);
  clearRichCellHosts(content, host);
  for (const child of [...(content.childNodes || content.children || [])]) if (child !== host) child.remove();
  host.hidden = false;
  host.dataset.rgRichActive = "true";
  wireRichHostImages(content, host);
}

/** `fallbackText` defaults to the raw string, which is what a cell wants. A suggestion row passes its
 *  normalized plain text instead, so a failed render leaves readable text rather than markdown. */
export function paintRichCellContent(content, raw, token, fallbackText = raw) {
  const host = document.createElement("span");
  host.className = "rg-rich-host";
  host.hidden = true;
  host.dataset.rgRenderToken = token;
  content.__rgRichHosts ||= new Set();
  content.__rgRichHosts.add(host);
  content.appendChild(host);
  const fallback = () => {
    if (content.dataset.rgRenderToken !== token || host.__rgDisposed) return disposeRichHost(content, host);
    host.textContent = fallbackText;
    activateRichHost(content, host, token);
  };
  const render = () => {
    if (content.dataset.rgRenderToken !== token || host.__rgDisposed) return disposeRichHost(content, host);
    if (!host.isConnected) return fallback();
    try {
      const result = roam().ui.components.renderString({ el: host, string: raw });
      if (result && typeof result.then === "function") result.then(() => activateRichHost(content, host, token), fallback);
      else activateRichHost(content, host, token);
    } catch { fallback(); }
  };
  if (host.isConnected) render();
  else (globalThis.queueMicrotask || ((callback) => Promise.resolve().then(callback)))(render);
}

export function renderStableCellContent(content, { raw = "", value = raw, formula = false, renderRich = null } = {}) {
  const source = String(raw ?? "");
  const text = String((formula ? value : source) ?? "");
  const rich = !formula && requiresRoamRichRender(source);
  const renderKey = `${rich ? "rich:" : "text:"}${rich ? source : text}`;
  if (content.dataset.rgRenderKey === renderKey) return false;
  const token = cryptoId();
  content.dataset.rgRenderKey = renderKey;
  content.dataset.rgRenderToken = token;
  if (rich && typeof renderRich === "function") renderRich(content, source, token);
  else {
    clearRichCellHosts(content);
    content.textContent = text;
  }
  return true;
}

function formulaReferenceColorMap(raw) {
  const colors = new Map();
  for (const reference of formulaReferences(raw)) {
    const key = reference.text.toUpperCase();
    if (!colors.has(key)) colors.set(key, FORMULA_REFERENCE_COLORS[colors.size % FORMULA_REFERENCE_COLORS.length]);
  }
  return colors;
}

function appendFormulaMirror(target, raw, colors = formulaReferenceColorMap(raw)) {
  target.replaceChildren();
  let cursor = 0;
  for (const reference of formulaReferences(raw)) {
    target.append(document.createTextNode(raw.slice(cursor, reference.startIndex)));
    const token = document.createElement("span");
    token.className = "rg-formula-token";
    token.textContent = raw.slice(reference.startIndex, reference.endIndex);
    token.style.color = colors.get(reference.text.toUpperCase());
    target.appendChild(token);
    cursor = reference.endIndex;
  }
  target.append(document.createTextNode(raw.slice(cursor)));
}

const PAIRED_EDITOR_TRIGGERS = [
  { type: "page", opener: "[[", closer: "]]" },
  { type: "block", opener: "((", closer: "))" },
  { type: "component", opener: "{{", closer: "}}" },
];
/** Unpaired openers have no closer to bound them, so their query ends at the caret. A bare `#` ends
 *  at the first whitespace, and additionally rejects a bracket, which is how `#[[` reaches the
 *  tag-page branch instead of being read as a bare tag whose name starts with `[`.
 *
 *  `/` cannot use that rule: two thirds of the commands Roam's own menu carries have a space in
 *  their name — `Block Quote`, `Current Time`, `Code Block`, `Mentions of Page or Block` — so a
 *  query that dies on the first space can never reach them. It is loosened to interior single
 *  spaces only, which is what keeps prose out: `input / output` puts the space FIRST, and a run
 *  longer than Roam's longest command name (32) cannot be a command name either. Anything that gets
 *  past this and still matches no row simply renders nothing, because the popover only opens on
 *  rows — so the guard has to stop a stale CONTEXT, not a stale menu. */
const UNPAIRED_EDITOR_TRIGGERS = [
  { type: "tag", opener: "#", closer: "", invalid: /[\s[\]]/ },
  { type: "command", opener: "/", closer: "", invalid: /^\s|\s\s|[[\]]|.{33}/ },
];
const PAGE_EDITOR_TRIGGERS = new Set(["page", "tag", "tag-page"]);
const SUGGESTIBLE_EDITOR_TRIGGERS = new Set(["page", "tag", "tag-page", "block"]);
/** A bare `#tag` ends at the first character Roam cannot read as part of a page name, so anything
 *  outside this set has to be written `#[[Name]]` instead. Namespaces keep `/`. */
const BARE_TAG_NAME = /^[\p{L}\p{N}_\-/]+$/u;

/** Whether this trigger is answered by the page half of the Roam search and recents paths. */
export function triggerIsPageLike(type) { return PAGE_EDITOR_TRIGGERS.has(type); }

/**
 * The six trigger types the cell editor understands, resolved against the nearest unclosed opener.
 * An unclosed bracket owns everything after it, so a `#` or `/` typed inside `[[…` stays part of that
 * query rather than starting a competing one, and `#[[` outranks `[[` by owning the `#` in front of it.
 *
 * Two formula guards, both live bugs before this existed. `=SUM((A1` used to produce a `block`
 * context, and `=A1/B2` would open a command menu the moment `/` became a trigger. Inside a formula
 * only a page-shaped trigger survives, and only where a Roam reference could actually be written —
 * inside a string literal, which is what `formulaPositionIsQuoted` decides.
 */
export function roamEditorTriggerContext(raw, caret = String(raw ?? "").length, { formula = String(raw ?? "").startsWith("=") && !String(raw ?? "").startsWith("==") } = {}) {
  const source = String(raw ?? ""); const endIndex = clamp(Number.isFinite(caret) ? caret : source.length, 0, source.length);
  const prefix = source.slice(0, endIndex);
  const paired = PAIRED_EDITOR_TRIGGERS
    .map((trigger) => ({ ...trigger, startIndex: prefix.lastIndexOf(trigger.opener) }))
    .filter((candidate) => candidate.startIndex >= 0 && prefix.lastIndexOf(candidate.closer) < candidate.startIndex)
    .sort((a, b) => b.startIndex - a.startIndex);
  let match = paired[0] || null;
  if (match?.type === "page" && source[match.startIndex - 1] === "#") match = { type: "tag-page", opener: "#[[", closer: "]]", startIndex: match.startIndex - 1 };
  if (!match) match = UNPAIRED_EDITOR_TRIGGERS
    .map((trigger) => ({ ...trigger, startIndex: prefix.lastIndexOf(trigger.opener) }))
    .filter((candidate) => candidate.startIndex >= 0)
    .sort((a, b) => b.startIndex - a.startIndex)
    .find((candidate) => (candidate.type !== "command" || candidate.startIndex === 0 || /\s/.test(prefix[candidate.startIndex - 1]))
      && !candidate.invalid.test(prefix.slice(candidate.startIndex + 1))) || null;
  if (!match) return null;
  if (formula && !((match.type === "page" || match.type === "tag-page") && formulaPositionIsQuoted(source, endIndex))) return null;
  const queryStart = match.startIndex + match.opener.length; const query = source.slice(queryStart, endIndex);
  if (query.includes("\n") || query.includes("\r")) return null;
  const replaceEndIndex = match.closer && source.slice(endIndex, endIndex + match.closer.length) === match.closer ? endIndex + match.closer.length : endIndex;
  // `[label]([[Page]])` — a `[[` opened directly after `](` is filling in an alias TARGET, not writing
  // a bare reference. `replaceEndIndex` already stops at the closer and leaves the `)` alone; the flag
  // exists so the row list can say which of the two the user is in. Present only when true, because
  // every caller reads it as a flag and the context shape is asserted verbatim elsewhere.
  const aliasTarget = match.type === "page" && match.startIndex >= 2 && source.slice(match.startIndex - 2, match.startIndex) === "](";
  return { type: match.type, query, startIndex: match.startIndex, queryStart, endIndex, replaceEndIndex, opener: match.opener, closer: match.closer, ...(aliasTarget ? { aliasTarget: true } : {}) };
}

/** Per-trigger insertion. A block is always `((uid))`; a page-shaped trigger keeps its own opener,
 *  and a bare `#` falls back to `#[[Name]]` for any name Roam could not read unbracketed. */
export function roamTriggerInsertion(type, suggestion) {
  if (suggestion?.kind === "roam-block") return `((${suggestion.uid}))`;
  if (suggestion?.kind === "roam-component") return String(suggestion.template ?? "");
  const name = String(suggestion?.name ?? "");
  if (type === "tag") return BARE_TAG_NAME.test(name) ? `#${name}` : `#[[${name}]]`;
  return type === "tag-page" ? `#[[${name}]]` : `[[${name}]]`;
}

/**
 * Roam's `{{component}}` set, as a fixed catalog. There is no search API behind `{{` — Roam's own
 * menu is a hard-coded list too — so this needs no query, no debounce and no budget switch.
 *
 * `caret` is an offset INTO `template`, not into the cell, and it is the whole point of the entry:
 * a component that takes an argument must leave the caret between the colon and the closing braces,
 * because dropping it after `}}` makes the completion worse than typing the thing by hand. A
 * component that takes no argument puts the caret at the end, where there is nothing left to type.
 *
 * The descriptions are what the live graph does, not what the docs claim. A cell renders through
 * `renderString` (see `paintRichCellContent`), which carries a string and no block uid, so every
 * component that reads its own block or its children degrades in a cell. Probed against Roam on
 * 2026-08-06 through that exact call: `kanban` and `mermaid` render a "nest a bullet under here"
 * hint, `attr-table` comes back as literal text with no component at all, `word-count` and `diagram`
 * render a "Failed to render" button, and `roam/render` errors without a component-definition uid.
 * Saying so costs one short line and stops the grid being blamed for Roam's own context requirement.
 */
export const ROAM_COMPONENT_CATALOG = [
  { name: "TODO", template: "{{[[TODO]]}}", caret: 12, description: "Checkbox" },
  { name: "DONE", template: "{{[[DONE]]}}", caret: 12, description: "Checked checkbox" },
  { name: "query", template: "{{[[query]]: {and: }}}", caret: 19, description: "Query builder" },
  { name: "embed", template: "{{[[embed]]: }}", caret: 13, description: "Embed a block or page" },
  { name: "mentions", template: "{{[[mentions]]: }}", caret: 16, description: "Linked references" },
  { name: "calc", template: "{{[[calc]]: }}", caret: 12, description: "Inline calculation" },
  { name: "POMO", template: "{{[[POMO]]}}", caret: 12, description: "Pomodoro timer" },
  { name: "slider", template: "{{[[slider]]}}", caret: 14, description: "Drag slider" },
  { name: "video", template: "{{[[video]]: }}", caret: 13, description: "Video player" },
  { name: "table", template: "{{[[table]]}}", caret: 13, description: "Table creator" },
  { name: "kanban", template: "{{[[kanban]]}}", caret: 14, description: "Needs child bullets" },
  { name: "attr-table", template: "{{[[attr-table]]}}", caret: 18, description: "Does not render in a cell" },
  { name: "word-count", template: "{{[[word-count]]}}", caret: 18, description: "Fails to render in a cell" },
  { name: "diagram", template: "{{[[diagram]]}}", caret: 15, description: "Fails to render in a cell" },
  { name: "mermaid", template: "{{[[mermaid]]}}", caret: 15, description: "Needs child bullets" },
  { name: "roam/render", template: "{{[[roam/render]]: }}", caret: 19, description: "Needs a component uid" },
];

/** The catalog filtered by what has been typed after `{{`. A name that STARTS with the query leads,
 *  because that is what the typist is aiming at; a name that merely contains it follows. Catalog
 *  order breaks both ties, so the everyday components stay near the top. A bare `{{` offers the
 *  whole catalog, which costs nothing here — there is no graph read to open on. */
export function roamComponentSuggestions(query, limit = getSetting("editing-autocomplete-limit")) {
  const folded = String(query ?? "").trim().toLowerCase();
  const leading = []; const trailing = [];
  for (const entry of ROAM_COMPONENT_CATALOG) {
    const name = entry.name.toLowerCase();
    if (!folded) leading.push(entry);
    else if (name.startsWith(folded)) leading.push(entry);
    else if (name.includes(folded)) trailing.push(entry);
  }
  return [...leading, ...trailing]
    .slice(0, clamp(Math.floor(Number(limit) || 8), 1, 25))
    .map((entry) => ({ kind: "roam-component", name: entry.name, description: entry.description, template: entry.template, caret: entry.caret }));
}

/** The text a component row inserts and where the caret goes inside it, clamped so a malformed entry
 *  can only ever land the caret inside its own template rather than out in the cell. */
export function roamComponentInsertion(suggestion) {
  const text = String(suggestion?.template ?? "");
  const offset = Number.isFinite(suggestion?.caret) ? clamp(suggestion.caret, 0, text.length) : text.length;
  return { text, caret: offset };
}

/**
 * A SUBSET of Roam's `/` menu — 21 rows against the 47 its own registry carries — and the subset is
 * the point, not a stage on the way to parity. Three classes are missing on purpose:
 *
 * 1. Commands that open a Roam modal. `Date Picker `, `Upload Image, Audio, or File`, the template
 *    picker: a cell editor cannot summon those, and a row that opens nothing is worse than no row.
 * 2. Commands whose output needs a real block. Probed live through `renderString` on 2026-08-06,
 *    the same call a cell renders with: `{{word-count}}` and `{{[[diagram]]}}` come back as a
 *    "Failed to render" button, `{{[[kanban]]}}` and `{{[[mermaid]]}}` come back as a "nest a
 *    bullet under here" hint a cell has no way to satisfy. They stay reachable under `{{`, where
 *    the row says so; they are not offered as commands, because a command that fails is a bug.
 * 3. The four `Query (…)` commands. Roam's templates seed `[[ex-A]]` / `[[ex-B]]` placeholders and
 *    select them; committing a cell parses its string, so an unedited row would materialise two
 *    junk pages in the graph. `{{query` covers the same ground and seeds nothing.
 *
 * Every name and every static template here is Roam's own, read out of its slash-menu registry
 * rather than guessed — including the ones that are not what you would guess: the component is
 * `Italics` not `Italic`, the blockquote is `[[>]] ` not `> `, and there is no `Horizontal Rule`
 * and no `DONE` command in Roam at all.
 *
 * `caret` is an offset INTO the resolved text and follows Roam's own placement rules: the midpoint
 * of a wrapping pair (`****` → 2), inside the inner reference of a component that takes one
 * (`{{[[embed]]: (())}}` → 15), and the end when there is nothing left to fill in. Landing the
 * caret inside `(())` or `[[]]` is also what makes `Block Reference`, `Block Embed`, `Mentions` and
 * `Inline Calculator` hand straight over to the block or page picker.
 *
 * `dynamic` rows resolve at accept time rather than menu time, so `Current Time` is the time you
 * accepted it. The three day rows are offered ONLY when `roamAlphaAPI.util.dateToPageTitle` is
 * there to format them: the daily-page title is a format we must not guess, because guessing it
 * writes a reference to a page that does not exist.
 */
export const ROAM_COMMAND_CATALOG = [
  { name: "TODO", template: "{{[[TODO]]}}", description: "Checkbox" },
  { name: "Page Reference", template: "[[]]", caret: 2, description: "Opens the page picker" },
  { name: "Block Reference", template: "(())", caret: 2, description: "Opens the block picker" },
  { name: "Block Embed", template: "{{[[embed]]: (())}}", caret: 15, description: "Opens the block picker" },
  { name: "Mentions of Page or Block", template: "{{[[mentions]]: [[]]}}", caret: 18, description: "Opens the page picker" },
  { name: "Inline Calculator", template: "{{[[calc]]: (())}}", caret: 14, description: "Opens the block picker" },
  { name: "Pomodoro Timer", template: "{{[[POMO]]: 25}}", description: "25-minute timer" },
  { name: "Current Time", dynamic: "time", description: "Now, as HH:MM" },
  { name: "Today", dynamic: "day", offset: 0, description: "Today's daily page" },
  { name: "Tomorrow", dynamic: "day", offset: 1, description: "Tomorrow's daily page" },
  { name: "Yesterday", dynamic: "day", offset: -1, description: "Yesterday's daily page" },
  { name: "Bold", template: "****", caret: 2, description: "Bold text" },
  { name: "Italics", template: "____", caret: 2, description: "Italic text" },
  { name: "Highlight", template: "^^^^", caret: 2, description: "Highlighted text" },
  { name: "Strikethrough", template: "~~~~", caret: 2, description: "Struck-through text" },
  { name: "Block Quote", template: "[[>]] ", description: "Blockquote" },
  { name: "Code Inline", template: "``", caret: 1, description: "Inline code" },
  // Roam's own template is "```javascript\n```" with the caret past the closing fence, because a
  // Roam block hands the fenced text to CodeMirror the moment it is committed. A cell is edited as
  // raw text, so it gets the empty line Roam's version leaves the user to make — verified to render
  // as the identical code block through renderString.
  { name: "Code Block", template: "```javascript\n\n```", caret: 14, description: "Fenced code block" },
  { name: "Slider", template: "{{[[slider]]}}", description: "Drag slider" },
  { name: "Table", template: "{{[[table]]}}", description: "Table creator" },
  { name: "Embed Video", template: "{{[[video]]: }}", caret: 13, description: "Video player" },
];

/** Roam formats a daily-page title itself. We never format one — a hand-rolled "August 6th, 2026"
 *  that is off by one suffix is a reference to a page that does not exist, which is exactly the
 *  failure this whole unit is trying not to ship. No helper, no rows. */
function roamDayPageReference(offset, { now, api }) {
  const format = api?.util?.dateToPageTitle;
  if (typeof format !== "function") return null;
  const day = new Date(now.getTime());
  day.setDate(day.getDate() + offset);
  const title = format(day);
  return title ? `[[${title}]]` : null;
}

/** The text a command row inserts and where the caret lands inside it, or null when the row cannot
 *  be resolved at all — which the catalog filter has already made unreachable for offered rows. */
export function roamCommandInsertion(suggestion, { now = new Date(), api = globalThis.window?.roamAlphaAPI } = {}) {
  let text = suggestion?.template == null ? null : String(suggestion.template);
  if (suggestion?.dynamic === "time") text = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  else if (suggestion?.dynamic === "day") text = roamDayPageReference(Number(suggestion.offset) || 0, { now, api });
  if (text == null) return null;
  const offset = Number.isFinite(suggestion?.caret) ? clamp(suggestion.caret, 0, text.length) : text.length;
  return { text, caret: offset };
}

/** The catalog filtered by what has been typed after `/`, ranked the way the component catalog is:
 *  a name that starts with the query leads, one that merely contains it follows, catalog order
 *  breaks both ties. A row whose insertion cannot be resolved on this graph is dropped here rather
 *  than offered and refused on accept. */
export function roamCommandSuggestions(query, { limit = getSetting("editing-autocomplete-limit"), now = new Date(), api = globalThis.window?.roamAlphaAPI } = {}) {
  const folded = String(query ?? "").trim().toLowerCase();
  const leading = []; const trailing = [];
  for (const entry of ROAM_COMMAND_CATALOG) {
    if (!roamCommandInsertion(entry, { now, api })) continue;
    const name = entry.name.toLowerCase();
    if (!folded || name.startsWith(folded)) leading.push(entry);
    else if (name.includes(folded)) trailing.push(entry);
  }
  return [...leading, ...trailing]
    .slice(0, clamp(Math.floor(Number(limit) || 8), 1, 25))
    .map((entry) => ({ kind: "roam-command", ...entry }));
}

/**
 * What a suggestion row says before — and if `renderString` is unavailable, instead of — Roam renders
 * it. Every row is non-empty from its first frame because this runs synchronously while the row node
 * is built; the hidden host only ever replaces text that was already readable.
 *
 * A block ref cannot be resolved without a graph read, so it collapses to a short placeholder rather
 * than showing nine characters of uid. Everything else is markdown this can strip on its own.
 */
export function roamSuggestionPlainText(raw) {
  return String(raw ?? "")
    .replace(/!\[([^\]\n]*)\]\([^)\n]*\)/gu, (whole, label) => label || "image")
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/gu, "$1")
    .replace(/\(\([A-Za-z0-9_-]+\)\)/gu, "(block)")
    .replace(/#?\[\[([^[\]\n]+)\]\]/gu, "$1")
    .replace(/(^|\s)#([\p{L}\p{N}_/-]+)/gu, "$1$2")
    .replace(/\*\*|__|\^\^|~~|`/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Every `![alt](url)` embed in a cell's raw markdown, with `start`/`end` delimiting the whole
 * `![…](…)` span so a caller can splice it back out. The pattern matches `roamSuggestionPlainText`'s
 * image stripper exactly: no newlines inside either bracket pair, and a `(` ends the URL.
 */
export function cellImageMarkdown(raw) {
  const images = [];
  const pattern = /!\[([^\]\n]*)\]\(([^)\n]*)\)/gu;
  for (const match of String(raw ?? "").matchAll(pattern)) {
    images.push({ alt: match[1], url: match[2], start: match.index, end: match.index + match[0].length });
  }
  return images;
}

/**
 * Splices ONE image embed out of a cell string and returns the rewritten raw — pure, so the lightbox
 * can preview the exact result before committing. `occurrenceIndex` disambiguates duplicate URLs in
 * the same cell (a delete of the second `![](u)` leaves the first). The only image → `""`; an image
 * embedded in prose leaves the surrounding text and spacing byte-for-byte, so nothing else shifts.
 * An unmatched url/occurrence returns the source unchanged.
 */
export function removeImageFromRaw(raw, url, occurrenceIndex = 0) {
  const source = String(raw ?? "");
  const target = cellImageMarkdown(source).filter((image) => image.url === url)[Math.max(0, Math.floor(Number(occurrenceIndex) || 0))];
  if (!target) return source;
  return source.slice(0, target.start) + source.slice(target.end);
}

/**
 * Per-table image layout normalization. The shape is `{ columns: { [columnId]: entry },
 * cells: { [cellUid]: entry } }` where a column entry is `{ size?, fit?, layout? }` and a cell
 * entry is `{ size?, fit? }`. Anything else — a stripped key, a hand-edited string, an unknown
 * token — normalizes to the empty shape or a cleaned entry, so a lost metadata value always
 * degrades to the defaults rather than to a broken cell. Keys are NOT validated against the
 * model: an entry for a deleted column or cell is inert, and dropping it here would make an
 * undo that restores the cell unable to restore its layout with it.
 */
export function normalizeImageLayout(value) {
  const out = { columns: {}, cells: {} };
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  const clean = (entry, allowLayout) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const next = {};
    if (IMAGE_SIZE_TOKENS.includes(entry.size)) next.size = entry.size;
    if (IMAGE_FIT_TOKENS.includes(entry.fit)) next.fit = entry.fit;
    if (allowLayout && IMAGE_LAYOUT_TOKENS.includes(entry.layout)) next.layout = entry.layout;
    return Object.keys(next).length ? next : null;
  };
  const columns = value.columns && typeof value.columns === "object" ? value.columns : {};
  const cells = value.cells && typeof value.cells === "object" ? value.cells : {};
  for (const [id, entry] of Object.entries(columns)) {
    const cleaned = clean(entry, true);
    if (cleaned && id) out.columns[id] = cleaned;
  }
  for (const [uid, entry] of Object.entries(cells)) {
    const cleaned = clean(entry, false);
    if (cleaned && uid) out.cells[uid] = cleaned;
  }
  return out;
}

/**
 * Cell image layout resolution, cell → column → default UNDER the two global settings. The
 * globals always own `enabled` (the kill switch restores exact pre-feature rendering) and the
 * "m"/"fill" pixel cap (`images-max-height`); the model's `imageLayout` layers size, fit and
 * layout on top, with a cell entry out-voting its column entry field by field. The return shape
 * is the seam IMG-1/IMG-2 code against; `size` joined it in IMG-3 so the fill class can be set.
 */
export function resolveImageLayout(model, row, col) {
  const globalMax = clamp(Math.floor(Number(getSetting("images-max-height"))) || DEFAULT_IMAGE_MAX_HEIGHT, 48, 480);
  const layout = model?.imageLayout && typeof model.imageLayout === "object" ? model.imageLayout : null;
  const columnId = model?.columnIds?.[col];
  const cellUid = model?.getCell?.(row, col)?.uid;
  const columnEntry = (layout && columnId ? layout.columns?.[columnId] : null) || null;
  const cellEntry = (layout && cellUid ? layout.cells?.[cellUid] : null) || null;
  const size = [cellEntry?.size, columnEntry?.size].find((token) => IMAGE_SIZE_TOKENS.includes(token)) || "m";
  const fit = [cellEntry?.fit, columnEntry?.fit].find((token) => IMAGE_FIT_TOKENS.includes(token)) || "contain";
  const strip = IMAGE_LAYOUT_TOKENS.includes(columnEntry?.layout) ? columnEntry.layout : "inline";
  return {
    enabled: getSetting("images-cell-media") !== false,
    size,
    maxHeight: IMAGE_SIZE_HEIGHTS[size] ?? globalMax,
    fit,
    layout: strip,
  };
}

/** Natural sizes measured from Roam's own rendered `<img>` (LP-4: decryption is transparent because
 *  renderString owns the element). Session-scoped, never persisted; cleared on unload. */
export const imageDimensionCache = new Map();

const IMAGE_FIT_CLASSES = ["rg-cell--img-fit-contain", "rg-cell--img-fit-cover", "rg-cell--img-fit-original"];
const IMAGE_LAYOUT_CLASSES = ["rg-cell--img-inline", "rg-cell--img-strip"];
const IMAGE_SIZE_CLASSES = ["rg-cell--img-fill"];

function clearCellImageChips(cell) {
  for (const chip of cell?.querySelectorAll?.(".rg-img-fallback,.rg-img-clip-chip") || []) chip.remove();
}

/** The `<img>` nodes Roam rendered inside this content's live rich hosts. */
function cellRichImages(content) {
  const images = [];
  for (const host of content?.__rgRichHosts || []) {
    if (host.__rgDisposed) continue;
    for (const img of host.querySelectorAll?.("img") || []) images.push(img);
  }
  return images;
}

/** LP-5: a dead URL settles as `complete === true` with zero natural size, and the error event can
 *  fire before the listener exists — both shapes must read as broken. */
function richImageBroken(img) {
  if (img.__rgBroken) return true;
  return img.complete === true && !(Number(img.naturalWidth) > 0);
}

/**
 * Rebuilds the cell-level chips from live image state: one `.rg-img-fallback` per broken image
 * (alt or "image", url in the title), and a `.rg-img-clip-chip` ("+n hidden") when a height-fixed
 * cell's content overflows and whole images sit below the fold. Chips are appended to the CELL so
 * Roam's reconciliation of the rich host never sees them. Idempotent: clears, then re-derives.
 */
function syncCellImageChips(cell, content) {
  clearCellImageChips(cell);
  if (!cell?.classList?.contains?.("rg-cell--media")) return;
  const images = cellRichImages(content);
  for (const img of images) {
    if (!richImageBroken(img)) continue;
    const label = String(img.alt || "").trim() || "image";
    const chip = document.createElement("span");
    chip.className = "rg-img-fallback";
    chip.textContent = `⚠ ${label}`;
    chip.setAttribute("role", "img");
    chip.setAttribute("aria-label", `Image failed to load: ${label}`);
    chip.title = String(img.currentSrc || img.src || "");
    cell.appendChild(chip);
  }
  const cellHeight = Number(cell.clientHeight) || 0;
  const contentHeight = Number(content?.scrollHeight) || 0;
  if (!cellHeight || !images.length || contentHeight <= cellHeight + 1) return;
  const hiddenCount = images.filter((img) => Number(img.offsetTop || 0) >= cellHeight).length;
  if (!hiddenCount) return;
  const chip = document.createElement("span");
  chip.className = "rg-img-clip-chip";
  chip.textContent = `+${hiddenCount} hidden`;
  chip.title = `${hiddenCount} image${hiddenCount === 1 ? "" : "s"} clipped by the fixed row height`;
  cell.appendChild(chip);
}

/**
 * The decoration half of the media feature: toggles `rg-cell--media` plus the fit/layout classes
 * and the `--rg-img-max-h` custom property from `resolveImageLayout`, then re-derives chips. Reads
 * raw from the model when one is passed, else from `dataset.rgRaw` (the large-grid path, where the
 * render already peeked the value). Off, plain, and formula cells get stripped decor — which is a
 * DOM no-op when nothing was ever applied, so the kill switch restores exact pre-feature rendering.
 */
export function applyCellImageLayout(cell, model, row, col) {
  if (!cell?.classList) return false;
  const layout = resolveImageLayout(model, row, col);
  const raw = String(model?.getRaw?.(row, col) ?? cell.dataset?.rgRaw ?? "");
  const formula = raw.startsWith("=") && !raw.startsWith("==");
  const active = layout.enabled && !formula && cellImageMarkdown(raw).length > 0;
  cell.classList.toggle("rg-cell--media", Boolean(active));
  cell.classList.remove(...IMAGE_FIT_CLASSES, ...IMAGE_LAYOUT_CLASSES, ...IMAGE_SIZE_CLASSES);
  if (!active) {
    cell.style?.removeProperty?.("--rg-img-max-h");
    clearCellImageChips(cell);
    return false;
  }
  cell.style?.setProperty?.("--rg-img-max-h", `${layout.maxHeight}px`);
  cell.classList.add(`rg-cell--img-fit-${layout.fit}`, `rg-cell--img-${layout.layout}`);
  if (layout.size === "fill") cell.classList.add("rg-cell--img-fill");
  const content = cell.querySelector?.(".rg-cell-content");
  if (content) syncCellImageChips(cell, content);
  return true;
}

/** Hint attributes only — the React-owned host subtree is never restructured. */
function noteRichImage(img) {
  try {
    img.loading = "lazy";
    img.decoding = "async";
    if (!img.title) img.title = String(img.alt || "");
    if (img.complete && Number(img.naturalWidth) > 0) {
      const url = String(img.currentSrc || img.src || "");
      if (url) imageDimensionCache.set(url, { w: img.naturalWidth, h: img.naturalHeight });
    }
  } catch (error) {
    if (globalThis.window) globalThis.window.__RG_IMG_LAST_ERROR = String(error?.stack || error);
  }
}

/**
 * LP-1/LP-5 wiring for Roam-rendered cell images. Installs ONE idempotent capture-phase
 * load+error pair on the content div (neither event bubbles, both capture), records natural sizes,
 * and drives the cell chips. Called from `activateRichHost` ONLY for hosts inside a `.rg-cell` —
 * a suggestion-row host parked in the render cache is never wired. The listener lives on the
 * cell-owned content node, so it dies with the cell; there is nothing else to dispose.
 */
export function wireRichHostImages(content, host, cell = content?.closest?.(".rg-cell")) {
  if (!content || !cell) return false;
  if (!content.__rgImgWired) {
    content.__rgImgWired = true;
    const onMediaEvent = (event) => {
      const img = event.target;
      if (!img || String(img.tagName || "").toUpperCase() !== "IMG") return;
      try {
        if (event.type === "error") img.__rgBroken = true;
        else noteRichImage(img);
        if (richImageBroken(img)) img.__rgBroken = true;
        syncCellImageChips(content.closest?.(".rg-cell") || cell, content);
      } catch (error) {
        if (globalThis.window) globalThis.window.__RG_IMG_LAST_ERROR = String(error?.stack || error);
      }
    };
    content.addEventListener("load", onMediaEvent, true);
    content.addEventListener("error", onMediaEvent, true);
  }
  for (const img of host?.querySelectorAll?.("img") || []) {
    noteRichImage(img);
    if (richImageBroken(img)) img.__rgBroken = true;
  }
  syncCellImageChips(cell, content);
  return true;
}

/**
 * One lightbox entry per image across a set of `{row, raw}` rows in one column, in authored order.
 * `cellImageIndex` (position within its own cell, matching DOM `<img>` order) locates the clicked
 * image; `occurrence` (position among same-url images in that cell) drives `removeImageFromRaw` so a
 * delete of a duplicated URL removes the right one.
 */
function imageEntriesFromCells(rowRaws, col) {
  const entries = [];
  for (const { row, raw, uid = null } of rowRaws) {
    const source = String(raw ?? "");
    const seen = new Map();
    cellImageMarkdown(source).forEach((image, cellImageIndex) => {
      const occurrence = seen.get(image.url) || 0; seen.set(image.url, occurrence + 1);
      // `uid` (when the source can supply one — native cells do, large JSON rows do not) lets a delete
      // re-resolve the current (row, col) so a concurrent external row insert can't misdirect it. FIX-6.
      entries.push({ raw: source, alt: image.alt, url: image.url, row, col, cellImageIndex, occurrence, uid });
    });
  }
  return entries;
}

/** The GridView / RangeGridView column walk: `model.getRaw(row, col)` over a row band (whole table
 *  for the native grid, the clamped rectangle for a range excerpt), skipping merge-covered cells so
 *  a merged image cell contributes once, from its origin. */
function buildColumnImageEntries(model, col, { startRow = 0, endRow = (model?.rowCount ?? 0) - 1 } = {}) {
  if (!model || col == null) return [];
  const rowRaws = [];
  for (let row = startRow; row <= endRow; row += 1) {
    if (model.isCovered?.(row, col)) continue;
    rowRaws.push({ row, raw: model.getRaw(row, col), uid: model.getCell?.(row, col)?.uid ?? null });
  }
  return imageEntriesFromCells(rowRaws, col);
}

/** Resolves the entry index the lightbox should open at from a target cell + image position, then
 *  degrades: the cell's requested image → the cell's first image → no entry (the caller no-ops so a
 *  Shift+Space over an image-free cell opens nothing). */
function imageEntryStartIndex(entries, row, imageIndex) {
  let start = entries.findIndex((entry) => entry.row === row && entry.cellImageIndex === imageIndex);
  if (start < 0) start = entries.findIndex((entry) => entry.row === row);
  return start;
}

/**
 * Shared image-file upload for paste AND drag-drop (LP-7): serial `file.upload` calls, one
 * progress toast up front, the verbatim `![](…)` markdown strings back in file order. A failed
 * upload records the forensic trace, toasts once here (so no caller double-toasts), and rethrows —
 * the caller decides what the cell keeps.
 */
export async function uploadImageEmbeds(files) {
  const list = [...(files || [])];
  if (!list.length) return [];
  toast(`Uploading ${list.length} image${list.length === 1 ? "" : "s"}…`);
  const embeds = [];
  for (const file of list) {
    try {
      embeds.push(await roam().file.upload({ file, toast: { hide: true } }));
    } catch (error) {
      if (globalThis.window) globalThis.window.__RG_IMG_LAST_ERROR = String(error?.stack || error);
      toast(`Image upload failed: ${error.message}`, "danger");
      throw error;
    }
  }
  return embeds;
}


/** Roam's own uid shape: nine characters of `[A-Za-z0-9_-]`. Custom uids exist and are longer, which
 *  is why this only ever ADDS a row rather than deciding what the query means. */
const ROAM_UID_SHAPE = /^[A-Za-z0-9_-]{9}$/;

/**
 * The paste-a-uid case, which is how anyone actually types one. `data.search` matches block TEXT, so
 * a pasted uid searched for its own characters and found nothing — the block it names was never a
 * candidate. One `pull` on the uid index answers it directly. Strictly additive: a non-uid-shaped
 * query issues no pull at all, and a miss changes nothing.
 */
export function exactBlockSuggestion(context, api = globalThis.window?.roamAlphaAPI) {
  const query = String(context?.query || "").trim();
  if (context?.type !== "block" || !ROAM_UID_SHAPE.test(query) || typeof api?.pull !== "function") return null;
  let pulled = null;
  try { pulled = api.pull("[:block/string :block/uid]", [":block/uid", query]); }
  catch (error) { console.warn("[roam-grid] Exact block lookup failed", error); return null; }
  const uid = valueOf(pulled, "block.uid"); if (!uid) return null;
  const label = String(valueOf(pulled, "block.string") ?? "").replace(/\s+/g, " ").trim();
  return { kind: "roam-block", name: label.slice(0, 120) || "(empty block)", description: `Exact block · ${uid}`, uid: String(uid) };
}

export async function searchRoamReferenceSuggestions(context, limit = getSetting("editing-autocomplete-limit"), api = globalThis.window?.roamAlphaAPI) {
  if (!context || !api?.data?.search) return [];
  const query = String(context.query || "").trim(); if (!query) return [];
  const boundedLimit = clamp(Math.floor(Number(limit) || 8), 1, 20);
  const page = triggerIsPageLike(context.type);
  const results = await Promise.resolve(api.data.search({
    "search-str": query,
    "search-pages": page,
    "search-blocks": !page,
    "hide-code-blocks": !page,
    limit: boundedLimit,
    pull: page ? "[:node/title :block/uid]" : "[:block/string :block/uid]",
  }));
  const rows = [...(results || [])].flatMap((result) => {
    const uid = valueOf(result, "block.uid");
    if (page) {
      const title = valueOf(result, "node.title");
      return title ? [{ kind: "roam-page", name: String(title), description: "Page", uid: uid ? String(uid) : null }] : [];
    }
    const raw = valueOf(result, "block.string");
    if (!uid || raw == null) return [];
    const label = String(raw).replace(/\s+/g, " ").trim();
    return [{ kind: "roam-block", name: label.slice(0, 120) || "(empty block)", description: `Block · ${uid}`, uid: String(uid) }];
  });
  const exact = exactBlockSuggestion(context, api);
  if (!exact) return rows.slice(0, boundedLimit);
  return [exact, ...rows.filter((row) => row.uid !== exact.uid)].slice(0, boundedLimit);
}

// One batched query per result set. Measured live against the Svy graph on 2026-08-06 (6,351 pages,
// 4,328 blocks edited in the last week), twenty keys per call: page counts 10 ms median over the
// twenty most recently edited titles and 37-43 ms over a set stacked with the graph's busiest pages;
// block breadcrumbs 65 ms either way. Per-row instead of batched, those are the numbers a single
// settled keystroke pays TWENTY times — which is why both are shaped as set operations over an
// `[?x ...]` binding, and why the batching is the substance of this unit rather than a tidy-up.
const SUGGESTION_PAGE_COUNT_QUERY = '[:find ?t (count ?r) :in $ [?t ...] :where [?p :node/title ?t] [?r :block/refs ?p]]';
const SUGGESTION_BLOCK_PAGE_QUERY = '[:find ?uid ?title :in $ [?uid ...] :where [?b :block/uid ?uid] [?b :block/page ?p] [?p :node/title ?title]]';

/**
 * Linked-reference counts for page rows, owning-page breadcrumbs for block rows — the two things
 * Roam's own menu shows that a bare title or a raw block string cannot.
 *
 * A result set is homogeneous by construction: a page-shaped trigger yields `roam-page` rows and a
 * block trigger yields `roam-block` rows, so the dispatch below issues exactly ONE query, never two.
 * Both queries are set operations over an `[?x ...]` input bound to the row keys, deduplicated and
 * capped at the same limit that bounded the search (≤ 20). Rows the query does not answer for — a
 * page with no references, a create-page row, a uid Roam does not know — come back untouched.
 */
export async function enrichRoamSuggestions(suggestions, { api = globalThis.window?.roamAlphaAPI, limit = getSetting("editing-autocomplete-limit") } = {}) {
  const rows = [...(suggestions || [])];
  if (!rows.length || typeof api?.q !== "function") return rows;
  const blockUids = []; const pageTitles = [];
  for (const row of rows) {
    if (row?.kind === "roam-block" && row.uid) blockUids.push(String(row.uid));
    else if (row?.kind === "roam-page" && row.name) pageTitles.push(String(row.name));
  }
  const block = blockUids.length > 0;
  const keys = [...new Set(block ? blockUids : pageTitles)].slice(0, clamp(Math.floor(Number(limit) || 8), 1, 20));
  if (!keys.length) return rows;
  let answer = [];
  try { answer = await Promise.resolve(api.q(block ? SUGGESTION_BLOCK_PAGE_QUERY : SUGGESTION_PAGE_COUNT_QUERY, keys)); }
  catch (error) { console.warn("[roam-grid] Suggestion enrichment failed", error); return rows; }
  const found = new Map();
  for (const entry of answer || []) if (entry?.[0] != null) found.set(String(entry[0]), entry[1]);
  return rows.map((row) => {
    if (block) {
      const title = row?.kind === "roam-block" && row.uid ? found.get(String(row.uid)) : null;
      return title ? { ...row, breadcrumb: String(title) } : row;
    }
    const count = row?.kind === "roam-page" && row.name ? Math.max(0, Number(found.get(String(row.name))) || 0) : 0;
    return count ? { ...row, referenceCount: count } : row;
  });
}

/**
 * Roam's own create-page row, appended LAST: a page opener with a typed name that no result already
 * matches exactly gets one, including when the search returned nothing — that empty case is the dead
 * end this closes, because typing a page that does not exist yet used to produce silence. Offered for
 * every page-shaped trigger, `#` and `#[[` included, because Roam creates a page from those too; the
 * accepted row is written back through the trigger's own insertion, so `#` yields `#Name`.
 *
 * Accepting it inserts `[[Name]]` and creates NOTHING. `:block/refs` is an entity reference, so Roam
 * materializes the page itself when the committed string is parsed (verified live against the Svy
 * graph on 2026-08-06: a `[[nonce]]` committed into a block made `[:node/title "nonce"]` pullable,
 * having been nil immediately before). Eager creation would also orphan a page every time the user
 * cancels the draft, which this editor — unlike Roam's own always-live block editor — really has.
 */
export function withCreatePageSuggestion(context, suggestions) {
  const rows = [...(suggestions || [])];
  if (!triggerIsPageLike(context?.type)) return rows;
  const name = String(context.query ?? "").trim(); if (!name) return rows;
  const folded = name.toLowerCase();
  if (rows.some((row) => String(row?.name ?? "").trim().toLowerCase() === folded)) return rows;
  rows.push({ kind: "roam-create-page", name, description: "Create page" });
  return rows;
}

const RECENT_PAGES_QUERY = '[:find ?title ?uid ?time :where [?p :node/title ?title] [?p :block/uid ?uid] [(get-else $ ?p :edit/time 0) ?time]]';
const RECENT_BLOCKS_QUERY = '[:find ?uid ?string ?time :in $ ?since :where [?b :edit/time ?time] [(> ?time ?since)] [?b :block/string ?string] [(!= ?string "")] [?b :block/uid ?uid]]';

/** The one recency signal this extension owns: pages it inserted itself. Promoted ahead of the
 *  graph’s own edit times because inside a grid that ordering is what matches muscle memory. */
export function rememberAcceptedPage(name) {
  const title = String(name ?? "").trim(); if (!title) return;
  const lru = runtime.recentlyAcceptedPages;
  const at = lru.indexOf(title); if (at >= 0) lru.splice(at, 1);
  lru.unshift(title);
  if (lru.length > RECENT_ACCEPTED_PAGES) lru.length = RECENT_ACCEPTED_PAGES;
}

/** Whether a bare opener of this type can be answered without touching Roam — the condition under
 *  which `searchDelay` drops the debounce. */
export function recentsCacheReady(type, now = Date.now()) {
  if (!SUGGESTIBLE_EDITOR_TRIGGERS.has(type)) return false;
  const entry = roamRecentsCache.get(`${graphKeyName()}:${triggerIsPageLike(type) ? "page" : "block"}`);
  return Boolean(entry) && now - entry.at < RECENTS_TTL_MS;
}

function readRecentRows(type, api, now, { background = false, force = false } = {}) {
  const key = `${graphKeyName()}:${type}`;
  const cached = roamRecentsCache.get(key);
  if (!force && cached && now - cached.at < RECENTS_TTL_MS) return cached.rows;
  const clock = () => globalThis.performance?.now?.() ?? Date.now();
  const started = clock();
  const rows = type === "page" ? api.q(RECENT_PAGES_QUERY) : api.q(RECENT_BLOCKS_QUERY, now - RECENT_BLOCK_WINDOW_MS);
  const elapsed = clock() - started;
  const value = [...(rows || [])];
  roamRecentsCache.set(key, { at: now, rows: value });
  noteRecentsFetch(type, elapsed, background);
  // A background warm runs off the critical path, so its cost never counts toward the disarm —
  // only inline fetches the user actually waited on do.
  if (background) {
    const target = globalThis.window;
    if (target) (target.__rgDiag ||= {}).recentsWarm = { at: Date.now(), type, ms: elapsed, rows: value.length };
  }
  return value;
}

/** The budget ledger every recents fetch reports to. A fetch at or under budget — warm or inline —
 *  proves the graph healthy: the overrun streak resets and a disarmed gate re-arms. Over budget,
 *  only inline fetches count, because a background warm never made anyone wait; CONSECUTIVE
 *  overruns disarm, so one GC pause cannot kill bare openers for the session. Cache hits never
 *  reach here — those rows are already paid for, so they open the menu armed or not. */
function noteRecentsFetch(type, elapsed, background) {
  const label = type === "page" ? "pages" : "blocks";
  if (elapsed <= RECENTS_BUDGET_MS) {
    runtime.recentsOverruns = 0;
    if (runtime.recentsDisabled) {
      runtime.recentsDisabled = false;
      runtime.recentsRearmedAt = Date.now();
      console.info(`[roam-grid] Recent ${label} back under the ${RECENTS_BUDGET_MS}ms budget (${Math.round(elapsed)}ms). Bare [[ and (( re-armed.`);
    }
  } else if (!background) {
    runtime.recentsOverruns += 1;
    if (!runtime.recentsDisabled && runtime.recentsOverruns >= RECENTS_DISARM_OVERRUNS) {
      runtime.recentsDisabled = true;
      console.info(`[roam-grid] Recent ${label} took ${Math.round(elapsed)}ms, over the ${RECENTS_BUDGET_MS}ms budget ${RECENTS_DISARM_OVERRUNS} fetches in a row. Bare [[ and (( open on cached recents only until a fetch comes back under budget; typing a query still searches.`);
    }
  }
  const target = globalThis.window;
  if (target) (target.__rgDiag ||= {}).recentsBudget = { disarmed: runtime.recentsDisabled, overruns: runtime.recentsOverruns, lastMs: Math.round(elapsed), rearmedAt: runtime.recentsRearmedAt };
}

/** Warms both recents caches off the critical path. Returns false when nothing could run, which is
 *  how the scheduler knows not to keep a re-warm chain alive against a dead API. */
export function warmRecentsCache({ api = globalThis.window?.roamAlphaAPI, now = Date.now(), force = false } = {}) {
  if (typeof api?.q !== "function") return false;
  let warmed = true;
  for (const type of ["page", "block"]) {
    try { readRecentRows(type, api, now, { background: true, force }); }
    catch (error) {
      warmed = false;
      const target = globalThis.window;
      if (target) (target.__rgDiag ||= {}).lastError = String(error?.stack || error);
    }
  }
  return warmed;
}

const recentsWarmHandles = { idleId: null, cancelIdle: null, timerId: null };

function scheduleRecentsRewarm() {
  recentsWarmHandles.timerId = trackedTimeout(() => {
    recentsWarmHandles.timerId = null;
    const visible = (globalThis.document?.visibilityState ?? "visible") === "visible";
    const mounted = runtime.sessions.size > 0 || runtime.largeMounts.size > 0;
    // An idle graph with no grids must not run perpetual background queries: the chain stops here
    // and the next bare opener pays one inline fetch, exactly as before the warm existed.
    if (!visible || !mounted) return;
    if (warmRecentsCache({ force: true })) scheduleRecentsRewarm();
  }, RECENTS_TTL_MS - RECENTS_REWARM_LEAD_MS);
}

/** Schedules the post-onload warm on idle time (a short timeout where idle callbacks are missing).
 *  Every handle lands in the lifecycle: timers through pendingTimers, the idle handle through
 *  cancelRecentsWarm, which onunload calls. */
export function scheduleRecentsWarm({ requestIdle = globalThis.requestIdleCallback, cancelIdle = globalThis.cancelIdleCallback } = {}) {
  cancelRecentsWarm();
  const begin = () => {
    recentsWarmHandles.idleId = null; recentsWarmHandles.cancelIdle = null; recentsWarmHandles.timerId = null;
    if (warmRecentsCache()) scheduleRecentsRewarm();
  };
  if (typeof requestIdle === "function") {
    recentsWarmHandles.idleId = requestIdle(begin);
    recentsWarmHandles.cancelIdle = typeof cancelIdle === "function" ? cancelIdle : null;
  } else {
    recentsWarmHandles.timerId = trackedTimeout(begin, RECENTS_WARM_FALLBACK_MS);
  }
}

export function cancelRecentsWarm() {
  if (recentsWarmHandles.idleId != null && recentsWarmHandles.cancelIdle) recentsWarmHandles.cancelIdle(recentsWarmHandles.idleId);
  if (recentsWarmHandles.timerId != null) { clearTimeout(recentsWarmHandles.timerId); pendingTimers.delete(recentsWarmHandles.timerId); }
  recentsWarmHandles.idleId = null; recentsWarmHandles.cancelIdle = null; recentsWarmHandles.timerId = null;
}

function recentPageSuggestions(rows, limit) {
  const byTitle = new Map();
  for (const row of rows) {
    const title = String(row?.[0] ?? "").trim(); if (!title) continue;
    byTitle.set(title, { name: title, uid: row[1] == null ? null : String(row[1]), time: Number(row[2]) || 0 });
  }
  const promoted = [];
  for (const title of runtime.recentlyAcceptedPages) {
    promoted.push(byTitle.get(title) || { name: title, uid: null, time: 0 });
    byTitle.delete(title);
  }
  const rest = [...byTitle.values()].sort((a, b) => b.time - a.time);
  return [...promoted, ...rest].slice(0, limit).map((entry) => ({ kind: "roam-page", name: entry.name, description: "Page", uid: entry.uid }));
}

function recentBlockSuggestions(rows, limit, excludeUids) {
  const entries = [];
  for (const row of rows) {
    const uid = row?.[0] == null ? null : String(row[0]);
    if (!uid || excludeUids?.has(uid)) continue;
    const label = String(row[1] ?? "").replace(/\s+/g, " ").trim(); if (!label) continue;
    entries.push({ uid, label, time: Number(row[2]) || 0 });
  }
  entries.sort((a, b) => b.time - a.time);
  return entries.slice(0, limit).map((entry) => ({ kind: "roam-block", name: entry.label.slice(0, 120), description: `Block · ${entry.uid}`, uid: entry.uid }));
}

/**
 * The recents path, deliberately separate from the search path: a bare `[[` offers the pages this
 * graph edited most recently and a bare `((` the blocks it edited in the last week, which is what
 * Roam’s own menu does. `excludeUids` is the caller’s own table — every cell edit touches a block,
 * so without it a recent-blocks list opened inside a grid is mostly the grid you are sitting in.
 * Large grids pass nothing, because their cells are JSON rows and have no uid to collide with.
 */
export async function searchRoamRecentSuggestions(context, { limit = getSetting("editing-autocomplete-limit"), api = globalThis.window?.roamAlphaAPI, excludeUids = null, now = Date.now() } = {}) {
  if (!context || !emptyOpenerEnabled()) return [];
  if (typeof api?.q !== "function") return [];
  const boundedLimit = clamp(Math.floor(Number(limit) || 8), 1, 20);
  const page = triggerIsPageLike(context.type);
  // The disarm gates only the run-the-query-now decision: with a fresh cache the rows are already
  // paid for, so the menu opens on them armed or not.
  if (recentsDisabled() && !recentsCacheReady(context.type, now)) return [];
  let rows = [];
  try { rows = readRecentRows(page ? "page" : "block", api, now); }
  catch (error) { console.warn("[roam-grid] Recents query failed", error); return []; }
  return page ? recentPageSuggestions(rows, boundedLimit) : recentBlockSuggestions(rows, boundedLimit, excludeUids);
}

/** Caret moves a `<textarea>` reports through neither `select` nor `input`, so the trigger context
 *  has to be re-derived from a keyup instead. Without them a menu opened on `[[Pro` stays up against
 *  a caret that has already walked out of the query it belongs to. */
const CARET_MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
/** The pairs Roam wraps a selection in. `[` twice over a label is how an aliased ref is built by hand. */
const SELECTION_WRAP_PAIRS = new Map([["[", "]"], ["(", ")"], ["{", "}"], ['"', '"']]);

/** Wraps the selection in `key` and its partner, leaving the original text selected so the gesture
 *  repeats. Returns false and touches nothing when the key is not a pair or there is no selection. */
export function wrapSelectionOnPair(editor, key) {
  const closer = SELECTION_WRAP_PAIRS.get(key);
  if (!closer || !editor) return false;
  const start = editor.selectionStart ?? 0; const end = editor.selectionEnd ?? start;
  if (end <= start) return false;
  editor.setRangeText(`${key}${editor.value.slice(start, end)}${closer}`, start, end, "preserve");
  editor.setSelectionRange(start + 1, end + 1);
  return true;
}

/**
 * The two enrichment decorations, written onto a row that already exists. Both are siblings of the
 * detail cell rather than children of it, so each stays its own grid track and the count keeps the
 * quiet right-aligned superscript treatment `.rg-cell-reference-count` already established.
 *
 * A row never carries both: a breadcrumb belongs to a block row and a count to a page row, and the
 * row kind is part of the signature, so a kind change rebuilds rather than re-decorating.
 */
function applySuggestionEnrichment(option, suggestion) {
  const trail = suggestion?.breadcrumb ? String(suggestion.breadcrumb) : "";
  let breadcrumb = option.querySelector?.(".rg-suggestion-breadcrumb") || null;
  if (!trail) breadcrumb?.remove();
  else {
    if (!breadcrumb) { breadcrumb = document.createElement("span"); breadcrumb.className = "rg-suggestion-breadcrumb"; option.appendChild(breadcrumb); }
    breadcrumb.textContent = trail;
  }
  const count = Math.max(0, Number(suggestion?.referenceCount) || 0);
  let badge = option.querySelector?.(".rg-suggestion-count") || null;
  if (!count) { badge?.remove(); return; }
  if (!badge) { badge = document.createElement("span"); badge.className = "rg-suggestion-count"; option.appendChild(badge); }
  badge.textContent = String(count);
  badge.setAttribute("aria-label", `${count} linked reference${count === 1 ? "" : "s"}`);
}

/* ------------------------------------------------------------------------------------------------
 * Native cell editing — Roam's own block editor, mounted over the cell.
 *
 * The grid's editor is a plain textarea with the extension's approximation of Roam's menus behind
 * it. Mounting `renderBlock({uid, el})` over the cell instead gives the cell Roam's REAL editor, so
 * `[[`, `((`, `#`, `{{` and `/` open Roam's own menus with everything they carry. Everything below
 * exists because that editor belongs to a document outliner, not to a grid: it wants to split the
 * block on Enter, merge it into its neighbour on Backspace, and walk the caret into the chained
 * next-column cell on the arrows. Each of those is intercepted; what is left is Roam's.
 * ---------------------------------------------------------------------------------------------- */

/** Records the U1 forensic surface before a catch swallows an error. */
function noteNativeEditorError(error) {
  const target = globalThis.window;
  if (target) target.__RG_U1_LAST_ERROR = String(error?.stack || error);
  return error;
}

/** `getSetting !== false` rather than `=== true`, so a graph that has never seen the key opts in. */
export function nativeEditorEnabled() {
  return getSetting("editing-native-editor") !== false && Date.now() >= (runtime.nativeEditorDisabledUntil || 0);
}

/** Three CONSECUTIVE mount/focus failures disarm the overlay for 30 s, with one toast per cooldown. */
export function noteNativeEditorFailure() {
  runtime.nativeEditorFailures = (Number(runtime.nativeEditorFailures) || 0) + 1;
  if (runtime.nativeEditorFailures < 3) return runtime.nativeEditorFailures;
  const now = Date.now();
  if (now >= (runtime.nativeEditorDisabledUntil || 0)) toast("Roam Grid: native editor temporarily unavailable (cooldown 30 s) — using the grid editor", "warning");
  runtime.nativeEditorDisabledUntil = now + 30_000;
  runtime.nativeEditorFailures = 0;
  return runtime.nativeEditorFailures;
}

export function noteNativeEditorSuccess() { runtime.nativeEditorFailures = 0; return runtime.nativeEditorFailures; }

export function resetNativeEditorHealth() {
  runtime.nativeEditorFailures = 0; runtime.nativeEditorDisabledUntil = 0; runtime.nativeEditorSawPopup = false;
  return runtime;
}

/**
 * Roam's textarea is a React controlled input, so assigning `.value` directly is reverted on the
 * next render. The prototype setter plus a dispatched `input` is the standard escape hatch.
 */
export function setNativeTextareaValue(textarea, value) {
  const next = String(value ?? "");
  const setter = Object.getOwnPropertyDescriptor(globalThis.HTMLTextAreaElement?.prototype || {}, "value")?.set;
  if (typeof setter === "function") setter.call(textarea, next); else textarea.value = next;
  return next;
}

export function insertIntoNativeTextarea(textarea, text) {
  const value = String(textarea?.value ?? "");
  const start = Number.isFinite(Number(textarea?.selectionStart)) ? Number(textarea.selectionStart) : value.length;
  const end = Number.isFinite(Number(textarea?.selectionEnd)) ? Number(textarea.selectionEnd) : start;
  const next = setNativeTextareaValue(textarea, `${value.slice(0, start)}${text}${value.slice(end)}`);
  const caret = start + String(text).length;
  textarea.setSelectionRange?.(caret, caret);
  const Constructor = globalThis.InputEvent || globalThis.Event;
  if (typeof Constructor === "function") textarea.dispatchEvent?.(new Constructor("input", { bubbles: true }));
  return next;
}

/** Multi-line clipboard text becomes one line: a grid cell is one block, and Roam's own paste would
 *  otherwise create a block per line underneath it, which is the structural damage U1 exists to avoid. */
export function sanitizeNativePasteText(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean).join(" ");
}

/**
 * PINNED FACT 4: `setBlockFocusAndSelection` does not reach a `renderBlock` mount — a synthetic
 * mousedown/mouseup/click on the rendered block input does. This is the only mechanism that works.
 */
export function synthesizeBlockClick(host) {
  if (!host?.dispatchEvent) return false;
  const rect = host.getBoundingClientRect?.() || { left: 0, top: 0, height: 0 };
  const init = {
    bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1, detail: 1,
    clientX: (Number(rect.left) || 0) + 2, clientY: (Number(rect.top) || 0) + ((Number(rect.height) || 0) / 2),
  };
  for (const type of ["mousedown", "mouseup", "click"]) {
    const Constructor = globalThis.MouseEvent || globalThis.Event;
    const event = typeof Constructor === "function" ? new Constructor(type, init) : { type, ...init };
    host.dispatchEvent(event);
  }
  return true;
}

function nativeOverlayNodeVisible(node) {
  if (!node) return false;
  if (node.hidden) return false;
  const rect = node.getBoundingClientRect?.();
  if (rect && Number.isFinite(Number(rect.height)) && Number.isFinite(Number(rect.width))) return Number(rect.height) > 0 || Number(rect.width) > 0;
  return true;
}

function nativeTreeUids(tree, found = new Set()) {
  if (!tree?.uid) return found;
  found.add(tree.uid);
  for (const child of tree.children || []) nativeTreeUids(child, found);
  return found;
}

function nativeTreeNode(tree, uid) {
  if (!tree) return null;
  if (tree.uid === uid) return tree;
  for (const child of tree.children || []) { const found = nativeTreeNode(child, uid); if (found) return found; }
  return null;
}

/**
 * PINNED FACT 6: an Enter that reaches Roam with the caret mid-value SPLITS the cell block — the
 * value truncates at the caret and the remainder becomes a NEW child of the cell, sitting next to
 * the chained next-column cell. The damage is recognised structurally: uids in the live tree that
 * the verified base tree has never seen, hanging as direct children of the edited cell. Every
 * childless stray merges back into the cell in document order; a stray with children of its own is
 * more than a split remainder and forces the structural-reload lane explicitly, because
 * `nativeStructureSignature` walks first-child chains and computes a damaged table identical to a
 * healthy one — without the forced reload there is no toast and the text dies in invisible blocks.
 */
export function nativeOverlayStrayRepair(baseTree, currentTree, uid) {
  if (!baseTree || !currentTree || !uid) return null;
  const known = nativeTreeUids(baseTree);
  const novel = new Set([...nativeTreeUids(currentTree)].filter((value) => !known.has(value)));
  if (!novel.size) return null;
  const cell = nativeTreeNode(currentTree, uid);
  if (!cell) return null;
  const strays = (cell.children || []).filter((child) => novel.has(child.uid));
  if (!strays.length) return null;
  if (strays.some((stray) => (stray.children || []).length)) return { cellUid: uid, forceReload: true, strays: [] };
  return { cellUid: uid, strays: strays.map((stray) => ({ uid: stray.uid, text: nativeStoredRaw(stray.string) })) };
}

/**
 * One instance per `GridView`. Owns at most one mounted Roam block editor at a time and every
 * listener, frame and node it creates; `dispose()` unmounts and NEVER writes, because a mid-edit
 * disposal must not clobber whatever Roam last saved.
 */
export class NativeCellEditorOverlay {
  constructor(view, { onFinish = null, mountIsolation = false, seedThroughTextarea = false } = {}) {
    this.view = view;
    this.onFinish = onFinish;
    this.mountIsolation = mountIsolation;
    this.seedThroughTextarea = seedThroughTextarea;
    this.state = null;
    this.overlay = null;
    this.textarea = null;
    this.beforeRaw = "";
    this.mountDisposers = [];
    this.listenerDisposers = [];
    this.frames = new Map();
    this.repairScheduled = false;
    this.repairCommitWhenClean = false;
    this.repairRunning = false;
    // FIX-E backstop cadence: Roam's blur flush lands hundreds of ms out, so the reconcile poll
    // waits this long between reads. An instance field so a test can drop it to run fast.
    this.reconcileDelayMs = 130;
    // FIX-E5: the reconcile poll (a cancel backstop) runs for ~1.5s and must not outlive its edit.
    // `reconcileEpoch` is bumped on every start/commit/cancel/dispose; the poll captures the epoch
    // it was born under and bails the instant a newer edit/action supersedes it, so a stale poll
    // can never re-apply an old `beforeRaw` over a value a later edit committed to the same cell.
    // The poll's pending timer handles live here too, so a superseding action cancels them outright.
    this.reconcileEpoch = 0;
    this.reconcileTimers = new Map();
    this.popupJustClosed = false;
    // FIX-E: exactly ONE Escape per typing episode is lent to Roam's menu; every Escape after that
    // is the overlay's cancel, whatever the popup probe reads.
    this.escapeDeferred = false;
    // FIX-E4: monotonic timestamp of the last Escape lent to Roam's menu. The `input` listener that
    // clears `escapeDeferred` (Roam fires `input` while closing its `[[` menu) deliberately does NOT
    // clear this, so the focus-floor can still recognise a menu-close blur as the lent Escape's
    // consequence within ESCAPE_BLUR_WINDOW_MS. 0 means no Escape is outstanding.
    this.lastEscapeLentAt = 0;
    this.escapeKeydownSeen = false;
    this.focusCheckScheduled = false;
    this.disposed = false;
    this.starting = null;
    this.pendingSeed = null;
    this.claimedUid = null;
    this.mountTriggerContext = null;
    this.settleObserver = null;
  }

  get active() { return Boolean(this.state); }

  /** FIX-E4: monotonic clock seam — a test overrides it to place a lent Escape inside or outside
   *  ESCAPE_BLUR_WINDOW_MS without a wall-clock wait. */
  now() { return globalThis.performance?.now?.() ?? Date.now(); }

  /** F2h: races requestAnimationFrame against a tracked ~500ms timeout so await points never
   *  hang when rAF is suspended (e.g. background tabs). The faster of the two wins; the loser
   *  is cancelled. Teardown force-settles both via the usual frames map + tracked timer sweep. */
  nextFrame() {
    return new Promise((resolve) => {
      if (typeof globalThis.requestAnimationFrame !== "function") { trackedTimeout(resolve, 16); return; }
      let settled = false;
      const id = globalThis.requestAnimationFrame(() => {
        if (settled) return;
        settled = true;
        this.frames.delete(id);
        clearTimeout(timerId);
        resolve();
      });
      this.frames.set(id, resolve);
      const timerId = trackedTimeout(() => {
        if (settled) return;
        settled = true;
        globalThis.cancelAnimationFrame?.(id);
        this.frames.delete(id);
        resolve();
      }, 500);
    });
  }

  /** Polls `probe` now and then once per frame, at most `limit` extra frames. No timers. */
  async pollFrames(probe, limit) {
    for (let attempt = 0; attempt <= limit; attempt += 1) {
      let value = null;
      try { value = probe(); } catch (error) { noteNativeEditorError(error); value = null; }
      if (value) return value;
      if (attempt === limit || this.disposed) break;
      await this.nextFrame();
    }
    return null;
  }

  /** F2a: time-based poll — keeps probing until the predicate returns truthy or `ms` elapses.
   *  Each retry is one nextFrame() tick (which may time out at 500ms when rAF is suspended). */
  async pollUntil(probe, ms) {
    const start = this.now();
    let result = probe();
    while (!result && !this.disposed && this.now() - start < ms) {
      await this.nextFrame();
      try { result = probe(); } catch (error) { noteNativeEditorError(error); result = null; }
    }
    return result;
  }

  blockInput() { return this.overlay?.querySelector?.(ROAM_BLOCK_INPUT_SELECTOR) || null; }

  hostTextarea() {
    const active = globalThis.document?.activeElement;
    if (active && this.overlay?.contains?.(active) && String(active.tagName || "").toUpperCase() === "TEXTAREA") return active;
    return this.overlay?.querySelector?.("textarea") || null;
  }

  mountBlock(uid, el) {
    const components = roam().ui?.components;
    if (typeof components?.renderBlock !== "function") return false;
    if (typeof components.unmountNode === "function") this.mountDisposers.push(() => components.unmountNode({ el }));
    const result = components.renderBlock({ uid, el });
    if (typeof result === "function") this.mountDisposers.push(result);
    else if (typeof result?.dispose === "function") this.mountDisposers.push(() => result.dispose());
    else if (result && typeof result.then === "function") {
      result.then((resolved) => {
        if (typeof resolved !== "function") return;
        if (this.state) this.mountDisposers.push(resolved); else resolved();
      }, (error) => { noteNativeEditorError(error); });
    }
    return true;
  }

  listen(target, type, handler, capture = false) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, capture);
    this.listenerDisposers.push(() => target.removeEventListener?.(type, handler, capture));
  }

  /** Truthy on success; `null` means the caller falls back to the grid's own editor. */
  start(args) {
    if (this.disposed || !args?.cell || !args?.uid) return Promise.resolve(null);
    // OS key auto-repeat re-enters while the first start is still awaiting Roam. The repeated
    // keystroke must JOIN the in-flight mount — returning null here would stack the grid editor
    // on top of the overlay that is about to finish mounting.
    if (this.starting) return this.starting;
    const pending = this.startOnce(args);
    this.starting = pending;
    const clear = () => { if (this.starting === pending) this.starting = null; };
    pending.then(clear, clear);
    return pending;
  }

  async startOnce({ row, col, cell, uid, raw, initial = null }) {
    // FIX-E5: a new edit episode supersedes any reconcile poll still running from a prior cancel —
    // bump first so the re-edit-same-cell case (cancel → immediate re-edit) can never be reverted.
    this.bumpReconcileEpoch();
    if (this.state) await this.commit(null);
    if (this.disposed) return null;
    const session = this.view?.session || null;
    if (session && (session.structuralPending || session.dirtyCells?.has?.(uid))) {
      try { await session.flushContentSave(); } catch (error) { noteNativeEditorError(error); return null; }
      if (session.structuralPending || session.dirtyCells?.has?.(uid)) return null;
    }
    if (this.disposed) return null;
    this.beforeRaw = String(raw ?? "");
    // FIX-E4: a new edit episode starts with no Escape outstanding.
    this.lastEscapeLentAt = 0;
    if (initial != null && !this.seedThroughTextarea) {
      const seed = String(initial);
      try {
        this.view.adapter?.recordSelfWrite?.(uid, this.beforeRaw, seed);
        try { await updateBlock(uid, nativePersistedRaw(seed)); }
        catch (error) { this.view.adapter?.consumeSelfWrite?.(uid, this.beforeRaw, seed); throw error; }
        this.view.adapter?.patchBaseContent?.([{ uid, raw: seed }]);
        this.pendingSeed = { uid, seed, beforeRaw: this.beforeRaw };
      } catch (error) { noteNativeEditorError(error); return null; }
      // A dispose landing inside the seed write leaves no one else to unwind the seeded character.
      if (this.disposed) { await this.revertSeed(); return null; }
    }
    const overlay = document.createElement("div");
    overlay.className = "rg-native-cell-editor";
    overlay.setAttribute("role", "presentation");
    this.overlay = overlay;
    cell.classList.add("rg-cell--editing", "rg-cell--native-editing");
    cell.appendChild(overlay);
    if (this.disposed) {
      cell.classList.remove("rg-cell--editing", "rg-cell--native-editing");
      overlay.remove();
      if (this.overlay === overlay) this.overlay = null;
      await this.revertSeed();
      return null;
    }
    if (this.mountIsolation) {
      this.listen(overlay, "mousedown", (event) => event.stopPropagation());
      this.listen(overlay, "mouseup", (event) => event.stopPropagation());
      this.listen(overlay, "click", (event) => event.stopPropagation());
      this.listen(overlay, "dblclick", (event) => event.stopPropagation());
      this.listen(overlay, "pointerdown", (event) => event.stopPropagation());
      this.listen(overlay, "pointerup", (event) => event.stopPropagation());
    }
    this.state = { row, col, cell, uid, composing: false, finishing: false, lastValue: this.beforeRaw };
    let mounted = false;
    try { mounted = this.mountBlock(uid, overlay); } catch (error) { noteNativeEditorError(error); mounted = false; }
    if (!mounted) return this.failStart();
    const host = await this.pollUntil(() => this.blockInput(), 250);
    if (!host || !this.state) return this.failStart();
    overlay.classList.add("rg-native-cell-editor--ready");
    session?.beginNativeOverlayEdit?.(uid);
    this.claimedUid = uid;
    if (this.seedThroughTextarea && typeof globalThis.MutationObserver === "function") {
      let mutations = 0;
      const observer = new globalThis.MutationObserver(() => { mutations += 1; });
      this.settleObserver = observer;
      observer.observe(overlay, { childList: true, subtree: true, attributes: true, characterData: true });
      const start = this.now();
      const cap = 900;
      let quiet = 0;
      while (this.state && this.overlay && observer && quiet < 2) {
        if (this.now() - start >= cap) break;
        await this.nextFrame();
        quiet = mutations === 0 ? quiet + 1 : 0;
        mutations = 0;
      }
      this.settleObserver = null;
      observer.disconnect();
      if (!this.state || !this.overlay) return this.failStart();
    }
    try { synthesizeBlockClick(host); } catch (error) { noteNativeEditorError(error); }
    const textarea = await this.pollUntil(() => this.hostTextarea(), 350);
    if (!textarea || !this.state) return this.failStart();
    this.textarea = textarea;
    if (this.seedThroughTextarea) {
      const target = initial != null ? String(initial) : this.beforeRaw;
      if (String(textarea.value ?? "") !== target) {
        setNativeTextareaValue(textarea, target);
        const Constructor = globalThis.InputEvent || globalThis.Event;
        if (typeof Constructor === "function") textarea.dispatchEvent?.(new Constructor("input", { bubbles: true }));
      }
      const caret = target.length;
      try { textarea.setSelectionRange?.(caret, caret); } catch (error) { noteNativeEditorError(error); }
      const value = target;
      this.state.lastValue = value;
      this.mountTriggerContext = roamEditorTriggerContext(value, caret, { formula: false });
    } else {
      const value = String(textarea.value ?? "");
      const caret = initial == null ? value.length : Math.min(value.length, String(initial).length);
      try { textarea.setSelectionRange?.(caret, caret); } catch (error) { noteNativeEditorError(error); }
      this.state.lastValue = value;
      this.mountTriggerContext = roamEditorTriggerContext(value, caret, { formula: false });
    }
    this.pendingSeed = null;
    this.listen(overlay, "keydown", (event) => this.interceptKeydown(event), true);
    this.listen(overlay, "paste", (event) => this.interceptPaste(event), true);
    // Typing starts a new menu episode, so the one Escape lent to Roam is lent again.
    this.listen(overlay, "input", () => { this.escapeDeferred = false; this.state && (this.state.lastValue = String(this.textarea?.value ?? this.state.lastValue)); this.scheduleStructureRepair(); }, true);
    this.listen(overlay, "compositionstart", () => { if (this.state) this.state.composing = true; }, true);
    this.listen(overlay, "compositionend", () => { if (this.state) this.state.composing = false; }, true);
    this.listen(overlay, "focusin", (event) => this.onOverlayFocusIn(event), true);
    this.listen(overlay, "focusout", () => this.scheduleFocusEscapeCheck(), true);
    this.listen(globalThis.document, "pointerdown", (event) => this.onDocumentPointerDown(event), true);
    // FIX-E backstops. The overlay-scoped capture listener is beaten by anything Roam registers on
    // an ANCESTOR in the capture phase that calls `stopPropagation` — the Escape then never reaches
    // the overlay at all and the edit wedges with no way out. A same-node listener still runs after
    // a `stopPropagation`, so a document-capture keydown recovers that case, and a document-capture
    // keyup recovers the case where the keydown itself is swallowed outright.
    this.listen(globalThis.document, "keydown", (event) => this.onDocumentKeydown(event), true);
    this.listen(globalThis.document, "keyup", (event) => this.onDocumentKeyup(event), true);
    noteNativeEditorSuccess();
    if (this.state) this.state.startedAt = this.now();
    return this.state;
  }

  /** Undoes the character seeded before the mount was proven: a failed start must not leave the
   *  cell holding one stray character in the graph while the fallback editor opens on stale raw. */
  async revertSeed() {
    const pending = this.pendingSeed;
    if (!pending) return;
    this.pendingSeed = null;
    const { uid, seed, beforeRaw } = pending;
    try {
      this.view.adapter?.recordSelfWrite?.(uid, seed, beforeRaw);
      try { await updateBlock(uid, nativePersistedRaw(beforeRaw)); }
      catch (error) { this.view.adapter?.consumeSelfWrite?.(uid, seed, beforeRaw); throw error; }
      this.view.adapter?.patchBaseContent?.([{ uid, raw: beforeRaw }]);
    } catch (error) { noteNativeEditorError(error); }
  }

  /** A mount or focus failure: fail toward the grid editor, never toward an empty cell. */
  async failStart() {
    const claimed = this.claimedUid;
    this.teardown();
    // teardown nulled the state dispose() would have used to find the claim, so release it here —
    // a leaked claim makes every later external edit to that cell invisible to undo.
    if (claimed) this.view?.session?.endNativeOverlayEdit?.(claimed, { commit: false });
    await this.revertSeed();
    noteNativeEditorFailure();
    return null;
  }

  /** PINNED FACT 5: Roam's menu portal is a direct child of `<body>`. Returns the live portal node
   *  or null. Separate from `nativeAutocompleteOpen` because the focus-leave fallback must consult
   *  the REAL menu only — never the trigger-context stand-in, which reads an auto-paired `[[]]` at
   *  the caret as an open menu and would re-wedge the overlay. */
  nativeAutocompletePortal() {
    let node = null;
    try { node = globalThis.document?.querySelector?.(".rm-autocomplete__results") || null; }
    catch (error) { noteNativeEditorError(error); return null; }
    if (!node) return null;
    runtime.nativeEditorSawPopup = true;
    return nativeOverlayNodeVisible(node) ? node : null;
  }

  /** The trigger-context fallback only applies on a session where the portal selector has never
   *  matched anything at all, and only to a context that opened DURING this edit — a cell that
   *  already reads `… #done` at mount is text, not a menu, and trusting it passes Enter through
   *  into a block split. */
  nativeAutocompleteOpen() {
    if (this.nativeAutocompletePortal()) return true;
    if (runtime.nativeEditorSawPopup) return false;
    const textarea = this.textarea; if (!textarea) return false;
    const value = String(textarea.value ?? "");
    const caret = Number.isFinite(Number(textarea.selectionStart)) ? Number(textarea.selectionStart) : value.length;
    const context = roamEditorTriggerContext(value, caret, { formula: false });
    if (!context) return false;
    const baseline = this.mountTriggerContext;
    if (baseline && context.type === baseline.type && context.startIndex === baseline.startIndex && context.query === baseline.query) return false;
    return true;
  }

  swallow(event) { event.preventDefault?.(); event.stopPropagation?.(); return true; }

  markPopupJustClosed() {
    this.popupJustClosed = true;
    void this.nextFrame().then(() => { this.popupJustClosed = false; });
  }

  interceptKeydown(event) {
    const state = this.state;
    if (!state || state.finishing) return;
    if (state.composing || event.isComposing) return;
    const key = String(event.key ?? "");
    const command = event.metaKey || event.ctrlKey;
    // Roam has no JS undo handler; ⌘Z / ⌘⇧Z mid-edit belong to the browser's native undo on its
    // textarea, which is exactly what the user expects while typing.
    if (command && key.toLowerCase() === "z") return;
    // Block-move chords: every one of them moves this cell out of its row chain. Plain ⌘/Ctrl+Enter
    // is NOT swallowed — Roam binds it to the TODO toggle, which rewrites only this block's own
    // string (content, not structure). LIVE ACCEPTANCE MUST CONFIRM the TODO toggle behaves inside
    // a cell block.
    if (command && (key === "ArrowUp" || key === "ArrowDown")) return void this.swallow(event);
    // …while ⌘/Ctrl+Enter passes straight through to Roam's TODO toggle (see above).
    if (command && key === "Enter") return;
    // Escape is answered before the shared popup probe below: `handleEscapeKey` owns its own
    // discrimination so the document-level backstops can reuse it verbatim.
    if (key === "Escape") { this.escapeKeydownSeen = true; this.handleEscapeKey(event, { scoped: true }); return; }
    const popup = !this.popupJustClosed && this.nativeAutocompleteOpen();
    if (key === "Enter" && !event.shiftKey) {
      if (popup) return void this.scheduleStructureRepair();
      this.swallow(event);
      void this.commit(enterMovement());
      return;
    }
    if (key === "Tab") {
      if (popup) return void this.scheduleStructureRepair();
      this.swallow(event);
      void this.commit(tabMovement(undefined, event.shiftKey));
      return;
    }
    const textarea = this.textarea;
    const value = String(textarea?.value ?? "");
    const start = Number.isFinite(Number(textarea?.selectionStart)) ? Number(textarea.selectionStart) : 0;
    const end = Number.isFinite(Number(textarea?.selectionEnd)) ? Number(textarea.selectionEnd) : start;
    const collapsed = start === end;
    // Backspace at 0 merges this cell into the previous block of the chain; Delete at the end
    // forward-merges the hidden next-column cell into it. Both destroy the row.
    if (key === "Backspace" && collapsed && start === 0) return void this.swallow(event);
    if (key === "Delete" && collapsed && end === value.length) return void this.swallow(event);
    if (key === "ArrowUp" && !value.slice(0, start).includes("\n")) { if (popup) return; return void this.swallow(event); }
    if (key === "ArrowDown" && !value.slice(end).includes("\n")) { if (popup) return; return void this.swallow(event); }
  }

  /**
   * FIX-E, the wedge. Escape used to be handed back to Roam on EVERY keystroke the popup probe read
   * as open, so an edit whose menu had been opened could never be cancelled: Roam re-renders its
   * portal while the caret sits inside an auto-paired `[[]]`, the probe kept answering "open", the
   * overlay kept deferring, `cancel()` never ran, and the modified value reached the graph on the
   * later blur flush. The one-frame `popupJustClosed` marker is far too short to bridge two human
   * keystrokes, so it cannot stand in for ownership either.
   *
   * The rule is now positional, not probed: at most ONE Escape per typing episode is lent to the
   * menu. `input` opens a new episode; everything else after the loan is the overlay's cancel.
   */
  handleEscapeKey(event, { scoped = false } = {}) {
    const state = this.state;
    if (!state || state.finishing) return false;
    if (state.composing || event?.isComposing) return false;
    // Overlay-scoped and document-scoped listeners both see the same event in real Roam.
    if (event?.__rgOverlayEscapeHandled) return false;
    if (!scoped && !this.escapeBelongsToOverlay(event)) return false;
    if (event) event.__rgOverlayEscapeHandled = true;
    if (!this.escapeDeferred && !this.popupJustClosed && this.nativeAutocompleteOpen()) {
      this.escapeDeferred = true;
      // FIX-E4: stamp the loan so the focus-floor can recognise Roam's menu-close blur even after the
      // menu-close `input` event clears `escapeDeferred` before the floor runs.
      this.lastEscapeLentAt = this.now();
      this.markPopupJustClosed();
      return false;
    }
    event?.preventDefault?.(); event?.stopPropagation?.();
    // FIX-E4: the loan resolved to a real cancel, so no Escape is outstanding any more.
    this.escapeDeferred = false;
    this.lastEscapeLentAt = 0;
    void this.cancel();
    return true;
  }

  /** A document-level Escape is this overlay's only when the edit it belongs to is this edit. */
  escapeBelongsToOverlay(event) {
    const target = event?.target || null;
    if (target && (target === this.textarea || this.overlay?.contains?.(target))) return true;
    if (target?.closest?.(".rm-autocomplete__results")) return true;
    const active = globalThis.document?.activeElement || null;
    return Boolean(active && (active === this.textarea || this.overlay?.contains?.(active)));
  }

  onDocumentKeydown(event) {
    if (String(event?.key ?? "") !== "Escape") return;
    if (!this.state || this.state.finishing) return;
    this.escapeKeydownSeen = true;
    this.handleEscapeKey(event);
  }

  /** Last resort: the keydown was swallowed outright above us, so the keyup is the only evidence
   *  the user asked to escape. Same ownership rule, so a menu-closing Escape is still Roam's. */
  onDocumentKeyup(event) {
    if (String(event?.key ?? "") !== "Escape") return;
    if (this.escapeKeydownSeen) { this.escapeKeydownSeen = false; return; }
    if (!this.state || this.state.finishing) return;
    this.handleEscapeKey(event);
  }

  interceptPaste(event) {
    const textarea = this.textarea; if (!textarea || !this.state) return;
    let text = "";
    try { text = event.clipboardData?.getData?.("text/plain") ?? event.clipboardData?.getData?.("text") ?? ""; }
    catch (error) { noteNativeEditorError(error); text = ""; }
    if (!/[\r\n]/.test(String(text))) return;
    this.swallow(event);
    insertIntoNativeTextarea(textarea, sanitizeNativePasteText(text));
    this.state.lastValue = String(textarea.value ?? "");
  }

  onDocumentPointerDown(event) {
    if (!this.state || this.state.finishing) return;
    const target = event?.target;
    if (this.overlay?.contains?.(target)) return;
    if (target?.closest?.(".rm-autocomplete__results")) return;
    void this.commit(null);
  }

  /**
   * The caret can leave the cell without leaving the overlay: Roam renders the chained next-column
   * cells as this block's children (pinned fact 3) and they are hidden, not absent. A focus on a uid
   * this table already owns is that escape and commits. A focus on a uid the table has never seen is
   * the split remainder from pinned fact 6, which `repairStructure` merges back.
   */
  onOverlayFocusIn(event) {
    const state = this.state; if (!state || state.finishing) return;
    const focused = uidFromFocusTarget(event?.target);
    if (!focused || focused === state.uid) return;
    if (!this.view?.adapter?.baseCells?.has?.(focused)) return void this.scheduleStructureRepair({ commitWhenClean: true });
    void this.commit(null);
  }

  /** Checked a frame late: a blur is only a real departure once the browser has settled focus, and
   *  Roam blurs and refocuses its own textarea freely while it re-renders the block. */
  scheduleFocusEscapeCheck() {
    if (!this.state || this.state.finishing || this.focusCheckScheduled) return null;
    this.focusCheckScheduled = true;
    void this.nextFrame().then(() => {
      this.focusCheckScheduled = false;
      this.finishIfFocusLeft();
    });
    return true;
  }

  /**
   * FIX-E, the never-wedge floor. Focus can leave Roam's textarea for `<body>` with no menu open and
   * no click of ours to observe (Roam's own Escape handling does exactly that). Left alone the
   * overlay stays mounted over a cell nobody can type into, so the edit finishes here instead. Focus
   * that stays inside the overlay, inside Roam's menu, or anywhere in this grid belongs to the
   * pointerdown and focusin lanes, which already discriminate those.
   */
  finishIfFocusLeft() {
    const state = this.state;
    if (!state || state.finishing) return false;
    if (this.repairScheduled || this.repairRunning) return false;
    const active = globalThis.document?.activeElement || null;
    if (active && this.overlay?.contains?.(active)) return false;
    if (active?.closest?.(".rm-autocomplete__results")) return false;
    if (this.nativeAutocompletePortal()) return false;
    if (active && this.view?.root?.contains?.(active)) return false;

    if (this.seedThroughTextarea && state.startedAt != null && this.overlay?.isConnected) {
      const elapsed = this.now() - state.startedAt;
      if (elapsed < 1200 && !state.refocusAttempted) {
        state.refocusAttempted = true;
        const host = this.blockInput();
        if (host) {
          try { synthesizeBlockClick(host); } catch (error) { noteNativeEditorError(error); }
        }
        const textarea = this.hostTextarea();
        if (textarea) {
          this.textarea = textarea;
          const expected = state.lastValue;
          if (String(textarea.value ?? "") !== expected) {
            setNativeTextareaValue(textarea, expected);
            const Constructor = globalThis.InputEvent || globalThis.Event;
            if (typeof Constructor === "function") textarea.dispatchEvent?.(new Constructor("input", { bubbles: true }));
          }
        }
        return false;
      }
      if (elapsed < 1200) {
        const ta = this.textarea;
        const current = ta ? String(ta.value ?? "") : "";
        const persisted = nativeStoredRaw(current);
        if ((persisted === "" || persisted === " ") && state.lastValue !== "" && state.lastValue !== " ") {
          void this.cancel();
          return true;
        }
      }
    }

    // FIX-E4: an Escape was lent to Roam to close its `[[` menu, so this focus-leave is Roam blurring
    // its textarea as it dismisses that menu — the user is backing out, not committing. Committing
    // here persists the auto-paired text (e.g. `test [[]]`) before the pending second Escape can
    // cancel. `escapeDeferred` alone (FIX-E3) is not enough: Roam fires an `input` event while closing
    // the menu and the overlay's `input` listener clears `escapeDeferred` ~65ms before this floor runs
    // (proven by live trace). `lastEscapeLentAt` is NOT cleared by that `input` event, so a lent Escape
    // within ESCAPE_BLUR_WINDOW_MS of this blur still identifies the menu-close blur and flips to
    // cancel. Outside the window, and with no deferred loan, a genuine click-away still commits.
    const sinceEscapeLent = this.lastEscapeLentAt > 0 ? this.now() - this.lastEscapeLentAt : Infinity;
    if (this.escapeDeferred || sinceEscapeLent <= ESCAPE_BLUR_WINDOW_MS) {
      void this.cancel();
      return true;
    }
    void this.commit(null);
    return true;
  }

  scheduleStructureRepair({ commitWhenClean = false } = {}) {
    if (!this.state || this.state.finishing) return null;
    if (commitWhenClean) this.repairCommitWhenClean = true;
    if (this.repairScheduled) return true;
    this.repairScheduled = true;
    void this.nextFrame().then(() => {
      this.repairScheduled = false;
      const commitWhenNothingToRepair = this.repairCommitWhenClean === true;
      this.repairCommitWhenClean = false;
      return this.repairStructure({ commitWhenClean: commitWhenNothingToRepair });
    });
    return true;
  }

  async repairStructure({ commitWhenClean = false } = {}) {
    const state = this.state;
    if (!state || state.finishing) return null;
    const adapter = this.view?.adapter; const tableUid = this.view?.model?.tableUid;
    if (!adapter?.baseTree || !tableUid) return null;
    // The writes below blur and refocus Roam's textarea; without this the focus-leave floor would
    // read a mid-repair frame as the user walking away and commit on top of the repair.
    this.repairRunning = true;
    try { return await this.repairStructureOnce({ commitWhenClean, adapter, tableUid, state }); }
    finally { this.repairRunning = false; }
  }

  async repairStructureOnce({ commitWhenClean, adapter, tableUid, state }) {
    let tree = null;
    try { tree = getTree(tableUid); } catch (error) { noteNativeEditorError(error); return null; }
    if (!tree) return null;
    // NOT gated on `nativeStructureSignature`: that walks row roots and first-child column chains,
    // and the split remainder hangs off the cell as a SECOND child, so the signature of a damaged
    // table is identical to the signature of a healthy one. The novel-uid diff is the detector.
    const plan = nativeOverlayStrayRepair(adapter.baseTree, tree, state.uid);
    if (!plan) {
      if (commitWhenClean) await this.commit(null);
      return null;
    }
    if (plan.forceReload) {
      // The signature-based watch computes `structural === false` for this shape, so nothing else
      // can see the damage — force the structural-reload lane explicitly.
      try {
        const session = this.view.session;
        if (session?.handleExternalChange) {
          const externalModel = nativeTreeToModel(tree, adapter.metadataStore?.get?.(tableUid) || {});
          session.handleExternalChange(externalModel, { type: "structural", structural: true, changes: [], tree, conflict: true });
        }
      } catch (error) { noteNativeEditorError(error); }
      return plan;
    }
    const cellRaw = nativeStoredRaw(String(this.textarea?.value ?? state.lastValue ?? ""));
    const merged = `${cellRaw}${plan.strays.map((stray) => stray.text).join("")}`;
    const after = deepClone(tree);
    const parent = nativeTreeNode(after, plan.cellUid);
    const strayUids = new Set(plan.strays.map((stray) => stray.uid));
    if (parent) parent.children = (parent.children || []).filter((child) => !strayUids.has(child.uid));
    patchTreeCellRaw(after, plan.cellUid, merged);
    try {
      if (merged !== cellRaw) {
        adapter.recordSelfWrite?.(plan.cellUid, cellRaw, merged);
        try { await updateBlock(plan.cellUid, nativePersistedRaw(merged)); }
        catch (error) { adapter.consumeSelfWrite?.(plan.cellUid, cellRaw, merged); throw error; }
      }
      for (const stray of plan.strays) await deleteBlock(stray.uid);
      adapter.recordExpectedStructuralTransition?.(tree, after, [adapter.baseTree]);
    } catch (error) { noteNativeEditorError(error); return null; }
    // Roam may have re-rendered the block around the structural writes; the textarea this overlay
    // cached can be detached. Re-resolve it from the host before putting text and focus back.
    const resolved = this.hostTextarea();
    if (resolved) this.textarea = resolved;
    const textarea = this.textarea;
    if (textarea && this.state) {
      setNativeTextareaValue(textarea, merged);
      textarea.setSelectionRange?.(cellRaw.length, cellRaw.length);
      textarea.focus?.();
      this.state.lastValue = merged;
      this.mountTriggerContext = roamEditorTriggerContext(merged, cellRaw.length, { formula: false });
    }
    return plan;
  }

  /** Unmounts and unregisters everything. Writes nothing, ever. */
  /**
   * FIX-E write-behind, the cooperate half. Roam persists the mounted textarea's CONTENT on the
   * blur that `teardown()` triggers, and that flush lands after our own restore write — so racing it
   * loses. Instead we set the textarea to the value we want persisted BEFORE teardown, and Roam's
   * own flush then writes it for us. `input` is dispatched so Roam's React model updates, not just
   * the DOM node. The explicit `updateBlock` and `reconcileCancelWrite` remain as backstops.
   */
  settleTextareaValue(value) {
    const textarea = this.textarea;
    if (!textarea) return;
    setNativeTextareaValue(textarea, String(value ?? ""));
    const Constructor = globalThis.InputEvent || globalThis.Event;
    if (typeof Constructor === "function") textarea.dispatchEvent?.(new Constructor("input", { bubbles: true }));
  }

  teardown() {
    for (const dispose of this.mountDisposers.splice(0).reverse()) {
      try { dispose(); } catch (error) { noteNativeEditorError(error); }
    }
    for (const dispose of this.listenerDisposers.splice(0)) {
      try { dispose(); } catch (error) { noteNativeEditorError(error); }
    }
    for (const [id, resolve] of this.frames) {
      try { globalThis.cancelAnimationFrame?.(id); } catch (error) { noteNativeEditorError(error); }
      try { resolve(); } catch (error) { noteNativeEditorError(error); }
    }
    this.frames.clear();
    if (this.settleObserver) { try { this.settleObserver.disconnect(); } catch { /* already gone */ } this.settleObserver = null; }
    this.repairScheduled = false; this.repairCommitWhenClean = false; this.popupJustClosed = false;
    this.escapeDeferred = false; this.escapeKeydownSeen = false; this.focusCheckScheduled = false;
    this.lastEscapeLentAt = 0; // FIX-E4: commit/cancel/dispose all end any outstanding Escape loan.
    this.claimedUid = null; this.mountTriggerContext = null;
    this.state?.cell?.classList?.remove("rg-cell--editing", "rg-cell--native-editing");
    this.overlay?.remove?.();
    this.overlay = null; this.textarea = null; this.state = null;
  }

  /**
   * PINNED FACT 7: while typing in a native textarea Roam has NOT written `:block/string` yet, so
   * the live `textarea.value` is the only source of truth for what the user typed.
   */
  async commit(movement = null) {
    const state = this.state;
    if (!state || state.finishing) return null;
    state.finishing = true;
    // FIX-E5: committing a value ends this edit and supersedes any earlier cancel's reconcile poll.
    this.bumpReconcileEpoch();
    const { row, col, cell, uid } = state;
    const beforeRaw = this.beforeRaw;
    const live = this.textarea ? String(this.textarea.value ?? "") : null;
    // Commit flushes the same value Roam does (both persist the typed text), so the two writes
    // agree — except an empty cell, which we persist as " " to stop Roam collapsing the block while
    // Roam's own flush would write "". Settle the textarea to the persisted form so both match.
    if (live != null) this.settleTextareaValue(nativePersistedRaw(nativeStoredRaw(live)));
    this.teardown();
    // The write below is a round-trip; onFinish only refocuses after it. Without focus the moment
    // the textarea unmounts, a type→Enter→type loop drops the next characters onto <body>.
    try { this.view.root?.focus?.({ preventScroll: true }); claimKeyboard(this.view); }
    catch (error) { noteNativeEditorError(error); }
    let value = live;
    if (value == null) {
      try { value = pullNativeCell(uid)?.raw ?? beforeRaw; } catch (error) { noteNativeEditorError(error); value = beforeRaw; }
    }
    value = nativeStoredRaw(value);
    try {
      const current = pullNativeCell(uid);
      const currentRaw = current ? current.raw : beforeRaw;
      // `""` is stored as `" "` (nativePersistedRaw): both read back as raw `""`, so the write is
      // still needed to stop Roam collapsing the block, but it is not a self-write to absorb.
      if (currentRaw !== value) {
        this.view.adapter?.recordSelfWrite?.(uid, currentRaw, value);
        try { await updateBlock(uid, nativePersistedRaw(value)); }
        catch (error) { this.view.adapter?.consumeSelfWrite?.(uid, currentRaw, value); throw error; }
      } else if (value === "") await updateBlock(uid, nativePersistedRaw(value));
      this.view.adapter?.patchBaseContent?.([{ uid, raw: value }]);
    } catch (error) { noteNativeEditorError(error); }
    const modelCell = this.view.model?.getCell?.(row, col);
    if (modelCell && modelCell.uid === uid) modelCell.raw = value;
    try { await this.onFinish?.({ row, col, cell, raw: beforeRaw, value, commit: true, movement }); }
    catch (error) { noteNativeEditorError(error); }
    this.view.session?.endNativeOverlayEdit?.(uid, { beforeRaw, afterRaw: value, commit: true });
    return { uid, value, movement };
  }

  /** Byte-exact restore: whatever Roam flushed on blur is absorbed as a self-write, then the block
   *  is rewritten to the exact string it held before the overlay opened. */
  async cancel() {
    const state = this.state;
    if (!state || state.finishing) return null;
    state.finishing = true;
    // FIX-E5: bump BEFORE spawning this cancel's own reconcile poll so the poll captures the fresh
    // epoch; any later start/commit/cancel/dispose then bumps past it and aborts the stale poll,
    // while THIS cancel's poll still runs its full budget as long as nothing newer supersedes it.
    this.bumpReconcileEpoch();
    const { row, col, cell, uid } = state;
    const beforeRaw = this.beforeRaw;
    const flushed = nativeStoredRaw(this.textarea ? String(this.textarea.value ?? "") : state.lastValue);
    // Cooperate with Roam's blur-flush: put `beforeRaw` in the textarea BEFORE teardown so the flush
    // teardown triggers persists the cancelled-to value, not the typed one. Read `flushed` first.
    if (flushed !== beforeRaw) this.settleTextareaValue(beforeRaw);
    this.teardown();
    try {
      if (flushed !== beforeRaw) {
        this.view.adapter?.recordSelfWrite?.(uid, null, flushed);
        this.view.adapter?.recordSelfWrite?.(uid, flushed, beforeRaw);
      }
      await updateBlock(uid, nativePersistedRaw(beforeRaw));
      this.view.adapter?.patchBaseContent?.([{ uid, raw: beforeRaw }]);
    } catch (error) { noteNativeEditorError(error); }
    const modelCell = this.view.model?.getCell?.(row, col);
    if (modelCell && modelCell.uid === uid) modelCell.raw = beforeRaw;
    try { await this.onFinish?.({ row, col, cell, raw: beforeRaw, value: beforeRaw, commit: false, movement: null }); }
    catch (error) { noteNativeEditorError(error); }
    this.view.session?.endNativeOverlayEdit?.(uid, { beforeRaw, afterRaw: beforeRaw, commit: false });
    // Only a cancel that had something to undo can lose the write-behind race (PINNED FACT 7).
    if (flushed !== beforeRaw) await this.reconcileCancelWrite(uid, beforeRaw, { delayMs: this.reconcileDelayMs });
    return { uid, value: beforeRaw };
  }

  /** FIX-E5: the reconcile poll's inter-read wait. The timer id AND its resolver are tracked on the
   *  instance (mirroring the `frames` pattern) so a superseding start/commit/cancel/dispose can
   *  cancel the pending wait — `clearTimeout` stops the real timer and `resolve()` still wakes the
   *  awaiting loop, which then sees the bumped epoch (or `disposed`) and bails. Without waking it the
   *  awaited promise would leak; without clearing it a stray timer would outlive the edit. */
  reconcileDelay(delayMs) {
    return new Promise((resolve) => {
      const id = trackedTimeout(() => { this.reconcileTimers.delete(id); resolve(); }, delayMs);
      this.reconcileTimers.set(id, resolve);
    });
  }

  /** Cancels every pending reconcile timer and wakes its awaiting loop so nothing survives the edit. */
  cancelReconcileTimers() {
    for (const [id, resolve] of this.reconcileTimers) {
      try { clearTimeout(id); } catch (error) { noteNativeEditorError(error); }
      pendingTimers.delete(id);
      try { resolve(); } catch (error) { noteNativeEditorError(error); }
    }
    this.reconcileTimers.clear();
  }

  /** FIX-E5: mark that a new edit episode or terminal action has begun. A running reconcile poll,
   *  captured under the previous epoch, aborts before its next write; its pending timers are cancelled. */
  bumpReconcileEpoch() {
    this.reconcileEpoch += 1;
    this.cancelReconcileTimers();
  }

  /**
   * FIX-E write-behind BACKSTOP. `settleTextareaValue` already makes Roam's blur flush persist
   * `beforeRaw`, so this rarely fires — but if a flush still lands on `:block/string` AFTER the
   * restore write (its timing is hundreds of ms, not a few frames), the graph would hold the exact
   * value the user cancelled with nothing mounted to notice. Poll on a real cadence for up to
   * ~1.5s, re-applying `beforeRaw` on every divergence and recording the self-write so the adapter
   * absorbs the echo, and stop only once the value has stayed `beforeRaw` across two reads.
   *
   * FIX-E5: this poll belongs to ONE cancel episode. It captures its birth epoch; if a newer edit,
   * commit, cancel, or dispose bumps `reconcileEpoch` (or the overlay is disposed), it bails BEFORE
   * touching the graph. Otherwise a poll bound to the cancelled-to `beforeRaw` would, up to ~1.5s
   * later, silently revert whatever a subsequent edit committed to the same cell.
   */
  async reconcileCancelWrite(uid, beforeRaw, { attempts = 12, delayMs = 130 } = {}) {
    // Poll the WHOLE budget rather than stopping at the first stable read: Roam's flush timing is
    // not known, and a poll that quit early could return just before a late flush landed. Every
    // divergence in the window is re-applied, so the graph ends at `beforeRaw` regardless of when
    // the flush arrives inside it.
    const epoch = this.reconcileEpoch;
    let corrected = false;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await this.reconcileDelay(delayMs);
      // After the wait: a newer edit/action (or disposal) supersedes this poll — abort untouched.
      if (this.disposed || this.reconcileEpoch !== epoch) return corrected;
      let current = null;
      try { current = pullNativeCell(uid); }
      catch (error) { noteNativeEditorError(error); return corrected; }
      if (!current) { continue; }
      const raw = nativeStoredRaw(current.raw);
      if (raw === beforeRaw) { continue; }
      // Before the write: re-check, so a supersession that lands between the read and the write
      // (e.g. a fresh commit to this cell) is never overwritten with the stale `beforeRaw`.
      if (this.disposed || this.reconcileEpoch !== epoch) return corrected;
      try {
        this.view.adapter?.recordSelfWrite?.(uid, raw, beforeRaw);
        try { await updateBlock(uid, nativePersistedRaw(beforeRaw)); }
        catch (error) { this.view.adapter?.consumeSelfWrite?.(uid, raw, beforeRaw); throw error; }
        this.view.adapter?.patchBaseContent?.([{ uid, raw: beforeRaw }]);
        corrected = true;
      } catch (error) { noteNativeEditorError(error); return corrected; }
    }
    return corrected;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    // FIX-E5: disposal is terminal — abort any in-flight reconcile poll and drop its pending timers.
    this.bumpReconcileEpoch();
    const uid = this.state?.uid || null;
    this.teardown();
    if (uid) this.view?.session?.endNativeOverlayEdit?.(uid, { commit: false });
  }
}

export class GridEditorController {
  constructor(view, { cellAt, dimensions, mountedCells = null, cellRange = null, navigateReference = null, revealReference = null, searchReferences = searchRoamReferenceSuggestions, searchRecents = searchRoamRecentSuggestions, enrichSuggestions = enrichRoamSuggestions, referenceSearchDelay = null, onFinish, viewport }) {
    this.view = view;
    this.cellAt = cellAt;
    this.dimensions = dimensions;
    this.mountedCells = mountedCells || (() => view.cells?.values?.() || []);
    this.cellRange = cellRange || ((cell) => {
      const row = Number(cell.dataset.row); const col = Number(cell.dataset.col);
      return { startRow: row, endRow: row, startCol: col, endCol: col };
    });
    this.navigateReference = navigateReference || ((base, movement, dimensions) => moveFormulaReferenceCoordinate(base, movement, dimensions));
    this.revealReference = revealReference || ((row, col) => this.cellAt(row, col)?.scrollIntoView?.({ block: "nearest", inline: "nearest" }));
    this.onFinish = onFinish;
    this.viewport = viewport;
    this.searchReferences = searchReferences;
    this.searchRecents = searchRecents;
    this.enrichSuggestions = enrichSuggestions;
    this.referenceSearchDelay = referenceSearchDelay == null ? null : Math.max(0, Number(referenceSearchDelay) || 0);
    this.referenceSearchTimer = null;
    this.referenceSearchToken = 0;
    this.referenceContext = null;
    this.referenceContextKey = null;
    this.suggestionKind = null;
    this.state = null;
    this.referenceCells = new Map();
    this.frame = null;
    this.suggestions = [];
    this.suggestionIndex = 0;
    this.suggestionSignature = null;
    this.suggestionRenderToken = 0;
    this.renderedRowCache = new Map();
    this.pendingSuggestionRenders = [];
    this.popover = document.createElement("div");
    this.popover.className = "rg-formula-popover rg-editor-popover";
    this.popover.hidden = true;
    this.popover.setAttribute("aria-hidden", "true");
    this.address = document.createElement("span");
    this.address.className = "rg-formula-address";
    this.input = document.createElement("textarea");
    this.input.className = "rg-floating-editor-input";
    this.input.setAttribute("aria-label", "Edit cell value");
    this.mirror = document.createElement("code");
    this.mirror.className = "rg-formula-expression rg-formula-mirror";
    this.mirror.setAttribute("aria-hidden", "true");
    this.suggestionList = document.createElement("div");
    this.suggestionList.className = "rg-formula-suggestions rg-autocomplete-list";
    this.suggestionList.id = `rg-editor-list-${cryptoId()}`;
    this.suggestionList.setAttribute("role", "listbox");
    this.suggestionList.setAttribute("aria-label", "Cell editing suggestions");
    this.suggestionList.setAttribute("aria-hidden", "true");
    this.signature = document.createElement("div");
    this.signature.className = "rg-formula-signature";
    this.signature.setAttribute("role", "status");
    this.signature.setAttribute("aria-live", "polite");
    this.signature.setAttribute("aria-hidden", "true");
    this.pointHint = document.createElement("div");
    this.pointHint.className = "rg-formula-point-hint";
    this.pointHint.textContent = "Arrow keys pick a cell · Shift+Arrow makes a range · Enter finishes";
    this.pointHint.setAttribute("role", "status");
    this.pointHint.setAttribute("aria-hidden", "true");
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute("aria-controls", this.suggestionList.id);
    this.input.setAttribute("aria-expanded", "false");
    const body = document.createElement("div");
    body.className = "rg-editor-popover-body";
    body.append(this.input, this.mirror, this.suggestionList, this.pointHint, this.signature);
    this.popover.append(this.address, body);
    tagPortalOwner(this.popover, gridViewUid(this.view));
    document.body.appendChild(this.popover);
    this.portalTheme = createPortalThemeBridge(this.view.root, this.popover);
    this.boundReposition = () => this.position();
    globalThis.window?.addEventListener("resize", this.boundReposition);
    this.viewport?.addEventListener("scroll", this.boundReposition, { passive: true });
    for (const type of ["keyup", "keypress", "beforeinput", "input", "compositionstart", "compositionend"]) {
      this.input.addEventListener(type, (event) => event.stopPropagation());
    }
    this.input.addEventListener("compositionstart", () => { if (this.state) this.state.composing = true; });
    this.input.addEventListener("compositionend", () => { if (this.state) this.state.composing = false; this.schedulePresentation(); });
    this.input.addEventListener("input", () => { this.onEditorInput(); });
    this.input.addEventListener("click", () => this.onEditorSelection());
    this.input.addEventListener("select", () => this.onEditorSelection());
    this.input.addEventListener("keydown", (event) => this.onKeydown(event));
    this.input.addEventListener("keyup", (event) => this.onKeyup(event));
    this.input.addEventListener("blur", (event) => {
      if (!this.state || this.state.transitioning || this.popover.contains(event.relatedTarget)) return;
      this.finish(true);
    });
  }

  async start({ row, col, cell, raw, initial = null, floating = false, customEditor = null }) {
    if (this.state) await this.finish(false);
    const value = initial == null ? String(raw ?? "") : String(initial);
    const editor = floating ? this.input : customEditor || document.createElement("textarea");
    if (!floating) {
      editor.classList.add("rg-editor");
      cell.classList.add("rg-cell--editing");
      cell.appendChild(editor);
      for (const type of ["keyup", "keypress", "beforeinput", "input"]) editor.addEventListener(type, (event) => event.stopPropagation());
    }
    editor.value = value;
    this.state = { row, col, cell, raw: String(raw ?? ""), editor, floating, composing: false, autocompleteClosed: false, referenceAutocompleteClosed: false, keyboardReference: null, keyboardCursor: null, transitioning: false, finished: false };
    const formula = value.startsWith("=") && !value.startsWith("==");
    this.address.textContent = `${formula ? "fx  " : ""}${cellLabel(row, col)}`;
    this.setPopoverHidden(!floating && !formula);
    this.popover.classList.toggle("rg-editor-popover--floating", floating);
    this.input.hidden = !floating;
    editor.setAttribute("role", "combobox");
    editor.setAttribute("aria-autocomplete", "list");
    editor.setAttribute("aria-controls", this.suggestionList.id);
    editor.setAttribute("aria-expanded", "false");
    this.portalTheme?.sync();
    if (!floating) {
      editor.addEventListener("keydown", (event) => this.onKeydown(event));
      editor.addEventListener("keyup", (event) => this.onKeyup(event));
      editor.addEventListener("compositionstart", () => { if (this.state) this.state.composing = true; });
      editor.addEventListener("compositionend", () => { if (this.state) this.state.composing = false; this.schedulePresentation(); });
      editor.addEventListener("input", () => { this.onEditorInput(); });
      editor.addEventListener("click", () => this.onEditorSelection());
      editor.addEventListener("select", () => this.onEditorSelection());
      editor.addEventListener("blur", (event) => { if (!this.state?.transitioning && !this.popover.contains(event.relatedTarget)) this.finish(true); });
    }
    editor.focus({ preventScroll: true });
    if (typeof editor.setSelectionRange === "function") editor.setSelectionRange(value.length, value.length);
    else editor.select?.();
    this.schedulePresentation();
    return editor;
  }

  currentEditor() { return this.state?.editor || null; }

  setPopoverHidden(hidden) {
    this.popover.hidden = Boolean(hidden);
    this.popover.setAttribute("aria-hidden", String(Boolean(hidden)));
  }

  onEditorInput() {
    if (this.state) {
      this.state.autocompleteClosed = false;
      this.state.referenceAutocompleteClosed = false;
      this.state.keyboardReference = null;
      if (!this.state.editor.value.startsWith("=") || this.state.editor.value.startsWith("==")) this.state.keyboardCursor = null;
    }
    clearTimeout(this.referenceSearchTimer); this.referenceSearchTimer = null; this.referenceSearchToken += 1; this.referenceContextKey = null;
    this.schedulePresentation();
  }

  onEditorSelection() {
    const state = this.state; const active = state?.keyboardReference; const editor = state?.editor;
    if (state && active && editor) {
      const lower = Math.min(editor.selectionStart ?? 0, editor.selectionEnd ?? 0);
      const upper = Math.max(editor.selectionStart ?? 0, editor.selectionEnd ?? 0);
      const inside = lower >= active.startIndex && upper <= active.endIndex;
      if (!inside) { state.keyboardReference = null; state.keyboardCursor = null; }
    }
    this.schedulePresentation();
  }

  onKeydown(event) {
    event.stopPropagation();
    const state = this.state;
    if (!state || state.composing || event.isComposing) return;
    if (event.key === "F4") {
      const result = cycleFormulaReferenceLocks(state.editor.value, state.editor.selectionStart, state.editor.selectionEnd);
      if (result.changed) {
        event.preventDefault();
        state.editor.value = result.value;
        state.editor.setSelectionRange(result.selectionStart, result.selectionEnd);
        this.syncKeyboardReferenceToken();
        this.schedulePresentation();
      }
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && this.moveKeyboardReference(event.key, event.shiftKey)) {
      event.preventDefault();
      return;
    }
    // Ahead of the menu branches, and off inside a formula where `(` opens a call and `"` opens a
    // string literal — the same boundary the trigger-context formula guards draw.
    const formula = state.editor.value.startsWith("=") && !state.editor.value.startsWith("==");
    if (!formula && wrapSelectionOnPair(state.editor, event.key)) {
      event.preventDefault();
      this.schedulePresentation();
      return;
    }
    const hasSuggestions = !this.suggestionList.hidden && this.suggestions.length;
    if (hasSuggestions && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      this.suggestionIndex = (this.suggestionIndex + (event.key === "ArrowDown" ? 1 : -1) + this.suggestions.length) % this.suggestions.length;
      this.paintActiveSuggestion();
      return;
    }
    if (hasSuggestions && ["Enter", "Tab"].includes(event.key)) {
      event.preventDefault(); this.acceptSuggestion(this.suggestionIndex); return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (hasSuggestions) {
        if (this.suggestionKind === "roam-reference") state.referenceAutocompleteClosed = true;
        else state.autocompleteClosed = true;
        this.disposeSuggestionRows();
        this.suggestionList.hidden = true; this.suggestionList.setAttribute("aria-hidden", "true");
        state.editor.setAttribute("aria-expanded", "false"); state.editor.removeAttribute?.("aria-activedescendant");
        if (!state.floating && !(state.editor.value.startsWith("=") && !state.editor.value.startsWith("=="))) this.setPopoverHidden(true);
        return;
      }
      this.finish(false); return;
    }
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); this.finish(true, enterMovement()); return; }
    if (event.key === "Tab") { event.preventDefault(); this.finish(true, tabMovement(undefined, event.shiftKey)); }
  }

  /** The caret half of the presentation loop. `select` and `input` cover pointer selection and
   *  typing; a bare caret move fires neither, so the menu would otherwise outlive its own query. */
  onKeyup(event) {
    const state = this.state;
    if (!state || state.composing || event.isComposing) return;
    if (!CARET_MOVE_KEYS.has(event.key)) return;
    this.schedulePresentation();
  }

  acceptSuggestion(index) {
    if (this.suggestionKind === "roam-reference") return this.acceptReferenceSuggestion(index);
    const state = this.state; const suggestion = this.suggestions[index]; const context = this.autocompleteContext;
    if (!state || !suggestion || !context) return;
    const suffix = context.hasFollowingParenthesis ? "" : "(";
    state.editor.setRangeText(`${suggestion.name}${suffix}`, context.startIndex, context.endIndex, "end");
    if (context.hasFollowingParenthesis) {
      const caret = context.startIndex + suggestion.name.length + 1;
      state.editor.setSelectionRange(caret, caret);
    }
    state.autocompleteClosed = true;
    // Mirror acceptReferenceSuggestion: a menu left visible for even one frame lets a second accept
    // rewrite the text the first accept just committed (`=SUM(M(`).
    this.suggestions = []; this.autocompleteContext = null;
    this.disposeSuggestionRows(); this.suggestionList.hidden = true; this.suggestionList.setAttribute("aria-hidden", "true");
    state.editor.setAttribute("aria-expanded", "false"); state.editor.removeAttribute?.("aria-activedescendant");
    state.editor.focus({ preventScroll: true });
    this.schedulePresentation();
  }

  acceptReferenceSuggestion(index) {
    const state = this.state; const suggestion = this.suggestions[index]; const context = this.referenceContext;
    if (!state || !suggestion || !context) return;
    const page = suggestion.kind === "roam-page" || suggestion.kind === "roam-create-page";
    // A component and a command each carry their own caret offset, so the caret lands where the
    // argument is typed instead of past the closing braces — `"end"` would leave it after `}}` on
    // every entry. A command is the one insertion that can fail to resolve (a day row on a Roam
    // without `dateToPageTitle`); inserting nothing beats inserting a broken date.
    const placed = suggestion.kind === "roam-component" ? roamComponentInsertion(suggestion)
      : suggestion.kind === "roam-command" ? roamCommandInsertion(suggestion)
      : null;
    if (suggestion.kind === "roam-command" && !placed) return;
    const replacement = placed ? placed.text : roamTriggerInsertion(context.type, suggestion);
    if (page) rememberAcceptedPage(suggestion.name);
    state.editor.setRangeText(replacement, context.startIndex, context.replaceEndIndex ?? context.endIndex, "end");
    if (placed) { const caret = context.startIndex + placed.caret; state.editor.setSelectionRange(caret, caret); }
    // A command may exist precisely to hand over to another trigger — `Block Reference` inserts
    // `(())` and parks the caret inside it — so a command accept leaves the reference path OPEN and
    // the next paint opens the block or page picker on what it just wrote. Every other accept closes
    // it, because there the insertion is the whole answer.
    state.referenceAutocompleteClosed = suggestion.kind !== "roam-command";
    clearTimeout(this.referenceSearchTimer); this.referenceSearchToken += 1;
    this.suggestions = []; this.disposeSuggestionRows(); this.suggestionList.hidden = true; this.suggestionList.setAttribute("aria-hidden", "true");
    state.editor.setAttribute("aria-expanded", "false"); state.editor.removeAttribute?.("aria-activedescendant");
    state.editor.focus({ preventScroll: true });
    this.schedulePresentation();
  }

  insertReference(row, col, event) {
    const state = this.state; const editor = state?.editor;
    if (!state || state.finished || !editor.value.startsWith("=") || editor.value.startsWith("==")) return false;
    event.preventDefault(); event.stopPropagation();
    const start = editor.selectionStart ?? editor.value.length; const end = editor.selectionEnd ?? start;
    const prefix = editor.value.slice(0, start);
    const reference = `${event.shiftKey && /\$?[A-Z]+\$?\d+$/i.test(prefix) ? ":" : ""}${cellLabel(row, col)}`;
    editor.setRangeText(reference, start, end, "end");
    state.keyboardCursor = { row, col };
    this.activateKeyboardReferenceAtCaret({ row, col });
    editor.focus({ preventScroll: true });
    this.schedulePresentation();
    return true;
  }

  promoteToFloating() {
    const state = this.state;
    if (!state || state.floating) return state?.editor || null;
    const inlineEditor = state.editor;
    const value = inlineEditor.value;
    const selectionStart = inlineEditor.selectionStart ?? value.length;
    const selectionEnd = inlineEditor.selectionEnd ?? selectionStart;
    state.transitioning = true;
    state.floating = true;
    state.editor = this.input;
    this.input.value = value;
    this.input.hidden = false;
    this.popover.classList.add("rg-editor-popover--floating");
    this.setPopoverHidden(false);
    this.portalTheme.sync();
    this.input.focus({ preventScroll: true });
    this.input.setSelectionRange(selectionStart, selectionEnd);
    inlineEditor.remove();
    state.cell.classList.remove("rg-cell--editing");
    state.transitioning = false;
    this.position();
    return this.input;
  }

  referenceTokenAtCaret() {
    const state = this.state; const editor = state?.editor;
    if (!state || !editor) return null;
    const caret = editor.selectionStart ?? editor.value.length;
    return formulaReferences(editor.value).find((token) => caret >= token.startIndex && caret <= token.endIndex) || null;
  }

  activateKeyboardReferenceAtCaret(fallback = null) {
    const state = this.state; const token = this.referenceTokenAtCaret();
    if (!state || !token) return null;
    const current = fallback || { row: token.endRef.row, col: token.endRef.col };
    state.keyboardReference = {
      startIndex: token.startIndex,
      endIndex: token.endIndex,
      anchor: { row: token.startRef.row, col: token.startRef.col },
      current: { row: current.row, col: current.col },
    };
    state.keyboardCursor = { row: current.row, col: current.col };
    return { active: state.keyboardReference, token };
  }

  syncKeyboardReferenceToken() {
    const state = this.state; const active = state?.keyboardReference;
    if (!state || !active) return null;
    const editor = state.editor; const caret = editor.selectionStart ?? active.endIndex;
    const token = formulaReferences(editor.value).find((item) =>
      (caret >= item.startIndex && caret <= item.endIndex)
      || (item.startIndex <= active.startIndex && item.endIndex >= active.startIndex));
    if (!token) { state.keyboardReference = null; return null; }
    active.startIndex = token.startIndex; active.endIndex = token.endIndex;
    return { active, token };
  }

  moveKeyboardReference(key, extend = false) {
    const state = this.state; const editor = state?.editor;
    if (!state || !editor || !editor.value.startsWith("=") || editor.value.startsWith("==")) return false;
    const activeToken = this.syncKeyboardReferenceToken();
    const caret = editor.selectionStart ?? editor.value.length;
    if (!activeToken && !formulaCanPointReference(editor.value, caret)) return false;
    const movement = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[key];
    if (!movement) return false;

    const pointEditor = this.promoteToFloating();
    const synced = this.syncKeyboardReferenceToken() || activeToken;
    const active = synced?.active || null;
    const token = synced?.token || null;
    const dimensions = this.dimensions();
    const base = active?.current || state.keyboardCursor || { row: state.row, col: state.col };
    const destination = this.navigateReference(base, movement, dimensions) || base;
    const row = clamp(destination.row, 0, Math.max(0, dimensions.rowCount - 1));
    const col = clamp(destination.col, 0, Math.max(0, dimensions.colCount - 1));

    const startIndex = active?.startIndex ?? pointEditor.selectionStart ?? pointEditor.value.length;
    const endIndex = active?.endIndex ?? pointEditor.selectionEnd ?? startIndex;
    const anchor = extend && active ? active.anchor : { row, col };
    const startTemplate = token?.startText || "";
    const endTemplate = token?.endText || startTemplate;
    const reference = extend && active
      ? `${formatCoordinateLike(anchor.row, anchor.col, startTemplate)}:${formatCoordinateLike(row, col, endTemplate)}`
      : formatCoordinateLike(row, col, startTemplate);
    pointEditor.setRangeText(reference, startIndex, endIndex, "end");
    state.keyboardReference = { startIndex, endIndex: startIndex + reference.length, anchor, current: { row, col } };
    state.keyboardCursor = { row, col };
    state.autocompleteClosed = true;
    state.referenceAutocompleteClosed = true;
    pointEditor.focus({ preventScroll: true });
    try { this.revealReference(row, col); } catch { /* reference remains valid even when a virtual view is between paints */ }
    this.schedulePresentation();
    return true;
  }

  schedulePresentation() {
    const schedule = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
    if (this.frame != null) return;
    this.frame = schedule(() => { this.frame = null; this.updatePresentation(); });
  }

  updatePresentation() {
    const state = this.state;
    if (!state) return this.clearPresentation();
    const editor = state.editor; const raw = editor.value;
    const formula = raw.startsWith("=") && !raw.startsWith("==");
    const referenceContext = roamEditorTriggerContext(raw, editor.selectionStart, { formula });
    this.view.root.classList.toggle("rg-root--formula-editing", formula);
    const mode = referenceContext ? "reference" : formula ? "formula" : "plain";
    this.popover.dataset.mode = mode;
    this.popover.classList.toggle("rg-editor-popover--formula", formula);
    this.popover.classList.toggle("rg-editor-popover--reference", Boolean(referenceContext));
    this.popover.classList.toggle("rg-editor-popover--plain", !formula && !referenceContext);
    const pointReady = Boolean(formula && (state.keyboardReference || formulaCanPointReference(raw, editor.selectionStart)));
    this.view.root.classList.toggle("rg-root--formula-pointing", pointReady);
    this.pointHint.hidden = !pointReady;
    this.pointHint.setAttribute("aria-hidden", String(!pointReady));
    this.address.textContent = `${formula ? "fx  " : ""}${cellLabel(state.row, state.col)}`;
    this.mirror.hidden = !formula;
    this.mirror.setAttribute("aria-hidden", String(!formula));
    const colors = formulaReferenceColorMap(raw);
    if (formula) appendFormulaMirror(this.mirror, raw, colors); else this.mirror.replaceChildren();
    const desired = new Map();
    if (formula) {
      const references = formulaReferences(raw);
      for (const cell of this.mountedCells()) {
        const mountedRange = this.cellRange(cell);
        const reference = references.find((item) => rangesOverlap(item.range, mountedRange));
        if (!reference) continue;
        const key = reference.text.toUpperCase(); desired.set(cell, { key, color: colors.get(key) });
      }
    }
    for (const [cell] of this.referenceCells) if (!desired.has(cell)) {
      cell.classList.remove("rg-cell--formula-reference"); cell.style.removeProperty("--rg-reference-color"); delete cell.dataset.rgFormulaReference;
    }
    for (const [cell, value] of desired) {
      if (this.referenceCells.get(cell)?.key === value.key) continue;
      cell.classList.add("rg-cell--formula-reference"); cell.style.setProperty("--rg-reference-color", value.color); cell.dataset.rgFormulaReference = value.key;
    }
    this.referenceCells = desired;
    if (referenceContext) this.updateReferenceAutocomplete(referenceContext);
    else { this.clearReferenceAutocomplete(); this.updateAutocomplete(formula); }
    this.updateSignature(formula);
    this.syncPopoverVisibility();
    this.position();
  }

  /**
   * The single place popover visibility is decided. The invariant it enforces: the popover is
   * visible only when the suggestion list is showing rows, or the editor is floating, or the cell
   * holds a formula. That is what keeps a bare opener from painting an empty shell while its query
   * is in flight, and what keeps an Escape-dismissed list from reopening on the next paint.
   */
  syncPopoverVisibility() {
    const state = this.state;
    if (!state) return;
    const raw = state.editor.value;
    const formula = raw.startsWith("=") && !raw.startsWith("==");
    const showingRows = Boolean(this.suggestions.length) && !this.suggestionList.hidden;
    this.setPopoverHidden(!state.floating && !formula && !showingRows);
  }

  updateAutocomplete(formula) {
    const state = this.state; const editor = state?.editor;
    const context = formula ? formulaAutocompleteContext(editor.value, editor.selectionStart) : null;
    this.autocompleteContext = context;
    const catalog = runtime.registries?.formulaFunctionMetadata || defaultFormulaFunctionMetadata();
    this.suggestions = context && autocompleteEnabled() && !state.autocompleteClosed ? rankFormulaFunctions(context.query, catalog, getSetting("editing-autocomplete-limit")) : [];
    this.suggestionKind = this.suggestions.length ? "formula" : null;
    this.suggestionIndex = clamp(this.suggestionIndex, 0, Math.max(0, this.suggestions.length - 1));
    this.renderSuggestionRows();
  }

  updateReferenceAutocomplete(context) {
    const state = this.state; if (!state) return;
    // Ahead of the context key so a switch flipped mid-edit is honoured on the very next keystroke
    // instead of being short-circuited by the unchanged-context guard below.
    if (!autocompleteEnabled()) { this.clearReferenceAutocomplete(); return; }
    const key = `${context.type}:${context.startIndex}:${context.endIndex}:${context.query}`;
    if (this.referenceContextKey === key && (this.referenceSearchTimer != null || this.suggestionKind === "roam-reference")) return;
    clearTimeout(this.referenceSearchTimer); const token = ++this.referenceSearchToken;
    this.referenceContext = context; this.referenceContextKey = key; this.autocompleteContext = null;
    // `{{` and `/` are both answered from a static catalog, so they resolve right here — no debounce
    // to wait out, no token to fence and no Roam read to budget. Folded into the same assignment as
    // the clear so a catalog context paints its rows once rather than blanking and refilling them.
    // Each switch is read ahead of its own catalog, under the master switch already checked above.
    const catalog = state.referenceAutocompleteClosed ? []
      : context.type === "component" && componentSuggestionsEnabled() ? roamComponentSuggestions(context.query)
      : context.type === "command" && commandSuggestionsEnabled() ? roamCommandSuggestions(context.query)
      : [];
    this.suggestions = catalog; this.suggestionKind = "roam-reference"; this.suggestionIndex = 0; this.renderSuggestionRows();
    // Neither catalog trigger searches Roam, so both stop here. Rendering nothing when a catalog is
    // switched off is the never-empty popover invariant doing its job rather than a special case.
    if (!SUGGESTIBLE_EDITOR_TRIGGERS.has(context.type)) return;
    if (state.referenceAutocompleteClosed) return;
    // A bare opener takes the recents path instead of the search path. Its own switch and the
    // budget gate are read here, ahead of the timer, so an off switch issues no query at all
    // rather than issuing one and discarding its results. The gate yields to a fresh cache:
    // disarmed or not, rows already paid for open the menu without a new query.
    const bare = !context.query.trim();
    if (bare && (!emptyOpenerEnabled() || (recentsDisabled() && !recentsCacheReady(context.type)))) return;
    this.referenceSearchTimer = setTimeout(async () => {
      this.referenceSearchTimer = null;
      let results = [];
      try { results = bare ? await this.searchRecents(context, { excludeUids: this.currentTableUids() }) : await this.searchReferences(context); }
      catch (error) { console.warn("[roam-grid] Reference search failed", error); }
      if (token !== this.referenceSearchToken || !this.state || this.referenceContextKey !== key) return;
      this.suggestions = withCreatePageSuggestion(context, results); this.suggestionKind = "roam-reference"; this.suggestionIndex = 0; this.renderSuggestionRows();
      this.syncPopoverVisibility();
      this.position();
      this.enrichReferenceSuggestions(token, key);
    }, this.searchDelay(context));
  }

  /**
   * One batched enrichment query per settled result set. It runs AFTER the rows are on screen and
   * paints onto them rather than through `renderSuggestionRows`, because a rebuild would drop every
   * node identity U1 pins and re-mount every rendered host U6 bounded — for what is decoration on a
   * result set that did not change.
   *
   * The identity check on `this.suggestions` is the fence: the search token and context key catch a
   * newer query, and comparing the array itself catches a set replaced by any other path while the
   * enrichment was in flight.
   */
  async enrichReferenceSuggestions(token, key) {
    const rows = this.suggestions;
    if (!rows.length) return;
    let enriched = rows;
    try { enriched = await this.enrichSuggestions(rows); }
    catch (error) { console.warn("[roam-grid] Suggestion enrichment failed", error); return; }
    if (token !== this.referenceSearchToken || !this.state || this.referenceContextKey !== key || this.suggestions !== rows) return;
    this.suggestions = enriched;
    this.paintSuggestionEnrichment();
  }

  paintSuggestionEnrichment() {
    const rows = this.suggestionList.children;
    for (let index = 0; index < rows.length && index < this.suggestions.length; index += 1) applySuggestionEnrichment(rows[index], this.suggestions[index]);
  }

  /** The cells of the table being edited, so the recents path can drop them. Every cell edit touches
   *  a block, so an unfiltered recent-blocks list inside a grid is mostly that grid’s own rows. A
   *  large grid has no `model` — its cells are JSON rows with no uid — and correctly contributes none. */
  currentTableUids() {
    const rows = this.view?.model?.rows;
    if (!Array.isArray(rows)) return null;
    const uids = new Set();
    for (const row of rows) for (const cell of row) if (cell?.uid) uids.add(cell.uid);
    return uids;
  }

  /** A cache-resolvable bare opener answers without touching Roam, so it skips the debounce it has
   *  nothing to debounce. Otherwise an explicit constructor delay wins, and the setting is read live
   *  so no open controller has to be rebuilt when the user changes it. */
  searchDelay(context = null) {
    if (context && !String(context.query || "").trim() && recentsCacheReady(context.type)) return 0;
    return this.referenceSearchDelay ?? Math.max(0, Number(getSetting("editing-autocomplete-debounce-ms")) || 0);
  }

  clearReferenceAutocomplete() {
    clearTimeout(this.referenceSearchTimer); this.referenceSearchTimer = null; this.referenceSearchToken += 1;
    this.referenceContext = null; this.referenceContextKey = null;
    if (this.suggestionKind === "roam-reference") {
      this.suggestions = []; this.suggestionKind = null; this.renderSuggestionRows();
    }
  }

  /** Rebuilds the rows, but only when the result set itself changed. Moving the active index is
   *  NOT a result-set change, so arrow keys reach paintActiveSuggestion and every row node survives. */
  renderSuggestionRows() {
    this.suggestionList.hidden = !this.suggestions.length;
    this.suggestionList.setAttribute("aria-hidden", String(!this.suggestions.length));
    this.currentEditor()?.setAttribute?.("aria-expanded", String(Boolean(this.suggestions.length)));
    // The alias-target flag leads the signature because it changes what every row's detail says while
    // leaving the rows themselves identical — without it, moving into `](` beside the same query would
    // keep the old label.
    const aliasTarget = this.suggestionKind === "roam-reference" && this.referenceContext?.aliasTarget === true;
    const signature = `${aliasTarget ? "alias|" : ""}${this.suggestions.map((suggestion) => `${suggestion.kind}:${suggestion.uid || suggestion.name}`).join("|")}`;
    if (signature === this.suggestionSignature) return this.paintActiveSuggestion();
    this.disposeSuggestionRows({ retain: true });
    this.suggestionSignature = signature;
    // B2 and the availability half of the permanent fallback. Only `roam-block` rows carry markdown
    // worth rendering; a page title, tag, create-page row or function name is already its own label,
    // so a typical `[[` menu issues ZERO renders.
    const rendering = suggestionRenderingEnabled() && typeof globalThis.window?.roamAlphaAPI?.ui?.components?.renderString === "function";
    const jobs = []; let rendered = 0;
    this.suggestions.forEach((suggestion, index) => {
      const option = document.createElement("button"); option.type = "button"; option.className = "rg-formula-suggestion rg-autocomplete-row";
      option.id = `${this.suggestionList.id}-option-${index}`;
      option.setAttribute("role", "option");
      const name = document.createElement("strong"); name.className = "rg-autocomplete-primary";
      // Block content genuinely IS Roam markdown, so it normalizes. A page title, a tag, a
      // create-page name and a function name are names: their literal characters are part of what
      // the row inserts, and a label that disagrees with the insertion is a defect, not a tidy-up.
      const text = document.createElement("span"); text.className = "rg-suggestion-text";
      text.textContent = suggestion.kind === "roam-block" ? roamSuggestionPlainText(suggestion.name) : String(suggestion.name ?? "");
      name.appendChild(text);
      const detail = document.createElement("span"); detail.className = "rg-suggestion-detail";
      detail.textContent = aliasTarget ? `${suggestion.description} · alias target` : suggestion.description;
      option.append(name, detail);
      applySuggestionEnrichment(option, suggestion);
      option.addEventListener("pointerdown", (event) => event.preventDefault());
      // Hover moves the real active index, not just a CSS state, or Enter accepts a different row
      // than the one under the pointer. A repaint, never a rebuild — a rebuild here would drop the
      // row the pointer is sitting on, on every mouse move.
      option.addEventListener("mouseenter", () => { this.suggestionIndex = index; this.paintActiveSuggestion(); });
      option.addEventListener("click", () => this.acceptSuggestion(index));
      this.suggestionList.appendChild(option);
      // B3 skips a block whose text holds no markup at all, and B4 stops at six — the height of the
      // list, so everything past it is below the fold anyway.
      if (!rendering || suggestion.kind !== "roam-block" || !requiresRoamRichRender(suggestion.name) || rendered >= MAX_RENDERED_SUGGESTION_ROWS) return;
      rendered += 1;
      name.dataset.rgSuggestionKey = `${suggestion.kind}:${suggestion.uid || ""}:${suggestion.name}`;
      if (this.reuseRenderedRow(name)) return;
      jobs.push({ host: name, raw: String(suggestion.name) });
    });
    this.paintActiveSuggestion();
    if (jobs.length) this.renderSuggestionRowBatch(jobs);
  }

  /** B6. A host this controller already mounted, parked when its row left the list; backspacing to a
   *  previous query re-attaches it instead of paying for the mount again. */
  reuseRenderedRow(container) {
    const key = container.dataset.rgSuggestionKey;
    const host = this.renderedRowCache.get(key);
    if (!host) return false;
    this.renderedRowCache.delete(key);
    if (host.__rgDisposed) return false;
    container.dataset.rgRenderToken = String(this.suggestionRenderToken);
    container.__rgRichHosts ||= new Set();
    container.__rgRichHosts.add(host);
    container.replaceChildren(host);
    host.hidden = false;
    return true;
  }

  /** B5. One microtask per row with a token check between them, so a newer result set aborts the rest
   *  of the batch mid-flight instead of mounting rows nobody will see. The same token discipline the
   *  rich-cell path uses per host, one step coarser: here the token also fences the queue itself. */
  renderSuggestionRowBatch(jobs) {
    const token = this.suggestionRenderToken;
    this.pendingSuggestionRenders = jobs;
    const clock = () => globalThis.performance?.now?.() ?? Date.now();
    const started = clock();
    const queue = globalThis.queueMicrotask || ((callback) => Promise.resolve().then(callback));
    const step = () => {
      if (token !== this.suggestionRenderToken) return;
      const job = jobs.shift();
      if (!job) return noteSuggestionRenderBatch(clock() - started);
      job.host.dataset.rgRenderToken = String(token);
      paintRichCellContent(job.host, job.raw, String(token), roamSuggestionPlainText(job.raw));
      queue(step);
    };
    queue(step);
  }

  paintActiveSuggestion() {
    const rows = this.suggestionList.children;
    for (let index = 0; index < rows.length; index += 1) {
      const option = rows[index];
      const active = index === this.suggestionIndex;
      option.setAttribute("aria-selected", String(active));
      option.classList.toggle("rg-formula-suggestion--active", active);
      if (active) option.scrollIntoView?.({ block: "nearest" });
    }
    const editor = this.currentEditor();
    if (!editor) return;
    if (this.suggestions.length) editor.setAttribute("aria-activedescendant", `${this.suggestionList.id}-option-${this.suggestionIndex}`);
    else editor.removeAttribute?.("aria-activedescendant");
  }

  /**
   * B7. Teardown seam for what the rows own beyond their own nodes: every Roam-rendered host unmounts
   * through the same path a cell uses, because a leaked React root is worse than raw markdown.
   * Dropping the cached signature is what keeps the next render from mistaking an emptied list for an
   * up-to-date one; bumping the render token is what aborts any batch still in flight.
   *
   * `retain` is the rebuild path and nothing else. A row leaving the list parks its finished host in
   * the LRU rather than unmounting it, which is what makes B6 reuse possible; a host still mid-render
   * is unmounted outright, because there is nothing to reuse and its own token check would only
   * unmount it later. Every real teardown — accept, Escape, finish, dispose — leaves `retain` off and
   * takes the cache down with the rows.
   */
  disposeSuggestionRows({ retain = false } = {}) {
    this.suggestionSignature = null;
    this.suggestionRenderToken += 1;
    for (const option of [...this.suggestionList.children]) {
      for (const container of [...option.children]) {
        for (const host of [...(container.__rgRichHosts || [])]) {
          if (retain && !host.__rgDisposed && host.dataset?.rgRichActive === "true") this.parkRenderedRow(container, host);
          else disposeRichHost(container, host);
        }
      }
    }
    this.suggestionList.replaceChildren();
    if (retain) return;
    for (const host of this.renderedRowCache.values()) disposeRichHost(null, host);
    this.renderedRowCache.clear();
  }

  parkRenderedRow(container, host) {
    const key = container.dataset.rgSuggestionKey;
    container.__rgRichHosts?.delete(host);
    host.remove();
    if (!key) return disposeRichHost(null, host);
    this.renderedRowCache.delete(key);
    this.renderedRowCache.set(key, host);
    while (this.renderedRowCache.size > RENDERED_SUGGESTION_CACHE) {
      const oldest = this.renderedRowCache.keys().next().value;
      disposeRichHost(null, this.renderedRowCache.get(oldest));
      this.renderedRowCache.delete(oldest);
    }
  }

  updateSignature(formula) {
    const state = this.state; const editor = state?.editor;
    const call = formula ? activeFormulaCall(editor.value, editor.selectionStart) : null;
    const catalog = runtime.registries?.formulaFunctionMetadata || defaultFormulaFunctionMetadata();
    const metadata = call ? catalog.get(call.name) : null;
    this.signature.replaceChildren(); this.signature.hidden = !metadata; this.signature.setAttribute("aria-hidden", String(!metadata));
    if (!metadata) return;
    const lead = document.createElement("strong"); lead.textContent = `${call.name}(`; this.signature.appendChild(lead);
    metadata.parameters.forEach((parameter, index) => {
      if (index) this.signature.append(document.createTextNode(", "));
      const item = document.createElement("span"); item.textContent = parameter; item.classList.toggle("rg-formula-argument--active", index === call.argumentIndex); this.signature.appendChild(item);
    });
    this.signature.append(document.createTextNode(")"));
    if (metadata.description) { const description = document.createElement("small"); description.textContent = metadata.description; this.signature.appendChild(description); }
  }

  position() {
    const state = this.state; if (!state || this.popover.hidden || !this.popover.isConnected) return;
    const cell = this.cellAt(state.row, state.col) || state.cell; if (!cell?.isConnected) return;
    state.cell = cell;
    const rect = cell.getBoundingClientRect(); const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth || 1200;
    const width = clamp(Math.max(rect.width, 360), 280, Math.min(680, viewportWidth - 16));
    this.popover.style.width = `${width}px`;
    const height = this.popover.getBoundingClientRect().height;
    this.popover.style.left = `${clamp(rect.left, 8, Math.max(8, viewportWidth - width - 8))}px`;
    this.popover.style.top = `${rect.top - height - 7 >= 8 ? rect.top - height - 7 : rect.bottom + 7}px`;
  }

  async finish(commit, movement = null) {
    const state = this.state; if (!state || state.finished) return;
    state.finished = true; this.state = null;
    const value = state.editor.value;
    if (!state.floating) { state.editor.remove(); state.cell.classList.remove("rg-cell--editing"); }
    this.setPopoverHidden(true); this.clearPresentation();
    await this.onFinish({ ...state, value, commit, movement });
  }

  clearPresentation() {
    this.view.root.classList.remove("rg-root--formula-editing");
    this.view.root.classList.remove("rg-root--formula-pointing");
    for (const [cell] of this.referenceCells) {
      cell.classList.remove("rg-cell--formula-reference"); cell.style.removeProperty("--rg-reference-color"); delete cell.dataset.rgFormulaReference;
    }
    clearTimeout(this.referenceSearchTimer); this.referenceSearchTimer = null; this.referenceSearchToken += 1; this.referenceContext = null; this.referenceContextKey = null;
    this.referenceCells.clear(); this.suggestions = []; this.suggestionKind = null; this.disposeSuggestionRows(); this.suggestionList.hidden = true; this.suggestionList.setAttribute("aria-hidden", "true");
    this.input.setAttribute("aria-expanded", "false"); this.input.removeAttribute?.("aria-activedescendant");
    this.currentEditor()?.setAttribute?.("aria-expanded", "false"); this.currentEditor()?.removeAttribute?.("aria-activedescendant");
    this.signature.replaceChildren(); this.signature.hidden = true; this.signature.setAttribute("aria-hidden", "true");
    this.pointHint.hidden = true; this.pointHint.setAttribute("aria-hidden", "true");
  }

  dispose() {
    if (this.state) {
      const state = this.state; state.finished = true; this.state = null;
      if (!state.floating) { state.editor.remove(); state.cell.classList.remove("rg-cell--editing"); }
    }
    globalThis.window?.removeEventListener("resize", this.boundReposition);
    this.viewport?.removeEventListener("scroll", this.boundReposition);
    this.portalTheme?.dispose(); this.portalTheme = null;
    this.clearPresentation(); this.disposeSuggestionRows(); this.popover.remove();
  }
}

export class GridView {
  constructor({ host, model, adapter, nativeElement = null, session = null, context = "source", surface = "main" }) {
    this.host = host;
    this.session = session;
    this.model = session?.model || model;
    this.adapter = session?.adapter || adapter;
    this.nativeElement = nativeElement;
    this.context = context;
    this.surface = surface;
    this.selection = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    this.anchor = { row: 0, col: 0 };
    this.root = document.createElement("section");
    this.root.className = "rg-root";
    this.root.classList.toggle("rg-root--reference", context === "reference");
    this.root.dataset.rgContext = context;
    this.root.dataset.rgSurface = surface;
    this.root.tabIndex = 0;
    this.cells = new Map();
    this.disposed = false;
    this.cellCoordinatesByUid = new Map();
    this.dragSelecting = false;
    this.fillStart = null;
    this.rowResizePreview = null;
    this.columnResizePreview = null;
    this.resizeCleanup = null;
    this.editorController = null;
    this.nativeOverlay = null;
    this.referenceCounts = session?.referenceCounts || new Map();
    this.commentThreads = session?.commentThreads || new Map();
    this.commentArmed = false;
    this.commentAddButton = null;
    this.boundCommentPointerOver = null;
    this.inlineReferencesUid = null;
    this.inlineReferencesMode = null;
    this.inlineReferencesPanel = null;
    this.inlineReferenceDisposers = new Set();
    this.inlineCommentComposerDisposer = null;
    this.selectedCellElements = new Set();
    this.activeCellElement = null;
    this.selectionControls = new Set();
    this.boundPaste = (event) => this.onPaste(event);
    this.boundKeydown = (event) => this.onKeydown(event);
    this.root.__rgView = this;
    this.boundPointerUp = () => this.finishPointerAction();
    const themeSignature = gridThemeSignature(this.nativeElement);
    const cachedTheme = runtime.gridThemeSignature === themeSignature ? (this.session?.themePalette || runtime.gridThemePalette) : null;
    if (cachedTheme) {
      applyGridThemeValues(this.root, cachedTheme);
      if (this.session) this.session.themePalette = cachedTheme;
    }
    else {
      const initialTheme = syncGridThemeFromHost(this.nativeElement, this.root);
      runtime.gridThemePalette = initialTheme.values;
      runtime.gridThemeSignature = themeSignature;
      if (this.session) this.session.themePalette = initialTheme.values;
    }
    this.themeBridge = createGridThemeBridge(this.nativeElement, this.root, {
      initialSync: false,
      onSync: (result) => {
        runtime.gridThemePalette = result.values;
        runtime.gridThemeSignature = gridThemeSignature(this.nativeElement);
        if (this.session) this.session.themePalette = result.values;
      },
    });
    this.session?.addView(this);
    this.mount();
  }

  mount() {
    if (this.nativeElement) this.nativeElement.classList.add("rg-native-hidden");
    applyToolbarPreset(this.root); applyGridMaxWidth(this.root);
    this.host.appendChild(this.root);
    this.root.addEventListener("paste", this.boundPaste);
    document.addEventListener("pointerup", this.boundPointerUp, true);
    this.render();
    this.syncCommentAffordance();
  }

  toolbar() {
    const toolbar = document.createElement("div"); toolbar.className = "rg-toolbar";
    toolbar.append(
      button("↶", "Undo (⌘Z)", () => this.undo(), "rg-toolbar-primary"),
      button("↷", "Redo (⌘⇧Z)", () => this.redo(), "rg-toolbar-primary"),
      button("Merge", "Merge selected cells (⌘⇧M)", () => this.mergeSelection(), "rg-toolbar-secondary"),
      button("Unmerge", "Unmerge selected region", () => this.unmergeSelection(), "rg-toolbar-secondary"),
      button("＋ Row", "Insert a row below", () => this.insertRow(), "rg-toolbar-secondary"),
      button("＋ Col", "Insert a column right", () => this.insertCol(), "rg-toolbar-secondary"),
      button("Chart", "Create a chart from this selection", () => this.insertChart(), "rg-toolbar-secondary"),
      button("Export", "Export this grid", () => exportCommand(this.model), "rg-toolbar-secondary")
    );
    if (this.context === "reference") toolbar.appendChild(button("↗ Source", "Open the source table block", () => this.openSource(), "rg-source-button rg-toolbar-primary"));
    toolbar.appendChild(button("⋯", "More grid actions", (event) => this.openMenu(event.currentTarget), "rg-toolbar-primary"));
    const status = document.createElement("span"); status.className = "rg-status"; status.textContent = `${this.model.rowCount} × ${this.model.colCount}`; status.setAttribute("aria-label", `Roam Grid v${VERSION} · ${this.model.rowCount} × ${this.model.colCount}`); status.title = `Roam Grid v${VERSION}`;
    this.statusElement = status;
    toolbar.appendChild(status);
    return toolbar;
  }

  render() {
    this.editorController?.dispose();
    this.editorController = null;
    // A mid-edit re-render must COMMIT the live overlay, not dispose it: disposal writes nothing
    // and Roam has not flushed the textarea yet (pinned fact 7), so the typed text exists nowhere
    // else. commit() reads the textarea synchronously, before the DOM swap below. dispose() stays
    // reserved for GridView.dispose.
    if (this.nativeOverlay?.active) void this.nativeOverlay.commit(null);
    else this.nativeOverlay?.dispose();
    this.nativeOverlay = null;
    this.clearSelectionPresentation();
    if (!this.toolbarElement) { this.toolbarElement = this.toolbar(); this.root.appendChild(this.toolbarElement); }
    else {
      this.statusElement.textContent = `${this.model.rowCount} × ${this.model.colCount}`;
      this.statusElement.setAttribute("aria-label", `Roam Grid v${VERSION} · ${this.model.rowCount} × ${this.model.colCount}`);
    }
    const viewport = this.viewport || (() => {
      const element = document.createElement("div"); element.className = "rg-viewport"; this.root.appendChild(element); this.viewport = element; return element;
    })();
    const grid = document.createElement("div"); grid.className = "rg-grid";
    this.gridElement = grid;
    const offset = this.headersOn() ? 1 : 0;
    grid.classList.toggle("rg-grid--clean", !this.headersOn());
    this.applyGridTemplateColumns(grid);
    this.applyGridTemplateRows(grid);
    if (this.headersOn()) {
      const corner = document.createElement("div"); corner.className = "rg-corner rg-header"; corner.style.gridArea = "1 / 1";
      grid.appendChild(corner);
      this.model.columnIds.forEach((id, col) => grid.appendChild(this.columnHeader(id, col)));
    }
    this.cells.clear();
    this.cellCoordinatesByUid.clear();
    this.formulaEngine = new FormulaEngine(this.model, runtime.registries.formulaFunctions, runtime.registries.formulaFunctionMetadata);
    const engine = this.formulaEngine;
    for (let row = 0; row < this.model.rowCount; row += 1) {
      if (this.headersOn()) grid.appendChild(this.rowHeader(row));
      for (let col = 0; col < this.model.colCount; col += 1) {
        if (this.model.isCovered(row, col)) continue;
        const merge = this.model.mergeAt(row, col);
        const cell = this.cellElement(row, col, merge, engine, offset);
        grid.appendChild(cell);
        this.cells.set(`${row}:${col}`, cell);
        this.cellCoordinatesByUid.set(this.model.getCell(row, col).uid, { row, col });
      }
      grid.appendChild(this.rowResizeHandle(row, offset));
    }
    this.model.columnIds.forEach((id, col) => grid.appendChild(this.columnResizeHandle(id, col, offset)));
    replaceGridViewportContents(viewport, grid);
    this.editorController = new GridEditorController(this, {
      viewport,
      dimensions: () => ({ rowCount: this.model.rowCount, colCount: this.model.colCount }),
      cellAt: (row, col) => {
        const merge = this.model.mergeAt(row, col);
        return this.cells.get(`${merge?.row ?? row}:${merge?.col ?? col}`) || null;
      },
      mountedCells: () => this.cells.values(),
      cellRange: (cell) => {
        const row = Number(cell.dataset.row); const col = Number(cell.dataset.col); const merge = this.model.mergeAt(row, col);
        return { startRow: row, endRow: row + (merge?.rowSpan || 1) - 1, startCol: col, endCol: col + (merge?.colSpan || 1) - 1 };
      },
      navigateReference: (base, movement, dimensions) => moveFormulaReferenceCoordinate(base, movement, dimensions, (row, col) => this.model.mergeAt(row, col)),
      revealReference: (row, col) => this.cells.get(`${row}:${col}`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" }),
      onFinish: async ({ row, col, cell, raw, value, commit, movement }) => {
        if (commit && value !== this.model.getRaw(row, col)) this.commitMutation("Edit cell", () => this.model.setRaw(row, col, value), false);
        else this.renderCellValue(cell, row, col);
        if (movement) this.moveSelection(...movement);
        this.root.focus({ preventScroll: true }); claimKeyboard(this);
        this.session?.editorFinished(this);
      },
    });
    // The overlay reuses the controller's own finish closure — it renders the cell, moves the
    // selection and re-claims the keyboard, which is exactly what a finished native edit needs too.
    this.nativeOverlay = new NativeCellEditorOverlay(this, { onFinish: (result) => this.editorController?.onFinish?.(result) });
    this.chartsElement?.remove(); this.chartsElement = null;
    if (this.model.charts.length) {
      const charts = document.createElement("div"); charts.className = "rg-charts";
      for (const spec of this.model.charts) {
        const chart = document.createElement("article"); chart.className = "rg-chart-card"; chart.innerHTML = renderChartSvg(this.model, spec);
        const remove = button("×", "Remove chart", () => this.commitMutation("Remove chart", () => { this.model.charts = this.model.charts.filter((item) => item.id !== spec.id); }, true));
        chart.appendChild(remove); charts.appendChild(chart);
      }
      this.root.appendChild(charts); this.chartsElement = charts;
    }
    this.updateSelection();
    this.session?.scheduleReferenceCountRefresh();
  }

  rowDeletionLayoutFingerprint() {
    return JSON.stringify({
      columnIds: this.model.columnIds,
      widths: this.model.widths,
      headerColumns: this.model.headerColumns,
      frozenCols: this.model.frozenCols,
      // The effective value, not the stored one: the axis gutters are the layout this fingerprint
      // guards, and the global mask can change them without the model moving.
      showHeaders: this.headersOn(),
      fitToWidth: this.model.fitToWidth,
      colorFormulaCells: this.model.colorFormulaCells,
      charts: this.model.charts,
    });
  }

  captureRowDeletionContext() {
    const uidAt = (row, col) => this.model.getCell(row, col)?.uid || null;
    const dependencyUids = new Map();
    const uidForFormulaKey = (key) => {
      const [row, col] = String(key).split(":").map(Number);
      return uidAt(row, col);
    };
    for (const [sourceKey, dependentKeys] of this.formulaEngine?.reverseDependencies || []) {
      const sourceUid = uidForFormulaKey(sourceKey);
      if (!sourceUid) continue;
      const dependentUids = new Set([...dependentKeys].map(uidForFormulaKey).filter(Boolean));
      if (dependentUids.size) dependencyUids.set(sourceUid, dependentUids);
    }
    const volatileFormulaUids = new Set(
      [...(this.formulaEngine?.dependencyCache?.volatileFormulas || [])].map(uidForFormulaKey).filter(Boolean)
    );
    return {
      viewport: this.viewport,
      gridElement: this.gridElement,
      scrollLeft: this.viewport?.scrollLeft || 0,
      scrollTop: this.viewport?.scrollTop || 0,
      rowUids: this.model.rows.map((row) => row.map((cell) => cell.uid)),
      rawByUid: new Map(this.model.rows.flat().map((cell) => [cell.uid, cell.raw])),
      layoutFingerprint: this.rowDeletionLayoutFingerprint(),
      dependencyUids,
      volatileFormulaUids,
      selection: deepClone(this.selection),
      anchor: { ...this.anchor },
      selectionUids: {
        start: uidAt(this.selection.startRow, this.selection.startCol),
        end: uidAt(this.selection.endRow, this.selection.endCol),
        anchor: uidAt(this.anchor.row, this.anchor.col),
      },
    };
  }

  positionCellElement(cell, row, col, offset = this.headersOn() ? 1 : 0) {
    const merge = this.model.mergeAt(row, col);
    cell.dataset.uid = this.model.getCell(row, col).uid;
    cell.dataset.row = String(row);
    cell.dataset.col = String(col);
    cell.classList.toggle("rg-cell--merged", Boolean(merge));
    cell.classList.toggle("rg-cell--header", this.model.isHeaderRow(row) || this.model.isHeaderColumn(col));
    cell.classList.remove("rg-cell--align-left", "rg-cell--align-center", "rg-cell--align-right");
    const alignment = this.model.getAlignment(row, col);
    if (alignment) cell.classList.add(`rg-cell--align-${alignment}`);
    cell.style.gridRow = `${row + 1 + offset} / span ${merge?.rowSpan || 1}`;
    cell.style.gridColumn = `${col + 1 + offset} / span ${merge?.colSpan || 1}`;
  }

  hasCustomCellRenderers() { return Boolean(runtime.registries?.cellRenderers?.size); }

  patchRowDeletion(context) {
    if (!context || context.viewport !== this.viewport || context.gridElement !== this.gridElement || !this.viewport || !this.gridElement) return false;
    if (this.editorController?.state || this.nativeOverlay?.active || this.resizeCleanup || this.rowResizePreview || this.columnResizePreview || this.dragSelecting || this.fillStart) return false;
    if (this.hasCustomCellRenderers()) return false;
    if (this.model.charts.length || context.layoutFingerprint !== this.rowDeletionLayoutFingerprint()) return false;
    const beforeRows = context.rowUids;
    const afterRows = this.model.rows.map((row) => row.map((cell) => cell.uid));
    if (beforeRows.length <= afterRows.length || !afterRows.length) return false;
    if (beforeRows.some((row) => row.length !== this.model.colCount) || afterRows.some((row) => row.length !== this.model.colCount)) return false;

    const beforeIndexes = new Map();
    for (let row = 0; row < beforeRows.length; row += 1) {
      const rowUid = beforeRows[row][0];
      if (!rowUid || beforeIndexes.has(rowUid)) return false;
      beforeIndexes.set(rowUid, row);
    }
    const survivingIndexes = [];
    let previousIndex = -1;
    for (const row of afterRows) {
      const beforeIndex = beforeIndexes.get(row[0]);
      if (!Number.isInteger(beforeIndex) || beforeIndex <= previousIndex) return false;
      if (row.some((uid, col) => uid !== beforeRows[beforeIndex][col])) return false;
      survivingIndexes.push(beforeIndex);
      previousIndex = beforeIndex;
    }
    const survivingSet = new Set(survivingIndexes);
    const removedIndexes = beforeRows.map((_, row) => row).filter((row) => !survivingSet.has(row));
    if (removedIndexes.length !== beforeRows.length - afterRows.length) return false;
    if (removedIndexes.some((row, index) => index && row !== removedIndexes[index - 1] + 1)) return false;

    const changedUids = new Set(this.model.lastChangedCellUids || []);
    const afterCoordinatesByUid = new Map();
    for (let row = 0; row < this.model.rowCount; row += 1) for (let col = 0; col < this.model.colCount; col += 1) {
      const cell = this.model.getCell(row, col);
      const previousRaw = context.rawByUid.get(cell.uid);
      if (previousRaw == null) return false;
      if (cell.raw !== previousRaw && (!changedUids.has(cell.uid) || !cell.raw.startsWith("="))) return false;
      afterCoordinatesByUid.set(cell.uid, { row, col });
    }
    if ([...changedUids].some((uid) => !afterCoordinatesByUid.has(uid))) return false;

    const existingCellsByUid = new Map();
    for (const cell of this.cells.values()) {
      const uid = cell.dataset.uid;
      if (!uid || existingCellsByUid.has(uid) || !this.gridElement.contains(cell)) return false;
      existingCellsByUid.set(uid, cell);
    }
    const anchors = [];
    for (let row = 0; row < this.model.rowCount; row += 1) for (let col = 0; col < this.model.colCount; col += 1) {
      if (this.model.isCovered(row, col)) continue;
      const uid = this.model.getCell(row, col).uid;
      const cell = existingCellsByUid.get(uid);
      if (!cell) return false;
      anchors.push({ uid, row, col, cell });
    }

    const rowHeaders = new Map();
    for (const header of this.gridElement.querySelectorAll(".rg-row-header")) {
      if (!header.dataset.rowUid || rowHeaders.has(header.dataset.rowUid)) return false;
      rowHeaders.set(header.dataset.rowUid, header);
    }
    const rowResizes = new Map();
    for (const resize of this.gridElement.querySelectorAll(".rg-row-resize")) {
      if (!resize.dataset.rowUid || rowResizes.has(resize.dataset.rowUid)) return false;
      rowResizes.set(resize.dataset.rowUid, resize);
    }
    for (let row = 0; row < this.model.rowCount; row += 1) {
      const rowUid = this.model.rowKey(row);
      if ((this.headersOn() && !rowHeaders.has(rowUid)) || !rowResizes.has(rowUid)) return false;
    }

    const activeElement = globalThis.document?.activeElement;
    const anchorUids = new Set(anchors.map(({ uid }) => uid));
    for (const [uid, cell] of existingCellsByUid) {
      if (anchorUids.has(uid)) continue;
      releaseRichCellHosts(cell);
      cell.remove();
    }
    const survivingRowUids = new Set(afterRows.map((row) => row[0]));
    for (const [uid, header] of rowHeaders) if (!survivingRowUids.has(uid)) header.remove();
    for (const [uid, resize] of rowResizes) if (!survivingRowUids.has(uid)) resize.remove();

    const nextCells = new Map();
    this.cellCoordinatesByUid.clear();
    for (const { uid, row, col, cell } of anchors) {
      this.positionCellElement(cell, row, col);
      nextCells.set(`${row}:${col}`, cell);
      this.cellCoordinatesByUid.set(uid, { row, col });
    }
    this.cells = nextCells;
    for (let row = 0; row < this.model.rowCount; row += 1) {
      const rowUid = this.model.rowKey(row);
      const header = rowHeaders.get(rowUid);
      if (header) {
        header.dataset.row = String(row);
        header.textContent = String(row + 1);
        header.style.gridArea = `${row + 2} / 1`;
      }
      const resize = rowResizes.get(rowUid);
      resize.dataset.row = String(row);
      resize.style.gridRow = String(row + 1 + (this.headersOn() ? 1 : 0));
    }
    this.applyGridTemplateRows(this.gridElement);
    this.statusElement.textContent = `${this.model.rowCount} × ${this.model.colCount}`;
    this.statusElement.setAttribute("aria-label", `Roam Grid v${VERSION} · ${this.model.rowCount} × ${this.model.colCount}`);

    const affectedUids = new Set([...changedUids, ...context.volatileFormulaUids]);
    const queue = [...affectedUids];
    for (let index = 0; index < queue.length; index += 1) {
      for (const dependentUid of context.dependencyUids.get(queue[index]) || []) {
        if (affectedUids.has(dependentUid)) continue;
        affectedUids.add(dependentUid);
        queue.push(dependentUid);
      }
    }
    const engine = new FormulaEngine(
      this.model,
      runtime.registries?.formulaFunctions || defaultFormulaFunctions(),
      runtime.registries?.formulaFunctionMetadata || defaultFormulaFunctionMetadata()
    );
    for (const [sourceUid, dependentUids] of context.dependencyUids) {
      const source = afterCoordinatesByUid.get(sourceUid);
      if (!source) continue;
      const sourceKey = `${source.row}:${source.col}`;
      for (const dependentUid of dependentUids) {
        if (changedUids.has(dependentUid)) continue;
        const dependent = afterCoordinatesByUid.get(dependentUid);
        if (dependent) engine.dependencyCache.register(`${dependent.row}:${dependent.col}`, sourceKey);
      }
    }
    for (const uid of context.volatileFormulaUids) {
      const coordinate = afterCoordinatesByUid.get(uid);
      if (coordinate) engine.dependencyCache.volatileFormulas.add(`${coordinate.row}:${coordinate.col}`);
    }
    this.formulaEngine = engine;
    for (const uid of affectedUids) {
      const coordinate = afterCoordinatesByUid.get(uid);
      if (!coordinate || this.model.isCovered(coordinate.row, coordinate.col)) continue;
      const raw = this.model.getRaw(coordinate.row, coordinate.col);
      if (!raw.startsWith("=") || raw.startsWith("==")) continue;
      const cell = nextCells.get(`${coordinate.row}:${coordinate.col}`);
      const content = cell?.querySelector?.(":scope > .rg-cell-content") || cell?.querySelectorAll?.(".rg-cell-content")?.[0];
      const value = engine.evaluateCell(coordinate.row, coordinate.col);
      if (changedUids.has(uid) || content?.dataset.rgRenderKey !== `text:${String(value ?? "")}`) this.renderCellValue(cell, coordinate.row, coordinate.col, engine);
    }

    const resolveCoordinate = (uid, fallback) => {
      const coordinate = uid ? afterCoordinatesByUid.get(uid) : null;
      return coordinate || {
        row: clamp(fallback.row, 0, this.model.rowCount - 1),
        col: clamp(fallback.col, 0, this.model.colCount - 1),
      };
    };
    const start = resolveCoordinate(context.selectionUids.start, { row: context.selection.startRow, col: context.selection.startCol });
    const end = resolveCoordinate(context.selectionUids.end, { row: context.selection.endRow, col: context.selection.endCol });
    this.selection = normalizeRange({ startRow: start.row, endRow: end.row, startCol: start.col, endCol: end.col });
    this.anchor = resolveCoordinate(context.selectionUids.anchor, context.anchor);
    this.updateSelection();
    this.viewport.scrollLeft = context.scrollLeft;
    this.viewport.scrollTop = context.scrollTop;
    if (activeElement && !activeElement.isConnected) { this.root.focus?.({ preventScroll: true }); claimKeyboard(this); }
    return true;
  }

  columnHeader(id, col) {
    const header = document.createElement("div"); header.className = "rg-header rg-col-header"; header.style.gridArea = `1 / ${col + 2}`; header.dataset.col = String(col); header.draggable = true;
    const label = document.createElement("span"); label.textContent = columnLabel(col); header.appendChild(label);
    const resize = document.createElement("span"); resize.className = "rg-col-resize"; resize.title = "Drag to resize"; header.appendChild(resize);
    header.addEventListener("click", () => this.select({ startRow: 0, endRow: this.model.rowCount - 1, startCol: col, endCol: col }));
    header.addEventListener("dragstart", (event) => event.dataTransfer.setData("application/x-roam-grid-col", String(col)));
    header.addEventListener("dragover", (event) => event.preventDefault());
    header.addEventListener("drop", (event) => { const from = Number(event.dataTransfer.getData("application/x-roam-grid-col")); if (Number.isInteger(from)) this.commitMutation("Reorder column", () => this.model.reorderCols(from, col), true); });
    resize.addEventListener("pointerdown", (event) => this.startColumnResize(id, event));
    resize.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); this.commitMutation("Auto-fit column", () => { delete this.model.widths[id]; }, true); });
    return header;
  }

  applyGridTemplateColumns(grid = this.gridElement) {
    if (!grid) return;
    const previewing = Boolean(this.columnResizePreview);
    grid.style.width = this.model.fitToWidth && !previewing ? "100%" : "max-content";
    const tracks = gridTrackTemplate(this.model, "col", 0, this.model.columnIds.length - 1, { fit: this.model.fitToWidth && !previewing, widths: this.columnResizePreview?.widths || null });
    grid.style.gridTemplateColumns = `${this.headersOn() ? "42px " : ""}${tracks}`;
  }

  applyGridTemplateRows(grid = this.gridElement) {
    if (!grid) return;
    const tracks = gridTrackTemplate(this.model, "row", 0, this.model.rowCount - 1, { heights: this.rowResizePreview });
    grid.style.gridTemplateRows = `${this.headersOn() ? "28px " : ""}${tracks}`;
  }

  startColumnResize(id, event) {
    event.preventDefault(); event.stopPropagation(); this.resizeCleanup?.();
    const pointerTarget = event.currentTarget; const dragCell = pointerTarget?.closest?.(".rg-cell");
    if (dragCell) dragCell.draggable = false;
    pointerTarget?.setPointerCapture?.(event.pointerId);
    this.root.classList.add("rg-root--resizing");
    const offset = this.headersOn() ? 1 : 0;
    const resolvedTracks = getComputedStyle(this.gridElement).gridTemplateColumns.split(/\s+/);
    const baseWidths = Object.fromEntries(this.model.columnIds.map((columnId, col) => [columnId, Number.parseFloat(resolvedTracks[col + offset]) || this.model.widths[columnId] || getSetting("sizing-default-col-width")]));
    const startX = event.clientX; const startWidth = baseWidths[id]; let moved = false;
    const move = (moveEvent) => {
      const requested = clamp(Math.round(startWidth + moveEvent.clientX - startX), getSetting("sizing-min-col-width"), getSetting("sizing-max-col-width"));
      moved ||= requested !== startWidth;
      const widths = this.model.fitToWidth ? fittedTrackResize(baseWidths, id, requested) : { ...baseWidths, [id]: requested };
      this.columnResizePreview = { id, widths };
      this.applyGridTemplateColumns();
    };
    const up = () => {
      const widths = this.columnResizePreview?.widths || baseWidths;
      const baseTotal = Object.values(baseWidths).reduce((sum, width) => sum + width, 0);
      const previewTotal = Object.values(widths).reduce((sum, width) => sum + width, 0);
      cleanup(); this.columnResizePreview = null;
      if (!moved) return;
      this.commitMutation("Resize column", () => {
        if (this.model.fitToWidth) {
          for (const columnId of this.model.columnIds) this.model.widths[columnId] = Math.round(widths[columnId]);
          if (previewTotal > baseTotal + 0.5) this.model.fitToWidth = false;
        }
        else this.model.widths[id] = Math.round(widths[id]);
      }, true);
    };
    const cleanup = () => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      try { pointerTarget?.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
      if (dragCell) dragCell.draggable = true;
      this.root.classList.remove("rg-root--resizing"); this.resizeCleanup = null;
    };
    this.resizeCleanup = cleanup; document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }

  rowHeader(row) {
    const header = document.createElement("div"); header.className = "rg-header rg-row-header"; header.style.gridArea = `${row + 2} / 1`; header.textContent = String(row + 1); header.dataset.row = String(row); header.dataset.rowUid = this.model.rowKey(row); header.draggable = true;
    header.addEventListener("click", () => { const current = Number(header.dataset.row); this.select({ startRow: current, endRow: current, startCol: 0, endCol: this.model.colCount - 1 }); });
    header.addEventListener("dragstart", (event) => event.dataTransfer.setData("application/x-roam-grid-row", header.dataset.row));
    header.addEventListener("dragover", (event) => event.preventDefault());
    header.addEventListener("drop", (event) => { const from = Number(event.dataTransfer.getData("application/x-roam-grid-row")); const current = Number(header.dataset.row); if (Number.isInteger(from)) this.commitMutation("Reorder row", () => this.model.reorderRows(from, current), true); });
    return header;
  }

  rowResizeHandle(row, offset) {
    const resize = document.createElement("span"); resize.className = "rg-row-resize"; resize.dataset.row = String(row); resize.dataset.rowUid = this.model.rowKey(row);
    resize.style.gridRow = String(row + 1 + offset); resize.style.gridColumn = "1 / -1";
    resize.title = "Drag to resize row · double-click to auto-fit";
    resize.addEventListener("pointerdown", (event) => this.startRowResize(Number(resize.dataset.row), event));
    resize.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); this.commitMutation("Auto-fit row", () => this.model.setRowHeight(Number(resize.dataset.row), null), true); });
    return resize;
  }

  columnResizeHandle(id, col, offset) {
    const resize = document.createElement("span"); resize.className = "rg-column-resize-track"; resize.dataset.col = String(col);
    resize.style.gridRow = `${1 + offset} / -1`; resize.style.gridColumn = String(col + 1 + offset);
    resize.title = `Drag any ${columnLabel(col)} column edge to resize · double-click to auto-fit`;
    resize.addEventListener("pointerdown", (event) => this.startColumnResize(id, event));
    resize.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); this.commitMutation("Auto-fit column", () => { delete this.model.widths[id]; }, true); });
    return resize;
  }

  startRowResize(row, event) {
    event.preventDefault(); event.stopPropagation(); this.resizeCleanup?.();
    const pointerTarget = event.currentTarget; const dragCell = pointerTarget?.closest?.(".rg-cell");
    if (dragCell) dragCell.draggable = false;
    pointerTarget?.setPointerCapture?.(event.pointerId);
    this.root.classList.add("rg-root--resizing");
    const offset = this.headersOn() ? 1 : 0;
    const resolvedTracks = getComputedStyle(this.gridElement).gridTemplateRows.split(/\s+/);
    const startHeight = Number.parseFloat(resolvedTracks[row + offset]) || this.model.getRowHeight(row) || getSetting("sizing-default-row-height");
    const startY = event.clientY; let moved = false;
    const move = (moveEvent) => {
      moved = true;
      this.rowResizePreview = { row, height: clamp(Math.round(startHeight + moveEvent.clientY - startY), getSetting("sizing-min-row-height"), getSetting("sizing-max-row-height")) };
      this.applyGridTemplateRows();
    };
    const up = () => {
      const height = this.rowResizePreview?.height ?? startHeight;
      cleanup(); this.rowResizePreview = null;
      if (!moved) return;
      this.commitMutation("Resize row", () => this.model.setRowHeight(row, height), true);
    };
    const cleanup = () => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      try { pointerTarget?.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
      if (dragCell) dragCell.draggable = true;
      this.root.classList.remove("rg-root--resizing"); this.resizeCleanup = null;
    };
    this.resizeCleanup = cleanup; document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }

  cellElement(row, col, merge, engine, offset = this.headersOn() ? 1 : 0) {
    const cell = document.createElement("div");
    cell.className = "rg-cell"; cell.dataset.row = String(row); cell.dataset.col = String(col); cell.dataset.uid = this.model.getCell(row, col).uid; cell.tabIndex = -1;
    cell.classList.toggle("rg-cell--merged", Boolean(merge));
    cell.classList.toggle("rg-cell--header", this.model.isHeaderRow(row) || this.model.isHeaderColumn(col));
    const alignment = this.model.getAlignment(row, col);
    if (alignment) cell.classList.add(`rg-cell--align-${alignment}`);
    cell.style.gridRow = `${row + 1 + offset} / span ${merge?.rowSpan || 1}`; cell.style.gridColumn = `${col + 1 + offset} / span ${merge?.colSpan || 1}`;
    this.renderCellValue(cell, row, col, engine);
    cell.addEventListener("pointerdown", (event) => {
      const currentRow = Number(cell.dataset.row); const currentCol = Number(cell.dataset.col); const currentMerge = this.model.mergeAt(currentRow, currentCol);
      if (event.button !== 0) return;
      if (event.target.closest?.(".rg-editor")) return;
      if (this.insertFormulaReference(currentRow, currentCol, event)) return;
      const rect = cell.getBoundingClientRect();
      const nearRightEdge = event.clientX >= rect.right - 12 && event.clientX <= rect.right + 1;
      const nearBottomEdge = event.clientY >= rect.bottom - 10 && event.clientY <= rect.bottom + 1;
      if (nearRightEdge && !nearBottomEdge) {
        const edgeCol = currentCol + (currentMerge?.colSpan || 1) - 1;
        this.startColumnResize(this.model.columnIds[edgeCol], event); return;
      }
      if (nearBottomEdge) {
        const edgeRow = currentRow + (currentMerge?.rowSpan || 1) - 1;
        this.startRowResize(edgeRow, event); return;
      }
      // Arm the image click BEFORE the selection changes: an image click opens the lightbox only on
      // the SECOND click, when this cell was already the sole-selected one (LP-2 confirms our
      // pointerdown preventDefault below already suppresses Roam's own image zoom).
      this.armImageClick(currentRow, currentCol, event);
      if (event.shiftKey) this.extendSelection(currentRow, currentCol); else { this.anchor = { row: currentRow, col: currentCol }; this.select({ startRow: currentRow, endRow: currentRow, startCol: currentCol, endCol: currentCol }); }
      this.dragSelecting = true; this.root.focus({ preventScroll: true }); claimKeyboard(this); event.preventDefault();
    });
    cell.addEventListener("pointerenter", () => { const currentRow = Number(cell.dataset.row); const currentCol = Number(cell.dataset.col); if (this.dragSelecting) { this.extendSelection(currentRow, currentCol); this.imageClickDragged = true; } if (this.fillStart) this.fillTarget = { row: currentRow, col: currentCol }; });
    cell.addEventListener("click", (event) => this.handleCellImageClick(cell, event));
    cell.addEventListener("dblclick", () => this.beginEdit(Number(cell.dataset.row), Number(cell.dataset.col)));
    cell.addEventListener("contextmenu", (event) => { const currentRow = Number(cell.dataset.row); const currentCol = Number(cell.dataset.col); event.preventDefault(); if (!rangeContains(this.selection, currentRow, currentCol)) this.select({ startRow: currentRow, endRow: currentRow, startCol: currentCol, endCol: currentCol }); this.openMenu(cell, event.clientX, event.clientY); });
    cell.draggable = true;
    cell.addEventListener("dragstart", (event) => { const currentRow = Number(cell.dataset.row); const currentCol = Number(cell.dataset.col); if (!rangeContains(this.selection, currentRow, currentCol)) this.select({ startRow: currentRow, endRow: currentRow, startCol: currentCol, endCol: currentCol }); event.dataTransfer.setData("application/x-roam-grid-range", JSON.stringify(this.selection)); });
    cell.addEventListener("dragover", (event) => this.handleCellDragOver(cell, event));
    cell.addEventListener("dragleave", (event) => this.handleCellDragLeave(cell, event));
    cell.addEventListener("drop", (event) => this.handleCellDrop(cell, event));
    return cell;
  }

  renderCellValue(cell, row, col, engine = this.formulaEngine || new FormulaEngine(this.model, runtime.registries.formulaFunctions, runtime.registries.formulaFunctionMetadata)) {
    const raw = this.model.getRaw(row, col); const value = engine.evaluateCell(row, col);
    const formula = raw.startsWith("=") && !raw.startsWith("==");
    const content = ensureCellContent(cell);
    cell.dataset.rgRaw = raw;
    cell.classList.toggle("rg-cell--formula", formula && formulaTintEnabled(this.model.colorFormulaCells));
    cell.classList.toggle("rg-cell--error", formula && String(value).startsWith("#"));
    cell.title = formula ? raw : "";
    for (const [name, renderer] of runtime.registries.cellRenderers) {
      try {
        if (renderer.match?.({ raw, value, row, col, model: this.model })) {
          const renderKey = JSON.stringify(["custom", name, raw, String(value ?? "")]);
          if (content.dataset.rgRenderKey === renderKey) return;
          content.dataset.rgRenderKey = renderKey;
          content.dataset.rgRenderToken = cryptoId();
          const rendered = renderer.render({ raw, value, row, col, model: this.model });
          clearRichCellHosts(content);
          if (rendered instanceof Node) content.replaceChildren(rendered); else content.innerHTML = String(rendered ?? "");
          this.updateCellReferenceCount(cell, this.model.getCell(row, col)?.uid);
          return;
        }
      } catch (error) { console.warn("[roam-grid] Cell renderer failed", error); }
    }
    renderStableCellContent(content, { raw, value, formula, renderRich: paintRichCellContent });
    applyCellImageLayout(cell, this.model, row, col);
    this.updateCellReferenceCount(cell, this.model.getCell(row, col)?.uid);
  }

  cellCommentThreads(uid) {
    if (!getSetting("comments-enabled")) return [];
    return this.commentThreads?.get?.(uid) || [];
  }

  updateCellReferenceCount(cell, uid) {
    if (!cell || !uid) return;
    const threads = this.cellCommentThreads(uid);
    // Every thread anchor is a real ((cellUid)) ref, so the raw linked-reference count double-counts
    // commented cells.  Partition it: refs keep the remainder, comments get their own badge.
    const count = Math.max(0, (Math.max(0, Number(this.referenceCounts?.get(uid)) || 0)) - threads.length);
    let badge = cell.querySelector?.(".rg-cell-reference-count") || null;
    if (!count || !getSetting("appearance-reference-badges")) badge?.remove();
    else {
      if (!badge) {
        badge = document.createElement("button");
        badge.type = "button";
        badge.className = "rg-cell-reference-count";
        badge.dataset.rgReferenceUid = uid;
        badge.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); });
        badge.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); this.openCellReferences(uid); });
        cell.appendChild(badge);
      }
      badge.dataset.rgReferenceUid = uid;
      badge.textContent = String(count);
      badge.title = "Click for references";
      badge.setAttribute("aria-label", `${count} linked reference${count === 1 ? "" : "s"}. Click to toggle references`);
      const openHere = this.inlineReferencesUid === uid && this.inlineReferencesMode !== "comments";
      badge.setAttribute("aria-expanded", String(openHere));
      if (openHere && this.inlineReferencesPanel?.id) badge.setAttribute("aria-controls", this.inlineReferencesPanel.id);
      else badge.removeAttribute("aria-controls");
    }
    this.updateCellCommentCount(cell, uid, threads);
  }

  updateCellCommentCount(cell, uid, threads = this.cellCommentThreads(uid)) {
    if (!cell || !uid) return;
    let badge = cell.querySelector?.(".rg-cell-comment-count") || null;
    if (!threads.length || !getSetting("comments-badges")) { badge?.remove(); return; }
    const total = commentThreadCount(threads);
    if (!badge) {
      badge = document.createElement("button");
      badge.type = "button";
      badge.className = "rg-cell-comment-count";
      badge.dataset.rgCommentUid = uid;
      badge.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); });
      badge.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); this.openCellComments(uid); });
      cell.appendChild(badge);
    }
    badge.dataset.rgCommentUid = uid;
    badge.textContent = String(total);
    badge.title = "Click for comments";
    badge.setAttribute("aria-label", `${total} comment${total === 1 ? "" : "s"}. Click to toggle comments`);
    const openHere = this.inlineReferencesUid === uid && this.inlineReferencesMode === "comments";
    badge.setAttribute("aria-expanded", String(openHere));
    if (openHere && this.inlineReferencesPanel?.id) badge.setAttribute("aria-controls", this.inlineReferencesPanel.id);
    else badge.removeAttribute("aria-controls");
  }

  updateReferenceCountBadges(uids = this.referenceCounts?.keys?.() || []) {
    for (const uid of uids) {
      const coordinate = this.cellCoordinatesByUid.get(uid);
      if (!coordinate || this.model.isCovered(coordinate.row, coordinate.col)) continue;
      this.updateCellReferenceCount(this.cells.get(`${coordinate.row}:${coordinate.col}`), uid);
    }
  }

  updateCommentBadges(uids = this.commentThreads?.keys?.() || []) {
    return this.updateReferenceCountBadges(uids);
  }

  cellForUid(uid) {
    const coordinate = this.cellCoordinatesByUid.get(uid);
    return coordinate ? this.cells.get(`${coordinate.row}:${coordinate.col}`) || null : null;
  }

  referenceBadge(uid) {
    return this.cellForUid(uid)?.querySelector?.(".rg-cell-reference-count") || null;
  }

  commentBadge(uid) {
    return this.cellForUid(uid)?.querySelector?.(".rg-cell-comment-count") || null;
  }

  closeInlineReferences() {
    const previousUid = this.inlineReferencesUid;
    for (const dispose of this.inlineReferenceDisposers) {
      try { dispose(); } catch { /* Roam may already have unmounted the block */ }
    }
    this.inlineReferenceDisposers.clear();
    this.inlineReferencesPanel?.remove();
    this.inlineReferencesPanel = null;
    this.inlineReferencesUid = null;
    this.inlineReferencesMode = null;
    this.inlineCommentComposerDisposer = null;
    for (const badge of previousUid ? [this.referenceBadge(previousUid), this.commentBadge(previousUid)] : []) {
      badge?.setAttribute("aria-expanded", "false");
      badge?.removeAttribute("aria-controls");
    }
    return Boolean(previousUid);
  }

  renderReferenceSource(source, host) {
    const api = roam();
    const unmount = api.ui?.components?.unmountNode;
    if (typeof unmount === "function") this.inlineReferenceDisposers.add(() => unmount({ el: host }));
    const fallback = () => {
      if (!this.inlineReferencesPanel?.contains?.(host)) return;
      host.textContent = source.string;
      try {
        const result = api.ui?.components?.renderString?.({ el: host, string: source.string });
        if (typeof result === "function") this.inlineReferenceDisposers.add(result);
      } catch { /* readable plain text already exists */ }
    };
    try {
      const result = api.ui?.components?.renderBlock?.({ uid: source.uid, el: host });
      if (typeof result === "function") this.inlineReferenceDisposers.add(result);
      else if (typeof result?.dispose === "function") this.inlineReferenceDisposers.add(() => result.dispose());
      else if (result && typeof result.then === "function") result.then((resolved) => {
        if (typeof resolved !== "function") return;
        if (this.inlineReferencesPanel?.contains?.(host)) this.inlineReferenceDisposers.add(resolved);
        else resolved();
      }, fallback);
      else if (result === undefined && !api.ui?.components?.renderBlock) fallback();
    } catch { fallback(); }
  }

  /** Opens the cell's comment thread where 0.8.2 already puts references: the view-local inline panel.
   *  `comments-compose-mode` = "Right sidebar" restores Roam's own right-sidebar behaviour. */
  openCellComments(uid) {
    const threads = this.cellCommentThreads(uid);
    if (getSetting(COMMENT_COMPOSE_MODE_KEY) === COMMENT_COMPOSE_SIDEBAR && threads.length) {
      try {
        roam().ui?.rightSidebar?.addWindow?.({ window: { type: "block", "block-uid": threads[0].threadUid } });
        return true;
      } catch (error) { toast(`Could not open the comment thread: ${error.message}`, "danger"); return false; }
    }
    return this.openCellReferences(uid, { mode: "comments" });
  }

  openCellReferences(uid, { mode = "references" } = {}) {
    if (this.inlineReferencesUid === uid && (this.inlineReferencesMode || "references") === mode) { this.closeInlineReferences(); return true; }
    this.closeInlineReferences();
    let sources;
    try { sources = queryBlockReferenceSources(uid); }
    catch (error) { toast(`Could not load cell references: ${error.message}`, "danger"); return false; }
    const comments = mode === "comments";
    const threadUids = new Set(this.cellCommentThreads(uid).map((thread) => thread.threadUid));
    sources = sources.filter((source) => threadUids.has(source.uid) === comments);
    if (comments) {
      // Datalog can lag a just-written thread; the optimistic index (merged by writeCommentThread)
      // already knows it.  Synthesize the missing anchors rather than render "No comments found.".
      const present = new Set(sources.map((source) => source.uid));
      for (const thread of this.cellCommentThreads(uid)) {
        if (present.has(thread.threadUid)) continue;
        sources.push({ uid: thread.threadUid, string: commentAnchorString(uid), pageTitle: "" });
      }
    }
    const coordinate = this.cellCoordinatesByUid.get(uid);
    const raw = coordinate ? this.model.getRaw(coordinate.row, coordinate.col) : "Referenced cell";
    const panel = document.createElement("section");
    panel.className = comments ? "rg-inline-references rg-inline-references--comments" : "rg-inline-references";
    panel.id = `rg-inline-references-${String(uid).replace(/[^A-Za-z0-9_-]/g, "")}-${cryptoId()}`;
    panel.dataset.uid = uid;
    panel.setAttribute("aria-label", `${comments ? "Comments on" : "References to"} ${String(raw).replace(/\s+/g, " ").trim() || "this cell"}`);
    const header = document.createElement("div"); header.className = "rg-inline-references-header";
    const title = document.createElement("span"); title.className = "rg-inline-references-title";
    const label = String(raw).replace(/\s+/g, " ").trim() || "(empty cell)";
    title.textContent = `${comments ? "Comments on" : "References to"}: ${label}`;
    const count = document.createElement("span"); count.className = "rg-inline-references-count"; count.textContent = String(sources.length);
    const close = button("×", comments ? "Close comments" : "Close references", () => this.closeInlineReferences(), "rg-inline-references-close");
    header.append(title, count, close); panel.appendChild(header);
    const list = document.createElement("div"); list.className = "rg-inline-references-list"; panel.appendChild(list);
    if (!sources.length) {
      const empty = document.createElement("div"); empty.className = "rg-inline-references-empty"; empty.textContent = comments ? "No comments found." : "No linked references found."; list.appendChild(empty);
    } else for (const source of sources) {
      const item = document.createElement("article"); item.className = "rg-inline-reference-item"; item.dataset.uid = source.uid;
      const breadcrumb = document.createElement("button"); breadcrumb.type = "button"; breadcrumb.className = "rg-inline-reference-breadcrumb";
      breadcrumb.textContent = `${source.pageTitle || "Roam"}  ›`;
      breadcrumb.title = "Open referencing block";
      breadcrumb.addEventListener("click", () => roam().ui?.mainWindow?.openBlock?.({ block: { uid: source.uid } }));
      const block = document.createElement("div"); block.className = "rg-inline-reference-block";
      item.append(breadcrumb, block); list.appendChild(item);
      (globalThis.queueMicrotask || ((callback) => Promise.resolve().then(callback)))(() => {
        if (this.inlineReferencesPanel === panel && panel.contains?.(block)) this.renderReferenceSource(source, block);
      });
    }
    this.inlineReferencesUid = uid;
    this.inlineReferencesMode = mode;
    this.inlineReferencesPanel = panel;
    this.root.appendChild(panel);
    const badge = comments ? this.commentBadge(uid) : this.referenceBadge(uid);
    badge?.setAttribute("aria-expanded", "true");
    badge?.setAttribute("aria-controls", panel.id);
    panel.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    return true;
  }

  /**
   * The one place that decides whether this view carries the affordance, so the modifier keyup path
   * cannot tear down a listener that `Hover` mode still wants.  A preview mount is read-only
   * (GOAL-R1) and gets no write affordance in either mode.
   */
  commentAffordanceWanted() {
    if (this.disposed || this.surface === "preview" || !getSetting("comments-enabled")) return false;
    return commentHoverAlways() || Boolean(runtime.commentArmed);
  }

  syncCommentAffordance() { return this.setCommentArmed(this.commentAffordanceWanted()); }

  /**
   * Arming installs exactly ONE delegated `pointerover` on this view's root and reuses ONE button
   * node.  No `mousemove`, no per-cell listeners.  Disarmed means zero listeners and zero nodes.
   * In `Hover` mode that one listener is permanent for the life of the mount, which is affordable
   * only because `onCommentPointerOver` stays a `closest` plus a move.
   */
  setCommentArmed(armed) {
    const next = Boolean(armed) && !this.disposed && this.surface !== "preview";
    if (Boolean(this.commentArmed) === next) return next;
    this.commentArmed = next;
    this.root.classList?.toggle?.("rg-root--comment-armed", next);
    if (next) {
      this.boundCommentPointerOver = this.boundCommentPointerOver || ((event) => this.onCommentPointerOver(event));
      this.root.addEventListener("pointerover", this.boundCommentPointerOver);
      return true;
    }
    if (this.boundCommentPointerOver) this.root.removeEventListener("pointerover", this.boundCommentPointerOver);
    this.commentAddButton?.remove();
    this.commentAddButton = null;
    return false;
  }

  commentAffordance() {
    if (this.commentAddButton) return this.commentAddButton;
    const element = document.createElement("button");
    element.type = "button";
    element.className = "rg-cell-comment-add";
    element.textContent = "💬";
    element.title = "Comment on this cell (⌘⌥=)";
    element.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); });
    element.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      void this.addCellComment(Number(element.dataset.row), Number(element.dataset.col));
    });
    this.commentAddButton = element;
    return element;
  }

  onCommentPointerOver(event) {
    if (!this.commentArmed) return null;
    const cell = event?.target?.closest?.(".rg-cell");
    if (!cell || !this.root.contains?.(cell)) return null;
    // `pointerover` bubbles, so crossing the children of one cell re-fires it. Settling for the cell
    // the node already sits in is what keeps a permanent `Hover`-mode listener allocation-free.
    if (this.commentAddButton && this.commentAddButton.parentElement === cell) return this.commentAddButton;
    const row = Number(cell.dataset.row); const col = Number(cell.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col) || this.model.isCovered(row, col)) return null;
    const affordance = this.commentAffordance();
    affordance.dataset.row = String(row); affordance.dataset.col = String(col);
    affordance.setAttribute("aria-label", `Comment on ${cellLabel(row, col)}`);
    if (affordance.parentElement !== cell) cell.appendChild(affordance);
    return affordance;
  }

  async addCellComment(row, col) {
    if (this.surface === "preview") return null;
    if (!getSetting("comments-enabled")) { toast("Cell comments are turned off in Roam Grid settings", "warning"); return null; }
    if (!this.session) { toast("This grid is not attached to a Roam table yet", "warning"); return null; }
    if (!this.model.inBounds(row, col)) return null;
    const merge = this.model.mergeAt(row, col);
    const uid = this.model.getCell(merge?.row ?? row, merge?.col ?? col)?.uid;
    if (!uid || String(uid).startsWith("rg_")) { toast(`Cell ${cellLabel(row, col)} does not have a persisted Roam UID yet`, "warning"); return null; }
    const mode = getSetting(COMMENT_COMPOSE_MODE_KEY);
    if (mode === COMMENT_COMPOSE_BOX) return this.addCellCommentViaPrompt(uid, merge?.row ?? row, merge?.col ?? col);
    if (mode === COMMENT_COMPOSE_SIDEBAR) return this.composeCellCommentSidebar(uid);
    return this.composeCellCommentInline(uid, merge?.row ?? row, merge?.col ?? col);
  }

  /** The pre-0.12 compose path: ask in a dialog first, write once on OK. */
  async addCellCommentViaPrompt(uid, row, col) {
    const body = await showPrompt(`Comment on ${cellLabel(row, col)}`, "", this.root);
    if (body == null || !String(body).trim()) return null;
    try { return await this.session.addCellComment(uid, String(body).trim()); }
    catch (error) { toast(`Could not add the comment: ${error.message}`, "danger"); return null; }
  }

  /** Roam's own gesture: the thread opens in the right sidebar with the caret in an empty comment. */
  async composeCellCommentSidebar(uid) {
    let applied;
    try { applied = await this.session.beginSidebarComment(uid); }
    catch (error) {
      if (globalThis.window) globalThis.window.__RG_U4_LAST_ERROR = String(error?.stack || error);
      toast(`Could not start the comment: ${error.message}`, "danger");
      return null;
    }
    const { anchorUid, bodyUid } = applied;
    armCommentAbandonCleanup({ session: this.session, targetUid: uid, bodyUid, anchorUid, applied });
    try {
      roam().ui?.rightSidebar?.addWindow?.({ window: { type: "block", "block-uid": anchorUid } });
    } catch (error) {
      if (globalThis.window) globalThis.window.__RG_U4_LAST_ERROR = String(error?.stack || error);
      toast(`Could not open the comment thread: ${error.message}`, "danger");
      return null;
    }
    this.focusSidebarCommentBody(anchorUid, bodyUid);
    return applied;
  }

  /**
   * The sidebar mounts asynchronously, so the focus is retried a few times before giving up with a
   * toast.  The window-id is deterministic (`sidebar-block-<anchorUid>`) — verified live — but it is
   * still checked against `getWindows()` and scanned from that listing when the direct id misses.
   */
  focusSidebarCommentBody(anchorUid, bodyUid, attemptsLeft = 3) {
    if (this.disposed) return;
    try {
      const sidebar = roam().ui?.rightSidebar;
      const deterministic = `sidebar-block-${anchorUid}`;
      let windowId = deterministic;
      const windows = sidebar?.getWindows?.() || [];
      const match = windows.find((win) => win?.["window-id"] === deterministic) || windows.find((win) => win?.["block-uid"] === anchorUid);
      if (match?.["window-id"]) windowId = match["window-id"];
      roam().ui?.setBlockFocusAndSelection?.({ location: { "block-uid": bodyUid, "window-id": windowId } });
    } catch (error) {
      if (globalThis.window) globalThis.window.__RG_U4_LAST_ERROR = String(error?.stack || error);
    }
    if (String(globalThis.document?.activeElement?.id || "").endsWith(`-${bodyUid}`)) return;
    if (attemptsLeft > 1) trackedTimeout(() => this.focusSidebarCommentBody(anchorUid, bodyUid, attemptsLeft - 1), 150);
    else toast("Comment thread opened in the sidebar — click the empty comment to type.");
  }

  /** Default compose: the inline comments panel opens with an ephemeral composer already focused. */
  async composeCellCommentInline(uid, row, col) {
    // `openCellReferences` TOGGLES a same-uid comments panel closed — never call it blind here.
    const alreadyOpen = this.inlineReferencesUid === uid && this.inlineReferencesMode === "comments" && this.inlineReferencesPanel;
    if (!alreadyOpen && !this.openCellReferences(uid, { mode: "comments" })) return this.addCellCommentViaPrompt(uid, row, col);
    return this.appendInlineCommentComposer(uid);
  }

  /**
   * The composer writes NOTHING until Enter — no abandoned-block lifecycle exists in this mode.
   * Registered in the panel's disposer list, so closing the panel takes the composer with it.
   */
  appendInlineCommentComposer(uid) {
    const panel = this.inlineReferencesPanel;
    if (!panel || this.inlineReferencesUid !== uid || this.inlineReferencesMode !== "comments") return null;
    panel.querySelector?.(".rg-inline-comment-composer")?.remove?.();
    // Retire the previous composer's disposer too — removing the node alone leaks one dead
    // `() => composer.remove()` into the panel's disposer set on every re-append.
    if (this.inlineCommentComposerDisposer) {
      this.inlineReferenceDisposers.delete(this.inlineCommentComposerDisposer);
      this.inlineCommentComposerDisposer = null;
    }
    const composer = document.createElement("div");
    composer.className = "rg-inline-comment-composer";
    const textarea = document.createElement("textarea");
    textarea.className = "rg-inline-comment-input";
    textarea.placeholder = "Write a comment…  Enter saves · Shift+Enter newline · Esc closes";
    textarea.setAttribute("aria-label", "Write a comment on this cell");
    composer.appendChild(textarea);
    panel.appendChild(composer);
    const composerDisposer = () => composer.remove();
    this.inlineReferenceDisposers.add(composerDisposer);
    this.inlineCommentComposerDisposer = composerDisposer;
    const commit = async () => {
      const text = String(textarea.value ?? "").trim();
      if (!text) return;
      // A cell with no prior thread showed "No comments found." — the panel must be rebuilt to
      // render the new thread, so it is closed and reopened after the write lands.
      const reopen = !this.cellCommentThreads(uid).length;
      try { await this.session.addCellComment(uid, text); }
      catch (error) {
        if (globalThis.window) globalThis.window.__RG_U4_LAST_ERROR = String(error?.stack || error);
        toast(`Could not add the comment: ${error.message}`, "danger");
        return;
      }
      if (reopen) {
        this.closeInlineReferences();
        if (this.openCellReferences(uid, { mode: "comments" })) this.appendInlineCommentComposer(uid);
        return;
      }
      // The header count was rendered at open time; bring it in line with the committed write.
      const headerCount = panel.querySelector?.(".rg-inline-references-count");
      if (headerCount) headerCount.textContent = String(this.cellCommentThreads(uid).length);
      if (composer.parentNode === panel) {
        textarea.value = "";
        textarea.focus();
      }
    };
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); void commit(); }
      else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); composer.remove(); }
    });
    textarea.focus();
    return composer;
  }

  select(range) {
    const normalized = normalizeRange(range);
    this.selection = { startRow: clamp(normalized.startRow, 0, this.model.rowCount - 1), endRow: clamp(normalized.endRow, 0, this.model.rowCount - 1), startCol: clamp(normalized.startCol, 0, this.model.colCount - 1), endCol: clamp(normalized.endCol, 0, this.model.colCount - 1) };
    this.updateSelection();
  }

  extendSelection(row, col) { this.select({ startRow: this.anchor.row, endRow: row, startCol: this.anchor.col, endCol: col }); }

  clearSelectionControls() {
    for (const control of this.selectionControls || []) control.remove();
    this.selectionControls = new Set();
  }

  clearSelectionPresentation() {
    for (const cell of this.selectedCellElements || []) cell.classList.remove("rg-cell--selected");
    this.selectedCellElements = new Set();
    this.activeCellElement?.classList.remove("rg-cell--active");
    this.activeCellElement = null;
    this.clearSelectionControls();
  }

  selectedAnchors(range) {
    const selected = new Set();
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        const merge = this.model.mergeAt(row, col);
        const cell = this.cells.get(`${merge?.row ?? row}:${merge?.col ?? col}`);
        if (cell) selected.add(cell);
      }
    }
    return selected;
  }

  updateSelection() {
    const range = normalizeRange(this.selection);
    const multiple = range.startRow !== range.endRow || range.startCol !== range.endCol;
    const previousSelected = this.selectedCellElements || new Set();
    const nextSelected = this.selectedAnchors(range);
    for (const cell of previousSelected) if (!nextSelected.has(cell)) cell.classList.remove("rg-cell--selected");
    for (const cell of nextSelected) if (!previousSelected.has(cell)) cell.classList.add("rg-cell--selected");
    this.selectedCellElements = nextSelected;
    const activeMerge = this.model.mergeAt(this.selection.startRow, this.selection.startCol);
    const active = this.cells.get(`${activeMerge?.row ?? this.selection.startRow}:${activeMerge?.col ?? this.selection.startCol}`);
    const nextActive = multiple ? null : active;
    if (this.activeCellElement !== nextActive) {
      this.activeCellElement?.classList.remove("rg-cell--active");
      nextActive?.classList.add("rg-cell--active");
      this.activeCellElement = nextActive;
    }
    this.clearSelectionControls();
    if (active && !multiple) {
      const anchorRow = activeMerge?.row ?? this.selection.startRow;
      const anchorCol = activeMerge?.col ?? this.selection.startCol;
      const edgeRow = anchorRow + (activeMerge?.rowSpan || 1) - 1;
      const edgeCol = anchorCol + (activeMerge?.colSpan || 1) - 1;
      const widthHandle = document.createElement("span"); widthHandle.className = "rg-cell-width-resize"; widthHandle.title = `Resize column ${columnLabel(edgeCol)}`;
      widthHandle.addEventListener("pointerdown", (event) => this.startColumnResize(this.model.columnIds[edgeCol], event));
      widthHandle.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); this.commitMutation("Auto-fit column", () => { delete this.model.widths[this.model.columnIds[edgeCol]]; }, true); });
      const heightHandle = document.createElement("span"); heightHandle.className = "rg-cell-height-resize"; heightHandle.title = `Resize row ${edgeRow + 1}`;
      heightHandle.addEventListener("pointerdown", (event) => this.startRowResize(edgeRow, event));
      heightHandle.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); this.commitMutation("Auto-fit row", () => this.model.setRowHeight(edgeRow, null), true); });
      const columnGrabber = this.axisGrabber("column", anchorCol); const rowGrabber = this.axisGrabber("row", anchorRow);
      active.append(widthHandle, heightHandle, columnGrabber, rowGrabber);
      this.selectionControls = new Set([widthHandle, heightHandle, columnGrabber, rowGrabber]);
    }
    let rangeOverlay = null;
    if (multiple) {
      const offset = this.headersOn() ? 1 : 0;
      rangeOverlay = document.createElement("div"); rangeOverlay.className = "rg-range-overlay";
      rangeOverlay.style.gridRow = `${range.startRow + 1 + offset} / ${range.endRow + 2 + offset}`;
      rangeOverlay.style.gridColumn = `${range.startCol + 1 + offset} / ${range.endCol + 2 + offset}`;
      const rows = range.endRow - range.startRow + 1; const cols = range.endCol - range.startCol + 1;
      const badge = document.createElement("button"); badge.type = "button"; badge.className = "rg-range-badge"; badge.textContent = `${rows} × ${cols}`;
      badge.title = `Selected ${cellLabel(range.startRow, range.startCol)}:${cellLabel(range.endRow, range.endCol)} · click for range actions`;
      badge.setAttribute("aria-label", badge.title);
      badge.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); });
      badge.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); this.openMenu(badge); });
      rangeOverlay.appendChild(badge); this.gridElement.appendChild(rangeOverlay); this.selectionControls.add(rangeOverlay);
    }
    const endMerge = this.model.mergeAt(this.selection.endRow, this.selection.endCol);
    const end = this.cells.get(`${endMerge?.row ?? this.selection.endRow}:${endMerge?.col ?? this.selection.endCol}`);
    const fillParent = rangeOverlay || end;
    if (fillParent) {
      const handle = document.createElement("span"); handle.className = "rg-fill-handle"; handle.title = "Drag to fill";
      handle.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); this.fillStart = deepClone(this.selection); this.fillTarget = { row: this.selection.endRow, col: this.selection.endCol }; });
      fillParent.appendChild(handle);
      if (!rangeOverlay) this.selectionControls.add(handle);
    }
  }

  axisGrabber(type, index) {
    const proxy = document.createElement("td");
    proxy.className = `rg-native-pill-proxy rg-native-pill-proxy--${type}`;
    proxy.dataset[type === "row" ? "row" : "col"] = String(index);
    const grip = document.createElement("button");
    grip.type = "button";
    grip.className = `rg-axis-grabber rg-axis-grabber--${type} rm-table__${type === "row" ? "row" : "col"}-pill-target`;
    grip.title = `${type === "row" ? "Row" : "Column"} ${type === "row" ? index + 1 : columnLabel(index)} menu`;
    grip.setAttribute("aria-label", grip.title);
    if (type === "column") for (let dot = 0; dot < 6; dot += 1) grip.appendChild(document.createElement("i"));
    grip.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); });
    grip.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); this.openAxisMenu(type, index, grip); });
    proxy.appendChild(grip);
    return proxy;
  }

  finishPointerAction() {
    this.dragSelecting = false;
    if (this.fillStart) {
      const start = this.fillStart; const target = this.fillTarget; this.fillStart = null; this.fillTarget = null;
      if (target && !rangeContains(start, target.row, target.col)) this.commitMutation("Fill range", () => this.fillRange(start, target), true);
    }
  }

  fillRange(source, target) {
    const sourceRange = normalizeRange(source); const targetRange = normalizeRange({ startRow: sourceRange.startRow, startCol: sourceRange.startCol, endRow: target.row, endCol: target.col });
    const values = selectionMatrix(this.model, sourceRange); const height = values.length; const width = values[0].length;
    for (let row = targetRange.startRow; row <= targetRange.endRow; row += 1) for (let col = targetRange.startCol; col <= targetRange.endCol; col += 1) {
      if (rangeContains(sourceRange, row, col) || this.model.isCovered(row, col)) continue;
      const sourceRaw = values[(row - sourceRange.startRow) % height][(col - sourceRange.startCol) % width];
      this.model.setRaw(row, col, rewriteFormula(sourceRaw, row - sourceRange.startRow, col - sourceRange.startCol));
    }
    this.selection = targetRange;
  }

  insertFormulaReference(row, col, event) {
    const merge = this.model.mergeAt(row, col); row = merge?.row ?? row; col = merge?.col ?? col;
    return this.editorController?.insertReference(row, col, event) || false;
  }

  beginEdit(row, col, initial = null, floating = false) {
    if (this.surface === "preview") return null;
    if (this.session) return this.session.beginEdit(this, () => this.beginEditLocal(row, col, initial, floating));
    return this.beginEditLocal(row, col, initial, floating);
  }

  /**
   * A registered custom editor wins outright, and a formula, an F2-floating edit, a preview surface,
   * a reference-context grid or a cell with no Roam block behind it can never use Roam's editor. The
   * `==` escape is text, not a formula, so it takes the native path like any other value.
   */
  nativeOverlayEligible(row, col, initial, floating, customEditor) {
    if (customEditor || floating || !this.nativeOverlay) return false;
    if (this.surface === "preview" || this.context !== "source") return false;
    if (!this.session || !nativeEditorEnabled()) return false;
    const probe = String(initial ?? this.model.getRaw(row, col) ?? "");
    if (probe.startsWith("=") && !probe.startsWith("==")) return false;
    return Boolean(this.model.getCell(row, col)?.uid);
  }

  async beginEditLocal(row, col, initial = null, floating = false) {
    const merge = this.model.mergeAt(row, col); row = merge?.row ?? row; col = merge?.col ?? col;
    const cell = this.cells.get(`${row}:${col}`); if (!cell) return;
    const raw = this.model.getRaw(row, col);
    const context = { raw, row, col, model: this.model };
    let editor = null;
    for (const registered of floating ? [] : runtime.registries.cellEditors.values()) {
      try {
        if (registered.match?.(context)) {
          const candidate = registered.create?.(context);
          if (candidate instanceof HTMLElement && "value" in candidate) { editor = candidate; break; }
        }
      } catch (error) { console.warn("[roam-grid] Cell editor failed", error); }
    }
    if (this.nativeOverlayEligible(row, col, initial, floating, editor)) {
      const uid = this.model.getCell(row, col).uid;
      const started = await this.nativeOverlay.start({ row, col, cell, uid, raw, initial });
      if (started) return started;
    }
    return this.editorController?.start({ row, col, cell, raw, initial, floating, customEditor: editor });
  }

  onKeydown(event) {
    if (event.target.matches("textarea,input")) return;
    event.stopPropagation();
    const command = event.metaKey || event.ctrlKey;
    if (command && event.altKey && (event.key === "=" || event.key === "+" || event.key === "≠" || event.code === "Equal")) { event.preventDefault(); void this.addCellComment(this.selection.startRow, this.selection.startCol); return; }
    if (command && event.shiftKey && event.key.toLowerCase() === "c") { event.preventDefault(); this.copyRoamReferences(); return; }
    if (command && event.key.toLowerCase() === "c") { event.preventDefault(); this.copy(false); return; }
    if (command && event.key.toLowerCase() === "x") { event.preventDefault(); this.copy(true); return; }
    if (command && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? this.redo() : this.undo(); return; }
    if (command && event.shiftKey && event.key.toLowerCase() === "m") { event.preventDefault(); this.mergeSelection(); return; }
    if (event.key === "Enter") { event.preventDefault(); this.beginEdit(this.selection.startRow, this.selection.startCol); return; }
    if (event.key === "F2") { event.preventDefault(); this.beginEdit(this.selection.startRow, this.selection.startCol, null, true); return; }
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); this.clearSelection(); return; }
    if (event.altKey && event.key.startsWith("Arrow")) {
      event.preventDefault(); const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
      const range = normalizeRange(this.selection); const targetRow = clamp(range.startRow + dr, 0, this.model.rowCount - (range.endRow - range.startRow + 1)); const targetCol = clamp(range.startCol + dc, 0, this.model.colCount - (range.endCol - range.startCol + 1));
      this.commitMutation("Move range", () => this.model.moveRange(range, targetRow, targetCol), true); this.select({ startRow: targetRow, endRow: targetRow + range.endRow - range.startRow, startCol: targetCol, endCol: targetCol + range.endCol - range.startCol }); return;
    }
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, event.shiftKey ? -1 : 1] };
    if (moves[event.key]) { event.preventDefault(); const [dr, dc] = moves[event.key]; event.shiftKey && event.key !== "Tab" ? this.extendSelection(clamp(this.selection.endRow + dr, 0, this.model.rowCount - 1), clamp(this.selection.endCol + dc, 0, this.model.colCount - 1)) : this.moveSelection(dr, dc); return; }
    // BEFORE the printable-char branch: a space is length-1, so Shift+Space would otherwise begin an
    // edit seeded with " ". It opens the lightbox at the selected cell's first image instead.
    if (event.key === " " && event.shiftKey && !command && !event.altKey) { event.preventDefault(); this.openCellImageLightbox(this.selection.startRow, this.selection.startCol, 0); return; }
    if (event.key.length === 1 && !command && !event.altKey) { event.preventDefault(); this.beginEdit(this.selection.startRow, this.selection.startCol, event.key); }
  }

  moveSelection(dr, dc) {
    const merge = this.model.mergeAt(this.selection.startRow, this.selection.startCol);
    let row = merge ? (dr > 0 ? merge.row + merge.rowSpan : dr < 0 ? merge.row - 1 : merge.row) : this.selection.startRow + dr;
    let col = merge ? (dc > 0 ? merge.col + merge.colSpan : dc < 0 ? merge.col - 1 : merge.col) : this.selection.startCol + dc;
    row = clamp(row, 0, this.model.rowCount - 1); col = clamp(col, 0, this.model.colCount - 1);
    const target = this.model.mergeAt(row, col); row = target?.row ?? row; col = target?.col ?? col;
    this.anchor = { row, col }; this.select({ startRow: row, endRow: row, startCol: col, endCol: col });
    this.cells.get(`${row}:${col}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  copy(cut) {
    const matrix = selectionMatrix(this.model, this.selection); const text = matrix.map((row) => row.map((value) => quoteDelimited(value, "\t")).join("\t")).join("\n");
    globalThis.navigator?.clipboard?.writeText(text).catch(() => {});
    if (cut) this.clearSelection();
  }

  async onPaste(event) {
    const images = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
    if (images.length) {
      event.preventDefault(); const row = this.selection.startRow; const col = this.selection.startCol; const previous = this.model.getRaw(row, col);
      try {
        const embeds = await uploadImageEmbeds(images);
        await this.commitMutation("Paste image", () => this.model.setRaw(row, col, [previous, ...embeds].filter(Boolean).join(" ")), false);
      } catch (error) { if (globalThis.window) globalThis.window.__RG_IMG_LAST_ERROR = String(error?.stack || error); }
      return;
    }
    const text = event.clipboardData?.getData("text/plain"); if (!text) return;
    const referenced = parseRangeComponent(text);
    if (referenced) { event.preventDefault(); await this.pasteReferencedRange(referenced); return; }
    event.preventDefault(); const matrix = parseDelimited(text, text.includes("\t") ? "\t" : detectDelimiter(text));
    await this.pasteMatrix(matrix);
  }

  /**
   * Drag-drop parity with paste: OS image files land at the DROPPED-ON cell (never the selection),
   * appended after any existing content through the ordinary undoable mutation lane. Fire-and-forget
   * from the drop event — the upload toast and failure path live in `uploadImageEmbeds`.
   */
  async dropImageFiles(files, row, col) {
    try {
      const embeds = await uploadImageEmbeds(files);
      if (!embeds.length) return;
      const previous = this.model.getRaw(row, col);
      await this.commitMutation("Drop image", () => this.model.setRaw(row, col, [previous, ...embeds].filter(Boolean).join(" ")), false);
    } catch (error) { if (globalThis.window) globalThis.window.__RG_IMG_LAST_ERROR = String(error?.stack || error); }
  }

  /** LP-8: preventDefault on dragover is what lets the drop happen at all, and it beats Roam's
   *  global file-drop lane. Only Files transfers earn the `.rg-cell--drop-target` highlight. */
  handleCellDragOver(cell, event) {
    const types = event.dataTransfer?.types;
    const files = Boolean(types?.includes?.("Files"));
    cell.classList.toggle("rg-cell--drop-target", files);
    if (files || types?.includes?.("application/x-roam-grid-range")) { event.preventDefault(); return true; }
    return false;
  }

  /** dragleave fires when entering a child too; only a real exit clears the highlight. */
  handleCellDragLeave(cell, event) {
    if (event.relatedTarget && cell.contains?.(event.relatedTarget)) return false;
    cell.classList.remove("rg-cell--drop-target");
    return true;
  }

  /** One drop lane for both payloads: an in-grid range move, else OS image files. A drop of
   *  non-image files falls through untouched so Roam keeps its own file handling. */
  handleCellDrop(cell, event) {
    cell.classList.remove("rg-cell--drop-target");
    const row = Number(cell.dataset.row); const col = Number(cell.dataset.col);
    const raw = event.dataTransfer?.getData?.("application/x-roam-grid-range");
    if (raw) {
      event.preventDefault(); const range = JSON.parse(raw);
      this.commitMutation("Move range", () => this.model.moveRange(range, row, col), true);
      return "range";
    }
    const images = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith("image/"));
    if (!images.length) return null;
    event.preventDefault();
    void this.dropImageFiles(images, row, col);
    return "images";
  }

  async pasteReferencedRange(spec, resolve = resolveSourceModel) {
    let sourceModel;
    try { sourceModel = resolve(spec.tableUid); }
    catch (error) { return toast(`Could not read the referenced grid: ${error.message}`, "danger"); }
    if (!sourceModel) return toast("Could not read the referenced grid", "danger");
    let matrix;
    try { matrix = selectionBlockReferenceMatrix(sourceModel, spec.range); }
    catch (error) { return toast(error.message, "warning"); }
    await this.pasteMatrix(matrix);
  }

  async pasteMatrix(source) {
    const matrix = clipPasteMatrix(source, this.selection.startRow, this.selection.startCol, this.model.rowCount, this.model.colCount);
    if (!matrix.length) return;
    const width = Math.max(...matrix.map((row) => row.length));
    const structural = this.selection.startRow + matrix.length > this.model.rowCount || this.selection.startCol + width > this.model.colCount;
    await this.commitMutation("Paste cells", () => {
      const neededRows = this.selection.startRow + matrix.length - this.model.rowCount; if (neededRows > 0) this.model.insertRows(this.model.rowCount, neededRows);
      const neededCols = this.selection.startCol + width - this.model.colCount; if (neededCols > 0) this.model.insertCols(this.model.colCount, neededCols);
      matrix.forEach((values, row) => values.forEach((value, col) => { if (!this.model.isCovered(this.selection.startRow + row, this.selection.startCol + col)) this.model.setRaw(this.selection.startRow + row, this.selection.startCol + col, value); }));
    }, structural);
  }

  clearSelection() {
    this.commitMutation("Clear cells", () => { const range = normalizeRange(this.selection); for (let row = range.startRow; row <= range.endRow; row += 1) for (let col = range.startCol; col <= range.endCol; col += 1) if (!this.model.isCovered(row, col)) this.model.setRaw(row, col, ""); }, false);
  }

  mergeSelection() { this.commitMutation("Merge cells", () => this.model.merge(this.selection), true); }
  unmergeSelection() { this.commitMutation("Unmerge cells", () => { if (!this.model.unmerge(this.selection.startRow, this.selection.startCol)) throw new GridError("NOT_MERGED", "The active cell is not merged"); }, true); }
  insertRow() { const row = this.selection.endRow + 1; this.commitMutation("Insert row", () => this.model.insertRows(row, 1), true); this.select({ startRow: row, endRow: row, startCol: this.selection.startCol, endCol: this.selection.startCol }); }
  insertCol() { const col = this.selection.endCol + 1; this.commitMutation("Insert column", () => this.model.insertCols(col, 1), true); this.select({ startRow: this.selection.startRow, endRow: this.selection.startRow, startCol: col, endCol: col }); }
  insertAxis(type, index, after) {
    const at = clamp(index + (after ? 1 : 0), 0, type === "row" ? this.model.rowCount : this.model.colCount);
    const row = type === "row" ? at : this.selection.startRow;
    const col = type === "column" ? at : this.selection.startCol;
    return this.commitMutation(`Insert ${type}`, () => type === "row" ? this.model.insertRows(at, 1) : this.model.insertCols(at, 1), true).then((model) => {
      if (model) this.select({ startRow: clamp(row, 0, this.model.rowCount - 1), endRow: clamp(row, 0, this.model.rowCount - 1), startCol: clamp(col, 0, this.model.colCount - 1), endCol: clamp(col, 0, this.model.colCount - 1) });
    });
  }
  deleteAxis(type, index) {
    return this.commitMutation(`Delete ${type}`, () => type === "row" ? this.model.deleteRows(index, 1) : this.model.deleteCols(index, 1), true, { rowDeletion: type === "row" }).then((model) => {
      if (!model) return;
      const row = clamp(type === "row" ? index : this.selection.startRow, 0, this.model.rowCount - 1);
      const col = clamp(type === "column" ? index : this.selection.startCol, 0, this.model.colCount - 1);
      this.select({ startRow: row, endRow: row, startCol: col, endCol: col });
    });
  }
  clearAxis(type, index) {
    return this.commitMutation(`Clear ${type}`, () => {
      if (type === "row") for (let col = 0; col < this.model.colCount; col += 1) { if (!this.model.isCovered(index, col)) this.model.setRaw(index, col, ""); }
      else for (let row = 0; row < this.model.rowCount; row += 1) { if (!this.model.isCovered(row, index)) this.model.setRaw(row, index, ""); }
    }, false);
  }
  toggleAxisHeader(type, index) {
    return this.commitMutation(`Toggle header ${type}`, () => type === "row" ? this.model.toggleHeaderRow(index) : this.model.toggleHeaderColumn(index), true);
  }
  /** `session.undo`/`redo` write through the history, not `commitMutation`, so they need their own
   *  preview guard — a tooltip must not be able to rewind the source table. */
  undo() { return this.surface === "preview" ? false : this.session.undo(); }
  redo() { return this.surface === "preview" ? false : this.session.redo(); }

  openSource() {
    const uid = this.model.tableUid;
    if (!uid) return toast("This grid does not have a source block UID", "warning");
    try {
      const result = roam().ui?.mainWindow?.openBlock?.({ block: { uid } });
      if (result?.catch) result.catch((error) => toast(`Could not open source: ${error.message}`, "danger"));
      return result;
    } catch (error) { return toast(`Could not open source: ${error.message}`, "danger"); }
  }

  async insertChart() {
    const type = await showChoice("Choose chart type", ["line", "column", "bar", "scatter", "histogram", "boxplot", "density", "count", "multiline", "sparkline"].map((value, index) => ({ label: value[0].toUpperCase() + value.slice(1), value, primary: index === 0 })));
    if (!type) return;
    this.commitMutation("Insert chart", () => this.model.charts.push({ id: makeLocalUid(), type: type === "multiline" ? "line" : type === "sparkline" ? "line" : type, range: deepClone(this.selection), title: `${type} · ${cellLabel(this.selection.startRow, this.selection.startCol)}:${cellLabel(this.selection.endRow, this.selection.endCol)}` }), true);
  }

  openMenu(anchor, x = null, y = null) {
    const existing = document.querySelector(".rg-context-menu"); existing?.__rgDismiss?.(); existing?.remove();
    const menu = document.createElement("div"); menu.className = "bp3-menu rg-context-menu";
    let theme = null;
    const timers = new Set();
    const later = (callback, delay = 0) => {
      const timer = setTimeout(() => { timers.delete(timer); if (!closed) callback(); }, delay);
      timers.add(timer); return timer;
    };
    let closed = false;
    const dismiss = () => {
      if (closed) return; closed = true; for (const timer of timers) clearTimeout(timer); timers.clear();
      theme?.dispose(); menu.remove(); document.removeEventListener("pointerdown", close, true);
      if (this.disposed) return;
      this.root.focus?.({ preventScroll: true }); claimKeyboard(this);
    };
    const item = (label, action) => { const element = button(label, label, () => { dismiss(); action(); }); element.className = "bp3-menu-item"; return element; };
    const section = (label) => { const element = document.createElement("div"); element.className = "rg-menu-section"; element.textContent = label; return element; };
    const entries = (list) => list.map((entry) => entry.section ? section(entry.section) : item(entry.label, entry.action));
    menu.append(
      ...(this.context === "reference" ? [item("Open source table", () => this.openSource())] : []),
      item("Merge selection", () => this.mergeSelection()), item("Unmerge", () => this.unmergeSelection()),
      item("Insert row below", () => this.insertRow()), item("Insert column right", () => this.insertCol()),
      item("Delete selected rows", () => { const range = normalizeRange(this.selection); this.commitMutation("Delete rows", () => this.model.deleteRows(range.startRow, range.endRow - range.startRow + 1), true, { rowDeletion: true }); }),
      item("Delete selected columns", () => { const range = normalizeRange(this.selection); this.commitMutation("Delete columns", () => this.model.deleteCols(range.startCol, range.endCol - range.startCol + 1), true); }),
      item("Set selected row height…", () => this.setSelectedRowHeight()),
      item("Compact selected rows", () => this.resizeSelectedRows(getSetting("sizing-compact-row-height"))),
      ...entries(this.rowHeightMenuEntries()),
      item("Set selected column width…", () => this.setSelectedColumnWidth()),
      item("Reset selected column widths", () => this.resizeSelectedColumns(null)),
      item("Align left", () => this.alignSelection("left")),
      item("Align center", () => this.alignSelection("center")),
      item("Align right", () => this.alignSelection("right")),
      item("Reset alignment", () => this.alignSelection(null)),
      ...entries(this.imageLayoutMenuEntries()),
      item("Copy Roam block reference", () => this.copyRoamReference(false)),
      item("Copy live range reference", () => this.copyRoamReferences()),
      item("Copy cell references as a table", () => this.copyRoamReferenceMatrix()),
      item("Copy table block reference", () => this.copyRoamReference(true)),
      item("Save as grid template…", () => saveModelAsTemplate(this.model)),
      item("Insert saved template after this grid…", () => newFromSavedTemplate()),
      item(this.model.colorFormulaCells ? "Hide formula coloring" : "Color formula cells", () => this.commitMutation("Toggle formula coloring", () => { this.model.colorFormulaCells = !this.model.colorFormulaCells; }, true)),
      item(this.model.showHeaders ? "Hide row/column labels" : "Show row/column labels", () => this.commitMutation("Toggle row and column labels", () => { this.model.showHeaders = !this.model.showHeaders; }, true)),
      item(this.model.fitToWidth ? "Use fixed column widths" : "Fit table to window", () => this.commitMutation("Toggle fit to window", () => { this.model.fitToWidth = !this.model.fitToWidth; }, true)),
      item("Sort ascending", () => this.commitMutation("Sort rows", () => this.model.sortBy(this.selection.startCol, "asc"), true)),
      item("Sort descending", () => this.commitMutation("Sort rows", () => this.model.sortBy(this.selection.startCol, "desc"), true)),
      item("Copy to large grid", () => copyNativeToLarge(this.model))
    );
    menu.__rgDismiss = dismiss;
    tagPortalOwner(menu, gridViewUid(this));
    document.body.appendChild(menu);
    theme = createPortalThemeBridge(this.root, menu);
    const rect = anchor.getBoundingClientRect(); menu.style.left = `${x ?? rect.left}px`; menu.style.top = `${y ?? rect.bottom}px`;
    const close = (event) => { if (!menu.contains(event.target)) dismiss(); };
    later(() => document.addEventListener("pointerdown", close, true));
  }

  openAxisMenu(type, index, anchor) {
    const existing = document.querySelector(".rg-context-menu"); existing?.__rgDismiss?.(); existing?.remove();
    document.querySelectorAll(".rg-axis-grabber.bp3-popover-open").forEach((grip) => grip.classList.remove("bp3-popover-open"));
    anchor.classList.add("bp3-popover-open");
    const menu = document.createElement("ul"); menu.className = "bp3-menu rg-context-menu rg-axis-menu"; menu.dataset.axis = type; menu.dataset.index = String(index);
    let theme = null;
    const timers = new Set();
    const later = (callback, delay = 0) => {
      const timer = setTimeout(() => { timers.delete(timer); if (!closed) callback(); }, delay);
      timers.add(timer); return timer;
    };
    let closed = false;
    const dismiss = () => {
      if (closed) return; closed = true; for (const timer of timers) clearTimeout(timer); timers.clear();
      theme?.dispose(); menu.remove(); anchor.classList.remove("bp3-popover-open");
      document.removeEventListener("pointerdown", closeOutside, true); document.removeEventListener("keydown", closeOnEscape, true);
      if (this.disposed) return;
      this.root.focus?.({ preventScroll: true }); claimKeyboard(this);
    };
    const closeOutside = (event) => { if (!menu.contains(event.target) && event.target !== anchor) dismiss(); };
    const closeOnEscape = (event) => { if (event.key === "Escape") dismiss(); };
    const item = (label, action, { icon = null, className = "", checked = null } = {}) => {
      const wrapper = document.createElement("li");
      const element = document.createElement("button"); element.type = "button"; element.className = `bp3-menu-item ${className}`.trim();
      if (icon) { const iconElement = document.createElement("span"); iconElement.className = `bp3-icon bp3-icon-${icon}`; element.appendChild(iconElement); }
      const text = document.createElement("span"); text.className = "bp3-fill rg-menu-item-label"; text.textContent = label; element.appendChild(text);
      if (checked != null) { const toggle = document.createElement("span"); toggle.className = `rg-menu-switch${checked ? " rg-menu-switch--on" : ""}`; toggle.setAttribute("aria-hidden", "true"); element.appendChild(toggle); }
      element.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); dismiss(); action(); });
      wrapper.appendChild(element); return wrapper;
    };
    const divider = () => { const element = document.createElement("li"); element.className = "bp3-menu-divider"; return element; };
    const section = (label) => { const element = document.createElement("li"); element.className = "rg-menu-section"; element.textContent = label; return element; };
    const entries = (list) => list.map((entry) => entry.section ? section(entry.section) : item(entry.label, entry.action));
    const headerOn = type === "row" ? this.model.isHeaderRow(index) : this.model.isHeaderColumn(index);
    menu.append(section(type === "row" ? `ROW ${index + 1}` : `COLUMN ${columnLabel(index)}`));
    menu.append(item(`Header ${type}`, () => this.toggleAxisHeader(type, index), { checked: headerOn }));
    if (type === "column") {
      menu.append(
        item("Sort ascending", () => this.commitMutation("Sort rows", () => this.model.sortBy(index, "asc"), true), { icon: "sort" }),
        item("Sort descending", () => this.commitMutation("Sort rows", () => this.model.sortBy(index, "desc"), true), { icon: "sort-desc" }),
        item("Insert left", () => this.insertAxis("column", index, false), { icon: "arrow-left" }),
        item("Insert right", () => this.insertAxis("column", index, true), { icon: "arrow-right" })
      );
    } else {
      menu.append(
        item("Insert above", () => this.insertAxis("row", index, false), { icon: "arrow-up" }),
        item("Insert below", () => this.insertAxis("row", index, true), { icon: "arrow-down" })
      );
    }
    menu.append(
      item("Clear contents", () => this.clearAxis(type, index), { icon: "cross" }),
      item(`Delete ${type}`, () => this.deleteAxis(type, index), { icon: "trash", className: "rm-table__delete-col" }),
      divider(), section("ROAM GRID"),
      item("Merge selection", () => this.mergeSelection()), item("Unmerge", () => this.unmergeSelection()),
      item("Insert chart", () => this.insertChart()),
      item("Set selected row height…", () => this.setSelectedRowHeight()),
      item("Compact selected rows", () => this.resizeSelectedRows(getSetting("sizing-compact-row-height"))),
      ...entries(this.rowHeightMenuEntries()),
      item("Set selected column width…", () => this.setSelectedColumnWidth()),
      item("Reset selected column widths", () => this.resizeSelectedColumns(null)),
      item("Align left", () => this.alignSelection("left")),
      item("Align center", () => this.alignSelection("center")),
      item("Align right", () => this.alignSelection("right")),
      item("Reset alignment", () => this.alignSelection(null)),
      ...entries(this.imageLayoutMenuEntries()),
      item("Copy Roam block reference", () => this.copyRoamReference(false)),
      item("Copy live range reference", () => this.copyRoamReferences()),
      item("Copy cell references as a table", () => this.copyRoamReferenceMatrix()),
      item("Copy table block reference", () => this.copyRoamReference(true)),
      item(this.model.colorFormulaCells ? "Hide formula coloring" : "Color formula cells", () => this.commitMutation("Toggle formula coloring", () => { this.model.colorFormulaCells = !this.model.colorFormulaCells; }, true)),
      item(this.model.showHeaders ? "Hide row/column labels" : "Show row/column labels", () => this.commitMutation("Toggle row and column labels", () => { this.model.showHeaders = !this.model.showHeaders; }, true)),
      item(this.model.fitToWidth ? "Use fixed column widths" : "Fit table to window", () => this.commitMutation("Toggle fit to window", () => { this.model.fitToWidth = !this.model.fitToWidth; }, true)),
      item("Copy to large grid", () => copyNativeToLarge(this.model))
    );
    menu.__rgDismiss = dismiss;
    tagPortalOwner(menu, gridViewUid(this));
    document.body.appendChild(menu);
    theme = createPortalThemeBridge(this.root, menu);
    const position = () => {
      if (!menu.isConnected) return;
      const rect = anchor.getBoundingClientRect(); const bounds = menu.getBoundingClientRect();
      const preferredLeft = type === "row" ? rect.right + 6 : rect.left - 18;
      const preferredTop = type === "row" ? rect.top - 6 : rect.bottom + 6;
      menu.style.left = `${clamp(preferredLeft, 8, Math.max(8, innerWidth - bounds.width - 8))}px`;
      menu.style.top = `${clamp(preferredTop, 8, Math.max(8, innerHeight - bounds.height - 8))}px`;
      menu.style.visibility = "visible";
    };
    menu.style.visibility = "hidden"; position();
    later(() => { position(); document.addEventListener("pointerdown", closeOutside, true); document.addEventListener("keydown", closeOnEscape, true); });
    later(position, 80);
  }

  resizeSelectedRows(height) {
    const range = normalizeRange(this.selection);
    return this.commitMutation(height == null ? "Reset row height" : "Resize rows", () => {
      for (let row = range.startRow; row <= range.endRow; row += 1) this.model.setRowHeight(row, height);
    }, true);
  }

  /**
   * One-shot content measurement: the tallest mounted cell in each selected row, content
   * scrollHeight plus its vertical padding, split across the rows of a merge. Persisted clamped
   * through `setRowHeight` — which makes it a single undoable transaction — and a measurement
   * within a pixel of the default deletes the override instead of pinning it. Never reactive:
   * it reads the DOM once, at click time, and rows with no mounted cell are left alone.
   */
  measureSelectedRowHeights() {
    const range = normalizeRange(this.selection);
    const heights = new Map();
    const record = (row, value) => { if (value > 0) heights.set(row, Math.max(heights.get(row) || 0, value)); };
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let col = 0; col < this.model.colCount; col += 1) {
        if (this.model.isCovered(row, col)) continue;
        const cell = this.cells.get(`${row}:${col}`);
        if (!cell) continue;
        const content = cell.querySelector?.(".rg-cell-content") || cell;
        const styles = globalThis.getComputedStyle?.(content);
        const padding = (Number.parseFloat(styles?.paddingTop) || 0) + (Number.parseFloat(styles?.paddingBottom) || 0);
        const span = this.model.mergeAt(row, col)?.rowSpan || 1;
        // A merged cell's content spans N rows: sizing only the origin (with the covered rows left at
        // default) clips a tall image to a fraction of it. Give EACH spanned row its per-row share so
        // the summed spanned height covers the content — including covered rows the outer loop skips. FIX-3.
        const share = Math.ceil(((Number(content.scrollHeight) || 0) + padding) / span);
        for (let target = row; target < row + span; target += 1) record(target, share);
      }
    }
    if (!heights.size) return Promise.resolve(null);
    const measured = [...heights.entries()].sort((a, b) => a[0] - b[0]);
    const defaultHeight = getSetting("sizing-default-row-height");
    return this.commitMutation("Auto-fit rows", () => {
      for (const [row, height] of measured) {
        const clamped = clamp(Math.round(height), getSetting("sizing-min-row-height"), getSetting("sizing-max-row-height"));
        this.model.setRowHeight(row, Math.abs(clamped - defaultHeight) <= 1 ? null : clamped);
      }
    }, true);
  }

  /**
   * The image layout write behind both context menus. A selection covering every row writes the
   * COLUMN layer (keyed by columnId, so it survives row edits); a sub-column range writes one
   * CELL entry per covered uid instead. A null value clears just that field, so resetting the
   * size never takes a chosen fit down with it.
   */
  setSelectionImageLayout(kind, value) {
    const range = normalizeRange(this.selection);
    const wholeColumns = range.startRow === 0 && range.endRow >= this.model.rowCount - 1;
    const menu = kind === "size" ? IMAGE_SIZE_MENU : IMAGE_FIT_MENU;
    const name = value == null ? "Column default" : menu.find(([, token]) => token === value)?.[0];
    return this.commitMutation(`Image ${kind}: ${name}`, () => {
      if (wholeColumns) {
        for (let col = range.startCol; col <= range.endCol; col += 1) {
          const columnId = this.model.columnIds[col];
          if (columnId) this.model.setImageLayoutEntry({ columnId, patch: { [kind]: value ?? undefined } });
        }
        return;
      }
      const seen = new Set();
      for (let row = range.startRow; row <= range.endRow; row += 1) for (let col = range.startCol; col <= range.endCol; col += 1) {
        if (this.model.isCovered(row, col)) continue;
        const uid = this.model.getCell(row, col)?.uid;
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);
        this.model.setImageLayoutEntry({ cellUid: uid, patch: { [kind]: value ?? undefined } });
      }
    }, true);
  }

  /** Menu descriptors for the image groups: section headers carry the scope so the same item
   *  labels read honestly for a column write and a these-cells-only write. */
  imageLayoutMenuEntries() {
    const range = normalizeRange(this.selection);
    const wholeColumns = range.startRow === 0 && range.endRow >= this.model.rowCount - 1;
    const scope = wholeColumns
      ? (range.startCol === range.endCol ? `column ${columnLabel(range.startCol)}` : `columns ${columnLabel(range.startCol)}–${columnLabel(range.endCol)}`)
      : "these cells only";
    const entries = [{ section: `Image size · ${scope}` }];
    for (const [label, size] of IMAGE_SIZE_MENU) entries.push({ label, action: () => this.setSelectionImageLayout("size", size) });
    entries.push({ label: "Column default", action: () => this.setSelectionImageLayout("size", null) });
    entries.push({ section: `Image fit · ${scope}` });
    for (const [label, fit] of IMAGE_FIT_MENU) entries.push({ label, action: () => this.setSelectionImageLayout("fit", fit) });
    return entries;
  }

  /** Menu descriptors for the row-height group: the four presets, the override-clearing reset,
   *  and the one-shot content measurement. */
  rowHeightMenuEntries() {
    const entries = [{ section: "Row height" }];
    for (const [label, height] of ROW_HEIGHT_PRESETS) entries.push({ label: `${label} (${height} px)`, action: () => this.resizeSelectedRows(height) });
    entries.push(
      { label: "Reset row height", action: () => this.resizeSelectedRows(null) },
      { label: "Auto-fit selected rows (measure)", action: () => this.measureSelectedRowHeights() },
    );
    return entries;
  }

  setSelectedRowHeight() {
    const current = this.model.getRowHeight(this.selection.startRow) || getSetting("sizing-default-row-height");
    const value = globalThis.prompt?.(`Row height in pixels (${getSetting("sizing-min-row-height")}–${getSetting("sizing-max-row-height")})`, String(current));
    if (value == null) return;
    const height = Number(value);
    if (!Number.isFinite(height)) return toast("Row height must be a number", "warning");
    return this.resizeSelectedRows(height);
  }

  resizeSelectedColumns(width) {
    const range = normalizeRange(this.selection);
    return this.commitMutation(width == null ? "Auto-fit columns" : "Resize columns", () => {
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        const id = this.model.columnIds[col];
        if (width == null) delete this.model.widths[id];
        else this.model.widths[id] = clamp(Math.round(width), getSetting("sizing-min-col-width"), getSetting("sizing-max-col-width"));
      }
    }, true);
  }

  setSelectedColumnWidth() {
    const id = this.model.columnIds[this.selection.startCol];
    const current = this.model.widths[id] || getSetting("sizing-default-col-width");
    const value = globalThis.prompt?.(`Column width in pixels (${getSetting("sizing-min-col-width")}–${getSetting("sizing-max-col-width")})`, String(current));
    if (value == null) return;
    const width = Number(value);
    if (!Number.isFinite(width)) return toast("Column width must be a number", "warning");
    return this.resizeSelectedColumns(width);
  }

  alignSelection(alignment) {
    const range = normalizeRange(this.selection); const seen = new Set();
    return this.commitMutation(`${alignment ? `Align ${alignment}` : "Reset alignment"}`, () => {
      for (let row = range.startRow; row <= range.endRow; row += 1) for (let col = range.startCol; col <= range.endCol; col += 1) {
        const key = this.model.alignmentKey(row, col); if (!key || seen.has(key)) continue; seen.add(key); this.model.setAlignment(row, col, alignment);
      }
    }, true);
  }

  copyRoamReference(table = false) {
    const uid = table ? this.model.tableUid : this.model.alignmentKey(this.selection.startRow, this.selection.startCol);
    if (!uid) return toast("This cell does not have a Roam block UID yet", "warning");
    const copied = globalThis.navigator?.clipboard?.writeText(`((${uid}))`);
    if (!copied) return toast("Clipboard access is unavailable", "warning");
    copied.then(() => toast(`${table ? "Table" : "Cell"} block reference copied`, "success", 1600)).catch((error) => toast(`Copy failed: ${error.message}`, "danger"));
  }

  copyRoamReferences() {
    let text;
    try { text = formatRangeComponent(this.model, this.selection); }
    catch (error) { return toast(error.message, "warning"); }
    const copied = globalThis.navigator?.clipboard?.writeText(text);
    if (!copied) return toast("Clipboard access is unavailable", "warning");
    const range = normalizeRange(this.selection);
    const rows = range.endRow - range.startRow + 1; const cols = range.endCol - range.startCol + 1;
    copied.then(() => toast(`Live ${rows} × ${cols} range reference copied`, "success", 1800)).catch((error) => toast(`Copy failed: ${error.message}`, "danger"));
  }

  copyRoamReferenceMatrix() {
    let text;
    try { text = selectionBlockReferenceText(this.model, this.selection); }
    catch (error) { return toast(error.message, "warning"); }
    const copied = globalThis.navigator?.clipboard?.writeText(text);
    if (!copied) return toast("Clipboard access is unavailable", "warning");
    const range = normalizeRange(this.selection);
    const rows = range.endRow - range.startRow + 1; const cols = range.endCol - range.startCol + 1;
    copied.then(() => toast(`${rows} × ${cols} live cell references copied`, "success", 1800)).catch((error) => toast(`Copy failed: ${error.message}`, "danger"));
  }

  /** The one funnel every view-level mutation goes through. A preview mount shares the source
   *  table's session, so an ungated write here overwrites real blocks from a tooltip. Gated here
   *  rather than in `NativeGridSession.commitMutation`, which also serves `sourceView = null`
   *  conflict recovery and inbound external patches. */
  commitMutation(label, mutation, structural, { rowDeletion = false } = {}) {
    if (this.surface === "preview") return Promise.resolve(null);
    return this.session.commitMutation(this, label, mutation, structural, { rowDeletion });
  }

  refreshValues() {
    const changedCells = this.model.lastChangedCells || [];
    if (!changedCells.length) return;
    const engine = this.formulaEngine || (this.formulaEngine = new FormulaEngine(this.model, runtime.registries.formulaFunctions, runtime.registries.formulaFunctionMetadata));
    const affected = new Set();
    for (const [row, col] of changedCells) for (const key of engine.invalidateCell(row, col)) affected.add(key);
    for (const key of affected) {
      const cell = this.cells.get(key); if (!cell) continue;
      const [row, col] = key.split(":").map(Number);
      this.renderCellValue(cell, row, col, engine);
    }
  }

  /** Re-evaluates the tint mask on mounted cells only. `refreshValues` cannot do this: it
   *  short-circuits when no cell changed, and a settings flip changes no cell. */
  refreshFormulaTint() {
    return repaintFormulaTint(this.cells, this.model?.colorFormulaCells);
  }

  /** Re-derives media classes, the height cap, and chips on mounted cells from the live settings —
   *  the same in-place repaint contract as the tint mask, so a settings flip costs no re-render. */
  refreshMediaDecor() {
    return repaintMediaDecor(this.cells, this.model);
  }

  /** Sets the image-click arming flag from the selection AS IT STANDS before this pointerdown; the
   *  gesture only opens the lightbox when the pointed cell was already the sole-selected one. */
  armImageClick(row, col, event) {
    const sel = this.selection;
    const sole = sel.startRow === sel.endRow && sel.startCol === sel.endCol && sel.startRow === row && sel.startCol === col;
    this.imageClickArmed = sole && Boolean(event.target?.closest?.("img")) && !event.shiftKey;
    this.imageClickDragged = false;
  }

  /** Consumes the arming flag on click: an armed click on a rendered `<img>` opens the lightbox at
   *  that image; a click on the "+n hidden" clip chip opens at the cell's first image. Always resets
   *  the flag so a stale arm can never fire on a later plain click. */
  handleCellImageClick(cell, event) {
    const armed = this.imageClickArmed; this.imageClickArmed = false;
    if (armed && !this.imageClickDragged && event.target?.closest?.("img") && event.target?.closest?.(".rg-rich-host")) {
      const images = [...cell.querySelectorAll("img")];
      this.openCellImageLightbox(Number(cell.dataset.row), Number(cell.dataset.col), Math.max(0, images.indexOf(event.target.closest("img"))));
      return true;
    }
    if (event.target?.closest?.(".rg-img-clip-chip")) {
      this.openCellImageLightbox(Number(cell.dataset.row), Number(cell.dataset.col), 0);
      return true;
    }
    return false;
  }

  /** Opens the lightbox over the whole column, starting at (row, imageIndex). No-ops when the target
   *  cell has no image so Shift+Space over an image-free cell opens nothing. */
  openCellImageLightbox(row, col, imageIndex = 0) {
    const entries = buildColumnImageEntries(this.model, col);
    const startIndex = imageEntryStartIndex(entries, row, imageIndex);
    if (startIndex < 0) return null;
    return openImageLightbox({
      ownerRoot: this.root,
      entries,
      startIndex,
      onDelete: ({ entry, raw }) => {
        // Re-resolve the cell by its uid so a concurrent external row insert/reorder while the modal
        // was open can't send the delete to a shifted (row, col). Falls back to the captured
        // coordinate when the uid is gone (a correct-looking cell, never a wrong write). FIX-6.
        const coord = (entry.uid && this.adapter?.coordinateForUid?.(entry.uid)) || { row: entry.row, col: entry.col };
        return this.commitMutation("Remove image", (model) => model.setRaw(coord.row, coord.col, raw), false);
      },
    });
  }

  /** The single source of effective header visibility for every layout read site in this class. */
  headersOn() {
    return headersVisible(this.model?.showHeaders);
  }

  /** Headers are grid tracks and DOM nodes, not a class on an existing cell, so the mask can only be
   *  re-applied by a full render — unlike the tint mask, which repaints in place. */
  refreshHeaders() {
    return this.render();
  }

  applyPatch(patch) {
    return this.session.applyPatch(patch, this);
  }

  dispose({ releaseNative = true } = {}) {
    this.setCommentArmed(false);
    this.disposed = true; this.resizeCleanup?.(); if (!this.session) this.adapter.dispose?.();
    this.nativeOverlay?.dispose(); this.nativeOverlay = null;
    this.editorController?.dispose(); this.editorController = null;
    this.closeInlineReferences();
    this.clearSelectionPresentation();
    releaseKeyboard(this);
    document.removeEventListener("pointerup", this.boundPointerUp, true); releaseRichCellHosts(this.root); this.root.remove();
    this.themeBridge?.dispose?.(); this.themeBridge = null;
    this.session?.removeView(this);
    if (releaseNative) this.nativeElement?.classList.remove("rg-native-hidden", "rg-native-pending");
  }
}

/**
 * Bounds the rectangle a range paints.  Whole rows are dropped first so the excerpt keeps the full
 * column shape of the source; a range wider than the cap falls back to one clipped row.  `rendered`
 * counts coordinates, not mounted nodes — a merge inside the rectangle mounts one node for several
 * coordinates, and the cap exists to bound the work, not to guarantee a node count.
 */
export function rangeRenderPlan(range, cap = getSetting("ranges-max-rendered-cells")) {
  const limit = Math.max(1, Math.round(Number(cap) || DEFAULT_RANGE_RENDERED_CELLS));
  const rows = range.endRow - range.startRow + 1; const cols = range.endCol - range.startCol + 1;
  const total = rows * cols;
  if (total <= limit) return { range, total, rendered: total, truncated: false };
  const width = Math.min(cols, limit);
  const height = Math.max(1, Math.floor(limit / width));
  return {
    range: { ...range, endRow: range.startRow + height - 1, endCol: range.startCol + width - 1 },
    total, rendered: width * height, truncated: true,
  };
}

/**
 * Read-only renderer for `{{roam-grid-range: ((uid)) B2:D5}}`.  Deliberately NOT a `GridView`
 * subclass: subclassing would drag in the editor controller, selection, drag-fill, paste, and the
 * window keydown listener, none of which may exist on a surface that never writes.  It attaches to
 * the source table's existing `NativeGridSession`, so live repaint arrives through the session's
 * ordinary `refreshValues` / `renderStructural` fan-out.  It never writes, so it can never generate
 * an echo, and it must never become `session.activeEditorView`.
 */
export class RangeGridView {
  constructor({ host, session, range, label = null, nativeElement = null, surface = "main" }) {
    this.host = host;
    this.session = session;
    this.model = session.model;
    this.adapter = session.adapter;
    this.nativeElement = nativeElement;
    this.context = "range";
    this.surface = surface;
    this.range = normalizeRange(range);
    this.label = label || rangeLabel(this.range);
    this.cells = new Map();
    this.cellCoordinatesByUid = new Map();
    this.disposed = false;
    this.formulaEngine = null;
    this.gridElement = null;
    this.viewport = null;
    this.referenceCounts = session?.referenceCounts || new Map();
    this.commentThreads = session?.commentThreads || new Map();
    this.root = document.createElement("section");
    this.root.className = "rg-root rg-range";
    this.root.classList.toggle("rg-range--preview", surface === "preview");
    this.root.dataset.rgContext = "range";
    this.root.dataset.rgSurface = surface;
    this.root.tabIndex = -1;
    this.root.__rgView = this;
    this.boundClick = (event) => this.onClick(event);
    const themeSignature = gridThemeSignature(this.nativeElement);
    const cachedTheme = runtime.gridThemeSignature === themeSignature ? (this.session?.themePalette || runtime.gridThemePalette) : null;
    if (cachedTheme) applyGridThemeValues(this.root, cachedTheme);
    else {
      const initialTheme = syncGridThemeFromHost(this.nativeElement, this.root);
      runtime.gridThemePalette = initialTheme.values;
      runtime.gridThemeSignature = themeSignature;
      if (this.session) this.session.themePalette = initialTheme.values;
    }
    this.themeBridge = createGridThemeBridge(this.nativeElement, this.root, {
      initialSync: false,
      onSync: (result) => {
        runtime.gridThemePalette = result.values;
        runtime.gridThemeSignature = gridThemeSignature(this.nativeElement);
        if (this.session) this.session.themePalette = result.values;
      },
    });
    this.session?.addView(this);
    this.mount();
  }

  mount() {
    applyToolbarPreset(this.root); applyGridMaxWidth(this.root);
    this.host.appendChild(this.root);
    this.root.addEventListener("click", this.boundClick);
    this.render();
  }

  /** The source grid can shrink under a saved reference; clamp instead of rendering holes. */
  clampedRange() {
    const rowCount = this.model.rowCount; const colCount = this.model.colCount;
    return {
      startRow: clamp(this.range.startRow, 0, Math.max(0, rowCount - 1)),
      endRow: clamp(this.range.endRow, 0, Math.max(0, rowCount - 1)),
      startCol: clamp(this.range.startCol, 0, Math.max(0, colCount - 1)),
      endCol: clamp(this.range.endCol, 0, Math.max(0, colCount - 1)),
    };
  }

  caption() {
    const caption = document.createElement("div"); caption.className = "rg-range-caption";
    const text = document.createElement("span"); text.className = "rg-range-label"; text.textContent = this.label;
    const truncated = document.createElement("span"); truncated.className = "rg-range-truncated";
    truncated.title = "Raise Ranges — Maximum cells in a rendered range to show more.";
    const source = document.createElement("span"); source.className = "rg-range-source"; source.textContent = "↗";
    source.title = "Open the source table block"; source.setAttribute("role", "button");
    caption.append(text, truncated, source);
    this.captionElement = caption; this.captionLabel = text; this.captionTruncated = truncated;
    return caption;
  }

  rangeCell(row, col, range) {
    const cell = document.createElement("div");
    cell.className = "rg-cell rg-range-cell"; cell.tabIndex = -1;
    this.positionRangeCell(cell, row, col, range);
    return cell;
  }

  positionRangeCell(cell, row, col, range) {
    const merge = this.model.mergeAt(row, col);
    const rowSpan = Math.min(merge?.rowSpan || 1, range.endRow - row + 1);
    const colSpan = Math.min(merge?.colSpan || 1, range.endCol - col + 1);
    cell.dataset.uid = this.model.getCell(row, col)?.uid || "";
    cell.dataset.row = String(row); cell.dataset.col = String(col);
    cell.classList.toggle("rg-cell--merged", Boolean(merge));
    cell.classList.toggle("rg-cell--header", this.model.isHeaderRow(row) || this.model.isHeaderColumn(col));
    cell.classList.remove("rg-cell--align-left", "rg-cell--align-center", "rg-cell--align-right");
    const alignment = this.model.getAlignment(row, col);
    if (alignment) cell.classList.add(`rg-cell--align-${alignment}`);
    cell.style.gridRow = `${row - range.startRow + 1} / span ${rowSpan}`;
    cell.style.gridColumn = `${col - range.startCol + 1} / span ${colSpan}`;
  }

  renderRangeCellValue(cell, row, col, engine) {
    const raw = this.model.getRaw(row, col); const value = engine.evaluateCell(row, col);
    const formula = raw.startsWith("=") && !raw.startsWith("==");
    const content = ensureCellContent(cell);
    cell.dataset.rgRaw = raw;
    cell.classList.toggle("rg-cell--formula", formula && formulaTintEnabled(this.model.colorFormulaCells));
    cell.classList.toggle("rg-cell--error", formula && String(value).startsWith("#"));
    const changed = renderStableCellContent(content, { raw, value, formula, renderRich: paintRichCellContent });
    applyCellImageLayout(cell, this.model, row, col);
    return changed;
  }

  render() {
    if (this.disposed) return;
    if (!this.captionElement) this.root.appendChild(this.caption());
    else if (this.captionLabel.textContent !== this.label) this.captionLabel.textContent = this.label;
    const viewport = this.viewport || (() => {
      const element = document.createElement("div"); element.className = "rg-viewport rg-range-viewport"; this.root.appendChild(element); this.viewport = element; return element;
    })();
    const grid = this.gridElement || (() => {
      const element = document.createElement("div"); element.className = "rg-grid rg-grid--clean rg-range-grid"; viewport.appendChild(element); this.gridElement = element; return element;
    })();
    const plan = rangeRenderPlan(this.clampedRange());
    const range = plan.range;
    // Written only on change, so a repeat render of an unchanged excerpt still writes no text.
    const note = plan.truncated ? `showing first ${plan.rendered} of ${plan.total} cells` : "";
    if (this.captionTruncated.textContent !== note) this.captionTruncated.textContent = note;
    grid.style.width = "max-content";
    grid.style.gridTemplateColumns = gridTrackTemplate(this.model, "col", range.startCol, range.endCol);
    grid.style.gridTemplateRows = gridTrackTemplate(this.model, "row", range.startRow, range.endRow);
    const engine = this.formulaEngine = new FormulaEngine(this.model, runtime.registries?.formulaFunctions, runtime.registries?.formulaFunctionMetadata);
    const next = new Map(); const coordinates = new Map();
    for (let row = range.startRow; row <= range.endRow && this.model.rowCount && this.model.colCount; row += 1) {
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        if (this.model.isCovered(row, col)) continue;
        const key = `${row}:${col}`;
        // Reusing the mounted node is what makes a repeat render a no-op: `renderStableCellContent`
        // short-circuits on the unchanged render key, so nothing writes `textContent`.
        const cell = this.cells.get(key) || this.rangeCell(row, col, range);
        if (this.cells.has(key)) this.positionRangeCell(cell, row, col, range); else grid.appendChild(cell);
        this.renderRangeCellValue(cell, row, col, engine);
        next.set(key, cell);
        const uid = this.model.getCell(row, col)?.uid;
        if (uid) coordinates.set(uid, { row, col });
      }
    }
    for (const [key, cell] of this.cells) if (next.get(key) !== cell) { releaseRichCellHosts(cell); cell.remove(); }
    this.cells = next; this.cellCoordinatesByUid = coordinates;
  }

  refreshValues() {
    if (this.disposed) return;
    const changedCells = this.model.lastChangedCells || [];
    if (!changedCells.length) return;
    const engine = this.formulaEngine || (this.formulaEngine = new FormulaEngine(this.model, runtime.registries?.formulaFunctions, runtime.registries?.formulaFunctionMetadata));
    const affected = new Set();
    for (const [row, col] of changedCells) for (const key of engine.invalidateCell(row, col)) affected.add(key);
    for (const key of affected) {
      const cell = this.cells.get(key); if (!cell) continue;
      const [row, col] = key.split(":").map(Number);
      this.renderRangeCellValue(cell, row, col, engine);
    }
  }

  refreshFormulaTint() {
    return repaintFormulaTint(this.cells, this.model?.colorFormulaCells);
  }

  /** Same in-place media repaint as the full grid; a range excerpt holds the same `row:col` cell
   *  map, so the shared walk just works. */
  refreshMediaDecor() {
    return repaintMediaDecor(this.cells, this.model);
  }

  /** A range excerpt is always `rg-grid--clean` and paints no axis gutters, so the header mask has
   *  nothing to re-apply here. Declared so the propagation walk does not re-render every excerpt on
   *  the page for a setting they cannot show. */
  refreshHeaders() { return false; }

  /** Row-deletion patching is a `GridView` optimisation; a range excerpt simply re-renders. */
  patchRowDeletion() { return false; }

  captureRowDeletionContext() { return null; }

  /** A read-only excerpt owns no badge chrome — reference and comment counts live on the source
   *  grid.  This exists because the session fans out to it unconditionally. */
  updateReferenceCountBadges() { return false; }

  onClick(event) {
    if (event.target?.closest?.(".rg-range-source")) return openRoamBlock(this.model.tableUid, "table");
    const cell = event.target?.closest?.(".rg-cell");
    if (!cell) return null;
    // An image (or the clip chip) opens the lightbox over the excerpt's column; anything else keeps
    // the excerpt's navigate-to-source behavior. A range is a read-only view, so no delete affordance.
    const clickedImg = event.target?.closest?.(".rg-rich-host") ? event.target?.closest?.("img") : null;
    if (clickedImg || event.target?.closest?.(".rg-img-clip-chip")) {
      const opened = this.openRangeCellImageLightbox(cell, clickedImg);
      if (opened) return opened;
    }
    return openRoamBlock(cell.dataset?.uid, "cell");
  }

  /** Opens the lightbox over the excerpt's rendered rows in the clicked cell's column. Entries are
   *  bounded to the clamped range (an excerpt shows only part of the source table). */
  openRangeCellImageLightbox(cell, clickedImg) {
    const row = Number(cell.dataset.row); const col = Number(cell.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
    const range = this.clampedRange();
    const entries = buildColumnImageEntries(this.model, col, { startRow: range.startRow, endRow: range.endRow });
    let imageIndex = 0;
    if (clickedImg) { const images = [...cell.querySelectorAll("img")]; imageIndex = Math.max(0, images.indexOf(clickedImg)); }
    const startIndex = imageEntryStartIndex(entries, row, imageIndex);
    if (startIndex < 0) return null;
    return openImageLightbox({ ownerRoot: this.root, entries, startIndex });
  }

  dispose({ releaseNative = true } = {}) {
    this.disposed = true;
    this.root.removeEventListener("click", this.boundClick);
    // Defensive: `claimKeyboard` already refuses a view with no `onKeydown`, but disposal must not
    // be the thing that decides whether a stale owner survives.
    releaseKeyboard(this);
    releaseRichCellHosts(this.root);
    this.root.remove();
    this.themeBridge?.dispose?.(); this.themeBridge = null;
    this.cells.clear(); this.cellCoordinatesByUid.clear();
    this.session?.removeView(this);
    this.host?.classList?.remove?.("rg-range-host");
    // Only a real component button has a raw Roam render to restore; on a text host the class
    // would be stray — the pre-paint rule never matches a plain block div.
    if (releaseNative && this.nativeElement?.matches?.(RANGE_BUTTON_SELECTOR)) this.nativeElement.classList.add("rg-range-restored");
  }
}

function openRoamBlock(uid, kind = "block") {
  if (!uid || String(uid).startsWith("rg_")) return toast(`This ${kind} does not have a source block UID`, "warning");
  try {
    const result = roam().ui?.mainWindow?.openBlock?.({ block: { uid } });
    if (result?.catch) result.catch((error) => toast(`Could not open source: ${error.message}`, "danger"));
    return result;
  } catch (error) { return toast(`Could not open source: ${error.message}`, "danger"); }
}

export class AsyncFormulaEngine {
  constructor(store, functions = defaultFormulaFunctions(), metadata = defaultFormulaFunctionMetadata()) {
    this.store = store;
    this.functions = functions;
    this.cache = new Map();
    this.generations = new Map();
    this.dependencyCache = new FormulaDependencyCache(metadata);
    this.parsedFormulas = this.dependencyCache.parsedFormulas;
    this.reverseDependencies = this.dependencyCache.reverseDependencies;
  }

  generation(key) { return this.generations.get(key) || 0; }

  invalidateCell(row, col) {
    const key = `${row}:${col}`;
    const affected = this.dependencyCache.affectedFrom(key);
    for (const affectedKey of affected) {
      this.generations.set(affectedKey, this.generation(affectedKey) + 1);
      this.cache.delete(affectedKey);
    }
    this.dependencyCache.forgetFormula(key);
    return affected;
  }

  async evaluateCell(row, col, path = new Set()) {
    const key = `${row}:${col}`;
    if (path.has(key)) return "#CYCLE!";
    const raw = await this.store.getRaw(row, col);
    if (typeof raw !== "string" || !raw.startsWith("=") || raw.startsWith("==")) {
      if (this.parsedFormulas.has(key)) { this.dependencyCache.forgetFormula(key); this.cache.delete(key); }
      return raw;
    }
    const previousRaw = this.parsedFormulas.get(key)?.raw;
    const parsed = this.dependencyCache.formula(key, raw);
    if (previousRaw != null && previousRaw !== raw) this.cache.delete(key);
    if (this.cache.has(key)) {
      const cached = this.cache.get(key); const pending = cached && typeof cached.then === "function";
      if (!pending || path.size === 0) return await cached;
    }
    if (raw.includes("#REF!")) return "#REF!";
    const generation = this.generation(key);
    const nextPath = new Set(path); nextPath.add(key);
    const calculation = (async () => {
      try {
        if (parsed.error) throw parsed.error;
        const result = await this.evaluateNode(parsed.ast, key, nextPath, generation);
        return typeof result === "number" && !Number.isFinite(result) ? "#NUM!" : result;
      } catch (error) {
        return error?.code === "FORMULA_NAME" ? "#NAME?" : error?.code === "FORMULA_REF" ? "#REF!" : "#VALUE!";
      }
    })();
    const ownsCache = !this.cache.has(key);
    if (ownsCache) this.cache.set(key, calculation);
    const result = await calculation;
    if (ownsCache && this.generation(key) === generation && this.cache.get(key) === calculation) this.cache.set(key, result);
    else if (ownsCache && this.cache.get(key) === calculation) this.cache.delete(key);
    return result;
  }

  registerDependency(ownerKey, sourceKey, ownerGeneration) {
    if (this.generation(ownerKey) === ownerGeneration) this.dependencyCache.register(ownerKey, sourceKey);
  }

  async evaluateNode(node, ownerKey, path, ownerGeneration) {
    if (node.type === "literal") return node.value;
    if (node.type === "ref") {
      const ref = parseCellReference(node.value);
      if (!ref || ref.row >= this.store.manifest.rowCount || ref.col >= this.store.manifest.colCount) throw new GridError("FORMULA_REF", "Invalid reference");
      this.registerDependency(ownerKey, `${ref.row}:${ref.col}`, ownerGeneration);
      return this.evaluateCell(ref.row, ref.col, path);
    }
    if (node.type === "range") {
      const start = parseCellReference(node.start); const end = parseCellReference(node.end);
      if (!start || !end) throw new GridError("FORMULA_REF", "Invalid range");
      const range = normalizeRange({ startRow: start.row, endRow: end.row, startCol: start.col, endCol: end.col }); const values = [];
      for (let row = range.startRow; row <= range.endRow; row += 1) {
        const line = [];
        for (let col = range.startCol; col <= range.endCol; col += 1) {
          if (row >= this.store.manifest.rowCount || col >= this.store.manifest.colCount) throw new GridError("FORMULA_REF", "Invalid range");
          this.registerDependency(ownerKey, `${row}:${col}`, ownerGeneration);
          line.push(await this.evaluateCell(row, col, path));
        }
        values.push(line);
      }
      return values;
    }
    if (node.type === "unary") { const value = await this.evaluateNode(node.value, ownerKey, path, ownerGeneration); return node.op === "-" ? -numeric(value) : numeric(value); }
    if (node.type === "binary") {
      const left = await this.evaluateNode(node.left, ownerKey, path, ownerGeneration); const right = await this.evaluateNode(node.right, ownerKey, path, ownerGeneration);
      return ({ "+": () => numeric(left) + numeric(right), "-": () => numeric(left) - numeric(right), "*": () => numeric(left) * numeric(right), "/": () => numeric(right) === 0 ? "#DIV/0!" : numeric(left) / numeric(right), "%": () => numeric(left) % numeric(right), "^": () => numeric(left) ** numeric(right), "&": () => `${left ?? ""}${right ?? ""}`, "=": () => left === right, "==": () => left === right, "!=": () => left !== right, "<>": () => left !== right, "<": () => left < right, ">": () => left > right, "<=": () => left <= right, ">=": () => left >= right })[node.op]?.() ?? "#VALUE!";
    }
    if (node.type === "call") {
      const fn = this.functions.get(node.name); if (!fn) throw new GridError("FORMULA_NAME", `Unknown function ${node.name}`);
      const args = []; for (const argument of node.args) args.push(await this.evaluateNode(argument, ownerKey, path, ownerGeneration));
      return fn(...args);
    }
    throw new GridError("FORMULA_PARSE", "Unknown expression");
  }
}

export class LargeGridView {
  constructor({ host, store, markerElement = null }) {
    this.host = host; this.store = store; this.markerElement = markerElement; this.model = null;
    this.selection = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }; this.anchor = { row: 0, col: 0 };
    this.root = document.createElement("section"); this.root.className = "rg-root rg-large-root"; this.root.tabIndex = 0;
    this.cells = new Map(); this.cellValueTokens = new WeakMap(); this.editorController = null; this.nativeOverlay = null; this.editingPending = false;
    this.formulaEngine = new AsyncFormulaEngine(this.store, runtime.registries.formulaFunctions, runtime.registries.formulaFunctionMetadata);
    this.saveTimer = null; this.renderToken = 0; this.dragSelecting = false; this.dragOrigin = null; this.boundUp = () => { this.dragSelecting = false; this.dragOrigin = null; };
    this.metricsRows = []; this.metricsExtra = new Float64Array(1); this.metricsDefaultHeight = 0;
    this.rowMetricsKey = null; this.rowResizePreview = null; this.columnResizePreview = null; this.resizeCleanup = null;
    this.disposed = false; this.root.__rgView = this;
    this.mount();
  }
  mount() {
    this.markerElement?.classList.add("rg-large-marker-hidden");
    const markerButton = this.markerElement?.querySelector?.(".rm-xparser-default-grid") || this.markerElement?.querySelector?.("[data-tag='roam/grid']");
    markerButton?.classList.add("rg-large-marker-hidden");
    applyToolbarPreset(this.root); applyGridMaxWidth(this.root);
    const pinnedTheme = pinnedGridThemePalette(); if (pinnedTheme) applyGridThemeValues(this.root, pinnedTheme);
    this.host.appendChild(this.root);
    const toolbar = document.createElement("div"); toolbar.className = "rg-toolbar";
    toolbar.append(button("↶", "Undo (⌘Z)", () => { void this.undo(); }, "rg-toolbar-primary"), button("↷", "Redo (⌘⇧Z)", () => { void this.redo(); }, "rg-toolbar-primary"), button("Merge", "Safely merge selection", () => this.merge()), button("Unmerge", "Unmerge selection", () => this.unmerge()), button("⇤", "Align selection left", () => this.alignSelection("left")), button("≡", "Center selection", () => this.alignSelection("center")), button("⇥", "Align selection right", () => this.alignSelection("right")), button("fx", "Show or hide formula-cell coloring", () => this.toggleFormulaColors()), button("Labels", "Show or hide row and column labels", () => this.toggleHeaders()), button("Layout", "Row height and image size/fit for the selection", (event) => this.openLayoutMenu(event.currentTarget)), button("Save", "Commit dirty chunks", () => this.flush()), button("Export", "Export visible selection", () => this.exportSelection()), button("Native copy", "Copy to a native table when within the write budget", () => copyLargeToNative(this.store)));
    this.status = document.createElement("span"); this.status.className = "rg-status";
    // Large-grid cells are JSON rows in a chunk file, not Roam blocks, so there is nothing for a
    // native comment thread to anchor to.  There is deliberately no alternate comment store.
    this.status.title = "Cell comments need real Roam blocks. Large-grid cells are JSON rows — use “Native copy” first.";
    toolbar.appendChild(this.status);
    this.viewport = document.createElement("div"); this.viewport.className = "rg-large-viewport";
    this.canvas = document.createElement("div"); this.canvas.className = "rg-large-canvas"; this.viewport.appendChild(this.canvas);
    this.root.append(toolbar, this.viewport); this.root.addEventListener("paste", (event) => this.onPaste(event));
    // LP-8: the viewport claims Files drags so a drop between mounted cells still lands; a drop on
    // a mounted cell is owned by that cell's own handler (the bubble is ignored here).
    this.viewport.addEventListener("dragover", (event) => { if (event.dataTransfer?.types?.includes?.("Files")) event.preventDefault(); });
    this.viewport.addEventListener("drop", (event) => {
      if (event.target?.closest?.(".rg-cell")) return;
      const images = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith("image/"));
      if (!images.length) return;
      event.preventDefault();
      const { row, col } = this.dropCellAt(event.clientX, event.clientY);
      void this.dropImageFiles(images, row, col);
    });
    this.editorController = new GridEditorController(this, {
      viewport: this.viewport,
      dimensions: () => ({ rowCount: this.store.manifest.rowCount, colCount: this.store.manifest.colCount }),
      cellAt: (row, col) => {
        const merge = this.store.mergeAt(row, col);
        return this.cells.get(`${merge?.row ?? row}:${merge?.col ?? col}`) || null;
      },
      mountedCells: () => this.cells.values(),
      cellRange: (cell) => {
        const row = Number(cell.dataset.row); const col = Number(cell.dataset.col); const merge = this.store.mergeAt(row, col);
        return { startRow: row, endRow: row + (merge?.rowSpan || 1) - 1, startCol: col, endCol: col + (merge?.colSpan || 1) - 1 };
      },
      navigateReference: (base, movement, dimensions) => moveFormulaReferenceCoordinate(base, movement, dimensions, (row, col) => this.store.mergeAt(row, col)),
      revealReference: (row, col) => {
        this.ensureVisible(row, col);
        this.scheduleRender();
      },
      onFinish: (result) => this.largeEditorOnFinish(result),
    });
    this.nativeOverlay = new NativeCellEditorOverlay(this, {
      onFinish: async (result) => {
        let { value, commit } = result;
        if (commit) {
          const strays = scratchStrayConcat();
          if (strays != null) {
            const base = String(value ?? "").trim() || null;
            const parts = [...(base ? [base] : []), ...strays.split("\n")].map((s) => s.trim()).filter(Boolean);
            if (parts.length) value = parts.join(" ");
          }
        }
        await this.largeEditorOnFinish({ ...result, value });
        await blankLargeScratch();
      },
      mountIsolation: true,
      seedThroughTextarea: true,
    });
    this.viewport.addEventListener("scroll", () => this.scheduleRender()); document.addEventListener("pointerup", this.boundUp, true); this.scheduleRender();
  }
  async largeEditorOnFinish({ row, col, value, commit, movement }) {
    const previous = await this.store.getRaw(row, col);
    let affected = new Set([`${row}:${col}`]);
    if (commit && value !== previous) {
      this.recordLargeEdit("Edit cell", await this.store.setCell(row, col, value));
      affected = this.formulaEngine.invalidateCell(row, col);
      this.scheduleSave();
    }
    await this.repaintLargeCells(affected);
    if (movement) this.moveLargeSelection(...movement);
    this.root.focus({ preventScroll: true }); claimKeyboard(this);
  }
  /** Same live global mask as a native grid: the manifest flag is never rewritten, so the per-table
   *  “Labels” button keeps its meaning and the global is instantly reversible. */
  headersOn() { return headersVisible(this.store.manifest.showHeaders); }
  headerWidth() { return this.headersOn() ? 42 : 0; }
  headerHeight() { return this.headersOn() ? 28 : 0; }
  columnWidth(col) { const id = this.store.manifest.columnIds[col]; return this.columnResizePreview?.col === col ? this.columnResizePreview.width : this.store.manifest.widths[id] || getSetting("sizing-default-col-width"); }
  totalWidth() { return this.headerWidth() + this.store.manifest.columnIds.reduce((sum, _id, col) => sum + this.columnWidth(col), 0); }
  colLeft(col) { let left = this.headerWidth(); for (let index = 0; index < col; index += 1) left += this.columnWidth(index); return left; }
  /**
   * The key carries `store.metricsVersion`, which every height write bumps — without it a resized
   * row kept the offsets computed before the resize until the row count happened to change. The
   * prefix sum is sparse: rows are the default height unless the manifest says otherwise, so a
   * 100k-row grid costs one entry per override instead of an 800 KB `Float64Array`.
   */
  rebuildRowMetrics() {
    const preview = this.rowResizePreview ? `${this.rowResizePreview.row}:${this.rowResizePreview.height}` : "";
    const key = `${this.store.manifest.rowCount}:${this.store.metricsVersion}:${preview}`;
    if (key === this.rowMetricsKey) return;
    const heights = new Map();
    for (const [key2, value] of Object.entries(this.store.rowHeightIndexMap())) {
      const row = Number(key2);
      if (Number.isInteger(row) && row >= 0 && row < this.store.manifest.rowCount) heights.set(row, this.store.rowHeight(row));
    }
    if (this.rowResizePreview && this.rowResizePreview.row < this.store.manifest.rowCount) heights.set(this.rowResizePreview.row, this.rowResizePreview.height);
    const overrides = [...heights].sort((a, b) => a[0] - b[0]);
    this.metricsDefaultHeight = getSetting("sizing-default-row-height");
    this.metricsRows = overrides.map(([row]) => row);
    this.metricsExtra = new Float64Array(overrides.length + 1);
    overrides.forEach(([, height], index) => { this.metricsExtra[index + 1] = this.metricsExtra[index] + (height - this.metricsDefaultHeight); });
    this.rowMetricsKey = key;
  }
  rowOffset(row) {
    this.rebuildRowMetrics();
    const target = clamp(row, 0, this.store.manifest.rowCount);
    let low = 0; let high = this.metricsRows.length;
    while (low < high) { const middle = Math.floor((low + high) / 2); if (this.metricsRows[middle] < target) low = middle + 1; else high = middle; }
    return target * this.metricsDefaultHeight + this.metricsExtra[low];
  }
  rowTop(row) { return this.headerHeight() + this.rowOffset(row); }
  rowSpanHeight(row, span = 1) { return this.rowOffset(Math.min(this.store.manifest.rowCount, row + span)) - this.rowOffset(row); }
  rowAtOffset(offset) {
    this.rebuildRowMetrics(); const target = Math.max(0, offset - this.headerHeight()); let low = 0; let high = this.store.manifest.rowCount;
    while (low < high) { const middle = Math.floor((low + high) / 2); if (this.rowOffset(middle + 1) <= target) low = middle + 1; else high = middle; }
    return clamp(low, 0, Math.max(0, this.store.manifest.rowCount - 1));
  }
  scheduleRender() {
    const token = ++this.renderToken;
    requestAnimationFrame(() => {
      if (this.disposed || token !== this.renderToken) return;
      void this.renderVisible(token).catch((error) => toast(`Large grid render failed: ${error.message}`, "danger", 8000));
    });
  }
  async renderVisible(token = this.renderToken) {
    if (this.disposed || this.editingPending || (this.editorController?.state && !this.editorController.state.floating) || this.nativeOverlay?.active) return;
    const { rowCount, colCount } = this.store.manifest; this.status.textContent = `${rowCount.toLocaleString()} × ${colCount}`;
    const headerHeight = this.headerHeight(); const headerWidth = this.headerWidth();
    this.rebuildRowMetrics(); this.canvas.style.width = `${this.totalWidth()}px`; this.canvas.style.height = `${headerHeight + this.rowOffset(rowCount)}px`;
    const overscan = Math.max(0, Math.round(Number(getSetting("large-overscan-rows"))) || 0);
    const startRow = clamp(this.rowAtOffset(this.viewport.scrollTop) - overscan, 0, Math.max(0, rowCount - 1));
    const endRow = clamp(this.rowAtOffset(this.viewport.scrollTop + this.viewport.clientHeight) + overscan + 1, 0, rowCount);
    let startCol = 0; let x = headerWidth; while (startCol < colCount && x + this.columnWidth(startCol) < this.viewport.scrollLeft) x += this.columnWidth(startCol++);
    let endCol = startCol; let visibleWidth = x; while (endCol < colCount && visibleWidth < this.viewport.scrollLeft + this.viewport.clientWidth + getSetting("sizing-default-col-width") * 2) visibleWidth += this.columnWidth(endCol++);
    startCol = Math.max(0, startCol - 1);
    // Resident rows are read one cell at a time through `peekRaw`, so scrolling no longer allocates
    // an array-of-arrays of the whole visible band on every frame.
    const unreadable = await this.store.ensureRowsSettled(startRow, endRow);
    if (token !== this.renderToken) return;
    releaseRichCellHosts(this.canvas); this.canvas.replaceChildren(); this.cells.clear();
    if (this.headersOn()) for (let col = startCol; col < endCol; col += 1) {
      const header = document.createElement("div"); header.className = "rg-header rg-large-col-header"; header.textContent = columnLabel(col); header.style.left = `${this.colLeft(col)}px`; header.style.width = `${this.columnWidth(col)}px`;
      const resize = document.createElement("span"); resize.className = "rg-col-resize"; resize.title = "Drag to resize column · double-click to reset"; resize.addEventListener("pointerdown", (event) => this.startColumnResize(col, event)); resize.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); this.store.setColumnWidth(col, null); this.scheduleSave(true); this.scheduleRender(); }); header.appendChild(resize); this.canvas.appendChild(header);
    }
    const engine = this.formulaEngine;
    for (let row = startRow; row < endRow; row += 1) {
      const chunkIndex = unreadable.size ? this.store.chunkIndexForRow(row) : -1;
      if (unreadable.has(chunkIndex)) {
        const bandEnd = Math.min(endRow, (chunkIndex + 1) * chunkRowsFor(this.store.manifest));
        this.canvas.appendChild(this.buildChunkErrorBand(chunkIndex, row, bandEnd));
        row = bandEnd - 1;
        continue;
      }
      if (this.headersOn()) {
        const rowHeader = document.createElement("div"); rowHeader.className = "rg-header rg-large-row-header"; rowHeader.textContent = String(row + 1); rowHeader.style.top = `${this.rowTop(row)}px`; rowHeader.style.height = `${this.rowSpanHeight(row)}px`;
        const resize = document.createElement("span"); resize.className = "rg-large-row-resize"; resize.title = "Drag to resize row · double-click to reset"; resize.addEventListener("pointerdown", (event) => this.startRowResize(row, event)); resize.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); this.store.setRowHeight(row, null); this.scheduleSave(true); this.scheduleRender(); }); rowHeader.appendChild(resize); this.canvas.appendChild(rowHeader);
      }
      for (let col = startCol; col < endCol; col += 1) {
        const merge = this.store.mergeAt(row, col); if (merge && (merge.row !== row || merge.col !== col)) continue;
        const cell = document.createElement("div"); cell.className = "rg-cell rg-large-cell"; cell.classList.toggle("rg-cell--merged", Boolean(merge)); const alignment = this.store.getAlignment(row, col); if (alignment) cell.classList.add(`rg-cell--align-${alignment}`); cell.dataset.row = String(row); cell.dataset.col = String(col); cell.style.left = `${this.colLeft(col)}px`; cell.style.top = `${this.rowTop(row)}px`;
        let width = 0; for (let offset = 0; offset < (merge?.colSpan || 1); offset += 1) width += this.columnWidth(col + offset);
        cell.style.width = `${width}px`; cell.style.height = `${this.rowSpanHeight(row, merge?.rowSpan || 1)}px`;
        const raw = this.store.peekRaw(row, col);
        void this.renderLargeCellValue(cell, raw, row, col, engine);
        if (this.isCellSelected(row, col, merge)) cell.classList.add("rg-cell--selected");
        cell.addEventListener("pointerdown", (event) => { if (event.button !== 0) return; if (event.target.closest?.(".rg-editor")) return; const anchorMerge = this.store.mergeAt(row, col); const anchorRow = anchorMerge?.row ?? row; const anchorCol = anchorMerge?.col ?? col; if (this.editorController?.insertReference(anchorRow, anchorCol, event)) return; this.anchor = { row: anchorRow, col: anchorCol }; this.selection = { startRow: anchorRow, endRow: anchorRow, startCol: anchorCol, endCol: anchorCol }; this.dragSelecting = true; this.dragOrigin = { x: event.clientX, y: event.clientY }; this.root.focus({ preventScroll: true }); claimKeyboard(this); this.updateLargeSelection(); event.preventDefault(); });
        cell.addEventListener("pointerenter", (event) => { if (!this.dragSelecting) return; if (this.dragOrigin && Math.abs(event.clientX - this.dragOrigin.x) < 4 && Math.abs(event.clientY - this.dragOrigin.y) < 4) return; this.selection = normalizeRange({ startRow: this.anchor.row, endRow: row, startCol: this.anchor.col, endCol: col }); this.updateLargeSelection(); });
        cell.addEventListener("click", (event) => { if (event.target.closest?.(".rg-img-clip-chip")) this.openLargeCellImageLightbox(row, col, 0); });
        cell.addEventListener("dragover", (event) => { const files = Boolean(event.dataTransfer?.types?.includes?.("Files")); cell.classList.toggle("rg-cell--drop-target", files); if (files) event.preventDefault(); });
        cell.addEventListener("dragleave", (event) => { if (!event.relatedTarget || !cell.contains(event.relatedTarget)) cell.classList.remove("rg-cell--drop-target"); });
        cell.addEventListener("drop", (event) => {
          cell.classList.remove("rg-cell--drop-target");
          const images = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith("image/"));
          if (!images.length) return;
          event.preventDefault();
          void this.dropImageFiles(images, row, col);
        });
        cell.addEventListener("dblclick", () => this.beginEdit(row, col, cell)); this.canvas.appendChild(cell); this.cells.set(`${row}:${col}`, cell);
      }
    }
    this.editorController?.schedulePresentation();
  }

  /**
   * The band names the rows that are missing instead of pretending they are empty, and offers the
   * only action that can change the answer: ask for the chunk again.
   */
  buildChunkErrorBand(index, startRow, endRow) {
    const band = document.createElement("div");
    band.className = "rg-large-error-band";
    band.dataset.chunk = String(index);
    band.style.left = `${this.headerWidth()}px`;
    band.style.top = `${this.rowTop(startRow)}px`;
    band.style.width = `${Math.max(0, this.totalWidth() - this.headerWidth())}px`;
    band.style.height = `${this.rowSpanHeight(startRow, endRow - startRow)}px`;
    const label = document.createElement("span");
    label.textContent = `⚠ chunk ${index} unreadable — `;
    band.append(label, button("Reload", `Download chunk ${index} again`, () => { this.store.forgetChunkError(index); this.scheduleRender(); }));
    return band;
  }

  /** The image resolver seam over manifest state: large cells are JSON rows with no block uid, so
   *  only the column layer of `imageLayout` can ever apply. Deliberately no `getRaw` — the render
   *  already peeked the raw into `dataset.rgRaw`, and the store's async read would poison it. */
  imageLayoutModel() { return { imageLayout: this.store.manifest.imageLayout, columnIds: this.store.manifest.columnIds }; }

  async renderLargeCellValue(cell, raw, row, col, engine = this.formulaEngine) {
    const key = `${row}:${col}`; const token = (this.cellValueTokens.get(cell) || 0) + 1; this.cellValueTokens.set(cell, token);
    const formula = raw.startsWith("=") && !raw.startsWith("=="); const content = ensureCellContent(cell);
    cell.dataset.rgRaw = raw; cell.classList.toggle("rg-cell--formula", formula && formulaTintEnabled(this.store.manifest.colorFormulaCells));
    applyCellImageLayout(cell, this.imageLayoutModel(), row, col);
    if (formula) {
      const value = await engine.evaluateCell(row, col);
      if (this.cellValueTokens.get(cell) !== token || this.cells.get(key) !== cell) return;
      cell.classList.toggle("rg-cell--error", String(value).startsWith("#")); cell.title = raw;
      renderStableCellContent(content, { raw, value, formula: true });
    } else {
      cell.classList.remove("rg-cell--error"); cell.title = "";
      renderStableCellContent(content, { raw, renderRich: paintRichCellContent });
    }
  }

  async repaintLargeCells(keys) {
    await Promise.all([...keys].map(async (key) => {
      const cell = this.cells.get(key); if (!cell) return;
      const [row, col] = key.split(":").map(Number); const raw = await this.store.getRaw(row, col);
      if (this.cells.get(key) === cell) await this.renderLargeCellValue(cell, raw, row, col);
    }));
  }

  invalidateLargeCells(coordinates) {
    const affected = new Set();
    for (const [row, col] of coordinates) for (const key of this.formulaEngine.invalidateCell(row, col)) affected.add(key);
    for (const key of affected) {
      const cell = this.cells.get(key); if (cell) this.cellValueTokens.set(cell, (this.cellValueTokens.get(cell) || 0) + 1);
    }
    return affected;
  }

  isCellSelected(row, col, merge = this.store.mergeAt(row, col)) {
    return rangeContains(this.selection, row, col) || Boolean(merge && rangesOverlap(this.selection, { startRow: merge.row, endRow: merge.row + merge.rowSpan - 1, startCol: merge.col, endCol: merge.col + merge.colSpan - 1 }));
  }

  updateLargeSelection() {
    for (const cell of this.cells.values()) {
      const row = Number(cell.dataset.row); const col = Number(cell.dataset.col);
      const merge = this.store.mergeAt(row, col);
      const selected = this.isCellSelected(row, col, merge);
      cell.classList.toggle("rg-cell--selected", Boolean(selected));
    }
  }

  moveLargeSelection(dr, dc) {
    const row = clamp(this.selection.startRow + dr, 0, this.store.manifest.rowCount - 1);
    const col = clamp(this.selection.startCol + dc, 0, this.store.manifest.colCount - 1);
    const merge = this.store.mergeAt(row, col); const targetRow = merge?.row ?? row; const targetCol = merge?.col ?? col;
    this.anchor = { row: targetRow, col: targetCol };
    this.selection = { startRow: targetRow, endRow: targetRow, startCol: targetCol, endCol: targetCol };
    this.ensureVisible(targetRow, targetCol); this.updateLargeSelection();
  }

  /** Row-height presets for the selection's rows — the large-grid counterpart of the native
   *  context-menu group. Writes go through the store, so each one is journaled metadata; null
   *  deletes the override, the exact gesture the row-header double-click already makes. */
  setSelectedRowHeights(height) {
    const range = normalizeRange(this.selection);
    for (let row = range.startRow; row <= range.endRow; row += 1) this.store.setRowHeight(row, height);
    this.scheduleSave(true); this.scheduleRender();
  }

  /**
   * Column-scoped image size/fit for the large grid (FIX-5). Large cells are JSON rows with no block
   * uid, so only the COLUMN layer is writable here; the write rides `store.setImageLayout` (journaled
   * and merge-safe, proven in large-grid-merge). `null` clears just that field, falling back to the
   * global default. The row-preset gesture already skips undo for large-grid metadata, so this does too.
   */
  setSelectedColumnImageLayout(kind, value) {
    const range = normalizeRange(this.selection);
    const layout = normalizeImageLayout(this.store.manifest.imageLayout);
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const columnId = this.store.manifest.columnIds?.[col];
      if (!columnId) continue;
      const entry = { ...layout.columns[columnId] };
      if (value == null) delete entry[kind]; else entry[kind] = value;
      if (Object.keys(entry).length) layout.columns[columnId] = entry; else delete layout.columns[columnId];
    }
    this.store.setImageLayout(layout);
    this.scheduleSave(true); this.scheduleRender();
  }

  /** The large-grid layout menu: row-height presets plus the column-scoped image size/fit groups —
   *  the same combined shape the native context menu uses (row height beside image layout). */
  openLayoutMenu(anchor) {
    const existing = document.querySelector(".rg-context-menu"); existing?.__rgDismiss?.(); existing?.remove();
    const menu = document.createElement("div"); menu.className = "bp3-menu rg-context-menu";
    let theme = null; let closed = false; let closeTimer = null;
    const dismiss = () => {
      if (closed) return; closed = true; clearTimeout(closeTimer);
      theme?.dispose(); menu.remove(); document.removeEventListener("pointerdown", close, true);
      if (this.disposed) return;
      this.root.focus?.({ preventScroll: true }); claimKeyboard(this);
    };
    const item = (label, action) => { const element = button(label, label, () => { dismiss(); action(); }); element.className = "bp3-menu-item"; return element; };
    const heading = (text) => { const section = document.createElement("div"); section.className = "rg-menu-section"; section.textContent = text; menu.append(section); };
    heading("Row height");
    for (const [label, height] of ROW_HEIGHT_PRESETS) menu.append(item(`${label} (${height} px)`, () => this.setSelectedRowHeights(height)));
    menu.append(item("Reset row height", () => this.setSelectedRowHeights(null)));
    heading("Image size");
    for (const [label, size] of IMAGE_SIZE_MENU) menu.append(item(label, () => this.setSelectedColumnImageLayout("size", size)));
    menu.append(item("Column default", () => this.setSelectedColumnImageLayout("size", null)));
    heading("Image fit");
    for (const [label, fit] of IMAGE_FIT_MENU) menu.append(item(label, () => this.setSelectedColumnImageLayout("fit", fit)));
    menu.__rgDismiss = dismiss;
    tagPortalOwner(menu, gridViewUid(this));
    document.body.appendChild(menu);
    theme = createPortalThemeBridge(this.root, menu);
    const rect = anchor.getBoundingClientRect(); menu.style.left = `${rect.left}px`; menu.style.top = `${rect.bottom}px`;
    const close = (event) => { if (!menu.contains(event.target)) dismiss(); };
    closeTimer = setTimeout(() => document.addEventListener("pointerdown", close, true));
  }

  startRowResize(row, event) {
    event.preventDefault(); event.stopPropagation(); this.resizeCleanup?.(); const startY = event.clientY; const startHeight = this.store.rowHeight(row); let moved = false;
    const move = (moveEvent) => { moved = true; this.rowResizePreview = { row, height: clamp(Math.round(startHeight + moveEvent.clientY - startY), getSetting("sizing-min-row-height"), getSetting("sizing-max-row-height")) }; this.rowMetricsKey = null; this.scheduleRender(); };
    const up = () => { const height = this.rowResizePreview?.height ?? startHeight; cleanup(); this.rowResizePreview = null; if (!moved) return; this.store.setRowHeight(row, height); this.scheduleSave(true); this.scheduleRender(); };
    const cleanup = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); this.resizeCleanup = null; };
    this.resizeCleanup = cleanup; document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  startColumnResize(col, event) {
    event.preventDefault(); event.stopPropagation(); this.resizeCleanup?.(); const startX = event.clientX; const startWidth = this.columnWidth(col); let moved = false;
    const move = (moveEvent) => { moved = true; this.columnResizePreview = { col, width: clamp(Math.round(startWidth + moveEvent.clientX - startX), getSetting("sizing-min-col-width"), getSetting("sizing-max-col-width")) }; this.scheduleRender(); };
    const up = () => { const width = this.columnResizePreview?.width ?? startWidth; cleanup(); this.columnResizePreview = null; if (!moved) return; this.store.setColumnWidth(col, width); this.scheduleSave(true); this.scheduleRender(); };
    const cleanup = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); this.resizeCleanup = null; };
    this.resizeCleanup = cleanup; document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  async beginEdit(row, col, cell = this.cells.get(`${row}:${col}`), initial = null, floating = false) {
    if (!cell) return;
    const merge = this.store.mergeAt(row, col); row = merge?.row ?? row; col = merge?.col ?? col;
    const chunkIndex = this.store.chunkIndexForRow(row);
    if (this.store.unreadableChunks.has(chunkIndex)) return toast(`Chunk ${chunkIndex} is unreadable — reload it before editing these rows`, "warning");
    const cached = this.store.cache.has(chunkIndex);
    if (cached) this.editingPending = true;
    try {
      const raw = cached ? this.store.peekRaw(row, col) : await this.store.getRaw(row, col);
      if (nativeEditorEnabled() && !floating && !(raw.startsWith("=") && !raw.startsWith("=="))) {
        const scratch = await acquireLargeScratch();
        if (!scratch) return this.editorController?.start({ row, col, cell, raw, initial, floating });
        const started = await this.nativeOverlay?.start({ row, col, cell, uid: scratch.uid, raw, initial });
        if (started) return started;
      }
      return this.editorController?.start({ row, col, cell, raw, initial, floating });
    } finally {
      if (cached) this.editingPending = false;
    }
  }
  onKeydown(event) {
    if (event.target.matches("textarea,input")) return; event.stopPropagation(); const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === "z") { event.preventDefault(); void (event.shiftKey ? this.redo() : this.undo()); return; }
    if (command && event.key.toLowerCase() === "c") { event.preventDefault(); this.copy(); return; }
    if (command && event.shiftKey && event.key.toLowerCase() === "m") { event.preventDefault(); this.merge(); return; }
    if (event.key === "Enter") { event.preventDefault(); const cell = this.cells.get(`${this.selection.startRow}:${this.selection.startCol}`); if (cell) this.beginEdit(this.selection.startRow, this.selection.startCol, cell); return; }
    if (event.key === "F2") { event.preventDefault(); const cell = this.cells.get(`${this.selection.startRow}:${this.selection.startCol}`); if (cell) this.beginEdit(this.selection.startRow, this.selection.startCol, cell, null, true); return; }
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, event.shiftKey ? -1 : 1] };
    if (moves[event.key]) { event.preventDefault(); this.moveLargeSelection(...moves[event.key]); return; }
    // BEFORE the printable-char branch (a space is length-1): Shift+Space opens the lightbox.
    if (event.key === " " && event.shiftKey && !command && !event.altKey) { event.preventDefault(); this.openLargeCellImageLightbox(this.selection.startRow, this.selection.startCol, 0); return; }
    if (event.key.length === 1 && !command && !event.altKey) { event.preventDefault(); const cell = this.cells.get(`${this.selection.startRow}:${this.selection.startCol}`); if (cell) this.beginEdit(this.selection.startRow, this.selection.startCol, cell, event.key); }
  }

  /** Opens the lightbox over the RESIDENT rows of the column (only mounted cells hold a raw string in
   *  the virtualized large grid). Deleting rewrites the store cell the same way an edit commit does. */
  openLargeCellImageLightbox(row, col, imageIndex = 0) {
    const rowRaws = [...this.cells.entries()]
      .filter(([key]) => Number(key.split(":")[1]) === col)
      .map(([key, cell]) => ({ row: Number(key.split(":")[0]), raw: cell?.dataset?.rgRaw ?? "" }))
      .sort((a, b) => a.row - b.row);
    const entries = imageEntriesFromCells(rowRaws, col);
    const startIndex = imageEntryStartIndex(entries, row, imageIndex);
    if (startIndex < 0) return null;
    return openImageLightbox({
      ownerRoot: this.root,
      entries,
      startIndex,
      onDelete: async ({ entry, raw }) => {
        this.recordLargeEdit("Remove image", await this.store.setCell(entry.row, entry.col, raw));
        const affected = this.formulaEngine.invalidateCell(entry.row, entry.col);
        this.scheduleSave();
        await this.repaintLargeCells(affected);
      },
    });
  }
  ensureVisible(row, col) { const top = this.rowTop(row); const height = this.rowSpanHeight(row); const left = this.colLeft(col); const width = this.columnWidth(col); if (top < this.viewport.scrollTop + this.headerHeight()) this.viewport.scrollTop = top - this.headerHeight(); else if (top + height > this.viewport.scrollTop + this.viewport.clientHeight) this.viewport.scrollTop = top - this.viewport.clientHeight + height; if (left < this.viewport.scrollLeft + this.headerWidth()) this.viewport.scrollLeft = left - this.headerWidth(); else if (left + width > this.viewport.scrollLeft + this.viewport.clientWidth) this.viewport.scrollLeft = left - this.viewport.clientWidth + width; }
  async copy() { const range = normalizeRange(this.selection); const rows = await this.store.getRows(range.startRow, range.endRow + 1); const text = rows.map((row) => row.slice(range.startCol, range.endCol + 1).map((value) => quoteDelimited(value, "\t")).join("\t")).join("\n"); globalThis.navigator?.clipboard?.writeText(text); }
  async onPaste(event) {
    const images = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
    if (images.length) {
      event.preventDefault();
      try {
        const embeds = await uploadImageEmbeds(images);
        const row = this.selection.startRow; const col = this.selection.startCol;
        const previous = await this.store.getRaw(row, col);
        this.recordLargeEdit("Paste image", await this.store.setCell(row, col, [previous, ...embeds].filter(Boolean).join(" ")));
        await this.repaintLargeCells(this.invalidateLargeCells([[row, col]]));
        this.scheduleSave();
      } catch (error) { if (globalThis.window) globalThis.window.__RG_IMG_LAST_ERROR = String(error?.stack || error); }
      return;
    }
    const text = event.clipboardData?.getData("text/plain"); if (!text) return;
    const referenced = parseRangeComponent(text);
    if (referenced) { event.preventDefault(); await this.pasteReferencedRange(referenced); return; }
    event.preventDefault();
    const startRow = this.selection.startRow; const startCol = this.selection.startCol;
    const matrix = clipPasteMatrix(parseDelimited(text, text.includes("\t") ? "\t" : detectDelimiter(text)), startRow, startCol, this.store.manifest.rowCount, this.store.manifest.colCount);
    if (!matrix.length) return;
    this.recordLargeEdit("Paste", await this.store.applyMatrix(startRow, startCol, matrix));
    const coordinates = matrix.flatMap((values, row) => values.map((_value, col) => [startRow + row, startCol + col]));
    this.invalidateLargeCells(coordinates); this.scheduleSave(); this.scheduleRender();
  }
  /** Drag-drop parity with paste: OS image files append at the dropped cell through the store, one
   *  journaled edit. A covered coordinate normalizes to its merge origin before the write. */
  async dropImageFiles(files, row, col) {
    try {
      const embeds = await uploadImageEmbeds(files);
      if (!embeds.length) return;
      const merge = this.store.mergeAt?.(row, col);
      if (merge) { row = merge.row; col = merge.col; }
      const previous = await this.store.getRaw(row, col);
      this.recordLargeEdit("Drop image", await this.store.setCell(row, col, [previous, ...embeds].filter(Boolean).join(" ")));
      await this.repaintLargeCells(this.invalidateLargeCells([[row, col]]));
      this.scheduleSave();
    } catch (error) { if (globalThis.window) globalThis.window.__RG_IMG_LAST_ERROR = String(error?.stack || error); }
  }

  /** A Files drop between mounted cells still lands in a cell: the offsets walk the same column
   *  metrics the renderer uses, so the drop coordinate matches what the cursor was visually over. */
  dropCellAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left; const y = clientY - rect.top;
    const row = clamp(this.rowAtOffset(y), 0, Math.max(0, this.store.manifest.rowCount - 1));
    const { colCount } = this.store.manifest;
    let col = 0; let left = this.headerWidth();
    while (col < colCount - 1 && left + this.columnWidth(col) < x) { left += this.columnWidth(col); col += 1; }
    return { row, col };
  }
  /** A large grid cannot host a range view (its cells are JSON rows with no block uid), so a range
   *  component pastes the referenced values instead — the same live `((uid))` matrix a native grid
   *  receives, which the large-cell renderer resolves through the ordinary rich-content path. */
  async pasteReferencedRange(spec, resolve = resolveSourceModel) {
    let sourceModel;
    try { sourceModel = resolve(spec.tableUid); }
    catch (error) { return toast(`Could not read the referenced grid: ${error.message}`, "danger"); }
    if (!sourceModel) return toast("Could not read the referenced grid", "danger");
    let matrix;
    try { matrix = selectionBlockReferenceMatrix(sourceModel, spec.range); }
    catch (error) { return toast(error.message, "warning"); }
    const startRow = this.selection.startRow; const startCol = this.selection.startCol;
    matrix = clipPasteMatrix(matrix, startRow, startCol, this.store.manifest.rowCount, this.store.manifest.colCount);
    if (!matrix.length) return;
    this.recordLargeEdit("Paste reference", await this.store.applyMatrix(startRow, startCol, matrix));
    const coordinates = matrix.flatMap((values, row) => values.map((_value, col) => [startRow + row, startCol + col]));
    this.invalidateLargeCells(coordinates); this.scheduleSave(); this.scheduleRender();
  }

  /** One entry per user gesture, from the records `setCell`/`applyMatrix` hand back. */
  recordLargeEdit(label, cells) {
    if (!getSetting("editing-capture-undo")) return null;
    return largeGridHistoryFor(this.store.anchorUid)?.record({ label, cells: [].concat(cells ?? []) }) || null;
  }
  undo() { return this.applyLargeHistory("undo"); }
  redo() { return this.applyLargeHistory("redo"); }

  /**
   * Runs inside the store's own `MutationQueue`, so an undo cannot interleave with a commit that is
   * uploading the very chunk it is about to rewrite — it either lands wholly before that commit
   * serialized its bytes, or wholly after, and the epoch stamp carries it into the next save.
   */
  async applyLargeHistory(direction) {
    const history = largeGridHistoryFor(this.store.anchorUid);
    const entry = direction === "undo" ? history?.popUndo() : history?.popRedo();
    if (!entry) return false;
    let result;
    // The entry goes back where it came from if applying it throws. Its ops carry absolute values
    // rather than deltas, so a half-applied entry is safe to run again — where dropping it would
    // strand the user one step into a reversal they cannot finish or repeat.
    try { result = await this.store.queue.run(() => applyLargeUndoOps(this.store, direction === "undo" ? entry.inverse : entry.forward, entry)); }
    catch (error) { if (direction === "undo") history.pushUndo(entry); else history.pushRedo(entry); toast(error.message, "danger"); return false; }
    if (direction === "undo") history.pushRedo(entry); else history.pushUndo(entry);
    await this.repaintLargeCells(this.invalidateLargeCells(result.applied.map((cell) => [cell.row, cell.col])));
    this.scheduleSave(); this.scheduleRender();
    if (result.dropped.length) toast(`${result.dropped.length} cell${result.dropped.length === 1 ? "" : "s"} changed elsewhere and ${result.dropped.length === 1 ? "was" : "were"} kept.`, "warning");
    return true;
  }
  async merge() { try { await this.store.merge(this.selection); this.scheduleSave(true); this.scheduleRender(); } catch (error) { toast(error.message, "danger"); } }
  unmerge() { if (!this.store.unmerge(this.selection.startRow, this.selection.startCol)) return toast("The active cell is not merged", "warning"); this.scheduleSave(true); this.scheduleRender(); }
  alignSelection(alignment) { const range = normalizeRange(this.selection); for (let row = range.startRow; row <= range.endRow; row += 1) for (let col = range.startCol; col <= range.endCol; col += 1) this.store.setAlignment(row, col, alignment); this.scheduleSave(true); this.scheduleRender(); }
  toggleFormulaColors() { this.store.setDisplayFlag("colorFormulaCells", this.store.manifest.colorFormulaCells === false); this.scheduleSave(true); this.scheduleRender(); }
  toggleHeaders() { this.store.setDisplayFlag("showHeaders", this.store.manifest.showHeaders === false); this.scheduleSave(true); this.scheduleRender(); }
  scheduleSave(immediate = false) { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.flush(), immediate ? 0 : getSetting("writes-large-debounce-ms")); }
  async flush() { clearTimeout(this.saveTimer); this.root.classList.add("rg-root--saving"); try { await this.store.commit(); toast("Large grid saved", "success", 1800); } catch (error) { toast(error.message, "danger", 8000); } finally { this.root.classList.remove("rg-root--saving"); } }
  async exportSelection() { const range = normalizeRange(this.selection); const rows = await this.store.getRows(range.startRow, range.endRow + 1); downloadText(rows.map((row) => row.slice(range.startCol, range.endCol + 1).map((value) => quoteDelimited(value, ",")).join(",")).join("\n"), "roam-grid-selection.csv", "text/csv"); }
  /**
   * Deliberately records no undo entry, matching `applyPatchToModel(model, patch, false)` on the
   * native side: a programmatic write is not the user's keystroke to reverse.
   */
  async applyPatch(patch) {
    const patches = Array.isArray(patch) ? patch : [patch]; const coordinates = [];
    for (const item of patches) {
      if (item.op !== "set") throw new GridError("PATCH", "Large-grid public patches currently support cell writes");
      await this.store.setCell(item.row, item.col, item.value); coordinates.push([item.row, item.col]);
    }
    this.invalidateLargeCells(coordinates); await this.store.commit(); this.scheduleRender();
    return { manifest: deepClone(this.store.manifest) };
  }
  dispose({ keepStore = false } = {}) { this.disposed = true; this.dragSelecting = false; this.dragOrigin = null; ++this.renderToken; clearTimeout(this.saveTimer); if (this.nativeOverlay?.active) { void this.nativeOverlay.commit(null).catch(() => {}); } else { this.nativeOverlay?.dispose(); } this.nativeOverlay = null; if (!keepStore) this.store?.dispose(); this.resizeCleanup?.(); this.editorController?.dispose(); this.editorController = null; releaseKeyboard(this); document.removeEventListener("pointerup", this.boundUp, true); releaseRichCellHosts(this.root); this.root.remove(); this.markerElement?.classList.remove("rg-large-marker-hidden");
    this.markerElement?.querySelector?.(".rm-xparser-default-grid")?.classList.remove("rg-large-marker-hidden");
    this.markerElement?.querySelector?.("[data-tag='roam/grid']")?.classList.remove("rg-large-marker-hidden"); }
}

function downloadText(text, filename, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  trackedTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportCommand(model) {
  const format = await showChoice("Export format", [
    { label: "CSV", value: "csv", primary: true }, { label: "TSV", value: "tsv" }, { label: "Markdown", value: "markdown" },
    { label: "Org", value: "org" }, { label: "reStructuredText", value: "rst" }, { label: "Roam Grid JSON", value: "json" },
  ]);
  if (!format) return;
  const custom = runtime.registries.exporters.get(format.toUpperCase()); const text = custom ? await custom(model) : exportGrid(model, format);
  const extensions = { csv: "csv", tsv: "tsv", markdown: "md", org: "org", rst: "rst", json: "json" };
  downloadText(text, `roam-grid.${extensions[format] || "txt"}`, format === "json" ? "application/json" : "text/plain");
}

async function createNativeTableFromModel(model, afterUid = null, { parentUid = null } = {}) {
  const mutations = model.rowCount * model.colCount;
  if (mutations > getSetting("writes-native-budget")) throw new GridError("MUTATION_BUDGET", `Native conversion would create ${mutations} blocks, above the safe write budget`);
  const tableUid = parentUid ? await createBlock(parentUid, "{{[[table]]}}", "last") : afterUid ? await insertAfterBlock(afterUid, "{{[[table]]}}") : await insertNearFocus("{{[[table]]}}");
  for (let row = 0; row < model.rowCount; row += 1) {
    let parentUid = tableUid;
    for (let col = 0; col < model.colCount; col += 1) parentUid = await createBlock(parentUid, model.getRaw(row, col) || " ", col === 0 ? row : 0);
  }
  const adapter = new NativeTableAdapter(tableUid);
  const loaded = adapter.load();
  loaded.columnIds = [...model.columnIds]; loaded.merges = deepClone(model.merges); loaded.widths = { ...model.widths }; loaded.headerColumns = [...model.headerColumns]; loaded.frozenRows = model.frozenRows; loaded.frozenCols = model.frozenCols; loaded.charts = deepClone(model.charts); loaded.imageLayout = deepClone(model.imageLayout); loaded.showHeaders = model.showHeaders !== false; loaded.fitToWidth = model.fitToWidth !== false; loaded.colorFormulaCells = model.colorFormulaCells !== false;
  for (let row = 0; row < Math.min(model.rowCount, loaded.rowCount); row += 1) {
    loaded.setRowHeight(row, model.getRowHeight(row));
    if (model.isHeaderRow(row)) loaded.toggleHeaderRow(row);
    for (let col = 0; col < Math.min(model.colCount, loaded.colCount); col += 1) loaded.setAlignment(row, col, model.getAlignment(row, col));
  }
  await runtime.metadata.set(tableUid, loaded, "native");
  syncEnhancedUidGuard(); scheduleScan(document);
  return tableUid;
}

export async function resolveTemplateModel(name) {
  const normalized = String(name).toUpperCase();
  const template = runtime.registries?.templates.get(normalized);
  if (template) {
    const value = typeof template === "function" ? await template() : template;
    if (value instanceof GridModel) return new GridModel(value.snapshot());
    if (value?.schema === "roam-grid") return GridModel.fromJSON(deepClone(value));
    if (value?.schema === "roam-grid-template") return templateModelFromValue(deepClone(value));
    return new GridModel(deepClone(value));
  }
  const saved = runtime.templates?.get(name);
  if (saved) return saved;
  throw new GridError("TEMPLATE_NOT_FOUND", `Unknown Roam Grid template: ${name}`);
}

async function saveModelAsTemplate(model) {
  try {
    const name = await showPrompt("Save grid template as", model.getRaw(0, 0).replace(/[*_[\]]/g, "").slice(0, 80) || "My grid");
    if (!name) return;
    const saved = await runtime.templates.save(name, model);
    if (saved == null) return; // the overwrite confirm was declined
    toast(`Saved “${name}” to [[${TEMPLATE_PAGE}]]`, "success", 5000);
  } catch (error) { toast(error.message, "danger", 8000); }
}

async function saveFocusedTemplate() {
  const mount = activeMount();
  if (!(mount instanceof GridView)) return toast("Focus an enhanced native grid before saving a template", "warning", 5000);
  return saveModelAsTemplate(mount.model);
}

async function newFromSavedTemplate() {
  try {
    const names = savedTemplateNameList(runtime.registries, runtime.templates);
    if (!names.length) throw new GridError("TEMPLATE_EMPTY", "No grid templates are saved yet. Focus a grid and run “Save current grid as template” first.");
    const name = await showChoice("Insert grid template", names.map((value, index) => ({ label: value, value, primary: index === 0 })));
    if (!name) return;
    await createNativeTableFromModel(await resolveTemplateModel(name));
    toast(`Created grid from “${name}”`, "success", 4000);
  } catch (error) { toast(error.message, "danger", 8000); }
}

async function copyNativeToLarge(model) {
  const anchorUid = model.tableUid ? await insertAfterBlock(model.tableUid, "{{[[roam/grid]]}}") : await insertNearFocus("{{[[roam/grid]]}}");
  const copy = new GridModel({ ...model.snapshot(), tableUid: null });
  const store = await new LargeGridStore(anchorUid).initialize(copy);
  await runtime.metadata.set(anchorUid, copy, "large");
  scheduleScan();
  toast(`Created large-grid copy (${store.manifest.rowCount.toLocaleString()} rows)`, "success");
  return anchorUid;
}

async function copyLargeToNative(store) {
  try { return await createNativeTableFromModel(await store.toModel(), store.anchorUid); }
  catch (error) { toast(error.message, "danger", 8000); return null; }
}

function activeGridUid() {
  const inside = document.activeElement?.closest?.("[data-roam-grid-uid]")?.dataset.roamGridUid;
  if (inside) return inside;
  const uid = focusedUid();
  return ancestorWithMarker(uid, NATIVE_MARKER) || ancestorWithMarker(uid, LARGE_MARKER);
}

/** The view a command may act on: a read-only excerpt and a hover-preview mount render a grid but
 *  can never write, so command routing resolves them to the session's source-document view. */
function commandViewOf(session) {
  if (!session) return null;
  for (const view of session.views) {
    if (view.root?.isConnected && view.surface !== "preview" && !(view instanceof RangeGridView)) return view;
  }
  return null;
}

export function activeMount() {
  const root = document.activeElement?.closest?.("[data-roam-grid-uid]");
  const mounted = root?.__rgView;
  if (mounted instanceof RangeGridView || mounted?.surface === "preview") return commandViewOf(mounted.session);
  if (mounted) return mounted;
  const uid = activeGridUid();
  if (!uid) return null;
  const session = runtime.sessions.get(uid);
  return session ? commandViewOf(session) : runtime.largeMounts.get(uid) || null;
}

async function enhanceFocusedTable() {
  const uid = ancestorWithMarker(focusedUid(), NATIVE_MARKER);
  if (!uid) return toast("Focus a cell in a native {{table}} first.", "warning");
  if (runtime.metadata.has(uid)) return toast("This table is already enhanced.", "warning");
  try {
    const adapter = new NativeTableAdapter(uid); const model = adapter.load(displayDefaults()); await runtime.metadata.set(uid, model, "native"); syncEnhancedUidGuard(); scheduleScan(document); toast("Enhanced this table. Its Roam blocks remain canonical.", "success");
  } catch (error) { toast(error.message, "danger"); }
}

async function restoreFocusedTable() {
  const uid = activeGridUid();
  if (!uid || !runtime.metadata.has(uid)) return toast("Focus an enhanced Roam Grid first.", "warning");
  const entry = runtime.metadata.entries.get(uid);
  if (entry?.value?.mode === "large") return toast("Large grids cannot become native fallback without creating a native copy.", "warning");
  disposeNativeSession(uid, true); releaseUndoHistory(uid); await runtime.metadata.remove(uid); syncEnhancedUidGuard(); toast("Restored the native Roam table.", "success");
}

async function newLargeGrid() {
  try {
    const anchorUid = await insertNearFocus("{{[[roam/grid]]}}"); const store = await new LargeGridStore(anchorUid).initialize();
    const metadataModel = applyDisplayDefaults(new GridModel({ rows: [[""]], columnIds: store.manifest.columnIds, widths: store.manifest.widths, frozenRows: store.manifest.frozenRows, frozenCols: store.manifest.frozenCols, merges: store.manifest.merges, charts: store.manifest.charts }));
    await runtime.metadata.set(anchorUid, metadataModel, "large"); syncEnhancedUidGuard(); scheduleScan(); toast(`Created a ${store.manifest.rowCount.toLocaleString()} × ${store.manifest.colCount} large grid.`, "success");
  } catch (error) { toast(error.message, "danger", 8000); }
}

async function convertFocusedGrid() {
  const mount = activeMount();
  if (mount instanceof GridView) return copyNativeToLarge(mount.model);
  if (mount instanceof LargeGridView) return copyLargeToNative(mount.store);
  toast("Focus an enhanced table or large grid first.", "warning");
}

async function importCommand() {
  const input = document.createElement("input"); input.type = "file"; input.accept = ".csv,.tsv,.md,.markdown,.org,.rst,.json,.el,.sexp,text/*";
  input.addEventListener("change", async () => {
    const file = input.files?.[0]; if (!file) return;
    try {
      const extension = file.name.split(".").pop().toLowerCase(); const format = ({ md: "markdown", markdown: "markdown", el: "grid-table", sexp: "grid-table" })[extension] || extension;
      const custom = runtime.registries.importers.get(format.toUpperCase()); const model = applyDisplayDefaults(custom ? await custom(await file.text()) : importGrid(await file.text(), format));
      if (model.rowCount * model.colCount <= getSetting("writes-native-budget")) await createNativeTableFromModel(model); else await copyNativeToLarge(model);
      toast(`Imported ${model.rowCount} × ${model.colCount} cells.`, "success");
    } catch (error) { toast(`Import failed: ${error.message}`, "danger", 8000); }
  });
  input.click();
}

async function exportFocusedCommand() {
  const mount = activeMount();
  if (mount instanceof GridView) return exportCommand(mount.model);
  if (mount instanceof LargeGridView) return mount.exportSelection();
  toast("Focus a Roam Grid first.", "warning");
}

/** The command half of conflict recovery: the toast can time out, this cannot. */
function restoreDiscardedEditsCommand() {
  const session = activeMount()?.session || runtime.sessions.get(activeGridUid());
  if (!session) return toast("Focus a compatible Roam Grid first.", "warning");
  return session.restoreDiscardedEdits();
}

function commandOnActive(nativeMethod, largeMethod = nativeMethod) {
  const mount = activeMount();
  const method = mount instanceof LargeGridView ? largeMethod : nativeMethod;
  if (!mount || typeof mount[method] !== "function") return toast("Focus a compatible Roam Grid first.", "warning");
  return mount[method]();
}

function findBlockElement(uid) {
  const escaped = globalThis.CSS?.escape ? CSS.escape(uid) : uid.replace(/[^A-Za-z0-9_-]/g, "");
  const candidates = document.querySelectorAll(`[id$="${escaped}"]`);
  for (const candidate of candidates) {
    const block = candidate.matches(".roam-block") ? candidate : candidate.closest(".roam-block");
    if (block) return block;
  }
  return null;
}

export const mounting = new Set();

function nativeMetadataUids() {
  return new Set([...runtime.metadata?.entries || []].filter(([, entry]) => entry?.value?.mode !== "large").map(([uid]) => uid));
}

export function largeMetadataUids() {
  return new Set([...runtime.metadata?.entries || []].filter(([, entry]) => entry?.value?.mode === "large").map(([uid]) => uid));
}

function installLargeGridGuard(uids) {
  if (!globalThis.document?.head) return null;
  const style = runtime.guardLargeStyle || document.getElementById(PREPAINT_LARGE_STYLE_ID) || document.createElement("style");
  style.id = PREPAINT_LARGE_STYLE_ID; style.textContent = largeGridGuardCss(uids);
  if (!style.isConnected) document.head.appendChild(style);
  runtime.guardLargeStyle = style;
  return style;
}

function installEnhancedUidGuard(uids) {
  if (!globalThis.document?.head) return null;
  const style = runtime.guardStyle || document.getElementById(PREPAINT_STYLE_ID) || document.createElement("style");
  style.id = PREPAINT_STYLE_ID; style.textContent = enhancedUidGuardCss(uids);
  if (!style.isConnected) document.head.appendChild(style);
  runtime.guardStyle = style;
  // The large pre-paint guard rides the same install/sync cycle so both guards stay in lockstep;
  // at load time the cached large uids are installed before metadata has been read.
  installLargeGridGuard(readLargeUidCache());
  return style;
}

function syncEnhancedUidGuard() {
  if (!runtime.metadata) return installEnhancedUidGuard(readEnhancedUidCache());
  const uids = nativeMetadataUids(); writeEnhancedUidCache(uids);
  const largeUids = largeMetadataUids(); writeLargeUidCache(largeUids);
  return installEnhancedUidGuard(uids);
}

function nativeTablesWithin(root) {
  if (!root) return [];
  const values = [];
  if (root.matches?.(".rm-table")) values.push(root);
  for (const table of root.querySelectorAll?.(".rm-table") || []) if (!values.includes(table)) values.push(table);
  return values;
}

export function nativeTableInstanceInfo(nativeElement, entries = runtime.metadata?.entries || new Map()) {
  if (!nativeElement) return null;
  const reference = nativeElement.closest?.(".rm-block-ref[data-uid]");
  const referenceUid = reference?.dataset?.uid || reference?.getAttribute?.("data-uid") || null;
  if (referenceUid && entries.get?.(referenceUid)?.value?.mode !== "large" && entries.has?.(referenceUid)) {
    return { uid: referenceUid, context: "reference", referenceElement: reference };
  }
  for (let node = nativeElement; node; node = node.parentElement) {
    let idMatch = null;
    for (const [uid, entry] of entries) {
      if (entry?.value?.mode === "large") continue;
      if (node.dataset?.uid === uid) return { uid, context: "source", referenceElement: null };
      if (idMatch === null && String(node.id || "").endsWith(uid)) idMatch = uid;
    }
    if (idMatch !== null) return { uid: idMatch, context: "source", referenceElement: null };
  }
  return null;
}

/** Classifies the Roam surface a native table is rendered on. Additive — it never replaces `context`. */
export function instanceSurface(element) {
  if (!element?.closest) return "main";
  if (element.closest(".bp3-portal, .bp3-tooltip, .bp3-popover")) return "preview";
  if (element.closest("#right-sidebar, #roam-right-sidebar-content")) return "sidebar";
  if (element.closest(".rm-embed-container")) return "embed";
  return "main";
}

function claimNativeInstances(root) {
  if (!runtime.metadata) return;
  for (const nativeElement of nativeTablesWithin(root)) {
    const info = nativeTableInstanceInfo(nativeElement); if (!info) continue;
    nativeElement.classList.add("rg-native-pending");
  }
}

/**
 * Body-mounted lightboxes a session owns must be torn down with it (FIX-2). A modal `<dialog>` left
 * open by `showModal()` blocks the whole page behind its inert `::backdrop`, and its inner
 * `renderString` host leaks unless the portal's own `__rgDismiss` runs — which calls `unmountNode`,
 * not just `remove()`. The lightbox carries a passive `data-rg-lightbox-owner` marker (FIX-1) rather
 * than the keyboard-owning `data-rg-owner` tag, so we match on it here.
 */
export function dismissOwnedLightboxes(uid) {
  if (!uid || typeof document?.querySelectorAll !== "function") return;
  for (const portal of [...document.querySelectorAll(".rg-lightbox")]) {
    if (portal.dataset?.rgLightboxOwner === String(uid)) portal.__rgDismiss?.();
  }
}

function disposeNativeSession(uid, releaseNative = false) {
  const session = runtime.sessions.get(uid); if (!session) return;
  dismissOwnedLightboxes(uid);
  for (const view of [...session.views]) {
    runtime.views.delete(view); runtime.viewsByNative.delete?.(view.nativeElement);
    view.dispose({ releaseNative });
  }
  session.dispose(); runtime.sessions.delete(uid);
}

function getOrCreateNativeSession(uid) {
  const existing = runtime.sessions.get(uid);
  if (existing && !existing.disposed) { clearTimeout(existing.idleTimer); existing.idleTimer = null; return existing; }
  const session = new NativeGridSession(uid, { onIdle: (idle) => {
    if (runtime.sessions.get(uid) !== idle || idle.views.size) return;
    idle.dispose(); runtime.sessions.delete(uid);
  } });
  runtime.sessions.set(uid, session); return session;
}

function mountNativeInstance(nativeElement, info, surface = instanceSurface(nativeElement)) {
  const current = runtime.viewsByNative.get(nativeElement);
  if (current?.root?.isConnected) return current;
  nativeElement.classList.add("rg-native-pending");
  const session = getOrCreateNativeSession(info.uid);
  const view = new GridView({ host: nativeElement.parentElement, model: session.model, adapter: session.adapter, nativeElement, session, context: info.context, surface });
  view.root.dataset.roamGridUid = info.uid; view.root.dataset.roamGridInstance = cryptoId(); view.root.__rgView = view;
  runtime.views.add(view); runtime.viewsByNative.set(nativeElement, view);
  nativeElement.classList.remove("rg-native-pending");
  return view;
}

/**
 * Ring-buffered diagnostics for the range claim pipeline — every degrade and success point calls
 * this, so a silent invisibility can be reconstructed from `window.__rgDiag.rangeTrace` after the
 * fact. The console line exists only behind an explicit localStorage opt-in.
 */
export function traceRange(stage, detail = null) {
  const target = globalThis.window;
  if (target) {
    const diag = (target.__rgDiag ||= {});
    const entry = { at: Date.now(), stage, detail };
    const trace = (diag.rangeTrace ||= []);
    trace.push(entry);
    if (trace.length > 32) trace.splice(0, trace.length - 32);
    diag.rangeLast = entry;
  }
  try { if (globalThis.localStorage?.["roam-grid:debug"]) console.debug("[roam-grid] range", stage, detail ?? ""); } catch { /* localStorage can be blocked */ }
}

export function rangeButtonsWithin(root) {
  if (!root) return [];
  const values = [];
  if (root.matches?.(RANGE_BUTTON_SELECTOR)) values.push(root);
  for (const node of root.querySelectorAll?.(RANGE_BUTTON_SELECTOR) || []) if (!values.includes(node)) values.push(node);
  return values;
}

/** Roam block inputs are `block-input-<window-id>-<block-uid>`; the uid is the trailing segment. */
export function rangeBlockUid(element) {
  if (!element) return null;
  const dataUid = element.dataset?.uid || element.getAttribute?.("data-uid");
  if (dataUid) return String(dataUid);
  return /-([\w-]{9})$/.exec(String(element.id || ""))?.[1] || null;
}

/**
 * Parses the range spec behind a rendered component button.  Specs are cached per block uid and
 * invalidated when Roam replaces the button node, and the source string is stored with the entry:
 * every lookup re-reads the string and re-parses when it changed, so an edited range string never
 * serves a stale spec and a cached negative recovers.
 */
export function rangeInstanceInfo(button, entries = runtime.rangeSpecs, readString = blockString, trace = traceRange) {
  if (!button) return null;
  // The live-references escape hatch lives here because this is the mount path's only discovery
  // call: with it off nothing is parsed and nothing is cached, so the claim pass falls into its
  // no-spec branch and un-hides the raw component, and turning it back on parses on the next scan.
  if (getSetting("ranges-live-references") === false) { trace("refs-off"); return null; }
  const blockUid = uidFromFocusTarget(button) || rangeBlockUid(roamBlockInputFor(button));
  if (!blockUid) { trace("no-uid"); return null; }
  const cached = entries?.get?.(blockUid);
  let text = "";
  try { text = readString(blockUid) || ""; } catch { text = ""; }
  // An empty read is transient (the block is still mounting) — caching it would kill this button
  // for the session, so only a definitive non-empty non-spec may cache a null.
  if (!text) { trace("empty-read", blockUid); return null; }
  if (cached && cached.button === button && cached.text === text) return cached.info;
  const spec = parseRangeComponent(text);
  if (!spec) { trace("no-spec", blockUid); entries?.set?.(blockUid, { button, text, info: null }); return null; }
  const info = { ...spec, blockUid };
  entries?.set?.(blockUid, { button, text, info });
  return info;
}

function mountRangeInstance(button, info, surface = instanceSurface(button)) {
  const current = runtime.viewsByNative.get(button);
  if (current?.root?.isConnected) return current;
  const session = getOrCreateNativeSession(info.tableUid);
  const view = new RangeGridView({ host: button.parentElement, session, range: info.range, label: info.label, nativeElement: button, surface });
  view.root.dataset.roamGridUid = info.tableUid; view.root.dataset.roamGridInstance = cryptoId();
  runtime.views.add(view); runtime.viewsByNative.set(button, view);
  button.classList.remove("rg-range-restored");
  return view;
}

/**
 * Fallback discovery for blocks where Roam rendered NO component button (pinned live-probe fact 1:
 * the bare-uid form renders nothing). textContent is a PREFILTER ONLY — the authoritative string
 * is always the Datascript read, never DOM text.
 */
export function rangeTextHostsWithin(root) {
  if (!root) return [];
  const candidates = [];
  if (root.matches?.(ROAM_BLOCK_INPUT_SELECTOR)) candidates.push(root);
  for (const node of root.querySelectorAll?.(ROAM_BLOCK_INPUT_SELECTOR) || []) if (!candidates.includes(node)) candidates.push(node);
  return candidates.filter((host) => {
    // The block-input id prefix also matches Roam's LIVE editing <textarea> (probe-confirmed id
    // shape), whose textContent is the raw block string — claiming it would mount a grid inside a
    // form control and tag the live editor. Edit mode = hands off.
    const tag = String(host.tagName || "").toUpperCase();
    if (tag === "TEXTAREA" || tag === "INPUT") return false;
    const active = globalThis.document?.activeElement;
    const activeTag = String(active?.tagName || "").toUpperCase();
    if (active && active !== host && (activeTag === "TEXTAREA" || activeTag === "INPUT") && host.contains?.(active)) return false;
    return String(host.textContent || "").includes("roam-grid-range");
  });
}

function mountRangeTextHost(host, info, surface = instanceSurface(host)) {
  const current = runtime.viewsByNative.get(host);
  if (current?.root?.isConnected) return current;
  const session = getOrCreateNativeSession(info.tableUid);
  const view = new RangeGridView({ host, session, range: info.range, label: info.label, nativeElement: host, surface });
  view.root.dataset.roamGridUid = info.tableUid; view.root.dataset.roamGridInstance = cryptoId();
  runtime.views.add(view); runtime.viewsByNative.set(host, view);
  return view;
}

function mountRangeClaim(element, info) {
  return element?.matches?.(RANGE_BUTTON_SELECTOR) ? mountRangeInstance(element, info) : mountRangeTextHost(element, info);
}

function noteRangeLoopError(error, trace, button = null) {
  if (globalThis.window) globalThis.window.__RG_U3_LAST_ERROR = String(error?.stack || error);
  trace("loop-error", String(error?.message || error));
  // A pre-hidden button whose processing died must fail VISIBLE, never invisible.
  button?.classList?.add?.("rg-range-restored");
}

/**
 * The range half of `scanMounts`, factored out so it is directly testable and crash-isolated:
 * every element is processed in its own try/catch, so one throw can no longer abandon the rest of
 * the loop and leave pre-hidden buttons invisible. A button we do not claim must be un-hidden, or
 * the pre-paint rule leaves blank space.
 */
export function claimRangeMounts(root, {
  entries = runtime.rangeSpecs,
  metadataEntries = runtime.metadata?.entries,
  readString = blockString,
  mount = mountRangeClaim,
  trace = traceRange,
  viewsByNative = runtime.viewsByNative,
} = {}) {
  if (!root || !metadataEntries) return;
  for (const button of rangeButtonsWithin(root)) {
    if (viewsByNative.get(button)?.root?.isConnected) continue;
    let info = null;
    try {
      info = rangeInstanceInfo(button, entries, readString, trace);
      if (!info) { button.classList.add("rg-range-restored"); continue; }
      const entry = metadataEntries.get(info.tableUid);
      if (!entry) { trace("no-metadata", info.tableUid); button.classList.add("rg-range-restored"); continue; }
      if (entry.value?.mode === "large") { trace("large-source", info.tableUid); button.classList.add("rg-range-restored"); continue; }
    } catch (error) { noteRangeLoopError(error, trace, button); continue; }
    try {
      // A host text-claimed before Roam rendered the component button must yield to it — one
      // excerpt per block. Dispose the text view before the button view mounts.
      const textHost = roamBlockInputFor(button);
      const priorTextView = textHost ? viewsByNative.get(textHost) : null;
      if (priorTextView) {
        viewsByNative.delete(textHost);
        runtime.views.delete(priorTextView);
        priorTextView.dispose?.({ releaseNative: false });
      }
      mount(button, info);
      trace("mounted", info.tableUid);
    } catch (error) {
      if (globalThis.window) globalThis.window.__RG_U3_LAST_ERROR = String(error?.stack || error);
      trace("mount-error", info.tableUid);
      console.error("[roam-grid] Range mount failed", info.tableUid, error);
      button.classList.add("rg-range-restored");
      button.parentElement?.querySelector?.(".rg-range")?.remove();
    }
  }
  // Raw-string fallback: a host whose component Roam never rendered as a button still mounts,
  // discovered by text but verified by the Datascript read. The button path wins — a host that
  // contains any range button was already handled above.
  for (const host of rangeTextHostsWithin(root)) {
    try {
      if (viewsByNative.get(host)?.root?.isConnected) continue;
      if (rangeButtonsWithin(host).length) continue;
      if (getSetting("ranges-live-references") === false) { trace("refs-off"); continue; }
      const blockUid = uidFromFocusTarget(host) || rangeBlockUid(host);
      if (!blockUid) { trace("no-uid"); continue; }
      let text = "";
      try { text = readString(blockUid) || ""; } catch { text = ""; }
      if (!text) { trace("empty-read", blockUid); continue; }
      // The host-hide erases the host's other children, so a block with prose around the marker
      // keeps Roam's native render: text-claim only when the trimmed Datascript string IS the
      // marker alone (an anchored full match; RANGE_MARKER itself keeps its search semantics —
      // the button path may still claim the button inside a mixed block).
      const trimmed = text.trim();
      const only = RANGE_MARKER.exec(trimmed);
      if (!only || only.index !== 0 || only[0].length !== trimmed.length) { trace("no-spec", blockUid); continue; }
      const spec = parseRangeComponent(text);
      if (!spec) { trace("no-spec", blockUid); continue; }
      const entry = metadataEntries.get(spec.tableUid);
      if (!entry) { trace("no-metadata", spec.tableUid); continue; }
      if (entry.value?.mode === "large") { trace("large-source", spec.tableUid); continue; }
      mount(host, { ...spec, blockUid });
      host.classList.add("rg-range-host");
      trace("text-mounted", spec.tableUid);
    } catch (error) { noteRangeLoopError(error, trace); }
  }
}

function cleanupDisconnectedViews() {
  for (const view of [...runtime.views]) {
    if (view.root?.isConnected && view.nativeElement?.isConnected) continue;
    runtime.views.delete(view); runtime.viewsByNative.delete?.(view.nativeElement); view.dispose({ releaseNative: false });
  }
  for (const [uid, session] of [...runtime.sessions]) if (!runtime.metadata?.has(uid)) disposeNativeSession(uid, true);
  for (const [uid, mount] of [...runtime.largeMounts]) {
    if (mount.root?.isConnected && runtime.metadata?.has(uid)) continue;
    if (!runtime.metadata?.has(uid)) { mount.dispose(); runtime.largeMounts.delete(uid); runtime.largeStores.delete(uid); }
    else {
      const store = mount.store;
      mount.dispose({ keepStore: true }); runtime.largeMounts.delete(uid);
      const prior = runtime.largeStores.get(uid); if (prior) clearTimeout(prior.idleTimer);
      runtime.largeStores.set(uid, { store, idleTimer: setTimeout(() => { runtime.largeStores.delete(uid); store.dispose(); }, getSetting("session-idle-ms")) });
    }
  }
}

function scheduleScan(root = document) {
  if (!root || !runtime.metadata) return;
  claimNativeInstances(root);
  runtime.pendingScanRoots.add(root);
  if (runtime.scanQueued) return;
  runtime.scanQueued = true;
  queueMicrotask(() => { runtime.scanQueued = false; scanMounts(); });
}

function containsRenderedBlockReference(node) {
  return Boolean(node?.nodeType === 1 && (node.matches?.(".rm-block-ref") || node.querySelector?.(".rm-block-ref")));
}

function handleDomMutations(records) {
  let referencesChanged = false;
  for (const record of records || []) {
    for (const node of record.addedNodes || []) if (node.nodeType === 1) {
      referencesChanged ||= containsRenderedBlockReference(node);
      scheduleScan(node);
    }
    for (const node of record.removedNodes || []) referencesChanged ||= containsRenderedBlockReference(node);
  }
  if (referencesChanged) for (const session of runtime.sessions.values()) session.scheduleReferenceCountRefresh();
  // Removal-only batches never trigger a full-document scan: `scheduleScan(document)` walks every
  // block's textContent synchronously on every popover close / block delete / virtual scroll.
  // Removals need no claiming — `cleanupDisconnectedViews` (run at the end of every real scan)
  // disposes views whose hosts are gone — and a subsequent add in the next batch scans normally.
}

/** Portal subtrees are scanned added-node-first only — they must never fall back to a document scan. */
function handlePortalMutations(records) {
  for (const record of records || []) for (const node of record.addedNodes || []) if (node.nodeType === 1) scheduleScan(node);
}

function isBlueprintPortal(node) {
  return Boolean(node?.nodeType === 1 && node.matches?.(".bp3-portal"));
}

function attachPortalObserver(portal, MutationObserverClass, scan) {
  if (!portal || portalObservers.has(portal)) return null;
  const observer = new MutationObserverClass(handlePortalMutations);
  observer.observe(portal, { childList: true, subtree: true });
  portalObservers.set(portal, observer);
  scan(portal);
  return observer;
}

function detachPortalObserver(portal) {
  const observer = portalObservers.get(portal);
  if (!observer) return false;
  observer.disconnect?.(); portalObservers.delete(portal);
  return true;
}

export function disposePortalObservers() {
  runtime.portalBodyObserver?.disconnect?.(); runtime.portalBodyObserver = null;
  for (const portal of [...portalObservers.keys()]) detachPortalObserver(portal);
}

/**
 * Blueprint hangs `.bp3-portal` off `<body>`, outside the `.roam-app` subtree `runtime.observer`
 * watches — while the pre-paint guard is document-global. Without this, a table in a hover preview
 * is hidden but never claimed, so it renders as blank space.
 */
export function installPortalObservers({ MutationObserverClass = globalThis.MutationObserver, ownerDocument = globalThis.document, scan = scheduleScan } = {}) {
  const body = ownerDocument?.body;
  if (!body || typeof MutationObserverClass !== "function") return () => {};
  const observer = new MutationObserverClass((records) => {
    for (const record of records || []) {
      for (const node of record.addedNodes || []) if (isBlueprintPortal(node)) attachPortalObserver(node, MutationObserverClass, scan);
      for (const node of record.removedNodes || []) if (isBlueprintPortal(node)) detachPortalObserver(node);
    }
  });
  observer.observe(body, { childList: true });
  runtime.portalBodyObserver = observer;
  for (const portal of ownerDocument.querySelectorAll?.(".bp3-portal") || []) attachPortalObserver(portal, MutationObserverClass, scan);
  runtime.disposers.push(disposePortalObservers);
  return disposePortalObservers;
}

async function scanMounts() {
  if (!runtime.metadata) return;
  const roots = runtime.pendingScanRoots.size ? [...runtime.pendingScanRoots] : [document]; runtime.pendingScanRoots.clear();
  for (const root of roots) {
    for (const nativeElement of nativeTablesWithin(root)) {
      let info = null;
      try {
        info = nativeTableInstanceInfo(nativeElement); if (!info || runtime.viewsByNative.get(nativeElement)?.root?.isConnected) continue;
        mountNativeInstance(nativeElement, info);
      } catch (error) {
        console.error("[roam-grid] Mount failed", info?.uid, error);
        nativeElement.classList.remove("rg-native-hidden", "rg-native-pending");
        nativeElement.parentElement?.querySelector?.(".rg-root")?.remove();
        toast(`Roam Grid could not enhance ${info?.uid || "table"}: ${error.message}`, "danger", 10000);
      }
    }
    claimRangeMounts(root);
  }
  for (const [uid, entry] of runtime.metadata.entries) {
    if (entry.value.mode !== "large" || runtime.largeMounts.get(uid)?.root?.isConnected || mounting.has(uid)) continue;
    mounting.add(uid);
    try {
      const block = findBlockElement(uid); if (!block) continue;
      const marker = block.querySelector(".rm-block__input") || block.firstElementChild;
      // Dispose any disconnected mount from a prior scan so its store is warm-reusable
      // and no old-listener leak survives. Must run BEFORE the warm-store decision.
      const old = runtime.largeMounts.get(uid);
      if (old && !old.root?.isConnected) {
        old.dispose({ keepStore: true });
        if (old.store && !old.store.disposed && !runtime.largeStores.has(uid)) {
          runtime.largeStores.set(uid, { store: old.store, idleTimer: setTimeout(() => { runtime.largeStores.delete(uid); old.store.dispose(); }, getSetting("session-idle-ms")) });
        }
      }
      let store;
      const warm = runtime.largeStores.get(uid);
      if (warm?.store && !warm.store.disposed) { clearTimeout(warm.idleTimer); runtime.largeStores.delete(uid); store = warm.store; }
      else store = await new LargeGridStore(uid).initialize();
      // An unload can land during the initialize await; mounting a live view (+listeners +timers)
      // into a torn-down runtime would leak it. The metadata re-check is the liveness probe.
      if (!runtime.metadata || !runtime.extensionAPI) continue;
      const view = new LargeGridView({ host: block, store, markerElement: marker });
      if (!runtime.metadata) { try { view.dispose(); } catch { /* mid-unload */ } continue; }
      view.root.dataset.roamGridUid = uid; view.root.__rgView = view; runtime.largeMounts.set(uid, view);
    } catch (error) { console.error("[roam-grid] Large-grid mount failed", uid, error); toast(`Roam Grid could not mount ${uid}: ${error.message}`, "danger", 10000); }
    finally { mounting.delete(uid); }
  }
  cleanupDisconnectedViews();
}

function registerCommands(extensionAPI) {
  const commands = [
    ["Roam Grid: Enhance this table", enhanceFocusedTable],
    ["Roam Grid: Restore native table", restoreFocusedTable],
    ["Roam Grid: Save current grid as template", saveFocusedTemplate],
    ["Roam Grid: New from saved template", newFromSavedTemplate],
    ["Roam Grid: New large grid", newLargeGrid],
    ["Roam Grid: Copy/convert table", convertFocusedGrid],
    ["Roam Grid: Import", importCommand],
    ["Roam Grid: Export", exportFocusedCommand],
    ["Roam Grid: Restore discarded edits", restoreDiscardedEditsCommand],
    ["Roam Grid: Undo", () => commandOnActive("undo")],
    ["Roam Grid: Redo", () => commandOnActive("redo")],
    ["Roam Grid: Insert chart", () => commandOnActive("insertChart")],
    ["Roam Grid: Merge", () => commandOnActive("mergeSelection", "merge")],
    ["Roam Grid: Unmerge", () => commandOnActive("unmergeSelection", "unmerge")],
  ];
  const labels = [];
  for (const [label, callback] of commands) {
    extensionAPI.ui.commandPalette.addCommand({ label, callback });
    extensionAPI.ui.slashCommand.addCommand({ label, callback });
    labels.push(label);
  }
  // Roam does NOT unregister commands on disable/reload — without this disposer every
  // enable→disable cycle duplicates every palette/slash entry, and invoking a stale one while
  // disabled throws into a gated-inert toast. `onunload` runs this via runtime.disposers.
  runtime.disposers.push(() => {
    for (const label of labels) {
      try { extensionAPI.ui.commandPalette.removeCommand(label); } catch { /* registry already gone */ }
      try { extensionAPI.ui.slashCommand.removeCommand(label); } catch { /* registry already gone */ }
    }
  });
}

/** Rewrites the display flags of every grid already on screen, from `displayRestampValues` rather than
 *  `displayDefaults`. This is the only path that may retro-apply them: `!== false` semantics mean an
 *  open grid's own flags are indistinguishable from "never chosen", so nothing changes them behind the
 *  user's back — and it is the only bulk path that can lift an explicit per-table `showHeaders: false`,
 *  which the live mask deliberately cannot. `colorFormulaCells` is absent: it has no per-table state
 *  worth forcing, only the `fx` button, and 0.9.0 removed it here when the tint mask landed. */
export function applyDisplayDefaultsToOpenGrids() {
  let grids = 0;
  const values = displayRestampValues();
  for (const session of runtime.sessions.values()) {
    if (!session?.model) continue;
    Object.assign(session.model, values); grids += 1;
    try { session.markChanged(true); } catch (error) { console.warn("[roam-grid] Could not persist display defaults", error); }
    for (const view of session.views || []) {
      try { view.render(); } catch (error) { console.warn("[roam-grid] Could not repaint a grid view", error); }
    }
  }
  for (const mount of runtime.largeMounts.values()) {
    if (!mount?.store?.manifest) continue;
    mount.store.setDisplayFlag("showHeaders", values.showHeaders);
    mount.store.setDisplayFlag("fitToWidth", values.fitToWidth);
    grids += 1; mount.rowMetricsKey = null;
    try { mount.scheduleSave(true); mount.scheduleRender(); } catch (error) { console.warn("[roam-grid] Could not repaint a large grid", error); }
  }
  toast(grids ? `Applied display defaults to ${grids} open grid${grids === 1 ? "" : "s"}.` : "No grids are open right now.", grids ? "success" : "warning");
  return grids;
}

export async function runMaintenanceAction(key, { extensionAPI = runtime.extensionAPI, storage = globalThis.localStorage, rebuildPanel = null } = {}) {
  if (key === "maintenance-apply-display") return applyDisplayDefaultsToOpenGrids();
  if (key === "maintenance-forget-device") {
    writeDeviceSettings({}, storage);
    refreshSettingsCache(extensionAPI, storage);
    for (const descriptor of Object.values(SETTINGS)) if (descriptor.scope === "device") applySettingsChange(descriptor);
    await rebuildPanel?.();
    toast("Forgot this device's Roam Grid overrides.", "success");
    return true;
  }
  if (key === "maintenance-clear-caches") {
    try { storage?.removeItem?.(graphCacheKey()); } catch { /* localStorage can be unavailable in hardened browsers */ }
    try { storage?.removeItem?.(largeUidCacheKey()); } catch { /* localStorage can be unavailable in hardened browsers */ }
    writeEnhancedUidCache([], storage);
    writeLargeUidCache([], storage);
    runtime.gridThemePalette = null; runtime.gridThemeSignature = null;
    for (const session of runtime.sessions.values()) session.themePalette = null;
    toast("Cleared the local Roam Grid caches.", "success");
    return true;
  }
  if (key === "maintenance-migrate-templates") {
    try {
      const result = await migrateLegacyTemplates();
      if (result.reentered) toast("Template migration is already running.", "warning");
      else if (!result.legacy) toast("No legacy grid templates to migrate.", "warning");
    } catch (error) {
      if (globalThis.window) globalThis.window.__RG_U2_LAST_ERROR = String(error?.stack || error);
      toast(`Template migration failed: ${error.message}`, "danger", 8000);
    }
    return true;
  }
  if (key === "maintenance-reset") {
    // Pending rows are never rendered and never seeded, so a reset must not start writing them.
    for (const descriptor of Object.values(SETTINGS)) {
      if (descriptor.stage === "pending") continue;
      await setSetting(descriptor.key, descriptor.default, { extensionAPI, storage });
    }
    // `setSetting` re-shadows each device key as it goes, so the shadow is emptied last: a reset
    // should leave nothing device-local behind, not a device copy of every default.
    writeDeviceSettings({}, storage);
    refreshSettingsCache(extensionAPI, storage);
    await rebuildPanel?.();
    toast("Reset every Roam Grid setting to its default.", "success");
    return true;
  }
  return false;
}

export async function initializeSettings(extensionAPI, { storage = globalThis.localStorage } = {}) {
  const stored = { ...readGraphSettings(extensionAPI) };
  const plan = planSettingsMigration(stored[SETTINGS_VERSION_KEY], stored);
  // The legacy sidebar switch was device-scoped, so its value lives in the localStorage shadow:
  // migrate the shadow BEFORE the seeding loop. Seeding first would stamp the graph with the
  // compose-mode default, then the migrated device value would shadow it only until a "Forget
  // this device's overrides" emptied the shadow and silently reverted the migration.
  const deviceMigration = planDeviceSettingsMigration(readDeviceSettings(storage));
  if (deviceMigration.changed) writeDeviceSettings(deviceMigration.values, storage);
  if (extensionAPI.settings.canSet !== false) {
    for (const [key, value] of plan.writes) { await extensionAPI.settings.set(key, value); stored[key] = value; }
    for (const descriptor of Object.values(SETTINGS)) {
      if (descriptor.stage === "pending" || stored[descriptor.key] != null) continue;
      // Seed the graph from the migrated device value when the graph has none, so both layers
      // agree after a device migration — otherwise a later forget-device would revert it.
      const migratedDevice = descriptor.scope === "device" ? deviceMigration.values[descriptor.key] : undefined;
      const seed = migratedDevice != null ? coerceSetting(descriptor, migratedDevice) : descriptor.default;
      await extensionAPI.settings.set(descriptor.key, seed);
      stored[descriptor.key] = seed;
    }
  }
  refreshSettingsCache(extensionAPI, storage);
  // Roam renders each row's value once, so anything that rewrites values behind the panel's back
  // has to hand it a fresh config rather than mutating the live rows.
  const rebuildPanel = () => extensionAPI.settings.panel.create(buildSettingsPanelConfig({
    onChange: (key, value) => { void setSetting(key, value, { extensionAPI, storage }); },
    onClick: (key) => { void runMaintenanceAction(key, { extensionAPI, storage, rebuildPanel }); },
  }));
  await rebuildPanel();
}

let roamGridGlobalPreexisted = false;

async function onload({ extensionAPI }) {
  roamGridGlobalPreexisted = Boolean(globalThis.window?.roamGrid);
  try {
    installEnhancedUidGuard(readEnhancedUidCache());
    runtime.extensionAPI = extensionAPI; runtime.registries = new RegistrySet(); runtime.metadata = new MetadataStore(); runtime.templates = new GridTemplateStore();
    await runtime.metadata.initialize(); syncEnhancedUidGuard(); await runtime.templates.initialize(); await initializeSettings(extensionAPI); registerCommands(extensionAPI);
    const publicApi = createPublicApi(); globalThis.window.roamGrid = { ...(globalThis.window.roamGrid || {}), v1: publicApi };
    document.addEventListener("focusin", rememberFocusedUid, true);
    runtime.disposers.push(() => document.removeEventListener("focusin", rememberFocusedUid, true));
    installKeyboardOwnership();
    installCommentAffordance();
    runtime.observer = new MutationObserver(handleDomMutations); runtime.observer.observe(document.querySelector(".roam-app") || document.body, { childList: true, subtree: true });
    installPortalObservers();
    scheduleScan(document);
  } catch (error) {
    await onunload();
    throw error;
  }
  console.info(`[roam-grid] Loaded v${VERSION}`);
  scheduleRecentsWarm();
  // Legacy-template migration is idle work: scheduled only when the load-time reload actually
  // found legacy JSON (steady state costs no timer and no writes), tracked so onunload cancels it.
  if ([...runtime.templates.entries.values()].some((entry) => entry.legacyValue)) {
    trackedTimeout(() => {
      migrateLegacyTemplates().catch((error) => {
        if (globalThis.window) globalThis.window.__RG_U2_LAST_ERROR = String(error?.stack || error);
        console.warn("[roam-grid] Legacy template migration failed", error);
      });
    }, 4000);
  }
}

async function onunload() {
  runtime.observer?.disconnect(); runtime.observer = null; disposePortalObservers(); runtime.pendingScanRoots.clear(); runtime.rangeSpecs.clear(); runtime.scanQueued = false;
  for (const uid of [...runtime.sessions.keys()]) disposeNativeSession(uid, true);
  for (const mount of runtime.largeMounts.values()) mount.dispose(); runtime.largeMounts.clear(); mounting.clear();
  for (const { store, idleTimer } of runtime.largeStores.values()) { clearTimeout(idleTimer); store.dispose(); }
  runtime.largeStores.clear();
  releaseLargeScratch();
  resetChunkCache();
  resetOrphanCollection();
  clearUndoHistories();
  settingsCache.clear();
  imageDimensionCache.clear();
  runtime.guardStyle?.remove(); runtime.guardStyle = null;
  runtime.guardLargeStyle?.remove(); runtime.guardLargeStyle = null;
  for (const dispose of runtime.disposers.splice(0)) try { dispose(); } catch { /* no-op */ }
  cancelRecentsWarm();
  // Session health is per load, never persisted: a reload must start from a clean slate instead of
  // carrying a graph's mount-failure or budget flags across the unload boundary.
  resetNativeEditorHealth();
  resetRoamRecents();
  resetSuggestionRendering();
  clearTrackedTimers();
  // `.rg-lightbox` joins the sweep so an open modal dialog is dismissed via its `__rgDismiss` (which
  // unmounts the renderString host), not merely orphaned behind its inert backdrop on unload (FIX-2).
  document.querySelectorAll(".rg-toasts,.rg-dialog-overlay,.rg-context-menu,.rg-lightbox").forEach((element) => {
    if (element.__rgDismiss) element.__rgDismiss(); else element.remove();
  });
  if (globalThis.window?.roamGrid?.v1?.version === VERSION) delete globalThis.window.roamGrid.v1;
  if (!roamGridGlobalPreexisted && globalThis.window?.roamGrid && Object.keys(globalThis.window.roamGrid).length === 0) delete globalThis.window.roamGrid;
  roamGridGlobalPreexisted = false;
  runtime.extensionAPI = null; runtime.metadata = null; runtime.templates = null; runtime.registries = null; runtime.lastFocusedUid = null; runtime.keyboardOwner = null; runtime.commentArmed = false; runtime.gridThemePalette = null; runtime.gridThemeSignature = null; runtime.views.clear(); runtime.viewsByNative = new WeakMap();
  console.info("[roam-grid] Unloaded");
}

export default { onload, onunload };
