/**
 * PI2 — First-run model selection + persistence (calibration).
 *
 * `runCalibration(deps?)` probes locally-available Ollama models, micro-benchmarks
 * each present candidate (p95 latency via an INJECTABLE clock so CI is
 * deterministic), excludes any candidate whose p95 >= the 5-second budget, and
 * pins the LARGEST surviving model (candidate order = size order). It derives the
 * pinned model's dimension from a real encode and persists
 * `{ model, dimension, backend, measuredP95ms }` to `.ctoc/index/calibration.json`.
 *
 * Idempotent: if the file already exists and `force` is not set, it returns the
 * persisted result WITHOUT benchmarking (EM-04). If Ollama is unreachable it pins
 * the deterministic in-process backend (`all-MiniLM-L6-v2`, DIMENSION 384).
 *
 * PI2 does NOT self-invoke — PI0's composition root runs this in the background
 * (menu never blocked). `loadCalibration(deps?)` is fail-open: `null` when the
 * file is absent or unparseable.
 *
 * All fs routes through `safe-fs.js`; all paths via `path.join` (cross-platform,
 * EM-11). No hardcoded `/` separators or `~` expansion.
 */

'use strict';

const path = require('path');
const safeFs = require('../safe-fs');
const { createOllamaClient } = require('./ollama-client');
const inprocess = require('./inprocess-engine');
const { probeOllama } = require('./hardware-probe');

// Ollama candidate models, ordered LARGEST → SMALLEST (candidate order = size).
const CANDIDATES = ['mxbai-embed-large', 'nomic-embed-text', 'all-minilm'];
// Hard latency ceiling: any candidate with p95 >= this is excluded (per plan).
const BUDGET_MS = 5000;
// Selection target — informational headroom marker (documented; not a gate).
const TARGET_MS = 3000;
// The deterministic in-process fallback identity.
const INPROCESS_MODEL = 'all-MiniLM-L6-v2';
// Number of encodes per candidate when a real (non-injected) clock is used.
const BENCH_SAMPLES = 5;
// Micro-benchmark probe texts (short; keeps a real benchmark cheap).
const BENCH_TEXTS = ['calibration probe text one', 'calibration probe text two'];

/**
 * Resolve the calibration.json path under a project root (cross-platform).
 * @param {string} projectPath
 * @returns {string}
 */
function calibrationFilePath(projectPath) {
  return path.join(projectPath, '.ctoc', 'index', 'calibration.json');
}

/**
 * Compute the p95 of a numeric latency sample array.
 * @param {number[]} samples
 * @returns {number}
 */
function p95(samples) {
  if (!samples.length) return 0;
  const sorted = samples.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/**
 * Measure a candidate's p95 encode latency.
 *
 * If `clock.p95For(model)` is provided (tests), it is authoritative — a fully
 * deterministic latency source. Otherwise a real micro-benchmark times
 * `BENCH_SAMPLES` real encodes through the Ollama client.
 *
 * @param {string} model
 * @param {object} client - Ollama client
 * @param {object} [clock] - injectable clock; `{ p95For(model): number }` or `{ now(): number }`
 * @returns {Promise<number>} measured p95 in ms
 */
async function measureP95(model, client, clock) {
  if (clock && typeof clock.p95For === 'function') {
    return clock.p95For(model);
  }
  const now = clock && typeof clock.now === 'function' ? clock.now.bind(clock) : () => Date.now();
  const samples = [];
  for (let i = 0; i < BENCH_SAMPLES; i++) {
    const t0 = now();
    await client.embed(model, BENCH_TEXTS);
    samples.push(now() - t0);
  }
  return p95(samples);
}

/**
 * Load a persisted calibration result. Fail-open: returns `null` when the file is
 * absent or unparseable (EM-04b).
 *
 * @param {{ projectPath?: string }} [deps]
 * @returns {{ model: string, dimension: number, backend: string, measuredP95ms: number } | null}
 */
function loadCalibration(deps = {}) {
  const projectPath = deps.projectPath || process.cwd();
  const file = calibrationFilePath(projectPath);
  try {
    if (!safeFs.existsSync(file)) return null;
    const parsed = JSON.parse(safeFs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && typeof parsed.model === 'string') return parsed;
    return null;
  } catch {
    return null; // fail-open
  }
}

/**
 * Persist a calibration result to `.ctoc/index/calibration.json` via safe-fs.
 * @param {string} projectPath
 * @param {object} result
 */
function persist(projectPath, result) {
  const file = calibrationFilePath(projectPath);
  const dir = path.dirname(file);
  if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
  safeFs.writeFileSync(file, JSON.stringify(result, null, 2));
}

/**
 * Run first-run calibration. Idempotent unless `force`.
 *
 * @param {{
 *   clock?: object,
 *   ollamaClient?: object,
 *   probe?: Function,
 *   projectPath?: string,
 *   force?: boolean,
 *   log?: Function
 * }} [deps]
 * @returns {Promise<{ model: string, pinned?: string, dimension: number, backend: string, measuredP95ms: number }>}
 */
async function runCalibration(deps = {}) {
  const projectPath = deps.projectPath || process.cwd();
  const log = typeof deps.log === 'function' ? deps.log : () => {};

  // Idempotent no-op: an existing calibration is returned untouched (EM-04).
  if (!deps.force) {
    const existing = loadCalibration({ projectPath });
    if (existing) return existing;
  }

  const client = deps.ollamaClient || createOllamaClient({});
  const probe = typeof deps.probe === 'function' ? deps.probe : probeOllama;

  // Fallback identity for the in-process backend.
  const inprocessResult = {
    model: INPROCESS_MODEL,
    pinned: INPROCESS_MODEL,
    dimension: inprocess.DIMENSION,
    backend: 'in-process',
    measuredP95ms: 0
  };

  let reachable = false;
  try {
    reachable = await probe({ projectPath });
  } catch {
    reachable = false; // fail-open
  }
  if (!reachable) {
    persist(projectPath, inprocessResult);
    return inprocessResult;
  }

  // Availability filter: only benchmark models present in /api/tags (EM-09).
  let available = [];
  try {
    available = await client.listModels();
  } catch {
    available = [];
  }
  const availableSet = new Set(available);

  const present = [];
  for (const model of CANDIDATES) {
    if (availableSet.has(model)) {
      present.push(model);
    } else {
      log(`${model}: not available locally — skipping`);
    }
  }

  if (present.length === 0) {
    // Ollama reachable but no known candidate installed → in-process fallback.
    log('no candidate models available locally — using in-process fallback');
    persist(projectPath, inprocessResult);
    return inprocessResult;
  }

  // Benchmark each present candidate; exclude any p95 >= budget (EM-03).
  const measured = [];
  for (const model of present) {
    const rawP95 = await measureP95(model, client, deps.clock);
    // A non-finite measurement (e.g. a malformed injected clock) is treated as
    // over-budget so it can never be pinned or persisted as `undefined` (F1).
    const p95ms = Number.isFinite(rawP95) ? rawP95 : Infinity;
    measured.push({ model, p95ms });
    if (p95ms >= BUDGET_MS) {
      log(`${model}: p95 ${p95ms}ms >= budget ${BUDGET_MS}ms — excluded`);
    } else if (p95ms > TARGET_MS) {
      log(`${model}: p95 ${p95ms}ms within budget but above ${TARGET_MS}ms target (reduced headroom)`);
    }
  }

  const withinBudget = measured.filter((m) => m.p95ms < BUDGET_MS);

  let winner;
  if (withinBudget.length > 0) {
    // CANDIDATES is largest→smallest; present preserves that order, so the FIRST
    // within-budget entry (by candidate order) is the largest surviving model.
    winner = withinBudget[0];
  } else {
    // None met budget → pin the smallest present candidate with a warning.
    winner = measured[measured.length - 1];
    log(`no candidate met the ${BUDGET_MS}ms budget — pinning smallest candidate ${winner.model} with reduced quality`);
  }

  // Derive the pinned model's dimension from a real encode.
  let dimension = inprocess.DIMENSION;
  try {
    const vecs = await client.embed(winner.model, ['dimension probe']);
    if (Array.isArray(vecs) && vecs[0] && typeof vecs[0].length === 'number' && vecs[0].length > 0) {
      dimension = vecs[0].length;
    }
  } catch {
    // Keep the fallback dimension; embed will re-probe at runtime.
  }

  const result = {
    model: winner.model,
    pinned: winner.model,
    dimension,
    backend: 'ollama',
    // Persist an explicit number|null — never a silently-dropped `undefined` key (F1).
    measuredP95ms: Number.isFinite(winner.p95ms) ? winner.p95ms : null
  };
  persist(projectPath, result);
  return result;
}

module.exports = {
  runCalibration,
  loadCalibration,
  calibrationFilePath,
  p95,
  CANDIDATES,
  BUDGET_MS,
  TARGET_MS,
  INPROCESS_MODEL
};
