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

## Category: Infrastructure (5 agents)

Applies to: terraform-validator, kubernetes-checker, docker-security-checker, ci-pipeline-checker, ci-runner-setup.

### Patterns to encode in skill bodies

1. **Shift-left security scanning** — Trivy / Checkov / tfsec run pre-commit and in PR, not nightly. SCA + IaC + container scan are one pipeline.
2. **Secrets via managed stores only** — HashiCorp Vault, AWS Secrets Manager, Azure Key Vault. JIT read-only access. Auto-rotate DB passwords, API keys, certificates.
3. **Remote state with locking** — S3 + DynamoDB for Terraform; never local state in shared repos.
4. **GitOps as deployment standard** — Argo CD / Flux reconcile live state against Git. Container orchestrator state lives in Git.
5. **Container image build + scan on every commit** — Docker / Kaniko / Buildpacks pipeline → Trivy/Snyk before pushing to registry.
6. **Tag enforcement at provisioning** — policy-as-code (OPA, Conftest) refuses untagged resources; ≥95% tag compliance is the bar.

### Canonical `when_to_load` triggers

- "terraform validate", "infrastructure check", "IaC scan"
- "kubernetes audit", "k8s manifest check", "helm chart review"
- "docker security", "container image scan", "Dockerfile review"
- "CI pipeline check", "CI runner setup", "ci/cd validation"

### Sources
- [Top 10 IaC Best Practices 2026 (TekRecruiter)](https://www.tekrecruiter.com/post/top-10-infrastructure-as-code-best-practices-for-scalable-devops-in-2026)
- [Top IaC Security Tools 2026 (env0)](https://www.env0.com/blog/top-infrastructure-as-code-security-tools)
- [Terraform in CI/CD (Spacelift)](https://spacelift.io/blog/terraform-in-ci-cd)
- [Kubernetes IaC Best Practices (Mirantis)](https://www.mirantis.com/blog/kubernetes-infrastructure-as-code-iac-best-practices-and-guide/)
- [16 Most Useful IaC Tools 2026 (Spacelift)](https://spacelift.io/blog/infrastructure-as-code-tools)

---

## Category: Frontend (3 agents)

Applies to: visual-regression-checker, component-tester, bundle-analyzer.

### Patterns to encode in skill bodies

1. **Visual regression is mainstream in 2026** — not optional. Tools use AI/perceptual diffing, not pixel-by-pixel. Reg-suit, Applitools Eyes 10.22, BackstopJS, Playwright Screenshots.
2. **Component testing runs in real browsers** — Vitest browser mode + Playwright; jsdom is insufficient for hover, focus, intersection observers, scroll.
3. **Performance budgets block PRs** — concrete thresholds: LCP < 2.5s, CLS < 0.1, JS bundle < 200kb gzipped. Bundlemon/size-limit gate the budget.
4. **Test user behavior, not implementation** — React Testing Library standard. Couple tests to what the user sees, not to component internals.
5. **Shift-left frontend quality** — visual + a11y + bundle checks in CI on every PR, not at QA-time.

### Canonical `when_to_load` triggers

- "visual regression", "screenshot diff", "visual test"
- "component test", "RTL test", "test the component"
- "bundle size", "bundle analysis", "performance budget"

### Sources
- [State of Regression Testing 2026 (Vizproof)](https://vizproof.com/en/blog/the-state-of-regression-testing-in-2026-tools-methods-and-trends)
- [Modern Frontend Quality Pipeline (alexop.dev)](https://alexop.dev/posts/modern-frontend-quality-pipeline/)
- [Best Visual Regression Tools 2026 (Bug0)](https://bug0.com/knowledge-base/visual-regression-testing-tools)
- [Frontend Testing in 2026 (Atina)](https://www.atinatechnology.in/frontend-testing-in-2026/)
- [Frontend Trends 2026 (Syncfusion)](https://www.syncfusion.com/blogs/post/frontend-development-trends)

---

## Category: Mobile (3 agents)

Applies to: ios-checker, android-checker, react-native-bridge-checker.

### Patterns to encode in skill bodies

1. **Mobile reviews ≠ web reviews** — focus on where the app fails: lifecycle, navigation, lists, animations, native bridge surfaces.
2. **Secure storage for credentials** — never AsyncStorage for tokens/keys; iOS Keychain via react-native-keychain, Android Keystore. SSL pinning for in-transit data.
3. **Performance on the worst device** — test on low-end Android and older iOS. Hermes profiler / Flipper for runtime analysis.
4. **Code splitting + lazy loading** — `React.lazy() + Suspense`, split by routes/features.
5. **CI/CD is non-negotiable** — automated build, test (Jest/Detox/Appium), upload to stores. Manual = error-prone.
6. **Evidence of manual testing on both platforms** required when changes touch nav, background return, or lifecycle.

### Canonical `when_to_load` triggers

- "iOS check", "Swift review", "iOS code quality"
- "Android check", "Kotlin review", "Android code quality"
- "React Native bridge", "RN performance", "native module check"

### Sources
- [React Native Best Practices 2026 (ReactNativeCoders)](https://reactnativecoders.com/latest-article/react-native-best-practices/)
- [RN Code Review 2026 (Kodus)](https://kodus.io/en/react-native-code-review)
- [Mobile Development Best Practices 2026 (Apponward)](https://apponward.com/blogs/top-frameworks-for-mobile-app-development-in-2026/)
- [Mobile App Best Practices 2026 (SoftwareCo)](https://www.softwareco.com/mobile-app-development-best-practices-a-practical-guide-for-2026/)

---

## Category: Compliance (3 agents)

Applies to: gdpr-compliance-checker, audit-log-checker, license-scanner.

### Patterns to encode in skill bodies

1. **Continuous compliance > point-in-time audits** — high-risk systems scanned daily, lower-risk monthly. Records of Processing Activities updated continuously.
2. **Consent + audit logging are dual obligations** — timestamped, immutable, queryable. Every consent grant + revoke must be retrievable.
3. **License obligations are per-package** — MIT/Apache/BSD = permissive; GPL/AGPL = copyleft (review). Track attributions; commercial scanning enforced at the build gate.
4. **OSS scanned periodically for vulns** — same SCA tools as security (link to [[dependency-auditor]]) but with license dimension.
5. **Records of Processing Activities** as a maintained artifact, not a one-time document.

### Canonical `when_to_load` triggers

- "GDPR check", "GDPR compliance", "data protection audit"
- "audit log review", "audit trail check", "compliance logging"
- "license scan", "OSS licenses", "license compatibility"

### Sources
- [GDPR Compliance Guide 2026 (Apptega)](https://www.apptega.com/blog/gdpr-compliance-software)
- [GDPR Compliance 2026 (Secure Privacy)](https://secureprivacy.ai/blog/gdpr-compliance-2026)
- [Enterprise License Mgmt 2026 (Soraco)](https://soraco.co/the-2026-enterprise-guide-to-software-license-protection-and-management/)
- [Open Source Compliance (OpenLogic)](https://www.openlogic.com/blog/open-source-compliance-overview)
- [Software Compliance (Sonar)](https://www.sonarsource.com/resources/library/software-compliance/)

---

## Category: Data/ML (3 agents)

Applies to: data-quality-checker, ml-model-validator, feature-store-validator.

### Patterns to encode in skill bodies

1. **Six dimensions of data quality** — accuracy, completeness, consistency, timeliness, validity, uniqueness. Every check names which dimension it serves.
2. **Validate at ingestion, not at consumption** — schema validation (JSON Schema/Pydantic) at the edge of the pipeline.
3. **Volume + range + format gates** — alert when row counts deviate from baseline; reject malformed records; enforce enum values.
4. **Quarantine, don't drop** — failed records routed to a quarantine table with the failed check + timestamp + original payload.
5. **ML-specific quality** — contextual coverage, drift detection, training/serving skew, feature-store consistency.
6. **Tools**: Great Expectations (declarative), dbt tests (in-pipeline), schema validators (edge), Databricks pipeline expectations (cloud-native).

### Canonical `when_to_load` triggers

- "data quality check", "validate data", "data pipeline quality"
- "ML model validation", "model validation", "training/serving skew"
- "feature store check", "feature consistency", "feature drift"

### Sources
- [Data Quality Framework 2026 (lakeFS)](https://lakefs.io/data-quality/data-quality-framework/)
- [How to Improve Data Quality 2026 (RudderStack)](https://www.rudderstack.com/blog/how-to-improve-data-quality/)
- [Data Quality Testing 2026 (OvalEdge)](https://www.ovaledge.com/blog/data-quality-testing-guide)
- [Data Quality is a Pipeline Problem (Datalakehouse Hub)](https://datalakehousehub.com/blog/2026-02-de-best-practices-03-data-quality-first/)
- [Survey of ML Data Quality (ACM JDIQ)](https://dl.acm.org/doi/10.1145/3592616)

---

## Category: Versioning (3 agents)

Applies to: backwards-compatibility-checker, feature-flag-auditor, technical-debt-tracker.

### Patterns to encode in skill bodies

1. **SemVer is the standard** — Major.Minor.Patch. Never break in minor or patch. Required for any public API or library.
2. **Feature flags decouple deploy from release** — code ships dark; toggles release. Staged rollouts (1% → 10% → 50% → 100%).
3. **Track deprecation usage** — count attempts to use a deprecated feature for ≥1 release; surface users who missed the deprecation notice.
4. **Tech debt = tracked, not assumed** — every shortcut gets an entry with cost-of-fix estimate. Don't let it rot in comments.
5. **Microservices versioning** — version the API at the boundary; keep N-1 alive during transition; document the deprecation timeline.
6. **Feature flag hygiene** — every flag has an owner, an expiry date, and a removal plan. Stale flags are tech debt.

### Canonical `when_to_load` triggers

- "backwards compatibility", "breaking change check", "API version check"
- "feature flag audit", "flag hygiene", "stale flags"
- "technical debt", "tech debt tracker", "debt audit"

### Sources
- [Software Versioning Best Practices 2026 (MoonTech)](https://www.moontechnolabs.com/qanda/software-versioning-best-practices/)
- [Software Release Versioning (LaunchDarkly)](https://launchdarkly.com/blog/software-release-versioning/)
- [Microservices Versioning Guide (OpsLevel)](https://www.opslevel.com/resources/the-ultimate-guide-to-microservices-versioning-best-practices)
- [Semantic Versioning 2.0.0](https://semver.org/)
- [App Versioning 2026 (UXCam)](https://uxcam.com/blog/app-versioning-best-practices/)

---

## Category: AI Quality (2 agents)

Applies to: hallucination-detector, ai-code-quality-reviewer.

### Patterns to encode in skill bodies

1. **AI code carries 29-45% vulnerability rate** — 2026 data. Treat AI-generated code as untrusted input until reviewed.
2. **Hallucination patterns to detect** — Happy-Path Hallucination (no null guards), Security Amnesia (raw SQL concat), N+1 Query Signature, Phantom Package (imports of non-existent libs ~20%).
3. **Multi-technique detection** — combine RAG + RLHF + guardrails (96% reduction in Stanford study). Single technique = leakage.
4. **Deterministic AST analysis** — 100% precision on semantic errors when structurally grounded; pair with auto-correction (~77% rate).
5. **AI code = handwritten code review standards** — peer review, integration test, manual QA, security scan. No fast-track.
6. **Cite-your-sources prompting** — structured prompts ("Before answering, cite sources") reduce hallucination 20-40%.

### Canonical `when_to_load` triggers

- "hallucination check", "detect hallucination", "AI code review"
- "AI-generated code", "review AI code", "LLM output review"
- "AI quality check", "AI code audit"

### Sources
- [LLM Hallucinations in AI Code Review (diffray)](https://diffray.ai/blog/llm-hallucinations-code-review/)
- [Detecting Hallucinations via AST (arXiv 2601.19106)](https://arxiv.org/html/2601.19106v1)
- [LLM Hallucination Rates 2026 (ModelsLab)](https://modelslab.com/blog/llm/llm-hallucination-rates-2026)
- [AI Code Review Checklist 2026 (Dev Journal)](https://earezki.com/ai-news/2026-04-04-ai-code-review-checklist/)
- [Exploring Hallucinations in LLM Code (arXiv 2404.00971)](https://arxiv.org/abs/2404.00971)

---

## Category: Architecture (2 agents)

Applies to: pattern-detector, dependency-analyzer.

### Patterns to encode in skill bodies

1. **Loose coupling at boundaries** — components interact through defined interfaces; never direct dependencies. Boundary contracts (schemas) for cross-service communication.
2. **No "best" pattern** — monoliths fast-start; microservices scale specific components; event-driven for real-time. Match pattern to need, not fashion.
3. **DDD-aligned decomposition** — align technical architecture with business capabilities. Bounded contexts, ubiquitous language.
4. **Circular dependencies are blockers** — automated detection (madge, deptry, jdeps); refactor required. New cycles = BLOCK.
5. **Versioned schemas for cross-service events** — never broadcast raw internal types.
6. **AI integration changes pattern adoption** — Saga via predictive analytics, AI-assisted microservices workflows.

### Canonical `when_to_load` triggers

- "pattern detection", "find design patterns", "architectural patterns"
- "dependency analysis", "module dependencies", "dependency graph"
- "circular dependency", "module boundary"

### Sources
- [Software Design Patterns Guide 2026 (Cymbidium)](https://cymbidium.org/software-design-patterns-guide-2026/)
- [Top 10 Architecture Patterns 2026 (Tecnovy)](https://tecnovy.com/en/top-10-software-architecture-patterns)
- [Architecture Patterns Guide 2026 (Index.dev)](https://www.index.dev/blog/software-architecture-patterns-guide)
- [Software Architecture Principles 2026 (Codewave)](https://codewave.com/insights/software-architecture-principles-practices/)

---

## Category: DevEx (2 agents)

Applies to: onboarding-validator, api-deprecation-checker.

### Patterns to encode in skill bodies

1. **DORA + SPACE + DevEx are the three measurement frames** — combine all three for a complete picture: speed (DORA), holistic (SPACE), engineer experience (DevEx).
2. **TTFHW (Time To First Hello World) is the onboarding KPI** — bootstrap scripts replace wiki sprawl. Single-command setup is the bar.
3. **API deprecation = explicit schedule + parallel versions** — never break without ≥1 version of overlap; communicate dates clearly.
4. **Operational + qualitative metrics combined** — DORA numbers + developer satisfaction surveys. One without the other lies.
5. **Key DevEx metrics**: environment setup time, CI/CD turnaround, review speed, deployment frequency, lead time, interruption frequency, satisfaction.

### Canonical `when_to_load` triggers

- "onboarding validation", "onboarding check", "new dev setup"
- "API deprecation", "deprecation check", "breaking change schedule"
- "DevEx metrics", "developer experience"

### Sources
- [Developer Experience Complete Guide (kodus)](https://kodus.io/en/the-complete-guide-to-developer-experience-devex/)
- [DevEx Measurement 2026 (getdx)](https://getdx.com/blog/developer-experience/)
- [Developer Onboarding Checklist (Cortex)](https://www.cortex.io/post/developer-onboarding-guide)
- [API Engineering 2026 (Refonte)](https://www.refontelearning.com/blog/api-developer-engineering-in-2026-trends-skills-best-practices)

---

## Category: Cost (1 agent)

Applies to: cloud-cost-analyzer.

### Patterns to encode in skill bodies

1. **Shift-left FinOps**: forecast and model costs before deployment, not after the bill arrives. Infrastructure review includes cost estimates the same way it includes security review.
2. **Tagging at provisioning, not convention** — policy-as-code refuses untagged resources. ≥95% tag compliance achievable.
3. **Right-size + reserved + scheduling**: RIs/SPs save 40-72% on stable workloads; right-sizing saves 15-25%; non-prod scheduling saves up to 75%.
4. **4-phase FinOps lifecycle**: Visibility → Optimization → Forecasting → Continuous Improvement. Not a one-time audit.
5. **AI workload cost** is the breakout category in 2026 — track separately, attribute to features/teams.
6. **30-40% waste** is the baseline for un-managed cloud spend. The skill quantifies the gap to that target.

### Canonical `when_to_load` triggers

- "cloud cost", "cost analysis", "AWS cost", "Azure cost", "GCP cost"
- "FinOps", "cost optimization", "cloud spend"
- "right-size", "reserved instances", "cost forecast"

### Sources
- [8 FinOps Best Practices 2026 (nOps)](https://www.nops.io/blog/top-finops-practices-to-effectively-manage-cloud-costs/)
- [FinOps Cloud Optimization 2026 (Sedai)](https://sedai.io/blog/finops-cloud-optimization-strategies)
- [2026 FinOps Playbook (LeanOps)](https://leanopstech.com/blog/cloud-cost-optimization-finops-playbook-2026/)
- [Top FinOps Tools 2026 (Vantage)](https://www.vantage.sh/blog/top-finops-tools-for-cloud-cost-optimization)
- [FinOps Principles (Flexera)](https://www.flexera.com/blog/finops/finops-principles/)

---

## Category: Orchestrators (sub-orchestrators reporting to CTO Chief)

Applies to the **non-leaf** agents (B1 Phase 2 modernization, not B2 skill conversion):
iron-loop/{integrator, critic, executor}, pipeline/{writer, critic, tester, qa, publisher},
planning/{vision-decomposer}, planning reviewers (functional-reviewer, implementation-plan-reviewer),
implementation/{test-maker, self-reviewer, optimizer, verifier, documenter, implementation-reviewer}.

These stay as agents (not converted to skills) because they orchestrate other agents.
They need v7 modernization in place.

### Patterns to encode in agent bodies (v7 modernization)

1. **Single top-level**: every orchestrator declares `reports_to: cto-chief` in its frontmatter. CTO Chief is sole top-level. No sibling dispatch — recommend, don't execute peer calls.
2. **Hierarchical pattern**: higher-level coordinates and plans; lower-level executes. Sub-orchestrators occupy the middle tier.
3. **Start small, scale validated**: each sub-orchestrator dispatches 1-3 specialist agents at a time, not 10. Validate output before expanding.
4. **Observability + auditability**: every dispatch decision is logged. Inspectable trail back to CTO Chief.
5. **Open protocols (MCP + A2A)**: where applicable, prefer standard protocols over bespoke RPC for agent-to-agent communication.
6. **Test workers in isolation first**: if a specialist can't pass a simple isolated test, it can't pass an integrated one — sub-orchestrators don't paper over broken specialists.
7. **Reads ancestry**: every orchestrator must read the full plan chain (vision → canvas → functional → implementation → todo) before dispatching. v7 `reads_ancestry: true` frontmatter required.
8. **No-stub + async-overnight**: same v7 principles apply — make documented choices, continue, let morning review catch errors. Never block.

### Frontmatter fields required for v7 orchestrator modernization

```yaml
effort: high             # or xhigh for coordinator-level
reads_ancestry: true
async_choice_protocol: enabled
model_optimized_for: opus-4-7
reports_to: cto-chief    # explicit chain of command
```

### Body addition required

A "## v7 Operating Principles" section near the top of the body (similar to what vision-advisor/product-owner/implementation-planner already have) that names: pre-todo-is-context-building, no-stub rule, async-overnight, literal interpretation, and the sub-orchestrator chain (this agent → CTO Chief).

### Sources
- [Multi-Agent Orchestration 2026 (CodeBridge)](https://www.codebridge.tech/articles/mastering-multi-agent-orchestration-coordination-is-the-new-scale-frontier)
- [Multi-Agent Patterns (MindStudio)](https://www.mindstudio.ai/blog/multi-agent-orchestration-patterns)
- [Agent Orchestration (MIT Technology Review)](https://www.technologyreview.com/2026/04/21/1135654/agent-orchestration-ai-artificial-intelligence/)
- [AI Agent Patterns (Microsoft Azure Architecture)](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [Multi-Agent Frameworks 2026 (Gurusup)](https://gurusup.com/blog/best-multi-agent-frameworks-2026)

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
