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
  // Documentation
  { prompt: 'generate changelog from commits', expects: 'changelog-generator' },
  { prompt: 'what changed since last release', expects: 'changelog-generator' },
  { prompt: 'update docs for new endpoint', expects: 'documentation-updater' },
  { prompt: 'write README section', expects: 'documentation-updater' },
  // Security
  { prompt: 'concurrency check on this module', expects: 'concurrency-checker' },
  { prompt: 'detect race condition in workers', expects: 'concurrency-checker' },
  { prompt: 'run dependency audit', expects: 'dependency-auditor' },
  { prompt: 'audit dependencies for CVEs', expects: 'dependency-auditor' },
  { prompt: 'check dependencies for vulnerabilities', expects: 'dependency-checker' },
  { prompt: 'list outdated packages', expects: 'dependency-checker' },
  { prompt: 'input validation audit', expects: 'input-validation-checker' },
  { prompt: 'verify validate inputs are sanitized', expects: 'input-validation-checker' },
  { prompt: 'SAST scan the code', expects: 'sast-scanner' },
  { prompt: 'find SQL injection patterns', expects: 'sast-scanner' },
  { prompt: 'find secrets in the repo', expects: 'secrets-detector' },
  { prompt: 'scan for secrets with trufflehog', expects: 'secrets-detector' },
  { prompt: 'security scan on staged files', expects: 'security-scanner' },
  { prompt: 'tier 1 security gate', expects: 'security-scanner' },
  // Specialized
  { prompt: 'accessibility check on the dashboard', expects: 'accessibility-checker' },
  { prompt: 'WCAG compliance audit', expects: 'accessibility-checker' },
  { prompt: 'validate the API contract', expects: 'api-contract-validator' },
  { prompt: 'check OpenAPI validation', expects: 'api-contract-validator' },
  { prompt: 'config validation across envs', expects: 'configuration-validator' },
  { prompt: 'detect config drift', expects: 'configuration-validator' },
  { prompt: 'review this database migration', expects: 'database-reviewer' },
  { prompt: 'check schema review for safety', expects: 'database-reviewer' },
  { prompt: 'audit error handling paths', expects: 'error-handler-checker' },
  { prompt: 'find swallowed errors', expects: 'error-handler-checker' },
  { prompt: 'health check on the readiness probe', expects: 'health-check-validator' },
  { prompt: 'kubernetes probe validation', expects: 'health-check-validator' },
  { prompt: 'find memory leak in workers', expects: 'memory-safety-checker' },
  { prompt: 'detect unbounded cache growth', expects: 'memory-safety-checker' },
  { prompt: 'observability check on the service', expects: 'observability-checker' },
  { prompt: 'verify three pillars instrumentation', expects: 'observability-checker' },
  { prompt: 'find performance bottleneck via profile this code', expects: 'performance-profiler' },
  { prompt: 'detect N+1 query', expects: 'performance-profiler' },
  { prompt: 'resilience audit on external calls', expects: 'resilience-checker' },
  { prompt: 'check circuit breaker coverage', expects: 'resilience-checker' },
  { prompt: 'find hardcoded strings for i18n', expects: 'translation-checker' },
  { prompt: 'audit missing translations', expects: 'translation-checker' },
  // Testing
  { prompt: 'we need to enforce coverage thresholds', expects: 'coverage-enforcer' },
  { prompt: 'uncovered critical path in payment module', expects: 'coverage-enforcer' },
  { prompt: 'rebuild coverage map after refactor', expects: 'coverage-mapper' },
  { prompt: 'which tests cover this file', expects: 'coverage-mapper' },
  { prompt: 'help me with playwright test maintenance', expects: 'playwright-qa' },
  { prompt: 'fix flaky e2e in our suite', expects: 'playwright-qa' },
  { prompt: 'run all tests in parallel pre-push', expects: 'quality-gate-runner' },
  { prompt: 'pre-push check before we ship', expects: 'quality-gate-runner' },
  { prompt: 'only run changed tests for speed', expects: 'smart-test-runner' },
  { prompt: 'do an incremental test run on this branch', expects: 'smart-test-runner' },
  { prompt: 'run e2e tests on staging', expects: 'e2e-test-runner' },
  { prompt: 'trigger a playwright run for the pr', expects: 'e2e-test-runner' },
  { prompt: 'run integration tests on this branch', expects: 'integration-test-runner' },
  { prompt: 'test against database fixtures locally', expects: 'integration-test-runner' },
  { prompt: 'run mutation testing on the auth module', expects: 'mutation-test-runner' },
  { prompt: 'check mutation score for new tests', expects: 'mutation-test-runner' },
  { prompt: 'run smoke test after deploy', expects: 'smoke-test-runner' },
  { prompt: 'quick sanity check that the app boots', expects: 'smoke-test-runner' },
  { prompt: 'run unit tests with coverage', expects: 'unit-test-runner' },
  { prompt: 'jest run for the new module', expects: 'unit-test-runner' },
  { prompt: 'write e2e tests for the checkout flow', expects: 'e2e-test-writer' },
  { prompt: 'scaffold e2e test for signup journey', expects: 'e2e-test-writer' },
  { prompt: 'write integration tests for the user api', expects: 'integration-test-writer' },
  { prompt: 'author integration test for orders endpoint', expects: 'integration-test-writer' },
  { prompt: 'write property test for the serializer', expects: 'property-test-writer' },
  { prompt: 'add hypothesis test for sort function', expects: 'property-test-writer' },
  { prompt: 'write unit tests for the validator', expects: 'unit-test-writer' },
  { prompt: 'tdd red phase for the new feature', expects: 'unit-test-writer' },
  // Infrastructure
  { prompt: 'terraform validate the IaC', expects: 'terraform-validator' },
  { prompt: 'check terraform security with checkov', expects: 'terraform-validator' },
  { prompt: 'kubernetes audit on the manifests', expects: 'kubernetes-checker' },
  { prompt: 'k8s manifest check pre-deploy', expects: 'kubernetes-checker' },
  { prompt: 'docker security review of the image', expects: 'docker-security-checker' },
  { prompt: 'container image scan for CVEs', expects: 'docker-security-checker' },
  { prompt: 'CI pipeline check on workflow files', expects: 'ci-pipeline-checker' },
  { prompt: 'github actions audit for the repo', expects: 'ci-pipeline-checker' },
  { prompt: 'CI runner setup wizard', expects: 'ci-runner-setup' },
  { prompt: 'configure github runner self-hosted', expects: 'ci-runner-setup' },
  // Frontend
  { prompt: 'visual regression test on the homepage', expects: 'visual-regression-checker' },
  { prompt: 'screenshot diff for the dashboard', expects: 'visual-regression-checker' },
  { prompt: 'component test for the Button', expects: 'component-tester' },
  { prompt: 'RTL test for the Modal', expects: 'component-tester' },
  { prompt: 'bundle size analysis for the app', expects: 'bundle-analyzer' },
  { prompt: 'check performance budget on JS bundle', expects: 'bundle-analyzer' },
  // Mobile
  { prompt: 'iOS check for the Swift sources', expects: 'ios-checker' },
  { prompt: 'swiftlint review on Auth module', expects: 'ios-checker' },
  { prompt: 'Android check for the Kotlin app', expects: 'android-checker' },
  { prompt: 'ktlint review for the app module', expects: 'android-checker' },
  { prompt: 'React Native bridge performance review', expects: 'react-native-bridge-checker' },
  { prompt: 'turbo module migration audit', expects: 'react-native-bridge-checker' },
  // Compliance
  { prompt: 'GDPR check on the data handling', expects: 'gdpr-compliance-checker' },
  { prompt: 'data protection audit for PII flows', expects: 'gdpr-compliance-checker' },
  { prompt: 'audit log review for compliance', expects: 'audit-log-checker' },
  { prompt: 'audit trail check on auth events', expects: 'audit-log-checker' },
  { prompt: 'license scan on dependencies', expects: 'license-scanner' },
  { prompt: 'OSS licenses compatibility audit', expects: 'license-scanner' },
  // Data/ML
  { prompt: 'data quality check on the warehouse', expects: 'data-quality-checker' },
  { prompt: 'validate data in the ingestion pipeline', expects: 'data-quality-checker' },
  { prompt: 'ML model validation before serving', expects: 'ml-model-validator' },
  { prompt: 'model validation for fairness checks', expects: 'ml-model-validator' },
  { prompt: 'feature store check for online/offline parity', expects: 'feature-store-validator' },
  { prompt: 'feature consistency audit', expects: 'feature-store-validator' },
  // Versioning
  { prompt: 'backwards compatibility audit before release', expects: 'backwards-compatibility-checker' },
  { prompt: 'breaking change check on the API', expects: 'backwards-compatibility-checker' },
  { prompt: 'feature flag audit for stale flags', expects: 'feature-flag-auditor' },
  { prompt: 'flag hygiene check this sprint', expects: 'feature-flag-auditor' },
  { prompt: 'technical debt audit on the codebase', expects: 'technical-debt-tracker' },
  { prompt: 'tech debt report by priority', expects: 'technical-debt-tracker' },
  // AI Quality
  { prompt: 'hallucination check on AI-generated code', expects: 'hallucination-detector' },
  { prompt: 'detect hallucination in copilot output', expects: 'hallucination-detector' },
  { prompt: 'review AI code for quality issues', expects: 'ai-code-quality-reviewer' },
  { prompt: 'AI code review on the PR', expects: 'ai-code-quality-reviewer' },
  // Architecture
  { prompt: 'pattern detection on this codebase', expects: 'pattern-detector' },
  { prompt: 'architectural patterns audit', expects: 'pattern-detector' },
  { prompt: 'dependency analysis for circular dependency', expects: 'dependency-analyzer' },
  { prompt: 'module dependencies report', expects: 'dependency-analyzer' },
  // DevEx
  { prompt: 'onboarding validation for new joiners', expects: 'onboarding-validator' },
  { prompt: 'new dev setup test', expects: 'onboarding-validator' },
  { prompt: 'API deprecation check on the codebase', expects: 'api-deprecation-checker' },
  { prompt: 'deprecation check before upgrade', expects: 'api-deprecation-checker' },
  // Cost
  { prompt: 'cloud cost analysis on infra', expects: 'cloud-cost-analyzer' },
  { prompt: 'FinOps review of AWS spend', expects: 'cloud-cost-analyzer' },
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
