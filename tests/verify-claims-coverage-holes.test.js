'use strict';

/**
 * tests/verify-claims-coverage-holes.test.js — drive the repository's ONLY network path
 * OFFLINE (plan 00246, slice 12 of "close the coverage holes").
 *
 * THIS FILE PERFORMS NO NETWORK ACCESS, and it does not stub the fetcher to achieve that.
 * `src/scripts/verify-claims.js`'s `main()` calls `runVerification(process.cwd(), { gate:
 * true })` with no fetcher options, so the only honest way to run it under the gated suite
 * is to point it at a project that has NOTHING TO VERIFY: a temp fixture with no `skills/`
 * corpus. `collectCorpusClaims` then returns zero claims and `verifyClaims([], {})` spawns
 * one worker whose cursor is already past the end — it returns without issuing a request.
 * That was read and confirmed in `src/lib/claim-fetcher.js` (the worker loop) and
 * `src/lib/corpus-claims.js` (the walk returns early when `skills/` is absent) before this
 * file was written. The command's real network path is the one that runs; it simply has
 * nothing to fetch.
 *
 * RANGES COVERED (numbering from the 2026-08-31 gate report; the gate's own report, not
 * this comment, is the source of truth):
 *   103-107  the gate-ledger merge catch — a ledger-write failure must not crash the run
 *   155-159  `writeLedger`'s catch — same, for the verification ledger
 *   163-168  `main()` — the human-run path, folding the offline gate into the exit code
 *   170-175  the `require.main === module` entry and its `.catch`
 *
 * RANGES LEFT UNCOVERED: none in this file's target. No branch here is permission-gated,
 * so every case runs on every platform (the ledger faults are injected by planting a FILE
 * where a directory belongs, and by a guarded `safeFs` mock — never by permission bits,
 * which do not work under root or on Windows).
 *
 * Nothing is written outside `os.tmpdir()`. The repository's own
 * `.ctoc/verification/` ledgers are never read for a verdict, written, or deleted:
 * every case runs against a fresh temp root. Argument arrays, no shell.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO, 'src', 'scripts', 'verify-claims.js');
const { runVerification } = require('../src/scripts/verify-claims');
const safeFs = require('../src/lib/safe-fs');
const claimLedger = require('../src/lib/claim-ledger');

/** A fresh empty project root under the OS temp dir. */
function makeRoot(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ctoc-vc-${tag}-`));
}

function rimraf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Run a node program with an argument array (no shell) and return its result. */
function runNode(args, cwd) {
  const res = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env },
    timeout: 60000,
  });
  assert.equal(res.signal, null, `child killed by signal ${res.signal}`);
  return {
    status: typeof res.status === 'number' ? res.status : null,
    stdout: String(res.stdout || ''),
    stderr: String(res.stderr || ''),
  };
}

const COUNTS_LINE =
  '[CTOC claims] verified 0  refuted 0  unverifiable 0  (registry-version 0, url-live 0)';

describe('verify-claims: the command itself, run offline against a corpus with nothing to verify', () => {
  it('runs end to end and prints all three counts including the zeros, then exits clean', () => {
    const root = makeRoot('main');
    try {
      const out = runNode([SCRIPT], root);

      assert.equal(
        out.stdout.split('\n')[0],
        COUNTS_LINE,
        `the three counts always render, zeros included; got:\n${out.stdout}`,
      );
      assert.ok(
        !/GATE /.test(out.stdout),
        `the gate must pass over the ledger this very run wrote; got:\n${out.stdout}`,
      );
      assert.equal(out.status, 0, `a clean gate with no refutation exits 0; stderr=${out.stderr}`);
      assert.ok(!/verification run failed/.test(out.stderr), 'the run must not have failed');

      // The happy path of BOTH writers ran in that child.
      const report = JSON.parse(
        fs.readFileSync(path.join(root, '.ctoc', 'verification', 'ledger.json'), 'utf8'),
      );
      assert.deepEqual(report.counts.verified, 0);
      assert.deepEqual(report.verdicts, []);
      const gateLedgerFile = path.join(root, '.ctoc', 'verification', 'claims-ledger.json');
      const gated = JSON.parse(fs.readFileSync(gateLedgerFile, 'utf8'));
      assert.equal(gated.generator, 'src/scripts/verify-claims.js');
      assert.deepEqual(gated.claims, {}, 'no corpus claims ⇒ an empty ledger, never a fabricated one');
    } finally {
      rimraf(root);
    }
  });

  it('both ledger writes failing does not crash the run — the report still prints and the gate failure reaches the exit code', () => {
    const root = makeRoot('ledgerfail');
    try {
      // A FILE where `.ctoc/verification/` belongs: every write beneath it throws, on
      // every platform, with no permission bits involved.
      fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
      fs.writeFileSync(path.join(root, '.ctoc', 'verification'), 'not a directory\n');

      const out = runNode([SCRIPT], root);

      assert.equal(
        out.stdout.split('\n')[0],
        COUNTS_LINE,
        `the report is already built when a ledger write fails; got:\n${out.stdout}`,
      );
      assert.ok(
        !/verification run failed/.test(out.stderr),
        `a ledger-write failure must not crash the run; stderr=${out.stderr}`,
      );
      assert.ok(
        /\[CTOC claims\] GATE ledger-absent: /.test(out.stdout),
        `the unwritten ledger is REPORTED, never hidden; got:\n${out.stdout}`,
      );
      assert.equal(
        out.status,
        1,
        `the human-run path folds the offline gate into the exit code; stderr=${out.stderr}`,
      );
      assert.equal(
        fs.readFileSync(path.join(root, '.ctoc', 'verification'), 'utf8'),
        'not a directory\n',
        'the run must not have clobbered what stood in the ledger directory\'s place',
      );
    } finally {
      rimraf(root);
    }
  });

  it('a failure inside the verification run exits 1 and names it on stderr', () => {
    const root = makeRoot('throw');
    const preloadDir = makeRoot('preload');
    try {
      // Seed the loader cache so the collector THROWS WHEN CALLED — inside `main()`, so the
      // rejection reaches the entry point's `.catch`. A throw at require time would abort
      // before `main()` ever ran and would prove nothing about that handler.
      const preload = path.join(preloadDir, 'throwing-collector.js');
      fs.writeFileSync(preload, [
        "'use strict';",
        "const path = require('path');",
        'const REPO = process.env.CTOC_TEST_REPO;',
        "const target = require.resolve(path.join(REPO, 'src', 'lib', 'corpus-claims.js'));",
        'require.cache[target] = {',
        '  id: target, filename: target, loaded: true,',
        "  exports: { collectCorpusClaims() { throw new Error('SIMULATED_CORPUS_FAILURE'); } },",
        '};',
        '',
      ].join('\n'));

      const res = spawnSync(process.execPath, ['--require', preload, SCRIPT], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, CTOC_TEST_REPO: REPO },
        timeout: 60000,
      });
      assert.equal(res.signal, null, `child killed by signal ${res.signal}`);

      assert.match(
        String(res.stderr || ''),
        /\[CTOC claims\] verification run failed: SIMULATED_CORPUS_FAILURE/,
        'the failure is NAMED on stderr, never swallowed',
      );
      assert.equal(res.status, 1, 'a failed verification run exits 1');
    } finally {
      rimraf(root);
      rimraf(preloadDir);
    }
  });
});

describe('verify-claims: a ledger fault leaves the report intact (in process)', () => {
  it('a verification-ledger write failure is absorbed — the result is complete and the gate ledger still lands', async (t) => {
    const root = makeRoot('inproc-report');
    try {
      const realWrite = safeFs.writeFileSync;
      let blocked = 0;
      t.mock.method(safeFs, 'writeFileSync', (file, ...rest) => {
        // Guarded: ONLY the human-report ledger of THIS fixture fails. An unguarded mock
        // would break every other write in the process.
        if (String(file).startsWith(root) && path.basename(String(file)) === 'ledger.json') {
          blocked += 1;
          throw new Error('injected ledger-write failure');
        }
        return realWrite(file, ...rest);
      });

      const r = await runVerification(root, { claims: [], print: false });

      assert.equal(blocked, 1, 'the injected fault must actually have fired');
      assert.equal(r.counts.refuted, 0);
      assert.equal(r.exitCode, 0, 'a ledger-write failure is not itself a finding');
      assert.equal(r.lines[0], COUNTS_LINE, 'the report survives the failed write');
      assert.equal(
        fs.existsSync(path.join(root, '.ctoc', 'verification', 'ledger.json')),
        false,
        'the write that was made to fail did not happen',
      );
      assert.equal(
        fs.existsSync(path.join(root, '.ctoc', 'verification', 'claims-ledger.json')),
        true,
        'the OTHER ledger is unaffected — the catch is scoped to the one write',
      );
    } finally {
      rimraf(root);
    }
  });

  it('a gate-ledger merge failure is absorbed — the run resolves and the lines are intact', async (t) => {
    const root = makeRoot('inproc-gate');
    try {
      let blocked = 0;
      t.mock.method(claimLedger, 'writeLedgerFile', () => {
        blocked += 1;
        throw new Error('injected gate-ledger merge failure');
      });

      const r = await runVerification(root, { claims: [], print: false });

      assert.equal(blocked, 1, 'the injected fault must actually have fired');
      assert.equal(r.lines[0], COUNTS_LINE);
      assert.equal(r.exitCode, 0, 'without the gate flag a merge failure never fails the run');
      assert.ok(
        r.lines.some((l) => /GATE ledger-absent: /.test(l)),
        `the missing gate ledger is REPORTED even though the write was absorbed; got ${JSON.stringify(r.lines)}`,
      );
      assert.equal(
        fs.existsSync(path.join(root, '.ctoc', 'verification', 'ledger.json')),
        true,
        'the human report ledger still landed — the merge catch swallowed only its own failure',
      );
    } finally {
      rimraf(root);
    }
  });
});
