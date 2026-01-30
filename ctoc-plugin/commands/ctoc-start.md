# /ctoc start - Start Feature Tracking

Start tracking a new feature in the Iron Loop.

## Usage

```
/ctoc start <feature-name>
```

## Arguments

- `feature-name`: Name of the feature to track (required)

## Behavior

1. Creates new Iron Loop state with feature name
2. Sets current step to 1 (ASSESS)
3. Marks session as active
4. Returns confirmation with next steps

## Implementation

```javascript
const { createState, saveState, STEP_NAMES, STEP_DESCRIPTIONS } = require('../lib/state-manager');
const { detectStack } = require('../lib/stack-detector');

const featureName = args.trim();
if (!featureName) {
  throw new Error('Feature name required. Usage: /ctoc start <feature-name>');
}

const projectPath = process.cwd();
const stack = detectStack(projectPath);

const state = createState(
  projectPath,
  featureName,
  stack.primary.language,
  stack.primary.framework
);

saveState(projectPath, state);

console.log(`
Started tracking: ${featureName}
Step 1: ASSESS - ${STEP_DESCRIPTIONS[1]}

Begin by assessing the problem space. Ask:
  • What business problem are we solving?
  • Who is affected?
  • What does success look like?
`);
```

## Output Format

```
Started tracking: Add user authentication
Step 1: ASSESS - Assess the problem and context

Begin by assessing the problem space. Ask:
  • What business problem are we solving?
  • Who is affected?
  • What does success look like?
```

## Notes

- Feature name is sanitized (no path traversal, shell chars)
- Maximum 100 characters for feature name
- Previous state is overwritten (one feature at a time)
