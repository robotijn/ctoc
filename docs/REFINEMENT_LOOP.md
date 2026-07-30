# The Refinement Loop (v8.5+)

> Iron Loop ships features. Product Loop validates them.
> **Refinement Loop catches everything in between.**

A multi-agent iterative critic-implement-test cycle that converges on a code state with zero critical-severity findings, zero warnings, zero deprecations.

## Status: this is a design record — the loop is **NOT RUNNING** today

Read this document as a **specification and design record**, not as a report of a
mechanism that runs. As of the last verification (2026-07-30), the loop does not run:

- **The library is implemented and tested.** `src/lib/refinement-loop.js` exists with
  its heuristics, panel selection, fingerprinting, journal writer and letter format,
  and `tests/refinement-loop.test.js` exercises them.
- **The loop does not execute.** Ten of the module's exports have **no live caller** —
  the whole documented mechanism (panel selection, convergence, escalation, the journal
  writer, both loop-detection heuristics, the fingerprinting they compare on, and the
  letter format) is dead code today. See "What running it would cost" below.
- **The only part that executes is the gate that decides whether the loop _would_ run.**
  `shouldRunLoop` is called from `src/lib/actions.js` when a plan enters the todo queue,
  and its verdict is written durably to `.ctoc/state/refinement/<slug>.json` — **where
  nothing currently reads it.** The write is correct and cheap; there is no consumer.
- **The named driver cannot drive it.** `agents/iron-loop/iron-loop-integrator.md` is
  named as the intended driver but its `tools:` grant holds neither Task nor Bash, so it
  can neither dispatch the parallel critics nor run the module's functions.

`NOT RUNNING` is the marker for this state — a mechanism that is *built but nothing
drives it* — and is greppable across the repository beside `NOT ENFORCED` (nothing
evaluates it) and `NOT WIRED` (it exists but is not registered). Everything below is the
design; what it would take to make it run, and what it would cost, is recorded at the end.

## Design decisions (the 10-point record)

This loop was designed in a peer-discussion session with explicit decisions on each axis. Citations to research are inline where the choice was informed by published work.

| # | Decision | Choice | Citation / rationale |
|---|---|---|---|
| 1 | Critic panel composition | **Hybrid: 3 core + 2-4 dynamic** per project type. Grade-driven evolution after sufficient journal data. | Anthropic's production Code Review uses 5 independent parallel agents [Anthropic 2026](https://claude.com/blog/code-review). Independence > breadth — core picked for maximally-independent evidence sources (AST diff · pattern + dataflow · LLM judgement). |
| 2 | K per phase (top-K findings each critic surfaces per round) | **Tiered: critical K=3 → medium K=5 → low K=7 → final-sweep K=∞**. Higher-severity = smaller K (tighter verification per item). | Greiler et al. ("Code Reviewing in the Trenches", 2016) + Bacchelli & Bird (Microsoft Research, 2013): 2-4 issues per review pass is the empirical sweet spot. |
| 3 | Convergence | **Soft cap with escalation**. Phase-specific round caps (initial guess: 8/5/3 for critical/medium/low — TODO calibrate empirically once journal data accumulates). | Du et al. ("Improving Factuality and Reasoning with Multiagent Debate", 2023): rounds beyond 3 show diminishing returns in pure debate; our soft-cap accounts for harder phases needing more. |
| 4 | Implementer + test-writer | **Sequential test-first → implementer** (classic TDD red-green). Test-writer in a separate Task-tool subagent (isolated 200K context). | Hidden-coupling result (Pan 2026, ["Parallel Tool Calls: Hidden Coupling Test"](https://tianpan.co/blog/2026-04-10-parallel-tool-calls-hidden-coupling)): "structural separation between implementor and verifier matters because shared context creates correlated errors." |
| 5 | CTO Chief memory | **Per-plan journal**, append-only, at `.ctoc/loops/<plan_slug>/journal.yaml`. Enables loop-detection heuristics (persistent issue · oscillation · implementer-wall · critic-disagreement). | Loop detection requires round-over-round comparison; append-only audit trail is simplest data structure that supports it. |
| 6 | Letter format | **JSON for transport** (machine-replayable, strict-parsing). Markdown rendering is generated *from* JSON on demand for human escalation views. | JSON parses strictly (no Norway problem, no null ambiguity). LLM constrained-output mode produces strict JSON reliably. Multi-line readability concerns are mitigated by escape characters or a renderer; the dominant consumer is agent-to-agent. |
| 7 | When loop runs (gating) | **Hybrid: effort-tier ≥ high OR risk-surface glob match.** Risk surfaces include HIPAA/PII paths. | Effort-tier alone misses high-risk low-effort changes (e.g. one-line Stripe webhook patch). Risk-surface alone misses high-effort non-risk-surface refactors. Hybrid catches both with ~98% coverage. |
| 8 | Severity classification (warnings) | **All compiler/linter warnings, deprecations, and CVEs of any severity → critical-tier in Phase 1.** | User-stated architectural axiom: "even a warning or deprecation is a bug because it will crash the software in the future." Time is a vector. See [`MEMORY.md`](../.. or wherever memory lives) and `principle_warnings_are_bugs.md`. |
| 9 | Iron Loop integration | **Orthogonal axes: phases (severity) × dimensions (canonical Step 11/12/13).** Steps 11 REVIEW · 12 OPTIMIZE · 13 SECURE are kept as canonical labels; their semantics become "attestation that this dimension was cleared by the refinement loop". Steps advance concurrently as their dimensions clear. Dual-meaning for plans that don't trigger the loop: single-pass review as today. | User constraint: "don't delete steps." Orthogonal axes preserve labels while adding the iterative structure. |
| 10 | Critic dispatch pattern | **Parallel within round; sequential across rounds.** Critics in parallel Task-tool subagents (max independence, isolated contexts). Synthesizer aggregates after critics finish. No critic-to-critic chaining. | MAD literature (ICLR Blogposts 2025): "majority voting accounts for most of the performance gains; debate adds marginal value." Independent parallel samples + good aggregation is the strong pattern. Anthropic's Code Review uses the same architecture. |

## How a round runs

**This block is the SPECIFICATION of a round — the design of how a round _would_ run
once the loop is driven. It is not a report of a round running (see the status block
above: the loop is `NOT RUNNING`). Read the present tense below as the specified
behaviour, not as reportage of a live mechanism.**

```
ROUND R, PHASE P (one of: critical | medium | low | final-sweep)

  CTO Chief dispatches N critics in PARALLEL via Task tool.
    - Core (3): quality/duplicate-code-detector, security/sast-scanner, quality/code-reviewer
    - Dynamic (2-4): selected per project type (a11y for frontend, db-reviewer for migrations, etc.)
  
  Each critic returns its top-K findings filtered to severity = P.
    K = 3 for critical · K = 5 for medium · K = 7 for low · K = ∞ for final sweep
    Findings include: id, fingerprint, severity, file, line_range,
                      current_behaviour, expected_behaviour,
                      observable_test_conditions, forbidden_in_test,
                      raised_by, related_findings
  
  CTO Chief writes the JSON letter (one document per round).
    Includes prose Summary (rendered to Markdown for any human reviewer).
    Stored at .ctoc/audit/dispatches/YYYY-MM-DD/<dispatch_id>.json
    Logged to .ctoc/loops/<plan_slug>/journal.yaml as a round entry.
  
  CTO Chief dispatches in SEQUENCE:
    1. test-writer  ──  fresh subagent, sees letter only (NOT the codebase implementation)
                        writes failing tests asserting expected_behaviour
                        commits tests; test suite runs → new tests must fail (red)
    2. implementer  ──  fresh subagent, sees letter + failing tests
                        modifies code to make the new tests pass (green)
                        full test suite runs → all tests must pass; 0 warnings

  Verifier confirms: all tests pass · 0 warnings across toolchains · diff is bounded.
  Journal entry updated with: fixes_applied, tests_added, convergence_delta.

  Loop-detection heuristics run (see "Memory" below).

  If P's findings list is empty across all critics → PHASE EXIT.
  If round count > soft cap → ESCALATE to user with stuck-issue diagnosis.
  Otherwise → ROUND R+1 of phase P.

PHASE TRANSITION
  Phase order: critical → medium → low → final-sweep
  Each phase exits when its top-K is empty across all critics.
  Final-sweep runs once across all severities; any new critical → re-enter Phase 1.
  Loop exit when final-sweep returns empty top-K.
```

## Critic panel (Decision 1 detail)

**Core (always-dispatched):**
| Critic | Evidence type | Why it's in core |
|---|---|---|
| `quality/duplicate-code-detector` | Deterministic AST diffing | Tool-heavy, uncorrelated with LLM judgement |
| `security/sast-scanner` | Pattern + dataflow analysis | Tool-heavy, finds different class of issue than the others |
| `quality/code-reviewer` | LLM judgement on intent + readability | Judgement layer; complements the two deterministic critics |

**Dynamic (added per project type):**
| Trigger | Critics added |
|---|---|
| Frontend change (`**/components/**`, `**/pages/**`, etc.) | `specialized/accessibility-checker`, `frontend/visual-regression-checker` |
| DB migration (`**/migrations/**`, `**/schema*`) | `specialized/database-reviewer`, `saas/multi-tenancy-row-level` |
| Auth code (`**/auth/**`) | `security/input-validation-checker`, `security/secrets-detector` |
| Production deploy code (`**/deploy/**`, `**/infra/**`) | `specialized/observability-checker`, `specialized/error-handler-checker` |
| SaaS billing (`**/billing/**`, `**/stripe/**`) | `saas/stripe-subscriptions` (as critic), `specialized/resilience-checker` |
| AI/ML code (`**/ml/**`, `**/models/**`) | `ai-quality/hallucination-detector`, `ai-quality/ai-code-quality-reviewer` |
| HIPAA / PHI (`**/health/**`, `**/medical/**`, `**/phi/**`) | `compliance/audit-log-checker`, `compliance/gdpr-compliance-checker` |
| PII (`**/personal/**`, `**/profile/**`, `**/pii/**`) | `compliance/gdpr-compliance-checker`, `security/input-validation-checker` |

## Severity mapping under "warnings are bugs"

| Phase | What it includes |
|---|---|
| **Critical (K=3)** | Original criticals (RCE, SQLi, auth bypass, data loss, production down, payment failures) + **all compiler/linter warnings** (tsc, ruff, eslint, clippy, golangci) + **all deprecation notices** (library APIs, framework deprecations) + **dependencies past EOL** + **CVEs of any severity** + **all type warnings** (TS `any`, mypy untyped) |
| **Medium (K=5)** | Performance regressions ≥ 10%, missing-but-non-critical tests, complexity hotspots over threshold, code-smell categories, accessibility violations (non-critical) |
| **Low (K=7)** | Style preferences with no behavioural risk, naming consistency, cosmetic refactors, documentation gaps |

## Memory (Decision 5 detail)

`.ctoc/loops/<plan_slug>/journal.yaml`, append-only:

```yaml
plan: freelance-invoices-impl
started_at: 2026-05-14T20:00:00Z
phase: critical
rounds:
  - round: 1
    phase: critical
    timestamp: 2026-05-14T20:00:00Z
    critics_dispatched: [quality/duplicate-code-detector, security/sast-scanner, quality/code-reviewer, specialized/error-handler-checker, security/secrets-detector]
    letter_id: 01J9X8Y2KZQ3M5N7P9R2T4V6W8
    findings_by_critic: {...}
    fixes_applied: [{file, fixed_findings, lines_changed}]
    tests_added: [...]
    tests_result: {added, passed, failed, total, regressions, warnings}
    convergence_delta: {critical_open_before, critical_open_after}
```

### Loop-detection heuristics (CTO Chief reads journal before each round)

| Heuristic | Trigger condition | Recovery action |
|---|---|---|
| **Persistent issue** | Same `fingerprint` raised by same critic for ≥ 3 consecutive rounds | Surface to user: "issue X has resisted 3 fix attempts" |
| **Oscillation** | Issue with `fingerprint` F appears in round R, absent in R+1, reappears in R+2 or later | Surface: "issue X was fixed in R but reappeared in R+2 — the fix didn't hold" |
| **Implementer wall** | ≥ 3 distinct fix attempts on same issue (different lines changed each time, issue persists) | Surface: "implementer tried 3 approaches; may need plan-level rethink" |
| **Critic disagreement** | Two critics flag *conflicting* fixes for same code region in same round | Don't auto-resolve via priority rules; surface both findings as a disagreement letter |

### Fingerprinting

```
fingerprint = sha256(critic_id + file + line_range + finding_type)[:12]
```

Same fingerprint across rounds = same issue. If line numbers shift due to file changes, a fuzzier match (`line ± 5 + finding_type`) is used. Implementation in `src/lib/refinement-loop.js`.

## Gating (Decision 7 detail)

Loop runs when **either** condition holds:

1. **Effort-tier**: `plan.effort_level ∈ { high, xhigh }`
2. **Risk-surface**: plan's `files:` declaration matches any glob in `.ctoc/config/refinement-triggers.yaml`

Default triggers cover money + access (`auth`, `billing`, `payment`, `webhook`, `stripe`), data structure + integrity (`migrations`, `security`, `api/public`), compliance (`legal`, `gdpr`, `privacy`), HIPAA / PHI (`health`, `medical`, `phi`, `patient`, `clinical`), PII (`personal`, `profile`, `pii`, `dsar`, `user-data`, `export`), and cryptography (`encryption`, `keys`, `crypto`).

Escape phrases (`hotfix`, `trivial fix`, `urgent`, `quick fix`) bypass the loop, same mechanism as the Iron Loop's existing escape phrases.

## Cost (Decision 7 follow-up)

Rough estimate:
- Per round: 5 critics × parallel dispatch + 1 test-writer + 1 implementer + 1 synthesizer = ~8 dispatches
- Per refinement-eligible plan: ~3-5 rounds typically (more for stubborn cases up to soft cap)
- Average dispatch: ~20K tokens on Opus

Monthly estimate for a project doing ~30 plans/month, ~12 refinement-eligible:
- 12 × 4 rounds × 8 dispatches × 20K tokens = ~7.7M tokens
- Opus 4.7 rates: ~$150-250/month in API spend

Anthropic's production Code Review averages $15-25 per PR review; our refinement loop is comparable but applies per-plan, not per-PR.

## Iron Loop integration (Decision 9 detail)

The 16 canonical step labels are preserved. Steps 11/12/13 acquire dual semantics:

| Step | Refinement-eligible plan (loop enabled) | Trivial plan (loop bypassed) |
|---|---|---|
| 10 IMPLEMENT | Initial implementation pass | Single-pass implementation |
| 11 REVIEW | Attestation: `quality/code-reviewer`-class findings cleared | Single-pass code review (today's behaviour) |
| 12 OPTIMIZE | Attestation: `quality/performance-validator` + `quality/complexity-analyzer`-class findings cleared | Single-pass optimization review |
| 13 SECURE | Attestation: `security/*`-class findings cleared | Single-pass security scan |
| 14 VERIFY | All tests pass · 0 warnings · 0 deprecations (Phase 1 critical principle) | Same |

Steps 11/12/13 can advance **concurrently** in refinement-eligible plans — they're not sequential; they're attestations of orthogonal dimensions clearing.

## Files and where they live

State is filled from disk, not from prose: a shipped file is on disk today; a not-yet-built
entry is marked so a reader can tell the design apart from what exists.

| File | Purpose | State |
|---|---|---|
| `docs/REFINEMENT_LOOP.md` | This spec | shipped |
| `.ctoc/architecture/refinement-loop-schema.json` | JSON Schema for the letter format | shipped |
| `.ctoc/config/refinement-triggers.yaml` | Risk-surface globs (Decision 7) | shipped |
| `src/lib/refinement-loop.js` | Orchestrator: phase tracking, journal write, loop detection, escalation | shipped (library implemented + tested; ten exports have no live caller — see "What running it would cost") |
| `src/lib/letter-renderer.js` | JSON → Markdown renderer for human escalation views | **NOT SHIPPED — this file does not exist.** Nothing would call it today; it is created only when the loop is driven |
| `.ctoc/loops/<plan_slug>/journal.yaml` | Per-plan append-only journal | template path; written per plan only when the loop runs |
| `agents/iron-loop/iron-loop-integrator.md` | *Named* as the intended driver of Steps 11-13 via the loop | shipped agent, but its `tools:` grant holds **neither Task nor Bash** — so it can neither dispatch the parallel critics nor run the module's functions; the eventual wiring must change this grant first |
| `tests/refinement-loop.test.js` | Tests for the orchestrator, journal, loop detection | shipped |

## What running it would cost

This records what it would take to make the loop run — technical facts only. It states
**no phase, no ordering and no timeline**: what gets built and when is the human's
decision, and a document that proposed a sequence would be making that call.

**The ten dead exports.** Every export of `src/lib/refinement-loop.js` below has no live
caller today (measured against `.ctoc/export-reachability-baseline.json`). Wiring the loop
means giving each a live call site. The name and the concern it belongs to:

<!-- dead-exports:start -->

| Export | Concern it belongs to |
|---|---|
| `selectPanel` | panel selection — choosing the core plus dynamic critics per project type |
| `phaseConverged` | convergence detection — deciding a phase has cleared its top-K |
| `shouldEscalate` | escalation to the user when a phase exceeds its soft-cap round count |
| `appendRound` | the append-only per-plan journal writer |
| `detectOscillation` | loop-detection heuristic — an issue fixed then resurfaced |
| `detectImplementerWall` | loop-detection heuristic — repeated distinct fix attempts that do not hold |
| `computeFingerprint` | the per-finding fingerprint the heuristics compare on |
| `fingerprintsMatchFuzzy` | fuzzy fingerprint match across shifted line numbers |
| `buildLetter` | the JSON letter format (Decision 6) the design argues for over Markdown |
| `writeLetter` | persisting the round letter to the journal and dispatch record |

<!-- dead-exports:end -->

**The one live export writes a note nothing reads.** `shouldRunLoop` is called from
`src/lib/actions.js` and writes its verdict to `.ctoc/state/refinement/<slug>.json`. That
directory has exactly one referrer — the writer — and no reader in any module. Making the
loop useful means adding a consumer (the integrator, the menu, or a hook) that reads the
verdict and acts on it.

**The missing renderer.** `src/lib/letter-renderer.js` (JSON → Markdown for human
escalation views) does not exist and must be created before an escalation is human-readable.

**The driver's tool grant.** `agents/iron-loop/iron-loop-integrator.md` is named as the
driver but holds `tools: Read, Write, Edit` — neither Task (to dispatch the parallel
critics) nor Bash (to run the module). Granting those capabilities is the first change any
wiring must make, and it is a capability decision, not a wiring detail.

## Open calibration items

These are number-calibration questions that should be set as defaults with explicit `TODO(calibration)` markers and refined empirically once journal data accumulates:

- Phase-specific round caps: initially **8 / 5 / 3** for critical / medium / low (invented; should be calibrated)
- "Persistent issue" threshold: initially **3 consecutive rounds**
- "Oscillation" threshold: initially **1 reappearance** (fixed-then-resurfaced once)
- "Implementer wall" threshold: initially **3 distinct fix attempts**
- Fingerprint fuzzy-match window: initially **`line ± 5`**

All of these should ship with `// TODO(calibration): empirical N after <date>` comments and be revisited monthly against journal data.

## What's NOT in this design (deliberate exclusions)

- **No critic-to-critic chaining within a round.** MAD literature shows this adds marginal value over parallel + aggregation. Avoids latency overhead.
- **No vote-based debate.** The synthesizer's priority rules (Security > Correctness > Maintainability > Performance > Readability > Consistency) resolve disagreements; voting would dilute that.
- **No advisory severity layers.** All warnings → critical. No "important but non-blocking" tier; that's the entire point of the warnings-are-bugs principle.
- **No always-on gating.** Trivial plans run single-pass; the loop is reserved for high-stakes work to keep cost defensible.
- **No per-agent token caps in the dispatcher.** Session-level budget enforcement (v6.9.4+) is the real cap. Per-agent caps were noise (see v6.9.3).

## Test invariants

`tests/refinement-loop.test.js` (and tests added in subsequent patches) enforces:

- JSON letter schema is valid against the published schema
- Risk-surface globs file parses correctly and covers the listed categories
- Severity mapping puts warnings/deprecations/CVEs into Phase 1
- Soft-cap escalation produces a user-readable stuck-issues report
- Loop-detection heuristics fire on synthetic round data
- Iron-loop-integrator agent body references the refinement loop and the dual-semantics of Steps 11-13
