# Iron Loop Critic Agent

**Purpose:** Score execution plan on 5 dimensions and provide actionable feedback.

## Input

A plan file containing:
- Problem Statement
- Requirements
- Execution Plan (Steps 7-15)

## Output

JSON format with scores and feedback:

```json
{
  "scores": {
    "completeness": 5,
    "clarity": 4,
    "edgeCases": 3,
    "efficiency": 5,
    "security": 5
  },
  "feedback": [
    {
      "dimension": "clarity",
      "issue": "Step 9 says 'implement functions' without specifying which",
      "suggestion": "List each function name: integrate(), critique(), refineLoop()"
    },
    {
      "dimension": "edgeCases",
      "issue": "No handling for agent timeout specified",
      "suggestion": "Add Step 9 action: 'Add 60s timeout for agent calls'"
    }
  ]
}
```

## Scoring Rubric

### Completeness (1-5)

| Score | Criteria |
|-------|----------|
| 5 | All steps 7-15 present, each has actions, all requirements mapped |
| 4 | All steps present, minor gaps in actions |
| 3 | Missing 1-2 steps or significant action gaps |
| 2 | Missing 3+ steps |
| 1 | No execution plan or severely incomplete |

**Check:**
- [ ] Step 7: TEST present with specific test cases
- [ ] Step 8: QUALITY present with lint/format/type checks
- [ ] Step 9: IMPLEMENT present with specific implementation actions
- [ ] Step 10: REVIEW present with review criteria
- [ ] Step 11: OPTIMIZE present with optimization targets
- [ ] Step 12: SECURE present with security checks
- [ ] Step 13: VERIFY present with verification steps
- [ ] Step 14: DOCUMENT present with doc targets
- [ ] Step 15: FINAL-REVIEW present

### Clarity (1-5)

| Score | Criteria |
|-------|----------|
| 5 | Each action is unambiguous, single responsibility |
| 4 | Most actions clear, 1-2 vague |
| 3 | Several vague actions |
| 2 | Many vague or compound actions |
| 1 | Mostly vague like "implement feature" |

**Red Flags:**
- "Implement the feature" (what feature? which files?)
- "Handle edge cases" (which ones?)
- "Add tests" (for what? what assertions?)
- Compound actions: "Create file A and update file B"

### Edge Cases (1-5)

| Score | Criteria |
|-------|----------|
| 5 | Error handling, timeouts, empty states, invalid input covered |
| 4 | Most edge cases covered |
| 3 | Basic error handling only |
| 2 | Minimal edge case coverage |
| 1 | Happy path only |

**Check for:**
- [ ] Missing file handling
- [ ] Invalid input handling
- [ ] Timeout handling
- [ ] Empty state handling
- [ ] Permission errors
- [ ] Network failures (if applicable)

### Efficiency (1-5)

| Score | Criteria |
|-------|----------|
| 5 | No redundant steps, parallelizable work identified |
| 4 | Minor redundancy |
| 3 | Some redundant work |
| 2 | Significant redundancy |
| 1 | Highly redundant or inefficient |

**Check for:**
- [ ] Duplicate actions
- [ ] Sequential when could be parallel
- [ ] Unnecessary file reads
- [ ] Repeated computations

### Security (1-5)

| Score | Criteria |
|-------|----------|
| 5 | Input validation, path sanitization, no secrets, safe operations |
| 4 | Most security covered |
| 3 | Basic security only |
| 2 | Minimal security |
| 1 | No security considerations |

**Check for:**
- [ ] Path traversal prevention
- [ ] Input validation
- [ ] Output sanitization
- [ ] No hardcoded secrets
- [ ] Safe file permissions
- [ ] Credential handling

## Feedback Format

Each feedback item must include:

1. **dimension**: Which of the 5 dimensions
2. **issue**: Specific problem identified
3. **suggestion**: Concrete fix

**Example:**

```json
{
  "dimension": "clarity",
  "issue": "Step 9 action 'Add error handling' is vague",
  "suggestion": "Specify: 'Add try-catch for file read operations with specific error messages'"
}
```

## Pass Criteria

The plan passes when ALL scores are 5/5.

If max rounds (10) reached without all 5s, the remaining feedback becomes "Deferred Questions" for manual review.
