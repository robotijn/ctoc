/**
 * Stacked-frontmatter coverage blindness in src/lib/plan-coverage.js
 *
 * THE DEFECT (disk-verified before this file was written):
 *   `addApprovalMarker` (src/lib/actions.js) PREPENDS a `---…---` marker block
 *   ahead of a plan's own frontmatter on every human-gate crossing. A plan that
 *   crossed Gate 2 therefore lands in `todo/` carrying TWO leading blocks (and a
 *   plan that crossed several gates carries three or four — 84 and 102 plans in
 *   the live corpus respectively).
 *
 *   `readPlanFiles` reads the frontmatter via `parseFrontmatter`, whose regex
 *   `/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/` matches ONLY THE FIRST block. The
 *   marker block contains no `files:` key, so `readPlanFiles` returns `[]` and
 *   `findCoveringPlan` returns `null` — the PreToolUse enforcement hook then
 *   BLOCKS the implementer from editing the very files the plan declares.
 *
 *   Note `state.parseMetadata` is NOT affected: it was already fixed (finding
 *   M19) to merge every leading block via `extractFrontmatterRegion`. This file
 *   pins the same fix for the coverage oracle, and guards that the shared
 *   `parseFrontmatter` body/raw contract is left alone.
 *
 * DIRECTION OF THE GUARDRAIL CHANGE (stated, not buried): the fix makes coverage
 * see files it previously could not, so the hook ALLOWS edits it previously
 * BLOCKED. That is the intended enforcement contract — "plan-covered target →
 * allow" — restored for stamped plans, not a widening of it. Coverage scope is
 * unchanged (`in-progress` > `todo` > `implementation`); no plan gains coverage
 * it did not already declare in its own `files:` list.
 *
 * Real temp dirs under os.tmpdir(); the real module; no mocking of core logic.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { findCoveringPlan, readPlanFiles } = require('../src/lib/plan-coverage');
const { parseMetadata } = require('../src/lib/state');
const { parseFrontmatter } = require('../src/lib/frontmatter');

const sandboxes = [];
function mkSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stacked-fm-'));
  for (const stage of ['implementation', 'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  }
  sandboxes.push(root);
  return root;
}
function writePlan(root, stage, slug, content) {
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, content);
  return p;
}
after(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

// The exact shape addApprovalMarker produces, ahead of a plan's own block.
const MARKER = [
  '---',
  'approved_by: human',
  'approved_at: 2026-07-14T14:00:00.000Z',
  'gate_crossed: implementation → todo',
  '---',
  '',
].join('\n');

const OWN = [
  '---',
  'title: "R2-A — Scheduler lifecycle honesty"',
  'type: implementation',
  'iron_loop: true',
  'files:',
  '  - "src/lib/task-registry.js"',
  '  - "src/lib/task-reconcile.js"',
  '  - "tests/task-registry.test.js"',
  '---',
  '',
  '# R2-A — Scheduler lifecycle honesty',
  '',
  'Real body content that must never be truncated.',
  '',
].join('\n');

describe('plan-coverage sees `files:` through a prepended approval marker', () => {
  it('RED: a stacked (marker + own) plan resolves its declared files', () => {
    const root = mkSandbox();
    const p = writePlan(root, 'todo', 'stacked-two', MARKER + '\n' + OWN);

    assert.deepEqual(readPlanFiles(p), [
      'src/lib/task-registry.js',
      'src/lib/task-reconcile.js',
      'tests/task-registry.test.js',
    ], 'the plan\'s own files: survives the prepended marker block');
  });

  it('RED: the enforcement oracle covers a stamped plan\'s declared file', () => {
    const root = mkSandbox();
    writePlan(root, 'todo', 'stacked-cover', MARKER + '\n' + OWN);

    const hit = findCoveringPlan('src/lib/task-registry.js', root);
    assert.ok(hit, 'a gate-stamped plan must still cover the file it declares');
    assert.equal(hit.stage, 'todo');
  });

  it('four stacked blocks (the real multi-gate corpus shape) still resolve', () => {
    const root = mkSandbox();
    const g3 = MARKER.replace('implementation → todo', 'review → done');
    const p = writePlan(root, 'todo', 'stacked-four', MARKER + '\n' + g3 + '\n' + MARKER + '\n' + OWN);

    assert.deepEqual(readPlanFiles(p), [
      'src/lib/task-registry.js',
      'src/lib/task-reconcile.js',
      'tests/task-registry.test.js',
    ], 'block count is not assumed to be two');
  });

  it('MERGE RULE — the physically LAST `files:` wins (the plan\'s own block)', () => {
    const root = mkSandbox();
    const earlier = ['---', 'files:', '  - "src/decoy.js"', '---', ''].join('\n');
    const p = writePlan(root, 'todo', 'dup-files', earlier + '\n' + OWN);

    assert.deepEqual(readPlanFiles(p), [
      'src/lib/task-registry.js',
      'src/lib/task-reconcile.js',
      'tests/task-registry.test.js',
    ], 'a later block overrides an earlier one, matching parseFrontmatterLines');
    assert.ok(!readPlanFiles(p).includes('src/decoy.js'), 'the overridden list is not merged in');
  });

  // ── Regression guards: the overwhelming-majority path must not move ─────────

  it('REGRESSION: a normal single-block plan is unaffected', () => {
    const root = mkSandbox();
    const p = writePlan(root, 'todo', 'single', OWN);
    assert.deepEqual(readPlanFiles(p), [
      'src/lib/task-registry.js',
      'src/lib/task-reconcile.js',
      'tests/task-registry.test.js',
    ]);
    const hit = findCoveringPlan('src/lib/task-reconcile.js', root);
    assert.ok(hit && hit.stage === 'todo');
  });

  it('REGRESSION: CRLF twin resolves identically to its LF twin', () => {
    const root = mkSandbox();
    const lf = writePlan(root, 'todo', 'lf', MARKER + '\n' + OWN);
    const crlf = writePlan(root, 'implementation', 'crlf', (MARKER + '\n' + OWN).replace(/\n/g, '\r\n'));
    assert.deepEqual(readPlanFiles(crlf), readPlanFiles(lf), 'CRLF safety (finding H1) preserved');
  });

  it('FAIL-SOFT: malformed / unterminated / empty frontmatter returns [] and never throws', () => {
    const root = mkSandbox();
    const cases = {
      'no-fm': '# Just a heading\n\nNo frontmatter at all.\n',
      'unterminated': '---\napproved_by: human\ntitle: "never closed"\nfiles:\n  - "src/x.js"\n',
      'empty': '',
      'fences-only': '---\n---\n\n# Body\n',
      'no-files-key': MARKER + '\n---\ntitle: "no files"\ntype: implementation\n---\n\n# B\n',
    };
    for (const [slug, content] of Object.entries(cases)) {
      const p = writePlan(root, 'todo', slug, content);
      assert.doesNotThrow(() => readPlanFiles(p), `${slug} must not throw`);
      assert.deepEqual(readPlanFiles(p), [], `${slug} fails soft to []`);
    }
    assert.deepEqual(readPlanFiles(path.join(root, 'plans', 'todo', 'does-not-exist.md')), [],
      'an unreadable file still fails soft to []');
  });

  it('FAIL-OPEN: falls back to the single-block reader when extractFrontmatterRegion throws', () => {
    // Fault-inject the lazily-required collaborator (the same seam and pattern
    // state-coverage.test.js uses for parseMetadata's twin catch) to prove a
    // parser fault can never resolve to LESS coverage than the old reader gave.
    const stalePath = require.resolve('../src/lib/stale-detector');
    const mod = require('../src/lib/stale-detector');
    const original = mod.extractFrontmatterRegion;
    mod.extractFrontmatterRegion = () => { throw new Error('injected fault'); };
    try {
      const root = mkSandbox();
      const p = writePlan(root, 'todo', 'fault', OWN);
      // The single-block fallback still recovers a normal plan's declaration.
      assert.deepEqual(readPlanFiles(p), [
        'src/lib/task-registry.js',
        'src/lib/task-reconcile.js',
        'tests/task-registry.test.js',
      ], 'fault falls open to the previous single-block behavior');
    } finally {
      mod.extractFrontmatterRegion = original;
      assert.equal(require(stalePath).extractFrontmatterRegion, original, 'export restored');
    }
  });

  it('the shared parseFrontmatter body/raw contract is NOT modified by this fix', () => {
    const content = MARKER + '\n' + OWN;
    const { hasFrontmatter, raw, body } = parseFrontmatter(content);
    assert.equal(hasFrontmatter, true);
    assert.match(raw, /approved_by: human/, 'raw still exposes exactly the FIRST block');
    assert.ok(!raw.includes('title:'), 'parseFrontmatter deliberately still stops at block one');
    assert.match(body, /# R2-A — Scheduler lifecycle honesty/, 'body is not truncated');
    assert.match(body, /Real body content that must never be truncated\./, 'no byte of body is lost');
  });

  it('parseMetadata (already merged, finding M19) keeps both blocks\' keys', () => {
    const meta = parseMetadata(MARKER + '\n' + OWN);
    assert.equal(meta.approved_by, 'human', 'block-1 marker key preserved');
    assert.equal(meta.title, 'R2-A — Scheduler lifecycle honesty', 'block-2 key preserved');
    assert.equal(meta.type, 'implementation');
  });
});
