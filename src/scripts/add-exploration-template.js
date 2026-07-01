#!/usr/bin/env node
/**
 * Add Exploration Template to Agents
 * Batch script to add exploration protocol section to interactive agents
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');

// Patterns that indicate user interaction
const USER_INTERACTION_PATTERNS = [
  /AskUserQuestion/i,
  /user\s+input/i,
  /prompt\s+user/i,
  /ask\s+the\s+user/i,
  /gather.*requirements/i,
  /discuss.*with.*user/i
];

// Explicitly interactive agents (by relative path from agents/)
const INTERACTIVE_AGENTS = [
  'coordinator/plan-architect.md',
  'coordinator/cto-chief.md',
  'coordinator/super-cto.md',
  'quality/code-reviewer.md',
  'quality/self-reviewer.md'
];

// Exploration protocol template
const EXPLORATION_TEMPLATE = `
## Exploration Protocol

When presenting options to the user, apply deep exploration for strategic decisions:

### Strategic Decision Detection

Before presenting any decision with options, classify it:

**Strategic Decisions** (require deep exploration):
- Architecture choices
- Technology selections
- Design patterns
- Build vs buy decisions

**Tactical Decisions** (simple presentation):
- Naming conventions
- File organization
- Minor configuration

### Deep Exploration Format

For strategic decisions, present:

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│ DECISION: {question}                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Option A: {name}                                            │
│   Pros:                                                     │
│     ✓ {advantage 1}                                         │
│     ✓ {advantage 2}                                         │
│   Cons:                                                     │
│     ✗ {disadvantage 1}                                      │
│   Risk: {low/medium/high} - {explanation}                   │
│                                                              │
│ Option B: {name}                                            │
│   ...                                                        │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│ → RECOMMENDED: Option A                                     │
│   Reason: {detailed justification}                          │
└─────────────────────────────────────────────────────────────┘
\`\`\`

`;

/**
 * Check if content indicates user interaction
 * @param {string} content - File content
 * @param {string} relativePath - Path relative to agents directory
 * @returns {boolean}
 */
function hasUserInteraction(content, relativePath) {
  // Check explicit list first
  if (INTERACTIVE_AGENTS.some(agent => relativePath.includes(agent))) {
    return true;
  }

  // Check content patterns
  for (const pattern of USER_INTERACTION_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if content already has exploration protocol
 * @param {string} content - File content
 * @returns {boolean}
 */
function hasExplorationProtocol(content) {
  return /##\s*Exploration\s*Protocol/i.test(content);
}

/**
 * Find insertion point for exploration protocol
 * @param {string} content - File content
 * @returns {number} Position to insert
 */
function findInsertionPoint(content) {
  // Try to insert before ## Output section
  const outputMatch = content.match(/\n##\s*Output/i);
  if (outputMatch && outputMatch.index !== undefined) {
    // Find the start of the line
    let pos = outputMatch.index;
    while (pos > 0 && content[pos - 1] !== '\n') {
      pos--;
    }
    return pos;
  }

  // Try before ## Examples
  const examplesMatch = content.match(/\n##\s*Examples/i);
  if (examplesMatch && examplesMatch.index !== undefined) {
    let pos = examplesMatch.index;
    while (pos > 0 && content[pos - 1] !== '\n') {
      pos--;
    }
    return pos;
  }

  // Insert at end
  return content.length;
}

/**
 * Process a single agent file
 * @param {string} filePath - Absolute path to agent file
 * @param {Object} options - Options
 * @param {boolean} options.dryRun - Don't actually write files
 * @param {string} options.mockContent - Use this content instead of reading file
 * @returns {Object} Result
 */
function processAgent(filePath, options = {}) {
  const { dryRun = false, mockContent } = options;

  // Get relative path for pattern matching
  const relativePath = filePath.includes('agents/')
    ? filePath.substring(filePath.indexOf('agents/') + 7)
    : path.basename(filePath);

  // Read content
  let content;
  try {
    content = mockContent !== undefined ? mockContent : safeFs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return {
      file: filePath,
      action: 'error',
      error: error.message
    };
  }

  // Check if already has protocol
  if (hasExplorationProtocol(content)) {
    return {
      file: filePath,
      action: 'skip',
      skipped: true,
      reason: 'Already has exploration protocol'
    };
  }

  // Check if interactive
  if (!hasUserInteraction(content, relativePath)) {
    return {
      file: filePath,
      action: 'skip',
      skipped: true,
      reason: 'Not an interactive agent'
    };
  }

  // Find insertion point
  const insertPos = findInsertionPoint(content);

  // Create new content
  const newContent = content.slice(0, insertPos) +
    EXPLORATION_TEMPLATE +
    content.slice(insertPos);

  // Write if not dry run
  if (!dryRun && mockContent === undefined) {
    try {
      safeFs.writeFileSync(filePath, newContent);
    } catch (error) {
      return {
        file: filePath,
        action: 'error',
        error: error.message
      };
    }
  }

  return {
    file: filePath,
    action: 'update',
    updated: true,
    dryRun,
    insertPos,
    written: !dryRun && mockContent === undefined
  };
}

/**
 * Find all agent files recursively
 * @param {string} dir - Directory to search
 * @returns {string[]} Array of file paths
 */
function findAgentFiles(dir) {
  const files = [];

  try {
    const entries = safeFs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...findAgentFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Ignore errors (permission issues, etc.)
  }

  return files;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const agentsDir = path.resolve(__dirname, '..', '..', 'agents');

  console.log('Add Exploration Template to Agents');
  console.log('==================================');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Agents directory: ${agentsDir}`);
  console.log('');

  // Find all agent files
  const agentFiles = findAgentFiles(agentsDir);
  console.log(`Found ${agentFiles.length} agent files`);
  console.log('');

  // Process each file
  const results = {
    updated: 0,
    skipped: 0,
    errors: 0
  };

  for (const file of agentFiles) {
    const result = processAgent(file, { dryRun });

    if (result.action === 'update') {
      results.updated++;
      console.log(`[UPDATE] ${path.relative(agentsDir, file)}`);
    } else if (result.action === 'skip') {
      results.skipped++;
      if (!args.includes('--quiet')) {
        console.log(`[SKIP] ${path.relative(agentsDir, file)} - ${result.reason}`);
      }
    } else if (result.action === 'error') {
      results.errors++;
      console.error(`[ERROR] ${path.relative(agentsDir, file)} - ${result.error}`);
    }
  }

  // Summary
  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Updated: ${results.updated}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log(`Errors: ${results.errors}`);

  if (dryRun && results.updated > 0) {
    console.log('');
    console.log('Run without --dry-run to apply changes.');
  }
}

// Export for testing
module.exports = {
  USER_INTERACTION_PATTERNS,
  INTERACTIVE_AGENTS,
  EXPLORATION_TEMPLATE,
  hasUserInteraction,
  hasExplorationProtocol,
  findInsertionPoint,
  processAgent,
  findAgentFiles
};

// Run if called directly
if (require.main === module) {
  main();
}
