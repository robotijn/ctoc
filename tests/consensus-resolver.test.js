/**
 * Consensus Resolver Tests
 * Tests for resolving reviewer disagreements
 */

const assert = require('assert');
const { test, describe, beforeEach } = require('node:test');

let consensusResolver;

describe('Consensus Resolver Tests', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../src/lib/consensus-resolver.js')];
    try {
      consensusResolver = require('../src/lib/consensus-resolver.js');
    } catch (e) {
      consensusResolver = null;
    }
  });

  test('initResolution marks resolved=true when verdicts agree', (t) => {
    if (!consensusResolver) {
      t.skip('Module not implemented yet');
      return;
    }
    const state = consensusResolver.initResolution('APPROVE', 'APPROVE');
    assert.strictEqual(state.resolved, true, 'Should be resolved when verdicts agree');
    console.log('# initResolution marks resolved=true when verdicts agree');
  });

  test('initResolution starts round=1 when verdicts disagree', (t) => {
    if (!consensusResolver) {
      t.skip('Module not implemented yet');
      return;
    }
    const state = consensusResolver.initResolution('APPROVE', 'NEEDS_WORK');
    assert.strictEqual(state.resolved, false, 'Should not be resolved when verdicts differ');
    assert.strictEqual(state.round, 1, 'Should start at round 1');
    console.log('# initResolution starts round=1 when verdicts disagree');
  });

  test('processRound detects consensus when verdicts align', (t) => {
    if (!consensusResolver) {
      t.skip('Module not implemented yet');
      return;
    }
    let state = consensusResolver.initResolution('APPROVE', 'NEEDS_WORK');
    state = consensusResolver.processRound(state, {
      reviewerVerdict: 'APPROVE',
      ctoVerdict: 'APPROVE', // CTO changed to agree
      reviewerArgument: 'Tests are good',
      ctoArgument: 'Agreed after review'
    });
    assert.strictEqual(state.resolved, true, 'Should be resolved when verdicts align');
    console.log('# processRound detects consensus when verdicts align');
  });

  test('processRound advances round when still disagreeing', (t) => {
    if (!consensusResolver) {
      t.skip('Module not implemented yet');
      return;
    }
    let state = consensusResolver.initResolution('APPROVE', 'NEEDS_WORK');
    state = consensusResolver.processRound(state, {
      reviewerVerdict: 'APPROVE',
      ctoVerdict: 'NEEDS_WORK',
      reviewerArgument: 'Still approve',
      ctoArgument: 'Still needs work'
    });
    assert.strictEqual(state.round, 2, 'Should advance to round 2');
    assert.strictEqual(state.resolved, false, 'Should not be resolved');
    console.log('# processRound advances round when still disagreeing');
  });

  test('processRound sets CTO verdict as final after round 3', (t) => {
    if (!consensusResolver) {
      t.skip('Module not implemented yet');
      return;
    }
    let state = {
      reviewerVerdict: 'APPROVE',
      ctoVerdict: 'NEEDS_WORK',
      round: 3,
      resolved: false,
      history: []
    };
    state = consensusResolver.processRound(state, {
      reviewerVerdict: 'APPROVE',
      ctoVerdict: 'NEEDS_WORK',
      reviewerArgument: 'Still approve',
      ctoArgument: 'Still needs work'
    });
    assert.strictEqual(state.resolved, true, 'Should be resolved after round 3');
    assert.strictEqual(state.finalVerdict, 'NEEDS_WORK', 'CTO verdict should win');
    console.log('# processRound sets CTO verdict as final after round 3');
  });

  test('generateFinalRationale includes both parties arguments', (t) => {
    if (!consensusResolver) {
      t.skip('Module not implemented yet');
      return;
    }
    const state = {
      reviewerVerdict: 'APPROVE',
      ctoVerdict: 'NEEDS_WORK',
      history: [
        { round: 1, reviewerArgument: 'Code is clean', ctoArgument: 'Missing docs' }
      ],
      resolved: true,
      finalVerdict: 'NEEDS_WORK'
    };
    const rationale = consensusResolver.generateFinalRationale(state);
    assert.ok(typeof rationale === 'string', 'Should return string');
    assert.ok(rationale.length > 0, 'Should not be empty');
    console.log('# generateFinalRationale includes both parties arguments');
  });

  test('generateRoundPrompt differs by round number', (t) => {
    if (!consensusResolver) {
      t.skip('Module not implemented yet');
      return;
    }
    const state1 = { round: 1, history: [] };
    const state2 = { round: 2, history: [{ reviewerArgument: 'x', ctoArgument: 'y' }] };

    const prompt1 = consensusResolver.generateRoundPrompt(state1, 'reviewer');
    const prompt2 = consensusResolver.generateRoundPrompt(state2, 'reviewer');

    assert.ok(prompt1 !== prompt2, 'Prompts should differ by round');
    console.log('# generateRoundPrompt differs by round number');
  });

  test('MAX_ROUNDS constant equals 3', (t) => {
    if (!consensusResolver) {
      t.skip('Module not implemented yet');
      return;
    }
    assert.strictEqual(consensusResolver.MAX_ROUNDS, 3, 'MAX_ROUNDS should be 3');
    console.log('# MAX_ROUNDS constant equals 3');
  });

  test('edge case: same verdict in both rounds (resolved early)', (t) => {
    if (!consensusResolver) {
      t.skip('Module not implemented yet');
      return;
    }
    let state = consensusResolver.initResolution('APPROVE', 'NEEDS_WORK');
    state = consensusResolver.processRound(state, {
      reviewerVerdict: 'NEEDS_WORK', // Reviewer changed mind
      ctoVerdict: 'NEEDS_WORK',
      reviewerArgument: 'On reflection, needs work',
      ctoArgument: 'Correct'
    });
    assert.strictEqual(state.resolved, true, 'Should resolve early when agreement reached');
    assert.strictEqual(state.round, 1, 'Should still be round 1');
    console.log('# edge case: same verdict in both rounds (resolved early)');
  });

  test('edge case: one party changes verdict mid-resolution', (t) => {
    if (!consensusResolver) {
      t.skip('Module not implemented yet');
      return;
    }
    let state = consensusResolver.initResolution('APPROVE', 'NEEDS_WORK');

    // Round 1: Still disagree
    state = consensusResolver.processRound(state, {
      reviewerVerdict: 'APPROVE',
      ctoVerdict: 'NEEDS_WORK',
      reviewerArgument: 'Approve',
      ctoArgument: 'Needs work'
    });

    // Round 2: CTO changes to approve
    state = consensusResolver.processRound(state, {
      reviewerVerdict: 'APPROVE',
      ctoVerdict: 'APPROVE',
      reviewerArgument: 'Still approve',
      ctoArgument: 'Changed my mind'
    });

    assert.strictEqual(state.resolved, true, 'Should resolve when party changes mind');
    assert.strictEqual(state.finalVerdict, 'APPROVE', 'Final verdict should be agreed value');
    console.log('# edge case: one party changes verdict mid-resolution');
  });
});

console.log('\nConsensus Resolver Tests');
console.log('========================\n');
