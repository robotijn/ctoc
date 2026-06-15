---
title: "CU3 — Tier 1 high-traffic frameworks reference upgrade"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: feature
parent_vision: upgrade-agents-and-skills-corpus
program: ctoc-corpus-quality
order: 3
depends_on: [CU1-tier0-quick-wins]
status: refined
acceptance_criteria_count: 14
risk_level: MEDIUM
files:
  - skills/frameworks/ai-ml/pytorch.md
  - skills/frameworks/ai-ml/tensorflow.md
  - skills/frameworks/ai-ml/langchain.md
  - skills/frameworks/ai-ml/transformers.md
  - skills/frameworks/ai-ml/anthropic-sdk.md
  - skills/frameworks/ai-ml/openai-sdk.md
  - skills/frameworks/web/react.md
  - skills/frameworks/web/nextjs.md
  - skills/frameworks/data/pandas.md
  - skills/frameworks/data/numpy.md
  - skills/frameworks/data/prisma.md
  - skills/frameworks/mobile/react-native.md
  - skills/frameworks/mobile/flutter.md
  - skills/frameworks/mobile/expo.md
---

# CU3 — Tier 1 high-traffic frameworks reference upgrade

## 1. ASSESS

### Problem Statement

Framework reference richness is inversely correlated with popularity across the
CTOC corpus. The entire ai-ml named set sits at the 5-section template floor
(pytorch ~50, tensorflow ~50, langchain ~53, transformers ~58, anthropic-sdk ~50,
openai-sdk ~50 lines), as do the core web guides (react ~63, nextjs ~70), data
guides (pandas ~60, numpy ~51, prisma ~55), and mobile guides (react-native ~51,
flutter ~57, expo ~50). These are among the highest-traffic trigger-loaded guides
in the corpus — a developer working with PyTorch, React, or a Prisma schema loads
these files on every relevant edit. At template floor, the guide provides no
correction value: no CUDA/torch version compatibility warnings, no React 19
concurrent mode pitfalls, no Prisma N+1 query detection, no LangChain chain
construction footguns. This stub upgrades the 14 named framework guides to
substantive correction depth before the lower-traffic long tail is addressed (CU4a).

### Current State

From the 2026-06-15 audit, all 14 named files are at the <=5 `##` section template
floor. Specific confirmed deficiencies:
- **ai-ml guides**: No mention of CUDA/torch version coupling (a prolific source
  of environment breakage), no tokenizer/transformers version pinning warnings,
  no LangChain 1.0 API surface notes (LCEL deprecated since 1.0, September 2025),
  no TensorFlow 2.x eager vs graph mode pitfalls, no guidance on model loading
  memory footprints. anthropic-sdk.md and openai-sdk.md have no prompt caching,
  rate-limit, or token-budget footgun sections.
- **web guides**: react.md predates React 19 concurrent features; nextjs.md has
  no App Router vs Pages Router boundary notes, no Server Actions footguns, no
  edge runtime limitations.
- **data guides**: pandas.md has no chained-indexing CopyWarning / SettingWithCopy
  footgun, no memory-efficient dtype guidance; numpy.md has no broadcasting
  shape mismatch pattern; prisma.md has no N+1 query detection, no raw query
  injection risk, no migration safety notes.
- **mobile guides**: react-native.md has no JSI/TurboModule transition notes,
  no bridge architecture footguns; flutter.md has no widget rebuild anti-patterns,
  no Dart null-safety migration traps; expo.md has no managed vs bare workflow
  boundary notes.
All files also share the CU2 problem: no dated sources, no CVE/CWE classes where
applicable, no performance trap sections.

### Impact

The ai-ml set is particularly high-leverage: PyTorch and LangChain codebases are
CTOC's most common AI-generation targets. A guide that does not warn about
CUDA/torch version incompatibility, or about LangChain's deprecated chain API
(removed in 1.0), leaves Claude without the most common footgun context at
exactly the moment it is editing an AI-pipeline file. React and Next.js drive
the majority of CTOC SaaS template implementations. Upgrading these 14 named
guides directly improves correction quality for the highest-volume implementation
work.

## 2. ALIGN

### Business Goals

Traced to parent vision Success Criteria 3 and 4: guides must measurably exceed
the 5-section floor with sourced, dated, correction-focused depth; upgrades proceed
in leverage order with Tier 1 before Tier 2.

### Impact Map

**Job to Be Done:** When Claude edits a PyTorch model file, a React component, a
Prisma schema, or a React Native bridge module, the trigger-loaded framework guide
must surface version-specific footguns, ecosystem-specific CVE patterns, and
async/concurrency pitfalls — so Claude's corrections are grounded in authoritative
framework knowledge rather than template boilerplate.

- **Goal:** Fill the correction gap in the highest-traffic framework guides before
  tackling the long tail.
- **Actor:** Claude Code (automated, reads guide at edit time); human developer
  (reviews guidance applied in diffs).
- **Impact:** Claude's edits to PyTorch/React/Prisma/etc. files are guided by
  substantive, framework-specific, sourced warnings rather than generic template
  bullets.
- **Deliverable:** 14 upgraded framework reference guides (the named files only;
  the ai-ml long tail beyond this named set is CU4a), each measurably deeper than
  the 5-section floor, with async/concurrency, error handling, security, testing,
  performance, and version-specific sections.

### Success Metrics

- All 14 named guides contain more than 5 distinct `##` sections with substantive
  depth.
- Every required section names at least one technology-specific identifier (a
  version number, a CWE identifier, or a concrete API/function name) — generic
  bullets without a concrete identifier are a failing criterion.
- Every version-specific or security claim carries an inline dated source from
  2025-01-01 or later. A reviewer rejects any claim without a concrete dated
  source.
- ai-ml guides specifically address version coupling and runtime pitfalls.
- web guides reflect React 19-era and Next.js 15-era with dated sources.
- `node --test tests/*.test.js` passes with `# fail 0`.
- `.ctoc/skills.json` trigger mappings remain valid for all modified guides.

### Audit-Ledger Scoping

In-scope files are the 14 enumerated named files only. Scope is confirmed against
the checked-in audit ledger at `.ctoc/audit/corpus-audit-2026-06-15.json`. The
floor criterion is <=5 `##` sections. A completeness check passes when every
named file appears in the audit artifact as UPGRADED or SOLID-SKIPPED — no file
may be silently omitted. The ai-ml long tail (all `skills/frameworks/ai-ml/*.md`
files not in this named set) is explicitly CU4a scope, not CU3 scope.

### Stakeholders

- Claude Code (automated consumer).
- Human reviewer (gate approval).
- CU4a (ai-ml long tail + other thin frameworks): uses CU3 output as the depth
  standard and inherits the named-set exclusion via the audit ledger.

### Constraints

- **Framework set is exactly 14 named files**: pytorch, tensorflow, langchain,
  transformers, anthropic-sdk, openai-sdk (ai-ml); react, nextjs (web); pandas,
  numpy, prisma (data); react-native, flutter, expo (mobile). No wildcard. All
  other ai-ml files and all other thin frameworks move to CU4a.
- **Single-framework exemption**: depth-within-framework is the bar; 7-language
  cross-coverage rule does not apply. Implementer must not add cross-language
  BAD/SAFE examples to these single-framework files.
- **No-churn rule**: existing solid content within any file is extended, not
  overwritten.
- **WebSearch before version-specific assertions**: ai-ml and JS frameworks move
  fast; staleness risk is higher here than in CU2. Every version-specific claim
  must name the applicable version and carry a dated source.
- **Parallel-safe with CU2**: disjoint file sets; both depend only on CU1.
- **One stub for four sub-areas**: kept as one stub because the quality bar and
  reviewer rubric are identical across sub-areas; splitting adds gate overhead
  without parallelism benefit.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** Claude Code instance editing a PyTorch model training script,
**I want** the trigger-loaded pytorch.md guide to warn about CUDA/torch version
coupling, DataLoader pitfalls, and torch.compile compatibility constraints
with dated sources,
**so that** I can flag environment-breaking incompatibilities rather than producing
code that silently fails on the target GPU runtime.

**As a** Claude Code instance editing a Next.js App Router file,
**I want** the trigger-loaded nextjs.md guide to distinguish Server Component vs
Client Component boundaries, warn about Server Actions footguns, and note edge
runtime limitations — all verified against Next.js 15 docs,
**so that** my edits respect the App Router's rendering model rather than
applying Pages Router patterns incorrectly.

**As a** human reviewer auditing a CU3 implementation,
**I want** every framework guide to cite its version-specific claims with a source
URL or document reference and a retrieval date of 2025-01-01 or later,
**so that** I can reject any claim that lacks a concrete technology-specific
identifier or a dated source, and flag staleness proactively.

### Acceptance Criteria

**Objective depth gate (applies to every scenario below):** A reviewer rejects
any guide section that does not name at least one technology-specific identifier
(version number, CWE identifier, or concrete API/function name), and rejects any
version-specific or security claim that does not carry an inline dated source from
2025-01-01 or later. This is the gate a reviewer checks — not subjective depth
judgment.

- [ ] **Scenario: all 14 named framework guides exceed the 5-section floor**
  Given all 14 named files are at <=5 `##` sections (template floor)
  When each is upgraded
  Then each file contains more than 5 distinct `##` sections including at minimum:
  Overview, Async/Concurrency Footguns, Error Handling Idioms, Security and
  Dependency Gotchas, Testing Conventions, Performance Traps, Version-Specific
  Gotchas, and References
  And each section names at least one technology-specific identifier
  And no section consists only of generic bullets without a concrete identifier

- [ ] **Scenario: pytorch.md covers CUDA/torch coupling and training loop pitfalls**
  Given pytorch.md is ~50 lines with no version or runtime content
  When upgraded
  Then the guide addresses: CUDA/torch version compatibility matrix (and how to
  check it via nvidia-smi + torch.__version__), DataLoader num_workers pitfalls
  on different OS, gradient accumulation correctness, torch.compile mode and
  backend compatibility, mixed-precision training footguns (NaN propagation),
  model serialization safety (pickle-based .pt files, security implications), and
  current PyTorch stable version gotchas
  And each version-specific claim names the PyTorch version (e.g. "v2.6") and
  carries a source with retrieval date of 2025-01-01 or later

- [ ] **Scenario: tensorflow.md covers eager/graph mode, SavedModel, and TF2 pitfalls**
  Given tensorflow.md is ~50 lines
  When upgraded
  Then the guide addresses: eager vs tf.function graph mode behavioral
  divergence, @tf.function tracing overhead and retracing triggers, SavedModel
  vs HDF5 serialization trade-offs, TF2 migration from TF1 API remnants,
  TensorFlow/Keras version coupling (standalone keras vs tf.keras), and
  dependency security (model file loading with arbitrary code execution risk)
  And the model-loading security risk is flagged as a CVE-class concern with
  an authoritative source and a retrieval date of 2025-01-01 or later

- [ ] **Scenario: langchain.md covers LangChain 1.0 API surface and chain footguns**
  Given langchain.md is ~53 lines and predates LangChain 1.0 (September 2025)
  When upgraded
  Then the guide addresses: LangChain 1.0 breaking changes (LCEL pipe syntax
  removed, LLMChain removed, AgentExecutor deprecated in favor of LangGraph),
  CVE-2025-68664 critical serialization vulnerability (upgrade to 1.2.5+),
  prompt injection risks in tool-enabled chains, LangSmith tracing requirements
  for production, and version pinning requirements
  And the guide names "LangChain 1.0", "CVE-2025-68664", and "LCEL" as concrete
  identifiers and carries dated sources of 2025-01-01 or later for all claims

- [ ] **Scenario: transformers.md covers tokenizer/model version coupling**
  Given transformers.md is ~58 lines
  When upgraded
  Then the guide addresses: tokenizer/model version coupling (using a tokenizer
  from one checkpoint version with a model from another), AutoModel vs explicit
  class loading trade-offs, device placement pitfalls (to(device) ordering),
  safe_tensors vs pickle serialization, attention mask omission footguns,
  and Hugging Face Hub download caching and network dependency risks
  And model-serialization security (pickle-based .bin files) is flagged with
  an authoritative reference and a retrieval date of 2025-01-01 or later

- [ ] **Scenario: anthropic-sdk.md and openai-sdk.md cover SDK-specific footguns**
  Given anthropic-sdk.md and openai-sdk.md are at template floor (~50 lines each)
  When upgraded
  Then anthropic-sdk.md addresses: prompt caching footguns (cache_control
  placement, ephemeral vs persistent caching, cache invalidation triggers),
  async vs sync client selection, token budget management, and tool_use schema
  validation requirements with the applicable SDK version (e.g. anthropic v0.76+)
  And openai-sdk.md addresses: client instance migration from module-level calls
  (deprecated v1 API), Pydantic structured output via parse() vs JSON mode,
  AsyncOpenAI selection criteria, max_retries production requirements, and
  version coupling with the applicable version (e.g. openai v2.15+)
  And both files carry dated sources of 2025-01-01 or later for version-specific
  claims

- [ ] **Scenario: react.md reflects React 19 concurrent features**
  Given react.md is ~63 lines and predates React 19
  When upgraded
  Then the guide addresses: React 19 new hooks and their edge cases
  (useActionState, useOptimistic), concurrent rendering pitfalls (state tearing
  in non-wrapped state), useEffect dependency array gotchas, component key misuse
  patterns, prop-drilling vs context performance implications, and security
  concerns (dangerouslySetInnerHTML XSS, third-party component supply-chain)
  And all React 19-specific claims name "React 19" and carry a source with
  retrieval date of 2025-01-01 or later

- [ ] **Scenario: nextjs.md reflects Next.js 15 App Router patterns**
  Given nextjs.md is ~70 lines and does not address App Router
  When upgraded
  Then the guide addresses: Server Component vs Client Component boundary errors
  (passing non-serializable props, using hooks in Server Components), Server
  Actions footguns (unvalidated input, double-submission), edge runtime
  restrictions (no Node.js APIs), next/image optimization pitfalls,
  caching behavior in App Router vs Pages Router, and middleware execution
  order edge cases
  And all Next.js 15-specific claims name "Next.js 15" and carry a source with
  retrieval date of 2025-01-01 or later

- [ ] **Scenario: pandas.md and numpy.md cover data-correctness footguns**
  Given pandas.md (~60 lines) and numpy.md (~51 lines) are at template floor
  When upgraded
  Then pandas.md addresses: SettingWithCopyWarning / chained indexing footgun,
  DataFrame.copy() when required vs when wasted, memory-efficient dtypes
  (category, nullable int), groupby gotchas (missing groups, transform vs apply),
  and pandas 2.0 copy-on-write implications
  And numpy.md addresses: broadcasting shape mismatch (the most common silent
  bug pattern), integer overflow in C-backed arrays, view vs copy semantics
  for slices, and dtype promotion rules that change results silently
  And both name the applicable pandas/numpy version (e.g. "pandas 2.x",
  "numpy 2.x") and carry dated sources of 2025-01-01 or later

- [ ] **Scenario: prisma.md covers N+1 queries, migrations, and injection risk**
  Given prisma.md is ~55 lines
  When upgraded
  Then the guide addresses: N+1 query detection (missing include/select pattern),
  Prisma raw query SQL injection risk (template literal vs parameterized — CWE-89),
  migration safety in production (lock-wait, column drops), Prisma Client
  instantiation in serverless (connection pool exhaustion), and type safety
  gaps when using $queryRaw without type parameters
  And the SQL injection risk names "CWE-89" and carries an authoritative source
  with retrieval date of 2025-01-01 or later

- [ ] **Scenario: react-native.md covers JSI, bridge, and turbo module pitfalls**
  Given react-native.md is ~51 lines with no architecture content
  When upgraded
  Then the guide addresses: old architecture (bridge) vs new architecture
  (JSI/Fabric/TurboModules) migration footguns, Hermes engine compatibility
  constraints, native module threading model, useNativeDriver animation
  requirement and its exceptions, Metro bundler resolution edge cases, and
  OTA update security considerations
  And the OTA update security note references an authoritative source with
  retrieval date of 2025-01-01 or later

- [ ] **Scenario: flutter.md and expo.md cover their primary footguns**
  Given flutter.md (~57 lines) and expo.md (~50 lines) are at template floor
  When upgraded
  Then flutter.md addresses: widget rebuild anti-patterns (passing mutable
  objects as const, large build methods), Dart null-safety migration traps,
  platform channel threading (UI thread vs background isolate), Flutter version
  channel stability trade-offs, and state management anti-patterns
  And expo.md addresses: managed workflow vs bare workflow capability boundary,
  EAS Build vs local build environment differences, SDK version upgrade breaking
  changes, and expo-updates OTA deployment safety
  And both name the applicable Flutter SDK version or Expo SDK version and carry
  dated sources of 2025-01-01 or later

- [ ] **Scenario: all version-specific and security claims carry dated sources**
  Given all 14 named guides currently have no dated sources
  When any version-specific or security claim is added
  Then the claim includes a source reference with a retrieval date of 2025-01-01
  or later, naming the exact framework version the claim applies to (not just a
  date) — this is especially critical for LangChain, Next.js, and Expo which
  release rapidly
  And a reviewer can reject any version-specific or security claim that lacks
  both a concrete identifier (version number, CWE ID, or API name) and a dated
  source

- [ ] **Scenario: audit-ledger completeness check passes and ai-ml scope boundary holds**
  Given the audit ledger at `.ctoc/audit/corpus-audit-2026-06-15.json` defines
  the in-scope set and the named CU3 set excludes the ai-ml wildcard
  When the implementer processes all 14 named framework files
  Then every file appears in the audit artifact as UPGRADED or SOLID-SKIPPED
  with a rationale — no file is silently omitted
  And no ai-ml file beyond the 6 named ai-ml files (pytorch, tensorflow, langchain,
  transformers, anthropic-sdk, openai-sdk) is upgraded under CU3 — those files
  are CU4a scope and must not be processed here
  And `node --test tests/*.test.js` passes with `# fail 0` after all edits

## Scope

### In Scope

- Content upgrades to exactly the 14 named files listed in `files:` frontmatter:
  pytorch.md, tensorflow.md, langchain.md, transformers.md, anthropic-sdk.md,
  openai-sdk.md (ai-ml); react.md, nextjs.md (web); pandas.md, numpy.md,
  prisma.md (data); react-native.md, flutter.md, expo.md (mobile).
- Adding sections for: async/concurrency footguns, error-handling idioms, security
  and dependency gotchas (with CVE/CWE identifiers and security references where
  applicable), testing conventions, performance traps, version-specific gotchas,
  and dated references.
- WebSearch for current framework docs before asserting version-specific facts;
  stamping each claim with retrieval date of 2025-01-01 or later.
- Recording explicitly (not silently) any of the 14 files that is determined to
  be audited-SOLID and skipped.

### Out of Scope

- Any ai-ml file not in the 6 named ai-ml files — the remaining ai-ml files
  (diffusers.md and all other `skills/frameworks/ai-ml/*.md` beyond the named
  set) are CU4a scope. No wildcard processing under CU3.
- Any framework guide not in the 14 named files — remaining template-floor
  frameworks are CU4a.
- Language guides in `skills/languages/` — those are CU2.
- Quality-config files — those are CU4b.
- Non-mainstream language guides — those are CU4c.
- SKILL.md files in other categories.
- The 7-language BAD/SAFE cross-coverage rule — single-framework guides are
  exempt; implementer must not add cross-language examples.
- Changes to `src/`, `tests/`, `agents/`, hooks, or gate logic.
- Rewriting any section confirmed solid by the 2026-06-15 audit (no-churn rule).

## Risks

### Technical Risks

- **Framework version churn invalidates claims before review**: AI/ML and JS
  frameworks release frequently; a claim accurate at implementation time may be
  stale within weeks.
  - Likelihood: HIGH (Next.js, LangChain, PyTorch all release frequently)
  - Impact: MEDIUM (misleading guidance at the next trigger load)
  - Mitigation: Every version-specific claim names the version it applies to (not
    just a date), so staleness is detectable; reviewers flag any claim lacking
    both a version identifier and a dated source from 2025-01-01 or later.

- **Frontmatter corruption breaks skills.json trigger**: same risk as CU2 but
  across 14 files.
  - Likelihood: LOW
  - Impact: HIGH (broken trigger = no guidance loaded for that framework)
  - Mitigation: Run `node --test tests/*.test.js` after each file edit.

- **LangChain 1.0 API surface is still stabilizing**: LangChain 1.0 shipped
  September 2025; some API patterns may still evolve. Claims that were accurate
  at implementation time may drift.
  - Likelihood: MEDIUM (LangChain has a history of rapid API change)
  - Impact: MEDIUM (incorrect chain construction guidance misdirects Claude)
  - Mitigation: WebSearch LangChain 1.x changelog at implementation time; stamp
    claims with the exact version (e.g. "LangChain 1.2.5") to make staleness
    detection straightforward.

### Business Risks

- **LangChain prompt injection note is itself a liability if incomplete**: adding
  a security concern without actionable mitigation is worse than not mentioning it.
  - Likelihood: LOW (acceptance criteria require actionable content)
  - Impact: MEDIUM (incomplete security note misleads more than no note)
  - Mitigation: The LangChain guide entry must include both the risk pattern and
    at least one concrete mitigation (input sanitization, output parsing with
    schema validation, or sandboxed tool execution).

### Dependency Risks

- **Blocked by CU1**: same as CU2.
  - Likelihood: LOW
  - Impact: MEDIUM
  - Mitigation: CU1's `order: 1` priority enforces sequencing.

- **CU3 and CU2 are parallel-safe**: both depend only on CU1 and touch disjoint
  files. Running them concurrently is correct and does not require a sequencing
  gate between them.

- **CU4a inherits CU3's named-set exclusion**: CU4a must diff the audit ledger
  against CU3's `files:` set to identify its scope. CU3 must record all 14 files
  in the audit artifact (UPGRADED or SOLID-SKIPPED) so CU4a can do this diff
  cleanly.
  - Likelihood: LOW (process is clearly defined)
  - Impact: LOW (worst case: CU4a re-processes a file; discovered at review)
  - Mitigation: CU3 writes explicit per-file verdicts to the audit artifact for
    all 14 files before marking complete.

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: MEDIUM (2) — CU4a (ai-ml long tail + other thin frameworks) depends
  on CU3 setting the depth standard and providing the named-set exclusion via
  the audit ledger; CU2 and CU3 are parallel peers.
- Business Impact: HIGH (3) — highest-traffic framework guides; AI/ML and
  React/Next.js upgrades benefit the most common CTOC implementation patterns.
- Technical Risk: MEDIUM (2) — version-churn risk is real for fast-moving
  frameworks; mitigated by naming versions explicitly alongside dated sources.

## Decisions Taken Under Ambiguity

- **Named set, no wildcard** — CU3 scope is exactly the 14 named files: pytorch,
  tensorflow, langchain, transformers, anthropic-sdk, openai-sdk (ai-ml); react,
  nextjs (web); pandas, numpy, prisma (data); react-native, flutter, expo (mobile).
  The former `ai-ml/*.md` wildcard is removed. All remaining ai-ml files are CU4a
  scope, not CU3 scope. This is a locked decision from the adversarial review.
- **anthropic-sdk and openai-sdk added to named set** — both are in the vision's
  "the SDKs" reference for the ai-ml tier; both are confirmed at template floor;
  both are high-traffic AI-pipeline targets. Adding them to CU3's named set rather
  than CU4a is consistent with the "high-traffic before long-tail" principle.
- **Objective depth bar** — "not padding" replaced with the grep-checkable rule:
  every required section must name at least one technology-specific identifier
  (version number, CWE identifier, or concrete API/function name), AND every
  version-specific or security claim must carry an inline dated source from
  2025-01-01 or later. A reviewer rejects against this criterion.
- **Floor criterion** — <=5 `##` sections (not line count); consistent with the
  audit ledger definition used across all CU plans.
- **Sub-area split vs separate stubs** — kept as ONE stub because the four
  sub-areas share an identical quality bar and reviewer rubric; splitting into
  four stubs would multiply gate overhead without parallelism benefit (files are
  already independently implementable inside one stub).
- **Boundary with CU4a** — only the 14 named high-traffic frameworks the vision
  names are in CU3; all other template-floor framework files fall to CU4a.
- **Single-framework exemption** — depth-within-framework is the bar; 7-language
  BAD/SAFE cross-coverage rule does not apply. Implementer must not add
  cross-language examples.
- **Existing solid sections** — extend, never rewrite (no-churn rule).
