/**
 * Pipeline Infrastructure Tests
 *
 * Tests for the agent improvement pipeline:
 * - Agent-Critic loop
 * - Pipeline orchestrator
 * - Grading system
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Modules under test
const {
  bootstrapAgentCritic,
  improveAgent,
  saveGrade,
  getGrades,
  PERFECT_SCORE,
  ACCEPTANCE_THRESHOLD,
  MAX_ROUNDS
} = require('../lib/agent-critic-loop');

const {
  PipelineOrchestrator,
  PipelineContext,
  STAGES,
  createOrchestrator,
  runSingleAgent
} = require('../lib/pipeline-orchestrator');

const {
  calculateOverallScore,
  validateDimensions,
  determineStatus,
  getScoreMeaning,
  loadGrades,
  updateGrade,
  getAgentsByStatus,
  analyzeProgression,
  generateSummary,
  STATUS,
  DIMENSION_WEIGHTS
} = require('../lib/grading-system');

// Test fixtures
const FIXTURE_DIR = path.join(os.tmpdir(), 'ctoc-pipeline-test');
const GRADES_FILE = path.join(FIXTURE_DIR, 'grades.yaml');

describe('Grading System', () => {
  describe('calculateOverallScore', () => {
    it('should calculate average of all dimensions', () => {
      const dimensions = {
        specificity: 8,
        completeness: 6,
        boundaries: 7,
        actionability: 9,
        integration: 5
      };
      const score = calculateOverallScore(dimensions);
      assert.strictEqual(score, 7); // (8+6+7+9+5)/5 = 7
    });

    it('should handle missing dimensions', () => {
      const dimensions = {
        specificity: 8,
        completeness: 6
      };
      const score = calculateOverallScore(dimensions);
      assert.strictEqual(score, 7); // (8+6)/2 = 7
    });

    it('should return 0 for empty dimensions', () => {
      const score = calculateOverallScore({});
      assert.strictEqual(score, 0);
    });

    it('should round to 1 decimal place', () => {
      const dimensions = {
        specificity: 7,
        completeness: 8,
        boundaries: 9,
        actionability: 7,
        integration: 8
      };
      const score = calculateOverallScore(dimensions);
      assert.strictEqual(score, 7.8); // (7+8+9+7+8)/5 = 7.8
    });
  });

  describe('validateDimensions', () => {
    it('should pass valid dimensions', () => {
      const dimensions = {
        specificity: 8,
        completeness: 6,
        boundaries: 7,
        actionability: 9,
        integration: 5
      };
      const result = validateDimensions(dimensions);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should fail on missing dimensions', () => {
      const dimensions = {
        specificity: 8,
        completeness: 6
      };
      const result = validateDimensions(dimensions);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('boundaries')));
    });

    it('should fail on out of range scores', () => {
      const dimensions = {
        specificity: 11,
        completeness: 6,
        boundaries: 7,
        actionability: 9,
        integration: 5
      };
      const result = validateDimensions(dimensions);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('out of range')));
    });

    it('should fail on negative scores', () => {
      const dimensions = {
        specificity: -1,
        completeness: 6,
        boundaries: 7,
        actionability: 9,
        integration: 5
      };
      const result = validateDimensions(dimensions);
      assert.strictEqual(result.valid, false);
    });

    it('should warn on partial perfect scores', () => {
      const dimensions = {
        specificity: 10,
        completeness: 10,
        boundaries: 7,
        actionability: 9,
        integration: 5
      };
      const result = validateDimensions(dimensions);
      assert.ok(result.warnings.length > 0);
    });
  });

  describe('determineStatus', () => {
    it('should return perfect for score 10', () => {
      assert.strictEqual(determineStatus(10), STATUS.PERFECT);
    });

    it('should return accepted for score >= 8', () => {
      assert.strictEqual(determineStatus(8), STATUS.ACCEPTED);
      assert.strictEqual(determineStatus(9), STATUS.ACCEPTED);
    });

    it('should return needs_attention for score < 8', () => {
      assert.strictEqual(determineStatus(7.9), STATUS.NEEDS_ATTENTION);
      assert.strictEqual(determineStatus(5), STATUS.NEEDS_ATTENTION);
    });
  });

  describe('getScoreMeaning', () => {
    it('should return correct meanings', () => {
      assert.ok(getScoreMeaning(10).includes('PERFECT'));
      assert.ok(getScoreMeaning(9).includes('Excellent'));
      assert.ok(getScoreMeaning(7).includes('Good'));
      assert.ok(getScoreMeaning(5).includes('Functional'));
      assert.ok(getScoreMeaning(3).includes('Major gaps'));
      assert.ok(getScoreMeaning(1).includes('broken'));
    });
  });
});

describe('Pipeline Orchestrator', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = createOrchestrator({ verbose: false, dryRun: true });
  });

  describe('PipelineContext', () => {
    it('should initialize with correct defaults', () => {
      const ctx = new PipelineContext('/path/to/agent.md');
      assert.strictEqual(ctx.agentPath, '/path/to/agent.md');
      assert.strictEqual(ctx.agentName, 'agent');
      assert.strictEqual(ctx.round, 1);
      assert.strictEqual(ctx.status, 'running');
      assert.deepStrictEqual(ctx.scoreHistory, []);
    });

    it('should serialize to JSON correctly', () => {
      const ctx = new PipelineContext('/path/to/agent.md');
      ctx.round = 5;
      ctx.status = 'completed';

      const json = ctx.toJSON();
      assert.strictEqual(json.agentPath, '/path/to/agent.md');
      assert.strictEqual(json.round, 5);
      assert.strictEqual(json.status, 'completed');
      assert.ok(json.duration >= 0);
    });
  });

  describe('createOrchestrator', () => {
    it('should create with default options', () => {
      const orch = createOrchestrator();
      assert.ok(orch instanceof PipelineOrchestrator);
    });

    it('should accept custom options', () => {
      const orch = createOrchestrator({
        maxRounds: 5,
        parallelLimit: 2,
        verbose: true
      });
      assert.strictEqual(orch.options.maxRounds, 5);
      assert.strictEqual(orch.options.parallelLimit, 2);
      assert.strictEqual(orch.options.verbose, true);
    });
  });

  describe('STAGES', () => {
    it('should define all pipeline stages', () => {
      assert.strictEqual(STAGES.INSPECTOR, 'inspector');
      assert.strictEqual(STAGES.WRITER, 'writer');
      assert.strictEqual(STAGES.RUNNER, 'runner');
      assert.strictEqual(STAGES.REVIEWER, 'reviewer');
      assert.strictEqual(STAGES.PUBLISHER, 'publisher');
    });
  });

  describe('getStatus', () => {
    it('should return status summary', () => {
      const status = orchestrator.getStatus();
      assert.ok(Array.isArray(status.active));
      assert.ok(Array.isArray(status.queued));
      assert.strictEqual(typeof status.completed, 'number');
    });
  });

  describe('queueAgent', () => {
    it('should add agent to queue', () => {
      orchestrator.queueAgent('/path/to/agent1.md');
      orchestrator.queueAgent('/path/to/agent2.md');

      const status = orchestrator.getStatus();
      assert.strictEqual(status.queued.length, 2);
    });

    it('should not duplicate agents in queue', () => {
      orchestrator.queueAgent('/path/to/agent.md');
      orchestrator.queueAgent('/path/to/agent.md');

      const status = orchestrator.getStatus();
      assert.strictEqual(status.queued.length, 1);
    });
  });
});

describe('Agent-Critic Loop', () => {
  describe('Constants', () => {
    it('should have correct thresholds', () => {
      assert.strictEqual(PERFECT_SCORE, 10);
      assert.strictEqual(ACCEPTANCE_THRESHOLD, 8);
      assert.strictEqual(MAX_ROUNDS, 10);
    });
  });
});

describe('Integration Tests', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctoc-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Grade Persistence', () => {
    it('should save and load grades correctly', async () => {
      const gradesFile = path.join(tempDir, 'grades.yaml');

      // Mock the GRADES_FILE path
      const originalEnv = process.env.HOME;
      process.env.HOME = tempDir;

      try {
        await fs.mkdir(path.join(tempDir, '.ctoc/agents'), { recursive: true });

        await updateGrade('test-agent', {
          score: 8.5,
          status: STATUS.ACCEPTED,
          rounds: 5,
          history: [
            { round: 1, overall: 5.0, issues: 10 },
            { round: 5, overall: 8.5, issues: 2 }
          ]
        });

        const grades = await loadGrades();
        assert.ok(grades['test-agent']);
        assert.strictEqual(grades['test-agent'].score, 8.5);
        assert.strictEqual(grades['test-agent'].status, STATUS.ACCEPTED);
      } finally {
        process.env.HOME = originalEnv;
      }
    });
  });

  describe('Score Analysis', () => {
    it('should analyze progression correctly', async () => {
      const originalEnv = process.env.HOME;
      process.env.HOME = tempDir;

      try {
        await fs.mkdir(path.join(tempDir, '.ctoc/agents'), { recursive: true });

        await updateGrade('improving-agent', {
          score: 8.0,
          history: [
            { round: 1, overall: 5.0, issues: 10 },
            { round: 2, overall: 6.0, issues: 8 },
            { round: 3, overall: 7.0, issues: 5 },
            { round: 4, overall: 8.0, issues: 2 }
          ]
        });

        const analysis = await analyzeProgression('improving-agent');
        assert.strictEqual(analysis.available, true);
        assert.strictEqual(analysis.roundsCompleted, 4);
        assert.strictEqual(analysis.startScore, 5.0);
        assert.strictEqual(analysis.currentScore, 8.0);
        assert.strictEqual(analysis.trend, 'improving');
      } finally {
        process.env.HOME = originalEnv;
      }
    });
  });

  describe('Summary Generation', () => {
    it('should generate correct summary', async () => {
      // Use a separate temp dir for this test to avoid interference
      const summaryTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctoc-summary-test-'));
      const originalEnv = process.env.HOME;
      process.env.HOME = summaryTempDir;

      try {
        await fs.mkdir(path.join(summaryTempDir, '.ctoc/agents'), { recursive: true });

        await updateGrade('perfect-agent', { score: 10, status: STATUS.PERFECT });
        await updateGrade('good-agent', { score: 8.5, status: STATUS.ACCEPTED });
        await updateGrade('weak-agent', { score: 5.0, status: STATUS.NEEDS_ATTENTION });

        const summary = await generateSummary();
        assert.strictEqual(summary.totalAgents, 3);
        assert.strictEqual(summary.byStatus[STATUS.PERFECT], 1);
        assert.strictEqual(summary.byStatus[STATUS.ACCEPTED], 1);
        assert.strictEqual(summary.byStatus[STATUS.NEEDS_ATTENTION], 1);
      } finally {
        process.env.HOME = originalEnv;
        await fs.rm(summaryTempDir, { recursive: true }).catch(() => {});
      }
    });
  });
});

describe('Pipeline Events', () => {
  it('should emit events during pipeline execution', async () => {
    const orchestrator = createOrchestrator({ dryRun: true, verbose: false });
    const events = [];

    orchestrator.on('pipeline:start', (ctx) => events.push('start'));
    orchestrator.on('round:start', (ctx) => events.push(`round:${ctx.round}`));
    orchestrator.on('stage:complete', ({ stage }) => events.push(`stage:${stage}`));
    orchestrator.on('log', () => {}); // Suppress logs

    // Create a temporary agent file
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctoc-event-test-'));
    const agentPath = path.join(tempDir, 'test-agent.md');
    await fs.writeFile(agentPath, '# Test Agent\n## Role\nTest');

    try {
      await orchestrator.runPipeline(agentPath);

      assert.ok(events.includes('start'));
      assert.ok(events.includes('round:1'));
      assert.ok(events.includes('stage:inspector'));
    } finally {
      await fs.rm(tempDir, { recursive: true });
    }
  });
});
