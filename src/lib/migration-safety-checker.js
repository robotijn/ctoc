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
 *
 * ## Decisions Taken Under Ambiguity
 * - DB-w3 fix F4 deliberately extends ONLY the DROP family (adds INDEX, VIEW,
 *   SEQUENCE, TYPE, MATERIALIZED VIEW to the existing TABLE/DATABASE/SCHEMA/COLUMN)
 *   plus the existing ALTER…DROP and TRUNCATE. `DELETE` without a `WHERE`,
 *   `RENAME COLUMN`, and `ALTER … TYPE` are consciously EXCLUDED — they are a
 *   different heuristic family (data-shape / data-mutation rather than object DROP),
 *   carry higher false-positive risk, and were out of scope for this fix.
 * - DB-w3 fix F1 adds `.yml` alongside the specified `.yaml` because Liquibase YAML
 *   changelogs use both extensions interchangeably; parsing one and silently
 *   dropping the other would reintroduce the very false-negative F1 closes.
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

/**
 * Common SQL roots that hold migration/DDL files but are NOT named like a
 * migrations directory — Sqitch/Flyway/raw-SQL projects drop DDL under `sql/`,
 * `database/`, or `db/`. DB-w2 fix F1: these were the "location hole" — a
 * `DROP TABLE` in `sql/003.sql` used to report "no migrations detected" and ship
 * GREEN. Walked recursively for migration files, same as the tool locations.
 * @type {string[]}
 */
const SQL_ROOTS = ['sql', 'database', 'db'];

/**
 * Every explicit root walked for migration files: the conventional tool locations
 * plus the SQL roots. Discovery of arbitrary `*migrat*` dirs (Django
 * `<app>/migrations/`, `database/migrate/`) is handled separately by a bounded
 * tree walk (see detectMigrationFiles), so those need not be enumerated here.
 * @type {string[]}
 */
const MIGRATION_SEARCH_ROOTS = [...MIGRATION_LOCATIONS, ...SQL_ROOTS];

/**
 * A directory whose basename matches this is treated as a migrations directory
 * wherever it sits in the tree (`migrations`, `migrate`, `migration`). DB-w2 fix
 * F1: catches Django `<app>/migrations/` and `database/migrate/` that no fixed
 * path list can enumerate. CONSTANT source through safeRegExp; single literal
 * substring, ReDoS-trivial.
 * @type {RegExp}
 */
const MIGRAT_DIR_RE = safeRegExp('migrat', 'i');

/**
 * Directories never descended during the `*migrat*` discovery walk — dependency,
 * VCS, and build-output trees that cannot hold a project's own migrations and
 * would only cost time. Keeps the full-tree walk bounded in practice (in addition
 * to the depth/file caps).
 * @type {Set<string>}
 */
const DISCOVERY_SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out',
  'coverage', 'vendor', '.next', '.nuxt', 'target', '.venv', 'venv'
]);

/** Migration file extensions we read and can PARSE for destructive DDL.
 *  - `.sql` raw DDL; `.rb`/`.py` so a raw SQL DDL statement (or an `op.execute("…")`
 *    embedded statement) is still caught — ORM METHOD forms (Rails `remove_column`,
 *    Alembic `op.drop_column`) remain a documented follow-up.
 *  - `.xml`/`.yaml`/`.yml` Liquibase changelogs (DB-w3 fix F1) — `<dropTable>` /
 *    `- dropTable:` element forms carry no SQL keyword the SQL scanner would see.
 *  - `.cs` .NET Entity Framework Core migrations (DB-w3 fix F1) — `migrationBuilder
 *    .DropTable(...)` / `.DropColumn(...)` / `.Sql("…DROP…")` fluent forms.
 *  Before F1 these files were WALKED (the dir is a searched root / matches /migrat/i)
 *  and SEEN, then discarded by the ext filter, so a destructive changelog shipped
 *  GREEN under a materially false "no migration files found" skip. */
const MIGRATION_EXTS = new Set(['.sql', '.rb', '.py', '.xml', '.yaml', '.yml', '.cs']);

/**
 * Extensions that plausibly hold a migration but that this static scanner cannot
 * parse (Knex/TypeORM `.ts`/`.js`, Laravel/Doctrine `.php`, Liquibase JSON/Groovy,
 * and other host languages). DB-w3 fix F1 belt-and-suspenders: when a searched or
 * discovered migration directory physically contains files of one of these
 * extensions, the checker emits a LOUD skip naming them, so it can NEVER silently
 * report "no migration files found" while destructive-capable files sit unread in a
 * searched dir. Purely a honesty signal — it never fabricates a finding.
 * @type {Set<string>}
 */
const UNPARSED_MIGRATION_EXTS = new Set([
  '.ts', '.js', '.php', '.json', '.groovy', '.go', '.kt', '.scala', '.java'
]);

/**
 * Statement-position anchor. A destructive keyword only counts when it is the
 * STATEMENT VERB, i.e. it appears at line start (after optional whitespace) OR
 * immediately after a `;` (a second statement on the same line). `\s*` is a single
 * linear quantifier, so the anchor adds no backtracking risk.
 *
 * DB-w3 fix F3: the earlier design added an OPENING-QUOTE branch to this anchor so
 * `op.execute("DROP TABLE x")` would fire. That branch over-reached — it matched on
 * position-within-string, so ANY string value whose content merely BEGINS with a
 * destructive keyword (`INSERT … VALUES ('DROP TABLE permanently removes a table')`)
 * false-positived and BLOCKED the gate. The quote branch is removed here; embedded
 * executable DDL is now detected by anchoring on the host-language EXECUTE call (see
 * EXEC_ANCHOR), i.e. on executability, not on position inside a string literal.
 *
 * SCOPE LIMITATION (documented, intentional not-fixed): a destructive statement
 * split across physical lines (`DROP\nTABLE`) is NOT detected — scanning is
 * line-oriented and statement anchoring is per line. Formatters keep `DROP TABLE`
 * together, so the probability is low; catching it would require a full multi-line
 * tokenizer, out of scope for this static heuristic.
 * @type {string}
 */
const STMT_ANCHOR = '(?:^|;)\\s*';

/**
 * Embedded-executable-DDL anchor (DB-w3 fix F3). A destructive keyword ALSO counts
 * when it is the first token of a SQL string passed to a host-language execute call
 * — `op.execute("DROP TABLE x")`, `connection.execute('TRUNCATE t')`,
 * `execute("…")`. The anchor is the execute call + opening paren + opening quote +
 * optional whitespace; the destructive keyword must be the FIRST token of the
 * string, so a benign value like `'DROP TABLE permanently removes …'` passed to an
 * INSERT (no execute call) never matches. Every metacharacter is a single linear
 * quantifier — ReDoS-safe. `\bexecute` covers `op.execute`, `connection.execute`,
 * and bare `execute`.
 * @type {string}
 */
const EXEC_ANCHOR = '\\bexecute\\s*\\(\\s*["\']\\s*';

/**
 * The DROP family this checker advertises (DB-w3 fix F4). ONE alternation covering
 * every object kind whose DROP is a data-loss risk: TABLE, DATABASE, SCHEMA, COLUMN,
 * INDEX, VIEW, SEQUENCE, TYPE, and MATERIALIZED VIEW (two words). `\b` closes each
 * keyword. Single linear quantifiers only — ReDoS-safe.
 * @type {string}
 */
const DROP_BODY = 'DROP\\s+(?:TABLE|DATABASE|SCHEMA|COLUMN|INDEX|VIEW|SEQUENCE|TYPE|MATERIALIZED\\s+VIEW)\\b';
/** `ALTER TABLE t … DROP …` form — `[^;]*` is a single linear quantifier (ReDoS-safe). */
const ALTER_DROP_BODY = 'ALTER\\s+TABLE\\b[^;]*\\bDROP\\b';
/** `TRUNCATE …` — data-loss on all rows. */
const TRUNCATE_BODY = 'TRUNCATE\\b';

/**
 * Destructive DDL patterns for the SQL-family files (`.sql`, `.rb`, `.py`). Each is
 * a CONSTANT string compiled once via safeRegExp, built by concatenating an anchor
 * with a keyword body — still a literal, no user-derived input. Case insensitive.
 * The line is reported ONCE, deduped by file:line. Two anchor families:
 *   - STMT_ANCHOR: raw statement-position DDL (`DROP TABLE …`, post-`;`, `ALTER …
 *     DROP`, `TRUNCATE …`).
 *   - EXEC_ANCHOR: the same bodies embedded in an executable `execute("…")` string
 *     (DB-w3 fix F3) — executability, not string position.
 * @type {Array<{rule: string, re: RegExp}>}
 */
const DESTRUCTIVE_PATTERNS = [
  { rule: 'DROP <object>',           re: safeRegExp(STMT_ANCHOR + DROP_BODY, 'i') },
  { rule: 'ALTER TABLE … DROP',      re: safeRegExp(STMT_ANCHOR + ALTER_DROP_BODY, 'i') },
  { rule: 'TRUNCATE',                re: safeRegExp(STMT_ANCHOR + TRUNCATE_BODY, 'i') },
  { rule: 'execute("DROP …")',       re: safeRegExp(EXEC_ANCHOR + DROP_BODY, 'i') },
  { rule: 'execute("ALTER … DROP")', re: safeRegExp(EXEC_ANCHOR + ALTER_DROP_BODY, 'i') },
  { rule: 'execute("TRUNCATE …")',   re: safeRegExp(EXEC_ANCHOR + TRUNCATE_BODY, 'i') }
];

/**
 * Liquibase XML changelog destructive patterns (DB-w3 fix F1, `.xml`). Element
 * forms carry no SQL keyword the SQL scanner would see. `<sql>` wraps raw SQL, so a
 * DROP/TRUNCATE inside it is flagged too. `[^<]*` is a single linear quantifier
 * (bounded by the next `<`) — ReDoS-safe.
 * @type {Array<{rule: string, re: RegExp}>}
 */
const LIQUIBASE_XML_PATTERNS = [
  { rule: 'Liquibase <dropTable>',                      re: safeRegExp('<dropTable\\b', 'i') },
  { rule: 'Liquibase <dropColumn>',                     re: safeRegExp('<dropColumn\\b', 'i') },
  { rule: 'Liquibase <dropAllForeignKeyConstraints>',  re: safeRegExp('<dropAllForeignKeyConstraints\\b', 'i') },
  { rule: 'Liquibase <sql> DROP/TRUNCATE',             re: safeRegExp('<sql>[^<]*\\b(?:DROP|TRUNCATE)\\b', 'i') }
];

/**
 * Liquibase YAML changelog destructive patterns (DB-w3 fix F1, `.yaml`/`.yml`).
 * `- dropTable:` / `- dropColumn:` sequence-item element forms. `\s*` linear
 * quantifiers only — ReDoS-safe.
 * @type {Array<{rule: string, re: RegExp}>}
 */
const LIQUIBASE_YAML_PATTERNS = [
  { rule: 'Liquibase yaml dropTable',  re: safeRegExp('-\\s*dropTable\\s*:', 'i') },
  { rule: 'Liquibase yaml dropColumn', re: safeRegExp('-\\s*dropColumn\\s*:', 'i') }
];

/**
 * .NET Entity Framework Core C# migration destructive patterns (DB-w3 fix F1,
 * `.cs`). Fluent `migrationBuilder.DropTable(...)` / `.DropColumn(...)` calls, and
 * a raw `.Sql("…")` whose SQL string STARTS with a DROP/TRUNCATE (same
 * executability anchor idea as EXEC_ANCHOR — a mention mid-string is not flagged).
 * `\s*` linear quantifiers only — ReDoS-safe.
 * @type {Array<{rule: string, re: RegExp}>}
 */
const EF_CS_PATTERNS = [
  { rule: 'EF migrationBuilder.DropTable',  re: safeRegExp('\\.DropTable\\s*\\(', 'i') },
  { rule: 'EF migrationBuilder.DropColumn', re: safeRegExp('\\.DropColumn\\s*\\(', 'i') },
  { rule: 'EF migrationBuilder.Sql(DROP/TRUNCATE)', re: safeRegExp('\\.Sql\\s*\\(\\s*["\']\\s*(?:' + DROP_BODY + '|' + TRUNCATE_BODY + ')', 'i') }
];

/**
 * Select the destructive-pattern set for a file extension (DB-w3 fix F1). SQL-family
 * (`.sql`, `.rb`, `.py`) get the SQL/EXEC patterns; Liquibase XML/YAML and EF C# get
 * their format-appropriate sets. An extension with no set is not scannable for
 * content (handled by the UNPARSED loud-skip path, never a silent clean pass).
 * @param {string} ext - lowercased file extension
 * @returns {Array<{rule: string, re: RegExp}>}
 */
function patternsForExt(ext) {
  if (ext === '.xml') return LIQUIBASE_XML_PATTERNS;
  if (ext === '.yaml' || ext === '.yml') return LIQUIBASE_YAML_PATTERNS;
  if (ext === '.cs') return EF_CS_PATTERNS;
  return DESTRUCTIVE_PATTERNS; // .sql, .rb, .py
}

/**
 * Block-comment stripper (DB-w2 fix F3). Removes every C-style slash-star block
 * comment — including multi-line ones — BEFORE scanning, so a commented-out DROP
 * inside such a comment is never a false positive. Line numbering is PRESERVED:
 * each stripped character
 * that is not a newline is replaced by a space, and newlines are kept, so a
 * finding's reported line still points at the real source line. The pattern is a
 * CONSTANT built through safeRegExp; `[\s\S]*?` is a single LAZY quantifier
 * (non-overlapping) so there is no catastrophic backtracking (ReDoS-safe).
 * @type {RegExp}
 */
const BLOCK_COMMENT_RE = safeRegExp('/\\*[\\s\\S]*?\\*/', 'g');

/** Bounds so a pathological repo can never exhaust memory or time. */
const DEFAULT_MAX_FILES = 2000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB per migration file
const MAX_WALK_DEPTH = 12;

/**
 * Strip a line comment so a commented-out destructive keyword is not a false
 * positive. File-type aware (DB-w2 fix F2):
 *   - `.sql` (and anything else): strip a SQL `--` comment to end of line.
 *   - `.py` / `.rb`: strip a `#` comment to end of line — a Python/Ruby migration
 *     line `# TODO: drop table legacy` must NOT be flagged.
 *
 * The strip removes from the FIRST comment marker to end of line. A real embedded
 * `op.execute("DROP TABLE x")` has no leading `#`, so nothing is removed and the
 * statement-anchored scan still catches it. A `#` inside a SQL/string literal is
 * rare and out of scope (documented) — the goal is to catch executable DDL, not to
 * fully tokenize the host language.
 * @param {string} line
 * @param {string} ext - lowercased file extension (e.g. '.sql', '.py', '.rb')
 * @returns {string}
 */
function stripLineComment(line, ext) {
  // Hash-comment languages: Python, Ruby, and YAML changelogs.
  if (ext === '.py' || ext === '.rb' || ext === '.yaml' || ext === '.yml') {
    const h = line.indexOf('#');
    return h === -1 ? line : line.slice(0, h);
  }
  // C# uses `//` line comments; a commented-out `// migrationBuilder.DropTable(...)`
  // must not be flagged.
  if (ext === '.cs') {
    const s = line.indexOf('//');
    return s === -1 ? line : line.slice(0, s);
  }
  // XML uses `<!-- -->`; do NOT strip on a bare `--` (it appears inside `<!--` and
  // legitimately inside attribute values), so leave XML lines intact — the crude
  // block/line SQL strippers would corrupt XML more than they help.
  if (ext === '.xml') {
    return line;
  }
  const i = line.indexOf('--');
  return i === -1 ? line : line.slice(0, i);
}

/**
 * Strip C-style block comments (DB-w2 fix F3) from whole file content BEFORE
 * line-splitting, replacing each stripped non-newline character with a space and
 * KEEPING newlines, so line numbers reported by the scan stay correct even when a
 * block comment spans multiple lines.
 * @param {string} content
 * @returns {string}
 */
function stripBlockComments(content) {
  return content.replace(BLOCK_COMMENT_RE, (m) => m.replace(/[^\n]/g, ' '));
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
    // DB-w3 fix F1/F2 honesty accumulators (populated by detectMigrationFiles):
    //   _unparsedMigrationFiles — files in a searched migration dir with an ext this
    //     scanner cannot parse (loud skip, never a silent "no migrations found");
    //   _capHit — the file-count cap truncated the walk (loud skip, never a silent
    //     clean pass on a partial scan).
    this._unparsedMigrationFiles = [];
    this._capHit = false;
  }

  /**
   * Collect migration files (DB-w2 fix F1 — the "location hole" close). Three
   * sources, all bounded by the same file-count cap and walk depth, deduped:
   *   1. the conventional tool locations (MIGRATION_LOCATIONS);
   *   2. the common SQL roots `sql/`, `database/`, `db/` (SQL_ROOTS) — Sqitch /
   *      Flyway / raw-SQL projects that no ORM path list covers;
   *   3. ANY directory anywhere in the tree whose basename matches /migrat/i
   *      (Django `<app>/migrations/`, `database/migrate/`), discovered by a bounded
   *      full-tree walk that prunes dependency/VCS/build dirs.
   * Fail-soft: an unreadable directory is skipped, never thrown.
   * @param {string} [projectRoot=this.projectRoot]
   * @returns {string[]} absolute paths of detected migration files
   */
  detectMigrationFiles(projectRoot = this.projectRoot) {
    const found = [];
    const unparsed = [];
    const cap = this.options.maxFiles;

    // Recursively collect every migration-ext file under a directory. Files that
    // physically sit in a migration dir but carry an ext this scanner cannot parse
    // (UNPARSED_MIGRATION_EXTS) are recorded so run() can emit a LOUD skip — never a
    // silent "no migrations found" while destructive-capable files sit unread.
    const collect = (absDir, depth) => {
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
          collect(abs, depth + 1);
        } else if (isFile) {
          const fext = path.extname(entry.name).toLowerCase();
          if (MIGRATION_EXTS.has(fext)) {
            found.push(abs);
          } else if (UNPARSED_MIGRATION_EXTS.has(fext)) {
            unparsed.push(abs);
          }
        }
      }
    };

    // Discovery walk: descend the tree (pruning heavy dirs) and, for every
    // directory whose basename looks like a migrations dir, collect its files.
    const discover = (absDir, depth) => {
      if (found.length >= cap || depth > MAX_WALK_DEPTH) return;
      let entries;
      try {
        entries = safeFs.readdirSync(absDir, { withFileTypes: true });
      } catch {
        return; // fail-soft
      }
      for (const entry of entries) {
        if (found.length >= cap) return;
        let isDir = false;
        try {
          isDir = entry.isDirectory();
        } catch {
          continue;
        }
        if (!isDir || DISCOVERY_SKIP_DIRS.has(entry.name)) continue;
        const abs = path.join(absDir, entry.name);
        if (MIGRAT_DIR_RE.test(entry.name)) {
          collect(abs, depth + 1); // this IS a migrations dir → gather its files
        }
        discover(abs, depth + 1); // keep descending for nested *migrat* dirs
      }
    };

    // 1 + 2: explicit tool locations and SQL roots.
    for (const rel of MIGRATION_SEARCH_ROOTS) {
      if (found.length >= cap) break;
      const base = path.join(projectRoot, ...rel.split('/'));
      collect(base, 0);
    }

    // 3: any *migrat* directory anywhere in the tree.
    discover(projectRoot, 0);

    // DB-w3 fix F2: if the walk stopped at the file cap, the scan is TRUNCATED — the
    // remaining files were never read, so a "clean" result would be a lie. Record it
    // so run() surfaces a loud skip.
    this._capHit = found.length >= cap;
    // DB-w3 fix F1 belt-and-suspenders: dedupe the unparseable-but-present files.
    this._unparsedMigrationFiles = Array.from(new Set(unparsed));

    // Dedupe absolute paths (an *migrat* dir may also be an explicit root, and
    // nested locations like `migrations` and `migrations/versions` can otherwise
    // surface the same file twice).
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
    const ext = path.extname(file).toLowerCase();
    const patterns = patternsForExt(ext);
    // Original lines drive the human-readable `statement`; the block-stripped copy
    // (same line count — newlines preserved) drives matching. Line-comment stripping
    // is then applied per line, file-type aware.
    const originalLines = content.split(/\r?\n/);
    const scanLines = stripBlockComments(content).split(/\r?\n/);
    for (let i = 0; i < scanLines.length; i++) {
      const scanText = stripLineComment(scanLines[i], ext);
      for (const { rule, re } of patterns) {
        if (re.test(scanText)) {
          out.push({
            tool: 'migration-safety',
            rule,
            file,
            line: i + 1,
            statement: originalLines[i].trim(),
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

    // DB-w3 fix F2: a truncated walk (file cap hit) is NEVER a clean pass. Surface a
    // loud skip so runSecurityScan lists it and a reader knows files went unread.
    if (this._capHit) {
      this.errors.push({
        tool: 'migration-safety',
        error: `migration scan capped at ${this.options.maxFiles} files; further files were NOT scanned (loud skip, not a clean pass)`
      });
    }

    // DB-w3 fix F1 belt-and-suspenders: destructive-capable files whose extension
    // this scanner cannot parse physically sit in a searched migration dir. Name
    // them loudly — a "no migrations found" skip must never hide unread files.
    if (this._unparsedMigrationFiles.length > 0) {
      const shown = this._unparsedMigrationFiles.slice(0, 20).join(', ');
      const more = this._unparsedMigrationFiles.length > 20
        ? ` (+${this._unparsedMigrationFiles.length - 20} more)` : '';
      this.errors.push({
        tool: 'migration-safety',
        error: `migration directory holds file(s) this scanner cannot parse — NOT scanned (loud skip, not a clean pass): ${shown}${more}`
      });
    }

    if (files.length === 0) {
      // HONEST skip (DB-w2 fix F1): NAME the locations that were searched so
      // "no migrations" can never be read as "nothing to check". A genuine
      // no-migrations repo is still scanned:false — an honest skip, not a pass.
      const searched =
        `${MIGRATION_SEARCH_ROOTS.map(r => r + '/').join(', ')}, ` +
        'or any directory named like *migrat* anywhere in the tree';
      return {
        scanned: false,
        findings: [],
        errors: this.errors,
        reason: `no migration files found — searched: ${searched}`,
        summary: this.generateSummary([], 0),
        message: `Migration safety: no migration files found — searched ${searched}; nothing was scanned (not a clean pass)`
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
