'use strict';

/**
 * Splits a markdown agent definition into UNITS — the grain a rule inventory classifies.
 *
 *   frontmatter  the whole `---` block
 *   heading      one `#`..`######` line
 *   table-row    one `|` line (separator rows are formatting and are skipped)
 *   fence        one fenced code block, whole
 *   sentence     list items and paragraphs, split into sentences: a sentence ends at
 *                `.`, `?` or `!` followed by whitespace, outside a backtick span
 *
 * One splitter serves the hand labelling (`node tests/compaction-eval/units.js <file>`
 * prints a skeleton inventory) and the inventory test, so the two cannot disagree.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');

const HEADING = /^#{1,6} /;
const TABLE = /^\s*\|/;
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;
const FENCE = /^\s*```/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+/;

/** Runs of whitespace squashed to one space, `**` emphasis removed, trimmed. */
function normalize(text) {
  return String(text).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

/** sha256 of the text with runs of whitespace squashed (emphasis kept: it is content). */
function shaOf(text) {
  return crypto.createHash('sha256').update(String(text).replace(/\s+/g, ' ').trim()).digest('hex');
}

/** Sentences of one prose block; a terminator inside a backtick span never splits. */
function sentences(block) {
  const text = block.replace(/\s+/g, ' ').trim();
  const out = [];
  let inTick = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '`') inTick = !inTick;
    else if (!inTick && (ch === '.' || ch === '?' || ch === '!') && text[i + 1] === ' ') {
      out.push(text.slice(start, i + 1).trim());
      start = i + 2;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * @param {string} markdown
 * @returns {{ n: number, type: string, text: string, sha: string }[]}
 */
function splitUnits(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const raw = [];
  let i = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      raw.push({ type: 'frontmatter', text: lines.slice(0, end + 1).join('\n') });
      i = end + 1;
    }
  }
  let block = null;
  const flush = () => {
    if (block) for (const s of sentences(block.join('\n'))) raw.push({ type: 'sentence', text: s });
    block = null;
  };
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) {
      flush();
      let j = i + 1;
      while (j < lines.length && !FENCE.test(lines[j])) j++;
      raw.push({ type: 'fence', text: lines.slice(i, j + 1).join('\n') });
      i = j;
    } else if (line.trim() === '') {
      flush();
    } else if (HEADING.test(line)) {
      flush();
      raw.push({ type: 'heading', text: line.trim() });
    } else if (TABLE.test(line)) {
      flush();
      if (!TABLE_SEPARATOR.test(line)) raw.push({ type: 'table-row', text: line.trim() });
    } else if (LIST_ITEM.test(line)) {
      flush();
      block = [line.trim()];
    } else {
      if (!block) block = [];
      block.push(line.trim());
    }
  }
  flush();
  return raw.map((u, k) => ({ n: k + 1, type: u.type, text: u.text, sha: shaOf(u.text) }));
}

/**
 * The text split at `#` and `##` headings (deeper headings stay inside their section),
 * each section normalised. The frontmatter is its own section, headed `frontmatter`.
 * @returns {{ heading: string, text: string }[]}
 */
function sectionize(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      out.push({ heading: 'frontmatter', lines: lines.slice(0, end + 1) });
      i = end + 1;
    }
  }
  let current = null;
  let inFence = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) inFence = !inFence;
    if (!inFence && /^#{1,2} /.test(line)) {
      current = { heading: line.trim(), lines: [] };
      out.push(current);
    }
    if (!current) {
      if (line.trim() === '') continue;
      current = { heading: '', lines: [] };
      out.push(current);
    }
    current.lines.push(line);
  }
  return out.map((s) => ({ heading: s.heading, text: normalize(s.lines.join('\n')) }));
}

/**
 * Every anchor of every order that is missing from its `now_in` section.
 * @param {{ heading: string, text: string }[]} sections  from sectionize()
 * @param {{ id: string, now_in: string, anchors: string[] }[]} orders
 * @returns {{ id: string, anchor: string, reason: 'missing'|'wrong-section'|'no-such-section' }[]}
 */
function anchorFailures(sections, orders) {
  const byHeading = new Map(sections.map((s) => [s.heading, s.text]));
  const failures = [];
  for (const o of orders) {
    const home = byHeading.get(o.now_in);
    for (const anchor of o.anchors) {
      const a = normalize(anchor);
      if (home === undefined) failures.push({ id: o.id, anchor, reason: 'no-such-section' });
      else if (!home.includes(a)) {
        const elsewhere = sections.some((s) => s.text.includes(a));
        failures.push({ id: o.id, anchor, reason: elsewhere ? 'wrong-section' : 'missing' });
      }
    }
  }
  return failures;
}

module.exports = { splitUnits, sectionize, anchorFailures, normalize, shaOf };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write('usage: node tests/compaction-eval/units.js <markdown file>\n');
    process.exitCode = 2;
  } else {
    const skeleton = splitUnits(fs.readFileSync(file, 'utf8'))
      .map((u) => ({ n: u.n, sha: u.sha, type: u.type, kind: '', fate: '', orders: [], text: u.text }));
    process.stdout.write(JSON.stringify({ units: skeleton }, null, 2) + '\n');
  }
}
