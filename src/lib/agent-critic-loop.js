/**
 * Agent-Critic Loop
 *
 * Implements the 10-round improvement loop for all agents.
 * Uses Agent-Critic to score and provide feedback, then applies fixes.
 *
 * @module lib/agent-critic-loop
 */

const fs = require('fs').promises;
const path = require('path');

// Simple YAML-like serialization (JSON with comments stripped)
const simpleYaml = {
  load: (str) => {
    try {
      // Remove comments and parse as JSON if possible
      const cleaned = str.replace(/^\s*#.*$/gm, '').trim();
      if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
        return JSON.parse(cleaned);
      }
      // Simple key: value parsing
      const result = {};
      const lines = cleaned.split('\n');
      for (const line of lines) {
        const match = line.match(/^(\w+):\s*(.*)$/);
        if (match) {
          const [_, key, value] = match;
          result[key] = value || null;
        }
      }
      return result;
    } catch (e) {
      return {};
    }
  },
  dump: (obj) => JSON.stringify(obj, null, 2)
};

// Configuration
const MAX_ROUNDS = 10;
const PERFECT_SCORE = 10;
const ACCEPTANCE_THRESHOLD = 8;
const GRADES_FILE = path.join(process.env.HOME, '.ctoc/agents/grades.yaml');

/**
 * Self-critique questions for each round of Agent-Critic bootstrap
 */
const SELF_CRITIQUE_QUESTIONS = {
  1: "Am I specific about scoring? Do I have concrete criteria?",
  2: "Do my 5 dimensions cover ALL aspects of agent quality?",
  3: "Is my output format actionable? Can fixes be applied directly?",
  4: "Am I calibrated correctly? Not too harsh, not too lenient?",
  5: "What are my blind spots? What could I miss?",
  6: "Can I be gamed? Can agents pass without being good?",
  7: "Is my scoring consistent across different agent types?",
  8: "Are my suggested fixes implementable by a machine?",
  9: "Can I catch regression? Would I notice the same bug twice?",
  10: "Am I the critic I would want reviewing MY work?"
};

/**
 * Bootstrap the Agent-Critic by having it critique itself
 * Agent-Critic must achieve score 10 to be considered ready
 *
 * @returns {Promise<{finalScore: number, rounds: number, history: Array}>}
 */
async function bootstrapAgentCritic() {
  const agentCriticPath = path.join(__dirname, '..', '..', 'agents', 'pipeline', 'agent-critic.md');
  let currentVersion = await fs.readFile(agentCriticPath, 'utf8');
  let round = 1;
  let score = 0;
  const scoreHistory = [];

  console.log('Starting Agent-Critic self-bootstrap...');
  console.log('Agent-Critic must achieve score 10 to review other agents.');

  while (round <= MAX_ROUNDS && score < PERFECT_SCORE) {
    console.log(`\n=== Self-Bootstrap Round ${round} ===`);
    console.log(`Question: ${SELF_CRITIQUE_QUESTIONS[round]}`);

    // Agent-Critic critiques itself
    const critique = await runAgentCritic({
      target: currentVersion,
      selfCritique: true,
      round: round,
      question: SELF_CRITIQUE_QUESTIONS[round]
    });

    score = critique.scores.overall;
    scoreHistory.push({
      round,
      scores: critique.scores,
      issues: critique.issues.length,
      verdict: critique.verdict
    });

    console.log(`Score: ${score}/10`);
    console.log(`Issues found: ${critique.issues.length}`);

    if (score === PERFECT_SCORE) {
      console.log('\nAgent-Critic achieved perfect score!');
      console.log('Agent-Critic is now ready to review other agents.');
      break;
    }

    // Apply fixes from critique
    console.log('\nApplying fixes...');
    for (const issue of critique.issues) {
      console.log(`  - Fixing: ${issue.problem.substring(0, 50)}...`);
      currentVersion = applyFix(currentVersion, issue);
    }

    await fs.writeFile(agentCriticPath, currentVersion);
    round++;
  }

  if (score < PERFECT_SCORE && round > MAX_ROUNDS) {
    console.log(`\nWARNING: Agent-Critic reached round ${MAX_ROUNDS} with score ${score}`);
    console.log('Accepting with documented limitations.');
    await documentLimitations(agentCriticPath, scoreHistory);
  }

  // Save final grade
  await saveGrade('agents/pipeline/agent-critic.md', score, scoreHistory, 'bootstrap');

  return {
    finalScore: score,
    rounds: round,
    history: scoreHistory
  };
}

/**
 * Run the 10-round improvement loop for any agent
 *
 * @param {string} agentPath - Path to agent markdown file
 * @param {Object} options - Options for the loop
 * @returns {Promise<{accepted: boolean, score: number, rounds: number, history: Array}>}
 */
async function improveAgent(agentPath, options = {}) {
  const { maxRounds = MAX_ROUNDS, dryRun = false } = options;

  let agent = await fs.readFile(agentPath, 'utf8');
  let round = 1;
  const scoreHistory = [];
  const critiques = [];

  const agentName = path.basename(agentPath, '.md');
  console.log(`\nStarting improvement loop for: ${agentName}`);

  while (round <= maxRounds) {
    console.log(`\n=== ${agentName} - Round ${round}/${maxRounds} ===`);

    // Stage 1: INSPECTOR (Agent-Critic)
    console.log('Stage 1: Agent-Critic analyzing...');
    const critique = await runAgentCritic({
      target: agent,
      round: round,
      previousCritiques: critiques
    });

    critiques.push(critique);
    scoreHistory.push({
      round,
      scores: critique.scores,
      issues: critique.issues.length,
      verdict: critique.verdict
    });

    console.log(`Score: ${critique.scores.overall}/10`);
    printScoreBreakdown(critique.scores);

    // Early exit on perfect score
    if (critique.scores.overall === PERFECT_SCORE) {
      console.log(`\nACCEPTED at round ${round} with perfect score!`);
      await saveGrade(agentPath, PERFECT_SCORE, scoreHistory, 'perfect');
      return { accepted: true, score: PERFECT_SCORE, rounds: round, history: scoreHistory };
    }

    if (dryRun) {
      console.log('\n[DRY RUN] Would apply fixes:');
      critique.issues.forEach(issue => {
        console.log(`  - ${issue.dimension}: ${issue.problem.substring(0, 60)}...`);
      });
      round++;
      continue;
    }

    // Stage 2: WRITER (Agent-Writer applies fixes)
    console.log('\nStage 2: Agent-Writer applying fixes...');
    const improved = await runAgentWriter({
      original: agent,
      critique: critique
    });
    agent = improved;

    // Stage 3: RUNNER (Agent-Tester validates)
    console.log('Stage 3: Agent-Tester validating...');
    const testResults = await runAgentTester({
      agent: agent,
      agentPath: agentPath
    });

    if (!testResults.pass) {
      console.log(`Test validation failed (${testResults.failures.length} failures), adjusting...`);
      agent = await runAgentWriter({
        original: agent,
        failures: testResults.failures
      });
    }

    // Stage 4: REVIEWER (Agent-QA final check)
    console.log('Stage 4: Agent-QA checking for regressions...');
    const qaReport = await runAgentQA({
      agent: agent,
      scoreHistory: scoreHistory
    });

    if (qaReport.regressions.length > 0) {
      console.log(`Regressions detected (${qaReport.regressions.length}), reverting...`);
      agent = await revertRegressions(agent, qaReport.regressions);
    }

    await fs.writeFile(agentPath, agent);
    round++;
  }

  // Round 10 reached without perfect score
  const finalScore = scoreHistory[scoreHistory.length - 1].scores.overall;
  console.log(`\nCompleted ${maxRounds} rounds with score: ${finalScore}`);

  let status;
  if (finalScore >= ACCEPTANCE_THRESHOLD) {
    status = 'accepted_with_notes';
    console.log('ACCEPTED WITH NOTES');
  } else {
    status = 'needs_attention';
    console.log('NEEDS ATTENTION - score below threshold');
  }

  await saveGrade(agentPath, finalScore, scoreHistory, status);

  return {
    accepted: finalScore >= ACCEPTANCE_THRESHOLD,
    score: finalScore,
    rounds: maxRounds,
    history: scoreHistory
  };
}

/**
 * Run Agent-Critic on a target
 *
 * @param {Object} params - Parameters for critique
 * @returns {Promise<Object>} Critique result
 */
async function runAgentCritic(params) {
  const { target, round, selfCritique = false, question: _question = null, previousCritiques: _previousCritiques = [] } = params;

  // In a real implementation, this would invoke the agent-critic agent
  // For now, return a mock structure that matches the expected format
  return {
    agent: selfCritique ? 'agent-critic' : extractAgentName(target),
    round: round,
    scores: {
      specificity: 7,
      completeness: 7,
      boundaries: 8,
      actionability: 7,
      integration: 6,
      overall: 7.0
    },
    issues: [],
    strengths: [],
    verdict: 'REFINE'
  };
}

/**
 * Run Agent-Writer to apply fixes
 *
 * @param {Object} params - Parameters
 * @returns {Promise<string>} Improved agent content
 */
async function runAgentWriter(params) {
  const { original, critique: _critique = null, failures: _failures = null } = params;

  // In a real implementation, this would invoke the agent-writer agent
  // For now, return the original with placeholder improvements
  return original;
}

/**
 * Run Agent-Tester to validate agent
 *
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Test results
 */
async function runAgentTester(params) {
  const { agent: _agent, agentPath: _agentPath } = params;

  // In a real implementation, this would invoke the agent-tester agent
  return {
    pass: true,
    total: 0,
    passed: 0,
    failed: 0,
    failures: []
  };
}

/**
 * Run Agent-QA to check for regressions
 *
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} QA report
 */
async function runAgentQA(params) {
  const { agent: _agent, scoreHistory: _scoreHistory } = params;

  // In a real implementation, this would invoke the agent-qa agent
  return {
    structureValid: true,
    schemaCompliant: true,
    regressions: [],
    improvements: [],
    recommendation: 'PROCEED'
  };
}

/**
 * Apply a single fix to the agent content
 *
 * @param {string} content - Current agent content
 * @param {Object} issue - Issue with fix
 * @returns {string} Updated content
 */
function applyFix(content, issue) {
  if (!issue.fix) return content;

  // Simple implementation: append fixes as notes
  // Real implementation would parse location and apply changes
  const fixComment = `\n<!-- Fix applied for: ${issue.problem} -->\n`;

  if (issue.location && content.includes(issue.location)) {
    // Insert after the section
    const locationIndex = content.indexOf(issue.location);
    const nextSection = content.indexOf('\n## ', locationIndex + 1);
    if (nextSection > -1) {
      return content.slice(0, nextSection) + fixComment + issue.fix + '\n' + content.slice(nextSection);
    }
  }

  // Fallback: append to end
  return content + fixComment + issue.fix + '\n';
}

/**
 * Revert regressions detected by QA
 *
 * @param {string} agent - Current agent content
 * @param {Array} regressions - List of regressions
 * @returns {Promise<string>} Reverted content
 */
async function revertRegressions(agent, regressions) {
  // In a real implementation, this would selectively revert changes
  return agent;
}

/**
 * Save agent grade to grades.yaml
 *
 * @param {string} agentPath - Path to agent
 * @param {number} score - Final score
 * @param {Array} history - Score history
 * @param {string} status - Acceptance status
 */
async function saveGrade(agentPath, score, history, status) {
  let grades = {};

  try {
    const existing = await fs.readFile(GRADES_FILE, 'utf8');
    grades = simpleYaml.load(existing) || {};
  } catch (e) {
    // File doesn't exist yet
  }

  const agentName = path.basename(agentPath, '.md');
  grades[agentName] = {
    score: score,
    status: status,
    rounds: history.length,
    lastUpdated: new Date().toISOString(),
    history: history.map(h => ({
      round: h.round,
      overall: h.scores.overall,
      issues: h.issues
    }))
  };

  // Ensure directory exists
  await fs.mkdir(path.dirname(GRADES_FILE), { recursive: true });
  await fs.writeFile(GRADES_FILE, simpleYaml.dump(grades));
}

/**
 * Document limitations when agent doesn't reach perfect score
 *
 * @param {string} agentPath - Path to agent
 * @param {Array} history - Score history
 */
async function documentLimitations(agentPath, history) {
  const lastCritique = history[history.length - 1];
  const limitations = `
## Known Limitations

> Agent did not achieve perfect score (10) after ${history.length} rounds.
> Final score: ${lastCritique.scores.overall}
> Status: Accepted with documented limitations

### Score Progression
${history.map(h => `- Round ${h.round}: ${h.scores.overall}/10 (${h.issues} issues)`).join('\n')}

### Areas for Improvement
- Review dimensions with scores below 9
- Address remaining issues from last critique

---
`;

  const content = await fs.readFile(agentPath, 'utf8');
  if (!content.includes('## Known Limitations')) {
    await fs.writeFile(agentPath, content + '\n' + limitations);
  }
}

/**
 * Extract agent name from content
 *
 * @param {string} content - Agent markdown content
 * @returns {string} Agent name
 */
function extractAgentName(content) {
  const match = content.match(/name:\s*([^\n]+)/);
  return match ? match[1].trim() : 'unknown';
}

/**
 * Print score breakdown
 *
 * @param {Object} scores - Score object
 */
function printScoreBreakdown(scores) {
  console.log('  Breakdown:');
  console.log(`    Specificity:   ${scores.specificity}/10`);
  console.log(`    Completeness:  ${scores.completeness}/10`);
  console.log(`    Boundaries:    ${scores.boundaries}/10`);
  console.log(`    Actionability: ${scores.actionability}/10`);
  console.log(`    Integration:   ${scores.integration}/10`);
}

/**
 * Run the full pipeline for an agent (all 5 stages)
 *
 * @param {string} agentPath - Path to agent
 * @returns {Promise<Object>} Pipeline result
 */
async function runPipeline(agentPath) {
  const result = await improveAgent(agentPath);

  if (result.accepted) {
    // Stage 5: PUBLISHER (Agent-Publisher commits)
    console.log('\nStage 5: Agent-Publisher committing...');
    await runAgentPublisher({
      agentPath: agentPath,
      score: result.score,
      rounds: result.rounds
    });
  }

  return result;
}

/**
 * Run Agent-Publisher to commit changes
 *
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Publish result
 */
async function runAgentPublisher(params) {
  const { agentPath, score, rounds } = params;

  // In a real implementation, this would invoke the agent-publisher agent
  console.log(`  Published: ${path.basename(agentPath)} (score: ${score}, rounds: ${rounds})`);

  return {
    status: 'committed',
    gradeUpdated: true,
    capabilityIndexUpdated: true
  };
}

/**
 * Batch process multiple agents
 *
 * @param {Array<string>} agentPaths - Paths to agents
 * @param {Object} options - Options
 * @returns {Promise<Object>} Batch results
 */
async function batchProcess(agentPaths, options = {}) {
  const { parallel = 1 } = options;
  const results = {};

  if (parallel <= 1) {
    // Sequential processing
    for (const agentPath of agentPaths) {
      results[agentPath] = await runPipeline(agentPath);
    }
  } else {
    // Parallel processing (limited concurrency)
    const chunks = [];
    for (let i = 0; i < agentPaths.length; i += parallel) {
      chunks.push(agentPaths.slice(i, i + parallel));
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(agentPath => runPipeline(agentPath))
      );
      chunk.forEach((path, i) => {
        results[path] = chunkResults[i];
      });
    }
  }

  return results;
}

/**
 * Get current grades for all agents
 *
 * @returns {Promise<Object>} Grades object
 */
async function getGrades() {
  try {
    const content = await fs.readFile(GRADES_FILE, 'utf8');
    return simpleYaml.load(content) || {};
  } catch (e) {
    return {};
  }
}

/**
 * Get agents that need improvement
 *
 * @param {number} threshold - Score threshold
 * @returns {Promise<Array>} List of agent names
 */
async function getAgentsNeedingImprovement(threshold = ACCEPTANCE_THRESHOLD) {
  const grades = await getGrades();
  return Object.entries(grades)
    .filter(([_, data]) => data.score < threshold)
    .map(([name, data]) => ({ name, score: data.score, status: data.status }));
}

module.exports = {
  bootstrapAgentCritic,
  improveAgent,
  runPipeline,
  batchProcess,
  getGrades,
  getAgentsNeedingImprovement,
  saveGrade,
  PERFECT_SCORE,
  ACCEPTANCE_THRESHOLD,
  MAX_ROUNDS
};
