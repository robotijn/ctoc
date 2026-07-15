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
 *
 * DB-w4 REWORK — the format-scanning pass added by DB-w3 was regex-per-line and too
 * blunt; it produced eight confirmed defects (false positives that blocked ordinary
 * additive migrations, and false negatives that let destructive DDL ship GREEN). The
 * rework makes the scanner ROLLBACK- and DIRECTION-aware and handles
 * attributes/multiline/comments. Decisions and residual limitations:
 * - F1 EF direction: a destructive call inside a `Down(MigrationBuilder …)` body is a
 *   ROLLBACK definition and is EXCLUDED; a drop in `Up()` (or outside any Down) is the
 *   apply and fires. The Down body is found by a bounded, string-aware brace-depth
 *   scan (efDownBodyLines). RESIDUAL: an unbalanced/pathological `Down` body is treated
 *   as running to end-of-file (over-excludes) — a deliberate bias, because Finding 1
 *   (additive migrations must pass) is non-negotiable and EF scaffolds Up() before
 *   Down(), so the dominant additive case is unaffected. A migration that places a
 *   real destructive Up() AFTER an unbalanced Down() could be missed — accepted, rare.
 * - F2 rollback: Liquibase `<rollback>…</rollback>` (XML) and indentation-scoped
 *   `rollback:` (YAML) blocks are stripped before scanning; a hand-written rollback
 *   that drops the just-created object is recommended practice, not a data-loss apply.
 * - F3 `<sql>`: the element's TEXT is scanned by blanking the open/close tags and
 *   running the statement-anchored SQL patterns on the inner content. The open tag is
 *   blanked with a trailing `;` injected (blankOpenSqlTag), so an inline
 *   `<changeSet><sql dbms="…">DROP TABLE x;</sql></changeSet>` on ONE physical line —
 *   the dominant Liquibase raw-SQL form, `dbms` attribute and all — is statement-
 *   anchored and flagged (DB-w4 kickback GAP 2). The multi-line `<sql>` form remains
 *   caught by the `^\s*` branch of the anchor.
 * - F4 execute: the embedded-execute anchor now matches paren-less Ruby `execute "…"`
 *   and a single wrapping `text(`/`sa.text(` call — still executability-anchored, so a
 *   benign string value beginning with a keyword (no `execute`) never fires.
 * - F5 XML comments are stripped (`<!-- … -->`, multi-line) before scanning.
 * - F6 the wider DROP family reaches the new formats: XML `<dropIndex>`/`<dropView>`,
 *   YAML `dropIndex:`/`dropView:`, EF `.DropIndex(`. Only genuinely destructive ops are
 *   added. NOTE: Liquibase has no `dropSequence`/`dropType` changetype (those are
 *   expressed as raw `<sql>`, already covered by F3); EF exposes further drops
 *   (`DropForeignKey`, `DropPrimaryKey`, `DropSchema`, `DropSequence`) not added here —
 *   a conscious scope line matching the family the module advertises.
 * - F7 YAML: the `-` sequence dash may sit on its own line above the `dropTable:` key.
 * - F8 C#: the `//` line-comment strip is string-literal-aware so a `//` inside a
 *   quoted value (e.g. a URL) no longer truncates the line and hides a real drop.
 *   RESIDUAL: full C# lexing (verbatim `@"…"` escape rules, interpolation) is not
 *   implemented; the scanner treats any `//` inside a `"…"`/`'…'` span as non-comment,
 *   which is correct for the DDL-detection goal.
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
 * Embedded-executable-DDL anchor (DB-w4 fix F4, broadening DB-w3 F3). A destructive
 * keyword ALSO counts when it is the first token of a SQL string passed to a
 * host-language execute call. The prior anchor `\bexecute\s*\(\s*["']` REQUIRED a
 * paren immediately after `execute` and no wrapping call, so it MISSED two common
 * forms:
 *   - Rails no-paren:  `execute "DROP TABLE legacy"`  (a Ruby method call sans parens)
 *   - Alembic text():  `op.execute(text("DROP TABLE legacy"))`  (SQLAlchemy `sa.text(`)
 * The broadened anchor is: the `execute` word, an OPTIONAL open paren, an OPTIONAL
 * single wrapping `…text(` call (`text(` / `sa.text(` / any `[A-Za-z_.]*text(`), then
 * the opening quote. The destructive keyword must still be the FIRST token of the
 * string, so a benign `INSERT … VALUES ('DROP TABLE removes a table')` (no `execute`
 * word) never matches — executability, not string position. Every metacharacter is a
 * single linear quantifier and the wrapping group appears at most once — ReDoS-safe.
 * `\bexecute\b` covers `op.execute`, `connection.execute`, and bare `execute`.
 * @type {string}
 */
const EXEC_ANCHOR = '\\bexecute\\b\\s*\\(?\\s*(?:[A-Za-z_.]*text\\s*\\(\\s*)?["\']\\s*';

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
 * Liquibase XML changelog ELEMENT destructive patterns (DB-w3 fix F1, extended by
 * DB-w4 fix F6, `.xml`). Element forms carry no SQL keyword the SQL scanner would
 * see, so each `<drop…>` element is matched directly. These are position-agnostic
 * (`<dropTable\b` may appear anywhere on a line) — safe, because a `<rollback>` block
 * and every `<!-- … -->` comment are STRIPPED from the content BEFORE scanning
 * (DB-w4 F2 + F5), so a drop element only survives here when it is a live APPLY.
 *
 * DB-w4 F6 adds `<dropIndex>` and `<dropView>` to the family the module advertises
 * (alongside the existing `<dropTable>`, `<dropColumn>`, `<dropAllForeignKeyConstraints>`).
 * The old `<sql>[^<]*(DROP|TRUNCATE)` element pattern is REMOVED: it required a bare
 * `<sql>` on the same physical line as the keyword and so missed attributed/multiline
 * `<sql>` blocks (DB-w4 F3). Raw SQL inside `<sql>` is now handled by extracting the
 * element's text content and running the statement-anchored SQL patterns against it
 * (see unwrapSqlElements + XML_PATTERNS). `\b` closes each keyword — ReDoS-trivial.
 * @type {Array<{rule: string, re: RegExp}>}
 */
const LIQUIBASE_XML_PATTERNS = [
  { rule: 'Liquibase <dropTable>',                      re: safeRegExp('<dropTable\\b', 'i') },
  { rule: 'Liquibase <dropColumn>',                     re: safeRegExp('<dropColumn\\b', 'i') },
  { rule: 'Liquibase <dropIndex>',                      re: safeRegExp('<dropIndex\\b', 'i') },
  { rule: 'Liquibase <dropView>',                       re: safeRegExp('<dropView\\b', 'i') },
  { rule: 'Liquibase <dropAllForeignKeyConstraints>',  re: safeRegExp('<dropAllForeignKeyConstraints\\b', 'i') }
];

/**
 * Liquibase YAML changelog destructive patterns (DB-w3 fix F1, extended by DB-w4
 * F6 + F7, `.yaml`/`.yml`). Each is the changeset key form (`dropTable:`).
 *
 * DB-w4 F7: the old `-\s*dropTable\s*:` required the sequence dash and the key on
 * one physical line, so a block-style entry with the `-` on its OWN line above the
 * key was missed. The anchor is now `^\s*(?:-\s*)?dropTable\s*:` — the key at the
 * start of a line, with the dash OPTIONAL (it may sit on the preceding line). Every
 * `rollback:` sub-block is stripped BEFORE scanning (DB-w4 F2), so a key that
 * survives here is a live APPLY. DB-w4 F6 adds `dropIndex:` and `dropView:`.
 * `^` + single `\s*` quantifiers only — ReDoS-safe.
 * @type {Array<{rule: string, re: RegExp}>}
 */
const LIQUIBASE_YAML_PATTERNS = [
  { rule: 'Liquibase yaml dropTable',  re: safeRegExp('^\\s*(?:-\\s*)?dropTable\\s*:', 'i') },
  { rule: 'Liquibase yaml dropColumn', re: safeRegExp('^\\s*(?:-\\s*)?dropColumn\\s*:', 'i') },
  { rule: 'Liquibase yaml dropIndex',  re: safeRegExp('^\\s*(?:-\\s*)?dropIndex\\s*:', 'i') },
  { rule: 'Liquibase yaml dropView',   re: safeRegExp('^\\s*(?:-\\s*)?dropView\\s*:', 'i') }
];

/**
 * .NET Entity Framework Core C# migration destructive patterns (DB-w3 fix F1,
 * extended by DB-w4 fix F6, `.cs`). Fluent `migrationBuilder.DropTable(...)` /
 * `.DropColumn(...)` / `.DropIndex(...)` calls, and a raw `.Sql("…")` whose SQL
 * string STARTS with a DROP/TRUNCATE (same executability anchor idea as EXEC_ANCHOR
 * — a mention mid-string is not flagged).
 *
 * These are matched ONLY against lines OUTSIDE the migration's `Down(MigrationBuilder)`
 * body (DB-w4 F1 direction-awareness): a drop inside `Down()` is the EF-scaffolded
 * ROLLBACK definition of an additive migration, not a data-loss apply. The exclusion
 * is computed by efDownBodyLines() and applied in scanDestructive(). `\s*` linear
 * quantifiers only — ReDoS-safe.
 * @type {Array<{rule: string, re: RegExp}>}
 */
const EF_CS_PATTERNS = [
  { rule: 'EF migrationBuilder.DropTable',  re: safeRegExp('\\.DropTable\\s*\\(', 'i') },
  { rule: 'EF migrationBuilder.DropColumn', re: safeRegExp('\\.DropColumn\\s*\\(', 'i') },
  { rule: 'EF migrationBuilder.DropIndex',  re: safeRegExp('\\.DropIndex\\s*\\(', 'i') },
  { rule: 'EF migrationBuilder.Sql(DROP/TRUNCATE)', re: safeRegExp('\\.Sql\\s*\\(\\s*["\']\\s*(?:' + DROP_BODY + '|' + TRUNCATE_BODY + ')', 'i') }
];

/**
 * The pattern set used for `.xml` Liquibase changelogs (DB-w4 fix F3 + F6). The
 * ELEMENT patterns catch `<drop…>` element forms; the SQL DESTRUCTIVE_PATTERNS catch
 * raw SQL that was extracted from `<sql>…</sql>` bodies by unwrapSqlElements() (the
 * open/close tags are blanked, leaving the inner SQL statement-anchored on its line).
 * The EXEC patterns in DESTRUCTIVE_PATTERNS never fire on XML (no `execute` word) —
 * harmless to include. First match per line wins.
 * @type {Array<{rule: string, re: RegExp}>}
 */
const XML_PATTERNS = [...LIQUIBASE_XML_PATTERNS, ...DESTRUCTIVE_PATTERNS];

/**
 * Select the destructive-pattern set for a file extension (DB-w3 fix F1). SQL-family
 * (`.sql`, `.rb`, `.py`) get the SQL/EXEC patterns; Liquibase XML/YAML and EF C# get
 * their format-appropriate sets. An extension with no set is not scannable for
 * content (handled by the UNPARSED loud-skip path, never a silent clean pass).
 * @param {string} ext - lowercased file extension
 * @returns {Array<{rule: string, re: RegExp}>}
 */
function patternsForExt(ext) {
  if (ext === '.xml') return XML_PATTERNS;
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

/**
 * Every non-newline character, used to blank a stripped span while PRESERVING line
 * count (so a finding's reported line still points at real source). CONSTANT via
 * safeRegExp; `[^\n]` is a single-character class — ReDoS-trivial.
 * @type {RegExp}
 */
const NON_NEWLINE_RE = safeRegExp('[^\\n]', 'g');

/**
 * XML comment span (DB-w4 fix F5). `<!-- … -->`, multi-line. `[\s\S]*?` is a single
 * LAZY quantifier (non-overlapping) — no catastrophic backtracking (ReDoS-safe).
 * @type {RegExp}
 */
const XML_COMMENT_RE = safeRegExp('<!--[\\s\\S]*?-->', 'g');

/**
 * Liquibase `<rollback>…</rollback>` span (DB-w4 fix F2). Attribute-tolerant open
 * tag, multi-line body. A hand-written rollback that DROPs the just-created object is
 * recommended practice, not a data-loss apply — its content is removed before
 * scanning. `[\s\S]*?` is a single LAZY quantifier — ReDoS-safe.
 * @type {RegExp}
 */
const XML_ROLLBACK_RE = safeRegExp('<rollback\\b[\\s\\S]*?</rollback\\s*>', 'gi');

/**
 * Liquibase `<sql …>` open tag (attribute-tolerant) and `</sql>` close tag (DB-w4
 * fix F3). Blanking ONLY the tags (not the inner text) leaves the raw SQL in place,
 * statement-anchored on its own line, so the SQL DESTRUCTIVE_PATTERNS catch an
 * attributed or multi-line `<sql>` DROP/TRUNCATE. `[^>]*` / `\s*` are single linear
 * quantifiers — ReDoS-safe.
 * @type {RegExp}
 */
const SQL_OPEN_TAG_RE = safeRegExp('<sql\\b[^>]*>', 'gi');
const SQL_CLOSE_TAG_RE = safeRegExp('</sql\\s*>', 'gi');

/**
 * EF Core `Down(MigrationBuilder …)` method signature (DB-w4 fix F1). The `g` flag
 * lets efDownBodyLines() advance past each Down body. Requiring the `MigrationBuilder`
 * parameter type keeps this from matching an unrelated method named `Down`. Single
 * `\s*` quantifiers — ReDoS-safe.
 * @type {RegExp}
 */
const DOWN_SIG_RE = safeRegExp('\\bDown\\s*\\(\\s*MigrationBuilder\\b', 'gi');

/**
 * Liquibase YAML `rollback:` key (DB-w4 fix F2), optionally led by a sequence dash.
 * Introduces an indentation-scoped sub-block that stripYamlRollback() removes. `^` +
 * single `\s*` quantifiers — ReDoS-safe.
 * @type {RegExp}
 */
const ROLLBACK_KEY_RE = safeRegExp('^\\s*(?:-\\s*)?rollback\\s*:', 'i');

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
  // must not be flagged. DB-w4 fix F8: the strip is STRING-LITERAL-AWARE — a `//`
  // INSIDE a `"…"`/`'…'` literal (e.g. `Sql("url='http://x'")`) is NOT a comment, so
  // it must not truncate the line and hide a real `.DropTable(...)` after it.
  if (ext === '.cs') {
    return stripCsLineComment(line);
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
  return content.replace(BLOCK_COMMENT_RE, blankKeepNewlines);
}

/**
 * Replace every non-newline character of a matched span with a space, KEEPING
 * newlines — so blanking a multi-line comment/rollback/tag span preserves the total
 * line count and a finding's reported line still points at real source.
 * @param {string} span
 * @returns {string}
 */
function blankKeepNewlines(span) {
  return span.replace(NON_NEWLINE_RE, ' ');
}

/**
 * String-literal-aware C# `//` line-comment strip (DB-w4 fix F8). Scans the line and
 * returns the code portion before the first `//` that is NOT inside a `"…"`/`'…'`
 * string literal. A backslash escapes the next character inside a literal. Verbatim
 * (`@"…"`) and interpolated strings are handled well enough for the DDL-detection
 * goal (a `//` inside any quoted span is never treated as a comment); full C# lexing
 * is out of scope and documented.
 * @param {string} line
 * @returns {string}
 */
function stripCsLineComment(line) {
  let inStr = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === '\'') { inStr = c; continue; }
    if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

/**
 * Strip XML `<!-- … -->` comments (DB-w4 fix F5) before scanning, blanking the span
 * but keeping newlines. A commented-out `<dropTable/>` is never a live apply.
 * @param {string} content
 * @returns {string}
 */
function stripXmlComments(content) {
  return content.replace(XML_COMMENT_RE, blankKeepNewlines);
}

/**
 * Strip Liquibase `<rollback>…</rollback>` spans (DB-w4 fix F2) before scanning. A
 * drop inside a rollback is a rollback definition (recommended practice), not a
 * data-loss apply. Fail-soft: on a pathological input the replace simply matches
 * nothing and the content is returned unchanged (never throws).
 * @param {string} content
 * @returns {string}
 */
function stripXmlRollback(content) {
  return content.replace(XML_ROLLBACK_RE, blankKeepNewlines);
}

/**
 * Blank the `<sql …>` / `</sql>` TAGS (DB-w4 fix F3, completed under the DB-w4
 * kickback GAP 2) but leave the inner SQL text in place, so an attributed or
 * multi-line `<sql>` DROP/TRUNCATE becomes a statement-anchored SQL line the SQL
 * DESTRUCTIVE_PATTERNS catch. Line count is preserved.
 *
 * The open tag is blanked to spaces with its LAST non-newline character replaced by a
 * `;` (blankOpenSqlTag). That injected statement separator makes the SQL that
 * immediately follows match STMT_ANCHOR's `(?:^|;)` even when the whole element sits
 * on ONE physical line AFTER other markup — the dominant Liquibase raw-SQL form,
 * e.g. `<changeSet><sql dbms="postgresql">DROP TABLE users;</sql></changeSet>`, where
 * the line does NOT start with whitespace before the DROP. When the open tag ends the
 * line (multi-line `<sql>` form) the `;` is harmless and the DROP on the next line is
 * still caught by the `^\s*` branch of the anchor. A `<sql>` whose content is
 * non-destructive (e.g. `SELECT …`) leaves a harmless line that matches nothing.
 * @param {string} content
 * @returns {string}
 */
function unwrapSqlElements(content) {
  return content
    .replace(SQL_OPEN_TAG_RE, blankOpenSqlTag)
    .replace(SQL_CLOSE_TAG_RE, blankKeepNewlines);
}

/**
 * Blank a `<sql …>` opening tag to spaces (preserving line count) but end it with a
 * `;` statement separator when the tag ends on a content-bearing line, so the SQL
 * that follows on the SAME physical line is statement-anchored (DB-w4 kickback GAP 2).
 * @param {string} tag - the matched `<sql …>` open tag
 * @returns {string}
 */
function blankOpenSqlTag(tag) {
  const blanked = blankKeepNewlines(tag);
  if (blanked.length === 0) return blanked;
  const last = blanked[blanked.length - 1];
  if (last === '\n') return blanked; // tag ends at a newline — leave the `^\s*` branch to anchor
  return blanked.slice(0, -1) + ';';
}

/**
 * Strip Liquibase YAML `rollback:` sub-blocks (DB-w4 fix F2, completed under the
 * DB-w4 kickback GAP 1), indentation-scoped. From a `rollback:` key at indent R, the
 * following lines are blanked until the block ends:
 *   - a line more deeply indented than R (a nested mapping) is inside the block;
 *   - a `- ` list ITEM at EXACTLY indent R is inside the block — the STANDARD
 *     Liquibase style aligns the sequence dash with the `rollback:` key, so the
 *     rollback's own list items sit at the key's indent, not deeper;
 *   - a blank line stays in the block;
 *   - a non-dash key at indent ≤ R, or ANY line dedented below R, ENDS the block
 *     (a sibling mapping key like `changes:` / a lower-level `- changeSet:`).
 * A drop inside a rollback block is a rollback definition, not a data-loss apply.
 * Line-based, bounded by the line count, fail-soft (never throws). This is safe
 * because in a YAML mapping only the rollback list's own items are dashes at indent R;
 * a sibling of `rollback:` is a mapping key (non-dash), which ends the block.
 * @param {string} content
 * @returns {string}
 */
function stripYamlRollback(content) {
  const lines = content.split(/\r?\n/);
  const out = new Array(lines.length);
  let inRollback = false;
  let rollbackIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inRollback) {
      if (line.trim() === '') { out[i] = ''; continue; } // blank line stays in block
      const indent = line.length - line.trimStart().length;
      const isDashItem = line.trimStart().charAt(0) === '-';
      if (indent > rollbackIndent || (indent === rollbackIndent && isDashItem)) {
        out[i] = ''; // deeper mapping, or the rollback list's own dash-aligned item
        continue;
      }
      inRollback = false; // sibling key / dedent → block ended; process this line
    }
    if (ROLLBACK_KEY_RE.test(line)) {
      rollbackIndent = line.length - line.trimStart().length;
      inRollback = true;
      out[i] = ''; // blank the rollback: key line itself
      continue;
    }
    out[i] = line;
  }
  return out.join('\n');
}

/**
 * Index of the `}` that closes the block opened at `openIdx` (a `{`), scanned
 * string-literal-aware so a brace inside a `"…"`/`'…'` literal is not counted. On an
 * unbalanced input returns the last index (fail-soft: the Down body is treated as
 * running to end-of-file, which over-EXCLUDES rather than risk false-positiving the
 * dominant additive migration — Finding 1 is non-negotiable).
 * @param {string} s
 * @param {number} openIdx
 * @returns {number}
 */
function matchBrace(s, openIdx) {
  let depth = 0;
  let inStr = null;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === '\'') { inStr = c; continue; }
    if (c === '{') { depth++; }
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return s.length - 1;
}

/**
 * Count of newlines in `s` before index `end` — i.e. the 0-based line number of the
 * character at `end`.
 * @param {string} s
 * @param {number} end
 * @returns {number}
 */
function countNewlines(s, end) {
  let n = 0;
  const stop = Math.min(end, s.length);
  for (let i = 0; i < stop; i++) if (s[i] === '\n') n++;
  return n;
}

/**
 * EF Core direction-awareness (DB-w4 fix F1). Returns the set of 0-based line indices
 * that fall inside any `Down(MigrationBuilder …)` method body. A destructive call in
 * `Down()` is the EF-scaffolded ROLLBACK of an additive migration and MUST NOT be
 * flagged; a destructive call in `Up()` (or outside any Down) IS the apply direction
 * and IS flagged. The body span is found by locating the signature, then a bounded,
 * string-aware brace-depth scan to the matching close. Bounded (≤ a guard cap of Down
 * signatures) and fail-soft: any error yields an EMPTY set, so on parse trouble the
 * scanner falls back to flagging (prefers a true positive over a silent miss for the
 * apply direction), EXCEPT that an unbalanced body is treated as running to EOF to
 * protect the dominant additive case.
 * @param {string} content - C# migration content (block comments already blanked)
 * @returns {Set<number>} 0-based line indices to exclude from EF pattern matching
 */
function efDownBodyLines(content) {
  const excluded = new Set();
  try {
    let from = 0;
    for (let guard = 0; guard < 100; guard++) {
      DOWN_SIG_RE.lastIndex = from;
      const m = DOWN_SIG_RE.exec(content);
      if (!m) break;
      const openIdx = content.indexOf('{', m.index + m[0].length);
      if (openIdx === -1) break;
      const end = matchBrace(content, openIdx);
      const startLine = countNewlines(content, openIdx);
      const endLine = countNewlines(content, end);
      for (let ln = startLine; ln <= endLine; ln++) excluded.add(ln);
      const next = end + 1;
      if (next <= m.index) break; // no forward progress — bail (defensive)
      from = next;
    }
  } catch {
    return new Set(); // fail-soft: exclude nothing
  }
  return excluded;
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
    // Original lines drive the human-readable `statement`; a preprocessed copy (same
    // line count — newlines preserved) drives matching.
    const originalLines = content.split(/\r?\n/);

    // Block comments are stripped for every format (C-style `/* … */`). Then, per
    // format, the DB-w4 rework applies rollback/direction/element-aware preprocessing:
    //   .xml  — strip <!-- … --> comments (F5) and <rollback>…</rollback> spans (F2),
    //           then blank <sql> tags so the inner SQL is scanned statement-anchored (F3);
    //   .yaml — strip indentation-scoped rollback: sub-blocks (F2);
    //   .cs   — compute the Down(MigrationBuilder) body line span to EXCLUDE (F1),
    //           since a drop there is a rollback definition, not a data-loss apply.
    let scanContent = stripBlockComments(content);
    let excludedLines = null;
    if (ext === '.xml') {
      scanContent = unwrapSqlElements(stripXmlRollback(stripXmlComments(scanContent)));
    } else if (ext === '.yaml' || ext === '.yml') {
      scanContent = stripYamlRollback(scanContent);
    } else if (ext === '.cs') {
      excludedLines = efDownBodyLines(scanContent);
    }

    const scanLines = scanContent.split(/\r?\n/);
    for (let i = 0; i < scanLines.length; i++) {
      if (excludedLines && excludedLines.has(i)) continue; // EF Down() rollback direction
      const scanText = stripLineComment(scanLines[i], ext);
      for (const { rule, re } of patterns) {
        if (re.test(scanText)) {
          out.push({
            tool: 'migration-safety',
            rule,
            file,
            line: i + 1,
            statement: (originalLines[i] || '').trim(),
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
