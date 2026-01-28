#!/usr/bin/env node
/**
 * CTOC Pre-Compact Hook
 * Runs before Claude Code context compaction
 *
 * Responsibilities:
 * 1. Save current Iron Loop state to JSON (quick state)
 * 2. Save continuation.yaml (context-rich state for resumption)
 * 3. Log compaction event
 * 4. Preserve critical context including decisions and blockers
 */

const fs = require('fs');
const path = require('path');
const {
  ensureDirectories,
  loadIronLoopState,
  saveIronLoopState,
  logSessionEvent,
  getTimestamp,
  log,
  warn,
  STEP_NAMES
} = require('../lib/utils');

// ============================================================================
// Continuation State Management
// ============================================================================

/**
 * Get path to continuation.yaml in project
 */
function getContinuationPath(projectPath) {
  return path.join(projectPath, '.ctoc', 'state', 'continuation.yaml');
}

/**
 * Load existing continuation state from YAML
 */
function loadContinuationState(projectPath) {
  const continuationPath = getContinuationPath(projectPath);
  if (fs.existsSync(continuationPath)) {
    try {
      const content = fs.readFileSync(continuationPath, 'utf8');
      // Simple YAML parsing for our known structure
      return parseSimpleYaml(content);
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Simple YAML parser for our continuation format
 */
function parseSimpleYaml(content) {
  const lines = content.split('\n');
  const result = {};
  let currentSection = null;
  let currentSubSection = null;
  let inList = false;
  let listItems = [];

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || line.trim() === '') continue;

    // Check indentation level
    const leadingSpaces = line.match(/^(\s*)/)[1].length;

    if (leadingSpaces === 0 && line.includes(':')) {
      // Top-level section
      const [key, value] = line.split(':').map(s => s.trim());
      if (value) {
        result[key] = value.replace(/^["']|["']$/g, '');
      } else {
        currentSection = key;
        result[currentSection] = {};
      }
    }
  }

  return result;
}

/**
 * Save continuation state as YAML
 */
function saveContinuationState(projectPath, state, ironLoopState) {
  const continuationPath = getContinuationPath(projectPath);
  const continuationDir = path.dirname(continuationPath);

  // Ensure directory exists
  if (!fs.existsSync(continuationDir)) {
    fs.mkdirSync(continuationDir, { recursive: true });
  }

  const timestamp = getTimestamp();
  const stepName = STEP_NAMES[ironLoopState?.currentStep] || 'UNKNOWN';

  // Build YAML content
  let yaml = `# CTOC Continuation State
# Auto-saved by pre-compact hook at ${timestamp}
# Use this to resume after context compaction

session:
  started: "${state?.session?.started || timestamp}"
  last_updated: "${timestamp}"
  last_compaction: "${timestamp}"

goal:
  summary: "${ironLoopState?.feature || 'No feature specified'}"
  acceptance_criteria:
`;

  // Add acceptance criteria if available
  if (state?.goal?.acceptance_criteria?.length > 0) {
    for (const criterion of state.goal.acceptance_criteria) {
      yaml += `    - "${criterion}"\n`;
    }
  } else {
    yaml += `    - "Complete Iron Loop step ${ironLoopState?.currentStep || 1}"\n`;
  }

  yaml += `
iron_loop:
  current_step: ${ironLoopState?.currentStep || 1}
  step_name: "${stepName}"
  step_started: "${ironLoopState?.steps?.[ironLoopState?.currentStep]?.timestamp || timestamp}"

key_decisions:
`;

  // Add key decisions if available
  if (state?.key_decisions?.length > 0) {
    for (const decision of state.key_decisions) {
      yaml += `  - decision: "${decision.decision}"\n`;
      yaml += `    reason: "${decision.reason}"\n`;
      yaml += `    made_at: "${decision.made_at}"\n`;
    }
  } else {
    yaml += `  # No decisions recorded yet\n`;
  }

  yaml += `
blockers_resolved:
`;

  // Add blockers if available
  if (state?.blockers_resolved?.length > 0) {
    for (const blocker of state.blockers_resolved) {
      yaml += `  - blocker: "${blocker.blocker}"\n`;
      yaml += `    resolution: "${blocker.resolution}"\n`;
    }
  } else if (ironLoopState?.blockers?.length > 0) {
    for (const blocker of ironLoopState.blockers) {
      yaml += `  - blocker: "${blocker}"\n`;
      yaml += `    resolution: "Pending resolution"\n`;
    }
  } else {
    yaml += `  # No blockers encountered\n`;
  }

  yaml += `
progress:
  completed_files:
`;

  // Add completed files from Iron Loop artifacts
  const completedFiles = [
    ...(ironLoopState?.artifacts?.tests || []),
    ...(ironLoopState?.artifacts?.implementation || []),
    ...(ironLoopState?.artifacts?.documentation || [])
  ];

  if (completedFiles.length > 0) {
    for (const file of completedFiles) {
      yaml += `    - "${file}"\n`;
    }
  } else if (state?.progress?.completed_files?.length > 0) {
    for (const file of state.progress.completed_files) {
      yaml += `    - "${file}"\n`;
    }
  } else {
    yaml += `    # No files completed yet\n`;
  }

  yaml += `
  in_progress:
`;

  if (state?.progress?.in_progress?.file) {
    yaml += `    file: "${state.progress.in_progress.file}"\n`;
    yaml += `    notes: "${state.progress.in_progress.notes || 'In progress'}"\n`;
  } else {
    yaml += `    # No file currently in progress\n`;
  }

  yaml += `
  pending:
`;

  if (state?.progress?.pending?.length > 0) {
    for (const file of state.progress.pending) {
      yaml += `    - "${file}"\n`;
    }
  } else {
    yaml += `    # Determined by current step\n`;
  }

  yaml += `
warnings:
`;

  if (state?.warnings?.length > 0) {
    for (const warning of state.warnings) {
      yaml += `  - "${warning}"\n`;
    }
  } else {
    yaml += `  # No warnings\n`;
  }

  yaml += `
metrics:
  compaction_count: ${(state?.metrics?.compaction_count || 0) + 1}
  last_step_before_compact: ${ironLoopState?.currentStep || 1}
`;

  fs.writeFileSync(continuationPath, yaml);
  return continuationPath;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    ensureDirectories();

    const projectPath = process.cwd();

    // 1. Load existing states
    const ironLoopState = loadIronLoopState(projectPath);
    const continuationState = loadContinuationState(projectPath);

    if (ironLoopState) {
      // 2. Update Iron Loop state with compaction timestamp
      ironLoopState.lastUpdated = getTimestamp();
      ironLoopState.lastCompaction = getTimestamp();
      saveIronLoopState(projectPath, ironLoopState);

      log(`Pre-compact: Saved Iron Loop state`);
      log(`  Feature: ${ironLoopState.feature || 'None'}`);
      log(`  Step: ${ironLoopState.currentStep} (${STEP_NAMES[ironLoopState.currentStep]})`);
    }

    // 3. Save context-rich continuation state
    const continuationPath = saveContinuationState(
      projectPath,
      continuationState || {},
      ironLoopState || { currentStep: 1 }
    );
    log(`Pre-compact: Saved continuation state to ${path.relative(projectPath, continuationPath)}`);

    // 4. Log compaction event
    logSessionEvent('pre_compact', {
      project: projectPath,
      timestamp: getTimestamp(),
      ironLoopStep: ironLoopState?.currentStep,
      feature: ironLoopState?.feature,
      continuationSaved: true
    });

    // 5. Output context preservation summary
    console.log('\n[CTOC] Pre-compaction state saved.');
    console.log('[CTOC] Continuation state preserved at .ctoc/state/continuation.yaml');
    console.log('[CTOC] Iron Loop progress preserved for context restoration.\n');

    // 6. Output key information for the compaction summary
    if (ironLoopState) {
      console.log('=== CTOC CONTEXT SUMMARY ===');
      console.log(`Feature: ${ironLoopState.feature || 'Unknown'}`);
      console.log(`Iron Loop Step: ${ironLoopState.currentStep} (${STEP_NAMES[ironLoopState.currentStep]})`);
      console.log(`Language: ${ironLoopState.language || 'Unknown'}`);
      if (ironLoopState.framework) {
        console.log(`Framework: ${ironLoopState.framework}`);
      }
      console.log('============================\n');
    }

  } catch (error) {
    console.error(`[CTOC ERROR] Pre-compact failed: ${error.message}`);
    // Don't exit with error - this is a cleanup hook
  }

  process.exit(0);
}

main();
