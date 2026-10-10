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
const { ruleRefusal } = require('../src/lib/hotfix-check');
const qualityAgent = require('../src/lib/quality-agent');
const safeFs = require('../src/lib/safe-fs');

const START = path.join(__dirname, '..', 'src', 'commands', 'start.js');
const NODE = process.execPath;
const STATUS_LINE = 'Checking the hotfix against the existing tests.';
const USAGE = 'Use: hotfix check [--run-tests] [<file> ...]';
const LOG = path.join('.ctoc', 'logs', 'hotfix-checks.jsonl');
const NO_TEST = 'no test ran, so nothing confirms the change';

const refusal = (clause) => `I did not treat this as a hotfix because ${clause}; `
  + 'it goes through a normal plan, and your edits stay in place, not committed.';
const unreadable = (why) => refusal(`I could not read the change (${why})`);
// The owner's decision of 2026-10-09 (answer "a"): the hotfix check keeps only the formats
// it can read exactly, because five rounds of security attacks kept finding new ways to get
// a behaviour change committed as a hotfix, the last ones where a hand-written reader
// disagrees with the real compiler. Since the tenth round (the session coordinator's
// decision of 2026-10-10) those formats are two: plain HTML pages and colours in plain CSS.
// Every case of a format removed on 2026-10-09 (Vue, Svelte, JSX, reStructuredText, Sass,
// Less, gettext) is kept, grouped at the end of its table, and asserts this clause; the cases
// of the kinds removed on 2026-10-10 (Markdown and plain-text prose, catalogue files, custom
// properties) are deleted, group by group, each with its reason in the plan's record ("Fix
// round 10"), and one table at the end of this file holds every removed extension.
const gone = (f) => `I do not recognise ${f} as wording or a colour`;
// The functional plan's clause (amended 2026-10-09) for a file whose format the check reads
// but whose change it cannot vouch for: text inside a component or custom element or inside
// `<svg>` or `<math>`, HTML outside the strict subset, a colour that is not the whole value
// of a colour property. Rows that asserted
// "not recognised", "could not read (… cannot follow / … open)" or the settings clause for
// one of these cases assert this clause since the sixth round: the wording the functional
// plan now specifies, on a refusal that stays a refusal.
const inexact = (f) => `it changes ${f} in a way the check cannot read exactly, and only what it can read exactly qualifies`;

const SETTING = (f) => `it changes a setting in ${f}, and settings changes are a common cause of outages`;

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

// `maintenance.auto=false` and `gc.auto=0`: git 2.54 starts `git maintenance run --auto --detach`
// after a commit, and that detached process may still write into a fixture repository while a
// test reads or removes it.
const GIT_IDENTITY = ['-c', 'user.name=Hotfix Test', '-c', 'user.email=hotfix@test.invalid', '-c', 'commit.gpgsign=false',
  '-c', 'maintenance.auto=false', '-c', 'gc.auto=0'];
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
    GIT_CONFIG_COUNT: '3', GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false',
    GIT_CONFIG_KEY_1: 'maintenance.auto', GIT_CONFIG_VALUE_1: 'false', GIT_CONFIG_KEY_2: 'gc.auto', GIT_CONFIG_VALUE_2: '0'
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

test('case 3: a catalogue value is no wording the check reads (since the tenth round): refused as a setting', async () => {
  const root = testedProject({ 'locales/en.json': '{\n  "save": "Save {count} items",\n  "cancel": "Cancel"\n}\n' });
  fs.writeFileSync(path.join(root, 'locales/en.json'), '{\n  "save": "Store {count} items",\n  "cancel": "Cancel"\n}\n');
  for (const args of [['locales/en.json'], ['--run-tests', 'locales/en.json']]) await refusedUntouched(root, args, SETTING('locales/en.json'));
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
  const lines = (word, n) => Array.from({ length: n }, (_, i) => `<p>${word} line ${String.fromCharCode(97 + i)}</p>`).join('\n') + '\n';
  const root = testedProject({ 'src/pages/one.html': lines('Old', 7), 'src/pages/two.html': lines('Old', 6) });
  // 13 lines reworded line for line in two files: 26 changed lines.
  fs.writeFileSync(path.join(root, 'src/pages/one.html'), lines('New', 7));
  fs.writeFileSync(path.join(root, 'src/pages/two.html'), lines('New', 6));
  await refusedUntouched(root, ['src/pages/one.html', 'src/pages/two.html'],
    'it changes 26 lines in 2 files and a hotfix is at most 20 lines in at most 3 files');
  // The functional plan's own numbers, 13 lines removed and 12 added (25 lines in 2 files). A
  // page that gains or loses a line is refused by its reader; the size rule runs once the
  // kind of every file is known and before any reader reads a file's content (the decision
  // at review of 2026-10-09), so the scenario gets its own clause. (Until the tenth round the
  // two files were Markdown; a Markdown file is no kind the check reads any more.)
  fs.writeFileSync(path.join(root, 'src/pages/one.html'), lines('New', 6));
  await refusedUntouched(root, ['src/pages/one.html', 'src/pages/two.html'],
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

test('case 17: without a test command nothing passes: a page reads "no test ran", and a README is no kind the check reads', async () => {
  const root = makeRepo({ 'README.md': '# Fixture\n\nThis is the old wording.\n', 'src/pages/home.html': HOME });
  fs.writeFileSync(path.join(root, 'README.md'), '# Fixture\n\nThis is the new wording.\n');
  for (const args of [['README.md'], ['--run-tests', 'README.md']]) await refusedUntouched(root, args, gone('README.md'));

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
  const edited = base.slice();
  edited[3] = 'Line d of the handbook.';
  const page = (rows) => rows.map((l) => `<p>${l}</p>`);
  // A page with Windows line endings on both sides, and one word changed: 2 changed lines.
  const root = testedProject({ 'src/pages/guide.html': page(base).join('\r\n') + '\r\n', 'src/pages/unix.html': page(base).join('\n') + '\n' });
  fs.writeFileSync(path.join(root, 'src/pages/guide.html'), page(edited).join('\r\n') + '\r\n');
  assertChecking(await check(root, 'src/pages/guide.html'), ['src/pages/guide.html']);
  assertPass(await check(root, '--run-tests', 'src/pages/guide.html'), ['src/pages/guide.html']);
  const lines = logLines(root);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].lines, 2);
  assert.equal(lines[0].files, 1);
  // A page whose every line ending changed from LF to CRLF with that one word passed until the
  // ninth round. Since the decision at review of 2026-10-09 the number of carriage returns
  // stays as it is in a page, a catalogue and a stylesheet: the diff the size is counted from
  // ignores them, so a changed line ending would ride along unseen. The change is refused,
  // and the line endings still count as no changed line: 2 lines in the log.
  fs.writeFileSync(path.join(root, 'src/pages/guide.html'), page(base).join('\r\n') + '\r\n');
  fs.writeFileSync(path.join(root, 'src/pages/unix.html'), page(edited).join('\r\n') + '\r\n');
  await refusedUntouched(root, ['src/pages/unix.html'], 'I do not recognise src/pages/unix.html as wording or a colour');
  assert.equal(logLines(root)[1].lines, 2);
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
  // A page of eight lines, two of them reworded: 4 changed lines.
  const guide = ['Guide', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'].map((l) => `<p>${l}</p>`).join('\n') + '\n';
  const GUIDE_TEST = nodeTest('has a guide', "  assert.ok(read('src/pages/guide.html').includes('Guide'));");
  const edit = (root) => fs.writeFileSync(path.join(root, 'src/pages/guide.html'),
    guide.replace('one', 'uno').replace('four', 'cuatro'));
  const both = async (root, args) => ({
    first: await check(root, ...args), second: await check(root, '--run-tests', ...args), log: withoutTime(logLines(root))
  });
  const settings = [['diff.noprefix', 'true'], ['diff.mnemonicPrefix', 'true'], ['diff.interHunkContext', '10'],
    ['diff.algorithm', 'histogram'], ['diff.relative', 'true'], ['diff.context', '5'], ['color.diff', 'always']];
  const files = { 'src/pages/guide.html': guide, 'tests/guide.test.js': GUIDE_TEST };
  const plain = makeRepo(files, { testScript: SCRIPT });
  const set = makeRepo(files, { testScript: SCRIPT, config: settings });
  edit(plain);
  edit(set);
  await t.test('(a) the diff settings', async () => {
      const reference = await both(plain, ['src/pages/guide.html']);
      assert.equal(reference.log[reference.log.length - 1].lines, 4);
      assert.deepEqual(await both(set, ['src/pages/guide.html']), reference);
      assert.equal(reference.second.verdict, 'hotfix', JSON.stringify(reference.second));
  });
  await t.test('(b) diff.autoRefreshIndex=false beside a file whose modification time moved', async () => {
      const make = (config) => {
        const root = makeRepo({ ...files, 'src/pages/other.html': '<p>Other.</p>\n' }, { testScript: SCRIPT, config });
        edit(root);
        const later = new Date(Date.now() + 60000);
        fs.utimesSync(path.join(root, 'src/pages/other.html'), later, later);
        return root;
      };
      const refB = await both(make([]), []);
      assert.deepEqual(await both(make([['diff.autoRefreshIndex', 'false']]), []), refB);
      assertPass(refB.second, ['src/pages/guide.html']);
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
  const root = testedProject();
  const old = Buffer.from(`${'x'.repeat(1024 * 1024)}\n`);
  assert.equal(old.length, 1024 * 1024 + 1);
  fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true });
  fs.writeFileSync(path.join(root, LOG), old);
  const { second } = await buttonWording(root);
  assert.ok(fs.existsSync(path.join(root, `${LOG}.1`)) && fs.readFileSync(path.join(root, `${LOG}.1`)).equals(old),
    'the old log is kept whole under .1');
  const lines = logLines(root);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].verdict, 'hotfix');
  assertPass(second, ['src/pages/home.html']);
});

test('case 40: a log that is a hard link is never written', async () => {
  const outside = path.join(tmpDir('hotfix-outside-'), 'outside.txt');
  const bytes = Buffer.from(`${'y'.repeat(1024 * 1024)}\n`);
  fs.writeFileSync(outside, bytes);
  const reference = testedProject();
  const root = testedProject();
  fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true });
  fs.linkSync(outside, path.join(root, LOG));
  const answers = [];
  for (const r of [reference, root]) {
    const { first, second } = await buttonWording(r);
    answers.push([first, second]);
  }
  assert.ok(fs.readFileSync(outside).equals(bytes), 'the linked file is unchanged');
  assert.equal(fs.existsSync(path.join(root, `${LOG}.1`)), false);
  assert.deepEqual(answers[1], answers[0]);
  assertPass(answers[1][1], ['src/pages/home.html']);
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
    const { first, second } = await buttonWording(root);
    return [first, second];
  };
  const reference = await both(testedProject());
  assert.equal(reference[1].verdict, 'hotfix', JSON.stringify(reference[1]));
  for (const plant of variants) {
    const root = testedProject();
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
  const root = makeRepo({ 'site/guide.html': '<p>Read this guide first.</p>\n', '.gitattributes': 'site/*.html filter=shout\n',
    'src/pages/home.html': HOME, 'tests/home.test.js': PASSING_TEST }, { testScript: SCRIPT });
  const fwd = (p) => p.split(path.sep).join('/');
  git(root, ['config', 'filter.shout.smudge', `"${fwd(NODE)}" "${fwd(shout)}"`]);
  fs.writeFileSync(path.join(root, 'site/guide.html'), '<p>Read this handbook first.</p>\n');
  const before = worktrees(root);
  assertChecking(await check(root, 'site/guide.html'), ['site/guide.html']);
  const res = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(root, '--run-tests', 'site/guide.html'));
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
  const root = workspaceProject('greet', 'greet', { 'packages/greet/page.html': '<p>Greets you.</p>\n' });
  fs.writeFileSync(path.join(root, 'packages/greet/page.html'), '<p>Welcomes you.</p>\n');
  const res = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(root, '--run-tests', 'packages/greet/page.html'));
  assert.notEqual(probeRead(probe), root, 'the tests ran in a copy');
  assertPass(res, ['packages/greet/page.html']);
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
  const name = process.platform === 'win32' ? 'docs/a plan \u00e9.html' : 'docs/a plan \u00e9 *.html';
  const root = makeRepo({ [name]: '<p>Old wording.</p>\n', 'docs/a plan \u00e9 x.html': '<p>Other.</p>\n',
    'tests/any.test.js': nodeTest('runs', '  assert.ok(true);') }, { testScript: SCRIPT });
  fs.writeFileSync(path.join(root, ...name.split('/')), '<p>New wording.</p>\n');
  fs.writeFileSync(path.join(root, 'docs', 'a plan \u00e9 x.html'), '<p>Other, changed.</p>\n');
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

// The decision at review of 2026-10-09: the whole suite runs in the copy. Until then a test
// file named after every judged file (`tests/home.test.html` for `home.html`) made the check
// run that selection alone, and a failing test under another name never ran.
test('the whole suite runs in the copy, whatever the test files are named', async (t) => {
  const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.html': '<p>marker</p>\n', 'tests/home.test.js': PASSING_TEST,
    'tests/other.test.js': PASSING_TEST.replace('has a button', 'still has a button') }, { testScript: SCRIPT });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  const selected = [];
  t.mock.method(qualityAgent, 'runSpecificTests', (tools, files) => { selected.push(...files); throw new Error('a selection of tests ran'); });
  const whole = [];
  const real = qualityAgent.runFullTests;
  t.mock.method(qualityAgent, 'runFullTests', (tools) => { whole.push(process.cwd()); return real(tools); });
  const res = await check(root, '--run-tests', 'src/pages/home.html');
  t.mock.restoreAll();
  assert.deepEqual(selected, [], 'no selection of tests runs');
  assertPass(res, ['src/pages/home.html']);
  assert.equal(res.tests, '2 tests passed.');
  assert.equal(whole.length, 1, 'the whole suite ran once');
  assert.equal(path.basename(copyParent(whole[0])).startsWith('ctoc-hotfix-'), true, 'and it ran in the copy');
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
    // A change of line endings alone is no changed line (its log line counts none, asserted
    // below), and no wording: the number of carriage returns stays as it is in a page.
    ['src/pages/endings.html', '<p>One.</p>\n<p>Two.</p>\n', '<p>One.</p>\r\n<p>Two.</p>\r\n', un('src/pages/endings.html')],
    // The security check's second round: a `value` inside another attribute's value is no
    // `value` attribute. A stray `}` in a tag was harmless; since the sixth round (the
    // session's decision of 2026-10-09: the strict HTML subset) a brace anywhere inside a tag
    // puts the file outside the subset, so this former pass refuses.
    ['src/pages/stray.html', '<p data-x=}>Save</p>\n', '<p data-x=}>Store</p>\n', inexact('src/pages/stray.html')],
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
  // Files named out of order are judged in path order: both qualify, and with no test command no test ran.
  writeFiles(root, { 'src/pages/second.html': '<p>Second.</p>\n' });
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'second']);
  fs.writeFileSync(path.join(root, 'src/pages/second.html'), '<p>Second, changed.</p>\n');
  fs.writeFileSync(path.join(root, 'src/pages/endings.html'), '<p>One, changed.</p>\n<p>Two.</p>\n');
  const twoFiles = await check(root, 'src/pages/second.html', 'src/pages/endings.html');
  assertChecking(twoFiles, ['src/pages/endings.html', 'src/pages/second.html']);
  assert.equal((await check(root, '--run-tests', 'src/pages/second.html', 'src/pages/endings.html')).text, refusal(NO_TEST));
  fs.writeFileSync(path.join(root, 'src/pages/second.html'), '<p>Second.</p>\n');
  fs.writeFileSync(path.join(root, 'src/pages/endings.html'), '<p>One.</p>\n<p>Two.</p>\n');
  writeFiles(root, { 'src/pages/nonl.html': '<p>new</p>' });
  assert.equal((await check(root, 'src/pages/nonl.html')).text, refusal('it adds, removes or renames src/pages/nonl.html'));
  const lines = logLines(root);
  assert.equal(lines[lines.length - 1].lines, 1, 'a new file without a final newline counts its one line');
  const endings = shapes.findIndex((x) => x[0] === 'src/pages/endings.html');
  assert.deepEqual([lines[endings].verdict, lines[endings].lines], ['refused', 0], 'line endings alone are no changed line');
  assert.equal(lines.filter((l) => l.verdict === 'hotfix').length, 0, 'with no test command nothing passes');
  // git lists changed files before new ones; the check still judges in path order.
  fs.rmSync(path.join(root, 'src/pages/nonl.html'));
  fs.writeFileSync(path.join(root, 'src/pages/endings.html'), '<p>One, changed.</p>\n<p>Two.</p>\n');
  writeFiles(root, { 'src/pages/aaa.html': '<p>New.</p>\n' });
  assert.equal((await check(root, 'src/pages/endings.html', 'src/pages/aaa.html')).text, refusal('it adds, removes or renames src/pages/aaa.html'));
});

test('a project in a sub-folder of the repository judges only its own files, shown from its own root', async () => {
  const repo = makeRepo({ 'app/page.html': '<p>Old app wording.</p>\n', 'other/page.html': '<p>Old other wording.</p>\n',
    'app/package.json': packageJson(SCRIPT), 'app/tests/page.test.js': nodeTest('has a page', "  assert.ok(read('page.html').includes('<p>'));") });
  fs.writeFileSync(path.join(repo, 'app/page.html'), '<p>New app wording.</p>\n');
  fs.writeFileSync(path.join(repo, 'other/page.html'), '<p>New other wording.</p>\n');
  const app = path.join(repo, 'app');
  assertChecking(await check(app), ['page.html']);
  assertPass(await check(app, '--run-tests'), ['page.html']);
  assertPass(await check(app, '--run-tests', 'page.html'), ['page.html']);
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
  const root = testedProject();
  const ctoc = path.join(root, '.ctoc');
  fs.mkdirSync(ctoc);
  fs.chmodSync(ctoc, 0o555);
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  let res;
  try {
    res = await check(root, '--run-tests', 'src/pages/home.html');
  } finally {
    fs.chmodSync(ctoc, 0o755);
  }
  assertPass(res, ['src/pages/home.html']);
  // Permissions bind only a non-administrator account on a system that enforces them.
  const enforced = process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0;
  if (enforced) assert.equal(fs.existsSync(path.join(ctoc, 'logs')), false);
});

// The code review's and the security check's findings of 2026-10-08 (Steps 11 and 13),
// each case written and seen failing before its fix.

/**
 * A timing case in ratio form (the decision at review of 2026-10-09: a bound in milliseconds
 * passed or failed with the machine's load, where a ratio does not). `at(n)` gives the call to
 * time on an input of size `n`, built before it is timed; `cost(call)` runs it and answers
 * what it cost in milliseconds. The call is warmed once; `n` grows until one call costs at
 * least 20 ms or `4n` would pass `limit` (inputs of many megabytes measure the engine's
 * memory, not the reader); an input that cannot grow that far is run several times in a row,
 * so that what is timed still costs about 20 ms. Then the minimum of five runs at `n` and of
 * five runs at `4n` is taken. Work that is linear in the input gives a ratio near 4,
 * quadratic work one near 16, and the bound is 8. The one absolute bound is seconds wide and
 * stops a runaway reader early.
 * @param {(n: number) => (() => unknown)} at @param {number} n the first size tried @param {number} limit the largest `4n`
 * @param {(call: () => unknown) => (number|Promise<number>)} [cost] by default the time the call takes
 * @returns {Promise<{n: number, small: number, big: number, ratio: number}>}
 */
async function growth(at, n, limit, cost = wallMs) {
  let call = at(n);
  await cost(call); // warm once
  let once = await cost(call);
  while (once < 20 && n * 8 <= limit) {
    n *= once < 5 && n * 16 <= limit ? 4 : 2;
    call = at(n);
    once = await cost(call);
  }
  assert.ok(once < 5000, `one call at size ${n} took ${once.toFixed(0)} ms`);
  const times = once < 20 ? Math.min(Math.ceil(20 / Math.max(once, 0.02)), 1000) : 1;
  const run = async (fn) => {
    let sum = 0;
    for (let k = 0; k < times; k++) sum += await cost(fn);
    return sum;
  };
  const least = async (fn) => Math.min(await run(fn), await run(fn), await run(fn), await run(fn), await run(fn));
  const small = await least(call);
  const big = await least(at(4 * n));
  return { n, small, big, ratio: big / Math.max(small, 20) };
}
/** @param {() => unknown} call @returns {number} the time one call takes, in milliseconds */
function wallMs(call) {
  const start = process.hrtime.bigint();
  call();
  return Number(process.hrtime.bigint() - start) / 1e6;
}
/** The change the rules read, built by hand: one file whose lines changed in place. */
function changeOf(rel, oldText, newText) {
  const o = oldText.split('\n');
  const n = newText.split('\n');
  assert.equal(o.length, n.length, 'the edit adds no line');
  const hunks = [];
  for (let i = 0; i < o.length; i++) if (o[i] !== n[i]) hunks.push({ oldStart: i + 1, newStart: i + 1, removed: [o[i]], added: [n[i]] });
  return {
    files: [{ display: rel, topRel: rel, status: 'M', oldMode: '100644', newMode: '100644', oldSha: null, oldText, newText, hunks }],
    lineCount: hunks.length * 2
  };
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

test('finding 2a: the first failing test is read from blank lines in linear time', async (t) => {
  const root = testedProject();
  fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
  // The reader of a failing run's output is reached through the test call only, so the call
  // is made in this process with the quality agent answering a failing run, and what is
  // counted is the processor time this process spends from the moment the run's output is
  // handed over (the copy is made before that; git runs in other processes).
  let handedOver = process.cpuUsage();
  const failingWith = (output) => async () => {
    t.mock.method(qualityAgent, 'runFullTests', async () => {
      handedOver = process.cpuUsage();
      return { passed: false, passCount: 0, failed: 1, skipped: 0, flaky: 0, output };
    });
    try {
      return await check(root, '--run-tests', 'src/pages/home.html');
    } finally {
      t.mock.restoreAll();
    }
  };
  const readerMs = async (call) => {
    await call();
    const used = process.cpuUsage(handedOver);
    return (used.user + used.system) / 1000;
  };
  // What the rest of the call costs after the hand-over, with nothing to read: taken off.
  const idle = Math.min(await readerMs(failingWith('boom\n')), await readerMs(failingWith('boom\n')), await readerMs(failingWith('boom\n')));
  const big = await failingWith(`${'\n'.repeat(1024)}boom\n`)();
  assert.equal(big.text, refusal('the existing tests fail (the test command reported a failure)'));
  const { n, small, big: four, ratio } = await growth((kb) => failingWith(`${'\n'.repeat(kb * 1024)}boom\n`), 16, 4096,
    async (call) => Math.max(await readerMs(call) - idle, 0));
  t.diagnostic(`${n} KB of blank lines: ${small.toFixed(1)} ms, ${4 * n} KB: ${four.toFixed(1)} ms, ${ratio.toFixed(1)} times as long`);
  assert.ok(ratio < 8, `${n} KB of blank lines took ${small.toFixed(1)} ms and ${4 * n} KB took ${four.toFixed(1)} ms`);
});

test('finding 2c: a colour change in a one-line stylesheet is judged in linear time', async (t) => {
  const many = (n) => '.a { color: red; } '.repeat(100 * n);
  const long = (n) => `.a { box-shadow:${' red'.repeat(400 * n)}; }`;
  const shapes = [
    ['short declarations, the last colour changed', many, (base) => `${base.slice(0, base.lastIndexOf('red'))}blue; } `, null],
    // Since the sixth round a colour passes only as the whole value of its property (the
    // functional plan, amended 2026-10-09), so the long `box-shadow` list is refused; the
    // time it takes to say so is what this case measures.
    ['one long declaration, every colour changed', long, (base) => base.replace(/red/g, 'tan'), inexact('src/styles/site.css')]
  ];
  for (const [label, build, edit, clause] of shapes) {
    const root = makeRepo({ 'src/styles/site.css': `${build(4)}\n` });
    fs.writeFileSync(path.join(root, 'src', 'styles', 'site.css'), `${edit(build(4))}\n`);
    const res = await check(root, 'src/styles/site.css');
    if (clause === null) assertChecking(res, ['src/styles/site.css']);
    else assert.equal(res.text, refusal(clause));
    const at = (n) => {
      const change = changeOf('src/styles/site.css', `${build(n)}\n`, `${edit(build(n))}\n`);
      return () => assert.equal((ruleRefusal(change) || { clause: null }).clause, clause);
    };
    const { n, small, big, ratio } = await growth(at, 16, 800);
    t.diagnostic(`${label}: size ${n} ${small.toFixed(1)} ms, size ${4 * n} ${big.toFixed(1)} ms, ${ratio.toFixed(1)} times as long`);
    assert.ok(ratio < 8, `${label}: size ${n} took ${small.toFixed(1)} ms and size ${4 * n} took ${big.toFixed(1)} ms`);
  }
});

test('finding 2, same class: a page with many script blocks is judged in linear time', async (t) => {
  const page = (n) => `${'<script>x</script>\n'.repeat(100 * n)}<p>Save</p>\n`;
  const root = makeRepo({ 'src/pages/big.html': page(2) });
  fs.writeFileSync(path.join(root, 'src', 'pages', 'big.html'), page(2).replace('<p>Save</p>', '<p>Store</p>'));
  assertChecking(await check(root, 'src/pages/big.html'), ['src/pages/big.html']);
  const at = (n) => {
    const change = changeOf('src/pages/big.html', page(n), page(n).replace('<p>Save</p>', '<p>Store</p>'));
    return () => assert.equal(ruleRefusal(change), null);
  };
  const { n, small, big, ratio } = await growth(at, 16, 800);
  t.diagnostic(`${100 * n} script blocks: ${small.toFixed(1)} ms, ${400 * n}: ${big.toFixed(1)} ms, ${ratio.toFixed(1)} times as long`);
  assert.ok(ratio < 8, `${100 * n} script blocks took ${small.toFixed(1)} ms and ${400 * n} took ${big.toFixed(1)} ms`);
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
  const root = makeRepo({ '--x.html': '<p>Old wording.</p>\n', 'tests/any.test.js': nodeTest('runs', '  assert.ok(true);') }, { testScript: SCRIPT });
  fs.writeFileSync(path.join(root, '--x.html'), '<p>New wording.</p>\n');
  const first = await check(root, '--', '--x.html');
  assertChecking(first, ['--x.html']);
  assert.equal(first.next, "hotfix check --run-tests -- '--x.html'");
  const words = shellWords(first.next);
  assert.deepEqual(words.slice(0, 2), ['hotfix', 'check']);
  const second = await check(root, ...words.slice(2));
  assertPass(second, ['--x.html']);
  fs.writeFileSync(path.join(root, 'notes.html'), '<p>Other.</p>\n');
  git(root, ['add', 'notes.html']);
  git(root, ['commit', '-q', '-m', 'notes']);
  fs.writeFileSync(path.join(root, 'notes.html'), '<p>Other, changed.</p>\n');
  const mixed = await check(root, '--', 'notes.html', '--x.html');
  assert.equal(mixed.next, "hotfix check --run-tests -- '--x.html' 'notes.html'", 'a mixed set carries --');
  assertPass(await check(root, ...shellWords(mixed.next).slice(2)), ['--x.html', 'notes.html']);
  assert.equal((await check(root, '--run-tests', '--x.html')).text, `Unknown hotfix command: --x.html. ${USAGE}`,
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
    ['services/payment', 'index.html', '<p>Old wording.</p>\n', '<p>New wording.</p>\n', 'index.html sits in an area named payment, and such areas are never a hotfix'],
    ['tests/e2e', 'index.html', '<p>Old wording.</p>\n', '<p>New wording.</p>\n', 'it changes a test (index.html)'],
    ['agents/x', 'index.html', '<p>Old wording.</p>\n', '<p>New wording.</p>\n', un('index.html')],
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
test('round 4: components and code elements in HTML, custom properties; Vue, JSX, Sass, Less and reStructuredText files are not recognised', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const setting = (f) => `it changes a setting in ${f}, and settings changes are a common cause of outages`;
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
    // One side well-formed and the other not.
    ['src/pages/one-side.html', '<p>Save</p>\n<!-- c -->\n', '<p>Store</p>\n<!-- c --\n', inexact('src/pages/one-side.html')],
    // Well-formed files still qualify.
    ['src/pages/closed.html', '<p>Save</p>\n<!-- note -->\n<script>run();</script>\n', '<p>Store</p>\n<!-- note -->\n<script>run();</script>\n', null],
    // A file emptied is the content of a removal, never wording (found by the cut-short property case).
    ['src/pages/emptied.html', '<p>Old words.</p>\n', '', un('src/pages/emptied.html')],
    ['src/pages/filled.html', '', '<p>New words.</p>\n', un('src/pages/filled.html')],
    ['src/styles/emptied.css', 'a { color: red; }\n', '', un('src/styles/emptied.css')],
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
  const notes = { 'src/hooks/notes.html': HOME };
  const ctoc = makeRepo({ ...notes, 'package.json': '{ "name": "ctoc" }\n', 'CLAUDE.md': '# CTOC Project Instructions\n', '.ctoc/keep.json': '{}\n' });
  fs.writeFileSync(path.join(ctoc, 'src', 'hooks', 'notes.html'), HOME_STORE);
  assert.equal((await check(ctoc, 'src/hooks/notes.html')).text,
    refusal('src/hooks/notes.html sits in an area named enforcement, and such areas are never a hotfix'));
  const react = makeRepo({ ...notes, 'package.json': '{ "name": "web" }\n', 'CLAUDE.md': '# Web\n', '.ctoc/keep.json': '{}\n' });
  fs.writeFileSync(path.join(react, 'src', 'hooks', 'notes.html'), HOME_STORE);
  assertChecking(await check(react, 'src/hooks/notes.html'), ['src/hooks/notes.html']);
});

// Renamed at review (2026-10-09): the rows on template literals, Vue and JSX templates and
// Sass now assert that each such file is a kind the check does not recognise.
test('round 3: the whole-file scanners read script escape states, titles, comments and stylesheet strings; JSX, Vue, Sass and reStructuredText files are not recognised', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
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
    // Stylesheets: a colour function in its space form, a string, a colour beside a `url(…)`.
    // A pass until the tenth round: a colour function is read in its comma form only.
    ['src/styles/space.css', 'a { color: rgb(1 2 3 / 50%); }\n', 'a { color: rgb(1 2 4 / 50%); }\n', un('src/styles/space.css')],
    ['src/styles/comma.css', 'a { color: rgba(1, 2, 3, 50%); }\n', 'a { color: rgba(1, 2, 4, 50%); }\n', null],
    ['src/styles/badfn.css', 'a { color: rgb(1 2 3); }\n', 'a { color: rgb(1 2 3 / 4 / 5); }\n', un('src/styles/badfn.css')],
    ['src/styles/str.css', 'a { color: red; content: "x"; }\n', 'a { color: red; content: "y"; }\n', un('src/styles/str.css')],
    // A pass until the sixth round: the colour is not the whole value of its property, which
    // the functional plan (amended 2026-10-09) refuses as a change the check cannot read exactly.
    ['src/styles/quoted.css', 'a { background: url("one.png") red; }\n', 'a { background: url("one.png") blue; }\n', inexact('src/styles/quoted.css')],
    // GitHub's assistant folders stay governing under `.github/`; every other file there is the build.
    ['.github/prompts/card.html', '<p>Save</p>\n', '<p>Store</p>\n', un('.github/prompts/card.html')],
    ['.github/pages/card.html', '<p>Save</p>\n', '<p>Store</p>\n', 'it changes how the project is built or shipped in .github/pages/card.html'],
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
test('round 5: host elements, the element stack, stylesheet names, custom properties', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const lost = (f) => `I could not read the change (${f} holds something I cannot follow)`;
  const setting = (f) => `it changes a setting in ${f}, and settings changes are a common cause of outages`;
  const area = (f, word) => `${f} sits in an area named ${word}, and such areas are never a hotfix`;
  const sql = ['SELECT name FROM users', 'SELECT pass FROM admins'];
  const pip = ['pip install requests', 'pip install reqests'];
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
    // 7. `listing` and `tt` are code elements.
    row(7, 'src/pages/listing.html', '<listing>@</listing>\n', pip, un('src/pages/listing.html')),
    row(7, 'src/pages/tt.html', '<p>Run <tt>@</tt></p>\n', pip, un('src/pages/tt.html')),
    // 8. A stylesheet's own name: a sensitive word still counts, its plural does not.
    row(8, 'src/styles/login.css', 'a { color: @; }\n', ['red', 'blue'], area('src/styles/login.css', 'login')),
    row(8, 'src/styles/payment.css', 'a { color: @; }\n', ['red', 'blue'], area('src/styles/payment.css', 'payment')),
    row(8, 'src/styles/tokens.css', 'a { color: @; }\n', ['red', 'blue'], null),
    row(8, 'src/tokens/base.css', 'a { color: @; }\n', ['red', 'blue'], area('src/tokens/base.css', 'token')),
    // 9. A changed custom property is a setting, whatever it is named and whatever it holds
    // (the tenth round, the session coordinator's decision of 2026-10-10: custom properties
    // never qualify; until then one named for a colour and holding exactly one colour did).
    row(9, 'src/styles/enabled.css', ':root { --enabled: @; }\n', ['green', 'red'], setting('src/styles/enabled.css')),
    row(9, 'src/styles/color-mode.css', ':root { --color-mode: @; }\n', ['dark', 'light'], setting('src/styles/color-mode.css')),
    row(9, 'src/styles/two-tokens.css', ':root { --brand-color: @; }\n', ['red', 'red url(x)'], setting('src/styles/two-tokens.css')),
    row(9, 'src/styles/var.css', ':root { --color-a: var(--@); }\n', ['b', 'c'], setting('src/styles/var.css')),
    row(9, 'src/styles/important.css', ':root { --color-a: @ !important; }\n', ['red', 'blue'], setting('src/styles/important.css')),
    row(9, 'src/styles/commented.css', ':root { --color-a: @ /* x */; }\n', ['red', 'blue'], setting('src/styles/commented.css')),
    row(9, 'src/styles/renamed.css', ':root { --color-@: red; }\n', ['a', 'b'], setting('src/styles/renamed.css')),
    row(9, 'src/styles/and-more.css', ':root { --color-a: @; }\na { width: 1px; }\n', ['red', 'blue; }\na { width: 2px; }\nb { --x: y'], setting('src/styles/and-more.css')),
    row(9, 'src/styles/color-brand.css', ':root {\n  --color-brand: @;\n}\n', ['#0b5ed7', '#1a73e8'], setting('src/styles/color-brand.css')),
    row(9, 'src/styles/button-colour.css', ':root { --button-colour: @; }\n', ['red', 'blue'], setting('src/styles/button-colour.css')),
    row(9, 'src/styles/upper.css', ':root { --Brand-COLOR: @; }\n', ['RED', 'Transparent'], setting('src/styles/upper.css')),
    [9, 'src/styles/both.css', ':root { --color-a: red; }\na { color: red; }\n', ':root { --color-a: blue; }\na { color: blue; }\n', setting('src/styles/both.css')],
    // A real colour property beside a custom property that stays as it is still qualifies.
    [9, 'src/styles/beside.css', ':root { --color-a: red; }\na { color: red; }\n', ':root { --color-a: red; }\na { color: blue; }\n', null],
    // A custom property whose declaration this reader does not vouch for (a comment before its colon) is refused too.
    row(9, 'src/styles/comment-name.css', ':root { --color-a /* x */ : @; }\n', ['red', 'blue'], un('src/styles/comment-name.css')),
    row(9, 'src/styles/string-open.css', 'a { color: @; }\nb { content: "x', ['red', 'blue'], 'I could not read the change (src/styles/string-open.css leaves a tag, quote, comment, block, fence or span open)'),
    row(9, 'src/styles/ruleset.css', ':root { --color-a: { color: @ } }\n', ['red', 'blue'], lost('src/styles/ruleset.css'))
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
test('round 6: the strict HTML subset, folded paths, the cannot-read-exactly sentence', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const exact = (f) => `it changes ${f} in a way the check cannot read exactly, and only what it can read exactly qualifies`;
  const setting = (f) => `it changes a setting in ${f}, and settings changes are a common cause of outages`;
  const area = (f, word) => `${f} sits in an area named ${word}, and such areas are never a hotfix`;
  const sql = ['SELECT name FROM users', 'SELECT pass FROM admins'];
  const pip = ['pip install requests', 'pip install reqests'];
  const save = ['Save', 'Store'];
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
    // 9 and 10. The path is folded (Unicode NFKC, lower case) and split at every character
    // that is no letter; camel-case sub-words count as words too.
    row(9, 'ＡＵＴＨ/index.html', '<p>@</p>\n', save, area('ＡＵＴＨ/index.html', 'auth')),
    row(9, 'src/état/index.html', '<p>@</p>\n', save, null),
    row(10, 'src/pages/AuthPanel.html', '<p>@</p>\n', save, area('src/pages/AuthPanel.html', 'auth')),
    row(10, 'src/pages/paymentForm.html', '<p>@</p>\n', save, area('src/pages/paymentForm.html', 'payment')),
    row(10, 'src/pages/userTokens.html', '<p>@</p>\n', save, area('src/pages/userTokens.html', 'token')),
    row(10, 'src/pages/Author.html', '<p>@</p>\n', save, null),
    // A pass until the tenth round: a sensitive word counts anywhere inside a part of the path.
    row(10, 'src/styles/brandTokens.css', 'a { color: @; }\n', ['red', 'blue'], area('src/styles/brandTokens.css', 'token')),
    // The functional plan's fifth case: a colour that is not the whole value of a colour
    // property. (A custom property is a setting since the tenth round, whatever its name.)
    row('colour', 'src/styles/border.css', '.save { border: 1px solid @; }\n', ['#0a58ca', '#0b5ed7'], exact('src/styles/border.css')),
    row('colour', 'src/styles/shadow.css', 'a { box-shadow: 0 0 2px @; }\n', ['red', 'blue'], exact('src/styles/shadow.css')),
    row('colour', 'src/styles/two-tokens.css', ':root { --brand-color: @; }\n', ['red', 'red url(x)'], setting('src/styles/two-tokens.css')),
    row('colour', 'src/styles/color-mode.css', ':root { --color-mode: @; }\n', ['dark', 'light'], setting('src/styles/color-mode.css')),
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
test('round 7: names, frames, options, noscript, end tags, text over lines and beside comments', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const exact = (f) => `it changes ${f} in a way the check cannot read exactly, and only what it can read exactly qualifies`;
  const save = ['Save', 'Store'];
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
    row(6, 'src/pages/emptied.html', '<table>@<tr><td>a</td></tr></table>\n', ['x', ' '], un('src/pages/emptied.html'))
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

// The ninth round (2026-10-09, decisions at review): the size rule runs once the kind of every
// file is known and before any reader reads a file's content. Every row marked `red` answered
// otherwise on `4212d9ff`; the others are guards. (Until the tenth round this test also held the
// Markdown rows of the ninth round: a raw start tag anywhere, colons, parentheses, list items.)
// [item, path, base content, new content, the clause]
test('round 9: the size rule runs before the content rules, and after the kind of each file', async () => {
  const exact = (f) => `it changes ${f} in a way the check cannot read exactly, and only what it can read exactly qualifies`;
  const size = (n, m) => `it changes ${n} lines in ${m} ${m === 1 ? 'file' : 'files'} and a hotfix is at most 20 lines in at most 3 files`;
  const reworded = (n, wrap = (l) => l) => [Array.from({ length: n }, (_, i) => wrap(`Old line ${String.fromCharCode(97 + i)}`)).join('\n'),
    Array.from({ length: n }, (_, i) => wrap(`New line ${String.fromCharCode(97 + i)}`)).join('\n')];
  const [oldEleven, newEleven] = reworded(11);
  const [oldPages, newPages] = reworded(11, (l) => `<p>${l}</p>`);
  const [oldColours, newColours] = [Array.from({ length: 11 }, (_, i) => `.a${i} { color: red; }`).join('\n'),
    Array.from({ length: 11 }, (_, i) => `.a${i} { color: blue; }`).join('\n')];
  const shapes = [
    // A change over the limit that a reader would also refuse gets the size clause (red);
    // under the limit it gets the reader's.
    ['size', 'src/pages/r9-grown.html', '<p>A line.</p>\n', `<p>A line.</p>\n${'<p>One more line.</p>\n'.repeat(21)}`, size(21, 1)],
    ['size', 'src/pages/r9-open.html', `<div>\n${oldPages}\n`, `<div>\n${newPages}\n`, size(22, 1)],
    ['size', 'src/styles/r9-extra.css', `${oldColours}\n}\n`, `${newColours}\n}\n`, size(22, 1)],
    ['size', 'src/pages/r9-small-open.html', '<div>\n<p>The old words.</p>\n', '<div>\n<p>The new words.</p>\n', exact('src/pages/r9-small-open.html')],
    // The kind of a file is still named ahead of its size (guards).
    ['size', 'src/r9/cart.js', `${oldEleven}\n`, `${newEleven}\n`, 'it changes program logic in src/r9/cart.js, and only wording and colours qualify'],
    ['size', 'src/r9/Page.vue', `${oldEleven}\n`, `${newEleven}\n`, gone('src/r9/Page.vue')],
    ['size', 'docs/r9.md', `${oldEleven}\n`, `${newEleven}\n`, gone('docs/r9.md')],
    ['size', 'locales/r9/en.yml', `${oldEleven.replace(/^/gm, 'k: ')}\n`, `${newEleven.replace(/^/gm, 'k: ')}\n`, SETTING('locales/r9/en.yml')],
    ['size', 'agents/r9.html', `${oldPages}\n`, `${newPages}\n`, gone('agents/r9.html')]
  ];
  const base = {};
  for (const [, p, b] of shapes) {
    assert.equal(base[p], undefined, `${p} is used once`);
    base[p] = b;
  }
  const root = makeRepo(base);
  const wrong = [];
  for (const [item, p, b, n, expected] of shapes) {
    fs.writeFileSync(path.join(root, ...p.split('/')), n);
    const res = await check(root, p);
    fs.writeFileSync(path.join(root, ...p.split('/')), b);
    if (res.text !== refusal(expected)) wrong.push(`${item} ${p}: ${res.verdict === 'checking' ? 'checking' : res.text}`);
  }
  assert.deepEqual(wrong, []);
});

// The ninth round (decisions at review of 2026-10-09): a dependency, build or settings name is
// decided by the name, wherever the file lies; the wording rule also refuses every number
// character, a format character, a bare host and a scheme anywhere; and a byte-order mark or a
// line ending neither comes nor goes. Every row marked `red` answered otherwise on `4212d9ff`.
// (Until the tenth round this test also held the rows of the catalogue readers: JSON by
// JSON.parse, strict YAML and properties, placeholders. No catalogue file qualifies any more.)
// [item, path, base content, new content, the clause, or null for `checking`]
test('round 9: names that are dependencies, the build or settings; the wording rule in a page; byte-order marks and line endings', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const setting = (f) => `it changes a setting in ${f}, and settings changes are a common cause of outages`;
  const build = (f) => `it changes how the project is built or shipped in ${f}`;
  const deps = (f) => `it changes the dependencies in ${f}`;
  const risk = (f) => `the wording in ${f} contains a number, a price, a web address or an e-mail address`;
  const json = (o) => `${JSON.stringify(o, null, 2)}\n`;
  const shapes = [
    // 1. A dependency, build or settings name, in any letter case, wherever the file lies.
    ['name', 'packages/i18n/package.json', json({ name: 'i18n', description: 'Old texts' }), json({ name: 'i18n', description: 'New texts' }), deps('packages/i18n/package.json')],
    ['name', 'locales/package.json', json({ name: 'x', scripts: { test: 'node run tests' } }), json({ name: 'x', scripts: { test: 'echo skipped' } }), deps('locales/package.json')],
    ['name', 'messages/docker-compose.yml', 'services:\n  web:\n    image: app\n', 'services:\n  web:\n    image: other\n', build('messages/docker-compose.yml')],
    ['name', 'messages/docker-compose.override.yml', 'services:\n  web:\n    image: app\n', 'services:\n  web:\n    image: other\n', build('messages/docker-compose.override.yml')],
    ['name', 'translations/pnpm-lock.yaml', 'lockfileVersion: old\n', 'lockfileVersion: new\n', deps('translations/pnpm-lock.yaml')],
    ['name', 'i18n/tsconfig.json', json({ compilerOptions: { module: 'commonjs' } }), json({ compilerOptions: { module: 'esnext' } }), setting('i18n/tsconfig.json')],
    ['name', 'i18n/tsconfig.build.json', json({ extends: 'base' }), json({ extends: 'other' }), setting('i18n/tsconfig.build.json')],
    ['name', 'i18n/jsconfig.json', json({ extends: 'base' }), json({ extends: 'other' }), setting('i18n/jsconfig.json')],
    ['name', 'messages/application.properties', 'spring.profiles.active=dev\n', 'spring.profiles.active=prod\n', setting('messages/application.properties')],
    ['name', 'messages/application-prod.yml', 'mode: dev\n', 'mode: prod\n', setting('messages/application-prod.yml')],
    ['name', 'locales/app.config.json', json({ mode: 'dev' }), json({ mode: 'prod' }), setting('locales/app.config.json')],
    ['name', 'lang/Composer.JSON', json({ name: 'old' }), json({ name: 'new' }), deps('lang/Composer.JSON')],
    ['name', 'locales/PACKAGE-LOCK.json', json({ name: 'old' }), json({ name: 'new' }), deps('locales/PACKAGE-LOCK.json')],
    // A file in a catalogue folder is a settings file by its extension.
    ['tag', 'i18n/routes.json', json({ home: 'Start' }), json({ home: 'Begin' }), setting('i18n/routes.json')],
    ['tag', 'locales/settings.yml', 'mode: dark\n', 'mode: light\n', setting('locales/settings.yml')],
    ['tag', 'messages/config.properties', 'mode=dark\n', 'mode=light\n', setting('messages/config.properties')],
    ['tag', 'src/locales/index.json', json({ home: 'Start' }), json({ home: 'Begin' }), setting('src/locales/index.json')],
    ['tag', 'locales/english.json', json({ home: 'Start' }), json({ home: 'Begin' }), setting('locales/english.json')],
    ['tag', 'locales/messages_english.json', json({ home: 'Start' }), json({ home: 'Begin' }), setting('locales/messages_english.json')],
    // The shapes that qualified until the tenth round (a tag as the name, a tag as a folder, a
    // bundle with a tag behind `_`, a bundle alone, a tag with a region or a script): each is a
    // settings file by its extension now, like the rows above.
    ['tag', 'locales/en.json', json({ home: 'Start' }), json({ home: 'Begin' }), setting('locales/en.json')],
    ['tag', 'locales/de/common.json', json({ home: 'Start' }), json({ home: 'Begin' }), setting('locales/de/common.json')],
    ['tag', 'i18n/messages_fr.properties', 'home=Start\n', 'home=Begin\n', setting('i18n/messages_fr.properties')],
    ['tag', 'config/locales/en.yml', 'en:\n  home: Start\n', 'en:\n  home: Begin\n', setting('config/locales/en.yml')],
    ['tag', 'lang/pt_BR/app.yaml', 'home: Start\n', 'home: Begin\n', setting('lang/pt_BR/app.yaml')],
    ['tag', 'locales/zh-Hans.json', json({ home: 'Start' }), json({ home: 'Begin' }), setting('locales/zh-Hans.json')],
    ['tag', 'translations/Strings.json', json({ home: 'Start' }), json({ home: 'Begin' }), setting('translations/Strings.json')],
    ['tag', 'messages/labels_en-US.yml', 'home: Start\n', 'home: Begin\n', setting('messages/labels_en-US.yml')],
    // The same rule in HTML text.
    ['wording', 'src/pages/r9-host.html', '<p>See account.example.com now</p>\n', '<p>See account.example.net now</p>\n', risk('src/pages/r9-host.html')],
    ['wording', 'src/pages/r9-scheme.html', '<p>Write to us</p>\n', '<p>Write mailto:us</p>\n', risk('src/pages/r9-scheme.html')],
    ['wording', 'src/pages/r9-numeral.html', '<p>Step two</p>\n', '<p>Step \u2461</p>\n', risk('src/pages/r9-numeral.html')],
    // 6. A byte-order mark on one side only, or another number of carriage returns (red for
    // the stylesheet; an HTML page was let through with every line ending changed).
    ['mark', 'src/styles/r9-mark.css', 'a { color: red; }\n', '\ufeffa { color: blue; }\n', un('src/styles/r9-mark.css')],
    ['mark', 'src/styles/r9-returns.css', 'a { color: red; }\nb { margin: 0; }\n', 'a { color: blue; }\r\nb { margin: 0; }\n', un('src/styles/r9-returns.css')],
    ['mark', 'src/pages/r9-returns.html', '<p>Save</p>\n<p>More</p>\n', '<p>Store</p>\n<p>More</p>\r\n', un('src/pages/r9-returns.html')]
  ];
  const base = {};
  for (const [, p, b] of shapes) {
    assert.equal(base[p], undefined, `${p} is used once`);
    base[p] = b;
  }
  const root = makeRepo(base);
  const wrong = [];
  for (const [item, p, b, n, expected] of shapes) {
    assert.notEqual(b, n, `${p} holds a change`);
    fs.writeFileSync(path.join(root, ...p.split('/')), n);
    const res = await check(root, p);
    fs.writeFileSync(path.join(root, ...p.split('/')), b);
    const want = expected === null ? STATUS_LINE : refusal(expected);
    if (res.text !== want) wrong.push(`${item} ${p} ${JSON.stringify(b)}: ${res.verdict === 'checking' ? 'checking' : res.text}`);
    else if (expected === null) assertChecking(res, [p]);
  }
  assert.deepEqual(wrong, []);
});

// The ninth round, stylesheets (decisions at review of 2026-10-09): a strict subset, held to
// postcss by the differential test. A statement does not end at a `;` inside round or square
// brackets; a statement that is neither a declaration, an at-rule nor a rule's head refuses
// the file; and a changed declaration that holds a backslash is refused. Every row marked
// `red` answered otherwise on `4212d9ff`. [item, path, base content, new content, the clause, or null for `checking`]
test('round 9: stylesheets — brackets, statements outside the subset, escapes, and custom properties', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const lost = (f) => `I could not read the change (${f} holds something I cannot follow)`;
  const open = (f) => `I could not read the change (${f} leaves a tag, quote, comment, block, fence or span open)`;
  const setting = (f) => `it changes a setting in ${f}, and settings changes are a common cause of outages`;
  const colour = ['red', 'blue'];
  let count = 0;
  const row = (item, template, expected, pair = colour) => {
    const p = `src/styles/r9/${String(item).replace(/[^a-z0-9]+/gi, '-')}-${++count}.css`;
    return [item, p, template.replace('~', pair[0]), template.replace('~', pair[1]), typeof expected === 'function' ? expected(p) : expected];
  };
  const shapes = [
    // 1. A `;` inside round or square brackets ends no statement (red: each read `color: red`
    // as a declaration of its own and answered `checking`).
    row('brackets', 'a { --shape: (a; color: ~; b) }\n', setting),
    row('brackets', 'a { --shape: [a; color: ~; b] }\n', setting),
    // In a plain property's value a colon outside round brackets is a missing semicolon, for
    // postcss in square brackets too.
    row('brackets', 'a { grid-area: [a; color: ~; b] }\n', lost),
    row('brackets', 'a { grid-area: [a; b]; color: ~ }\n', null),
    row('brackets', 'a { background: \\75 rl(a;color:~;b) }\n', un),
    row('brackets', '@media (a; b) { a { color: ~ } }\n', null),
    row('brackets', 'a { width: calc(1px + (2px * 3)); color: ~; }\n', null),
    // A brace inside brackets, a closing bracket of another kind and a bracket never closed
    // cannot be followed.
    row('brackets', 'a { x: (b { c; } d); color: ~ }\n', lost),
    row('brackets', 'a { x: (]; y: 0 } b { color: ~ }\n', lost),
    row('brackets', 'a { x: 1) } b { color: ~ }\n', lost),
    row('brackets', 'a { color: ~ } b { x: (1 }\n', lost),
    row('brackets', 'a { color: @ }\n~import (x\n', open),
    // 2. A statement that is neither blank, a declaration with a plain name, an at-rule nor
    // a rule's head (red: each was passed over, and the colour elsewhere answered `checking`;
    // postcss refuses each of these files).
    row('statement', 'a { color: ~; foo }\n', lost),
    row('statement', 'a { color: ~ } b\n', lost),
    row('statement', 'a { margin: 0 color: blue; } c { color: ~ }\n', lost, ['red', 'green']),
    row('statement', 'a { margin:: 0 } c { color: ~ }\n', lost),
    row('statement', 'a { *zoom: 1 } c { color: ~ }\n', lost),
    row('statement', 'margin: 0;\nc { color: ~ }\n', lost),
    row('statement', '<!-- c { color: ~ } -->\n', lost),
    row('statement', '@ { } c { color: ~ }\n', lost),
    row('statement', 'a { "x"; color: ~ }\n', lost),
    row('statement', 'a { color: ~; url(x) }\n', lost),
    row('statement', 'a { color: ~ }\n"x"\n', lost),
    // A character behind a backslash is no structure. An escaped brace, semicolon, quote or
    // comment start cannot be followed, and neither can a backslash before a line break (red:
    // each was read as the structure it escapes; four answered `checking`, `.a\{b` left a
    // block open and the colour behind `\/*` stood in a comment).
    row('escape', 'a\\{ color: ~ }\n', lost),
    row('escape', 'a { b\\;c: d; color: ~ }\n', lost),
    row('escape', 'a { color: ~ } b\\\n{ }\n', lost),
    row('escape', '.c-\\[\\\'x\\\'\\] { color: ~ }\n', lost),
    row('escape', '.a\\{b { color: ~ }\n', lost),
    row('escape', '.a\\/* { color: ~ } */ b { margin: 0 }\n', lost),
    // An escaped colon, slash or bracket in a selector, as a utility stylesheet writes them (guard).
    row('escape', '.sm\\:w-1\\/2, .w-\\[calc\\(1px\\)\\] { color: ~ }\n', null),
    // A comment is white space to the statements; a declaration right behind one is still a
    // declaration, and a colour changed in it is not recognised, as before (guards).
    row('comment', 'a {\n  /* brand */\n  color: ~;\n}\n', un),
    row('comment', 'a { color /* c */ : ~ }\n', un),
    row('comment', 'a { /* c */ }\n/* d */ @import "x";\nb { color: ~; /* e */ }\n/* f */\n', null),
    // What a stylesheet may hold beside rules (guards).
    row('statement', '@charset "utf-8";\n@import "x.css";\n@layer a, b;\n:root { --gap: 4px; }\n--top: 1;\n@media (min-width: 10px) {\n  a { @apply x; color: ~; ; }\n}\n', null),
    row('statement', '{ color: ~ }\n', null),
    row('statement', '.sm\\:flex, #fff, .red { COLOR : ~ !important }\n', null),
    // 3. A string ends at a carriage return or a form feed too (red).
    row('string', 'a { content: "x\r"; color: ~ }\n', lost),
    row('string', 'a { content: "x\f"; color: ~ }\n', lost),
    // 4. A changed custom property is a setting whatever reads it (the tenth round: custom
    // properties never qualify; until then one named for a colour and read by colour
    // properties only did, and the last four rows answered `checking`).
    row('custom property', ':root { --brand-color: ~ }\na { animation-name: var(--brand-color) }\n', setting),
    row('custom property', ':root { --brand-color: ~ }\n@container style(--brand-color: red) { a { margin: 0 } }\n', setting),
    row('custom property', ':root { --brand-color: ~; --other: var(--brand-color) }\n', setting),
    row('custom property', ':root { --brand-color: ~ }\na { color: var(--brand-color); border: 1px solid VAR( --brand-color , blue) }\n', setting),
    row('custom property', ':root { --brand-color: ~ }\na { background: linear-gradient(var(--brand-color), white) }\n', setting),
    row('custom property', ':root { --brand-color: ~ }\n.btn--brand-color { margin: 0 } a { width: var(--Brand-Color) }\n', setting),
    row('custom property', ':root { --brand-color: ~ } /* animation-name: var(--brand-color) */\n', setting),
    // A real colour property that reads a custom property is no colour value; one beside it is.
    row('custom property', ':root { --brand-color: red }\na { color: var(--brand-color, ~) }\n', (f) => inexact(f)),
    row('custom property', ':root { --brand-color: red }\na { color: var(--brand-color); background-color: ~ }\n', null)
  ];
  const base = {};
  for (const [, p, b] of shapes) base[p] = b;
  const root = makeRepo(base);
  const wrong = [];
  for (const [item, p, b, n, expected] of shapes) {
    assert.notEqual(b, n, `${p} holds a change`);
    fs.writeFileSync(path.join(root, ...p.split('/')), n);
    const res = await check(root, p);
    fs.writeFileSync(path.join(root, ...p.split('/')), b);
    const want = expected === null ? STATUS_LINE : refusal(expected);
    if (res.text !== want) wrong.push(`${item} ${p} ${JSON.stringify(b)}: ${res.verdict === 'checking' ? 'checking' : res.text}`);
    else if (expected === null) assertChecking(res, [p]);
  }
  assert.deepEqual(wrong, []);
});

test('round 9: paths and names — governing folders, sensitive words in every spelling, byte-order marks and line endings', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const area = (word) => (f) => `${f} sits in an area named ${word}, and such areas are never a hotfix`;
  const PAGE = [HOME, HOME_STORE];
  const COLOUR = ['a { color: red; }\n', 'a { color: blue; }\n'];
  // [what the row shows, path, [before, after], the clause, or null for the first call's `checking`]
  const rows = [
    // 1. The folders that govern the work, in any letter case and at any depth (red: `checking`).
    ['governing folder', 'prompts/intro.html', PAGE, un],
    ['governing folder', 'docs/Prompts/tone.html', PAGE, un],
    ['governing folder', 'output-styles/terse.css', COLOUR, un],
    ['governing folder', 'site/output-styles/page.html', PAGE, un],
    ['governing folder', 'site/skills/page.html', PAGE, un],
    ['governing folder', '.claude/theme/page.css', COLOUR, un],
    // 2. A file an instruction file links to. Until the tenth round such a file governed the
    // work; the reader of links is taken out with the Markdown reader, a Markdown file is
    // refused by its extension, and a linked page or stylesheet is judged like any other.
    ['linked', 'docs/linked.md', ['Some words here.\n', 'Some other words here.\n'], un],
    ['linked', 'site/linked page.html', PAGE, null],
    ['linked', 'src/styles/linked.css', COLOUR, null],
    // 3. A sensitive word behind capitals, a mark or a character nobody sees (red: `checking`).
    ['sensitive word', 'src/APIKey/page.html', PAGE, area('key')],
    ['sensitive word', 'src/SSOLogin/page.html', PAGE, area('login')],
    ['sensitive word', 'src/JWTToken/page.html', PAGE, area('token')],
    ['sensitive word', 'src/UIAdmin/page.html', PAGE, area('admin')],
    ['sensitive word', 'src/HTMLAuth/page.html', PAGE, area('auth')],
    ['sensitive word', 'src/pay\u200bment/page.html', PAGE, area('payment')],
    ['sensitive word', 'src/p\u00e1yment/page.html', PAGE, area('payment')],
    ['sensitive word', 'src/styles/payments.css', COLOUR, area('payment')],
    ['sensitive word', 'src/styles/keys.css', COLOUR, area('key')],
    // Words that hold one refuse since the tenth round (both passed until then); a part that is
    // exactly `author`, and the one plural a stylesheet's name may carry, pass (guards).
    ['sensitive word', 'src/HTMLAuthor/page.html', PAGE, area('auth')],
    ['sensitive word', 'src/APIKeyboard/page.html', PAGE, area('key')],
    ['sensitive word', 'src/author/page.html', PAGE, null],
    ['sensitive word', 'src/styles/design-tokens.css', COLOUR, null],
    // 4. A byte-order mark on one side only, or another count of carriage returns, in a
    // stylesheet (red: `checking`).
    ['mark and line ending', 'src/styles/marked.css', [COLOUR[0], `\ufeff${COLOUR[1]}`], un],
    ['mark and line ending', 'src/styles/ending.css', ['a { color: red; }\nb { margin: 0; }\n', 'a { color: blue; }\r\nb { margin: 0; }\n'], un],
    ['mark and line ending', 'src/styles/both.css', ['\ufeffa { color: red; }\r\n', '\ufeffa { color: blue; }\r\n'], null]
  ];
  const base = { 'CLAUDE.md': '# Instructions\n\nRead [the guide](docs/linked.md) and [the page](<site/linked page.html>).\n@src/styles/linked.css\n',
    'AGENTS.md': 'Follow [the colours](src/styles/linked.css).\n' };
  for (const [, p, [before]] of rows) base[p] = before;
  const root = makeRepo(base);
  const wrong = [];
  for (const [what, p, [before, after], expected] of rows) {
    fs.writeFileSync(path.join(root, ...p.split('/')), after);
    const res = await check(root, p);
    fs.writeFileSync(path.join(root, ...p.split('/')), before);
    const want = expected === null ? STATUS_LINE : refusal(expected(p));
    if (res.text !== want) wrong.push(`${what} ${p}: ${res.verdict === 'checking' ? 'checking' : res.text}`);
    else if (expected === null) assertChecking(res, [p]);
  }
  assert.deepEqual(wrong, []);

});

test('round 9: a long path is read in time proportional to its size', async (t) => {
  // A folder name of capitals, small letters, marks and characters nobody sees: every piece is one sub-word.
  const piece = `aB${String.fromCharCode(0x301, 0x200b)}`;
  const longPath = (n) => {
    const change = changeOf(`src/${piece.repeat(256 * n)}/page.html`, HOME, HOME_STORE);
    return () => assert.equal(ruleRefusal(change), null);
  };
  const name = await growth(longPath, 16, 1600);
  t.diagnostic(`a path of ${name.n} KiB: ${name.small.toFixed(1)} ms, ${4 * name.n} KiB: ${name.big.toFixed(1)} ms, ${name.ratio.toFixed(1)} times as long`);
  assert.ok(name.ratio < 8, `a path of ${name.n} KiB took ${name.small.toFixed(1)} ms and one of ${4 * name.n} KiB took ${name.big.toFixed(1)} ms`);
});

test('round 9: an added or deleted path is refused before anything is staged, so no untracked file reaches the object store', async () => {
  const root = makeRepo({ 'src/pages/home.html': HOME, 'docs/old.md': 'Old.\nWords.\n' });
  const objects = () => git(root, ['count-objects', '-v']);
  const last = () => withoutTime(logLines(root)).pop();
  // A 40 MiB file nobody has added (655,360 lines), beside a wording change.
  fs.writeFileSync(path.join(root, 'big.txt'), `${'x'.repeat(63)}\n`.repeat(40 * 16384));
  fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
  let before = objects();
  assert.equal((await check(root)).text, refusal('it adds, removes or renames big.txt'));
  assert.equal(objects(), before, 'the unnamed first call wrote nothing to the object store');
  assert.deepEqual(last(), { verdict: 'refused', cause: 'adds-removes-renames', urgent: false, files: 2, lines: 655362 });
  assert.equal((await check(root, '--run-tests')).text, refusal('it adds, removes or renames big.txt'));
  assert.equal((await check(root, 'big.txt')).text, refusal('it adds, removes or renames big.txt'));
  assert.equal(objects(), before, 'neither did the test call, nor the call that names the file');
  fs.rmSync(path.join(root, 'big.txt'));

  // A deleted file, a file without a final line break, an empty one and a link, all new.
  fs.rmSync(path.join(root, 'docs', 'old.md'));
  writeFiles(root, { 'docs/new.md': 'One.\nTwo', 'docs/empty.md': '' });
  fs.symlinkSync('old.md', path.join(root, 'docs', 'link.md'));
  before = objects();
  assert.equal((await check(root)).text, refusal('it adds, removes or renames docs/empty.md'));
  assert.deepEqual(last(), { verdict: 'refused', cause: 'adds-removes-renames', urgent: false, files: 5, lines: 7 });
  assert.equal((await check(root, 'docs/old.md')).text, refusal('it adds, removes or renames docs/old.md'));
  assert.deepEqual(last(), { verdict: 'refused', cause: 'adds-removes-renames', urgent: false, files: 1, lines: 2 });
  assert.equal(objects(), before);

  // A file the owner added to git's index and never committed is an added path too.
  git(root, ['add', 'docs/new.md']);
  before = objects();
  assert.equal((await check(root, 'docs/new.md')).text, refusal('it adds, removes or renames docs/new.md'));
  assert.deepEqual(last(), { verdict: 'refused', cause: 'adds-removes-renames', urgent: false, files: 1, lines: 2 });
  assert.equal(objects(), before);
});

test('round 9: the copy is removed whatever the tests leave in it, and a removal that fails keeps both ends of its reason', async (t) => {
  await t.test('a test that leaves folders nobody may write to, or read', async () => {
    const locking = nodeTest('has a button', "  assert.ok(read('src/pages/home.html').includes('<button>'));", { prelude: [
      "fs.mkdirSync(path.join(process.cwd(), 'locked', 'inner'), { recursive: true });",
      "fs.writeFileSync(path.join(process.cwd(), 'locked', 'inner', 'kept.txt'), 'x');",
      "fs.chmodSync(path.join(process.cwd(), 'locked', 'inner'), 0o000);",
      "fs.chmodSync(path.join(process.cwd(), 'locked'), 0o555);"
    ].join('\n') });
    const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': locking }, { testScript: SCRIPT });
    const before = worktrees(root);
    fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
    const res = await check(root, '--run-tests', 'src/pages/home.html');
    const left = leftovers();
    // Whatever the answer, this test removes what the check left, so no later test inherits it.
    const open = (dir) => {
      fs.chmodSync(dir, 0o700);
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) open(path.join(dir, e.name));
    };
    for (const name of left) {
      open(path.join(PRIVATE_TMP, name));
      fs.rmSync(path.join(PRIVATE_TMP, name), { recursive: true, force: true });
    }
    git(root, ['worktree', 'prune']);
    assert.deepEqual(left, [], `the copy is gone: ${JSON.stringify(res.detail)}`);
    assertPass(res, ['src/pages/home.html']);
    assert.equal(worktrees(root), before);
  });
  await t.test('a folder the check cannot open is left to the removal, which names it', async () => {
    const locking = nodeTest('has a button', "  assert.ok(read('src/pages/home.html').includes('<button>'));", { prelude: [
      "fs.mkdirSync(path.join(process.cwd(), 'locked'));",
      "fs.writeFileSync(path.join(process.cwd(), 'locked', 'kept.txt'), 'x');",
      "fs.chmodSync(path.join(process.cwd(), 'locked'), 0o555);"
    ].join('\n') });
    const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': locking }, { testScript: SCRIPT });
    fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
    const realChmod = fs.chmodSync;
    t.mock.method(fs, 'chmodSync', (p, mode) => {
      if (String(p).includes('ctoc-hotfix-')) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
      return realChmod(p, mode);
    });
    const res = await check(root, '--run-tests', 'src/pages/home.html');
    t.mock.restoreAll();
    const left = leftovers();
    for (const name of left) {
      realChmod(path.join(PRIVATE_TMP, name, 'tree', 'locked'), 0o700);
      fs.rmSync(path.join(PRIVATE_TMP, name), { recursive: true, force: true });
    }
    git(root, ['worktree', 'prune']);
    assert.equal(res.verdict, 'hotfix', JSON.stringify(res));
    // The failure that is named is the folder's own, not a later one of the removal. (Where a
    // folder's mode is not what keeps its owner from removing in it, no mode is changed and the
    // copy goes all the same.)
    if (process.platform === 'win32' && left.length === 0) assert.equal(res.detail, undefined);
    else assert.equal(res.detail, `the temporary copy at ${path.join(PRIVATE_TMP, left[0])} could not be removed: EPERM: operation not permitted`);
  });
  await t.test('a removal that still fails names the start and the end of its reason', async () => {
    const root = testedProject();
    const probe = probeDir();
    fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
    const reason = `EACCES: permission denied, rmdir '${'/a-folder-with-a-long-name'.repeat(12)}/the-last-folder'`;
    const realRm = fs.rmSync;
    t.mock.method(fs, 'rmSync', (p, options) => {
      if (path.basename(String(p)).startsWith('ctoc-hotfix-')) throw Object.assign(new Error(reason), { code: 'EACCES' });
      return realRm(p, options);
    });
    const res = await withEnv({ CTOC_HOTFIX_PROBE: probe }, () => check(root, '--run-tests', 'src/pages/home.html'));
    t.mock.restoreAll();
    const parent = copyParent(probeRead(probe));
    assert.equal(res.verdict, 'hotfix');
    assert.equal(res.detail, `the temporary copy at ${parent} could not be removed: ${reason.slice(0, 80)} … ${reason.slice(-80)}`);
    fs.rmSync(parent, { recursive: true, force: true });
  });
});

test('round 9: every guard fails closed — a file its reader cannot parse is refused, a fault in any rule stops the check, and nothing falls back to a looser reading', async (t) => {
  const lost = (f) => `I could not read the change (${f} holds something I cannot follow)`;
  const open = (f) => `I could not read the change (${f} leaves a tag, quote, comment, block, fence or span open)`;

  await t.test('per format: something the reader cannot parse, on the old side, the new side or both, never passes', async () => {
    // [format, path, before, after, clause]. Where both sides hold the same unparsable piece and
    // one string differs beside it, a reader that fell back to reading lines would pass.
    const rows = [
      ['CSS', 'src/styles/both.css', 'a { color: red; oops }\n', 'a { color: blue; oops }\n', lost],
      ['CSS', 'src/styles/new.css', 'a { color: red; }\nb { margin: 0; }\n', 'a { color: blue; }\nb { margin: 0; \n', open],
      ['CSS', 'src/styles/old.css', 'a { color: red; }\nb { margin: 0; \n', 'a { color: blue; }\nb { margin: 0; }\n', open],
      ['CSS', 'src/styles/comment.css', 'a { color: red; }\n/* open\n', 'a { color: blue; }\n/* open\n', open],
      ['CSS', 'src/styles/string.css', 'a { color: red; }\nb { content: "x\n; }\n', 'a { color: blue; }\nb { content: "x\n; }\n', lost],
      ['HTML', 'src/pages/both.html', '<p>Save</p>\n<div class="x\n', '<p>Store</p>\n<div class="x\n', inexact],
      ['HTML', 'src/pages/new.html', '<p>Save</p>\n<p>More</p>\n', '<p>Store</p>\n<p>More</p\n', inexact],
      ['HTML', 'src/pages/comment.html', '<p>Save</p>\n<!-- open\n', '<p>Store</p>\n<!-- open\n', inexact]
    ];
    const base = {};
    for (const [, p, before] of rows) base[p] = before;
    const root = makeRepo(base);
    const wrong = [];
    for (const [format, p, before, after, clause] of rows) {
      fs.writeFileSync(path.join(root, ...p.split('/')), after);
      const first = await check(root, p);
      const second = await check(root, '--run-tests', p);
      fs.writeFileSync(path.join(root, ...p.split('/')), before);
      for (const res of [first, second]) {
        if (res.text !== refusal(clause(p))) wrong.push(`${format} ${p}: ${res.verdict === 'refused' ? res.text : res.verdict}`);
      }
    }
    assert.deepEqual(wrong, []);
  });

  /** A change that passes every rule, built by hand: one wording change in a page. */
  const passing = (rel = 'site/page.html') => ({
    files: [{ display: rel, topRel: rel, status: 'M', oldMode: '100644', newMode: '100644', oldSha: null, oldText: HOME, newText: HOME_STORE,
      hunks: [{ oldStart: 4, newStart: 4, removed: ['<button>Save</button>'], added: ['<button>Store</button>'] }] }],
    lineCount: 2
  });
  const boom = () => { throw new Error('injected fault'); };

  await t.test('a fault inside any rule function leaves the rules as a fault, never as a pass', () => {
    assert.equal(ruleRefusal(passing()), null, 'the change passes when nothing is injected');
    // Each rule reads one thing no rule before it reads; a getter that throws there is a fault inside that rule.
    const inject = {
      'rule 2, the same files': (c) => Object.defineProperty(c.files[0], 'status', { get: boom }),
      'rule 7, no test edited': (c) => Object.defineProperty(c.files[0], 'display', { get: boom }),
      'rule 4, texts that differ without a changed line': (c) => Object.defineProperty(c.files[0], 'hunks', { get: boom }),
      'rule 4, the kind': (c) => Object.defineProperty(c.files[0], 'oldText', { get: boom }),
      'rule 3, the size': (c) => Object.defineProperty(c, 'lineCount', { get: boom }),
      'rule 4, the content': (c) => Object.defineProperty(c.files[0], 'kind', { get: boom, set() {} }),
      'rule 6, risk markers': (c) => Object.defineProperty(c.files[0], 'runs', { get: boom, set() {} })
    };
    for (const [rule, poison] of Object.entries(inject)) {
      const change = passing();
      poison(change);
      assert.throws(() => ruleRefusal(change), /injected fault/, rule);
    }
    // Rule 5 reads the path, as every rule before it does; its own step is the folding of the letters.
    const normalize = String.prototype.normalize;
    t.mock.method(String.prototype, 'normalize', function fold(form) {
      if (form === 'NFKD') boom();
      return normalize.call(this, form);
    });
    try {
      assert.throws(() => ruleRefusal(passing()), /injected fault/, 'rule 5, the sensitive area');
    } finally {
      t.mock.restoreAll();
    }
    // A name that is one kind as written and another in a folded form is no kind the check
    // vouches for. No real name does that (the extension of a qualifying name is plain
    // letters), so the second form's extension is replaced here: a page read as a stylesheet.
    const extname = path.posix.extname;
    let asked = 0;
    t.mock.method(path.posix, 'extname', (name) => (name === 'page.html' && ++asked === 5 ? '.css' : extname(name)));
    try {
      assert.equal(ruleRefusal(passing()).clause, 'I do not recognise site/page.html as wording or a colour');
      assert.equal(asked >= 5, true, 'the kind was asked of the second form of the path');
    } finally {
      t.mock.restoreAll();
    }
    // What the rules need and a caller left out is a fault too, never a default.
    for (const lineCount of [undefined, null, NaN, -1, 1.5, '2']) {
      assert.throws(() => ruleRefusal({ ...passing(), lineCount }), /no count of its changed lines/, `a line count of ${String(lineCount)}`);
    }
    // A file with nothing changed in it is no pass of nothing, in any format.
    for (const rel of ['docs/page.md', 'site/page.html', 'locales/en/page.json', 'locales/en/page.yml', 'lang/en/page.properties', 'site/page.css']) {
      const same = { display: rel, topRel: rel, status: 'M', oldMode: '100644', newMode: '100644', oldSha: null, oldText: 'Some words here.\n',
        newText: 'Some words here.\n', hunks: [] };
      assert.notEqual(ruleRefusal({ files: [same], lineCount: 0 }), null, rel);
      // Nor is a file whose texts differ while the diff shows no changed line (git never gives
      // such a change; the rule that refuses it had no test until now).
      const silent = { ...same, newText: 'Some other words here.\n' };
      assert.deepEqual(ruleRefusal({ files: [silent], lineCount: 0 }), { clause: `I do not recognise ${rel} as wording or a colour`, cause: 'unrecognised' }, rel);
    }
  });

  await t.test('through the menu: a fault in the reading, in a rule or in the test run is "the check stopped"', async () => {
    const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': PASSING_TEST }, { testScript: SCRIPT });
    const page = ['src/pages/home.html', HOME_STORE];
    const real = { extname: path.posix.extname, normalize: String.prototype.normalize, test: RegExp.prototype.test };
    // [where the fault is injected, the judged file, the arguments before it, how to inject]
    const faults = [
      ['rule 1, the copy of the index', page, [], () => t.mock.method(safeFs, 'cpSync', boom)],
      ['rule 7, the name of the judged file', page, [], () => t.mock.method(path.posix, 'extname', (p) => (p === 'home.html' ? boom() : real.extname(p)))],
      ['rule 5, the folding of the path', page, [], () => t.mock.method(String.prototype, 'normalize', function fold(form) {
        if (form === 'NFKD') boom();
        return real.normalize.call(this, form);
      })],
      ['rule 6, the risk pattern', page, [], () => t.mock.method(RegExp.prototype, 'test', function probe(text) {
        if (this.source.includes('www')) boom();
        return real.test.call(this, text);
      })],
      ['rule 8, the test run', page, ['--run-tests'], () => t.mock.method(qualityAgent, 'runFullTests', async () => boom())]
    ];
    for (const [where, [p, after], args, injectFault] of faults) {
      const before = fs.readFileSync(path.join(root, ...p.split('/')), 'utf8');
      fs.writeFileSync(path.join(root, ...p.split('/')), after);
      injectFault();
      let res;
      try {
        res = await check(root, ...args, p);
      } finally {
        t.mock.restoreAll();
      }
      fs.writeFileSync(path.join(root, ...p.split('/')), before);
      assert.equal(res.text, unreadable('the check stopped'), where);
      assert.equal(res.detail, 'injected fault', where);
      assert.deepEqual(withoutTime(logLines(root)).pop(), { verdict: 'refused', cause: 'unreadable', urgent: false, files: 0, lines: 0 }, where);
    }
  });
});

// The coordinator's fourth and fifth points at review, 2026-10-09. The program that later
// reads a file sees its raw bytes, so wherever the check folds, strips, decodes or skips
// before it decides, that may only add reasons to refuse: a rule that refuses asks the text
// as written AND every folded form and refuses when one of them says so; a rule that lets a
// file through must hold for all of them. Each row is a file whose raw and transformed forms
// differ, and of which only one would pass.
test('round 9: a transform only adds reasons to refuse, and the check reads what the consumer reads', async () => {
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  const lost = (f) => `I could not read the change (${f} holds something I cannot follow)`;
  const area = (word) => (f) => `${f} sits in an area named ${word}, and such areas are never a hotfix`;
  const marker = (f) => `the wording in ${f} contains a number, a price, a web address or an e-mail address`;
  const testEdited = (f) => `it changes a test (${f})`;
  const PAGE = [HOME, HOME_STORE];
  const page = (a, b) => [HOME.replace('Save', a), HOME.replace('Save', b)];
  // [the transform, path, [before, after], the clause, or null for the first call's `checking`]
  const rows = [
    // Marks and unseen characters are dropped from a path: two words then read as one, so the
    // path is asked as written too (red on the round's own commit 795325ab: `checking`).
    ['path: marks and format characters dropped', 'src/authZWSPlogin/page.html', PAGE, area('auth')],
    ['path: marks and format characters dropped', 'src/authACUTElogin/page.html', PAGE, area('auth')],
    ['path: compatibility letters', 'src/authKGSIGN/page.html', PAGE, area('auth')],
    ['path: compatibility letters', 'src/FWAUTH/page.html', PAGE, area('auth')],
    // A governing folder and a test folder behind a character nobody sees.
    ['path: a governing folder folded', 'promptsZWSP/intro.html', PAGE, un],
    ['path: a test folder folded', 'teZWSPsts/page.html', PAGE, testEdited],
    // A name that qualifies only once folded does not qualify: the raw name must qualify too.
    ['path: a qualifying name must qualify as written', 'site/page.htZWSPml', PAGE, un],
    ['path: a qualifying name must qualify as written', 'site/page.cZWSPss', ['a { color: red; }\n', 'a { color: blue; }\n'], un],
    // An accent in a name changes nothing (guards).
    ['path: an accent', 'docs/cafEACUTE/page.html', PAGE, null],
    // A character reference is read as written and as the character it spells.
    ['markup: a reference decoded', 'src/pages/shy.html', page('Save', 'Sto&shy;re'), marker],
    ['markup: a reference decoded', 'src/pages/amp.html', page('Save', 'Save &amp; close'), null],
    // A colour's name in the letters a browser compares: the Kelvin sign is no `k`.
    ['stylesheet: letter case', 'src/styles/kelvin.css', ['a { color: red }\n', 'a { color: blacKELVIN }\n'], un],
    ['stylesheet: letter case', 'src/styles/upper.css', ['a { color: red }\n', 'a { COLOR: BLACK }\n'], un],
    ['stylesheet: letter case', 'src/styles/upper-value.css', ['a { COLOR: red }\n', 'a { COLOR: BLACK }\n'], null],
    // Line endings: the same on every line, not only as many.
    ['line endings moved', 'src/styles/moved.css', ['a { color: red; }\r\nb { margin: 0; }\n', 'a { color: blue; }\nb { margin: 0; }\r\n'], un],
    ['line endings moved', 'src/pages/moved.html', ['<p>Save</p>\r\n<p>More</p>\n', '<p>Store</p>\n<p>More</p>\r\n'], un],
    ['line endings moved', 'src/styles/kept.css', ['a { color: red; }\r\nb { margin: 0; }\n', 'a { color: blue; }\r\nb { margin: 0; }\n'], null],
    // A character set other than UTF-8, which is how the check read the bytes.
    ['character set', 'src/pages/sjis.html', page('<meta charset="shift_jis">Save', '<meta charset="shift_jis">Store'), (f) => inexact(f)],
    ['character set', 'src/pages/equiv.html', page('<meta http-equiv="Content-Type" content="text/html; charset=iso-2022-jp">Save',
      '<meta http-equiv="Content-Type" content="text/html; charset=iso-2022-jp">Store'), (f) => inexact(f)],
    ['character set', 'src/styles/sjis.css', ['@charset "shift_jis";\na { color: red; }\n', '@charset "shift_jis";\na { color: blue; }\n'], lost],
    ['character set', 'src/styles/utf.css', ['@charset "UTF-8";\na { color: red; }\n', '@charset "UTF-8";\na { color: blue; }\n'], null]
  ];
  const spelt = (text) => text.replaceAll('ZWSP', '\u200b').replaceAll('ZWNJ', '\u200c').replaceAll('EACUTE', '\u00e9').replaceAll('ACUTE', '\u0301')
    .replaceAll('KGSIGN', '\u338f').replaceAll('BOM', '\ufeff').replaceAll('KELVIN', '\u212a').replaceAll('FWAUTH', '\uff21\uff35\uff34\uff28').replaceAll('FWAGENTS', '\uff21\uff27\uff25\uff2e\uff34\uff33').replaceAll('BSLASH', '\\');
  const base = {};
  for (const row of rows) {
    row[1] = spelt(row[1]);
    row[2] = row[2].map(spelt);
    base[row[1]] = row[2][0];
  }
  const root = makeRepo(base);
  const wrong = [];
  for (const [what, p, [before, after], expected] of rows) {
    fs.writeFileSync(path.join(root, ...p.split('/')), after);
    const res = await check(root, p);
    fs.writeFileSync(path.join(root, ...p.split('/')), before);
    const want = expected === null ? STATUS_LINE : refusal(expected(p));
    if (res.text !== want) wrong.push(`${what}: ${JSON.stringify(p)} ${JSON.stringify(after).slice(0, 60)}: ${res.verdict === 'checking' ? 'checking' : res.text}`);
  }
  assert.deepEqual(wrong, []);
});

// The tenth round (the session coordinator's decision of 2026-10-10, on the owner's "fix the
// rework rounds"). Five reviewers attacked the eighth and ninth rounds, and every blocking
// finding sat in three kinds: Markdown and plain-text prose, catalogue files, and custom
// properties named for a colour. Those three are taken out of this piece: a `.md`, `.txt`,
// `.json`, `.yaml`, `.yml` or `.properties` file never qualifies, whatever its name and its
// place, and neither does a changed custom property. What stays is visible text in plain HTML
// pages and a colour value in a standard colour property of a stylesheet.
test('round 10: a file of a removed kind never qualifies, whatever its name and place', async () => {
  const setting = (f) => `it changes a setting in ${f}, and settings changes are a common cause of outages`;
  const json = (word) => `{\n  "save": "${word} the file"\n}\n`;
  // [extension, path, the text with `@` where one word changes, the clause]. Every path
  // qualified until this round: a documentation name, a catalogue folder with a language tag.
  const removed = [
    ['.md', 'README.md', 'Read the @ guide first.\n', gone],
    ['.md', 'docs/guide.md', 'Read the @ guide first.\n', gone],
    ['.md', 'docs/GUIDE.MD', 'Read the @ guide first.\n', gone],
    ['.txt', 'CHANGES.txt', 'The @ wording of the release.\n', gone],
    ['.txt', 'docs/readme.en.txt', 'Read the @ guide first.\n', gone],
    ['.txt', 'docs/README.TXT', 'Read the @ guide first.\n', gone],
    ['.json', 'locales/en.json', json('@'), setting],
    ['.json', 'locales/de/common.json', json('@'), setting],
    ['.json', 'translations/Strings.JSON', json('@'), setting],
    ['.yaml', 'i18n/fr.yaml', 'save: @ the file\n', setting],
    ['.yaml', 'lang/pt_BR/app.yaml', 'save: @ the file\n', setting],
    ['.yml', 'config/locales/en.yml', 'en:\n  save: @ the file\n', setting],
    ['.yml', 'messages/labels_en-US.yml', 'save: @ the file\n', setting],
    ['.properties', 'i18n/messages_fr.properties', 'save=@ the file\n', setting],
    ['.properties', 'lang/en/app.properties', 'save = @ the file\n', setting]
  ];
  assert.deepEqual([...new Set(removed.map(([ext]) => ext))], ['.md', '.txt', '.json', '.yaml', '.yml', '.properties'], 'every removed extension has a row');
  const wrong = [];
  for (const [, rel, template, clause] of removed) {
    const refused = ruleRefusal(changeOf(rel, template.replace('@', 'old'), template.replace('@', 'new')));
    if (refused === null || refused.clause !== clause(rel)) wrong.push(`${rel}: ${refused === null ? 'passed' : refused.clause}`);
  }
  assert.deepEqual(wrong, []);
});

test('round 10: through the real menu process, an imported instruction file, a catalogue and a README are refused', () => {
  const root = tmpDir();
  git(root, ['init', '-q']);
  const env = { ...process.env, TMPDIR: PRIVATE_TMP, TEMP: PRIVATE_TMP, TMP: PRIVATE_TMP };
  delete env.CLAUDE_PROJECT_DIR;
  delete env.NODE_TEST_CONTEXT;
  // The entry point sets a project up on its first call; what it writes is committed with the rest.
  assert.equal(spawnSync(NODE, [START], { cwd: root, encoding: 'utf8', env, timeout: 60000 }).status, 0);
  writeFiles(root, {
    'CLAUDE.md': '# Instructions\n\n@docs/rules.md\n',
    'docs/rules.md': 'Follow the old rules.\n',
    'locales/en.json': '{\n  "save": "Save the file"\n}\n',
    'README.md': 'Read the old guide first.\n'
  });
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'base']);
  const runs = [
    ['docs/rules.md', 'Follow the new rules.\n', gone('docs/rules.md')],
    ['locales/en.json', '{\n  "save": "Store the file"\n}\n', 'it changes a setting in locales/en.json, and settings changes are a common cause of outages'],
    ['README.md', 'Read the new guide first.\n', gone('README.md')]
  ];
  for (const [rel, after, clause] of runs) {
    fs.writeFileSync(path.join(root, ...rel.split('/')), after);
    for (const args of [[rel], ['--run-tests', rel]]) {
      const run = spawnSync(NODE, [START, 'hotfix', 'check', ...args], { cwd: root, encoding: 'utf8', env, timeout: 60000 });
      assert.equal(run.status, 0, run.stderr);
      const answer = JSON.parse(run.stdout);
      assert.equal(answer.verdict, 'refused', `${rel}: ${run.stdout}`);
      assert.equal(answer.text, refusal(clause), rel);
    }
  }
});

// The tenth round, fixes in what stays (the session coordinator's brief of 2026-10-10, part B).
// Each case was written, run and seen failing before its fix; the plan's record ("Fix round
// 10") holds what each answered before.
const pageWith = (text) => HOME.replace('Save', text);
const reasonOf = (refused) => (refused === null ? 'passed' : refused.clause);
const NOT_WORDING = 'I do not recognise src/pages/home.html as wording or a colour';
const RISK = 'the wording in src/pages/home.html contains a number, a price, a web address or an e-mail address';

test('round 10, B1 to B3: a character nobody sees, letters of two scripts in one word, and a price', () => {
  const judgeText = (before, after) => reasonOf(ruleRefusal(changeOf('src/pages/home.html', pageWith(before), pageWith(after))));
  // B1. A character nobody sees: default-ignorable code points (the Hangul filler, the combining
  // grapheme joiner, a variation selector), a lone surrogate, a private-use and an unassigned
  // code point, the line and paragraph separators, the blank Braille pattern, two non-characters.
  const unseen = { 'the Hangul filler': '\u3164', 'the combining grapheme joiner': '\u034f', 'a variation selector': '\u{e0101}', 'a lone surrogate': '\ud800',
    'a private-use character': '\ue000', 'an unassigned code point': '\u0378', 'the line separator': '\u2028', 'the paragraph separator': '\u2029',
    'the blank Braille pattern': '\u2800', 'the non-character U+FFFE': '\ufffe', 'the non-character U+FFFF': '\uffff', 'a zero-width space': '\u200b' };
  for (const [name, character] of Object.entries(unseen)) {
    assert.equal(judgeText('Save', `Sa${character}ve`), NOT_WORDING, `${name} in the new text`);
    assert.equal(judgeText(`Sa${character}ve`, 'Save'), NOT_WORDING, `${name} in the old text`);
  }
  // B2. A run of letters that mixes Latin with Cyrillic or Greek.
  assert.equal(judgeText('Pay', 'P\u0430y'), NOT_WORDING, 'a Cyrillic letter in a Latin word');
  assert.equal(judgeText('Pay', '\u03a1ay'), NOT_WORDING, 'a Greek letter in a Latin word');
  assert.equal(judgeText('Pay', 'Pa\u0301\u0443'), NOT_WORDING, 'a mark between them does not part the word');
  // One script per word passes, in any script, and so do two words of two scripts.
  for (const text of ['\u041f\u0440\u0438\u0432\u0435\u0442', '\u039a\u03b1\u03bb\u03b7\u03bc\u03ad\u03c1\u03b1', 'Save \u041f\u0440\u0438\u0432\u0435\u0442', 'caf\u00e9 na\u00efve', 'Save-\u043c\u0438\u0440']) {
    assert.equal(judgeText('Save', text), 'passed', text);
  }
  // B3. `$` is decided once, by the number-and-price rule, as `€` is.
  assert.equal(judgeText('Only five', 'Only $5'), RISK);
  assert.equal(judgeText('Only five', 'Only \u20ac5'), RISK);
  assert.equal(judgeText('Only five', 'Only $five'), RISK);
});

test('round 10, B4: guards closed by construction', async (t) => {
  const page = () => changeOf('src/pages/home.html', HOME, HOME_STORE);
  await t.test('a kind no reader is written for stops the check, never another reader', () => {
    for (const kind of ['catalogue', 'documentation', 'toString', undefined]) {
      const change = page();
      Object.defineProperty(change.files[0], 'kind', { get: () => kind, set() {} });
      assert.throws(() => ruleRefusal(change), /no reader for the kind/, String(kind));
    }
  });
  await t.test('a page with no changed text is no pass of nothing', () => {
    // git gives no such change; a caller that hands over changed lines beside equal texts gets a refusal.
    const change = page();
    change.files[0].newText = HOME;
    assert.equal(reasonOf(ruleRefusal(change)), NOT_WORDING);
  });
  await t.test('CTOC\'s protected paths are asked in every form of the path, and without regard to letter case', async () => {
    const files = { 'package.json': '{ "name": "ctoc" }\n', 'CLAUDE.md': '# CTOC Project Instructions\n', '.ctoc/keep.json': '{}\n' };
    const area = (f) => refusal(`${f} sits in an area named enforcement, and such areas are never a hotfix`);
    for (const rel of ['src/hooks/notes.html', 'src/Hooks/notes.html', 'SRC/HOOKS/notes.html', 'src/hoo\u200bks/notes.html', 'src/\uff48ooks/notes.html']) {
      const root = makeRepo({ ...files, [rel]: HOME });
      fs.writeFileSync(path.join(root, ...rel.split('/')), HOME_STORE);
      assert.equal((await check(root, rel)).text, area(rel), JSON.stringify(rel));
    }
  });
  await t.test('a package folder that cannot be listed, or an install record that cannot be read, stops the check: only "does not exist" passes', async () => {
    const denied = () => { throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); };
    const site = process.platform === 'win32' ? ['.venv', 'Lib', 'site-packages'] : ['.venv', 'lib', 'python3.12', 'site-packages'];
    const root = workspaceProject('greet', 'greet', { '.gitignore': 'node_modules/\n.venv/\n' });
    writeFiles(root, { '.venv/pyvenv.cfg': 'home = /usr/bin\n', [`${site.join('/')}/_x.pth`]: '# nothing\n' });
    fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
    const real = { readdir: safeFs.readdirSync, read: safeFs.readFileSync, lstat: safeFs.lstatSync };
    const inWorkingFolder = (p) => String(p).startsWith(root);
    const faults = [
      ['the folder of installed packages cannot be listed', () => t.mock.method(safeFs, 'readdirSync', (p, ...rest) => (inWorkingFolder(p) && String(p).endsWith('node_modules') ? denied() : real.readdir(p, ...rest)))],
      ['an install record cannot be read', () => t.mock.method(safeFs, 'readFileSync', (p, ...rest) => (String(p).endsWith('_x.pth') ? denied() : real.read(p, ...rest)))],
      ['an entry of the folder cannot be looked at', () => t.mock.method(safeFs, 'lstatSync', (p, ...rest) => (inWorkingFolder(p) && String(p).endsWith(path.join('node_modules', 'greet')) ? denied() : real.lstat(p, ...rest)))]
    ];
    for (const [what, inject] of faults) {
      inject();
      let res;
      try {
        res = await check(root, '--run-tests', 'src/pages/home.html');
      } finally {
        t.mock.restoreAll();
      }
      assert.equal(res.text, unreadable('the check stopped'), what);
      assert.match(res.detail, /EACCES/, what);
    }
    // With nothing injected the same change passes: what does not exist is no fault.
    assertPass(await check(root, '--run-tests', 'src/pages/home.html'), ['src/pages/home.html']);
  });
});

test('round 10, B5 to B7: a control character in a stylesheet, the exact grammar of a colour value, and a name before `url(`', () => {
  const css = (before, after) => reasonOf(ruleRefusal(changeOf('src/styles/site.css', before, after)));
  const NOT_COLOUR = 'I do not recognise src/styles/site.css as wording or a colour';
  const LOST = 'I could not read the change (src/styles/site.css holds something I cannot follow)';
  // B5. The comparison writes one control character in the place of every colour. A stylesheet
  // that holds that character itself could move a value from one declaration to another unseen.
  assert.equal(css('a { color: red; animation-name: \u0001; outline-style: tan }\n', 'a { color: blue; animation-name: tan; outline-style: \u0001 }\n'), LOST);
  for (const control of ['\u0000', '\u0001', '\u0002', '\u0003', '\u0008', '\u000b', '\u001b', '\u007f', '\u0085', '\u009f']) {
    assert.equal(css(`a { color: red } /* ${control} */\n`, `a { color: blue } /* ${control} */\n`), LOST, `U+${control.charCodeAt(0).toString(16)}`);
  }
  assert.equal(css('a {\tcolor: red;\f}\r\n', 'a {\tcolor: blue;\f}\r\n'), 'passed', 'a tab, a form feed and a carriage return are white space');
  // B6. One function decides every colour value, by an exact grammar.
  const value = (before, after) => css(`a { color: ${before} }\n`, `a { color: ${after} }\n`);
  const colours = ['#abc', '#abcd', '#aabbcc', '#AABBCC80', 'tomato', 'Transparent', 'rgb(10, 20, 30)', 'rgb(10,20,30)', 'rgb( 10 , 20 , 30 )', 'rgb(10%, 20%, 30%)',
    'rgba(10, 20, 30, 0.5)', 'rgba(10, 20, 30, 50%)', 'rgb(10, 20, 30, .5)', 'rgb(-1, +2, 300)', 'rgb(1.5%, 20%, 30%)', 'hsl(210, 50%, 40%)', 'hsl(-210.5, 50%, 40%)',
    'hsla(210, 50%, 40%, 0.9)', 'hsl(210, 50%, 40%, 90%)'];
  for (const colour of colours) assert.equal(value('red', colour), 'passed', colour);
  // The brief's two witnesses first; then every form the grammar does not hold.
  assert.equal(value('rgb(10, 20, 30%)', 'rgb(10, 20, 40%)'), NOT_COLOUR, 'integers and a percentage, mixed');
  assert.equal(value('hsl(10, 20, 30)', 'hsl(10, 20, 40)'), NOT_COLOUR, 'a saturation and a lightness that are no percentages');
  const none = ['#ab', '#abcde', '#abcdefg', '#abcdefghi', '#ggg', 'rgb(10, 20)', 'rgb(10, 20, 30, 0.5, 1)', 'rgb(10 20 30)', 'rgb(10 20 30 / 50%)', 'rgb(10%, 20, 30)',
    'rgb(1.5, 2, 3)', 'rgb(none, 20, 30)', 'rgb(10, 20, 30,)', 'rgb(, 20, 30)', 'rgb(10, 20, 30deg)', 'rgb(1e2, 20, 30)', 'hsl(210deg, 50%, 40%)', 'hsl(210 50% 40%)',
    'hsl(210%, 50%, 40%)', 'hsl(210, 50, 40%)', 'hsl(210, 50%, 40%, x)', 'hwb(120 0% 0%)', 'lab(50% 40 59)', 'oklch(60% 0.2 240)', 'color(display-p3 1 0.5 0)',
    'rgb(calc(1), 2, 3)', 'rgbx(1, 2, 3)', 'RGB(1, 2, 3)', 'rgb(1., 2, 3)', 'rgb(1, 2, 3) x', 'currentcolor', 'reddish', 'r\u0435d'];
  for (const text of none) {
    assert.equal(value('red', text), NOT_COLOUR, `to ${text}`);
    assert.equal(value(text, 'red'), NOT_COLOUR, `from ${text}`);
  }
  // B7. A character above U+007F, or an escape, is part of a name: what follows is no `url(`,
  // so its brackets are read as brackets, and the brace inside them cannot be followed.
  assert.equal(css('a { x: \u00e9url({); color: red }\n', 'a { x: \u00e9url({); color: blue }\n'), LOST, 'a letter above U+007F before url(');
  assert.equal(css('a { x: \\41 url({); color: red }\n', 'a { x: \\41 url({); color: blue }\n'), LOST, 'a hexadecimal escape before url(');
  assert.equal(css('a { x: \\ url({); color: red }\n', 'a { x: \\ url({); color: blue }\n'), LOST, 'an escaped space before url(');
  assert.equal(css('a { x: url({); color: red }\n', 'a { x: url({); color: blue }\n'), 'passed', 'a real url( holds what it holds');
  assert.equal(css('a { x: 1px url({); color: red }\n', 'a { x: 1px URL({); color: blue }\n'), NOT_COLOUR, 'and is compared exactly');
});

test('round 10, B9 and B10: a sensitive word anywhere inside a part of the path, a part that holds `prompt`, and a page in a dot-folder', () => {
  const page = (rel) => reasonOf(ruleRefusal(changeOf(rel, HOME, HOME_STORE)));
  const sheet = (rel) => reasonOf(ruleRefusal(changeOf(rel, 'a { color: red; }\n', 'a { color: blue; }\n')));
  const area = (rel, word) => `${rel} sits in an area named ${word}, and such areas are never a hotfix`;
  const un = (rel) => `I do not recognise ${rel} as wording or a colour`;
  // B9. The brief's witnesses: [a part of the path, the word it holds].
  const held = [['oauth', 'auth'], ['Oauth', 'auth'], ['oauth2client', 'auth'], ['idtoken', 'token'], ['sshkeys', 'key'], ['paymentsapi', 'payment'], ['apikey', 'key'],
    ['authentication', 'auth'], ['authorization', 'auth'], ['deployment', 'deploy'], ['security', 'security'], ['coauthor', 'auth'], ['authority', 'auth'],
    ['HTMLAuthor', 'auth'], ['APIKeyboard', 'key'], ['ci', 'ci'], ['ci-tools', 'ci'], ['CI_scripts', 'ci']];
  for (const [part, word] of held) {
    assert.equal(page(`src/${part}/page.html`), area(`src/${part}/page.html`, word), part);
    assert.equal(page(`src/pages/${part}.html`), area(`src/pages/${part}.html`, word), `${part} as a file name`);
  }
  assert.equal(sheet('src/styles/accessTokens.css'), area('src/styles/accessTokens.css', 'token'));
  assert.equal(sheet('src/styles/brandTokens.css'), area('src/styles/brandTokens.css', 'token'));
  assert.equal(sheet('src/tokens/base.css'), area('src/tokens/base.css', 'token'), 'a folder named tokens');
  assert.equal(page('src/pages/tokens.html'), area('src/pages/tokens.html', 'token'), 'a page named tokens');
  // What stays: a part that is exactly `author` or `authors`; `ci` inside a longer part; a
  // stylesheet's own name part that is exactly `tokens`.
  for (const part of ['author', 'Authors', 'circle', 'pencil', 'special', 'home']) assert.equal(page(`src/${part}/page.html`), 'passed', part);
  for (const rel of ['src/styles/tokens.css', 'src/styles/design-tokens.css', 'src/styles/Tokens.dark.css']) assert.equal(sheet(rel), 'passed', rel);
  // B10. A part of the path that holds `prompt` governs the work.
  for (const rel of ['src/llm/system_prompt.html', 'src/llm/SystemPrompt.html', 'src/prompting/page.html', 'src/my-prompts-old/page.html']) assert.equal(page(rel), un(rel), rel);
  assert.equal(sheet('src/styles/Prompt.css'), un('src/styles/Prompt.css'));
  assert.equal(page('src/prom/pt.html'), 'passed', 'the word stands in one part');
  // A dot-folder may be some tool's own: a page or a stylesheet below one never qualifies.
  for (const rel of ['.storybook/preview-head.html', 'docs/.vitepress/theme/index.html', '.foo/page.html']) assert.equal(page(rel), un(rel), rel);
  assert.equal(sheet('.vitepress/theme/custom.css'), un('.vitepress/theme/custom.css'));
  assert.equal(page('docs/a.b/page.html'), 'passed', 'a dot inside a folder name is no dot-folder');
  assert.equal(page('.github/pages/index.html'), 'it changes how the project is built or shipped in .github/pages/index.html', 'a build folder is named as one');
});

// Found after the B9 commit (3ce7ae0a) by comparing it with the round's base commit: reading
// each part of a path whole and in lower case lost the split at capitals, so `ci` as a
// camel-case sub-word, and its plural, passed where they were refused. Nothing the earlier
// matcher refused may pass: the refusal is what either matcher finds.
test('round 10, B9: whatever the earlier matcher refused is still refused (a word as a camel-case sub-word, or in the plural)', () => {
  const sheet = (rel) => reasonOf(ruleRefusal(changeOf(rel, 'a { color: red; }\n', 'a { color: blue; }\n')));
  const page = (rel) => reasonOf(ruleRefusal(changeOf(rel, HOME, HOME_STORE)));
  const area = (rel, word) => `${rel} sits in an area named ${word}, and such areas are never a hotfix`;
  for (const rel of ['src/runCI/site.css', 'src/ui/runCI.css', 'src/ciConfig/site.css', 'src/ui/ciConfig.css', 'src/githubCI/site.css', 'src/ui/githubCI.css',
    'src/myCi/site.css', 'src/ui/myCi.css', 'src/cis/site.css', 'src/CIs/site.css']) {
    assert.equal(sheet(rel), area(rel, 'ci'), rel);
  }
  // Every word of the list, as the earlier matcher found it: whole, in the plural, as a
  // camel-case sub-word, and where the last capital of a run of capitals starts it.
  const words = ['auth', 'login', 'logout', 'password', 'session', 'token', 'secret', 'credential', 'key', 'permission', 'role', 'admin', 'payment', 'billing',
    'checkout', 'price', 'pricing', 'invoice', 'tax', 'legal', 'terms', 'privacy', 'consent', 'cookie', 'gdpr', 'license', 'migration', 'schema', 'database', 'sql',
    'deploy', 'workflow', 'ci'];
  const capital = (word) => word[0].toUpperCase() + word.slice(1);
  for (const word of words) {
    for (const part of [word, `${word}s`, `${word}es`, word.toUpperCase(), `my${capital(word)}`, `${word}Panel`, `API${capital(word)}`, `x-${word}_y`]) {
      const answer = page(`src/${part}/page.html`);
      assert.match(answer, / sits in an area named \p{L}+, and such areas are never a hotfix$/u, `${part}: ${answer}`);
    }
  }
  // What passed then passes now, where the tenth round did not decide otherwise.
  for (const part of ['circle', 'Author', 'ui', 'special', 'site']) assert.equal(page(`src/${part}/page.html`), 'passed', part);
});
