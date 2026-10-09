'use strict';

// The classifier corpus: 30 edit shapes that qualify as a hotfix and 195 traps that must
// not (42 of them the kept cases of the formats the owner's decision of 2026-10-09 removed),
// plus one mode change, each judged through the menu router's first call (rules 1
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
const { ruleRefusal } = require('../src/lib/hotfix-check');

const refusal = (clause) => `I did not treat this as a hotfix because ${clause}; `
  + 'it goes through a normal plan, and your edits stay in place, not committed.';
const unrecognised = (f) => `I do not recognise ${f} as wording or a colour`;
const setting = (f) => `it changes a setting in ${f}, and settings changes are a common cause of outages`;
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
  'docs/limit.md': lines(...Array.from({ length: 11 }, (_, i) => `Limit old line ${String.fromCharCode(97 + i)}.`)),
  // The security check's second round (2026-10-08).
  'docs/links.md': lines('Read teh guide at https://example.org/guide.'),
  'src/pages/size-pick.html': page('<select><option value="m">Medium</option></select>'),
  'src/pages/onclick.html': page('<button onclick="if (a>b) save(); else stop(c<d)">Go</button>'),
  'src/components/Limit.vue': lines('<template>', '  <button :disabled="count>max || count<min">Go</button>', '</template>'),
  'src/pages/angular.html': page('<button (click)="a>b ? save() : stop(c<d)">Go</button>'),
  'src/pages/help-link.html': page('<a title="a>b" href="/help" data-x="c<d">Help</a>'),
  'src/pages/banner.html': page('<div title="a>b" style="background: url(/one.png)" data-y="c<d">Hi</div>'),
  'deps/dev-requirements.txt': lines('pytest==8.0.0'),
  'deps/test-requirements.txt': lines('coverage==7.0.0'),
  'app/packages.txt': lines('libpq-dev'),
  'app/version.txt': lines('1.0.0'),
  'locales/flags.yml': lines('beta: true'),
  'locales/flags.properties': lines('beta=true'),
  'locales/links.json': lines('{', '  "help": "/help"', '}'),
  'config/locales/en.yml': lines('en:', '  number:', '    format:', '      separator: "."'),
  'docs/install.md': lines('# Install', '', 'Run curl -fsSL https://get.example.org | sh to install.'),
  'SECURITY.md': lines('# Security', '', 'Report problems to security@example.org.'),
  'docs/release.md': lines('Install version 2.3.1 of the tool.'),
  'docs/widget.md': lines('# Widget', '', '<script>', 'track("old")', '</script>'),
  'docs/post.md': lines('---', 'layout: post', '---', '', 'The post.'),
  'AGENTS.md': lines('# Agents', '', 'Old agent rules.'),
  'GEMINI.md': lines('# Gemini', '', 'Old model rules.'),
  '.github/copilot-instructions.md': lines('# Copilot', '', 'Old assistant rules.'),
  '.cursor/rules/style.md': lines('# Style', '', 'Old style rules.'),
  '.changeset/brave-cats.md': lines('---', '"corpus": patch', '---', '', 'Old change note.'),
  'src/styles/nav.css': lines('nav:hover #add {display:none}'),
  'src/pages/colour-pick.html': page('<select><option>Red</option></select>'),
  'src/pages/dotted.html': page(lines('<p>\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130</p><script>a()</script><script>', "el.innerHTML = '<b>Save</b>';", '</script>').trimEnd()),
  // The security check's third round and the re-review (2026-10-09): whole-file scanners.
  '.github/CONTRIBUTING.md': lines('# Contributing', '', 'Open an issue first.'),
  '.github/workflows/README.md': lines('# Workflows', '', 'The old build notes.'),
  'docs/linktext.md': lines('Read [the old guide](/guide) first.'),
  'src/pages/wrapped.html': page(lines('<button', '  class="x">Save</button>').trimEnd()),
  'docs/fenced-ok.md': lines('# Setup', '', 'Run the old installer.', '', '```sh', 'pip install requests', '```'),
  'src/pages/tip.html': page(lines('<button title="x', ' <i>tip</i>" onclick="go(\'one\')<b">Save</button>').trimEnd()),
  'src/pages/status-pick.html': page('<select><option><b>Pending</b></option></select>'),
  'locales/far.json': lines('{', '  "go": "Help"', '}'),
  'lang/far.properties': lines('link=Help'),
  'docs/click.md': lines('# Click', '', '<a onclick="go(\'one\')">Help</a>'),
  'docs/js-link.md': lines('Read [x](javascript:go()) now.'),
  'docs/tpl.md': lines('Hello {{ one() }} there.'),
  'docs/raw.rst': lines('Title', '=====', '', '.. raw:: html', '', '   <b>one</b>'),
  'content/post.md': lines('+++', 'draft = false', '+++', '', 'The post.'),
  'CLAUDE.local.md': lines('# Local', '', 'Old local rules.'),
  '.windsurf/rules/style.md': lines('# Style', '', 'Old style rules.'),
  '.clinerules/style.md': lines('# Style', '', 'Old style rules.'),
  '.kiro/steering/style.md': lines('# Style', '', 'Old style rules.'),
  'CONVENTIONS.md': lines('# Conventions', '', 'Old conventions.'),
  'src/styles/nextline.css': lines('nav:hover #add', '{display:none}'),
  'src/styles/commented.css': lines('#add /* ; */ {display:none}'),
  'docs/setup.md': lines('# Setup', '', '```sh', 'pip install requests', '```'),
  'docs/indented.md': lines('# Setup', '', '    pip install requests'),
  'docs/tilde.md': lines('# Setup', '', '~~~', 'pip install requests', '~~~'),
  'docs/json-front.md': lines('{', '  "title": "Old"', '}', '', 'Body.'),
  'docs/ref.md': lines('See [the guide][g].', '', '[g]: /guide'),
  'docs/auto.md': lines('Visit <https://one.example> now.'),
  'docs/liquid.md': lines('{% include one.html %}', '', 'Body.'),
  'docs/code.rst': lines('Setup', '=====', '', '.. code-block:: sh', '', '   pip install requests'),
  'docs/inc.rst': lines('Guide', '=====', '', '.. include:: one.rst'),
  'src/pages/entity.html': page('<a title="a&gt;b" href="/x">Go</a>'),
  'src/pages/unquoted.html': page('<a href=/one>Home</a>'),
  'src/components/Clicker.vue': lines('<template>', '  <button @click="go(\'one\')">Go</button>', '</template>'),
  'src/components/Bind.vue': lines('<template>', '  <p v-bind:title="one">Hi</p>', '</template>'),
  'src/components/Nested.jsx': lines('export const N = () => (', '  <button onClick={() => { if (a > b) { go(\'one\'); } }}>Go</button>', ');'),
  'tokens.txt': lines('Old note.'),
  'config/locales/secrets.yml': lines('title: Old'),
  'messages/credentials.json': lines('{', '  "title": "Old"', '}'),
  'src/hooks/README.md': lines('# Hooks', '', 'Old notes.'),
  'src/payments/index.html': page('<p>Old</p>'),
  'docs/passwords.md': lines('# Help', '', 'Old notes.'),
  'docs/id_rsa.md': lines('# Help', '', 'Old notes.'),
  // The commit security review (2026-10-09): instruction files by class, reStructuredText roles.
  'docs/sub/AGENTS.md': lines('# Agents', '', 'Old rules.'),
  'pkg/CLAUDE.md': lines('# Rules', '', 'Old rules.'),
  '.foo/notes.md': lines('# Notes', '', 'Old notes.'),
  '.github/instructions/x.instructions.md': lines('Old rules.'),
  'prompts/review.prompt.md': lines('Old prompt.'),
  '.cursor/rules/a.mdc': lines('Old rules.'),
  'rules.mdc': lines('Old rules.'),
  '.github/ISSUE_TEMPLATE/bug.md': lines('Describe the old bug.'),
  'docs/span-def.rst': lines('Title', '=====', '', 'Old words.'),
  'docs/raw-span.rst': lines('Text :raw-html:`<b>x</b>` here.'),
  'docs/span-text.rst': lines('Press :kbd:`Ctrl` now.'),
  'docs/span-after.rst': lines('Press `Ctrl`:kbd: now.'),
  'docs/shortcuts.rst': lines('Press :kbd:`Ctrl` to save the old file.'),
  // The fourth round (2026-10-09): the security attack and the code review.
  'src/components/RunSql.jsx': lines('export const Q = () => <RunSql>SELECT name FROM users</RunSql>;'),
  'src/components/Charge.vue': lines('<template>', '  <MyAction>charge</MyAction>', '</template>'),
  'src/pages/widget.html': page('<my-widget>x</my-widget>'),
  'src/components/SlotPass.vue': lines('<template>', '  <MyAction>', '    <template #label>charge</template>', '  </MyAction>', '</template>'),
  'src/components/Pay.svelte': lines('<Charge>charge</Charge>'),
  'docs/wrapped-ref.md': lines('See [the profile][a].', '', '[a]:', '/u/profile'),
  'docs/wrapped-title.md': lines('See [the profile][a].', '', '[a]:', '/u/profile', '"Old title"'),
  'src/styles/flags.css': lines(':root {', '  --enabled: green;', '  --mode: red;', '}'),
  'docs/literal.rst': lines('Install', '=======', '', 'Run this::', '', '   pip install requests'),
  'docs/expanded.rst': lines('Install', '=======', '', 'Run this:', '', '::', '', '   pip install requests'),
  'docs/doctest.rst': lines('Example', '=======', '', '>>> print("old")', 'old'),
  'notes/doctest.txt': lines('Example:', '', '>>> print("old")', 'old'),
  'docs/doctest.md': lines('# Example', '', '>>> print("old")', 'old'),
  'docs/ifconfig.rst': lines('.. ifconfig:: release == "old"', '', '   Old words.'),
  'docs/doctest-dir.rst': lines('.. doctest::', '', '   >>> print("old")', '   old'),
  'docs/image.rst': lines('.. image:: one.png', '   :alt: The logo'),
  'docs/toctree.rst': lines('.. toctree::', '   :maxdepth: 2', '', '   intro', '   usage'),
  'docs/automodule.rst': lines('.. automodule:: one', '   :members:'),
  'docs/note-class.rst': lines('.. note::', '   :class: one', '', '   Old words.'),
  'docs/code-el.md': lines('Run <code>pip install requests</code> first.'),
  'src/pages/code-el.html': page('<p>Run <code>pip install requests</code></p>'),
  'src/pages/titled.html': lines('<!doctype html>', '<html>', '<head>', '<title>Save</title>', '</head>', '</html>'),
  'src/components/Cond.vue': lines('<template>', '  <div>', '    <template v-if="a"><p>Save</p></template>', '    <template v-else>Cancel</template>', '  </div>', '</template>'),
  'src/styles/tokens.css': lines('.save {', '  color: #0a58ca;', '}'),
  'docs/list.md': lines('- Step one.', '  - Sub step.', '', '    Old words in the sub step.'),
  'docs/list-code.md': lines('- Install:', '', '      pip install requests'),
  'src/components/GenStr.tsx': lines('export const f = <T,>(x: T) => x;', 'export const s = "<b>Save</b>";'),
  // The fifth round (2026-10-09): the owner's decision and the fixes that still apply.
  'docs/page.mdx': lines('# Page', '', 'Old words.'),
  'src/pages/mixed.html': page('<DIV>Save</div>'),
  'src/pages/is.html': page('<button is="run-sql">SELECT name FROM users</button>'),
  'src/pages/runsql.html': page('<runsql>SELECT name FROM users</runsql>'),
  'src/pages/stack.html': page('<run-sql><div></run-sql>SELECT name FROM users</div></run-sql>'),
  'docs/stack.md': lines('Text.', '', '<run-sql><div></run-sql>SELECT name FROM users</div></run-sql>'),
  'docs/mdx-brace.md': lines('Hello {eval(name)} there.'),
  'docs/mdx-import.md': lines("import Chart from './chart'", '', 'Words.'),
  'docs/tick-para.md': lines('A lone ` here.', '', 'Run `rm -rf build` now.'),
  'docs/quote-code.md': lines('> Install:', '>', '>     pip install requests'),
  'docs/quote-fence.md': lines('> ~~~', '> pip install requests', '> ~~~'),
  'docs/quote-doctest.md': lines('> >>> print("old")', '> old'),
  'docs/quote-list.md': lines('> - Install:', '>', '>       pip install requests'),
  'docs/quote-prose.md': lines('> Old words.', '>', '> More words.'),
  'docs/fold.md': lines('See [guide] now.', '', '[SS]: /u/delete'),
  'src/pages/listing.html': page('<listing>pip install requests</listing>'),
  'src/pages/tt.html': page('<p>Run <tt>pip install requests</tt></p>'),
  'src/styles/login.css': lines('a {', '  color: red;', '}'),
  'src/styles/payment.css': lines('a {', '  color: red;', '}'),
  'src/styles/color-mode.css': lines(':root {', '  --color-mode: dark;', '}'),
  'src/styles/two-tokens.css': lines(':root {', '  --brand-color: red;', '}'),
  'src/styles/var.css': lines(':root {', '  --color-a: var(--b);', '}'),
  'src/styles/color-brand.css': lines(':root {', '  --color-brand: #0b5ed7;', '}'),
  'src/styles/button-colour.css': lines(':root {', '  --button-colour: red;', '}')
};

const QUALIFY = [
  ['src/pages/home.html', page('<button>Store</button>')],
  ['src/pages/welcome.html', page('<p>Welcome home!</p>')],
  ['site/about.htm', page('<h2>Who we are</h2>')],
  ['src/pages/nav.html', page('<a class="nav" href="/home">Start</a>')],
  ['locales/en.json', BASE['locales/en.json'].replace('"Save {count} items"', '"Store {count} items"')],
  ['i18n/fr.yaml', lines('save: Sauvegarder', 'cancel: Annuler')],
  ['lang/app.properties', lines('button.save=Store', 'button.cancel=Cancel')],
  ['messages/en.yml', lines('greeting: "Hi, {{name}}"')],
  ['src/styles/button.css', lines('.save { background-color: #0b5ed7; }')],
  ['src/styles/link.css', lines('a {', '  color: hsla(210, 50%, 40%, 0.9);', '}')],
  ['README.md', lines('# Fixture', '', 'This project shows the new wording.')],
  ['notes/todo.txt', lines('Write the start page.')],
  ['docs/intro.md', '# Intro\r\n\r\nThe intro says welcome.\r\n'],
  // 20 changed lines in one file: ten lines reworded, the size limit exactly.
  ['docs/long.md', BASE['docs/long.md'].replace(/Old long line ([a-j])\./g, 'New long line $1.')],
  // 6 changed lines in 3 files: the file limit exactly.
  [{ 'notes/a.md': lines('Alpha new.'), 'notes/b.md': lines('Bravo new.'), 'notes/c.md': lines('Charlie new.') }],
  // A typo fixed on a line that also holds a web address: only the changed word is wording.
  ['docs/links.md', lines('Read the guide at https://example.org/guide.')],
  // The text of an option with a `value` attribute is wording; the value is what is sent.
  ['src/pages/size-pick.html', page('<select><option value="m">Middle</option></select>')],
  // The third round (2026-10-09). Markdown under `.github/` is documentation again.
  ['.github/CONTRIBUTING.md', lines('# Contributing', '', 'Open a discussion first.')],
  // Link text is wording; the target is not.
  ['docs/linktext.md', lines('Read [the new guide](/guide) first.')],
  // A tag whose attributes run over two lines: the whole-file scanner still sees the text.
  ['src/pages/wrapped.html', page(lines('<button', '  class="x">Store</button>').trimEnd())],
  // Prose beside a fenced code block that stays the same.
  ['docs/fenced-ok.md', lines('# Setup', '', 'Run the new installer.', '', '```sh', 'pip install requests', '```')],
  // The commit security review: an issue template under `.github/`; plain text beside a role.
  ['.github/ISSUE_TEMPLATE/bug.md', lines('Describe the new bug.')],
  // The fourth round (2026-10-09). A title is wording; Vue's conditional templates inside
  // markup render; a design-token stylesheet with a real colour property; a paragraph that
  // continues a list item; a React project's `src/hooks/` notes (CTOC's enforcement list
  // is CTOC's own, and this repository is not CTOC).
  ['src/pages/titled.html', BASE['src/pages/titled.html'].replace('Save', 'Store')],
  ['src/styles/tokens.css', BASE['src/styles/tokens.css'].replace('#0a58ca', '#0b5ed7')],
  ['docs/list.md', BASE['docs/list.md'].replace('Old', 'New')],
  ['src/hooks/README.md', BASE['src/hooks/README.md'].replace('Old', 'New')],
  // The fifth round (2026-10-09). An element name is matched in any letter case; a block
  // quote's prose is prose; a
  // custom property named for a colour, holding exactly one colour before and after, is a
  // colour (the session's decision on the owner's instruction).
  ['src/pages/mixed.html', page('<DIV>Store</div>')],
  ['docs/quote-prose.md', BASE['docs/quote-prose.md'].replace('Old', 'New')],
  ['src/styles/color-brand.css', BASE['src/styles/color-brand.css'].replace('#0b5ed7', '#1a73e8')],
  ['src/styles/button-colour.css', BASE['src/styles/button-colour.css'].replace('red', 'blue')]
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
  // Only the closing-element rule catches these two: the `<` after the text must close the
  // element whose opening tag ends at the `>` before it.
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
  [{ 'notes/a.md': lines('Alpha new.'), 'notes/b.md': lines('Bravo new.'), 'notes/c.md': lines('Charlie new.'), 'notes/d.md': lines('Delta new.') }, null, 'it changes 8 lines in 4 files and a hotfix is at most 20 lines in at most 3 files'],
  // The security check's second round (2026-10-08). Code inside an attribute value that
  // holds `>` before the change and `<` plus a letter after it is never visible text.
  [{ 'src/pages/onclick.html': BASE['src/pages/onclick.html'].replace('save()', 'drop()') }, null, unrecognised('src/pages/onclick.html')],
  [{ 'src/pages/angular.html': BASE['src/pages/angular.html'].replace('save()', 'drop()') }, null, unrecognised('src/pages/angular.html')],
  [{ 'src/pages/help-link.html': BASE['src/pages/help-link.html'].replace('href="/help"', 'href="javascript:steal()"') }, null, unrecognised('src/pages/help-link.html')],
  [{ 'src/pages/banner.html': BASE['src/pages/banner.html'].replace('url(/one.png)', 'url(/evil.png)') }, null, unrecognised('src/pages/banner.html')],
  // Dependency and build lists that end in `.txt`.
  [{ 'deps/dev-requirements.txt': lines('pytest==8.0.1') }, null, 'it changes the dependencies in deps/dev-requirements.txt'],
  [{ 'deps/test-requirements.txt': lines('coverage==7.0.1') }, null, 'it changes the dependencies in deps/test-requirements.txt'],
  [{ 'app/packages.txt': lines('libxml-dev') }, null, 'it changes how the project is built or shipped in app/packages.txt'],
  [{ 'app/version.txt': lines('1.0.1') }, null, 'it changes how the project is built or shipped in app/version.txt'],
  // Catalogue values that are not wording.
  [{ 'locales/flags.yml': lines('beta: false') }, null, unrecognised('locales/flags.yml')],
  [{ 'locales/flags.properties': lines('beta=false') }, null, unrecognised('locales/flags.properties')],
  [{ 'locales/links.json': lines('{', '  "help": "javascript:fetch(document.cookie)"', '}') }, null, unrecognised('locales/links.json')],
  [{ 'config/locales/en.yml': BASE['config/locales/en.yml'].replace('"."', '","') }, null, unrecognised('config/locales/en.yml')],
  // Documentation: a changed web address, e-mail address or number; a script; front matter;
  // the instruction files of other assistants; a release note that ships with the build.
  [{ 'docs/install.md': BASE['docs/install.md'].replace('get.example.org', 'get.evil.org') }, null, riskMarker('docs/install.md')],
  [{ 'SECURITY.md': BASE['SECURITY.md'].replace('example.org', 'evil.org') }, null, riskMarker('SECURITY.md')],
  [{ 'docs/release.md': lines('Install version 2.3.2 of the tool.') }, null, riskMarker('docs/release.md')],
  [{ 'docs/widget.md': BASE['docs/widget.md'].replace('"old"', '"new"') }, null, unrecognised('docs/widget.md')],
  [{ 'docs/post.md': BASE['docs/post.md'].replace('layout: post', 'layout: raw') }, null, 'it changes a setting in docs/post.md, and settings changes are a common cause of outages'],
  [{ 'AGENTS.md': lines('# Agents', '', 'New agent rules.') }, null, unrecognised('AGENTS.md')],
  [{ 'GEMINI.md': lines('# Gemini', '', 'New model rules.') }, null, unrecognised('GEMINI.md')],
  [{ '.github/copilot-instructions.md': lines('# Copilot', '', 'New assistant rules.') }, null, unrecognised('.github/copilot-instructions.md')],
  [{ '.cursor/rules/style.md': lines('# Style', '', 'New style rules.') }, null, unrecognised('.cursor/rules/style.md')],
  [{ '.changeset/brave-cats.md': BASE['.changeset/brave-cats.md'].replace('Old change note.', 'New change note.') }, null, 'it changes how the project is built or shipped in .changeset/brave-cats.md'],
  // A selector that reads like a hexadecimal colour.
  [{ 'src/styles/nav.css': lines('nav:hover #bad {display:none}') }, null, unrecognised('src/styles/nav.css')],
  // An option with no `value` attribute submits its text.
  [{ 'src/pages/colour-pick.html': page('<select><option>Blue</option></select>') }, null, unrecognised('src/pages/colour-pick.html')],
  // A letter whose lower case is longer (U+0130) must not move the end of a script block.
  [{ 'src/pages/dotted.html': BASE['src/pages/dotted.html'].replace('<b>Save</b>', '<b>Store</b>') }, null, unrecognised('src/pages/dotted.html')],
  // The security check's third round (2026-10-09). The high finding: a tag whose quoted
  // value runs over two lines, so the second line looks like text after a tag.
  [{ 'src/pages/tip.html': BASE['src/pages/tip.html'].replace("'one'", "'two'") }, null, unrecognised('src/pages/tip.html')],
  // An option with no `value` sends its text, whatever tags sit inside it.
  [{ 'src/pages/status-pick.html': BASE['src/pages/status-pick.html'].replace('Pending', 'Approved') }, null, unrecognised('src/pages/status-pick.html')],
  // Catalogue values read as a browser reads an address: escapes decoded, tabs removed.
  [{ 'locales/far.json': BASE['locales/far.json'].replace('"Help"', '"\\/\\/other.example\\/go"') }, null, unrecognised('locales/far.json')],
  [{ 'locales/far.json': BASE['locales/far.json'].replace('"Help"', '"java\\tscript:go()"') }, null, unrecognised('locales/far.json')],
  [{ 'locales/far.json': BASE['locales/far.json'].replace('"Help"', '"\\tjavascript:go()"') }, null, unrecognised('locales/far.json')],
  [{ 'locales/far.json': BASE['locales/far.json'].replace('"Help"', '"\\\\\\\\evil"') }, null, unrecognised('locales/far.json')],
  [{ 'lang/far.properties': lines('link=java\\script:go()') }, null, unrecognised('lang/far.properties')],
  // Markdown: inline HTML, link targets, template braces, code, front matter.
  [{ 'docs/click.md': BASE['docs/click.md'].replace("'one'", "'two'") }, null, unrecognised('docs/click.md')],
  [{ 'docs/js-link.md': BASE['docs/js-link.md'].replace('go()', 'stop()') }, null, unrecognised('docs/js-link.md')],
  [{ 'docs/tpl.md': BASE['docs/tpl.md'].replace('one()', 'two()') }, null, unrecognised('docs/tpl.md')],
  [{ 'content/post.md': BASE['content/post.md'].replace('false', 'true') }, null, 'it changes a setting in content/post.md, and settings changes are a common cause of outages'],
  // Other assistants' instruction files.
  [{ 'CLAUDE.local.md': BASE['CLAUDE.local.md'].replace('Old', 'New') }, null, unrecognised('CLAUDE.local.md')],
  [{ '.windsurf/rules/style.md': BASE['.windsurf/rules/style.md'].replace('Old', 'New') }, null, unrecognised('.windsurf/rules/style.md')],
  [{ '.clinerules/style.md': BASE['.clinerules/style.md'].replace('Old', 'New') }, null, unrecognised('.clinerules/style.md')],
  [{ '.kiro/steering/style.md': BASE['.kiro/steering/style.md'].replace('Old', 'New') }, null, unrecognised('.kiro/steering/style.md')],
  [{ 'CONVENTIONS.md': BASE['CONVENTIONS.md'].replace('Old', 'New') }, null, unrecognised('CONVENTIONS.md')],
  // A selector whose `{` is on the next line, or behind a comment.
  [{ 'src/styles/nextline.css': BASE['src/styles/nextline.css'].replace('#add', '#bad') }, null, unrecognised('src/styles/nextline.css')],
  [{ 'src/styles/commented.css': BASE['src/styles/commented.css'].replace('#add', '#bad') }, null, unrecognised('src/styles/commented.css')],
  // Code blocks, front matter as a JSON object, reference definitions, autolinks, Liquid tags,
  // reStructuredText code and include directives, and a workflow folder's Markdown.
  [{ 'docs/setup.md': BASE['docs/setup.md'].replace('requests', 'reqests') }, null, unrecognised('docs/setup.md')],
  [{ 'docs/indented.md': BASE['docs/indented.md'].replace('requests', 'reqests') }, null, unrecognised('docs/indented.md')],
  [{ 'docs/tilde.md': BASE['docs/tilde.md'].replace('requests', 'reqests') }, null, unrecognised('docs/tilde.md')],
  [{ 'docs/json-front.md': BASE['docs/json-front.md'].replace('Old', 'New') }, null, 'it changes a setting in docs/json-front.md, and settings changes are a common cause of outages'],
  [{ 'docs/ref.md': BASE['docs/ref.md'].replace('/guide', '/other') }, null, unrecognised('docs/ref.md')],
  [{ 'docs/auto.md': BASE['docs/auto.md'].replace('one.example', 'two.example') }, null, unrecognised('docs/auto.md')],
  [{ 'docs/liquid.md': BASE['docs/liquid.md'].replace('one.html', 'two.html') }, null, unrecognised('docs/liquid.md')],
  [{ '.github/workflows/README.md': BASE['.github/workflows/README.md'].replace('old', 'new') }, null, 'it changes how the project is built or shipped in .github/workflows/README.md'],
  // Attribute shapes: a character reference in a value, an unquoted value, Vue's `@click`
  // and `v-bind:`, and nested braces in a JSX handler.
  [{ 'src/pages/entity.html': BASE['src/pages/entity.html'].replace('a&gt;b', 'a&gt;c') }, null, unrecognised('src/pages/entity.html')],
  [{ 'src/pages/unquoted.html': BASE['src/pages/unquoted.html'].replace('/one', '/two') }, null, unrecognised('src/pages/unquoted.html')],
  // CTOC's own lists: sensitive words in the plural, the secret-file guard, the protected paths.
  [{ 'tokens.txt': lines('New note.') }, null, 'tokens.txt sits in an area named token, and such areas are never a hotfix'],
  [{ 'config/locales/secrets.yml': lines('title: New') }, null, 'config/locales/secrets.yml sits in an area named secret, and such areas are never a hotfix'],
  [{ 'messages/credentials.json': BASE['messages/credentials.json'].replace('Old', 'New') }, null, 'messages/credentials.json sits in an area named credential, and such areas are never a hotfix'],
  [{ 'src/payments/index.html': page('<p>New</p>') }, null, 'src/payments/index.html sits in an area named payment, and such areas are never a hotfix'],
  [{ 'docs/passwords.md': BASE['docs/passwords.md'].replace('Old', 'New') }, null, 'docs/passwords.md sits in an area named password, and such areas are never a hotfix'],
  [{ 'docs/id_rsa.md': BASE['docs/id_rsa.md'].replace('Old', 'New') }, null, 'docs/id_rsa.md sits in an area named secret, and such areas are never a hotfix'],
  // The commit security review (2026-10-09). Instruction files apply per folder, by class:
  // their names at any depth, and anything in a dot-folder (but `.github/` Markdown).
  [{ 'docs/sub/AGENTS.md': BASE['docs/sub/AGENTS.md'].replace('Old', 'New') }, null, unrecognised('docs/sub/AGENTS.md')],
  [{ 'pkg/CLAUDE.md': BASE['pkg/CLAUDE.md'].replace('Old', 'New') }, null, unrecognised('pkg/CLAUDE.md')],
  [{ '.foo/notes.md': BASE['.foo/notes.md'].replace('Old', 'New') }, null, unrecognised('.foo/notes.md')],
  [{ '.github/instructions/x.instructions.md': lines('New rules.') }, null, unrecognised('.github/instructions/x.instructions.md')],
  [{ 'prompts/review.prompt.md': lines('New prompt.') }, null, unrecognised('prompts/review.prompt.md')],
  [{ '.cursor/rules/a.mdc': lines('New rules.') }, null, unrecognised('.cursor/rules/a.mdc')],
  [{ 'rules.mdc': lines('New rules.') }, null, unrecognised('rules.mdc')],
  // reStructuredText roles: a role defined as raw HTML, and any text inside a role span.
  // The fourth round (2026-10-09). Text inside a component or a custom element is whatever
  // the component makes of it (a query, an action name), never wording, in every markup kind.
  [{ 'src/pages/widget.html': BASE['src/pages/widget.html'].replace('>x<', '>y<') }, null, unrecognised('src/pages/widget.html')],
  // A reference definition whose destination, or title, stands on the next line.
  [{ 'docs/wrapped-ref.md': BASE['docs/wrapped-ref.md'].replace('/u/profile', '/u/delete') }, null, unrecognised('docs/wrapped-ref.md')],
  [{ 'docs/wrapped-ref.md': BASE['docs/wrapped-ref.md'].replace('/u/profile', '//evil.example/x') }, null, unrecognised('docs/wrapped-ref.md')],
  [{ 'docs/wrapped-title.md': BASE['docs/wrapped-title.md'].replace('Old title', 'New title') }, null, unrecognised('docs/wrapped-title.md')],
  // A custom property or a Sass or Less variable is a setting a script or a build can read,
  // whatever colour it holds (the earlier qualifying shapes, now traps).
  [{ 'src/styles/flags.css': BASE['src/styles/flags.css'].replace('green', 'red') }, null, setting('src/styles/flags.css')],
  [{ 'src/styles/flags.css': BASE['src/styles/flags.css'].replace('--mode: red', '--mode: lime') }, null, setting('src/styles/flags.css')],
  [{ 'src/styles/custom.css': lines(':root {', '  --accent: blue;', '}') }, null, setting('src/styles/custom.css')],
  [{ 'src/styles/vars.css': lines(':root {', '  --brand: #fafafa;', '}') }, null, setting('src/styles/vars.css')],
  // reStructuredText literal blocks and doctest lines are code; so is every directive but
  // the prose ones, whose options are compared exactly.
  [{ 'notes/doctest.txt': BASE['notes/doctest.txt'].replace(/old$/m, 'new') }, null, unrecognised('notes/doctest.txt')],
  [{ 'docs/doctest.md': BASE['docs/doctest.md'].replace(/old$/m, 'new') }, null, unrecognised('docs/doctest.md')],
  // Text inside an HTML code element is code, in HTML and in Markdown's inline HTML.
  [{ 'docs/code-el.md': BASE['docs/code-el.md'].replace('requests', 'reqests') }, null, unrecognised('docs/code-el.md')],
  [{ 'src/pages/code-el.html': BASE['src/pages/code-el.html'].replace('requests', 'reqests') }, null, unrecognised('src/pages/code-el.html')],
  // A real indented code block inside a list item: four spaces beyond the content column.
  [{ 'docs/list-code.md': BASE['docs/list-code.md'].replace('requests', 'reqests') }, null, unrecognised('docs/list-code.md')],
  // A TypeScript generic arrow function is no element: the string after it is code.
  // The fifth round (2026-10-09), each trap an answer of `checking` on `6de2f75c`. Host
  // elements are a fixed list: an `is` attribute and an unknown name hold their text.
  [{ 'src/pages/is.html': BASE['src/pages/is.html'].replace('SELECT name FROM users', 'SELECT pass FROM admins') }, null, unrecognised('src/pages/is.html')],
  [{ 'src/pages/runsql.html': BASE['src/pages/runsql.html'].replace('SELECT name FROM users', 'SELECT pass FROM admins') }, null, unrecognised('src/pages/runsql.html')],
  // An end tag that does not close the element on top, while a holder is open, cannot be followed.
  [{ 'src/pages/stack.html': BASE['src/pages/stack.html'].replace('SELECT name FROM users', 'SELECT pass FROM admins') }, null, 'I could not read the change (src/pages/stack.html holds something I cannot follow)'],
  [{ 'docs/stack.md': BASE['docs/stack.md'].replace('SELECT name FROM users', 'SELECT pass FROM admins') }, null, 'I could not read the change (docs/stack.md holds something I cannot follow)'],
  // Markdown that may be built as MDX: a brace in the changed prose, an `import` line.
  [{ 'docs/mdx-brace.md': BASE['docs/mdx-brace.md'].replace('name', 'code') }, null, unrecognised('docs/mdx-brace.md')],
  [{ 'docs/mdx-import.md': BASE['docs/mdx-import.md'].replace('./chart', './other') }, null, unrecognised('docs/mdx-import.md')],
  // A lone backtick in one paragraph pairs with nothing in the next.
  [{ 'docs/tick-para.md': BASE['docs/tick-para.md'].replace('build', 'dist') }, null, unrecognised('docs/tick-para.md')],
  // A block quote is read like the document it quotes: indented code, a fence, a doctest,
  // and indented code under a list item.
  [{ 'docs/quote-code.md': BASE['docs/quote-code.md'].replace('requests', 'reqests') }, null, unrecognised('docs/quote-code.md')],
  [{ 'docs/quote-fence.md': BASE['docs/quote-fence.md'].replace('requests', 'reqests') }, null, unrecognised('docs/quote-fence.md')],
  [{ 'docs/quote-doctest.md': BASE['docs/quote-doctest.md'].replace(/old$/m, 'new') }, null, unrecognised('docs/quote-doctest.md')],
  [{ 'docs/quote-list.md': BASE['docs/quote-list.md'].replace('requests', 'reqests') }, null, unrecognised('docs/quote-list.md')],
  // Link labels fold case as CommonMark does: `[\u1e9e]` names the definition `[SS]`.
  [{ 'docs/fold.md': BASE['docs/fold.md'].replace('[guide]', '[\u1e9e]') }, null, unrecognised('docs/fold.md')],
  // `listing` and `tt` are code elements.
  [{ 'src/pages/listing.html': BASE['src/pages/listing.html'].replace('requests', 'reqests') }, null, unrecognised('src/pages/listing.html')],
  [{ 'src/pages/tt.html': BASE['src/pages/tt.html'].replace('requests', 'reqests') }, null, unrecognised('src/pages/tt.html')],
  // A sensitive word that is a stylesheet's own name still counts (its plural does not).
  [{ 'src/styles/login.css': BASE['src/styles/login.css'].replace('red', 'blue') }, null, 'src/styles/login.css sits in an area named login, and such areas are never a hotfix'],
  [{ 'src/styles/payment.css': BASE['src/styles/payment.css'].replace('red', 'blue') }, null, 'src/styles/payment.css sits in an area named payment, and such areas are never a hotfix'],
  // A custom property named for a colour that holds no colour, a second token, or a variable.
  [{ 'src/styles/color-mode.css': BASE['src/styles/color-mode.css'].replace('dark', 'light') }, null, setting('src/styles/color-mode.css')],
  [{ 'src/styles/two-tokens.css': BASE['src/styles/two-tokens.css'].replace('red', 'red url(x)') }, null, setting('src/styles/two-tokens.css')],
  [{ 'src/styles/var.css': BASE['src/styles/var.css'].replace('--b', '--c') }, null, setting('src/styles/var.css')]
];

// The owner's decision of 2026-10-09 (answer "a"): the hotfix check keeps only the formats
// it can read exactly, because five rounds of security attacks kept finding new ways to get
// a behaviour change committed as a hotfix, the last ones in Vue, MDX, reStructuredText and
// Less, where a hand-written reader disagrees with the real compiler. Every qualifying shape
// and every trap of a removed format (Vue, Svelte, JSX and TSX, MDX, reStructuredText, Sass
// and Less, gettext) is kept here, and each now asserts the "not recognised" refusal.
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

assert.equal(QUALIFY.length, 30, 'the corpus holds 30 shapes that qualify');
assert.equal(REMOVED_FORMATS.length, 42, 'the corpus holds 42 cases of removed formats');
assert.equal(TRAPS.length, 195, 'the corpus holds 195 traps, the removed formats among them');

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
const plain = (chars, why) => Object.fromEntries([...chars].map((c) => [c, () => why]));
const ALLOWED = {
  markup: plain('"\'()=:/\\#;*[]|_', 'plain punctuation in an element\'s visible text, shown as typed'),
  catalogue: {
    ...plain('\'()=:/#;*"[]|_&', 'punctuation inside a message value, shown as typed'),
    '\\': (v) => (/\\[tnrbf]/.test(v) ? 'a backslash that makes a tab, line break or other control character in the shown text'
      : 'a backslash before a letter in a .properties value, which the reader drops')
  },
  markdown: {
    // A brace is no longer named: Markdown may be built as MDX, where it starts an expression.
    ...plain('>"\'()=:/\\#;*|_', 'Markdown punctuation in prose: shown as typed or as emphasis, a heading, a quote or a table cell'),
    '<': (v, at) => (/[A-Za-z/!?]/.test(v[at + 1] || '') ? null : 'a < that starts no tag is shown as typed'),
    '[': () => 'a bracket that names no reference definition is shown as typed (link targets are compared exactly)',
    ']': () => 'a bracket that names no reference definition is shown as typed (link targets are compared exactly)',
    '`': () => 'a backtick that pairs with no other is shown as typed (code spans are compared exactly)',
    '&': (v, at) => (/^&(?:#\d+|#[xX][\da-fA-F]+|[A-Za-z][A-Za-z\d]*);/.test(v.slice(at)) ? null
      : 'an ampersand that starts no character reference is shown as typed')
  },
  text: plain('<>"\'{}()=:/\\#;*[]&`|_', 'any punctuation in a plain-text paragraph is shown as typed'),
  colour: {}
};
const kindOf = (rel) => {
  const ext = path.extname(rel).toLowerCase();
  if (['.html', '.htm'].includes(ext)) return 'markup';
  if (['.json', '.yaml', '.yml', '.properties'].includes(ext)) return 'catalogue';
  if (ext === '.css') return 'colour';
  return ext === '.md' ? 'markdown' : 'text';
};

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
// side of every qualifying shape, cut short at every point, refuses, unless the cut lands in
// plain visible text at the very end with every construct before it closed. The changed
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

/** Whether a cut text ends in plain visible text with every construct before it closed. */
function closedAtEnd(kind, cut) {
  const lines = cut.split('\n');
  const tail = lines[lines.length - 1] === '' ? (lines[lines.length - 2] || '') : lines[lines.length - 1];
  const even = (t, c) => t.split(c).length % 2 === 1;
  const balanced = (t, o, c) => t.split(o).length === t.split(c).length;
  if (cut.trim() === '') return false; // an emptied file is no wording edit
  if (kind === 'text') return true;
  if (kind === 'catalogue') return even(tail, '"') && !/^\s*[{}[\]]?\s*$/.test(tail) && /[:=]/.test(tail);
  if (kind === 'markdown') {
    const fences = lines.filter((l) => /^\s*(```|~~~)/.test(l)).length;
    const front = lines[0] === '---' && !lines.slice(1).some((l) => l === '---');
    return fences % 2 === 0 && !front && even(tail, '`') && !tail.includes('<') && !tail.includes('{{')
      && balanced(tail, '[', ']') && balanced(tail, '(', ')');
  }
  return false; // markup, JSX and stylesheets: a cut always leaves a tag, element or block open
}

test('property: a qualifying file cut short at any point refuses, unless the cut lands in closed plain text at the very end', (t) => {
  let cuts = 0;
  let passes = 0;
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
        if (ruleRefusal(change)) continue;
        passes++;
        assert.ok(closedAtEnd(kindOf(rel), cut), `${rel} cut at ${at} passed: ${JSON.stringify(cut.slice(-40))}`);
      }
    }
  }
  t.diagnostic(`${cuts} cuts, ${passes} pass, each in closed plain text at the very end`);
});

// Each scanner moves forward only. Inputs built to make a backtracking or rescanning
// scanner quadratic are judged in well under a quarter of a second (a quadratic scan of
// these 100,000 to 400,000 characters takes seconds).
test('the whole-file scanners stay linear on input built against them', () => {
  const cases = {
    'docs/brackets.md': `${'['.repeat(400000)}]\nOld words.\n`,
    'docs/ticks.md': `${Array.from({ length: 450 }, (_, i) => `${'`'.repeat(i + 1)} x `).join('')}\nOld words.\n`,
    'docs/targets.md': `${']('.repeat(50000)}\nOld words.\n`,
    'docs/blocks.md': `Old words.\n${'    code\n\n'.repeat(30000)}`,
    'docs/raws.rst': `Old words.\n${'.. raw:: html\n'.repeat(30000)}`,
    'src/pages/quotes.html': `<p>Old</p>\n${'<a b="'.repeat(20000)}\n`,
    'src/pages/escapes.html': `<p>Old</p>\n${'<script><!--'.repeat(20000)}\n`,
    'src/components/Braces.jsx': `export const P = () => <p>Old</p>;\n${'{'.repeat(100000)}\n`,
    'src/components/Tags.jsx': `export const P = () => <p>Old</p>;\n${'x = <a>'.repeat(20000)}\n`,
    'src/components/Nest.vue': `<template>\n<p>Old</p>\n${'<template>'.repeat(30000)}\n</template>\n`,
    'src/styles/urls.css': `a { color: red; }\n${'url('.repeat(50000)}\n`,
    // The fourth round's scanners: nested list items, literal blocks, wrapped reference
    // definitions, reference words, prose directive options, type parameter lists,
    // components and variable declarations.
    'docs/lists.md': `Old words.\n${'- a\n  - b\n    - c\n'.repeat(20000)}`,
    'docs/literals.rst': `Old words.\n${'Run::\n\n   code\n'.repeat(30000)}`,
    'docs/defs.md': `Old words.\n${'[a]:\n\n\n'.repeat(30000)}`,
    'docs/refs.rst': `Old words.\nx${')'.repeat(200000)}a\n`,
    'docs/options.rst': `Old words.\n.. note::\n${'   :class: x\n'.repeat(30000)}`,
    'src/components/Params.tsx': `export const P = () => <p>Old</p>;\n${'x = <T extends A<'.repeat(20000)}\n`,
    'src/components/Holds.vue': `<template>\n<p>Old</p>\n${'<MyThing>'.repeat(30000)}\n</template>\n`,
    'src/styles/vars.scss': `a { color: red; }\n${'$a: b;'.repeat(50000)}\n`,
    // Every scanner fails closed: catalogue line states over many open quotes and blocks.
    'i18n/states.yaml': `title: Old\n${'a: "x\n  b: |\n'.repeat(30000)}`,
    // The fifth round's scanners: a deep stack of open elements closed by end tags of other
    // names, with and without a holder open; deeply nested and very long block quotes; many
    // paragraphs of backticks; many custom properties.
    'src/pages/stack.html': `<p>Old</p>\n${'<a>'.repeat(30000)}${'</b>'.repeat(30000)}\n`,
    'src/pages/held.html': `<p>Old</p>\n<x-y>${'<a>'.repeat(30000)}${'</b>'.repeat(30000)}\n`,
    'src/pages/names.html': `<p>Old</p>\n${Array.from({ length: 20000 }, (_, i) => `<a${i}>`).join('')}${'</b></a0>'.repeat(20000)}\n`,
    'docs/quotes.md': `Old words.\n\n${'> '.repeat(40000)}x\n`,
    'docs/quoted.md': `Old words.\n\n${'> > > a \\` b\n'.repeat(30000)}`,
    'docs/paragraphs.md': `Old words.\n\n${'a ` b | c\n\n- d ` e\n'.repeat(30000)}`,
    'docs/items.md': `Old words.\n\n${'- > - > - a\n'.repeat(20000)}`,
    'docs/markers.md': `Old words.\n\n${'- '.repeat(40000)}a\n`,
    'src/styles/properties.css': `a { color: red; }\n:root {${'--color-a: red;'.repeat(50000)}}\n`
  };
  for (const [rel, old] of Object.entries(cases)) {
    const changed = /\.s?css$/.test(rel) ? old.replace('red', 'blue') : old.replace('Old', 'New');
    const start = process.cpuUsage();
    const refused = ruleRefusal(changeOf(rel, old, changed));
    // The inputs of the removed formats are kept: each is refused as not recognised, at once.
    if (/\.(?:rst|jsx|tsx|vue|scss)$/.test(rel)) assert.equal(refused.cause, 'unrecognised', rel);
    const used = process.cpuUsage(start);
    const ms = (used.user + used.system) / 1000;
    assert.ok(ms < 250, `${rel}: ${old.length} characters took ${ms.toFixed(1)} ms`);
  }
});

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
