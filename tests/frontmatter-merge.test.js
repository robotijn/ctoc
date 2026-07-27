'use strict';

/**
 * Approval stamping merges into ONE frontmatter block (FR-1/FR-2/FR-3/FR-4).
 *
 * Root cause fenced here: `addApprovalMarker` PREPENDED a brand-new `---…---`
 * block on every human-gate crossing, stacking 2-4 blocks and hiding the plan's
 * real `title`/`type`/`files:`/`depends_on` (all below the first block) from the
 * shared primitive `frontmatter.parseFrontmatter`, which reads only the FIRST
 * block. The fix MERGES the marker into the plan's single existing block, and a
 * one-time migration collapses the already-corrupted plans.
 *
 * Behaviour-first, zero test doubles for the code under test: real pure functions
 * and real temp plan trees under os.tmpdir().
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  mergeStackedFrontmatter,
  upsertMarkerFields,
} = require('../src/lib/frontmatter-merge');
const { parseFrontmatter } = require('../src/lib/frontmatter');
const { parseMetadata } = require('../src/lib/state');
const migration = require('../src/scripts/collapse-stacked-frontmatter');
const { approvePlan } = require('../src/lib/actions');

// ── helper: count consecutive LEADING `---…---` blocks ────────────────────────
function leadingBlockCount(content) {
  const lines = String(content).split(/\r?\n/);
  let i = 0;
  let count = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  while (i < lines.length && lines[i].trim() === '---') {
    let j = i + 1;
    let closed = false;
    while (j < lines.length) {
      if (lines[j].trim() === '---') { closed = true; break; }
      j++;
    }
    if (!closed) break;
    count++;
    i = j + 1;
    const save = i;
    while (i < lines.length && lines[i].trim() === '') i++;
    if (!(i < lines.length && lines[i].trim() === '---')) { i = save; break; }
  }
  return count;
}

const REAL_BLOCK =
  '---\n' +
  'title: "A slice that keeps its name"\n' +
  'type: implementation\n' +
  'parent_plan: feature-x\n' +
  'depends_on: slice-a, slice-b\n' +
  'priority: HIGH\n' +
  'files:\n' +
  '  - "src/lib/x.js"\n' +
  '  - "tests/x.test.js"\n' +
  '---\n\n' +
  '# A slice\n\nBody stays intact.\n';

// ── FR-1 / FR-2 / FR-4(a): the write-path merge ───────────────────────────────
describe('upsertMarkerFields (FR-1/FR-2)', () => {
  it('FR-1: first crossing merges the marker into the single existing block', () => {
    const out = upsertMarkerFields(REAL_BLOCK, [
      ['approved_by', 'human'],
      ['approved_at', '2026-07-27T10:00:00.000Z'],
      ['gate_crossed', 'functional → implementation'],
    ]);
    assert.equal(leadingBlockCount(out), 1, 'exactly one frontmatter block');
    const fm = parseFrontmatter(out);
    assert.ok(fm.hasFrontmatter);
    // The single block the PRIMITIVE reads carries BOTH the plan's own fields and the marker.
    assert.match(fm.raw, /title: "A slice that keeps its name"/, 'title in the one block');
    assert.match(fm.raw, /files:/, 'files: in the one block');
    assert.match(fm.raw, /depends_on: slice-a, slice-b/, 'depends_on in the one block');
    assert.match(fm.raw, /approved_by: human/, 'marker in the one block');
    assert.match(fm.raw, /gate_crossed: functional → implementation/);
    // Body untouched.
    assert.match(fm.body, /# A slice/);
    assert.match(fm.body, /Body stays intact\./);
    // The reader that backs the dashboard still sees the real fields.
    const meta = parseMetadata(out);
    assert.equal(meta.title, 'A slice that keeps its name');
    assert.equal(meta.type, 'implementation');
  });

  it('FR-4(a): a SECOND, later crossing keeps exactly one block and updates in place', () => {
    let out = upsertMarkerFields(REAL_BLOCK, [
      ['approved_by', 'human'],
      ['approved_at', '2026-07-27T10:00:00.000Z'],
      ['gate_crossed', 'functional → implementation'],
    ]);
    out = upsertMarkerFields(out, [
      ['approved_by', 'human'],
      ['approved_at', '2026-07-27T11:00:00.000Z'],
      ['gate_crossed', 'implementation → todo'],
    ]);
    assert.equal(leadingBlockCount(out), 1, 'still exactly one block after two crossings');
    const fm = parseFrontmatter(out);
    // Real fields survive both crossings, read through the raw PRIMITIVE.
    assert.match(fm.raw, /title: "A slice that keeps its name"/);
    assert.match(fm.raw, /files:/);
    assert.match(fm.raw, /depends_on: slice-a, slice-b/);
    // The marker reflects the CURRENT crossing (updated in place, not duplicated).
    assert.match(fm.raw, /gate_crossed: implementation → todo/);
    assert.doesNotMatch(fm.raw, /functional → implementation/, 'stale edge replaced, not stacked');
    const approvedAt = (fm.raw.match(/approved_at:/g) || []).length;
    assert.equal(approvedAt, 1, 'no duplicate approved_at key');
  });

  it('FR-2: idempotent — re-stamping the SAME edge never adds a second block', () => {
    let out = upsertMarkerFields(REAL_BLOCK, [
      ['approved_by', 'human'],
      ['approved_at', '2026-07-27T10:00:00.000Z'],
      ['gate_crossed', 'implementation → todo'],
    ]);
    out = upsertMarkerFields(out, [
      ['approved_by', 'human'],
      ['approved_at', '2026-07-27T10:05:00.000Z'],
      ['gate_crossed', 'implementation → todo'],
    ]);
    assert.equal(leadingBlockCount(out), 1);
    assert.equal((out.match(/gate_crossed:/g) || []).length, 1, 'one gate_crossed, not two');
  });

  it('FR-2: an override marker is cleared when the next crossing is clean (named rule)', () => {
    let out = upsertMarkerFields(REAL_BLOCK, [
      ['approved_by', 'human'],
      ['approved_at', '2026-07-27T10:00:00.000Z'],
      ['gate_crossed', 'implementation → todo'],
      ['override', 'true'],
      ['override_reason', 'forced past a lint failure'],
    ]);
    assert.match(out, /override: true/);
    out = upsertMarkerFields(out, [
      ['approved_by', 'human'],
      ['approved_at', '2026-07-27T12:00:00.000Z'],
      ['gate_crossed', 'implementation → todo'],
    ]);
    assert.equal(leadingBlockCount(out), 1);
    assert.doesNotMatch(out, /override: true/, 'stale override provenance cleared on a clean re-crossing');
    assert.doesNotMatch(out, /override_reason/, 'stale override_reason cleared too');
  });

  it('FR-1: a plan with NO frontmatter gets exactly one created block', () => {
    const out = upsertMarkerFields('# Bare plan\n\nno frontmatter here\n', [
      ['approved_by', 'human'],
      ['approved_at', '2026-07-27T10:00:00.000Z'],
      ['gate_crossed', 'review → done'],
    ]);
    assert.equal(leadingBlockCount(out), 1);
    assert.match(parseFrontmatter(out).raw, /approved_by: human/);
    assert.match(parseFrontmatter(out).body, /# Bare plan/);
  });
});

// ── FR-3 / FR-4(b): collapse stacked blocks, most-recent marker wins ───────────
describe('mergeStackedFrontmatter (FR-3)', () => {
  // Mirrors the real corruption: three stacked marker blocks (newest FIRST, the
  // way a prepend stacks them) ahead of the plan's own block.
  const STACKED =
    '---\napproved_by: human\napproved_at: 2026-07-19T21:28:21.097Z\ngate_crossed: implementation → todo\n---\n\n' +
    '---\napproved_by: human\napproved_at: 2026-07-19T16:47:51.634Z\ngate_crossed: implementation → todo\n---\n\n' +
    '---\napproved_by: human\napproved_at: 2026-07-19T15:21:52.067Z\ngate_crossed: implementation → todo\n---\n\n' +
    REAL_BLOCK;

  it('collapses stacked blocks into one and preserves every field', () => {
    const { changed, content } = mergeStackedFrontmatter(STACKED);
    assert.equal(changed, true);
    assert.equal(leadingBlockCount(content), 1, 'exactly one block after collapse');
    const fm = parseFrontmatter(content);
    // Plan's own fields — now visible to the raw primitive.
    assert.match(fm.raw, /title: "A slice that keeps its name"/);
    assert.match(fm.raw, /files:/);
    assert.match(fm.raw, /- "src\/lib\/x.js"/);
    assert.match(fm.raw, /depends_on: slice-a, slice-b/);
    // Marker present, and it is the MOST-RECENT crossing (topmost block wins).
    assert.match(fm.raw, /approved_by: human/);
    assert.match(fm.raw, /approved_at: 2026-07-19T21:28:21.097Z/, 'most-recent approved_at kept');
    assert.doesNotMatch(fm.raw, /16:47:51/, 'older marker dropped');
    assert.doesNotMatch(fm.raw, /15:21:52/, 'oldest marker dropped');
    assert.equal((content.match(/approved_at:/g) || []).length, 1, 'no duplicate marker keys');
    // Body preserved.
    assert.match(fm.body, /Body stays intact\./);
  });

  it('preserves NESTED marker keys (kickback_counts) from the most-recent block', () => {
    const withNested =
      '---\napproved_by: human\napproved_at: 2026-07-20T09:34:57.018Z\ngate_crossed: implementation → todo\n' +
      "kickback_counts:\n  by_step:\n    '14': 1\n  total: 1\n---\n\n" +
      '---\napproved_by: human\napproved_at: 2026-07-20T09:18:53.756Z\ngate_crossed: implementation → todo\n---\n\n' +
      REAL_BLOCK;
    const { changed, content } = mergeStackedFrontmatter(withNested);
    assert.equal(changed, true);
    assert.equal(leadingBlockCount(content), 1);
    assert.match(content, /kickback_counts:/);
    assert.match(content, /by_step:/);
    assert.match(content, /'14': 1/);
    assert.match(content, /total: 1/);
    assert.match(content, /title: "A slice that keeps its name"/);
  });

  it('is a no-op on an already-single-block plan', () => {
    const { changed, content } = mergeStackedFrontmatter(REAL_BLOCK);
    assert.equal(changed, false);
    assert.equal(content, REAL_BLOCK);
  });

  it('is a no-op on a plan with no frontmatter', () => {
    const { changed } = mergeStackedFrontmatter('# no frontmatter\n');
    assert.equal(changed, false);
  });
});

// ── FR-3 / FR-4(c): the migration file writer + residency guard ────────────────
describe('collapse-stacked-frontmatter migration (FR-3)', () => {
  const sandboxes = [];
  function mkSandbox() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-collapse-'));
    for (const stage of ['implementation', 'todo', 'review', 'done']) {
      fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
    }
    sandboxes.push(root);
    return root;
  }
  function cleanup() {
    while (sandboxes.length) {
      try { fs.rmSync(sandboxes.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }

  const STACKED =
    '---\napproved_by: human\napproved_at: 2026-07-19T21:28:21.097Z\ngate_crossed: implementation → todo\n---\n\n' +
    '---\napproved_by: human\napproved_at: 2026-07-19T15:21:52.067Z\ngate_crossed: implementation → todo\n---\n\n' +
    REAL_BLOCK;

  it('migrates a review-stage stacked plan to one block and preserves its files:', () => {
    const root = mkSandbox();
    const planPath = path.join(root, 'plans', 'review', 'a-stacked-plan.md');
    fs.writeFileSync(planPath, STACKED);

    const res = migration.migrateFile(planPath, root);
    assert.equal(res.migrated, true);
    assert.equal(res.changed, true);

    const after = fs.readFileSync(planPath, 'utf8');
    assert.equal(leadingBlockCount(after), 1);
    const meta = parseMetadata(after);
    assert.equal(meta.title, 'A slice that keeps its name');
    // The primitive reader now sees files: (the whole point of the fix).
    assert.match(parseFrontmatter(after).raw, /files:/);
    cleanup();
  });

  it('FR-4(c): REFUSES to migrate a plan resident in a hash-swept folder (todo/)', () => {
    const root = mkSandbox();
    const planPath = path.join(root, 'plans', 'todo', 'a-queued-plan.md');
    fs.writeFileSync(planPath, STACKED);

    const res = migration.migrateFile(planPath, root);
    assert.equal(res.migrated, false, 'refused');
    assert.match(res.reason, /ledger|hash|todo|done/i, 'reason names the hash-swept hazard');

    // The file is left byte-identical — no rewrite that would desync the ledger hash.
    assert.equal(fs.readFileSync(planPath, 'utf8'), STACKED, 'todo/ plan untouched');
    cleanup();
  });

  it('FR-4(c): REFUSES to migrate a plan resident in done/', () => {
    const root = mkSandbox();
    const planPath = path.join(root, 'plans', 'done', 'a-done-plan.md');
    fs.writeFileSync(planPath, STACKED);
    const res = migration.migrateFile(planPath, root);
    assert.equal(res.migrated, false);
    assert.equal(fs.readFileSync(planPath, 'utf8'), STACKED, 'done/ plan untouched');
    cleanup();
  });

  it('reports changed:false (not migrated-with-error) for an already-clean review plan', () => {
    const root = mkSandbox();
    const planPath = path.join(root, 'plans', 'review', 'clean.md');
    fs.writeFileSync(planPath, REAL_BLOCK);
    const res = migration.migrateFile(planPath, root);
    assert.equal(res.migrated, true);
    assert.equal(res.changed, false, 'nothing to collapse');
    assert.equal(fs.readFileSync(planPath, 'utf8'), REAL_BLOCK);
    cleanup();
  });

  it('reports migrated:false with an unreadable reason for a missing plan file', () => {
    const root = mkSandbox();
    const missing = path.join(root, 'plans', 'review', 'does-not-exist.md');
    const res = migration.migrateFile(missing, root);
    assert.equal(res.migrated, false);
    assert.match(res.reason, /unreadable/i);
    cleanup();
  });
});

describe('collapse-stacked-frontmatter main() (FR-3 batch)', () => {
  const sandboxes = [];
  function mkSandbox() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-collapse-main-'));
    for (const stage of ['implementation', 'todo', 'review', 'done']) {
      fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
    }
    sandboxes.push(root);
    return root;
  }
  function cleanup() {
    while (sandboxes.length) {
      try { fs.rmSync(sandboxes.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }

  const STACKED =
    '---\napproved_by: human\napproved_at: 2026-07-19T21:28:21.097Z\ngate_crossed: implementation → todo\n---\n\n' +
    '---\napproved_by: human\napproved_at: 2026-07-19T15:21:52.067Z\ngate_crossed: implementation → todo\n---\n\n' +
    REAL_BLOCK;

  it('with no argv, migrates every stacked plan in plans/review/ and leaves clean ones alone', () => {
    const root = mkSandbox();
    const stacked = path.join(root, 'plans', 'review', 'stacked.md');
    const clean = path.join(root, 'plans', 'review', 'already-clean.md');
    fs.writeFileSync(stacked, STACKED);
    fs.writeFileSync(clean, REAL_BLOCK);

    const report = migration.main([], root);
    assert.equal(report.migrated.length, 1, 'the stacked plan collapsed');
    assert.equal(report.unchanged.length, 1, 'the clean plan reported unchanged');
    assert.equal(report.refused.length, 0);
    assert.equal(leadingBlockCount(fs.readFileSync(stacked, 'utf8')), 1);
    assert.equal(fs.readFileSync(clean, 'utf8'), REAL_BLOCK, 'clean plan untouched');
    cleanup();
  });

  it('with explicit file args, migrates exactly those files', () => {
    const root = mkSandbox();
    const p = path.join(root, 'plans', 'review', 'explicit.md');
    fs.writeFileSync(p, STACKED);
    const report = migration.main([p], root);
    assert.deepEqual(report.migrated, [p]);
    assert.equal(leadingBlockCount(fs.readFileSync(p, 'utf8')), 1);
    cleanup();
  });

  it('reports a hash-swept target in refused[] without touching it', () => {
    const root = mkSandbox();
    const p = path.join(root, 'plans', 'todo', 'queued.md');
    fs.writeFileSync(p, STACKED);
    const report = migration.main([p], root);
    assert.equal(report.migrated.length, 0);
    assert.equal(report.refused.length, 1);
    assert.equal(report.refused[0].file, p);
    assert.equal(fs.readFileSync(p, 'utf8'), STACKED);
    cleanup();
  });
});

// ── FR-4(a) END TO END: two real gate crossings through approvePlan ───────────
describe('approvePlan produces ONE block across two real crossings (FR-4a)', () => {
  const STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
  const sandboxes = [];
  function mkSandbox() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-e2e-merge-'));
    for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
    sandboxes.push(root);
    return root;
  }
  function cleanup() {
    while (sandboxes.length) {
      try { fs.rmSync(sandboxes.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }

  it('after functional→implementation→todo the plan has one block; parseFrontmatter reads title+files', () => {
    const root = mkSandbox();
    const body =
      '---\n' +
      'title: "End to end slice"\n' +
      'type: implementation\n' +
      'depends_on: none\n' +
      'iron_loop: true\n' +
      'files:\n' +
      '  - "src/a.js"\n' +
      '---\n\n' +
      '# End to end slice\n\n' +
      '## Problem Statement\nThe thing is broken.\n\n' +
      '## Acceptance Criteria\n- [ ] the thing works\n';
    const p1 = path.join(root, 'plans', 'functional', 'e2e-slice.md');
    fs.writeFileSync(p1, body);

    const r1 = approvePlan(p1, root);
    assert.ok(!r1.refused, 'first crossing not refused: ' + (r1.reason || ''));
    const implPath = r1.newPath;
    let content = fs.readFileSync(implPath, 'utf8');
    assert.equal(leadingBlockCount(content), 1, 'one block after first crossing');

    const r2 = approvePlan(implPath, root);
    assert.ok(!r2.refused, 'second crossing not refused: ' + (r2.reason || ''));
    const todoPath = r2.newPath;
    content = fs.readFileSync(todoPath, 'utf8');

    // THE FR-4 assertion: the RAW PRIMITIVE reader — not parseMetadata — sees the
    // plan's real fields AND the marker, in exactly one block, after two crossings.
    assert.equal(leadingBlockCount(content), 1, 'still one block after the second crossing');
    const fm = parseFrontmatter(content);
    assert.match(fm.raw, /title: "End to end slice"/, 'title readable by the primitive');
    assert.match(fm.raw, /files:/, 'files: readable by the primitive');
    assert.match(fm.raw, /- "src\/a.js"/, 'the declared file survives');
    assert.match(fm.raw, /approved_by: human/, 'the marker is present');
    assert.match(fm.raw, /gate_crossed: implementation → todo/, 'marker reflects the latest edge');
    cleanup();
  });
});
