# CTOC Interface Redesign

---
status: todo
iron_loop: true
created: 2026-01-30
---

## Goal

Replace current CTOC command with interactive terminal UI featuring tabs, keyboard navigation, and full plan lifecycle management.

## Tab Structure

```
[Overview]  [Functional]  [Implementation]  [Review]  [Todo]  [Progress]  [Tools]
```

- Human-facing: Functional, Implementation, Review
- Agent-facing: Todo, Progress

---

## Iron Loop Execution Plan

### Step 7: TEST

Write tests for:
- [ ] TUI engine (screen rendering, colors, keyboard input)
- [ ] Tab switching (left/right navigation)
- [ ] Navigation stack (back functionality)
- [ ] Plan file reading from directories
- [ ] Action execution (approve, reject, rename, delete)
- [ ] FIFO queue ordering (oldest first)
- [ ] Agent status display
- [ ] Revision metadata handling

### Step 8: QUALITY

- [ ] Lint all new files
- [ ] Type annotations where applicable
- [ ] Consistent code style with existing codebase

### Step 9: IMPLEMENT

#### Phase 1: Core Infrastructure

**1.1 Terminal UI Engine**
File: `ctoc-plugin/lib/tui.js`
- Screen rendering (clear, redraw)
- Color system (reuse existing c object)
- Line drawing (adaptive width)
- Keyboard input (raw mode)
- Navigation stack

**1.2 State Management**
File: `ctoc-plugin/lib/state.js`
- Plan file reading (functional/implementation/todo/review/done)
- Agent status tracking
- Settings persistence
- Navigation history stack

**1.3 Tab System**
File: `ctoc-plugin/lib/tabs.js`
- Tab definitions
- Tab rendering with highlight
- Left/right switching
- Active tab state

#### Phase 2: Tab Implementations

**2.1 Overview Tab**
File: `ctoc-plugin/tabs/overview.js`
- Plan counts (read directories)
- Agent status display (step, task, elapsed)
- Idle state

**2.2 Functional Tab**
File: `ctoc-plugin/tabs/functional.js`
- List drafts from `plans/functional/draft/`
- Arrow/number navigation
- Action menu: View, Plan, Approve, Rename, Delete, Assign (dangerous)
- Assign confirmation with warning
- Empty state

**2.3 Implementation Tab**
File: `ctoc-plugin/tabs/implementation.js`
- List drafts from `plans/implementation/draft/`
- Action menu: View, Plan, Approve → Iron Loop → Todo, Rename, Delete
- Empty state

**2.4 Review Tab**
File: `ctoc-plugin/tabs/review.js`
- List from `plans/review/`
- Action menu: View functional/impl/AI summary/code, Approve, Reject
- Reject feedback input (multi-line)
- Direct typing for quick feedback

**2.5 Todo Tab**
File: `ctoc-plugin/tabs/todo.js`
- FIFO queue from `plans/todo/` (oldest first)
- Action menu: View, Move up, Move down, Remove
- Empty state

**2.6 Progress Tab**
File: `ctoc-plugin/tabs/progress.js`
- In Progress section (current agent work)
- Finished section (scrollable, numbered, last 10)
- View action only

**2.7 Tools Tab**
File: `ctoc-plugin/tabs/tools.js`
- Doctor: health checks + interactive questions
- Update: version check
- Settings: toggles/edits

#### Phase 3: Actions & Flows

**3.1 Plan Actions**
File: `ctoc-plugin/lib/actions.js`
- view(planPath)
- rename(planPath, newName)
- delete(planPath)
- approve(planPath, destination)
- applyIronLoop(planPath)
- reject(planPath, feedback)
- moveInQueue(planPath, direction)

**3.2 Revision System**
File: `ctoc-plugin/lib/revision.js`
- Add revision metadata to plan
- Prepend rejection reason
- Track completed work
- CTO-Chief context injection for agents

**3.3 Agent Integration**
File: `ctoc-plugin/lib/agent.js`
- Read agent status
- Track elapsed time
- Current task display
- FIFO queue picking (oldest first, always)
- Auto-pick on agent idle
- CTO-Chief context injection for revisions

#### Phase 4: Entry Point

**4.1 Main Command**
File: `ctoc-plugin/commands/ctoc.js`
- Initialize TUI
- Start on Overview tab
- Main event loop
- Keyboard handler
- Clean exit

### Step 10: REVIEW

- [ ] Self-review all code
- [ ] Check keyboard shortcuts consistency
- [ ] Verify all flows work end-to-end

### Step 11: OPTIMIZE

- [ ] Fast rendering (minimize redraws)
- [ ] Efficient file reading (cache where sensible)

### Step 12: SECURE

- [ ] No arbitrary code execution
- [ ] Safe file operations (within plans directory)
- [ ] Input sanitization for plan names

### Step 13: DOCUMENT

- [ ] Update README with new /ctoc command
- [ ] Keyboard shortcuts reference
- [ ] Flow diagrams

### Step 14: VERIFY

- [ ] Run full test suite
- [ ] Manual testing of all tabs
- [ ] Edge cases (empty states, long names, narrow terminals)

### Step 15: COMMIT

- [ ] Commit with version bump

---

## File Structure

```
ctoc-plugin/
├── commands/
│   └── ctoc.js              # Entry point
├── lib/
│   ├── tui.js               # Terminal UI engine
│   ├── state.js             # State management
│   ├── tabs.js              # Tab system
│   ├── actions.js           # Plan actions
│   ├── revision.js          # Revision system
│   └── agent.js             # Agent integration
└── tabs/
    ├── overview.js
    ├── functional.js
    ├── implementation.js
    ├── review.js
    ├── todo.js
    ├── progress.js
    └── tools.js
```

---

## Dependencies

None external. Uses only:
- Node.js built-ins (fs, path, readline)
- process.stdin.setRawMode(true)
- process.stdout (columns, write, clear)

---

## Implementation Order

1. tui.js — rendering foundation
2. tabs.js — tab switching
3. state.js — data reading
4. ctoc.js — entry point (basic loop)
5. overview.js — first working tab
6. functional.js — list + actions
7. actions.js — plan operations
8. implementation.js
9. todo.js
10. progress.js
11. review.js — most complex (feedback flow)
12. revision.js — rejection handling
13. tools.js — doctor, update, settings
14. agent.js — agent status integration

---

## Key Behaviors

### Navigation
- `←/→` Switch tabs
- `↑/↓` Navigate lists
- `1-9` Jump to item
- `Enter` Select/confirm
- `b/Esc` Back (stack-based)
- `q` Quit

### FIFO Queue (Critical)
- Agents ALWAYS pick oldest item first
- Ensures dependencies are respected
- Manual reordering via Move up/down only

### Revision Flow
1. Review → Reject with feedback
2. Feedback prepended to plan
3. Plan tagged `revision: N`
4. Moved to Functional draft
5. Human updates plan
6. Normal flow, but CTO-Chief injects revision context to agents
7. Agents focus only on fixing rejection reason
