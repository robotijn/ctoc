# Model trial — which model should build, 2026-10-08

The owner asked whether Haiku should explore, Sonnet implement, Opus check and Fable lead,
and chose a measured trial over a belief (answer "a", 2026-10-08).

## Method

- **Task:** the approved plan `ctoc-checks-that-a-hotfix-is-really-small-and-safe-s1-the-hotfix-check`
  (a new deterministic check module with its menu route and about 125 test cases).
- **Four arms**, built at the same moment from the same commit (`56fb8b43`) in four identical
  worktrees, each by a headless Claude Code 2.1.293 session running the same agent instructions
  (the iron-loop executor's body, loaded as a custom agent with no model pinned) and the same brief.
  Only `--model`, `--effort` and `--advisor` differed. Duration, turns and cost are from each
  session's JSON output.
- **Quality:** each build was reviewed by its own Opus iron-loop critic, blind (neutral names
  W1–W4, identical brief, findings shared by every build excluded).
- **Fetch test:** two lookups with exact answer keys (which tests load `src/lib/gate-words.js`;
  which test lines contain "nothing is finished until you say so"), run read-only.

## Results — building

| Arm | Model and effort | Time | Turns | Cost | Review | High / medium / low | Builder-caused high |
|---|---|---|---|---|---|---|---|
| A (W3) | Opus 5.5, high (today's setting) | 32.8 min | 83 | $9.29 | ship after fixes | 1 / 6 / 11 | 1 (git name prefixes assumed) |
| B (W1) | Opus 5.5, medium | 32.3 min | 94 | $9.00 | ship after fixes | 1 / 7 / 13 | 0 (its high was a plan gap) |
| C (W4) | Sonnet 5.5, high | 31.7 min | 102 | $8.01 | ship after fixes | 1 / 6 / 22 | 1 (a hole the plan's rule allows) |
| D (W2) | Sonnet 5.5, high, Opus 5.5 advisor | 27.7 min | 68 | $5.71 ($4.94 Sonnet + $0.77 advisor) | ship after fixes | 1 / 6 / 11 | 1 (a file git treats as binary passes) |

All four stopped at the same files the plan did not list (README counts, the screen-module
registry, the cache-freshness whitelist); arm C also hit a timing test that is flaky under load.

## Results — fetching

| Model and effort | Lookup 1 (6 files) | Lookup 2 (2 lines) | Wrong | Time | Cost |
|---|---|---|---|---|---|
| Haiku 5.5, low | 6 | 2 | 0 | 6 s | $0.009 |
| Haiku 5.5, medium | 6 | 2 | 0 | 8 s | $0.009 |
| Sonnet 5.5, medium | 6 | 2 | 0 | 7 s | $0.172 |

## Reading

- Quality is the same band across all four builds; differences are within reviewer counting noise.
- Sonnet with the Opus advisor was cheapest (−39% against today's setting), fastest (−15%) and used
  the fewest turns; the advisor's cost paid for itself. Sonnet alone was slower and dearer than with it.
- Opus at medium matched Opus at high at −3% cost.
- The largest problems came from the plan, not the builders: all four hit the same unlisted files,
  and most shared review findings trace to the plan. Haiku 5.5 fetched every exact lookup correctly
  at about a nineteenth of Sonnet's cost — suited to the lookups the plans missed.
- Caveats: one task, one run per arm, shared machine load, reviewers who count differently.
  Evidence, not proof.

## Effort trial (same day, same plan and commit)

**Builder effort** — arm E: Sonnet 5.5 at medium with the Opus advisor configured, run alone (its
wall time is not comparable with the four arms that shared the machine; turns and cost are).

| Arm | Effort | Turns | Cost | Advisor used | Blind review (W5 vs W2) | Builder-caused high |
|---|---|---|---|---|---|---|
| D | high | 68 | $5.71 | yes ($0.77) | ship after fixes, 1 / 6 / 11 | 1 (binary-file pass) |
| E | medium | 63 | $4.06 | no | ship after fixes, 2 / 7 / 13 (one high inherited from the plan) | 1 (the same binary-file pass) |

At medium the builder never consulted the advisor.

**Reviewer effort** — the same critic instructions reviewed arm D's build three times, headless,
scored against six known important problems in that build.

| Effort | Time | Cost | Known problems found | High findings |
|---|---|---|---|---|
| extra-high (today's reviewer setting) | 21.9 min | $4.54 | 5 of 6 | 2 |
| high | 12.5 min | $4.03 | 5 of 6 | the same 2 |
| medium | 10.7 min | $3.39 | 4 of 6 (missed the git-settings problem) | the same 2 |

Reading: on this build, high found what extra-high found in 43% less time; medium missed one
medium-severity problem. Builder at medium matched high on review quality at 29% lower cost but
stopped consulting the advisor. One build each — evidence, not proof.
