/**
 * Tests for src/lib/agent-resolver.js (B2 — leaf-agent → skill conversion)
 *
 * The resolver is SUPPLEMENTAL tooling per ADR-1: it powers Library
 * listings and discovery, but is NOT the backward-compat mechanism for
 * Claude invocation (that's the filesystem redirect stub).
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  resolveAgent,
  isRedirectStub,
  listConvertedAgents,
} = require('../src/lib/agent-resolver');

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-resolver-'));
  fs.mkdirSync(path.join(dir, 'agents', 'quality'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'skills', 'quality', 'code-reviewer'), { recursive: true });
  return dir;
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore: best-effort, non-fatal */ } }

function writeRedirectStub(root, agentPath, targetSkill) {
  const full = path.join(root, 'agents', agentPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `---
name: ${path.basename(agentPath, '.md')}
type: wrapper
target_skill: ${targetSkill}
---
This agent's logic lives at skills/${targetSkill}/SKILL.md. Read that file and follow its instructions.
`);
}

function writePlainAgent(root, agentPath) {
  const full = path.join(root, 'agents', agentPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `---
name: ${path.basename(agentPath, '.md')}
description: Plain agent
---
# Plain agent body
`);
}

describe('isRedirectStub', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  it('returns true for a redirect-stub file', () => {
    writeRedirectStub(root, 'quality/code-reviewer.md', 'quality/code-reviewer');
    const p = path.join(root, 'agents', 'quality', 'code-reviewer.md');
    assert.equal(isRedirectStub(p), true);
  });

  it('returns false for a plain agent file', () => {
    writePlainAgent(root, 'quality/plain-agent.md');
    const p = path.join(root, 'agents', 'quality', 'plain-agent.md');
    assert.equal(isRedirectStub(p), false);
  });

  it('returns false for a non-existent file', () => {
    assert.equal(isRedirectStub(path.join(root, 'agents', 'missing.md')), false);
  });
});

describe('resolveAgent', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  it('returns the skill SKILL.md path when agent is a redirect stub', () => {
    writeRedirectStub(root, 'quality/code-reviewer.md', 'quality/code-reviewer');
    fs.writeFileSync(
      path.join(root, 'skills', 'quality', 'code-reviewer', 'SKILL.md'),
      '---\nname: code-reviewer\n---\nbody\n'
    );
    const result = resolveAgent('agents/quality/code-reviewer.md', root);
    assert.equal(result.kind, 'redirected');
    assert.match(result.path, /skills\/quality\/code-reviewer\/SKILL\.md$/);
    assert.equal(result.targetSkill, 'quality/code-reviewer');
  });

  it('returns the original agent path when agent is plain (not redirected)', () => {
    writePlainAgent(root, 'quality/plain-agent.md');
    const result = resolveAgent('agents/quality/plain-agent.md', root);
    assert.equal(result.kind, 'original');
    assert.match(result.path, /agents\/quality\/plain-agent\.md$/);
  });

  it('flags a broken redirect (target_skill points to a missing skill)', () => {
    writeRedirectStub(root, 'quality/broken.md', 'quality/missing-skill');
    const result = resolveAgent('agents/quality/broken.md', root);
    assert.equal(result.kind, 'broken-redirect');
    assert.equal(result.targetSkill, 'quality/missing-skill');
  });

  it('returns {kind:not-found} for a non-existent agent', () => {
    const result = resolveAgent('agents/quality/nope.md', root);
    assert.equal(result.kind, 'not-found');
  });
});

describe('listConvertedAgents', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  it('returns empty list when nothing converted', () => {
    writePlainAgent(root, 'quality/plain.md');
    const converted = listConvertedAgents(root);
    assert.equal(converted.length, 0);
  });

  it('lists all redirect-stub agents in the agents/ tree', () => {
    writeRedirectStub(root, 'quality/code-reviewer.md', 'quality/code-reviewer');
    writeRedirectStub(root, 'quality/dead-code-detector.md', 'quality/dead-code-detector');
    writePlainAgent(root, 'quality/not-converted.md');

    const converted = listConvertedAgents(root);
    assert.equal(converted.length, 2);
    const targets = converted.map(c => c.targetSkill).sort();
    assert.deepEqual(targets, ['quality/code-reviewer', 'quality/dead-code-detector']);
  });
});
