/**
 * Migration-safety checker — DARK-BRANCH coverage (companion to
 * tests/migration-safety-checker.test.js; that file is NOT touched here).
 *
 * Every test below pins a branch the existing suite leaves unexercised and is written
 * to go RED under mutation — it targets the NON-OBVIOUS operands:
 *   - the `$`-that-is-NOT-a-dollar-quote arm of stripSqlLineComment (a `$1` positional
 *     parameter must not corrupt `--` comment stripping, nor swallow a real trailing
 *     statement);
 *   - the "rollback block ENDS at a sibling key" transition in stripYamlRollback (a real
 *     drop AFTER a rollback: block must still fire);
 *   - the unbalanced-Down()-brace fail-soft in matchBrace (over-exclude to EOF —
 *     the documented DB-w4 residual);
 *   - the UNPARSED-migration-extension loud skip (a `.ts`/`.js` migration must never
 *     read as a silent "no migrations found"), including the `+N more` truncation arm;
 *   - the REAL isToolAvailable probe (the existing atlas test overrides it, so the real
 *     method is never executed) — unknown tool → false, atlas → boolean;
 *   - runAtlas's two guarded skip/exec arms the existing test can't reach because it
 *     forces isToolAvailable → false;
 *   - the per-file byte-cap skip and the unreadable-file catch in run().
 *
 * Fakes live ONLY at the true boundaries the module talks to: the external `atlas`
 * binary (isToolAvailable is overridden per-instance, exactly as the sibling suite
 * does at the prototype level) and the filesystem (safe-fs.readFileSync is temporarily
 * replaced to force a read error, restored in finally). No core logic is mocked.
 *
 * Human-reviewed line-by-line. Real os.tmpdir() fixtures, cleaned in finally.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { MigrationSafetyChecker, SEVERITY } = require('../src/lib/migration-safety-checker');
const safeFs = require('../src/lib/safe-fs');

/** Make a fresh, isolated temp project dir. */
function mkTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-migcov-'));
}

/** Write a file, creating parent dirs. */
function writeFile(dir, rel, content) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

// ── stripSqlLineComment: the `$`-is-NOT-a-dollar-quote arm (matchDollarTag → null) ──
// A `$1` positional parameter is a lone `$` that matchDollarTag rejects. The scanner
// must skip it (i++) and keep scanning so a genuine trailing `--` comment is still
// stripped — and, conversely, must NOT swallow a genuine trailing statement. These two
// rows pin both directions of that arm; a mutant that mishandles the non-tag `$`
// (e.g. drops the `i++`, or treats `$1` as an unterminated dollar-quote and returns the
// whole line) flips at least one of them RED.

test('scanDestructive_treats_$1_positional_param_as_plain_char_and_still_strips_a_trailing_comment', () => {
  // Arrange — a lone `$1` (NOT a dollar-quote open) precedes a real `--` comment
  // whose text merely mentions DROP TABLE.
  const checker = new MigrationSafetyChecker('/tmp');
  const sql = 'SELECT id FROM t WHERE x = $1; -- DROP TABLE gone';

  // Act
  const findings = checker.scanDestructive(sql, 'params.sql');

  // Assert — the `--` comment is stripped past the `$1`, so the DROP is not executable.
  assert.equal(findings.length, 0, 'a DROP inside the trailing -- comment must not fire even when a $1 precedes it');
});

test('scanDestructive_does_not_let_a_$1_positional_param_swallow_a_real_trailing_DROP', () => {
  // Arrange — a `$1` followed by a genuine post-`;` DROP (no comment).
  const checker = new MigrationSafetyChecker('/tmp');
  const sql = 'UPDATE t SET x = $1; DROP TABLE gone;';

  // Act
  const findings = checker.scanDestructive(sql, 'params.sql');

  // Assert — the `$` arm must advance by one char, not consume to end-of-line, so the
  // statement-anchored DROP after the `;` still fires exactly once.
  assert.equal(findings.length, 1, 'the real post-; DROP after a $1 parameter must still be flagged');
});

// ── stripYamlRollback: the "rollback block ENDS at a sibling key" transition ─────────
// Every existing YAML-rollback fixture puts `rollback:` LAST in the changeSet, so the
// block always ends at EOF and the `inRollback = false` sibling-key exit is never taken.
// Here `rollback:` comes FIRST and a real destructive `dropTable` sits in a later
// `changes:` sibling. The block must END at `changes:` so the apply drop fires. A mutant
// that never leaves the rollback state blanks the whole tail and yields 0.

test('stripYamlRollback_ends_the_block_at_a_sibling_key_so_a_later_apply_dropTable_still_fires', () => {
  // Arrange — rollback: appears BEFORE changes:; only the changes: dropTable is an apply.
  const checker = new MigrationSafetyChecker('/tmp');
  const yaml =
    'databaseChangeLog:\n' +
    '  - changeSet:\n' +
    '      rollback:\n' +
    '        - addColumn:\n' +
    '            columnName: x\n' +
    '      changes:\n' +
    '        - dropTable:\n' +
    '            tableName: users\n';

  // Act
  const findings = checker.scanDestructive(yaml, 'order.yaml');

  // Assert — the rollback block must close at the `changes:` sibling key; the apply-side
  // dropTable is a live data-loss risk and fires exactly once.
  assert.equal(findings.length, 1, 'the apply dropTable after a leading rollback: block must still fire');
  assert.equal(findings[0].severity, SEVERITY.HIGH, 'the surviving finding is HIGH');
});

test('stripYamlRollback_still_blanks_a_dropTable_inside_the_leading_rollback_block', () => {
  // Arrange — companion to the test above: prove the leading rollback body IS stripped,
  // so the pair pins the exact block boundary (start blanked, sibling ends it).
  const checker = new MigrationSafetyChecker('/tmp');
  const yaml =
    'databaseChangeLog:\n' +
    '  - changeSet:\n' +
    '      rollback:\n' +
    '        - dropTable:\n' +
    '            tableName: users\n' +
    '      changes:\n' +
    '        - addColumn:\n' +
    '            columnName: x\n';

  // Act
  const findings = checker.scanDestructive(yaml, 'order2.yaml');

  // Assert — the dropTable lives inside the rollback: block; nothing destructive applies.
  assert.equal(findings.length, 0, 'a dropTable inside the leading rollback: block is a rollback definition, not a risk');
});

// ── matchBrace: the unbalanced-Down()-body fail-soft (returns EOF, over-excludes) ────
// DB-w4 documented residual: an unbalanced/pathological Down() body is treated as
// running to end-of-file. matchBrace's `return s.length - 1` fallback is only reached
// when depth never returns to zero. The DropTable inside such a body is therefore
// over-EXCLUDED (a deliberate bias protecting the additive case). A mutant that returns
// e.g. `openIdx` instead would exclude only the signature line, letting the DropTable
// fire → 1; asserting 0 kills it.

test('matchBrace_over_excludes_a_dropTable_in_an_UNBALANCED_Down_body_to_end_of_file', () => {
  // Arrange — a Down() whose braces never close; the DropTable sits inside it.
  const checker = new MigrationSafetyChecker('/tmp');
  const cs =
    'public class C : Migration {\n' +
    '  protected override void Down(MigrationBuilder migrationBuilder) {\n' +
    '    if (x) {\n' +
    '      migrationBuilder.DropTable("Users");\n';

  // Act
  const findings = checker.scanDestructive(cs, 'Unbalanced.cs');

  // Assert — matchBrace runs the Down body to EOF (documented over-exclude), so the
  // rollback-direction DropTable is NOT flagged.
  assert.equal(findings.length, 0, 'an unbalanced Down() body is treated as running to EOF and its DropTable is excluded');
});

test('matchBrace_still_flags_an_Up_dropTable_when_the_Down_body_is_balanced', () => {
  // Arrange — control: a balanced Down() must NOT swallow a real Up() drop that follows.
  const checker = new MigrationSafetyChecker('/tmp');
  const cs =
    'public class C : Migration {\n' +
    '  protected override void Down(MigrationBuilder migrationBuilder) {\n' +
    '    migrationBuilder.AddColumn("x");\n' +
    '  }\n' +
    '  protected override void Up(MigrationBuilder migrationBuilder) {\n' +
    '    migrationBuilder.DropTable("Users");\n' +
    '  }\n' +
    '}\n';

  // Act
  const findings = checker.scanDestructive(cs, 'Balanced.cs');

  // Assert — the balanced Down body closes at its own `}`; the Up() drop fires once.
  assert.equal(findings.length, 1, 'a balanced Down() must let the later Up() DropTable fire');
});

// ── detectMigrationFiles + run(): the UNPARSED-migration-extension loud skip ─────────
// A migration directory holding only files this static scanner cannot parse (Knex/
// TypeORM `.ts`, Doctrine `.php`, …) must NEVER read as a silent "no migrations found".
// run() emits a loud skip naming them. Neither the loud skip nor the `+N more`
// truncation is exercised by the sibling suite.

test('run_emits_a_loud_skip_when_a_migrations_dir_holds_only_unparseable_files', async () => {
  const dir = mkTemp();
  try {
    // Arrange — a `.ts` migration this scanner cannot parse, alone in migrations/.
    writeFile(dir, path.join('migrations', '001_init.ts'), 'export const up = () => `DROP TABLE x`;\n');

    // Act
    const res = await new MigrationSafetyChecker(dir).run();

    // Assert — an honest scanned:false with a loud skip naming the unread file, never a
    // silent clean pass and never a fabricated finding.
    assert.equal(res.scanned, false, 'no PARSEABLE migration file → scanned:false, not a pass');
    assert.ok(
      (res.errors || []).some(e => e.tool === 'migration-safety' && /cannot parse/i.test(e.error) && /001_init\.ts/.test(e.error)),
      'the unparseable .ts migration is surfaced as a loud skip that names it'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('run_truncates_the_unparseable_file_list_with_a_plus_N_more_marker_beyond_twenty', async () => {
  const dir = mkTemp();
  try {
    // Arrange — 21 unparseable files trips the `> 20 ? +N more : ''` truncation arm.
    for (let i = 0; i < 21; i++) {
      writeFile(dir, path.join('migrations', String(i).padStart(3, '0') + '.ts'), 'x\n');
    }

    // Act
    const res = await new MigrationSafetyChecker(dir).run();

    // Assert — exactly one over the cap of 20 is summarised as "(+1 more)".
    assert.ok(
      (res.errors || []).some(e => e.tool === 'migration-safety' && /\(\+1 more\)/.test(e.error)),
      'the 21st unparseable file is summarised by the +N more truncation arm'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── isToolAvailable: the REAL probe (sibling suite overrides it, so it never runs) ───

test('isToolAvailable_returns_false_for_an_unknown_tool_without_spawning_anything', () => {
  // Arrange
  const checker = new MigrationSafetyChecker('/tmp');

  // Act
  const available = checker.isToolAvailable('definitely-not-a-real-tool');

  // Assert — the `if (!spec) return false` guard short-circuits before any exec.
  assert.equal(available, false, 'an unregistered tool name resolves to false, never a spawn attempt');
});

test('isToolAvailable_probes_the_real_atlas_binary_and_returns_a_boolean', () => {
  // Arrange
  const checker = new MigrationSafetyChecker('/tmp');

  // Act — this actually runs the execFileSync('atlas', ['version']) probe (or its catch).
  const available = checker.isToolAvailable('atlas');

  // Assert — availability is environment-dependent, but the probe must yield a strict
  // boolean via either the try (installed) or the catch (absent) path.
  assert.equal(typeof available, 'boolean', 'the real availability probe resolves to a boolean');
});

// ── runAtlas: the two guarded arms the sibling suite cannot reach ────────────────────
// The existing atlas test forces isToolAvailable → false, so runAtlas always returns at
// its first guard. Here we fake availability true (the true boundary — the external
// binary) to reach the devUrl guard and the real exec + catch.

test('runAtlas_records_a_loud_skip_when_available_but_no_devUrl_is_configured', () => {
  const dir = mkTemp();
  try {
    // Arrange — atlas "available" but no dev-url.
    const checker = new MigrationSafetyChecker(dir, { atlas: true });
    checker.isToolAvailable = () => true;

    // Act
    checker.runAtlas(path.join(dir, 'migrations'));

    // Assert — a missing dev-url is a loud skip, never a silent drop.
    assert.ok(
      checker.errors.some(e => e.tool === 'atlas' && /dev-url/i.test(e.error) && /skip/i.test(e.error)),
      'atlas requested + available but no dev-url → an explicit skip entry'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runAtlas_surfaces_the_failure_verbatim_when_the_atlas_exec_throws', () => {
  const dir = mkTemp();
  try {
    // Arrange — atlas "available" and a dev-url set; the real binary is absent, so the
    // execFileSync throws (ENOENT) and the catch must carry a loud entry.
    const checker = new MigrationSafetyChecker(dir, { atlas: true, devUrl: 'docker://postgres/16/dev' });
    checker.isToolAvailable = () => true;

    // Act
    checker.runAtlas(path.join(dir, 'migrations'));

    // Assert — a crashed/objecting atlas is recorded loudly, never read as a clean pass.
    assert.ok(
      checker.errors.some(e => e.tool === 'atlas' && /flagged issues|report/i.test(e.error)),
      'a failing atlas exec is surfaced as a loud atlas error, not swallowed'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── run(): the per-file byte-cap skip ────────────────────────────────────────────────

test('run_skips_a_migration_file_that_exceeds_the_byte_cap_and_records_a_loud_skip', async () => {
  const dir = mkTemp();
  try {
    // Arrange — a real DROP, but maxBytes is set below the file size so it is not read.
    writeFile(dir, path.join('migrations', 'big.sql'), 'DROP TABLE users;\n'); // 18 bytes > 5
    const checker = new MigrationSafetyChecker(dir, { maxBytes: 5 });

    // Act
    const res = await checker.run();

    // Assert — an over-cap file is skipped (its DROP is NOT read), and the skip is loud.
    assert.equal(res.findings.length, 0, 'a file skipped for exceeding the byte cap yields no finding');
    assert.ok(
      (res.errors || []).some(e => e.tool === 'migration-safety' && /exceeds .*byte cap/i.test(e.error)),
      'the byte-cap skip is surfaced loudly, never a silent clean pass'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('run_still_scans_a_file_at_or_under_the_byte_cap', async () => {
  const dir = mkTemp();
  try {
    // Arrange — boundary control: the SAME DROP under a generous cap must be read + flagged.
    writeFile(dir, path.join('migrations', 'small.sql'), 'DROP TABLE users;\n');
    const checker = new MigrationSafetyChecker(dir, { maxBytes: 1024 });

    // Act
    const res = await checker.run();

    // Assert — pins that the cap guard is a genuine size boundary, not an always-skip.
    assert.equal(res.findings.length, 1, 'a file within the byte cap is read and its DROP is flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── run(): the unreadable-file catch (fs boundary fake) ──────────────────────────────
// Force safe-fs.readFileSync (the filesystem boundary) to throw so the read try/catch in
// run() is exercised: an unreadable-but-detected migration file becomes a loud error and
// is NOT counted as scanned, never a fabricated pass. Restored in finally.

test('run_records_a_loud_error_when_a_detected_migration_file_cannot_be_read', async () => {
  const dir = mkTemp();
  const originalRead = safeFs.readFileSync;
  try {
    // Arrange — the file exists (statSync succeeds), but the read is forced to fail.
    writeFile(dir, path.join('migrations', '001_init.sql'), 'DROP TABLE users;\n');
    safeFs.readFileSync = () => { throw new Error('EACCES-simulated'); };
    const checker = new MigrationSafetyChecker(dir);

    // Act
    const res = await checker.run();

    // Assert — the read failure is caught and surfaced; no finding is fabricated from an
    // unread file.
    assert.equal(res.scanned, true, 'the repo HAS a migration file, so the scan ran');
    assert.equal(res.findings.length, 0, 'an unread file yields no finding — never a fabricated pass');
    assert.ok(
      (res.errors || []).some(e => e.tool === 'migration-safety' && /unreadable/i.test(e.error) && /EACCES-simulated/.test(e.error)),
      'the read failure is surfaced verbatim as a loud migration-safety error'
    );
  } finally {
    safeFs.readFileSync = originalRead;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
