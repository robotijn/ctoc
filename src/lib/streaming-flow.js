'use strict';

/**
 * Streaming Topic-Q&A flow — PURE state machine (streaming interaction model, slice 1).
 *
 * This is the load-bearing core of the new streaming build flow that will replace
 * discrete menu navigation. It is intentionally PURE: no I/O, no `fs`, no `require`
 * of anything stateful — only pure functions over a plain state object. This mirrors
 * the reconcile / task-registry pure-core style already in the repo, so it is trivially
 * testable and branch-coverable.
 *
 * DATA SHAPE
 * ----------
 *   FlowState = {
 *     topics:        [Topic],   // ORDERED critical-first (see orderTopics)
 *     topicIndex:    number,    // pointer: index into topics
 *     questionIndex: number,    // pointer: index into topics[topicIndex].questions
 *     answers:       { [key: string]: string }  // "<topicId>/<questionId>" -> chosen
 *                                               //   option key OR free-text comment
 *   }
 *   Topic    = { id, label, critical: boolean, questions: [Question] }
 *   Question = { id, prompt, options: [{ key, label, recommended?: boolean }] }
 *
 * The one guided-flow invariant this slice enforces: topics are presented
 * CRITICAL-FIRST, and within a topic questions are presented in their given order,
 * one at a time, never switching topics mid-stream.
 *
 * FUTURE-SLICE SEAMS (intentionally NOT implemented here — clean attach points):
 *   - batch-approve after ~5-10 recommended-accepts  → attaches around `answer()`
 *     (a caller can batch keys and fold them through `answer` in sequence).
 *   - "next topic" fast-forward                       → a future `skipTopic(state)`
 *     that advances `topicIndex` and resets `questionIndex`, reusing `advancePointer`.
 *   - critical-question-ordering WITHIN a topic       → a future `orderQuestions(topic)`
 *     applied in `initFlow`, mirroring `orderTopics`.
 *   - the real question source                        → the caller supplies `topics`;
 *     `initFlow` is agnostic to where they come from.
 * Keeping the surface minimal now avoids speculative structure.
 */

// --- ordering -------------------------------------------------------------

/**
 * Return topics with all CRITICAL topics first, then non-critical, STABLE within
 * each group (a plain partition preserves input order inside each bucket).
 * @param {Array<object>} topics
 * @returns {Array<object>}
 */
function orderTopics(topics) {
  if (!Array.isArray(topics)) return [];
  const critical = [];
  const rest = [];
  for (const t of topics) {
    if (t && t.critical) critical.push(t);
    else rest.push(t);
  }
  return critical.concat(rest);
}

// --- internal helpers -----------------------------------------------------

/** Does a topic have at least one answerable question? */
function hasQuestions(topic) {
  return !!(topic && Array.isArray(topic.questions) && topic.questions.length > 0);
}

/**
 * From a (topicIndex, questionIndex) pointer, compute the NEXT pointer:
 *   - next question in the same topic if one remains;
 *   - otherwise the first question of the next topic that HAS questions
 *     (empty topics are skipped);
 *   - otherwise a past-the-end pointer (topicIndex === topics.length) meaning "done".
 * Pure — returns a new {topicIndex, questionIndex}.
 * @param {Array<object>} topics
 * @param {number} ti
 * @param {number} qi
 * @returns {{topicIndex: number, questionIndex: number}}
 */
function advancePointer(topics, ti, qi) {
  const t = topics[ti];
  if (t && Array.isArray(t.questions) && qi + 1 < t.questions.length) {
    return { topicIndex: ti, questionIndex: qi + 1 };
  }
  for (let n = ti + 1; n < topics.length; n++) {
    if (hasQuestions(topics[n])) return { topicIndex: n, questionIndex: 0 };
  }
  return { topicIndex: topics.length, questionIndex: 0 };
}

/**
 * The first answerable pointer over an ordered topic list: the first topic that has
 * questions (leading empty topics are skipped), or past-the-end when none do.
 * @param {Array<object>} topics
 * @returns {{topicIndex: number, questionIndex: number}}
 */
function firstAnswerable(topics) {
  for (let n = 0; n < topics.length; n++) {
    if (hasQuestions(topics[n])) return { topicIndex: n, questionIndex: 0 };
  }
  return { topicIndex: topics.length, questionIndex: 0 };
}

// --- construction ---------------------------------------------------------

/**
 * Build a fresh flow state from a raw topic list. Topics are ordered critical-first
 * and the pointer is placed on the first answerable question (skipping any leading
 * topics that carry no questions).
 * @param {Array<object>} topics
 * @returns {object} FlowState
 */
function initFlow(topics) {
  const ordered = orderTopics(topics);
  const { topicIndex, questionIndex } = firstAnswerable(ordered);
  return {
    topics: ordered,
    topicIndex,
    questionIndex,
    answers: {},
  };
}

// --- pointers -------------------------------------------------------------

/**
 * The topic the pointer is on, or null when past the end.
 * @param {object} state FlowState
 * @returns {object|null}
 */
function currentTopic(state) {
  const topics = (state && state.topics) || [];
  const t = topics[state ? state.topicIndex : 0];
  return t || null;
}

/**
 * The question the pointer is on, or null when past the end / on an empty topic.
 * @param {object} state FlowState
 * @returns {object|null}
 */
function currentQuestion(state) {
  const t = currentTopic(state);
  if (!t || !Array.isArray(t.questions)) return null;
  const q = t.questions[state ? state.questionIndex : 0];
  return q || null;
}

/**
 * The key of the question's recommended option, or null when none is marked
 * (or the question is missing).
 * @param {object|null} question
 * @returns {string|null}
 */
function recommendedKey(question) {
  if (!question || !Array.isArray(question.options)) return null;
  const rec = question.options.find(o => o && o.recommended === true);
  return rec ? rec.key : null;
}

// --- transition -----------------------------------------------------------

/**
 * Record an answer for the current question and advance the pointer. PURE — returns
 * a NEW state and never mutates the input (answers is cloned, pointer recomputed).
 * `optionKeyOrComment` is either a chosen option key or a free-text comment string;
 * both are stored verbatim under the "<topicId>/<questionId>" key.
 *
 * When the pointer is already past the end (nothing to answer), this is a no-op that
 * still returns a fresh cloned state (so callers can rely on immutable-update semantics).
 * @param {object} state FlowState
 * @param {string} optionKeyOrComment
 * @returns {object} the next FlowState
 */
function answer(state, optionKeyOrComment) {
  const topics = (state && state.topics) || [];
  const topic = currentTopic(state);
  const question = currentQuestion(state);

  // No-op clone when there is nothing to answer (past the end / empty).
  if (!topic || !question) {
    return {
      topics,
      topicIndex: state ? state.topicIndex : topics.length,
      questionIndex: state ? state.questionIndex : 0,
      answers: Object.assign({}, state && state.answers),
    };
  }

  const key = `${topic.id}/${question.id}`;
  const answers = Object.assign({}, state.answers, { [key]: optionKeyOrComment });
  const { topicIndex, questionIndex } = advancePointer(topics, state.topicIndex, state.questionIndex);
  return { topics, topicIndex, questionIndex, answers };
}

// --- status ---------------------------------------------------------------

/**
 * True when EVERY question across all topics has a recorded answer. Empty topics
 * contribute no questions, so a flow with no questions at all is vacuously complete.
 * @param {object} state FlowState
 * @returns {boolean}
 */
function isComplete(state) {
  const topics = (state && state.topics) || [];
  const answers = (state && state.answers) || {};
  for (const t of topics) {
    if (!hasQuestions(t)) continue;
    for (const q of t.questions) {
      if (!(`${t.id}/${q.id}` in answers)) return false;
    }
  }
  return true;
}

/**
 * Header numbers for the current pointer: which topic (index + count) and which
 * question within that topic (index + count).
 * @param {object} state FlowState
 * @returns {{topicIndex: number, topicCount: number, questionIndex: number, questionCount: number}}
 */
function progress(state) {
  const topics = (state && state.topics) || [];
  const t = topics[state ? state.topicIndex : 0];
  return {
    topicIndex: state ? state.topicIndex : 0,
    topicCount: topics.length,
    questionIndex: state ? state.questionIndex : 0,
    questionCount: hasQuestions(t) ? t.questions.length : 0,
  };
}

module.exports = {
  orderTopics,
  initFlow,
  currentTopic,
  currentQuestion,
  recommendedKey,
  answer,
  isComplete,
  progress,
  // exported for future-slice reuse (fast-forward, batch-approve) and unit testing
  advancePointer,
};
