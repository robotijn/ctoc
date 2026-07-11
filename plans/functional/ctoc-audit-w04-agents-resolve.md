---
title: "W04 — Every Dispatched Agent Resolves"
created: "2026-07-11T00:00:00Z"
type: stub
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: HIGH
status: stub
depends_on: none
---

# W04 — Every Dispatched Agent Resolves

## Problem

The dispatch graph names agents that do not exist on disk. Every one of these is a
pointer into nothing:

- **10 of the 16 Iron Loop steps name an agent that exists nowhere:** `test-maker`
  (Step 8), `quality-checker` (Step 9), `implementer` (Step 10), `self-reviewer`
  (Step 11), `optimizer` (Step 12), `verifier` (Step 14), `documenter` (Step 15),
  `implementation-reviewer` (Step 16), `functional-reviewer` (Step 4), and
  `implementation-plan-reviewer` (Step 7).
- **`operations-registry.yaml` has 20 dangling `path:` entries** — registry rows whose
  file target does not resolve.
- **`cto-chief.md` dispatches these phantoms at 7 steps** — the sole dispatcher hands
  work to agents that cannot be loaded.
- **`CLAUDE.md`'s step table points Step 10 IMPLEMENT at the non-existent `implementer`.**
  The canonical documentation names a phantom as the executor of the build step.
- **`implementation-planner.md` instructs a Tier-1→Tier-1 peer dispatch of
  `stack-chooser`.** A sub-orchestrator dispatching a sibling violates the architecture
  invariant that only `cto-chief` dispatches across Tier-1; all cross-sibling work must
  route through the CTO Chief.

Today the roles the 10 phantom step-agents name are actually played by the
`iron-loop-executor` / `iron-loop-critic` / `iron-loop-integrator` trio.

## Scope

**Fixes:** make every agent named by a step, the registry, or the coordinator resolve
to a real dispatchable file. Two remediation strategies exist and are presented as
alternative stories for the human to choose at Gate 1 (see Story Map — they are
mutually exclusive; the maintainer picks one). Regardless of choice: regenerate
`operations-registry.yaml` from disk so no `path:` dangles, and remove the
Tier-1→Tier-1 peer-dispatch instruction from `implementation-planner.md`.

**Does NOT touch:** the frontmatter-load defect (that is W03) — this stub assumes
frontmatter loads and concerns itself only with whether the named target *resolves to a
file*. It does not re-architect the Iron Loop step model, the tier model, or the plan
stages; it makes the code match the documented model.

## Story Map

**Goal:** Every agent named by a step, the registry, or `cto-chief` resolves to a real
dispatchable file, and no sub-orchestrator dispatches a sibling directly.

- **Actor:** `cto-chief` (the dispatcher) and the maintainer trusting the step table.
- **Success metric:** 0 step-agents unresolved; 0 dangling registry `path:` entries;
  0 Tier-1→Tier-1 peer-dispatch instructions; a test drives resolution of every named
  agent and passes.

### Activity 1 — Choose the remediation strategy (mutually exclusive)

**Option A — Create the 10 missing step agents.** Author real agent files for
`test-maker`, `quality-checker`, `implementer`, `self-reviewer`, `optimizer`,
`verifier`, `documenter`, `implementation-reviewer`, `functional-reviewer`,
`implementation-plan-reviewer`, each with correct frontmatter and role body.
- As the maintainer, I want each Iron Loop step to dispatch a purpose-built agent named
  exactly as the step table names it, so that the documented step model is literally
  true and each step's agent has a single, named responsibility.

**Option B — Repoint to the real executors.** Repoint the `CLAUDE.md` step table, the
registry, and `cto-chief.md` so the 10 steps dispatch the existing
`iron-loop-executor` / `iron-loop-critic` / `iron-loop-integrator` trio that already
play these roles.
- As the maintainer, I want the step table, registry, and coordinator to name the
  executors that already exist, so that no phantom is dispatched and no new agent surface
  is added to maintain.

> The human chooses A or B at Gate 1. This stub does NOT pick one. The two are
> alternative paths to the same acceptance criteria below; exactly one ships.

### Activity 2 — Registry matches disk
- `[MVP]` As `cto-chief`, I want `operations-registry.yaml` regenerated from disk so
  every `path:` entry resolves to a real file, so that no dispatch reads a dangling
  pointer. (Runs regardless of A or B.)

### Activity 3 — No sibling peer-dispatch
- `[MVP]` As the architecture, I want the Tier-1→Tier-1 peer-dispatch instruction
  removed from `implementation-planner.md`, so that `stack-chooser` is reached only
  through `cto-chief`, preserving the single-dispatcher invariant. (Runs regardless of
  A or B.)

### Activity 4 — Prove resolution
- `[MVP]` As a maintainer, I want a test that drives resolution of every agent named by
  a step, the registry, and `cto-chief`, so that any future dangling pointer goes red.

## Rough Acceptance Criteria

- Given the 16 Iron Loop steps, When a test resolves the agent each step names to a file
  on disk, Then all 16 resolve (via Option A's new files or Option B's repointed
  executors) — 0 unresolved.
- Given `operations-registry.yaml`, When a test walks every `path:` entry, Then each
  resolves to an existing file — 0 dangling.
- Given `cto-chief.md`, When a test extracts every agent it dispatches, Then each
  resolves to a real dispatchable file.
- Given `CLAUDE.md`'s step table, When a test reads the Step 10 IMPLEMENT executor, Then
  it names an agent that resolves on disk (not `implementer` as a phantom).
- Given `implementation-planner.md`, When a test scans it for cross-sibling dispatch
  instructions, Then it finds no Tier-1→Tier-1 peer dispatch of `stack-chooser`.
- Given the chosen strategy, When the full resolution test runs against the pre-fix
  tree, Then it goes red (proving it catches the defect class), and green after the fix.

## Findings Addressed

C8, M24, L4.

## INVEST Status

- Option A (create 10 agents): valuable, estimable, testable via resolution; large — the
  implementation plan should slice one-agent-per-slice if chosen — PASS with note.
- Option B (repoint to executors): independent, small, testable via the same resolution
  test — PASS.
- Registry regen (MVP): independent, testable via path-walk — PASS.
- Remove peer-dispatch (MVP): independent, small, testable via text scan — PASS.
- Resolution test (MVP): independent, must go red first, testable — PASS.

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical remediation
  workstream; a BMC is N/A. Proceeding vision-only per instruction — not kicked back.
- **Both remediation options presented, neither chosen.** Per instruction, Option A
  (create the 10 agents) and Option B (repoint to the existing executor trio) are both
  laid out as mutually-exclusive alternative stories for the human to decide at Gate 1.
  This stub does not select one; the acceptance criteria are written to hold under either.
- **Registry regen and peer-dispatch removal are strategy-independent.** These two run
  regardless of A or B, so they are separated into their own activities and marked MVP —
  they must ship in the Walking Skeleton under either choice.
