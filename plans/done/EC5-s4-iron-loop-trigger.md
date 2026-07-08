---
approved_by: human
approved_at: 2026-07-08T20:25:27.921Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T19:25:50.845Z
gate_crossed: implementation → todo
---

---
title: "EC5-s4 — Iron Loop compliance trigger emission (no dispatch)"
type: implementation
parent_plan: EC5-iron-loop-integration
depends_on: none
files:
  - src/lib/iron-loop-compliance-trigger.js
  - tests/iron-loop-compliance-trigger.test.js
priority: MEDIUM
iron_loop: true
---

# EC5-s4 — Iron Loop compliance trigger emission (no dispatch)

## Context (why this slice exists)

The parent's load-bearing invariant (from the adversarial review, recorded in
`## Decisions Taken Under Ambiguity`): **library code MUST NOT dispatch agents.**
`iron-loop.js` communicates the trigger *condition* at the functional→implementation
boundary; CTO Chief (EC5-s5) reads it and dispatches. This slice builds the
library side of that seam: a small module that, given a `projectRoot`, evaluates
the two regime gates and produces a plain trigger-condition object (and writes it
to the plan's dispatch metadata) that CTO Chief consumes. It DISPATCHES NOTHING.

It is deliberately a SEPARATE module from `src/lib/iron-loop.js` (not an edit to
that file): the parent's `files:` listed `iron-loop.js`, but the real
`iron-loop.js` is the Integrator+Critic step-scoring engine — bolting a compliance
trigger onto it would violate single-responsibility and risk the step-label
validation logic. A dedicated `iron-loop-compliance-trigger.js` keeps the trigger
seam isolated and independently testable. (Documented choice — see Decisions.)

## Implementation Details

### Architecture Decision

**Emit a condition, never call an agent.** The module exports a pure evaluator
`evaluateComplianceTrigger(projectRoot)` returning
`{ runGdpr, runEuAiAct, dispatcher: 'cto-chief' }` and a writer
`writeComplianceTrigger(planPath, projectRoot)` that persists that object into the
plan's YAML frontmatter under a `compliance_trigger:` key (a TARGETED single-key
write that leaves the rest of the frontmatter byte-identical, mirroring
`compliance-regime.js:writeActiveProfiles`'s surgical-replacement discipline). The
`dispatcher: 'cto-chief'` field is the machine-checkable proof that dispatch is
delegated — `iron-loop` never sets `dispatcher: 'iron-loop'`.

The gates are read via `compliance-regime.js` (`shouldRunGdpr`,
`shouldRunEuAiAct`) — one source of truth, no re-implementation. This module
imports NOTHING from hooks or commands and does not import an agent runner (that
would be dispatch-adjacent); it stays purely on the "emit a condition" side.

### Dependency Graph

```
src/lib/iron-loop-compliance-trigger.js
  --imports--> src/lib/compliance-regime.js   (shouldRunGdpr, shouldRunEuAiAct) [exists]
  --imports--> src/lib/safe-fs.js             (targeted frontmatter read/write) [exists]
  --tested-by--> tests/iron-loop-compliance-trigger.test.js
```

No sibling-slice dependency. No cycle. Depth 1. (Consumed by EC5-s5.)

### File Specifications

#### File: `src/lib/iron-loop-compliance-trigger.js`
**Action:** CREATE
**Purpose:** Library-side compliance trigger emitter for the
functional→implementation boundary. Emits a condition object and writes it to the
plan's dispatch metadata; dispatches NOTHING (CTO Chief dispatches).
**Change Type:** new-module

##### Exports
- `evaluateComplianceTrigger(projectRoot: string)` → returns
  `{ runGdpr: boolean, runEuAiAct: boolean, dispatcher: 'cto-chief' }`
  - Description: reads both regime gates; `dispatcher` is ALWAYS the literal
    `'cto-chief'` (never `'iron-loop'`). Non-string root ⇒
    `{ runGdpr:false, runEuAiAct:false, dispatcher:'cto-chief' }`.
  - Throws: never (gates fail open to `false`).
- `writeComplianceTrigger(planPath: string, projectRoot: string)` → returns
  `{ ok: boolean, trigger: object }`
  - Description: computes `evaluateComplianceTrigger(projectRoot)` and writes it
    into `planPath`'s YAML frontmatter under `compliance_trigger:` via a targeted
    replacement (add the key if absent, replace its block if present), leaving all
    other frontmatter untouched. Never rewrites the body.
  - Fail-open: missing plan file, no frontmatter block, or any fs error ⇒
    `{ ok:false, trigger }` without corrupting the file.

##### Dependencies (imports)
- `const { shouldRunGdpr, shouldRunEuAiAct } = require('./compliance-regime');`
- `const safeFs = require('./safe-fs');`
- `const path = require('path');` (only if needed for reads; the writer receives
  an absolute `planPath`)

##### Called By
- `agents/coordinator/cto-chief.md` reads the emitted `compliance_trigger:` and
  acts on it (EC5-s5).
- `tests/iron-loop-compliance-trigger.test.js`.

##### Data Flow
```
evaluateComplianceTrigger(projectRoot)
  --> { runGdpr: shouldRunGdpr(projectRoot),
        runEuAiAct: shouldRunEuAiAct(projectRoot),
        dispatcher: 'cto-chief' }

writeComplianceTrigger(planPath, projectRoot)
  --> trigger = evaluateComplianceTrigger(projectRoot)
  --> read planPath frontmatter (fail-open if absent)
  --> targeted upsert of `compliance_trigger:` block (surgical; other keys byte-identical)
  --> safeFs.writeFileSync(planPath, updated)
  --> { ok, trigger }
```

##### Error Handling
- Non-string `projectRoot`: gates return `false` (fail-open) ⇒ trigger with both
  `false`, `dispatcher:'cto-chief'`.
- Missing plan file / no frontmatter / fs error in the writer ⇒ `{ ok:false }`,
  no corruption.

##### Cross-Platform Notes
- `safeFs` for all reads/writes; CRLF-tolerant frontmatter regex (`\r?\n`); no
  hardcoded separators. `'use strict';`.

### Test Plan

#### Tests: `tests/iron-loop-compliance-trigger.test.js`
**Action:** CREATE
**Framework:** `node:test`. Use REAL gates against a tmp project with a real
`.ctoc/settings.yaml` + regime YAMLs, and a REAL tmp plan file for the writer.

##### Test Cases
1. **Both profiles active ⇒ `{runGdpr:true, runEuAiAct:true, dispatcher:'cto-chief'}`.**
2. **GDPR only ⇒ `{runGdpr:true, runEuAiAct:false, dispatcher:'cto-chief'}`.**
3. **Neither ⇒ `{runGdpr:false, runEuAiAct:false, dispatcher:'cto-chief'}`.**
4. **`dispatcher` is ALWAYS `'cto-chief'`, never `'iron-loop'`** — assert across
   all profile combinations; also `grep` the module source and assert the string
   `'iron-loop'` is NEVER assigned as a `dispatcher` value.
5. **`writeComplianceTrigger` upserts the key surgically.** Given a tmp plan with
   frontmatter containing `title:` and `status:`, after the write those keys are
   byte-identical and a `compliance_trigger:` block is present with the expected
   values; the body below the frontmatter is unchanged.
6. **Re-write replaces, does not duplicate.** Calling `writeComplianceTrigger`
   twice ⇒ exactly ONE `compliance_trigger:` block in the frontmatter.
7. **Fail-open: missing plan file ⇒ `{ok:false}`, no throw, no file created.**
8. **Fail-open: plan with no frontmatter ⇒ `{ok:false}`, file unchanged.**
9. **NO-DISPATCH invariant (load-bearing).** `grep` the module source: it does
   NOT `require` any agent runner (`gdpr-agent-runner`, `eu-ai-act-agent-runner`,
   `compliance-integration`), does NOT import the Task tool, and contains no call
   that would run an agent. Library code emits a condition only.
10. **GATE-INVARIANT (load-bearing).** Read `src/hooks/human-gate-check.js`
    source: assert `HUMAN_GATES` still has exactly 3 destination keys
    (`implementation`, `todo`, `done`). Assert this module's source names NO gate
    key (`HUMAN_GATES`, `requireReviewGate`, `enforcementMode`, `review_gate` ⇒
    zero matches) and does not `require('../hooks/...')` — the trigger emitter
    touches no gate.

##### Coverage Targets
- Line ≥ 80%, branch ≥ 80% (all profile combos, upsert vs replace, both fail-open
  writer branches).

### Security Review

- [x] Path traversal: `planPath` is an absolute path supplied by the caller;
      writes only to that path via `safeFs`. No user-controlled path concatenation.
- [x] Input validation: non-string root fails open; missing file / no frontmatter
      handled without corruption.
- [x] No secrets.
- [x] Safe file operations: targeted single-key frontmatter upsert; body never
      rewritten; static (non-dynamic) frontmatter regex.
- [x] Error messages: no leaks; fail-open returns rather than throwing.
- [x] Prototype pollution: trigger object built from literals only.
- [x] Command injection: none.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write `tests/iron-loop-compliance-trigger.test.js` covering cases 1–10 above
- [x] Include the NO-DISPATCH invariant (case 9) and the GATE-INVARIANT (case 10)
- [x] Test error conditions (missing file, no frontmatter, non-string root)
- [x] Run tests — expect RED (module does not exist yet)

### Step 9: PREPARE
- [x] Confirm `compliance-regime.js` exports `shouldRunGdpr` / `shouldRunEuAiAct`
- [x] Confirm `safe-fs` read/write helpers
- [x] No dependencies to install

### Step 10: IMPLEMENT
- [x] Create `src/lib/iron-loop-compliance-trigger.js`
- [x] `evaluateComplianceTrigger` (always `dispatcher:'cto-chief'`)
- [x] `writeComplianceTrigger` — surgical `compliance_trigger:` frontmatter upsert
- [x] Export `{ evaluateComplianceTrigger, writeComplianceTrigger }`

### Step 11: REVIEW
- [x] Self-review: NO agent runner imported; NO dispatch call anywhere
- [x] Verify the writer never rewrites the body and never touches other frontmatter keys
- [x] Verify no gate key referenced

### Step 12: OPTIMIZE
- [x] Single frontmatter read + single write; no repeated file I/O

### Step 13: SECURE
- [x] Static frontmatter regex (no dynamic RegExp from untrusted input)
- [x] No secrets; write only to the supplied plan path

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests: `node --test tests/iron-loop-compliance-trigger.test.js`
- [x] Coverage ≥ 80%; 0 skipped, 0 flaky
- [x] Confirm NO-DISPATCH + gate-invariant tests pass

### Step 15: DOCUMENT
- [x] JSDoc on both exports; module header documenting "emit a condition, never dispatch"
- [x] Record the "separate module, not an edit to iron-loop.js" choice in Decisions

### Step 16: FINAL-REVIEW
- [x] Verify Steps 8–15 completed
- [x] Trigger-emission + no-dispatch + gate-invariant all green
- [x] Ready for human review

## Decisions Taken Under Ambiguity

- **Separate module, not an edit to `src/lib/iron-loop.js`.** The parent `files:`
  named `iron-loop.js`, but the real file is the Integrator+Critic step-scoring
  engine (step-label validation, 5-dimension scoring). Adding compliance-trigger
  logic there would violate single-responsibility and risk the load-bearing
  step-label validation. A dedicated `iron-loop-compliance-trigger.js` isolates
  the trigger seam and keeps it independently testable. If the reviewer prefers a
  thin re-export from `iron-loop.js`, that is a one-line follow-up; the logic
  stays here.

- **Line-based frontmatter upsert instead of a single block regex (Step 14
  lint kickback).** The first implementation used one regex
  (`compliance_trigger:` header + `(?:\r?\n[ \t]+...)*` child lines) to match
  the block to replace. `eslint security/detect-unsafe-regex` flagged it as a
  potential ReDoS. Rewrote `upsertTriggerBlock` line-by-line (find the header
  index, consume the following indented child lines, splice in the new block) —
  no backtracking, mirrors `regulatory-regime.js`'s ReDoS-safe line parsing.
  Lint returns to exit 0.

- **Function-form `String.replace` for the frontmatter splice.** `content.replace(fm[0], newFrontmatter)`
  as a STRING would interpret `$&`/`$1`/`$$` in any user frontmatter as
  replacement patterns and corrupt the file. Switched to a function replacement
  (`() => rebuilt`) so every `$` is treated literally. The rendered
  `compliance_trigger:` block itself contains only booleans + the fixed literal
  `cto-chief`, so it is injection-free by construction; the guard protects the
  surrounding frontmatter.

- **Doc-comment wording avoids the forbidden `dispatcher:'iron-loop'` literal.**
  The NO-DISPATCH test greps the source for `dispatcher\s*:\s*['"]iron-loop['"]`
  to prove the module never assigns that value. A prose reference to the
  forbidden literal in a JSDoc comment tripped it (a legitimate source-level
  invariant catching a documentation string). Reworded the comments to say "the
  Iron Loop itself" rather than quoting the literal — the invariant now cleanly
  distinguishes assignment from prose.

## Verification (EC5-s4, executed)

- RED→GREEN: with only the test present, `require('../src/lib/iron-loop-compliance-trigger')`
  failed (module absent) → 1 fail; after IMPLEMENT → 17 pass, 0 fail.
- `node --test tests/iron-loop-compliance-trigger.test.js` → tests 17, pass 17, fail 0.
- Emitted trigger shape: `{ runGdpr: boolean, runEuAiAct: boolean, dispatcher: 'cto-chief' }`;
  frontmatter block:
  `compliance_trigger:` / `  runGdpr: <bool>` / `  runEuAiAct: <bool>` / `  dispatcher: cto-chief`.
- `dispatcher: 'cto-chief'` proof: asserted across all four profile combos
  (both / gdpr-only / eu-ai-act-only / neither) AND `assert.notEqual(..., 'iron-loop')`;
  source-grep asserts `dispatcher:'iron-loop'` is never assigned and `dispatcher:'cto-chief'` is.
- Dispatches-nothing proof: source-grep asserts NO require of any
  agent/dispatch/runner module (incl. gdpr-agent-runner, eu-ai-act-agent-runner,
  compliance-integration), no `child_process`/`spawn`/`exec`, no `Task`, and no
  `renameSync`/`unlink` (no plan move/delete). The module only returns a
  descriptor and, in the writer, does a single targeted frontmatter write.
- `node --test tests/*.test.js` → tests 3354, pass 3354, fail 0, skipped 0.
  `iron-loop.js` md5 unchanged (8358040a264d243aebd7da60d28f0fe6); its 49 tests green.
- `npx eslint . --max-warnings 0` → exit 0. `tsc --noEmit` baseline-neutral
  (89 pre-existing errors, 0 in the new file).
- Count bump: src/lib 121→122; README structure line + `tests/readme-numbers.test.js`
  (two assertions) updated to 122; readme-numbers suite green.
- Coverage (new module): 98.27% line / 91.67% branch / 100% function — ≥80%.
- Gate invariant: `HUMAN_GATES` still has exactly `implementation`, `todo`,
  `done`; module names no gate key (HUMAN_GATES/requireReviewGate/enforcementMode/review_gate)
  and requires no hook.
