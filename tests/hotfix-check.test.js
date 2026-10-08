'use strict';

// The hotfix check, driven the way a session drives it: through the menu router
// (`route(['hotfix', 'check', ...])`) against a real temporary git repository, and once
// through the real menu process (`node src/commands/start.js hotfix check ...`).
// Plan: plans/todo/ctoc-checks-that-a-hotfix-is-really-small-and-safe-s1-the-hotfix-check.md,
// Step 8, cases 1 to 53, and the branch cases of the trial build moved to the new contract.
//
// Every check runs with the system temporary folder pointed at a folder of this file's own
// (TMPDIR, TEMP and TMP), so "no `ctoc-hotfix-` folder remains" is exact: nothing else
// makes one there. Fixture tests that must report where they ran write under the folder
// named by CTOC_HOTFIX_PROBE, outside both repositories.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { route } = require('../src/lib/menu-screens');
const qualityAgent = require('../src/lib/quality-agent');
const safeFs = require('../src/lib/safe-fs');

const START = path.join(__dirname, '..', 'src', 'commands', 'start.js');
const NODE = process.execPath;
const STATUS_LINE = 'Checking the hotfix against the existing tests.';
const USAGE = 'Use: hotfix check [--run-tests] [<file> ...]';
const LOG = path.join('.ctoc', 'logs', 'hotfix-checks.jsonl');
const NO_TEST = 'no test ran, so nothing confirms the change';
const DOC_ONLY = 'The project has no test command, and the change is documentation only.';

const refusal = (clause) => `I did not treat this as a hotfix because ${clause}; `
  + 'it goes through a normal plan, and your edits stay in place, not committed.';
const unreadable = (why) => refusal(`I could not read the change (${why})`);

const HOME = '<!doctype html>\n<html>\n<body>\n<button>Save</button>\n</body>\n</html>\n';
const HOME_STORE = HOME.replace('<button>Save</button>', '<button>Store</button>');

/**
 * A node:test file. It records the folder it runs in under CTOC_HOTFIX_PROBE (when set),
 * then runs one test named `name` whose body may use `read(rel)` (a project file) and
 * `assert`.
 */
function nodeTest(name, body, { marker = 'ran.txt', prelude = '' } = {}) {
  return [
    "const test = require('node:test');",
    "const assert = require('node:assert');",
    "const fs = require('fs');",
    "const path = require('path');",
    "const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');",
    'const probe = process.env.CTOC_HOTFIX_PROBE;',
    `if (probe) fs.writeFileSync(path.join(probe, ${JSON.stringify(marker)}), process.cwd());`,
    prelude,
    `test(${JSON.stringify(name)}, () => {`,
    body,
    '});',
    ''
  ].join('\n');
}
const PASSING_TEST = nodeTest('has a button', "  assert.ok(read('src/pages/home.html').includes('<button>'));");
const FAILING_TEST = nodeTest('shows Save', "  assert.ok(read('src/pages/home.html').includes('Save'));");
const SCRIPT = 'node --test tests/*.test.js';

const REAL_TMP = os.tmpdir();
const scratch = [];
function tmpDir(prefix = 'hotfix-check-') {
  const d = fs.realpathSync.native(fs.mkdtempSync(path.join(REAL_TMP, prefix)));
  scratch.push(d);
  return d;
}
/** The temporary folder every check in this file sees as the system's. */
const PRIVATE_TMP = tmpDir('hotfix-private-tmp-');
const leftovers = () => fs.readdirSync(PRIVATE_TMP).filter((n) => n.startsWith('ctoc-hotfix-'));

test.after(() => {
  for (const r of scratch) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});
test.afterEach(() => {
  assert.deepEqual(leftovers(), [], 'no temporary copy of the check remains');
});

const GIT_IDENTITY = ['-c', 'user.name=Hotfix Test', '-c', 'user.email=hotfix@test.invalid', '-c', 'commit.gpgsign=false'];
function git(cwd, args, input) {
  const r = spawnSync('git', [...GIT_IDENTITY, ...args], { cwd, encoding: 'utf8', input });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

const packageJson = (testScript) => JSON.stringify({
  name: 'hotfix-fixture', version: '1.0.0', private: true, scripts: { test: testScript }
}, null, 2) + '\n';

/**
 * A committed repository holding `files`; with `testScript`, a package.json whose
 * `test` script is that command.
 */
function makeRepo(files, { testScript = null, autocrlf = false, init = true, commit = true, config = [] } = {}) {
  const root = tmpDir();
  if (init) {
    git(root, ['init', '-q']);
    if (autocrlf) git(root, ['config', 'core.autocrlf', 'true']);
    for (const [k, v] of config) git(root, ['config', k, v]);
  }
  const all = { ...files };
  if (testScript !== null) all['package.json'] = packageJson(testScript);
  writeFiles(root, all);
  if (init && commit) {
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'base']);
  }
  return root;
}

const testedProject = (extra = {}, script = SCRIPT) => makeRepo({
  'src/pages/home.html': HOME, 'tests/home.test.js': PASSING_TEST, ...extra
}, { testScript: script });

/** Run `fn` with the given environment variables set, restoring them after. */
async function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

/**
 * One check through the menu router. A nested `node --test` inherits NODE_TEST_CONTEXT
 * from this outer runner and reports to it instead of printing its counters (see
 * tests/step-13-verify.test.js), so the variable is cleared, as it is in a real session.
 */
function check(root, ...args) {
  return withEnv({ NODE_TEST_CONTEXT: undefined, TMPDIR: PRIVATE_TMP, TEMP: PRIVATE_TMP, TMP: PRIVATE_TMP },
    () => route(['hotfix', 'check', ...args], root));
}

/** A folder outside both repositories for a fixture test's marker files. */
function probeDir() {
  return tmpDir('hotfix-probe-');
}
const probeRead = (probe, name = 'ran.txt') => {
  const p = path.join(probe, name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

function logLines(root) {
  const p = path.join(root, LOG);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
const withoutTime = (lines) => lines.map(({ at, ...rest }) => rest);

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const worktrees = (root) => git(root, ['worktree', 'list', '--porcelain']);
const stashList = (root) => git(root, ['stash', 'list']);

/** Status outside `.ctoc/`, the index entries, and the bytes of every changed or new file. */
function snapshot(root) {
  const status = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root })
    .stdout.toString('utf8').split('\0').filter((e) => e && !e.slice(3).startsWith('.ctoc/'));
  const index = spawnSync('git', ['ls-files', '-s'], { cwd: root }).stdout.toString('utf8');
  const bytes = {};
  for (const e of status) {
    const rel = e.slice(3);
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && fs.lstatSync(abs).isFile()) bytes[rel] = sha(fs.readFileSync(abs));
  }
  return { status, index, bytes, worktrees: worktrees(root), stash: stashList(root) };
}

/** The bytes of every file outside `.git/` and `.ctoc/`, by path. */
function treeBytes(root, rel = '') {
  const out = {};
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (r === '.git' || r === '.ctoc') continue;
    if (e.isDirectory()) Object.assign(out, treeBytes(root, r));
    else if (e.isFile()) out[r] = sha(fs.readFileSync(path.join(root, r)));
    else if (e.isSymbolicLink()) out[r] = `link:${fs.readlinkSync(path.join(root, r))}`;
  }
  return out;
}

/** Case 24: a refusal changes, stages, stashes or deletes nothing. */
async function refusedUntouched(root, args, clause) {
  const before = snapshot(root);
  const res = await check(root, ...args);
  assert.equal(res.verdict, 'refused', JSON.stringify(res));
  assert.equal(res.text, refusal(clause));
  assert.deepEqual(res.ask, { questions: [] });
  assert.deepEqual(res.actions, {});
  assert.deepEqual(snapshot(root), before);
  return res;
}

const q = (files) => files.map((f) => `'${f}'`).join(' ');

function assertChecking(res, files) {
  assert.equal(res.verdict, 'checking', JSON.stringify(res));
  assert.equal(res.text, STATUS_LINE);
  assert.equal(res.next, `hotfix check --run-tests ${q(files)}`);
  assert.deepEqual(res.ask, { questions: [] });
  assert.deepEqual(res.actions, {});
}

function assertPass(res, files) {
  assert.equal(res.verdict, 'hotfix', JSON.stringify(res));
  assert.equal(res.text, '');
  assert.deepEqual(res.commit.files, files);
  assert.equal(res.commit.add, `git --literal-pathspecs add -- ${q(files)}`);
  assert.equal(res.commit.message, `git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- ${q(files)}`);
  assert.equal(res.detail, undefined, JSON.stringify(res));
  assert.deepEqual(res.ask, { questions: [] });
  assert.deepEqual(res.actions, {});
}

async function buttonWording(root) {
  fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
  const first = await check(root, 'src/pages/home.html');
  const second = await check(root, '--run-tests', 'src/pages/home.html');
  return { first, second };
}

/** Read the single-quoted words of a `commit` command the way a POSIX shell would. */
function shellWords(command) {
  const words = [];
  const re = /'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(command)) !== null) words.push(m[1] !== undefined ? m[1] : m[2]);
  return words;
}

/** Run an answer's `commit.add` then `commit.message` from the project root. */
function runCommit(root, commit, what = 'reword') {
  const env = {
    ...process.env, GIT_AUTHOR_NAME: 'Hotfix Test', GIT_AUTHOR_EMAIL: 'hotfix@test.invalid',
    GIT_COMMITTER_NAME: 'Hotfix Test', GIT_COMMITTER_EMAIL: 'hotfix@test.invalid',
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false'
  };
  for (const cmd of [commit.add, commit.message.replace('<what changed>', what)]) {
    const r = process.platform === 'win32'
      ? spawnSync('git', shellWords(cmd).slice(1), { cwd: root, encoding: 'utf8', env })
      : spawnSync('sh', ['-c', cmd], { cwd: root, encoding: 'utf8', env });
    assert.equal(r.status, 0, `${cmd}: ${r.stderr}`);
  }
}

/** The `ctoc-hotfix-` folder a recorded copy folder lies in. */
function copyParent(folder) {
  let d = folder;
  while (d !== path.dirname(d) && !path.basename(d).startsWith('ctoc-hotfix-')) d = path.dirname(d);
  assert.ok(path.basename(d).startsWith('ctoc-hotfix-'), `${folder} lies in no ctoc-hotfix- folder`);
  return d;
}

/** Register a worktree of the repository's own, then delete its folder: a stale entry. */
function addStaleWorktree(root) {
  const stale = path.join(tmpDir('hotfix-stale-'), 'wt');
  git(root, ['worktree', 'add', '-q', '--detach', stale, 'HEAD']);
  fs.rmSync(stale, { recursive: true, force: true });
  assert.match(worktrees(root), /prunable/);
}

test('case 1 + 26: a button wording change passes in two calls; the process is restored', async () => {
  const root = testedProject();
  fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
  const first = await check(root, 'src/pages/home.html');
  assertChecking(first, ['src/pages/home.html']);
  assert.equal(first.next, "hotfix check --run-tests 'src/pages/home.html'");

  const cwdBefore = process.cwd();
  const logBefore = console.log;
  const second = await check(root, '--run-tests', 'src/pages/home.html');
  assert.equal(process.cwd(), cwdBefore, 'case 26: the working directory is restored');
  assert.equal(console.log, logBefore, 'case 26: console.log is restored');
  assertPass(second, ['src/pages/home.html']);
  assert.equal(second.commit.add, "git --literal-pathspecs add -- 'src/pages/home.html'");
  assert.equal(second.commit.message,
    "git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- 'src/pages/home.html'");
  assert.equal(second.tests, '1 test passed.');
});

test('case 2: a button colour change passes; the commit names only the stylesheet', async () => {
  const root = testedProject({ 'src/styles/button.css': '.save { background-color: #0a58ca; }\n' });
  fs.writeFileSync(path.join(root, 'src/styles/button.css'), '.save { background-color: #0b5ed7; }\n');
  assertChecking(await check(root, 'src/styles/button.css'), ['src/styles/button.css']);
  assertPass(await check(root, '--run-tests', 'src/styles/button.css'), ['src/styles/button.css']);
});

test('case 3: a catalogue value with the same key and placeholder passes', async () => {
  const root = testedProject({ 'locales/en.json': '{\n  "save": "Save {count} items",\n  "cancel": "Cancel"\n}\n' });
  fs.writeFileSync(path.join(root, 'locales/en.json'), '{\n  "save": "Store {count} items",\n  "cancel": "Cancel"\n}\n');
  assertChecking(await check(root, 'locales/en.json'), ['locales/en.json']);
  assertPass(await check(root, '--run-tests', 'locales/en.json'), ['locales/en.json']);
});

test('case 4: other uncommitted work is neither judged nor committed', async () => {
  const plain = testedProject({ 'notes.md': 'Some notes.\n' });
  const a = await buttonWording(plain);
  const busy = testedProject({ 'notes.md': 'Some notes.\n' });
  fs.writeFileSync(path.join(busy, 'notes.md'), 'Some other notes, and many more words.\n');
  const b = await buttonWording(busy);
  assert.deepEqual(b.first, a.first);
  assert.deepEqual(b.second, a.second);
  assert.equal(b.second.verdict, 'hotfix', JSON.stringify(b.second));
  runCommit(busy, b.second.commit);
  assert.equal(git(busy, ['show', '--name-only', '--format=', 'HEAD']).trim(), 'src/pages/home.html');
  assert.match(git(busy, ['status', '--porcelain']), /^ M notes\.md$/m);
});

test('case 5: program logic is refused with the full sentence', async () => {
  const root = testedProject({ 'src/cart.js': 'function ok(items) {\n  if (items.length > 0) return true;\n  return false;\n}\n' });
  fs.writeFileSync(path.join(root, 'src/cart.js'), 'function ok(items) {\n  if (items.length >= 0) return true;\n  return false;\n}\n');
  const res = await refusedUntouched(root, ['src/cart.js'],
    'it changes program logic in src/cart.js, and only wording and colours qualify');
  assert.equal(res.text, 'I did not treat this as a hotfix because it changes program logic in src/cart.js, '
    + 'and only wording and colours qualify; it goes through a normal plan, and your edits stay in place, not committed.');
});

test('case 6: a setting is refused', async () => {
  const root = testedProject({ 'config/app.yaml': 'timeout_seconds: 30\n' });
  fs.writeFileSync(path.join(root, 'config/app.yaml'), 'timeout_seconds: 60\n');
  await refusedUntouched(root, ['config/app.yaml'],
    'it changes a setting in config/app.yaml, and settings changes are a common cause of outages');
});

test('case 7: text inside program code is refused', async () => {
  const root = testedProject({ 'src/server.js': "app.post('/order', (req, res) => {\n  res.send(\"Order saved\");\n});\n" });
  fs.writeFileSync(path.join(root, 'src/server.js'), "app.post('/order', (req, res) => {\n  res.send(\"Order stored\");\n});\n");
  await refusedUntouched(root, ['src/server.js'],
    'it changes text inside program code in src/server.js, and no check can tell whether people read that text or the program depends on it');
});

test('case 8: a price in wording is refused', async () => {
  const root = testedProject({ 'src/pages/home.html': HOME.replace('<button>Save</button>', '<p>Only 9 euro a month</p>') });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME.replace('<button>Save</button>', '<p>Only 7 euro a month</p>'));
  await refusedUntouched(root, ['src/pages/home.html'],
    'the wording in src/pages/home.html contains a number, a price, a web address or an e-mail address');
});

test('case 9: a sensitive area is refused even for wording', async () => {
  const root = testedProject({ 'src/pages/login.html': '<button>Sign in</button>\n' });
  fs.writeFileSync(path.join(root, 'src/pages/login.html'), '<button>Log in</button>\n');
  await refusedUntouched(root, ['src/pages/login.html'],
    'src/pages/login.html sits in an area named login, and such areas are never a hotfix');
});

test('case 10: more than 20 changed lines is refused with the counts', async () => {
  const lines = (word, n) => Array.from({ length: n }, (_, i) => `${word} line ${String.fromCharCode(97 + i)}`).join('\n') + '\n';
  const root = testedProject({ 'docs/one.md': lines('Old', 7), 'docs/two.md': lines('Old', 6) });
  fs.writeFileSync(path.join(root, 'docs/one.md'), lines('New', 6));
  fs.writeFileSync(path.join(root, 'docs/two.md'), lines('New', 6));
  await refusedUntouched(root, ['docs/one.md', 'docs/two.md'],
    'it changes 25 lines in 2 files and a hotfix is at most 20 lines in at most 3 files');
});

test('case 11: a new file is refused', async () => {
  const root = testedProject();
  writeFiles(root, { 'src/pages/about.html': '<p>About</p>\n' });
  await refusedUntouched(root, ['src/pages/about.html'], 'it adds, removes or renames src/pages/about.html');
});

test('case 12: a failing existing test refuses the hotfix and is named (TAP and spec reporters)', async () => {
  for (const reporter of ['tap', 'spec']) {
    const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': FAILING_TEST },
      { testScript: `node --test --test-reporter=${reporter} tests/*.test.js` });
    fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
    assertChecking(await check(root, 'src/pages/home.html'), ['src/pages/home.html']);
    await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'],
      'the existing tests fail (tests/home.test.js: shows Save)');
  }
});

test('case 13: an edited test is refused by both calls and no test runs', async () => {
  const probe = probeDir();
  const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': PASSING_TEST }, { testScript: SCRIPT });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  fs.writeFileSync(path.join(root, 'tests/home.test.js'), PASSING_TEST + '// edited\n');
  await withEnv({ CTOC_HOTFIX_PROBE: probe }, async () => {
    for (const args of [['src/pages/home.html', 'tests/home.test.js'], ['--run-tests', 'src/pages/home.html', 'tests/home.test.js']]) {
      await refusedUntouched(root, args, 'it changes a test (tests/home.test.js)');
    }
  });
  assert.equal(probeRead(probe), null, 'no test was run');
});

test('case 14: a run in which no test ran is not a pass', async () => {
  for (const script of ['node --test empty/*.test.js', 'node -e ""']) {
    const root = makeRepo({ 'src/pages/home.html': HOME, 'empty/.gitkeep': '' }, { testScript: script });
    fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
    assertChecking(await check(root, 'src/pages/home.html'), ['src/pages/home.html']);
    await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'], NO_TEST);
  }
});

test('case 15: a change that cannot be read is refused and never passes', async () => {
  const notRepo = makeRepo({ 'src/pages/home.html': HOME }, { init: false });
  const noCommit = makeRepo({ 'src/pages/home.html': HOME }, { commit: false });
  for (const args of [['src/pages/home.html'], ['--run-tests', 'src/pages/home.html']]) {
    const a = await check(notRepo, ...args);
    assert.equal(a.text, unreadable('this folder is not a git repository'));
    const b = await check(noCommit, ...args);
    assert.equal(b.text, unreadable('this folder has no commit to compare with'));
  }
  const root = testedProject();
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  for (const args of [['src/pages/home.html'], ['--run-tests', 'src/pages/home.html']]) {
    const res = await withEnv({ PATH: tmpDir() }, () => check(root, ...args));
    assert.equal(res.verdict, 'refused');
    assert.equal(res.text, unreadable('git is not installed'));
  }
});

test('case 16: an unrecognised file kind is refused', async () => {
  const root = testedProject({ 'docs/diagram.svg': '<svg>\n<text x="1">Save</text>\n</svg>\n' });
  fs.writeFileSync(path.join(root, 'docs/diagram.svg'), '<svg>\n<text x="1">Store</text>\n</svg>\n');
  await refusedUntouched(root, ['docs/diagram.svg'], 'I do not recognise docs/diagram.svg as wording or a colour');
});

test('case 17: documentation passes from the test call without a test command; markup does not', async () => {
  const root = makeRepo({ 'README.md': '# Fixture\n\nThis is the old wording.\n', 'src/pages/home.html': HOME });
  fs.writeFileSync(path.join(root, 'README.md'), '# Fixture\n\nThis is the new wording.\n');
  assertChecking(await check(root, 'README.md'), ['README.md']);
  const doc = await check(root, '--run-tests', 'README.md');
  assertPass(doc, ['README.md']);
  assert.equal(doc.tests, DOC_ONLY);

  fs.writeFileSync(path.join(root, 'README.md'), '# Fixture\n\nThis is the old wording.\n');
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  assertChecking(await check(root, 'src/pages/home.html'), ['src/pages/home.html']);
  await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'], NO_TEST);
});

test('case 18: the same change checked twice gives the same answers (core.autocrlf=true)', async () => {
  const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': PASSING_TEST },
    { testScript: SCRIPT, autocrlf: true });
  const a = await buttonWording(root);
  const b = await buttonWording(root);
  assert.equal(JSON.stringify(b.first), JSON.stringify(a.first));
  assert.equal(JSON.stringify(b.second), JSON.stringify(a.second));
  assertPass(a.second, ['src/pages/home.html']);
});

test('case 19: Windows line endings do not count as changed lines', async () => {
  const base = Array.from({ length: 30 }, (_, i) => `Line ${String.fromCharCode(97 + (i % 26))} of the guide.`);
  const root = makeRepo({ 'docs/guide.md': base.join('\n') + '\n' });
  const edited = base.slice();
  edited[3] = 'Line d of the handbook.';
  fs.writeFileSync(path.join(root, 'docs/guide.md'), edited.join('\r\n') + '\r\n');
  assertChecking(await check(root, 'docs/guide.md'), ['docs/guide.md']);
  assertPass(await check(root, '--run-tests', 'docs/guide.md'), ['docs/guide.md']);
  const lines = logLines(root);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].lines, 2);
  assert.equal(lines[0].files, 1);
});

test('case 20: a path written with backslashes gives the same answers', async () => {
  const root = testedProject();
  const fwd = await buttonWording(root);
  const back = {
    first: await check(root, 'src\\pages\\home.html'),
    second: await check(root, '--run-tests', 'src\\pages\\home.html')
  };
  assertChecking(back.first, ['src/pages/home.html']);
  assertPass(back.second, ['src/pages/home.html']);
  assert.deepEqual(back.first, fwd.first);
  assert.deepEqual(back.second, fwd.second);
});

test('case 21: a file outside the project is refused', async () => {
  const root = testedProject();
  await refusedUntouched(root, ['../x.html'], 'I could not read the change (../x.html is outside this project)');
  await refusedUntouched(root, ['.'], 'I could not read the change (. is outside this project)');
});

test('case 22: a named unchanged file, and nothing changed at all', async () => {
  const root = testedProject();
  await refusedUntouched(root, ['src/pages/home.html'],
    'I could not read the change (src/pages/home.html holds no change that git would commit)');
  await refusedUntouched(root, [], 'I could not read the change (nothing has changed since the last commit)');
});

test('case 23: a binary file is not text', async () => {
  const root = testedProject({ 'docs/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]) });
  fs.writeFileSync(path.join(root, 'docs/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x03]));
  await refusedUntouched(root, ['docs/logo.png'], 'I could not read the change (docs/logo.png is not text)');
});

test('case 24: nothing in the project is touched, also when its own tests write and stage files', async () => {
  // The fixture's test writes out/report.txt and runs `git add -A` in the folder it runs in.
  const writer = "  fs.mkdirSync('out', { recursive: true });\n"
    + "  fs.writeFileSync(path.join('out', 'report.txt'), 'report');\n"
    + "  require('child_process').execFileSync('git', ['add', '-A'], { stdio: 'ignore' });\n";
  const fixtures = [
    [nodeTest('has a button', writer + "  assert.ok(read('src/pages/home.html').includes('<button>'));"), 'hotfix'],
    [nodeTest('shows Save', writer + "  assert.ok(read('src/pages/home.html').includes('Save'));"), 'refused']
  ];
  for (const [body, verdict] of fixtures) {
    const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': body, 'docs/untouched.md': 'Never edited.\n' },
      { testScript: SCRIPT });
    fs.writeFileSync(path.join(root, 'docs/untouched.md'), 'A stashed edit.\n');
    git(root, ['stash', '-q']);
    fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
    for (const args of [[], ['--run-tests']]) {
      // The situation in which git rewrote `.git/index` under every option tried (Decision
      // 44): a committed file whose modification time moved while its content did not.
      const moved = new Date(Date.now() - 60000);
      fs.utimesSync(path.join(root, 'docs/untouched.md'), moved, moved);
      const index = fs.readFileSync(path.join(root, '.git', 'index'));
      const files = treeBytes(root);
      const stash = stashList(root);
      const wts = worktrees(root);
      const res = await check(root, ...args);
      assert.ok(fs.readFileSync(path.join(root, '.git', 'index')).equals(index), `${args}: .git/index unchanged`);
      assert.deepEqual(treeBytes(root), files, `${args}: no file outside .git/ and .ctoc/ changed`);
      assert.equal(stashList(root), stash);
      assert.equal(stash.split('\n').filter(Boolean).length, 1);
      assert.equal(worktrees(root), wts);
      assert.deepEqual(leftovers(), []);
      assert.equal(res.verdict, args.length ? verdict : 'checking', JSON.stringify(res));
    }
  }
});

test('case 25: through the real menu process, standard output is exactly one JSON document', () => {
  const root = tmpDir();
  git(root, ['init', '-q']);
  const env = { ...process.env, TMPDIR: PRIVATE_TMP, TEMP: PRIVATE_TMP, TMP: PRIVATE_TMP };
  delete env.CLAUDE_PROJECT_DIR;
  delete env.NODE_TEST_CONTEXT;
  const bare = spawnSync(NODE, [START], { cwd: root, encoding: 'utf8', env });
  assert.equal(bare.status, 0, bare.stderr);
  writeFiles(root, {
    'src/pages/home.html': HOME,
    'tests/home.test.js': PASSING_TEST,
    'package.json': packageJson(SCRIPT)
  });
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'base']);
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);

  const first = spawnSync(NODE, [START, 'hotfix', 'check', 'src/pages/home.html'], { cwd: root, encoding: 'utf8', env });
  assert.equal(first.status, 0, first.stderr);
  assertChecking(JSON.parse(first.stdout), ['src/pages/home.html']);
  const second = spawnSync(NODE, [START, 'hotfix', 'check', '--run-tests', 'src/pages/home.html'], { cwd: root, encoding: 'utf8', env });
  assert.equal(second.status, 0, second.stderr);
  assertPass(JSON.parse(second.stdout), ['src/pages/home.html']);
});

test('case 27: an unknown sub-command or option answers the usage text', async () => {
  const root = testedProject();
  const a = await route(['hotfix', 'frobnicate'], root);
  assert.equal(a.ok, false);
  assert.equal(a.text, `Unknown hotfix command: frobnicate. ${USAGE}`);
  assert.deepEqual(a.ask, { questions: [] });
  assert.deepEqual(a.actions, {});
  const b = await check(root, '--bogus');
  assert.equal(b.ok, false);
  assert.equal(b.text, `Unknown hotfix command: --bogus. ${USAGE}`);
  const c = await route(['hotfix'], root);
  assert.equal(c.ok, false);
  assert.equal(c.text, `Unknown hotfix command: (none). ${USAGE}`);
  assert.deepEqual(logLines(root), [], 'the usage answer writes no log line');
});

test('case 28: the log counts verdicts and causes, holds no names or wording, and never changes an answer', async () => {
  const cart = 'function ok(items) {\n  if (items.length > 0) return true;\n  return false;\n}\n';
  const root = testedProject({ 'src/cart.js': cart, 'notes.md': 'Some notes.\n' });
  fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
  await check(root, 'src/pages/home.html');
  assert.deepEqual(logLines(root), [], 'a checking answer writes no log line');
  await check(root, '--run-tests', 'src/pages/home.html');
  let lines = logLines(root);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].verdict, 'hotfix');
  assert.equal(lines[0].cause, null);
  assert.equal(lines[0].urgent, false);
  assert.equal(lines[0].files, 1);
  assert.equal(lines[0].lines, 2);
  assert.match(lines[0].at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME);
  fs.writeFileSync(path.join(root, 'src/cart.js'), cart.replace('> 0', '>= 0'));
  fs.writeFileSync(path.join(root, 'notes.md'), 'Other notes.\n');
  await check(root, 'src/cart.js');
  lines = logLines(root);
  assert.equal(lines.length, 2);
  assert.equal(lines[1].verdict, 'refused');
  assert.equal(lines[1].cause, 'program-logic');
  assert.equal(lines[1].urgent, false);
  await route(['hotfix', 'frobnicate'], root);
  assert.equal(logLines(root).length, 2, 'the usage answer appends nothing');
  const raw = fs.readFileSync(path.join(root, LOG), 'utf8');
  for (const leak of ['src/', 'home', 'Save', 'Store', 'notes', 'cart']) assert.equal(raw.includes(leak), false, `log holds ${leak}`);
  for (const l of logLines(root)) assert.deepEqual(Object.keys(l).sort(), ['at', 'cause', 'files', 'lines', 'urgent', 'verdict']);

  const reference = await buttonWording(testedProject());
  const blocked = testedProject();
  fs.mkdirSync(path.join(blocked, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(blocked, '.ctoc', 'logs'), 'not a folder');
  const answers = await buttonWording(blocked);
  assert.deepEqual(answers.first, reference.first);
  assert.deepEqual(answers.second, reference.second);
  assert.equal(fs.readFileSync(path.join(blocked, '.ctoc', 'logs'), 'utf8'), 'not a folder');
});

const FLAGS_TEST = nodeTest('flags are on', "  assert.equal(read('config/flags.txt').trim(), 'on');", { marker: 'flags.txt' });

test('case 29: an unrelated uncommitted edit that would make a test fail does not change the verdict', async () => {
  const twin = testedProject({ 'config/flags.txt': 'on\n', 'tests/flags.test.js': FLAGS_TEST });
  const reference = await buttonWording(twin);
  assertPass(reference.second, ['src/pages/home.html']);
  const root = testedProject({ 'config/flags.txt': 'on\n', 'tests/flags.test.js': FLAGS_TEST });
  fs.writeFileSync(path.join(root, 'config/flags.txt'), 'off\n');
  const answers = await buttonWording(root);
  assert.deepEqual(answers.first, reference.first);
  assert.deepEqual(answers.second, reference.second);
});

test('case 30: the test command comes only from tracked files', async () => {
  const alwaysPass = "process.stdout.write('\\u2139 pass 5\\n\\u2139 fail 0\\n');\n";
  const config = 'languages:\n  javascript:\n    test: node always-pass.js\n';
  // (a) an ignored local quality setting
  const a = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': FAILING_TEST, 'always-pass.js': alwaysPass,
    '.gitignore': '.ctoc/quality-config.yaml\n' }, { testScript: SCRIPT });
  writeFiles(a, { '.ctoc/quality-config.yaml': config });
  fs.writeFileSync(path.join(a, 'src/pages/home.html'), HOME_STORE);
  await refusedUntouched(a, ['--run-tests', 'src/pages/home.html'], 'the existing tests fail (tests/home.test.js: shows Save)');
  // (b) an uncommitted change to a committed quality setting, not named
  const b = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': FAILING_TEST, 'always-pass.js': alwaysPass,
    '.ctoc/quality-config.yaml': '# quality settings\n' }, { testScript: SCRIPT });
  fs.writeFileSync(path.join(b, '.ctoc/quality-config.yaml'), config);
  fs.writeFileSync(path.join(b, 'src/pages/home.html'), HOME_STORE);
  await refusedUntouched(b, ['--run-tests', 'src/pages/home.html'], 'the existing tests fail (tests/home.test.js: shows Save)');
});

test('case 31: the check\'s own log never enters the change', async () => {
  const root = testedProject();
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  const run1 = { first: await check(root), second: await check(root, '--run-tests') };
  assert.equal(logLines(root).length, 1, 'the first run left its log');
  const run2 = { first: await check(root), second: await check(root, '--run-tests') };
  assert.deepEqual(run2.first, run1.first);
  assert.deepEqual(run2.second, run1.second);
});

test('case 32: the commit takes only the judged files; a staged unrelated file stays staged', async () => {
  const root = testedProject({ 'docs/other.md': 'Other page.\n' });
  fs.writeFileSync(path.join(root, 'docs/other.md'), 'Other page, staged.\n');
  git(root, ['add', 'docs/other.md']);
  fs.writeFileSync(path.join(root, 'docs/other.md'), 'Other page.\n');
  const { second } = await buttonWording(root);
  assertPass(second, ['src/pages/home.html']);
  runCommit(root, second.commit);
  assert.equal(git(root, ['show', '--name-only', '--format=', 'HEAD']).trim(), 'src/pages/home.html');
  assert.equal(git(root, ['log', '-1', '--format=%s']).trim(), 'hotfix: reword');
  assert.equal(git(root, ['diff', '--cached', '--name-only']).trim(), 'docs/other.md');
});

test('case 33: a project folder outside the repository git reports is refused', async () => {
  const root = testedProject();
  const sibling = tmpDir('hotfix-elsewhere-');
  git(root, ['config', 'core.worktree', sibling]);
  for (const args of [['src/pages/home.html'], ['--run-tests', 'src/pages/home.html']]) {
    const res = await check(root, ...args);
    assert.equal(res.text, unreadable('this folder lies outside the repository git reports'), JSON.stringify(res));
  }
});

test('case 34: a fault inside the check is "the check stopped", its message in detail', async () => {
  const root = testedProject();
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  fs.writeFileSync(path.join(root, '.git', 'index'), 'not an index');
  for (const args of [['src/pages/home.html'], ['--run-tests', 'src/pages/home.html']]) {
    const res = await check(root, ...args);
    assert.equal(res.verdict, 'refused');
    assert.equal(res.text, unreadable('the check stopped'));
    assert.equal(typeof res.detail, 'string');
    assert.ok(res.detail.length > 0 && res.detail.length <= 200, res.detail);
    assert.equal(/[\u0000-\u001f\u007f-\u009f]/.test(res.detail), false);
  }
  const lines = logLines(root);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.cause === 'unreadable' && l.files === 0 && l.lines === 0));
  assert.equal(fs.readFileSync(path.join(root, LOG), 'utf8').includes('index'), false, 'detail never reaches the log');
});

test('case 35: git settings in the repository change no answer', async (t) => {
  const guide = ['# Guide', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', ''].join('\n');
  const edit = (root) => fs.writeFileSync(path.join(root, 'docs/guide.md'),
    guide.replace('one', 'uno').replace('four', 'cuatro'));
  const both = async (root, args) => ({
    first: await check(root, ...args), second: await check(root, '--run-tests', ...args), log: withoutTime(logLines(root))
  });
  const settings = [['diff.noprefix', 'true'], ['diff.mnemonicPrefix', 'true'], ['diff.interHunkContext', '10'],
    ['diff.algorithm', 'histogram'], ['diff.relative', 'true'], ['diff.context', '5'], ['color.diff', 'always']];
  const plain = makeRepo({ 'docs/guide.md': guide });
  const set = makeRepo({ 'docs/guide.md': guide }, { config: settings });
  edit(plain);
  edit(set);
  await t.test('(a) the diff settings', async () => {
    const reference = await both(plain, ['docs/guide.md']);
    assert.equal(reference.log[reference.log.length - 1].lines, 4);
    assert.deepEqual(await both(set, ['docs/guide.md']), reference);
    assert.equal(reference.second.verdict, 'hotfix', JSON.stringify(reference.second));
  });
  await t.test('(b) diff.autoRefreshIndex=false beside a file whose modification time moved', async () => {
    const make = (config) => {
      const root = makeRepo({ 'docs/guide.md': guide, 'docs/other.md': 'Other.\n' }, { config });
      edit(root);
      const later = new Date(Date.now() + 60000);
      fs.utimesSync(path.join(root, 'docs/other.md'), later, later);
      return root;
    };
    const refB = await both(make([]), []);
    assert.deepEqual(await both(make([['diff.autoRefreshIndex', 'false']]), []), refB);
    assertPass(refB.second, ['docs/guide.md']);
  });
});

test('case 36: a failure reported on standard error only is read', async () => {
  const fakeJest = "process.stdout.write('Determining test suites to run...\\n');\n"
    + "process.stderr.write('FAIL tests/home.test.js\\n  \\u25cf shows Save\\n');\nprocess.exit(1);\n";
  const root = makeRepo({ 'src/pages/home.html': HOME, 'fake-jest.js': fakeJest }, { testScript: 'node fake-jest.js' });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'], 'the existing tests fail (tests/home.test.js: shows Save)');
});

test('case 37: npm\'s placeholder test script is "no test ran"', async () => {
  const root = makeRepo({ 'src/pages/home.html': HOME }, { testScript: 'echo "Error: no test specified" && exit 1' });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'], NO_TEST);
});

test('case 38: a test runner that is not installed is "no test ran"', async () => {
  const root = makeRepo({ 'src/pages/home.html': HOME,
    '.ctoc/quality-config.yaml': 'languages:\n  javascript:\n    test: ctoc-no-such-runner\n' }, { testScript: SCRIPT });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'], NO_TEST);
});

test('case 39: a log above 1 MiB is rotated by renaming', async () => {
  const root = makeRepo({ 'README.md': 'Old wording.\n' });
  const old = Buffer.from(`${'x'.repeat(1024 * 1024)}\n`);
  assert.equal(old.length, 1024 * 1024 + 1);
  fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true });
  fs.writeFileSync(path.join(root, LOG), old);
  fs.writeFileSync(path.join(root, 'README.md'), 'New wording.\n');
  await check(root, 'README.md');
  assertPass(await check(root, '--run-tests', 'README.md'), ['README.md']);
  assert.ok(fs.readFileSync(path.join(root, `${LOG}.1`)).equals(old), 'the old log is kept whole under .1');
  const lines = logLines(root);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].verdict, 'hotfix');
});

test('case 40: a log that is a hard link is never written', async () => {
  const outside = path.join(tmpDir('hotfix-outside-'), 'outside.txt');
  const bytes = Buffer.from(`${'y'.repeat(1024 * 1024)}\n`);
  fs.writeFileSync(outside, bytes);
  const reference = makeRepo({ 'README.md': 'Old wording.\n' });
  const root = makeRepo({ 'README.md': 'Old wording.\n' });
  fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true });
  fs.linkSync(outside, path.join(root, LOG));
  const answers = [];
  for (const r of [reference, root]) {
    fs.writeFileSync(path.join(r, 'README.md'), 'New wording.\n');
    answers.push([await check(r, 'README.md'), await check(r, '--run-tests', 'README.md')]);
  }
  assert.deepEqual(answers[1], answers[0]);
  assertPass(answers[1][1], ['README.md']);
  assert.ok(fs.readFileSync(outside).equals(bytes), 'the linked file is unchanged');
  assert.equal(fs.existsSync(path.join(root, `${LOG}.1`)), false);
});

test('case 41: the log is never written through a symbolic link', async () => {
  const outside = tmpDir('hotfix-victim-');
  const victim = path.join(outside, 'victim.txt');
  fs.writeFileSync(victim, 'precious\n');
  const variants = [
    (root) => { fs.symlinkSync(outside, path.join(root, '.ctoc'), 'dir'); },
    (root) => { fs.mkdirSync(path.join(root, '.ctoc')); fs.symlinkSync(outside, path.join(root, '.ctoc', 'logs'), 'dir'); },
    (root) => { fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true }); fs.symlinkSync(victim, path.join(root, LOG)); },
    // A dangling link: it points at a file that does not exist yet.
    (root) => { fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true }); fs.symlinkSync(path.join(outside, 'created.txt'), path.join(root, LOG)); }
  ];
  const both = async (root) => {
    fs.writeFileSync(path.join(root, 'README.md'), 'New wording.\n');
    return [await check(root, 'README.md'), await check(root, '--run-tests', 'README.md')];
  };
  const reference = await both(makeRepo({ 'README.md': 'Old wording.\n' }));
  assert.equal(reference[1].verdict, 'hotfix', JSON.stringify(reference[1]));
  for (const plant of variants) {
    const root = makeRepo({ 'README.md': 'Old wording.\n' });
    let planted = true;
    try { plant(root); } catch { planted = false; } // a platform that cannot make links has no such attack
    assert.deepEqual(await both(root), reference);
    assert.equal(fs.readFileSync(victim, 'utf8'), 'precious\n');
    assert.deepEqual(fs.readdirSync(outside).sort(), ['victim.txt']);
    if (!planted) assert.equal(logLines(root).length, 1);
  }
});

test('case 42: an unrelated uncommitted edit that a test needs makes the hotfix fail', async () => {
  const root = testedProject({ 'config/flags.txt': 'off\n', 'tests/flags.test.js': FLAGS_TEST });
  fs.writeFileSync(path.join(root, 'config/flags.txt'), 'on\n');
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'], 'the existing tests fail (tests/flags.test.js: flags are on)');
});

/** The quality agent's timeout result, as `runFullTests` answers it. */
const TIMEOUT_RESULT = { passed: false, undetermined: true, passCount: 0, failed: 0, skipped: 0, flaky: 0, output: 'javascript tests timed out' };

test('case 43: the copy is gone after a pass, a refusal, failing tests, a timeout and a thrown error', async (t) => {
  const probe = probeDir();
  const PROBE_SCRIPT = "require('fs').writeFileSync(require('path').join(process.env.CTOC_HOTFIX_PROBE, 'ran.txt'), process.cwd());\n";
  const runs = [
    ['pass', () => testedProject(), (res) => assertPass(res, ['src/pages/home.html'])],
    ['refusal after the copy exists', () => makeRepo({ 'src/pages/home.html': HOME, 'probe.js': PROBE_SCRIPT }, { testScript: 'node probe.js' }),
      (res) => assert.equal(res.text, refusal(NO_TEST))],
    ['failing tests', () => makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': FAILING_TEST }, { testScript: SCRIPT }),
      (res) => assert.equal(res.text, refusal('the existing tests fail (tests/home.test.js: shows Save)'))],
    ['a timeout', () => testedProject(), (res) => assert.equal(res.text, refusal(NO_TEST)), () => TIMEOUT_RESULT],
    ['a thrown error', () => testedProject(), (res) => {
      assert.equal(res.text, unreadable('the check stopped'));
      assert.match(res.detail, /runner exploded/);
    }, () => { throw new Error('runner exploded'); }]
  ];
  for (const [label, make, expect, replacement] of runs) await t.test(label, async () => {
    const root = make();
    addStaleWorktree(root);
    const before = worktrees(root);
    fs.rmSync(path.join(probe, 'ran.txt'), { force: true });
    fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
    if (replacement) {
      t.mock.method(qualityAgent, 'runFullTests', async () => {
        fs.writeFileSync(path.join(probe, 'ran.txt'), process.cwd());
        return replacement();
      });
    }
    const res = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(root, '--run-tests', 'src/pages/home.html'));
    t.mock.restoreAll();
    const folder = probeRead(probe);
    assert.ok(folder, `${label}: the tests ran`);
    assert.notEqual(folder, root, `${label}: the tests ran in a copy`);
    assert.equal(fs.existsSync(folder), false, `${label}: the copy is gone`);
    assert.equal(fs.existsSync(copyParent(folder)), false, `${label}: its folder is gone`);
    assert.equal(worktrees(root), before, `${label}: the worktree list is as before, the stale entry still listed`);
    expect(res);
  });
  await t.test('a copy that cannot be removed is named in detail; the verdict stands', async () => {
  const root = testedProject();
  const before = worktrees(root);
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  const realRm = fs.rmSync;
  t.mock.method(fs, 'rmSync', (p, options) => {
    if (path.basename(String(p)).startsWith('ctoc-hotfix-')) {
      throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });
    }
    return realRm(p, options);
  });
  const res = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(root, '--run-tests', 'src/pages/home.html'));
  t.mock.restoreAll();
  const parent = copyParent(probeRead(probe));
  assert.equal(res.verdict, 'hotfix');
  assert.equal(res.text, '');
  assert.equal(res.detail, `the temporary copy at ${parent} could not be removed: EBUSY: resource busy`);
  assert.equal(worktrees(root), before, 'the worktree was removed before the folder');
  fs.rmSync(parent, { recursive: true, force: true });
  });
});

test('case 44: a change that does not apply cleanly to a fresh copy is refused and runs no test', async () => {
  const probe = probeDir();
  const shout = path.join(tmpDir('hotfix-filter-'), 'shout.js');
  fs.writeFileSync(shout, "let s = '';\nprocess.stdin.on('data', (d) => { s += d; });\nprocess.stdin.on('end', () => process.stdout.write(s.toUpperCase()));\n");
  const root = makeRepo({ 'docs/guide.md': 'Read this guide first.\n', '.gitattributes': 'docs/*.md filter=shout\n',
    'src/pages/home.html': HOME, 'tests/home.test.js': PASSING_TEST }, { testScript: SCRIPT });
  const fwd = (p) => p.split(path.sep).join('/');
  git(root, ['config', 'filter.shout.smudge', `"${fwd(NODE)}" "${fwd(shout)}"`]);
  fs.writeFileSync(path.join(root, 'docs/guide.md'), 'Read this handbook first.\n');
  const before = worktrees(root);
  assertChecking(await check(root, 'docs/guide.md'), ['docs/guide.md']);
  const res = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(root, '--run-tests', 'docs/guide.md'));
  assert.equal(res.text, unreadable('the change does not apply cleanly to a fresh copy of the last commit'), JSON.stringify(res));
  assert.equal(typeof res.detail, 'string');
  assert.ok(res.detail.length > 0 && !res.detail.includes('\n'), res.detail);
  assert.equal(logLines(root).pop().cause, 'unreadable');
  assert.equal(probeRead(probe), null, 'the project\'s test never ran');
  assert.equal(worktrees(root), before);
});

/** Case 45's project: ignored installed-package folders, and a build folder that is never linked. */
function linkedProject(testBody, extra = {}) {
  const root = makeRepo({
    'src/pages/home.html': HOME,
    'packages/a/index.js': 'module.exports = 1;\n',
    '.gitignore': 'node_modules/\n.venv/\nbuild/\n',
    'tests/home.test.js': nodeTest('greets', testBody),
    ...extra
  }, { testScript: SCRIPT });
  writeFiles(root, {
    'node_modules/greet/package.json': '{"name":"greet","main":"index.js"}\n',
    'node_modules/greet/index.js': "module.exports = 'hello';\n",
    'packages/a/node_modules/x/index.js': 'module.exports = 2;\n',
    '.venv/pyvenv.cfg': 'home = /usr/bin\n',
    'build/out.txt': 'built\n'
  });
  return root;
}
const LINK_REPORT = "  assert.equal(require('greet'), 'hello');\n"
  + "  const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };\n"
  + "  fs.writeFileSync(path.join(probe, 'links.json'), JSON.stringify({ node_modules: isLink('node_modules'),"
  + " nested: isLink(path.join('packages', 'a', 'node_modules')), venv: isLink('.venv'), build: fs.existsSync('build') }));\n";

test('case 45: installed-package folders are linked into the copy, one link each, and left intact', async (t) => {
  const probe = probeDir();
  await t.test('(a) one link each, a directory link, no build folder, the owner\'s folders intact', async () => {
  const root = linkedProject(LINK_REPORT);
  const owned = () => ({ ...treeBytes(path.join(root, 'node_modules')), ...treeBytes(path.join(root, 'packages', 'a', 'node_modules')),
    ...treeBytes(path.join(root, '.venv')) });
  const before = owned();
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  const res = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(root, '--run-tests', 'src/pages/home.html'));
  assert.notEqual(probeRead(probe), root, 'the tests ran in a copy');
  assert.deepEqual(JSON.parse(probeRead(probe, 'links.json')), { node_modules: true, nested: true, venv: true, build: false });
  assert.deepEqual(owned(), before, 'the owner\'s package folders are byte-identical');
  assertPass(res, ['src/pages/home.html']);
  });
  await t.test('(b) a link the tests removed counts as removed', async () => {
  const removing = linkedProject(LINK_REPORT
    + "  if (fs.lstatSync('node_modules').isSymbolicLink()) fs.unlinkSync('node_modules');\n");
  const greet = treeBytes(path.join(removing, 'node_modules'));
  fs.writeFileSync(path.join(removing, 'src/pages/home.html'), HOME_STORE);
  const res2 = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(removing, '--run-tests', 'src/pages/home.html'));
  const folder = probeRead(probe);
  assert.equal(fs.existsSync(folder), false);
  assert.equal(fs.existsSync(copyParent(folder)), false);
  assert.deepEqual(treeBytes(path.join(removing, 'node_modules')), greet);
  assertPass(res2, ['src/pages/home.html']);
  });
});

test('case 46: on Windows the links are directory junctions, elsewhere directory links', async (t) => {
  const root = linkedProject("  assert.equal(require('greet'), 'hello');\n",
    { '.ctoc/quality-config.yaml': `languages:\n  javascript:\n    test: "${NODE}" --test tests/home.test.js\n` });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  const expected = ['node_modules', 'packages/a/node_modules', '.venv']
    .map((rel) => fs.realpathSync.native(path.join(root, ...rel.split('/')))).sort();
  const record = async (platform) => {
    const calls = [];
    const real = fs.symlinkSync;
    t.mock.method(fs, 'symlinkSync', (target, p, type) => { calls.push([target, type]); return real(target, p, type); });
    const saved = Object.getOwnPropertyDescriptor(process, 'platform');
    try {
      if (platform) Object.defineProperty(process, 'platform', { value: platform, configurable: true });
      await check(root, '--run-tests', 'src/pages/home.html');
    } finally {
      Object.defineProperty(process, 'platform', saved);
      t.mock.restoreAll();
    }
    return calls;
  };
  const windows = await record('win32');
  assert.equal(windows.length, 3, JSON.stringify(windows));
  assert.deepEqual(windows.map(([target]) => target).sort(), expected);
  assert.ok(windows.every(([, type]) => type === 'junction'));
  const here = await record(null);
  assert.deepEqual(here.map(([target]) => target).sort(), expected);
  assert.ok(here.every(([, type]) => type === 'dir'));
});

test('case 47: a judged file that changes during the check is refused', async (t) => {
  const probe = probeDir();
  await t.test('(a) while the tests run', async () => {
  const edits = nodeTest('has a button', "  if (process.env.CTOC_HOTFIX_EDIT) fs.appendFileSync(process.env.CTOC_HOTFIX_EDIT, ' again');\n"
    + "  assert.ok(read('src/pages/home.html').includes('<button>'));");
  const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': edits }, { testScript: SCRIPT });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  const res = await withEnv({ CTOC_HOTFIX_EDIT: path.join(root, 'src', 'pages', 'home.html'), CTOC_HOTFIX_PROBE: probe },
    () => check(root, '--run-tests', 'src/pages/home.html'));
  assert.equal(res.text, unreadable('src/pages/home.html changed while it was being checked'), JSON.stringify(res));
  assert.equal(logLines(root).pop().cause, 'unreadable');
  assert.ok(probeRead(probe), 'the tests ran');
  });
  await t.test('(b) after the first hashing and before the content reaches the copy', async () => {
  fs.rmSync(path.join(probe, 'ran.txt'), { force: true });
  const other = testedProject();
  fs.writeFileSync(path.join(other, 'src/pages/home.html'), HOME_STORE);
  const realMkdir = safeFs.mkdirSync;
  let first = true;
  t.mock.method(safeFs, 'mkdirSync', (p, options) => {
    if (first) {
      first = false;
      fs.appendFileSync(path.join(other, 'src', 'pages', 'home.html'), ' again');
    }
    return realMkdir(p, options);
  });
  const res2 = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(other, '--run-tests', 'src/pages/home.html'));
  t.mock.restoreAll();
  assert.equal(res2.text, unreadable('src/pages/home.html changed while it was being checked'), JSON.stringify(res2));
  assert.equal(probeRead(probe), null, 'the project\'s test never ran');
  });
});

test('case 48: a name the commit command cannot carry is refused', async () => {
  const committedAndChanged = (name) => {
    const root = makeRepo({ 'README.md': 'Readme.\n' });
    if (process.platform === 'win32' && /["\\\t]/.test(name)) {
      const blob = git(root, ['hash-object', '-w', '--stdin'], 'Old wording.\n').trim();
      git(root, ['-c', 'core.protectNTFS=false', 'update-index', '--add', '--cacheinfo', `100644,${blob},${name}`]);
      git(root, ['commit', '-q', '-m', 'name']);
    } else if (/["\\\t]/.test(name)) {
      fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
      const blob = git(root, ['hash-object', '-w', '--stdin'], 'Old wording.\n').trim();
      git(root, ['update-index', '--add', '--cacheinfo', `100644,${blob},${name}`]);
      git(root, ['commit', '-q', '-m', 'name']);
      fs.writeFileSync(path.join(root, ...name.split('/')), 'New wording.\n');
    } else {
      writeFiles(root, { [name]: 'Old wording.\n' });
      git(root, ['add', '-A']);
      git(root, ['commit', '-q', '-m', 'name']);
      fs.writeFileSync(path.join(root, ...name.split('/')), 'New wording.\n');
    }
    return root;
  };
  const names = [["docs/it's.md", "docs/it's.md"], ['docs/a$b.md', 'docs/a$b.md'], ['docs/a`b.md', 'docs/a`b.md'],
    ['docs/a"b.md', 'docs/a"b.md'], ['docs/a\\b.md', 'docs/a\\b.md'], ['docs/a\tb.md', 'docs/a b.md']];
  for (const [name, shown] of names) {
    const root = committedAndChanged(name);
    const res = await check(root);
    assert.equal(res.text, unreadable(`${shown} has a name the commit command cannot carry`), JSON.stringify(res));
  }
});

/** Cases 49, 50 and 52: a workspace package linked from an ignored node_modules. */
function workspaceProject(linkAt = 'greet', requireAs = 'greet', extra = {}) {
  const root = makeRepo({
    'src/pages/home.html': HOME,
    'packages/greet/package.json': '{"name":"greet","main":"index.js"}\n',
    'packages/greet/index.js': "module.exports = 'hello';\n",
    '.gitignore': 'node_modules/\n',
    'tests/home.test.js': nodeTest('greets', `  assert.equal(require(${JSON.stringify(requireAs)}), 'hello');`),
    ...extra
  }, { testScript: SCRIPT });
  const link = path.join(root, 'node_modules', ...linkAt.split('/'));
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(fs.realpathSync.native(path.join(root, 'packages', 'greet')), link, process.platform === 'win32' ? 'junction' : 'dir');
  return root;
}

test('case 49: other uncommitted work behind a workspace link is refused and runs no test', async () => {
  const probe = probeDir();
  for (const [linkAt, requireAs] of [['greet', 'greet'], ['@acme/greet', '@acme/greet']]) {
    const root = workspaceProject(linkAt, requireAs);
    fs.appendFileSync(path.join(root, 'packages', 'greet', 'index.js'), '// an unrelated edit\n');
    fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
    const res = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(root, '--run-tests', 'src/pages/home.html'));
    assert.equal(res.text, unreadable('other uncommitted work is in code the tests load through installed packages: packages/greet'),
      JSON.stringify(res));
    assert.equal(logLines(root).pop().cause, 'unreadable');
    assert.equal(probeRead(probe), null, 'no test ran');
  }
});

test('case 50: the same workspace link with no other work passes, and the test ran in the copy', async () => {
  const probe = probeDir();
  const root = workspaceProject();
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  const res = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(root, '--run-tests', 'src/pages/home.html'));
  assert.ok(probeRead(probe));
  assert.notEqual(probeRead(probe), root, 'the tests ran in a copy');
  assertPass(res, ['src/pages/home.html']);
});

test('case 51: other uncommitted work behind an editable Python install is refused', async () => {
  const site = process.platform === 'win32' ? ['.venv', 'Lib', 'site-packages'] : ['.venv', 'lib', 'python3.12', 'site-packages'];
  const make = () => {
    const root = testedProject({ 'pylib/mylib/__init__.py': 'NAME = "old"\n', '.gitignore': '.venv/\n' });
    writeFiles(root, { '.venv/pyvenv.cfg': 'home = /usr/bin\n' });
    fs.mkdirSync(path.join(root, ...site), { recursive: true });
    fs.writeFileSync(path.join(root, 'pylib/mylib/__init__.py'), 'NAME = "new"\n');
    fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
    return root;
  };
  const pth = make();
  fs.writeFileSync(path.join(pth, ...site, '_mylib.pth'),
    `# an editable install\nimport site\n${fs.realpathSync.native(path.join(pth, 'pylib'))}\n`);
  assert.equal((await check(pth, '--run-tests', 'src/pages/home.html')).text,
    unreadable('other uncommitted work is in code the tests load through installed packages: pylib'));
  const finder = make();
  const mylib = fs.realpathSync.native(path.join(finder, 'pylib', 'mylib')).replace(/\\/g, '\\\\');
  fs.writeFileSync(path.join(finder, ...site, '__editable___mylib_finder.py'), `MAPPING = {'mylib': '${mylib}'}\n`);
  assert.equal((await check(finder, '--run-tests', 'src/pages/home.html')).text,
    unreadable('other uncommitted work is in code the tests load through installed packages: pylib/mylib'));
});

test('case 52: a judged file under a linked package passes, and the test ran in the copy', async () => {
  const probe = probeDir();
  const root = workspaceProject('greet', 'greet', { 'packages/greet/README.md': 'Greets you.\n' });
  fs.writeFileSync(path.join(root, 'packages/greet/README.md'), 'Welcomes you.\n');
  const res = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(root, '--run-tests', 'packages/greet/README.md'));
  assert.notEqual(probeRead(probe), root, 'the tests ran in a copy');
  assertPass(res, ['packages/greet/README.md']);
});

test('case 53: a link whose parent lies outside the copy stops the check before any test runs', async () => {
  const probe = probeDir();
  const outside = tmpDir('hotfix-outside-');
  const root = linkedProject(LINK_REPORT, { '.gitignore': 'node_modules/\n.venv/\nbuild/\n' });
  const blob = git(root, ['hash-object', '-w', '--stdin'], outside).trim();
  git(root, ['update-index', '--add', '--cacheinfo', `120000,${blob},vendor`]);
  git(root, ['commit', '-q', '-m', 'vendor is a link']);
  writeFiles(root, { 'vendor/node_modules/x/index.js': 'module.exports = 3;\n' });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  const res = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(root, '--run-tests', 'src/pages/home.html'));
  assert.equal(res.text, unreadable('the check stopped'), JSON.stringify(res));
  assert.equal(res.detail, 'vendor/node_modules');
  assert.equal(probeRead(probe), null, 'no test ran');
  assert.deepEqual(fs.readdirSync(outside), [], 'nothing was made outside the copy');
});

// Every branch of the check exercised (the trial build's cases, moved to the new contract).

test('a file that is not valid UTF-8 is not text', async () => {
  const root = makeRepo({ 'docs/latin.md': Buffer.from('Café old\n', 'latin1') });
  fs.writeFileSync(path.join(root, 'docs/latin.md'), Buffer.from('Café new\n', 'latin1'));
  await refusedUntouched(root, ['docs/latin.md'], 'I could not read the change (docs/latin.md is not text)');
});

test('a name with spaces, a star and letters beyond ASCII passes, and commit.add stages exactly it', async () => {
  // A star cannot stand in a Windows file name; there the name keeps its space and letters.
  const name = process.platform === 'win32' ? 'docs/a plan é.md' : 'docs/a plan é *.md';
  const root = makeRepo({ [name]: 'Old wording.\n', 'docs/a plan é x.md': 'Other.\n' });
  fs.writeFileSync(path.join(root, ...name.split('/')), 'New wording.\n');
  fs.writeFileSync(path.join(root, 'docs', 'a plan é x.md'), 'Other, changed.\n');
  assertChecking(await check(root, name), [name]);
  const res = await check(root, '--run-tests', name);
  assertPass(res, [name]);
  assert.equal(logLines(root).pop().lines, 2);
  runCommit(root, res.commit);
  const names = spawnSync('git', ['-c', 'core.quotepath=false', 'show', '--name-only', '--format=', '-z', 'HEAD'], { cwd: root })
    .stdout.toString('utf8').split('\0').filter(Boolean);
  assert.deepEqual(names, [name], 'the star is a literal character, never a pattern');
});

test('a project folder that does not exist is "the check stopped", cleaned and capped, and never created', async () => {
  const parent = tmpDir();
  const root = path.join(parent, `missing\n${'x'.repeat(300)}`);
  const res = await check(root, 'README.md');
  assert.equal(res.text, unreadable('the check stopped'));
  assert.ok(res.detail.length > 0 && res.detail.length <= 200, res.detail);
  assert.equal(/[\u0000-\u001f]/.test(res.detail), false);
  assert.equal(fs.existsSync(root), false, 'the log never creates the missing folder');
});

test('the first failing test is read from jest, TAP and spec output, or said plainly', async () => {
  const variants = [
    ["process.stdout.write('FAIL tests/home.test.js\\n  \\u25cf home \\u203a shows Save\\n')", 'tests/home.test.js: home › shows Save'],
    ["process.stdout.write('not ok 1 - shows Save\\n')", 'shows Save'],
    ["process.stdout.write('test at tests/home.test.js:2:1\\n')", 'tests/home.test.js'],
    ["process.stdout.write('boom\\n')", 'the test command reported a failure'],
    ["process.stdout.write('not ok 1 - shows Save\\n  location: \\'' + require('url').pathToFileURL(require('path').join(process.cwd(), 'tests', 'home.test.js')).href + ':2:1\\'\\n')", 'tests/home.test.js: shows Save']
  ];
  for (const [body, shown] of variants) {
    const root = makeRepo({ 'src/pages/home.html': HOME, 'fail.js': `${body};\nprocess.exit(1);\n` }, { testScript: 'node fail.js' });
    fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
    await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'], `the existing tests fail (${shown})`);
  }
});

test('a run whose counters cannot be read is "no test ran"', async () => {
  const root = makeRepo({ 'src/pages/home.html': HOME, 'count.js': "process.stdout.write('# tests 1\\n# pass 1\\n');\n" },
    { testScript: 'node count.js' });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'], NO_TEST);
});

test('when the file-name selection names a test for every judged file, that selection runs', async (t) => {
  // `tests/home.test.html` is the name the selection's heuristic maps `home.html` to.
  const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.html': '<p>marker</p>\n', 'tests/home.test.js': PASSING_TEST,
    'tests/other.test.js': PASSING_TEST.replace('has a button', 'still has a button') }, { testScript: SCRIPT });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  const selected = [];
  const real = qualityAgent.runSpecificTests;
  t.mock.method(qualityAgent, 'runSpecificTests', (tools, files) => { selected.push(...files); return real(tools, files); });
  const res = await check(root, '--run-tests', 'src/pages/home.html');
  t.mock.restoreAll();
  assertPass(res, ['src/pages/home.html']);
  assert.equal(res.tests, '2 tests passed.');
  assert.equal(selected.length, 1);
  assert.equal(path.basename(selected[0]), 'home.test.html');
  assert.equal(path.basename(copyParent(selected[0])).startsWith('ctoc-hotfix-'), true, 'the selection reads the copy');
});

test('edge shapes of every kind give the exact verdict', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  // [path, base content, new content, expected clause, or null for the pass of the test call]
  const shapes = [
    ['src/pages/lead.html', 'Welcome <b>home</b>\n', 'Hello <b>home</b>\n', un('src/pages/lead.html')],
    ['src/pages/gt.html', '>Save</b>\n', '>Store</b>\n', un('src/pages/gt.html')],
    ['src/pages/comment.html', '<!-- c -->Save</p>\n', '<!-- c -->Store</p>\n', un('src/pages/comment.html')],
    ['src/pages/odd.html', '</1>Save</p>\n', '</1>Store</p>\n', un('src/pages/odd.html')],
    ['src/pages/open.html', '<p>Save\n', '<p>Store\n', un('src/pages/open.html')],
    ['src/pages/tail.html', '<p>Save<\n', '<p>Store<\n', un('src/pages/tail.html')],
    ['src/pages/heart.html', '<p>Save <3</p>\n', '<p>Store <3</p>\n', un('src/pages/heart.html')],
    ['src/pages/grow.html', '<p>a</p>\n', '<p>a</p>\n<p>b</p>\n', un('src/pages/grow.html')],
    ['src/components/Close.jsx', '  <span>Save</span>\n', '  <span>Store</span>\n', NO_TEST],
    ['src/components/Shut.jsx', '  </span>Save</span>\n', '  </span>Store</span>\n', un('src/components/Shut.jsx')],
    ['src/components/Other.jsx', '  <span>Save</b>\n', '  <span>Store</b>\n', un('src/components/Other.jsx')],
    ['src/components/Longer.jsx', '  <span>Save</spanx>\n', '  <span>Store</spanx>\n', un('src/components/Longer.jsx')],
    ['locales/num.json', '{\n  "count": 1,\n  "x": "y"\n}\n', '{\n  "count": 2,\n  "x": "y"\n}\n', un('locales/num.json')],
    ['locales/grow.json', '{\n  "a": "b"\n}\n', '{\n  "a": "b",\n  "c": "d"\n}\n', un('locales/grow.json')],
    ['translations/id.po', 'msgid "Save"\nmsgstr "S"\n', 'msgid "Store"\nmsgstr "S"\n', un('translations/id.po')],
    ['translations/plural.po', 'msgid "x"\nmsgstr[1] "Saves"\n', 'msgid "x"\nmsgstr[1] "Stores"\n', NO_TEST],
    ['lang/cont.properties', 'a=Save \\\n  more\n', 'a=Store \\\n  more\n', un('lang/cont.properties')],
    ['lang/comment.properties', '# Save\na=b\n', '# Store\na=b\n', un('lang/comment.properties')],
    ['i18n/list.yaml', '- Save\n', '- Store\n', un('i18n/list.yaml')],
    ['i18n/blank.yaml', 'title: Old\n', 'title:   \n', un('i18n/blank.yaml')],
    ['i18n/dq.yaml', 'save: "Save" now\n', 'save: "Store" now\n', un('i18n/dq.yaml')],
    ['i18n/sq.yaml', "save: 'Save'\n", "save: 'Store'\n", NO_TEST],
    ['i18n/sqbad.yaml', "save: 'Save' x\n", "save: 'Store' x\n", un('i18n/sqbad.yaml')],
    ['i18n/anchor.yaml', 'save: &a Save\n', 'save: &a Store\n', un('i18n/anchor.yaml')],
    ['i18n/hash.yaml', 'save: Save # c\n', 'save: Store # c\n', un('i18n/hash.yaml')],
    ['src/styles/start.css', 'a {\n  color:\nred;\n}\n', 'a {\n  color:\nblue;\n}\n', un('src/styles/start.css')],
    ['src/styles/two.css', 'a { border: 1px solid red; color: blue; }\n', 'a { border: 1px solid red; color: green; }\n', NO_TEST],
    ['src/styles/mixin.scss', '@include theme(red);\n', '@include theme(blue);\n', un('src/styles/mixin.scss')],
    ['src/styles/grow.css', 'a { color: red; }\n', 'a { color: red; }\nb { color: red; }\n', un('src/styles/grow.css')],
    ['src/esc.js', 'say("Say \\"hi\\"");\n', 'say("Say \\"hey\\"");\n', 'it changes text inside program code in src/esc.js, and no check can tell whether people read that text or the program depends on it'],
    ['src/open.js', 'const s = "abc\n', 'const s = "abd\n', 'it changes program logic in src/open.js, and only wording and colours qualify'],
    ['src/tpl.js', 'say(`Hi ${name}`);\n', 'say(`Hey ${name}`);\n', 'it changes program logic in src/tpl.js, and only wording and colours qualify'],
    ['src/bt.js', 'say(`Hi there`);\n', 'say(`Hey there`);\n', 'it changes text inside program code in src/bt.js, and no check can tell whether people read that text or the program depends on it'],
    ['src/settings/.env', 'MODE=old\n', 'MODE=new\n', 'it changes a setting in src/settings/.env, and settings changes are a common cause of outages'],
    ['tools/webpack.config.js', 'module.exports = {};\n', 'module.exports = { a: 1 };\n', 'it changes how the project is built or shipped in tools/webpack.config.js'],
    ['docs/CLAUDE.md', 'Old rule.\n', 'New rule.\n', un('docs/CLAUDE.md')],
    ['skills/x/helper.js', 'f(1);\n', 'f(2);\n', 'it changes program logic in skills/x/helper.js, and only wording and colours qualify'],
    ['docs/endings.md', 'One.\nTwo.\n', 'One.\r\nTwo.\r\n', null]
  ];
  const base = {};
  for (const [p, b] of shapes) base[p] = b;
  const root = makeRepo(base);
  for (const [p, b, n, expected] of shapes) {
    fs.writeFileSync(path.join(root, ...p.split('/')), n);
    const res = await check(root, '--run-tests', p);
    if (expected === null) assertPass(res, [p]);
    else assert.equal(res.text, refusal(expected), `${p}: ${JSON.stringify(res)}`);
    fs.writeFileSync(path.join(root, ...p.split('/')), b);
  }
  fs.writeFileSync(path.join(root, 'docs/endings.md'), 'One more.\nTwo.\n');
  fs.writeFileSync(path.join(root, 'i18n/sq.yaml'), "save: 'Store'\n");
  const twoFiles = await check(root, '--run-tests', 'i18n/sq.yaml', 'docs/endings.md');
  assert.equal(twoFiles.text, refusal(NO_TEST), 'files named out of order are judged in path order');
  fs.writeFileSync(path.join(root, 'docs/endings.md'), 'One.\nTwo.\n');
  fs.writeFileSync(path.join(root, 'docs/second.md'), 'Second.\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'second']);
  fs.writeFileSync(path.join(root, 'docs/second.md'), 'Second, changed.\n');
  fs.writeFileSync(path.join(root, 'docs/endings.md'), 'One, changed.\nTwo.\n');
  assertPass(await check(root, '--run-tests', 'docs/second.md', 'docs/endings.md'), ['docs/endings.md', 'docs/second.md']);
  fs.writeFileSync(path.join(root, 'docs/second.md'), 'Second.\n');
  fs.writeFileSync(path.join(root, 'docs/endings.md'), 'One.\nTwo.\n');
  fs.writeFileSync(path.join(root, 'i18n/sq.yaml'), "save: 'Save'\n");
  writeFiles(root, { 'src/pages/nonl.html': '<p>new</p>' });
  assert.equal((await check(root, 'src/pages/nonl.html')).text, refusal('it adds, removes or renames src/pages/nonl.html'));
  const lines = logLines(root);
  assert.equal(lines[lines.length - 1].lines, 1, 'a new file without a final newline counts its one line');
  assert.equal(lines.find((l) => l.verdict === 'hotfix').lines, 0, 'line endings alone are no changed line');
  assert.equal(lines.filter((l) => l.verdict === 'hotfix').length, 2);
  // git lists changed files before new ones; the check still judges in path order.
  fs.writeFileSync(path.join(root, 'docs/endings.md'), 'One, changed.\nTwo.\n');
  writeFiles(root, { 'docs/aaa.md': 'New.\n' });
  assert.equal((await check(root, 'docs/endings.md', 'docs/aaa.md')).text, refusal('it adds, removes or renames docs/aaa.md'));
});

test('a project in a sub-folder of the repository judges only its own files, shown from its own root', async () => {
  const repo = makeRepo({ 'app/README.md': 'Old app wording.\n', 'other/README.md': 'Old other wording.\n' });
  fs.writeFileSync(path.join(repo, 'app/README.md'), 'New app wording.\n');
  fs.writeFileSync(path.join(repo, 'other/README.md'), 'New other wording.\n');
  const app = path.join(repo, 'app');
  assertChecking(await check(app), ['README.md']);
  assertPass(await check(app, '--run-tests'), ['README.md']);
  assertPass(await check(app, '--run-tests', 'README.md'), ['README.md']);
});

test('a test location that is not a readable file address is shown as written', async () => {
  const body = "process.stdout.write('not ok 1 - shows Save\\n  location: \\'file://remote/tests/home.test.js:2:1\\'\\n')";
  const root = makeRepo({ 'src/pages/home.html': HOME, 'fail.js': `${body};\nprocess.exit(1);\n` }, { testScript: 'node fail.js' });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  const res = await check(root, '--run-tests', 'src/pages/home.html');
  assert.equal(res.text, refusal(process.platform === 'win32'
    ? 'the existing tests fail (//remote/tests/home.test.js: shows Save)'
    : 'the existing tests fail (file://remote/tests/home.test.js: shows Save)'));
});

test('a log folder that cannot be written changes no answer', async () => {
  const root = makeRepo({ 'README.md': 'Old wording.\n' });
  const ctoc = path.join(root, '.ctoc');
  fs.mkdirSync(ctoc);
  fs.chmodSync(ctoc, 0o555);
  fs.writeFileSync(path.join(root, 'README.md'), 'New wording.\n');
  let res;
  try {
    res = await check(root, '--run-tests', 'README.md');
  } finally {
    fs.chmodSync(ctoc, 0o755);
  }
  assertPass(res, ['README.md']);
  // Permissions bind only a non-administrator account on a system that enforces them.
  const enforced = process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0;
  if (enforced) assert.equal(fs.existsSync(path.join(ctoc, 'logs')), false);
});
