'use strict';

// The classifier corpus: 25 edit shapes that qualify as a hotfix and 61 traps that must
// not, plus one mode change, each judged through the menu router's first call (rules 1
// to 7; no test runs) against ONE committed temporary repository with no test command.
// A qualifying shape ends at `verdict: 'checking'`: rules 1 to 7 held.
// Plan: plans/todo/ctoc-checks-that-a-hotfix-is-really-small-and-safe-s1-the-hotfix-check.md,
// Step 8, the corpus.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { route } = require('../src/lib/menu-screens');

const refusal = (clause) => `I did not treat this as a hotfix because ${clause}; `
  + 'it goes through a normal plan, and your edits stay in place, not committed.';
const unrecognised = (f) => `I do not recognise ${f} as wording or a colour`;
const riskMarker = (f) => `the wording in ${f} contains a number, a price, a web address or an e-mail address`;

const page = (inner) => `<!doctype html>\n<html>\n<body>\n${inner}\n</body>\n</html>\n`;
const lines = (...l) => l.join('\n') + '\n';

// Every base file of the repository, keyed by path.
const BASE = {
  // qualify
  'src/pages/home.html': page('<button>Save</button>'),
  'src/pages/welcome.html': page('<p>Welcome back!</p>'),
  'site/about.htm': page('<h2>About us</h2>'),
  'src/components/Greeting.jsx': lines('export function Greeting() {', '  return (', '    <h1>Hello there</h1>', '  );', '}'),
  'src/components/CancelButton.tsx': lines('export const CancelButton = () => (', '  <span className="x">Cancel</span>', ');'),
  'src/components/NameField.vue': lines('<template>', '  <label>Name</label>', '</template>'),
  'src/components/Loading.svelte': lines('<p>Loading</p>'),
  'src/pages/nav.html': page('<a class="nav" href="/home">Home</a>'),
  'locales/en.json': lines('{', '  "save": "Save {count} items",', '  "cancel": "Cancel"', '}'),
  'i18n/fr.yaml': lines('save: Enregistrer', 'cancel: Annuler'),
  'translations/de.po': lines('msgid "Save"', 'msgstr "Speichern"'),
  'lang/app.properties': lines('button.save=Save', 'button.cancel=Cancel'),
  'messages/en.yml': lines('greeting: "Hello, {{name}}"'),
  'src/styles/button.css': lines('.save { background-color: #0a58ca; }'),
  'src/styles/theme.scss': lines('$brand: #0a58ca;'),
  'src/styles/accent.less': lines('@accent: red;'),
  'src/styles/link.css': lines('a {', '  color: hsl(210, 50%, 40%);', '}'),
  'src/styles/vars.css': lines(':root {', '  --brand: #ffffff;', '}'),
  'src/styles/custom.css': lines(':root {', '  --accent: red;', '}'),
  'README.md': lines('# Fixture', '', 'This project shows the old wording.'),
  'docs/guide.rst': lines('Guide', '=====', '', 'Read this guide first.'),
  'notes/todo.txt': lines('Write the welcome page.'),
  'docs/intro.md': '# Intro\r\n\r\nThe intro says hello.\r\n',
  'docs/long.md': lines(...Array.from({ length: 12 }, (_, i) => `Old long line ${String.fromCharCode(97 + i)}.`)),
  // traps
  'src/cart.js': lines('function ok(items) {', '  if (items.length > 0) return true;', '  return false;', '}'),
  'src/server.js': lines("app.post('/order', (req, res) => {", '  res.send("Order saved");', '});'),
  'config/app.yaml': lines('timeout_seconds: 30'),
  'package.json': lines('{', '  "name": "corpus",', '  "version": "1.0.0"', '}'),
  'deps/requirements.txt': lines('requests==2.31.0'),
  'deps/constraints.txt': lines('urllib3==2.0.0'),
  'deps/requirements/base.txt': lines('flask==3.0.0'),
  'app/runtime.txt': lines('python old'),
  'native/CMakeLists.txt': lines('project(old)'),
  'db/migrations/001_init.sql': lines('CREATE TABLE items (name TEXT);'),
  '.github/workflows/ci.yml': lines('name: build', 'on: push'),
  'Dockerfile': lines('FROM node:20'),
  'src/strings.json': lines('{', '  "save": "Save"', '}'),
  'docs/diagram.svg': lines('<svg>', '<text x="1">Save</text>', '</svg>'),
  'CLAUDE.md': lines('# Rules', '', 'Follow the old rules.'),
  'agents/helper.md': lines('# Helper', '', 'The helper does old things.'),
  'plans/notes.md': lines('# Notes', '', 'Old plan notes.'),
  'src/commands/help.md': lines('# Help', '', 'Old help text.'),
  '.claude/theme.css': lines('.save { color: #0a58ca; }'),
  'agents/card.html': page('<p>Hello</p>'),
  'src/pages/links.html': page('<a href="/a">Home</a>'),
  'src/pages/offer.html': page('<p>Only 9 euro a month</p>'),
  'src/pages/visit.html': page('<p>Visit example.org</p>'),
  'src/pages/days.html': page('<p>Only seven days</p>'),
  'src/pages/site.html': page('<p>Visit our site</p>'),
  'src/pages/contact.html': page('<p>Write to us</p>'),
  'src/pages/script-block.html': page(lines('<script>', 'const s = "', '<b>Save</b>', '";', '</script>').trimEnd()),
  'src/pages/style-block.html': page(lines('<style>', '/*', '<b>Save</b>', '*/', '</style>').trimEnd()),
  'src/pages/textarea-block.html': page(lines('<textarea>', '<b>Save</b>', '</textarea>').trimEnd()),
  'src/components/Hello.jsx': lines('export const Hello = ({ name }) => (', '  <p>Hello {name}</p>', ');'),
  'src/components/Msg.vue': lines('<template>', '  <p>{{ msg }} now</p>', '</template>'),
  'src/pages/multiline.html': page(lines('<p>', '  Save your work', '</p>').trimEnd()),
  'src/pages/crossing.html': page('<b>Save</b> now'),
  'src/pages/rules.html': page('<p>Terms &amp; rules</p>'),
  'locales/keys.json': lines('{', '  "save": "Save",', '  "cancel": "Cancel"', '}'),
  'locales/count.json': lines('{', '  "save": "Save {count} items",', '  "cancel": "Cancel"', '}'),
  'locales/promo.json': lines('{', '  "promo": "Save now",', '  "cancel": "Cancel"', '}'),
  'src/styles/selector.css': lines('.red {', '  color: red;', '}'),
  'src/styles/property.css': lines('.box {', '  color: red;', '}'),
  'src/styles/display.css': lines('.box {', '  display: none;', '}'),
  'src/styles/hexsel.css': lines('#bad:hover {', '  color: red;', '}'),
  'src/components/Pick.tsx': lines('export function pick(a: number, b: number, x: number, y: number, z: number) {', '  return a > b ? x : y < z;', '}'),
  'src/components/Compare.tsx': lines('export function within(a: number, b: number, limit: number, c: number) {', '  const ok = a<b>limit<c;', '  return ok;', '}'),
  'src/components/Types.tsx': lines('type Box<T> = { v: T };', 'type Bag<T> = { w: T };', 'type U = Box<A>|Box<B>;'),
  'src/components/Button.spec.tsx': lines("it('renders', () => { render(<Button>Save</Button>); });"),
  'src/components/Generic.tsx': lines('import { useState } from "react";', 'export function useLabel() {', '  return useState<string>("a");', '}'),
  'tests/home.test.js': lines("const test = require('node:test');", "test('shows Save', () => {});"),
  'src/__tests__/cart.spec.js': lines("it('adds', () => {});"),
  'src/pages/login.html': page('<button>Sign in</button>'),
  'billing/index.html': page('<p>Your statement</p>'),
  'docs/privacy.md': lines('# Data', '', 'We keep little.'),
  'docs/old.md': lines('# Old', '', 'An old page.'),
  'docs/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]),
  'notes/a.md': lines('Alpha old.'),
  'notes/b.md': lines('Bravo old.'),
  'notes/c.md': lines('Charlie old.'),
  'notes/d.md': lines('Delta old.'),
  '.gitattributes': lines('docs/big.md -diff'),
  'docs/big.md': lines(...Array.from({ length: 13 }, (_, i) => `Big old line ${String.fromCharCode(97 + i)}.`)),
  'public/robots.txt': lines('User-agent: *', 'Allow: /'),
  'src/styles/mask.css': lines('.fade {', '  mask: url(#fade);', '}'),
  'src/styles/motion.css': lines('.pulse {', '  animation: red 2s;', '}'),
  'docs/limit.md': lines(...Array.from({ length: 11 }, (_, i) => `Limit old line ${String.fromCharCode(97 + i)}.`))
};

const QUALIFY = [
  ['src/pages/home.html', page('<button>Store</button>')],
  ['src/pages/welcome.html', page('<p>Welcome home!</p>')],
  ['site/about.htm', page('<h2>Who we are</h2>')],
  ['src/components/Greeting.jsx', BASE['src/components/Greeting.jsx'].replace('Hello there', 'Hello friend')],
  ['src/components/CancelButton.tsx', BASE['src/components/CancelButton.tsx'].replace('>Cancel<', '>Close<')],
  ['src/components/NameField.vue', BASE['src/components/NameField.vue'].replace('>Name<', '>Full name<')],
  ['src/components/Loading.svelte', lines('<p>Please wait</p>')],
  ['src/pages/nav.html', page('<a class="nav" href="/home">Start</a>')],
  ['locales/en.json', BASE['locales/en.json'].replace('"Save {count} items"', '"Store {count} items"')],
  ['i18n/fr.yaml', lines('save: Sauvegarder', 'cancel: Annuler')],
  ['translations/de.po', lines('msgid "Save"', 'msgstr "Sichern"')],
  ['lang/app.properties', lines('button.save=Store', 'button.cancel=Cancel')],
  ['messages/en.yml', lines('greeting: "Hi, {{name}}"')],
  ['src/styles/button.css', lines('.save { background-color: #0b5ed7; }')],
  ['src/styles/theme.scss', lines('$brand: rgb(11, 94, 215);')],
  ['src/styles/accent.less', lines('@accent: tomato;')],
  ['src/styles/link.css', lines('a {', '  color: hsla(210, 50%, 40%, 0.9);', '}')],
  ['src/styles/vars.css', lines(':root {', '  --brand: #fafafa;', '}')],
  // A named colour inside a custom property.
  ['src/styles/custom.css', lines(':root {', '  --accent: blue;', '}')],
  ['README.md', lines('# Fixture', '', 'This project shows the new wording.')],
  ['docs/guide.rst', lines('Guide', '=====', '', 'Read this handbook first.')],
  ['notes/todo.txt', lines('Write the start page.')],
  ['docs/intro.md', '# Intro\r\n\r\nThe intro says welcome.\r\n'],
  // 20 changed lines in one file: ten lines reworded, the size limit exactly.
  ['docs/long.md', BASE['docs/long.md'].replace(/Old long line ([a-j])\./g, 'New long line $1.')],
  // 6 changed lines in 3 files: the file limit exactly.
  [{ 'notes/a.md': lines('Alpha new.'), 'notes/b.md': lines('Bravo new.'), 'notes/c.md': lines('Charlie new.') }]
];

// [files to write {path: content}, the files named, the expected clause]
const TRAPS = [
  [{ 'src/cart.js': BASE['src/cart.js'].replace('> 0', '>= 0') }, null, 'it changes program logic in src/cart.js, and only wording and colours qualify'],
  [{ 'src/server.js': BASE['src/server.js'].replace('Order saved', 'Order stored') }, null, 'it changes text inside program code in src/server.js, and no check can tell whether people read that text or the program depends on it'],
  [{ 'config/app.yaml': lines('timeout_seconds: 60') }, null, 'it changes a setting in config/app.yaml, and settings changes are a common cause of outages'],
  [{ 'package.json': BASE['package.json'].replace('1.0.0', '1.0.1') }, null, 'it changes the dependencies in package.json'],
  [{ 'deps/requirements.txt': lines('requests==2.32.0') }, null, 'it changes the dependencies in deps/requirements.txt'],
  [{ 'deps/constraints.txt': lines('urllib3==2.0.1') }, null, 'it changes the dependencies in deps/constraints.txt'],
  [{ 'deps/requirements/base.txt': lines('flask==3.0.1') }, null, 'it changes the dependencies in deps/requirements/base.txt'],
  [{ 'app/runtime.txt': lines('python new') }, null, 'it changes how the project is built or shipped in app/runtime.txt'],
  [{ 'native/CMakeLists.txt': lines('project(new)') }, null, 'it changes how the project is built or shipped in native/CMakeLists.txt'],
  [{ 'db/migrations/001_init.sql': lines('CREATE TABLE items (title TEXT);') }, null, 'it changes stored data in db/migrations/001_init.sql'],
  [{ '.github/workflows/ci.yml': lines('name: build and test', 'on: push') }, null, 'it changes how the project is built or shipped in .github/workflows/ci.yml'],
  [{ 'Dockerfile': lines('FROM node:22') }, null, 'it changes how the project is built or shipped in Dockerfile'],
  [{ 'src/strings.json': lines('{', '  "save": "Store"', '}') }, null, 'it changes a setting in src/strings.json, and settings changes are a common cause of outages'],
  [{ 'docs/diagram.svg': lines('<svg>', '<text x="1">Store</text>', '</svg>') }, null, unrecognised('docs/diagram.svg')],
  [{ 'CLAUDE.md': lines('# Rules', '', 'Follow the new rules.') }, null, unrecognised('CLAUDE.md')],
  [{ 'agents/helper.md': lines('# Helper', '', 'The helper does new things.') }, null, unrecognised('agents/helper.md')],
  [{ 'plans/notes.md': lines('# Notes', '', 'New plan notes.') }, null, unrecognised('plans/notes.md')],
  [{ 'src/commands/help.md': lines('# Help', '', 'New help text.') }, null, unrecognised('src/commands/help.md')],
  // The places that govern the work never qualify, whatever the kind.
  [{ '.claude/theme.css': lines('.save { color: #0b5ed7; }') }, null, unrecognised('.claude/theme.css')],
  [{ 'agents/card.html': page('<p>Hi</p>') }, null, unrecognised('agents/card.html')],
  [{ 'src/pages/links.html': page('<a href="/b">Home</a>') }, null, unrecognised('src/pages/links.html')],
  [{ 'src/pages/offer.html': page('<p>Only 7 euro a month</p>') }, null, riskMarker('src/pages/offer.html')],
  [{ 'src/pages/days.html': page('<p>Only \uff17 days</p>') }, null, riskMarker('src/pages/days.html')],
  [{ 'src/pages/visit.html': page('<p>Visit www.example.org</p>') }, null, riskMarker('src/pages/visit.html')],
  [{ 'src/pages/site.html': page('<p>Visit WWW.EXAMPLE.ORG</p>') }, null, riskMarker('src/pages/site.html')],
  [{ 'src/pages/contact.html': page('<p>Write to help@example.org</p>') }, null, riskMarker('src/pages/contact.html')],
  [{ 'src/pages/script-block.html': BASE['src/pages/script-block.html'].replace('<b>Save</b>', '<b>Store</b>') }, null, unrecognised('src/pages/script-block.html')],
  [{ 'src/pages/style-block.html': BASE['src/pages/style-block.html'].replace('<b>Save</b>', '<b>Store</b>') }, null, unrecognised('src/pages/style-block.html')],
  [{ 'src/pages/textarea-block.html': BASE['src/pages/textarea-block.html'].replace('<b>Save</b>', '<b>Store</b>') }, null, unrecognised('src/pages/textarea-block.html')],
  [{ 'src/components/Hello.jsx': BASE['src/components/Hello.jsx'].replace('Hello {name}', 'Hi {name}') }, null, unrecognised('src/components/Hello.jsx')],
  [{ 'src/components/Msg.vue': BASE['src/components/Msg.vue'].replace('now', 'today') }, null, unrecognised('src/components/Msg.vue')],
  [{ 'src/pages/multiline.html': BASE['src/pages/multiline.html'].replace('Save your work', 'Store your work') }, null, unrecognised('src/pages/multiline.html')],
  [{ 'src/pages/crossing.html': page('<b>Save now</b>') }, null, unrecognised('src/pages/crossing.html')],
  [{ 'src/pages/rules.html': page('<p>Terms &amp; conditions</p>') }, null, unrecognised('src/pages/rules.html')],
  [{ 'locales/keys.json': BASE['locales/keys.json'].replace('"save":', '"store":') }, null, unrecognised('locales/keys.json')],
  [{ 'locales/count.json': BASE['locales/count.json'].replace('{count}', '{total}') }, null, unrecognised('locales/count.json')],
  [{ 'locales/promo.json': BASE['locales/promo.json'].replace('"Save now"', '"Save 5 euro now"') }, null, riskMarker('locales/promo.json')],
  [{ 'src/styles/selector.css': BASE['src/styles/selector.css'].replace('.red {', '.blue {') }, null, unrecognised('src/styles/selector.css')],
  [{ 'src/styles/property.css': BASE['src/styles/property.css'].replace('color: red;', 'background: red;') }, null, unrecognised('src/styles/property.css')],
  [{ 'src/styles/display.css': BASE['src/styles/display.css'].replace('none', 'block') }, null, unrecognised('src/styles/display.css')],
  [{ 'src/styles/hexsel.css': BASE['src/styles/hexsel.css'].replace('#bad:hover', '#fed:hover') }, null, unrecognised('src/styles/hexsel.css')],
  // Neither wording nor colour, found by the security check of 2026-10-08: a crawler's
  // settings, a mask's fragment address, and an animation whose name is a colour word.
  [{ 'public/robots.txt': lines('User-agent: *', 'Disallow: /') }, null, 'it changes a setting in public/robots.txt, and settings changes are a common cause of outages'],
  [{ 'src/styles/mask.css': BASE['src/styles/mask.css'].replace('#fade', '#face') }, null, unrecognised('src/styles/mask.css')],
  [{ 'src/styles/motion.css': BASE['src/styles/motion.css'].replace('red 2s', 'blue 2s') }, null, unrecognised('src/styles/motion.css')],
  [{ 'src/components/Pick.tsx': BASE['src/components/Pick.tsx'].replace('y < z;', 'y < w;') }, null, unrecognised('src/components/Pick.tsx')],
  [{ 'src/components/Generic.tsx': BASE['src/components/Generic.tsx'].replace('("a")', '("b")') }, null, unrecognised('src/components/Generic.tsx')],
  // Only the closing-element rule catches these two: the `<` after the text must close the
  // element whose opening tag ends at the `>` before it.
  [{ 'src/components/Compare.tsx': BASE['src/components/Compare.tsx'].replace('a<b>limit<c', 'a<b>max<c') }, null, unrecognised('src/components/Compare.tsx')],
  [{ 'src/components/Types.tsx': BASE['src/components/Types.tsx'].replace('Box<A>|Box<B>', 'Box<A>|Bag<B>') }, null, unrecognised('src/components/Types.tsx')],
  [{ 'tests/home.test.js': BASE['tests/home.test.js'].replace('shows Save', 'shows Store'), 'src/pages/home.html': page('<button>Store</button>') }, null, 'it changes a test (tests/home.test.js)'],
  [{ 'src/__tests__/cart.spec.js': lines("it('adds items', () => {});") }, null, 'it changes a test (src/__tests__/cart.spec.js)'],
  [{ 'src/components/Button.spec.tsx': lines("it('renders', () => { render(<Button>Store</Button>); });") }, null, 'it changes a test (src/components/Button.spec.tsx)'],
  [{ 'src/pages/login.html': page('<button>Log in</button>') }, null, 'src/pages/login.html sits in an area named login, and such areas are never a hotfix'],
  [{ 'billing/index.html': page('<p>Your summary</p>') }, null, 'billing/index.html sits in an area named billing, and such areas are never a hotfix'],
  [{ 'docs/privacy.md': lines('# Data', '', 'We keep very little.') }, null, 'docs/privacy.md sits in an area named privacy, and such areas are never a hotfix'],
  [{ 'src/pages/about.html': page('<p>About</p>') }, null, 'it adds, removes or renames src/pages/about.html'],
  [{ 'docs/old.md': null }, ['docs/old.md'], 'it adds, removes or renames docs/old.md'],
  [{ 'docs/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x03]) }, null, 'I could not read the change (docs/logo.png is not text)'],
  ['symlink', ['link'], unrecognised('link')],
  // A document whose attributes say `-diff` still counts its real lines (13 reworded).
  [{ 'docs/big.md': BASE['docs/big.md'].replace(/Big old line/g, 'Big new line') }, null, 'it changes 26 lines in 1 file and a hotfix is at most 20 lines in at most 3 files'],
  // 21 changed lines in one file: 11 removed, 10 added.
  [{ 'docs/limit.md': lines(...Array.from({ length: 10 }, (_, i) => `Limit new line ${String.fromCharCode(97 + i)}.`)) }, null, 'it changes 21 lines in 1 file and a hotfix is at most 20 lines in at most 3 files'],
  [{ 'notes/a.md': lines('Alpha new.'), 'notes/b.md': lines('Bravo new.'), 'notes/c.md': lines('Charlie new.'), 'notes/d.md': lines('Delta new.') }, null, 'it changes 8 lines in 4 files and a hotfix is at most 20 lines in at most 3 files']
];

assert.equal(QUALIFY.length, 25, 'the corpus holds 25 shapes that qualify');
assert.equal(TRAPS.length, 61, 'the corpus holds 61 traps');

let root;


function git(args) {
  const r = spawnSync('git', ['-c', 'user.name=Hotfix Test', '-c', 'user.email=hotfix@test.invalid',
    '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function abs(rel) { return path.join(root, ...rel.split('/')); }

function write(rel, content) {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), content);
}

function placeLink() {
  try { fs.rmSync(abs('link'), { force: true }); } catch { /* absent */ }
  try {
    fs.symlinkSync('link-target', abs('link'));

  } catch {
    // Where links cannot be made, git keeps the link as a plain file holding its target.
    fs.writeFileSync(abs('link'), 'link-target');

  }
}

function dirtyOutsideCtoc() {
  return spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root })
    .stdout.toString('utf8').split('\0').filter((e) => e && !e.slice(3).startsWith('.ctoc/'));
}

test.before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hotfix-corpus-'));
  git(['init', '-q']);
  for (const [rel, content] of Object.entries(BASE)) write(rel, content);
  git(['add', '-A']);
  const blob = spawnSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: 'link-target' }).stdout.toString().trim();
  git(['update-index', '--add', '--cacheinfo', `120000,${blob},link`]);
  git(['commit', '-q', '-m', 'base']);
  placeLink();
  assert.deepEqual(dirtyOutsideCtoc(), [], 'the base repository is clean');
});

test.after(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

/** The first call: rules 1 to 7, no test run. */
async function judge(files) {
  return route(['hotfix', 'check', ...files], root);
}

function assertChecking(res, files) {
  assert.equal(res.verdict, 'checking', JSON.stringify(res));
  assert.equal(res.text, 'Checking the hotfix against the existing tests.');
  assert.equal(res.next, `hotfix check --run-tests -- ${files.map((f) => `'${f}'`).join(' ')}`);
}

for (const [shape, content] of QUALIFY) {
  const writes = typeof shape === 'string' ? { [shape]: content } : shape;
  const files = Object.keys(writes);
  test(`qualifies: ${files.join(' + ')}`, async () => {
    for (const [rel, c] of Object.entries(writes)) write(rel, c);
    try {
      assertChecking(await judge(files), files);
    } finally {
      for (const rel of files) write(rel, BASE[rel]);
    }
    assert.deepEqual(dirtyOutsideCtoc(), []);
  });
}

for (const [writes, named, clause] of TRAPS) {
  const label = writes === 'symlink' ? 'link (a symbolic link replaced by a file)' : Object.keys(writes).join(' + ');
  test(`trap: ${label}`, async () => {
    let files;
    if (writes === 'symlink') {
      fs.rmSync(abs('link'), { force: true });
      fs.writeFileSync(abs('link'), 'a plain file now\n');
      files = named;
    } else {
      for (const [rel, content] of Object.entries(writes)) {
        if (content === null) fs.rmSync(abs(rel));
        else write(rel, content);
      }
      files = named || Object.keys(writes);
    }
    try {
      const res = await judge(files);
      assert.equal(res.verdict, 'refused', JSON.stringify(res));
      assert.equal(res.text, refusal(clause));
    } finally {
      if (writes === 'symlink') placeLink();
      else {
        for (const rel of Object.keys(writes)) {
          if (BASE[rel] === undefined) fs.rmSync(abs(rel));
          else write(rel, BASE[rel]);
        }
      }
    }
    assert.deepEqual(dirtyOutsideCtoc(), []);
  });
}

test('mode change: an executable bit on README.md is not wording (where git tracks the bit)', async () => {
  git(['update-index', '--chmod=+x', 'README.md']);
  git(['commit', '-q', '-m', 'make README executable']);
  // The working copy keeps its old mode, so the change against the last commit is a
  // mode change, plus one wording edit.
  write('README.md', lines('# Fixture', '', 'This project shows the new wording.'));
  const res = await judge(['README.md']);
  const fileModeTracked = spawnSync('git', ['config', '--get', 'core.filemode'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== 'false';
  if (process.platform !== 'win32' && fileModeTracked) {
    assert.equal(res.text, refusal(unrecognised('README.md')));
  } else {
    assertChecking(res, ['README.md']);
  }
});
