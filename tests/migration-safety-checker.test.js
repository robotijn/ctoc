/**
 * DB-w2 — migration-safety checker (destructive-DDL static scan) + quality wiring.
 *
 * The static core is tested against REAL temp-dir fixtures (zero mocks): a
 * destructive migration must yield a HIGH finding, an additive-only migration must
 * yield none, and a repo with NO migrations must report scanned:false with a reason
 * (an HONEST skip, never a silent clean pass — a scan that did not happen is never a
 * pass). The optional Atlas deeper mode is exercised only for its guard: when Atlas
 * is requested but unavailable it must record a LOUD skip and never silently drop —
 * that availability is the ONE thing mocked (prototype override), mirroring the
 * sast-runner fail-closed tests. The quality-agent integration test drives the LIVE
 * consumer: a destructive migration bumps the HIGH gate tally through runSecurityScan.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { MigrationSafetyChecker, SEVERITY } = require('../src/lib/migration-safety-checker');
const qualityAgent = require('../src/lib/quality-agent');

/** Make a fresh, isolated temp project dir. */
function mkTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-mig-'));
}

/** Write a file, creating parent dirs. */
function writeFile(dir, rel, content) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

test('SEVERITY exposes the shared HIGH level', () => {
  assert.equal(SEVERITY.HIGH, 'HIGH');
});

test('a migrations/*.sql with DROP TABLE yields exactly one HIGH finding with {file,line}', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '001_init.sql'),
      'CREATE TABLE users (id int);\nDROP TABLE users;\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'a repo WITH migrations was actually scanned');
    const high = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(high.length, 1, 'exactly one destructive finding');
    const f = high[0];
    assert.match(f.file, /001_init\.sql$/, 'finding names the migration file');
    assert.equal(f.line, 2, 'finding points at the DROP TABLE line (line 2)');
    assert.ok(/drop\s+table/i.test(f.statement), 'finding carries the offending statement');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an additive-only migration (CREATE TABLE / ADD COLUMN) yields zero findings but IS scanned', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '002_add.sql'),
      'CREATE TABLE orders (id int);\nALTER TABLE users ADD COLUMN email text;\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'additive-only migration was scanned');
    assert.equal(res.findings.length, 0, 'no destructive DDL → no findings');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a Rails .rb migration with only additive AR methods yields no finding (SQL-DDL scope, wave 2)', async () => {
  const dir = mkTemp();
  try {
    // Wave 2 scans SQL DDL only; Rails/ActiveRecord method forms (remove_column) are a
    // documented follow-up. An additive Rails migration must NOT trip the scanner.
    writeFile(dir, path.join('db', 'migrate', '20240101_add_email.rb'),
      "class AddEmail < ActiveRecord::Migration[7.1]\n  def change\n    add_column :users, :email, :string\n  end\nend\n");

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'the db/migrate location was scanned');
    assert.equal(res.findings.length, 0, 'additive Rails migration → no finding');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a repo with NO migrations reports scanned:false with a reason — never a silent clean pass', async () => {
  const dir = mkTemp();
  try {
    fs.writeFileSync(path.join(dir, 'README.md'), '# not a migration\n', 'utf8');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, false, 'no migrations → scanned:false, NOT a pass');
    assert.ok(typeof res.reason === 'string' && res.reason.length > 0, 'an honest reason is recorded');
    assert.match(res.reason, /migration/i, 'reason mentions migrations');
    assert.equal(res.findings.length, 0, 'no findings when nothing was scanned');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('all destructive patterns are detected (DROP TABLE/COLUMN, ALTER..DROP, TRUNCATE, DROP DATABASE/SCHEMA)', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('supabase', 'migrations', '003_destructive.sql'), [
      'DROP TABLE users;',                    // line 1
      'ALTER TABLE users DROP COLUMN email;', // line 2 (ALTER..DROP / DROP COLUMN — one line, one finding)
      'TRUNCATE orders;',                     // line 3
      'DROP DATABASE prod;',                  // line 4
      'DROP SCHEMA public;',                  // line 5
      'CREATE TABLE keep (id int);'           // line 6 — additive, no finding
    ].join('\n') + '\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    // One finding per destructive LINE (deduped by file,line): lines 1-5 = 5 findings.
    assert.equal(res.findings.length, 5, 'five destructive lines, deduped by (file,line)');
    assert.ok(res.findings.every(f => f.severity === SEVERITY.HIGH), 'every destructive finding is HIGH');
    const lines = res.findings.map(f => f.line).sort((a, b) => a - b);
    assert.deepEqual(lines, [1, 2, 3, 4, 5], 'the additive line 6 is not flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('prisma/migrations nested location is detected', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('prisma', 'migrations', '20240101_init', 'migration.sql'),
      'DROP TABLE legacy;\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'prisma nested migration dir was scanned');
    assert.equal(res.findings.length, 1, 'the nested destructive migration was found');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Atlas requested but UNAVAILABLE records a loud honest skip and never silently drops; static core still scans', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '001.sql'), 'DROP TABLE users;\n');

    const orig = MigrationSafetyChecker.prototype.isToolAvailable;
    MigrationSafetyChecker.prototype.isToolAvailable = function () { return false; };
    try {
      const checker = new MigrationSafetyChecker(dir, { atlas: true, devUrl: 'docker://postgres/16/dev' });
      const res = await checker.run();

      // The static core is unaffected — it executes NOTHING and still finds the DROP.
      assert.equal(res.scanned, true, 'static core scanned regardless of atlas');
      assert.equal(res.findings.length, 1, 'static DROP TABLE finding survives');
      // Atlas requested but unavailable → an explicit skip in errors, NOT silence.
      assert.ok(
        (res.errors || []).some(e => e.tool === 'atlas' && /skip|unavailable|not available/i.test(e.error)),
        'an unavailable-but-requested atlas is recorded as a loud skip'
      );
    } finally {
      MigrationSafetyChecker.prototype.isToolAvailable = orig;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('QUALITY-AGENT WIRING: a destructive migration bumps the HIGH gate tally via runSecurityScan', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '001_drop.sql'), 'DROP TABLE users;\n');

    const res = await qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true });

    assert.ok(res.high >= 1, 'the destructive migration bumped the HIGH tally');
    assert.equal(res.passed, false, 'a destructive migration fails the security gate');
    assert.ok(/migration/i.test(res.details || ''), 'the detail line attributes the finding to migration safety');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('QUALITY-AGENT WIRING: a repo with NO migrations is an informational skip, not a failure', async () => {
  const dir = mkTemp();
  try {
    fs.writeFileSync(path.join(dir, 'README.md'), '# nothing\n', 'utf8');

    const res = await qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true });

    // No migrations must never fabricate a HIGH; the honest scanned:false is informational.
    assert.equal(res.high, 0, 'no migrations → no migration-derived HIGH finding');
    assert.ok(
      (res.skipped || []).some(s => /migration/i.test(s)),
      'the no-migrations honest skip is surfaced in the skipped list'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── DB-w2 fix (00046): the 3 confirmed heuristic defects ──────────────────────
// F1 location hole, F2 #-comment false positive, F3 string/block-comment false
// positives — all reproduced by execution before the fix. Real temp-dir fixtures,
// zero mocks.

test('F1: destructive DDL in an UNLISTED sql/ dir is detected (previously scanned:false → shipped GREEN)', async () => {
  const dir = mkTemp();
  try {
    // `sql/` was not among the 7 hardcoded MIGRATION_LOCATIONS; a DROP here used to
    // report scanned:false and pass the gate. It must now be a HIGH finding.
    writeFile(dir, path.join('sql', '003_migrate.sql'), 'DROP TABLE users;\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'the sql/ root is now searched');
    const high = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(high.length, 1, 'the sql/ DROP TABLE is caught');
    assert.match(high[0].file, /003_migrate\.sql$/, 'finding names the unlisted-dir file');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F1+F2: a Django <app>/migrations/*.py with embedded op.execute("DROP TABLE") is discovered AND caught', async () => {
  const dir = mkTemp();
  try {
    // The dir basename `migrations` matches /migrat/i anywhere in the tree, so it is
    // discovered; the executable DROP inside a Python string must still fire.
    writeFile(dir, path.join('myapp', 'migrations', '0002_drop.py'),
      'def upgrade():\n    op.execute("DROP TABLE legacy_users")\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'an *migrat* dir anywhere in the tree is discovered');
    assert.equal(res.findings.length, 1, 'embedded executable DROP TABLE in .py is caught');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F1: a genuine no-migrations repo → scanned:false with a reason that NAMES the searched locations', async () => {
  const dir = mkTemp();
  try {
    fs.writeFileSync(path.join(dir, 'README.md'), '# no migrations here\n', 'utf8');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, false, 'a genuine no-migrations repo is still an honest skip');
    assert.match(res.reason, /search/i, 'the reason frames these as locations that WERE searched');
    assert.match(res.reason, /sql/i, 'reason names the sql root');
    assert.match(res.reason, /database/i, 'reason names the database root');
    assert.match(res.reason, /migrat/i, 'reason names the *migrat* discovery rule');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F2: a `#` comment in a .py migration (`# TODO: drop table ...`) is NOT flagged', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('myapp', 'migrations', '0003_note.py'),
      'def upgrade():\n    # TODO: drop table legacy_users later\n    op.add_column("users", "email")\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'the .py migration was scanned');
    assert.equal(res.findings.length, 0, 'a #-commented "drop table" is not executable DDL');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F3: a SQL string literal containing "auto-truncate" is NOT flagged (benign seed)', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '004_seed.sql'),
      "INSERT INTO settings VALUES ('auto-truncate logs nightly');\n");

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 0, 'a benign seed string must not block the gate');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F3: a /* DROP TABLE */ single-line block comment is NOT flagged', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '005_comment.sql'),
      '/* DROP TABLE users; */\nCREATE TABLE users (id int);\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 0, 'a commented-out DROP is not executable');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F3: a multi-line /* ... DROP TABLE ... */ block comment is NOT flagged and line numbers survive', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '006_block.sql'),
      '/*\n  historical note:\n  DROP TABLE users;\n*/\nDROP TABLE really_gone;\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'only the real DROP on line 5 fires');
    assert.equal(res.findings[0].line, 5, 'multi-line block strip preserves line numbering');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F3: statement-anchored true positives still fire (line-start, post-;, ALTER..DROP COLUMN, TRUNCATE)', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '007_true.sql'), [
      'DROP TABLE IF EXISTS users;',                    // line 1 — line-start DROP TABLE
      'CREATE TABLE keep (id int); DROP TABLE gone;',   // line 2 — post-`;` DROP TABLE
      'ALTER TABLE t DROP COLUMN c;',                   // line 3 — ALTER … DROP
      'TRUNCATE logs;'                                  // line 4 — line-start TRUNCATE
    ].join('\n') + '\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.ok(res.findings.every(f => f.severity === SEVERITY.HIGH), 'every finding is HIGH');
    const lines = res.findings.map(f => f.line).sort((a, b) => a - b);
    assert.deepEqual(lines, [1, 2, 3, 4], 'every real destructive statement still fires exactly once');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── DB-w3 fix (00047): four adversarial defects against real fixtures ──────────
// F1 non-SQL migration formats (Liquibase XML/YAML, EF C#) silently dropped by the
// ext filter; F2 file-cap truncation reads as a clean pass; F3 a string-value
// beginning with a keyword false-positives; F4 the DROP family (INDEX/VIEW/SEQUENCE
// /MATERIALIZED VIEW) the module advertises is not detected. Real temp-dir
// fixtures, zero mocks.

test('F1: a Liquibase XML changelog with <dropTable> yields one HIGH (previously dropped by ext filter → GREEN)', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '001.xml'),
      '<databaseChangeLog>\n  <changeSet id="1" author="a"><dropTable tableName="users"/></changeSet>\n</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'the .xml changelog was actually scanned');
    const high = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(high.length, 1, 'the Liquibase <dropTable> is a HIGH finding');
    assert.match(high[0].file, /001\.xml$/, 'finding names the changelog file');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F1: a Liquibase YAML changelog with `- dropTable:` yields one HIGH', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '002.yaml'),
      'databaseChangeLog:\n  - changeSet:\n      changes:\n        - dropTable:\n            tableName: users\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'the .yaml changelog was actually scanned');
    const high = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(high.length, 1, 'the Liquibase yaml dropTable is a HIGH finding');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F1: an EF Core C# migration with migrationBuilder.DropTable("Users") in Up() yields one HIGH', async () => {
  const dir = mkTemp();
  try {
    // REWORK note (DB-w4 F1): the prior fixture put DropTable inside Down() and asserted
    // a finding — that ENCODED the bug this rework fixes. A DropTable in Down() is a
    // ROLLBACK definition (EF-scaffolded revert) and must NOT flag. The genuine
    // destructive case is a drop in the APPLY direction: DropTable inside Up().
    writeFile(dir, path.join('src', 'Migrations', '20240101_Init.cs'),
      'public partial class Init : Migration {\n  protected override void Up(MigrationBuilder migrationBuilder) {\n    migrationBuilder.DropTable("Users");\n  }\n}\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'the EF Migrations dir was discovered and scanned');
    const high = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(high.length, 1, 'the EF DropTable call in Up() is a HIGH finding');
    assert.match(high[0].file, /20240101_Init\.cs$/, 'finding names the .cs migration');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F1: an EF C# migration with only additive AddColumn yields zero findings but IS scanned', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('src', 'Migrations', '20240102_Add.cs'),
      'protected override void Up(MigrationBuilder migrationBuilder) {\n  migrationBuilder.AddColumn<string>("Email", "Users");\n}\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'additive EF migration was scanned');
    assert.equal(res.findings.length, 0, 'AddColumn is not destructive → no finding');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F1: a genuine no-migrations repo still reports scanned:false with a reason naming searched dirs', async () => {
  const dir = mkTemp();
  try {
    fs.writeFileSync(path.join(dir, 'README.md'), '# nothing here\n', 'utf8');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, false, 'no migrations → honest scanned:false, not a pass');
    assert.match(res.reason, /search/i, 'reason frames these as locations that WERE searched');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F2: exceeding the file cap surfaces a loud skip marker — a truncated scan is NEVER a clean pass', async () => {
  const dir = mkTemp();
  try {
    const migDir = path.join(dir, 'migrations');
    fs.mkdirSync(migDir, { recursive: true });
    // 2101 > DEFAULT_MAX_FILES (2000). One holds a DROP that may sort past the cap.
    for (let i = 0; i < 2101; i++) {
      const name = String(i).padStart(5, '0') + '_m.sql';
      const body = i === 2100 ? 'DROP TABLE late;\n' : `CREATE TABLE t${i} (id int);\n`;
      fs.writeFileSync(path.join(migDir, name), body, 'utf8');
    }

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'the scan ran on the files it could reach');
    assert.ok(
      (res.errors || []).some(e => e.tool === 'migration-safety' && /cap/i.test(e.error)),
      'the cap-hit truncation is surfaced as a loud skip, not silently dropped'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F3: a benign INSERT whose string VALUE begins with "DROP TABLE" is NOT flagged', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '008_help.sql'),
      "INSERT INTO help(body) VALUES ('DROP TABLE permanently removes a table');\n");

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 0, 'a string value that merely starts with a keyword is not executable DDL');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F3: a benign INSERT whose string VALUE begins with "TRUNCATE" is NOT flagged', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '009_docs.sql'),
      "INSERT INTO docs(t) VALUES ('TRUNCATE empties a table fast');\n");

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 0, 'a string value starting with TRUNCATE is not executable DDL');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F3: an executable op.execute("DROP TABLE x") in a .py migration STILL fires (true positive preserved)', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '010_exec.py'),
      'def upgrade():\n    op.execute("DROP TABLE x")\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'embedded executable DROP via execute() is still caught');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F3: a plain line-start `DROP TABLE users;` STILL fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '011_plain.sql'), 'DROP TABLE users;\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'a plain statement-anchored DROP TABLE still fires');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('F4: the wider DROP family (INDEX, VIEW, SEQUENCE, MATERIALIZED VIEW) each yields one HIGH', async () => {
  const cases = [
    ['012_index.sql', 'DROP INDEX idx_unique_email;\n'],
    ['013_view.sql', 'DROP VIEW active_users;\n'],
    ['014_seq.sql', 'DROP SEQUENCE s;\n'],
    ['015_matview.sql', 'DROP MATERIALIZED VIEW mv;\n']
  ];
  for (const [name, body] of cases) {
    const dir = mkTemp();
    try {
      writeFile(dir, path.join('migrations', name), body);
      const checker = new MigrationSafetyChecker(dir);
      const res = await checker.run();
      assert.equal(res.scanned, true, `${name} scanned`);
      const high = res.findings.filter(f => f.severity === SEVERITY.HIGH);
      assert.equal(high.length, 1, `${name}: the DROP is a HIGH finding`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('F4: extending the DROP family does not break ALTER TABLE t DROP COLUMN c (still exactly one finding)', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '016_alter.sql'), 'ALTER TABLE t DROP COLUMN c;\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'ALTER..DROP COLUMN still fires exactly once');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── DB-w4 REWORK (the 8 confirmed defects the .xml/.yaml/.cs pass introduced) ───
// The prior wave added format scanning but was blunt regex-per-line: it flagged
// EVERY additive EF migration (Down() rollback), flagged Liquibase <rollback>
// blocks, missed attributed/multiline <sql> DROP, under-reached embedded execute,
// flagged XML comments, missed the wider DROP family in the new formats, missed
// dash-on-own-line YAML keys, and truncated C# lines at a `//` inside a string.
// Every fixture below is a real temp-dir file; zero mocks. Rollback/direction-aware.

// FINDING 1 — EF direction-awareness: a drop in Down() is a rollback, not a risk.
test('DB-w4 F1: an additive EF migration (Up CreateTable / Down DropTable) yields ZERO findings', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('src', 'Migrations', '20240201_Add.cs'),
      'public partial class Add : Migration {\n' +
      '  protected override void Up(MigrationBuilder migrationBuilder) {\n' +
      '    migrationBuilder.CreateTable("Users", columns: t => new { Id = t.Column<int>() });\n' +
      '  }\n' +
      '  protected override void Down(MigrationBuilder migrationBuilder) {\n' +
      '    migrationBuilder.DropTable("Users");\n' +
      '  }\n' +
      '}\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'the additive EF migration was scanned');
    assert.equal(res.findings.length, 0, 'a DropTable inside Down() is a rollback, not a data-loss risk');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F1: a destructive EF migration (Up DropTable) yields one HIGH', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('src', 'Migrations', '20240202_Drop.cs'),
      'public partial class Drop : Migration {\n' +
      '  protected override void Up(MigrationBuilder migrationBuilder) {\n' +
      '    migrationBuilder.DropTable("Users");\n' +
      '  }\n' +
      '  protected override void Down(MigrationBuilder migrationBuilder) {\n' +
      '    migrationBuilder.CreateTable("Users", columns: t => new { Id = t.Column<int>() });\n' +
      '  }\n' +
      '}\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    const high = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(high.length, 1, 'a DropTable in the Up() apply direction is a HIGH finding');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F1: an EF migration that drops in Up() and adds back in Down() flags exactly the Up() drop', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('src', 'Migrations', '20240203_Both.cs'),
      'public partial class Both : Migration {\n' +
      '  protected override void Up(MigrationBuilder migrationBuilder) {\n' +
      '    migrationBuilder.DropColumn("Email", "Users");\n' +
      '  }\n' +
      '  protected override void Down(MigrationBuilder migrationBuilder) {\n' +
      '    migrationBuilder.AddColumn<string>("Email", "Users");\n' +
      '  }\n' +
      '}\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    const high = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(high.length, 1, 'only the Up() DropColumn fires; the Down() body is excluded');
    assert.match(high[0].statement, /DropColumn/, 'the flagged line is the Up() drop');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// FINDING 2 — Liquibase rollback blocks (XML + YAML) are recommended practice.
test('DB-w4 F2: a Liquibase XML createTable with a <rollback><dropTable/></rollback> yields ZERO findings', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '020.xml'),
      '<databaseChangeLog>\n' +
      '  <changeSet id="1" author="a">\n' +
      '    <createTable tableName="users"/>\n' +
      '    <rollback>\n' +
      '      <dropTable tableName="users"/>\n' +
      '    </rollback>\n' +
      '  </changeSet>\n' +
      '</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'the .xml changelog was scanned');
    assert.equal(res.findings.length, 0, 'a dropTable inside <rollback> is a rollback definition, not a risk');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F2: a Liquibase YAML createTable with a rollback dropTable yields ZERO findings', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '021.yaml'),
      'databaseChangeLog:\n' +
      '  - changeSet:\n' +
      '      changes:\n' +
      '        - createTable:\n' +
      '            tableName: users\n' +
      '      rollback:\n' +
      '        - dropTable:\n' +
      '            tableName: users\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'the .yaml changelog was scanned');
    assert.equal(res.findings.length, 0, 'a dropTable inside a rollback: sub-block is not a risk');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F2: a bare <dropTable> NOT inside a rollback still fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '022.xml'),
      '<databaseChangeLog>\n  <changeSet id="1" author="a"><dropTable tableName="users"/></changeSet>\n</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'a dropTable outside any rollback is a real destructive apply');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// FINDING 3 — attributed / multi-line <sql> DROP/TRUNCATE must be extracted.
test('DB-w4 F3: an attributed <sql dbms="postgresql">DROP TABLE ...</sql> fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '030.xml'),
      '<databaseChangeLog>\n  <changeSet id="1" author="a">\n    <sql dbms="postgresql">DROP TABLE users;</sql>\n  </changeSet>\n</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'the DROP inside an attributed <sql> element is extracted and flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F3: a multi-line <sql> with DROP on its own line fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '031.xml'),
      '<databaseChangeLog>\n  <changeSet id="1" author="a">\n    <sql>\n      DROP TABLE users;\n    </sql>\n  </changeSet>\n</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'the DROP on its own line inside <sql> is extracted and flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F3: <sql splitStatements="true">TRUNCATE orders;</sql> fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '032.xml'),
      '<databaseChangeLog>\n  <changeSet id="1" author="a">\n    <sql splitStatements="true">TRUNCATE orders;</sql>\n  </changeSet>\n</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'the TRUNCATE inside an attributed <sql> element is flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F3: a benign <sql>SELECT ...</sql> yields ZERO findings', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '033.xml'),
      '<databaseChangeLog>\n  <changeSet id="1" author="a">\n    <sql>SELECT * FROM t;</sql>\n  </changeSet>\n</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 0, 'a non-destructive SELECT inside <sql> is not flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// FINDING 4 — broaden the embedded-execute anchor (Rails no-paren, Alembic text()).
test('DB-w4 F4: a Rails no-paren `execute "DROP TABLE ..."` fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'migrate', '20240301_drop.rb'),
      "class DropLegacy < ActiveRecord::Migration[7.1]\n  def up\n    execute \"DROP TABLE legacy\"\n  end\nend\n");

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'a no-paren Rails execute of a DROP is caught');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F4: an Alembic `op.execute(text("DROP TABLE ..."))` fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('alembic', 'versions', 'a1_drop.py'),
      'def upgrade():\n    op.execute(text("DROP TABLE legacy"))\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'an execute wrapping a text() DROP is caught');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F4: the plain `op.execute("DROP TABLE x")` control still fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('alembic', 'versions', 'a2_drop.py'),
      'def upgrade():\n    op.execute("DROP TABLE x")\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'the control op.execute DROP still fires');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F4: a benign INSERT whose VALUE begins with a keyword (no execute) stays ZERO', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('migrations', '040_help.sql'),
      "INSERT INTO help VALUES ('DROP TABLE removes a table');\n");

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 0, 'a benign string value is not executable DDL');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// FINDING 5 — XML comments must be stripped before scanning.
test('DB-w4 F5: a <!-- ... <dropTable/> ... --> XML comment yields ZERO findings', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '050.xml'),
      '<databaseChangeLog>\n  <!-- disabled for now:\n    <dropTable tableName="users"/>\n  -->\n  <changeSet id="1" author="a"><createTable tableName="users"/></changeSet>\n</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 0, 'a commented-out <dropTable> is not live');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F5: a real <dropTable> on a live line (with a comment elsewhere) still fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '051.xml'),
      '<databaseChangeLog>\n  <!-- historical note -->\n  <changeSet id="1" author="a"><dropTable tableName="users"/></changeSet>\n</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'a live <dropTable> outside comments still fires');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// FINDING 6 — the wider DROP family must reach the new formats too.
test('DB-w4 F6: a Liquibase XML <dropIndex> fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '060.xml'),
      '<databaseChangeLog>\n  <changeSet id="1" author="a"><dropIndex indexName="idx_email" tableName="users"/></changeSet>\n</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'a Liquibase <dropIndex> is destructive and flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F6: a Liquibase YAML `- dropView:` fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '061.yaml'),
      'databaseChangeLog:\n  - changeSet:\n      changes:\n        - dropView:\n            viewName: active_users\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'a Liquibase yaml dropView is destructive and flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F6: an EF `.DropIndex(` in Up() fires; the same in Down() does not', async () => {
  const dirUp = mkTemp();
  try {
    writeFile(dirUp, path.join('src', 'Migrations', '20240601_UpIdx.cs'),
      'public partial class UpIdx : Migration {\n  protected override void Up(MigrationBuilder migrationBuilder) {\n    migrationBuilder.DropIndex("IX_Users_Email", "Users");\n  }\n}\n');
    const resUp = await new MigrationSafetyChecker(dirUp).run();
    assert.equal(resUp.findings.length, 1, 'DropIndex in Up() is a HIGH finding');
  } finally {
    fs.rmSync(dirUp, { recursive: true, force: true });
  }

  const dirDown = mkTemp();
  try {
    writeFile(dirDown, path.join('src', 'Migrations', '20240602_DownIdx.cs'),
      'public partial class DownIdx : Migration {\n  protected override void Up(MigrationBuilder migrationBuilder) {\n    migrationBuilder.CreateIndex("IX_Users_Email", "Users", "Email");\n  }\n  protected override void Down(MigrationBuilder migrationBuilder) {\n    migrationBuilder.DropIndex("IX_Users_Email", "Users");\n  }\n}\n');
    const resDown = await new MigrationSafetyChecker(dirDown).run();
    assert.equal(resDown.findings.length, 0, 'DropIndex in Down() is a rollback, not flagged');
  } finally {
    fs.rmSync(dirDown, { recursive: true, force: true });
  }
});

// FINDING 7 — YAML sequence dash on its own line above the key.
test('DB-w4 F7: a YAML dropTable with the `-` dash on the preceding line fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '070.yaml'),
      'databaseChangeLog:\n  - changeSet:\n      changes:\n        -\n          dropTable:\n            tableName: users\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'a dash-own-line dropTable key still fires');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// FINDING 8 — string-literal-aware `//` stripping for C#.
test('DB-w4 F8: a C# line with a `//` inside a string plus a real DropTable fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('src', 'Migrations', '20240801_Url.cs'),
      'public partial class Url : Migration {\n  protected override void Up(MigrationBuilder migrationBuilder) {\n    migrationBuilder.Sql("url=\'http://x\'"); migrationBuilder.DropTable("Users");\n  }\n}\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'the // inside a string does not hide the trailing DropTable');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 F8: a genuine `// migrationBuilder.DropTable("x")` comment yields ZERO findings', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('src', 'Migrations', '20240802_Comment.cs'),
      'public partial class Comment : Migration {\n  protected override void Up(MigrationBuilder migrationBuilder) {\n    // migrationBuilder.DropTable("x")\n    migrationBuilder.AddColumn<string>("Email", "Users");\n  }\n}\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 0, 'a genuinely commented DropTable is not flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── DB-w4 KICKBACK: two partial fixes completed ────────────────────────────────
// GAP 1: F2 YAML rollback with the list dash ALIGNED to the `rollback:` key (the
// standard Liquibase style) was not stripped. GAP 2: F3 single-line attributed
// `<sql dbms="...">DROP ...</sql>` preceded by markup on the same physical line was
// not statement-anchored, so the dominant Liquibase raw-SQL form shipped GREEN.

test('DB-w4 GAP1: a YAML rollback whose `- dropTable:` is DASH-ALIGNED to `rollback:` yields ZERO', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '080.yaml'),
      'databaseChangeLog:\n' +
      '- changeSet:\n' +
      '    changes:\n' +
      '    - createTable:\n' +
      '        tableName: u\n' +
      '    rollback:\n' +
      '    - dropTable:\n' +
      '        tableName: u\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'the .yaml changelog was scanned');
    assert.equal(res.findings.length, 0, 'a dash-aligned rollback dropTable is a rollback definition, not a risk');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 GAP1: a bare dash-aligned `- dropTable:` NOT under a rollback still fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '081.yaml'),
      'databaseChangeLog:\n' +
      '- changeSet:\n' +
      '    changes:\n' +
      '    - dropTable:\n' +
      '        tableName: u\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'a dropTable outside any rollback is a real destructive apply');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 GAP2: a single-line `<changeSet><sql dbms="postgresql">DROP TABLE ...</sql></changeSet>` fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '082.xml'),
      '<databaseChangeLog>\n  <changeSet id="1" author="a"><sql dbms="postgresql">DROP TABLE users;</sql></changeSet>\n</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'the DROP inside an inline attributed <sql> is extracted and flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 GAP2: a single-line inline `<sql splitStatements="true">TRUNCATE ...</sql>` after markup fires', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '083.xml'),
      '<databaseChangeLog>\n  <changeSet id="1" author="a"><sql splitStatements="true">TRUNCATE orders;</sql></changeSet>\n</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 1, 'the TRUNCATE inside an inline attributed <sql> is flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DB-w4 GAP2: a single-line inline benign `<sql>SELECT ...</sql>` after markup stays ZERO', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('db', 'changelog', '084.xml'),
      '<databaseChangeLog>\n  <changeSet id="1" author="a"><sql>SELECT * FROM t;</sql></changeSet>\n</databaseChangeLog>\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 0, 'a benign inline SELECT is not flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
