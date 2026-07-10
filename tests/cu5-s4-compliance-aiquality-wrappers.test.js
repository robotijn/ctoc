'use strict';

// CU5-s4 — content-contract test for the compliance + ai-quality Tier-2
// wrappers. Reads the REAL wrapper .md files off disk (zero test doubles) and
// asserts the thin 3-field wrapper schema, target_skill resolution to a real
// SKILL.md, the redirect sentence, and the "restate NO rule" (thin) invariant.
//
// gdpr reconciliation (CU5-s5): compliance/gdpr-compliance-checker gets NO thin
// wrapper. EC2-s3 (tests/gdpr-agent-definition.test.js) deleted the old thin
// wrapper because the rich agents/compliance/gdpr-agent.md subsumes it, and
// mandates it stay deleted. Re-adding a thin wrapper would regress that shipped
// contract. So this slice asserts the INVERSE coexistence invariant: the thin
// wrapper must NOT exist, and the skill is dispatch-reachable only via the rich
// agent. Only sbom-cra-checker and llm-security-tester are thin-wrapped by s4.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

// Wrappers keyed by their agent category directory.
// NOTE: gdpr-compliance-checker is intentionally absent — it is rich-covered by
// gdpr-agent.md and MUST NOT get a thin wrapper (EC2-s3). See the gdpr test below.
const WRAPPERS = [
  { name: 'sbom-cra-checker', category: 'compliance' },
  { name: 'llm-security-tester', category: 'ai-quality' },
];

// Fields that MUST NOT appear in a thin wrapper (rich-agent leakage / DRY violation).
const FORBIDDEN_FIELDS = ['tier', 'reports_to', 'dispatch_protocol', 'model', 'tools'];
// Gate fields that must never be present (no human gate weakened).
const GATE_FIELDS = ['human_gate', 'review_gate', 'approved_by'];

const REDIRECT_RE =
  /^This agent's logic lives at skills\/(compliance|ai-quality)\/[a-z0-9-]+\/SKILL\.md\. Read that file in full, then follow its instructions\.$/;

function readWrapper(category, name) {
  const file = path.join(REPO_ROOT, 'agents', category, `${name}.md`);
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

for (const { name, category } of WRAPPERS) {
  test(`${name}: exists and has exactly {name,type,target_skill}`, () => {
    const { keys, front } = readWrapper(category, name);
    assert.deepEqual(
      [...keys].sort(),
      ['name', 'target_skill', 'type'],
      `${name}.md must have exactly name/type/target_skill keys, got ${keys.join(',')}`
    );
    assert.equal(front.name, name, `name must equal "${name}"`);
  });

  test(`${name}: type is wrapper`, () => {
    const { front } = readWrapper(category, name);
    assert.equal(front.type, 'wrapper');
  });

  test(`${name}: target_skill is ${category}/<name>`, () => {
    const { front } = readWrapper(category, name);
    assert.equal(front.target_skill, `${category}/${name}`);
    // name equals last segment of target_skill.
    assert.equal(front.target_skill.split('/').pop(), front.name);
  });

  test(`${name}: target_skill resolves to a real SKILL.md (no dangling)`, () => {
    const { front } = readWrapper(category, name);
    assert.match(front.target_skill, /^(compliance|ai-quality)\/[a-z0-9-]+$/, 'target_skill guard');
    const skillFile = path.join(REPO_ROOT, 'skills', front.target_skill, 'SKILL.md');
    assert.ok(
      fs.existsSync(skillFile),
      `target_skill must resolve to an existing SKILL.md: ${skillFile}`
    );
  });

  test(`${name}: single-line redirect body present`, () => {
    const { body } = readWrapper(category, name);
    assert.ok(!body.includes('\n'), `${name}.md body must be a single line`);
    assert.match(body, REDIRECT_RE, `${name}.md body must be the redirect sentence`);
    assert.ok(
      body.includes(`skills/${category}/${name}/SKILL.md`),
      `${name}.md redirect must point at its own SKILL.md`
    );
  });

  test(`${name}: thin — restates NO rule (no forbidden or gate fields)`, () => {
    const { keys, raw } = readWrapper(category, name);
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

// gdpr reconciliation invariant (real files): the thin gdpr-compliance-checker
// wrapper must NOT exist — the skill is dispatch-reachable ONLY via the rich
// gdpr-agent.md, which subsumed and deleted the thin wrapper in EC2-s3. This is
// the inverse of the original s4 coexistence premise, reconciled in CU5-s5 to
// avoid regressing the shipped EC2-s3 contract (tests/gdpr-agent-definition.test.js).
test('gdpr: NO thin wrapper; skill is rich-covered by gdpr-agent.md (EC2-s3 honored)', () => {
  const wrapperFile = path.join(REPO_ROOT, 'agents', 'compliance', 'gdpr-compliance-checker.md');
  const richFile = path.join(REPO_ROOT, 'agents', 'compliance', 'gdpr-agent.md');

  // The thin wrapper must NOT exist (EC2-s3 deleted it; CU5 does not re-add it).
  assert.equal(
    fs.existsSync(wrapperFile),
    false,
    'agents/compliance/gdpr-compliance-checker.md must stay deleted (subsumed by gdpr-agent.md per EC2-s3)'
  );

  // The rich agent must exist and cover the skill by body path.
  assert.ok(fs.existsSync(richFile), 'rich gdpr-agent.md must exist (skill coverage)');
  const richRaw = fs.readFileSync(richFile, 'utf8');
  assert.match(
    richRaw,
    /skills\/compliance\/gdpr-compliance-checker/,
    'gdpr-agent.md must reference skills/compliance/gdpr-compliance-checker (delegation)'
  );

  // The rich gdpr-agent.md is NOT type: wrapper.
  const richFrontMatch = richRaw.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(richFrontMatch, 'gdpr-agent.md must have a YAML frontmatter block');
  const richType = richFrontMatch[1]
    .split('\n')
    .map((l) => l.match(/^type:\s*(.*)$/))
    .filter(Boolean)
    .map((m) => m[1].trim())[0];
  assert.notEqual(richType, 'wrapper', 'rich gdpr-agent.md must NOT be type: wrapper');
});
