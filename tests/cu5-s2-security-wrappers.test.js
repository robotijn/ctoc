'use strict';

// CU5-s2 — content-contract test for the three security Tier-2 wrappers.
// Reads the REAL wrapper .md files off disk (zero test doubles) and asserts the
// thin 3-field wrapper schema, target_skill resolution to a real SKILL.md, the
// redirect sentence, and the "restate NO rule" (thin) invariant.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents', 'security');

const WRAPPERS = ['cra-incident-clocks', 'incident-responder', 'threat-modeler'];

// Fields that MUST NOT appear in a thin wrapper (rich-agent leakage / DRY violation).
const FORBIDDEN_FIELDS = ['tier', 'reports_to', 'dispatch_protocol', 'model', 'tools'];
// Gate fields that must never be present (no human gate weakened).
const GATE_FIELDS = ['human_gate', 'review_gate', 'approved_by'];

const REDIRECT_RE =
  /^This agent's logic lives at skills\/security\/[a-z0-9-]+\/SKILL\.md\. Read that file in full, then follow its instructions\.$/;

function readWrapper(name) {
  const file = path.join(AGENTS_DIR, `${name}.md`);
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert.ok(m, `${name}.md must have a single YAML frontmatter block`);
  const frontRaw = m[1];
  const body = m[2].trim();

  const front = {};
  const keys = [];
  for (const line of frontRaw.split('\n')) {
    if (!line.trim()) continue;
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    assert.ok(kv, `${name}.md frontmatter line not key: value → "${line}"`);
    const key = kv[1];
    keys.push(key);
    front[key] = kv[2].trim();
  }
  return { file, raw, front, keys, body };
}

for (const name of WRAPPERS) {
  test(`${name}: exists and has exactly {name,type,target_skill}`, () => {
    const { keys, front } = readWrapper(name);
    assert.deepEqual(
      [...keys].sort(),
      ['name', 'target_skill', 'type'],
      `${name}.md must have exactly name/type/target_skill keys, got ${keys.join(',')}`
    );
    assert.equal(front.name, name, `name must equal "${name}"`);
  });

  test(`${name}: type is wrapper`, () => {
    const { front } = readWrapper(name);
    assert.equal(front.type, 'wrapper');
  });

  test(`${name}: target_skill is security/<name>`, () => {
    const { front } = readWrapper(name);
    assert.equal(front.target_skill, `security/${name}`);
    // name equals last segment of target_skill.
    assert.equal(front.target_skill.split('/').pop(), front.name);
  });

  test(`${name}: target_skill resolves to a real SKILL.md (no dangling)`, () => {
    const { front } = readWrapper(name);
    assert.match(front.target_skill, /^security\/[a-z0-9-]+$/, 'target_skill guard');
    const skillFile = path.join(REPO_ROOT, 'skills', front.target_skill, 'SKILL.md');
    assert.ok(
      fs.existsSync(skillFile),
      `target_skill must resolve to an existing SKILL.md: ${skillFile}`
    );
  });

  test(`${name}: single-line redirect body present`, () => {
    const { body } = readWrapper(name);
    assert.ok(!body.includes('\n'), `${name}.md body must be a single line`);
    assert.match(body, REDIRECT_RE, `${name}.md body must be the redirect sentence`);
    assert.ok(
      body.includes(`skills/security/${name}/SKILL.md`),
      `${name}.md redirect must point at its own SKILL.md`
    );
  });

  test(`${name}: thin — restates NO rule (no forbidden or gate fields)`, () => {
    const { keys, raw } = readWrapper(name);
    for (const f of FORBIDDEN_FIELDS) {
      assert.ok(!keys.includes(f), `${name}.md must not carry rich field "${f}"`);
    }
    for (const g of GATE_FIELDS) {
      assert.ok(!keys.includes(g), `${name}.md must not carry gate field "${g}"`);
    }
    // Thin invariant: the whole file is short (frontmatter + one redirect line).
    const lineCount = raw.trim().split('\n').length;
    assert.ok(lineCount <= 8, `${name}.md must be thin (<=8 lines), got ${lineCount}`);
  });
}
