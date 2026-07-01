/**
 * Pipeline Orchestrator
 *
 * Coordinates the 5-stage agent improvement pipeline:
 * 1. Inspector (Agent-Critic) - Scores and critiques
 * 2. Writer (Agent-Writer) - Applies fixes
 * 3. Runner (Agent-Tester) - Validates changes
 * 4. Reviewer (Agent-QA) - Checks for regressions
 * 5. Publisher (Agent-Publisher) - Commits approved changes
 *
 * @module lib/pipeline-orchestrator
 */

const safeFs = require('./safe-fs');
const path = require('path');
const EventEmitter = require('events');

// Configuration
const MAX_ROUNDS = 10;
const PERFECT_SCORE = 10;
const ACCEPTANCE_THRESHOLD = 8;
const PARALLEL_LIMIT = 3;

/**
 * Pipeline stages enum
 */
const STAGES = {
  INSPECTOR: 'inspector',
  WRITER: 'writer',
  RUNNER: 'runner',
  REVIEWER: 'reviewer',
  PUBLISHER: 'publisher'
};

/**
 * Pipeline context - shared state between stages
 */
class PipelineContext {
  constructor(agentPath) {
    this.agentPath = agentPath;
    this.agentName = path.basename(agentPath, '.md');
    this.agent = null;
    this.originalAgent = null;
    this.round = 1;
    this.scoreHistory = [];
    this.critiques = [];
    this.testResults = [];
    this.qaReports = [];
    this.startTime = Date.now();
    this.status = 'running';
    this.error = null;
  }

  toJSON() {
    return {
      agentPath: this.agentPath,
      agentName: this.agentName,
      round: this.round,
      scoreHistory: this.scoreHistory,
      status: this.status,
      duration: Date.now() - this.startTime
    };
  }
}

/**
 * Pipeline Orchestrator
 */
class PipelineOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      maxRounds: options.maxRounds || MAX_ROUNDS,
      parallelLimit: options.parallelLimit || PARALLEL_LIMIT,
      dryRun: options.dryRun || false,
      verbose: options.verbose || false
    };
    this.activePipelines = new Map();
    this.queue = [];
    this.results = new Map();
  }

  /**
   * Run the full pipeline for a single agent
   *
   * @param {string} agentPath - Path to agent file
   * @returns {Promise<Object>} Pipeline result
   */
  async runPipeline(agentPath) {
    const ctx = new PipelineContext(agentPath);
    this.activePipelines.set(agentPath, ctx);
    this.emit('pipeline:start', ctx);

    try {
      // Load agent
      ctx.agent = await safeFs.promises.readFile(agentPath, 'utf8');
      ctx.originalAgent = ctx.agent;

      // Main improvement loop
      while (ctx.round <= this.options.maxRounds) {
        this.emit('round:start', ctx);
        this.log(`\n=== ${ctx.agentName} - Round ${ctx.round}/${this.options.maxRounds} ===`);

        // Stage 1: INSPECTOR (Agent-Critic)
        this.log('Stage 1: Inspector analyzing...');
        const critique = await this.runStage(STAGES.INSPECTOR, ctx, {
          target: ctx.agent,
          round: ctx.round,
          history: ctx.critiques
        });
        ctx.critiques.push(critique);
        ctx.scoreHistory.push({
          round: ctx.round,
          scores: critique.scores,
          issues: critique.issues.length,
          verdict: critique.verdict
        });

        this.emit('stage:complete', { stage: STAGES.INSPECTOR, ctx, result: critique });
        this.log(`Score: ${critique.scores.overall}/10`);
        this.printScores(critique.scores);

        // Early exit on perfect score
        if (critique.scores.overall === PERFECT_SCORE) {
          this.log(`\nACCEPTED at round ${ctx.round} with perfect score!`);
          ctx.status = 'perfect';
          break;
        }

        if (this.options.dryRun) {
          this.log('\n[DRY RUN] Would apply fixes:');
          critique.issues.forEach(issue => {
            this.log(`  - ${issue.dimension}: ${issue.problem.substring(0, 60)}...`);
          });
          ctx.round++;
          continue;
        }

        // Stage 2: WRITER (Agent-Writer applies fixes)
        this.log('\nStage 2: Writer applying fixes...');
        const writerResult = await this.runStage(STAGES.WRITER, ctx, {
          original: ctx.agent,
          critique: critique
        });
        ctx.agent = writerResult.improved;
        this.emit('stage:complete', { stage: STAGES.WRITER, ctx, result: writerResult });

        // Stage 3: RUNNER (Agent-Tester validates)
        this.log('Stage 3: Runner validating...');
        const testResult = await this.runStage(STAGES.RUNNER, ctx, {
          agent: ctx.agent,
          agentPath: agentPath
        });
        ctx.testResults.push(testResult);
        this.emit('stage:complete', { stage: STAGES.RUNNER, ctx, result: testResult });

        if (!testResult.pass) {
          this.log(`Tests failed (${testResult.failures.length} failures), adjusting...`);
          const fixResult = await this.runStage(STAGES.WRITER, ctx, {
            original: ctx.agent,
            failures: testResult.failures
          });
          ctx.agent = fixResult.improved;
        }

        // Stage 4: REVIEWER (Agent-QA checks for regressions)
        this.log('Stage 4: Reviewer checking for regressions...');
        const qaReport = await this.runStage(STAGES.REVIEWER, ctx, {
          agent: ctx.agent,
          previousVersion: ctx.originalAgent,
          scoreHistory: ctx.scoreHistory,
          testResults: testResult
        });
        ctx.qaReports.push(qaReport);
        this.emit('stage:complete', { stage: STAGES.REVIEWER, ctx, result: qaReport });

        if (qaReport.verdict === 'REVERT') {
          this.log('Regressions detected, reverting...');
          ctx.agent = ctx.originalAgent;
        } else if (qaReport.verdict === 'ESCALATE') {
          this.log('QA escalated - needs human review');
          ctx.status = 'escalated';
          break;
        }

        // Save progress
        if (!this.options.dryRun) {
          await safeFs.promises.writeFile(agentPath, ctx.agent);
        }

        ctx.round++;
      }

      // Final determination
      const finalScore = ctx.scoreHistory.length > 0
        ? ctx.scoreHistory[ctx.scoreHistory.length - 1].scores.overall
        : 0;

      if (ctx.status === 'running') {
        if (finalScore >= ACCEPTANCE_THRESHOLD) {
          ctx.status = 'accepted_with_notes';
        } else {
          ctx.status = 'needs_attention';
        }
      }

      // Stage 5: PUBLISHER (if accepted)
      if (ctx.status === 'perfect' || ctx.status === 'accepted_with_notes') {
        this.log('\nStage 5: Publisher committing...');
        const publishResult = await this.runStage(STAGES.PUBLISHER, ctx, {
          agentPath: agentPath,
          agentContent: ctx.agent,
          score: finalScore,
          rounds: ctx.round,
          status: ctx.status,
          qaReport: ctx.qaReports[ctx.qaReports.length - 1]
        });
        this.emit('stage:complete', { stage: STAGES.PUBLISHER, ctx, result: publishResult });
      }

      const result = {
        accepted: ctx.status === 'perfect' || ctx.status === 'accepted_with_notes',
        score: finalScore,
        rounds: ctx.round,
        status: ctx.status,
        history: ctx.scoreHistory
      };

      this.results.set(agentPath, result);
      this.emit('pipeline:complete', ctx, result);
      return result;

    } catch (error) {
      ctx.status = 'failed';
      ctx.error = error.message;
      this.emit('pipeline:error', ctx, error);
      throw error;

    } finally {
      this.activePipelines.delete(agentPath);
    }
  }

  /**
   * Run a single pipeline stage
   *
   * @param {string} stage - Stage name
   * @param {PipelineContext} ctx - Pipeline context
   * @param {Object} input - Stage input
   * @returns {Promise<Object>} Stage result
   */
  async runStage(stage, ctx, input) {
    this.emit('stage:start', { stage, ctx, input });

    // In a real implementation, this would invoke the actual agent
    // For now, return mock results based on stage
    switch (stage) {
      case STAGES.INSPECTOR:
        return this.mockInspector(input);
      case STAGES.WRITER:
        return this.mockWriter(input);
      case STAGES.RUNNER:
        return this.mockRunner(input);
      case STAGES.REVIEWER:
        return this.mockReviewer(input);
      case STAGES.PUBLISHER:
        return this.mockPublisher(input);
      default:
        throw new Error(`Unknown stage: ${stage}`);
    }
  }

  /**
   * Mock implementations for stages
   * These will be replaced with actual agent invocations
   */

  mockInspector(input) {
    const baseScore = 7 + Math.random() * 2;
    return {
      agent: 'test-agent',
      round: input.round,
      scores: {
        specificity: Math.min(10, baseScore + Math.random()),
        completeness: Math.min(10, baseScore + Math.random()),
        boundaries: Math.min(10, baseScore + Math.random()),
        actionability: Math.min(10, baseScore + Math.random()),
        integration: Math.min(10, baseScore + Math.random()),
        overall: Math.min(10, baseScore)
      },
      issues: [],
      strengths: [],
      verdict: baseScore >= 10 ? 'ACCEPT' : 'REFINE'
    };
  }

  mockWriter(input) {
    return {
      improved: input.original || input.agent,
      changes: [],
      validation: {
        structureValid: true,
        sectionsPresent: [],
        issues: []
      }
    };
  }

  mockRunner(input) {
    return {
      pass: true,
      total: 10,
      passed: 10,
      failed: 0,
      failures: []
    };
  }

  mockReviewer(input) {
    return {
      verdict: 'PROCEED',
      structureValid: true,
      schemaCompliant: true,
      regressions: [],
      improvements: [],
      recommendation: 'PROCEED'
    };
  }

  mockPublisher(input) {
    return {
      status: 'committed',
      agentPath: input.agentPath,
      agentName: path.basename(input.agentPath, '.md'),
      commit: {
        hash: 'mock-' + Date.now(),
        message: `agent: update to score ${input.score}`
      },
      updates: {
        grades: true,
        capabilityIndex: true,
        auditLog: true
      }
    };
  }

  /**
   * Run pipeline for multiple agents with concurrency control
   *
   * @param {Array<string>} agentPaths - Paths to agents
   * @returns {Promise<Map>} Results map
   */
  async runBatch(agentPaths) {
    const results = new Map();
    const chunks = this.chunkArray(agentPaths, this.options.parallelLimit);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (agentPath) => {
          try {
            return await this.runPipeline(agentPath);
          } catch (error) {
            return { error: error.message, agentPath };
          }
        })
      );

      chunk.forEach((path, i) => {
        results.set(path, chunkResults[i]);
      });
    }

    return results;
  }

  /**
   * Queue an agent for processing
   *
   * @param {string} agentPath - Path to agent
   */
  queueAgent(agentPath) {
    if (!this.queue.includes(agentPath)) {
      this.queue.push(agentPath);
      this.emit('queue:add', agentPath);
    }
  }

  /**
   * Process the queue
   *
   * @returns {Promise<Map>} Results
   */
  async processQueue() {
    const results = new Map();

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.options.parallelLimit);
      const batchResults = await this.runBatch(batch);
      batchResults.forEach((result, path) => {
        results.set(path, result);
      });
    }

    return results;
  }

  /**
   * Get current pipeline status
   *
   * @returns {Object} Status summary
   */
  getStatus() {
    return {
      active: Array.from(this.activePipelines.values()).map(ctx => ctx.toJSON()),
      queued: [...this.queue],
      completed: this.results.size,
      results: Object.fromEntries(this.results)
    };
  }

  /**
   * Helper to chunk array for parallel processing
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Print score breakdown
   */
  printScores(scores) {
    if (!this.options.verbose) return;
    console.log('  Breakdown:');
    console.log(`    Specificity:   ${scores.specificity.toFixed(1)}/10`);
    console.log(`    Completeness:  ${scores.completeness.toFixed(1)}/10`);
    console.log(`    Boundaries:    ${scores.boundaries.toFixed(1)}/10`);
    console.log(`    Actionability: ${scores.actionability.toFixed(1)}/10`);
    console.log(`    Integration:   ${scores.integration.toFixed(1)}/10`);
  }

  /**
   * Log message if verbose
   */
  log(message) {
    if (this.options.verbose) {
      console.log(message);
    }
    this.emit('log', message);
  }
}

/**
 * Create and configure a pipeline orchestrator
 *
 * @param {Object} options - Configuration options
 * @returns {PipelineOrchestrator} Configured orchestrator
 */
function createOrchestrator(options = {}) {
  return new PipelineOrchestrator(options);
}

/**
 * Run a single agent through the pipeline
 *
 * @param {string} agentPath - Path to agent
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result
 */
async function runSingleAgent(agentPath, options = {}) {
  const orchestrator = createOrchestrator(options);
  return orchestrator.runPipeline(agentPath);
}

/**
 * Run multiple agents through the pipeline
 *
 * @param {Array<string>} agentPaths - Paths to agents
 * @param {Object} options - Options
 * @returns {Promise<Map>} Results
 */
async function runMultipleAgents(agentPaths, options = {}) {
  const orchestrator = createOrchestrator(options);
  return orchestrator.runBatch(agentPaths);
}

module.exports = {
  PipelineOrchestrator,
  PipelineContext,
  STAGES,
  createOrchestrator,
  runSingleAgent,
  runMultipleAgents,
  MAX_ROUNDS,
  PERFECT_SCORE,
  ACCEPTANCE_THRESHOLD
};
