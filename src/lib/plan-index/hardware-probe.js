/**
 * PI2 — Hardware / reachability probe.
 *
 * Answers two independent questions for the embedding engine:
 *   • `probeOllama(deps?)` — is a local Ollama daemon reachable? A bounded,
 *     fail-open GET to `{baseUrl}/api/tags` under an `AbortController` timeout.
 *     It NEVER throws and NEVER hangs: connection-refused, timeout, or any
 *     non-200 all resolve to `false`. This is the gate `embed`'s `'auto'` mode
 *     uses to decide Ollama-vs-fallback (EM-02/EM-11b/EM-11c).
 *   • `detectCompute()` — a best-effort CPU/GPU hint used ONLY to order
 *     calibration candidates; never to gate behavior.
 *
 * Injectable `fetch` (default the Node 24 global) keeps tests hermetic — no live
 * network is required. No npm dependency.
 *
 * Cross-platform: `os.cpus()`; no shelling out, no bash.
 */

'use strict';

const os = require('os');
const { getSetting } = require('../settings');

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_PROBE_TIMEOUT_MS = 1500;

/**
 * Resolve the Ollama base URL: explicit dep wins, else the plan_index setting,
 * else the localhost default.
 * @param {{ baseUrl?: string, getSetting?: Function, projectPath?: string }} deps
 * @returns {string}
 */
function resolveBaseUrl(deps = {}) {
  if (typeof deps.baseUrl === 'string' && deps.baseUrl.length > 0) return deps.baseUrl;
  const get = typeof deps.getSetting === 'function' ? deps.getSetting : getSetting;
  let fromSetting;
  try {
    fromSetting = get('plan_index', 'ollama_base_url', deps.projectPath);
  } catch {
    fromSetting = undefined;
  }
  return typeof fromSetting === 'string' && fromSetting.length > 0 ? fromSetting : DEFAULT_BASE_URL;
}

/**
 * Probe whether a local Ollama daemon is reachable.
 *
 * Fail-open contract: resolves `false` on ANY error (connection refused,
 * timeout, non-200, malformed) — it NEVER throws and NEVER hangs.
 *
 * @param {{ fetch?: Function, baseUrl?: string, timeoutMs?: number, getSetting?: Function, projectPath?: string }} [deps]
 * @returns {Promise<boolean>} true iff GET {baseUrl}/api/tags returned HTTP 200
 */
async function probeOllama(deps = {}) {
  const doFetch = typeof deps.fetch === 'function' ? deps.fetch : globalThis.fetch;
  if (typeof doFetch !== 'function') return false; // no fetch available → fail-open

  const baseUrl = resolveBaseUrl(deps);
  const timeoutMs = Number.isFinite(deps.timeoutMs) ? deps.timeoutMs : DEFAULT_PROBE_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(`${baseUrl}/api/tags`, { method: 'GET', signal: controller.signal });
    return !!(res && (res.ok || res.status === 200));
  } catch {
    return false; // fail-open: unreachable / aborted / malformed
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort compute hint. Used ONLY to order calibration candidates, never to
 * gate. `hasGpu` is a heuristic (Node cannot portably enumerate GPUs without a
 * native dep, which CTOC forbids), so it is conservatively `false`.
 *
 * @returns {{ hasGpu: boolean, cpuCount: number }}
 */
function detectCompute() {
  let cpuCount = 1;
  try {
    const cpus = os.cpus();
    if (Array.isArray(cpus) && cpus.length > 0) cpuCount = cpus.length;
  } catch {
    cpuCount = 1;
  }
  return { hasGpu: false, cpuCount };
}

module.exports = { probeOllama, detectCompute, DEFAULT_BASE_URL, DEFAULT_PROBE_TIMEOUT_MS };
