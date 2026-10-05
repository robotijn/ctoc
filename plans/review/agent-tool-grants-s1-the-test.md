---
iron_loop_verdict: true
iron_loop: true
title: "The tool-grant test, written first: every agent's grant is checked against what its own body orders, with a ratchet that may only shrink"
type: implementation
parent_plan: agent-tool-grants
depends_on: none
priority: high
effort: medium
files:
  - tests/agent-tool-grants.test.js
  - tests/agent-tool-grants-maxima.test.js
  # Count files: creating a test file moves the documented test-file count in two
  # lines of CLAUDE.md and one line of README.md, pinned to the files on disk by
  # tests/doc-counts.test.js and tests/readme-numbers.test.js.
  - CLAUDE.md
  - README.md
approved_by: human
approved_at: 2026-10-05T14:58:03.528Z
gate_crossed: implementation → todo
---

# The tool-grant test, written first

**Scope (one line):** create `tests/agent-tool-grants.test.js`, which holds the audit of all 125 agent definitions as data (what each body orders), derives each agent's correct grant from it, and fails by agent name; every agent that does not yet meet the policy is listed as debt that may only shrink, every agent that breaks the safety floor today is listed as a known exception, with its reason, that may only shrink, and every tool removal the owner held is listed as a held removal that may only shrink.

Read first: the index `plans/implementation/agent-tool-grants.md` (the policy, the readings, the owner's answers, the full audit table) and slice 11, `agent-tool-grants-s11-removals-held.md`.

## Implementation Details

### The owner's answer this test is built on (2026-10-05)

"Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." So the test enforces every addition (Edit, Grep, Glob, the shared search section and `product-owner`'s two sentences) and the safety floor now, and it does **not** yet demand any tool removal made for least privilege. Each such removal sits in `HELD_REMOVALS`: the agent keeps the tool, the grant check accepts it, and the list may only shrink. Slice 11 removes an entry only after measured runs show the tool unused and the owner approves; the test then reports any entry whose tool the agent no longer holds, so a removal that has landed cannot stay listed.

The removals that ARE approved are the six safety fixes, and the test demands them as before: `product-owner` and `llm-security-tester` lose WebSearch; `ci-runner-setup` and `deployment-setup` lose WebFetch; `legal-scaffold` loses Write; `product-reviewer` loses Write, Bash and WebFetch. None of these is in `HELD_REMOVALS`, and check 2 refuses a web tool in it.

One addition is held with the removals: `vercel-deploy`'s WebFetch. Granted while its Write and Bash are held, it would break the safety floor, so its profile here is `reads` (no web tool), and slice 11 restores `web: ['WebFetch']` in the same change that removes its Write and Bash.

### Why the audit lives in the test as data

Which agents "write a file", "read code" or "order a command" is a finding made by reading each body, not something a text search can establish reliably (the owner's standing rule: a text search answers whether a string is present, never what an agent is ordered to do). So the test does not infer anything from the body for the grant rules. It holds the audit's result as an explicit, reviewable table, `PROFILE`, one entry per agent, and derives the exact grant from it. A changed grant therefore needs a changed profile, which is an edit to this test file, which needs a plan that declares it. That is deliberate: a tool grant is a security property.

The table lives in the test file, not in `.ctoc/`, because the edit protection lets any agent write under `.ctoc/` without a plan, and a table that decides tool grants must not be writable by the agents it governs.

### The checks

| Check | What fails it | Policy rule |
|---|---|---|
| The census | fewer than 100 agent definitions read; an agent file with no profile; a profile naming no file | non-vacuity |
| Profile integrity | `coordinates` on an agent outside the three coordinators; `fenced` together with `reads`; `creates` without `fenced`; a web tool other than WebSearch or WebFetch; a profile that itself breaks rule 6 with no exception | rules 4 and 6 |
| The grant | for an agent not in debt: a tool its profile needs that it lacks, or a tool it holds that its profile does not need and that is not in its `HELD_REMOVALS` entry; frontmatter not at the first byte; zero or two `tools:` lines | rules 1, 2, 3, 4, 5, 7 (removals held) |
| Held removals | a held entry naming no profiled agent, an unknown tool, a web tool, a tool its profile needs, a tool twice, or a set that with the profile breaks the safety floor (check 2); a held tool the agent no longer holds (remove it); more entries than `MAX_HELD_REMOVALS` (check 8) | the owner's answer of 2026-10-05 |
| The quoted grant | a backticked list made only of tool names (optionally after `tools:`) that differs from the agent's real grant | keeps bodies honest about their own grant |
| The search rule | a reading agent (not fenced, not web-only) without the section `## Searching the repository (shared rule)` holding the shared paragraph; `product-owner` without its two extra sentences | rule 2's last sentence; the end user's report |
| Debt | an agent in `DEBT` that now passes every check (remove it); `DEBT` larger than `MAX_DEBT` | ratchet |
| The safety floor | an agent whose actual grant holds WebSearch or WebFetch together with Write, Edit or Bash and is not in `RULE6_EXCEPTIONS`; an exception that no longer breaks the floor (remove it); a reason shorter than 20 characters; more exceptions than `MAX_RULE6_EXCEPTIONS` | rule 6 |
| The consistency pass | more than one definition named `product-owner`, a definition that is a redirect to a skill, or any `product-owner*` definition outside debt failing its checks | the end user's consistency pass runs as the `product-owner` type |
| The checks bite | each fixture defect produces its failure; each well-formed fixture produces none | non-vacuity |

The safety floor and the census are checked on every agent, debt or not. Only the grant, quoted-grant and search-rule checks are suspended for an agent in debt — and only while it still fails them. A held removal suspends nothing but the "holds a tool its orders do not need" failure, for that one tool on that one agent.

### The test file, as the specification for Step 8

```js
'use strict';

/**
 * Every agent holds the tools its own orders need, and no more.
 *
 * PROFILE is the tool-grant audit of plans/implementation/agent-tool-grants.md, held
 * as data: for each agent definition, what its body orders it to do. The correct
 * grant is derived from it (the policy's rules 1 to 5 and 7); the safety floor (rule
 * 6) is checked on the grant each agent actually holds. A violation fails with the
 * agent's name.
 *
 * DEBT, RULE6_EXCEPTIONS and HELD_REMOVALS only shrink. Each slice of the plan removes
 * the agents it fixes and lowers MAX_DEBT and MAX_RULE6_EXCEPTIONS by the same number;
 * slice 11 removes a held removal only after measured runs and the owner's approval.
 * An entry that no longer fails, or a held tool the agent no longer holds, is
 * reported, so it cannot linger.
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
  'planning/kpi-planner': { reads: true, writes: true, asks: true },
  'planning/product-owner': readsWrites,
  'planning/stack-chooser': { reads: true, writes: true, asks: true },
  'planning/unit-economics-modeler': { reads: true, writes: true, asks: true },
  'planning/vision-advisor': { reads: true, writes: true, asks: true },
  'planning/vision-decomposer': { reads: true, writes: true, asks: true },
  'product/experiment-designer': reads,
  'product/product-reviewer': reads,
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
const MUTATING = ['Write', 'Edit', 'Bash'];
const TOOL_WORDS = new Set([
  'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Grep', 'Glob', 'Bash',
  'Task', 'Agent', 'WebSearch', 'WebFetch', 'AskUserQuestion', 'Skill',
]);

// Rule 6 known exceptions: the grant held TODAY breaks the floor. Only shrinks.
const RULE6_EXCEPTIONS = Object.freeze({
  'planning/product-owner': 'holds WebSearch and Write; the owner approved dropping WebSearch on 2026-10-05, and slice 2 drops it',
  'ai-quality/llm-security-tester': 'holds WebSearch and Bash; the owner approved dropping WebSearch on 2026-10-05, and slice 10 drops it',
  'saas/legal-scaffold': 'holds WebFetch and Write; its body is a reviewer that orders no write (rule 7)',
  'infrastructure/ci-runner-setup': 'holds WebFetch with Write and Bash; its body orders no fetch',
  'infrastructure/deployment-setup': 'holds WebFetch with Write and Bash; its body orders no fetch',
  'product/product-reviewer': 'holds WebFetch with Write and Bash; its body orders no fetch, no write and no command',
});
const MAX_RULE6_EXCEPTIONS = 6;

// Agents whose definition does not yet meet the policy. Only shrinks.
const DEBT = new Set([
  // <the 118 keys of PROFILE that are neither fenced nor web-only, in PROFILE order>
]);
const MAX_DEBT = 118;

// Tool removals the owner HELD on 2026-10-05: "Approve the additions and the six safety
// fixes now; hold the removals until each is checked in a real run." Each tool listed is
// one the agent still holds although its profile does not need it; the grant check
// accepts it and nothing else. No web tool is ever held: dropping one is a safety fix,
// and those were approved. Only shrinks: slice 11 removes an entry after measured runs
// show the tool unused and the owner approves; check 8 reports a held tool the agent no
// longer holds. 44 tools on 26 agents: Bash 20, Write 14, Edit 9, Task 1.
const HELD_REMOVALS = Object.freeze({
  'architecture/pattern-detector': ['Bash'],
  'compliance/sbom-cra-checker': ['Bash'],
  'data-ml/data-quality-checker': ['Bash'],
  'data-ml/feature-store-validator': ['Bash'],
  'legal/clm-obligations': ['Write'],
  'legal/dsar-handler': ['Write', 'Bash'],
  'mobile/react-native-bridge-checker': ['Bash'],
  'pipeline/agent-tester': ['Bash'],
  'product/experiment-designer': ['Write'],
  'saas/clerk-auth': ['Write', 'Edit', 'Bash'],
  'saas/inngest-jobs': ['Write', 'Edit', 'Bash'],
  'saas/multi-tenancy-row-level': ['Write', 'Edit', 'Bash'],
  'saas/posthog-analytics': ['Write', 'Edit'],
  'saas/rate-limiting': ['Write', 'Edit'],
  'saas/resend-email': ['Write', 'Edit', 'Bash'],
  'saas/sentry-errors': ['Write', 'Edit', 'Bash'],
  'saas/stripe-subscriptions': ['Write', 'Edit', 'Bash'],
  'saas/supabase-data': ['Write', 'Edit', 'Bash'],
  'saas/vercel-deploy': ['Write', 'Bash'],
  'security/cra-incident-clocks': ['Write'],
  'security/incident-responder': ['Bash'],
  'security/threat-modeler': ['Bash'],
  'specialized/configuration-validator': ['Bash'],
  'specialized/database-reviewer': ['Bash'],
  'specialized/health-check-validator': ['Bash'],
  'testing/quality-gate-runner': ['Task'],
});
const MAX_HELD_REMOVALS = 44;
const heldCount = () => Object.values(HELD_REMOVALS).reduce((n, tools) => n + tools.length, 0);

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

/** The tools a profile needs. */
function expectedTools(p) {
  const t = new Set();
  if (p.reads) for (const x of ['Read', 'Grep', 'Glob']) t.add(x);
  if (p.fenced) for (const x of ['Read', 'Grep']) t.add(x);
  if (p.writes) for (const x of ['Write', 'Edit']) t.add(x);
  if (p.creates) t.add('Write');
  if (p.commands) t.add('Bash');
  if (p.coordinates) t.add('Task');
  if (p.asks) t.add('AskUserQuestion');
  for (const w of p.web || []) t.add(w);
  return t;
}

/** The first frontmatter block, only when it starts at the first byte, as the loader reads it. */
function splitAgent(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end === -1) return null;
  return { fm: lines.slice(1, end), body: lines.slice(end + 1).join('\n') };
}

function fmValue(fm, key) {
  const line = fm.find((l) => l.startsWith(`${key}:`));
  return line === undefined ? null : line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
}

/** The tools the first frontmatter block grants, inline or list form, or why none can be read. */
function grantOf(fm) {
  const at = [];
  fm.forEach((l, i) => { if (/^tools:/.test(l)) at.push(i); });
  if (at.length !== 1) return { error: `has ${at.length} top-level tools lines; exactly one is required` };
  const inline = fm[at[0]].slice('tools:'.length).replace(/#.*$/, '').trim();
  const tools = [];
  if (inline) {
    for (const t of inline.replace(/^\[|\]$/g, '').split(',')) if (t.trim()) tools.push(t.trim());
  } else {
    for (let i = at[0] + 1; i < fm.length && /^\s+-\s/.test(fm[i]); i++) tools.push(fm[i].replace(/^\s+-\s*/, '').trim());
  }
  if (tools.length === 0) return { error: 'grants no tools' };
  return { tools };
}

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
  for (const t of have) if (!want.has(t) && !held.includes(t)) out.push(`${key}: holds ${t}, which its orders do not need`);
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

const breaksFloor = (tools) => tools.some((t) => WEB_TOOLS.includes(t)) && tools.some((t) => MUTATING.includes(t));

/** Every agent definition: key, text. */
function agents() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.md')) {
        const key = path.relative(AGENTS_DIR, full).split(path.sep).join('/').replace(/\.md$/, '');
        out.push({ key, text: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(AGENTS_DIR);
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

describe('every agent holds the tools its own orders need, and no more', () => {
  const all = agents();

  it('1. the census: at least 100 definitions, each with a profile, and no profile without a file', () => {
    assert.ok(all.length >= MIN_AGENTS, `read ${all.length} agent definitions; at least ${MIN_AGENTS} expected`);
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
    assert.deepEqual(bad, [], bad.join('\n'));
  });

  it('3. every agent outside the debt list meets the policy', () => {
    const failures = all.filter((a) => !DEBT.has(a.key)).flatMap((a) => failuresFor(a.key, a.text, PROFILE[a.key] || {}, HELD_REMOVALS[a.key]));
    assert.deepEqual(failures, [], `agents whose grant or body does not meet the policy:\n  ${failures.join('\n  ')}`);
  });

  it('4. the debt list only shrinks, and holds only agents that still fail', () => {
    assert.ok(DEBT.size <= MAX_DEBT, `the debt list holds ${DEBT.size} agents; at most ${MAX_DEBT}`);
    const unknown = [...DEBT].filter((k) => !(k in PROFILE));
    assert.deepEqual(unknown, [], `debt names no profiled agent: ${unknown.join(', ')}`);
    const paid = all.filter((a) => DEBT.has(a.key) && failuresFor(a.key, a.text, PROFILE[a.key], HELD_REMOVALS[a.key]).length === 0).map((a) => a.key);
    assert.deepEqual(paid, [], `these agents now meet the policy; remove them from DEBT and lower MAX_DEBT: ${paid.join(', ')}`);
  });

  it('5. the safety floor: no agent holds a web tool with Write, Edit or Bash unless it is a listed exception', () => {
    const breaking = new Set();
    for (const a of all) {
      const parts = splitAgent(a.text);
      const g = parts ? grantOf(parts.fm) : { tools: [] };
      if (g.tools && breaksFloor(g.tools)) breaking.add(a.key);
    }
    const unlisted = [...breaking].filter((k) => !(k in RULE6_EXCEPTIONS));
    const resolved = Object.keys(RULE6_EXCEPTIONS).filter((k) => !breaking.has(k));
    const thin = Object.entries(RULE6_EXCEPTIONS).filter(([, r]) => typeof r !== 'string' || r.length < 20).map(([k]) => k);
    assert.deepEqual(unlisted, [], `agents reading untrusted web content that can also write or run commands: ${unlisted.join(', ')}`);
    assert.deepEqual(resolved, [], `these exceptions no longer break the floor; remove them and lower MAX_RULE6_EXCEPTIONS: ${resolved.join(', ')}`);
    assert.deepEqual(thin, [], `exceptions without a written reason: ${thin.join(', ')}`);
    assert.ok(Object.keys(RULE6_EXCEPTIONS).length <= MAX_RULE6_EXCEPTIONS, 'the exception list only shrinks');
  });

  it('6. the product-owner consistency pass runs with the same grant: one definition answers to the name', () => {
    const named = all.filter((a) => { const p = splitAgent(a.text); return p && fmValue(p.fm, 'name') === 'product-owner'; });
    assert.deepEqual(named.map((a) => a.key), ['planning/product-owner'], 'every dispatch of product-owner must load this one definition');
    assert.notEqual(fmValue(splitAgent(named[0].text).fm, 'type'), 'wrapper', 'product-owner must not redirect to a skill');
    const family = all.filter((a) => { const p = splitAgent(a.text); const n = p && fmValue(p.fm, 'name'); return n && n.startsWith('product-owner'); });
    const failures = family.filter((a) => !DEBT.has(a.key)).flatMap((a) => failuresFor(a.key, a.text, PROFILE[a.key] || {}, HELD_REMOVALS[a.key]));
    assert.deepEqual(failures, [], failures.join('\n'));
  });

  it('7. the checks bite: each defect fails, each well-formed fixture passes', () => {
    const agent = (fm, body) => `---\nname: fixture\n${fm}\n---\n\n# Fixture\n\n${body}\n`;
    const search = `${SEARCH_HEADING}\n\n${SEARCH_RULE}\n\n## Next\n`;
    // (a) the grant the end user reported, against a plan writer's profile
    assert.deepEqual(failuresFor('f', agent('tools: Read, Write, WebSearch, Glob', search), readsWrites), [
      'f: missing Grep', 'f: missing Edit', 'f: holds WebSearch, which its orders do not need',
    ]);
    // (b) a reviewer holding Write fails (rule 7); a checker holding Bash with no order fails (rule 3)
    assert.match(failuresFor('f', agent('tools: Read, Grep, Glob, Write', search), reads).join('\n'), /holds Write/);
    assert.match(failuresFor('f', agent('tools: Read, Grep, Glob, Bash', search), reads).join('\n'), /holds Bash/);
    // (c) a well-formed reader passes; the list form is read
    assert.deepEqual(failuresFor('f', agent('tools: Read, Grep, Glob', search), reads), []);
    assert.deepEqual(failuresFor('f', agent('tools:\n  - Read\n  - Grep\n  - Glob', search), reads), []);
    // (d) a tools line inside a fenced example is not a grant
    assert.match(failuresFor('f', agent('tools: Read', `${search}\n\`\`\`yaml\ntools: Read, Grep, Glob\n\`\`\``), reads).join('\n'), /missing Grep/);
    // (e) frontmatter not at the first byte, or two tools lines
    assert.match(failuresFor('f', `\n${agent('tools: Read, Grep, Glob', search)}`, reads)[0], /first byte/);
    assert.match(failuresFor('f', agent('tools: Read, Grep, Glob\ntools: Read', search), reads)[0], /2 top-level tools lines/);
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
  });

  it('8. the held removals only shrink, and hold only tools the agent still holds', () => {
    assert.ok(heldCount() <= MAX_HELD_REMOVALS, `HELD_REMOVALS lists ${heldCount()} tools; at most ${MAX_HELD_REMOVALS}`);
    const landed = [];
    for (const a of all) {
      const held = HELD_REMOVALS[a.key];
      if (!held) continue;
      const parts = splitAgent(a.text);
      const g = parts ? grantOf(parts.fm) : { tools: [] };
      for (const t of held) if (!(g.tools || []).includes(t)) landed.push(`${a.key} ${t}`);
    }
    assert.deepEqual(landed, [], `these held removals have landed; remove them from HELD_REMOVALS and lower MAX_HELD_REMOVALS (slice 11, with the owner's approval): ${landed.join(', ')}`);
  });
});
```

`DEBT` is written out in full in the file (118 keys, one per line); the comment above stands in for the list only in this plan, to keep the plan readable. The keys are exactly the PROFILE keys minus the two web-only agents (`ai-quality/deepthink-researcher`, `compliance/eu-solution-recommender`) and the five fenced agents (`iron-loop/advocate-critic`, `iron-loop/devils-advocate-critic`, `iron-loop/gate-critic`, `iron-loop/premortem-critic`, `iron-loop/red-team-critic`). Step 8 confirms that number by running the test with `DEBT` empty first (see the runs).

### Why these seven are out of debt from the start

- The two web-only agents keep their grant (WebSearch, WebFetch) and need no search section (they read no file). Both are pinned that way already (`tests/deepthink-ships-with-ctoc.test.js`, `tests/eu-solution-recommender-agent.test.js`).
- The five fenced agents keep their grants, as the owner answered on question 4 (index): Read and Grep (and Write for `gate-critic`). They need no search section: a whole-repository search order contradicts their read fence.

The owner's answer of 2026-10-05 keeps question 4's recommended answer: the five gate critics keep their grants unchanged.

### The runs to record, in order

1. **The test written, `DEBT` empty, `MAX_DEBT` 0, `HELD_REMOVALS` written in full:** `node --test tests/agent-tool-grants.test.js`. Expected: checks 1, 2, 4, 5, 7 and 8 pass (check 8 passes because every held tool is still held today); check 3 fails and names 118 agents, and no failure names a held tool; check 6 passes its first two assertions and fails its third, on `product-owner`. Record the count and the names. If the count is not 118, stop and reconcile the profile with the bodies before continuing (a different count means this plan's reading is wrong somewhere).
2. **`DEBT` seeded with exactly the 118 names from run 1, `MAX_DEBT` 118:** every check passes.
3. **Bite check by hand, then reverted:** remove `Grep` from `iron-loop/red-team-critic` in a scratch copy of the repository tree under the session's scratch folder (never in the working tree) and point a copy of the test at it; check 3 fails naming it. In the same copy, remove `Bash` from `architecture/pattern-detector`'s tools line; check 8 fails naming `architecture/pattern-detector Bash` as landed. Delete the copy.

### The counts

Set the three count lines to the number of `tests/*.test.js` files on disk at Step 10 (545 on 2026-10-05, so 546 unless another plan changed it):

- `CLAUDE.md`: `node --test tests/*.test.js          # Run all 545 test files — …`
- `CLAUDE.md`: `  tests/                 545 test files`
- `README.md`: `├── tests/           545 test files (run with \`npm test\`)`

### Wiring — the live call sites

The test runs under `npm test` (`src/scripts/test-gate.js` runs every `tests/*.test.js`). No module is added. The agent definitions it checks are loaded by the Claude runtime by name when dispatched.

### Security review

- The test reads files under `agents/` only, writes nothing, starts no process, uses no network and adds no dependency.
- The grant table lives in a file the edit protection covers (a test file needs a plan that declares it), not under `.ctoc/`, which agents may write without one.
- Rule 6 is enforced on the grant each agent actually holds, so an agent in debt is still held to the safety floor.
- A held removal can never hold a web tool, and an agent's profile together with its held tools may not break the floor (check 2), so holding a removal never relaxes the safety floor.

### Acceptance criteria

1. `tests/agent-tool-grants.test.js` exists as specified and passes, with 118 agents in debt, 6 safety-floor exceptions and 44 held removals on 26 agents (`MAX_HELD_REMOVALS` 44).
2. Run 1 failed check 3 naming 118 agents, recorded with the names.
3. Removing a required tool from an agent outside debt makes check 3 fail with that agent's name (run 3).
4. The three count lines equal the number of test files on disk.
5. The two Step 9 verifications below are recorded in this plan's execution record.
6. `npm run lint`, `npm run typecheck` and `npm test` pass, zero skipped.

## Decisions Taken Under Ambiguity

1. **The audit is data in the test, not an inference from the body.** A text match cannot tell an order from a mention; the profile is a reviewed reading that the index's table explains row by row.
2. **Exact equality, not "at least".** An extra tool fails as surely as a missing one; that is rules 3 and 7, and it catches a grant widened by accident.
3. **Debt is a list of names, not a number.** A name that starts passing must be removed, so the list cannot hide a regression elsewhere behind an agent that was fixed.
4. **No new dependency:** frontmatter is parsed by hand, as `tests/plugin-skill-discovery.test.js` does.
5. **The owner's answer (1), 2026-10-05, option (a):** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." The test demands every addition and the six safety fixes, and lists every least-privilege removal in `HELD_REMOVALS` instead of demanding it.
6. **Held removals are counted per tool, not per agent** (`MAX_HELD_REMOVALS` 44): one agent can lose Write after its measured runs and keep Bash, so the ratchet must move one tool at a time.
7. **`vercel-deploy`'s WebFetch is held with its removals**, not granted now: with its Write and Bash still held, WebFetch would break the safety floor, which the owner's answer leaves unrelaxed. Its profile is `reads` until slice 11.
8. **`changelog-generator`'s new Write is kept as an addition**: it is not a removal, and its body orders a file rewrite no tool it holds can carry out today.
9. **The owner's ruling, 2026-10-05 — Write and Edit (rule 1), word for word:** "Every agent that can write a file can also edit one, so it never rewrites a whole file to change a part. Write and Edit are granted together and removed together. An agent whose instructions order a write gets both. An agent that holds Write but whose instructions order no write (a held removal) keeps Write, gains Edit, and loses both together only when measured runs show it never writes." It came with his addition of the same day, "make certain to have the edit tool in the agents otherwise they rewrite the entire file", and his instruction "consolidate this".
10. **The built test departs from the specification above in these places** (the specification text itself is approval-protected and stays as approved; every departure is listed here):
    - **Write and Edit, one check.** The ruling is enforced in ONE check, check 9 "Write and Edit go together", over every agent, and nowhere else. Holding Write without Edit fails; holding Edit without Write fails, always (an `editsOnly` profile exception existed in the first build and was removed in the fix pass, per the owner's "granted together and removed together", with no exceptions); a held-removals entry holding one of the pair without the other fails. `expectedTools` derives Write from a write order and no longer adds Edit; the grant check (check 3) never judges Edit; check 8 does not report a held Edit as landed, because a held Edit the agent does not yet hold is check 9's debt. Check 9 has its own debt list, `WRITE_EDIT_DEBT` (22), and its own maximum.
    - **Held removals.** Edit is added to the five held-Write entries, and Bash to `product-reviewer` (decision 15): 50 tools on 27 agents, `MAX_HELD_REMOVALS` 50, where acceptance criterion 1 says 44.
    - **Fail closed on a grant it cannot read** (Step 11 finding 1, Step 13 finding 1, Step 13 re-scan findings 1 to 5). `grantOf` counts every spelling of the tools key (any case, quoted, indented, a space before the colon), demands exactly one written exactly `tools:`, strips quotes, rejects an unterminated list, an empty entry, a mix of inline and list forms, and any token not in `TOOL_WORDS` (so a tool from an external tool server or a scoped `Bash(...)` fails); the closing delimiter is matched after trimming trailing spaces. **Corrected after the re-scan:** as first built, this was NOT fail-closed against Claude Code's own reading — the re-scan found five shapes (a blank or comment line inside a tools list, an indented continuation line, `---` inside a value, the `memory:` key, an unclosed quote or an odd key elsewhere in the frontmatter, and an upper-case `.MD` file) that widen the real grant while the test stayed green. `frontmatterError`, called from `grantOf`, now refuses every frontmatter line the test cannot read the way Claude Code does (decision 19), and the census refuses an upper-case `.md` extension. Check 1 names every agent whose grant cannot be read, in debt or not; checks 3, 5, 8 and 9 each fail on an unreadable grant instead of reading it as an empty list. What stays believed, not proven: that the line grammar and Bun's YAML parser agree on every line the grammar accepts.
    - **The safety floor is an allowlist** (Step 11 finding 3, Step 13 finding 1): `FLOOR_SAFE` is Read, Grep, Glob, WebSearch, WebFetch and AskUserQuestion; a web tool held with anything else breaks the floor. `MUTATING` is deleted.
    - **Loading** (Step 13 finding 2): the agent definitions are loaded outside the suite and asserted in check 1, never in a `before()` hook; the loader records every directory it cannot list and every file it cannot read, by path, instead of throwing.
    - **The census** (Step 13 finding 4): a symbolic link or any other non-regular entry under `agents/` is a named census failure.
    - **Check 3 over every agent** (Step 11 finding 4, Step 13 finding 3): a tool an agent holds that its profile does not need fails on every agent, debt included; debt suspends only the missing tools, the quoted-grant check and the search section. Excused are exactly the agent's held removals and the tools named in its `RULE6_EXCEPTIONS` entry.
    - **`RULE6_EXCEPTIONS` entries are `{ reason, tools }`**; every reason names the slice that removes it, and check 5 enforces both. Check 2 refuses an excused tool that is unknown, needed by the profile, or also held.
    - **Ratchets** (Step 11 finding 7, Step 13 finding 5): the four list sizes must EQUAL their maximums, and the maximums are stated a second time in `HISTORICAL_MAXIMA`, checked by a new check 10 against the values of 2026-10-05 (118, 22, 6, 50).
    - **Check 6** keeps its first two assertions; the third, vacuous while `product-owner` is in debt and redundant with check 3 after, is deleted (Step 11 finding 8).
    - **Fixtures.** (a) is split (the missing Edit is named by check 9); (e) reads "2 tools keys"; (k) asserts Edit alone always fails; (l) tests the hand-off from check 3 to check 9; new checks 7.1 to 7.6 cover the fail-closed reading, the allowlist floor including fixture (h) for NotebookEdit, the loader, check 3 over debt, the exception shape, and fixture (f)'s passing case. The checks themselves (3, 5, 8, 9) are pure functions over a list of agents, so the fixtures drive the real check code.
    - **Comments**: the header names the index by name and stage folder; the `asks` profiles carry the documentation finding (decision 16); the `WRITE_EDIT_DEBT` lines name the slice that clears each.
11. **Check 9's debt, `WRITE_EDIT_DEBT`, holds the 22 agents that hold Write without Edit today** (`MAX_WRITE_EDIT_DEBT` 22), with no exceptions list; it only shrinks, and an entry that passes is reported. The run-1 red count was 22, not the 21 first counted by hand: `iron-loop/gate-critic` holds Read, Grep and Write.
12. **Under the ruling, every held Write is held with Edit**, so `HELD_REMOVALS` gains Edit on the five agents whose held Write had none (`legal/clm-obligations`, `legal/dsar-handler`, `product/experiment-designer`, `saas/vercel-deploy`, `security/cra-incident-clocks`): 49 tools on 26 agents (Bash 20, Write 14, Edit 14, Task 1), `MAX_HELD_REMOVALS` 49, where acceptance criterion 1 says 44. The five do not yet hold Edit; they stay in check 9's debt until a slice grants it. (Now 50 on 27 agents: decision 15.)
13. **`gate-critic` gains Edit** (CTO Chief decision, 2026-10-05), under the owner's later Write-and-Edit ruling, which supersedes question 4's "keep their grants exactly as they are" for this one tool. Slice 7 is to declare `agents/iron-loop/gate-critic.md`; until it lands, `gate-critic` stays in `WRITE_EDIT_DEBT`. Its profile stays `{ fenced, creates }`: it still gains no Glob and no whole-repository search order.
14. **The five held-Write agents gain Edit inside the slices that own their files** (CTO Chief decision, 2026-10-05): `product/experiment-designer` in slice 3, `saas/vercel-deploy` in slice 4, `legal/clm-obligations`, `legal/dsar-handler` and `security/cra-incident-clocks` in slice 8. Their Write and Edit pair is held together for slice 11.
15. **`product-reviewer`** (CTO Chief decision, 2026-10-05). The approved removal of its Write rested on a misreading: its method file (`skills/product/product-reviewer/SKILL.md`, its Step 8) orders two file writes, the weekly review and its actions file. The decision: slice 3 drops WebFetch only, which alone clears the safety floor; Write stays and Edit is added; Bash is held for slice 11. Its profile becomes `readsWrites`, `HELD_REMOVALS` gains `product/product-reviewer: ['Bash']` (50 tools on 27 agents: Bash 21, Write 14, Edit 14, Task 1), and its safety-floor exception now excuses WebFetch alone. Slice 3 must reflect this before it is approved for build.
16. **AskUserQuestion, a fact, verified at Step 9:** Claude Code removes AskUserQuestion from every dispatched subagent, foreground or background, "even when listed in the `tools` field" (https://code.claude.com/docs/en/sub-agents.md, section "Available tools", read 2026-10-05); the tools reference adds "a tool that isn't available to subagents is never granted, even when listed in `tools`" (https://code.claude.com/docs/en/tools-reference.md). Only a fork keeps it. So the five `asks: true` agents (`kpi-planner`, `stack-chooser`, `unit-economics-modeler`, `vision-advisor`, `vision-decomposer`) can never use it when dispatched. Removing the tool and routing their questions back to the session is a separate plan; this slice does not change those five profiles, and their check-3 rows stay as they are, with a comment in the test citing the documentation.
17. **Corrections after Step 9, to approval-protected text of this plan, recorded here and not made in place:**
    - Line 26, old: "Read first: the index `plans/implementation/agent-tool-grants.md`"; new: "Read first: the index `plans/todo/agent-tool-grants.md`".
    - Acceptance criterion 1, old: "with 118 agents in debt, 6 safety-floor exceptions and 44 held removals on 26 agents (`MAX_HELD_REMOVALS` 44)."; new: "with 118 agents in debt, 22 agents in the Write-and-Edit debt, 6 safety-floor exceptions and 50 held removals on 27 agents (`MAX_HELD_REMOVALS` 50)." (The Step 9 report gave 49 on 26; decision 15 makes it 50 on 27.)
    - The test file's header said `plans/implementation/agent-tool-grants.md`; corrected in the test itself to "the index plan agent-tool-grants.md (plans/<stage>/)".
18. **The new counts after decisions 13 to 15**, against the index's table: agents gaining Edit in slices 2 to 10, 15 → 22 (the 15, plus `gate-critic`, the five held-Write agents and `product-reviewer`; the CTO Chief brief said 21, which leaves out `product-reviewer`, whose Edit decision 15 adds); held removals 44 → 50 (Edit 9 → 14, Bash 20 → 21) on 26 → 27 agents; agents whose grant changes in slices 2 to 10, 76 → 79 (`gate-critic`, `clm-obligations` and `dsar-handler` now change there); approved Write removals 2 → 1 and approved Bash removals 1 → 0 (`product-reviewer` keeps Write, and its Bash is held). The tools the safety-floor exceptions excuse are six, not the eight counted by the Step 13 report: under decision 15, `product-reviewer`'s Write is needed and its Bash is held.
19. **The frontmatter is read by a line grammar that matches Claude Code's own reading or fails closed** (Step 13 re-scan, which read Claude Code 2.1.289's parser from its shipped code). `frontmatterError` refuses: `---` anywhere inside the block (Claude Code ends the frontmatter at the first `---`, and a frontmatter it cannot parse becomes empty, so every tool); a key outside the 28 in use on 2026-10-05 (`memory` adds Read, Write and Edit); a key not starting with a letter (an explicit `? key`, a quoted or escaped key); a value that opens a quote or bracket and never closes it; a value starting with a YAML indicator character; under `tools:`, any line but a `- Tool` item, and only when `tools:` has no inline value; under any other key, an indented line unless that key's value sits on its own lines (each nested value checked the same way); a blank line or a comment line anywhere in the block. The census fails a file whose name ends in `.md` in any letter case other than lower case, naming its path, because Claude Code loads it as an agent. No second YAML reader is added: js-yaml is not a declared dependency (CTO Chief decision). The byte-order-mark fixture is written as the escape `\uFEFF`; the Edit tool could not express that change (it turned the escape back into the raw byte), so it was made with a one-line, checked string replacement, which found exactly one raw byte-order mark. **Corrected after the third security scan:** the heading's claim that this grammar "matches Claude Code's own reading or fails closed" was false. It accepted lines a YAML parser rejects — a description ending in ":", a quoted value with an unknown escape (`C:\path`), two quoted scalars on one value, a quote inside a quoted value, a value starting with "- ", mixed indentation inside a block or the tools list, a nested `a: b: c`, items and pairs mixed in one block, a duplicate key at either level. Claude Code then discards the whole frontmatter and grants every tool, while the test read the intended grant. The grammar was a denylist; decision 23 replaces it with canonical form. This decision's own record of the mark also briefly held the raw byte it described; it now reads as the six characters of the escape.
22. **The owner granted the maxima file to this slice** (2026-10-05, scope-growth request `1791226690486-rxjfsg`): "a) Yes: add the separate limits file to slice 1." The session widened `files:` and re-recorded the build approval in the foreground with the owner present; this executor did neither. `tests/agent-tool-grants-maxima.test.js` holds each maximum's ceiling once (118, 22, 6, 50) and reads each `MAX_*` from the main test as a literal declaration, failing closed when one is missing, declared twice, assigned again or computed; it also fails if the main test states the maximums a second time. Check 10 and `HISTORICAL_MAXIMA` are deleted from the main test, so each maximum lives once in each file. The test-file count is 547. **Revised the same day — the stricter ratchet (CTO Chief decision, 2026-10-05):** each `MAX_*` in the main test must EQUAL its ceiling in the maxima file, not merely sit at or below it. Lowering a maximum therefore takes both files changing together in the same slice, and raising one back does too; one edit to one file can no longer move a maximum in either direction. Slices 2 to 10 add `tests/agent-tool-grants-maxima.test.js` to their `files:` for this (that edit is made by a separate agent, not this executor). The first build's "at or below" direction, and its cost (a lowered maximum could be raised back to its ceiling with one edit), are superseded.
20. **The second statement of the maximums in its own test file waits on a scope decision** (superseded by decision 22). The CTO Chief session decided `HISTORICAL_MAXIMA` should move to a new file, `tests/agent-tool-grants-maxima.test.js`, so raising a maximum means editing two files. That file is not in this plan's `files:`, and the edit protection does not cover it, so under the scope-growth rule a request was filed (inbox question `1791226690486-rxjfsg`) and the file was not created. Until the owner decides through the menu, both copies stay in `tests/agent-tool-grants.test.js` (re-scan shape F5b, all copies raised in one edit, stays green), and the test-file count stays 546.
21. **Correction after the Step 13 re-scan, to approval-protected text of this plan, recorded here and not made in place.** The security review section said: "Rule 6 is enforced on the grant each agent actually holds, so an agent in debt is still held to the safety floor." The re-scan disproved it for frontmatter shapes the test read differently from Claude Code. Corrected reading: "Rule 6 is enforced on the grant each agent actually holds, as Claude Code reads it, for every agent in debt or not; a frontmatter the test cannot read the way Claude Code does fails closed (decision 19). Agreement with Bun's YAML parser on every line the grammar accepts is believed, not proven." **Corrected again after the third security scan:** that corrected reading was itself false — the line grammar of decision 19 accepted sixteen shapes a YAML parser rejects, on which Claude Code grants every tool while the test read the intended grant, so an agent in debt was not held to the safety floor on those shapes. Current reading: "Rule 6 is enforced on the grant each agent actually holds, for every agent in debt or not, and only on a frontmatter that equals its one canonical rendering byte for byte (decision 23); any other frontmatter fails closed by name. That Bun's YAML parser reads every canonical frontmatter as the test does is believed, not proven; canonical form keeps to the plainest YAML there is."
23. **Canonical form, by construction, instead of a denylist** (CTO Chief decision, 2026-10-05, after the third security scan). The frontmatter is parsed by `parseFrontmatter` into an ordered list of keys and values and rendered back by `renderFrontmatter` in ONE canonical form: plain scalars, two-space indentation, `tools: A, B, C` on one line, `  - item` or `  key: value` lines under a key whose value sits on its own lines, one kind of line per block, no quotes, backslashes, tabs, comments, leading YAML indicators or trailing colons, no duplicate key at either level, no empty block. `grantOf` requires the frontmatter to EQUAL that rendering byte for byte (`\r\n` and `\n` alike), and otherwise fails by name with the line that differs and what it should read. Kept, because canonical form alone does not cover them: `---` inside the block, the 28 known keys (so `memory` is refused), exactly one tools key spelled exactly `tools:`, known tool names only, the upper-case `.MD` census rule. **Measured first:** all 125 agents already equal their canonical rendering; no agent needed normalising and none is listed as debt. **One reading, recorded as a choice:** a top-level value may hold ": " (two descriptions do: `security/dependency-auditor` and `security/security-scanner`), because Claude Code's own repair step rewrites such a top-level line into a quoted string with the same text; an indented value may not, because that repair step never touches indented lines. If ": " should be refused at top level too, those two agents (slice 8) must be normalised first and listed as debt until then. **Contract changes in the fixtures, all tightening:** the tools list on its own lines (fixture (c), test 7.1), quoted and bracketed tools lines (7.1), and a comment after the grant (7.7) were accepted and are now refused as not canonical; 7.7's messages name the new rule; new test 7.9 holds one assertion per shape (the scanner's seventeen and the spacing cases). **The maxima file reads values** (decision 22 stands): it evaluates the main test with `node:vm`, `describe` and `it` stubbed, and compares both the four `MAX_*` values and the real list sizes to its ceilings; a missing main file, a throw, or a missing binding fails. **Two new ceilings** there: the tools the safety-floor exceptions excuse (6), and the held removals per tool (Bash 21, Write 14, Edit 14, Task 1); test 2 holds them as historical ceilings too. **What stays open:** an edit to the main test's check code itself that leaves every value and list unchanged (for example, handing check 3 a wider debt set) — only review catches that. **After the fourth security scan (2026-10-05):** canonical form is verified against Bun 1.4.2 and 1.4.3-canary on all 125 agents; the exact embedded build is unpublished; re-run on each Claude Code update. (That scan ran Claude Code's own loader functions under those two Bun builds: 0 mismatches on all 125 agents, the top-level ": " repair confirmed on the two real cases and eleven variants, and a sweep of every Unicode code point that found one gap, U+0000.) Added in that pass: `parseFrontmatter` refuses any frontmatter line holding an invisible character (`\p{C}`, tab exempt), so a NUL is refused by name; nested keys are compared without regard to letter case (`null` and `Null` are one key to a YAML parser); each agent's `name` must equal its file's base name, once across all agents; every key in `FRONTMATTER_KEYS` must match `^[a-zA-Z_-]+$`, so the repair step can always reach it. In the maxima file: the stub runs `describe` bodies (an `it` body never runs); `runInContext` has a 10-second limit, so a main test that never finishes fails instead of hanging the run; failure values are printed with `JSON.stringify`, so a string `"118"` reads as one. The maxima header's "cannot catch" now also names values changed while the suite runs and a main test that detects the stub (for example by testing for `process`, or by replacing `JSON.stringify` in its own context).

24. **The two new ceilings are lowered by the slices that pay them down** (slice 1 final review, finding 2). Under the equality rule, a slice that removes a safety-floor exception or a held removal changes `EXCUSED_TOOLS` or `HELD_PER_TOOL` in the main test, and the maxima test fails at its first run unless the ceiling moves with it. So each slice's test-edits paragraph now says it: slice 2 lowers `CEILINGS.EXCUSED_TOOLS` by 1 (`product-owner`'s WebSearch), slice 3 by 1 (`product-reviewer`'s WebFetch), slice 4 by 1 (`legal-scaffold`'s Write), slice 5 by 2 (the two set-up agents' WebFetch), slice 10 by 1 (`llm-security-tester`'s WebSearch) — 6 in all; slice 11 lowers `CEILINGS.HELD_PER_TOOL.<tool>` by one for each removal that lands. Those slices are unapproved, so the sentences were added before their build approval.
25. **Two Step 11 review findings carried into later slices** (slice 1 final review, finding 3). Finding 12: slice 4 also rewords `legal-scaffold`'s body line 24 ("you produce drafts") and its method file's "produce drafts to `public/legal/`", and declares `skills/saas/legal-scaffold/SKILL.md` in its `files:` (slice 4, item 2b and its decision 7). Finding 13: slice 7 rewords the shared no-stub line in `iron-loop-critic`, `agent-qa`, `agent-tester` and `agent-critic` from "Make a documented choice in the plan's … section" to "report the choice in your output" (slice 7, its decision 6).

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation: create `tests/agent-tool-grants.test.js` as specified, with `DEBT` empty and `MAX_DEBT` 0
- [x] Test error conditions: check 7, fixtures (a) to (j); check 8
- [x] Run tests - expect RED (failing): run 1, recorded with the 118 names

### Step 9: PREPARE
- [x] Install dependencies if needed: none
- [x] Check prerequisites: count `agents/**/*.md` (125 on 2026-10-05) and `tests/*.test.js` on disk; have CTOC's `citation-validator` check the index's citation of Meta's "Agents Rule of Two" (https://ai.meta.com/blog/practical-ai-agent-security/) against the page, and record its verdict; read Claude Code's subagent documentation on whether a dispatched agent can call AskUserQuestion, and record the answer with its source (index, decision 9)
- [x] Verify dev environment ready: record the Node version
- [x] Create directories/config if needed: none

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements: seed `DEBT` with the names from run 1 and set `MAX_DEBT`; run 2; the three count lines
- [x] Add error handling: an unreadable agent file fails the census with its path
- [x] Wire up integration points: none; `npm test` runs the file

### Step 11: REVIEW
- [x] Self-review all new code: through CTOC's review agent, checking each PROFILE entry against the index's audit table
- [x] Verify integration points work together: `npm test` runs the new file
- [x] Check error handling completeness: run 3

### Step 12: OPTIMIZE
- [x] Remove redundant operations: each agent file is read once
- [x] Optimize critical paths: none
- [x] Simplify complex code: shared profile constants for the common shapes

### Step 13: SECURE
- [x] Validate inputs (no path traversal): the walk stays under `agents/`; through CTOC's security scan agent — four scans, the last `.ctoc/audit/tool-grant-run-notes/s1-step13-rescan-3-d-tg-s1-step13d.md` (2026-10-05); its one blocking finding (U+0000) and its six lower findings were fixed in the fourth fix pass
- [x] Sanitize outputs: failure messages carry agent keys and tool names only
- [x] No secrets in code: none
- [x] Safe file operations: read-only

### Step 14: VERIFY
- [x] Run lint + type check: `npm run lint`, `npm run typecheck`
- [x] Run ALL tests (TDD Green): `npm test`
- [x] Check coverage >= 80%: at or above the floor in `.ctoc/coverage-baseline.json` (no `src/` change)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation: the three count lines
- [x] Add JSDoc comments to new functions: one line each, as in the specification
- [x] Update CHANGELOG if needed: no changelog file exists

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly: through CTOC's final review agent — `.ctoc/audit/tool-grant-run-notes/s1-step16-final-review-d-tg-s1-step16.md` (2026-10-05): the code passes; its record findings 1, 2, 3, 5, 7 and 8 were applied to record text, and finding 4 is for the owner's report
- [x] All quality checks passed: `npm test` on the final bytes
- [x] Manual verification if needed: run 3
- [x] Ready for human review: through the menu's task completion (`menu task complete t126`, run after every other box was ticked)


## Execution Record (Steps 8–16)

Built by the iron-loop executor on 2026-10-05, task `t126` (recorded and claimed through `task-registry.addAndClaim` with the plan's own task spec, then `actions.startExecution` — the single-plan body of `startAgent`, because `startAgent` claims the head of the queue, which was another plan).

- **Step 8, run 1 (red), `DEBT` and `WRITE_EDIT_DEBT` empty, `HELD_REMOVALS` in full:** 9 tests, 6 pass, 3 fail. Check 3 names exactly 118 agents — the 125 minus the two web-only and the five fenced — and no failure names a held tool. Check 6 fails its third assertion on `planning/product-owner` (missing Grep; holds WebSearch; no search section). Check 9 names 22 agents holding Write without Edit. The 118 names are the `DEBT` list in the test, in profile order.
- **Step 9:** no dependency added; 125 agent definitions and 546 test files on disk (545 before this file); Node v24.14.1. **Not done by this executor, owed by the session:** the citation-validator check of the Meta "Agents Rule of Two" citation and the reading of Claude Code's subagent documentation on AskUserQuestion — this executor holds no web tool and no Task tool.
- **Step 10, run 2:** `DEBT` seeded with the 118 names (`MAX_DEBT` 118), `WRITE_EDIT_DEBT` with the 22 (`MAX_WRITE_EDIT_DEBT` 22): 9 of 9 pass. Count lines moved 545 → 546 in `CLAUDE.md` (two lines) and `README.md` (one line).
- **Step 11:** a mechanical cross-check of all 125 profiles against the index's audit table ("Proposed", or "Today" where unchanged), with Edit paired to Write: 125 rows compared, two differences, both known — `saas/vercel-deploy` WebFetch (held, decision 7) and `iron-loop/gate-critic` Edit (the owner's Write-and-Edit ruling against question 4's "keep their grants exactly as they are"). **Owed by the session:** the review agent's pass.
- **Run 3 (bite check), in a scratch copy under `<scratchpad>`, deleted afterwards:** Grep removed from `iron-loop/red-team-critic` → check 3 fails, "iron-loop/red-team-critic: missing Grep"; Bash removed from `architecture/pattern-detector` → check 8 fails, "architecture/pattern-detector Bash" landed; Edit removed from `documentation/documentation-updater` → check 9 fails, "holds Write without Edit". All other checks stayed green.
- **Step 13:** the test reads files under `agents/` only, writes nothing, starts no process, uses no network; failure messages carry agent keys and tool names only. **Owed by the session:** dispatch `security-scanner` on `tests/agent-tool-grants.test.js`.
- **Step 14:** `npm run lint` clean; `npm run typecheck` 1 pass 0 fail; `npm test` (the gated suite): 12080 tests, 12080 pass, 0 fail, 0 skipped, 0 cancelled; coverage 99.9% against the 99% floor; test gate PASS.
- **Step 16:** **owed by the session:** the final review agent, then `menu task complete t126`.

**Fix pass, 2026-10-05, after Step 9 (citations), Step 11 (review: back to Step 10) and Step 13 (security: block).** Reports in `.ctoc/audit/tool-grant-run-notes/`.
- **Step 8 again (red first):** a behaviour-neutral refactor first (the loader takes an injected file reader; checks 3 and 5 became pure functions over a list of agents; 9 of 9 still green), then six new fixture tests. Red run: 15 tests, 9 pass, 6 fail, each on its own fix — check 7 on "Edit alone always fails" (the `editsOnly` exception still passed), 7.1 on `Tools:` not refused, 7.2 on NotebookEdit beside WebFetch not breaking the floor, 7.3 on an unreadable file throwing (`EACCES`) instead of being named, 7.4 on the check ignoring the debt and exception tables it was handed, 7.5 on an exception reason that names no slice being accepted. 7.6 (fixture (f)'s passing case) passed on the old code: it is a missing assertion, not new behaviour.
- **Step 10 again:** the departures are listed in decision 10; decisions 13 to 18 record the CTO Chief decisions, the AskUserQuestion fact and the corrections after Step 9. Green: 16 of 16.
- **Bite runs, in a scratch copy under `<scratchpad>`, deleted afterwards — 19 of 19 fail by name:** code-reviewer's tools line deleted ("has 0 tools keys"); Bash added to code-reviewer ("holds Bash, which its orders do not need"); `WebFetch, NotebookEdit` added to the debt agent code-smell-detector ("reads untrusted web content"); a symbolic link under `agents/quality/` ("a symbolic link"); a quoted grant and a bracketed quoted grant with WebFetch; `Tools:`; `tools :`; two tools lines; WebSearch with Task; WebFetch with Agent; a tool from an external tool server ("not a known tool"); a closing delimiter with a trailing space; an unreadable file ("cannot be read (EACCES)"); `agents/` renamed away ("cannot be listed (ENOENT)"); Edit removed from documentation-updater; Grep removed from red-team-critic; held Bash removed from pattern-detector ("has landed"); `MAX_DEBT` raised to 119 ("above HISTORICAL_MAXIMA"). Every run exited non-zero with a non-zero fail count.
- **Step 14 again:** `node --test tests/agent-tool-grants.test.js` 16 pass, 0 fail, 0 skipped; `npm run lint` clean; `npm run typecheck` 1 pass, 0 fail; `npm test`: 12087 tests, 12087 pass, 0 fail, 0 skipped, 0 cancelled, coverage 99.9% against the 99% floor, test gate PASS. 546 test files on disk.
- **Owed by the session:** the security re-scan (Step 13) and the final review (Step 16), then `menu task complete t126`.

**Second fix pass, 2026-10-05, after the Step 13 re-scan (block).** Report: `.ctoc/audit/tool-grant-run-notes/s1-step13-rescan-d-tg-s1-step13b.md`.
- **Red first:** new tests 7.7 (22 frontmatter shapes, one assertion each) and 7.8 (the `.MD` census). Red run: 18 tests, 16 pass, 2 fail. On the old reader, 19 of the 22 shapes read as a clean grant; the other 3 already failed for a different reason (no tools, an unknown tool, an empty entry), so the specific assertion was red too.
- **Green:** 18 of 18.
- **The scanner's reproductions (`harness.js`, 48 rows) against this file:** 43 fail by name, 5 green. Four are correct greens: no change; Windows line endings with the grant unchanged; a `tools:` line in the body; an inline comment hiding nothing. The fifth is F5b (all copies of `MAX_DEBT` raised in one edit), open until the maxima file is approved (decision 20).
- **The earlier 19 bite runs:** 19 of 19 fail by name. Scratch copies deleted.
- **Scope-growth request filed:** `tests/agent-tool-grants-maxima.test.js` (decision 20).

**The maxima file, 2026-10-05, after the owner's grant (decision 22).**
- **Red first:** the new file ran 3 tests, 2 pass, 1 fail, failing because the main test still held `HISTORICAL_MAXIMA`. After the duplicate was removed from the main test: both files 20 of 20 (main 17, maxima 3).
- **Bite proof, in a scratch copy under `<scratchpad>`, deleted afterwards:** every copy of `MAX_DEBT` in the main file raised to 119 (one copy exists), `iron-loop/red-team-critic` added to `DEBT` and stripped of Grep. The main test stays 17 of 17 green; the maxima test fails by name: "MAX_DEBT is 119, above its ceiling 118."
- **Count lines:** 546 → 547 in `CLAUDE.md` (two lines) and `README.md` (one line).
- **Equality ratchet (decision 22, revised).** Red first: the "lowered alone" fixture (`MAX_DEBT = 114` against a ceiling of 118) failed against the at-or-below check; after the change, both files 20 of 20. Bite proof in a scratch copy, deleted afterwards: (1) `MAX_DEBT` raised to 119 in the main file alone, `red-team-critic` added to `DEBT` and stripped of Grep — main test 17 of 17 green, maxima test fails: "MAX_DEBT is 119 in the main test but 118 here"; (2) `MAX_DEBT` lowered to 117 in the main file alone, `ai-code-quality-reviewer` removed from `DEBT` — maxima test fails: "MAX_DEBT is 117 in the main test but 118 here" (the main test also fails once, on check 3, because that agent does not yet meet the policy).

**Third fix pass, 2026-10-05, after the third security scan (block): canonical form and values (decision 23).** Report: `.ctoc/audit/tool-grant-run-notes/s1-step13-rescan-2-d-tg-s1-step13c.md`.
- **Measured first:** all 125 agent frontmatters use only plain top-level values, two-space `- item` or `key: value` lines, and an inline tools line; the only shape the rule list leaves open is ": " in two top-level descriptions (decision 23).
- **Red first, main test:** the existing fixtures were changed to the canonical contract and test 7.9 added: 18 tests, 14 pass, 4 fail (7, 7.1, 7.7, 7.9), each on a shape the old grammar accepted (list-form tools, a quoted grant, a quoted value, a spacing variant). After `parseFrontmatter`, `renderFrontmatter` and the byte-for-byte comparison: 18 of 18, all 125 agents canonical.
- **Red first, maxima test:** test 4 (values, not text) failed against the text reader on a maximum kept out of sight in a comment; after the `node:vm` reader and the two new ceilings: 4 of 4.
- **The scanner's 78 reproductions (`harness3.js`), against both files:** 74 fail by name, 4 green — no change; Windows line endings with the grant unchanged; a `tools:` line in the body; check 3 handed a wider debt set (the residual the scanner named, review only). The scanner's "inline comment hiding nothing" now fails as not canonical, which is stricter than before and correct under canonical form.
- **The earlier 19 bite runs, against both files:** 19 of 19 fail by name. Two (the quoted and bracketed grants) now fail earlier, as "frontmatter line … is not in canonical form", before the safety floor reads them. Scratch copies deleted.
- **The plan's raw byte-order mark** in decision 19 replaced by the six characters of its escape, with one checked replacement that found exactly one.


**Record closed after the final review, 2026-10-05.** Report: `.ctoc/audit/tool-grant-run-notes/s1-step16-final-review-d-tg-s1-step16.md`.
- **Step 9, completed by the session (2026-10-05)**, report `.ctoc/audit/tool-grant-run-notes/s1-step9-citations-d-tg-s1-step9.md`. (1) Meta's "Agents Rule of Two" (https://ai.meta.com/blog/practical-ai-agent-security/, dated 31 October 2025) is live and its three properties are quoted correctly; the index's "at most two without a person in the loop" (line 102) and "under Meta's definition the repository itself is untrusted input" (line 115) are misattributed, because rule 6 is this plan's own stricter floor; the corrections are index decision 19. (2) A dispatched agent can never call AskUserQuestion (decision 16).
- **Step 11, closed:** the review (`.ctoc/audit/tool-grant-run-notes/s1-step11-review-d-tg-s1-step11.md`, verdict "back to Step 10") was answered by the fix pass; findings 1 to 11 and 14 are closed or carried, and findings 12 and 13 are carried into slices 4 and 7 (decision 25).
- **Step 13, three scans closed:** the first scan (`s1-step13-secure-d-tg-s1-step13.md`, block), the second (`s1-step13-rescan-d-tg-s1-step13b.md`, block) and the third (`s1-step13-rescan-2-d-tg-s1-step13c.md`, block) were each answered by a fix pass, recorded above; every reproduction in them fails by name except the correct greens and the one named residual (decision 23). **The fourth scan is still running**, so Step 13's "Validate inputs" box stays unticked until it returns.
- **Step 16:** the final review's record findings were applied to record text only, with both test files untouched while the fourth scan reads them: decisions 24 and 25 here, the ceiling sentences in slices 2, 3, 4, 5, 10 and 11, slice 4's `legal-scaffold` rewording and its added method file, slice 7's shared-line rewording, index decision 20, the recommendation line on inbox question `1791226690486-rxjfsg`, and the two wording fixes carried into slice 2.

**Fourth fix pass, 2026-10-05, after the fourth security scan** (report `.ctoc/audit/tool-grant-run-notes/s1-step13-rescan-3-d-tg-s1-step13d.md`: Claude Code's own loader functions run under Bun 1.4.2 and 1.4.3-canary, 0 mismatches on all 125 agents, one gap in a sweep of every Unicode code point: U+0000). Recorded in decision 23.
- **Red first:** main test 7.9 failed on a NUL in a value and 7.10 failed because the name and key checks did not exist yet; the maxima test hung on a never-ending main test (killed at 30 seconds), and its test 3 failed on a string maximum printed as a number. The describe-body fixture was confirmed red against the old stub in a scratch copy. One fixture was itself wrong (it moved the list before the list was declared) and was corrected in its own order, not loosened.
- **Green:** both files 24 of 24 (main 19, maxima 5).
- **The scanner's 84 rows (`harness4.js`), against both files:** 78 fail by name, 6 green. The greens are the documented ones: no change; Windows line endings with the grant unchanged; a `tools:` line in the body; check 3 handed a wider debt set; a main test that detects the stub by testing for `process`; a main test that replaces `JSON.stringify` in its own context. The last three are named in the maxima header's "cannot catch". The three NUL rows fail by name ("holds the invisible character U+0000 in a frontmatter line"), and so does the describe-body row. The harness copied both test files before the header comments were updated, so the comment-only edits made after it started are not in that run; the Step 14 run below is on the final bytes. Scratch copies deleted.
- **Escapes, never raw bytes:** the Edit tool turned the escape for U+200B in a new fixture into the raw character; it was put back as the six-character escape with one checked replacement, and neither test file holds a raw NUL, byte-order mark or zero-width space.
- **Step 14 on the final bytes:** both tool-grant tests 24 pass, 0 fail, 0 skipped; `npm run lint` clean; `npm run typecheck` 1 pass, 0 fail; `npm test` 12095 tests, 12095 pass, 0 fail, 0 skipped, 0 cancelled, coverage 99.9% against the 99% floor, test gate PASS; 547 test files.
- **Step 13 closed:** "Validate inputs" ticked, pointing to the fourth scan.

## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
