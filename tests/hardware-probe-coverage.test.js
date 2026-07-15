'use strict';

/**
 * Coverage + mutation-hardening tests for src/lib/plan-index/hardware-probe.js
 *
 * Human-reviewed (author read every assertion). These target the DARK branches the
 * existing plan-index-embedding.test.js leaves uncovered — baseline was 95.60% line /
 * 72.73% branch with lines 40-41 (getSetting-throws catch) and 86-87 (os.cpus-throws
 * catch) unhit — plus the second operands of the `||`/`&&`/ternary chains that a
 * happy-path-only test never exercises.
 *
 * Every test pins a branch that goes RED under mutation: mis-classifying an HTTP
 * result, ignoring an injected base URL, fabricating a CPU count, or crashing instead
 * of degrading. Fakes live ONLY at the true boundary: the injected `fetch` and the
 * shared `os` module object (os.cpus). No core logic is mocked.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');

const {
  probeOllama,
  detectCompute,
  DEFAULT_BASE_URL,
  DEFAULT_PROBE_TIMEOUT_MS,
} = require('../src/lib/plan-index/hardware-probe');

// A fetch fake that records the URL it was asked for and returns a healthy 200.
// This lets us observe which base URL resolveBaseUrl selected (its only side effect).
function capturingOkFetch() {
  const state = { url: null };
  const fetch = async (url) => {
    state.url = String(url);
    return { ok: true, status: 200 };
  };
  return { fetch, state };
}

// ── Cluster A — resolveBaseUrl selection (observed through the probed URL) ────────
// Kills mutants that: ignore an explicit baseUrl, treat an empty string as valid,
// crash instead of defaulting when the setting lookup throws, or accept a non-string
// / empty setting instead of falling back to DEFAULT_BASE_URL.

test('explicit baseUrl wins and the setting is never consulted (line 34 true operand)', async () => {
  // Arrange — getSetting would throw if consulted; explicit baseUrl must short-circuit it.
  const { fetch, state } = capturingOkFetch();
  const getSetting = () => { throw new Error('must not be called'); };

  // Act
  const reachable = await probeOllama({ fetch, baseUrl: 'http://explicit.host:1234', getSetting });

  // Assert — the explicit URL was used verbatim; the throwing setting was not reached.
  assert.equal(reachable, true);
  assert.equal(state.url, 'http://explicit.host:1234/api/tags');
});

test('empty-string baseUrl is rejected and resolution falls through to the setting (line 34 second operand)', async () => {
  // Arrange — baseUrl is a string but length 0, so the `.length > 0` guard must fail.
  const { fetch, state } = capturingOkFetch();

  // Act
  const reachable = await probeOllama({ fetch, baseUrl: '', getSetting: () => 'http://from-setting:7000' });

  // Assert — empty baseUrl ignored; setting value used instead.
  assert.equal(reachable, true);
  assert.equal(state.url, 'http://from-setting:7000/api/tags');
});

test('setting lookup that throws degrades to DEFAULT_BASE_URL, never propagates (lines 40-41 catch)', async () => {
  // Arrange — no explicit baseUrl, so resolution calls getSetting, which throws.
  const { fetch, state } = capturingOkFetch();
  const getSetting = () => { throw new Error('settings backend unavailable'); };

  // Act — must not reject; the catch swallows and falls back.
  const reachable = await probeOllama({ fetch, getSetting });

  // Assert — fell back to the localhost default rather than crashing.
  assert.equal(reachable, true);
  assert.equal(state.url, `${DEFAULT_BASE_URL}/api/tags`);
});

// Table-driven: a setting that is empty / non-string / valid picks default-or-value.
for (const row of [
  { id: 'empty-string-setting', setting: '', expectedBase: DEFAULT_BASE_URL },
  { id: 'non-string-setting', setting: 42, expectedBase: DEFAULT_BASE_URL },
  { id: 'undefined-setting', setting: undefined, expectedBase: DEFAULT_BASE_URL },
  { id: 'valid-string-setting', setting: 'http://cfg.host:8080', expectedBase: 'http://cfg.host:8080' },
]) {
  test(`setting value "${row.id}" resolves base URL to ${row.expectedBase} (line 42 operands)`, async () => {
    // Arrange
    const { fetch, state } = capturingOkFetch();

    // Act
    const reachable = await probeOllama({ fetch, getSetting: () => row.setting });

    // Assert — only a non-empty string is honored; everything else defaults.
    assert.equal(reachable, true);
    assert.equal(state.url, `${row.expectedBase}/api/tags`);
  });
}

// ── Cluster B — probeOllama maps the HTTP result honestly (line 65 sub-branches) ──
// Kills mutants that flip the `res && (res.ok || res.status === 200)` composition:
// a truthy body with a 200-but-not-ok status must read reachable, and a falsy body
// must read unreachable rather than throwing.

for (const row of [
  { id: 'status-200-without-ok-flag', res: { ok: false, status: 200 }, expected: true },   // second operand of ||
  { id: 'ok-flag-with-non-200-status', res: { ok: true, status: 500 }, expected: true },     // first operand of ||
  { id: 'not-ok-and-not-200', res: { ok: false, status: 503 }, expected: false },            // both operands false
  { id: 'falsy-response-body', res: undefined, expected: false },                            // res && ... guard
] ) {
  test(`HTTP result "${row.id}" resolves reachable=${row.expected} (line 65)`, async () => {
    // Arrange
    const fetch = async () => row.res;

    // Act
    const reachable = await probeOllama({ fetch, baseUrl: 'http://h:1' });

    // Assert — reachability is derived from ok-OR-200, guarded on a truthy body.
    assert.equal(reachable, row.expected);
  });
}

// ── Cluster C — no usable fetch fails open to false (line 56) ─────────────────────
// Deterministic: null the global so an injected non-function fetch has no fallback.

test('probeOllama returns false when neither injected nor global fetch is a function (line 56)', async () => {
  // Arrange — remove the Node global so the guard cannot fall back to it.
  const savedGlobalFetch = globalThis.fetch;
  globalThis.fetch = undefined;
  try {
    // Act
    const reachable = await probeOllama({ fetch: null });

    // Assert — no fetch available → fail-open false, no throw.
    assert.equal(reachable, false);
  } finally {
    globalThis.fetch = savedGlobalFetch;
  }
});

// ── Cluster D — a finite timeoutMs actually drives the AbortController (line 59) ──
// Kills a mutant that ignores deps.timeoutMs and always uses DEFAULT_PROBE_TIMEOUT_MS:
// a 25ms cap aborts a hanging fetch far below the 1500ms default. The 1000ms bound is
// >> 25ms (real path) and << 1500ms (mutant path), so it is deterministic, not flaky.

test('a small injected timeoutMs aborts a hanging fetch well below the default (line 59 finite operand)', async () => {
  // Arrange — a fetch that only settles when the abort signal fires.
  const abortMargin = 1000; // must sit between injected 25ms and DEFAULT_PROBE_TIMEOUT_MS (1500ms)
  assert.ok(25 < abortMargin && abortMargin < DEFAULT_PROBE_TIMEOUT_MS, 'margin brackets injected vs default');
  const hangingUntilAbort = (url, opts) => new Promise((_resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const start = Date.now();

  // Act
  const reachable = await probeOllama({ fetch: hangingUntilAbort, baseUrl: 'http://h:1', timeoutMs: 25 });
  const elapsed = Date.now() - start;

  // Assert — aborted (false) using the injected 25ms cap, not the 1500ms default.
  assert.equal(reachable, false);
  assert.ok(elapsed < abortMargin, `aborted in ${elapsed}ms, expected < ${abortMargin}ms (injected cap honored)`);
});

// ── Cluster E — detectCompute over the os.cpus() boundary ─────────────────────────
// os is the true boundary; the module holds the shared cached object, so overriding
// os.cpus here is a boundary fake, not core-logic mocking. Kills mutants that
// hardcode the count, drop the empty/non-array guards, or crash instead of degrading.

function withCpus(impl, fn) {
  const saved = os.cpus;
  os.cpus = impl;
  try {
    return fn();
  } finally {
    os.cpus = saved;
  }
}

test('detectCompute reports the real cpu count when os.cpus yields a populated array', () => {
  // Arrange — three fake cores.
  const info = withCpus(() => [{ model: 'x' }, { model: 'x' }, { model: 'x' }], () => detectCompute());

  // Assert — count reflects the array length (kills a hardcoded-count mutant); gpu hint stays conservative.
  assert.equal(info.cpuCount, 3);
  assert.equal(info.hasGpu, false);
});

for (const row of [
  { id: 'empty-array', impl: () => [] },                         // line 84 second operand: length > 0 fails
  { id: 'non-array-null', impl: () => null },                    // line 84 first operand: Array.isArray fails
  { id: 'os-cpus-throws', impl: () => { throw new Error('no /proc'); } }, // lines 86-87 catch
]) {
  test(`detectCompute falls back to cpuCount 1 when os.cpus yields "${row.id}"`, () => {
    // Act
    const info = withCpus(row.impl, () => detectCompute());

    // Assert — degrades to the documented floor of 1 rather than 0/NaN/throw.
    assert.equal(info.cpuCount, 1);
    assert.equal(info.hasGpu, false);
  });
}
