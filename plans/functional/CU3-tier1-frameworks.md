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
acceptance_criteria_count: 13
risk_level: MEDIUM
files:
  - skills/frameworks/ai-ml/pytorch.md
  - skills/frameworks/ai-ml/tensorflow.md
  - skills/frameworks/ai-ml/langchain.md
  - skills/frameworks/ai-ml/transformers.md
  - skills/frameworks/ai-ml/*.md
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
CTOC corpus. The entire ai-ml tree sits at the 5-section template floor
(pytorch ~50, tensorflow ~50, langchain ~53, transformers ~58 lines), as do the
core web guides (react ~63, nextjs ~70), data guides (pandas ~60, numpy ~51,
prisma ~55), and mobile guides (react-native ~51, flutter ~57). These are among
the highest-traffic trigger-loaded guides in the corpus — a developer working with
PyTorch, React, or a Prisma schema loads these files on every relevant edit. At
template floor, the guide provides no correction value: no CUDA/torch version
compatibility warnings, no React 19 concurrent mode pitfalls, no Prisma N+1 query
detection, no LangChain chain construction footguns. This stub upgrades every
enumerated framework guide to substantive correction depth before the lower-traffic
long tail is addressed (CU4).

### Current State

From the 2026-06-15 audit, all enumerated files are at the 5-section template
floor. Specific confirmed deficiencies:
- **ai-ml guides**: No mention of CUDA/torch version coupling (a prolific source
  of environment breakage), no tokenizer/transformers version pinning warnings,
  no LangChain deprecation-heavy API surface notes, no TensorFlow 2.x eager vs
  graph mode pitfalls, no guidance on model loading memory footprints.
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

The ai-ml tree is particularly high-leverage: PyTorch and LangChain codebases are
CTOC's most common AI-generation targets. A guide that does not warn about
CUDA/torch version incompatibility, or about LangChain's deprecated chain API,
leaves Claude without the most common footgun context at exactly the moment it is
editing an AI-pipeline file. React and Next.js drive the majority of CTOC SaaS
template implementations. Upgrading these 13+ guides (including any additional
thin ai-ml files discovered at implementation time) directly improves correction
quality for the highest-volume implementation work.

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
- **Deliverable:** 13+ upgraded framework reference guides (the 13 named files
  plus any additional thin ai-ml files discovered under `skills/frameworks/ai-ml/`),
  each measurably deeper than the 5-section floor, with async/concurrency, error
  handling, security, testing, performance, and version-specific sections.

### Success Metrics

- All enumerated guides contain at minimum 6 substantive sections.
- ai-ml guides specifically address version coupling and runtime pitfalls.
- web guides reflect React 19-era and Next.js 15-era with dated sources.
- Every version-specific or security claim carries a source and retrieval date.
- `node --test tests/*.test.js` passes with `# fail 0`.
- `.ctoc/skills.json` trigger mappings remain valid for all modified guides.

### Stakeholders

- Claude Code (automated consumer).
- Human reviewer (gate approval).
- CU4 (long-tail frameworks): uses CU3 output as the depth standard for the
  remaining framework guides.

### Constraints

- **Framework set is fixed**: the 13 named files plus any additional thin ai-ml
  files found under `skills/frameworks/ai-ml/` that are confirmed at template
  floor by the audit. Audited-SOLID ai-ml files are left alone (no-churn rule).
- **Single-framework exemption**: depth-within-framework is the bar; 7-language
  cross-coverage rule does not apply.
- **No-churn rule**: existing solid content within any file is extended, not
  overwritten.
- **WebSearch before version-specific assertions**: ai-ml and JS frameworks move
  fast; staleness risk is higher here than in CU2.
- **Parallel-safe with CU2**: disjoint file sets; both depend only on CU1.
- **One stub for four sub-areas**: kept as one stub because the quality bar and
  reviewer rubric are identical across sub-areas; splitting adds gate overhead
  without parallelism benefit.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** Claude Code instance editing a PyTorch model training script,
**I want** the trigger-loaded pytorch.md guide to warn about CUDA/torch version
coupling, `DataLoader` pitfalls, and `torch.compile` compatibility constraints
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
**I want** every ai-ml guide to cite its version-specific claims with a source URL
and retrieval date,
**so that** I can assess whether the claim is still valid for the version the
team is running and flag staleness proactively.

### Acceptance Criteria

- [ ] **Scenario: all enumerated framework guides exceed the 5-section floor**
  Given all 13+ enumerated files are at template floor
  When each is upgraded
  Then each file contains at minimum: Overview, Async/Concurrency Footguns, Error
  Handling Idioms, Security and Dependency Gotchas, Testing Conventions,
  Performance Traps, Version-Specific Gotchas, and References
  And each section contains framework-specific, non-generic content

- [ ] **Scenario: pytorch.md covers CUDA/torch coupling and training loop pitfalls**
  Given pytorch.md is ~50 lines with no version or runtime content
  When upgraded
  Then the guide addresses: CUDA/torch version compatibility matrix (and how to
  check it), DataLoader `num_workers` pitfalls on different OS, gradient
  accumulation correctness, `torch.compile` mode and backend compatibility,
  mixed-precision training footguns (NaN propagation), model serialization
  safety (pickle-based `.pt` files, security implications), and current PyTorch
  stable version gotchas
  And each version-specific claim carries a source and retrieval date

- [ ] **Scenario: tensorflow.md covers eager/graph mode, SavedModel, and TF2 pitfalls**
  Given tensorflow.md is ~50 lines
  When upgraded
  Then the guide addresses: eager vs `tf.function` graph mode behavioral
  divergence, `@tf.function` tracing overhead and retracing triggers, SavedModel
  vs HDF5 serialization trade-offs, TF2 migration from TF1 API remnants,
  TensorFlow/Keras version coupling (standalone `keras` vs `tf.keras`), and
  dependency security (model file loading with arbitrary code execution risk)
  And the model-loading security risk is flagged as a CVE-class concern with
  an authoritative source

- [ ] **Scenario: langchain.md covers deprecated API surfaces and chain footguns**
  Given langchain.md is ~53 lines
  When upgraded
  Then the guide addresses: LangChain's rapid deprecation cycle and how to
  identify deprecated chain APIs vs LCEL (LangChain Expression Language)
  replacements, callback and streaming handler composition pitfalls, tool-calling
  schema validation gaps, memory management in long-running chains, prompt
  injection risks in tool-enabled chains, and version pinning requirements
  And the prompt injection risk is flagged as a security concern with a
  reference to an authoritative source (OWASP LLM Top 10 or equivalent)

- [ ] **Scenario: transformers.md covers tokenizer/model version coupling**
  Given transformers.md is ~58 lines
  When upgraded
  Then the guide addresses: tokenizer/model version coupling (using a tokenizer
  from one checkpoint version with a model from another), `AutoModel` vs explicit
  class loading trade-offs, device placement pitfalls (`to(device)` ordering),
  safe_tensors vs pickle serialization, attention mask omission footguns,
  and Hugging Face Hub download caching and network dependency risks
  And model-serialization security (pickle-based `.bin` files) is flagged with
  an authoritative reference

- [ ] **Scenario: react.md reflects React 19 concurrent features**
  Given react.md is ~63 lines and predates React 19
  When upgraded
  Then the guide addresses: React 19 new hooks and their edge cases (useActionState,
  useOptimistic), concurrent rendering pitfalls (state tearing in non-wrapped
  state), useEffect dependency array gotchas, component key misuse patterns,
  prop-drilling vs context performance implications, and security concerns
  (dangerouslySetInnerHTML XSS, third-party component supply-chain)
  And all React 19-specific claims carry a source dated no earlier than 2024-01-01

- [ ] **Scenario: nextjs.md reflects Next.js 15 App Router patterns**
  Given nextjs.md is ~70 lines and does not address App Router
  When upgraded
  Then the guide addresses: Server Component vs Client Component boundary errors
  (passing non-serializable props, using hooks in Server Components), Server
  Actions footguns (unvalidated input, double-submission), edge runtime
  restrictions (no Node.js APIs), `next/image` optimization pitfalls,
  caching behavior in App Router vs Pages Router, and middleware execution
  order edge cases
  And all Next.js 15-specific claims carry a source dated no earlier than 2024-01-01

- [ ] **Scenario: pandas.md and numpy.md cover data-correctness footguns**
  Given pandas.md (~60 lines) and numpy.md (~51 lines) are at template floor
  When upgraded
  Then pandas.md addresses: SettingWithCopyWarning / chained indexing footgun,
  DataFrame.copy() when it is required vs when it is wasted, memory-efficient
  dtypes (category, nullable int), `groupby` gotchas (missing groups, transform
  vs apply), and pandas 2.0 copy-on-write implications
  And numpy.md addresses: broadcasting shape mismatch (the most common silent
  bug pattern), integer overflow in C-backed arrays, view vs copy semantics
  for slices, and `dtype` promotion rules that change results silently
  And both carry dated sources for version-specific claims (pandas 2.x, numpy 2.x)

- [ ] **Scenario: prisma.md covers N+1 queries, migrations, and injection risk**
  Given prisma.md is ~55 lines
  When upgraded
  Then the guide addresses: N+1 query detection (no `select` includes pattern),
  Prisma raw query SQL injection risk (template literal vs parameterized),
  migration safety in production (lock-wait, column drops), Prisma Client
  instantiation in serverless (connection pool exhaustion), and type safety
  gaps when using `$queryRaw` without type parameters
  And the SQL injection risk is flagged as a security concern with a CWE reference
  (CWE-89) or equivalent authoritative source

- [ ] **Scenario: react-native.md covers JSI, bridge, and turbo module pitfalls**
  Given react-native.md is ~51 lines with no architecture content
  When upgraded
  Then the guide addresses: old architecture (bridge) vs new architecture
  (JSI/Fabric/TurboModules) migration footguns, Hermes engine compatibility
  constraints, native module threading model, `useNativeDriver` animation
  requirement and its exceptions, Metro bundler resolution edge cases, and
  OTA update security considerations
  And the OTA update security note references an authoritative source

- [ ] **Scenario: flutter.md and expo.md cover their primary footguns**
  Given flutter.md (~57 lines) and expo.md are at template floor
  When upgraded
  Then flutter.md addresses: widget rebuild anti-patterns (passing mutable objects
  as const, large build methods), Dart null-safety migration traps, platform
  channel threading (UI thread vs background isolate), Flutter version channel
  stability trade-offs, and state management anti-patterns in common architectures
  And expo.md addresses: managed workflow vs bare workflow capability boundary,
  EAS Build vs local build environment differences, SDK version upgrade breaking
  changes, and expo-updates OTA deployment safety
  And both carry dated sources for version-specific claims

- [ ] **Scenario: all ai-ml guides within skills/frameworks/ai-ml/ at template floor are upgraded**
  Given the `ai-ml/*.md` glob covers files beyond the four named guides
  When the implementer discovers additional thin ai-ml files at implementation time
  Then each additional file confirmed at template floor by the audit is upgraded
  with the same quality bar as the four named guides
  And each confirmed audited-SOLID ai-ml file is explicitly recorded as skipped
  with rationale (not silently passed over) — honoring Success Criterion 5

- [ ] **Scenario: all version-specific and security claims carry dated sources**
  Given all enumerated guides currently have no dated sources
  When any version-specific or security claim is added
  Then the claim includes a source reference with a retrieval date no earlier
  than 2025-01-01 (or the most recent available authoritative source date)
  And framework docs that version rapidly (LangChain, Next.js, Expo) explicitly
  note the version the claim applies to, not just a date

- [ ] **Scenario: tests stay green and skills.json mappings remain valid**
  Given `.ctoc/skills.json` indexes these framework guides by trigger
  When any of the enumerated files is modified
  Then `node --test tests/*.test.js` passes with `# fail 0` after the edit
  And the frontmatter of each modified file retains the key/value pairs required
  by the skills.json trigger mapping

## Scope

### In Scope

- Content upgrades to all 13 named files plus any additional ai-ml files under
  `skills/frameworks/ai-ml/` confirmed thin by the 2026-06-15 audit.
- Adding sections for: async/concurrency footguns, error-handling idioms, security
  and dependency gotchas (with CVE/CWE classes and security references where
  applicable), testing conventions, performance traps, version-specific gotchas,
  and dated references.
- WebSearch for current framework docs before asserting version-specific facts;
  stamping each claim with retrieval date.
- Recording explicitly (not silently) any audited-SOLID ai-ml file that is skipped.

### Out of Scope

- Any framework guide not in the 13 named files and not in the ai-ml tree —
  remaining template-floor frameworks are CU4.
- Language guides in `skills/languages/` — those are CU2.
- Quality-config files — those are CU4.
- SKILL.md files in other categories.
- The 7-language BAD/SAFE cross-coverage rule — single-framework guides are exempt.
- Changes to `src/`, `tests/`, `agents/`, hooks, or gate logic.
- Rewriting any section confirmed solid by the 2026-06-15 audit (no-churn rule).
- Audited-SOLID files under `skills/frameworks/ai-ml/` — explicitly skipped and
  recorded per the no-churn rule.

## Risks

### Technical Risks

- **Framework version churn invalidates claims before review**: AI/ML and JS
  frameworks release frequently; a claim accurate at implementation time may be
  stale within weeks.
  - Likelihood: HIGH (Next.js, LangChain, PyTorch all release frequently)
  - Impact: MEDIUM (misleading guidance at the next trigger load)
  - Mitigation: Every version-specific claim names the version it applies to (not
    just a date), so staleness is detectable; `last verified:` lines make the
    refresh cycle visible; reviewers flag any claim older than 6 months.

- **Frontmatter corruption breaks skills.json trigger**: same risk as CU2 but
  across 13+ files.
  - Likelihood: LOW
  - Impact: HIGH (broken trigger = no guidance loaded for that framework)
  - Mitigation: Run `node --test tests/*.test.js` after each file edit.

- **ai-ml glob discovers more files than expected**: the `ai-ml/*.md` glob may
  include files not anticipated by the audit (e.g. new SDK guides added after
  the audit date).
  - Likelihood: LOW (audit is recent — 2026-06-15)
  - Impact: LOW (extra files are handled by the solid/thin verdict: thin → upgrade,
    solid → record as skipped)
  - Mitigation: At implementation start, list all files under `skills/frameworks/ai-ml/`
    and cross-reference with audit verdicts before upgrading any.

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

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: MEDIUM (2) — CU4 (long tail) depends on CU3 setting the depth
  standard; CU2 and CU3 are parallel peers.
- Business Impact: HIGH (3) — highest-traffic framework guides; AI/ML and React/Next.js
  upgrades benefit the most common CTOC implementation patterns.
- Technical Risk: MEDIUM (2) — version-churn risk is real for fast-moving
  frameworks; mitigated by naming versions explicitly alongside dates.

## Decisions Taken Under Ambiguity

- **"the SDKs" in ai-ml** — interpreted as the AI vendor SDK reference guides
  present under `skills/frameworks/ai-ml/` (e.g. the model-provider SDK guides).
  The `ai-ml/*.md` glob covers them; implementation upgrades each thin ai-ml
  file, but only those at template floor (audited-SOLID ai-ml files are left
  alone per no-churn).
- **Sub-area split vs separate stubs** — kept as ONE stub because the four
  sub-areas share an identical quality bar and reviewer rubric; splitting into
  four stubs would multiply gate overhead without parallelism benefit (files are
  already independently implementable inside one stub).
- **Boundary with Tier 2 (CU4)** — only the high-traffic frameworks the vision
  names are in scope here; all other template-floor frameworks fall to CU4.
- **Existing solid sections** — extend, never rewrite (no-churn rule).
