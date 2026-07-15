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

test('F1: an EF Core C# migration with migrationBuilder.DropTable("Users") yields one HIGH', async () => {
  const dir = mkTemp();
  try {
    writeFile(dir, path.join('src', 'Migrations', '20240101_Init.cs'),
      'public partial class Init : Migration {\n  protected override void Down(MigrationBuilder migrationBuilder) {\n    migrationBuilder.DropTable("Users");\n  }\n}\n');

    const checker = new MigrationSafetyChecker(dir);
    const res = await checker.run();

    assert.equal(res.scanned, true, 'the EF Migrations dir was discovered and scanned');
    const high = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(high.length, 1, 'the EF DropTable call is a HIGH finding');
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
