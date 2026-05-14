/**
 * Tests for C1 — PreToolUse enforcement hook (CTOC v7)
 *
 * Covers:
 *   - ctoc-project-detector: detects CTOC project via .ctoc/ + CLAUDE.md marker
 *   - plan-coverage: matches target file against active plans' files: globs
 *   - enforcement-log: appends JSON entries to .ctoc/logs/enforcement.json
 *   - Pre-v7 plans without files: declaration get warn-only treatment (per X1)
 *
 * Hook integration testing (the actual PreToolUse.Edit.js process) is out of
 * scope here — those need Claude Code hook context. We test the LIBRARIES the
 * hook composes.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

function tempProject({ withCtoc = true, withMarker = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-enf-'));
  if (withCtoc) fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  if (withMarker) {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'),
      '# CTOC Project Instructions\n\nThis project uses CTOC.\n');
  } else if (withCtoc) {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Generic Project\n');
  }
  for (const stage of ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done', 'canvas']) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  return dir;
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

describe('ctoc-project-detector', () => {
  const { isCtocProject } = require('../src/lib/ctoc-project-detector');
  let root;
  afterEach(() => { if (root) cleanup(root); });

  it('returns true for a project with .ctoc/ and CLAUDE.md marker', () => {
    root = tempProject({ withCtoc: true, withMarker: true });
    assert.equal(isCtocProject(root).isCtoc, true);
  });

  it('returns false for project with .ctoc/ but no CLAUDE.md marker', () => {
    root = tempProject({ withCtoc: true, withMarker: false });
    assert.equal(isCtocProject(root).isCtoc, false);
  });

  it('returns false for project with no .ctoc/ directory', () => {
    root = tempProject({ withCtoc: false });
    assert.equal(isCtocProject(root).isCtoc, false);
  });
});

describe('plan-coverage', () => {
  const { findCoveringPlan } = require('../src/lib/plan-coverage');
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  function writePlan(stage, name, files) {
    const filesYaml = files.map(f => `  - "${f}"`).join('\n');
    const content = `---
title: "${name}"
program: ctoc-v7
files:
${filesYaml}
---
# ${name}
`;
    fs.writeFileSync(path.join(root, 'plans', stage, `${name}.md`), content);
  }

  it('returns the plan that covers a target file (exact match)', () => {
    writePlan('todo', 'plan-a', ['src/foo.js']);
    const match = findCoveringPlan('src/foo.js', root);
    assert.ok(match, 'finds matching plan');
    assert.match(match.plan, /plan-a/);
  });

  it('returns the plan that covers via glob', () => {
    writePlan('todo', 'plan-b', ['src/areas/**']);
    const match = findCoveringPlan('src/areas/pipeline.js', root);
    assert.ok(match, 'glob match found');
  });

  it('returns null when no plan covers the file', () => {
    writePlan('todo', 'plan-c', ['src/foo.js']);
    const match = findCoveringPlan('src/other.js', root);
    assert.equal(match, null);
  });

  it('I11: in-progress takes priority over todo', () => {
    writePlan('todo', 'plan-todo', ['src/x.js']);
    writePlan('in-progress', 'plan-inp', ['src/x.js']);
    const match = findCoveringPlan('src/x.js', root);
    assert.match(match.plan, /plan-inp/, 'in-progress wins over todo');
  });

  it('X1: pre-v7 plan without files: declaration triggers warn-only', () => {
    // No files: declaration, no program: ctoc-v7
    const planPath = path.join(root, 'plans', 'todo', 'legacy-plan.md');
    fs.writeFileSync(planPath, `---
title: "Legacy"
---
# Legacy plan
`);
    const match = findCoveringPlan('src/random.js', root);
    // Returns null (no coverage) but does NOT crash on missing files: field
    assert.equal(match, null);
  });
});

describe('enforcement-log', () => {
  const { logEnforcement } = require('../src/lib/enforcement-log');
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  it('appends a JSON entry to .ctoc/logs/enforcement.json', () => {
    logEnforcement({
      tool: 'Edit',
      target_file: 'src/foo.js',
      project_is_ctoc: true,
      plan_matched: 'todo/plan-a',
      escape_phrase: null,
      outcome: 'allow',
    }, root);
    const logPath = path.join(root, '.ctoc', 'logs', 'enforcement.json');
    assert.ok(fs.existsSync(logPath));
    const parsed = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].outcome, 'allow');
  });

  it('creates the .ctoc/logs/ directory if missing', () => {
    const logsDir = path.join(root, '.ctoc', 'logs');
    fs.rmSync(logsDir, { recursive: true, force: true });
    logEnforcement({ tool: 'Edit', target_file: 'f', outcome: 'block' }, root);
    assert.ok(fs.existsSync(logsDir));
  });

  it('appends to existing log entries', () => {
    logEnforcement({ tool: 'Edit', target_file: 'a', outcome: 'allow' }, root);
    logEnforcement({ tool: 'Write', target_file: 'b', outcome: 'block' }, root);
    const parsed = JSON.parse(fs.readFileSync(path.join(root, '.ctoc', 'logs', 'enforcement.json'), 'utf8'));
    assert.equal(parsed.length, 2);
    assert.equal(parsed[1].outcome, 'block');
  });
});
