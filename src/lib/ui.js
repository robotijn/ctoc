/**
 * CTOC UI Library
 * Terminal formatting and display utilities
 */

const { STEP_NAMES, STEP_DESCRIPTIONS } = require('./state-manager');

// ANSI colors
const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  cyan: '\x1b[0;36m',
  magenta: '\x1b[0;35m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m'
};

/**
 * Formats the dashboard display
 */
function dashboard(state, stack, version) {
  const c = colors;
  let output = '\n';

  output += `${c.cyan}════════════════════════════════════════════════════════════════${c.reset}\n`;
  output += `${c.bold}CTOC${c.reset} - CTO Chief v${version}\n`;
  output += `${c.cyan}════════════════════════════════════════════════════════════════${c.reset}\n\n`;

  output += `  Project: ${stack.project ? require('path').basename(stack.project) : 'Unknown'}\n`;
  output += `  Stack:   ${stack.languages.join('/') || 'none'}\n`;

  if (stack.frameworks.length > 0) {
    output += `  Framework: ${stack.frameworks.join(', ')}\n`;
  }

  output += '\n';

  if (state && state.feature) {
    const stepInfo = STEP_NAMES[state.currentStep] || 'Unknown';
    const phase = getPhase(state.currentStep);

    output += `  Feature: ${c.cyan}${state.feature}${c.reset}\n`;
    output += `  Step:    ${state.currentStep}/16 - ${stepInfo} (${phase})\n`;
    output += `  Gate 1:  ${state.gate1_approval ? c.green + '✓ Passed' : c.yellow + '○ Pending'}${c.reset}\n`;
    output += `  Gate 2:  ${state.gate2_approval ? c.green + '✓ Passed' : c.yellow + '○ Pending'}${c.reset}\n`;
  } else {
    output += `  ${c.yellow}No feature being tracked${c.reset}\n`;
    output += `  Use: /ctoc start <feature-name>\n`;
  }

  output += '\n';
  return output;
}

/**
 * Gets the phase for a step number
 */
function getPhase(step) {
  if (step <= 1) return 'Ideation';
  if (step <= 4) return 'Planning';
  if (step <= 7) return 'Planning';
  if (step <= 11) return 'Development';
  return 'Delivery';
}

/**
 * Formats progress display
 */
function progress(state) {
  const c = colors;
  let output = '\n';

  output += `${c.cyan}Iron Loop Progress${c.reset}\n\n`;

  if (!state || !state.feature) {
    output += `  ${c.yellow}No feature being tracked${c.reset}\n`;
    output += '  Use: /ctoc start <feature-name>\n\n';
    return output;
  }

  output += `  Feature: ${c.bold}${state.feature}${c.reset}\n\n`;

  const phases = [
    { name: 'Ideation (1)', steps: [1] },
    { name: 'Planning (2-7)', steps: [2, 3, 4, 5, 6, 7] },
    { name: 'Development (8-11)', steps: [8, 9, 10, 11] },
    { name: 'Delivery (12-16)', steps: [12, 13, 14, 15, 16] }
  ];

  for (const phase of phases) {
    output += `  ${c.bold}${phase.name}${c.reset}\n`;

    for (const stepNum of phase.steps) {
      const stepName = STEP_NAMES[stepNum];
      const stepDesc = STEP_DESCRIPTIONS[stepNum];
      const stepStatus = state.steps[stepNum];

      let status;
      if (stepStatus?.status === 'completed') {
        status = `${c.green}✓${c.reset}`;
      } else if (state.currentStep === stepNum) {
        status = `${c.yellow}▶${c.reset}`;
      } else {
        status = `${c.dim}○${c.reset}`;
      }

      const numStr = String(stepNum).padStart(2);
      output += `    ${status} ${numStr}. ${stepName.padEnd(10)} ${c.dim}${stepDesc}${c.reset}\n`;
    }

    output += '\n';
  }

  // Gates
  output += `  ${c.bold}Gates${c.reset}\n`;
  output += `    Gate 1 (after step 4): ${state.gate1_approval ? c.green + '✓ Passed' : c.yellow + '○ Pending'}${c.reset}\n`;
  output += `    Gate 2 (after step 7): ${state.gate2_approval ? c.green + '✓ Passed' : c.yellow + '○ Pending'}${c.reset}\n\n`;

  return output;
}

/**
 * Formats the admin dashboard with kanban
 */
function adminDashboard(kanbanCounts, gitStatus, version) {
  const c = kanbanCounts;
  const total = c.backlog + c.functional + c.technical + c.ready + c.building + c.review + c.done;

  const versionPadded = version.padEnd(7);

  return `
╔══════════════════════════════════════════════════════════════════════════════╗
║  CTOC ADMIN                                                       v${versionPadded}  ║
╠═════════╤══════════╤══════════╤═════════╤═════════╤═════════╤════════════════╣
║ BACKLOG │FUNCTIONAL│TECHNICAL │  READY  │BUILDING │ REVIEW  │     DONE       ║
║ (draft) │(steps2-4)│(steps5-7)│         │ (8-15)  │ [HUMAN] │                ║
╠═════════╪══════════╪══════════╪═════════╪═════════╪═════════╪════════════════╣
║   (${String(c.backlog).padStart(2)})  │   (${String(c.functional).padStart(2)})   │   (${String(c.technical).padStart(2)})   │  (${String(c.ready).padStart(2)})   │  (${String(c.building).padStart(2)})   │  (${String(c.review).padStart(2)})   │     (${String(c.done).padStart(2)})       ║
╚═════════╧══════════╧══════════╧═════════╧═════════╧═════════╧════════════════╝

Legend (${total} items): Use /ctoc plan for details

Git: ${gitStatus.modified} modified, ${gitStatus.untracked} untracked

Actions:
  [N] New feature    [R#] Review item #    [V#] View item #
  [C] Commit         [P] Push              [Q] Queue status
`;
}

/**
 * Formats doctor output
 */
function doctor(checks, version) {
  const c = colors;
  let output = '\n';

  output += `${c.cyan}CTOC Doctor${c.reset} - Health Check\n\n`;

  for (const section of checks) {
    output += `${c.blue}[${section.name}]${c.reset}\n`;

    for (const check of section.items) {
      const icon = check.ok ? `${c.green}✓${c.reset}` : (check.warn ? `${c.yellow}⚠${c.reset}` : `${c.red}✗${c.reset}`);
      output += `  ${icon} ${check.label}\n`;
    }

    output += '\n';
  }

  output += `${c.green}Doctor check complete${c.reset}\n\n`;
  return output;
}

/**
 * Formats blocked output
 */
function blocked(reason, state, tool) {
  const c = colors;
  const currentStep = state?.currentStep || 1;
  const stepName = STEP_NAMES[currentStep] || 'Unknown';
  const featureName = state?.feature || 'No feature';

  let output = '\n';
  output += '='.repeat(70) + '\n';
  output += `${c.red}CTOC IRON LOOP - ${tool} BLOCKED${c.reset}\n`;
  output += '='.repeat(70) + '\n\n';

  output += `Feature: ${featureName}\n`;
  output += `Current Step: ${currentStep} (${stepName})\n`;
  output += `Required Step: 8 (TEST)\n\n`;

  output += `${c.yellow}REASON:${c.reset} ${reason}\n\n`;

  output += `${c.cyan}THE IRON LOOP IS HOLY. IT CANNOT BE BYPASSED.${c.reset}\n\n`;

  output += 'TO PROCEED:\n';
  output += '  1. Complete ideation + planning steps 1-4 (functional plan)\n';
  output += '  2. Get user approval at Gate 1\n';
  output += '  3. Complete planning steps 5-7 (technical plan)\n';
  output += '  4. Get user approval at Gate 2\n';
  output += '  5. Then Edit/Write operations are allowed (Step 8+)\n';

  output += '\n' + '='.repeat(70) + '\n';

  return output;
}

/**
 * Write to terminal (stderr for visibility)
 */
function writeToTerminal(text) {
  process.stderr.write(text);
}

module.exports = {
  colors,
  dashboard,
  progress,
  adminDashboard,
  doctor,
  blocked,
  writeToTerminal,
  getPhase
};
