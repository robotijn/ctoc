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
const { getPlanCounts, readPlans, getPlansDir, getAgentStatus, getVisionCounts, getVisionStubs } = require('./state');
const { SECTIONS, getSectionLabel, getStagesInSection, loadDashboardPrefs } = require('./sections');
const { getInboxCounts } = require('./inbox');
const { getNotesCount } = require('./notes');
const { validateTransition } = require('./plan-validator');
const { findProjectRoot } = require('./project-root');

// Stage to folder mapping
const STAGE_FOLDERS = {
  canvas: 'canvas',
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
    const versionPath = path.join(__dirname, '..', '..', 'VERSION');
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
  const prefs = loadDashboardPrefs(root);

  // Per-stage count lookup. Sections.js stages are canonical strings.
  const stageCount = (stage) => {
    switch (stage) {
      case 'vision':       return visionCounts.total;
      case 'canvas':       return counts.canvas || 0;
      case 'functional':   return counts.functional;
      case 'implementation': return counts.implementation;
      case 'todo':         return counts.todo;
      case 'in-progress':  return counts.inProgress;
      case 'review':       return counts.review;
      case 'done':         return counts.done || 0;
      default:             return 0;
    }
  };

  let out = '';
  out += `CTOC v${version}\n`;
  out += `${'─'.repeat(60)}\n\n`;

  // Render 3 sections (A2 / v7) — Business / Implementation / Execution.
  // Per I4: JSON mode is sectioned; TUI overview.js still renders the flat
  // table until A3 lands and the menu is fully restructured.
  for (const section of Object.keys(SECTIONS)) {
    const stages = getStagesInSection(section);
    const sectionTotal = stages.reduce((sum, s) => sum + stageCount(s), 0);
    const collapsed = prefs.collapsed[section];
    const chevron = collapsed ? '▶' : '▼';
    out += `${chevron} ${getSectionLabel(section)} (${sectionTotal})\n`;
    if (!collapsed) {
      for (const stage of stages) {
        const c = stageCount(stage);
        const label = stage.charAt(0).toUpperCase() + stage.slice(1).replace(/-/g, ' ');
        out += `    ${label.padEnd(14)} ${c}\n`;
      }
    }
    out += '\n';
  }

  // Inbox (A3 — async-overnight surface, agent → user)
  const inbox = getInboxCounts(root);
  const inboxTotal = inbox.questions + inbox.decisions + inbox.gatesWaiting;
  out += `INBOX\n`;
  if (inboxTotal === 0) {
    out += `  ○ Inbox clear — no async items waiting\n`;
  } else {
    out += `  ⊙ ${inbox.questions} morning question${inbox.questions === 1 ? '' : 's'}\n`;
    out += `  ⊙ ${inbox.decisions} decision${inbox.decisions === 1 ? '' : 's'} awaiting review\n`;
    out += `  ⊙ ${inbox.gatesWaiting} plan${inbox.gatesWaiting === 1 ? '' : 's'} at gates\n`;
  }
  out += '\n';

  // Notes (user → Claude, via NOTES.md at project root). Distinct from
  // INBOX above which is the agent → user direction.
  const notesCount = getNotesCount(root);
  out += `NOTES\n`;
  if (notesCount === 0) {
    out += `  ○ No notes pending in NOTES.md\n`;
  } else {
    out += `  ⊙ ${notesCount} note${notesCount === 1 ? '' : 's'} pending in NOTES.md\n`;
  }
  out += '\n';

  // Agent status (lock-aware)
  const isAgentActive = agent.active;
  out += `AGENT\n`;
  if (isAgentActive) {
    out += `  ● Active: ${agent.plan || 'unknown'}`;
    if (agent.pid) out += ` (PID ${agent.pid})`;
    out += '\n';
  } else if (agent.stale) {
    out += `  ⚠ Stale lock: ${agent.stalePlan || 'unknown'} (process died)\n`;
  } else if (agent.overloadRetry) {
    const retryLabel = agent.retryAt
      ? (() => {
          const diffMs = new Date(agent.retryAt).getTime() - Date.now();
          const diffMin = Math.ceil(diffMs / 60000);
          return diffMin > 0 ? `retry in ${diffMin}m` : 'ready to retry';
        })()
      : 'retry pending';
    out += `  ⏳ ${retryLabel} — ${agent.plan}\n`;
  } else if (agent.overloadPartial) {
    out += `  ⚠ partial write — review: ${agent.plan}\n`;
  } else {
    out += `  ○ Idle\n`;
  }

  return out;
}

/**
 * Dashboard Menu A (Pipeline) — v7
 *
 * Shows the 3 task-aligned sections (Business / Implementation / Execution)
 * plus More. Labels are STABLE — counts moved to descriptions so the option
 * labels don't shift as plans move between stages.
 *
 * Section selection → `section {name}` drills into the stages within.
 */
function dashboardPipeline(projectPath) {
  const root = getProjectPath(projectPath);
  const counts = getPlanCounts(root);
  const visionCounts = getVisionCounts(root);

  const businessTotal = visionCounts.total + (counts.canvas || 0) + counts.functional;
  const implTotal     = counts.implementation + counts.todo;
  const execTotal     = counts.inProgress + counts.review + (counts.done || 0);

  const text = buildDashboardTable(root) + '\n\n\n';

  const options = [
    {
      label: 'Business',
      description: `Vision · Canvas · Functional  (${businessTotal} total — ${visionCounts.total} vision, ${counts.canvas || 0} canvas, ${counts.functional} functional)`
    },
    {
      label: 'Implementation',
      description: `Implementation · Todo  (${implTotal} total — ${counts.implementation} impl, ${counts.todo} todo)`
    },
    {
      label: 'Execution',
      description: `In-Progress · Review · Done  (${execTotal} total — ${counts.inProgress} in-progress, ${counts.review} review, ${counts.done || 0} done)`
    },
    { label: 'More ▶', description: 'Vision pipeline, start agent, sync plans, system' }
  ];

  return {
    text,
    ask: {
      questions: [{
        question: 'Select a section to drill into:',
        header: 'Pipeline',
        options
      }]
    },
    actions: {
      'Business': 'section business',
      'Implementation': 'section implementation',
      'Execution': 'section execution',
      'More ▶': 'menu commands'
    }
  };
}

/**
 * Section browse — drill-in for the 3 v7 sections.
 *
 * @param {string} sectionName - 'business' | 'implementation' | 'execution'
 * @param {string} [projectPath]
 */
function sectionBrowse(sectionName, projectPath) {
  const root = getProjectPath(projectPath);
  const counts = getPlanCounts(root);
  const visionCounts = getVisionCounts(root);

  const SECTION_STAGES = {
    business:       ['vision', 'canvas', 'functional'],
    implementation: ['implementation', 'todo'],
    execution:      ['in-progress', 'review', 'done'],
  };
  const SECTION_LABEL = {
    business: 'Business',
    implementation: 'Implementation',
    execution: 'Execution',
  };

  const stages = SECTION_STAGES[sectionName];
  if (!stages) {
    return {
      text: `Unknown section: ${sectionName}\n\n\n`,
      ask: {
        questions: [{
          question: 'Return to dashboard?',
          header: 'Error',
          options: [{ label: 'Back', description: 'Return to dashboard' }],
        }],
      },
      actions: { Back: '' },
    };
  }

  function stageCount(stage) {
    switch (stage) {
      case 'vision':         return visionCounts.total;
      case 'canvas':         return counts.canvas || 0;
      case 'functional':     return counts.functional;
      case 'implementation': return counts.implementation;
      case 'todo':           return counts.todo;
      case 'in-progress':    return counts.inProgress;
      case 'review':         return counts.review;
      case 'done':           return counts.done || 0;
      default:               return 0;
    }
  }

  let text = `${SECTION_LABEL[sectionName]} section\n${'─'.repeat(40)}\n\n`;
  for (const stage of stages) {
    const n = stageCount(stage);
    const label = stage.charAt(0).toUpperCase() + stage.slice(1).replace(/-/g, ' ');
    text += `  ${label.padEnd(14)} ${n}\n`;
  }
  text += '\n\n\n';

  // Build options — one per stage in the section, plus Back.
  const options = stages.map(stage => {
    const n = stageCount(stage);
    const label = stage.charAt(0).toUpperCase() + stage.slice(1).replace(/-/g, ' ');
    const description = stage === 'vision'
      ? `Enter Vision Mode — create, edit, or decompose visions (${n} active)`
      : `Browse ${label} stage (${n} plans)`;
    return { label, description };
  });
  // AskUserQuestion caps at 4 options. business has 3 stages, exec has 3, impl has 2 — all fit with Back.
  options.push({ label: '◀ Back', description: 'Return to pipeline view' });

  const actions = {};
  for (const stage of stages) {
    const label = stage.charAt(0).toUpperCase() + stage.slice(1).replace(/-/g, ' ');
    // Vision is not a plan-file stage — it is a separate pipeline handled by
    // Vision Mode (create / edit / decompose). `browse vision` has no
    // STAGE_FOLDERS entry and dead-ends on "Unknown stage". Route to Vision Mode.
    actions[label] = stage === 'vision' ? 'claude:vision' : `browse ${stage}`;
  }
  actions['◀ Back'] = '';

  return {
    text,
    ask: {
      questions: [{
        question: `Select a stage in ${SECTION_LABEL[sectionName]}:`,
        header: SECTION_LABEL[sectionName],
        options,
      }],
    },
    actions,
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
  const agent = getAgentStatus(root);
  const isAgentActive = agent.active;

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

  // Vision is not a plan-file stage — it is a separate pipeline (explore →
  // decompose → stubs) handled by Vision Mode. `browse vision` has no
  // STAGE_FOLDERS entry; rather than dead-end on "Unknown stage: vision",
  // point the user at Vision Mode, where visions are created, edited, and
  // decomposed into functional plans.
  if (stage === 'vision') {
    const visionCounts = getVisionCounts(root);
    return {
      text: `[vision] (${visionCounts.total} active)\n${'─'.repeat(40)}\n\n`
        + '  Visions are created, edited, and decomposed in Vision Mode —\n'
        + '  they are not browsed as plan files.\n\n\n',
      ask: {
        questions: [{
          question: 'Open Vision Mode?',
          header: 'Vision',
          options: [
            { label: 'Enter Vision Mode', description: 'Create, edit, or decompose a vision' },
            { label: '◀ Back', description: 'Return to pipeline view' },
          ],
        }],
      },
      actions: {
        'Enter Vision Mode': 'claude:vision',
        '◀ Back': '',
      },
    };
  }

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
 * Vision Stubs Browse Screen
 * Human checkpoint table for vision decomposition.
 * Shows stubs created by the Vision Decomposer and options to approve/edit.
 */
function visionStubsBrowse(slug, projectPath) {
  const root = getProjectPath(projectPath);
  const stubs = getVisionStubs(slug, root);

  let text = `[Vision Decomposition] ${slug}\n`;
  text += `${'─'.repeat(40)}\n\n`;

  if (stubs.length === 0) {
    text += '  No stubs created yet.\n';
  } else {
    text += `  Vision "${slug}" decomposed into ${stubs.length} functional plans:\n\n`;
    text += `  | # | Stub                    | Scope                          | Depends on |\n`;
    text += `  |---|-------------------------|--------------------------------|------------|\n`;
    stubs.forEach((stub, i) => {
      const name = stub.name.padEnd(23).slice(0, 23);
      const scope = (stub.scope || '').padEnd(30).slice(0, 30);
      const deps = (stub.dependsOn || '-').padEnd(10).slice(0, 10);
      text += `  | ${i + 1} | ${name} | ${scope} | ${deps} |\n`;
    });
  }

  text += '\n\n\n';

  const options = [
    { label: 'Looks good -- refine all', description: 'Hand off stubs to Product Owner Agent for refinement' },
    { label: 'Edit stubs', description: 'Rename, merge, split, or remove stubs' },
    { label: 'Add a stub', description: 'Create a new stub for a missing piece' },
    { label: 'Start over', description: 'Discard all stubs and re-decompose' },
    { label: 'Back', description: 'Return to dashboard' }
  ];

  const actions = {
    'Looks good -- refine all': `claude:approve-stubs ${slug}`,
    'Edit stubs': `claude:edit-stubs ${slug}`,
    'Add a stub': `claude:add-stub ${slug}`,
    'Start over': `claude:decompose ${slug}`,
    'Back': ''
  };

  return {
    text,
    ask: {
      questions: [{
        question: 'Review the decomposition. What do you want to do?',
        header: 'Vision Stubs',
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

  text += '\n  Type "more" for delete and other actions.\n\n\n';

  const nextStage = NEXT_STAGE[stage];
  const approveLabel = nextStage ? `Approve → ${nextStage}` : 'Approve';

  // Every plan menu carries the same four verbs: Create, View/Edit, Discuss,
  // Approve. View and Edit are one action — opening a plan shows it and lets
  // you edit it in the same step.
  const options = [
    { label: 'Create new', description: `Create a new ${stage} plan` },
    { label: 'View/Edit', description: 'Show the plan, then edit it' },
    { label: 'Discuss', description: 'Critique and refine the plan' },
    { label: approveLabel, description: `Validate and move to ${nextStage || 'next stage'}` }
  ];

  const actions = {
    'Create new': `claude:create-plan ${stage}`,
    'View/Edit': `claude:view-edit ${stage}/${file}`,
    'Discuss': 'claude:discuss',
    [approveLabel]: `validate ${stage}/${file}`
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

  // Edit merged into the main menu's View/Edit action; this secondary screen
  // now carries only Delete plus navigation. Reached by typing "more".
  const options = [
    { label: 'Delete', description: 'Remove this plan permanently' },
    { label: 'Back to list', description: `Return to ${stage} plan list` },
    { label: '◀ Actions', description: 'Return to main action menu' }
  ];

  const actions = {
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

  // Review is the human gate: inspect, then approve or kick back. The four
  // slots are View/Edit plus the three gate transitions.
  const options = [
    { label: 'View/Edit', description: 'Show the plan, then edit it' },
    { label: 'Approve → Done', description: 'Validate and mark as complete' },
    { label: 'Feedback → Functional', description: 'Send back to functional for requirements rework' },
    { label: 'Rework → Implementation', description: 'Send back to implementation for technical rework' }
  ];

  const actions = {
    'View/Edit': `claude:view-edit review/${file}`,
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

    case 'section':
      return sectionBrowse(args[1], projectPath);

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

    case 'stubs':
      return visionStubsBrowse(args[1], projectPath);

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
  sectionBrowse,
  stageBrowse,
  visionStubsBrowse,
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
