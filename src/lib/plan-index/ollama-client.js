/**
 * PI2 — Ollama HTTP client (batch embed + tag listing). No npm dependency.
 *
 * Built on the Node 24 built-in `fetch`. A FACTORY (`createOllamaClient`) so the
 * `fetch` implementation is injectable — tests run hermetically with a fake fetch
 * and never touch the network.
 *
 * Endpoints:
 *   • `embed(model, input[])` → `POST {baseUrl}/api/embed` with body
 *     `{ model, input }` — the BATCH endpoint (`input: string[]`), NOT the
 *     deprecated single-text `/api/embeddings` (EM-01/EM-01b). Parses
 *     `{ embeddings: number[][] }`, validates the shape (array of equal-length
 *     finite-number rows) before constructing `Float32Array`s — a hard guard
 *     against Ollama API drift silently poisoning the store.
 *   • `listModels()` → `GET {baseUrl}/api/tags` → base model names (tag-stripped)
 *     for the calibration availability filter (EM-01d/EM-09).
 *
 * Every request is bounded by an `AbortController` timeout so a hung Ollama can
 * never freeze `embed` or the menu.
 *
 * Errors REJECT (network failure, non-200, shape mismatch). The caller
 * (`embedder.js`) catches and falls back, so `embed()` never rejects to PI0/PI3.
 *
 * Cross-platform: pure `fetch`; no OS assumptions.
 */

'use strict';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_EMBED_TIMEOUT_MS = 5000;

/**
 * A promise that REJECTS when `signal` aborts — used to race a stalled response
 * body read against the same AbortController timeout, so reading a hung body can
 * never outlive the bound even if the body promise itself ignores the signal.
 * @param {AbortSignal} signal
 * @param {number} timeoutMs
 * @returns {Promise<never>}
 */
function rejectOnAbort(signal, timeoutMs) {
  return new Promise((_resolve, reject) => {
    const fail = () => reject(new Error(`ollama-client: request exceeded ${timeoutMs}ms timeout`));
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener('abort', fail, { once: true });
  });
}

/**
 * Perform a bounded fetch AND consume its body under a single AbortController
 * timeout. `handle(res, signal)` runs while the timer is still armed, so the
 * HEADERS read (`doFetch`) AND the BODY read the handler performs are BOTH
 * bounded — the timer is cleared only after the handler settles, never the
 * instant headers arrive. The handler races its body read against
 * `rejectOnAbort(signal, timeoutMs)` so a stalled body is aborted by the timeout.
 * @param {Function} doFetch
 * @param {string} url
 * @param {object} options
 * @param {number} timeoutMs
 * @param {(res: any, signal: AbortSignal) => Promise<any>} handle
 * @returns {Promise<any>} whatever `handle` resolves to
 */
async function boundedFetch(doFetch, url, options, timeoutMs, handle) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { ...options, signal: controller.signal });
    return await handle(res, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strip a `:tag` suffix from an Ollama model name → base name.
 * `nomic-embed-text:latest` → `nomic-embed-text`.
 * @param {string} name
 * @returns {string}
 */
function stripTag(name) {
  const idx = name.indexOf(':');
  return idx === -1 ? name : name.slice(0, idx);
}

/**
 * Validate the `/api/embed` response and map it to Float32Array[].
 * Throws a descriptive Error on any shape mismatch (Ollama API-drift guard).
 * @param {any} json
 * @returns {Float32Array[]}
 */
function parseEmbeddings(json) {
  const rows = json && json.embeddings;
  if (!Array.isArray(rows)) {
    throw new Error(
      `ollama-client: unexpected /api/embed response shape — expected { embeddings: number[][] }, got embeddings=${
        rows === undefined ? 'undefined' : typeof rows
      }`
    );
  }
  if (rows.length === 0) {
    throw new Error('ollama-client: /api/embed returned an empty embeddings array');
  }
  let expectedLen = null;
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) {
      throw new Error(`ollama-client: /api/embed row ${r} is not a non-empty number array`);
    }
    if (expectedLen === null) expectedLen = row.length;
    else if (row.length !== expectedLen) {
      throw new Error(
        `ollama-client: /api/embed row ${r} length ${row.length} != expected dimension ${expectedLen}`
      );
    }
    for (let i = 0; i < row.length; i++) {
      if (!Number.isFinite(row[i])) {
        throw new Error(`ollama-client: /api/embed row ${r} contains a non-finite value at index ${i}`);
      }
    }
    out.push(new Float32Array(row));
  }
  return out;
}

/**
 * Create an Ollama client bound to an injectable `fetch` and base URL.
 *
 * @param {{ fetch?: Function, baseUrl?: string, timeoutMs?: number }} [config]
 * @returns {{ embed: (model: string, input: string[]) => Promise<Float32Array[]>,
 *             listModels: () => Promise<string[]>, baseUrl: string }}
 */
function createOllamaClient(config = {}) {
  const doFetch = typeof config.fetch === 'function' ? config.fetch : globalThis.fetch;
  const baseUrl =
    typeof config.baseUrl === 'string' && config.baseUrl.length > 0 ? config.baseUrl : DEFAULT_BASE_URL;
  const timeoutMs = Number.isFinite(config.timeoutMs) ? config.timeoutMs : DEFAULT_EMBED_TIMEOUT_MS;

  if (typeof doFetch !== 'function') {
    throw new Error('ollama-client: no fetch implementation available (Node 24 global fetch or an injected fetch is required)');
  }

  /**
   * Batch-embed an array of texts.
   * @param {string} model
   * @param {string[]} input
   * @returns {Promise<Float32Array[]>}
   */
  async function embed(model, input) {
    if (typeof model !== 'string' || model.length === 0) {
      throw new Error('ollama-client: embed requires a non-empty model name');
    }
    if (!Array.isArray(input) || input.length === 0) {
      throw new Error('ollama-client: embed requires a non-empty input string[]');
    }
    return boundedFetch(
      doFetch,
      `${baseUrl}/api/embed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input })
      },
      timeoutMs,
      async (res, signal) => {
        if (!res || !(res.ok || res.status === 200)) {
          const status = res ? res.status : 'no-response';
          throw new Error(`ollama-client: /api/embed returned HTTP ${status}`);
        }
        const json = await Promise.race([res.json(), rejectOnAbort(signal, timeoutMs)]);
        return parseEmbeddings(json);
      }
    );
  }

  /**
   * List locally-available model base names via /api/tags.
   * @returns {Promise<string[]>}
   */
  async function listModels() {
    return boundedFetch(doFetch, `${baseUrl}/api/tags`, { method: 'GET' }, timeoutMs, async (res, signal) => {
      if (!res || !(res.ok || res.status === 200)) {
        const status = res ? res.status : 'no-response';
        throw new Error(`ollama-client: /api/tags returned HTTP ${status}`);
      }
      const json = await Promise.race([res.json(), rejectOnAbort(signal, timeoutMs)]);
      const models = json && Array.isArray(json.models) ? json.models : [];
      return models
        .map((m) => (m && typeof m.name === 'string' ? stripTag(m.name) : null))
        .filter((n) => typeof n === 'string' && n.length > 0);
    });
  }

  return { embed, listModels, baseUrl };
}

module.exports = { createOllamaClient, parseEmbeddings, stripTag, DEFAULT_BASE_URL, DEFAULT_EMBED_TIMEOUT_MS };
