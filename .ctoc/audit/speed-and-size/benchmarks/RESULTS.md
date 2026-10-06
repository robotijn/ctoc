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

