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
