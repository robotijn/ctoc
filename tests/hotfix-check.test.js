'use strict';

// The hotfix check, driven the way a session drives it: through the menu router
// (`route(['hotfix', 'check', ...])`) against a real temporary git repository, and once
// through the real menu process (`node src/commands/start.js hotfix check ...`).
// Plan: plans/todo/ctoc-checks-that-a-hotfix-is-really-small-and-safe-s1-the-hotfix-check.md,
// Step 8, cases 1 to 28.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { route } = require('../src/lib/menu-screens');

const START = path.join(__dirname, '..', 'src', 'commands', 'start.js');
const STATUS_LINE = 'Checking the hotfix against the existing tests.';
const USAGE = 'Use: hotfix check [--run-tests] [<file> ...]';
const LOG = path.join('.ctoc', 'logs', 'hotfix-checks.jsonl');

const SENTENCE_START = 'I did not treat this as a hotfix because ';
const refusal = (clause) => `I did not treat this as a hotfix because ${clause}; `
  + 'it goes through a normal plan, and your edits stay in place, not committed.';

const HOME = '<!doctype html>\n<html>\n<body>\n<button>Save</button>\n</body>\n</html>\n';
const HOME_STORE = HOME.replace('<button>Save</button>', '<button>Store</button>');
const PASSING_TEST = [
  "const test = require('node:test');",
  "const assert = require('node:assert');",
  "const fs = require('fs');",
  "const path = require('path');",
  "test('has a button', () => {",
  "  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'home.html'), 'utf8');",
  "  assert.ok(html.includes('<button>'));",
  '});',
  ''
].join('\n');
const FAILING_TEST = [
  "const test = require('node:test');",
  "const assert = require('node:assert');",
  "const fs = require('fs');",
  "const path = require('path');",
  "test('shows Save', () => {",
  "  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'home.html'), 'utf8');",
  "  assert.ok(html.includes('Save'));",
  '});',
  ''
].join('\n');
const MARKER_TEST = [
  "const fs = require('fs');",
  "const path = require('path');",
  "fs.writeFileSync(path.join(__dirname, '..', 'ran.marker'), 'ran');",
  "const test = require('node:test');",
  "test('has a button', () => {});",
  ''
].join('\n');
const SCRIPT = 'node --test tests/*.test.js';

const tmpRoots = [];
test.after(() => {
  for (const r of tmpRoots) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

function git(cwd, args) {
  const r = spawnSync('git', ['-c', 'user.name=Hotfix Test', '-c', 'user.email=hotfix@test.invalid',
    '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hotfix-check-'));
  tmpRoots.push(d);
  return d;
}

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

/**
 * A committed repository holding `files`; with `testScript`, a package.json whose
 * `test` script is that command.
 */
function makeRepo(files, { testScript = null, autocrlf = false, init = true, commit = true } = {}) {
  const root = tmpDir();
  if (init) {
    git(root, ['init', '-q']);
    if (autocrlf) git(root, ['config', 'core.autocrlf', 'true']);
  }
  const all = { ...files };
  if (testScript !== null) {
    all['package.json'] = JSON.stringify({
      name: 'hotfix-fixture', version: '1.0.0', private: true, scripts: { test: testScript }
    }, null, 2) + '\n';
  }
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

/**
 * A nested `node --test` inherits NODE_TEST_CONTEXT from this outer runner and reports to
 * it instead of printing its counters (see tests/step-13-verify.test.js), so the project's
 * own test run is made with the variable cleared, as it is in a real session.
 */
async function check(root, ...args) {
  const saved = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    return await route(['hotfix', 'check', ...args], root);
  } finally {
    if (saved !== undefined) process.env.NODE_TEST_CONTEXT = saved;
  }
}

function logLines(root) {
  const p = path.join(root, LOG);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** Status outside `.ctoc/`, the index, and the bytes of every changed or new file. */
function snapshot(root) {
  const status = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root })
    .stdout.toString('utf8').split('\0').filter((e) => e && !e.slice(3).startsWith('.ctoc/'));
  const index = spawnSync('git', ['ls-files', '-s'], { cwd: root }).stdout.toString('utf8');
  const bytes = {};
  for (const e of status) {
    const rel = e.slice(3);
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && fs.lstatSync(abs).isFile()) {
      bytes[rel] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    }
  }
  return { status, index, bytes };
}

/** Case 24: a refusal changes, stages, stashes or deletes nothing. */
async function refusedUntouched(root, args, clause) {
  const before = snapshot(root);
  const stashBefore = spawnSync('git', ['stash', 'list'], { cwd: root, encoding: 'utf8' }).stdout;
  const res = await check(root, ...args);
  assert.equal(res.verdict, 'refused', JSON.stringify(res));
  assert.equal(res.text, refusal(clause));
  assert.deepEqual(res.ask, { questions: [] });
  assert.deepEqual(res.actions, {});
  assert.deepEqual(snapshot(root), before);
  assert.equal(spawnSync('git', ['stash', 'list'], { cwd: root, encoding: 'utf8' }).stdout, stashBefore);
  return res;
}

/** The plan's quoting: each path single-quoted, a `'` inside written as `'\\''`. */
const q = (f) => `'${f.replace(/'/g, "'\\''")}'`;

function assertChecking(res, files) {
  assert.equal(res.verdict, 'checking', JSON.stringify(res));
  assert.equal(res.text, STATUS_LINE);
  assert.equal(res.next, `hotfix check --run-tests ${files.map(q).join(' ')}`);
  assert.deepEqual(res.ask, { questions: [] });
  assert.deepEqual(res.actions, {});
}

function assertPass(res, files) {
  assert.equal(res.verdict, 'hotfix', JSON.stringify(res));
  assert.equal(res.text, '');
  assert.deepEqual(res.commit.files, files);
  assert.equal(res.commit.add, `git add -- ${files.map(q).join(' ')}`);
  assert.equal(res.commit.message, "git commit -m 'hotfix: <what changed>'");
  assert.deepEqual(res.ask, { questions: [] });
  assert.deepEqual(res.actions, {});
}

async function buttonWording(root) {
  fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
  const first = await check(root, 'src/pages/home.html');
  const second = await check(root, '--run-tests', 'src/pages/home.html');
  return { first, second };
}

test('case 1 + 26 + 28: a button wording change passes in two calls; the process is restored; one log line', async () => {
  const root = testedProject();
  fs.writeFileSync(path.join(root, 'src', 'pages', 'home.html'), HOME_STORE);
  const first = await check(root, 'src/pages/home.html');
  assertChecking(first, ['src/pages/home.html']);
  assert.deepEqual(logLines(root), [], 'a checking answer writes no log line');

  const cwdBefore = process.cwd();
  const logBefore = console.log;
  const second = await check(root, '--run-tests', 'src/pages/home.html');
  assert.equal(process.cwd(), cwdBefore, 'case 26: the working directory is restored');
  assert.equal(console.log, logBefore, 'case 26: console.log is restored');
  assertPass(second, ['src/pages/home.html']);

  const lines = logLines(root);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].verdict, 'hotfix');
  assert.equal(lines[0].cause, null);
  assert.equal(lines[0].urgent, false);
  assert.equal(lines[0].files, 1);
  assert.equal(lines[0].lines, 2);
  assert.match(lines[0].at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
});

test('case 2: a button colour change passes; commit.add names only the stylesheet', async () => {
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
  assert.equal(b.second.commit.add, "git add -- 'src/pages/home.html'");
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
  const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.js': MARKER_TEST }, { testScript: SCRIPT });
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  fs.writeFileSync(path.join(root, 'tests/home.test.js'), MARKER_TEST + '// edited\n');
  for (const args of [['src/pages/home.html', 'tests/home.test.js'], ['--run-tests', 'src/pages/home.html', 'tests/home.test.js']]) {
    await refusedUntouched(root, args, 'it changes a test (tests/home.test.js)');
  }
  assert.equal(fs.existsSync(path.join(root, 'ran.marker')), false, 'no test was run');
});

test('case 14: a run in which no test ran is not a pass', async () => {
  for (const script of ['node --test empty/*.test.js', 'node -e ""']) {
    const root = makeRepo({ 'src/pages/home.html': HOME, 'empty/.gitkeep': '' }, { testScript: script });
    fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
    assertChecking(await check(root, 'src/pages/home.html'), ['src/pages/home.html']);
    await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'], 'no test ran, so nothing confirms the change');
  }
});

test('case 15: a change that cannot be read is refused and never passes', async () => {
  const notRepo = makeRepo({ 'src/pages/home.html': HOME }, { init: false });
  const noCommit = makeRepo({ 'src/pages/home.html': HOME }, { commit: false });
  for (const args of [['src/pages/home.html'], ['--run-tests', 'src/pages/home.html']]) {
    const a = await check(notRepo, ...args);
    assert.equal(a.text, refusal('I could not read the change (this folder is not a git repository)'));
    const b = await check(noCommit, ...args);
    assert.equal(b.text, refusal('I could not read the change (this folder has no commit to compare with)'));
  }
  const root = testedProject();
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  const savedPath = process.env.PATH;
  process.env.PATH = tmpDir();
  let res;
  try {
    res = await check(root, 'src/pages/home.html');
  } finally {
    process.env.PATH = savedPath;
  }
  assert.equal(res.verdict, 'refused');
  assert.equal(res.text, refusal('I could not read the change (git is not installed)'));
});

test('case 16: an unrecognised file kind is refused', async () => {
  const root = testedProject({ 'docs/diagram.svg': '<svg>\n<text x="1">Save</text>\n</svg>\n' });
  fs.writeFileSync(path.join(root, 'docs/diagram.svg'), '<svg>\n<text x="1">Store</text>\n</svg>\n');
  await refusedUntouched(root, ['docs/diagram.svg'], 'I do not recognise docs/diagram.svg as wording or a colour');
});

test('case 17: documentation passes directly without a test command; markup does not', async () => {
  const root = makeRepo({ 'README.md': '# Fixture\n\nThis is the old wording.\n', 'src/pages/home.html': HOME });
  fs.writeFileSync(path.join(root, 'README.md'), '# Fixture\n\nThis is the new wording.\n');
  const doc = await check(root, 'README.md');
  assertPass(doc, ['README.md']);
  assert.ok(doc.tests, 'the pass says how it was confirmed');

  fs.writeFileSync(path.join(root, 'README.md'), '# Fixture\n\nThis is the old wording.\n');
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  await refusedUntouched(root, ['src/pages/home.html'], 'no test ran, so nothing confirms the change');
  await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'], 'no test ran, so nothing confirms the change');
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
  assertPass(await check(root, 'docs/guide.md'), ['docs/guide.md']);
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

test('case 25: through the real menu process, standard output is exactly one JSON document', () => {
  const root = tmpDir();
  git(root, ['init', '-q']);
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  delete env.NODE_TEST_CONTEXT;
  const bare = spawnSync(process.execPath, [START], { cwd: root, encoding: 'utf8', env });
  assert.equal(bare.status, 0, bare.stderr);
  writeFiles(root, {
    'src/pages/home.html': HOME,
    'tests/home.test.js': PASSING_TEST,
    'package.json': JSON.stringify({ name: 'hotfix-fixture', version: '1.0.0', private: true, scripts: { test: SCRIPT } }, null, 2) + '\n'
  });
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'base']);
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);

  const first = spawnSync(process.execPath, [START, 'hotfix', 'check', 'src/pages/home.html'], { cwd: root, encoding: 'utf8', env });
  assert.equal(first.status, 0, first.stderr);
  assertChecking(JSON.parse(first.stdout), ['src/pages/home.html']);
  const second = spawnSync(process.execPath, [START, 'hotfix', 'check', '--run-tests', 'src/pages/home.html'], { cwd: root, encoding: 'utf8', env });
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
  assert.match(c.text, /^Unknown hotfix command: /);
  assert.deepEqual(logLines(root), [], 'the usage answer writes no log line');
});

test('case 28: the log counts verdicts and causes, holds no names or wording, and never changes an answer', async () => {
  const cart = 'function ok(items) {\n  if (items.length > 0) return true;\n  return false;\n}\n';
  const root = testedProject({ 'src/cart.js': cart });
  await buttonWording(root);
  assert.equal(logLines(root).length, 1);
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME);
  fs.writeFileSync(path.join(root, 'src/cart.js'), cart.replace('> 0', '>= 0'));
  await check(root, 'src/cart.js');
  let lines = logLines(root);
  assert.equal(lines.length, 2);
  assert.equal(lines[1].verdict, 'refused');
  assert.equal(lines[1].cause, 'program-logic');
  assert.equal(lines[1].urgent, false);
  await route(['hotfix', 'frobnicate'], root);
  lines = logLines(root);
  assert.equal(lines.length, 2, 'the usage answer appends nothing');
  const raw = fs.readFileSync(path.join(root, LOG), 'utf8');
  for (const leak of ['src/', 'home', 'Save', 'Store', 'cart']) assert.equal(raw.includes(leak), false, `log holds ${leak}`);
  for (const l of lines) assert.deepEqual(Object.keys(l).sort(), ['at', 'cause', 'files', 'lines', 'urgent', 'verdict']);

  const reference = await buttonWording(testedProject());
  const blocked = testedProject();
  fs.mkdirSync(path.join(blocked, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(blocked, '.ctoc', 'logs'), 'not a folder');
  const answers = await buttonWording(blocked);
  assert.deepEqual(answers.first, reference.first);
  assert.deepEqual(answers.second, reference.second);
});

// Step 14: every branch of the check exercised.

test('a file that is not valid UTF-8 is not text', async () => {
  const root = makeRepo({ 'docs/latin.md': Buffer.from('Café old\n', 'latin1') });
  fs.writeFileSync(path.join(root, 'docs/latin.md'), Buffer.from('Café new\n', 'latin1'));
  await refusedUntouched(root, ['docs/latin.md'], 'I could not read the change (docs/latin.md is not text)');
});

test('a file name git quotes in its patch is read, and commit.add stages exactly it', async () => {
  // A backslash is never in the name: the check reads every `\` in a named path as `/`.
  // Where such names cannot exist (Windows), a plain name with a space and a quote.
  const name = process.platform === 'win32'
    ? "docs/it's a plan $HOME.md"
    : "docs/it's \"a\"\tplan $HOME \u0001 é.md";
  const root = makeRepo({ [name]: 'Old wording.\n' });
  fs.writeFileSync(path.join(root, ...name.split('/')), 'New wording.\n');
  const res = await check(root, name);
  assertPass(res, [name]);
  const lines = logLines(root);
  assert.equal(lines[lines.length - 1].lines, 2);
  if (process.platform !== 'win32') {
    const staged = spawnSync('sh', ['-c', res.commit.add], { cwd: root, encoding: 'utf8' });
    assert.equal(staged.status, 0, staged.stderr);
    const names = spawnSync('git', ['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only', '-z'], { cwd: root })
      .stdout.toString('utf8').split('\0').filter(Boolean);
    assert.deepEqual(names, [name]);
  }
});

test('anything that throws inside the check is "the check stopped", cleaned and capped, and logs nothing', async () => {
  const parent = tmpDir();
  const root = path.join(parent, `missing\n${'x'.repeat(300)}`);
  const res = await check(root, 'README.md');
  assert.equal(res.verdict, 'refused');
  const prefix = refusal('I could not read the change (the check stopped: ');
  const head = prefix.slice(0, prefix.indexOf('the check stopped: ') + 'the check stopped: '.length);
  assert.ok(res.text.startsWith(head), res.text);
  const message = res.text.slice(head.length, res.text.indexOf(')' + '; it goes through'));
  assert.ok(message.length > 0 && message.length <= 200, message);
  assert.equal(/[\u0000-\u001f]/.test(res.text), false);
  assert.equal(fs.existsSync(root), false, 'the log never creates the missing folder');
});

test('a log above 1 MiB is emptied before the next line', async () => {
  const root = makeRepo({ 'README.md': 'Old wording.\n' });
  fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true });
  fs.writeFileSync(path.join(root, LOG), `${'x'.repeat(1024 * 1024 + 10)}\n`);
  fs.writeFileSync(path.join(root, 'README.md'), 'New wording.\n');
  assertPass(await check(root, 'README.md'), ['README.md']);
  const lines = logLines(root);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].verdict, 'hotfix');
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
  await refusedUntouched(root, ['--run-tests', 'src/pages/home.html'], 'no test ran, so nothing confirms the change');
});

test('when the affected-test selection names a test, that selection runs', async () => {
  // `tests/home.test.html` is the name the selection's heuristic maps `home.html` to.
  const root = makeRepo({ 'src/pages/home.html': HOME, 'tests/home.test.html': '<p>marker</p>\n', 'tests/home.test.js': PASSING_TEST },
    { testScript: SCRIPT });
  writeFiles(root, { 'tests/other.test.js': PASSING_TEST.replace('has a button', 'still has a button') });
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'a second test']);
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  const res = await check(root, '--run-tests', 'src/pages/home.html');
  assertPass(res, ['src/pages/home.html']);
  assert.equal(res.tests, '2 tests passed.');
});

test('edge shapes of every kind give the exact verdict', async () => {
  const NO_TEST = 'no test ran, so nothing confirms the change';
  const un = (f) => `I do not recognise ${f} as wording or a colour`;
  // [path, base content, new content, expected clause, or null for the documentation pass]
  const shapes = [
    ['src/pages/lead.html', 'Welcome <b>home</b>\n', 'Hello <b>home</b>\n', un('src/pages/lead.html')],
    ['src/pages/gt.html', '>Save</b>\n', '>Store</b>\n', un('src/pages/gt.html')],
    ['src/pages/comment.html', '<!-- c -->Save</p>\n', '<!-- c -->Store</p>\n', un('src/pages/comment.html')],
    ['src/pages/odd.html', '</1>Save</p>\n', '</1>Store</p>\n', un('src/pages/odd.html')],
    ['src/pages/open.html', '<p>Save\n', '<p>Store\n', un('src/pages/open.html')],
    ['src/pages/tail.html', '<p>Save<\n', '<p>Store<\n', un('src/pages/tail.html')],
    ['src/pages/heart.html', '<p>Save <3</p>\n', '<p>Store <3</p>\n', un('src/pages/heart.html')],
    ['src/pages/grow.html', '<p>a</p>\n', '<p>a</p>\n<p>b</p>\n', un('src/pages/grow.html')],
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
  assertPass(await check(root, 'docs/second.md', 'docs/endings.md'), ['docs/endings.md', 'docs/second.md']);
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
  assertPass(await check(app), ['README.md']);
  assertPass(await check(app, 'README.md'), ['README.md']);
});

test('a git command that fails is "the check stopped"', async () => {
  const root = testedProject();
  fs.writeFileSync(path.join(root, 'src/pages/home.html'), HOME_STORE);
  fs.writeFileSync(path.join(root, '.git', 'index'), 'not an index');
  const res = await check(root, 'src/pages/home.html');
  assert.equal(res.verdict, 'refused');
  assert.ok(res.text.startsWith(`${SENTENCE_START}I could not read the change (the check stopped: git diff failed: `), res.text);
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

test('the log is never written through a symbolic link', async () => {
  const outside = tmpDir();
  const victim = path.join(outside, 'victim.txt');
  fs.writeFileSync(victim, 'precious\n');
  const variants = [
    (root) => { fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true }); fs.symlinkSync(victim, path.join(root, LOG)); },
    (root) => { fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true }); fs.symlinkSync(outside, path.join(root, '.ctoc', 'logs'), 'dir'); },
    // A dangling link: it points at a file that does not exist yet.
    (root) => { fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true }); fs.symlinkSync(path.join(outside, 'created.txt'), path.join(root, LOG)); }
  ];
  for (const plant of variants) {
    const root = makeRepo({ 'README.md': 'Old wording.\n' });
    let planted = true;
    try { plant(root); } catch { planted = false; } // a platform that cannot make links has no such attack
    fs.writeFileSync(path.join(root, 'README.md'), 'New wording.\n');
    assertPass(await check(root, 'README.md'), ['README.md']);
    assert.equal(fs.readFileSync(victim, 'utf8'), 'precious\n');
    assert.deepEqual(fs.readdirSync(outside).sort(), ['victim.txt']);
    if (!planted) assert.equal(logLines(root).length, 1);
  }
});

test('a log folder that cannot be written changes no answer', async () => {
  const root = makeRepo({ 'README.md': 'Old wording.\n' });
  const ctoc = path.join(root, '.ctoc');
  fs.mkdirSync(ctoc);
  fs.chmodSync(ctoc, 0o555);
  fs.writeFileSync(path.join(root, 'README.md'), 'New wording.\n');
  let res;
  try {
    res = await check(root, 'README.md');
  } finally {
    fs.chmodSync(ctoc, 0o755);
  }
  assertPass(res, ['README.md']);
  // Permissions bind only a non-administrator account on a system that enforces them.
  const enforced = process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0;
  if (enforced) assert.equal(fs.existsSync(path.join(ctoc, 'logs')), false);
});
