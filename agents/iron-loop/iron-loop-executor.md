# Iron Loop Executor Agent

**Purpose:** Execute plans from the todo queue following Iron Loop steps 7-15.

## CRITICAL RULES

### Rule 1: ONE PLAN AT A TIME

```
⛔ NEVER have more than ONE plan in plans/in-progress/

Before starting ANY plan:
1. Check: ls plans/in-progress/*.md
2. If count > 0 → STOP, wait for current to finish
3. If count = 0 → proceed with next plan
```

**Violation = immediate stop.** If you find 2+ plans in in-progress, move extras back to todo.

### Rule 2: FIFO Order (First In, First Out)

```
Always pick the OLDEST plan from todo:

ls -t plans/todo/*.md | tail -1

DO NOT cherry-pick plans. Process in order they arrived.
```

### Rule 3: Complete Before Moving

A plan moves to review ONLY when ALL steps 7-15 are complete:

```markdown
### Step 7: TEST
- [x] All tests written
- [x] All tests passing

### Step 8: QUALITY
- [x] Lint passes
- [x] Type check passes

... (all must be [x])

### Step 15: FINAL-REVIEW
- [x] All steps complete
- [x] Ready for review
```

## Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    EXECUTOR LOOP                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. CHECK in-progress count                                 │
│     │                                                       │
│     ├─ count > 0 → WAIT (do not proceed)                   │
│     │                                                       │
│     └─ count = 0 → continue                                │
│                                                              │
│  2. CHECK todo queue                                        │
│     │                                                       │
│     ├─ empty → EXIT "Todo queue empty"                     │
│     │                                                       │
│     └─ has plans → pick OLDEST                             │
│                                                              │
│  3. MOVE plan: todo/ → in-progress/                        │
│                                                              │
│  4. EXECUTE steps 7-15                                      │
│     │                                                       │
│     └─ Mark [x] as each completes                          │
│                                                              │
│  5. VERIFY all steps complete                               │
│                                                              │
│  6. MOVE plan: in-progress/ → review/                      │
│                                                              │
│  7. CHECK stop flag                                         │
│     │                                                       │
│     ├─ exists → delete flag, EXIT                          │
│     │                                                       │
│     └─ not exists → GOTO 1                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Pre-Flight Check

Before ANY execution, run this check:

```bash
# Count in-progress plans
IN_PROGRESS=$(ls plans/in-progress/*.md 2>/dev/null | wc -l)

if [ "$IN_PROGRESS" -gt 1 ]; then
  echo "ERROR: Multiple plans in progress ($IN_PROGRESS). Fix before continuing."
  exit 1
fi

if [ "$IN_PROGRESS" -eq 1 ]; then
  echo "INFO: Plan already in progress. Waiting..."
  exit 0
fi

# Check todo queue
TODO=$(ls plans/todo/*.md 2>/dev/null | wc -l)

if [ "$TODO" -eq 0 ]; then
  echo "INFO: Todo queue empty."
  exit 0
fi

# Get oldest plan (FIFO)
NEXT_PLAN=$(ls -t plans/todo/*.md | tail -1)
echo "Next plan: $NEXT_PLAN"
```

## Step Execution

For each step 7-15:

1. **Read** the checkbox items for that step
2. **Execute** each item
3. **Mark** checkbox `[x]` when complete
4. **Verify** step is fully done before moving to next

### Step 7: TEST
- Write tests first (TDD)
- Run tests, expect failures (red)
- Tests define expected behavior

### Step 8: QUALITY
- Run linter: `npm run lint` or equivalent
- Run type check: `npm run typecheck` or equivalent
- Fix any issues before proceeding

### Step 9: IMPLEMENT
- Write code to make tests pass
- Follow the implementation plan exactly
- Don't add unrequested features

### Step 10: REVIEW
- Self-review all changes
- Check integration points
- Verify error handling

### Step 11: OPTIMIZE
- Profile if needed
- Remove redundant operations
- Don't over-optimize

### Step 12: SECURE
- Validate inputs
- Check for secrets exposure
- Safe file operations

### Step 13: VERIFY
- Run ALL tests (not just new ones)
- Run exactly as CI does: `node --test --test-force-exit tests/*.test.js`
- Manual verification if specified

### Step 14: DOCUMENT
- Update docs if needed
- Add code comments where non-obvious
- Update CHANGELOG

### Step 15: FINAL-REVIEW
- All previous steps complete
- All tests passing
- Ready for human review

## Stop Flag

Check after each plan completion:

```bash
if [ -f "plans/.stop-after-current" ]; then
  rm plans/.stop-after-current
  echo "Stopped as requested."
  exit 0
fi
```

## Error Handling

If a step fails:
1. Note the error in the plan file
2. Continue to next step if possible
3. Mark step as incomplete with error note
4. Do NOT move to review if critical steps failed

## Output

After each plan:
```
Completed: {plan-name}
  Steps: 9/9 complete
  Tests: 24 passed, 0 failed
  Moving to: review/

Checking for more plans...
```
