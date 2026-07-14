/**
 * Framework-Security Checker — client-exposed-secret detection (the frameworks-
 * dimension "concerns → checks" consumer).
 *
 * FW-w1 records each framework's `security.concerns`; this is the CHECK that turns
 * the highest-value concern — `env-exposure` — into a real gate finding, exactly as
 * migration-safety-checker turned the databases dimension's destructive-DDL concern
 * into one.
 *
 * THE CLASS OF BUG. A frontend framework exposes environment variables to the
 * BROWSER when — and only when — their name carries the framework's public prefix
 * (Next.js `NEXT_PUBLIC_`, Vite `VITE_`, CRA `REACT_APP_`, SvelteKit `PUBLIC_`,
 * Nuxt `NUXT_PUBLIC_`, Gatsby `GATSBY_`, Expo `EXPO_PUBLIC_`). The build inlines
 * such a variable's VALUE into the client bundle. So a public-prefixed variable
 * whose NAME signals a secret (`NEXT_PUBLIC_API_SECRET`, `VITE_STRIPE_SECRET_KEY`)
 * is a deliberate, shipped secret leak — a real, common, HIGH-severity class the
 * generic value-entropy secrets scanner does NOT catch (the value is a legitimate
 * assignment; the LEAK is the public prefix on a secret-named key).
 *
 * NAME-BASED, NEVER VALUE-BASED (two reasons). First, the name alone is the signal:
 * the prefix says "ship to browser", the secret indicator says "this is a secret".
 * Second, reading the VALUE of a variable named like a secret would ITSELF be a
 * leak. This checker therefore matches the variable NAME with a constant regex and
 * never inspects, captures, or logs a value.
 *
 * TIGHT TO STAY LOW-FALSE-POSITIVE (the migration-heuristic lesson). A bare `KEY`
 * is NOT a secret indicator: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is a publishable
 * key that is MEANT to be public. Only the secret-ish key forms
 * (`SECRET_KEY`/`PRIVATE_KEY`/`API_KEY`/`APIKEY`) plus the unambiguous indicators
 * (`SECRET`/`TOKEN`/`PRIVATE`/`PASSWORD`/`PASSWD`/`CREDENTIAL`) flag. Each indicator
 * must fall on an underscore-delimited word boundary, so `SECRETARY` (contains
 * `SECRET`) does not match.
 *
 * HONESTY (mirrors migration-safety-checker / sast-runner / sca-runner). `run()`
 * gates on RELEVANCE: it only scans when a DETECTED framework carries the
 * `env-exposure` concern (read from `stack-detector.detectStack().frameworkCapabilities`).
 * On an unrelated repo it returns `scanned:false` with a reason — a scan that did
 * not happen is NEVER reported as a clean pass.
 *
 * SECURITY. Every regex is a CONSTANT built through the shared, audited
 * `regex-utils.safeRegExp` from module-level literal token lists (no user-derived
 * pattern, no raw `new RegExp`). The one scanning pattern uses only
 * underscore-delimited, non-overlapping quantifiers, so there is no catastrophic
 * backtracking (ReDoS-safe). The checker reads files and regex-scans them —
 * executes NOTHING and never touches a value.
 *
 * Cross-platform: `path.join` for every location, `safeFs` for every read, no shell
 * entry point, no OS-specific assumption.
 */

'use strict';

const path = require('path');
const safeFs = require('./safe-fs');
const { safeRegExp, escapeRegExp } = require('./regex-utils');
const { detectStack } = require('./stack-detector');

/**
 * Severity levels — same shape as migration-safety-checker's SEVERITY, so a
 * client-exposed-secret finding drops straight into the shared critical/high gate
 * tally.
 * @type {Object}
 */
const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO'
};

/**
 * The framework `security.concerns` tag this check consumes. A framework carrying
 * it (Next.js, Vite-driven Vue/Svelte/React, Nuxt, Remix, Astro, Laravel, NestJS)
 * exposes public-prefixed env vars to the client bundle.
 * @type {string}
 */
const ENV_EXPOSURE_CONCERN = 'env-exposure';

/**
 * Public env-var prefixes (CONSTANT). A variable whose name begins with one of
 * these is inlined into the CLIENT bundle by the framework's build:
 *   - `NEXT_PUBLIC_`  Next.js
 *   - `VITE_`         Vite (Vue/Svelte/React/Solid on Vite)
 *   - `REACT_APP_`    Create React App
 *   - `PUBLIC_`       SvelteKit (`$env/static/public`)
 *   - `NUXT_PUBLIC_`  Nuxt runtimeConfig.public
 *   - `GATSBY_`       Gatsby
 *   - `EXPO_PUBLIC_`  Expo
 * @type {string[]}
 */
const PUBLIC_PREFIXES = [
  'NEXT_PUBLIC_',
  'VITE_',
  'REACT_APP_',
  'PUBLIC_',
  'NUXT_PUBLIC_',
  'GATSBY_',
  'EXPO_PUBLIC_'
];

/**
 * Secret indicators (CONSTANT). A public-prefixed variable whose name carries one
 * of these — on an underscore-delimited word boundary — is a shipped secret leak.
 *
 * The secret-ish KEY forms (`SECRET_KEY`/`PRIVATE_KEY`/`API_KEY`/`APIKEY`) are
 * listed BEFORE the bare indicators so the alternation prefers the longer compound,
 * and — critically — a lone `KEY` is DELIBERATELY absent: `PUBLISHABLE_KEY` is a
 * public key by design and must not flag. `SECRET_KEY`/`PRIVATE_KEY` are redundant
 * with `SECRET`/`PRIVATE` but kept explicit for readability; `API_KEY`/`APIKEY`
 * are load-bearing (neither `API` nor `KEY` is an indicator on its own).
 * @type {string[]}
 */
const SECRET_INDICATORS = [
  'SECRET_KEY',
  'PRIVATE_KEY',
  'API_KEY',
  'APIKEY',
  'SECRET',
  'TOKEN',
  'PRIVATE',
  'PASSWORD',
  'PASSWD',
  'CREDENTIAL'
];

/** Prefix/indicator alternations — literal tokens escaped, joined for the pattern. */
const PREFIX_ALT = PUBLIC_PREFIXES.map(escapeRegExp).join('|');
const INDICATOR_ALT = SECRET_INDICATORS.map(escapeRegExp).join('|');

/**
 * The single client-exposed-secret NAME pattern (CONSTANT via safeRegExp), built
 * from the literal token lists above (each escaped, so the source is fully
 * deterministic — no user-derived input, no raw `new RegExp`).
 *
 * Shape: `\b <PUBLIC_PREFIX> (<SEGMENT>_)* <SECRET_INDICATOR> (_<SEGMENT>)* \b`
 *   - `\b` before the prefix rejects a mid-word coincidence (`REPUBLIC_TOKEN` — the
 *     `_` before `PUBLIC` is a word char, so there is no boundary there).
 *   - `(?:[A-Z0-9]+_)*` consumes leading name segments, each delimited by an
 *     underscore. Because `_` is not in `[A-Z0-9]`, the segments partition the name
 *     uniquely — a single linear quantifier with NO overlapping ambiguity, so no
 *     catastrophic backtracking (ReDoS-safe).
 *   - the indicator must begin a segment (it follows the prefix's `_` or a segment
 *     `_`) and `(?:_[A-Z0-9]+)*` consumes trailing segments, so the indicator sits
 *     on underscore boundaries: `NEXT_PUBLIC_SECRETARY_EMAIL` does NOT match
 *     (`SECRETARY` is not `SECRET` on a boundary), while
 *     `NEXT_PUBLIC_API_SECRET_V2` does.
 *   - CASE-SENSITIVE (no `i` flag): public prefixes are uppercase by framework
 *     convention; a lowercased name is not a real public variable.
 *
 * The `g` flag lets one physical line be scanned for every occurrence via
 * `String.prototype.matchAll` (which clones internally — no shared `lastIndex`
 * hazard).
 * @type {RegExp}
 */
const CLIENT_SECRET_RE = safeRegExp(
  `\\b(?:${PREFIX_ALT})(?:[A-Z0-9]+_)*(?:${INDICATOR_ALT})(?:_[A-Z0-9]+)*\\b`,
  'g'
);

/**
 * Matches an environment file by name: `.env`, `.env.local`, `.env.production`,
 * `.env.example`, … Only the variable NAMES are ever read from these (the value is
 * never inspected), so scanning `.env.example` is safe. CONSTANT via safeRegExp;
 * single literal + one linear quantifier, ReDoS-trivial.
 * @type {RegExp}
 */
const ENV_FILE_RE = safeRegExp('^\\.env(?:\\..+)?$');

/**
 * Source-file extensions scanned for public-prefixed secret references
 * (`process.env.NEXT_PUBLIC_*`, `import.meta.env.VITE_*`, …). Frontend source only.
 * @type {Set<string>}
 */
const SOURCE_EXTS = new Set([
  '.js', '.jsx', '.mjs', '.cjs',
  '.ts', '.tsx', '.mts', '.cts',
  '.vue', '.svelte', '.astro'
]);

/**
 * Directories never descended — dependency, VCS, and build-output trees that cannot
 * hold a project's own secrets and would only cost time. Keeps the bounded walk
 * cheap in practice (on top of the depth/file caps).
 * @type {Set<string>}
 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out',
  'coverage', 'vendor', '.next', '.nuxt', 'target', '.venv', 'venv'
]);

/** Bounds so a pathological repo can never exhaust memory or time. */
const DEFAULT_MAX_FILES = 2000;
const DEFAULT_MAX_BYTES = 1 * 1024 * 1024; // 1 MB per scanned file
const MAX_WALK_DEPTH = 12;

/**
 * Framework-security checker — client-exposed secrets.
 */
class FrameworkSecurityChecker {
  /**
   * @param {string} projectRoot - Root directory of the project
   * @param {Object} [options]
   * @param {number} [options.maxFiles=2000] - cap on files scanned
   * @param {number} [options.maxBytes=1048576] - per-file byte cap
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      maxFiles: DEFAULT_MAX_FILES,
      maxBytes: DEFAULT_MAX_BYTES,
      ...options
    };
    this.findings = [];
    this.errors = [];
  }

  /**
   * The RELEVANCE gate: the frameworks detected in this project that carry the
   * `env-exposure` concern. Read from the capability-registry-driven
   * `detectStack().frameworkCapabilities`, never hardcoded — so adding a framework
   * to the registry with `env-exposure` automatically extends this check.
   * Fail-soft: any detection error yields `[]` (the caller then honestly skips).
   * @returns {Array<{name:string}>} relevant framework capability records
   */
  relevantFrameworks() {
    let caps = [];
    try {
      const stack = detectStack(this.projectRoot);
      caps = Array.isArray(stack.frameworkCapabilities) ? stack.frameworkCapabilities : [];
    } catch (e) {
      this.errors.push({ tool: 'framework-security', error: `stack detection failed: ${e.message}` });
      return [];
    }
    return caps.filter(f =>
      f && f.security && Array.isArray(f.security.concerns) &&
      f.security.concerns.includes(ENV_EXPOSURE_CONCERN)
    );
  }

  /**
   * Collect the files to scan: every `.env*` file plus every frontend source file,
   * under a bounded, heavy-dir-pruning tree walk. Fail-soft — an unreadable
   * directory is skipped, never thrown.
   * @param {string} [projectRoot=this.projectRoot]
   * @returns {string[]} absolute paths to scan
   */
  collectFiles(projectRoot = this.projectRoot) {
    const found = [];
    const cap = this.options.maxFiles;

    const walk = (absDir, depth) => {
      if (found.length >= cap || depth > MAX_WALK_DEPTH) return;
      let entries;
      try {
        entries = safeFs.readdirSync(absDir, { withFileTypes: true });
      } catch {
        return; // missing / unreadable dir — fail-soft
      }
      for (const entry of entries) {
        if (found.length >= cap) return;
        let isDir = false;
        let isFile = false;
        try {
          isDir = entry.isDirectory();
          isFile = entry.isFile();
        } catch {
          continue;
        }
        if (isDir) {
          if (SKIP_DIRS.has(entry.name)) continue;
          walk(path.join(absDir, entry.name), depth + 1);
        } else if (isFile) {
          if (ENV_FILE_RE.test(entry.name) || SOURCE_EXTS.has(path.extname(entry.name).toLowerCase())) {
            found.push(path.join(absDir, entry.name));
          }
        }
      }
    };

    walk(projectRoot, 0);
    return found;
  }

  /**
   * Scan a single file's content for public-prefixed secret NAMES. Each matched
   * name yields ONE HIGH finding; duplicate (file,line,varName) triples are deduped
   * by the caller. The VALUE is never read — the regex matches the name token and
   * stops at the `=` / delimiter boundary.
   * @param {string} content - file text
   * @param {string} file - absolute path of the file (for the finding)
   * @returns {Array<{tool:string, rule:string, file:string, line:number, varName:string, severity:string}>}
   */
  scanContent(content, file) {
    const out = [];
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(CLIENT_SECRET_RE)) {
        out.push({
          tool: 'framework-security',
          rule: 'client-exposed-secret',
          file,
          line: i + 1,
          varName: m[0],
          severity: SEVERITY.HIGH
        });
      }
    }
    return out;
  }

  /**
   * Run the framework-security check.
   *
   * HONEST at the module boundary: if NO detected framework carries the
   * `env-exposure` concern, returns `scanned:false` with a reason — an unrelated
   * repo is not a clean pass, it is a scan that did not happen. Otherwise scans
   * every `.env*` and frontend source file (bounded by a per-file byte cap),
   * dedupes findings by (file,line,varName), and returns
   * `{ scanned:true, findings, errors, summary, message }` mirroring
   * migration-safety-checker.
   *
   * @returns {Promise<Object>} scan result
   */
  async run() {
    const relevant = this.relevantFrameworks();

    if (relevant.length === 0) {
      const reason =
        'no env-exposure framework detected — no frontend framework that ships ' +
        'public-prefixed env vars to the browser was found in this project';
      return {
        scanned: false,
        findings: [],
        errors: this.errors,
        reason,
        summary: this.generateSummary([], 0),
        message: `Framework security: ${reason}; nothing was scanned (not a clean pass)`
      };
    }

    const files = this.collectFiles();
    let scannedCount = 0;
    for (const file of files) {
      let content;
      try {
        const st = safeFs.statSync(file);
        if (st.size > this.options.maxBytes) {
          this.errors.push({ tool: 'framework-security', error: `skipped ${file}: exceeds ${this.options.maxBytes}-byte cap` });
          continue;
        }
        content = safeFs.readFileSync(file, 'utf8');
      } catch (e) {
        this.errors.push({ tool: 'framework-security', error: `unreadable ${file}: ${e.message}` });
        continue;
      }
      scannedCount++;
      this.findings.push(...this.scanContent(content, file));
    }

    const findings = this.deduplicateFindings();

    return {
      scanned: true,
      findings,
      errors: this.errors,
      summary: this.generateSummary(findings, scannedCount),
      message: this.generateReport(findings, scannedCount)
    };
  }

  /**
   * Deduplicate findings by (file, line, varName) — the same name at the same place
   * is reported once. All findings are HIGH, so first wins.
   * @returns {Array} unique findings
   */
  deduplicateFindings() {
    const seen = new Map();
    for (const f of this.findings) {
      const key = `${f.file}:${f.line}:${f.varName}`;
      if (!seen.has(key)) seen.set(key, f);
    }
    return Array.from(seen.values());
  }

  /**
   * Summary statistics mirroring migration-safety-checker's shape.
   * @param {Array} findings
   * @param {number} filesScanned
   * @returns {Object}
   */
  generateSummary(findings, filesScanned) {
    const bySeverity = {};
    for (const sev of Object.values(SEVERITY)) {
      bySeverity[sev] = findings.filter(f => f.severity === sev).length;
    }
    return {
      total: findings.length,
      bySeverity,
      filesScanned,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Human-readable one-line report. Names the VARIABLE, never a value.
   * @param {Array} findings
   * @param {number} filesScanned
   * @returns {string}
   */
  generateReport(findings, filesScanned) {
    if (findings.length === 0) {
      return `Framework security: ${filesScanned} file(s) scanned, no client-exposed secrets found`;
    }
    const head = findings.slice(0, 10)
      .map(f => `  [client-exposed-secret] ${f.file}:${f.line} — ${f.varName}`)
      .join('\n');
    const more = findings.length > 10 ? `\n  ... and ${findings.length - 10} more` : '';
    return `Framework security: ${findings.length} client-exposed secret(s) across ${filesScanned} file(s)\n${head}${more}`;
  }
}

module.exports = {
  FrameworkSecurityChecker,
  SEVERITY,
  PUBLIC_PREFIXES,
  SECRET_INDICATORS
};
