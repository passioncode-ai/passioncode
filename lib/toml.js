'use strict';
/**
 * Just enough TOML to edit one `[mcp_servers.<name>]` table in Codex's config.toml
 * without a dependency and without disturbing anything else in the file.
 *
 * The scanner reads the whole document (strings, multi-line strings, arrays and
 * inline tables included), so a line that merely looks like a header inside a
 * multi-line value is never taken for one. A document it cannot read is an error:
 * the caller then refuses to rewrite the file rather than guess.
 */

const BARE = /^[A-Za-z0-9_-]+$/;

class TomlError extends Error {}

/** Parse a TOML value starting at `i`; returns { value, end }. */
function parseValue(text, i) {
  const at = (k) => text.slice(i, i + k);
  if (at(3) === '"""' || at(3) === "'''") {
    const q = at(3);
    const close = text.indexOf(q, i + 3);
    if (close < 0) throw new TomlError('unterminated multi-line string');
    let end = close + 3;
    while (text[end] === q[0] && end < close + 5) end += 1; // up to two quotes may belong to the content
    let body = text.slice(i + 3, end - 3).replace(/^\r?\n/, '');
    if (q === '"""') body = unescape(body.replace(/\\\s*\r?\n\s*/g, ''));
    return { value: body, end };
  }
  if (text[i] === '"') {
    let j = i + 1;
    while (j < text.length && text[j] !== '"') {
      if (text[j] === '\n') throw new TomlError('newline in a basic string');
      j += text[j] === '\\' ? 2 : 1;
    }
    if (j >= text.length) throw new TomlError('unterminated string');
    return { value: unescape(text.slice(i + 1, j)), end: j + 1 };
  }
  if (text[i] === "'") {
    const j = text.indexOf("'", i + 1);
    if (j < 0 || text.slice(i + 1, j).includes('\n')) throw new TomlError('unterminated literal string');
    return { value: text.slice(i + 1, j), end: j + 1 };
  }
  if (text[i] === '[') {
    const out = [];
    let j = skipWs(text, i + 1, true);
    while (text[j] !== ']') {
      const v = parseValue(text, j);
      out.push(v.value);
      j = skipWs(text, v.end, true);
      if (text[j] === ',') j = skipWs(text, j + 1, true);
      else if (text[j] !== ']') throw new TomlError('expected , or ] in an array');
    }
    return { value: out, end: j + 1 };
  }
  if (text[i] === '{') {
    const out = {};
    let j = skipWs(text, i + 1, false);
    while (text[j] !== '}') {
      const k = parseKey(text, j);
      j = skipWs(text, k.end, false);
      if (text[j] !== '=') throw new TomlError('expected = in an inline table');
      const v = parseValue(text, skipWs(text, j + 1, false));
      setPath(out, k.path, v.value);
      j = skipWs(text, v.end, false);
      if (text[j] === ',') j = skipWs(text, j + 1, false);
      else if (text[j] !== '}') throw new TomlError('expected , or } in an inline table');
    }
    return { value: out, end: j + 1 };
  }
  const m = /^[^\s,\]}#]+/.exec(text.slice(i));
  if (!m) throw new TomlError(`unexpected ${JSON.stringify(text[i] || 'end of file')}`);
  const raw = m[0];
  const value = raw === 'true' ? true : raw === 'false' ? false : /^[+-]?\d[\d_]*$/.test(raw) ? Number(raw.replace(/_/g, '')) : raw;
  return { value, end: i + raw.length };
}

function unescape(s) {
  return s.replace(/\\(u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|.)/g, (_, e) => {
    if (e[0] === 'u' || e[0] === 'U') return String.fromCodePoint(parseInt(e.slice(1), 16));
    const map = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
    if (!(e in map)) throw new TomlError(`bad escape \\${e}`);
    return map[e];
  });
}

/** Whitespace, and — where `newlines` — line breaks and comments too (inside arrays). */
function skipWs(text, i, newlines) {
  for (;;) {
    while (i < text.length && (text[i] === ' ' || text[i] === '\t' || (newlines && (text[i] === '\n' || text[i] === '\r')))) i += 1;
    if (newlines && text[i] === '#') { while (i < text.length && text[i] !== '\n') i += 1; continue; }
    return i;
  }
}

/** A dotted key (bare or quoted parts) starting at `i`; returns { path, end }. */
function parseKey(text, i) {
  const path = [];
  for (;;) {
    i = skipWs(text, i, false);
    if (text[i] === '"' || text[i] === "'") {
      const v = parseValue(text, i);
      path.push(v.value);
      i = v.end;
    } else {
      const m = /^[A-Za-z0-9_-]+/.exec(text.slice(i));
      if (!m) throw new TomlError(`bad key at ${JSON.stringify(text.slice(i, i + 20))}`);
      path.push(m[0]);
      i += m[0].length;
    }
    const j = skipWs(text, i, false);
    if (text[j] !== '.') return { path, end: i };
    i = j + 1;
  }
}

function setPath(obj, path, value) {
  let o = obj;
  for (const k of path.slice(0, -1)) o = o[k] = (o[k] && typeof o[k] === 'object' ? o[k] : {});
  o[path[path.length - 1]] = value;
}

/** Skip trailing spaces and an optional comment, then the line break; returns the next line's start. */
function endOfLine(text, i) {
  i = skipWs(text, i, false);
  if (text[i] === '#') while (i < text.length && text[i] !== '\n') i += 1;
  if (i < text.length && text[i] === '\r') i += 1;
  if (i < text.length && text[i] !== '\n') throw new TomlError(`unexpected ${JSON.stringify(text.slice(i, i + 20))} after a value`);
  return Math.min(text.length, i + 1);
}

/**
 * Scan a document into headers and key/value lines, with offsets.
 * Each item: { type: 'header', start, end, path, array } or
 *            { type: 'key', start, end, path, value, table } (table: the enclosing header's path).
 */
function scan(text) {
  const items = [];
  let table = [];
  let i = 0;
  while (i < text.length) {
    const lineStart = i;
    i = skipWs(text, i, false);
    if (text[i] === '\n' || text[i] === '\r') { i = endOfLine(text, i); continue; }
    if (text[i] === '#') { i = endOfLine(text, i); continue; }
    if (i >= text.length) break;
    if (text[i] === '[') {
      const array = text[i + 1] === '[';
      const k = parseKey(text, i + (array ? 2 : 1));
      let j = skipWs(text, k.end, false);
      if (text[j] !== ']' || (array && text[j + 1] !== ']')) throw new TomlError('bad table header');
      j += array ? 2 : 1;
      const end = endOfLine(text, j);
      items.push({ type: 'header', start: lineStart, end, path: k.path, array });
      table = k.path;
      i = end;
      continue;
    }
    const k = parseKey(text, i);
    let j = skipWs(text, k.end, false);
    if (text[j] !== '=') throw new TomlError(`expected = after key ${k.path.join('.')}`);
    const v = parseValue(text, skipWs(text, j + 1, false));
    const end = endOfLine(text, v.end);
    items.push({ type: 'key', start: lineStart, end, path: k.path, value: v.value, table });
    i = end;
  }
  return items;
}

const samePrefix = (path, prefix) => prefix.every((p, n) => path[n] === p);

/**
 * Where `[mcp_servers.<name>]` lives in the document.
 * Returns { found, form, sections: [{ start, end, sub }], table, subtables }:
 *   form 'table' — declared as its own table (editable);
 *   form 'inline' — declared as a key of [mcp_servers] or a dotted root key (not rewritten).
 */
function findServer(text, name) {
  const items = scan(text);
  const prefix = ['mcp_servers', name];
  const sections = [];
  let inline = false;
  for (let n = 0; n < items.length; n += 1) {
    const it = items[n];
    if (it.type === 'key' && samePrefix([...it.table, ...it.path], prefix) && !samePrefix(it.table, prefix)) inline = true;
    if (it.type !== 'header' || !samePrefix(it.path, prefix)) continue;
    const next = items.slice(n + 1).find((x) => x.type === 'header');
    sections.push({ start: it.start, end: next ? next.start : text.length, sub: it.path.slice(2), array: it.array });
  }
  const table = {};
  const subtables = {};
  for (const it of items) {
    if (it.type !== 'key' || !samePrefix(it.table, prefix)) continue;
    const sub = it.table.slice(2);
    if (!sub.length) setPath(table, it.path, it.value);
    else setPath((subtables[sub.join('.')] = subtables[sub.join('.')] || {}), it.path, it.value);
  }
  // A subtable's keys are part of the server as read: [mcp_servers.x.env] → table.env.
  for (const [sub, value] of Object.entries(subtables)) setPath(table, sub.split('.'), { ...(getPath(table, sub.split('.')) || {}), ...value });
  return { found: sections.length > 0 || inline, form: inline ? 'inline' : 'table', sections, table, items };
}

function getPath(obj, path) { return path.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj); }

const key = (k) => (BARE.test(k) ? k : JSON.stringify(k));
const str = (v) => JSON.stringify(String(v));
function render(value) {
  if (Array.isArray(value)) return `[${value.map(render).join(', ')}]`;
  if (value && typeof value === 'object') return `{ ${Object.entries(value).map(([k, v]) => `${key(k)} = ${render(v)}`).join(', ')} }`;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return str(value);
}

/**
 * Replace (or add) `[mcp_servers.<name>]` with `managed` (a flat object; object values
 * become subtables). Keys of the old table that `managed` does not own are kept, and so
 * are its other subtables, verbatim. `owned` lists the keys this writer manages.
 */
function upsertServer(text, name, managed, owned) {
  const found = findServer(text, name);
  if (found.form === 'inline') throw new TomlError(`mcp_servers.${name} is declared inline; edit it by hand`);
  const header = `[mcp_servers.${key(name)}]`;
  const lines = [header];
  const subs = [];
  for (const [k, v] of Object.entries(managed)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (Object.keys(v).length) subs.push(`[mcp_servers.${key(name)}.${key(k)}]\n${Object.entries(v).map(([a, b]) => `${key(a)} = ${render(b)}`).join('\n')}\n`);
    } else if (v !== undefined) lines.push(`${key(k)} = ${render(v)}`);
  }
  // Unmanaged key lines of the main table, and unmanaged subtables, verbatim.
  const main = found.sections.find((s) => !s.sub.length);
  if (main) {
    for (const it of found.items) {
      if (it.type === 'key' && it.start >= main.start && it.end <= main.end && it.table.length === 2 && !owned.includes(it.path[0])) {
        lines.push(text.slice(it.start, it.end).replace(/\r?\n$/, '').trim());
      }
    }
  }
  const kept = found.sections.filter((s) => s.sub.length && !owned.includes(s.sub[0])).map((s) => text.slice(s.start, s.end).replace(/\s*$/, '\n'));
  const block = [lines.join('\n') + '\n', ...subs, ...kept].join('\n');
  return splice(text, found.sections, block);
}

/** Remove `[mcp_servers.<name>]` and its subtables. */
function removeServer(text, name) {
  const found = findServer(text, name);
  if (found.form === 'inline') throw new TomlError(`mcp_servers.${name} is declared inline; edit it by hand`);
  return splice(text, found.sections, '');
}

/** Cut the sections out; put `block` where the first one was (or at the end). */
function splice(text, sections, block) {
  if (!sections.length) {
    if (!block) return text;
    const base = text.replace(/\s*$/, '');
    return base ? `${base}\n\n${block}` : block;
  }
  const ordered = [...sections].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  ordered.forEach((s, n) => {
    out += text.slice(cursor, s.start);
    if (n === 0 && block) out += block + (s.end < text.length ? '\n' : '');
    cursor = s.end;
  });
  out += text.slice(cursor);
  return out.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

module.exports = { scan, findServer, upsertServer, removeServer, parseValue, TomlError };
