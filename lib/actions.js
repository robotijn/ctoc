/**
 * Plan Actions
 * Handle plan operations: approve, reject, move, etc.
 */

const fs = require('fs');
const path = require('path');
const { parseMetadata } = require('./state');
const { refineLoop, appendDeferredQuestions } = require('./iron-loop');

// Move plan to new location
function movePlan(planPath, destination, projectPath = process.cwd()) {
  const plansDir = path.join(projectPath, 'plans');
  const destDir = path.join(plansDir, destination);

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const fileName = path.basename(planPath);
  const newPath = path.join(destDir, fileName);

  fs.renameSync(planPath, newPath);
  return newPath;
}

// Approve a plan (move to next stage)
function approvePlan(planPath, projectPath = process.cwd()) {
  const plansDir = path.join(projectPath, 'plans');
  const relativePath = path.relative(plansDir, planPath);

  const flowMap = {
    'functional': 'implementation',
    'implementation': 'todo',
    'review': 'done'
  };

  // Find matching flow
  for (const [from, to] of Object.entries(flowMap)) {
    if (relativePath.startsWith(from)) {
      // If moving to todo, apply Iron Loop
      if (to === 'todo') {
        applyIronLoop(planPath);
      }
      return movePlan(planPath, to, projectPath);
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

  // Run the refinement loop to generate detailed Steps 7-15
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

## Execution Plan (Steps 7-15)

### Step 7: TEST (TDD Red)
- [ ] Write tests for the implementation

### Step 8: QUALITY
- [ ] Lint and format code
- [ ] Verify no syntax errors

### Step 9: IMPLEMENT
- [ ] Implement the feature

### Step 10: REVIEW
- [ ] Self-review code

### Step 11: OPTIMIZE
- [ ] Performance review

### Step 12: SECURE
- [ ] Security audit

### Step 13: VERIFY
- [ ] Run full test suite

### Step 14: DOCUMENT
- [ ] Update documentation

### Step 15: FINAL-REVIEW
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
function rejectPlan(planPath, feedback, projectPath = process.cwd()) {
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
  return movePlan(planPath, 'functional', projectPath);
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
function moveUpInQueue(planPath, projectPath = process.cwd()) {
  const plansDir = path.join(projectPath, 'plans', 'todo');
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
function moveDownInQueue(planPath, projectPath = process.cwd()) {
  const plansDir = path.join(projectPath, 'plans', 'todo');
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
function removeFromQueue(planPath, projectPath = process.cwd()) {
  return movePlan(planPath, 'implementation', projectPath);
}

// Assign directly to todo (dangerous - skips impl planning)
function assignDirectly(planPath, projectPath = process.cwd()) {
  applyIronLoop(planPath);
  return movePlan(planPath, 'todo', projectPath);
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
  assignDirectly
};
