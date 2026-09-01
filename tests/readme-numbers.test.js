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

const { computeDocCounts } = require('../src/lib/doc-counts');

const ROOT = path.join(__dirname, '..');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const CLAUDE_MD = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
const IRON_LOOP = fs.readFileSync(path.join(ROOT, 'docs', 'IRON_LOOP.md'), 'utf8');
const MENU_MD = fs.readFileSync(path.join(ROOT, 'src', 'commands', 'start.md'), 'utf8');
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

// Disk-derived values the README must state. The README's counts are a claim ABOUT
// this tree, so the contract comes from the tree — never from a literal a growing
// project silently falsifies. Read once, used by section 2's pins below.
const counts = computeDocCounts(ROOT);
const skillBodies = countSpecialistSkillBodies();

// ─────────────────────────────────────────────────────────────────────
// 1. Sanity — reality matches expected ranges
// ─────────────────────────────────────────────────────────────────────

describe('Ground truth — project counts (sanity checks)', () => {
  // GROWING tally (plan 00215): agents rise with normal work. Track the generator
  // (computeDocCounts.agents) instead of a frozen literal, so adding an agent never
  // taxes an undeclared CLAUDE.md edit. Still a real cross-check: this file's own
  // independent walk must equal the one source of truth release.js uses.
  it('agents/: countAgentMdFiles equals computeDocCounts.agents (grows with the project)', () => {
    assert.equal(countAgentMdFiles(), computeDocCounts(ROOT).agents);
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

  // GROWING tally (plan 00215): total skill .md files rise with normal work. The
  // old arbitrary 410–430 window is replaced by tracking the generator exactly, so
  // the count is never a hand-picked range and a skill add never taxes CLAUDE.md.
  it('skills/: countAllSkillMd equals computeDocCounts.skills (grows with the project)', () => {
    assert.equal(countAllSkillMd(), computeDocCounts(ROOT).skills);
  });

  it('src/lib/: top-level JS module count tracks computeDocCounts.libModules (109 today, grows)', () => {
    // 104 → 105: `src/lib/approval-residency.js` was extracted out of
    // `src/hooks/human-gate-check.js` so `src/lib/plan-coverage.js` could consult the
    // SAME approval predicate — a library may not require a hook, and a second
    // predicate would be two encodings of an approval, which is a forgery surface.
    // 105 → 106: `src/lib/real-path-confinement.js`. Root confinement and the
    // protected-directory guards were pure path ARITHMETIC, which cannot see a
    // symbolic link; both now share one real-path predicate, for the same
    // two-encodings-diverge reason.
    // 106 → 107: `src/lib/enforcement-liveness.js`. The enforcement log held 24
    // lifetime entries under a 1000-entry cap and nobody noticed; a guard that
    // has fallen over and reports nothing is indistinguishable from one that is
    // working. This module makes that silence loud.
    // 107 → 108: `src/lib/gate-words.js`. Screens printed "Gate 3 (review → done)"
    // at a human, and a gate number is an internal code out of CTOC's own docs —
    // the reader would need a numbered map of the pipeline in their head to decode
    // it. This module is the ONE encoding of what each moment IS in plain words
    // ("nothing is finished until you say so"), per site type. It is one module and
    // not four inline phrasings for the reason above: four encodings drift, and a
    // fence over a phrase living in four places cannot say which is canonical.
    // 108 → 109: `src/lib/human-facing-scan.js`. Screens were STILL printing gate
    // numbers ("Gate 3", the composed `` `Gate ${n}` `` whose source has no digit) at
    // a human across the menu-router screens AND the whole src/areas/* TUI family — a
    // prose rule against it kept silently un-truing. This module is the FENCE: it
    // PARSES every screen-producing module (a text search cannot see the composed
    // shape) and fails the build when a gate number reaches a person, and it defends
    // its own registry against rot by detecting both screen contracts.
    // GROWING tally (plan 00215): src/lib modules rise with normal work. Track the
    // generator (computeDocCounts.libModules) — release.js writes this number into
    // CLAUDE.md — instead of a frozen literal a module add would have to hand-edit.
    assert.equal(countTopLevelJs('src/lib'), computeDocCounts(ROOT).libModules);
  });

  it('src/commands/: 3 slash command specs — menu, push, update (v6.9.32)', () => {
    // v6.9.32: trimmed the slash-command surface to three. Everything else —
    // vision, planning, quality, review, agent runs, init — goes through the
    // menu. init is auto-triggered by opening the menu.
    assert.equal(countSlashCommandSpecs(), 3);
  });

  it('src/hooks/: 17 hook files (+UserPromptSubmit — the per-request CTOC-routing reminder, 2026-07-31)', () => {
    assert.equal(countTopLevelFiles('src/hooks'), 17);
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

  it('badge: skills-<count> (derived from disk)', () => {
    assert.match(README, new RegExp(`skills-${counts.skills}-blue`));
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

  it('Key Features: skill-file total (derived from disk)', () => {
    assert.match(README, new RegExp(`\\*\\*${counts.skills} skill files\\*\\*`));
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

  it('Project structure: 17 Claude Code hooks', () => {
    assert.match(README, /17 Claude Code hooks/);
  });

  it('Project structure: JS modules in src/lib (derived from disk)', () => {
    assert.match(README, new RegExp(`${counts.libModules} JS modules`));
  });

  it('Project structure: 124 agent definitions across 24 categories', () => {
    assert.match(README, /124 agent definitions across 24 categories/);
  });

  it('Project structure: skill files (derived from disk)', () => {
    assert.match(README, new RegExp(`${counts.skills} skill files`));
  });

  it('Agents intro: 124 agents across 24 categories', () => {
    assert.match(README, /\*\*124 agents across 24 categories\*\*/);
  });

  it('Skills intro: skill-file total (derived from disk)', () => {
    assert.match(README, new RegExp(`\\*\\*${counts.skills} skill files\\*\\*`));
  });

  it('Skills section names two kinds — specialist bodies and knowledge files (derived from disk)', () => {
    assert.match(README, new RegExp(`Tier-2 specialist skill bodies \\(${skillBodies}\\)`));
    assert.match(README, new RegExp(`Knowledge skills \\(${counts.skills - skillBodies}\\)`));
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

  // W8 — start.md Rule 11 drops the false "under a second" latency claim.
  it('start.md Rule 11 drops "under a second" for the honest WORK-turn phrasing', () => {
    assert.doesNotMatch(MENU_MD, /under a second/);
    assert.match(MENU_MD, /a short WORK turn — a few tool calls — never a foreground build/);
  });

  // C1-8 — the start-agent recipe does NOT double-enqueue (startAgent's
  // addAndClaim already records+claims); it forces, stamps the harness id, and
  // surfaces skipped[].
  it('start.md start-agent recipe is force-clear, no double menu-task-add, surfaces skipped[]', () => {
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
  it('start.md cancel prose is running→cancelling (files locked), queued→cancelled', () => {
    assert.match(MENU_MD, /running[\s\S]{0,40}cancelling/i);
    assert.match(MENU_MD, /queued[\s\S]{0,80}terminal[\s\S]{0,10}cancelled/i);
    assert.match(MENU_MD, /[\s\S]{0,50}locked until[\s\S]{0,40}(reconcile|gone)/i);
  });

  // seam c — the review-stage Gate-3 batch recipe exists.
  it('start.md has a done-all review-stage Gate-3 batch recipe via approveSubplans', () => {
    assert.match(MENU_MD, /claude:done-all/);
    assert.match(MENU_MD, /approveSubplans\(parentSlug, 'review'\)/);
  });

  // seam d — compliance none writes a durable declined marker, confirm only on ok.
  it('start.md compliance none calls declineComplianceRegime and confirms only on ok', () => {
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
      ['start.md', MENU_MD], ['ask-me-questions', ASK_CANONICAL],
    ]) {
      assert.doesNotMatch(doc, /plan-serial/, `${name} must not claim plan-serial`);
    }
  });
});
