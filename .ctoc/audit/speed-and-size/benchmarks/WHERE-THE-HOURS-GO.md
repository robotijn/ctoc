# Where the hours go

**Short answer.** The transcripts on this machine only go back to 18 August 2026, so the
comparison with July cannot be made from them. What they do show, for 18 August to
6 October 2026, is that CTOC agents spent the largest share of their time waiting rather
than working. About 412 of their 1,045 agent-hours (39%) were spent in "sleep and check
again" polling loops, nearly all of them in September, in the build agent
(`iron-loop-executor`), and in other CTOC projects on this machine rather than in this
repository. A further 132 agent-hours were spent stopped by a Claude usage limit. The
model actually thinking and writing came to 247 hours (24%). The test suite is not the
cause: one full `npm test` run took a median of 0.8 minutes, and all test runs together
came to 8.5 hours. Between September and October the polling and the usage-limit stops
almost disappeared, but a new pattern appeared. In October the build agent was told to
continue after it had already finished 52 times across 22 runs, and those runs sat finished
for 95 hours in total before being resumed. The slowest tenth of human turns also got
slower, from 17 minutes in September to 22 minutes in October.

All hour figures are agent-hours: agents run in parallel, so these totals add up time
across agents and are not clock time.

## The causes, ranked by hours (CTOC agents, 18 August to 6 October 2026)

| Rank | Cause | Agent-hours | Share | Measured or inferred |
|---|---|---|---|---|
| 1 | Polling: the agent runs a `until …; do sleep …; done` style loop, or sits silent while one is still running | 412.2 | 39% | Measured. That these loops mostly wait on a background test or build log is **inferred** from what the commands look like: in a one-off count of the 1,564 polling commands, 75% read a log file, a background task's output file, or a test result marker such as "# fail". |
| 2 | Model thinking and writing (from a tool result to the next reply) | 247.4 | 24% | Measured |
| 3 | Other tools (reads, searches, edits, web fetches, other shell commands) | 168.8 | 16% | Measured. This includes 60 hours of shell commands the script could not name, and 33 hours of `until` loops with no `sleep` that are probably also waits (**inferred**). |
| 4 | Stopped by a usage limit: the time from a usage-limit error until the agent's next real reply | 131.8 | 13% | Measured. All of it was in September, and half of it was in the four `cto-chief` runs. |
| 5 | Silence over 30 minutes with no tool running | 42.3 | 4% | Measured. The cause is **inferred**: most likely a paused or suspended session. |
| 6 | Silence over 30 minutes while a non-polling tool was running | 33.8 | 3% | Measured. In October, 16.3 hours of this came from file writes that took over 30 minutes to return. The likely cause is a permission prompt that nobody answered, or a session that was closed and resumed (**inferred**). |
| 7 | Test runs (`npm test` and `node --test`) | 8.5 | under 1% | Measured. This counts only runs where the agent waited for the test command itself; runs launched in the background and then polled are counted under rank 1. |

These seven causes add up to the 1,045 working agent-hours. There are two more measurements
that sit outside that total:

- **Agents that sat finished until told to continue.** This is not counted as the agent's
  own time, but someone was waiting through it. In September, 96 resumes left agents
  sitting finished for 72.8 hours. In the first six days of October, 58 resumes did the same
  for 95.2 hours, and 52 of those 58 were build agents.
- **Usage limits across every session, not just agents.** There were 212 usage-limit hits
  in September and 25 in the first six days of October. They were followed by 334.8 and
  67.1 hours of silence respectively, summed over every session and agent that was stopped.

## What the polling loops waited on, and whether the wait was needed

The script links each polling loop in a CTOC agent to the job it was waiting on. It first
looks for the most recent earlier launch whose background task, output file or log file the
loop reads. If none matches, it falls back to the most recent launch that was still running;
those links are labelled "inferred". It then splits the 412.5 polling hours by the state of
that job at each moment. There were 2,656 loops, waiting on 715 jobs. 576 loops (22%) ran
past their own command timeout and were moved to the background, and 110 never returned at
all before the run ended.

| State of the awaited job while the loop was polling | Hours | Share |
|---|---|---|
| Launched with `nohup` or a trailing `&`, so the job's end left no record and needed and wasted time cannot be told apart | 200.6 | 49% (83.2 of it linked by timing, inferred) |
| The job had already finished and the loop kept polling (wasted) | 90.9 | 22% |
| The job was still running (needed) | 70.8 | 17% |
| The job never reported finishing (it hung, was killed, or the run ended first) | 33.3 | 8% |
| No launch found in the same run (another agent's output, or a file written elsewhere) | 16.9 | 4% |

How the jobs were launched, by polling hours:

| Launch method | Polling hours |
|---|---|
| The harness's own background option (`run_in_background`) | 185.6, of which 90.6 were wasted after the job had finished |
| `nohup` | 136.2 |
| A trailing `&` in the shell | 64.4 |
| A command that ran past its timeout and was moved to the background | 9.5, of which 0.4 came from the default 2-minute timeout |

The jobs themselves were mostly builds and test runs: shell scripts (168 polling hours),
`npm run` (53), `cargo build` and `cargo test` (57), `cargo clean` (15) and `find` (20). Of
the 715 jobs, the 343 whose end was recorded ran for 86.8 hours in total, which is about a
fifth of the 412.5 polling hours.

Almost all of this happened in other CTOC projects on this machine in September. October
recorded 5.8 polling hours in total. No CTOC agent definition or skill tells an agent to
poll; a presence check found no such instruction. The likely cause is therefore a habit of
the model rather than a CTOC instruction (**inferred**). An agent puts a long build or test
run in the background, then blocks itself in a foreground `until grep …; sleep` loop. While
that loop runs, the "job finished" notice cannot reach the agent, so the loop keeps going
until its marker appears or its own timeout runs out. The 2-minute default timeout is not
the trigger: only 0.4 hours trace back to it.

## Tables by month

"No data" means there are no transcripts for that month. It does not mean zero.

### Overview

| Month | CTOC agent runs (this repository) | CTOC agent working hours | Other agent runs | Human turns | Median human wait | Slowest tenth of waits (90th percentile) | Turns over 10 minutes | Turns over 1 hour | Usage-limit hits | Full `npm test` runs inside agents (median minutes) |
|---|---|---|---|---|---|---|---|---|---|---|
| June 2026 | no data | no data | no data | no data | no data | no data | no data | no data | no data | no data |
| July 2026 | no data | no data | no data | no data | no data | no data | no data | no data | no data | no data |
| August 2026 (from the 18th) | 6 (3) | 1.1 | 12 | 33 | 1.7 min | 16.1 min | 6 | 1 | 0 | none recorded (5 single-file `node --test` runs) |
| September 2026 | 924 (115) | 973.9 | 310 | 1,390 | 0.7 min | 17.0 min | 171 | 75 | 212 | 81 (0.8) |
| October 2026 (1st to 6th) | 170 (169) | 70.3 | 97 | 285 | 0.8 min | 22.0 min | 44 | 11 | 25 | 57 (0.8) |

The human wait covers every project on this machine, not only CTOC. A turn runs from the
human's message to the last assistant message before the human's next message, so it
includes time the turn spent waiting on background agents that woke it again.

### Hours by cause and month (CTOC agents)

| Cause | August | September | October 1st to 6th | October, this repository only |
|---|---|---|---|---|
| Polling loops | 0 | 406.4 | 5.8 | 5.8 |
| Model thinking and writing | 0.9 | 215.7 | 30.8 | 30.7 |
| Other tools | 0 | 163.2 | 5.6 | 5.6 |
| Stopped by a usage limit | 0 | 131.8 | 0 | 0 |
| Silence over 30 minutes, no tool running | 0 | 37.1 | 5.2 | 5.2 |
| Silence over 30 minutes during a tool | 0 | 13.2 | 20.6 | 20.6 |
| Test runs | 0 | 6.4 | 2.1 | 2.1 |
| Sitting finished until resumed (not counted above) | 0 | 72.8 | 95.2 | — |

In September, only 0.3 of the 406 polling hours came from this repository; the rest came
from other CTOC projects on this machine (8 of them ran CTOC agents).

### The main agent types, by month

| Month | Agent | Runs (this repository) | Median minutes | 90th percentile minutes | Working hours | Median input tokens on the first turn (this repository) | Median output tokens | Median tool calls | Times resumed after finishing |
|---|---|---|---|---|---|---|---|---|---|
| September | iron-loop-executor | 274 (34) | 60.3 | 232.3 | 696.1 | 33,252 (62,885) | 37,445 | 106 | 58 |
| October | iron-loop-executor | 22 (22) | 19.5 | 249.4 | 35.6 | 62,013 | 69,461 | 92 | 52 |
| September | implementation-planner | 220 (15) | 16.5 | 27.9 | 75.8 | 41,351 (71,186) | 40,482 | 66 | 2 |
| October | implementation-planner | 11 (11) | 28.0 | 31.4 | 4.8 | 69,855 | 177,897 | 110 | 4 |
| September | the four question critics (premortem, devil's advocate, red team, gate) | 133 (0) | 10.6 to 12.6 | 12.2 to 17.0 | 26.2 | 57,024 to 79,873 | 52,778 to 74,627 | 14 to 37 | 0 |
| September | citation-validator | 36 (34) | 10.2 | 14.1 | 6.0 | 72,767 (72,782) | 54,902 | 48 | 11 |
| October | citation-validator | 49 (49) | 9.2 | 12.8 | 9.1 | 72,142 | 52,289 | 37 | 0 |
| October | security-scanner | 25 (25) | 11.4 | 19.4 | 8.9 | 58,061 | 51,540 | 40 | 1 |
| September | cto-chief | 4 (0) | 1,483 | 3,742 | 90.3 | 45,805 | 162,842 | 134 | 1 |

**The starting context.** In this repository every dispatch starts with about 58,000 to
76,000 input tokens. The build agent starts at about 63,000 tokens here, while its median
across all projects in September was 33,000. The planner starts at about 71,000 here,
against 41,000 across all projects. The question critics start at 57,000 to 80,000 tokens
even in other projects, because their brief carries the plan they are critiquing. The build
agent in this repository started at the same size in September (62,885) and October
(62,013), so within the period we have data for, the starting context did not grow. The
roughly 30,000-token difference for the build agent and the planner matches the instruction
files this repository adds to every agent. Their sizes, measured on 6 October, are 92,943 bytes for this repository's own
CLAUDE.md, 18,729 bytes for the parent folder's, and 10,557 bytes for the user-level one,
which is 122,229 bytes in total. At roughly four bytes per token that is about 30,000 tokens
(the conversion is **inferred**). This makes each dispatch larger, but at these sizes the
cost is seconds per dispatch, not hours.

## How this was measured

The script `pipeline-time.js` reads every Claude Code transcript under both profiles'
`projects` folders, one line at a time. It found 1,520 agent transcripts and parsed 1,519.
The one it could not use contains no user or assistant messages. It also found 365
main-session transcripts. No duration came out negative.

For each agent run, the script splits the wall time between consecutive messages into
causes:

- **Stopped by a usage limit:** after a usage-limit error, until the agent's next real reply.
- **Polling:** any time a polling loop is still running, including in the background.
- **Test runs:** any time a test command is still running.
- **Other tools:** any other tool is still running.
- **Silences over 30 minutes:** a gap of more than 30 minutes, filed separately.
- **Model thinking and writing:** everything else.

A background command counts as running until its completion notice arrives. Time an agent
spends after it has finished, before a new message resumes it, is left out of its working
time and reported separately. Shell commands are recorded only as the program name, plus the
first argument for well-known tools such as `npm test` or `git status`. No command text,
prompt, path, session identifier or project name is written anywhere.

What was not measured: anything before 18 August 2026 (the transcripts are gone, so the July
comparison cannot be made from this data); the size of each agent definition file; tying
runs to plans and counting rework per plan (dropped from scope at the owner's request);
half-month splits (also dropped); and the real duration of test runs that were started in
the background with `&` and then polled, which land under polling.

## How to rerun it for the next fix

Run `node .ctoc/audit/speed-and-size/benchmarks/pipeline-time.js` from the repository root; the polling breakdown is under `pollingLoopsInCtocAgents`
(add `--from 2026-10` to measure only the period after a fix). It rewrites `pipeline-time.json`
in about ten seconds, and the `monthTotals` cause tables in that file give the after-numbers
to compare against the tables above.

## Measured 2026-10-07: before and after the sleep-loop rule (split at 2026-10-06 19:51 +0200)

Same transcript reader as above, October split at the commit that shipped the rule
(a scratch copy that buckets October by that moment; this file's script is unchanged).
"Before" is 2026-10-01 to the cut, "after" is the roughly 17 hours since.

| Measure | Before | After |
|---|---|---|
| CTOC agent runs / hours | 183 / 74.4 h | 64 / 26.4 h |
| Polling (sleep-and-re-check) in CTOC agents | 6.6 h | 0 h |
| Human wait per turn: median / slowest tenth | 0.8 / 22.7 min | 1.7 / 6.2 min |
| Turns over 10 minutes / over an hour | 47 / 14 of 310 | 7 / 2 of 253 |
| Usage-limit hits (silent hours after) | 25 (67.1 h) | 9 (0 h) |

Caveats, all checked: no profile had a CTOC version with the rule or the compactions
installed (installed: 6.14.67, 6.14.94, 6.13.6, 6.14.67; the work is 6.14.95 and later),
so the agents themselves did not change — the polling and wait drops come from the session
briefing every agent never to sleep-loop and running builds in the background. Time per
CTOC agent run is flat (about 24 vs 25 minutes). The two windows differ in length and in
kind of work, so this is an observation, not a controlled comparison. Rerun the split after
`/ctoc:update` and a day of normal work to measure the installed effect.
