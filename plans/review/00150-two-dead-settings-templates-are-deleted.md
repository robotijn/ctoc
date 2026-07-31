---
approved_by: human
approved_at: 2026-07-20T09:18:53.869Z
gate_crossed: implementation → todo
title: "Two dead settings templates are deleted — the settings format has one encoding again"
type: implementation
parent_plan: none
depends_on: none
priority: high
program: fresh-repository-first-run
iron_loop: true
files:
  - ".ctoc/settings.yaml.template"
  - ".ctoc/templates/settings.yaml.template"
  - "tests/settings-format-single-encoding.test.js"
---

# Two dead settings templates are deleted

Two files on disk claim to describe the shape of `.ctoc/settings.yaml`:

- `.ctoc/settings.yaml.template`
- `.ctoc/templates/settings.yaml.template`

The real shape is produced by `generateSettings()` in `src/lib/init-project.js:504-542`.
The three have drifted. Neither template carries the `regulatory_regime:` block,
and that block is not decoration — its `active_profiles:` line is the ANCHOR that
`writeActiveProfiles` (`src/lib/compliance-regime.js:170`) replaces. A settings file
built from either template can never record a compliance answer, because the line
the writer targets does not exist.

## Verified: both templates are dead

Searched the WHOLE repository for `settings.yaml.template`. Exactly one match
outside the two files themselves:

```
plans/done/C1-pretooluse-enforcement-impl.md:212:8. [ ] Add `enforcement` block to `.ctoc/templates/settings.yaml.template`
```

That is a completed checklist item in a shipped plan — a historical record, not a
reader. **No source file, no test, no hook, no script, and no agent reads either
template.** Nothing copies from them; `initProject` calls `generateSettings()` and
writes the result directly (`init-project.js:693-696`).

So this is a deletion, not a reconciliation. If either had a live reader the
correct move would be the opposite one — delete the generator's duplicate
knowledge and make the generator read the template — but neither does.

## Why a dead template is worse than no template

It is a SECOND ENCODING of a format that has exactly one correct encoding. Nobody
reads it today, which means nothing catches it drifting; and the day somebody
adds a code path that copies a template instead of calling the generator, they
reproduce precisely the failure this program exists to fix. A stale template is a
loaded gun with the safety on and no label.

This is the same hazard this repository has been removing for two days: one truth,
one place. The `push:` block deletion recorded at `init-project.js:536-540` is the
established precedent — a visible knob wired to nothing is a placebo that lies.

## Implementation Details

### File: `.ctoc/settings.yaml.template`
**Action:** DELETE
**Purpose (before deletion):** none — no reader anywhere in the repository.

### File: `.ctoc/templates/settings.yaml.template`
**Action:** DELETE
**Purpose (before deletion):** none — no reader anywhere in the repository.

Nothing else is touched. `generateSettings()` is NOT edited by this slice; it is
already correct and already carries the anchor with a comment explaining why the
line must exist from day one (`init-project.js:512-521`).

### Wiring — the live call sites

This slice creates no module. It removes two files and adds one fence, and the
fence's live call site is the gated test run.

| change | live call site | root |
|---|---|---|
| `tests/settings-format-single-encoding.test.js` | `npm test` (`src/scripts/test-gate.js`) | the gated suite every build runs |

## Test Plan

### Tests: `tests/settings-format-single-encoding.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `node:assert`)

| # | Case | Assertion |
|---|---|---|
| 1 | **neither template exists** | `fs.existsSync` is false for both paths |
| 2 | **no second encoding may reappear** | glob `**/settings.yaml*.template` across the repository (excluding `plans/` and `node_modules/`) returns an EMPTY list |
| 3 | **the generator is the only encoding** | `generateSettings([], [])` output contains `enforcement:`, `regulatory_regime:` and `active_profiles:` — the three blocks a reader depends on |
| 4 | **the anchor the writer targets is present** | the generated text matches `/^[ \t]*active_profiles:.*\S/m` — an INLINE value, not a bare block-style key, because `writeActiveProfiles` refuses a block-style anchor (`compliance-regime.js:185-187`) |
| 5 | **a generated file round-trips through the reader of record** | write `generateSettings()` output to a temp project's `.ctoc/settings.yaml`, call `writeActiveProfiles(root, ['gdpr'])`, then read it back with `regulatory-regime.loadActiveProfiles` and assert `gdpr` is present |

Case 5 is the load-bearing one and it sets this program's verification standard:
**a write is proved by reading it back through the code that consumes it, never by
trusting the writer's own success flag.** Case 4 alone would pass on a file whose
anchor exists but whose format the reader rejects.

Case 2 is the ratchet. Deleting two files is a one-time act; case 2 is what makes
the deletion stay deleted.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm(root, { recursive: true, force: true })` in teardown.

## What this slice does NOT fix

- It does not change `generateSettings()`. If the generated format is wrong in some
  way not covered above, this slice does not find it.
- It does not fix the reason `.ctoc/settings.yaml` was ABSENT on the owner's fresh
  repository. That is the initialization defect, and it is the subject of the
  slices on the menu's initialization claim and the truthful dry run.
- It does not audit other templates under `.ctoc/templates/`. Only the two settings
  templates are in scope; a general template-liveness audit is a different slice
  and is not smuggled in here.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/settings-format-single-encoding.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1 and 2 MUST be red: both template files exist on disk today.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 9: PREPARE — re-read from disk before deleting: confirm with a repository-wide search that neither template has gained a reader since this plan was written. If EITHER has a live reader in `src/`, `tests/`, `.claude-plugin/` or `agents/`, STOP and report — the correct change is then the opposite one and this plan is wrong.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
  - `.ctoc/settings.yaml.template` — delete.
  - `.ctoc/templates/settings.yaml.template` — delete.
### Step 11: REVIEW — confirm no remaining file in `src/`, `tests/`, `agents/`, `skills/` or `.claude-plugin/` names either path. Confirm the plugin manifest does not ship them as assets. Confirm case 5 exercises the REAL reader (`regulatory-regime.loadActiveProfiles`) and not a local re-implementation of the parse.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 12: OPTIMIZE — nothing to optimize; this slice removes two files and adds one test. Confirm case 2's repository walk skips `node_modules/` and `plans/` so it stays fast and does not fail on historical plan text.
### Step 13: SECURE — deleting a file that a hook reads would be a denial of service against the enforcement path. Prove neither template is read by any hook: search `src/hooks/` for both basenames and record the empty result. Case 5 writes only inside a temporary directory created by the test.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 14: VERIFY — `node --test tests/settings-format-single-encoding.test.js tests/compliance-mode.test.js tests/init-project.test.js` green, then the full gated run `npm test`. Lint the new test file. No git operations.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 15: DOCUMENT — record in the test file's header WHY the fence exists: a dead second encoding of a format is a defect waiting for its first caller. Update the documented file counts in `CLAUDE.md` only if the gated run's count test demands it; if it does, add `CLAUDE.md` to this plan's `files:` rather than editing an undeclared file.
### Step 16: FINAL-REVIEW — report the files deleted, the verbatim red evidence, the verbatim green evidence, and every decision taken under ambiguity.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).

## Decisions Taken Under Ambiguity

1. **Delete rather than update.** Updating both templates to match the generator
   would leave three encodings of one format, which is the hazard itself. Making
   the generator READ a template would be defensible if a template had a reader —
   neither does, so the generator's in-code encoding is the only one with a
   demonstrated consumer and it stays.
2. **The `plans/done/` mention is left alone.** It is a historical record of a
   completed task. Rewriting it would be dishonest about what happened, and case 2
   excludes `plans/` for exactly that reason.
3. **Case 2 is a glob over the repository, not a fixed two-path check.** A fixed
   check would pass the moment somebody adds `settings.yaml.example.template` in a
   third location. The pattern catches the CLASS, which is what a ratchet is for.
4. **Case 5 proves the round trip through `loadActiveProfiles`, not through
   `activeProfiles`.** `loadActiveProfiles` in `src/lib/regulatory-regime.js` is the
   reader of record named in `compliance-regime.js:5-8`; asserting through it means
   the test fails if the generated format ever stops satisfying the real consumer.
5. **Cases 3–5 drive the generator through `initProject()`, not through a direct
   `generateSettings([], [])` call.** The Test Plan named `generateSettings([], [])`,
   but that function is NOT in `init-project.js`'s `module.exports` — calling it
   directly would require adding an export to `init-project.js`, a file this slice
   does not declare in `files:`. The faithful, no-undeclared-edit alternative is to
   run the REAL wired path: `initProject(tempRoot)` calls `generateSettings()` and
   writes the result to `<tempRoot>/.ctoc/settings.yaml` (`init-project.js:816-820`),
   and the test reads that produced text. This exercises the generator through the
   exact code that ships it — a stronger claim than calling the unexported helper in
   isolation — and gives case 5 the real settings file it needs to round-trip. Cases
   3 and 4 were already GREEN at Step 8 (TDD Red): the generator is correct today and
   this slice deliberately does not change it, so only the deletion assertions (cases
   1 and 2) were red. Those green-before-implementation cases are the fence locking
   already-shipped behavior, not banked coverage.
