---
title: "The coverage floor gets margin it can rely on — and the honest finding about how much is actually available"
type: implementation
parent_plan: none
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: false
files:
  - "plans/implementation/00210-the-coverage-floor-gets-margin-it-can-rely-on.md"
---

# The coverage floor gets margin it can rely on

This is an INDEX plan. It carries the evidence and the honest finding; the work lives
in its slices.

## The goal, and the decision that produced it

Measured coverage on this repository sits at 99.00–99.03% across runs on an UNCHANGED
tree. `.ctoc/coverage-baseline.json` records `minPct: 99` (read on disk; line 3), and
`src/scripts/test-gate.js` passes on "at or above". One run measured exactly 99.00% and
passed by a hair.

The failure this arms: a future build fails the coverage gate for reasons unrelated to
its own diff, and whoever hits it hunts through their own changes for a cause that is
not there.

Three options were put to the human — raise real coverage until there is margin; make
the gate report the measurement spread when it fails near the floor; or leave it. **He
chose: raise real coverage.** This plan set serves that decision. It does NOT plan the
reporting option, and it proposes NO change to `minPct` — the ratchet only rises.

## What I could and could not measure — stated before any claim rests on it

**I could not run `npm test` in the planning context.** No shell was available. Every
line-level "this is uncovered" claim in a plan written without the coverage table would
be a verdict on input the author never received — the exact defect this repository
exists to fence, wearing a plan's clothes. So no such claim appears here.

What I did instead is verifiable by reading, and every finding below was established by
reading source and test files on disk.

## Finding 1 — the coverage campaign is close to exhausted

`.ctoc/coverage-baseline.json` line 9 records the last ratchet: *"measured 99.33% after
the 88→99 non-obvious mutation-killing coverage campaign (~90 modules driven to ~100%,
remaining gap is documented-unreachable defensive/subprocess/TTY code)."*

I probed that claim rather than trusting it. Modules read in full or checked against
their tests:

| Probed | Result |
|---|---|
| `src/lib/approval-residency.js` | 29 deny-reason assertions across 6 test files (`ledger-unkeyable`, `ledger-corrupt`, `wrong-edge`, `hash-mismatch-legacy`, `unknown-provenance`, `pipeline-no-evidence`, `sufficiency-not-allowed`, `classify-error`, `stage-not-coverable`) |
| `src/lib/plan-coverage.js` | 42 references across 5 test files incl. `tests/plan-coverage-coverage.test.js`, `tests/unapproved-plan-grants-nothing.test.js` |
| `src/lib/enforcement-liveness.js` | `tests/the-edit-protection-says-whether-it-is-running.test.js` — 24 tests, boundary-exact on both constants, a vacuity guard (case 18), an injection test, and a hostile-options backstop. Effectively 100% |
| `src/lib/real-path-confinement.js` | Outer catches are explicitly documented "Total by construction" — unreachable by design |
| All 26 files in `.ctoc/reachability-baseline.json` | Every one has a dedicated `*-coverage.test.js` |
| Newest modules (`streaming-gate`, `menu-screens`, `project-root`, `request-exit`, `reachability`, `stale-detector`, `false-green-scan`, `task-reconcile`) | All carry dedicated tests |
| Subprocess/network modules (`ollama-client`, `embedder`, `calibration`, `sync-unit`) | `ollama-client-coverage.test.js`, `embedder-coverage.test.js`, `calibration-coverage.test.js`, `sync-unit-coverage.test.js` all present |

I did not find an untested module. The residue really is what the baseline says it is:
defensive catches the code documents as unreachable, subprocess paths, and TTY paths.

**Consequence for the human's goal: there is no large honest coverage gain available
here.** Saying so is the instruction, not a shortfall against it.

## Finding 2 — deleting the dead code would LOWER coverage, not raise it

`.ctoc/reachability-baseline.json` records 26 unreachable files as debt. Deleting dead
code normally raises coverage honestly and beats testing it.

**Not here.** Every one of those 26 files carries a dedicated coverage test —
`quality-gate-coverage.test.js`, `v8-dispatcher-coverage.test.js`,
`product-loop-coverage.test.js`, `four-eyes-coverage.test.js`,
`plan-numbering-coverage.test.js`, `validate-plan-steps-coverage.test.js`,
`audit-chain-coverage.test.js`, and so on. They were driven to ~100% by the earlier
campaign, before the reachability fence was re-seeded on 2026-07-19.

Removing near-100% files from a 99% denominator **drops the average.** So deletion is
the right thing for the codebase and the wrong instrument for this goal, and the two
must not be conflated. Several of those files are already spoken for by existing plans
that WIRE rather than delete them (`00190` quality-gate, `00185` stale-cleanup). No
deletion is planned here.

## Finding 3 — the spread on an unchanged tree is explained, and it is closable

Coverage varying 99.00–99.03% on an unchanged tree means the measurement is
non-deterministic. I found the mechanism: **tests whose registration or fault-induction
depends on the environment.** Two sites, both read on disk:

1. **`tests/stale-scan-says-when-it-could-not-look.test.js:44–57`** —
   `CAN_REVOKE_READ` is false on Windows and as uid 0. The permission-dependent cases
   then announce a stated skip (correctly — a silently no-opping permissions test is
   itself the defect) and the `stage-unreadable` / `read-failed` branches of
   `scanCheapCandidates` go unexercised. Those branches are on the menu hot path.

2. **`tests/stack-detector-coverage.test.js:139–158`** — the broken-symlink case
   tolerates `fs.symlinkSync` failing, and asserts only
   `symlinkMade || process.platform === 'win32'`. On a platform without symlink
   privilege the `statSync` catch in the workspace walk is never driven.

Same code, different environments, different measured coverage. This is real, closable
work that raises coverage where it is currently lower and makes the number mean the same
thing on every machine.

**Honest sizing: this buys determinism, not margin on the human's own machine.** macOS
as a non-root user already runs both cases, so his 99.00–99.03% does not rise from this.
It rises on Windows, in a root container, and in CI. I am not presenting it as the
margin he asked for, because it is not.

## Slices (dependency-ordered)

| # | Plan | Scope | depends_on |
|---|------|-------|------------|
| 1 | `00211-the-scan-fault-cases-run-on-every-machine.md` | Drive `stale-detector`'s `stage-unreadable` and `read-failed` branches with cross-platform real faults, keeping the permission cases as the stronger proof where they run | — |
| 2 | `00212-the-workspace-walk-fault-runs-on-every-machine.md` | Drive `stack-detector`'s workspace-walk `statSync` catch on Windows too, via a directory junction, and fail loudly if the fault cannot be induced | 00211 |

Chained rather than parallel so each slice's coverage effect is separately attributable
in the table — and because two slices must never touch one file concurrently.

## Expected coverage effect, and how it was derived

**On macOS as a non-root user (the human's machine): no measurable change.** Both target
cases already run there, so the branches are already covered. Derivation: `CAN_REVOKE_READ`
at `tests/stale-scan-says-when-it-could-not-look.test.js:44` is true on that platform, and
`fs.symlinkSync` succeeds, so `symlinkMade` is true at `:143`.

**On Windows or as root: a small rise, and the elimination of the 0.03-point spread.**
I cannot put a number on it without running the suite on those platforms, and I am not
going to invent one. The derivation available is structural, not numeric: four `continue`
branches in `scanCheapCandidates` plus one `statSync` catch in the workspace walk move
from environment-dependent to always-exercised.

**What would change this: an actual measurement.** The first thing either slice's
executor does is run `npm test` and read the per-file table. If it contradicts anything
above, the plan is wrong and the executor should say so rather than proceed.

## The gap deliberately left alone, with the reason

**The documented-unreachable defensive residue** — the outer `catch` in
`real-path-confinement.resolveExisting` (`:166`), `resolveBasis` (`:195`), the belt-and-
braces catch in `protectionLiveness` (`:402`), and their siblings. Each is annotated in
source as total-by-construction, reachable only by a caller the product cannot produce.

An executor recently and correctly DECLINED to cover a type guard reachable only by a
caller passing a non-string, where every live call site routes through a helper that
always returns a string. That judgment was upheld and it is the standard. Testing these
would require reaching past the public surface to force a fault the product cannot
produce — a test asserting behaviour nobody depends on, which is coverage theatre and is
forbidden here.

**So: the residual ~1% is largely not honestly closable, and the margin the human wants
is not available by raising coverage.** He would rather know that than be handed a
number.

## The fork this hands back to the human

Raising real coverage — the option he chose — turns out to yield determinism rather than
margin, for the reasons evidenced above. That does not re-open the options he declined;
it is new information about the one he picked. **He alone decides what happens next**,
and the technical dependency is simply that any further margin has to come from somewhere
other than testing already-covered code.
