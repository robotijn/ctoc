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
