/**
 * Migration-Safety Checker — destructive-DDL detection (the databases-dimension
 * full-pipeline consumer).
 *
 * DB-w1 DETECTS databases; this is the CHECK: a migration that drops a table or a
 * column, truncates data, or drops a database/schema is a data-loss risk that must be
 * reviewed before it ships. Atlas's `atlas migrate lint` does semantic analysis but
 * needs a LIVE dev database (not CI-safe), so the ALWAYS-ON core here is a STATIC scan
 * of migration files for destructive DDL — no running database, works everywhere,
 * executes NOTHING (it only reads files and regex-scans them). An optional deeper
 * Atlas mode is OFF by default and guarded: requested-but-unavailable is a LOUD skip,
 * never silently dropped.
 *
 * HONESTY (mirrors sast-runner / sca-runner): a repo with NO migration files reports
 * `scanned:false` with a reason — a scan that did not happen is NEVER a clean pass.
 *
 * SECURITY: every regex is a CONSTANT built through the shared, audited
 * `regex-utils.safeRegExp` (no user-derived pattern, no raw `new RegExp`). Every
 * pattern is a single simple quantifier (no nested/overlapping quantifier), so there
 * is no catastrophic backtracking (ReDoS-safe). Any Atlas invocation is argv-safe
 * `execFileSync` (no string-concatenated shell), exactly like sca-runner.
 *
 * Cross-platform: `path.join` for every location, `safeFs` for every read, no shell
 * entry point, no OS-specific assumption.
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const safeFs = require('./safe-fs');
const { safeRegExp } = require('./regex-utils');

/**
 * Severity levels — same shape as sast-runner / sca-runner's SEVERITY, so a
 * migration finding drops straight into the shared critical/high gate tally.
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
 * Conventional migration locations across the common ORMs / frameworks, relative to
 * the project root. Each is walked recursively (bounded) for migration files.
 *   - `migrations`, `db/migrations`        — generic / Knex / node-pg-migrate
 *   - `prisma/migrations`                  — Prisma (nested <ts>_<name>/migration.sql)
 *   - `db/migrate`                         — Rails / ActiveRecord
 *   - `alembic/versions`, `migrations/versions` — Alembic (SQLAlchemy)
 *   - `supabase/migrations`                — Supabase CLI
 * @type {string[]}
 */
const MIGRATION_LOCATIONS = [
  'migrations',
  'db/migrations',
  'prisma/migrations',
  'db/migrate',
  'alembic/versions',
  'migrations/versions',
  'supabase/migrations'
];

/** Migration file extensions we read. Wave 2 scans SQL DDL; `.rb`/`.py` are read so a
 *  raw SQL DDL statement embedded in them is still caught, but ORM METHOD forms
 *  (Rails `remove_column`, Alembic `op.drop_column`) are a documented follow-up. */
const MIGRATION_EXTS = new Set(['.sql', '.rb', '.py']);

/**
 * Destructive DDL patterns. Each is a CONSTANT string compiled once via safeRegExp.
 * `\b` word boundaries anchor each keyword; `[^;]*` in the ALTER form is a single
 * linear quantifier (no nesting) so there is no catastrophic backtracking. Case
 * insensitive. Order matters only for the human-readable `rule` label on a line that
 * matches more than one (the line is reported ONCE, deduped by file:line).
 * @type {Array<{rule: string, re: RegExp}>}
 */
const DESTRUCTIVE_PATTERNS = [
  { rule: 'DROP TABLE',    re: safeRegExp('\\bDROP\\s+TABLE\\b', 'i') },
  { rule: 'DROP DATABASE', re: safeRegExp('\\bDROP\\s+DATABASE\\b', 'i') },
  { rule: 'DROP SCHEMA',   re: safeRegExp('\\bDROP\\s+SCHEMA\\b', 'i') },
  { rule: 'DROP COLUMN',   re: safeRegExp('\\bDROP\\s+COLUMN\\b', 'i') },
  { rule: 'ALTER TABLE … DROP', re: safeRegExp('\\bALTER\\s+TABLE\\b[^;]*\\bDROP\\b', 'i') },
  { rule: 'TRUNCATE',      re: safeRegExp('\\bTRUNCATE\\b', 'i') }
];

/** Bounds so a pathological repo can never exhaust memory or time. */
const DEFAULT_MAX_FILES = 2000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB per migration file
const MAX_WALK_DEPTH = 12;

/**
 * Strip a SQL line comment (`--` to end of line) so a commented-out `-- DROP TABLE`
 * is not a false positive. Block comments and string literals are out of scope for
 * this wave 2 static heuristic (documented follow-up); the goal is to catch real
 * executable destructive DDL, and a line-comment strip removes the obvious noise.
 * @param {string} line
 * @returns {string}
 */
function stripSqlLineComment(line) {
  const i = line.indexOf('--');
  return i === -1 ? line : line.slice(0, i);
}

/**
 * Migration-safety checker.
 */
class MigrationSafetyChecker {
  /**
   * @param {string} projectRoot - Root directory of the project
   * @param {Object} [options]
   * @param {boolean} [options.atlas=false] - opt into the deeper Atlas lint mode
   * @param {string} [options.devUrl] - Atlas dev database URL (required for Atlas mode)
   * @param {number} [options.maxFiles=2000] - cap on migration files scanned
   * @param {number} [options.maxBytes=2097152] - per-file byte cap
   * @param {number} [options.timeout=300000] - Atlas exec timeout (ms)
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      atlas: false,
      devUrl: null,
      maxFiles: DEFAULT_MAX_FILES,
      maxBytes: DEFAULT_MAX_BYTES,
      timeout: 300000,
      ...options
    };
    this.findings = [];
    this.errors = [];
  }

  /**
   * Recursively collect migration files under the conventional locations. Fail-soft:
   * an unreadable directory is skipped, never thrown. Bounded by file count and walk
   * depth so a pathological tree cannot exhaust resources.
   * @param {string} [projectRoot=this.projectRoot]
   * @returns {string[]} absolute paths of detected migration files
   */
  detectMigrationFiles(projectRoot = this.projectRoot) {
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
        const abs = path.join(absDir, entry.name);
        let isDir = false;
        let isFile = false;
        try {
          isDir = entry.isDirectory();
          isFile = entry.isFile();
        } catch {
          continue;
        }
        if (isDir) {
          walk(abs, depth + 1);
        } else if (isFile && MIGRATION_EXTS.has(path.extname(entry.name).toLowerCase())) {
          found.push(abs);
        }
      }
    };

    for (const rel of MIGRATION_LOCATIONS) {
      if (found.length >= cap) break;
      const base = path.join(projectRoot, ...rel.split('/'));
      walk(base, 0);
    }

    // Dedupe absolute paths (nested locations like `migrations` and
    // `migrations/versions` can otherwise surface the same file twice).
    return Array.from(new Set(found));
  }

  /**
   * Scan a single migration file's content for destructive DDL. Each destructive LINE
   * yields ONE HIGH finding (deduped by line): a line matching several patterns is
   * reported once, labelled by the first matching rule.
   * @param {string} content - file text
   * @param {string} file - absolute path of the file (for the finding)
   * @returns {Array<{tool:string, rule:string, file:string, line:number, statement:string, severity:string}>}
   */
  scanDestructive(content, file) {
    const out = [];
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const scanText = stripSqlLineComment(lines[i]);
      for (const { rule, re } of DESTRUCTIVE_PATTERNS) {
        if (re.test(scanText)) {
          out.push({
            tool: 'migration-safety',
            rule,
            file,
            line: i + 1,
            statement: lines[i].trim(),
            severity: SEVERITY.HIGH
          });
          break; // one finding per line — dedupe by (file,line)
        }
      }
    }
    return out;
  }

  /**
   * Probe whether an external tool (Atlas) is available. Argv-safe, no shell —
   * mirrors sca-runner.isToolAvailable exactly.
   * @param {string} tool
   * @returns {boolean}
   */
  isToolAvailable(tool) {
    const checks = {
      atlas: ['atlas', ['version']]
    };
    const spec = checks[tool];
    if (!spec) return false;
    const [bin, args] = spec;
    try {
      execFileSync(bin, args, { stdio: 'ignore', timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Optional deeper mode: run `atlas migrate lint` when explicitly requested AND Atlas
   * is available AND a dev-url is configured. When requested but unavailable, or
   * requested without a dev-url, record a LOUD skip in `this.errors` — NEVER silently
   * dropped. The static core has already run and executes NOTHING; this only ADDS.
   *
   * The invocation is argv-safe execFileSync. Atlas reports issues on a non-zero exit;
   * its own output is surfaced as an error entry (we do not fabricate a JSON schema we
   * cannot verify — the honest contract is "atlas ran and objected", carried verbatim).
   * @param {string} migrationsDir - absolute path of a detected migrations directory
   */
  runAtlas(migrationsDir) {
    if (!this.isToolAvailable('atlas')) {
      this.errors.push({
        tool: 'atlas',
        error: 'atlas deeper mode requested but the atlas binary is not available — skipped (NOT silently dropped)'
      });
      return;
    }
    if (!this.options.devUrl) {
      this.errors.push({
        tool: 'atlas',
        error: 'atlas deeper mode requested but no dev-url configured — skipped (NOT silently dropped)'
      });
      return;
    }
    try {
      const out = execFileSync(
        'atlas',
        ['migrate', 'lint', '--dir', `file://${migrationsDir}`, '--dev-url', String(this.options.devUrl)],
        {
          cwd: this.projectRoot,
          timeout: this.options.timeout,
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore']
        }
      );
      // Exit 0 with output: atlas ran and reported no blocking issue. Surface any
      // non-empty report as an informational error entry (not a fabricated finding).
      if (out && out.trim()) {
        this.errors.push({ tool: 'atlas', error: `atlas migrate lint report: ${out.trim().slice(0, 2000)}` });
      }
    } catch (error) {
      // Non-zero exit: atlas objected. Carry its verbatim output as a loud entry; a
      // crashed/objecting atlas must never read as a clean pass.
      const report = (error && error.stdout) ? String(error.stdout).trim() : (error && error.message) || 'atlas failed';
      this.errors.push({ tool: 'atlas', error: `atlas migrate lint flagged issues: ${report.slice(0, 2000)}` });
    }
  }

  /**
   * Run the migration-safety check.
   *
   * HONEST at the module boundary: if NO migration files are found, returns
   * `scanned:false` with a reason — a repo that has no migrations is not a clean pass,
   * it is a scan that did not happen. Otherwise scans every detected file (bounded by
   * a per-file byte cap), dedupes findings by (file,line), optionally runs Atlas, and
   * returns `{ scanned:true, findings, errors, summary }` mirroring sast-runner.
   *
   * @returns {Promise<Object>} scan result
   */
  async run() {
    const files = this.detectMigrationFiles();

    if (files.length === 0) {
      return {
        scanned: false,
        findings: [],
        errors: this.errors,
        reason: 'no migrations detected',
        summary: this.generateSummary([], 0),
        message: 'Migration safety: no migration files detected — nothing was scanned (not a clean pass)'
      };
    }

    let scannedCount = 0;
    for (const file of files) {
      let content;
      try {
        const st = safeFs.statSync(file);
        if (st.size > this.options.maxBytes) {
          this.errors.push({ tool: 'migration-safety', error: `skipped ${file}: exceeds ${this.options.maxBytes}-byte cap` });
          continue;
        }
        content = safeFs.readFileSync(file, 'utf8');
      } catch (e) {
        this.errors.push({ tool: 'migration-safety', error: `unreadable ${file}: ${e.message}` });
        continue;
      }
      scannedCount++;
      this.findings.push(...this.scanDestructive(content, file));
    }

    // Optional deeper Atlas mode — off by default, guarded. Lint the first detected
    // migrations directory (atlas lints a directory, not individual files).
    if (this.options.atlas) {
      this.runAtlas(path.dirname(files[0]));
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
   * Deduplicate findings by (file, line) — a line is reported once even if two
   * scanners/patterns touched it. All destructive findings are HIGH, so first wins.
   * @returns {Array} unique findings
   */
  deduplicateFindings() {
    const seen = new Map();
    for (const f of this.findings) {
      const key = `${f.file}:${f.line}`;
      if (!seen.has(key)) seen.set(key, f);
    }
    return Array.from(seen.values());
  }

  /**
   * Summary statistics mirroring sast-runner's shape.
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
   * Human-readable one-line report.
   * @param {Array} findings
   * @param {number} filesScanned
   * @returns {string}
   */
  generateReport(findings, filesScanned) {
    if (findings.length === 0) {
      return `Migration safety: ${filesScanned} migration file(s) scanned, no destructive DDL found`;
    }
    const head = findings.slice(0, 10)
      .map(f => `  [${f.rule}] ${f.file}:${f.line} — ${f.statement}`)
      .join('\n');
    const more = findings.length > 10 ? `\n  ... and ${findings.length - 10} more` : '';
    return `Migration safety: ${findings.length} destructive statement(s) across ${filesScanned} file(s)\n${head}${more}`;
  }
}

module.exports = {
  MigrationSafetyChecker,
  SEVERITY,
  DESTRUCTIVE_PATTERNS,
  MIGRATION_LOCATIONS
};
