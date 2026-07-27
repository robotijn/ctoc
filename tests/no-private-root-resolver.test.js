/**
 * FENCE: no private project-root resolver may live outside src/lib/project-root.js.
 *
 * WHAT THIS CATCHES
 * -----------------
 * The over-rooting defect: a function that climbs directory ancestry treating a
 * BARE `.ctoc` (or `.claude-plugin`) directory as a project-root marker. On any
 * machine that has used CTOC's crypto path, `src/lib/crypto.js` creates the global
 * crypto home `~/.ctoc` (holding only `.secret`), so a bare-marker climb from any
 * project beneath $HOME over-roots to $HOME — reading budgets, enforcement scans and
 * (governance-load-bearing) four-eyes role tables that belong to NO project. The
 * single, correct implementation of the walk is `describeProjectRoot` in
 * `src/lib/project-root.js`, which requires a genuine PROJECT `.ctoc` (one carrying
 * settings, or beside a `plans/` sibling) and reports `marker: 'fallback'` when it
 * cannot identify a project. Every other module MUST delegate to it.
 *
 * WHAT THIS DELIBERATELY DOES NOT CATCH
 * -------------------------------------
 *   - A path BUILDER: `path.join(resolvedRoot, '.ctoc')` where `resolvedRoot` is a
 *     root already resolved by the shared resolver and never climbed. That is the
 *     correct, ubiquitous pattern; it is not an ancestry walk.
 *   - A resolver keyed on DIFFERENT markers that cannot capture `~/.ctoc`. The two
 *     permanent exemptions below use `package.json`/`go.mod`/`Cargo.toml`/`.git` and
 *     `VERSION`/`.git` respectively — no bare `.ctoc` — so the crypto home cannot
 *     over-root them.
 *   - Anything under `tests/`. A test may build any root it likes; the fence scans
 *     `src/**` only.
 *
 * WHY THE EXEMPTION LIST IS A PERMANENT, JUSTIFIED LIST — NOT A SHRINKING BASELINE.
 * A shrink-only debt baseline says "these are known-bad, get rid of them". A permanent
 * exemption says "these are CORRECT for a stated reason and must stay". Conflating the
 * two is what kills a fence: a new violation slipped into a debt baseline looks like
 * pre-existing debt. This list starts and stays at exactly the two entries verified to
 * use non-capturing markers; a silent addition FAILS the exemption-list test below.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'src');

// The ONE sanctioned home of the ancestry walk. Excluded because it IS the shared
// resolver every other module must delegate to.
const CANONICAL = 'src/lib/project-root.js';

// PERMANENT, justified exemptions — NOT a shrink-only baseline. Each key is a
// repository-relative path; each value is a non-empty written justification.
const EXEMPTIONS = {
  'src/lib/coverage-map.js':
    "markers are package.json/go.mod/Cargo.toml/pyproject.toml/.git — no bare .ctoc, " +
    "so ~/.ctoc cannot capture it — and it returns a distinguishable null rather than substituting start",
  'src/scripts/run-evals.js':
    "markers are VERSION/.git — no bare .ctoc — and it is a build script, not runtime",
};

const MAX_FILE_BYTES = 1024 * 1024; // bound the read; a source file over 1 MiB is not a resolver

/**
 * Detect a PRIVATE root resolver in a single source text: an existsSync check for a
 * bare `.ctoc`/`.claude-plugin` marker, joined to a variable that is ALSO climbed via
 * `path.dirname(<sameVar>)`. The climb requirement is what separates a real resolver
 * from a path builder (which joins `.ctoc` to a resolved root that is never climbed).
 * Comments are stripped first so a `.ctoc` mention in prose cannot false-positive.
 *
 * @param {string} sourceText
 * @returns {boolean}
 */
function scanForPrivateRootResolver(sourceText) {
  const code = sourceText
    .replace(/\/\*[\s\S]*?\*\//g, ' ')        // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1');       // line comments (guarding http://)
  const markerRe =
    /existsSync\(\s*path\.join\(\s*(\w+)\s*,\s*['"]\.(?:ctoc|claude-plugin)['"]/g;
  let m;
  while ((m = markerRe.exec(code)) !== null) {
    const varName = m[1];
    const climbRe = new RegExp('path\\.dirname\\(\\s*' + varName + '\\b');
    if (climbRe.test(code)) return true;
  }
  return false;
}

function listSrcJsFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSrcJsFiles(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

function rel(p) {
  return path.relative(REPO, p).split(path.sep).join('/');
}

function findViolators() {
  const violators = [];
  for (const abs of listSrcJsFiles(SRC)) {
    const r = rel(abs);
    if (r === CANONICAL) continue;
    if (Object.prototype.hasOwnProperty.call(EXEMPTIONS, r)) continue;
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }
    if (stat.size > MAX_FILE_BYTES) continue;
    const text = fs.readFileSync(abs, 'utf8');
    if (scanForPrivateRootResolver(text)) violators.push(r);
  }
  return violators.sort();
}

// --- fixtures for the behaviour cases --------------------------------------

function mkTmp(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}
function rmTmp(dir) {
  if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ===========================================================================
describe('fence — no private project-root resolver outside project-root.js', () => {
  it('case 1: src/** contains no bare-marker ancestry walk except the canonical resolver and the two exemptions', () => {
    const violators = findViolators();
    assert.deepEqual(
      violators, [],
      `Private root resolver(s) found: ${violators.join(', ')}. ` +
      `Delegate to describeProjectRoot in ${CANONICAL} instead of walking ancestry for a bare .ctoc/.claude-plugin.`
    );
  });

  it('case 2: the detector actually DETECTS (a fence that only counts to zero is a lie)', () => {
    // A synthetic private resolver — the exact shape the three carriers had.
    const positive = `
      function findProjectRoot(start) {
        let dir = start;
        for (let i = 0; i < 12; i++) {
          if (safeFs.existsSync(path.join(dir, '.ctoc')) || safeFs.existsSync(path.join(dir, '.claude-plugin'))) return dir;
          const parent = path.dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
        return start;
      }`;
    assert.equal(scanForPrivateRootResolver(positive), true, 'detector missed a real private resolver');

    // A path BUILDER on a resolved root that is never climbed — must NOT match.
    const negativeBuilder = `
      const root = describeProjectRoot(start).root;
      const p = path.join(root, '.ctoc', 'config', 'budget.yaml');`;
    assert.equal(scanForPrivateRootResolver(negativeBuilder), false, 'detector false-positived a path builder');

    // A bare `.ctoc` mention inside a COMMENT must NOT match.
    const negativeComment = `
      // walk up for existsSync(path.join(dir, '.ctoc')) then path.dirname(dir)
      const root = getCtocPath();`;
    assert.equal(scanForPrivateRootResolver(negativeComment), false, 'detector matched a comment');
  });

  it('case 3: the exemption list is exactly the two justified entries (permanent, not a shrinking baseline)', () => {
    assert.deepEqual(Object.keys(EXEMPTIONS).sort(), [
      'src/lib/coverage-map.js',
      'src/scripts/run-evals.js',
    ]);
    for (const [file, why] of Object.entries(EXEMPTIONS)) {
      assert.equal(typeof why, 'string');
      assert.ok(why.trim().length > 0, `exemption ${file} has no justification`);
      assert.ok(fs.existsSync(path.join(REPO, file)), `exempt file ${file} does not exist`);
    }
  });
});

describe('behaviour — the three carriers no longer over-root to a stand-in home', () => {
  const budget = require('../src/lib/budget');
  const enforcer = require('../src/lib/iron-loop-enforcer');
  const fourEyes = require('../src/lib/four-eyes');

  it('case 4: budget.findProjectRoot roots at the project, not a stand-in home carrying a bare .ctoc', () => {
    const home = mkTmp('ctoc-standin-home-');
    try {
      // A crypto-home shape: a bare `.ctoc` with only `.secret`, no settings, no plans.
      fs.mkdirSync(path.join(home, '.ctoc'), { recursive: true });
      fs.writeFileSync(path.join(home, '.ctoc', '.secret'), 'x');
      const project = path.join(home, 'proj');
      fs.mkdirSync(path.join(project, '.git'), { recursive: true });
      const nested = path.join(project, 'a', 'b', 'c');
      fs.mkdirSync(nested, { recursive: true });

      const root = fs.realpathSync(budget.findProjectRoot(nested));
      assert.equal(root, fs.realpathSync(project), 'budget over-rooted past the project');
      assert.notEqual(root, fs.realpathSync(home), 'budget resolved to the stand-in home');
    } finally {
      rmTmp(home);
    }
  });

  it('case 5: iron-loop-enforcer.findProjectRoot roots at the project, not the stand-in home', () => {
    const home = mkTmp('ctoc-standin-home-');
    try {
      fs.mkdirSync(path.join(home, '.ctoc'), { recursive: true });
      fs.writeFileSync(path.join(home, '.ctoc', '.secret'), 'x');
      const project = path.join(home, 'proj');
      fs.mkdirSync(path.join(project, '.git'), { recursive: true });
      const nested = path.join(project, 'x', 'y');
      fs.mkdirSync(nested, { recursive: true });

      const root = fs.realpathSync(enforcer.findProjectRoot(nested));
      assert.equal(root, fs.realpathSync(project), 'enforcer over-rooted past the project');
      assert.notEqual(root, fs.realpathSync(home), 'enforcer resolved to the stand-in home');
    } finally {
      rmTmp(home);
    }
  });

  it('case 6: four-eyes governs by the PROJECT roles.yaml, never a stand-in home role table', () => {
    const home = mkTmp('ctoc-standin-home-');
    try {
      // The stand-in home carries a role table that WOULD pass four-eyes. If the
      // resolver over-roots to it, a plan gets approved against a foreign project's
      // roles — the exact governance bypass. The project itself declares NO roles,
      // so rooting correctly at the project yields "No roles declared".
      const homeRoles = [
        'roles:',
        '  - name: rev',
        '    identity: alice',
        '    can_review: true',
        '  - name: app',
        '    identity: bob',
        '    can_approve: true',
        '',
      ].join('\n');
      fs.mkdirSync(path.join(home, '.ctoc'), { recursive: true });
      fs.writeFileSync(path.join(home, '.ctoc', 'roles.yaml'), homeRoles);

      const project = path.join(home, 'proj');
      const planPath = path.join(project, 'plans', 'review', 'p.md');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      const plan = [
        '---', 'title: Test Plan',
        'approved_by_author_review: rev',
        'approved_by_independent: app',
        '---', '', '# Body', '',
      ].join('\n');
      fs.writeFileSync(planPath, plan);

      const res = fourEyes.verifyFourEyes(planPath); // bare string, no root -> infer
      assert.equal(res.passed, false, 'four-eyes over-rooted to the stand-in home role table');
      assert.match(res.reason, /No roles declared/i);
    } finally {
      rmTmp(home);
    }
  });

  it('case 7: both reader resolvers return a STRING for every input and fall back to cwd, never null/throw', () => {
    for (const fn of [budget.findProjectRoot, enforcer.findProjectRoot]) {
      assert.equal(typeof fn(undefined), 'string');
      assert.equal(typeof fn(/** @type {any} */ (12345)), 'string'); // unresolvable -> cwd, not a throw
      assert.equal(typeof fn(process.cwd()), 'string');
    }
  });
});
