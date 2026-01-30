# /ctoc doctor - Health Check

Run installation health check for CTOC.

## Usage

```
/ctoc doctor
```

## Behavior

1. Checks core files and directories
2. Verifies dependencies (Node.js, git)
3. Shows current state info
4. Reports any issues

## Implementation

```javascript
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadState } = require('../lib/state-manager');
const { doctor } = require('../lib/ui');
const { CTOC_HOME } = require('../lib/crypto');

const projectPath = process.cwd();

const checks = [];

// Core Files
const coreFiles = {
  name: 'Core Files',
  items: []
};

// Check state directory
if (fs.existsSync(path.join(CTOC_HOME, 'state'))) {
  coreFiles.items.push({ ok: true, label: 'State directory' });
} else {
  coreFiles.items.push({ ok: false, label: 'State directory missing' });
}

// Check secret file
if (fs.existsSync(path.join(CTOC_HOME, '.secret'))) {
  coreFiles.items.push({ ok: true, label: 'Secret file (for signing)' });
} else {
  coreFiles.items.push({ warn: true, label: 'Secret file (will be created)' });
}

// Check plans directory
if (fs.existsSync(path.join(projectPath, 'plans'))) {
  coreFiles.items.push({ ok: true, label: 'Plans directory' });
} else {
  coreFiles.items.push({ warn: true, label: 'Plans directory missing' });
}

checks.push(coreFiles);

// Dependencies
const deps = {
  name: 'Dependencies',
  items: []
};

try {
  const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
  deps.items.push({ ok: true, label: `Node.js ${nodeVersion}` });
} catch (e) {
  deps.items.push({ ok: false, label: 'Node.js not found' });
}

try {
  const gitVersion = execSync('git --version', { encoding: 'utf8' }).trim();
  deps.items.push({ ok: true, label: gitVersion });
} catch (e) {
  deps.items.push({ ok: false, label: 'git not found' });
}

checks.push(deps);

// State
const stateSection = {
  name: 'State',
  items: []
};

const stateResult = loadState(projectPath);
if (stateResult.state?.feature) {
  stateSection.items.push({
    ok: true,
    label: `Tracking: ${stateResult.state.feature} (step ${stateResult.state.currentStep})`
  });
} else {
  stateSection.items.push({ ok: true, label: 'No feature being tracked' });
}

if (stateResult.valid) {
  stateSection.items.push({ ok: true, label: 'State signature valid' });
} else if (stateResult.error && stateResult.error !== 'No state file') {
  stateSection.items.push({ ok: false, label: `State error: ${stateResult.error}` });
}

checks.push(stateSection);

console.log(doctor(checks, '4.0.0'));
```

## Output Format

```
CTOC Doctor - Health Check

[Core Files]
  ✓ State directory
  ✓ Secret file (for signing)
  ✓ Plans directory

[Dependencies]
  ✓ Node.js v20.10.0
  ✓ git version 2.43.0

[State]
  ✓ Tracking: Add user authentication (step 7)
  ✓ State signature valid

Doctor check complete
```

## Status Icons

- `✓` - OK
- `⚠` - Warning (non-blocking)
- `✗` - Error (needs attention)

## Checked Items

1. **State directory**: `~/.ctoc/state/`
2. **Secret file**: `~/.ctoc/.secret` (for HMAC signing)
3. **Plans directory**: `./plans/`
4. **Node.js**: Required for hooks
5. **Git**: Required for version control
6. **Current state**: Feature tracking status
7. **Signature**: State file integrity

## Notes

- Warnings don't block operation
- Errors should be resolved for full functionality
- State signature verification prevents tampering
