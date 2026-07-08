/**
 * SIP1 — Decompose functional plans into small, focused implementation plans.
 *
 * Covers (13 cases):
 *   listSubplans           — returns the parent's set (1); depends_on array + spans
 *                            stages (2); throws on missing parentSlug (3).
 *   approveSubplans        — Gate 2 all siblings crossed + human marker + no auto-cross
 *                            (4); Gate 3 (5); fail-safe reports-not-aborts (6); dependency
 *                            order (7); bad-stage throws (8).
 *   validateParentPlan     — accept (9); dangling → warning (10); absent → clean (11).
 *   gate wiring            — validateForQueue surfaces dangling parent as WARNING not
 *                            ERROR (12).
 *   prose contract         — implementation-planner.md / IRON_LOOP.md / CLAUDE.md (13).
 *
 * node:test, tmp project fixtures, real assertions. Each test builds a throwaway
 * plans/ tree, calls the REAL actions.js / plan-validator.js exports with the tmp
 * root as projectPath, asserts, and removes the tmp dir in teardown so tests are
 * order-independent.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { listSubplans, approveSubplans } = require('../src/lib/actions');
const { validateParentPlan, validateForQueue } = require('../src/lib/plan-validator');

const projectRoot = path.join(__dirname, '..');
const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

function makeTmpProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-subplan-'));
  STAGES.forEach(stage => fs.mkdirSync(path.join(tmp, 'plans', stage), { recursive: true }));
  return tmp;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/**
 * Write a minimal, queue-VALID plan file (title heading + a Technical/Implementation
 * section so validateForQueue passes) into a stage dir.
 */
function writePlan(tmp, stage, slug, { parent, dependsOn, valid = true, approved = false, extra = '' } = {}) {
  const fm = ['---', `title: "${slug}"`, 'type: implementation'];
  if (parent !== undefined) fm.push(`parent_plan: ${parent}`);
  if (dependsOn !== undefined) fm.push(`depends_on: ${dependsOn}`);
  fm.push('priority: HIGH', '---', '');
  let body = '';
  if (approved) {
    body += '---\napproved_by: human\napproved_at: 2026-07-08T00:00:00.000Z\ngate_crossed: implementation → todo\n---\n\n';
  }
  // A valid plan needs a "# " title heading AND the word Technical/Implementation.
  if (valid) {
    body += `# ${slug}\n\n## Implementation Details\n\nTechnical approach for ${slug}.\n${extra}\n`;
  } else {
    // Intentionally NO "# " title heading → validateForQueue fails with an error.
    body += `## no title heading here\n\nImplementation body without a title.\n${extra}\n`;
  }
  const content = fm.join('\n') + body;
  const p = path.join(tmp, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, content);
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// listSubplans
// ─────────────────────────────────────────────────────────────────────────────

describe('listSubplans', () => {
  it('returns the parent set and only it (excludes decoys + no-parent)', () => {
    const tmp = makeTmpProject();
    try {
      writePlan(tmp, 'implementation', 'PARENT-s1-a', { parent: 'PARENT' });
      writePlan(tmp, 'implementation', 'PARENT-s2-b', { parent: 'PARENT' });
      writePlan(tmp, 'implementation', 'OTHER-s1-x', { parent: 'OTHER' });
      writePlan(tmp, 'implementation', 'NOPARENT', {});

      const subs = listSubplans('PARENT', tmp);
      assert.equal(subs.length, 2);
      const slugs = subs.map(s => s.slug).sort();
      assert.deepEqual(slugs, ['PARENT-s1-a', 'PARENT-s2-b']);
      for (const s of subs) {
        assert.equal(s.stage, 'implementation');
        assert.ok(typeof s.path === 'string' && fs.existsSync(s.path));
      }
    } finally {
      cleanup(tmp);
    }
  });

  it('reads depends_on into an array and spans stages', () => {
    const tmp = makeTmpProject();
    try {
      writePlan(tmp, 'implementation', 'PARENT-s1-a', { parent: 'PARENT', dependsOn: 'none' });
      writePlan(tmp, 'todo', 'PARENT-s2-b', { parent: 'PARENT', dependsOn: 'PARENT-s1-a' });

      const subs = listSubplans('PARENT', tmp);
      const s1 = subs.find(s => s.slug === 'PARENT-s1-a');
      const s2 = subs.find(s => s.slug === 'PARENT-s2-b');
      assert.ok(s1 && s2);
      assert.deepEqual(s1.dependsOn, []);
      assert.deepEqual(s2.dependsOn, ['PARENT-s1-a']);
      assert.equal(s1.stage, 'implementation');
      assert.equal(s2.stage, 'todo');
    } finally {
      cleanup(tmp);
    }
  });

  it('throws on missing parentSlug', () => {
    const tmp = makeTmpProject();
    try {
      assert.throws(() => listSubplans('', tmp), /parentSlug required/);
      assert.throws(() => listSubplans(null, tmp), /parentSlug required/);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// approveSubplans
// ─────────────────────────────────────────────────────────────────────────────

describe('approveSubplans', () => {
  it('crosses ALL siblings Gate 2 (implementation→todo), human marker on each, no auto-cross without the call', () => {
    const tmp = makeTmpProject();
    try {
      writePlan(tmp, 'implementation', 'PARENT-s1', { parent: 'PARENT', dependsOn: 'none' });
      writePlan(tmp, 'implementation', 'PARENT-s2', { parent: 'PARENT', dependsOn: 'PARENT-s1' });
      writePlan(tmp, 'implementation', 'PARENT-s3', { parent: 'PARENT', dependsOn: 'PARENT-s2' });
      writePlan(tmp, 'implementation', 'PARENT-s4', { parent: 'PARENT', dependsOn: 'PARENT-s3' });

      // Pre-assert: no auto-cross. Nothing carries the human marker before the call,
      // and all 4 are still in implementation/.
      for (const slug of ['PARENT-s1', 'PARENT-s2', 'PARENT-s3', 'PARENT-s4']) {
        const p = path.join(tmp, 'plans', 'implementation', `${slug}.md`);
        assert.ok(fs.existsSync(p), `${slug} should still be in implementation/ before the call`);
        assert.ok(!/approved_by:\s*human/.test(fs.readFileSync(p, 'utf8')), `${slug} must NOT carry a human marker before the call`);
        assert.ok(!fs.existsSync(path.join(tmp, 'plans', 'todo', `${slug}.md`)), `${slug} must NOT be in todo/ before the call`);
      }

      const result = approveSubplans('PARENT', 'implementation', tmp);

      assert.deepEqual(result.approved.slice().sort(), ['PARENT-s1', 'PARENT-s2', 'PARENT-s3', 'PARENT-s4']);
      assert.equal(result.skipped.length, 0);
      for (const slug of ['PARENT-s1', 'PARENT-s2', 'PARENT-s3', 'PARENT-s4']) {
        assert.ok(!fs.existsSync(path.join(tmp, 'plans', 'implementation', `${slug}.md`)), `${slug} left implementation/`);
        const dest = path.join(tmp, 'plans', 'todo', `${slug}.md`);
        assert.ok(fs.existsSync(dest), `${slug} now in todo/`);
        const moved = fs.readFileSync(dest, 'utf8');
        assert.match(moved, /approved_by:\s*human/, `${slug} stamped with human marker`);
        assert.match(moved, /gate_crossed:\s*implementation → todo/, `${slug} has gate_crossed marker`);
      }
    } finally {
      cleanup(tmp);
    }
  });

  it('crosses Gate 3 (review→done) for all siblings', () => {
    const tmp = makeTmpProject();
    try {
      // Review→done siblings already carry a Gate-2 human marker and have no TODO/FIXME.
      writePlan(tmp, 'review', 'PARENT-s1', { parent: 'PARENT', dependsOn: 'none', approved: true });
      writePlan(tmp, 'review', 'PARENT-s2', { parent: 'PARENT', dependsOn: 'PARENT-s1', approved: true });

      const result = approveSubplans('PARENT', 'review', tmp);

      assert.deepEqual(result.approved.slice().sort(), ['PARENT-s1', 'PARENT-s2']);
      assert.equal(result.skipped.length, 0);
      for (const slug of ['PARENT-s1', 'PARENT-s2']) {
        assert.ok(!fs.existsSync(path.join(tmp, 'plans', 'review', `${slug}.md`)), `${slug} left review/`);
        const dest = path.join(tmp, 'plans', 'done', `${slug}.md`);
        assert.ok(fs.existsSync(dest), `${slug} now in done/`);
        assert.match(fs.readFileSync(dest, 'utf8'), /gate_crossed:\s*review → done/, `${slug} has review→done marker`);
      }
    } finally {
      cleanup(tmp);
    }
  });

  it('fail-safe: an invalid sibling is reported (not silently skipped) and does not abort the batch', () => {
    const tmp = makeTmpProject();
    try {
      writePlan(tmp, 'implementation', 'PARENT-s1', { parent: 'PARENT', dependsOn: 'none' });
      writePlan(tmp, 'implementation', 'PARENT-s2', { parent: 'PARENT', dependsOn: 'PARENT-s1', valid: false }); // no title heading
      writePlan(tmp, 'implementation', 'PARENT-s3', { parent: 'PARENT', dependsOn: 'PARENT-s2' });

      const result = approveSubplans('PARENT', 'implementation', tmp);

      // The 2 valid crossed; the invalid one remained in place.
      assert.deepEqual(result.approved.slice().sort(), ['PARENT-s1', 'PARENT-s3']);
      assert.ok(fs.existsSync(path.join(tmp, 'plans', 'todo', 'PARENT-s1.md')));
      assert.ok(fs.existsSync(path.join(tmp, 'plans', 'todo', 'PARENT-s3.md')));
      assert.ok(fs.existsSync(path.join(tmp, 'plans', 'implementation', 'PARENT-s2.md')), 'invalid sibling stays put');
      assert.ok(!fs.existsSync(path.join(tmp, 'plans', 'todo', 'PARENT-s2.md')), 'invalid sibling not crossed');

      // The skip is REPORTED (never silent) with a non-empty reason.
      assert.equal(result.skipped.length, 1);
      assert.equal(result.skipped[0].slug, 'PARENT-s2');
      assert.ok(typeof result.skipped[0].reason === 'string' && result.skipped[0].reason.length > 0);
    } finally {
      cleanup(tmp);
    }
  });

  it('crosses in dependency order (a dependency is approved before its dependents)', () => {
    const tmp = makeTmpProject();
    try {
      // Written in shuffled on-disk order; chain s1 ← s2 ← s3.
      writePlan(tmp, 'implementation', 'PARENT-s3', { parent: 'PARENT', dependsOn: 'PARENT-s2' });
      writePlan(tmp, 'implementation', 'PARENT-s1', { parent: 'PARENT', dependsOn: 'none' });
      writePlan(tmp, 'implementation', 'PARENT-s2', { parent: 'PARENT', dependsOn: 'PARENT-s1' });

      const result = approveSubplans('PARENT', 'implementation', tmp);
      const order = result.results.map(r => r.slug);
      assert.ok(order.indexOf('PARENT-s1') < order.indexOf('PARENT-s2'), 's1 before s2');
      assert.ok(order.indexOf('PARENT-s2') < order.indexOf('PARENT-s3'), 's2 before s3');
    } finally {
      cleanup(tmp);
    }
  });

  it('rejects a non-gate fromStage', () => {
    const tmp = makeTmpProject();
    try {
      assert.throws(() => approveSubplans('PARENT', 'functional', tmp), /gate source stage/);
      assert.throws(() => approveSubplans('PARENT', 'todo', tmp), /gate source stage/);
    } finally {
      cleanup(tmp);
    }
  });

  it('throws on missing parentSlug', () => {
    const tmp = makeTmpProject();
    try {
      assert.throws(() => approveSubplans('', 'implementation', tmp), /parentSlug required/);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateParentPlan
// ─────────────────────────────────────────────────────────────────────────────

describe('validateParentPlan', () => {
  it('accepts a resolvable parent', () => {
    const tmp = makeTmpProject();
    try {
      fs.writeFileSync(path.join(tmp, 'plans', 'functional', 'PARENT.md'), '# PARENT\n');
      const content = '---\ntitle: "child"\ntype: implementation\nparent_plan: PARENT\n---\n\n# child\n';
      const res = validateParentPlan(content, tmp);
      assert.equal(res.valid, true);
      assert.ok(!res.warnings.some(w => /dangling|no existing plan/i.test(w)), 'no dangling warning for a resolvable parent');
    } finally {
      cleanup(tmp);
    }
  });

  it('warns (does not error) on a dangling parent', () => {
    const tmp = makeTmpProject();
    try {
      const content = '---\ntitle: "child"\ntype: implementation\nparent_plan: GHOST\n---\n\n# child\n';
      const res = validateParentPlan(content, tmp);
      assert.equal(res.valid, true, 'dangling parent must NOT flip valid to false');
      assert.equal(res.errors.length, 0, 'dangling parent is never an error');
      assert.ok(res.warnings.some(w => /dangling|no existing plan/i.test(w) && /GHOST/.test(w)), 'a dangling-parent warning mentioning GHOST is present');
    } finally {
      cleanup(tmp);
    }
  });

  it('clean-passes when parent_plan is absent (optional field)', () => {
    const tmp = makeTmpProject();
    try {
      const content = '---\ntitle: "top-level"\ntype: functional\n---\n\n# top-level\n';
      const res = validateParentPlan(content, tmp);
      assert.equal(res.valid, true);
      assert.ok(!res.warnings.some(w => /dangling|no existing plan/i.test(w)), 'no dangling warning when the field is absent');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// gate wiring
// ─────────────────────────────────────────────────────────────────────────────

describe('gate wiring — validateForQueue surfaces a dangling parent as a WARNING not an ERROR', () => {
  it('does not block the queue gate on a dangling parent', () => {
    const tmp = makeTmpProject();
    try {
      // Queue-ready plan (title + Implementation section) with a dangling parent.
      const p = writePlan(tmp, 'implementation', 'child-plan', { parent: 'GHOST' });
      const res = validateForQueue(p, tmp);
      assert.equal(res.valid, true, 'dangling parent must not fail validateForQueue');
      assert.ok(res.warnings.some(w => /dangling|no existing plan/i.test(w)), 'dangling parent surfaced as a warning at the queue gate');
      assert.ok(!res.errors.some(e => /dangling|no existing plan/i.test(e)), 'dangling parent is not an error at the queue gate');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// prose contract (agent + docs)
// ─────────────────────────────────────────────────────────────────────────────

describe('prose contract', () => {
  it('implementation-planner.md carries the decomposition mandate + slice-sizing rule', () => {
    const md = fs.readFileSync(path.join(projectRoot, 'agents', 'planning', 'implementation-planner.md'), 'utf8');
    assert.match(md, /parent_plan/, 'mentions parent_plan');
    assert.match(md, /more implementation plans than[\s\S]{0,40}functional/i, 'has the "more implementation plans than functional" mandate');
    assert.match(md, /depends_on/, 'mentions depends_on ordering');
    assert.match(md, /never split a module from its (own )?test/i, 'has the never-split-module-from-test rule');
    assert.match(md, /-s<N>-|<parent-slug>-s/i, 'documents the -s<N>- slice naming convention');
  });

  it('IRON_LOOP.md documents 1 functional → N implementation + batched gates', () => {
    const md = fs.readFileSync(path.join(projectRoot, 'docs', 'IRON_LOOP.md'), 'utf8');
    assert.match(md, /N small|1 functional[\s\S]{0,40}(many|N)[\s\S]{0,20}implementation/i, 'references N small / 1 functional → N implementation');
    assert.match(md, /approveSubplans|batched? gate/i, 'references batched gates / approveSubplans');
  });

  it('CLAUDE.md references the 1→N decomposition + parent_plan', () => {
    const md = fs.readFileSync(path.join(projectRoot, 'CLAUDE.md'), 'utf8');
    assert.match(md, /parent_plan/, 'mentions parent_plan');
    assert.match(md, /N small implementation plans|1 functional[\s\S]{0,40}(many|N)[\s\S]{0,20}implementation/i, 'references the 1→N decomposition');
  });
});
