**Answer:** CTOC got slower over 31 July to 2 August 2026, in a batch of commits that all carry version 6.14.36. The cost did not land on ordinary tool calls. Session start roughly doubled, the menu got about 2.7 times slower, and a new hook now runs on every prompt. Since 2 August no commit has changed latency beyond noise. What still grows is the plan archive: every tool call, prompt, session start and menu open gets slower in a straight line as plans pile up, whatever the version. One more change is felt as slowness without being a latency: since 23 July, Claude is not allowed to stop while an approved plan waits to be built.

## Per-call milliseconds at the sampled commits

All numbers are medians of 7 runs, in milliseconds, with the one-minute load between 5.5 and 7.0.

- **Edit call** = the PreToolUse Edit hook + `guard-files.js` + `human-gate-check.js` + the PostToolUse status-check hook + the PostToolUse plan-index-sync hook.
- **Bash call** = the PreToolUse Bash hook + `guard-files.js` + `human-gate-check.js` + the PostToolUse status-check hook.

The registered hook set is the same at every sampled commit, except that the prompt hook first appears in the 2 August column (it was added on 31 July).

| Commit | Date | Version | Edit call: small / repository copy / 1,500 plans | Bash call: small / repository copy / 1,500 plans | Prompt: small / copy | Session start: small / copy | Menu: small / copy |
|---|---|---|---|---|---|---|---|
| 0681623f | 07-20 | 6.12.98 | 105 / 168 / 162 | 87 / 124 / 124 | none | 57 / 184 | 35 / 82 |
| 1a3b67b1 | 07-24 | 6.13.23 | 107 / 154 / 160 | 83 / 110 / 125 | none | 45 / 179 | 37 / 93 |
| 238327ee | 07-27 | 6.13.55 | 115 / 182 / 165 | 100 / 117 / 130 | none | 45 / 177 | 47 / 87 |
| 8b99c853 | 07-29 | 6.13.79 | 110 / 160 / 165 | 89 / 116 / 130 | none | 44 / 219 | 39 / 120 |
| 7a3e52db | 07-30 | 6.14.11 | 131 / 163 / 170 | 90 / 119 / 140 | none | 49 / 223 | 37 / 96 |
| 2833327b | 08-02 | 6.14.36 | 112 / 170 / 168 | 92 / 127 / 134 | 24 / 68 | 47 / **376** | 40 / **276** |
| 69b80cd2 | 09-01 | 6.14.43 | 110 / 167 / 173 | 89 / 125 / 146 | 23 / 69 | 47 / 390 | 39 / 270 |
| 3421bdfe | 09-03 | 6.14.59 | 112 / 183 / 179 | 94 / 127 / 138 | 24 / 74 | 50 / 361 | 40 / 253 |
| e4b5ee58 | 09-25 | 6.14.67 | 106 / 191 / 169 | 88 / 137 / 132 | 24 / 70 | 48 / 344 | 44 / 261 |
| 505db2ab | 10-01 | 6.14.75 | 108 / 206 / 167 | 87 / 138 / 144 | 24 / 70 | 48 / 340 | 40 / 258 |
| cada9682 | 10-05 | 6.14.83 | 111 / 186 / 178 | 90 / 144 / 136 | 24 / 68 | 47 / 345 | 38 / 259 |
| 9b4bdfe4 (HEAD) | 10-06 | 6.14.92 | 110 / 180 / 181 | 88 / 150 / 151 | 24 / 70 | 46 / 342 | 40 / 263 |

**Why there are three state columns.** The repository-copy column drifts upward for Edit and Bash calls, but that drift comes from the state, not the code:
- Every version up to 3 September moves 332 of the copy's plans on its first sweep, because it does not recognise today's approval records. It then sweeps a different set of plans.
- So I added a synthetic state of 1,500 approved plans that every version accepts unchanged.
- On that identical state, the per-call cost is flat. Code added only about 5 ms per Edit and 5 to 10 ms per Bash call:
  - **151fe90a** (27 July): the PostToolUse status-check hook now writes `.ctoc/state/hook-beacon.json` on every tool call. That hook went from 18 to 23 ms.
  - **e01bfa9c** (30 July): the shell-channel coverage check in `PreToolUse.Bash.js` added about 3 ms.

## The commits that caused each jump

I timed every source-changing commit between the sampled commits, rather than bisecting, so each step stands alone.

- **Session start, +146 ms: d47b131c** (31 July, "loopBDirective — the Loop-B tick, surfaced at session start").
  - Timing: 229 → 375 ms on the repository copy; 208 → 346 ms in a 15-run recheck.
  - Change: `src/hooks/SessionStart.js` `main()` now calls `loopBDirective` in `src/lib/loop-b-driver.js`. Timed on its own, that function costs 156 ms at HEAD.
  - Mechanism: it recomputes the list of plans waiting for a decision twice more, after session start has already computed it once. Each pass re-validates every plan in the review, implementation and functional folders. It also reads the functional and implementation plans twice more, and the build queue once.
  - Plan bytes read per session start: 1,194 files and 26.5 MB before, 2,538 files and 61.6 MB after, 3,093 files and 70.8 MB at HEAD.
- **Session start, a further 15 to 30 ms:** fee202e6 (1 August) added `whileYouWereAway` in `src/lib/increment-feed.js`. It reads every review and done plan in full: 11.4 MB, 43 ms on its own. 77b18dc3 changed `src/lib/continuation-queue.js`. Their two increments are within noise of each other.
- **Menu, +165 ms: 2833327b** (2 August, "the two-loop status is on the desktop").
  - Timing: 96 → 261 ms on the repository copy.
  - Change: `streamingGateScreen` in `src/lib/streaming-gate.js` now prepends a new `engineStatusBanner`, which runs `whileYouWereAway` and `loopBDirective` on every menu open. A copy of the same banner was added to `src/tabs/overview.js`.
  - Plan reads per menu open: 455 files and 12.1 MB before, 2,087 files and 51.9 MB after, 56.5 MB at HEAD.
- **A new cost on every prompt: 3edfc646** (31 July, "a per-request CTOC-routing reminder hook").
  - Adds `src/hooks/UserPromptSubmit.js`, which calls `buildReminder` in `src/lib/ctoc-routing-reminder.js`.
  - Cost: 24 ms per prompt on the small project, about 70 ms on the repository copy.
  - Mechanism: it counts plans through `state.getPlanCounts`, which reads the full content of every plan in every folder (669 files, 14.3 MB per prompt) only to count them. The in-memory cache in front of it does nothing, because every hook is a fresh process.
- **Minor:** session start drifted about 30 ms over 27–28 July. In 15-run rechecks: 177 ms before, 191 ms by c7e2f019, 208 ms at a4e10827. This is small next to the jumps above.

**When users got it.** The remote branch history on this machine shows these commits pushed between 31 July at 00:24 and 2 August at 22:54, then nothing until 31 August. That matches users saying "within roughly the last two months". The mapping is by commit time, because history was rewritten on 5 October and the remote hashes no longer match the local ones.

## Does it grow with use? Yes, with the plan count; the logs are bounded

Medians at HEAD, in milliseconds, from two separate runs that agree:

| Plans in the project | 3 | 300 | 1,500 | 3,000 |
|---|---|---|---|---|
| Gate sweep (`human-gate-check.js`, every tool call) | 22 | 32 | 67 | 109 |
| Edit hook | 26 | 30 | 43 | 52 |
| Prompt hook | 24 | 35 | 78 | 129 |
| Session start | 46 | 109 | 317 | 569 |
| Session start, 20 July code | 46 | 69 | 150 | 255 |
| Session-start text injected into context | 3.2 KB | 7.2 KB | 21.8 KB | 40.3 KB |
| Menu | 40 | 80 | 225 | 393 |

- **Plan count.** The 20 July code costs exactly the same for the gate sweep (21 / 32 / 67 / 108) and the Edit hook. That growth is old and linear: every tool call reads every plan in the implementation, todo and done folders, plus its approval record. At 3,000 plans, an Edit call costs about 225 ms, against about 110 ms on a fresh project. The new code made session start both higher and steeper.
- **Enforcement log.** `.ctoc/logs/enforcement.json` is read and rewritten whole on every Edit, but it is capped at 1,000 entries:

  | Entries in the log | Edit hook median |
  |---|---|
  | 0 | 27.8 ms |
  | 1,000 | 31.9 ms |
  | 10,000 | 32.3 ms; the first call takes 65 ms and trims the log back to 1,000 |

- **Approval ledger and violations log.** Neither has any effect:
  - 10,000 entries in `gate-violations.json`: 22.4 → 21.5 ms.
  - 5,000 extra approval records with no matching plan: no change at all.
- **Transitions log.** It has no cap and is read whole on every plan move, but that is not on any hook path, so I did not time it.
- **Session transcript.** This grows within a session. When an edited file is covered by no plan, the Edit hook reads and parses the whole transcript: 28 ms at 1.5 KB, 40 ms at 10 MB, 80 ms at 50 MB. My Bash write command was blocked before it reached that code, so the Bash side of this is not measured.

## Not a latency, but felt as "slower": the stop gate

- **3c95fe9b** (23 July) makes `src/hooks/stop-continuation-gate.js` block every attempt to stop while any approved plan waits to be built. Its parent, 84d08274, lets the stop through.
  - It allows up to 100 blocks (`MAX_QUEUE_BLOCKS` in `src/lib/continuation-queue.js`).
  - No hook checks `stop_hook_active`.
- **eb796716** (31 July) grows the blocked-stop message from 409 to 1,407 bytes. The message now tells Claude to "dispatch UP TO 5 CTOC subagents IN THE BACKGROUND".
- At HEAD on the small project, every Stop exits 2 with "Build next: …" plus that dispatch order. So a user with one approved plan sees Claude keep working instead of answering.
- On the repository copy the stop was allowed; I did not establish why.

## Caveats

- **Felt latency may be lower than the sums.** I believe, without having checked it here, that Claude Code runs the hooks for one event in parallel. If so, the felt per-call latency is closer to the slowest hook per event than to the sums in the table; on the larger states the slowest is the gate sweep.
- **Side finding: a project CTOC sets up itself never gets edit enforcement.**
  - The setup code (`initProject`) writes a `CLAUDE.md` with neither of the two strings the detector looks for, "# CTOC Project Instructions" or "program: ctoc-".
  - At HEAD, the Edit hook therefore logged that fresh project as not a CTOC project and let every edit through.
  - `<home>/Code/CLAUDE.md` also lacks both strings.
  - I added the second string to both test projects so the enforcing path would be the one measured.
- **The main working tree is untouched.** All 73 worktrees are removed, and the main checkout is still on HEAD 9b4bdfe4 with its uncommitted changes as they were.

Everything is in `<temporary folder>`:
- `matrix-final.jsonl`: the sampled commits on the small project and the repository copy
- `syn.jsonl`: the sampled commits on the 1,500-plan state
- `scan.jsonl`: every commit in the two jump ranges
- `growth.jsonl` and `growth2.log`: the plan-count, log, transcript and ledger growth tests
- `after.log`: the stop-gate results and the session-start rechecks
- `after2.log`: the plan-edit post-hook timings
- `bench.js`, `growth.js` and `count.js`: the scripts that produced them
