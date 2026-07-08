/**
 * Plan Actions
 * Handle plan operations: approve, reject, move, etc.
 */

const safeFs = require('./safe-fs');
const path = require('path');
const { parseMetadata, readPlans, getPlansDir } = require('./state');
const { refineLoop, appendDeferredQuestions } = require('./iron-loop');
const { writeStatus, clearStatus } = require('./background');
const { findProjectRoot } = require('./project-root');
const { validateForReview, validateForQueue, validateReviewToDone } = require('./plan-validator');
const { logTransition } = require('./transition-log');
const { invalidate } = require('./cache');

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

// Move plan to new location.
// PRIMARY cache choke point: every stage transition flows through here
// (approve/reject/start/complete/queue-removal/cleanup), so invalidating the
// read cache at the end busts stale counts for all of them (CF1).
function movePlan(planPath, destination, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = path.join(root, 'plans');
  const destDir = path.join(plansDir, destination);

  if (!safeFs.existsSync(destDir)) {
    safeFs.mkdirSync(destDir, { recursive: true });
  }

  const fileName = path.basename(planPath);
  const newPath = path.join(destDir, fileName);

  safeFs.renameSync(planPath, newPath);
  invalidate(); // CF1: bust cached counts so the next read reflects the move

  // PI3: additive, fail-open plan-index sync guard. A pure stage move only renames
  // the file (bytes byte-identical before/after), so the plan's contentHash is
  // unchanged → re-path the stored units via store.moveUnit (NO re-embed). Wrapped
  // in try/catch: an index error is logged and swallowed — it must NEVER break the
  // primary rename (the index is a rebuildable cache; SY-13). PI0 owns the store
  // wiring; until PI0 is integrated the wiring is absent and this is a no-op.
  try {
    // F1: pass the SAME `root` used to normalize the moveUnit keys (below) so the
    // guard opens the store keyed on that identical root. Passing `getWiring()` argless
    // resolved it against `process.cwd()` instead — on a symlinked checkout or any
    // `movePlan(projectPath ≠ cwd)` that re-pathed the WRONG store and silently no-op'd
    // (the seam looked live but re-pathed nothing). Keyed on `root`, the seam goes live
    // even when projectPath ≠ cwd.
    const wiring = loadPlanIndexWiring(root);
    if (wiring && wiring.store && typeof wiring.store.moveUnit === 'function') {
      const fromNorm = normalizePlanIndexPath(root, planPath);
      const toNorm = normalizePlanIndexPath(root, newPath);
      wiring.store.moveUnit(fromNorm, toNorm); // pure re-path; embedder untouched
    }
  } catch (err) {
    logPlanIndexError(root, 'movePlan', err);
  }

  return newPath;
}

/**
 * Best-effort load of PI0's plan-index composition-root wiring. Returns
 * `{ store, embedder, calibrationReady }` or null if PI0 is not yet integrated
 * (fail-open). Lazy-required inside the guard so there is no load-time cycle.
 *
 * @param {string} [root] The resolved project root the CALLER normalizes its store
 *   keys against. It MUST be passed through so `getWiring` opens the store keyed on
 *   the same root — otherwise `getWiring()` argless resolves against `process.cwd()`
 *   and re-paths a DIFFERENT store (the F1 dormancy bug). When omitted, `getWiring`
 *   falls back to its own resolution (backward-compatible).
 * @returns {object|null}
 */
function loadPlanIndexWiring(root) {
  try {
    // The PI0 wiring seam does not exist until PI0 integration lands. Require it
    // through an aliased binding so static module resolution does not flag a
    // missing module, while the argument stays a string literal (fail-open).
    const req = require;
    const wiring = req('./plan-index/wiring');
    if (wiring && typeof wiring.getWiring === 'function') {
      // Pass the caller's root so the opened store is keyed IDENTICALLY to the keys
      // the caller normalizes (F1). getWiring canonicalizes the root via realpath so a
      // symlinked root and its realpath map to the SAME singleton/store (F2).
      const w = typeof root === 'string' && root.length > 0
        ? wiring.getWiring({ projectPath: root })
        : wiring.getWiring();
      if (w && w.store) return w;
    }
  } catch {
    /* PI0 wiring not present — fail-open */
  }
  return null;
}

/**
 * Realpath-canonicalize a directory (fail-open). Mirrors `wiring.canonicalizeRoot`
 * so the store-open root (in getWiring) and the key-normalization root here are
 * byte-identical on a symlinked checkout (F2). Falls back to the input on any error
 * (realpath throws for a not-yet-existing path).
 * @param {string} dir
 * @returns {string}
 */
function canonicalizeRoot(dir) {
  try {
    return require('fs').realpathSync.native(dir);
  } catch {
    return dir;
  }
}

/**
 * Normalize a plan path to the canonical `plans/<stage>/<slug>.md` POSIX form the
 * plan index keys on (PI1 D9). Cross-platform.
 *
 * F2: `root` is realpath-canonicalized the SAME way `wiring.getWiring` canonicalizes
 * the root it opens the store against, so on a symlinked root the `path.relative`
 * anchor and the store-open anchor are byte-identical and the keys never diverge.
 * (The result is additionally sliced from the last `plans/` segment, so the key is
 * anchor-robust; canonicalizing `root` keeps the relative computation itself sound
 * when `planPath` is reached through a symlink.)
 * @param {string} root
 * @param {string} planPath
 * @returns {string}
 */
function normalizePlanIndexPath(root, planPath) {
  const canonRoot = canonicalizeRoot(root);
  const canonPlan = canonicalizeRoot(path.dirname(planPath));
  const planBase = path.basename(planPath);
  const rel = path.relative(canonRoot, path.join(canonPlan, planBase));
  const posix = rel.split(path.sep).join('/').replace(/\\/g, '/');
  const idx = posix.lastIndexOf('plans/');
  return idx >= 0 ? posix.slice(idx) : posix;
}

/**
 * Best-effort error log to `.ctoc/logs/plan-index-sync.json`. Never throws.
 * @param {string} root
 * @param {string} source
 * @param {Error} err
 */
function logPlanIndexError(root, source, err) {
  try {
    const logDir = path.join(root, '.ctoc', 'logs');
    if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'plan-index-sync.json');
    let log = [];
    if (safeFs.existsSync(logPath)) {
      try { log = JSON.parse(safeFs.readFileSync(logPath, 'utf8')); } catch { log = []; }
    }
    if (!Array.isArray(log)) log = [];
    log.push({ timestamp: new Date().toISOString(), source, error: err && err.message });
    if (log.length > 500) log = log.slice(-500);
    safeFs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch {
    /* best-effort */
  }
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
        let content = safeFs.readFileSync(planPath, 'utf8');
        content = addApprovalMarker(content, from, to);
        safeFs.writeFileSync(planPath, content);
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
  let content = safeFs.readFileSync(planPath, 'utf8');
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
    content = safeFs.readFileSync(planPath, 'utf8');
    if (content.match(/^---\n/)) {
      content = content.replace(/^---\n/, '---\niron_loop: true\n');
    } else {
      content = `---\niron_loop: true\n---\n\n${content}`;
    }
    safeFs.writeFileSync(planPath, content);
  } catch (err) {
    // Fallback to basic template if refinement fails
    console.error('Iron Loop refinement failed, using basic template:', err.message);
    applyBasicIronLoopTemplate(planPath);
  }
}

// Fallback basic Iron Loop template
function applyBasicIronLoopTemplate(planPath) {
  let content = safeFs.readFileSync(planPath, 'utf8');

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
  safeFs.writeFileSync(planPath, content);
}

// Reject a plan with feedback
function rejectPlan(planPath, feedback, projectPath) {
  const root = projectPath || findProjectRoot();
  let content = safeFs.readFileSync(planPath, 'utf8');
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
  safeFs.writeFileSync(planPath, content);

  // Move to functional
  return movePlan(planPath, 'functional', root);
}

// Rename a plan
function renamePlan(planPath, newName) {
  const dir = path.dirname(planPath);
  const ext = path.extname(planPath);
  const newPath = path.join(dir, newName + ext);

  safeFs.renameSync(planPath, newPath);
  return newPath;
}

// Delete a plan
function deletePlan(planPath) {
  safeFs.unlinkSync(planPath);
  invalidate(); // CF1: removing a plan file changes counts; bust the cache
}

// Move plan up in queue
function moveUpInQueue(planPath, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = path.join(root, 'plans', 'todo');
  const plans = safeFs.readdirSync(plansDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      name: f,
      path: path.join(plansDir, f),
      stat: safeFs.statSync(path.join(plansDir, f))
    }))
    .sort((a, b) => a.stat.birthtime - b.stat.birthtime);

  const index = plans.findIndex(p => p.path === planPath);
  if (index <= 0) return false;

  // Swap creation times by touching files
  const prevPlan = plans[index - 1];
  const now = new Date();
  const earlier = new Date(now - 1000);

  // Touch current plan to be earlier
  safeFs.utimesSync(planPath, earlier, earlier);
  // Touch previous plan to be now
  safeFs.utimesSync(prevPlan.path, now, now);

  invalidate(); // CF1: FIFO reorder is a write; bust the cache for the "every write busts" invariant
  return true;
}

// Move plan down in queue
function moveDownInQueue(planPath, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = path.join(root, 'plans', 'todo');
  const plans = safeFs.readdirSync(plansDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      name: f,
      path: path.join(plansDir, f),
      stat: safeFs.statSync(path.join(plansDir, f))
    }))
    .sort((a, b) => a.stat.birthtime - b.stat.birthtime);

  const index = plans.findIndex(p => p.path === planPath);
  if (index >= plans.length - 1) return false;

  const nextPlan = plans[index + 1];
  const now = new Date();
  const earlier = new Date(now - 1000);

  // Touch next plan to be earlier
  safeFs.utimesSync(nextPlan.path, earlier, earlier);
  // Touch current plan to be now
  safeFs.utimesSync(planPath, now, now);

  invalidate(); // CF1: FIFO reorder is a write; bust the cache for the "every write busts" invariant
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
    let content = safeFs.readFileSync(planPath, 'utf8');
    const forceWarning = `\n\n---\n## ⚠️ FORCED TO REVIEW\n\nThis plan was forced to review despite validation errors:\n${validation.errors.map(e => `- ${e}`).join('\n')}\n\nApproved by: CTO-Chief override\nDate: ${new Date().toISOString()}\n---\n`;
    content += forceWarning;
    safeFs.writeFileSync(planPath, content);
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

  // 3. Clean up stale in-progress plans (D2)
  const cleanedUp = cleanupStaleInProgress(root);

  // 4. Get next plan from todo queue
  const plansDir = getPlansDir(root);
  const todoPlans = readPlans(path.join(plansDir, 'todo'));

  if (todoPlans.length === 0) {
    // Nothing to do — release lock
    releaseLock(root);
    return {
      started: false,
      error: 'No plans in todo queue'
    };
  }

  // 5. Pick oldest plan (FIFO — already sorted by readPlans)
  const nextPlan = todoPlans[0];

  // 6. Update lock with actual plan name
  updateLockPlan(root, nextPlan.name);

  // 7. Move plan to in-progress
  const newPath = startExecution(nextPlan.path, root);

  // 8. Update agent status for dashboard display
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
  const { isStopRequested, releaseLock, updateLockPlan } = require('./agent-lock');
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
  if (!safeFs.existsSync(visionPath) && !safeFs.existsSync(doneVisionPath)) {
    warnings.push(`No parent vision found at plans/vision/${visionSlug}.md or plans/done/${visionSlug}.md. Canvas will be created as an orphan.`);
  }

  const templateName = canvasType === 'lean'
    ? 'lean-canvas.md.template'
    : 'business-model-canvas.md.template';
  const templatePath = path.join(root, '.ctoc', 'templates', templateName);

  if (!safeFs.existsSync(templatePath)) {
    throw new Error(`Canvas template not found: ${templatePath}`);
  }

  const canvasDir = path.join(root, 'plans', 'canvas');
  if (!safeFs.existsSync(canvasDir)) {
    safeFs.mkdirSync(canvasDir, { recursive: true });
  }

  const filePath = path.join(canvasDir, `${visionSlug}.md`);

  // I2: refuse to silently overwrite existing canvas
  if (safeFs.existsSync(filePath) && !options.overwrite) {
    throw new Error(`Canvas already exists at ${filePath}. Pass { overwrite: true } to replace.`);
  }

  let template = safeFs.readFileSync(templatePath, 'utf8');

  const displayName = visionSlug
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
  template = template
    .replace(/\{\{NAME\}\}/g, displayName)
    .replace(/\{\{DATE\}\}/g, new Date().toISOString())
    .replace(/\{\{VISION_SLUG\}\}/g, visionSlug);

  safeFs.writeFileSync(filePath, template);
  invalidate(); // CF1: a new canvas file changes getPlanCounts().canvas; bust the cache

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
    // Log cleanup event to .ctoc/logs/cleanup.json
    const logDir = path.join(root, '.ctoc', 'logs');
    safeFs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'cleanup.json');
    let log = [];
    try {
      log = safeFs.existsSync(logFile) ? JSON.parse(safeFs.readFileSync(logFile, 'utf8')) : [];
    } catch { /* ignore */ }
    log.push({
      plan: plan.name,
      from: 'in-progress',
      to: 'review',
      reason: 'orphaned',
      at: new Date().toISOString()
    });
    safeFs.writeFileSync(logFile, JSON.stringify(log, null, 2));

    movePlan(plan.path, 'review', root);
    cleanedUp.push(plan.name);
  }

  return cleanedUp;
}

// ─────────────────────────────────────────────────────────────────────────────
// SIP1: sub-plan enumeration + batched-gate approval.
//
// A functional plan is decomposed by the implementation-planner into N small
// implementation plans, each linked to the parent via `parent_plan:` and ordered
// via `depends_on:`. `listSubplans` enumerates that set; `approveSubplans` crosses
// a whole batch through ONE human gate by LOOPING the existing gate-safe
// `approvePlan` per sibling (each still stamped `approved_by: human`). This adds
// NO new auto-cross path — it is a convenience over one human decision.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stages scanned for sub-plans of a parent (mirrors the plan stage set).
 */
const SUBPLAN_STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

/**
 * Stages from which a sub-plan SET may be batch-approved (the two human gates a
 * sibling set crosses together: implementation→todo and review→done).
 */
const BATCHED_GATE_SOURCES = ['implementation', 'review'];

/**
 * Parse a `depends_on` frontmatter value into a trimmed slug array.
 * `none`/absent/empty → []. Comma-separated → each trimmed non-empty token.
 *
 * @param {*} raw - the parsed frontmatter value (string, or undefined)
 * @returns {string[]}
 */
function parseDependsOn(raw) {
  if (raw === undefined || raw === null) return [];
  const s = String(raw).trim();
  if (s === '' || s.toLowerCase() === 'none') return [];
  return s.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

/**
 * Enumerate every plan under `plans/` whose frontmatter `parent_plan` equals
 * `parentSlug`. Mirrors `readPlans` (state.js) across all stages. Read-only.
 *
 * @param {string} parentSlug - the parent functional plan's slug
 * @param {string} [projectPath] - project root
 * @returns {Array<{slug: string, stage: string, path: string, dependsOn: string[], bgStatus: string}>}
 *   oldest-first per stage, in SUBPLAN_STAGES order.
 * @throws {Error} 'parentSlug required' when parentSlug is falsy/non-string.
 */
function listSubplans(parentSlug, projectPath) {
  if (typeof parentSlug !== 'string' || parentSlug.length === 0) {
    throw new Error('parentSlug required');
  }
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  // parseMetadata (via readPlans) reads only the FIRST frontmatter block, but a
  // gate-approval marker is prepended as its own block once a plan crosses Gate 2 —
  // pushing `parent_plan`/`depends_on` into the SECOND block where parseMetadata
  // can't see them (so listSubplans returned 0 for review-stage slices). Read the
  // MERGED frontmatter region (all blocks) instead. Lazy require avoids the
  // stale-detector <-> actions require cycle.
  const { extractFrontmatterRegion } = require('./stale-detector');
  const unquote = (v) => v === undefined ? undefined : v.replace(/^["']|["']$/g, '').trim();
  const readParent = (region) => { const m = region.match(/^\s*parent_plan\s*:\s*(.+?)\s*$/m); return m ? unquote(m[1]) : undefined; };
  const readDeps = (region) => { const m = region.match(/^\s*depends_on\s*:\s*(.+?)\s*$/m); return m ? unquote(m[1]) : undefined; };

  const out = [];
  for (const stage of SUBPLAN_STAGES) {
    const plans = readPlans(path.join(plansDir, stage));
    for (const plan of plans) {
      let parentPlan = plan.metadata && plan.metadata.parent_plan;
      let dependsOn = plan.metadata && plan.metadata.depends_on;
      if (String(parentPlan) !== parentSlug) {
        try {
          const region = extractFrontmatterRegion(safeFs.readFileSync(plan.path, 'utf8'));
          const p = readParent(region);
          if (p !== undefined) parentPlan = p;
          const d = readDeps(region);
          if (d !== undefined) dependsOn = d;
        } catch { /* fail-open: fall back to first-block metadata */ }
      }
      if (String(parentPlan) === parentSlug) {
        out.push({
          slug: plan.name,
          stage,
          path: plan.path,
          dependsOn: parseDependsOn(dependsOn),
          bgStatus: plan.bgStatus || 'none'
        });
      }
    }
  }
  return out;
}

/**
 * Order a set of sub-plans so a dependency precedes its dependents (Kahn topo
 * sort over `depends_on`). Best-effort: on a cycle (should not happen — the
 * planner caps chain depth at 3 with no cycles) the remaining nodes are appended
 * in input order rather than throwing. Only intra-batch edges are honored;
 * a `depends_on` naming a sibling outside the batch is ignored for ordering.
 *
 * @param {Array<{slug: string, dependsOn: string[]}>} subplans
 * @returns {Array} the same objects, dependency-ordered
 */
function topoOrderByDependsOn(subplans) {
  const bySlug = new Map(subplans.map(s => [s.slug, s]));
  const indeg = new Map(subplans.map(s => [s.slug, 0]));
  const dependents = new Map(subplans.map(s => [s.slug, []]));

  for (const s of subplans) {
    for (const dep of s.dependsOn) {
      if (!bySlug.has(dep)) continue; // edge outside the batch — ignore for ordering
      indeg.set(s.slug, indeg.get(s.slug) + 1);
      dependents.get(dep).push(s.slug);
    }
  }

  // Seed the queue with zero-indegree nodes, preserving input order.
  const queue = subplans.filter(s => indeg.get(s.slug) === 0).map(s => s.slug);
  const ordered = [];
  const seen = new Set();

  while (queue.length > 0) {
    const slug = queue.shift();
    if (seen.has(slug)) continue;
    seen.add(slug);
    ordered.push(bySlug.get(slug));
    for (const child of dependents.get(slug)) {
      indeg.set(child, indeg.get(child) - 1);
      if (indeg.get(child) === 0) queue.push(child);
    }
  }

  // Cycle fallback: append any nodes not yet emitted, in input order.
  if (ordered.length < subplans.length) {
    for (const s of subplans) {
      if (!seen.has(s.slug)) ordered.push(s);
    }
  }
  return ordered;
}

/**
 * Batch-approve ALL sub-plans of `parentSlug` currently in `fromStage`, crossing
 * each ONE gate via the EXISTING gate-safe `approvePlan`. This is the single
 * human decision expressed as a loop — NOT a new auto-cross path; every sibling
 * receives the `approved_by: human` marker via `approvePlan`/`addApprovalMarker`.
 *
 * Fail-safe (SIP1 D-AS-2): before crossing, each sibling is validated for the
 * transition (implementation→queue / review→done). A sibling that FAILS
 * validation, or whose `approvePlan` throws, is REPORTED in `skipped` with a
 * reason and left in place; the batch CONTINUES. No silent skips.
 *
 * @param {string} parentSlug - the parent functional plan's slug
 * @param {string} fromStage - 'implementation' or 'review'
 * @param {string} [projectPath] - project root
 * @returns {{approved: string[], skipped: Array<{slug: string, reason: string}>, results: Array<{slug: string, newPath: string, humanGate: boolean}>}}
 * @throws {Error} 'parentSlug required'; 'fromStage must be a gate source stage (implementation|review)'
 */
function approveSubplans(parentSlug, fromStage, projectPath) {
  if (typeof parentSlug !== 'string' || parentSlug.length === 0) {
    throw new Error('parentSlug required');
  }
  if (!BATCHED_GATE_SOURCES.includes(fromStage)) {
    throw new Error('fromStage must be a gate source stage (implementation|review)');
  }
  const root = projectPath || findProjectRoot();

  const validator = fromStage === 'implementation' ? validateForQueue : validateReviewToDone;

  const batch = topoOrderByDependsOn(
    listSubplans(parentSlug, root).filter(s => s.stage === fromStage)
  );

  const approved = [];
  const skipped = [];
  const results = [];

  for (const sub of batch) {
    // Per-sibling validate. A failed validation is reported, never silently skipped.
    let validation;
    try {
      validation = validator(sub.path, root);
    } catch (err) {
      skipped.push({ slug: sub.slug, reason: `validation error: ${err.message}` });
      continue;
    }
    if (validation && validation.valid === false) {
      const reason = (validation.errors && validation.errors.length > 0)
        ? validation.errors.join('; ')
        : 'failed validation';
      skipped.push({ slug: sub.slug, reason });
      continue;
    }

    // Cross the gate via the EXISTING gate-safe approvePlan (human marker + move).
    try {
      const { newPath, humanGate } = approvePlan(sub.path, root);
      approved.push(sub.slug);
      results.push({ slug: sub.slug, newPath, humanGate });
    } catch (err) {
      // One bad sibling never aborts the batch (async-overnight resilience).
      skipped.push({ slug: sub.slug, reason: err.message });
    }
  }

  return { approved, skipped, results };
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
  createCanvas,
  // SIP1: sub-plan enumeration + batched-gate approval
  listSubplans,
  approveSubplans
};
