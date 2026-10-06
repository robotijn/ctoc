'use strict';

/**
 * The pre-mortem critic keeps every order it had before it was compacted.
 *
 * `tests/compaction-eval/premortem-critic/baseline-agent.md` is the agent byte for byte as
 * it stood before compaction (commit and sha256 in the inventory). The inventory splits that
 * baseline into units with the SAME splitter this test uses (`tests/compaction-eval/units.js`),
 * classifies every unit, and names every ORDER with anchors drawn verbatim from the original
 * text. The compacted agent must keep every anchor, inside the section the order now lives in.
 *
 * What it cannot see: an order wrongly labelled as a reason is inventoried as `cut` and passes,
 * and an anchor present does not prove the sentence around it still means the same thing. The
 * human-dispatched review reads every `cut` unit against the original for exactly that.
 *
 * The ten checks live in `tests/compaction-eval/inventory-checks.js`, shared with every agent
 * the compaction rollout covers; the floor below stays written here, a second place to edit.
 */

const { test } = require('node:test');
const path = require('node:path');

const { defineInventoryTests } = require('./compaction-eval/inventory-checks');

/** The order count at extraction. A floor: it may rise, never fall. */
const ORDER_FLOOR = 401;

defineInventoryTests({
  test,
  label: 'premortem-critic',
  inventoryPath: path.join(__dirname, 'compaction-eval', 'premortem-critic', 'rule-inventory.json'),
  orderFloor: ORDER_FLOOR
});
