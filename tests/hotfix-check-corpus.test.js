'use strict';

// The classifier corpus: edit shapes that qualify as a hotfix and traps that must not (44 of
// them the kept cases of the formats the owner's decision of 2026-10-09 removed), plus one
// mode change, each judged through the menu router's first call (rules 1 to 7; no test runs)
// against ONE committed temporary repository with no test command. The counts are asserted
// below the tables. A qualifying shape ends at `verdict: 'checking'`: rules 1 to 7 held.
//
// THE TENTH ROUND (the session coordinator's decision of 2026-10-10): Markdown and plain-text
// prose, catalogue files and custom properties are taken out of this piece. Their qualifying
// shapes and the traps that asserted what their readers said are deleted (the reasons, group
// by group, are in the plan's record, "Fix round 10"); traps of such files that assert a
// dependency list, a build file, a setting or a governing place are kept, and
// tests/hotfix-check.test.js holds one table of every removed extension.
// Plan: plans/todo/ctoc-checks-that-a-hotfix-is-really-small-and-safe-s1-the-hotfix-check.md,
// Step 8, the corpus.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { route } = require('../src/lib/menu-screens');
const { ruleRefusal } = require('../src/lib/hotfix-check');

const refusal = (clause) => `I did not treat this as a hotfix because ${clause}; `
  + 'it goes through a normal plan, and your edits stay in place, not committed.';
const unrecognised = (f) => `I do not recognise ${f} as wording or a colour`;
const setting = (f) => `it changes a setting in ${f}, and settings changes are a common cause of outages`;
// The functional plan's clause (amended 2026-10-09) for a file whose format the check reads
// but whose change it cannot vouch for.
const inexact = (f) => `it changes ${f} in a way the check cannot read exactly, and only what it can read exactly qualifies`;

const page = (inner) => `<!doctype html>\n<html>\n<body>\n${inner}\n</body>\n</html>\n`;
const lines = (...l) => l.join('\n') + '\n';

// Every base file of the repository, keyed by path.
const BASE = {
  // qualify
  'src/components/Greeting.jsx': lines('export function Greeting() {', '  return (', '    <h1>Hello there</h1>', '  );', '}'),
  'src/components/CancelButton.tsx': lines('export const CancelButton = () => (', '  <span className="x">Cancel</span>', ');'),
  'src/components/NameField.vue': lines('<template>', '  <label>Name</label>', '</template>'),
  'src/components/Loading.svelte': lines('<p>Loading</p>'),
  'translations/de.po': lines('msgid "Save"', 'msgstr "Speichern"'),
  'src/styles/button.css': lines('.save { background-color: #0a58ca; }'),
  'src/styles/theme.scss': lines('$brand: #0a58ca;'),
  'src/styles/accent.less': lines('@accent: red;'),
  // The review of 2026-10-09: the corpus itself holds an indented Sass file, a gettext file
  // under `locales/` and a `<math>` trap.
  'src/styles/indented.sass': lines('.save', '  color: #0a58ca'),
  'locales/de.po': lines('msgid "Save"', 'msgstr "Speichern"'),
  'src/styles/link.css': lines('a {', '  color: hsl(210, 50%, 40%);', '}'),
  'src/styles/vars.css': lines(':root {', '  --brand: #ffffff;', '}'),
  'src/styles/custom.css': lines(':root {', '  --accent: red;', '}'),
  'README.md': lines('# Fixture', '', 'This project shows the old wording.'),
  'src/pages/home.html': page('<button>Save</button>'),
  'src/styles/intro.css': 'h1 { color: red; }\r\n\r\np { margin: 0; }\r\n',
  'src/styles/long.css': lines(...Array.from({ length: 12 }, (_, i) => `.long-${String.fromCharCode(97 + i)} { color: red; }`)),
  'site/a.css': lines('a { color: red; }'),
  'site/b.css': lines('b { color: red; }'),
  'site/c.css': lines('i { color: red; }'),
  'site/d.css': lines('u { color: red; }'),
  'src/styles/big.css': lines(...Array.from({ length: 13 }, (_, i) => `.big-${String.fromCharCode(97 + i)} { color: red; }`)),
  'src/styles/limit.css': lines(...Array.from({ length: 11 }, (_, i) => `.limit-${String.fromCharCode(97 + i)} { color: red; }`)),
  'src/hooks/notes.css': lines('a { color: red; }'),
  'src/styles/Author.css': lines('a { color: red; }'),
  'site/privacy/site.css': lines('a { color: red; }'),
  'billing/site.css': lines('a { color: red; }'),
  'src/payments/site.css': lines('a { color: red; }'),
  'agents/card.css': lines('a { color: red; }'),
  'docs/passwords.css': lines('a { color: red; }'),
  'docs/id_rsa.css': lines('a { color: red; }'),
  'docs/tokens/site.css': lines('a { color: red; }'),
  'src/styles/AuthPanel.css': lines('a { color: red; }'),
  'src/styles/paymentForm.css': lines('a { color: red; }'),
  'docs/guide.rst': lines('Guide', '=====', '', 'Read this guide first.'),
  'notes/todo.txt': lines('Write the welcome page.'),
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
  'src/components/Hello.jsx': lines('export const Hello = ({ name }) => (', '  <p>Hello {name}</p>', ');'),
  'src/components/Msg.vue': lines('<template>', '  <p>{{ msg }} now</p>', '</template>'),
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
  'docs/old.md': lines('# Old', '', 'An old page.'),
  'docs/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]),
  '.gitattributes': lines('src/styles/big.css -diff'),
  'public/robots.txt': lines('User-agent: *', 'Allow: /'),
  'src/styles/mask.css': lines('.fade {', '  mask: url(#fade);', '}'),
  'src/styles/motion.css': lines('.pulse {', '  animation: red 2s;', '}'),
  // The security check's second round (2026-10-08).
  'src/components/Limit.vue': lines('<template>', '  <button :disabled="count>max || count<min">Go</button>', '</template>'),
  'deps/dev-requirements.txt': lines('pytest==8.0.0'),
  'deps/test-requirements.txt': lines('coverage==7.0.0'),
  'app/packages.txt': lines('libpq-dev'),
  'app/version.txt': lines('1.0.0'),
  'AGENTS.md': lines('# Agents', '', 'Old agent rules.'),
  'GEMINI.md': lines('# Gemini', '', 'Old model rules.'),
  '.github/copilot-instructions.md': lines('# Copilot', '', 'Old assistant rules.'),
  '.cursor/rules/style.md': lines('# Style', '', 'Old style rules.'),
  '.changeset/brave-cats.md': lines('---', '"corpus": patch', '---', '', 'Old change note.'),
  'src/styles/nav.css': lines('nav:hover #add {display:none}'),
  // The security check's third round and the re-review (2026-10-09): whole-file scanners.
  '.github/workflows/README.md': lines('# Workflows', '', 'The old build notes.'),
  'docs/raw.rst': lines('Title', '=====', '', '.. raw:: html', '', '   <b>one</b>'),
  'CLAUDE.local.md': lines('# Local', '', 'Old local rules.'),
  '.windsurf/rules/style.md': lines('# Style', '', 'Old style rules.'),
  '.clinerules/style.md': lines('# Style', '', 'Old style rules.'),
  '.kiro/steering/style.md': lines('# Style', '', 'Old style rules.'),
  'CONVENTIONS.md': lines('# Conventions', '', 'Old conventions.'),
  'src/styles/nextline.css': lines('nav:hover #add', '{display:none}'),
  'src/styles/commented.css': lines('#add /* ; */ {display:none}'),
  'docs/code.rst': lines('Setup', '=====', '', '.. code-block:: sh', '', '   pip install requests'),
  'docs/inc.rst': lines('Guide', '=====', '', '.. include:: one.rst'),
  'src/components/Clicker.vue': lines('<template>', '  <button @click="go(\'one\')">Go</button>', '</template>'),
  'src/components/Bind.vue': lines('<template>', '  <p v-bind:title="one">Hi</p>', '</template>'),
  'src/components/Nested.jsx': lines('export const N = () => (', '  <button onClick={() => { if (a > b) { go(\'one\'); } }}>Go</button>', ');'),
  'tokens.txt': lines('Old note.'),
  // The commit security review (2026-10-09): instruction files by class, reStructuredText roles.
  'docs/sub/AGENTS.md': lines('# Agents', '', 'Old rules.'),
  'pkg/CLAUDE.md': lines('# Rules', '', 'Old rules.'),
  '.foo/notes.md': lines('# Notes', '', 'Old notes.'),
  '.github/instructions/x.instructions.md': lines('Old rules.'),
  'prompts/review.prompt.md': lines('Old prompt.'),
  '.cursor/rules/a.mdc': lines('Old rules.'),
  'rules.mdc': lines('Old rules.'),
  'docs/span-def.rst': lines('Title', '=====', '', 'Old words.'),
  'docs/raw-span.rst': lines('Text :raw-html:`<b>x</b>` here.'),
  'docs/span-text.rst': lines('Press :kbd:`Ctrl` now.'),
  'docs/span-after.rst': lines('Press `Ctrl`:kbd: now.'),
  'docs/shortcuts.rst': lines('Press :kbd:`Ctrl` to save the old file.'),
  // The fourth round (2026-10-09): the security attack and the code review.
  'src/components/RunSql.jsx': lines('export const Q = () => <RunSql>SELECT name FROM users</RunSql>;'),
  'src/components/Charge.vue': lines('<template>', '  <MyAction>charge</MyAction>', '</template>'),
  'src/components/SlotPass.vue': lines('<template>', '  <MyAction>', '    <template #label>charge</template>', '  </MyAction>', '</template>'),
  'src/components/Pay.svelte': lines('<Charge>charge</Charge>'),
  'src/styles/flags.css': lines(':root {', '  --enabled: green;', '  --mode: red;', '}'),
  'docs/literal.rst': lines('Install', '=======', '', 'Run this::', '', '   pip install requests'),
  'docs/expanded.rst': lines('Install', '=======', '', 'Run this:', '', '::', '', '   pip install requests'),
  'docs/doctest.rst': lines('Example', '=======', '', '>>> print("old")', 'old'),
  'notes/doctest.txt': lines('Example:', '', '>>> print("old")', 'old'),
  'docs/ifconfig.rst': lines('.. ifconfig:: release == "old"', '', '   Old words.'),
  'docs/doctest-dir.rst': lines('.. doctest::', '', '   >>> print("old")', '   old'),
  'docs/image.rst': lines('.. image:: one.png', '   :alt: The logo'),
  'docs/toctree.rst': lines('.. toctree::', '   :maxdepth: 2', '', '   intro', '   usage'),
  'docs/automodule.rst': lines('.. automodule:: one', '   :members:'),
  'docs/note-class.rst': lines('.. note::', '   :class: one', '', '   Old words.'),
  'src/components/Cond.vue': lines('<template>', '  <div>', '    <template v-if="a"><p>Save</p></template>', '    <template v-else>Cancel</template>', '  </div>', '</template>'),
  'src/styles/tokens.css': lines('.save {', '  color: #0a58ca;', '}'),
  'src/components/GenStr.tsx': lines('export const f = <T,>(x: T) => x;', 'export const s = "<b>Save</b>";'),
  // The fifth round (2026-10-09): the owner's decision and the fixes that still apply.
  'docs/page.mdx': lines('# Page', '', 'Old words.'),
  'src/styles/login.css': lines('a {', '  color: red;', '}'),
  'src/styles/payment.css': lines('a {', '  color: red;', '}'),
  'src/styles/color-mode.css': lines(':root {', '  --color-mode: dark;', '}'),
  'src/styles/two-tokens.css': lines(':root {', '  --brand-color: red;', '}'),
  'src/styles/var.css': lines(':root {', '  --color-a: var(--b);', '}'),
  'src/styles/color-brand.css': lines(':root {', '  --color-brand: #0b5ed7;', '}'),
  'src/styles/button-colour.css': lines(':root {', '  --button-colour: red;', '}'),
  // The sixth round (2026-10-09): the strict HTML subset, folded and camel-case paths, and the
  // functional plan's sentence for a change the check cannot read exactly.
  'src/styles/border.css': lines('.save { border: 1px solid #0a58ca; }'),
  // The eighth and ninth rounds: what is left of their base files.
  'deps.txt': lines('requests'),
  'templates/email/welcome.txt': lines('Hello {name}, welcome.'),
  'exclude.txt': lines('build', 'cache'),
  'cmake/options.txt': lines('option(FAST ON)'),
  'docs/brackets.md': lines('The old way (the short one) works.'),
  // Names that are dependencies, the build or settings, in catalogue folders.
  'packages/i18n/package.json': lines('{', '  "name": "i18n",', '  "description": "Old texts"', '}'),
  'locales/package.json': lines('{', '  "name": "locales",', '  "scripts": {', '    "test": "node run tests"', '  }', '}'),
  'messages/docker-compose.yml': lines('services:', '  web:', '    image: app'),
  'translations/pnpm-lock.yaml': lines('lockfileVersion: old'),
  'i18n/tsconfig.json': lines('{', '  "compilerOptions": {', '    "module": "commonjs"', '  }', '}'),
  'messages/application.properties': lines('spring.profiles.active=dev'),
  'i18n/routes.json': lines('{', '  "home": "Start"', '}'),
  'src/styles/endings.css': lines('a { color: red; }', 'b { margin: 0; }'),
  // Stylesheets (the ninth round): the brief's traps, and a custom property beside a colour property.
  'src/styles/brand.css': lines(':root {', '  --brand-color: #0a58ca;', '}', '.save {', '  color: var(--brand-color);', '  background-color: red;', '}'),
  'src/styles/shape.css': lines('.box {', '  --shape: (a; color: red; b);', '}'),
  'src/styles/escaped-url.css': lines('.box { background: \\75 rl(a;color:red;b) }'),
  'src/styles/animated.css': lines(':root { --brand-color: red; }', '.box { animation-name: var(--brand-color); }'),
  'src/styles/queried.css': lines(':root { --brand-color: red; }', '@container style(--brand-color: red) {', '  .box { margin: 0; }', '}'),
  'src/styles/stray-word.css': lines('.box { color: red; foo }')
};

const QUALIFY = [
  ['src/styles/button.css', lines('.save { background-color: #0b5ed7; }')],
  ['src/styles/link.css', lines('a {', '  color: hsla(210, 50%, 40%, 0.9);', '}')],
  ['src/styles/intro.css', 'h1 { color: blue; }\r\n\r\np { margin: 0; }\r\n'],
  // 20 changed lines in one file: ten rules recoloured, the size limit exactly.
  ['src/styles/long.css', BASE['src/styles/long.css'].replace(/\.long-([a-j]) \{ color: red/g, '.long-$1 { color: blue')],
  // 6 changed lines in 3 files: the file limit exactly.
  [{ 'site/a.css': lines('a { color: blue; }'), 'site/b.css': lines('b { color: blue; }'), 'site/c.css': lines('i { color: blue; }') }],
  // The fourth round (2026-10-09). A design-token stylesheet with a real colour property; a
  // React project's `src/hooks/` stylesheet (CTOC's enforcement list is CTOC's own, and this
  // repository is not CTOC).
  ['src/hooks/notes.css', BASE['src/hooks/notes.css'].replace('red', 'blue')],
  // `Author` is not `auth`.
  ['src/styles/Author.css', BASE['src/styles/Author.css'].replace('red', 'blue')],
  // A real colour property beside a custom property that stays as it is.
  ['src/styles/brand.css', BASE['src/styles/brand.css'].replace('background-color: red', 'background-color: blue')]
];

// [files to write {path: content}, the files named, the expected clause]
// Since the sixth round, traps that were "not recognised", "could not read (… cannot follow)"
// or a setting for one of the functional plan's five cases (text in a component or custom
// element, text in `<svg>` or `<math>`, HTML outside the strict subset, a heading whose
// anchor changes, a colour that is not a whole value) assert the plan's clause, `inexact`:
// the wording the functional plan now specifies, on a refusal that stays a refusal.
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
  [{ 'src/styles/selector.css': BASE['src/styles/selector.css'].replace('.red {', '.blue {') }, null, unrecognised('src/styles/selector.css')],
  [{ 'src/styles/property.css': BASE['src/styles/property.css'].replace('color: red;', 'background: red;') }, null, unrecognised('src/styles/property.css')],
  [{ 'src/styles/display.css': BASE['src/styles/display.css'].replace('none', 'block') }, null, unrecognised('src/styles/display.css')],
  [{ 'src/styles/hexsel.css': BASE['src/styles/hexsel.css'].replace('#bad:hover', '#fed:hover') }, null, unrecognised('src/styles/hexsel.css')],
  // Neither wording nor colour, found by the security check of 2026-10-08: a crawler's
  // settings, a mask's fragment address, and an animation whose name is a colour word.
  [{ 'public/robots.txt': lines('User-agent: *', 'Disallow: /') }, null, 'it changes a setting in public/robots.txt, and settings changes are a common cause of outages'],
  [{ 'src/styles/mask.css': BASE['src/styles/mask.css'].replace('#fade', '#face') }, null, unrecognised('src/styles/mask.css')],
  [{ 'src/styles/motion.css': BASE['src/styles/motion.css'].replace('red 2s', 'blue 2s') }, null, unrecognised('src/styles/motion.css')],
  [{ 'tests/home.test.js': BASE['tests/home.test.js'].replace('shows Save', 'shows Store'), 'src/pages/home.html': page('<button>Store</button>') }, null, 'it changes a test (tests/home.test.js)'],
  [{ 'src/__tests__/cart.spec.js': lines("it('adds items', () => {});") }, null, 'it changes a test (src/__tests__/cart.spec.js)'],
  [{ 'src/components/Button.spec.tsx': lines("it('renders', () => { render(<Button>Store</Button>); });") }, null, 'it changes a test (src/components/Button.spec.tsx)'],
  [{ 'docs/old.md': null }, ['docs/old.md'], 'it adds, removes or renames docs/old.md'],
  [{ 'docs/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x03]) }, null, 'I could not read the change (docs/logo.png is not text)'],
  ['symlink', ['link'], unrecognised('link')],
  // Dependency and build lists that end in `.txt`.
  [{ 'deps/dev-requirements.txt': lines('pytest==8.0.1') }, null, 'it changes the dependencies in deps/dev-requirements.txt'],
  [{ 'deps/test-requirements.txt': lines('coverage==7.0.1') }, null, 'it changes the dependencies in deps/test-requirements.txt'],
  [{ 'app/packages.txt': lines('libxml-dev') }, null, 'it changes how the project is built or shipped in app/packages.txt'],
  [{ 'app/version.txt': lines('1.0.1') }, null, 'it changes how the project is built or shipped in app/version.txt'],
  // The instruction files of other assistants (no Markdown file is a kind the check reads), and
  // a release note that ships with the build.
  [{ 'AGENTS.md': lines('# Agents', '', 'New agent rules.') }, null, unrecognised('AGENTS.md')],
  [{ 'GEMINI.md': lines('# Gemini', '', 'New model rules.') }, null, unrecognised('GEMINI.md')],
  [{ '.github/copilot-instructions.md': lines('# Copilot', '', 'New assistant rules.') }, null, 'it changes how the project is built or shipped in .github/copilot-instructions.md'],
  [{ '.cursor/rules/style.md': lines('# Style', '', 'New style rules.') }, null, unrecognised('.cursor/rules/style.md')],
  [{ '.changeset/brave-cats.md': BASE['.changeset/brave-cats.md'].replace('Old change note.', 'New change note.') }, null, 'it changes how the project is built or shipped in .changeset/brave-cats.md'],
  // A selector that reads like a hexadecimal colour.
  [{ 'src/styles/nav.css': lines('nav:hover #bad {display:none}') }, null, unrecognised('src/styles/nav.css')],
  // Other assistants' instruction files.
  [{ 'CLAUDE.local.md': BASE['CLAUDE.local.md'].replace('Old', 'New') }, null, unrecognised('CLAUDE.local.md')],
  [{ '.windsurf/rules/style.md': BASE['.windsurf/rules/style.md'].replace('Old', 'New') }, null, unrecognised('.windsurf/rules/style.md')],
  [{ '.clinerules/style.md': BASE['.clinerules/style.md'].replace('Old', 'New') }, null, unrecognised('.clinerules/style.md')],
  [{ '.kiro/steering/style.md': BASE['.kiro/steering/style.md'].replace('Old', 'New') }, null, unrecognised('.kiro/steering/style.md')],
  [{ 'CONVENTIONS.md': BASE['CONVENTIONS.md'].replace('Old', 'New') }, null, unrecognised('CONVENTIONS.md')],
  // A selector whose `{` is on the next line, or behind a comment.
  [{ 'src/styles/nextline.css': BASE['src/styles/nextline.css'].replace('#add', '#bad') }, null, unrecognised('src/styles/nextline.css')],
  [{ 'src/styles/commented.css': BASE['src/styles/commented.css'].replace('#add', '#bad') }, null, unrecognised('src/styles/commented.css')],
  // A workflow folder's Markdown.
  [{ '.github/workflows/README.md': BASE['.github/workflows/README.md'].replace('old', 'new') }, null, 'it changes how the project is built or shipped in .github/workflows/README.md'],
  // CTOC's own lists: sensitive words in the plural, the secret-file guard. A `.txt` file is no
  // kind the check reads, so rule 4 refuses `tokens.txt` before rule 5 reads its name;
  // `docs/tokens/site.css` below keeps the plural word pinned.
  [{ 'tokens.txt': lines('New note.') }, null, unrecognised('tokens.txt')],
  // The commit security review (2026-10-09). Instruction files at any depth.
  [{ 'docs/sub/AGENTS.md': BASE['docs/sub/AGENTS.md'].replace('Old', 'New') }, null, unrecognised('docs/sub/AGENTS.md')],
  [{ 'pkg/CLAUDE.md': BASE['pkg/CLAUDE.md'].replace('Old', 'New') }, null, unrecognised('pkg/CLAUDE.md')],
  [{ '.foo/notes.md': BASE['.foo/notes.md'].replace('Old', 'New') }, null, unrecognised('.foo/notes.md')],
  [{ '.github/instructions/x.instructions.md': lines('New rules.') }, null, 'it changes how the project is built or shipped in .github/instructions/x.instructions.md'],
  [{ 'prompts/review.prompt.md': lines('New prompt.') }, null, unrecognised('prompts/review.prompt.md')],
  [{ '.cursor/rules/a.mdc': lines('New rules.') }, null, unrecognised('.cursor/rules/a.mdc')],
  [{ 'rules.mdc': lines('New rules.') }, null, unrecognised('rules.mdc')],
  // A custom property is a setting a script can read, whatever colour it holds.
  [{ 'src/styles/flags.css': BASE['src/styles/flags.css'].replace('green', 'red') }, null, setting('src/styles/flags.css')],
  [{ 'src/styles/flags.css': BASE['src/styles/flags.css'].replace('--mode: red', '--mode: lime') }, null, setting('src/styles/flags.css')],
  [{ 'src/styles/custom.css': lines(':root {', '  --accent: blue;', '}') }, null, setting('src/styles/custom.css')],
  [{ 'src/styles/vars.css': lines(':root {', '  --brand: #fafafa;', '}') }, null, setting('src/styles/vars.css')],
  // Plain text is no kind the check reads.
  [{ 'notes/doctest.txt': BASE['notes/doctest.txt'].replace(/old$/m, 'new') }, null, unrecognised('notes/doctest.txt')],
  // A sensitive word that is a stylesheet's own name still counts (its plural does not).
  [{ 'src/styles/login.css': BASE['src/styles/login.css'].replace('red', 'blue') }, null, 'src/styles/login.css sits in an area named login, and such areas are never a hotfix'],
  [{ 'src/styles/payment.css': BASE['src/styles/payment.css'].replace('red', 'blue') }, null, 'src/styles/payment.css sits in an area named payment, and such areas are never a hotfix'],
  // A custom property named for a colour: a setting like every other custom property (the tenth
  // round: custom properties never qualify), whether it holds a colour, a second token or a
  // variable. The last two qualified until then.
  [{ 'src/styles/color-mode.css': BASE['src/styles/color-mode.css'].replace('dark', 'light') }, null, setting('src/styles/color-mode.css')],
  [{ 'src/styles/two-tokens.css': BASE['src/styles/two-tokens.css'].replace('red', 'red url(x)') }, null, setting('src/styles/two-tokens.css')],
  [{ 'src/styles/var.css': BASE['src/styles/var.css'].replace('--b', '--c') }, null, setting('src/styles/var.css')],
  [{ 'src/styles/color-brand.css': BASE['src/styles/color-brand.css'].replace('#0b5ed7', '#1a73e8') }, null, setting('src/styles/color-brand.css')],
  [{ 'src/styles/button-colour.css': BASE['src/styles/button-colour.css'].replace('red', 'blue') }, null, setting('src/styles/button-colour.css')],
  [{ 'src/styles/brand.css': BASE['src/styles/brand.css'].replace('#0a58ca', '#0b5ed7') }, null, setting('src/styles/brand.css')],
  // A colour that is not the whole value of its property (the functional plan's scenario).
  [{ 'src/styles/border.css': BASE['src/styles/border.css'].replace('#0a58ca', '#0b5ed7') }, null, inexact('src/styles/border.css')],
];

// The traps of the eighth and ninth rounds that are no case of a kind removed in the tenth.
TRAPS.push(
  [{ 'notes/todo.txt': lines('Write the start page.') }, null, unrecognised('notes/todo.txt')],
  // Plain text is no kind the check reads: a dependency name, a template's placeholder, an
  // exclusion list, build options.
  [{ 'deps.txt': lines('request') }, null, unrecognised('deps.txt')],
  [{ 'templates/email/welcome.txt': lines('Hello {nome}, welcome.') }, null, unrecognised('templates/email/welcome.txt')],
  [{ 'exclude.txt': lines('build', 'cache-old') }, null, unrecognised('exclude.txt')],
  [{ 'cmake/options.txt': lines('option(SLOW ON)') }, null, unrecognised('cmake/options.txt')],
  // A dependency, build or settings name is decided by the name, also in a catalogue folder;
  // every other file there is a settings file by its extension.
  [{ 'packages/i18n/package.json': BASE['packages/i18n/package.json'].replace('Old texts', 'New texts') }, null, 'it changes the dependencies in packages/i18n/package.json'],
  [{ 'locales/package.json': BASE['locales/package.json'].replace('node run tests', 'echo skipped') }, null, 'it changes the dependencies in locales/package.json'],
  [{ 'messages/docker-compose.yml': BASE['messages/docker-compose.yml'].replace('image: app', 'image: other') }, null, 'it changes how the project is built or shipped in messages/docker-compose.yml'],
  [{ 'translations/pnpm-lock.yaml': lines('lockfileVersion: new') }, null, 'it changes the dependencies in translations/pnpm-lock.yaml'],
  [{ 'i18n/tsconfig.json': BASE['i18n/tsconfig.json'].replace('commonjs', 'esnext') }, null, setting('i18n/tsconfig.json')],
  [{ 'messages/application.properties': lines('spring.profiles.active=prod') }, null, setting('messages/application.properties')],
  [{ 'i18n/routes.json': BASE['i18n/routes.json'].replace('Start', 'Begin') }, null, setting('i18n/routes.json')],
  // Another number of carriage returns.
  [{ 'src/styles/endings.css': 'a { color: blue; }\r\nb { margin: 0; }\n' }, null, unrecognised('src/styles/endings.css')],
  // Stylesheets (the ninth round), each an answer of `checking` on `4212d9ff`: a `;` inside
  // brackets ends no statement, so `color: red` is no declaration of its own there; an
  // escape that spells `url(`; a custom property that an animation name and a style query
  // read; and a stray word, at which a browser and postcss part ways.
  [{ 'src/styles/shape.css': BASE['src/styles/shape.css'].replace('red', 'blue') }, null, setting('src/styles/shape.css')],
  [{ 'src/styles/escaped-url.css': BASE['src/styles/escaped-url.css'].replace('red', 'blue') }, null, 'src/styles/escaped-url.css holds an escape (a backslash), which the check does not read in a stylesheet'],
  [{ 'src/styles/animated.css': BASE['src/styles/animated.css'].replace('red', 'blue') }, null, setting('src/styles/animated.css')],
  [{ 'src/styles/queried.css': BASE['src/styles/queried.css'].replace('--brand-color: red;', '--brand-color: blue;') }, null, setting('src/styles/queried.css')],
  [{ 'src/styles/stray-word.css': BASE['src/styles/stray-word.css'].replace('red', 'blue') }, null, 'I could not read the change (src/styles/stray-word.css holds something I cannot follow)'],
  // After the re-check of 2026-10-10 a page is no kind the check reads (the page traps of the
  // earlier rounds, which asserted what the page reader said, are deleted with it).
  [{ 'src/pages/home.html': page('<button>Store</button>') }, null, unrecognised('src/pages/home.html')],
  // The path rules, on stylesheets: sensitive areas, a governing folder, the size rule.
  [{ 'site/privacy/site.css': BASE['site/privacy/site.css'].replace('red', 'blue') }, null, 'site/privacy/site.css sits in an area named privacy, and such areas are never a hotfix'],
  [{ 'billing/site.css': BASE['billing/site.css'].replace('red', 'blue') }, null, 'billing/site.css sits in an area named billing, and such areas are never a hotfix'],
  [{ 'src/payments/site.css': BASE['src/payments/site.css'].replace('red', 'blue') }, null, 'src/payments/site.css sits in an area named payment, and such areas are never a hotfix'],
  [{ 'docs/passwords.css': BASE['docs/passwords.css'].replace('red', 'blue') }, null, 'docs/passwords.css sits in an area named password, and such areas are never a hotfix'],
  [{ 'docs/id_rsa.css': BASE['docs/id_rsa.css'].replace('red', 'blue') }, null, 'docs/id_rsa.css sits in an area named secret, and such areas are never a hotfix'],
  // (A stylesheet named for design tokens passed until the second final re-check of 2026-10-10, which took the exception out.)
  [{ 'src/styles/tokens.css': BASE['src/styles/tokens.css'].replace('#0a58ca', '#0b5ed7') }, null, 'src/styles/tokens.css sits in an area named token, and such areas are never a hotfix'],
  [{ 'docs/tokens/site.css': BASE['docs/tokens/site.css'].replace('red', 'blue') }, null, 'docs/tokens/site.css sits in an area named token, and such areas are never a hotfix'],
  [{ 'src/styles/AuthPanel.css': BASE['src/styles/AuthPanel.css'].replace('red', 'blue') }, null, 'src/styles/AuthPanel.css sits in an area named auth, and such areas are never a hotfix'],
  [{ 'src/styles/paymentForm.css': BASE['src/styles/paymentForm.css'].replace('red', 'blue') }, null, 'src/styles/paymentForm.css sits in an area named payment, and such areas are never a hotfix'],
  [{ 'agents/card.css': BASE['agents/card.css'].replace('red', 'blue') }, null, unrecognised('agents/card.css')],
  [{ 'src/styles/about.css': lines('a { color: red; }') }, null, 'it adds, removes or renames src/styles/about.css'],
  // A stylesheet whose attributes say `-diff` still counts its real lines (13 recoloured).
  [{ 'src/styles/big.css': BASE['src/styles/big.css'].replace(/color: red/g, 'color: blue') }, null, 'it changes 26 lines in 1 file and a hotfix is at most 20 lines in at most 3 files'],
  // 21 changed lines in one file, 11 removed and 10 added: the size rule answers before the reader.
  [{ 'src/styles/limit.css': lines(...Array.from({ length: 10 }, (_, i) => `.limit-${String.fromCharCode(97 + i)} { color: blue; }`)) }, null, 'it changes 21 lines in 1 file and a hotfix is at most 20 lines in at most 3 files'],
  [{ 'src/styles/long.css': BASE['src/styles/long.css'].replace(/\.long-([a-k]) \{ color: red/g, '.long-$1 { color: blue') }, null, 'it changes 22 lines in 1 file and a hotfix is at most 20 lines in at most 3 files'],
  [{ 'site/a.css': lines('a { color: blue; }'), 'site/b.css': lines('b { color: blue; }'), 'site/c.css': lines('i { color: blue; }'), 'site/d.css': lines('u { color: blue; }') }, null, 'it changes 8 lines in 4 files and a hotfix is at most 20 lines in at most 3 files']
);

const REMOVED_FORMATS = [
  [{ 'src/components/Greeting.jsx': BASE['src/components/Greeting.jsx'].replace('Hello there', 'Hello friend') }, null, unrecognised('src/components/Greeting.jsx')],
  [{ 'src/components/CancelButton.tsx': BASE['src/components/CancelButton.tsx'].replace('>Cancel<', '>Close<') }, null, unrecognised('src/components/CancelButton.tsx')],
  [{ 'src/components/NameField.vue': BASE['src/components/NameField.vue'].replace('>Name<', '>Full name<') }, null, unrecognised('src/components/NameField.vue')],
  [{ 'src/components/Loading.svelte': lines('<p>Please wait</p>') }, null, unrecognised('src/components/Loading.svelte')],
  [{ 'translations/de.po': lines('msgid "Save"', 'msgstr "Sichern"') }, null, unrecognised('translations/de.po')],
  [{ 'docs/guide.rst': lines('Guide', '=====', '', 'Read this handbook first.') }, null, unrecognised('docs/guide.rst')],
  [{ 'docs/shortcuts.rst': lines('Press :kbd:`Ctrl` to save the new file.') }, null, unrecognised('docs/shortcuts.rst')],
  [{ 'src/components/Cond.vue': BASE['src/components/Cond.vue'].replace('Save', 'Store') }, null, unrecognised('src/components/Cond.vue')],
  [{ 'src/components/Hello.jsx': BASE['src/components/Hello.jsx'].replace('Hello {name}', 'Hi {name}') }, null, unrecognised('src/components/Hello.jsx')],
  [{ 'src/components/Msg.vue': BASE['src/components/Msg.vue'].replace('now', 'today') }, null, unrecognised('src/components/Msg.vue')],
  [{ 'src/components/Pick.tsx': BASE['src/components/Pick.tsx'].replace('y < z;', 'y < w;') }, null, unrecognised('src/components/Pick.tsx')],
  [{ 'src/components/Generic.tsx': BASE['src/components/Generic.tsx'].replace('("a")', '("b")') }, null, unrecognised('src/components/Generic.tsx')],
  [{ 'src/components/Compare.tsx': BASE['src/components/Compare.tsx'].replace('a<b>limit<c', 'a<b>max<c') }, null, unrecognised('src/components/Compare.tsx')],
  [{ 'src/components/Types.tsx': BASE['src/components/Types.tsx'].replace('Box<A>|Box<B>', 'Box<A>|Bag<B>') }, null, unrecognised('src/components/Types.tsx')],
  [{ 'src/components/Limit.vue': BASE['src/components/Limit.vue'].replace('count>max', 'count>top') }, null, unrecognised('src/components/Limit.vue')],
  [{ 'docs/raw.rst': BASE['docs/raw.rst'].replace('one', 'two') }, null, unrecognised('docs/raw.rst')],
  [{ 'docs/code.rst': BASE['docs/code.rst'].replace('requests', 'reqests') }, null, unrecognised('docs/code.rst')],
  [{ 'docs/inc.rst': BASE['docs/inc.rst'].replace('one.rst', 'two.rst') }, null, unrecognised('docs/inc.rst')],
  [{ 'src/components/Clicker.vue': BASE['src/components/Clicker.vue'].replace("'one'", "'two'") }, null, unrecognised('src/components/Clicker.vue')],
  [{ 'src/components/Bind.vue': BASE['src/components/Bind.vue'].replace('"one"', '"two"') }, null, unrecognised('src/components/Bind.vue')],
  [{ 'src/components/Nested.jsx': BASE['src/components/Nested.jsx'].replace("'one'", "'two'") }, null, unrecognised('src/components/Nested.jsx')],
  [{ 'docs/span-def.rst': lines('Title', '=====', '', '.. role:: raw-html(raw)', '   :format: html', '', 'Old words.') }, null, unrecognised('docs/span-def.rst')],
  [{ 'docs/raw-span.rst': BASE['docs/raw-span.rst'].replace('<b>x</b>', '<b>y</b>') }, null, unrecognised('docs/raw-span.rst')],
  [{ 'docs/span-text.rst': BASE['docs/span-text.rst'].replace('Ctrl', 'Alt') }, null, unrecognised('docs/span-text.rst')],
  [{ 'docs/span-after.rst': BASE['docs/span-after.rst'].replace('Ctrl', 'Alt') }, null, unrecognised('docs/span-after.rst')],
  [{ 'src/components/RunSql.jsx': BASE['src/components/RunSql.jsx'].replace('SELECT name FROM users', 'SELECT pass FROM admins') }, null, unrecognised('src/components/RunSql.jsx')],
  [{ 'src/components/Charge.vue': BASE['src/components/Charge.vue'].replace('>charge<', '>refund<') }, null, unrecognised('src/components/Charge.vue')],
  [{ 'src/components/SlotPass.vue': BASE['src/components/SlotPass.vue'].replace('>charge<', '>refund<') }, null, unrecognised('src/components/SlotPass.vue')],
  [{ 'src/components/Pay.svelte': BASE['src/components/Pay.svelte'].replace('>charge<', '>refund<') }, null, unrecognised('src/components/Pay.svelte')],
  [{ 'src/styles/theme.scss': lines('$brand: rgb(11, 94, 215);') }, null, unrecognised('src/styles/theme.scss')],
  [{ 'src/styles/accent.less': lines('@accent: tomato;') }, null, unrecognised('src/styles/accent.less')],
  [{ 'src/styles/indented.sass': lines('.save', '  color: #0b5ed7') }, null, unrecognised('src/styles/indented.sass')],
  [{ 'locales/de.po': lines('msgid "Save"', 'msgstr "Sichern"') }, null, unrecognised('locales/de.po')],
  [{ 'docs/literal.rst': BASE['docs/literal.rst'].replace('requests', 'reqests') }, null, unrecognised('docs/literal.rst')],
  [{ 'docs/expanded.rst': BASE['docs/expanded.rst'].replace('requests', 'reqests') }, null, unrecognised('docs/expanded.rst')],
  [{ 'docs/doctest.rst': BASE['docs/doctest.rst'].replace(/old$/m, 'new') }, null, unrecognised('docs/doctest.rst')],
  [{ 'docs/ifconfig.rst': BASE['docs/ifconfig.rst'].replace('"old"', '"new"') }, null, unrecognised('docs/ifconfig.rst')],
  [{ 'docs/doctest-dir.rst': BASE['docs/doctest-dir.rst'].replace(/old$/m, 'new') }, null, unrecognised('docs/doctest-dir.rst')],
  [{ 'docs/image.rst': BASE['docs/image.rst'].replace('one.png', 'two.png') }, null, unrecognised('docs/image.rst')],
  [{ 'docs/toctree.rst': BASE['docs/toctree.rst'].replace('usage', 'install') }, null, unrecognised('docs/toctree.rst')],
  [{ 'docs/automodule.rst': BASE['docs/automodule.rst'].replace('one', 'two') }, null, unrecognised('docs/automodule.rst')],
  [{ 'docs/note-class.rst': BASE['docs/note-class.rst'].replace(':class: one', ':class: two') }, null, unrecognised('docs/note-class.rst')],
  [{ 'src/components/GenStr.tsx': BASE['src/components/GenStr.tsx'].replace('Save', 'Store') }, null, unrecognised('src/components/GenStr.tsx')],
  [{ 'docs/page.mdx': BASE['docs/page.mdx'].replace('Old', 'New') }, null, unrecognised('docs/page.mdx')]
];
TRAPS.push(...REMOVED_FORMATS);

assert.equal(QUALIFY.length, 8, 'the corpus holds 8 shapes that qualify');
assert.equal(REMOVED_FORMATS.length, 44, 'the corpus holds 44 cases of removed formats');
assert.equal(TRAPS.length, 150, 'the corpus holds 150 traps, the removed formats among them');

let root;


// `maintenance.auto=false` and `gc.auto=0`: git 2.54 starts `git maintenance run --auto --detach`
// after a commit, and that detached process may still write into the repository while the
// test removes its folder (seen 2026-10-09: ENOTEMPTY in the `after` hook).
function git(args) {
  const r = spawnSync('git', ['-c', 'user.name=Hotfix Test', '-c', 'user.email=hotfix@test.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { cwd: root, encoding: 'utf8' });
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
  if (root) fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

/** The first call: rules 1 to 7, no test run. */
async function judge(files) {
  return route(['hotfix', 'check', ...files], root);
}

function assertChecking(res, files) {
  assert.equal(res.verdict, 'checking', JSON.stringify(res));
  assert.equal(res.text, 'Checking the hotfix against the existing tests.');
  assert.equal(res.next, `hotfix check --run-tests ${files.map((f) => `'${f}'`).join(' ')}`);
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

// The property test (the session's decision of 2026-10-09): for each qualifying shape,
// insert one of these characters at each position of the changed text in turn. Every
// result must refuse, unless the character sits in visible data text and passes rule 6;
// each such pass must be named below, with the reason it is still wording.
const INSERTED = ['<', '>', '"', "'", '{', '}', '(', ')', '=', ':', '/', '\\', '@', '#', ';', '*',
  '`', '&', '$', '[', ']', '|', '_'];
// In a stylesheet nothing but a colour may change, so no inserted character is allowed.
const ALLOWED = { colour: {} };
const kindOf = () => 'colour';

/** One group per changed line, as git's `-U0` diff gives for two texts with the same lines. */
function hunksOf(oldText, newText) {
  const o = oldText.split('\n');
  const n = newText.split('\n');
  assert.equal(o.length, n.length, 'an inserted character adds no line');
  const hunks = [];
  for (let i = 0; i < o.length; i++) {
    if (o[i] !== n[i]) hunks.push({ oldStart: i + 1, newStart: i + 1, removed: [o[i].replace(/\r$/, '')], added: [n[i].replace(/\r$/, '')] });
  }
  return hunks;
}
const changeOf = (rel, oldText, newText) => {
  const hunks = hunksOf(oldText, newText);
  return {
    files: [{ display: rel, topRel: rel, status: 'M', oldMode: '100644', newMode: '100644', oldSha: null, oldText, newText, hunks }],
    lineCount: hunks.length * 2
  };
};

test('property: one inserted character in the changed text of every qualifying shape refuses, or is named wording', async (t) => {
  const reasons = new Map();
  const sample = [];
  let variants = 0;
  for (const [shape, content] of QUALIFY) {
    const writes = typeof shape === 'string' ? { [shape]: content } : shape;
    for (const [rel, neu] of Object.entries(writes)) {
      const old = BASE[rel];
      assert.equal(ruleRefusal(changeOf(rel, old, neu)), null, `${rel}: the shape itself qualifies`);
      let p = 0;
      while (p < old.length && p < neu.length && old[p] === neu[p]) p++;
      let s = 0;
      while (s < old.length - p && s < neu.length - p && old[old.length - 1 - s] === neu[neu.length - 1 - s]) s++;
      let refusedOne = null;
      let passedOne = null;
      for (let at = p; at <= neu.length - s; at++) {
        for (const ch of INSERTED) {
          const v = neu.slice(0, at) + ch + neu.slice(at);
          if (v === old) continue;
          variants++;
          const r = ruleRefusal(changeOf(rel, old, v));
          if (r) { refusedOne = refusedOne || v; continue; }
          const allow = ALLOWED[kindOf(rel)][ch];
          const why = allow ? allow(v, at) : null;
          assert.ok(why, `${rel}: inserting ${JSON.stringify(ch)} at ${at} passed: ${JSON.stringify(v.slice(Math.max(0, at - 20), at + 20))}`);
          const key = `${kindOf(rel)} ${JSON.stringify(ch)}: ${why}`;
          reasons.set(key, (reasons.get(key) || 0) + 1);
          passedOne = passedOne || v;
        }
      }
      for (const v of [refusedOne, passedOne]) if (v !== null) sample.push([rel, v]);
    }
  }
  // The pure rules and the real route agree: one refused and one passing variant per shape.
  for (const [rel, v] of sample) {
    write(rel, v);
    try {
      const res = await judge([rel]);
      const pure = ruleRefusal(changeOf(rel, BASE[rel], v));
      assert.equal(res.verdict, pure ? 'refused' : 'checking', `${rel}: ${JSON.stringify(res)}`);
      if (pure) assert.equal(res.text, refusal(pure.clause));
    } finally {
      write(rel, BASE[rel]);
    }
  }
  // Inside a reStructuredText role span nothing is wording: every insertion refuses (kept
  // from the time the check read reStructuredText; the whole format refuses now).
  const roleOld = BASE['docs/shortcuts.rst'];
  for (let at = roleOld.indexOf('`') + 1; at <= roleOld.lastIndexOf('`'); at++) {
    for (const ch of INSERTED) {
      variants++;
      const v = roleOld.slice(0, at) + ch + roleOld.slice(at);
      assert.ok(ruleRefusal(changeOf('docs/shortcuts.rst', roleOld, v)), `docs/shortcuts.rst: inserting ${JSON.stringify(ch)} at ${at} inside the role passed`);
    }
  }
  t.diagnostic(`${variants} variants, ${[...reasons.values()].reduce((a, b) => a + b, 0)} named passes, ${sample.length} checked through the route`);
  for (const [key, n] of reasons) t.diagnostic(`${n} x ${key}`);
});

// Every scanner fails closed (the automated commit security review, 2026-10-09): the new
// side of every qualifying shape, cut short at every point, refuses. The changed
// lines are read as git reads them: a last line without its line break differs from the
// same line with one.
function gitHunks(oldText, newText) {
  const keyed = (t) => {
    const l = t.split('\n');
    const last = l.pop();
    const keys = l.map((x) => `${x}\n`);
    if (last !== '') keys.push(last);
    return keys;
  };
  const a = keyed(oldText);
  const b = keyed(newText);
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const strip = (x) => x.replace(/\n$/, '').replace(/\r$/, '');
  const removed = a.slice(p, a.length - q).map(strip);
  const added = b.slice(p, b.length - q).map(strip);
  return removed.length + added.length === 0 ? [] : [{ oldStart: p + 1, newStart: p + 1, removed, added }];
}

test('property: a qualifying file cut short at any point refuses', (t) => {
  let cuts = 0;
  for (const [shape, content] of QUALIFY) {
    const writes = typeof shape === 'string' ? { [shape]: content } : shape;
    for (const [rel, neu] of Object.entries(writes)) {
      const old = BASE[rel];
      for (let at = 0; at < neu.length; at++) {
        const cut = neu.slice(0, at);
        if (cut === old) continue;
        cuts++;
        const hunks = gitHunks(old, cut);
        const change = {
          files: [{ display: rel, topRel: rel, status: 'M', oldMode: '100644', newMode: '100644', oldSha: null, oldText: old, newText: cut, hunks }],
          lineCount: hunks.reduce((n, h) => n + h.removed.length + h.added.length, 0)
        };
        // A cut always leaves a tag, an element or a block open, or takes a line away.
        assert.ok(ruleRefusal(change), `${rel} cut at ${at} passed: ${JSON.stringify(cut.slice(-40))}`);
      }
    }
  }
  t.diagnostic(`${cuts} cuts, none passes`);
});

/**
 * What a timed call must cost, in milliseconds, and below what a time is noise. Until the tenth
 * round the ratio was `big / max(small, 20)`: with a small input that cost 2 ms, a reader that
 * took 100 ms at four times the size (50 times as long) showed a ratio of 5 and passed. The
 * inputs now grow until a call costs 40 ms, and only a time below 2 ms is taken for 2 ms, so
 * that a reader too fast to time must also be fast, in milliseconds, at four times the size.
 */
const TIMED_MS = 40;
const NOISE_MS = 2;
/**
 * A timing case in ratio form (the decision at review of 2026-10-09: a bound in milliseconds
 * passed or failed with the machine's load, where a ratio does not). `at(n)` gives the call to
 * time on an input of size `n`, built before it is timed. The call is warmed once; `n` grows
 * until one call costs at least 40 ms or `4n` would pass `limit` (inputs of many megabytes
 * measure the engine's memory, not the reader); an input that cannot grow that far is run
 * several times in a row, so that what is timed still costs about 40 ms. Then the minimum of
 * five runs at `n` and of five runs at `4n` is taken. Work that is linear in the input gives
 * a ratio near 4, quadratic work one near 16, and the bound is 8. The one
 * absolute bound is seconds wide and stops a runaway reader early.
 * @param {(n: number) => (() => unknown)} at @param {number} n the first size tried @param {number} limit the largest `4n`
 * @returns {{n: number, small: number, big: number, ratio: number}}
 */
function growth(at, n, limit) {
  const ms = (fn) => {
    const start = process.hrtime.bigint();
    fn();
    return Number(process.hrtime.bigint() - start) / 1e6;
  };
  const least = (fn) => Math.min(ms(fn), ms(fn), ms(fn), ms(fn), ms(fn));
  let call = at(n);
  call(); // warm once
  let once = ms(call);
  while (once < TIMED_MS && n * 8 <= limit) {
    n *= once < TIMED_MS / 4 && n * 16 <= limit ? 4 : 2;
    call = at(n);
    once = ms(call);
  }
  assert.ok(once < 5000, `one call at size ${n} took ${once.toFixed(0)} ms`);
  const times = once < TIMED_MS ? Math.min(Math.ceil(TIMED_MS / Math.max(once, 0.02)), 2000) : 1;
  const repeated = (fn) => () => { for (let k = 0; k < times; k++) fn(); };
  const small = least(repeated(call));
  const big = least(repeated(at(4 * n)));
  return { n, small, big, ratio: big / Math.max(small, NOISE_MS) };
}

// Each scanner moves forward only. Inputs built to make a backtracking or rescanning scanner
// quadratic are judged at a size `n` and at `4n`, and the time may grow by less than 8 times
// (the ratio form: see `growth`). Each input is a function of its size, in repeated pieces.
test('the whole-file scanners stay linear on input built against them', (t) => {
  const cases = {
    'docs/raws.rst': (n) => `Old words.\n${'.. raw:: html\n'.repeat(10 * n)}`,
    'src/components/Braces.jsx': (n) => `export const P = () => <p>Old</p>;\n${'{'.repeat(100 * n)}\n`,
    'src/components/Tags.jsx': (n) => `export const P = () => <p>Old</p>;\n${'x = <a>'.repeat(20 * n)}\n`,
    'src/components/Nest.vue': (n) => `<template>\n<p>Old</p>\n${'<template>'.repeat(10 * n)}\n</template>\n`,
    'src/styles/urls.css': (n) => `a { color: red; }\n${'url('.repeat(30 * n)}\n`,
    // The fourth round's scanners: nested list items, literal blocks, wrapped reference
    // definitions, reference words, prose directive options, type parameter lists,
    // components and variable declarations.
    'docs/literals.rst': (n) => `Old words.\n${'Run::\n\n   code\n'.repeat(8 * n)}`,
    'docs/refs.rst': (n) => `Old words.\nx${')'.repeat(100 * n)}a\n`,
    'docs/options.rst': (n) => `Old words.\n.. note::\n${'   :class: x\n'.repeat(10 * n)}`,
    'src/components/Params.tsx': (n) => `export const P = () => <p>Old</p>;\n${'x = <T extends A<'.repeat(6 * n)}\n`,
    'src/components/Holds.vue': (n) => `<template>\n<p>Old</p>\n${'<MyThing>'.repeat(10 * n)}\n</template>\n`,
    'src/styles/vars.scss': (n) => `a { color: red; }\n${'$a: b;'.repeat(16 * n)}\n`,
    // The fifth round's scanners: a deep stack of open elements closed by end tags of other
    // names, with and without a holder open; many custom properties.
    'src/styles/properties.css': (n) => `a { color: red; }\n:root {${'--color-a: red;'.repeat(6 * n)}}\n`,
    // The sixth round's scanners: foreign content nested deep, many pieces of it, and never
    // closed; comments that hold a comment start; script blocks full of comment marks; one long value.
    'src/styles/value.css': (n) => `a { color: red; }\nb { margin:${' 1px'.repeat(25 * n)} !important; }\n`,
    // The seventh round's reader (the review of 2026-10-09): HTML with the end tags that may be
    // left out, the start tags that close an open element, table parts and `<noscript>` content.
    // The eighth round's HTML reader: text inside many open elements; the content of
    // `<noscript>` read in place, with no end tag, with one far away, and with many.
    // The ninth round's stylesheet reader: many brackets, deep brackets, many reads of a
    // custom property, many names that only look like one, and many statements (a real colour
    // property stands first in each, so the change is a colour's).
    'src/styles/brackets.css': (n) => `a { color: red; }\nb { width: calc(${'(1px + 2px) '.repeat(20 * n)}1px); }\n`,
    'src/styles/brackets-deep.css': (n) => `a { color: red; }\nb { width: ${'calc('.repeat(40 * n)}1px${')'.repeat(40 * n)}; }\n`,
    'src/styles/reads.css': (n) => `b { color: red; }\n:root { --brand-color: red; }\n${'a { color: var(--brand-color); }\n'.repeat(8 * n)}`,
    'src/styles/names.css': (n) => `b { color: red; }\n:root { --brand-color: red; }\n${'.btn--brand-color, .x--y { margin: 0; }\n'.repeat(6 * n)}`,
    'src/styles/statements.css': (n) => `a { color: red; }\n${'@media (min-width: 1px) { b { margin: 0; padding: 0 } }\n'.repeat(5 * n)}`,
    // What the coordinator's points at review added: a character set named many times, a text
    // read as its references spell it, and the ending of every line.
    'src/styles/charsets.css': (n) => `@charset "utf-8";\na { color: red; }\n${'/* @charset "utf-8" */\n'.repeat(10 * n)}`,
    'src/styles/endings.css': (n) => `a { color: red; }\r\n${'b { margin: 0; }\r\n'.repeat(12 * n)}`,
  };
  for (const [rel, build] of Object.entries(cases)) {
    const at = (n) => {
      const old = build(n);
      const change = changeOf(rel, old, /\.s?css$/.test(rel) ? old.replace('red', 'blue') : old.replace('Old', 'New'));
      return () => ruleRefusal(change);
    };
    // The inputs of the removed formats are kept: each is refused as not recognised, at once.
    if (/\.(?:rst|jsx|tsx|vue|scss)$/.test(rel)) assert.equal(at(1)().cause, 'unrecognised', rel);
    // The ninth round's inputs are read to the end and pass.
    if (/^(?:src\/styles\/(?:brackets|reads|names|statements|charsets|endings)|src\/pages\/(?:charsets|references))/.test(rel)) assert.equal(at(1)(), null, rel);
    // The largest input is about 1.6 million characters, four times the size a quadratic scan took seconds on.
    const { n, small, big, ratio } = growth(at, 16, Math.floor(1600000 / (build(64).length / 64)));
    assert.ok(ratio < 8, `${rel}: size ${n} took ${small.toFixed(1)} ms and size ${4 * n} took ${big.toFixed(1)} ms, ${ratio.toFixed(1)} times as long`);
    if (ratio > 5) t.diagnostic(`${rel}: ${ratio.toFixed(1)} times as long at 4 times the size (${small.toFixed(1)} ms at size ${n})`);
  }
});

test('mode change: an executable bit on a stylesheet is not wording (where git tracks the bit)', async () => {
  git(['update-index', '--chmod=+x', 'src/styles/button.css']);
  git(['commit', '-q', '-m', 'make the stylesheet executable']);
  // The working copy keeps its old mode, so the change against the last commit is a
  // mode change, plus one wording edit.
  write('src/styles/button.css', lines('.save { background-color: #0b5ed7; }'));
  const res = await judge(['src/styles/button.css']);
  const fileModeTracked = spawnSync('git', ['config', '--get', 'core.filemode'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== 'false';
  if (process.platform !== 'win32' && fileModeTracked) {
    assert.equal(res.text, refusal(unrecognised('src/styles/button.css')));
  } else {
    assertChecking(res, ['src/styles/button.css']);
  }
});
