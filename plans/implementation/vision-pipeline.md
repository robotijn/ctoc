---
title: "Vision Pipeline: Vision-to-Functional Decomposition"
created: "2026-02-08T17:00:00Z"
priority: MEDIUM
type: feature
extracted_from: smart-quality-gate-system
approved_by: human
approved_at: 2026-02-08T17:30:00.000Z
gate_crossed: functional → implementation
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

## Discussion Decisions

### D1: Decomposer Merge Strategy

**Keep Story Mapping, add checkpoint.** The existing vision-decomposer.md uses Jeff Patton's User Story Mapping (Vision -> Goals -> Activities -> Stories). This methodology is preserved. The human checkpoint and stub-based output format are added on top.

### D2: Vision Lifecycle After Decomposition

**Move to done/ with `type: vision` metadata marker.** After successful decomposition, the vision file moves to `plans/done/` with frontmatter `type: vision`. The dashboard can distinguish visions from plans: "Done: 6 plans, 1 vision". Keeps the flat folder convention.

### D3: Product Owner Agent Questions

**Mark as `needs-input`, ask when user views.** When the PO Agent hits a question during background refinement, it writes `status: needs-input` to the status file with the question. When the user views the plan, the question is surfaced via AskUserQuestion.

## Agents

### Vision Decomposer Agent

**File:** `agents/planning/vision-decomposer.md` (MODIFY)

Keep existing Jeff Patton Story Mapping methodology. Add:
- Human checkpoint flow after decomposition
- Stub-based output format (frontmatter with `parent_vision`, `type: stub`)
- Gate validation check before decomposing
- Integration with `lib/vision-decomposer.js` for file creation

### Product Owner Agent

**File:** `agents/planning/product-owner.md` (CREATE)

- Runs as background agent after human approves decomposition
- Refines stubs with acceptance criteria, business alignment, priority
- When it needs user input: writes `status: needs-input` + question to status file
- Surfaced to user on next view

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `agents/planning/vision-decomposer.md` | MODIFY | Add human checkpoint flow, stub-based output |
| `agents/planning/product-owner.md` | CREATE | Functional plan refinement agent |
| `lib/vision-decomposer.js` | CREATE | Vision parsing + stub creation logic |
| `commands/vision.md` | MODIFY | Add decompose command |

## Acceptance Criteria

- [ ] Vision Decomposer keeps Story Mapping methodology + adds stub output
- [ ] Product Owner Agent refines stubs with acceptance criteria
- [ ] Vision-to-functional gate validates vision readiness before decomposition
- [ ] Each functional stub has `parent_vision` in frontmatter linking back
- [ ] Human checkpoint UI shows stub table + AskUserQuestion menu
- [ ] User can edit/add/remove stubs before PO refinement
- [ ] Single-plan visions skip decomposer (Vision Advisor handles directly)
- [ ] Completed visions move to done/ with `type: vision` metadata
- [ ] PO Agent uses `needs-input` status for questions needing user input

---

*Extracted from smart-quality-gate-system plan (Phase B) on 2026-02-08.*

## Implementation Details

### File: `lib/vision-decomposer.js`
**Action:** CREATE
**Purpose:** Core logic for parsing vision documents, validating readiness, creating functional plan stubs, and managing the vision lifecycle (move to done/).

**Exports:**
- `validateVisionReadiness(visionPath)` → returns `{ ready: boolean, errors: string[], warnings: string[] }`
  - Reads the vision file, checks for required dimensions: problem statement, target audience, success criteria, scope/what-we're-building
  - Uses regex patterns similar to `lib/plan-validator.js:validateFunctionalToImpl()` (line ~378)
  - Checks for `## Vision:` or frontmatter `type: vision` marker
  - Returns structured result with blocking errors and non-blocking warnings

- `decomposeVision(visionPath, goals)` → returns `{ stubs: Array<{ name, path, scope, dependsOn }> }`
  - Takes a vision file path and an array of goal objects `{ title, scope, dependsOn: [] }`
  - For each goal, creates a stub file in `plans/functional/` using `createStub()`
  - Returns array of created stub metadata for the human checkpoint UI table

- `createStub(visionSlug, goal, visionPath)` → returns `{ name, path }`
  - Creates a single stub markdown file at `plans/functional/{visionSlug}-{goalSlug}.md`
  - Frontmatter includes: `title`, `created`, `type: stub`, `parent_vision: "vision/{name}.md"`, `priority`, `status: stub`
  - Body includes: Problem Statement (extracted from goal), Scope, rough Acceptance Criteria (placeholder checkboxes)
  - Uses `fs.writeFileSync` similar to how `lib/actions.js:movePlan()` (line ~44) handles file creation

- `completeVision(visionPath)` → returns `{ newPath: string }`
  - Reads the vision file, adds `type: vision` to frontmatter (similar to `lib/actions.js:addApprovalMarker()` at line ~68)
  - Adds `status: decomposed` and `decomposed_at: <timestamp>` to frontmatter
  - Moves file from `plans/vision/` to `plans/done/` using `movePlan()` from `lib/actions.js`
  - Returns new path in done/

- `listStubs(visionSlug)` → returns `Array<{ name, path, scope, dependsOn, status }>`
  - Scans `plans/functional/` for files with `parent_vision` matching the vision slug
  - Uses `readPlans()` from `lib/state.js` (line ~18) filtered by frontmatter `parent_vision`
  - Returns stubs sorted by dependency order

- `removeStub(stubPath)` → returns `void`
  - Deletes a stub file and its `.status` file if present
  - Uses pattern from `lib/actions.js:deletePlan()` (line ~272) and `lib/background.js:clearStatus()` (line ~65)

- `mergeStubs(stubPaths, mergedName)` → returns `{ name, path }`
  - Reads content from multiple stubs, merges scope and acceptance criteria
  - Creates new combined stub, removes originals
  - Preserves the `parent_vision` link from originals

**Depends on:** `lib/state.js` (parseMetadata, readPlans, getPlansDir), `lib/actions.js` (movePlan), `lib/background.js` (writeStatus, clearStatus), `lib/project-root.js` (findProjectRoot)
**Called by:** `agents/planning/vision-decomposer.md` (agent instructions reference these functions), `commands/menu.md` (via `claude:decompose` action)

---

### File: `agents/planning/vision-decomposer.md`
**Action:** MODIFY
**Changes:**

1. **Add Vision Readiness Gate (after "## Trigger" section, around line ~28):**
   - Add new section `## Pre-Decomposition Gate` that instructs the agent to call `validateVisionReadiness()` from `lib/vision-decomposer.js` before proceeding
   - If validation fails, show errors to user and ask them to complete the vision first (link back to Vision Advisor)
   - Gate checks: problem statement present, target audience defined, success criteria defined, scope/boundaries defined

2. **Add Human Checkpoint Flow (after "## Process > Phase 5", around line ~127):**
   - Add new section `## Phase 6: Human Checkpoint` between current Phase 5 (Create Functional Plans) and Output
   - Instructions to present the stub table (using format from the plan's "Human Checkpoint UI" section)
   - AskUserQuestion with 4 options: "Looks good -- refine all", "Edit stubs", "Add a stub", "Start over"
   - Loop behavior: after "Edit stubs" or "Add a stub", re-present the table with updates
   - On "Looks good": hand off each stub to Product Owner Agent via `initBackgroundAgent()` from `lib/actions.js`
   - On "Start over": call `removeStub()` for all stubs and restart from Phase 1

3. **Modify Phase 5 output format (lines ~93-127):**
   - Change from direct functional plan creation to stub creation using `createStub()` from `lib/vision-decomposer.js`
   - Stub frontmatter template: `type: stub`, `parent_vision: "vision/{slug}.md"`, `status: stub`
   - Keep existing Story Mapping structure (Goals -> Activities -> Stories) but output as stubs, not full plans

4. **Add integration with `lib/vision-decomposer.js` (in "## Tools Used" section, line ~177):**
   - Add: `lib/vision-decomposer.js` (validateVisionReadiness, decomposeVision, createStub, completeVision, listStubs, removeStub)

5. **Add new section `## Handoff to Product Owner`** after Phase 6:
   - When user approves decomposition ("Looks good -- refine all"):
     - For each stub, write status file via `writeStatus(stubPath, { agent: 'product-owner', status: 'working', message: 'Refining stub...' })`
     - Call `completeVision(visionPath)` to move vision to `plans/done/` with `type: vision`
     - Return control to the conversation (PO Agent runs as background agent per stub)

6. **Add single-plan bypass logic (in "## Trigger" section):**
   - If vision has only 1 goal/workstream (determined during Phase 1), skip decomposition
   - Convert directly to functional plan (same as what Vision Advisor does on "Convert to plan")
   - Add note: "If the vision maps to a single functional plan, the Vision Advisor handles the conversion directly. The Decomposer only activates for 2+ independent workstreams."

**Integration:** Called by menu when user selects "Decompose" on a vision in the Vision tab. The menu-screens.js `dashboardCommands()` function (line ~157) already routes `claude:vision` — a new `claude:decompose {slug}` action will be added.

---

### File: `agents/planning/product-owner.md`
**Action:** CREATE
**Purpose:** Background agent that refines functional plan stubs into detailed, business-aligned functional plans with acceptance criteria.

**Structure:**
```
---
name: product-owner
description: Refines functional plan stubs into detailed plans with acceptance criteria, business alignment, and priority. Runs as background agent.
tools: Read, Write, WebSearch
model: sonnet
---
```

**Sections:**
- `## Role` — Business-aligned product thinker. Validates that each plan stub serves a real user need. Adds detailed acceptance criteria.
- `## Trigger` — Activated when Vision Decomposer hands off approved stubs. Status file shows `agent: "product-owner"`, `status: "working"`.
- `## Input` — Receives: stub file path in `plans/functional/`, parent vision path (from `parent_vision` frontmatter).
- `## Process`:
  1. Read the stub file and parent vision for full context
  2. Validate business alignment (does this stub serve the vision's stated problem?)
  3. Add detailed acceptance criteria (convert rough criteria to specific, testable items)
  4. Add priority (HIGH/MEDIUM/LOW based on dependency order and impact)
  5. Add scope section (in-scope, out-of-scope)
  6. Add risk assessment
  7. Remove `type: stub` from frontmatter, set `type: feature`
  8. Update `status: refined` in frontmatter
- `## Needs-Input Protocol`:
  - When PO Agent encounters ambiguity it cannot resolve from the vision context alone:
    1. Write question to status file: `markNeedsInput(stubPath, question)` from `lib/background.js` (line ~131)
    2. Set status: `needs-input` — this is picked up by `readStatus()` in `lib/background.js` (line ~46)
    3. When user views the plan in the dashboard, `readPlans()` from `lib/state.js` (line ~18) surfaces `bgStatus: 'needs-input'` and `bgMessage` containing the question
    4. Menu shows AskUserQuestion with the PO Agent's question
    5. After user answers, agent resumes refinement
  - Example questions: "Should auth support OAuth or just email/password?", "Is this API internal-only or public-facing?"
- `## Output` — Refined functional plan file with full sections: Problem Statement, Scope, User Stories, Acceptance Criteria, Risks, Priority
- `## Success Criteria` — All stubs refined, each has 3+ acceptance criteria, no `type: stub` remaining, business alignment validated

**Depends on:** `lib/background.js` (markNeedsInput, markComplete, writeStatus), `lib/state.js` (parseMetadata)
**Called by:** Vision Decomposer agent (handoff after human checkpoint approval)

---

### File: `commands/vision.md`
**Action:** CREATE (does not exist yet — `commands/vision.md` was listed as MODIFY in the plan but the file does not exist; the vision functionality is currently in `tabs/vision.js` and the `claude:vision` action in `commands/menu.md`)
**Purpose:** Slash command entry point for vision-specific operations including decomposition.

**Content structure (Claude Code slash command format, matching `commands/menu.md` pattern):**
```
---
description: Vision pipeline - explore, decompose, and refine ideas into plans
---
```

**Navigation Commands:**
| Command | Screen |
|---------|--------|
| (no args) | List visions |
| `decompose {slug}` | Run Vision Decomposer on a ready vision |
| `stubs {slug}` | Show current stubs for a vision being decomposed |
| `refine {slug}` | Trigger PO Agent refinement on approved stubs |

**Claude Actions:**
| Action | What to do |
|--------|-----------|
| `claude:decompose {slug}` | Read vision file, validate readiness via `validateVisionReadiness()`, run Vision Decomposer agent, show human checkpoint |
| `claude:edit-stubs {slug}` | Present stub table, allow user to rename/merge/split/remove stubs |
| `claude:approve-stubs {slug}` | Hand off all stubs to PO Agent, move vision to done/ via `completeVision()` |
| `claude:add-stub {slug}` | Create a new stub for an in-progress decomposition |

**Integration:** The `commands/menu.md` already has `claude:vision` action (line ~42). The vision.md command extends this with decomposition-specific subcommands. When user is in vision mode and selects "Decompose", the conversation follows this command's protocol.

---

### File: `lib/state.js`
**Action:** MODIFY
**Changes:**

1. **Update `getVisionCounts()` (lines ~315-347) to track `decomposing` status:**
   - Add counter: `let decomposing = 0;`
   - Add match: `else if (status === 'decomposing') decomposing++;`
   - Return: add `decomposing` to return object
   - This tracks visions currently being decomposed (between decomposer start and PO completion)

2. **Add `getVisionStubs(visionSlug, projectPath)` function after `getVisionCounts()` (after line ~347):**
   - Scans `plans/functional/` for plans where `metadata.parent_vision` contains `visionSlug`
   - Returns array of stub objects with: name, path, scope (from first line of Problem Statement), dependsOn (from metadata), bgStatus
   - Uses existing `readPlans()` function with filter
   - Signature: `function getVisionStubs(visionSlug, projectPath)` → returns `Array<{ name, path, scope, dependsOn, bgStatus }>`

3. **Update `module.exports` (line ~349) to include `getVisionStubs`**

**Depends on:** No new dependencies (uses existing `readPlans`, `parseMetadata`, `getPlansDir`)
**Called by:** `lib/vision-decomposer.js:listStubs()`, `lib/menu-screens.js` (for stub table rendering)

---

### File: `lib/menu-screens.js`
**Action:** MODIFY
**Changes:**

1. **Add `claude:decompose` action to `dashboardCommands()` (line ~157):**
   - When vision count > 0 and at least one vision has status `ready`, show "Decompose ready vision" option
   - Action maps to `claude:decompose {slug}` where slug is the ready vision

2. **Add stub browse screen function `visionStubsBrowse(slug, projectPath)` (after `stageBrowse()`, around line ~274):**
   - Renders the human checkpoint table format from the plan specification
   - Shows stub table: `| # | Stub | Scope | Depends on |`
   - Options: "Looks good -- refine all", "Edit stubs", "Add a stub", "Start over", "Back"
   - Actions map to: `claude:approve-stubs {slug}`, `claude:edit-stubs {slug}`, `claude:add-stub {slug}`, `claude:decompose {slug}` (re-start), `browse vision`
   - Uses `getVisionStubs()` from `lib/state.js`

3. **Add route handler for `decompose` and `stubs` commands in `route()` (line ~563):**
   - `case 'stubs':` → call `visionStubsBrowse(args[1], projectPath)`
   - The `decompose` command is a `claude:` action (handled in conversation, not by the state machine)

4. **Update `module.exports` (line ~623) to include `visionStubsBrowse`**

**Depends on:** `lib/state.js` (getVisionStubs, getVisionCounts)
**Called by:** `commands/menu.js` (via route), `commands/menu.md` (Claude action protocol)

---

### File: `lib/actions.js`
**Action:** MODIFY
**Changes:**

1. **Add `VISION_DECOMPOSER` and `PRODUCT_OWNER` to `AGENT_TYPES` (line ~18):**
   ```javascript
   VISION_DECOMPOSER: 'vision-decomposer',
   PRODUCT_OWNER: 'product-owner'
   ```

2. **Add `initDecomposerAgent(visionPath)` function (after `initCriticAgent()`, around line ~363):**
   - Calls `initBackgroundAgent(visionPath, AGENT_TYPES.VISION_DECOMPOSER, 'Decomposing vision into functional stubs...')`
   - Returns `AGENT_TYPES.VISION_DECOMPOSER`

3. **Add `initProductOwnerAgent(stubPath)` function (after new decomposer function):**
   - Calls `initBackgroundAgent(stubPath, AGENT_TYPES.PRODUCT_OWNER, 'Refining stub with acceptance criteria...')`
   - Returns `AGENT_TYPES.PRODUCT_OWNER`

4. **Update `module.exports` (line ~436) to include `initDecomposerAgent`, `initProductOwnerAgent`**

**Depends on:** No new dependencies (uses existing `initBackgroundAgent`, `writeStatus`)
**Called by:** `lib/vision-decomposer.js`, Vision Decomposer agent (handoff to PO), `commands/vision.md` protocol

---

### File: `lib/plan-validator.js`
**Action:** MODIFY
**Changes:**

1. **Add `validateVisionForDecomposition(visionPath, projectPath)` function (after `validateReviewToDone()`, around line ~444):**
   - Validates vision readiness before decomposition gate
   - Checks: problem statement (`/problem|the problem/i`), target audience (`/for whom|target|audience/i`), success criteria (`/success.*looks like|success criteria/i`), scope (`/what we're building|scope|what we're NOT/i`)
   - Returns standard `ValidationResult` structure (same as other validators)
   - This is the server-side validation backing `lib/vision-decomposer.js:validateVisionReadiness()`

2. **Add `vision->functional` to `validatedTransitions` map in `validateTransition()` (line ~466):**
   - Key: `'vision->functional'`
   - Value: `validateVisionForDecomposition`
   - This allows the standard validation pipeline to validate vision decomposition

3. **Update `module.exports` (line ~708) to include `validateVisionForDecomposition`**

**Depends on:** No new dependencies
**Called by:** `lib/vision-decomposer.js:validateVisionReadiness()`, `lib/menu-screens.js:validateScreen()` (if decompose validates)

---

### Data Flow

```
User creates vision (Vision Advisor Agent)
    │
    ▼
plans/vision/{slug}.md  [status: ready]
    │
    ├── validateVisionReadiness(visionPath)     ← lib/vision-decomposer.js
    │   uses validateVisionForDecomposition()    ← lib/plan-validator.js
    │
    ▼
Vision Decomposer Agent (agents/planning/vision-decomposer.md)
    │ Phase 1-4: Extract Goals → Map Activities → Generate Stories → Prioritize
    │ Phase 5: Create stubs via decomposeVision() ← lib/vision-decomposer.js
    │
    ▼
plans/functional/{slug}-{goal}.md  [type: stub, parent_vision: vision/{slug}.md]
    │
    ▼
Human Checkpoint (visionStubsBrowse in lib/menu-screens.js)
    │ AskUserQuestion: "Looks good" / "Edit" / "Add" / "Start over"
    │
    ├── "Edit stubs" → user modifies, loop back to checkpoint
    ├── "Add a stub" → createStub() → loop back to checkpoint
    ├── "Start over" → removeStub() all → restart decomposer
    │
    └── "Looks good -- refine all"
         │
         ├── completeVision(visionPath)         ← lib/vision-decomposer.js
         │   moves vision → plans/done/ [type: vision, status: decomposed]
         │
         └── For each stub:
             initProductOwnerAgent(stubPath)     ← lib/actions.js
             writeStatus(stubPath, { agent: 'product-owner', status: 'working' })
                 │
                 ▼
         Product Owner Agent (agents/planning/product-owner.md)
             │ Refines stub → full functional plan
             │ If question: markNeedsInput(stubPath, question)  ← lib/background.js
             │ On complete: markComplete(stubPath, 'Refined')   ← lib/background.js
             │
             ▼
         plans/functional/{slug}-{goal}.md  [type: feature, status: refined]
             (ready for standard functional → implementation pipeline)
```

### Integration Points Summary

| From | To | How |
|------|----|-----|
| `commands/vision.md` | `lib/vision-decomposer.js` | `claude:decompose` action calls `validateVisionReadiness()` then spawns agent |
| `Vision Decomposer agent` | `lib/vision-decomposer.js` | Agent calls `decomposeVision()`, `createStub()`, `listStubs()` |
| `Vision Decomposer agent` | `lib/actions.js` | Handoff: `initProductOwnerAgent()` per stub |
| `Vision Decomposer agent` | `lib/vision-decomposer.js` | `completeVision()` to move vision to done/ |
| `Product Owner agent` | `lib/background.js` | `markNeedsInput()` for questions, `markComplete()` when done |
| `lib/menu-screens.js` | `lib/state.js` | `getVisionStubs()` for human checkpoint table |
| `lib/menu-screens.js` | `lib/plan-validator.js` | `validateVisionForDecomposition()` for gate check |
| `lib/state.js` | `lib/background.js` | `readStatus()` for stub bgStatus display (existing pattern) |

### Test Files

No automated test suite exists in this codebase (no `tests/` directory with runnable tests). The validation is through the plan validator and manual testing via the CTOC dashboard.
