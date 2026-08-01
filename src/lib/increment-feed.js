'use strict';

/**
 * THE "WHILE YOU WERE AWAY" INCREMENT FEED (slice 6) — the second half of the human's
 * loop ("answer questions, watch increments appear"). A PURE READ that names, in plain
 * words, what CTOC's build loop has PRODUCED since you last looked.
 *
 * It reimplements nothing: it reads the plans already on disk in the two states that
 * ARE a produced increment —
 *   - plans/review/  : built, waiting for your OK;
 *   - plans/done/    : shipped —
 * via the existing fail-soft reader (`state.readPlans`), and names each by its human
 * TITLE via the existing `streaming-gate.humanPlanName` (+ `state.parseMetadata`).
 *
 * "SINCE YOU LAST LOOKED" — the simplest correct definition: a BOUNDED RECENT WINDOW,
 * the last N increments by modified time, most-recent-first. This needs NO new persisted
 * "last seen" marker (an increment's own mtime — stamped when the build loop moved it
 * into review/ or done/ — already orders the feed), so nothing new is written to disk.
 *
 * WHY NOT THE APPROVAL LEDGER TOO: review/ + done/ already fully enumerate the increments
 * the loop produced, and the plan's mtime is a truer "when it landed" than an approval
 * timestamp. The ledger's `advanced_by: 'sufficiency'` entries are PRE-build auto-crosses
 * (functional→implementation, implementation→todo) — not produced increments, and already
 * reported by the Loop-B tick (`loop-b-driver.js`); its done entries duplicate done/. So a
 * second reader would add no increment these two folders don't already show. (Recorded
 * under Decisions Taken Under Ambiguity.)
 *
 * LANGUAGE RULE: every human-facing string names the increment by its human title only —
 * never a plan number, never a gate number, never a raw stage word ("review"/"done"). The
 * uniform phrasing "Built since you last looked" avoids naming either state.
 *
 * FAIL-OPEN and fault-isolated: `readPlans` is itself fail-soft (missing stage → [], a
 * per-file fault skipped), each plan is mapped inside its own try/catch, and the whole
 * read is wrapped — one bad entry is skipped, a bad root yields '' / []. This is wired
 * into session start (see src/hooks/SessionStart.js) and must never brick it.
 */

const path = require('node:path');

/** The two stages that hold a produced increment, in the order they are merged. */
const BUILT_STAGES = ['review', 'done'];

/** Default recent-window size — the last N increments shown. */
const DEFAULT_CAP = 10;

/** Lazy-require the readers so a broken install fails open at the call site, not on load. */
function deps() {
  const state = require('./state');
  const { humanPlanName } = require('./streaming-gate');
  return { readPlans: state.readPlans, getPlansDir: state.getPlansDir, parseMetadata: state.parseMetadata, humanPlanName };
}

/**
 * The plan's raw one-line title: its `# Heading`, else its frontmatter `title`, else its
 * slug. Mirrors `loop-b-driver.titleOf` (not exported there), then handed to humanPlanName.
 * @param {string} content
 * @param {string} slug
 * @param {(c: string) => any} parseMetadata
 * @returns {string}
 */
function titleOf(content, slug, parseMetadata) {
  const m = typeof content === 'string' ? content.match(/^#[ \t]+(.+)$/m) : null;
  if (m) return m[1].trim();
  const md = parseMetadata(content) || {};
  const t = md.title;
  return typeof t === 'string' && t.trim() ? t.trim() : String(slug || '');
}

/**
 * The bounded, most-recent-first list of increments the build loop has produced.
 * Each item is `{ title, when, modifiedMs }`. Pure read; never throws.
 *
 * @param {string} root - project root
 * @param {number} [cap] - recent-window size (default {@link DEFAULT_CAP})
 * @returns {Array<{title: string, when: string, modifiedMs: number}>}
 */
function recentIncrements(root, cap = DEFAULT_CAP) {
  if (typeof root !== 'string' || root.length === 0) return [];
  let d;
  try {
    d = deps();
  } catch {
    return []; // broken install — fail open
  }
  const items = [];
  const plansDir = d.getPlansDir(root);
  for (const stage of BUILT_STAGES) {
    let plans;
    try {
      plans = d.readPlans(path.join(plansDir, stage));
    } catch {
      continue; // a faulting stage never sinks the feed
    }
    for (const p of plans) {
      try {
        const title = d.humanPlanName(titleOf(p.content, p.name, d.parseMetadata), p.name);
        if (!title) continue;
        const modifiedMs = p.modified instanceof Date ? p.modified.getTime() : Number(p.modified) || 0;
        items.push({ title, when: p.ago || '', modifiedMs });
      } catch {
        // one malformed plan is skipped, never thrown — absorbing its fault is not a
        // verdict on the feed, so drop it and keep reading the rest.
        continue;
      }
    }
  }
  items.sort((a, b) => b.modifiedMs - a.modifiedMs);
  return items.slice(0, cap > 0 ? cap : DEFAULT_CAP);
}

/**
 * The rendered "while you were away" line, or '' when nothing recent was built. Leading
 * newline so it composes with the other session-start directives.
 *
 * @param {string} root - project root
 * @param {number} [cap]
 * @returns {string}
 */
function whileYouWereAway(root, cap = DEFAULT_CAP) {
  const items = recentIncrements(root, cap);
  if (!items.length) return '';
  return `\nBuilt since you last looked: ${items.map((i) => i.title).join(', ')}.`;
}

module.exports = { whileYouWereAway, recentIncrements, DEFAULT_CAP };
