/**
 * Fence: the slash-command picker offers only what a human types.
 *
 * Claude Code scans plugin SKILL.md files at ONE level (skills/<name>/SKILL.md)
 * of every folder listed in plugin.json's `skills` array, and registers each as a
 * `/ctoc:<name>` entry. On 2026-07-17 the array was widened to every category
 * folder so the specialists (skills/<category>/<name>/SKILL.md) would register;
 * that put about a hundred specialist methods into the human's picker. The human
 * asked for them to go (2026-09-30): the picker holds the three commands plus the
 * human-invoked skills that sit directly under skills/.
 *
 * So the contract is now EXACT: the array is `["./skills/"]`, only the named
 * human-invoked skills sit at depth one, and — because no specialist is
 * registered any more — no agent may hold the `Skill` tool or promise to borrow
 * through it (it would resolve nothing). Specialists are reached by an agent
 * READING the body at its file path. This test walks the REAL skills/ tree, the
 * REAL agents/ tree and the REAL manifests — zero doubles.
 *
 * These are exact presence/absence checks of named strings; they do not, and do
 * not claim to, answer whether a specialist is reachable at runtime.
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
 * The skills a HUMAN invokes by typing `/ctoc:<name>`. Only these may sit at
 * depth one (skills/<name>/SKILL.md), because every depth-one body registers as a
 * picker entry. `deepthink` is allowed, not required: its plan adds it.
 */
const HUMAN_INVOKED = ['ask-me-questions', 'deepthink'];
const REQUIRED_HUMAN_INVOKED = ['ask-me-questions'];

/** The frontmatter `name` of a SKILL.md, or null when it declares none. */
function frontmatterName(file) {
  const body = fs.readFileSync(file, 'utf8');
  const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const nameLine = fm[1].match(/^name:\s*(.+?)\s*$/m);
  return nameLine ? nameLine[1].replace(/^['"]|['"]$/g, '') : null;
}

/** Folders directly under skills/ that hold a SKILL.md (each registers). */
function depthOneSkillFolders() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

/** Every agent definition, plus the shipped watcher template, repo-relative. */
function agentAndTemplateFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
    }
  };
  walk(path.join(ROOT, 'agents'));
  out.push(path.join(ROOT, '.ctoc', 'templates', 'watcher.md'));
  return out.map((f) => path.relative(ROOT, f).split(path.sep).join('/')).sort();
}

/** The tool names a definition's frontmatter grants (inline or YAML-list form). */
function declaredTools(text) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return [];
  const lines = fm[1].split(/\r?\n/);
  const at = lines.findIndex((l) => /^tools:/.test(l));
  if (at === -1) return [];
  const inline = lines[at].replace(/^tools:/, '').replace(/#.*$/, '').trim();
  if (inline) return inline.replace(/^\[|\]$/g, '').split(',').map((t) => t.trim()).filter(Boolean);
  const list = [];
  for (let i = at + 1; i < lines.length && /^\s*-\s/.test(lines[i]); i++) {
    list.push(lines[i].replace(/^\s*-\s*/, '').trim());
  }
  return list;
}

test('plugin.json declares a skills array', () => {
  assert.ok(
    Array.isArray(plugin.skills),
    'plugin.json has no "skills" array, so only skills/<name>/SKILL.md at depth 1 register'
  );
  assert.ok(plugin.skills.length > 0, '"skills" array is empty');
});

test('the skills array is exactly ["./skills/"] — no category folder is registered', () => {
  assert.deepStrictEqual(
    plugin.skills,
    ['./skills/'],
    'plugin.json "skills" must be exactly ["./skills/"]. Every listed folder registers each <name>/SKILL.md ' +
      'beneath it as a /ctoc:<name> picker entry; listing a category folder puts its specialists in the ' +
      "human's picker (the 2026-07-17 regression the human asked to remove on 2026-09-30)"
  );
});

test('only the human-invoked skills sit directly under skills/, each named as its folder', () => {
  const folders = depthOneSkillFolders();
  const intruders = folders.filter((n) => !HUMAN_INVOKED.includes(n));
  assert.deepStrictEqual(
    intruders,
    [],
    `These skill bodies sit at depth one and would register as /ctoc:<name> picker entries; a specialist ` +
      `belongs under skills/<category>/:\n  ${intruders.join('\n  ')}`
  );
  for (const required of REQUIRED_HUMAN_INVOKED) {
    assert.ok(folders.includes(required), `skills/${required}/SKILL.md is missing — the human invokes it by name`);
  }
  for (const n of folders) {
    assert.strictEqual(
      frontmatterName(path.join(SKILLS_DIR, n, 'SKILL.md')),
      n,
      `skills/${n}/SKILL.md must declare "name: ${n}" so its picker entry is /ctoc:${n}`
    );
  }
});

test('no agent definition and not the watcher template holds or orders the Skill tool', () => {
  const offenders = [];
  for (const rel of agentAndTemplateFiles()) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (declaredTools(text).includes('Skill')) offenders.push(`${rel}: "Skill" in tools:`);
    if (text.includes('`Skill`')) offenders.push(`${rel}: names the \`Skill\` tool in its body`);
  }
  assert.deepStrictEqual(
    offenders,
    [],
    'No specialist skill is registered, so the Skill tool resolves only the human-invoked depth-one skills; ' +
      'an agent that holds it or borrows through it is promised a method it cannot get. Read the body by its ' +
      `path, skills/<category>/<name>/SKILL.md, instead:\n  ${offenders.join('\n  ')}`
  );
});

test('the README names every human-invoked skill on disk as a /ctoc: entry and drops the registration routes', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const unnamed = depthOneSkillFolders().filter((n) => !readme.includes(`/ctoc:${n}`));
  assert.deepStrictEqual(unnamed, [], `README.md does not name these picker entries:\n  ${unnamed.join('\n  ')}`);
  for (const gone of [
    "direct invocation through Claude Code's built-in",
    'auto-load the skill when your conversation matches',
  ]) {
    assert.ok(!readme.includes(gone), `README.md still promises a registration route that no longer exists: "${gone}"`);
  }
});

test('CTO Chief routes specialists through agents and file reads, not skill registration', () => {
  const chief = fs.readFileSync(path.join(ROOT, 'agents', 'coordinator', 'cto-chief.md'), 'utf8');
  for (const gone of ['Skill-first, subagent-second', 'when_to_load', '"skills": [']) {
    assert.ok(
      !chief.includes(gone),
      `agents/coordinator/cto-chief.md still contains "${gone}" — a route through skill registration that no longer exists`
    );
  }
  assert.ok(
    chief.includes('skills/saas/workos-sso/SKILL.md'),
    'agents/coordinator/cto-chief.md must name skills/saas/workos-sso/SKILL.md by path: that skill has no agent of its own'
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
    '"./skills/" is not declared. Because marketplace source is "./", declaring subdirectories replaces the default scan, so the human-invoked depth-one skills (ask-me-questions, and deepthink once its plan lands) would stop registering'
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
    const name = frontmatterName(file);
    if (!name) continue;
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
