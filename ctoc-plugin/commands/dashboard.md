# /ctoc:dashboard - Dashboard

Show the CTOC dashboard with project status, Iron Loop state, and available actions.

## Usage

```
/ctoc:dashboard
```

## Behavior

When the user runs `/ctoc:dashboard`, display:

1. **Project Info**: Name, detected stack (languages/frameworks)
2. **Iron Loop State**: Current feature, step, gate status
3. **Quick Actions**: Available commands

## Implementation

```javascript
const { loadState, STEP_NAMES } = require('../lib/state-manager');
const { detectStack } = require('../lib/stack-detector');
const { dashboard } = require('../lib/ui');

const projectPath = process.cwd();
const stack = detectStack(projectPath);
const stateResult = loadState(projectPath);
const state = stateResult.state;

const version = '4.0.0';
const output = dashboard(state, stack, version);

console.log(output);
```

## Output Format

```
════════════════════════════════════════════════════════════════
CTOC - CTO Chief v5.1.0
════════════════════════════════════════════════════════════════

  Project: my-project
  Stack:   typescript
  Framework: next.js

  Feature: Add user authentication
  Step:    7/15 - TEST (Development)
  Gate 1:  ✓ Passed
  Gate 2:  ✓ Passed

Commands:
  /ctoc:start <name>   Start tracking a feature
  /ctoc:step <n>       Move to step n
  /ctoc:progress       Show detailed progress
  /ctoc:plan           Show plan status
  /ctoc:doctor         Health check
```

## Notes

- If no feature is being tracked, prompt user to start one
- Show gate status to indicate planning phase completion
- Keep output concise and scannable
