'use strict';

/**
 * Frontmatter merge — the write-side counterpart to the read-side merge helpers.
 *
 * WHY THIS EXISTS. A human-gate crossing stamps an approval marker
 * (`approved_by`/`approved_at`/`gate_crossed`, plus `override`/`override_reason`)
 * into a plan. The stamping used to PREPEND a brand-new `---…---` block on every
 * crossing, so a plan that crossed 2-4 gates over its life accumulated 2-4 stacked
 * leading blocks. The shared primitive `frontmatter.parseFrontmatter` reads only
 * the FIRST block, so on a stacked plan it returned the newest marker's three
 * scalar fields and NONE of the plan's own `title`/`type`/`files:`/`depends_on`
 * (which live in a later block). Four independent reader-side workarounds already
 * carry the weight the write path should carry.
 *
 * This module MERGES the marker into the plan's single existing block instead, and
 * collapses any historical stacking it encounters, so the corruption is
 * structurally impossible going forward and the raw primitive reads correctly.
 *
 * DUPLICATE-KEY RULE. `state.parseFrontmatterLines` reads a stacked plan with
 * "a later duplicate key OVERRIDES an earlier one" — so the plan's OWN block
 * (physically last) wins over a prepended marker block on a genuine clash. The
 * marker blocks are prepended NEWEST-FIRST, so the most-recent marker is the
 * TOPMOST block. To keep the most-recent marker AND the plan's own fields when
 * collapsing top-to-bottom, this module merges with FIRST-occurrence-wins over the
 * blocks in file order (topmost marker wins over older markers; the plan's own
 * fields are unique to its block, so nothing shadows them). That is the same net
 * result the reader convention produces for the fields that actually clash (the
 * repeated marker scalars), reached from the opposite end because we emit ONE
 * block rather than reading a union — it introduces no third merge rule.
 *
 * Pure string operations only — zero `require`s, so it can never participate in a
 * require cycle (imported freely by actions.js and the migration script).
 *
 * @module frontmatter-merge
 */

/**
 * The marker keys the approval-stamp write path OWNS. On each stamp these are
 * removed from the existing block and re-appended with the current crossing's
 * values, so a re-approval updates in place (idempotent) and a clean re-crossing
 * clears a stale `override`/`override_reason` (the named FR-2 rule).
 * @type {string[]}
 */
const MARKER_KEYS = ['approved_by', 'approved_at', 'gate_crossed', 'override', 'override_reason'];

/**
 * Split a plan's leading, consecutive `---…---` frontmatter blocks from its body.
 * CRLF-safe. Stops at the first unterminated block (never throws on a structural
 * irregularity). The `body` string is everything after the last consumed block,
 * preserved verbatim (including the blank-line separator before the content).
 *
 * @param {string} text full file contents
 * @returns {{ hasFrontmatter: boolean, blocks: string[][], body: string }}
 *   `blocks` is a list of block bodies, each an array of `\r`-stripped lines.
 */
function splitLeadingFrontmatter(text) {
  const src = String(text);
  const lines = src.split('\n');
  const strip = (s) => s.replace(/\r$/, '');
  const blocks = [];
  let i = 0;
  // Allow leading blank lines before the first block.
  while (i < lines.length && strip(lines[i]).trim() === '') i++;

  while (i < lines.length && strip(lines[i]).trim() === '---') {
    let j = i + 1;
    const body = [];
    let closed = false;
    while (j < lines.length) {
      if (strip(lines[j]).trim() === '---') { closed = true; break; }
      body.push(strip(lines[j]));
      j++;
    }
    if (!closed) {
      // Unterminated block. In the stacked-marker corruption the real
      // frontmatter block's CLOSING fence was lost, so the plan's fields run
      // straight into the markdown body: the block FOLLOWS an already-consumed
      // marker block and its first content line is a top-level YAML key. Recover
      // the YAML prefix as a block and hand the rest back as the body. In every
      // other case leave it unconsumed — a lone top-of-file `---`, or a `---`
      // horizontal rule with prose after it, is body, never lost frontmatter.
      const recovered = recoverUnterminatedBlock(blocks, body);
      if (recovered) {
        blocks.push(recovered.blockLines);
        i = i + 1 + recovered.bodyStartOffset;
      }
      break;
    }
    blocks.push(body);
    i = j + 1;
    // Peek past blank lines: consume them only if ANOTHER block follows.
    const save = i;
    while (i < lines.length && strip(lines[i]).trim() === '') i++;
    if (!(i < lines.length && strip(lines[i]).trim() === '---')) {
      i = save; // no further block — leave the blanks with the body
      break;
    }
  }

  if (blocks.length === 0) {
    return { hasFrontmatter: false, blocks: [], body: src };
  }
  const body = lines.slice(i).join('\n');
  return { hasFrontmatter: true, blocks, body };
}

/**
 * Is `line` a top-level YAML mapping key (a `key:` at column 0, no leading
 * whitespace, not a list dash)? Returns the key name or null.
 * @param {string} line
 * @returns {string|null}
 */
function topLevelKey(line) {
  if (/^\s/.test(line)) return null; // indented → belongs to a parent key's sub-tree
  const m = line.match(/^([^\s:#][^:]*):(?:\s|$)/);
  return m ? m[1].trim() : null;
}

/**
 * Recover a real frontmatter block whose closing `---` fence was lost (the
 * stacked-marker corruption). Only fires when the block FOLLOWS an already-consumed
 * block AND its first content line is a top-level YAML key — the signature of lost
 * frontmatter, never a markdown horizontal rule. The frontmatter portion is the
 * maximal prefix of blank / indented / top-level-key lines; the first line that is
 * none of those is the body start. Trailing blank lines before the body are the
 * separator and stay with the body (matching the well-formed `---\n\n<body>` shape).
 *
 * @param {string[][]} priorBlocks blocks already consumed this scan
 * @param {string[]} body the unterminated block's lines (`\r`-stripped), running to EOF
 * @returns {{ blockLines: string[], bodyStartOffset: number }|null} null = do not recover
 */
function recoverUnterminatedBlock(priorBlocks, body) {
  if (priorBlocks.length === 0) return null; // a lone top-of-file `---` is not lost frontmatter
  if (body.length === 0) return null;
  if (topLevelKey(body[0]) === null) return null; // first line is body/horizontal-rule, not YAML

  let boundary = -1;
  for (let x = 0; x < body.length; x++) {
    const ln = body[x];
    if (ln.trim() === '') continue;         // blank: frontmatter interior or separator
    if (/^\s/.test(ln)) continue;           // indented: a key's sub-tree
    if (topLevelKey(ln) !== null) continue; // a top-level key
    boundary = x; break;                    // first markdown/body line
  }
  if (boundary === -1) return null; // no body boundary — refuse to swallow everything

  let fmEnd = boundary;
  while (fmEnd > 0 && body[fmEnd - 1].trim() === '') fmEnd--; // trim trailing separator blanks
  if (fmEnd === 0) return null; // no actual frontmatter content

  return { blockLines: body.slice(0, fmEnd), bodyStartOffset: fmEnd };
}

/**
 * Merge a list of block bodies into one flat line list with FIRST-occurrence of
 * each top-level key winning (topmost block wins). A key's indented sub-tree
 * (and any trailing blank lines within its group) rides along with it, so nested
 * YAML such as `kickback_counts:`/`  by_step:`/`    '14': 1` is preserved intact,
 * and dropping a duplicate top-level key drops its whole sub-tree (never orphaning
 * children under a surviving key).
 *
 * @param {string[][]} blocks
 * @returns {string[]} merged lines
 */
function mergeBlocksFirstKeyWins(blocks) {
  const out = [];
  const seen = new Set();
  for (const body of blocks) {
    let k = 0;
    while (k < body.length) {
      const line = body[k];
      const key = topLevelKey(line);
      if (key !== null) {
        // Collect this key's group: the key line + following indented/blank lines.
        const group = [line];
        let n = k + 1;
        while (n < body.length && (/^\s/.test(body[n]) || body[n].trim() === '')) {
          group.push(body[n]);
          n++;
        }
        if (!seen.has(key)) {
          seen.add(key);
          out.push(...group);
        }
        k = n;
      } else {
        // A stray line with no resolvable top-level key (blank, or malformed).
        // Keep non-blank strays to avoid silent data loss; drop pure blanks so the
        // emitted block has no interior gaps.
        if (line.trim() !== '') out.push(line);
        k++;
      }
    }
  }
  return out;
}

/**
 * Remove the given top-level keys (and their indented sub-trees) from a flat line
 * list. Used to clear the OWNED marker keys before re-appending the current
 * crossing's values.
 * @param {string[]} lines
 * @param {string[]} keys
 * @returns {string[]}
 */
function removeTopLevelKeys(lines, keys) {
  const drop = new Set(keys);
  const out = [];
  let k = 0;
  while (k < lines.length) {
    const key = topLevelKey(lines[k]);
    if (key !== null && drop.has(key)) {
      k++;
      while (k < lines.length && (/^\s/.test(lines[k]) || lines[k].trim() === '')) k++;
      continue;
    }
    out.push(lines[k]);
    k++;
  }
  return out;
}

/**
 * Reassemble one frontmatter block from `blockLines` plus the preserved `body`.
 * @param {string[]} blockLines
 * @param {string} body
 * @returns {string}
 */
function assembleSingleBlock(blockLines, body) {
  return '---\n' + blockLines.join('\n') + '\n---\n' + body;
}

/**
 * Upsert the marker fields into a plan's single frontmatter block (FR-1/FR-2).
 *
 * - No frontmatter → create exactly one block with the marker fields.
 * - Existing frontmatter (one or, defensively, several stacked blocks) → flatten
 *   to one block (first-key-wins), remove the OWNED marker keys AND every key this
 *   call is about to insert, then append the fresh marker fields in order.
 *   Idempotent: re-stamping updates in place and a clean re-crossing clears a stale
 *   override.
 *
 * UPSERT means replace-or-insert: any key present in `markerFields` is stripped from
 * the existing block before re-appending, so a caller that upserts the SAME key
 * twice (e.g. `rejectPlan` writing `revision`/`rejection_reason`/`tag` on every
 * rejection) updates the value in place instead of accumulating a duplicate line.
 * `MARKER_KEYS` is stripped unconditionally on top of that so a clean re-crossing
 * clears a stale `override`/`override_reason` even when this call does not set them.
 *
 * The plan's own fields (`title`/`type`/`files:`/`depends_on`/…) are never
 * touched, only the marker keys and the keys being upserted.
 *
 * @param {string} content plan file contents
 * @param {string[][]} markerFields ordered [key, value] pairs
 * @returns {string} the rewritten content with exactly one frontmatter block
 */
function upsertMarkerFields(content, markerFields) {
  const markerLines = markerFields.map(([k, v]) => `${k}: ${v}`);
  const { hasFrontmatter, blocks, body } = splitLeadingFrontmatter(content);

  if (!hasFrontmatter) {
    return '---\n' + markerLines.join('\n') + '\n---\n\n' + String(content);
  }

  // Strip the always-owned marker keys AND every key we are about to insert, so an
  // upsert replaces rather than appends (no duplicate key on a second upsert).
  const toStrip = MARKER_KEYS.concat(markerFields.map(([k]) => k));
  const merged = mergeBlocksFirstKeyWins(blocks);
  const kept = removeTopLevelKeys(merged, toStrip);
  return assembleSingleBlock(kept.concat(markerLines), body);
}

/**
 * Collapse a plan's stacked leading frontmatter blocks into ONE, keeping the
 * most-recent marker's values and every plan field (FR-3). A no-op (changed:false)
 * on a plan that already has zero or one leading block.
 *
 * @param {string} content plan file contents
 * @returns {{ changed: boolean, content: string }}
 */
function mergeStackedFrontmatter(content) {
  const { hasFrontmatter, blocks, body } = splitLeadingFrontmatter(content);
  if (!hasFrontmatter || blocks.length <= 1) {
    return { changed: false, content: String(content) };
  }
  const merged = mergeBlocksFirstKeyWins(blocks);
  return { changed: true, content: assembleSingleBlock(merged, body) };
}

module.exports = {
  upsertMarkerFields,
  mergeStackedFrontmatter,
};
