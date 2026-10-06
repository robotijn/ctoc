'use strict';

/**
 * Contract adapter of the harness probe (rollout slice 0, Step 9): a worked example of an agent
 * that writes files. The run is valid when the evaluation agent was loaded (its marker word opens
 * the reply); every file the run wrote in its scratch copy becomes a finding `wrote/<path>`.
 * @param {{ output: string, files: object }} run
 * @returns {{ valid: boolean, errors: string[], findings: object[], payload: object }}
 */
exports.check = (run) => {
  const valid = String(run.output).startsWith('PROBE-AGENT-LOADED');
  const findings = Object.entries(run.files).map(([f, text]) => ({ id: `wrote/${f}`, severity: 'normal', evidence: String(text) }));
  return { valid, errors: valid ? [] : ['the evaluation agent was not loaded'], findings, payload: { output: run.output } };
};
