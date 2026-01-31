/**
 * Background Processing
 * Status tracking for background agents working on plans
 */

const fs = require('fs');
const path = require('path');

/**
 * Get status file path for a plan
 * @param {string} planPath - Path to the plan file
 * @returns {string} Path to status file
 */
function getStatusPath(planPath) {
  return planPath + '.status';
}

/**
 * Write background agent status
 * @param {string} planPath - Path to the plan file
 * @param {Object} status - Status object
 * @param {string} status.agent - Agent type (research-assistant, implementation-planner, etc.)
 * @param {string} status.status - Current status (working, complete, needs-input, timeout)
 * @param {string} [status.message] - Optional status message
 */
function writeStatus(planPath, status) {
  const statusPath = getStatusPath(planPath);
  const statusObj = {
    agent: status.agent,
    status: status.status,
    started: status.started || new Date().toISOString(),
    completed: status.status === 'complete' ? new Date().toISOString() : null,
    message: status.message || null,
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(statusPath, JSON.stringify(statusObj, null, 2));
  return statusObj;
}

/**
 * Read background agent status
 * @param {string} planPath - Path to the plan file
 * @returns {Object} Status object with status field (none, working, complete, needs-input, timeout)
 */
function readStatus(planPath) {
  const statusPath = getStatusPath(planPath);

  if (!fs.existsSync(statusPath)) {
    return { status: 'none' };
  }

  try {
    const content = fs.readFileSync(statusPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return { status: 'none' };
  }
}

/**
 * Clear status file (remove it)
 * @param {string} planPath - Path to the plan file
 */
function clearStatus(planPath) {
  const statusPath = getStatusPath(planPath);

  if (fs.existsSync(statusPath)) {
    fs.unlinkSync(statusPath);
  }
}

/**
 * Get status icon for display
 * @param {string} status - Status string
 * @returns {string} Unicode icon
 */
function getStatusIcon(status) {
  switch (status) {
    case 'none':
      return '○';  // No background work
    case 'working':
      return '◐';  // Background agent working
    case 'complete':
      return '●';  // Ready (background work complete)
    case 'needs-input':
      return '⚠';  // Background agent needs input
    case 'timeout':
      return '✗';  // Timed out
    default:
      return '○';
  }
}

/**
 * Check if status is stale (older than timeout)
 * @param {Object} status - Status object
 * @param {number} [timeoutMs=300000] - Timeout in milliseconds (default 5 minutes)
 * @returns {boolean} True if status is stale
 */
function isStale(status, timeoutMs = 300000) {
  if (!status.started || status.status !== 'working') {
    return false;
  }

  const startTime = new Date(status.started).getTime();
  const now = Date.now();
  return (now - startTime) > timeoutMs;
}

/**
 * Mark status as complete
 * @param {string} planPath - Path to the plan file
 * @param {string} [message] - Optional completion message
 */
function markComplete(planPath, message) {
  const current = readStatus(planPath);
  writeStatus(planPath, {
    agent: current.agent,
    status: 'complete',
    started: current.started,
    message: message || current.message
  });
}

/**
 * Mark status as needing input
 * @param {string} planPath - Path to the plan file
 * @param {string} question - The question needing user input
 */
function markNeedsInput(planPath, question) {
  const current = readStatus(planPath);
  writeStatus(planPath, {
    agent: current.agent,
    status: 'needs-input',
    started: current.started,
    message: question
  });
}

/**
 * Mark status as timeout
 * @param {string} planPath - Path to the plan file
 */
function markTimeout(planPath) {
  const current = readStatus(planPath);
  writeStatus(planPath, {
    agent: current.agent,
    status: 'timeout',
    started: current.started,
    message: 'Agent timed out after 5 minutes'
  });
}

/**
 * Get all status files in a directory
 * @param {string} dirPath - Directory to scan
 * @returns {Array} Array of {planPath, status} objects
 */
function getAllStatuses(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const planPath = path.join(dirPath, f);
      return {
        planPath,
        planName: f.replace('.md', ''),
        ...readStatus(planPath)
      };
    });

  return files;
}

/**
 * Clean up stale status files
 * @param {string} dirPath - Directory to clean
 * @param {number} [timeoutMs=300000] - Timeout in milliseconds
 * @returns {number} Number of stale files marked as timeout
 */
function cleanupStale(dirPath, timeoutMs = 300000) {
  const statuses = getAllStatuses(dirPath);
  let count = 0;

  for (const item of statuses) {
    if (item.status === 'working' && isStale(item, timeoutMs)) {
      markTimeout(item.planPath);
      count++;
    }
  }

  return count;
}

module.exports = {
  getStatusPath,
  writeStatus,
  readStatus,
  clearStatus,
  getStatusIcon,
  isStale,
  markComplete,
  markNeedsInput,
  markTimeout,
  getAllStatuses,
  cleanupStale
};
