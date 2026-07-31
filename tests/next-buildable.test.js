'use strict';

/**
 * nextBuildable — the dependency-and-criticality-ordered selector over CTOC's
 * approved build queue. A PURE READ: given the approved-to-build plans (todo +
 * in-progress, ledger-vouched, via approvedFreeQueue), it answers "which do I
 * build next, in what order, respecting dependencies and criticality?".
 *
 * Real temp-dir state + real Gate-2 ledger entries (mirrors
 * tests/continuation-queue.test.js). NOTHING mocked. No writes to the repo root.
 *
 * Contract:
 *   - buildable:  approved refs whose every depends_on predecessor is SATISFIED,
 *                 ordered critical > high > medium > low > unset, stable in-tier.
 *   - blocked:    [{ ref, blockedBy: [unbuilt predecessor slugs] }].
 *   - inversions: [{ ref, blockedBy, reason }] — a CRITICAL plan blocked behind a
 *                 lower-criticality unbuilt predecessor (surfaced, never reordered).
 *   - missingDeps:[{ ref, dep }] — a depends_on that resolves to NO plan file
 *                 (treated satisfied, but recorded).
 * A predecessor is SATISFIED when it sits in plans/review/ (built, awaiting the
 * human) OR plans/done/ (shipped); still in todo/in-progress/implementation → not.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const q = require('../src/lib/continuation-queue');
const ledger = require('../src/lib/approval-ledger');

// ── fixtures ────────────────────────────────────────────────────────────────

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-nb-'));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  for (const s of ['implementation', 'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  return dir;
}

function planText(slug, { dependsOn = 'none', priority = null, body = 'The spec the human ruled on.' } = {}) {
  const lines = ['---', `title: "${slug}"`, 'type: implementation'];
  if (Array.isArray(dependsOn)) {
    lines.push('depends_on:');
    for (const d of dependsOn) lines.push(`  - ${d}`);
  } else {
    lines.push(`depends_on: ${dependsOn}`);
  }
  if (priority !== null) lines.push(`priority: ${priority}`);
  lines.push('files:', `  - "src/lib/${slug}.js"`, '---', '', `# ${slug}`, '', body);
  return lines.join('\n') + '\n';
}

/** Write a plan file; when approve=true mint a REAL Gate-2 ledger entry (todo edge,
 *  content-bound) so approvedFreeQueue vouches for it. Predecessors placed in
 *  review/done/implementation need no approval — nextBuildable only checks their
 *  file residency. */
function makePlan(root, stage, slug, { approve = true, dependsOn = 'none', priority = null, body } = {}) {
  const content = planText(slug, { dependsOn, priority, body });
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, content);
  if (approve) {
    ledger.writeEntry(
      ledger.slugFromPlanPath(p),
      { content, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human' },
      root,
    );
  }
  return p;
}

const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

// ── (a) criticality ordering of independent plans ───────────────────────────

test('(a) two+ independent approved plans are ordered critical > high > medium > low > unset', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'p-low', { priority: 'low' });
    makePlan(dir, 'todo', 'p-critical', { priority: 'CRITICAL' }); // case-insensitive
    makePlan(dir, 'todo', 'p-unset'); // no priority -> last
    makePlan(dir, 'todo', 'p-high', { priority: 'High' });
    makePlan(dir, 'todo', 'p-medium', { priority: 'medium' });

    const r = q.nextBuildable(dir);
    assert.deepEqual(r.buildable, [
      'todo/p-critical.md',
      'todo/p-high.md',
      'todo/p-medium.md',
      'todo/p-low.md',
      'todo/p-unset.md',
    ]);
    assert.deepEqual(r.blocked, []);
    assert.deepEqual(r.inversions, []);
  } finally { cleanup(dir); }
});

test('(a2) stable within a criticality tier — preserves queue (readdir) order', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'aaa', { priority: 'high' });
    makePlan(dir, 'todo', 'bbb', { priority: 'high' });
    makePlan(dir, 'todo', 'ccc', { priority: 'high' });
    // Oracle: the approvedFreeQueue order IS the queue order the stable sort must keep.
    const queueOrder = q.approvedFreeQueue(dir).refs;
    assert.deepEqual(q.nextBuildable(dir).buildable, queueOrder);
  } finally { cleanup(dir); }
});

// ── (b) unbuilt predecessor blocks ───────────────────────────────────────────

test('(b) A depends_on B with B still in todo -> A blocked, B buildable, A not buildable', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'B-dep', { priority: 'high' });
    makePlan(dir, 'todo', 'A-plan', { dependsOn: 'B-dep', priority: 'high' });

    const r = q.nextBuildable(dir);
    assert.deepEqual(r.buildable, ['todo/B-dep.md'], 'only the unblocked predecessor builds');
    assert.deepEqual(r.blocked, [{ ref: 'todo/A-plan.md', blockedBy: ['B-dep'] }]);
    assert.deepEqual(r.inversions, []);
  } finally { cleanup(dir); }
});

// ── (c) built-and-waiting (review) satisfies ─────────────────────────────────

test('(c) A depends_on B with B in review/ -> A IS buildable (built-and-waiting satisfies)', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'review', 'B-built', { approve: false }); // waiting for the human
    makePlan(dir, 'todo', 'A-ready', { dependsOn: 'B-built' });

    const r = q.nextBuildable(dir);
    assert.deepEqual(r.buildable, ['todo/A-ready.md']);
    assert.deepEqual(r.blocked, []);
  } finally { cleanup(dir); }
});

// ── (d) shipped (done) satisfies ─────────────────────────────────────────────

test('(d) A depends_on B with B in done/ -> A buildable; .md suffix on the dep value tolerated', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'done', 'B-shipped', { approve: false });
    makePlan(dir, 'todo', 'A-go', { dependsOn: 'B-shipped.md' }); // dep written WITH .md

    assert.deepEqual(q.nextBuildable(dir).buildable, ['todo/A-go.md']);
  } finally { cleanup(dir); }
});

// ── (e) priority inversion is surfaced, never blocks the engine ──────────────

test('(e) critical plan blocked behind a low-priority unbuilt dep -> inversion; the dep is the buildable thing', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'low-blocker', { priority: 'low' });
    makePlan(dir, 'todo', 'crit-waiter', { dependsOn: 'low-blocker', priority: 'critical' });

    const r = q.nextBuildable(dir);
    // The engine still surfaces the low-priority predecessor as the next thing to build.
    assert.deepEqual(r.buildable, ['todo/low-blocker.md']);
    assert.deepEqual(r.blocked, [{ ref: 'todo/crit-waiter.md', blockedBy: ['low-blocker'] }]);
    assert.equal(r.inversions.length, 1);
    assert.equal(r.inversions[0].ref, 'todo/crit-waiter.md');
    assert.equal(r.inversions[0].blockedBy, 'low-blocker');
    assert.match(r.inversions[0].reason, /critical/i);
  } finally { cleanup(dir); }
});

test('(e2) a critical plan blocked behind an EQUAL-or-higher-criticality dep is NOT an inversion', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'crit-blocker', { priority: 'critical' });
    makePlan(dir, 'todo', 'crit-waiter2', { dependsOn: 'crit-blocker', priority: 'critical' });

    const r = q.nextBuildable(dir);
    assert.deepEqual(r.buildable, ['todo/crit-blocker.md']);
    assert.deepEqual(r.inversions, [], 'blocked behind an equal-criticality dep is normal ordering');
  } finally { cleanup(dir); }
});

// ── (f) dep resolving to no file is satisfied but recorded ───────────────────

test('(f) depends_on resolving to NO plan file -> treated satisfied, recorded in missingDeps', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'A-external', { dependsOn: 'ghost-not-a-plan' });

    const r = q.nextBuildable(dir);
    assert.deepEqual(r.buildable, ['todo/A-external.md'], 'a missing/external dep never blocks');
    assert.deepEqual(r.missingDeps, [{ ref: 'todo/A-external.md', dep: 'ghost-not-a-plan' }]);
  } finally { cleanup(dir); }
});

// ── depends_on shape coverage: none / comma-list / block-list ────────────────

test('depends_on shapes: "none", comma-list, and block-list all parse', () => {
  const dir = mkProject();
  try {
    // predecessors, all satisfied in done/
    makePlan(dir, 'done', 'dep1', { approve: false });
    makePlan(dir, 'done', 'dep2', { approve: false });
    makePlan(dir, 'done', 'dep3', { approve: false });

    makePlan(dir, 'todo', 'p-none', { dependsOn: 'none' });
    makePlan(dir, 'todo', 'p-comma', { dependsOn: 'dep1, dep2' }); // comma-separated
    makePlan(dir, 'todo', 'p-block', { dependsOn: ['dep2', 'dep3'] }); // block list

    const r = q.nextBuildable(dir);
    assert.deepEqual(
      r.buildable.slice().sort(),
      ['todo/p-block.md', 'todo/p-comma.md', 'todo/p-none.md'],
    );
    assert.deepEqual(r.blocked, []);
    assert.deepEqual(r.missingDeps, []);
  } finally { cleanup(dir); }
});

test('a comma-list where ONE dep is unbuilt -> blocked names only the unbuilt one', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'done', 'built-dep', { approve: false });
    makePlan(dir, 'todo', 'unbuilt-dep', { priority: 'high' }); // still in todo -> unbuilt
    makePlan(dir, 'todo', 'consumer', { dependsOn: 'built-dep, unbuilt-dep' });

    const r = q.nextBuildable(dir);
    assert.ok(r.buildable.includes('todo/unbuilt-dep.md'));
    assert.ok(!r.buildable.includes('todo/consumer.md'));
    assert.deepEqual(r.blocked, [{ ref: 'todo/consumer.md', blockedBy: ['unbuilt-dep'] }]);
  } finally { cleanup(dir); }
});

test('a predecessor sitting in implementation/ (pre-build) is NOT satisfied', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'implementation', 'impl-dep', { approve: false });
    makePlan(dir, 'todo', 'waits-on-impl', { dependsOn: 'impl-dep' });

    const r = q.nextBuildable(dir);
    assert.deepEqual(r.buildable, []);
    assert.deepEqual(r.blocked, [{ ref: 'todo/waits-on-impl.md', blockedBy: ['impl-dep'] }]);
  } finally { cleanup(dir); }
});

// ── (g) empty queue ──────────────────────────────────────────────────────────

test('(g) empty approved queue -> empty result, no throw', () => {
  const dir = mkProject();
  try {
    let r;
    assert.doesNotThrow(() => { r = q.nextBuildable(dir); });
    assert.deepEqual(r, { buildable: [], blocked: [], inversions: [], missingDeps: [] });
  } finally { cleanup(dir); }
});

test('(g2) bad/invalid root -> empty result, never throws', () => {
  assert.doesNotThrow(() => q.nextBuildable(null));
  assert.deepEqual(q.nextBuildable(null), { buildable: [], blocked: [], inversions: [], missingDeps: [] });
  assert.deepEqual(q.nextBuildable(''), { buildable: [], blocked: [], inversions: [], missingDeps: [] });
});

// ── (h) fault isolation ──────────────────────────────────────────────────────

test('(h) an unreadable predecessor (a directory named <slug>.md) is skipped, never throws', () => {
  const dir = mkProject();
  try {
    // A directory occupies the predecessor path: existsSync true, readFileSync throws.
    fs.mkdirSync(path.join(dir, 'plans', 'todo', 'weird-dep.md'), { recursive: true });
    makePlan(dir, 'todo', 'depends-on-weird', { dependsOn: 'weird-dep', priority: 'critical' });

    let r;
    assert.doesNotThrow(() => { r = q.nextBuildable(dir); });
    // weird-dep is located in todo (unbuilt) but its priority read faults -> still blocks.
    assert.deepEqual(r.blocked, [{ ref: 'todo/depends-on-weird.md', blockedBy: ['weird-dep'] }]);
    assert.deepEqual(r.buildable, []);
    // Priority unreadable -> treated as unset (rank below critical) -> inversion surfaced.
    assert.equal(r.inversions.length, 1);
    assert.equal(r.inversions[0].blockedBy, 'weird-dep');
  } finally { cleanup(dir); }
});

// ── REAL captured samples (golden-corpus) — nextBuildable reads the real contract ─
//
// nextBuildable reads plan frontmatter (depends_on, priority) via the canonical
// reader (state.parseMetadata), so it is a consumer of the persisted plan-frontmatter
// contract. Per the golden-corpus fence, a synthetic-only test for such a module is
// the defect; this drives the REAL captured samples from
// tests/fixtures/golden-corpus/plan-frontmatter/ through nextBuildable's reading path.

const GOLDEN_CORPUS_PLAN_FRONTMATTER = path.join(__dirname, 'fixtures', 'golden-corpus', 'plan-frontmatter');

test('drives REAL captured plan-frontmatter samples through nextBuildable (not synthetic-only)', () => {
  const dir = mkProject();
  try {
    const samples = fs.readdirSync(GOLDEN_CORPUS_PLAN_FRONTMATTER).filter((f) => f.endsWith('.md'));
    assert.ok(samples.length >= 1, 'expected real captured plan-frontmatter samples on disk');
    for (const sample of samples) {
      const content = fs.readFileSync(path.join(GOLDEN_CORPUS_PLAN_FRONTMATTER, sample), 'utf8');
      // The corpus filename carries a `<stage>__` prefix (capture convention) that is not
      // a valid plan slug; normalise it. The REAL captured frontmatter content — the
      // thing under test — is written verbatim.
      const slug = sample.replace(/\.md$/, '').replace(/^[a-z]+__/, '');
      const p = path.join(dir, 'plans', 'todo', `${slug}.md`);
      fs.writeFileSync(p, content);
      ledger.writeEntry(
        ledger.slugFromPlanPath(p),
        { content, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human' },
        dir,
      );
    }
    let r;
    assert.doesNotThrow(() => { r = q.nextBuildable(dir); });
    // Every captured sample declares CRITICAL priority and has no in-tree unbuilt
    // predecessor (deps are 'none' or resolve to no plan file here) -> all buildable,
    // proving nextBuildable parsed the real priority/depends_on the pipeline wrote.
    assert.equal(r.buildable.length, samples.length, `all real samples buildable: ${JSON.stringify(r)}`);
    assert.deepEqual(r.blocked, []);
    // The captured UI1 plan really declares depends_on a slug absent from this tree ->
    // recorded (satisfied but noted), proving the missing-dep path over real data.
    assert.ok(
      r.missingDeps.some((m) => m.dep === '00110-agents-told-to-run-code-they-cannot-run'),
      `expected the real captured missing dependency to be recorded: ${JSON.stringify(r.missingDeps)}`,
    );
  } finally { cleanup(dir); }
});

// ── live wiring: shouldContinueQueue surfaces the build order (reachability) ──

test('shouldContinueQueue attaches buildOrder additively; existing fields unchanged', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'B-first', { priority: 'high' });
    makePlan(dir, 'todo', 'A-second', { dependsOn: 'B-first', priority: 'critical' });

    const d = q.shouldContinueQueue(dir);
    // existing contract preserved
    assert.equal(d.continue, true);
    assert.equal(d.depth, 2);
    assert.match(d.reason, /2 approved plan\(s\)/);
    // additive build order: B is buildable, A is blocked behind it (an inversion).
    assert.deepEqual(d.buildOrder.buildable, ['todo/B-first.md']);
    assert.deepEqual(d.buildOrder.blocked, [{ ref: 'todo/A-second.md', blockedBy: ['B-first'] }]);
    assert.equal(d.buildOrder.inversions.length, 1);
  } finally { cleanup(dir); }
});

test('shouldContinueQueue with an empty queue carries NO buildOrder (continue:false branch)', () => {
  const dir = mkProject();
  try {
    const d = q.shouldContinueQueue(dir);
    assert.equal(d.continue, false);
    assert.equal(d.buildOrder, undefined);
  } finally { cleanup(dir); }
});

// ── existing queue shape is untouched (regression guard) ─────────────────────

test('approvedFreeQueue still returns the {refs, depth} shape nextBuildable is built on', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', 'z1', { priority: 'high' });
    const afq = q.approvedFreeQueue(dir);
    assert.deepEqual(Object.keys(afq).sort(), ['depth', 'refs']);
    assert.equal(afq.depth, 1);
    assert.deepEqual(afq.refs, ['todo/z1.md']);
  } finally { cleanup(dir); }
});
