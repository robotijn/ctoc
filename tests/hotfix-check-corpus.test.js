'use strict';

// The classifier corpus: edit shapes that qualify as a hotfix and traps that must not (44 of
// them the kept cases of the formats the owner's decision of 2026-10-09 removed), plus one
// mode change, each judged through the menu router's first call (rules 1 to 7; no test runs)
// against ONE committed temporary repository with no test command. The counts are asserted
// below the tables. A qualifying shape ends at `verdict: 'checking'`: rules 1 to 7 held.
//
// MARKDOWN AND PLAIN TEXT (the decision at review of 2026-10-09, under the owner's decision
// that the check keeps only what it can read exactly). Markdown is not one language: a
// security run pushed 249,644 edits the check passed through other renderers, and thousands
// changed a link, an attribute or code under at least one. So a `.md` or `.txt` edit
// qualifies only as a wording change in pure prose: plain prose lines in a paragraph bounded
// by empty lines, outside front matter, code fences and whatever follows raw HTML, with
// nothing else in the file changed. Every row below that relied on structure (a heading, a
// list, a link, a code span, a table, a quote, inline HTML, front matter) is kept and now
// asserts the refusal `inexact`; a `.txt` qualifies only under a documentation name.
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
  // The review of 2026-10-09: the corpus itself holds an indented Sass file, a gettext file
  // under `locales/` and a `<math>` trap.
  'src/styles/indented.sass': lines('.save', '  color: #0a58ca'),
  'locales/de.po': lines('msgid "Save"', 'msgstr "Speichern"'),
  'src/pages/formula.html': page('<p>Area</p><math><mtext>Save</mtext></math>'),
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
  'locales/en/keys.json': lines('{', '  "save": "Save",', '  "cancel": "Cancel"', '}'),
  'locales/en/count.json': lines('{', '  "save": "Save {count} items",', '  "cancel": "Cancel"', '}'),
  'locales/en/promo.json': lines('{', '  "promo": "Save now",', '  "cancel": "Cancel"', '}'),
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
  'locales/en/flags.yml': lines('beta: true'),
  'locales/en/flags.properties': lines('beta=true'),
  'locales/en/links.json': lines('{', '  "help": "/help"', '}'),
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
  'config/locales/en/secrets.yml': lines('title: Old'),
  'messages/en/credentials.json': lines('{', '  "title": "Old"', '}'),
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
  'src/styles/button-colour.css': lines(':root {', '  --button-colour: red;', '}'),
  // The sixth round (2026-10-09): the strict HTML subset, Markdown headings, autolinks and
  // paragraphs, folded and camel-case paths, and the functional plan's sentence for a change
  // the check cannot read exactly.
  'src/pages/brace-tag.html': page('<button { is="run-sql" }>SELECT name FROM users</button>'),
  'src/pages/brace-el.html': page('{<run-sql>}<span>SELECT name FROM users</span></run-sql>'),
  'src/pages/brace-script.html': page('{<script>/*}<b></b>*/ run() /*<b></b>*/</script>'),
  'src/pages/comment-abrupt.html': page('<!--><run-sql>--><span>SELECT name FROM users</span></run-sql>'),
  'src/pages/svg-pre.html': page('<svg><style><pre></style><span>pip install requests</span></pre></svg>'),
  'src/pages/unknown.html': page('<unknown>Save</unknown>'),
  'src/pages/svg-text.html': page('<svg><text>Save</text></svg>'),
  'src/pages/card.html': page('<my-card>Save</my-card>'),
  'src/pages/open-div.html': '<!doctype html>\n<div>\n<p>Save</p>\n',
  'src/styles/border.css': lines('.save { border: 1px solid #0a58ca; }'),
  'docs/heading-import.md': lines('# Title', "import Chart from './chart'"),
  'docs/autolink.md': lines('See <https://example.org/guide> first.', '', 'Old words here.'),
  'docs/heading.md': lines('# Install', '', 'Words.'),
  'docs/heading-caps.md': lines('# instal the App', '', 'Words.'),
  'docs/mdx-far.md': lines('Hello {name} there.', '', 'Old words.'),
  '\uff21\uff35\uff34\uff28/index.html': page('<p>Save</p>'),
  'src/pages/AuthPanel.html': page('<p>Save</p>'),
  'src/pages/paymentForm.html': page('<p>Save</p>'),
  'src/pages/Author.html': page('<p>Save</p>'),
  // The eighth round (the decision at review of 2026-10-09): Markdown and plain text as pure
  // prose. Shapes that qualify.
  'CHANGES.txt': lines('The old wording of the first release.'),
  'docs/readme.en.txt': lines('Read the old guide first.', '', 'Then start the tool.'),
  'docs/plain.md': lines('# Guide', '', 'The \u201cold\u201d way is well-known \u2014 use it; it works,', 'and it\'s safe\u2026', '', 'Wait 30 days.'),
  'docs/lint.md': lines('<!-- markdownlint-disable -->', '', 'Old words here.'),
  'docs/span-tag.md': lines('Use `<div>` and ``a ` <b>`` here.', '', 'Old words here.'),
  'docs/fence-tag.md': lines('```html', '<div>x</div>', '```', '', 'Old words here.'),
  'docs/fence-open-tag.md': lines('```', '<div>', '```', '', 'Old words here.'),
  'src/pages/lead-comment.html': '<!-- Draft -->\n<!DOCTYPE html>\n<p>Save</p>\n',
  'docs/eleven.md': lines(...Array.from({ length: 11 }, (_, i) => `Eleven old line ${String.fromCharCode(97 + i)}.`)),
  // Traps: every finding of the Markdown security run, and what the differential test found.
  'docs/md-in-html.md': lines('<div markdown="1">', '', 'Read the guide first.', '', '</div>'),
  'deps.txt': lines('requests'),
  'templates/email/welcome.txt': lines('Hello {name}, welcome.'),
  'exclude.txt': lines('build', 'cache'),
  'cmake/options.txt': lines('option(FAST ON)'),
  'docs/deep-tab.md': lines('>> > \tamet word'),
  'docs/fence-nbsp.md': lines('```', 'pip install requests', '```\u00a0', '', 'Run it now.', '', '```'),
  'docs/list-marker.md': lines('-   Install:', '', '        pip install requests'),
  'docs/half-link.md': lines('Read docs](guide/setup) first.'),
  'docs/def-under.md': lines('See teh guide', '[g]: guide/intro'),
  'docs/domain.md': lines('Visit exmaple.com today.'),
  'docs/file-name.md': lines('Read README.md first.'),
  'docs/front-js.md': lines('---js', '{ title: "Old" }', '', 'A plain old line inside', '', '---', '', 'Body text.'),
  'docs/mid-meta.md': lines('Intro text.', '', '---', 'theme: dark', '', 'A plain old line inside', '', '---', '', 'Body text.'),
  'docs/template-key.md': lines('Template: main', '', 'Body text.'),
  'docs/cell-span.md': lines('| a | b |', '| - | - |', '| `x | y` | z |'),
  'docs/bienvenue.md': lines('## Bienvenue !', '', 'Body text.'),
  'docs/task.md': lines('- [ ] Write the guide'),
  'docs/alert.md': lines('> [!NOTE]', '> Read this first.'),
  'docs/container.md': lines('::: tip', 'Use the old way', ':::'),
  'docs/admonition.md': lines('!!! note', '    Use the old way'),
  'docs/wiki.md': lines('See [[Install guide]] first.'),
  'docs/bom-code.md': '\uFEFF    pip install requests\n',
  'docs/escaped-script.md': lines('Use \\<script> tags.', '', 'Old words here.'),
  'LICENCE.txt': lines('Permission is granted to use the old tool.'),
  'LICENSE.md': lines('Permission is granted to use the old tool.'),
  'NOTICE.md': lines('This product holds old parts.'),
  'docs/COPYING.txt': lines('You may copy the old tool.'),
  'PATENTS.md': lines('The old grant of patents.'),
  'docs/legal-notes.txt': lines('The old terms apply.'),
  'docs/under-list.md': lines('- Install the tool', 'Run it then'),
  'docs/above-rule.md': lines('Install the old tool', '==='),
  'docs/item-para.md': lines('- Step one.', '', '  Old words here.'),
  'docs/wrapped-div.md': lines('<div>', '', 'Old words here.', '', '</div>'),
  'docs/component.md': lines('<run-sql>', '', 'Select name from users', '', '</run-sql>'),
  'docs/cut-comment.md': lines('> <!-- a', '', '-->', '', 'Old words here.'),
  'docs/lone-return.md': 'x\r```\n\nOld words here.\n',
  'docs/item-fence-out.md': lines('1. Step', '', '   ```', 'code', '   ```', '', 'Old words here.'),
  'docs/long-closer.md': lines('```', 'code', '````', '', 'Old words here.', '', '```'),
  'docs/def-fence.md': lines('[ref]:', '```', 'code', '```', '', 'Old words here.'),
  'docs/two-word-info.md': lines('``` foo bar', 'code', '```', '', 'Old words here.', '', '```'),
  'docs/letter-marker.md': lines('a. Old words here.'),
  'docs/commit-id.md': lines('The fix landed in abcdefa last week.'),
  'docs/endings.md': lines('Old words here.', 'More words.'),
  'docs/trailing.md': lines('Old words here.  ', 'More words.'),
  'docs/abbreviation.md': lines('Use the old way, e.g. the short one.'),
  'docs/colon.md': lines('Note: the old way works.'),
  'docs/brackets.md': lines('The old way (the short one) works.'),
  'docs/fence-script.md': lines('```html', '<script>', '```', '', 'Old words here.'),
  'CHANGELOG.txt': lines('- Fixed the old bug'),
  'docs/tokens.md': lines('# Help', '', 'Old notes.'),
  // The ninth round (decisions at review of 2026-10-09): a raw start tag anywhere, and the
  // pure-prose rule widened by a colon, parentheses and list items.
  'docs/comment-below.md': lines('Old words here.', '', '<!-- a note -->'),
  'docs/script-span.md': lines('Use `<script>` tags.', '', 'Old words here.'),
  'docs/colon-later.md': lines('# Notes', '', 'Note: the old way works, and so does this: the short one.'),
  'docs/steps.md': lines('# Steps', '', '1. Open the old page.', '2. Press the button (the blue one).', '   Then wait.'),
  'docs/steps-code.md': lines('- Run `npm test` first.', '- Then read the old notes.'),
  'docs/key-value.md': lines('Title: The old guide', '', 'Body text.'),
  // Catalogue files: the brief's traps and qualifying shapes.
  'packages/i18n/package.json': lines('{', '  "name": "i18n",', '  "description": "Old texts"', '}'),
  'locales/package.json': lines('{', '  "name": "locales",', '  "scripts": {', '    "test": "node run tests"', '  }', '}'),
  'messages/docker-compose.yml': lines('services:', '  web:', '    image: app'),
  'translations/pnpm-lock.yaml': lines('lockfileVersion: old'),
  'i18n/tsconfig.json': lines('{', '  "compilerOptions": {', '    "module": "commonjs"', '  }', '}'),
  'messages/application.properties': lines('spring.profiles.active=dev'),
  'i18n/routes.json': lines('{', '  "home": "Start"', '}'),
  'locales/de/common.json': lines('{', '  "title": "Old title",', '  "days": [', '    "one day",', '    "many days"', '  ]', '}'),
  'i18n/messages_fr.properties': lines('# Les messages', 'bouton.sauver = Enregistrer', 'titre : Accueil'),
  'config/locales/de.yml': lines('---', 'de:', '  greeting: Hallo Welt', '  days:', '    - Montag', '    - Dienstag'),
  'locales/en/duplicate.json': lines('{', '  "save": "Save",', '  "save": "Keep"', '}'),
  'locales/en/tagged.yml': lines('desc: !!str |', '  save: Save'),
  'locales/en/escaped.properties': lines('a\\=b=value'),
  'locales/en/host.json': lines('{', '  "help": "See account.example.com"', '}'),
  'locales/en/named.yml': lines('hello: Hello :name'),
  'locales/en/ordered.json': lines('{', '  "of": "%s of %d"', '}'),
  'locales/en/override.json': lines('{', '  "save": "Save"', '}'),
  'locales/en/marked.yml': lines('title: Old'),
  'src/styles/endings.css': lines('a { color: red; }', 'b { margin: 0; }')
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
  ['docs/intro.md', '# Intro\r\n\r\nThe intro says welcome.\r\n'],
  // 20 changed lines in one file: ten lines reworded, the size limit exactly.
  ['docs/long.md', BASE['docs/long.md'].replace(/Old long line ([a-j])\./g, 'New long line $1.')],
  // 6 changed lines in 3 files: the file limit exactly.
  [{ 'notes/a.md': lines('Alpha new.'), 'notes/b.md': lines('Bravo new.'), 'notes/c.md': lines('Charlie new.') }],
  // The text of an option with a `value` attribute is wording; the value is what is sent.
  ['src/pages/size-pick.html', page('<select><option value="m">Middle</option></select>')],
  // The third round (2026-10-09). Markdown under `.github/` is documentation again.
  ['.github/CONTRIBUTING.md', lines('# Contributing', '', 'Open a discussion first.')],
  // A tag whose attributes run over two lines: the whole-file scanner still sees the text.
  ['src/pages/wrapped.html', page(lines('<button', '  class="x">Store</button>').trimEnd())],
  // Prose beside a fenced code block that stays the same.
  ['docs/fenced-ok.md', lines('# Setup', '', 'Run the new installer.', '', '```sh', 'pip install requests', '```')],
  // The commit security review: an issue template under `.github/`.
  ['.github/ISSUE_TEMPLATE/bug.md', lines('Describe the new bug.')],
  // The fourth round (2026-10-09). A title is wording; a design-token stylesheet with a real
  // colour property; a React project's `src/hooks/` notes (CTOC's enforcement list is CTOC's
  // own, and this repository is not CTOC).
  ['src/pages/titled.html', BASE['src/pages/titled.html'].replace('Save', 'Store')],
  ['src/styles/tokens.css', BASE['src/styles/tokens.css'].replace('#0a58ca', '#0b5ed7')],
  ['src/hooks/README.md', BASE['src/hooks/README.md'].replace('Old', 'New')],
  // The fifth round (2026-10-09). An element name is matched in any letter case; a custom
  // property named for a colour, holding exactly one colour before and after, is a colour
  // (the session's decision on the owner's instruction).
  ['src/pages/mixed.html', page('<DIV>Store</div>')],
  ['src/styles/color-brand.css', BASE['src/styles/color-brand.css'].replace('#0b5ed7', '#1a73e8')],
  ['src/styles/button-colour.css', BASE['src/styles/button-colour.css'].replace('red', 'blue')],
  // The sixth round (2026-10-09). A brace in one paragraph and a typo in a later one;
  // `Author` is not `auth`.
  ['docs/mdx-far.md', BASE['docs/mdx-far.md'].replace('Old', 'New')],
  ['src/pages/Author.html', BASE['src/pages/Author.html'].replace('Save', 'Store')],
  // The seventh round (the decision at review of 2026-10-09). Two false refusals let go, the
  // differential test at zero disagreements: text that runs over several lines of one text
  // node, and a plain character reference (`&amp;`) in the changed sentence. Both were traps.
  ['src/pages/multiline.html', BASE['src/pages/multiline.html'].replace('Save your work', 'Store your work')],
  ['src/pages/rules.html', page('<p>Terms &amp; conditions</p>')],
  // The eighth round (the decision at review of 2026-10-09): a typo in a plain paragraph
  // qualifies. Plain text under a documentation name, also with a language part; a paragraph
  // with typographic quotes, a dash, a hyphenated word, an apostrophe and an ellipsis; a
  // paragraph below a comment that opens and closes on its own line, and below a tag written
  // inside a code span.
  ['CHANGES.txt', lines('The new wording of the first release.')],
  ['docs/readme.en.txt', BASE['docs/readme.en.txt'].replace('old', 'new')],
  ['docs/plain.md', BASE['docs/plain.md'].replace('well-known', 'well-liked')],
  ['docs/span-tag.md', BASE['docs/span-tag.md'].replace('Old', 'New')],
  // The ninth round (decisions at review of 2026-10-09), each a refusal on `4212d9ff`:
  // parentheses, a list item whose text is plain prose (in a documentation text file too), a
  // plain line right under a list item, a colon after a word outside the first paragraph, and
  // a numbered step with a second line.
  ['docs/brackets.md', BASE['docs/brackets.md'].replace('old', 'new')],
  ['CHANGELOG.txt', lines('- Fixed the new bug')],
  ['docs/under-list.md', BASE['docs/under-list.md'].replace('Run it then', 'Run it now')],
  ['docs/colon-later.md', BASE['docs/colon-later.md'].replace('old', 'new')],
  ['docs/steps.md', BASE['docs/steps.md'].replace('old', 'new')],
  // Catalogue files (the ninth round): a language tag as a folder, with a string in a list; a
  // wording bundle with its tag; a YAML file with nested keys and a list.
  ['locales/de/common.json', BASE['locales/de/common.json'].replace('many days', 'several days')],
  ['i18n/messages_fr.properties', BASE['i18n/messages_fr.properties'].replace('Accueil', 'Bienvenue')],
  ['config/locales/de.yml', BASE['config/locales/de.yml'].replace('Montag', 'Mondtag')]
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
  // Text that moves across a tag: one text node gains words and the next is emptied.
  [{ 'src/pages/crossing.html': page('<b>Save now</b>') }, null, unrecognised('src/pages/crossing.html')],
  // A character reference that is none of the plain ones may spell a digit, a price or an address.
  [{ 'src/pages/rules.html': page('<p>Terms &commat; rules</p>') }, null, unrecognised('src/pages/rules.html')],
  [{ 'locales/en/keys.json': BASE['locales/en/keys.json'].replace('"save":', '"store":') }, null, unrecognised('locales/en/keys.json')],
  [{ 'locales/en/count.json': BASE['locales/en/count.json'].replace('{count}', '{total}') }, null, unrecognised('locales/en/count.json')],
  [{ 'locales/en/promo.json': BASE['locales/en/promo.json'].replace('"Save now"', '"Save 5 euro now"') }, null, riskMarker('locales/en/promo.json')],
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
  // 21 changed lines in one file, 11 removed and 10 added. The eighth round's reader refuses a
  // Markdown file that gains or loses a line and answered before the size rule; since the ninth
  // round (the decision at review of 2026-10-09) the size rule runs before any reader reads a
  // file's content, so this change gets the size clause again.
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
  // Catalogue values that are not wording. (Since the ninth round a file is a catalogue only
  // under a language tag or a wording bundle's name, so the catalogue files of this corpus
  // whose names were neither moved into a language folder, `en/`.)
  [{ 'locales/en/flags.yml': lines('beta: false') }, null, unrecognised('locales/en/flags.yml')],
  [{ 'locales/en/flags.properties': lines('beta=false') }, null, unrecognised('locales/en/flags.properties')],
  [{ 'locales/en/links.json': lines('{', '  "help": "javascript:fetch(document.cookie)"', '}') }, null, unrecognised('locales/en/links.json')],
  [{ 'config/locales/en.yml': BASE['config/locales/en.yml'].replace('"."', '","') }, null, unrecognised('config/locales/en.yml')],
  // Documentation: a changed web address, e-mail address or number; a script; front matter;
  // the instruction files of other assistants; a release note that ships with the build.
  // Since the eighth round the first five are no plain prose (an address, a number with a
  // full stop inside it, a tag, front matter) and get the functional plan's sentence; rule 6
  // still reads the changed words of plain prose (`docs/plain.md`, `docs/commit-id.md` below).
  [{ 'docs/install.md': BASE['docs/install.md'].replace('get.example.org', 'get.evil.org') }, null, inexact('docs/install.md')],
  [{ 'SECURITY.md': BASE['SECURITY.md'].replace('example.org', 'evil.org') }, null, inexact('SECURITY.md')],
  [{ 'docs/release.md': lines('Install version 2.3.2 of the tool.') }, null, inexact('docs/release.md')],
  [{ 'docs/widget.md': BASE['docs/widget.md'].replace('"old"', '"new"') }, null, inexact('docs/widget.md')],
  [{ 'docs/post.md': BASE['docs/post.md'].replace('layout: post', 'layout: raw') }, null, inexact('docs/post.md')],
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
  [{ 'src/pages/status-pick.html': BASE['src/pages/status-pick.html'].replace('Pending', 'Approved') }, null, inexact('src/pages/status-pick.html')],
  // Catalogue values read as a browser reads an address: escapes decoded, tabs removed.
  // (An escaped slash is no form JSON.stringify writes: since the ninth round the file "holds
  // something I cannot follow" before its value is read as an address.)
  [{ 'locales/far.json': BASE['locales/far.json'].replace('"Help"', '"\\/\\/other.example\\/go"') }, null, 'I could not read the change (locales/far.json holds something I cannot follow)'],
  [{ 'locales/far.json': BASE['locales/far.json'].replace('"Help"', '"java\\tscript:go()"') }, null, unrecognised('locales/far.json')],
  [{ 'locales/far.json': BASE['locales/far.json'].replace('"Help"', '"\\tjavascript:go()"') }, null, unrecognised('locales/far.json')],
  [{ 'locales/far.json': BASE['locales/far.json'].replace('"Help"', '"\\\\\\\\evil"') }, null, unrecognised('locales/far.json')],
  [{ 'lang/far.properties': lines('link=java\\script:go()') }, null, unrecognised('lang/far.properties')],
  // Markdown: inline HTML, link targets, template braces, code, front matter.
  [{ 'docs/click.md': BASE['docs/click.md'].replace("'one'", "'two'") }, null, inexact('docs/click.md')],
  [{ 'docs/js-link.md': BASE['docs/js-link.md'].replace('go()', 'stop()') }, null, inexact('docs/js-link.md')],
  [{ 'docs/tpl.md': BASE['docs/tpl.md'].replace('one()', 'two()') }, null, inexact('docs/tpl.md')],
  [{ 'content/post.md': BASE['content/post.md'].replace('false', 'true') }, null, inexact('content/post.md')],
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
  // and a workflow folder's Markdown.
  [{ 'docs/setup.md': BASE['docs/setup.md'].replace('requests', 'reqests') }, null, inexact('docs/setup.md')],
  [{ 'docs/indented.md': BASE['docs/indented.md'].replace('requests', 'reqests') }, null, inexact('docs/indented.md')],
  [{ 'docs/tilde.md': BASE['docs/tilde.md'].replace('requests', 'reqests') }, null, inexact('docs/tilde.md')],
  [{ 'docs/json-front.md': BASE['docs/json-front.md'].replace('Old', 'New') }, null, inexact('docs/json-front.md')],
  [{ 'docs/ref.md': BASE['docs/ref.md'].replace('/guide', '/other') }, null, inexact('docs/ref.md')],
  [{ 'docs/auto.md': BASE['docs/auto.md'].replace('one.example', 'two.example') }, null, inexact('docs/auto.md')],
  [{ 'docs/liquid.md': BASE['docs/liquid.md'].replace('one.html', 'two.html') }, null, inexact('docs/liquid.md')],
  [{ '.github/workflows/README.md': BASE['.github/workflows/README.md'].replace('old', 'new') }, null, 'it changes how the project is built or shipped in .github/workflows/README.md'],
  // Attribute shapes: a character reference in a value, an unquoted value.
  [{ 'src/pages/entity.html': BASE['src/pages/entity.html'].replace('a&gt;b', 'a&gt;c') }, null, unrecognised('src/pages/entity.html')],
  [{ 'src/pages/unquoted.html': BASE['src/pages/unquoted.html'].replace('/one', '/two') }, null, unrecognised('src/pages/unquoted.html')],
  // CTOC's own lists: sensitive words in the plural, the secret-file guard, the protected paths.
  // Since the eighth round `tokens.txt` carries no documentation name, so rule 4 refuses it
  // before rule 5 reads its name; `docs/tokens.md` below keeps the plural word pinned.
  [{ 'tokens.txt': lines('New note.') }, null, unrecognised('tokens.txt')],
  [{ 'config/locales/en/secrets.yml': lines('title: New') }, null, 'config/locales/en/secrets.yml sits in an area named secret, and such areas are never a hotfix'],
  [{ 'messages/en/credentials.json': BASE['messages/en/credentials.json'].replace('Old', 'New') }, null, 'messages/en/credentials.json sits in an area named credential, and such areas are never a hotfix'],
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
  // The fourth round (2026-10-09). Text inside a component or a custom element is whatever
  // the component makes of it (a query, an action name), never wording.
  [{ 'src/pages/widget.html': BASE['src/pages/widget.html'].replace('>x<', '>y<') }, null, inexact('src/pages/widget.html')],
  // A reference definition whose destination, or title, stands on the next line.
  // Since the review of 2026-10-09 a definition whose destination or title stands on a line
  // of its own is outside what the check reads exactly: the plan's clause, on the same refusal.
  [{ 'docs/wrapped-ref.md': BASE['docs/wrapped-ref.md'].replace('/u/profile', '/u/delete') }, null, inexact('docs/wrapped-ref.md')],
  [{ 'docs/wrapped-ref.md': BASE['docs/wrapped-ref.md'].replace('/u/profile', '//evil.example/x') }, null, inexact('docs/wrapped-ref.md')],
  [{ 'docs/wrapped-title.md': BASE['docs/wrapped-title.md'].replace('Old title', 'New title') }, null, inexact('docs/wrapped-title.md')],
  // A custom property that is not named for a colour is a setting a script can read,
  // whatever colour it holds (the earlier qualifying shapes, now traps).
  [{ 'src/styles/flags.css': BASE['src/styles/flags.css'].replace('green', 'red') }, null, setting('src/styles/flags.css')],
  [{ 'src/styles/flags.css': BASE['src/styles/flags.css'].replace('--mode: red', '--mode: lime') }, null, setting('src/styles/flags.css')],
  [{ 'src/styles/custom.css': lines(':root {', '  --accent: blue;', '}') }, null, setting('src/styles/custom.css')],
  [{ 'src/styles/vars.css': lines(':root {', '  --brand: #fafafa;', '}') }, null, setting('src/styles/vars.css')],
  // Doctest lines are code, in plain text and in Markdown. Since the eighth round the `.txt`
  // file carries no documentation name, and the Markdown line is no plain prose.
  [{ 'notes/doctest.txt': BASE['notes/doctest.txt'].replace(/old$/m, 'new') }, null, unrecognised('notes/doctest.txt')],
  [{ 'docs/doctest.md': BASE['docs/doctest.md'].replace(/old$/m, 'new') }, null, inexact('docs/doctest.md')],
  // Text inside an HTML code element is code, in HTML and in Markdown's inline HTML.
  [{ 'docs/code-el.md': BASE['docs/code-el.md'].replace('requests', 'reqests') }, null, inexact('docs/code-el.md')],
  [{ 'src/pages/code-el.html': BASE['src/pages/code-el.html'].replace('requests', 'reqests') }, null, unrecognised('src/pages/code-el.html')],
  // A real indented code block inside a list item: four spaces beyond the content column.
  [{ 'docs/list-code.md': BASE['docs/list-code.md'].replace('requests', 'reqests') }, null, inexact('docs/list-code.md')],
  // The fifth round (2026-10-09), each trap an answer of `checking` on `6de2f75c`. Host
  // elements are a fixed list: an `is` attribute and an unknown name hold their text.
  [{ 'src/pages/is.html': BASE['src/pages/is.html'].replace('SELECT name FROM users', 'SELECT pass FROM admins') }, null, inexact('src/pages/is.html')],
  [{ 'src/pages/runsql.html': BASE['src/pages/runsql.html'].replace('SELECT name FROM users', 'SELECT pass FROM admins') }, null, inexact('src/pages/runsql.html')],
  // An end tag that does not close the element on top, while a holder is open, cannot be followed.
  [{ 'src/pages/stack.html': BASE['src/pages/stack.html'].replace('SELECT name FROM users', 'SELECT pass FROM admins') }, null, inexact('src/pages/stack.html')],
  [{ 'docs/stack.md': BASE['docs/stack.md'].replace('SELECT name FROM users', 'SELECT pass FROM admins') }, null, inexact('docs/stack.md')],
  // Markdown that may be built as MDX: a brace in the changed prose, an `import` line.
  [{ 'docs/mdx-brace.md': BASE['docs/mdx-brace.md'].replace('name', 'code') }, null, inexact('docs/mdx-brace.md')],
  [{ 'docs/mdx-import.md': BASE['docs/mdx-import.md'].replace('./chart', './other') }, null, inexact('docs/mdx-import.md')],
  // A lone backtick in one paragraph pairs with nothing in the next.
  [{ 'docs/tick-para.md': BASE['docs/tick-para.md'].replace('build', 'dist') }, null, inexact('docs/tick-para.md')],
  // A block quote is read like the document it quotes: indented code, a fence, a doctest,
  // and indented code under a list item.
  [{ 'docs/quote-code.md': BASE['docs/quote-code.md'].replace('requests', 'reqests') }, null, inexact('docs/quote-code.md')],
  [{ 'docs/quote-fence.md': BASE['docs/quote-fence.md'].replace('requests', 'reqests') }, null, inexact('docs/quote-fence.md')],
  [{ 'docs/quote-doctest.md': BASE['docs/quote-doctest.md'].replace(/old$/m, 'new') }, null, inexact('docs/quote-doctest.md')],
  [{ 'docs/quote-list.md': BASE['docs/quote-list.md'].replace('requests', 'reqests') }, null, inexact('docs/quote-list.md')],
  // Link labels fold case as CommonMark does: `[\u1e9e]` names the definition `[SS]`.
  [{ 'docs/fold.md': BASE['docs/fold.md'].replace('[guide]', '[\u1e9e]') }, null, inexact('docs/fold.md')],
  // `listing` and `tt` are code elements.
  [{ 'src/pages/listing.html': BASE['src/pages/listing.html'].replace('requests', 'reqests') }, null, unrecognised('src/pages/listing.html')],
  [{ 'src/pages/tt.html': BASE['src/pages/tt.html'].replace('requests', 'reqests') }, null, unrecognised('src/pages/tt.html')],
  // A sensitive word that is a stylesheet's own name still counts (its plural does not).
  [{ 'src/styles/login.css': BASE['src/styles/login.css'].replace('red', 'blue') }, null, 'src/styles/login.css sits in an area named login, and such areas are never a hotfix'],
  [{ 'src/styles/payment.css': BASE['src/styles/payment.css'].replace('red', 'blue') }, null, 'src/styles/payment.css sits in an area named payment, and such areas are never a hotfix'],
  // A custom property named for a colour that holds no colour, a second token, or a variable.
  [{ 'src/styles/color-mode.css': BASE['src/styles/color-mode.css'].replace('dark', 'light') }, null, inexact('src/styles/color-mode.css')],
  [{ 'src/styles/two-tokens.css': BASE['src/styles/two-tokens.css'].replace('red', 'red url(x)') }, null, inexact('src/styles/two-tokens.css')],
  [{ 'src/styles/var.css': BASE['src/styles/var.css'].replace('--b', '--c') }, null, inexact('src/styles/var.css')],
  // The sixth round (2026-10-09), each trap but the last two an answer of `checking` on
  // `5326daae`. The strict HTML subset: a brace inside a tag, a comment that a browser ends
  // early, text inside `<svg>`, a name that is no HTML element, an element never closed.
  [{ 'src/pages/brace-tag.html': BASE['src/pages/brace-tag.html'].replace('SELECT name FROM users', 'SELECT pass FROM admins') }, null, inexact('src/pages/brace-tag.html')],
  [{ 'src/pages/brace-el.html': BASE['src/pages/brace-el.html'].replace('SELECT name FROM users', 'SELECT pass FROM admins') }, null, inexact('src/pages/brace-el.html')],
  [{ 'src/pages/brace-script.html': BASE['src/pages/brace-script.html'].replace('run()', 'drop()') }, null, unrecognised('src/pages/brace-script.html')],
  [{ 'src/pages/comment-abrupt.html': BASE['src/pages/comment-abrupt.html'].replace('SELECT name FROM users', 'SELECT pass FROM admins') }, null, inexact('src/pages/comment-abrupt.html')],
  [{ 'src/pages/svg-pre.html': BASE['src/pages/svg-pre.html'].replace('requests', 'reqests') }, null, inexact('src/pages/svg-pre.html')],
  [{ 'src/pages/unknown.html': BASE['src/pages/unknown.html'].replace('Save', 'Store') }, null, inexact('src/pages/unknown.html')],
  [{ 'src/pages/svg-text.html': BASE['src/pages/svg-text.html'].replace('Save', 'Store') }, null, inexact('src/pages/svg-text.html')],
  [{ 'src/pages/formula.html': BASE['src/pages/formula.html'].replace('Save', 'Store') }, null, inexact('src/pages/formula.html')],
  [{ 'src/pages/open-div.html': BASE['src/pages/open-div.html'].replace('Save', 'Store') }, null, inexact('src/pages/open-div.html')],
  // A colour that is not the whole value of its property (the functional plan's scenario).
  [{ 'src/styles/border.css': BASE['src/styles/border.css'].replace('#0a58ca', '#0b5ed7') }, null, inexact('src/styles/border.css')],
  // Markdown: an `import` line right after a heading; a heading whose generated anchor changes.
  [{ 'docs/heading-import.md': BASE['docs/heading-import.md'].replace('./chart', './other') }, null, inexact('docs/heading-import.md')],
  [{ 'docs/heading.md': BASE['docs/heading.md'].replace('Install', 'Setup') }, null, inexact('docs/heading.md')],
  // A sensitive word in full-width letters, and as a camel-case sub-word.
  [{ '\uff21\uff35\uff34\uff28/index.html': BASE['\uff21\uff35\uff34\uff28/index.html'].replace('Save', 'Store') }, null, '\uff21\uff35\uff34\uff28/index.html sits in an area named auth, and such areas are never a hotfix'],
  [{ 'src/pages/AuthPanel.html': BASE['src/pages/AuthPanel.html'].replace('Save', 'Store') }, null, 'src/pages/AuthPanel.html sits in an area named auth, and such areas are never a hotfix'],
  [{ 'src/pages/paymentForm.html': BASE['src/pages/paymentForm.html'].replace('Save', 'Store') }, null, 'src/pages/paymentForm.html sits in an area named payment, and such areas are never a hotfix'],
  // Refused on `5326daae` too, with another sentence: text inside a custom element, and an
  // autolink's own text (one opaque piece, compared exactly).
  [{ 'src/pages/card.html': BASE['src/pages/card.html'].replace('Save', 'Store') }, null, inexact('src/pages/card.html')],
  [{ 'docs/autolink.md': BASE['docs/autolink.md'].replace('guide', 'other') }, null, inexact('docs/autolink.md')]
];

// The eighth round (the decision at review of 2026-10-09): Markdown and plain text qualify
// only as a wording change in pure prose. First the rows that qualified until now and relied
// on structure: plain text under no documentation name, a line that holds a web address, a
// link's text, a paragraph inside a list item, a quote, a paragraph below an autolink, a
// heading.
TRAPS.push(
  [{ 'notes/todo.txt': lines('Write the start page.') }, null, unrecognised('notes/todo.txt')],
  [{ 'docs/links.md': lines('Read the guide at https://example.org/guide.') }, null, inexact('docs/links.md')],
  [{ 'docs/linktext.md': lines('Read [the new guide](/guide) first.') }, null, inexact('docs/linktext.md')],
  [{ 'docs/list.md': BASE['docs/list.md'].replace('Old', 'New') }, null, inexact('docs/list.md')],
  [{ 'docs/quote-prose.md': BASE['docs/quote-prose.md'].replace('Old', 'New') }, null, inexact('docs/quote-prose.md')],
  [{ 'docs/autolink.md': BASE['docs/autolink.md'].replace('Old', 'New') }, null, inexact('docs/autolink.md')],
  [{ 'docs/heading-caps.md': BASE['docs/heading-caps.md'].replace('instal the App', 'Instal the app') }, null, inexact('docs/heading-caps.md')],
  // The size rule itself: eleven lines reworded line for line are 22 changed lines.
  [{ 'docs/eleven.md': BASE['docs/eleven.md'].replace(/Eleven old line/g, 'Eleven new line') }, null, 'it changes 22 lines in 1 file and a hotfix is at most 20 lines in at most 3 files'],
  // Rule 6 in plain prose: a changed number, and a changed word of 7 to 40 characters that are
  // all hexadecimal digits, which sites link as a commit id.
  [{ 'docs/plain.md': BASE['docs/plain.md'].replace('30 days', '60 days') }, null, riskMarker('docs/plain.md')],
  [{ 'docs/commit-id.md': BASE['docs/commit-id.md'].replace('abcdefa', 'abcdefb') }, null, riskMarker('docs/commit-id.md')],
  [{ 'docs/tokens.md': BASE['docs/tokens.md'].replace('Old', 'New') }, null, 'docs/tokens.md sits in an area named token, and such areas are never a hotfix'],
  // The findings of the Markdown security run, each a pass on `c2c9f86d` or a refusal with
  // another sentence. Markdown inside `<div markdown="1">` that gains a link.
  [{ 'docs/md-in-html.md': BASE['docs/md-in-html.md'].replace('the guide', 'the [guide](javascript:alert(1))') }, null, inexact('docs/md-in-html.md')],
  // Plain text that is no documentation: a dependency name, a template's placeholder, an
  // exclusion list, build options.
  [{ 'deps.txt': lines('request') }, null, unrecognised('deps.txt')],
  [{ 'templates/email/welcome.txt': lines('Hello {nome}, welcome.') }, null, unrecognised('templates/email/welcome.txt')],
  [{ 'exclude.txt': lines('build', 'cache-old') }, null, unrecognised('exclude.txt')],
  [{ 'cmake/options.txt': lines('option(SLOW ON)') }, null, unrecognised('cmake/options.txt')],
  // A tab three containers deep; a closing fence followed by a no-break space; a list marker
  // above indented code; a bracket that makes a link; a definition under a paragraph line.
  [{ 'docs/deep-tab.md': lines('>> > \tamet words') }, null, inexact('docs/deep-tab.md')],
  [{ 'docs/fence-nbsp.md': BASE['docs/fence-nbsp.md'].replace('Run it now.', 'Run it today.') }, null, inexact('docs/fence-nbsp.md')],
  [{ 'docs/list-marker.md': BASE['docs/list-marker.md'].replace('-   Install:', '- Installing:') }, null, inexact('docs/list-marker.md')],
  [{ 'docs/half-link.md': lines('Read [docs](guide/setup) first.') }, null, inexact('docs/half-link.md')],
  [{ 'docs/def-under.md': BASE['docs/def-under.md'].replace('teh', 'the') }, null, inexact('docs/def-under.md')],
  // A word that becomes a domain; a file name; front matter with a language word, and a
  // metadata block in the middle of the file (a plain line inside each); a `key: value` line.
  [{ 'docs/domain.md': lines('Visit example.com today.') }, null, inexact('docs/domain.md')],
  [{ 'docs/file-name.md': lines('Read READNE.md first.') }, null, inexact('docs/file-name.md')],
  [{ 'docs/front-js.md': BASE['docs/front-js.md'].replace('A plain old line', 'A plain new line') }, null, inexact('docs/front-js.md')],
  [{ 'docs/mid-meta.md': BASE['docs/mid-meta.md'].replace('A plain old line', 'A plain new line') }, null, inexact('docs/mid-meta.md')],
  [{ 'docs/template-key.md': BASE['docs/template-key.md'].replace('main', 'other') }, null, inexact('docs/template-key.md')],
  // A code span with a pipe in a table cell; a heading; a task box; an alert; a container; an
  // admonition; a wiki link.
  [{ 'docs/cell-span.md': BASE['docs/cell-span.md'].replace('| y`', '| w`') }, null, inexact('docs/cell-span.md')],
  [{ 'docs/bienvenue.md': BASE['docs/bienvenue.md'].replace('## Bienvenue !', '## Bienvenue') }, null, inexact('docs/bienvenue.md')],
  [{ 'docs/task.md': lines('- [x] Write the guide') }, null, inexact('docs/task.md')],
  [{ 'docs/alert.md': BASE['docs/alert.md'].replace('[!NOTE]', '[!WARNING]') }, null, inexact('docs/alert.md')],
  [{ 'docs/container.md': BASE['docs/container.md'].replace('old', 'new') }, null, inexact('docs/container.md')],
  [{ 'docs/admonition.md': BASE['docs/admonition.md'].replace('old', 'new') }, null, inexact('docs/admonition.md')],
  [{ 'docs/wiki.md': lines('See [[Setup guide]] first.') }, null, inexact('docs/wiki.md')],
  // A byte-order mark before indented code; a tag behind a backslash, which some readers
  // still read as a tag, above the changed paragraph.
  [{ 'docs/bom-code.md': '\ufeff    pip install request\n' }, null, inexact('docs/bom-code.md')],
  [{ 'docs/escaped-script.md': BASE['docs/escaped-script.md'].replace('Old', 'New') }, null, inexact('docs/escaped-script.md')],
  // Legal texts never qualify, `.md` or `.txt`: the sensitive-area clause, naming `license`
  // for a licence and `legal` for the other legal names.
  [{ 'LICENCE.txt': BASE['LICENCE.txt'].replace('old', 'new') }, null, 'LICENCE.txt sits in an area named license, and such areas are never a hotfix'],
  [{ 'LICENSE.md': BASE['LICENSE.md'].replace('old', 'new') }, null, 'LICENSE.md sits in an area named license, and such areas are never a hotfix'],
  [{ 'NOTICE.md': BASE['NOTICE.md'].replace('old', 'new') }, null, 'NOTICE.md sits in an area named legal, and such areas are never a hotfix'],
  [{ 'docs/COPYING.txt': BASE['docs/COPYING.txt'].replace('old', 'new') }, null, 'docs/COPYING.txt sits in an area named legal, and such areas are never a hotfix'],
  [{ 'PATENTS.md': BASE['PATENTS.md'].replace('old', 'new') }, null, 'PATENTS.md sits in an area named legal, and such areas are never a hotfix'],
  [{ 'docs/legal-notes.txt': BASE['docs/legal-notes.txt'].replace('old', 'new') }, null, 'docs/legal-notes.txt sits in an area named legal, and such areas are never a hotfix'],
  // A plain line directly above an `===` line (the one directly under a list line qualifies
  // since the ninth round).
  [{ 'docs/above-rule.md': BASE['docs/above-rule.md'].replace('old', 'new') }, null, inexact('docs/above-rule.md')],
  // What the differential test found against the rule as first written (markdown-it in four
  // configurations): a paragraph a list item holds; a paragraph inside an element left open
  // above it, a component among them; a comment cut off where its block quote ends; a
  // carriage return on its own before a fence; a fence inside a list item that ends early;
  // a definition that takes the fence line as its destination.
  [{ 'docs/item-para.md': BASE['docs/item-para.md'].replace('Old', 'New') }, null, inexact('docs/item-para.md')],
  [{ 'docs/wrapped-div.md': BASE['docs/wrapped-div.md'].replace('Old', 'New') }, null, inexact('docs/wrapped-div.md')],
  [{ 'docs/component.md': BASE['docs/component.md'].replace('Select name from users', 'Select pass from admins') }, null, inexact('docs/component.md')],
  [{ 'docs/cut-comment.md': BASE['docs/cut-comment.md'].replace('Old', 'New') }, null, inexact('docs/cut-comment.md')],
  [{ 'docs/lone-return.md': BASE['docs/lone-return.md'].replace('Old', 'New') }, null, inexact('docs/lone-return.md')],
  [{ 'docs/item-fence-out.md': BASE['docs/item-fence-out.md'].replace('Old', 'New') }, null, inexact('docs/item-fence-out.md')],
  [{ 'docs/def-fence.md': BASE['docs/def-fence.md'].replace('Old', 'New') }, null, inexact('docs/def-fence.md')],
  // What Python-Markdown and pandoc read otherwise (run on this machine, 2026-10-09): a
  // closing fence longer than its opening one and an opening fence with two words after it
  // (Python-Markdown reads neither as that fence), and a first word that pandoc reads as a
  // list marker.
  [{ 'docs/long-closer.md': BASE['docs/long-closer.md'].replace('Old', 'New') }, null, inexact('docs/long-closer.md')],
  [{ 'docs/two-word-info.md': BASE['docs/two-word-info.md'].replace('Old', 'New') }, null, inexact('docs/two-word-info.md')],
  [{ 'docs/letter-marker.md': BASE['docs/letter-marker.md'].replace('Old', 'New') }, null, inexact('docs/letter-marker.md')],
  // Nothing else in the file may change: no line ending, no byte-order mark, no added line,
  // no trailing spaces (two of them are a line break).
  [{ 'docs/endings.md': 'New words here.\r\nMore words.\r\n' }, null, inexact('docs/endings.md')],
  [{ 'docs/endings.md': '\ufeffNew words here.\nMore words.\n' }, null, inexact('docs/endings.md')],
  [{ 'docs/endings.md': lines('New words here.', 'More words.', 'And a line.') }, null, inexact('docs/endings.md')],
  [{ 'docs/trailing.md': lines('New words here.', 'More words.') }, null, inexact('docs/trailing.md')],
  // Lines that are no plain prose: a full stop inside a word, and a colon in the file's first
  // paragraph (round brackets are prose since the ninth round).
  [{ 'docs/abbreviation.md': BASE['docs/abbreviation.md'].replace('old', 'new') }, null, inexact('docs/abbreviation.md')],
  [{ 'docs/colon.md': BASE['docs/colon.md'].replace('old', 'new') }, null, inexact('docs/colon.md')],
  // A tag inside a code fence holds what follows like any other: a renderer that knows no
  // fences reads it as HTML (a `<script>` would run there), and a block tag left open holds
  // the rest of the file. `docs/fence-tag.md` qualified until Python-Markdown without its
  // fenced-code extension was run against the edits this reader passes (2026-10-09), and
  // `docs/fence-open-tag.md` is the smallest case that run found. Plain text under a
  // documentation name is held to the same rule as Markdown.
  [{ 'docs/fence-script.md': BASE['docs/fence-script.md'].replace('Old', 'New') }, null, inexact('docs/fence-script.md')],
  [{ 'docs/fence-tag.md': BASE['docs/fence-tag.md'].replace('Old', 'New') }, null, inexact('docs/fence-tag.md')],
  [{ 'docs/fence-open-tag.md': BASE['docs/fence-open-tag.md'].replace('Old', 'New') }, null, inexact('docs/fence-open-tag.md')],
  // Only white space may stand before the doctype (the decision at review of 2026-10-09): a
  // comment there leaves a current browser in standards mode, and is refused all the same.
  [{ 'src/pages/lead-comment.html': BASE['src/pages/lead-comment.html'].replace('Save', 'Store') }, null, inexact('src/pages/lead-comment.html')],
  // The ninth round (decisions at review of 2026-10-09). A raw start tag anywhere refuses the
  // file: a comment alone on its line above the paragraph (it qualified until now), a comment
  // below it, and `<script>` written inside a code span.
  [{ 'docs/lint.md': BASE['docs/lint.md'].replace('Old', 'New') }, null, inexact('docs/lint.md')],
  [{ 'docs/comment-below.md': BASE['docs/comment-below.md'].replace('Old', 'New') }, null, inexact('docs/comment-below.md')],
  [{ 'docs/script-span.md': BASE['docs/script-span.md'].replace('Old', 'New') }, null, inexact('docs/script-span.md')],
  // A list whose other item holds a code span; `Key: value` in the file's first paragraph.
  [{ 'docs/steps-code.md': BASE['docs/steps-code.md'].replace('old', 'new') }, null, inexact('docs/steps-code.md')],
  [{ 'docs/key-value.md': BASE['docs/key-value.md'].replace('old', 'new') }, null, inexact('docs/key-value.md')],
  // Catalogue files (the ninth round), each an answer of `checking` on `4212d9ff`. A
  // dependency, build or settings name is decided before the catalogue kind; a catalogue
  // folder alone makes no catalogue.
  [{ 'packages/i18n/package.json': BASE['packages/i18n/package.json'].replace('Old texts', 'New texts') }, null, 'it changes the dependencies in packages/i18n/package.json'],
  [{ 'locales/package.json': BASE['locales/package.json'].replace('node run tests', 'echo skipped') }, null, 'it changes the dependencies in locales/package.json'],
  [{ 'messages/docker-compose.yml': BASE['messages/docker-compose.yml'].replace('image: app', 'image: other') }, null, 'it changes how the project is built or shipped in messages/docker-compose.yml'],
  [{ 'translations/pnpm-lock.yaml': lines('lockfileVersion: new') }, null, 'it changes the dependencies in translations/pnpm-lock.yaml'],
  [{ 'i18n/tsconfig.json': BASE['i18n/tsconfig.json'].replace('commonjs', 'esnext') }, null, setting('i18n/tsconfig.json')],
  [{ 'messages/application.properties': lines('spring.profiles.active=prod') }, null, setting('messages/application.properties')],
  [{ 'i18n/routes.json': BASE['i18n/routes.json'].replace('Start', 'Begin') }, null, setting('i18n/routes.json')],
  // A duplicate key in JSON; block text after a tag in YAML; an escaped `=` in a key of a
  // properties file, which is a change to the key.
  [{ 'locales/en/duplicate.json': BASE['locales/en/duplicate.json'].replace('"Save"', '"Store"') }, null, 'I could not read the change (locales/en/duplicate.json holds something I cannot follow)'],
  [{ 'locales/en/tagged.yml': BASE['locales/en/tagged.yml'].replace('save: Save', 'save: Store') }, null, 'I could not read the change (locales/en/tagged.yml holds something I cannot follow)'],
  [{ 'locales/en/escaped.properties': lines('a\\=c=value') }, null, unrecognised('locales/en/escaped.properties')],
  // The wording rule: a bare host, a changed placeholder name, placeholders in another order,
  // and a right-to-left override, which no reader sees.
  [{ 'locales/en/host.json': BASE['locales/en/host.json'].replace('example.com', 'example.net') }, null, riskMarker('locales/en/host.json')],
  [{ 'locales/en/named.yml': lines('hello: Hello :email') }, null, unrecognised('locales/en/named.yml')],
  [{ 'locales/en/ordered.json': BASE['locales/en/ordered.json'].replace('%s of %d', '%d of %s') }, null, unrecognised('locales/en/ordered.json')],
  [{ 'locales/en/override.json': BASE['locales/en/override.json'].replace('"Save"', '"Save\u202e"') }, null, riskMarker('locales/en/override.json')],
  // A byte-order mark on one side only, and another number of carriage returns.
  [{ 'locales/en/marked.yml': '\ufefftitle: New\n' }, null, unrecognised('locales/en/marked.yml')],
  [{ 'src/styles/endings.css': 'a { color: blue; }\r\nb { margin: 0; }\n' }, null, unrecognised('src/styles/endings.css')]
);

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

assert.equal(QUALIFY.length, 41, 'the corpus holds 41 shapes that qualify');
assert.equal(REMOVED_FORMATS.length, 44, 'the corpus holds 44 cases of removed formats');
assert.equal(TRAPS.length, 296, 'the corpus holds 296 traps, the removed formats among them');

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
const plain = (chars, why) => Object.fromEntries([...chars].map((c) => [c, () => why]));
const ALLOWED = {
  markup: plain('"\'()=:/\\#;*[]|_', 'plain punctuation in an element\'s visible text, shown as typed'),
  catalogue: {
    ...plain('\'()=:/#;*"[]|_&', 'punctuation inside a message value, shown as typed'),
    '\\': (v) => (/\\[tnrbf]/.test(v) ? 'a backslash that makes a tab, line break or other control character in the shown text'
      : 'a backslash before a letter in a .properties value, which the reader drops')
  },
  // Since the eighth round (the decision at review of 2026-10-09) a Markdown or plain-text
  // line is plain prose or nothing: of the inserted characters only the two straight quotes
  // and the semicolon are prose punctuation, and every renderer shows them as typed.
  // Since the ninth round (the decisions at review of 2026-10-09) a parenthesis is prose too (no
  // link forms without a bracket), and so is a colon that follows a word and stands before a
  // space or the end of the line, outside the file's first paragraph.
  markdown: { ...plain('"\';', 'a straight quote or a semicolon in a plain prose line is shown as typed by every renderer'),
    ...plain('()', 'a parenthesis in a plain prose line is shown as typed: no link forms without a bracket'),
    ':': () => 'a colon after a word and before a space, outside the first paragraph, is shown as typed' },
  text: { ...plain('"\';', 'a straight quote or a semicolon in a plain prose line is shown as typed by every renderer'),
    ...plain('()', 'a parenthesis in a plain prose line is shown as typed: no link forms without a bracket'),
    ':': () => 'a colon after a word and before a space, outside the first paragraph, is shown as typed' },
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
  if (cut.trim() === '') return false; // an emptied file is no wording edit
  if (kind === 'catalogue') return even(tail, '"') && !/^\s*[{}[\]]?\s*$/.test(tail) && /[:=]/.test(tail);
  // Markup and stylesheets: a cut always leaves a tag, element or block open. Markdown and
  // plain text (since the eighth round): a cut always removes a line or the last line's
  // ending, and nothing but the words of a plain paragraph may change in such a file.
  return false;
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

/**
 * A timing case in ratio form (the decision at review of 2026-10-09: a bound in milliseconds
 * passed or failed with the machine's load, where a ratio does not). `at(n)` gives the call to
 * time on an input of size `n`, built before it is timed. The call is warmed once; `n` grows
 * until one call costs at least 20 ms or `4n` would pass `limit` (inputs of many megabytes
 * measure the engine's memory, not the reader); an input that cannot grow that far is run
 * several times in a row, so that what is timed still costs about 20 ms. Then the minimum of
 * five runs at `n` and of five runs at `4n` is taken. Work that is linear in the input gives
 * a ratio near 4, quadratic work one near 16, and the bound is 8. An input the reader does
 * not read in proportion (a kind it refuses at once) is held to 8 times 20 ms. The one
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
  while (once < 20 && n * 8 <= limit) {
    n *= once < 5 && n * 16 <= limit ? 4 : 2;
    call = at(n);
    once = ms(call);
  }
  assert.ok(once < 5000, `one call at size ${n} took ${once.toFixed(0)} ms`);
  const times = once < 20 ? Math.min(Math.ceil(20 / Math.max(once, 0.02)), 1000) : 1;
  const repeated = (fn) => () => { for (let k = 0; k < times; k++) fn(); };
  const small = least(repeated(call));
  const big = least(repeated(at(4 * n)));
  return { n, small, big, ratio: big / Math.max(small, 20) };
}

// Each scanner moves forward only. Inputs built to make a backtracking or rescanning scanner
// quadratic are judged at a size `n` and at `4n`, and the time may grow by less than 8 times
// (the ratio form: see `growth`). Each input is a function of its size, in repeated pieces.
test('the whole-file scanners stay linear on input built against them', (t) => {
  /** Runs of backticks of rising length, about `count` backticks in all. */
  const risingTicks = (count) => Array.from({ length: Math.floor(Math.sqrt(2 * count)) }, (_, i) => `${'`'.repeat(i + 1)} x `).join('');
  const cases = {
    'docs/brackets.md': (n) => `${'['.repeat(100 * n)}]\nOld words.\n`,
    'docs/ticks.md': (n) => `${risingTicks(100 * n)}\nOld words.\n`,
    'docs/targets.md': (n) => `${']('.repeat(50 * n)}\nOld words.\n`,
    'docs/blocks.md': (n) => `Old words.\n${'    code\n\n'.repeat(10 * n)}`,
    'docs/raws.rst': (n) => `Old words.\n${'.. raw:: html\n'.repeat(10 * n)}`,
    'src/pages/quotes.html': (n) => `<p>Old</p>\n${'<a b="'.repeat(20 * n)}\n`,
    'src/pages/escapes.html': (n) => `<p>Old</p>\n${'<script><!--'.repeat(10 * n)}\n`,
    'src/components/Braces.jsx': (n) => `export const P = () => <p>Old</p>;\n${'{'.repeat(100 * n)}\n`,
    'src/components/Tags.jsx': (n) => `export const P = () => <p>Old</p>;\n${'x = <a>'.repeat(20 * n)}\n`,
    'src/components/Nest.vue': (n) => `<template>\n<p>Old</p>\n${'<template>'.repeat(10 * n)}\n</template>\n`,
    'src/styles/urls.css': (n) => `a { color: red; }\n${'url('.repeat(30 * n)}\n`,
    // The fourth round's scanners: nested list items, literal blocks, wrapped reference
    // definitions, reference words, prose directive options, type parameter lists,
    // components and variable declarations.
    'docs/lists.md': (n) => `Old words.\n${'- a\n  - b\n    - c\n'.repeat(8 * n)}`,
    'docs/literals.rst': (n) => `Old words.\n${'Run::\n\n   code\n'.repeat(8 * n)}`,
    'docs/defs.md': (n) => `Old words.\n${'[a]:\n\n\n'.repeat(15 * n)}`,
    'docs/refs.rst': (n) => `Old words.\nx${')'.repeat(100 * n)}a\n`,
    'docs/options.rst': (n) => `Old words.\n.. note::\n${'   :class: x\n'.repeat(10 * n)}`,
    'src/components/Params.tsx': (n) => `export const P = () => <p>Old</p>;\n${'x = <T extends A<'.repeat(6 * n)}\n`,
    'src/components/Holds.vue': (n) => `<template>\n<p>Old</p>\n${'<MyThing>'.repeat(10 * n)}\n</template>\n`,
    'src/styles/vars.scss': (n) => `a { color: red; }\n${'$a: b;'.repeat(16 * n)}\n`,
    // Every scanner fails closed: catalogue line states over many open quotes and blocks.
    'i18n/en/states.yaml': (n) => `title: Old\n${'a: "x\n  b: |\n'.repeat(8 * n)}`,
    // The fifth round's scanners: a deep stack of open elements closed by end tags of other
    // names, with and without a holder open; deeply nested and very long block quotes; many
    // paragraphs of backticks; many custom properties.
    'src/pages/stack.html': (n) => `<p>Old</p>\n${'<a>'.repeat(15 * n)}${'</b>'.repeat(15 * n)}\n`,
    'src/pages/held.html': (n) => `<p>Old</p>\n<x-y>${'<a>'.repeat(15 * n)}${'</b>'.repeat(15 * n)}\n`,
    'src/pages/names.html': (n) => `<p>Old</p>\n${Array.from({ length: 6 * n }, (_, i) => `<a${i}>`).join('')}${'</b></a0>'.repeat(6 * n)}\n`,
    'docs/quotes.md': (n) => `Old words.\n\n${'> '.repeat(50 * n)}x\n`,
    'docs/quoted.md': (n) => `Old words.\n\n${'> > > a \\` b\n'.repeat(8 * n)}`,
    'docs/paragraphs.md': (n) => `Old words.\n\n${'a ` b | c\n\n- d ` e\n'.repeat(6 * n)}`,
    'docs/items.md': (n) => `Old words.\n\n${'- > - > - a\n'.repeat(8 * n)}`,
    'docs/markers.md': (n) => `Old words.\n\n${'- '.repeat(50 * n)}a\n`,
    'src/styles/properties.css': (n) => `a { color: red; }\n:root {${'--color-a: red;'.repeat(6 * n)}}\n`,
    // The sixth round's scanners: foreign content nested deep, many pieces of it, and never
    // closed; comments that hold a comment start; script blocks full of comment marks;
    // autolink starts; placeholders in many paragraphs; braces; headings; one long value.
    'src/pages/svg-deep.html': (n) => `<p>Old</p>\n<svg>${'<g>'.repeat(15 * n)}${'</g>'.repeat(15 * n)}</svg>\n`,
    'src/pages/svg-many.html': (n) => `<p>Old</p>\n${'<svg><g/></svg>'.repeat(6 * n)}\n`,
    'src/pages/svg-open.html': (n) => `<p>Old</p>\n${'<svg>'.repeat(20 * n)}\n`,
    'src/pages/comments.html': (n) => `<p>Old</p>\n${'<!-- a <!-- b -->'.repeat(6 * n)}\n`,
    'src/pages/comment-starts.html': (n) => `<p>Old</p>\n${'<!-- a '.repeat(15 * n)}\n`,
    'src/pages/script-marks.html': (n) => `<p>Old</p>\n<script>${'<!-- --!> '.repeat(10 * n)}</script>\n`,
    'src/pages/selects.html': (n) => `<p>Old</p>\n<select>${'<b>'.repeat(30 * n)}</select>\n`,
    'docs/autolinks.md': (n) => `Old words.\n\n${'<https://a '.repeat(10 * n)}\n`,
    'docs/mails.md': (n) => `Old words.\n\n${'<aaaaaaaa'.repeat(10 * n)}\n`,
    'docs/placeholders.md': (n) => `Old words.\n\n${'Use <file> here.\n\n'.repeat(6 * n)}`,
    'docs/braces.md': (n) => `Old words.\n\n${'{a} {"b"}\n\n'.repeat(4 * n)}${'{'.repeat(50 * n)}\n`,
    'docs/headings.md': (n) => `Old words.\n\n${'# a\n\nb\nc\n===\n\n'.repeat(6 * n)}`,
    'src/styles/value.css': (n) => `a { color: red; }\nb { margin:${' 1px'.repeat(25 * n)} !important; }\n`,
    // The seventh round's readers (the review of 2026-10-09): Markdown read block by block
    // with lazy lines, tables, definitions, link targets, image text and Markdown's own tag
    // grammar; HTML with the end tags that may be left out, the start tags that close an
    // open element, table parts and `<noscript>` content.
    'docs/lazy.md': (n) => `Old words.\n\n${'> a\nb\n'.repeat(15 * n)}`,
    'docs/lazy-items.md': (n) => `Old words.\n\n${'- a\nb\n\n'.repeat(15 * n)}`,
    'docs/tables.md': (n) => `Old words.\n\n${'| a | b |\n| - | - |\n| c | d | e | f |\n\n'.repeat(3 * n)}`,
    'docs/table-rows.md': (n) => `Old words.\n\n| a | b |\n| - | - |\n${'| c | d |\n'.repeat(10 * n)}`,
    'docs/tag-starts.md': (n) => `Old words.\n\n${'<a b   '.repeat(15 * n)}\n`,
    'docs/tag-values.md': (n) => `Old words.\n\n${'<a b = "c" d=e '.repeat(6 * n)}\n`,
    'docs/link-starts.md': (n) => `Old words.\n\n${'[a](b(c'.repeat(15 * n)}\n`,
    'docs/link-titles.md': (n) => `Old words.\n\n${'[a](b "c'.repeat(12 * n)}\n`,
    'docs/image-starts.md': (n) => `Old words.\n\n${'![a'.repeat(30 * n)}\n`,
    'docs/label-long.md': (n) => `Old words.\n\n[${'a'.repeat(100 * n)}\n`,
    'docs/def-long.md': (n) => `Old words.\n\n[a]: ${'b '.repeat(50 * n)}\n`,
    'docs/def-many.md': (n) => `Old words.\n\n${'[a]: /b "c"\n'.repeat(8 * n)}`,
    'docs/mails-long.md': (n) => `Old words.\n\n<${'a'.repeat(60 * n)}@${'b.'.repeat(20 * n)}\n`,
    'docs/nested-quotes.md': (n) => `Old words.\n\n${'> > > a\n> > b\n> c\n\n'.repeat(5 * n)}`,
    'docs/html-blocks.md': (n) => `Old words.\n\n${'<div>\na\n</div>\n\n'.repeat(6 * n)}`,
    'docs/tabs.md': (n) => `Old words.\n\n${'-\t>\ta\n'.repeat(15 * n)}`,
    'src/pages/implied.html': (n) => `<p>Old</p>\n<div>${'<p>'.repeat(30 * n)}</div>\n`,
    'src/pages/implied-wrong.html': (n) => `<p>Old</p>\n<div><span>${'<p>a'.repeat(12 * n)}${'</div>'.repeat(12 * n)}\n`,
    'src/pages/items.html': (n) => `<p>Old</p>\n<ul>${'<li>a'.repeat(20 * n)}</ul>\n`,
    'src/pages/items-deep.html': (n) => `<p>Old</p>\n<ul><li><ol>${'<span>'.repeat(8 * n)}${'<li></li>'.repeat(8 * n)}\n`,
    'src/pages/cells.html': (n) => `<p>Old</p>\n<table>${'<tr><td>a<td>b'.repeat(8 * n)}</table>\n`,
    'src/pages/noscripts.html': (n) => `<p>Old</p>\n${'<noscript><p>x</p></noscript>'.repeat(4 * n)}\n`,
    'src/pages/options.html': (n) => `<p>Old</p>\n<select>${'<option>a<optgroup>'.repeat(6 * n)}</select>\n`,
    // The eighth round's HTML reader: text inside many open elements; the content of
    // `<noscript>` read in place, with no end tag, with one far away, and with many.
    'src/pages/deep-text.html': (n) => `<p>Old</p>\n${'<i>a'.repeat(20 * n)}\n`,
    'src/pages/noscript-open.html': (n) => `<p>Old</p>\n${'<noscript>'.repeat(10 * n)}\n`,
    'src/pages/noscript-deep.html': (n) => `<p>Old</p>\n${'<noscript>'.repeat(10 * n)}</noscript>\n`,
    'src/pages/noscript-many.html': (n) => `<p>Old</p>\n${'<noscript><b>x</b></noscript>'.repeat(4 * n)}\n`,
    // The eighth round's reader of Markdown and plain text (the decision at review of
    // 2026-10-09): one pass over the lines. Many plain paragraphs, one very long paragraph,
    // one very long line, many closed fences, metadata blocks, one-line comments and code
    // spans that hold a tag, backtick runs that close nothing, a long run of spaces, lines
    // that end like the start of a definition, and the same reader on plain text.
    'docs/prose-many.md': (n) => `${'Plain words in a line.\n\n'.repeat(5 * n)}Old words.\n`,
    'docs/prose-paragraph.md': (n) => `${'Plain words in a line,\n'.repeat(5 * n)}Old words.\n`,
    'docs/prose-line.md': (n) => `${'plain words '.repeat(10 * n)}Old words.\n`,
    // (Until a tag inside a fence held what follows, these fences held `<b> code`; a `<` before a space is no tag.)
    'docs/fences-many.md': (n) => `${'```js\nif (a < b) code\n```\n\n'.repeat(5 * n)}Old words.\n`,
    'docs/fences-tags.md': (n) => `${'```js\n<b> code\n```\n\n'.repeat(5 * n)}Old words.\n`,
    'docs/meta-many.md': (n) => `${'---\ntitle: x\n---\n\n'.repeat(5 * n)}Old words.\n`,
    'docs/comments-many.md': (n) => `${'<!-- a note -->\n\n'.repeat(6 * n)}Old words.\n`,
    'docs/spans-many.md': (n) => `${'Use `<b>` and ``a ` <i>`` now.\n\n'.repeat(4 * n)}Old words.\n`,
    'docs/spans-line.md': (n) => `${'`<b>` '.repeat(15 * n)}\n\nOld words.\n`,
    'docs/ticks-open.md': (n) => `${risingTicks(100 * n)}\n\nOld words.\n`,
    'docs/spaces-long.md': (n) => `${' '.repeat(100 * n)}x\n\nOld words.\n`,
    'docs/def-ends.md': (n) => `${`a]:${' '.repeat(40)}\n`.repeat(3 * n)}\nOld words.\n`,
    'docs/fence-like.md': (n) => `${'x ``` y ~~~\n'.repeat(8 * n)}\nOld words.\n`,
    'NOTES.txt': (n) => `${'Plain words in a line.\n\n'.repeat(5 * n)}Old words.\n`,
    // The ninth round's prose reader: near-misses of the raw start tags inside code spans, long runs of list
    // items, of colons and of parentheses, and one very long run of items around the change.
    'docs/raw-near.md': (n) => `${'Use `<scrip>`, `<styl>`, `<pr>`, `<!-x>` and `<![CDAT>` now.\n\n'.repeat(3 * n)}Old words.\n`,
    'docs/items-many.md': (n) => `${'- a plain item\n1. a numbered one (short): yes\n   and a second line\n\n'.repeat(3 * n)}Old words.\n`,
    'docs/items-run.md': (n) => `Text.\n\n${'- a plain item: yes (short)\n'.repeat(5 * n)}- Old words.\n`,
    'docs/colons-line.md': (n) => `Text.\n\n${'a: (b) '.repeat(20 * n)}Old words.\n`,
    'docs/markers-line.md': (n) => `Text.\n\n${'1'.repeat(100 * n)}. Old words.\n`,
    // The ninth round's catalogue readers, each on a file it reads to the end: many keys in
    // one mapping (the duplicate check), many small mappings, many list items, one long
    // value, many placeholders, a long run of colons and full stops (the scheme and bare-host
    // patterns), a JSON file of many keys and one of many small objects, and properties files
    // of many lines and of one long line. (`i18n/en/states.yaml` above is kept from the
    // fourth round; the reader it was built against is gone, and this one refuses it at its
    // second line.)
    'locales/en/wide.yml': (n) => `${Array.from({ length: 40 * n }, (_, i) => `key${i}: Plain words here`).join('\n')}\ntitle: Old\n`,
    'locales/en/nested.yml': (n) => `${Array.from({ length: 12 * n }, (_, i) => `group${i}:\n  menu:\n    save: Plain words\n    days:\n      - Monday\n`).join('')}title: Old\n`,
    'locales/en/lists.yml': (n) => `days:\n${'  - "Plain words"\n'.repeat(40 * n)}title: Old\n`,
    'locales/en/long-value.yml': (n) => `title: Old ${'plain words '.repeat(80 * n)}end\n`,
    'locales/en/placeholders.json': (n) => `${JSON.stringify({ title: `Old ${'{a} %s :n %1$s $x '.repeat(40 * n)}` }, null, 2)}\n`,
    'locales/en/colons.json': (n) => `${JSON.stringify({ title: `Old ${'a: b. c, '.repeat(100 * n)}` }, null, 2)}\n`,
    'locales/en/wide.json': (n) => `${JSON.stringify(Object.fromEntries([...Array.from({ length: 40 * n }, (_, i) => [`key${i}`, 'Plain words here']), ['title', 'Old']]), null, 2)}\n`,
    'locales/en/objects.json': (n) => `${JSON.stringify({ items: Array.from({ length: 12 * n }, () => ({ label: 'Plain', hints: ['one', 'two'] })), title: 'Old' }, null, 2)}\n`,
    'locales/en/many.properties': (n) => `${Array.from({ length: 40 * n }, (_, i) => `key${i} = Plain words here`).join('\n')}\ntitle = Old\n`,
    'locales/en/long.properties': (n) => `title = Old ${'plain words '.repeat(80 * n)}end\n`
  };
  for (const [rel, build] of Object.entries(cases)) {
    const at = (n) => {
      const old = build(n);
      const change = changeOf(rel, old, /\.s?css$/.test(rel) ? old.replace('red', 'blue') : old.replace('Old', 'New'));
      return () => ruleRefusal(change);
    };
    // The inputs of the removed formats are kept: each is refused as not recognised, at once.
    if (/\.(?:rst|jsx|tsx|vue|scss)$/.test(rel)) assert.equal(at(1)().cause, 'unrecognised', rel);
    // The eighth round's inputs that end in a plain paragraph are read to the end and pass.
    // (`docs/comments-many.md` passed until the ninth round; a `<!--` anywhere now refuses the file.)
    if (/^(?:docs\/(?:prose|fences-many|meta|spans|ticks-open|spaces|def-ends|fence-like|raw-near|items|colons)|NOTES|locales\/en\/)/.test(rel)) assert.equal(at(1)(), null, rel);
    // The largest input is about 1.6 million characters, four times the size a quadratic scan took seconds on.
    const { n, small, big, ratio } = growth(at, 16, Math.floor(1600000 / (build(64).length / 64)));
    assert.ok(ratio < 8, `${rel}: size ${n} took ${small.toFixed(1)} ms and size ${4 * n} took ${big.toFixed(1)} ms, ${ratio.toFixed(1)} times as long`);
    if (ratio > 5) t.diagnostic(`${rel}: ${ratio.toFixed(1)} times as long at 4 times the size (${small.toFixed(1)} ms at size ${n})`);
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
