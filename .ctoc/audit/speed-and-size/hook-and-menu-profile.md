In CTOC's own repository, the hooks add about 95–100 ms to every tool call today. One hook accounts for half of that: `human-gate-check.js`. It runs before every tool call, including Read and Grep, and each time it re-reads and re-hashes all 436 plans in the implementation, todo and done folders. In a small fresh project the same hooks add about 53 ms per call, and that is almost all the cost of starting `node` (about 20 ms per process, run in two rounds per call).

The slowdown over the last two months comes from more plans, not from new hook code. Today's code run on the 2 August data is as fast as the 2 August code was. CTOC's slow parts scan every plan, so their cost grows with each plan you add.

**How I measured.** The load average on the 18-core machine (6 performance and 12 efficiency cores) was 3.7 at the start, 6–7 during most runs, peaked near 15, and ended at 9.8. Other software was busy (OrbStack at 160% CPU, a browser at 90%). Absolute times moved by up to 1.7 times between runs: the gate check measured 53, 64, 70 and 111 ms. For that reason, every comparison below was run back to back at load 6.0–6.4, with all hooks run once per round, ten rounds.

I ran everything on copy-on-write copies in the scratchpad, never on the real repository, with the home folder redirected to scratch. At the end, the real repository's plan counts and log files were identical to the start. Node 24.14.1; `node` on an empty script takes 18–20 ms (the floor below), and the shell wrapper adds about 3 ms.

## 1–2. Hook wall-clock times (median / maximum, milliseconds)

| Hook (event) | CTOC repo today | Small project | CTOC repo, 2 August code and data |
|---|---|---|---|
| Empty `node` script (floor) | 20.0 / 23.9 | 20.0 / 22.8 | 20.1 / 22.5 |
| `human-gate-check.js` (before every tool call) | **70.0 / 151.8** | 26.8 / 28.8 | 48.7 / 53.4 |
| `PreToolUse.Edit.js`, edit of `src/lib/state.js` with no plan covering it (blocked) | 51.7 / 72.3 | 25.5 / 27.8 (not enforced, see "Noticed") | 29.6 / 36.4 |
| `PreToolUse.Edit.js`, edit covered by the in-progress plan | 31.6 / 32.9 | – | – |
| `guard-files.js` (before Read, Edit, Write, Bash) | 20.0 / 25.0 | 20.8 / 21.8 | 20.2 / 21.6 |
| `PreToolUse.Bash.js` (`git status`) | 28.5 / 35.1 | 28.0 / 28.8 | 29.1 / 33.1 |
| `PreToolUse.Task.js` | 26.3 / 31.4 | 25.6 / 28.6 | 25.7 / 29.0 |
| `PostToolUse.status-check.js` (after every tool call) | 28.2–29.3 / 43.3 | 24.6–25.3 / 28.5 | 27.1–28.1 / 31.3 |
| `PostToolUse.plan-index-sync.js` (after Write, Edit, MultiEdit) | 22.6 / 28.1 | 22.2 / 27.9 | 22.9 / 27.2 |
| `UserPromptSubmit.js` | **76.2 / 112.1** | 21.8 / 24.1 | 60.1 / 72.7 |
| `SessionStart.js` | **530.9 / 599.2** | 62.2 / 65.4 | 229.5 / 311.8 |
| `stop-continuation-gate.js` | 21.0 / 25.7 | 41.9 / 45.8 (blocks the stop) | 22.3 / 29.4 |
| `stop-test-gate.js` (turned off, exits at once) | 22.2 / 27.8 | 22.5 / 25.5 | 22.3 / 33.3 |
| `SubagentStop.js` | 23.4 / 31.2 | 25.8 / 27.6 | 25.6 / 32.1 |

**Total per ordinary tool call.** "Parallel" means all hooks of one phase launched at once and timed until the last one finished. I believe, but did not verify, that Claude Code runs matching hooks this way.

| Tool call | Repo today: before + after (parallel) | Repo today: sum of medians | Small project, parallel | Repo, 2 August, parallel |
|---|---|---|---|---|
| Edit (5 node processes) | 70.6 + 29.8 = **100** | 194 | 27.9 + 25.5 = 53 | 47.1 + 26.3 = 73 |
| Bash (4 processes) | 68.0 + 28.5 = **97** | 147 | 30.0 + 25.1 = 55 | 47.4 + 26.2 = 74 |
| Read (3 processes) | 66.4 + 28.7 = **95** | – | 26.9 + 24.7 = 52 | 46.5 + 26.8 = 73 |
| Grep, Glob, WebFetch (2 processes) | 65.4 + 28.7 = **94** | – | 27.2 + 24.7 = 52 | 44.2 + 26.8 = 71 |

This repository's 110 transcripts hold 5,902 tool calls over about 336 user turns: Bash 38%, Read 24%, Grep 18%, Edit 8.5%, WebFetch 6%. That is about 17.6 tool calls per turn, so about **1.7 seconds of hook time per turn** here and about 0.9 seconds in a small project.

I also ran today's hooks on a partial copy of a real user project, a user project (488 plans). Every tool call cost about 87 ms and session start 427 ms. The first sweep in that copy reverted plans (see "Noticed"), so those numbers are less clean.

## 3. The menu (5 runs, median / maximum, milliseconds)

| Command | Repo today | Repo, 2 August code and data | Today's code on 2 August data | Small project |
|---|---|---|---|---|
| `start.js` (default gate-decision screen) | **402 / 437** | 192 / 207 | 184 / 211 | 46 / 55 |
| `start.js dashboard` | 109 / 136 | 102 / 108 | 101 / 111 | 45 / 47 |
| `start.js browse todo` | 50 / 53 | 44 / 50 | 42 / 45 | 38 / 41 |
| `start.js inbox` | 108 / 169 | 91 / 108 | 95 / 106 | 45 / 47 |

## 4. Where the time goes

- **`human-gate-check.js`, functions `main` → `checkFolder`.** These spend 44 of the 49 ms the profiler sampled.
  - Reading files is 24 ms, SHA-256 hashing 8.8 ms, and walking the plan headings for the specification hash about 3 ms.
  - Every tool call does 1,361 synchronous file-system calls: 883 reads of 864 files (436 plans plus 436 approval-ledger entries, 9.3 MB) and 461 file-existence checks.
  - The cost grows by about 0.11 ms per plan in the three gate folders.
- **`UserPromptSubmit.js`.** The reminder builder calls `state.getPlanCounts`, which calls `readPlans` (41.5 ms of 54).
  - It reads and parses all 687 plan files (14.5 MB) and runs 733 stat calls and 610 existence checks, only to print 6 counts.
  - It even reads `done/`, which the reminder never uses.
- **`SessionStart.js` and the default menu share the same costs.** Counted by wrapping the functions:
  - `computeDocCounts` runs **39 times** with an identical result, about 155 ms: it walks the 182 folders under `agents/` and `skills/` each time.
  - `validateTransition` runs **576 times**, about 245 ms.
  - `pendingGateDecisions` is recomputed 3 times at session start and 2 times in the menu.
  - Session start makes 26,897 synchronous file-system calls (4,634 reads, 85 MB, 7,595 folder listings). The menu makes 23,855 calls and reads 61 MB; it lists `plans/functional` 62 times and reads each functional plan 8 times.
  - The `computeDocCounts` cost only exists in CTOC's own repository, because user projects have no `agents/` or `skills/` folder.
- **`PreToolUse.Edit.js` when it blocks an edit.** It runs the plan-coverage scan twice (`findCoveringPlan`, then `explainDenial`), so it reads the 135 todo plans twice. It also reads the transcript: a 10.8 MB transcript added about 10 ms.
- **`PostToolUse.status-check.js`.** It loads `version.js`, which pulls in `https` (5.7 ms of loading). On every call it also reads the 72 `.md.status` files and writes `hook-beacon.json`.
- **Ruled out, with numbers:**
  - Child processes: none. No hook or menu command starts git, npm or node on the measured paths, counted by wrapping `child_process`. The only exception is one detached background node at a project's first session start.
  - Growing logs: `transitions.json` (183 KB) is read by no hook and not by the menu. `enforcement.json` is 6.3 KB with 30 entries. Its append reads and parses the whole file twice, but even at the 1,000-entry cap (344 KB) that costs 1.4 ms.
  - Module loading: the per-call hooks load 2–21 modules in 0.2–4.9 ms; session start loads 61 modules in 17.7 ms.
  - The 19,893-file `~/.ctoc/state` folder is never listed.

## 5. Ranked causes (CTOC repository, today)

| # | Cause (file, function) | Cost | Evidence | Likely fix (not applied) |
|---|---|---|---|---|
| 1 | `src/hooks/human-gate-check.js` `main`/`checkFolder` → `approval-residency.classifyResidency` → `approval-ledger.contentMatches` | **About 50 ms above the floor on every tool call.** It is the slowest hook before every call: 70 ms against 28–52 for the others. | 436 plans and 436 ledger files read, 405 hashed, on every call | Remember each plan's verdict by path, size and modification time, plus the ledger file's time. A sweep that only stats the 436 plans measured 20.6 ms against a floor of 18.4. Also stop registering it on every tool (`*`): Read, Grep, Glob, WebFetch and Agent cannot move a plan (about half the calls). Saves about 40–45 ms per call. |
| 2 | Node startup per hook process (`.claude-plugin/hooks.json`) | About 20 ms per process plus 3 ms for the shell. Two rounds per call means at least about 45 ms of wall time; 2–5 processes means 40–100 ms of CPU per call. | All of the cost in a small project (53 ms against a floor of about 40) | One dispatcher process per event instead of 3. |
| 3 | `src/hooks/PostToolUse.status-check.js` on every tool | About 28 ms per call: it is the only after-call hook for about 90% of tool calls. 5–9 ms of it is above the floor. | Loads `https`, reads 72 status files, writes a file every call | Narrow its matcher, drop the `version.js` import. Removes the whole after-call round for Read, Grep and Bash (about 25–29 ms). |
| 4 | `src/hooks/PreToolUse.Edit.js` blocked path | +20 ms, only on edits it blocks (8.5% of calls are Edit) | Coverage scan runs twice, plus the transcript read | Return the denial reason from the first scan. |
| 5 | `src/lib/state.js` `getPlanCounts`/`readPlans`, used by `ctoc-routing-reminder.collectState` | 76 ms **per prompt** (55 above the floor) | 687 files and 14.5 MB read to produce 6 counts | Count files with a folder listing only (measured 0 ms above the floor). |
| 6 | `doc-counts.computeDocCounts` (39 times), `plan-validator.validateTransition` (576 times), `streaming-gate.pendingGateDecisions` (2–3 times) | 531 ms **per session start**, 402 ms **per menu open** | Call counts above | Compute each once per process. Estimated under 150 ms; not measured. |

**Why it got slower over two months.**
- **Plan counts.** On 2 August (v6.14.36) the repository had 376 plans, 239 of them in the gate folders; today it has 601, 436 in the gate folders.
- **Code since 2 August is not the cause.** Today's code on the 2 August data measured: gate check 45 ms against 49 for the old code, prompt hook 57 against 60, session start 218 against 230, menu 184 against 192.
- **More plans is the cause.** The per-call cost rose from 73 to 97 ms (+33%), per prompt from 60 to 76 ms, session start from 230 to 531 ms (2.3 times), and the menu from 192 to 402 ms (2.1 times). `hooks.json` has not changed since 31 July. Your other projects are on the same path: a user project has 488 plans, another of the owner's projects 344, a third 321.

**Probably bigger than all of the above, but I could not measure it.**
- **Session start asks the model to do work first.** In this repository it adds 17 KB of context (12 KB on 2 August). That includes "Before other work, dispatch UP TO 5 CTOC subagents…" followed by a list of 192 plans (136 on 2 August).
- **The Stop hook keeps the turn going.** `stop-continuation-gate.js` refuses to let the turn end whenever approved plans are queued, and repeats the same instruction to start subagents. I saw this in the small project, which had 3 approved plans waiting. These behaviours were added between 23 July and 1 August, and they turn hook milliseconds into minutes of model time.

## Noticed, not performance

1. **Today's code would revert 137 plans in a user project.** In a copy of a user project, today's gate check reverts 137 plans on the first tool call: 136 from done to review because their hash no longer matches, and 1 because its ledger entry records a different gate move. The real a user project is untouched. A dry classification of a fresh copy shows the same 137. Running the 2 August code on today's CTOC data also reverted about 150 plans in the scratch copy, so running mismatched versions moves plans around.
2. **Fresh projects are not enforced.** A project created by `initProject` today is not recognised as a CTOC project. Its `CLAUDE.md` lacks the `# CTOC Project Instructions` heading or a `program: ctoc-` line, so an edit no plan covers is logged as `silent-passthrough` and allowed. The same heading test fails in 15 of your 20 projects that have a `.ctoc` folder.
3. **The subagent hook may not fire.** In the transcripts the subagent tool is called `Agent` (97 calls), but `PreToolUse.Task.js` is registered for `Task`. I did not verify whether Claude Code still matches the old name.
4. **This account runs an older version.** The plugin installed here is 6.14.67, not 6.14.92, so it is not exactly what I measured.

## What I could not measure

- Claude Code's own hook overhead, and whether it really runs hooks in parallel. If it runs them one after another, the "sum of medians" column is the real cost: 194 ms per Edit and 147 ms per Bash.
- Model and subagent time caused by the injected instructions.
- Cold disk cache, Windows and Linux.
- The installed 6.14.67 hooks.

The ranking stays the same under heavier load, but the absolute numbers rise by about 1.7 times: about 140 ms per tool call at load 15.

All raw numbers, profiles and scripts are in `<temporary folder>`:
- Hook timings: `results2-C-now.json`, `results2-C-small.json`, `results2-C-then.json`, `results2-C-newcode-olddata.json`, `results2-C-real-a user project.json` (and `results2-repo-A.json`, the high-load run)
- Menu timings: `menu-menu-now.json`, `menu-menu-then.json`, `menu-menu-newcode-olddata.json`, `menu-menu-small.json`
- File-system and module counts: `counts-ctoc-repo-count.jsonl`, `counts-small-count.jsonl`, `menu-count.jsonl`; function call counts: `calls.txt`
- CPU profiles and summaries: `profiles/repo/*.txt` and `*.cpuprofile`
- Scripts: `harness2.js`, `menu.js`, `preload-*.js`, `analyze-prof.js`
- Files prefixed `INVALID-data-mutated-` come from a run whose copy had been changed by the old code; I discarded them.
