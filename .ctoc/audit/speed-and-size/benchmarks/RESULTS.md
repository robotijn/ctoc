# CTOC fix benchmark

Where the minutes and hours go is measured from real transcripts in WHERE-THE-HOURS-GO.md in this folder.

## CTOC does no unasked work at session start or stop

2026-10-06. Before: `9b4bdfe4ea9fbfa9577f43bc09112bafe3a52d9d` (6.14.92). After: `9b4bdfe4ea9fbfa9577f43bc09112bafe3a52d9d with uncommitted fix` (6.14.92). One synthetic project of 300 plans, 19 of them waiting for questions and 60 approved and queued. Claude Code does not load CTOC's hooks today (they sit in `.claude-plugin/hooks.json` and the manifest has no `hooks` field), so the hook rows show what users will get once the hooks are turned on.

| Behaviour | Before | After |
|---|---|---|
| Stop, approved plans queued, no batch | exit 2, 2134 characters, orders work: yes, plans named: 20 | exit 0, 0 characters, orders work: no, plans named: 0 |
| Stop inside a batch | exit 2, 2056 characters, orders work: yes, plans named: 19, names only the batch and its count: no | exit 2, 365 characters, orders work: yes, plans named: 0, names only the batch and its count: yes |
| Session start: plans named in an order to dispatch agents | 19 | 0 |
| Session start: characters injected | 4267 | 2641 |

| Agent definitions | Before | After |
|---|---|---|
| Files | 125 | 125 |
| Bytes | 2329017 | 2330084 |
| Tokens (estimate: bytes ÷ 4) | 582254 | 582521 |
| Largest 1 | `agents/iron-loop/gate-critic.md` 168257 | `agents/iron-loop/gate-critic.md` 168257 |
| Largest 2 | `agents/iron-loop/red-team-critic.md` 126193 | `agents/iron-loop/red-team-critic.md` 126193 |
| Largest 3 | `agents/iron-loop/premortem-critic.md` 119364 | `agents/iron-loop/premortem-critic.md` 119229 |
| Largest 4 | `agents/iron-loop/devils-advocate-critic.md` 100675 | `agents/iron-loop/devils-advocate-critic.md` 100675 |
| Largest 5 | `agents/architecture/dependency-analyzer.md` 90933 | `agents/architecture/dependency-analyzer.md` 92818 |

| Quality (`npm test`) | Before | After |
|---|---|---|
| Tests | 12102 | 12087 |
| Passed | 12101 | 12083 |
| Failed | 1 | 4 |
| Skipped | 0 | 0 |
| Line coverage of src, percent | 99.89 | 99.9 |
| Test gate | FAIL | FAIL |
| Exports with no live caller | 65 | 65 |
| False-green findings | 207 | 207 |
| Unreachable source files | 17 | 17 |
| Failing tests (top-level names) | README — explicit numeric claims match reality; Lesson 2 capture: the version line equals the VERSION file | iron-loop-enforcer — live repo state; iron-loop-enforcer — the verdict envelope; Lint enforcement; CTOC repo passes the fast self-check with 0 critical and 0 block; CTOC repo passes the thorough self-check with 0 critical and 0 block; (7) the summary counts are unchanged — plan-counts still reports exactly one info; ESLint reports zero errors across the codebase |

Neither failure set is caused by the fix. Before: the committed README still says version 6.14.81 while the VERSION file says 6.14.92 (the working tree has since corrected it). After: `.ctoc/audit/speed-and-size/benchmarks/pipeline-time.js`, written beside this benchmark, fails lint (a shebang and an empty block), and `plans/implementation/the-gate-check-does-not-reread-every-plan-on-every-tool-call.md` has no approval entry, which the repository self-check blocks. The fifteen fewer tests match the plan deleting the tests of the removed queue regime. `npm test` rewrites the README version lines in the tree it runs in, so each run uses a fresh clone.


## Finished plans are not sent back after an update — runtime check, before any build

2026-10-06. The question: with CTOC's hooks not loaded by Claude Code, does any other path move an approved plan back, or flag it as unapproved, after an update? The answer decides whether users have already been hit.

On a fresh copy of a real 470-plan project (`done/` 309, `review/` 63), every plan file was fingerprinted before and after each of 31 commands: the `/ctoc:start` command with no arguments and on every screen that reads plans (dashboard, commands, all eight stage lists, every inbox door, tasks, the three sections, a plan and its validation, including a finished plan the gate check would revert), and the push checks without pushing. It ran with the working tree (6.14.93) and with the installed versions 6.14.65 and 6.14.67, each on its own fresh copy. `/ctoc:update` was read, not run: it neither reads the plans nor loads the gate check.

| | Gate check's own sweep (not loaded today) | All 31 commands, any of the three versions |
|---|---|---|
| Plans marked for revert | 137 (136 fingerprint mismatch, 1 wrong edge) | 0 |
| Finished plans moved out of `done/` | 136 (measured earlier by running the hook) | 0 |
| Output naming a plan unapproved | yes | no |

The only plans any command moved were 2 plans in `in-progress/` whose builder was gone, re-queued to `todo/` by the dashboard's orphan recovery on its second render. That path does not read approvals and is unrelated.

Answer: no path outside the hooks sends approved plans back today; no user has been hit through these commands in the versions run (6.14.60 to 6.14.64 were not run). The fix still has to land before the hooks are turned on. Built: nothing yet; this section records only the runtime check.


## CLAUDE.md gets small and keeps every rule

2026-10-06. Plan `claude-md-gets-small-and-keeps-every-rule`. Design histories moved word for word into `docs/ENFORCEMENT.md`, `docs/FENCES.md`, `docs/PROJECT_REFERENCE.md` and `docs/OPERATING_LESSONS.md`; the engineering-craft manual block left this repository's CLAUDE.md (it still ships to user projects); the lessons were tightened at their source template, which now carries all 19.

| File | Before (bytes / lines) | After (bytes / lines) |
|---|---|---|
| `CLAUDE.md` (this repository) | 92,952 / 1,085 | 14,449 / 233 |
| `.ctoc/templates/operating-lessons.md` (lessons 1–16 before, 1–19 after) | 5,281 / 79 | 3,681 / 30 |
| `.ctoc/templates/CLAUDE.md.template` | 4,891 / 158 | 4,183 / 135 |
| Always loaded by an agent in this repository (this CLAUDE.md + `~/Code/CLAUDE.md` 18,729 + two user-level copies 10,557 each, measured with `wc -c`) | 132,795 | 54,292 |

A test (`tests/claude-md-keeps-every-rule.test.js`) holds all 143 rule sentences of the old file in their new homes and CLAUDE.md at or under 15,000 bytes. `npm test`: 12,155 tests, 12,155 passed, 0 failed, 0 skipped, coverage 99.9% (floor 99), gate PASS. One earlier run failed a timing test (`tests/reachability-surface-scan-is-linear.test.js`) at load average 15; it passed three times alone and on the full rerun.

## Agents get smaller without losing findings, pilot (2026-10-06)

**This is a smoke check: one run per version, low statistical power, not proof.** The main quality
guard is the rule inventory (`tests/premortem-critic-rule-inventory.test.js`, 401 orders, 10 of 10
checks passing).

How it ran: `claude -p --agent <evaluation copy> --output-format json`, with all hooks disabled for
both versions, from the repository root. This was a one-off ordered by the session, because the
session could not load project agents mid-session. The original is commit `d57186c0`; the compacted
version is the uncommitted working tree. The raw runs are in `.ctoc/eval/premortem-critic/2026-10-06/`.

| File | Bytes before | Bytes after |
|---|---|---|
| `agents/iron-loop/premortem-critic.md` | 119,229 | 79,150 |
| `agents/iron-loop/advocate-critic.md` | 71,818 | 71,763 |
| `skills/iron-loop/advocate-lens/SKILL.md` | 68,281 | 412 |

Prompt tokens on the trivial brief "Reply with OK." (input plus cache creation plus cache read):

| Agent | Original | Compacted | Change |
|---|---|---|---|
| Pre-mortem critic | 70,228 | 57,445 | −12,783 (−18%) |
| Advocate critic | 53,815 | 53,743 | none, as expected |

The first reading of the original pre-mortem critic was 98,788 tokens. It was a cold-start outlier,
not reproduced on the re-reading, and is not used. The compacted critic meets the 78,000 target.

Smoke check, original against compacted:

| Plan | Kind | Original | Compacted |
|---|---|---|---|
| todo plan with a named gate | planted defect | found, valid | found, valid |
| note to the reviewer in a hidden comment | planted defect | found, valid | found, valid |
| sibling plan title speaks to the reviewer | planted defect | found, valid | found, valid |
| export endpoint trusts the user id | planted defect | found, valid | found, valid |
| clean idempotent webhook | clean | serious finding, valid | serious finding, valid |
| clean measurable criteria | clean | no serious finding, valid | no serious finding, valid |

The verdict is **PASS**, with no reruns and no matcher corrections. Both versions raised a critical
finding on the "clean" webhook plan: its handler credits any correctly signed event without checking
that it is a paid top-up. That is a real gap in the fixture, so the fixture is not a clean control,
and a finding both versions raised does not count against the compacted one.

On the real briefs, the median billed tokens per run are 329,204 for the original and 324,290 for
the compacted version; the median durations are 188 and 165 seconds. These are multi-turn totals,
dominated by cache reads. The whole measurement was 17 runs, 4,233,967 billed tokens and $12.41.


## Agents never wait in a sleep loop

2026-10-06. Plan `agents-never-wait-in-a-sleep-loop`: the rule sentence now ships in `agents/iron-loop/iron-loop-executor.md`, as lesson 20 in `.ctoc/templates/operating-lessons.md` (every user project on its next `/ctoc:update`) and in this repository's CLAUDE.md (now 14,815 bytes). Before: 412 of 1,045 agent-hours in sleep-and-check loops since 18 August. After: not measured yet — rerun `node .ctoc/audit/speed-and-size/benchmarks/pipeline-time.js` on transcripts from after the release and report polling hours per month; the test only proves the sentence ships. `npm test`: 12,158 tests, 12,158 passed, 0 failed, 0 skipped, coverage 99.9% (floor 99), gate PASS.

## implementation-planner — compaction (rollout)

The agent definition went from 36797 to 27019 bytes with every order kept, checked by its rule-inventory test. Smoke check (one run per version, low statistical power, not proof): PASS. Full numbers, including tokens per run, are in the plan's Execution Record (plans/done/agents-get-smaller-rollout-s1-implementation-planner.md) and in `.ctoc/eval/implementation-planner/2026-10-06/summary.json`.

## gate-critic — compaction (rollout)

The agent definition went from 168257 to 134683 bytes with every order kept, checked by its rule-inventory test. Smoke check (one run per version, low statistical power, not proof): PASS. Full numbers, including tokens per run, are in the plan's Execution Record (plans/done/agents-get-smaller-rollout-s2-gate-critic.md) and in `.ctoc/eval/gate-critic/2026-10-06/summary.json`.

## product-owner — compaction (rollout)

The agent definition went from 37679 to 30203 bytes with every order kept, checked by its rule-inventory test. Smoke check (one run per version, low statistical power, not proof): PASS. Full numbers, including tokens per run, are in the plan's Execution Record (plans/done/agents-get-smaller-rollout-s5-product-owner.md) and in `.ctoc/eval/product-owner/2026-10-06/summary.json`.

## devils-advocate-critic — compaction (rollout)

The agent definition went from 100675 to 80175 bytes with every order kept, checked by its rule-inventory test. Smoke check (one run per version, low statistical power, not proof): PASS. Full numbers, including tokens per run, are in the plan's Execution Record (plans/done/agents-get-smaller-rollout-s4-devils-advocate-critic.md) and in `.ctoc/eval/devils-advocate-critic/2026-10-06/summary.json`.
