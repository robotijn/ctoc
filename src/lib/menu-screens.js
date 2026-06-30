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
const { getInboxCounts, listStaleCandidates } = require('./inbox');
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

/**
 * A plan reference's file part is always a bare filename inside a stage folder.
 * Anything with a path separator, a ".." segment, an absolute path, or a NUL
 * byte is a directory-traversal attempt and must be refused before the path is
 * joined or read (e.g. "functional/../../etc/passwd").
 */
function isUnsafePlanFile(file) {
  return typeof file !== 'string'
    || file === ''
    || file.includes('/')
    || file.includes('\\')
    || file.includes('\0')
    || file.split(/[\\/]/).includes('..')
    || file.includes('..')
    || path.isAbsolute(file);
}

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

  // Inbox (A3 — async-overnight surface; SP2 adds the possibly-stale stream)
  const inbox = getInboxCounts(root);
  const stale = inbox.staleCandidates || 0;
  const inboxTotal = inbox.questions + inbox.decisions + inbox.gatesWaiting + stale;
  out += `INBOX\n`;
  if (inboxTotal === 0) {
    out += `  ○ Inbox clear — no async items waiting\n`;
  } else {
    out += `  ⊙ ${inbox.questions} morning question${inbox.questions === 1 ? '' : 's'}\n`;
    out += `  ⊙ ${inbox.decisions} decision${inbox.decisions === 1 ? '' : 's'} awaiting review\n`;
    out += `  ⊙ ${inbox.gatesWaiting} plan${inbox.gatesWaiting === 1 ? '' : 's'} at gates\n`;
    // SP2: conditional — present iff > 0 (M2), absent when 0 (M3). "possibly-stale"
    // (not "stale") sets correct expectations: cheap detection is unverified (SP3).
    if (stale > 0) {
      out += `  ⊙ ${stale} possibly-stale plan${stale === 1 ? '' : 's'}\n`;
    }
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

  // SP2: cheap stale count (memoized → cache hit after buildDashboardTable above).
  const stale = (getInboxCounts(root).staleCandidates) || 0;

  const questions = [{
    question: 'Select a section to drill into:',
    header: 'Pipeline',
    options
  }];
  const actions = {
    'Business': 'section business',
    'Implementation': 'section implementation',
    'Execution': 'section execution',
    'More ▶': 'menu commands'
  };

  // SP2 ride-along: a SECOND question, only when there is something to show (M3).
  // Navigation is by label only — NEVER a digit (menu discipline Rule 1/9).
  if (stale > 0) {
    questions.push({
      question: `${stale} possibly-stale plan${stale === 1 ? '' : 's'} detected — view them?`,
      header: 'Stale plans',
      options: [
        { label: 'View stale plans', description: `Inspect the ${stale} possibly-stale plan${stale === 1 ? '' : 's'} (read-only)` },
        { label: 'Not now', description: 'Dismiss for this menu turn' },
      ],
    });
    actions['View stale plans'] = 'inbox stale'; // label key only — NEVER a digit
    actions['Not now'] = '';                      // no-op (driver falls through to pipeline answer)
  }

  return { text, ask: { questions }, actions };
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
 * SP2 drill-in: read-only list of possibly-stale candidates. No file op, no plan
 * move, no inputMode. The only selectable option is ◀ Back. "Verify (SP3)" is
 * affordance TEXT only — SP3 wires the verification.
 * @param {string} [projectPath]
 * @returns {{text:string, ask:Object, actions:Object}}
 */
function inboxStalePlansDrillIn(projectPath) {
  const root = getProjectPath(projectPath);
  const candidates = listStaleCandidates(root); // cold path; one fresh scan

  let text = `Inbox ▸ Possibly-stale plans (${candidates.length})\n`;
  text += `${'─'.repeat(40)}\n\n`;
  if (candidates.length === 0) {
    text += '  No possibly-stale plans.\n';
  } else {
    // Bullet rows, NOT "1." — numbers are reserved for opening a plan (Rule 1/9).
    // This screen opens nothing, so it shows no numbers and exposes no numeric key.
    for (const cand of candidates) {
      const label = cand.actionable ? 'actionable' : 'advisory';
      text += `  • ${cand.plan}  [${cand.stage}]  signals: ${cand.signals.join(', ')}  — ${label}\n`;
    }
    text += '\n  Verify with SP3 verification (coming soon) before any cleanup.\n';
  }
  text += '\n\n\n';

  return {
    text,
    ask: {
      questions: [{
        question: 'Possibly-stale plans (read-only).',
        header: 'Stale plans',
        options: [{ label: '◀ Back', description: 'Return to dashboard' }],
      }],
    },
    actions: { '◀ Back': '' },
  };
}

/**
 * Dashboard Menu B (Commands)
 * Shows: Vision(n), Start agent, Sync plans, Pipeline
 */
function dashboardCommands(projectPath) {
  const root = getProjectPath(projectPath);
  const visionCounts = getVisionCounts(root);
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

  // Numbers are reserved EXCLUSIVELY for opening a plan — any count, multi-digit.
  // Meta-actions are WORDS ('n' new, 'b' back), so a number can never select
  // navigation by accident and every plan (including the 25th) is reachable by
  // typing its number. (Fixes the AskUserQuestion-numbering collision where the
  // first option grabbed "1" and >9 plans were unreachable.)
  text += plans.length > 0
    ? `\n  Reply with a plan number (1-${plans.length}) to open it · n = new ${stage} plan · b = back\n\n\n`
    : `\n  Reply:  n = new ${stage} plan · b = back\n\n\n`;

  const actions = {};
  plans.forEach((plan, i) => {
    actions[`${i + 1}`] = `plan ${stage}/${plan.name}.md`;
  });
  // Word-keyed navigation — NEVER numeric.
  actions['n'] = `claude:create-plan ${stage}`;
  actions['new'] = `claude:create-plan ${stage}`;
  actions['b'] = '';
  actions['back'] = '';

  return {
    text,
    // inputMode tells the driver: do NOT render a numbered AskUserQuestion for a
    // plan list. Show the list and take a free-text reply — a number opens that
    // plan via actions[number]; 'n'/'b' are the only non-plan shortcuts (words).
    inputMode: 'plan-select',
    prompt: plans.length > 0
      ? `Reply with a plan number (1-${plans.length}) to open it, or 'n' for a new plan, 'b' for back.`
      : `No plans in ${stage}. Reply 'n' to create one, or 'b' for back.`,
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
  // Confine to a single plan file inside plans/<folder>/. A plan reference is
  // always a bare filename; anything containing path separators or ".." is a
  // traversal attempt (e.g. "functional/../../etc/passwd") and must not be
  // resolved or read.
  if (!folder || isUnsafePlanFile(file)) {
    return {
      text: `Invalid plan reference: ${stage}/${file}\n${'─'.repeat(40)}\n\n  Refusing a reference that escapes the plans/ directory.\n\n\n`,
      ask: { questions: [{ question: 'Invalid reference.', header: 'Error', options: [{ label: '◀ Back', description: 'Return to dashboard' }] }] },
      actions: { '◀ Back': '' },
    };
  }
  const planPath = path.join(plansDir, folder, file);
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

    case 'inbox':
      if (args[1] === 'stale') return inboxStalePlansDrillIn(projectPath);
      return dashboardPipeline(projectPath); // unknown inbox subcommand → safe default

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
  inboxStalePlansDrillIn,
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
