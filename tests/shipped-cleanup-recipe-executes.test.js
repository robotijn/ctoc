'use strict';

// 00185 — the SHIPPED stale-plan cleanup recipe must actually execute.
//
// The defect this slice repairs: `src/commands/start.md`'s `claude:cleanup-exec`
// row shipped a `node -e` recipe that called `executeCleanup(process.cwd(),
// '<category-or-plan>', '<action>')` — the project root where a PROPOSAL OBJECT
// belongs, a slug where the ROOT belongs, the action where DEPS belong. The real
// signature is `executeCleanup(proposal, root, deps = {})`. Every human-approved
// cleanup therefore fell to the fail-closed no-op branch and returned
// `{"action":"noop","skipped":true}` while the plan sat unmoved — a subsystem
// whose whole purpose is telling the truth about plan state lying at the one
// point where it acts.
//
// LOAD-BEARING TEST CONTRACT (Decision 4 in the plan): this test PARSES the recipe
// out of `start.md` and EXECUTES it in a child process. It must never hold a copy
// of the recipe. A copy is exactly the failure mode that kept
// `tests/stale-cleanup-human-gate.test.js` green over a recipe that could not run:
// that suite defines its OWN correct mapping and tests the library against it, so
// it can never detect that the SHIPPED instruction differs. This test reads the
// shipped bytes and runs them.
//
// Cases 2, 3 and 6 are RED against the unmodified `start.md` (the broken recipe);
// case 4 (the old broken argument order, called directly) is GREEN before and
// after the fix — it is the regression guard that records what the defect did.

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const START_MD_PATH = path.join(REPO_ROOT, 'src', 'commands', 'start.md');

// Direct library import — used ONLY by case 4 (the old broken form, proven broken
// in-process) and never to substitute for the recipe under test.
const cleanup = require('../src/lib/stale-cleanup.js');

// ---------------------------------------------------------------------------
// Recipe extraction — the whole point. Read the shipped row; pull the node -e
// programs out of it. NEVER restate them here.
// ---------------------------------------------------------------------------

// Every `node -e "..."` program on the cleanup-exec recipe row(s). The programs
// use single quotes internally, so the double-quoted -e argument is captured by a
// non-greedy `[^"]*`.
function extractCleanupPrograms() {
  const md = fs.readFileSync(START_MD_PATH, 'utf8');
  const rows = md
    .split('\n')
    .filter((l) => l.includes('cleanup-exec') && l.includes('node -e'));
  const joined = rows.join('\n');
  const progs = [...joined.matchAll(/node -e "([^"]*)"/g)].map((m) => m[1]);
  return progs;
}

// The per-plan program: calls executeCleanup, is NOT the category batch, and is NOT
// the delete-override form (which hard-codes explicitlyRejected). This is the normal
// per-plan recipe — the one a `archive-to-done` / `revert` / `advance-via-reconciliation`
// action flows through, and the one case 8 drives with `delete` to prove the guard.
function perPlanProgram() {
  const progs = extractCleanupPrograms();
  return progs.find(
    (p) =>
      p.includes('executeCleanup') &&
      !p.includes('_buildCleanupItems') &&
      !p.includes('explicitlyRejected')
  );
}

// The category batch program: derives the category's members via _buildCleanupItems
// and executes each as its own single-plan proposal (the executor-side loop SP4
// specified — never a category branch inside the library).
function categoryProgram() {
  const progs = extractCleanupPrograms();
  return progs.find((p) => p.includes('_buildCleanupItems'));
}

// Materialize {{CTOC_ROOT}} to the real repo (so the child's require resolves) and
// substitute the shipped recipe's literal placeholders. Substituting the placeholders
// is what lets the SAME runner execute the OLD interpolation form (`'<category-or-plan>'`,
// `'<action>'`) and observe it fail — the new form has no placeholders and reads argv.
function materialize(prog, { slug = '', action = '', category = '' } = {}) {
  return prog
    .replace(/\{\{CTOC_ROOT\}\}/g, REPO_ROOT)
    .replace(/<category-or-plan>/g, slug || category)
    .replace(/<slug>/g, slug)
    .replace(/<category>/g, category)
    .replace(/<action>/g, action);
}

// Run the per-plan recipe. Slug + action are passed BOTH as substituted literals
// (old form) AND as process.argv (new form), so whichever the shipped recipe uses
// is exercised. cwd IS the fixture root, exactly as the session model runs it.
function runPerPlan(prog, slug, action, cwd) {
  const p = materialize(prog, { slug, action });
  return spawnSync(process.execPath, ['-e', p, slug, action], { cwd, encoding: 'utf8' });
}

// Run the category batch recipe with the category as process.argv[1].
function runCategory(prog, category, cwd) {
  const p = materialize(prog, { category });
  return spawnSync(process.execPath, ['-e', p, category], { cwd, encoding: 'utf8' });
}

// ---------------------------------------------------------------------------
// Fixtures — os.tmpdir(), path.join throughout, torn down per test.
// ---------------------------------------------------------------------------

const fixtures = [];

function makeFixture({ git = false } = {}) {
  const root = path.join(
    os.tmpdir(),
    'ctoc-00185-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  );
  fs.mkdirSync(path.join(root, 'plans'), { recursive: true });
  fixtures.push(root);
  if (git) {
    // A real (commit-less) git repo makes verifyStaleCandidate report
    // gitAvailable:true so classifyStaleCandidate reaches a real category. No
    // commits ⇒ no slug-match, no stage-entry epoch ⇒ deterministic dead-on-arrival
    // for a review-stage plan with missing files. This is the sanctioned
    // deterministic route across the spawnSync boundary (plan lines 184-188).
    execFileSync('git', ['init', '-q', root], { stdio: 'ignore' });
  }
  return root;
}

// Seed plans/<stage>/<slug>.md declaring one missing file → a `missing-files`
// signal → a cheap stale candidate. No git needed for the cheap scan.
function seedPlan(root, stage, slug, { missing = true, approved = false } = {}) {
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  const declared = missing ? 'src/does-not-exist-' + slug + '.js' : 'CLAUDE.md';
  let fm = '---\n' + 'title: "' + slug + '"\n' + 'files: ["' + declared + '"]\n';
  if (approved) fm += 'approved_by: human\n';
  fm += 'status: refined\n---\n\n# ' + slug + '\n';
  const p = path.join(dir, slug + '.md');
  fs.writeFileSync(p, fm);
  return p;
}

const exists = (p) => fs.existsSync(p);
const planPath = (root, stage, slug) => path.join(root, 'plans', stage, slug + '.md');

// Every plan file anywhere under plans/ (used to assert NOTHING moved on a no-op).
function allPlanFiles(root) {
  const out = [];
  const plansDir = path.join(root, 'plans');
  if (!exists(plansDir)) return out;
  for (const stage of fs.readdirSync(plansDir)) {
    const sd = path.join(plansDir, stage);
    if (!fs.statSync(sd).isDirectory()) continue;
    for (const f of fs.readdirSync(sd)) if (f.endsWith('.md')) out.push(stage + '/' + f);
  }
  return out.sort();
}

afterEach(() => {
  while (fixtures.length) {
    const dir = fixtures.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------

describe('00185 — the shipped cleanup recipe actually executes', () => {
  let perPlan;
  let category;

  before(() => {
    perPlan = perPlanProgram();
    category = categoryProgram();
  });

  // Case 1
  it('the per-plan recipe is extractable from start.md', () => {
    assert.ok(
      perPlan,
      'the claude:cleanup-exec row must yield a node -e program calling executeCleanup ' +
        '(none found — the recipe row is missing or malformed)'
    );
    assert.match(perPlan, /executeCleanup/);
  });

  // Case 2 — RED against the unmodified (broken) recipe.
  it('the per-plan recipe actually MOVES a plan (archive-to-done → done/)', () => {
    assert.ok(perPlan, 'per-plan recipe not extractable');
    const root = makeFixture();
    seedPlan(root, 'review', 'shipped-early-1');
    const res = runPerPlan(perPlan, 'shipped-early-1', 'archive-to-done', root);
    assert.equal(res.status, 0, 'recipe exited non-zero: ' + res.stderr);
    assert.ok(
      exists(planPath(root, 'done', 'shipped-early-1')),
      'plan was NOT moved to plans/done/ — the shipped recipe silently no-op\'d ' +
        '(stdout: ' + res.stdout + ')'
    );
    assert.ok(
      !exists(planPath(root, 'review', 'shipped-early-1')),
      'plan still sits in plans/review/ after a cleanup the human approved'
    );
  });

  // Case 3 — RED against the unmodified recipe. This is the defect measured on the
  // shipped text: the successful-archive shape, NOT {action:'noop',skipped:true}.
  it('the per-plan result is a real archive, not a silent no-op', () => {
    assert.ok(perPlan, 'per-plan recipe not extractable');
    const root = makeFixture();
    seedPlan(root, 'review', 'shipped-early-2');
    const res = runPerPlan(perPlan, 'shipped-early-2', 'archive-to-done', root);
    let out;
    try {
      out = JSON.parse(res.stdout);
    } catch (e) {
      assert.fail('recipe stdout was not JSON: ' + JSON.stringify(res.stdout) + ' / stderr: ' + res.stderr);
    }
    // The archive primitive returns { from, to:'done', path, reason:'stale-reconciliation' }
    // with NO `action` field — asserting `action:'archive-to-done'` would test a
    // contract the library does not have (archive-to-done is the PROPOSED and LOGGED
    // action, never a return field).
    assert.equal(out.to, 'done', 'expected to:done; got ' + JSON.stringify(out));
    assert.equal(out.reason, 'stale-reconciliation', 'expected reason:stale-reconciliation; got ' + JSON.stringify(out));
    assert.notEqual(out.skipped, true, 'the recipe returned skipped:true — the defect: ' + JSON.stringify(out));
    assert.notEqual(out.action, 'noop', 'the recipe returned action:noop — the defect: ' + JSON.stringify(out));
  });

  // Case 4 — GREEN before and after the fix. The old argument order, called
  // directly, is provably broken. If someone restores it, this says what it does.
  it("today's broken form executeCleanup(root, slug, action) is provably a no-op", () => {
    const root = makeFixture();
    seedPlan(root, 'review', 'broken-form-1');
    // The exact call the pre-fix recipe made: root where a proposal belongs, slug
    // where root belongs, action where deps belongs.
    const out = cleanup.executeCleanup(root, 'broken-form-1', 'archive-to-done');
    assert.equal(out.action, 'noop', 'broken form should no-op; got ' + JSON.stringify(out));
    assert.equal(out.skipped, true, 'broken form should skip; got ' + JSON.stringify(out));
    assert.ok(exists(planPath(root, 'review', 'broken-form-1')), 'broken form must NOT move the plan');
    assert.ok(!exists(planPath(root, 'done', 'broken-form-1')), 'broken form must NOT reach done/');
  });

  // Case 5 — RED against the unmodified recipe (no _buildCleanupItems program exists).
  it('the category recipe is extractable and uses _buildCleanupItems', () => {
    assert.ok(
      category,
      'the claude:cleanup-exec row must yield a second node -e program using ' +
        '_buildCleanupItems (the executor-side batch loop) — none found'
    );
    assert.match(category, /_buildCleanupItems/);
    assert.match(category, /executeCleanup/);
  });

  // Case 6 — RED against the unmodified recipe. Batch moves every member.
  it('the category recipe moves EVERY member of the category', () => {
    assert.ok(category, 'category recipe not extractable');
    const root = makeFixture({ git: true });
    const slugs = ['doa-batch-a', 'doa-batch-b', 'doa-batch-c'];
    for (const s of slugs) seedPlan(root, 'review', s);
    const res = runCategory(category, 'dead-on-arrival', root);
    assert.equal(res.status, 0, 'batch exited non-zero: ' + res.stderr);
    let arr;
    try {
      arr = JSON.parse(res.stdout);
    } catch (e) {
      assert.fail('batch stdout was not JSON: ' + JSON.stringify(res.stdout) + ' / stderr: ' + res.stderr);
    }
    assert.ok(Array.isArray(arr), 'batch output must be an array; got ' + JSON.stringify(arr));
    assert.equal(arr.length, slugs.length, 'batch must act on all ' + slugs.length + ' members; got ' + JSON.stringify(arr));
    for (const r of arr) assert.notEqual(r.skipped, true, 'a member was skipped: ' + JSON.stringify(r));
    for (const s of slugs) {
      assert.ok(!exists(planPath(root, 'review', s)), s + ' did not leave review/');
    }
  });

  // Case 7 — the batch cannot delete. A dead-on-arrival category batch REVERTS
  // (proposedAction 'revert', never 'delete', because the batch carries no
  // explicitlyRejected flag and production verify never sets it). The plan survives.
  it('the category batch REVERTS a dead-on-arrival plan and never deletes it', () => {
    assert.ok(category, 'category recipe not extractable');
    const root = makeFixture({ git: true });
    seedPlan(root, 'review', 'doa-guard-1');
    const res = runCategory(category, 'dead-on-arrival', root);
    assert.equal(res.status, 0, 'batch exited non-zero: ' + res.stderr);
    // review reverts one gate back; the ledger-vouching walk lands a dead review
    // plan in functional/. The one assertion that matters: it STILL EXISTS.
    assert.ok(!exists(planPath(root, 'review', 'doa-guard-1')), 'plan should have reverted out of review/');
    assert.ok(exists(planPath(root, 'functional', 'doa-guard-1')), 'reverted plan must still exist on disk (in functional/)');
  });

  // Case 8 — a delete through the per-plan recipe requires the explicit flag. The
  // normal per-plan form carries NO explicitlyRejected, so action 'delete' throws
  // the two-layer refusal by construction.
  it('a delete through the per-plan recipe (no explicitlyRejected) is refused', () => {
    assert.ok(perPlan, 'per-plan recipe not extractable');
    const root = makeFixture();
    seedPlan(root, 'review', 'delete-me-not');
    const res = runPerPlan(perPlan, 'delete-me-not', 'delete', root);
    assert.notEqual(res.status, 0, 'delete without the flag must exit non-zero; got ' + res.status);
    assert.match(res.stderr, /explicitlyRejected/, 'stderr must name the delete guard; got ' + res.stderr);
    assert.ok(exists(planPath(root, 'review', 'delete-me-not')), 'the plan must NOT be deleted');
  });

  // Case 9 — a slug that is not stale is a safe no-op.
  it('a slug that is not currently stale is a safe no-op (exit 0, nothing moved)', () => {
    assert.ok(perPlan, 'per-plan recipe not extractable');
    const root = makeFixture();
    seedPlan(root, 'review', 'a-real-stale-one'); // present but NOT the target
    const before = allPlanFiles(root);
    const res = runPerPlan(perPlan, 'not-seeded-anywhere', 'archive-to-done', root);
    assert.equal(res.status, 0, 'no-op must exit 0; got ' + res.status + ' / ' + res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.action, 'noop', 'unknown slug must no-op; got ' + JSON.stringify(out));
    assert.equal(out.skipped, true, 'unknown slug must skip; got ' + JSON.stringify(out));
    assert.deepEqual(allPlanFiles(root), before, 'no plan file may move on a no-op');
  });

  // Step 13 SECURE — <slug> reaches the child as process.argv, never interpolated
  // into a JS string literal, so a slug carrying a quote / semicolon / backslash /
  // newline cannot break out and execute. Passed as an argv token it is inert data.
  it('a hostile slug cannot break out of the recipe (argv, not string interpolation)', () => {
    assert.ok(perPlan, 'per-plan recipe not extractable');
    const root = makeFixture();
    const marker = path.join(root, 'PWNED');
    const hostile = "x');require('fs').writeFileSync('" + marker + "','1')//";
    const res = runPerPlan(perPlan, hostile, 'archive-to-done', root);
    assert.equal(res.status, 0, 'hostile slug should be an inert no-op; got ' + res.status + ' / ' + res.stderr);
    assert.ok(!exists(marker), 'INJECTION: the hostile slug executed arbitrary code');
    const out = JSON.parse(res.stdout);
    assert.equal(out.action, 'noop', 'hostile slug is just an unknown slug → no-op; got ' + JSON.stringify(out));
  });

  // Newline in a slug is the sharpest string-literal breakout; assert it too.
  it('a slug containing quotes/semicolons/backslashes/newlines cannot inject', () => {
    assert.ok(perPlan, 'per-plan recipe not extractable');
    const root = makeFixture();
    for (const hostile of ['a";b', "a';b", 'a\\b', 'a\nb', 'a`b`']) {
      const res = runPerPlan(perPlan, hostile, 'revert', root);
      assert.equal(res.status, 0, 'hostile slug ' + JSON.stringify(hostile) + ' should be inert; stderr: ' + res.stderr);
      const out = JSON.parse(res.stdout);
      assert.equal(out.skipped, true, 'hostile slug ' + JSON.stringify(hostile) + ' must no-op; got ' + JSON.stringify(out));
    }
  });
});
