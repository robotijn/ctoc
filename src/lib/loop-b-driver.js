'use strict';

/**
 * THE LOOP-B TICK (slice 2) — one human-readable line describing the state of CTOC's
 * build loop, or '' when there is nothing to do.
 *
 * This is a PURE COMPOSITION. It reimplements nothing: it calls three functions that
 * already exist and phrases what they return in the human's own words.
 *
 *   (a) `streaming-gate.pendingGateDecisions(root)` — its DOCUMENTED side effect is the
 *       sanctioned sufficiency auto-cross: a pre-build plan with enough answered context
 *       advances itself (`advanced_by: 'sufficiency'`, no human approval). We add NO
 *       crossing logic and NEVER cross a human gate; we only NAME what the side effect
 *       just moved, detected as the difference between the pre-build stages before and
 *       after the call. Its return value lists what STAYED pending, so it cannot tell us
 *       what crossed — the before/after diff is the honest, reuse-only way to see it.
 *   (b) `streaming-precompute.plansNeedingQuestions(root)` — the plans whose precomputed
 *       decision questions are missing/stale (Loop-B must dispatch subagents for these).
 *   (c) `continuation-queue.nextBuildable(root)` — the head of `.buildable` is the next
 *       plan to build.
 *
 * LANGUAGE RULE (fenced by instruction-gate-words-scan.js / human-facing-scan.js): the
 * returned string never carries a gate number or a raw stage name. A plan is named by
 * its human title via `gate-words.humanPlanName`, never by its number or filename.
 *
 * FAIL-OPEN and fault-isolated: each of the three sources is computed on its own, so one
 * throwing degrades to a PARTIAL directive, never a crash — this runs at session start
 * (see src/hooks/SessionStart.js) and must never brick it.
 */

const path = require('node:path');
const safeFs = require('./safe-fs');

/**
 * The pre-build stages a sufficiency cross can move a plan OUT of. `pendingGateDecisions`
 * only crosses from `functional` (→ implementation) and `implementation` (→ todo); the
 * `review → done` gate is never crossed by sufficiency. A plan that disappears from one
 * of these between the before and after snapshots was auto-crossed by the call.
 */
const SUFFICIENCY_SOURCE_STAGES = ['functional', 'implementation'];

/**
 * At most this many plan titles are named in any one summary line before it collapses
 * to "and K more". Mirrors increment-feed's cap-and-summarize so a large backlog reads
 * as a legible directive, not a wall. 5, tighter than increment-feed's 10, because this
 * runs THREE such lines at session start and terseness is the point.
 */
const NAME_CAP = 5;

/** Wire the three composed sources + the plan readers. Its require failure fails open. */
function buildDeps() {
  const state = require('./state');
  const { pendingGateDecisions, humanPlanName } = require('./streaming-gate');
  const { plansNeedingQuestions } = require('./streaming-precompute');
  const { nextBuildable } = require('./continuation-queue');
  const gateWords = require('./gate-words');
  return {
    getPlansDir: state.getPlansDir,
    readPlans: state.readPlans,
    parseMetadata: state.parseMetadata,
    humanPlanName,
    moment: gateWords.moment,
    pendingGateDecisions,
    plansNeedingQuestions,
    nextBuildable,
  };
}

/**
 * Cap a list of human names to at most `cap`, then "and K more". The one place the
 * wall becomes a summary — every group line routes through it.
 * @param {string[]} names
 * @param {number} [cap]
 * @returns {string}
 */
function summarize(names, cap = NAME_CAP) {
  const n = cap > 0 ? cap : NAME_CAP;
  if (names.length <= n) return names.join(', ');
  return `${names.slice(0, n).join(', ')}, and ${names.length - n} more`;
}

/** A decision descriptor still carries an unresolved fork the human must answer. */
function hasOpenForks(d) {
  return (Array.isArray(d.blockingQuestionIds) && d.blockingQuestionIds.length > 0)
    || (Array.isArray(d.unansweredQuestionIds) && d.unansweredQuestionIds.length > 0);
}

/**
 * A plan is BUILT AND WAITING FOR THE HUMAN'S OK — not one CTOC is still working out
 * questions for — when its next move is the final human sign-off and it has no open
 * fork. `toStage === 'done'` is that final edge (only `review → done`); everything else
 * in `plansNeedingQuestions` is a pre-build plan whose sufficiency is not yet computed,
 * i.e. genuinely still being worked out.
 */
function isWaitingForOk(d) {
  return !!d && d.toStage === 'done' && !hasOpenForks(d);
}

/**
 * The plan's raw one-line title: its `# Heading`, else its frontmatter `title`, else its
 * slug. Mirrors `streaming-gate.planTitle` (not exported), then handed to `humanPlanName`.
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
 * Read a plan's content, or '' when it is missing/unreadable (e.g. a plan mid-move).
 * @returns {string}
 */
function readPlanContent(root, stage, file, deps) {
  try {
    return safeFs.readFileSync(path.join(deps.getPlansDir(root), stage, file), 'utf8');
  } catch {
    return '';
  }
}

/**
 * Map every plan resident in a sufficiency source stage to its human name. state.readPlans
 * is itself fail-soft (missing stage dir → [], per-file faults skipped).
 * @returns {Map<string, string>} ref ("stage/file.md") -> human name
 */
function preBuildSnapshot(root, deps) {
  const map = new Map();
  const plansDir = deps.getPlansDir(root);
  for (const stage of SUFFICIENCY_SOURCE_STAGES) {
    for (const p of deps.readPlans(path.join(plansDir, stage))) {
      map.set(`${stage}/${p.name}.md`, deps.humanPlanName(titleOf(p.content, p.name, deps.parseMetadata), p.name));
    }
  }
  return map;
}

/** The human name for a "stage/file.md" ref — read the plan for its title, fall back to slug. */
function nameForRef(root, ref, deps) {
  const slash = String(ref).indexOf('/');
  const stage = ref.slice(0, slash);
  const file = ref.slice(slash + 1);
  const slug = file.replace(/\.md$/i, '');
  const content = readPlanContent(root, stage, file, deps);
  return deps.humanPlanName(titleOf(content, slug, deps.parseMetadata), slug);
}

/** (a) plans the sufficiency side effect just moved out of a pre-build stage. */
function crossedLines(root, deps) {
  try {
    const before = preBuildSnapshot(root, deps);
    deps.pendingGateDecisions(root); // sanctioned side effect: sufficiency auto-cross
    const after = preBuildSnapshot(root, deps);
    const crossed = [];
    for (const [ref, name] of before) {
      if (!after.has(ref)) crossed.push(name);
    }
    return crossed.length
      ? [`Moved forward on their own — enough was known to proceed without your OK: ${summarize(crossed)}.`]
      : [];
  } catch {
    return [];
  }
}

/**
 * (b) the pending set, SPLIT by what each plan actually needs and each list CAPPED:
 *   - WORKING OUT: plans with an open fork, or pre-build plans whose sufficiency is not
 *     yet computed — a real question CTOC is still generating.
 *   - WAITING FOR YOUR OK: built plans at the final sign-off with no open fork.
 * The descriptor already carries `title`/`slug`, so names come from it directly — no
 * per-plan file read (the old wall re-read ~134 files here). Moment phrasing via
 * gate-words keeps the waiting line free of any raw stage word.
 */
function needQuestionLines(root, deps) {
  try {
    const needing = deps.plansNeedingQuestions(root);
    if (!Array.isArray(needing) || !needing.length) return [];
    const working = [];
    const waiting = [];
    for (const d of needing) {
      if (!d) continue;
      const name = deps.humanPlanName(d.title, d.slug);
      if (!name) continue;
      (isWaitingForOk(d) ? waiting : working).push({ name, fromStage: d.fromStage });
    }
    const lines = [];
    if (working.length) {
      lines.push(`Still working out what to ask you about: ${summarize(working.map((w) => w.name))}.`);
    }
    if (waiting.length) {
      const moment = deps.moment(waiting[0].fromStage) || 'nothing is finished until you say so';
      lines.push(`Waiting for your OK — ${moment}: ${summarize(waiting.map((w) => w.name))}.`);
    }
    return lines;
  } catch {
    return [];
  }
}

/** (c) the next plan to build. */
function nextBuildLines(root, deps) {
  try {
    const order = deps.nextBuildable(root);
    const head = order && Array.isArray(order.buildable) ? order.buildable[0] : null;
    if (!head) return [];
    const name = nameForRef(root, head, deps);
    return name ? [`Next up to build: ${name}.`] : [];
  } catch {
    return [];
  }
}

/**
 * Compose the Loop-B directive for `root`. See the module header.
 * @param {string} root - project root
 * @returns {string} a leading-newline directive, or '' when there is nothing to report
 */
function loopBDirective(root) {
  if (typeof root !== 'string' || root.length === 0) return '';
  // buildDeps only requires local modules; a failure there is a broken install, and the
  // sole live caller (src/hooks/SessionStart.js) already wraps this call fail-open. Each
  // of the three source helpers below is independently try/caught for fault isolation.
  const deps = buildDeps();
  const lines = [
    ...crossedLines(root, deps),
    ...needQuestionLines(root, deps),
    ...nextBuildLines(root, deps),
  ];
  return lines.length ? `\n${lines.join('\n')}` : '';
}

module.exports = { loopBDirective };
