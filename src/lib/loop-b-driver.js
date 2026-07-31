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

/** Wire the three composed sources + the plan readers. Its require failure fails open. */
function buildDeps() {
  const state = require('./state');
  const { pendingGateDecisions, humanPlanName } = require('./streaming-gate');
  const { plansNeedingQuestions } = require('./streaming-precompute');
  const { nextBuildable } = require('./continuation-queue');
  return {
    getPlansDir: state.getPlansDir,
    readPlans: state.readPlans,
    parseMetadata: state.parseMetadata,
    humanPlanName,
    pendingGateDecisions,
    plansNeedingQuestions,
    nextBuildable,
  };
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
      ? [`Moved forward on their own — enough was known to proceed without your OK: ${crossed.join(', ')}.`]
      : [];
  } catch {
    return [];
  }
}

/** (b) plans whose decision questions still need generating. */
function needQuestionLines(root, deps) {
  try {
    const needing = deps.plansNeedingQuestions(root);
    if (!Array.isArray(needing) || !needing.length) return [];
    const names = needing.map((d) => d && nameForRef(root, d.ref, deps)).filter(Boolean);
    return names.length ? [`Still working out what to ask you about: ${names.join(', ')}.`] : [];
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
