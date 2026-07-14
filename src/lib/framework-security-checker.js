/**
 * Framework-Security Checker — client-exposed-secret detection (the frameworks-
 * dimension "concerns → checks" consumer).
 *
 * FW-w1 records each framework's `security.concerns`; this is the CHECK that turns
 * the highest-value concern — `env-exposure` — into a real gate finding, exactly as
 * migration-safety-checker turned the databases dimension's destructive-DDL concern
 * into one.
 *
 * THE CLASS OF BUG. A frontend framework inlines an environment variable's VALUE
 * into the BROWSER bundle when the variable's name carries the framework's public
 * prefix (Next.js `NEXT_PUBLIC_`, Vite `VITE_`, CRA `REACT_APP_`, SvelteKit
 * `PUBLIC_`, Nuxt `NUXT_PUBLIC_`, Gatsby `GATSBY_`, Expo `EXPO_PUBLIC_`). So a
 * public-prefixed variable whose NAME signals a secret (`NEXT_PUBLIC_API_SECRET`,
 * `VITE_STRIPE_SECRET_KEY`) is a deliberate, shipped secret leak — a real, common,
 * HIGH-severity class the generic value-entropy secrets scanner does NOT catch (the
 * value is a legitimate assignment; the LEAK is the public prefix on a secret-named
 * key).
 *
 * SCOPE — PREFIX-NAMED EXPOSURES ONLY (a stated blind spot, F4). This checker
 * detects the prefix-NAMED exposure only. It does NOT see the other, prefix-less
 * exposure paths a framework config can open: Next.js `next.config` `env` /
 * `publicRuntimeConfig` and Vite `define` inline ANY listed variable — with NO
 * public prefix on its name — into the client bundle. A secret exposed that way
 * carries no naming signal this NAME-based scan can key on, so it is a KNOWN,
 * documented blind spot rather than a covered case. The public prefixes scanned are
 * SCOPED to the frameworks actually detected in the repo (a Next-only repo never
 * scans for SvelteKit's `PUBLIC_`), so cross-framework prefix pooling cannot flag a
 * variable the detected build would never expose.
 *
 * NAME-BASED, NEVER VALUE-BASED (two reasons). First, the name alone is the signal:
 * the prefix says "ship to browser", the secret indicator says "this is a secret".
 * Second, reading the VALUE of a variable named like a secret would ITSELF be a
 * leak. This checker therefore matches the variable NAME with a constant regex and
 * never inspects, captures, or logs a value.
 *
 * TIGHT TO STAY LOW-FALSE-POSITIVE (the migration-heuristic lesson). A bare `KEY`
 * is NOT a secret indicator: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is a publishable
 * key that is MEANT to be public. A bare `TOKEN` is likewise NOT an indicator:
 * `NEXT_PUBLIC_TOKEN_ADDRESS` is a public web3 contract address, deliberately
 * client-shipped. So the token forms are COMPOUND-only — `ACCESS_TOKEN`/`AUTH_TOKEN`/
 * `API_TOKEN`/`BEARER_TOKEN`/`SESSION_TOKEN`/`REFRESH_TOKEN` — exactly the way `KEY`
 * is compound-only (`SECRET_KEY`/`PRIVATE_KEY`/`API_KEY`/`APIKEY`). The remaining
 * unambiguous indicators are `PRIVATE`/`PASSWORD`/`PASSWD`/`CREDENTIAL` (matched on
 * underscore boundaries, trailing segments allowed) and `SECRET`, which is
 * anchored TERMINAL — it flags only as the LAST name segment (`…_API_SECRET`) or via
 * the `…_SECRET_KEY` compound, so `NEXT_PUBLIC_SECRET_SANTA_ENABLED` (a feature flag
 * with `SECRET` mid-name) does NOT flag. Every indicator sits on an underscore
 * boundary, so `SECRETARY` (contains `SECRET`) never matches.
 *
 * The prefix stays CASE-SENSITIVE (uppercase is the framework convention), but the
 * name TAIL after a correctly-uppercased prefix is matched case-INSENSITIVELY, so
 * `VITE_api_secret` (uppercase prefix, lowercase underscore-delimited tail) is
 * caught. A pure camelCase-glued tail with NO underscore before the indicator
 * (`VITE_apiSecret`) is a residual, documented FALSE-NEGATIVE: catching it requires
 * matching `SECRET` mid-token, which reintroduces common false positives
 * (`theSecretDoor`, `SecretAgent`) — a rare miss is not worth a common false alarm.
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
 * it (Next.js, Vite-driven Vue/Svelte/React, Nuxt, Remix, Astro, Laravel) ships a
 * client bundle that can inline public-prefixed env vars. Pure backends (FastAPI,
 * NestJS, Django) carry `sensitive-settings` instead — they have no client bundle,
 * so this check must not consider them relevant.
 * @type {string}
 */
const ENV_EXPOSURE_CONCERN = 'env-exposure';

/**
 * Framework → its client-exposure prefixes (CONSTANT). Keyed by the capability
 * registry's framework `name`; the value is the set of public prefixes that
 * framework's build inlines into the CLIENT bundle:
 *   - `NEXT_PUBLIC_`  Next.js          - `NUXT_PUBLIC_`  Nuxt runtimeConfig.public
 *   - `VITE_`         Vite/Laravel     - `PUBLIC_`       SvelteKit / Astro
 *   - `REACT_APP_`    Create React App - `GATSBY_`/`EXPO_PUBLIC_`  Gatsby / Expo
 *
 * The ACTIVE prefix set for a scan is the union of these lists over ONLY the
 * detected env-exposure frameworks, so a prefix a repo's build would never honour is
 * never scanned (F3.1 — kills cross-framework prefix pooling like flagging `PUBLIC_`
 * in a Next-only repo).
 *
 * `react` maps to both `VITE_` and `REACT_APP_` (React ships on either Vite or CRA).
 * `laravel` maps to `VITE_` (Laravel's front-end tooling is Vite; its client env
 * prefix is literally `VITE_`) — added here so a real Laravel+Vite leak is not a
 * false negative. Frameworks whose env exposure is NOT prefix-named (Angular's
 * build-time `environment.ts` replacement, Remix's loader/`window.ENV`) intentionally
 * have NO entry: this NAME-based, prefix-scoped scan cannot key on them, and that is
 * the documented blind spot (see the module docstring, F4).
 * @type {Object<string, string[]>}
 */
const FRAMEWORK_PUBLIC_PREFIXES = {
  nextjs: ['NEXT_PUBLIC_'],
  nuxt: ['NUXT_PUBLIC_'],
  vue: ['VITE_'],
  svelte: ['VITE_', 'PUBLIC_'],
  react: ['VITE_', 'REACT_APP_'],
  astro: ['VITE_', 'PUBLIC_'],
  gatsby: ['GATSBY_'],
  expo: ['EXPO_PUBLIC_'],
  laravel: ['VITE_']
};

/**
 * COMPOUND secret indicators (CONSTANT). Each may appear as a segment run anywhere
 * in the name (leading and trailing segments allowed). A lone `KEY` and a lone
 * `TOKEN` are DELIBERATELY absent — `PUBLISHABLE_KEY` and `TOKEN_ADDRESS` are public
 * by design — so both the key and the token forms are compound-only. `SECRET_KEY`/
 * `PRIVATE_KEY` are redundant with the bare `SECRET`/`PRIVATE` treatment but kept
 * explicit for readability; `API_KEY`/`APIKEY` and the `*_TOKEN` auth compounds are
 * load-bearing (neither `API`/`KEY` nor a bare `TOKEN` is an indicator on its own).
 * @type {string[]}
 */
const COMPOUND_INDICATORS = [
  'SECRET_KEY',
  'PRIVATE_KEY',
  'API_KEY',
  'APIKEY',
  'ACCESS_TOKEN',
  'AUTH_TOKEN',
  'API_TOKEN',
  'BEARER_TOKEN',
  'SESSION_TOKEN',
  'REFRESH_TOKEN',
  'PRIVATE',
  'PASSWORD',
  'PASSWD',
  'CREDENTIAL'
];

/**
 * TERMINAL-anchored indicator (CONSTANT). `SECRET` flags ONLY as the final name
 * segment (`…_API_SECRET`) — never mid-name — so `NEXT_PUBLIC_SECRET_SANTA_ENABLED`
 * (a feature flag) does NOT flag (F3.2). The `…_SECRET_KEY` compound is covered by
 * COMPOUND_INDICATORS above.
 * @type {string}
 */
const TERMINAL_INDICATOR = 'SECRET';

/**
 * Expand an uppercase literal indicator token into a CASE-INSENSITIVE regex source
 * WITHOUT the `i` flag — each ASCII letter becomes a two-char class (`S`→`[Ss]`),
 * `_` and digits stay literal. This lets the name TAIL match case-insensitively
 * while the PREFIX (a separate, escaped, un-expanded literal) stays case-sensitive
 * (F5). Tokens are module-level constants of `[A-Z0-9_]` only — no user input, no
 * metacharacters, so the result is fully deterministic.
 * @param {string} token
 * @returns {string} regex source
 */
function ciPattern(token) {
  return token.replace(/[A-Za-z]/g, ch => `[${ch.toUpperCase()}${ch.toLowerCase()}]`);
}

/** Case-insensitive indicator alternations (CONSTANT sources). */
const COMPOUND_ALT = COMPOUND_INDICATORS.map(ciPattern).join('|');
const TERMINAL_ALT = ciPattern(TERMINAL_INDICATOR);

/**
 * Build the client-exposed-secret NAME pattern (CONSTANT via safeRegExp) for a
 * given ACTIVE prefix set. The source is fully deterministic — the prefixes are
 * literal constants (escaped) and the indicator groups are literal constants
 * (ci-expanded) — no user-derived input, no raw `new RegExp`.
 *
 * Shape: `\b <PREFIX> ( <SEG_>* <COMPOUND> <_SEG>*  |  <SEG_>* <SECRET> ) \b`
 *   - `\b` before the prefix rejects a mid-word coincidence (`REPUBLIC_...` — the
 *     `_` before `PUBLIC` is a word char, so there is no boundary there).
 *   - the PREFIX alternation is escaped literal + CASE-SENSITIVE (no `i` flag):
 *     public prefixes are uppercase by framework convention.
 *   - `(?:[A-Za-z0-9]+_)*` consumes leading name segments, each delimited by an
 *     underscore; `_` is not in the class, so segments partition the name uniquely —
 *     a single linear quantifier with NO overlapping ambiguity (ReDoS-safe). The
 *     class is case-insensitive so a lowercase/mixed tail (`VITE_api_secret`) is
 *     caught while the uppercase prefix requirement holds (F5).
 *   - branch 1: a COMPOUND indicator on segment boundaries, trailing segments
 *     allowed (`VITE_STRIPE_SECRET_KEY`, `NEXT_PUBLIC_ACCESS_TOKEN`).
 *   - branch 2: the TERMINAL `SECRET` with NO trailing segment, so it flags only as
 *     the last segment (`NEXT_PUBLIC_API_SECRET`) and never mid-name
 *     (`NEXT_PUBLIC_SECRET_SANTA_ENABLED`).
 *
 * The `g` flag lets one physical line be scanned for every occurrence via
 * `String.prototype.matchAll` (which clones internally — no shared `lastIndex`
 * hazard). Returns `null` when the active prefix set is empty (a detected framework
 * whose exposure is not prefix-named — see FRAMEWORK_PUBLIC_PREFIXES).
 * @param {string[]} activePrefixes
 * @returns {RegExp|null}
 */
function buildClientSecretRe(activePrefixes) {
  if (!Array.isArray(activePrefixes) || activePrefixes.length === 0) return null;
  const prefixAlt = activePrefixes.map(escapeRegExp).join('|');
  return safeRegExp(
    `\\b(?:${prefixAlt})(?:(?:[A-Za-z0-9]+_)*(?:${COMPOUND_ALT})(?:_[A-Za-z0-9]+)*|(?:[A-Za-z0-9]+_)*(?:${TERMINAL_ALT}))\\b`,
    'g'
  );
}

/**
 * Full-line comment markers (CONSTANT literals). A line whose first non-whitespace
 * is one of these is documentation, not an assignment, so it is skipped (F2):
 *   - `#` in `.env*` files, `//` in source files.
 * `BLOCK_COMMENT_RE` strips `/* … *\/` blocks from source before line scanning,
 * `NON_NEWLINE_RE` blanks a block's non-newline chars so line numbers are preserved.
 */
const ENV_COMMENT_RE = /^\s*#/;
const LINE_COMMENT_RE = /^\s*\/\//;
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const NON_NEWLINE_RE = /[^\n]/g;

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
   * The union of client-exposure prefixes over the DETECTED env-exposure frameworks
   * (F3.1). Scoping to detected frameworks stops cross-framework prefix pooling — a
   * Next-only repo yields only `NEXT_PUBLIC_`, so `PUBLIC_AUTH_TOKEN` (SvelteKit's
   * prefix) is never scanned there. A detected framework whose exposure is not
   * prefix-named (Angular, Remix) contributes nothing.
   * @param {Array<{name:string}>} relevant
   * @returns {string[]} the active prefix set
   */
  activePublicPrefixes(relevant) {
    const set = new Set();
    for (const f of relevant) {
      const prefixes = f && FRAMEWORK_PUBLIC_PREFIXES[f.name];
      if (Array.isArray(prefixes)) for (const p of prefixes) set.add(p);
    }
    return Array.from(set);
  }

  /**
   * Scan a single file's content for public-prefixed secret NAMES. Each matched
   * name yields ONE HIGH finding; duplicate (file,line,varName) triples are deduped
   * by the caller. The VALUE is never read — the regex matches the name token and
   * stops at the `=` / delimiter boundary.
   *
   * Full-line comments are skipped and `/* … *\/` blocks stripped BEFORE scanning
   * (F2), so a variable merely NAMED in a comment (`.env.example`'s documented var
   * names, a `// TODO` referencing a var) is not a false finding. `.env*` files use
   * `#`; source files use `//` and `/* … *\/`.
   * @param {string} content - file text
   * @param {string} file - absolute path of the file (for the finding)
   * @param {RegExp|null} scanRe - the active prefix-scoped pattern (null → no scan)
   * @returns {Array<{tool:string, rule:string, file:string, line:number, varName:string, severity:string}>}
   */
  scanContent(content, file, scanRe) {
    const out = [];
    if (!scanRe) return out;
    const isEnv = ENV_FILE_RE.test(path.basename(file));
    // Strip block comments from source (preserve line count by blanking non-newlines).
    const text = isEnv ? content : content.replace(BLOCK_COMMENT_RE, m => m.replace(NON_NEWLINE_RE, ' '));
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // A line whose first non-whitespace is a comment marker is not an assignment.
      if (isEnv ? ENV_COMMENT_RE.test(line) : LINE_COMMENT_RE.test(line)) continue;
      for (const m of line.matchAll(scanRe)) {
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

    // Scope the scanned prefixes to the DETECTED frameworks (F3.1), then build the
    // one constant, ReDoS-safe pattern from that active set.
    const scanRe = buildClientSecretRe(this.activePublicPrefixes(relevant));

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
      this.findings.push(...this.scanContent(content, file, scanRe));
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
  FRAMEWORK_PUBLIC_PREFIXES,
  COMPOUND_INDICATORS,
  TERMINAL_INDICATOR
};
