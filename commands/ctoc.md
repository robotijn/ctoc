---
description: Show CTOC dashboard status and menu
---

Show the CTOC dashboard:

```bash
node "${CLAUDE_PLUGIN_ROOT}/commands/ctoc.js"
```

---

## CTOC Menu Rules (MANDATORY)

**These rules are NON-NEGOTIABLE. Follow them EXACTLY.**

### Rule 1: Always Show Menus

After EVERY CTOC response, you MUST show the relevant contextual menu. NO EXCEPTIONS.

| Context | Menu to Show |
|---------|--------------|
| Dashboard | Main dashboard menu |
| Browse list | List items + actions |
| Selected item | Action menu |
| Discussion | Discussion menu |
| Input request | Cancel option |

### Rule 2: Auto-Discussion on Plan Creation

When a NEW plan is created, you MUST automatically:

1. Show the plan summary
2. **Enter discussion mode** — Critique the plan
3. Find gaps, question assumptions, identify risks
4. **Use AskUserQuestion** for decisions (see Rule 3)
5. Show discussion menu
6. **Wait for user to approve** — Never auto-approve

### Rule 3: Use AskUserQuestion Tool

When asking questions with options, ALWAYS use the **AskUserQuestion tool**:

```
AskUserQuestion({
  questions: [{
    question: "Your question here?",
    header: "Short label",
    options: [
      { label: "Best option (Recommended)", description: "Why this is recommended and what it does" },
      { label: "Alternative option", description: "What this option does and trade-offs" },
      { label: "Another option", description: "What this option does and trade-offs" }
    ]
  }]
})
```

**Rules:**
- Recommended option FIRST with "(Recommended)" in label
- Description explains WHY it's recommended
- Still show text menu as backup (both AskUserQuestion AND text menu)

### Rule 4: Consistent Menu Numbering

Menus MUST use sequential numbers. NO EXCEPTIONS.

**CORRECT:**
```
  [1] view        Show plan
  [2] edit        Modify plan
  [3] discuss     Critique and refine
  [4] approve     Move to next stage
  [5] delete      Remove plan
  [0] back        Return to list
```

**WRONG:**
```
  [v] view        ← NO letters!
  [d] discuss     ← NO letters!
  [c] create      ← NO letters!
```

**Rules:**
- Actions: `[1]`, `[2]`, `[3]`, `[4]`...
- Back/cancel: `[0]` (always last)
- NO letter shortcuts ever
- Order is FIXED, not interpreted

### Rule 5: Return to Plan List After Approval

When a functional plan is APPROVED:

1. Move the plan to implementation stage
2. Show success message
3. **Return to the functional plan list** with menu
4. Let user choose next action (view another plan, create new, etc.)

The implementation details are created when the user VIEWS the plan in implementation stage, not automatically after approval.

### Rule 5.5: Implementation Planning Discovery

When a user selects **[2] Plan** on an implementation plan (or when creating/editing implementation details):

1. **Check CLI possibilities**:
   - Search the codebase for existing CLI patterns
   - Identify if feature can be exposed via CLI command
   - Suggest CLI interface if appropriate

2. **Check `.env` for available services**:
   - Read `.env` and `.env.example` files
   - List available API keys/secrets for external services
   - Note which services are already configured

3. **Ask: Local vs Online service?**:
   Use AskUserQuestion:
   ```
   AskUserQuestion({
     questions: [{
       question: "Should this feature use local or online services?",
       header: "Service",
       options: [
         { label: "Local (Recommended)", description: "Uses local resources only, no external API calls, works offline" },
         { label: "Online", description: "Uses external APIs ({list available from .env}), requires internet" },
         { label: "Hybrid", description: "Local by default, online as fallback or for specific features" }
       ]
     }]
   })
   ```

4. Then proceed with implementation planning, incorporating the user's choice.

### Rule 6: Execute Actions Immediately

When user selects a menu option, you MUST execute it IMMEDIATELY. Do not just acknowledge.

**WRONG:**
```
User: 4
Claude: "I'll approve the plan and move it..."
(but doesn't actually move the file)
```

**CORRECT:**
```
User: 4
Claude: [Actually runs: mv plans/functional/x.md plans/implementation/]
        "Approved. Moved to implementation."
```

**Actions that MUST execute immediately:**
- `[4] approve` → Move file to next stage folder
- `[5] delete` → Delete the file
- `[7] start` → Move plan to in-progress, begin execution
- `create` → Create the file

**NEVER say you will do something without doing it.**

### Rule 7: Iron Loop Integration (Background Subagent)

When approving a plan from `implementation/` → `todo/`:

1. Move the plan to `todo/`
2. Show message: "Spawning Iron Loop integrator..."
3. **Launch background subagent**:
   ```
   Task(
     subagent_type: "general-purpose",
     run_in_background: true,
     prompt: "Apply Iron Loop to the plan at {plan-path}.
       1. Generate Steps 7-15 based on the implementation plan
       2. Self-critique each step for clarity, testability, specificity
       3. Refine until actionable (max 3 rounds)
       4. Append Steps 7-15 to the plan file
       5. Report completion"
   )
   ```
4. **Return to implementation plan list** with menu
5. Show message: "Plan moved to todo. Iron Loop integrating in background."

Steps 7-15 format (generated by background agent):
```markdown
## Execution Steps (Iron Loop 7-15)

### Step 7: TEST
- [ ] {specific test to write}

### Step 8: QUALITY
- [ ] {specific check to run}

### Step 9: IMPLEMENT
- [ ] {specific code change}

... (steps 10-15)
```

### Rule 8: Always Show Menu After Approval

After ANY approval action (functional→implementation, implementation→todo, review→done):

1. Show success message
2. **Return to the plan list** of the CURRENT stage (not the destination stage)
3. Show the appropriate menu

**NEVER** leave the user without a menu after approval. The workflow continues from the current stage, not jumps to the next.

---

## Menu Templates (USE THESE EXACTLY)

### Dashboard Menu (Agent Idle)
```
MENU

  [1] functional       Browse functional plans
  [2] implementation   Browse implementation plans
  [3] todo             Browse todo queue
  [4] in progress      Browse active work
  [5] review           Browse review queue
  [6] done             Browse completed
  ─────────────────────────────────────
  [7] start            Execute next from todo
  [8] release          Bump version
  [9] update           Update CTOC
  [0] back             Exit dashboard
```

### Dashboard Menu (Agent Running)
```
MENU

  [1] functional       Browse functional plans
  [2] implementation   Browse implementation plans
  [3] todo             Browse todo queue
  [4] in progress      Browse active work
  [5] review           Browse review queue
  [6] done             Browse completed
  ─────────────────────────────────────
  [7] stop after       Finish current, then stop
  [8] release          Bump version
  [9] update           Update CTOC
  [0] back             Exit dashboard
```

**Note:** Dashboard shows counts only, not individual plan names. Browse a stage to see plans.

### Browse List Menu
```
[{Stage}] ({count} items)

  [1] {filename}
  [2] {filename}
  [3] {filename}
  ─────────────────────────────────────
  [{n}] create     Create new plan
  [0] back         Return to dashboard
```

### Action Menu (after selecting a plan)
```
[{Stage}] {filename}

  [1] view        Show plan contents
  [2] edit        Modify plan
  [3] discuss     Critique and refine
  [4] approve     Move to next stage
  [5] delete      Remove plan
  [0] back        Return to list
```

### Discussion Menu
```
[Discussion] {filename}

  [1] view        Show full plan
  [2] edit        Make changes
  [3] discuss     Another feedback round
  [4] approve     Move to next stage
  [5] delete      Remove plan
  [0] back        Return to list
```

### Input Request Menu
```
{Your question here}

  [0] cancel      Return to previous
```

### Review Menu (after selecting a plan in review)
```
[Review] {filename}

  [1] view        Show full plan
  [2] approve     Move to done
  [3] feedback    Provide feedback → send to functional
  [4] rework      Provide feedback → send to implementation
  [0] back        Return to list
```

**Feedback flow:**
- [3] feedback → Ask for feedback, then move plan to `functional/` for requirements rework
- [4] rework → Ask for feedback, then move plan to `implementation/` for technical rework

---

## Iron Loop Auto-Pilot

**IMPORTANT:** Check after showing dashboard:
- If Todo has plans AND Agent is idle → **Auto-pick up and implement**
- If In Progress complete → **Auto-move to Review**
- If Review approved → **Auto-move to Done**

### Auto-Pickup Behavior

After showing dashboard, automatically check:
1. Is Agent idle? (no active implementation)
2. Is Todo > 0? (plans waiting in `todo/`)

If BOTH true:
1. Announce: "Auto-picking up: {plan-name}"
2. Move plan from `todo/` → `in-progress/`
3. Set agent status to active via `setAgentStatus()`
4. Spawn background agent with Task tool:
   ```
   Task(
     subagent_type: "general-purpose",
     run_in_background: true,
     prompt: "Execute the plan at {plan-path}. Follow Steps 7-15 in order. Mark each checkbox [x] when complete. When Step 15 is done, move plan to review."
   )
   ```
5. Dashboard shows: "● Active: {plan-name} | Step {n}/15"

### Iron Loop Integration on Approval

When a plan moves from `implementation/` to `todo/`:
1. The `approvePlan()` function moves the plan to `todo/`
2. A **background subagent** is spawned to run the Integrator + Critic refinement loop
3. The main conversation immediately returns to the implementation plan list with menu
4. Detailed execution steps (7-15) are generated asynchronously and appended to the plan
5. If max rounds reached without all 5/5 scores, deferred questions are noted
6. User can check progress via the Todo tab

## Dashboard Format

```
CTOC v{version}
────────────────────────────────────────────────────────────

┌────────────────┬────────┬─────────────────┐
│ Stage          │ Count  │ Status          │
├────────────────┼────────┼─────────────────┤
│ Functional     │ {n}    │ {status}        │
│ Implementation │ {n}    │ {status}        │
│ Todo           │ {n}    │ {status}        │
│ In Progress    │ {n}    │ {status}        │
│ Review         │ {n}    │ {status}        │
│ Done           │ {n}    │ {status}        │
└────────────────┴────────┴─────────────────┘

AGENT
  ● Active: {task} | Step {n}/15
  ○ Idle

────────────────────────────────────────────────────────────
MENU

  [1] functional       Browse functional plans
  [2] implementation   Browse implementation plans
  [3] todo             Browse todo queue
  [4] in progress      Browse active work
  [5] review           Browse review queue
  [6] done             Browse completed
  ─────────────────────────────────────
  [7] release          Bump version
  [8] update           Update CTOC
  [9] settings         Configuration
  [0] back             Exit dashboard
```

## Browse View Format

```
[{stage}] ({count} items)

  [1] {filename}
  [2] {filename}
  [3] {filename}
  ...
  [0] back    [p] prev    [n] next     ← only show [p]/[n] when >1 page
```

## Action Menu Format (after selecting a file)

```
Selected: {filename}

★ [1] view      Show plan contents
  [2] edit      Modify plan
  [3] discuss   Critique and refine
  [4] approve   Move to next stage
  [5] delete    Remove plan
  [0] back      Return to list
```

- Star (★) indicates recommended action
- Always show reasoning: "→ Recommended: [n] because {reason}"

## Folder Mapping (Flat Structure)

| # | Stage | Folder |
|---|-------|--------|
| 1 | functional | `plans/functional/` |
| 2 | implementation | `plans/implementation/` |
| 3 | todo | `plans/todo/` |
| 4 | in progress | `plans/in-progress/` |
| 5 | review | `plans/review/` |
| 6 | done | `plans/done/` |

## Handling User Input

**Context-aware:** After showing a numbered menu, interpret digits as selection.

| Input | Action |
|-------|--------|
| `1-9` | Select menu item |
| `0` | Go back to parent |
| Action word | Execute action (create, edit, delete, etc.) |
| Natural language | Interpret and execute |

**NO letter shortcuts.** All navigation uses numbers only.

## Start Implementation [7]

When user selects `[7] start` from dashboard:

**If todo is empty:** Show "No plans in todo queue."

**If todo has plans:** Spawn a CONTINUOUS background agent that processes ALL plans:

```
Task(
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "You are the CTOC Executor. Process ALL plans in the todo queue continuously.

LOOP:
1. List plans in plans/todo/
2. If empty → report 'Todo queue empty. Returning to idle.' and EXIT
3. Pick the OLDEST plan (by filename or creation date)
4. Move plan from todo/ → in-progress/
5. Read the plan file
6. Execute Steps 7-15 in order:
   - For each step, perform the actions listed
   - Mark checkbox [x] when complete
   - If a step fails, note the error and continue
7. When Step 15 complete → move plan from in-progress/ → review/
8. GOTO step 1 (pick up next plan)

RULES:
- Process plans ONE AT A TIME
- Do NOT stop until todo queue is empty
- Mark checkboxes as you complete steps
- Move completed plans to review/
- Report progress: 'Completed: {plan-name}. Checking for more...'

Project path: {projectPath}
Plans directory: {projectPath}/plans/"
)
```

**After spawning:**
1. Show dashboard with: "● Active: Processing todo queue"
2. User can continue other work
3. Agent runs until todo is empty

**Agent behavior:**
- Picks up plans in FIFO order
- Executes Iron Loop steps 7-15
- Moves completed plans to review
- Automatically picks up next plan
- Stops only when todo queue is empty

## Stop After Current [7] (When Agent Running)

When user selects `[7] stop after` while agent is running:

1. Create a stop flag file: `plans/.stop-after-current`
2. Show message: "Agent will stop after completing current plan."
3. The running agent checks for this flag after each plan:
   - If flag exists → delete flag, report "Stopped as requested.", EXIT
   - If flag not exists → continue to next plan

**Agent must check for stop flag:**
```
After completing each plan:
1. Check if plans/.stop-after-current exists
2. If yes:
   - Delete the flag file
   - Report "Stopped after {plan-name} as requested."
   - EXIT (do not process more plans)
3. If no:
   - Continue to next plan in todo
```

This allows graceful stop without interrupting current work.

## Discuss Action (Iron Loop Critical Review)

When user says "discuss" or selects discuss option:

1. **Critique** - Find gaps, question assumptions, identify risks

2. **Present Options** - For each decision point:
   ```
   Option A: {name}
     Pros: ...
     Cons: ...

   Option B: {name}
     Pros: ...
     Cons: ...

   → Recommended: {A/B} because {reasoning}
   ```

3. **Ask Questions** - Clarify ambiguous requirements

4. **Refine** - Update plan based on user input

**RULES:**
- User controls discussion - NEVER say "discussion complete"
- Always show discuss option
- User decides when ready - only user can approve
- Show reasoning for recommendations

## Actions Per Stage

| Action | Description |
|--------|-------------|
| create | Create new plan |
| view | Show plan contents |
| edit | Modify plan |
| discuss | Critique and refine |
| approve | Move to next stage |
| delete | Remove plan |
| rename | Rename plan |
| move | Move to specific stage |

---

## Background Processing Rules (MANDATORY)

**Core Principle:** Give control back to the user immediately. Background agents handle heavy lifting asynchronously.

### Rule B1: Spawn on Transition

Every stage transition spawns a background agent for the NEXT stage's work:

| Transition | Background Agent | Purpose |
|------------|------------------|---------|
| create functional | Research Assistant | Find related code, check duplicates |
| functional → implementation | Implementation Planner | Generate impl details (3-5 rounds) |
| implementation → todo | Iron Loop Integrator | Generate Steps 7-15 |
| in-progress → review | Review Preparer | Generate review summary |
| select discuss | Critic | Pre-generate critique points |

**How to spawn:**
```javascript
Task({
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "<agent-specific prompt>"
})
```

### Rule B2: Status Indicators

Show processing status in lists with icons:

| Icon | Status | Meaning |
|------|--------|---------|
| `○` | none | No background work pending |
| `◐` | working | Background agent working |
| `●` | complete | Background work complete |
| `⚠` | needs-input | Background agent hit a question |
| `✗` | timeout | Agent timed out (5 min) |

Plans display as: `[1] ◐ my-plan.md` (working) or `[1] ● my-plan.md` (ready)

### Rule B3: Immediate Return

After spawning any background agent:
1. Show confirmation message with agent name
2. **Return to list immediately**
3. Do NOT wait for agent to complete
4. User can continue working on other plans

**Example flow:**
```
User: [3] approve (on functional plan)
Claude:
  1. Moves plan to implementation/
  2. Writes status file (working)
  3. Shows: "✓ Moved to implementation. Spawning Implementation Planner..."
  4. Spawns background Task()
  5. Returns to functional list immediately
```

### Rule B4: Status Files

Background agents write status to `{plan-path}.status`:

```json
{
  "agent": "implementation-planner",
  "status": "working",
  "started": "2025-01-31T12:00:00Z",
  "completed": null,
  "message": "Generating implementation details...",
  "updatedAt": "2025-01-31T12:00:00Z"
}
```

When complete:
```json
{
  "agent": "implementation-planner",
  "status": "complete",
  "started": "2025-01-31T12:00:00Z",
  "completed": "2025-01-31T12:00:30Z",
  "message": "Generated 5 files to modify",
  "updatedAt": "2025-01-31T12:00:30Z"
}
```

### Rule B5: Lazy Loading Results

When user VIEWS a plan:
1. Check status file for processing state
2. If `complete` → results are already in plan file, show normally
3. If `working` → show "⏳ Processing..." with agent name and elapsed time
4. If `needs-input` → show the question and prompt for input
5. If `timeout` → show retry option

**Display for working status:**
```
⏳ Implementation Planner working... (30s)

The background agent is generating implementation details.
You can wait or press [0] to go back.

  [R] Retry    Start a new agent
  [0] Back     Return to list
```

### Rule B6: Agent Timeout

Background agents timeout after 5 minutes:
- Status changes to `timeout`
- User can retry via `[R] Retry` option in menu
- Stale status files are cleaned up periodically

### Background Agent Prompts

#### Research Assistant (on plan creation)
```
Task({
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "Research context for new plan at {plan-path}.

    1. Search codebase for related patterns (Grep/Glob)
    2. Check for similar existing plans in plans/ (avoid duplicates)
    3. Identify relevant files that will likely be touched
    4. Generate initial discussion points/questions

    WRITE findings to plan file under '## Research Notes'
    UPDATE status file to 'complete' when done:
    fs.writeFileSync('{plan-path}.status', JSON.stringify({
      agent: 'research-assistant',
      status: 'complete',
      message: 'Found {n} related files'
    }))
  "
})
```

#### Implementation Planner (functional → implementation)
```
Task({
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "Generate implementation plan for {plan-path}.

    LOOP (3-5 rounds):
    1. Read the functional requirements
    2. Generate implementation details:
       - Files to modify/create
       - Code changes per file
       - Dependencies needed
       - CLI exposure if applicable
    3. Self-critique:
       - Are requirements fully addressed?
       - Any security concerns?
       - Is it testable?
       - Edge cases covered?
    4. Refine based on critique
    5. If score >= 4/5 on all dimensions, exit early

    WRITE result to plan file under '## Implementation Details'
    UPDATE status file to 'complete'
  "
})
```

#### Iron Loop Integrator (implementation → todo)
```
Task({
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "Apply Iron Loop to {plan-path}.

    1. Generate Steps 7-15 based on implementation plan
    2. Self-critique each step for clarity, testability, specificity
    3. Refine until actionable (max 3 rounds)
    4. Append Steps 7-15 to the plan file
    5. Update status file to 'complete'
  "
})
```

#### Review Preparer (in-progress → review)
```
Task({
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "Prepare review summary for {plan-path}.

    1. Compare implementation to original functional requirements
    2. Verify test coverage (check for test files created)
    3. Check for TODO/FIXME comments left behind
    4. Identify any deviations from plan
    5. Generate review checklist

    WRITE to plan file under '## Review Summary'
    UPDATE status file to 'complete'
  "
})
```

#### Critic (discussion mode)
```
Task({
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "Critique plan at {plan-path}.

    1. Find gaps in requirements
    2. Question assumptions
    3. Identify risks
    4. Suggest alternatives
    5. Rate overall readiness (1-5)

    WRITE critique to {plan-path}.critique file
    UPDATE status file to 'complete'
  "
})
```

### Workflow Example

```
User: ctoc plan new "Add dark mode"
Claude: ✓ Created plans/functional/add-dark-mode.md
        Spawning Research Assistant in background...

[Functional] (3 plans)
  [1] ○ other-plan.md
  [2] ○ another-plan.md
  [3] ◐ add-dark-mode.md    ← Research running
  ─────────────────────
  [4] create
  [0] back

# User can immediately work on other plans while research runs

# 10 seconds later, user checks again:
[Functional] (3 plans)
  [1] ○ other-plan.md
  [2] ○ another-plan.md
  [3] ● add-dark-mode.md    ← Research complete, has notes

User: 3
Claude: [shows plan with Research Notes section already populated]

User: 4 (approve)
Claude: ✓ Moved to implementation. Spawning Implementation Planner...

[Functional] (2 plans)       ← Back to functional list
  [1] ○ other-plan.md
  [2] ○ another-plan.md
  ─────────────────────
  [3] create
  [0] back

# User continues working. Meanwhile, implementation details are being generated.

User: 0 → 2 (go to implementation tab)

[Implementation] (1 plan)
  [1] ● add-dark-mode.md    ← Already has full implementation details!
```

### Summary

**Before:** User waits 5-30 seconds at each transition while Claude processes.

**After:** User gets control back immediately. Background agents prepare the next stage's content. By the time user looks at a plan, it's already been processed and refined.

**Key Principle:** The terminal belongs to the user. Claude works in the background.
