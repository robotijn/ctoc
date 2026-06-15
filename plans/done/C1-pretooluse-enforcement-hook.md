---
title: "C1 — PreToolUse Pipeline Enforcement Hook"
created: "2026-05-14T00:00:00Z"
approved_by: human
approved_at: "2026-06-15T00:00:00Z"
gate_crossed: "functional → done (shipped in v6.3.0; archived 2026-06-15)"
priority: HIGH
type: feature
parent_vision: ctoc-v7-mandatory-pipeline-enforcement
program: ctoc-v7
order: 3
depends_on:
  - A1-canvas-layer
  - A2-three-section-dashboard
---

# Functional Plan: C1 — PreToolUse Pipeline Enforcement Hook

> Created: 2026-05-14
> Status: Draft
> Author: vision-decomposer + product-owner (dogfood)

---

## 1. ASSESS — Problem Understanding

### Business Context
CTOC's value proposition rests on the Iron Loop building full context before implementation. Pre-todo stages exist *specifically* so the implementer never guesses. When users (or Claude) bypass the pipeline and make edits without an active plan, they reduce the implementer to guessing — exactly the failure mode CTOC was designed to eliminate. The CLAUDE.md warns about this; warnings are not enforcement.

### Current State
- Existing `src/hooks/PreToolUse.Bash.js` enforces edit/commit gates for the Bash tool
- Existing `src/hooks/human-gate-check.js` enforces the 3 human gates
- **No hook** enforces "every Edit/Write must trace to an active plan"
- Claude can freely Edit/Write any file in any CTOC project without invoking the pipeline
- Escape phrases exist in CLAUDE.md but have no enforcement counterpart that respects them

### Impact
- **Primary**: Claude drifts into ad-hoc edits, undoing the reason teams adopt CTOC
- **Secondary**: Teams have no enforcement mechanism to point new contributors at — "the system catches it" is currently aspirational
- **Tertiary**: Trust in CTOC as a *system* (vs. a *suggestion*) is weakened

---

## 2. ALIGN — Business Alignment

### Business Goals
1. Make pipeline bypass impossible without an explicit escape phrase
2. Preserve the escape-phrase pattern as the human-controlled opt-out
3. Make non-CTOC projects unaffected — the hook is silent there
4. Provide auditability — every block, every escape, every allow is logged

### Success Metrics
- [ ] **M1**: When inside a CTOC project with no active plan covering target file, Edit/Write/MultiEdit/NotebookEdit is blocked
- [ ] **M2**: Escape phrases (`hotfix`, `trivial fix`, `urgent`, `skip planning`, `skip iron loop`, `quick fix`, `trivial change`) in recent user messages allow the operation
- [ ] **M3**: Non-CTOC projects pass through the hook silently — zero observable behavior change
- [ ] **M4**: 100% of decisions logged to `.ctoc/logs/enforcement.json` with timestamp, target file, plan checked, escape phrase, outcome
- [ ] **M5**: Existing 3 human-gate hooks continue to pass

### Stakeholders
| Stakeholder | Role | Approval Needed |
|---|---|---|
| CTOC Chief (user) | Primary enforcement beneficiary | Yes (Gate 1) |
| Claude (in CTOC project) | Constrained party | Programmatic |
| Existing CTOC users (pre-v7) | Migration: hook starts enforcing on next session | Implicit via gradual rollout (warning mode first sprint, then block) |

### Constraints
- Cross-platform (Windows/macOS/Linux), Node.js only — no bash, no shell-outs
- Hook must complete in <50ms (otherwise it lags every tool call noticeably)
- Hook must not break `/ctoc:menu` itself — CTOC's own commands and `src/commands/` paths whitelisted
- Plan-coverage check must work with file path globs declared in plan frontmatter
- Backward-compat: pre-v7 plans without `files:` glob declarations get a default "block unless declared" policy with a one-time warning

---

## 3. CAPTURE — Requirements

### Functional Requirements
| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-1 | CTOC project detector | Must | `src/lib/ctoc-project-detector.js` returns `true` iff `.ctoc/` exists AND `CLAUDE.md` contains a CTOC marker (e.g., `# CTOC Project Instructions` heading or `program: ctoc-` frontmatter) |
| FR-2 | Plan-coverage matcher | Must | `src/lib/plan-coverage.js` reads active-stage plans (todo, implementation in-progress, in-progress) and matches target file against each plan's `files:` glob list. Returns the matching plan ref or null |
| FR-3 | Escape-phrase detector | Must | `src/lib/escape-phrase-detector.js` reads recent user messages (last 5 turns) and returns the matched escape phrase or null |
| FR-4 | PreToolUse.Edit hook | Must | `src/hooks/PreToolUse.Edit.js` covers Edit, Write, MultiEdit, NotebookEdit; runs all checks; blocks with helpful message or allows with log entry |
| FR-5 | Whitelist for CTOC's own paths | Must | Editing `src/`, `agents/`, `skills/`, `.ctoc/`, `.claude-plugin/` inside the CTOC project itself is allowed (dogfooding case); recognized via project-name detection |
| FR-6 | Enforcement log | Must | `.ctoc/logs/enforcement.json` schema: `[{timestamp, tool, target_file, project_is_ctoc, plan_matched, escape_phrase, outcome}]`. Outcome is one of `allow`, `block`, `escape`, `silent-passthrough` |
| FR-7 | Block message | Must | When blocked, hook outputs: "Edit blocked — no active plan covers `<path>`. Run `/ctoc:menu` to create one, or include an escape phrase (e.g., 'trivial fix') if this is genuinely small." |
| FR-8 | Hook registration | Must | `.claude-plugin/hooks.json` registers the new hook with correct event matchers |
| FR-9 | Settings override | Should | `.ctoc/settings.yaml` supports `enforcement.mode: strict|warn|off` for per-project tuning. Default: `strict`. `warn` logs but doesn't block. `off` disables the hook |
| FR-10 | Backward-compat warning | Should | First time a plan without `files:` declarations is checked, log a one-time warning: "Plan `<name>` has no `files:` declaration. Add one to enable plan-coverage matching." |

### Non-Functional Requirements
| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Performance | Hook completes in <50ms p95 |
| NFR-2 | Security | Hook does not execute code from plan files; only parses YAML/markdown |
| NFR-3 | Cross-platform | Tests pass on Darwin, Linux, Windows |
| NFR-4 | Test coverage | ≥80% on new code |
| NFR-5 | False-positive rate | <5% on a corpus of 10 non-CTOC projects (silent passthrough is correct) |

### User Stories
```
As Claude inside a CTOC project
I want my edits blocked when no plan covers them
So that I'm forced through the pipeline that builds context

As a CTOC Chief with an active plan covering src/foo.js
I want Claude to freely edit that file
So that the implementer can do its job without friction

As a CTOC Chief with a one-line typo fix
I want to type "trivial fix" and have the hook allow it
So that I don't have to ceremony-up a 30-second change

As a user opening CTOC in a non-CTOC project
I want zero observable hook behavior
So that CTOC's installation is non-invasive
```

### Out of Scope
- Enforcement for Bash tool (existing `PreToolUse.Bash.js` handles its own concerns)
- Auto-creating plans on block (user must explicitly route through `/ctoc:menu`)
- Whole-team policy modes (per-user opt-out)
- Plan-coverage UI editor (users edit plan frontmatter manually)
- Retroactive enforcement on historical edits

---

## Approval Checklist

- [ ] Business problem clearly defined
- [ ] Success metrics measurable
- [ ] Requirements complete and prioritized
- [ ] Stakeholders identified
- [ ] Constraints documented
- [ ] Scope boundaries clear

---

## Approval

**Status**: Pending Approval (Gate 1: functional → implementation)

---

*Iron Loop Steps 2-3-4: ASSESS, ALIGN, CAPTURE complete.*
