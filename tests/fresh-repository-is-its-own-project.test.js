/**
 * A fresh repository is its own project.
 *
 * The owner created a fresh repository nested beneath an existing CTOC project,
 * opened the product, and was shown the ANCESTOR project's pipeline — including a
 * plan he never wrote, sitting at the last approval point — while the menu claimed
 * it had set his new project up.
 *
 * The mechanism: `findProjectRoot`'s first pass climbs fifteen ancestor levels
 * looking for a CTOC marker and never stops at a repository boundary. So the fresh
 * repository bound to the ancestor, setup saw `.ctoc` "already there", and returned.
 *
 * These fixtures deliberately build a MALFORMED world — nested repositories, a
 * missing configuration directory, an ancestor that has one. Every existing test in
 * this repository constructs its own correctly-rooted project, which is precisely
 * why none of them could observe a defect in resolution itself.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

const projectRoot = require('../src/lib/project-root');
const { findProjectRoot } = projectRoot;

/** Create a scratch tree; realpath so macOS's /var -> /private/var symlink cannot
 *  make an assertion compare two spellings of the same directory. */
function mkTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-freshrepo-'));
  return fs.realpathSync(dir);
}

function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

/** A CTOC project root: `.ctoc/settings.yaml` plus the CTOC-shaped plans tree. */
function makeCtocProject(dir) {
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), 'general:\n  name: ancestor\n');
  for (const sub of ['vision', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', sub), { recursive: true });
  }
  return dir;
}

/** A repository boundary. A directory named `.git` is enough — no git binary is
 *  invoked, so nothing here is skipped on a machine without git installed. */
function makeGitDir(dir) {
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  return dir;
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Case 1 — the reported defect
// ---------------------------------------------------------------------------

test('case 1: a fresh repository nested under a CTOC project resolves to ITSELF', () => {
  const tmp = mkTmp();
  try {
    const ancestor = makeCtocProject(path.join(tmp, 'A'));
    const fresh = makeGitDir(mkdirp(path.join(ancestor, 'sub')));

    assert.strictEqual(findProjectRoot(fresh), fresh,
      'the fresh repository must be its own root, not the ancestor CTOC project');
    assert.notStrictEqual(findProjectRoot(fresh), ancestor);
  } finally { rm(tmp); }
});

// ---------------------------------------------------------------------------
// Case 2 — and it therefore gets set up
// ---------------------------------------------------------------------------

test('case 2: the fresh repository is actually initialised, not skipped', () => {
  const tmp = mkTmp();
  try {
    const ancestor = makeCtocProject(path.join(tmp, 'A'));
    const fresh = makeGitDir(mkdirp(path.join(ancestor, 'sub')));

    const { ensureInitialized } = require('../src/commands/menu');
    const resolved = findProjectRoot(fresh);
    const didInit = ensureInitialized(resolved);

    assert.strictEqual(resolved, fresh, 'precondition: resolution must reach the fresh repository');
    assert.strictEqual(didInit, true, 'setup must actually run in a repository that has no .ctoc');
    const hasSettings =
      fs.existsSync(path.join(fresh, '.ctoc', 'settings.yaml')) ||
      fs.existsSync(path.join(fresh, '.ctoc', 'settings.json'));
    assert.ok(hasSettings, 'the fresh repository must have its own settings file afterwards');
  } finally { rm(tmp); }
});

// ---------------------------------------------------------------------------
// Case 3 — and it shows no foreign plans
// ---------------------------------------------------------------------------

test('case 3: the fresh repository shows none of the ancestor\'s plans', () => {
  const tmp = mkTmp();
  try {
    const ancestor = makeCtocProject(path.join(tmp, 'A'));
    fs.writeFileSync(
      path.join(ancestor, 'plans', 'review', 'discuss-suggestion-with-editor.md'),
      '---\ntitle: "a plan the human never wrote"\n---\n\n# body\n'
    );
    const fresh = makeGitDir(mkdirp(path.join(ancestor, 'sub')));

    const resolved = findProjectRoot(fresh);
    assert.strictEqual(resolved, fresh, 'precondition: resolution must reach the fresh repository');

    const { pendingGateDecisions } = require('../src/lib/streaming-gate');
    const decisions = pendingGateDecisions(resolved);
    assert.ok(Array.isArray(decisions), 'pendingGateDecisions must return a list');
    assert.strictEqual(decisions.length, 0,
      'a fresh repository must not offer a decision about somebody else\'s plan');
  } finally { rm(tmp); }
});

// ---------------------------------------------------------------------------
// Cases 4-8 — every existing layout resolves exactly as before
// ---------------------------------------------------------------------------

test('case 4: a monorepo package still resolves to the repository root', () => {
  const tmp = mkTmp();
  try {
    const root = makeGitDir(makeCtocProject(path.join(tmp, 'A')));
    const pkg = mkdirp(path.join(root, 'packages', 'p'));
    fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"p"}');

    assert.strictEqual(findProjectRoot(pkg), root);
  } finally { rm(tmp); }
});

test('case 5: a deep subdirectory with no repository boundary between still finds the project', () => {
  const tmp = mkTmp();
  try {
    const root = makeCtocProject(path.join(tmp, 'A'));
    const deep = mkdirp(path.join(root, 'src', 'deep', 'deeper'));

    assert.strictEqual(findProjectRoot(deep), root);
  } finally { rm(tmp); }
});

test('case 6: a repository root that carries CTOC is still the root', () => {
  const tmp = mkTmp();
  try {
    const root = makeGitDir(makeCtocProject(path.join(tmp, 'A')));
    assert.strictEqual(findProjectRoot(root), root);
  } finally { rm(tmp); }
});

test('case 7: with no repository boundary anywhere, behaviour is exactly as before', () => {
  const tmp = mkTmp();
  try {
    const root = makeCtocProject(path.join(tmp, 'A'));
    const sub = mkdirp(path.join(root, 'sub'));
    assert.strictEqual(findProjectRoot(sub), root);
  } finally { rm(tmp); }
});

test('case 8: a bare crypto-home .ctoc above the tree still does not over-root', () => {
  const tmp = mkTmp();
  try {
    // The global crypto home shape: a `.ctoc` holding only `.secret`, no plans sibling.
    const home = mkdirp(path.join(tmp, 'home'));
    fs.mkdirSync(path.join(home, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(home, '.ctoc', '.secret'), 'x');

    const project = makeGitDir(mkdirp(path.join(home, 'proj')));
    assert.strictEqual(findProjectRoot(project), project,
      'the crypto home must not become the project root');
  } finally { rm(tmp); }
});

// ---------------------------------------------------------------------------
// Cases 9-10 — the resolution is inspectable, and cannot disagree with itself
// ---------------------------------------------------------------------------

test('case 9: describeProjectRoot reports the repository boundary', () => {
  const tmp = mkTmp();
  try {
    const ancestor = makeCtocProject(path.join(tmp, 'A'));
    const fresh = makeGitDir(mkdirp(path.join(ancestor, 'sub')));

    assert.strictEqual(typeof projectRoot.describeProjectRoot, 'function',
      'describeProjectRoot must be exported');
    const where = projectRoot.describeProjectRoot(fresh);
    assert.strictEqual(where.root, fresh);
    assert.strictEqual(where.cwd, fresh);
    assert.strictEqual(where.sameAsCwd, true);
    assert.strictEqual(where.marker, 'git');
    assert.strictEqual(where.stoppedAtRepoBoundary, true);
  } finally { rm(tmp); }
});

test('case 10: describeProjectRoot and findProjectRoot never disagree', () => {
  const tmp = mkTmp();
  try {
    const ancestor = makeCtocProject(path.join(tmp, 'A'));
    const fresh = makeGitDir(mkdirp(path.join(ancestor, 'sub')));
    const deep = mkdirp(path.join(ancestor, 'src', 'deep', 'deeper'));
    const mono = makeGitDir(makeCtocProject(path.join(tmp, 'M')));
    const monoPkg = mkdirp(path.join(mono, 'packages', 'p'));
    const bare = mkdirp(path.join(tmp, 'bare'));

    for (const dir of [ancestor, fresh, deep, mono, monoPkg, bare, tmp]) {
      assert.strictEqual(
        projectRoot.describeProjectRoot(dir).root,
        findProjectRoot(dir),
        `description and resolution disagree for ${dir}`
      );
    }
  } finally { rm(tmp); }
});

test('case 10b: describeProjectRoot never throws and falls back to the working directory', () => {
  const where = projectRoot.describeProjectRoot(undefined);
  assert.strictEqual(typeof where.root, 'string');
  assert.strictEqual(typeof where.marker, 'string');
  assert.strictEqual(typeof where.sameAsCwd, 'boolean');
});

// ---------------------------------------------------------------------------
// Cases 11-13 — the dashboard names the project it opened
// ---------------------------------------------------------------------------

/** Render the dashboard header with the ambient walk pointed at `cwd`. */
function renderHeader(cwd, projectPathArg) {
  const { buildDashboardTable } = require('../src/lib/menu-screens');
  const saved = process.cwd();
  try {
    process.chdir(cwd);
    return buildDashboardTable(projectPathArg);
  } finally {
    process.chdir(saved);
  }
}

test('case 11: the dashboard names a root that is not the working directory', () => {
  const tmp = mkTmp();
  try {
    const root = makeCtocProject(path.join(tmp, 'A'));
    const inner = mkdirp(path.join(root, 'src', 'deep'));

    const out = renderHeader(inner, findProjectRoot(inner));
    assert.match(out, /Working in /,
      'the header must say which project it opened when that is not this directory');
    assert.match(out, /\.\./,
      'the disclosed path must be rendered in relative form');
  } finally { rm(tmp); }
});

test('case 12: the dashboard stays silent when the root IS the working directory', () => {
  const tmp = mkTmp();
  try {
    const root = makeCtocProject(path.join(tmp, 'A'));
    const out = renderHeader(root, root);
    assert.ok(!out.includes('Working in '),
      'the ordinary case must be byte-identical to today — no disclosure line');
  } finally { rm(tmp); }
});

test('case 13: no absolute path reaches the screen', () => {
  const tmp = mkTmp();
  try {
    const root = makeCtocProject(path.join(tmp, 'A'));
    const inner = mkdirp(path.join(root, 'src', 'deep'));

    const out = renderHeader(inner, findProjectRoot(inner));
    assert.ok(!out.includes(tmp), 'the temporary directory\'s absolute prefix must not appear');
    assert.ok(!out.includes(os.homedir()), 'a home-directory path must not appear');
  } finally { rm(tmp); }
});

// ---------------------------------------------------------------------------
// Case 14 — end to end, as the owner ran it
// ---------------------------------------------------------------------------

test('case 14: a real menu process, opened in a fresh nested repository, offers no foreign decision', () => {
  const tmp = mkTmp();
  try {
    const ancestor = makeCtocProject(path.join(tmp, 'A'));
    fs.writeFileSync(
      path.join(ancestor, 'plans', 'review', 'discuss-suggestion-with-editor.md'),
      '---\ntitle: "discuss suggestion with editor"\nstage: review\n---\n\n# discuss suggestion with editor\n\nA body the human never wrote.\n'
    );
    const fresh = makeGitDir(mkdirp(path.join(ancestor, 'sub')));

    const res = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, 'src', 'commands', 'menu.js')],
      { cwd: fresh, encoding: 'utf8', timeout: 60000, env: { ...process.env, CI: '1' } }
    );

    const out = `${res.stdout || ''}${res.stderr || ''}`;
    assert.ok(!out.includes('discuss-suggestion-with-editor'),
      `a fresh repository must not be offered the parent's plan. Saw:\n${out.slice(0, 4000)}`);
    assert.ok(!out.includes('discuss suggestion with editor'),
      `a fresh repository must not be offered the parent's plan by title. Saw:\n${out.slice(0, 4000)}`);
    assert.ok(fs.existsSync(path.join(fresh, '.ctoc')),
      'the fresh repository must have its own configuration directory afterwards');
  } finally { rm(tmp); }
});
