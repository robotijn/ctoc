---
iron_loop: true
title: "enforcement.mode is HONORED — soft warns, off allows, and neither can touch a human gate"
type: implementation
parent_plan: none
depends_on: none
priority: critical
files:
  - src/lib/enforcement-mode.js
  - tests/enforcement-mode.test.js
  - src/hooks/PreToolUse.Edit.js
  - src/hooks/PreToolUse.Task.js
  - src/lib/enforcement-log.js
  - CLAUDE.md
  - .ctoc/templates/CLAUDE.md.template
  - docs/CONFIG_SOURCES.md
---

# enforcement.mode is HONORED — with a hard floor under the human gates

## Problem — verified by direct reading, three independent confirmations

`CLAUDE.md:140-144` documents:

```yaml
enforcement:
  mode: strict   # strict | soft | off  (default: strict)
```

**Nothing in `src/` reads it.** A grep for `enforcementMode|enforcement\.mode|enforcement_mode`
across the repository returns, in `src/`, exactly three hits and not one of them is a read:

- `src/lib/settings.js:59` — a SCHEMA entry (`workflow.enforcementMode`, options
  `strict|soft|off`, default `strict`) that no module consults.
- `src/lib/settings.js:149,156,163` — `ENVIRONMENT_PROFILES` set it (`dev` → `soft`).
  Nothing consumes the resolved value.
- `src/hooks/PreToolUse.Task.js:26-28` — a COMMENT stating the gap:

> ENFORCEMENT MODE. The sibling PreToolUse hooks do not read `enforcement.mode`
> from `.ctoc/settings.yaml` today — no hook does — so this one does not either,
> rather than inventing a knob its siblings do not honor.

It is worse than an unread setting. **`src/lib/init-project.js:504-511`
(`generateSettings`) WRITES the block into every new project's `settings.yaml`:**

```js
'enforcement:',
'  mode: strict  # strict | soft | off',
```

So CTOC ships a visible switch, in a file it authored, wired to nothing — the exact
placebo shape `R4-B` deleted for `push.auto_push` and `git.commitAndPush`
(`init-project.js:536-541` records that deletion). `README.md:167` compounds it:
"choosing `dev` softens enforcement" — it does not; `dev` softens nothing.

A user who sets `mode: soft` gets no effect and no warning. A user who sets
`mode: off` gets no effect and no warning. Both read the documentation, act on it,
and are silently ignored.

## The decision — which key is canonical

Two keys claim this setting. Reconciling them is this slice's core content.

| Candidate | Written by | Read by | Has resolution order | Has a safety-invariant test |
|---|---|---|---|---|
| `.ctoc/settings.yaml` → `enforcement.mode` | `init-project.js:509` | nothing | no | no |
| `.ctoc/settings.json` → `workflow.enforcementMode` | the settings menu | nothing | yes (`settings.js:230-246`) | yes (`environment-mode.test.js:148-167`) |

**Canonical: `.ctoc/settings.yaml` → `enforcement.mode`.** This is not a new call —
`docs/CONFIG_SOURCES.md:25` already ruled it ("Enforcement strictness
(`strict`/`soft`/`off`) → `.ctoc/settings.yaml` → `enforcement.mode`"), and
`CONFIG_SOURCES.md:13-19` explains why: the PreToolUse hooks run on every file edit
and must parse config **without a YAML library**, so hook-critical config lives in
the flat YAML. Overturning that would move a safety-critical read onto a different
file for no gain.

**`workflow.enforcementMode` is not deleted — it becomes the lower tiers.** The
resolver delegates tiers 2-4 to `settings.getSetting('workflow','enforcementMode')`,
which already implements the documented order internally. Consequences:

- `README.md:167`'s promise (`dev` softens enforcement) becomes TRUE for the first time.
- The settings menu's `Enforcement mode` select becomes live instead of a placebo.
- `tests/environment-mode.test.js:148-167`'s invariant keeps its subject and its teeth.
- Neither key is silently ignored, so this slice does not relocate the defect.

**Resolution order** (highest wins), a strict superset of `settings.js`'s documented order:

1. `.ctoc/settings.yaml` → `enforcement.mode` (the documented per-project override)
2. `.ctoc/settings.json` → `workflow.enforcementMode`, explicit — via `settings.getSetting`
3. environment profile (`general.environment`: `dev` → `soft`) — via `settings.getSetting`
4. schema default `strict` — via `settings.getSetting`

Tiers 2-4 are ONE delegated call, so the documented order is preserved by
construction rather than duplicated and drifted.

## The hard floor — what `off` can and cannot do

`off` disables **plan-coverage enforcement on file edits, and nothing else.**

| Deny | Where | Mode-tunable? |
|---|---|---|
| No active plan covers this file (step 5) | `PreToolUse.Edit.js:441-444` | **YES** — the only one |
| Approval-ledger write (`.ctoc/approvals/`) | `PreToolUse.Edit.js:389-393` | NO — human-approval provenance |
| Gate-3 verify-evidence write (`.ctoc/state/verify/`) | `PreToolUse.Edit.js:402-406` | NO — Gate-3 evidence |
| Ledger forgery on the Bash channel | `PreToolUse.Bash.js:679-688` | NO — security deny, absolute |
| Inline-eval that cannot be statically cleared | `PreToolUse.Bash.js:356-388` | NO — security deny, absolute |
| Irreversible/destructive command | `PreToolUse.Bash.js:694-703` | NO — security deny, absolute |
| Raw `mv`/`cp` of a plan between stages | `PreToolUse.Bash.js:715-730` | NO — human-gate deny |
| Gate violation sweep + auto-revert | `src/hooks/human-gate-check.js` | NO — the four human gates |
| Five-subagent concurrency cap | `PreToolUse.Task.js` | NO — a resource cap, not ceremony |

`src/hooks/PreToolUse.Bash.js` and `src/hooks/human-gate-check.js` are **NOT in this
plan's `files:`** — they are not edited. Their immunity is proven by spawning them
under `mode: off` and asserting they still deny (Step 8 tests 16-19), not by a comment.

The floor is **structural, not a runtime clamp**: `off` is a legitimate resolved value.
What makes it safe is that the resolver has exactly ONE production caller and its
result is consulted at exactly ONE decision point. Test 23 asserts that by source scan.

## Wiring — the live call sites (Lesson 16)

| New module | Live call site | Root it is reachable from |
|---|---|---|
| `src/lib/enforcement-mode.js` | `src/hooks/PreToolUse.Edit.js` → `enforce()` | `.claude-plugin/hooks.json` registers `PreToolUse.Edit.js` on `Edit`; `PreToolUse.Write.js:303`, `PreToolUse.MultiEdit.js:53` and `PreToolUse.NotebookEdit.js` all delegate to the same exported `enforce()` — one wiring point covers all four editing tools |

The wiring lands in **this slice's Step 10**, not a follow-up. A human reaches it by
setting `enforcement.mode: soft` in `.ctoc/settings.yaml` and editing an uncovered
file: today nothing happens (block); after this slice the edit is warned and allowed.

## Implementation Details

### Dependency Graph

```
src/lib/enforcement-mode.js ──requires──> src/lib/settings.js   (tiers 2-4, existing)
                            ──requires──> src/lib/safe-fs.js    (existing)
                            ──requires──> path                  (node builtin)

src/hooks/PreToolUse.Edit.js ──fail-soft requires──> src/lib/enforcement-mode.js
src/hooks/PreToolUse.Write.js      ──> PreToolUse.Edit.js:enforce()   (unchanged)
src/hooks/PreToolUse.MultiEdit.js  ──> PreToolUse.Edit.js:enforce()   (unchanged)
src/hooks/PreToolUse.NotebookEdit.js ──> PreToolUse.Edit.js:enforce() (unchanged)

tests/enforcement-mode.test.js ──> enforcement-mode.js (temp-dir fixtures)
                               ──> spawns PreToolUse.Edit.js, PreToolUse.Bash.js
```

No cycle: `settings.js` requires only `safe-fs` + `path`; `enforcement-mode.js` is a
leaf consumer, and no lib module imports a hook.

### File Specifications

---

### File: `src/lib/enforcement-mode.js`
**Action:** CREATE
**Purpose:** The single source of truth for "how strictly does plan-coverage enforcement act?", resolving `.ctoc/settings.yaml` → `.ctoc/settings.json` → environment profile → default, fail-closed.
**Change Type:** new-module

#### Exports

- `resolveEnforcementMode(projectRoot: string)` → `{ mode: 'strict'|'soft'|'off', source: 'settings.yaml'|'settings.json'|'environment-profile'|'default' }`
  - Applies the four-tier order above.
  - **Never throws.** Any error at any tier returns `{ mode: 'strict', source: 'default' }`.
  - Example: `resolveEnforcementMode('/proj')` → `{ mode: 'soft', source: 'settings.yaml' }`
- `ENFORCEMENT_MODES` → `readonly ['strict','soft','off']` (frozen)
- `DEFAULT_ENFORCEMENT_MODE` → `'strict'`

`readYamlEnforcementMode(content)` (the flat parser) and the tier-2/3/4 helper stay
**module-private**. Exporting a function whose only caller is a test is a dead export
by this repo's own rule (`PreToolUse.Bash.js:769-774`); both are exercised through
`resolveEnforcementMode` against real temp-dir fixtures instead.

#### Internal: the flat YAML read

Mirrors `src/hooks/stop-test-gate.js:49-80` (`readStopTestGate`) — the established
safety-critical-hook convention: line-wise, dependency-free, section-tracking,
direct-child-indent only.

- Strip `#` comments, skip blank lines.
- `^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$` per line. Linear, no nested quantifier,
  no data-derived `RegExp` — no catastrophic-backtracking surface.
- Indent 0 sets the current section and resets `childIndent`.
- Accept `mode` ONLY as a **direct child** of section `enforcement` at the
  established child indent. `enforcement:\n  nested:\n    mode: off` is ignored.
  A `mode:` under any other section (e.g. `deployment:`) is ignored.
- Value: strip surrounding quotes, `trim()`, `toLowerCase()`.
- Return the value iff it is in `ENFORCEMENT_MODES`; otherwise `null`.
- `null` on: file absent, unreadable, unparseable, key absent, or an unrecognized value.

#### Fail-closed contract (non-negotiable)

`null` from any tier means "this tier said nothing", never "permissive". The chain
therefore terminates at `strict`. A parser whose no-match default is the permissive
value cannot distinguish "the user chose off" from "I could not read my input" —
the precise false-green that produced `fail 0` over 8 real failures in `test-gate.js`.
This module's default is the RESTRICTIVE value, and Step 8 test 4 proves it with a
deliberately corrupt YAML file.

#### Dependencies

- `require('path')` — `path.join(projectRoot, '.ctoc', 'settings.yaml')`, cross-platform
- `require('./safe-fs')` — `existsSync` / `readFileSync`
- `require('./settings')` — `getSetting('workflow','enforcementMode', projectRoot)` for tiers 2-4

#### Determining `source` for tiers 2-4

`settings.getSetting` collapses tiers 2-4 into one value. To label the source
honestly, the resolver additionally reads `settings.readRawSettings(projectRoot)`
(already exported, `settings.js:349`) and `settings.getEnvironment(projectRoot)`:

- raw `workflow.enforcementMode` present and valid → `source: 'settings.json'`
- else `getEnvironment() !== 'ask'` and the profile names `workflow.enforcementMode`
  → `source: 'environment-profile'`
- else → `source: 'default'`

The `mode` value itself always comes from `getSetting` (the authority), so the label
can never disagree with the value.

#### Error handling

Every filesystem and settings call inside a `try`; a `catch` returns
`{ mode: 'strict', source: 'default' }`. No error is rethrown; no message names a
path (log noise on a hook path is itself a defect).

---

### File: `src/hooks/PreToolUse.Edit.js`
**Action:** MODIFY
**Purpose:** Make the documented setting real at the one decision point it governs.

#### Changes

1. **Add** a fail-soft literal require beside the existing four (after line 56),
   matching the house style exactly:
   ```js
   let enforcementMode = null;
   try { enforcementMode = require('../lib/enforcement-mode'); } catch { enforcementMode = null; }
   ```
   A load failure ⇒ `strict` ⇒ today's behavior. Fail-closed, consistent with the
   file's fail-soft-sibling convention.

2. **Add** a pure exported `buildSoftWarnMessage(reason, info)` next to
   `buildBlockMessage` (~line 314). Same shape, `WARNING` not `BLOCKED`, and it says
   plainly that the edit was **allowed** because `enforcement.mode: soft` is set,
   naming the resolved source file. Pure, so Step 8 asserts its text without
   `process.exit`. Like `buildBlockMessage`, it carries **no verbatim escape-phrase
   list** (W08-s1 / finding H4: this text lands back in the transcript and would
   otherwise seed the raw-tail matcher).

3. **Modify** `allow(outcome, info)` (~line 347) and `block(reason, info)` (~line 325)
   to include `mode: info.mode || null` and `mode_source: info.mode_source || null`
   in the `logEnforcement` payload. Both remain fail-open on a log error.

4. **Modify** `enforce()` (~line 378): immediately after `targetFile` is computed and
   **before** the ledger guard, resolve once:
   ```js
   const { mode, source: modeSource } = enforcementMode
     ? enforcementMode.resolveEnforcementMode(root)
     : { mode: 'strict', source: 'default' };
   ```
   Thread `mode, mode_source: modeSource` into the info object of **every**
   `allow(...)` and `block(...)` call in the function (ledger deny, verify deny,
   whitelist, silent-passthrough, plan-matched, escape, and step 5). One resolution
   per invocation; every audit record carries the mode in force.

5. **Replace** the step-5 tail (lines 441-444) with the three-way decision:
   ```js
   // 5. Enforcement mode decides — and ONLY here. The guards above (ledger,
   //    verify evidence) already returned; they are absolute at every mode.
   if (mode === 'off') {
     return allow('off-allow', { tool, target_file: targetFile, project_root: root,
       project_is_ctoc: true, mode, mode_source: modeSource });
   }
   if (mode === 'soft') {
     process.stderr.write(buildSoftWarnMessage(
       'no active plan covers this file and no escape phrase used',
       { target_file: targetFile, project_root: root, mode_source: modeSource }));
     return allow('soft-warn', { tool, target_file: targetFile, project_root: root,
       project_is_ctoc: true, mode, mode_source: modeSource });
   }
   return block('no active plan covers this file and no escape phrase used', {
     tool, target_file: targetFile, project_root: root, mode, mode_source: modeSource,
   });
   ```
   `off` allows silently (that is what the human asked for); `soft` warns on stderr —
   stdout stays free of any decision JSON in both cases, so the harness sees a plain
   allow.

6. **Update** `module.exports` (line 452) to add `buildSoftWarnMessage`.

**Unchanged:** the ledger deny, the verify-evidence deny, the whitelist, the CTOC
detection, the coverage match, the escape-phrase path, `emitDeny` signalling, the
fail-open `catch`, and every exit code.

---

### File: `src/hooks/PreToolUse.Task.js`
**Action:** MODIFY
**Purpose:** The comment at :26-28 becomes false the moment Step 10 lands. Correct it rather than leave a second stale-documentation defect behind.

#### Changes

- **Replace** the `ENFORCEMENT MODE.` paragraph (lines 26-28) with an affirmative
  statement: the sibling edit hooks now honor `enforcement.mode`, and this hook
  deliberately does NOT, for the same reason it has no escape hatch (lines 30-43) —
  the five-subagent cap is a **resource** limit, not process ceremony. Setting
  `mode: off` cannot conjure a sixth execution context, so honoring it here would
  grant a launch without a slot and corrupt the slot accounting exactly as an escape
  phrase would.

Comment-only. No behavior change. No export change.

---

### File: `src/lib/enforcement-log.js`
**Action:** MODIFY
**Purpose:** Its header (lines 4-6) enumerates the outcome vocabulary; Step 10 adds two. Leaving it stale would be this slice's own defect in miniature.

#### Changes

- **Update** the header comment's outcome list to
  `allow, block, escape, silent-passthrough, hook-broken, soft-warn, off-allow`, with
  one line noting that every entry now also carries `mode` and `mode_source` so an
  audit can distinguish a **permitted** edit (`allow` + `plan_matched`) from an
  **unenforced** one (`off-allow`, `plan_matched: null`).

Comment-only. `logEnforcement` is schema-free (`{ timestamp, ...entry }`), so no code
change is required for the new fields.

---

### File: `CLAUDE.md`
**Action:** MODIFY

#### Changes

- **Rewrite** the `**Per-project tuning**` block (lines 140-144) to state the real
  behavior: the resolved mode is consulted at exactly one point — step 5 of the edit
  flow — and describe each value (`strict` blocks, `soft` warns on stderr and allows,
  `off` allows silently). State the four-tier resolution order. State the floor
  explicitly: **`off` never weakens a human gate, never relaxes the approval-ledger or
  verify-evidence deny, and never touches any Bash security deny** — asserted by
  `tests/enforcement-mode.test.js`. State that an unreadable or malformed setting
  resolves to `strict`.
- **Amend** step 5 of the numbered flow (line 136) to read "Otherwise — decided by
  `enforcement.mode`" rather than an unconditional BLOCK.
- **Amend** line 138 to note the log now records the mode in force.
- **Correct** line 146: it claims profiles tune "enforcement strictness, auto-push,
  default model, and log verbosity". Enforcement strictness (`dev` → `soft`) and
  default model (`prod` → `opus`) are real; **auto-push is false** — no profile may
  set `git.autoPushEnabled` and `environment-mode.test.js:126-135` forbids it — and
  **log verbosity is false** — no such key exists in `SETTINGS_SCHEMA`. Narrow the
  sentence to the two true items. In scope: leaving a false claim in the paragraph
  being made honest repeats the defect.

---

### File: `.ctoc/templates/CLAUDE.md.template`
**Action:** MODIFY

#### Changes

- **Add** a short `### Enforcement Mode` subsection immediately after
  `### Escape Hatches` (line 65-67), outside the CTOC-managed lessons markers
  (lines 71-73 — those are rewritten by `/ctoc:update` and must not be touched).
  Contents: the `.ctoc/settings.yaml` snippet, one line per value, and the floor
  sentence ("`off` relaxes plan-coverage on file edits only; the four human gates,
  the approval ledger, and the security denies are unaffected at every mode").

The template currently says nothing about enforcement mode, so no false claim is
being carried — but every generated project gets a `settings.yaml` containing the
block (`init-project.js:509`), and a knob no generated `CLAUDE.md` explains is how
the original defect stayed invisible for so long.

---

### File: `docs/CONFIG_SOURCES.md`
**Action:** MODIFY

#### Changes

- **Amend** the "Where to change what" row (line 25) to name the reader
  (`src/lib/enforcement-mode.js`) and the fallback: when `enforcement.mode` is absent
  from `settings.yaml`, `settings.json` → `workflow.enforcementMode` and the
  environment profile apply, in that order.
- **Amend** the `settings.yaml` "Read by" cell (line 9) to name
  `src/lib/enforcement-mode.js` explicitly — it is now a real reader, which is what
  the row asserted before it was true.
- **Leave** "Possible future unification" (lines 35-39) untouched. Deferring that is
  the human's schedule decision, not this slice's.

### Test Plan: `tests/enforcement-mode.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`), `child_process.spawnSync` for the real-hook tests, `fs.mkdtempSync` fixtures under `os.tmpdir()`.

#### A. Resolution (real temp dirs, no mocks)

1. No `.ctoc/` at all → `{ mode: 'strict', source: 'default' }`
2. `settings.yaml` with `enforcement:\n  mode: soft` → `{ 'soft', 'settings.yaml' }`
3. `settings.yaml` with `mode: off` → `{ 'off', 'settings.yaml' }`
4. **FAIL CLOSED** — `settings.yaml` containing binary garbage / unbalanced quotes /
   truncated mid-key → `strict`. Explicitly asserts `notEqual(mode, 'off')`.
5. Invalid value `mode: yolo` → `strict` (unknown ⇒ absent, never permissive)
6. `mode: OFF ` (uppercase + trailing space) → `off` — legible human intent, normalized
7. No `settings.yaml`; `settings.json` `workflow.enforcementMode: 'soft'` → `{ 'soft', 'settings.json' }`
8. **Precedence** — `settings.yaml` `soft` + `settings.json` `strict` → `soft` (yaml wins)
9. `settings.json` `general.environment: 'dev'`, nothing explicit → `{ 'soft', 'environment-profile' }`
10. `general.environment: 'dev'` + explicit `workflow.enforcementMode: 'strict'` →
    `{ 'strict', 'settings.json' }` (mirrors `environment-mode.test.js:94-99`)
11. Nested-key rejection — `enforcement:\n  nested:\n    mode: off` → `strict`
12. Wrong-section rejection — `deployment:\n  mode: off` → `strict`
13. Unreadable `settings.json` (write a directory at that path) → resolver still
    returns a valid mode, never throws

#### B. The human's behavior — the REAL hook, spawned as the harness spawns it

Each test builds a temp project (`.ctoc/`, `plans/`, a `settings.yaml` with the mode
under test), spawns `node src/hooks/PreToolUse.Edit.js` with `cwd` set to it, pipes a
genuine PreToolUse payload on stdin, and inspects stdout / stderr / exit status.
Not a unit test of `enforce()` — the PI4 lesson: unit tests on the exported function
alone never exercised the stdin/delegate path that shipped broken.

14. **`strict` + plan-uncovered edit** → stdout carries the
    `permissionDecision: "deny"` JSON; stderr carries the BLOCKED banner. (Regression
    fence: today's behavior is unchanged when the setting is absent or `strict`.)
15. **`soft` + plan-uncovered edit** → **no** deny JSON on stdout; exit 0; stderr
    contains a warning naming the target file and the word `WARNING`; asserts the
    banner contains **no** canonical escape phrase (W08-s1 seeding).
16. **`off` + plan-uncovered edit** → exit 0, no deny JSON, no warning on stderr.
17. **`off` + a plan-COVERED edit** → still allowed, and the log entry carries
    `outcome: 'allow'` with a non-null `plan_matched` (no regression in the normal path).

#### C. The floor — the load-bearing assertions

18. **`off` + write to `.ctoc/approvals/x.json`** → **STILL DENIED**. Asserts the
    deny decision on stdout, not the message text (robust to concurrent edits).
19. **`off` + write to `.ctoc/state/verify/slug.json`** → **STILL DENIED** (Gate-3 evidence).
20. **`off` + `mv plans/todo/a.md plans/done/a.md`** via a spawned
    `src/hooks/PreToolUse.Bash.js` → **STILL DENIED** (a human-gate deny on a channel
    that never reads the mode).
21. **`off` + a ledger-forgery one-liner** (`node -e "require('./src/lib/approval-ledger')…"`)
    via the spawned Bash hook → **STILL DENIED** (security deny, absolute).
22. **Same invariant, asserted the same way as `environment-mode.test.js:148-156`** —
    for every key of `ENVIRONMENT_PROFILES`, a project set to that environment with
    nothing explicit resolves to a mode that is **never `off`**. The environment-profile
    tier can soften; it can never disable.

#### D. Audit legibility

23. After tests 14/15/16, read `.ctoc/logs/enforcement.json` via
    `enforcement-log.readLog(root)` and assert **every** entry carries a `mode` in
    `ENFORCEMENT_MODES` and a `mode_source` in the four labels.
24. Assert an audit can separate a **permitted** edit from an **unenforced** one:
    outcome `allow` + non-null `plan_matched` vs. outcome `off-allow` +
    `plan_matched: null` vs. outcome `soft-warn`.

#### E. Structural floor (source scan)

25. Scan every `.js` under `src/` for a require of `enforcement-mode`; assert the set
    of requiring files is **exactly** `['src/hooks/PreToolUse.Edit.js']`. The mode
    cannot have leaked into a gate path.
26. Read `src/hooks/human-gate-check.js` (read-only; not edited by this slice) and
    assert its source contains no `enforcement-mode` / `enforcement.mode` /
    `enforcementMode` reference — the human-gate hook is mode-blind by construction.
27. Read `src/hooks/PreToolUse.Bash.js` and assert the same. Its denies cannot be
    tuned because it never learns the mode exists.

#### Coverage targets

`src/lib/enforcement-mode.js` at or above the repo floor (`.ctoc/coverage-baseline.json`
`minPct` = **99**, scoped to `src/**`). Every branch of the four-tier chain and every
`catch` is exercised by tests 1-13. The floor is a ratchet: it may rise, never fall.

### Security Review

- [x] **Path traversal** — the only constructed paths are
  `path.join(projectRoot, '.ctoc', 'settings.yaml'|'settings.json')`; `projectRoot` is
  `process.cwd()` on the hook path. No user-controlled path segment.
- [x] **Input validation** — the parsed mode is checked against a frozen allowlist;
  anything else is discarded. `projectRoot` non-string ⇒ `catch` ⇒ `strict`.
- [x] **No secrets** — none read, logged, or written.
- [x] **Safe file operations** — read-only. This module writes nothing.
- [x] **Error messages** — the resolver emits none; no path or stack reaches a user.
- [x] **Prototype pollution** — the parser returns a string, never assigns into an
  object from file content. `settings.js:275-287` already rejects unsafe names on write.
- [x] **Command injection** — no `exec`/`execSync`/`spawn` in the module. The test's
  `spawnSync` uses `process.execPath` + an argv array, `shell: false`.
- [x] **ReDoS** — one linear per-line regex, no nested quantifier, no data-derived
  `RegExp`. Identical shape to the shipped `stop-test-gate.js:57`.
- [x] **Fail-closed** — every failure path resolves to the RESTRICTIVE value.
- [x] **Gate integrity** — `off` reaches exactly one decision point; tests 18-22 and
  25-27 prove the four human gates, the ledger, the verify evidence, and the Bash
  security denies are untouched at every mode.

### Cross-platform

`path.join` for every path; `safe-fs` for all I/O; no shell; the test resolves the
hook with `path.join(__dirname, '..', 'src', 'hooks', …)` and spawns via
`process.execPath`; fixtures under `os.tmpdir()` with `fs.mkdtempSync`. The flat
parser splits on `\n` after the existing `\r?\n`-tolerant handling
(`.replace(/#.*$/,'')` then `.trim()` absorbs a stray `\r`).

## Execution Plan

### Step 8: TEST
Write `tests/enforcement-mode.test.js` in full (all 27 cases, sections A-E) **before**
`src/lib/enforcement-mode.js` exists. Run it; confirm it fails RED for the right
reason (module not found / behavior absent), not on a fixture bug. Tests 14, 20, 21,
26 and 27 must pass GREEN immediately — they assert today's unchanged behavior and
are the regression fence.

### Step 9: PREPARE
Confirm `src/lib/settings.js` exports `getSetting`, `readRawSettings`,
`getEnvironment`, `getEnvironmentProfile` (all present, lines 336-353). Confirm
`.claude-plugin/hooks.json` registers `PreToolUse.Edit.js` and siblings. Confirm
`.ctoc/coverage-baseline.json` `minPct`. Create no directories — nothing new is needed.

### Step 10: IMPLEMENT
- `src/lib/enforcement-mode.js` — resolver, private flat parser, frozen mode list.
- `src/hooks/PreToolUse.Edit.js` — fail-soft require; `buildSoftWarnMessage`;
  `mode`/`mode_source` in `allow`/`block` log payloads; single resolution at the top of
  `enforce()` threaded through every decision; the three-way step-5 tail; export update.
  **This is the wiring — it ships here, not in a follow-up.**
- `src/hooks/PreToolUse.Task.js` — replace the now-false comment (26-28).
- `src/lib/enforcement-log.js` — outcome vocabulary + new fields in the header.

### Step 11: REVIEW
Verify the dependency direction (lib never imports a hook); that `enforcement-mode`
has exactly one production caller; that `mode` is read at exactly one decision point
and the ledger/verify guards still `return` before it can matter; that every failure
path lands on `strict`; that no export exists solely for a test.

### Step 12: OPTIMIZE
One resolution per hook invocation (two small reads), not one per decision. Confirm
no second `settings.yaml` read is introduced. Confirm the parser exits early on the
matched key rather than scanning the whole file.

### Step 13: SECURE
Walk the Security Review checklist above item by item against the written code.
Re-attack specifically: can any crafted `settings.yaml` yield `off` from an
unparseable file? Can a `mode:` key under another section be smuggled in? Can `off`
reach any deny other than step 5? Each answer must be backed by a test, not a comment.

### Step 14: VERIFY
Run the **FULL gate**: `npm test` (`src/scripts/test-gate.js` — the suite **plus** the
coverage floor and the zero-skipped gate). `node --test tests/*.test.js` is NOT
acceptable here: it bypasses both gates. Require `# fail 0`, 0 skipped, and coverage
at or above `minPct` scoped to `src/**`. Confirm `tests/environment-mode.test.js`,
`tests/settings.test.js`, `tests/ledger-forgery-closed.test.js` and the PreToolUse
hook suites all still pass unchanged.

### Step 15: DOCUMENT
`CLAUDE.md`, `.ctoc/templates/CLAUDE.md.template`, `docs/CONFIG_SOURCES.md` as
specified. JSDoc on every export of `enforcement-mode.js` with the fail-closed
contract stated in the module header.

### Step 16: FINAL-REVIEW
Confirm: the documentation now describes what the code does; the setting a human
types has a visible effect; `off` cannot touch a human gate (tests 18-22, 25-27); an
unreadable setting resolves to `strict` (test 4); every log entry names the mode in
force (tests 23-24); no stub, no TODO; the new module is reachable from a registered
hook in this same slice.

## Decisions Taken Under Ambiguity

1. **Canonical key = `.ctoc/settings.yaml` → `enforcement.mode`.** Not a new call —
   `docs/CONFIG_SOURCES.md:25` already ruled it, and `CONFIG_SOURCES.md:13-19` gives
   the architectural reason (hooks parse config without a YAML library). Overturning
   a settled, documented decision to chase the richer JSON store would move a
   safety-critical read for no gain.
2. **`workflow.enforcementMode` is retained as tiers 2-4, not deleted.** Deleting it
   would break `README.md:167`'s dev-softens-enforcement promise, strand the settings
   menu's select, and remove the subject of `environment-mode.test.js`'s safety
   invariant. Delegating to `settings.getSetting` makes both keys live and preserves
   the documented order by construction.
3. **An unrecognized mode value is treated as ABSENT, not as an error.** `mode: yolo`
   falls through to the next tier and ultimately to `strict`. Refusing to start would
   brick a session over a typo; defaulting to `off` would be the false-green pattern.
4. **`OFF` / ` off ` (case, whitespace) are accepted.** Fail-closed governs
   *unreadability*, not legible human intent. A human who types `OFF` meant `off`.
5. **The mode is resolved ONCE at the top of `enforce()` and threaded into every log
   entry**, rather than lazily at step 5. The brief requires every decision to record
   the mode in force so an audit can separate a permitted edit from an unenforced one;
   a lazy read would leave the whitelist and escape-phrase records blank.
6. **New log outcomes `soft-warn` and `off-allow` rather than overloading `allow`.**
   An audit must distinguish these at a glance; `outcome: 'allow', mode: 'off'` carries
   the same information only implicitly.
7. **`PreToolUse.Task.js` does NOT honor the mode.** The five-subagent cap is a
   resource limit; `mode: off` cannot conjure a sixth execution context, and honoring
   it would grant a launch without a slot and corrupt slot accounting exactly as an
   escape phrase would (its own lines 30-43 make this argument). Its stale comment is
   corrected to say this affirmatively.
8. **`PreToolUse.Bash.js` is untouched.** Its denies are security and human-gate
   denies, absolute at every mode. Immunity is proven by spawning it under `mode: off`
   (tests 20, 21) and by a source scan (test 27) — never by a comment.
9. **The flat parser stays module-private.** Exporting it for the test alone would be
   a dead export by this repo's own stated rule (`PreToolUse.Bash.js:769-774`); it is
   tested through `resolveEnforcementMode` against real temp-dir fixtures, which is
   also the stronger test.
10. **`CLAUDE.md:146`'s false claims about profiles tuning auto-push and log verbosity
    are corrected in the same edit.** No profile may set `git.autoPushEnabled`
    (`environment-mode.test.js:126-135` forbids it) and no `logVerbosity` key exists in
    `SETTINGS_SCHEMA`. Leaving a false claim in the very paragraph being made honest
    would repeat this slice's own defect.
11. **`src/lib/init-project.js` is NOT edited and is not in `files:`.** Its
    `enforcement:` block (lines 509-510) becomes correct the moment the resolver
    exists — it writes the canonical key with the canonical default. There is no
    second write path to clean up.
12. **Plan number 00069, derived manually.** `plan-numbering.nextImplementationPlanNumber`
    scans **only** `plans/implementation/`, whose highest prefix is `00065`, so it
    returns `00066` — already claimed by `plans/in-progress/00066-x9-…`. Reported
    below rather than worked around silently.

## Concurrency check

Cross-referenced against the reserved list. This plan declares **none** of
`src/lib/streaming-gate.js`, `src/lib/streaming-precompute.js`,
`agents/iron-loop/gate-critic.md`, `src/commands/menu.md`,
`tests/cache-freshness.test.js`, `src/hooks/human-gate-check.js`,
`src/scripts/ledger-backfill.js`, `src/lib/menu-screens.js`. `human-gate-check.js` and
`PreToolUse.Bash.js` are **read and spawned** by the test suite but never edited;
their assertions key on the deny **decision**, not on message text, so a concurrent
edit to either cannot break this slice.
