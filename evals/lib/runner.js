'use strict';

/**
 * Transport and result-parsing layer for the ask-me-questions evaluation.
 *
 * The evaluation runs the REAL model, but there is NO network interface key in
 * this harness. The transport is the `claude` binary in non-interactive print
 * mode: it runs under whatever authentication the user's Claude Code session
 * already holds. This module makes ZERO direct network connections — only the
 * `claude` binary does, on the user's own session.
 *
 * The split is deliberate: `parseResultJson` and `extractJsonBlock` are PURE
 * (no process, no clock, no filesystem, never throw), so the unit suite can
 * pin their behaviour exactly. `runClaude` and `detectClaudeBinary` own the
 * one impure act — spawning a child process — and accept an injectable
 * `spawnImpl` so the unit suite can drive them with a REAL stand-in executable
 * (a tiny node script), never a stub of this module's own logic.
 */

const { spawnSync } = require('node:child_process');
const { extractFencedBlocks } = require('./graders.js');

// Default hard ceiling on how long a single model call may take. Print mode
// with a large system prompt can take tens of seconds; two minutes is a
// generous, non-hanging bound.
const DEFAULT_TIMEOUT_MS = 180000;

// Generous stdout buffer — a rendered matrix plus a judgement is small, but a
// verbose model reply plus the JSON envelope should never truncate.
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * parseResultJson — pure parser for `claude --output-format json` stdout.
 *
 * `claude --output-format json` prints ONE JSON object on stdout whose fields
 * include `result` (the model text), `usage` (with `input_tokens` /
 * `output_tokens`), `total_cost_usd`, and `is_error`. Unknown extra fields are
 * ignored. Any parse failure yields empty shapes rather than throwing, so a
 * malformed transport never crashes a run — it becomes a graded/error outcome
 * upstream.
 *
 * @param {string} stdout
 * @returns {{ text: string, usageInputTokens: number, usageOutputTokens: number, costUsd: number, isError: boolean }}
 */
function parseResultJson(stdout) {
  const empty = {
    text: '',
    usageInputTokens: 0,
    usageOutputTokens: 0,
    costUsd: 0,
    isError: false
  };

  let obj;
  try {
    obj = JSON.parse(String(stdout));
  } catch (err) {
    return { ...empty };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ...empty };
  }

  const usage = obj.usage && typeof obj.usage === 'object' ? obj.usage : {};
  return {
    text: typeof obj.result === 'string' ? obj.result : '',
    usageInputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
    usageOutputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
    costUsd: typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : 0,
    isError: obj.is_error === true
  };
}

/**
 * extractJsonBlock — pure extractor for the last valid fenced JSON object.
 *
 * Headless print mode cannot force a custom tool call, so the evaluation
 * prompt instructs the model to end its reply with a fenced code block holding
 * the EXACT AskUserQuestion argument object it would pass. This function pulls
 * that object back out: it scans every fenced block (reusing the committed
 * `extractFencedBlocks`), from the last block backward, and returns the first
 * one that parses as a JSON object. The last valid fence wins, so a stray
 * earlier fence (for example the box-drawing matrix, which is not JSON) never
 * shadows the real argument. Returns null when no fenced block parses as an
 * object.
 *
 * @param {string} text
 * @returns {object|null}
 */
function extractJsonBlock(text) {
  const { blocks } = extractFencedBlocks(text);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const content = String(blocks[i].content).trim();
    if (content.length === 0) continue;
    let obj;
    try {
      obj = JSON.parse(content);
    } catch (err) {
      continue;
    }
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return obj;
    }
  }
  return null;
}

/**
 * Build the argv for a `claude` print-mode call. Kept separate so the argv is
 * a single, testable shape. `--model` is appended only when a model is given;
 * omitting it lets the user's configured Claude Code default apply.
 *
 * @param {string} prompt
 * @param {string|undefined} model
 * @returns {string[]}
 */
function buildClaudeArgs(prompt, model) {
  const args = ['-p', prompt, '--output-format', 'json'];
  if (model) {
    args.push('--model', model);
  }
  return args;
}

/**
 * runClaude — run one model call through the `claude` binary in print mode.
 *
 * Spawns `claude -p <prompt> --output-format json [--model <model>]` with
 * `shell: false` and an argv array (never a shell string), then parses the
 * single JSON result object. Throws only when the process cannot be spawned at
 * all (for example the binary is missing) — a model-side failure surfaces as
 * `isError: true` in the returned object, not an exception.
 *
 * @param {string} prompt
 * @param {{ model?: string, claudeBin?: string, spawnImpl?: Function, timeoutMs?: number }} [opts]
 * @returns {{ text: string, usageInputTokens: number, usageOutputTokens: number, costUsd: number, isError: boolean, exitStatus: number|null, stderr: string }}
 */
function runClaude(prompt, opts = {}) {
  const { model, claudeBin, spawnImpl, timeoutMs } = opts;
  const bin = claudeBin || 'claude';
  const spawn = spawnImpl || spawnSync;
  const args = buildClaudeArgs(prompt, model);

  const result = spawn(bin, args, {
    encoding: 'utf8',
    shell: false,
    timeout: typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER_BYTES
  });

  if (!result || result.error) {
    const detail = result && result.error ? result.error.message : 'no result from spawn';
    throw new Error(`Failed to run the claude binary "${bin}": ${detail}`);
  }

  const parsed = parseResultJson(result.stdout || '');
  return {
    ...parsed,
    exitStatus: typeof result.status === 'number' ? result.status : null,
    stderr: typeof result.stderr === 'string' ? result.stderr : ''
  };
}

/**
 * detectClaudeBinary — probe whether the `claude` binary is usable.
 *
 * Runs `claude --version`. A clean zero exit means available; any spawn error,
 * missing status, or non-zero exit means unavailable and drives the loud-skip
 * path in the command-line runner. Never throws.
 *
 * @param {{ claudeBin?: string, spawnImpl?: Function }} [opts]
 * @returns {{ available: boolean, version: string|null }}
 */
function detectClaudeBinary(opts = {}) {
  const { claudeBin, spawnImpl } = opts;
  const bin = claudeBin || 'claude';
  const spawn = spawnImpl || spawnSync;

  let result;
  try {
    result = spawn(bin, ['--version'], {
      encoding: 'utf8',
      shell: false,
      timeout: 15000,
      maxBuffer: MAX_BUFFER_BYTES
    });
  } catch (err) {
    return { available: false, version: null };
  }

  if (!result || result.error || result.status !== 0) {
    return { available: false, version: null };
  }

  const version = String(result.stdout || '').trim();
  return { available: true, version: version.length > 0 ? version : null };
}

module.exports = {
  runClaude,
  detectClaudeBinary,
  parseResultJson,
  extractJsonBlock,
  buildClaudeArgs
};
