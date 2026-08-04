const VERSION = "0.6.0";
const NATIVE_MARKER = /\{\{(?:\[\[)?table(?:\]\])?\}\}/i;
const LARGE_MARKER = /\{\{(?:\[\[)?roam\/grid(?:\]\])?\}\}/i;
const METADATA_PAGE = "roam/grid/metadata";
const METADATA_PREFIX = "roam-grid/table::";
const TEMPLATE_PAGE = "roam/grid/templates";
const TEMPLATE_PREFIX = "roam-grid/template::";
const MANIFEST_PREFIX = "roam-grid/manifest::";
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
const ENHANCED_UID_CACHE_PREFIX = "roam-grid:enhanced-uids:";
const SESSION_IDLE_MS = 1500;

const runtime = {
  extensionAPI: null,
  observer: null,
  metadata: null,
  templates: null,
  sessions: new Map(),
  largeMounts: new Map(),
  views: new Set(),
  viewsByNative: new WeakMap(),
  guardStyle: null,
  pendingScanRoots: new Set(),
  scanQueued: false,
  gridThemePalette: null,
  gridThemeSignature: null,
  disposers: [],
  registries: null,
  lastFocusedUid: null,
};

function cssAttributeValue(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/[\n\r\f]/g, "");
}

export function graphCacheKey(hash = globalThis.location?.hash || "") {
  const graph = /#\/app\/([^/]+)/.exec(String(hash))?.[1] || "unknown";
  return `${ENHANCED_UID_CACHE_PREFIX}${decodeURIComponent(graph)}`;
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

export function enhancedUidGuardCss(uids) {
  const selectors = [];
  for (const uid of [...new Set([...uids].map(String).filter(Boolean))].sort()) {
    const escaped = cssAttributeValue(uid);
    selectors.push(
      `[id$="${escaped}"] .rm-table:not(.rg-native-hidden)`,
      `.rm-block-ref[data-uid="${escaped}"] .rm-table:not(.rg-native-hidden)`,
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

export function fittedTrackResize(widths, targetId, requestedWidth, minimum = MIN_COL_WIDTH) {
  const ids = Object.keys(widths);
  if (!ids.includes(targetId)) return { ...widths };
  if (ids.length === 1) return { [targetId]: clamp(requestedWidth, minimum, MAX_COL_WIDTH) };
  const total = ids.reduce((sum, id) => sum + Math.max(minimum, Number(widths[id]) || minimum), 0);
  const requested = clamp(requestedWidth, minimum, MAX_COL_WIDTH);
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

export class GridModel {
  constructor({ rows = [[]], tableUid = null, columnIds = [], merges = [], widths = {}, rowHeights = {}, alignments = {}, headerColumns = [], headerRows = [], frozenRows = 1, frozenCols = 0, charts = [], showHeaders = true, fitToWidth = true, colorFormulaCells = true, revision = null } = {}) {
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
    this.showHeaders = showHeaders !== false;
    this.fitToWidth = fitToWidth !== false;
    this.colorFormulaCells = colorFormulaCells !== false;
    this.revision = revision;
    this.undoStack = [];
    this.redoStack = [];
    this.lastChangedCells = [];
    this.lastChangedCellUids = [];
    this.collectingChangedCells = null;
    this.validateMerges({ repair: true });
  }

  get rowCount() { return this.rows.length; }
  get colCount() { return this.columnIds.length; }
  inBounds(row, col) { return row >= 0 && row < this.rowCount && col >= 0 && col < this.colCount; }
  getCell(row, col) { return this.rows[row]?.[col] || null; }
  getRaw(row, col) { return this.getCell(row, col)?.raw ?? ""; }
  getValue(row, col, engine = null) { return (engine || new FormulaEngine(this, runtime.registries?.formulaFunctions || defaultFormulaFunctions())).evaluateCell(row, col); }
  rowKey(row) { return this.rows[row]?.[0]?.uid || null; }
  getRowHeight(row) {
    const value = Number(this.rowHeights[this.rowKey(row)]);
    return Number.isFinite(value) ? clamp(Math.round(value), MIN_ROW_HEIGHT, MAX_ROW_HEIGHT) : null;
  }
  setRowHeight(row, height) {
    const key = this.rowKey(row);
    if (!key) throw new GridError("OUT_OF_BOUNDS", `Row ${row + 1} is outside the grid`);
    if (height == null || height === "") delete this.rowHeights[key];
    else {
      const value = Number(height);
      if (!Number.isFinite(value)) throw new GridError("ROW_HEIGHT", "Row height must be a number");
      this.rowHeights[key] = clamp(Math.round(value), MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
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

  snapshot() {
    return {
      rows: deepClone(this.rows), columnIds: [...this.columnIds], merges: deepClone(this.merges), widths: { ...this.widths }, rowHeights: { ...this.rowHeights }, alignments: { ...this.alignments }, headerColumns: [...this.headerColumns], headerRows: [...this.headerRows],
      frozenRows: this.frozenRows, frozenCols: this.frozenCols, charts: deepClone(this.charts), showHeaders: this.showHeaders, fitToWidth: this.fitToWidth, colorFormulaCells: this.colorFormulaCells, revision: this.revision,
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
    this.showHeaders = snapshot.showHeaders !== false;
    this.fitToWidth = snapshot.fitToWidth !== false;
    this.colorFormulaCells = snapshot.colorFormulaCells !== false;
    this.revision = snapshot.revision;
  }

  transact(label, mutation) {
    const before = this.snapshot();
    const previousCollector = this.collectingChangedCells;
    const changedCells = new Set();
    this.collectingChangedCells = changedCells;
    try {
      const result = mutation(this);
      this.validateMerges();
      this.undoStack.push({ label, snapshot: before });
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack.length = 0;
      this.lastChangedCells = [...changedCells].map((key) => key.split(":").map(Number));
      this.lastChangedCellUids = this.lastChangedCells.map(([row, col]) => this.getCell(row, col)?.uid).filter(Boolean);
      return result;
    } catch (error) {
      this.restore(before);
      this.lastChangedCells = [];
      this.lastChangedCellUids = [];
      throw error;
    } finally {
      this.collectingChangedCells = previousCollector;
    }
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push({ label: entry.label, snapshot: this.snapshot() });
    this.restore(entry.snapshot);
    return true;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push({ label: entry.label, snapshot: this.snapshot() });
    this.restore(entry.snapshot);
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
    if (this.rows[row][col].raw === value) return false;
    this.rows[row][col].raw = value;
    this.collectingChangedCells?.add(`${row}:${col}`);
    return true;
  }

  rewriteStructuralFormulas(change) {
    for (let row = 0; row < this.rowCount; row += 1) for (let col = 0; col < this.colCount; col += 1) {
      const cell = this.rows[row][col];
      if (cell.raw.startsWith("=") && !cell.raw.startsWith("==")) {
        const rewritten = rewriteFormulaForStructure(cell.raw, { ...change, formulaRow: row, formulaCol: col });
        if (rewritten !== cell.raw) {
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
    this.columnIds.splice(at, 0, ...ids);
    for (const row of this.rows) row.splice(at, 0, ...Array.from({ length: count }, () => ({ uid: makeLocalUid(), raw: "" })));
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
        this.rows[merge.row][survivingCol].raw = anchorRaw;
      }
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
    this.rows = [...this.rows.slice(0, headerRows), ...data.map((entry) => entry.row)];
    for (const merge of this.merges) if (merge.row >= headerRows) merge.row = oldToNew.get(merge.row);
  }

  toJSON() {
    return { schema: "roam-grid", version: 1, tableUid: this.tableUid, rows: this.rows, columnIds: this.columnIds, merges: this.merges, widths: this.widths, rowHeights: this.rowHeights, alignments: this.alignments, headerColumns: this.headerColumns, headerRows: this.headerRows, frozenRows: this.frozenRows, frozenCols: this.frozenCols, charts: this.charts, showHeaders: this.showHeaders, fitToWidth: this.fitToWidth, colorFormulaCells: this.colorFormulaCells, revision: this.revision };
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
  }

  register(map, key, value) {
    const normalized = String(key).toUpperCase();
    if (map.has(normalized)) throw new GridError("REGISTRY_DUPLICATE", `${key} is already registered`);
    map.set(normalized, value);
    return () => map.delete(normalized);
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

function getTree(uid) {
  const safeUid = String(uid).replace(/["\\]/g, "");
  const result = roam().q(`[:find (pull ?block [:block/uid :block/string :block/order :edit/time {:block/children ...}]) :where [?block :block/uid "${safeUid}"]]`);
  return normalizeTree(result?.[0]?.[0]);
}

function getPageUid(title) {
  const result = roam().data?.pull?.("[:block/uid]", [":node/title", title]) || roam().pull?.("[:block/uid]", [":node/title", title]);
  return result?.[":block/uid"] || result?.uid || null;
}

async function createPage(title) {
  const uid = roam().util.generateUID();
  await (roam().data?.page?.create || roam().createPage).call(roam().data?.page || roam(), { page: { title, uid } });
  return uid;
}

async function createBlock(parentUid, string, order = "last", uid = null) {
  const blockUid = uid || roam().util.generateUID();
  const create = roam().data?.block?.create || roam().createBlock;
  await create.call(roam().data?.block || roam(), { location: { "parent-uid": parentUid, order }, block: { uid: blockUid, string: String(string ?? "") } });
  return blockUid;
}

async function updateBlock(uid, string) {
  const update = roam().data?.block?.update || roam().updateBlock;
  return update.call(roam().data?.block || roam(), { block: { uid, string: String(string ?? "") } });
}

async function moveBlock(uid, parentUid, order = "last") {
  const move = roam().data?.block?.move || roam().moveBlock;
  return move.call(roam().data?.block || roam(), { location: { "parent-uid": parentUid, order }, block: { uid } });
}

async function deleteBlock(uid) {
  const remove = roam().data?.block?.delete || roam().deleteBlock;
  return remove.call(roam().data?.block || roam(), { block: { uid } });
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
    if (model.columnIds[col] && Number.isFinite(width)) model.widths[model.columnIds[col]] = clamp(Math.round(width), MIN_COL_WIDTH, MAX_COL_WIDTH);
  });
  (value.rowHeights || []).forEach((height, row) => { if (row < model.rowCount && Number.isFinite(height)) model.setRowHeight(row, height); });
  (value.alignments || []).forEach((alignments, row) => (alignments || []).forEach((alignment, col) => {
    if (row < model.rowCount && col < model.colCount && alignment) model.setAlignment(row, col, alignment);
  }));
  for (const col of value.headerColumns || []) if (Number.isInteger(col) && col >= 0 && col < model.colCount) model.toggleHeaderColumn(col);
  for (const row of value.headerRows || []) if (Number.isInteger(row) && row >= 0 && row < model.rowCount) model.toggleHeaderRow(row);
  return model;
}

class MetadataStore {
  constructor() {
    this.pageUid = null;
    this.entries = new Map();
  }

  async initialize() {
    this.pageUid = getPageUid(METADATA_PAGE) || await createPage(METADATA_PAGE);
    await this.reload();
  }

  async reload() {
    this.entries.clear();
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
    return { columnIds: value.columnIds || [], merges: value.merges || [], widths: value.widths || {}, rowHeights: value.rowHeights || {}, alignments: value.alignments || {}, headerColumns: value.headerColumns || [], headerRows: value.headerRows || [], frozenRows: value.frozenRows ?? 1, frozenCols: value.frozenCols ?? 0, charts: value.charts || [], showHeaders: value.showHeaders !== false, fitToWidth: value.fitToWidth !== false, colorFormulaCells: value.colorFormulaCells !== false };
  }

  has(tableUid) { return this.entries.has(tableUid); }

  async set(tableUid, model, mode = "native") {
    const value = { schema: 1, mode, tableUid, columnIds: model.columnIds, merges: model.merges, widths: model.widths, rowHeights: model.rowHeights, alignments: model.alignments, headerColumns: model.headerColumns, headerRows: model.headerRows, frozenRows: model.frozenRows, frozenCols: model.frozenCols, charts: model.charts, showHeaders: model.showHeaders !== false, fitToWidth: model.fitToWidth !== false, colorFormulaCells: model.colorFormulaCells !== false, updatedAt: new Date().toISOString() };
    const string = `${METADATA_PREFIX} ${JSON.stringify(value)}`;
    const entry = this.entries.get(tableUid);
    const blockUid = entry ? entry.blockUid : await createBlock(this.pageUid, string);
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
    return createBlock(this.pageUid, `roam-grid/staging:: ${tableUid}`);
  }
}

class GridTemplateStore {
  constructor() {
    this.pageUid = null;
    this.entries = new Map();
  }

  async initialize() {
    this.pageUid = getPageUid(TEMPLATE_PAGE);
    await this.reload();
  }

  async ensurePage() {
    if (!this.pageUid) this.pageUid = getPageUid(TEMPLATE_PAGE) || await createPage(TEMPLATE_PAGE);
    return this.pageUid;
  }

  async reload() {
    this.entries.clear();
    if (!this.pageUid) return;
    const tree = getTree(this.pageUid);
    for (const block of tree?.children || []) {
      if (!block.string.startsWith(TEMPLATE_PREFIX)) continue;
      try {
        const value = JSON.parse(block.string.slice(TEMPLATE_PREFIX.length).trim());
        if (value.schema !== "roam-grid-template" || value.version !== 1 || !value.name) throw new Error("Unsupported template record");
        this.entries.set(String(value.name).toUpperCase(), { blockUid: block.uid, value });
      } catch (error) {
        console.warn("[roam-grid] Ignoring malformed saved template", block.uid, error);
      }
    }
  }

  list() { return [...this.entries.values()].map(({ value }) => value.name).sort((a, b) => a.localeCompare(b)); }

  get(name) {
    const value = this.entries.get(String(name).toUpperCase())?.value;
    return value ? templateModelFromValue(deepClone(value)) : null;
  }

  async save(name, model) {
    const cleanName = String(name || "").trim();
    if (!cleanName) throw new GridError("TEMPLATE_NAME", "Give this grid template a name");
    if (model.rowCount * model.colCount > MAX_NATIVE_MUTATIONS) throw new GridError("TEMPLATE_SIZE", "Saved templates must fit within the native-table write budget");
    const value = { ...serializeTemplateModel(model, cleanName), updatedAt: new Date().toISOString() };
    const string = `${TEMPLATE_PREFIX} ${JSON.stringify(value)}`;
    const key = cleanName.toUpperCase();
    const existing = this.entries.get(key);
    const pageUid = await this.ensurePage();
    const blockUid = existing ? existing.blockUid : await createBlock(pageUid, string);
    if (existing) await updateBlock(blockUid, string);
    this.entries.set(key, { blockUid, value });
    return cleanName;
  }
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

  load() {
    const tree = getTree(this.tableUid);
    if (!tree || !NATIVE_MARKER.test(tree.string)) throw new GridError("NOT_TABLE", "Focused block is not a native Roam table");
    this.model = nativeTreeToModel(tree, this.metadataStore.get(this.tableUid) || {});
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
    const start = queue.findIndex((item) => item.from === from || item.from == null);
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
      currentCells.forEach((row, rowIndex) => row.forEach((cell, colIndex) => { const desired = model.getRaw(rowIndex, colIndex) === "" ? " " : model.getRaw(rowIndex, colIndex); if (cell.string !== desired) updates.push([cell.uid, desired]); }));
      if (updates.length > MAX_NATIVE_MUTATIONS) throw new GridError("MUTATION_BUDGET", `This edit requires ${updates.length} Roam writes; copy to a large grid instead`);
      for (const [uid, raw] of updates) await updateBlock(uid, raw);
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
    if (mutationEstimate > MAX_NATIVE_MUTATIONS) throw new GridError("MUTATION_BUDGET", `Row deletion requires about ${mutationEstimate} Roam writes; copy to a large grid instead`);
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
    if (!force && mutationEstimate > MAX_NATIVE_MUTATIONS) throw new GridError("MUTATION_BUDGET", `Structural edit requires about ${mutationEstimate} Roam writes; copy to a large grid instead`);
    const stagingUid = await this.metadataStore.createStaging(this.tableUid);
    try {
      for (const row of currentRows) for (const cell of [...row].reverse()) await moveBlock(cell.uid, stagingUid, "last");
      const desiredUids = new Set();
      for (let rowIndex = 0; rowIndex < model.rowCount; rowIndex += 1) for (let colIndex = 0; colIndex < model.colCount; colIndex += 1) {
        const cell = model.rows[rowIndex][colIndex];
        const desired = cell.raw === "" ? " " : cell.raw;
        if (cell.uid.startsWith("rg_") || !current.some((old) => old.uid === cell.uid)) {
          const oldUid = cell.uid;
          cell.uid = await createBlock(stagingUid, desired);
          if (colIndex === 0 && Object.hasOwn(model.rowHeights, oldUid)) {
            model.rowHeights[cell.uid] = model.rowHeights[oldUid];
            delete model.rowHeights[oldUid];
          }
          if (Object.hasOwn(model.alignments, oldUid)) { model.alignments[cell.uid] = model.alignments[oldUid]; delete model.alignments[oldUid]; }
        }
        else if (current.find((old) => old.uid === cell.uid)?.string !== desired) await updateBlock(cell.uid, desired);
        desiredUids.add(cell.uid);
      }
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

/** One canonical native-table model/persistence lane shared by every visible DOM instance. */
export class NativeGridSession {
  constructor(tableUid, { adapter = null, model = null, onIdle = null } = {}) {
    this.tableUid = tableUid;
    this.adapter = adapter || new NativeTableAdapter(tableUid);
    this.model = model || this.adapter.load();
    this.adapter.model = this.model;
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
    this.disposed = false;
    this.stopWatch = this.adapter.watchExternal?.((nextModel, event) => this.handleExternalChange(nextModel, event));
  }

  addView(view) {
    clearTimeout(this.idleTimer); this.idleTimer = null;
    view.session = this; view.model = this.model; view.adapter = this.adapter;
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
    }, SESSION_IDLE_MS);
  }

  async beginEdit(view, start) {
    const previous = this.activeEditorView;
    if (previous && previous !== view && previous.editorController?.state) await previous.editorController.finish(true);
    this.activeEditorView = view;
    return start();
  }

  editorFinished(view) { if (this.activeEditorView === view) this.activeEditorView = null; }

  setSaving(value) { for (const view of this.views) view.root?.classList?.toggle("rg-root--saving", value); }

  replaceModel(model, { render = true } = {}) {
    this.model = model; this.adapter.model = model;
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
    if (!layoutChanged && !this.dirtyCells.size) { this.savedVersion = this.changeVersion; return; }
    this.saveTimer = setTimeout(() => layoutChanged ? this.flushSave() : this.flushContentSave(), layoutChanged ? 0 : 220);
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
    if (this.disposed || this.structuralPending || !this.dirtyCells.size) return;
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
      if (!this.dirtyCells.size && !this.structuralPending) this.savedVersion = this.changeVersion;
    } catch (error) {
      toast(error.message, "danger", 8000);
      this.dirtyCells.clear(); this.structuralPending = false; this.metadataDirty = false;
      try { this.replaceModel(this.adapter.load()); this.changeVersion = this.savedVersion; } catch { /* table may have disappeared */ }
    } finally {
      if (this.contentSavePromise === task) this.contentSavePromise = null;
      if (!this.disposed && !this.structuralPending && this.dirtyCells.size) {
        clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.flushContentSave(), 220);
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
      this.prunePersistenceUids();
      this.model.baseFingerprint = saved.baseFingerprint; this.model.baseSnapshot = saved.baseSnapshot; this.adapter.model = this.model;
      for (const [uid, dirty] of [...this.dirtyCells]) {
        const savedRevision = payloadEditRevisions.get(uid) || 0;
        if (dirty.revision <= savedRevision && dirty.raw === payloadRawByUid.get(uid)) this.dirtyCells.delete(uid);
        else if (payloadRawByUid.has(uid)) this.dirtyCells.set(uid, { ...dirty, baseRaw: payloadRawByUid.get(uid) });
      }
      this.structuralPending = false;
      if (uidMap.size) for (const view of this.views) view.render();
      if (version !== this.changeVersion) {
        clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.structuralPending ? this.flushSave() : this.flushContentSave(), 220);
      }
    } catch (error) {
      this.metadataDirty ||= saveMetadata;
      toast(error.message, "danger", 8000);
      this.dirtyCells.clear(); this.structuralPending = false;
      try { this.replaceModel(this.adapter.load()); this.changeVersion = this.savedVersion; } catch { /* table may have disappeared */ }
    } finally { this.setSaving(false); }
  }

  handleExternalChange(externalModel, event) {
    const localPending = this.structuralPending || this.dirtyCells.size > 0 || this.contentSavePromise;
    if (event.structural || event.type === "structural") {
      this.dirtyCells.clear(); this.structuralPending = false; this.metadataDirty = false;
      clearTimeout(this.saveTimer); this.changeVersion = this.savedVersion;
      this.replaceModel(externalModel, { render: false }); this.adapter.acceptExternalTree?.(event.tree, this.model); this.renderStructural();
      if (localPending || event.conflict) toast("Roam Grid reloaded because the table structure changed elsewhere.", "warning");
      return;
    }
    const conflicts = (event.changes || []).filter((change) => this.dirtyCells.has(change.uid));
    if (conflicts.length) {
      this.dirtyCells.clear(); this.structuralPending = false; clearTimeout(this.saveTimer); this.changeVersion = this.savedVersion;
      this.replaceModel(externalModel, { render: false }); this.adapter.acceptExternalTree?.(event.tree, this.model); this.renderStructural();
      toast("Roam Grid reloaded because this cell changed elsewhere.", "warning");
      return;
    }
    const changed = [];
    for (const change of event.changes || []) {
      const coordinate = this.coordinateForUid(change.uid); if (!coordinate) continue;
      const cell = this.model.getCell(coordinate.row, coordinate.col); if (!cell || cell.raw === change.raw) continue;
      cell.raw = change.raw; changed.push([coordinate.row, coordinate.col]);
    }
    this.model.lastChangedCells = changed;
    this.model.lastChangedCellUids = changed.map(([row, col]) => this.model.getCell(row, col)?.uid).filter(Boolean);
    this.adapter.acceptExternalTree?.(event.tree, this.model, externalModel);
    if (changed.length) this.refreshValues();
  }

  undo() { if (this.model.undo()) { this.renderStructural(); this.markChanged(true); return true; } return false; }
  redo() { if (this.model.redo()) { this.renderStructural(); this.markChanged(true); return true; } return false; }

  applyPatch(patch, sourceView = this.views.values().next().value || null) {
    const patches = Array.isArray(patch) ? patch : [patch];
    const rowDeletion = patches.length > 0 && patches.every((item) => item?.op === "deleteRows");
    return this.commitMutation(sourceView, "External patch", () => applyPatchToModel(this.model, patch, false), patchChangesLayout(patch), { rowDeletion }).then(() => this.model.toJSON());
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; clearTimeout(this.saveTimer); clearTimeout(this.idleTimer);
    this.adapter.dispose?.(); this.stopWatch = null; this.views.clear(); this.activeEditorView = null; this.dirtyCells.clear();
  }
}

function extractUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s)\]}]+/);
  return match?.[0] || String(value || "").trim();
}

async function uploadJson(value, name) {
  const file = new File([JSON.stringify(value)], name, { type: "application/json" });
  return extractUrl(await roam().file.upload({ file, toast: { hide: true } }));
}

async function downloadJson(url) {
  const file = await roam().file.get({ url });
  return JSON.parse(await file.text());
}

function rawRows(model) {
  return model.rows.map((row) => row.map((cell) => cell.raw));
}

function rowHeightsForManifest(model) {
  const rowHeights = {};
  for (let row = 0; row < model.rowCount; row += 1) {
    const height = model.getRowHeight(row);
    if (height != null) rowHeights[row] = height;
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

function alignmentsForManifest(model) {
  const alignments = {};
  for (let row = 0; row < model.rowCount; row += 1) for (let col = 0; col < model.colCount; col += 1) {
    const value = model.alignments[model.getCell(row, col).uid];
    if (value) alignments[`${row}:${col}`] = value;
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

export class LargeGridStore {
  constructor(anchorUid, pointerUid = null) {
    this.anchorUid = anchorUid;
    this.pointerUid = pointerUid;
    this.manifestUrl = null;
    this.manifest = null;
    this.cache = new Map();
    this.dirty = new Set();
    this.metadataDirty = false;
    this.queue = new MutationQueue();
  }

  async initialize(model = null) {
    const tree = getTree(this.anchorUid);
    const pointer = tree?.children.find((child) => child.string.startsWith(MANIFEST_PREFIX));
    if (pointer) {
      this.pointerUid = pointer.uid;
      this.manifestUrl = extractUrl(pointer.string.slice(MANIFEST_PREFIX.length));
      this.manifest = await downloadJson(this.manifestUrl);
      this.validateManifest(this.manifest);
      return this;
    }
    if (!model) model = new GridModel({ rows: Array.from({ length: 100 }, (_, row) => Array.from({ length: 26 }, (_, col) => row === 0 ? columnLabel(col) : "")), frozenRows: 1 });
    this.pointerUid = await createBlock(this.anchorUid, `${MANIFEST_PREFIX} pending`);
    await this.seed(model);
    return this;
  }

  validateManifest(manifest) {
    if (!manifest || manifest.schema !== "roam-grid/manifest" || manifest.version !== 1 || !Number.isInteger(manifest.rowCount) || !Number.isInteger(manifest.colCount) || !Array.isArray(manifest.chunks)) throw new GridError("UNSUPPORTED_SCHEMA", "Unsupported or malformed large-grid manifest");
    manifest.widths ||= {};
    manifest.rowHeights ||= {};
    manifest.alignments ||= {};
    manifest.colorFormulaCells = manifest.colorFormulaCells !== false;
  }

  async seed(model) {
    const rows = rawRows(model);
    const chunks = [];
    for (let start = 0, index = 0; start < rows.length; start += CHUNK_ROWS, index += 1) {
      const chunkRows = rows.slice(start, start + CHUNK_ROWS);
      const url = await uploadJson({ schema: "roam-grid/chunk", version: 1, index, startRow: start, rows: chunkRows }, `roam-grid-${this.anchorUid}-${index}.json`);
      chunks.push({ index, startRow: start, rowCount: chunkRows.length, url });
    }
    const manifest = {
      schema: "roam-grid/manifest", version: 1, revision: cryptoId(), previous: null, createdAt: new Date().toISOString(),
      rowCount: model.rowCount, colCount: model.colCount, columnIds: model.columnIds, widths: model.widths, rowHeights: rowHeightsForManifest(model), alignments: alignmentsForManifest(model),
      frozenRows: model.frozenRows, frozenCols: model.frozenCols, merges: model.merges, charts: model.charts, showHeaders: model.showHeaders !== false, fitToWidth: model.fitToWidth !== false, colorFormulaCells: model.colorFormulaCells !== false, chunks, retained: [],
    };
    const url = await uploadJson(manifest, `roam-grid-${this.anchorUid}-manifest.json`);
    const verified = await downloadJson(url);
    this.validateManifest(verified);
    await updateBlock(this.pointerUid, `${MANIFEST_PREFIX} ${url}`);
    this.manifestUrl = url;
    this.manifest = verified;
  }

  chunkIndexForRow(row) { return Math.floor(row / CHUNK_ROWS); }

  async loadChunk(index) {
    if (this.cache.has(index)) return this.cache.get(index);
    const descriptor = this.manifest.chunks.find((chunk) => chunk.index === index);
    if (!descriptor) {
      const empty = { schema: "roam-grid/chunk", version: 1, index, startRow: index * CHUNK_ROWS, rows: [] };
      this.cache.set(index, empty);
      return empty;
    }
    const chunk = await downloadJson(descriptor.url);
    if (chunk.schema !== "roam-grid/chunk" || chunk.version !== 1 || chunk.index !== index || !Array.isArray(chunk.rows)) throw new GridError("CHUNK_CORRUPT", `Large-grid chunk ${index} is malformed`);
    this.cache.set(index, chunk);
    return chunk;
  }

  async getRows(start, end) {
    const first = this.chunkIndexForRow(start);
    const last = this.chunkIndexForRow(Math.max(start, end - 1));
    await Promise.all(Array.from({ length: last - first + 1 }, (_, offset) => this.loadChunk(first + offset)));
    const rows = [];
    for (let row = start; row < Math.min(end, this.manifest.rowCount); row += 1) {
      const chunk = this.cache.get(this.chunkIndexForRow(row));
      rows.push(Array.from({ length: this.manifest.colCount }, (_, col) => chunk.rows[row - chunk.startRow]?.[col] ?? ""));
    }
    return rows;
  }

  async getRaw(row, col) {
    if (row < 0 || col < 0 || row >= this.manifest.rowCount || col >= this.manifest.colCount) return "";
    const chunk = await this.loadChunk(this.chunkIndexForRow(row));
    return chunk.rows[row - chunk.startRow]?.[col] ?? "";
  }

  ensureSize(rowCount, colCount) {
    if (rowCount > this.manifest.rowCount) { this.manifest.rowCount = rowCount; this.metadataDirty = true; }
    if (colCount > this.manifest.colCount) {
      for (let col = this.manifest.colCount; col < colCount; col += 1) this.manifest.columnIds.push(makeLocalUid());
      this.manifest.colCount = colCount; this.metadataDirty = true;
    }
  }

  rowHeight(row) {
    const value = Number(this.manifest.rowHeights?.[row]);
    return Number.isFinite(value) ? clamp(Math.round(value), MIN_ROW_HEIGHT, MAX_ROW_HEIGHT) : DEFAULT_ROW_HEIGHT;
  }

  setRowHeight(row, height) {
    if (!Number.isInteger(row) || row < 0 || row >= this.manifest.rowCount) throw new GridError("OUT_OF_BOUNDS", `Row ${row + 1} is outside the grid`);
    this.manifest.rowHeights ||= {};
    if (height == null || height === "") delete this.manifest.rowHeights[row];
    else {
      const value = Number(height);
      if (!Number.isFinite(value)) throw new GridError("ROW_HEIGHT", "Row height must be a number");
      this.manifest.rowHeights[row] = clamp(Math.round(value), MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
    }
    this.metadataDirty = true;
  }

  setColumnWidth(col, width) {
    const id = this.manifest.columnIds[col];
    if (!id) throw new GridError("OUT_OF_BOUNDS", `Column ${columnLabel(col)} is outside the grid`);
    this.manifest.widths ||= {};
    if (width == null || width === "") delete this.manifest.widths[id];
    else {
      const value = Number(width);
      if (!Number.isFinite(value)) throw new GridError("COLUMN_WIDTH", "Column width must be a number");
      this.manifest.widths[id] = clamp(Math.round(value), MIN_COL_WIDTH, MAX_COL_WIDTH);
    }
    this.metadataDirty = true;
  }

  getAlignment(row, col) { return this.manifest.alignments?.[`${row}:${col}`] || null; }

  setAlignment(row, col, alignment) {
    if (row < 0 || col < 0 || row >= this.manifest.rowCount || col >= this.manifest.colCount) throw new GridError("OUT_OF_BOUNDS", `Cell ${cellLabel(row, col)} is outside the grid`);
    const merge = this.mergeAt(row, col); const anchorRow = merge?.row ?? row; const anchorCol = merge?.col ?? col; const key = `${anchorRow}:${anchorCol}`;
    this.manifest.alignments ||= {};
    if (alignment == null || alignment === "auto") delete this.manifest.alignments[key];
    else if (["left", "center", "right"].includes(alignment)) this.manifest.alignments[key] = alignment;
    else throw new GridError("ALIGNMENT", `Unsupported alignment: ${alignment}`);
    this.metadataDirty = true;
  }

  async setCell(row, col, raw) {
    if (row < 0 || col < 0) throw new GridError("OUT_OF_BOUNDS", "Large-grid edit is out of bounds");
    this.ensureSize(row + 1, col + 1);
    if (this.mergeAt(row, col) && (this.mergeAt(row, col).row !== row || this.mergeAt(row, col).col !== col)) throw new GridError("MERGE_COVERED", `Cell ${cellLabel(row, col)} is covered by a merge`);
    const index = this.chunkIndexForRow(row);
    const chunk = await this.loadChunk(index);
    const local = row - chunk.startRow;
    while (chunk.rows.length <= local) chunk.rows.push(Array.from({ length: this.manifest.colCount }, () => ""));
    while (chunk.rows[local].length < this.manifest.colCount) chunk.rows[local].push("");
    chunk.rows[local][col] = String(raw ?? "");
    this.dirty.add(index);
  }

  async applyMatrix(startRow, startCol, matrix) {
    this.ensureSize(startRow + matrix.length, startCol + Math.max(0, ...matrix.map((row) => row.length)));
    for (let row = 0; row < matrix.length; row += 1) for (let col = 0; col < matrix[row].length; col += 1) await this.setCell(startRow + row, startCol + col, matrix[row][col]);
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
    this.manifest.merges.push({ id: makeLocalUid(), row: value.startRow, col: value.startCol, rowSpan: value.endRow - value.startRow + 1, colSpan: value.endCol - value.startCol + 1 });
    this.metadataDirty = true;
  }

  unmerge(row, col) {
    const merge = this.mergeAt(row, col);
    if (!merge) return false;
    this.manifest.merges = this.manifest.merges.filter((item) => item.id !== merge.id);
    this.metadataDirty = true;
    return true;
  }

  async commit() {
    return this.queue.run(async () => {
      if (!this.dirty.size && !this.metadataDirty) return this.manifest;
      const pointer = getTree(this.pointerUid);
      const liveUrl = extractUrl(pointer?.string?.slice(MANIFEST_PREFIX.length));
      if (liveUrl !== this.manifestUrl) throw new GridError("CONFLICT", "Large grid changed elsewhere. Reload or save as a copy.", { liveUrl, baseUrl: this.manifestUrl });
      const chunks = this.manifest.chunks.map((chunk) => ({ ...chunk }));
      const replaced = [];
      for (const index of [...this.dirty].sort((a, b) => a - b)) {
        const chunk = this.cache.get(index);
        const url = await uploadJson(chunk, `roam-grid-${this.anchorUid}-${index}-${cryptoId()}.json`);
        const existing = chunks.find((item) => item.index === index);
        if (existing) { replaced.push(existing.url); existing.url = url; existing.rowCount = chunk.rows.length; }
        else chunks.push({ index, startRow: chunk.startRow, rowCount: chunk.rows.length, url });
      }
      const next = { ...deepClone(this.manifest), revision: cryptoId(), previous: this.manifestUrl, updatedAt: new Date().toISOString(), chunks, retained: [this.manifestUrl, ...(this.manifest.retained || []).slice(0, 1), ...replaced] };
      const url = await uploadJson(next, `roam-grid-${this.anchorUid}-manifest-${next.revision}.json`);
      const verified = await downloadJson(url);
      this.validateManifest(verified);
      await updateBlock(this.pointerUid, `${MANIFEST_PREFIX} ${url}`);
      this.manifest = verified;
      this.manifestUrl = url;
      this.dirty.clear();
      this.metadataDirty = false;
      return verified;
    });
  }

  async saveAsCopy(newAnchorUid) {
    const rows = [];
    for (let start = 0; start < this.manifest.rowCount; start += CHUNK_ROWS) rows.push(...await this.getRows(start, Math.min(this.manifest.rowCount, start + CHUNK_ROWS)));
    const model = applyManifestAlignments(applyManifestRowHeights(new GridModel({ rows, columnIds: this.manifest.columnIds, widths: this.manifest.widths, frozenRows: this.manifest.frozenRows, frozenCols: this.manifest.frozenCols, merges: this.manifest.merges, charts: this.manifest.charts, showHeaders: this.manifest.showHeaders !== false, fitToWidth: this.manifest.fitToWidth !== false, colorFormulaCells: this.manifest.colorFormulaCells !== false }), this.manifest.rowHeights), this.manifest.alignments);
    return new LargeGridStore(newAnchorUid).initialize(model);
  }

  async toModel(limit = MAX_NATIVE_MUTATIONS) {
    if (this.manifest.rowCount * this.manifest.colCount > limit) throw new GridError("MUTATION_BUDGET", "Large grid exceeds the safe native-table conversion budget");
    const rows = [];
    for (let start = 0; start < this.manifest.rowCount; start += CHUNK_ROWS) rows.push(...await this.getRows(start, Math.min(this.manifest.rowCount, start + CHUNK_ROWS)));
    return applyManifestAlignments(applyManifestRowHeights(new GridModel({ rows, columnIds: this.manifest.columnIds, widths: this.manifest.widths, frozenRows: this.manifest.frozenRows, frozenCols: this.manifest.frozenCols, merges: this.manifest.merges, charts: this.manifest.charts, showHeaders: this.manifest.showHeaders !== false, fitToWidth: this.manifest.fitToWidth !== false, colorFormulaCells: this.manifest.colorFormulaCells !== false }), this.manifest.rowHeights), this.manifest.alignments);
  }
}

function uidFromFocusTarget(target) {
  const input = target?.closest?.(".rm-block-input,[id^='block-input-']");
  const idMatch = input?.id?.match(/^block-input-(.+)$/);
  return idMatch?.[1] || input?.dataset?.uid || input?.closest?.("[data-uid]")?.dataset?.uid || null;
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

function createPublicApi() {
  const registries = runtime.registries;
  const templateNames = () => [...new Set([...registries.templates.keys(), ...(runtime.templates?.list() || [])])].sort((a, b) => a.localeCompare(b));
  return {
    version: VERSION,
    registerFormulaFunction: (name, fn, options) => registries.registerFormulaFunction(name, fn, options),
    registerCellRenderer: (name, renderer) => registries.register(registries.cellRenderers, name, renderer),
    registerCellEditor: (name, editor) => registries.register(registries.cellEditors, name, editor),
    registerImporter: (name, importer) => registries.register(registries.importers, name, importer),
    registerExporter: (name, exporter) => registries.register(registries.exporters, name, exporter),
    registerDataSource: (name, source) => registries.register(registries.dataSources, name, source),
    registerTemplate: (name, template) => registries.register(registries.templates, name, template),
    listTemplates: templateNames,
    saveTemplate: async (name, tableUid = activeGridUid()) => {
      const model = tableUid ? runtime.sessions.get(tableUid)?.model || (runtime.metadata.has(tableUid) ? new NativeTableAdapter(tableUid).load() : null) : null;
      if (!model) throw new GridError("TEMPLATE_SOURCE", "Focus an enhanced native grid before saving a template");
      return runtime.templates.save(name, model);
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

function toast(message, intent = "primary", timeout = 4500) {
  const container = document.querySelector(".rg-toasts") || (() => {
    const element = document.createElement("div");
    element.className = "rg-toasts";
    document.body.appendChild(element);
    return element;
  })();
  const item = document.createElement("div");
  item.className = `rg-toast rg-toast--${intent}`;
  item.textContent = message;
  container.appendChild(item);
  setTimeout(() => item.remove(), timeout);
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
    footer.append(cancel, accept); dialog.append(heading, input, footer); overlay.appendChild(dialog); document.body.appendChild(overlay);
    const theme = createPortalThemeBridge(portalOwnerRoot(ownerRoot), overlay);
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
    const theme = createPortalThemeBridge(portalOwnerRoot(ownerRoot), overlay);
    const finish = (value) => { theme.dispose(); overlay.remove(); resolve(value); };
    overlay.__rgDismiss = () => finish(null);
    for (const choice of choices) list.appendChild(button(choice.label, choice.description || choice.label, () => finish(choice.value), choice.primary ? "bp3-intent-primary" : ""));
    dialog.append(heading, list); overlay.appendChild(dialog); document.body.appendChild(overlay);
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) finish(null); });
  });
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

function disposeRichHost(content, host) {
  if (!host || host.__rgDisposed) return;
  host.__rgDisposed = true;
  try { globalThis.window?.roamAlphaAPI?.ui?.components?.unmountNode?.({ el: host }); } catch { /* host may not be Roam-owned */ }
  host.remove();
  content.__rgRichHosts?.delete(host);
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

function activateRichHost(content, host, token) {
  if (content.dataset.rgRenderToken !== token || host.__rgDisposed || !host.isConnected) return disposeRichHost(content, host);
  clearRichCellHosts(content, host);
  for (const child of [...(content.childNodes || content.children || [])]) if (child !== host) child.remove();
  host.hidden = false;
  host.dataset.rgRichActive = "true";
}

export function paintRichCellContent(content, raw, token) {
  const host = document.createElement("span");
  host.className = "rg-rich-host";
  host.hidden = true;
  host.dataset.rgRenderToken = token;
  content.__rgRichHosts ||= new Set();
  content.__rgRichHosts.add(host);
  content.appendChild(host);
  const fallback = () => {
    if (content.dataset.rgRenderToken !== token || host.__rgDisposed) return disposeRichHost(content, host);
    host.textContent = raw;
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

export function roamReferenceAutocompleteContext(raw, caret = String(raw ?? "").length) {
  const source = String(raw ?? ""); const endIndex = clamp(Number.isFinite(caret) ? caret : source.length, 0, source.length);
  const prefix = source.slice(0, endIndex);
  const candidates = [
    { type: "page", opener: "[[", closer: "]]", startIndex: prefix.lastIndexOf("[["), closeIndex: prefix.lastIndexOf("]]" ) },
    { type: "block", opener: "((", closer: "))", startIndex: prefix.lastIndexOf("(("), closeIndex: prefix.lastIndexOf("))") },
  ].filter((candidate) => candidate.startIndex >= 0 && candidate.closeIndex < candidate.startIndex)
    .sort((a, b) => b.startIndex - a.startIndex);
  const match = candidates[0]; if (!match) return null;
  const queryStart = match.startIndex + match.opener.length; const query = source.slice(queryStart, endIndex);
  if (query.includes("\n") || query.includes("\r")) return null;
  const replaceEndIndex = source.slice(endIndex, endIndex + match.closer.length) === match.closer ? endIndex + match.closer.length : endIndex;
  return { type: match.type, query, startIndex: match.startIndex, queryStart, endIndex, replaceEndIndex };
}

export async function searchRoamReferenceSuggestions(context, limit = 8, api = globalThis.window?.roamAlphaAPI) {
  if (!context || !api?.data?.search) return [];
  const query = String(context.query || "").trim(); if (!query) return [];
  const boundedLimit = clamp(Math.floor(Number(limit) || 8), 1, 20);
  const page = context.type === "page";
  const results = await Promise.resolve(api.data.search({
    "search-str": query,
    "search-pages": page,
    "search-blocks": !page,
    "hide-code-blocks": !page,
    limit: boundedLimit,
    pull: page ? "[:node/title :block/uid]" : "[:block/string :block/uid]",
  }));
  return [...(results || [])].flatMap((result) => {
    const uid = valueOf(result, "block.uid");
    if (page) {
      const title = valueOf(result, "node.title");
      return title ? [{ kind: "roam-page", name: String(title), description: "Page", uid: uid ? String(uid) : null }] : [];
    }
    const raw = valueOf(result, "block.string");
    if (!uid || raw == null) return [];
    const label = String(raw).replace(/\s+/g, " ").trim();
    return [{ kind: "roam-block", name: label.slice(0, 120) || "(empty block)", description: `Block · ${uid}`, uid: String(uid) }];
  }).slice(0, boundedLimit);
}

export class GridEditorController {
  constructor(view, { cellAt, dimensions, mountedCells = null, cellRange = null, searchReferences = searchRoamReferenceSuggestions, referenceSearchDelay = 90, onFinish, viewport }) {
    this.view = view;
    this.cellAt = cellAt;
    this.dimensions = dimensions;
    this.mountedCells = mountedCells || (() => view.cells?.values?.() || []);
    this.cellRange = cellRange || ((cell) => {
      const row = Number(cell.dataset.row); const col = Number(cell.dataset.col);
      return { startRow: row, endRow: row, startCol: col, endCol: col };
    });
    this.onFinish = onFinish;
    this.viewport = viewport;
    this.searchReferences = searchReferences;
    this.referenceSearchDelay = Math.max(0, Number(referenceSearchDelay) || 0);
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
    this.suggestionList.className = "rg-formula-suggestions";
    this.suggestionList.id = `rg-editor-list-${cryptoId()}`;
    this.suggestionList.setAttribute("role", "listbox");
    this.suggestionList.setAttribute("aria-label", "Cell editing suggestions");
    this.suggestionList.setAttribute("aria-hidden", "true");
    this.signature = document.createElement("div");
    this.signature.className = "rg-formula-signature";
    this.signature.setAttribute("role", "status");
    this.signature.setAttribute("aria-live", "polite");
    this.signature.setAttribute("aria-hidden", "true");
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute("aria-controls", this.suggestionList.id);
    this.input.setAttribute("aria-expanded", "false");
    const body = document.createElement("div");
    body.className = "rg-editor-popover-body";
    body.append(this.input, this.mirror, this.suggestionList, this.signature);
    this.popover.append(this.address, body);
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
    this.input.addEventListener("click", () => this.schedulePresentation());
    this.input.addEventListener("select", () => this.schedulePresentation());
    this.input.addEventListener("keydown", (event) => this.onKeydown(event));
    this.input.addEventListener("blur", (event) => {
      if (!this.state || this.popover.contains(event.relatedTarget)) return;
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
    this.state = { row, col, cell, raw: String(raw ?? ""), editor, floating, composing: false, autocompleteClosed: false, referenceAutocompleteClosed: false, finished: false };
    const formula = value.startsWith("=") && !value.startsWith("==");
    this.address.textContent = `${formula ? "fx  " : ""}${cellLabel(row, col)}`;
    this.setPopoverHidden(!floating && !formula);
    this.popover.classList.toggle("rg-editor-popover--floating", floating);
    this.input.hidden = !floating;
    editor.setAttribute("role", "combobox");
    editor.setAttribute("aria-autocomplete", "list");
    editor.setAttribute("aria-controls", this.suggestionList.id);
    editor.setAttribute("aria-expanded", "false");
    this.portalTheme.sync();
    if (!floating) {
      editor.addEventListener("keydown", (event) => this.onKeydown(event));
      editor.addEventListener("compositionstart", () => { if (this.state) this.state.composing = true; });
      editor.addEventListener("compositionend", () => { if (this.state) this.state.composing = false; this.schedulePresentation(); });
      editor.addEventListener("input", () => { this.onEditorInput(); });
      editor.addEventListener("click", () => this.schedulePresentation());
      editor.addEventListener("select", () => this.schedulePresentation());
      editor.addEventListener("blur", (event) => { if (!this.popover.contains(event.relatedTarget)) this.finish(true); });
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
    if (this.state) { this.state.autocompleteClosed = false; this.state.referenceAutocompleteClosed = false; }
    clearTimeout(this.referenceSearchTimer); this.referenceSearchTimer = null; this.referenceSearchToken += 1; this.referenceContextKey = null;
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
        this.schedulePresentation();
      }
      return;
    }
    const hasSuggestions = !this.suggestionList.hidden && this.suggestions.length;
    if (hasSuggestions && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      this.suggestionIndex = (this.suggestionIndex + (event.key === "ArrowDown" ? 1 : -1) + this.suggestions.length) % this.suggestions.length;
      this.paintSuggestions();
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
        this.suggestionList.hidden = true; this.suggestionList.setAttribute("aria-hidden", "true");
        state.editor.setAttribute("aria-expanded", "false"); state.editor.removeAttribute?.("aria-activedescendant");
        if (!state.floating && !(state.editor.value.startsWith("=") && !state.editor.value.startsWith("=="))) this.setPopoverHidden(true);
        return;
      }
      this.finish(false); return;
    }
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); this.finish(true, [1, 0]); return; }
    if (event.key === "Tab") { event.preventDefault(); this.finish(true, [0, event.shiftKey ? -1 : 1]); }
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
    state.editor.focus({ preventScroll: true });
    this.schedulePresentation();
  }

  acceptReferenceSuggestion(index) {
    const state = this.state; const suggestion = this.suggestions[index]; const context = this.referenceContext;
    if (!state || !suggestion || !context) return;
    const replacement = suggestion.kind === "roam-page" ? `[[${suggestion.name}]]` : `((${suggestion.uid}))`;
    state.editor.setRangeText(replacement, context.startIndex, context.replaceEndIndex ?? context.endIndex, "end");
    state.referenceAutocompleteClosed = true;
    clearTimeout(this.referenceSearchTimer); this.referenceSearchToken += 1;
    this.suggestions = []; this.suggestionList.hidden = true; this.suggestionList.setAttribute("aria-hidden", "true");
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
    editor.focus({ preventScroll: true });
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
    const referenceContext = roamReferenceAutocompleteContext(raw, editor.selectionStart);
    this.view.root.classList.toggle("rg-root--formula-editing", formula);
    const mode = referenceContext ? "reference" : formula ? "formula" : "plain";
    this.popover.dataset.mode = mode;
    this.popover.classList.toggle("rg-editor-popover--formula", formula);
    this.popover.classList.toggle("rg-editor-popover--reference", Boolean(referenceContext));
    this.popover.classList.toggle("rg-editor-popover--plain", !formula && !referenceContext);
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
    const hasReferenceResults = Boolean(referenceContext && !state.referenceAutocompleteClosed && !this.suggestionList.hidden && this.suggestionKind === "roam-reference" && this.suggestions.length);
    this.setPopoverHidden(!state.floating && !formula && !hasReferenceResults);
    this.position();
  }

  updateAutocomplete(formula) {
    const state = this.state; const editor = state?.editor;
    const context = formula ? formulaAutocompleteContext(editor.value, editor.selectionStart) : null;
    this.autocompleteContext = context;
    const catalog = runtime.registries?.formulaFunctionMetadata || defaultFormulaFunctionMetadata();
    this.suggestions = context && !state.autocompleteClosed ? rankFormulaFunctions(context.query, catalog) : [];
    this.suggestionKind = this.suggestions.length ? "formula" : null;
    this.suggestionIndex = clamp(this.suggestionIndex, 0, Math.max(0, this.suggestions.length - 1));
    this.paintSuggestions();
  }

  updateReferenceAutocomplete(context) {
    const state = this.state; if (!state) return;
    const key = `${context.type}:${context.startIndex}:${context.endIndex}:${context.query}`;
    if (this.referenceContextKey === key && (this.referenceSearchTimer != null || this.suggestionKind === "roam-reference")) return;
    clearTimeout(this.referenceSearchTimer); const token = ++this.referenceSearchToken;
    this.referenceContext = context; this.referenceContextKey = key; this.autocompleteContext = null;
    this.suggestions = []; this.suggestionKind = "roam-reference"; this.suggestionIndex = 0; this.paintSuggestions();
    if (state.referenceAutocompleteClosed || !context.query.trim()) return;
    this.referenceSearchTimer = setTimeout(async () => {
      this.referenceSearchTimer = null;
      let results = [];
      try { results = await this.searchReferences(context); } catch (error) { console.warn("[roam-grid] Reference search failed", error); }
      if (token !== this.referenceSearchToken || !this.state || this.referenceContextKey !== key) return;
      this.suggestions = results; this.suggestionKind = "roam-reference"; this.suggestionIndex = 0; this.paintSuggestions();
      if (!this.state.floating) this.setPopoverHidden(!this.suggestions.length && !(this.state.editor.value.startsWith("=") && !this.state.editor.value.startsWith("==")));
      this.position();
    }, this.referenceSearchDelay);
  }

  clearReferenceAutocomplete() {
    clearTimeout(this.referenceSearchTimer); this.referenceSearchTimer = null; this.referenceSearchToken += 1;
    this.referenceContext = null; this.referenceContextKey = null;
    if (this.suggestionKind === "roam-reference") {
      this.suggestions = []; this.suggestionKind = null; this.paintSuggestions();
    }
  }

  paintSuggestions() {
    this.suggestionList.replaceChildren();
    this.suggestionList.hidden = !this.suggestions.length;
    this.suggestionList.setAttribute("aria-hidden", String(!this.suggestions.length));
    const editor = this.currentEditor();
    editor?.setAttribute?.("aria-expanded", String(Boolean(this.suggestions.length)));
    this.suggestions.forEach((suggestion, index) => {
      const option = document.createElement("button"); option.type = "button"; option.className = "rg-formula-suggestion";
      option.id = `${this.suggestionList.id}-option-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === this.suggestionIndex));
      option.classList.toggle("rg-formula-suggestion--active", index === this.suggestionIndex);
      const name = document.createElement("strong"); name.textContent = suggestion.name;
      const detail = document.createElement("span"); detail.textContent = suggestion.description;
      option.append(name, detail);
      option.addEventListener("pointerdown", (event) => event.preventDefault());
      option.addEventListener("click", () => this.acceptSuggestion(index));
      this.suggestionList.appendChild(option);
    });
    if (editor) {
      if (this.suggestions.length) editor.setAttribute("aria-activedescendant", `${this.suggestionList.id}-option-${this.suggestionIndex}`);
      else editor.removeAttribute?.("aria-activedescendant");
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
    for (const [cell] of this.referenceCells) {
      cell.classList.remove("rg-cell--formula-reference"); cell.style.removeProperty("--rg-reference-color"); delete cell.dataset.rgFormulaReference;
    }
    clearTimeout(this.referenceSearchTimer); this.referenceSearchTimer = null; this.referenceSearchToken += 1; this.referenceContext = null; this.referenceContextKey = null;
    this.referenceCells.clear(); this.suggestions = []; this.suggestionKind = null; this.suggestionList.replaceChildren(); this.suggestionList.hidden = true; this.suggestionList.setAttribute("aria-hidden", "true");
    this.input.setAttribute("aria-expanded", "false"); this.input.removeAttribute?.("aria-activedescendant");
    this.currentEditor()?.setAttribute?.("aria-expanded", "false"); this.currentEditor()?.removeAttribute?.("aria-activedescendant");
    this.signature.replaceChildren(); this.signature.hidden = true; this.signature.setAttribute("aria-hidden", "true");
  }

  dispose() {
    if (this.state) {
      const state = this.state; state.finished = true; this.state = null;
      if (!state.floating) { state.editor.remove(); state.cell.classList.remove("rg-cell--editing"); }
    }
    globalThis.window?.removeEventListener("resize", this.boundReposition);
    this.viewport?.removeEventListener("scroll", this.boundReposition);
    this.portalTheme?.dispose(); this.portalTheme = null;
    this.clearPresentation(); this.popover.remove();
  }
}

export class GridView {
  constructor({ host, model, adapter, nativeElement = null, session = null, context = "source" }) {
    this.host = host;
    this.session = session;
    this.model = session?.model || model;
    this.adapter = session?.adapter || adapter;
    this.nativeElement = nativeElement;
    this.context = context;
    this.selection = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    this.anchor = { row: 0, col: 0 };
    this.root = document.createElement("section");
    this.root.className = "rg-root";
    this.root.classList.toggle("rg-root--reference", context === "reference");
    this.root.dataset.rgContext = context;
    this.root.tabIndex = 0;
    this.cells = new Map();
    this.disposed = false;
    this.changeVersion = 0;
    this.savedVersion = 0;
    this.saveTimer = null;
    this.metadataDirty = false;
    this.dirtyCells = new Map();
    this.editRevisions = new Map();
    this.structuralPending = false;
    this.contentSavePromise = null;
    this.cellCoordinatesByUid = new Map();
    this.dragSelecting = false;
    this.fillStart = null;
    this.rowResizePreview = null;
    this.columnResizePreview = null;
    this.resizeCleanup = null;
    this.editorController = null;
    this.selectedCellElements = new Set();
    this.activeCellElement = null;
    this.selectionControls = new Set();
    this.boundPaste = (event) => this.onPaste(event);
    this.boundKeydown = (event) => this.onKeydown(event);
    this.keyboardActive = false;
    this.boundDocumentPointerDown = (event) => {
      this.keyboardActive = this.root.contains(event.target) || Boolean(this.editorController?.popover.contains(event.target));
      this.root.classList.toggle("rg-root--interaction-active", this.keyboardActive);
    };
    this.boundWindowKeydown = (event) => { if (this.keyboardActive) this.onKeydown(event); };
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
    this.host.appendChild(this.root);
    globalThis.window.addEventListener("keydown", this.boundWindowKeydown, true);
    document.addEventListener("pointerdown", this.boundDocumentPointerDown, true);
    this.root.addEventListener("paste", this.boundPaste);
    document.addEventListener("pointerup", this.boundPointerUp, true);
    this.render();
    if (!this.session) this.adapter.watchExternal?.((model, event = { type: "structural", structural: true, changes: [] }) => this.handleExternalChange(model, event));
  }

  handleExternalChange(externalModel, event) {
    const localPending = this.structuralPending || this.dirtyCells.size > 0 || this.contentSavePromise;
    if (event.structural || event.type === "structural") {
      this.dirtyCells.clear(); this.structuralPending = false; this.metadataDirty = false;
      clearTimeout(this.saveTimer); this.changeVersion = this.savedVersion;
      this.model = externalModel; this.adapter.acceptExternalTree?.(event.tree, this.model); this.render();
      if (localPending || event.conflict) toast("Roam Grid reloaded because the table structure changed elsewhere.", "warning");
      return;
    }
    const conflicts = (event.changes || []).filter((change) => this.dirtyCells.has(change.uid));
    if (conflicts.length) {
      this.dirtyCells.clear(); this.structuralPending = false; clearTimeout(this.saveTimer); this.changeVersion = this.savedVersion;
      this.model = externalModel; this.adapter.acceptExternalTree?.(event.tree, this.model); this.render();
      toast("Roam Grid reloaded because this cell changed elsewhere.", "warning");
      return;
    }
    const changed = [];
    for (const change of event.changes || []) {
      const coordinate = this.cellCoordinatesByUid.get(change.uid); if (!coordinate) continue;
      const cell = this.model.getCell(coordinate.row, coordinate.col); if (!cell || cell.raw === change.raw) continue;
      cell.raw = change.raw; changed.push([coordinate.row, coordinate.col]);
    }
    this.model.lastChangedCells = changed;
    this.model.lastChangedCellUids = changed.map(([row, col]) => this.model.getCell(row, col)?.uid).filter(Boolean);
    this.adapter.acceptExternalTree?.(event.tree, this.model, externalModel);
    if (changed.length) this.refreshValues();
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
    const offset = this.model.showHeaders ? 1 : 0;
    grid.classList.toggle("rg-grid--clean", !this.model.showHeaders);
    this.applyGridTemplateColumns(grid);
    this.applyGridTemplateRows(grid);
    if (this.model.showHeaders) {
      const corner = document.createElement("div"); corner.className = "rg-corner rg-header"; corner.style.gridArea = "1 / 1";
      grid.appendChild(corner);
      this.model.columnIds.forEach((id, col) => grid.appendChild(this.columnHeader(id, col)));
    }
    this.cells.clear();
    this.cellCoordinatesByUid.clear();
    this.formulaEngine = new FormulaEngine(this.model, runtime.registries.formulaFunctions, runtime.registries.formulaFunctionMetadata);
    const engine = this.formulaEngine;
    for (let row = 0; row < this.model.rowCount; row += 1) {
      if (this.model.showHeaders) grid.appendChild(this.rowHeader(row));
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
      onFinish: async ({ row, col, cell, raw, value, commit, movement }) => {
        if (commit && value !== this.model.getRaw(row, col)) this.commitMutation("Edit cell", () => this.model.setRaw(row, col, value), false);
        else this.renderCellValue(cell, row, col);
        if (movement) this.moveSelection(...movement);
        this.root.focus({ preventScroll: true });
        this.session?.editorFinished(this);
      },
    });
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
  }

  rowDeletionLayoutFingerprint() {
    return JSON.stringify({
      columnIds: this.model.columnIds,
      widths: this.model.widths,
      headerColumns: this.model.headerColumns,
      frozenCols: this.model.frozenCols,
      showHeaders: this.model.showHeaders,
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

  positionCellElement(cell, row, col, offset = this.model.showHeaders ? 1 : 0) {
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
    if (this.editorController?.state || this.resizeCleanup || this.rowResizePreview || this.columnResizePreview || this.dragSelecting || this.fillStart) return false;
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
      if ((this.model.showHeaders && !rowHeaders.has(rowUid)) || !rowResizes.has(rowUid)) return false;
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
      resize.style.gridRow = String(row + 1 + (this.model.showHeaders ? 1 : 0));
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
    if (activeElement && !activeElement.isConnected) this.root.focus?.({ preventScroll: true });
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
    const widths = this.model.columnIds.map((id) => {
      if (this.columnResizePreview?.widths?.[id] != null) return this.columnResizePreview.widths[id];
      return this.model.widths[id] || DEFAULT_COL_WIDTH;
    });
    const previewing = Boolean(this.columnResizePreview);
    grid.style.width = this.model.fitToWidth && !previewing ? "100%" : "max-content";
    grid.style.gridTemplateColumns = `${this.model.showHeaders ? "42px " : ""}${widths.map((width) => previewing || !this.model.fitToWidth ? `${width}px` : `minmax(${MIN_COL_WIDTH}px, ${width}fr)`).join(" ")}`;
  }

  applyGridTemplateRows(grid = this.gridElement) {
    if (!grid) return;
    const tracks = Array.from({ length: this.model.rowCount }, (_, row) => {
      const height = this.rowResizePreview?.row === row ? this.rowResizePreview.height : this.model.getRowHeight(row);
      return height == null ? `minmax(${DEFAULT_ROW_HEIGHT}px, auto)` : `${height}px`;
    });
    grid.style.gridTemplateRows = `${this.model.showHeaders ? "28px " : ""}${tracks.join(" ")}`;
  }

  startColumnResize(id, event) {
    event.preventDefault(); event.stopPropagation(); this.resizeCleanup?.();
    const pointerTarget = event.currentTarget; const dragCell = pointerTarget?.closest?.(".rg-cell");
    if (dragCell) dragCell.draggable = false;
    pointerTarget?.setPointerCapture?.(event.pointerId);
    this.root.classList.add("rg-root--resizing");
    const offset = this.model.showHeaders ? 1 : 0;
    const resolvedTracks = getComputedStyle(this.gridElement).gridTemplateColumns.split(/\s+/);
    const baseWidths = Object.fromEntries(this.model.columnIds.map((columnId, col) => [columnId, Number.parseFloat(resolvedTracks[col + offset]) || this.model.widths[columnId] || DEFAULT_COL_WIDTH]));
    const startX = event.clientX; const startWidth = baseWidths[id]; let moved = false;
    const move = (moveEvent) => {
      const requested = clamp(Math.round(startWidth + moveEvent.clientX - startX), MIN_COL_WIDTH, MAX_COL_WIDTH);
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
    const offset = this.model.showHeaders ? 1 : 0;
    const resolvedTracks = getComputedStyle(this.gridElement).gridTemplateRows.split(/\s+/);
    const startHeight = Number.parseFloat(resolvedTracks[row + offset]) || this.model.getRowHeight(row) || DEFAULT_ROW_HEIGHT;
    const startY = event.clientY; let moved = false;
    const move = (moveEvent) => {
      moved = true;
      this.rowResizePreview = { row, height: clamp(Math.round(startHeight + moveEvent.clientY - startY), MIN_ROW_HEIGHT, MAX_ROW_HEIGHT) };
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

  cellElement(row, col, merge, engine, offset = this.model.showHeaders ? 1 : 0) {
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
      if (event.shiftKey) this.extendSelection(currentRow, currentCol); else { this.anchor = { row: currentRow, col: currentCol }; this.select({ startRow: currentRow, endRow: currentRow, startCol: currentCol, endCol: currentCol }); }
      this.dragSelecting = true; this.root.focus({ preventScroll: true }); event.preventDefault();
    });
    cell.addEventListener("pointerenter", () => { const currentRow = Number(cell.dataset.row); const currentCol = Number(cell.dataset.col); if (this.dragSelecting) this.extendSelection(currentRow, currentCol); if (this.fillStart) this.fillTarget = { row: currentRow, col: currentCol }; });
    cell.addEventListener("dblclick", () => this.beginEdit(Number(cell.dataset.row), Number(cell.dataset.col)));
    cell.addEventListener("contextmenu", (event) => { const currentRow = Number(cell.dataset.row); const currentCol = Number(cell.dataset.col); event.preventDefault(); if (!rangeContains(this.selection, currentRow, currentCol)) this.select({ startRow: currentRow, endRow: currentRow, startCol: currentCol, endCol: currentCol }); this.openMenu(cell, event.clientX, event.clientY); });
    cell.draggable = true;
    cell.addEventListener("dragstart", (event) => { const currentRow = Number(cell.dataset.row); const currentCol = Number(cell.dataset.col); if (!rangeContains(this.selection, currentRow, currentCol)) this.select({ startRow: currentRow, endRow: currentRow, startCol: currentCol, endCol: currentCol }); event.dataTransfer.setData("application/x-roam-grid-range", JSON.stringify(this.selection)); });
    cell.addEventListener("dragover", (event) => { if (event.dataTransfer.types.includes("application/x-roam-grid-range")) event.preventDefault(); });
    cell.addEventListener("drop", (event) => { const raw = event.dataTransfer.getData("application/x-roam-grid-range"); if (!raw) return; event.preventDefault(); const range = JSON.parse(raw); this.commitMutation("Move range", () => this.model.moveRange(range, Number(cell.dataset.row), Number(cell.dataset.col)), true); });
    return cell;
  }

  renderCellValue(cell, row, col, engine = this.formulaEngine || new FormulaEngine(this.model, runtime.registries.formulaFunctions, runtime.registries.formulaFunctionMetadata)) {
    const raw = this.model.getRaw(row, col); const value = engine.evaluateCell(row, col);
    const formula = raw.startsWith("=") && !raw.startsWith("==");
    const content = ensureCellContent(cell);
    cell.dataset.rgRaw = raw;
    cell.classList.toggle("rg-cell--formula", formula && this.model.colorFormulaCells);
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
          return;
        }
      } catch (error) { console.warn("[roam-grid] Cell renderer failed", error); }
    }
    renderStableCellContent(content, { raw, value, formula, renderRich: paintRichCellContent });
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
      const offset = this.model.showHeaders ? 1 : 0;
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
    if (this.session) return this.session.beginEdit(this, () => this.beginEditLocal(row, col, initial, floating));
    return this.beginEditLocal(row, col, initial, floating);
  }

  beginEditLocal(row, col, initial = null, floating = false) {
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
    return this.editorController?.start({ row, col, cell, raw, initial, floating, customEditor: editor });
  }

  onKeydown(event) {
    if (event.target.matches("textarea,input")) return;
    event.stopPropagation();
    const command = event.metaKey || event.ctrlKey;
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
    navigator.clipboard?.writeText(text).catch(() => {});
    if (cut) this.clearSelection();
  }

  async onPaste(event) {
    const images = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
    if (images.length) {
      event.preventDefault(); const row = this.selection.startRow; const col = this.selection.startCol; const previous = this.model.getRaw(row, col);
      toast(`Uploading ${images.length} image${images.length === 1 ? "" : "s"}…`);
      try {
        const embeds = []; for (const file of images) embeds.push(await roam().file.upload({ file, toast: { hide: true } }));
        await this.commitMutation("Paste image", () => this.model.setRaw(row, col, [previous, ...embeds].filter(Boolean).join(" ")), false);
      } catch (error) { toast(`Image upload failed: ${error.message}`, "danger"); }
      return;
    }
    const text = event.clipboardData?.getData("text/plain"); if (!text) return;
    event.preventDefault(); const matrix = parseDelimited(text, text.includes("\t") ? "\t" : detectDelimiter(text));
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
  undo() { if (this.session) return this.session.undo(); if (this.model.undo()) { this.render(); this.markChanged(true); } }
  redo() { if (this.session) return this.session.redo(); if (this.model.redo()) { this.render(); this.markChanged(true); } }

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
    };
    const item = (label, action) => { const element = button(label, label, () => { dismiss(); action(); }); element.className = "bp3-menu-item"; return element; };
    menu.append(
      ...(this.context === "reference" ? [item("Open source table", () => this.openSource())] : []),
      item("Merge selection", () => this.mergeSelection()), item("Unmerge", () => this.unmergeSelection()),
      item("Insert row below", () => this.insertRow()), item("Insert column right", () => this.insertCol()),
      item("Delete selected rows", () => { const range = normalizeRange(this.selection); this.commitMutation("Delete rows", () => this.model.deleteRows(range.startRow, range.endRow - range.startRow + 1), true, { rowDeletion: true }); }),
      item("Delete selected columns", () => { const range = normalizeRange(this.selection); this.commitMutation("Delete columns", () => this.model.deleteCols(range.startCol, range.endCol - range.startCol + 1), true); }),
      item("Set selected row height…", () => this.setSelectedRowHeight()),
      item("Compact selected rows", () => this.resizeSelectedRows(24)),
      item("Auto-fit selected rows", () => this.resizeSelectedRows(null)),
      item("Set selected column width…", () => this.setSelectedColumnWidth()),
      item("Reset selected column widths", () => this.resizeSelectedColumns(null)),
      item("Align left", () => this.alignSelection("left")),
      item("Align center", () => this.alignSelection("center")),
      item("Align right", () => this.alignSelection("right")),
      item("Reset alignment", () => this.alignSelection(null)),
      item("Copy Roam block reference", () => this.copyRoamReference(false)),
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
      item("Compact selected rows", () => this.resizeSelectedRows(24)),
      item("Auto-fit selected rows", () => this.resizeSelectedRows(null)),
      item("Set selected column width…", () => this.setSelectedColumnWidth()),
      item("Reset selected column widths", () => this.resizeSelectedColumns(null)),
      item("Align left", () => this.alignSelection("left")),
      item("Align center", () => this.alignSelection("center")),
      item("Align right", () => this.alignSelection("right")),
      item("Reset alignment", () => this.alignSelection(null)),
      item("Copy Roam block reference", () => this.copyRoamReference(false)),
      item("Copy table block reference", () => this.copyRoamReference(true)),
      item(this.model.colorFormulaCells ? "Hide formula coloring" : "Color formula cells", () => this.commitMutation("Toggle formula coloring", () => { this.model.colorFormulaCells = !this.model.colorFormulaCells; }, true)),
      item(this.model.showHeaders ? "Hide row/column labels" : "Show row/column labels", () => this.commitMutation("Toggle row and column labels", () => { this.model.showHeaders = !this.model.showHeaders; }, true)),
      item(this.model.fitToWidth ? "Use fixed column widths" : "Fit table to window", () => this.commitMutation("Toggle fit to window", () => { this.model.fitToWidth = !this.model.fitToWidth; }, true)),
      item("Copy to large grid", () => copyNativeToLarge(this.model))
    );
    menu.__rgDismiss = dismiss;
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
    return this.commitMutation(height == null ? "Auto-fit rows" : "Resize rows", () => {
      for (let row = range.startRow; row <= range.endRow; row += 1) this.model.setRowHeight(row, height);
    }, true);
  }

  setSelectedRowHeight() {
    const current = this.model.getRowHeight(this.selection.startRow) || DEFAULT_ROW_HEIGHT;
    const value = globalThis.prompt?.(`Row height in pixels (${MIN_ROW_HEIGHT}–${MAX_ROW_HEIGHT})`, String(current));
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
        else this.model.widths[id] = clamp(Math.round(width), MIN_COL_WIDTH, MAX_COL_WIDTH);
      }
    }, true);
  }

  setSelectedColumnWidth() {
    const id = this.model.columnIds[this.selection.startCol];
    const current = this.model.widths[id] || DEFAULT_COL_WIDTH;
    const value = globalThis.prompt?.(`Column width in pixels (${MIN_COL_WIDTH}–${MAX_COL_WIDTH})`, String(current));
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
    const copied = navigator.clipboard?.writeText(`((${uid}))`);
    if (!copied) return toast("Clipboard access is unavailable", "warning");
    copied.then(() => toast(`${table ? "Table" : "Cell"} block reference copied`, "success", 1600)).catch((error) => toast(`Copy failed: ${error.message}`, "danger"));
  }

  commitMutation(label, mutation, structural, { rowDeletion = false } = {}) {
    if (this.session) return this.session.commitMutation(this, label, mutation, structural, { rowDeletion });
    try {
      const rowDeletionContext = structural && rowDeletion ? this.captureRowDeletionContext() : null;
      this.model.transact(label, mutation);
      if (!structural && !(this.model.lastChangedCells || []).length) return Promise.resolve(this.model);
      if (structural) {
        let patched = false;
        try { patched = this.patchRowDeletion(rowDeletionContext); } catch (error) { console.warn("[roam-grid] Incremental row deletion failed; using a full render", error); }
        if (!patched) this.render();
      } else this.refreshValues();
      if (!structural) this.queueChangedCells();
      this.markChanged(structural);
      globalThis.window?.dispatchEvent(new CustomEvent("roam-grid:changed", { detail: { tableUid: this.model.tableUid, label } }));
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

  prunePersistenceUids() {
    const valid = new Set(this.model.rows.flat().map((cell) => cell.uid));
    for (const uid of this.dirtyCells.keys()) if (!valid.has(uid)) this.dirtyCells.delete(uid);
    for (const uid of this.editRevisions.keys()) if (!valid.has(uid)) this.editRevisions.delete(uid);
    for (const uid of this.cellCoordinatesByUid.keys()) if (!valid.has(uid)) this.cellCoordinatesByUid.delete(uid);
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

  markChanged(layoutChanged = false) {
    this.changeVersion += 1;
    this.metadataDirty ||= layoutChanged; this.structuralPending ||= layoutChanged;
    clearTimeout(this.saveTimer);
    if (!layoutChanged && !this.dirtyCells.size) { this.savedVersion = this.changeVersion; return; }
    this.saveTimer = setTimeout(() => layoutChanged ? this.flushSave() : this.flushContentSave(), layoutChanged ? 0 : 220);
  }


  async flushContentSave() {
    if (this.disposed || this.structuralPending || !this.dirtyCells.size) return;
    if (this.contentSavePromise) return this.contentSavePromise;
    const batch = new Map([...this.dirtyCells].map(([uid, change]) => [uid, { ...change }]));
    const task = this.adapter.saveContent(batch);
    this.contentSavePromise = task;
    try {
      const result = await task;
      for (const saved of result.saved || []) {
        const coordinate = this.cellCoordinatesByUid.get(saved.uid);
        const currentRaw = coordinate ? this.model.getRaw(coordinate.row, coordinate.col) : null;
        const revision = this.editRevisions.get(saved.uid) || saved.revision;
        if (currentRaw == null || currentRaw === saved.raw) this.dirtyCells.delete(saved.uid);
        else this.dirtyCells.set(saved.uid, { uid: saved.uid, baseRaw: saved.raw, raw: currentRaw, revision });
      }
      if (!this.dirtyCells.size && !this.structuralPending) this.savedVersion = this.changeVersion;
    } catch (error) {
      toast(error.message, "danger", 8000);
      this.dirtyCells.clear(); this.structuralPending = false; this.metadataDirty = false;
      try { this.model = this.adapter.load(); this.changeVersion = this.savedVersion; this.render(); } catch { /* table may have disappeared */ }
    } finally {
      if (this.contentSavePromise === task) this.contentSavePromise = null;
      if (!this.disposed && !this.structuralPending && this.dirtyCells.size) {
        clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.flushContentSave(), 220);
      }
    }
  }

  async flushSave() {
    if (this.disposed || !this.structuralPending || this.savedVersion === this.changeVersion) return;
    const version = this.changeVersion;
    const payload = new GridModel({ ...this.model.snapshot(), tableUid: this.model.tableUid });
    const pendingUids = payload.rows.map((row) => row.map((cell) => cell.uid));
    const payloadRawByUid = new Map(payload.rows.flat().map((cell) => [cell.uid, cell.raw]));
    const payloadEditRevisions = new Map(this.editRevisions);
    payload.baseFingerprint = this.model.baseFingerprint; payload.baseSnapshot = this.model.baseSnapshot;
    const saveMetadata = this.metadataDirty; this.metadataDirty = false;
    this.root.classList.add("rg-root--saving");
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
        if (this.cellCoordinatesByUid.has(oldUid)) { this.cellCoordinatesByUid.set(newUid, this.cellCoordinatesByUid.get(oldUid)); this.cellCoordinatesByUid.delete(oldUid); }
        if (this.dirtyCells.has(oldUid)) {
          const dirty = this.dirtyCells.get(oldUid); this.dirtyCells.delete(oldUid); this.dirtyCells.set(newUid, { ...dirty, uid: newUid });
        }
        if (this.editRevisions.has(oldUid)) { this.editRevisions.set(newUid, this.editRevisions.get(oldUid)); this.editRevisions.delete(oldUid); }
        if (payloadRawByUid.has(oldUid)) payloadRawByUid.set(newUid, payloadRawByUid.get(oldUid));
        if (payloadEditRevisions.has(oldUid)) payloadEditRevisions.set(newUid, payloadEditRevisions.get(oldUid));
      }
      this.prunePersistenceUids();
      this.model.baseFingerprint = saved.baseFingerprint; this.model.baseSnapshot = saved.baseSnapshot;
      this.adapter.model = this.model;
      for (const [uid, dirty] of [...this.dirtyCells]) {
        const savedRevision = payloadEditRevisions.get(uid) || 0;
        if (dirty.revision <= savedRevision && dirty.raw === payloadRawByUid.get(uid)) this.dirtyCells.delete(uid);
        else if (payloadRawByUid.has(uid)) this.dirtyCells.set(uid, { ...dirty, baseRaw: payloadRawByUid.get(uid) });
      }
      this.structuralPending = false;
      if (version !== this.changeVersion) {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.structuralPending ? this.flushSave() : this.flushContentSave(), 220);
      }
    } catch (error) {
      this.metadataDirty ||= saveMetadata;
      toast(error.message, "danger", 8000);
      this.dirtyCells.clear(); this.structuralPending = false;
      try { this.model = this.adapter.load(); this.changeVersion = this.savedVersion; this.render(); } catch { /* table may have disappeared */ }
    } finally { this.root.classList.remove("rg-root--saving"); }
  }

  applyPatch(patch) {
    if (this.session) return this.session.applyPatch(patch, this);
    const patches = Array.isArray(patch) ? patch : [patch];
    const rowDeletion = patches.length > 0 && patches.every((item) => item?.op === "deleteRows");
    return this.commitMutation("External patch", () => applyPatchToModel(this.model, patch, false), patchChangesLayout(patch), { rowDeletion }).then(() => this.model.toJSON());
  }

  dispose({ releaseNative = true } = {}) {
    this.disposed = true; clearTimeout(this.saveTimer); this.dirtyCells.clear(); this.resizeCleanup?.(); if (!this.session) this.adapter.dispose?.();
    this.editorController?.dispose(); this.editorController = null;
    this.clearSelectionPresentation();
    globalThis.window.removeEventListener("keydown", this.boundWindowKeydown, true);
    document.removeEventListener("pointerdown", this.boundDocumentPointerDown, true);
    document.removeEventListener("pointerup", this.boundPointerUp, true); releaseRichCellHosts(this.root); this.root.remove();
    this.themeBridge?.dispose?.(); this.themeBridge = null;
    this.session?.removeView(this);
    if (releaseNative) this.nativeElement?.classList.remove("rg-native-hidden", "rg-native-pending");
  }
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
    this.cells = new Map(); this.cellValueTokens = new WeakMap(); this.editorController = null;
    this.formulaEngine = new AsyncFormulaEngine(this.store, runtime.registries.formulaFunctions, runtime.registries.formulaFunctionMetadata);
    this.saveTimer = null; this.renderToken = 0; this.dragSelecting = false; this.boundUp = () => { this.dragSelecting = false; };
    this.rowOffsets = null; this.rowMetricsKey = null; this.rowResizePreview = null; this.columnResizePreview = null; this.resizeCleanup = null;
    this.keyboardActive = false; this.boundDocumentPointerDown = (event) => { this.keyboardActive = this.root.contains(event.target) || Boolean(this.editorController?.popover.contains(event.target)); };
    this.boundWindowKeydown = (event) => { if (this.keyboardActive) this.onKeydown(event); };
    this.mount();
  }
  mount() {
    this.markerElement?.classList.add("rg-large-marker-hidden"); this.host.appendChild(this.root);
    const toolbar = document.createElement("div"); toolbar.className = "rg-toolbar";
    toolbar.append(button("Merge", "Safely merge selection", () => this.merge()), button("Unmerge", "Unmerge selection", () => this.unmerge()), button("⇤", "Align selection left", () => this.alignSelection("left")), button("≡", "Center selection", () => this.alignSelection("center")), button("⇥", "Align selection right", () => this.alignSelection("right")), button("fx", "Show or hide formula-cell coloring", () => this.toggleFormulaColors()), button("Labels", "Show or hide row and column labels", () => this.toggleHeaders()), button("Save", "Commit dirty chunks", () => this.flush()), button("Export", "Export visible selection", () => this.exportSelection()), button("Native copy", "Copy to a native table when within the write budget", () => copyLargeToNative(this.store)));
    this.status = document.createElement("span"); this.status.className = "rg-status"; toolbar.appendChild(this.status);
    this.viewport = document.createElement("div"); this.viewport.className = "rg-large-viewport";
    this.canvas = document.createElement("div"); this.canvas.className = "rg-large-canvas"; this.viewport.appendChild(this.canvas);
    this.root.append(toolbar, this.viewport); globalThis.window.addEventListener("keydown", this.boundWindowKeydown, true); document.addEventListener("pointerdown", this.boundDocumentPointerDown, true); this.root.addEventListener("paste", (event) => this.onPaste(event));
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
      onFinish: async ({ row, col, value, commit, movement }) => {
        const previous = await this.store.getRaw(row, col);
        let affected = new Set([`${row}:${col}`]);
        if (commit && value !== previous) {
          await this.store.setCell(row, col, value);
          affected = this.formulaEngine.invalidateCell(row, col);
          this.scheduleSave();
        }
        await this.repaintLargeCells(affected);
        if (movement) this.moveLargeSelection(...movement);
        this.root.focus({ preventScroll: true });
      },
    });
    this.viewport.addEventListener("scroll", () => this.scheduleRender()); document.addEventListener("pointerup", this.boundUp, true); this.scheduleRender();
  }
  headerWidth() { return this.store.manifest.showHeaders === false ? 0 : 42; }
  headerHeight() { return this.store.manifest.showHeaders === false ? 0 : 28; }
  columnWidth(col) { const id = this.store.manifest.columnIds[col]; return this.columnResizePreview?.col === col ? this.columnResizePreview.width : this.store.manifest.widths[id] || DEFAULT_COL_WIDTH; }
  totalWidth() { return this.headerWidth() + this.store.manifest.columnIds.reduce((sum, _id, col) => sum + this.columnWidth(col), 0); }
  colLeft(col) { let left = this.headerWidth(); for (let index = 0; index < col; index += 1) left += this.columnWidth(index); return left; }
  rebuildRowMetrics() {
    const preview = this.rowResizePreview ? `${this.rowResizePreview.row}:${this.rowResizePreview.height}` : "";
    const key = `${this.store.manifest.rowCount}:${preview}`;
    if (key === this.rowMetricsKey) return;
    this.rowOffsets = new Float64Array(this.store.manifest.rowCount + 1);
    for (let row = 0; row < this.store.manifest.rowCount; row += 1) this.rowOffsets[row + 1] = this.rowOffsets[row] + (this.rowResizePreview?.row === row ? this.rowResizePreview.height : this.store.rowHeight(row));
    this.rowMetricsKey = key;
  }
  rowTop(row) { this.rebuildRowMetrics(); return this.headerHeight() + this.rowOffsets[clamp(row, 0, this.store.manifest.rowCount)]; }
  rowSpanHeight(row, span = 1) { this.rebuildRowMetrics(); return this.rowOffsets[Math.min(this.store.manifest.rowCount, row + span)] - this.rowOffsets[row]; }
  rowAtOffset(offset) {
    this.rebuildRowMetrics(); const target = Math.max(0, offset - this.headerHeight()); let low = 0; let high = this.store.manifest.rowCount;
    while (low < high) { const middle = Math.floor((low + high) / 2); if (this.rowOffsets[middle + 1] <= target) low = middle + 1; else high = middle; }
    return clamp(low, 0, Math.max(0, this.store.manifest.rowCount - 1));
  }
  scheduleRender() {
    const token = ++this.renderToken;
    requestAnimationFrame(() => {
      if (token !== this.renderToken) return;
      void this.renderVisible(token).catch((error) => toast(`Large grid render failed: ${error.message}`, "danger", 8000));
    });
  }
  async renderVisible(token = this.renderToken) {
    if (this.editorController?.state && !this.editorController.state.floating) return;
    const { rowCount, colCount } = this.store.manifest; this.status.textContent = `${rowCount.toLocaleString()} × ${colCount}`;
    const headerHeight = this.headerHeight(); const headerWidth = this.headerWidth();
    this.rebuildRowMetrics(); this.canvas.style.width = `${this.totalWidth()}px`; this.canvas.style.height = `${headerHeight + this.rowOffsets[rowCount]}px`;
    const startRow = clamp(this.rowAtOffset(this.viewport.scrollTop) - 8, 0, Math.max(0, rowCount - 1));
    const endRow = clamp(this.rowAtOffset(this.viewport.scrollTop + this.viewport.clientHeight) + 9, 0, rowCount);
    let startCol = 0; let x = headerWidth; while (startCol < colCount && x + this.columnWidth(startCol) < this.viewport.scrollLeft) x += this.columnWidth(startCol++);
    let endCol = startCol; let visibleWidth = x; while (endCol < colCount && visibleWidth < this.viewport.scrollLeft + this.viewport.clientWidth + DEFAULT_COL_WIDTH * 2) visibleWidth += this.columnWidth(endCol++);
    startCol = Math.max(0, startCol - 1);
    const rows = await this.store.getRows(startRow, endRow);
    if (token !== this.renderToken) return;
    releaseRichCellHosts(this.canvas); this.canvas.replaceChildren(); this.cells.clear();
    if (this.store.manifest.showHeaders !== false) for (let col = startCol; col < endCol; col += 1) {
      const header = document.createElement("div"); header.className = "rg-header rg-large-col-header"; header.textContent = columnLabel(col); header.style.left = `${this.colLeft(col)}px`; header.style.width = `${this.columnWidth(col)}px`;
      const resize = document.createElement("span"); resize.className = "rg-col-resize"; resize.title = "Drag to resize column · double-click to reset"; resize.addEventListener("pointerdown", (event) => this.startColumnResize(col, event)); resize.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); this.store.setColumnWidth(col, null); this.rowMetricsKey = null; this.scheduleSave(true); this.scheduleRender(); }); header.appendChild(resize); this.canvas.appendChild(header);
    }
    const engine = this.formulaEngine;
    for (let row = startRow; row < endRow; row += 1) {
      if (this.store.manifest.showHeaders !== false) {
        const rowHeader = document.createElement("div"); rowHeader.className = "rg-header rg-large-row-header"; rowHeader.textContent = String(row + 1); rowHeader.style.top = `${this.rowTop(row)}px`; rowHeader.style.height = `${this.rowSpanHeight(row)}px`;
        const resize = document.createElement("span"); resize.className = "rg-large-row-resize"; resize.title = "Drag to resize row · double-click to reset"; resize.addEventListener("pointerdown", (event) => this.startRowResize(row, event)); resize.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); this.store.setRowHeight(row, null); this.rowMetricsKey = null; this.scheduleSave(true); this.scheduleRender(); }); rowHeader.appendChild(resize); this.canvas.appendChild(rowHeader);
      }
      for (let col = startCol; col < endCol; col += 1) {
        const merge = this.store.mergeAt(row, col); if (merge && (merge.row !== row || merge.col !== col)) continue;
        const cell = document.createElement("div"); cell.className = "rg-cell rg-large-cell"; cell.classList.toggle("rg-cell--merged", Boolean(merge)); const alignment = this.store.getAlignment(row, col); if (alignment) cell.classList.add(`rg-cell--align-${alignment}`); cell.dataset.row = String(row); cell.dataset.col = String(col); cell.style.left = `${this.colLeft(col)}px`; cell.style.top = `${this.rowTop(row)}px`;
        let width = 0; for (let offset = 0; offset < (merge?.colSpan || 1); offset += 1) width += this.columnWidth(col + offset);
        cell.style.width = `${width}px`; cell.style.height = `${this.rowSpanHeight(row, merge?.rowSpan || 1)}px`;
        const raw = rows[row - startRow]?.[col] ?? "";
        void this.renderLargeCellValue(cell, raw, row, col, engine);
        if (rangeContains(this.selection, row, col)) cell.classList.add("rg-cell--selected");
        cell.addEventListener("pointerdown", (event) => { if (event.button !== 0) return; if (event.target.closest?.(".rg-editor")) return; const anchorMerge = this.store.mergeAt(row, col); const anchorRow = anchorMerge?.row ?? row; const anchorCol = anchorMerge?.col ?? col; if (this.editorController?.insertReference(anchorRow, anchorCol, event)) return; this.anchor = { row: anchorRow, col: anchorCol }; this.selection = { startRow: anchorRow, endRow: anchorRow, startCol: anchorCol, endCol: anchorCol }; this.dragSelecting = true; this.root.focus(); this.updateLargeSelection(); event.preventDefault(); });
        cell.addEventListener("pointerenter", () => { if (this.dragSelecting) { this.selection = normalizeRange({ startRow: this.anchor.row, endRow: row, startCol: this.anchor.col, endCol: col }); this.scheduleRender(); } });
        cell.addEventListener("dblclick", () => this.beginEdit(row, col, cell)); this.canvas.appendChild(cell); this.cells.set(`${row}:${col}`, cell);
      }
    }
    this.editorController?.schedulePresentation();
  }

  async renderLargeCellValue(cell, raw, row, col, engine = this.formulaEngine) {
    const key = `${row}:${col}`; const token = (this.cellValueTokens.get(cell) || 0) + 1; this.cellValueTokens.set(cell, token);
    const formula = raw.startsWith("=") && !raw.startsWith("=="); const content = ensureCellContent(cell);
    cell.dataset.rgRaw = raw; cell.classList.toggle("rg-cell--formula", formula && this.store.manifest.colorFormulaCells !== false);
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

  updateLargeSelection() {
    for (const cell of this.cells.values()) {
      const row = Number(cell.dataset.row); const col = Number(cell.dataset.col);
      const merge = this.store.mergeAt(row, col);
      const selected = rangeContains(this.selection, row, col) || merge && rangesOverlap(this.selection, { startRow: merge.row, endRow: merge.row + merge.rowSpan - 1, startCol: merge.col, endCol: merge.col + merge.colSpan - 1 });
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

  startRowResize(row, event) {
    event.preventDefault(); event.stopPropagation(); this.resizeCleanup?.(); const startY = event.clientY; const startHeight = this.store.rowHeight(row); let moved = false;
    const move = (moveEvent) => { moved = true; this.rowResizePreview = { row, height: clamp(Math.round(startHeight + moveEvent.clientY - startY), MIN_ROW_HEIGHT, MAX_ROW_HEIGHT) }; this.rowMetricsKey = null; this.scheduleRender(); };
    const up = () => { const height = this.rowResizePreview?.height ?? startHeight; cleanup(); this.rowResizePreview = null; if (!moved) return; this.store.setRowHeight(row, height); this.rowMetricsKey = null; this.scheduleSave(true); this.scheduleRender(); };
    const cleanup = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); this.resizeCleanup = null; };
    this.resizeCleanup = cleanup; document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  startColumnResize(col, event) {
    event.preventDefault(); event.stopPropagation(); this.resizeCleanup?.(); const startX = event.clientX; const startWidth = this.columnWidth(col); let moved = false;
    const move = (moveEvent) => { moved = true; this.columnResizePreview = { col, width: clamp(Math.round(startWidth + moveEvent.clientX - startX), MIN_COL_WIDTH, MAX_COL_WIDTH) }; this.scheduleRender(); };
    const up = () => { const width = this.columnResizePreview?.width ?? startWidth; cleanup(); this.columnResizePreview = null; if (!moved) return; this.store.setColumnWidth(col, width); this.scheduleSave(true); this.scheduleRender(); };
    const cleanup = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); this.resizeCleanup = null; };
    this.resizeCleanup = cleanup; document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  async beginEdit(row, col, cell = this.cells.get(`${row}:${col}`), initial = null, floating = false) {
    if (!cell) return;
    const merge = this.store.mergeAt(row, col); row = merge?.row ?? row; col = merge?.col ?? col;
    const raw = await this.store.getRaw(row, col);
    return this.editorController?.start({ row, col, cell, raw, initial, floating });
  }
  onKeydown(event) {
    if (event.target.matches("textarea,input")) return; event.stopPropagation(); const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === "c") { event.preventDefault(); this.copy(); return; }
    if (command && event.shiftKey && event.key.toLowerCase() === "m") { event.preventDefault(); this.merge(); return; }
    if (event.key === "Enter") { event.preventDefault(); const cell = this.cells.get(`${this.selection.startRow}:${this.selection.startCol}`); if (cell) this.beginEdit(this.selection.startRow, this.selection.startCol, cell); return; }
    if (event.key === "F2") { event.preventDefault(); const cell = this.cells.get(`${this.selection.startRow}:${this.selection.startCol}`); if (cell) this.beginEdit(this.selection.startRow, this.selection.startCol, cell, null, true); return; }
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, event.shiftKey ? -1 : 1] };
    if (moves[event.key]) { event.preventDefault(); this.moveLargeSelection(...moves[event.key]); return; }
    if (event.key.length === 1 && !command && !event.altKey) { event.preventDefault(); const cell = this.cells.get(`${this.selection.startRow}:${this.selection.startCol}`); if (cell) this.beginEdit(this.selection.startRow, this.selection.startCol, cell, event.key); }
  }
  ensureVisible(row, col) { const top = this.rowTop(row); const height = this.rowSpanHeight(row); const left = this.colLeft(col); const width = this.columnWidth(col); if (top < this.viewport.scrollTop + this.headerHeight()) this.viewport.scrollTop = top - this.headerHeight(); else if (top + height > this.viewport.scrollTop + this.viewport.clientHeight) this.viewport.scrollTop = top - this.viewport.clientHeight + height; if (left < this.viewport.scrollLeft + this.headerWidth()) this.viewport.scrollLeft = left - this.headerWidth(); else if (left + width > this.viewport.scrollLeft + this.viewport.clientWidth) this.viewport.scrollLeft = left - this.viewport.clientWidth + width; }
  async copy() { const range = normalizeRange(this.selection); const rows = await this.store.getRows(range.startRow, range.endRow + 1); const text = rows.map((row) => row.slice(range.startCol, range.endCol + 1).map((value) => quoteDelimited(value, "\t")).join("\t")).join("\n"); navigator.clipboard?.writeText(text); }
  async onPaste(event) {
    const images = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
    if (images.length) {
      event.preventDefault();
      try {
        const embeds = []; for (const file of images) embeds.push(await roam().file.upload({ file, toast: { hide: true } }));
        const row = this.selection.startRow; const col = this.selection.startCol;
        await this.store.setCell(row, col, embeds.join(" "));
        await this.repaintLargeCells(this.invalidateLargeCells([[row, col]]));
        this.scheduleSave();
      } catch (error) { toast(error.message, "danger"); }
      return;
    }
    const text = event.clipboardData?.getData("text/plain"); if (!text) return;
    event.preventDefault(); const matrix = parseDelimited(text, text.includes("\t") ? "\t" : detectDelimiter(text));
    const startRow = this.selection.startRow; const startCol = this.selection.startCol;
    await this.store.applyMatrix(startRow, startCol, matrix);
    const coordinates = matrix.flatMap((values, row) => values.map((_value, col) => [startRow + row, startCol + col]));
    this.invalidateLargeCells(coordinates); this.scheduleSave(); this.scheduleRender();
  }
  async merge() { try { await this.store.merge(this.selection); this.scheduleSave(true); this.scheduleRender(); } catch (error) { toast(error.message, "danger"); } }
  unmerge() { if (!this.store.unmerge(this.selection.startRow, this.selection.startCol)) return toast("The active cell is not merged", "warning"); this.scheduleSave(true); this.scheduleRender(); }
  alignSelection(alignment) { const range = normalizeRange(this.selection); for (let row = range.startRow; row <= range.endRow; row += 1) for (let col = range.startCol; col <= range.endCol; col += 1) this.store.setAlignment(row, col, alignment); this.scheduleSave(true); this.scheduleRender(); }
  toggleFormulaColors() { this.store.manifest.colorFormulaCells = this.store.manifest.colorFormulaCells === false; this.store.metadataDirty = true; this.scheduleSave(true); this.scheduleRender(); }
  toggleHeaders() { this.store.manifest.showHeaders = this.store.manifest.showHeaders === false; this.store.metadataDirty = true; this.scheduleSave(true); this.scheduleRender(); }
  scheduleSave(immediate = false) { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.flush(), immediate ? 0 : 500); }
  async flush() { clearTimeout(this.saveTimer); this.root.classList.add("rg-root--saving"); try { await this.store.commit(); toast("Large grid saved", "success", 1800); } catch (error) { toast(error.message, "danger", 8000); } finally { this.root.classList.remove("rg-root--saving"); } }
  async exportSelection() { const range = normalizeRange(this.selection); const rows = await this.store.getRows(range.startRow, range.endRow + 1); downloadText(rows.map((row) => row.slice(range.startCol, range.endCol + 1).map((value) => quoteDelimited(value, ",")).join(",")).join("\n"), "roam-grid-selection.csv", "text/csv"); }
  async applyPatch(patch) {
    const patches = Array.isArray(patch) ? patch : [patch]; const coordinates = [];
    for (const item of patches) {
      if (item.op !== "set") throw new GridError("PATCH", "Large-grid public patches currently support cell writes");
      await this.store.setCell(item.row, item.col, item.value); coordinates.push([item.row, item.col]);
    }
    this.invalidateLargeCells(coordinates); await this.store.commit(); this.scheduleRender();
    return { manifest: deepClone(this.store.manifest) };
  }
  dispose() { clearTimeout(this.saveTimer); this.resizeCleanup?.(); this.editorController?.dispose(); this.editorController = null; globalThis.window.removeEventListener("keydown", this.boundWindowKeydown, true); document.removeEventListener("pointerdown", this.boundDocumentPointerDown, true); document.removeEventListener("pointerup", this.boundUp, true); releaseRichCellHosts(this.root); this.root.remove(); this.markerElement?.classList.remove("rg-large-marker-hidden"); }
}

function downloadText(text, filename, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

async function createNativeTableFromModel(model, afterUid = null) {
  const mutations = model.rowCount * model.colCount;
  if (mutations > MAX_NATIVE_MUTATIONS) throw new GridError("MUTATION_BUDGET", `Native conversion would create ${mutations} blocks, above the safe write budget`);
  const tableUid = afterUid ? await insertAfterBlock(afterUid, "{{[[table]]}}") : await insertNearFocus("{{[[table]]}}");
  for (let row = 0; row < model.rowCount; row += 1) {
    let parentUid = tableUid;
    for (let col = 0; col < model.colCount; col += 1) parentUid = await createBlock(parentUid, model.getRaw(row, col) || " ", col === 0 ? row : 0);
  }
  const adapter = new NativeTableAdapter(tableUid);
  const loaded = adapter.load();
  loaded.columnIds = [...model.columnIds]; loaded.merges = deepClone(model.merges); loaded.widths = { ...model.widths }; loaded.headerColumns = [...model.headerColumns]; loaded.frozenRows = model.frozenRows; loaded.frozenCols = model.frozenCols; loaded.charts = deepClone(model.charts); loaded.showHeaders = model.showHeaders !== false; loaded.fitToWidth = model.fitToWidth !== false; loaded.colorFormulaCells = model.colorFormulaCells !== false;
  for (let row = 0; row < Math.min(model.rowCount, loaded.rowCount); row += 1) {
    loaded.setRowHeight(row, model.getRowHeight(row));
    if (model.isHeaderRow(row)) loaded.toggleHeaderRow(row);
    for (let col = 0; col < Math.min(model.colCount, loaded.colCount); col += 1) loaded.setAlignment(row, col, model.getAlignment(row, col));
  }
  await runtime.metadata.set(tableUid, loaded, "native");
  syncEnhancedUidGuard(); scheduleScan(document);
  return tableUid;
}

async function resolveTemplateModel(name) {
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
    await runtime.templates.save(name, model);
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
    const names = [...new Set([...runtime.registries.templates.keys(), ...runtime.templates.list()])].sort((a, b) => a.localeCompare(b));
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

function activeMount() {
  const root = document.activeElement?.closest?.("[data-roam-grid-uid]");
  if (root?.__rgView) return root.__rgView;
  const uid = activeGridUid();
  if (!uid) return null;
  const session = runtime.sessions.get(uid);
  return session ? [...session.views].find((view) => view.root?.isConnected) || null : runtime.largeMounts.get(uid) || null;
}

async function enhanceFocusedTable() {
  const uid = ancestorWithMarker(focusedUid(), NATIVE_MARKER);
  if (!uid) return toast("Focus a cell in a native {{table}} first.", "warning");
  if (runtime.metadata.has(uid)) return toast("This table is already enhanced.", "warning");
  try {
    const adapter = new NativeTableAdapter(uid); const model = adapter.load(); await runtime.metadata.set(uid, model, "native"); syncEnhancedUidGuard(); scheduleScan(document); toast("Enhanced this table. Its Roam blocks remain canonical.", "success");
  } catch (error) { toast(error.message, "danger"); }
}

async function restoreFocusedTable() {
  const uid = activeGridUid();
  if (!uid || !runtime.metadata.has(uid)) return toast("Focus an enhanced Roam Grid first.", "warning");
  const entry = runtime.metadata.entries.get(uid);
  if (entry?.value?.mode === "large") return toast("Large grids cannot become native fallback without creating a native copy.", "warning");
  disposeNativeSession(uid, true); await runtime.metadata.remove(uid); syncEnhancedUidGuard(); toast("Restored the native Roam table.", "success");
}

async function newLargeGrid() {
  try {
    const anchorUid = await insertNearFocus("{{[[roam/grid]]}}"); const store = await new LargeGridStore(anchorUid).initialize();
    const metadataModel = new GridModel({ rows: [[""]], columnIds: store.manifest.columnIds, widths: store.manifest.widths, frozenRows: store.manifest.frozenRows, frozenCols: store.manifest.frozenCols, merges: store.manifest.merges, charts: store.manifest.charts, showHeaders: store.manifest.showHeaders !== false, colorFormulaCells: store.manifest.colorFormulaCells !== false });
    await runtime.metadata.set(anchorUid, metadataModel, "large"); scheduleScan(); toast("Created a 100 × 26 large grid.", "success");
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
      const custom = runtime.registries.importers.get(format.toUpperCase()); const model = custom ? await custom(await file.text()) : importGrid(await file.text(), format);
      if (model.rowCount * model.colCount <= MAX_NATIVE_MUTATIONS) await createNativeTableFromModel(model); else await copyNativeToLarge(model);
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

const mounting = new Set();

function nativeMetadataUids() {
  return new Set([...runtime.metadata?.entries || []].filter(([, entry]) => entry?.value?.mode !== "large").map(([uid]) => uid));
}

function installEnhancedUidGuard(uids) {
  if (!globalThis.document?.head) return null;
  const style = runtime.guardStyle || document.getElementById(PREPAINT_STYLE_ID) || document.createElement("style");
  style.id = PREPAINT_STYLE_ID; style.textContent = enhancedUidGuardCss(uids);
  if (!style.isConnected) document.head.appendChild(style);
  runtime.guardStyle = style;
  return style;
}

function syncEnhancedUidGuard() {
  if (!runtime.metadata) return installEnhancedUidGuard(readEnhancedUidCache());
  const uids = nativeMetadataUids(); writeEnhancedUidCache(uids); return installEnhancedUidGuard(uids);
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
  for (const [uid, entry] of entries) {
    if (entry?.value?.mode === "large") continue;
    for (let node = nativeElement; node; node = node.parentElement) {
      if (node.dataset?.uid === uid || String(node.id || "").endsWith(uid)) return { uid, context: "source", referenceElement: null };
    }
  }
  return null;
}

function claimNativeInstances(root) {
  if (!runtime.metadata) return;
  for (const nativeElement of nativeTablesWithin(root)) {
    const info = nativeTableInstanceInfo(nativeElement); if (!info) continue;
    nativeElement.classList.add("rg-native-pending");
  }
}

function disposeNativeSession(uid, releaseNative = false) {
  const session = runtime.sessions.get(uid); if (!session) return;
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

function mountNativeInstance(nativeElement, info) {
  const current = runtime.viewsByNative.get(nativeElement);
  if (current?.root?.isConnected) return current;
  nativeElement.classList.add("rg-native-pending");
  const session = getOrCreateNativeSession(info.uid);
  const view = new GridView({ host: nativeElement.parentElement, model: session.model, adapter: session.adapter, nativeElement, session, context: info.context });
  view.root.dataset.roamGridUid = info.uid; view.root.dataset.roamGridInstance = cryptoId(); view.root.__rgView = view;
  runtime.views.add(view); runtime.viewsByNative.set(nativeElement, view);
  nativeElement.classList.remove("rg-native-pending");
  return view;
}

function cleanupDisconnectedViews() {
  for (const view of [...runtime.views]) {
    if (view.root?.isConnected && view.nativeElement?.isConnected) continue;
    runtime.views.delete(view); runtime.viewsByNative.delete?.(view.nativeElement); view.dispose({ releaseNative: false });
  }
  for (const [uid, session] of [...runtime.sessions]) if (!runtime.metadata?.has(uid)) disposeNativeSession(uid, true);
  for (const [uid, mount] of [...runtime.largeMounts]) if (!mount.root?.isConnected || !runtime.metadata?.has(uid)) {
    mount.dispose(); runtime.largeMounts.delete(uid);
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

function handleDomMutations(records) {
  for (const record of records || []) for (const node of record.addedNodes || []) if (node.nodeType === 1) scheduleScan(node);
  if (!(records || []).some((record) => record.addedNodes?.length)) scheduleScan(document);
}

async function scanMounts() {
  if (!runtime.metadata) return;
  const roots = runtime.pendingScanRoots.size ? [...runtime.pendingScanRoots] : [document]; runtime.pendingScanRoots.clear();
  for (const root of roots) for (const nativeElement of nativeTablesWithin(root)) {
    const info = nativeTableInstanceInfo(nativeElement); if (!info || runtime.viewsByNative.get(nativeElement)?.root?.isConnected) continue;
    try { mountNativeInstance(nativeElement, info); }
    catch (error) {
      console.error("[roam-grid] Mount failed", info.uid, error);
      nativeElement.classList.remove("rg-native-hidden", "rg-native-pending");
      nativeElement.parentElement?.querySelector?.(".rg-root")?.remove();
      toast(`Roam Grid could not enhance ${info.uid}: ${error.message}`, "danger", 10000);
    }
  }
  for (const [uid, entry] of runtime.metadata.entries) {
    if (entry.value.mode !== "large" || runtime.largeMounts.get(uid)?.root?.isConnected || mounting.has(uid)) continue;
    const block = findBlockElement(uid); if (!block) continue;
    mounting.add(uid);
    try {
      const marker = block.querySelector(".rm-block__input") || block.firstElementChild;
      const store = await new LargeGridStore(uid).initialize(); const view = new LargeGridView({ host: block, store, markerElement: marker });
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
    ["Roam Grid: Insert chart", () => commandOnActive("insertChart")],
    ["Roam Grid: Merge", () => commandOnActive("mergeSelection", "merge")],
    ["Roam Grid: Unmerge", () => commandOnActive("unmergeSelection", "unmerge")],
  ];
  for (const [label, callback] of commands) {
    extensionAPI.ui.commandPalette.addCommand({ label, callback });
    extensionAPI.ui.slashCommand.addCommand({ label, callback });
  }
}

async function initializeSettings(extensionAPI) {
  if (extensionAPI.settings.get("nativeMutationBudget") == null) await extensionAPI.settings.set("nativeMutationBudget", MAX_NATIVE_MUTATIONS);
  await extensionAPI.settings.panel.create({
    tabTitle: "Roam Grid",
    settings: [{ id: "nativeMutationBudget", name: "Native write budget", description: "Maximum Roam block mutations in one structural operation. Larger operations should use large-grid mode.", action: { type: "input", onChange: () => {} } }],
  });
}

async function onload({ extensionAPI }) {
  installEnhancedUidGuard(readEnhancedUidCache());
  runtime.extensionAPI = extensionAPI; runtime.registries = new RegistrySet(); runtime.metadata = new MetadataStore(); runtime.templates = new GridTemplateStore();
  await runtime.metadata.initialize(); syncEnhancedUidGuard(); await runtime.templates.initialize(); await initializeSettings(extensionAPI); registerCommands(extensionAPI);
  const publicApi = createPublicApi(); globalThis.window.roamGrid = { ...(globalThis.window.roamGrid || {}), v1: publicApi };
  document.addEventListener("focusin", rememberFocusedUid, true);
  runtime.disposers.push(() => document.removeEventListener("focusin", rememberFocusedUid, true));
  runtime.observer = new MutationObserver(handleDomMutations); runtime.observer.observe(document.querySelector(".roam-app") || document.body, { childList: true, subtree: true });
  scheduleScan(document);
  console.info(`[roam-grid] Loaded v${VERSION}`);
}

async function onunload() {
  runtime.observer?.disconnect(); runtime.observer = null; runtime.pendingScanRoots.clear(); runtime.scanQueued = false;
  for (const uid of [...runtime.sessions.keys()]) disposeNativeSession(uid, true);
  for (const mount of runtime.largeMounts.values()) mount.dispose(); runtime.largeMounts.clear();
  runtime.guardStyle?.remove(); runtime.guardStyle = null;
  for (const dispose of runtime.disposers.splice(0)) try { dispose(); } catch { /* no-op */ }
  document.querySelectorAll(".rg-toasts,.rg-dialog-overlay,.rg-context-menu").forEach((element) => {
    if (element.__rgDismiss) element.__rgDismiss(); else element.remove();
  });
  if (globalThis.window?.roamGrid?.v1?.version === VERSION) delete globalThis.window.roamGrid.v1;
  runtime.extensionAPI = null; runtime.metadata = null; runtime.templates = null; runtime.registries = null; runtime.lastFocusedUid = null; runtime.views.clear(); runtime.viewsByNative = new WeakMap();
  console.info("[roam-grid] Unloaded");
}

export default { onload, onunload };
