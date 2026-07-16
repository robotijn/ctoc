# Handoff — CTOC adversarial repair loop (Tijn: "fix them all, 50 rounds of hard critique")

<!-- Maintained by the handoff skill. Last-known state — verify against the repo before acting. -->

- Updated: 2026-07-16 by claude
- Branch: main
- Status: in progress — FRESH 50-round campaign (Tijn re-issued the order 2026-07-16 as
  a NEW round of improvement, not the old standing order). ~7 rounds done, 3 waves
  committed + pushed. Convergence (3 consecutive different-lens clean rounds) NOT reached —
  every fleet so far has found real defects.

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

## Resume here
Continue the loop: next fleet on lenses/modules NOT yet attacked — v8-dispatcher /
capability-registry / operating-manual (orchestration), the release/git scripts
(release.js / move-plan.js / ledger-backfill.js / post-commit.js / hooks-installer.js),
budget / quality-state / eval-harness, vision-decomposer, AND a RE-ATTACK lens on THIS
session's 21 fixes (did any over-narrow and break a legit path, or leave an adjacent hole?).
Verify every finding against disk first. Integrate at one boundary; commit patch bump; push
(Tijn said "commit push"). Loop is done at 3 consecutive different-lens rounds with zero
confirmed defects — NOT there yet.
