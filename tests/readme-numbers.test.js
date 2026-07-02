/**
 * Guard tests for README numeric claims (v6.9.24).
 *
 * Pins every count the README states so the file can't silently drift when
 * agents/skills/commands/tests are added or removed. If a count changes,
 * one of these tests will fail and the README must be updated alongside.
 *
 * Tests verify:
 *   1. Reality matches what we expect (sanity check on the project)
 *   2. README explicitly states the right number(s)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

// ─────────────────────────────────────────────────────────────────────
// Filesystem-derived ground truth
// ─────────────────────────────────────────────────────────────────────

function walk(dir, predicate) {
  const acc = [];
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) acc.push(...walk(full, predicate));
    else if (predicate(full)) acc.push(full);
  }
  return acc;
}

function countAgentMdFiles() {
  // Every .md under agents/, excluding _shared/
  return walk(path.join(ROOT, 'agents'), p => p.endsWith('.md') && !p.includes(`${path.sep}_shared${path.sep}`)).length;
}

function countAgentCategories() {
  // Top-level subdirectories under agents/, excluding _shared
  return fs.readdirSync(path.join(ROOT, 'agents'), { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '_shared').length;
}

function countSpecialistSkillBodies() {
  // Every SKILL.md anywhere under skills/
  return walk(path.join(ROOT, 'skills'), p => path.basename(p) === 'SKILL.md').length;
}

function countAllSkillMd() {
  return walk(path.join(ROOT, 'skills'), p => p.endsWith('.md')).length;
}

function countTopLevelJs(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return 0;
  return fs.readdirSync(full).filter(f => f.endsWith('.js')).length;
}

function countTopLevelFiles(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return 0;
  return fs.readdirSync(full).filter(f => {
    const stat = fs.statSync(path.join(full, f));
    return stat.isFile();
  }).length;
}

function countTestFiles() {
  const full = path.join(ROOT, 'tests');
  return fs.readdirSync(full).filter(f => f.endsWith('.test.js')).length;
}

function countSlashCommandSpecs() {
  // Slash commands are defined by .md files in src/commands/
  return fs.readdirSync(path.join(ROOT, 'src', 'commands'))
    .filter(f => f.endsWith('.md')).length;
}

function countDocsFiles() {
  return fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.md')).length;
}

function countScouts() {
  return walk(path.join(ROOT, 'agents', 'scouts'), p => p.endsWith('.md')).length;
}

function countFrameworkRefs(category) {
  const dir = path.join(ROOT, 'skills', 'frameworks', category);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).length;
}

function countLanguages() {
  return fs.readdirSync(path.join(ROOT, 'skills', 'languages')).filter(f => f.endsWith('.md')).length;
}

function countQualityConfigs() {
  return walk(path.join(ROOT, 'skills', 'quality-configs'), p => p.endsWith('.md')).length;
}

// ─────────────────────────────────────────────────────────────────────
// 1. Sanity — reality matches expected ranges
// ─────────────────────────────────────────────────────────────────────

describe('Ground truth — project counts (sanity checks)', () => {
  it('agents/: 110 .md files (excluding _shared/, ivv-chief added in v6.9.27)', () => {
    assert.equal(countAgentMdFiles(), 110);
  });

  it('agents/: 22 categories', () => {
    assert.equal(countAgentCategories(), 22);
  });

  it('skills/: 99 SKILL.md specialist bodies (v6.9.27 added 8 cross-industry-critique skills)', () => {
    // v6.9.15–v6.9.23: improved 86 existing SKILL.md via websearch→update→critique→update.
    // v6.9.24: added 5 gap-fill skills (sbom-cra-checker, threat-modeler,
    // ai-governance-checker, llm-security-tester, incident-responder) via v3 critique.
    // Pin at >= 91 to allow future growth.
    const count = countSpecialistSkillBodies();
    assert.ok(count >= 99, `expected >= 99 SKILL.md, got ${count}`);
  });

  it('skills/: total .md count is in v6.9.27+ range (413 → 421 after 8 cross-industry-critique skill adds)', () => {
    const total = countAllSkillMd();
    assert.ok(total >= 410 && total <= 430, `expected 410-430 .md files in skills/, got ${total}`);
  });

  it('src/lib/: 112 JS modules at top level (task-view added for NB2)', () => {
    assert.equal(countTopLevelJs('src/lib'), 112);
  });

  it('src/commands/: 3 slash command specs — menu, push, update (v6.9.32)', () => {
    // v6.9.32: trimmed the slash-command surface to three. Everything else —
    // vision, planning, quality, review, agent runs, init — goes through the
    // menu. init is auto-triggered by opening the menu.
    assert.equal(countSlashCommandSpecs(), 3);
  });

  it('src/hooks/: 13 hook files (andon-halt added v6.9.27)', () => {
    assert.equal(countTopLevelFiles('src/hooks'), 13);
  });

  it('src/tabs/: 8 dashboard tab files', () => {
    assert.equal(countTopLevelJs('src/tabs'), 8);
  });

  it('tests/: >=65 test files (grows with the project)', () => {
    assert.ok(countTestFiles() >= 65, `expected >=65 test files, got ${countTestFiles()}`);
  });

  it('docs/: 16 docs files (LH1 added SECURITY_LINT.md)', () => {
    assert.equal(countDocsFiles(), 16);
  });

  it('scouts (Tier 3): 5 Haiku scout agents', () => {
    assert.equal(countScouts(), 5);
  });

  it('skills/languages: 50 language references', () => {
    assert.equal(countLanguages(), 50);
  });

  it('skills/frameworks/web: 85 web framework references', () => {
    assert.equal(countFrameworkRefs('web'), 85);
  });

  it('skills/frameworks/ai-ml: 44 AI/ML framework references', () => {
    assert.equal(countFrameworkRefs('ai-ml'), 44);
  });

  it('skills/frameworks/data: 52 data framework references', () => {
    assert.equal(countFrameworkRefs('data'), 52);
  });

  it('skills/frameworks/devops: 15 DevOps framework references', () => {
    assert.equal(countFrameworkRefs('devops'), 15);
  });

  it('skills/frameworks/mobile: 15 mobile framework references', () => {
    assert.equal(countFrameworkRefs('mobile'), 15);
  });

  it('skills/quality-configs: 61 per-language quality config refs', () => {
    assert.equal(countQualityConfigs(), 61);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. README claims match reality
// ─────────────────────────────────────────────────────────────────────

describe('README — explicit numeric claims match reality', () => {
  it('badge: agents-110', () => {
    assert.match(README, /agents-110-orange/);
  });

  it('badge: skills-413 (v6.9.24+)', () => {
    assert.match(README, /skills-421-blue/);
  });

  it('lead paragraph: 110 agents across 22 categories', () => {
    assert.match(README, /\*\*110 agents\*\* across \*\*22 categories\*\*/);
  });

  it('Compare table: 110 across 22 categories', () => {
    assert.match(README, /110 across 22 categories/);
  });

  it('Key Features: 110 agents across 22 categories', () => {
    assert.match(README, /\*\*110 agents\*\* across 22 categories/);
  });

  it('Key Features: 421 skill files (v6.9.24+)', () => {
    assert.match(README, /\*\*421 skill files\*\*/);
  });

  it('Key Features: 14 languages auto-detected', () => {
    assert.match(README, /14 languages/);
  });

  it('Tier table: 16 sub-orchestrators in Tier 1', () => {
    assert.match(README, /16 sub-orchestrators/);
  });

  it('Tier table: 5 Haiku scouts in Tier 3', () => {
    assert.match(README, /5 Haiku scouts/);
  });

  it('Refinement loop: K-budget phases listed (critical/medium/low/final)', () => {
    assert.match(README, /Critical/);
    assert.match(README, /Medium/);
    assert.match(README, /Low/);
    assert.match(README, /Final sweep/);
  });

  it('Product Loop: 17 KPIs claim', () => {
    assert.match(README, /17 (KPIs|canonical KPIs)/);
  });

  it('SaaS templates: B2C + B2B both listed as ready', () => {
    assert.match(README, /saas\/b2c-subscription.*ready/i);
    assert.match(README, /saas\/b2b-sales-led.*ready/i);
  });

  it('Project structure: 3 slash commands', () => {
    assert.match(README, /3 slash commands/);
  });

  it('Project structure: 12 Claude Code hooks', () => {
    assert.match(README, /13 Claude Code hooks/);
  });

  it('Project structure: 112 JS modules in src/lib', () => {
    assert.match(README, /112 JS modules/);
  });

  it('Project structure: 110 agent definitions across 22 categories', () => {
    assert.match(README, /110 agent definitions across 22 categories/);
  });

  it('Project structure: 421 skill files (v6.9.24+)', () => {
    assert.match(README, /421 skill files/);
  });

  it('Agents intro: 110 agents across 22 categories', () => {
    assert.match(README, /\*\*110 agents across 22 categories\*\*/);
  });

  it('Skills intro: 421 skill files (v6.9.24+)', () => {
    assert.match(README, /\*\*421 skill files\*\*/);
  });

  it('Skills section names two kinds — Tier-2 (99) and Knowledge (322)', () => {
    assert.match(README, /Tier-2 specialist skill bodies \(99\)/);
    assert.match(README, /Knowledge skills \(322\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. README mentions every major v8.x feature subsystem
// ─────────────────────────────────────────────────────────────────────

describe('README — every major subsystem is documented', () => {
  const REQUIRED_SECTIONS = [
    /^## The 4-Tier Agent Architecture$/m,
    /^## The Refinement Loop$/m,
    /^## The Canvas — 6-Month Pre-Mortem \+ 5-Scenario Cash Flow$/m,
    /^## The Product Loop$/m,
    /^## SaaS Production-Readiness Templates$/m,
    /^## Agents$/m,
    /^## Skills$/m,
    /^## The Iron Loop$/m,
    /^## Commands$/m,
  ];

  for (const rx of REQUIRED_SECTIONS) {
    it(`section present: ${rx.source}`, () => {
      assert.match(README, rx);
    });
  }
});
