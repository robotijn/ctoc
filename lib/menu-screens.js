/**
 * Menu Screens
 * Deterministic screen renderers for the CTOC state machine.
 * Every screen outputs JSON with { text, ask, actions }.
 *
 * Usage:
 *   node menu.js                            -> dashboardPipeline()
 *   node menu.js menu commands              -> dashboardCommands()
 *   node menu.js browse {stage}             -> stageBrowse(stage)
 *   node menu.js plan {stage}/{file}        -> planActions(stage, file)
 *   node menu.js plan {stage}/{file} more   -> planActionsMore(stage, file)
 *   node menu.js plan {stage}/{file} review -> reviewActions(stage, file)
 *   node menu.js plan {stage}/{file} discuss -> discussMenu(stage, file)
 *   node menu.js validate {stage}/{file}    -> validateScreen(stage, file)
 */

const fs = require('fs');
const path = require('path');
const { getPlanCounts, readPlans, getPlansDir, getAgentStatus, getVisionCounts } = require('./state');
const { validateTransition } = require('./plan-validator');
const { findProjectRoot } = require('./project-root');

// Stage to folder mapping
const STAGE_FOLDERS = {
  functional: 'functional',
  implementation: 'implementation',
  todo: 'todo',
  'in-progress': 'in-progress',
  review: 'review',
  done: 'done'
};

// Stage flow: what stage comes next after approval
const NEXT_STAGE = {
  functional: 'implementation',
  implementation: 'todo',
  todo: 'in-progress',
  'in-progress': 'review',
  review: 'done'
};

// Human gates: transitions requiring human approval marker
const HUMAN_GATES = {
  functional: 'implementation',
  implementation: 'todo',
  review: 'done'
};

/**
 * Get the project path for rendering
 * @param {string} [projectPath] - Optional override
 * @returns {string} Project root path
 */
function getProjectPath(projectPath) {
  return projectPath || findProjectRoot();
}

/**
 * Read VERSION file
 * @param {string} projectPath
 * @returns {string} Version string
 */
function getVersion(projectPath) {
  try {
    // When used as plugin, __dirname is the lib/ dir of the plugin
    const versionPath = path.join(__dirname, '..', 'VERSION');
    return fs.readFileSync(versionPath, 'utf8').trim();
  } catch {
    return '?.?.?';
  }
}

/**
 * Build the dashboard table text
 * @param {string} projectPath
 * @returns {string} Dashboard table
 */
function buildDashboardTable(projectPath) {
  const root = getProjectPath(projectPath);
  const counts = getPlanCounts(root);
  const visionCounts = getVisionCounts(root);
  const agent = getAgentStatus(root);
  const version = getVersion(root);

  const status = (count, empty, active) => count > 0 ? active : empty;

  let out = '';
  out += `CTOC v${version}\n`;
  out += `${'─'.repeat(60)}\n\n`;

  out += `┌────────────────┬────────┬─────────────────┐\n`;
  out += `│ Stage          │ Count  │ Status          │\n`;
  out += `├────────────────┼────────┼─────────────────┤\n`;
  out += `│ Vision         │ ${String(visionCounts.total).padEnd(6)}│ ${status(visionCounts.total, 'No visions', visionCounts.exploring + ' exploring').padEnd(16)}│\n`;
  out += `│ Functional     │ ${String(counts.functional).padEnd(6)}│ ${status(counts.functional, 'No drafts', counts.functional + ' drafts').padEnd(16)}│\n`;
  out += `│ Implementation │ ${String(counts.implementation).padEnd(6)}│ ${status(counts.implementation, 'No drafts', counts.implementation + ' drafts').padEnd(16)}│\n`;
  out += `│ Todo           │ ${String(counts.todo).padEnd(6)}│ ${status(counts.todo, 'Queue empty', counts.todo + ' queued').padEnd(16)}│\n`;
  out += `│ In Progress    │ ${String(counts.inProgress).padEnd(6)}│ ${status(counts.inProgress, 'None active', counts.inProgress + ' active').padEnd(16)}│\n`;
  out += `│ Review         │ ${String(counts.review).padEnd(6)}│ ${status(counts.review, 'Queue empty', counts.review + ' pending').padEnd(16)}│\n`;
  out += `│ Done           │ ${String(counts.done || 0).padEnd(6)}│ ${status(counts.done, 'None yet', (counts.done || 0) + ' completed').padEnd(16)}│\n`;
  out += `└────────────────┴────────┴─────────────────┘\n\n`;

  // Agent status
  const isAgentActive = counts.inProgress > 0;
  out += `AGENT\n`;
  if (isAgentActive) {
    const plansDir = getPlansDir(root);
    const inProgressPlans = readPlans(path.join(plansDir, 'in-progress'));
    const currentPlan = inProgressPlans.length > 0 ? (inProgressPlans[0].name || 'unknown') : 'unknown';
    out += `  ● Active: ${currentPlan}\n`;
  } else {
    out += `  ○ Idle\n`;
  }

  return out;
}

/**
 * Dashboard Menu A (Pipeline)
 * Shows: Functional(n), Implementation(n), Review(n), More
 */
function dashboardPipeline(projectPath) {
  const root = getProjectPath(projectPath);
  const counts = getPlanCounts(root);

  const text = buildDashboardTable(root) + '\n\n\n';

  const options = [
    { label: `Functional (${counts.functional})`, description: 'Browse functional plans' },
    { label: `Implementation (${counts.implementation})`, description: 'Browse implementation plans' },
    { label: `Review (${counts.review})`, description: 'Browse review queue' },
    { label: 'More ▶', description: 'Vision, agents, sync, and other commands' }
  ];

  return {
    text,
    ask: {
      questions: [{
        question: 'Select a pipeline stage to browse:',
        header: 'Pipeline',
        options
      }]
    },
    actions: {
      [`Functional (${counts.functional})`]: 'browse functional',
      [`Implementation (${counts.implementation})`]: 'browse implementation',
      [`Review (${counts.review})`]: 'browse review',
      'More ▶': 'menu commands'
    }
  };
}

/**
 * Dashboard Menu B (Commands)
 * Shows: Vision(n), Start agent, Sync plans, Pipeline
 */
function dashboardCommands(projectPath) {
  const root = getProjectPath(projectPath);
  const visionCounts = getVisionCounts(root);
  const counts = getPlanCounts(root);
  const isAgentActive = counts.inProgress > 0;

  const text = buildDashboardTable(root) + '\n\n\n';

  const options = [
    { label: `Vision (${visionCounts.total})`, description: 'Explore new ideas before formal planning' },
    { label: isAgentActive ? 'Stop agent' : 'Start agent', description: isAgentActive ? 'Stop after current task' : 'Execute next plan from todo queue' },
    { label: 'Sync plans', description: 'Pull, commit, and push plan changes' },
    { label: '◀ Pipeline', description: 'Return to pipeline view' }
  ];

  const actions = {
    [`Vision (${visionCounts.total})`]: 'claude:vision',
    [isAgentActive ? 'Stop agent' : 'Start agent']: isAgentActive ? 'claude:stop-agent' : 'claude:start-agent',
    'Sync plans': 'claude:sync',
    '◀ Pipeline': ''
  };

  return {
    text,
    ask: {
      questions: [{
        question: 'Select a command:',
        header: 'Commands',
        options
      }]
    },
    actions
  };
}

/**
 * Stage Browse Screen
 * Lists plans in a stage with navigation options.
 * 1-3 plans: each plan is a button
 * 4+ plans: numbered text list with action buttons only
 */
function stageBrowse(stage, projectPath) {
  const root = getProjectPath(projectPath);
  const plansDir = getPlansDir(root);
  const folder = STAGE_FOLDERS[stage];

  if (!folder) {
    return {
      text: `Unknown stage: ${stage}\n\n\n`,
      ask: {
        questions: [{
          question: 'Return to dashboard?',
          header: 'Error',
          options: [{ label: 'Back', description: 'Return to dashboard' }]
        }]
      },
      actions: { 'Back': '' }
    };
  }

  const stageDir = path.join(plansDir, folder);
  const plans = readPlans(stageDir);

  let text = `[${stage}] (${plans.length} items)\n`;
  text += `${'─'.repeat(40)}\n`;

  if (plans.length === 0) {
    text += '\n  No plans in this stage.\n';
  } else {
    plans.forEach((plan, i) => {
      const icon = plan.bgIcon || '○';
      text += `\n  [${i + 1}] ${icon} ${plan.name}  ${plan.ago || ''}`;
    });
    text += '\n';
  }

  text += '\n\n\n';

  // Build options
  const options = [];
  const actions = {};

  if (plans.length <= 3) {
    // Each plan is a button
    plans.forEach((plan, i) => {
      const label = plan.name;
      options.push({ label, description: `View and manage this plan` });
      actions[label] = `plan ${stage}/${plan.name}.md`;
    });
  }

  // Always show Create new and Back
  options.push({ label: 'Create new', description: `Create a new ${stage} plan` });
  options.push({ label: 'Back', description: 'Return to dashboard' });
  actions['Create new'] = `claude:create-plan ${stage}`;
  actions['Back'] = '';

  // For 4+ plans, plan selection is handled via "Other" in AskUserQuestion
  if (plans.length > 3) {
    plans.forEach((plan, i) => {
      actions[`${i + 1}`] = `plan ${stage}/${plan.name}.md`;
    });
  }

  return {
    text,
    ask: {
      questions: [{
        question: plans.length > 3
          ? `Type a number (1-${plans.length}) to select a plan, or choose an action:`
          : 'Select a plan or action:',
        header: stage,
        options
      }]
    },
    actions
  };
}

/**
 * Plan Actions Menu A
 * Shows: View, Discuss, Approve, More
 */
function planActions(stage, file, projectPath) {
  const root = getProjectPath(projectPath);
  const plansDir = getPlansDir(root);
  const folder = STAGE_FOLDERS[stage];
  const planPath = path.join(plansDir, folder, file);
  const planName = file.replace('.md', '');

  // Check if this is a review plan - if so, use review actions
  if (stage === 'review') {
    return reviewActions(stage, file, projectPath);
  }

  let text = `[${stage}] ${planName}\n`;
  text += `${'─'.repeat(40)}\n`;

  // Read summary if file exists
  if (fs.existsSync(planPath)) {
    const content = fs.readFileSync(planPath, 'utf8');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      text += `\n  ${titleMatch[1]}\n`;
    }
  }

  text += '\n\n\n';

  const nextStage = NEXT_STAGE[stage];
  const approveLabel = nextStage ? `Approve → ${nextStage}` : 'Approve';

  const options = [
    { label: 'View', description: 'Show full plan contents' },
    { label: 'Discuss', description: 'Critique and refine the plan' },
    { label: approveLabel, description: `Validate and move to ${nextStage || 'next stage'}` },
    { label: 'More ▶', description: 'Edit, delete, and other actions' }
  ];

  const actions = {
    'View': `claude:view ${stage}/${file}`,
    'Discuss': 'claude:discuss',
    [approveLabel]: `validate ${stage}/${file}`,
    'More ▶': `plan ${stage}/${file} more`
  };

  return {
    text,
    ask: {
      questions: [{
        question: 'What would you like to do with this plan?',
        header: planName,
        options
      }]
    },
    actions
  };
}

/**
 * Plan Actions Menu B (More)
 * Shows: Edit, Delete, Back to list, Actions
 */
function planActionsMore(stage, file, projectPath) {
  const root = getProjectPath(projectPath);
  const plansDir = getPlansDir(root);
  const folder = STAGE_FOLDERS[stage];
  const planPath = path.join(plansDir, folder, file);
  const planName = file.replace('.md', '');

  let text = `[${stage}] ${planName}\n`;
  text += `${'─'.repeat(40)}\n`;

  if (fs.existsSync(planPath)) {
    const content = fs.readFileSync(planPath, 'utf8');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      text += `\n  ${titleMatch[1]}\n`;
    }
  }

  text += '\n\n\n';

  const options = [
    { label: 'Edit', description: 'Modify plan contents' },
    { label: 'Delete', description: 'Remove this plan permanently' },
    { label: 'Back to list', description: `Return to ${stage} plan list` },
    { label: '◀ Actions', description: 'Return to main action menu' }
  ];

  const actions = {
    'Edit': 'claude:edit',
    'Delete': `claude:delete ${stage}/${file}`,
    'Back to list': `browse ${stage}`,
    '◀ Actions': `plan ${stage}/${file}`
  };

  return {
    text,
    ask: {
      questions: [{
        question: 'Select an action:',
        header: planName,
        options
      }]
    },
    actions
  };
}

/**
 * Review Actions (unique for review stage)
 * Shows: View, Approve -> Done, Feedback -> Functional, Rework -> Implementation
 */
function reviewActions(stage, file, projectPath) {
  const root = getProjectPath(projectPath);
  const plansDir = getPlansDir(root);
  const folder = STAGE_FOLDERS[stage] || 'review';
  const planPath = path.join(plansDir, folder, file);
  const planName = file.replace('.md', '');

  let text = `[Review] ${planName}\n`;
  text += `${'─'.repeat(40)}\n`;

  if (fs.existsSync(planPath)) {
    const content = fs.readFileSync(planPath, 'utf8');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      text += `\n  ${titleMatch[1]}\n`;
    }
  }

  text += '\n\n\n';

  const options = [
    { label: 'View', description: 'Show full plan contents' },
    { label: 'Approve → Done', description: 'Validate and mark as complete' },
    { label: 'Feedback → Functional', description: 'Send back to functional for requirements rework' },
    { label: 'Rework → Implementation', description: 'Send back to implementation for technical rework' }
  ];

  const actions = {
    'View': `claude:view review/${file}`,
    'Approve → Done': `validate review/${file}`,
    'Feedback → Functional': `claude:reject review/${file} functional`,
    'Rework → Implementation': `claude:reject review/${file} implementation`
  };

  return {
    text,
    ask: {
      questions: [{
        question: 'Review this plan:',
        header: 'Review',
        options
      }]
    },
    actions
  };
}

/**
 * Discussion Menu
 * Shown after Claude's critique of a plan
 */
function discussMenu(stage, file, projectPath) {
  const planName = file.replace('.md', '');
  const nextStage = NEXT_STAGE[stage];

  const text = `[Discussion] ${planName}\n\n\n`;

  const options = [
    { label: 'Continue', description: 'Continue the discussion' },
    { label: 'Apply edits', description: 'Make changes based on discussion' },
    { label: `Approve → ${nextStage || 'next'}`, description: `Validate and move to ${nextStage || 'next stage'}` },
    { label: 'Back to actions', description: 'Return to plan action menu' }
  ];

  const approveLabel = `Approve → ${nextStage || 'next'}`;

  const actions = {
    'Continue': 'claude:discuss',
    'Apply edits': 'claude:edit',
    [approveLabel]: `validate ${stage}/${file}`,
    'Back to actions': `plan ${stage}/${file}`
  };

  return {
    text,
    ask: {
      questions: [{
        question: 'How would you like to proceed?',
        header: 'Discussion',
        options
      }]
    },
    actions
  };
}

/**
 * Validation Screen
 * Shows pre-transition validation results and options.
 */
function validateScreen(stage, file, projectPath) {
  const root = getProjectPath(projectPath);
  const plansDir = getPlansDir(root);
  const folder = STAGE_FOLDERS[stage];
  const planPath = path.join(plansDir, folder, file);
  const planName = file.replace('.md', '');
  const nextStage = NEXT_STAGE[stage];

  // Run validation
  const validationResult = validateTransition(planPath, stage, nextStage, root);

  // Build validation text
  let text = `Pre-transition validation: ${stage} → ${nextStage}\n`;
  text += `${'─'.repeat(40)}\n\n`;

  if (validationResult.errors.length === 0 && validationResult.warnings.length === 0) {
    text += '  All checks passed.\n';
  }

  if (validationResult.errors.length > 0) {
    validationResult.errors.forEach(err => {
      text += `  ✗ ${err}\n`;
    });
  }

  if (validationResult.warnings.length > 0) {
    validationResult.warnings.forEach(warn => {
      text += `  ⚠ ${warn}\n`;
    });
  }

  text += '\n\n\n';

  const issueCount = validationResult.errors.length + validationResult.warnings.length;

  let question;
  if (validationResult.valid) {
    question = validationResult.warnings.length > 0
      ? `${validationResult.warnings.length} warning(s). Proceed with approval?`
      : 'All checks passed. Proceed with approval?';
  } else {
    question = `${validationResult.errors.length} error(s) found. Fix issues or override?`;
  }

  const options = [];
  const actions = {};

  if (validationResult.valid) {
    options.push({ label: 'Confirm approve', description: `Move plan to ${nextStage}` });
    actions['Confirm approve'] = `claude:approve ${stage}/${file}`;
  } else {
    options.push({ label: 'Approve anyway', description: 'Override validation and move to next stage' });
    actions['Approve anyway'] = `claude:approve ${stage}/${file}`;
  }

  options.push({ label: 'Fix issues', description: 'Go back and fix the issues' });
  options.push({ label: 'Back', description: `Return to ${stage} list` });

  actions['Fix issues'] = `plan ${stage}/${file}`;
  actions['Back'] = `browse ${stage}`;

  return {
    text,
    ask: {
      questions: [{
        question,
        header: 'Validate',
        options
      }]
    },
    actions,
    validation: validationResult
  };
}

/**
 * Route a command string to the appropriate screen function
 *
 * @param {string[]} args - Command line arguments
 * @param {string} [projectPath] - Project root override
 * @returns {Object} Screen JSON { text, ask, actions }
 */
function route(args, projectPath) {
  if (!args || args.length === 0) {
    return dashboardPipeline(projectPath);
  }

  const cmd = args[0];

  switch (cmd) {
    case 'menu':
      if (args[1] === 'commands') {
        return dashboardCommands(projectPath);
      }
      return dashboardPipeline(projectPath);

    case 'browse':
      return stageBrowse(args[1], projectPath);

    case 'plan': {
      const ref = args[1]; // stage/file
      if (!ref) {
        return dashboardPipeline(projectPath);
      }
      const slashIndex = ref.indexOf('/');
      if (slashIndex === -1) {
        return dashboardPipeline(projectPath);
      }
      const stage = ref.substring(0, slashIndex);
      const file = ref.substring(slashIndex + 1);

      if (args[2] === 'more') {
        return planActionsMore(stage, file, projectPath);
      }
      if (args[2] === 'review') {
        return reviewActions(stage, file, projectPath);
      }
      if (args[2] === 'discuss') {
        return discussMenu(stage, file, projectPath);
      }
      return planActions(stage, file, projectPath);
    }

    case 'validate': {
      const ref = args[1];
      if (!ref) {
        return dashboardPipeline(projectPath);
      }
      const slashIndex = ref.indexOf('/');
      if (slashIndex === -1) {
        return dashboardPipeline(projectPath);
      }
      const stage = ref.substring(0, slashIndex);
      const file = ref.substring(slashIndex + 1);
      return validateScreen(stage, file, projectPath);
    }

    default:
      return dashboardPipeline(projectPath);
  }
}

module.exports = {
  // Screen renderers
  dashboardPipeline,
  dashboardCommands,
  stageBrowse,
  planActions,
  planActionsMore,
  reviewActions,
  discussMenu,
  validateScreen,
  // Router
  route,
  // Helpers (exported for testing)
  buildDashboardTable,
  getVersion,
  STAGE_FOLDERS,
  NEXT_STAGE,
  HUMAN_GATES
};
