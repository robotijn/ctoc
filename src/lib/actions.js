/**
 * Plan Actions
 * Handle plan operations: approve, reject, move, etc.
 */

const fs = require('fs');
const path = require('path');
const { parseMetadata } = require('./state');
const { refineLoop, appendDeferredQuestions } = require('./iron-loop');
const { writeStatus, clearStatus, readStatus } = require('./background');
const { findProjectRoot } = require('./project-root');
const { validateForReview, validateTransition, formatValidationResult } = require('./plan-validator');
const { logTransition } = require('./transition-log');

/**
 * Background Agent Types
 */
const AGENT_TYPES = {
  RESEARCH_ASSISTANT: 'research-assistant',
  IMPLEMENTATION_PLANNER: 'implementation-planner',
  IRON_LOOP_INTEGRATOR: 'iron-loop-integrator',
  REVIEW_PREPARER: 'review-preparer',
  CRITIC: 'critic',
  VISION_DECOMPOSER: 'vision-decomposer',
  PRODUCT_OWNER: 'product-owner'
};

/**
 * Record that a background agent should be spawned for a plan
 * This writes the status file - the actual agent spawning is done by Claude
 * following the instructions in ctoc.md
 *
 * @param {string} planPath - Path to the plan file
 * @param {string} agentType - Type of agent to spawn
 * @param {string} [message] - Optional status message
 */
function initBackgroundAgent(planPath, agentType, message) {
  writeStatus(planPath, {
    agent: agentType,
    status: 'working',
    message: message || `${agentType} processing...`
  });
}

// Move plan to new location
function movePlan(planPath, destination, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = path.join(root, 'plans');
  const destDir = path.join(plansDir, destination);

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const fileName = path.basename(planPath);
  const newPath = path.join(destDir, fileName);

  fs.renameSync(planPath, newPath);
  return newPath;
}

// Human gates: transitions that require human approval marker
const HUMAN_GATES = {
  'functional': 'implementation',
  'implementation': 'todo',
  'review': 'done'
};

// Add approval marker to plan content for human gate crossings
function addApprovalMarker(content, from, to) {
  const marker = `---\napproved_by: human\napproved_at: ${new Date().toISOString()}\ngate_crossed: ${from} → ${to}\n---\n\n`;
  return marker + content;
}

// Approve a plan (move to next stage)
// Returns { newPath, backgroundAgent, humanGate } - backgroundAgent is the type of agent to spawn
function approvePlan(planPath, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = path.join(root, 'plans');
  const relativePath = path.relative(plansDir, planPath);

  const flowMap = {
    'functional': 'implementation',
    'implementation': 'todo',
    'review': 'done'
  };

  // Find matching flow
  for (const [from, to] of Object.entries(flowMap)) {
    if (relativePath.startsWith(from)) {
      // Clear any existing status from previous stage
      clearStatus(planPath);

      // Add human approval marker for gate crossings
      const isHumanGate = HUMAN_GATES[from] === to;
      if (isHumanGate) {
        let content = fs.readFileSync(planPath, 'utf8');
        content = addApprovalMarker(content, from, to);
        fs.writeFileSync(planPath, content);
      }

      // If moving to todo, apply Iron Loop
      if (to === 'todo') {
        applyIronLoop(planPath);
      }

      const newPath = movePlan(planPath, to, projectPath);

      // Initialize background agent based on transition
      let backgroundAgent = null;
      if (from === 'functional' && to === 'implementation') {
        // Spawn Implementation Planner to generate implementation details
        initBackgroundAgent(newPath, AGENT_TYPES.IMPLEMENTATION_PLANNER,
          'Generating implementation details...');
        backgroundAgent = AGENT_TYPES.IMPLEMENTATION_PLANNER;
      }
      // Note: implementation→todo already has Iron Loop applied synchronously
      // The Iron Loop integrator runs as part of applyIronLoop()

      // Trigger deployment pipeline after Gate 3 (review -> done)
      if (from === 'review' && to === 'done') {
        try {
          const { getDeploymentConfig, runDeploymentPipeline } = require('./deployment');
          const config = getDeploymentConfig(root);
          if (config.enabled) {
            // Run asynchronously — don't block the plan transition
            runDeploymentPipeline(newPath, root).catch(err => {
              console.error('Deployment pipeline failed:', err.message);
            });
          }
        } catch (deployErr) {
          console.error('Deployment trigger failed:', deployErr.message);
        }
      }

      // Log transition to audit trail
      try {
        logTransition({
          plan: path.basename(planPath),
          from,
          to,
          actor: 'human',
          validation: { passed: true, checks: 0, warnings: 0 },
          humanGate: isHumanGate,
          marker: isHumanGate
        }, root);
      } catch (logErr) {
        // Don't fail the transition if logging fails
        console.error('Transition logging failed:', logErr.message);
      }

      return { newPath, backgroundAgent, humanGate: isHumanGate };
    }
  }

  throw new Error(`Unknown plan location: ${relativePath}`);
}

// Apply Iron Loop automation to plan
// Runs Integrator + Critic refinement loop to generate detailed execution steps
function applyIronLoop(planPath) {
  let content = fs.readFileSync(planPath, 'utf8');
  const metadata = parseMetadata(content);

  if (metadata.iron_loop) {
    return; // Already has Iron Loop
  }

  // Run the refinement loop to generate detailed Steps 8-16
  try {
    const result = refineLoop(planPath);

    // If max rounds reached, append deferred questions
    if (result.status === 'max-rounds' && result.deferredQuestions) {
      appendDeferredQuestions(planPath, result.deferredQuestions);
    }

    // Update metadata to mark iron_loop as applied
    content = fs.readFileSync(planPath, 'utf8');
    if (content.match(/^---\n/)) {
      content = content.replace(/^---\n/, '---\niron_loop: true\n');
    } else {
      content = `---\niron_loop: true\n---\n\n${content}`;
    }
    fs.writeFileSync(planPath, content);
  } catch (err) {
    // Fallback to basic template if refinement fails
    console.error('Iron Loop refinement failed, using basic template:', err.message);
    applyBasicIronLoopTemplate(planPath);
  }
}

// Fallback basic Iron Loop template
function applyBasicIronLoopTemplate(planPath) {
  let content = fs.readFileSync(planPath, 'utf8');

  const ironLoopTemplate = `

---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Verify dev environment ready

### Step 10: IMPLEMENT
- [ ] Implement the feature

### Step 11: REVIEW
- [ ] Self-review code

### Step 12: OPTIMIZE
- [ ] Performance review

### Step 13: SECURE
- [ ] Security audit

### Step 14: VERIFY
- [ ] Run full test suite

### Step 15: DOCUMENT
- [ ] Update documentation

### Step 16: FINAL-REVIEW
- [ ] Final review before merge
`;

  // Update metadata
  if (content.match(/^---\n/)) {
    content = content.replace(/^---\n/, '---\niron_loop: true\n');
  } else {
    content = `---\niron_loop: true\n---\n\n${content}`;
  }

  content += ironLoopTemplate;
  fs.writeFileSync(planPath, content);
}

// Reject a plan with feedback
function rejectPlan(planPath, feedback, projectPath) {
  const root = projectPath || findProjectRoot();
  let content = fs.readFileSync(planPath, 'utf8');
  const metadata = parseMetadata(content);

  const revision = (metadata.revision || 0) + 1;

  // Prepend rejection feedback
  const rejectionHeader = `# REVISION ${revision}

## Rejection Feedback

${feedback}

---

`;

  // Update metadata
  const metadataUpdates = `revision: ${revision}\nrejection_reason: "${feedback.replace(/"/g, '\\"').slice(0, 100)}"\ntag: rejected\n`;

  if (content.match(/^---\n/)) {
    content = content.replace(/^---\n/, `---\n${metadataUpdates}`);
  } else {
    content = `---\n${metadataUpdates}---\n\n${content}`;
  }

  content = rejectionHeader + content;
  fs.writeFileSync(planPath, content);

  // Move to functional
  return movePlan(planPath, 'functional', root);
}

// Rename a plan
function renamePlan(planPath, newName) {
  const dir = path.dirname(planPath);
  const ext = path.extname(planPath);
  const newPath = path.join(dir, newName + ext);

  fs.renameSync(planPath, newPath);
  return newPath;
}

// Delete a plan
function deletePlan(planPath) {
  fs.unlinkSync(planPath);
}

// Move plan up in queue
function moveUpInQueue(planPath, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = path.join(root, 'plans', 'todo');
  const plans = fs.readdirSync(plansDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      name: f,
      path: path.join(plansDir, f),
      stat: fs.statSync(path.join(plansDir, f))
    }))
    .sort((a, b) => a.stat.birthtime - b.stat.birthtime);

  const index = plans.findIndex(p => p.path === planPath);
  if (index <= 0) return false;

  // Swap creation times by touching files
  const prevPlan = plans[index - 1];
  const now = new Date();
  const earlier = new Date(now - 1000);

  // Touch current plan to be earlier
  fs.utimesSync(planPath, earlier, earlier);
  // Touch previous plan to be now
  fs.utimesSync(prevPlan.path, now, now);

  return true;
}

// Move plan down in queue
function moveDownInQueue(planPath, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = path.join(root, 'plans', 'todo');
  const plans = fs.readdirSync(plansDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      name: f,
      path: path.join(plansDir, f),
      stat: fs.statSync(path.join(plansDir, f))
    }))
    .sort((a, b) => a.stat.birthtime - b.stat.birthtime);

  const index = plans.findIndex(p => p.path === planPath);
  if (index >= plans.length - 1) return false;

  const nextPlan = plans[index + 1];
  const now = new Date();
  const earlier = new Date(now - 1000);

  // Touch next plan to be earlier
  fs.utimesSync(nextPlan.path, earlier, earlier);
  // Touch current plan to be now
  fs.utimesSync(planPath, now, now);

  return true;
}

// Remove from queue (back to implementation)
function removeFromQueue(planPath, projectPath) {
  const root = projectPath || findProjectRoot();
  return movePlan(planPath, 'implementation', root);
}

// Assign directly to todo (dangerous - skips impl planning)
function assignDirectly(planPath, projectPath) {
  const root = projectPath || findProjectRoot();
  applyIronLoop(planPath);
  return movePlan(planPath, 'todo', root);
}

/**
 * Initialize background research for a new plan
 * @param {string} planPath - Path to the new plan file
 */
function initResearchAgent(planPath) {
  initBackgroundAgent(planPath, AGENT_TYPES.RESEARCH_ASSISTANT,
    'Researching codebase for related patterns...');
  return AGENT_TYPES.RESEARCH_ASSISTANT;
}

/**
 * Initialize background critic for discussion mode
 * @param {string} planPath - Path to the plan file
 */
function initCriticAgent(planPath) {
  initBackgroundAgent(planPath, AGENT_TYPES.CRITIC,
    'Analyzing plan for gaps and risks...');
  return AGENT_TYPES.CRITIC;
}

/**
 * Initialize vision decomposer agent for a vision
 * @param {string} visionPath - Path to the vision file
 */
function initDecomposerAgent(visionPath) {
  initBackgroundAgent(visionPath, AGENT_TYPES.VISION_DECOMPOSER,
    'Decomposing vision into functional stubs...');
  return AGENT_TYPES.VISION_DECOMPOSER;
}

/**
 * Initialize product owner agent for a stub
 * @param {string} stubPath - Path to the stub file
 */
function initProductOwnerAgent(stubPath) {
  initBackgroundAgent(stubPath, AGENT_TYPES.PRODUCT_OWNER,
    'Refining stub with acceptance criteria...');
  return AGENT_TYPES.PRODUCT_OWNER;
}

/**
 * Initialize review preparer when plan moves to review
 * @param {string} planPath - Path to the plan file
 */
function initReviewAgent(planPath) {
  initBackgroundAgent(planPath, AGENT_TYPES.REVIEW_PREPARER,
    'Preparing review summary...');
  return AGENT_TYPES.REVIEW_PREPARER;
}

/**
 * Move plan to in-progress and prepare for execution
 * @param {string} planPath - Path to the plan in todo
 * @param {string} projectPath - Project root
 */
function startExecution(planPath, projectPath) {
  const root = projectPath || findProjectRoot();
  clearStatus(planPath);
  return movePlan(planPath, 'in-progress', root);
}

/**
 * Complete execution and move to review
 * Validates the plan before allowing transition.
 *
 * @param {string} planPath - Path to the plan in in-progress
 * @param {string} projectPath - Project root
 * @param {Object} options - Options
 * @param {boolean} options.force - Skip validation (requires CTO-Chief approval)
 * @returns {{ newPath: string, backgroundAgent: string, validation: Object }}
 */
function completeExecution(planPath, projectPath, options = {}) {
  const root = projectPath || findProjectRoot();

  // VALIDATION GATE: Validate before moving to review
  const validation = validateForReview(planPath, root);

  if (!validation.valid && !options.force) {
    // Return validation failure - caller must handle
    return {
      newPath: null,
      backgroundAgent: null,
      validation: validation,
      blocked: true,
      message: 'Plan failed pre-review validation. Fix errors or use force with CTO-Chief approval.'
    };
  }

  // If forced with errors, add warning to plan
  if (!validation.valid && options.force) {
    let content = fs.readFileSync(planPath, 'utf8');
    const forceWarning = `\n\n---\n## ⚠️ FORCED TO REVIEW\n\nThis plan was forced to review despite validation errors:\n${validation.errors.map(e => `- ${e}`).join('\n')}\n\nApproved by: CTO-Chief override\nDate: ${new Date().toISOString()}\n---\n`;
    content += forceWarning;
    fs.writeFileSync(planPath, content);
  }

  clearStatus(planPath);
  const newPath = movePlan(planPath, 'review', root);

  // Initialize review preparer
  initBackgroundAgent(newPath, AGENT_TYPES.REVIEW_PREPARER,
    'Preparing review summary...');

  return {
    newPath,
    backgroundAgent: AGENT_TYPES.REVIEW_PREPARER,
    validation: validation,
    blocked: false
  };
}

/**
 * Start the todo executor agent.
 * Acquires lock, cleans up stale in-progress plans, picks next todo plan.
 *
 * @param {string} projectPath - Project root
 * @returns {{ started: boolean, error?: string, plan?: object, cleanedUp?: string[], remainingTodo?: number }}
 */
function startAgent(projectPath) {
  const root = projectPath || findProjectRoot();
  const { acquireLock, clearStop, releaseLock, updateLockPlan } = require('./agent-lock');
  const { readPlans, getPlansDir, setAgentStatus } = require('./state');

  // 1. Try to acquire lock
  const lockResult = acquireLock(root, 'initializing');
  if (!lockResult.acquired) {
    return {
      started: false,
      error: lockResult.error
    };
  }

  // 2. Clear any leftover stop flag
  clearStop(root);

  // 3. Clean up stale in-progress plans (skips overload-retry / overload-partial)
  const cleanedUp = cleanupStaleInProgress(root);

  // 4. Check for an overload-retry plan that is ready to resume.
  //    These stay in in-progress across agent restarts — do not pick a new todo plan.
  const plansDir = getPlansDir(root);
  const inProgressPlans = readPlans(path.join(plansDir, 'in-progress'));
  const retryPlan = inProgressPlans.find(p => p.bgStatus === 'overload-retry');
  if (retryPlan) {
    // Clear overload-retry status so the executor resumes normally
    clearStatus(retryPlan.path);
    updateLockPlan(root, retryPlan.name);
    setAgentStatus(root, {
      active: true,
      plan: retryPlan.name,
      step: 8,
      phase: 'TEST',
      task: 'Resuming after API overload'
    });
    return {
      started: true,
      resumed: true,
      plan: { name: retryPlan.name, path: retryPlan.path },
      cleanedUp,
      remainingTodo: readPlans(path.join(plansDir, 'todo')).length
    };
  }

  // 5. Block if an overload-partial plan is in-progress — requires human gate.
  const partialPlan = inProgressPlans.find(p => p.bgStatus === 'overload-partial');
  if (partialPlan) {
    releaseLock(root);
    return {
      started: false,
      error: `Plan "${partialPlan.name}" has a partial write from an API overload. Review the in-progress plan and clear the .status file before restarting the agent.`
    };
  }

  // 6. Get next plan from todo queue
  const todoPlans = readPlans(path.join(plansDir, 'todo'));

  if (todoPlans.length === 0) {
    // Nothing to do — release lock
    releaseLock(root);
    return {
      started: false,
      error: 'No plans in todo queue'
    };
  }

  // 7. Pick oldest plan (FIFO — already sorted by readPlans)
  const nextPlan = todoPlans[0];

  // 8. Update lock with actual plan name
  updateLockPlan(root, nextPlan.name);

  // 9. Move plan to in-progress
  const newPath = startExecution(nextPlan.path, root);

  // 10. Update agent status for dashboard display
  setAgentStatus(root, {
    active: true,
    plan: nextPlan.name,
    step: 8,
    phase: 'TEST',
    task: 'Starting implementation'
  });

  return {
    started: true,
    plan: { name: nextPlan.name, path: newPath },
    cleanedUp,
    remainingTodo: todoPlans.length - 1
  };
}

/**
 * Request agent stop (graceful -- after current plan completes).
 *
 * @param {string} projectPath - Project root
 * @returns {{ stopped: boolean, message: string }}
 */
function stopAgent(projectPath) {
  const root = projectPath || findProjectRoot();
  const { isLocked, requestStop } = require('./agent-lock');

  const lockStatus = isLocked(root);
  if (!lockStatus.locked) {
    return {
      stopped: false,
      message: 'No agent is currently running'
    };
  }

  requestStop(root);

  return {
    stopped: true,
    message: `Stop requested. Agent will finish "${lockStatus.lock.plan}" then stop.`
  };
}

/**
 * Advance the agent to the next todo plan.
 * Called after current plan completes (moved to review).
 *
 * @param {string} projectPath - Project root
 * @returns {{ next: boolean, plan?: object, stopped?: boolean, done?: boolean, remainingTodo?: number }}
 */
function advanceAgent(projectPath) {
  const root = projectPath || findProjectRoot();
  const { isStopRequested, releaseLock, updateLockPlan, clearStop } = require('./agent-lock');
  const { readPlans, getPlansDir, clearAgentStatus, setAgentStatus } = require('./state');

  // 1. Check stop flag
  if (isStopRequested(root)) {
    releaseLock(root);
    clearAgentStatus(root);
    return { next: false, stopped: true };
  }

  // 2. Get next from todo
  const plansDir = getPlansDir(root);
  const todoPlans = readPlans(path.join(plansDir, 'todo'));

  if (todoPlans.length === 0) {
    releaseLock(root);
    clearAgentStatus(root);
    return { next: false, done: true };
  }

  // 3. Pick oldest and move to in-progress
  const nextPlan = todoPlans[0];
  updateLockPlan(root, nextPlan.name);
  const newPath = startExecution(nextPlan.path, root);

  setAgentStatus(root, {
    active: true,
    plan: nextPlan.name,
    step: 8,
    phase: 'TEST',
    task: 'Starting implementation'
  });

  return {
    next: true,
    plan: { name: nextPlan.name, path: newPath },
    remainingTodo: todoPlans.length - 1
  };
}

/**
 * Create a canvas file (Lean Canvas or BMC) for a vision.
 * Writes plans/canvas/<vision-slug>.md from the corresponding template.
 *
 * Behavior under ambiguity (no-stub rule):
 * - If vision file does not exist at plans/vision/<slug>.md OR plans/done/<slug>.md,
 *   creation proceeds with a warning (canvas can exist before vision is finalized).
 * - If canvas already exists for this vision, throws unless { overwrite: true }.
 *
 * @param {string} visionSlug - Slug of the parent vision (must match /^[a-z0-9][a-z0-9-]*$/)
 * @param {string} canvasType - 'lean' or 'bmc'
 * @param {string} [projectPath] - Project root path
 * @param {{ overwrite?: boolean }} [options] - { overwrite: true } to replace existing canvas
 * @returns {{ name: string, path: string, warnings: string[] }}
 */
function createCanvas(visionSlug, canvasType, projectPath, options = {}) {
  const root = projectPath || findProjectRoot();
  const warnings = [];

  if (canvasType !== 'lean' && canvasType !== 'bmc') {
    throw new Error(`Invalid canvas type '${canvasType}'. Must be 'lean' or 'bmc'.`);
  }

  if (typeof visionSlug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(visionSlug)) {
    throw new Error(`Invalid vision slug '${visionSlug}'. Must match /^[a-z0-9][a-z0-9-]*$/.`);
  }

  // I1: warn if parent vision not found at expected locations
  const visionPath = path.join(root, 'plans', 'vision', `${visionSlug}.md`);
  const doneVisionPath = path.join(root, 'plans', 'done', `${visionSlug}.md`);
  if (!fs.existsSync(visionPath) && !fs.existsSync(doneVisionPath)) {
    warnings.push(`No parent vision found at plans/vision/${visionSlug}.md or plans/done/${visionSlug}.md. Canvas will be created as an orphan.`);
  }

  const templateName = canvasType === 'lean'
    ? 'lean-canvas.md.template'
    : 'business-model-canvas.md.template';
  const templatePath = path.join(root, '.ctoc', 'templates', templateName);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Canvas template not found: ${templatePath}`);
  }

  const canvasDir = path.join(root, 'plans', 'canvas');
  if (!fs.existsSync(canvasDir)) {
    fs.mkdirSync(canvasDir, { recursive: true });
  }

  const filePath = path.join(canvasDir, `${visionSlug}.md`);

  // I2: refuse to silently overwrite existing canvas
  if (fs.existsSync(filePath) && !options.overwrite) {
    throw new Error(`Canvas already exists at ${filePath}. Pass { overwrite: true } to replace.`);
  }

  let template = fs.readFileSync(templatePath, 'utf8');

  const displayName = visionSlug
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
  template = template
    .replace(/\{\{NAME\}\}/g, displayName)
    .replace(/\{\{DATE\}\}/g, new Date().toISOString())
    .replace(/\{\{VISION_SLUG\}\}/g, visionSlug);

  fs.writeFileSync(filePath, template);

  return {
    name: visionSlug,
    path: filePath,
    warnings
  };
}

/**
 * Clean up orphaned in-progress plans (D2).
 * If no lock is active for an in-progress plan, move it to review.
 * Logs cleanup events to .ctoc/logs/cleanup.json (keeps plan files clean).
 *
 * @param {string} projectPath - Project root
 * @returns {string[]} Names of cleaned-up plans
 */
function cleanupStaleInProgress(projectPath) {
  const root = projectPath || findProjectRoot();
  const { readPlans, getPlansDir } = require('./state');
  const plansDir = getPlansDir(root);
  const inProgressDir = path.join(plansDir, 'in-progress');
  const plans = readPlans(inProgressDir);
  const cleanedUp = [];

  for (const plan of plans) {
    // Skip plans in overload states — they need special handling, not cleanup.
    // overload-retry: executor will resume; overload-partial: human gate required.
    const planStatus = readStatus(plan.path);
    if (planStatus.status === 'overload-retry' || planStatus.status === 'overload-partial') {
      continue;
    }

    // Log cleanup event to .ctoc/logs/cleanup.json
    const logDir = path.join(root, '.ctoc', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'cleanup.json');
    let log = [];
    try {
      log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : [];
    } catch { /* ignore */ }
    log.push({
      plan: plan.name,
      from: 'in-progress',
      to: 'review',
      reason: 'orphaned',
      at: new Date().toISOString()
    });
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));

    movePlan(plan.path, 'review', root);
    cleanedUp.push(plan.name);
  }

  return cleanedUp;
}

module.exports = {
  movePlan,
  approvePlan,
  applyIronLoop,
  applyBasicIronLoopTemplate,
  rejectPlan,
  renamePlan,
  deletePlan,
  moveUpInQueue,
  moveDownInQueue,
  removeFromQueue,
  assignDirectly,
  // Background agent functions
  AGENT_TYPES,
  initBackgroundAgent,
  initResearchAgent,
  initCriticAgent,
  initDecomposerAgent,
  initProductOwnerAgent,
  initReviewAgent,
  startExecution,
  completeExecution,
  // Agent orchestration functions
  startAgent,
  stopAgent,
  advanceAgent,
  cleanupStaleInProgress,
  createCanvas
};
