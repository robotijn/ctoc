'use strict';

/**
 * gate-order.js is the SINGLE gate-edge encoding (R5-B).
 *
 * Before R5-B, the three human gate edges were declared THREE times: gate-order's
 * GATE_EDGES, actions.js's `HUMAN_GATES`, and actions.js's `flowMap` (a private
 * duplicate 108 lines from HUMAN_GATES), plus iron-loop-enforcer's literal
 * GATE_DESTINATIONS. Duplicate encodings can silently diverge. These tests pin the
 * derived surface gate-order now exposes so `actions.js` and `iron-loop-enforcer.js`
 * can build their lookups from it — change an edge here and every consumer moves.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const gateOrder = require('../src/lib/gate-order');

describe('gate-order — the single gate-edge encoding', () => {
  it('GATE_EDGES is exactly the three human gate edges, in forward order', () => {
    assert.deepEqual(gateOrder.GATE_EDGES, [
      ['functional', 'implementation'],
      ['implementation', 'todo'],
      ['review', 'done'],
    ]);
  });

  it('GATE_DESTINATIONS is the `to` side of every edge (enforcer derives this)', () => {
    assert.deepEqual(gateOrder.GATE_DESTINATIONS, ['implementation', 'todo', 'done']);
    assert.deepEqual(gateOrder.GATE_DESTINATIONS, gateOrder.GATE_EDGES.map(([, to]) => to));
  });

  it('destinationOf returns the gate destination for a source, undefined otherwise', () => {
    assert.equal(gateOrder.destinationOf('functional'), 'implementation');
    assert.equal(gateOrder.destinationOf('implementation'), 'todo');
    assert.equal(gateOrder.destinationOf('review'), 'done');
    // Non-source stages (including the DESTINATIONS themselves) have no gate.
    assert.equal(gateOrder.destinationOf('todo'), undefined);
    assert.equal(gateOrder.destinationOf('done'), undefined);
    assert.equal(gateOrder.destinationOf('in-progress'), undefined);
    assert.equal(gateOrder.destinationOf('nonsense'), undefined);
  });

  it('isHumanGate is true iff [from,to] is exactly a gate edge', () => {
    assert.equal(gateOrder.isHumanGate('functional', 'implementation'), true);
    assert.equal(gateOrder.isHumanGate('implementation', 'todo'), true);
    assert.equal(gateOrder.isHumanGate('review', 'done'), true);
    // A forward move that spans no single edge is NOT a gate edge.
    assert.equal(gateOrder.isHumanGate('todo', 'in-progress'), false);
    assert.equal(gateOrder.isHumanGate('functional', 'todo'), false); // multi-hop, not an edge
    assert.equal(gateOrder.isHumanGate('review', 'functional'), false); // backward
    assert.equal(gateOrder.isHumanGate('implementation', 'implementation'), false);
  });

  it('every gate destination equals destinationOf(source) — internal consistency', () => {
    for (const [from, to] of gateOrder.GATE_EDGES) {
      assert.equal(gateOrder.destinationOf(from), to);
      assert.equal(gateOrder.isHumanGate(from, to), true);
      assert.ok(gateOrder.GATE_DESTINATIONS.includes(to));
    }
  });

  // R6-B: the INVERSE of GATE_EDGES (destination → source), computed ONCE here so the
  // two former copies (human-gate-check's HUMAN_GATES revert map, approval-ledger's
  // STAGE_SOURCE) derive from this and can never diverge.
  it('GATE_SOURCE is the destination→source inverse of GATE_EDGES', () => {
    assert.deepEqual(gateOrder.GATE_SOURCE, {
      implementation: 'functional',
      todo: 'implementation',
      done: 'review',
    });
    // Structurally the exact inverse of the LIVE GATE_EDGES — a derived surface, not a
    // hand-kept literal: change an edge and this map moves with it.
    assert.deepEqual(
      gateOrder.GATE_SOURCE,
      Object.fromEntries(gateOrder.GATE_EDGES.map(([from, to]) => [to, from])),
    );
  });

  it('sourceOf returns the gate source for a destination, undefined otherwise', () => {
    assert.equal(gateOrder.sourceOf('implementation'), 'functional');
    assert.equal(gateOrder.sourceOf('todo'), 'implementation');
    assert.equal(gateOrder.sourceOf('done'), 'review');
    // Non-destination stages (including the SOURCES themselves) have no gate.
    assert.equal(gateOrder.sourceOf('functional'), undefined);
    assert.equal(gateOrder.sourceOf('review'), undefined);
    assert.equal(gateOrder.sourceOf('in-progress'), undefined);
    assert.equal(gateOrder.sourceOf('nonsense'), undefined);
  });

  it('GATE_SOURCE and sourceOf agree, and round-trip with destinationOf', () => {
    for (const [from, to] of gateOrder.GATE_EDGES) {
      assert.equal(gateOrder.GATE_SOURCE[to], from);
      assert.equal(gateOrder.sourceOf(to), from);
      // Full round-trip: source → destination → back to source.
      assert.equal(gateOrder.sourceOf(gateOrder.destinationOf(from)), from);
    }
  });
});
