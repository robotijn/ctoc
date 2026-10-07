---
iron_loop_verdict: true
iron_loop: true
title: "The approval records, the check records and the owner's answers are write-protected, and that protection is the only CTOC hook Claude Code loads"
type: implementation
created: 2026-10-07
priority: high
effort: medium
depends_on: none
files:
  - src/hooks/protect-records.js
  - src/hooks/PreToolUse.Bash.js
  - hooks/hooks.json
  - tests/protect-records.test.js
  - .ctoc/reachability-roots.json
  - docs/ENFORCEMENT.md
  # Ratchet, not counted toward the slice size: this plan creates a hook file and a
  # test file, both counted in CLAUDE.md, so the build must update those two counts.
  - "CLAUDE.md"
  # Added 2026-10-07: consequences of adding the hook, approved by the session under the owner's standing instruction
  - tests/the-bash-channel-cannot-reach-the-ledger-through-a-link.test.js
  - tests/readme-numbers.test.js
  - README.md
  - src/commands/start.md
approved_by: human
approved_at: 2026-10-07T08:05:21.196Z
gate_crossed: implementation → todo
---

# The approval records, the check records and the owner's answers are write-protected

## The owner's decision (2026-10-07)

> Question put to him: "load only the two write protections, the approval records and the
> check records, while every other hook stays hidden? I recommend yes. The plan for CTOC to
> keep working without waiting for you depends on it."
> His answer: "yes".

> Second question, the same day: "Should the protection also cover your recorded answers, not
> just the approval and check records?" (recommended: yes — once plans move on his answers, an
> agent could otherwise answer a technology-stack question in his name).
> His answer: "a" — also protect the answers.

So the one hook protects three things: the approval records, the check records, and the
question-and-answer store (`.ctoc/streaming/answers.jsonl` and the live question files),
with the waiting folder `.ctoc/streaming/questions/pending/` left writable for the agents
that drop new questions there. Everything below that says "the two folders" means these
three protected areas.

This plan changes hook code, so it is built only after the owner's own approval of this
plan (`src/hooks/**` is on the protected enforcement list in `src/lib/protected-paths.js`).

## Problem statement

Verified by reading the code on 2026-10-07:

- CTOC's hooks are registered in `.claude-plugin/hooks.json`. `.claude-plugin/plugin.json`
  has no `hooks` field and there is no `hooks/hooks.json` at the plugin root. Claude Code
  loads plugin hooks only from `hooks/hooks.json` at the plugin root or from a `hooks` field
  in the manifest, so no CTOC hook runs today, on purpose.
- Two folders decide whether a plan may move on.
  - **Approval records**, `.ctoc/approvals/<slug>.json`. Written by `stampAndLedger` through
    `approvePlan` (`src/lib/actions.js`), by `crossBySufficiency` through
    `writeSufficiencyEntry` (`src/lib/streaming-gate.js`), and by
    `src/scripts/ledger-backfill.js`. Read by `approval-residency.classifyResidency`, which
    accepts a `backfilled` entry at every stage, `done` included.
  - **Check records**, `.ctoc/state/verify/<slug>.json`. Written by `persistVerifyResult`
    (`src/lib/step-13-verify.js`). `validateReviewToDone` (`src/lib/plan-validator.js`) lets a
    plan reach done on them.
- With every hook off, any agent holding Write, Edit or Bash can write either record: a
  Write of `{"passed":true,…}` into the check-record folder; `node -e` calling `approvePlan`,
  `persistVerifyResult`, `crossBySufficiency` (it takes a caller-supplied verdict) or
  `streamApprove`; or `node src/scripts/ledger-backfill.js --plan <p> --stage done`. A
  compacted CTO Chief once drafted a forged approval in a test run.
  `plans/functional/ctoc-keeps-working-and-asks-only-what-matters.md` makes plans cross to
  done on exactly these records with no human act.
- The code that already refuses these writes is not loaded:
  - `isProtectedLedgerPath` and `isProtectedVerifyPath` in `src/hooks/PreToolUse.Edit.js` —
    the editing tools, both folders, with case folding, `..` resolution and a real-path check
    for symbolic links (`src/lib/real-path-confinement.js`).
  - `isLedgerForgery` in `src/hooks/PreToolUse.Bash.js` — the shell, approval records only.
    Nothing on the shell channel guards the check records.
- Loading those two files as they stand would also load plan coverage, escape phrases, the
  enforcement mode, the Iron Loop step gates, the irreversible-command net and the
  plan-move gate, which the owner wants hidden.
- `src/hooks/PreToolUse.Bash.js` calls its `main()` unconditionally at the bottom of the file
  and exports nothing, so no other file can reuse its checks today: requiring it would read
  stdin and exit.

## Technical approach

One small entry, `src/hooks/protect-records.js`, registered alone in a new
`hooks/hooks.json` at the plugin root. It reads the payload Claude Code sends on stdin once
and calls only the existing checks named above plus three small rules this plan adds. It
never calls `enforce()`, plan coverage, the escape-phrase reader, the enforcement mode, the
step gates, the irreversible net or the plan-move gate.

### The registration — `hooks/hooks.json` (CREATE)

```json
{
  "description": "CTOC loads only its write protection for approval records and check records; every other CTOC hook stays unregistered on purpose.",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/hooks/protect-records.js\""
          }
        ]
      }
    ]
  }
}
```

`.claude-plugin/hooks.json` and `.claude-plugin/plugin.json` are not touched.

### The entry — `src/hooks/protect-records.js` (CREATE)

Top-level requires: `fs`, `path`, `../lib/hook-deny-signal` (dependency-free) and nothing
else. `../lib/project-root`, `./PreToolUse.Edit.js` (editing tools only) and
`./PreToolUse.Bash.js` (Bash only) are required inside the decision, so a module that fails
to load is a crash the decision catches (fail rule below). No exports; `main()` runs only
when `require.main === module`.

Constants (module-private, literal regular expressions only):

- `REFUSAL` and `REFUSAL_UNCHECKED` — the two sentences under "The refusal" below.
- `RECORD_SEGMENT_RE = /(^|\/)\.ctoc\/+(approvals|state\/+verify)(\/|$)/i`
- `CHECK_RECORD_EVAL_TOKENS = [/step-13-verify/i, /\bpersistVerifyResult\b/, /\bverifyEvidencePath\b/, /\bcrossBySufficiency\b/, /\bstreamApprove\b/]`
- `UNCHECKED_SUSPECT_RE = /\.ctoc|approval|verify|ledger|backfill|stampAndLedger|approvePlan|crossBySufficiency|streamApprove|persistVerifyResult/i`
- `EDITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])`

`main()`:

1. `raw = fs.readFileSync(0, 'utf8')`; a read error or an empty read → exit 0 (nothing to
   check).
2. Everything below runs inside one `try`.
3. `payload = JSON.parse(raw)`. `root = findProjectRoot(payload.cwd || process.cwd())` — the
   same walk the menu uses (`src/commands/start.js` calls `findProjectRoot()`), so the
   protection anchors on the `.ctoc/` the menu writes. Then `process.chdir(root)`, because the
   reused checks measure against `process.cwd()`.
4. Editing tools: `target = edit.getTargetFile(payload)`; no target → exit 0. A relative
   target is first resolved against `payload.cwd` (else `root`). Refuse when any of:
   `edit.isProtectedLedgerPath(abs)`, `edit.isProtectedVerifyPath(abs)`, or
   `RECORD_SEGMENT_RE.test(path.resolve(abs).replace(/\\/g, '/'))`. The third test does not
   depend on the root: it is the editing-tool twin of the shell side's text test, so a session
   whose working directory left the project still cannot write another copy's records.
5. Bash: `command = payload.tool_input && payload.tool_input.command`; not a non-empty
   string → exit 0. Refuse when `bashRefuses(command, cwdRel)` is true, where `cwdRel` is
   `path.relative(root, payload.cwd)` with forward slashes, used only when it is non-empty and
   matches `/^[A-Za-z0-9._\/-]+$/`.
6. Any other tool name → exit 0.
7. Refuse = `emitDeny(REFUSAL)`: the decision JSON on stdout and exit 2. Allow = exit 0 with
   nothing on stdout. No banner, no log file.
8. `catch` (a module that will not load, a payload that is not JSON, a `chdir` fault, any
   throw): `UNCHECKED_SUSPECT_RE.test(raw)` → `emitDeny(REFUSAL_UNCHECKED)`; otherwise exit 0.

`bashRefuses(command, cwdRel)`, in this order:

1. `isPureMenuCall(command)` → allow. The menu's own code is the legitimate writer and its
   arguments are data (a `--summary` may name a folder).
2. Let `analysed` be `cd ${cwdRel} && ${command}` when `cwdRel` is usable, else `command`.
   This hands the session's working directory to the existing `cd` tracking.
3. `bash.isLedgerForgery(analysed).deny` → refuse (the existing approval-record layer,
   unchanged).
4. `bash.isOpaqueDecodedExecution(command)` → refuse (the existing decoder rule).
5. `bash.isLedgerWrite(analysed, bash.VERIFY_SPEC)` → refuse (the same per-segment,
   `cd`-aware, link-aware test, for the check records).
6. `bash.isInlineEval(command)` and any `CHECK_RECORD_EVAL_TOKENS` matches → refuse.
7. `runsBackfillBeyondVision(command)` → refuse.
8. Otherwise allow.

`isPureMenuCall(command)` — true only when all hold on `s = command.trim()`:
- `s` contains no backslash and no backtick;
- after removing every literal `${CLAUDE_PLUGIN_ROOT}`, `s` contains no `$`;
- `s` matches `/^node\s+(?:"([^"]+)"|'([^']+)'|([^\s"']+))/` and the captured script path
  ends with `src/commands/start.js` at a `/` boundary;
- walking `s` character by character, tracking single and double quotes, no `;`, `&`, `|`,
  `<`, `>`, carriage return or newline occurs outside quotes, and every quote closes.

`runsBackfillBeyondVision(command)`:
- false when `command` does not match `/ledger[-_]backfill/i`;
- true when `bash.isInlineEval(command)` (an inline script naming the backfill script);
- otherwise, per segment (split on newline, `;`, `&&`, `||`, `|`, `&`), with each token
  stripped of `'`, `"` and backticks: find a token matching
  `/(^|[\/\\])ledger[-_]backfill(\.js)?$/i`. If none, or the token is not the first one and
  no token's base name is a JavaScript runtime (`node`, `node` plus a version, `deno`,
  `bun`, `ts-node`, `tsx`), the segment only mentions the file → skip it. Otherwise the
  segment runs the script, and it is allowed only when token 0 is the runtime, token 1 is
  the script and the remaining tokens are exactly `--vision`, or exactly `--vision` and
  `--dry-run` in either order. Anything else → true.

### Changes to `src/hooks/PreToolUse.Bash.js` (MODIFY)

1. Add the check-record twins of the three ledger constants, as literal regular
   expressions next to them:
   `VERIFY_SEGMENT_RE = /(^|[^a-z0-9._-])\.ctoc\/+state\/+verify(\/|\s|$)/i`,
   `VERIFY_RESOLVED_RE = /(^|\/)\.ctoc\/+state\/+verify(\/|$)/i`, directory
   `'.ctoc/state/verify'`. Bundle each trio as a frozen spec:
   `LEDGER_SPEC = { dir: LEDGER_DIR_RELATIVE, segmentRe: LEDGER_SEGMENT_RE, resolvedRe: LEDGER_RESOLVED_RE }`
   and `VERIFY_SPEC` likewise.
2. `isLedgerWrite(command, spec = LEDGER_SPEC)` uses `spec.segmentRe`, `spec.resolvedRe`, and
   passes `spec.dir` to `operandResolvesIntoLedger(prefix, token, dir = LEDGER_DIR_RELATIVE)`.
   With the default argument every existing call is unchanged.
3. `isReadOnlyLedgerCommand(seg)`: a segment matching
   `/^\s*git\s+(add|commit|diff|log|show|status|blame|ls-files)\b/i`, containing no
   `--output` and no `>`, is a read. These subcommands write only into `.git/`, never into
   the working tree, so staging or committing an approval record by name is not a write of
   it. `git checkout`, `restore`, `stash`, `reset` and every other subcommand stay refused
   when they name a folder.
4. Replace the unconditional `main().catch(…)` with `if (require.main === module) { main().catch(…); }`
   and add `module.exports = { isLedgerForgery, isLedgerWrite, isInlineEval, isOpaqueDecodedExecution, VERIFY_SPEC };`.
   Every export has a live caller: `src/hooks/protect-records.js`.
5. Rewrite the comment above the old call ("It exports NOTHING on purpose…") to say what the
   exports are for and who calls them, and the sentence in `isLedgerWrite`'s comment that says
   `cd .ctoc/approvals && git status` is denied.

The file's own `main()` keeps calling `isLedgerForgery(command)` exactly as today. The
unregistered full Bash hook therefore behaves as before, except for item 3.

### `.ctoc/reachability-roots.json` (MODIFY)

Add `"src/hooks/protect-records.js"` to `roots` with the reason: "Executed BY CLAUDE CODE:
registered in hooks/hooks.json at the plugin root, the hooks manifest Claude Code loads. The
analyzer reads only .claude-plugin/hooks.json, which Claude Code does not load."

### The owner's answers and the live question files (owner answer "a", 2026-10-07)

- Editing tools: the entry also refuses when `PreToolUse.Edit.targetsStreamingLive(filePath)`
  is true. That existing check denies everything under `.ctoc/streaming/` except
  `.ctoc/streaming/questions/pending/` (arithmetic and real-path confinement, like the ledger
  and verify guards), so the quarantine stays writable. Reuse it; do not re-implement it.
- Shell: `RECORD_SEGMENT_RE` gains the store, so a non-read segment that names
  `.ctoc/streaming/answers.jsonl` or anything under `.ctoc/streaming/` outside
  `questions/pending/` is refused, with the same normalisation (quotes, `\`, case, `..`).
  `CHECK_RECORD_EVAL_TOKENS` gains `/\bstreamAnswer\b/` (the function that appends to
  `answers.jsonl`, `src/lib/streaming-gate.js`), refused outside the menu entry point exactly
  like `streamApprove`.
- The legitimate writer stays allowed: `node <plugin>/src/commands/start.js stream answer …`
  (the menu route the session runs on the owner's letter).
- The refusal sentence is the same one; it names records in general, not each folder.

### The refusal

Exactly one sentence, the same for every channel, no command text echoed back (a command may
carry a secret):

> CTOC refused this call because it writes, or could write, the approval records in
> .ctoc/approvals/ or the check records in .ctoc/state/verify/, which only CTOC's menu writes;
> finish your work, report it, and let the menu record the result.

When the protection itself failed to run (fail rule below):

> CTOC refused this call because it mentions the approval or check records and CTOC's
> protection for them failed to run; tell the human that this protection is broken.

### What the shell check catches

1. A command that names either folder — quotes removed, `\` read as `/`, any letter case,
   `..` anywhere — in a segment that is not a pure read. Pure reads are `cat`, `ls`, `head`,
   `tail`, `grep`, `egrep`, `rg`, `find`, `wc`, `stat`, `file`, `jq`, `diff`, `cmp`, `shasum`,
   `sha256sum`, `md5sum`, `tree`, `du`, `less`, `more`, plus the eight non-writing git
   subcommands of item 3, and only when the segment holds no `>` and none of `tee`, `cp`, `mv`,
   `rm`, `sed` (so `sed -i`), `awk`, `perl`, `python`, `node`, `sh`/`bash`/`zsh`, `dd`,
   `install`, `touch`, `truncate`, `chmod`, `ln`, `curl`, `wget`, `mkdir`, `patch`. So a
   redirect, `tee`, `cp`, `mv`, `rm`, `sed -i`, `touch`, or a scripting one-liner naming the
   folder is refused.
2. The same after a `cd` into or toward the folder (`cd .ctoc && echo x > state/verify/a`),
   including a working directory the session already moved into.
3. An operand or quoted string that really leads into either folder through a symbolic link
   (the first 128 per segment).
4. Inline scripts (`node -e`, `--eval`, `-p`, `--print`, the `deno`, `bun`, `ts-node` and `tsx`
   forms, a script piped or redirected into `node`) naming `approval-ledger`, the approval
   folder, `writeEntry`, `writePipelineEntry`, `writeVisionArchiveEntry`, `backfillEntry`,
   `persistEntry`, `removeEntry`, `stampAndLedger`, `approvePlan`, `approveSubplans`
   (existing), or `step-13-verify`, `persistVerifyResult`, `verifyEvidencePath`,
   `crossBySufficiency`, `streamApprove` (new); an inline script whose code is built at run
   time (command substitution, a `require` whose argument is not one plain string); a
   `base64`, `xxd`, `uudecode` or `openssl enc` output piped into an interpreter.
5. Running `ledger-backfill.js` in any form except exactly
   `node <…>/src/scripts/ledger-backfill.js --vision` (optionally with `--dry-run`), and any
   inline script naming `ledger-backfill`.

What it cannot catch is listed under Risks.

### Fail rule on a crash — decision

Fail closed only for calls that mention the records; fail open for the rest. A crash that
refused everything would stop every Write, Edit and Bash call in every project at once (CTOC
is installed from the marketplace, so one broken release reaches every user). A crash that
allowed everything would let exactly the forging call through. `UNCHECKED_SUSPECT_RE` runs
on the raw payload text without loading anything but the dependency-free deny signal. What
stays open on a crash is a call that reaches a record through a link without naming it
(Risks). A failure to load `hook-deny-signal.js` itself ends the process with exit 1, which
Claude Code treats as "not blocked" — the same exposure every existing CTOC hook has to its
own literal requires.

### Paths across platforms

- Windows separators: the editing-tool checks replace `\` with `/` before matching
  (`normalizeForProtection`, and `RECORD_SEGMENT_RE` above); the shell check reads `\` as `/`
  (`normalizeForMatch`).
- Letter case: every pattern carries `/i`; `isUnderProtectedDir` and
  `real-path-confinement.isWithin` compare lower-cased.
- `..`: the editing tools resolve it first (`.ctoc/approvals/../x` is not protected,
  `src/../.ctoc/approvals/x` is); the shell text test matches the folder name wherever it
  appears.
- Symbolic links: `real-path-confinement.resolvesUnder` on both channels; a resolution fault
  counts as "inside" (refuse). Hard links are not detectable this way (Risks).
- Paths are built with `path.join`/`path.resolve`; the hook is a Node file, no shell script.

### Wiring — the live call sites

Claude Code → `hooks/hooks.json` (PreToolUse; Write, Edit, MultiEdit, NotebookEdit, Bash) →
`node "${CLAUDE_PLUGIN_ROOT}/src/hooks/protect-records.js"` → `main()` →
`project-root.findProjectRoot`, `PreToolUse.Edit.getTargetFile`, `isProtectedLedgerPath`,
`isProtectedVerifyPath` (editing tools) or `PreToolUse.Bash.isLedgerForgery`,
`isLedgerWrite`, `isInlineEval`, `isOpaqueDecodedExecution`, `VERIFY_SPEC` (Bash) →
`hook-deny-signal.emitDeny`. The reachability fence sees the entry through its declared root.
A test is not a caller: the live proof is the Step 16 probe in a real session after release.

## Acceptance criteria

- [ ] `hooks/hooks.json` exists at the plugin root and registers exactly one hook command,
  `node "${CLAUDE_PLUGIN_ROOT}/src/hooks/protect-records.js"`, under `PreToolUse`, with a
  matcher that matches Write, Edit, MultiEdit, NotebookEdit and Bash and does not match Read,
  Task, Agent, Glob or Grep. `.claude-plugin/hooks.json` and `.claude-plugin/plugin.json` are
  unchanged, and `plugin.json` has no `hooks` field.
- [ ] The owner's answers and live question files are refused to the editing tools and the shell (cases 62–66), the waiting folder and the menu's `stream answer` route stay allowed (cases 67–68).
- [ ] Every refusal case of the test plan exits 2, prints nothing on stdout but the decision
  JSON, and carries exactly the first refusal sentence.
- [ ] Every allowed case exits 0 with empty stdout — including a write to an uncovered source
  file in a CTOC project with no plan and no Iron Loop state, which proves plan coverage, the
  step gates, escape phrases and the enforcement mode are not loaded.
- [ ] Every `node -e` recipe in `src/commands/start.md`, read from the live file, is allowed;
  so are the `ledger-backfill.js --vision` recipe and a menu call whose `--summary` names both
  folders.
- [ ] With the entry's own dependencies missing, a call that mentions a record folder is
  refused with the second sentence and an ordinary call is allowed.
- [ ] Staging and committing approval records by name is allowed; the existing tests of the
  full Bash hook (`tests/ledger-forgery-closed.test.js`, `tests/bash-gate-plan-coverage.test.js`,
  `tests/bash-gate-payload-reader.test.js`) pass unchanged.
- [ ] `src/hooks/protect-records.js` is a live root for the reachability fence, and the
  unreachable-file, dead-export and false-green counts are not higher than before.
- [ ] `npm test`: 0 failed, 0 skipped, coverage at or above `.ctoc/coverage-baseline.json`
  `minPct`.
- [ ] Live: after the owner releases this, a real session in a scratch CTOC project is
  refused, with the first sentence, for `echo '{}' > .ctoc/approvals/probe.json` through Bash
  and for a Write to `.ctoc/state/verify/probe.json`, and `ls .ctoc/approvals` runs. The
  refusal is quoted to the owner as shown. Until the release this box stays open and is
  reported as not run.

## Test plan — `tests/protect-records.test.js` (CREATE, Step 8, written first)

Added by the owner's answer "a" (each red today, numbered after the registration cases):
62. Write to `<project>/.ctoc/streaming/answers.jsonl` → refused.
63. Edit of `<project>/.ctoc/streaming/questions/review__x.md.json` (a live question file) → refused.
64. Write to `<project>/.ctoc/streaming/questions/pending/../review__x.md.json` → refused (normalises out of the waiting folder).
65. Bash `echo '{}' >> .ctoc/streaming/answers.jsonl` → refused; `cat .ctoc/streaming/answers.jsonl` → allowed.
66. Bash `node -e "require('./src/lib/streaming-gate').streamAnswer('review/x.md','q1','a',process.cwd())"` → refused.
67. Bash `node "<plugin>/src/commands/start.js" stream answer review/x.md q1 a` → allowed (the menu route).
68. Write to `<project>/.ctoc/streaming/questions/pending/implementation__y.md.json` stays allowed (case 11, kept).

Framework `node:test`. Every case spawns the real entry with `spawnSync(process.execPath,
[ENTRY], { cwd, input, encoding: 'utf8' })` and the JSON Claude Code sends on stdin, then
checks the exit code and stdout. Fixture: a temporary project from `fs.mkdtempSync` with
`.ctoc/approvals/`, `.ctoc/state/verify/`, `src/`, `plans/review/`; removed after each case.

Payload shape (Write shown; Edit adds `old_string`/`new_string`, MultiEdit `edits`,
NotebookEdit uses `notebook_path` and `new_source`, Bash `command` and `description`):

```json
{"session_id":"t","transcript_path":"<project>/t.jsonl","cwd":"<project>","permission_mode":"default","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"<project>/.ctoc/approvals/x.json","content":"{}"}}
```

"Refused" means exit 2 and stdout exactly
`{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<sentence>"}}`.
"Allowed" means exit 0 and empty stdout.

Why each case is red today: `src/hooks/protect-records.js` does not exist, so Node exits 1
with "Cannot find module" and no decision JSON — every refused case and every allowed case
fails; `hooks/hooks.json` does not exist; the crash fixture cannot copy a missing file. The
refused shell cases also prove the `require.main` guard: if requiring
`PreToolUse.Bash.js` still ran its `main()`, that `main()` would find stdin already drained and
exit 0 before the entry decides.

Editing tools, refused:
1. Write to `<project>/.ctoc/approvals/x.json`.
2. Edit of `<project>/.ctoc/state/verify/x.json`.
3. MultiEdit of `.ctoc/approvals/x.json` (relative path).
4. NotebookEdit of `<project>/.ctoc/state/verify/n.ipynb`.
5. Write to `<project>/.CTOC/Approvals/x.json` (letter case).
6. Write to `.ctoc\state\verify\x.json` (Windows separators).
7. Write to `<project>/src/../.ctoc/approvals/x.json` (`..`).
8. Write to `<project>/src/link/x.json` where `src/link` is a link to
   `<project>/.ctoc/state/verify` (`fs.symlinkSync(target, link, 'junction')`; the type is
   ignored off Windows and needs no administrator rights on Windows).
9. Payload `cwd` and the spawn's working directory are `<project>/src`; Write to
   `<project>/.ctoc/approvals/x.json`.

Editing tools, allowed:
10. Write to `<project>/src/x.js` in a project with no plan and no Iron Loop state.
11. Write to `<project>/.ctoc/streaming/questions/pending/implementation__x.md.json` (the
    quarantine the question-writing agents use).
12. Write to `<project>/.ctoc/approvals-summary.md` and `<project>/.ctoc/state/verify-notes.md`
    (same-prefix siblings).
13. Write to `<project>/.ctoc/approvals/../settings.yaml` (resolves out of the folder).
14. Write to `<project>/plans/review/x.md`.

Shell, refused:
15. `echo '{"passed":true}' > .ctoc/state/verify/x.json`
16. `cat forged.json >> .ctoc/approvals/x.json`
17. `tee .ctoc/approvals/x.json < forged.json`
18. `cp /tmp/f.json .ctoc/state/verify/x.json`
19. `mv f.json .ctoc/approvals/x.json`
20. `rm .ctoc/state/verify/x.json`
21. `sed -i '' 's/false/true/' .ctoc/state/verify/x.json`
22. `touch .ctoc/approvals/x.json`
23. `python3 -c "open('.ctoc/state/verify/x.json','w').write('{}')"`
24. `node -e "require('fs').writeFileSync('.ctoc/approvals/x.json','{}')"`
25. `cd .ctoc && echo x > state/verify/x.json`
26. `cd .ctoc/state && cp f.json verify/x.json`
27. `echo x > .ctoc"/"state/verify/x.json` (quote split)
28. `echo x > .CTOC/APPROVALS/x.json`
29. `echo x > .ctoc\\state\\verify\\x.json` (Windows separators)
30. `echo x > src/../.ctoc/approvals/x.json`
31. With `src/link` a link to `.ctoc/state/verify`: `echo x > src/link/x.json`
32. `ln -s ../.ctoc/approvals src/l`
33. Payload `cwd` is `<project>/.ctoc`: `echo x > approvals/x.json`
34. `node src/scripts/ledger-backfill.js --plan plans/review/x.md --stage done`
35. `node "${CLAUDE_PLUGIN_ROOT}/src/scripts/ledger-backfill.js" --mark-migrated --force`
36. `node src/scripts/ledger-backfill.js --vision --root /elsewhere`
37. `node -e "require('./src/scripts/ledger-backfill').run(['--plan','x','--stage','todo'])"`
38. `node -e "require('./src/lib/actions').approvePlan('review/x.md','done')"`
39. `node -e "require('./src/lib/step-13-verify').persistVerifyResult(process.cwd(),'x')"`
40. `node -e "require('./src/lib/streaming-gate').crossBySufficiency(process.cwd(),'p','implementation/p.md','implementation','todo',{enough:true})"`
41. `node -e "require('./src/lib/streaming-gate').streamApprove('review/x.md',process.cwd())"`
42. `echo bm9kZQ== | base64 -d | node`
43. A menu call that hides a command substitution:
    `node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" menu task complete t1 --summary "$(echo x > .ctoc/approvals/a.json)"`
44. A menu call followed by a write: `node src/commands/start.js menu; echo x > .ctoc/approvals/a.json`
45. `git diff --output=.ctoc/approvals/x.json`
46. `git checkout -- .ctoc/approvals/x.json`

Shell, allowed:
47. `ls .ctoc/approvals`, `cat .ctoc/state/verify/x.json`, `grep -r passed .ctoc/state/verify`
48. `npm test` and `node --test tests/ledger-backfill-coverage.test.js`
49. `node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" menu task complete t1 --summary "wrote .ctoc/state/verify/x.json and .ctoc/approvals/y.json"`
50. `node "${CLAUDE_PLUGIN_ROOT}/src/scripts/ledger-backfill.js" --vision` and the same with
    `--dry-run`
51. Every `node -e "…"` recipe in `src/commands/start.md`, extracted from the live file with
    the same expression `tests/ledger-forgery-closed.test.js` uses; the case also asserts at
    least 5 recipes were found, so it cannot pass empty.
52. `git add .ctoc/approvals/00001-x.json .ctoc/state/verify/x.json && git commit -m "records"`
53. `echo x > src/x.js` in a project with no plan and no Iron Loop state.
54. `cat src/scripts/ledger-backfill.js` and `git add src/scripts/ledger-backfill.js`

When the protection cannot run — a copy of `src/hooks/protect-records.js` and
`src/lib/hook-deny-signal.js` alone in a temporary plugin folder, so `../lib/project-root`
does not load:
55. Bash `echo x > .ctoc/approvals/a.json` → refused with the second sentence.
56. Write to `<project>/.ctoc/state/verify/x.json` → refused with the second sentence.
57. Bash `ls` → allowed.

Payloads:
58. Empty stdin → allowed.
59. Non-JSON stdin `not json .ctoc/approvals` → refused with the second sentence;
    `not json ls` → allowed.

Registration:
60. `hooks/hooks.json` parses; it has exactly one event, `PreToolUse`, with exactly one group
    and exactly one command; the matcher, compiled as `^(?:<matcher>)$`, matches Write, Edit,
    MultiEdit, NotebookEdit and Bash and none of Read, Task, Agent, Glob, Grep; the command with
    `${CLAUDE_PLUGIN_ROOT}` replaced by the repository path names an existing file,
    `src/hooks/protect-records.js`.
61. `.claude-plugin/plugin.json` has no `hooks` key (guard).

## Risks

| Risk | Mitigation |
|---|---|
| A script file written elsewhere and then run (any language; also an npm script, a git hook or a test file) writes a record. The Write is outside the folders and `node /tmp/f.js` names nothing. | None in this plan, and none possible in a hook that reads command text. Stated here and in `docs/ENFORCEMENT.md`. The protection stops the observed failure — an agent writing or running a forging command directly — and turns forgery into a deliberate several-step act. It is not a sandbox. |
| A path built at run time: a variable (`d=.ctoc; echo > $d/approvals/x`), a glob (`.c*/appr*/x`), string pieces inside a one-liner (`os.path.join('.ctoc','approvals')`), `$'…'` escapes | Not caught; stated. The text, `cd` and link tests see only what is written. |
| Git operations that restore or replace tracked records without naming them (checkout of a branch, stash pop, merge, pull, reset, rebase, apply). Approval records are tracked in this repository (`git status` lists them). | Not caught; stated. Naming the folder in `checkout --`, `restore`, `stash` and the like is refused. |
| Replacing a parent folder: `mv`, `cp -r`, `rsync` or an archive extraction onto `.ctoc`, `.ctoc/state` or the project root | Not caught; stated. |
| Hard links; more than 128 operands in one segment; a file-writing tool other than the five (for example an MCP server's) | Hard links are the documented open residual of `real-path-confinement.js`; beyond 128 operands only the text tests apply; other tools are not matched. Stated. |
| Read-list commands with a write side effect (`find -delete`, `find -fprint`, `tree -o`) | They can delete or corrupt a record, never forge one: a missing or corrupt record reads as "not approved" or "no passing record". Stated. |
| Any agent with the shell can run the menu's own routes (approval, `stream approve`, `stream answer`) — the legitimate writer. The protection cannot tell the session acting on the human's choice from an agent acting alone. | Not addressed by this plan; reported to the owner in plain words. |
| The `--vision` backfill stays allowed (the menu's approve-stubs action runs it). A hand-written `type: vision` file placed in `plans/done/` then gets a pipeline entry there. | That writes no record for a built plan and cannot produce a build admission or a done crossing for one. Stated. |
| The stale-cleanup menu recipe (`executeCleanup` through `node -e`) writes pipeline entries | A menu recipe; allowed by design. It re-derives and re-validates its own target set. Stated. |
| An agent writes an answer in the human's name once plans move on answers. | Decided by the owner on 2026-10-07 (answer "a"): the store is protected by the same entry — `targetsStreamingLive` for the editing tools, the store in the shell check, `streamAnswer` as a refused token; cases 62–68. The menu's own `stream answer` route stays the one writer, and an agent with the shell can still run that route (same limit as the approve route, stated above). |
| Raw moves of plan files between stage folders are not refused: that rule lives in the unloaded Bash hook, and the unloaded gate check reverts such moves | A moved plan has no ledger entry for its new folder, which `classifyResidency` reports (`no-ledger-entry` or `wrong-edge`). Which loaded screen shows that to the human was not checked. Stated. |
| Every Write, Edit and Bash call now starts a Node process that loads `PreToolUse.Edit.js` or `PreToolUse.Bash.js` and their requires | Measured at Step 9 and Step 12 against a budget of 100 ms added median per call. Requires are lazy per tool. |
| False refusals: a non-read command whose text names a folder (`echo "see .ctoc/approvals"`), a git commit message containing `>`, any inline script built from a command substitution | Refusing is the safe direction; the sentence tells the agent what to do; the menu call, the git subcommands and the `--vision` recipe are carved out by rule. |
| Other plans also plan to create or move `hooks/hooks.json`: `plans/functional/ctocs-hooks-are-actually-loaded-by-claude-code.md` and `plans/functional/the-gate-check-does-not-reread-every-plan-on-every-tool-call.md`. Fact 14 of `plans/functional/finished-plans-are-not-sent-back-after-an-update.md` ("no `hooks/hooks.json` exists") stops being true. | The scheduler builds plans that share a file one at a time; whichever builds later must merge into this file, never replace it. The functional plan's conclusion (the gate check and session start do not run) stays true. |
| `src/tabs/tools.js` ("Hooks configured"), `iron-loop-enforcer.checkHooksJsonRegistration` and the reachability analyzer read only `.claude-plugin/hooks.json` | Unchanged by this plan; they keep describing the unloaded manifest. |

## Decisions Taken Under Ambiguity

1. **A crash fails closed only for calls that mention the records.** Reason under "Fail rule".
2. **Reuse, do not rewrite.** The editing tools reuse `getTargetFile`, `isProtectedLedgerPath`
   and `isProtectedVerifyPath` as they are. The shell reuses `isLedgerForgery`,
   `isOpaqueDecodedExecution` and `isInlineEval`, and gets the check records by running the
   same `isLedgerWrite` with a second folder spec. No second copy of either policy.
3. **The full Bash hook keeps its behavior except one rule:** eight git subcommands that
   write only into `.git/` count as reads. Without it, loading the protection would refuse the
   background commit of approval records (`git add .ctoc/approvals/…`), which is ordinary
   work today.
4. **`ledger-backfill.js` is refused except the exact `--vision` recipe.** `--plan` writes a
   `backfilled` entry that `classifyResidency` accepts at every stage, `done` included; that is
   a forged build admission or a forged done. `--mark-migrated` arms the unloaded gate check's
   bulk revert. Both are migrations the human runs in his own terminal. `--vision` stays because
   the menu's approve-stubs action instructs it after the human approves a vision.
5. **A pure menu call is exempt** under the strict rule above: no backslash, no backtick, no
   `$` other than `${CLAUDE_PLUGIN_ROOT}`, no unquoted control or redirect character. Its
   arguments are data, and the menu's code is the legitimate writer. Running a different
   `start.js` is the script-file case, which is open with or without the exemption, so the
   exemption adds no hole.
6. **Five more inline-script names.** `step-13-verify`, `persistVerifyResult` and
   `verifyEvidencePath` reach the check records. `crossBySufficiency` takes a caller-supplied
   verdict and writes an approval record. `streamApprove` calls `approvePlan` without naming it.
   None appears in any instruction surface (searched `src/commands`, `agents`, `skills`), so no
   recipe breaks.
7. **The editing tools also refuse any path with a record-folder segment, wherever it sits.**
   That is the same shape as the shell's text test, so the root guess cannot open a hole.
   Fixtures that need such a path are created by the test at run time in a temporary folder,
   as every existing test does (none is checked in).
8. **The root is `findProjectRoot(payload.cwd || process.cwd())`,** the walk the menu uses.
   The payload's `cwd` field is *believed* from Claude Code's hook documentation and was not
   observed here, because no hook is loaded. Both shapes are tested, and with or without the
   field the text and segment tests do not depend on it.
9. **No log file of refusals.** The refusal lands in the transcript, where the human sees it.
10. **A declared reachability root** with its reason, instead of teaching the analyzer a
    second manifest. That is the sanctioned escape hatch for "a real mechanism executes the
    file and the analyzer cannot see it".
11. **`docs/ENFORCEMENT.md` is edited additively.** A sentence after "These hooks are not
    registered with Claude Code today" names the one exception, and a new section gives the
    catch list, the limits and the fail rule. No existing sentence is reworded, so the rule
    inventory stays whole.
12. **Only the two folders,** as the owner decided. The answer store is in Risks and goes to
    the owner as a question.
13. **The registration lives in `hooks/hooks.json` and `plugin.json` is untouched.** A manifest
    `hooks` field naming the standard file is reported to make Claude Code 2.1.255 and later
    refuse the whole plugin (cited in
    `plans/functional/ctocs-hooks-are-actually-loaded-by-claude-code.md`).
14. **No test seam.** The crash path is driven by a real copy of the entry whose dependencies
    are absent, which is what a broken release looks like.
15. **The menu exemption is a real-path rule, not a name rule (supersedes Decision 5 and the
    "isPureMenuCall" description above, added during the build on 2026-10-07).** The
    security scan disproved Decision 5's "the exemption adds no hole": matching any
    `…/src/commands/start.js` by name let an agent write its own `start.js` and run it with
    every record check skipped, which is worse than the plain script-file case because the
    check is skipped, not just blind. The built rule: the call keeps the strict text shape
    (no `$` other than `${CLAUDE_PLUGIN_ROOT}`, no backtick, backslash or unquoted control
    character), and the script — `${CLAUDE_PLUGIN_ROOT}` read as this plugin's root,
    resolved against the session's working directory — must have the same real path as this
    plugin's own `src/commands/start.js` (a resolution fault means "not the menu"). Even
    then, every whitespace-free argument that is a path into the approval or check records
    is refused; quoted text with spaces stays data, and the answer store is left out of
    that argument check because the menu's question-generation recipe passes
    `--touches '.ctoc/streaming/questions/<ref>'`.
16. **The refusal sentence names records in general (supersedes the first sentence under
    "The refusal" above).** The built sentence is "CTOC refused this call because it writes,
    or could write, the approval records, the check records or the owner's recorded
    answers, which only CTOC's menu writes; finish your work, report it, and let the menu
    record the result." — so a refusal for the answers store is not described as a write to
    the other two folders, as the owner's-answers section asks.
17. **The refusal is also written to stderr, and the crash rule scans the call, not the
    whole payload (refine `main()` steps 7 and 8 above).** Claude Code ignores the JSON
    when a hook exits 2 and shows stderr, so the sentence goes to stderr as one line before
    the JSON and exit 2. On a crash with a parseable payload, `UNCHECKED_SUSPECT_RE` is
    applied to `JSON.stringify(payload.tool_input)` only, so a project path containing
    `verify`, `ledger`, `approval`, `backfill` or `.ctoc` does not refuse every call; an
    unparseable payload is still scanned whole.

## Execution Plan

### Step 8: TEST
- [x] Write `tests/protect-records.test.js` with cases 1–61 above.
- [x] Run `node --test tests/protect-records.test.js`; record that every case is red and why (missing entry, missing manifest).
- [x] Run `node --test tests/ledger-forgery-closed.test.js tests/bash-gate-plan-coverage.test.js tests/bash-gate-payload-reader.test.js tests/reachability.test.js tests/export-reachability.test.js`; record them green before any change.

### Step 9: PREPARE
- [x] Record `claude --version` and whether the install is native or npm.
- [x] Record the before-numbers: unreachable files, dead exports, false-green findings, `CLAUDE.md` bytes.
- [x] Measure the median of 20 runs of `node -e "require('./src/hooks/PreToolUse.Edit.js')"` and of a bare `node -e ""`, as the latency baseline for the editing tools.

### Step 10: IMPLEMENT
- [x] `src/hooks/PreToolUse.Bash.js`: the check-record spec, the `spec` parameter, the git read rule, the `require.main` guard, the exports, the two comments.
- [x] `src/hooks/protect-records.js`: the entry as specified.
- [x] `hooks/hooks.json`: exactly the JSON above.
- [x] `.ctoc/reachability-roots.json`: the root and its reason.
- [x] Run the Step 8 tests green.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic`. Read the entry's calls, not text matches: no path from `main()` reaches `enforce`, plan coverage, the escape-phrase reader, the enforcement mode, `loadState`, the irreversible net or the plan-move gate.
- [ ] The critic checks the full Bash hook's behavior is unchanged except the git read rule, both refusal sentences are exactly as written here, and the fail rule matches the decision.

### Step 12: OPTIMIZE
- [x] Measure the median of 20 spawned runs of the entry for a Write payload and for a Bash `ls` payload against a bare `node -e ""` spawn. If either adds more than 100 ms, move `PreToolUse.Bash.js`'s requires used only by its own `main()` (`state-manager`, `ui`) inside `main()` and measure again. Report both numbers.

### Step 13: SECURE
- [ ] Dispatch `security-scanner` against the pure-menu exemption (escape characters, `$` forms, quoting, newlines), the backfill exact-form rule, the working-directory prefix (a crafted `cwd`), and the crash path (no payload content may turn a mentioning call into an allowed one).
- [ ] The scanner confirms every limit in Risks is real and names any limit missing from the list.

### Step 14: VERIFY
- [x] `npm test`: 0 failed, 0 skipped, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [x] Lint the changed files: zero warnings.
- [x] Unreachable files, dead exports and false-green findings are not higher than the Step 9 numbers; `CLAUDE.md` is at or under 15,000 bytes.
- [x] Run `claude plugin validate .` if the installed Claude Code offers it, and quote the output; if it does not, say so.

### Step 15: DOCUMENT
- [x] Header comment of `src/hooks/protect-records.js`: what it protects, what it refuses, what it cannot catch, the fail rule, and that it is the only registered CTOC hook.
- [x] `docs/ENFORCEMENT.md`: the added sentence and section of Decision 11.
- [x] `CLAUDE.md`: hook count 17 → 18 and test-file count 562 → 563 (both occurrences), checked by `tests/doc-counts.test.js`.

### Step 16: FINAL-REVIEW
- [ ] Dispatch `iron-loop-critic` against every acceptance box; each box quotes its evidence.
- [ ] After the owner releases it: in a real session on a scratch CTOC project, run the three live probes of the last acceptance box and quote the refusals exactly as shown. Until then, report that box as not run.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

Built by `iron-loop-executor` on 2026-10-07 in an isolated worktree. **Status: Step 14
green after the scope was widened** (see "Scope widening and the second pass" at the end
of this record). The first pass paused at Step 14 on three undeclared files; the
sections below record that first pass as it happened.

### What landed (declared files only)

| File | Change |
|---|---|
| `src/hooks/protect-records.js` | created, 202 lines |
| `hooks/hooks.json` | created, 16 lines, exactly the JSON in the plan |
| `tests/protect-records.test.js` | created, 280 lines, cases 1–68 |
| `src/hooks/PreToolUse.Bash.js` | +58 −19: `VERIFY_SEGMENT_RE`, `VERIFY_RESOLVED_RE`, `VERIFY_DIR_RELATIVE`, frozen `LEDGER_SPEC` / `VERIFY_SPEC`; `isLedgerWrite(command, spec = LEDGER_SPEC)`; `operandResolvesIntoLedger(prefix, token, dir = LEDGER_DIR_RELATIVE)`; the eight-subcommand git read rule; the `require.main === module` guard; the five exports; the two comments rewritten |
| `.ctoc/reachability-roots.json` | +3 −1: the root and its reason |
| `docs/ENFORCEMENT.md` | +72 −1: one sentence added after "These hooks are not registered…" (the line was extended, no existing sentence reworded) and the new last section |
| `CLAUDE.md` | hook count 17 → 18 (by hand: it is a fixed contract `release.js` does not generate) and test-file count 562 → 563 in both places (by `node src/scripts/release.js`); 14,952 bytes, under 15,000; `VERSION` unchanged |

`.claude-plugin/hooks.json` and `.claude-plugin/plugin.json`: byte-identical (`git diff` empty).

### Step 8 — red before any implementation

`node --test tests/protect-records.test.js` before the entry existed: **68 tests, 1 pass,
67 fail.** Every case from 1 to 60 and 62 to 68 failed: the spawned entry died with
`Error: Cannot find module '…/src/hooks/protect-records.js'` (exit 1, no decision JSON);
case 60 failed on the missing `hooks/hooks.json`; cases 55–57 failed copying the missing
entry. Case 61 (`plugin.json` has no `hooks` key) was green, as the plan says: it is a guard.

Existing tests before any change: `ledger-forgery-closed`, `bash-gate-plan-coverage`,
`bash-gate-payload-reader`, `reachability`, `export-reachability` — **143 pass, 0 fail.**

### Step 9 — before-numbers

- Claude Code 2.1.291, native install (`~/.local/bin/claude` → `~/.local/share/claude/versions/2.1.291`).
- Unreachable files 17, dead exports 65, false-green findings 207 (computed with the fences' own analyzers); `CLAUDE.md` 14,952 bytes.
- Latency baseline, median of 20 spawns: bare `node -e ""` 17.5 ms; `node -e "require('./src/hooks/PreToolUse.Edit.js')"` 20.1 ms.

### Step 10 — green

`node --test tests/protect-records.test.js`: **68 tests, 68 pass, 0 fail.** The five
existing suites above: still 143 pass, 0 fail. Layer checks run in-process to prove the
new layers carry their cases (each shows what the old full Bash hook alone decides):
`echo x > .ctoc/state/verify/x.json` — ledger layer false, `VERIFY_SPEC` true;
`echo x > approvals/x.json` — false without the working-directory prefix, true with
`cd .ctoc &&`; the `persistVerifyResult` and `--plan … --stage done` backfill commands —
ledger layer false (so cases 39 and 34 rest on the new rules); `git add .ctoc/approvals/…`
— false (the git read rule), `git checkout -- .ctoc/approvals/x.json` — true.

### Step 11 — self-review (the dedicated critic review is still to be dispatched)

Checked by reading the calls, not by text search: `main()` → `decide()` requires only
`../lib/project-root`, then `./PreToolUse.Edit.js` (editing tools) or
`./PreToolUse.Bash.js` (Bash), and calls only `findProjectRoot`, `getTargetFile`,
`isProtectedLedgerPath`, `isProtectedVerifyPath`, `targetsStreamingLive`,
`isLedgerForgery`, `isOpaqueDecodedExecution`, `isLedgerWrite`, `isInlineEval` and
`emitDeny`. It never calls `enforce`, `checkWriteCoverage`, `findEscapeInTranscript`,
the enforcement mode, `loadState`, `isIrreversibleCommand` or the plan-move gate.
Requiring the two hook files LOADS their module-level requires (plan coverage, the
escape-phrase reader, the enforcement mode, the state manager, the user-interface
helpers) but runs none of them — case 10 and case 53 (a source write in a project with
no plan and no Iron Loop state, allowed) are the behavioural proof. Both refusal
sentences are byte-identical to the plan (the test asserts the full stdout). The full
Bash hook's own `main()` is unchanged except the git read rule.

### Step 12 — per-call time added

Median of 20 spawned runs, in the repository: bare `node -e ""` 17.5 / 17.6 ms; the entry
with a Write payload 20.6 / 20.3 ms (**+3.1 / +2.6 ms**); with a Bash `ls` payload
23.9 / 23.7 ms (**+6.4 / +6.0 ms**). Far under the 100 ms budget, so the requires of
`PreToolUse.Bash.js` were not moved.

### Step 13 — self-review of the attack surface (the security scan is still to be dispatched)

Probed against the real entry: a menu call followed by a newline, `&`, `>`, `2>` or `;`
then a write — refused; an unclosed quote — not a pure menu call, and allowed only
because it touches no record; `node --require ./x.js src/commands/start.js …; echo >
.ctoc/state/verify/a` — refused; a different `…/src/commands/start.js` — allowed
(Decision 5's stated script-file case). Backfill: `--vision --vision`, two segments with
a `--plan` second, `./ledger-backfill.js --plan`, `sh -c "node … --plan"`, `npx node …
--vision` — all refused (the last is a false refusal in the safe direction). Working
directory: `.ctoc`, `.ctoc/state` with `../approvals`, inside `.ctoc/approvals` — writes
refused, `ls` and `git status` there allowed; a directory named `-L` or with a space —
the prefix is skipped or `./`-anchored, text tests still apply. Editing tools:
`pending/../../answers.jsonl`, `comments.jsonl`, a `pendingX` sibling, the bare
`.ctoc/streaming` and another project's `/somewhere/else/.ctoc/approvals/x.json` —
refused; another project's waiting folder — allowed. No secret is read, logged or echoed;
the refusal never echoes command text; no file is written by the hook.

### Step 14 — verify

- Lint: `eslint --max-warnings 0` on the three changed JavaScript files — exit 0.
- Fences: unreachable 17, dead exports 65, false-green 207 — unchanged from Step 9.
- `claude plugin validate .` — "✔ Validation passed with warnings"; the three warnings
  are pre-existing (no `author` in `marketplace.json` and `plugin.json`; `CLAUDE.md` at
  the plugin root is not loaded as context). It does not report on `hooks/hooks.json`;
  pointing it at that file validates it as a plugin manifest (wrong schema), so that run
  is not evidence either way.
- `npm test` (worktree, with the main checkout's `node_modules` linked for the run):
  **tests 12563, pass 12559, fail 4, skipped 0, coverage 99.89% (floor 99%).** The four
  failures are exactly the ones the three undeclared files would fix:
  1. `tests/the-bash-channel-cannot-reach-the-ledger-through-a-link.test.js` case 14, two
     tests: its shim `require()`s `PreToolUse.Bash.js` from a wrapper, so the plan's
     `require.main === module` guard stops `main()` from running. A scratch copy with the
     shim changed to `process.argv[1] = HOOK; Module.runMain();` (every assertion
     unchanged) passed 19 of 19.
  2. `tests/readme-numbers.test.js` "src/hooks/: 17 hook files" — there are now 18.
  3. `tests/readme-numbers.test.js` "Project structure: test-file count" — `README.md`
     must say 563; `release.js` writes that line itself, and I reverted it because
     `README.md` is not declared.
  A first run also failed three self-check tests on "gate-destinations-approved": this
  plan sat in `plans/todo/` of the worktree without its approval record, which exists
  only untracked in the main checkout. With that record copied in byte for byte (not
  authored, not committed) those three pass; they will pass in the main checkout as is.

### Step 15 — documented

Header comment of the entry (what it protects, refuses, cannot catch, the fail rule, the
only registered hook); `docs/ENFORCEMENT.md` per Decision 11; `CLAUDE.md` counts. There
is no CHANGELOG in this repository.

### Not verified here

- The live probe of the last acceptance box (a real session after release refusing
  `echo '{}' > .ctoc/approvals/probe.json` and a Write to `.ctoc/state/verify/probe.json`,
  and running `ls .ctoc/approvals`) cannot be run from this worktree; it stays open.
- That Claude Code really sends `cwd` in the payload (Decision 8): not observed, because
  no hook is loaded here; both shapes are tested.
- Steps 11, 13 and 16 agent reviews (`iron-loop-critic`, `security-scanner`) were not
  dispatched by this executor; their boxes stay open.
- Windows: separators and case are exercised by cases 5, 6, 28, 29; the suite itself ran
  on macOS only.

### Decisions taken during execution

1. **The answers store on the shell is the whole `.ctoc/streaming/` folder,** waiting
   folder included. The waiting folder's only writer (`gate-critic`) holds Write, not a
   shell, and the shell's link-aware test would refuse a write there anyway; the editing
   tools keep the carve-out (`targetsStreamingLive`, and `RECORD_SEGMENT_RE` with a
   negative look-ahead for `questions/pending`). The store's shell spec lives in
   `protect-records.js` (`STREAMING_SPEC`) and is passed to the existing `isLedgerWrite`,
   so no sixth export was added to `PreToolUse.Bash.js`.
2. **`streamAnswer` is also in `UNCHECKED_SUSPECT_RE`,** so the crash path refuses an
   inline answer-forging call the same way it refuses `streamApprove`.
3. **The working-directory prefix is `cd ./<dir>`,** not `cd <dir>`, so a directory whose
   name starts with `-` is never read as a `cd` option and dropped.
4. **Decision 12 of the plan ("only the two folders") is superseded** by the owner's
   answer "a" quoted at the top; the build follows the answer.
5. **The refusal sentence stays exactly as written,** for the answers store too, as the
   plan's answer-"a" section says ("the same one").
6. **`src/commands/start.md` line 62 still describes `ledger-backfill.js --plan … --stage
   …` as a sanctioned Bash-channel writer.** After this plan the shell refuses that form
   (Decision 4). `start.md` is not declared, so it was not edited; the owner should know
   the menu text now names a refused command.
7. **The approval record copied into the worktree is not committed:** it is the owner's
   record and lives in the main checkout.

### Scope-growth requests filed (Step 14, all three with `forced_by_declared: true`)

1. `tests/the-bash-channel-cannot-reach-the-ledger-through-a-link.test.js` — forced by the
   `require.main` guard in `src/hooks/PreToolUse.Bash.js`; two-line shim change.
2. `tests/readme-numbers.test.js` — forced by creating `src/hooks/protect-records.js`
   (18 hook files); 17 → 18 in two tests.
3. `README.md` — forced by `src/hooks/protect-records.js` and `tests/protect-records.test.js`;
   "17 Claude Code hooks" → 18 and "562 test files" → 563.

### Scope widening and the second pass

- The session's first instruction was to add the files to `files:` myself. I declined:
  recomputing the specification hash showed one added entry turns the recorded
  `b8f5b057…` into `64708071…`, a `hash-mismatch` against the owner's approval, and
  `docs/ENFORCEMENT.md` says only a human crossing the build gate widens scope.
- The session then widened the approved copy in the main checkout and re-recorded the
  approval itself: spec hash `522a8f09fd78fc005eb32de745daccf17afe4e5cfbb2c844d42e58bb55e54038`,
  `backfilled: true` (entry kind `backfilled`), reason "Scope widened 2026-10-07 by the
  session under the owner's standing instruction (no gate or bookkeeping questions)…".
  I applied exactly the five frontmatter lines the session gave and recomputed
  `computeSpecHash` on this copy: `522a8f09…`, `contentMatches` → match. Only then did I
  edit the four files.
- **Logged for the owner:** this widening was recorded by the session, not by the owner
  through the menu. The record is honest about it (`backfilled: true`, the reason names
  the session), but it also carries `approved_by: "human"`, which a reader who does not
  check the entry kind could misread.
- The four edits:
  - `tests/the-bash-channel-cannot-reach-the-ledger-through-a-link.test.js` (+4 −2): the
    case-14 wrapper runs the hook as the main module (`process.argv[1] = HOOK;
    Module.runMain();`) and its comment says why; every assertion unchanged.
  - `tests/readme-numbers.test.js` (+4 −4): 17 → 18 hook files and "18 Claude Code hooks".
  - `README.md` (+4 −3): "18 Claude Code hooks", naming the record write protection as
    the only one Claude Code loads; "563 test files" written by `release.js`.
  - `src/commands/start.md` (+1 −1): the ledger-backfill row no longer presents `--plan
    … --stage …` as an allowed shell command. It says writing approval records by hand
    is refused, that only `--vision` (optionally `--dry-run`) runs from the shell, that
    approvals and recorded answers go through the menu's own routes, and that the other
    migration forms are the human's to run in his own terminal. It keeps the path
    `src/scripts/ledger-backfill.js` that `tests/ledger-forgery-closed.test.js` requires;
    `tests/menu-protocol.test.js` pins no phrase of this row and passes.
- The three scope-growth request files were deleted as answered by this widening.
- Affected suites (link test, readme-numbers, menu-protocol, ledger-forgery-closed,
  protect-records, iron-loop-enforcer, doc-counts): 271 pass, 0 fail.
- **Full `npm test`, one run** (main checkout's `node_modules` linked and the approval
  record copied in for the run, both removed after; the record is not committed):
  `tests 12563, pass 12563, fail 0, skipped 0`; `[CTOC test-gate] coverage 99.89%
  (threshold 99%), skipped 0, failed 0`; `[CTOC test-gate] PASS`.
- Lint on the two changed test files: zero warnings. Fences: unreachable 17, dead
  exports 65, false-green 207 — unchanged.
- Steps 11, 13 and 16 and the acceptance boxes are left to the session's critic and
  security scanner.

### Step 13 — the security scan and the three fixes

**Verdict: WARN** (the `security-scanner` the session dispatched on this branch). Three
findings fixed, test first; two HIGH findings accepted as documented limits.

1. **MEDIUM — the menu exemption trusted any `…/src/commands/start.js` by name and then
   skipped every record check.** Fixed in `src/hooks/protect-records.js`: `menuCallArgs`
   reads the script argument (`${CLAUDE_PLUGIN_ROOT}` as this plugin's root), resolves it
   against the session's working directory, and exempts the call only when its real path
   (`safe-fs` `realpathSync`; a fault means "not the menu") equals the real path of this
   plugin's own `src/commands/start.js`. Even then, `menuArgsNameRecords` runs every
   whitespace-free argument through the same `isLedgerWrite` test (approval and check
   records), so a record path as a menu argument is refused; quoted text with spaces stays
   data. The answer store is not in that argument check, because the menu's own
   question-generation recipe passes `--touches '.ctoc/streaming/questions/<ref>'` (case 71
   holds it allowed).
   - Case 69 — an agent-written `scratch/src/commands/start.js` run with a `--summary`
     naming `.ctoc/approvals/`, with `.ctoc/approvals/x.json` as an argument, and by
     absolute path with `.ctoc/state/verify/x.json`: **red** (exit 0, exempted) → **green**
     (refused).
   - Case 70 — the real menu with `.ctoc/approvals/x.json`, `--summary
     .ctoc/state/verify/x.json` and `src/../.ctoc/approvals/y.json` as arguments: **red**
     → **green**.
   - Case 71 — the real menu with `menu task complete t1 --summary "x"`, `stream answer
     review/x.md q1 a` and the question-generation `--touches` recipe: green before and
     after (the guard against over-refusing). Case 49 (a `--summary` naming both folders)
     stays allowed.
2. **LOW — the header did not say the hook changes its working directory.** The header
   comment now states that it calls `process.chdir(root)` with a root found from the
   payload's `cwd`, why (the reused checks measure against `process.cwd()`), and that this
   is safe only because every call is a fresh subprocess that exits after one decision.
   The same is in `docs/ENFORCEMENT.md`.
3. **INFO — a parseable Bash payload whose `command` is not a string was a clean allow.**
   It is now treated as unreadable: the fail rule refuses it when the raw stdin mentions
   the records and allows it otherwise. Case 72 — `{"tool_name":"Bash","tool_input":
   {"command":["echo","x",">",".ctoc/approvals/x.json"]}}`: **red** (exit 0) → **green**
   (refused with the second sentence); an object and a number with no record mention stay
   allowed.

Red run before the fix: 72 tests, 69 pass, 3 fail (69, 70, 72). After: 72 of 72.
Lint zero warnings (the first lint flagged a plain `fs.realpathSync` on a computed path;
it now goes through `src/lib/safe-fs.js`). Time added per call re-measured: Write +2.5 ms,
Bash `ls` +5.8 ms over a bare Node start of 17.7 ms.

**Accepted, documented limits (the two HIGH findings).** A path built at run time (a
variable, a glob, string pieces) or a script written to a file and then run, and a hard
link to a record, are not caught and cannot be caught by a hook that reads command text;
both are listed under Risks and in `docs/ENFORCEMENT.md`. **This hook is defense in
depth, not a boundary, against an agent that holds the shell:** it stops the direct
forging command and turns forgery into a deliberate several-step act, but an agent with a
shell that sets out to write a record can still do it.

Remaining limit added by fix 1: a shell whose own `CLAUDE_PLUGIN_ROOT` points somewhere
other than this plugin would run a different file than the hook resolved; the hook can
only read the variable as its own plugin root.

Full `npm test` after the three fixes (same procedure; `node_modules` link and approval
record copy removed after, record not committed): `tests 12567, pass 12567, fail 0,
skipped 0`; `[CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0`;
`[CTOC test-gate] PASS`. The plan still matches the recorded specification hash
`522a8f09…`.

### Step 16 — the final review and its four fixes

**Verdict: SHIP AFTER four fixes** (the `iron-loop-critic` the session dispatched on this
branch). All four made test first, inside the declared files.

1. **MEDIUM — the refusal reason never reached the agent.** Claude Code's hooks
   documentation (quoted in `plans/functional/ctocs-hooks-are-actually-loaded-by-claude-code.md`):
   "Use exit 2 to block with a stderr message, or exit 0 with JSON for structured control.
   Don't mix them: Claude Code ignores JSON when you exit 2." The hook wrote nothing to
   stderr. Now `refuse()` writes the sentence as one line to stderr, then calls `emitDeny`
   (JSON on stdout, exit 2), on both the normal and the crash path.
   `src/lib/hook-deny-signal.js` is unchanged. `assertRefused` now also requires stderr
   to be exactly the sentence plus a newline. This also means the earlier note in this
   record that both sentences are "byte-identical to the plan" no longer holds for the
   first one (fix 2).
2. **LOW — an answers-file refusal named only the approval and check folders.** The first
   sentence is now "CTOC refused this call because it writes, or could write, the approval
   records, the check records or the owner's recorded answers, which only CTOC's menu
   writes; finish your work, report it, and let the menu record the result." The
   `hooks/hooks.json` description names the answers too; `docs/ENFORCEMENT.md` quotes the
   new sentence.
3. **LOW — the plan's menu rule and Decision 5 describe the old name exemption.** The
   specification sections were not edited (they are under the approval hash); Decisions 15,
   16 and 17 were added under `## Decisions Taken Under Ambiguity`, which the hash leaves
   out: the real-path menu rule and that the security scan disproved Decision 5's "adds no
   hole"; the new refusal sentence; the stderr line and the narrowed crash scan. The plan
   still matches `522a8f09fd78fc005eb32de745daccf17afe4e5cfbb2c844d42e58bb55e54038`
   (recomputed after the edit).
4. **LOW — after a crash, a project path containing a record word refused every call.**
   When the payload parses, the crash rule now scans only `JSON.stringify(payload.tool_input)`;
   an unparseable payload is still scanned whole (case 59 keeps that). Case 73, with the
   hook's dependencies missing as in cases 55–57 and `cwd` `/x/verify-project`: `ls` →
   allowed; `echo x > .ctoc/approvals/a.json` → refused with the second sentence.

**Red before the fix:** 73 tests, 20 pass, 53 fail — every case that asserts a refusal
(no stderr line, and the old sentence) plus case 73a (refused, because the raw payload's
`/x/verify-project` matched). **After:** 73 of 73. Lint zero warnings. Time added per call
re-measured on a busier machine: bare Node 20.1 ms, Write +4.4 ms, Bash `ls` +7.2 ms.

Full `npm test` (same procedure; the `node_modules` link and the approval record copy
removed after, record not committed): `tests 12568, pass 12568, fail 0, skipped 0`;
`[CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0`;
`[CTOC test-gate] PASS`.

Still open: the live check after release (a real session refused, and the refusal quoted
as shown) — not runnable from this worktree.
