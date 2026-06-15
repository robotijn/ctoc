/**
 * Security: PreToolUse enforcement-hook EVASION + MISFIRE tests
 *
 * Adversarial coverage for src/hooks/PreToolUse.Edit.js. The enforcement hook
 * is a SECURITY CONTROL: it decides whether a file edit is permitted without an
 * active plan. If it can be tricked into ALLOWING an edit to a real source file
 * (evasion), or into BLOCKING work that a stage grants (misfire), the control
 * is broken.
 *
 * Each test asserts the INTENDED CONTRACT, not the current behavior. A failing
 * assertion here is a REAL BUG — a security evasion or a misfire — and must be
 * left failing and reported, never weakened or skipped.
 *
 * Mechanics:
 *   - The hook is run as a real child process (`spawnSync(process.execPath,...)`)
 *     so we exercise the exact code path Claude Code uses. status 1 = BLOCKED,
 *     status 0 = ALLOWED. A null status (killed by signal) is a harness failure
 *     and is surfaced loudly.
 *   - Each test builds an isolated temp project that is a *real* CTOC project
 *     (`.ctoc/` + `CLAUDE.md` marker + `plans/<stage>/`), so detection passes
 *     and the block path is reachable (sanity-checked by a control test).
 *   - matchEscapePhrase is also unit-tested directly.
 *
 * Cross-platform: every path via path.join / path.sep; spawns Node via execPath.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '..');
const EDIT_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Edit.js');
const { matchEscapePhrase } = require(path.join(REPO, 'src', 'lib', 'escape-phrases'));

// Every CTOC plan stage directory. Coverage is granted ONLY by the three
// "active" stages (in-progress > todo > implementation); the rest must not.
const ALL_STAGES = [
  'vision', 'canvas', 'functional', 'implementation',
  'todo', 'in-progress', 'review', 'done',
];

/**
 * Build an isolated, real CTOC temp project.
 * realpathSync resolves /var -> /private/var on macOS so that path.relative
 * inside the hook (which uses process.cwd()) matches our targets exactly.
 */
function makeProject() {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-sec-'));
  const dir = fs.realpathSync(raw);
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    '# CTOC Project Instructions\n\nThis project uses CTOC.\n',
  );
  // strict enforcement so the hook is in its most restrictive mode
  fs.writeFileSync(
    path.join(dir, '.ctoc', 'settings.yaml'),
    'enforcement:\n  mode: strict\n',
  );
  for (const stage of ALL_STAGES) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  return dir;
}

function cleanup(dir) {
  if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}

/** Write a plan with a `files:` coverage block into `stage`. */
function writePlan(dir, stage, name, files) {
  const filesYaml = files.map((f) => `  - "${f}"`).join('\n');
  const content = `---
title: "${name}"
program: ctoc-v7
files:
${filesYaml}
---
# ${name}
`;
  fs.writeFileSync(path.join(dir, 'plans', stage, `${name}.md`), content);
}

/**
 * Run the Edit hook with `cwd` = project root (matches Claude Code, which runs
 * hooks from the project root). `target` is passed verbatim as
 * tool_input.file_path so traversal strings reach the hook unchanged.
 *
 * @returns {{status:number, stderr:string, stdout:string}}
 */
function runHook(dir, target, { transcriptPath } = {}) {
  const payload = { tool_name: 'Edit', tool_input: { file_path: target } };
  if (transcriptPath) payload.transcript_path = transcriptPath;
  const res = spawnSync(process.execPath, [EDIT_HOOK], {
    cwd: dir,
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  // A null status means the process was killed by a signal — a harness fault,
  // not a meaningful BLOCK/ALLOW result. Surface it loudly.
  assert.equal(res.signal, null, `edit hook killed by signal ${res.signal}; stderr=${res.stderr}`);
  assert.ok(
    res.status === 0 || res.status === 1,
    `edit hook produced a non-meaningful exit code ${res.status}; stderr=${res.stderr}`,
  );
  return res;
}

const BLOCKED = 1;
const ALLOWED = 0;

// ---------------------------------------------------------------------------
// Harness sanity — prove the mechanism is meaningful before trusting results.
// ---------------------------------------------------------------------------
describe('harness sanity', () => {
  let dir;
  beforeEach(() => { dir = makeProject(); });
  afterEach(() => { cleanup(dir); });

  it('the hook file exists and is runnable', () => {
    assert.ok(fs.existsSync(EDIT_HOOK), `hook missing at ${EDIT_HOOK}`);
  });

  it('CONTROL: an uncovered src edit in a detected CTOC project is BLOCKED', () => {
    // No plan, no escape phrase, real CTOC project -> must hit the block path.
    // If this ALLOWS, the whole hook (or detection) is broken and every other
    // ALLOW assertion below would be meaningless.
    const target = path.join(dir, 'src', 'lib', 'evil.js');
    const res = runHook(dir, target);
    assert.equal(res.status, BLOCKED,
      `uncovered src edit must BLOCK in a CTOC project; got ${res.status}, stderr=${res.stderr}`);
  });

  it('CONTROL: project is detected as CTOC (block message names the project)', () => {
    const res = runHook(dir, path.join(dir, 'src', 'lib', 'evil.js'));
    // The block branch only runs when detection passed; a silent passthrough
    // would have exited 0 with no BLOCKED message.
    assert.match(res.stderr, /BLOCKED/, 'expected the CTOC BLOCKED message');
  });
});

// ---------------------------------------------------------------------------
// 1-2. PATH-TRAVERSAL WHITELIST BYPASS (designed to surface a real bug)
//
// isWhitelisted() strips only a leading "./" and "/" then tests anchored
// regexes (^\.ctoc\/, ^plans\/.*\.md$). It does NOT normalize internal "..".
// A relative target whose string STARTS with a whitelisted prefix but whose
// resolved path escapes that prefix is wrongly whitelisted.
// CONTRACT: the edit to the resolved (real) file must be BLOCKED.
// ---------------------------------------------------------------------------
describe('path-traversal whitelist bypass', () => {
  let dir;
  beforeEach(() => {
    dir = makeProject();
    // Create a real source file the traversal resolves to, so a wrongful ALLOW
    // is a genuine "edit a protected source file without a plan".
    fs.mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'lib', 'inbox.js'), '// real source\n');
  });
  afterEach(() => { cleanup(dir); });

  it('1. ".ctoc/../src/lib/inbox.js" must NOT be whitelisted — edit BLOCKED', () => {
    // Relative form: string starts with ".ctoc/" so the ^\.ctoc\/ regex matches,
    // but the path resolves to src/lib/inbox.js — a real source file.
    const target = `.ctoc${path.sep}..${path.sep}src${path.sep}lib${path.sep}inbox.js`;
    const res = runHook(dir, target);
    assert.equal(res.status, BLOCKED,
      'SECURITY EVASION: ".ctoc/../src/lib/inbox.js" escaped .ctoc/ via "..", ' +
      'resolves to a real source file, yet was whitelisted and ALLOWED. ' +
      `status=${res.status}, stderr=${res.stderr}`);
  });

  it('2. "plans/../../outside.md" must NOT be treated as a whitelisted plan file', () => {
    // Ends in .md and starts with "plans/" so ^plans\/.*\.md$ matches, but the
    // path escapes plans/ (and even the project root) via "..".
    const target = `plans${path.sep}..${path.sep}..${path.sep}outside.md`;
    const res = runHook(dir, target);
    assert.equal(res.status, BLOCKED,
      'SECURITY EVASION: "plans/../../outside.md" escapes plans/ via "..", ' +
      'is not a real in-tree plan file, yet was whitelisted and ALLOWED. ' +
      `status=${res.status}, stderr=${res.stderr}`);
  });
});

// ---------------------------------------------------------------------------
// 3-5. NON-ACTIVE-STAGE COVERAGE
//
// Only in-progress / todo / implementation grant coverage. A plan in any other
// stage that declares files:["src/**"] must NOT allow edits to src.
// ---------------------------------------------------------------------------
describe('non-active-stage coverage', () => {
  let dir;
  const target = () => path.join(dir, 'src', 'lib', 'x.js');
  beforeEach(() => { dir = makeProject(); });
  afterEach(() => { cleanup(dir); });

  it('3. a plan in plans/functional/ does NOT grant coverage — BLOCKED', () => {
    writePlan(dir, 'functional', 'func-plan', ['src/**']);
    const res = runHook(dir, target());
    assert.equal(res.status, BLOCKED,
      'MISFIRE/EVASION: a functional-stage plan (not enforcement-active) granted ' +
      `coverage for src/lib/x.js. status=${res.status}, stderr=${res.stderr}`);
  });

  it('4. a plan in plans/done/ does NOT grant coverage — BLOCKED', () => {
    writePlan(dir, 'done', 'done-plan', ['src/**']);
    const res = runHook(dir, target());
    assert.equal(res.status, BLOCKED,
      'EVASION: a done-stage plan (shipped, not active) granted coverage for ' +
      `src/lib/x.js. status=${res.status}, stderr=${res.stderr}`);
  });

  it('5. POSITIVE CONTROL: a plan in plans/in-progress/ grants coverage — ALLOWED', () => {
    writePlan(dir, 'in-progress', 'inp-plan', ['src/**']);
    const res = runHook(dir, target());
    assert.equal(res.status, ALLOWED,
      'MISFIRE: an in-progress plan covering src/** must ALLOW src/lib/x.js. ' +
      `status=${res.status}, stderr=${res.stderr}`);
  });
});

// ---------------------------------------------------------------------------
// 6-9. ESCAPE-PHRASE BOUNDARIES (matchEscapePhrase, direct unit tests)
//
// The escape phrase is a deliberate bypass; a false-positive match is an
// evasion vector (prose accidentally disables enforcement), and a false
// negative breaks the intended trivial-change shortcut.
// ---------------------------------------------------------------------------
describe('escape-phrase boundaries (matchEscapePhrase)', () => {
  it('6. "trivially complex" must NOT match (no false positive on "trivial")', () => {
    assert.equal(matchEscapePhrase('this change is trivially complex'), null,
      'FALSE POSITIVE: "trivially complex" matched an escape phrase, disabling enforcement on prose');
    // The phrase is "trivial fix" / "trivial change"; the bare word "trivial"
    // inside "trivially" must never satisfy either.
    assert.equal(matchEscapePhrase('trivially'), null);
  });

  it('7. word-boundary: "nontrivial change" and "not a quick fix" prose semantics', () => {
    // "nontrivial change": the phrase "trivial change" appears as a substring of
    // "nontrivial change". CONTRACT: it must NOT match — the leading "non"
    // negates it, and "trivial" is not at a word boundary.
    assert.equal(matchEscapePhrase('this is a nontrivial change'), null,
      'FALSE POSITIVE: "nontrivial change" matched "trivial change" — a word-boundary failure ' +
      'that lets negating prose disable enforcement');
    // "this is not a quick fix": the literal phrase "quick fix" IS present at
    // word boundaries, so under substring-with-boundaries semantics it DOES
    // match. Assert the actual contract (the matcher is keyword-based and does
    // not understand the "not" negation).
    assert.equal(matchEscapePhrase('this is not a quick fix'), 'quick fix',
      'word-bounded "quick fix" is present and should match (matcher is keyword-based)');
  });

  it('8. positive matches: hotfix, HOTFIX (case-insensitive), skip planning, skip iron loop', () => {
    assert.equal(matchEscapePhrase('please hotfix this'), 'hotfix');
    assert.equal(matchEscapePhrase('PLEASE HOTFIX THIS'), 'hotfix', 'must be case-insensitive');
    assert.equal(matchEscapePhrase('just skip planning here'), 'skip planning');
    assert.equal(matchEscapePhrase('we should skip iron loop for this'), 'skip iron loop');
  });

  it('9. empty / null / whitespace input → no match, no throw', () => {
    assert.equal(matchEscapePhrase(''), null);
    assert.equal(matchEscapePhrase(null), null);
    assert.equal(matchEscapePhrase(undefined), null);
    assert.equal(matchEscapePhrase('   \n\t  '), null,
      'whitespace-only input must not match any phrase');
    assert.doesNotThrow(() => matchEscapePhrase(null));
    assert.doesNotThrow(() => matchEscapePhrase(12345));
  });
});

// ---------------------------------------------------------------------------
// 10. WHITELIST CORRECTNESS (relative-path forms, end-to-end through the hook)
//
// Infrastructure files must pass; look-alikes must not. These are run through
// the real hook process so the assertion reflects the deployed control.
// ---------------------------------------------------------------------------
describe('whitelist correctness (relative forms)', () => {
  let dir;
  beforeEach(() => { dir = makeProject(); });
  afterEach(() => { cleanup(dir); });

  const cases = [
    // [target, expectedStatus, why]
    ['VERSION',        ALLOWED, 'VERSION is whitelisted'],
    ['version.txt',    BLOCKED, 'version.txt is NOT VERSION — must not be whitelisted'],
    ['plans/x.md',     ALLOWED, 'plans/*.md is whitelisted'],
    ['plans/x.js',     BLOCKED, 'plans/x.js is not a .md plan — must not be whitelisted'],
    ['src/x.js',       BLOCKED, 'arbitrary source file is not whitelisted'],
    ['.gitignore',     ALLOWED, '.gitignore is whitelisted'],
  ];

  for (const [rel, expected, why] of cases) {
    it(`10. "${rel}" → ${expected === ALLOWED ? 'ALLOWED' : 'BLOCKED'} (${why})`, () => {
      // Use the platform separator so the relative form is realistic on Windows.
      const target = rel.split('/').join(path.sep);
      const res = runHook(dir, target);
      assert.equal(res.status, expected,
        `${why}; got status=${res.status}, stderr=${res.stderr}`);
    });
  }
});
