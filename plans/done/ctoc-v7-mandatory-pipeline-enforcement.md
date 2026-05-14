---
title: "CTOC v7 — Mandatory Pipeline Enforcement (Vision C)"
created: "2026-05-14T00:00:00Z"
priority: HIGH
type: vision
status: draft
program: ctoc-v7
order: 2
siblings:
  - ctoc-v7-business-first-architecture
  - ctoc-v7-opus-47-modernization
depends_on:
  - ctoc-v7-business-first-architecture
approved_by: human
approved_at: 2026-05-14T00:00:00Z
gate_crossed: vision → done (decomposed)
dogfood_retro: true
status: decomposed
---

# CTOC v7 — Mandatory Pipeline Enforcement (Vision C)

## The Load-Bearing Principle

**If Claude is inside a CTOC project, the pipeline is not optional. Bypassing it means the implementer guesses. Guessing produces stubs. Stubs are the failure mode.**

Bypass exists only through explicit escape phrases (`hotfix`, `trivial fix`, `urgent`) — designed for the rare case where pipeline overhead exceeds the change cost. Default = pipeline-required.

## Problem Statement

CTOC builds context through the Iron Loop pipeline. Pre-todo stages exist to ensure the implementer has full context: vision (WHY), canvas (business model), functional (what + for whom), implementation (HOW). When this context-building is **bypassed**, the implementer is reduced to guessing — exactly the failure mode CTOC was designed to eliminate.

Today, nothing prevents Claude (or a user instructing Claude) from making Edit/Write changes without an active plan. The CLAUDE.md warns, but warnings are not enforcement. Hooks already exist for human gates, but no hook enforces **"every change must trace to an active plan."**

Result: Claude drifts into ad-hoc code edits in CTOC projects, undoing the whole reason the project adopted CTOC.

## Vision

A `PreToolUse` hook on Edit/Write/MultiEdit that:

1. Detects the project is CTOC-initialized (looks for `.ctoc/` and `CLAUDE.md` with CTOC markers)
2. Checks if the target file is covered by an **active plan** in `plans/todo/`, `plans/implementation/` (in-progress), or `plans/in-progress/`
3. If yes → allows the edit
4. If no → checks for an **escape phrase** in the current conversation (`hotfix`, `trivial fix`, `urgent`, `skip planning`, `skip iron loop`, `quick fix`, `trivial change`)
5. If no escape phrase → **blocks the edit** with a helpful message: "This file isn't covered by an active plan. Run `/ctoc:menu` to create one, or include an escape phrase if this is genuinely trivial."

The hook logs every block + every escape-phrase bypass to `.ctoc/logs/enforcement.json` so users can see when the system is fighting them vs. when it's catching real drift.

## Success Criteria

1. New file at `src/hooks/PreToolUse.Edit.js` (and equivalent for Write/MultiEdit) enforces "covered by an active plan OR escape phrase used"
2. Hook config registered in `.claude-plugin/hooks.json`
3. CTOC project detection is robust — false positive rate < 5% on non-CTOC projects (the hook silently passes if not in a CTOC project)
4. Escape phrases work in conversation context; documented in CLAUDE.md
5. Enforcement log at `.ctoc/logs/enforcement.json` captures: timestamp, target file, plan checked (or null), escape phrase used (or null), outcome (allow/block/escape)
6. Blocked operations show a one-screen message directing user to `/ctoc:menu`
7. Cross-platform: works on Windows, macOS, Linux (no bash, Node.js only)
8. Test coverage ≥ 80% on the new hook code
9. No regression: existing 3 human-gate hooks still pass

## Target Users

- **Claude (in a CTOC project)** — primary; this hook is the constraint Claude must respect
- **CTOC Chiefs** — secondary; the user benefits from knowing Claude can't drift
- **Teams adopting CTOC** — the hook is the trust mechanism: "the system actually enforces what it claims"

## Scope

**In scope:**
- PreToolUse hook for Edit, Write, MultiEdit, NotebookEdit
- CTOC project detection logic (probably `src/lib/ctoc-project-detector.js`)
- Plan-coverage check: read active-stage plan files, match by target file path or path glob
- Escape-phrase detection from conversation context (read recent user messages)
- Enforcement logging
- Documentation updates in CLAUDE.md

**Out of scope:**
- Enforcement for Bash tool calls (too broad; existing PreToolUse.Bash.js handles edit/commit enforcement separately)
- Auto-creating plans on block — user must explicitly route through `/ctoc:menu`
- Whole-team enforcement modes (per-user opt-out) — defer to a later vision
- Changes to existing human-gate hooks — those are separate concerns

## Key Decisions Already Made

- **Strict mode**: blocks ALL Edit/Write without active-plan coverage (not "only multi-file changes")
- **Escape phrases preserved** — they're the explicit opt-out, not a bug
- **Hook fires AFTER Vision A ships** — depends on the new section structure for plan-coverage lookup
- **CTOC project detection is silent** — non-CTOC projects don't see the hook at all

## Risks

| Risk | Mitigation |
|---|---|
| Hook blocks legitimate work and frustrates users | Escape phrases are simple to type; enforcement log shows when escapes are used a lot → signal to tune detection |
| Plan-coverage matching too strict (false-blocks edits inside a covered file) | Plan files declare `files:` glob list; matching is glob-based, not exact-path |
| Plan-coverage matching too lenient (passes things it shouldn't) | Default = strict glob match; require explicit file declaration in plan frontmatter |
| Hook breaks `/ctoc:menu` itself (chicken-and-egg) | CTOC's own dashboard commands and `src/commands/` paths are whitelisted from enforcement |
| Cross-platform shell issues in hook detection | Pure Node.js, no shell-outs; use `process.platform` for path differences |

## Open Questions (To Resolve During Functional Planning)

- Does plan-coverage match by file path, by directory, by glob, or by explicit declaration in plan frontmatter?
- How does the hook distinguish "user is dogfooding CTOC inside CTOC" vs "user is shipping CTOC v7"? (Both are CTOC projects — but the v7 development is itself a plan-covered activity.)
- Escape phrase scope: full conversation, last user message, or last N turns?
- Does the hook also block `Bash(git commit ...)` for changes outside an active plan, or is that already covered by `PreToolUse.Bash.js`?
- Per-project enforcement strictness setting in `.ctoc/settings.yaml` — yes or no?

## Dependencies

- Depends on [Vision A — business-first-architecture] (uses the new stage structure for plan-coverage lookup)
- Must land BEFORE [Vision B — opus-47-modernization] (B modernizes agents under the assumption that bypassing the pipeline is not possible)
- No external dependencies
