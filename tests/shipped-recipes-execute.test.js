'use strict';

// 00186 — a shipped recipe is proven by RUNNING it.
//
// A static check cannot catch the defect class this fence exists for: the broken
// `cleanup-exec` recipe (00185) passed a string where an object belonged, an
// arity-legal call that every static checker reports green. The only mechanism
// that catches it is EXECUTION against a fixture seeded so a specific observable
// change must occur — then asserting the change occurred.
//
// This test is that mechanism, generalized across the state-changing recipes in
// `src/commands/start.md`. It NEVER holds a copy of a recipe: it reads the shipped
// bytes and runs them. Cases 1, 2, 3 and 9 are RED before the harness exists
// (module-not-found), and GREEN after — real TDD.
//
// LOAD-BEARING clauses:
//   • Case 1 non-zero: the recipe surface was RENAMED once (menu.md → start.md);
//     a harness that silently extracts nothing when its target moves is the exact
//     false-green shape this whole plan fences. Zero recipes MUST fail.
//   • Case 9: the harness is run on the historical bug it exists to find. An
//     instrument never shown catching anything is an unvalidated instrument.

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const REPO_ROOT = path.join(__dirname, '..');
const START_MD = path.join(REPO_ROOT, 'src', 'commands', 'start.md');
const COVERAGE_FILE = path.join(REPO_ROOT, '.ctoc', 'recipe-coverage.json');

// The instrument under test. Required at module load: if it does not exist yet
// (Step 8 Red) this throw is the RED evidence for every case below.
const harness = require('../src/lib/recipe-harness.js');
const { extractRecipes, runRecipe, recipeId, isStateChanging } = harness;

// ── fixtures ────────────────────────────────────────────────────────────────

const fixtures = [];
function tmpRoot(tag) {
  const root = path.join(
    os.tmpdir(),
    'ctoc-00186-' + tag + '-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  );
  fs.mkdirSync(path.join(root, 'plans'), { recursive: true });
  fixtures.push(root);
  return root;
}
afterEach(() => {
  while (fixtures.length) fs.rmSync(fixtures.pop(), { recursive: true, force: true });
});

// Seed plans/<stage>/<slug>.md declaring one missing file → a `missing-files`
// signal → a cheap stale candidate (the exact pattern 00185 proved works for the
// per-plan archive path, no git needed).
function seedStalePlan(root, stage, slug) {
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  const fm =
    '---\n' +
    'title: "' + slug + '"\n' +
    'files: ["src/does-not-exist-' + slug + '.js"]\n' +
    'status: refined\n---\n\n# ' + slug + '\n';
  fs.writeFileSync(path.join(dir, slug + '.md'), fm);
}
const planPath = (root, stage, slug) => path.join(root, 'plans', stage, slug + '.md');
const readSettings = (root) =>
  JSON.parse(fs.readFileSync(path.join(root, '.ctoc', 'settings.json'), 'utf8'));

// ── covered-recipe fixture handlers ───────────────────────────────────────────
// Each seeds a fixture, runs the SHIPPED recipe via the harness, and asserts a
// specific observable state change (case 4) that is not a silent no-op (case 5).
// Keyed by the human label carried in .ctoc/recipe-coverage.json → covered[].label.

const HANDLERS = {
  'create-plan (allocatePlanNumber)': (recipe) => {
    const root = tmpRoot('alloc');
    const res = runRecipe(recipe.program, {
      root,
      substitutions: { '{{CTOC_ROOT}}': REPO_ROOT },
    });
    assert.equal(res.code, 0, 'allocate exited non-zero: ' + res.stderr + res.error);
    assert.match(res.stdout.trim(), /^\d{5}$/, 'expected a 5-digit number; got ' + JSON.stringify(res.stdout));
    // Observable change: an exclusive claim file was staked under .ctoc/.
    const claim = path.join(root, '.ctoc', 'state', 'plan-numbers', res.stdout.trim());
    assert.ok(fs.existsSync(claim), 'no claim file staked at ' + claim + ' — recipe did not change state');
  },

  'cleanup-exec per-plan (executeCleanup)': (recipe) => {
    // THE load-bearing covered recipe — the one 00185 repairs. archive-to-done a
    // seeded-stale review plan; it must MOVE and the result must not be skipped.
    const root = tmpRoot('cleanup');
    seedStalePlan(root, 'review', 'covered-archive-me');
    const res = runRecipe(recipe.program, {
      root,
      substitutions: { '{{CTOC_ROOT}}': REPO_ROOT, '<slug>': 'covered-archive-me', '<action>': 'archive-to-done' },
      args: recipe.args,
    });
    assert.equal(res.code, 0, 'cleanup exited non-zero: ' + res.stderr + res.error);
    assert.ok(res.json, 'cleanup stdout was not JSON: ' + JSON.stringify(res.stdout));
    assert.notEqual(res.json.skipped, true, 'recipe returned skipped:true — the 00185 defect: ' + JSON.stringify(res.json));
    assert.equal(res.json.to, 'done', 'expected to:done; got ' + JSON.stringify(res.json));
    assert.ok(fs.existsSync(planPath(root, 'done', 'covered-archive-me')), 'plan not moved to done/');
    assert.ok(!fs.existsSync(planPath(root, 'review', 'covered-archive-me')), 'plan still in review/');
  },

  'set-environment (setSetting environment)': (recipe) => {
    const root = tmpRoot('setenv');
    const res = runRecipe(recipe.program, {
      root,
      substitutions: { '${CLAUDE_PLUGIN_ROOT}': REPO_ROOT, '{env}': 'dev' },
    });
    assert.equal(res.code, 0, 'set-environment exited non-zero: ' + res.stderr + res.error);
    assert.equal(readSettings(root).general.environment, 'dev', 'settings.json environment not written');
  },

  'env-keep-defaults (setSetting environment_prompt_dismissed)': (recipe) => {
    const root = tmpRoot('keepdef');
    const res = runRecipe(recipe.program, {
      root,
      substitutions: { '${CLAUDE_PLUGIN_ROOT}': REPO_ROOT },
    });
    assert.equal(res.code, 0, 'env-keep-defaults exited non-zero: ' + res.stderr + res.error);
    assert.equal(readSettings(root).general.environment_prompt_dismissed, true, 'dismissed flag not written');
  },
};

// ── a byte-manifest of the real plans/ tree (case 10) ─────────────────────────
function plansManifest(root) {
  const out = {};
  const dir = path.join(root, 'plans');
  const walk = (d, rel) => {
    if (!fs.existsSync(d)) return;
    for (const name of fs.readdirSync(d).sort()) {
      const full = path.join(d, name);
      const r = rel ? rel + '/' + name : name;
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full, r);
      else out[r] = crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(dir, '');
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('00186 — shipped recipes are proven by running them', () => {
  let recipes;
  let inScope;
  let ledger;
  let realBefore;

  before(() => {
    realBefore = plansManifest(REPO_ROOT);
    recipes = extractRecipes(START_MD);
    inScope = recipes.filter(isStateChanging);
    ledger = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'));
  });

  // Case 1 — extraction finds every node program AND is non-zero.
  it('extracts every node -e program in start.md, and the count is NON-ZERO', () => {
    const md = fs.readFileSync(START_MD, 'utf8');
    const naive = (md.match(/node -e "/g) || []).length;
    const nodeE = recipes.filter((r) => r.kind === 'node-e');
    assert.ok(naive > 0, 'no node -e recipes in start.md — target moved/renamed or parser regressed');
    assert.equal(nodeE.length, naive, 'harness extracted ' + nodeE.length + ' node -e programs; naive scan found ' + naive);
    // Every recipe carries a parseable program/script — a row that cannot be parsed FAILS.
    for (const r of recipes) {
      assert.ok(r.kind === 'node-e' ? typeof r.program === 'string' && r.program.length > 0
        : typeof r.scriptPath === 'string' && r.scriptPath.length > 0,
        'unparseable recipe at row ' + r.row + ': ' + JSON.stringify(r));
    }
  });

  // Case 1b — a missing target is a LOUD throw, never a silent zero-recipe result.
  it('a missing markdown target THROWS (never a silent empty extraction)', () => {
    const gone = path.join(os.tmpdir(), 'ctoc-00186-absent-' + Date.now() + '.md');
    assert.throws(() => extractRecipes(gone), /recipe-harness|not.*exist|ENOENT|missing/i,
      'extractRecipes must throw naming the missing path, not return []');
  });

  // Case 2 — every require target resolves on disk.
  it('every recipe require() target resolves to a file on disk', () => {
    for (const r of recipes) {
      for (const c of r.staticCalls || []) {
        // Node's own resolution — a module may resolve as `<name>.js` OR as a
        // directory package (`<name>/index.js`, e.g. plan-index).
        assert.doesNotThrow(
          () => require.resolve(path.join(REPO_ROOT, c.module)),
          'require target does not resolve on disk: ' + c.module + ' (row ' + r.row + ')'
        );
      }
      if (r.kind === 'node-script') {
        assert.ok(fs.existsSync(path.join(REPO_ROOT, r.scriptPath)), 'script does not exist: ' + r.scriptPath);
      }
    }
  });

  // Case 3 — every named function exists as a function on the resolved module.
  it('every named function is exported as a function (the one trustworthy static check)', () => {
    for (const r of recipes) {
      for (const c of r.staticCalls || []) {
        const mod = require(path.join(REPO_ROOT, c.module));
        assert.equal(typeof mod[c.fn], 'function',
          c.module + '.' + c.fn + ' is not an exported function (row ' + r.row + ')');
      }
    }
  });

  // Case 4 + 5 — every covered recipe executes and produces its declared effect,
  // and none returns a silent no-op.
  it('every covered recipe executes and produces its declared observable change', () => {
    const liveById = new Map(inScope.map((r) => [recipeId(r), r]));
    assert.ok(ledger.covered.length > 0, 'ledger.covered is empty — no recipe is proven by running it');
    for (const entry of ledger.covered) {
      const recipe = liveById.get(entry.id);
      assert.ok(recipe, 'covered recipe "' + entry.label + '" (id ' + entry.id + ') is not in the live state-changing scan');
      const handler = HANDLERS[entry.label];
      assert.ok(handler, 'covered recipe "' + entry.label + '" has no fixture handler in this test');
      handler(recipe); // seeds, runs, asserts the observable change (and not-skipped)
    }
  });

  // Case 6 — the coverage ledger is complete; the in-scope scan is non-empty.
  it('the coverage ledger accounts for every state-changing recipe (in-scope scan non-empty)', () => {
    assert.ok(inScope.length > 0,
      'ZERO state-changing recipes found in start.md — an empty in-scope set would let the ledger pass vacuously');
    const ledgerIds = new Set([...ledger.covered, ...ledger.uncovered].map((e) => e.id));
    const missing = inScope.filter((r) => !ledgerIds.has(recipeId(r)));
    assert.deepEqual(
      missing.map((r) => ({ row: r.row, id: recipeId(r), calls: r.calls, script: r.scriptPath })),
      [],
      'A state-changing recipe in start.md is in NEITHER covered nor uncovered. Add a fixture ' +
      '(→ covered) or a one-line reason (→ uncovered) to .ctoc/recipe-coverage.json.'
    );
  });

  // Case 7 — the ratchet only tightens.
  it('the ratchet only tightens: covered >= minCovered, uncovered <= maxUncovered', () => {
    assert.ok(ledger.covered.length >= ledger.minCovered,
      'covered count ' + ledger.covered.length + ' fell below minCovered ' + ledger.minCovered + ' — never lower it');
    assert.ok(ledger.uncovered.length <= ledger.maxUncovered,
      'uncovered count ' + ledger.uncovered.length + ' rose above maxUncovered ' + ledger.maxUncovered);
  });

  // Case 8 — uncovered (and covered) entries are honest: no phantom ids.
  it('every ledger entry names a recipe that still exists in start.md', () => {
    const liveIds = new Set(inScope.map(recipeId));
    const phantoms = [...ledger.covered, ...ledger.uncovered]
      .filter((e) => !liveIds.has(e.id))
      .map((e) => e.label + ' (' + e.id + ')');
    assert.deepEqual(phantoms, [], 'phantom ledger entries (recipe gone from start.md): ' + phantoms.join(', '));
  });

  // Case 9 — the harness is tested on the bug it exists to find. LOAD-BEARING.
  // A fixture markdown carrying the HISTORICAL broken form — executeCleanup(root,
  // string, string), a string where the proposal object belongs — is detected by
  // the harness as producing a silent no-op.
  it('a deliberately broken recipe is caught as a silent no-op', () => {
    const md =
      '# fixture\n\n' +
      '| `claude:cleanup-exec` | broken | ' +
      "`node -e \"const c=require('{{CTOC_ROOT}}/src/lib/stale-cleanup');" +
      "console.log(JSON.stringify(c.executeCleanup(process.cwd(),'x','y')))\"` |\n";
    const mdPath = path.join(tmpRoot('broken'), 'broken.md');
    fs.writeFileSync(mdPath, md);
    const broken = extractRecipes(mdPath).find((r) => (r.calls || []).includes('stale-cleanup.executeCleanup'));
    assert.ok(broken, 'the broken recipe was not extracted from the fixture markdown');

    const root = tmpRoot('brokenrun');
    seedStalePlan(root, 'review', 'should-not-move'); // a real stale plan present
    const res = runRecipe(broken.program, { root, substitutions: { '{{CTOC_ROOT}}': REPO_ROOT } });
    assert.equal(res.code, 0, 'broken recipe should still exit 0 (it silently no-ops): ' + res.stderr);
    assert.ok(res.json, 'broken recipe stdout not JSON: ' + JSON.stringify(res.stdout));
    assert.equal(res.json.skipped, true, 'harness did NOT detect the no-op; got ' + JSON.stringify(res.json));
    assert.equal(res.json.action, 'noop', 'expected action:noop; got ' + JSON.stringify(res.json));
    // And the seeded plan did not move — the observable proof the recipe did nothing.
    assert.ok(fs.existsSync(planPath(root, 'review', 'should-not-move')), 'broken recipe moved a plan it should not have');
  });

  // Case 10 — no fixture run touched the real repository.
  it('no fixture run touched the real repository plans/ tree', () => {
    assert.deepEqual(plansManifest(REPO_ROOT), realBefore, 'the real plans/ tree changed during the suite');
  });

  // maxBuffer overflow is reported as a FAILURE, never swallowed into a pass.
  it('a stdout overflow is reported as a failure, never swallowed', () => {
    const root = tmpRoot('overflow');
    const res = runRecipe("process.stdout.write('x'.repeat(1024*1024))", { root, maxBuffer: 1024 });
    assert.ok(res.overflow === true || res.error, 'overflow must surface as overflow/error, not a clean pass: ' + JSON.stringify(res));
    assert.notEqual(res.code, 0, 'an overflowing run must not report code 0');
  });
});
