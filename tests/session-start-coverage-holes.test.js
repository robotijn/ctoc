/**
 * Every optional session-start subsystem degrades to SILENCE, provably.
 * ---------------------------------------------------------------------------
 * `src/hooks/SessionStart.js` runs on every session open. Nine of its ranges were
 * dark on the 2026-08-31 measurement (96.68 % line coverage), and every one of them
 * is the same shape: the catch arm that keeps a broken OPTIONAL subsystem from
 * breaking the human's session start.
 *
 * The property each case pins is not "it did not crash". Line 202 composes the
 * injected context as
 *   console.log(context + (directive||'') + (resume||'') + (loopB||'') + (away||''))
 * so a broken optional subsystem must contribute EXACTLY NOTHING — not `undefined`,
 * not a partial, not an error string — to the text the model reads. The one
 * deliberate exception is the Iron Loop self-check, which contributes a visible
 * "Self-check skipped: <reason>" line: the human is told, and the session still
 * starts.
 *
 * RANGE MAP (line numbers from the 2026-08-31 gate report; they drift with edits,
 * the gate's own table is the source of truth):
 *
 * | lines   | subsystem broken                        | route      | asserted here |
 * |---------|-----------------------------------------|------------|---------------|
 * | 138-139 | plan-index backfill kick                | in-process | stderr line + session still starts |
 * | 166-168 | Iron Loop self-check                    | in-process | "Self-check skipped: <reason>" in the banner |
 * | 189-190 | build-loop tick (loop-b-driver)         | in-process | byte-for-byte identical to an ABSENT tick |
 * | 200-201 | while-you-were-away increment feed      | in-process | byte-for-byte identical to an ABSENT feed |
 * | 237-238 | question-dispatch directive             | in-process | '' — no directive |
 * | 318-319 | durable-watchdog resume injection       | in-process | '' — never wrongly resumes |
 * | 345-346 | CTOC-repo identity detector             | in-process | false — the fail-SAFE direction (do NOT inject) |
 * | 371-372 | operating-lessons block injection       | in-process | stderr line + no CLAUDE.md manufactured |
 * | 568-569 | main().catch, hook run as main module   | spawned    | exit 1 + "[CTOC] Session start error:" |
 *
 * ROUTES. Eight cases run IN-PROCESS: `SessionStart.js` exports `main`,
 * `questionDispatchDirective`, `resumeInjection`, `shouldInjectLessons` and
 * `maybeInjectLessons`, so the real code runs with `process.cwd()` pointed at a temp
 * fixture. The ninth (568-569) sits inside `if (require.main === module)`, so it is
 * reachable ONLY when the hook is the main module: that case spawns the hook as a
 * child with a `--require` preload (written into the temp fixture, never into this
 * repository) that poisons the stack detector so `main()` rejects.
 *
 * NOTHING IS LEFT UNCOVERED by this file, and nothing here is permission-gated or
 * terminal-only: all nine ranges are reachable and all nine are exercised. No range
 * of this file was found dead.
 *
 * FAULT INJECTION IS AT THE TRUE BOUNDARY ONLY — the exported reader of the module
 * each arm requires (`bootstrap.isBackfillNeeded`, `iron-loop-enforcer.checkAllInvariants`,
 * `loop-b-driver.loopBDirective`, `increment-feed.whileYouWereAway`,
 * `streaming-precompute.plansNeedingQuestions`, `continuation.status`,
 * `ctoc-project-detector.isCtocProject`, `claude-md-lessons.ensureLessonsBlock`).
 * The function under test is never mocked. Every stub is restored in a `finally`,
 * and the last case asserts every boundary is back to its original function object.
 *
 * CONFINEMENT. Every run uses a temp fixture removed in `after`; the global Iron Loop
 * state file each run writes under `~/.ctoc/state/` is removed too. No case points the
 * hook at this repository.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const hook = require('../src/hooks/SessionStart.js');
const crypto = require('../src/lib/crypto');

const HOOK_PATH = path.resolve(__dirname, '..', 'src', 'hooks', 'SessionStart.js');
const STACK_DETECTOR_PATH = path.resolve(__dirname, '..', 'src', 'lib', 'stack-detector.js');

// The eight true boundaries, captured at load so the final case can prove restoration.
const bootstrap = require('../src/lib/plan-index/bootstrap');
const enforcer = require('../src/lib/iron-loop-enforcer');
const loopBDriver = require('../src/lib/loop-b-driver');
const incrementFeed = require('../src/lib/increment-feed');
const streamingPrecompute = require('../src/lib/streaming-precompute');
const continuation = require('../src/lib/continuation');
const ctocDetector = require('../src/lib/ctoc-project-detector');
const claudeMdLessons = require('../src/lib/claude-md-lessons');

const BOUNDARIES = [
  [bootstrap, 'isBackfillNeeded'],
  [enforcer, 'checkAllInvariants'],
  [loopBDriver, 'loopBDirective'],
  [incrementFeed, 'whileYouWereAway'],
  [streamingPrecompute, 'plansNeedingQuestions'],
  [continuation, 'status'],
  [ctocDetector, 'isCtocProject'],
  [claudeMdLessons, 'ensureLessonsBlock']
];
const ORIGINALS = new Map(BOUNDARIES.map(([mod, name]) => [name, mod[name]]));

const cleanupDirs = [];
const cleanupStateFiles = [];

after(() => {
  for (const d of cleanupDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  for (const f of cleanupStateFiles) {
    try { fs.rmSync(f, { force: true }); } catch { /* best-effort */ }
  }
});

/**
 * A temp project the resolver identifies by an EVIDENCED marker (its own
 * package.json), named something other than `ctoc` so the self-repo guard treats it
 * as a consumer project. realpathSync so the fixture path matches the hash the
 * global state file is keyed by on macOS (/var vs /private/var).
 */
function makeFixture(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  cleanupDirs.push(dir);
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'consumer-app', version: '0.0.0' })
  );
  cleanupStateFiles.push(path.join(os.homedir(), '.ctoc', 'state', `${crypto.hashPath(dir)}.json`));
  return dir;
}

/** Replace one exported reader for the duration of `fn`; always restore. */
async function withStub(mod, name, impl, fn) {
  const original = mod[name];
  mod[name] = impl;
  try {
    return await fn();
  } finally {
    mod[name] = original;
  }
}

const thrower = (message) => () => { throw new Error(message); };

/** Capture console.log (the injected context) and stderr (console.error) around `fn`. */
async function capture(fn) {
  const stdoutChunks = [];
  const stderrChunks = [];
  const log0 = console.log;
  const stderrWrite0 = process.stderr.write.bind(process.stderr);
  console.log = (...args) => { stdoutChunks.push(args.join(' ')); };
  process.stderr.write = (chunk) => { stderrChunks.push(String(chunk)); return true; };
  try {
    await fn();
  } finally {
    console.log = log0;
    process.stderr.write = stderrWrite0;
  }
  return { stdout: stdoutChunks.join('\n'), stderr: stderrChunks.join('') };
}

/** Run the real main() with the working directory pointed at `dir`. */
async function runMain(dir) {
  const cwd0 = process.cwd();
  process.chdir(dir);
  try {
    return await capture(() => hook.main());
  } finally {
    process.chdir(cwd0);
  }
}

describe('a broken optional subsystem contributes nothing to session start', () => {
  it('a broken plan-index backfill kick is reported on stderr and the session still starts', async () => {
    // Arrange
    const dir = makeFixture('ss-holes-backfill-');

    // Act
    const { stdout, stderr } = await withStub(
      bootstrap, 'isBackfillNeeded', thrower('SIMULATED bootstrap failure'),
      () => runMain(dir)
    );

    // Assert — the operator is told, and the banner is still produced.
    assert.match(stderr, /\[CTOC\] Plan-index backfill kick skipped: SIMULATED bootstrap failure/);
    assert.match(stdout, /Your Virtual CTO is Active/);
    assert.ok(!stdout.includes('SIMULATED'), 'the fault must not leak into the injected context');
  });

  it('a broken self-check is reported as skipped, with the reason, and the session still starts', async () => {
    // Arrange
    const dir = makeFixture('ss-holes-selfcheck-');

    // Act
    const { stdout } = await withStub(
      enforcer, 'checkAllInvariants', thrower('SIMULATED enforcer failure'),
      () => runMain(dir)
    );

    // Assert — this arm deliberately SPEAKS: the human is told the check was skipped.
    assert.match(stdout, /Self-check skipped: SIMULATED enforcer failure/);
    assert.match(stdout, /Your Virtual CTO is Active/);
  });

  it('a broken build-loop tick contributes nothing — byte-for-byte identical to an absent tick', async () => {
    // Arrange — warm the fixture so first-run side effects (scaffolding, state
    // creation) are out of the way and the two compared runs differ ONLY by the fault.
    const dir = makeFixture('ss-holes-loopb-');
    await runMain(dir);

    // Act
    const absent = await withStub(loopBDriver, 'loopBDirective', () => '', () => runMain(dir));
    const broken = await withStub(
      loopBDriver, 'loopBDirective', thrower('SIMULATED loop-b failure'), () => runMain(dir)
    );

    // Assert
    assert.equal(broken.stdout, absent.stdout);
    assert.ok(!broken.stdout.includes('SIMULATED'), 'no error string in the injected context');
    assert.ok(!broken.stdout.includes('undefined'), 'no undefined in the injected context');
  });

  it('a broken increment feed contributes nothing — byte-for-byte identical to an absent feed', async () => {
    // Arrange
    const dir = makeFixture('ss-holes-away-');
    await runMain(dir);

    // Act
    const absent = await withStub(incrementFeed, 'whileYouWereAway', () => '', () => runMain(dir));
    const broken = await withStub(
      incrementFeed, 'whileYouWereAway', thrower('SIMULATED feed failure'), () => runMain(dir)
    );

    // Assert
    assert.equal(broken.stdout, absent.stdout);
    assert.ok(!broken.stdout.includes('SIMULATED'), 'no error string in the injected context');
    assert.ok(!broken.stdout.includes('undefined'), 'no undefined in the injected context');
  });

  it('a broken question-dispatch precompute yields no directive at all', async () => {
    // Arrange
    const dir = makeFixture('ss-holes-directive-');

    // Act
    const directive = await withStub(
      streamingPrecompute, 'plansNeedingQuestions', thrower('SIMULATED precompute failure'),
      async () => hook.questionDispatchDirective(dir)
    );

    // Assert — '' exactly: a broken precompute must not half-instruct the session model.
    assert.equal(directive, '');
  });

  it('a broken continuation state never resumes — the injection is empty, not a guess', async () => {
    // Arrange — the kill-switch must be off, otherwise the early return, not the
    // catch arm, would produce the empty string.
    const dir = makeFixture('ss-holes-resume-');
    const skip0 = process.env.CTOC_SKIP_CONTINUATION;
    delete process.env.CTOC_SKIP_CONTINUATION;

    // Act
    let resume;
    try {
      resume = await withStub(
        continuation, 'status', thrower('SIMULATED continuation failure'),
        async () => hook.resumeInjection(dir)
      );
    } finally {
      if (skip0 === undefined) delete process.env.CTOC_SKIP_CONTINUATION;
      else process.env.CTOC_SKIP_CONTINUATION = skip0;
    }

    // Assert — a resume that cannot be decided is never asserted.
    assert.equal(resume, '');
  });

  it('an undecidable project identity refuses to inject — the fail-SAFE direction', async () => {
    // Arrange
    const dir = makeFixture('ss-holes-identity-');

    // Act
    const decision = await withStub(
      ctocDetector, 'isCtocProject', thrower('SIMULATED detector failure'),
      async () => hook.shouldInjectLessons(dir)
    );

    // Assert — false protects a maintainer's hand-written CLAUDE.md when identity is unknown.
    assert.equal(decision, false);
  });

  it('a broken lessons injector is reported on stderr and manufactures no CLAUDE.md', async () => {
    // Arrange — a consumer project (package name is not `ctoc`), so the guard permits
    // injection and the fault lands in the injector itself.
    const dir = makeFixture('ss-holes-lessons-');
    const claudeMd = path.join(dir, 'CLAUDE.md');

    // Act
    const { stderr } = await withStub(
      claudeMdLessons, 'ensureLessonsBlock', thrower('SIMULATED lessons failure'),
      () => capture(async () => hook.maybeInjectLessons(dir))
    );

    // Assert
    assert.match(stderr, /\[CTOC\] Lessons block injection skipped: SIMULATED lessons failure/);
    assert.equal(fs.existsSync(claudeMd), false, 'a failed injection must create nothing');
  });

  it('a rejecting main, run as the hook, exits 1 and names the failure on stderr', async () => {
    // Arrange — 568-569 lives inside `if (require.main === module)`, so the hook must
    // be the MAIN module. The preload (written into the temp fixture, never into this
    // repository) poisons the stack detector's cached export BEFORE SessionStart is
    // loaded, so main()'s unguarded `detectStack(projectPath)` rejects the promise.
    const dir = makeFixture('ss-holes-mainreject-');
    const preload = path.join(dir, 'poison-stack-detector.js');
    fs.writeFileSync(
      preload,
      `require(${JSON.stringify(STACK_DETECTOR_PATH)}).detectStack = () => {\n` +
      `  throw new Error('SIMULATED stack detection failure');\n};\n`
    );

    // Act
    const res = spawnSync(process.execPath, ['--require', preload, HOOK_PATH], {
      cwd: dir, encoding: 'utf8', timeout: 30000
    });

    // Assert — the top-level catch reports and exits non-zero rather than dying silently.
    assert.equal(res.status, 1, 'a rejected main must exit 1');
    assert.match(res.stderr || '', /\[CTOC\] Session start error: SIMULATED stack detection failure/);
  });

  it('every injected fault was restored — the boundaries are the originals again', () => {
    // Assert — a leaked stub would poison every later test in this process.
    for (const [mod, name] of BOUNDARIES) {
      assert.equal(mod[name], ORIGINALS.get(name), `${name} was not restored`);
    }
  });
});
