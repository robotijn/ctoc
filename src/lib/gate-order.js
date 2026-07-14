'use strict';

/**
 * Order-based human-gate crossing detection (finding H2, W02-s4).
 *
 * CTOC has six plan stages in a fixed forward order and three human gate edges.
 * A move is a HUMAN-GATE CROSSING iff it is FORWARD along the stage order and its
 * span covers at least one gate edge — this catches single-hop AND multi-hop moves
 * (e.g. in-progress -> done skips the review -> done gate, functional -> todo skips
 * both the functional -> implementation and implementation -> todo gates). Backward
 * (revert) moves and forward moves that span no gate edge are NOT crossings.
 *
 * This module is the single source of truth for that rule; `move-plan.js` (the
 * untrusted CLI executor agents invoke from Bash) consults it. It deliberately does
 * NOT live inside the low-level `movePlan()` in actions.js, because `approvePlan()`
 * calls `movePlan()` to cross a gate LEGITIMATELY after stamping approval.
 */

// Stage order — index === order. functional(0) < implementation(1) < todo(2) <
// in-progress(3) < review(4) < done(5).
const STAGE_ORDER = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

// The three human gate edges, each expressed as [from, to] adjacent stages.
const GATE_EDGES = [
  ['functional', 'implementation'],
  ['implementation', 'todo'],
  ['review', 'done'],
];

// Precomputed stage -> order index map, so `crossesHumanGate` allocates nothing and
// runs in O(number of gate edges) on the hot path.
const ORDER_INDEX = new Map(STAGE_ORDER.map((stage, index) => [stage, index]));

// Gate edges precomputed to their [g0, g1] order-index pairs (all edges are known
// stages, so no undefined can appear here).
const GATE_EDGE_ORDERS = GATE_EDGES.map(([g0, g1]) => [ORDER_INDEX.get(g0), ORDER_INDEX.get(g1)]);

/**
 * Does moving a plan from stage `from` to stage `to` cross a human gate?
 *
 * A crossing requires BOTH:
 *   1. the move is FORWARD:  order[from] < order[to]; and
 *   2. some gate edge (g0 -> g1) is spanned:  order[from] <= order[g0]
 *      AND order[to] >= order[g1].
 *
 * Worked examples:
 *   crossesHumanGate('in-progress', 'done')  -> true  (spans review->done: 3<=4, 5>=5)
 *   crossesHumanGate('functional', 'todo')   -> true  (spans functional->implementation)
 *   crossesHumanGate('review', 'done')       -> true  (adjacent gate)
 *   crossesHumanGate('todo', 'in-progress')  -> false (forward, spans no gate edge)
 *   crossesHumanGate('review', 'functional') -> false (backward revert)
 *
 * Fail-open on unknown stages (returns false): `move-plan.js` validates both stages
 * against VALID_STAGES before ever calling this, so an unknown stage never reaches a
 * real move.
 *
 * @param {string} from - source stage name
 * @param {string} to   - destination stage name
 * @returns {boolean} true iff the move crosses one or more human gate edges
 */
function crossesHumanGate(from, to) {
  const fromOrder = ORDER_INDEX.get(from);
  const toOrder = ORDER_INDEX.get(to);

  // Unknown stage, or not a forward move -> never a gate crossing.
  if (fromOrder === undefined || toOrder === undefined || fromOrder >= toOrder) {
    return false;
  }

  for (const [g0, g1] of GATE_EDGE_ORDERS) {
    if (fromOrder <= g0 && toOrder >= g1) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// R5-B: the ONE gate-edge encoding. `actions.js` (approvePlan's flow lookup and its
// human-gate map) and `iron-loop-enforcer.js` (its GATE_DESTINATIONS) derive from
// the surfaces below, so the three edges are declared ONCE — change GATE_EDGES and
// every consumer moves. Previously the same three edges were duplicated as
// actions.js:`HUMAN_GATES`, actions.js:`flowMap`, and the enforcer's literal
// GATE_DESTINATIONS; duplicate encodings can silently diverge.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The gate DESTINATION stages (the `to` side of each edge):
 * `['implementation', 'todo', 'done']`. `iron-loop-enforcer.js` derives its
 * GATE_DESTINATIONS from this.
 */
const GATE_DESTINATIONS = GATE_EDGES.map(([, to]) => to);

/**
 * Destination stage of the human gate whose SOURCE is `from`, or `undefined` when
 * `from` is not a gate source (including the destination stages themselves).
 *
 * @param {string} from - a stage name
 * @returns {string|undefined} the gate destination, or undefined
 */
function destinationOf(from) {
  const edge = GATE_EDGES.find(([g0]) => g0 === from);
  return edge ? edge[1] : undefined;
}

/**
 * Is `[from, to]` exactly one of the three human gate edges? (Adjacent single-edge
 * membership — NOT the span-based `crossesHumanGate`, which also catches multi-hop
 * skips. `approvePlan` uses THIS to flag a single legitimate crossing.)
 *
 * @param {string} from - source stage name
 * @param {string} to - destination stage name
 * @returns {boolean}
 */
function isHumanGate(from, to) {
  return GATE_EDGES.some(([g0, g1]) => g0 === from && g1 === to);
}

// ─────────────────────────────────────────────────────────────────────────────
// R6-B: the INVERSE of the gate edges — destination → source — computed ONCE here.
// `human-gate-check.js` (its revert map, formerly the local literal `HUMAN_GATES`)
// and `approval-ledger.js` (a backfilled entry's `stage_from`, formerly the local
// literal `STAGE_SOURCE`) now DERIVE from `GATE_SOURCE`, so the inverse is declared
// exactly once — change `GATE_EDGES` and both consumers move. Two hand-kept inverse
// copies could silently diverge from the forward edges; this closes that.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The gate SOURCE map, `destination -> source` — the exact inverse of `GATE_EDGES`:
 * `{ implementation:'functional', todo:'implementation', done:'review' }`. Derived,
 * never a literal, so it cannot drift from the forward edges.
 */
const GATE_SOURCE = Object.fromEntries(GATE_EDGES.map(([from, to]) => [to, from]));

/**
 * Source stage of the human gate whose DESTINATION is `to`, or `undefined` when `to`
 * is not a gate destination (including the source stages themselves). The inverse
 * counterpart of {@link destinationOf}.
 *
 * @param {string} to - a stage name
 * @returns {string|undefined} the gate source, or undefined
 */
function sourceOf(to) {
  const edge = GATE_EDGES.find(([, g1]) => g1 === to);
  return edge ? edge[0] : undefined;
}

module.exports = {
  STAGE_ORDER,
  GATE_EDGES,
  GATE_DESTINATIONS,
  GATE_SOURCE,
  crossesHumanGate,
  destinationOf,
  sourceOf,
  isHumanGate,
};
