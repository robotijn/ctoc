/**
 * Global sequential numbering for CTOC implementation plans.
 *
 * Convention: implementation plans carry a single global zero-padded 5-digit
 * filename prefix — "00001-...", "00002-...", "00003-..." — giving ONE global
 * order across every implementation plan (not a per-parent count).
 *
 * These tests run on real temporary-directory fixtures (no test doubles): each
 * builds a `plans/implementation` folder with plans carrying real `parent_plan`
 * and `depends_on` links, then exercises the numbering helpers against disk.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, describe, beforeEach, afterEach } = require('node:test');

const {
  nextImplementationPlanNumber,
  renumberImplementationPlans
} = require('../src/lib/plan-numbering');

// ── fixture helpers ─────────────────────────────────────────────────────────

/** Create a plan file `<slug>.md` in the given stage dir with real frontmatter. */
function writePlan(root, stage, slug, { title, parent_plan, depends_on } = {}) {
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  const lines = ['---'];
  lines.push(`title: "${title || slug}"`);
  lines.push('type: feature');
  if (parent_plan !== undefined) lines.push(`parent_plan: "${parent_plan}"`);
  lines.push(`depends_on: ${depends_on === undefined ? 'none' : depends_on}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${slug}`);
  lines.push('');
  lines.push('body text');
  fs.writeFileSync(path.join(dir, `${slug}.md`), lines.join('\n') + '\n', 'utf8');
}

/** Read the merged frontmatter value for a key from a plan file (inline scalar). */
function readField(filePath, key) {
  const content = fs.readFileSync(filePath, 'utf8');
  const m = content.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'm'));
  if (!m) return undefined;
  return m[1].replace(/^["']|["']$/g, '').trim();
}

function implFiles(root) {
  const dir = path.join(root, 'plans', 'implementation');
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
}

// ── next-number helper ──────────────────────────────────────────────────────

describe('nextImplementationPlanNumber', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-numbering-'));
    fs.mkdirSync(path.join(root, 'plans', 'implementation'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('returns "00001" when no implementation plans exist', () => {
    assert.strictEqual(nextImplementationPlanNumber(root), '00001');
  });

  test('returns "00001" when the implementation directory is absent', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-numbering-bare-'));
    try {
      assert.strictEqual(nextImplementationPlanNumber(bare), '00001');
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });

  test('ignores unnumbered plans and returns "00001"', () => {
    writePlan(root, 'implementation', 'make-the-block-actually-stop');
    writePlan(root, 'implementation', 'fix-the-install-path');
    assert.strictEqual(nextImplementationPlanNumber(root), '00001');
  });

  test('increments from the highest existing number', () => {
    writePlan(root, 'implementation', '00001-make-the-block-actually-stop');
    writePlan(root, 'implementation', '00002-fix-the-install-path');
    assert.strictEqual(nextImplementationPlanNumber(root), '00003');
  });

  test('crosses the ten-to-eleven boundary', () => {
    writePlan(root, 'implementation', '00009-nine');
    writePlan(root, 'implementation', '00010-ten');
    assert.strictEqual(nextImplementationPlanNumber(root), '00011');
  });

  test('crosses the ninety-nine-to-one-hundred boundary', () => {
    writePlan(root, 'implementation', '00098-ninety-eight');
    writePlan(root, 'implementation', '00099-ninety-nine');
    assert.strictEqual(nextImplementationPlanNumber(root), '00100');
  });

  test('uses the max, not the count, of existing numbers', () => {
    writePlan(root, 'implementation', '00003-three');
    writePlan(root, 'implementation', '00007-seven');
    assert.strictEqual(nextImplementationPlanNumber(root), '00008');
  });
});

// ── renumber ────────────────────────────────────────────────────────────────

describe('renumberImplementationPlans', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-renumber-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('assigns sequential prefixes, renames files, and keeps every link resolving', () => {
    // A parent index plus a dependency chain of three slices, plus a second
    // independent parent+slice — all real parent_plan / depends_on links.
    writePlan(root, 'implementation', 'alpha-parent', { depends_on: 'none' });
    writePlan(root, 'implementation', 'alpha-s1', { parent_plan: 'alpha-parent', depends_on: 'none' });
    writePlan(root, 'implementation', 'alpha-s2', { parent_plan: 'alpha-parent', depends_on: 'alpha-s1' });
    writePlan(root, 'implementation', 'alpha-s3', { parent_plan: 'alpha-parent', depends_on: 'alpha-s2' });
    writePlan(root, 'implementation', 'beta-parent', { depends_on: 'none' });
    writePlan(root, 'implementation', 'beta-s1', { parent_plan: 'beta-parent', depends_on: 'none' });

    const mapping = renumberImplementationPlans(root);

    // Every plan was lacking a prefix, so all six are in the mapping.
    assert.strictEqual(Object.keys(mapping).length, 6);
    for (const [oldSlug, newSlug] of Object.entries(mapping)) {
      assert.match(newSlug, /^\d{5}-/, `new name ${newSlug} must carry a 5-digit prefix`);
      assert.strictEqual(newSlug.replace(/^\d{5}-/, ''), oldSlug, 'suffix preserved');
    }

    // Files on disk are exactly the six new names, sequential 00001..00006, no gaps.
    const onDisk = implFiles(root);
    assert.strictEqual(onDisk.length, 6);
    const nums = onDisk.map(f => parseInt(f.slice(0, 5), 10)).sort((a, b) => a - b);
    assert.deepStrictEqual(nums, [1, 2, 3, 4, 5, 6]);

    // Old files are gone.
    for (const oldSlug of Object.keys(mapping)) {
      assert.strictEqual(
        fs.existsSync(path.join(root, 'plans', 'implementation', `${oldSlug}.md`)),
        false,
        `old file ${oldSlug}.md must be renamed away`
      );
    }

    // Number of each new file, keyed by original slug.
    const numFor = {};
    for (const [oldSlug, newSlug] of Object.entries(mapping)) {
      numFor[oldSlug] = parseInt(newSlug.slice(0, 5), 10);
    }

    // Dependency order invariant: a dependency gets a strictly lower number
    // than its dependent (alpha-s1 < alpha-s2 < alpha-s3).
    assert.ok(numFor['alpha-s1'] < numFor['alpha-s2']);
    assert.ok(numFor['alpha-s2'] < numFor['alpha-s3']);

    // Every parent_plan and depends_on reference still resolves to a file on disk.
    const existing = new Set(onDisk.map(f => f.replace(/\.md$/, '')));
    for (const newSlug of Object.values(mapping)) {
      const p = path.join(root, 'plans', 'implementation', `${newSlug}.md`);

      const parent = readField(p, 'parent_plan');
      if (parent !== undefined) {
        assert.ok(
          existing.has(parent),
          `parent_plan "${parent}" in ${newSlug} must resolve to a file on disk`
        );
      }

      const deps = readField(p, 'depends_on');
      if (deps !== undefined && deps.toLowerCase() !== 'none') {
        for (const dep of deps.split(',').map(s => s.trim()).filter(Boolean)) {
          assert.ok(
            existing.has(dep),
            `depends_on "${dep}" in ${newSlug} must resolve to a file on disk`
          );
        }
      }
    }

    // The renamed children point at the renamed parent (link rewritten, not dangling).
    const s1New = mapping['alpha-s1'];
    assert.strictEqual(
      readField(path.join(root, 'plans', 'implementation', `${s1New}.md`), 'parent_plan'),
      mapping['alpha-parent']
    );
    const s2New = mapping['alpha-s2'];
    assert.strictEqual(
      readField(path.join(root, 'plans', 'implementation', `${s2New}.md`), 'depends_on'),
      mapping['alpha-s1']
    );

    // After renumber, the next global number continues the sequence.
    assert.strictEqual(nextImplementationPlanNumber(root), '00007');
  });

  test('does not renumber plans that already carry a prefix, and avoids number collisions', () => {
    writePlan(root, 'implementation', '00002-already-numbered', { depends_on: 'none' });
    writePlan(root, 'implementation', 'needs-a-number', { depends_on: '00002-already-numbered' });

    const mapping = renumberImplementationPlans(root);

    // Only the unnumbered plan is renamed.
    assert.strictEqual(Object.keys(mapping).length, 1);
    assert.ok(mapping['needs-a-number']);
    // It must NOT reuse 00002 (already taken); first free number is 00001.
    assert.strictEqual(mapping['needs-a-number'], '00001-needs-a-number');

    // The pre-numbered plan keeps its name.
    assert.ok(fs.existsSync(path.join(root, 'plans', 'implementation', '00002-already-numbered.md')));

    // Its depends_on referenced an already-numbered plan → unchanged and resolves.
    const newPath = path.join(root, 'plans', 'implementation', `${mapping['needs-a-number']}.md`);
    assert.strictEqual(readField(newPath, 'depends_on'), '00002-already-numbered');
  });

  test('rewrites references that live in a DIFFERENT stage so no link dangles', () => {
    // A todo-stage plan depends on an implementation plan that gets renamed.
    writePlan(root, 'implementation', 'core-lib', { depends_on: 'none' });
    writePlan(root, 'todo', 'downstream', { parent_plan: 'core-lib', depends_on: 'core-lib' });

    const mapping = renumberImplementationPlans(root);
    assert.ok(mapping['core-lib']);

    const todoPath = path.join(root, 'plans', 'todo', 'downstream.md');
    assert.strictEqual(readField(todoPath, 'parent_plan'), mapping['core-lib']);
    assert.strictEqual(readField(todoPath, 'depends_on'), mapping['core-lib']);
  });

  test('returns an empty mapping when there are no implementation plans', () => {
    fs.mkdirSync(path.join(root, 'plans', 'implementation'), { recursive: true });
    assert.deepStrictEqual(renumberImplementationPlans(root), {});
  });
});
