/**
 * CTOC MCP Tools
 * Tool definitions and handlers for MCP server integration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Detect paths (same logic as ctoc.js)
function detectPaths() {
  const scriptDir = __dirname;
  // MCP is at repo/.ctoc/../mcp, so parent is repo root
  const repoRoot = path.dirname(scriptDir);

  // Check if VERSION exists at repo root
  if (fs.existsSync(path.join(repoRoot, 'VERSION'))) {
    return {
      REPO_ROOT: repoRoot,
      CTOC_DIR: path.join(repoRoot, '.ctoc'),
      PROJECT_ROOT: repoRoot
    };
  }

  // Installed mode: project/.ctoc/repo/mcp
  // repoRoot = project/.ctoc/repo
  const projectCtocDir = path.dirname(repoRoot);
  const projectRoot = path.dirname(projectCtocDir);

  return {
    REPO_ROOT: repoRoot,
    CTOC_DIR: projectCtocDir,
    PROJECT_ROOT: projectRoot
  };
}

const paths = detectPaths();
const REPO_ROOT = paths.REPO_ROOT;
const CTOC_DIR = paths.CTOC_DIR;
const PROJECT_ROOT = paths.PROJECT_ROOT;

// Colors (ANSI escape codes)
const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  cyan: '\x1b[0;36m',
  bold: '\x1b[1m',
  reset: '\x1b[0m'
};

// Tool definitions (MCP format)
export const tools = [
  {
    name: 'ctoc_status',
    description: 'Show quick CTOC status including project info, stack, and Iron Loop state',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'ctoc_admin',
    description: 'Show full admin dashboard with kanban board, queue status, and git info',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'ctoc_kanban',
    description: 'Show kanban board with plan counts and status',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'ctoc_progress',
    description: 'Show Iron Loop progress for current feature',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'ctoc_plan_status',
    description: 'Show plan dashboard with functional and implementation plans',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'ctoc_doctor',
    description: 'Run installation health check',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'ctoc_start',
    description: 'Start tracking a new feature in Iron Loop',
    inputSchema: {
      type: 'object',
      properties: {
        feature: { type: 'string', description: 'Feature name to track' }
      },
      required: ['feature']
    }
  },
  {
    name: 'ctoc_step',
    description: 'Move to a specific Iron Loop step (1-15)',
    inputSchema: {
      type: 'object',
      properties: {
        step: { type: 'number', minimum: 1, maximum: 15, description: 'Step number (1-15)' }
      },
      required: ['step']
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions (copied from ctoc.js to avoid CommonJS/ESM issues)
// ─────────────────────────────────────────────────────────────────────────────

function fileExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch (e) {
    return false;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function getVersion() {
  const versionFile = path.join(REPO_ROOT, 'VERSION');
  try {
    return fs.readFileSync(versionFile, 'utf8').trim();
  } catch (e) {
    return 'unknown';
  }
}

function getStateFile() {
  return path.join(CTOC_DIR, 'state', 'iron-loop.json');
}

function createDefaultState() {
  return {
    feature: null,
    step: 0,
    gate1_passed: false,
    gate2_passed: false,
    started_at: null,
    steps_completed: []
  };
}

function getState() {
  const stateFile = getStateFile();
  if (fileExists(stateFile)) {
    return readJson(stateFile) || createDefaultState();
  }
  return createDefaultState();
}

function saveState(state) {
  const stateDir = path.join(CTOC_DIR, 'state');
  if (!fileExists(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  writeJson(getStateFile(), state);
}

function detectStack() {
  const indicators = {
    'Python': ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
    'TypeScript': ['tsconfig.json'],
    'JavaScript': ['package.json'],
    'Rust': ['Cargo.toml'],
    'Go': ['go.mod'],
    'Ruby': ['Gemfile'],
    'Java': ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    'C#': ['*.csproj', '*.sln'],
    'PHP': ['composer.json'],
    'Elixir': ['mix.exs']
  };

  const detected = [];
  for (const [lang, files] of Object.entries(indicators)) {
    for (const file of files) {
      if (file.includes('*')) {
        const pattern = file.replace('*', '');
        try {
          const entries = fs.readdirSync(PROJECT_ROOT);
          if (entries.some(e => e.endsWith(pattern))) {
            detected.push(lang);
            break;
          }
        } catch (e) {}
      } else if (fileExists(path.join(PROJECT_ROOT, file))) {
        detected.push(lang);
        break;
      }
    }
  }

  return detected.length > 0 ? detected.join('/') : 'unknown/none';
}

// Iron Loop steps
const IRON_LOOP_STEPS = [
  { num: 1, name: 'ASSESS', phase: 'Planning', desc: 'Understand the problem' },
  { num: 2, name: 'ALIGN', phase: 'Planning', desc: 'Business alignment' },
  { num: 3, name: 'CAPTURE', phase: 'Planning', desc: 'Gather requirements' },
  { num: 4, name: 'PLAN', phase: 'Planning', desc: 'Design solution' },
  { num: 5, name: 'DESIGN', phase: 'Planning', desc: 'Architecture decisions' },
  { num: 6, name: 'SPEC', phase: 'Planning', desc: 'Technical specification' },
  { num: 7, name: 'TEST', phase: 'Development', desc: 'Write tests first' },
  { num: 8, name: 'QUALITY', phase: 'Development', desc: 'Quality gates' },
  { num: 9, name: 'IMPLEMENT', phase: 'Development', desc: 'Write code' },
  { num: 10, name: 'REVIEW', phase: 'Development', desc: 'Self-review as CTO' },
  { num: 11, name: 'OPTIMIZE', phase: 'Delivery', desc: 'Performance tuning' },
  { num: 12, name: 'SECURE', phase: 'Delivery', desc: 'Security validation' },
  { num: 13, name: 'DOCUMENT', phase: 'Delivery', desc: 'Update docs' },
  { num: 14, name: 'VERIFY', phase: 'Delivery', desc: 'Final validation' },
  { num: 15, name: 'COMMIT', phase: 'Delivery', desc: 'Ship with confidence' }
];

function getStepInfo(stepNum) {
  return IRON_LOOP_STEPS.find(s => s.num === stepNum) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Sanitization
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeFeatureName(name) {
  if (!name || typeof name !== 'string') return '';

  // Remove path traversal, shell chars, control chars
  return name
    .replace(/\.\./g, '')
    .replace(/[\/\\<>|;&$`"']/g, '')
    .replace(/[\x00-\x1f]/g, '')
    .trim()
    .slice(0, 100); // Max 100 chars
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Implementations
// ─────────────────────────────────────────────────────────────────────────────

function cmdStatus() {
  const version = getVersion();
  const stack = detectStack();
  const state = getState();

  let output = '';
  output += '\n';
  output += `${colors.cyan}════════════════════════════════════════════════════════════════${colors.reset}\n`;
  output += `${colors.bold}CTOC${colors.reset} - CTO Chief v${version}\n`;
  output += `${colors.cyan}════════════════════════════════════════════════════════════════${colors.reset}\n`;
  output += '\n';
  output += `  Project: ${path.basename(PROJECT_ROOT)}\n`;
  output += `  Stack:   ${stack}\n`;
  output += '\n';

  if (state.feature) {
    const stepInfo = getStepInfo(state.step) || { name: 'Not started', phase: '-' };
    output += `  Feature: ${colors.cyan}${state.feature}${colors.reset}\n`;
    output += `  Step:    ${state.step}/15 - ${stepInfo.name} (${stepInfo.phase})\n`;
    output += `  Gate 1:  ${state.gate1_passed ? colors.green + '✓ Passed' : colors.yellow + '○ Pending'}${colors.reset}\n`;
    output += `  Gate 2:  ${state.gate2_passed ? colors.green + '✓ Passed' : colors.yellow + '○ Pending'}${colors.reset}\n`;
  } else {
    output += `  ${colors.yellow}No feature being tracked${colors.reset}\n`;
    output += `  Use: ctoc start <feature-name>\n`;
  }
  output += '\n';

  return output;
}

function cmdDoctor() {
  const version = getVersion();
  let output = '';

  output += '\n';
  output += `${colors.cyan}CTOC Doctor${colors.reset} - Installation Health Check\n`;
  output += '\n';

  // Core Files section
  output += `\n${colors.blue}[Core Files]${colors.reset}\n`;

  const versionFile = path.join(REPO_ROOT, 'VERSION');
  if (fileExists(versionFile)) {
    output += `  ${colors.green}✓${colors.reset} VERSION file (v${version})\n`;
  } else {
    output += `  ${colors.red}✗${colors.reset} VERSION file missing\n`;
  }

  const settingsFile = path.join(CTOC_DIR, 'settings.yaml');
  if (fileExists(settingsFile)) {
    output += `  ${colors.green}✓${colors.reset} settings.yaml\n`;
  } else {
    output += `  ${colors.yellow}⚠${colors.reset} settings.yaml missing (using defaults)\n`;
  }

  // Skills check
  const skillsDir = path.join(CTOC_DIR, 'skills');
  if (fileExists(skillsDir)) {
    try {
      const langDir = path.join(skillsDir, 'languages');
      const fwDir = path.join(skillsDir, 'frameworks');
      let count = 0;
      if (fileExists(langDir)) {
        count += fs.readdirSync(langDir).filter(f => f.endsWith('.md')).length;
      }
      if (fileExists(fwDir)) {
        const categories = fs.readdirSync(fwDir);
        for (const cat of categories) {
          const catPath = path.join(fwDir, cat);
          if (fs.statSync(catPath).isDirectory()) {
            count += fs.readdirSync(catPath).filter(f => f.endsWith('.md')).length;
          }
        }
      }
      output += `  ${colors.green}✓${colors.reset} Skills directory (${count} skills)\n`;
    } catch (e) {
      output += `  ${colors.green}✓${colors.reset} Skills directory\n`;
    }
  } else {
    output += `  ${colors.yellow}⚠${colors.reset} Skills directory missing\n`;
  }

  // Dependencies section
  output += `\n${colors.blue}[Dependencies]${colors.reset}\n`;

  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
    output += `  ${colors.green}✓${colors.reset} Node.js ${nodeVersion}\n`;
  } catch (e) {
    output += `  ${colors.red}✗${colors.reset} Node.js not found\n`;
  }

  try {
    const gitVersion = execSync('git --version', { encoding: 'utf8' }).trim();
    output += `  ${colors.green}✓${colors.reset} ${gitVersion}\n`;
  } catch (e) {
    output += `  ${colors.red}✗${colors.reset} git not found\n`;
  }

  // State section
  output += `\n${colors.blue}[State]${colors.reset}\n`;

  const state = getState();
  if (state.feature) {
    output += `  ${colors.green}✓${colors.reset} Tracking: ${state.feature} (step ${state.step})\n`;
  } else {
    output += `  No feature being tracked\n`;
  }

  output += '\n';
  output += `${colors.green}Doctor check complete${colors.reset}\n`;
  output += '\n';

  return output;
}

function cmdProgress() {
  const state = getState();
  let output = '';

  output += '\n';
  output += `${colors.cyan}Iron Loop Progress${colors.reset}\n`;
  output += '\n';

  if (!state.feature) {
    output += `  ${colors.yellow}No feature being tracked${colors.reset}\n`;
    output += '  Use: ctoc start <feature-name>\n';
    output += '\n';
    return output;
  }

  output += `  Feature: ${colors.bold}${state.feature}${colors.reset}\n`;
  output += '\n';

  const phases = ['Planning', 'Development', 'Delivery'];

  for (const phase of phases) {
    const phaseSteps = IRON_LOOP_STEPS.filter(s => s.phase === phase);
    output += `  ${colors.bold}${phase}${colors.reset}\n`;

    for (const step of phaseSteps) {
      let status;
      if (state.steps_completed.includes(step.num)) {
        status = `${colors.green}✓${colors.reset}`;
      } else if (state.step === step.num) {
        status = `${colors.yellow}▶${colors.reset}`;
      } else {
        status = `${colors.reset}○${colors.reset}`;
      }

      const stepStr = `${step.num}`.padStart(2);
      output += `    ${status} ${stepStr}. ${step.name.padEnd(10)} ${colors.reset}${step.desc}\n`;
    }
    output += '\n';
  }

  // Gates
  output += `  ${colors.bold}Gates${colors.reset}\n`;
  output += `    Gate 1 (after step 3): ${state.gate1_passed ? colors.green + '✓ Passed' : colors.yellow + '○ Pending'}${colors.reset}\n`;
  output += `    Gate 2 (after step 6): ${state.gate2_passed ? colors.green + '✓ Passed' : colors.yellow + '○ Pending'}${colors.reset}\n`;
  output += '\n';

  return output;
}

function cmdPlanStatus() {
  let output = '';

  output += '\n';
  output += `${colors.cyan}Plan Dashboard${colors.reset}\n`;
  output += '\n';

  const plansDir = path.join(CTOC_DIR, 'plans');

  const checkDir = (name, subPath) => {
    const dir = path.join(plansDir, subPath);
    if (fileExists(dir)) {
      try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        if (files.length > 0) {
          output += `  ${colors.bold}${name}${colors.reset} (${files.length})\n`;
          for (const file of files.slice(0, 5)) {
            output += `    • ${file}\n`;
          }
          if (files.length > 5) {
            output += `    ... and ${files.length - 5} more\n`;
          }
          output += '\n';
        }
      } catch (e) {}
    }
  };

  checkDir('Functional Plans - Draft', 'functional/draft');
  checkDir('Functional Plans - Approved', 'functional/approved');
  checkDir('Implementation Plans - Draft', 'implementation/draft');
  checkDir('Implementation Plans - Approved', 'implementation/approved');
  checkDir('In Progress', 'in_progress');
  checkDir('In Review', 'review');
  checkDir('Done', 'done');

  const state = getState();
  if (state.feature) {
    output += `  ${colors.cyan}Currently tracking:${colors.reset} ${state.feature}\n`;
    output += '\n';
  }

  return output;
}

function cmdAdmin() {
  const version = getVersion();
  let output = '';

  // Try to load kanban data
  let kanbanData = { columns: { backlog: 0, functional: 0, technical: 0, ready: 0, building: 0, review: 0, done: 0 }, numberedItems: {} };

  try {
    // Try to use the kanban library
    const kanbanPath = path.join(REPO_ROOT, 'scripts', 'lib', 'kanban.js');
    if (fileExists(kanbanPath)) {
      // We can't easily import CommonJS from ESM, so we'll build a simpler version
      // that counts files directly
      const plansDir = path.join(CTOC_DIR, 'plans');

      const countDir = (subPath) => {
        const dir = path.join(plansDir, subPath);
        try {
          return fs.readdirSync(dir).filter(f => f.endsWith('.md')).length;
        } catch {
          return 0;
        }
      };

      kanbanData.columns.backlog = countDir('functional/draft');
      kanbanData.columns.functional = countDir('functional/approved');
      kanbanData.columns.technical = countDir('implementation/draft');
      kanbanData.columns.ready = countDir('implementation/approved');
      kanbanData.columns.building = countDir('in_progress');
      kanbanData.columns.review = countDir('review');
      kanbanData.columns.done = countDir('done');
    }
  } catch (e) {
    // Use default zeros
  }

  const c = kanbanData.columns;
  const total = c.backlog + c.functional + c.technical + c.ready + c.building + c.review + c.done;

  // Get git status
  let gitModified = 0;
  let gitUntracked = 0;
  try {
    const status = execSync('git status --short', { cwd: PROJECT_ROOT, encoding: 'utf8' });
    const lines = status.split('\n').filter(l => l.trim());
    gitModified = lines.filter(l => l.match(/^ ?M/)).length;
    gitUntracked = lines.filter(l => l.startsWith('??')).length;
  } catch (e) {}

  const versionPadded = version.padEnd(7);

  output += `
╔══════════════════════════════════════════════════════════════════════════════╗
║  CTOC ADMIN                                                       v${versionPadded}  ║
╠═════════╤══════════╤══════════╤═════════╤═════════╤═════════╤════════════════╣
║ BACKLOG │FUNCTIONAL│TECHNICAL │  READY  │BUILDING │ REVIEW  │     DONE       ║
║ (draft) │(steps1-3)│(steps4-6)│         │ (7-14)  │ [HUMAN] │                ║
╠═════════╪══════════╪══════════╪═════════╪═════════╪═════════╪════════════════╣
║   (${String(c.backlog).padStart(2)})  │   (${String(c.functional).padStart(2)})   │   (${String(c.technical).padStart(2)})   │  (${String(c.ready).padStart(2)})   │  (${String(c.building).padStart(2)})   │  (${String(c.review).padStart(2)})   │     (${String(c.done).padStart(2)})       ║
╚═════════╧══════════╧══════════╧═════════╧═════════╧═════════╧════════════════╝

Legend (${total} items): Use ctoc plan status for details

Git: ${gitModified} modified, ${gitUntracked} untracked

Actions:
  [N] New feature    [R#] Review item #    [V#] View item #
  [C] Commit         [P] Push              [Q] Queue status
`;

  return output;
}

function cmdKanban() {
  // Simplified kanban view
  let output = '';

  const plansDir = path.join(CTOC_DIR, 'plans');

  const countDir = (subPath) => {
    const dir = path.join(plansDir, subPath);
    try {
      return fs.readdirSync(dir).filter(f => f.endsWith('.md')).length;
    } catch {
      return 0;
    }
  };

  const c = {
    backlog: countDir('functional/draft'),
    functional: countDir('functional/approved'),
    technical: countDir('implementation/draft'),
    ready: countDir('implementation/approved'),
    building: countDir('in_progress'),
    review: countDir('review'),
    done: countDir('done')
  };

  const total = c.backlog + c.functional + c.technical + c.ready + c.building + c.review + c.done;

  output += `
╔═════════╤══════════╤══════════╤═════════╤═════════╤═════════╤════════════════╗
║ BACKLOG │FUNCTIONAL│TECHNICAL │  READY  │BUILDING │ REVIEW  │     DONE       ║
║ (draft) │(steps1-3)│(steps4-6)│         │ (7-14)  │ [HUMAN] │                ║
╠═════════╪══════════╪══════════╪═════════╪═════════╪═════════╪════════════════╣
║   (${String(c.backlog).padStart(2)})  │   (${String(c.functional).padStart(2)})   │   (${String(c.technical).padStart(2)})   │  (${String(c.ready).padStart(2)})   │  (${String(c.building).padStart(2)})   │  (${String(c.review).padStart(2)})   │     (${String(c.done).padStart(2)})       ║
╚═════════╧══════════╧══════════╧═════════╧═════════╧═════════╧════════════════╝

Legend (${total} items total)
`;

  return output;
}

function cmdStart(featureName) {
  const sanitized = sanitizeFeatureName(featureName);

  if (!sanitized) {
    throw new Error('Feature name required');
  }

  const state = createDefaultState();
  state.feature = sanitized;
  state.step = 1;
  state.started_at = new Date().toISOString();
  saveState(state);

  let output = '';
  output += '\n';
  output += `${colors.green}Started tracking:${colors.reset} ${sanitized}\n`;
  output += `${colors.cyan}Step 1: ASSESS${colors.reset} - Understand the problem\n`;
  output += '\n';
  output += 'Begin by assessing the problem space. Ask:\n';
  output += '  • What business problem are we solving?\n';
  output += '  • Who is affected?\n';
  output += '  • What does success look like?\n';
  output += '\n';

  return output;
}

function cmdStep(stepNum) {
  const num = parseInt(stepNum, 10);
  if (isNaN(num) || num < 1 || num > 15) {
    throw new Error('Step must be 1-15');
  }

  const state = getState();
  if (!state.feature) {
    throw new Error('No feature being tracked. Use ctoc_start first.');
  }

  const prevStep = state.step;
  state.step = num;

  // Mark previous steps as completed if moving forward
  if (num > prevStep) {
    for (let i = prevStep; i < num; i++) {
      if (!state.steps_completed.includes(i)) {
        state.steps_completed.push(i);
      }
    }
  }

  saveState(state);

  const stepInfo = getStepInfo(num);
  let output = '';

  // Check gates
  if (num > 3 && !state.gate1_passed) {
    output += `${colors.yellow}Note:${colors.reset} Gate 1 not yet passed (functional planning)\n`;
  }
  if (num > 6 && !state.gate2_passed) {
    output += `${colors.yellow}Note:${colors.reset} Gate 2 not yet passed (technical planning)\n`;
  }

  output += '\n';
  output += `${colors.green}Moved to step ${num}:${colors.reset} ${stepInfo.name}\n`;
  output += `${stepInfo.desc}\n`;
  output += '\n';

  return output;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handleToolCall(request) {
  const { name, arguments: args } = request.params;

  try {
    let output;

    switch (name) {
      case 'ctoc_status':
        output = cmdStatus();
        break;
      case 'ctoc_admin':
        output = cmdAdmin();
        break;
      case 'ctoc_kanban':
        output = cmdKanban();
        break;
      case 'ctoc_progress':
        output = cmdProgress();
        break;
      case 'ctoc_plan_status':
        output = cmdPlanStatus();
        break;
      case 'ctoc_doctor':
        output = cmdDoctor();
        break;
      case 'ctoc_start':
        output = cmdStart(args?.feature || '');
        break;
      case 'ctoc_step':
        output = cmdStep(args?.step);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: 'text', text: output }] };
  } catch (error) {
    throw error;
  }
}

// Export individual command functions for use by index.js
export {
  cmdStatus,
  cmdAdmin,
  cmdKanban,
  cmdProgress,
  cmdPlanStatus,
  cmdDoctor,
  cmdStart,
  cmdStep
};
