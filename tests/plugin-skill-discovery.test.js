/**
 * Fence: every skill directory on disk is declared in plugin.json.
 *
 * Claude Code scans plugin SKILL.md files at ONE level (skills/<name>/SKILL.md).
 * CTOC keeps skills at skills/<category>/<name>/SKILL.md, so without an explicit
 * `skills` array in plugin.json only the single depth-1 skill (ask-me-questions)
 * ever registers. This test walks the REAL skills/ tree and the REAL manifests —
 * zero doubles — so adding a new category fails here until it is declared.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'skills');

const plugin = JSON.parse(
  fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
);
const marketplace = JSON.parse(
  fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')
);

/** Every SKILL.md under skills/, as absolute paths. */
function findSkillFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findSkillFiles(full));
    else if (entry.name === 'SKILL.md') out.push(full);
  }
  return out;
}

/**
 * Directories that must be declared: for each SKILL.md, the GRANDPARENT
 * (the dir holding <name>/SKILL.md), as a "./skills/..." plugin-root path.
 */
function requiredDeclarations() {
  const dirs = new Set();
  for (const file of findSkillFiles(SKILLS_DIR)) {
    const container = path.dirname(path.dirname(file));
    const rel = path.relative(ROOT, container).split(path.sep).join('/');
    dirs.add(rel === 'skills' ? './skills/' : `./${rel}`);
  }
  return dirs;
}

/** Normalise for comparison: "./skills/testing/" and "./skills/testing" are one dir. */
const norm = (p) => (p.endsWith('/') && p !== './skills/' ? p.slice(0, -1) : p);

test('plugin.json declares a skills array', () => {
  assert.ok(
    Array.isArray(plugin.skills),
    'plugin.json has no "skills" array, so only skills/<name>/SKILL.md at depth 1 register'
  );
  assert.ok(plugin.skills.length > 0, '"skills" array is empty');
});

test('every directory containing a <name>/SKILL.md child is declared', () => {
  const declared = new Set((plugin.skills || []).map(norm));
  const missing = [...requiredDeclarations()]
    .map(norm)
    .filter((d) => !declared.has(d))
    .sort();

  assert.deepStrictEqual(
    missing,
    [],
    `Undeclared skill directories (their SKILL.md files will NOT register):\n  ${missing.join('\n  ')}`
  );
});

test('./skills/ is declared explicitly (marketplace source is the root, so declaring subdirs REPLACES the default scan)', () => {
  const ctoc = marketplace.plugins.find((p) => p.name === 'ctoc');
  assert.ok(ctoc, 'no ctoc entry in marketplace.json');

  // Guard the premise: if source stops resolving to the marketplace root, the
  // replaces-the-default-scan exception no longer applies and this test should
  // fail loudly rather than silently guard nothing.
  assert.strictEqual(
    ctoc.source,
    './',
    'marketplace ctoc source is no longer the marketplace root — re-derive whether declaring subdirs still REPLACES the default skills/ scan'
  );

  assert.ok(
    (plugin.skills || []).includes('./skills/'),
    '"./skills/" is not declared. Because marketplace source is "./", declaring subdirectories replaces the default scan, so ask-me-questions (the only depth-1 skill) would stop registering'
  );
  assert.strictEqual(
    plugin.skills[0],
    './skills/',
    '"./skills/" must be the FIRST entry so the default scan is never dropped'
  );
});

test('every declared path exists on disk and starts with ./', () => {
  for (const declared of plugin.skills || []) {
    assert.ok(
      declared.startsWith('./'),
      `skills entry "${declared}" must be relative to the plugin root and start with "./"`
    );
    assert.ok(
      !declared.split('/').includes('..'),
      `skills entry "${declared}" escapes the plugin root via ".."`
    );
    assert.ok(
      !path.isAbsolute(declared),
      `skills entry "${declared}" must not be an absolute path`
    );
    const abs = path.join(ROOT, declared);
    assert.ok(
      fs.existsSync(abs) && fs.statSync(abs).isDirectory(),
      `skills entry "${declared}" does not exist on disk as a directory`
    );
  }
});

test('no two SKILL.md files declare the same frontmatter name', () => {
  const byName = new Map();
  for (const file of findSkillFiles(SKILLS_DIR)) {
    const body = fs.readFileSync(file, 'utf8');
    const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    const nameLine = fm[1].match(/^name:\s*(.+?)\s*$/m);
    if (!nameLine) continue;
    const name = nameLine[1].replace(/^['"]|['"]$/g, '');
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(rel);
  }

  const collisions = [...byName.entries()].filter(([, files]) => files.length > 1);
  assert.deepStrictEqual(
    collisions.map(([name, files]) => `${name}: ${files.join(', ')}`),
    [],
    'Skills flatten into one ctoc:<name> namespace — duplicate names shadow each other'
  );
});
