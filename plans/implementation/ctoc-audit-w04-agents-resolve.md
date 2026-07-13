---
approved_by: human
approved_at: 2026-07-13T11:01:11.579Z
gate_crossed: functional → implementation
---

---
title: "W04 — Every Dispatched Agent Resolves"
created: "2026-07-11T00:00:00Z"
type: feature
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: HIGH
depends_on: none
---

# W04 — Every Dispatched Agent Resolves

> **This plan is now the SIP1 INDEX for its implementation slices.** Chosen strategy:
> **Option B** (repoint to the real `iron-loop-executor` / `iron-loop-critic` /
> `iron-loop-integrator` trio), decided by the maintainer at Gate 1 — Option A (create
> 10 wrapper agents) is **DROPPED**. The approved functional context (ASSESS / ALIGN /
> CAPTURE and the recorded Gate-1 decision) is preserved below the slice table.

## Slices (dependency-ordered)

Gates 2 & 3 batch per parent via `approveSubplans("ctoc-audit-w04-agents-resolve",
fromStage)` — one human decision crosses every sibling (each stamped `approved_by:
human`). Build order is sequential/FIFO honoring `depends_on`.

| # | Slice file | Scope (one line) | Files touched | depends_on |
|---|---|---|---|---|
| 1 | `ctoc-audit-w04-s1-registry-resolves.md` | Regenerate `.ctoc/operations-registry.yaml` from disk — fix 20 dangling `path:` entries, add the missing trio, repoint every `iron_loop:` name to the trio; create the shared resolution test (registry surface). | `.ctoc/operations-registry.yaml`, `tests/agent-dispatch-resolution.test.js` | none |
| 2 | `ctoc-audit-w04-s2-steptable-coordinator.md` | Repoint `CLAUDE.md`'s Iron Loop step table (rows 4,7,8–12,14–16) and `cto-chief.md`'s 10 "Owner sub-orchestrator" dispatch lines to the trio; extend the resolution test (step-table + coordinator surfaces + regression). | `CLAUDE.md`, `agents/coordinator/cto-chief.md`, `tests/agent-dispatch-resolution.test.js` | `s1` |
| 3 | `ctoc-audit-w04-s3-no-peer-dispatch.md` | Remove the Tier-1→Tier-1 peer-dispatch of `stack-chooser` from `implementation-planner.md` (reach it only via CTO Chief); add the Tier-1 peer-dispatch text-invariant test. | `agents/planning/implementation-planner.md`, `tests/tier1-no-peer-dispatch.test.js` | none |

Coverage of the parent's shipped stories: **s1** = MVP story *registry regeneration* +
the registry half of the Option-B story; **s2** = the step-table+coordinator half of
the Option-B story; **s3** = MVP story *peer-dispatch removal*. The resolution test
(MVP story *automated resolution guard*) is born in s1 and extended in s2, walking all
four parent surfaces (step table, registry, coordinator, peer-dispatch — the last in
s3's dedicated invariant test). Dependency chain depth 2 (`s1→s2`); no cycles.

## 1. ASSESS

### Business Context

`CLAUDE.md` tells every Claude session, including CTO Chief, to dispatch specific
named agents at each Iron Loop step and via `operations-registry.yaml`. When the
named target does not exist on disk, the session is forced into exactly the
anti-pattern CTOC's own operating rules forbid: *"ALWAYS use CTOC's own agents —
never invent your own... NEVER make up your own agent (no `general-purpose` /
`Explore` / ad-hoc subagent) to stand in for a CTOC agent."* A phantom dispatch
target leaves only two paths — silently fail the step, or route around the gap
with an improvised substitute agent — and both violate the project's own
non-negotiable dispatch discipline. This also directly undermines the
single-dispatcher invariant (*"No sub-orchestrator dispatches a sibling without
routing through CTO Chief"*), which one of the same files actively violates.

### Current State (verified)

- **10 of the 16 Iron Loop steps** in `CLAUDE.md`'s step table name an agent that
  resolves to no file anywhere in `agents/`: `test-maker` (Step 8),
  `quality-checker` (Step 9), `implementer` (Step 10), `self-reviewer` (Step 11),
  `optimizer` (Step 12), `verifier` (Step 14), `documenter` (Step 15),
  `implementation-reviewer` (Step 16), `functional-reviewer` (Step 4), and
  `implementation-plan-reviewer` (Step 7).
- **`.ctoc/operations-registry.yaml` carries 20 dangling `path:` entries** —
  registry rows whose file target does not resolve on disk.
- **`agents/coordinator/cto-chief.md` dispatches these same phantom names** at
  (at least) 7 of the step transitions it drives — the sole dispatcher hands
  work to agents that cannot be loaded.
- **`agents/planning/implementation-planner.md:23` instructs a direct
  Tier-1→Tier-1 peer dispatch of `stack-chooser`**, bypassing `cto-chief` — a
  structural violation of the single-dispatcher invariant documented in
  `CLAUDE.md`.
- **Today, the roles the 10 phantom step-agents are supposed to play are
  actually executed by the existing `iron-loop-executor` / `iron-loop-critic` /
  `iron-loop-integrator` trio** — real, working agents already perform this
  work under names the step table does not advertise.

Findings addressed: C8, M24, L4 (parent vision self-audit).

### Impact

- Any session that follows `CLAUDE.md`'s step table or the operations registry
  literally hits a non-existent file for 10 of 16 steps, and — per the
  project's own rule — has no compliant fallback: it either fails the step or,
  if it improvises a substitute, breaks the "never invent your own agent" rule
  the project depends on to keep dispatch auditable.
- The dispatch audit trail (`.ctoc/audit/dispatches/`) cannot be trusted for
  these step transitions, since the named target never existed to log
  correctly in the first place.
- The Tier-1→Tier-1 peer dispatch in `implementation-planner.md` is a live,
  executing violation of the architecture invariant that
  `tests/architecture-invariants.test.js` is supposed to guard — exactly the
  kind of structure-not-truth blind spot the parent vision identifies as the
  root cause of the false-green suite.
- Left unfixed, this is the single largest concrete gap between what
  `CLAUDE.md` documents CTOC does and what `agents/` actually contains: 10 of
  16 canonical Iron Loop steps name a phantom.

## 2. ALIGN

**Metrics that define done** — these hold regardless of which remediation
strategy (Option A or Option B, see Section 3) the maintainer selects at
Gate 1:

- **0** of the 16 Iron Loop steps in `CLAUDE.md`'s step table name an agent
  that fails to resolve to a file on disk.
- **0** of `operations-registry.yaml`'s `path:` entries fail to resolve.
- **0** agent names dispatched by `cto-chief.md` fail to resolve.
- **0** Tier-1→Tier-1 peer-dispatch instructions remain anywhere in
  `agents/planning/implementation-planner.md` (or any other Tier-1 agent
  file).
- **1** automated test exists that walks all four surfaces above, fails red
  against the pre-fix tree, and passes green after the fix — proving it
  catches the defect class rather than asserting structure.

Impact Map:
- **Goal:** every agent named by a step, the registry, or the coordinator
  resolves to a real dispatchable file, and no sub-orchestrator dispatches a
  sibling directly.
- **Actor:** `cto-chief` (the dispatcher) and the maintainer trusting the step
  table as documentation of what actually runs.
- **Impact:** a session or contributor who reads `CLAUDE.md`, the registry, or
  `cto-chief.md` can dispatch or trust every named agent without hitting a
  phantom, and CI catches any future regression.
- **Deliverable:** a resolved dispatch graph (via Option A's new files or
  Option B's repointed executors), a regenerated registry, a peer-dispatch-free
  `implementation-planner.md`, and a resolution test.

## 3. CAPTURE

### Two mutually exclusive remediation options (human decides at Gate 1)

This stub does not choose. Both are laid out as alternative story sets below
that satisfy the same strategy-agnostic acceptance criteria; exactly one ships.

- **Option A — Create the 10 missing step agents.** Author real agent files
  for `test-maker`, `quality-checker`, `implementer`, `self-reviewer`,
  `optimizer`, `verifier`, `documenter`, `implementation-reviewer`,
  `functional-reviewer`, and `implementation-plan-reviewer`, each with valid
  frontmatter and a role body scoped to a single step.
- **Option B — Repoint to the real executors.** Repoint `CLAUDE.md`'s step
  table, `operations-registry.yaml`, and `cto-chief.md` so the 10 steps
  dispatch the existing `iron-loop-executor` / `iron-loop-critic` /
  `iron-loop-integrator` trio that already performs this work.

**Recommendation: Option B.** The trio already executes Steps 7–15's work
today under different names, so Option B closes the gap between documentation
and reality with zero new agent files — no new surface to maintain, review, or
keep in sync with the trio's actual behavior. Option A would create 10 thin
wrapper agents whose entire job is re-describing what the trio already does,
adding maintenance surface without adding capability, and risking drift the
moment the trio's behavior changes but the 10 wrappers are not updated to
match. This is a recommendation only — the maintainer decides at Gate 1 (see
Decisions Taken Under Ambiguity).

### Acceptance Criteria (BDD)

Strategy-agnostic — hold under either Option A or Option B:

- [ ] **Scenario: All 16 step agents resolve**
  Given the 16 Iron Loop steps declared in `CLAUDE.md`'s step table
  When a resolution test looks up the agent file named by each step
  Then all 16 resolve to an existing file on disk (0 unresolved)

- [ ] **Scenario: Registry has no dangling paths**
  Given `.ctoc/operations-registry.yaml`
  When a resolution test walks every `path:` entry
  Then each resolves to an existing file (0 dangling)

- [ ] **Scenario: Every cto-chief dispatch target resolves**
  Given `agents/coordinator/cto-chief.md`
  When a resolution test extracts every agent name it dispatches
  Then each resolves to a real dispatchable agent file

- [ ] **Scenario: No Tier-1→Tier-1 peer dispatch remains**
  Given `agents/planning/implementation-planner.md`
  When a text-scan test checks for cross-sibling (Tier-1→Tier-1) dispatch
  instructions
  Then it finds none — `stack-chooser` is reachable only through `cto-chief`

- [ ] **Scenario: Resolution test proves it catches the defect (red before fix)**
  Given the resolution test suite for this stub
  When it is run against the pre-fix tree (a snapshot or historical git ref
  taken before this stub's changes land)
  Then it fails red, demonstrating the test actually detects the current
  dangling-pointer defects rather than passing vacuously

- [ ] **Scenario: Resolution test passes after the fix**
  Given the chosen remediation strategy has landed
  When the same resolution test suite is run against the post-fix tree
  Then it passes green with 0 unresolved agents and 0 dangling paths

- [ ] **Scenario: Regression protection for future additions**
  Given a future contributor adds a new Iron Loop step or a new
  `operations-registry.yaml` row naming an agent
  When the resolution test runs in CI
  Then it fails red if the newly-named agent does not resolve to a file on
  disk

- [ ] **Scenario: Registry drift after regeneration is still caught**
  Given `operations-registry.yaml` has been regenerated from disk (Activity 2,
  ships under either option)
  When a `path:` entry's target file is later renamed or deleted without the
  registry being updated
  Then the resolution test catches the newly-dangling entry on the next CI
  run, not only at the moment the registry was generated

Option A only (ships if the maintainer selects Option A at Gate 1):

- [ ] **Scenario: All 10 new step agents exist with valid contracts**
  Given Option A is chosen
  When a maintainer inspects `agents/` for `test-maker`, `quality-checker`,
  `implementer`, `self-reviewer`, `optimizer`, `verifier`, `documenter`,
  `implementation-reviewer`, `functional-reviewer`, and
  `implementation-plan-reviewer`
  Then each exists as a distinct agent file with valid YAML frontmatter (name,
  role, tools) and a role body describing exactly one responsibility scoped to
  its step

Option B only (ships if the maintainer selects Option B at Gate 1):

- [ ] **Scenario: Step table, registry, and coordinator repointed to real executors**
  Given Option B is chosen
  When a maintainer inspects `CLAUDE.md`'s step table,
  `operations-registry.yaml`, and `cto-chief.md`
  Then the 10 previously-phantom step agent names are replaced by references
  to `iron-loop-executor`, `iron-loop-critic`, or `iron-loop-integrator`
  (whichever actually performs that step's work today), and no reference to
  any retired phantom name remains in those three files

### Scope

#### In Scope
- Resolving all 10 phantom step-agent names in `CLAUDE.md`'s step table, via
  whichever option (A or B) the maintainer selects at Gate 1.
- Regenerating `operations-registry.yaml` from disk so 0 `path:` entries
  dangle (runs under either option).
- Removing the Tier-1→Tier-1 peer-dispatch instruction from
  `implementation-planner.md` (runs under either option).
- An automated resolution test proving red-before/green-after for the four
  strategy-agnostic surfaces (step table, registry, coordinator, peer-dispatch
  text).
- *(Option A path only)* Authoring 10 new agent files with correct frontmatter
  and role bodies, one per currently-phantom step name.
- *(Option B path only)* Repointing `CLAUDE.md`, `operations-registry.yaml`,
  and `cto-chief.md`'s dispatch instructions to `iron-loop-executor` /
  `iron-loop-critic` / `iron-loop-integrator`.

#### Out of Scope
- The frontmatter-load defect where 19 agent files place a heading before
  their YAML frontmatter (parent vision workstream 3 / stub W03) — this stub
  assumes frontmatter loads correctly and concerns itself only with whether a
  named target resolves to a file.
- Re-architecting the Iron Loop step model, the tier model, or the plan-stage
  set — per the parent vision's explicit out-of-scope line, this stub makes
  the code match the documented model, it does not change the model.
- Gate 3's validator logic, the VERIFY runner wiring, and the circuit breaker
  (parent vision workstream 5) — a separate functional plan.
- Any change to *what work* a step performs — only *which file* is dispatched
  to perform it.
- Choosing between Option A and Option B — deferred to the human at Gate 1
  (see Decisions Taken Under Ambiguity).

### Story Breakdown (INVEST)

Shared / MVP stories — ship under either option:

**As** `cto-chief` (the dispatcher), **I want** `operations-registry.yaml`
regenerated from disk, **so that** every `path:` entry resolves to a real file
and no dispatch reads a dangling pointer.
- Independent: yes — does not require Option A or B to be chosen first.
- Negotiable: yes — describes the outcome (no dangling paths), not the
  regeneration mechanism.
- Valuable: yes — every future dispatch through the registry becomes
  trustworthy.
- Estimable: yes — regenerate-from-disk is a well-understood pattern.
- Small: yes — single-file, mechanical regeneration.
- Testable: yes — path-walk test, covered by the strategy-agnostic ACs.

**As** the architecture (enforced by `tests/architecture-invariants.test.js`),
**I want** the Tier-1→Tier-1 peer-dispatch instruction removed from
`implementation-planner.md`, **so that** `stack-chooser` is reached only
through `cto-chief`, preserving the single-dispatcher invariant.
- Independent: yes.
- Negotiable: yes — describes the invariant, not the specific rewording.
- Valuable: yes — protects the architecture the whole pipeline depends on.
- Estimable: yes — one text removal, scoped to a known line.
- Small: yes.
- Testable: yes — text-scan test, covered by the strategy-agnostic ACs.

**As** a maintainer, **I want** an automated test that resolves every agent
named by a step, the registry, and `cto-chief`, **so that** any future
dangling pointer goes red in CI instead of rotting silently behind a green
suite.
- Independent: yes — the test can be written before the fix lands (and must
  go red first, per the red-before-fix AC).
- Negotiable: yes — describes the assertion (resolution), not the parser
  implementation.
- Valuable: yes — this is the regression guard the parent vision calls out as
  missing across the whole self-audit.
- Estimable: yes.
- Small: yes — one test file walking four known surfaces.
- Testable: yes — self-referential; it is the test.

Option A story (mutually exclusive with Option B — ships only if selected):

**As** the maintainer, **I want** each of the 10 phantom Iron Loop steps to
dispatch a purpose-built agent file named exactly as `CLAUDE.md`'s step table
names it, **so that** the documented step model is literally true and each
step's agent carries a single, auditable responsibility.
- Independent: no — depends on the Gate 1 decision to select Option A; large
  enough that the implementation plan should slice it one-agent-per-slice
  (per SIP1) if chosen.
- Negotiable: yes — names the outcome (10 real files, correct contracts), not
  each agent's internal prose.
- Valuable: yes — closes the documentation-reality gap directly and gives each
  step an independently reviewable agent.
- Estimable: yes, per-agent; large as a whole — flagged for slicing at
  implementation planning.
- Small: **no as written** — 10 agents in one story; PASS WITH NOTE per the
  stub's own INVEST status, to be split into 10 implementation slices if
  Option A is chosen.
- Testable: yes — the resolution test plus per-agent frontmatter validation.

Option B story (mutually exclusive with Option A — ships only if selected):

**As** the maintainer, **I want** the step table, registry, and coordinator
repointed to the existing `iron-loop-executor` / `iron-loop-critic` /
`iron-loop-integrator` trio, **so that** no phantom agent is ever dispatched
and no new agent surface is added purely to satisfy a name.
- Independent: yes — a single coordinated edit across three known files, no
  dependency on other stubs.
- Negotiable: yes — describes the end state (real executors named), not the
  exact wording of each reference.
- Valuable: yes — removes the phantom-dispatch risk with the smallest possible
  change surface.
- Estimable: yes.
- Small: yes — three files, mechanical repointing guided by the mapping
  already stated in the vision ("the roles the 10 phantom step-agents name are
  actually played by the iron-loop-executor / iron-loop-critic /
  iron-loop-integrator trio").
- Testable: yes — same resolution test as Option A, applied to the repointed
  names.

### Files Likely Touched

- **Either** *(Option A)* 10 new files under `agents/` (one per phantom step
  agent name, exact paths TBD at implementation planning per SIP1 slicing)
- **Or** *(Option B)* `CLAUDE.md` (step table), `.ctoc/operations-registry.yaml`,
  `agents/coordinator/cto-chief.md`
- **Both options, regardless of choice:** `agents/planning/implementation-planner.md`
  (remove Tier-1→Tier-1 peer-dispatch instruction), `.ctoc/operations-registry.yaml`
  (regenerate from disk), a new resolution test file (e.g. under `tests/`)

### Test Strategy

A single resolution test (implementation-stage name TBD, e.g.
`tests/agent-dispatch-resolution.test.js`) that:

1. Parses `CLAUDE.md`'s step table for all 16 step→agent mappings and asserts
   each resolves to a file under `agents/`.
2. Parses `.ctoc/operations-registry.yaml`'s `path:` entries and asserts each
   resolves to an existing file.
3. Parses `agents/coordinator/cto-chief.md` for every agent name it dispatches
   and asserts each resolves.
4. Scans `implementation-planner.md` (and, defensively, other Tier-1 agent
   files) for direct peer-dispatch phrasing and asserts none is present.
5. Is run once against a pre-fix snapshot (git stash, `git show <ref>:<path>`,
   or an equivalent historical read) to prove it goes red — satisfying the
   red-before-fix acceptance criterion — before being run green against the
   fixed tree.

This test must assert **resolution** (the named file exists and is
loadable/parseable as an agent), not merely that a string is present in a
config file — the parent vision's core finding is that structure-only
assertions are exactly what let these 20+ dangling pointers hide behind a
green suite.

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical
  remediation workstream; a BMC is N/A. Proceeding vision-only per
  instruction — not kicked back.
- **Option A vs. Option B is deferred to the human at Gate 1, not decided
  here.** Both remediation strategies are fully specified above as
  mutually-exclusive alternative story sets, each satisfying the same
  strategy-agnostic acceptance criteria. This plan records a **recommendation
  for Option B** (repoint the step table, registry, and `cto-chief.md` to the
  existing `iron-loop-executor` / `iron-loop-critic` / `iron-loop-integrator`
  trio) because that trio already performs this work today under different
  names — Option B closes the documentation-reality gap with zero new agent
  files, while Option A would add 10 thin wrapper agents whose sole function
  is re-describing behavior the trio already implements, creating drift risk
  and ongoing maintenance surface with no corresponding capability gain. The
  maintainer makes the final call at Gate 1; this stub does not cross Gate 1
  or pick unilaterally.
  - **RESOLVED at Gate 1 (2026-07-13): the maintainer chose Option B — repoint the
    step table, `.ctoc/operations-registry.yaml`, and `cto-chief.md` to the
    `iron-loop-executor` / `iron-loop-critic` / `iron-loop-integrator` trio. Option A
    (create 10 wrapper agents) is DROPPED. Implementation planning slices only the
    Option-B stories plus the two strategy-independent MVP stories (registry
    regeneration, peer-dispatch removal).**
- **Registry regeneration and peer-dispatch removal are strategy-independent
  and are not gated on the Option A/B decision.** Both are included as shared
  MVP stories that ship regardless of which option is later selected, so they
  can proceed at implementation planning without waiting on the Gate 1
  strategy choice.
