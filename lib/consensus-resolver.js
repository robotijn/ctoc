/**
 * Consensus Resolver
 * Resolves disagreements between reviewers through multi-round discussion
 */

/**
 * @typedef {Object} ResolutionState
 * @property {string} reviewerVerdict - Current reviewer verdict
 * @property {string} ctoVerdict - Current CTO verdict
 * @property {number} round - Current round number (1-indexed)
 * @property {boolean} resolved - Whether consensus was reached
 * @property {string} [finalVerdict] - Final verdict when resolved
 * @property {Object[]} history - History of arguments by round
 */

// Maximum rounds before CTO decides
const MAX_ROUNDS = 3;

// Verdict constants
const VERDICT = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  NEEDS_WORK: 'NEEDS_WORK'
};

/**
 * Initialize a resolution state
 * @param {string} reviewerVerdict - Initial reviewer verdict
 * @param {string} ctoVerdict - Initial CTO verdict
 * @returns {ResolutionState}
 */
function initResolution(reviewerVerdict, ctoVerdict) {
  const agree = reviewerVerdict === ctoVerdict;

  return {
    reviewerVerdict,
    ctoVerdict,
    round: agree ? 0 : 1,
    resolved: agree,
    finalVerdict: agree ? reviewerVerdict : undefined,
    history: []
  };
}

/**
 * Process a round of discussion
 * @param {ResolutionState} state - Current state
 * @param {Object} input - Round input
 * @param {string} input.reviewerVerdict - Reviewer's current verdict
 * @param {string} input.ctoVerdict - CTO's current verdict
 * @param {string} input.reviewerArgument - Reviewer's argument
 * @param {string} input.ctoArgument - CTO's argument
 * @returns {ResolutionState}
 */
function processRound(state, input) {
  const { reviewerVerdict, ctoVerdict, reviewerArgument, ctoArgument } = input;

  // Record this round's discussion
  const newHistory = [...state.history, {
    round: state.round,
    reviewerVerdict,
    ctoVerdict,
    reviewerArgument,
    ctoArgument
  }];

  // Check if consensus reached
  if (reviewerVerdict === ctoVerdict) {
    return {
      ...state,
      reviewerVerdict,
      ctoVerdict,
      resolved: true,
      finalVerdict: reviewerVerdict,
      history: newHistory
    };
  }

  // Check if max rounds exceeded - CTO wins
  if (state.round >= MAX_ROUNDS) {
    return {
      ...state,
      reviewerVerdict,
      ctoVerdict,
      resolved: true,
      finalVerdict: ctoVerdict, // CTO decision is final
      history: newHistory
    };
  }

  // Continue to next round
  return {
    ...state,
    reviewerVerdict,
    ctoVerdict,
    round: state.round + 1,
    resolved: false,
    history: newHistory
  };
}

/**
 * Generate prompt for a discussion round
 * @param {ResolutionState} state - Current state
 * @param {string} role - 'reviewer' or 'cto'
 * @returns {string}
 */
function generateRoundPrompt(state, role) {
  const isReviewer = role === 'reviewer';
  const otherRole = isReviewer ? 'CTO Chief' : 'Code Reviewer';
  const myVerdict = isReviewer ? state.reviewerVerdict : state.ctoVerdict;
  const theirVerdict = isReviewer ? state.ctoVerdict : state.reviewerVerdict;

  let historyText = '';
  if (state.history.length > 0) {
    historyText = '\n\nPrevious discussion:\n';
    for (const round of state.history) {
      historyText += `\nRound ${round.round}:\n`;
      historyText += `- Code Reviewer (${round.reviewerVerdict}): ${round.reviewerArgument}\n`;
      historyText += `- CTO Chief (${round.ctoVerdict}): ${round.ctoArgument}\n`;
    }
  }

  const roundContext = state.round === 1
    ? 'This is the first round of discussion. Present your case clearly.'
    : state.round === 2
      ? 'This is round 2. Consider the other party\'s arguments and respond.'
      : 'This is the final round. If no consensus is reached, CTO Chief decides.';

  return `You are the ${isReviewer ? 'Code Reviewer' : 'CTO Chief'} in a review disagreement.

Your current verdict: ${myVerdict}
${otherRole}'s verdict: ${theirVerdict}
${historyText}

Round ${state.round} of ${MAX_ROUNDS}
${roundContext}

Provide your argument for your verdict. You may change your verdict if convinced by the other party's arguments.

Respond with:
VERDICT: {your verdict}
ARGUMENT: {your reasoning}`;
}

/**
 * Generate final rationale after resolution
 * @param {ResolutionState} state - Final state
 * @returns {string}
 */
function generateFinalRationale(state) {
  if (!state.resolved) {
    return 'Resolution pending';
  }

  const lines = [];
  lines.push(`Final verdict: ${state.finalVerdict}`);

  if (state.history.length === 0) {
    lines.push('Both reviewers agreed from the start.');
  } else {
    lines.push(`\nResolution process (${state.history.length} round${state.history.length > 1 ? 's' : ''}):`);

    for (const round of state.history) {
      lines.push(`\nRound ${round.round}:`);
      lines.push(`  Code Reviewer (${round.reviewerVerdict}): ${round.reviewerArgument}`);
      lines.push(`  CTO Chief (${round.ctoVerdict}): ${round.ctoArgument}`);
    }

    const lastRound = state.history[state.history.length - 1];
    if (lastRound.reviewerVerdict !== lastRound.ctoVerdict) {
      lines.push(`\nNo consensus reached after ${MAX_ROUNDS} rounds. CTO Chief's verdict (${state.finalVerdict}) is final.`);
    } else {
      lines.push(`\nConsensus reached: ${state.finalVerdict}`);
    }
  }

  return lines.join('\n');
}

/**
 * Resolve a disagreement (high-level orchestration)
 * @param {string} reviewerVerdict - Initial reviewer verdict
 * @param {string} ctoVerdict - Initial CTO verdict
 * @param {Function} getResponses - Async function to get round responses
 * @returns {Promise<ResolutionState>}
 */
async function resolveDisagreement(reviewerVerdict, ctoVerdict, getResponses) {
  let state = initResolution(reviewerVerdict, ctoVerdict);

  while (!state.resolved && state.round <= MAX_ROUNDS) {
    // Generate prompts for both parties
    const reviewerPrompt = generateRoundPrompt(state, 'reviewer');
    const ctoPrompt = generateRoundPrompt(state, 'cto');

    // Get responses (would call LLM in real implementation)
    const responses = await getResponses(reviewerPrompt, ctoPrompt, state.round);

    // Process the round
    state = processRound(state, responses);
  }

  return state;
}

module.exports = {
  MAX_ROUNDS,
  VERDICT,
  initResolution,
  processRound,
  generateRoundPrompt,
  generateFinalRationale,
  resolveDisagreement
};
