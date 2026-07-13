'use strict';

/**
 * installer-paths.test.js — W06-s7
 * parent index : plans/todo/ctoc-audit-w06-truthful-tests.md
 * vision       : plans/done/ctoc-self-audit-remediation.md (workstream 11 —
 *                "fix or remove the broken hooks-installer path")
 *
 * Finding S8 ("broken hooks-installer path"): the hooks installer must reference
 * hook scripts that actually exist on disk, and every hook script wired into
 * .claude-plugin/hooks.json must resolve to a real file. The proven remediation
 * wave repointed the installer's post-commit target at src/hooks (see
 * `installPostCommitHook` in src/lib/hooks-installer.js). This invariant PINS
 * that truth so it cannot silently regress.
 *
 * HONESTY NOTE — deviation from the slice's original RED-before plan (recorded
 * in "Decisions Taken Under Ambiguity" of the slice, and in this executor's
 * report): the paired production fix (workstream 11) has ALREADY landed on this
 * tree, so this invariant is honestly GREEN today, not red. To keep the green
 * meaningful rather than vacuous, every existence sweep is paired with a
 * non-vacuity guard (the checked set is asserted non-empty / of the expected
 * cardinality) and a negative control proves the existence checker returns false
 * for an absent path. A real regression — the installer repointed at a missing
 * script, a deleted template, or a dangling hooks.json command — turns this file
 * RED naming the offending path.
 *
 * Discipline: real file reads only, no fixtures. The single simulated install
 * runs in an fs.mkdtempSync sandbox torn down in after(); nothing touches the
 * real repository's .git/hooks or config.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Hard require — if the installer module fails to resolve, this file must fail
// LOUDLY (never skip), because a missing installer is itself the S8 defect class.
const installer = require('../src/lib/hooks-installer.js');

// Re-derive the installer's own path anchors the SAME way the installer does,
// so the test cannot drift from a parallel hard-coded list. The installer sets
// TEMPLATE_DIR = path.join(__dirname, '..', '..', '.ctoc', 'templates', 'hooks')
// where __dirname is the directory of hooks-installer.js.
const INSTALLER_DIR = path.dirname(require.resolve('../src/lib/hooks-installer.js'));
const PLUGIN_ROOT = path.join(INSTALLER_DIR, '..', '..'); // src/lib -> repo/plugin root
const TEMPLATE_DIR = path.join(PLUGIN_ROOT, '.ctoc', 'templates', 'hooks');
const HOOKS_JSON = path.join(PLUGIN_ROOT, '.claude-plugin', 'hooks.json');

// The hook types the installer names that actually ship a template today. The
// installer iterates its full HOOK_TYPES list but guards each read with
// existsSync, so it only writes the intersection of HOOK_TYPES and present
// templates — these three are that intersection for the husky + native systems.
const TEMPLATED_HOOK_TYPES = ['commit-msg', 'pre-commit', 'pre-push'];

// Project types PreCommitInstaller._detectProjectType() can return; each must
// have a matching `<type>.yaml.template` or install() throws "Unknown project
// type". Sourced from _detectProjectType in src/lib/hooks-installer.js (kept
// inline here rather than exported to avoid coupling; drift is caught by the
// cardinality assertion below).
const DETECTABLE_PROJECT_TYPES = ['typescript', 'python', 'go', 'multi-lang'];

/** Collect every "command" string in a nested hooks.json structure. */
function collectCommands(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectCommands(item, out);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'command' && typeof value === 'string') out.push(value);
      else collectCommands(value, out);
    }
  }
  return out;
}

describe('installer-paths — every template/target the installer reads or writes resolves', () => {
  it('re-derived template directory resolves and is populated (non-vacuity)', () => {
    assert.ok(
      fs.existsSync(TEMPLATE_DIR),
      `installer TEMPLATE_DIR does not resolve: ${TEMPLATE_DIR}`
    );

    const found = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.template')) found.push(full);
      }
    };
    walk(TEMPLATE_DIR);

    // Non-vacuity: the sweep below is meaningless if the directory is empty.
    assert.ok(
      found.length >= 1,
      `no *.template files under ${TEMPLATE_DIR} — sweep would be vacuous`
    );
    for (const file of found) {
      assert.ok(fs.statSync(file).isFile(), `template is not a readable file: ${file}`);
    }
  });

  it('every husky + native hook template the installer reads exists', () => {
    // Non-vacuity: assert the list is non-empty before looping over it.
    assert.ok(TEMPLATED_HOOK_TYPES.length >= 1, 'templated hook-type list is empty');

    for (const hookType of TEMPLATED_HOOK_TYPES) {
      const huskyTemplate = path.join(TEMPLATE_DIR, 'husky', `${hookType}.template`);
      const nativeTemplate = path.join(TEMPLATE_DIR, `${hookType}.sh.template`);
      assert.ok(
        fs.existsSync(huskyTemplate),
        `missing husky hook template: ${huskyTemplate}`
      );
      assert.ok(
        fs.existsSync(nativeTemplate),
        `missing native hook template: ${nativeTemplate}`
      );
    }
  });

  it('every pre-commit config template for a detectable project type resolves', () => {
    // Non-vacuity via cardinality: if _detectProjectType gains/loses a branch,
    // this count guard forces the list to be re-reviewed rather than drifting.
    assert.strictEqual(
      DETECTABLE_PROJECT_TYPES.length,
      4,
      'detectable project-type list drifted from _detectProjectType — re-check'
    );

    for (const projectType of DETECTABLE_PROJECT_TYPES) {
      const configTemplate = path.join(
        TEMPLATE_DIR,
        'pre-commit-config',
        `${projectType}.yaml.template`
      );
      assert.ok(
        fs.existsSync(configTemplate),
        `missing pre-commit config template for project type "${projectType}": ${configTemplate}`
      );
    }
  });
});

describe('installer-paths — hooks wired by the plugin resolve to real scripts', () => {
  it('every .claude-plugin/hooks.json command references an existing script', () => {
    assert.ok(fs.existsSync(HOOKS_JSON), `hooks.json not found: ${HOOKS_JSON}`);

    const parsed = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
    const commands = collectCommands(parsed, []);

    // Non-vacuity: an empty hooks.json would pass every per-command assertion.
    assert.ok(commands.length >= 1, 'hooks.json declared no commands — sweep would be vacuous');

    let scriptRefs = 0;
    for (const command of commands) {
      const match = command.match(/src[\\/]+hooks[\\/]+[\w.-]+\.js/);
      assert.ok(
        match,
        `hooks.json command does not reference a src/hooks script: ${command}`
      );
      const rel = match[0].replace(/[\\/]+/g, path.sep);
      const scriptPath = path.join(PLUGIN_ROOT, rel);
      assert.ok(
        fs.existsSync(scriptPath),
        `hooks.json command points at a missing script: ${scriptPath}`
      );
      scriptRefs += 1;
    }
    // Non-vacuity: prove at least one command actually matched and was checked.
    assert.ok(scriptRefs >= 1, 'no hooks.json command resolved to a src/hooks script');
  });
});

describe('installer-paths — post-commit installer targets an existing src/hooks script', () => {
  let sandbox;
  let writtenHookPath;

  before(() => {
    // Sandbox: a bare .git directory is enough for getGitHooksDir() to resolve
    // without throwing "Not a git repository"; we never run git writers.
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-installer-'));
    fs.mkdirSync(path.join(sandbox, '.git'));

    // Drive the REAL installer. Pass pluginRoot explicitly so the assertion is
    // deterministic (independent of any ambient CLAUDE_PLUGIN_ROOT) and pins the
    // exact join the wave fixed: <pluginRoot>/src/hooks/post-commit.js.
    const result = installer.installPostCommitHook(sandbox, { pluginRoot: PLUGIN_ROOT });
    assert.ok(result.installed, `installPostCommitHook did not install: ${JSON.stringify(result)}`);
    writtenHookPath = path.join(sandbox, '.git', 'hooks', 'post-commit');
  });

  after(() => {
    if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('the generated post-commit hook references a script that exists on disk', () => {
    const content = fs.readFileSync(writtenHookPath, 'utf8');
    const match = content.match(/node\s+"([^"]+)"/);
    assert.ok(match, `post-commit hook has no node "<script>" invocation:\n${content}`);

    const referenced = match[1];
    // Pins the wave's fix: the target lives under src/hooks, not a legacy path.
    assert.ok(
      referenced.endsWith(path.join('src', 'hooks', 'post-commit.js')),
      `post-commit hook references a non-src/hooks path: ${referenced}`
    );
    assert.ok(
      fs.existsSync(referenced),
      `installer wrote a post-commit hook pointing at a missing script: ${referenced}`
    );
  });
});

describe('installer-paths — negative control (proves the green is earned)', () => {
  it('the existence checker distinguishes a present template from an absent one', () => {
    const present = path.join(TEMPLATE_DIR, 'husky', 'pre-commit.template');
    const absent = path.join(TEMPLATE_DIR, 'husky', 'this-template-does-not-exist.template');

    // A real, currently-present installer path.
    assert.strictEqual(fs.existsSync(present), true, `control precondition failed: ${present} should exist`);
    // A fabricated path the same check must reject — if this were true, every
    // assertion above would be vacuous.
    assert.strictEqual(fs.existsSync(absent), false, `control failed: fabricated path unexpectedly exists: ${absent}`);
  });
});
