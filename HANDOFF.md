# Handoff — CTOC: keeps-working (pieces one and two) after the write protection shipped

<!-- Maintained by the `handoff` skill. Left by the previous Claude instance so
     the next one (claude or claudex) can continue. Treat as last-known state —
     verify against the repo before acting. -->

- Updated: 2026-10-07 13:05 by claude
- Branch: main (HEAD `00a64b10`, v6.14.118, nothing unpushed before this commit)
- Status: in progress — paused for a restart; no agent or process running

## Goal
Make CTOC fast and quiet for the owner: agents keep working without bringing him gate or
bookkeeping questions, and only weighty questions (technology stack, algorithms, data model,
security, irreversible, cost) reach him. The work is the parent plan
`plans/functional/ctoc-keeps-working-and-asks-only-what-matters.md`, cut into a write
protection (shipped) and three pieces built in order.

## Current status
- Done and pushed today:
  - v6.14.117 `842e1c00` — all 142 plans that were in review crossed to done on the owner's
    "accept everything in review"; three tests that hard-coded the review folder now check
    their real claims.
  - v6.14.118 `00a64b10` — the ONE CTOC hook Claude Code loads: `hooks/hooks.json` →
    `src/hooks/protect-records.js`. It refuses agent writes (editing tools and shell) to
    `.ctoc/approvals/`, `.ctoc/state/verify/` and `.ctoc/streaming/` (the waiting folder
    `questions/pending/` stays writable to the editing tools); the menu's own `start.js`
    routes pass, matched by real path; refusals exit 2 with the reason on stderr. Live-probed
    with `claude -p --plugin-dir <branch>`: both probe writes refused, `ls` ran.
- In progress — piece one, "only weighty questions reach the human":
  - Plan: `plans/todo/ctoc-keeps-working-and-asks-only-what-matters-s1-only-weighty-questions-reach-the-human.md`
    (untracked in main; its approval `.ctoc/approvals/…-s1-….json`, spec hash `bcd9cc8c…`,
    untracked, backfilled by the session under the owner's standing instruction).
  - Built on worktree `.claude/worktrees/agent-a0b33c6c216a2989c`, branch
    `worktree-agent-a0b33c6c216a2989c` (pushed as `origin/keeps-working-piece-one`, `c05f4dbe`, with its approval record), last build commit `f4838d93`, full suite green (12,612
    passed, 0 failed, 0 skipped, coverage 99.88%). Not merged, not pushed.
  - Review history: critic SHIP AFTER (twice) and security BLOCK (twice); every listed fix is
    built. The second security BLOCK's fixes (reserved ids only in an attested synthesis file;
    the inventory approval check requires a matching hash and the rule id inside the
    specification; an unreadable answers log never ignores a hold; Unicode-wide
    invisible-character class) are in `f4838d93` but NOT yet re-scanned.
- Next — piece two, "plans cross on their evidence":
  `plans/implementation/ctoc-keeps-working-and-asks-only-what-matters-s2-plans-cross-on-their-evidence.md`
  (committed), amended by the planner and ready to cross to todo: CTOC's fixed
  hold question id `ctoc-hold` with "Hold this plan" / "Keep holding" / "Release the hold";
  `streamAnswer` writes `holds` into the protected answers log; a held plan's screen asks keep
  or release first; a `classify` task launched by the continuation so the gate critic
  classifies an author's questions; the hook refuses every non-allowlisted menu route when the
  payload carries `agent_id` (route tables are in the plan). Then piece three (instructions say
  what the code does), `…-s3-instructions-say-what-the-code-does.md`.

## Key decisions
All from the owner on 2026-10-07, each answered "a" or "yes" to a recommended option:
- Load exactly one hook, the write protection; every other CTOC hook stays hidden.
- It also protects his recorded answers and live question files.
- The independent gate critic assigns every question topic; the author's topic is only a
  proposal; an unclassified question file blocks every question (fail closed).
- The hook also refuses the menu's answer and approve routes when a subagent calls them
  (Claude Code puts `agent_id` and `agent_type` in hook input only for subagent calls:
  https://code.claude.com/docs/en/hooks).
- Earlier standing rules: ask only high-stakes questions (never gate or bookkeeping ones); lean,
  small pushed increments; quiet foreground (git and bookkeeping in the background); use CTOC's
  own agents; every edit by background agents; verify beliefs; no private personal information
  on GitHub (only the owner's name and work email may be public).
- Session decisions: pieces one and two ship TOGETHER (piece one alone would stop important
  detail findings from blocking before piece two writes them into the plan); scope widenings are
  re-recorded by the session with `ledger-backfill.js` and a written reason, and piece one's
  approved specification lists the exact 36 agent-inventory rules it replaces or adds.

## Open questions / blockers
- None waiting on the owner.
- The owner must run `/ctoc:update` in every profile: installed CTOC is 6.14.67 (claudey,
  claudez), 6.14.94 (claude) and 6.13.6 (claudex), so none has the speed work or the hook.
- Recommended later: add gate-critic rules R-182 and R-205 to piece one's replaced list (they
  now understate the code: a ruling without attestation is refused).

## Gotchas
- After `/ctoc:update`, a session can no longer run `ledger-backfill.js --plan` or a
  `node -e` call to `approvePlan`, `streamApprove` or `persistVerifyResult`: the hook refuses
  them. Cross plans through the menu's own routes.
- A plan's `files:` list and its specification text are inside the approval hash. A builder
  must never widen them; the session widens, re-records, and gives the builder the exact lines
  to insert, and the builder confirms the hash before editing. Checkbox state, the
  `## Execution Record` and `## Decisions Taken Under Ambiguity` are outside the hash.
- CTOC's approval step appends a blank generic Steps 8–16 template to plans that already have
  their own; tick it with a note pointing at the real record, or remove it and re-record.
- Tests that read live repository state (the review folder, the backfilled-entry count, the
  stored question files) break when plans cross; three were fixed today.
- `ship-many.sh` and `ship-crossings.sh` lived in the session scratchpad and are gone; the flow
  was: tick Steps 8–16 with an accurate note, `move-plan.js todo/<slug>.md in-progress`,
  `node src/commands/start.js menu task add implement <slug> --touches plans/in-progress/<slug>.md`,
  `menu task start <id>`, `CTOC_VERIFY_TIMEOUT_MS=900000 … menu task complete <id> --summary "…"`,
  approve review→done, bump VERSION, `node src/scripts/release.js`, stage by name, check the
  staged names against
  `^plans/functional/|00266|dependency-analyzer|HANDOFF|\.ctoc/streaming/|tool-grants-s11|^\.claude/|^plans/.*deepthink.*-s[6-9]-`
  and the staged diff for private paths (the owner's account name, temporary-folder paths),
  commit, push.
- Never stage: the dependency-analyzer improvement files (plan 00266 in progress, uncommitted),
  deepthink slices 6–9, the tool-grant slice 11 plan, `.ctoc/streaming/*`. HANDOFF.md is
  committed only through `/handoff`, after a private-path check.
- Speedup measured today (transcripts split at the sleep-loop rule, 2026-10-06 19:51): CTOC
  polling 6.6 h → 0 h; owner wait per turn, slowest tenth 22.7 → 6.2 minutes; turns over an hour
  14 → 2; time per agent run flat (no profile has the new agents installed). Recorded in
  `.ctoc/audit/speed-and-size/benchmarks/WHERE-THE-HOURS-GO.md`.

## Key files
- `plans/functional/ctoc-keeps-working-and-asks-only-what-matters.md` — the parent plan (never committed without a privacy check).
- `plans/implementation/…-s2-plans-cross-on-their-evidence.md`, `…-s3-instructions-say-what-the-code-does.md` — the next two pieces.
- Worktree `.claude/worktrees/agent-a0b33c6c216a2989c` — piece one, with its plan copy and Execution Record.
- `src/hooks/protect-records.js`, `hooks/hooks.json`, `tests/protect-records.test.js` — the one loaded hook.
- `src/lib/streaming-precompute.js` — question validation and what blocks (piece one).
- `tests/compaction-eval/inventory-checks.js` and the `rule-inventory.json` files — rules held word for word; now with replaced and added fates.
- `.ctoc/audit/speed-and-size/benchmarks/` — `pipeline-time.js`, `WHERE-THE-HOURS-GO.md`, `RESULTS.md`.

## Resume here
Dispatch `ctoc:security:security-scanner` (no network, write nothing) to re-scan piece one at
`f4838d93` in worktree `.claude/worktrees/agent-a0b33c6c216a2989c` against its previous BLOCK
findings (listed in the plan's Execution Record). If it passes or warns: cross piece two to todo
(`approvePlan` from the session), and dispatch `ctoc:iron-loop:iron-loop-executor` WITHOUT a new
worktree, told to build piece two in that same worktree on top of `f4838d93`, test-first, inside
its `files:`. Then review and security-scan piece two, merge the branch into main, ship pieces one
and two together (piece one's untracked plan copy and approval record in main are replaced by the
branch's plan; carry the approval record into the commit), and push.

## Appendix — earlier work still open (from the 2026-10-02 handoff, verified 2026-10-07)
- Dependency-analyzer improvement (plan 00266, in progress): the agent file's three rounds were
  closed then; the skill's three rounds had not started. All its files are uncommitted on
  purpose; never stage them without the owner.
- Deepthink slice 4 (plan 00400, real run in a disposable project) is in todo; slices 1, 2, 3
  and 5 are in done.
- The round protocol for "improved three times" slices: per file and round, the session
  dispatches read-only agents (at most five in flight) and hands their reports to one long-lived
  executor: `citation-validator` research → `agent-critic` findings with exact old/new text →
  `citation-validator` validates every new claim → the executor applies byte for byte → a quiet
  re-read → the executor writes the round entry. Save every report verbatim to the notes folder
  (extract the last assistant text block from the subagent's output file in the session's
  temporary tasks folder); then Steps 11, 13 and 16, `npm test`, `menu task complete`, version
  bump, `release.js`, commit by name. These slices re-grow agents the compaction shrank: re-plan
  them against the compacted texts and their size ceilings first.
- Settled facts: OWASP LLM Top 10 has a 2026 edition; MITRE ATLAS `dist/ATLAS.yaml` is deprecated
  (manifest → `dist/v6/ATLAS-2026.09.yaml`); Robert Martin's instability metric has no thresholds
  in his texts; madge 8 defaults to `.js` only (0 files on a `.ts` tree is a false pass) and
  `--ts-config` crashes when the file is absent; under `"type":"module"` programs must be `.cjs`;
  the Bash tool's shell is zsh with ugrep; the owner's `claude` aliases add
  `--dangerously-skip-permissions`.
- Verbatim notes from earlier slices carry the owner's account name in temporary-folder paths
  (his open item from slice 5); never add more.
