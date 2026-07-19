/**
 * Gate-3 verify-evidence forgery closed — deny `.ctoc/state/verify/` to every
 * editing tool.
 *
 * `src/lib/plan-validator.js` `validateReviewToDone` gates the review→done
 * transition (Gate 3) on the VERIFY EVIDENCE artifact
 * `.ctoc/state/verify/<slug>.json`, written PROGRAMMATICALLY by
 * `src/lib/step-13-verify.js` via safeFs (inside the CTOC process). That path is
 * NOT a tool call, so it is unaffected by the PreToolUse edit-family hooks.
 *
 * The defect this closes: the `/^\.ctoc\//` whitelist allowed an AGENT to Write
 * `.ctoc/state/verify/<slug>.json = {"passed":true,...}` through the Edit/Write
 * tools, forging the one automated assurance Gate 3 relies on — exactly the
 * back door `.ctoc/approvals/` was already carved out to close. This slice
 * extends the SAME deny to `.ctoc/state/verify/`, ahead of the whitelist, in the
 * shared `enforce()` that all four editing hooks route through.
 *
 * BEHAVIOR-first (assert DENIED vs ALLOWED, never a bare return value):
 *   - Predicate layer: the pure `isProtectedVerifyPath` predicate.
 *   - Decision layer: each of the four REAL hooks (Edit/Write/MultiEdit/
 *     NotebookEdit) spawned as a child Node process with a real PreToolUse JSON
 *     payload on stdin, asserting the harness deny JSON on stdout and that the
 *     evidence file on disk is untouched. No test doubles.
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
const HOOKS_DIR = path.join(REPO, 'src', 'hooks');
const EDIT_HOOK = path.join(HOOKS_DIR, 'PreToolUse.Edit.js');
const WRITE_HOOK = path.join(HOOKS_DIR, 'PreToolUse.Write.js');
const MULTIEDIT_HOOK = path.join(HOOKS_DIR, 'PreToolUse.MultiEdit.js');
const NOTEBOOKEDIT_HOOK = path.join(HOOKS_DIR, 'PreToolUse.NotebookEdit.js');

// Importing the module never runs enforcement (guarded by require.main === module),
// so the pure predicate can be driven directly, without stdin.
const { isProtectedVerifyPath, isProtectedLedgerPath } = require(EDIT_HOOK);

const { isCtocProject } = require(path.join(REPO, 'src', 'lib', 'ctoc-project-detector'));

const PLAN_STAGES = [
  'vision', 'canvas', 'functional', 'implementation',
  'todo', 'in-progress', 'review', 'done',
];

/** Build a hermetic, detectable CTOC temp project. */
function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-g3verify-')));
  for (const stage of PLAN_STAGES) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'state', 'verify'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    '# CTOC Project Instructions\n\nHermetic Gate-3 verify-evidence fixture.\n',
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

/**
 * Whether the hook emitted the harness's real deny signal on stdout: the JSON
 * decision `hookSpecificOutput.permissionDecision === "deny"` with exit 0; an
 * allow is exit 0 SILENT. Parses the LAST JSON object to tolerate preceding output.
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

/**
 * Spawn a real edit-family hook against an absolute target, payload on stdin.
 * `key` is the tool_input field the tool actually uses (file_path for
 * Edit/Write/MultiEdit, notebook_path for NotebookEdit).
 */
function runHook(hookPath, toolName, projectDir, targetAbs, key = 'file_path') {
  const res = spawnSync(process.execPath, [hookPath], {
    cwd: projectDir,
    input: JSON.stringify({ tool_name: toolName, tool_input: { [key]: targetAbs } }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
  });
  assert.equal(res.signal, null, `${toolName} hook killed by signal ${res.signal}`);
  return res;
}

// ---------------------------------------------------------------------------
// PREDICATE LAYER — isProtectedVerifyPath (pure, no process)
// ---------------------------------------------------------------------------

describe('Gate-3: isProtectedVerifyPath predicate', () => {
  it('is true for a direct evidence entry under .ctoc/state/verify/', () => {
    assert.equal(isProtectedVerifyPath('.ctoc/state/verify/some-plan.json'), true);
  });

  it('is true for a nested path under .ctoc/state/verify/', () => {
    assert.equal(isProtectedVerifyPath('.ctoc/state/verify/nested/y.json'), true);
  });

  it('is true for the .ctoc/state/verify directory itself', () => {
    assert.equal(isProtectedVerifyPath('.ctoc/state/verify'), true);
  });

  it('is true for the ABSOLUTE form under process.cwd()', () => {
    const abs = path.join(process.cwd(), '.ctoc', 'state', 'verify', 'foo.json');
    assert.equal(isProtectedVerifyPath(abs), true);
  });

  it('is false for a sibling .ctoc/state/ path that is not verify/', () => {
    assert.equal(isProtectedVerifyPath('.ctoc/state/other.json'), false);
  });

  it('is false for .ctoc/logs/ and .ctoc/settings.yaml (not verify evidence)', () => {
    assert.equal(isProtectedVerifyPath('.ctoc/logs/z.json'), false);
    assert.equal(isProtectedVerifyPath('.ctoc/settings.yaml'), false);
  });

  it('is false for a traversal that escapes the verify dir via ..', () => {
    assert.equal(isProtectedVerifyPath('.ctoc/state/verify/../escape.js'), false);
  });

  it('is false for an empty / missing path', () => {
    assert.equal(isProtectedVerifyPath(''), false);
    assert.equal(isProtectedVerifyPath(null), false);
    assert.equal(isProtectedVerifyPath(undefined), false);
  });

  it('does not match a prefix sibling like .ctoc/state/verifyOTHER/', () => {
    // Guard against a naive startsWith('.ctoc/state/verify') that would wrongly
    // catch a same-prefix sibling directory.
    assert.equal(isProtectedVerifyPath('.ctoc/state/verifyOTHER/x.json'), false);
  });

  // --- HIGH gate-bypass: case-insensitive + traversal-robust protected match ---

  it('is true for an UPPERCASE .ctoc/state/VERIFY/ segment (case-insensitive)', () => {
    // On macOS APFS and Windows the OS routes an UPPERCASE write into the REAL
    // lowercase verify/ dir; a case-sensitive gate that let it through was forgeable.
    assert.equal(isProtectedVerifyPath('.ctoc/state/VERIFY/forged.json'), true);
  });

  it('is true for a MIXED-case .ctoc/State/Verify/ segment (case-insensitive)', () => {
    assert.equal(isProtectedVerifyPath('.ctoc/State/Verify/x.json'), true);
  });

  it('is true for a traversal that RESOLVES BACK INTO the verify dir', () => {
    // `.ctoc/state/verify/../verify/x` resolves into the protected dir; the match
    // must be robust to `..` that lands back inside, not evadable by it.
    assert.equal(isProtectedVerifyPath('.ctoc/state/verify/../verify/x.json'), true);
  });

  it('does not match a same-prefix sibling .ctoc/state/verifel/ (segment precise)', () => {
    // Lowercasing must not collapse segment precision — verifel is NOT verify.
    assert.equal(isProtectedVerifyPath('.ctoc/state/verifel/x.json'), false);
  });
});

// ---------------------------------------------------------------------------
// DECISION LAYER — all four real hooks, real subprocess, real evidence path
// ---------------------------------------------------------------------------

describe('Gate-3: enforce() denies writes under .ctoc/state/verify/ (subprocess)', () => {
  let dir;
  afterEach(() => { cleanup(dir); dir = undefined; });

  it('harness sanity: the temp project is a detectable CTOC project', () => {
    dir = makeProject();
    assert.equal(isCtocProject(dir).isCtoc, true,
      'fixture must be a detectable CTOC project or the deny assertions are meaningless');
  });

  const editTools = [
    ['Edit', EDIT_HOOK, 'file_path'],
    ['Write', WRITE_HOOK, 'file_path'],
    ['MultiEdit', MULTIEDIT_HOOK, 'file_path'],
    ['NotebookEdit', NOTEBOOKEDIT_HOOK, 'notebook_path'],
  ];

  for (const [tool, hook, key] of editTools) {
    it(`DENIES a ${tool} forging a NEW .ctoc/state/verify/<slug>.json and creates no file`, () => {
      dir = makeProject();
      const targetAbs = path.join(dir, '.ctoc', 'state', 'verify', 'forged-plan.json');

      const res = runHook(hook, tool, dir, targetAbs, key);

      assert.equal(deniedOnStdout(res), true,
        `a ${tool} under .ctoc/state/verify/ must BLOCK via permissionDecision:"deny"; stdout=${res.stdout} stderr=${res.stderr}`);
      assert.equal(fs.existsSync(targetAbs), false,
        'a denied verify-evidence write must not have created the file');
    });
  }

  it('DENIES an Edit tampering with EXISTING verify evidence and leaves its bytes untouched', () => {
    dir = makeProject();
    const targetAbs = path.join(dir, '.ctoc', 'state', 'verify', 'existing-plan.json');
    const before = '{"passed":false,"timestamp":"2026-07-16T00:00:00.000Z","summary":"real fail"}\n';
    fs.writeFileSync(targetAbs, before);

    const res = runHook(EDIT_HOOK, 'Edit', dir, targetAbs, 'file_path');

    assert.equal(deniedOnStdout(res), true,
      `tampering with existing verify evidence must BLOCK; stdout=${res.stdout} stderr=${res.stderr}`);
    assert.equal(fs.readFileSync(targetAbs, 'utf8'), before,
      'the verify evidence bytes must be identical after a denied Edit');
  });

  it('the deny reason names verify evidence / pipeline provenance (proves the branch was reached)', () => {
    dir = makeProject();
    const targetAbs = path.join(dir, '.ctoc', 'state', 'verify', 'forged-plan.json');

    const res = runHook(EDIT_HOOK, 'Edit', dir, targetAbs, 'file_path');
    assert.equal(deniedOnStdout(res), true, 'verify-evidence write must deny');
    const out = `${res.stdout} ${res.stderr}`;
    assert.ok(/verify/.test(out) && /pipeline/i.test(out),
      `deny output must name verify evidence + that the pipeline writes it; stdout=${res.stdout} stderr=${res.stderr}`);
  });

  it('DENIES an Edit forging UPPERCASE .ctoc/state/VERIFY/<slug>.json (case-insensitive gate)', () => {
    dir = makeProject();
    // Absolute UPPERCASE-segment target: on this case-insensitive filesystem it
    // routes into the REAL lowercase verify/ dir. The gate must deny regardless.
    const targetAbs = path.join(dir, '.ctoc', 'state', 'VERIFY', 'forged-plan.json');

    const res = runHook(EDIT_HOOK, 'Edit', dir, targetAbs, 'file_path');

    assert.equal(deniedOnStdout(res), true,
      `an uppercase .ctoc/state/VERIFY/ write must BLOCK; stdout=${res.stdout} stderr=${res.stderr}`);
    assert.equal(fs.existsSync(targetAbs), false,
      'a denied verify-evidence write must not have created the file');
  });

  it('DENIES a RELATIVE-path traversal into verify EVEN under an active escape phrase', () => {
    dir = makeProject();
    // A transcript where the USER typed an escape phrase — which would otherwise
    // ALLOW a non-covered edit. The verify carve-out must win regardless, and a
    // `..` that resolves back into verify/ must not evade the protected match.
    const transcriptPath = path.join(dir, 'transcript.jsonl');
    fs.writeFileSync(transcriptPath,
      `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'please hotfix this' } })}\n`);
    const relTarget = '.ctoc/state/verify/../verify/forged.json';

    const res = spawnSync(process.execPath, [EDIT_HOOK], {
      cwd: dir,
      input: JSON.stringify({
        tool_name: 'Edit',
        tool_input: { file_path: relTarget },
        transcript_path: transcriptPath,
      }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    });
    assert.equal(res.signal, null, `edit hook killed by signal ${res.signal}`);
    assert.equal(deniedOnStdout(res), true,
      `a traversal into verify must deny even under an escape phrase; stdout=${res.stdout} stderr=${res.stderr}`);
  });

  // ---- Regression: every other whitelist / deny behavior is preserved --------

  it('REGRESSION: a write to .ctoc/approvals/ is still DENIED', () => {
    dir = makeProject();
    const targetAbs = path.join(dir, '.ctoc', 'approvals', 'x.json');

    const res = runHook(EDIT_HOOK, 'Edit', dir, targetAbs, 'file_path');
    assert.equal(deniedOnStdout(res), true,
      `the approvals ledger carve-out must still deny; stdout=${res.stdout} stderr=${res.stderr}`);
    // The two carve-outs are independent predicates.
    assert.equal(isProtectedLedgerPath('.ctoc/approvals/x.json'), true);
    assert.equal(isProtectedVerifyPath('.ctoc/approvals/x.json'), false);
  });

  it('REGRESSION: a sibling .ctoc/logs/ write stays ALLOWED (no deny, exit 0)', () => {
    dir = makeProject();
    const targetAbs = path.join(dir, '.ctoc', 'logs', 'foo.json');

    const res = runHook(EDIT_HOOK, 'Edit', dir, targetAbs, 'file_path');
    assert.equal(deniedOnStdout(res), false,
      `.ctoc/logs/ stays whitelisted → must NOT carry the deny signal; stdout=${res.stdout} stderr=${res.stderr}`);
    assert.equal(res.status, 0, '.ctoc/logs/ write is allowed → exit 0');
  });

  it('REGRESSION: a whitelisted .ctoc/settings.yaml write stays ALLOWED (no deny, exit 0)', () => {
    dir = makeProject();
    const targetAbs = path.join(dir, '.ctoc', 'settings.yaml');

    const res = runHook(EDIT_HOOK, 'Edit', dir, targetAbs, 'file_path');
    assert.equal(deniedOnStdout(res), false,
      `.ctoc/settings.yaml stays whitelisted → no deny; stdout=${res.stdout} stderr=${res.stderr}`);
    assert.equal(res.status, 0, '.ctoc/settings.yaml write is allowed → exit 0');
  });

  it('REGRESSION: a normal source edit under a covering plan stays ALLOWED (no deny, exit 0)', () => {
    dir = makeProject();
    // A plan in in-progress declaring coverage of src/feature/**, carrying the REAL
    // Gate 2 approval that makes it grant that coverage. Only an APPROVED plan grants
    // write access — a plan file is edit-whitelisted, so authoring one proves nothing
    // — and "a covering plan" here means one a human approved. The `stage_to` is
    // `todo`, exactly as production records it: `in-progress` is not a gate
    // destination, so no ledger entry ever names it, and a building plan carries the
    // Gate 2 entry it crossed with.
    const coverPlan = path.join(dir, 'plans', 'in-progress', 'cover.md');
    const coverContent = [
      '---',
      'title: covering plan',
      'program: ctoc-v7',
      'files:',
      '  - "src/feature/**"',
      '---',
      '',
      '# covering plan',
      '',
    ].join('\n');
    fs.writeFileSync(coverPlan, coverContent);
    const ledger = require('../src/lib/approval-ledger');
    ledger.writeEntry(ledger.slugFromPlanPath(coverPlan), {
      content: coverContent,
      stage_from: 'implementation',
      stage_to: 'todo',
      approved_by: 'human',
    }, dir);
    const srcDir = path.join(dir, 'src', 'feature');
    fs.mkdirSync(srcDir, { recursive: true });
    const targetAbs = path.join(srcDir, 'widget.js');
    fs.writeFileSync(targetAbs, '// existing\n');

    const res = runHook(EDIT_HOOK, 'Edit', dir, targetAbs, 'file_path');
    assert.equal(deniedOnStdout(res), false,
      `a covered source edit must NOT be denied; stdout=${res.stdout} stderr=${res.stderr}`);
    assert.equal(res.status, 0, 'a covered source edit is allowed → exit 0');
  });
});
