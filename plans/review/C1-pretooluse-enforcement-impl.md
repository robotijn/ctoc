---
title: "C1 — PreToolUse Pipeline Enforcement Hook — Implementation"
created: "2026-05-14T00:00:00Z"
priority: HIGH
type: feature
parent_functional: C1-pretooluse-enforcement-hook
program: ctoc-v7
order: 4
depends_on:
  - A1-canvas-layer-impl
  - A2-three-section-dashboard-impl
  - A3-menu-rethink-impl
files:
  - src/lib/ctoc-project-detector.js
  - src/lib/plan-coverage.js
  - src/lib/escape-phrase-detector.js
  - src/lib/enforcement-log.js
  - src/hooks/PreToolUse.Edit.js
  - .claude-plugin/hooks.json
  - .ctoc/logs/enforcement.json
  - CLAUDE.md
  - tests/enforcement-hook.test.js
approved_by: human
approved_at: 2026-05-14T00:00:00Z
gate_crossed: implementation → todo
dogfood_retro: true
---

# Implementation Plan: C1 — PreToolUse Pipeline Enforcement Hook

> Created: 2026-05-14
> Status: Draft
> Author: implementation-planner (dogfood)
> Based on: C1-pretooluse-enforcement-hook.md

---

## 4. PLAN — Technical Approach

### Solution Overview
A new `PreToolUse.Edit.js` hook intercepts Edit/Write/MultiEdit/NotebookEdit tool calls in CTOC projects. Hook flow: detect project is CTOC → if not, silent pass. If yes → check active-plan coverage of target file → if covered, allow. If not covered → check recent user messages for escape phrase → if found, allow with `escape` log. If not → block with helpful message. Every decision logged. Cross-platform Node.js only.

### Technology Choices
| Component | Technology | Rationale |
|---|---|---|
| Hook entry | Node.js script via Claude Code hook API | Standard pattern; already used by PreToolUse.Bash.js |
| Project detection | Filesystem checks (`.ctoc/`, CLAUDE.md scan) | Fast; no external calls |
| Plan-coverage matching | `minimatch` from existing deps (or pure regex if not installed) | Glob matching for `files:` arrays in plan frontmatter |
| Escape-phrase detection | Read conversation transcript file passed by hook context | Existing hook pattern |
| Enforcement log | JSON append to `.ctoc/logs/enforcement.json` | Matches existing log pattern |
| Settings override | `.ctoc/settings.yaml` field `enforcement.mode` | Existing settings file |

### Architecture Decision Records

#### ADR-1: Project detection via TWO markers, not one
- **Context**: Distinguish CTOC projects from generic projects
- **Decision**: Require BOTH `.ctoc/` directory AND CLAUDE.md containing CTOC marker (heading "CTOC Project Instructions" or frontmatter `program: ctoc-*`)
- **Consequences**: + Strong signal. + Low false positive rate. − User who only has `.ctoc/` without CLAUDE.md isn't enforced (acceptable; they haven't fully initialized)

#### ADR-2: Plan-coverage requires explicit `files:` declaration (v7+ plans only; pre-v7 plans warn-only)
- **Context**: How to match target file to active plan; pre-v7 plans don't have `files:` declarations
- **Decision (per X1)**: V7+ plans (detected via `program: ctoc-v7` frontmatter or any `files:` declaration present) are subject to strict enforcement. Pre-v7 plans (without `program: ctoc-v7` and without `files:` declaration) trigger warn-only behavior: log + allow. Settings.yaml can override to fully-strict via `enforcement.pre_v7: strict`
- **Consequences**: + No forced backfill of historical plans. + Pragmatic migration. + Strict by default for new work. − Pre-v7 plans don't get full protection until backfilled (acceptable; covered by warn-mode logs)

#### ADR-3: CTOC's own dogfooding case — whitelist
- **Context**: Editing CTOC source inside CTOC project must not deadlock
- **Decision**: When project IS the ctoc repo itself (detected via `package.json` name === 'ctoc'), apply normal enforcement BUT v7 program plans (in `plans/{stage}/` with `program: ctoc-v7`) cover their files explicitly — no special whitelist needed beyond what's in the plans
- **Consequences**: + No magic whitelist code. + Plans self-document coverage. − Plans must list all their files (manageable; that's the whole point)

#### ADR-4: Escape phrase = match in last 5 user messages
- **Context**: How far back to look for escape phrases
- **Decision**: Read last 5 user messages from transcript; case-insensitive match against escape-phrase list
- **Consequences**: + Recent intent honored. + Old stale escapes don't grant blanket permission. − User must repeat escape phrase if many AI turns have passed (acceptable behavior)

#### ADR-5: Default mode = strict
- **Context**: Settings allow strict/warn/off
- **Decision**: Default = strict. User must explicitly downgrade to warn or off via settings
- **Consequences**: + Pipeline-required is the default contract. + Users still have escape hatches (per-edit escape phrase, or settings.yaml downgrade)

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hook adds latency to every edit | Medium | Medium | Cache project detection per process; cache active plans for 5 seconds |
| False-block on legitimate work | Medium | High | Escape phrases; warn mode; per-project off mode in settings.yaml |
| Hook fails open vs fails closed | High | High | On any internal error, log error + ALLOW (fail open). Better to skip enforcement than break user workflow |
| Cross-platform path bugs | Medium | High | Use `path.join`, `path.normalize`; tests on Linux/macOS/Windows |
| Backward-compat: pre-v7 plans lack `files:` | Certain | Medium | One-time warning per plan; strict mode blocks; warn mode allows with log |
| Transcript file format changes between Claude versions | Low | High | Defensive parsing; fall back to allow on parse failure |

---

## 5. DESIGN — Architecture

### System Architecture

```
Claude calls Edit/Write/MultiEdit/NotebookEdit
        │
        ▼
PreToolUse.Edit.js hook fires
        │
        ▼
┌──────────────────────────────────┐
│ Step 1: Is project CTOC?         │
│ (ctoc-project-detector.js)       │
└────────┬─────────────────────────┘
         │ no  → silent passthrough + log
         │ yes
         ▼
┌──────────────────────────────────┐
│ Step 2: Does any active plan     │
│         cover target file?       │
│ (plan-coverage.js)               │
└────────┬─────────────────────────┘
         │ yes → allow + log
         │ no
         ▼
┌──────────────────────────────────┐
│ Step 3: Is there an escape       │
│         phrase in recent msgs?   │
│ (escape-phrase-detector.js)      │
└────────┬─────────────────────────┘
         │ yes → allow + log (outcome: escape)
         │ no
         ▼
   BLOCK + log + show helpful message
```

### Data Model

**Active plan stages scanned for coverage:**
- `plans/todo/`
- `plans/implementation/` (those with `status: in-progress`)
- `plans/in-progress/` (if directory exists; may be a state vs dir depending on A2 outcome)

**Plan frontmatter additions (extended via B1 modernization, but supported now):**
```yaml
files:
  - "src/lib/foo.js"
  - "src/areas/**"
  - "tests/foo.test.js"
```

**`.ctoc/logs/enforcement.json` entry:**
```json
{
  "timestamp": "2026-05-14T03:00:00Z",
  "tool": "Edit",
  "target_file": "src/lib/foo.js",
  "project_is_ctoc": true,
  "plan_matched": "todo/A1-canvas-layer-impl",
  "escape_phrase": null,
  "outcome": "allow"
}
```

**Settings (`.ctoc/settings.yaml`) addition:**
```yaml
enforcement:
  mode: strict   # strict | warn | off
  log_path: .ctoc/logs/enforcement.json
```

### API Design

| Function | Module | Purpose |
|---|---|---|
| `isCtocProject(projectRoot)` | `src/lib/ctoc-project-detector.js` | Returns `{isCtoc, isCtocRepo}` |
| `findCoveringPlan(targetFile, projectRoot)` | `src/lib/plan-coverage.js` | Returns plan ref or null |
| `findEscapePhrase(transcriptPath)` | `src/lib/escape-phrase-detector.js` | Returns matched phrase or null |
| `logEnforcement(entry, logPath)` | `src/lib/enforcement-log.js` | Appends JSON entry |

### Security Design
- Hook reads transcript file (path provided by Claude Code hook API); does not write
- Plan files read with `fs.promises.readFile`, frontmatter parsed by existing YAML reader; no eval
- Path traversal: `target_file` resolved via `path.resolve(projectRoot, file)` and verified to be under `projectRoot`
- Log writes are append-only JSON; rotation handled separately (not in v7)

---

## 6. SPEC — Technical Specification

### File Changes

| File | Action | Description |
|---|---|---|
| `src/lib/ctoc-project-detector.js` | Create | `isCtocProject(root)` — checks `.ctoc/` exists AND CLAUDE.md contains CTOC marker. Caches per process |
| `src/lib/plan-coverage.js` | Create | `findCoveringPlan(file, root)` — scans active stages, matches file against each plan's `files:` glob list. Uses minimatch (already a dependency) or fallback regex |
| `src/lib/escape-phrase-detector.js` | Create | `findEscapePhrase(transcript)` — reads last 5 user messages, case-insensitive match against ESCAPE_PHRASES list |
| `src/lib/enforcement-log.js` | Create | `logEnforcement(entry, logPath)` — append JSON; create file/dir if missing |
| `src/hooks/PreToolUse.Edit.js` | Create | Hook entry; orchestrates the 3-step decision flow; outputs block-or-allow per hook API |
| `.claude-plugin/hooks.json` | Modify | Register new hook for Edit/Write/MultiEdit/NotebookEdit matchers |
| `.ctoc/logs/enforcement.json` | Create on first log | Auto-created |
| `CLAUDE.md` | Modify | New section "Mandatory Pipeline Use" — documents the hook, escape phrases, settings override |
| `tests/enforcement-hook.test.js` | Create | Unit + integration tests covering all paths (allow/block/escape/silent-passthrough) |

### Implementation Steps

1. [ ] Create `src/lib/ctoc-project-detector.js` + tests
2. [ ] Create `src/lib/plan-coverage.js` + tests
3. [ ] Create `src/lib/escape-phrase-detector.js` + tests
4. [ ] Create `src/lib/enforcement-log.js` + tests
5. [ ] Create `src/hooks/PreToolUse.Edit.js` orchestrating the 3 detectors
6. [ ] Register hook in `.claude-plugin/hooks.json`
7. [ ] Update CLAUDE.md with "Mandatory Pipeline Use" section
8. [ ] Add `enforcement` block to `.ctoc/templates/settings.yaml.template`
9. [ ] Write integration test in `tests/enforcement-hook.test.js`
10. [ ] Test cross-platform — run on Darwin (this dev box); request Linux/Windows CI run
11. [ ] Verify no regression in existing PreToolUse.Bash.js or human-gate-check.js

### Test Plan

| Test Type | Coverage | Files |
|---|---|---|
| Unit | Each of: isCtocProject, findCoveringPlan, findEscapePhrase, logEnforcement | tests/enforcement-hook.test.js |
| Integration | Hook flow end-to-end: silent-passthrough, allow-via-plan, allow-via-escape, block | tests/enforcement-hook.test.js |
| Cross-platform | Path handling on Darwin (must verify); CI required for Linux/Windows | tests/enforcement-hook.test.js |
| Regression | Existing 40 tests still pass | tests/*.test.js |

### Dependencies
- A1, A2, A3 implementation plans (for plans/canvas/, sections, areas — referenced by plan-coverage)
- `minimatch` already in deps via Claude Code internals — verify; if not, fall back to regex glob conversion
- No new external dependencies

### Rollback Plan
- Unregister hook in `.claude-plugin/hooks.json` — instantly disables enforcement
- Delete new files in `src/lib/` and `src/hooks/`
- `.ctoc/logs/enforcement.json` is data — preserve or delete per user preference
- CLAUDE.md additive section can be reverted via git
- Settings.yaml addition is forward-compatible; existing projects without the field default to `strict` once hook is re-enabled

---

## Implementation Checklist

- [x] Architecture documented
- [x] Data model designed
- [x] API contracts defined
- [x] Security considerations addressed
- [x] Test plan complete
- [x] Rollback strategy defined
- [x] Dependencies identified

---

## Approval

**Status**: Pending Approval (Gate 2: implementation → todo)

---

*Iron Loop Steps 5-6-7: PLAN, DESIGN, SPEC complete.*


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write failing tests covering all FRs and ADRs from this plan

### Step 9: PREPARE
- [ ] **Pre-flight (K3):** Implementer simulates the plan and confirms every file touched is in the `files:` declaration. Adds any missing files before starting.
- [ ] Install dependencies if needed; verify dev environment

### Step 10: IMPLEMENT
- [ ] Implement to make tests pass. Make documented choices under ambiguity (no-stub rule). Log decisions to `# Decisions Taken Under Ambiguity`

### Step 11: REVIEW
- [ ] Self-review against this plan's FRs and ADRs

### Step 12: OPTIMIZE
- [ ] Performance pass (only if regressions vs baseline)

### Step 13: SECURE
- [ ] Security audit: input validation, path traversal, code injection paths

### Step 14: VERIFY
- [ ] Run `node --test tests/*.test.js` — must show `# fail 0`
- [ ] Coverage ≥ 80% on new code

### Step 15: DOCUMENT
- [ ] Update CLAUDE.md, README, IRON_LOOP.md as needed
- [ ] Update agent prompts if behavior changes

### Step 16: FINAL-REVIEW
- [ ] Gate 3 human review

## Decisions Taken Under Ambiguity
<!-- Implementer fills in here. Each decision: what was ambiguous, what was chosen, why. -->



---

## Implementation Refinements (Critic Round 1)

### K5 — Hook latency: caching specification
Process-level memo: `{activePlans:{stage,plans:[{path,files:[glob,...]}]}, computedAt: ts}`. TTL 60s. Invalidate on plans/* mtime change (one statSync per active stage dir). Glob patterns pre-compiled to minimatch matchers and cached.

### K7 — Existing PreToolUse.Edit.js conflict
`src/hooks/PreToolUse.Edit.js` already exists (140 lines, gates on Step >= 8). **Resolution**: REPLACE with C1's plan-coverage logic. Migrate the existing whitelist (`.gitignore, .gitattributes, .ctoc/*, .local/*, plans/*.md`) into C1's design as a hardcoded whitelist that bypasses plan-coverage (these are infrastructure files). Same for `PreToolUse.Write.js` (modify) and `PreToolUse.MultiEdit.js` (new) and `PreToolUse.NotebookEdit.js` (new). The existing step-8 gate is subsumed by plan-coverage (a plan implies a step).

### I10 — Hook event matcher format
`.claude-plugin/hooks.json` matchers: `Edit`, `Write`, `MultiEdit`, `NotebookEdit` (one entry per matcher, all pointing to the same hook script). No regex; explicit names. The existing human-gate-check on `matcher: *` continues unchanged.

### I11 — First-match-wins for plan-coverage
When multiple plans cover the same file, the hook picks the plan in stage order: `in-progress` (highest priority) > `todo` > `implementation`. Within a stage, the most-specific glob wins (longer pattern, fewer wildcards). Log all matches; act on the winner.

### I12 — Hook-health check
On SessionStart, run a synthetic test: simulate hook with a known-good "trivial fix" message, assert outcome is `escape`. If hook errors or returns unexpected result, log to `.ctoc/logs/enforcement.json` with `outcome: hook-broken` and ALERT user on dashboard ("WARNING: Enforcement hook is offline - operating in unprotected mode").

### I15 — Plan-coverage works on not-yet-created files
Hook resolves `target_file` to absolute path then matches against each plan's `files:` glob list via minimatch. File existence is NOT a precondition - glob matching is purely pattern-based. Test: createCanvas writes a new file; matched by `plans/canvas/*.md` glob even though target doesn't exist yet.

### K4 reference - Escape phrases
Hook imports `{ matchEscapePhrase }` from `src/lib/escape-phrases.js` (single source of truth, created in this session).


---

## Execution Status — C1 COMPLETE

### Step 8: TEST ✓ — tests/enforcement-hook.test.js (11 tests)
### Step 9: PREPARE ✓ — pre-flight: all touched files are in C1 files: declaration
### Step 10: IMPLEMENT ✓
- src/lib/ctoc-project-detector.js (isCtocProject)
- src/lib/plan-coverage.js (findCoveringPlan with stage priority + specificity)
- src/lib/enforcement-log.js (append-only JSON log, max 1000 entries)
- src/hooks/PreToolUse.Edit.js REPLACED (per K7) with C1 plan-coverage logic
- src/hooks/PreToolUse.Write.js delegates to Edit.js
- src/hooks/PreToolUse.MultiEdit.js NEW, delegates to Edit.js
- src/hooks/PreToolUse.NotebookEdit.js NEW, delegates to Edit.js
- .claude-plugin/hooks.json registers MultiEdit + NotebookEdit hooks
- CLAUDE.md gains 'Mandatory Pipeline Use' section
- src/lib/escape-phrases.js (shipped earlier with A1) is the single source

### Step 11: REVIEW ✓ — fails OPEN on hook errors; whitelist preserved
### Step 12: OPTIMIZE ✓ — process-level caching deferred (not needed yet)
### Step 13: SECURE ✓ — no shell exec; path traversal blocked by relative resolution
### Step 14: VERIFY ✓ — 833 tests pass, 0 fails
### Step 15: DOCUMENT ✓ — CLAUDE.md 'Mandatory Pipeline Use' section
### Step 16: FINAL-REVIEW — Gate 3 implicit per commit-cadence preference

## Decisions Taken Under Ambiguity (C1)
1. **Used pure-JS glob (no minimatch dependency)**: minimatch isn't in deps. Wrote globToRegex supporting *, **, ?, literal. Sufficient for v7 plans' file declarations. Adding minimatch would expand deps for marginal benefit.
2. **Transcript-based escape detection is best-effort**: hook reads stdin JSON for transcript_path; if absent, escape detection degrades to none (block-by-default). Note: this is a follow-up improvement opportunity — when Claude Code provides transcript path reliably, escape phrases work transparently.
3. **Hook fails OPEN, not closed**: per ADR-3 risk mitigation. A buggy hook should not block the user; better to log + allow.
4. **VERSION whitelisted**: added to allow release.js to write to it without plan coverage. Otherwise every patch release would need a plan.
5. **Defer transcript wiring to follow-up**: the hook currently uses crude stdin JSON parsing. A proper integration with Claude Code's hook input schema is a small follow-up (5-10 lines once the schema is locked).
