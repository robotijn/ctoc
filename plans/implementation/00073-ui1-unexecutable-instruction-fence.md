---
iron_loop: true
title: "A ratcheting fence against an instruction that can never execute — something documented, registered, or ordered where nothing on the other end can act on it"
type: implementation
parent_plan: none
depends_on: none
priority: critical
files:
  - src/lib/unexecutable-instruction-scan.js
  - src/lib/iron-loop-enforcer.js
  - tests/unexecutable-instruction-fence.test.js
  - .ctoc/unexecutable-instruction-baseline.json
---

# The unexecutable-instruction fence

## ⚠️ BUILD CONFLICT — SERIALIZE THIS WITH THE FALSE-GREEN FENCE

`plans/in-progress/00071-fg1-false-green-fence.md` is **in-progress right now** and
declares `src/lib/iron-loop-enforcer.js` in its own `files:` list. It will append a
check to the `CHECKS` registry at roughly line 565. **This plan appends a check to the
same array.** Two executors editing that array concurrently will produce a lost update
or a merge conflict in the one file that both fences depend on for liveness.

**The human must serialize the two builds.** Recommended order: let the false-green
fence land first (it is already in-progress and already gate-approved), then start this
one. The rest of this plan's files are disjoint from that plan's, so no other conflict
exists.

## Problem — a defect class that fails in total silence

In plain words: **something is documented, registered, or instructed, and nothing on
the other end can act on it.** It never throws at the point of authorship, it never
shows up as a failing assertion, and the pipeline reports success. All three confirmed
instances were found **by accident**, never by a check — which is the whole argument
for a mechanical fence.

It is a sibling of the false-green class (00071) but a *distinct* mechanic. False-green
is an instrument reporting a verdict on input it never received. This class is an
instruction with no receiver at all. They need different detectors, which is why this
is its own plan and not a section of that one.

### The three confirmed instances (verified against disk, 2026-07-18)

| # | Site | What is instructed | What is on the other end | State |
|---|---|---|---|---|
| 1 | `src/commands/menu.md:232` documented the recipe "Record a task per ref (`menu task add`, kind `precompute`…)" | a task of kind `precompute` | `KINDS` in `src/lib/task-registry.js` did not contain `precompute`; `addTask` threw on every call | **FIXED today** — `precompute` now sits in `KINDS` at `task-registry.js:136-139` with the post-mortem in its docblock |
| 2 | `src/hooks/SessionStart.js:199-201` | producer and critic agents must call the JavaScript function `streaming-precompute.writePlanQuestions(root, ref, questions, planMtimeMs)` | none of the named agents can invoke a function: `agents/iron-loop/premortem-critic.md`, `devils-advocate-critic.md` and `red-team-critic.md` are `tools: Read, Grep`; `agents/planning/product-owner.md` is `Read, Write, WebSearch`; `vision-advisor.md` is `Read, AskUserQuestion, Write`; `implementation-planner.md` is `Read, Glob, Grep, Write`. **Not one holds Bash.** | **STILL LIVE** |
| 3 | `src/lib/init-project.js:509-510` writes `enforcement:\n  mode: strict` into every new project's `settings.yaml`, and `CLAUDE.md` documents it as live per-project tuning | an enforcement-strictness setting | nothing in `src/` reads it. `src/hooks/PreToolUse.Task.js:27` says so outright: *"`enforcement.mode` from `.ctoc/settings.yaml` today — no hook does"*. The similarly-named `workflow.enforcementMode` at `src/lib/settings.js:59` is a **different key on a different surface** (`settings.json`) | **STILL LIVE** (plan 00069 wires it; the fence must catch the general case regardless) |

Instance 1's blast radius is the argument for urgency: every `menu task add precompute`
call threw, so the record-first step failed, so **no critic was ever dispatched, no
questions file was ever written**, and the streaming screen silently fell back to a
bare prompt for all 64 pending plans. Nothing was red. Nobody was told.

### A fourth instance, found while writing this plan

The detection signature designed below was run by hand over the agent corpus before
committing to it. It immediately surfaced a fourth, previously unrecorded instance of
the same class:

- `agents/planning/product-owner.md:336` — *"Call `markComplete(stubPath, …)` from
  `src/lib/background.js`"*, in an agent whose grant is `Read, Write, WebSearch`.
  Five sibling instructions in the same file (`markNeedsInput` at lines 51, 52, 53,
  75, 119, 506).
- `agents/planning/vision-decomposer.md` — eight instructions to call
  `getCanvasForVision`, `parseCanvas`, `decomposeVision`, `mergeStubs`, `removeStub`,
  `createStub`, `initProductOwnerAgent`, `completeVision`, in an agent granted
  `Read, Write, AskUserQuestion`.

That the signature found a real, unknown instance on its first hand-run is the
strongest evidence available that detection (b) is buildable rather than noise.

## What this builds

A **test that fails, inside `npm test`** — not a linter hint, not a documentation note
— backed by one scanner module wired into the live self-check registry so the scanner
itself is reachable and is not flagged by the dead-code and dead-export fences.

It follows this repository's established fence pattern exactly: `tests/reachability.test.js`
for the ratchet, `tests/menu-task-wiring.test.js` for bidirectional vocabulary parity,
`tests/cache-freshness.test.js` for the justified-minimal-exemption list and the
prescriptive failure message.

### Debt versus exemption — the distinction that makes this landable

Conflating these is what has killed fences in this repository before, so they are two
separate structures in the baseline file with two different meanings.

| | Meaning | Justification | Direction | Starts at |
|---|---|---|---|---|
| **DEBT** | A real defect that exists today and is being paid down | none required per entry | may only **shrink** | seeded from a real scan |
| **EXEMPTION** | Not a defect — the detector is wrong about this one | **required**, per entry, ≥ 20 chars | may only grow by deliberate review | **empty** |

A finding in DEBT is a bug awaiting a fix. A finding in EXEMPTION is a false positive
awaiting nothing. Anything in neither list **fails the build**.

## The three detections

Three genuinely different mechanics, one scanner, one exported function.

### (a) Recipe verb versus accepted vocabulary

**Instruction side.** Parse `src/commands/*.md` for references to the task-add verb.
Two textual shapes both occur in the live file and both must be extracted:

1. inline — `menu task add <kind>` (the shape at `menu.md:112` uses the metavariable
   `K`, which is skipped as a placeholder, not read as a kind);
2. **displaced** — a `menu task add` mention followed within 200 characters by a
   `` kind `<token>` `` phrase. This is the shape of the *actual instance*:
   `menu.md:232` reads ``Record a task per ref (`menu task add`, kind `precompute` …)``.
   A naive `menu task add (\w+)` regex would **not** have caught the real bug. This is
   the single most important design detail in detection (a).

**Accepted side.** `require('./task-registry').KINDS`.

**Both directions**, following the bidirectional pattern already proven at
`tests/menu-task-wiring.test.js:636-664`:

- *forward* (**hard**) — a kind the docs instruct that `KINDS` rejects. This is
  instance 1 and it is a hard failure: any new one blocks.
- *reverse* (**debt-seeded**) — a kind in `KINDS` that no recipe documents. Weaker by
  nature: `sync` is enqueued programmatically via `actions.enqueueWaveSync` and never
  typed by a human, so it is legitimately undocumented as a recipe. Reverse findings
  are therefore seeded into DEBT rather than treated as instant failures.

**Sibling enumerations swept the same way** (each is a registered vocabulary a document
can name and code can reject): `STATUSES` and `TERMINAL` in `task-registry.js`, and the
`claude:` action-key parity already fenced in `menu-task-wiring.test.js`. That existing
key parity is **not duplicated** — the scanner records it as already-fenced and skips it,
so there is exactly one fence per invariant.

### (b) Instruction verb versus agent tool grant

The highest false-positive risk in this plan, and the reason the discriminators are
stated explicitly rather than left to the implementer.

**Grant side.** Parse the **first** YAML frontmatter block of each `agents/**/*.md` and
read its `tools:` list. *Load-bearing parsing detail:* `agents/planning/implementation-planner.md`
has a **second** `tools:` line at line 160, inside an embedded "agent definition pattern"
example. Reading the last match, or matching anywhere in the file, reads an example as
the grant. Only the first frontmatter block counts.

**Instruction side — the two signatures I accept.**

| Signature | Shape | Requires |
|---|---|---|
| **b1 — function call** | an imperative or second-person `call` / `invoke` verb immediately followed by a backticked call token `` `name(` `` or `` `mod.name(` `` | `Bash` (a function is invoked by shelling out to `node -e`), **unless** the callee's bare name matches a granted tool name |
| **b2 — shell command** | a line beginning with an imperative `Run ` / `Execute ` followed by a backticked token that is not a call token | `Bash` |

**The discriminator between instruction and description**, which is the crux:

- **Instruction (flagged)** — the sentence has no third-person subject before the verb.
  `Call \`markComplete(…)\``; `you call \`applyFallback(…)\``; `2. Call \`parseCanvas(path)\``;
  `- **Merge:** Call \`mergeStubs(…)\``. The addressee is this agent.
- **Description (not flagged)** — a third-person subject precedes the verb. Detected by
  testing whether the ≤ 60 characters preceding the verb end in a noun-phrase subject or
  a modal: `The decomposer will call \`validateVisionReadiness(…)\``
  (`vision-advisor.md:455`); `the dispatcher calls X`; `CTO Chief runs the stack-chooser`.
  Also excluded: the third-person verb inflections `calls` / `runs` / `invokes`, which
  are description by grammar.
- **Satisfied-by-tool (not flagged)** — the callee name is itself a granted tool.
  `vision-advisor.md:26` says `Call \`Read('.ctoc/learnings/vision.md')\`` and
  `vision-advisor.md:110` says `Call \`Write(visionPath, updatedContent)\`` — that agent
  holds `Read` and `Write`, so both are perfectly executable. Without this rule the
  detector would produce a flood of false positives against exactly the agents that are
  correct.
- **Fenced code excluded entirely.** Content inside ``` fences is example, output
  template, or transcript — never an instruction to this agent.

**Signatures I reject as too noisy, and why** (stated as required, and this is the
honest part of the design):

| Rejected signature | Why |
|---|---|
| bare "write the report" / "write X to Y" as a Write-grant check | English "write" is overwhelmingly used for the agent's *output prose*, not a file write. Unresolvable without semantics. |
| bare "search for X" as a WebSearch-grant check | "search the codebase" is satisfied by Grep; "search for a pattern" is satisfied by Glob. The verb does not name the tool. Hand-run over `agents/quality/**` returned zero true positives. |
| any backticked shell-looking token anywhere in a line | agent prose is dense with example commands. Restricted to a line-initial imperative (b2) precisely to avoid this. |
| "read X" as a Read-grant check | every agent in the corpus holds `Read`; the check can never fire. Zero value, non-zero noise. |

**Measured volume.** A hand-run of the b1 signature over all 123 agent definitions
returned **23 matches**, of which the clear majority are true positives and the
remainder are cleanly separated by the two exclusion rules above. This is a
hand-auditable set, not a flood. If, at Step 8, the seeded scan exceeds **60** b-findings,
that is evidence the signature drifted noisy: stop, and report to the human rather than
whitelisting the residue away.

### (c) Config key written or documented versus read

**Read `docs/CONFIG_SOURCES.md` before touching this — the two surfaces have two
different readers and conflating them produces false results in both directions.**

| File | Read by | Owns |
|---|---|---|
| `.ctoc/settings.yaml` | the PreToolUse hooks and library code (`src/hooks/*`, `src/lib/budget.js`, `src/lib/regulatory-regime.js`) | `enforcement.mode`, `regulatory_regime`, `operations` |
| `.ctoc/settings.json` | `src/lib/settings.js` and `src/lib/deployment.js` | `general.environment`, `agents`, `workflow`, `learning`, `git`, `privacy`, `deployment` |

`enforcement.mode` (yaml) and `workflow.enforcementMode` (json) are **different keys on
different surfaces**. A name-only matcher would see "enforcement" in `settings.js:59`
and wrongly certify the yaml key as read. The scanner therefore keys every finding by
`<surface>::<dotted.path>` and only credits a reader that reads the **same** surface.

**Written side.** The keys emitted by `generateSettings()` in `src/lib/init-project.js`
(the yaml surface) and the schema defaults in `src/lib/settings.js` (the json surface).

**Read side.** A key counts as read when its leaf name, or its dotted path, appears in
`src/**` **outside** the writer that emits it and outside a comment. Deliberately
generous: this detector must **under**-report, exactly like the export fence
(`src/lib/reachability.js:333-335` states that bias as the correct one for a gate that
fails a build). A fence that cries wolf gets whitelisted into uselessness.

**Expected seed for the yaml surface**, from the live `generateSettings()` at
`init-project.js:504-535`: `enforcement.mode`, `quality.coverage_threshold`,
`quality.flaky_test_retries`, `quality.flaky_test_action`, `research.enabled`,
`research.auto_steps`, `detected.languages`, `detected.frameworks` — grepping `src/`
found no reader for any of them. `regulatory_regime.active_profiles` **is** read
(`src/lib/regulatory-regime.js` `loadActiveProfiles`) and must come back clean; that is
the detector's own non-vacuity control.

## Implementation Details

### Dependency graph

```
src/lib/unexecutable-instruction-scan.js
   ├── requires  src/lib/safe-fs.js          (audited fs choke point — no raw fs)
   ├── requires  src/lib/task-registry.js    (KINDS / STATUSES / TERMINAL)
   └── reads     src/commands/*.md, agents/**/*.md, src/lib/init-project.js,
                 src/lib/settings.js, src/**  (as data)

src/lib/iron-loop-enforcer.js
   └── requires  src/lib/unexecutable-instruction-scan.js   ← THE LIVE CALL SITE

tests/unexecutable-instruction-fence.test.js
   ├── requires  src/lib/unexecutable-instruction-scan.js
   └── reads     .ctoc/unexecutable-instruction-baseline.json
```

No cycle: the scanner requires `task-registry`, which requires only `safe-fs` and
`plan-coverage`. The enforcer already requires `reachability` the same way.

### Wiring — the live call sites (non-negotiable, and in THIS slice)

| New module | Live call site | Root it is reachable from |
|---|---|---|
| `src/lib/unexecutable-instruction-scan.js` | `src/lib/iron-loop-enforcer.js` → `CHECKS` entry `{ id: 'unexecutable-instruction-fence', scope: 'architecture', mode: 'thorough', fn: checkUnexecutableInstructionFence }`, appended to the array at ~line 585, with `checkUnexecutableInstructionFence(root)` defined beside `checkDeadExportFence` at ~line 601 | `iron-loop-enforcer.checkAllInvariants` is reached from the shipped `src/commands/menu.js` self-check route |

The call site ships in this slice's Step 10. It is not a follow-up. Without it the
scanner is dead on arrival and the reachability fence at `tests/reachability.test.js`
will say so.

### File: `src/lib/unexecutable-instruction-scan.js`

**Action:** CREATE
**Purpose:** Find every instruction that nothing on the other end can act on.
**Exports:** exactly one function (any second export would be flagged by the
dead-export fence, since only `scan` has a live call site).

```js
/**
 * @typedef {Object} Finding
 * @property {'recipe-kind'|'recipe-kind-reverse'|'instruction-tool'|'config-key'} detection
 * @property {string} key     stable baseline key — NEVER contains a line number
 * @property {string} file    repo-relative path, path.posix-normalized
 * @property {number} line    1-based, for the human-readable message ONLY
 * @property {string} message one sentence naming what cannot execute and why
 * @property {string} fix     the prescribed fix, naming the file and the safe shape
 */

/**
 * Scan a project for instructions that can never execute.
 *
 * @param {string} root - absolute project root
 * @returns {{findings: Finding[], counts: {recipeKind:number, recipeKindReverse:number,
 *   instructionTool:number, configKey:number}, scanned: {commandDocs:number,
 *   agents:number, settingsKeys:number}}}
 *   `scanned` exists for the non-vacuity assertions: a scan that read zero agents
 *   must fail the fence, never pass it silently.
 * @throws {TypeError} root is not a non-empty string
 */
function scan(root) { /* … */ }

module.exports = { scan };
```

**Internal helpers** (module-private, not exported):

| Helper | Signature | Behaviour |
|---|---|---|
| `stripFences` | `(md: string) => string` | replace ``` fenced blocks with blank lines of equal count, so line numbers survive |
| `frontmatterTools` | `(md: string) => string[]` | tools from the **first** `---` block only; `[]` when absent |
| `recipeKinds` | `(md: string) => Array<{kind, line}>` | both the inline and the displaced shapes; skips single-uppercase-letter metavariables |
| `instructionCalls` | `(md: string, tools: Set<string>) => Array<{callee, line, signature}>` | b1 + b2, after `stripFences`, after the description and satisfied-by-tool exclusions |
| `writtenSettingsKeys` | `(root: string) => Array<{surface, path, line, file}>` | yaml keys from `generateSettings()`'s emitted literal; json keys from the `settings.js` schema |
| `keyIsRead` | `(root, surface, dottedPath) => boolean` | leaf-or-dotted occurrence in `src/**`, excluding the emitting writer and comment lines |

**Baseline key shapes** — stable identifiers, **no line numbers** (a line number in a
key makes the baseline churn on every unrelated edit and turns the fence into noise):

```
recipe-kind          src/commands/menu.md::recipe-kind::precompute
recipe-kind-reverse  src/lib/task-registry.js::recipe-kind-reverse::sync
instruction-tool     agents/planning/product-owner.md::instruction-tool::markComplete
config-key           settings.yaml::config-key::enforcement.mode
```

**Failure-message contract** — every finding's `fix` **prescribes**, naming the file and
the safe shape. Vague messages are how a fence gets ignored:

- `recipe-kind` → *"`src/commands/menu.md` instructs kind `X`, which `KINDS` in
  `src/lib/task-registry.js` rejects — every such call throws and the recipe silently
  never runs. Either add `X` to `KINDS` (with a docblock note saying why) or correct the
  recipe to name an accepted kind."*
- `instruction-tool` → *"`<agent>.md` tells this agent to call `X(…)`, but its
  `tools:` grant is `<list>` — it cannot invoke a function. Either grant `Bash` and have
  it shell out via `node -e`, or rewrite the instruction as an artifact the agent CAN
  produce with its granted tools (e.g. Write a file that a wired code path consumes)."*
- `config-key` → *"`<writer>` writes `<surface>` key `<path>` but no code in `src/`
  reads it — a visible setting wired to nothing is a placebo. Either wire a reader (and
  note it in `docs/CONFIG_SOURCES.md`) or stop writing the key."*

**Cross-platform:** all paths via `path.join`; every baseline key and `file` field
normalized to forward slashes with `path.posix` so a Windows scan produces byte-identical
keys to a macOS one. All filesystem access through `src/lib/safe-fs.js`. No `execSync`.

### File: `src/lib/iron-loop-enforcer.js`

**Action:** MODIFY — **conflicts with plan 00071, see the banner at the top.**

- **Add** `checkUnexecutableInstructionFence(root)` beside `checkDeadExportFence`
  (~line 601). Lazy-`require` the scanner inside the function body, matching the
  established shape of `checkReachabilityFence` and `checkDeadExportFence`.
- **Add** one `CHECKS` entry (~line 585), `mode: 'thorough'` (the scan walks the agent
  corpus, so it must not run on the fast path).
- Returns `null` when `scanned.agents === 0` (not a CTOC source tree) and `null` when
  every finding is baselined; otherwise `{severity: 'block', message}` naming the first
  ten fresh findings, mirroring `checkDeadExportFence` exactly.
- A malformed baseline excuses **nothing** — every finding blocks. Same posture as
  `checkDeadExportFence`'s `catch` at line 617.

### File: `.ctoc/unexecutable-instruction-baseline.json`

**Action:** CREATE — seeded from a **real scan at Step 8**, never hand-guessed.

```json
{
  "maxDebt": 0,
  "debt": [],
  "exemptions": []
}
```

`debt` is an array of baseline-key strings. `exemptions` is an array of
`{ "key": "…", "reason": "…" }` and **ships empty**. `maxDebt` is the seeded debt count.

### Test plan: `tests/unexecutable-instruction-fence.test.js`

**Action:** CREATE. Framework `node:test` with `assert/strict`, matching every sibling
fence in `tests/`.

| # | Test | Drives |
|---|---|---|
| 1 | **Non-vacuity** — `scanned.agents >= 100`, `scanned.commandDocs >= 1`, `scanned.settingsKeys >= 5`. A scan that read nothing must fail, never pass silently (the false-green trap this fence must not fall into itself). | the analyzer |
| 2 | **(a) REAL INSTANCE, historical** — a fixture reproducing `menu.md:232` verbatim (``Record a task per ref (`menu task add`, kind `precompute`…)``) scanned against a `KINDS` set lacking `precompute` yields exactly one `recipe-kind` finding keyed `…::recipe-kind::precompute`. Asserts the **displaced** shape is caught — a naive `menu task add (\w+)` regex would miss the real bug. | instance 1 |
| 3 | **(a) forward parity is clean today** — the live repo produces zero fresh `recipe-kind` findings, because `precompute` was added to `KINDS`. | the fix holds |
| 4 | **(b) REAL INSTANCE, live** — the live scan contains `agents/planning/product-owner.md::instruction-tool::markComplete`, and that key is present in `debt`. | instance 2's mechanic, on the fourth instance found by this signature |
| 5 | **(b) description is NOT flagged** — `agents/planning/vision-advisor.md:455` ("The decomposer will call `validateVisionReadiness(…)`") produces no finding. | the discriminator |
| 6 | **(b) satisfied-by-tool is NOT flagged** — `vision-advisor.md:26` `Call \`Read(…)\`` and `:110` `Call \`Write(…)\`` produce no findings, since that agent holds `Read` and `Write`. | the second discriminator |
| 7 | **(b) frontmatter parsing** — `implementation-planner.md` resolves to `Read, Glob, Grep, Write` from its **first** block, never the example `tools:` at line 160. | the parsing trap |
| 8 | **(c) REAL INSTANCE, live** — the live scan contains `settings.yaml::config-key::enforcement.mode`, and that key is in `debt`. | instance 3 |
| 9 | **(c) surface separation** — `workflow.enforcementMode` on the json surface does **not** satisfy `enforcement.mode` on the yaml surface. | the `CONFIG_SOURCES.md` split |
| 10 | **(c) non-vacuity control** — `regulatory_regime.active_profiles` is **not** flagged, because `regulatory-regime.js` `loadActiveProfiles` reads it. Proves the reader-detection is not stuck returning false. | the detector |
| 11 | **NO NEW ENTRY** — every live finding is in `debt` or `exemptions`; anything else fails with the per-finding prescriptive `fix` text. | the ratchet |
| 12 | **RATCHET ONLY TIGHTENS** — `findings.length <= maxDebt`. | the ratchet |
| 13 | **CLAIM YOUR PROGRESS** — `findings.length === maxDebt` exactly; a drop fails with *"you fixed N — now LOWER maxDebt to X and remove the fixed keys."* Mirrors `tests/reachability.test.js:87-98`. | the ratchet |
| 14 | **BASELINE IS HONEST** — no `debt` key names a file that no longer exists; no key contains a line number (asserted by pattern). | the baseline |
| 15 | **EXEMPTIONS ARE JUSTIFIED** — every exemption has a `reason` of ≥ 20 characters; `exemptions` ships empty. | debt/exemption separation |
| 16 | **WIRED** — `src/lib/iron-loop-enforcer.js` contains the `unexecutable-instruction-fence` `CHECKS` entry, and `checkAllInvariants({mode:'thorough'})` runs it without throwing. | the live call site |

Coverage target ≥ 80% on the new module, error paths included (`scan(null)` throws
`TypeError`; a missing `agents/` directory yields `scanned.agents === 0` rather than a
throw).

## Security Review

- **Path traversal** — every read path is built with `path.join(root, …)` from a
  caller-supplied root; no path segment comes from scanned file *content*.
- **Regex denial of service** — the instruction signatures use bounded character
  classes and a bounded look-back window (≤ 60 chars), never a nested quantifier over
  unbounded input. Each scanned line is length-capped at 2000 characters before
  matching.
- **No secrets** — the scanner reads config **key paths**, never values; no finding
  message may contain a settings value. Asserted in test 8's message check.
- **Prototype pollution** — findings are built from named fields, never spread from
  parsed content; the baseline is read into a `Set` of strings, never merged into an
  object.
- **Command injection** — no `exec`, no `execSync`, no shell. The scan is pure reads.
- **Error messages** — repo-relative paths only, never absolute ones that would leak a
  developer's home directory into a build log.
- **Fail direction** — the scanner **under**-reports by design (matching
  `src/lib/reachability.js:333-335`); a malformed baseline excuses nothing.

## Execution Plan

### Step 8: TEST
Write `tests/unexecutable-instruction-fence.test.js` with all 16 cases above. Run it,
**see it fail red** — the module does not exist yet. Then run the scanner prototype once
to **seed** `.ctoc/unexecutable-instruction-baseline.json` from a real scan; record the
seeded counts per detection in this plan. If the `instruction-tool` count exceeds 60,
**stop and report to the human** — that is evidence the signature drifted noisy, and
whitelisting the residue away would be the exact failure this plan exists to prevent.

### Step 9: PREPARE
Confirm plan 00071 has landed and `src/lib/iron-loop-enforcer.js` is free (see the
conflict banner). Read `docs/CONFIG_SOURCES.md`, `src/lib/task-registry.js` `KINDS`,
and `tests/menu-task-wiring.test.js` before writing the parity code.

### Step 10: IMPLEMENT
- `src/lib/unexecutable-instruction-scan.js` — `scan(root)` plus the six private helpers.
- `src/lib/iron-loop-enforcer.js` — `checkUnexecutableInstructionFence` + the `CHECKS` entry.
- `.ctoc/unexecutable-instruction-baseline.json` — the seeded debt from Step 8.

### Step 11: REVIEW
Verify the dependency direction (lib never imports hooks or commands), that exactly one
name is exported, that no baseline key carries a line number, and that every failure
message prescribes a fix naming a file and a safe shape.

### Step 12: OPTIMIZE
One pass per file; `stripFences` and the line split computed once per file, not per
signature. The whole scan must stay under one second over the 123-agent corpus — it runs
in `thorough` mode inside the self-check.

### Step 13: SECURE
Walk the Security Review list above item by item. Confirm the length caps and the
bounded look-back are present in the shipped regexes.

### Step 14: VERIFY
Run the **full gate**: `npm test`. Requires lint clean, typecheck clean, all tests
passing, **coverage at or above the enforced floor of 99** in
`.ctoc/coverage-baseline.json`, 0 skipped, 0 flaky. `node --test tests/*.test.js` is
**not** sufficient — it bypasses both the coverage floor and the zero-skipped gate.

### Step 15: DOCUMENT
JSDoc on `scan` and every private helper, including the two rejected-signature
rationales so a future maintainer does not "helpfully" add them back. A short comment
block at the top of the baseline's consuming test stating the debt/exemption
distinction.

### Step 16: FINAL-REVIEW
Confirm: all three detections each have a test driving a real instance from the list;
the scanner is wired into `CHECKS` in this same slice; `exemptions` is empty; the
ratchet fails loudly in both directions; the plan's acceptance criteria all map to a
passing test.

## Decisions Taken Under Ambiguity

1. **Reverse parity for task kinds is debt-seeded, not a hard failure.** `sync` is
   enqueued programmatically and legitimately has no human-typed recipe. Treating
   reverse findings as instant failures would have forced a false exemption on day one.
   Forward parity — the direction of the real instance — stays hard.
2. **The `claude:` action-key parity is not re-implemented.** `tests/menu-task-wiring.test.js:636-664`
   already fences it bidirectionally. The scanner records it as already-fenced and skips
   it: one fence per invariant, or the two drift and the human trusts neither.
3. **Detection (b) is scoped to two signatures.** Four candidate signatures were rejected
   as too noisy (table in the (b) section). This is a deliberate under-report: a fence
   that cries wolf gets whitelisted into uselessness, and the export fence's own docblock
   argues that bias is correct for a gate that fails a build.
4. **Config readers are detected by name occurrence in `src/**`, not by data-flow.** A
   real reachability analysis of a config read is out of proportion here. Name matching
   under-reports (a key mentioned anywhere counts as read), which is the safe direction.
5. **Both settings surfaces are scanned, keyed by surface.** Scanning only the yaml
   surface would have missed the general case the human asked for; merging the two
   surfaces would have falsely certified `enforcement.mode` as read via
   `workflow.enforcementMode`.
6. **`scan` is the only export.** The dead-export fence would flag any second export,
   since only `scan` gains a live call site in this slice.
7. **Plan 00069 (wiring enforcement mode) will make test 13 fail on purpose.** When that
   plan lands, `enforcement.mode` stops being a finding, the live count drops below
   `maxDebt`, and the "claim your progress" test fails with an instruction to lower the
   baseline. That is the ratchet working as designed, not a conflict.
