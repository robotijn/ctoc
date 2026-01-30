# /ctoc plan - Plan Status

Show plan dashboard with functional and implementation plans.

## Usage

```
/ctoc plan
```

## Behavior

1. Scans plans/ directory for plan files
2. Categorizes by type (functional/implementation) and status (draft/approved)
3. Shows current feature if tracking

## Implementation

```javascript
const fs = require('fs');
const path = require('path');
const { loadState } = require('../lib/state-manager');
const { colors } = require('../lib/ui');

const projectPath = process.cwd();
const plansDir = path.join(projectPath, 'plans');
const c = colors;

function countPlans(subPath) {
  const dir = path.join(plansDir, subPath);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
}

let output = '\n';
output += `${c.cyan}Plan Dashboard${c.reset}\n\n`;

const sections = [
  { name: 'Functional Plans - Draft', path: 'functional/draft' },
  { name: 'Functional Plans - Approved', path: 'functional/approved' },
  { name: 'Implementation Plans - Draft', path: 'implementation/draft' },
  { name: 'Implementation Plans - Approved', path: 'implementation/approved' },
  { name: 'In Progress', path: 'in_progress' },
  { name: 'In Review', path: 'review' },
  { name: 'Done', path: 'done' }
];

for (const section of sections) {
  const files = countPlans(section.path);
  if (files.length > 0) {
    output += `  ${c.bold}${section.name}${c.reset} (${files.length})\n`;
    for (const file of files.slice(0, 5)) {
      output += `    • ${file}\n`;
    }
    if (files.length > 5) {
      output += `    ... and ${files.length - 5} more\n`;
    }
    output += '\n';
  }
}

const stateResult = loadState(projectPath);
if (stateResult.state?.feature) {
  output += `  ${c.cyan}Currently tracking:${c.reset} ${stateResult.state.feature}\n\n`;
}

console.log(output);
```

## Output Format

```
Plan Dashboard

  Functional Plans - Draft (2)
    • 2026-01-30-user-auth.md
    • 2026-01-28-api-refactor.md

  Implementation Plans - Approved (1)
    • 2026-01-30-user-auth.md

  In Progress (1)
    • 2026-01-30-user-auth.md

  Currently tracking: Add user authentication
```

## Directory Structure

```
plans/
├── functional/
│   ├── draft/          # Functional plans being written
│   └── approved/       # Approved functional plans
├── implementation/
│   ├── draft/          # Implementation plans being written
│   └── approved/       # Approved implementation plans
├── in_progress/        # Currently being worked on
├── review/             # Awaiting review
└── done/               # Completed
```

## Notes

- Plans are markdown files
- Approval moves plans from draft/ to approved/
- Gate 1 requires approved functional plan
- Gate 2 requires approved implementation plan
