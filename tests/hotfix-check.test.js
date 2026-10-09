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
// The owner's decision of 2026-10-09 (answer "a"): the hotfix check keeps only the formats
// it can read exactly (plain HTML, colours in plain CSS, catalogue wording in JSON, YAML and
// properties files, prose in Markdown and plain text), because five rounds of security
// attacks kept finding new ways to get a behaviour change committed as a hotfix, the last
// ones where a hand-written reader disagrees with the real compiler. Every case of a
// removed format is kept, grouped at the end of its table, and asserts this clause.
const gone = (f) => `I do not recognise ${f} as wording or a colour`;
// The functional plan's clause (amended 2026-10-09) for a file whose format the check reads
// but whose change it cannot vouch for: text inside a component or custom element or inside
// `<svg>` or `<math>`, HTML outside the strict subset, a Markdown heading whose anchor
// changes, a colour that is not the whole value of a colour property. Rows that asserted
// "not recognised", "could not read (… cannot follow / … open)" or the settings clause for
// one of these cases assert this clause since the sixth round: the wording the functional
// plan now specifies, on a refusal that stays a refusal.
const inexact = (f) => `it changes ${f} in a way the check cannot read exactly, and only what it can read exactly qualifies`;

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
  // `--` only when a judged name starts with `-`, so the usual `next` is exactly the acceptance criterion's.
  const dashes = files.some((f) => f.startsWith('-')) ? '-- ' : '';
  assert.equal(res.next, `hotfix check --run-tests ${dashes}${q(files)}`);
  assert.deepEqual(res.ask, { questions: [] });
  assert.deepEqual(res.actions, {});
}

function assertPass(res, files) {
  assert.equal(res.verdict, 'hotfix', JSON.stringify(res));
  assert.equal(res.text, '');
  assert.deepEqual(res.commit.files, files);
  assert.equal(res.commit.add, `git --literal-pathspecs add -- ${q(files)}`);
  assert.equal(res.commit.message, `git --literal-pathspecs commit --only -m 'hotfix: <what changed>' -- ${q(files)}`);
  assert.deepEqual(res.commit.judged.map((j) => j.path), files);
  for (const j of res.commit.judged) assert.match(j.blob, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
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
  assert.equal(first.next, "hotfix check --run-tests 'src/pages/home.html'", 'byte-identical to the acceptance criterion');

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
  const root = testedProject({ 'config/flags.txt': 'on\n', 'tests/flags.test.js': FLAGS_TEST });
  fs.writeFileSync(path.join(root, 'config/flags.txt'), 'off\n');
  const answers = await buttonWording(root);
  assert.deepEqual(answers.first, reference.first);
  assert.deepEqual(answers.second, reference.second);
  assertPass(reference.second, ['src/pages/home.html']);
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
  const res = await check(root, '--run-tests', 'README.md');
  assert.ok(fs.existsSync(path.join(root, `${LOG}.1`)) && fs.readFileSync(path.join(root, `${LOG}.1`)).equals(old),
    'the old log is kept whole under .1');
  const lines = logLines(root);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].verdict, 'hotfix');
  assertPass(res, ['README.md']);
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
  assert.ok(fs.readFileSync(outside).equals(bytes), 'the linked file is unchanged');
  assert.equal(fs.existsSync(path.join(root, `${LOG}.1`)), false);
  assert.deepEqual(answers[1], answers[0]);
  assertPass(answers[1][1], ['README.md']);
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
    // The judged content is staged first; the first hashing then reads the working folder,
    // and its `lstat` of the judged file is the seam between the two (the rules read the
    // staged content, so a read of the working file is no longer one).
    const judged = path.join(other, 'src', 'pages', 'home.html');
    const realLstat = safeFs.lstatSync;
    let first = true;
    t.mock.method(safeFs, 'lstatSync', (p, options) => {
      if (first && String(p) === judged) {
        first = false;
        fs.writeFileSync(judged, HOME_STORE.replace('Store', 'Stored')); // still wording: only the hashes can tell
      }
      return realLstat(p, options);
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

test('the test call refuses a deleted file or one replaced by a link before any copy, without hashing it', async () => {
  const root = makeRepo({ 'docs/old.md': 'Old page.\n', 'docs/page.md': 'A page.\n' });
  fs.rmSync(path.join(root, 'docs/old.md'));
  await refusedUntouched(root, ['--run-tests', 'docs/old.md'], 'it adds, removes or renames docs/old.md');
  let linked = true;
  try {
    fs.rmSync(path.join(root, 'docs/page.md'));
    fs.symlinkSync('old.md', path.join(root, 'docs/page.md'));
  } catch {
    linked = false; // a platform that cannot make links has no such change
  }
  if (linked) await refusedUntouched(root, ['--run-tests', 'docs/page.md'], 'I do not recognise docs/page.md as wording or a colour');
});

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
    // Since the review of 2026-10-09 an end tag with nothing to close is outside the strict subset.
    ['src/pages/gt.html', '>Save</b>\n', '>Store</b>\n', inexact('src/pages/gt.html')],
    ['src/pages/comment.html', '<!-- c -->Save</p>\n', '<!-- c -->Store</p>\n', inexact('src/pages/comment.html')],
    ['src/pages/odd.html', '</1>Save</p>\n', '</1>Store</p>\n', inexact('src/pages/odd.html')],
    ['src/pages/open.html', '<p>Save\n', '<p>Store\n', inexact('src/pages/open.html')],
    ['src/pages/tail.html', '<p>Save<\n', '<p>Store<\n', inexact('src/pages/tail.html')],
    ['src/pages/heart.html', '<p>Save <3</p>\n', '<p>Store <3</p>\n', un('src/pages/heart.html')],
    ['src/pages/grow.html', '<p>a</p>\n', '<p>a</p>\n<p>b</p>\n', un('src/pages/grow.html')],
    ['locales/num.json', '{\n  "count": 1,\n  "x": "y"\n}\n', '{\n  "count": 2,\n  "x": "y"\n}\n', un('locales/num.json')],
    ['locales/grow.json', '{\n  "a": "b"\n}\n', '{\n  "a": "b",\n  "c": "d"\n}\n', un('locales/grow.json')],
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
    ['src/styles/grow.css', 'a { color: red; }\n', 'a { color: red; }\nb { color: red; }\n', un('src/styles/grow.css')],
    ['src/esc.js', 'say("Say \\"hi\\"");\n', 'say("Say \\"hey\\"");\n', 'it changes text inside program code in src/esc.js, and no check can tell whether people read that text or the program depends on it'],
    ['src/open.js', 'const s = "abc\n', 'const s = "abd\n', 'it changes program logic in src/open.js, and only wording and colours qualify'],
    ['src/tpl.js', 'say(`Hi ${name}`);\n', 'say(`Hey ${name}`);\n', 'it changes program logic in src/tpl.js, and only wording and colours qualify'],
    ['src/bt.js', 'say(`Hi there`);\n', 'say(`Hey there`);\n', 'it changes text inside program code in src/bt.js, and no check can tell whether people read that text or the program depends on it'],
    ['public/ads.txt', 'example.com, 1, DIRECT\n', 'example.org, 1, DIRECT\n', 'it changes a setting in public/ads.txt, and settings changes are a common cause of outages'],
    ['public/app-ads.txt', 'example.com, 1, DIRECT\n', 'example.org, 1, DIRECT\n', 'it changes a setting in public/app-ads.txt, and settings changes are a common cause of outages'],
    ['public/.well-known/security.txt', 'Contact: a\n', 'Contact: b\n', 'it changes a setting in public/.well-known/security.txt, and settings changes are a common cause of outages'],
    ['public/LLMS.txt', 'Old guide.\n', 'New guide.\n', 'it changes a setting in public/LLMS.txt, and settings changes are a common cause of outages'],
    ['src/settings/.env', 'MODE=old\n', 'MODE=new\n', 'it changes a setting in src/settings/.env, and settings changes are a common cause of outages'],
    ['tools/webpack.config.js', 'module.exports = {};\n', 'module.exports = { a: 1 };\n', 'it changes how the project is built or shipped in tools/webpack.config.js'],
    ['docs/CLAUDE.md', 'Old rule.\n', 'New rule.\n', un('docs/CLAUDE.md')],
    ['skills/x/helper.js', 'f(1);\n', 'f(2);\n', 'it changes program logic in skills/x/helper.js, and only wording and colours qualify'],
    ['docs/endings.md', 'One.\nTwo.\n', 'One.\r\nTwo.\r\n', null],
    // The security check's second round: front matter after a byte-order mark is still
    // settings, an escaped scheme is still an address, and a `value` inside another
    // attribute's value is no `value` attribute. A stray `}` in a tag was harmless; since the
    // sixth round (the session's decision of 2026-10-09: the strict HTML subset) a brace
    // anywhere inside a tag puts the file outside the subset, so this former pass refuses.
    ['src/pages/stray.html', '<p data-x=}>Save</p>\n', '<p data-x=}>Store</p>\n', inexact('src/pages/stray.html')],
    // An unclosed first-line `---` was no front matter; since every scanner fails closed
    // (2026-10-09) it is a front matter left open, and the change is unreadable.
    ['docs/rule.md', '---\nOld text.\n', '---\nNew text.\n', 'I could not read the change (docs/rule.md leaves a tag, quote, comment, block, fence or span open)'],
    ['docs/bom.md', '\uFEFF---\ntitle: a\n---\nBody.\n', '\uFEFF---\ntitle: b\n---\nBody.\n', 'it changes a setting in docs/bom.md, and settings changes are a common cause of outages'],
    ['locales/esc.json', '{\n  "help": "Help"\n}\n', '{\n  "help": "\\u006aavascript:alert()"\n}\n', un('locales/esc.json')],
    ['src/pages/opt.html', '<option title="no value here">Red</option>\n', '<option title="no value here">Blue</option>\n', un('src/pages/opt.html')],
    // The owner's decision of 2026-10-09: the check keeps only the formats it reads exactly, so
    // these cases of a removed format (Vue, Svelte, JSX, reStructuredText, Sass, Less, gettext)
    // stay, and each now asserts the "not recognised" refusal.
    ['src/components/Close.jsx', '  <span>Save</span>\n', '  <span>Store</span>\n', gone('src/components/Close.jsx')],
    ['src/components/Shut.jsx', '  </span>Save</span>\n', '  </span>Store</span>\n', gone('src/components/Shut.jsx')],
    ['src/components/Other.jsx', '  <span>Save</b>\n', '  <span>Store</b>\n', gone('src/components/Other.jsx')],
    ['src/components/Longer.jsx', '  <span>Save</spanx>\n', '  <span>Store</spanx>\n', gone('src/components/Longer.jsx')],
    ['translations/id.po', 'msgid "Save"\nmsgstr "S"\n', 'msgid "Store"\nmsgstr "S"\n', gone('translations/id.po')],
    ['translations/plural.po', 'msgid "x"\nmsgstr[1] "Saves"\n', 'msgid "x"\nmsgstr[1] "Stores"\n', gone('translations/plural.po')],
    ['src/styles/mixin.scss', '@include theme(red);\n', '@include theme(blue);\n', gone('src/styles/mixin.scss')],
    ['src/components/Click.jsx', '  <button onClick={() => go(a > b)}>Save</button>\n', '  <button onClick={() => go(a > b)}>Store</button>\n', gone('src/components/Click.jsx')]
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
  assert.equal(lines.filter((l) => l.verdict === 'hotfix').length, shapes.filter((x) => x[3] === null).length + 1,
    'one line per pass: each passing shape, and the two-file pass');
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

// The code review's and the security check's findings of 2026-10-08 (Steps 11 and 13),
// each case written and seen failing before its fix.

/** The CPU time this process spends in `fn`, in milliseconds; child processes are not counted. */
async function cpuMs(fn) {
  const start = process.cpuUsage();
  const result = await fn();
  const used = process.cpuUsage(start);
  return { ms: (used.user + used.system) / 1000, result };
}

/** The extra CPU time `big` costs over the cheaper of two `small` runs of the same check. */
async function extraCpuMs(small, big) {
  const a = await cpuMs(small);
  const b = await cpuMs(big);
  const c = await cpuMs(small);
  return { extra: b.ms - Math.min(a.ms, c.ms), small: a.result, big: b.result };
}

test('finding 1: no repository hook and no file-system monitor runs during either call', async () => {
  const markers = tmpDir('hotfix-markers-');
  const hookMarker = path.join(markers, 'hook.txt');
  const monitorMarker = path.join(markers, 'monitor.txt');
  const fwd = (p) => p.split(path.sep).join('/');
  const root = testedProject();
  fs.writeFileSync(path.join(root, '.git', 'hooks', 'post-index-change'),
    `#!/bin/sh\necho hook >> '${fwd(hookMarker)}'\n`, { mode: 0o755 });
  const monitor = path.join(markers, 'fsmonitor.sh');
  fs.writeFileSync(monitor, `#!/bin/sh\necho monitor >> '${fwd(monitorMarker)}'\nexit 1\n`, { mode: 0o755 });
  git(root, ['config', 'core.fsmonitor', fwd(monitor)]);
  // Both are live in this repository: a plain status runs the monitor, a plain add the hook.
  git(root, ['status', '--porcelain']);
  git(root, ['add', 'src/pages/home.html']);
  assert.ok(fs.existsSync(hookMarker), 'the hook runs for an ordinary git call');
  assert.ok(fs.existsSync(monitorMarker), 'the monitor runs for an ordinary git call');
  fs.rmSync(hookMarker);
  fs.rmSync(monitorMarker);

  fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
  const first = await check(root, 'src/pages/home.html');
  const second = await check(root, '--run-tests', 'src/pages/home.html');
  assertChecking(first, ['src/pages/home.html']);
  assertPass(second, ['src/pages/home.html']);
  assert.equal(fs.existsSync(hookMarker), false, 'no repository hook ran during the check');
  assert.equal(fs.existsSync(monitorMarker), false, 'no file-system monitor ran during the check');
});

test('finding 2a: the first failing test is read from 195 KB of blank lines in linear time', async (t) => {
  const root = testedProject();
  fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
  const failingWith = (output) => async () => {
    t.mock.method(qualityAgent, 'runFullTests', async () => ({ passed: false, passCount: 0, failed: 1, skipped: 0, flaky: 0, output }));
    try {
      return await check(root, '--run-tests', 'src/pages/home.html');
    } finally {
      t.mock.restoreAll();
    }
  };
  const { extra, big } = await extraCpuMs(failingWith('boom\n'), failingWith(`${'\n'.repeat(195 * 1024)}boom\n`));
  assert.equal(big.text, refusal('the existing tests fail (the test command reported a failure)'));
  t.diagnostic(`195 KB of blank lines: ${extra.toFixed(1)} ms more processor time`);
  assert.ok(extra < 100, `195 KB of blank lines cost ${extra.toFixed(1)} ms more`);
});

test('finding 2b: a catalogue line with 100,000 trailing spaces is read in linear time', async (t) => {
  const base = '{\n  "save": "Save"\n}\n';
  const root = makeRepo({ 'locales/en.json': base });
  const judgeLine = (line) => async () => {
    fs.writeFileSync(path.join(root, 'locales', 'en.json'), `{\n${line}\n}\n`);
    return check(root, 'locales/en.json');
  };
  const { extra, big } = await extraCpuMs(judgeLine('  "save": "Store" x'), judgeLine(`  "save": "Store"${' '.repeat(100000)}x`));
  assert.equal(big.text, refusal('I do not recognise locales/en.json as wording or a colour'));
  t.diagnostic(`100,000 trailing spaces: ${extra.toFixed(1)} ms more processor time`);
  assert.ok(extra < 100, `100,000 trailing spaces cost ${extra.toFixed(1)} ms more`);
});

test('finding 2c: a colour change in a 300 KB one-line stylesheet is judged in linear time', async (t) => {
  const many = '.a { color: red; } '.repeat(Math.ceil(300 * 1024 / 19));
  const long = `.a { box-shadow:${' red'.repeat(75 * 1024)}; }`;
  const shapes = [
    ['short declarations, the last colour changed', many, `${many.slice(0, many.lastIndexOf('red'))}blue; } `],
    ['one long declaration, every colour changed', long, long.replace(/red/g, 'tan')]
  ];
  for (const [label, base, changed] of shapes) {
    const root = makeRepo({ 'src/styles/site.css': `${base}\n`, 'src/styles/small.css': '.a { color: red; }\n' });
    const judgeFile = (file, content) => async () => {
      fs.writeFileSync(path.join(root, 'src', 'styles', file), content);
      return check(root, `src/styles/${file}`);
    };
    const { extra, big } = await extraCpuMs(judgeFile('small.css', '.a { color: blue; }\n'), judgeFile('site.css', `${changed}\n`));
    // Since the sixth round a colour passes only as the whole value of its property (the
    // functional plan, amended 2026-10-09), so the long `box-shadow` list is refused; the
    // time it takes to say so is what this case measures.
    if (label.startsWith('one long')) assert.equal(big.text, refusal(inexact('src/styles/site.css')));
    else assertChecking(big, ['src/styles/site.css']);
    t.diagnostic(`${label}: ${extra.toFixed(1)} ms more processor time`);
    assert.ok(extra < 100, `${label}: 300 KB cost ${extra.toFixed(1)} ms more`);
  }
});

test('finding 2, same class: a page with 20,000 script blocks is judged in linear time', async (t) => {
  const blocks = `${'<script>x</script>\n'.repeat(20000)}<p>Save</p>\n`;
  const root = makeRepo({ 'src/pages/big.html': blocks, 'src/pages/small.html': '<script>x</script>\n<p>Save</p>\n' });
  const judgeFile = (file, content) => async () => {
    fs.writeFileSync(path.join(root, 'src', 'pages', file), content);
    return check(root, `src/pages/${file}`);
  };
  const { extra, big } = await extraCpuMs(judgeFile('small.html', '<script>x</script>\n<p>Store</p>\n'),
    judgeFile('big.html', blocks.replace('<p>Save</p>', '<p>Store</p>')));
  assertChecking(big, ['src/pages/big.html']);
  t.diagnostic(`20,000 script blocks: ${extra.toFixed(1)} ms more processor time`);
  assert.ok(extra < 100, `20,000 script blocks cost ${extra.toFixed(1)} ms more`);
});

test('finding 6: a tracked test command with shell structure runs no test and says so', async () => {
  const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': PASSING_TEST,
    '.ctoc/quality-config.yaml': 'languages:\n  javascript:\n    test: npm run build && npm test\n' }, { testScript: SCRIPT });
  fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
  await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'], NO_TEST);
});

test('finding 8: a named file with control characters is quoted cleaned in every sentence', async () => {
  const root = makeRepo({ 'README.md': 'Old wording.\n' });
  assert.equal((await check(root, 'nope\u001b[2J.md')).text, unreadable('nope [2J.md holds no change that git would commit'));
  assert.equal((await check(root, '../x\u001b.md')).text, unreadable('../x .md is outside this project'));
});

test('finding 9: a judged file named like an option reaches the test run after --', async () => {
  const root = makeRepo({ '--x.md': 'Old wording.\n' });
  fs.writeFileSync(path.join(root, '--x.md'), 'New wording.\n');
  const first = await check(root, '--', '--x.md');
  assertChecking(first, ['--x.md']);
  assert.equal(first.next, "hotfix check --run-tests -- '--x.md'");
  const words = shellWords(first.next);
  assert.deepEqual(words.slice(0, 2), ['hotfix', 'check']);
  const second = await check(root, ...words.slice(2));
  assertPass(second, ['--x.md']);
  fs.writeFileSync(path.join(root, 'notes.md'), 'Other.\n');
  git(root, ['add', 'notes.md']);
  git(root, ['commit', '-q', '-m', 'notes']);
  fs.writeFileSync(path.join(root, 'notes.md'), 'Other, changed.\n');
  const mixed = await check(root, '--', 'notes.md', '--x.md');
  assert.equal(mixed.next, "hotfix check --run-tests -- '--x.md' 'notes.md'", 'a mixed set carries --');
  assertPass(await check(root, ...shellWords(mixed.next).slice(2)), ['--x.md', 'notes.md']);
  assert.equal((await check(root, '--run-tests', '--x.md')).text, `Unknown hotfix command: --x.md. ${USAGE}`,
    'without --, a name that looks like an option is still the usage text');
});

test('finding 10: removal never follows a copy the tests swapped for a link to an outside folder', async (t) => {
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  /** Replace the copy, from inside the test run, by a link to `outside`; returns where the copy was. */
  const swapCopyFor = (outside) => {
    const where = { tree: null };
    t.mock.method(qualityAgent, 'runFullTests', async () => {
      where.tree = process.cwd();
      process.chdir(PRIVATE_TMP);
      fs.renameSync(where.tree, `${where.tree}-moved`);
      fs.symlinkSync(outside, where.tree, linkType);
      return { passed: true, passCount: 1, failed: 0, skipped: 0, flaky: 0 };
    });
    return where;
  };
  const OUTSIDE = 'outside file\n';
  await t.test('(a) with linked package folders: no link is unlinked through the swapped copy', async () => {
    const outside = tmpDir('hotfix-outside-');
    writeFiles(outside, { 'node_modules': OUTSIDE, '.venv': OUTSIDE, 'packages/a/node_modules': OUTSIDE });
    const root = linkedProject("  assert.equal(require('greet'), 'hello');\n");
    fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
    const where = swapCopyFor(outside);
    const res = await check(root, '--run-tests', 'src/pages/home.html');
    t.mock.restoreAll();
    assert.deepEqual(treeBytes(outside), { 'node_modules': sha(OUTSIDE), '.venv': sha(OUTSIDE),
      'packages/a/node_modules': sha(OUTSIDE) }, 'nothing outside the copy was deleted');
    assert.equal(res.verdict, 'hotfix', JSON.stringify(res));
    assert.match(res.detail, /^the temporary copy at .+ could not be removed: a link's folder moved outside it$/);
    fs.unlinkSync(where.tree);
    fs.rmSync(copyParent(where.tree), { recursive: true, force: true });
  });
  await t.test('(b) with no link: git refuses to remove the swapped copy as its worktree', async () => {
    const outside = tmpDir('hotfix-outside-');
    writeFiles(outside, { 'keep.txt': OUTSIDE, 'src/pages/home.html': OUTSIDE });
    const root = testedProject();
    fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
    const where = swapCopyFor(outside);
    const res = await check(root, '--run-tests', 'src/pages/home.html');
    t.mock.restoreAll();
    assert.deepEqual(treeBytes(outside), { 'keep.txt': sha(OUTSIDE), 'src/pages/home.html': sha(OUTSIDE) },
      'nothing outside the copy was deleted');
    assert.equal(res.verdict, 'hotfix', JSON.stringify(res));
    // git itself refuses to remove a worktree that is no longer the one it registered.
    assert.match(res.detail, /^the temporary copy at .+ could not be removed: git worktree failed: fatal: validation failed/);
    fs.unlinkSync(where.tree);
    fs.rmSync(copyParent(where.tree), { recursive: true, force: true });
  });
  await t.test('(c) a link whose folder the tests removed counts as removed', async () => {
    const root = linkedProject("  assert.equal(require('greet'), 'hello');\n");
    const owned = treeBytes(path.join(root, 'packages', 'a', 'node_modules'));
    fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
    const where = { tree: null };
    t.mock.method(qualityAgent, 'runFullTests', async () => {
      where.tree = process.cwd();
      fs.rmSync(path.join(where.tree, 'packages'), { recursive: true, force: true });
      return { passed: true, passCount: 1, failed: 0, skipped: 0, flaky: 0 };
    });
    const res = await check(root, '--run-tests', 'src/pages/home.html');
    t.mock.restoreAll();
    assertPass(res, ['src/pages/home.html']);
    assert.equal(fs.existsSync(copyParent(where.tree)), false, 'the copy is gone');
    assert.deepEqual(treeBytes(path.join(root, 'packages', 'a', 'node_modules')), owned, 'the owner\'s folder is intact');
  });
});

test('finding 11: a kill from outside removes the copy, then the signal ends the process', async () => {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const listeners = () => signals.map((s) => process.listenerCount(s));
  const before = listeners();
  const plain = testedProject();
  fs.writeFileSync(path.join(plain, 'src', 'pages', 'home.html'), HOME_STORE);
  assertPass(await check(plain, '--run-tests', 'src/pages/home.html'), ['src/pages/home.html']);
  assert.deepEqual(listeners(), before, 'the handlers are removed after the check');
  // A signal from outside reaches a process on Windows only as a forced end, which no
  // handler sees; there the in-process half above is the whole contract.
  if (process.platform === 'win32') return;
  const probe = probeDir();
  const childTmp = tmpDir('hotfix-child-tmp-');
  const slow = "const fs = require('fs');\nconst path = require('path');\n"
    + "fs.writeFileSync(path.join(process.env.CTOC_HOTFIX_PROBE, 'started.txt'), process.cwd());\n"
    + 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);\n'
    + "process.stdout.write('\\u2139 pass 1\\n\\u2139 fail 0\\n');\n";
  const root = makeRepo({ 'src/pages/home.html': HOME, 'slow.js': slow }, { testScript: 'node slow.js' });
  fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
  const runner = path.join(tmpDir('hotfix-runner-'), 'run.js');
  fs.writeFileSync(runner, `const { route } = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'lib', 'menu-screens'))});\n`
    + "route(['hotfix', 'check', '--run-tests', 'src/pages/home.html'], process.argv[2]).then((r) => process.stdout.write(JSON.stringify(r)));\n");
  const env = { ...process.env, TMPDIR: childTmp, TEMP: childTmp, TMP: childTmp, CTOC_HOTFIX_PROBE: probe };
  delete env.NODE_TEST_CONTEXT;
  const child = require('child_process').spawn(NODE, [runner, root], { env, stdio: 'ignore' });
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
  const deadline = Date.now() + 30000;
  while (probeRead(probe, 'started.txt') === null && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  assert.ok(probeRead(probe, 'started.txt'), 'the tests started in the copy');
  child.kill('SIGTERM');
  const { signal } = await exited;
  assert.equal(signal, 'SIGTERM', 'the signal is raised again and ends the process');
  assert.deepEqual(fs.readdirSync(childTmp).filter((n) => n.startsWith('ctoc-hotfix-')), [], 'no copy remains');
  assert.equal(worktrees(root).split('\n\n').filter(Boolean).length, 1, 'the copy\'s worktree registration is gone');
});

// The security check's second round (2026-10-08).

test('round 2, finding 1: a staged edit hidden behind an index bit is refused, or committed exactly as judged', async (t) => {
  const SCRIPTS = HOME_STORE.replace('</body>', `${'<script>steal()</script>\n'.repeat(30)}</body>`);
  const marked = 'I could not read the change (src/pages/home.html is marked in git\'s index as unchanged or skipped)';
  const shapes = [
    ['assume-unchanged', ['update-index', '--assume-unchanged', 'src/pages/home.html'], null, true],
    ['core.ignoreStat=true', null, ['config', 'core.ignoreStat', 'true'], true],
    ['skip-worktree', ['update-index', '--skip-worktree', 'src/pages/home.html'], null, true]
  ];
  for (const [label, mark, config, mustRefuse] of shapes) {
    await t.test(label, async () => {
      const root = testedProject();
      const home = path.join(root, 'src', 'pages', 'home.html');
      if (config) git(root, config);
      fs.writeFileSync(home, HOME_STORE);
      git(root, ['add', 'src/pages/home.html']);
      if (mark) git(root, mark);
      fs.writeFileSync(home, SCRIPTS);
      const first = await check(root, 'src/pages/home.html');
      const last = first.verdict === 'checking' ? await check(root, '--run-tests', 'src/pages/home.html') : first;
      t.diagnostic(`${label}: ${last.verdict} ${last.text}`);
      if (mustRefuse) assert.equal(last.text, refusal(marked), JSON.stringify(last));
      if (last.verdict === 'refused') return;
      assert.equal(last.verdict, 'hotfix', JSON.stringify(last));
      const judgedLines = logLines(root).pop().lines;
      runCommit(root, last.commit);
      const [added, removed] = git(root, ['diff', '--numstat', 'HEAD~1', 'HEAD']).trim().split('\t');
      assert.equal(Number(added) + Number(removed), judgedLines, 'the commit holds exactly the changed lines that were judged');
      for (const j of last.commit.judged || []) assert.equal(git(root, ['rev-parse', `HEAD:${j.path}`]).trim(), j.blob);
    });
  }
});

test('round 2, finding 3: a project inside a sensitive, test, governing, build or database folder is judged by its path from the repository top', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  // [the project folder, the file, its old and new content, the clause]
  const shapes = [
    ['services/payment', 'README.md', 'Old wording.\n', 'New wording.\n', 'README.md sits in an area named payment, and such areas are never a hotfix'],
    ['tests/e2e', 'README.md', 'Old wording.\n', 'New wording.\n', 'it changes a test (README.md)'],
    ['agents/x', 'README.md', 'Old wording.\n', 'New wording.\n', un('README.md')],
    ['.circleci/web', 'config.yml', 'name: old\n', 'name: new\n', 'it changes how the project is built or shipped in config.yml'],
    ['db/migrations/app', 'seed.yaml', 'name: old\n', 'name: new\n', 'it changes stored data in seed.yaml']
  ];
  const base = {};
  for (const [dir, file, old] of shapes) base[`${dir}/${file}`] = old;
  const repo = makeRepo(base);
  for (const [dir, file, old, changed, clause] of shapes) {
    const abs = path.join(repo, ...dir.split('/'), file);
    fs.writeFileSync(abs, changed);
    const res = await check(path.join(repo, ...dir.split('/')), file);
    fs.writeFileSync(abs, old);
    assert.equal(res.text, refusal(clause), `${dir}: ${JSON.stringify(res)}`);
  }
});

test('round 2, finding 9: a pass names each judged file with its staged id, which a rewriting commit hook no longer matches', async () => {
  const root = testedProject();
  const home = path.join(root, 'src', 'pages', 'home.html');
  fs.writeFileSync(home, HOME_STORE);
  const res = await check(root, '--run-tests', 'src/pages/home.html');
  assertPass(res, ['src/pages/home.html']);
  const blob = git(root, ['hash-object', 'src/pages/home.html']).trim();
  assert.deepEqual(res.commit.judged, [{ path: 'src/pages/home.html', blob }]);
  // A repository pre-commit hook that rewrites the judged file and stages another: the
  // commit then holds bytes nobody judged, and the judged ids are what can show it.
  fs.writeFileSync(path.join(root, '.git', 'hooks', 'pre-commit'),
    "#!/bin/sh\necho '<script>steal()</script>' >> src/pages/home.html\ngit add src/pages/home.html\necho extra > extra.txt\ngit add extra.txt\n",
    { mode: 0o755 });
  runCommit(root, res.commit);
  const committed = spawnSync('git', ['rev-parse', 'HEAD:src/pages/home.html'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const names = git(root, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n');
  assert.ok(committed !== blob || names.length > 1, `the hook changed the commit: ${committed} ${names.join(' ')}`);
});

// The fourth round (2026-10-09): the security attack and the code review, each through
// the first call. [path, base content, new content, the clause, or null for `checking`]
// Renamed at review (2026-10-09): since the owner's decision of that day the check reads plain
// HTML, plain CSS, catalogues, Markdown and plain text only, so the rows on conditional
// templates, Sass variables, reStructuredText literal blocks and directives, and TypeScript
// generics now assert that each such file is a kind the check does not recognise.
test('round 4: components and code elements in HTML, Markdown lists and definitions, catalogue values, custom properties; Vue, JSX, Sass, Less and reStructuredText files are not recognised', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const setting = (f) => `it changes a setting in ${f}, and settings changes are a common cause of outages`;
  const open = (f) => `I could not read the change (${f} leaves a tag, quote, comment, block, fence or span open)`;
  const shapes = [
    // Only HTML host elements carry wording, and nothing anywhere inside a component.
    // The fifth round (2026-10-09): element names are matched in any letter case, as HTML reads
    // them, so `<DIV>` is the host element `div` and its text is wording (it was refused).
    ['src/pages/upper.html', '<DIV>Save</DIV>\n', '<DIV>Store</DIV>\n', null],
    ['src/pages/inside.html', '<MyAction><b>charge</b></MyAction>\n', '<MyAction><b>refund</b></MyAction>\n', inexact('src/pages/inside.html')],
    ['src/pages/after.html', '<my-widget>x</my-widget>\n<p>Save</p>\n', '<my-widget>x</my-widget>\n<p>Store</p>\n', null],
    // Code elements: an end tag of another element does not leave one.
    // The fifth round (2026-10-09): an end tag that does not close the element on top while a
    // code element is open cannot be followed; since the sixth round that is HTML outside the
    // strict subset, with the functional plan's sentence for it.
    ['src/pages/pre.html', '<pre></code>pip install requests</pre>\n', '<pre></code>pip install reqests</pre>\n', inexact('src/pages/pre.html')],
    ['src/pages/after-code.html', '<p><code>x</code> Save</p>\n', '<p><code>x</code> Store</p>\n', null],
    ['src/pages/after-code-tag.html', '<p><code>x</code><b>Save</b></p>\n', '<p><code>x</code><b>Store</b></p>\n', null],
    // Custom properties: a change to a value that is no colour; colours in real colour properties.
    ['src/styles/font.css', ':root { --font: "Old"; }\n', ':root { --font: "New"; }\n', setting('src/styles/font.css')],
    ['src/styles/width.css', 'a { width: #fff; }\n', 'a { width: #000; }\n', un('src/styles/width.css')],
    ['src/styles/fill.css', 'path { fill: red; stroke: blue; outline-color: red; }\n', 'path { fill: blue; stroke: red; outline-color: blue; }\n', null],
    ['src/styles/design-tokens.css', '.a { border-color: red; }\n', '.a { border-color: blue; }\n', null],
    // Markdown lists: a fence inside an item whose content starts at column 4, a thematic
    // break that is no list item, and code after a list that has ended.
    ['docs/list-fence.md', '1.  Step:\n\n    ```\n    pip install requests\n    ```\n', '1.  Step:\n\n    ```\n    pip install reqests\n    ```\n', un('docs/list-fence.md')],
    ['docs/break.md', '* * *\n\n    pip install requests\n', '* * *\n\n    pip install reqests\n', un('docs/break.md')],
    ['docs/ended.md', '- Item.\n\nText.\n\n    pip install requests\n', '- Item.\n\nText.\n\n    pip install reqests\n', un('docs/ended.md')],
    ['docs/wide.md', '-     pip install requests\n', '-     pip install reqests\n', un('docs/wide.md')],
    ['docs/fence-out.md', '- a\n  ```\n  x\n- b\n```\npip install requests\n```\n', '- a\n  ```\n  x\n- b\n```\npip install reqests\n```\n', open('docs/fence-out.md')],
    ['docs/ordered.md', '1. Step one.\n\n   Old words.\n', '1. Step one.\n\n   New words.\n', null],
    ['docs/ordered-two.md', 'Text.\n2. foo\n\n      pip install requests\n', 'Text.\n2. foo\n\n      pip install reqests\n', un('docs/ordered-two.md')],
    ['docs/item-fence.md', '- ```\n  pip install requests\n  ```\n', '- ```\n  pip install reqests\n  ```\n', un('docs/item-fence.md')],
    ['docs/item-doctest.md', '- >>> print("old")\n  old\n', '- >>> print("old")\n  new\n', un('docs/item-doctest.md')],
    // Since the review of 2026-10-09 a definition in any but its plain one-line form cannot be read exactly.
    ['docs/two-defs.md', 'See [it][b].\n\n[a]:\n[b]: /one\n', 'See [it][b].\n\n[a]:\n[b]: /two\n', inexact('docs/two-defs.md')],
    // A reference definition with an inline title.
    ['docs/inline-title.md', 'See [it][a].\n\n[a]: /u\n"Old title"\n', 'See [it][a].\n\n[a]: /u\n"New title"\n', inexact('docs/inline-title.md')],
    ['docs/after-def.md', 'See [it][a].\n\n[a]: /u\nOld words.\n', 'See [it][a].\n\n[a]: /u\nNew words.\n', null],
    // The owner's decision of 2026-10-09: the check keeps only the formats it reads exactly, so
    // these cases of a removed format (Vue, Svelte, JSX, reStructuredText, Sass, Less, gettext)
    // stay, and each now asserts the "not recognised" refusal.
    ['src/components/Deep.jsx', 'export const D = () => <Box><p>Save</p></Box>;\n', 'export const D = () => <Box><p>Store</p></Box>;\n', gone('src/components/Deep.jsx')],
    ['src/components/Member.jsx', 'export const M = () => <ui.p>Save</ui.p>;\n', 'export const M = () => <ui.p>Store</ui.p>;\n', gone('src/components/Member.jsx')],
    ['src/components/Frag.jsx', 'export const F = () => <><p>Save</p></>;\n', 'export const F = () => <><p>Store</p></>;\n', gone('src/components/Frag.jsx')],
    ['src/components/Head.svelte', '<svelte:head><title>Save</title></svelte:head>\n', '<svelte:head><title>Store</title></svelte:head>\n', gone('src/components/Head.svelte')],
    ['src/components/Kbd.jsx', 'export const K = () => <p><kbd>Ctrl</kbd></p>;\n', 'export const K = () => <p><kbd>Alt</kbd></p>;\n', gone('src/components/Kbd.jsx')],
    ['src/components/Else.vue', '<template>\n  <div>\n    <template v-if="a">Hi</template>\n    <template v-else>Save</template>\n  </div>\n</template>\n', '<template>\n  <div>\n    <template v-if="a">Hi</template>\n    <template v-else>Store</template>\n  </div>\n</template>\n', gone('src/components/Else.vue')],
    ['src/components/ElseIf.vue', '<template>\n  <template v-else-if="b"><p>Save</p></template>\n</template>\n', '<template>\n  <template v-else-if="b"><p>Store</p></template>\n</template>\n', gone('src/components/ElseIf.vue')],
    ['src/components/Loop.vue', '<template>\n  <template v-for="x in xs"><p>Save</p></template>\n</template>\n', '<template>\n  <template v-for="x in xs"><p>Store</p></template>\n</template>\n', gone('src/components/Loop.vue')],
    ['src/components/SlotIf.vue', '<template>\n  <template #x v-if="a"><p>Save</p></template>\n</template>\n', '<template>\n  <template #x v-if="a"><p>Store</p></template>\n</template>\n', gone('src/components/SlotIf.vue')],
    ['src/components/InSlot.vue', '<template>\n  <template #x><template v-if="a"><p>Save</p></template></template>\n</template>\n', '<template>\n  <template #x><template v-if="a"><p>Store</p></template></template>\n</template>\n', gone('src/components/InSlot.vue')],
    ['src/styles/gap.less', '@gap: 4px;\na { color: red; }\n', '@gap: 8px;\na { color: red; }\n', gone('src/styles/gap.less')],
    ['src/styles/map.scss', '$theme: (\n  main: red,\n  alt: blue\n);\n', '$theme: (\n  main: red,\n  alt: green\n);\n', gone('src/styles/map.scss')],
    ['src/styles/beside.scss', '$brand: #0a58ca;\na { color: red; }\n', '$brand: #0a58ca;\na { color: blue; }\n', gone('src/styles/beside.scss')],
    ['docs/quoted.rst', 'Run this::\n\n> pip install requests\n', 'Run this::\n\n> pip install reqests\n', gone('docs/quoted.rst')],
    ['docs/nested.rst', '.. note::\n\n   Old words.\n\n   .. code-block:: sh\n\n      pip install requests\n', '.. note::\n\n   Old words.\n\n   .. code-block:: sh\n\n      pip install reqests\n', gone('docs/nested.rst')],
    ['docs/note-body.rst', '.. note::\n\n   Old words.\n\n   .. code-block:: sh\n\n      pip install requests\n', '.. note::\n\n   New words.\n\n   .. code-block:: sh\n\n      pip install requests\n', gone('docs/note-body.rst')],
    ['docs/warning-line.rst', '.. warning:: Old words.\n', '.. warning:: New words.\n', gone('docs/warning-line.rst')],
    ['docs/to-raw.rst', '.. note:: Old words.\n', '.. raw:: Old words.\n', gone('docs/to-raw.rst')],
    ['docs/mid.rst', 'Use a :: in the middle, old words.\n\n   Quoted old words.\n', 'Use a :: in the middle, new words.\n\n   Quoted new words.\n', gone('docs/mid.rst')],
    ['docs/footnote.rst', 'Old words.\n\n.. [1] Old note.\n', 'Old words.\n\n.. [1] New note.\n', gone('docs/footnote.rst')],
    ['docs/note-literal.rst', '.. note:: Run this::\n\n   pip install requests\n', '.. note:: Run this::\n\n   pip install reqests\n', gone('docs/note-literal.rst')],
    ['src/components/Ext.tsx', 'export const f = <T extends object>(x: T) => x;\nexport const s = "<b>Save</b>";\n', 'export const f = <T extends object>(x: T) => x;\nexport const s = "<b>Store</b>";\n', gone('src/components/Ext.tsx')],
    ['src/components/Const.tsx', 'export const f = <const T,>(x: T) => x;\nexport const s = "<b>Save</b>";\n', 'export const f = <const T,>(x: T) => x;\nexport const s = "<b>Store</b>";\n', gone('src/components/Const.tsx')],
    ['src/components/In.tsx', 'export const P = () => <in >Save</in>;\n', 'export const P = () => <in >Store</in>;\n', gone('src/components/In.tsx')],
    ['src/components/Arrow.tsx', 'export const f = <T extends () => void,>(x: T) => x;\nexport const P = () => <p>Save</p>;\n', 'export const f = <T extends () => void,>(x: T) => x;\nexport const P = () => <p>Store</p>;\n', gone('src/components/Arrow.tsx')]
  ];
  const base = {};
  for (const [p, b] of shapes) base[p] = b;
  const root = makeRepo(base);
  for (const [p, b, n, expected] of shapes) {
    fs.writeFileSync(path.join(root, ...p.split('/')), n);
    const res = await check(root, p);
    fs.writeFileSync(path.join(root, ...p.split('/')), b);
    if (expected === null) assertChecking(res, [p]);
    else assert.equal(res.text, refusal(expected), `${p}: ${JSON.stringify(res)}`);
  }
});

// Every scanner fails closed (the automated commit security review, 2026-10-09): a side
// that ends inside an unfinished construct, or holds one the scanner cannot follow, makes
// the change unreadable. [path, base content, new content, the clause, or null for `checking`]
test('round 4: every scanner fails closed on an unfinished or unreadable construct', async () => {
  const open = (f) => `I could not read the change (${f} leaves a tag, quote, comment, block, fence or span open)`;
  const lost = (f) => `I could not read the change (${f} holds something I cannot follow)`;
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const shapes = [
    // An attribute name where none can start: an unclosed `<div` swallowing the next tag.
    ['src/pages/div.html', '<div class="a"\n<p>Save</p>\n', '<div class="a"\n<p>Store</p>\n', inexact('src/pages/div.html')],
    // An unclosed quote, comment, raw-text element and tag after the change.
    ['src/pages/quote.html', '<p>Save</p>\n<a title="x>Go</a>\n', '<p>Store</p>\n<a title="x>Go</a>\n', inexact('src/pages/quote.html')],
    ['src/pages/note.html', '<p>Save</p>\n<!-- note\n', '<p>Store</p>\n<!-- note\n', inexact('src/pages/note.html')],
    ['src/pages/script.html', '<p>Save</p>\n<script>\nrun();\n', '<p>Store</p>\n<script>\nrun();\n', inexact('src/pages/script.html')],
    ['src/pages/tag.html', '<p>Save</p>\n<a href="/x"\n', '<p>Store</p>\n<a href="/x"\n', inexact('src/pages/tag.html')],
    ['src/pages/cdata-open.html', '<p>Save</p>\n<svg><![CDATA[ x\n', '<p>Store</p>\n<svg><![CDATA[ x\n', inexact('src/pages/cdata-open.html')],
    // Stylesheets: an unclosed comment, block and string; a closing brace with nothing open.
    ['src/styles/note.css', 'a { color: red; }\n/* note\n', 'a { color: blue; }\n/* note\n', open('src/styles/note.css')],
    ['src/styles/block.css', 'a { color: red; }\nb {\n', 'a { color: blue; }\nb {\n', open('src/styles/block.css')],
    ['src/styles/string.css', 'a { color: red; }\nb { content: "x }\n', 'a { color: blue; }\nb { content: "x }\n', lost('src/styles/string.css')],
    ['src/styles/extra.css', 'a { color: red; }\n}\n', 'a { color: blue; }\n}\n', lost('src/styles/extra.css')],
    // Markdown: a change above an unclosed fence, under one (a guard), an unclosed front
    // matter, a brace beside the change and an unclosed HTML comment in the prose.
    ['docs/fence-below.md', 'Old words.\n\n```\ncode\n', 'New words.\n\n```\ncode\n', open('docs/fence-below.md')],
    ['docs/fence-above.md', '```\ncode\nOld words.\n', '```\ncode\nNew words.\n', open('docs/fence-above.md')],
    ['docs/front-open.md', '---\nOld text.\n', '---\nNew text.\n', open('docs/front-open.md')],
    // Since the sixth round a brace is a plain character to the HTML reader; in Markdown it
    // reaches its own paragraph, so this change beside one is "not recognised", no longer "open".
    ['docs/brace-open.md', 'Old words {{ x\n', 'New words {{ x\n', un('docs/brace-open.md')],
    ['docs/comment-open.md', 'Old words.\n\n<!-- note\n', 'New words.\n\n<!-- note\n', inexact('docs/comment-open.md')],
    // One side well-formed and the other not.
    ['src/pages/one-side.html', '<p>Save</p>\n<!-- c -->\n', '<p>Store</p>\n<!-- c --\n', inexact('src/pages/one-side.html')],
    ['docs/one-side.md', 'Old words.\n\n```\ncode\n```\n', 'New words.\n\n```\ncode\n``\n', open('docs/one-side.md')],
    // Well-formed files still qualify.
    ['src/pages/closed.html', '<p>Save</p>\n<!-- note -->\n<script>run();</script>\n', '<p>Store</p>\n<!-- note -->\n<script>run();</script>\n', null],
    ['docs/closed.md', 'Old words.\n\n```\ncode\n```\n', 'New words.\n\n```\ncode\n```\n', null],
    // A catalogue line whose state at its start is not a fresh entry: inside a YAML block
    // scalar, a quoted value or a flow collection begun above, or a properties value
    // continued from the line above.
    ['i18n/block.yaml', 'desc: |\n  save: Save\n', 'desc: |\n  save: Store\n', lost('i18n/block.yaml')],
    ['i18n/folded.yaml', 'desc: >-\n  save: Save\nnext: Hi\n', 'desc: >-\n  save: Store\nnext: Hi\n', lost('i18n/folded.yaml')],
    ['i18n/quoted.yaml', 'a: "one\n  b: two"\n', 'a: "one\n  b: three"\n', lost('i18n/quoted.yaml')],
    ['i18n/flow.yaml', 'a: [one,\n  b: two]\n', 'a: [one,\n  b: three]\n', lost('i18n/flow.yaml')],
    ['lang/cont.properties', 'a=Save \\\nb=Cancel\n', 'a=Save \\\nb=Close\n', lost('lang/cont.properties')],
    ['i18n/after-block.yaml', 'desc: |\n  Long text.\nsave: Save\n', 'desc: |\n  Long text.\nsave: Store\n', null],
    ['lang/after-cont.properties', 'a=Save \\\n  more\nb=Cancel\n', 'a=Save \\\n  more\nb=Close\n', null],
    // A file emptied is the content of a removal, never wording (found by the cut-short property case).
    ['notes/emptied.txt', 'Old words.\n', '', un('notes/emptied.txt')],
    ['notes/filled.txt', '', 'New words.\n', un('notes/filled.txt')],
    // The owner's decision of 2026-10-09: the check keeps only the formats it reads exactly, so
    // these cases of a removed format (Vue, Svelte, JSX, reStructuredText, Sass, Less, gettext)
    // stay, and each now asserts the "not recognised" refusal.
    ['src/components/Mustache.vue', '<template>\n  <p>Save</p>\n  <p>{{ msg </p>\n</template>\n', '<template>\n  <p>Store</p>\n  <p>{{ msg </p>\n</template>\n', gone('src/components/Mustache.vue')],
    ['src/components/Root.vue', '<template>\n  <p>Save</p>\n', '<template>\n  <p>Store</p>\n', gone('src/components/Root.vue')],
    ['src/components/Brace.jsx', 'export const P = () => <p>Save</p>;\nconst x = {\n', 'export const P = () => <p>Store</p>;\nconst x = {\n', gone('src/components/Brace.jsx')],
    ['src/components/Shut.jsx', 'export const P = () => <p>Save</p>;\n}\n', 'export const P = () => <p>Store</p>;\n}\n', gone('src/components/Shut.jsx')],
    ['src/components/Comment.jsx', 'export const P = () => <p>Save</p>;\n/* note\n', 'export const P = () => <p>Store</p>;\n/* note\n', gone('src/components/Comment.jsx')],
    ['src/components/Unshut.jsx', 'export const P = () => <div><p>Save</p>;\n', 'export const P = () => <div><p>Store</p>;\n', gone('src/components/Unshut.jsx')],
    ['src/components/Line.jsx', 'const s = "abc\nexport const P = () => <p>Save</p>;\n', 'const s = "abc\nexport const P = () => <p>Store</p>;\n', gone('src/components/Line.jsx')],
    ['src/components/Str.jsx', "export const P = () => <p>Save</p>;\nconst s = 'abc", "export const P = () => <p>Store</p>;\nconst s = 'abc", gone('src/components/Str.jsx')],
    ['src/components/Tick.jsx', 'export const P = () => <p>Save</p>;\nconst t = `abc', 'export const P = () => <p>Store</p>;\nconst t = `abc', gone('src/components/Tick.jsx')],
    ['src/components/Re.jsx', 'export const P = () => <p>Save</p>;\nconst q = /abc', 'export const P = () => <p>Store</p>;\nconst q = /abc', gone('src/components/Re.jsx')],
    ['src/components/GenGuard.tsx', 'export const f = <T,>(x: T) => x;\nexport const s = "<b>Save</b>";\n', 'export const f = <T,>(x: T) => x;\nexport const s = "<b>Store</b>";\n', gone('src/components/GenGuard.tsx')],
    ['docs/span-open.rst', 'Old words.\n\nPress :kbd:`Ctrl now.\n', 'New words.\n\nPress :kbd:`Ctrl now.\n', gone('docs/span-open.rst')],
    ['docs/literal-open.rst', 'Old words.\n\nRun ``pip now.\n', 'New words.\n\nRun ``pip now.\n', gone('docs/literal-open.rst')],
    ['docs/closed.rst', 'Old words.\n\nPress :kbd:`Ctrl` now.\n', 'New words.\n\nPress :kbd:`Ctrl` now.\n', gone('docs/closed.rst')],
    ['docs/emptied.rst', 'Old words.\n', '', gone('docs/emptied.rst')]
  ];
  const base = {};
  for (const [p, b] of shapes) base[p] = b;
  const root = makeRepo(base);
  for (const [p, b, n, expected] of shapes) {
    fs.writeFileSync(path.join(root, ...p.split('/')), n);
    const res = await check(root, p);
    fs.writeFileSync(path.join(root, ...p.split('/')), b);
    if (expected === null) assertChecking(res, [p]);
    else assert.equal(res.text, refusal(expected), `${p}: ${JSON.stringify(res)}`);
  }
});

test('round 4: CTOC\'s enforcement list applies only in CTOC\'s own repository', async () => {
  const notes = { 'src/hooks/README.md': '# Hooks\n\nOld notes.\n' };
  const ctoc = makeRepo({ ...notes, 'package.json': '{ "name": "ctoc" }\n', 'CLAUDE.md': '# CTOC Project Instructions\n', '.ctoc/keep.json': '{}\n' });
  fs.writeFileSync(path.join(ctoc, 'src', 'hooks', 'README.md'), '# Hooks\n\nNew notes.\n');
  assert.equal((await check(ctoc, 'src/hooks/README.md')).text,
    refusal('src/hooks/README.md sits in an area named enforcement, and such areas are never a hotfix'));
  const react = makeRepo({ ...notes, 'package.json': '{ "name": "web" }\n', 'CLAUDE.md': '# Web\n', '.ctoc/keep.json': '{}\n' });
  fs.writeFileSync(path.join(react, 'src', 'hooks', 'README.md'), '# Hooks\n\nNew notes.\n');
  assertChecking(await check(react, 'src/hooks/README.md'), ['src/hooks/README.md']);
});

// Renamed at review (2026-10-09): the rows on template literals, Vue and JSX templates and
// Sass now assert that each such file is a kind the check does not recognise.
test('round 3: the whole-file scanners read script escape states, titles, comments, stylesheet strings and Markdown code spans; JSX, Vue, Sass and reStructuredText files are not recognised', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const risk = (f) => `the wording in ${f} contains a number, a price, a web address or an e-mail address`;
  // Every scanner fails closed (2026-10-09): a file that ends inside an unclosed string,
  // template literal, regular expression, script, front matter or fence is unreadable.
  const open = (f) => `I could not read the change (${f} leaves a tag, quote, comment, block, fence or span open)`;
  const shapes = [
    // A script block's escape states: `</script>` inside `<!--<script>` does not end it.
    ['src/pages/escaped.html', '<script><!--<script></script><b>Save</b></script>\n<p>Hi</p>\n', '<script><!--<script></script><b>Store</b></script>\n<p>Hi</p>\n', un('src/pages/escaped.html')],
    ['src/pages/escaped-after.html', '<script><!--<script></script>--></script>\n<p>Save</p>\n', '<script><!--<script></script>--></script>\n<p>Store</p>\n', null],
    ['src/pages/unclosed.html', '<p>Hi</p>\n<script>\nlet a = 1;\n<b>Save</b>\n', '<p>Hi</p>\n<script>\nlet a = 1;\n<b>Store</b>\n', inexact('src/pages/unclosed.html')],
    // A title is wording (the code review, 2026-10-09: it was wrongly refused).
    ['src/pages/title.html', '<title>Save</title>\n', '<title>Store</title>\n', null],
    ['src/pages/tpl.html', '<template><p>Save</p></template>\n', '<template><p>Store</p></template>\n', un('src/pages/tpl.html')],
    // A CDATA section inside `<svg>`: outside the strict subset.
    ['src/pages/cdata.html', '<svg><![CDATA[ a > <b>Save</b> ]]></svg>\n', '<svg><![CDATA[ a > <b>Store</b> ]]></svg>\n', inexact('src/pages/cdata.html')],
    // Catalogue escapes: YAML's \x and \u, a properties file's \u; an unknown or short
    // escape is not wording.
    ['i18n/esc.yaml', 'title: "Save"\n', 'title: "Sto\\x72e"\n', null],
    ['i18n/at.yaml', 'title: "Save"\n', 'title: "Mail \\u0040x"\n', risk('i18n/at.yaml')],
    ['i18n/short.yaml', 'title: "Save"\n', 'title: "Sto\\x7"\n', un('i18n/short.yaml')],
    ['i18n/plain.yaml', 'title: Save\n', 'title: Store: now\n', un('i18n/plain.yaml')],
    ['i18n/hashstart.yaml', 'title: Save\n', 'title: #Store\n', un('i18n/hashstart.yaml')],
    ['lang/uni.properties', 'title=Save\n', 'title=Sto\\u0072e\n', null],
    ['lang/badu.properties', 'title=Save\n', 'title=Sto\\u00zz\n', un('lang/badu.properties')],
    ['locales/ctl.json', '{\n  "title": "Save"\n}\n', '{\n  "title": "Sto\tre"\n}\n', un('locales/ctl.json')],
    // Stylesheets: a colour function in its space form, a string, a colour beside a `url(…)`.
    ['src/styles/space.css', 'a { color: rgb(1 2 3 / 50%); }\n', 'a { color: rgb(1 2 4 / 50%); }\n', null],
    ['src/styles/badfn.css', 'a { color: rgb(1 2 3); }\n', 'a { color: rgb(1 2 3 / 4 / 5); }\n', un('src/styles/badfn.css')],
    ['src/styles/str.css', 'a { color: red; content: "x"; }\n', 'a { color: red; content: "y"; }\n', un('src/styles/str.css')],
    // A pass until the sixth round: the colour is not the whole value of its property, which
    // the functional plan (amended 2026-10-09) refuses as a change the check cannot read exactly.
    ['src/styles/quoted.css', 'a { background: url("one.png") red; }\n', 'a { background: url("one.png") blue; }\n', inexact('src/styles/quoted.css')],
    // Markdown: code spans, unmatched backticks, a JSON front matter never closed, a link
    // target in angle brackets, a full reference, a heading after an indented block.
    ['docs/span.md', 'Run `pip install requests` first.\n', 'Run `pip install reqests` first.\n', un('docs/span.md')],
    ['docs/beside.md', 'Run `npm test` first, ``x`` and ` alone.\n', 'Run `npm test` now, ``x`` and ` alone.\n', null],
    ['docs/open-json.md', '{\n  "title": "Old"\n\nBody old.\n', '{\n  "title": "Old"\n\nBody new.\n', open('docs/open-json.md')],
    // Since the review of 2026-10-09 a destination in angle brackets cannot be read exactly
    // (without its link text it would be a tag).
    ['docs/angle.md', 'See [the guide](<a b.md>) now.\n', 'See [the guide](<a c.md>) now.\n', inexact('docs/angle.md')],
    ['docs/full.md', 'See [the guide][a] now.\n\n[a]: /a\n[b]: /b\n', 'See [the guide][b] now.\n\n[a]: /a\n[b]: /b\n', un('docs/full.md')],
    ['docs/escaped.md', 'See [x](a\\)b) old.\n', 'See [x](a\\)b) new.\n', null],
    ['docs/after-code.md', 'Text.\n\n    code here\n\nOld words.\n', 'Text.\n\n    code here\n\nNew words.\n', null],
    ['docs/unfence.md', '```\ncode\n```\nOld words.\n', '```\ncode\n\nOld words.\n', open('docs/unfence.md')],
    // Instruction files by class, and documentation in any other dot-folder.
    ['docs/GEMINI.local.md', 'Old rule.\n', 'New rule.\n', un('docs/GEMINI.local.md')],
    ['src/copilot-instructions.md', 'Old rule.\n', 'New rule.\n', un('src/copilot-instructions.md')],
    ['.vscode/notes.txt', 'Old note.\n', 'New note.\n', un('.vscode/notes.txt')],
    // GitHub's assistant files stay governing under `.github/`.
    ['.github/instructions/web.instructions.md', 'Old rule.\n', 'New rule.\n', un('.github/instructions/web.instructions.md')],
    ['.github/ISSUE_TEMPLATE/bug.md', 'Describe the old bug.\n', 'Describe the new bug.\n', null],
    // The owner's decision of 2026-10-09: the check keeps only the formats it reads exactly, so
    // these cases of a removed format (Vue, Svelte, JSX, reStructuredText, Sass, Less, gettext)
    // stay, and each now asserts the "not recognised" refusal.
    ['src/components/Tpl.jsx', 'export const T = () => <p className={`a ${b}`}>Save</p>;\n', 'export const T = () => <p className={`a ${b}`}>Store</p>;\n', gone('src/components/Tpl.jsx')],
    ['src/components/Re.jsx', 'const r = /[/]x/g;\nexport const B = () => <br/>;\nexport const P = () => <p>Save</p>;\nconst q = /abc', 'const r = /[/]x/g;\nexport const B = () => <br/>;\nexport const P = () => <p>Store</p>;\nconst q = /abc', gone('src/components/Re.jsx')],
    ['src/components/Str.jsx', "export const P = () => <p>Save</p>;\nconst s = 'abc", "export const P = () => <p>Store</p>;\nconst s = 'abc", gone('src/components/Str.jsx')],
    ['src/components/Tick.jsx', 'export const P = () => <p>Save</p>;\nconst t = `abc', 'export const P = () => <p>Store</p>;\nconst t = `abc', gone('src/components/Tick.jsx')],
    ['src/components/Gen.tsx', 'const f = <T,>(x: T) => x;\nexport const P = () => <p>Save</p>;\n', 'const f = <T,>(x: T) => x;\nexport const P = () => <p>Store</p>;\n', gone('src/components/Gen.tsx')],
    ['src/components/Slot.vue', '<template>\n  <template v-if="a"><p>Save</p></template>\n  <p>Hi</p>\n</template>\n', '<template>\n  <template v-if="a"><p>Store</p></template>\n  <p>Hi</p>\n</template>\n', gone('src/components/Slot.vue')],
    ['src/components/After.vue', '<template>\n  <template v-if="a"><p>Hi</p></template>\n  <p>Save</p>\n</template>\n', '<template>\n  <template v-if="a"><p>Hi</p></template>\n  <p>Store</p>\n</template>\n', gone('src/components/After.vue')],
    ['src/components/Each.svelte', '{#if a}<p>Hi</p>{/if}\n<p>Save</p>\n', '{#if a}<p>Hi</p>{/if}\n<p>Store</p>\n', gone('src/components/Each.svelte')],
    ['translations/esc.po', 'msgid "x"\nmsgstr "Speichern"\n', 'msgid "x"\nmsgstr "Sp\\x65ichern \\101b"\n', gone('translations/esc.po')],
    ['translations/bad.po', 'msgid "x"\nmsgstr "Speichern"\n', 'msgid "x"\nmsgstr "Spei\\qchern"\n', gone('translations/bad.po')],
    ['translations/nohex.po', 'msgid "x"\nmsgstr "Speichern"\n', 'msgid "x"\nmsgstr "Spei\\xzhern"\n', gone('translations/nohex.po')],
    ['src/styles/main.scss', '$brand: #0a58ca; // main\n', '$brand: #0b5ed7; // main\n', gone('src/styles/main.scss')],
    ['src/styles/note.scss', '$brand: #0a58ca; // main\n', '$brand: #0a58ca; // other\n', gone('src/styles/note.scss')],
    ['src/styles/end.scss', 'a { color: #0a58ca; } // main', 'a { color: #0b5ed7; } // main', gone('src/styles/end.scss')],
    ['src/styles/block.sass', 'a\n  color: red\n\n  display: none\n', 'a\n  color: blue\n\n  display: none\n', gone('src/styles/block.sass')],
    ['src/styles/sel.sass', 'nav:hover #add\n  display: none\n', 'nav:hover #bad\n  display: none\n', gone('src/styles/sel.sass')],
    ['src/styles/top.sass', 'color: red\n', 'color: blue\n', gone('src/styles/top.sass')],
    ['docs/sub.rst', 'Title\n=====\n\n.. |logo| raw:: html\n\n   <b>one</b>\n\nOld words.\n', 'Title\n=====\n\n.. |logo| raw:: html\n\n   <b>two</b>\n\nOld words.\n', gone('docs/sub.rst')],
    ['docs/note.rst', 'Title\n=====\n\n.. note::\n\n   Old words.\n', 'Title\n=====\n\n.. note::\n\n   New words.\n', gone('docs/note.rst')],
    ['docs/jinja.rst', 'Title\n=====\n\nOld words.\n', 'Title\n=====\n\nNew {{ words }}.\n', gone('docs/jinja.rst')],
    ['docs/target.rst', 'Old words.\n\n.. _guide: /one\n', 'Old words.\n\n.. _guide: /two\n', gone('docs/target.rst')],
    ['docs/hyper.rst', 'See `Go <a.html>`_ now.\n', 'See `Go <b.html>`_ now.\n', gone('docs/hyper.rst')],
    ['docs/hyper-text.rst', 'See `Go <a.html>`_ now.\n', 'See `Go <a.html>`_ today.\n', gone('docs/hyper-text.rst')],
    ['docs/named.rst', 'See `Guide`_ now.\n', 'See `Other`_ now.\n', gone('docs/named.rst')],
    ['docs/literal.rst', 'Run ``pip install requests`` now.\n', 'Run ``pip install reqests`` now.\n', gone('docs/literal.rst')],
    ['docs/interp.rst', 'Read `old` now.\n', 'Read `new` now.\n', gone('docs/interp.rst')],
    ['docs/default.rst', 'Old words.\n', '.. default-role:: raw-html\n\nOld words.\n', gone('docs/default.rst')]
  ];
  const base = {};
  for (const [p, b] of shapes) base[p] = b;
  const root = makeRepo(base);
  for (const [p, b, n, expected] of shapes) {
    fs.writeFileSync(path.join(root, ...p.split('/')), n);
    const res = await check(root, p);
    fs.writeFileSync(path.join(root, ...p.split('/')), b);
    if (expected === null) assertChecking(res, [p]);
    else assert.equal(res.text, refusal(expected), `${p}: ${JSON.stringify(res)}`);
  }
});

// The fifth round (2026-10-09): the fixes that still apply after the owner's decision to
// keep only the formats the check reads exactly. Each trap answered `checking` on
// `6de2f75c`. [fix, path, base content, new content, the clause, or null for `checking`]
test('round 5: host elements, the element stack, MDX, backtick pairing, block quotes, labels, stylesheet names, colour-named custom properties', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const lost = (f) => `I could not read the change (${f} holds something I cannot follow)`;
  const setting = (f) => `it changes a setting in ${f}, and settings changes are a common cause of outages`;
  const area = (f, word) => `${f} sits in an area named ${word}, and such areas are never a hotfix`;
  const sql = ['SELECT name FROM users', 'SELECT pass FROM admins'];
  const pip = ['pip install requests', 'pip install reqests'];
  const rm = ['rm -rf build', 'rm -rf dist'];
  /** One row from a template holding `@`, replaced by the old and the new text. */
  const row = (fix, p, template, [o, n], expected) => [fix, p, template.replace('@', o), template.replace('@', n), expected];
  const shapes = [
    // 1. Host elements are a fixed list (the 111 HTML element names; since the sixth round
    // `<svg>` and `<math>` are opaque pieces and their names are no host elements), matched in
    // any letter case; an element with an `is` attribute, a custom element and an unknown name
    // hold their text.
    row(1, 'src/pages/is.html', '<button is="run-sql">@</button>\n', sql, inexact('src/pages/is.html')),
    row(1, 'src/pages/is-upper.html', '<P IS="x">@</P>\n', ['Save', 'Store'], inexact('src/pages/is-upper.html')),
    row(1, 'src/pages/runsql.html', '<runsql>@</runsql>\n', sql, inexact('src/pages/runsql.html')),
    row(1, 'src/pages/mixed.html', '<DIV>@</div>\n', ['Save', 'Store'], null),
    // Passes until the sixth round: `<svg>` and `<math>` are opaque pieces now, so text
    // inside them no longer qualifies (the session's decision of 2026-10-09, item 3).
    row(1, 'src/pages/svg-text.html', '<svg><text>@</text><foreignObject><p>x</p></foreignObject></svg>\n', ['Save', 'Store'], inexact('src/pages/svg-text.html')),
    row(1, 'src/pages/math.html', '<math><mtext>@</mtext></math>\n', ['Save', 'Store'], inexact('src/pages/math.html')),
    // 2. A stack of open elements: an end tag that does not close the top of the stack while
    // an element that holds text is open cannot be followed.
    row(2, 'src/pages/stack.html', '<run-sql><div></run-sql>@</div></run-sql>\n', sql, inexact('src/pages/stack.html')),
    row(2, 'docs/stack.md', 'Text.\n\n<run-sql><div></run-sql>@</div></run-sql>\n', sql, inexact('docs/stack.md')),
    row(2, 'src/pages/implied.html', '<ul><li>One<li>@</ul>\n<p>a<br>b</p>\n', ['Save', 'Store'], null),
    // A pass until the review of 2026-10-09: an end tag that closes nothing is outside the
    // strict subset (the reviewer's general rule; a browser makes an empty element for `</p>`).
    row(2, 'src/pages/stray.html', '<p>@</p></b></p>\n', ['Save', 'Store'], inexact('src/pages/stray.html')),
    row(2, 'src/pages/held-implied.html', '<my-card><p>one<p>two</my-card>\n<p>@</p>\n', ['Save', 'Store'], inexact('src/pages/held-implied.html')),
    row(2, 'src/pages/self-closed.html', '<my-widget/>\n<p>@</p>\n', ['Save', 'Store'], inexact('src/pages/self-closed.html')),
    // A pass until the sixth round: a brace inside a tag is outside the strict HTML subset
    // (the session's decision of 2026-10-09, item 1; a browser knows no braces).
    row(2, 'src/pages/braced.html', '<p data-x={a} data-y={`b`}>@</p>\n', ['Save', 'Store'], inexact('src/pages/braced.html')),
    row(2, 'src/pages/after-held.html', '<my-card><p>one</p></my-card>\n<p>@</p>\n', ['Save', 'Store'], null),
    // 3. Markdown that may be built as MDX: a brace in the changed prose and an `import` or
    // `export` block are code.
    row(3, 'docs/mdx-brace.md', 'Hello {eval(@)} there.\n', ['name', 'code'], un('docs/mdx-brace.md')),
    row(3, 'docs/mdx-open.md', 'Hello {\n  eval(@)\n} there.\n', ['name', 'code'], un('docs/mdx-open.md')),
    row(3, 'docs/mdx-beside.md', 'Hello {name}. @ words.\n', ['Old', 'New'], un('docs/mdx-beside.md')),
    row(3, 'docs/mdx-import.md', "import Chart from './@'\n\nWords.\n", ['chart', 'other'], un('docs/mdx-import.md')),
    row(3, 'docs/mdx-wrap.md', "import Chart\n  from './@'\n\nWords.\n", ['chart', 'other'], un('docs/mdx-wrap.md')),
    row(3, 'docs/mdx-export.md', "export const meta = '@'\n\nWords.\n", ['old', 'new'], un('docs/mdx-export.md')),
    row(3, 'docs/mdx-far.md', '<p>Hello {name}</p>\n\n@ words.\n', ['Old', 'New'], null),
    row(3, 'docs/important.md', 'important @ words.\n', ['old', 'new'], null),
    // 4. Backticks pair inside one paragraph or heading, never across a blank line or the
    // start of a block; where a table cell, an escape or a tag makes the pairing uncertain,
    // everything from the first to the last backtick is compared exactly.
    row(4, 'docs/tick-para.md', 'A lone ` here.\n\nRun `@` now.\n', rm, un('docs/tick-para.md')),
    row(4, 'docs/tick-heading.md', '# A lone ` here\nRun `@` now.\n', rm, un('docs/tick-heading.md')),
    row(4, 'docs/tick-list.md', '- a lone ` here\n- run `@` now\n', rm, un('docs/tick-list.md')),
    row(4, 'docs/tick-setext.md', 'A lone ` here\n===\nRun `@` now.\n', rm, un('docs/tick-setext.md')),
    row(4, 'docs/tick-break.md', 'A lone ` here\n* * *\nRun `@` now.\n', rm, un('docs/tick-break.md')),
    row(4, 'docs/tick-quote.md', 'A lone ` here\n> Run `@` now.\n', rm, un('docs/tick-quote.md')),
    // Refused until the review of 2026-10-09 because a table cell might end at the `|`. The
    // line is no table row (no delimiter row follows), and markdown-it reads the first two
    // backticks as the span and the changed words as plain text, as the check now does.
    row(4, 'docs/tick-cell.md', '| ` | `@` |\n', rm, null),
    row(4, 'docs/tick-row.md', '| a | b |\n| - | - |\n| ` | `@` |\n', rm, un('docs/tick-row.md')),
    row(4, 'docs/tick-escape.md', 'A \\` then `@` now.\n', rm, un('docs/tick-escape.md')),
    // Since the review of 2026-10-09 the tag is read first, as a Markdown reader does, and the
    // changed words stand in a code span: code, no longer "cannot read exactly".
    row(4, 'docs/tick-tag.md', 'A <b title="`">x</b> then `@` now.\n', rm, un('docs/tick-tag.md')),
    row(4, 'docs/tick-lazy.md', '> a `@\nc` d\n', ['b', 'x'], un('docs/tick-lazy.md')),
    // An ordered item not numbered 1 after a bullet item starts no item: the span runs on.
    // After another ordered item it does, and each item's lone backtick pairs with nothing.
    // Since the review of 2026-10-09: readers disagree whether `2.` right under a bullet item
    // starts a list or runs the paragraph on, so the file cannot be read exactly.
    row(4, 'docs/tick-second.md', '- a `@\n2. b` c\n', ['b', 'x'], inexact('docs/tick-second.md')),
    row(4, 'docs/tick-third.md', '2. a `@\n3. b` c\n', ['b', 'x'], null),
    row(4, 'docs/tick-wrapped.md', 'Run `rm -rf\n@` now.\n', ['build', 'dist'], un('docs/tick-wrapped.md')),
    row(4, 'docs/tick-indent.md', '> a `@\n    c` d\n', ['b', 'x'], un('docs/tick-indent.md')),
    row(4, 'docs/tick-lazy-rule.md', '- a `@\nb\n===\ny` z\n', ['x', 'w'], un('docs/tick-lazy-rule.md')),
    row(4, 'docs/tick-item-rule.md', '> a\n- b `\n  ===\n  run `@` now\n', rm, un('docs/tick-item-rule.md')),
    row(4, 'docs/tick-import.md', 'a `@\nimport `c` d\n', ['b', 'x'], un('docs/tick-import.md')),
    row(4, 'docs/tick-after-fence.md', '```\ncode\n```\n    @\n', pip, un('docs/tick-after-fence.md')),
    row(4, 'docs/tick-after-heading.md', '# Title\n    @\n', pip, un('docs/tick-after-heading.md')),
    row(4, 'docs/tick-after-quote.md', '>     code\n    @\n', pip, un('docs/tick-after-quote.md')),
    row(4, 'docs/tick-alone.md', 'Run `npm test` first.\n\n@ words with ` alone.\n', ['Old', 'New'], null),
    row(4, 'docs/tick-items.md', '- run `npm test`\n- @ words\n- then `npm start`\n', ['old', 'new'], null),
    // 5. Block quotes are read like the document they quote.
    row(5, 'docs/quote-code.md', '> Install:\n>\n>     @\n', pip, un('docs/quote-code.md')),
    row(5, 'docs/quote-fence.md', '> ~~~\n> @\n> ~~~\n', pip, un('docs/quote-fence.md')),
    row(5, 'docs/quote-doctest.md', '> >>> print("old")\n> @\n', ['old', 'new'], un('docs/quote-doctest.md')),
    row(5, 'docs/quote-list.md', '> - Install:\n>\n>       @\n', pip, un('docs/quote-list.md')),
    row(5, 'docs/quote-nested.md', '> > Install:\n> >\n> >     @\n', pip, un('docs/quote-nested.md')),
    row(5, 'docs/item-quote.md', '- >     @\n', pip, un('docs/item-quote.md')),
    row(5, 'docs/quote-tab.md', '>\t@\n', pip, un('docs/quote-tab.md')),
    row(5, 'docs/quote-deep.md', `${'> '.repeat(40)}@ words.\n`, ['Old', 'New'], un('docs/quote-deep.md')),
    row(5, 'docs/quote-def.md', 'See [@] now.\n\n> [other]: /u/delete\n', ['guide', 'other'], un('docs/quote-def.md')),
    row(5, 'docs/item-def.md', 'See [@] now.\n\n- [other]: /u/delete\n', ['guide', 'other'], un('docs/item-def.md')),
    row(5, 'docs/markers.md', `${'- '.repeat(20)}@ words.\n`, ['Old', 'New'], un('docs/markers.md')),
    row(5, 'docs/quote-prose.md', '> @ words.\n>\n> More words.\n\nAfter.\n', ['Old', 'New'], null),
    row(5, 'docs/quote-after.md', '> ~~~\n> code\n> ~~~\n\n@ words.\n', ['Old', 'New'], null),
    // 6. Link labels fold case as CommonMark does.
    ['6', 'docs/fold.md', 'See [guide] now.\n\n[SS]: /u/delete\n', 'See [ẞ] now.\n\n[SS]: /u/delete\n', un('docs/fold.md')],
    // 7. `listing` and `tt` are code elements.
    row(7, 'src/pages/listing.html', '<listing>@</listing>\n', pip, un('src/pages/listing.html')),
    row(7, 'src/pages/tt.html', '<p>Run <tt>@</tt></p>\n', pip, un('src/pages/tt.html')),
    // 8. A stylesheet's own name: a sensitive word still counts, its plural does not.
    row(8, 'src/styles/login.css', 'a { color: @; }\n', ['red', 'blue'], area('src/styles/login.css', 'login')),
    row(8, 'src/styles/payment.css', 'a { color: @; }\n', ['red', 'blue'], area('src/styles/payment.css', 'payment')),
    row(8, 'src/styles/tokens.css', 'a { color: @; }\n', ['red', 'blue'], null),
    row(8, 'src/tokens/base.css', 'a { color: @; }\n', ['red', 'blue'], area('src/tokens/base.css', 'token')),
    // 9. A custom property named for a colour, holding exactly one colour before and after,
    // is a colour; one whose value is not exactly one colour cannot be read exactly (the
    // functional plan's sentence since the sixth round); every other custom-property change
    // is a setting.
    row(9, 'src/styles/enabled.css', ':root { --enabled: @; }\n', ['green', 'red'], setting('src/styles/enabled.css')),
    row(9, 'src/styles/mode.css', ':root { --mode: @; }\n', ['red', 'lime'], setting('src/styles/mode.css')),
    row(9, 'src/styles/color-mode.css', ':root { --color-mode: @; }\n', ['dark', 'light'], inexact('src/styles/color-mode.css')),
    row(9, 'src/styles/two-tokens.css', ':root { --brand-color: @; }\n', ['red', 'red url(x)'], inexact('src/styles/two-tokens.css')),
    row(9, 'src/styles/var.css', ':root { --color-a: var(--@); }\n', ['b', 'c'], inexact('src/styles/var.css')),
    row(9, 'src/styles/important.css', ':root { --color-a: @ !important; }\n', ['red', 'blue'], inexact('src/styles/important.css')),
    row(9, 'src/styles/important-added.css', ':root { --color-a: @; }\n', ['red', 'blue !important'], inexact('src/styles/important-added.css')),
    row(9, 'src/styles/commented.css', ':root { --color-a: @ /* x */; }\n', ['red', 'blue'], inexact('src/styles/commented.css')),
    row(9, 'src/styles/renamed.css', ':root { --color-@: red; }\n', ['a', 'b'], setting('src/styles/renamed.css')),
    row(9, 'src/styles/bad-function.css', ':root { --color-a: @; }\n', ['red', 'oklch(60% 0.2)'], inexact('src/styles/bad-function.css')),
    row(9, 'src/styles/and-more.css', ':root { --color-a: @; }\na { width: 1px; }\n', ['red', 'blue; }\na { width: 2px; }\nb { --x: y'], setting('src/styles/and-more.css')),
    row(9, 'src/styles/string-open.css', 'a { color: @; }\nb { content: "x', ['red', 'blue'], 'I could not read the change (src/styles/string-open.css leaves a tag, quote, comment, block, fence or span open)'),
    row(9, 'src/styles/ruleset.css', ':root { --color-a: { color: @ } }\n', ['red', 'blue'], lost('src/styles/ruleset.css')),
    row(9, 'src/styles/color-brand.css', ':root {\n  --color-brand: @;\n}\n', ['#0b5ed7', '#1a73e8'], null),
    row(9, 'src/styles/button-colour.css', ':root { --button-colour: @; }\n', ['red', 'blue'], null),
    row(9, 'src/styles/upper.css', ':root { --Brand-COLOR: @; }\n', ['RED', 'Transparent'], null),
    row(9, 'src/styles/functions.css', ':root { --color-a: @; }\n', ['hwb(120 0% 0% / 0.5)', 'oklch(60% 0.2 240)'], null),
    row(9, 'src/styles/spaces.css', ':root { --color-a: @; }\n', ['lab(50% 40 59)', 'color(display-p3 1 0.5 0 / 50%)'], null),
    [9, 'src/styles/both.css', ':root { --color-a: red; }\na { color: red; }\n', ':root { --color-a: blue; }\na { color: blue; }\n', null],
    [9, 'src/styles/both-bad.css', ':root { --color-a: red; }\na { width: 1px; }\n', ':root { --color-a: blue; }\na { width: 2px; }\n', un('src/styles/both-bad.css')]
  ];
  const base = {};
  for (const [, p, b] of shapes) base[p] = b;
  const root = makeRepo(base);
  const wrong = [];
  for (const [fix, p, b, n, expected] of shapes) {
    fs.writeFileSync(path.join(root, ...p.split('/')), n);
    const res = await check(root, p);
    fs.writeFileSync(path.join(root, ...p.split('/')), b);
    const want = expected === null ? STATUS_LINE : refusal(expected);
    if (res.text !== want) wrong.push(`fix ${fix} ${p}: ${res.verdict === 'checking' ? 'checking' : res.text}`);
    else if (expected === null) assertChecking(res, [p]);
  }
  assert.deepEqual(wrong, []);
});

// The sixth round (2026-10-09): the strict HTML subset (the session's design decision: the
// HTML reader accepts only what it reads as a browser's parser does, and refuses the whole
// file for anything else), Markdown imports, autolinks, headings and paragraphs, folded and
// camel-case paths, and the functional plan's sentence for a change the check cannot read
// exactly. Each row marked `red` answered otherwise on `5326daae`; the others are guards.
// [item, path, base content, new content, the clause, or null for `checking`]
test('round 6: the strict HTML subset, Markdown imports, autolinks, headings and paragraphs, folded paths, the cannot-read-exactly sentence', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const exact = (f) => `it changes ${f} in a way the check cannot read exactly, and only what it can read exactly qualifies`;
  const setting = (f) => `it changes a setting in ${f}, and settings changes are a common cause of outages`;
  const area = (f, word) => `${f} sits in an area named ${word}, and such areas are never a hotfix`;
  const sql = ['SELECT name FROM users', 'SELECT pass FROM admins'];
  const pip = ['pip install requests', 'pip install reqests'];
  const save = ['Save', 'Store'];
  const words = ['Old', 'New'];
  const run = ['run()', 'drop()'];
  /** One row from a template holding `@`, replaced by the old and the new text. */
  const row = (item, p, template, [o, n], expected) => [item, p, template.replace('@', o), template.replace('@', n), expected];
  const shapes = [
    // 1. A brace inside a tag is outside the subset; in text it is a plain character.
    row(1, 'src/pages/brace-tag.html', '<button { is="run-sql" }>@</button>\n', sql, exact('src/pages/brace-tag.html')),
    row(1, 'src/pages/brace-el.html', '{<run-sql>}<span>@</span></run-sql>\n', sql, exact('src/pages/brace-el.html')),
    row(1, 'src/pages/brace-script.html', '{<script>/*}<b></b>*/ @ /*<b></b>*/</script>\n', run, un('src/pages/brace-script.html')),
    row(1, 'src/pages/brace-quoted.html', '<p title="{a}">@</p>\n', save, exact('src/pages/brace-quoted.html')),
    row(1, 'src/pages/brace-text.html', '<p>{a}</p>\n<p>@</p>\n', save, null),
    row(1, 'src/pages/brace-same.html', '<p>{a} @</p>\n', save, un('src/pages/brace-same.html')),
    // 2. Anything starting `<!` but `<!DOCTYPE html>` and a standard comment; `<?`; `</` before
    // no letter; the same inside a script block; a closing tag ends only before HTML white space.
    row(2, 'src/pages/comment-abrupt.html', '<!--><run-sql>--><span>@</span></run-sql>\n', sql, exact('src/pages/comment-abrupt.html')),
    row(2, 'src/pages/comment-abrupt-dash.html', '<!---><run-sql>--><span>@</span></run-sql>\n', sql, exact('src/pages/comment-abrupt-dash.html')),
    row(2, 'src/pages/comment-bang.html', '<!-- a --!><run-sql> --><span>@</span></run-sql>\n', sql, exact('src/pages/comment-bang.html')),
    row(2, 'src/pages/comment-nested.html', '<!-- a <!-- b --><p>@</p>\n', save, exact('src/pages/comment-nested.html')),
    row(2, 'src/pages/cdata.html', '<![CDATA[><run-sql>]]><span>@</span></run-sql>\n', sql, exact('src/pages/cdata.html')),
    row(2, 'src/pages/php.html', '<?php echo 1 ?><p>@</p>\n', save, exact('src/pages/php.html')),
    row(2, 'src/pages/bogus.html', '<!x><p>@</p>\n', save, exact('src/pages/bogus.html')),
    row(2, 'src/pages/bogus-end.html', '</ x><p>@</p>\n', save, exact('src/pages/bogus-end.html')),
    row(2, 'src/pages/doctype-legacy.html', '<!DOCTYPE html PUBLIC "x">\n<p>@</p>\n', save, exact('src/pages/doctype-legacy.html')),
    row(2, 'src/pages/script-abrupt.html', '<script><!--> x</script>\n<p>@</p>\n', save, exact('src/pages/script-abrupt.html')),
    row(2, 'src/pages/script-nested.html', '<script><!-- a <!-- b --></script>\n<p>@</p>\n', save, exact('src/pages/script-nested.html')),
    row(2, 'src/pages/script-bang.html', '<script><!-- a --!> b --></script>\n<p>@</p>\n', save, exact('src/pages/script-bang.html')),
    row(2, 'src/pages/script-space.html', '<script>x</script ><b></b>@<b></b></script>\n', run, un('src/pages/script-space.html')),
    row(2, 'src/pages/style-space.html', '<style>x</style ><b></b>@<b></b></style>\n', save, un('src/pages/style-space.html')),
    row(2, 'src/pages/doctype.html', '<!DocType HTML>\n<!-- a - b -- c -->\n<!---->\n<p>@</p>\n', save, null),
    row(2, 'src/pages/script-comment.html', '<script><!--\nx();\n//--></script>\n<p>@</p>\n', save, null),
    row(2, 'docs/comment.md', 'Text.\n\n<!--><run-sql>--><span>@</span></run-sql>\n', sql, exact('docs/comment.md')),
    // 3. `<svg>` and `<math>` are opaque from their start tag to their matching end tag; the
    // host elements are HTML's only; inside foreign content nothing HTML is followed.
    row(3, 'src/pages/svg-pre.html', '<svg><style><pre></style><span>@</span></pre></svg>\n', pip, exact('src/pages/svg-pre.html')),
    row(3, 'src/pages/unknown.html', '<unknown>@</unknown>\n', save, exact('src/pages/unknown.html')),
    row(3, 'src/pages/set.html', '<set>@</set>\n', save, exact('src/pages/set.html')),
    row(3, 'src/pages/text.html', '<text>@</text>\n', save, exact('src/pages/text.html')),
    row(3, 'src/pages/svg-open.html', '<svg><g>\n<p>@</p>\n', save, exact('src/pages/svg-open.html')),
    row(3, 'src/pages/svg-title-tag.html', '<svg><title><b></title></svg>\n<p>@</p>\n', save, exact('src/pages/svg-title-tag.html')),
    row(3, 'src/pages/svg-foreign-object.html', '<svg><foreignObject><p>x</p></foreignObject></svg>\n<p>@</p>\n', save, exact('src/pages/svg-foreign-object.html')),
    row(3, 'src/pages/svg-unquoted.html', '<svg><g x=1/></svg>\n<p>@</p>\n', save, exact('src/pages/svg-unquoted.html')),
    row(3, 'src/pages/svg-after.html', '<svg viewBox="0 0 1 1"><title>Close</title><g><path d="M0 0"/></g></svg>\n<math><mi>x</mi></math>\n<svg/>\n<p>@</p>\n', save, null),
    row(3, 'src/pages/svg-label.html', '<p>Save</p>\n<svg><title>@</title></svg>\n', ['Close', 'Shut'], exact('src/pages/svg-label.html')),
    // Inside `<select>` only options are followed: an older parser ignores every other tag there.
    row(3, 'src/pages/select-style.html', '<select><style><script>/*</style>*/ @ /*<b></b>*/</script></select>\n', run, exact('src/pages/select-style.html')),
    row(3, 'src/pages/select-end.html', '<div><select></div><style><script>/*</style>*/ @ /*<b></b>*/</script>\n', run, exact('src/pages/select-end.html')),
    row(3, 'src/pages/select-ok.html', '<select><optgroup label="a"><option value="m">@</option></optgroup><hr></select>\n', ['Middle', 'Medium'], null),
    // An element never closed is outside the subset (the functional plan's scenario); an end
    // tag that closes several elements is everyday HTML.
    row(4, 'src/pages/open-div.html', '<div>\n<p>@</p>\n', save, exact('src/pages/open-div.html')),
    row(4, 'src/pages/implied-list.html', '<ul><li>One<li>@</ul>\n', save, null),
    row(4, 'src/pages/card.html', '<my-card>@</my-card>\n', save, exact('src/pages/card.html')),
    // 5. A changed line that starts `import ` or `export ` is code wherever it stands.
    row(5, 'docs/import-heading.md', "# Title\nimport Chart from './@'\n", ['chart', 'other'], un('docs/import-heading.md')),
    row(5, 'docs/import-wrapped.md', "# Title\nimport Chart\n  from './@'\n", ['chart', 'other'], un('docs/import-wrapped.md')),
    row(5, 'docs/import-fence.md', "```\ncode\n```\nexport const meta = '@'\n", ['old', 'new'], un('docs/import-fence.md')),
    row(5, 'docs/import-mid.md', 'We\nimport @ goods.\n', ['old', 'new'], un('docs/import-mid.md')),
    row(5, 'docs/important-heading.md', '# Title\nimportant @ words.\n', ['old', 'new'], null),
    // 6. An autolink is one opaque piece. A placeholder such as `<file>` inside a paragraph
    // holds the rest of its own paragraph only; one that starts a line holds the rest of the file.
    row(6, 'docs/autolink.md', 'See <https://example.org/guide> first.\n\n@ words.\n', words, null),
    row(6, 'docs/autolink-same.md', 'See <http://example.org/guide> and the @ words.\n', ['old', 'new'], null),
    [6, 'docs/autolink-mail.md', 'Write to <mailto:team@example.org> or <team@example.org>.\n\nOld words.\n', 'Write to <mailto:team@example.org> or <team@example.org>.\n\nNew words.\n', null],
    row(6, 'docs/autolink-own.md', 'See <https://example.org/@> first.\n', ['guide', 'other'], un('docs/autolink-own.md')),
    // No autolink (a space inside), and no tag a Markdown reader passes on: read as a
    // placeholder, which its paragraph's end closes.
    // A pass until the review of 2026-10-09: what is neither an autolink nor a tag for a
    // Markdown reader is outside the strict subset.
    row(6, 'docs/autolink-space.md', 'See <https://example.org/a b> first.\n\n@ words.\n', words, exact('docs/autolink-space.md')),
    row(6, 'docs/autolink-space-same.md', 'See <https://example.org/a b> @.\n', ['first', 'now'], exact('docs/autolink-space-same.md')),
    row(6, 'docs/placeholder.md', 'Edit <file> and <your-name> then save.\n\n@ words.\n', words, null),
    row(6, 'docs/placeholder-closed.md', 'Edit <file>x</file> and <name> then save.\n\n@ words.\n', words, null),
    row(6, 'docs/placeholder-same.md', 'Edit <file> then @.\n', ['save', 'store'], exact('docs/placeholder-same.md')),
    row(6, 'docs/placeholder-block.md', '<file>\n\n@ words.\n', words, exact('docs/placeholder-block.md')),
    row(6, 'docs/placeholder-item.md', '- <file>\n\n@ words.\n', words, exact('docs/placeholder-item.md')),
    row(6, 'docs/placeholder-object.md', 'Use <object><runsql> here.\n\n@ words.\n', words, exact('docs/placeholder-object.md')),
    row(6, 'docs/placeholder-div.md', 'Use <div> and <runsql> here.\n\n@ words.\n', words, exact('docs/placeholder-div.md')),
    row(6, 'docs/placeholder-end.md', 'Use </p> and <runsql> here.\n\n@ words.\n', words, exact('docs/placeholder-end.md')),
    row(6, 'docs/placeholder-center.md', 'Use <center> and <runsql> here.\n\n@ words.\n', words, exact('docs/placeholder-center.md')),
    // Refused until the review of 2026-10-09. The fence ends the paragraph, the paragraph's end
    // closes the placeholder as a browser does, and markdown-it and parse5 read the changed
    // words as plain text of a paragraph of their own, as the check now does.
    row(6, 'docs/placeholder-code-line.md', 'Use <runsql> here\n```\ncode\n```\n@ words.\n', words, null),
    // 7. A changed heading qualifies only when its generated anchor stays the same.
    row(7, 'docs/heading.md', '# @\n\nWords.\n', ['Install', 'Setup'], exact('docs/heading.md')),
    row(7, 'docs/heading-typo.md', '## Getting @\n\nWords.\n', ['started', 'going'], exact('docs/heading-typo.md')),
    row(7, 'docs/heading-setext.md', '@\n=======\n\nWords.\n', ['Install', 'Upgrade'], exact('docs/heading-setext.md')),
    row(7, 'docs/heading-quote.md', '> # @\n\nWords.\n', ['Install', 'Upgrade'], exact('docs/heading-quote.md')),
    row(7, 'docs/heading-item.md', '- ## @\n\nWords.\n', ['Install', 'Upgrade'], exact('docs/heading-item.md')),
    row(7, 'docs/heading-reference.md', '# The @\n\nWords.\n', ['copy', '&copy;'], exact('docs/heading-reference.md')),
    row(7, 'docs/heading-caps.md', '# @\n\nWords.\n', ['instal the App', 'Instal the app'], null),
    row(7, 'docs/heading-setext-caps.md', '@\n---\n\nWords.\n', ['instal the App', 'Instal the app'], null),
    row(7, 'docs/heading-marks.md', '# Install@\n\nWords.\n', ['.', '!'], null),
    row(7, 'docs/heading-below.md', '# Install\n\n@ words.\n', words, null),
    // 8. A brace reaches its own paragraph, and an expression left open reaches what follows it.
    row(8, 'docs/brace-far.md', 'Hello {name} there.\n\n@ words.\n', words, null),
    row(8, 'docs/brace-before.md', '@ words.\n\nHello {name} there.\n', words, null),
    row(8, 'docs/brace-same.md', 'Hello {name}. @ words.\n', words, un('docs/brace-same.md')),
    row(8, 'docs/brace-same-wrapped.md', 'Hello {name}.\n@ words.\n', words, un('docs/brace-same-wrapped.md')),
    row(8, 'docs/brace-open.md', '{/*\n\n@ words.\n\n*/}\n', words, un('docs/brace-open.md')),
    row(8, 'docs/brace-string.md', 'Hello {"}" +\n\n@\n\n} there.\n', ['run', 'drop'], un('docs/brace-string.md')),
    row(8, 'docs/brace-liquid.md', '{% if a %}\n\n{{ name }}\n\n@ words.\n', words, null),
    // 9 and 10. The path is folded (Unicode NFKC, lower case) and split at every character
    // that is no letter; camel-case sub-words count as words too.
    row(9, 'ＡＵＴＨ/index.html', '<p>@</p>\n', save, area('ＡＵＴＨ/index.html', 'auth')),
    row(9, 'src/état/index.html', '<p>@</p>\n', save, null),
    row(10, 'src/pages/AuthPanel.html', '<p>@</p>\n', save, area('src/pages/AuthPanel.html', 'auth')),
    row(10, 'src/pages/paymentForm.html', '<p>@</p>\n', save, area('src/pages/paymentForm.html', 'payment')),
    row(10, 'src/pages/userTokens.html', '<p>@</p>\n', save, area('src/pages/userTokens.html', 'token')),
    row(10, 'src/pages/Author.html', '<p>@</p>\n', save, null),
    row(10, 'src/styles/brandTokens.css', 'a { color: @; }\n', ['red', 'blue'], null),
    // The functional plan's fifth case: a colour that is not the whole value of a colour
    // property, and a colour-named custom property whose value is not exactly one colour.
    row('colour', 'src/styles/border.css', '.save { border: 1px solid @; }\n', ['#0a58ca', '#0b5ed7'], exact('src/styles/border.css')),
    row('colour', 'src/styles/shadow.css', 'a { box-shadow: 0 0 2px @; }\n', ['red', 'blue'], exact('src/styles/shadow.css')),
    row('colour', 'src/styles/two-tokens.css', ':root { --brand-color: @; }\n', ['red', 'red url(x)'], exact('src/styles/two-tokens.css')),
    row('colour', 'src/styles/color-mode.css', ':root { --color-mode: @; }\n', ['dark', 'light'], exact('src/styles/color-mode.css')),
    row('colour', 'src/styles/enabled.css', ':root { --enabled: @; }\n', ['green', 'red'], setting('src/styles/enabled.css')),
    row('colour', 'src/styles/whole.css', 'a { border: @; outline-color: @ }\n', ['red', 'blue'], null),
    row('colour', 'src/styles/important.css', 'a { color: @ !important; }\n', ['red', 'blue'], null),
    row('colour', 'src/styles/width.css', 'a { width: @; }\n', ['#fff', '#000'], un('src/styles/width.css'))
  ];
  const base = {};
  for (const [, p, b] of shapes) base[p] = b;
  const root = makeRepo(base);
  const wrong = [];
  for (const [item, p, b, n, expected] of shapes) {
    fs.writeFileSync(path.join(root, ...p.split('/')), n);
    const res = await check(root, p);
    fs.writeFileSync(path.join(root, ...p.split('/')), b);
    const want = expected === null ? STATUS_LINE : refusal(expected);
    if (res.text !== want) wrong.push(`item ${item} ${p}: ${res.verdict === 'checking' ? 'checking' : res.text}`);
    else if (expected === null) assertChecking(res, [p]);
  }
  assert.deepEqual(wrong, []);
  // The sentence a person reads is one plain sentence, and the log keeps today's cause words.
  fs.writeFileSync(path.join(root, 'src/pages/card.html'), '<my-card>Store</my-card>\n');
  assert.equal((await check(root, 'src/pages/card.html')).text,
    'I did not treat this as a hotfix because it changes src/pages/card.html in a way the check cannot read exactly, '
    + 'and only what it can read exactly qualifies; it goes through a normal plan, and your edits stay in place, not committed.');
  fs.writeFileSync(path.join(root, 'src/pages/open-div.html'), '<div>\n<p>Store</p>\n');
  await check(root, 'src/pages/open-div.html');
  fs.writeFileSync(path.join(root, 'src/styles/two-tokens.css'), ':root { --brand-color: red url(x); }\n');
  await check(root, 'src/styles/two-tokens.css');
  assert.deepEqual(logLines(root).slice(-3).map((l) => l.cause), ['unrecognised', 'unreadable', 'setting']);
});

// The seventh round (2026-10-09, the decision at review): the reader is held to real parsers
// by the differential test (tests/hotfix-check-differential.test.js); these rows pin the
// classes it found and the three false refusals it let go. Each row marked `red` answered
// otherwise on `e43ea9ae`; the others are guards.
// [item, path, base content, new content, the clause, or null for `checking`]
test('round 7: names, frames, options, noscript, end tags, text over lines and beside comments; Markdown read as its reader renders it', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const exact = (f) => `it changes ${f} in a way the check cannot read exactly, and only what it can read exactly qualifies`;
  const save = ['Save', 'Store'];
  const words = ['Old', 'New'];
  const pip = ['pip install requests', 'pip install reqests'];
  const row = (item, p, template, [o, n], expected) => [item, p, template.replace('@', o), template.replace('@', n), expected];
  const shapes = [
    // 1. Names are lower-cased in ASCII only: `lin` with the Kelvin sign is no `link` (red).
    row(1, 'src/pages/kelvin.html', '<linK>@</linK>\n', save, exact('src/pages/kelvin.html')),
    row(1, 'src/pages/upper-link.html', '<LINK rel="x"><p>@</p>\n', save, null),
    // 2. `<frameset>` and `<frame>` refuse the file: a browser may drop the body for them (red).
    row(2, 'src/pages/frames.html', '<div></div><frameset></frameset>\n<p>@</p>\n', save, exact('src/pages/frames.html')),
    // 3. Inside a `<select>` text is wording only in an `<option>` with a `value` (red); an
    // `<option>` on top of the stack is closed by the next one and by the end of its list.
    row(3, 'src/pages/select-text.html', '<select>@</select>\n', ['Choose', 'Pick'], un('src/pages/select-text.html')),
    row(3, 'src/pages/option-text.html', '<select><option>@</select>\n', ['Small', 'Little'], un('src/pages/option-text.html')),
    row(3, 'src/pages/option-valued.html', '<select><option value="a">@<option value="b">Two<hr><optgroup label="x"><option value="c">Three</select>\n', ['One', 'First'], null),
    row(3, 'src/pages/datalist.html', '<datalist><option value="a">@<option value="b">Two</datalist>\n', ['One', 'First'], null),
    // 4. The content of `<noscript>` must itself be markup of the subset, every element
    // closed: a browser without scripting reads it as markup (red).
    row(4, 'src/pages/noscript-open.html', '<noscript><code></noscript><p>@</p></code>\n', pip, exact('src/pages/noscript-open.html')),
    row(4, 'src/pages/noscript-comment.html', '<noscript><!-- </noscript> --></noscript><p>@</p>\n', save, exact('src/pages/noscript-comment.html')),
    row(4, 'src/pages/noscript-ok.html', '<noscript><img src="/pixel.png" alt=""></noscript>\n<p>@</p>\n', save, null),
    // 5. An end tag closes the element on top of the stack, or the elements that may leave
    // their end tag out before it; every other end tag refuses the file (red), and so does a
    // start tag for which a browser would close an element that is not on top (red).
    row(5, 'src/pages/misnested.html', '<b><p>One</b>@</p>\n', save, exact('src/pages/misnested.html')),
    row(5, 'src/pages/stray-end.html', '<p>@</p></div>\n', save, exact('src/pages/stray-end.html')),
    row(5, 'src/pages/through.html', '<p><span>One<div>@</div></span></p>\n', save, exact('src/pages/through.html')),
    row(5, 'src/pages/second-link.html', '<a href="/a"><span>One<a href="/b">@</a></span></a>\n', save, exact('src/pages/second-link.html')),
    row(5, 'src/pages/list-through.html', '<ul><li><span>One<li>@</span></ul>\n', save, exact('src/pages/list-through.html')),
    row(5, 'src/pages/form-in-form.html', '<form><div><form>One</form>@</div></form>\n', save, exact('src/pages/form-in-form.html')),
    row(5, 'src/pages/cell-alone.html', '<div><td>@</td></div>\n', save, exact('src/pages/cell-alone.html')),
    row(5, 'src/pages/table-in-table.html', '<table><tr><td>One</td></tr><table><tr><td>@</td></tr></table></table>\n', save, exact('src/pages/table-in-table.html')),
    row(5, 'src/pages/column-text.html', '<table><colgroup>x</colgroup><tr><td>@</td></tr></table>\n', save, exact('src/pages/column-text.html')),
    row(5, 'src/pages/ruby-through.html', '<ruby>a<p>b<rt>@</ruby>\n', save, exact('src/pages/ruby-through.html')),
    row(5, 'src/pages/after-body.html', '<html><body><p>One</p></body>@</html>\n', save, exact('src/pages/after-body.html')),
    row(5, 'src/pages/body-is.html', '<p>@</p>\n<body is="x"></body>\n', save, exact('src/pages/body-is.html')),
    // The end tags that may be left out, each as the HTML parser reads it (guards).
    row(5, 'src/pages/ends-list.html', '<ul><li><p>One<li>@</ul>\n<ol><li>a</li><li>b</ol>\n', save, null),
    row(5, 'src/pages/ends-paragraph.html', '<div><p>One<p>@</div>\n<blockquote><p>q</blockquote>\n', save, null),
    row(5, 'src/pages/ends-definitions.html', '<dl><dt>One<dd>@<dt>a<dd>b</dl>\n', save, null),
    row(5, 'src/pages/ends-ruby.html', '<ruby>a<rp>(<rt>@<rp>)</ruby>\n', save, null),
    row(5, 'src/pages/ends-table.html', '<table><caption>c<colgroup><col><thead><tr><th>@<tbody><tr><td>a<td>b<tr><td>c<tfoot><tr><td>d</table>\n', save, null),
    row(5, 'src/pages/ends-document.html', '<!DOCTYPE html>\n<html><head><title>T</title><body><h1>One<h2>@</h2><p>last</html>\n', save, null),
    row(5, 'src/pages/closes-own.html', '<p><a href="/a">One<a href="/b">@</a></p>\n<button>x<button>y</button>\n', save, null),
    // A table in a paragraph: under `<!DOCTYPE html>` it closes the paragraph, without one a
    // browser nests it (quirks mode), so the paragraph's `is` attribute holds its text.
    row(5, 'src/pages/standards-table.html', '<!DOCTYPE html>\n<p is="x">One<table><tr><td>@</td></tr></table>\n', save, null),
    row(5, 'src/pages/quirks-table.html', '<p is="x">One<table><tr><td>@</td></tr></table></p>\n', save, exact('src/pages/quirks-table.html')),
    // 6. The three false refusals let go: text over several lines (red), a plain character
    // reference in the changed sentence (red), text beside a comment (red).
    row(6, 'src/pages/two-lines.html', '<p>\n  @ your work\n  now\n</p>\n', save, null),
    row(6, 'src/pages/reference.html', '<p>Terms &amp; @ &mdash; read them&hellip;</p>\n', ['rules', 'conditions'], null),
    row(6, 'src/pages/beside-comment.html', '<p>Save<!-- note --> @</p>\n', ['now', 'today'], null),
    // A reference that may spell a digit, a currency sign or an `@`, or lacks its semicolon, still refuses.
    row(6, 'src/pages/reference-at.html', '<p>Mail us &commat; @</p>\n', ['home', 'work'], un('src/pages/reference-at.html')),
    row(6, 'src/pages/reference-open.html', '<p>Terms &amp @</p>\n', ['rules', 'conditions'], un('src/pages/reference-open.html')),
    // Text that comes or goes whole is no reworded text.
    row(6, 'src/pages/emptied.html', '<table>@<tr><td>a</td></tr></table>\n', ['x', ' '], un('src/pages/emptied.html')),
    // 7. Markdown, script text: an `export` line is a paragraph for a Markdown reader, and the
    // `<script>` under it starts an HTML block that a blank line does not end (red).
    row(7, 'docs/export-script.md', 'export const x = y\n<script>\n\n@\n</script>\n', ['alpha', 'zulu'], un('docs/export-script.md')),
    row(7, 'docs/doctest-script.md', '>>> x\n<script>\n\n@\n</script>\n', ['alpha', 'zulu'], un('docs/doctest-script.md')),
    // An HTML block is raw: a fence or a code span inside it is no code, and its tags count (red).
    row(7, 'docs/block-fence.md', '<div>\n```\n<code>\n```\n</div>\n\n@ words.\n', words, exact('docs/block-fence.md')),
    row(7, 'docs/block-span.md', '<div>\n`<code>`\n</div>\n\n@ words.\n', words, exact('docs/block-span.md')),
    row(7, 'docs/block-autolink.md', '<div>\n<https://example.org/x>\n</div>\n\n@ words.\n', words, exact('docs/block-autolink.md')),
    // 8. A definition or a label over several lines (red).
    row(8, 'docs/def-lines.md', '[\nguide]: /@\n\nWords.\n', ['one', 'two'], exact('docs/def-lines.md')),
    row(8, 'docs/label-lines.md', 'See [@\nguide] now.\n\n[the guide]: /u\n', ['the', 'a'], un('docs/label-lines.md')),
    row(8, 'docs/label-target.md', 'See [the guide](/@) now.\n\n[the guide]: /u\n', ['one', 'two'], un('docs/label-target.md')),
    // 9. A tag split across block quote lines: the markers are no part of it (red).
    row(9, 'docs/quote-tag.md', '> <a\n> href="/@">link</a>\n', ['one', 'two'], un('docs/quote-tag.md')),
    // 10. Continuation and code: a quoted line under a lazy line continues the paragraph and
    // may underline it into a heading (red); an indented line under a definition, a finished
    // HTML block or a table is code (red); a lazy line is prose.
    row(10, 'docs/lazy-underline.md', '> @\nmore\n> ---\n', ['Install', 'Upgrade'], exact('docs/lazy-underline.md')),
    row(10, 'docs/def-code.md', '[guide]: /u\n    @\n', pip, un('docs/def-code.md')),
    row(10, 'docs/comment-code.md', '<!-- note -->\n    @\n', pip, un('docs/comment-code.md')),
    row(10, 'docs/table-code.md', '| a | b |\n| - | - |\n| c | d |\n    @\n', pip, un('docs/table-code.md')),
    row(10, 'docs/lazy-quote.md', '> A quote that\nruns @ lazily.\n\nAfter.\n', ['on', 'along'], null),
    row(10, 'docs/lazy-item.md', '- an item that\nruns @ lazily\n- the next item\n', ['on', 'along'], null),
    row(10, 'docs/lazy-none.md', '> ```\n> code\n> ```\n@ words.\n', words, null),
    // Under a quote inside a quote, a line four columns in that would start a block:
    // markdown-it ends both quotes and reads it as code, CommonMark's text makes it a lazy line (red).
    row(10, 'docs/lazy-nested.md', '> > Quote\n    <div>@</div>\n', save, exact('docs/lazy-nested.md')),
    row(10, 'docs/lazy-indented.md', '> Quote\n    <b>@</b> lazily\n', save, null),
    // 11. What a Markdown reader does not pass on as a tag is none: an end tag behind a
    // backslash leaves the code element open (red); an image's text is an attribute (red).
    row(11, 'docs/escaped-end.md', 'Run <code>x\\</code> and @ it.</code>\n', ['save', 'store'], un('docs/escaped-end.md')),
    row(11, 'docs/image-text.md', '![The @ logo](/logo.png)\n', ['old', 'new'], un('docs/image-text.md')),
    row(11, 'docs/image-beside.md', '![The logo](/logo.png) <br> The @ words.\n', ['old', 'new'], null),
    // 12. The tags a Markdown reader makes count: an end tag inside a paragraph closes nothing
    // outside it (red); a list item's paragraph may or may not get a `<p>`, so a placeholder
    // left open in it cannot be read exactly.
    row(12, 'docs/end-in-paragraph.md', '<x-box>\n\nText </x-box> and @ words.\n', ['old', 'new'], exact('docs/end-in-paragraph.md')),
    row(12, 'docs/item-placeholder.md', '- Use <file> here\n  <div>@</div>\n', words, exact('docs/item-placeholder.md')),
    row(12, 'docs/details.md', '<details>\n<summary>More</summary>\n\nThe @ words.\n\n</details>\n', ['old', 'new'], null),
    row(12, 'docs/table.md', '| Name | Use |\n| --- | --- |\n| Save | @ your work |\n', ['Keep', 'Store'], null),
    row(12, 'docs/table-extra.md', '| Name |\n| --- |\n| Save | @ |\n', ['dropped', 'gone'], un('docs/table-extra.md'))
  ];
  const base = {};
  for (const [, p, b] of shapes) base[p] = b;
  const root = makeRepo(base);
  const wrong = [];
  for (const [item, p, b, n, expected] of shapes) {
    fs.writeFileSync(path.join(root, ...p.split('/')), n);
    const res = await check(root, p);
    fs.writeFileSync(path.join(root, ...p.split('/')), b);
    const want = expected === null ? STATUS_LINE : refusal(expected);
    if (res.text !== want) wrong.push(`item ${item} ${p}: ${res.verdict === 'checking' ? 'checking' : res.text}`);
    else if (expected === null) assertChecking(res, [p]);
  }
  assert.deepEqual(wrong, []);
});
