/**
 * W02-s2 — Deny-list `.ctoc/approvals/` to every editing tool (finding C4).
 *
 * The approval ledger under `.ctoc/approvals/` is the SINGLE source of
 * human-approval truth (slice s1, `src/lib/approval-ledger.js`). If an agent
 * tool call could write there, it could forge its own approval and re-open C4
 * through the back door — the `.ctoc/` whitelist currently allows the entire
 * `.ctoc/` subtree unconditionally. This slice makes `enforce()` DENY any
 * Edit/Write/MultiEdit/NotebookEdit whose target is under `.ctoc/approvals/`,
 * ahead of that whitelist.
 *
 * Two layers, both BEHAVIOR-first (assert DENIED vs ALLOWED, never a bare
 * return value):
 *
 *   - Predicate layer: the pure `isProtectedLedgerPath` predicate.
 *   - Decision layer: the REAL hook spawned as a child Node process with a real
 *     PreToolUse JSON payload on stdin, asserting the harness deny JSON on
 *     stdout and that the ledger file on disk is untouched. No test doubles.
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

// Importing the module never runs enforcement (guarded by require.main === module),
// so the pure predicate can be driven directly, without stdin.
const { isProtectedLedgerPath } = require(path.join(REPO, 'src', 'hooks', 'PreToolUse.Edit.js'));

const { isCtocProject } = require(path.join(REPO, 'src', 'lib', 'ctoc-project-detector'));

const PLAN_STAGES = [
  'vision', 'canvas', 'functional', 'implementation',
  'todo', 'in-progress', 'review', 'done',
];

/** Build a hermetic, detectable CTOC temp project (mirrors the e2e fixture). */
function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w02s2-')));
  for (const stage of PLAN_STAGES) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    '# CTOC Project Instructions\n\nHermetic W02-s2 fixture.\n',
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
 * Whether the hook emitted the harness's real deny signal on stdout. Under the
 * W01 deny protocol (ADR-1) a deny is the JSON decision
 * `hookSpecificOutput.permissionDecision === "deny"` on stdout with exit 0; an
 * allow is exit 0 SILENT (no JSON). Parses the LAST JSON object to tolerate any
 * preceding output. Mirrors `deniedOnStdout` in e2e-enforcement-and-gates.test.js.
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

/** Spawn the real Edit hook against an absolute target, payload on stdin. */
function runEditHook(projectDir, targetAbs) {
  const res = spawnSync(process.execPath, [EDIT_HOOK], {
    cwd: projectDir,
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: targetAbs } }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
  });
  assert.equal(res.signal, null, `edit hook killed by signal ${res.signal}`);
  return res;
}

// ---------------------------------------------------------------------------
// PREDICATE LAYER — isProtectedLedgerPath (pure, no process)
// ---------------------------------------------------------------------------

describe('W02-s2: isProtectedLedgerPath predicate', () => {
  it('is true for a direct ledger entry under .ctoc/approvals/', () => {
    assert.equal(isProtectedLedgerPath('.ctoc/approvals/x.json'), true);
  });

  it('is true for a nested path under .ctoc/approvals/', () => {
    assert.equal(isProtectedLedgerPath('.ctoc/approvals/nested/y.json'), true);
  });

  it('is true for the .ctoc/approvals directory itself', () => {
    assert.equal(isProtectedLedgerPath('.ctoc/approvals'), true);
  });

  it('is true for the ABSOLUTE form under process.cwd()', () => {
    const abs = path.join(process.cwd(), '.ctoc', 'approvals', 'foo.json');
    assert.equal(isProtectedLedgerPath(abs), true);
  });

  it('is false for a sibling .ctoc/logs/ path (not the ledger)', () => {
    assert.equal(isProtectedLedgerPath('.ctoc/logs/z.json'), false);
  });

  it('is false for .ctoc/settings.yaml (not the ledger)', () => {
    assert.equal(isProtectedLedgerPath('.ctoc/settings.yaml'), false);
  });

  it('is false for a plans/ file (not the ledger)', () => {
    assert.equal(isProtectedLedgerPath('plans/done/p.md'), false);
  });

  it('is false for a traversal that escapes the ledger via .. ', () => {
    // .ctoc/approvals/../escape.js resolves OUT of the ledger; the shared
    // traversal rejection must refuse to treat it as protected (it is caught by
    // the normal whitelist/coverage flow instead, never silently "protected").
    assert.equal(isProtectedLedgerPath('.ctoc/approvals/../escape.js'), false);
  });

  it('is false for an empty / missing path', () => {
    assert.equal(isProtectedLedgerPath(''), false);
    assert.equal(isProtectedLedgerPath(null), false);
    assert.equal(isProtectedLedgerPath(undefined), false);
  });

  it('does not match a prefix sibling like .ctoc/approvals-backup/', () => {
    // Guard against a naive startsWith('.ctoc/approvals') that would wrongly
    // catch a same-prefix sibling directory.
    assert.equal(isProtectedLedgerPath('.ctoc/approvals-backup/x.json'), false);
  });
});

// ---------------------------------------------------------------------------
// DECISION LAYER — real hook, real subprocess, real ledger path on disk
// ---------------------------------------------------------------------------

describe('W02-s2: enforce() denies writes under .ctoc/approvals/ (subprocess)', () => {
  let dir;
  afterEach(() => { cleanup(dir); dir = undefined; });

  it('harness sanity: the temp project is a detectable CTOC project', () => {
    dir = makeProject();
    assert.equal(isCtocProject(dir).isCtoc, true,
      'fixture must be a detectable CTOC project or the deny assertions are meaningless');
  });

  it('DENIES an Edit targeting a NEW .ctoc/approvals/<slug>.json and creates no file', () => {
    dir = makeProject();
    const targetAbs = path.join(dir, '.ctoc', 'approvals', 'forged.json');

    const res = runEditHook(dir, targetAbs);

    assert.equal(deniedOnStdout(res), true,
      `a write under .ctoc/approvals/ must BLOCK via permissionDecision:"deny" on stdout; stdout=${res.stdout} stderr=${res.stderr}`);
    // The hook only decides — it must never create the ledger entry.
    assert.equal(fs.existsSync(targetAbs), false,
      'a denied ledger write must not have created the entry file');
  });

  it('DENIES an Edit targeting an EXISTING ledger entry and leaves its bytes untouched', () => {
    dir = makeProject();
    const approvalsDir = path.join(dir, '.ctoc', 'approvals');
    fs.mkdirSync(approvalsDir, { recursive: true });
    const targetAbs = path.join(approvalsDir, 'existing.json');
    const before = '{"content_sha256":"deadbeef","stage_from":"review","stage_to":"done"}\n';
    fs.writeFileSync(targetAbs, before);

    const res = runEditHook(dir, targetAbs);

    assert.equal(deniedOnStdout(res), true,
      `tampering with an existing ledger entry must BLOCK; stdout=${res.stdout} stderr=${res.stderr}`);
    assert.equal(fs.readFileSync(targetAbs, 'utf8'), before,
      'the ledger entry bytes must be identical after a denied Edit');
  });

  it('the deny reason names the ledger policy (proves the branch was reached)', () => {
    dir = makeProject();
    const targetAbs = path.join(dir, '.ctoc', 'approvals', 'forged.json');

    const res = runEditHook(dir, targetAbs);
    assert.equal(deniedOnStdout(res), true, 'ledger write must deny');
    const namesLedger =
      /approvals/.test(String(res.stdout)) || /approvals/.test(String(res.stderr));
    assert.ok(namesLedger,
      `deny output must name the .ctoc/approvals/ policy; stdout=${res.stdout} stderr=${res.stderr}`);
  });

  it('ALLOWS a sibling .ctoc/logs/ write (whitelist unaffected — no deny)', () => {
    dir = makeProject();
    const targetAbs = path.join(dir, '.ctoc', 'logs', 'foo.json');

    const res = runEditHook(dir, targetAbs);

    assert.equal(deniedOnStdout(res), false,
      `.ctoc/logs/ stays whitelisted → must NOT carry the deny signal; stdout=${res.stdout} stderr=${res.stderr}`);
    assert.equal(res.status, 0, '.ctoc/logs/ write is allowed → exit 0');
  });

  it('ALLOWS a whitelisted .ctoc/settings.yaml write (no ledger, no deny)', () => {
    dir = makeProject();
    const targetAbs = path.join(dir, '.ctoc', 'settings.yaml');

    const res = runEditHook(dir, targetAbs);

    assert.equal(deniedOnStdout(res), false,
      `.ctoc/settings.yaml stays whitelisted → no deny; stdout=${res.stdout} stderr=${res.stderr}`);
    assert.equal(res.status, 0, '.ctoc/settings.yaml write is allowed → exit 0');
  });
});
