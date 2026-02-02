/**
 * Strategic Classifier
 * Classifies decisions as strategic (requiring deep exploration) or tactical (simple choice)
 */

// Keywords that indicate strategic decisions
const STRATEGIC_KEYWORDS = [
  'architecture', 'microservices', 'monolith', 'database',
  'postgresql', 'mongodb', 'mysql', 'redis', 'elasticsearch',
  'framework', 'react', 'vue', 'angular', 'nextjs', 'django', 'fastapi',
  'cloud', 'aws', 'azure', 'gcp', 'kubernetes', 'docker',
  'build', 'buy', 'make', 'vs', 'versus', 'compare', 'choose',
  'technology', 'stack', 'infrastructure', 'platform',
  'api', 'rest', 'graphql', 'grpc',
  'authentication', 'authorization', 'security',
  'scalability', 'performance', 'reliability',
  'long-term', 'strategic', 'significant', 'major'
];

// Keywords that indicate tactical/simple decisions
const TACTICAL_KEYWORDS = [
  'name', 'naming', 'rename', 'call',
  'variable', 'function', 'method', 'class',
  'format', 'style', 'indent', 'spacing',
  'color', 'font', 'size', 'position',
  'enable', 'disable', 'toggle', 'flag',
  'config', 'setting', 'option', 'preference',
  'file', 'folder', 'directory', 'path',
  'simple', 'quick', 'minor', 'trivial'
];

// Decision type constants
const DECISION_TYPE = {
  STRATEGIC: 'STRATEGIC',
  TACTICAL: 'TACTICAL',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Classify a question by keyword matching
 * @param {string} question - The question to classify
 * @returns {{type: string, confidence: number, matchedKeywords: string[]}}
 */
function classifyByKeywords(question) {
  if (!question || typeof question !== 'string') {
    return {
      type: DECISION_TYPE.UNKNOWN,
      confidence: 0,
      matchedKeywords: []
    };
  }

  const lowerQuestion = question.toLowerCase();

  // Find matching strategic keywords
  const strategicMatches = STRATEGIC_KEYWORDS.filter(kw =>
    lowerQuestion.includes(kw.toLowerCase())
  );

  // Find matching tactical keywords
  const tacticalMatches = TACTICAL_KEYWORDS.filter(kw =>
    lowerQuestion.includes(kw.toLowerCase())
  );

  // Calculate scores
  const strategicScore = strategicMatches.length;
  const tacticalScore = tacticalMatches.length;

  // Determine type based on scores
  if (strategicScore > tacticalScore) {
    return {
      type: DECISION_TYPE.STRATEGIC,
      confidence: Math.min(0.9, 0.5 + (strategicScore * 0.1)),
      matchedKeywords: strategicMatches
    };
  } else if (tacticalScore > strategicScore) {
    return {
      type: DECISION_TYPE.TACTICAL,
      confidence: Math.min(0.9, 0.5 + (tacticalScore * 0.1)),
      matchedKeywords: tacticalMatches
    };
  } else {
    return {
      type: DECISION_TYPE.UNKNOWN,
      confidence: 0.3,
      matchedKeywords: [...strategicMatches, ...tacticalMatches]
    };
  }
}

/**
 * Generate a prompt for LLM classification
 * @param {string} question - The question to classify
 * @returns {string} The classification prompt
 */
function generateClassificationPrompt(question) {
  return `You are classifying whether a decision requires deep strategic analysis or is a simple tactical choice.

Question to classify:
"${question}"

Strategic decisions include:
- Architecture choices (monolith vs microservices)
- Technology selections (which database, framework, cloud provider)
- Design patterns and approaches
- Build vs buy decisions
- Security and scalability strategies

Tactical decisions include:
- Naming conventions
- File organization
- Simple configuration options
- Minor formatting choices

Respond with exactly one word: STRATEGIC or TACTICAL`;
}

/**
 * Determine if a question is strategic (async, may use LLM)
 * @param {string} question - The question to classify
 * @param {Object} options - Options
 * @param {boolean} options.skipLLM - Skip LLM call, use only keywords
 * @returns {Promise<{isStrategic: boolean, confidence: number, reasoning: string}>}
 */
async function isStrategicDecision(question, options = {}) {
  // First, try keyword-based classification
  const keywordResult = classifyByKeywords(question);

  // If high confidence from keywords, use that
  if (keywordResult.confidence >= 0.7) {
    return {
      isStrategic: keywordResult.type === DECISION_TYPE.STRATEGIC,
      confidence: keywordResult.confidence,
      reasoning: `Keyword match: ${keywordResult.matchedKeywords.join(', ')}`
    };
  }

  // If skipLLM or unknown, default to strategic (safety default)
  if (options.skipLLM || keywordResult.type === DECISION_TYPE.UNKNOWN) {
    return {
      isStrategic: true, // Default to strategic for safety
      confidence: 0.5,
      reasoning: 'Defaulting to strategic for thorough analysis'
    };
  }

  // In real implementation, would call LLM here
  // For now, return keyword-based result or strategic default
  return {
    isStrategic: keywordResult.type !== DECISION_TYPE.TACTICAL,
    confidence: keywordResult.confidence,
    reasoning: keywordResult.type === DECISION_TYPE.UNKNOWN
      ? 'Ambiguous - treating as strategic'
      : `Keyword classification: ${keywordResult.type}`
  };
}

module.exports = {
  STRATEGIC_KEYWORDS,
  TACTICAL_KEYWORDS,
  DECISION_TYPE,
  classifyByKeywords,
  generateClassificationPrompt,
  isStrategicDecision
};
