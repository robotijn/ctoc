'use strict';

/**
 * THE CAPABILITY REGISTRY — CTOC's single, data-driven source of truth for how to
 * detect, lint, type-check, test, secure, build and RUN a given language.
 *
 * WHY THIS EXISTS. Four detection surfaces (stack-detector, tool-detector,
 * sast-runner, app-runner) each carried a different, partial, drifting language
 * table, so "vision → working app" (detect → lint → typecheck → test → security →
 * run) was real only for the JS/Python slice. This registry is the keystone: ONE
 * table keyed by language, loaded from `.ctoc/capabilities/languages/*.yaml`, that
 * all four surfaces will consume (CR5) instead of their local copies. Adding a
 * language becomes a one-file change.
 *
 * THE ENGINE IS DUMB, THE DATA IS SMART. There is NO hardcoded language logic here
 * — every command lives in the YAML data. This module only loads, detects, and
 * looks up.
 *
 * SECURITY — IT RETURNS COMMANDS, IT NEVER RUNS THEM. A hostile or malformed
 * `.ctoc/capabilities` file must never be remote code execution. Therefore:
 *   • every read routes through safe-fs (the audited choke point);
 *   • this module performs NO dynamic code execution and spawns NO process of any
 *     kind — a `cmd` from a capability file is an inert STRING the caller may
 *     choose to run under its own controls, never something this module executes;
 *   • load() is FAIL-OPEN: a malformed/oversized/hostile entry is SKIPPED and a
 *     warning is recorded, exactly like task-registry's per-entry fail-open; the
 *     rest of the registry still loads.
 *
 * PROVENANCE. Every seed command is web-grounded (the vision's 2026 anchors) and
 * carries `verified: web-2026-07`, or is honestly flagged `verified: UNVERIFIED`.
 * Nothing is ever "guessed".
 *
 * MOBILE/DESKTOP RUN IS HONEST. `runStrategyFor` reports `honest: true` for a
 * genuinely runnable/pollable runtime (a Rust binary, a Go server) and
 * `honest: 'build-is-last-mile'` for mobile/desktop, where "build succeeds + tests
 * pass" is the CI-safe last mile and an emulator boot is not CI-reliable — never a
 * false "it ran".
 *
 * Cross-platform: path.join only; safe-fs for all I/O; no shell, no regex-driven
 * command construction.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const { safeRegExp, escapeRegExp } = require('./regex-utils');

/**
 * Defense-in-depth caps on untrusted capability files (a project may drop hostile
 * files under its own `.ctoc/capabilities`). A file above the size cap, or a
 * directory with more than the file cap, is treated as untrusted → skipped + warn.
 */
const MAX_FILE_BYTES = 64 * 1024;
const MAX_FILES = 500;

/** The bundled seed data directory, resolved relative to this module (ships with the plugin). */
function bundledDir() {
  return path.join(__dirname, '..', '..', '.ctoc', 'capabilities', 'languages');
}

/** A project-local override directory (a project may add/override languages). */
function projectDir(projectRoot) {
  return path.join(projectRoot, '.ctoc', 'capabilities', 'languages');
}

/** The bundled project-type seed directory (ships with the plugin). */
function bundledProjectTypesDir() {
  return path.join(__dirname, '..', '..', '.ctoc', 'capabilities', 'project-types');
}

/** A project-local override directory for project types. */
function projectProjectTypesDir(projectRoot) {
  return path.join(projectRoot, '.ctoc', 'capabilities', 'project-types');
}

/** The bundled database seed directory (ships with the plugin). */
function bundledDatabasesDir() {
  return path.join(__dirname, '..', '..', '.ctoc', 'capabilities', 'databases');
}

/** A project-local override directory for databases. */
function projectDatabasesDir(projectRoot) {
  return path.join(projectRoot, '.ctoc', 'capabilities', 'databases');
}

/** The bundled framework seed directory (ships with the plugin). */
function bundledFrameworksDir() {
  return path.join(__dirname, '..', '..', '.ctoc', 'capabilities', 'frameworks');
}

/** A project-local override directory for frameworks. */
function projectFrameworksDir(projectRoot) {
  return path.join(projectRoot, '.ctoc', 'capabilities', 'frameworks');
}

// ── minimal, zero-dependency YAML subset parser ─────────────────────────────────
// Handles exactly the shapes the capability files use: 2-space-indented block maps,
// inline flow maps `{ k: v, k2: "v" }`, inline arrays `[a, b]`, quoted/bare scalars,
// and `#` comments. It is PURE STRING PARSING — no eval, no code execution — so a
// hostile file can at worst produce a wrong object (which validation then rejects),
// never run anything. Mirrors the per-module parsers already in budget.js /
// regulatory-regime.js (the codebase deliberately ships no runtime YAML library).

/**
 * Split a string on a delimiter at bracket-depth 0 and outside quotes.
 * @param {string} str
 * @param {string} delim single-character delimiter
 * @returns {string[]}
 */
function splitTopLevel(str, delim) {
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quote) {
      if (c === '\\' && i + 1 < str.length) { cur += c + str[i + 1]; i++; continue; }
      if (c === quote) quote = null;
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '[' || c === '{') { depth++; cur += c; continue; }
    if (c === ']' || c === '}') { depth--; cur += c; continue; }
    if (c === delim && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Strip a trailing `#` comment from a line, honoring quotes (a `#` inside a quoted
 * string is data, not a comment). A `#` only opens a comment at line start or after
 * whitespace.
 * @param {string} line
 * @returns {string}
 */
function stripLineComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/**
 * Index of the first `:` at bracket-depth 0 and outside quotes (the key/value split
 * point). Returns -1 when there is none.
 * @param {string} s
 * @returns {number}
 */
function topLevelColon(s) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '[' || c === '{') { depth++; continue; }
    if (c === ']' || c === '}') { depth--; continue; }
    if (c === ':' && depth === 0) return i;
  }
  return -1;
}

/**
 * Parse a scalar / inline-array / inline-flow-map value.
 * @param {string} raw
 * @returns {*}
 */
function parseValue(raw) {
  const v = raw.trim();
  if (v === '' || v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.startsWith('{') && v.endsWith('}')) return parseFlowMap(v.slice(1, -1));
  if (v.startsWith('[') && v.endsWith(']')) return parseFlowArray(v.slice(1, -1));
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    const inner = v.slice(1, -1);
    if (v[0] === '"') { try { return JSON.parse(v); } catch { return inner; } }
    return inner;
  }
  if (/^-?\d+$/.test(v) || /^-?\d+\.\d+$/.test(v)) {
    // Coerce to Number ONLY when the value round-trips losslessly (String(Number(v)) === v).
    // This preserves version-like strings a consumer treats as opaque: `1.0` (a trailing-.0
    // provenance/version tag) and `007` (a leading-zero id) do NOT round-trip, so they stay
    // strings, while genuine numbers `1`, `2`, `3.5` still coerce. Without this guard
    // `verified: 1.0` silently became Number 1 and `007` became 7.
    const n = Number(v);
    if (String(n) === v) return n;
    return v;
  }
  return v; // bareword string (e.g. clippy, web-2026-07, Cargo.toml, build-is-last-mile)
}

/**
 * Parse the body (no braces) of an inline flow map into an object.
 * @param {string} body
 * @returns {Object}
 */
function parseFlowMap(body) {
  const obj = {};
  const trimmed = body.trim();
  if (trimmed === '') return obj;
  for (const piece of splitTopLevel(trimmed, ',')) {
    const seg = piece.trim();
    if (seg === '') continue;
    const ci = topLevelColon(seg);
    if (ci === -1) continue;
    const key = seg.slice(0, ci).trim().replace(/^["']|["']$/g, '');
    obj[key] = parseValue(seg.slice(ci + 1).trim());
  }
  return obj;
}

/**
 * Parse the body (no brackets) of an inline array into an array.
 * @param {string} body
 * @returns {Array}
 */
function parseFlowArray(body) {
  const trimmed = body.trim();
  if (trimmed === '') return [];
  return splitTopLevel(trimmed, ',').map((s) => parseValue(s.trim()));
}

/**
 * Parse the capability-YAML subset into a plain object. Never executes anything.
 * @param {string} text
 * @returns {Object}
 */
function parseCapabilityYaml(text) {
  const lines = text
    .split(/\r?\n/)
    .map(stripLineComment)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0);

  const root = {};
  const stack = [{ obj: root, indent: -1 }];

  for (const rawLine of lines) {
    const indent = rawLine.match(/^ */)[0].length;
    const trimmed = rawLine.trim();
    const ci = topLevelColon(trimmed);
    if (ci === -1) continue; // not a key: value line (unsupported shape) → skip

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const current = stack[stack.length - 1].obj;

    const key = trimmed.slice(0, ci).trim().replace(/^["']|["']$/g, '');
    const rawValue = trimmed.slice(ci + 1).trim();

    if (rawValue === '') {
      const child = {};
      current[key] = child;
      stack.push({ obj: child, indent });
    } else {
      current[key] = parseValue(rawValue);
    }
  }
  return root;
}

// ── loading (fail-open, per-entry) ──────────────────────────────────────────────

/**
 * A parsed capability is VALID only if it names its language, carries a NON-EMPTY
 * detectionMarkers ARRAY, and a NON-EMPTY toolchain object. The array + non-empty checks
 * are load-bearing: two idiomatic-but-unsupported YAML shapes otherwise pass and then
 * misbehave silently — a BLOCK-sequence `detectionMarkers:` renders as `{}` (the flow-only
 * parser has no block-list support) so the language never detects with no warning; a
 * tab-mangled or empty `toolchain:` renders as `{}` so every toolchainFor lookup returns
 * null silently. Rejecting them here upholds the module's skip-and-warn / fail-loud
 * contract: a structurally-broken override is SKIPPED with a warning, never silently
 * accepted. (We do NOT add block-sequence/tab parsing — out of scope; the parser stays
 * flow-only and the validator rejects what it cannot faithfully represent.)
 * @param {*} obj
 * @returns {boolean}
 */
function isValidCapability(obj) {
  return !!obj
    && typeof obj === 'object'
    && typeof obj.language === 'string'
    && obj.language.trim().length > 0
    && Array.isArray(obj.detectionMarkers)
    && obj.detectionMarkers.length > 0
    && obj.toolchain
    && typeof obj.toolchain === 'object'
    && !Array.isArray(obj.toolchain)
    && Object.keys(obj.toolchain).length > 0;
}

/**
 * Read one capabilities directory, folding each valid entry into `languages` (keyed
 * by its declared language) and recording a warning for each skipped file. FAIL-OPEN
 * throughout: a missing dir, an unreadable/oversized/malformed/invalid file, or a
 * directory over the file cap never throws — it degrades to a warning.
 * @param {string} dir
 * @param {Object} languages accumulator (mutated) — later dirs override earlier.
 * @param {Array} warnings accumulator (mutated)
 */
function readCapabilityDir(dir, languages, warnings) {
  let entries;
  try {
    if (!safeFs.existsSync(dir)) return;
    // .sort() makes iteration DETERMINISTIC and identical on every platform: fs.readdirSync
    // order is filesystem-dependent (alphabetical-ish on APFS, hash order on ext4/xfs), so
    // without this the primary-language pick (detectLanguages[0], the run target) could differ
    // between Linux CI and a macOS laptop for the same repo — a cross-platform correctness bug.
    entries = safeFs.readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
  } catch (err) {
    warnings.push({ file: dir, message: `unreadable capabilities dir: ${err.message}` });
    return;
  }
  if (entries.length > MAX_FILES) {
    warnings.push({ file: dir, message: `too many capability files (${entries.length} > ${MAX_FILES}) — skipped` });
    return;
  }
  for (const name of entries) {
    const p = path.join(dir, name);
    try {
      const size = safeFs.statSync(p).size;
      if (size > MAX_FILE_BYTES) {
        warnings.push({ file: name, message: `capability file too large (${size} bytes) — skipped` });
        continue;
      }
      const parsed = parseCapabilityYaml(safeFs.readFileSync(p, 'utf8'));
      if (!isValidCapability(parsed)) {
        warnings.push({ file: name, message: 'malformed capability entry (missing/empty language, detectionMarkers array, or toolchain) — skipped' });
        continue;
      }
      languages[parsed.language] = parsed; // later dir (project override) wins
    } catch (err) {
      warnings.push({ file: name, message: `capability parse/read failed — skipped: ${err.message}` });
    }
  }
}

/**
 * Load the capability registry: the bundled seed data first, then an optional
 * project override overlaid on top (a project's `.ctoc/capabilities/languages/*`
 * replaces a bundled language of the same name). Reads FRESH every call (the file
 * set is tiny) so on-disk truth always wins — no stale cache.
 *
 * @param {string} [projectRoot] optional project root whose overrides are overlaid.
 * @returns {{ languages: Object<string, Object>, warnings: Array<{file:string,message:string}> }}
 */
function load(projectRoot) {
  const languages = {};
  const warnings = [];
  readCapabilityDir(bundledDir(), languages, warnings);
  if (typeof projectRoot === 'string' && projectRoot.length > 0) {
    readCapabilityDir(projectDir(projectRoot), languages, warnings);
  }
  return { languages, warnings };
}

// ── project-type dimension (CR3) ────────────────────────────────────────────────
// A language names the toolchain; a project TYPE names which phases matter, the run
// strategy, and the config scaffold — so a Flutter app, a Rust CLI, a data-science
// notebook and a microservice monorepo get different pipelines in the same language.
// Same dumb-engine/smart-data contract as the language table: this loads and looks
// up, it never runs anything.

/**
 * A parsed project type is VALID only if it names itself, carries a NON-EMPTY
 * detectionMarkers ARRAY (the field projectTypeFor reads to detect the type), and the
 * three pipeline-shaping fields: a phase-relevance map, a run strategy, and a config
 * scaffold list. The detectionMarkers array check mirrors isValidCapability's F2 fix — a
 * BLOCK-sequence `detectionMarkers:` renders as `{}` under the flow-only parser, which would
 * otherwise pass validation and then never detect the type with no warning. Anything else
 * (a broken/hostile file) is rejected → skipped + warned.
 * @param {*} obj
 * @returns {boolean}
 */
function isValidProjectType(obj) {
  return !!obj
    && typeof obj === 'object'
    && typeof obj.projectType === 'string'
    && obj.projectType.trim().length > 0
    && Array.isArray(obj.detectionMarkers)
    && obj.detectionMarkers.length > 0
    && obj.phases
    && typeof obj.phases === 'object'
    && !Array.isArray(obj.phases)
    && obj.run
    && typeof obj.run === 'object'
    && Array.isArray(obj.configScaffold)
    && obj.configScaffold.length > 0;
}

/**
 * Read one project-types directory, folding each valid entry into `projectTypes`
 * (keyed by its declared `projectType`) and recording a warning per skipped file.
 * FAIL-OPEN throughout, exactly like readCapabilityDir.
 * @param {string} dir
 * @param {Object} projectTypes accumulator (mutated) — later dirs override earlier.
 * @param {Array} warnings accumulator (mutated)
 */
function readProjectTypeDir(dir, projectTypes, warnings) {
  let entries;
  try {
    if (!safeFs.existsSync(dir)) return;
    // .sort() makes iteration DETERMINISTIC and identical on every platform: fs.readdirSync
    // order is filesystem-dependent (alphabetical-ish on APFS, hash order on ext4/xfs), so
    // without this the primary-language pick (detectLanguages[0], the run target) could differ
    // between Linux CI and a macOS laptop for the same repo — a cross-platform correctness bug.
    entries = safeFs.readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
  } catch (err) {
    warnings.push({ file: dir, message: `unreadable project-types dir: ${err.message}` });
    return;
  }
  if (entries.length > MAX_FILES) {
    warnings.push({ file: dir, message: `too many project-type files (${entries.length} > ${MAX_FILES}) — skipped` });
    return;
  }
  for (const name of entries) {
    const p = path.join(dir, name);
    try {
      const size = safeFs.statSync(p).size;
      if (size > MAX_FILE_BYTES) {
        warnings.push({ file: name, message: `project-type file too large (${size} bytes) — skipped` });
        continue;
      }
      const parsed = parseCapabilityYaml(safeFs.readFileSync(p, 'utf8'));
      if (!isValidProjectType(parsed)) {
        warnings.push({ file: name, message: 'malformed project-type entry (missing projectType/detectionMarkers/phases/run/configScaffold) — skipped' });
        continue;
      }
      projectTypes[parsed.projectType] = parsed; // later dir (project override) wins
    } catch (err) {
      warnings.push({ file: name, message: `project-type parse/read failed — skipped: ${err.message}` });
    }
  }
}

/**
 * Load the project-type registry: the bundled seed data first, then an optional
 * project override overlaid on top. Reads FRESH every call (the set is tiny) so
 * on-disk truth always wins — no stale cache. FAIL-OPEN per entry.
 *
 * @param {string} [projectRoot] optional project root whose overrides are overlaid.
 * @returns {{ projectTypes: Object<string, Object>, warnings: Array<{file:string,message:string}> }}
 */
function loadProjectTypes(projectRoot) {
  const projectTypes = {};
  const warnings = [];
  readProjectTypeDir(bundledProjectTypesDir(), projectTypes, warnings);
  if (typeof projectRoot === 'string' && projectRoot.length > 0) {
    readProjectTypeDir(projectProjectTypesDir(projectRoot), projectTypes, warnings);
  }
  return { projectTypes, warnings };
}

/**
 * Detect the project type of a project from its declared detectionMarkers, resolving
 * overlaps by the `priority` field (higher wins) so a decisive marker (turbo.json →
 * monorepo, main.tf → infra) beats a generic one. Matches BOTH marker kinds, exactly
 * like `detectLanguages`:
 *
 *   • EXACT filename/dirname (e.g. `project.godot`, or the Unity `ProjectSettings`
 *     DIRECTORY) — `existsSync`, unchanged; it matches a file OR a directory.
 *   • GLOB (e.g. `*.uproject` for Unreal, `*.ino` for Arduino) — a `readdir` of the
 *     project ROOT matched with an ANCHORED regex built identically to
 *     `detectLanguages` (escape every metachar via `escapeRegExp`, then `\*` → `.*`,
 *     wrapped in `^…$`). NO raw `new RegExp` — the pattern is escaped and constructed
 *     through `safeRegExp`, the single audited choke point. `safeRegExp` centralizes
 *     construction but does not itself cap backtracking; the only shipped glob markers
 *     are single-`*` patterns, which compile to linear-time `.*` regexes.
 *
 * Priority resolution is UNCHANGED. Returns the winning project-type name, or null.
 *
 * @param {string} projectRoot project root to scan.
 * @returns {string|null} the detected project-type name, or null when none matches.
 */
function projectTypeFor(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) return null;
  const { projectTypes } = loadProjectTypes(projectRoot);
  // Read the project root ONCE for glob markers; fail-soft to [] (an unreadable root
  // simply yields no glob evidence — exact markers still work via existsSync).
  let rootFiles = [];
  try {
    rootFiles = safeFs.readdirSync(projectRoot);
  } catch { rootFiles = []; }
  let best = null;
  let bestPriority = -Infinity;
  for (const [name, t] of Object.entries(projectTypes)) {
    const markers = Array.isArray(t.detectionMarkers) ? t.detectionMarkers : [];
    let matched = false;
    for (const marker of markers) {
      if (typeof marker !== 'string') continue;
      if (marker.includes('*')) {
        // Glob marker: ReDoS-safe, anchored whole-filename match (see JSDoc above).
        const pattern = safeRegExp('^' + escapeRegExp(marker).replace(/\\\*/g, '.*') + '$');
        if (rootFiles.some((f) => pattern.test(f))) { matched = true; break; }
      } else {
        // Exact filename/dirname marker: unchanged existsSync (matches a file OR a dir).
        try {
          if (safeFs.existsSync(path.join(projectRoot, marker))) { matched = true; break; }
        } catch { /* unreadable → not detected via this marker */ }
      }
    }
    if (!matched) continue;
    const priority = typeof t.priority === 'number' ? t.priority : 0;
    if (priority > bestPriority) { best = name; bestPriority = priority; }
  }
  return best;
}

/**
 * MERGE a language's toolchain with a project type's pipeline shape: for every phase
 * the project type declares relevant, attach that relevance PLUS the language's
 * command for that phase; carry the type's run strategy + honest flag enriched with
 * the language's run command (via the type's `runShape`); union the two config
 * scaffolds. Returns null when either the language or the project type is unknown.
 *
 * The engine merges DATA; it never runs a command. The `cmd` values are inert strings.
 *
 * @param {string} language e.g. 'dart'
 * @param {string} projectType e.g. 'mobile-crossplatform'
 * @param {string} [projectRoot]
 * @returns {{ language: string, projectType: string,
 *   phases: Object<string, {relevance: string, cmd: (string|null), tool: (string|null), verified: (string|null)}>,
 *   run: { strategy: (string|null), honest: (boolean|string), command: (string|null), shape: (string|null) },
 *   configScaffold: string[] }|null}
 */
function pipelineFor(language, projectType, projectRoot) {
  const cap = capabilitiesFor(language, projectRoot);
  if (!cap) return null;
  const { projectTypes } = loadProjectTypes(projectRoot);
  const type = projectTypes[projectType];
  if (!type) return null;

  const toolchain = cap.toolchain && typeof cap.toolchain === 'object' ? cap.toolchain : {};
  /** @type {Object<string, {relevance: string, cmd: (string|null), tool: (string|null), verified: (string|null)}>} */
  const phases = {};
  for (const [phase, relevance] of Object.entries(type.phases)) {
    const entry = toolchain[phase] && typeof toolchain[phase] === 'object' ? toolchain[phase] : null;
    phases[phase] = {
      relevance,
      cmd: entry && typeof entry.cmd === 'string' ? entry.cmd : null,
      tool: entry && entry.tool != null ? entry.tool : null,
      verified: entry && entry.verified != null ? entry.verified : null
    };
  }

  // SAST and SCA are the two halves of security: static analysis of the code, and a
  // dependency-CVE audit of what it pulls in. A project type's phase list is a
  // whitelist and no type declares depsAudit, so dependency auditing was silently
  // dropped from every pipeline even when security is required. When the type treats
  // security as relevant AND the language toolchain actually defines a depsAudit,
  // surface it at the SAME relevance as security. Data-driven: keyed only off the
  // toolchain and the security phase — no hardcoded project-type names — and it never
  // overrides a depsAudit a project type declared for itself.
  if (phases.security && !phases.depsAudit) {
    const dep = toolchain.depsAudit && typeof toolchain.depsAudit === 'object' ? toolchain.depsAudit : null;
    if (dep) {
      phases.depsAudit = {
        relevance: phases.security.relevance,
        cmd: typeof dep.cmd === 'string' ? dep.cmd : null,
        tool: dep.tool != null ? dep.tool : null,
        verified: dep.verified != null ? dep.verified : null
      };
    }
  }

  const runShape = typeof type.runShape === 'string' ? type.runShape : null;
  const shapes = cap.run && cap.run.shapes && typeof cap.run.shapes === 'object' ? cap.run.shapes : {};
  const runCommand = runShape && typeof shapes[runShape] === 'string' ? shapes[runShape] : null;

  // HONEST-RUN CONTRACT. `honest: true` asserts "this genuinely runs" — but a NULL run
  // command means there is nothing to run, so honest:true + command:null is a lie:
  // app-runner treats pipeline.run.honest as AUTHORITATIVE and would propagate a false
  // "it ran" to the human. When the language supplies no command for the type's runShape,
  // a `true` honest flag degrades to `false`. NON-true honest flags — `false` and
  // 'build-is-last-mile' — are CONSISTENT with a null command (they never claimed a live
  // run) and are preserved verbatim. Mirrors runStrategyFor's guard, which returns null
  // rather than ever pairing honest:true with a missing command.
  const rawHonest = type.run ? type.run.honest : null;
  const honest = (rawHonest === true && runCommand == null) ? false : rawHonest;

  // Union the two scaffolds, preserving first-seen order and de-duplicating.
  const langScaffold = Array.isArray(cap.configScaffold) ? cap.configScaffold : [];
  const typeScaffold = Array.isArray(type.configScaffold) ? type.configScaffold : [];
  const configScaffold = [];
  for (const f of [...langScaffold, ...typeScaffold]) {
    if (typeof f === 'string' && !configScaffold.includes(f)) configScaffold.push(f);
  }

  return {
    language,
    projectType,
    phases,
    run: {
      strategy: type.run && type.run.strategy != null ? type.run.strategy : null,
      honest,
      command: runCommand,
      shape: runShape
    },
    configScaffold
  };
}

// ── databases dimension (DB-w1) ──────────────────────────────────────────────────
// A language names the toolchain; a project TYPE names the pipeline shape; a DATABASE
// names the persistence layer's security posture (injection concern, row-level-security
// support, transport, least-privilege) and migration story. Databases live in a
// project's DEPENDENCIES (pg, mongoose, redis), not in marker files — so DETECTION is
// dep-parsing in stack-detector (which consumes loadDatabases below), and this registry
// holds the capability DATA. Same dumb-engine/smart-data contract: this loads and looks
// up, it never opens a connection or runs a query.

/**
 * A parsed database is VALID only if it names itself and carries a category, a security
 * object, and a non-empty deps array (detection depends on `deps`). Anything else (a
 * broken/hostile file) is rejected → skipped + warned, exactly like the sibling loaders.
 * @param {*} obj
 * @returns {boolean}
 */
function isValidDatabase(obj) {
  return !!obj
    && typeof obj === 'object'
    && typeof obj.database === 'string'
    && obj.database.trim().length > 0
    && typeof obj.category === 'string'
    && obj.category.trim().length > 0
    && obj.security
    && typeof obj.security === 'object'
    && !Array.isArray(obj.security)
    && Array.isArray(obj.deps)
    && obj.deps.length > 0;
}

/**
 * Read one databases directory, folding each valid entry into `databases` (keyed by its
 * declared `database`) and recording a warning per skipped file. FAIL-OPEN throughout,
 * exactly like readCapabilityDir / readProjectTypeDir.
 * @param {string} dir
 * @param {Object} databases accumulator (mutated) — later dirs override earlier.
 * @param {Array} warnings accumulator (mutated)
 */
function readDatabaseDir(dir, databases, warnings) {
  let entries;
  try {
    if (!safeFs.existsSync(dir)) return;
    // .sort() makes iteration DETERMINISTIC and identical on every platform: fs.readdirSync
    // order is filesystem-dependent (alphabetical-ish on APFS, hash order on ext4/xfs), so
    // without this the primary-language pick (detectLanguages[0], the run target) could differ
    // between Linux CI and a macOS laptop for the same repo — a cross-platform correctness bug.
    entries = safeFs.readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
  } catch (err) {
    warnings.push({ file: dir, message: `unreadable databases dir: ${err.message}` });
    return;
  }
  if (entries.length > MAX_FILES) {
    warnings.push({ file: dir, message: `too many database files (${entries.length} > ${MAX_FILES}) — skipped` });
    return;
  }
  for (const name of entries) {
    const p = path.join(dir, name);
    try {
      const size = safeFs.statSync(p).size;
      if (size > MAX_FILE_BYTES) {
        warnings.push({ file: name, message: `database file too large (${size} bytes) — skipped` });
        continue;
      }
      const parsed = parseCapabilityYaml(safeFs.readFileSync(p, 'utf8'));
      if (!isValidDatabase(parsed)) {
        warnings.push({ file: name, message: 'malformed database entry (missing database/category/security/deps) — skipped' });
        continue;
      }
      databases[parsed.database] = parsed; // later dir (project override) wins
    } catch (err) {
      warnings.push({ file: name, message: `database parse/read failed — skipped: ${err.message}` });
    }
  }
}

/**
 * Load the database registry: the bundled seed data first, then an optional project
 * override overlaid on top (a project's `.ctoc/capabilities/databases/*` replaces a
 * bundled database of the same name). Reads FRESH every call (the set is tiny) so
 * on-disk truth always wins — no stale cache. FAIL-OPEN per entry.
 *
 * @param {string} [projectRoot] optional project root whose overrides are overlaid.
 * @returns {{ databases: Object<string, Object>, warnings: Array<{file:string,message:string}> }}
 */
function loadDatabases(projectRoot) {
  const databases = {};
  const warnings = [];
  readDatabaseDir(bundledDatabasesDir(), databases, warnings);
  if (typeof projectRoot === 'string' && projectRoot.length > 0) {
    readDatabaseDir(projectDatabasesDir(projectRoot), databases, warnings);
  }
  return { databases, warnings };
}

/**
 * The whole capability object for a database (category + security + migration + deps),
 * or null when unknown. The live caller is stack-detector's `detectDatabases`, which
 * enriches each dep-detected database with this record.
 *
 * @param {string} name e.g. 'postgresql'
 * @param {string} [projectRoot]
 * @returns {Object|null}
 */
function databaseCapability(name, projectRoot) {
  if (typeof name !== 'string' || name.length === 0) return null;
  const { databases } = loadDatabases(projectRoot);
  return databases[name] || null;
}

// ── frameworks dimension (FW-w1) ─────────────────────────────────────────────────
// A language names the toolchain; a project TYPE names the pipeline shape; a DATABASE
// names the persistence layer; a FRAMEWORK names the application layer's category
// (web-frontend/backend/fullstack/api), its language, its framework-specific security
// CONCERN areas (security-headers, csrf, ssrf, auth-middleware — FW-w2 turns these
// into real checks), a test/lint hint, and a config scaffold. Frameworks live in a
// project's DEPENDENCIES (next, @nestjs/core, django) and/or config MARKERS
// (manage.py, angular.json) — so ENRICHMENT is dep/marker matching in stack-detector
// (which consumes loadFrameworks below), and this registry holds the capability DATA.
// Same dumb-engine/smart-data contract: this loads and looks up, it never runs a
// framework command or a test.

/**
 * A parsed framework is VALID only if it names itself and carries a category, a
 * language, a security object with a non-empty `concerns` array, and a non-empty deps
 * array (enrichment depends on `deps`). Anything else (a broken/hostile file) is
 * rejected → skipped + warned, exactly like the sibling loaders.
 * @param {*} obj
 * @returns {boolean}
 */
function isValidFramework(obj) {
  return !!obj
    && typeof obj === 'object'
    && typeof obj.framework === 'string'
    && obj.framework.trim().length > 0
    && typeof obj.category === 'string'
    && obj.category.trim().length > 0
    && typeof obj.language === 'string'
    && obj.language.trim().length > 0
    && obj.security
    && typeof obj.security === 'object'
    && !Array.isArray(obj.security)
    && Array.isArray(obj.security.concerns)
    && obj.security.concerns.length > 0
    && Array.isArray(obj.deps)
    && obj.deps.length > 0;
}

/**
 * Read one frameworks directory, folding each valid entry into `frameworks` (keyed by
 * its declared `framework`) and recording a warning per skipped file. FAIL-OPEN
 * throughout, exactly like readCapabilityDir / readProjectTypeDir / readDatabaseDir.
 * @param {string} dir
 * @param {Object} frameworks accumulator (mutated) — later dirs override earlier.
 * @param {Array} warnings accumulator (mutated)
 */
function readFrameworkDir(dir, frameworks, warnings) {
  let entries;
  try {
    if (!safeFs.existsSync(dir)) return;
    // .sort() makes iteration DETERMINISTIC and identical on every platform: fs.readdirSync
    // order is filesystem-dependent (alphabetical-ish on APFS, hash order on ext4/xfs), so
    // without this the primary-language pick (detectLanguages[0], the run target) could differ
    // between Linux CI and a macOS laptop for the same repo — a cross-platform correctness bug.
    entries = safeFs.readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
  } catch (err) {
    warnings.push({ file: dir, message: `unreadable frameworks dir: ${err.message}` });
    return;
  }
  if (entries.length > MAX_FILES) {
    warnings.push({ file: dir, message: `too many framework files (${entries.length} > ${MAX_FILES}) — skipped` });
    return;
  }
  for (const name of entries) {
    const p = path.join(dir, name);
    try {
      const size = safeFs.statSync(p).size;
      if (size > MAX_FILE_BYTES) {
        warnings.push({ file: name, message: `framework file too large (${size} bytes) — skipped` });
        continue;
      }
      const parsed = parseCapabilityYaml(safeFs.readFileSync(p, 'utf8'));
      if (!isValidFramework(parsed)) {
        warnings.push({ file: name, message: 'malformed framework entry (missing framework/category/language/security.concerns/deps) — skipped' });
        continue;
      }
      frameworks[parsed.framework] = parsed; // later dir (project override) wins
    } catch (err) {
      warnings.push({ file: name, message: `framework parse/read failed — skipped: ${err.message}` });
    }
  }
}

/**
 * Load the framework registry: the bundled seed data first, then an optional project
 * override overlaid on top (a project's `.ctoc/capabilities/frameworks/*` replaces a
 * bundled framework of the same name). Reads FRESH every call (the set is tiny) so
 * on-disk truth always wins — no stale cache. FAIL-OPEN per entry.
 *
 * @param {string} [projectRoot] optional project root whose overrides are overlaid.
 * @returns {{ frameworks: Object<string, Object>, warnings: Array<{file:string,message:string}> }}
 */
function loadFrameworks(projectRoot) {
  const frameworks = {};
  const warnings = [];
  readFrameworkDir(bundledFrameworksDir(), frameworks, warnings);
  if (typeof projectRoot === 'string' && projectRoot.length > 0) {
    readFrameworkDir(projectFrameworksDir(projectRoot), frameworks, warnings);
  }
  return { frameworks, warnings };
}

/**
 * The whole capability object for a framework (category + language + security.concerns
 * + configScaffold + deps + files), or null when unknown. The live caller is
 * stack-detector's `frameworkCapabilities`, which enriches each dep/marker-detected
 * framework with this record.
 *
 * @param {string} name e.g. 'nextjs'
 * @param {string} [projectRoot]
 * @returns {Object|null}
 */
function frameworkCapability(name, projectRoot) {
  if (typeof name !== 'string' || name.length === 0) return null;
  const { frameworks } = loadFrameworks(projectRoot);
  return frameworks[name] || null;
}

// ── lookups (the API the four surfaces will call in CR5) ─────────────────────────

/**
 * The languages whose detectionMarkers exist in the project. Replaces the four
 * duplicate marker tables in CR5, and matches BOTH kinds of marker the surfaces use:
 *
 *   • EXACT filename (e.g. `Cargo.toml`, `go.mod`) — `existsSync`, unchanged.
 *   • GLOB (e.g. `*.csproj`, `*.gemspec`, `*.c`) — a `readdir` of the project ROOT
 *     matched with a ReDoS-safe, ANCHORED regex built exactly like
 *     `tool-detector.js:88-92` (escape every metachar, then `\*` → `.*`), wrapped in
 *     `^…$` so the pattern matches the WHOLE filename. The anchoring is load-bearing:
 *     without it `app.cpp` would match `*.c` (`.*\.c` occurs inside "app.cpp"); with
 *     it, C-vs-C++ disambiguation falls out naturally per-marker (`main.c`→c,
 *     `app.cpp`→cpp) with NO special-case code.
 *
 * NO raw `new RegExp` — the pattern goes through `safeRegExp`/`escapeRegExp` (the
 * single audited choke point) so a data-derived glob can never be a ReDoS or
 * injection vector. This is root-level glob + exact matching only — the same
 * detection power as `tool-detector`; file-extension tree-walking stays in
 * stack-detector (CR5-s4), out of scope here.
 *
 * ORDER IS DETERMINISTIC, CROSS-PLATFORM STABLE, AND MANIFEST-FIRST (F1). Two keys
 * order the result:
 *
 *   1. PRIMARY — MARKER KIND. A language matched by an EXACT MANIFEST MARKER (a specific
 *      filename that exists: `Cargo.toml`, `go.mod`, `requirements.txt`, `pom.xml`,
 *      `package.json`, …) ranks AHEAD of a language matched ONLY by a SOURCE-FILE GLOB
 *      (`*.c`, `*.h`, `*.sh`). This is the actual F1 fix. Alphabetical was the WRONG
 *      primary key: `c.yaml` sorts first of all 26 capability files, so ANY Rust/Go/Python
 *      repo carrying an incidental C/C++ file at the root (an FFI `wrapper.h`, a cgo
 *      `bridge.c`, a C-extension `_ext.c`) was ranked with `c` FIRST — and app-runner's run
 *      target (`detectLanguages[0]`) became `c` → `./a.out`, a gcc default that does not
 *      exist and is not the app. A manifest is a decisive "this repo IS this language"
 *      signal; a stray source file is not. So the manifest tier always precedes the
 *      glob-only tier.
 *
 *   2. SECONDARY (within a tier) — SORTED capability-filename order. Each read*Dir loader
 *      `.sort()`s its directory listing, so load() order is the sorted-filename order and
 *      does NOT depend on fs.readdirSync order (alphabetical-ish on APFS, hash order on
 *      ext4/xfs). Iterating load() order and pushing into per-tier buckets keeps each tier
 *      sorted. Therefore `detectLanguages(root)[0]` — the run target app-runner consumes —
 *      is identical on every platform for the same repo and never shifts between loads.
 *
 * Each language is pushed at most once. A language that matches an exact marker at all is
 * a manifest match, even if it ALSO has glob markers (the exact signal decides the tier).
 * (For a project whose overrides ADD a new language, tiering is unchanged and the new key
 * appends within its tier in the override dir's sorted order — still fully deterministic.)
 *
 * @param {string} projectRoot project root to scan.
 * @returns {string[]} detected language names — manifest-matched first, then glob-only-matched,
 *   each sorted-capability-filename order within its tier (deterministic, cross-platform).
 */
function detectLanguages(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) return [];
  const { languages } = load(projectRoot);
  // Read the project root ONCE for glob markers; fail-soft to [] (an unreadable root
  // simply yields no glob evidence — exact-filename markers still work via existsSync).
  let rootFiles = [];
  try {
    rootFiles = safeFs.readdirSync(projectRoot);
  } catch { rootFiles = []; }
  // Three buckets, filled in load() (sorted-filename) order so each stays sorted internally.
  const manifestMatched = [];  // real app language, matched an EXACT marker → decisive signal
  const globOnlyMatched = [];  // real app language, matched ONLY a source-file glob → weak signal
  const ancillaryMatched = []; // cross-cutting infra/config language (role:ancillary) → never primary
  for (const [lang, cap] of Object.entries(languages)) {
    const markers = Array.isArray(cap.detectionMarkers) ? cap.detectionMarkers : [];
    let exact = false;
    let glob = false;
    for (const marker of markers) {
      if (typeof marker !== 'string') continue;
      if (marker.includes('*')) {
        // Glob marker: ReDoS-safe, anchored whole-filename match (see JSDoc above).
        const pattern = safeRegExp('^' + escapeRegExp(marker).replace(/\\\*/g, '.*') + '$');
        if (rootFiles.some((f) => pattern.test(f))) glob = true;
      } else {
        // Exact-filename marker: unchanged existsSync behavior (matches a file OR a dir).
        try {
          if (safeFs.existsSync(path.join(projectRoot, marker))) exact = true;
        } catch { /* unreadable → not detected via this marker */ }
      }
      // An exact match is decisive — no need to keep scanning this language's markers.
      if (exact) break;
    }
    if (!exact && !glob) continue;
    // ANCILLARY (F-ancillary): a cross-cutting infra/config language (role:ancillary — a
    // Dockerfile, a CI workflow) is DETECTED but never allowed to take the primary slot. It
    // ranks BELOW every real application language regardless of its marker kind, because it
    // describes how the app is packaged/shipped, not what the app IS. Without this, its exact
    // marker (Dockerfile, .github/workflows) would land it in the decisive manifest tier and,
    // sorting early by filename, make it detectLanguages[0] — the wrong run target — for
    // almost every real repo.
    if (cap.role === 'ancillary') ancillaryMatched.push(lang);
    else if (exact) manifestMatched.push(lang);
    else globOnlyMatched.push(lang);
  }
  const ordered = [...manifestMatched, ...globOnlyMatched, ...ancillaryMatched];
  return applyOutranks(ordered, languages);
}

/**
 * Apply each language's optional `outranks: [otherLang, …]` precedence — a data-driven,
 * PAIRWISE reorder. When language A declares it outranks B and BOTH are present in the
 * detected list, A is moved to immediately BEFORE B; every other language's relative order
 * is preserved. This is how typescript.yaml (`outranks: [javascript]`) expresses that a repo
 * carrying a tsconfig.json is a TypeScript project whose primary must be typescript, not
 * javascript — WITHOUT deleting javascript (a mixed repo legitimately has both). The engine
 * stays dumb: the relationship lives entirely in the YAML data.
 *
 * Iteration is load() order (sorted-filename), so the reorder is deterministic and
 * cross-platform stable. A named target that is absent, or already ahead of A, is a no-op.
 *
 * @param {string[]} ordered the tiered detection order.
 * @param {Object<string, Object>} languages the loaded capability map (source of `outranks`).
 * @returns {string[]} the order with every satisfied `outranks` precedence applied.
 */
function applyOutranks(ordered, languages) {
  const result = ordered.slice();
  for (const [lang, cap] of Object.entries(languages)) {
    const targets = Array.isArray(cap.outranks) ? cap.outranks : [];
    for (const target of targets) {
      if (typeof target !== 'string') continue;
      const ai = result.indexOf(lang);
      const bi = result.indexOf(target);
      if (ai === -1 || bi === -1 || ai < bi) continue; // absent, or A already ahead of B
      result.splice(ai, 1);                             // remove A
      result.splice(result.indexOf(target), 0, lang);   // reinsert A immediately before B
    }
  }
  return result;
}

/**
 * The whole capability object for a language, or null if unknown.
 * @param {string} language
 * @param {string} [projectRoot]
 * @returns {Object|null}
 */
function capabilitiesFor(language, projectRoot) {
  const { languages } = load(projectRoot);
  return languages[language] || null;
}

/**
 * The toolchain entry for a (language, phase) — `{ cmd, tool, verified, ... }` — or
 * null when the language or phase is unknown. The `cmd` is an inert STRING; the
 * caller runs it under its own controls, this module never does.
 *
 * @param {string} language e.g. 'rust'
 * @param {string} phase    e.g. 'lint' | 'format' | 'typecheck' | 'test' | 'coverage' | 'security' | 'depsAudit' | 'build'
 * @param {string} [projectRoot]
 * @returns {Object|null}
 */
function toolchainFor(language, phase, projectRoot) {
  const cap = capabilitiesFor(language, projectRoot);
  if (!cap || !cap.toolchain || typeof cap.toolchain !== 'object') return null;
  const entry = cap.toolchain[phase];
  return entry && typeof entry === 'object' ? entry : null;
}

/**
 * The run strategy for a (language, projectType/shape): the run command and the
 * HONEST flag. `honest: true` is a genuinely runnable/pollable runtime; `honest:
 * 'build-is-last-mile'` means build+test is the CI-safe last mile (mobile/desktop)
 * — never a false "it ran". Returns null when the language defines no such shape.
 *
 * @param {string} language e.g. 'dart'
 * @param {string} projectType e.g. 'mobile' | 'web' | 'cli' | 'server'
 * @param {string} [projectRoot]
 * @returns {{ command: string, honest: (boolean|string), shape: string }|null}
 */
function runStrategyFor(language, projectType, projectRoot) {
  const cap = capabilitiesFor(language, projectRoot);
  if (!cap || !cap.run || typeof cap.run !== 'object') return null;
  const shapes = cap.run.shapes && typeof cap.run.shapes === 'object' ? cap.run.shapes : {};
  const command = shapes[projectType];
  if (typeof command !== 'string' || command.length === 0) return null;
  return { command, honest: cap.run.honest, shape: projectType };
}

module.exports = {
  load,
  detectLanguages,
  capabilitiesFor,
  toolchainFor,
  runStrategyFor,
  loadProjectTypes,
  projectTypeFor,
  pipelineFor,
  loadDatabases,
  databaseCapability,
  loadFrameworks,
  frameworkCapability
};
