/**
 * actions.js — FIRST real coverage of the plan-lifecycle + human-gate core.
 *
 * These tests drive the REAL src/lib/actions.js against real os.tmpdir() plan
 * fixtures (real fs, no mocks of core logic — the only boundary is the filesystem).
 * They complement tests/actions-scheduler.test.js (which owns the scheduler surface:
 * taskSpecFromPlan / startAgent / stopAgent / advanceAgent / cancelTask /
 * enqueueWaveSync / completeExecution coupling). This file owns the pieces that had
 * ZERO real coverage: approvePlan gate semantics (refuse / override / stamp / unknown
 * location), rejectPlan, movePlan, renamePlan, deletePlan, the queue reorder
 * boundaries, removeFromQueue, startExecution, createCanvas, listSubplans,
 * approveSubplans, applyBasicIronLoopTemplate, and completeTaskPlan's slug guard.
 *
 * Every test pins a NON-OBVIOUS branch: an error/throw path, a boundary no-op, a
 * fallback operand, or a human-gate decision (a gate MUST refuse without the marker,
 * and MUST record an override when forced). A trivially-wrong happy-path-only
 * implementation goes RED on each.
 *
 * AI-assisted authorship: every assertion was read against the actual actions.js
 * behavior (not an assumed shape) before commit.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const actions = require('../src/lib/actions');

// ── fixtures ──────────────────────────────────────────────────────────────────

let root;

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-actcov-'));
  for (const d of STAGES) {
    fs.mkdirSync(path.join(root, 'plans', d), { recursive: true });
  }
  fs.mkdirSync(path.join(root, '.ctoc', 'state'), { recursive: true });
});

afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/** Write a plan file into a stage; returns its absolute path. */
function writePlan(stage, name, content) {
  const p = path.join(root, 'plans', stage, `${name}.md`);
  fs.writeFileSync(p, content);
  return p;
}

function read(stage, name) {
  return fs.readFileSync(path.join(root, 'plans', stage, `${name}.md`), 'utf8');
}

function exists(stage, name) {
  return fs.existsSync(path.join(root, 'plans', stage, `${name}.md`));
}

/** A functional plan that PASSES validateFunctionalToImpl (problem + criteria + scope). */
const VALID_FUNCTIONAL =
  '# Auth Login\n\n' +
  '## Problem Statement\nUsers cannot log in reliably.\n\n' +
  '## Acceptance Criteria\n- [x] login works\n\n' +
  '## Scope\nIn scope: the login form.\n';

/** A functional plan that FAILS validateFunctionalToImpl (no problem, no criteria). */
const INVALID_FUNCTIONAL = '# Bare Plan\n\nJust some prose with no gate-required sections.\n';

// ── approvePlan: human-gate semantics ───────────────────────────────────────────

describe('approvePlan — human gate semantics', () => {
  it('functional→implementation: a valid plan crosses, is STAMPED approved_by:human, and spawns the implementation planner', () => {
    // Arrange
    const planPath = writePlan('functional', 'auth-login', VALID_FUNCTIONAL);

    // Act
    const res = actions.approvePlan(planPath, root);

    // Assert — the crossing happened, was stamped at the DESTINATION only, and
    // triggered the functional→implementation background agent.
    assert.equal(res.humanGate, true);
    assert.equal(res.backgroundAgent, actions.AGENT_TYPES.IMPLEMENTATION_PLANNER);
    assert.equal(res.overridden, undefined, 'a clean crossing is NOT flagged as an override');
    assert.equal(exists('functional', 'auth-login'), false, 'source no longer resides in functional/');
    assert.equal(exists('implementation', 'auth-login'), true, 'plan now resides in implementation/');
    const dest = read('implementation', 'auth-login');
    assert.match(dest, /approved_by:\s*human/);
    assert.match(dest, /gate_crossed:\s*functional → implementation/);
  });

  it('functional→implementation: a plan that FAILS validation is REFUSED — not moved, not stamped (no auto-cross)', () => {
    // Arrange
    const planPath = writePlan('functional', 'bare-plan', INVALID_FUNCTIONAL);

    // Act
    const res = actions.approvePlan(planPath, root);

    // Assert — the refusal contract, and the plan is left byte-identical in place.
    assert.equal(res.ok, false);
    assert.equal(res.refused, true);
    assert.ok(Array.isArray(res.failures) && res.failures.length > 0, 'refusal carries the failing reasons');
    assert.equal(exists('functional', 'bare-plan'), true, 'refused plan stays in functional/');
    assert.equal(exists('implementation', 'bare-plan'), false, 'refused plan never reaches implementation/');
    assert.equal(read('functional', 'bare-plan'), INVALID_FUNCTIONAL, 'content untouched — no marker stamped');
  });

  it('functional→implementation: an explicit override crosses a FAILING plan AND records the override in the marker', () => {
    // Arrange
    const planPath = writePlan('functional', 'forced-plan', INVALID_FUNCTIONAL);

    // Act — the human's "Approve anyway" past a failing validation.
    const res = actions.approvePlan(planPath, root, { override: { reason: 'urgent ship' } });

    // Assert — a forced crossing is auditable, never indistinguishable from a clean one.
    assert.equal(res.overridden, true);
    assert.equal(exists('implementation', 'forced-plan'), true, 'override crosses the gate');
    const dest = read('implementation', 'forced-plan');
    assert.match(dest, /override:\s*true/);
    assert.match(dest, /override_reason:\s*urgent ship/);
  });

  it('implementation→todo: a plan with no title (# heading) is REFUSED at the queue gate', () => {
    // Arrange — validateForQueue errors when there is no `# ` title heading.
    const planPath = writePlan('implementation', 'no-title', 'body text only, no markdown title\n');

    // Act
    const res = actions.approvePlan(planPath, root);

    // Assert — refused BEFORE any Iron Loop application; plan stays in implementation/.
    assert.equal(res.refused, true);
    assert.equal(exists('implementation', 'no-title'), true);
    assert.equal(exists('todo', 'no-title'), false);
  });

  it('review→done: a plan with NO approval marker and NO verify evidence is REFUSED (gate never auto-crosses)', () => {
    // Arrange
    const planPath = writePlan('review', 'unverified', '# Unverified\n\nbody\n');

    // Act
    const res = actions.approvePlan(planPath, root);

    // Assert
    assert.equal(res.refused, true);
    assert.match(res.reason, /review→done/);
    assert.equal(exists('done', 'unverified'), false, 'unverified plan never reaches done/');
  });

  it('throws Unknown plan location when the plan sits in a non-gate-source stage', () => {
    // Arrange — todo/ is not a gate SOURCE (functional | implementation | review are).
    const planPath = writePlan('todo', 'orphan', '# Orphan\n\nbody\n');

    // Act + Assert
    assert.throws(
      () => actions.approvePlan(planPath, root),
      /Unknown plan location/
    );
  });
});

// ── movePlan ────────────────────────────────────────────────────────────────

describe('movePlan', () => {
  it('creates the destination stage directory when absent and relocates the file there', () => {
    // Arrange — remove review/ so movePlan must recreate it (mkdirSync branch).
    const planPath = writePlan('functional', 'mover', '# Mover\n\nbody\n');
    fs.rmSync(path.join(root, 'plans', 'review'), { recursive: true, force: true });

    // Act
    const newPath = actions.movePlan(planPath, 'review', root);

    // Assert — new path is the joined dest+basename; source gone; dest present.
    assert.equal(newPath, path.join(root, 'plans', 'review', 'mover.md'));
    assert.equal(fs.existsSync(planPath), false);
    assert.equal(exists('review', 'mover'), true);
  });

  it('THROWS instead of overwriting an existing plan of the same basename at the destination', () => {
    // A plan slug lives in exactly one stage; a same-basename file already at the
    // destination is always a bug (a stale revert copy, a re-created slug). A bare
    // renameSync would atomically REPLACE it — silent data loss. movePlan is the
    // chokepoint that also protects approvePlan's internal move, so it must throw.
    const planPath = writePlan('in-progress', 'dupe', 'content A\n');
    const destExisting = writePlan('todo', 'dupe', 'content B\n');

    assert.throws(
      () => actions.movePlan(planPath, 'todo', root),
      /exist/i,
      'movePlan must refuse to overwrite an existing destination',
    );

    // BOTH files survive byte-for-byte — no rename happened.
    assert.equal(fs.existsSync(planPath), true, 'source must survive');
    assert.equal(fs.readFileSync(planPath, 'utf8'), 'content A\n');
    assert.equal(fs.readFileSync(destExisting, 'utf8'), 'content B\n', 'destination not overwritten');
  });
});

// ── rejectPlan ────────────────────────────────────────────────────────────────

describe('rejectPlan', () => {
  // UPDATED for plan 00085: rejection sends a plan back exactly ONE stage, so a
  // review-stage plan reverts to in-progress, not four stages down to functional
  // (defect D1). The human replaced that contract; these tests assert the new
  // destination and the (unchanged) revision/reason/header behavior.
  it('increments an EXISTING revision (2→3), records the reason, and reverts the plan ONE stage to in-progress/', () => {
    // Arrange — a review-stage plan already on its 2nd revision.
    const planPath = writePlan('review', 'rev-plan', '---\nrevision: 2\n---\n\n# Rev Plan\n\nbody\n');

    // Act
    const newPath = actions.rejectPlan(planPath, 'JWT expiry not handled', root);

    // Assert — reverted ONE stage back to in-progress/, revision bumped, reason recorded, header present.
    assert.equal(newPath, path.join(root, 'plans', 'in-progress', 'rev-plan.md'));
    assert.equal(exists('in-progress', 'rev-plan'), true);
    const content = read('in-progress', 'rev-plan');
    assert.match(content, /# REVISION 3/);
    assert.match(content, /revision:\s*3/);
    assert.match(content, /rejection_reason:\s*"JWT expiry not handled"/);
  });

  it('defaults an ABSENT revision to 1 (the || 0 fallback)', () => {
    // Arrange — no revision key in frontmatter.
    const planPath = writePlan('review', 'fresh', '# Fresh\n\nbody\n');

    // Act
    actions.rejectPlan(planPath, 'needs work', root);

    // Assert — first rejection is REVISION 1, not 0 or NaN.
    const content = read('in-progress', 'fresh');
    assert.match(content, /# REVISION 1/);
    assert.match(content, /revision:\s*1/);
  });

  it('truncates the recorded rejection_reason to 100 characters', () => {
    // Arrange — a 150-char reason exercises the truncate-to-100 boundary.
    const planPath = writePlan('review', 'long-reason', '# Long\n\nbody\n');
    const longReason = 'A'.repeat(150);

    // Act
    actions.rejectPlan(planPath, longReason, root);

    // Assert — exactly the first 100 chars are stored in the metadata line.
    const content = read('in-progress', 'long-reason');
    assert.ok(content.includes(`rejection_reason: "${'A'.repeat(100)}"`), 'stored reason is 100 chars');
    assert.ok(!content.includes(`rejection_reason: "${'A'.repeat(101)}"`), 'the 101st char was truncated away');
  });
});

// ── renamePlan / deletePlan ─────────────────────────────────────────────────────

describe('renamePlan', () => {
  it('renames within the same directory, preserving the ORIGINAL file extension', () => {
    // Arrange
    const planPath = writePlan('implementation', 'old-name', '# Old\n\nbody\n');

    // Act — newName carries no extension; renamePlan must append the source .md.
    const newPath = actions.renamePlan(planPath, 'new-name');

    // Assert
    assert.equal(newPath, path.join(root, 'plans', 'implementation', 'new-name.md'));
    assert.equal(fs.existsSync(planPath), false, 'old file gone');
    assert.equal(exists('implementation', 'new-name'), true, 'renamed file present');
  });
});

describe('deletePlan', () => {
  it('unlinks the plan file', () => {
    // Arrange
    const planPath = writePlan('todo', 'doomed', '# Doomed\n\nbody\n');

    // Act
    actions.deletePlan(planPath);

    // Assert
    assert.equal(fs.existsSync(planPath), false);
  });
});

// ── queue reorder boundaries ────────────────────────────────────────────────────

describe('moveUpInQueue / moveDownInQueue — order file + boundary no-ops', () => {
  function seedQueue(names) {
    const paths = {};
    for (const n of names) paths[n] = writePlan('todo', n, `# ${n}\n\nbody\n`);
    fs.writeFileSync(
      path.join(root, '.ctoc', 'state', 'todo-order.json'),
      JSON.stringify(names.map((n) => `${n}.md`), null, 2)
    );
    return paths;
  }
  function readOrder() {
    return JSON.parse(fs.readFileSync(path.join(root, '.ctoc', 'state', 'todo-order.json'), 'utf8'));
  }

  it('moveUpInQueue swaps a middle item with its predecessor, persists the new order, and returns true', () => {
    // Arrange
    const p = seedQueue(['a', 'b', 'c']);

    // Act
    const moved = actions.moveUpInQueue(p.b, root);

    // Assert
    assert.equal(moved, true);
    assert.deepEqual(readOrder(), ['b.md', 'a.md', 'c.md']);
  });

  it('moveUpInQueue at the TOP (index 0) is a real no-op: returns false and does not rewrite the order', () => {
    // Arrange
    const p = seedQueue(['a', 'b', 'c']);

    // Act
    const moved = actions.moveUpInQueue(p.a, root);

    // Assert — the index<=0 boundary short-circuits WITHOUT a write.
    assert.equal(moved, false);
    assert.deepEqual(readOrder(), ['a.md', 'b.md', 'c.md']);
  });

  it('moveDownInQueue at the BOTTOM (last index) returns false and leaves order unchanged', () => {
    // Arrange
    const p = seedQueue(['a', 'b', 'c']);

    // Act
    const moved = actions.moveDownInQueue(p.c, root);

    // Assert — the index>=length-1 boundary short-circuits.
    assert.equal(moved, false);
    assert.deepEqual(readOrder(), ['a.md', 'b.md', 'c.md']);
  });

  it('moveDownInQueue swaps an item with its successor and returns true', () => {
    // Arrange
    const p = seedQueue(['a', 'b', 'c']);

    // Act
    const moved = actions.moveDownInQueue(p.a, root);

    // Assert
    assert.equal(moved, true);
    assert.deepEqual(readOrder(), ['b.md', 'a.md', 'c.md']);
  });
});

describe('removeFromQueue / startExecution', () => {
  it('removeFromQueue moves a plan from todo/ back to implementation/', () => {
    // Arrange
    const planPath = writePlan('todo', 'requeue', '# Requeue\n\nbody\n');

    // Act
    const newPath = actions.removeFromQueue(planPath, root);

    // Assert
    assert.equal(newPath, path.join(root, 'plans', 'implementation', 'requeue.md'));
    assert.equal(exists('todo', 'requeue'), false);
    assert.equal(exists('implementation', 'requeue'), true);
  });

  it('startExecution moves a plan from todo/ to in-progress/', () => {
    // Arrange
    const planPath = writePlan('todo', 'go', '# Go\n\nbody\n');

    // Act
    const newPath = actions.startExecution(planPath, root);

    // Assert
    assert.equal(newPath, path.join(root, 'plans', 'in-progress', 'go.md'));
    assert.equal(exists('todo', 'go'), false);
    assert.equal(exists('in-progress', 'go'), true);
  });
});

// ── createCanvas ────────────────────────────────────────────────────────────────

describe('createCanvas', () => {
  function writeTemplate() {
    const dir = path.join(root, '.ctoc', 'templates');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'lean-canvas.md.template'),
      '---\ntitle: "Lean Canvas: {{NAME}}"\ncreated: "{{DATE}}"\nparent_vision: "{{VISION_SLUG}}"\n---\n\n# Lean Canvas: {{NAME}}\n'
    );
  }

  it('throws on an invalid canvas type BEFORE any filesystem work', () => {
    assert.throws(() => actions.createCanvas('my-vision', 'gantt', root), /Invalid canvas type/);
  });

  it('throws on a vision slug that violates the slug pattern', () => {
    // "Bad Slug" has an uppercase letter and a space — not /^[a-z0-9][a-z0-9-]*$/.
    assert.throws(() => actions.createCanvas('Bad Slug', 'lean', root), /Invalid vision slug/);
  });

  it('throws when the canvas template file is absent', () => {
    // No writeTemplate() call → template missing → creation cannot proceed.
    assert.throws(() => actions.createCanvas('my-vision', 'lean', root), /template not found/i);
  });

  it('writes the canvas, substitutes the display name, and WARNS about the orphan when no parent vision exists', () => {
    // Arrange
    writeTemplate();

    // Act
    const res = actions.createCanvas('my-vision', 'lean', root);

    // Assert — file written, {{NAME}} → "My Vision", orphan warning present.
    assert.equal(res.path, path.join(root, 'plans', 'canvas', 'my-vision.md'));
    assert.equal(fs.existsSync(res.path), true);
    assert.match(fs.readFileSync(res.path, 'utf8'), /Lean Canvas: My Vision/);
    assert.equal(res.warnings.length, 1);
    assert.match(res.warnings[0], /orphan/i);
  });

  it('emits NO orphan warning when the parent vision exists on disk', () => {
    // Arrange
    writeTemplate();
    writePlan('vision', 'has-parent', '# Vision\n\nbody\n');

    // Act
    const res = actions.createCanvas('has-parent', 'lean', root);

    // Assert — the parent-found branch suppresses the warning.
    assert.deepEqual(res.warnings, []);
  });

  it('refuses to overwrite an existing canvas unless { overwrite: true }', () => {
    // Arrange
    writeTemplate();
    actions.createCanvas('dup-vision', 'lean', root);

    // Act + Assert — a second create without overwrite throws.
    assert.throws(() => actions.createCanvas('dup-vision', 'lean', root), /already exists/i);
  });
});

// ── listSubplans ────────────────────────────────────────────────────────────────

describe('listSubplans', () => {
  it('throws when parentSlug is empty', () => {
    assert.throws(() => actions.listSubplans('', root), /parentSlug required/);
  });

  it('returns ONLY plans whose parent_plan matches, across stages, ignoring non-matching plans', () => {
    // Arrange — two children of feature-x (different stages) + one unrelated plan.
    writePlan('implementation', 'slice-1', '---\nparent_plan: feature-x\n---\n\n# Slice 1\n\nbody\n');
    writePlan('todo', 'slice-2', '---\nparent_plan: feature-x\n---\n\n# Slice 2\n\nbody\n');
    writePlan('implementation', 'unrelated', '---\nparent_plan: other-thing\n---\n\n# Unrelated\n\nbody\n');

    // Act
    const subs = actions.listSubplans('feature-x', root);

    // Assert
    const slugs = subs.map((s) => s.slug).sort();
    assert.deepEqual(slugs, ['slice-1', 'slice-2']);
    const stages = subs.map((s) => s.stage).sort();
    assert.deepEqual(stages, ['implementation', 'todo']);
  });

  it('finds parent_plan even when it lives in the SECOND frontmatter block (a gate-approved plan)', () => {
    // Arrange — a prepended approval marker pushes the plan\'s own frontmatter into
    // the second block. A single-block reader would miss parent_plan and return [].
    writePlan(
      'review',
      'gated-slice',
      '---\napproved_by: human\ngate_crossed: implementation → todo\n---\n\n' +
      '---\nparent_plan: feature-y\ndepends_on: slice-a, slice-b\n---\n\n# Gated Slice\n\nbody\n'
    );

    // Act
    const subs = actions.listSubplans('feature-y', root);

    // Assert — found, and depends_on parsed into a two-slug array.
    assert.equal(subs.length, 1);
    assert.equal(subs[0].slug, 'gated-slice');
    assert.deepEqual(subs[0].dependsOn, ['slice-a', 'slice-b']);
  });
});

// ── approveSubplans ─────────────────────────────────────────────────────────────

describe('approveSubplans', () => {
  it('throws when parentSlug is empty', () => {
    assert.throws(() => actions.approveSubplans('', 'implementation', root), /parentSlug required/);
  });

  it('throws when fromStage is not a batched-gate source stage', () => {
    // 'todo' is a valid plan stage but NOT one of the two batch-gate sources.
    assert.throws(
      () => actions.approveSubplans('feature-x', 'todo', root),
      /gate source stage/
    );
  });

  it('reports each sibling that FAILS its gate in skipped[] and approves none, without aborting the batch', () => {
    // Arrange — two implementation-stage children of feature-z, both missing a title,
    // so each is REFUSED by the queue gate inside approvePlan.
    writePlan('implementation', 'z-slice-1', '---\nparent_plan: feature-z\n---\n\nno title body\n');
    writePlan('implementation', 'z-slice-2', '---\nparent_plan: feature-z\n---\n\nno title body\n');

    // Act
    const res = actions.approveSubplans('feature-z', 'implementation', root);

    // Assert — batch continued through both refusals; nothing crossed.
    assert.deepEqual(res.approved, []);
    assert.equal(res.skipped.length, 2);
    const skippedSlugs = res.skipped.map((s) => s.slug).sort();
    assert.deepEqual(skippedSlugs, ['z-slice-1', 'z-slice-2']);
    assert.ok(res.skipped.every((s) => typeof s.reason === 'string' && s.reason.length > 0), 'each skip carries a reason');
    // And neither plan was moved out of implementation/.
    assert.equal(exists('implementation', 'z-slice-1'), true);
    assert.equal(exists('implementation', 'z-slice-2'), true);
  });
});

// ── applyBasicIronLoopTemplate ──────────────────────────────────────────────────

describe('applyBasicIronLoopTemplate', () => {
  it('marks iron_loop:true inside EXISTING frontmatter and appends Steps 8-16', () => {
    // Arrange
    const planPath = writePlan('todo', 'has-fm', '---\ntitle: X\n---\n\n# Has FM\n\nbody\n');

    // Act
    actions.applyBasicIronLoopTemplate(planPath);

    // Assert — the marker is injected into the first block (not prepended anew), and
    // the canonical step labels are present.
    const content = fs.readFileSync(planPath, 'utf8');
    assert.match(content, /^---\niron_loop: true\ntitle: X/);
    assert.match(content, /### Step 8: TEST/);
    assert.match(content, /### Step 16: FINAL-REVIEW/);
  });

  it('PREPENDS a fresh frontmatter block when the plan has none', () => {
    // Arrange — no leading `---` block.
    const planPath = writePlan('todo', 'no-fm', '# No FM\n\nbody\n');

    // Act
    actions.applyBasicIronLoopTemplate(planPath);

    // Assert — a brand-new frontmatter block carrying the marker leads the file.
    const content = fs.readFileSync(planPath, 'utf8');
    assert.match(content, /^---\niron_loop: true\n---\n/);
    assert.match(content, /### Step 14: VERIFY/);
  });
});

// ── completeTaskPlan — the path-traversal / slug guard ───────────────────────────

describe('completeTaskPlan — slug safety guard', () => {
  it('reports "task carries no plan" for an empty slug (never touches the filesystem)', () => {
    const res = actions.completeTaskPlan(root, '');
    // fault is now present on EVERY return (plan 00131): a consumer never distinguishes
    // absent from null. fault:null marks a genuine report about the plan (as opposed to
    // a caller fault), so this exact-shape pin tightens to include it.
    assert.deepEqual(res, { ran: false, fault: null, reason: 'task carries no plan' });
  });

  it('REFUSES a slug containing a path separator before any path.join', () => {
    const res = actions.completeTaskPlan(root, '../evil');
    assert.equal(res.ran, false);
    assert.match(res.reason, /unsafe plan slug refused/);
  });

  it('REFUSES a dotdot slug that PASSES the char class but hits the includes("..") guard', () => {
    // 'a..b' is all [A-Za-z0-9._-] (dots allowed), so only the explicit
    // includes('..') clause rejects it — this pins that exact operand.
    const res = actions.completeTaskPlan(root, 'a..b');
    assert.equal(res.ran, false);
    assert.match(res.reason, /unsafe plan slug refused/);
  });

  it('reports "no plan file" for a safe slug that names no plan in in-progress/ or review/', () => {
    const res = actions.completeTaskPlan(root, 'ghost-plan');
    assert.equal(res.ran, false);
    assert.match(res.reason, /no plan file for "ghost-plan"/);
  });
});
