'use strict';

/**
 * Agents never wait in a sleep loop — the instruction ships.
 *
 * From 18 August to 6 October 2026, 412 of 1,045 agent-hours went to loops that
 * sleep and then check a log, output file or marker for a background job
 * (.ctoc/audit/speed-and-size/benchmarks/WHERE-THE-HOURS-GO.md). The rule below
 * tells agents how to wait instead.
 *
 * What this proves: the exact rule sentence is present, byte for byte, in the
 * build agent's definition, in the lessons template every user project receives,
 * and in this repository's CLAUDE.md.
 * What it cannot prove: that a model obeys it. Only rerunning the benchmark on
 * transcripts from after the release can show that.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RULE =
  'To wait for a long build or test, run it in the foreground with a timeout long enough for it, ' +
  'up to 10 minutes; if it can take longer and you were dispatched in the background, start it with ' +
  'run_in_background and end your turn — you are woken when it finishes; never wait in a loop that ' +
  'sleeps and checks a file, log or marker.';

for (const rel of [
  ['agents', 'iron-loop', 'iron-loop-executor.md'],
  ['.ctoc', 'templates', 'operating-lessons.md'],
  ['CLAUDE.md'],
]) {
  test(`${rel.join('/')} carries the exact no-sleep-loop rule sentence`, () => {
    const text = fs.readFileSync(path.join(ROOT, ...rel), 'utf8'); // a missing file throws: loud failure
    assert.ok(text.includes(RULE), `${rel.join('/')} does not contain the rule sentence byte for byte`);
  });
}
