/**
 * Dark-branch coverage for src/lib/plan-numbering.js.
 *
 * The sibling suite tests/plan-numbering.test.js drives the happy paths of the
 * two public entry points. This suite targets the NON-OBVIOUS branches the
 * sibling leaves dark — every test pins a branch that goes RED when the
 * numbering, padding, slug-remap, topo-order, or collision logic is mutated:
 *
 *   - topoOrder's cycle fallback (lines 141-144, the only dark lines),
 *     out-of-set edge skip, and the multi-indegree "not yet zero" branch.
 *   - remapReferences quoting variants (quoted/unquoted, none/NONE passthrough,
 *     unmapped-slug passthrough) and the comma-separated multi-token remap.
 *   - highestImplementationNumber's non-.md skip and the pad-width crossing at
 *     99999 -> 100000 (six digits).
 *   - renumberImplementationPlans' absent-directory return, the all-prefixed
 *     early-out (map.size === 0), and mid-assignment collision skipping.
 *
 * Real os.tmpdir() fixtures, no test doubles; the real module is loaded. Every
 * fixture root is removed in a finally/after.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { test, describe, beforeEach, afterEach } = require('node:test');

const {
  nextImplementationPlanNumber,
  renumberImplementationPlans,
  highestImplementationNumber,
  topoOrder,
  remapReferences
} = require('../src/lib/plan-numbering');

// ── fixture helpers ─────────────────────────────────────────────────────────

/** Write a raw plan file with exact content — lets a test control quoting/prefix. */
function writeRaw(root, stage, filename, body) {
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), body, 'utf8');
}

function implFilenames(root) {
  const dir = path.join(root, 'plans', 'implementation');
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
}

// ── topoOrder: exported, pure — the dark ordering branches ───────────────────

describe('topoOrder dark branches', () => {
  test('appends every node in input order when the graph has a cycle', () => {
    // Arrange — a two-node cycle: neither node can ever reach indegree 0.
    const plans = [
      { slug: 'a', dependsOn: ['b'] },
      { slug: 'b', dependsOn: ['a'] }
    ];

    // Act
    const ordered = topoOrder(plans);

    // Assert — the fallback (lines 141-144) must emit BOTH nodes, in input
    // order. Remove the fallback and ordered is empty → length assertion reds.
    assert.deepStrictEqual(ordered.map(p => p.slug), ['a', 'b']);
  });

  test('ignores a depends_on edge that names a slug outside the set', () => {
    // Arrange — the only edge points at a slug that is not among the plans.
    const plans = [{ slug: 'lonely', dependsOn: ['does-not-exist'] }];

    // Act
    const ordered = topoOrder(plans);

    // Assert — the out-of-set edge is skipped, so 'lonely' keeps indegree 0 and
    // is emitted. Drop the `if (!bySlug.has(dep)) continue` guard and 'lonely'
    // gets indegree 1, never enters the queue → ordered would be empty.
    assert.deepStrictEqual(ordered.map(p => p.slug), ['lonely']);
  });

  test('holds a two-dependency node until BOTH dependencies are emitted', () => {
    // Arrange — diamond: d depends on b and c, both depend on a. d has
    // indegree 2, so the first decrement must NOT enqueue it.
    const plans = [
      { slug: 'a', dependsOn: [] },
      { slug: 'b', dependsOn: ['a'] },
      { slug: 'c', dependsOn: ['a'] },
      { slug: 'd', dependsOn: ['b', 'c'] }
    ];

    // Act
    const order = topoOrder(plans).map(p => p.slug);

    // Assert — a first, d last, and d strictly after both b and c. The
    // `if (indeg.get(child) === 0)` false branch (d still at 1 after b) is the
    // subject: mutate it to always-enqueue and d lands too early / duplicated.
    assert.strictEqual(order[0], 'a');
    assert.strictEqual(order[order.length - 1], 'd');
    assert.ok(order.indexOf('d') > order.indexOf('b'));
    assert.ok(order.indexOf('d') > order.indexOf('c'));
  });
});

// ── remapReferences: exported, pure — the quoting / token branches ───────────

describe('remapReferences dark branches', () => {
  test('remaps an UNQUOTED parent_plan scalar and preserves the unquoted form', () => {
    // Arrange
    const content = 'parent_plan: old-core\n';
    const map = new Map([['old-core', '00007-old-core']]);

    // Act
    const out = remapReferences(content, map);

    // Assert — unquoted branch of remapScalar. No quotes added.
    assert.strictEqual(out, 'parent_plan: 00007-old-core\n');
  });

  test('remaps a QUOTED parent_plan scalar and preserves the surrounding quotes', () => {
    // Arrange
    const content = 'parent_plan: "old-core"\n';
    const map = new Map([['old-core', '00007-old-core']]);

    // Act
    const out = remapReferences(content, map);

    // Assert — quoted branch; the double quotes must survive.
    assert.strictEqual(out, 'parent_plan: "00007-old-core"\n');
  });

  test('leaves parent_plan untouched when its value is none (case-insensitive)', () => {
    // Arrange — even though the map is non-empty, `none`/`NONE` short-circuit.
    const content = 'parent_plan: NONE\n';
    const map = new Map([['NONE', 'should-not-be-used']]);

    // Act
    const out = remapReferences(content, map);

    // Assert — the `inner.toLowerCase() === 'none'` return-raw branch. Mutate
    // the guard and 'NONE' gets remapped via the map, breaking this.
    assert.strictEqual(out, 'parent_plan: NONE\n');
  });

  test('leaves a parent_plan slug that is absent from the map unchanged', () => {
    // Arrange — the map renames a different slug entirely.
    const content = 'parent_plan: keep-me\n';
    const map = new Map([['someone-else', '00001-someone-else']]);

    // Act
    const out = remapReferences(content, map);

    // Assert — the `map.has(inner) ? ... : inner` else branch.
    assert.strictEqual(out, 'parent_plan: keep-me\n');
  });

  test('remaps only the mapped tokens of a QUOTED comma-separated depends_on list', () => {
    // Arrange — three deps; only the first and last are renamed.
    const content = 'depends_on: "a, b, c"\n';
    const map = new Map([['a', '00001-a'], ['c', '00003-c']]);

    // Act
    const out = remapReferences(content, map);

    // Assert — remapList quoted branch + per-token map.has(true/false) +
    // ', ' join. Mutate the separator, the partial map, or the quote handling
    // and this exact string diverges.
    assert.strictEqual(out, 'depends_on: "00001-a, b, 00003-c"\n');
  });

  test('remaps an UNQUOTED comma-separated depends_on list and normalises spacing', () => {
    // Arrange — no surrounding quotes, no space after the comma.
    const content = 'depends_on: a,b\n';
    const map = new Map([['a', '00001-a']]);

    // Act
    const out = remapReferences(content, map);

    // Assert — unquoted list branch; join re-inserts ', ' between tokens.
    assert.strictEqual(out, 'depends_on: 00001-a, b\n');
  });

  test('leaves depends_on untouched when the value is none', () => {
    // Arrange
    const content = 'depends_on: none\n';
    const map = new Map([['none', 'should-not-be-used']]);

    // Act
    const out = remapReferences(content, map);

    // Assert — remapList none/empty passthrough branch.
    assert.strictEqual(out, 'depends_on: none\n');
  });
});

// ── highestImplementationNumber / next: exported — skip + pad-width branches ──

describe('highestImplementationNumber and next-number boundaries', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-numbering-dark-'));
    fs.mkdirSync(path.join(root, 'plans', 'implementation'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('ignores a non-.md file even when it carries a higher numeric prefix', () => {
    // Arrange — a stray file with a 99999 prefix but a .txt extension must be
    // skipped BEFORE its prefix is read.
    writeRaw(root, 'implementation', '00005-real.md', '# real\n');
    writeRaw(root, 'implementation', '99999-not-a-plan.txt', 'noise\n');

    // Act
    const highest = highestImplementationNumber(root);
    const next = nextImplementationPlanNumber(root);

    // Assert — the `.endsWith('.md')` skip is load-bearing: drop it and the
    // 99999 prefix wins, making highest 99999 and next '100000'.
    assert.strictEqual(highest, 5);
    assert.strictEqual(next, '00006');
  });

  test('crosses the five-to-six digit pad boundary at 99999 -> 100000', () => {
    // Arrange — the highest existing number is the last five-digit value.
    writeRaw(root, 'implementation', '99999-max.md', '# max\n');

    // Act
    const next = nextImplementationPlanNumber(root);

    // Assert — padStart(5) does not truncate; the number simply grows to six
    // digits. Mutate the pad width or the +1 and this reds.
    assert.strictEqual(next, '100000');
  });
});

// ── renumberImplementationPlans: the early-out and collision branches ────────

describe('renumberImplementationPlans dark branches', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-renumber-dark-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('returns an empty mapping when the implementation directory is absent', () => {
    // Arrange — a plans/ tree exists but has no implementation stage at all.
    fs.mkdirSync(path.join(root, 'plans', 'todo'), { recursive: true });

    // Act
    const mapping = renumberImplementationPlans(root);

    // Assert — the `!existsSync(implDir)` early return (distinct from the
    // present-but-empty case the sibling suite covers).
    assert.deepStrictEqual(mapping, {});
  });

  test('renames nothing and returns an empty mapping when every plan is already prefixed', () => {
    // Arrange — both plans already carry a five-digit prefix.
    writeRaw(root, 'implementation', '00001-alpha.md', '---\ndepends_on: none\n---\n');
    writeRaw(root, 'implementation', '00002-beta.md', '---\ndepends_on: none\n---\n');

    // Act
    const mapping = renumberImplementationPlans(root);

    // Assert — the `if (map.size === 0) return mapping` early-out: nothing is
    // added to the map, so the mapping is empty and the files are untouched.
    assert.deepStrictEqual(mapping, {});
    assert.deepStrictEqual(implFilenames(root), ['00001-alpha.md', '00002-beta.md']);
  });

  test('skips a number already claimed by a prefixed plan when assigning across a gap', () => {
    // Arrange — 00002 is taken; two unnumbered plans must receive 00001 and
    // 00003 (the assigner must step OVER 00002 mid-run). Slugs chosen so the
    // creation-order tiebreak (slug.localeCompare) is deterministic: aaa < zzz.
    writeRaw(root, 'implementation', '00002-mid.md', '---\ndepends_on: none\n---\n');
    writeRaw(root, 'implementation', 'aaa.md', '---\ndepends_on: none\n---\n');
    writeRaw(root, 'implementation', 'zzz.md', '---\ndepends_on: none\n---\n');

    // Act
    const mapping = renumberImplementationPlans(root);

    // Assert — the `while (used.has(n)) n++` skip is the subject. 'aaa' gets
    // 00001; then n hits 2 (used) and must advance to 3 for 'zzz'.
    assert.strictEqual(mapping['aaa'], '00001-aaa');
    assert.strictEqual(mapping['zzz'], '00003-zzz');
    assert.strictEqual(Object.keys(mapping).length, 2);
    // The pre-numbered plan is left alone.
    assert.ok(fs.existsSync(path.join(root, 'plans', 'implementation', '00002-mid.md')));
  });
});
