'use strict';

/**
 * remainder-security-tooling-coverage.test.js
 *
 * Slice 17 of "close the coverage holes": the twelve modules that SCAN for secrets and
 * vulnerabilities, DETECT the project's tools, and RECORD the audit chain. Every range the
 * coverage report left dark on 2026-08-31 is classified here — (a) covered by a behavioural
 * case below, (b) permission-gated or terminal-only and named rather than faked, or
 * (c) unreachable through the module's public surface and REPORTED, never deleted.
 *
 * THE DIRECTION EVERY CASE ASSERTS. These are security tools, so a fault arm is asserted in
 * the direction that never lets "the scan did not run" read as "the scan found nothing".
 * A scanner that could not look reports NOT VERIFIED / an error; it never returns a clean
 * empty result. A detector with no evidence returns no toolchain; it never fabricates one.
 *
 * FIXTURE RULE FOR SECRET-SHAPED VALUES. No fixture in this file carries a realistic
 * provider credential — no `sk_live_`, no `ghp_`, no `AKIA`. The platform's push protection
 * rejects a push containing one and the bypass is never used. A generic high-entropy string
 * exercises the same detector path. The external-tool cases here fake the tool's REPORT at
 * the child_process boundary and never put a credential in it at all.
 *
 * NO EXTERNAL SCANNER RUNS, AND NOTHING TOUCHES THE NETWORK. Every semgrep / bandit / gosec /
 * npm-audit / pip-audit / cargo-audit / osv-scanner / trufflehog / detect-secrets invocation
 * is intercepted at `child_process.{execSync,execFileSync}` — the modules destructure both at
 * load time, so the fake is installed BEFORE a fresh `require`, exactly as the sibling
 * `sast-runner-coverage` suite does. The only real child process spawned is `node` running
 * CTOC's OWN `src/lib/tool-detector.js`. Filesystem faults are injected on `safe-fs` guarded
 * by a path sentinel so no unrelated read in the process is disturbed. Every fake is restored
 * in a `finally`, and everything written lives under `os.tmpdir()`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * CLASSIFICATION OF EVERY RANGE THIS SLICE OWNS
 *
 * (a) COVERED BY A CASE BELOW
 *   audit-chain.js 117-118        reclaimIfStale's catch — a lock it cannot stat is NOT
 *                                 reclaimed and the append refuses rather than proceeding.
 *   audit-chain.js 211            chainHeadFromLog's genesis fallback — a zero-byte log.
 *   tool-detector.js 282-283      hasTypeScriptEvidence's catch — an unreadable project
 *                                 directory yields NO TypeScript evidence, so no phantom
 *                                 `tsc --noEmit` toolchain is fabricated.
 *   tool-detector.js 688-690      the module's command-line entry point.
 *   sast-runner.js 578-580        runLanguageScanner's switch default — a route naming a
 *                                 tool the dispatcher cannot parse never counts as run.
 *   sca-runner.js 375-377         runNativeScanner's switch default — the same, for the
 *                                 dependency scanner.
 *   secrets-scanner.js 1164-1165  runWithExternalTools' detect-secrets catch — a malformed
 *                                 report is recorded as an error, never a clean scan.
 *   quality-state.js 259-262      acquireLock's exhausted-attempts return — contention it
 *                                 cannot resolve returns false, never a second lock holder.
 *   eu-ai-act-helpers.js 324-326  readEnforcementDates' catch — an unreadable profile
 *                                 yields all-null dates with `verified:false`, never an
 *                                 invented enforcement date.
 *   framework-detector.js 298-300 SEE (c): unreachable. No case.
 *   framework-security-checker.js 452-453  an entry whose type cannot be read is skipped
 *                                 and the walk continues; it never truncates the scan.
 *   deployment.js 462-463         scriptInterpreter's unknown-extension fallback — the file
 *                                 is run directly, with no shell and no guessed interpreter.
 *   regulatory-regime.js 155      nextNonEmpty's end-of-input return — a profile whose last
 *                                 line is an empty-valued key parses as an empty map.
 *
 * (b) PERMISSION-GATED OR TERMINAL-ONLY — none in this family. No range here needs root, a
 *     non-POSIX platform, or an interactive terminal, so nothing is skipped and this file
 *     contains no conditional skip.
 *
 * (c) UNREACHABLE THROUGH THE PUBLIC SURFACE — REPORTED, NOT DELETED, NOT FAKED
 *   audit-chain.js 203-204        chainHeadFromLog's `continue` over an unparseable line.
 *                                 Its only caller (appendDispatch) runs readLogLinesHealed
 *                                 FIRST, which strips exactly the same trailing unparseable
 *                                 lines using the same JSON.parse over the same split, and
 *                                 renames an entirely-corrupt log aside. So by the time
 *                                 chainHeadFromLog reads, the last line always parses and
 *                                 the backward scan returns on its first iteration. Belt
 *                                 and braces behind a heal that already happened.
 *   sast-runner.js 583-584        runLanguageScanner's catch. runBandit, runGosec and
 *                                 runESLintSecurity are total: each wraps its whole body,
 *                                 including its own parse, and records failures by pushing
 *                                 to this.errors rather than throwing. Nothing they can do
 *                                 reaches this catch; it is the net for a future inner
 *                                 method that does throw.
 *   sca-runner.js 380-381         runNativeScanner's catch — identical shape. runNpmAudit,
 *                                 runPipAudit and runCargoAudit are total for the same
 *                                 reason (and _detectRequirementFiles, the one call outside
 *                                 runPipAudit's try, guards its own reads).
 *   secrets-scanner.js 1154-1155  runWithExternalTools' trufflehog catch. runTruffleHog is
 *                                 total — outputFromError is total, the per-line parse is
 *                                 guarded, and the noise counter cannot throw. Its sibling
 *                                 detect-secrets arm IS reachable (covered above) only
 *                                 because runDetectSecrets iterates each `results` value
 *                                 without checking it is an array.
 *   step-13-verify.js 134-135     runVerify's catch around tryCommand. tryCommand is total:
 *                                 every path, including the timeout and capture-overflow
 *                                 arms, RETURNS a result object; resolveVerifyTimeout cannot
 *                                 throw on any environment value.
 *   framework-detector.js 298-300 detect()'s react-cra bundler-evidence disqualifier. Its
 *                                 condition cannot be true. react-cra outranks react-vite
 *                                 (checked first, and `>` is strict) only by the +10 that
 *                                 `hasDevDependency('react-scripts')` awards; the
 *                                 disqualifier then asks `hasDependency('react-scripts')`,
 *                                 which reads devDependencies as well as the other three
 *                                 maps, so it is already true. See the FINDING below — the
 *                                 same asymmetry has a live, user-visible consequence.
 *
 * FINDING FOR THE HUMAN (adjacent to the dead range above; NOT covered by a case here
 * because `src/lib/framework-detector.js` is not among this plan's declared files and a
 * test asserting today's wrong answer would pin the bug in place). Create React App's own
 * generator puts `react-scripts` in `dependencies`. Measured on this tree: such a project
 * scores react-cra 40 (the react dependency alone — `hasDevDependency` does not see
 * `dependencies`), ties react-vite at 40, loses the tie to react-vite on priority order,
 * and is then nulled by the react-vite Vite-evidence guard. `detect()` returns **null** for
 * a canonical Create React App project. Moving react-scripts to devDependencies — the shape
 * the existing regression test uses — detects react-cra correctly. This needs its own plan.
 *
 * Line numbers are from the 2026-08-31 gate run and move with every commit; the behaviour
 * each case asserts, not the number, is what holds.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const safeFs = require('../src/lib/safe-fs');

const REPO_ROOT = path.join(__dirname, '..');
const SAST_PATH = require.resolve('../src/lib/sast-runner');
const SCA_PATH = require.resolve('../src/lib/sca-runner');
const SECRETS_PATH = require.resolve('../src/lib/secrets-scanner');
const QUALITY_STATE_PATH = require.resolve('../src/lib/quality-state');

const REAL_EXEC_SYNC = cp.execSync;
const REAL_EXEC_FILE_SYNC = cp.execFileSync;

/** An isolated fixture project under os.tmpdir(). Never written to inside the repository. */
function makeFixture(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeFixture(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

/**
 * Reload a module AFTER the child_process fakes are installed: sast-runner, sca-runner and
 * secrets-scanner each destructure execSync/execFileSync at load time, so a fake installed
 * after the first require would never be seen.
 */
function freshRequire(modulePath) {
  delete require.cache[modulePath];
  return require(modulePath);
}

function restoreChildProcess(modulePath) {
  cp.execSync = REAL_EXEC_SYNC;
  cp.execFileSync = REAL_EXEC_FILE_SYNC;
  delete require.cache[modulePath];
}

// ── audit-chain.js ───────────────────────────────────────────────────────────────────────

test('audit-chain: a lock whose age cannot be read is NOT reclaimed and the append refuses '
  + 'rather than writing an unserialized entry', () => {
  const dir = makeFixture('ctoc-s17-chain-lock-');
  const lockPath = path.join(dir, '.ctoc', 'audit', 'chain.lock');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999 }));

  const realStatSync = safeFs.statSync;
  safeFs.statSync = (p, o) => {
    if (String(p) === lockPath) {
      throw Object.assign(new Error('injected: lock metadata unreadable'), { code: 'EACCES' });
    }
    return realStatSync(p, o);
  };

  try {
    const auditChain = require('../src/lib/audit-chain');
    assert.throws(
      () => auditChain.appendDispatch(
        dir,
        { dispatch_id: 'd-unreadable-lock', timestamp: '2026-01-01T00:00:00.000Z' },
        { lockRetries: 0, lockBackoffMs: 0 }
      ),
      /could not acquire the chain lock[\s\S]*refusing to append unlocked/,
      'the stat fault must be absorbed by reclaimIfStale and surface as the lock refusal — '
      + 'never as the raw filesystem error, and never as a successful append'
    );
    assert.equal(fs.existsSync(lockPath), true,
      'a lock whose age could not be read must be left in place — reclaiming it blind would '
      + 'steal a live holder\'s lock and yield two writers on a tamper-evident chain');
    assert.equal(fs.existsSync(path.join(dir, '.ctoc', 'audit', 'chain.jsonl')), false,
      'nothing may be appended while the lock is unresolved');
  } finally {
    safeFs.statSync = realStatSync;
    removeFixture(dir);
  }
});

test('audit-chain: a zero-byte chain log chains from genesis at sequence 1 rather than '
  + 'inventing a predecessor', () => {
  const dir = makeFixture('ctoc-s17-chain-empty-');
  const logPath = path.join(dir, '.ctoc', 'audit', 'chain.jsonl');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, '');

  try {
    const auditChain = require('../src/lib/audit-chain');
    const entry = auditChain.appendDispatch(
      dir, { dispatch_id: 'd-empty-log', timestamp: '2026-01-02T00:00:00.000Z' }
    );
    assert.equal(entry.sequence, 1,
      'an existing but empty log holds no entries, so the next entry is the first');
    assert.equal(entry.previous_chain_hash, auditChain.GENESIS_HASH,
      'the predecessor of the first entry is genesis — never a fabricated hash');
    assert.equal(auditChain.verifyChain(dir).ok, true,
      'the chain written over a zero-byte log must verify');
  } finally {
    removeFixture(dir);
  }
});

// ── tool-detector.js ─────────────────────────────────────────────────────────────────────

test('tool-detector: an unreadable project directory yields no TypeScript evidence, so no '
  + 'phantom typecheck toolchain is fabricated', () => {
  const dir = makeFixture('ctoc-s17-td-unreadable-');
  fs.writeFileSync(path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.0' }));

  const realReaddirSync = safeFs.readdirSync;
  safeFs.readdirSync = (p, o) => {
    if (String(p) === dir) {
      throw Object.assign(new Error('injected: directory unreadable'), { code: 'EACCES' });
    }
    return realReaddirSync(p, o);
  };

  try {
    const toolDetector = require('../src/lib/tool-detector');
    const result = toolDetector.detectTools(dir);
    assert.ok(result.languages.includes('typescript'),
      'a bare package.json still LISTS typescript (the legacy back-compat nuance) — which is '
      + 'exactly why the evidence check has to be the thing that refuses');
    assert.equal(result.tools.typescript, undefined,
      'with the directory unreadable there is no TypeScript evidence, so no typescript '
      + 'toolchain may be emitted: an unreadable directory is not evidence of a tsc project');
    assert.ok(result.tools.javascript,
      'the unreadable-directory fault is confined to the TypeScript evidence check');
  } finally {
    safeFs.readdirSync = realReaddirSync;
    removeFixture(dir);
  }
});

test('tool-detector: the command-line entry point runs the detection and prints its result',
  () => {
    const dir = makeFixture('ctoc-s17-td-cli-');
    fs.writeFileSync(path.join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0' }));
    try {
      const run = cp.spawnSync(
        process.execPath, [path.join(REPO_ROOT, 'src', 'lib', 'tool-detector.js')],
        { cwd: dir, encoding: 'utf8', timeout: 120000 }
      );
      assert.equal(run.error, undefined, 'the entry point must launch');
      assert.equal(run.status, 0, `the entry point must exit 0; stderr: ${run.stderr}`);
      assert.match(run.stdout, /Tool Detection Results/,
        'the entry point prints the detection report a human reads');
      assert.match(run.stdout, /Languages:[^\n]*javascript/,
        'and the report names what it detected in the directory it was pointed at');
    } finally {
      removeFixture(dir);
    }
  });

// ── sast-runner.js ───────────────────────────────────────────────────────────────────────

test('sast-runner: a language routed to a native scanner the dispatcher cannot run reports '
  + 'NOT RUN and never counts as a scanner that ran', async () => {
  const dir = makeFixture('ctoc-s17-sast-');
  const commands = [];
  cp.execSync = (command) => {
    commands.push(String(command));
    if (String(command) === 'mvn --version') return 'Apache Maven 3.9.6';
    throw Object.assign(new Error('injected: tool absent'), { status: 127 });
  };
  cp.execFileSync = (file, args) => {
    commands.push([file, ...(args || [])].join(' '));
    throw new Error('no scanner may be launched from this case');
  };

  try {
    const { SASTRunner } = freshRequire(SAST_PATH);
    // The route table and the dispatcher's switch are two places; this subclass is the
    // divergence between them that the `default:` arm exists for — a route naming a tool
    // (spotbugs) whose output the dispatcher has no parser for. Only the ROUTE is overridden;
    // runLanguageScanner, the method under test, runs for real.
    class DivergentRouteRunner extends SASTRunner {
      securityRouteFor() { return { native: 'spotbugs', semgrepUniversal: false }; }
    }
    const runner = new DivergentRouteRunner(dir, {});
    const ran = await runner.runLanguageScanner('java');

    assert.equal(ran, false,
      'a tool CTOC cannot parse must report NOT RUN — counting it would let run() report the '
      + 'project clean on the strength of a scanner whose output was never read');
    assert.deepEqual(runner.findings, [],
      'and it must fabricate no finding');
    assert.deepEqual(commands, ['mvn --version'],
      'only the availability probe may run: the unparseable tool itself is never launched');
  } finally {
    restoreChildProcess(SAST_PATH);
    removeFixture(dir);
  }
});

// ── sca-runner.js ────────────────────────────────────────────────────────────────────────

test('sca-runner: a dependency scanner routed to a native tool the dispatcher cannot run '
  + 'reports NOT RUN and launches nothing', async () => {
  const dir = makeFixture('ctoc-s17-sca-');
  const commands = [];
  cp.execFileSync = (file, args) => {
    commands.push([file, ...(args || [])].join(' '));
    if (file === 'osv-scanner') return 'osv-scanner version 1.9.0';
    throw new Error('no scanner may be launched from this case');
  };

  let sca;
  try {
    sca = freshRequire(SCA_PATH);
    // The real divergence, expressed through the module's own exported tables: a language
    // whose route names a parseable native tool the switch has no case for. This is the
    // future edit — a tool added to the tables and forgotten in the dispatcher — that the
    // `default:` arm has to survive.
    sca.SCA_TOOL_CONFIGS.fixturelang = { native: 'osv-scanner' };
    sca.PARSEABLE_NATIVE_TOOLS.add('osv-scanner');

    const runner = new sca.SCARunner(dir, {});
    const ran = await runner.runNativeScanner('fixturelang');

    assert.equal(ran, false,
      'a native tool with no parser must report NOT RUN, mirroring sast-runner — a scanner '
      + 'that was never read must never contribute to a clean verdict');
    assert.deepEqual(runner.findings, [], 'and it must fabricate no finding');
    assert.deepEqual(commands, ['osv-scanner --version'],
      'only the availability probe may run: the unparseable tool itself is never launched');
  } finally {
    if (sca) {
      delete sca.SCA_TOOL_CONFIGS.fixturelang;
      sca.PARSEABLE_NATIVE_TOOLS.delete('osv-scanner');
    }
    restoreChildProcess(SCA_PATH);
    removeFixture(dir);
  }
});

// ── secrets-scanner.js ───────────────────────────────────────────────────────────────────

test('secrets-scanner: a malformed detect-secrets report is recorded as a failed external '
  + 'scan, never returned as a clean one', async () => {
  const dir = makeFixture('ctoc-s17-secrets-');
  fs.writeFileSync(path.join(dir, 'app.js'), 'const port = 8080;\n');

  cp.execSync = (command) => {
    if (String(command) === 'detect-secrets --version') return '1.5.0\n';
    throw Object.assign(new Error('injected: tool absent'), { status: 127 });
  };
  // A report whose `results` values are not arrays — the shape a changed tool version
  // produces. It carries no secret material at all, realistic or otherwise.
  cp.execFileSync = (file) => {
    if (file === 'detect-secrets') return JSON.stringify({ results: { 'app.js': null } });
    throw new Error('no other external tool may be launched from this case');
  };

  try {
    const { SecretsScanner } = freshRequire(SECRETS_PATH);
    const scanner = new SecretsScanner(dir, {});
    const result = await scanner.runWithExternalTools();

    const recorded = result.errors.filter((e) => e.tool === 'detect-secrets');
    assert.equal(recorded.length, 1,
      'a report the scanner could not walk must be RECORDED — an external secret scan that '
      + 'blew up must never disappear into a zero-finding result that reads as clean');
    assert.equal(recorded[0].kind, 'error');
    assert.ok(recorded[0].error && recorded[0].error.length > 0,
      'the record must carry a reason a human can act on');
    assert.ok(Array.isArray(result.findings),
      'and the surrounding scan still returns its own findings rather than crashing');
  } finally {
    restoreChildProcess(SECRETS_PATH);
    removeFixture(dir);
  }
});

// ── quality-state.js ─────────────────────────────────────────────────────────────────────

test('quality-state: lock contention it cannot resolve returns false — never a second holder',
  () => {
    const dir = makeFixture('ctoc-s17-qstate-');
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    const originalCwd = process.cwd();
    const realOpenSync = safeFs.openSync;
    const realLog = console.log;
    const logged = [];
    let exclusiveCreateAttempts = 0;

    process.chdir(dir);
    try {
      const qualityState = freshRequire(QUALITY_STATE_PATH);
      const lockSuffix = path.join('quality-state', '.lock');
      // The livelock the exhausted-attempts arm documents: every exclusive create loses the
      // race (EEXIST), and by the time the holder is inspected the lock is gone again — a
      // concurrent reclaimer, driven deterministically here.
      safeFs.openSync = (file, flags) => {
        if (String(file).endsWith(lockSuffix)) {
          exclusiveCreateAttempts++;
          throw Object.assign(new Error('injected: lock exists'), { code: 'EEXIST' });
        }
        return realOpenSync(file, flags);
      };
      console.log = (...args) => { logged.push(args.join(' ')); };

      const acquired = qualityState.acquireLock();

      console.log = realLog;
      assert.equal(acquired, false,
        'a lock that could not be taken must report NOT acquired — returning true here would '
        + 'put two quality runs inside the same read-modify-write critical section');
      assert.ok(exclusiveCreateAttempts > 1,
        'the acquire must be RETRIED before it gives up, not abandoned on the first race');
      assert.ok(logged.some((line) => /could not acquire lock/.test(line)),
        'and the caller is told why, in the terminal, rather than silently proceeding');
      assert.equal(fs.existsSync(path.join(dir, '.ctoc', 'quality-state', '.lock')), false,
        'a failed acquire leaves no lock of its own behind');
    } finally {
      console.log = realLog;
      safeFs.openSync = realOpenSync;
      process.chdir(originalCwd);
      delete require.cache[QUALITY_STATE_PATH];
      removeFixture(dir);
    }
  });

// ── eu-ai-act-helpers.js ─────────────────────────────────────────────────────────────────

test('eu-ai-act-helpers: a profile that cannot be read yields all-null dates marked '
  + 'unverified, never an invented enforcement date', () => {
  const dir = makeFixture('ctoc-s17-euaia-');
  // A path that EXISTS but cannot be read as a file: a real fault, no injection needed.
  const profilePath = path.join(dir, 'eu-ai-act.yaml');
  fs.mkdirSync(profilePath);

  try {
    const helpers = require('../src/lib/eu-ai-act-helpers');
    const dates = helpers.readEnforcementDates(profilePath);
    assert.deepEqual(
      {
        art5_prohibitions: dates.art5_prohibitions,
        art4_ai_literacy: dates.art4_ai_literacy,
        chapter_v_gpai: dates.chapter_v_gpai,
        annex_iii_high_risk: dates.annex_iii_high_risk,
        effective_date: dates.effective_date,
      },
      {
        art5_prohibitions: null,
        art4_ai_literacy: null,
        chapter_v_gpai: null,
        annex_iii_high_risk: null,
        effective_date: null,
      },
      'a regulatory date that could not be read is null — a date is never guessed, and the '
      + 'module carries no fallback literal to fall back to'
    );
    assert.equal(dates.verified, false,
      'and the result says plainly that nothing was verified');
    assert.equal(dates.source, profilePath,
      'while still naming the profile it failed to read, so the failure is traceable');
  } finally {
    removeFixture(dir);
  }
});

// ── framework-security-checker.js ────────────────────────────────────────────────────────

test('framework-security-checker: a directory entry whose type cannot be read is skipped and '
  + 'the walk continues over the rest of the directory', () => {
  const dir = makeFixture('ctoc-s17-fsc-');
  fs.writeFileSync(path.join(dir, '.env'), 'PORT=8080\n');
  fs.writeFileSync(path.join(dir, 'app.js'), 'const port = 8080;\n');

  const realReaddirSync = safeFs.readdirSync;
  safeFs.readdirSync = (p, options) => {
    const entries = realReaddirSync(p, options);
    if (String(p) === dir) {
      const unclassifiable = {
        name: 'unclassifiable.js',
        isDirectory() { throw new Error('injected: entry type unavailable'); },
        isFile() { throw new Error('injected: entry type unavailable'); },
      };
      return [unclassifiable, ...entries];
    }
    return entries;
  };

  try {
    const { FrameworkSecurityChecker } = require('../src/lib/framework-security-checker');
    const checker = new FrameworkSecurityChecker(dir, {});
    const collected = checker.collectFiles().map((f) => path.basename(f)).sort();

    assert.deepEqual(collected, ['.env', 'app.js'],
      'the entry that could not be classified is skipped — and, crucially, the entries AFTER '
      + 'it are still collected: one bad entry must not silently truncate a security scan');
    assert.ok(!collected.includes('unclassifiable.js'),
      'an entry that cannot be shown to be a file is never scanned as one');
  } finally {
    safeFs.readdirSync = realReaddirSync;
    removeFixture(dir);
  }
});

// ── deployment.js ────────────────────────────────────────────────────────────────────────

test('deployment: a deploy script with an unrecognised extension is executed directly, with '
  + 'no interpreter guessed and no shell', () => {
  const deployment = require('../src/lib/deployment');
  const scriptPath = path.join(os.tmpdir(), 'ctoc-s17-deploy', 'release.custom');

  const posix = deployment.scriptInterpreter(scriptPath, 'linux');
  assert.deepEqual(posix, { file: scriptPath, args: [] },
    'an unknown extension runs the file itself — the operating system\'s shebang handling '
    + 'decides, and CTOC never guesses an interpreter it has no evidence for');

  const windows = deployment.scriptInterpreter(scriptPath, 'win32');
  assert.deepEqual(windows, { file: scriptPath, args: [] },
    'and the fallback is platform-independent: no POSIX shell is conjured on Windows');

  assert.ok(!posix.args.some((a) => a === '-c'),
    'nothing resembling a shell invocation may be produced — a deploy script path is '
    + 'configuration, and a shell would make it an injection surface');
});

// ── regulatory-regime.js ─────────────────────────────────────────────────────────────────

test('regulatory-regime: a profile whose last line is an empty-valued key parses as an empty '
  + 'map and the rest of the profile survives', () => {
  const dir = makeFixture('ctoc-s17-regime-');
  const profilesDir = path.join(dir, '.ctoc', 'regulatory-regimes');
  fs.mkdirSync(profilesDir, { recursive: true });
  // `overrides:` is the LAST line, so the list-or-map lookahead runs off the end of the file.
  fs.writeFileSync(path.join(profilesDir, 'fixture.yaml'),
    'name: fixture\nrequired_controls:\n  - audit_hash_chain\n  - iv_and_v\noverrides:\n');

  try {
    const regime = require('../src/lib/regulatory-regime');
    const profile = regime.loadProfile(dir, 'fixture');

    assert.deepEqual(profile.overrides, {},
      'with nothing after it to prove otherwise, a trailing empty key is a map, not a list');
    assert.deepEqual(profile.required_controls, ['audit_hash_chain', 'iv_and_v'],
      'and the controls declared before it are still parsed — a trailing empty key must '
      + 'never cost a profile the controls it activates');
    assert.equal(profile.name, 'fixture');
  } finally {
    removeFixture(dir);
  }
});
