/**
 * Vision Tab
 * Manage vision documents - interactive exploration before formal planning
 */

const fs = require('fs');
const path = require('path');
const { c, line, renderList, renderActionMenu, renderFooter } = require('../lib/tui');
const { readPlans, getPlansDir, timeAgo } = require('../lib/state');

const ACTIONS = [
  { key: '1', label: 'Continue' },
  { key: '2', label: 'View' },
  { key: '3', label: 'Convert → functional plan' },
  { key: '4', label: 'Rename' },
  { key: '5', label: 'Delete' }
];

function render(app) {
  const visionDir = path.join(getPlansDir(app.projectPath), 'vision');
  const visions = readVisions(visionDir);

  let output = '\n';
  output += `${c.bold}Vision Mode${c.reset}`;

  const countStr = visions.length === 0 ? 'No visions' : `${visions.length} exploring`;
  const padding = app.width - 12 - countStr.length;
  output += ' '.repeat(Math.max(1, padding)) + `${c.magenta}${countStr}${c.reset}\n\n`;

  if (visions.length === 0) {
    output += `${c.dim}No visions yet.${c.reset}\n\n`;
    output += `${c.cyan}Vision Mode${c.reset} helps you explore ideas through\n`;
    output += `guided conversation before creating formal plans.\n\n`;
    output += `Press ${c.bold}n${c.reset} to start exploring a new idea.\n\n`;
    output += renderFooter(['←/→ tabs', 'n new', 'q quit']);
  } else {
    output += renderVisionList(visions, app.selectedIndex);
    output += '\n';
    output += renderFooter(['←/→ tabs', '↑/↓ nav', 'Enter select', 'n new', 'q quit']);
  }

  return output;
}

function renderVisionList(visions, selectedIndex) {
  let output = '';

  visions.forEach((vision, i) => {
    const selected = i === selectedIndex;
    const prefix = selected ? `${c.cyan}→${c.reset}` : ' ';
    const name = selected ? `${c.bold}${vision.name}${c.reset}` : vision.name;

    // Show progress indicator
    const progressStr = vision.progress ? `${c.dim}(${vision.progress})${c.reset}` : '';
    const statusIcon = getStatusIcon(vision.status);

    output += `${prefix} [${i + 1}] ${statusIcon} ${name} ${progressStr}\n`;
    if (selected && vision.problem) {
      output += `    ${c.dim}${vision.problem.substring(0, 50)}${vision.problem.length > 50 ? '...' : ''}${c.reset}\n`;
    }
  });

  return output;
}

function getStatusIcon(status) {
  switch (status) {
    case 'exploring': return `${c.yellow}◐${c.reset}`;
    case 'ready': return `${c.green}●${c.reset}`;
    case 'converted': return `${c.dim}✓${c.reset}`;
    default: return `${c.dim}○${c.reset}`;
  }
}

function renderActions(app, vision) {
  // Customize actions based on vision status
  const actions = ACTIONS.map(a => {
    if (a.key === '3' && vision.status === 'converted') {
      return { ...a, label: 'View converted plan', disabled: false };
    }
    return a;
  });

  return renderActionMenu(vision.name, actions, app.actionIndex);
}

function handleKey(key, app) {
  const visionDir = path.join(getPlansDir(app.projectPath), 'vision');
  const visions = readVisions(visionDir);

  if (visions.length === 0) {
    if (key.name === 'n') {
      app.mode = 'new-vision';
      return true;
    }
    return false;
  }

  // List navigation
  if (app.mode === 'list') {
    if (key.name === 'up') {
      app.selectedIndex = Math.max(0, app.selectedIndex - 1);
      return true;
    }
    if (key.name === 'down') {
      app.selectedIndex = Math.min(visions.length - 1, app.selectedIndex + 1);
      return true;
    }
    if (key.name === 'return') {
      app.mode = 'actions';
      app.actionIndex = 0;
      app.selectedPlan = visions[app.selectedIndex];
      return true;
    }
    if (key.name === 'n') {
      app.mode = 'new-vision';
      return true;
    }
    // Number jump
    const num = parseInt(key.sequence, 10);
    if (num >= 1 && num <= visions.length) {
      app.selectedIndex = num - 1;
      app.mode = 'actions';
      app.actionIndex = 0;
      app.selectedPlan = visions[app.selectedIndex];
      return true;
    }
  }

  // Action menu
  if (app.mode === 'actions') {
    if (key.name === 'escape' || key.name === 'b' || key.sequence === '0') {
      app.mode = 'list';
      return true;
    }
    if (key.name === 'up') {
      app.actionIndex = Math.max(0, app.actionIndex - 1);
      return true;
    }
    if (key.name === 'down') {
      app.actionIndex = Math.min(ACTIONS.length - 1, app.actionIndex + 1);
      return true;
    }
    if (key.name === 'return' || (key.sequence >= '1' && key.sequence <= '5')) {
      const actionKey = key.name === 'return' ? ACTIONS[app.actionIndex].key : key.sequence;
      return executeAction(actionKey, app);
    }
  }

  return false;
}

function executeAction(actionKey, app) {
  switch (actionKey) {
    case '1': // Continue
      app.mode = 'vision-explore';
      return true;
    case '2': // View
      app.mode = 'view';
      app.viewContent = app.selectedPlan.content;
      return true;
    case '3': // Convert
      app.mode = 'convert-vision';
      return true;
    case '4': // Rename
      app.mode = 'rename';
      app.inputValue = app.selectedPlan.name;
      return true;
    case '5': // Delete
      app.mode = 'confirm-delete';
      return true;
  }
  return false;
}

/**
 * Read vision documents from directory
 * Parses metadata to show progress and status
 */
function readVisions(visionDir) {
  if (!fs.existsSync(visionDir)) {
    return [];
  }

  const files = fs.readdirSync(visionDir)
    .filter(f => f.endsWith('.md') && f !== '.gitkeep')
    .map(f => {
      const filePath = path.join(visionDir, f);
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      const metadata = parseVisionMetadata(content);

      return {
        name: f.replace('.md', ''),
        path: filePath,
        created: stat.birthtime,
        modified: stat.mtime,
        ago: timeAgo(stat.mtime),
        content,
        ...metadata
      };
    });

  // Sort by modified date, newest first
  files.sort((a, b) => b.modified - a.modified);

  return files;
}

/**
 * Parse vision-specific metadata from file content
 */
function parseVisionMetadata(content) {
  const metadata = {
    status: 'exploring',
    progress: null,
    problem: null,
    title: null
  };

  // Extract title
  const titleMatch = content.match(/^# Vision: (.+)$/m);
  if (titleMatch) {
    metadata.title = titleMatch[1];
  }

  // Extract status
  const statusMatch = content.match(/^- Status: (\w+)$/m);
  if (statusMatch) {
    metadata.status = statusMatch[1];
  }

  // Extract progress
  const progressMatch = content.match(/^- Progress: (.+)$/m);
  if (progressMatch) {
    metadata.progress = progressMatch[1];
  }

  // Extract problem statement
  const problemMatch = content.match(/### Problem Statement\n✓ (.+)/);
  if (problemMatch) {
    metadata.problem = problemMatch[1];
  }

  return metadata;
}

/**
 * Get vision counts for dashboard
 */
function getVisionCounts(projectPath) {
  const visionDir = path.join(getPlansDir(projectPath), 'vision');
  const visions = readVisions(visionDir);

  return {
    total: visions.length,
    exploring: visions.filter(v => v.status === 'exploring').length,
    ready: visions.filter(v => v.status === 'ready').length,
    converted: visions.filter(v => v.status === 'converted').length
  };
}

/**
 * Create a new vision document
 */
function createVision(title, projectPath) {
  const visionDir = path.join(getPlansDir(projectPath), 'vision');

  // Ensure directory exists
  if (!fs.existsSync(visionDir)) {
    fs.mkdirSync(visionDir, { recursive: true });
  }

  // Generate slug from title
  const slug = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const filePath = path.join(visionDir, `${slug}.md`);
  const now = new Date().toISOString();

  const content = `# Vision: ${title}

## Status
- Created: ${now}
- Last Updated: ${now}
- Progress: 0/5 phases complete
- Status: exploring

## Phase 1: Problem Discovery
### Problem Statement
⏳ (not yet answered)

### Target User
⏳ (not yet answered)

### Problem Severity
⏳ (not yet answered)

## Phase 2: Value Proposition
### Success Criteria
⏳ (not yet answered)

### Impact Scale
⏳ (not yet answered)

## Phase 3: Scope Definition
### Minimum Viable Scope
⏳ (not yet answered)

### Explicit Exclusions
⏳ (not yet answered)

### Dependencies
⏳ (not yet answered)

## Phase 4: Risk Assessment
### Failure Modes
⏳ (not yet answered)

### Unknowns
⏳ (not yet answered)

### Assumptions
⏳ (not yet answered)

## Phase 5: Summary
(Generated after all phases complete)

## Discussion History
`;

  fs.writeFileSync(filePath, content);

  return {
    path: filePath,
    name: slug,
    title
  };
}

/**
 * Save vision progress after a question is answered
 */
function saveVisionProgress(visionPath, section, answer) {
  if (!fs.existsSync(visionPath)) return;

  let content = fs.readFileSync(visionPath, 'utf8');
  const now = new Date().toISOString();

  // Update the section with the answer
  const sectionPattern = new RegExp(`(### ${section}\\n)⏳ \\(not yet answered\\)`, 'm');
  content = content.replace(sectionPattern, `$1✓ ${answer}`);

  // Update last updated timestamp
  content = content.replace(
    /- Last Updated: .+$/m,
    `- Last Updated: ${now}`
  );

  // Recalculate progress
  const completedSections = (content.match(/### .+\n✓/g) || []).length;
  const totalSections = 12; // All questions across 5 phases
  const phasesComplete = Math.floor(completedSections / 3);

  content = content.replace(
    /- Progress: .+$/m,
    `- Progress: ${phasesComplete}/5 phases complete`
  );

  // If all phases complete, update status
  if (completedSections >= totalSections - 1) { // -1 because summary is generated
    content = content.replace(
      /- Status: exploring$/m,
      '- Status: ready'
    );
  }

  // Add to discussion history
  const historyEntry = `### ${now}\nQ: ${section}\nA: ${answer}\n\n`;
  content = content.replace(
    /## Discussion History\n/,
    `## Discussion History\n${historyEntry}`
  );

  fs.writeFileSync(visionPath, content);
}

/**
 * Convert vision to functional plan
 */
function convertToFunctional(visionPath, projectPath) {
  if (!fs.existsSync(visionPath)) return null;

  const content = fs.readFileSync(visionPath, 'utf8');
  const metadata = parseVisionMetadata(content);

  // Extract all completed sections
  const sections = {};
  const sectionMatches = content.matchAll(/### (.+)\n✓ (.+)/g);
  for (const match of sectionMatches) {
    sections[match[1]] = match[2];
  }

  // Generate functional plan
  const title = metadata.title || path.basename(visionPath, '.md');
  const slug = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const functionalDir = path.join(getPlansDir(projectPath), 'functional');
  if (!fs.existsSync(functionalDir)) {
    fs.mkdirSync(functionalDir, { recursive: true });
  }

  const functionalPath = path.join(functionalDir, `${slug}.md`);
  const now = new Date().toISOString();

  const functionalContent = `---
title: "${title}"
created: "${now}"
source: "vision/${path.basename(visionPath)}"
---

# ${title}

## Problem Statement

${sections['Problem Statement'] || 'Not defined'}

**Target User:** ${sections['Target User'] || 'Not specified'}

**Severity:** ${sections['Problem Severity'] || 'Not assessed'}

## Success Criteria

${sections['Success Criteria'] || 'Not defined'}

**Impact:** ${sections['Impact Scale'] || 'Not assessed'}

## Scope

### In Scope
${sections['Minimum Viable Scope'] || 'Not defined'}

### Out of Scope
${sections['Explicit Exclusions'] || 'Not defined'}

### Dependencies
${sections['Dependencies'] || 'None identified'}

## Risks & Assumptions

### Potential Failure Modes
${sections['Failure Modes'] || 'Not assessed'}

### Unknowns
${sections['Unknowns'] || 'None identified'}

### Assumptions
${sections['Assumptions'] || 'None documented'}

---
*Converted from vision document on ${now}*
`;

  fs.writeFileSync(functionalPath, functionalContent);

  // Update vision status
  let visionContent = fs.readFileSync(visionPath, 'utf8');
  visionContent = visionContent.replace(
    /- Status: .+$/m,
    '- Status: converted'
  );

  // Add conversion note
  visionContent += `\n## Conversion
Converted to: plans/functional/${slug}.md
Converted at: ${now}
`;

  fs.writeFileSync(visionPath, visionContent);

  return {
    functionalPath,
    functionalSlug: slug
  };
}

module.exports = {
  render,
  renderActions,
  handleKey,
  readVisions,
  getVisionCounts,
  createVision,
  saveVisionProgress,
  convertToFunctional
};
