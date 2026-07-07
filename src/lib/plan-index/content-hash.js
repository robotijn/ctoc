'use strict';

/**
 * PI3 — Deterministic per-unit content hash.
 *
 * The sweep (`reconcileIndex`) and the hot-path (`syncUnit`) diff a plan's current
 * on-disk bytes against the `contentHash` stored on each unit so a re-embed happens
 * ONLY when something retrieval-relevant actually changed. This module wraps
 * `hashString` (SHA-256) from `src/lib/hash-utils.js` — no new crypto — and folds
 * the retrieval-affecting frontmatter (`files:`, `parent_vision`, `status`) into a
 * stable canonical prefix so a metadata-only change (e.g. a new `files:` glob) also
 * shifts the hash, while frontmatter ORDER never does.
 *
 * Pure: string ops + SHA-256 via hash-utils. No fs, no OS-specific code.
 */

const { hashString } = require('../hash-utils');
const { PLAN_SENTINEL } = require('./index');

/** Unit-separator byte — delimits the canonical meta prefix from the unit text so
 *  the meta/text boundary can never let two different inputs collide. */
const META_SEP = '\x1f';

/**
 * Canonicalize the retrieval-affecting metadata into a stable, order-independent
 * string. `files` is sorted then joined with `\n` (frontmatter array order is not
 * semantic). `null`/`undefined` fields normalize to the empty string.
 *
 * @param {{ files?: string[], parentVision?: string|null, status?: string|null }} meta
 * @returns {string}
 */
function canonicalizeMeta(meta = {}) {
  const files = Array.isArray(meta.files) ? meta.files.slice().sort().join('\n') : '';
  const parentVision = meta.parentVision == null ? '' : String(meta.parentVision);
  const status = meta.status == null ? '' : String(meta.status);
  return `files=${files}\nparentVision=${parentVision}\nstatus=${status}`;
}

/**
 * Deterministic SHA-256 hex digest of a unit's text + its retrieval-affecting
 * metadata. Total: never throws (non-string `text` is coerced via `String`).
 *
 * @param {string} text
 * @param {{ files?: string[], parentVision?: string|null, status?: string|null }} [meta]
 * @returns {string} SHA-256 hex digest.
 */
function hashUnit(text, meta = {}) {
  const t = typeof text === 'string' ? text : String(text ?? '');
  return hashString(`${canonicalizeMeta(meta)}${META_SEP}${t}`);
}

module.exports = { hashUnit, canonicalizeMeta, PLAN_SENTINEL };
