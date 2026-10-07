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
 *   (b) `streaming-precompute.plansNeedingQuestions(root)` — the plans whose questions
 *       have not been generated (missing or stale). The line gives their count and the
 *       human's one way to ask — "Generate its questions" on a plan's decision in
 *       /ctoc:start — and orders nothing: no questions are generated until the human
 *       chooses it (plan "CTOC does no unasked work at session start or stop").
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

/** The longest a single plan name may run in a line before it ends in an ellipsis. */
const NAME_MAX_CHARS = 80;

/** One plan name, cut to NAME_MAX_CHARS characters with a trailing ellipsis. */
function capName(name) {
  const s = String(name);
  return s.length <= NAME_MAX_CHARS ? s : `${s.slice(0, NAME_MAX_CHARS - 1)}…`;
}

/**
 * Cap a list of human names to at most `cap`, then "and K more", and each name to
 * NAME_MAX_CHARS characters. The one place the wall becomes a summary — every group
 * line routes through it, so a plan title of any length cannot grow the session-start
 * text.
 * @param {string[]} names
 * @param {number} [cap]
 * @returns {string}
 */
function summarize(names, cap = NAME_CAP) {
  const n = cap > 0 ? cap : NAME_CAP;
  const shown = names.slice(0, n).map(capName);
  if (names.length <= n) return shown.join(', ');
  return `${shown.join(', ')}, and ${names.length - n} more`;
}

/** A decision descriptor still carries an unresolved fork the human must answer. */
function hasOpenForks(d) {
  return (Array.isArray(d.blockingQuestionIds) && d.blockingQuestionIds.length > 0)
    || (Array.isArray(d.unansweredQuestionIds) && d.unansweredQuestionIds.length > 0);
}

/**
 * A plan is BUILT AND WAITING FOR THE HUMAN'S OK — not one waiting for its questions —
 * when its next move is the final human sign-off and it has no open fork.
 * `toStage === 'done'` is that final edge (only `review → done`); everything else in
 * `plansNeedingQuestions` is a pre-build plan whose questions have not been generated.
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

const MOVED_FORWARD = 'Moved forward on their own — enough was known to proceed without your OK';

/**
 * (a) plans the sufficiency side effect just moved out of a pre-build stage, and the pending
 * list that same call returned (kept for the held line, never a second pass).
 * @returns {{lines: string[], pending: (Array<object>|null)}}
 */
function crossedLines(root, deps) {
  try {
    const before = preBuildSnapshot(root, deps);
    const pending = deps.pendingGateDecisions(root); // sanctioned side effect: sufficiency auto-cross
    const after = preBuildSnapshot(root, deps);
    const crossed = [];
    for (const [ref, name] of before) {
      if (!after.has(ref)) crossed.push(name);
    }
    return { lines: crossed.length ? [`${MOVED_FORWARD}: ${summarize(crossed)}.`] : [], pending: Array.isArray(pending) ? pending : null };
  } catch {
    return { lines: [], pending: null };
  }
}

/**
 * (a') the crossings the continuation already made and handed in — named, never re-derived.
 * A built plan finishing on its checks gets its own line.
 * @param {Array<{toStage:string, name:string}>} crossed
 * @returns {string[]}
 */
function namedCrossedLines(crossed) {
  const done = crossed.filter((c) => c && c.toStage === 'done').map((c) => String(c.name));
  const moved = crossed.filter((c) => c && c.toStage !== 'done').map((c) => String(c.name));
  const lines = [];
  if (moved.length) lines.push(`${MOVED_FORWARD}: ${summarize(moved)}.`);
  if (done.length) lines.push(`Finished on their checks — no question needed you: ${summarize(done)}.`);
  return lines;
}

/**
 * (a'') the plans the owner is holding, from the pending list the directive already has: each
 * stays where it is until he releases it, and is named in no other line.
 * @returns {string[]}
 */
function heldLines(pending, deps) {
  if (!Array.isArray(pending)) return [];
  const names = pending.filter((d) => d && d.sufficiencyReason === 'held').map((d) => deps.humanPlanName(d.title, d.slug));
  return names.length
    ? [`You are holding: ${summarize(names)}. Each stays where it is until you choose Release the hold on it in /ctoc:start.`]
    : [];
}

/**
 * (b) the pending set, SPLIT by what each plan actually needs and each list CAPPED:
 *   - WAITING FOR THEIR QUESTIONS: plans with an open fork, or pre-build plans whose
 *     questions have not been generated — counted, with the human's way to ask. An
 *     EMPTY plan is left out: its screen is the broken-plan screen, with no option to ask.
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
      if (!d || d.sufficiencyReason === 'held') continue; // named in the held line only
      const name = deps.humanPlanName(d.title, d.slug);
      if (!name) continue;
      if (isWaitingForOk(d)) {
        waiting.push({ name, fromStage: d.fromStage });
      } else if (!d.broken) {
        // An EMPTY plan gets the broken-plan screen, which offers no "Generate its
        // questions", so it is not counted as waiting for them.
        working.push({ name, fromStage: d.fromStage });
      }
    }
    const lines = [];
    if (working.length) {
      lines.push(`${working.length} plan(s) wait for their questions — choose "Generate its questions" on a plan's decision in /ctoc:start: ${summarize(working.map((w) => w.name))}.`);
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
    const name = capName(nameForRef(root, head, deps));
    return name ? [`Next up to build: ${name}.`] : [];
  } catch {
    return [];
  }
}

/**
 * Compose the Loop-B directive for `root`. See the module header.
 *
 * With `opts.crossed` (the continuation's crossings, from `stream answer`) the crossed lines
 * name those plans and no crossing pass runs here; the held line then reads `opts.pending`
 * (none given, no held line). Without it — the on-open banner and the session-start status —
 * the directive runs its own pass as before and keeps the pending list that pass returns.
 * @param {string} root - project root
 * @param {{crossed?: Array<object>, pending?: Array<object>}} [opts]
 * @returns {string} a leading-newline directive, or '' when there is nothing to report
 */
function loopBDirective(root, opts = {}) {
  if (typeof root !== 'string' || root.length === 0) return '';
  // buildDeps only requires local modules; a failure there is a broken install, and the
  // sole live caller (src/hooks/SessionStart.js) already wraps this call fail-open. Each
  // of the three source helpers below is independently try/caught for fault isolation.
  const deps = buildDeps();
  const given = opts && Array.isArray(opts.crossed);
  const own = given ? null : crossedLines(root, deps);
  const pending = given ? (Array.isArray(opts.pending) ? opts.pending : null) : own.pending;
  const lines = [
    ...(given ? namedCrossedLines(opts.crossed) : own.lines),
    ...heldLines(pending, deps),
    ...needQuestionLines(root, deps),
    ...nextBuildLines(root, deps),
  ];
  return lines.length ? `\n${lines.join('\n')}` : '';
}

// `summarize` is also the cap the completion's status lines use (menu-screens.continuationText).
module.exports = { loopBDirective, summarize };
