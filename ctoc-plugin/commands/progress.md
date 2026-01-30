# /ctoc:progress - Show Progress

Show detailed Iron Loop progress for the current feature.

## Usage

```
/ctoc:progress
```

## Behavior

1. Loads current Iron Loop state
2. Displays all 15 steps with completion status
3. Shows phase groupings (Planning, Development, Delivery)
4. Shows gate status

## Implementation

```javascript
const { loadState } = require('../lib/state-manager');
const { progress } = require('../lib/ui');

const projectPath = process.cwd();
const stateResult = loadState(projectPath);

console.log(progress(stateResult.state));
```

## Output Format

```
Iron Loop Progress

  Feature: Add user authentication

  Planning (1-6)
    ✓  1. ASSESS     Assess the problem and context
    ✓  2. ALIGN      Align with user goals and business objectives
    ✓  3. CAPTURE    Capture requirements and success criteria
    ✓  4. PLAN       Plan the technical approach
    ✓  5. DESIGN     Design the architecture
    ✓  6. SPEC       Write detailed specifications

  Development (7-10)
    ▶  7. TEST       Write failing tests (TDD Red)
    ○  8. QUALITY    Run quality checks
    ○  9. IMPLEMENT  Implement to make tests pass
    ○ 10. REVIEW     Code review against CTO profile

  Delivery (11-15)
    ○ 11. OPTIMIZE   Optimize for performance
    ○ 12. SECURE     Security audit
    ○ 13. DOCUMENT   Update documentation
    ○ 14. VERIFY     Run full test suite
    ○ 15. COMMIT     Commit with verification

  Gates
    Gate 1 (after step 3): ✓ Passed
    Gate 2 (after step 6): ✓ Passed
```

## Status Icons

- `✓` - Completed
- `▶` - Current step
- `○` - Pending

## Notes

- If no feature is tracked, prompt to start one
- Color coding for better visibility
- Phases help understand overall progress
