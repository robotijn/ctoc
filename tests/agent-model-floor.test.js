/**
 * Fence: the agent model floor.
 *
 * THE RULE: a reviewer may not think with a smaller model than the builder it
 * reviews. The code writer at Iron Loop Step 10 is Opus. Any agent that READS
 * CODE OR ARTIFACTS AND EMITS FINDINGS — a "watcher" — is therefore Opus too.
 * A watcher on a smaller model does not produce a review; it produces a green
 * record. Owner ruling, 2026-07-17, verbatim:
 *
 *   "A scout is NOT A STUPID REGEX WITH HAIKU, IT IS AN OPUS THINKING ABOUT
 *    THE CODE. CTO Chief dispatches real agents to check on the code and
 *    aggregates the information, then steers the build."
 *
 * WHY A FENCE AND NOT JUST AN EDIT: the sibling field `model_optimized_for` was
 * deleted corpus-wide once, then RESURRECTED in 26 agent files by an 85-agent
 * `git restore` from an older commit. Its fence — tests/no-model-optimized-for.js —
 * caught the regression and went red on all 26. Nobody read the red. The lesson is
 * not that the fence was missing; it is that a declaration nothing asserts on drifts
 * the moment anyone restores from history. `model:` had no such assertion at all.
 * This file is that assertion, and nothing more.
 *
 * SCOPE — deliberately narrow. This file does NOT check `model_optimized_for`.
 * tests/no-model-optimized-for.test.js already fences it, covers `skills/**` as well
 * as `agents/**`, and carries a non-vacuity guard. A second, weaker fence on one
 * invariant is worse than none: it splits attention, and the next author edits
 * whichever copy they find first. One invariant, one fence.
 *
 * ZERO DOUBLES: every assertion below walks the real `agents/` tree and reads real
 * frontmatter off disk. Nothing here is mocked, stubbed, or fixtured.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const agentsRoot = path.join(projectRoot, 'agents');

// ─────────────────────────────────────────────────────────────────────────────
//  Frontmatter parsing — anchored at byte 0, deliberately
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the YAML frontmatter block, anchored at byte 0.
 *
 * The byte-0 anchor is not stylistic — it makes this test agree with the Claude
 * Code runtime, which honours frontmatter ONLY when the file opens with `---`.
 * A match-anywhere regex would parse a YAML block sitting below an `# H1` as if
 * it were a live declaration, certifying a contract the runtime never reads.
 * Same anchor as tests/architecture-invariants.test.js (finding C7).
 *
 * It also defends against a real trap in this corpus:
 * agents/planning/implementation-planner.md declares `model: opus` at line 5 and
 * ALSO contains the literal line `model: opus|sonnet` at line 162 — inside a
 * fenced markdown code block that documents the agent-file format. A naive
 * `grep '^model:'` reads that example as a second declaration and reports a
 * corpus of 129 model declarations across 128 files. Frontmatter-scoped parsing
 * is the only reading that matches what actually runs.
 */
function parseFrontmatter(content) {
  const m = /^---\n([\s\S]*?)\n---/.exec(content);
  return m ? m[1] : '';
}

/** All values declared for `key` in a frontmatter block, in order. */
function frontmatterValues(fm, key) {
  const re = new RegExp(`^${key}:[ \\t]*(.*)$`, 'gm');
  const out = [];
  let m;
  while ((m = re.exec(fm)) !== null) out.push(m[1].trim());
  return out;
}

/** Recursively collect every agent .md file, skipping dot- and underscore-names. */
function walkAgentFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkAgentFiles(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

/** "agents/quality/type-checker.md" -> "quality/type-checker" */
function agentId(file) {
  return path
    .relative(agentsRoot, file)
    .replace(/\.md$/, '')
    .split(path.sep)
    .join('/');
}

/** Load every agent on disk as { id, file, rel, fm, model, models, effort, efforts }. */
function loadAgents() {
  return walkAgentFiles(agentsRoot).map((file) => {
    const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    const models = frontmatterValues(fm, 'model');
    const efforts = frontmatterValues(fm, 'effort');
    return {
      id: agentId(file),
      file,
      rel: path.relative(projectRoot, file),
      fm,
      models,
      model: models.length === 1 ? models[0] : null,
      efforts,
      effort: efforts.length === 1 ? efforts[0] : null,
    };
  });
}

const AGENTS = loadAgents();

// ─────────────────────────────────────────────────────────────────────────────
//  The data: who is what, and why
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WATCHERS — reads code or artifacts, emits findings. Every one of these judges
 * Opus-written code, so every one of these runs on Opus.
 *
 * This is an explicit list, not a name pattern. A pattern ("*-checker",
 * "*-analyzer") would silently capture actuators and silently miss watchers that
 * do not follow the naming convention. Membership here is a reviewable act.
 */
const WATCHERS = [
  'ai-quality/citation-validator',
  'architecture/dependency-analyzer',
  'compliance/license-scanner',
  'devex/api-deprecation-checker',
  'devex/onboarding-validator',
  'frontend/bundle-analyzer',
  'frontend/component-tester',
  'frontend/visual-regression-checker',
  'infrastructure/ci-pipeline-checker',
  'infrastructure/docker-security-checker',
  'quality/complexity-analyzer',
  'quality/consistency-checker',
  'quality/dead-code-detector',
  'quality/duplicate-code-detector',
  'quality/type-checker',
  'security/dependency-auditor',
  'security/dependency-checker',
  'specialized/accessibility-checker',
  'specialized/api-contract-validator',
  'specialized/configuration-validator',
  'specialized/health-check-validator',
  'specialized/observability-checker',
  'specialized/translation-checker',
  'testing/coverage-enforcer',
  'testing/coverage-mapper',
  'versioning/feature-flag-auditor',
];

/**
 * SONNET_EXEMPT — the ONLY agents permitted to declare `model: sonnet`, each with
 * a written reason. The list is data, not inference: a test that guessed which
 * agents "look like" actuators would rot the first time someone added one. A new
 * sonnet agent fails the build until a human justifies it here, in writing.
 */
const SONNET_EXEMPT = {
  'documentation/changelog-generator':
    'Actuator — writes docs. Does not read code and emit findings.',
  'documentation/documentation-updater':
    'Actuator — writes docs. Does not read code and emit findings.',
  'infrastructure/ci-runner-setup': 'Actuator — configures CI. Not a watcher.',
  'infrastructure/deployment-setup': 'Actuator — configures deployment. Not a watcher.',
  'planning/product-owner':
    'Asks the human questions to build context. Does not read code and emit findings. Raising it is a separate owner decision.',
  'planning/vision-advisor':
    'Asks the human questions to build context. Does not read code and emit findings. Raising it is a separate owner decision.',
  'saas/inngest-jobs': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/posthog-analytics': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/rate-limiting': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/resend-email': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/sentry-errors': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/vercel-deploy': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'testing/runners/smoke-test-runner':
    'Executes a command and reports its output; smart-test-runner (opus) owns flaky-test judgement above it. Flagged for review in plan F3a Decision 2.',
  'testing/runners/unit-test-runner':
    'Executes a command and reports its output; smart-test-runner (opus) owns flaky-test judgement above it. Flagged for review in plan F3a Decision 2.',
};

/**
 * HAIKU_EXEMPT — EMPTY, and it must stay that way.
 *
 * This list held the five Tier-3 scouts, the only haiku agents in the corpus. Plan
 * F3b deleted Tier 3 wholesale on 2026-07-17, exactly as this comment anticipated:
 * the `vanished` check below went red, and F3b emptied the list rather than papering
 * over it. No agent declares `model: haiku` today.
 *
 * An empty exemption list is not a dead constant — it is the ratchet. Every agent is
 * now held to the model floor with zero exceptions, and adding a name back here is a
 * visible, reviewable act that requires an owner decision.
 */
const HAIKU_EXEMPT = [];

/**
 * EFFORT_EXEMPT — the ONLY agents permitted to declare an effort below `max`, each
 * with a written reason.
 *
 * THE SECOND RULE, and the reason this map is shaped as an EXEMPTION rather than a
 * roster: a watcher that thinks with Opus but at `medium` is half a watcher. Owner
 * ruling, 2026-07-17, verbatim: "ok let the agents have xhigh" — answering directly
 * whether `effort` should rise alongside `model: opus`. It should, to `xhigh`: the
 * highest level on the documented scale (`low, medium, high, xhigh, max`) that
 * Anthropic does not caveat. See TOP_EFFORT below for the evidence he reversed on.
 *
 * WHY EXCLUSION, NOT ENUMERATION: the watcher set is ~91 agents. A 91-name list is
 * where transcription errors live, and it rots the first time someone adds an agent —
 * a new watcher would default to UNCHECKED. Inverted, a new agent defaults to being a
 * watcher and must be argued INTO this map to think at anything less. The ratchet
 * points at the corpus, not away from it.
 *
 * COORDINATORS ARE DELIBERATELY NOT EXEMPT. `coordinator/synthesizer` is the
 * aggregator that resolves every cross-pillar conflict in the system; if anything in
 * this corpus thinks at the top of the scale, it does.
 */
const EFFORT_EXEMPT = {
  // ---- Actuators: they write, they do not watch ---------------------------------
  // Effort on an actuator is a separate decision the owner has not made. A writer
  // thinking harder produces more code, not more findings — the cost/benefit is not
  // the watcher's, and nobody has ruled on it. Out of scope for this fence.
  'documentation/changelog-generator':
    'Actuator — writes the changelog. Its effort is an unmade owner decision, not a watcher floor.',
  'documentation/documentation-updater':
    'Actuator — writes docs. Its effort is an unmade owner decision, not a watcher floor.',
  'infrastructure/ci-runner-setup':
    'Actuator — configures CI. Its effort is an unmade owner decision, not a watcher floor.',
  'infrastructure/deployment-setup':
    'Actuator — configures deployment. Its effort is an unmade owner decision, not a watcher floor.',
  'iron-loop/iron-loop-executor':
    'Actuator — writes the code at Step 10. It is the BUILDER the watchers judge, not a watcher.',
  'iron-loop/iron-loop-integrator':
    'Actuator — merges and applies changes. It acts on findings; it does not emit them.',
  'pipeline/agent-publisher':
    'Actuator — publishes agent files. It does not read code and emit findings.',
  'pipeline/agent-writer':
    'Actuator — writes agent files. It does not read code and emit findings.',
  'quality/complexity-reducer':
    'Actuator — rewrites code to cut complexity. complexity-analyzer (a watcher) judges it.',
  'testing/writers/e2e-test-writer':
    'Actuator — writes tests. The test it writes is the finding; the writing is not a review.',
  'testing/writers/integration-test-writer':
    'Actuator — writes tests. The test it writes is the finding; the writing is not a review.',
  'testing/writers/property-test-writer':
    'Actuator — writes tests. The test it writes is the finding; the writing is not a review.',
  'testing/writers/unit-test-writer':
    'Actuator — writes tests. The test it writes is the finding; the writing is not a review.',

  // ---- Planners: they ask the human, they do not check code ----------------------
  // These elicit context from a person. Their bottleneck is the human's answer, not
  // the model's thinking depth. Raising them is a separate owner decision.
  //
  // THREE PLANNERS LEFT THIS MAP WHEN THE FLOOR MOVED (plan F3d), and the reason is
  // worth keeping: implementation-planner, product-owner and vision-advisor were
  // already sitting at `effort: xhigh` before F3c. Under F3c's `max` floor, xhigh was
  // BELOW the floor, so their exemption was a licence they were actually using. F3d
  // lowered the floor to `xhigh` — so they are now AT it, and the licence became dead
  // weight. The `stale` assertion in 'the effort exemption map is exhaustive and
  // accurate' went red on exactly these three and is what surfaced it. Their agent
  // files were NOT touched: F3d changed `max` -> `xhigh` and nothing else. Removing
  // the entries only tightens the ratchet — dropping one of these below `xhigh` now
  // requires arguing it back into this map in the open.
  'planning/kpi-planner':
    'Planner — elicits KPI targets from the human. Bottleneck is the answer, not thinking depth.',
  'planning/stack-chooser':
    'Planner — presents stack templates to the human for a decision. Not a code watcher.',
  'planning/unit-economics-modeler':
    'Planner — elicits business model inputs from the human. Out of the technical watcher chain.',
  'planning/vision-decomposer':
    'Planner — decomposes a stated vision into plans. Elicitation, not code review.',

  // ---- Deleted by plan F3b: the five Tier-3 scouts held five entries here --------
  // They are gone from disk, so an exemption for them would be dead weight.

  // ---- Scheduled for demotion: plan W2 demotes these to skills -------------------
  'saas/clerk-auth': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/inngest-jobs': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/legal-scaffold': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/multi-tenancy-row-level':
    'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/posthog-analytics':
    'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/rate-limiting': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/resend-email': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/sentry-errors': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/stripe-subscriptions':
    'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/supabase-data': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
  'saas/vercel-deploy': 'Scheduled for demotion to a skill by plan W2; raising a doomed file is waste.',
};

/**
 * The documented effort scale, lowest to highest. Verbatim from the Claude Code
 * subagent reference: "Options: low, medium, high, xhigh, max; available levels
 * depend on the model."
 */
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * The floor: `xhigh`, NOT `max`. Plan F3d, and it is a REVERSAL ON EVIDENCE.
 *
 * Plan F3c set this to `max` on the owner's earlier ruling "effort MAX XHIGH". He
 * reversed it the same day — "ok let the agents have xhigh" — after being shown
 * Anthropic's own guidance on `max`, verbatim from the model configuration reference:
 *
 *   | `max` | Can improve performance on demanding tasks but MAY SHOW DIMINISHING
 *            RETURNS AND IS PRONE TO OVERTHINKING. TEST BEFORE ADOPTING BROADLY |
 *
 * and: "`max` provides the deepest reasoning with NO CONSTRAINT ON TOKEN SPENDING."
 *
 * F3c put `max` on 91 agents in one edit. That is the definition of adopting broadly
 * without testing. `xhigh` is the highest level Anthropic ships no caveat against.
 *
 * ── THE CAVEAT THAT INVERTS — read it before you "improve" this back to `max` ──
 *
 * `xhigh` is not supported on every model, and `max` is:
 *
 *   Fable 5 · Sonnet 5 · Opus 4.8 · Opus 4.7  ->  low, medium, high, xhigh, max
 *   Opus 4.6 · Sonnet 4.6                     ->  low, medium, high,        max
 *
 * "If you set a level the active model does not support, Claude Code falls back to the
 * highest supported level at or below the one you set. For example, `xhigh` runs as
 * `high` on Opus 4.6."
 *
 * So on an older model `xhigh` SILENTLY DROPS TWO STEPS to `high`, while `max` would
 * have held. For a pinned older model, `xhigh` is strictly worse than `max`.
 *
 * It does not bite today, and that is MEASURED, not assumed: every agent declares a
 * model ALIAS (`opus`, `sonnet`), zero pin a version, and the aliases resolve to models
 * that support `xhigh`. The case 'every agent declares a model ALIAS, never a pinned
 * version' below is the tripwire for the day that stops being true. It is a WARNING,
 * not a ban — banning version pins is a decision the owner has not made, and this fence
 * does not get to make it for him.
 */
const TOP_EFFORT = 'xhigh';

// The corpus is 123 agents (128 before plan F3b deleted the five Tier-3 scouts). This
// floor is far below that so ordinary churn never trips it — only a mis-rooted scan
// that reads nothing does. Without it, every assertion below passes vacuously against
// an empty list.
const MIN_AGENT_FILES = 100;

// ─────────────────────────────────────────────────────────────────────────────

describe('fence: agent model floor', () => {
  // ---- Non-vacuity guard --------------------------------------------------

  it('scans a non-empty agents corpus with readable frontmatter (non-vacuity guard)', () => {
    assert.ok(
      AGENTS.length >= MIN_AGENT_FILES,
      `Vacuity guard tripped: scanned only ${AGENTS.length} agent files under ${agentsRoot}, ` +
        `expected at least ${MIN_AGENT_FILES}. Every assertion in this file would pass by ` +
        `reading nothing. Fix the scan root before trusting this fence.`
    );
    const withFm = AGENTS.filter((a) => a.fm.trim().length > 0);
    assert.equal(
      withFm.length,
      AGENTS.length,
      `Vacuity guard tripped: ${AGENTS.length - withFm.length} agent file(s) parsed to EMPTY ` +
        `frontmatter. Frontmatter is honoured by the runtime only at byte 0 — a file whose YAML ` +
        `sits below an \`# H1\` heading is inert, and this fence cannot read its model:\n` +
        AGENTS.filter((a) => !a.fm.trim())
          .map((a) => `  ${a.rel}`)
          .join('\n')
    );
  });

  // ---- The floor itself -----------------------------------------------------

  it('every watcher declares `model: opus`', () => {
    const byId = new Map(AGENTS.map((a) => [a.id, a]));

    const missing = WATCHERS.filter((id) => !byId.has(id));
    assert.equal(
      missing.length,
      0,
      `The WATCHERS list names ${missing.length} agent(s) that do not exist on disk. A watcher ` +
        `that cannot be found is a watcher that cannot be checked — fix the id or remove it:\n` +
        missing.map((id) => `  agents/${id}.md`).join('\n')
    );

    const wrong = WATCHERS.map((id) => byId.get(id)).filter((a) => a.model !== 'opus');

    assert.equal(
      wrong.length,
      0,
      `${wrong.length} watcher(s) declare a model below the floor.\n\n` +
        `A watcher reads code and emits findings. The code it judges was written at Iron Loop\n` +
        `Step 10 by OPUS. A reviewer weaker than the builder does not review — it produces a\n` +
        `green record. Every watcher runs on opus.\n\n` +
        wrong.map((a) => `  ${a.rel}  declares model: ${a.model ?? '(none)'}  — must be opus`).join('\n') +
        `\n\nFIX: set \`model: opus\`. If this agent is NOT a watcher (it does not read code and\n` +
        `emit findings), remove it from WATCHERS and justify it in SONNET_EXEMPT instead.`
    );
  });

  // ---- Case 3: haiku is pinned to the documented exemption -------------------
  //
  // Plan F3b emptied HAIKU_EXEMPT. The assertions below are UNCHANGED — only the
  // list they read shrank to zero, so `unexpected` is now every haiku agent and the
  // rule is absolute. The test title was corrected: it previously said "except the
  // documented Tier-3 scouts", which would now be a false statement in a green run.

  it('no agent declares `model: haiku`', () => {
    const haiku = AGENTS.filter((a) => a.model === 'haiku').map((a) => a.id);
    const unexpected = haiku.filter((id) => !HAIKU_EXEMPT.includes(id));
    const vanished = HAIKU_EXEMPT.filter((id) => !haiku.includes(id));

    assert.equal(
      unexpected.length,
      0,
      `${unexpected.length} agent(s) declare \`model: haiku\`:\n` +
        unexpected.map((id) => `  agents/${id}.md`).join('\n') +
        `\n\nHaiku is not a thinking budget for anything that judges Opus-written code. The ` +
        `Tier-3 scout layer that once justified this was deleted by plan F3b — see ` +
        `tests/no-tier-3.test.js. A new haiku agent needs an owner decision, not a quiet addition.`
    );

    assert.equal(
      vanished.length,
      0,
      `HAIKU_EXEMPT lists ${vanished.length} agent(s) that no longer declare \`model: haiku\`:\n` +
        vanished.map((id) => `  agents/${id}.md`).join('\n') +
        `\n\nThis list is EMPTY as of plan F3b and should stay empty. Remove the stale entry.`
    );
  });

  // ---- Case 4: the exemption list is exhaustive ------------------------------

  it('the sonnet exemption list is exhaustive and accurate', () => {
    const sonnet = AGENTS.filter((a) => a.model === 'sonnet').map((a) => a.id);
    const unlisted = sonnet.filter((id) => !(id in SONNET_EXEMPT));

    assert.equal(
      unlisted.length,
      0,
      `${unlisted.length} agent(s) declare \`model: sonnet\` without a written justification.\n\n` +
        unlisted.map((id) => `  agents/${id}.md`).join('\n') +
        `\n\nSonnet is below the floor set by the builder (Opus writes the code at Step 10).\n` +
        `Every exception must be argued in writing, in SONNET_EXEMPT in this file, with a reason\n` +
        `a reviewer can disagree with.\n\n` +
        `FIX: either raise it to \`model: opus\` (the default answer for anything that reads code\n` +
        `and emits findings), or add it to SONNET_EXEMPT with a one-line reason.`
    );

    const stale = Object.keys(SONNET_EXEMPT).filter((id) => !sonnet.includes(id));
    assert.equal(
      stale.length,
      0,
      `SONNET_EXEMPT justifies ${stale.length} agent(s) that are no longer sonnet (raised, ` +
        `renamed, or deleted):\n` +
        stale.map((id) => `  agents/${id}.md`).join('\n') +
        `\n\nA stale exemption is a licence nobody is using — it makes the list lie about the ` +
        `corpus. Remove the entry.`
    );

    assert.ok(
      Object.values(SONNET_EXEMPT).every((reason) => typeof reason === 'string' && reason.trim().length >= 20),
      `Every SONNET_EXEMPT entry needs a real reason, not a placeholder. An exemption without an ` +
        `argument is an exemption nobody can review.`
    );
  });

  // ---- Case 5: a model is always declared, exactly once ----------------------

  it('every agent declares exactly one model, with a single value', () => {
    const undeclared = AGENTS.filter((a) => a.models.length === 0);
    assert.equal(
      undeclared.length,
      0,
      `${undeclared.length} agent(s) declare no \`model:\` at all:\n` +
        undeclared.map((a) => `  ${a.rel}`).join('\n') +
        `\n\nAn agent without \`model:\` silently inherits the session model. That makes the floor ` +
        `unenforceable: the agent runs on whatever the human happened to pick, and this fence ` +
        `cannot tell. Declare the model explicitly.`
    );

    const duplicated = AGENTS.filter((a) => a.models.length > 1);
    assert.equal(
      duplicated.length,
      0,
      `${duplicated.length} agent(s) declare \`model:\` more than once in frontmatter:\n` +
        duplicated.map((a) => `  ${a.rel}  ->  ${a.models.join(' , ')}`).join('\n') +
        `\n\nTwo declarations mean the effective model depends on parser order. Declare it once.`
    );

    const ALLOWED = new Set(['opus', 'sonnet', 'haiku']);
    const bad = AGENTS.filter((a) => a.models.length === 1 && !ALLOWED.has(a.models[0]));
    assert.equal(
      bad.length,
      0,
      `${bad.length} agent(s) declare a model that is not a single concrete value:\n` +
        bad.map((a) => `  ${a.rel}  ->  model: ${a.models[0]}`).join('\n') +
        `\n\nA value like \`opus|sonnet\` is not a declaration, it is a shrug — the runtime cannot ` +
        `resolve an alternation and the floor cannot be checked against one. Pick one of: ` +
        `${[...ALLOWED].join(', ')}.`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  The effort floor (plan F3c). Same fence, same loader, same corpus — an Opus
//  watcher thinking at `medium` is half a watcher, and the model floor alone
//  cannot see that.
// ─────────────────────────────────────────────────────────────────────────────

describe('fence: agent effort floor', () => {
  const nonExempt = () => AGENTS.filter((a) => !(a.id in EFFORT_EXEMPT));

  // ---- Case 1: every watcher thinks at the top of the scale -------------------

  it('every non-exempt agent declares `effort: xhigh`', () => {
    const wrong = nonExempt().filter((a) => a.effort !== TOP_EFFORT);

    assert.equal(
      wrong.length,
      0,
      `${wrong.length} agent(s) do not think at the floor.\n\n` +
        `Owner ruling 2026-07-17, verbatim: "ok let the agents have xhigh" — answering whether\n` +
        `effort must rise alongside \`model: opus\`. A watcher reads Opus-written code and emits\n` +
        `findings; at \`medium\` it reads less of it. The model floor cannot see this: \`opus\` +\n` +
        `\`low\` passes every model assertion in this file and still produces a green record.\n\n` +
        wrong
          .map((a) => `  ${a.rel}  declares effort: ${a.effort ?? '(none)'}  — must be ${TOP_EFFORT}`)
          .join('\n') +
        `\n\nFIX: set \`effort: ${TOP_EFFORT}\`. If this agent does NOT read code and emit findings\n` +
        `(it is an actuator, or a planner that asks the human), add it to EFFORT_EXEMPT in this\n` +
        `file with a written reason a reviewer can disagree with.`
    );
  });

  // ---- Case 2: an undeclared effort is not a control --------------------------

  it('every agent declares exactly one effort, at a documented level', () => {
    const undeclared = AGENTS.filter((a) => a.efforts.length === 0);
    assert.equal(
      undeclared.length,
      0,
      `${undeclared.length} agent(s) declare no \`effort:\` at all:\n` +
        undeclared.map((a) => `  ${a.rel}`).join('\n') +
        `\n\nAn undeclared effort silently inherits the SESSION effort. That agent's thinking depth\n` +
        `then depends on what the human happened to have set in their terminal — which is not a\n` +
        `control, it is a coin flip this fence cannot even observe. Declare it explicitly.`
    );

    const duplicated = AGENTS.filter((a) => a.efforts.length > 1);
    assert.equal(
      duplicated.length,
      0,
      `${duplicated.length} agent(s) declare \`effort:\` more than once in frontmatter:\n` +
        duplicated.map((a) => `  ${a.rel}  ->  ${a.efforts.join(' , ')}`).join('\n') +
        `\n\nTwo declarations mean the effective effort depends on parser order. Declare it once.`
    );

    const bad = AGENTS.filter((a) => a.efforts.length === 1 && !EFFORT_LEVELS.includes(a.efforts[0]));
    assert.equal(
      bad.length,
      0,
      `${bad.length} agent(s) declare an effort outside the documented scale:\n` +
        bad.map((a) => `  ${a.rel}  ->  effort: ${a.efforts[0]}`).join('\n') +
        `\n\nThe documented options are exactly: ${EFFORT_LEVELS.join(', ')}. A value outside them is\n` +
        `not a lower setting — it is an unparseable one.`
    );
  });

  // ---- Case 3: the exemption map is exhaustive and accurate --------------------

  it('the effort exemption map is exhaustive and accurate', () => {
    const byId = new Map(AGENTS.map((a) => [a.id, a]));

    const ghosts = Object.keys(EFFORT_EXEMPT).filter((id) => !byId.has(id));
    assert.equal(
      ghosts.length,
      0,
      `EFFORT_EXEMPT names ${ghosts.length} agent(s) that do not exist on disk:\n` +
        ghosts.map((id) => `  agents/${id}.md`).join('\n') +
        `\n\nAn exemption for a file nobody has is dead weight that makes the map lie about the ` +
        `corpus. Fix the id or remove the entry.`
    );

    const below = AGENTS.filter((a) => a.effort !== TOP_EFFORT).map((a) => a.id);
    const unlisted = below.filter((id) => !(id in EFFORT_EXEMPT));
    assert.equal(
      unlisted.length,
      0,
      `${unlisted.length} agent(s) think below \`${TOP_EFFORT}\` without a written justification:\n` +
        unlisted.map((id) => `  agents/${id}.md`).join('\n') +
        `\n\nEvery exception must be ARGUED, in EFFORT_EXEMPT in this file, in a sentence a reviewer\n` +
        `can disagree with. This map is an exemption list, not a roster: a new agent defaults to\n` +
        `being a watcher and must be justified INTO the map to think at anything less.`
    );

    const stale = Object.keys(EFFORT_EXEMPT).filter((id) => byId.get(id)?.effort === TOP_EFFORT);
    assert.equal(
      stale.length,
      0,
      `EFFORT_EXEMPT justifies ${stale.length} agent(s) that already think at \`${TOP_EFFORT}\`:\n` +
        stale.map((id) => `  agents/${id}.md`).join('\n') +
        `\n\nA stale exemption is a licence nobody is using — it makes the map lie about the corpus, ` +
        `and it is exactly how a real exemption gets smuggled in next to a dead one. Remove it.`
    );

    const thin = Object.entries(EFFORT_EXEMPT).filter(
      ([, reason]) => typeof reason !== 'string' || reason.trim().length < 20
    );
    assert.equal(
      thin.length,
      0,
      `${thin.length} EFFORT_EXEMPT entr(ies) carry a placeholder instead of a reason:\n` +
        thin.map(([id]) => `  agents/${id}.md`).join('\n') +
        `\n\nAn exemption without an argument is an exemption nobody can review.`
    );
  });

  // ---- Case 4: the modernization test must not forbid `max` --------------------

  it('`max` is an accepted effort value in tests/agent-modernization.test.js', () => {
    const p = path.join(projectRoot, 'tests', 'agent-modernization.test.js');
    const content = fs.readFileSync(p, 'utf8');

    const effortAssertions = content
      .split('\n')
      .filter((line) => /assert\.match\([^,]+,\s*\/\^?effort:/.test(line));

    assert.ok(
      effortAssertions.length > 0,
      `tests/agent-modernization.test.js no longer asserts on \`effort:\` at all. This case exists ` +
        `to keep that assertion from FORBIDDING \`max\`; if the assertion is gone, delete this case ` +
        `deliberately rather than letting it pass vacuously.`
    );

    for (const line of effortAssertions) {
      assert.ok(
        /\bmax\b/.test(line),
        `tests/agent-modernization.test.js asserts an effort value set that EXCLUDES \`max\`:\n\n` +
          `  ${line.trim()}\n\n` +
          `\`max\` is the documented top of the scale and is already in use on the four adversarial\n` +
          `critics. A test that admits \`low\` but rejects \`max\` does not enforce a floor — it\n` +
          `enforces a CEILING, and goes red the moment an agent it covers is raised. It is green\n` +
          `today only because its covered subset happens to contain no \`max\` agent.\n\n` +
          `FIX: widen the alternation to include max.`
      );

      assert.ok(
        /\/\^effort:/.test(line) && /\/m/.test(line.slice(line.indexOf('/^effort:'))),
        `tests/agent-modernization.test.js matches \`effort:\` UNANCHORED:\n\n` +
          `  ${line.trim()}\n\n` +
          `An unanchored match is satisfied by the text "effort: high" appearing ANYWHERE in the\n` +
          `file — including inside a fenced code block in the agent's body that merely documents\n` +
          `the file format. The runtime honours frontmatter only at byte 0; a test that reads a\n` +
          `code sample as a declaration certifies a contract nothing enforces.\n\n` +
          `FIX: anchor it — /^effort:\\s*(low|medium|high|xhigh|max)/m`
      );
    }
  });

  // ---- Case 5: the exemption map cannot quietly undo the owner's ruling --------

  it('no agent the owner ruled on is exempt from the effort floor', () => {
    const smuggled = WATCHERS.filter((id) => id in EFFORT_EXEMPT);
    assert.equal(
      smuggled.length,
      0,
      `${smuggled.length} of the 25 watchers raised to \`model: opus\` by the owner's ruling (plan ` +
        `F3a) have been exempted from the effort floor:\n` +
        smuggled.map((id) => `  agents/${id}.md  — ${EFFORT_EXEMPT[id]}`).join('\n') +
        `\n\nThese are the exact agents the ruling was ABOUT. Exempting one here reverses the ruling\n` +
        `while leaving \`model: opus\` in place to look like compliance — an Opus watcher on \`low\`\n` +
        `is the precise defect this plan exists to close. If one of these genuinely is not a\n` +
        `watcher, remove it from WATCHERS first, in the open, and argue that instead.`
    );
  });

  // ---- Case 6: `max` is gone from the corpus (plan F3d) -----------------------
  //
  // SCOPE, deliberately: this asserts the CORPUS's current shape, not the platform's
  // contract. `max` remains a legal, documented value — it stays in EFFORT_LEVELS
  // above and in the value set of tests/agent-modernization.test.js (case 4 below
  // exists to keep it there). Narrowing either would re-create the exact trap plan
  // F3c removed: the next person who legitimately sets `max` hits a red test for a
  // wrong reason. What this case says is narrower and true: after F3d, nothing in
  // agents/ is at `max`, and putting one back is a visible act that needs the owner
  // to meet the overthinking evidence in TOP_EFFORT's comment first.

  it('no agent declares `effort: max`', () => {
    const atMax = AGENTS.filter((a) => a.efforts.includes('max'));

    assert.equal(
      atMax.length,
      0,
      `${atMax.length} agent(s) declare \`effort: max\`:\n` +
        atMax.map((a) => `  ${a.rel}`).join('\n') +
        `\n\nThe owner reversed on this, 2026-07-17: "ok let the agents have xhigh". Anthropic's\n` +
        `own guidance on \`max\`, verbatim: "may show diminishing returns and is prone to\n` +
        `overthinking. Test before adopting broadly" — and it spends tokens with no constraint.\n` +
        `Plan F3c had put \`max\` on 91 agents in a single edit, which IS adopting broadly without\n` +
        `testing. \`xhigh\` is the highest level that carries no such caveat.\n\n` +
        `This is not a claim that \`max\` is illegal — it is documented and this fence still accepts\n` +
        `it as a value. It is a claim that NOTHING IN THIS CORPUS is at \`max\` without the owner\n` +
        `deciding so again, on the evidence above.\n\n` +
        `FIX: set \`effort: ${TOP_EFFORT}\`.`
    );
  });

  // ---- Case 7: the tripwire for the inversion --------------------------------
  //
  // WHY THIS IS NOT A DUPLICATE of 'every agent declares exactly one model, with a
  // single value' above, which would also go red on a pinned version: that case fails
  // for a MODEL reason and says so ("`opus|sonnet` is not a declaration, it is a
  // shrug"). Read by someone who just pinned `claude-opus-4-6`, its message is simply
  // wrong about why they are in trouble. This case fails for an EFFORT reason — the
  // pin silently downgrades every `xhigh` on that agent to `high` — and its message is
  // the only place that fact is stated. Same input, different invariant, different
  // fix. It is a WARNING, not a ban: pinning a version is a decision the owner has not
  // made, and this fence does not make it for him.

  it('every agent declares a model ALIAS, never a pinned model version', () => {
    // A pinned version, not an alias: `claude-opus-4-6`, `opus-4.6`, `claude-3-5-sonnet`.
    // The alias set is what actually ships today; anything carrying a version number is
    // a pin. Kept as a shape test rather than a denylist of model names so a model
    // released after this line was written is still caught.
    const pinned = AGENTS.filter((a) => a.models.some((v) => /\d/.test(v)));

    assert.equal(
      pinned.length,
      0,
      `${pinned.length} agent(s) pin a model VERSION instead of declaring an alias:\n` +
        pinned.map((a) => `  ${a.rel}  ->  model: ${a.models.join(' , ')}`).join('\n') +
        `\n\nREAD THIS BEFORE "FIXING" IT — the effort floor inverts on a pinned model.\n\n` +
        `\`effort: ${TOP_EFFORT}\` is not supported on every model, and \`max\` is:\n\n` +
        `    Fable 5 · Sonnet 5 · Opus 4.8 · Opus 4.7  ->  low, medium, high, xhigh, max\n` +
        `    Opus 4.6 · Sonnet 4.6                     ->  low, medium, high,        max\n\n` +
        `Anthropic, verbatim: "If you set a level the active model does not support, Claude Code\n` +
        `falls back to the highest supported level at or below the one you set. For example,\n` +
        `\`xhigh\` runs as \`high\` on Opus 4.6."\n\n` +
        `So on a pinned older model this corpus's \`effort: ${TOP_EFFORT}\` SILENTLY DROPS TWO\n` +
        `STEPS to \`high\`. Nothing errors. The agent just thinks less, and every assertion in this\n` +
        `file still passes — which is the precise shape of defect this fence exists to prevent.\n` +
        `\`max\` would have held on that model.\n\n` +
        `This is a WARNING, not a prohibition. Pinning a version may well be right; the owner has\n` +
        `made no ruling either way. But if you pin a model that predates \`xhigh\`, the effort floor\n` +
        `for that agent is a fiction until you decide what it should be — and that decision is the\n` +
        `owner's. Take it to him rather than deleting this case.`
    );
  });
});
