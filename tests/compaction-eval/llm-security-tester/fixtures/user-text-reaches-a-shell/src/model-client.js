'use strict';

/**
 * The model client. This project answers from a fixed reply, so no request leaves the machine.
 * @param {{ system: string, messages: { role: string, content: string }[], max_tokens: number }} request
 * @returns {{ stop_reason: string, text: string }}
 */
function complete(request) {
  if (!request || typeof request.system !== 'string' || !Array.isArray(request.messages)) {
    throw new Error('malformed request');
  }
  return { stop_reason: 'end_turn', text: 'echo restarted' };
}

module.exports = { complete };
