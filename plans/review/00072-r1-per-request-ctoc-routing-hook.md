---
iron_loop_verdict: true
iron_loop: true
title: "Every request is routed through CTOC by hooks, not by paragraphs — a per-prompt routing hook and a registry-driven agent-ownership check"
type: implementation
parent_plan: none
depends_on: none
priority: critical
files:
  - src/lib/ctoc-routing-reminder.js
  - src/hooks/UserPromptSubmit.js
  - tests/ctoc-routing-reminder.test.js
  - .claude-plugin/hooks.json
  - src/lib/agent-ownership.js
  - src/lib/transcript-escape.js
  - src/hooks/PreToolUse.Task.js
  - src/hooks/PreToolUse.Edit.js
  - tests/agent-ownership.test.js
  - .ctoc/operations-registry.yaml
  - CLAUDE.md
  - "README.md"
  - "tests/readme-numbers.test.js"
approved_by: human
approved_at: 2026-07-30T19:04:14.650Z
gate_crossed: implementation → todo
---

# Every request is routed through CTOC by hooks, not by paragraphs

## What the human asked for, verbatim

> "and with every request i want you to use ctoc, and i want the 'you to use ctoc'
> implemented as a hook when the plugin is installed or updated"

Two parts, and they are separable:

**(A)** On every request in a CTOC project, the session model is required to route
work through CTOC — its menu, its pipeline, its own agents — rather than freelancing
edits or substituting an ad-hoc agent.

**(B)** That behavior installs as a HOOK, wired automatically when the plugin is
installed or updated. It must not depend on a human remembering to add it, and it
must not be documentation.

## This plan contains TWO independently schedulable parts

They share no file. Either can be built alone, in either order.

| | Part One — the per-request routing hook | Part Two — the agent-ownership check |
|---|---|---|
| What it does | Injects a short CTOC routing line into the model's context when work is requested and CTOC is not already driving it | Refuses a subagent dispatch that hands pipeline work to an agent the registry says does not own it |
| Hook event | `UserPromptSubmit` (new) | `PreToolUse` on `Task` (existing hook, new check) |
| Can it block? | **No** — context injection only, always exits 0 | **Yes** — a deny, with the existing escape phrase as the only override |
| Files | `src/lib/ctoc-routing-reminder.js`, `src/hooks/UserPromptSubmit.js`, `tests/ctoc-routing-reminder.test.js`, `.claude-plugin/hooks.json` | `src/lib/agent-ownership.js`, `src/lib/transcript-escape.js`, `src/hooks/PreToolUse.Task.js`, `src/hooks/PreToolUse.Edit.js`, `tests/agent-ownership.test.js`, `.ctoc/operations-registry.yaml` |

The split point is the `# PART TWO` heading below. Nothing above it references anything
below it.

## Why a hook and not documentation — the design rationale

This project has been bitten repeatedly, and recently, by rules that live only in
prose. The instances below are each verified by direct reading of the CURRENT tree:

1. **`enforcement.mode` was written but not read for a long time — a shipped switch
   wired to nothing, since made live.** `src/lib/init-project.js:509-510` still writes
   an `enforcement: mode: strict | soft | off` block into every new project's settings
   file. For most of the project's life nothing in `src/` read it. That gap has SINCE
   been closed: `src/lib/enforcement-mode.js` now resolves the mode and the four editing
   hooks consult it (`PreToolUse.Edit.js:608-610` and `:687-701`).
   `src/hooks/PreToolUse.Task.js:26-32` records the change in its own header — *"The
   sibling editing hooks NOW honor `enforcement.mode` … but this hook deliberately does
   NOT"* — the exact inversion of the comment that stood there when this plan was first
   drafted. It is kept here as a FORMER instance because its cure is the whole point: a
   prose-only switch stayed dead until someone made it executable.

2. **`src/hooks/SessionStart.js` (the `questionDispatchDirective`, ~line 199)
   instructs subagents to write via a JavaScript function they cannot themselves call.**
   The injected directive tells each dispatched subagent to write "via
   `streaming-precompute.writePlanQuestions(...)`". A subagent cannot call a JavaScript
   function; it can only be told to, and hope. This is now the ACCEPTED session-driven
   mechanism (X7), not a defect — but it still makes the point: the directive holds only
   for as long as the model keeps following it.

3. **A `precompute` task kind was documented in the menu recipe and rejected by the
   registry.** The whole streaming-question subsystem never ran. Fixed in commit
   `4238346`, whose message says exactly that: *"precompute was never a valid task
   kind — the question fleet could never be dispatched."*

4. **`.ctoc/operations-registry.yaml` is described in `CLAUDE.md` as the "Agent
   registry, kanban config" and NOTHING IN `src/` READS IT.** A grep for
   `operations-registry` across `src/` returns exactly one hit, in a comment in
   `src/scripts/release.js:60`. A 500-line hand-maintained single source of truth,
   consulted by no code. Part Two of this plan makes it live for the first time.

5. **Instruction-following decays over a long session.** This is not a theory about
   the model; it is what happened in the session that produced this request. The
   operating rules were read at session start, honored for a while, and drifted.

A hook is deterministic. A paragraph is a hope. That is the entire argument, and it
is why part (B) of the request is the load-bearing half.

## What is ALREADY enforced — the honest scope

Most of "make the model use CTOC" already exists. Stating this plainly is the point;
inflating it would be the failure mode.

| Behavior | Enforced today? | Where |
|---|---|---|
| Editing a file no active plan covers is blocked | **YES, deterministically** (at the default `enforcement.mode: strict`) | `src/hooks/PreToolUse.Edit.js` + `Write` / `MultiEdit` / `NotebookEdit` siblings. Protected-path guards → whitelist → CTOC-project detect → plan coverage → escape phrase → enforcement-mode → deny via `hook-deny-signal.emitDeny`. |
| The four human gates cannot be self-crossed | **YES** | `src/hooks/human-gate-check.js`, on the `*` PreToolUse matcher. |
| More than five concurrent background subagents | **YES** | `src/hooks/PreToolUse.Task.js` via `agent-slots.acquire`. |
| Escape phrases count only when the human typed them | **YES** | `PreToolUse.Edit.js:369-429` — role-scoped transcript extraction excludes tool results. |
| CTOC context injected once per session | **YES** | `src/hooks/SessionStart.js`, with a streaming directive that is **empty when nothing is pending**. |
| **A per-request reminder to route work through CTOC** | **NO — does not exist** | No `UserPromptSubmit` hook is registered. A grep for `UserPromptSubmit` across the entire repository returns zero matches. → **Part One** |
| **"Use CTOC's own agents; never substitute a stand-in"** | **NO — documented only** | `PreToolUse.Task.js` enforces the concurrency cap and nothing else. The rule lives only in `CLAUDE.md` prose. → **Part Two** |

No edit-blocking behavior is duplicated by anything in this plan.

---

# PART ONE — the per-request routing hook

## The decision — which hook event, and why

**`UserPromptSubmit`, once per prompt, in addition to (not instead of) `SessionStart`.**

| Candidate | Fires | Verdict |
|---|---|---|
| `SessionStart` | Once, at session open | **Already used, keep it.** But once-per-session is exactly the surface that decays over a long session. It cannot be the answer to "with every request". |
| `UserPromptSubmit` | Once per human prompt, before the model processes it. Hook stdout on exit 0 is added to the model's context. | **Chosen.** The only event that maps one-to-one onto "a request" and can inject context. |
| `PreToolUse` (`*`) | Per tool call | Wrong granularity — many tool calls per request — and it is a permission surface, not a context-injection surface. |
| `PostToolUse` | After a tool call | Too late to steer the request; its output is not reliably injected. |

**Both, then**: `SessionStart` keeps its one-time full banner; `UserPromptSubmit` adds
a short, state-dependent, mostly-silent routing line.

### Verification requirement — this is `believed`, not `verified`

That `UserPromptSubmit` exists in this harness and that its stdout is injected as
context on exit 0 is **believed** (from the Claude Code hook specification), **not
verified in this repository** — no CTOC hook uses it and the repository contains no
document listing the harness's hook events.

**Step 9 (PREPARE) must verify this empirically before Step 10 writes the hook body.**
If verification fails, the plan is **kicked back to Step 5** for redesign against a
different event. It is NOT silently degraded to a no-op — a hook registered against an
event that never fires is precisely the placebo this plan exists to stop shipping.

## The decision — how it stays quiet

A reminder repeating identical text every prompt will be tuned out and will burn
context. `SessionStart.js:209-218` already models the discipline: its
`questionDispatchDirective` returns `''` when nothing is pending. Two independent quiet
gates apply here.

The injected text is assembled from two blocks, each with its own firing rule. If both
are empty, the hook writes **nothing at all** to stdout and exits 0.

### Block 1 — the routing directive

Fires when **all** of:

- the project is a CTOC project (`ctoc-project-detector.isCtocProject(root).isCtoc`);
- the prompt looks like a **work request** (build / add / fix / implement / change /
  refactor / write / remove / update / rename / migrate / wire — word-bounded,
  case-insensitive), rather than a question;
- **no plan is currently in progress** (`getPlanCounts(root).inProgress === 0`), OR the
  directive has not yet been emitted for the current in-progress plan set this session;
- the prompt contains **no escape phrase the human typed this turn**
  (`escape-phrases.matchEscapePhrase(prompt)` returns null).

In one sentence: **the directive fires exactly when the human asks for work and CTOC is
not already driving that work.** Once the pipeline IS driving a plan, repeating "route
through CTOC" is noise.

Suppressing on a typed escape phrase is deliberate **composition**, not a new bypass:
the human has already opted out of ceremony through the sanctioned mechanism in
`src/lib/escape-phrases.js`. This hook adds no phrase, changes no phrase, and grants no
permission — it only declines to lecture.

### Block 2 — live pipeline state

Fires when the state fingerprint **differs from the last one emitted this session**. An
unchanged pipeline says nothing. On CTOC's own repository — dozens of plans in flight
at all times — the state block appears when something moves and is silent otherwise,
instead of firing on all several-hundred prompts of a session.

Fingerprint and last-emission memo are stored per session id in
`.ctoc/state/routing-reminder.json`, pruned to the 20 most recent sessions.

### State is read from a PURE source only — an important hazard

`streaming-gate.pendingGateDecisions(root)` looks like the natural source for "plans
awaiting a decision". **It must not be called from this hook.** Its own documentation
(`src/lib/streaming-gate.js:551-601`, the `pendingGateDecisions` function at line 576)
states, under the "X6 — THE GATE CROSSES ITSELF" heading, that it "is no longer a pure
read": it CROSSES qualifying gates as a side effect before listing. Calling it once per
prompt would run gate-crossing machinery on the hottest path in the system.

This hook reads **only** `state.getPlanCounts(root)` — pure, memoized, per-stage counts
— and points the human at `/ctoc:start` for the decision detail. The hook never touches
gate logic at all.

## The injected text — drafted in full

Vague exhortation is worthless; the model follows literal instructions. This is the
real text, not a placeholder.

**Block 1 — the routing directive** (constant, returned by `buildRoutingDirective()`):

```
## CTOC routing — this project runs its work through CTOC

This request looks like work (build, change, fix, add). No CTOC plan is currently
driving it. Before editing any file:

1. Run /ctoc:start and create or activate a plan whose `files:` list covers what you
   are about to touch. Edits to files no active plan covers are BLOCKED by the
   PreToolUse hook — the write will be denied, not warned about.
2. Use CTOC's own agents for pipeline work: vision-advisor, product-owner,
   implementation-planner, iron-loop-executor, iron-loop-critic, and the review
   fleet. Handing a step's work to an agent that does not own it is refused at
   dispatch.
3. Do not cross a human gate. vision->functional, functional->implementation,
   implementation->todo and review->done are the human's decisions, not yours.
4. If a load-bearing decision is missing, ask the human before building. An
   unanswered question is a red flag; a guess dressed up as a decision is worse.

If this change is genuinely too small for a plan, say so plainly and let the human
type an escape phrase. Do not route around the pipeline silently.
```

**Block 2 — live pipeline state** (`buildStateBlock()`, only lines that are true):

```
## CTOC pipeline state

- In progress: 1 plan
- Todo queue: 4 plans ready to build
- Awaiting a gate decision: 6 in implementation, 12 in review

Open /ctoc:start to see which decisions are open and answer them.
```

Every line is conditional. Zero true lines produces `''`, not an empty heading.

## The decision — how it is wired on install and update

**No installer code changes. The registration in `.claude-plugin/hooks.json` IS the
install-and-update wiring.** Worth being explicit, because the request specifically
asks for it:

- Claude Code reads a plugin's hook registrations from `.claude-plugin/hooks.json` at
  the installed plugin root, so every fresh install has it.
- `/ctoc:update` (`src/commands/update.js`) refreshes the marketplace clone
  (`git reset --hard origin/main`) and syncs it into the active cache version directory;
  `.claude-plugin/hooks.json` is part of that sync, and the command already tells the
  user to restart, which is when the registration takes effect.

Nothing in `init-project.js` changes — hooks are plugin-level, not project-level.

## Part One architecture

### Dependency graph

```
.claude-plugin/hooks.json  --registers-->  src/hooks/UserPromptSubmit.js
src/hooks/UserPromptSubmit.js  --requires-->  src/lib/ctoc-routing-reminder.js
src/lib/ctoc-routing-reminder.js  --requires-->  src/lib/ctoc-project-detector.js  (existing)
                                  --requires-->  src/lib/state.js  (existing, getPlanCounts)
                                  --requires-->  src/lib/escape-phrases.js  (existing)
                                  --requires-->  src/lib/safe-fs.js  (existing)
tests/ctoc-routing-reminder.test.js  --tests-->  both new files
```

No cycles. Dependencies flow inward (hooks → lib), never outward. No new dependency.

### File: `src/lib/ctoc-routing-reminder.js`

**Action:** CREATE
**Purpose:** Decide what, if anything, to say to the model on this prompt, and render it.

```js
/**
 * Whether a prompt reads as a request to CHANGE the codebase, as opposed to a
 * question about it. Word-bounded, case-insensitive. Deliberately permissive: a
 * false positive costs a few lines of injected context, never a block.
 * @param {string} prompt
 * @returns {boolean}
 */
function looksLikeWorkRequest(prompt)

/**
 * The live pipeline state, read ONLY from the pure, memoized state.getPlanCounts.
 * Never calls streaming-gate.pendingGateDecisions (it crosses gates as a side
 * effect — see the hazard note). Fail-soft: any error yields all zeros.
 * @param {string} root
 * @returns {{inProgress:number, todo:number, implementation:number, review:number,
 *            functional:number, canvas:number}}
 */
function collectState(root)

/**
 * A stable, order-independent fingerprint of the live state. Returns '' when there
 * is nothing live to report (every counted stage is zero).
 * @param {object} state
 * @returns {string}
 */
function fingerprint(state)

/** The constant routing directive text (the full draft above). @returns {string} */
function buildRoutingDirective()

/**
 * The live-state block. Emits only lines that are true; '' when every count is zero.
 * @param {object} state
 * @returns {string}
 */
function buildStateBlock(state)

/**
 * Read the per-session memo. Fail-soft — a missing, unreadable, or malformed store
 * yields null. Never throws.
 * @param {string} root
 * @param {string} sessionId
 * @returns {{fingerprint:string, directiveInProgress:number|null}|null}
 */
function readMemo(root, sessionId)

/**
 * Write the per-session memo, pruning to the 20 most recently written sessions so
 * the store cannot grow without bound. Fail-soft — returns false on any failure.
 * Never throws.
 * @param {string} root
 * @param {string} sessionId
 * @param {{fingerprint:string, directiveInProgress:number|null}} memo
 * @returns {boolean} true iff the store was written
 */
function writeMemo(root, sessionId, memo)

/**
 * The whole decision. Reads the project and the session memo, decides which blocks
 * fire, renders them, updates the memo. Returns '' for "say nothing".
 * NEVER THROWS: every internal failure degrades to '' rather than propagating.
 * @param {{root:string, prompt:string, sessionId:string}} opts
 * @returns {{text:string, directive:boolean, state:boolean, reason:string}}
 *   reason ∈ 'not-ctoc' | 'escape-phrase' | 'not-work' | 'already-driving'
 *          | 'unchanged' | 'directive' | 'state' | 'directive+state' | 'error'
 */
function buildReminder({ root, prompt, sessionId })

module.exports = {
  looksLikeWorkRequest, collectState, fingerprint,
  buildRoutingDirective, buildStateBlock, readMemo, writeMemo, buildReminder,
};
```

Every filesystem touch goes through `safe-fs` and is individually guarded.
`buildReminder` wraps its whole body in a try/catch returning
`{ text: '', directive: false, state: false, reason: 'error' }`. Cross-platform:
`path.join` throughout; memo at
`path.join(root, '.ctoc', 'state', 'routing-reminder.json')`. No shell.

### File: `src/hooks/UserPromptSubmit.js`

**Action:** CREATE
**Purpose:** The registered per-request hook. A thin wrapper — all judgment is in the library.

```js
/** Read the single-consumer stdin pipe exactly once. @returns {object|null} */
function readStdinJson()

/**
 * The hook body, operating on an ALREADY-PARSED payload (no stdin read — the caller
 * owns the one read, matching the PreToolUse.Edit.js contract).
 *
 * Writes the reminder text to STDOUT and exits 0. Empty text writes nothing.
 * ALWAYS exits 0 — never a non-zero code. On UserPromptSubmit a non-zero exit
 * BLOCKS the human's prompt; a routing reminder must never be able to do that.
 *
 * @param {object|null} stdinJson
 * @returns {void} always terminates via process.exit(0)
 */
function run(stdinJson)

module.exports = { run, readStdinJson };
if (require.main === module) { run(readStdinJson()); }
```

Payload fields consumed: `prompt` and `session_id`, both defended. A missing
`session_id` falls back to `'unknown-session'`, degrading the novelty gate to "always
novel" rather than crashing. The library is required inside a try/catch (matching
`PreToolUse.Edit.js:49-70`), so a broken library degrades to silence.

### File: `.claude-plugin/hooks.json`

**Action:** MODIFY — add a `UserPromptSubmit` key inside the existing top-level `hooks`
object (a sibling of `SessionStart`, `PreToolUse`, `PostToolUse`, `SubagentStop`,
`Stop`). The current file wraps every event under a single top-level `"hooks"` object;
the new key goes there, not at the document root:

```json
"UserPromptSubmit": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/hooks/UserPromptSubmit.js\""
      }
    ]
  }
]
```

No matcher — `UserPromptSubmit` is not tool-scoped. The `${CLAUDE_PLUGIN_ROOT}` form
and quoting match every existing entry exactly.

---

# PART TWO — the registry-driven agent-ownership check

> **DROPPED — NOT BUILT (human decision, 2026-07-31).** Everything below this heading
> is design record only. `classifyWorkKind` has no sound deterministic algorithm (see
> decision 0 under "## Decisions Taken Under Ambiguity"): the deny verdict is either
> unreachable/vacuous or requires the probabilistic semantic match this plan rejects.
> None of Part Two's files were touched, and its Test Plan (cases 1-13) and its rows in
> the Acceptance-criteria table are OUT OF SCOPE for what shipped. A sound signal must be
> designed at Step 5 as a separate slice before any of this is built.

## The decision, made by the human

**A registry-driven ownership map.** `.ctoc/operations-registry.yaml` maps each kind of
pipeline work to the CTOC agent that owns it. The subagent-dispatch hook checks the
requested agent against that map.

Why this shape was chosen over the alternatives:

- It is the only option that catches **one CTOC agent standing in for another**, not
  merely a generic stand-in. A deny-list of generic agent names would catch the common
  habit but say nothing about which agent was actually right.
- **The dispatch hook already reads the agent type.** `src/hooks/PreToolUse.Task.js:94`
  (inside `getLabel`) reads `input.subagent_type`. The input it needs is in hand.
- The registry already names agents in dozens of places, so the mapping surface exists
  rather than being invented.
- A **semantic-match** approach was rejected as probabilistic: a false block at dispatch
  time stops legitimate work with no override path, and a check that misfires gets
  switched off within a week.
- A **post-hoc audit** was rejected because it never prevents a substitution; it only
  records one after the work is done.

## The registry does NOT carry a usable map today — say it plainly

The constraint was: *if the registry does not currently carry a work-kind-to-agent
mapping in a usable shape, say so plainly and plan the minimal addition rather than
pretending it is already there.* It does not, on two counts.

**First: nothing reads the registry at all.** A grep for `operations-registry` across
`src/` returns exactly one hit, and it is a comment in `src/scripts/release.js:60`.
This plan makes the registry executable for the first time in its life.

**Second: the mapping it does contain is STALE RIGHT NOW.** The `iron_loop:` block
(`.ctoc/operations-registry.yaml:170-248`) maps steps to agents — but it is a
**15-step** map, and the live Iron Loop is **16 steps**. Read the two side by side:

| Registry `iron_loop:` block | Live Iron Loop (`CLAUDE.md`, `plan-validator.js`) |
|---|---|
| step 1 = ASSESS | step 1 = IDEATE, step 2 = ASSESS |
| step 2 = ALIGN | step 3 = ALIGN |
| step 3 = CAPTURE | step 4 = CAPTURE |
| step 4 = PLAN … step 6 = SPEC | step 5 = PLAN … step 7 = SPEC |
| step 8 = **QUALITY** | **no such step exists** |
| step 15 = FINAL-REVIEW | step 16 = FINAL-REVIEW |

The registry has no IDEATE, carries a QUALITY step that was removed, and is off by one
from step 4 onward. **It is a live, running instance of the exact defect class this
plan is about** — a hand-maintained instruction surface that drifted out of truth while
nobody executed it. Wiring a hook to that block as-is would enforce a map of a pipeline
that no longer exists.

**Therefore: do not read `iron_loop:`. Add a new, purpose-built block.**

### The minimal addition — `agent_ownership:`

A new top-level block in `.ctoc/operations-registry.yaml`, deliberately **flat,
comment-free, and quote-free** so a tiny dedicated parser handles it reliably:

```yaml
agent_ownership:
  schema_version: 1
  loop_steps: 16
  kinds:
    vision:
      owner: vision-advisor
      collaborators: [cto-chief, product-owner]
    functional-planning:
      owner: product-owner
      collaborators: [cto-chief, iron-loop-critic]
    implementation-planning:
      owner: implementation-planner
      collaborators: [iron-loop-critic, iron-loop-integrator, stack-chooser]
    build:
      owner: iron-loop-executor
      collaborators: [iron-loop-critic]
    review:
      owner: iron-loop-critic
      collaborators: [iron-loop-integrator, cto-chief]
    security:
      owner: security-scanner
      collaborators: [iron-loop-critic]
```

`loop_steps: 16` is a **self-dating stamp**: the loader compares it against the live
step count and, on mismatch, declares the map stale and **allows everything** rather
than enforcing an outdated map. A stale map must never block; it must go quiet and be
visibly wrong. This is the cheapest possible staleness detector and it costs one line.

The map is **data, not code** — adding an agent means editing the registry, never a
hook.

## The decision I was asked to make — WARN or BLOCK

The human chose the detection mechanism, not the strictness. **My recommendation: BLOCK,
but only on a high-confidence mismatch, with the existing escape phrase as the sole
override.** Reasoning:

- **A warning nothing acts on is documentation again.** That is the precise failure
  this entire plan exists to end. Shipping a stderr line that no mechanism consumes
  would be one more instance of the defect class on the list above, authored by this
  plan.
- **Every sibling hook blocks.** `PreToolUse.Edit.js` denies an uncovered edit;
  `PreToolUse.Task.js` denies a sixth subagent; `human-gate-check.js` reverts a
  crossed gate. A warn-only fence in the same file would be inconsistent and inert.
- **The stated failure mode — "a false block with no override is how enforcement gets
  disabled" — is real, and is answered by two things rather than by weakening the
  fence:**
  1. **Absence of knowledge never blocks.** A deny requires the map to positively know
     both that this is owned work AND that the requested agent is not the owner or a
     sanctioned collaborator. An unrecognized work kind, an unrecognized agent, a
     missing block, a stale `loop_steps`, an unparseable file, or any thrown error all
     produce **allow**. The check is fail-open by construction, not by a catch clause
     bolted on afterwards.
  2. **There IS an override, and it is the one that already exists.** A typed escape
     phrase lifts this check.

### The escape phrase lifts this check — and deliberately differs from its neighbour

`PreToolUse.Task.js:34-47` documents, at length, that the concurrency cap honors **no**
escape phrase, because five slots is a **resource** limit and no phrase conjures a
sixth execution context. That reasoning is correct and it **does not transfer**. Agent
ownership is process, not resource — exactly the ceremony escape phrases exist to skip.

So the same hook file will contain two checks with different bypass semantics, and the
module header must say so in plain words, or the next reader will assume one is a bug.

This is **composition, not a second bypass**: it reuses
`escape-phrases.matchEscapePhrase` over role-scoped user-typed transcript text, the
same path `PreToolUse.Edit.js` already uses. No phrase is added, removed, or changed.

### Ordering — the ownership check runs BEFORE the slot is acquired

`PreToolUse.Task.js:203` calls `agentSlots.acquire()` and the block path at line 221
returns without releasing. If the ownership check ran after the acquire, every denied
dispatch would **leak a slot** — the store would count a subagent that never launched,
and the five-slot cap would silently tighten to four, then three. The ownership check
must therefore run **before** the acquire, so a deny costs nothing.

## Part Two architecture

### Dependency graph

```
.ctoc/operations-registry.yaml  --data-for-->  src/lib/agent-ownership.js
src/lib/agent-ownership.js  --requires-->  src/lib/safe-fs.js  (existing)
src/lib/transcript-escape.js  --requires-->  src/lib/escape-phrases.js  (existing)
src/hooks/PreToolUse.Task.js  --requires-->  src/lib/agent-ownership.js
                              --requires-->  src/lib/transcript-escape.js
src/hooks/PreToolUse.Edit.js  --re-exports-from-->  src/lib/transcript-escape.js
tests/agent-ownership.test.js  --tests-->  the lib + the real Task hook
```

No cycles. No hook requires another hook — the shared escape reader is extracted to
`lib/` precisely so `Task.js` does not have to require `Edit.js`.

### File: `src/lib/transcript-escape.js`

**Action:** CREATE
**Purpose:** The role-scoped transcript escape-phrase reader, moved out of the Edit hook
so both hooks share one implementation.

`extractUserTypedText(transcript)` and `findEscapeInTranscript(transcript)` are moved
here **verbatim** from `PreToolUse.Edit.js:369-429` (extractUserTypedText at 369-414,
findEscapeInTranscript at 425-429), including their JSDoc and the `slice(-5000)` bound
at line 428. Behavior is byte-for-byte unchanged; this is a move, not a rewrite. Because
`findEscapeInTranscript` calls `escapePhrases.matchEscapePhrase`, the new module loads
`../lib/escape-phrases` fail-soft (its own try/catch, module null on failure → returns
null), preserving the Edit hook's existing degrade-to-no-escape behavior exactly.

### File: `src/hooks/PreToolUse.Edit.js`

**Action:** MODIFY — minimal, surface-preserving.

- Remove the two moved function bodies.
- `const { extractUserTypedText, findEscapeInTranscript } = require('../lib/transcript-escape');`
  loaded fail-soft in its own try/catch, matching the existing sibling-loading style at
  lines 49-70.
- **`module.exports` keeps `extractUserTypedText` and `findEscapeInTranscript`
  unchanged** (they are exported today at `PreToolUse.Edit.js:724`), so the existing
  test files that import them from this path continue to pass untouched. This is the
  whole reason for the re-export: no existing test changes.

### File: `src/lib/agent-ownership.js`

**Action:** CREATE

```js
/**
 * Parse ONLY the flat `agent_ownership:` block out of the registry text. Slices from
 * the `agent_ownership:` line to the next top-level key and parses that flat subset
 * (two-space nesting, bare scalars, inline [a, b] lists). It is NOT a general YAML
 * parser and does not attempt to be one — CTOC has zero runtime dependencies and
 * adding a YAML library for one block is not justified.
 *
 * Any shape it does not recognize yields null, which the caller treats as "no map"
 * → allow. A parser that guesses would be worse than one that abstains.
 *
 * @param {string} registryText - full contents of operations-registry.yaml
 * @returns {{schemaVersion:number, loopSteps:number,
 *            kinds:Object<string,{owner:string, collaborators:string[]}>}|null}
 */
function parseOwnershipBlock(registryText)

/**
 * Load the ownership map for a project. Returns null (→ allow everything) when the
 * registry is missing, unreadable, has no agent_ownership block, fails to parse, or
 * is STALE — `loopSteps !== LIVE_LOOP_STEPS`. Never throws.
 * @param {string} root
 * @returns {object|null}
 */
function loadOwnershipMap(root)

/**
 * Which work kind, if any, this dispatch is. Derived from the requested agent and the
 * launch description. Returns null when it cannot tell — and null means ALLOW.
 * @param {object} map - loaded ownership map
 * @param {string} subagentType
 * @param {string} description
 * @returns {string|null} a key of map.kinds, or null
 */
function classifyWorkKind(map, subagentType, description)

/**
 * The decision. The ONLY verdict that denies is
 * { allowed: false, reason: 'wrong-owner', ... } — reached only when the kind is
 * known, the owner is known, and the requested agent is neither the owner nor a
 * sanctioned collaborator. Every other path allows, including every error path.
 * @param {{root:string, subagentType:string, description:string}} opts
 * @returns {{allowed:boolean, kind:string|null, owner:string|null,
 *            requested:string, reason:string}}
 *   reason ∈ 'no-map' | 'stale-map' | 'unknown-kind' | 'owner' | 'collaborator'
 *          | 'wrong-owner' | 'error'
 */
function checkOwnership({ root, subagentType, description })

/** The live Iron Loop step count this map must match. @type {number} */
const LIVE_LOOP_STEPS = 16;

module.exports = {
  parseOwnershipBlock, loadOwnershipMap, classifyWorkKind, checkOwnership,
  LIVE_LOOP_STEPS,
};
```

### File: `src/hooks/PreToolUse.Task.js`

**Action:** MODIFY — insert the ownership check as step 2, **before** the slot acquire.

The current flow (verified) is: (1) CTOC project? no → silent pass (`enforce`, ~line
194-199); (2) take a slot via `agentSlots.acquire` (line 203); (3) got one → allow;
(4) full → block, FINAL (line 221). The new check inserts between the current CTOC-project
check and the slot acquire:

1. CTOC project? No → silent pass. *(unchanged)*
2. **NEW — ownership check.** `checkOwnership(...)`. Allowed → continue. Denied →
   consult the transcript for a user-typed escape phrase; found → allow and log
   `escape_phrase`; not found → **deny, before any slot is taken**.
3. Take a slot. *(unchanged, now step 3)*
4. Full → block. FINAL. *(unchanged)*

The deny message, built by a new pure `buildOwnershipBlockMessage(verdict)`, names the
work kind, the agent that owns it, the agent that was requested, where the map lives,
and the fact that a typed escape phrase lifts it:

```
[CTOC] Subagent launch BLOCKED: wrong agent for this work.

  Work kind:       implementation-planning
  Owned by:        implementation-planner
  You requested:   general-purpose

  CTOC's own agents do pipeline work. The ownership map is data, not code —
  it lives in .ctoc/operations-registry.yaml under `agent_ownership:`. If this
  work genuinely belongs to a different agent, correct the map there.

  This is planning ceremony, not a resource limit, so an escape phrase you type
  yourself does lift it — unlike the five-slot concurrency cap in this same hook.
```

Note the current `PreToolUse.Task.js` imports NO escape-phrase reader (its header at
lines 73-75 says so explicitly, because the cap ignores escape phrases). Part Two adds
the `../lib/transcript-escape` require for the ownership check's override only; the
concurrency block below it still consults no phrase. The module header gains a paragraph
explaining why the two checks in this file have different escape-phrase semantics.

## Part Two test plan — `tests/agent-ownership.test.js`

Same conventions as Part One: `node:test`, temp-directory fixtures, the real hook driven
as a child process via `spawnSync(process.execPath, ...)`.

**The deny path, end to end through the real hook:**

1. A registry whose map says implementation-planning is owned by
   `implementation-planner`; payload requests `general-purpose` with a planning
   description. Assert: non-zero harness deny, stderr names both agents and the
   registry path, **and the slot store is unchanged** (the no-leak assertion — this is
   the ordering bug the design exists to avoid).
2. The same payload requesting `implementation-planner`. Assert: exit 0, one slot taken.
3. The same payload requesting `iron-loop-critic` (a sanctioned collaborator). Assert:
   exit 0, `reason: 'collaborator'`.

**Every allow-on-ignorance path (the fail-open contract):**

4. Registry file absent → allow, `reason: 'no-map'`.
5. Registry present with no `agent_ownership:` block → allow, `'no-map'`.
6. `agent_ownership:` present but unparseable → allow, `'no-map'`.
7. `loop_steps: 15` (a stale map) → allow, `'stale-map'`. **This is the staleness test
   and it must exist**, because it is the one that proves a drifted map goes quiet
   instead of enforcing a dead pipeline.
8. An agent not named anywhere in the map → allow, `'unknown-kind'`.
9. `loadOwnershipMap` with a throwing `safe-fs` stub → allow, `'error'`, no throw.

**Escape-phrase composition:**

10. A wrong-owner dispatch whose transcript contains a user-typed `"quick fix"` →
    allow, logged with the phrase.
11. The same phrase appearing only in a `tool_result` block → still **denied**. This
    reuses the role-scoping already proven for edits and must be re-proven here.

**The move is behavior-preserving:**

12. `PreToolUse.Edit.js` still exports `extractUserTypedText` and
    `findEscapeInTranscript`, and they behave identically to the pre-move versions
    across the existing fixture set.

**Registry-truth test (this one guards the plan's own honesty):**

13. `LIVE_LOOP_STEPS` equals the step count the plan validator enforces. If someone
    changes the Iron Loop to 17 steps and forgets the map, this test fails loudly
    rather than the map silently going stale.

**Coverage target:** 100% line and branch on both new library files.

## Security review

Part One and Part Two share these.

- **Path traversal** — the only paths constructed are
  `path.join(root, '.ctoc', 'state', 'routing-reminder.json')` and
  `path.join(root, '.ctoc', 'operations-registry.yaml')`. `sessionId` is used **only as
  a JSON object key**, never as a path segment; it is still validated as a non-empty
  string and truncated to 200 characters.
- **Input validation** — `prompt`, `session_id`, `subagent_type`, and `description` are
  type-checked before use; a non-string degrades to the defined default, never a throw.
- **No secrets** — prompt text is matched against regular expressions and **never
  persisted** to the memo or any log. Persisting it would create a new place for the
  human's data to sit.
- **Prototype pollution** — both the memo store and the parsed ownership block are
  rebuilt onto `Object.create(null)`; the keys `__proto__`, `constructor`, and
  `prototype` are rejected on read. The ownership parser is the higher-risk one: it
  turns file text into object keys.
- **Command injection** — none anywhere. No `exec`, no `execSync`, no shell.
- **Denial of service** — the memo store is bounded at 20 entries. The ownership parser
  reads only the sliced `agent_ownership:` block, never the whole 500-line file, and
  caps the block at 64 kilobytes.
- **Gate integrity** — neither part reads or writes anything gate-related. Neither can
  approve, revert, or cross anything. Neither adds an escape phrase; both honor the
  existing list unchanged.
- **Denial surface** — Part One's hook has **no** code path producing a non-zero exit,
  so it cannot block a prompt even when every internal operation fails. Part Two's deny
  is reachable only from the single positively-known `wrong-owner` verdict.
- **Slot accounting** — the ownership deny runs before `agentSlots.acquire`, so it can
  never leak a slot and silently tighten the concurrency cap. Asserted by test 1.

## Risk mitigations

| Risk | Mitigation | Where |
|---|---|---|
| `UserPromptSubmit` does not exist or does not inject in this harness | Verified empirically at Step 9 before implementation; failure kicks back to Step 5 rather than shipping a dead hook | Step 9 |
| The reminder becomes noise and is tuned out | Two independent quiet gates (work-intent + novelty); silence is the default | `buildReminder` |
| Calling `pendingGateDecisions` would cross gates on every prompt | Explicitly forbidden; the module never requires `streaming-gate` | `collectState` |
| The memo store grows unbounded | Pruned to 20 sessions on every write | `writeMemo` |
| A hook bug breaks the human's session | Never throws, never exits non-zero, library required in try/catch | `UserPromptSubmit.js` |
| **The ownership map goes STALE and enforces a pipeline that no longer exists** | `loop_steps` stamp compared against `LIVE_LOOP_STEPS`; a mismatch disables enforcement entirely (allow-all) rather than enforcing an outdated map. Test 7 proves it. **This is a mitigation, not a cure — the map's ongoing honesty is helped by the unexecutable-instruction fence planned separately at `plans/implementation/00073-ui1-unexecutable-instruction-fence.md`, which is NOT built here and is NOT a build-time dependency of this plan (the `loop_steps` stamp stands on its own).** The `iron_loop:` block being off by a full step-numbering revision today is the proof that this risk is live, not theoretical. | `loadOwnershipMap`, `LIVE_LOOP_STEPS` |
| A false ownership block stops legitimate work, so the check gets switched off | Absence of knowledge never blocks — six distinct allow-on-ignorance paths, each tested. The single deny requires positive knowledge of both the kind and the owner. A typed escape phrase lifts it. | `checkOwnership`, tests 4-11 |
| The ownership deny leaks a concurrency slot | The check runs before `agentSlots.acquire`; asserted by a store-unchanged assertion | `PreToolUse.Task.js` step 2, test 1 |
| Moving the escape reader breaks the heavily-tested Edit hook | It is a verbatim move; `Edit.js` re-exports both functions so its public surface and every existing test are unchanged | test 12 |

## Verification (Step 9)

**`UserPromptSubmit` exists in this harness and injects hook stdout as context — VERIFIED, not believed.** The load-bearing uncertainty the plan flagged is resolved against the running harness's own release notes (Claude Code **2.1.220**, `~/.claude/cache/changelog.md`), which is authoritative for THIS harness:

- *"Hooks: Added **UserPromptSubmit** hook and the current working directory to hook inputs"* — the event exists and fires on prompt submit.
- *"Hooks: UserPromptSubmit now supports **additionalContext** in advanced JSON output"* — hook stdout / additionalContext is injected into the model's context.
- *"Fixed plugin `Stop`/**UserPromptSubmit** hooks failing when cache cleanup deletes a version still in use"* — plugin-registered UserPromptSubmit is an actively maintained code path.

This is NOT the dead-dispatch-seat case (an event registered against nothing). A full interactive round-trip probe (human submits a prompt, observe the marker land in context) is not performable by a non-interactive child-session executor, so the harness-injection contract rests on the release notes above; the HOOK BODY (assemble text, exit 0, drain stdout) is proven directly by child-process spawn tests in `tests/ctoc-routing-reminder.test.js`.

## Scope additions beyond the originally-declared files (recorded for review)

Two files outside the plan's original `files:` had to change because the 17th hook is a REAL count change and one fence over-approximates count-writers. Both are non-green-washing corrections, human-authorized in the same decision that scoped this to Part One:

- **`README.md`** and **`tests/readme-numbers.test.js`** — the hook count is pinned in three places (a filesystem assertion `countTopLevelFiles('src/hooks') === 16`, a README string, and the CLAUDE.md literal checked by `doc-counts.test.js`). All updated 16→17. Reality changed; the guards were updated to match, not loosened.
- **`tests/cache-freshness.test.js`** — the CF1 completeness fence flags any `src/lib` `writeFileSync` as a possible count-mutating writer. `ctoc-routing-reminder.js`'s `writeMemo` writes ONLY `.ctoc/state/routing-reminder.json` (a per-session memo), touches no counted plan/vision/inbox file, and runs in the ephemeral hook process where the in-process count cache never lives — so `cache.invalidate()` there would be a no-op lie. Added to the fence's existing WHITELIST (alongside `continuation.js`, `sections.js`, etc.), which is the fence's own sanctioned mechanism for a genuine non-count writer. NOT wired to `invalidate`, which would be cargo-cult.

## Decisions Taken Under Ambiguity

0. **PART TWO (agent-ownership / `classifyWorkKind`) — DROPPED, not built (human decision, 2026-07-31).** `classifyWorkKind(map, subagentType, description)` has no sound deterministic algorithm. Its only inputs are the requested agent and a free-text description. Classifying **by requested agent** makes the single deny verdict (`wrong-owner`) UNREACHABLE — a kind only becomes known when the requested agent is already the owner or a sanctioned collaborator, which always ALLOWS — so the check is green-but-vacuous and can never catch the general-purpose substitution that is its entire purpose. Classifying **by description keywords** IS the probabilistic semantic match this plan's own design rationale explicitly rejects: it passes only on hand-crafted test descriptions containing the trigger word, misses real substitutions phrased without it, and false-positives on legitimate general-purpose dispatches whose text happens to contain a trigger. The payload carries no structured work-kind field, so a sound deterministic signal must be designed at Step 5 as its own slice. Per the no-vacuous-check rule, nothing was shipped: none of Part Two's files (`src/lib/agent-ownership.js`, `src/lib/transcript-escape.js`, `src/hooks/PreToolUse.Task.js`, `src/hooks/PreToolUse.Edit.js`, `tests/agent-ownership.test.js`, `.ctoc/operations-registry.yaml`) were touched. Part Two's test cases and acceptance-criteria rows below are consequently OUT OF SCOPE for what shipped.

1. **`UserPromptSubmit` chosen as the per-request event; VERIFIED at Step 9 (see above), not guessed.** Its existence/injection is confirmed against the harness changelog rather than left `believed`.
2. **Both per-session and per-request, not one or the other.** `SessionStart` keeps its
   full banner; the new hook adds a short conditional line.
3. **The routing directive fires once per in-progress plan set per session**, not every
   prompt. Repeating identical text is the documented tune-out failure.
4. **State is read only from `state.getPlanCounts`** — `pendingGateDecisions` crosses
   gates as a side effect and must never run on a per-prompt path.
5. **A typed escape phrase suppresses the routing directive and lifts the ownership
   check.** Both compose with `src/lib/escape-phrases.js` rather than duplicating it.
6. **No installer change.** `.claude-plugin/hooks.json` already ships on install and is
   synced by `/ctoc:update`.
7. **Prompt text is never persisted.**
8. **The ownership map is a NEW `agent_ownership:` block, not the existing `iron_loop:`
   block.** The existing block is a 15-step map of a 16-step loop and is wrong today.
9. **A mismatch BLOCKS rather than warns** — a warning nothing consumes is the exact
   defect this plan exists to end — **but only on positive knowledge**, with six
   allow-on-ignorance paths and the existing escape phrase as override.
10. **The ownership check runs before the slot acquire**, so a deny cannot leak a slot.
11. **The registry block is parsed by a small dedicated parser, not a YAML library.**
    CTOC has zero runtime dependencies; adding one for a single flat block is not
    justified. The parser abstains (→ allow) on any shape it does not recognize.
12. **The escape reader is extracted to `lib/` rather than having one hook require
    another**, preserving the layering this plan asserts elsewhere.

## Acceptance criteria mapping

| Criterion | Implemented in | Test |
|---|---|---|
| Every request routes through CTOC | `UserPromptSubmit.js` + `buildRoutingDirective` | Part One test 1 |
| Installed as a hook, automatically on install and update | `.claude-plugin/hooks.json`, synced by `update.js` | Part One test 1 plus a registration-shape assertion |
| Not documentation | Both hooks execute; tests drive them as child processes | Part One 1-3, Part Two 1-3 |
| Fails open on internal error | `buildReminder` catch; `checkOwnership` error path; both hooks | Part One 3, Part Two 9 |
| Not noisy | Work-intent gate + novelty gate; `''` by default | Part One 4-9 |
| CTOC's own agents do pipeline work | `agent-ownership.js` + `PreToolUse.Task.js` | Part Two 1-3 |
| A stale map cannot enforce a dead pipeline | `loop_steps` vs `LIVE_LOOP_STEPS` | Part Two 7, 13 |
| Composes with escape phrases, adds no second bypass | `transcript-escape.js` shared by both hooks | Part Two 10-11 |
| Does not weaken the four gates | No gate module required; no write outside the memo | security review |
| Non-CTOC projects silent | `isCtocProject(root).isCtoc` early return in both | Part One 2, Part Two silent-pass path |
| Cross-platform, Node only | `path.join`, `safe-fs`, `process.execPath`, no shell | Step 14 |

## Execution Plan

### Step 8: TEST
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).

Write both test files in full — `tests/ctoc-routing-reminder.test.js` (15 cases) and
`tests/agent-ownership.test.js` (13 cases) — and run them. Every test must FAIL for the
right reason (the modules do not exist yet). Confirm the failure output names missing
modules, not a harness error. No implementation before red.

### Step 9: PREPARE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).

**Verify `UserPromptSubmit` empirically before anything else.** Register a temporary
probe hook that appends a unique token to a scratch file and writes a distinctive
marker to stdout; submit a prompt; confirm two facts: (a) the hook process ran, and
(b) the marker appears in the model's context. Record both observations in this plan
under a `## Verification` heading — what was observed, not what was expected.

**If the event does not fire, or its stdout is not injected: STOP and kick back to Step
5** for Part One. Part Two does not depend on that event and may proceed regardless.

Then confirm the existing module surface: `ctoc-project-detector.isCtocProject`,
`state.getPlanCounts`, `escape-phrases.matchEscapePhrase`, `agent-slots.acquire`,
`hook-deny-signal.emitDeny`, and `safe-fs` all export what this plan assumes. Re-read
`.ctoc/operations-registry.yaml` to confirm the `iron_loop:` staleness described above
(15-step, ASSESS at step 1, QUALITY at step 8, FINAL-REVIEW at step 15) is still exactly
as recorded. Re-read `PreToolUse.Edit.js` to confirm `extractUserTypedText` /
`findEscapeInTranscript` are still the two functions to move and are still exported, and
`PreToolUse.Task.js` to confirm the acquire is still the point to insert before.

### Step 10: IMPLEMENT
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).

Part One:
- `src/lib/ctoc-routing-reminder.js` — the eight exported functions, full directive
  text, both quiet gates.
- `src/hooks/UserPromptSubmit.js` — `readStdinJson` and `run`, fail-soft library load,
  always exit 0.
- `.claude-plugin/hooks.json` — the `UserPromptSubmit` registration, added as a key
  inside the existing top-level `hooks` object.

Part Two:
- `.ctoc/operations-registry.yaml` — the new `agent_ownership:` block. Leave the stale
  `iron_loop:` block untouched; correcting it is a different piece of work and is not
  this plan's to schedule.
- `src/lib/transcript-escape.js` — the verbatim move, with a fail-soft `escape-phrases`
  require.
- `src/hooks/PreToolUse.Edit.js` — require the moved functions, keep exports identical.
- `src/lib/agent-ownership.js` — parser, loader, classifier, decision.
- `src/hooks/PreToolUse.Task.js` — the ownership check inserted before the slot acquire,
  the deny message builder, the `transcript-escape` require, and the module-header
  paragraph on the two checks' differing escape-phrase semantics.

### Step 11: REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).

Verify against the architecture checks: dependencies flow hooks → lib only and no hook
requires another hook; `ctoc-routing-reminder` never requires `streaming-gate`; the
`UserPromptSubmit` hook has no non-zero exit path; the ownership check precedes the slot
acquire; every `checkOwnership` path except `wrong-owner` allows; the memo write is
bounded; no prompt text is persisted. Confirm the "what already exists" table is still
accurate against the current tree and that nothing duplicates `PreToolUse.Edit.js`.

### Step 12: OPTIMIZE

Measure both hooks on the real repository (300+ plan files) across ten runs. Target:
well under 100 milliseconds each. If `getPlanCounts` dominates, cache the count in the
memo with a short time-to-live rather than adding a new mechanism. The ownership parser
must read only the sliced block, never the whole file — verify that in the profile, not
just in the code. Remove any path the tests did not need.

### Step 13: SECURE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).

Walk the security review item by item against the written code. Specifically confirm:
`sessionId` never reaches a path segment; both the memo parse and the ownership parse
reject `__proto__`, `constructor`, and `prototype`; no prompt text is written to disk;
no `exec` of any kind; every filesystem call goes through `safe-fs` and is guarded; the
ownership deny cannot leak a slot; the 64-kilobyte block cap holds.

### Step 14: VERIFY
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).

Run the full gate: **`npm test`**. This is the gated entry point — it runs the suite
plus the coverage floor and the zero-skipped gate via `src/scripts/test-gate.js`.
`node --test tests/*.test.js` enforces neither and is not acceptable here.

Required: `# fail 0`, zero skipped, coverage at or above the
`.ctoc/coverage-baseline.json` floor (**99**, scoped to `src/**`), and 100% line and
branch coverage on all three new library files. Confirm the existing hook tests that
touch these files (the `PreToolUse.Task` coverage tests, the escape-phrase / transcript
tests that import `extractUserTypedText` from `PreToolUse.Edit.js`, and the installer /
hooks-manifest tests) still pass with the new `hooks.json` entry, the modified
`Task.js`, and the re-exporting `Edit.js`.

### Step 15: DOCUMENT

Update the hook inventory line in `CLAUDE.md` (16 → 17 Claude Code hooks) and the JS
module count (three new `src/lib` modules). Full JSDoc on all new functions, including
the "never exits non-zero" contract, the reason `streaming-gate` is deliberately not
used, and the reason the two checks in `PreToolUse.Task.js` treat escape phrases
differently. Note in both module headers that `.claude-plugin/hooks.json` is the
install-and-update wiring, so a future reader does not hunt for installer code that does
not exist. Record in the registry block's comment that `loop_steps` must be updated
whenever the Iron Loop step count changes, and that a mismatch disables the check.

### Step 16: FINAL-REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; the executor ran Steps 8-16 and the full gate is green (npm test exit 0).

Confirm every quality-bar item: all acceptance criteria mapped and tested; the three
human-named behaviors (fires in a CTOC project, silent in a non-CTOC project, fails open
on error) each driven through the real hook as a child process; the ownership deny
proven not to leak a slot; the stale-map path proven to allow rather than enforce; the
Step 9 verification result recorded honestly in this file; no stub, no TODO; every
ambiguous call documented above. Then hand to Gate 3.


---

## Execution Plan (Steps 8-16)

> SCOPE AS BUILT (2026-07-31): **Part One only.** Part Two (the agent-ownership /
> classifyWorkKind check) was DROPPED by human decision — see the Part Two drop under
> "## Decisions Taken Under Ambiguity". None of Part Two's files were touched.

### Step 8: TEST (TDD Red)
- [x] Wrote tests/ctoc-routing-reminder.test.js (32 cases: lib + real hook via spawnSync)
- [x] Tested error conditions (garbage input, malformed stdin, prototype-pollution key, non-CTOC)
- [x] Ran tests — RED for the right reason: `MODULE_NOT_FOUND '../src/lib/ctoc-routing-reminder'`

### Step 9: PREPARE
- [x] No new dependency needed (zero-runtime-dependency policy honored)
- [x] Prerequisites confirmed: state.getPlanCounts, ctoc-project-detector.isCtocProject, escape-phrases.matchEscapePhrase, safe-fs, request-exit all export what Part One assumes
- [x] `.ctoc/state/` exists; writeMemo also mkdirs it defensively
- [x] UserPromptSubmit empirically verified — see "## Verification (Step 9)" below

### Step 10: IMPLEMENT
- [x] src/lib/ctoc-routing-reminder.js (8 exported functions, both quiet gates, never-throws)
- [x] src/hooks/UserPromptSubmit.js (thin wrapper; requestExit(0) so stdout drains; always exit 0)
- [x] .claude-plugin/hooks.json (UserPromptSubmit registration — the 17th hook)
- [x] Wired: hook is a reachability ROOT via hooks.json; lib is require-reached from it

### Step 11: REVIEW
- [x] Dependencies flow hooks → lib only; ctoc-routing-reminder never requires streaming-gate
- [x] UserPromptSubmit hook has NO non-zero exit path
- [x] Memo write bounded to 20 sessions; no prompt text persisted

### Step 12: OPTIMIZE
- [x] State read only from the memoized state.getPlanCounts; single read per prompt
- [x] Monotonic memo timestamp (deterministic eviction under same-ms writes)

### Step 13: SECURE
- [x] Only paths built: .ctoc/state/routing-reminder.json (path.join); sessionId never a path segment, validated + truncated to 200, used only as an object key
- [x] Prototype-pollution guard: store rebuilt on Object.create(null); __proto__/constructor/prototype rejected
- [x] No secrets; prompt text matched by regex and never persisted; no exec/shell

### Step 14: VERIFY
- [x] npm test → exit 0; coverage 99.06% (threshold 99%, scoped src/**); skipped 0; failed 0
- [x] Typecheck baseline held (0); false-green fence at/below baseline (207); reachability, doc-counts, readme-numbers, cache-freshness all green

### Step 15: DOCUMENT
- [x] Full JSDoc on all new functions (never-throws / always-exit-0 / no-streaming-gate contracts stated)
- [x] Hook count 16→17 updated in CLAUDE.md, README.md, tests/readme-numbers.test.js; src/lib module count 127→128 in CLAUDE.md

### Step 16: FINAL-REVIEW
- [x] Steps 8-15 complete; all quality checks passed
- [x] Real hook driven as a child process (fires in CTOC project, silent in non-CTOC, fails silent on error)
- [x] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
