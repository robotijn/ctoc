/**
 * W01-s3 — MultiEdit + NotebookEdit enforce via enforce() (finding C3), plus the
 * 5-surface uniform-protocol capstone.
 *
 * These tests spawn the ACTUAL hook files as real Node subprocesses with a real
 * PreToolUse JSON payload on stdin — exactly as the Claude Code harness invokes
 * them — and assert on the REAL channel the harness reads: the parsed stdout
 * decision JSON (`hookSpecificOutput.permissionDecision`). No test doubles, no
 * mocked core logic; the deny/allow decision is observed on the process boundary.
 *
 * Why spawn the delegate as its OWN process entry (never PreToolUse.Edit.js with a
 * substituted tool_name): finding C3 is precisely that
 * `PreToolUse.MultiEdit.js` / `PreToolUse.NotebookEdit.js` contained a bare
 * `require('./PreToolUse.Edit.js')`, and Edit's enforcement runs only under
 * `require.main === module`. When Edit is required from a sibling, `require.main`
 * is the sibling, the guard is false, and NEITHER file enforces anything. An
 * in-process call to `enforce()`, or spawning Edit itself, would not exercise the
 * sibling entry point and so would not catch C3. Every case below spawns the
 * delegate's own file.
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
const MULTIEDIT_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.MultiEdit.js');
const NOTEBOOKEDIT_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.NotebookEdit.js');
const BASH_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Bash.js');

const { isCtocProject } = require(path.join(REPO, 'src', 'lib', 'ctoc-project-detector'));

const PLAN_STAGES = [
  'vision', 'canvas', 'functional', 'implementation',
  'todo', 'in-progress', 'review', 'done',
];

/** Build a hermetic, detectable CTOC temp project. */
function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w01-s3-')));
  for (const stage of PLAN_STAGES) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    '# CTOC Project Instructions\n\nHermetic W01-s3 fixture.\n',
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
 */
function decode(res) {
  const stdout = res.stdout ? String(res.stdout) : '';
  const stderr = res.stderr ? String(res.stderr) : '';
  const decision = lastJsonObject(stdout);
  const hso = decision && decision.hookSpecificOutput ? decision.hookSpecificOutput : null;
  return {
    status: typeof res.status === 'number' ? res.status : null,
    denied: hso ? hso.permissionDecision === 'deny' : false,
    reason: hso && typeof hso.permissionDecisionReason === 'string' ? hso.permissionDecisionReason : null,
    hookEventName: hso ? hso.hookEventName : null,
    permissionDecision: hso ? hso.permissionDecision : null,
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

describe('W01-s3: MultiEdit + NotebookEdit enforce via their own entry (subprocess)', () => {
  let dir;
  afterEach(() => { cleanup(dir); dir = undefined; });

  it('harness sanity: the temp project is a detectable CTOC project', () => {
    dir = makeProject();
    assert.equal(isCtocProject(dir).isCtoc, true,
      'fixture must be a detectable CTOC project or the deny assertions are meaningless');
  });

  it('1. an uncovered MultiEdit is PREVENTED — deny JSON emitted from its OWN entry, target bytes unchanged', () => {
    dir = makeProject();
    const targetAbs = path.join(dir, 'src', 'lib', 'x.js');
    fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
    const before = 'const original = 1;\n';
    fs.writeFileSync(targetAbs, before);

    const out = spawnHook(MULTIEDIT_HOOK, {
      tool_name: 'MultiEdit',
      tool_input: {
        file_path: targetAbs,
        edits: [{ old_string: 'const original = 1;', new_string: 'const original = 2;' }],
      },
    }, dir);

    assert.equal(out.denied, true,
      `uncovered MultiEdit must emit permissionDecision:"deny"; stdout=${out.stdout} stderr=${out.stderr}`);
    assert.equal(out.hookEventName, 'PreToolUse',
      'MultiEdit deny shape must match Edit (same hookEventName)');
    // The hook only decides; it never writes — bytes must be identical.
    assert.equal(fs.readFileSync(targetAbs, 'utf8'), before,
      'target file bytes must be unchanged by a denied MultiEdit');
  });

  it('2. an uncovered NotebookEdit is PREVENTED — deny JSON emitted, notebook unchanged', () => {
    dir = makeProject();
    const notebookAbs = path.join(dir, 'src', 'analysis.ipynb');
    fs.mkdirSync(path.dirname(notebookAbs), { recursive: true });
    const before = '{"cells": [], "metadata": {}, "nbformat": 4, "nbformat_minor": 5}\n';
    fs.writeFileSync(notebookAbs, before);

    const out = spawnHook(NOTEBOOKEDIT_HOOK, {
      tool_name: 'NotebookEdit',
      tool_input: {
        notebook_path: notebookAbs,
        new_source: "print('injected')",
      },
    }, dir);

    assert.equal(out.denied, true,
      `uncovered NotebookEdit must emit permissionDecision:"deny"; stdout=${out.stdout} stderr=${out.stderr}`);
    assert.equal(out.hookEventName, 'PreToolUse',
      'NotebookEdit deny shape must match Edit (same hookEventName)');
    assert.equal(fs.readFileSync(notebookAbs, 'utf8'), before,
      'notebook bytes must be unchanged by a denied NotebookEdit');
  });

  it('3. enforce() fires from the sibling entry point — MultiEdit is require.main, yet a deny is still emitted', () => {
    // This is the direct C3 regression guard: proving enforcement does NOT depend
    // on PreToolUse.Edit.js being require.main === module. MultiEdit is the process
    // entry; Edit is only required by it. The deny below can only appear if the new
    // main() in the delegate calls the exported enforce().
    dir = makeProject();
    const targetAbs = path.join(dir, 'src', 'lib', 'y.js');

    const out = spawnHook(MULTIEDIT_HOOK, {
      tool_name: 'MultiEdit',
      tool_input: { file_path: targetAbs, edits: [{ old_string: 'a', new_string: 'b' }] },
    }, dir);

    assert.equal(out.denied, true,
      `deny must be emitted from the sibling entry point (C3 fix); stdout=${out.stdout} stderr=${out.stderr}`);
  });

  it('4. a plan-covered MultiEdit is ALLOWED — deny signal ABSENT (not merely exit 0)', () => {
    dir = makeProject();
    writeCoveringPlan(dir, 'in-progress', 'foo', ['src/**']);
    const targetAbs = path.join(dir, 'src', 'lib', 'x.js');

    const out = spawnHook(MULTIEDIT_HOOK, {
      tool_name: 'MultiEdit',
      tool_input: { file_path: targetAbs, edits: [{ old_string: 'a', new_string: 'b' }] },
    }, dir);

    assert.equal(out.denied, false,
      `plan-covered MultiEdit must NOT emit a deny; stdout=${out.stdout} stderr=${out.stderr}`);
    assert.equal(out.status, 0, 'plan-covered MultiEdit exits 0 (allow)');
  });

  it('4b. a plan-covered NotebookEdit is ALLOWED — deny signal ABSENT', () => {
    dir = makeProject();
    writeCoveringPlan(dir, 'in-progress', 'foo', ['src/**']);
    const notebookAbs = path.join(dir, 'src', 'analysis.ipynb');

    const out = spawnHook(NOTEBOOKEDIT_HOOK, {
      tool_name: 'NotebookEdit',
      tool_input: { notebook_path: notebookAbs, new_source: 'print(1)' },
    }, dir);

    assert.equal(out.denied, false,
      `plan-covered NotebookEdit must NOT emit a deny; stdout=${out.stdout} stderr=${out.stderr}`);
    assert.equal(out.status, 0, 'plan-covered NotebookEdit exits 0 (allow)');
  });

  it('5. CAPSTONE — all five PreToolUse surfaces emit the byte-identical deny shape', () => {
    dir = makeProject();
    const targetAbs = path.join(dir, 'src', 'lib', 'x.js');

    // The four editing surfaces receive the SAME uncovered target.
    const editingPayloads = {
      Edit: { hook: EDIT_HOOK, payload: { tool_name: 'Edit', tool_input: { file_path: targetAbs } } },
      Write: { hook: WRITE_HOOK, payload: { tool_name: 'Write', tool_input: { file_path: targetAbs, content: 'x\n' } } },
      MultiEdit: { hook: MULTIEDIT_HOOK, payload: { tool_name: 'MultiEdit', tool_input: { file_path: targetAbs, edits: [{ old_string: 'a', new_string: 'b' }] } } },
      NotebookEdit: { hook: NOTEBOOKEDIT_HOOK, payload: { tool_name: 'NotebookEdit', tool_input: { notebook_path: targetAbs } } },
    };

    const shapes = [];
    for (const [surface, { hook, payload }] of Object.entries(editingPayloads)) {
      const out = spawnHook(hook, payload, dir);
      assert.equal(out.denied, true,
        `${surface} must emit a deny in the capstone; stdout=${out.stdout} stderr=${out.stderr}`);
      shapes.push({ surface, hookEventName: out.hookEventName, permissionDecision: out.permissionDecision });
    }

    // The Bash gate is denied on an irreversible command delivered on stdin — the
    // s2 surface the capstone depends on. Same shared protocol, no different shape.
    const bashOut = spawnHook(BASH_HOOK, {
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf plans' },
    }, dir);
    assert.equal(bashOut.denied, true,
      `Bash gate must emit a deny for 'rm -rf plans' on stdin; stdout=${bashOut.stdout} stderr=${bashOut.stderr}`);
    shapes.push({ surface: 'Bash', hookEventName: bashOut.hookEventName, permissionDecision: bashOut.permissionDecision });

    // Every surface must carry the IDENTICAL harness-visible deny shape: the same
    // hookEventName and the same permissionDecision. No surface diverges.
    assert.equal(shapes.length, 5, 'exactly five surfaces must be exercised');
    for (const s of shapes) {
      assert.equal(s.hookEventName, 'PreToolUse',
        `${s.surface} must use hookEventName "PreToolUse"`);
      assert.equal(s.permissionDecision, 'deny',
        `${s.surface} must use permissionDecision "deny"`);
    }
    // Cross-check: reduce to the distinct (hookEventName, permissionDecision) pairs.
    const distinct = new Set(shapes.map((s) => `${s.hookEventName}|${s.permissionDecision}`));
    assert.equal(distinct.size, 1,
      `all five surfaces must share ONE deny shape; got: ${[...distinct].join(', ')}`);
  });
});
