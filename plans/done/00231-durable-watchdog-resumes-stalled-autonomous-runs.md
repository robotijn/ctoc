---
approved_by: human
approved_at: 2026-07-24T12:17:45.658Z
gate_crossed: review → done
override: true
override_reason: Human approved done 2026-07-24 (Push + mark both done). Work shipped and gate-green: sweep 7cec02e, watchdog a22eb55. Plans lack machine-readable step markers but VERIFY genuinely passed (npm test fail 0, coverage 99.01%).
---

---
plan_id: "00231"
title: "Durable watchdog — resume a stalled autonomous run after a token/rate-limit idle"
stage: functional
status: approach-approved-resume-on-session-open
created: "2026-07-24"
files:
  - "src/lib/resume-watchdog.js"
  - "src/lib/continuation.js"
  - "src/hooks/SessionStart.js"
  - "tests/resume-watchdog.test.js"
depends_on:
  - "continuation-queue"
mechanism_decision: "scheduled-cloud-routine"
---

## FEASIBILITY FINDING (2026-07-24) — the chosen mechanism cannot be built as specified

Both scheduling primitives available inside the Claude command-line runtime were
checked directly against their own contracts:

- **Session cron (`CronCreate`)** is session-only. Its `durable` parameter states
  verbatim: "Has no effect — durable persistence is not available. All jobs are
  session-only (in-memory, gone when this Claude session ends)." It also
  auto-expires after 7 days. It therefore never delivers the "survives the local
  session dying" property this plan was chosen for; it only nudges hourly while a
  session stays open.
- **Scheduled cloud routine (`RemoteTrigger`)** is durable and server-side, but it
  runs inside claude.ai's cloud environment, which has no access to the user's
  LOCAL repository or the batch state on the local filesystem, and it can only be
  armed by the session model, never by plain CTOC code run from a hook.

**Conclusion: durable, hands-off auto-resume of a LOCAL batch that survives session
death is not buildable with any available primitive.** Building the watchdog anyway
would produce a mechanism that reports itself armed but silently stops the moment
the session closes — exactly the false-green failure CTOC exists to refuse. **Human decision (2026-07-24): build the feasible subset below** — the durable
external-waker path was declined for the reasons in its column (spawns a second
Claude, needs separate login, not cross-platform). The scope is now exactly the
buildable subset; nothing claims to survive session death.

**Buildable subset (approved — this is the implemented scope):** the pure
functions `shouldResume` / `resumeDirective`, `continuation.js` stamping
`lastAdvanceMs`, and `SessionStart.js` injecting a resume directive so that when the
human OPENS A NEW SESSION an unfinished, fork-free batch auto-resumes from where it
stalled. This closes the "session was closed and later reopened" gap. It does NOT —
and cannot — wake a closed or idle session on its own; that requires an external
waker no available primitive provides.

---

# Durable watchdog — resume a stalled autonomous run after a token/rate-limit idle

## Problem (the human's reality)

CTOC drives long autonomous batches (a queue of plans, an N-round sweep, "do it
all"). When the session runs out of tokens for a period, or hits a rate limit, or
is simply closed, the batch **stops mid-flight and nothing restarts it.** The
human comes back to a half-finished run with no signal that it stalled. "It keeps
going" is the requirement; today it does not.

## What already exists (do not rebuild)

- `src/lib/continuation.js` + `src/hooks/stop-continuation-gate.js` — the
  **never-idle Stop gate.** While the session is ALIVE, it blocks a premature stop
  mid-batch and re-injects "drive the next unit." This is in-session only: a Stop
  hook cannot fire when the session is idle or rate-limited, which is exactly the
  "ran out of tokens" case. That gap is what this plan closes.

## Decision taken (human-chosen, not guessed)

The scheduled-cloud-routine mechanism was found infeasible for a LOCAL batch (see
the FEASIBILITY FINDING above). Presented with that fact, the human chose on
2026-07-24 the **resume-on-session-open** subset: no external waker is attempted;
instead, when the human opens any new session, an unfinished, fork-free batch is
auto-resumed from where it stalled. This is the honest maximum the runtime allows —
it closes the "closed and later reopened" gap without claiming a durability no
primitive provides. It does NOT wake a closed or idle session on its own; that is
out of scope by physics, not by choice.

## Design

1. **`src/lib/resume-watchdog.js` (new).** Pure functions, no side effects beyond
   the routine registry it is handed:
   - `shouldResume(batchState, nowMs)` → returns `{ resume: boolean, reason }`.
     `resume: true` only when a batch is active, has remaining fork-free units, and
     its `lastAdvanceMs` is older than the stall threshold (default 90 min, matching
     the sweep's dead-agent window). A registered FORK (`continuation.registerFork`)
     → `resume: false` (the human owns that decision). Batch complete
     (`remaining === 0`) → `resume: false`.
   - `resumeDirective(batchState)` → the exact "drive the next unit" text the
     routine injects, naming the batch label and remaining count in the human's
     terms (never a plan number).
   - FAIL-OPEN: any malformed state → `{ resume: false }`, never throw. A watchdog
     that crashes must never be what stops the run.

2. **`continuation.js` — stamp progress (NO scheduler; plain code cannot arm one).**
   - `advance(root)` stamps `lastAdvanceMs` into the batch state so `shouldResume`
     can measure staleness. `startBatch` stamps an initial `lastAdvanceMs`.
   - continuation.js registers NOTHING external — there is no code-armable durable
     scheduler in this runtime, and CTOC must never spawn a second Claude. The batch
     state on disk is the whole persistence layer.

3. **`SessionStart.js` — resume on every session start.** On each session start,
   SessionStart computes `shouldResume` from the persisted batch state and, when
   true, injects `resumeDirective` so the model picks the batch back up exactly where
   it stalled. When false (complete / forked / no batch / fresh advance) the
   injection is empty — a quiet start, no noise. This is the same session-driven
   injection pattern already used by streaming-precompute; it is the only reachable
   entry path, and it fires precisely when the human returns.

## Invariants (the same guardrails as the Stop gate)

- **Opt-in / inert with no batch** — no active batch → nothing registered, nothing
  wakes. Safe to ship enabled.
- **Fork-aware** — a registered fork blocks resume; the human's decisions are never
  auto-driven.
- **Bounded** — no scheduler, so nothing bills; a completed/forked batch simply
  yields an empty injection on the next start.
- **Escapable** — `CTOC_SKIP_CONTINUATION=1` (the existing kill-switch) also
  suppresses the resume injection; one switch disarms the whole never-idle system for
  rollback isolation.
- **Cross-platform** — no shell entry point, no operating-system crontab; a pure
  function plus a `SessionStart` injection. `path.join`, `fs.promises`.

## Decisions Taken Under Ambiguity

- **Stall threshold = 90 min**, matching the dead-agent window the sweep already
  uses. It gates resume so a batch the human is actively driving (a fresh
  `lastAdvanceMs`) is not re-injected on a quick session restart. Configurable via
  `.ctoc/settings.json` (`continuation.stallMinutes`); default holds until then.

- **`shouldResume` stays STRICTLY PURE; the settings read lives in `SessionStart`.**
  The threshold VALUE comes from `.ctoc/settings.json` (`continuation.stallMinutes`),
  but reading a file is a side effect, and `resume-watchdog.js` is specified as
  pure/no-side-effects. Resolution: `shouldResume(batchState, nowMs, opts)` takes the
  threshold via an optional third argument (`opts.stallMinutes`, default 90);
  `SessionStart.readStallMinutes(projectPath)` does the fail-soft settings read and
  passes the value in. The pure decision is fully deterministic and testable; the I/O
  sits in the already-impure hook.

- **`lastAdvanceMs` must be a GENUINE positive number, not a coercible one.**
  `Number(null)` and `Number('')` both coerce to `0` — a 1970-epoch stamp that always
  reads as "stalled" and would spuriously resume. `shouldResume` therefore requires
  `typeof lastAdvanceMs === 'number' && isFinite && > 0`; anything else is "no
  timestamp to measure staleness" → no resume.

- **The stall boundary is strict (`age > threshold`).** Exactly AT the threshold is
  treated as still-fresh, so a batch right on the boundary is not resumed until it has
  genuinely gone idle PAST it.

- **Step 15 CLAUDE.md paragraph is NOT written in this executor slice.** The
  implementation slice's authorized file scope is exactly the four files declared in
  `files:` (`resume-watchdog.js`, `continuation.js`, `SessionStart.js`, the test).
  The "Durable watchdog" paragraph for the Continuation Gate section of `CLAUDE.md` is
  outside that coverage and is left for the human/parent to land. The delivered
  documentation for this slice is the in-code JSDoc on all three touched source files.

## Iron Loop steps

- **8 TEST** — write `tests/resume-watchdog.test.js` FIRST: a stalled active batch
  → resume true; a fresh-advance batch → false; a forked batch → false; a complete
  batch → false; malformed state → false (fail-open); the directive names the batch
  in the human's terms and carries no plan number.
- **9 PREPARE** — confirm the continuation-queue state shape and the SessionStart
  injection point.
- **10 IMPLEMENT** — `resume-watchdog.js`; stamp `lastAdvanceMs` in
  `continuation.js`; wire the resume-injection into `SessionStart.js` (reachability:
  the SessionStart wiring lands in this same slice, never a follow-up).
- **11 REVIEW** — iron-loop-critic.
- **12 OPTIMIZE** — none expected (two pure functions + one field stamp).
- **13 SECURE** — the routine injects only a fixed directive + batch label; no
  secret, no user path in the injected text (same discipline as the stale-scan enum).
- **14 VERIFY** — `npm test`, coverage at or above the floor, 0 skipped.
- **15 DOCUMENT** — a "Durable watchdog" paragraph in the Continuation Gate section
  of CLAUDE.md.
- **16 FINAL-REVIEW** — iron-loop-critic; then the human's gate.

## Acceptance criteria

- [ ] A batch that stops with remaining fork-free units and no advance for >90 min
      is resumed by the next hourly routine wake, from where it stalled.
- [ ] A completed batch deregisters the routine (no further billed wakes).
- [ ] A forked batch does not auto-resume (the human's decision is preserved).
- [ ] `CTOC_SKIP_CONTINUATION=1` suppresses the watchdog.
- [ ] Malformed/missing state fails open (no throw, no spurious resume).
- [ ] No plan number or gate number appears in any injected text.
- [ ] `npm test` green, coverage at or above the floor, 0 skipped.
