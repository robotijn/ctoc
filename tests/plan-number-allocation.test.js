'use strict';

/**
 * Plan-number ALLOCATION + COLLISION-REFUSAL fence (plan 00120).
 *
 * Drives the three defects that let two plans share a number:
 *   A — the allocator scanned ONE stage directory while numbers live in SEVEN,
 *   B — an unreadable directory returned the SUCCESS value (00001),
 *   C — a pure read let two agents both "win" the same number.
 * And the REFUSAL predicate the PreToolUse Write hook enforces at plan-create time.
 *
 * Real os.tmpdir() fixtures, no test doubles for the filesystem — every case
 * builds a real plans/ tree and exercises the real module against disk. The one
 * seam is `opts.exclusiveCreate` on allocatePlanNumber (case: retry bound), which
 * simulates PERPETUAL race contention — a condition that cannot be produced
 * deterministically from a single process — and stubs ONLY the atomic-create
 * primitive, never the compute-next core.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { test, describe, beforeEach, afterEach } = require('node:test');

const WRITE_HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'PreToolUse.Write.js');

const {
  nextImplementationPlanNumber,
  allocatePlanNumber,
  findNumberCollisions,
  checkPlanWriteCollision,
  highestPlanNumber,
} = require('../src/lib/plan-numbering');

const { evaluateCollision, buildCollisionMessage } = require('../src/hooks/PreToolUse.Write.js');

// ── fixture helpers ──────────────────────────────────────────────────────────

function mkRoot(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ctoc-alloc-${tag}-`));
}

/** Create `plans/<stage>/<slug>.md` with minimal real frontmatter. */
function writePlan(root, stage, slug) {
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${slug}.md`),
    `---\ntitle: "${slug}"\ntype: implementation\ndepends_on: none\n---\n\n# ${slug}\n\nbody\n`,
    'utf8'
  );
}

/** Absolute path of a plan file (for a hook payload's file_path). */
function planPath(root, stage, slug) {
  return path.join(root, 'plans', stage, `${slug}.md`);
}

/**
 * Make a stage UNREADABLE on EVERY platform without touching permission bits:
 * replace the stage DIRECTORY with a regular FILE. `existsSync(stageDir)` stays
 * true (a file exists), so the scan does not treat it as an ABSENT stage;
 * `readdirSync` then throws ENOTDIR — a genuine I/O fault, no mock, no chmod, so
 * the case runs on win32 and as uid 0 alike (no skip). Same mechanism the sibling
 * stale-scan fence uses for its cross-platform unreadable-stage case.
 */
function makeStageUnreadable(root, stage) {
  const plansDir = path.join(root, 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  fs.writeFileSync(path.join(plansDir, stage), 'this is a file where a stage directory should be');
}

const rm = (root) => fs.rmSync(root, { recursive: true, force: true });

// ── Defect A + B: the allocator sees every stage; unreadable REFUSES ──────────

describe('nextImplementationPlanNumber / highestPlanNumber — global scan', () => {
  let root;
  beforeEach(() => { root = mkRoot('scan'); });
  afterEach(() => rm(root));

  test('case 1: numbers in review/ and todo/ with an EMPTY implementation/ are seen — NOT 00001', () => {
    // The deterministic collision, reproduced: numbers advanced past implementation.
    writePlan(root, 'review', '00001-alpha');
    writePlan(root, 'review', '00007-bravo');
    writePlan(root, 'todo', '00012-charlie');
    fs.mkdirSync(path.join(root, 'plans', 'implementation'), { recursive: true }); // empty

    const next = nextImplementationPlanNumber(root);
    assert.notEqual(next, '00001', 'must not collide with review/00001-alpha');
    assert.equal(next, '00013', 'next is above the global maximum (00012), not the impl-stage maximum');
  });

  test('case 2: the real repository spread — the answer exceeds every number present anywhere', () => {
    writePlan(root, 'review', '00029-r');
    writePlan(root, 'review', '00098-r2');
    writePlan(root, 'todo', '00090-t');
    writePlan(root, 'functional', '00067-f');
    writePlan(root, 'implementation', '00110-i');

    const next = nextImplementationPlanNumber(root);
    assert.equal(next, '00111', 'above the global max 00110');
    assert.equal(highestPlanNumber(root), 110);
  });

  test('case 3: an unreadable stage directory REFUSES (throws, names the path) — never a number', () => {
    writePlan(root, 'todo', '00005-x'); // a readable numbered plan in another stage
    makeStageUnreadable(root, 'review');
    assert.throws(
      () => highestPlanNumber(root),
      (err) => /plans\/review/.test(err.message),
      'must throw naming plans/review, not return a number derived from the readable stages'
    );
  });

  test('case 4: a genuinely empty plans/ returns 00001 (the fresh-project path)', () => {
    const bare = mkRoot('bare'); // no plans/ at all
    try {
      assert.equal(nextImplementationPlanNumber(bare), '00001');
      assert.equal(highestPlanNumber(bare), 0);
    } finally { rm(bare); }
  });

  test('case 5: an absent stage directory is normal — contributes nothing, no throw', () => {
    writePlan(root, 'review', '00003-y'); // only review exists; others absent
    assert.doesNotThrow(() => highestPlanNumber(root));
    assert.equal(nextImplementationPlanNumber(root), '00004');
  });
});

// ── Defect C: allocation is atomic; two allocations never collide ─────────────

describe('allocatePlanNumber — atomic, advisory, bounded', () => {
  let root;
  beforeEach(() => { root = mkRoot('claim'); fs.mkdirSync(path.join(root, 'plans'), { recursive: true }); });
  afterEach(() => rm(root));

  test('case 6: two allocations with no intervening write yield two DIFFERENT numbers', () => {
    const a = allocatePlanNumber(root);
    const b = allocatePlanNumber(root);
    assert.equal(a, '00001');
    assert.equal(b, '00002', 'the second allocation must not repeat the first (the lost update, fixed)');
  });

  test('case 7: interleaved allocate → write → allocate is strictly increasing', () => {
    const a = allocatePlanNumber(root);
    writePlan(root, 'implementation', `${a}-first`);
    const b = allocatePlanNumber(root);
    assert.ok(parseInt(b, 10) > parseInt(a, 10), `${b} must exceed ${a}`);
  });

  test('case 8: the claim is advisory — deleting the claims dir still stays above every filename', () => {
    writePlan(root, 'review', '00001-a');
    writePlan(root, 'review', '00002-b');
    const first = allocatePlanNumber(root); // 00003
    assert.equal(first, '00003');
    fs.rmSync(path.join(root, '.ctoc', 'state', 'plan-numbers'), { recursive: true, force: true });
    const again = allocatePlanNumber(root);
    assert.ok(parseInt(again, 10) > 2, 'never collides with an existing plan filename (00001/00002)');
  });

  test('case 9: perpetual race contention is BOUNDED — refuses loudly rather than looping forever', () => {
    // Simulate every atomic-create losing the race (EEXIST on every attempt). This
    // is the only non-deterministic branch — a genuine race cannot be forced from a
    // single process — so the exclusive-create primitive is injected; compute-next
    // still runs for real.
    let attempts = 0;
    const alwaysLoses = () => { attempts++; const e = new Error('EEXIST'); e.code = 'EEXIST'; throw e; };
    assert.throws(
      () => allocatePlanNumber(root, { exclusiveCreate: alwaysLoses }),
      /after \d+ attempts/,
      'a bounded retry converts a pathological loop into a loud failure'
    );
    assert.ok(attempts >= 50, `must have tried the full bound, saw ${attempts}`);
  });

  test('case 21: the claim survives a plan deletion — the number is SKIPPED, never re-issued', () => {
    const n = allocatePlanNumber(root); // 00001, claimed, no plan file yet
    assert.equal(n, '00001');
    writePlan(root, 'implementation', `${n}-used`);
    fs.rmSync(planPath(root, 'implementation', `${n}-used`)); // plan deleted; claim remains
    const next = allocatePlanNumber(root);
    assert.equal(next, '00002', 'the deleted plan\'s number 00001 is never re-issued');
  });
});

// ── findNumberCollisions ──────────────────────────────────────────────────────

describe('findNumberCollisions', () => {
  let root;
  beforeEach(() => { root = mkRoot('coll'); fs.mkdirSync(path.join(root, 'plans'), { recursive: true }); });
  afterEach(() => rm(root));

  test('case 10: two DIFFERENT plans at 00042 in different stages → one row naming both', () => {
    writePlan(root, 'review', '00042-foo');
    writePlan(root, 'implementation', '00042-bar');
    const rows = findNumberCollisions(root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].number, '00042');
    assert.deepEqual(rows[0].plans.sort(), ['00042-bar', '00042-foo']);
  });

  test('case 11: no duplicates → [] (reachable only from a completed scan)', () => {
    writePlan(root, 'review', '00001-a');
    writePlan(root, 'todo', '00002-b');
    assert.deepEqual(findNumberCollisions(root), []);
  });

  test('case 12: the same slug present in two stages is NOT a collision', () => {
    // The real 00067 shape (functional + todo) — same slug, still one plan.
    writePlan(root, 'functional', '00067-same');
    writePlan(root, 'todo', '00067-same');
    assert.deepEqual(findNumberCollisions(root), []);
  });

  test('case 12b: unnumbered plans are ignored, not counted or crashed on', () => {
    writePlan(root, 'vision', 'an-idea');
    writePlan(root, 'review', '00001-a');
    assert.doesNotThrow(() => findNumberCollisions(root));
    assert.deepEqual(findNumberCollisions(root), []);
  });
});

// ── checkPlanWriteCollision — the predicate, every edge case ───────────────────

describe('checkPlanWriteCollision — same number + different slug + different path', () => {
  let root;
  beforeEach(() => { root = mkRoot('pred'); fs.mkdirSync(path.join(root, 'plans'), { recursive: true }); });
  afterEach(() => rm(root));

  test('edge 1 → collision: a different slug holds the same number', () => {
    writePlan(root, 'review', '00098-foo');
    const r = checkPlanWriteCollision(root, 'plans/implementation/00098-baz.md');
    assert.equal(r.collides, true);
    assert.equal(r.conflictingPlan, '00098-foo');
    assert.equal(r.conflictingPath, 'plans/review/00098-foo.md');
    assert.equal(r.number, '00098');
  });

  test('edge 2 → allow: a MOVE (same number, same slug, different stage)', () => {
    writePlan(root, 'implementation', '00098-foo');
    const r = checkPlanWriteCollision(root, 'plans/todo/00098-foo.md');
    assert.equal(r.collides, false);
  });

  test('edge 3 → allow: a rewrite in place (target path equals the existing path)', () => {
    writePlan(root, 'implementation', '00099-bar');
    const r = checkPlanWriteCollision(root, 'plans/implementation/00099-bar.md');
    assert.equal(r.collides, false);
  });

  test('edge 4 → allow: the same plan present in two stages (00067)', () => {
    writePlan(root, 'functional', '00067-same');
    writePlan(root, 'todo', '00067-same');
    const r = checkPlanWriteCollision(root, 'plans/implementation/00067-same.md');
    assert.equal(r.collides, false);
  });

  test('edge 5 → allow: an unnumbered plan path is not in scope', () => {
    writePlan(root, 'review', '00001-a');
    const r = checkPlanWriteCollision(root, 'plans/vision/some-idea.md');
    assert.equal(r.collides, false);
    assert.equal(r.scanned, false, 'an unnumbered plan path reads no directory');
  });

  test('edge 6 → allow AND reads no directory: a non-plan write short-circuits', () => {
    writePlan(root, 'review', '00001-a');
    const r = checkPlanWriteCollision(root, 'src/lib/foo.js');
    assert.equal(r.collides, false);
    assert.equal(r.scanned, false, 'a non-plan write must not read any plans directory');
  });

  test('edge 7 → collision: a retitle-in-place cannot be distinguished (the accepted cost)', () => {
    writePlan(root, 'implementation', '00099-old-title');
    const r = checkPlanWriteCollision(root, 'plans/implementation/00099-new-title.md');
    assert.equal(r.collides, true);
    assert.equal(r.conflictingPath, 'plans/implementation/00099-old-title.md');
  });

  test('edge 8 → allow: reuse of a number freed by deletion (nothing holds it)', () => {
    writePlan(root, 'review', '00001-a');
    const r = checkPlanWriteCollision(root, 'plans/implementation/00042-new.md');
    assert.equal(r.collides, false, 'no file holds 00042 → the hook does not refuse');
  });

  test('edge 9 → unknown: an unreadable plans stage cannot be checked', () => {
    makeStageUnreadable(root, 'review');
    const r = checkPlanWriteCollision(root, 'plans/implementation/00050-z.md');
    assert.equal(r.unknown, true, 'an unreadable plans/ yields an explicit unknown, never a false collides');
  });
});

// ── the Write-hook decision (evaluateCollision) + the human-readable message ───

describe('evaluateCollision — the hook decision', () => {
  let root;
  beforeEach(() => { root = mkRoot('hook'); fs.mkdirSync(path.join(root, 'plans'), { recursive: true }); });
  afterEach(() => rm(root));

  const payloadFor = (root, stage, slug, transcriptPath) => ({
    tool_input: { file_path: planPath(root, stage, slug), content: '# x' },
    transcript_path: transcriptPath,
  });

  test('case 13: a genuine collision is REFUSED, message names the plan, its path, and the next free number', () => {
    writePlan(root, 'review', '00098-foo');
    const v = evaluateCollision(payloadFor(root, 'implementation', '00098-baz'), { projectPath: root });
    assert.equal(v.decision, 'deny');
    assert.match(v.message, /00098-foo/);
    assert.match(v.message, /plans\/review\/00098-foo\.md/);
    assert.match(v.message, /00099/, 'names the next free number');
  });

  test('case 14: a MOVE is allowed (the most important false-positive guard)', () => {
    writePlan(root, 'implementation', '00098-foo');
    const v = evaluateCollision(payloadFor(root, 'todo', '00098-foo'), { projectPath: root });
    assert.equal(v.decision, 'allow');
  });

  test('case 15: a rewrite in place is allowed', () => {
    writePlan(root, 'implementation', '00099-bar');
    const v = evaluateCollision(payloadFor(root, 'implementation', '00099-bar'), { projectPath: root });
    assert.equal(v.decision, 'allow');
  });

  test('case 16: the same plan in two stages is allowed', () => {
    writePlan(root, 'functional', '00067-same');
    writePlan(root, 'todo', '00067-same');
    const v = evaluateCollision(payloadFor(root, 'implementation', '00067-same'), { projectPath: root });
    assert.equal(v.decision, 'allow');
  });

  test('case 17: an unnumbered plan write is allowed', () => {
    writePlan(root, 'review', '00001-a');
    const v = evaluateCollision(payloadFor(root, 'vision', 'some-idea'), { projectPath: root });
    assert.equal(v.decision, 'allow');
  });

  test('case 19: a retitle IS refused, and the message names the delete-first resolution', () => {
    writePlan(root, 'implementation', '00099-old-title');
    const v = evaluateCollision(payloadFor(root, 'implementation', '00099-new-title'), { projectPath: root });
    assert.equal(v.decision, 'deny');
    assert.match(v.message, /delete/i, 'names the delete-first remedy');
    assert.match(v.message, /00099-old-title/);
  });

  test('case 20: reuse of a deleted number is allowed by the hook', () => {
    writePlan(root, 'review', '00001-a');
    const v = evaluateCollision(payloadFor(root, 'implementation', '00042-new'), { projectPath: root });
    assert.equal(v.decision, 'allow');
  });

  test('case 22: an unreadable plans/ ALLOWS and reports it could not check', () => {
    makeStageUnreadable(root, 'review');
    const v = evaluateCollision(payloadFor(root, 'implementation', '00050-z'), { projectPath: root });
    assert.equal(v.decision, 'unknown', 'could-not-check allows the write, distinguishable from a clean check');
  });

  test('case 23: the escape phrase bypasses the refusal (reusing escape-phrases.js)', () => {
    writePlan(root, 'review', '00098-foo');
    // A real transcript with a user-typed escape phrase — exercises escape-phrases.js.
    const tp = path.join(root, 'transcript.jsonl');
    fs.writeFileSync(tp, JSON.stringify({ type: 'user', message: { role: 'user', content: 'just a hotfix please' } }) + '\n');
    const v = evaluateCollision(payloadFor(root, 'implementation', '00098-baz', tp), { projectPath: root });
    assert.equal(v.decision, 'allow');
    assert.equal(v.escape, 'hotfix');
  });

  test('case 24: an internal fault inside the check ALLOWS the write (never blocks)', () => {
    const boom = () => { throw new Error('boom'); };
    const v = evaluateCollision(
      { tool_input: { file_path: planPath(root, 'implementation', '00098-baz'), content: '# x' } },
      { projectPath: root, checkPlanWriteCollision: boom }
    );
    assert.equal(v.decision, 'allow');
  });

  test('buildCollisionMessage strips control characters from the echoed slug', () => {
    const msg = buildCollisionMessage('plans/implementation/00098-baz.md', {
      number: '00098',
      conflictingPlan: '00098-foo\x07\x1b[31mevil',
      conflictingPath: 'plans/review/00098-foo.md',
      nextFree: '00099',
    });
    // No control characters in the echoed field — structural newlines (\n) and tabs
    // are legitimate message formatting, so the injected ESC / BEL are what must be gone.
    assert.doesNotMatch(msg, /[\x00-\x08\x0b-\x1f\x7f]/, 'ESC/BEL and other control characters must not reach the terminal message');
    assert.match(msg, /00098-foo\[31mevil/, 'the printable text survives, only the control bytes are stripped');
  });
});

// ── the REAL hook end-to-end (spawned) — the deny reaches the harness ──────────
// A unit test on evaluateCollision() alone never exercises the production
// stdin → main() → emitDeny path; the PI4 lesson (in this hook's own header) is
// that exactly such a path shipped broken. This drives the shipped hook the way
// the harness does: pipe a PreToolUse payload for a colliding plan write and prove
// the deny DECISION JSON lands on stdout with the hard-block exit.

describe('the REAL PreToolUse.Write hook refuses a colliding plan write end-to-end', () => {
  let root;
  beforeEach(() => {
    root = mkRoot('spawn');
    writePlan(root, 'review', '00098-scheduler-serial'); // the existing holder of 00098
  });
  afterEach(() => rm(root));

  test('a genuine collision → deny decision JSON on stdout + hard-block exit 2', () => {
    const payload = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'plans/implementation/00098-new-feature.md', content: '# new' },
    });
    const res = spawnSync(process.execPath, [WRITE_HOOK_PATH], {
      input: payload, cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    });
    assert.equal(res.signal, null, `child killed by signal ${res.signal}`);
    assert.equal(res.status, 2, `a collision must HARD-BLOCK (exit 2); stderr=${res.stderr}`);
    assert.match(res.stdout, /"permissionDecision"\s*:\s*"deny"/, 'the harness deny decision must be on stdout');
    assert.match(res.stdout, /00098-scheduler-serial/, 'the deny reason names the conflicting plan so the agent can act');
  });

  test('a non-colliding plan write is NOT blocked by the collision check (falls through to enforcement)', () => {
    // 00200 collides with nothing → the collision check allows and delegates. The
    // delegate's own decision is exercised elsewhere; here we only prove the
    // collision refusal does not fire (no deny JSON, no exit 2).
    const payload = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'plans/implementation/00200-fresh.md', content: '# fresh' },
    });
    const res = spawnSync(process.execPath, [WRITE_HOOK_PATH], {
      input: payload, cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    });
    assert.equal(res.signal, null, `child killed by signal ${res.signal}`);
    assert.doesNotMatch(res.stdout, /"permissionDecision"\s*:\s*"deny"/, 'a non-colliding plan write must not be denied by the collision check');
  });
});
