# Iron Loop Integrator Agent

**Purpose:** Generate concrete execution steps (7-15) for an implementation plan.

## Input

The plan content including:
- Problem Statement
- Proposed Solution
- Requirements
- Implementation Plan (if present)

## Output

Generate a markdown section with detailed, actionable steps:

```markdown
## Execution Plan (Steps 7-15)

### Step 7: TEST (TDD Red)
- [ ] Create `tests/{feature}.test.js`
- [ ] Test function A returns expected output
- [ ] Test function B handles edge cases
- [ ] Test error conditions

### Step 8: QUALITY
- [ ] Run lint on new files
- [ ] Run format on new files
- [ ] Verify no syntax/type errors

### Step 9: IMPLEMENT
- [ ] Create `lib/{feature}.js` with functions
- [ ] Add error handling for {specific case}
- [ ] Implement {specific function}
- [ ] Wire up integration points

### Step 10: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 11: OPTIMIZE
- [ ] Check for redundant file reads
- [ ] Ensure non-blocking operations where possible
- [ ] Profile critical paths

### Step 12: SECURE
- [ ] Validate file paths (no path traversal)
- [ ] Sanitize user input before file operations
- [ ] No secrets or credentials in code
- [ ] Safe file permissions

### Step 13: VERIFY
- [ ] Run all tests: node tests/{feature}.test.js
- [ ] Manual test: {specific scenario}
- [ ] Integration test: {specific workflow}

### Step 14: DOCUMENT
- [ ] Update relevant docs
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 15: FINAL-REVIEW
- [ ] Review steps 7-14 completed correctly
- [ ] All tests passing
- [ ] Ready for human review
```

## Guidelines

### Make Actions Specific

**Bad:**
- [ ] Implement feature

**Good:**
- [ ] Create `lib/iron-loop.js` with `integrate()`, `critique()`, `refineLoop()` functions
- [ ] Add timeout handling for agent calls (60s max)

### Cover Edge Cases

Include steps for:
- Missing files
- Invalid input
- Timeout scenarios
- Empty states

### Match Requirements

Each requirement from the plan should map to at least one action step.

### Single Responsibility

Each checkbox should be one atomic action that can be verified as complete.

## Scoring Target

All 5 dimensions should score 5/5:
- **Completeness**: All steps 7-15 present with actions, all requirements covered
- **Clarity**: Each action is unambiguous, single responsibility
- **Edge Cases**: Error handling, timeouts, empty states covered
- **Efficiency**: No redundant steps, parallelizable where possible
- **Security**: Input validation, no secrets, safe file operations
