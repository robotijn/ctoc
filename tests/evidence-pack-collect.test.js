'use strict';

// ===========================================================================
// evidence-pack collection + argument parsing — behaviour coverage.
//
// The security test (evidence-pack-security.test.js) drives packWithTar only.
// The two OTHER exported entry points of the evidence-pack script — parseArgs
// (the CLI window resolver) and collectInputs (the artifact gatherer) — carried
// no behaviour coverage at all, so the window defaulting, the mtime windowing,
// the approved_by plan filter, and the recursive collectAllInWindow walk were
// unexercised. These are real behaviour tests: each asserts a property of the
// function's OUTPUT, never merely that a line ran.
// ===========================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { parseArgs, collectInputs } = require('../src/scripts/evidence-pack');

const ROOT = path.resolve(__dirname, '..');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// parseArgs — CLI window resolution.
// ---------------------------------------------------------------------------

test('parseArgs honours an explicit --since / --until pair verbatim', () => {
  const args = parseArgs(['node', 'evidence-pack.js', '--since=2020-01-01', '--until=2020-12-31']);
  assert.equal(args.since, '2020-01-01');
  assert.equal(args.until, '2020-12-31');
});

test('parseArgs defaults an omitted window to the last 24 hours (yesterday → today)', () => {
  const args = parseArgs(['node', 'evidence-pack.js']);
  assert.match(args.since, DATE_RE, 'since defaults to an ISO date');
  assert.match(args.until, DATE_RE, 'until defaults to an ISO date');
  // until is today, since is 24h earlier — a strictly earlier calendar date
  // (24h back always crosses into the previous day), so since < until.
  assert.ok(args.since < args.until, `since (${args.since}) must precede until (${args.until})`);
  // until is today's UTC date.
  assert.equal(args.until, new Date().toISOString().slice(0, 10));
});

test('parseArgs fills only the missing half of a one-sided window', () => {
  const sinceOnly = parseArgs(['node', 'evidence-pack.js', '--since=2019-06-06']);
  assert.equal(sinceOnly.since, '2019-06-06', 'the supplied bound is kept');
  assert.equal(sinceOnly.until, new Date().toISOString().slice(0, 10), 'the missing until defaults to today');

  const untilOnly = parseArgs(['node', 'evidence-pack.js', '--until=2019-06-06']);
  assert.equal(untilOnly.until, '2019-06-06', 'the supplied bound is kept');
  // The missing since is filled with yesterday's date regardless of --until.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.equal(untilOnly.since, yesterday, 'the missing since defaults to yesterday, independent of until');
});

test('parseArgs captures any --key=value flag and ignores bare positionals', () => {
  const args = parseArgs(['node', 'evidence-pack.js', '--since=2020-01-01', '--label=q1', 'ignored-positional']);
  assert.equal(args.label, 'q1', 'an arbitrary --key=value is captured');
  assert.ok(!('ignored-positional' in args), 'a bare positional is not captured as a key');
});

// ---------------------------------------------------------------------------
// collectInputs — artifact gathering over a time window (reads the real repo).
// ---------------------------------------------------------------------------

test('collectInputs over a wide window returns a de-duplicated set of existing, in-root artifact paths', () => {
  const inputs = collectInputs('1970-01-01', '2999-12-31');
  assert.ok(Array.isArray(inputs), 'returns an array');
  // The repo has audit dispatches and approved plans in review — a wide window
  // must find at least one artifact, or the gatherer is walking nothing.
  assert.ok(inputs.length > 0, 'a wide window finds real evidence artifacts');
  // De-duplicated (collectInputs returns [...new Set(inputs)]).
  assert.equal(inputs.length, new Set(inputs).size, 'no duplicate paths');
  for (const p of inputs) {
    assert.ok(path.isAbsolute(p), `every path is absolute: ${p}`);
    assert.ok(p.startsWith(ROOT + path.sep), `every path is inside the repo root: ${p}`);
    assert.ok(fs.existsSync(p), `every collected artifact exists: ${p}`);
  }
});

test('collectInputs applies the approved_by filter — collected plans all carry an approval marker', () => {
  const inputs = collectInputs('1970-01-01', '2999-12-31');
  const planMds = inputs.filter((p) => p.includes(`${path.sep}plans${path.sep}`) && p.endsWith('.md'));
  assert.ok(planMds.length > 0, 'the wide window collects approved plan files');
  for (const p of planMds) {
    const content = fs.readFileSync(p, 'utf8');
    assert.match(content, /approved_by/, `a collected plan carries the approval marker: ${p}`);
  }
});

test('collectInputs over an ancient window excludes everything outside it (mtime windowing works)', () => {
  // A two-day window in 1970: no repo artifact has an mtime that old, and the
  // always-present absolute sources (chain.jsonl, provenance) are absent here,
  // so the result is empty — proving the mtime filter actually excludes.
  const inputs = collectInputs('1970-01-01', '1970-01-02');
  assert.ok(Array.isArray(inputs), 'returns an array');
  assert.equal(inputs.length, 0, 'nothing in the repo falls inside a 1970 window');
});
