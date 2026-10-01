# Handoff — CTOC: the improvement run's slice s5 is built and in its second final review; six plans wait for the human

<!-- Maintained by hand. Left by the previous Claude instance so the next one can
     continue. Treat as last-known state — VERIFY EVERY CLAIM AGAINST DISK, INCLUDING
     THIS FILE. -->

- Updated: 2026-10-01 13:08 by claude
- Branch: main
- Status: in progress

## The human's standing rulings (verbatim where quoted)
- "keep going until everything is done then commit and push" — NO push until all done.
  Commits happen at natural completion points (one per finished slice, patch bump).
- "stop asking theswe stupid questions fix it" — settle forks as documented choices;
  only REAL forks (risk, scope, schedule) go to him, flat, no recommendation.
- Improve every skill and agent 3 times via web research (plan
  `every-agent-and-specialist-skill-improved-three-times`, 121 slices, s4 done, s5 at its last step).
- README rebuild (15 slices, queued), deepthink + ask-me-questions ship with CTOC (4 slices, queued).
- "ctoc is overdoing the usage of ctoc" → `small-changes-take-a-small-path` sliced into 14
  (plans/implementation/00401–00414), waiting for his read + the "how to build" click.
- Menu: only start/update/deepthink/ask-me-questions (built, in review, waiting for "finished").
- Testing agents: affected tests while building, full suite only before push → functional plan
  written (`plans/functional/affected-tests-while-building-whole-suite-before-push.md`), waiting.
- Never say a gate number or plan number to him; plain words; no invented abbreviations.

## Where things stand
| Work | Stage | State |
|---|---|---|
| Menu fix (single plan) | review | built, v6.14.71 (f1404379); waiting for "finished" |
| s4 hallucination-detector agent+skill | review | built, v6.14.72 (12e5c009); waiting for "finished" |
| s5 llm-security-tester agent+skill | review (task t120 completed) | DONE and committed as v6.14.73. Four final-review passes; kickbacks 2 to Step 10, 3 to Step 15, 5 total = circuit breaker reached; the human chose "complete it now" (2026-10-01 13:35) — the last three returns were plan prose only; the two files were judged ready at final review #2 and never changed after (agent sha256:357b4c70…, skill sha256:9ebb12d2…; fifth `npm test` 12,035/0/0, 99.9%). Waiting for "finished". |
| s6–s121, README s1–s15, deepthink s1–s4 | todo | approved, queued (birthtime order) |
| 4 functional plans | functional | affected-tests; clean-install (js-yaml); approval-script cannot forge; hooks actually loaded — each has open questions for him |
| small-changes 14 slices | implementation | need his read, then the "how to build" click |

Unpushed: everything since 94334979 (7 commits incl. 12e5c009). Do NOT push.

## The round protocol (worked twice; ~1h per round)
Per file, per round — the SESSION dispatches read-only agents (≤5 in flight) and hands
their reports to ONE long-lived `iron-loop-executor` (SendMessage keeps its context):
1. `citation-validator` research (budget 30–35 fetches; it hits the 40-turn limit — then
   SendMessage "stop fetching, write the report"; a second "gaps" pass with budget ~14).
2. `agent-critic` → findings with exact `proposed_change {old,new}` (old verbatim, unique,
   pairwise disjoint), each sourced with address + read date.
3. `citation-validator` validates every claim in the NEW text (+ checks olds verbatim/disjoint
   + wrapper contract: description one line, no ": " / " #", no approved_by/human_gate/
   review_gate, no skill-body line ≥25 chars copied).
4. Executor applies byte-for-byte via script with the validator's leftovers folded in; runs
   the inventory `tests_reading` + plan fences + record check; new fingerprint.
5. `citation-validator` re-reads the edited file; leftovers → executor.
   **NEVER dispatch this while the executor is still editing** (done once in s5 by mistake —
   the validator saw lines move; remedy was a second, quiet re-read; recorded in the plan).
6. Executor writes the round entry (shape: s4's records; check
   `tests/agent-and-skill-improvement-record.test.js`).
Every report saved VERBATIM to `.ctoc/audit/improvement-run-notes/s5-*` (extract the last
assistant text block from the subagent JSONL with a small Python loop). Session raw reads/runs
go to `s5-*-session-runs.md` and OVERRIDE summarised fetches. Then Steps 11 (iron-loop-critic),
13 (security-scanner), leftovers, 16 (iron-loop-critic), `npm test`, `menu task complete
<id>`, VERSION bump + `node src/scripts/release.js`, commit by name (never `git add -A`).
Round source classes: 1 papers+vendor/registry docs; 2 standards/agencies/peer-reviewed;
3 raw re-reads/regulators/adversarial.
Raw invisible characters (zero-width, bidi, tags, variation selectors) must NEVER be written
literally into a note, a plan or an instruction file — write them as `\uXXXX` escapes.

## s5 specifics
- Files: `agents/ai-quality/llm-security-tester.md`, `skills/ai-quality/llm-security-tester/SKILL.md`,
  records under `.ctoc/audit/agent-and-skill-improvement/{agents,skills}/ai-quality/llm-security-tester*`,
  plus `late-corrections.json` (lc-s5-agent-1..6) and `for-the-human.json` (h-s5-*).
- Notes: `.ctoc/audit/improvement-run-notes/s5-*` — every report verbatim; the executor's three reports
  for the returns are in `s5-second-step10-return-executor.md`; lint/typecheck in `s5-lint-and-typecheck.md`;
  curl manual in `s5-curl-q-manual.md`; fifth gate run in `s5-npm-test-final.md`.
- Settled facts: OWASP LLM Top 10 2026 edition exists (identifiers carry edition); ATLAS `dist/ATLAS.yaml`
  deprecated (manifest → `dist/v6/ATLAS-2026.09.yaml`); forced tool use → HTTP 400 on current Claude
  models; Postgres RLS keyed on `current_setting` is injectable, key on `session_user`; "Reverse Shell"
  is not an ATLAS technique; the Bash tool's shell here is zsh 5.9 with grep = ugrep 7.8.4; curl 8.7.1
  `-q` first stops `.curlrc` being read (manual quoted); a keycap emoji is digit + U+FE0F + U+20E3.
- Scratch: session scratchpad `secure-s5/` (18-case recipe harness, bash/zsh/tool-shell runs), `secure-s5-r2/`
  (the re-scan's new cases, corpus.txt), `s5code/`, `s5-exec/run_llm01.py`.

## Gotchas
- ONE build at a time on the shared tree. Never render the dashboard while a build runs.
- `menu task complete` refuses a plan whose text says "Step 13 … blocked" unquoted — quote verdicts.
- The fetch tool truncates large files and summarises pages; settle disputes with curl.
- Hooks are NOT loaded by Claude Code (plan `ctocs-hooks-are-actually-loaded-by-claude-code`).
- Installed plugin 6.14.67 lacks js-yaml → `menu task complete` can fail on kickback paths.
- `.ctoc/streaming/questions/` untracked files in the tree are NOT this slice's; leave them.

## Resume here
1. `git status`; confirm v6.14.73 is committed (s5) and NOT pushed. Three plans now wait in review for his
   "finished": the menu fix (v6.14.71), s4 (v6.14.72), s5 (v6.14.73).
2. Start s6 (dependency-analyzer agent + skill; the next todo in `.ctoc/state/todo-order.json` / birthtime):
   `startAgent(root,{force:true})` picks it; dispatch ONE fresh `iron-loop-executor` briefed with the plan,
   Rule 1 files, "read s4's and s5's records for the shape", then the round protocol above. Lessons from s5
   to brief every reviewer and the executor with: never validate while the executor edits; write hidden
   characters as escapes; when a later run supersedes an earlier one, rewrite every sentence that called the
   earlier one "final"/"current" at the SAME time (the s5 plan took three documentation returns for that).
3. Then README slices; deepthink slices. Surface the four functional plans' questions and the small-changes
   slices when he asks.
