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
 *   Question = { id, prompt, critical?: boolean, important?: boolean,
 *                options: [{ key, label, recommended?: boolean }] }
 *
 * QUESTION TIERS (this slice)
 * ---------------------------
 * A Question carries an OPTIONAL severity tier via two flags:
 *   - `critical: true`   → highest severity (a load-bearing decision the human must
 *                          confront first; NOT batchable with the non-critical tail);
 *   - `important: true`  → middle severity;
 *   - neither flag        → NORMAL (the default; fully backward-compatible — pre-tier
 *                          questions have no flags and behave exactly as before).
 * `critical` OUTRANKS `important` when both are set. Within a topic, questions are
 * presented CRITICAL → IMPORTANT → NORMAL (see `orderQuestions`), one at a time, so
 * the human "always goes through the critical issues first, then the important ones".
 * The batch-approve mechanic that skips only the NON-critical tail is a later slice;
 * this slice establishes the ordering + surfacing so criticals naturally come first.
 *
 * The one guided-flow invariant this slice enforces: topics are presented
 * CRITICAL-FIRST, questions WITHIN a topic are presented CRITICAL-FIRST (then
 * important, then normal), one at a time, never switching topics mid-stream.
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

/**
 * The severity tier of a question: 'critical' | 'important' | 'normal'.
 * `critical` OUTRANKS `important`; a question with neither flag (or a
 * null/undefined question) is 'normal'.
 * @param {object|null} question
 * @returns {'critical'|'important'|'normal'}
 */
function questionTier(question) {
  if (question && question.critical) return 'critical';
  if (question && question.important) return 'important';
  return 'normal';
}

/**
 * Return questions ordered CRITICAL first, then IMPORTANT, then NORMAL, STABLE
 * within each tier (source order preserved inside a tier). Pure — a new array over
 * the same question references; never mutates the input. Tolerates non-arrays → [].
 * @param {Array<object>} questions
 * @returns {Array<object>}
 */
function orderQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  const critical = [];
  const important = [];
  const normal = [];
  for (const q of questions) {
    const tier = questionTier(q);
    if (tier === 'critical') critical.push(q);
    else if (tier === 'important') important.push(q);
    else normal.push(q);
  }
  return critical.concat(important, normal);
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

/**
 * The pointer of the FIRST question (in presentation order) that has no recorded
 * answer, scanning every topic/question, or past-the-end when all are answered.
 * Used by `batchApprove` to land the pointer on the next thing the human must see
 * (a still-open critical, a no-recommended question, or the next topic). Pure.
 * @param {Array<object>} topics
 * @param {object} answers
 * @returns {{topicIndex: number, questionIndex: number}}
 */
function nextUnansweredPointer(topics, answers) {
  for (let ti = 0; ti < topics.length; ti++) {
    const t = topics[ti];
    if (!hasQuestions(t)) continue;
    for (let qi = 0; qi < t.questions.length; qi++) {
      if (!(`${t.id}/${t.questions[qi].id}` in answers)) {
        return { topicIndex: ti, questionIndex: qi };
      }
    }
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
  // Order topics critical-first, then order EACH topic's questions critical-first.
  // Pure: build a NEW topic object with a NEW (ordered) questions array so the caller's
  // input topics/questions are never mutated. Topics with no questions array pass through
  // untouched (backward-compatible with directly-constructed states).
  const ordered = orderTopics(topics).map(t =>
    (t && Array.isArray(t.questions))
      ? Object.assign({}, t, { questions: orderQuestions(t.questions) })
      : t
  );
  const { topicIndex, questionIndex } = firstAnswerable(ordered);
  return {
    topics: ordered,
    topicIndex,
    questionIndex,
    answers: {},
    // Streak of consecutive RECOMMENDED picks on NON-critical questions. Drives the
    // batch-approve offer (see `batchAvailable`). Reset by any non-recommended pick,
    // a comment, or answering a critical question.
    recommendedStreak: 0,
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
  const prevStreak = (state && typeof state.recommendedStreak === 'number') ? state.recommendedStreak : 0;

  // No-op clone when there is nothing to answer (past the end / empty).
  if (!topic || !question) {
    return {
      topics,
      topicIndex: state ? state.topicIndex : topics.length,
      questionIndex: state ? state.questionIndex : 0,
      answers: Object.assign({}, state && state.answers),
      recommendedStreak: prevStreak,
    };
  }

  const key = `${topic.id}/${question.id}`;
  const answers = Object.assign({}, state.answers, { [key]: optionKeyOrComment });
  // Streak: increment only when the chosen key is the recommended option AND the
  // question is NON-critical (important or normal). Any other case — a
  // non-recommended pick, a free-text comment, or a critical question — resets it.
  const tookRecommended = optionKeyOrComment === recommendedKey(question);
  const nonCritical = questionTier(question) !== 'critical';
  const recommendedStreak = (tookRecommended && nonCritical) ? prevStreak + 1 : 0;
  const { topicIndex, questionIndex } = advancePointer(topics, state.topicIndex, state.questionIndex);
  return { topics, topicIndex, questionIndex, answers, recommendedStreak };
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

/**
 * Number of UNANSWERED critical questions in a given topic. "Answered" uses the same
 * `<topicId>/<questionId>` keying as `answer()`. A missing topic / one with no
 * questions array contributes 0. Pure.
 * @param {object} state FlowState
 * @param {object|null} topic
 * @returns {number}
 */
function topicCriticalOpenCount(state, topic) {
  const answers = (state && state.answers) || {};
  if (!topic || !Array.isArray(topic.questions)) return 0;
  let n = 0;
  for (const q of topic.questions) {
    if (questionTier(q) === 'critical' && !(`${topic.id}/${q.id}` in answers)) n++;
  }
  return n;
}

/**
 * Number of UNANSWERED critical questions in the CURRENT topic — the count behind the
 * "⚠ N critical open" header. 0 when past the end / on a topic with no criticals. Pure.
 * @param {object} state FlowState
 * @returns {number}
 */
function criticalOpenCount(state) {
  return topicCriticalOpenCount(state, currentTopic(state));
}

// --- batch-approve --------------------------------------------------------

/**
 * Default streak length that unlocks the batch-approve offer. The owner's rule puts
 * this in the 5–10 range ("after choosing the recommended action 5-10 times"); 5 is
 * the low end so the offer surfaces as early as the rule allows. A caller may pass an
 * explicit threshold to `batchAvailable` (tests use a small one for determinism).
 * @type {number}
 */
const DEFAULT_BATCH_THRESHOLD = 5;

/**
 * The remaining UNANSWERED, NON-critical questions in the CURRENT topic that HAVE a
 * recommended option — exactly the set a batch-approve can auto-answer. Criticals are
 * excluded (answered individually, first); a non-critical with no recommended option
 * cannot be auto-answered and is excluded too (the human must pick it). Order follows
 * the topic's presentation order. Returns [] past-the-end / for a null state / when the
 * current topic has no questions array. Pure.
 * @param {object} state FlowState
 * @returns {Array<object>}
 */
function pendingBatchQuestions(state) {
  const topic = currentTopic(state);
  const answers = (state && state.answers) || {};
  if (!topic || !Array.isArray(topic.questions)) return [];
  return topic.questions.filter(q =>
    q &&
    questionTier(q) !== 'critical' &&
    !(`${topic.id}/${q.id}` in answers) &&
    recommendedKey(q) !== null
  );
}

/**
 * True iff the batch-approve offer should be surfaced: the recommended streak has
 * reached `threshold` AND there is at least one pending non-critical question with a
 * recommended option to approve. Pure.
 * @param {object} state FlowState
 * @param {number} [threshold=DEFAULT_BATCH_THRESHOLD]
 * @returns {boolean}
 */
function batchAvailable(state, threshold = DEFAULT_BATCH_THRESHOLD) {
  const streak = (state && typeof state.recommendedStreak === 'number') ? state.recommendedStreak : 0;
  return streak >= threshold && pendingBatchQuestions(state).length > 0;
}

/**
 * Approve every `pendingBatchQuestions` item at once: record each one's recommended
 * option key under "<topicId>/<questionId>", then advance the pointer to the next
 * UNANSWERED question (a still-open critical, a no-recommended question, or the first
 * question of the next topic — whichever comes first). Criticals and no-recommended
 * questions are left untouched for the human. The recommended streak carries forward
 * unchanged (the next critical answer resets it). PURE — returns a NEW state, never
 * mutates the input. A past-the-end / empty flow is a no-op clone.
 * @param {object} state FlowState
 * @returns {object} the next FlowState
 */
function batchApprove(state) {
  const topics = (state && state.topics) || [];
  const topic = currentTopic(state);
  const pending = pendingBatchQuestions(state);
  const answers = Object.assign({}, state && state.answers);
  for (const q of pending) {
    answers[`${topic.id}/${q.id}`] = recommendedKey(q);
  }
  const { topicIndex, questionIndex } = nextUnansweredPointer(topics, answers);
  const recommendedStreak = (state && typeof state.recommendedStreak === 'number') ? state.recommendedStreak : 0;
  return { topics, topicIndex, questionIndex, answers, recommendedStreak };
}

// --- next-topic fast-forward ----------------------------------------------

/**
 * True iff the human may fast-forward past the CURRENT topic's remaining questions
 * to the next topic: there IS a next topic (the pointer is not on the last topic or
 * past the end) AND the current topic has NO unanswered critical question. The
 * owner's rule: "you understand this part well enough, next topic" — but criticals
 * come first and must be resolved, so a still-open critical always blocks it. Pure;
 * false for a null/undefined state, an empty flow, the last topic, or any open
 * critical.
 * @param {object} state FlowState
 * @returns {boolean}
 */
function canFastForward(state) {
  const topics = (state && state.topics) || [];
  const ti = state ? state.topicIndex : 0;
  // No next topic when the pointer is on the last topic or already past the end
  // (topics.length - 1 is -1 for an empty flow, so an empty flow is false too).
  if (ti >= topics.length - 1) return false;
  return criticalOpenCount(state) === 0;
}

/**
 * Fast-forward to the FIRST answerable question of the NEXT topic (skipping any
 * empty topics in between), intentionally leaving the current topic's remaining
 * NON-critical questions unanswered — the human declared the topic understood
 * enough. `recommendedStreak` is RESET to 0 because a new topic is a fresh context
 * (the batch-approve streak must not carry over and wrongly offer a batch on the new
 * topic's first question). When there is no answerable next topic (the pointer is on
 * the last topic, past the end, or every following topic is empty), this is a no-op
 * clone that preserves the pointer, answers, and streak. PURE — returns a NEW state
 * and never mutates the input; the current topic's recorded answers are copied as-is.
 * @param {object} state FlowState
 * @returns {object} the next FlowState
 */
function nextTopic(state) {
  const topics = (state && state.topics) || [];
  const ti = state ? state.topicIndex : 0;
  const answers = Object.assign({}, state && state.answers);
  // First topic strictly AFTER the current one that has answerable questions.
  let target = null;
  for (let n = ti + 1; n < topics.length; n++) {
    if (hasQuestions(topics[n])) { target = { topicIndex: n, questionIndex: 0 }; break; }
  }
  if (!target) {
    // No next answerable topic → no-op clone (pointer + streak preserved).
    return {
      topics,
      topicIndex: ti,
      questionIndex: state ? state.questionIndex : 0,
      answers,
      recommendedStreak: (state && typeof state.recommendedStreak === 'number') ? state.recommendedStreak : 0,
    };
  }
  return {
    topics,
    topicIndex: target.topicIndex,
    questionIndex: target.questionIndex,
    answers,
    recommendedStreak: 0, // fresh context on the new topic
  };
}

module.exports = {
  orderTopics,
  orderQuestions,
  questionTier,
  initFlow,
  currentTopic,
  currentQuestion,
  recommendedKey,
  answer,
  isComplete,
  progress,
  criticalOpenCount,
  topicCriticalOpenCount,
  DEFAULT_BATCH_THRESHOLD,
  pendingBatchQuestions,
  batchAvailable,
  batchApprove,
  canFastForward,
  nextTopic,
  // exported for future-slice reuse (fast-forward, batch-approve) and unit testing
  advancePointer,
  nextUnansweredPointer,
};
