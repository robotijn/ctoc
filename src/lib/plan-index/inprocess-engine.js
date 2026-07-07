/**
 * PI2 — In-process deterministic embedder (the fail-open fallback CORE).
 *
 * This is what makes CTOC's embedding engine fail-open and its tests hermetic: a
 * pure-JS, network-free, download-free, byte-deterministic embedder that always
 * produces vectors — even air-gapped, even with no Ollama and no model on disk.
 *
 * Algorithm — hashed bag-of-tokens (feature hashing):
 *   1. Tokenize each text into lowercased alphanumeric tokens.
 *   2. Hash each token with FNV-1a (32-bit) into one of `DIMENSION` buckets and
 *      a sign bit (a second, offset FNV pass) — signed feature hashing reduces
 *      collision bias.
 *   3. Accumulate token weights into the bucket vector.
 *   4. L2-normalize (cosine-ready; finite by construction — the empty/degenerate
 *      case returns an all-zero vector, which the caller/store tolerate).
 *
 * Identical input → byte-identical Float32Array (EM-02c). No `crypto`, no fs, no
 * native module — pure integer arithmetic, cross-platform for free.
 *
 * DA-2: DIMENSION = 384 (all-MiniLM-L6-v2 family) so an Ollama↔fallback switch
 * keeps a stable dimension family.
 *
 * DA-1: An ONNX model can later slot behind this same `embedInProcess` interface
 * with no API change; it is NOT implemented here because an ONNX-download
 * fallback still hard-fails air-gapped and is non-hermetic — defeating both the
 * fail-open and no-network-in-CI requirements.
 */

'use strict';

/** Fixed fallback embedding dimension (all-MiniLM-L6-v2 family). */
const DIMENSION = 384;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a 32-bit hash of a string, seeded, returned as an unsigned 32-bit int.
 * Deterministic across platforms (pure integer math, `>>> 0` keeps it unsigned).
 * @param {string} str
 * @param {number} seed
 * @returns {number} unsigned 32-bit hash
 */
function fnv1a(str, seed) {
  let hash = (FNV_OFFSET_BASIS ^ seed) >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Tokenize into lowercased alphanumeric tokens. Deterministic, unicode-agnostic
 * (ASCII word chars) so the output is stable regardless of locale.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  const matches = String(text).toLowerCase().match(/[a-z0-9]+/g);
  return matches || [];
}

/**
 * Embed a single text into an L2-normalized Float32Array(DIMENSION) via signed
 * feature hashing.
 * @param {string} text
 * @returns {Float32Array}
 */
function embedOne(text) {
  const vec = new Float32Array(DIMENSION);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const bucket = fnv1a(tok, 0) % DIMENSION;
    // Second, differently-seeded hash decides the sign → signed feature hashing.
    const sign = (fnv1a(tok, 0x9e3779b9) & 1) === 0 ? 1 : -1;
    vec[bucket] += sign;
  }
  // L2-normalize (finite; all-zero stays all-zero for empty/no-token input).
  let norm = 0;
  for (let i = 0; i < DIMENSION; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < DIMENSION; i++) vec[i] = vec[i] / norm;
  }
  return vec;
}

/**
 * Deterministic in-process batch embedder — the fail-open fallback.
 *
 * @param {string[]} texts
 * @returns {Promise<Float32Array[]>} one L2-normalized Float32Array(DIMENSION) per text
 */
async function embedInProcess(texts) {
  const arr = Array.isArray(texts) ? texts : [texts];
  return arr.map((t) => embedOne(typeof t === 'string' ? t : String(t == null ? '' : t)));
}

module.exports = { embedInProcess, embedOne, tokenize, fnv1a, DIMENSION };
