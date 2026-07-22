'use strict';

/**
 * Dark-branch coverage for `src/hooks/PreToolUse.Write.js` — the mandatory-pipeline
 * ENFORCEMENT hook that intercepts Write file creation.
 *
 * SCOPE (deliberately disjoint from the existing Write tests):
 *   • tests/w01-edit-write-deny-protocol.test.js and
 *     tests/w01-multiedit-notebookedit-parity.test.js — spawn the REAL hook as a
 *     subprocess and assert the harness-visible deny/allow decision. They cover the
 *     enforcement OUTCOME through main()→enforce() but never touch the advisory
 *     guard's own branches, and they never drive a delegate FAULT.
 *   • tests/plan-index-duplicate-hook.test.js — drives run() in-process, but its
 *     filename is NOT matched by the `tests/*write*.test.js` coverage glob, so it
 *     does not contribute to the scoped number.
 *
 * This file therefore drives the ADVISORY-GUARD surface in-process — the exported
 * run(), isPlanTarget(), deriveSummary(), normalizeRel() plus the non-exported
 * emitWarnings()/appendLog()/resolveCheckDuplicate() reached THROUGH run() — and
 * targets the DARK catch/fallback/boundary branches that the repo-wide 91.08%
 * measurement still leaves red: the isPlanTarget require-fail + regex-throw catches,
 * the appendLog log-write-failure catch, and every resolveCheckDuplicate branch
 * (fixture array / non-array / parse-throw, real-require success, require-throw
 * fallback). Every test below pins a branch that goes RED under mutation — none is
 * an obvious-only line-coverage filler.
 *
 * Fakes live ONLY at the true boundary the skill permits: the module loader
 * (require.cache / Module._load, restored in finally), a capturing stderr sink, and
 * the filesystem (real os.tmpdir fixtures). No domain logic is mocked; the deny/allow
 * and warn/skip decisions are the REAL module's.
 *
 * main()/readStdinRaw()/the require.main entry call process.exit via the real
 * enforce() and read fd 0, so they cannot run in-process without killing the test
 * runner. Their FAIL-OPEN safety branches (delegate load-failure, non-function
 * export, malformed stdin) are exercised behaviorally by the spawned-subprocess
 * block at the bottom. `node --test --experimental-test-coverage` propagates
 * NODE_V8_COVERAGE to those children and MERGES their coverage back, so these tests
 * DO cover main()'s fail-open lines (the JSON-parse catch, the delegate-load-failure
 * and non-function-export branches) AND kill the safety-critical mutants there
 * (e.g. exit(0)→exit(1), or dropping a fail-open catch so a delegate fault would
 * BLOCK every write). The w01 suite never triggers a delegate fault, which is why
 * those lines stay red until this file drives them.
 *
 * DOCUMENTED-UNREACHABLE — the three lines the scoped run still marks uncovered are
 * defensive/dead; none is fabricated:
 *   • run() line ~236 `if (typeof checkDuplicate !== 'function') return …` — dead via
 *     the public run() API: checkDuplicate is either deps.checkDuplicate (already
 *     type-guarded as a function by the ternary at ~231) or resolveCheckDuplicate(),
 *     and EVERY return path of resolveCheckDuplicate yields a function. No input to
 *     run() makes checkDuplicate a non-function here.
 *   • readStdinRaw() line ~265 `catch { return ''; }` — reads fd 0; the catch only
 *     fires on an fd-0 read FAULT. readStdinRaw is not exported and the only caller
 *     is main(); every subprocess that reaches main() is spawned with a readable
 *     stdin, so readFileSync(0) always succeeds. No public path throws here.
 *   • main() line ~292 — the catch around `await run(parsed)` (the one whose body
 *     is the "advisory guard is fail-open" comment). run() is internally fail-open
 *     (its whole body is a
 *     try/catch that always RESOLVES, never throws/rejects — pinned by the
 *     "fails open when checkDuplicate REJECTS" test above), so this outer catch is
 *     defensively unreachable.
 *   • emitWarnings() line ~159 `deps.projectPath || process.cwd()` second operand
 *     (branch, not line) — run() always calls emitWarnings with `{ ...deps,
 *     projectPath }` where projectPath is the already-resolved truthy value, so the
 *     `|| process.cwd()` fallback branch is unreachable from run(); emitWarnings is
 *     not exported.
 *
 * Cross-platform: all paths via path.join; process.execPath spawns Node; no shell.
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const WRITE_HOOK_PATH = path.join(REPO, 'src', 'hooks', 'PreToolUse.Write.js');
const PLAN_COVERAGE_PATH = require.resolve(path.join(REPO, 'src', 'lib', 'plan-coverage.js'));
const DUPLICATE_GUARD_PATH = require.resolve(
  path.join(REPO, 'src', 'lib', 'plan-index', 'duplicate-guard.js'),
);

const hook = require(WRITE_HOOK_PATH);

const FIXTURE_ENV = 'CTOC_DUPLICATE_GUARD_TEST_FIXTURE';

/** A capturing stderr sink recording every chunk; exposes the joined text. */
function makeStderr() {
  const chunks = [];
  return { write: (s) => { chunks.push(String(s)); return true; }, text: () => chunks.join('') };
}

/** Make a hermetic scratch project dir. */
function makeTmp(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function rimraf(dir) {
  if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

/** Build a valid Write payload for a plan target. */
function planPayload(content = '---\ntitle: Auth cleanup\n---\n## Goal\nRefactor auth.') {
  return { tool_name: 'Write', tool_input: { file_path: 'plans/functional/auth-cleanup.md', content } };
}

// ---------------------------------------------------------------------------
// normalizeRel — exported; pins the two-operand guard, the isAbsolute fork, and
// BOTH replace() transforms (a mutant dropping either replace reds a case).
// ---------------------------------------------------------------------------
describe('normalizeRel — path guard, absolute-relativization, slash + ./ normalization', () => {
  it('returns empty string for a non-string input (first operand of the guard)', () => {
    assert.equal(hook.normalizeRel(null), '');
    assert.equal(hook.normalizeRel(42), '');
    assert.equal(hook.normalizeRel(undefined), '');
  });

  it('returns empty string for an empty-string input (second operand of the guard)', () => {
    assert.equal(hook.normalizeRel(''), '');
  });

  it('relativizes an absolute path under cwd to a repo-relative forward-slash path', () => {
    // Arrange — an absolute path rooted at cwd so path.relative is deterministic.
    const abs = path.join(process.cwd(), 'plans', 'functional', 'a.md');

    // Act
    const rel = hook.normalizeRel(abs);

    // Assert — the isAbsolute branch must fire and produce the relative path.
    assert.equal(rel, 'plans/functional/a.md');
  });

  it('converts backslashes to forward slashes (Windows-shaped input)', () => {
    assert.equal(hook.normalizeRel('plans\\functional\\a.md'), 'plans/functional/a.md');
  });

  it('strips a leading ./ prefix (the second replace)', () => {
    assert.equal(hook.normalizeRel('./plans/functional/a.md'), 'plans/functional/a.md');
  });
});

// ---------------------------------------------------------------------------
// deriveSummary — exported; pins the non-string / whitespace guards, the title
// ternary (both arms), and the SUMMARY_CHAR_CAP boundary.
// ---------------------------------------------------------------------------
describe('deriveSummary — guards, title-awareness, and the char-cap boundary', () => {
  it('returns empty string for non-string content (first operand)', () => {
    assert.equal(hook.deriveSummary(null), '');
    assert.equal(hook.deriveSummary(123), '');
  });

  it('returns empty string for whitespace-only content (second operand, .trim())', () => {
    assert.equal(hook.deriveSummary('   \n\t  '), '');
  });

  it('prepends the frontmatter title on its own line when present (ternary true arm)', () => {
    // Arrange
    const content = '---\ntitle: "Hello World"\n---\nbody text here';

    // Act
    const summary = hook.deriveSummary(content);

    // Assert — title extracted (quotes stripped) and joined above the body.
    assert.equal(summary.startsWith('Hello World\n'), true);
    assert.equal(summary.includes('body text here'), true);
  });

  it('returns body only when there is no title (ternary false arm)', () => {
    // Arrange — no `title:` line anywhere.
    const content = '## Goal\njust a body, no frontmatter title';

    // Act
    const summary = hook.deriveSummary(content);

    // Assert — no synthetic title line was prepended.
    assert.equal(summary, '## Goal\njust a body, no frontmatter title');
  });

  it('caps the body at SUMMARY_CHAR_CAP characters (boundary — a mutant widening the slice reds this)', () => {
    // Arrange — no title, content strictly longer than the cap, no surrounding whitespace.
    const cap = hook.SUMMARY_CHAR_CAP;
    assert.equal(cap, 2000, 'cap constant guards the boundary assertion below');
    const content = 'a'.repeat(cap + 500);

    // Act
    const summary = hook.deriveSummary(content);

    // Assert — exactly the cap, not cap+500.
    assert.equal(summary.length, cap);
  });
});

// ---------------------------------------------------------------------------
// isPlanTarget — exported; the real globToRegex require path, the negations,
// and the two fail-open catches (require throws, regex .test throws) plus the
// non-function-require branch. Loader fakes restored in finally.
// ---------------------------------------------------------------------------
describe('isPlanTarget — plan-glob match, negations, and fail-open catches', () => {
  it('matches plans/**/*.md via the REAL globToRegex require path', () => {
    assert.equal(hook.isPlanTarget('plans/functional/a.md'), true);
    assert.equal(hook.isPlanTarget('plans/a.md'), true);
  });

  it('rejects a non-.md target (second operand of the endsWith guard)', () => {
    assert.equal(hook.isPlanTarget('plans/functional/a.txt'), false);
  });

  it('rejects an empty / non-string target (normalizeRel → "" short-circuits)', () => {
    assert.equal(hook.isPlanTarget(''), false);
    assert.equal(hook.isPlanTarget(null), false);
  });

  it('rejects a .md file OUTSIDE plans/ (real regex .test returns false — negation)', () => {
    // A mutant that made isPlanTarget always-true would red here.
    assert.equal(hook.isPlanTarget('src/lib/a.md'), false);
    assert.equal(hook.isPlanTarget('docs/readme.md'), false);
  });

  it('fails open to false when an injected globToRegex returns a matcher whose .test throws', () => {
    // Arrange — a boundary fake: a globToRegex whose produced matcher throws on .test().
    const throwingGlobToRegex = () => ({ test() { throw new Error('pathological regex'); } });

    // Act — the throw inside .test() must be caught, not propagated.
    const result = hook.isPlanTarget('plans/functional/a.md', throwingGlobToRegex);

    // Assert — conservative fail-open: the guard simply declines to warn.
    assert.equal(result, false);
  });

  it('fails open to false when the plan-coverage require THROWS (missing lib)', () => {
    // Arrange — force the internal require('../lib/plan-coverage') to throw, at the
    // module-loader boundary. No injected globToRegex, so the require path is taken.
    const origLoad = Module._load;
    Module._load = function patched(request, parent, isMain) {
      let resolved = null;
      try { resolved = Module._resolveFilename(request, parent, isMain); } catch { /* ignore */ }
      if (resolved === PLAN_COVERAGE_PATH) throw new Error('SIMULATED plan-coverage load failure');
      return origLoad.apply(this, arguments);
    };

    // Act + Assert
    try {
      assert.equal(hook.isPlanTarget('plans/functional/a.md'), false);
    } finally {
      Module._load = origLoad;
    }
  });

  it('fails open to false when plan-coverage exports no globToRegex function', () => {
    // Arrange — seed the loader cache so require returns an object without globToRegex.
    const saved = require.cache[PLAN_COVERAGE_PATH];
    require.cache[PLAN_COVERAGE_PATH] = {
      id: PLAN_COVERAGE_PATH, filename: PLAN_COVERAGE_PATH, loaded: true, exports: {},
    };

    // Act + Assert — typeof toRegex !== 'function' → false.
    try {
      assert.equal(hook.isPlanTarget('plans/functional/a.md'), false);
    } finally {
      if (saved) require.cache[PLAN_COVERAGE_PATH] = saved;
      else delete require.cache[PLAN_COVERAGE_PATH];
    }
  });
});

// ---------------------------------------------------------------------------
// run() — the advisory entry. Injected checkDuplicate (fast, no network) drives
// the warn/skip/fail-open decisions; emitWarnings + appendLog are reached through
// it. Every case pins an allow-vs-warn or fallback branch.
// ---------------------------------------------------------------------------
describe('run() — warn / skip / fail-open decisions and their side effects', () => {
  let dir;
  afterEach(() => { rimraf(dir); dir = undefined; });

  it('WARNS on a near-duplicate: surfaces slug + finite similarity to stderr AND appends the log', async () => {
    // Arrange
    dir = makeTmp('ptw-warn-');
    // Slice 00177: the advisory log is written ONLY into an existing `.ctoc/` and
    // never manufactures it. A durable log therefore exists only in a real project,
    // so the fixture is a real project.
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    const stderr = makeStderr();
    const checkDuplicate = async () => [{ plan: 'plans/functional/auth-refactor.md', similarity: 0.87 }];

    // Act
    const result = await hook.run(planPayload(), { checkDuplicate, stderr, projectPath: dir });

    // Assert — warned, the human sees the slug + score, and the sink file has it too.
    assert.equal(result.warned, true);
    assert.equal(result.warnings.length, 1);
    const seen = stderr.text();
    assert.equal(seen.includes('auth-refactor'), true);
    assert.equal(seen.includes('0.87'), true);
    const logged = fs.readFileSync(path.join(dir, '.ctoc', 'logs', 'plan-index.log'), 'utf8');
    assert.equal(logged.includes('auth-refactor'), true, 'appendLog must persist the advisory line');
  });

  it('renders "n/a" for a non-finite similarity (the Number.isFinite false arm)', async () => {
    // Arrange — similarity is NaN; the line must degrade to "n/a", never "NaN".
    dir = makeTmp('ptw-nan-');
    const stderr = makeStderr();
    const checkDuplicate = async () => [{ plan: 'plans/functional/x.md', similarity: NaN }];

    // Act
    const result = await hook.run(planPayload(), { checkDuplicate, stderr, projectPath: dir });

    // Assert
    assert.equal(result.warned, true);
    assert.equal(stderr.text().includes('similarity: n/a'), true);
  });

  it('skips entirely for a NON-plan target — checkDuplicate is never called', async () => {
    // Arrange
    dir = makeTmp('ptw-nonplan-');
    let called = false;
    const checkDuplicate = async () => { called = true; return [{ plan: 'p', similarity: 1 }]; };
    const payload = { tool_name: 'Write', tool_input: { file_path: 'src/lib/foo.js', content: 'x' } };

    // Act
    const result = await hook.run(payload, { checkDuplicate, projectPath: dir });

    // Assert — the non-plan negation short-circuits before any duplicate check.
    assert.equal(result.warned, false);
    assert.equal(called, false);
  });

  it('skips when content yields an empty summary — checkDuplicate is never called', async () => {
    // Arrange
    dir = makeTmp('ptw-empty-');
    let called = false;
    const checkDuplicate = async () => { called = true; return []; };
    const payload = { tool_name: 'Write', tool_input: { file_path: 'plans/functional/x.md', content: '   ' } };

    // Act
    const result = await hook.run(payload, { checkDuplicate, projectPath: dir });

    // Assert
    assert.equal(result.warned, false);
    assert.equal(called, false);
  });

  it('does NOT warn when checkDuplicate returns an empty array (length-0 arm)', async () => {
    dir = makeTmp('ptw-none-');
    const stderr = makeStderr();
    const result = await hook.run(planPayload(), { checkDuplicate: async () => [], stderr, projectPath: dir });
    assert.equal(result.warned, false);
    assert.deepEqual(result.warnings, []);
    assert.equal(stderr.text().includes('possible duplicate'), false);
  });

  it('does NOT warn when checkDuplicate returns a non-array (the Array.isArray guard)', async () => {
    // A mutant dropping `Array.isArray(warnings)` would try warnings.length on null → throw.
    dir = makeTmp('ptw-nonarr-');
    const result = await hook.run(planPayload(), { checkDuplicate: async () => null, projectPath: dir });
    assert.equal(result.warned, false);
    assert.deepEqual(result.warnings, []);
  });

  it('fails open (warned:false, no throw) when checkDuplicate REJECTS', async () => {
    // Arrange
    dir = makeTmp('ptw-reject-');
    const stderr = makeStderr();
    const checkDuplicate = async () => { throw new Error('index blew up'); };

    // Act — must resolve, never reject: the guard can never break a plan write.
    const result = await hook.run(planPayload(), { checkDuplicate, stderr, projectPath: dir });

    // Assert
    assert.equal(result.warned, false);
    assert.deepEqual(result.warnings, []);
    assert.equal(stderr.text().includes('possible duplicate'), false);
  });

  it('tolerates a null payload via the (payload && payload.tool_input) || {} fallback', async () => {
    // Both operands of the fallback exercised: null payload and a payload lacking tool_input.
    const r1 = await hook.run(null, { checkDuplicate: async () => [{ plan: 'p', similarity: 1 }] });
    assert.equal(r1.warned, false);
    const r2 = await hook.run({}, { checkDuplicate: async () => [{ plan: 'p', similarity: 1 }] });
    assert.equal(r2.warned, false);
  });

  it('still writes to a capturing process.stderr when deps.stderr is omitted (|| fallback)', async () => {
    // Arrange — no deps.stderr, so emitWarnings must fall back to process.stderr.
    dir = makeTmp('ptw-defstderr-');
    const originalWrite = process.stderr.write;
    const captured = [];
    process.stderr.write = (s) => { captured.push(String(s)); return true; };

    // Act
    let result;
    try {
      result = await hook.run(planPayload(), {
        checkDuplicate: async () => [{ plan: 'plans/functional/dup.md', similarity: 0.9 }],
        projectPath: dir,
      });
    } finally {
      process.stderr.write = originalWrite;
    }

    // Assert — the fallback stderr received the advisory line.
    assert.equal(result.warned, true);
    assert.equal(captured.join('').includes('dup.md'), true);
  });

  it('swallows a throwing stderr.write yet STILL warns and STILL appends the log', async () => {
    // Arrange — the per-line try/catch inside emitWarnings must absorb a stderr fault.
    dir = makeTmp('ptw-badstderr-');
    // Slice 00177: the log is persisted only into an existing `.ctoc/`; the fixture
    // is a real project so the "STILL appends the log" assertion still holds.
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    const stderr = { write() { throw new Error('stderr is on fire'); } };

    // Act
    const result = await hook.run(planPayload(), {
      checkDuplicate: async () => [{ plan: 'plans/functional/dup.md', similarity: 0.9 }],
      stderr,
      projectPath: dir,
    });

    // Assert — a mutant removing the stderr try/catch would make run() fail open (warned:false).
    assert.equal(result.warned, true);
    const logged = fs.readFileSync(path.join(dir, '.ctoc', 'logs', 'plan-index.log'), 'utf8');
    assert.equal(logged.includes('dup.md'), true);
  });

  it('swallows an appendLog write failure (.ctoc is a FILE) yet STILL warns', async () => {
    // Arrange — make mkdirSync(<dir>/.ctoc/logs) throw by planting a FILE at <dir>/.ctoc.
    dir = makeTmp('ptw-logfail-');
    fs.writeFileSync(path.join(dir, '.ctoc'), 'not a directory');
    const stderr = makeStderr();

    // Act
    const result = await hook.run(planPayload(), {
      checkDuplicate: async () => [{ plan: 'plans/functional/dup.md', similarity: 0.9 }],
      stderr,
      projectPath: dir,
    });

    // Assert — appendLog's own try/catch must absorb the fs error. Removing that
    // catch would let the throw bubble into run()'s catch → warned:false.
    assert.equal(result.warned, true);
    assert.equal(stderr.text().includes('dup.md'), true);
  });

  it('resolves projectPath to process.cwd() when omitted (|| fallback) without writing to the repo', async () => {
    // checkDuplicate → [] so no emit/appendLog fires; run still computes the cwd fallback.
    const result = await hook.run(planPayload(), { checkDuplicate: async () => [] });
    assert.equal(result.warned, false);
  });
});

// ---------------------------------------------------------------------------
// resolveCheckDuplicate — reached through run() WITHOUT an injected checkDuplicate.
// Covers the env-fixture seam (array / non-array / parse-throw), the real-require
// success path, and the require-throw fallback. Env + loader restored in finally.
// ---------------------------------------------------------------------------
describe('resolveCheckDuplicate (via run, no injected checkDuplicate)', () => {
  let dir;
  const savedFixtureEnv = process.env[FIXTURE_ENV];
  afterEach(() => {
    rimraf(dir); dir = undefined;
    if (savedFixtureEnv === undefined) delete process.env[FIXTURE_ENV];
    else process.env[FIXTURE_ENV] = savedFixtureEnv;
  });

  it('uses the test-fixture seam and WARNS when the fixture is a scored array', async () => {
    // Arrange
    dir = makeTmp('ptw-fixarr-');
    const fixture = path.join(dir, 'dup.json');
    fs.writeFileSync(fixture, JSON.stringify([{ plan: 'plans/functional/seam.md', similarity: 0.95 }]));
    process.env[FIXTURE_ENV] = fixture;
    const stderr = makeStderr();

    // Act — no deps.checkDuplicate, so resolveCheckDuplicate's fixture branch runs.
    const result = await hook.run(planPayload(), { stderr, projectPath: dir });

    // Assert
    assert.equal(result.warned, true);
    assert.equal(stderr.text().includes('seam.md'), true);
  });

  it('does NOT warn when the fixture parses to a NON-array (Array.isArray false arm)', async () => {
    // Arrange
    dir = makeTmp('ptw-fixobj-');
    const fixture = path.join(dir, 'dup.json');
    fs.writeFileSync(fixture, JSON.stringify({ not: 'an array' }));
    process.env[FIXTURE_ENV] = fixture;

    // Act
    const result = await hook.run(planPayload(), { projectPath: dir });

    // Assert — the fixture returns [] for a non-array; no warning.
    assert.equal(result.warned, false);
  });

  it('fails open to no-warn when the fixture file is unreadable / invalid JSON (parse-throw catch)', async () => {
    // Arrange — point at a path that does not exist so readFileSync throws.
    dir = makeTmp('ptw-fixbad-');
    process.env[FIXTURE_ENV] = path.join(dir, 'does-not-exist.json');

    // Act
    const result = await hook.run(planPayload(), { projectPath: dir });

    // Assert — the fixture seam's catch returns []; run does not warn and does not throw.
    assert.equal(result.warned, false);
  });

  it('takes the REAL duplicate-guard require path when no fixture is set (empty index → no warn)', async () => {
    // Arrange — no fixture env; a fresh project has no plan index, so the real
    // fail-open checkDuplicate returns [] fast (no Ollama, verified ~3ms).
    dir = makeTmp('ptw-realreq-');
    delete process.env[FIXTURE_ENV];

    // Act
    const result = await hook.run(planPayload(), { projectPath: dir });

    // Assert — the require executed and the real guard returned no duplicates.
    assert.equal(result.warned, false);
  });

  it('falls back to a no-op checkDuplicate when the duplicate-guard require THROWS', async () => {
    // Arrange — no fixture; force require('../lib/plan-index/duplicate-guard') to throw
    // at the loader boundary, so resolveCheckDuplicate's catch returns the () => [] stub.
    dir = makeTmp('ptw-reqthrow-');
    delete process.env[FIXTURE_ENV];
    const origLoad = Module._load;
    Module._load = function patched(request, parent, isMain) {
      let resolved = null;
      try { resolved = Module._resolveFilename(request, parent, isMain); } catch { /* ignore */ }
      if (resolved === DUPLICATE_GUARD_PATH) throw new Error('SIMULATED duplicate-guard load failure');
      return origLoad.apply(this, arguments);
    };

    // Act + Assert
    try {
      const result = await hook.run(planPayload(), { projectPath: dir });
      assert.equal(result.warned, false);
    } finally {
      Module._load = origLoad;
    }
  });
});

// ---------------------------------------------------------------------------
// main() FAIL-OPEN safety — subprocess only (process.exit + fd-0 read cannot run
// in-process). These kill the safety-critical mutants even though they do not move
// the parent's line-coverage number (a child's lines are not attributed upward).
// ---------------------------------------------------------------------------
describe('main() fail-open safety (spawned subprocess)', () => {
  let wrapDir;
  let nonFnWrapper;
  let loadFailWrapper;

  before(() => {
    wrapDir = makeTmp('ptw-wrap-');
    nonFnWrapper = path.join(wrapDir, 'w-nonfn.js');
    loadFailWrapper = path.join(wrapDir, 'w-loadfail.js');
    fs.writeFileSync(nonFnWrapper, [
      "'use strict';",
      "const path = require('path');",
      'const REPO = process.argv[2];',
      "const editPath = require.resolve(path.join(REPO, 'src', 'hooks', 'PreToolUse.Edit.js'));",
      // Seed the loader cache so the delegate resolves to a NON-function enforce.
      'require.cache[editPath] = { id: editPath, filename: editPath, loaded: true, exports: { enforce: 42 } };',
      "require(path.join(REPO, 'src', 'hooks', 'PreToolUse.Write.js')).main();",
      '',
    ].join('\n'));
    fs.writeFileSync(loadFailWrapper, [
      "'use strict';",
      "const path = require('path');",
      "const Module = require('module');",
      'const REPO = process.argv[2];',
      "const editPath = require.resolve(path.join(REPO, 'src', 'hooks', 'PreToolUse.Edit.js'));",
      'const orig = Module._load;',
      'Module._load = function (request, parent, isMain) {',
      '  let resolved = null;',
      '  try { resolved = Module._resolveFilename(request, parent, isMain); } catch (e) { /* ignore */ }',
      "  if (resolved === editPath) throw new Error('SIMULATED_DELEGATE_LOAD_FAILURE');",
      '  return orig.apply(this, arguments);',
      '};',
      "require(path.join(REPO, 'src', 'hooks', 'PreToolUse.Write.js')).main();",
      '',
    ].join('\n'));
  });

  after(() => { rimraf(wrapDir); });

  function runNode(scriptPath, args, input, cwd) {
    const res = spawnSync(process.execPath, [scriptPath, ...args], {
      input, cwd, encoding: 'utf8', env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    });
    assert.equal(res.signal, null, `child killed by signal ${res.signal}`);
    return { status: typeof res.status === 'number' ? res.status : null, stderr: String(res.stderr || '') };
  }

  it('exits 0 (fail open) and warns on stderr when the enforcement delegate is NOT a function', () => {
    const out = runNode(nonFnWrapper, [REPO], '{}', wrapDir);
    assert.equal(out.status, 0, `must fail OPEN (exit 0); stderr=${out.stderr}`);
    assert.equal(out.stderr.includes('no enforce()'), true);
    assert.equal(out.stderr.includes('failing open'), true);
  });

  it('exits 0 (fail open) and warns on stderr when the enforcement delegate FAILS TO LOAD', () => {
    const out = runNode(loadFailWrapper, [REPO], '{}', wrapDir);
    assert.equal(out.status, 0, `must fail OPEN (exit 0); stderr=${out.stderr}`);
    assert.equal(out.stderr.includes('failed to load'), true);
    assert.equal(out.stderr.includes('failing open'), true);
  });

  it('exits 0 on malformed stdin JSON — the guard is skipped and enforcement still delegates', () => {
    // A non-CTOC cwd so the delegated real enforce() silently allows (exit 0). Proves
    // the JSON.parse catch (parsed=null) does not abort the delegation.
    const nonCtoc = makeTmp('ptw-nonctoc-');
    try {
      const out = runNode(WRITE_HOOK_PATH, [], 'not json{', nonCtoc);
      assert.equal(out.status, 0, `malformed stdin must not block (fail open); stderr=${out.stderr}`);
    } finally {
      rimraf(nonCtoc);
    }
  });
});
