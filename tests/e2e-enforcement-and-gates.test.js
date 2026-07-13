/**
 * End-to-end tests for the CTOC enforcement + human-gate hooks.
 *
 * Unlike tests/enforcement-hook.test.js (which exercises the LIBRARIES the
 * hooks compose), this file spawns the REAL hook processes as child Node
 * processes and asserts their observable contract:
 *
 *   - PreToolUse.Edit.js   exit 2 = BLOCKED, exit 0 = ALLOWED
 *   - human-gate-check.js  always exit 0; effect observed on the filesystem
 *                          (plans reverted, violations logged)
 *
 * The hooks read stdin (the Claude Code hook payload) via fs.readFileSync(0)
 * and operate relative to process.cwd(), so each test builds a hermetic temp
 * project and passes it as `cwd` to spawnSync.
 *
 * Cross-platform: all paths via path.join; process.execPath spawns Node.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const EDIT_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Edit.js');
const GATE_HOOK = path.join(REPO, 'src', 'hooks', 'human-gate-check.js');
const BASH_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Bash.js');

const { isCtocProject } = require(path.join(REPO, 'src', 'lib', 'ctoc-project-detector'));

const PLAN_STAGES = [
  'vision', 'canvas', 'functional', 'implementation',
  'todo', 'in-progress', 'review', 'done',
];

/**
 * Build a hermetic temp project.
 *
 * @param {object} opts
 * @param {boolean} opts.ctoc  When true, make it a detectable CTOC project:
 *   create .ctoc/logs/ AND a CLAUDE.md with the CTOC marker (BOTH are required
 *   by ctoc-project-detector — .ctoc/ alone is not sufficient). When false,
 *   create no .ctoc/ at all (a non-CTOC project → enforcement silent-passes).
 * @param {boolean} opts.strict  When true, write .ctoc/settings.yaml strict mode.
 */
function makeProject({ ctoc = true, strict = true } = {}) {
  // realpathSync canonicalizes the path so it matches the hook's process.cwd()
  // (on macOS, os.tmpdir() returns /var/... which is a symlink to /private/var/...;
  // without this, path.relative(cwd, file_path) inside the hook would be broken
  // and plan-coverage matching would spuriously fail — a harness artifact, not
  // a product bug).
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-e2e-')));
  for (const stage of PLAN_STAGES) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  if (ctoc) {
    fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
    // ctoc-project-detector requires BOTH .ctoc/ AND a CLAUDE.md marker.
    fs.writeFileSync(
      path.join(dir, 'CLAUDE.md'),
      '# CTOC Project Instructions\n\nHermetic e2e fixture.\n',
    );
    if (strict) {
      fs.writeFileSync(
        path.join(dir, '.ctoc', 'settings.yaml'),
        'enforcement:\n  mode: strict\n',
      );
    }
  }
  return dir;
}

function cleanup(dir) {
  if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore: best-effort, non-fatal */ } }
}

/**
 * Run the Edit enforcement hook against a target file.
 * @returns {{status:number, stderr:string, stdout:string}}
 */
function runEditHook(projectDir, targetRel, { transcriptPath } = {}) {
  const payload = {
    tool_name: 'Edit',
    tool_input: { file_path: path.join(projectDir, targetRel) },
  };
  if (transcriptPath) payload.transcript_path = transcriptPath;

  const res = spawnSync(process.execPath, [EDIT_HOOK], {
    cwd: projectDir,
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  // status is null only if the process was killed by a signal — that is a
  // harness failure, surface it loudly rather than silently passing.
  assert.equal(res.signal, null, `edit hook killed by signal ${res.signal}`);
  assert.ok(res.status === 0 || res.status === 2,
    `edit hook produced unexpected exit code ${res.status}; stderr=${res.stderr}`);
  return res;
}

/** Run the human-gate-check hook. Always exits 0; effect is on the filesystem. */
function runGateHook(projectDir) {
  const res = spawnSync(process.execPath, [GATE_HOOK], {
    cwd: projectDir,
    input: '{}',
    encoding: 'utf8',
  });
  assert.equal(res.signal, null, `gate hook killed by signal ${res.signal}`);
  assert.equal(res.status, 0, `gate hook should always exit 0; got ${res.status}, stderr=${res.stderr}`);
  return res;
}

/**
 * Run the Bash gate hook (W01-s2, findings C1+C2). The command travels as the
 * PreToolUse JSON payload on STDIN (the harness's real transport); the hook no
 * longer reads process.env.CLAUDE_TOOL_INPUT, so it is explicitly cleared to
 * prove the test does not lean on the removed channel. A deny is the shared
 * `permissionDecision:"deny"` JSON on stdout with exit 0 (deniedOnStdout());
 * an allow is exit 0 silent — exit code alone no longer distinguishes them.
 */
function runBashHook(projectDir, command) {
  const res = spawnSync(process.execPath, [BASH_HOOK], {
    cwd: projectDir,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    encoding: 'utf8',
  });
  assert.equal(res.signal, null, `bash hook killed by signal ${res.signal}`);
  return res;
}

/** Write a plan with a `files:` frontmatter block (block-list coverage). */
function writeCoveringPlan(projectDir, stage, name, files) {
  const filesYaml = files.map((f) => `  - "${f}"`).join('\n');
  const content = `---
title: "${name}"
program: ctoc-v7
files:
${filesYaml}
---
# ${name}
`;
  fs.writeFileSync(path.join(projectDir, 'plans', stage, `${name}.md`), content);
}

/** Write a plan into a stage, optionally with the human-approval marker. */
function writeStagePlan(projectDir, stage, name, { approved = false } = {}) {
  const marker = approved ? 'approved_by: human\n' : '';
  const content = `---
title: "${name}"
${marker}---
# ${name}

Body content.
`;
  fs.writeFileSync(path.join(projectDir, 'plans', stage, `${name}.md`), content);
}

function planExists(projectDir, stage, name) {
  return fs.existsSync(path.join(projectDir, 'plans', stage, `${name}.md`));
}

/**
 * Whether the hook emitted the harness's real deny signal on stdout.
 *
 * Under the W01 deny protocol (ADR-1) a deny is the JSON decision
 * `hookSpecificOutput.permissionDecision === "deny"` printed on stdout with
 * exit 0; an allow is exit 0 SILENT (no JSON). Exit 0 alone therefore no longer
 * distinguishes allow from deny — only the presence of this deny JSON does.
 * Parses the LAST JSON object on stdout to tolerate any preceding output.
 */
function deniedOnStdout(res) {
  const s = (res.stdout ? String(res.stdout) : '').trim();
  if (!s) return false;
  let decision = null;
  try { decision = JSON.parse(s); } catch { /* fall through to last-brace scan */ }
  if (!decision) {
    const idx = s.lastIndexOf('{');
    if (idx === -1) return false;
    try { decision = JSON.parse(s.slice(idx)); } catch { return false; }
  }
  return !!(decision && decision.hookSpecificOutput
    && decision.hookSpecificOutput.permissionDecision === 'deny');
}

function readViolations(projectDir) {
  const f = path.join(projectDir, '.ctoc', 'logs', 'gate-violations.json');
  if (!fs.existsSync(f)) return null;
  // gate-violations.json is an append-only JSONL log (the durable-log format,
  // W11-s4): one JSON object per line, NOT a single JSON array.
  const raw = fs.readFileSync(f, 'utf8').trim();
  if (!raw) return null;
  return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

// ---------------------------------------------------------------------------
// ENFORCEMENT — PreToolUse.Edit.js
// ---------------------------------------------------------------------------

describe('e2e: PreToolUse.Edit.js enforcement', () => {
  let dir;
  afterEach(() => { cleanup(dir); dir = undefined; });

  it('the temp project is genuinely detected as a CTOC project (harness sanity)', () => {
    dir = makeProject({ ctoc: true });
    // If this fails, every "BLOCKED in CTOC project" assertion below would be
    // meaningless (the hook would silent-pass instead). Fail loud here.
    assert.equal(isCtocProject(dir).isCtoc, true,
      'fixture must be a detectable CTOC project for enforcement tests to be valid');
  });

  it('1. blocks a non-whitelisted file with no covering plan and no escape', () => {
    dir = makeProject({ ctoc: true, strict: true });
    const res = runEditHook(dir, path.join('src', 'lib', 'x.js'));
    // C1 regression guard: assert the tool was actually PREVENTED (the harness's
    // real deny signal on stdout), not the cosmetic exit-1 numeral that let C1
    // ship behind a green suite.
    assert.equal(deniedOnStdout(res), true,
      `should BLOCK via permissionDecision:"deny" on stdout; stdout=${res.stdout} stderr=${res.stderr}`);
    assert.match(res.stderr, /BLOCKED/, 'block reason on stderr');
  });

  // Contract: the whitelist (.ctoc/*, VERSION, plans/*.md, .gitignore) must ALLOW
  // infrastructure-file edits unconditionally, for the file_path Claude Code
  // actually sends — which is ABSOLUTE. These three currently FAIL: isWhitelisted()
  // matches against a path that has only had a single leading "/" stripped, so the
  // anchored regex patterns (^\.ctoc\/, ^VERSION$, ^plans\/.*\.md$) never match an
  // absolute path. (plan-coverage relativizes against cwd; the whitelist does not —
  // that asymmetry is the bug.) .gitignore (2d) survives only because it has a
  // path.basename() fallback that the regex patterns lack. These assert the
  // intended contract; they are left failing on purpose to surface the real bug.
  it('2a. allows a whitelisted plans/<f>.md file', () => {
    dir = makeProject({ ctoc: true });
    const res = runEditHook(dir, path.join('plans', 'todo', 'whatever.md'));
    assert.equal(res.status, 0,
      'plans/*.md is whitelisted → must ALLOW even with an absolute file_path');
  });

  it('2b. allows the whitelisted VERSION file', () => {
    dir = makeProject({ ctoc: true });
    const res = runEditHook(dir, 'VERSION');
    assert.equal(res.status, 0,
      'VERSION is whitelisted → must ALLOW even with an absolute file_path');
  });

  it('2c. allows a whitelisted .ctoc/<f> file', () => {
    dir = makeProject({ ctoc: true });
    const res = runEditHook(dir, path.join('.ctoc', 'settings.yaml'));
    assert.equal(res.status, 0,
      '.ctoc/* is whitelisted → must ALLOW even with an absolute file_path');
  });

  it('2d. allows the whitelisted .gitignore file', () => {
    dir = makeProject({ ctoc: true });
    const res = runEditHook(dir, '.gitignore');
    assert.equal(res.status, 0, '.gitignore is whitelisted → ALLOW');
  });

  it('3. allows a file covered by an in-progress plan declaring files: ["src/**"]', () => {
    dir = makeProject({ ctoc: true, strict: true });
    writeCoveringPlan(dir, 'in-progress', 'foo', ['src/**']);
    const res = runEditHook(dir, path.join('src', 'lib', 'x.js'));
    assert.equal(res.status, 0,
      `covering plan should ALLOW; stderr=${res.stderr}`);
    assert.equal(deniedOnStdout(res), false,
      'an allowed edit must NOT carry the deny signal on stdout');
  });

  it('4. allows when an escape phrase ("hotfix") is present in the transcript', () => {
    dir = makeProject({ ctoc: true, strict: true });
    const transcript = path.join(dir, 'transcript.txt');
    fs.writeFileSync(transcript,
      'user: please apply this hotfix to the parser, it is breaking prod\n');
    const res = runEditHook(dir, path.join('src', 'lib', 'x.js'),
      { transcriptPath: transcript });
    assert.equal(res.status, 0,
      `escape phrase should ALLOW; stderr=${res.stderr}`);
    assert.equal(deniedOnStdout(res), false,
      'an escape-phrase allow must NOT carry the deny signal on stdout');
  });

  it('5. silent-passes when the project is NOT a CTOC project', () => {
    dir = makeProject({ ctoc: false });
    // Sanity: ensure the detector agrees this is non-CTOC.
    assert.equal(isCtocProject(dir).isCtoc, false,
      'fixture must NOT be a CTOC project for this test to be valid');
    const res = runEditHook(dir, path.join('src', 'lib', 'x.js'));
    assert.equal(res.status, 0, 'non-CTOC project → silent passthrough ALLOW');
    assert.equal(deniedOnStdout(res), false,
      'a non-CTOC silent passthrough must NOT carry the deny signal on stdout');
  });
});

// ---------------------------------------------------------------------------
// HUMAN GATES — human-gate-check.js
// ---------------------------------------------------------------------------

describe('e2e: human-gate-check.js gate enforcement', () => {
  let dir;
  afterEach(() => { cleanup(dir); dir = undefined; });

  it('6. reverts a done/ plan lacking the approval marker → review/ and logs a violation', () => {
    dir = makeProject({ ctoc: true });
    writeStagePlan(dir, 'done', 'unapproved', { approved: false });

    runGateHook(dir);

    assert.equal(planExists(dir, 'done', 'unapproved'), false,
      'unapproved plan must be removed from done/');
    assert.equal(planExists(dir, 'review', 'unapproved'), true,
      'unapproved plan must be reverted to review/');

    const violations = readViolations(dir);
    assert.ok(Array.isArray(violations) && violations.length >= 1,
      'a violation must be logged to gate-violations.json');
    const v = violations.find((e) => e.plan === 'unapproved.md');
    assert.ok(v, 'violation entry for the reverted plan must exist');
    assert.match(v.action, /review/, 'violation records revert to review/');
  });

  it('7. reverts a done/ plan whose ONLY approval is the forgeable in-plan marker (no ledger entry)', () => {
    dir = makeProject({ ctoc: true });
    // The in-plan `approved_by: human` marker is forgeable by any agent tool call.
    // Under the ledger contract (finding C4) it is NO LONGER accepted as approval:
    // with no ledger entry vouching for the plan, human-gate-check correctly
    // reverts it out of done/ (a marker-only "approval" is worthless).
    writeStagePlan(dir, 'done', 'marker-only', { approved: true });

    runGateHook(dir);

    assert.equal(planExists(dir, 'done', 'marker-only'), false,
      'a marker-only plan (no ledger entry) must be reverted out of done/');
    assert.equal(planExists(dir, 'review', 'marker-only'), true,
      'a marker-only plan must be reverted to review/');

    const violations = readViolations(dir);
    assert.ok(
      Array.isArray(violations) && violations.some((e) => e.plan === 'marker-only.md'),
      'the forged-marker revert must be logged as a violation',
    );
  });

  it('8a. reverts an implementation/ plan lacking the marker → functional/', () => {
    dir = makeProject({ ctoc: true });
    writeStagePlan(dir, 'implementation', 'impl-noapprove', { approved: false });

    runGateHook(dir);

    assert.equal(planExists(dir, 'implementation', 'impl-noapprove'), false,
      'unapproved plan must leave implementation/');
    assert.equal(planExists(dir, 'functional', 'impl-noapprove'), true,
      'unapproved plan must revert to functional/');
  });

  it('8b. reverts a todo/ plan lacking the marker → implementation/', () => {
    dir = makeProject({ ctoc: true });
    writeStagePlan(dir, 'todo', 'todo-noapprove', { approved: false });

    runGateHook(dir);

    assert.equal(planExists(dir, 'todo', 'todo-noapprove'), false,
      'unapproved plan must leave todo/');
    assert.equal(planExists(dir, 'implementation', 'todo-noapprove'), true,
      'unapproved plan must revert to implementation/');
  });

  it('9. never reverts a plan in in-progress/ (not a gate destination), marker or not', () => {
    dir = makeProject({ ctoc: true });
    writeStagePlan(dir, 'in-progress', 'inprog-noapprove', { approved: false });
    writeStagePlan(dir, 'in-progress', 'inprog-approved', { approved: true });

    runGateHook(dir);

    assert.equal(planExists(dir, 'in-progress', 'inprog-noapprove'), true,
      'in-progress is not a gate destination → never reverted');
    assert.equal(planExists(dir, 'in-progress', 'inprog-approved'), true,
      'in-progress is not a gate destination → never reverted');

    const violations = readViolations(dir);
    if (violations) {
      assert.equal(
        violations.some((e) => e.plan === 'inprog-noapprove.md' || e.plan === 'inprog-approved.md'),
        false,
        'no violation should be logged for in-progress plans',
      );
    }
  });
});

// ---------------------------------------------------------------------------
// ENFORCEMENT — PreToolUse.Bash.js gate (W01-s2, findings C1+C2)
// ---------------------------------------------------------------------------

describe('e2e: PreToolUse.Bash.js gate enforcement', () => {
  let dir;
  afterEach(() => { cleanup(dir); dir = undefined; });

  it('10. denies a destructive command read from stdin (rm -rf plans)', () => {
    dir = makeProject({ ctoc: true, strict: true });
    const res = runBashHook(dir, 'rm -rf plans');
    // C1+C2 regression guard: the command must be READ from stdin (C2) AND the
    // deny must be the harness's real signal on stdout (C1), not a cosmetic
    // exit-1 numeral that let the gate stay inert behind a green suite.
    assert.equal(deniedOnStdout(res), true,
      `destructive command must BLOCK via permissionDecision:"deny" on stdout; stdout=${res.stdout} stderr=${res.stderr}`);
  });

  it('11. denies a force-push read from stdin (no allow-by-default fall-through)', () => {
    dir = makeProject({ ctoc: true, strict: true });
    const res = runBashHook(dir, 'git push --force origin main');
    assert.equal(deniedOnStdout(res), true,
      `force-push must BLOCK via permissionDecision:"deny"; stdout=${res.stdout} stderr=${res.stderr}`);
  });

  it('12. allows a benign read-only command (no deny signal)', () => {
    dir = makeProject({ ctoc: true, strict: true });
    const res = runBashHook(dir, 'ls -la');
    assert.equal(deniedOnStdout(res), false,
      `a benign command must NOT carry the deny signal on stdout; stdout=${res.stdout} stderr=${res.stderr}`);
  });
});
