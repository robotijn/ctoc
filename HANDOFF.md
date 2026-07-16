# Handoff — CTOC adversarial repair loop (Tijn: "fix them all, 50 rounds of hard critique")

<!-- Maintained by the handoff skill. Last-known state — verify against the repo before acting. -->

- Updated: 2026-07-16 by claude
- Branch: main
- Status: in progress — FRESH 50-round campaign (Tijn re-issued the order 2026-07-16 as
  a NEW round of improvement, not the old standing order). ~19 rounds done, 11 waves
  committed + pushed (v6.12.57 → v6.12.67), 80 real defects fixed. Convergence (3
  consecutive different-lens clean rounds) NOT reached — but the lenses are narrowing
  (wave-10 cross-platform lens was the FIRST fully-clean lens; slug-provenance had only
  1 LOW oracle). LATEST TWO WAVES:
  v6.12.66 (d975fbc) wave 9 — 9 fixes incl. 2 CRITICAL (secrets-scanner isInComment
  dropped a real secret when the line merely contained /*, now position-aware block-
  comment span; PreToolUse.Bash cd --/-L/-P/-@ option-token captured as the cd target,
  bypassing the ledger-forgery gate) + 1 HIGH RCE (quality-agent execSync interpolated
  coverage-map test paths -> execFileSync argv) + 1 HIGH concurrency (audit-chain
  appendDispatch no lock + 2 non-atomic writes -> O_EXCL chain lock + log-tail-derived
  self-healing head) + quality-state O_EXCL lock, actions/traceability atomic writes,
  test-gate unanchored-coverage+NaN, hooks-installer foreign-hook deletion.
  v6.12.67 (0831eb0) wave 10 — 6 fixes incl. 1 CRITICAL (dependency-auditor swallowed
  empty-stdout scanner failure -> false-clean CVE verdict; _recordScannerFailure +
  honest run() + maxBuffer + _hasNativeLockfile) + the RRF->cosine index fix (TIJN
  APPROVED option B 2026-07-16: duplicate-guard + related() fallback now read true
  cosine from store.search, not RRF, so the 0.85/0.78 thresholds work again — the
  duplicate guard was a silent no-op on every default install) + quality-gate
  numericOrFail (non-numeric metric passed every dimension but coverage) + validate-
  plan-steps fence/region/heading scoping + actions.js planDependsOn + product-loop
  slug/date guards (LOW traversal).
  v6.12.68 (f40eb26) wave 11 — 12 fixes incl. 3 HIGH: secrets-scanner block-comment span
  treated /* inside a string/glob/URL as a comment (SELF-REGRESSION of wave 9, dropped real
  secrets) -> string-literal-aware scan; PreToolUse.Bash quoted "--" bypassed the cd option-
  skip (SELF-REGRESSION of wave 9) -> dequote-first; verify-store forgery (.ctoc/state/verify
  was agent-writable so Gate-3 VERIFY evidence was forgeable) -> extended the edit-hook deny
  carve-out to it. + 6 MED: audit-chain chainHeadFromLog threw on a truncated tail line
  (SELF-REGRESSION of wave 9, bricked all appends) -> backward-scan + heal; quality-state
  O_EXCL 0-byte window let a concurrent acquirer steal a live lock (SELF-REGRESSION of wave 9)
  -> retry+grace; circuit-breaker counter reset by prepended approval block -> read max across
  all blocks; SIP1 residency exemption didn't require a ledgered parent -> now does; task-
  reconcile one-pass quarantine handed a live orphan's files to a sibling -> persistent
  quarantine; plan-index store query finiteness guard. + 3 LOW: settings in->hasOwnProperty +
  __proto__ guard; duplicate-guard non-finite-threshold re-default. FOUR of these were
  regressions the re-attack lens caught in this session's own wave-9 fixes (its 4th straight
  high-yield round). Three fleet-11 lenses reported their CORE invariant SOUND (settings
  precedence + no-profile-weakens-a-gate; vector math; continuation/stop machinery) — a real
  convergence signal on those axes; defects were in adjacent legs. Next: continue fleets
  (re-attack wave 11 + compliance/legal, human-facing menu/dashboard, test-quality meta lenses)
  toward the 3-clean-rounds convergence. STILL OPEN (Tijn's, not mine): the
  ledger-backfill forgery (option C, Tijn-decided) — its own Iron Loop plan spanning
  approval-ledger + human-gate-check + a human-confirmation path, through Tijn's Gate 2.
  --- earlier waves (unchanged history) below ---
  v6.12.63 (b0ac2fe) wave 6 shipped 10 fixes incl. 3 HIGH:
  regulatory-regime stray-Z (whole regime silently off when it is the last settings
  block), legal-hold status matcher fail-open (delete during a live hold),
  traceability-matrix non-atomic save; + irac/data-lineage/ai-provenance/version MED,
  privilege/cache/plan-coverage-glob LOW. Wave-5 re-attack cleared 5/6 fixes clean.
  v6.12.64 (45318b6) wave 7 shipped 7 fixes: sync.js auto-commit shell-injection RCE
  (HIGH, all 20 git calls -> execFileSync argv), tabs/vision.js ANSI injection (HIGH),
  playwright-scaffolder silent overwrite, hooks-installer substring-ownership x2,
  dependency-auditor npm-audit parse fail-open, project-root .ctoc-priority two-pass
  (MED). Wave-6 re-attack was CLEAN. Completeness sweep: the WHOLE lib/hook/tab
  surface is now audited (only areas.js/tabs.js remained, pure in-memory + clean).
  Boundary caught a real sync.js Buffer/encoding bug (tsc) + 3 false-green tests
  (project-root priority, init-project comment-only skip, ship-gate execSync spy) —
  all fixed/tightened. v6.12.65 (7b5a0d0) wave 8 shipped 12 fixes incl. 2 CRITICAL
  step-13-verify false-passes (parseCoveragePct first-match coverage spoof; a
  declared npm-test that can't launch dropped as not-run), plan-coverage globToRegex
  ReDoS (linear DP matcher), 3 wave-7 REGRESSIONS caught by re-attack (project-root
  ~/.ctoc over-root, hooks-installer legacy false-match, vision renderActions ANSI),
  revertPlan clobber, plan-validator stub-step, evidence-pack/secrets-scanner execSync
  injections, test-gate parseFail/parseSkipped test-name hijack. + the CRITICAL
  ledger-backfill FORK (item 0 above) surfaced for Tijn. TOTAL: 65 defects, 9 pushed
  waves (v6.12.57->65). Convergence NOT reached (fleet 8 still found 2 CRIT + a ReDoS),
  but many fresh-assault angles RESISTED (wrong-edge/TOCTOU/batch gate replay; most
  taint sinks argv-safe). Next: Tijn decides the ledger-backfill fork (its own Iron
  Loop plan, spans approval-ledger+human-gate-check+menu); then continue fleets
  (re-attack wave 8 + any remaining deep angles) toward the 3-clean-rounds convergence.

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
0. [NEW, CRITICAL — v6.12.64 re-attack] ledger-backfill.js is an agent-runnable
   Gate-2/Gate-3 FORGERY tool: PreToolUse.Bash denies the `node -e ...backfillEntry`
   form but ALLOWS `node src/scripts/ledger-backfill.js` (its own SANCTIONED_WRITER),
   which mints an accepted approved_by:human residency for arbitrary agent-written
   plan bytes (plans/**.md is Edit-whitelisted), crossing Gate 3 with NO human.
   CANNOT just deny it on Bash: the `claude:approve-stubs` MENU RECIPE (menu.md:55,
   wired menu-screens.js:1367 "Looks good -- refine all") runs `ledger-backfill.js
   --vision` THROUGH the agent Bash channel — denying breaks vision archival + 3
   ledger-forgery tests. Three postures, Tijn picks: (A) move --vision ledgering
   in-process into approvePlan/decompose (no Bash argv), then deny the script on Bash;
   (B) split: --vision = internal lib call, --plan/--stage = human-terminal-only +
   Bash-denied; (C) fix the CERTIFICATION root — backfillEntry/writeVisionArchiveEntry
   refuse to certify a residency with no prior gate/pipeline event (closes the
   non-eval bypass the hook admits it can't see). Recommend C. Spans approval-ledger.js
   + human-gate-check.js + the menu recipe → its own Iron Loop plan.
   >>> TIJN CHOSE C (2026-07-16). Design note from tracing the chain: entryKind already
   labels the backfill 'backfilled' (never 'human'); classifyResidency accepts it at
   human-gate-check.js:212 on a content-hash match. NO field-based guard in those two
   files alone closes it — backfillEntry is AGENT-INVOCABLE and the agent controls every
   field (content, hash, stage_to, backfilled). Robust C needs an OUT-OF-BAND anchor: a
   'backfilled' entry must NOT self-certify — require a human confirmation OR a committed
   migration-set that grandfathers the ~234 real legacy done plans WITHOUT accepting a
   fresh agent forge. Scope: approval-ledger.js (confirm marker/set) + human-gate-check.js
   (reject unconfirmed backfilled at done/todo → inbox) + a human-confirmation path
   (menu/inbox). HUMAN-GATE change → Iron Loop + Tijn Gate 2, NOT a freelance patch.
   Interim exposure LOW: needs a deliberate agent self-forge; every audit still labels it
   'backfilled' (never 'human'); the human clicks a menu label, never types the command.

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
