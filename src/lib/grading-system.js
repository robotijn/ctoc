/**
 * Grading System
 *
 * Implements the 0-10 scoring system for agent quality.
 * Tracks grades, validates scores, and provides analysis.
 *
 * @module lib/grading-system
 */

const fs = require('fs').promises;
const path = require('path');

// Simple JSON-based storage (YAML-compatible keys)
const simpleYaml = {
  load: (str) => {
    try {
      // Try JSON first
      const cleaned = str.replace(/^\s*#.*$/gm, '').trim();
      if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
        return JSON.parse(cleaned);
      }
      return {};
    } catch (e) {
      return {};
    }
  },
  dump: (obj) => JSON.stringify(obj, null, 2)
};

// Configuration - use functions to support dynamic HOME
function getGradesFile() {
  return path.join(process.env.HOME || '/tmp', '.ctoc/agents/grades.yaml');
}
// Keep GRADES_FILE for export compatibility
const GRADES_FILE = getGradesFile();

/**
 * Score thresholds and meanings
 */
const SCORE_MEANINGS = {
  0: 'Fundamentally broken',
  1: 'Fundamentally broken',
  2: 'Fundamentally broken',
  3: 'Major gaps, significant rework needed',
  4: 'Major gaps, significant rework needed',
  5: 'Functional but weak, needs improvement',
  6: 'Functional but weak, needs improvement',
  7: 'Good quality, still has issues',
  8: 'Good quality, still has issues',
  9: 'Excellent, only edge cases remain',
  10: 'PERFECT (almost never given)'
};

/**
 * Status values
 */
const STATUS = {
  PERFECT: 'perfect',
  ACCEPTED: 'accepted_with_notes',
  NEEDS_ATTENTION: 'needs_attention',
  BOOTSTRAP: 'bootstrap',
  PENDING: 'pending',
  FAILED: 'failed'
};

/**
 * Dimension weights for overall score calculation
 */
const DIMENSION_WEIGHTS = {
  specificity: 1.0,
  completeness: 1.0,
  boundaries: 1.0,
  actionability: 1.0,
  integration: 1.0
};

/**
 * Calculate overall score from dimension scores
 *
 * @param {Object} dimensions - Score for each dimension
 * @returns {number} Overall score (0-10, rounded to 1 decimal)
 */
function calculateOverallScore(dimensions) {
  const weights = Object.keys(DIMENSION_WEIGHTS);
  let totalWeight = 0;
  let weightedSum = 0;

  for (const dim of weights) {
    if (dimensions[dim] !== undefined) {
      weightedSum += dimensions[dim] * DIMENSION_WEIGHTS[dim];
      totalWeight += DIMENSION_WEIGHTS[dim];
    }
  }

  if (totalWeight === 0) return 0;

  const overall = weightedSum / totalWeight;
  return Math.round(overall * 10) / 10;
}

/**
 * Validate dimension scores
 *
 * @param {Object} dimensions - Score for each dimension
 * @returns {Object} Validation result
 */
function validateDimensions(dimensions) {
  const errors = [];
  const warnings = [];

  const required = ['specificity', 'completeness', 'boundaries', 'actionability', 'integration'];

  for (const dim of required) {
    if (dimensions[dim] === undefined) {
      errors.push(`Missing required dimension: ${dim}`);
    } else if (typeof dimensions[dim] !== 'number') {
      errors.push(`Invalid type for ${dim}: expected number, got ${typeof dimensions[dim]}`);
    } else if (dimensions[dim] < 0 || dimensions[dim] > 10) {
      errors.push(`Score out of range for ${dim}: ${dimensions[dim]} (must be 0-10)`);
    }
  }

  // Check for score of 10 (should be rare)
  const tens = required.filter(dim => dimensions[dim] === 10);
  if (tens.length > 0 && tens.length < required.length) {
    warnings.push(`Partial perfect scores (${tens.join(', ')}=10) - ensure consistency`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Determine status based on score
 *
 * @param {number} score - Overall score
 * @returns {string} Status value
 */
function determineStatus(score) {
  if (score === 10) return STATUS.PERFECT;
  if (score >= 8) return STATUS.ACCEPTED;
  return STATUS.NEEDS_ATTENTION;
}

/**
 * Get score meaning
 *
 * @param {number} score - Score value
 * @returns {string} Meaning description
 */
function getScoreMeaning(score) {
  const rounded = Math.floor(score);
  return SCORE_MEANINGS[rounded] || 'Unknown';
}

/**
 * Load grades from file
 *
 * @returns {Promise<Object>} Grades object
 */
async function loadGrades() {
  try {
    const content = await fs.readFile(getGradesFile(), 'utf8');
    return simpleYaml.load(content) || {};
  } catch (e) {
    return {};
  }
}

/**
 * Save grades to file
 *
 * @param {Object} grades - Grades object
 * @returns {Promise<void>}
 */
async function saveGrades(grades) {
  const gradesFile = getGradesFile();
  await fs.mkdir(path.dirname(gradesFile), { recursive: true });
  await fs.writeFile(gradesFile, simpleYaml.dump(grades));
}

/**
 * Update grade for an agent
 *
 * @param {string} agentName - Agent name
 * @param {Object} data - Grade data
 * @returns {Promise<void>}
 */
async function updateGrade(agentName, data) {
  const grades = await loadGrades();

  grades[agentName] = {
    score: data.score,
    status: data.status || determineStatus(data.score),
    rounds: data.rounds || 0,
    lastUpdated: new Date().toISOString(),
    history: data.history || [],
    notes: data.notes || null
  };

  await saveGrades(grades);
}

/**
 * Get grade for an agent
 *
 * @param {string} agentName - Agent name
 * @returns {Promise<Object|null>} Grade data or null
 */
async function getGrade(agentName) {
  const grades = await loadGrades();
  return grades[agentName] || null;
}

/**
 * Get all agents with a specific status
 *
 * @param {string} status - Status to filter by
 * @returns {Promise<Array>} List of agents
 */
async function getAgentsByStatus(status) {
  const grades = await loadGrades();
  return Object.entries(grades)
    .filter(([_, data]) => data.status === status)
    .map(([name, data]) => ({ name, ...data }));
}

/**
 * Get agents below a score threshold
 *
 * @param {number} threshold - Score threshold
 * @returns {Promise<Array>} List of agents
 */
async function getAgentsBelowThreshold(threshold) {
  const grades = await loadGrades();
  return Object.entries(grades)
    .filter(([_, data]) => data.score < threshold)
    .sort((a, b) => a[1].score - b[1].score)
    .map(([name, data]) => ({ name, ...data }));
}

/**
 * Analyze score progression for an agent
 *
 * @param {string} agentName - Agent name
 * @returns {Promise<Object>} Progression analysis
 */
async function analyzeProgression(agentName) {
  const grade = await getGrade(agentName);
  if (!grade || !grade.history || grade.history.length === 0) {
    return { available: false };
  }

  const history = grade.history;
  const scores = history.map(h => h.overall);

  // Calculate trends
  const improvements = [];
  for (let i = 1; i < scores.length; i++) {
    improvements.push(scores[i] - scores[i - 1]);
  }

  const avgImprovement = improvements.length > 0
    ? improvements.reduce((a, b) => a + b, 0) / improvements.length
    : 0;

  // Identify bottleneck dimension
  const lastRound = history[history.length - 1];
  const dimensions = ['specificity', 'completeness', 'boundaries', 'actionability', 'integration'];
  let bottleneck = null;
  let lowestScore = 11;

  for (const dim of dimensions) {
    const score = lastRound.scores?.[dim] || lastRound[dim];
    if (score !== undefined && score < lowestScore) {
      lowestScore = score;
      bottleneck = dim;
    }
  }

  // Estimate rounds to target
  const targetScore = 10;
  const currentScore = grade.score;
  const roundsToTarget = avgImprovement > 0
    ? Math.ceil((targetScore - currentScore) / avgImprovement)
    : Infinity;

  return {
    available: true,
    roundsCompleted: history.length,
    startScore: scores[0],
    currentScore: currentScore,
    targetScore: targetScore,
    averageImprovementPerRound: Math.round(avgImprovement * 100) / 100,
    trend: avgImprovement > 0.5 ? 'improving' : avgImprovement > -0.5 ? 'stable' : 'declining',
    bottleneckDimension: bottleneck,
    estimatedRoundsToTarget: roundsToTarget === Infinity ? 'N/A' : roundsToTarget,
    history: history.map(h => ({
      round: h.round,
      overall: h.overall,
      issues: h.issues
    }))
  };
}

/**
 * Generate grades summary report
 *
 * @returns {Promise<Object>} Summary report
 */
async function generateSummary() {
  const grades = await loadGrades();
  const agents = Object.entries(grades);

  const summary = {
    totalAgents: agents.length,
    byStatus: {
      [STATUS.PERFECT]: 0,
      [STATUS.ACCEPTED]: 0,
      [STATUS.NEEDS_ATTENTION]: 0,
      [STATUS.PENDING]: 0,
      [STATUS.BOOTSTRAP]: 0,
      [STATUS.FAILED]: 0
    },
    scoreDistribution: {
      '9-10': 0,
      '7-8': 0,
      '5-6': 0,
      '3-4': 0,
      '0-2': 0
    },
    averageScore: 0,
    topPerformers: [],
    needsAttention: [],
    lastUpdated: new Date().toISOString()
  };

  let totalScore = 0;
  let scoredAgents = 0;

  for (const [_name, data] of agents) {
    // Count by status
    if (summary.byStatus[data.status] !== undefined) {
      summary.byStatus[data.status]++;
    }

    // Score distribution
    if (data.score !== undefined && data.score > 0) {
      scoredAgents++;
      totalScore += data.score;

      if (data.score >= 9) summary.scoreDistribution['9-10']++;
      else if (data.score >= 7) summary.scoreDistribution['7-8']++;
      else if (data.score >= 5) summary.scoreDistribution['5-6']++;
      else if (data.score >= 3) summary.scoreDistribution['3-4']++;
      else summary.scoreDistribution['0-2']++;
    }
  }

  // Calculate average
  summary.averageScore = scoredAgents > 0
    ? Math.round((totalScore / scoredAgents) * 10) / 10
    : 0;

  // Top performers (score >= 9)
  summary.topPerformers = agents
    .filter(([_, data]) => data.score >= 9)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 10)
    .map(([name, data]) => ({ name, score: data.score }));

  // Needs attention (score < 8)
  summary.needsAttention = agents
    .filter(([_, data]) => data.score > 0 && data.score < 8)
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, 10)
    .map(([name, data]) => ({ name, score: data.score, status: data.status }));

  return summary;
}

/**
 * Format grades for display
 *
 * @param {Object} grades - Grades object
 * @returns {string} Formatted string
 */
function formatGrades(grades) {
  const lines = [];
  lines.push('Agent Grades Summary');
  lines.push('=' .repeat(50));
  lines.push('');

  const sorted = Object.entries(grades)
    .sort((a, b) => (b[1].score || 0) - (a[1].score || 0));

  for (const [name, data] of sorted) {
    const score = data.score !== undefined ? data.score.toFixed(1) : 'N/A';
    const status = data.status || 'unknown';
    const meaning = data.score !== undefined ? getScoreMeaning(data.score) : '';

    lines.push(`${name}`);
    lines.push(`  Score: ${score}/10 (${status})`);
    lines.push(`  ${meaning}`);
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = {
  // Core functions
  calculateOverallScore,
  validateDimensions,
  determineStatus,
  getScoreMeaning,

  // Grade management
  loadGrades,
  saveGrades,
  updateGrade,
  getGrade,

  // Queries
  getAgentsByStatus,
  getAgentsBelowThreshold,
  analyzeProgression,
  generateSummary,

  // Utilities
  formatGrades,

  // Constants
  SCORE_MEANINGS,
  STATUS,
  DIMENSION_WEIGHTS,
  GRADES_FILE
};
