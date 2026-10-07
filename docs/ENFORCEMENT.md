# Enforcement — hooks, approvals and the question store

This text was moved word for word out of this repository's `CLAUDE.md` on 2026-10-06, keeping its original headings, so that `CLAUDE.md` stays small. **These hooks are not registered with Claude Code today**: the text below describes how they work when registered, not what runs on a tool call now. The one exception is `src/hooks/protect-records.js`, registered alone in `hooks/hooks.json` at the plugin root and described in the last section, "The one loaded hook — write protection for the records". Read it before you touch `src/hooks/**`, plan coverage, approvals, enforcement mode, scope growth, the declared entry point, the continuation gate, the resume watchdog, the question store or the streaming gate.

## Mandatory Pipeline Use (v7)

When Claude is inside a CTOC project, the **PreToolUse enforcement hook** (`src/hooks/PreToolUse.Edit.js` and siblings for Write/MultiEdit/NotebookEdit) intercepts every file-edit operation. Flow:

1. **Whitelist** — `.gitignore`, `.ctoc/*`, `.local/*`, `plans/*.md`, `VERSION` always pass, EXCEPT four carve-outs under `.ctoc/` that are removed from the blanket grant: the approval ledger (`.ctoc/approvals/`), the Gate-3 verify evidence (`.ctoc/state/verify/`), the streaming gate store (`.ctoc/streaming/`, bar its `pending/` quarantine) — all three DENIED outright — and the configuration **command tables** (`.ctoc/quality-config.yaml`, `.ctoc/capabilities/**`), which fall through to plan coverage. The first three protect files whose contents are BELIEVED by a gate; the command tables are different — their contents are OBEYED, not believed: they supply the lint/typecheck/test/cmd strings `quality-agent` runs (as an argv program, `shell:false`, since 00203) on every `/ctoc:push` and on the detached git post-commit hook. An agent that writes them makes CTOC run an arbitrary program, so changing what runs on every commit needs the same approval as changing what ships — an approval requirement, not a ban (`isCommandTablePath` in `PreToolUse.Edit.js`, `tests/config-command-tables-protected.test.js`).
2. **Non-CTOC project** — silent pass; the hook treats this project as out of scope.
3. **Plan-covered target** — allow, **only if a human APPROVED that plan**. The hook checks each active plan's `files:` declaration (in stages `in-progress`, `todo`) and matches the target via minimatch-style globs. Stage priority: in-progress > todo. Within a stage, most-specific glob wins — among the plans that are approved.

   **Only approved plans grant write access.** This decision is a PERMISSION, and it used to be derived from a document the requesting agent was free to write: `plans/**.md` is edit-whitelisted, and the scan included `implementation/`, which is PRE-approval (Gate 2 is the `implementation → todo` edge). An agent could therefore author a seven-line plan declaring `files: ["src/hooks/human-gate-check.js"]` and grant itself permission to edit the hook enforcing the four human gates; with `files: ["**"]` it granted the whole repository. Both were reproduced. Two halves close it and either alone leaves it open: `implementation` is out of the scan, AND every candidate is verified against the agent-write-denied approval ledger via `src/lib/approval-residency.js` (`isApprovedForCoverage`) — otherwise the identical probe written one directory over, into `plans/todo/`, still worked. A plan resident in `in-progress/` is classified against the **`todo` edge**, because `in-progress` is not a gate destination and no ledger entry ever records it; the Gate 2 approval is what admits a plan to the build phase and it holds throughout. `approval-residency.js` is the ONE encoding of approved residency, shared with `src/hooks/human-gate-check.js` — a second predicate would be a divergence, and a divergence in an approval predicate is a forgery surface.

   **Coverage fails CLOSED, and fail-closed means return `null`, never throw.** `PreToolUse.Edit.js` wraps enforcement in a catch that fails OPEN, so a throw out of `plan-coverage.js` becomes an ALLOW — a permission check whose failure mode is "permission granted". An unlistable stage directory used to do exactly that. Enforced by `tests/unapproved-plan-grants-nothing.test.js`. A denial that was caused by an unapproved or invalidated plan NAMES that plan and the reason, because a lockout the human cannot read is what gets reverted.
4. **Escape phrase in recent user messages** — allow. See `src/lib/escape-phrases.js` for the canonical list (`hotfix`, `trivial fix`, `urgent`, `skip planning`, `skip iron loop`, `quick fix`, `trivial change`). Case-insensitive, word-bounded.
5. **Otherwise — decided by `enforcement.mode`.** `strict` (the default) BLOCKS with a helpful message redirecting to `/ctoc:start`; `soft` allows the edit and writes a WARNING to stderr; `off` allows it silently. This is the ONE decision point the mode governs.

Every decision is logged to `.ctoc/logs/enforcement.json`, now including the resolved `mode` and its `mode_source`, so an audit can tell a PERMITTED edit (`allow` + a covering plan) from an UNENFORCED one (`off-allow`). Hook fails OPEN on internal error.

**Per-project tuning** via `.ctoc/settings.yaml` — read by `src/lib/enforcement-mode.js` and consulted at exactly one point (step 5 of the edit flow above):
```yaml
enforcement:
  mode: strict   # strict | soft | off  (default: strict)
```
- `strict` — an uncovered edit is BLOCKED (the historical, default behavior).
- `soft` — an uncovered edit is ALLOWED with a WARNING on stderr.
- `off` — an uncovered edit is ALLOWED silently.

Resolution order (highest wins): `.ctoc/settings.yaml` → `enforcement.mode`, then `.ctoc/settings.json` → `workflow.enforcementMode` (explicit), then the environment profile (`dev` → `soft`), then the schema default `strict`. **An unreadable or malformed setting — or an unknown value — resolves to `strict`** (fail-closed), never to `off`.

**The floor: `off` never weakens a human gate.** It relaxes plan-coverage on file edits ONLY. It never relaxes the approval-ledger deny, the Gate-3 verify-evidence deny, or the streaming-questions deny, and it never touches any `PreToolUse.Bash.js` security or human-gate deny — those are absolute at every mode. Asserted by `tests/enforcement-mode.test.js`.

**BOTH write channels now check plan coverage — the shell channel too.** Plan coverage used to be enforced on the EDIT channel alone (`PreToolUse.Edit.js`), so a shell command that WROTE a source file bypassed the `files:` declaration the whole design rests on. `PreToolUse.Bash.js` now asks the SAME question, using the SAME shared oracle: past the Step-8 write gate, a command the classifier reports as a DETERMINATE write (`shell-write-targets.classifyWrites` → `writes`, targets cd-resolved) has every target checked against `plan-coverage.findCoveringPlan`; an uncovered target is DENIED, naming it. The Edit channel's whitelist (`isWhitelisted`) and its role-scoped user-typed escape check (`findEscapeInTranscript`) are IMPORTED, not copied — two copies of one policy is the drift this closes — and every decision (allow / whitelist / escape / block) is logged to the same `.ctoc/logs/enforcement.json`, tagged `tool: 'Bash'`, carrying the target and a fixed-vocabulary reason but NEVER the command string (a command may carry a secret). The shell coverage deny is **MODE-BLIND by construction** (`tests/enforcement-mode.test.js` #27): an uncovered determinate shell write is denied at every mode — `soft`/`off` relax the Edit channel, never this one, because the shell channel's write gates are absolute. **What is NOT built (deferred):** refusing `indeterminate` commands (`npm test`, `node --test`, `npm run lint`, `node <script>`, `make`, `python …`) — those pass this stage UNCHANGED, because denying them in strict mode would deny CTOC's OWN Step-14 verification commands; that policy needs its own human-approved slice with a verification-command allowlist. Enforced by `tests/bash-gate-plan-coverage.test.js`.

**The Bash gate denies a payload it cannot READ.** The reader (`readPayload`) fails CLOSED on an UNDECODABLE payload: a NON-EMPTY stdin that will not cleanly `JSON.parse` (or a `readFileSync(0)` throw) is DENIED with a fixed-vocabulary reason and NO payload bytes in the message — a gate that cannot read its input must not report a verdict on it. The old quote-truncating regex fallback (which captured `echo \` from a payload hiding `echo "x" > src/uncovered.js` and ALLOWED it — the truncate-then-parse family, inside a permission hook) is DELETED. An EMPTY read is a SUCCESS, not a failure: `raw === ''` (empty or absent pipe — indistinguishable zero-byte reads), and cleanly-parsed JSON with genuinely no command (missing key, `null`, non-string, or `""`), are ALLOWED — there is nothing to gate, and denying an empty read would deny every Bash command in every install if the harness ever delivered no pipe. Enforced by `tests/bash-gate-payload-reader.test.js`.

**Runtime environment** — `general.environment` in `.ctoc/settings.json` (`ask | dev | staging | prod`) selects a CTOC behavior profile via `src/lib/settings.js` (`ENVIRONMENT_PROFILES`). Resolution is `explicit user setting > environment profile > schema default`; `ask` (default) applies no profile and makes the menu prompt the user on first open. Profiles tune enforcement strictness (`dev` → `soft`) and the default model (`prod` → `opus`) — they NEVER weaken a human gate (no profile may set `requireReviewGate: false` or `enforcementMode: off`; enforced by `tests/environment-mode.test.js`).

**Declared entry point — "no app to launch" is not "no entry point".** The Step 14
last-mile check (`src/lib/app-runner.js`) can only recognise an entry point it knows
how to GUESS at: a `bin` field, a `dev`/`start` script. A project whose human entry
point is a one-shot command — a command-line dashboard someone opens every day — was
invisible to every shape and reported `applicable: false`, so the one check that
exists to prove a human can REACH what was built opted itself out on a project that
has a live entry point. Guessing harder produces a classifier that is confidently
wrong on the next project shape, so the project DECLARES instead, in
`.ctoc/settings.json`:

```json
{ "general": { "entry_point": {
    "command": "node src/commands/start.js",
    "expect": "CTOC v",
    "timeout_ms": 30000
} } }
```

`command` is required and is run WITHOUT a shell (argument array; a command
containing `&&`, `||`, `|`, `;` or `&` is rejected as undrivable). `expect` is an
optional LITERAL substring — never a pattern — and when absent a clean exit is the
whole verdict. `timeout_ms` is optional and bounded (default 30000). The declaration
outranks shape detection; absent the key, behaviour is exactly what it was, with a
not-applicable reason that now names the missing declaration as well as the missing
runtime. **A declared entry point that exits non-zero, omits its marker, or times out
FAILS verification — never `applicable: false`**, which would be the false-green shape
this repository fences. There are no retries (a retry turns a flaky check into a slow
check that lies), and the substring match runs on the output STREAM while only a byte
count and a matched flag reach the evidence artifact (stdout may carry secrets).
Non-goals, so this is never "improved" into a flaky check: no browser automation, no
screenshots, no network calls, no multi-step interaction, no warm-up run. Enforced by
`tests/last-mile-drives-entry-point.test.js`.

**Plans must declare `files:`** in YAML frontmatter to be coverage-aware. Pre-v7 plans without this declaration fall through to escape-phrase / block (per the X1 decision: warn-only treatment is logged but not yet block-default for legacy plans).

**The scope-growth third door — a refused write is STOP AND ASK, never a silent edit
(00123).** A plan's declared `files:` set IS its write permission, so an executor that
discovers mid-build it must touch a file the set does NOT cover is refused by the
enforcement hook. The two obvious escapes both arm an auto-revert of the plan out from
under the running build: amending `files:` moves the byte-hashed frontmatter →
`hash-mismatch`; moving the plan back to re-ask records the wrong gate edge →
`wrong-edge`. `src/lib/scope-growth.js` is the third door — WITHOUT touching the plan
file: `requestScopeGrowth(request, root)` files the growth as a structured question in
the EXISTING inbox questions stream (`inbox.createQuestion` → the dashboard question
count → `menu-screens.inboxQuestionsScreen`) and registers the continuation fork so the
Stop hook permits the halt. A request is REFUSED unless all seven fields (plan, step,
file, blocked_write, forced_by, acceptance_criterion, if_refused) are non-empty, so it
can never be a rubber stamp; `forced_by_declared` is three-valued (true / false / **null**
when the declaration could not be read — "could not look" is not "found nothing").
`listScopeGrowthRequests(root)` reads them back grouped by plan (a second request on one
plan is itself a mis-sizing finding). The executor contract is
`agents/iron-loop/iron-loop-executor.md` (Rule 5). This does NOT auto-widen `files:` —
only a human crossing the build gate through the menu widens scope. Enforced by
`tests/scope-growth.test.js`.

## Continuation Gate — building CONTINUES (Operating Lesson 15 enforcement)

CTOC is autonomous building steered by the human on the MAIN decisions. So building
must not silently stop mid-batch. `src/lib/continuation.js` + the Stop hook
`src/hooks/stop-continuation-gate.js` make this deterministic: when the human authorizes
a BATCH of N units (N rounds, N plans, a queue, "do it all"), call
`continuation.startBatch(root, { label, total: N })`, and `continuation.advance(root)`
as each unit completes. While the batch has remaining, fork-free work, the Stop hook
**blocks a premature stop** (exit 2, re-injecting "drive the next unit") — so an agent
CANNOT randomly halt mid-batch. The gate ALLOWS the stop (exit 0) only on: batch complete
(`remaining === 0`), a registered FORK (`continuation.registerFork(root, reason)` — a
decision that is the human's), the bounded block-budget exhausted, or no active batch.
An approved build queue alone never blocks a stop. Only a batch started with `startBatch`
does, and its message names that batch and its remaining count, never a list of plans.
The derived approved-queue regime (v6.13.18) and the question order the gate repeated
(v6.14.36) are removed.
It is OPT-IN (inert with no batch — safe to ship enabled), FORK-AWARE, BOUNDED (`maxBlocks`),
FAIL-OPEN (any error → allow), and ESCAPABLE (`CTOC_SKIP_CONTINUATION=1`). The two
legitimate stops are the ONLY stops: work complete, or a real fork surfaced as a question.

**Durable watchdog — resume on the NEXT session open, because nothing can wake a dead
one.** The Stop gate above only fires while the session is ALIVE; a session that runs
out of tokens, hits a rate limit, or is closed cannot re-inject anything. There is NO
durable, code-armable scheduler in the Claude command-line runtime — `CronCreate` is
session-only (its `durable` flag "has no effect"), and a `RemoteTrigger` cloud routine
runs on claude.ai with no access to the LOCAL repository — and CTOC must never spawn a
second Claude. So the honest maximum is resume-on-session-open: `continuation.advance`
and `startBatch` stamp `lastAdvanceMs`; `src/lib/resume-watchdog.js` exposes the PURE,
FAIL-OPEN `shouldResume(batchState, nowMs, opts)` (resume true only for an active,
fork-free batch with `remaining > 0` whose stamp is older than the stall threshold —
default 90 min, `continuation.stallMinutes` in `.ctoc/settings.json`) and
`resumeDirective(batchState)` (names only the human batch label + remaining count — no
plan number, no path, no secret); `SessionStart.resumeInjection` reads the state and
injects the directive on start, so an unfinished run picks up exactly where it stalled
the moment the human returns. It does NOT — and by the runtime's physics cannot — wake a
closed or idle session on its own. Same guardrails as the Stop gate: OPT-IN, FORK-AWARE,
ESCAPABLE (`CTOC_SKIP_CONTINUATION=1`). Enforced by `tests/resume-watchdog.test.js`.

## Streaming questions — generated only when the human asks (never a second Claude)

CTOC is a plugin inside the Claude command-line interface: plain code cannot dispatch a CTOC subagent, and it must never spawn a second Claude (no `claude -p`, no online API calls). A plan's decision questions are generated only when the human asks: while a decision's questions are missing or stale, its screen in `/ctoc:start` offers "Generate its questions" (`claude:generate-questions {ref}`), and choosing it runs the existing critique fleet for that one plan as background work, writing through `streaming-precompute.writePlanQuestions(root, ref, questions, planMtimeMs)`. Nothing is generated when the menu opens. Session start gives no order: it shows one line with the count of plans waiting for their questions and how to ask (`src/lib/loop-b-driver.js`). The Stop hook never orders question generation. `/ctoc:start` otherwise only READS the store (instant, fail-soft); the human never waits for a critique.

**The critique fleet RECORDS that it ran — an audit attestation, never a licence to cross.** The adversarial `gate-critic` may add an `attestation` block to its quarantined pending object: per expected lens (`premortem`, `devils-advocate`, `red-team`, `advocate`), the `state` it classified (`clean-pass` | `partial` | `failed` | `absent`), a `coverage` DERIVED from that state (`full`/`partial`/`none` — the critic's input is `{ ref, lens, findings }` and it does NOT receive a lens's own coverage, so it never copies one), and the post-dedup `findings` count. `streaming-questions-sweeper.promotePendingFile` threads that block through `writePlanQuestions`'s optional fifth parameter into the live store, where the sufficiency auditor and the Doctor screen read it via `planQuestionsStatus.attested` / `.attestation`. This is a RECORD for audit, NOT a crossing-enabler: it changes no gate behaviour, the empty→ready/enough contract is unchanged, and `gate-critic` still NEVER emits `questions: []`. Honesty is preserved at both ends — the sweeper validates and fabricates nothing (an absent block passes straight through), and the reader (`validateAttestation`) fails toward NOT-ATTESTED on an absent or malformed block, so a missing or broken attestation is always safe and only a fabricated clean one would lie. Round-tripped by `tests/attestation-round-trip.test.js`.

**An empty question list MAY carry an attestation that a critique ran — recorded, not
enforced (yet).** A well-formed empty `questions: []` is honest — "the critique ran and
found nothing to ask" — but on disk it is byte-identical to "a producer errored and
emitted nothing", and the permissive reading is the one wired to auto-crossing. So a
questions file MAY now carry an OPTIONAL `attestation` block: `writePlanQuestions(root,
ref, questions, planMtimeMs, attestation?)` takes a fifth optional parameter that CARRIES
and RECORDS a machine-consumable proof a critique fleet ran — projected from the lenses'
own `self_assessment` vocabulary (`{ generated_by, generated_at, lenses: { premortem,
devils-advocate, red-team, advocate → { state, coverage, findings } } }`). The four
expected lens names and the closed `state`/`coverage` vocabularies are owned by
`streaming-precompute.js` and matched by EXACT string equality — the attestation is
subagent-authored, therefore untrusted, so validation FAILS TOWARD NOT-ATTESTED (an
absent, unreadable, or malformed block reads `attested:false`, never attested).
`planQuestionsStatus(...)` exposes the verdict on its `ready` result (`attested` boolean
+ the raw `attestation` block) so a reader — the sufficiency audit, the Doctor screen —
can tell "a critique ran" from "no record either way". **This is ADDITIVE and does NOT
gate:** an unattested empty list still reads `ready`/`enough:true`, so auto-crossing for
clean plans is unchanged. Every existing four-argument caller is byte-for-byte unaffected
(no `attestation` key is written). Making an unattested empty list read `enough:false`
(the enforcement / refusal) is a high-stakes gate change deferred until an
attestation-PRODUCING path exists, and is the human's decision. Enforced by
`tests/questions-attestation.test.js`.

## Test & Verify

**The sufficiency-crossing audit record states the DENOMINATOR, not only the
numerator.** When a plan crosses a pre-build gate by ENOUGH INFORMATION (no human
approval), `streaming-gate.composeSufficiencyEvidence` writes the ledger `evidence`
in one fixed, greppable order so an auditor reads the arithmetic rather than the
conclusion: `sufficiency: <ref> — <N> question(s) computed, <M> answered (<ids>);
<U> unanswered, <B> blocking; attested by: not recorded; enough (no unanswered
fork)`. `computed` is how many questions the file held — it is what separates
"asked seven, cleared them" from "asked nothing", which the old answered-only string
collapsed to identical bytes. A count that could not be established renders `unknown`
(never `0`); a genuine zero renders the explicit phrase `no questions were computed`;
the counts are threaded from the SINGLE verdict that authorised the crossing (never a
second read that could observe a different revision). `attested by: not recorded` is
a fixed forward-compatible slot until a critique-record source exists.

## Critical Rules

### 1. Human Gates (4 Mandatory Approval Points)

Moved from `CLAUDE.md` on 2026-10-06, where these two lines followed the four-transitions table:

**Enforcement**: Pre-tool hook monitors ALL tool calls. Violations auto-revert the plan, log to `.ctoc/logs/gate-violations.json`, and alert the user. Plans at gate destinations need an `approved_by: human` marker or they get reverted.

**If asked to "complete" or "move to done"**: REFUSE. Explain the human gate requirement.

## The one loaded hook — write protection for the records

Decided by the owner on 2026-10-07. `hooks/hooks.json` at the plugin root registers exactly
one command, `node "${CLAUDE_PLUGIN_ROOT}/src/hooks/protect-records.js"`, on `PreToolUse`
for Write, Edit, MultiEdit, NotebookEdit and Bash. `.claude-plugin/hooks.json` and
`.claude-plugin/plugin.json` are unchanged, so every other hook in this file stays
unregistered. The entry reuses the checks of `PreToolUse.Edit.js` and `PreToolUse.Bash.js`
and runs nothing else: no plan coverage, escape phrases, enforcement mode, step gates,
irreversible-command net or plan-move gate.

**What it protects:** the approval records (`.ctoc/approvals/`), the check records
(`.ctoc/state/verify/`), and the owner's answers and live question files (everything under
`.ctoc/streaming/` except the waiting folder `.ctoc/streaming/questions/pending/`, which the
question-writing agents reach with the Write tool). On the shell the whole
`.ctoc/streaming/` folder counts, because those agents hold no shell.

**What it refuses:**

1. An editing-tool target inside a protected area — after `..` is resolved, in any letter
   case, with `\` read as `/`, through a symbolic link, or anywhere a record folder appears
   as a path segment (so a session outside the project cannot write another copy's records).
2. A shell command naming a protected folder — quotes removed, `\` read as `/`, any letter
   case, `..` anywhere — in a segment that is not a pure read (`cat`, `ls`, `grep` and the
   other read commands, and the git subcommands `add`, `commit`, `diff`, `log`, `show`,
   `status`, `blame`, `ls-files` without `--output` or `>`).
3. The same after a `cd` into or toward the folder, including a working directory the
   session already stands in; and an operand or quoted string that really leads into a
   folder through a symbolic link (the first 128 per segment).
4. Inline scripts (`node -e` and its relatives) naming an approval-ledger writer,
   `step-13-verify`, `persistVerifyResult`, `verifyEvidencePath`, `crossBySufficiency`,
   `streamApprove` or `streamAnswer`; inline scripts built at run time; a decoded payload
   piped into an interpreter.
5. `ledger-backfill.js` in any form except exactly `node <…>/src/scripts/ledger-backfill.js
   --vision`, optionally with `--dry-run`. `--plan` writes a `backfilled` entry accepted at
   every stage, `done` included, and `--mark-migrated` arms the bulk revert; both are
   migrations the human runs in his own terminal.

A pure call of the menu entry point (`node <…>/src/commands/start.js …` with no `$` other
than `${CLAUDE_PLUGIN_ROOT}`, no backtick, no backslash and no unquoted `;`, `&`, `|`, `<`,
`>` or line break) is checked differently, and only when the script has the same real path
as this plugin's own `src/commands/start.js` (`${CLAUDE_PLUGIN_ROOT}` read as this plugin's
root, resolved against the session's working directory; a fault means "not the menu"). An
agent-written `…/src/commands/start.js` gets no exemption. The menu is the legitimate
writer, so its quoted text arguments are data (a `--summary` may name a folder), but a
whitespace-free argument that is a path into the approval or check records is refused, as
the same operand would be without the menu in front. The answer store is left out of that
argument check because the menu's question-generation recipe passes
`--touches .ctoc/streaming/questions/<ref>` as data. A Bash payload whose `command` is not a
string is treated as unreadable (the fail rule below).

**A background agent may not answer, approve or move a plan through the menu** (the owner's
decision of 2026-10-07). Claude Code's `PreToolUse` input carries `agent_id` only when a
subagent makes the call, never for the main session. When the payload carries a non-empty
`agent_id`, a menu call runs only if its route is on the allowed list below; every other
route — including one the router gains later — is refused with "CTOC refused this call
because a background agent may not answer CTOC's questions, approve a plan or move one on
through the menu; report your result and let the main session do it." on stderr and exit 2.
The route is read as `start.js` reads it (`--live-agent-ids` and its value removed, a single
remaining argument split on whitespace). The rule also covers the menu reached outside a pure
call: a command segment running a JavaScript runtime on a script ending in `start.js` with a
refused route, and an inline script naming `menu-screens`, `streaming-gate`,
`continueAfterCrossing` or `approveSubplans`. Every decision for a call without an `agent_id`
is unchanged.

| Refused when the call carries an `agent_id` | Why |
|---|---|
| No arguments, or only `--live-agent-ids <ids>` | the default screen crosses pre-build plans on sufficiency (an entry in `.ctoc/approvals/` and a move across a gate) |
| `stream approve <ref>` | `approvePlan`: an approval record and a gate crossing, then the continuation |
| `stream answer <ref> <id> <key> [<digest>]` | writes the answers log (answers, holds, releases), then the continuation, which crosses plans (review to done included) |
| `stream skip <ref>` | re-renders through the crossing pass |
| `stream comment <ref> <text>` | writes `.ctoc/streaming/comments.jsonl`, then the same re-render |
| `stream` with no or an unknown sub-command | the default screen |
| `plan` with no reference | the default screen |
| `menu task complete <id> … --continue` | the continuation: crossings, planner and classification tasks, builds started |
| any route not in the allowed table | fail closed |

| Allowed for a background agent | Why |
|---|---|
| `menu task complete <id> [--summary …] [--gate N] [--next <route>] [--b64 …]` without `--continue` | the build agent's documented completion: in-progress to review and its check record; no approval, no answer, no human gate |
| `menu task add …`, `start …`, `fail …`, `cancel …`, `list`, `board` | the task registry only |
| `menu`, `menu commands`, `dashboard` | the pipeline dashboard: task reconcile and orphan recovery (in-progress back to todo, not a human gate) |
| `tasks`, `task <id>` | read-only task screens |
| `browse <stage>`, `section <name>`, `stubs <slug>`, `validate <stage>/<file>` | read-only screens |
| `inbox questions`, `decisions`, `gates`, `escalations`, `migration`, `verify`, `stale`, `cleanup …` | read-only screens |
| `plan <stage>/<file>` | the plan screen: it sweeps the waiting folder (validated promotion) and moves nothing |

A crash on a background agent's call whose tool input mentions `start.js`, `menu-screens` or
`streaming-gate` refuses with the "protection failed to run" sentence; the same crash on the
main session's menu call is allowed, so one broken release cannot lock the human out of his
own menu.

The hook calls `process.chdir(root)` with the project root found from the payload's `cwd`,
because the reused checks measure against the working directory. That is safe only because
every call is a fresh subprocess that exits after one decision.

**The refusal** is one sentence on every channel, with no command text echoed back:
"CTOC refused this call because it writes, or could write, the approval records, the check
records or the owner's recorded answers, which only CTOC's menu writes; finish your work,
report it, and let the menu record the result." It is written as one line to stderr and
the process exits 2; the deny decision JSON also goes to stdout, but Claude Code ignores
JSON when a hook exits 2 and shows stderr instead, so stderr is what the agent reads.

**Fail rule.** A crash refuses only a call that mentions the records, with "CTOC refused
this call because it mentions the approval or check records and CTOC's protection for them
failed to run; tell the human that this protection is broken.", and allows the rest, so one
broken release cannot stop every tool call in every project. When the payload parsed, only
its `tool_input` is scanned, so a project whose path contains one of the words is not
refused on every call; a payload that will not parse is scanned whole. A failure to load
`src/lib/hook-deny-signal.js` itself exits 1, which Claude Code treats as not blocked.

**What it cannot catch** (it reads command text; it is not a sandbox):

- a script file written elsewhere and then run (any language, an npm script, a git hook, a
  test file);
- a path built at run time: a variable, a glob, string pieces inside a one-liner, `$'…'`;
- git operations that restore or replace tracked records without naming them (branch
  checkout, stash pop, merge, pull, reset, rebase, apply);
- replacing a parent folder (`mv`, `cp -r`, `rsync` or an archive onto `.ctoc`,
  `.ctoc/state` or the project root);
- hard links; more than 128 operands in one segment; file-writing tools other than the five;
- read commands with a write side effect (`find -delete`, `tree -o`), which can delete or
  corrupt a record but never forge one;
- a background agent reaching the menu's refused routes through a script file it wrote and
  then ran, a path built at run time, or a tool other than the five matched;
- the main session itself running `stream answer` or `stream approve` without the human's
  reply — it carries no `agent_id` by design and is trusted to run only answers the human
  gave; every answer, hold and release stays a timestamped entry in the answers log;
- a future Claude Code that stops sending `agent_id` for subagents: such calls read as the
  main session's, which only widens back to the behaviour before this rule;
- on a crash, a call that reaches a record through a link without naming it.
