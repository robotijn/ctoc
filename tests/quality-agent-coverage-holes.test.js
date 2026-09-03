'use strict';

/**
 * THE DARK RANGES IN THE QUALITY AGENT — one behavioural case per uncovered range.
 *
 * `src/lib/quality-agent.js` is the module that runs lint, type check and the test
 * selection on every `/ctoc:push` and on the detached git post-commit hook. Its verdict
 * gates the push. Measured by the gate on 2026-09-03 it read 96.82 % line coverage, with
 * these uncovered ranges — re-derived from the gate's own report, NOT from the plan
 * (the plan's list was measured on 2026-08-31 and had already drifted):
 *
 *   250-251 · 263-264 · 769-770 · 951-970 · 1062-1063 · 1208-1211 · 1697-1699 ·
 *   1714-1731 · 1749-1752
 *
 * CLASSIFICATION — every range is (a) reachable behaviour, and every one is covered here
 * by a test a mutation would break. None is permission-gated, terminal-only or dead.
 *
 *   250-251   parseConfiguredCommand refuses a NEWLINE in a configured command.
 *             → "a configured command carrying a newline is REFUSED, never run"
 *   263-264   parseConfiguredCommand refuses an UNTERMINATED QUOTE.
 *             → "a configured command with an unterminated quote is REFUSED, never run"
 *   769-770   runSpecificTests: the runner exited 0, reported a summary, and its fail
 *             counter could not be read → UNCERTIFIED, never green.
 *             → "an illegible fail counter is not a pass" (+ its legible contrast case)
 *   951-970   runSmartTests: zero affected tests (the hash cache is still updated), a
 *             non-empty affected set (only those tests run), and a FAILING affected run
 *             (the hash cache is NOT updated).
 *   1062-1063 readCommittedBlob: a blob that cannot be read at its revision returns null,
 *             so the delta scan continues instead of recording a scan failure.
 *   1208-1211 runSecurityScan: an external secrets verifier that THROWS becomes a LOUD
 *             skip naming the tool — never a silent pass, never a crash.
 *   1697-1699 main(): a second agent, with the lock held by a live process, refuses to
 *             run and exits 0 without ever detecting tools.
 *   1714-1731 main(): the whole run — languages, the missing-tool list, the tiered checks
 *   1749-1752 and the summary — plus BOTH ends of the ship gate: green → it does NOT push
 *             (the human ships), red → it says so and never reaches the gate.
 *
 * TWO FINDINGS, RECORDED (neither is fixed here):
 *
 *   1. The plan named `1502-1505` (the framework-security error loop) as uncovered. On the
 *      2026-09-03 measurement it is covered. The plan's range list was stale; the gate's
 *      report is the source of truth, exactly as the parent plan says.
 *   2. Lines 952-959 — "No tests affected by changes." — cannot be reached through the
 *      REAL `findAffectedTests` (src/lib/coverage-map.js). Read it: a changed file is
 *      either mapped (adds >= 1 test), matched by heuristic (adds >= 1 test), or unmapped
 *      (sets `requiresFullSuite`), and runSmartTests has already returned at line 932 when
 *      the changed set is empty. So `tests: []` with `requiresFullSuite: false` is a shape
 *      only the module BOUNDARY can produce — it is inside coverage-map's documented
 *      return contract, and quality-agent is right to honour it. It is defensive coupling
 *      code, not dead code, and it is NOT deleted: it is driven here at that boundary.
 *
 * DISCIPLINE
 *  - No function under test is ever mocked. Faults are injected at true boundaries only:
 *    `child_process` (through the reload seam this repository already ships in
 *    tests/quality-agent-coverage.test.js — quality-agent destructures execSync/
 *    execFileSync at load, so the spy is installed and the module re-required), the
 *    `coverage-map` and `quality-state` module objects, and `SecretsScanner.prototype`.
 *    Every boundary fake is sentinel-guarded or scoped to one case, and every one is
 *    restored.
 *  - Nothing runs a real lint, type check or test suite. Fixture command tables declare
 *    inert node one-liners as an ARGV vector (shell:false) — never a shell string — and
 *    every fixture lives under os.tmpdir() and is removed after.
 *  - The spawned agent runs with PATH pointing at an EMPTY directory, so no external
 *    scanner, package manager or git binary can be found: every one degrades to its loud
 *    skip. That keeps these cases offline, deterministic and fast (~0.15 s each) instead
 *    of dependent on which tools happen to be installed on the machine.
 *  - A tripwire hashes this repository's `.ctoc/approvals`, `.ctoc/state/verify`,
 *    `.ctoc/streaming` and `plans/` before and after, and fails if this file changed a
 *    single byte of them.
 *  - The secret fixture is a GENERIC high-entropy AWS-shaped value, identical in shape to
 *    the sibling suite's PLANTED_AWS_KEY. It is not a real credential.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const AGENT_SCRIPT = path.join(REPO_ROOT, 'src', 'lib', 'quality-agent.js');
const QA_PATH = require.resolve('../src/lib/quality-agent');

const qualityAgent = require('../src/lib/quality-agent');
const qualityState = require('../src/lib/quality-state');
const coverageMap = require('../src/lib/coverage-map');
const { SecretsScanner } = require('../src/lib/secrets-scanner');

// A generic AWS Access Key ID shape (AKIA + 16 upper-alnum), no placeholder substring so
// the scanner's placeholder filter keeps it. NOT a real credential.
const PLANTED_AWS_KEY = 'AKIAJKQR7MNPZ2WXVBDF';

// The guard that keeps every boundary fake from touching anything but its own case.
const SENTINEL = 'CTOC-COVERAGE-HOLES-SENTINEL';

const REAL_EXECFILESYNC = cp.execFileSync;
const REAL_EXECSYNC = cp.execSync;
const REAL_FIND_AFFECTED = coverageMap.findAffectedTests;

const tempDirs = [];
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** An empty directory used as the child's whole PATH, so no external tool resolves. */
let EMPTY_BIN = '';

/** Swallow the agent's console chatter; return whatever the body returned. */
async function quiet(fn) {
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
}

/**
 * The reload seam (the shipped pattern from tests/quality-agent-coverage.test.js).
 * quality-agent destructures execSync/execFileSync at load, so a boundary fake is only
 * visible to a FRESH instance. The module under test is unchanged; only its collaborators
 * are replaced, and everything is restored in the finally.
 */
async function withBoundaries({ execFileSync, findAffectedTests }, fn) {
  if (execFileSync) cp.execFileSync = execFileSync;
  // Nothing in these cases may reach a shell. A shell command here is a test defect.
  cp.execSync = (command) => {
    throw new Error(`no shell command may run in this test (got: ${String(command).slice(0, 40)})`);
  };
  if (findAffectedTests) coverageMap.findAffectedTests = findAffectedTests;
  delete require.cache[QA_PATH];
  const qa = require(QA_PATH);
  try {
    return await fn(qa);
  } finally {
    cp.execFileSync = REAL_EXECFILESYNC;
    cp.execSync = REAL_EXECSYNC;
    coverageMap.findAffectedTests = REAL_FIND_AFFECTED;
    delete require.cache[QA_PATH];
  }
}

/** A failure exactly as execFileSync reports one: non-zero status, output on err.stdout. */
function execFailure(stdout) {
  return Object.assign(new Error('Command failed'), { status: 1, stdout });
}

/**
 * A fixture project the quality agent will root itself at: `.ctoc/settings.json` makes it
 * the project root, `package.json` makes javascript the detected language, and
 * `.ctoc/quality-config.yaml` declares the three phase commands as an inert argv vector.
 *
 * The command strings are deliberately NOT wrapped in outer quotes end-to-end: the
 * config reader strips a leading-and-trailing quote pair, so `"<node>" tools/x.js`
 * (quoted binary, bare operand) survives intact on a path containing spaces. There is no
 * `#` anywhere in a value, because an unquoted `#` after whitespace starts a YAML comment.
 */
function makeFixtureProject({ testScript }) {
  const dir = mkTmp('ctoc-qa-main-');
  fs.mkdirSync(path.join(dir, '.ctoc'));
  fs.mkdirSync(path.join(dir, 'tools'));
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.json'), '{}');
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'ctoc-quality-fixture', version: '1.0.0', private: true })
  );
  fs.writeFileSync(path.join(dir, 'tools', 'noop.js'), '');
  fs.writeFileSync(path.join(dir, 'tools', 'runner.js'), testScript);
  const node = process.execPath;
  fs.writeFileSync(path.join(dir, '.ctoc', 'quality-config.yaml'),
    'languages:\n'
    + '  javascript:\n'
    + `    lint: "${node}" tools/noop.js\n`
    + `    typecheck: "${node}" tools/noop.js\n`
    + `    test: "${node}" tools/runner.js\n`
    + '    coverage: ctoc-fixture-absent-tool --version\n');
  return dir;
}

/** Run the quality agent as the post-commit hook does: a real child process, no shell. */
function runAgent(cwd, args) {
  return cp.spawnSync(process.execPath, [AGENT_SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    // Spread process.env so the coverage instrumentation the gate injects survives into
    // the child; PATH alone is replaced so no external tool can be found.
    env: { ...process.env, PATH: EMPTY_BIN },
    timeout: 120000
  });
}

// ---------------------------------------------------------------------------
// Tripwire — this file must not change one byte of the repository's gate inputs.
// ---------------------------------------------------------------------------
const PROTECTED = [
  path.join(REPO_ROOT, '.ctoc', 'approvals'),
  path.join(REPO_ROOT, '.ctoc', 'state', 'verify'),
  path.join(REPO_ROOT, '.ctoc', 'streaming'),
  path.join(REPO_ROOT, 'plans')
];

function manifest(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // absent is a fact, recorded by its absence from the manifest
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        const st = fs.statSync(full);
        out.push(`${path.relative(REPO_ROOT, full)}|${st.size}|${st.mtimeMs}`);
      }
    }
  };
  walk(root);
  return out.join('\n');
}

function protectedManifest() {
  return PROTECTED.map(manifest).join('\n---\n');
}

let manifestBefore = '';

before(() => {
  EMPTY_BIN = mkTmp('ctoc-qa-emptybin-');
  manifestBefore = protectedManifest();
});

after(() => {
  const manifestAfter = protectedManifest();
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  assert.equal(manifestAfter, manifestBefore,
    'this test file must not write into the approval ledger, the verify evidence, the '
    + 'streaming store or plans/ — one of them changed');
});

// ===========================================================================
// 250-251 and 263-264 — a configured command carrying shell structure this module
// cannot faithfully turn into an argv vector is REFUSED, and refusing means NOT RUN.
// ===========================================================================
describe('a configured command this module cannot express as argv is refused, never run', () => {
  it('refuses a NEWLINE and never spawns the command (250-251)', () => {
    const dir = mkTmp('ctoc-qa-refuse-');
    const proof = path.join(dir, 'PROOF');
    const script = path.join(dir, 'write-proof.js');
    fs.writeFileSync(script,
      `require('fs').writeFileSync(${JSON.stringify(proof)}, 'ran');\n`);

    // The FIRST line is a runnable command. If a mutant split on the newline, or stripped
    // it, or fell back to a shell, the proof file would exist.
    const cmd = `"${process.execPath}" "${script}"\n"${process.execPath}" "${script}"`;

    const parsed = qualityAgent.parseConfiguredCommand(cmd);
    assert.equal(parsed.ok, false, 'a command carrying a newline must be refused');
    assert.match(parsed.reason, /newline/,
      'the refusal must name the newline, so the human can fix the config');
    assert.deepEqual(parsed.args, [], 'a refusal carries no argv');
    assert.equal(parsed.bin, '', 'a refusal carries no binary');

    const result = qualityAgent.runConfiguredCommand(cmd, { silent: true, label: 'lint' });
    assert.equal(result.success, false, 'a refused command is a FAILED check, never a skip');
    assert.equal(result.refused, true, 'the refusal must be visible to the caller');
    assert.match(result.error, /REFUSED \(not run/,
      'the message must say the command was not run');
    assert.equal(fs.existsSync(proof), false,
      'a refused command must never be executed — the proof file proves it ran');
  });

  it('refuses an UNTERMINATED QUOTE and never spawns the command (263-264)', () => {
    const dir = mkTmp('ctoc-qa-refuse-');
    const proof = path.join(dir, 'PROOF');
    const script = path.join(dir, 'write-proof.js');
    fs.writeFileSync(script,
      `require('fs').writeFileSync(${JSON.stringify(proof)}, 'ran');\n`);

    // A closing quote is missing. Every token is otherwise a legal argv element, so a
    // mutant that "tolerated" the dangling quote would run the command.
    const cmd = `"${process.execPath}" "${script}`;

    const parsed = qualityAgent.parseConfiguredCommand(cmd);
    assert.equal(parsed.ok, false, 'an unterminated quote must be refused');
    assert.match(parsed.reason, /unterminated quote/,
      'the refusal must name the unterminated quote');
    assert.deepEqual(parsed.args, []);

    const result = qualityAgent.runConfiguredCommand(cmd, { silent: true, label: 'typecheck' });
    assert.equal(result.success, false);
    assert.equal(result.refused, true);
    assert.equal(fs.existsSync(proof), false,
      'a refused command must never be executed');
  });
});

// ===========================================================================
// 769-770 — the runner exited 0 and reported a summary whose fail counter is illegible.
// That is UNCERTIFIED, not green. The contrast case (a legible `fail 0`) proves the
// verdict turns on the ILLEGIBILITY, not on the command.
// ===========================================================================
describe('runSpecificTests: an unreadable fail counter is not a pass', () => {
  function toolsRunning(scriptBody, dir) {
    const script = path.join(dir, 'runner.js');
    fs.writeFileSync(script, scriptBody);
    return {
      javascript: {
        // Quoted binary + quoted operand: one argv vector, shell:false, nothing to expand.
        test: `"${process.execPath}" "${script}"`
      }
    };
  }

  it('reports UNCERTIFIED when the runner exits 0 with a summary it cannot read (769-770)', async () => {
    const dir = mkTmp('ctoc-qa-unreadable-');
    // A node:test-shaped summary WITHOUT a readable fail counter: the dial is present
    // (`pass`), the number that decides the verdict is not.
    const tools = toolsRunning("console.log('\\u2139 pass 3');\n", dir);

    const result = await quiet(() => qualityAgent.runSpecificTests(tools, ['a.test.js']));

    assert.equal(result.passed, false,
      'exit 0 is the runner\'s CLAIM, not the verdict — an unread instrument cannot pass');
    assert.equal(result.undetermined, true,
      'the human must be told WHY it is not a pass');
    assert.equal(result.passCount, 0,
      'the unread runner contributes no passing tests, so the tally stays at 0');
    assert.match(result.output, /UNCERTIFIED/);
  });

  it('passes the same command once the fail counter is legible (the contrast case)', async () => {
    const dir = mkTmp('ctoc-qa-readable-');
    const tools = toolsRunning(
      "console.log('\\u2139 pass 3');\nconsole.log('\\u2139 fail 0');\n", dir);

    const result = await quiet(() => qualityAgent.runSpecificTests(tools, ['a.test.js']));

    assert.equal(result.passed, true, 'a legible fail 0 with exit 0 is a pass');
    assert.equal(result.passCount, 3, 'the pass count is READ from the runner, never assumed');
    assert.equal(result.undetermined, undefined);
  });
});

// ===========================================================================
// 951-970 — smart test selection: the empty affected set, the selected set, and the
// failing selected set. The hash cache is the thing a mutation would silently break:
// skipping the update makes every later run re-select everything; updating it after a
// FAILURE makes the failing file look unchanged and its tests never run again.
// ===========================================================================
describe('runSmartTests: the affected-test selection and its hash cache', () => {
  const CHANGED = `${SENTINEL}.js`;

  function gitFake(extra) {
    return (bin, args) => {
      if (bin === 'git') {
        const sub = args[0];
        if (sub === 'rev-parse') throw new Error('no upstream');
        if (sub === 'rev-list') return 'R1\n';
        if (sub === 'diff-tree') return `${CHANGED}\n`;
      }
      if (extra) return extra(bin, args);
      throw new Error(`unexpected command in this case: ${bin}`);
    };
  }

  /** coverage-map's documented return contract, produced only for the sentinel file. */
  function affectedFake(tests) {
    return (changedFiles, cachedHashes) => {
      if (changedFiles.some(f => String(f).includes(SENTINEL))) {
        return {
          tests,
          mappedFiles: [],
          unmappedFiles: [],
          fallbackTests: [],
          requiresFullSuite: false,
          reason: null
        };
      }
      return REAL_FIND_AFFECTED(changedFiles, cachedHashes);
    };
  }

  async function inFixture(fn) {
    const dir = mkTmp('ctoc-qa-smart-');
    fs.writeFileSync(path.join(dir, CHANGED), 'module.exports = 1;\n');
    const origCwd = process.cwd();
    process.chdir(dir);
    try {
      return await fn(dir);
    } finally {
      process.chdir(origCwd);
    }
  }

  it('an empty affected set is a zeroed PASS that still refreshes the hash cache (952-959)', async (t) => {
    const updates = [];
    t.mock.method(qualityState, 'getFileHashes', () => ({}));
    t.mock.method(qualityState, 'updateFileHashes', (h) => { updates.push(h); });

    const result = await inFixture(() => withBoundaries(
      { execFileSync: gitFake(), findAffectedTests: affectedFake([]) },
      qa => quiet(() => qa.runSmartTests({ javascript: { test: 'never-run' } }))
    ));

    assert.deepEqual(result, { passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0 },
      'zero affected tests is an explicit zeroed result — and NOT the cached result, which '
      + 'carries cached:true; a mutant merging the two branches would fail here');
    assert.equal('cached' in result, false,
      '"no tests were affected" and "nothing changed at all" are different facts');
    assert.equal(updates.length, 1,
      'the hash cache MUST be refreshed, or every later run re-selects everything');
    assert.ok(Object.keys(updates[0]).some(k => k.includes(SENTINEL)),
      'the refreshed cache must carry the file that changed');
  });

  it('a non-empty affected set runs ONLY those tests and refreshes the cache (961-970)', async (t) => {
    const updates = [];
    t.mock.method(qualityState, 'getFileHashes', () => ({}));
    t.mock.method(qualityState, 'updateFileHashes', (h) => { updates.push(h); });

    const ran = [];
    const runner = (bin, args) => {
      ran.push({ bin, args });
      return 'ℹ pass 2\nℹ fail 0\n';
    };

    const result = await inFixture(() => withBoundaries(
      { execFileSync: gitFake(runner), findAffectedTests: affectedFake(['tests/one.test.js']) },
      qa => quiet(() => qa.runSmartTests({
        javascript: { test: 'never-run', testFramework: 'jest' }
      }))
    ));

    assert.equal(result.passed, true);
    assert.equal(result.passCount, 2, 'the count comes from the selected run');
    assert.deepEqual(ran.map(c => c.args), [['jest', 'tests/one.test.js']],
      'ONLY the affected test may run — a mutant falling back to the whole suite would '
      + 'not produce this exact argv');
    assert.equal(updates.length, 1, 'a passing selected run refreshes the hash cache');
  });

  it('a FAILING affected run must NOT refresh the hash cache (966-968)', async (t) => {
    const updates = [];
    t.mock.method(qualityState, 'getFileHashes', () => ({}));
    t.mock.method(qualityState, 'updateFileHashes', (h) => { updates.push(h); });

    const runner = () => { throw execFailure('ℹ pass 0\nℹ fail 1\n'); };

    const result = await inFixture(() => withBoundaries(
      { execFileSync: gitFake(runner), findAffectedTests: affectedFake(['tests/one.test.js']) },
      qa => quiet(() => qa.runSmartTests({
        javascript: { test: 'never-run', testFramework: 'jest' }
      }))
    ));

    assert.equal(result.passed, false, 'a failing selected run is not a pass');
    assert.deepEqual(updates, [],
      'refreshing the cache after a FAILURE would mark the broken file unchanged and its '
      + 'tests would never be selected again — the failure would disappear');
  });
});

// ===========================================================================
// 1062-1063 — a committed blob that cannot be read at its revision yields null, so the
// delta scan CONTINUES. A throw here would abort the file, and a break would abandon the
// rest of the push delta: either way a real secret later in the delta goes unscanned.
// ===========================================================================
describe('runSecurityScan: an unreadable blob does not stop the delta scan', () => {
  it('skips the blob it cannot read and still finds the secret in the next one (1062-1063)', async () => {
    const dir = mkTmp('ctoc-qa-blob-');
    const origPath = process.env.PATH;
    process.env.PATH = EMPTY_BIN; // no external scanner may resolve: offline, deterministic

    const execFileSync = (bin, args) => {
      if (bin === 'git') {
        const sub = args[0];
        if (sub === 'rev-parse') throw new Error('no upstream');
        if (sub === 'rev-list') return 'R1\n';
        if (sub === 'diff-tree') return 'gone.js\nkept.js\n';
        if (sub === 'show') {
          if (args[1] === 'R1:gone.js') throw new Error('fatal: path does not exist');
          return `const key = '${PLANTED_AWS_KEY}';\n`;
        }
      }
      throw new Error(`tool not available: ${bin}`);
    };

    try {
      const result = await withBoundaries({ execFileSync },
        qa => quiet(() => qa.runSecurityScan(undefined, { projectRoot: dir })));

      assert.equal(result.passed, false,
        'the planted credential in the readable blob must fail the gate — proving the '
        + 'scan continued past the blob it could not read');
      assert.ok(result.critical + result.high >= 1,
        `expected a blocking finding; got ${JSON.stringify(result)}`);
      assert.match(result.details, /secret\[/);
      assert.equal(result.skipped.some(s => s.includes('gone.js')), false,
        'a blob that is simply absent at its revision is not a scan FAILURE, so it must '
        + 'not be reported as a skipped file');
    } finally {
      process.env.PATH = origPath;
    }
  });
});

// ===========================================================================
// 1208-1211 — an external secrets verifier that throws. The scan must record a LOUD skip
// naming the tool: not a crash, and above all not a silent clean pass.
// ===========================================================================
describe('runSecurityScan: an external secrets verifier that throws is a loud skip', () => {
  it('names the failed tool in the skip list and finishes the scan (1208-1211)', async (t) => {
    const dir = mkTmp('ctoc-qa-external-');
    const origPath = process.env.PATH;
    process.env.PATH = EMPTY_BIN;

    // The boundary: the scanner's own tool probe and its external runner. The function
    // under test (runSecurityScan) is untouched.
    t.mock.method(SecretsScanner.prototype, 'isToolAvailable',
      function (tool) { return tool === 'trufflehog'; });
    t.mock.method(SecretsScanner.prototype, 'runTruffleHog',
      function () { throw new Error('trufflehog exploded'); });

    const execFileSync = (bin, args) => {
      if (bin === 'git') {
        const sub = args[0];
        if (sub === 'rev-parse') throw new Error('no upstream');
        if (sub === 'rev-list') return 'R1\n';
        if (sub === 'diff-tree') return 'clean.js\n';
        if (sub === 'show') return 'module.exports = 1;\n';
      }
      throw new Error(`tool not available: ${bin}`);
    };

    try {
      const result = await withBoundaries({ execFileSync },
        qa => quiet(() => qa.runSecurityScan(undefined, { projectRoot: dir })));

      const failure = result.skipped.find(s => s.includes('trufflehog failed'));
      assert.ok(failure,
        `a verifier that threw must be recorded as a skip naming it; got ${JSON.stringify(result.skipped)}`);
      assert.match(failure, /external verification NOT performed/,
        'the message must say the verification did not happen');
      assert.match(failure, /trufflehog exploded/,
        'the reason must reach the human, not be swallowed');
      assert.equal(result.critical, 0,
        'a tool failure is not a finding — it must not be counted as one');
      assert.equal(result.passed, true,
        'a skip does not block the gate; it is surfaced, not converted into a failure');
      assert.equal(result.skipped.some(s => s.includes('detect-secrets')), true,
        'the other verifier is still reported — a throw must not abandon the loop');
    } finally {
      process.env.PATH = origPath;
    }
  });
});

// ===========================================================================
// main() — the agent as the post-commit hook actually runs it: a real child process.
// ===========================================================================
describe('main(): the agent as the post-commit hook runs it', () => {
  it('refuses to run while a live process holds the lock, and exits 0 (1697-1699)', () => {
    const dir = makeFixtureProject({ testScript: 'console.log("never reached");\n' });
    // A lock held by a process that is definitely alive: this one.
    const stateDir = path.join(dir, '.ctoc', 'quality-state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, '.lock'), JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
      hostname: os.hostname()
    }));

    const res = runAgent(dir, ['--triggered-by=lock-case']);

    assert.equal(res.status, 0,
      'a second agent finding the lock held is a normal exit, not an error');
    assert.match(res.stdout, /Another quality check is running/,
      'the human must be told why nothing happened');
    assert.equal(/Detecting tools/.test(res.stdout), false,
      'it must stop BEFORE doing any work — a mutant that logged and carried on would '
      + 'run a second concurrent quality check');
    assert.equal(fs.existsSync(path.join(stateDir, '.lock')), true,
      'the lock belongs to the live holder and must survive');
  });

  it('runs the whole gate green and STILL does not push — the ship gate is the human\'s (1714-1731, 1749)', () => {
    const dir = makeFixtureProject({
      testScript: 'console.log("\\u2139 pass 1");\nconsole.log("\\u2139 fail 0");\n'
    });

    // --on-success=push states the INTENT. Authority lives in the setting, which is off.
    const res = runAgent(dir, ['--triggered-by=green-case', '--on-success=push']);

    assert.equal(res.status, 0, `agent exited ${res.status}: ${res.stderr}`);
    assert.match(res.stdout, /Languages: javascript/,
      'the detected languages are reported');
    assert.match(res.stdout, /Missing tools:/,
      'a configured command with no installed tool is surfaced, not hidden');
    assert.match(res.stdout, /ALL CHECKS PASSED/,
      `the fixture gate must be green; got: ${res.stdout}`);
    assert.match(res.stdout, /NOT pushing: push is a human ship gate/,
      'green checks must NOT ship — this is the one line that keeps a machine off the '
      + 'human\'s remote');
    assert.equal(/Pushing to remote/.test(res.stdout), false,
      'the push must not even be attempted');
    assert.equal(fs.existsSync(path.join(dir, '.ctoc', 'quality-state', 'status.json')), true,
      'the run records its verdict inside the project it ran in, and nowhere else');
  });

  it('reports a failing gate and never reaches the ship gate (1750-1752)', () => {
    const dir = makeFixtureProject({
      testScript: 'console.log("\\u2139 pass 0");\nconsole.log("\\u2139 fail 2");\nprocess.exit(1);\n'
    });

    const res = runAgent(dir, ['--triggered-by=red-case', '--on-success=push']);

    assert.equal(res.status, 0,
      'a failing check is a reported verdict, not a crash of the agent');
    assert.match(res.stdout, /CHECKS FAILED/);
    assert.match(res.stdout, /Tests:\s+FAIL/,
      'the summary must name WHICH check failed');
    assert.match(res.stdout, /Fix the issues above and commit again/,
      'the human is told what to do next');
    assert.equal(/NOT pushing: push is a human ship gate/.test(res.stdout), false,
      'a red run never reaches the ship gate at all');
  });
});
