/**
 * PI2 — The unified `embed()` façade: probe + preference dispatch + fallback.
 *
 * `embed(texts, deps?)` turns plan text into strong dense L2-normalized
 * `Float32Array` vectors, selecting a backend by the `plan_index.engine_preference`
 * setting and a reachability probe:
 *   • `'in-process'` → the deterministic in-process engine; the Ollama client's
 *     `embed` is NEVER called (EM-10).
 *   • `'ollama'`     → force the Ollama client; on ANY error → in-process fallback.
 *   • `'auto'` (default) → probe Ollama; if reachable use it (catch → fallback),
 *     else in-process.
 *
 * FAIL-OPEN CONTRACT: `embed()` resolves to `{ vectors, source }` in ALL paths —
 * it NEVER rejects to the caller when Ollama is absent or broken (EM-02). Both
 * backends are L2-normalized here (Ollama vectors are re-normalized) so the
 * output is uniformly cosine-ready.
 *
 * Return shape (DA-3): `{ vectors: Float32Array[], source: 'ollama'|'in-process' }`
 * — the source tag is inspectable without polluting the `Float32Array[]`.
 *
 * Storage-agnostic: PI2 NEVER touches the PI1 store. It hands vectors to PI0/PI3,
 * which call `upsertUnit`. No paths of its own; cross-platform for free.
 *
 * All Ollama HTTP is injectable (`deps.ollamaClient` / `deps.probe`) so tests are
 * hermetic — no live network.
 */

'use strict';

const { createOllamaClient } = require('./ollama-client');
const inprocess = require('./inprocess-engine');
const { probeOllama } = require('./hardware-probe');
const { loadCalibration } = require('./calibration');
const settings = require('../settings');

// The default model used when no calibration has pinned one yet.
const DEFAULT_OLLAMA_MODEL = 'nomic-embed-text';

/**
 * L2-normalize a Float32Array in place and return it. Non-finite-safe: a zero or
 * degenerate vector is returned unchanged (all-zero), never NaN-poisoned.
 * @param {Float32Array} vec
 * @returns {Float32Array}
 */
function l2normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0 && Number.isFinite(norm)) {
    for (let i = 0; i < vec.length; i++) vec[i] = vec[i] / norm;
  }
  return vec;
}

/**
 * Produce an in-process result batch (the fail-open fallback).
 * @param {string[]} texts
 * @returns {Promise<{ vectors: Float32Array[], source: 'in-process' }>}
 */
async function inProcessResult(texts) {
  const vectors = await inprocess.embedInProcess(texts);
  return { vectors, source: 'in-process' };
}

/**
 * Embed a batch of texts. See module header for the dispatch + fail-open contract.
 *
 * @param {string[]} texts
 * @param {{
 *   ollamaClient?: { embed: Function, listModels?: Function },
 *   probe?: Function,
 *   getSetting?: Function,
 *   loadCalibration?: Function,
 *   projectPath?: string,
 *   warn?: Function
 * }} [deps]
 * @returns {Promise<{ vectors: Float32Array[], source: 'ollama'|'in-process' }>}
 */
async function embed(texts, deps = {}) {
  const list = Array.isArray(texts) ? texts : [texts];
  const warn = typeof deps.warn === 'function' ? deps.warn : () => {};
  const getSetting = typeof deps.getSetting === 'function' ? deps.getSetting : settings.getSetting;

  // Resolve engine preference (real signature + real enum token — DA-4).
  let preference;
  try {
    preference = getSetting('plan_index', 'engine_preference', deps.projectPath) ?? 'auto';
  } catch {
    preference = 'auto';
  }

  // Forced in-process: the Ollama client is NEVER consulted (EM-10).
  if (preference === 'in-process') {
    return inProcessResult(list);
  }

  // Decide whether to attempt Ollama.
  let attemptOllama = false;
  if (preference === 'ollama') {
    attemptOllama = true;
  } else {
    // 'auto' (or any unrecognized value): probe.
    const probe = typeof deps.probe === 'function' ? deps.probe : probeOllama;
    try {
      attemptOllama = await probe({ projectPath: deps.projectPath });
    } catch {
      attemptOllama = false; // fail-open
    }
  }

  if (!attemptOllama) {
    return inProcessResult(list);
  }

  // Attempt Ollama; ANY error → in-process fallback (fail-open, EM-02/EM-02b).
  try {
    const client = deps.ollamaClient || createOllamaClient({});
    const loadCal = typeof deps.loadCalibration === 'function' ? deps.loadCalibration : loadCalibration;
    let model = DEFAULT_OLLAMA_MODEL;
    try {
      const cal = loadCal({ projectPath: deps.projectPath });
      if (cal && typeof cal.model === 'string' && cal.model.length > 0 && cal.backend !== 'in-process') {
        model = cal.model;
      }
    } catch {
      // keep default model
    }

    const raw = await client.embed(model, list);
    if (!Array.isArray(raw) || raw.length !== list.length) {
      throw new Error(`embedder: Ollama returned ${Array.isArray(raw) ? raw.length : 'non-array'} vectors for ${list.length} inputs`);
    }
    // Re-L2-normalize so both backends are uniformly cosine-ready.
    const vectors = raw.map((v) => l2normalize(v instanceof Float32Array ? v : new Float32Array(v)));
    return { vectors, source: 'ollama' };
  } catch (err) {
    warn(`embedder: Ollama backend failed (${err && err.message}); falling back to in-process`);
    return inProcessResult(list);
  }
}

module.exports = { embed, l2normalize, DEFAULT_OLLAMA_MODEL };
