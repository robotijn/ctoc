# Handoff — CTOC: README-as-a-course + coverage wave + gate fixes, all shipped

<!-- Maintained by the `handoff` skill. Left by the previous Claude instance so
     the next one (claude or claudex) can continue. Treat as last-known state —
     verify against the repo before acting. VERIFY EVERY CLAIM IN THIS FILE
     AGAINST DISK, INCLUDING THIS FILE. -->

- Updated: 2026-09-03 13:49 by claude
- Branch: main
- Status: complete

## Goal
Rewrite `README.md` as a course grounded in learning-science evidence, close the
suite's missing coverage with tests that would catch regressions, fix the gate
defects that surfaced along the way, and fix the evidence-pack archiver's five
defects — everything through CTOC's own iron loop, every gate crossed by the
human.

## Current status
- Done (all pushed, `origin/main` = local at v6.14.65, commit `253a443a`):
  - `README.md` is a nine-lesson course with real captures; its guard test
    (`tests/readme-numbers.test.js`) derives its pins from disk; the release sync
    now rewrites the capture's `CTOC vX.Y.Z` line and the README structure counts
    (`release.js` `VERSION_UPDATES`/`COUNT_UPDATES` + `version.js
    syncToReadme`), with derived pins that go red on drift.
  - Coverage wave: 20 slices, suite 99.04% → 99.9% (floor deliberately HELD at
    99 by the human — never raise it without his word); ~15 modules at 100%;
    every fail-closed enforcement arm mutation-proved to deny; fail-open arms
    are stated contracts; dead ranges reported, never deleted.
  - Gate fixes: `plan-validator.extractStepBlocks` prefers the canonical
    `## Execution Plan (Steps 8-16)` section; `EXECUTION_SECTION_PRODUCERS`
    gained the `deferred questions` row; the circuit breaker persists kickback
    counts in `.ctoc/state/kickbacks/<slug>.json` (a Step 14 kickback no longer
    revokes the build's own write permission); 36 + 93 approvals re-recorded via
    `ledger-backfill --hash-scope specification` — 0 mismatches across ~400
    ledgered plans.
  - Evidence pack (`src/scripts/evidence-pack.js`): packs the caller's project
    (never the plugin cache; loud refusal on an unrelated cwd), manifest is the
    archive's first member, tar-absent exits non-zero keeping the salvage
    bundle, manifest is parseable YAML (js-yaml round-trip), all three
    window-blind collectors fixed.
- In progress: nothing. `todo`/`in-progress`/`functional` are empty; the six
  files in `plans/implementation/` are parent INDEXES of shipped work
  (ledgered; residency clean — leave them).
- Next: only human-scheduled items (see Open questions).

## Key decisions
- Coverage floor stays 99 (human, 2026-09-03) — measured 99.9; the ratchet is
  his alone.
- Hash-binding migration (human): exempt row added AND every affected approval
  re-recorded as `backfilled` via the sanctioned `src/scripts/ledger-backfill.js`
  (never `node -e` — the Bash hook denies inline ledger writes).
- README captures: version line machine-synced; counts are snapshots (the
  promise sentence states that split). The active-agent capture stays — a tidied
  capture is not a capture.
- New plans enter at `plans/functional/` — a plan authored into a gate
  destination is blocked by `gate-destinations-approved` and reverted.
- Executors write ticks ONLY in the canonical checkbox section and records only
  under `## Execution Record` / `## Verification Evidence` / `## Decisions Taken
  Under Ambiguity`; an invented heading breaks the approval hash.

## Open questions / blockers
None blocking. Awaiting the human's scheduling (reproduced, recorded, NOT built):
1. Framework detector misses canonical Create React App (`react-scripts` in
   `dependencies`; `hasDevDependency`/`hasDependency` asymmetry in
   `src/lib/framework-security-checker.js`) — its security surface is skipped.
2. Confinement refusal blames the approval ledger for unresolvable paths
   (`src/lib/real-path-confinement.js` `resolve-failed` → wrong human-facing
   reason).
3. `src/hooks/SessionStart.js` `main().catch` exits before piped stderr drains.
4. `.ctoc/reachability-roots.json`: `src/scripts/evidence-pack.js` has no
   `reasons` note (one line).
5. No `general.entry_point` declared in `.ctoc/settings.json` for CTOC itself,
   so the last-mile launch check opts out on every build here (CLAUDE.md
   documents the declaration it would use).
6. Four stale queued tasks from an older session: t43–t45 (gate-question
   precomputes), t48 (implement for a plan no longer in the queue) — run or
   cancel on his word.
7. 93→0 legacy mismatches are migrated, but tier counts still disagree across
   `docs/AGENT_ARCHITECTURE.md` (20/99), `.ctoc/architecture/
   tier-definitions.yaml` (16/99) and agent frontmatter (23/100) — README
   follows the architecture doc.

## Gotchas
- The release one-liner must check `npm test`'s exit via `$?` on an unpiped
  run — `PIPESTATUS` is bash-only; in zsh it once let a red gate push.
- `node --test tests/*.test.js` bypasses the coverage/zero-skipped gate; only
  `npm test` is the gate. Its coverage reporter can rarely lose the number under
  child-process-heavy runs ("Could not report code coverage") — the gate then
  correctly refuses; re-run.
- The enforcement hook accepts an escape phrase only when the HUMAN types it.
- `depends_on: []` in plan frontmatter parses as a phantom dependency — use the
  literal word `none`.
- A two-blank-line separator before an appended plan record breaks the
  approval hash; use one.
- Coverage-report rows are indented under directory headings — reading the
  basename alone confuses `src/lib/inbox.js` with `src/areas/inbox.js` (this
  bit two planners).

## Key files
- `README.md` — the course; guard: `tests/readme-numbers.test.js`.
- `src/scripts/release.js`, `src/lib/version.js` — README/CLAUDE.md sync.
- `src/lib/plan-validator.js`, `src/lib/approval-ledger.js`,
  `src/scripts/ledger-backfill.js` — done-gate + hash semantics.
- `src/lib/circuit-breaker.js` + `.ctoc/state/kickbacks/` — sidecar counters.
- `src/scripts/evidence-pack.js` + `tests/evidence-pack-main.test.js`.
- `plans/done/00234…00258` — the wave's plans with execution records.
- Session memory: `~/.claude/projects/-Users-doctony-Code-ctoc/memory/`
  (`project_coverage_wave_shipped.md` lists the open findings).

## Resume here
Nothing is in flight. If continuing: pick an item from Open questions with the
human, write its functional plan into `plans/functional/`, validate, and drive
it through the gates — he approves every crossing.
