'use strict';

// Coverage + mutation-killing tests for src/areas/library.js.
//
// The module exports only render(app) and handleKey(key, app). The interesting
// logic (countFiles recursion + ext/dotfile filtering, listCategories directory
// filtering + descending sort + slice caps, the projectPath || cwd fallback)
// lives in NON-exported helpers reached solely through render(). Every test
// therefore drives render() against a REAL on-disk fixture tree under
// os.tmpdir() and asserts a value that flips when the target branch is mutated.
// Fixtures are always torn down in finally.
//
// Human-reviewed: every assertion below was chosen to go RED under a specific
// mutation, named in the comment above each test. No happy-path-only assertions.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const library = require('../src/areas/library');

// --- helpers ---------------------------------------------------------------

// Strip ANSI SGR color codes so assertions match on plain text.
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

// Extract the integer that follows a section label in the rendered header,
// e.g. "Agents    3" -> 3. Returns null when the label/number is absent.
function sectionCount(rendered, label) {
  const m = strip(rendered).match(new RegExp(`${label}\\s+(\\d+)`));
  return m ? Number(m[1]) : null;
}

// Make a fresh temp project root, run body(root), then always remove it.
function withRoot(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-library-'));
  try {
    return body(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function touch(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
}

// --- countFiles: recursion + ext match + dotfile skip ----------------------

// Kills: (a) dropping `if (entry.name.startsWith('.')) continue;` -> .hidden.md
// counted (4); (b) dropping `entry.name.endsWith(ext)` -> note.txt counted (4);
// (c) dropping the isDirectory recursion -> sub/c.md not counted (2).
// Correct count is exactly 3.
test('render_countsMarkdownRecursively_skippingDotfilesAndNonMarkdown', () => {
  withRoot((root) => {
    const cat = path.join(root, 'agents', 'cat');
    touch(path.join(cat, 'a.md'));
    touch(path.join(cat, 'b.md'));
    touch(path.join(cat, 'note.txt'));      // wrong ext -> excluded
    touch(path.join(cat, '.hidden.md'));    // dotfile -> excluded despite .md
    touch(path.join(cat, 'sub', 'c.md'));   // nested -> counted via recursion

    const out = library.render({ projectPath: root });

    assert.equal(sectionCount(out, 'Agents'), 3);
  });
});

// --- countFiles / listCategories: existsSync guards ------------------------

// Kills: dropping `if (!existsSync(dir)) return 0;` in countFiles AND the
// `return []` guard in listCategories. Without the guards, readdirSync throws
// ENOENT on the absent agents/ dir and render() would throw instead of
// producing a "0" header. An empty project root has no agents/skills/commands.
test('render_returnsZeroCounts_whenSectionDirectoriesAbsent', () => {
  withRoot((root) => {
    const out = library.render({ projectPath: root });

    assert.equal(sectionCount(out, 'Agents'), 0);
    assert.equal(sectionCount(out, 'Skills'), 0);
    assert.equal(sectionCount(out, 'Commands'), 0);
  });
});

// --- listCategories: descending sort + slice(0, 6) -------------------------

// Seven categories with distinct file counts 7..1. The rendered category list
// must be the top six by count, in DESCENDING order, and must omit the seventh.
// Kills: (a) comparator flipped to a.count - b.count -> ascending order, rank1
//   absent and sequence starts at rank6; (b) slice(0, 6) widened/removed ->
//   rank7 appears; (c) slice narrowed -> a top-6 name missing.
test('render_listsTopSixCategoriesDescendingByCount_droppingTheSeventh', () => {
  withRoot((root) => {
    // rankN gets (8 - N) files: rank1=7 ... rank7=1 (all distinct).
    for (let n = 1; n <= 7; n++) {
      const dir = path.join(root, 'agents', `rank${n}`);
      for (let f = 0; f < 8 - n; f++) touch(path.join(dir, `f${f}.md`));
    }

    const out = strip(library.render({ projectPath: root }));
    const order = (out.match(/rank\d/g) || []);

    assert.deepEqual(order, ['rank1', 'rank2', 'rank3', 'rank4', 'rank5', 'rank6']);
    assert.ok(!order.includes('rank7'), 'seventh category must be sliced off');
  });
});

// --- listCategories: directory-only + non-dot filter -----------------------

// A real category dir alongside a top-level loose file and a dot-directory.
// Only the real directory is a category.
// Kills: (a) dropping `e.isDirectory()` -> loosefile.md listed as a category;
//   (b) dropping `!e.name.startsWith('.')` -> .hiddencat listed as a category.
test('render_treatsOnlyNonDotDirectoriesAsCategories', () => {
  withRoot((root) => {
    const agents = path.join(root, 'agents');
    touch(path.join(agents, 'realcat', 'x.md'));
    touch(path.join(agents, 'realcat', 'y.md'));
    touch(path.join(agents, 'loosefile.md'));           // top-level file, not a category
    touch(path.join(agents, '.hiddencat', 'z.md'));     // dot-dir, not a category

    const out = strip(library.render({ projectPath: root }));
    const agentsSection = out.slice(out.indexOf('Agents'), out.indexOf('Skills'));

    assert.ok(agentsSection.includes('realcat'), 'real directory is a category');
    assert.ok(!agentsSection.includes('loosefile'), 'top-level file is not a category');
    assert.ok(!agentsSection.includes('hiddencat'), 'dot-directory is not a category');
  });
});

// --- Skills section reads its own directory --------------------------------

// The Skills category loop must enumerate skills/, not agents/. Build a distinct
// category under each and assert the Skills section shows only its own.
// Kills a mutant that passed agentsDir to the skills listCategories/countFiles.
test('render_listsSkillsCategoriesFromSkillsDirectory_notAgents', () => {
  withRoot((root) => {
    touch(path.join(root, 'agents', 'agentcat', 'a.md'));
    touch(path.join(root, 'skills', 'skillcat', 's.md'));
    touch(path.join(root, 'skills', 'skillcat', 't.md'));

    const out = strip(library.render({ projectPath: root }));
    const skillsSection = out.slice(out.indexOf('Skills'), out.indexOf('Commands'));

    assert.equal(sectionCount(out, 'Skills'), 2);
    assert.ok(skillsSection.includes('skillcat'), 'skills category from skills/ must render');
    assert.ok(!skillsSection.includes('agentcat'), 'agents category must not leak into Skills');
  });
});

// --- Commands header count: ext argument '.js' is honored -------------------

// countFiles(commandsDir, '.js') must count only .js. A lone readme.md must not
// inflate the count. Kills: dropping the '.js' arg (default '.md') -> readme.md
// counted and the nine .js ignored, giving 1 instead of 9.
test('render_countsCommandsByJsExtension_excludingMarkdown', () => {
  withRoot((root) => {
    const commands = path.join(root, 'src', 'commands');
    for (let i = 0; i < 9; i++) touch(path.join(commands, `cmd${i}.js`));
    touch(path.join(commands, 'readme.md'));            // wrong ext -> excluded

    const out = library.render({ projectPath: root });

    assert.equal(sectionCount(out, 'Commands'), 9);
  });
});

// --- Commands filename list: .js filter + slice(0, 8) ----------------------

// The listed filenames are top-level .js only, capped at eight.
// Kills: (a) dropping the `.endsWith('.js')` filter -> readme.md appears in the
//   listing; (b) widening/removing slice(0, 8) -> a ninth cmd*.js filename
//   appears (should be exactly eight).
test('render_listsAtMostEightJsCommandFilenames_excludingNonJs', () => {
  withRoot((root) => {
    const commands = path.join(root, 'src', 'commands');
    for (let i = 0; i < 9; i++) touch(path.join(commands, `cmd${i}.js`));
    touch(path.join(commands, 'readme.md'));

    const out = strip(library.render({ projectPath: root }));
    const listed = out.match(/cmd\d\.js/g) || [];

    assert.equal(listed.length, 8, 'exactly eight filenames listed (slice cap)');
    assert.ok(!out.includes('readme.md'), '.md filename must not be listed');
  });
});

// --- render: projectPath || process.cwd() fallback --------------------------

// With app.projectPath absent, render() must fall back to process.cwd(). Kills
// dropping `|| process.cwd()`: root becomes undefined, path.join(undefined, ...)
// throws, and no fixture data is reflected. We chdir into a fixture and assert
// the cwd tree drives the output.
test('render_fallsBackToCwd_whenProjectPathMissing', () => {
  const prevCwd = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-library-cwd-'));
  try {
    touch(path.join(root, 'agents', 'onlycat', 'a.md'));
    process.chdir(root);

    const out = strip(library.render({})); // no projectPath -> falsy -> cwd

    assert.equal(sectionCount(out, 'Agents'), 1);
    assert.ok(out.includes('onlycat'), 'category from cwd fixture must render');
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- handleKey: consumes nothing -------------------------------------------

// The library area handles no keys so the parent can drive area navigation.
// Kills flipping `return false` to `return true` (which would swallow ←/→/q).
test('handleKey_returnsFalse_forEveryKey', () => {
  for (const key of ['q', 'left', 'right', 'enter', '1']) {
    assert.equal(library.handleKey(key, {}), false, `key ${key} must not be consumed`);
  }
});
