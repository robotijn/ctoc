---
iron_loop_verdict: true
title: "A registry read error cannot blank the dashboard — an unreadable agent status says so instead of showing idle"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00080-dashboard-says-when-reconcile-failed
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/state.js"
  - "src/lib/menu-screens.js"
  - "src/areas/agent.js"
  - "src/areas/pipeline.js"
  - "src/tabs/overview.js"
  - "tests/dashboard-survives-unreadable-registry.test.js"
  - "CLAUDE.md"
  - ".ctoc/false-green-baseline.json"
approved_by: human
approved_at: 2026-07-28T19:45:59.491Z
gate_crossed: implementation → todo
---

# A registry read error cannot blank the dashboard

`src/lib/state.js:254-258`, verified on disk:

```js
function getAgentStatus(projectPath) {
  const root = projectPath || findProjectRoot();
  const taskRegistry = require('./task-registry');

  const registry = taskRegistry.load(root); // fail-open: a corrupt registry → empty
```

The comment is true about the failure it names and silent about the one that
matters. `task-registry.load` fails open on a **data** problem — an unparseable
file, a wrong shape, a malformed entry (`task-registry.js:379-396`). It does not
fail open on an **operating-system** problem: `safeFs.existsSync(p)` and
`safeFs.readFileSync(p, 'utf8')` delegate to `fs` and THROW on `EACCES`, `EIO`,
`EISDIR`, `ELOOP`. Nothing between that throw and the caller catches it.

The caller is the dashboard. `src/lib/menu-screens.js:400`:

```js
function buildDashboardTable(projectPath, opts = {}) {
  const root = getProjectPath(projectPath);
  const counts = getPlanCounts(root);
  const visionCounts = getVisionCounts(root);
  const agent = getAgentStatus(root);        // ← line 400, UNGUARDED
```

so a permissions failure or a disk error on `.ctoc/state/tasks.json` throws out of
the dashboard builder and **the human sees nothing at all**. Not a degraded screen
— no screen.

## Why this outranks the crash it looks like

The sibling slice `plans/review/00080-dashboard-says-when-reconcile-failed.md`
landed the line that exists for exactly this moment. It is live in the code at
`menu-screens.js:218-251`:

```
  ⛔ the background task check DID NOT RUN — the task counts above are unchecked and may be stale: … · view: tasks
```

That line **cannot render on this path.** The reconcile pass it reports on runs at
`menu-screens.js:467`, sixty-seven lines *after* the unguarded read at 400. The
honest notice is downstream of the crash that removes the screen it would have
printed on. The project's first operating lesson is that the measure is the human;
a blank screen is the worst available outcome and the exact one every slice in this
wave was removing.

This is not a hypothesis. The executor of that slice hit it while injecting a fault,
could not use the `safe-fs` seam because of it, switched seams rather than hide the
reason, and wrote the finding into the shipped test source at
`tests/dashboard-reconcile-failure.test.js:170-176`:

> NOT induced through `safe-fs`, deliberately, and the reason is a defect this slice
> does NOT own: making `safeFs.existsSync` throw for `tasks.json` also breaks
> `state.getAgentStatus`, which calls `taskRegistry.load` UNGUARDED (state.js:258)
> from `buildDashboardTable` BEFORE reconcile runs — so the whole dashboard throws.

**This slice's own Step 8 uses the seam that executor had to dodge.** That is the
proof the repair is real: the fixture that could not be written before must pass now.

## Where the code disagreed with the brief — recorded

Three discrepancies were found while verifying, and in each the code wins:

| Claim as briefed | What the code says |
|---|---|
| the second registry read in `buildDashboardTable` is unguarded too | It is GUARDED, at `menu-screens.js:480`: `try { taskReg = taskRegistry.load(root); } catch { taskReg = taskRegistry.emptyRegistry(); }`. It fails SILENT and OPEN — the exact shape point 3 of the brief fences — but it does not brick. Its handling is addressed below and is not left as it stands. |
| a reconcile failure on this path would throw and be caught at 467 | `reconcileState` does not throw on a load failure. `task-reconcile.js:602-611` catches it and returns `corrupt: { reason: 'load-failed' }`. So once line 400 is guarded, the registry-unreadable case renders the **corrupt** line, not the **threw** line. The test plan pins the line that actually renders. |
| the defect is one call site | It is one call site with **four** human-facing surfaces and **one action gate** downstream of it (below). Guarding line 400 alone converts a crash into a silent lie on three screens, which is strictly worse. |

## 1 — Where the guard belongs: inside, and every caller named

Every caller of `state.getAgentStatus`, read on disk:

| # | Caller | What it does with the value | What it should get |
|---|---|---|---|
| 1 | `src/lib/menu-screens.js:400` `buildDashboardTable` | renders the `AGENT` block; `○ Idle` in the else branch | never throw; render an UNKNOWN line, never `○ Idle` |
| 2 | `src/lib/menu-screens.js:1465` `dashboardCommands` | picks the `Start agent` / `Stop agent` option label and description | never throw; the description must name the unknown status (the **label** is a key into the `actions` map and must not change) |
| 3 | `src/areas/agent.js:13` `render` | the dedicated agent screen; `○ Idle / No active plan.` | never throw; an UNKNOWN block, never `○ Idle` |
| 4 | `src/areas/agent.js:59` `handleKey` | **gates a live action** — `g` starts an agent only when `!status.active` | never throw; `g` must REFUSE under unknown (see decision 4) |
| 5 | `src/areas/pipeline.js:110` `render` | one status line; `○ Agent idle` | never throw; an UNKNOWN line, never idle |
| 6 | `src/tabs/overview.js:129` `render` | `○ Idle  No implementation in progress` | never throw; an UNKNOWN line, never idle |

There is **no caller that legitimately needs the throw.** Four are renders whose
only correct behaviour under an unreadable registry is to say so; one is an option
builder; one is an action gate that must refuse rather than act on a value it does
not have. Tests are the only other callers and they assert return values.

So the guard goes **inside `getAgentStatus`**, in one place, where no future caller
can miss it. A guard at the dashboard call site would leave five other paths able to
brick, and would have to be written five times.

## 2 — What the human sees

A caught error that produces no line is the same defect one layer along. Every
surface renders a real sentence, in the register `renderReconcileHealth` already
shipped — `⛔`, a lowercase sentence, an em-dash clause saying what it means for
what you are looking at, the bounded message, and the `· view: tasks` door.

**Dashboard `AGENT` block** — replaces `  ○ Idle`, never sits beside it:

```
AGENT
  ⛔ the agent status is UNKNOWN, not idle — the task registry could not be read, so an agent may be running right now: EACCES: permission denied, open tasks.json · view: tasks
```

It says "UNKNOWN, not idle" rather than repeating "could not be read" as its
subject, because on this path the reconcile corrupt line renders too and the two
must not read as one duplicated complaint. The reconcile line reports the **check**;
this line reports the **agent**.

**Agent area** (`src/areas/agent.js`), matching its existing `⚠ Stale lock` block:

```
  ⛔ Unknown
  The agent status could not be read — this is not "idle".
  The task registry could not be read: EACCES: permission denied, open tasks.json
  An agent may be running right now; do not assume the pipeline is stopped.
```

**Pipeline area** (`src/areas/pipeline.js`), one compact line in its register:

```
⛔ Agent: UNKNOWN — the task registry could not be read; this is not idle
```

**Overview tab** (`src/tabs/overview.js`), in its two-column shape:

```
  ⛔ Unknown        the task registry could not be read — this is not "idle"
```

## 3 — Not silent, and not open

The return value carries the truth rather than hiding it:

```js
{ active: false, unreadable: '<bounded, control-stripped message>' }
```

`active: false` is retained deliberately. Under an unreadable registry there is no
plan name, no step, no start time — rendering the `active` branch would fabricate a
reading. The falsy value keeps every existing branch out of the "Active" path; the
`unreadable` field is what every surface renders **instead of** the idle claim.

The forcing function is not the shape — a field can be ignored. It is that each of
the four render sites has a test asserting the idle string is **absent**, and that
the action gate has a test asserting `startAgent` is **not called**. A zero agent
count presented as a checked fact is the failure this slice exists to prevent; the
tests assert its absence, not merely the presence of the new line.

The already-guarded second read at `menu-screens.js:480` is the same shape one layer
along and is handled here rather than left: its `catch` keeps the empty-registry
fallback (the dashboard must still render) and **records that the fallback was
taken**, so the TASKS area cannot present an empty registry as an observed zero. On
today's ordering the reconcile corrupt line already covers that screen, and the test
plan pins that coexistence rather than assuming it.

## 4 — The same pattern elsewhere in the dashboard build path — surveyed

Every read `buildDashboardTable` performs before it can render, checked on disk:

| Read | Guarded? | Evidence |
|---|---|---|
| `getPlanCounts` → `readPlans` | **yes**, per file | `state.js:25-44` — hardened, with a comment naming this exact defect: "an un-caught throw here takes down getPlanCounts and the entire dashboard" |
| `getVisionCounts` | **NO** | `state.js:481-490` — `readdirSync` then `readFileSync` per file inside `files.forEach`, no `try` anywhere |
| `getAgentStatus` | **NO** | `state.js:258` — this slice |
| `getVersion` | yes | `menu-screens.js:156-162` |
| `loadDashboardPrefs` | yes | `sections.js:84-98` |
| `taskRegistry.load` (second read) | yes, silently | `menu-screens.js:480` |
| `taskView.renderTasksSection` | yes | `menu-screens.js:482` |
| `readDeployReady` | yes | `menu-screens.js:866-873` |

**One sibling instance exists and it is named, not absorbed: `getVisionCounts` at
`src/lib/state.js:481-490` can blank the dashboard the same way**, from
`menu-screens.js:399` — one line above this defect, in the same file, in the same
function. An unreadable or `EISDIR` entry under `plans/vision/` throws out of
`getVisionCounts` and takes the screen.

It is **not folded in**, for a reason about the fix rather than about effort. The
correct repair differs: `readPlans` already establishes the shape for a *count* —
skip the faulting entry, warn, keep going, because a count has a meaningful partial.
Agent liveness has no partial: either the registry was read or it was not, so its
repair is a third state and a rendered sentence at six call sites. Folding a
skip-and-continue count repair into a tri-state liveness repair would put two
different contracts in one slice and give the human one gate decision over two
unrelated behaviours. It is recorded here as a finding with evidence, for the human
to schedule; this slice does not schedule it and does not silently ignore it.

A second finding, outside the dashboard build path and therefore outside this
slice's declared files: `actions.startAgent` calls `taskRegistry.load` unguarded at
`src/lib/actions.js:1444` (and `addAndClaim` immediately after), so starting an
agent under an unreadable registry throws from inside the action. The `g`-key
refusal this slice adds closes the one route that reaches it from the agent area;
the menu route (`claude:start-agent`) is driven by the session model and is not
closed here. Named, not fixed.

## Implementation Details

### File: `src/lib/state.js`
**Action:** MODIFY
**Purpose:** `getAgentStatus` reports an unreadable registry as a third state instead of throwing.
**Change type:** modify-existing — one function

#### Change 1 — the guard, with the reason kept

```js
const taskRegistry = require('./task-registry');

let registry;
try {
  registry = taskRegistry.load(root);
} catch (err) {
  // task-registry.load fails open on a DATA problem (unparseable, wrong shape,
  // malformed entry). It does not fail open on an OPERATING-SYSTEM problem —
  // EACCES/EIO/EISDIR out of fs propagate. Unguarded, that throw took the whole
  // dashboard with it and the human saw NOTHING. Caught, it must not become the
  // opposite failure: an empty registry read as "no agent is running" is a verdict
  // on input we never received. So liveness is UNKNOWN, and every surface says so.
  return { active: false, unreadable: msgOf(err) };
}
```

`msgOf` is module-private: `stripCtl(String(err && err.message ? err.message : err))`
bounded to 120 characters with a trailing `…`, mirroring `FAILURE_MESSAGE_CAP` in
`menu-screens.js`. Bounded and control-stripped because the message can carry a
path an attacker influenced, and because a newline in a rendered message can forge
a dashboard row. Only `err.message` is read, never `err.stack`.

#### Change 2 — the existing detail-file catch states what it absorbs

`state.js:271-276` swallows every error from `.ctoc/state/agent.json`. An absent
file is normal on this path and must stay silent; anything else is a real read
failure being discarded. Distinguish them: `ENOENT` returns the current behaviour
unchanged; any other error records the message onto the returned object as
`detailUnreadable` and leaves liveness (which the registry already decided) intact.
This is the fence's own tracked debt in the function this slice rewrites — see the
ratchet note in Step 14.

### File: `src/lib/menu-screens.js`
**Action:** MODIFY
**Purpose:** The dashboard `AGENT` block and the Commands screen tell the truth under an unreadable registry.

1. **`buildDashboardTable`, the `AGENT` block (`:559-570`)** — a new first branch,
   above `agent.active`, rendering the UNKNOWN line above. `○ Idle` becomes
   unreachable when `agent.unreadable` is set; it is never printed alongside.
2. **`buildDashboardTable`, the second registry read (`:480`)** — keep the
   empty-registry fallback, record that it was taken, and make the `catch` state
   which failure it absorbs and why the fallback is not a reading.
3. **`dashboardCommands` (`:1465-1482`)** — when `agent.unreadable` is set, the
   Start/Stop option **description** names it: `Agent status could not be read — an
   agent may already be running`. The option **label** is unchanged; labels are keys
   into the `actions` map (`:1477-1482`) and renaming one silently breaks its route.

### File: `src/areas/agent.js`
**Action:** MODIFY
**Purpose:** The dedicated agent screen says Unknown, and the start key refuses to act on a value it does not have.

1. **`render` (`:18-36`)** — a new first branch above `agent.active` rendering the
   four-line Unknown block above. The footer is unchanged.
2. **`handleKey` (`:52-91`)** — after `const status = state.getAgentStatus(root)`:
   - `g` (start): if `status.unreadable`, set
     `Agent status could not be read — refusing to start; an agent may already be running.`
     and return true **without calling `actions.startAgent`**. Refusing is the whole
     point: a second agent on the same file set is the damage this key can do, and
     `startAgent` itself would throw on the same unreadable registry
     (`actions.js:1444`).
   - `x` (stop): PROCEED. A stop request when nothing is running is inert; refusing
     a stop when something IS running strands the human. Step 9 reads `stopAgent`
     first; if it can throw on this path, wrap it and report the failure by name —
     never the unconditional `Stop requested`, which would be a claim about a write
     that did not happen.

### File: `src/areas/pipeline.js`
**Action:** MODIFY
**Purpose:** The pipeline status line does not claim idle when the status is unknown.

`render` (`:147-153`) — a new first branch above `agent.active`, rendering the
one-line UNKNOWN form above. `stripCtl` is already imported here.

### File: `src/tabs/overview.js`
**Action:** MODIFY
**Purpose:** The overview tab's Agent Status block does not claim idle when the status is unknown.

`render` (`:170-181`) — a new first branch above `agent.active`, in the block's
existing two-column shape.

### Files: `CLAUDE.md`, `.ctoc/false-green-baseline.json`
**Action:** MODIFY (ratchets — declared, direction enforced at Step 14)

`CLAUDE.md` documents the test-file count in two places (`:243`, `:336`), currently
**428**, verified against disk by `tests/doc-counts.test.js`. This slice adds one
test file, so both move to 429. `.ctoc/false-green-baseline.json` is declared
because this slice rewrites the function that owns an existing tracked finding; see
Step 14 for the only directions either file may move.

---

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| the `unreadable` third state | `state.getAgentStatus` — its six callers, all listed above | `/ctoc:menu` dashboard render · the TUI agent, pipeline and overview screens |
| the dashboard UNKNOWN line | `menu-screens.buildDashboardTable` (this slice) | `/ctoc:menu` → dashboard render |
| the Commands description | `menu-screens.dashboardCommands` (this slice) | `/ctoc:menu` → Commands screen |
| the agent-area Unknown block | `areas/agent.render` (this slice) | TUI agent area |
| the `g`-key refusal | `areas/agent.handleKey` (this slice) | TUI agent area, `g` keypress |
| the pipeline UNKNOWN line | `areas/pipeline.render` (this slice) | TUI pipeline area |
| the overview UNKNOWN line | `tabs/overview.render` (this slice) | TUI overview tab |

Nothing added here is reachable only from a test.

## Test Plan

### Tests: `tests/dashboard-survives-unreadable-registry.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `before` / `after` / `node:assert`)

The read failure is induced at the **real source** — `safeFs.existsSync` /
`safeFs.readFileSync` made to throw `EACCES` for the registry path only, through
the shared `safe-fs` module object (`safe-fs.js:181-201` exports plain function
properties, and `task-registry.js:379-383` calls them as property accesses). This is
precisely the seam `tests/dashboard-reconcile-failure.test.js:170-176` recorded as
unusable because of this defect. Every other path reads real files.

**Case 1 is the reason the slice exists** and asserts the human-visible outcome by
driving the real render, not by observing a caught exception.

| # | Case | How induced | Assertion |
|---|---|---|---|
| 1 | **the human still gets a screen** | registry reads throw `EACCES` | `buildDashboardTable(root)` does not throw, returns a non-empty string containing `CTOC v`, `INBOX` and `AGENT` — today it throws and the human sees nothing |
| 2 | **the screen says UNKNOWN, not idle** | same | text matches `the agent status is UNKNOWN`; text does **not** match `○ Idle` |
| 3 | the reason reaches the screen | error message `EACCES: permission denied, open tasks.json` | that message appears on the agent line |
| 4 | **an unreadable registry is never a checked zero** | same | the screen carries the reconcile `could not be read` line as well; there is no path where a TASKS count renders with neither the reconcile health line nor the agent line present |
| 5 | the two adjacent failures speak in one voice | same | both lines begin `⛔`, both end `· view: tasks`, and the reconcile line's index is below the `AGENT` header's |
| 6 | **a healthy project renders byte-identically** | real readable registry, no running task | `○ Idle` present; `UNKNOWN` absent; no `⛔` agent line |
| 7 | an active agent still reads active | one running `implement` task, readable | `● Active:` present; `unreadable` absent from the returned status |
| 8 | the function itself does not throw | direct call | `getAgentStatus(root)` returns `{ active: false, unreadable: <string> }` |
| 9 | a long message is bounded | injected 500-character error | the agent line is bounded and the message ends `…` |
| 10 | **a control character cannot forge a row** | error message containing an escape sequence and a newline | no escape byte in the rendered text; the agent line remains one line |
| 11 | the agent area says Unknown | same seam, `areas/agent.render` | does not throw; matches `Unknown`; does not match `○ Idle` or `No active plan` |
| 12 | **`g` refuses to start on an unknown status** | `areas/agent.handleKey({sequence:'g'})` with the seam active | `actions.startAgent` is **not called** (stubbed and counted); `app.message` names the refusal |
| 13 | `x` still requests a stop | same, `x` | `actions.stopAgent` is called; if it throws, the message names the failure and never says `Stop requested` |
| 14 | the pipeline area says UNKNOWN | `areas/pipeline.render` | does not throw; matches `UNKNOWN`; does not match `Agent idle` |
| 15 | the overview tab says Unknown | `tabs/overview.render` | does not throw; matches `Unknown`; does not match `○ Idle` |
| 16 | the Commands screen survives and warns | `dashboardCommands` | does not throw; the Start/Stop option's **description** names the unknown status; its **label** is unchanged so its `actions` key still resolves |
| 17 | a normal absent detail file stays silent | readable registry, one running task, no `agent.json` | `detailUnreadable` absent — Change 2 must not raise a false alarm on the normal case |

Cases 1, 2, 3, 4, 5, 8, 11, 12, 14, 15 and 16 MUST be red before implementation:
today the first ten of those cannot even reach an assertion because the call throws.

Cross-platform: `fs.promises`, `path.join`, `os.tmpdir()`; teardown with
`fs.promises.rm(root, { recursive: true, force: true })` and restoration of every
stubbed `safe-fs` property in `after`. The failure is induced through the module
seam rather than a real `chmod`, because a permission fixture has to be skipped on
some platform and a skipped test is a gate failure under the zero-skipped rule.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/dashboard-survives-unreadable-registry.test.js` in full, run ONLY that file, record the red output verbatim. Record what the HUMAN SAW: capture the thrown error from `buildDashboardTable` under the seam and paste it, because "the screen is the error" is the defect. Cases 1-5, 8, 11, 12, 14, 15, 16 MUST be red.
### Step 9: PREPARE — re-read from disk before editing: `src/lib/state.js:247-293` (the current `getAgentStatus`, including the detail-file catch); `src/lib/task-registry.js:370-396` to confirm which failures fail open and which propagate; `src/lib/menu-screens.js:396-402`, `:462-500` and `:555-573` INCLUDING the landed `renderReconcileHealth` (if it is absent, STOP and report — cases 4 and 5 depend on it); `src/areas/agent.js`, `src/areas/pipeline.js:106-157`, `src/tabs/overview.js:126-183`; and `src/lib/actions.js` `stopAgent` to establish whether `x` can throw on this path (case 13 depends on the answer, and the answer is a fact to be read, not assumed). Where the code disagrees with this plan's line numbers or claims, the CODE WINS — record each discrepancy in the decisions section.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/state.js` — Change 1 (the guard and the `unreadable` third state) and Change 2 (the detail-file catch states what it absorbs).
  - `src/lib/menu-screens.js` — the `AGENT` UNKNOWN branch, the recorded fallback at the second registry read, and the Commands description.
  - `src/areas/agent.js` — the Unknown render block and the `g`-key refusal / `x`-key honest report.
  - `src/areas/pipeline.js` — the one-line UNKNOWN branch.
  - `src/tabs/overview.js` — the two-column Unknown branch.
### Step 11: REVIEW — confirm no surface can render an idle claim while `unreadable` is set: grep every reader of `getAgentStatus` again after the edit and check each against the caller table above; a caller that appeared during the build is a finding, not a silent addition. Confirm the guard cannot swallow a programming error — only the `taskRegistry.load` call is inside the `try`, never surrounding control flow. Confirm `startAgent` is unreachable from the `g` key while the status is unknown. Confirm the healthy path is byte-identical (case 6) on all four surfaces.
### Step 12: OPTIMIZE — no extra read, no extra registry load, no second `getAgentStatus` call anywhere. The guard adds one `try` on a call that already happened; the renderers add one truthiness test each and allocate nothing on the healthy path.
### Step 13: SECURE — the error message can carry a filesystem path and, via a crafted registry file, attacker-influenced text. It passes through `stripCtl` AND a 120-character bound on every one of the four surfaces, so no control character reaches a screen and no crafted message can forge an extra dashboard row. Only `err.message` is rendered — never `err.stack`, never an absolute path built by this code. Case 10 proves it from the human's seat rather than from the return value.
### Step 14: VERIFY — `node --test tests/dashboard-survives-unreadable-registry.test.js tests/dashboard-reconcile-failure.test.js tests/state-coverage.test.js tests/actions-scheduler.test.js tests/area-modules.test.js tests/tab-modules.test.js tests/overview-tab-coverage.test.js tests/pipeline-area-coverage.test.js tests/menu-screens-coverage.test.js tests/doc-counts.test.js tests/false-green-fence.test.js` green, then the full gated run `npm test`. The coverage floor is **99** and may only RISE. Lint every changed JavaScript file with `eslint --max-warnings 0`. **Ratchets, both directions stated:** `CLAUDE.md`'s test-file count moves 428 → 429 in both places because this slice adds one test file — fix the count, never the check. `.ctoc/false-green-baseline.json` currently holds `maxFindings: 217` and the key `src/lib/state.js:silent-catch:getAgentStatus`. **The fence will likely flag the catch this slice adds, and the correct response is to make the failure legible — NEVER a whitelist entry.** Changes 1 and 2 both record their error rather than discarding it; if that clears the key, delete it and lower `maxFindings` to 216 (debt shrank — the only allowed direction). If the key still reports, leave it and `maxFindings` at 217 and say so plainly. A `whitelist` entry is not an option on any outcome; two sibling executors met this fence in this wave and both fixed the code, and the fence was right both times. No git operations.
### Step 15: DOCUMENT — JavaScript doc on `getAgentStatus` stating the distinction this slice rests on: `task-registry.load` fails open on a DATA problem and NOT on an operating-system problem, so a caught read error must become a third state and not a false idle. Document the returned `unreadable` field and the rule that every render site prints it INSTEAD of an idle claim, never beside one. Update the `state.js:247-253` block comment, which today says only "fail-open: a corrupt registry → empty" and is the sentence that made this defect invisible.
### Step 16: FINAL-REVIEW — report files, tests, verbatim red evidence including the exact throw a human's dashboard produced today, verbatim green evidence, both ratchet directions with their final numbers, and every decision taken under ambiguity. Restate the two findings NOT fixed here — `getVisionCounts` (`state.js:481-490`) and `actions.startAgent` (`actions.js:1444`) — so neither is lost. Gate 3 is the human's and is not crossed.

## Decisions Taken Under Ambiguity

1. **The guard goes inside `getAgentStatus`, not at the dashboard call site.** All
   six callers were read. Four are renders, one is an option builder, one is an
   action gate; none legitimately wants the throw, and a call-site guard would have
   to be written six times and would still leave the seventh caller to be written
   unguarded. One guard, one place, no caller able to brick.
2. **The third state is a field on the existing return shape (`unreadable`), not a
   thrown sentinel or a separate function.** A `getAgentStatusSafe` wrapper would
   leave the unsafe function reachable and every missed call site still able to blank
   a screen. `active: false` is retained beside it because there is genuinely no
   plan, step or elapsed time to render — the `active` branch would have to fabricate
   them. The field is what carries the truth; the falsy `active` merely keeps the
   fabricating branch closed.
3. **All four render surfaces are in one slice, exceeding the usual one-to-three
   file target, and the reason is the defect's own logic.** Guarding the read while
   leaving the agent area, the pipeline area and the overview tab printing `○ Idle`
   would convert one honest crash into three silent lies — worse than the defect, by
   this repository's own standard that a confident wrong section is more dangerous
   than a missing one. The three additional edits are the same two-line branch, not
   independent work. The slice's defining property is "no surface presents an unknown
   agent status as idle", and a slice that satisfies half of it satisfies none of it.
4. **`g` refuses and `x` proceeds — the asymmetry is deliberate.** Under uncertainty,
   refuse the action that can do damage and allow the action that can only reduce
   activity. Starting a second agent puts two agents on one file set, and
   `startAgent` would itself throw on the same unreadable registry
   (`actions.js:1444`). Requesting a stop when nothing is running is inert, while
   refusing a stop when something IS running strands the human with no way to halt
   it.
5. **The Commands option LABEL does not change; the description does.** Labels are
   keys into the `actions` map at `menu-screens.js:1477-1482`; renaming one silently
   breaks its route. The description is the honest place to name an unknown status.
6. **`getVisionCounts` is reported as a finding, not folded in.** It is the same
   blank-screen shape, one line above, in the same file — and its correct repair is a
   different contract: `readPlans` already establishes skip-the-faulting-entry for a
   *count*, which has a meaningful partial, whereas liveness has none. Two contracts
   in one slice would give the human one gate decision over two unrelated behaviours.
   Named with evidence and left for the human to schedule.
7. **`actions.startAgent:1444` is reported, not fixed.** It is outside the dashboard
   build path this slice surveys and outside its declared files. The `g`-key refusal
   closes the one route into it that this slice owns; the menu route
   (`claude:start-agent`) is driven by the session model and is explicitly not closed
   here, so that gap is stated rather than implied.
8. **The failure is induced through the `safe-fs` module seam, not a real `chmod`.**
   A permission fixture would have to be skipped on some platform and a skipped test
   is a gate failure under the zero-skipped rule. The seam behaves identically
   everywhere and drives the real `task-registry.load`, the real `getAgentStatus` and
   the real renderers — only the two `fs` calls are replaced.
9. **The plan pins the reconcile CORRUPT line, not the THREW line, for case 5.**
   Verified at `task-reconcile.js:602-611`: `reconcileState` catches a load failure
   and returns `corrupt: { reason: 'load-failed' }` rather than throwing. Writing the
   test against the "DID NOT RUN" line would have asserted a line the code cannot
   emit on this path — a false alarm, which is the same defect class inverted.
10. **The already-guarded second registry read at `menu-screens.js:480` is handled,
    not left.** The brief described it as unguarded; it is guarded but fails silent
    and open. It keeps its empty-registry fallback because the dashboard must render,
    and it records that the fallback was taken so the TASKS area cannot present an
    empty registry as an observed zero. Case 4 pins the coexistence rather than
    trusting the ordering argument that made it safe.
11. **The plan is numbered 00086, not 00075.** Plan numbering in this repository is
    global across stages, not per-directory: the highest number in
    `plans/implementation/` is 00074, but 00075 through 00085 are taken by plans in
    `plans/review/` and `plans/todo/` — `00075-wedge-reports-get-a-reader` is named in
    this slice's own dependency chain. Numbering after the highest number in the
    implementation directory alone would have collided with a landed sibling.
12. **`depends_on` names only the reconcile-failure slice.** The dependency is real
    and not merely file-level: this slice renders beside `renderReconcileHealth`,
    matches its wording register, and cases 4 and 5 assert the two coexist. No
    dependency is declared on `00082-ratchet-files-are-in-scope-by-rule`, which is
    still in `todo/` and changes a plan template rather than any code this slice
    touches — so both ratchet files are declared explicitly here rather than assumed
    to be in scope by a rule that has not landed.

### Discrepancies found at build time — the CODE won, recorded

13. **Line numbers had drifted; the code was followed, not the plan's line
    references.** The unguarded `getAgentStatus` call in `buildDashboardTable` is at
    `menu-screens.js:492` (plan said `:400`); the `AGENT` block is at `:683–692` (plan
    said `:559–570`); `dashboardCommands` builds its options at `:1622` (plan said
    `:1465`). The propagation point is `task-registry.js:392` — `safeFs.existsSync(p)`,
    OUTSIDE the loader's own try (the `readFileSync` at `:396` is INSIDE it and fails
    open) — exactly the seam the plan named. The red evidence pins that path.
14. **The false-green baseline was `maxFindings: 210`, not `217`, and the fix CLEARED
    the tracked finding.** On disk the baseline held `maxFindings: 210` with the key
    `src/lib/state.js:silent-catch:getAgentStatus` (plan said 217). Change 2 gave the
    detail-file catch real work (record on a non-`ENOENT` error), so the scanner no
    longer flags it. Live count fell 210 → 209. Per the ratchet's only allowed
    direction, `maxFindings` was lowered to 209 and the key removed from `findings`
    (208 entries + 1 whitelist entry = 209 live). **No `whitelist` entry was added on
    any path** — the fence was right and the code was fixed.
15. **`CLAUDE.md`'s body was NOT edited; the test-file count is a GENERATED growing
    tally now (plan 00215), not a hand-edited literal.** `tests/doc-counts.test.js`
    cross-checks `computeDocCounts.testFiles` against an independent disk walk — both
    move together when a test file is added, so adding one never breaks the check and
    never requires a `CLAUDE.md` edit. The plan's "428 → 429 in two places" is
    obsolete. `CLAUDE.md` stays in this slice's declared `files:` (it is a ratchet the
    plan reserved) but its body is left untouched, matching the build directive that a
    sibling build may own the doc body.
16. **`getAgentStatus` now DECLARES its return type via a JSDoc `@typedef AgentStatus`
    to keep `tsc --noEmit` clean.** Adding the `unreadable` variant widened the inferred
    `active` to `boolean`, which broke the discriminated-union narrowing the pre-existing
    renderers relied on to read their optional legacy display fields (`stale`, `pid`,
    `name`, `stalePlan` — always `undefined` at runtime, guarded dead branches this slice
    does not own). The typedef restores the permissive shape those reads assumed and
    documents the real runtime object, rather than loosening any check or touching the
    legacy branches.
17. **The Commands screen return shape is `{ text, ask: { questions }, actions }`.** The
    Step-16 test reads the Start-agent option through `screen.ask.questions[0].options`
    and the route key through `screen.actions['Start agent']`. No existing test was
    changed — only this slice's own new test was written to the real contract.


## Decisions Taken During Implementation

_Adversarial-review repair (v6.13.79+). The shipped fix was TEST-THEATER: the
`unreadable` state was reachable ONLY through the `breakRegistryReads` seam, which makes
`safeFs.existsSync` THROW — a condition real `fs.existsSync` never produces (it returns a
boolean on EACCES). In the real runtime `task-registry.load` NEVER throws for the named
faults: `existsSync` doesn't throw, and `readFileSync` + `JSON.parse` are inside load's
own try/catch, so a corrupt or permission-denied `tasks.json` fails OPEN to an empty
registry → `getAgentStatus` returned `{active:false}` → the dashboard rendered `○ Idle` —
the exact false-idle the slice claims to remove, UNCHANGED. Repro captured verbatim before
the fix: a corrupt file (`printf 'not json'`) and a `chmod 000` file (readFileSync threw
EACCES, caught in load) BOTH yielded `load.unreadable=undefined`, `getAgentStatus={active:false}`._

18. **Fix shape (a) — `load` signals the failure — was chosen over (b) re-probe in
    `getAgentStatus`.** `load` is the shared function every caller routes through, and it
    ALREADY knows at the point of failure that the file existed but could not be read or
    parsed — it was discarding that fact by returning an empty value byte-identical to the
    genuinely-absent case. Shape (a) makes the read/parse-failure return carry
    `unreadable: true` + `reason` while keeping `tasks: []`; `getAgentStatus` reads the
    flag. Shape (b) would duplicate load's read in a second stat/read probe, race the file,
    and re-read on every idle render — more code, in the wrong place. This is the
    root-cause fix: one guard in the shared function, not a probe bolted onto one caller.
19. **`load` STAYS fail-open — it never throws on the fault; the signal rides on the
    value.** The requirement that a vanished/absent file must never crash or block the menu
    is preserved: `load` returns `{...loadedEmpty(), unreadable:true, reason}` rather than
    throwing. Every one of load's ~14 callers reads `.tasks` (or `.tasks.length` /
    `.tasks.filter`), which stays `[]`, so none is affected. `save` (task-registry.js:507)
    builds its payload from an explicit field whitelist (`version`, `generation`, `seq`,
    `tasks`), so `unreadable`/`reason` can NEVER leak into a persisted registry file.
20. **Scoped to the READ/PARSE failure (existing catch), NOT to wrong-shape/version.** The
    two kill-claim faults — corrupt JSON (parse throw) and EACCES (read throw) — both land
    in load's single `try/catch` at task-registry.js:407. A valid-JSON-but-wrong-shape or
    version-mismatch file (the branch below) parses cleanly and is a genuine data/migration
    problem the pipeline legitimately treats as empty; flagging it `unreadable` would show
    UNKNOWN for a merely-outdated registry. Left as benign empty, matching the plan's own
    "fails open on a DATA problem" classification.
21. **Two files touched BEYOND the plan's declared set — reported, not hidden.**
    - `src/lib/task-registry.js` (NOT declared): the root-cause fix lives here — `load`
      must emit the distinguishing signal. Unavoidable for shape (a) and the honest place
      for it.
    - `tests/dashboard-reconcile-failure.test.js` (NOT declared): case 3 encoded the OLD
      theater contract — it asserted a corrupt `tasks.json` renders with NO "could not be
      read" text, i.e. as idle. That is the false-idle the review replaces. Its regex
      `/the task registry could not be read/` was written to assert the RECONCILE line is
      absent but is too broad and now also catches the correct new AGENT UNKNOWN line. Per
      Operating Lesson 14 (the test asserted a contract the review explicitly replaced), it
      was TIGHTENED, not weakened: the reconcile-absence assertion is narrowed to the
      reconcile line's true signature `could not be read (load-failed)` (reconcile still
      fails open silently here, so that line is legitimately absent), AND a positive
      assertion was ADDED that the AGENT block now says `the agent status is UNKNOWN` and
      never `○ Idle`. Net: MORE assertions, tighter toward real behavior. No assertion was
      loosened, no case deleted, no whitelist entry added.
22. **Kill-claim tests use the REAL faults, no seam.** Three cases were appended to the
    declared `tests/dashboard-survives-unreadable-registry.test.js`: a real corrupt file
    (`writeFile 'not json'`), a real `fs.chmodSync(p, 0o000)` (which asserts EACCES was
    actually produced as a precondition, and SKIPS LOUDLY on Windows/root — printing the
    reason to stderr and returning — because a permissions test that silently no-ops is
    itself theater), and an absent-registry case proving idle does NOT regress to a false
    UNKNOWN. The chmod case RAN (non-root macOS) and was red-then-green; it is not a
    skipped test in the gate. The shipped 17 seam-based cases were KEPT — no coverage
    deleted; the real-fault cases are the kill-claim additions.
23. **No new test FILE was added, so no doc-count / test-file ratchet applies.** The plan's
    declared `CLAUDE.md` and `.ctoc/false-green-baseline.json` ratchets were NOT touched:
    cases were appended to two EXISTING test files, the test-file count is unchanged, the
    fix adds no new silent-catch (the catch it edits already logged via `warnLog`), and the
    false-green fence stayed green in the full gate.

## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
