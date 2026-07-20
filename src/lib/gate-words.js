'use strict';

/**
 * THE RULE: never print a gate number at a human — say what the MOMENT IS.
 *
 * A gate number is an internal code out of CTOC's own documentation. Putting it on a
 * screen assumes the reader carries a numbered map of the pipeline in their head; the
 * owner does not, and being handed one reads as evasive. The stage-directory names
 * (`functional`, `implementation`, `todo`, `review`) are the same class of internal
 * vocabulary and are treated the same way.
 *
 * The numbers and the stage names remain entirely legal in code identifiers, in
 * comments, in file formats, in directory names and in the action strings the menu
 * router consumes. They are forbidden in exactly one place: text a person reads.
 *
 * This module is the ONE encoding of every human-facing phrase for a gate moment.
 * Several surfaces render these moments; four independent phrasings would drift
 * within a month, and a fence over a phrase that lives in four places cannot say
 * which one is canonical.
 *
 * ── Four site types, because four different jobs ──────────────────────────────
 *   moment       the status line above the plan — orients, asks nothing
 *   question     the sentence asked — asks ONE thing about THIS plan
 *   chip         the header label on the choice — fits in roughly twelve characters
 *   approveLabel the affirmative option's label — answers the question in the
 *                human's own words
 *
 * Pasting one sentence into all four produces a screen that reads like a form
 * letter, so each site carries its own phrasing of the same meaning.
 *
 * ── Totality ─────────────────────────────────────────────────────────────────
 * Every export is TOTAL: an unknown or non-string stage yields a neutral,
 * grammatical fallback. A vocabulary module that throws would take down the very
 * screen it exists to word, and one that renders `undefined` at a human would be a
 * worse failure than the one being fixed.
 *
 * ── Deliberately NOT dependent on gate-order ─────────────────────────────────
 * `gate-order` encodes the pipeline's stage ORDER, which is a technical fact. This
 * module encodes what to SAY, which is a human fact. Coupling them would make a copy
 * edit look like a pipeline change.
 *
 * There is no numeric field anywhere below, and no function that returns one. A
 * number that does not exist cannot leak onto a screen.
 */

/**
 * The vocabulary, keyed by the stage a plan is sitting in when the human is asked.
 * `toStage` is the machine identifier for the destination — it belongs in action
 * strings, never in rendered text.
 */
const EDGES = Object.freeze({
  review: Object.freeze({
    toStage: 'done',
    moment: 'nothing is finished until you say so',
    chip: 'Finished?',
    approveLabel: 'Yes — it’s finished',
    question: (name) => `Is “${name}” finished?`,
  }),
  implementation: Object.freeze({
    toStage: 'todo',
    moment: 'nothing gets built until you say build it',
    chip: 'Build it?',
    approveLabel: 'Yes — build it',
    question: (name) => `Shall I build “${name}”?`,
  }),
  functional: Object.freeze({
    toStage: 'implementation',
    moment: 'no idea becomes a build plan until you agree it’s the thing to build',
    chip: 'Build this?',
    approveLabel: 'Yes — that’s the thing to build',
    question: (name) => `Is “${name}” the thing to build?`,
  }),
  vision: Object.freeze({
    toStage: 'functional',
    moment: 'no idea gets chased until you say it’s the right idea',
    chip: 'Right idea?',
    approveLabel: 'Yes — it’s the right idea',
    question: (name) => `Is “${name}” the right idea?`,
  }),
});

/** The edge for `fromStage`, or null when there is no such edge. */
function edgeFor(fromStage) {
  if (typeof fromStage !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(EDGES, fromStage) ? EDGES[fromStage] : null;
}

/**
 * The status-line phrase: what the pause at this moment IS.
 *
 * An unknown stage returns the empty string, and the caller then renders the header
 * with no moment line — degraded, but honest. It never invents a moment for an edge
 * it does not know.
 *
 * @param {string} fromStage
 * @returns {string}
 */
function moment(fromStage) {
  const edge = edgeFor(fromStage);
  return edge ? edge.moment : '';
}

/**
 * The question sentence, naming the plan the way a human would say it.
 *
 * `name` arrives ALREADY SANITISED by the caller's `stripCtl` — this module does not
 * re-sanitise, deliberately: one sanitiser, at the render boundary. A second, weaker
 * one here would be a place for the two to disagree.
 *
 * An unknown stage still produces a real question with a real answer, rather than a
 * fabricated sentence about a moment that may not exist.
 *
 * @param {string} fromStage
 * @param {string} name the plan's human name (its title)
 * @returns {string}
 */
function question(fromStage, name) {
  const safe = typeof name === 'string' ? name : '';
  const edge = edgeFor(fromStage);
  if (edge) return edge.question(safe);
  return `What should happen to “${safe}”?`;
}

/**
 * The short header label on the choice. At most twelve characters, because that is
 * what the header on a question renders without truncating.
 *
 * @param {string} fromStage
 * @returns {string}
 */
function chip(fromStage) {
  const edge = edgeFor(fromStage);
  return edge ? edge.chip : 'Decision';
}

/**
 * The affirmative option's label — the human's own answer to the question above it,
 * never a verb out of the pipeline's vocabulary.
 *
 * @param {string} fromStage
 * @returns {string}
 */
function approveLabel(fromStage) {
  const edge = edgeFor(fromStage);
  return edge ? edge.approveLabel : 'Yes';
}

/**
 * The two ways finished work can be sent back, named by WHAT IS WRONG — the thing,
 * or the way — which is the choice the human is actually making. `toStage` carries
 * the machine identifier for the action string; `label` and `description` carry the
 * words a person reads, and neither of them names a stage.
 */
const SEND_BACK = Object.freeze([
  Object.freeze({
    label: 'Send it back — wrong thing',
    description: 'The requirements are wrong. It goes back to be re-thought before anyone builds it again.',
    toStage: 'functional',
  }),
  Object.freeze({
    label: 'Send it back — wrong way',
    description: 'The requirements are right; the technical approach is wrong. It goes back to be re-planned.',
    toStage: 'implementation',
  }),
]);

module.exports = {
  EDGES,
  moment,
  question,
  chip,
  approveLabel,
  SEND_BACK,
};
