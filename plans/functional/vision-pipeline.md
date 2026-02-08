---
title: "Vision Pipeline: Vision-to-Functional Decomposition"
created: "2026-02-08T17:00:00Z"
priority: MEDIUM
type: feature
extracted_from: smart-quality-gate-system
---

# Vision Pipeline: Vision-to-Functional Decomposition

## Problem Statement

When a user creates a vision document, there's no automated path from vision to actionable functional plans. Currently, the user must manually decompose a vision into smaller pieces and write each functional plan by hand. This is tedious, error-prone, and inconsistent.

## Solution Overview

An **agent-driven decomposition pipeline** that:
1. Parses vision documents into distinct features/workstreams
2. Creates functional plan stubs (one per feature)
3. Presents stubs for human review/editing
4. Refines approved stubs into detailed functional plans

## Design Decision: Vision-to-Functional Gate

**Agent-driven decomposition with human checkpoint:**

A vision document is a high-level idea. Before it becomes actionable, an agent decomposes it into smaller functional plans:

1. **Vision Decomposer Agent** parses the vision document:
   - Extracts distinct features/components
   - Identifies dependencies between chunks
   - Creates initial functional plan stubs (1 per feature)
   - Each stub has: problem statement, scope, rough acceptance criteria

2. **Product Owner Agent** refines each stub:
   - Validates business alignment
   - Adds detailed acceptance criteria
   - Prioritizes the plans
   - Identifies gaps and asks clarifying questions

3. **Gate validation** before decomposition:
   - Vision has clear problem statement
   - Vision has defined scope/boundaries
   - Vision has success criteria
   - Vision identifies target users/stakeholders

```
vision/my-idea.md
    | (Vision Decomposer Agent: parse into chunks)
    |-- functional/my-idea-auth.md        (stub)
    |-- functional/my-idea-ui.md          (stub)
    '-- functional/my-idea-api.md         (stub)
    | HUMAN CHECKPOINT: user reviews decomposition
    | (user can add/remove/rename/merge stubs)
    | (user approves: "decomposition looks good")
    | (Product Owner Agent refines each approved stub)
    |-- functional/my-idea-auth.md        (refined, ready for review)
    |-- functional/my-idea-ui.md          (refined, ready for review)
    '-- functional/my-idea-api.md         (refined, ready for review)
```

This is a **hybrid gate**: agent decomposes -> human validates decomposition -> agent refines. The human checkpoint ensures correct granularity, no scope overlap, no missing features, and right priority ordering.

### Human Checkpoint UI

When the Vision Decomposer creates stubs, the user sees:

```
Vision "my-idea" decomposed into 3 functional plans:

| # | Stub                    | Scope                          | Depends on |
|---|-------------------------|--------------------------------|------------|
| 1 | my-idea-auth.md         | Authentication + authorization | -          |
| 2 | my-idea-api.md          | REST API endpoints             | 1          |
| 3 | my-idea-ui.md           | Frontend dashboard             | 2          |
```

Then AskUserQuestion:
```
"Review the decomposition. What do you want to do?"
Options:
- "Looks good -- refine all" -> PO Agent refines each stub
- "Edit stubs" -> User can rename/merge/split/remove stubs
- "Add a stub" -> User describes a missing piece
- "Start over" -> Discard and re-decompose
```

The user can iterate (edit, add, remove stubs) until satisfied, then approve for PO Agent refinement.

### Agent Boundaries

| Agent | Responsibility | Input -> Output |
|-------|---------------|----------------|
| Vision Advisor | Discovery: idea -> concrete vision summary | User's idea -> `plans/vision/{slug}.md` |
| Vision Decomposer | Splitting: vision -> functional stubs | Vision file -> multiple stub files in `plans/functional/` |
| Product Owner | Refinement: stub -> detailed plan | Stub file -> refined plan with acceptance criteria |

- **Vision Advisor** handles single-plan visions directly (skip decomposer, convert straight to functional)
- **Vision Decomposer** only activates when the vision contains 2+ independent workstreams
- **Product Owner** only activates after human approves the decomposition

## Agents

### Vision Decomposer Agent

**File:** `agents/planning/vision-decomposer.md` (MODIFY)

```markdown
# Vision Decomposer Agent

## Role
Parse vision documents into smaller, actionable functional plan stubs.

## Trigger
- When user approves a vision for decomposition
- Manual: `ctoc vision decompose <vision-file>`

## Process
1. Read the vision document
2. Identify distinct features/components/workstreams
3. Analyze dependencies between chunks
4. For each chunk, create a functional plan stub:
   - Problem statement (derived from vision)
   - Scope (bounded to this chunk)
   - Rough acceptance criteria
   - Dependencies on other chunks
5. Write stubs to plans/functional/

## Output
Multiple functional plan files, each focused on one feature.
Each has metadata linking back to the parent vision.

## Quality Checks
- Each stub must have a clear problem statement
- No stub should overlap in scope with another
- Dependencies must be acyclic
- Each stub is small enough for one implementation cycle
```

### Product Owner Agent

**File:** `agents/planning/product-owner.md` (CREATE)

```markdown
# Product Owner Agent

## Role
Refine functional plan stubs into detailed, actionable plans.

## Trigger
- After Vision Decomposer creates stubs
- On demand for any functional plan needing refinement

## Process
1. Read the functional plan stub
2. Validate business alignment:
   - Does this serve users?
   - What's the ROI?
   - Is this the right priority?
3. Add detailed acceptance criteria:
   - User-facing behaviors
   - Edge cases
   - Non-functional requirements
4. Identify gaps and ask clarifying questions
5. Prioritize relative to other plans in pipeline

## Output
Refined functional plan with complete acceptance criteria,
priority ranking, and business justification.

## Quality Checks
- Must have >= 3 acceptance criteria
- Must have clear scope boundaries
- Must have defined success metrics
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `agents/planning/vision-decomposer.md` | MODIFY | Add human checkpoint flow, stub-based output |
| `agents/planning/product-owner.md` | CREATE | Functional plan refinement agent |
| `lib/vision-decomposer.js` | CREATE | Vision parsing + stub creation logic |
| `commands/vision.md` | MODIFY | Add decompose command |

## Acceptance Criteria

- [ ] Vision Decomposer Agent creates functional stubs from visions
- [ ] Product Owner Agent refines stubs with acceptance criteria
- [ ] Vision-to-functional gate validates vision readiness before decomposition
- [ ] Each functional stub links back to parent vision
- [ ] Human checkpoint UI shows stub table + AskUserQuestion menu
- [ ] User can edit/add/remove stubs before PO refinement
- [ ] Single-plan visions skip decomposer (Vision Advisor handles directly)

---

*Extracted from smart-quality-gate-system plan (Phase B) on 2026-02-08.*
