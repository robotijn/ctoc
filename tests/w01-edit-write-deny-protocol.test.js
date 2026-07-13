/**
 * W01-s1 — Edit + Write emit a REAL harness deny (subprocess behavior tests).
 *
 * These tests spawn the ACTUAL hook files as real Node subprocesses with a real
 * PreToolUse JSON payload on stdin, exactly as the Claude Code harness invokes
 * them, and assert on the REAL channel the harness reads: the parsed stdout
 * decision JSON (`hookSpecificOutput.permissionDecision`). No test doubles, no
 * mocked core logic — the deny/allow decision is observed on the process boundary.
 *
 * Why the stdout decision field and not the exit code: under ADR-1 a deny is
 * `permissionDecision:"deny"` JSON on stdout + exit 0, and an allow is exit 0
 * SILENT (no JSON). Exit 0 therefore no longer distinguishes allow from deny —
 * only the presence/absence of the deny JSON on stdout does. This is the exact
 * gap that let finding C1 (a cosmetic `process.exit(1)`) ship behind a green
 * suite: the old e2e test asserted the exit numeral, never that the tool was
 * actually prevented.
 *
 * Cross-platform: all paths via path.join; process.execPath spawns Node; no shell.
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const EDIT_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Edit.js');
const WRITE_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Write.js');

const { isCtocProject } = require(path.join(REPO, 'src', 'lib', 'ctoc-project-detector'));

const PLAN_STAGES = [
  'vision', 'canvas', 'functional', 'implementation',
  'todo', 'in-progress', 'review', 'done',
];

/** Build a hermetic, detectable CTOC temp project. */
function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w01-')));
  for (const stage of PLAN_STAGES) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    '# CTOC Project Instructions\n\nHermetic W01 fixture.\n',
  );
  fs.writeFileSync(
    path.join(dir, '.ctoc', 'settings.yaml'),
    'enforcement:\n  mode: strict\n',
  );
  return dir;
}

function cleanup(dir) {
  if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

/** Write a plan declaring `files:` coverage into a stage. */
function writeCoveringPlan(dir, stage, name, files) {
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
 * Parse the LAST JSON object on stdout and report the deny signal. `denied` is
 * true ONLY when the harness-visible decision is `permissionDecision:"deny"`.
 *
 * @returns {{status:number, denied:boolean, reason:(string|null), stdout:string, stderr:string, decision:(object|null)}}
 */
function decode(res) {
  const stdout = res.stdout ? String(res.stdout) : '';
  const stderr = res.stderr ? String(res.stderr) : '';
  const decision = lastJsonObject(stdout);
  const perm = decision && decision.hookSpecificOutput
    ? decision.hookSpecificOutput.permissionDecision
    : null;
  const reason = decision && decision.hookSpecificOutput
    ? decision.hookSpecificOutput.permissionDecisionReason
    : null;
  return {
    status: typeof res.status === 'number' ? res.status : null,
    denied: perm === 'deny',
    reason: typeof reason === 'string' ? reason : null,
    stdout,
    stderr,
    decision,
  };
}

/** Return the last top-level JSON object printed on stdout, or null. */
function lastJsonObject(stdout) {
  const s = stdout.trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { /* fall through to last-brace scan */ }
  const idx = s.lastIndexOf('{');
  if (idx === -1) return null;
  try { return JSON.parse(s.slice(idx)); } catch { return null; }
}

/** Spawn a hook with a payload on stdin, CLAUDE_TOOL_INPUT explicitly empty. */
function spawnHook(hookPath, payload, dir, extraEnv = {}) {
  const res = spawnSync(process.execPath, [hookPath], {
    cwd: dir,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_TOOL_INPUT: '', ...extraEnv },
  });
  assert.equal(res.signal, null, `hook killed by signal ${res.signal}`);
  return decode(res);
}

describe('W01-s1: Edit + Write emit a real harness deny (subprocess)', () => {
  let dir;
  afterEach(() => { cleanup(dir); dir = undefined; });

  it('harness sanity: the temp project is a detectable CTOC project', () => {
    dir = makeProject();
    assert.equal(isCtocProject(dir).isCtoc, true,
      'fixture must be a detectable CTOC project or the deny assertions are meaningless');
  });

  it('1. an uncovered Edit is PREVENTED — deny JSON emitted and target bytes unchanged', () => {
    dir = makeProject();
    const targetRel = path.join('src', 'lib', 'x.js');
    const targetAbs = path.join(dir, targetRel);
    fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
    const before = 'const original = 1;\n';
    fs.writeFileSync(targetAbs, before);

    const out = spawnHook(EDIT_HOOK, {
      tool_name: 'Edit',
      tool_input: { file_path: targetAbs },
    }, dir);

    assert.equal(out.denied, true,
      `uncovered Edit must emit permissionDecision:"deny"; stdout=${out.stdout} stderr=${out.stderr}`);
    // The hook never writes the file (it only decides), so bytes must be identical.
    assert.equal(fs.readFileSync(targetAbs, 'utf8'), before,
      'target file bytes must be unchanged by a denied Edit');
  });

  it('2. an uncovered Write is PREVENTED via the delegate — identical deny shape, no bytes written', () => {
    dir = makeProject();
    const targetRel = path.join('src', 'lib', 'x.js');
    const targetAbs = path.join(dir, targetRel);

    const out = spawnHook(WRITE_HOOK, {
      tool_name: 'Write',
      tool_input: { file_path: targetAbs, content: 'const x = 1;\n' },
    }, dir);

    assert.equal(out.denied, true,
      `uncovered Write must emit permissionDecision:"deny"; stdout=${out.stdout} stderr=${out.stderr}`);
    assert.equal(out.decision.hookSpecificOutput.hookEventName, 'PreToolUse',
      'Write deny shape must be identical to Edit (same hookEventName)');
    // The hook decides only; it must not create the target.
    assert.equal(fs.existsSync(targetAbs), false,
      'a denied Write must not have written any bytes');
  });

  it('3. a plan-covered Edit is ALLOWED — no deny signal on stdout', () => {
    dir = makeProject();
    writeCoveringPlan(dir, 'in-progress', 'foo', ['src/**']);
    const targetAbs = path.join(dir, 'src', 'lib', 'x.js');

    const out = spawnHook(EDIT_HOOK, {
      tool_name: 'Edit',
      tool_input: { file_path: targetAbs },
    }, dir);

    // Exit 0 alone is necessary-but-not-sufficient now that deny is also exit 0;
    // assert the ABSENCE of the deny decision on stdout.
    assert.equal(out.denied, false,
      `plan-covered Edit must NOT emit a deny; stdout=${out.stdout} stderr=${out.stderr}`);
    assert.equal(out.status, 0, 'plan-covered Edit exits 0 (allow)');
  });

  it('4. an escape phrase ("hotfix") still ALLOWS — no deny signal on stdout', () => {
    dir = makeProject();
    const transcript = path.join(dir, 'transcript.txt');
    fs.writeFileSync(transcript,
      'user: please apply this hotfix to the parser, it is breaking prod\n');
    const targetAbs = path.join(dir, 'src', 'lib', 'x.js');

    const out = spawnHook(EDIT_HOOK, {
      tool_name: 'Edit',
      tool_input: { file_path: targetAbs },
      transcript_path: transcript,
    }, dir);

    assert.equal(out.denied, false,
      `escape phrase must ALLOW (no deny); stdout=${out.stdout} stderr=${out.stderr}`);
    assert.equal(out.status, 0, 'escape-phrase Edit exits 0 (allow)');
  });

  it('5. the deny reason names the real target — proving the actual target was evaluated', () => {
    dir = makeProject();
    const targetAbs = path.join(dir, 'src', 'lib', 'x.js');

    const out = spawnHook(EDIT_HOOK, {
      tool_name: 'Edit',
      tool_input: { file_path: targetAbs },
    }, dir);

    assert.equal(out.denied, true, 'uncovered Edit must deny');
    // The target path appears either in the machine reason or the human banner.
    const reasonNamesTarget =
      (out.reason && out.reason.includes('x.js')) ||
      (out.stderr && out.stderr.includes('x.js'));
    assert.ok(reasonNamesTarget,
      `deny must name the real target x.js; reason=${out.reason} stderr=${out.stderr}`);
  });
});
