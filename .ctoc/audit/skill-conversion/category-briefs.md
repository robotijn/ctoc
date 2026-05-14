# B2 Category Briefs — 2026 best practices

Generated for the B2 modernization sweep. Each brief captures the 2026 best
practices to apply when converting agents → skills and modernizing skill
bodies in that category. Apply uniformly across all skills in the category
during the bulk-upgrade pass (per B2-2 refinement: 3-round critic, not 10).

Sources are listed at the bottom of each brief.

---

## Category: Quality (11 agents)

Applies to: code-reviewer, architecture-checker, code-smell-detector,
complexity-analyzer, complexity-reducer, consistency-checker,
dead-code-detector, duplicate-code-detector, performance-validator,
quality-gate, type-checker.

### Patterns to encode in skill bodies

1. **Five pillars framing** — every quality skill should know it's checking
   one of: readability · maintainability · reliability · performance · security.
   Naming which pillar(s) each check covers helps the user understand the
   why.

2. **Single Responsibility Principle (SRP) as a checklist item** — each
   function should do one thing; functions > 50 lines or > 4 levels of
   nesting are red flags. Cite this in code-reviewer and complexity-analyzer.

3. **Guard clauses & early returns** — flatten nested logic. Surface as a
   refactor suggestion in complexity-reducer and code-smell-detector.

4. **Don't Repeat Yourself (DRY)** — abstract repeated logic into a function.
   Counts as a duplicate-code-detector finding AND a code-reviewer finding.

5. **Self-documenting names + "comments explain WHY, not WHAT"** — concrete
   review-criteria entries.

6. **Magic numbers/strings → named constants** — explicit checklist item.

7. **Manual reviews catch intent, automated reviews enforce standards** —
   each skill should know its role on this axis. code-reviewer is BOTH;
   dead-code-detector is automated-only; architecture-checker is intent.

### When-to-load triggers (canonical)

For each skill, ensure `when_to_load` includes:
- The skill's literal name ("review code", "find dead code", "duplicate code")
- The pillar's plain English ("readability", "complexity check", "code quality")
- A pain-point variant ("this code is messy", "clean up this file")

### Sources
- [Five Pillars of Code Quality (CodeAnt)](https://www.codeant.ai/blogs/what-are-the-five-pillars-of-code-quality)
- [Complete Code Review Process (CodeAnt)](https://www.codeant.ai/blogs/good-code-review-practices-guide)
- [Code Review Best Practices (Calmops)](https://calmops.com/software-engineering/code-review-best-practices/)
- [Readable code (Best Practice & Impact)](https://best-practice-and-impact.github.io/qa-of-code-guidance/readable_code.html)

---

## Category: Testing (14 agents)

Applies to: coverage-enforcer, coverage-mapper, playwright-qa,
quality-gate-runner, smart-test-runner, runners/{e2e, integration, mutation,
smoke, unit}, writers/{e2e, integration, property, unit}.

### Patterns to encode in skill bodies

1. **Testing Trophy, not pyramid** — Kent C. Dodds (2018, still authoritative
   in 2026). Bottom-up: static analysis → unit → **fat middle** integration
   → thin E2E layer. Update test-writer skills to suggest integration-first
   for new code, not unit-first.

2. **Red-Green-Refactor (TDD)** — explicit in writer skills. Every test
   should start as red.

3. **Flaky test quarantine workflow** — auto-quarantine after N flakes;
   2-week SLA to fix; otherwise delete. Surface in coverage-enforcer and
   quality-gate-runner.

4. **Mutation testing is table stakes for AI-written suites** — runner
   skill should explicitly mention mutation as a layer above coverage.

5. **E2E ≤ 30 minutes** — critical-path E2E must fit in CI's window.
   Suggestion in e2e-test-runner and smart-test-runner.

6. **Intent-based test authoring** — couple tests to user-visible behavior,
   not implementation details. Reduces maintenance.

### When-to-load triggers (canonical)

- Verb phrases: "write tests", "run tests", "check coverage"
- Type phrases: "unit test", "integration test", "e2e test", "mutation test"
- Pain points: "this test is flaky", "coverage is low"

### Sources
- [Testing Methodologies Guide (Keploy)](https://keploy.io/blog/community/testing-methodologies-in-software-testing)
- [Testing Pyramid Strategy (Testomat)](https://testomat.io/blog/testing-pyramid-role-in-modern-software-testing-strategies/)
- [Software Testing Best Practices (BugBug)](https://bugbug.io/blog/test-automation/software-testing-best-practices/)
- [Modern QA Practices (Calmops)](https://calmops.com/software-engineering/testing-strategies-modern-qa-practices/)

---

## Category: Documentation (2 agents)

Applies to: changelog-generator, documentation-updater.

### Patterns to encode in skill bodies

1. **Task-first docs** — lead with the action ("install", "configure",
   "authenticate"), not concepts. documentation-updater should ask
   "what task is the user trying to accomplish?" before editing.

2. **Markdown over WYSIWYG** — diffs are cleaner. Skill should reject
   binary doc formats.

3. **Versioned API references + changelogs in one place** — changelog-
   generator should link new entries to the API version they affect.

4. **AI-readable docs** — in 2026 most teams need docs that both humans
   AND AI agents can parse. Use structured headings, code-fenced examples,
   explicit input/output sections.

5. **Test every example** — before publishing, run every command and
   verify every link. documentation-updater should warn on doc edits that
   add commands/code without test coverage.

6. **Deprecations and breaking changes get dedicated visibility** —
   changelog-generator categorizes entries: Breaking · Added · Changed ·
   Deprecated · Removed · Fixed · Security.

### When-to-load triggers (canonical)

- "update docs", "write README", "API documentation"
- "changelog", "release notes", "what changed"

### Sources
- [Documentation Best Practices (ReadMe)](https://readme.com/resources/best-practices-how-to-get-the-most-from-readme)
- [Markdown for Developer Docs (MarkdownMastery)](https://www.markdownmastery.com/blog/markdown-for-developer-docs)
- [Best Technical Documentation Tools (GitBook)](https://www.gitbook.com/blog/best-technical-documentation-tools)

---

## Category: Security (7 agents)

Applies to: concurrency-checker, dependency-auditor, dependency-checker,
input-validation-checker, sast-scanner, secrets-detector, security-scanner.

### Patterns to encode in skill bodies

1. **Shift everywhere, not just shift left** — security testing at every
   stage. Skills should be runnable in IDE / pre-commit / PR / pre-deploy.

2. **SAST + SCA + DAST + secrets scanning at minimum** — security-scanner
   should orchestrate the four; sast-scanner does just SAST; etc.

3. **Secrets detection = pattern + entropy + validation** — secrets-
   detector should declare it uses all three techniques. Pattern catches
   known formats; entropy catches custom keys; validation confirms the
   secret is live (not a placeholder).

4. **Block deployments on critical CVEs** — dependency-auditor surfaces
   severity; the gate (security-scanner or quality-gate) enforces.

5. **OWASP Top 10 mapping** — input-validation-checker and sast-scanner
   should map findings to OWASP categories (A01: Broken Access Control,
   A03: Injection, etc.) for prioritization.

6. **Transitive dependencies are scanned too** — dependency-checker
   doesn't stop at direct deps. Modern apps have hundreds of indirect
   dependencies; a single unpatched lib can be the breach.

### When-to-load triggers (canonical)

- "security review", "scan for vulnerabilities"
- "find secrets", "check dependencies"
- "OWASP", "CVE check", "input validation"

### Sources
- [9 Best SAST Tools 2026 (Endor Labs)](https://www.endorlabs.com/learn/best-sast-tools)
- [Application Security Best Practices (AppSecMaster)](https://www.appsecmaster.net/blog/application-security-best-practices-everything-developers-must-know/)
- [Secret Scanning Tools 2026 (GitGuardian)](https://blog.gitguardian.com/secret-scanning-tools/)
- [CI/CD Security Scanning (Wiz)](https://www.wiz.io/academy/application-security/ci-cd-security-scanning)

---

## Category: Specialized (11 agents)

Applies to: accessibility-checker, api-contract-validator,
configuration-validator, database-reviewer, error-handler-checker,
health-check-validator, memory-safety-checker, observability-checker,
performance-profiler, resilience-checker, translation-checker.

### Patterns to encode in skill bodies

1. **Metrics + Logs + Traces are the three pillars of observability** —
   observability-checker should ensure all three exist; warn if any
   pillar is missing.

2. **Resilience = primary measure in 2026** — resilience-checker should
   look for: graceful degradation, circuit breakers, retries with
   backoff, timeouts everywhere, fallback paths.

3. **Accessibility judged by what renders, not source code** —
   accessibility-checker should run against the rendered output (or
   note that source-only checks miss issues).

4. **AI-assisted accessibility = workflow efficiency, not replacement** —
   the skill flags issues, the human reviews. Don't auto-fix accessibility.

5. **Health checks must be granular** — health-check-validator should
   verify per-dependency health checks, not just "the service is up."

6. **Configuration validation includes drift** — configuration-validator
   should compare runtime config to declared config, not just declared
   config to schema.

7. **Performance profiling: latency, throughput, resource utilization** —
   performance-profiler should produce numbers across all three axes.

### When-to-load triggers (canonical)

- Skill-specific: "accessibility", "API contract", "config validation",
  "database review", "error handling", "health check", "memory safety",
  "observability", "performance", "resilience", "i18n / translation"

### Sources
- [11 Observability Best Practices (Spacelift)](https://spacelift.io/blog/observability-best-practices)
- [Observability Trends 2026 (IBM)](https://www.ibm.com/think/insights/observability-trends)
- [Observability Predictions 2026 (Dynatrace)](https://www.dynatrace.com/news/blog/six-observability-predictions-for-2026/)
- [Web Accessibility 2026 Predictions (WebAIM)](https://webaim.org/blog/2026-predictions/)
- [Balancing Accessibility and Performance (Vocal)](https://vocal.media/journal/balancing-accessibility-and-performance-in-web-development-best-practices-for-us-businesses-in-2026)

---

## Application Pattern

For each agent being converted (or each skill being modernized):

1. Identify the category from the path (`agents/quality/` → Quality brief).
2. Apply the canonical `when_to_load` triggers from the brief.
3. Inject the category's relevant patterns into the skill body as a
   "## 2026 Best Practices" section.
4. Run 3-round critic (per B2-2). Capture diff to
   `.ctoc/audit/skill-conversion/<skill>.diff.md`.
5. Update `TRIGGER_CORPUS` in tests/skill-loading.test.js with 1-2 new
   prompts per converted skill.

The briefs above are the **input** to that loop. The actual conversion +
upgrade work continues across follow-up sessions (sweep is multi-session
by design).
