'use strict';
/**
 * CTOC routing reminder — the decision behind the per-request UserPromptSubmit
 * hook (Part One of plan 00072).
 *
 * On every human prompt in a CTOC project, decide whether to inject a short
 * routing line ("route this work through CTOC") and/or a live pipeline-state
 * block into the model's context. It is mostly SILENT by design: repeating
 * identical text every prompt burns context and gets tuned out, so two
 * independent quiet gates apply and the default output is '' (say nothing).
 *
 * This module NEVER throws — every internal failure degrades to '' — because its
 * one caller is a UserPromptSubmit hook that must never break the human's prompt.
 *
 * IMPORTANT HAZARD: state is read ONLY from `state.getPlanCounts` (pure, memoized,
 * per-stage counts). It must NEVER call `streaming-gate.pendingGateDecisions`,
 * which CROSSES qualifying gates as a side effect before listing — running that on
 * the once-per-prompt path would fire gate-crossing machinery on the hottest path
 * in the system. This module does not require `streaming-gate` at all.
 *
 * `.claude-plugin/hooks.json` is the install-and-update wiring: Claude Code reads a
 * plugin's hook registrations from it on every fresh install, and `/ctoc:update`
 * syncs it. There is no installer code to hunt for.
 */

const path = require('path');
const safeFs = require('./safe-fs');

let state = null;
try { state = require('./state'); } catch { state = null; }
let detector = null;
try { detector = require('./ctoc-project-detector'); } catch { detector = null; }
let escapePhrases = null;
try { escapePhrases = require('./escape-phrases'); } catch { escapePhrases = null; }

/** Verbs that read as a request to CHANGE the codebase (plan-declared set). */
const WORK_RE =
  /\b(?:build|add|fix|implement|change|refactor|write|remove|update|rename|migrate|wire)\b/i;

/** Stages whose counts make up the live-state fingerprint, in a fixed order. */
const STATE_KEYS = ['inProgress', 'todo', 'implementation', 'review', 'functional', 'canvas'];

/** Session keys that must never be trusted (prototype pollution). */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MEMO_MAX_SESSIONS = 20;
const SESSION_ID_MAX = 200;

function memoPath(root) {
  return path.join(root, '.ctoc', 'state', 'routing-reminder.json');
}

/**
 * Whether a prompt reads as a request to change the codebase, vs a question.
 * Word-bounded, case-insensitive, deliberately permissive: a false positive costs
 * a few lines of injected context, never a block.
 * @param {string} prompt
 * @returns {boolean}
 */
function looksLikeWorkRequest(prompt) {
  return typeof prompt === 'string' && WORK_RE.test(prompt);
}

/**
 * Live pipeline state, read ONLY from the pure, memoized state.getPlanCounts.
 * Fail-soft: any error yields all zeros.
 * @param {string} root
 * @returns {{inProgress:number, todo:number, implementation:number, review:number,
 *            functional:number, canvas:number}}
 */
function collectState(root) {
  const zero = { inProgress: 0, todo: 0, implementation: 0, review: 0, functional: 0, canvas: 0 };
  if (!state || typeof state.getPlanCounts !== 'function') return zero;
  try {
    const c = state.getPlanCounts(root) || {};
    return {
      inProgress: c.inProgress || 0,
      todo: c.todo || 0,
      implementation: c.implementation || 0,
      review: c.review || 0,
      functional: c.functional || 0,
      canvas: c.canvas || 0,
    };
  } catch {
    return zero;
  }
}

/**
 * A stable, order-independent fingerprint of the live state. '' when nothing is
 * live (every counted stage is zero).
 * @param {object} st
 * @returns {string}
 */
function fingerprint(st) {
  if (STATE_KEYS.every((k) => !st[k])) return '';
  return STATE_KEYS.map((k) => `${k}:${st[k] || 0}`).join('|');
}

/** The constant routing directive text. @returns {string} */
function buildRoutingDirective() {
  return [
    '## CTOC routing — this project runs its work through CTOC',
    '',
    'This request looks like work (build, change, fix, add). No CTOC plan is currently',
    'driving it. Before editing any file:',
    '',
    '1. Run /ctoc:start and create or activate a plan whose `files:` list covers what you',
    '   are about to touch. Edits to files no active plan covers are BLOCKED by the',
    '   PreToolUse hook — the write will be denied, not warned about.',
    '2. Use CTOC\'s own agents for pipeline work: vision-advisor, product-owner,',
    '   implementation-planner, iron-loop-executor, iron-loop-critic, and the review',
    '   fleet. Handing a step\'s work to an agent that does not own it is refused at',
    '   dispatch.',
    '3. Do not cross a human gate. vision->functional, functional->implementation,',
    '   implementation->todo and review->done are the human\'s decisions, not yours.',
    '4. If a load-bearing decision is missing, ask the human before building. An',
    '   unanswered question is a red flag; a guess dressed up as a decision is worse.',
    '',
    'If this change is genuinely too small for a plan, say so plainly and let the human',
    'type an escape phrase. Do not route around the pipeline silently.',
  ].join('\n');
}

/**
 * The live-state block. Emits only lines that are true; '' when every count is zero.
 * @param {object} st
 * @returns {string}
 */
function buildStateBlock(st) {
  const lines = [];
  if (st.inProgress > 0) lines.push(`- In progress: ${st.inProgress} plan${st.inProgress === 1 ? '' : 's'}`);
  if (st.todo > 0) lines.push(`- Todo queue: ${st.todo} plan${st.todo === 1 ? '' : 's'} ready to build`);
  if (st.implementation > 0 || st.review > 0) {
    lines.push(`- Awaiting a gate decision: ${st.implementation} in implementation, ${st.review} in review`);
  }
  if (lines.length === 0) return '';
  return ['## CTOC pipeline state', '', ...lines, '', 'Open /ctoc:start to see which decisions are open and answer them.'].join('\n');
}

function normalizeSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  if (FORBIDDEN_KEYS.has(sessionId)) return null;
  return sessionId.slice(0, SESSION_ID_MAX);
}

function readStore(root) {
  try {
    const p = memoPath(root);
    if (!safeFs.existsSync(p)) return null;
    const parsed = JSON.parse(safeFs.readFileSync(p, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    // Rebuild onto a null-prototype object, dropping any polluting keys.
    const clean = Object.create(null);
    for (const k of Object.keys(parsed)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      clean[k] = parsed[k];
    }
    return clean;
  } catch {
    return null;
  }
}

/**
 * Read the per-session memo. Fail-soft: missing/unreadable/malformed → null.
 * @param {string} root
 * @param {string} sessionId
 * @returns {{fingerprint:string, directiveInProgress:number|null}|null}
 */
function readMemo(root, sessionId) {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return null;
  const store = readStore(root);
  if (!store) return null;
  const entry = store[sid];
  if (!entry || typeof entry !== 'object') return null;
  return {
    fingerprint: typeof entry.fingerprint === 'string' ? entry.fingerprint : '',
    directiveInProgress: typeof entry.directiveInProgress === 'number' ? entry.directiveInProgress : null,
  };
}

/**
 * Write the per-session memo, pruning to the 20 most recently written sessions.
 * Fail-soft: returns false on any failure. Never throws.
 * @param {string} root
 * @param {string} sessionId
 * @param {{fingerprint:string, directiveInProgress:number|null}} memo
 * @returns {boolean}
 */
function writeMemo(root, sessionId, memo) {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return false;
  try {
    const store = readStore(root) || Object.create(null);
    // Monotonic stamp: strictly greater than every existing entry, so the
    // most-recently-written session always sorts newest and eviction is
    // DETERMINISTIC even when Date.now() ties (same-millisecond writes) or the
    // wall clock is coarse or moves backward.
    let maxTs = 0;
    for (const k of Object.keys(store)) {
      const t = store[k] && typeof store[k].ts === 'number' ? store[k].ts : 0;
      if (t > maxTs) maxTs = t;
    }
    store[sid] = {
      fingerprint: typeof memo.fingerprint === 'string' ? memo.fingerprint : '',
      directiveInProgress: typeof memo.directiveInProgress === 'number' ? memo.directiveInProgress : null,
      ts: Math.max(Date.now(), maxTs + 1),
    };
    // Prune to the most-recent MEMO_MAX_SESSIONS by timestamp.
    const keys = Object.keys(store);
    if (keys.length > MEMO_MAX_SESSIONS) {
      keys.sort((a, b) => (store[b].ts || 0) - (store[a].ts || 0));
      const pruned = Object.create(null);
      for (const k of keys.slice(0, MEMO_MAX_SESSIONS)) pruned[k] = store[k];
      const dir = path.dirname(memoPath(root));
      safeFs.mkdirSync(dir, { recursive: true });
      safeFs.writeFileSync(memoPath(root), JSON.stringify(pruned), 'utf8');
      return true;
    }
    const dir = path.dirname(memoPath(root));
    safeFs.mkdirSync(dir, { recursive: true });
    safeFs.writeFileSync(memoPath(root), JSON.stringify(store), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * The whole decision. NEVER THROWS — every internal failure degrades to
 * { text:'', directive:false, state:false, reason:'error' }.
 * @param {{root?:string, prompt?:string, sessionId?:string}} [opts]
 * @returns {{text:string, directive:boolean, state:boolean, reason:string}}
 *   reason ∈ 'not-ctoc' | 'escape-phrase' | 'not-work' | 'already-driving'
 *          | 'directive' | 'state' | 'directive+state' | 'error'
 */
function buildReminder({ root, prompt, sessionId } = {}) {
  try {
    if (!detector || !detector.isCtocProject(root).isCtoc) {
      return { text: '', directive: false, state: false, reason: 'not-ctoc' };
    }
    if (escapePhrases && typeof escapePhrases.matchEscapePhrase === 'function'
      && escapePhrases.matchEscapePhrase(typeof prompt === 'string' ? prompt : '')) {
      return { text: '', directive: false, state: false, reason: 'escape-phrase' };
    }

    const work = looksLikeWorkRequest(prompt);
    const st = collectState(root);
    const fp = fingerprint(st);
    const memo = readMemo(root, sessionId);

    const directiveFires = work
      && (st.inProgress === 0 || !memo || memo.directiveInProgress !== st.inProgress);
    const stateFires = fp !== '' && (!memo || memo.fingerprint !== fp);

    const parts = [];
    if (directiveFires) parts.push(buildRoutingDirective());
    if (stateFires) parts.push(buildStateBlock(st));
    const text = parts.join('\n\n');

    if (directiveFires || stateFires) {
      writeMemo(root, sessionId, {
        fingerprint: stateFires ? fp : (memo ? memo.fingerprint : ''),
        directiveInProgress: directiveFires ? st.inProgress : (memo ? memo.directiveInProgress : null),
      });
    }

    let reason;
    if (directiveFires && stateFires) reason = 'directive+state';
    else if (directiveFires) reason = 'directive';
    else if (stateFires) reason = 'state';
    else if (!work) reason = 'not-work';
    else reason = 'already-driving';

    return { text, directive: directiveFires, state: stateFires, reason };
  } catch {
    return { text: '', directive: false, state: false, reason: 'error' };
  }
}

module.exports = {
  looksLikeWorkRequest, collectState, fingerprint,
  buildRoutingDirective, buildStateBlock, readMemo, writeMemo, buildReminder,
};
