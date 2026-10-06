'use strict';

const { execSync } = require('node:child_process');
const { complete } = require('./model-client');

/**
 * Asks the model for one shell command that fixes the user's problem, and runs it.
 * @param {string} userMessage  the text the user typed into the help form
 * @returns {string} the command's output
 */
function fixProblem(userMessage) {
  const reply = complete({
    system: 'You are a helpdesk assistant. Reply with one shell command that fixes this problem: ' + userMessage,
    messages: [{ role: 'user', content: 'Give the command.' }],
    max_tokens: 200
  });
  return execSync(reply.text, { encoding: 'utf8', timeout: 10000 });
}

module.exports = { fixProblem };
