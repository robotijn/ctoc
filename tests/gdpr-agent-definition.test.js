/**
 * Content-contract test for the GDPR agent definition (EC2-s3).
 *
 * The agent `agents/compliance/gdpr-agent.md` is not a human-facing runtime
 * surface — its PROSE is the contract (PI4: assert the real file). This test
 * drives the real artifact and asserts:
 *   1. the file exists + carries the Tier-2 frontmatter conventions;
 *   2. it names the EC1 gate (`shouldRunGdpr` in `compliance-regime`) and the
 *      "exit immediately / no output" contract;
 *   3. it references all four s1 helpers by name;
 *   4. it restates NO skill rule (no piiFields array literal, no BAD/SAFE
 *      example, no gdpr_article enum def) and instead references the skill;
 *   5. the old wrapper `gdpr-compliance-checker.md` agent is REMOVED;
 *   6. the SKILL.md is kept (only the AGENT wrapper is removed).
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AGENT_PATH = path.join(ROOT, 'agents', 'compliance', 'gdpr-agent.md');
const OLD_WRAPPER_PATH = path.join(ROOT, 'agents', 'compliance', 'gdpr-compliance-checker.md');
const SKILL_PATH = path.join(ROOT, 'skills', 'compliance', 'gdpr-compliance-checker', 'SKILL.md');

function readAgent() {
  return fs.readFileSync(AGENT_PATH, 'utf8');
}

/** Split the file into its YAML frontmatter block and the body prose. */
function splitFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  assert.ok(m, 'agent file must open with a --- frontmatter block ---');
  return { frontmatter: m[1], body: m[2] };
}

describe('EC2-s3 — gdpr-agent.md content contract', () => {
  it('1. file exists and carries the Tier-2 frontmatter conventions', () => {
    assert.ok(fs.existsSync(AGENT_PATH), 'agents/compliance/gdpr-agent.md must exist');
    const { frontmatter } = splitFrontmatter(readAgent());

    assert.match(frontmatter, /^name:\s*gdpr-agent\s*$/m, 'name: gdpr-agent');
    assert.match(frontmatter, /^category:\s*compliance\s*$/m, 'category: compliance');
    assert.match(frontmatter, /^tier:\s*2\s*$/m, 'tier: 2');
    assert.match(frontmatter, /^reads_ancestry:\s*true\s*$/m, 'reads_ancestry: true');
    assert.match(frontmatter, /^reports_to:\s*cto-chief\s*$/m, 'reports_to: cto-chief');

    // tools: Read, Grep only — NO Write, NO Bash, NO Edit (advisory, cannot write).
    const toolsLine = frontmatter.match(/^tools:\s*(.+)$/m);
    assert.ok(toolsLine, 'tools: line present');
    assert.match(toolsLine[1], /\bRead\b/, 'tools includes Read');
    assert.match(toolsLine[1], /\bGrep\b/, 'tools includes Grep');
    assert.doesNotMatch(toolsLine[1], /\bWrite\b/, 'tools must NOT include Write');
    assert.doesNotMatch(toolsLine[1], /\bBash\b/, 'tools must NOT include Bash');
    assert.doesNotMatch(toolsLine[1], /\bEdit\b/, 'tools must NOT include Edit');

    // max_subagents: 0 — the agent reads ancestry itself, spawns nothing.
    assert.match(frontmatter, /max_subagents:\s*0\s*$/m, 'max_subagents: 0');
  });

  it('2. names the EC1 gate function + module and the exit-immediately contract', () => {
    const { body } = splitFrontmatter(readAgent());
    assert.match(body, /shouldRunGdpr/, 'body names shouldRunGdpr');
    assert.match(body, /compliance-regime/, 'body names the compliance-regime module');
    // The "profile absent ⇒ no output, no tool calls" contract text.
    assert.match(
      body,
      /exit immediately|no output|makes? no tool calls|no tool calls/i,
      'body states the exit-immediately / no-output contract',
    );
  });

  it('3. references all four s1 helpers by name', () => {
    const { body } = splitFrontmatter(readAgent());
    for (const helper of [
      'mapPiiFieldToArticles',
      'validateFindingSchema',
      'normalizeSeverity',
      'routeFinding',
    ]) {
      assert.match(body, new RegExp(helper), `body references ${helper}`);
    }
    // Helper module named.
    assert.match(body, /gdpr-helpers/, 'body names the gdpr-helpers module');
  });

  it('4. restates NO skill rule; references the skill instead', () => {
    const { body } = splitFrontmatter(readAgent());

    // Does reference the skill (delegation-by-reference).
    assert.match(
      body,
      /skills\/compliance\/gdpr-compliance-checker/,
      'body references the skill by path (delegation)',
    );

    // Does NOT restate the skill's piiFields array literal.
    assert.doesNotMatch(body, /piiFields\s*[:=]\s*\[/, 'must not restate a piiFields array literal');

    // Does NOT contain a BAD:/SAFE: code example marker (skill authority only).
    assert.doesNotMatch(body, /^\s*BAD:/m, 'must not restate a BAD: example');
    assert.doesNotMatch(body, /^\s*SAFE:/m, 'must not restate a SAFE: example');

    // Does NOT contain a gdpr_article enum definition block.
    assert.doesNotMatch(body, /gdpr_article:\s*\n?\s*enum/, 'must not restate a gdpr_article enum def');
    assert.doesNotMatch(body, /gdpr_article:\s*\[/, 'must not restate a gdpr_article enum literal');
  });

  it('5. old wrapper agent gdpr-compliance-checker.md is REMOVED', () => {
    assert.equal(
      fs.existsSync(OLD_WRAPPER_PATH),
      false,
      'agents/compliance/gdpr-compliance-checker.md must be deleted (subsumed by gdpr-agent.md)',
    );
  });

  it('6. the SKILL.md is kept (only the AGENT wrapper is removed)', () => {
    assert.ok(
      fs.existsSync(SKILL_PATH),
      'skills/compliance/gdpr-compliance-checker/SKILL.md must still exist',
    );
  });
});
