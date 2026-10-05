'use strict';

/**
 * Every agent holds the tools its own orders need, and no more.
 *
 * PROFILE is the tool-grant audit of the index plan agent-tool-grants.md (plans/<stage>/), held
 * as data: for each agent definition, what its body orders it to do. The correct
 * grant is derived from it (the policy's rules 2 to 5 and 7); the safety floor (rule
 * 6) is checked on the grant each agent actually holds; Write and Edit (rule 1) are
 * judged in ONE place, check 9, by the owner's ruling of 2026-10-05. A violation fails
 * with the agent's name.
 *
 * Fail closed: a grant this file cannot read fails the census by name, debt or not, and
 * every check that reads grants fails on it too. Claude Code gives an agent with no tools
 * key, or with a frontmatter its YAML parser rejects, every tool, so "readable" is decided
 * by construction, not by a list of bad shapes: the frontmatter is parsed into an ordered
 * list of keys and values (known keys only, each once; `memory`, which adds Read, Write
 * and Edit, is not one) and rendered back in ONE canonical form — plain scalars, two-space
 * indentation, `tools: A, B, C` on one line, `  - item` or `  key: value` lines under a
 * key whose value sits on its own lines, no quotes, backslashes, comments or trailing
 * colons. The file's frontmatter must EQUAL that rendering byte for byte (line endings
 * aside), or it fails with the line that differs. Also refused: "---" inside the block
 * (Claude Code ends the frontmatter there), zero or two tools keys, a key written other
 * than exactly `tools:`, an unknown tool, and a file Claude Code would load as an agent
 * with an upper-case `.MD` extension. A top-level value may hold ": ", because Claude
 * Code's own repair step quotes such a line back into the same string; an indented value
 * may not. A frontmatter line holding an invisible character (a NUL, which Bun's YAML
 * parser rejects, or any other control, format, private-use or unassigned character)
 * fails too; a tab is left to the canonical comparison. Each agent's `name` must be its
 * file's base name, once. Verified against Bun 1.4.2 and 1.4.3-canary on all 125 agents
 * (fourth security scan, Claude Code's own loader functions under those builds: 0
 * mismatches, and a sweep of every Unicode code point found only U+0000, now refused);
 * the exact Bun build Claude Code embeds is unpublished, so re-run that comparison on
 * each Claude Code update. No second YAML reader is used (no new dependency).
 *
 * DEBT, WRITE_EDIT_DEBT, RULE6_EXCEPTIONS and HELD_REMOVALS only shrink. Each list's
 * size must EQUAL its maximum here, and each maximum has a ceiling stated a second time
 * in its own file, tests/agent-tool-grants-maxima.test.js, which fails unless each
 * maximum here equals it: lowering or raising one means editing both files in the same
 * change. Slice 11 removes a held removal
 * only after measured runs and the owner's approval. An entry that no longer fails, or
 * a held tool the agent no longer holds, is reported, so it cannot linger. Debt
 * suspends only the MISSING half of check 3: a tool an agent holds that its orders do
 * not need fails on every agent.
 *
 * What this cannot see: whether a body's orders are what the profile says (the
 * profile is a reviewed reading, not an inference), and a command reaching the
 * network through Bash, which the safety floor does not cover (the index says so).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(ROOT, 'agents');
const MIN_AGENTS = 100;

const reads = { reads: true };
const readsRuns = { reads: true, commands: true };
const readsWrites = { reads: true, writes: true };
const readsWritesRuns = { reads: true, writes: true, commands: true };
const fenced = { fenced: true };
const BOTH_WEB = ['WebSearch', 'WebFetch'];

// Key: the path under agents/ without ".md".
const PROFILE = Object.freeze({
  'ai-quality/ai-code-quality-reviewer': reads,
  'ai-quality/citation-validator': { reads: true, web: BOTH_WEB },
  'ai-quality/deepthink-researcher': { web: BOTH_WEB },
  'ai-quality/hallucination-detector': readsRuns,
  'ai-quality/llm-security-tester': readsRuns,
  'architecture/dependency-analyzer': readsRuns,
  'architecture/pattern-detector': reads,
  'compliance/audit-log-checker': reads,
  'compliance/eu-ai-act-agent': reads,
  'compliance/eu-solution-recommender': { web: BOTH_WEB },
  'compliance/gdpr-agent': reads,
  'compliance/license-scanner': readsRuns,
  'compliance/sbom-cra-checker': reads,
  'coordinator/cto-chief': { reads: true, commands: true, coordinates: true },
  'coordinator/ivv-chief': { reads: true, commands: true, coordinates: true },
  'coordinator/synthesizer': reads,
  'cost/cloud-cost-analyzer': readsRuns,
  'data-ml/data-quality-checker': reads,
  'data-ml/feature-store-validator': reads,
  'data-ml/ml-model-validator': reads,
  'devex/api-deprecation-checker': readsRuns,
  'devex/onboarding-validator': readsRuns,
  'documentation/changelog-generator': readsWritesRuns,
  'documentation/documentation-updater': readsWrites,
  'frontend/bundle-analyzer': readsRuns,
  'frontend/component-tester': readsRuns,
  'frontend/visual-regression-checker': readsRuns,
  'infrastructure/ci-pipeline-checker': readsRuns,
  'infrastructure/ci-runner-setup': readsWritesRuns,
  'infrastructure/deployment-setup': readsWritesRuns,
  'infrastructure/docker-security-checker': readsRuns,
  'infrastructure/kubernetes-checker': readsRuns,
  'infrastructure/terraform-validator': readsRuns,
  'iron-loop/advocate-critic': fenced,
  'iron-loop/devils-advocate-critic': fenced,
  'iron-loop/gate-critic': { fenced: true, creates: true },
  'iron-loop/iron-loop-critic': reads,
  'iron-loop/iron-loop-executor': readsWritesRuns,
  'iron-loop/iron-loop-integrator': readsWrites,
  'iron-loop/premortem-critic': fenced,
  'iron-loop/red-team-critic': fenced,
  'legal/clm-obligations': reads,
  'legal/dsar-handler': reads,
  'mobile/android-checker': readsRuns,
  'mobile/ios-checker': readsRuns,
  'mobile/react-native-bridge-checker': reads,
  'pipeline/agent-critic': { reads: true, web: BOTH_WEB },
  'pipeline/agent-publisher': readsWritesRuns,
  'pipeline/agent-qa': reads,
  'pipeline/agent-tester': reads,
  'pipeline/agent-writer': readsWrites,
  'planning/implementation-planner': readsWrites,
  // `asks` (rule 5): Claude Code removes AskUserQuestion from every dispatched subagent,
  // foreground or background, "even when listed in the `tools` field"; only a fork keeps
  // it (https://code.claude.com/docs/en/sub-agents.md, "Available tools", read 2026-10-05,
  // slice 1 Step 9). So these five can never use it when dispatched. Removing it and
  // routing their questions back to the session is a separate plan; until then their rows
  // stay as the audit read their bodies.
  'planning/kpi-planner': { reads: true, writes: true, asks: true },
  'planning/product-owner': readsWrites,
  'planning/stack-chooser': { reads: true, writes: true, asks: true },
  'planning/unit-economics-modeler': { reads: true, writes: true, asks: true },
  'planning/vision-advisor': { reads: true, writes: true, asks: true },
  'planning/vision-decomposer': { reads: true, writes: true, asks: true },
  'product/experiment-designer': reads,
  // CTO Chief decision, 2026-10-05: its method file orders two file writes (the weekly
  // review and its actions file), so it writes; slice 3 drops only WebFetch.
  'product/product-reviewer': readsWrites,
  'quality/architecture-checker': readsRuns,
  'quality/code-reviewer': reads,
  'quality/code-smell-detector': reads,
  'quality/complexity-analyzer': readsRuns,
  'quality/complexity-reducer': reads,
  'quality/consistency-checker': reads,
  'quality/dead-code-detector': readsRuns,
  'quality/duplicate-code-detector': readsRuns,
  'quality/performance-validator': readsRuns,
  'quality/quality-gate': { reads: true, writes: true, commands: true, coordinates: true },
  'quality/type-checker': readsRuns,
  'realtime/hil-harness': reads,
  'realtime/wcet-budget': reads,
  'saas/clerk-auth': reads,
  'saas/inngest-jobs': reads,
  'saas/legal-scaffold': { reads: true, web: ['WebFetch'] },
  'saas/multi-tenancy-row-level': reads,
  'saas/posthog-analytics': reads,
  'saas/rate-limiting': reads,
  'saas/resend-email': reads,
  'saas/sentry-errors': reads,
  'saas/stripe-subscriptions': reads,
  'saas/supabase-data': reads,
  // Held with its removals (owner, 2026-10-05): WebFetch beside its held Write and Bash
  // would break the safety floor. Slice 11 makes this { reads: true, web: ['WebFetch'] }
  // in the same change that removes its Write and Bash.
  'saas/vercel-deploy': reads,
  'safety/fault-tree-builder': reads,
  'safety/fmeda-analyzer': reads,
  'safety/redundancy-pattern-picker': reads,
  'security/concurrency-checker': readsRuns,
  'security/cra-incident-clocks': reads,
  'security/dependency-auditor': readsRuns,
  'security/dependency-checker': readsRuns,
  'security/incident-responder': reads,
  'security/input-validation-checker': reads,
  'security/sast-scanner': readsRuns,
  'security/secrets-detector': readsRuns,
  'security/security-scanner': readsWritesRuns,
  'security/threat-modeler': reads,
  'specialized/accessibility-checker': readsRuns,
  'specialized/api-contract-validator': readsRuns,
  'specialized/configuration-validator': reads,
  'specialized/database-reviewer': reads,
  'specialized/error-handler-checker': reads,
  'specialized/health-check-validator': reads,
  'specialized/memory-safety-checker': readsRuns,
  'specialized/observability-checker': reads,
  'specialized/performance-profiler': readsRuns,
  'specialized/resilience-checker': reads,
  'specialized/translation-checker': reads,
  'testing/coverage-enforcer': readsRuns,
  'testing/coverage-mapper': readsWritesRuns,
  'testing/playwright-qa': readsWritesRuns,
  'testing/quality-gate-runner': readsRuns,
  'testing/runners/e2e-test-runner': readsRuns,
  'testing/runners/integration-test-runner': readsRuns,
  'testing/runners/mutation-test-runner': readsRuns,
  'testing/runners/smoke-test-runner': readsRuns,
  'testing/runners/unit-test-runner': readsRuns,
  'testing/smart-test-runner': readsWritesRuns,
  'testing/writers/e2e-test-writer': readsWritesRuns,
  'testing/writers/integration-test-writer': readsWritesRuns,
  'testing/writers/property-test-writer': readsWritesRuns,
  'testing/writers/unit-test-writer': readsWritesRuns,
  'versioning/backwards-compatibility-checker': readsRuns,
  'versioning/feature-flag-auditor': reads,
  'versioning/technical-debt-tracker': readsRuns,
});

const COORDINATORS = new Set(['coordinator/cto-chief', 'coordinator/ivv-chief', 'quality/quality-gate']);
const WEB_TOOLS = ['WebSearch', 'WebFetch'];
// Rule 6 as an allowlist: an agent holding a web tool may hold nothing outside this set.
// Anything else — Write, Edit, MultiEdit, NotebookEdit, Bash or a scoped Bash(...), Task,
// Agent, a tool from an external tool server — breaks the floor, so a new tool fails closed.
const FLOOR_SAFE = new Set(['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'AskUserQuestion']);
const TOOL_WORDS = new Set([
  'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Grep', 'Glob', 'Bash',
  'Task', 'Agent', 'WebSearch', 'WebFetch', 'AskUserQuestion', 'Skill',
]);

// Rule 6 known exceptions: the grant held TODAY breaks the floor. `tools` are the tools
// the approved safety fix removes; check 3 excuses exactly those, on that agent, until
// the named slice lands. Only shrinks.
const RULE6_EXCEPTIONS = Object.freeze({
  'planning/product-owner': {
    reason: 'holds WebSearch and Write; the owner approved dropping WebSearch on 2026-10-05, and slice 2 drops it',
    tools: ['WebSearch'],
  },
  'ai-quality/llm-security-tester': {
    reason: 'holds WebSearch and Bash; the owner approved dropping WebSearch on 2026-10-05, and slice 10 drops it',
    tools: ['WebSearch'],
  },
  'saas/legal-scaffold': {
    reason: 'holds WebFetch and Write; its body is a reviewer that orders no write (rule 7), and slice 4 drops Write',
    tools: ['Write'],
  },
  'infrastructure/ci-runner-setup': {
    reason: 'holds WebFetch with Write and Bash; its body orders no fetch, and slice 5 drops WebFetch',
    tools: ['WebFetch'],
  },
  'infrastructure/deployment-setup': {
    reason: 'holds WebFetch with Write and Bash; its body orders no fetch, and slice 5 drops WebFetch',
    tools: ['WebFetch'],
  },
  'product/product-reviewer': {
    reason: 'holds WebFetch with Write and Bash; its body orders no fetch, and slice 3 drops WebFetch; ' +
      'its method file orders two file writes, so Write stays, Edit is added and Bash is held (CTO Chief, 2026-10-05)',
    tools: ['WebFetch'],
  },
});
const MAX_RULE6_EXCEPTIONS = 6;

// Agents whose definition does not yet meet the policy. Only shrinks.
const DEBT = new Set([
  'ai-quality/ai-code-quality-reviewer',
  'ai-quality/citation-validator',
  'ai-quality/hallucination-detector',
  'ai-quality/llm-security-tester',
  'architecture/dependency-analyzer',
  'architecture/pattern-detector',
  'compliance/audit-log-checker',
  'compliance/eu-ai-act-agent',
  'compliance/gdpr-agent',
  'compliance/license-scanner',
  'compliance/sbom-cra-checker',
  'coordinator/cto-chief',
  'coordinator/ivv-chief',
  'coordinator/synthesizer',
  'cost/cloud-cost-analyzer',
  'data-ml/data-quality-checker',
  'data-ml/feature-store-validator',
  'data-ml/ml-model-validator',
  'devex/api-deprecation-checker',
  'devex/onboarding-validator',
  'documentation/changelog-generator',
  'documentation/documentation-updater',
  'frontend/bundle-analyzer',
  'frontend/component-tester',
  'frontend/visual-regression-checker',
  'infrastructure/ci-pipeline-checker',
  'infrastructure/ci-runner-setup',
  'infrastructure/deployment-setup',
  'infrastructure/docker-security-checker',
  'infrastructure/kubernetes-checker',
  'infrastructure/terraform-validator',
  'iron-loop/iron-loop-critic',
  'iron-loop/iron-loop-executor',
  'iron-loop/iron-loop-integrator',
  'legal/clm-obligations',
  'legal/dsar-handler',
  'mobile/android-checker',
  'mobile/ios-checker',
  'mobile/react-native-bridge-checker',
  'pipeline/agent-critic',
  'pipeline/agent-publisher',
  'pipeline/agent-qa',
  'pipeline/agent-tester',
  'pipeline/agent-writer',
  'planning/implementation-planner',
  'planning/kpi-planner',
  'planning/product-owner',
  'planning/stack-chooser',
  'planning/unit-economics-modeler',
  'planning/vision-advisor',
  'planning/vision-decomposer',
  'product/experiment-designer',
  'product/product-reviewer',
  'quality/architecture-checker',
  'quality/code-reviewer',
  'quality/code-smell-detector',
  'quality/complexity-analyzer',
  'quality/complexity-reducer',
  'quality/consistency-checker',
  'quality/dead-code-detector',
  'quality/duplicate-code-detector',
  'quality/performance-validator',
  'quality/quality-gate',
  'quality/type-checker',
  'realtime/hil-harness',
  'realtime/wcet-budget',
  'saas/clerk-auth',
  'saas/inngest-jobs',
  'saas/legal-scaffold',
  'saas/multi-tenancy-row-level',
  'saas/posthog-analytics',
  'saas/rate-limiting',
  'saas/resend-email',
  'saas/sentry-errors',
  'saas/stripe-subscriptions',
  'saas/supabase-data',
  'saas/vercel-deploy',
  'safety/fault-tree-builder',
  'safety/fmeda-analyzer',
  'safety/redundancy-pattern-picker',
  'security/concurrency-checker',
  'security/cra-incident-clocks',
  'security/dependency-auditor',
  'security/dependency-checker',
  'security/incident-responder',
  'security/input-validation-checker',
  'security/sast-scanner',
  'security/secrets-detector',
  'security/security-scanner',
  'security/threat-modeler',
  'specialized/accessibility-checker',
  'specialized/api-contract-validator',
  'specialized/configuration-validator',
  'specialized/database-reviewer',
  'specialized/error-handler-checker',
  'specialized/health-check-validator',
  'specialized/memory-safety-checker',
  'specialized/observability-checker',
  'specialized/performance-profiler',
  'specialized/resilience-checker',
  'specialized/translation-checker',
  'testing/coverage-enforcer',
  'testing/coverage-mapper',
  'testing/playwright-qa',
  'testing/quality-gate-runner',
  'testing/runners/e2e-test-runner',
  'testing/runners/integration-test-runner',
  'testing/runners/mutation-test-runner',
  'testing/runners/smoke-test-runner',
  'testing/runners/unit-test-runner',
  'testing/smart-test-runner',
  'testing/writers/e2e-test-writer',
  'testing/writers/integration-test-writer',
  'testing/writers/property-test-writer',
  'testing/writers/unit-test-writer',
  'versioning/backwards-compatibility-checker',
  'versioning/feature-flag-auditor',
  'versioning/technical-debt-tracker',
]);
const MAX_DEBT = 118;

// Tool removals the owner HELD on 2026-10-05: "Approve the additions and the six safety
// fixes now; hold the removals until each is checked in a real run." Each tool listed is
// one the agent still holds although its profile does not need it; the grant check
// accepts it and nothing else. No web tool is ever held: dropping one is a safety fix,
// and those were approved. Write and Edit are held as a pair (check 9): an agent holding
// Write whose orders write nothing keeps Write, gains Edit in the slice that owns its
// file, and loses both together. Only shrinks: slice 11 removes an entry after measured
// runs show the tool unused and the owner approves; check 8 reports a held tool the agent
// no longer holds. 50 tools on 27 agents: Bash 21, Write 14, Edit 14, Task 1.
const HELD_REMOVALS = Object.freeze({
  'architecture/pattern-detector': ['Bash'],
  'compliance/sbom-cra-checker': ['Bash'],
  'data-ml/data-quality-checker': ['Bash'],
  'data-ml/feature-store-validator': ['Bash'],
  'legal/clm-obligations': ['Write', 'Edit'],
  'legal/dsar-handler': ['Write', 'Edit', 'Bash'],
  'mobile/react-native-bridge-checker': ['Bash'],
  'pipeline/agent-tester': ['Bash'],
  'product/experiment-designer': ['Write', 'Edit'],
  'product/product-reviewer': ['Bash'],
  'saas/clerk-auth': ['Write', 'Edit', 'Bash'],
  'saas/inngest-jobs': ['Write', 'Edit', 'Bash'],
  'saas/multi-tenancy-row-level': ['Write', 'Edit', 'Bash'],
  'saas/posthog-analytics': ['Write', 'Edit'],
  'saas/rate-limiting': ['Write', 'Edit'],
  'saas/resend-email': ['Write', 'Edit', 'Bash'],
  'saas/sentry-errors': ['Write', 'Edit', 'Bash'],
  'saas/stripe-subscriptions': ['Write', 'Edit', 'Bash'],
  'saas/supabase-data': ['Write', 'Edit', 'Bash'],
  'saas/vercel-deploy': ['Write', 'Edit', 'Bash'],
  'security/cra-incident-clocks': ['Write', 'Edit'],
  'security/incident-responder': ['Bash'],
  'security/threat-modeler': ['Bash'],
  'specialized/configuration-validator': ['Bash'],
  'specialized/database-reviewer': ['Bash'],
  'specialized/health-check-validator': ['Bash'],
  'testing/quality-gate-runner': ['Task'],
});
const MAX_HELD_REMOVALS = 50;
const heldCount = () => Object.values(HELD_REMOVALS).reduce((n, tools) => n + tools.length, 0);

// Rule 1, the owner's ruling of 2026-10-05, in his words: "make certain to have the edit
// tool in the agents otherwise they rewrite the entire file". Write and Edit are granted
// together and removed together, with no exceptions; check 9 is the ONLY place this is
// enforced. Agents that hold Write without Edit today, by name. Only shrinks.
// The comment on each line names the slice that clears it.
const WRITE_EDIT_DEBT = new Set([
  'infrastructure/ci-runner-setup', // slice 5 grants Edit
  'infrastructure/deployment-setup', // slice 5 grants Edit
  'iron-loop/gate-critic', // gains Edit (owner's Write-and-Edit ruling, CTO Chief 2026-10-05); slice 7 is to declare its file
  'legal/clm-obligations', // slice 8 grants Edit; the Write and Edit pair stays held for slice 11
  'legal/dsar-handler', // slice 8 grants Edit; the Write and Edit pair stays held for slice 11
  'pipeline/agent-publisher', // slice 7 grants Edit
  'planning/implementation-planner', // slice 2 grants Edit
  'planning/kpi-planner', // slice 3 grants Edit
  'planning/product-owner', // slice 2 grants Edit
  'planning/stack-chooser', // slice 3 grants Edit
  'planning/unit-economics-modeler', // slice 3 grants Edit
  'planning/vision-advisor', // slice 2 grants Edit
  'planning/vision-decomposer', // slice 2 grants Edit
  'product/experiment-designer', // slice 3 grants Edit; the Write and Edit pair stays held for slice 11
  'product/product-reviewer', // slice 3 grants Edit; Write stays (CTO Chief, 2026-10-05)
  'quality/quality-gate', // slice 9 grants Edit
  'saas/legal-scaffold', // slice 4 drops Write (a safety separation)
  'saas/vercel-deploy', // slice 4 grants Edit; the Write and Edit pair stays held for slice 11
  'security/cra-incident-clocks', // slice 8 grants Edit; the Write and Edit pair stays held for slice 11
  'security/security-scanner', // slice 8 grants Edit
  'testing/coverage-mapper', // slice 6 grants Edit
  'testing/smart-test-runner', // slice 6 grants Edit
]);
const MAX_WRITE_EDIT_DEBT = 22;

const SEARCH_HEADING = '## Searching the repository (shared rule)';
const SEARCH_RULE =
  'Build every list of call sites, readers, writers or occurrences with Grep over the whole repository, ' +
  'never only from the files you happened to open, and read each match before you count it. ' +
  'Under any claim that nothing else in the repository does something, cite the search that shows it: ' +
  'the pattern, the path searched and how many files matched. ' +
  'A match shows where a name is written, not that the code runs.';
const AGENT_SENTENCES = Object.freeze({
  'planning/product-owner': [
    'These orders hold in every pass this agent runs: refining a stub, a consistency pass across several plans, and any other brief sent to `product-owner`.',
    'You hold `Grep`, so never write that you had no search tool; if a search fails, write the pattern you ran and the error it returned.',
  ],
});

/** The tools a profile needs, Edit aside: Edit is judged with Write by check 9 alone. */
function expectedTools(p) {
  const t = new Set();
  if (p.reads) for (const x of ['Read', 'Grep', 'Glob']) t.add(x);
  if (p.fenced) for (const x of ['Read', 'Grep']) t.add(x);
  if (p.writes || p.creates) t.add('Write');
  if (p.commands) t.add('Bash');
  if (p.coordinates) t.add('Task');
  if (p.asks) t.add('AskUserQuestion');
  for (const w of p.web || []) t.add(w);
  return t;
}

/** Rule 1, the one enforcement: Write and Edit go together, in the grant and in the held removals. */
function writeEditFailures(key, tools, held = []) {
  const out = [];
  if (tools.includes('Write') && !tools.includes('Edit')) out.push(`${key}: holds Write without Edit, so it must rewrite a whole file to change part of it`);
  if (tools.includes('Edit') && !tools.includes('Write')) out.push(`${key}: holds Edit without Write; the two are granted together`);
  if (held.includes('Write') && !held.includes('Edit')) out.push(`${key}: its held removals hold Write without Edit; the two are removed together`);
  if (held.includes('Edit') && !held.includes('Write')) out.push(`${key}: its held removals hold Edit without Write; the two are removed together`);
  return out;
}

/** The first frontmatter block, only when it starts at the first byte, as the loader reads it. */
function splitAgent(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
  if (end === -1) return null;
  return { fm: lines.slice(1, end), body: lines.slice(end + 1).join('\n') };
}

function fmValue(fm, key) {
  const line = fm.find((l) => l.startsWith(`${key}:`));
  return line === undefined ? null : line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
}

// Any spelling a loader might read as the tools key: any case, quoted, indented, a space before the colon.
const TOOLS_KEY = /^\s*["']?tools["']?\s*:/i;
const unquote = (s) => s.replace(/^(["'])(.*)\1$/, '$2').trim();
const uncomment = (s) => s.replace(/\s#.*$/, '').trim();

// The frontmatter keys in use on 2026-10-05 (28). Any other key fails closed: `memory`, for
// one, makes Claude Code add Read, Write and Edit to an agent's grant.
const FRONTMATTER_KEYS = new Set([
  'name', 'description', 'tools', 'model', 'effort', 'tier', 'reports_to', 'dispatch_protocol',
  'type', 'target_skill', 'category', 'reads_ancestry', 'confidence_calibration', 'parallel_safe',
  'effort_budget', 'color', 'maxTurns', 'effort_level', 'gated_by', 'extends_skill', 'regime_profile',
  'role', 'top_level', 'async_choice_protocol', 'always_available', 'dispatches', 'audit_root',
  'activation_control',
]);
const TOP_KEY = /^([A-Za-z][\w-]*):(.*)$/;
const ITEM_LINE = /^\s+-(?:[ \t]+(.*))?$/;
const PAIR_LINE = /^\s+([A-Za-z][\w-]*):(.*)$/;
const UNREADABLE_LINE = (line) => `has a frontmatter line this test cannot read: ${JSON.stringify(line.slice(0, 40))}`;

/**
 * Why a value is not a canonical plain scalar, or null. Canonical values are plain: no
 * quotes, no backslash, no tab, no leading YAML indicator, no trailing colon, no comment.
 * An indented value is stricter (no ": ", no flow bracket), because Claude Code's repair
 * step rewrites only top-level lines; a top-level value may hold ": ", which that repair
 * step quotes back into the same string.
 */
function plainError(v, indented) {
  if (v === '') return 'it is empty';
  if (/^["']/.test(v)) return 'it is quoted';
  if (v.includes('\\')) return 'it holds a backslash';
  if (/[\t\r]/.test(v)) return 'it holds a tab or a carriage return';
  if (/^[-?:,[\]{}#&*!|>%@`]/.test(v)) return 'it starts with a YAML indicator';
  if (v.endsWith(':')) return 'it ends with ":"';
  if (v.includes(' #')) return 'it holds " #"';
  if (indented && v.includes(': ')) return 'it holds ": " on an indented line';
  if (indented && /[[\]{}]/.test(v)) return 'it holds a flow bracket on an indented line';
  return null;
}

/**
 * The frontmatter as an ordered list of entries `{ key, value, lines }`, or why it cannot
 * be one. Every line must be a known top-level key (starting with a letter, once), or,
 * under a key whose value sits on its own lines, one "- item" or one "key: value" line,
 * one kind per block. `tools` must be inline. Anything else fails closed.
 */
function parseFrontmatter(fm) {
  const entries = [];
  const seen = new Set();
  for (const line of fm) {
    if (line.includes('---')) return { error: 'holds "---" inside its frontmatter, where Claude Code ends the frontmatter' };
    // A NUL makes Bun's YAML parser reject the block, so Claude Code grants every tool (fourth
    // security scan); every other control, format, private-use or unassigned character is
    // refused with it. Tab is left to the canonical comparison, which names the line.
    const invisible = /(?!\t)\p{C}/u.exec(line);
    if (invisible) return { error: `holds the invisible character U+${invisible[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} in a frontmatter line` };
    const top = TOP_KEY.exec(line);
    if (top) {
      const key = top[1];
      if (!FRONTMATTER_KEYS.has(key)) return { error: `has the frontmatter key ${JSON.stringify(key)}, which this test cannot vouch for` };
      if (seen.has(key)) return { error: `has the key ${JSON.stringify(key)} twice` };
      seen.add(key);
      const value = top[2].trim();
      if (key === 'tools' && value === '') return { error: 'writes its tools as a list; canonical form is "tools: A, B, C" on one line' };
      const why = key === 'tools' || value === '' ? null : plainError(value, false);
      if (why) return { error: `has a value under ${key} that is not a canonical plain scalar: ${why}` };
      entries.push({ key, value, lines: [] });
      continue;
    }
    const block = entries[entries.length - 1];
    const item = ITEM_LINE.exec(line);
    const pair = item ? null : PAIR_LINE.exec(line);
    if (!block || block.value !== '' || (!item && !pair)) return { error: UNREADABLE_LINE(line) };
    const kind = item ? 'item' : 'pair';
    if (block.lines.length > 0 && block.lines[0].kind !== kind) return { error: `mixes "- item" lines and "key: value" lines under ${block.key}` };
    const k = pair ? pair[1] : null;
    // Case-insensitive: `null` and `Null`, `true` and `True`, are one key to a YAML parser.
    if (k && block.lines.some((l) => l.k !== null && l.k.toLowerCase() === k.toLowerCase())) return { error: `has the key ${JSON.stringify(k)} twice under ${block.key}` };
    const v = ((item ? item[1] : pair[2]) || '').trim();
    const why = plainError(v, true);
    if (why) return { error: `has a value under ${block.key} that is not a canonical plain scalar: ${why}` };
    block.lines.push({ kind, k, v });
  }
  for (const e of entries) if (e.value === '' && e.lines.length === 0) return { error: `has no lines under ${e.key}` };
  return { entries };
}

/** The one canonical rendering of parsed entries: plain scalars, two-space indentation, `tools: A, B, C` on one line. */
function renderFrontmatter(entries, tools) {
  const out = [];
  for (const e of entries) {
    if (e.key === 'tools') out.push(`tools: ${tools.join(', ')}`);
    else if (e.value !== '') out.push(`${e.key}: ${e.value}`);
    else {
      out.push(`${e.key}:`);
      for (const l of e.lines) out.push(l.kind === 'item' ? `  - ${l.v}` : `  ${l.k}: ${l.v}`);
    }
  }
  return out;
}

/**
 * The tools the frontmatter grants, or why they cannot be read (fail closed). The block
 * must parse into entries AND equal their canonical rendering byte for byte (line endings
 * aside: the split already treats \r\n as \n). So any shape Claude Code's YAML parser
 * might read differently from this test is not canonical, and fails with the line that differs.
 */
function grantOf(fm) {
  const at = [];
  fm.forEach((l, i) => { if (TOOLS_KEY.test(l)) at.push(i); });
  if (at.length !== 1) {
    return { error: `has ${at.length} tools keys; exactly one is required${at.length === 0 ? ' (a missing tools key grants every tool)' : ''}` };
  }
  const line = fm[at[0]];
  if (!line.startsWith('tools:')) return { error: `writes its tools key as ${JSON.stringify(line.slice(0, line.indexOf(':') + 1))}; exactly "tools:" is required` };
  const parsed = parseFrontmatter(fm);
  if (parsed.error) return { error: parsed.error };
  const inline = unquote(uncomment(line.slice('tools:'.length)));
  if (inline.startsWith('[') !== inline.endsWith(']')) return { error: 'has an unterminated tools list' };
  const tools = [];
  for (const r of inline.replace(/^\[|\]$/g, '').split(',')) {
    const t = unquote(uncomment(r.trim()));
    if (!t) return { error: 'has an empty entry in its tools list' };
    if (!TOOL_WORDS.has(t)) return { error: `grants ${JSON.stringify(t.slice(0, 60))}, which is not a known tool` };
    tools.push(t);
  }
  const canonical = renderFrontmatter(parsed.entries, tools);
  for (let i = 0; i < Math.max(fm.length, canonical.length); i++) {
    if (fm[i] !== canonical[i]) {
      return { error: `frontmatter line ${i + 1} is not in canonical form: ${JSON.stringify(String(fm[i]).slice(0, 60))} should read ${JSON.stringify(String(canonical[i]).slice(0, 60))}` };
    }
  }
  return { tools };
}

/** Why an agent's grant cannot be read, or null when it can. */
function grantError(text) {
  const parts = splitAgent(text);
  if (!parts) return 'no frontmatter at the first byte, so no grant can be read';
  return grantOf(parts.fm).error || null;
}

/** The tools an agent's text grants; null when its grant cannot be read (every check fails closed on null). */
function toolsOf(text) {
  const parts = splitAgent(text);
  return (parts && grantOf(parts.fm).tools) || null;
}

/** Check 1's fail-closed half: every agent, in debt or not, whose grant cannot be read. */
function unreadableGrants(list) {
  return list.map((a) => [a.key, grantError(a.text)]).filter(([, e]) => e !== null).map(([k, e]) => `${k}: ${e}`);
}

/**
 * Every agent whose `name` is not its file's base name, and every name two definitions
 * share. Claude Code dispatches by name, and a YAML parser types some names (`0x1F`,
 * `False`) as numbers or booleans, so the name is pinned to the file. A frontmatter that
 * cannot be split is the census's to report.
 */
function nameFailures(list) {
  const out = [];
  const byName = new Map();
  for (const a of list) {
    const parts = splitAgent(a.text);
    if (!parts) continue;
    const base = a.key.split('/').pop();
    const name = fmValue(parts.fm, 'name');
    if (name === null) out.push(`${a.key}: has no name; its name must be its file name ${JSON.stringify(base)}`);
    else if (name !== base) out.push(`${a.key}: its name is ${JSON.stringify(name)}, not its file name ${JSON.stringify(base)}`);
    if (name !== null) byName.set(name, [...(byName.get(name) || []), a.key]);
  }
  for (const [name, keys] of byName) if (keys.length > 1) out.push(`${name}: the name of ${keys.length} definitions (${keys.sort().join(', ')})`);
  return out;
}

/** Known keys Claude Code's repair step cannot reach: it matches only `[a-zA-Z_-]+` keys, so a top-level ": " there would not be repaired. */
const unrepairableKeys = (keys) => [...keys].filter((k) => !/^[a-zA-Z_-]+$/.test(k));

/** The body with fenced code removed: an example is neither an order nor a grant. */
function withoutFences(body) {
  const out = [];
  let fence = null;
  for (const line of body.split('\n')) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (fence === null) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      continue;
    }
    if (fence === null) out.push(line);
  }
  return out.join('\n');
}

const squash = (s) => s.replace(/\s+/g, ' ').trim();

/** The text under a `## ` heading, up to the next `## ` heading, outside code; null when absent. */
function sectionText(body, heading) {
  const prose = `\n${withoutFences(body)}`;
  const start = prose.indexOf(`\n${heading}\n`);
  if (start === -1) return null;
  const rest = prose.slice(start + heading.length + 2);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Every grant, quoted-grant and search-rule failure of one agent; `held` lists the tools whose removal is held. */
function failuresFor(key, text, profile, held = []) {
  const parts = splitAgent(text);
  if (!parts) return [`${key}: no frontmatter at the first byte, so no grant can be read`];
  const g = grantOf(parts.fm);
  if (g.error) return [`${key}: ${g.error}`];
  const out = [];
  const have = new Set(g.tools);
  const want = expectedTools(profile);
  for (const t of want) if (!have.has(t)) out.push(`${key}: missing ${t}`);
  for (const t of have) if (t !== 'Edit' && !want.has(t) && !held.includes(t)) out.push(`${key}: holds ${t}${UNNEEDED}`);
  const real = [...have].sort().join(', ');
  for (const m of withoutFences(parts.body).matchAll(/`([^`\n]+)`/g)) {
    const words = m[1].replace(/^tools:\s*/, '').split(',').map((w) => w.trim());
    if (words.length < 2 || !words.every((w) => TOOL_WORDS.has(w))) continue;
    if ([...words].sort().join(', ') !== real) out.push(`${key}: the body quotes the grant "${m[1]}"; the frontmatter grants ${g.tools.join(', ')}`);
  }
  if (profile.reads) {
    const section = sectionText(parts.body, SEARCH_HEADING);
    if (section === null) out.push(`${key}: no "${SEARCH_HEADING}" section outside code`);
    else {
      for (const s of [SEARCH_RULE, ...(AGENT_SENTENCES[key] || [])]) {
        if (!squash(section).includes(squash(s))) out.push(`${key}: the search section lacks "${s.slice(0, 70)}…"`);
      }
    }
  }
  return out;
}

/** Rule 6: a web tool held together with anything outside FLOOR_SAFE. */
const breaksFloor = (tools) => tools.some((t) => WEB_TOOLS.includes(t)) && tools.some((t) => !FLOOR_SAFE.has(t));

const UNNEEDED = ', which its orders do not need';
const CANNOT_READ = 'its grant cannot be read';

/** The tools an agent may hold beyond its profile: its held removals and its listed safety-fix tools. */
function excusedFor(key, held, exceptions) {
  const e = exceptions[key];
  return [...(held[key] || []), ...((e && Array.isArray(e.tools)) ? e.tools : [])];
}

/** Check 3: an unneeded tool fails on every agent; outside debt, every grant, quoted-grant and search failure. */
function grantCheckFailures(list, { debt = DEBT, profiles = PROFILE, held = HELD_REMOVALS, exceptions = RULE6_EXCEPTIONS } = {}) {
  return list.flatMap((a) => {
    if (toolsOf(a.text) === null) return [`${a.key}: ${CANNOT_READ}, so its tools cannot be checked`];
    const f = failuresFor(a.key, a.text, profiles[a.key] || {}, excusedFor(a.key, held, exceptions));
    return debt.has(a.key) ? f.filter((m) => m.endsWith(UNNEEDED)) : f;
  });
}

/** Check 5 over a list of agents, against a table of known exceptions `{ reason, tools }`. */
function floorFailures(list, exceptions) {
  const out = [];
  const breaking = new Set();
  for (const a of list) {
    const tools = toolsOf(a.text);
    if (tools === null) out.push(`${a.key}: ${CANNOT_READ}, so the safety floor cannot be checked`);
    else if (breaksFloor(tools)) breaking.add(a.key);
  }
  for (const k of breaking) if (!(k in exceptions)) out.push(`${k}: reads untrusted web content and holds a tool outside the floor's allowlist`);
  for (const [k, e] of Object.entries(exceptions)) {
    if (!breaking.has(k)) out.push(`${k}: this exception no longer breaks the floor; remove it and lower MAX_RULE6_EXCEPTIONS`);
    const reason = e && typeof e.reason === 'string' ? e.reason : '';
    if (!e || !Array.isArray(e.tools) || e.tools.length === 0) out.push(`${k}: the exception lists no tool it excuses`);
    if (reason.length < 20) out.push(`${k}: an exception without a written reason`);
    else if (!/\bslice \d+\b/.test(reason)) out.push(`${k}: the exception's reason names no slice that removes it`);
  }
  return out;
}

/** Check 8: a held tool the agent no longer holds has landed; an unreadable grant fails closed. */
function heldCheckFailures(list, held) {
  const out = [];
  for (const a of list) {
    const h = held[a.key];
    if (!h) continue;
    const tools = toolsOf(a.text);
    if (tools === null) { out.push(`${a.key}: ${CANNOT_READ}, so its held removals cannot be checked`); continue; }
    // Edit is judged with Write by check 9: a held Edit not yet granted is that check's debt.
    for (const t of h) {
      if (t !== 'Edit' && !tools.includes(t)) out.push(`${a.key} ${t}: this held removal has landed; remove it from HELD_REMOVALS and lower MAX_HELD_REMOVALS (slice 11, with the owner's approval)`);
    }
  }
  return out;
}

/** Check 9: Write and Edit go together, in the grant and in the held removals, outside the debt list. */
function writeEditCheckFailures(list, debt, held) {
  const out = [];
  const failing = new Set();
  for (const a of list) {
    const tools = toolsOf(a.text);
    if (tools === null) { out.push(`${a.key}: ${CANNOT_READ}, so Write and Edit cannot be checked`); continue; }
    const f = writeEditFailures(a.key, tools, held[a.key] || []);
    if (f.length > 0) failing.add(a.key);
    if (!debt.has(a.key)) out.push(...f);
  }
  for (const k of debt) if (!failing.has(k)) out.push(`${k}: now holds Write and Edit together; remove it from WRITE_EDIT_DEBT and lower MAX_WRITE_EDIT_DEBT`);
  return out;
}

/**
 * Every agent definition under `dir`, read through `io` (the file system, or a fixture's
 * stand-in). Nothing is skipped silently: a directory that cannot be listed, a file that
 * cannot be read, a symbolic link or any other non-regular entry is a named problem.
 */
function loadAgents(dir, io = fs) {
  const out = [];
  const problems = [];
  const rel = (full) => path.relative(dir, full).split(path.sep).join('/') || '.';
  const walk = (at) => {
    let entries;
    try {
      entries = io.readdirSync(at, { withFileTypes: true });
    } catch (err) {
      problems.push(`${rel(at)}: cannot be listed (${err.code || err.name})`);
      return;
    }
    for (const e of entries) {
      const full = path.join(at, e.name);
      if (e.isSymbolicLink()) problems.push(`${rel(full)}: a symbolic link; the census reads only regular files`);
      else if (e.isDirectory()) walk(full);
      else if (!e.isFile()) problems.push(`${rel(full)}: not a regular file or a directory`);
      else if (e.name.toLowerCase().endsWith('.md') && !e.name.endsWith('.md')) problems.push(`${rel(full)}: Claude Code loads it as an agent; spell the extension .md`);
      else if (e.name.endsWith('.md')) {
        try {
          out.push({ key: rel(full).replace(/\.md$/, ''), text: io.readFileSync(full, 'utf8') });
        } catch (err) {
          problems.push(`${rel(full)}: cannot be read (${err.code || err.name})`);
        }
      }
    }
  };
  walk(dir);
  return { agents: out.sort((a, b) => a.key.localeCompare(b.key)), problems: problems.sort() };
}

// Loaded OUTSIDE the suite and asserted in check 1. A throw inside a describe body reports
// "0 failed" on this Node, and a failing before() hook reports fail 0 too; the test gate
// reads the fail count, so either would be a green run over input never received.
let loaded = { agents: [], problems: [] };
let loadError;
try {
  loaded = loadAgents(AGENTS_DIR);
} catch (err) {
  loadError = err;
}

describe('every agent holds the tools its own orders need, and no more', () => {
  const all = loaded.agents;

  it('1. the census: every entry readable and regular, every grant readable, at least 100 definitions, each with a profile', () => {
    assert.equal(loadError, undefined, `the agent definitions could not be loaded: ${loadError && (loadError.code || loadError.name)}`);
    assert.deepEqual(loaded.problems, [], `entries under agents/ the census cannot vouch for:\n  ${loaded.problems.join('\n  ')}`);
    assert.ok(all.length >= MIN_AGENTS, `read ${all.length} agent definitions; at least ${MIN_AGENTS} expected`);
    const unreadable = unreadableGrants(all);
    assert.deepEqual(unreadable, [], `agents whose grant cannot be read (in debt or not):\n  ${unreadable.join('\n  ')}`);
    const misnamed = nameFailures(all);
    assert.deepEqual(misnamed, [], `agents not named for their file, or sharing a name:\n  ${misnamed.join('\n  ')}`);
    const keys = new Set(all.map((a) => a.key));
    const unprofiled = [...keys].filter((k) => !(k in PROFILE));
    const stale = Object.keys(PROFILE).filter((k) => !keys.has(k));
    assert.deepEqual(unprofiled, [], `agents with no profile (read the body, then add one): ${unprofiled.join(', ')}`);
    assert.deepEqual(stale, [], `profiles naming no agent file: ${stale.join(', ')}`);
  });

  it('2. every profile is a lawful reading of the policy', () => {
    const bad = [];
    for (const [k, p] of Object.entries(PROFILE)) {
      if (p.coordinates && !COORDINATORS.has(k)) bad.push(`${k}: Task is only for the three coordinators (rule 4)`);
      if (p.fenced && p.reads) bad.push(`${k}: fenced and reads are exclusive`);
      if (p.creates && !p.fenced) bad.push(`${k}: create-only writing is allowed only inside a read fence (rule 1)`);
      for (const w of p.web || []) if (!WEB_TOOLS.includes(w)) bad.push(`${k}: unknown web tool ${w}`);
      if (breaksFloor([...expectedTools(p)]) && !(k in RULE6_EXCEPTIONS)) bad.push(`${k}: its profile breaks the safety floor (rule 6)`);
    }
    for (const [k, tools] of Object.entries(HELD_REMOVALS)) {
      const p = PROFILE[k];
      if (!p) { bad.push(`${k}: a held removal names no profiled agent`); continue; }
      if (!Array.isArray(tools) || tools.length === 0) { bad.push(`${k}: a held removal lists no tool`); continue; }
      if (new Set(tools).size !== tools.length) bad.push(`${k}: a held tool is listed twice`);
      for (const t of tools) {
        if (!TOOL_WORDS.has(t)) bad.push(`${k}: held removal of an unknown tool ${t}`);
        if (WEB_TOOLS.includes(t)) bad.push(`${k}: ${t} is a web tool; dropping one is a safety fix, approved on 2026-10-05, never held`);
        if (expectedTools(p).has(t)) bad.push(`${k}: ${t} is needed by its profile, so holding its removal means nothing`);
      }
      if (breaksFloor([...expectedTools(p), ...tools]) && !(k in RULE6_EXCEPTIONS)) bad.push(`${k}: its profile with its held tools breaks the safety floor (rule 6)`);
    }
    for (const [k, e] of Object.entries(RULE6_EXCEPTIONS)) {
      const p = PROFILE[k];
      if (!p) { bad.push(`${k}: a safety-floor exception names no profiled agent`); continue; }
      for (const t of (e && e.tools) || []) {
        if (!TOOL_WORDS.has(t)) bad.push(`${k}: a safety-floor exception excuses an unknown tool ${t}`);
        if (expectedTools(p).has(t)) bad.push(`${k}: ${t} is needed by its profile, so excusing it means nothing`);
        if ((HELD_REMOVALS[k] || []).includes(t)) bad.push(`${k}: ${t} is both held and excused`);
      }
    }
    for (const k of unrepairableKeys(FRONTMATTER_KEYS)) bad.push(`${k}: a known frontmatter key Claude Code's repair step cannot reach, so a top-level ": " under it would not be repaired`);
    assert.deepEqual(bad, [], bad.join('\n'));
  });

  it('3. no agent holds a tool its orders do not need; outside the debt list, every agent meets the whole policy', () => {
    const failures = grantCheckFailures(all);
    assert.deepEqual(failures, [], `agents whose grant or body does not meet the policy:\n  ${failures.join('\n  ')}`);
  });

  it('4. the debt list only shrinks, and holds only agents that still fail', () => {
    assert.equal(DEBT.size, MAX_DEBT, `the debt list holds ${DEBT.size} agents and MAX_DEBT is ${MAX_DEBT}; they move together, and only down`);
    const unknown = [...DEBT].filter((k) => !(k in PROFILE));
    assert.deepEqual(unknown, [], `debt names no profiled agent: ${unknown.join(', ')}`);
    const paid = all.filter((a) => DEBT.has(a.key) && failuresFor(a.key, a.text, PROFILE[a.key], excusedFor(a.key, HELD_REMOVALS, RULE6_EXCEPTIONS)).length === 0).map((a) => a.key);
    assert.deepEqual(paid, [], `these agents now meet the policy; remove them from DEBT and lower MAX_DEBT: ${paid.join(', ')}`);
  });

  it('5. the safety floor: no agent holds a web tool with anything outside the allowlist unless it is a listed exception', () => {
    const failures = floorFailures(all, RULE6_EXCEPTIONS);
    assert.deepEqual(failures, [], failures.join('\n'));
    assert.equal(Object.keys(RULE6_EXCEPTIONS).length, MAX_RULE6_EXCEPTIONS, 'the exception list and MAX_RULE6_EXCEPTIONS move together, and only down');
  });

  it('6. the product-owner consistency pass runs with the same grant: one definition answers to the name', () => {
    const named = all.filter((a) => { const p = splitAgent(a.text); return p && fmValue(p.fm, 'name') === 'product-owner'; });
    assert.deepEqual(named.map((a) => a.key), ['planning/product-owner'], 'every dispatch of product-owner must load this one definition');
    assert.notEqual(fmValue(splitAgent(named[0].text).fm, 'type'), 'wrapper', 'product-owner must not redirect to a skill');
  });

  it('7. the checks bite: each defect fails, each well-formed fixture passes', () => {
    const agent = (fm, body) => `---\nname: fixture\n${fm}\n---\n\n# Fixture\n\n${body}\n`;
    const search = `${SEARCH_HEADING}\n\n${SEARCH_RULE}\n\n## Next\n`;
    // (a) the grant the end user reported, against a plan writer's profile: the grant check
    //     names the missing search and the web tool; check 9 names the missing Edit
    assert.deepEqual(failuresFor('f', agent('tools: Read, Write, WebSearch, Glob', search), readsWrites), [
      'f: missing Grep', 'f: holds WebSearch, which its orders do not need',
    ]);
    assert.deepEqual(writeEditFailures('f', ['Read', 'Write', 'WebSearch', 'Glob']), [
      'f: holds Write without Edit, so it must rewrite a whole file to change part of it',
    ]);
    // (b) a reviewer holding Write fails (rule 7); a checker holding Bash with no order fails (rule 3)
    assert.match(failuresFor('f', agent('tools: Read, Grep, Glob, Write', search), reads).join('\n'), /holds Write/);
    assert.match(failuresFor('f', agent('tools: Read, Grep, Glob, Bash', search), reads).join('\n'), /holds Bash/);
    // (c) a well-formed reader passes; the list form is not canonical (tools sit on one line)
    assert.deepEqual(failuresFor('f', agent('tools: Read, Grep, Glob', search), reads), []);
    assert.match(failuresFor('f', agent('tools:\n  - Read\n  - Grep\n  - Glob', search), reads)[0], /writes its tools as a list/);
    // (d) a tools line inside a fenced example is not a grant
    assert.match(failuresFor('f', agent('tools: Read', `${search}\n\`\`\`yaml\ntools: Read, Grep, Glob\n\`\`\``), reads).join('\n'), /missing Grep/);
    // (e) frontmatter not at the first byte, or two tools keys
    assert.match(failuresFor('f', `\n${agent('tools: Read, Grep, Glob', search)}`, reads)[0], /first byte/);
    assert.match(failuresFor('f', agent('tools: Read, Grep, Glob\ntools: Read', search), reads)[0], /2 tools keys/);
    // (f) a stale quoted grant fails; the real one passes
    assert.match(failuresFor('f', agent('tools: Read, Grep, Glob', `your grant (\`Read, Grep\`) runs nothing\n\n${search}`), reads).join('\n'), /quotes the grant/);
    // (g) the search rule: absent, inside code, or cut short fails; a fenced reader needs none
    assert.match(failuresFor('f', agent('tools: Read, Grep, Glob', ''), reads)[0], /no "## Searching/);
    assert.match(failuresFor('f', agent('tools: Read, Grep, Glob', `\`\`\`\n${search}\`\`\``), reads)[0], /no "## Searching/);
    assert.match(failuresFor('f', agent('tools: Read, Grep, Glob', `${SEARCH_HEADING}\n\nBuild lists by hand.\n`), reads)[0], /lacks/);
    assert.deepEqual(failuresFor('f', agent('tools: Read, Grep', ''), fenced), []);
    // (h) the safety floor
    assert.equal(breaksFloor(['Read', 'WebFetch', 'Write']), true);
    assert.equal(breaksFloor(['Read', 'Grep', 'WebSearch', 'WebFetch']), false);
    assert.equal(breaksFloor(['Bash', 'Read', 'Write']), false);
    // (i) a held removal is accepted; the same tool, not held, fails; holding one tool excuses no other
    assert.deepEqual(failuresFor('f', agent('tools: Read, Grep, Glob, Bash', search), reads, ['Bash']), []);
    assert.match(failuresFor('f', agent('tools: Read, Grep, Glob, Bash', search), reads, []).join('\n'), /holds Bash/);
    assert.match(failuresFor('f', agent('tools: Read, Grep, Glob, Bash, Write', search), reads, ['Bash']).join('\n'), /holds Write/);
    // (j) a held removal never excuses a missing addition
    assert.match(failuresFor('f', agent('tools: Read, Grep, Bash', search), reads, ['Bash']).join('\n'), /missing Glob/);
    // (k) Write and Edit go together, with no exceptions: each half alone fails, in the grant
    //     and in the held list; the pair passes
    assert.deepEqual(writeEditFailures('f', ['Read', 'Write', 'Edit']), []);
    assert.match(writeEditFailures('f', ['Read', 'Edit']).join('\n'), /holds Edit without Write/);
    assert.match(writeEditFailures('f', ['Read', 'Write', 'Edit'], ['Write']).join('\n'), /held removals hold Write without Edit/);
    assert.match(writeEditFailures('f', ['Read', 'Write', 'Edit'], ['Edit']).join('\n'), /held removals hold Edit without Write/);
    assert.deepEqual(writeEditFailures('f', ['Read', 'Write', 'Edit'], ['Write', 'Edit']), []);
    // (l) the grant check leaves Edit to check 9: a writer holding the pair passes it
    assert.deepEqual(failuresFor('f', agent('tools: Read, Grep, Glob, Write, Edit', search), readsWrites), []);
  });

  const fixture = (fm, body = '') => `---\nname: fixture\n${fm}\n---\n\n# Fixture\n\n${body}\n`;
  const grantIn = (fm) => grantOf(splitAgent(fixture(fm)).fm);

  it('7.1 a grant the test cannot read fails closed, by name, debt or not', () => {
    assert.match(String(grantIn('Tools: Read, WebFetch, Write').error), /exactly "tools:"/);
    assert.match(String(grantIn('tools : Read, WebFetch, Write').error), /exactly "tools:"/);
    assert.match(String(grantIn('"tools": Read').error), /exactly "tools:"/);
    assert.match(String(grantIn('model: opus').error), /0 tools keys/);
    assert.match(String(grantIn('tools: Read\ntools: Read, WebFetch').error), /2 tools keys/);
    assert.match(String(grantIn('tools: "Read, Grep, Glob, WebFetch, Write"').error), /line 2 is not in canonical form/);
    assert.match(String(grantIn('tools: ["Read", "Grep", \'Glob\']').error), /line 2 is not in canonical form/);
    assert.match(String(grantIn('tools: Read, mcp__fetch__fetch').error), /not a known tool/);
    assert.match(String(grantIn('tools: Read, Bash(git:*)').error), /not a known tool/);
    assert.match(String(grantIn('tools: Read, , Grep').error), /empty/);
    assert.match(String(grantIn('tools: [Read, Grep').error), /unterminated/);
    assert.match(String(grantIn('tools: Read\n- WebFetch').error), /a frontmatter line this test cannot read/);
    assert.match(String(grantIn('tools:\n- Read\n- Grep').error), /writes its tools as a list/);
    assert.equal(splitAgent('\uFEFF---\ntools: Read\n---\n'), null);
    assert.deepEqual(grantOf(splitAgent('---\ntools: Read, Grep\n--- \nbody\n').fm).tools, ['Read', 'Grep']);
    // the census names every agent whose grant cannot be read, in debt or not
    assert.deepEqual(unreadableGrants([
      { key: 'quality/code-reviewer', text: fixture('model: opus') },
      { key: 'f/ok', text: fixture('tools: Read') },
      { key: 'f/no-frontmatter', text: '# no frontmatter\n' },
    ]), [
      'quality/code-reviewer: has 0 tools keys; exactly one is required (a missing tools key grants every tool)',
      'f/no-frontmatter: no frontmatter at the first byte, so no grant can be read',
    ]);
    // the checks that read grants fail closed on one they cannot read
    assert.match(floorFailures([{ key: 'f', text: fixture('Tools: Read, WebFetch, Write') }], {}).join('\n'), /f: its grant cannot be read/);
    assert.match(writeEditCheckFailures([{ key: 'f', text: fixture('model: opus') }], new Set(), {}).join('\n'), /f: its grant cannot be read/);
    assert.match(heldCheckFailures([{ key: 'f', text: fixture('model: opus') }], { f: ['Bash'] }).join('\n'), /f: its grant cannot be read/);
  });

  it('7.2 the safety floor is an allowlist: a web tool with anything outside it breaks the floor', () => {
    // fixture (h): NotebookEdit is a write tool
    assert.equal(breaksFloor(['Read', 'WebFetch', 'NotebookEdit']), true);
    for (const extra of ['MultiEdit', 'Task', 'Agent', 'mcp__fetch__fetch', 'Bash(git:*)', 'Edit', 'Bash']) {
      assert.equal(breaksFloor(['Read', 'WebSearch', extra]), true, extra);
    }
    assert.equal(breaksFloor([...FLOOR_SAFE]), false);
    assert.equal(breaksFloor(['Bash', 'Read', 'Write', 'Task']), false);
  });

  it('7.3 the census fails, by path, on an entry it cannot list or read and on any non-regular entry', () => {
    const root = path.join(path.sep, 'fixture-agents');
    const dirent = (name, kind) => ({ name, isDirectory: () => kind === 'dir', isFile: () => kind === 'file', isSymbolicLink: () => kind === 'link' });
    const tree = {
      [root]: [dirent('x.md', 'file'), dirent('link.md', 'link'), dirent('pipe', 'fifo'), dirent('sub', 'dir'), dirent('locked.md', 'file'), dirent('notes.txt', 'file')],
      [path.join(root, 'sub')]: [dirent('y.md', 'file')],
    };
    const fail = (code) => Object.assign(new Error(code), { code });
    const io = {
      readdirSync: (d) => { if (!tree[d]) throw fail('ENOENT'); return tree[d]; },
      readFileSync: (f) => { if (f.endsWith('locked.md')) throw fail('EACCES'); return 'text'; },
    };
    const loaded = loadAgents(root, io);
    assert.deepEqual(loaded.agents.map((a) => a.key), ['sub/y', 'x']);
    assert.deepEqual(loaded.problems, [
      'link.md: a symbolic link; the census reads only regular files',
      'locked.md: cannot be read (EACCES)',
      'pipe: not a regular file or a directory',
    ]);
    assert.deepEqual(loadAgents(path.join(root, 'gone'), io).problems, ['.: cannot be listed (ENOENT)']);
  });

  it('7.4 an unneeded tool fails on every agent, debt included; only a held tool or a listed safety tool is excused', () => {
    const debt = new Set(['f']);
    const profiles = { f: reads };
    assert.match(grantCheckFailures([{ key: 'f', text: fixture('tools: Read, Bash') }], { debt, profiles, held: {}, exceptions: {} }).join('\n'), /f: holds Bash, which its orders do not need/);
    assert.deepEqual(grantCheckFailures([{ key: 'f', text: fixture('tools: Read') }], { debt, profiles, held: {}, exceptions: {} }), []);
    assert.deepEqual(grantCheckFailures([{ key: 'f', text: fixture('tools: Read, Bash') }], { debt, profiles, held: { f: ['Bash'] }, exceptions: {} }), []);
    const exceptions = { f: { reason: 'holds WebSearch; slice 2 drops it', tools: ['WebSearch'] } };
    assert.deepEqual(grantCheckFailures([{ key: 'f', text: fixture('tools: Read, WebSearch') }], { debt, profiles, held: {}, exceptions }), []);
    assert.match(grantCheckFailures([{ key: 'f', text: fixture('tools: Read, WebSearch, WebFetch') }], { debt, profiles, held: {}, exceptions }).join('\n'), /f: holds WebFetch/);
    // outside debt, the missing half fails too
    assert.match(grantCheckFailures([{ key: 'f', text: fixture('tools: Read') }], { debt: new Set(), profiles, held: {}, exceptions: {} }).join('\n'), /f: missing Grep/);
  });

  it('7.5 every safety-floor exception names its tools and the slice that removes it', () => {
    const list = [{ key: 'f', text: fixture('tools: Read, WebFetch, Write') }];
    assert.match(floorFailures(list, { f: { reason: 'a reason long enough that names no plan part', tools: ['WebFetch'] } }).join('\n'), /f: .*names no slice/);
    assert.match(floorFailures(list, { f: { reason: 'slice 5 drops it', tools: [] } }).join('\n'), /f: .*lists no tool/);
    assert.match(floorFailures(list, { f: 'holds WebFetch and Write; slice 5 drops WebFetch' }).join('\n'), /f: .*lists no tool/);
    assert.deepEqual(floorFailures(list, { f: { reason: 'holds WebFetch and Write; slice 5 drops WebFetch', tools: ['WebFetch'] } }), []);
  });

  it('7.7 a frontmatter line Claude Code could read differently fails closed, one shape per line', () => {
    const cannot = /a frontmatter line this test cannot read/;
    // "---" inside a value: Claude Code ends the frontmatter there, and the agent gets every tool
    assert.match(String(grantIn('description: one --- two\ntools: Read').error), /holds "---"/);
    // a key outside the set in use today: memory adds Read, Write and Edit to the grant
    assert.match(String(grantIn('tools: WebSearch, WebFetch\nmemory: user').error), /frontmatter key "memory"/);
    // a key that does not start with a letter, an explicit key, an escaped key
    assert.match(String(grantIn('tools: Read\n_tools: Read, WebFetch, Write').error), cannot);
    assert.match(String(grantIn('tools: Read\n? tools\n: Read, WebFetch, Write').error), cannot);
    assert.match(String(grantIn('tools: Read\n"tool\\x73": Read, WebFetch, Write').error), cannot);
    // a value that opens a quote or a bracket and never closes it
    assert.match(String(grantIn('tools: Read\ncolor: "blue').error), /under color.*it is quoted/);
    assert.match(String(grantIn("tools: Read\ncolor: 'blue").error), /under color.*it is quoted/);
    assert.match(String(grantIn('tools: Read\ncategory: [a, b').error), /under category.*YAML indicator/);
    assert.match(String(grantIn('tools: Read\ncategory: {a: b').error), /under category.*YAML indicator/);
    // a value that starts with a YAML indicator character
    assert.match(String(grantIn('tools: Read\ncolor: &anchor blue').error), /under color.*YAML indicator/);
    assert.match(String(grantIn('tools: Read\ndescription: *ref').error), /under description.*YAML indicator/);
    assert.match(String(grantIn('tools: Read\ndescription: | text').error), /under description.*YAML indicator/);
    // tools: on its own lines, in any shape, is not canonical (blank, comment or bare lines included)
    const asList = /writes its tools as a list/;
    assert.match(String(grantIn('tools:\n  Read').error), asList);
    assert.match(String(grantIn('tools:\n  - Read\n\n  - WebFetch\n  - Write').error), asList);
    assert.match(String(grantIn('tools:\n  - Read\n  # reviewed\n  - WebFetch').error), asList);
    assert.match(String(grantIn('tools:\n  - Read, WebFetch').error), asList);
    // an indented continuation after an inline value, under tools or any other key
    assert.match(String(grantIn('tools: Read, Grep, Glob\n  , WebFetch, Write, Bash').error), cannot);
    assert.match(String(grantIn('tools: Read, Grep, Glob,\n  WebFetch, Write').error), cannot);
    assert.match(String(grantIn('description: one\n  two\ntools: Read').error), cannot);
    // a comment line or a blank line anywhere in the frontmatter
    assert.match(String(grantIn('# note\ntools: Read').error), cannot);
    assert.match(String(grantIn('tools: Read\n\ncolor: blue').error), cannot);
    // a key whose value sits on its own lines may hold indented lines, each value checked
    assert.deepEqual(grantIn('dispatches:\n  - code-reviewer\n  - synthesizer\ntools: Read').tools, ['Read']);
    assert.match(String(grantIn('reports_to:\n  agent: "cto-chief\ntools: Read').error), /under reports_to.*it is quoted/);
    // the canonical shapes still read; a comment after the grant is not canonical
    assert.deepEqual(grantIn('description: Reviews code: diffs only\ntools: Read, Grep').tools, ['Read', 'Grep']);
    assert.match(String(grantIn('tools: Read, Grep # a comment').error), /line 2 is not in canonical form/);
  });

  it('7.9 the frontmatter must equal its one canonical rendering, byte for byte', () => {
    const err = (fm) => String(grantIn(fm).error);
    const notPlain = (key, why) => new RegExp(`under ${key} that is not a canonical plain scalar: ${why}`);
    // the shapes in use today are canonical
    assert.deepEqual(grantIn('description: Reviews diffs: the risky parts, a "quoted" word, it\'s fine, `steps: [12]`\ntools: Read, Grep').tools, ['Read', 'Grep']);
    assert.deepEqual(grantIn('tools: Read\neffort_budget:\n  max_tokens: 200000\n  max_tool_calls: 50').tools, ['Read']);
    assert.deepEqual(grantIn('tools: Read\ndispatches:\n  - ai-quality/*\n  - cost/*').tools, ['Read']);
    // spacing: one space after the colon, no trailing space, ", " between tools, two-space indentation, spaces only
    assert.match(err('model:  opus\ntools: Read'), /line 2 is not in canonical form/);
    assert.match(err('tools: Read,Grep'), /line 2 is not in canonical form/);
    assert.match(err('tools: Read '), /line 2 is not in canonical form/);
    assert.match(err('tools: Read\neffort_budget:\n    max_tokens: 1'), /line 4 is not in canonical form/);
    assert.match(err('tools: Read\ndispatches:\n\t- a'), /line 4 is not in canonical form/);
    assert.match(err('tools: Read\ndispatches:\n    a: x\n  b: y'), /line 4 is not in canonical form/);
    assert.match(err('tools: Read\ndispatches:\n    - a\n  - b'), /line 4 is not in canonical form/);
    // plain scalars only: no quotes, no backslash, no trailing colon, no leading indicator, no comment
    assert.match(err('description: "see C:\\path x"\ntools: Read'), notPlain('description', 'it is quoted'));
    assert.match(err('description: "a" "x"\ntools: Read'), notPlain('description', 'it is quoted'));
    assert.match(err('description: "a"b"\ntools: Read'), notPlain('description', 'it is quoted'));
    assert.match(err("description: 'it's'\ntools: Read"), notPlain('description', 'it is quoted'));
    assert.match(err('description: see C:\\path\ntools: Read'), notPlain('description', 'it holds a backslash'));
    assert.match(err('description: the steps are as follows:\ntools: Read'), notPlain('description', 'it ends with ":"'));
    assert.match(err('description: - x\ntools: Read'), notPlain('description', 'it starts with a YAML indicator'));
    assert.match(err('description: one #two\ntools: Read'), notPlain('description', 'it holds " #"'));
    // indented values are plain too, and may not hold ": " or a flow bracket (Claude Code repairs only top-level lines)
    assert.match(err('tools: Read\ndispatches:\n  - "a'), notPlain('dispatches', 'it is quoted'));
    assert.match(err('tools: Read\neffort_budget:\n  max_tokens: "C:\\path"'), notPlain('effort_budget', 'it is quoted'));
    assert.match(err('tools: Read\ndispatches:\n  a: b: c'), notPlain('dispatches', 'it holds ": " on an indented line'));
    assert.match(err('tools: Read\ndispatches:\n  - a: b: c'), notPlain('dispatches', 'it holds ": " on an indented line'));
    assert.match(err('tools: Read\ndispatches:\n  - a[b]'), notPlain('dispatches', 'it holds a flow bracket on an indented line'));
    // one key once, at both levels; one kind of line per block; a block is never empty or broken by a blank line
    assert.match(err('tools: Read\nname: code-reviewer'), /has the key "name" twice/);
    assert.match(err('tools: Read\neffort_budget:\n  a: 1\n  a: 2'), /has the key "a" twice under effort_budget/);
    assert.match(err('tools: Read\ndispatches:\n  - a\n  b: c'), /mixes "- item" lines and "key: value" lines under dispatches/);
    assert.match(err('dispatches:\ntools: Read'), /has no lines under dispatches/);
    assert.match(err('tools: Read\neffort_budget:\n  a: 1\n\n  b: 2'), /a frontmatter line this test cannot read/);
    // the tools list on its own lines, at any indentation
    assert.match(err('tools:\n  - Read\n  - Grep\n- Glob'), /writes its tools as a list/);
    // an invisible character Bun's YAML parser rejects (fourth security scan): a NUL anywhere; tab is not refused here
    assert.match(err('description: one\u0000two\ntools: Read'), /holds the invisible character U\+0000/);
    assert.match(err('tools: Read\ndispatches:\n  - a\u0000b'), /holds the invisible character U\+0000/);
    assert.match(err('tools: Read\nmodel: op\u0000us'), /holds the invisible character U\+0000/);
    assert.match(err('description: one\u200btwo\ntools: Read'), /holds the invisible character U\+200B/);
    assert.match(err('tools: Read\ndispatches:\n\t- a'), /line 4 is not in canonical form/);
    // nested keys that differ only in letter case are one key to a YAML parser
    assert.match(err('tools: Read\neffort_budget:\n  null: 1\n  Null: 2'), /has the key "Null" twice under effort_budget/);
  });

  it('7.10 every agent is named for its file, once; every known key is one Claude Code\'s repair step can reach', () => {
    assert.deepEqual(nameFailures([{ key: 'quality/code-reviewer', text: fixture('tools: Read').replace('name: fixture', 'name: code-reviewer') }]), []);
    assert.deepEqual(nameFailures([{ key: 'quality/code-reviewer', text: fixture('tools: Read') }]), [
      'quality/code-reviewer: its name is "fixture", not its file name "code-reviewer"',
    ]);
    assert.deepEqual(nameFailures([{ key: 'quality/code-reviewer', text: '---\ntools: Read\n---\n' }]), [
      'quality/code-reviewer: has no name; its name must be its file name "code-reviewer"',
    ]);
    assert.deepEqual(nameFailures([
      { key: 'quality/code-reviewer', text: fixture('tools: Read').replace('name: fixture', 'name: code-reviewer') },
      { key: 'other/code-reviewer', text: fixture('tools: Read').replace('name: fixture', 'name: code-reviewer') },
    ]), ['code-reviewer: the name of 2 definitions (other/code-reviewer, quality/code-reviewer)']);
    assert.deepEqual(unrepairableKeys(['tools', 'max_turns', 'effort-level']), []);
    assert.deepEqual(unrepairableKeys(['tools', 'max2Turns', 'a.b']), ['max2Turns', 'a.b']);
  });

  it('7.8 the census fails on a file Claude Code loads as an agent whose extension is not spelled .md', () => {
    const root = path.join(path.sep, 'fixture-agents');
    const dirent = (name) => ({ name, isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false });
    const io = { readdirSync: () => [dirent('a.md'), dirent('evil.MD'), dirent('odd.Md'), dirent('notes.txt')], readFileSync: () => 'text' };
    assert.deepEqual(loadAgents(root, io).problems, [
      'evil.MD: Claude Code loads it as an agent; spell the extension .md',
      'odd.Md: Claude Code loads it as an agent; spell the extension .md',
    ]);
  });

  it('7.6 fixture (f), the passing case: a body that quotes its real grant, in any order, passes', () => {
    const search = `${SEARCH_HEADING}\n\n${SEARCH_RULE}\n`;
    assert.deepEqual(failuresFor('f', fixture('tools: Read, Grep, Glob', `your grant (\`Glob, Grep, Read\`) runs nothing\n\n${search}`), reads), []);
  });

  it('8. the held removals only shrink, and hold only tools the agent still holds', () => {
    assert.equal(heldCount(), MAX_HELD_REMOVALS, `HELD_REMOVALS lists ${heldCount()} tools and MAX_HELD_REMOVALS is ${MAX_HELD_REMOVALS}; they move together, and only down`);
    const failures = heldCheckFailures(all, HELD_REMOVALS);
    assert.deepEqual(failures, [], failures.join('\n'));
  });

  it('9. Write and Edit go together, for every agent, in its grant and in its held removals', () => {
    const failures = writeEditCheckFailures(all, WRITE_EDIT_DEBT, HELD_REMOVALS);
    assert.deepEqual(failures, [], `agents that break "Write and Edit go together":\n  ${failures.join('\n  ')}`);
    assert.equal(WRITE_EDIT_DEBT.size, MAX_WRITE_EDIT_DEBT, `WRITE_EDIT_DEBT holds ${WRITE_EDIT_DEBT.size} agents and MAX_WRITE_EDIT_DEBT is ${MAX_WRITE_EDIT_DEBT}; they move together, and only down`);
  });

  // The second statement of each maximum, and the check that none rises above it, live in
  // tests/agent-tool-grants-maxima.test.js, so raising one means editing two files.
});
