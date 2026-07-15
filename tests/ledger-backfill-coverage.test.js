'use strict';

/**
 * Dark-branch coverage for src/scripts/ledger-backfill.js.
 *
 * The existing tests/ledger-forgery-closed.test.js drives the happy paths (--vision
 * ledgers archives, --plan/--stage backfills one plan, idempotent re-run, plan-not-
 * found, no-mode). This file deliberately targets the branches those tests never
 * reach — every test below pins a branch that goes RED under mutation:
 *
 *   - parseArgs: --help / -h, --dry-run, the unknown-flag default, non-array argv.
 *   - run() routing: --vision+--plan mutual exclusion, --plan-without-stage, the
 *     `opts.root ? ... : cwd` cwd fallback.
 *   - backfillVisions: missing plans/done/, --dry-run (no write), the >1 MiB size
 *     gate AND its exact-boundary (`>` not `>=`), not-a-regular-file, and the
 *     write-time catch (ledger write fails loudly, sweep continues).
 *   - backfillOnePlan: invalid stage, relative-path join, --dry-run (no write),
 *     empty-reason fallback + gate-source mapping, and the backfillEntry catch.
 *   - the require.main CLI block, exercised via spawnSync subprocess.
 *
 * Fixtures are real os.tmpdir() directories loading the REAL module (no fs mocking,
 * no core-logic doubles) and are removed in an after() hook.
 */

const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backfill = require('../src/scripts/ledger-backfill.js');
const ledger = require('../src/lib/approval-ledger');

const SCRIPT = path.join(__dirname, '..', 'src', 'scripts', 'ledger-backfill.js');
const MAX_PLAN_BYTES = 1 << 20; // mirror the constant under test (1 MiB)

/** Temp roots created during the run, torn down once in after(). */
const TMP_ROOTS = [];

/**
 * Create an isolated project root. `withDone` controls whether plans/done/ exists,
 * so the "no plans/done/" error branch can be reached.
 */
function newRoot({ withDone = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-backfill-'));
  TMP_ROOTS.push(root);
  if (withDone) fs.mkdirSync(path.join(root, 'plans', 'done'), { recursive: true });
  return root;
}

/** Write a decomposed-vision archive into plans/done/ and return its slug. */
function writeVision(root, basename, body = 'body\n') {
  fs.writeFileSync(path.join(root, 'plans', 'done', basename), `---\ntype: vision\n---\n\n${body}`);
  return basename.replace(/\.md$/i, '').toLowerCase();
}

after(() => {
  for (const root of TMP_ROOTS) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort teardown */ }
  }
});

// =============================================================================
// parseArgs — flags the happy-path tests never pass
// =============================================================================

describe('parseArgs dark flags', () => {
  test('unknown_flag_returns_loud_error_not_silent_noop', () => {
    // Arrange / Act
    const res = backfill.run(['--not-a-flag']);

    // Assert — the default: branch must ERROR, never fall through to a silent no-op
    assert.equal(res.ok, false);
    assert.match(res.error, /unknown argument "--not-a-flag"/);
  });

  test('help_flag_returns_usage_and_ok', () => {
    // Act
    const res = backfill.run(['--help']);

    // Assert — help short-circuits BEFORE any mode selection
    assert.equal(res.ok, true);
    assert.equal(res.error, undefined);
    assert.match(res.usage, /ledger-backfill/);
    assert.match(res.usage, /NEVER moves a plan/);
  });

  test('h_short_alias_returns_usage', () => {
    // Act
    const res = backfill.run(['-h']);

    // Assert — the `-h` arm of the shared case must behave like --help
    assert.equal(res.ok, true);
    assert.ok(typeof res.usage === 'string' && res.usage.length > 0);
  });

  test('non_array_argv_is_treated_as_empty_and_never_throws', () => {
    // Act — the module contract is "NEVER throws"; parseArgs' `: []` fallback
    // guards against a non-array argv reaching the for-loop.
    const res = backfill.run(null);

    // Assert — falls through to no-mode, does not raise
    assert.equal(res.ok, false);
    assert.match(res.error, /no mode selected/);
  });
});

// =============================================================================
// run() routing — mutual exclusion, missing --stage, cwd fallback
// =============================================================================

describe('run routing dark branches', () => {
  test('vision_and_plan_together_are_mutually_exclusive', () => {
    // Arrange
    const root = newRoot();
    const p = path.join(root, 'plans', 'done', 'x.md');
    fs.writeFileSync(p, '---\ntype: implementation\n---\n\nbody\n');

    // Act
    const res = backfill.run(['--vision', '--plan', p, '--root', root]);

    // Assert
    assert.equal(res.ok, false);
    assert.match(res.error, /mutually exclusive/);
  });

  test('plan_without_stage_is_an_error', () => {
    // Arrange
    const root = newRoot();
    const p = path.join(root, 'plans', 'done', 'x.md');
    fs.writeFileSync(p, '---\ntype: implementation\n---\n\nbody\n');

    // Act
    const res = backfill.run(['--plan', p, '--root', root]);

    // Assert
    assert.equal(res.ok, false);
    assert.match(res.error, /--plan requires --stage/);
  });

  test('root_defaults_to_cwd_when_flag_absent', () => {
    // Arrange — no --root; pass the root as the cwd argument instead. This pins the
    // second operand of `opts.root ? String(opts.root) : cwd`.
    const root = newRoot();
    const slug = writeVision(root, 'from-cwd.md');

    // Act
    const res = backfill.run(['--vision'], root);

    // Assert — resolution used cwd, so the archive was found and ledgered
    assert.equal(res.ok, true);
    assert.deepEqual(res.ledgered, [slug]);
    assert.equal(ledger.entryKind(ledger.readEntry(slug, root)), 'pipeline');
  });
});

// =============================================================================
// backfillVisions — error, dry-run, size gate + boundary, file-kind, write-catch
// =============================================================================

describe('backfillVisions dark branches', () => {
  test('missing_plans_done_directory_fails_loudly', () => {
    // Arrange — a root WITHOUT plans/done/
    const root = newRoot({ withDone: false });

    // Act
    const res = backfill.run(['--vision', '--root', root]);

    // Assert
    assert.equal(res.ok, false);
    assert.match(res.error, /no plans\/done\//);
  });

  test('dry_run_reports_ledgered_but_writes_no_entry', () => {
    // Arrange
    const root = newRoot();
    const slug = writeVision(root, 'dry.md');

    // Act
    const res = backfill.run(['--vision', '--dry-run', '--root', root]);

    // Assert — reported as would-ledger, but NO entry was persisted
    assert.equal(res.ok, true);
    assert.deepEqual(res.ledgered, [slug]);
    assert.equal(ledger.readEntry(slug, root), null, 'dry-run must not write the ledger');
  });

  test('oversized_archive_is_skipped_and_exact_max_is_processed', () => {
    // Arrange — pin the `stat.size > MAX_PLAN_BYTES` off-by-one:
    //   size === MAX  -> NOT skipped (`>` is strict), ledgered
    //   size === MAX+1 -> skipped as oversized
    const root = newRoot();
    const header = '---\ntype: vision\n---\n';
    const exactBody = 'x'.repeat(MAX_PLAN_BYTES - header.length);
    fs.writeFileSync(path.join(root, 'plans', 'done', 'exact.md'), header + exactBody);
    const overBody = 'x'.repeat(MAX_PLAN_BYTES - header.length + 1);
    fs.writeFileSync(path.join(root, 'plans', 'done', 'big.md'), header + overBody);
    assert.equal(fs.statSync(path.join(root, 'plans', 'done', 'exact.md')).size, MAX_PLAN_BYTES);
    assert.equal(fs.statSync(path.join(root, 'plans', 'done', 'big.md')).size, MAX_PLAN_BYTES + 1);

    // Act
    const res = backfill.run(['--vision', '--root', root]);

    // Assert
    assert.equal(res.ok, true);
    assert.ok(res.ledgered.includes('exact'), 'a file at exactly MAX bytes must be processed (> is strict)');
    assert.ok(!res.ledgered.includes('big'), 'a file over MAX bytes must be skipped');
    assert.deepEqual(
      res.skipped.find((s) => s.plan === 'big'),
      { plan: 'big', reason: 'oversized' },
    );
  });

  test('an_already_ledgered_archive_is_skipped_on_re_run', () => {
    // Arrange — first run writes the entry; the second must leave it untouched
    // (pins the `readEntryResult(...).status !== 'absent'` idempotency guard).
    const root = newRoot();
    const slug = writeVision(root, 'once.md');
    backfill.run(['--vision', '--root', root]);

    // Act
    const res = backfill.run(['--vision', '--root', root]);

    // Assert
    assert.equal(res.ok, true);
    assert.deepEqual(res.ledgered, [], 'a re-run ledgers nothing');
    assert.deepEqual(
      res.skipped.find((s) => s.plan === slug),
      { plan: slug, reason: 'already-ledgered' },
    );
  });

  test('a_directory_named_dot_md_is_skipped_as_not_a_regular_file', () => {
    // Arrange — readdir yields "sub.md" but it is a directory, not a file
    const root = newRoot();
    fs.mkdirSync(path.join(root, 'plans', 'done', 'sub.md'));

    // Act
    const res = backfill.run(['--vision', '--root', root]);

    // Assert — the isFile() guard rejects it
    assert.equal(res.ok, true);
    assert.ok(!res.ledgered.includes('sub'));
    assert.deepEqual(
      res.skipped.find((s) => s.plan === 'sub'),
      { plan: 'sub', reason: 'not-a-regular-file' },
    );
  });

  test('write_failure_is_reported_and_the_sweep_continues', () => {
    // Arrange — make the ledger write throw by planting a FILE where the approvals
    // DIRECTORY must be created; mkdir(recursive) then throws EEXIST. This exercises
    // the writeVisionArchiveEntry try/catch: a failure is pushed to `skipped`
    // (LOUD, with the error message), never silently swallowed.
    const root = newRoot();
    const slug = writeVision(root, 'wontwrite.md');
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctoc', 'approvals'), 'i am a file, not a dir');

    // Act
    const res = backfill.run(['--vision', '--root', root]);

    // Assert — overall ok, nothing ledgered, the failure surfaced with a message
    assert.equal(res.ok, true);
    assert.deepEqual(res.ledgered, []);
    const skip = res.skipped.find((s) => s.plan === slug);
    assert.ok(skip, 'the failed archive must appear in skipped');
    assert.ok(skip.reason && skip.reason.length > 0, 'the skip reason must carry the real error, not empty');
    assert.match(skip.reason, /EEXIST|ENOTDIR|approvals/i);
  });
});

// =============================================================================
// backfillOnePlan — invalid stage, relative path, dry-run, empty reason, catch
// =============================================================================

describe('backfillOnePlan dark branches', () => {
  test('invalid_stage_is_rejected_with_the_allowed_set', () => {
    // Arrange — 'review' is a real stage but NOT a backfillable one
    const root = newRoot();
    const p = path.join(root, 'plans', 'done', 'legacy.md');
    fs.writeFileSync(p, '---\ntype: implementation\n---\n\nbody\n');

    // Act
    const res = backfill.run(['--plan', p, '--stage', 'review', '--root', root]);

    // Assert
    assert.equal(res.ok, false);
    assert.match(res.error, /--stage must be one of implementation\|todo\|done/);
  });

  test('missing_plan_file_is_reported_not_found', () => {
    // Arrange — a --plan path that does not exist (pins the existsSync guard)
    const root = newRoot();

    // Act
    const res = backfill.run(['--plan', path.join(root, 'plans', 'done', 'ghost.md'), '--stage', 'done', '--root', root]);

    // Assert
    assert.equal(res.ok, false);
    assert.match(res.error, /plan not found:.*ghost\.md/);
  });

  test('relative_plan_path_is_resolved_against_root', () => {
    // Arrange — a RELATIVE --plan must be joined onto root (pins the isAbsolute ternary)
    const root = newRoot();
    fs.writeFileSync(path.join(root, 'plans', 'done', 'rel.md'), '---\ntype: implementation\n---\n\nbody\n');

    // Act
    const res = backfill.run(['--plan', path.join('plans', 'done', 'rel.md'), '--stage', 'done', '--root', root]);

    // Assert — resolution succeeded and the entry was written
    assert.equal(res.ok, true);
    assert.deepEqual(res.ledgered, ['rel']);
    assert.equal(ledger.readEntry('rel', root).backfilled, true);
  });

  test('dry_run_reports_slug_but_writes_no_entry', () => {
    // Arrange
    const root = newRoot();
    const p = path.join(root, 'plans', 'done', 'legacy.md');
    fs.writeFileSync(p, '---\ntype: implementation\n---\n\nbody\n');

    // Act
    const res = backfill.run(['--plan', p, '--stage', 'done', '--dry-run', '--root', root]);

    // Assert
    assert.equal(res.ok, true);
    assert.deepEqual(res.ledgered, ['legacy']);
    assert.equal(ledger.readEntry('legacy', root), null, 'dry-run must not write the ledger');
  });

  test('omitted_reason_defaults_to_empty_and_stage_from_maps_from_the_gate', () => {
    // Arrange — no --reason; stage 'todo' is a gate destination whose source is
    // 'implementation'. Pins BOTH the `reason ?? ''` fallback and the gate source-of
    // mapping flowing through the backfilled entry.
    const root = newRoot();
    const p = path.join(root, 'plans', 'todo', 'legacy2.md');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '---\ntype: implementation\n---\n\nbody\n');

    // Act
    const res = backfill.run(['--plan', p, '--stage', 'todo', '--root', root]);

    // Assert
    assert.equal(res.ok, true);
    const entry = ledger.readEntry('legacy2', root);
    assert.equal(entry.backfill_reason, '', 'absent --reason must record an empty reason, not undefined');
    assert.equal(entry.stage_to, 'todo');
    assert.equal(entry.stage_from, 'implementation', 'stage_from must derive from the gate source of todo');
  });

  test('backfill_write_error_surfaces_as_ok_false', () => {
    // Arrange — a plan whose basename is not a keyable slug ("@bad") passes the
    // existsSync check but makes backfillEntry throw "Invalid slug" inside the try.
    const root = newRoot();
    const p = path.join(root, 'plans', 'done', '@bad.md');
    fs.writeFileSync(p, '---\ntype: implementation\n---\n\nbody\n');

    // Act
    const res = backfill.run(['--plan', p, '--stage', 'done', '--root', root]);

    // Assert — the catch converts the throw into a loud {ok:false,error}, never a crash
    assert.equal(res.ok, false);
    assert.match(res.error, /Invalid slug/);
  });
});

// =============================================================================
// CLI block (require.main === module) — exercised via subprocess
// =============================================================================

describe('CLI entry via subprocess', () => {
  test('help_prints_usage_and_exits_zero', () => {
    // Act
    const out = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });

    // Assert
    assert.equal(out.status, 0);
    assert.match(out.stdout, /ledger-backfill/);
  });

  test('unknown_flag_prints_to_stderr_and_exits_one', () => {
    // Act
    const out = spawnSync(process.execPath, [SCRIPT, '--zzz'], { encoding: 'utf8' });

    // Assert — a failure is LOUD (nonzero exit + stderr), never a silent success
    assert.equal(out.status, 1);
    assert.match(out.stderr, /ledger-backfill:.*unknown argument/);
  });

  test('vision_success_prints_json_result_and_exits_zero', () => {
    // Arrange
    const root = newRoot();
    const slug = writeVision(root, 'cli-vision.md');

    // Act
    const out = spawnSync(process.execPath, [SCRIPT, '--vision', '--root', root], { encoding: 'utf8' });

    // Assert — success path prints the JSON {ledgered, skipped} and exits 0
    assert.equal(out.status, 0);
    const parsed = JSON.parse(out.stdout);
    assert.ok(parsed.ledgered.includes(slug));
    assert.equal(ledger.entryKind(ledger.readEntry(slug, root)), 'pipeline');
  });
});
