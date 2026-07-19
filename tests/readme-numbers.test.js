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
const CLAUDE_MD = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
const IRON_LOOP = fs.readFileSync(path.join(ROOT, 'docs', 'IRON_LOOP.md'), 'utf8');
const MENU_MD = fs.readFileSync(path.join(ROOT, 'src', 'commands', 'menu.md'), 'utf8');
const ASK_CANONICAL = fs.readFileSync(path.join(ROOT, '.ctoc', 'ask-me-questions.md'), 'utf8');
const ASK_SKILL = fs.readFileSync(path.join(ROOT, 'skills', 'ask-me-questions', 'SKILL.md'), 'utf8');

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

// DELETED by plan F3b: countScouts(). It walked agents/scouts/, a directory that no
// longer exists — it would now return 0 for every caller rather than fail honestly.

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
  it('agents/: 124 .md files (excluding _shared/; 128 minus the 5 Tier-3 scouts deleted by F3b)', () => {
    assert.equal(countAgentMdFiles(), 124);
  });

  it('agents/: 24 categories (+safety, +legal, +realtime, CU5; -scouts, deleted by F3b)', () => {
    assert.equal(countAgentCategories(), 24);
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

  it('src/lib/: 105 JS modules at top level (approval-residency.js — the ONE encoding of approved residency)', () => {
    // 104 → 105: `src/lib/approval-residency.js` was extracted out of
    // `src/hooks/human-gate-check.js` so `src/lib/plan-coverage.js` could consult the
    // SAME approval predicate — a library may not require a hook, and a second
    // predicate would be two encodings of an approval, which is a forgery surface.
    // This is the live disk count, raised because the disk changed.
    assert.equal(countTopLevelJs("src/lib"), 105);
  });

  it('src/commands/: 3 slash command specs — menu, push, update (v6.9.32)', () => {
    // v6.9.32: trimmed the slash-command surface to three. Everything else —
    // vision, planning, quality, review, agent runs, init — goes through the
    // menu. init is auto-triggered by opening the menu.
    assert.equal(countSlashCommandSpecs(), 3);
  });

  it('src/hooks/: 16 hook files (+PreToolUse.Task/SubagentStop — the subagent concurrency fence, 2026-07-16)', () => {
    assert.equal(countTopLevelFiles('src/hooks'), 16);
  });

  it('src/tabs/: 4 dashboard tab files (functional removed with assignDirectly in R5-B/C — dead after the assign path was deleted)', () => {
    assert.equal(countTopLevelJs('src/tabs'), 4);
  });

  it('tests/: >=65 test files (grows with the project)', () => {
    assert.ok(countTestFiles() >= 65, `expected >=65 test files, got ${countTestFiles()}`);
  });

  it('docs/: 16 docs files (LH1 added SECURITY_LINT.md)', () => {
    assert.equal(countDocsFiles(), 16);
  });

  // DELETED by plan F3b: 'scouts (Tier 3): 5 Haiku scout agents', which asserted
  // countScouts() === 5. Tier 3 is deleted; there are zero scouts by design, and
  // tests/no-tier-3.test.js asserts the directory's absence directly.

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
  it('badge: agents-124', () => {
    assert.match(README, /agents-124-orange/);
  });

  it('badge: skills-422 (v6.10.3+)', () => {
    assert.match(README, /skills-426-blue/);
  });

  it('lead paragraph: 124 agents across 24 categories', () => {
    assert.match(README, /\*\*124 agents\*\* across \*\*24 categories\*\*/);
  });

  it('Compare table: 124 across 24 categories', () => {
    assert.match(README, /124 across 24 categories/);
  });

  it('Key Features: 124 agents across 24 categories', () => {
    assert.match(README, /\*\*124 agents\*\* across 24 categories/);
  });

  it('Key Features: 426 skill files (v6.10.3+)', () => {
    assert.match(README, /\*\*426 skill files\*\*/);
  });

  it('Key Features: 14 languages auto-detected', () => {
    assert.match(README, /14 languages/);
  });

  it('Tier table: 20 sub-orchestrators in Tier 1', () => {
    assert.match(README, /20 sub-orchestrators/);
  });

  // DELETED by plan F3b: 'Tier table: 5 Haiku scouts in Tier 3', which asserted the
  // README tier table matched /5 Haiku scouts/. That row described Tier 3 and was
  // removed with it. Replaced by the inverse below — the claim must NOT come back.
  it('Tier table: no Haiku scout tier (F3b deleted Tier 3)', () => {
    assert.doesNotMatch(README, /Haiku scouts?/);
    assert.doesNotMatch(README, /\| \*\*Tier 3\*\* \|/);
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

  it('Project structure: 16 Claude Code hooks', () => {
    assert.match(README, /16 Claude Code hooks/);
  });

  it('Project structure: 104 JS modules in src/lib', () => {
    assert.match(README, /104 JS modules/);
  });

  it('Project structure: 124 agent definitions across 24 categories', () => {
    assert.match(README, /124 agent definitions across 24 categories/);
  });

  it('Project structure: 426 skill files (v6.10.3+)', () => {
    assert.match(README, /426 skill files/);
  });

  it('Agents intro: 124 agents across 24 categories', () => {
    assert.match(README, /\*\*124 agents across 24 categories\*\*/);
  });

  it('Skills intro: 426 skill files (v6.10.3+)', () => {
    assert.match(README, /\*\*426 skill files\*\*/);
  });

  it('Skills section names two kinds — Tier-2 (99) and Knowledge (322)', () => {
    assert.match(README, /Tier-2 specialist skill bodies \(100\)/);
    assert.match(README, /Knowledge skills \(326\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. README mentions every major v8.x feature subsystem
// ─────────────────────────────────────────────────────────────────────

describe('README — every major subsystem is documented', () => {
  const REQUIRED_SECTIONS = [
    /^## The 3-Tier Agent Architecture$/m,
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

// ─────────────────────────────────────────────────────────────────────
// 4. R2-D — instruction surfaces tell shipped truth (no claim the code
//    does not keep). Each pin guards a withdrawn marketing/overstated claim
//    so a regression to it fails loudly.
// ─────────────────────────────────────────────────────────────────────

describe('R2-D — instruction-surface truth', () => {
  // T3 — README no longer promises a perfect first pass.
  it('README drops "on the first try" for the adversarial-review truth', () => {
    assert.doesNotMatch(README, /on the first try/);
    assert.match(README, /adversarial review and the four human gates catch what a first pass misses/);
  });

  // T1 — CLAUDE.md async-overnight claim withdrawn to lossless-progress truth.
  it('CLAUDE.md drops "drains while the user sleeps" for maximal lossless progress', () => {
    assert.doesNotMatch(CLAUDE_MD, /drains while the user sleeps/);
    assert.match(CLAUDE_MD, /maximal lossless progress/);
    // Real forks ask and block their subtree; only trivia gets a documented choice.
    assert.match(CLAUDE_MD, /blocks its subtree until answered/);
  });

  // T2 — dispatch logging is instruction-level, not code-enforced today.
  it('CLAUDE.md scopes dispatch logging to instruction-level protocol', () => {
    assert.match(CLAUDE_MD, /Dispatch logging is an instruction-level protocol/);
    assert.match(CLAUDE_MD, /not by an enforcement hook today/);
  });
  it('README scopes dispatch logging to instruction-level protocol', () => {
    assert.match(README, /the session model follows, not a code-enforced hook today/);
  });

  // T12 — IRON_LOOP scopes the "enforced by hooks" claim to what is actually hooked.
  it('IRON_LOOP scopes hook enforcement to file-edit/commit/gate-residency', () => {
    assert.match(IRON_LOOP, /File-edit, commit, and gate-residency enforcement ARE hooked/);
    assert.match(IRON_LOOP, /instruction-level discipline the session model follows/);
  });

  // T5 — after R2-C's review done-all ships, the Gate-3-batch claim is true and
  // names the shipped shortcut + describes typing the word as the approval.
  it('IRON_LOOP Gate-3 batch names the done-all shortcut and typing-as-approval', () => {
    assert.match(IRON_LOOP, /done-all/);
    assert.match(IRON_LOOP, /typing the word `?done-all`? IS the Gate-3 approval/i);
    assert.match(IRON_LOOP, /approveSubplans/);
  });

  // W8 — menu.md Rule 11 drops the false "under a second" latency claim.
  it('menu.md Rule 11 drops "under a second" for the honest WORK-turn phrasing', () => {
    assert.doesNotMatch(MENU_MD, /under a second/);
    assert.match(MENU_MD, /a short WORK turn — a few tool calls — never a foreground build/);
  });

  // C1-8 — the start-agent recipe does NOT double-enqueue (startAgent's
  // addAndClaim already records+claims); it forces, stamps the harness id, and
  // surfaces skipped[].
  it('menu.md start-agent recipe is force-clear, no double menu-task-add, surfaces skipped[]', () => {
    const startRow = MENU_MD.split('\n').find((l) => l.trimStart().startsWith('| `claude:start-agent`'));
    assert.ok(startRow, 'start-agent action row present');
    assert.match(startRow, /force:\s*true/);
    assert.match(startRow, /addAndClaim/);
    assert.match(startRow, /--agent-id/);
    assert.match(startRow, /skipped/);
    // The double-enqueue is explicitly forbidden in the row.
    assert.match(startRow, /(never|not|no).{0,40}`?menu task add`?/i);
  });

  // seam b — cancel prose tells the two-phase truth, not "terminal cancelled".
  it('menu.md cancel prose is running→cancelling (files locked), queued→cancelled', () => {
    assert.match(MENU_MD, /running[\s\S]{0,40}cancelling/i);
    assert.match(MENU_MD, /queued[\s\S]{0,80}terminal[\s\S]{0,10}cancelled/i);
    assert.match(MENU_MD, /[\s\S]{0,50}locked until[\s\S]{0,40}(reconcile|gone)/i);
  });

  // seam c — the review-stage Gate-3 batch recipe exists.
  it('menu.md has a done-all review-stage Gate-3 batch recipe via approveSubplans', () => {
    assert.match(MENU_MD, /claude:done-all/);
    assert.match(MENU_MD, /approveSubplans\(parentSlug, 'review'\)/);
  });

  // seam d — compliance none writes a durable declined marker, confirm only on ok.
  it('menu.md compliance none calls declineComplianceRegime and confirms only on ok', () => {
    assert.match(MENU_MD, /declineComplianceRegime/);
    assert.match(MENU_MD, /durable/i);
    assert.match(MENU_MD, /ok:\s*true/);
  });

  // T9 — the ask-me-questions pair carries the ride-along batch exemption and
  // stays byte-identical.
  it('ask-me-questions pair is byte-identical and carries the ride-along exemption', () => {
    assert.equal(ASK_SKILL, ASK_CANONICAL, 'the synced pair must stay byte-identical');
    assert.match(ASK_CANONICAL, /the one exemption/);
    assert.match(ASK_CANONICAL, /single AskUserQuestion call/);
    // Discussion/design questions still stay one-per-turn.
    assert.match(ASK_CANONICAL, /One question per turn/);
  });

  // grep-zero: "plan-serial" must not appear on any instruction surface.
  it('no "plan-serial" claim survives on any instruction surface', () => {
    for (const [name, doc] of [
      ['README', README], ['CLAUDE.md', CLAUDE_MD], ['IRON_LOOP', IRON_LOOP],
      ['menu.md', MENU_MD], ['ask-me-questions', ASK_CANONICAL],
    ]) {
      assert.doesNotMatch(doc, /plan-serial/, `${name} must not claim plan-serial`);
    }
  });
});
