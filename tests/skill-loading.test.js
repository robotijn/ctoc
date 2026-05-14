/**
 * Tests for B2 — skill loading (auto-load triggers + frontmatter validation)
 *
 * Per the B2 plan's NFR-5, the test corpus exercises whether each converted
 * skill's `when_to_load` triggers match expected natural-language prompts.
 * Acceptance: ≥90% of corpus entries match the expected skill via substring
 * match against the skill's `when_to_load` array.
 *
 * Also verifies:
 *   - Every redirect stub in agents/ points at an existing skill
 *   - Every skill has valid v7 frontmatter
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

const { resolveAgent, listConvertedAgents } = require('../src/lib/agent-resolver');

const REQUIRED_SKILL_FIELDS = ['name', 'description', 'when_to_load', 'related_skills', 'effort_level', 'model_optimized_for'];

// Test corpus — per B2-6 refinement.
// Each entry: a natural-language prompt + the skill that should auto-load.
// As more agents convert, append more entries here.
const TRIGGER_CORPUS = [
  { prompt: 'please review my code', expects: 'code-reviewer' },
  { prompt: 'doing a code review', expects: 'code-reviewer' },
  { prompt: 'check code quality of this module', expects: 'code-reviewer' },
  { prompt: 'find dead code', expects: 'dead-code-detector' },
  { prompt: 'look for unused code', expects: 'dead-code-detector' },
  { prompt: 'find duplicate code', expects: 'duplicate-code-detector' },
  { prompt: 'check for DRY violations', expects: 'duplicate-code-detector' },
  { prompt: 'architecture check on this module', expects: 'architecture-checker' },
  { prompt: 'detect circular dependency in the imports', expects: 'architecture-checker' },
  { prompt: 'find code smell in this file', expects: 'code-smell-detector' },
  { prompt: 'this code is bad and messy', expects: 'code-smell-detector' },
  { prompt: 'cyclomatic complexity audit', expects: 'complexity-analyzer' },
  { prompt: 'cognitive complexity report', expects: 'complexity-analyzer' },
  { prompt: 'reduce complexity in this function', expects: 'complexity-reducer' },
  { prompt: 'refactor this function for readability', expects: 'complexity-reducer' },
  { prompt: 'consistency check across files', expects: 'consistency-checker' },
  { prompt: 'naming convention audit', expects: 'consistency-checker' },
  { prompt: 'performance check on the build', expects: 'performance-validator' },
  { prompt: 'detect benchmark regression', expects: 'performance-validator' },
  { prompt: 'run the quality gate', expects: 'quality-gate' },
  { prompt: 'is the quality gate passing', expects: 'quality-gate' },
  { prompt: 'run a type check', expects: 'type-checker' },
  { prompt: 'static type check this project', expects: 'type-checker' },
];

function parseSkillFrontmatter(skillPath) {
  const content = fs.readFileSync(skillPath, 'utf8');
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  const lines = m[1].split('\n');
  let currentKey = null;
  for (const line of lines) {
    if (line.match(/^\s+-\s+/)) {
      if (currentKey) {
        if (!Array.isArray(fm[currentKey])) fm[currentKey] = [];
        fm[currentKey].push(line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, '').trim());
      }
    } else {
      const c = line.indexOf(':');
      if (c > 0) {
        const k = line.slice(0, c).trim();
        let v = line.slice(c + 1).trim();
        if (v === '') {
          // list-key, expect items to follow
          currentKey = k;
          fm[k] = [];
        } else {
          fm[k] = v.replace(/^["']|["']$/g, '');
          currentKey = null;
        }
      }
    }
  }
  return fm;
}

function listConvertedSkills() {
  const converted = listConvertedAgents(projectRoot);
  return converted.map(c => ({
    agentPath: c.agentPath,
    targetSkill: c.targetSkill,
    skillPath: path.join(projectRoot, 'skills', c.targetSkill, 'SKILL.md'),
  }));
}

describe('B2 — redirect stubs point to existing skills', () => {
  const converted = listConvertedSkills();

  it('at least one agent has been converted (pilot batch)', () => {
    assert.ok(converted.length >= 1, `expected ≥1 converted agent, got ${converted.length}`);
  });

  for (const c of listConvertedSkills()) {
    it(`${c.agentPath} → ${c.targetSkill} resolves to an existing skill`, () => {
      const result = resolveAgent(c.agentPath, projectRoot);
      assert.equal(result.kind, 'redirected', `${c.agentPath} should resolve to redirected (got ${result.kind})`);
      assert.ok(fs.existsSync(result.path), `target skill file must exist at ${result.path}`);
    });
  }
});

describe('B2 — every converted skill has valid v7 frontmatter', () => {
  for (const c of listConvertedSkills()) {
    it(`${c.targetSkill} declares all required v7 fields`, () => {
      const fm = parseSkillFrontmatter(c.skillPath);
      assert.ok(fm, `frontmatter parseable at ${c.skillPath}`);
      for (const field of REQUIRED_SKILL_FIELDS) {
        assert.ok(field in fm, `${c.targetSkill} missing field: ${field}`);
      }
      assert.equal(fm.model_optimized_for, 'opus-4-7', `${c.targetSkill} must be marked for opus-4-7`);
      assert.ok(Array.isArray(fm.when_to_load), `${c.targetSkill} when_to_load must be a list`);
      assert.ok(fm.when_to_load.length >= 2, `${c.targetSkill} should have ≥2 triggers`);
    });
  }
});

describe('B2-6 — auto-load trigger corpus matches expected skill', () => {
  function matchSkill(prompt, converted) {
    const lowerPrompt = prompt.toLowerCase();
    for (const c of converted) {
      const fm = parseSkillFrontmatter(c.skillPath);
      if (!fm || !Array.isArray(fm.when_to_load)) continue;
      for (const trigger of fm.when_to_load) {
        if (lowerPrompt.includes(trigger.toLowerCase())) {
          return c.targetSkill.split('/').pop(); // return skill name
        }
      }
    }
    return null;
  }

  const converted = listConvertedSkills();

  it('TRIGGER_CORPUS has entries to test', () => {
    assert.ok(TRIGGER_CORPUS.length >= 5, 'expect at least 5 corpus entries');
  });

  // Filter corpus to skills that actually exist (so adding the corpus before
  // converting an agent doesn't make tests fail spuriously)
  const convertedNames = new Set(converted.map(c => c.targetSkill.split('/').pop()));
  const applicableCorpus = TRIGGER_CORPUS.filter(e => convertedNames.has(e.expects));

  if (applicableCorpus.length > 0) {
    let hits = 0;
    for (const entry of applicableCorpus) {
      const matched = matchSkill(entry.prompt, converted);
      if (matched === entry.expects) hits += 1;
    }
    const rate = hits / applicableCorpus.length;

    it(`${hits}/${applicableCorpus.length} prompts match expected skill (≥90% required)`, () => {
      assert.ok(rate >= 0.9, `match rate ${(rate * 100).toFixed(1)}% < 90%`);
    });
  }
});
