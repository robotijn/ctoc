# Handoff — CTOC adversarial repair loop (Tijn: "fix them all, 50 rounds of hard critique")

<!-- Maintained by the handoff skill. Last-known state — verify against the repo before acting. -->

- Updated: 2026-07-16 by claude
- Branch: main
- Status: in progress — FRESH 50-round campaign (Tijn re-issued the order 2026-07-16 as
  a NEW round of improvement, not the old standing order). ~13 rounds done, 7 waves
  committed + pushed (v6.12.57 → v6.12.63), 46 real defects fixed. Convergence (3
  consecutive different-lens clean rounds) NOT reached — every fleet still finds real
  HIGH/CRITICAL defects. v6.12.63 (b0ac2fe) wave 6 shipped 10 fixes incl. 3 HIGH:
  regulatory-regime stray-Z (whole regime silently off when it is the last settings
  block), legal-hold status matcher fail-open (delete during a live hold),
  traceability-matrix non-atomic save; + irac/data-lineage/ai-provenance/version MED,
  privilege/cache/plan-coverage-glob LOW. Wave-5 re-attack cleared 5/6 fixes clean.

## The order (verbatim)
"fix them all, do 50 rounds of hard critique, keep fixing the code, use ctoc agents every
2 rounds for feedback and implementation, look at the code do not guess from memory, eat
your own dog food."

## Method (working well — keep it)
Each round: dispatch a fleet of 5 CTOC `ctoc:quality:code-reviewer` critics in parallel,
each a DISTINCT lens on a DISJOINT module cluster, EACH REQUIRED to verify every finding
against disk BY EXECUTION (a node -e / spawned-hook repro) before reporting — confirmed-only,
no edits. Then dispatch CTOC `iron-loop:iron-loop-executor` agents on FILE-DISJOINT slices
(TDD-Red first; invert any false-green test per Lesson 14). Coordinator (me) re-executes
each load-bearing claim BY HAND, integrates at ONE boundary (full `npm test` gate + eslint +
typecheck), commits (patch bump + release.js), pushes. Concurrency cap 5 subagents. Ship
gate (push) is the human's — but Tijn said "commit push", so pushing each green wave.

## Shipped (all pushed to origin/main, gate green 99.38%)
- v6.12.57 (77a2109): R1 — product-loop KPI parser (`$` under /m captured only the first
  body line; every KPI field but name was null; getApplicableKPIs never filtered).
- v6.12.58 (3ca6f1f): wave 1, 7 defects incl. 2 CRITICAL — sast-runner fail-open (crashed
  scanner = clean pass), PreToolUse.Bash ledger-forgery cd-bypass (`cd .ctoc && cp f
  approvals/x`), task-reconcile staleness-orphan permanent-fail, tool-detector readdir
  crash, coverage-map NaN fail-open, plan-validator Gate-3 body-marker no-op, deployment win32.
- v6.12.59 (65150da): wave 2, 4 defects + docs — audit-chain wipe-evidence (`&& count>0`
  disabled reconciliation on empty log), tui ANSI gate-forge (unstripped plan name to
  terminal), actions un-keyable-slug gate flip-flop (marker-only crossing, no ledger entry),
  store.js non-finite load; + CLAUDE.md truth (false label-enforcement claim; 99-vs-100 count).
- v6.12.60 (7db104e): wave 3, 9 fixes incl. 2 CRITICAL + 3 HIGH — step-13-verify two
  false-PASSes (failure swallowed via output string-match; Node-native coverage unparsed →
  floor unenforced), guard-files secret-guard bypass (exit 1 non-blocking → emitDeny),
  plan-index dimension-wipe (single write wipes whole index on 384<->768) + stale-section,
  compliance-dedup drops GDPR articles, escape-phrases filename-mention disables enforcement,
  ollama body-read hang, compliance-regime block-YAML corruption, + test-gate coverage-parse
  first-match hijack (now last-match).

## Surfaced FORKS (Tijn's call — do NOT self-pick; documented, not baked)
1. duplicate-guard threshold: compares RRF fused score (max ~0.033) vs a cosine-scale 0.85
   default → duplicate guard NEVER fires. Fix = choose retrieval semantics (threshold raw
   cosine vs rescale RRF vs RRF-scale default). Recommend: threshold raw cosine.
2. scheduler sync-barrier under UNCONFIRMED death: a wave-integration barrier treats a
   staleness-orphaned (maybe-alive) member as settled → integration may start against a tree
   a live agent is still editing. Direction clear (don't settle on unconfirmed death) but it
   trades a stall risk vs a corruption risk — Tijn picks the default.
3. Wire `validate-plan-steps.js` as a REAL runtime hook so wrong step LABELS are actually
   rejected (today it's an unwired standalone script; I corrected the doc to stop claiming it
   is wired). Wiring changes hook/gate behavior → Tijn's call.
Plus a note (not a fork): the OLD 2026-07-14 continuation batch is still "active" (38/50) in
.ctoc — bounded + fail-open, harmless, but stale; the Stop hook may block a stop against it.

## Ledger (full round-by-round detail)
Scratch: /private/tmp/claude-501/.../scratchpad/repair-loop-ledger.md (this session's).

## Shipped waves 4-5 (after the first 3)
- v6.12.61 (0bd9dde): wave 4, 8 fixes — move-plan overwrite data-loss (HIGH), vision
  completeVision no-ledger revert (HIGH), vision createStub slug-collision (HIGH),
  menu-screens live-grenade Approve (HIGH), vision parseCanvas stray-Z (MED),
  v8-dispatcher total_med phantom key (MED); + RE-ATTACK found escape-phrases
  dot-extension hole (HIGH), Bash isLedgerWrite branch-a unbounded (MED).
- v6.12.62 (a0e2fe1): wave 5, 7 fixes — four-eyes segregation-of-duties fail-open
  (CRITICAL), transition-log override dropped from audit (CRITICAL), Bash ~cd
  ledger-forgery bypass (HIGH), plan-coverage ../ out-of-repo write (HIGH),
  approval-ledger non-atomic persistEntry (MED), escape-phrases multi-punct (MED),
  quality-state unguarded RMW (LOW).

## STILL-UNAUDITED load-bearing modules (mapped by the completeness sweep — NEXT TARGETS)
Mostly EU-compliance/legal-program files: ai-provenance, app-runner, background, cache,
cvss, data-lineage, dependency-auditor, durable-log, enforcement-log, eu-ai-act-agent-runner,
gdpr-agent-runner, irac-schema, iron-loop-compliance-trigger, legal-hold, operating-manual,
claude-md-lessons, plan-index/index, playwright-scaffolder, privilege-posture, project-root,
proportionality, regulatory-regime, retention, sections, spoliation-safe, sync, tabs,
task-view, traceability-matrix, version.
AUDITED-CLEAN this session: violation-tracker, state-manager, stale-cleanup, refinement-loop,
budget, comparator-agent, ctoc-project-detector, eval-harness, calibration, settings,
frontmatter, task-registry, continuation, safe-fs, release.js, ledger-backfill, post-commit,
hooks-installer, crypto, hash-utils.

## Resume here
Fresh fleet on the STILL-UNAUDITED compliance/legal core (regulatory-regime, retention,
legal-hold, spoliation-safe, privilege-posture, proportionality, data-lineage, ai-provenance,
durable-log, traceability-matrix, cvss, irac-schema) + the runners (eu-ai-act-agent-runner,
gdpr-agent-runner, iron-loop-compliance-trigger, app-runner) PLUS a RE-ATTACK of wave-5 fixes.
Same defect classes: fail-open vs fail-closed, parse regex (first-match/stray-literal/CRLF/
NaN/$-under-m), gate reached without a ledger entry, >=/> boundary, silent overwrite,
accumulator-to-wrong-field, non-atomic state write. Verify every finding against disk first.
One boundary: full npm test gate + eslint; commit patch bump; push (Tijn said "commit push").
NOTE: adding N new test files requires bumping the "N test files" counts in CLAUDE.md
(lines ~205, ~267) or tests/doc-counts.test.js fails. Done at 3 consecutive different-lens
clean rounds — NOT there yet.
