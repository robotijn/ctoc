# Process Failure Modes and Effects Analysis — the Iron Loop itself

> CTOC v6.9.27 — Cluster 3 (Risk Analysis Before Build). This document applies Process Failure Modes and Effects Analysis to CTOC's own Iron Loop, treating each step in the loop as a process whose failure modes have severity, occurrence, and detection scores. The framework is the 2019 Automotive Industry Action Group / Verband der Automobilindustrie joint standard with its 2026 reaffirmations, not the older Risk Priority Number approach.

## Why Process Failure Modes and Effects Analysis applies to the Iron Loop

The Iron Loop is the manufacturing line that produces CTOC's deliverables. Each step transforms inputs into outputs; each step has failure modes; each failure mode has consequences downstream. Quality engineering has applied Process Failure Modes and Effects Analysis to manufacturing lines for sixty years. The 2019 Automotive Industry Action Group / Verband der Automobilindustrie joint handbook replaced the older Risk Priority Number (the multiplicative product of Severity, Occurrence, and Detection) with the Action Priority matrix because Risk Priority Number arithmetic let high-Severity, low-Occurrence failures score the same as low-Severity, high-Occurrence failures, hiding the truly dangerous combinations.

The 2026 update (Quality-One International review, https://quality-one.com/process-fmea-pfmea/, and the Verband der Automobilindustrie 2026 maintenance release referenced at https://www.aiag.org/quality/automotive-core-tools/fmea) reaffirms the Action Priority approach and adds clearer guidance on Severity scoring for software-process failures and for mixed human-and-automated workflows. CTOC adopts the 2019 framework with the 2026 clarifications.

## Scoring rubrics

### Severity (one to ten)

Severity scores the effect of the failure on the end-user (the human Chief Technology Officer commanding CTOC), on downstream Iron Loop steps, and on the shipped artifact. Ten is the worst outcome.

| Score | Severity class | Example of an Iron Loop failure at this severity |
|---|---|---|
| 10 | End-user safety affected, regulatory violation, irreversible | A Step 13 SECURE pass that allows a critical-tier vulnerability to ship to production |
| 9 | Severe customer impact, possible regulatory exposure | A Step 7 SPEC that converges falsely on superficial agreement and ships an irreversible architectural decision |
| 8 | Major rework required, schedule slip beyond one sprint | A Step 5 PLAN that misses an integration boundary and forces a redesign at Step 10 |
| 7 | Moderate rework, schedule slip within one sprint | A Step 8 TEST suite with shallow assertions that lets a bug through to Step 10 |
| 6 | Minor rework, no schedule impact | A Step 12 OPTIMIZE pass that introduces a non-load-bearing performance regression |
| 5 | Customer-visible defect that customer notices | A Step 15 DOCUMENT pass that leaves a public-facing inconsistency |
| 4 | Customer-visible defect that customer does not notice | A Step 14 VERIFY pass that leaves coverage at seventy-eight percent rather than the eighty-percent target |
| 3 | Internal-only inefficiency | A Step 9 PREPARE pass that re-installs a tool already present |
| 2 | Cosmetic | A trailing newline missing in a generated report |
| 1 | No noticeable effect | A debug log line that nobody reads |

### Occurrence (one to ten)

Occurrence scores the probability that the failure mode happens in practice given the controls currently in place.

| Score | Occurrence class | Rate of occurrence in the loop |
|---|---|---|
| 10 | Almost certain | More than one in two runs |
| 9 | Very high | One in ten |
| 8 | High | One in twenty |
| 7 | Moderately high | One in fifty |
| 6 | Moderate | One in one hundred |
| 5 | Moderately low | One in five hundred |
| 4 | Low | One in two thousand |
| 3 | Very low | One in ten thousand |
| 2 | Remote | One in one hundred thousand |
| 1 | Almost never | One in one million or fewer |

### Detection (one to ten)

Detection scores the probability that the current controls catch the failure BEFORE it reaches the user. Higher Detection score means LOWER detection probability — the rubric is intentionally inverse so that high Severity, high Occurrence, high Detection (poor detection) all combine into the highest Action Priority.

| Score | Detection class | Detection capability |
|---|---|---|
| 10 | No detection | No control exists to catch the failure |
| 9 | Very remote | Detection by chance only |
| 8 | Remote | Random sampling, low coverage |
| 7 | Very low | Manual review without a checklist |
| 6 | Low | Manual review with a checklist |
| 5 | Moderate | Automated check with known coverage gaps |
| 4 | Moderately high | Automated check with broad coverage |
| 3 | High | Automated check plus manual review |
| 2 | Very high | Fail-loud automated check |
| 1 | Almost certain | Failure is impossible to miss |

### Action Priority

The 2019 Action Priority replaces the Risk Priority Number multiplication. The matrix is consulted via Severity first, then Occurrence, then Detection. The full table is in the Automotive Industry Action Group / Verband der Automobilindustrie 2019 handbook; the summary CTOC uses:

- Severity ten with any Occurrence and any Detection → **High** priority.
- Severity nine with any Occurrence and any Detection → **High** priority.
- Severity eight with Occurrence five or higher → **High** priority.
- Severity eight with Occurrence less than five and Detection seven or higher → **High** priority.
- Severity seven with Occurrence and Detection both moderate to high → **High** priority.
- Severity six with Occurrence eight or higher → **High** priority.
- Severity four through seven with moderate Occurrence and moderate Detection → **Medium** priority.
- Severity one through three with any Occurrence and any Detection → **Low** priority.

The Action Priority drives the order in which mitigations are applied. **High** items demand action before the next release. **Medium** items are tracked and scheduled. **Low** items are documented.

## Iron Loop process Failure Modes and Effects table

Each row scores one credible failure mode for one Iron Loop step. The scores reflect CTOC's current controls as of version 6.9.27. They are intentionally conservative — assume the failure is plausible and the detection is imperfect unless evidence proves otherwise. Scores are reviewed quarterly per the `capa_register` control.

### Step 1 — IDEATE

**Failure mode**: the user dumps a vague request and the vision-advisor accepts it as written, producing a vision that does not match the user's actual intent.

**Symptom**: a misaligned vision propagates through Gates 0, 1, 2 unchallenged; the entire downstream pipeline implements the wrong product. The user notices at demo and rejects four hours of automated work.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 9 | Reaching Gate 3 with the wrong product means re-running the entire pipeline, plus the user has lost trust in the system. Severe customer impact with possible reputational damage to CTOC itself. |
| Occurrence | 6 | Moderate. Without explicit role-classification, vague requests are common in first-time use. The persona-routing system (CTOC v8.3+) reduces this once the persona is set, but persona-detection itself can mis-classify. |
| Detection | 7 | Very low. Vision is the first artifact; only the user can catch a vague intent and the user has not yet seen the gate questions that would surface the gap. |
| Action Priority | High | Severity nine triggers High regardless of Occurrence and Detection. |

**Mitigation**: the vision-advisor MUST present a one-paragraph paraphrase of the user's intent and ask explicit confirmation before moving forward, per the persona-aware question routing in CLAUDE.md. The persona check at session start (per `docs/PERSONA_ROUTING.md`) routes role-appropriate questions; the vision-advisor adds an explicit "is this what you meant?" gate before drafting the vision document.

### Step 2 — ASSESS

**Failure mode**: the product-owner glosses over the existing product context and proposes a feature that conflicts with shipped functionality.

**Symptom**: the implementation breaks a flow the user did not mention because it was assumed to be context.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 7 | Moderate rework, schedule slip within one sprint. The shipped functionality must be either updated or excluded explicitly. |
| Occurrence | 5 | Moderately low. CTOC's existing-product detection covers most cases. |
| Detection | 5 | Moderate. The functional-reviewer at Step 4 catches some conflicts; not all. |
| Action Priority | Medium | Severity seven plus moderate Occurrence plus moderate Detection. |

**Mitigation**: the product-owner MUST read the existing `## Product Context` section of any plan that touches a shared module. The functional-reviewer at Step 4 explicitly checks for conflicts with `plans/done/*` plans that touched the same files.

### Step 3 — ALIGN

**Failure mode**: alignment with stakeholders is declared complete on the basis of silence rather than explicit confirmation.

**Symptom**: a stakeholder objects after the plan moves to implementation, forcing a kickback to Step 4 or earlier.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 6 | Minor to moderate rework depending on how far implementation has progressed. |
| Occurrence | 4 | Low. The product-owner explicitly enumerates stakeholders and confirmation events. |
| Detection | 5 | Moderate. The functional-reviewer checks for an alignment confirmation marker. |
| Action Priority | Medium | Severity six plus low Occurrence plus moderate Detection. |

**Mitigation**: the alignment step MUST produce an explicit `alignment_confirmed_by: [<stakeholders>]` block; silence is not acceptance.

### Step 4 — CAPTURE (Gate 1)

**Failure mode**: the functional-reviewer rubber-stamps the plan because the user previously approved a similar one.

**Symptom**: a real divergence from the prior plan is missed; the implementation crosses Gate 1 with an incorrect functional spec.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 9 | Crossing a human gate with the wrong artifact loses user trust and may produce regulatory exposure if a profile is active. |
| Occurrence | 3 | Very low. The four-eyes Gate 3 control (when active) reduces this further. |
| Detection | 5 | Moderate. The human-gate-check hook auto-reverts plans missing the `approved_by: human` marker. |
| Action Priority | High | Severity nine triggers High regardless. |

**Mitigation**: the human gates are enforced by `src/hooks/human-gate-check.js` per the CLAUDE.md rules. The functional-reviewer NEVER self-approves Gate 1; the user does.

### Step 5 — PLAN

**Failure mode**: the implementation-planner skips an integration boundary because the test fixtures hide it (the boundary is satisfied by a mock in development that does not exist in production).

**Symptom**: integration bugs surface at Step 10 or, worse, in production after Gate 3.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 8 | Major rework, schedule slip beyond one sprint. Production integration bugs are expensive to diagnose. |
| Occurrence | 6 | Moderate. Integration-boundary failures are a documented pattern in software engineering at large; CTOC's coverage of the boundary catalogue is incomplete for new platforms. |
| Detection | 6 | Low. Static analysis at Step 9 catches some but not all integration mismatches; the Hardware-in-the-Loop ladder (`hil_test_ladder`) catches more, but only when the active profile requires it. |
| Action Priority | High | Severity eight with Occurrence six. |

**Mitigation**: the implementation-planner MUST enumerate integration boundaries explicitly in the `## Integration Boundaries` section. The `architecture/dependency-analyzer` skill is ALWAYS dispatched at Step 6 to cross-check. When the active profile requires `hil_test_ladder`, the Hardware-in-the-Loop ladder runs at Step 14.

### Step 6 — DESIGN

**Failure mode**: the design proposes a redundancy pattern with no named diversity dimension, and the `safety/redundancy-pattern-picker` is inert because no integrity-level profile is active.

**Symptom**: an identical-redundancy claim ships as if it were diverse; the field demonstrates the common-cause assumption was wrong.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 10 | When the project IS safety-critical, this failure is a regulatory and reputational ten. When the project is NOT safety-critical, the failure-mode does not apply. |
| Occurrence | 4 | Low — the picker is dispatched whenever the FMEDA surfaces a gap. The remaining risk is that the picker is not dispatched because the FMEDA itself was not run. |
| Detection | 5 | Moderate. The picker emits `kind: undefended_diversity` when activated; the gap is that activation depends on the FMEDA having run first. |
| Action Priority | High | Severity ten triggers High regardless. |

**Mitigation**: when the active profile requires `fmeda_design`, the picker is dispatched immediately after the FMEDA. When the active profile does not require `fmeda_design` but the plan declares `criticality: high`, CTO Chief still dispatches the picker. The trigger is OR, not AND.

### Step 6.5 — THREAT MODEL

**Failure mode**: the threat-modeler runs but does not pair STRIDE with LINDDUN, and the system processes personal data without anyone noticing.

**Symptom**: a documented General Data Protection Regulation design-time gap ships to production. Article 25 violation is in scope under the active profile.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 9 | Severe customer impact plus regulatory exposure. |
| Occurrence | 4 | Low. The threat-modeler skill's `missing_privacy_threats` finding catches the common case; the gap is when neither schema-name heuristic nor explicit personal-data declaration fires. |
| Detection | 4 | Moderately high. The skill explicitly looks for personal-data signals. |
| Action Priority | High | Severity nine triggers High regardless. |

**Mitigation**: the threat-modeler skill ALWAYS pairs STRIDE with LINDDUN when the personal-data heuristic fires. The `compliance/gdpr-compliance-checker` is dispatched when the design processes European Union personal data per the `compliance/gdpr-compliance-checker` IF condition in CTO Chief.

### Step 7 — SPEC

**Failure mode**: the refinement loop converges falsely — both the integrator and the critic claim agreement after one round, but their notion of "agreement" is on the wording of the spec rather than on its underlying intent.

**Symptom**: the spec drifts from intent. Implementation builds what the spec literally says rather than what the user meant. This is the classic risk of literal-interpretation language models per CLAUDE.md.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 8 | Major rework when the divergence is caught at review; production incident when it is not. |
| Occurrence | 5 | Moderately low. The ten-round refinement loop with a six-dimension rubric (Completeness, Clarity, Edge Cases, Efficiency, Security, Observability) is robust against shallow convergence, but the rubric measures the spec, not the intent. |
| Detection | 6 | Low. The integrator-and-critic loop measures wording-level agreement; the user is the only entity that can detect intent-drift. |
| Action Priority | High | Severity eight with Occurrence five and Detection six. |

**Mitigation**: the integrator-and-critic loop SHOULD include a step where the user is shown a one-paragraph paraphrase of the spec's INTENT (not its wording) and asked to confirm. Until that explicit check exists, the user-facing Gate 2 is the backstop.

### Step 8 — TEST

**Failure mode**: the test-maker writes shallow tests — assertions on happy paths only, error paths uncovered, mocks that obscure the contract under test.

**Symptom**: Step 14 VERIFY shows coverage above eighty percent but the tests are not actually exercising the failure modes; production bugs slip through.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 7 | Moderate rework when caught at review; production incident when not. |
| Occurrence | 7 | Moderately high. Shallow tests are the most common test-quality failure mode in industry. |
| Detection | 5 | Moderate. The CLAUDE.md "No Silent Test Failures" checklist catches the egregious cases; subtle cases pass. |
| Action Priority | High | Severity seven with Occurrence seven plus moderate Detection. |

**Mitigation**: the test-maker MUST follow the CLAUDE.md "Test Quality Checklist" and the test-writer skills MUST emit at least one error-path assertion per public surface. Coverage above eighty percent is necessary, not sufficient.

### Step 9 — PREPARE

**Failure mode**: the environment used by the agents differs from the production environment in ways the agents cannot see (different libc version, different time zone, different file-system case sensitivity).

**Symptom**: tests pass locally and in continuous integration but fail in production, or vice versa.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 7 | Moderate rework. Environment debugging is time-consuming. |
| Occurrence | 5 | Moderately low. The Tier 3 scouts catch the common cases. |
| Detection | 6 | Low. Continuous integration usually matches production but not always. |
| Action Priority | Medium | Severity seven with Occurrence five and Detection six. |

**Mitigation**: the scout layer (`scouts/syntax-scout`, `scouts/secret-scout`, `scouts/dep-scout`, `scouts/lint-scout`, `scouts/test-scout`) runs in parallel. The cross-platform requirements in CLAUDE.md mandate `path.join`, `fs.promises`, `process.platform`, and `os.homedir`.

### Step 10 — IMPLEMENT

**Failure mode**: the implementer invents an Application Programming Interface surface — calls a method that does not exist on the underlying library, or uses a deprecated signature.

**Symptom**: runtime `AttributeError`, `NoMethodError`, `MissingMemberException`, or compile failure. When the failure is in a code path covered only at runtime (dynamic dispatch, optional feature), the bug ships.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 6 | Minor to moderate rework when caught at Step 11 self-review or Step 14 VERIFY; moderate when caught later. |
| Occurrence | 7 | Moderately high. Language-model implementers are documented to invent Application Programming Interface surfaces; this is the single most common failure mode across literature. |
| Detection | 3 | High. Static type-checking, linting, and the Step 11 self-reviewer catch the great majority. Tests catch the rest, provided the code path is exercised. |
| Action Priority | High | Severity six with Occurrence seven; the matrix elevates this row because the Occurrence is high enough to dominate. |

**Mitigation**: the implementer reads the actual library source or documentation before calling. The no-stub rule in CLAUDE.md prevents the implementer from leaving placeholders. The self-reviewer at Step 11 verifies Application Programming Interface surfaces against the cited references. Static type-checking at Step 14 catches typed languages.

### Step 11 — REVIEW

**Failure mode**: the self-reviewer rubber-stamps its own implementation — confirmation bias on the same prompt context.

**Symptom**: defects pass through Step 11 untouched and surface at Step 13, Step 14, or in production.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 6 | Moderate rework when caught later; production incident when not. |
| Occurrence | 6 | Moderate. Confirmation bias is inherent to single-agent self-review. The `independent_verification_validation` control reduces this to low when enabled. |
| Detection | 4 | Moderately high. Step 14's external-tool checks (lint, typecheck, tests, coverage) catch most issues regardless of the self-reviewer. |
| Action Priority | Medium | Severity six with Occurrence six and Detection four. |

**Mitigation**: when the active profile requires `independent_verification_validation`, the self-reviewer is replaced by an Independent Verification and Validation reviewer with a separate audit root. The refinement-loop critics at Step 7 SPEC provide the same diversity for the spec.

### Step 12 — OPTIMIZE

**Failure mode**: the optimizer introduces a subtle correctness regression while pursuing a performance improvement (caching with incorrect invalidation, parallelisation with a race condition).

**Symptom**: a previously-passing test fails after optimisation. Worse, the failure is intermittent because the race is timing-dependent.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 7 | Moderate to severe depending on the regression. |
| Occurrence | 4 | Low. The optimizer is conservative by default. |
| Detection | 4 | Moderately high. Step 14 re-runs all tests. The exception is intermittent races, which the test suite may not surface. |
| Action Priority | Medium | Severity seven with Occurrence four and Detection four. |

**Mitigation**: optimisation must not break tests. When the optimisation introduces concurrency, the `security/concurrency-checker` skill is dispatched. Performance gains that cost correctness are reverted.

### Step 13 — SECURE

**Failure mode**: the scout pre-screen returns pass but a real threat slipped through because the scout's coverage of a newer attack technique is incomplete.

**Symptom**: post-ship vulnerability discovered later by a security researcher, by a bug-bounty submission, or by an incident.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 9 | Severe customer impact, possible regulatory exposure under the active profile (Cyber Resilience Act incident clocks, DORA incident classification). |
| Occurrence | 4 | Low. The Tier 3 scout plus the threat-modeler at Step 6.5 plus the SAST scanner at Step 9 plus the dependency auditor at Step 9 catch the great majority. The remaining risk is novel techniques. |
| Detection | 5 | Moderate. The defence-in-depth catches most; novel techniques wait for catalogue updates. |
| Action Priority | High | Severity nine triggers High regardless. |

**Mitigation**: keep the scout's threat catalogue current. Subscribe to the MITRE ATT&CK and MITRE ATLAS release feed (per `security/threat-modeler`'s `atlas_version` pinning rule). Run the security-scanner skill at Step 9 with the latest rule pack.

### Step 14 — VERIFY

**Failure mode**: the test environment differs from the production environment in a way that makes the tests pass locally and in continuous integration but fail in production.

**Symptom**: green local, red production. Time-zone bugs, locale bugs, encoding bugs, and dependency-version bugs are the canonical examples.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 8 | Major rework. The bug ships before it is caught. |
| Occurrence | 5 | Moderately low. The cross-platform requirements catch most. |
| Detection | 6 | Low. The continuous-integration runner is not always faithful to production. |
| Action Priority | High | Severity eight with Occurrence five and Detection six. |

**Mitigation**: the cross-platform rules in CLAUDE.md are non-negotiable. When the active profile requires `hil_test_ladder`, the Hardware-Processor-Software-Model-in-the-Loop ladder runs at Step 14.

### Step 15 — DOCUMENT

**Failure mode**: the documenter generates documentation from the code's current behaviour rather than from the user-facing intent, masking subtle deviations from the original specification.

**Symptom**: the documentation describes what the code does rather than what it should do. Users misuse the feature; the bug is invisible because the documentation rationalises it.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 5 | Customer-visible defect that customer notices when they hit the wrong behaviour. |
| Occurrence | 5 | Moderately low. Most documentation generators are intent-aware. |
| Detection | 6 | Low. The documenter is not cross-checked against the spec. |
| Action Priority | Medium | Severity five with moderate scores across the board. |

**Mitigation**: the documenter MUST cite the spec section that each documentation paragraph implements. Documentation that has no spec citation is flagged for review.

### Step 16 — FINAL-REVIEW (Gate 3)

**Failure mode**: the final reviewer signs off on the basis of a passing test suite without inspecting whether the test suite measures the right things.

**Symptom**: a passing build ships a wrong product. The user accepts at Gate 3 only because the dashboard says everything is green.

| Dimension | Score | Rationale |
|---|---|---|
| Severity | 9 | The full cost of mis-shipped functionality. |
| Occurrence | 3 | Very low. The fourteen quality dimensions plus the four-eyes Gate 3 control (when active) plus the human gate make this rare. |
| Detection | 4 | Moderately high. The dashboard surfaces the gap when it exists. |
| Action Priority | High | Severity nine triggers High regardless. |

**Mitigation**: CTO Chief is the final approver before Gate 3 per the CLAUDE.md architecture. CTO Chief verifies the fourteen quality dimensions AND the human-approval marker AND the production-readiness gate (when SaaS template is active). When the active profile requires `four_eyes_gate3`, two distinct approvers are required.

## Review cadence

The Process Failure Modes and Effects Analysis itself is reviewed:

- Quarterly by the user (the human Chief Technology Officer commanding CTOC) under the `capa_register` control, with score updates based on observed incidents.
- On every Iron Loop change (a new step, a removed step, a changed agent) — the affected row is re-scored before the change merges.
- On every new regulatory profile (a new control catalogue entry) — the rows it touches are re-scored.
- On every Eight Disciplines incident (per `eight_d_incident_template`) — the row that corresponds to the failed step is re-scored.

The table is the living surface; it is checked into the repository at `docs/PROCESS_FMEA.md`. Changes are reviewed via pull request. The next quarterly review date is recorded in `.ctoc/capa-register.yaml` under `pfmea_review_due`.

## References

- Automotive Industry Action Group and Verband der Automobilindustrie, *FMEA Handbook* (first edition 2019, 2026 maintenance release) — the canonical reference for the Action Priority replacement of the Risk Priority Number. See https://www.aiag.org/quality/automotive-core-tools/fmea.
- Quality-One International, "Process FMEA (PFMEA)" — practitioner overview with the 2024 / 2026 worked examples. See https://quality-one.com/process-fmea-pfmea/.
- International Electrotechnical Commission, IEC 60812:2018 *Failure modes and effects analysis (FMEA and FMECA)* — international standard parallel to the Automotive Industry Action Group / Verband der Automobilindustrie handbook. See https://webstore.iec.ch/publication/26359.
- W. Edwards Deming, *Out of the Crisis* — the System of Profound Knowledge background that motivates Process Failure Modes and Effects Analysis in any production line, software or otherwise.
