'use strict';

/**
 * REJECTION SENDS A PLAN BACK ONE STAGE — not four (plan 00085).
 *
 * `actions.rejectPlan` used to `movePlan(plan, 'functional')` unconditionally, so a
 * Gate-3 rejection dropped a plan from `review` (order 4) all the way to `functional`
 * (order 0), past two other human gates. It also (D2) prepended the rejection header
 * ABOVE the frontmatter — destroying the plan's byte-zero `---` block and, with it,
 * every reader's view of its `files:` write-surface grant — (D3) left the
 * `approved_by: human` marker in place, and (D4) orphaned the approval-ledger entry so
 * a stale `stage_to` could re-accept the plan at a non-hash-sensitive gate destination.
 *
 * These tests drive the REAL `rejectPlan`, the REAL `approval-ledger`, the REAL
 * `human-gate-check`/`approval-residency` classifier and the REAL `plan-coverage`
 * scanner against a REAL temp plan tree in `os.tmpdir()`. No test doubles except the
 * ONE injectable `deps.removeEntry` seam that forces the ledger withdrawal to throw
 * (the real `removeEntry` swallows its own errors, so a throw cannot be provoked
 * otherwise) — mirroring the seam pattern `stampAndLedger` already uses.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const actions = require('../src/lib/actions');
const gateOrder = require('../src/lib/gate-order');
const ledger = require('../src/lib/approval-ledger');
const { parseMetadata } = require('../src/lib/state');
const { classifyResidency } = require('../src/lib/approval-residency');
const { readPlanFiles, findCoveringPlan } = require('../src/lib/plan-coverage');

const STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const tmpDirs = [];

after(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-reject-'));
  tmpDirs.push(dir);
  for (const stage of STAGES) fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  return dir;
}

/**
 * Write a plan into a stage folder. When `markerBlock` is true the plan carries a
 * PRECEDING stacked gate-stamp block exactly as `addApprovalMarker`/`stampAndLedger`
 * leave it (its OWN `---…---` opener, then the plan's own block) — the real shape of
 * a plan that has crossed a human gate. `files` becomes the plan's `files:` list.
 */
function writePlan(dir, stage, slug, { markerBlock = false, files = ['src/foo.js'], body = 'Body content.' } = {}) {
  const filesLines = files.length
    ? 'files:\n' + files.map((f) => `  - "${f}"`).join('\n') + '\n'
    : '';
  const marker = markerBlock
    ? '---\napproved_by: human\napproved_at: 2026-07-19T00:00:00.000Z\ngate_crossed: implementation → todo\n---\n\n'
    : '';
  const own = `---\ntitle: "The ${slug} plan"\ntype: implementation\n${filesLines}---\n`;
  const content = `${marker}${own}\n# ${slug}\n\n${body}\n`;
  const p = path.join(dir, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, content);
  return p;
}

// ── 1-4: each gate edge's ONE-STAGE-BACK target ──────────────────────────────

describe('rejection sends a plan back exactly one stage', () => {
  it('1: reject from review lands in in-progress, NOT functional (the reported defect)', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'review', 'alpha');
    const newPath = actions.rejectPlan(p, 'needs work', dir);
    assert.equal(path.basename(path.dirname(newPath)), 'in-progress');
    assert.ok(fs.existsSync(path.join(dir, 'plans', 'in-progress', 'alpha.md')));
    assert.ok(!fs.existsSync(path.join(dir, 'plans', 'functional', 'alpha.md')));
    assert.ok(!fs.existsSync(p));
  });

  it('2: reject from todo lands in implementation (Gate 2 revert target)', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'todo', 'beta');
    const newPath = actions.rejectPlan(p, 'nope', dir);
    assert.equal(path.basename(path.dirname(newPath)), 'implementation');
  });

  it('3: reject from implementation lands in functional (Gate 1 revert target)', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'implementation', 'gamma');
    const newPath = actions.rejectPlan(p, 'nope', dir);
    assert.equal(path.basename(path.dirname(newPath)), 'functional');
  });

  it('4: reject from done lands in review (Gate 3 revert target)', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'done', 'delta');
    const newPath = actions.rejectPlan(p, 'nope', dir);
    assert.equal(path.basename(path.dirname(newPath)), 'review');
  });
});

// ── 5: table-driven — no rejection crosses more than one stage ────────────────

describe('no rejection crosses more than one stage (a single constant cannot pass)', () => {
  it('5: for every rejectable stage, the target is exactly index-1 along STAGE_ORDER', () => {
    for (let i = 1; i < STAGES.length; i += 1) {
      const stage = STAGES[i];
      const dir = makeProject();
      const p = writePlan(dir, stage, `s${i}`);
      const newPath = actions.rejectPlan(p, 'x', dir);
      const landed = path.basename(path.dirname(newPath));
      assert.equal(
        landed,
        gateOrder.STAGE_ORDER[i - 1],
        `reject from ${stage} must land in ${gateOrder.STAGE_ORDER[i - 1]}, landed in ${landed}`,
      );
    }
  });
});

// ── 6 / 6b / 7: the safety property — no gate-free path to the finish line ────

describe('the finish line is unreachable from any rejection target without a gate', () => {
  it('6: for EVERY stage, crossesHumanGate(target, done) === true (non-vacuous incl. in-progress)', () => {
    let firedForInProgress = false;
    for (let i = 1; i < STAGES.length; i += 1) {
      const target = gateOrder.STAGE_ORDER[i - 1];
      assert.equal(
        gateOrder.crossesHumanGate(target, 'done'),
        true,
        `every path from ${target} to done must cross Gate 3`,
      );
      if (target === 'in-progress') firedForInProgress = true;
    }
    assert.ok(firedForInProgress, 'the in-progress target must be exercised (non-vacuity)');
  });

  it('6b: the gate-free leg is pinned as a known bounded fact, closed by the span rule', () => {
    assert.equal(gateOrder.crossesHumanGate('in-progress', 'review'), false);
    assert.equal(gateOrder.crossesHumanGate('in-progress', 'done'), true);
  });

  it('7: after a review rejection the plan sits off ledger-governed ground with no entry', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'review', 'epsilon');
    const newPath = actions.rejectPlan(p, 'x', dir);
    const landed = path.basename(path.dirname(newPath));
    // The sole live caller rejects at review → the real target is in-progress, which
    // is NOT a gate destination, so residency there is never ledger-vouched.
    assert.ok(!gateOrder.GATE_DESTINATIONS.includes(landed));
    // And no rejection ever leaves an entry behind that could vouch for a destination.
    assert.equal(ledger.readEntry(ledger.slugFromPlanPath(newPath), dir), null);
  });
});

// ── 8 / 9: fail-closed refusals leave the file untouched ─────────────────────

describe('rejection refuses loudly rather than moving a plan nobody chose', () => {
  it('8: reject from functional refuses — no move, the file unchanged on disk', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'functional', 'zeta');
    const before = fs.readFileSync(p, 'utf8');
    assert.throws(() => actions.rejectPlan(p, 'x', dir), /functional|no earlier stage/i);
    assert.equal(fs.readFileSync(p, 'utf8'), before, 'the file must be byte-identical');
    assert.ok(fs.existsSync(p));
  });

  it('9: reject from an unknown stage refuses — fail closed, no move', () => {
    const dir = makeProject();
    fs.mkdirSync(path.join(dir, 'plans', 'nowhere'), { recursive: true });
    const p = writePlan(dir, 'nowhere', 'eta');
    const before = fs.readFileSync(p, 'utf8');
    assert.throws(() => actions.rejectPlan(p, 'x', dir), /unknown stage/i);
    assert.equal(fs.readFileSync(p, 'utf8'), before);
  });
});

// ── 10 / 11 / 12 / 13: the content rewrite (D2, D3) ──────────────────────────

describe('the rewrite keeps the frontmatter honest and at byte zero', () => {
  it('10: frontmatter stays at byte zero; parseMetadata still returns the plan fields (D2 guard)', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'review', 'theta', { markerBlock: true, files: ['src/theta.js'] });
    const newPath = actions.rejectPlan(p, 'fix it', dir);
    const after = fs.readFileSync(newPath, 'utf8');
    assert.ok(after.startsWith('---'), 'the file must start with the frontmatter delimiter');
    // The plan's own scalar fields survive (parseMetadata reads the region from byte 0).
    assert.equal(parseMetadata(after).title, 'The theta plan');
    // And the block-list files: declaration is still resolvable by the coverage reader.
    assert.deepEqual(readPlanFiles(newPath), ['src/theta.js']);
  });

  it('11: the files: declaration is still resolvable by the coverage reader after a rejection', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'review', 'iota', { markerBlock: true, files: ['src/iota.js'] });
    const newPath = actions.rejectPlan(p, 'fix it', dir);
    const globs = readPlanFiles(newPath);
    assert.deepEqual(globs, ['src/iota.js']);
  });

  it('12: the rejection feedback is in the body, positioned AFTER the frontmatter', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'review', 'kappa');
    const newPath = actions.rejectPlan(p, 'the feedback text', dir);
    const after = fs.readFileSync(newPath, 'utf8');
    assert.match(after, /## Rejection Feedback/);
    assert.match(after, /the feedback text/);
    const fmEnd = after.indexOf('\n---\n');
    assert.ok(after.indexOf('## Rejection Feedback') > fmEnd, 'feedback must follow the frontmatter');
  });

  it('13: the approval marker is stripped (D3)', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'review', 'lambda', { markerBlock: true });
    const newPath = actions.rejectPlan(p, 'x', dir);
    const after = fs.readFileSync(newPath, 'utf8');
    assert.ok(!/approved_by/.test(after), 'approved_by must be gone');
    assert.ok(!/approved_at/.test(after), 'approved_at must be gone');
    assert.ok(!/gate_crossed/.test(after), 'gate_crossed must be gone');
  });
});

// ── 14 / 15: the ledger withdrawal (D4) ──────────────────────────────────────

describe('rejection withdraws the approval it no longer has', () => {
  it('14: the ledger entry is removed (readEntry returns null after rejection)', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'todo', 'mu');
    const slug = ledger.slugFromPlanPath(p);
    ledger.writeEntry(slug, {
      content: fs.readFileSync(p, 'utf8'),
      stage_from: 'implementation',
      stage_to: 'todo',
      approved_by: 'human',
    }, dir);
    assert.ok(ledger.readEntry(slug, dir), 'precondition: entry exists');
    actions.rejectPlan(p, 'x', dir);
    assert.equal(ledger.readEntry(slug, dir), null);
  });

  it('15: the D4 gate-skip is closed — a rejected plan is not re-accepted at a destination', () => {
    const dir = makeProject();
    // A plan that crossed Gate 1 into implementation carries a stage_to:implementation entry.
    const p = writePlan(dir, 'implementation', 'nu');
    const slug = ledger.slugFromPlanPath(p);
    ledger.writeEntry(slug, {
      content_sha256: ledger.computeContentHash(fs.readFileSync(p, 'utf8')),
      stage_from: 'functional',
      stage_to: 'implementation',
      approved_by: 'human',
    }, dir);
    // Baseline: implementation is NOT hash-sensitive, so residency is accepted on the entry.
    assert.equal(classifyResidency(p, 'implementation', dir).accepted, true);
    // Reject it (implementation → functional), which removes the entry.
    actions.rejectPlan(p, 'x', dir);
    // Simulate the plan returning to implementation: with the entry withdrawn it is NOT re-accepted.
    const back = writePlan(dir, 'implementation', 'nu');
    const verdict = classifyResidency(back, 'implementation', dir);
    assert.equal(verdict.accepted, false);
    assert.equal(verdict.reason, 'no-ledger-entry');
  });
});

// ── 16: revision counter ─────────────────────────────────────────────────────

describe('the revision counter increments across rejections', () => {
  it('16: revision goes 0 → 1 → 2 across two rejections', () => {
    const dir = makeProject();
    let p = writePlan(dir, 'review', 'xi');
    p = actions.rejectPlan(p, 'first', dir);
    assert.equal(parseMetadata(fs.readFileSync(p, 'utf8')).revision, 1);
    // Move it back to review to reject again (simulating a second round).
    const reviewPath = path.join(dir, 'plans', 'review', 'xi.md');
    fs.renameSync(p, reviewPath);
    p = actions.rejectPlan(reviewPath, 'second', dir);
    assert.equal(parseMetadata(fs.readFileSync(p, 'utf8')).revision, 2);
  });
});

// ── 17 / 18 / 19: safe feedback encoding (D5) ────────────────────────────────

describe('human feedback cannot corrupt the frontmatter', () => {
  it('17: a newline in the feedback does not break the frontmatter; rejection_reason stays single-line', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'review', 'omicron', { files: ['src/o.js'] });
    const newPath = actions.rejectPlan(p, 'line one\nline two: with colon', dir);
    const after = fs.readFileSync(newPath, 'utf8');
    // The frontmatter is intact: the coverage reader still resolves the declared files.
    assert.deepEqual(readPlanFiles(newPath), ['src/o.js']);
    // The rejection_reason line contains no embedded newline.
    const m = after.match(/^rejection_reason: .*$/m);
    assert.ok(m, 'rejection_reason line present');
    assert.ok(!/\n/.test(m[0].slice('rejection_reason:'.length)), 'no embedded newline');
  });

  it('18: a quote at the truncation boundary leaves no dangling escape; frontmatter parses', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'review', 'pi', { files: ['src/p.js'] });
    const feedback = 'x'.repeat(99) + '"' + 'y'.repeat(50); // a quote at char 100
    const newPath = actions.rejectPlan(p, feedback, dir);
    const after = fs.readFileSync(newPath, 'utf8');
    assert.deepEqual(readPlanFiles(newPath), ['src/p.js'], 'frontmatter still parses');
    const line = after.match(/^rejection_reason: "(.*)"$/m);
    assert.ok(line, 'rejection_reason is a well-formed quoted scalar');
  });

  it('19: a control character in feedback is stripped from the file', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'review', 'rho');
    const newPath = actions.rejectPlan(p, 'evil\x1b[31mred\x00nul', dir);
    const after = fs.readFileSync(newPath, 'utf8');
    assert.ok(!/\x1b/.test(after), 'no ESC byte');
    assert.ok(!/\x00/.test(after), 'no NUL byte');
  });
});

// ── 20: a FAILED ledger withdrawal ABORTS the rejection ──────────────────────

describe('a failed ledger withdrawal aborts the rejection (never a silent swallow)', () => {
  it('20: with removeEntry forced to throw, the plan is NOT moved and the error reaches the caller', () => {
    const dir = makeProject();
    const p = writePlan(dir, 'review', 'sigma');
    const boom = () => { throw new Error('ledger unwritable'); };
    assert.throws(
      () => actions.rejectPlan(p, 'x', dir, { removeEntry: boom }),
      /ledger unwritable/,
    );
    // The plan stayed at review — the move never happened.
    assert.ok(fs.existsSync(p), 'plan remains at its original stage');
    assert.ok(!fs.existsSync(path.join(dir, 'plans', 'in-progress', 'sigma.md')));
  });
});

// ── 21: the rejected plan's write priority is the documented one ─────────────

describe('in-progress holds the top coverage-stack priority (STAGE_PRIORITY, deliberate)', () => {
  it('21: an approved in-progress plan wins the coverage contest against a todo plan on the same path', () => {
    // NOTE (documented in the plan): a FRESHLY-rejected plan has NO ledger entry (D4),
    // so it grants nothing via coverage. The property decision 13 actually pins is the
    // STAGE_PRIORITY precedence — in-progress outranks todo among APPROVED plans — which
    // is why a plan being rebuilt (resident in in-progress, still holding its Gate-2 entry)
    // owns its declared files. This exercises that precedence directly.
    const dir = makeProject();
    const shared = 'src/shared.js';

    const ip = writePlan(dir, 'in-progress', 'inprog', { files: [shared] });
    ledger.writeEntry(ledger.slugFromPlanPath(ip), {
      content: fs.readFileSync(ip, 'utf8'),
      stage_from: 'implementation',
      stage_to: 'todo',
      approved_by: 'human',
    }, dir);

    const td = writePlan(dir, 'todo', 'queued', { files: [shared] });
    ledger.writeEntry(ledger.slugFromPlanPath(td), {
      content: fs.readFileSync(td, 'utf8'),
      stage_from: 'implementation',
      stage_to: 'todo',
      approved_by: 'human',
    }, dir);

    const cover = findCoveringPlan(shared, dir);
    assert.ok(cover, 'the shared path is covered by an approved plan');
    assert.equal(cover.stage, 'in-progress', 'in-progress wins over todo');
  });
});
