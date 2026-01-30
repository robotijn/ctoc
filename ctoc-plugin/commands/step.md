# /ctoc:step - Move to Step

Move to a specific Iron Loop step.

## Usage

```
/ctoc:step <number>
```

## Arguments

- `number`: Step number 1-15 (required)

## Behavior

1. Validates step number (1-15)
2. Checks if feature is being tracked
3. Updates current step
4. Marks previous steps as completed if moving forward
5. Warns if gates not passed when moving past gate checkpoints

## Implementation

```javascript
const { loadState, saveState, STEP_NAMES, STEP_DESCRIPTIONS } = require('../lib/state-manager');

const stepNum = parseInt(args.trim(), 10);

if (isNaN(stepNum) || stepNum < 1 || stepNum > 15) {
  throw new Error('Step must be 1-15. Usage: /ctoc step <number>');
}

const projectPath = process.cwd();
const stateResult = loadState(projectPath);

if (!stateResult.state || !stateResult.state.feature) {
  throw new Error('No feature being tracked. Use /ctoc:start first.');
}

const state = stateResult.state;
const prevStep = state.currentStep;
state.currentStep = stepNum;

// Mark previous steps as completed if moving forward
if (stepNum > prevStep) {
  for (let i = prevStep; i < stepNum; i++) {
    if (!state.steps[i]) {
      state.steps[i] = {
        status: 'completed',
        timestamp: new Date().toISOString()
      };
    }
  }
}

saveState(projectPath, state);

let output = '';

// Gate warnings
if (stepNum > 3 && !state.gate1_approval) {
  output += 'Note: Gate 1 not yet passed (functional planning)\n';
}
if (stepNum > 6 && !state.gate2_approval) {
  output += 'Note: Gate 2 not yet passed (technical planning)\n';
}

output += `\nMoved to step ${stepNum}: ${STEP_NAMES[stepNum]}\n`;
output += `${STEP_DESCRIPTIONS[stepNum]}\n`;

console.log(output);
```

## Output Format

```
Moved to step 7: TEST
Write failing tests (TDD Red)
```

Or with gate warning:

```
Note: Gate 2 not yet passed (technical planning)

Moved to step 7: TEST
Write failing tests (TDD Red)
```

## Step Reference

| Step | Name | Phase | Description |
|------|------|-------|-------------|
| 1 | ASSESS | Planning | Assess the problem and context |
| 2 | ALIGN | Planning | Align with user goals and business objectives |
| 3 | CAPTURE | Planning | Capture requirements and success criteria |
| 4 | PLAN | Planning | Plan the technical approach |
| 5 | DESIGN | Planning | Design the architecture |
| 6 | SPEC | Planning | Write detailed specifications |
| 7 | TEST | Development | Write failing tests (TDD Red) |
| 8 | QUALITY | Development | Run quality checks |
| 9 | IMPLEMENT | Development | Implement to make tests pass |
| 10 | REVIEW | Development | Code review against CTO profile |
| 11 | OPTIMIZE | Delivery | Optimize for performance |
| 12 | SECURE | Delivery | Security audit |
| 13 | DOCUMENT | Delivery | Update documentation |
| 14 | VERIFY | Delivery | Run full test suite |
| 15 | COMMIT | Delivery | Commit with verification |

## Notes

- Gates must be passed before Edit/Write is allowed at step 7+
- Moving backward is allowed (for revisiting steps)
- Step state is cryptographically signed
