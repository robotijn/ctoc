'use strict';

/**
 * four-eyes-coverage.test.js
 *
 * Dark-branch coverage for src/lib/four-eyes.js (segregation-of-duties /
 * two-person integrity at Gate 3). The existing tests/governance-modules-a.test.js
 * exercises every marker / authority / same-identity REFUSE branch through the
 * `{ text }` and `{ path }` call forms. What it never touches:
 *
 *   - the BARE-STRING-PATH overload of verifyFourEyes (lines 164-170), and
 *   - inferProjectRoot (lines 262-272) — the upward filesystem walk that decides
 *     WHICH `.ctoc/roles.yaml` governs a plan when the caller passes no root.
 *
 * inferProjectRoot is governance-load-bearing: if it resolves the wrong project
 * root, four-eyes is evaluated against the wrong (or an empty) role set, which
 * can silently turn a REFUSE into a false PASS or vice-versa. Every test below
 * pins a branch that goes RED under mutation of that decision.
 *
 * Real os.tmpdir() fixtures, real module, fakes only at the fs boundary (none
 * needed — we use the real filesystem). Cleaned in afterEach / finally.
 *
 * Reviewed line-by-line by a human (Tijn) per the AI-generated-tests rule.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const fourEyes = require(path.join(REPO, 'src/lib/four-eyes.js'));

// --- fixtures ---------------------------------------------------------------

function makeTmp() {
  // realpathSync so macOS /var -> /private/var is collapsed and the paths the
  // module computes internally line up with what we assert against.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-4eyes-')));
}

function rmTmp(dir) {
  if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

// A plan file with frontmatter markers. Any marker set to undefined is omitted.
function planText({ author, independent } = {}) {
  const lines = ['---', 'title: Test Plan'];
  if (author !== undefined) lines.push(`approved_by_author_review: ${author}`);
  if (independent !== undefined) lines.push(`approved_by_independent: ${independent}`);
  lines.push('---', '', '# Body', '');
  return lines.join('\n');
}

// roles.yaml builder. Each role: { name, identity?, can_review?, can_approve? }.
// identity is OMITTED when the key is absent, and emitted literally (e.g. '~')
// when provided — so we can exercise the null/undefined identity branches.
function rolesYaml(roles) {
  const lines = ['roles:'];
  for (const r of roles) {
    lines.push(`  - name: ${r.name}`);
    if ('identity' in r) lines.push(`    identity: ${r.identity}`);
    if (r.can_review !== undefined) lines.push(`    can_review: ${r.can_review}`);
    if (r.can_approve !== undefined) lines.push(`    can_approve: ${r.can_approve}`);
  }
  lines.push('');
  return lines.join('\n');
}

const TWO_DISTINCT_ROLES = [
  { name: 'rev', identity: 'alice', can_review: true, can_approve: false },
  { name: 'app', identity: 'bob', can_review: false, can_approve: true },
];

// ===========================================================================
describe('four-eyes.js — bare-string-path overload + inferProjectRoot (dark branches)', () => {
  let root;
  beforeEach(() => { root = makeTmp(); });
  afterEach(() => { rmTmp(root); });

  // -------------------------------------------------------------------------
  // Cluster 1 — the string-path overload (lines 164-170).
  // These branches only fire when the caller passes a BARE STRING, not an
  // object. governance-modules-a only ever uses { text } / { path }.
  // -------------------------------------------------------------------------

  it('bare_string_path_to_missing_file_refuses_with_plan_not_found', () => {
    // Arrange — a path string that does not exist on disk.
    const missing = path.join(root, 'no-such-plan.md');

    // Act
    let res;
    assert.doesNotThrow(() => { res = fourEyes.verifyFourEyes(missing); });

    // Assert — kills a mutant that drops the existsSync guard (line 166): without
    // it, readFileSync throws instead of returning a structured REFUSE.
    assert.equal(res.passed, false);
    assert.match(res.reason, /Plan not found/);
    assert.equal(res.author, null);
    assert.equal(res.independent, null);
  });

  it('bare_string_path_with_explicit_root_runs_full_governance_and_passes', () => {
    // Arrange — string form WITH an explicit root: line 170's `if (!root)` is
    // FALSE, so inferProjectRoot must NOT be consulted; governance uses `root`.
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml(TWO_DISTINCT_ROLES));
    const p = writeFile(root, path.join('plans', 'review', 'p.md'),
      planText({ author: 'rev', independent: 'app' }));

    // Act — plan is a bare STRING (exercises the typeof === 'string' overload).
    const res = fourEyes.verifyFourEyes(p, root);

    // Assert — two distinct identities with proper authority cross the gate.
    // Kills a mutant that skips readFileSync (line 169): without the real plan
    // text the markers vanish and this flips to a "missing markers" REFUSE.
    assert.equal(res.passed, true, res.reason);
    assert.equal(res.author, 'rev');
    assert.equal(res.independent, 'app');
  });

  // -------------------------------------------------------------------------
  // Cluster 2 — inferProjectRoot SUCCESS: the upward walk locates the nearest
  // ancestor containing `.ctoc/` (lines 263-266, 269-270). Reached only when a
  // plan is supplied WITHOUT a root. The located root decides which roles.yaml
  // governs — so a broken walk is a governance bypass.
  // -------------------------------------------------------------------------

  it('string_path_without_root_walks_up_to_ctoc_and_governs_by_that_roles_file', () => {
    // Arrange — roles + plan nested TWO directories below the .ctoc root, so the
    // walk must iterate (review -> plans -> root) before finding .ctoc.
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml(TWO_DISTINCT_ROLES));
    const p = writeFile(root, path.join('plans', 'review', 'deep.md'),
      planText({ author: 'rev', independent: 'app' }));

    // Act — bare string, NO root: line 170 true -> inferProjectRoot(p).
    const res = fourEyes.verifyFourEyes(p);

    // Assert — PASS is only possible if the walk resolved `root` (and thus its
    // roles.yaml). A mutant returning process.cwd() (the ctoc repo) resolves to
    // roles that lack 'rev'/'app' -> "not declared" REFUSE; a mutant returning
    // the plan's own dir finds no roles.yaml -> "No roles declared" REFUSE.
    assert.equal(res.passed, true, res.reason);
    assert.match(res.reason, /Four-eyes satisfied/);
  });

  it('object_path_form_without_root_infers_root_and_still_refuses_self_approval', () => {
    // Arrange — two distinct role NAMES that map to the SAME identity (alice):
    // the classic self-approval attempt. roles.yaml lives at the inferred root.
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml([
      { name: 'rev', identity: 'alice', can_review: true },
      { name: 'app', identity: 'alice', can_approve: true },
    ]));
    const p = writeFile(root, path.join('plans', 'review', 'self.md'),
      planText({ author: 'rev', independent: 'app' }));

    // Act — object { path } form, NO root, NO projectRoot: exercises line 180's
    // `plan.projectRoot || inferProjectRoot(plan.path)` third operand (a DIFFERENT
    // call site than the bare-string overload above).
    const res = fourEyes.verifyFourEyes({ path: p });

    // Assert — the self-approval is caught, which proves inferProjectRoot located
    // the CORRECT roles.yaml. A mutant that drops inferProjectRoot leaves root
    // undefined -> loadRoles(path.join(undefined,...)) throws; a mutant resolving
    // the wrong root loses the alice==alice collision -> the REFUSE reason changes.
    assert.equal(res.passed, false);
    assert.match(res.reason, /same identity|Four-eyes violation|distinct principals/i);
  });

  // -------------------------------------------------------------------------
  // Cluster 3 — inferProjectRoot FALL-THROUGH to process.cwd() (line 271).
  // When no ancestor holds a `.ctoc/`, the walk exhausts and returns cwd. We
  // pin cwd to a controlled temp dir with NO declared roles so the outcome is
  // deterministic and independent of the repo's own .ctoc/roles.yaml.
  // -------------------------------------------------------------------------

  it('plan_with_no_ctoc_ancestor_falls_back_to_cwd_and_cannot_satisfy_four_eyes', () => {
    // Arrange — a cwd with no roles, and a plan under a SEPARATE tmp tree that
    // has no .ctoc anywhere up to the filesystem root.
    const noRolesCwd = makeTmp();
    const planOnlyDir = makeTmp();
    const p = writeFile(planOnlyDir, 'orphan.md',
      planText({ author: 'rev', independent: 'app' }));
    const originalCwd = process.cwd();

    try {
      // Act — chdir so the fall-through target (process.cwd()) is deterministic.
      process.chdir(noRolesCwd);
      const res = fourEyes.verifyFourEyes(p); // bare string, no root -> walk -> cwd

      // Assert — markers are present, so the walk MUST have fallen through to cwd
      // (line 271) and loadRoles found nothing -> "No roles declared" REFUSE.
      // A mutant returning any dir other than cwd would not deterministically hit
      // an empty role set; a mutant that skips line 271 leaves the walk returning
      // undefined -> throw. Governance: no declared principals => cannot pass.
      assert.equal(res.passed, false);
      assert.match(res.reason, /No roles declared/i);
    } finally {
      process.chdir(originalCwd);
      rmTmp(noRolesCwd);
      rmTmp(planOnlyDir);
    }
  });

  // -------------------------------------------------------------------------
  // Cluster 4 — the distinctness guard's presence operands (line 239):
  //   authorRole.identity && independentRole.identity && a === b
  // governance-modules-a always assigns identities, so the SECOND/THIRD operands
  // are only ever evaluated truthy. Here we drive them FALSE: roles whose
  // identity is null (YAML `~`) are treated as DISTINCT and the plan PASSES.
  // This documents the coded contract and kills the mutant that removes the
  // presence guards (null === null would then spuriously REFUSE).
  // -------------------------------------------------------------------------

  it('roles_with_null_identity_bypass_distinctness_guard_and_pass', () => {
    // Arrange — two distinct role names, both with an explicit null identity
    // (`~` -> coerceScalar returns null), proper split authority.
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml([
      { name: 'rev', identity: '~', can_review: true },
      { name: 'app', identity: '~', can_approve: true },
    ]));

    // Act
    const res = fourEyes.verifyFourEyes(
      { text: planText({ author: 'rev', independent: 'app' }), projectRoot: root });

    // Assert — PASS: the `authorRole.identity && ...` presence guards short-circuit
    // FALSE, so the `a === b` comparison never runs. A mutant that deletes the
    // presence guards evaluates `null === null` -> true -> Four-eyes-violation
    // REFUSE, turning this test RED.
    assert.equal(res.passed, true, res.reason);
    assert.equal(res.author, 'rev');
    assert.equal(res.independent, 'app');
  });
});
