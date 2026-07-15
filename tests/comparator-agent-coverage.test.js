'use strict';

/**
 * Coverage + mutation-survival tests for src/lib/comparator-agent.js
 *
 * This module is a blind Large-Language-Model-as-judge dispatcher for the
 * evaluation harness. The load-bearing, non-obvious logic is:
 *
 *   1. The position-bias un-shuffle in compareSkillVersions — the judge sees
 *      the two outputs in a RANDOM order ("Output 1" / "Output 2"), and the
 *      code must map the judge's "1"/"2"/"tie" back to the canonical
 *      A(baseline)/B(candidate) labels. A clearly-better A must return "A"
 *      REGARDLESS of which slot it landed in; likewise for B; a tie stays a
 *      tie. A mutant that returns a constant verdict, or swaps the AB/BA
 *      mapping, or swaps the "1"/"2" ternary, must go RED here.
 *   2. The three-operand `stub` OR — each operand independently forces stub.
 *   3. The default-injection `||`s (runSkill / judge / logger).
 *   4. The stub-vs-live env gate (ANTHROPIC_API_KEY present ⇒ throw, honest
 *      "not wired" error, never a fabricated confident verdict).
 *   5. Every validation throw.
 *
 * Fakes live ONLY at the true boundaries: Math.random (the randomness source)
 * and process.env.ANTHROPIC_API_KEY (the network gate). Core logic is never
 * mocked — the injected runSkill/judge are the module's OWN documented
 * dependency-injection seams (opts.runSkill / opts.judge), not stand-ins for
 * the code under test. No real model is ever invoked.
 *
 * AI-authored, human-reviewed line-by-line (unit-test-writer skill contract).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const comparator = require('../src/lib/comparator-agent.js');
const {
  compareSkillVersions,
  runSkillOnCase,
  judgeOutputs,
  SUPPORTED_JUDGE_MODELS,
  STUB_TIE_CONFIDENCE,
  _internal,
} = comparator;

// ── Boundary helpers ───────────────────────────────────────────────────────

// Force the Math.random-driven position flip deterministically.
//   flip = Math.random() < 0.5  →  true means the [B, A] shuffle (position "BA")
// Returning 0 forces flip=true (BA); returning 0.9 forces flip=false (AB).
async function withRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return await fn();
  } finally {
    Math.random = orig;
  }
}

// Control the network gate env var, restoring exactly (present-or-absent).
async function withApiKey(value, fn) {
  const KEY = 'ANTHROPIC_API_KEY';
  const had = Object.prototype.hasOwnProperty.call(process.env, KEY);
  const orig = process.env[KEY];
  if (value === undefined) delete process.env[KEY];
  else process.env[KEY] = value;
  try {
    return await fn();
  } finally {
    if (had) process.env[KEY] = orig;
    else delete process.env[KEY];
  }
}

const CASE = Object.freeze({ id: 'case-42', skill: 'skill-x', input: 'the input' });

// A runSkill fake that makes the baseline output distinguishable from the
// candidate output, so we can assert the un-shuffle recovers the right label.
function markedRunSkill(baselineVersion, baselineOut, candidateOut) {
  return async (caseObj, version) => ({
    output: version === baselineVersion ? baselineOut : candidateOut,
    latency_ms: 0,
    stub: false,
    version,
  });
}

// A judge fake that ACTUALLY discriminates on content: whichever positional
// slot carries the winning marker wins. This is what makes the position-bias
// test meaningful — the judge answers by content, the code must translate the
// positional answer back to A/B.
function discriminatingJudge(marker) {
  return async (input, first, second) => {
    let winner;
    if (first.includes(marker)) winner = '1';
    else if (second.includes(marker)) winner = '2';
    else winner = 'tie';
    return { winner, confidence: 0.73, reasoning: 'by-content', model: 'fake-judge', stub: false };
  };
}

// ── 1. Position-bias un-shuffle: a clearly-better A returns "A" in BOTH slots

test('clearly-better baseline returns A when it lands in slot AB', async () => {
  // Arrange
  const opts = {
    runSkill: markedRunSkill('base', 'WIN-baseline', 'lose-candidate'),
    judge: discriminatingJudge('WIN'),
  };

  // Act — Math.random 0.9 ⇒ flip=false ⇒ position "AB" ⇒ first=A, second=B
  const res = await withRandom(0.9, () =>
    compareSkillVersions(CASE, 'base', 'cand', opts));

  // Assert
  assert.equal(res.shuffled_position, 'AB');
  assert.equal(res.winner, 'A');
});

test('clearly-better baseline STILL returns A when shuffled into slot BA', async () => {
  // Arrange — same clearly-better baseline
  const opts = {
    runSkill: markedRunSkill('base', 'WIN-baseline', 'lose-candidate'),
    judge: discriminatingJudge('WIN'),
  };

  // Act — Math.random 0 ⇒ flip=true ⇒ position "BA" ⇒ first=B, second=A
  const res = await withRandom(0, () =>
    compareSkillVersions(CASE, 'base', 'cand', opts));

  // Assert — judge answers "2" (winner in second slot); code must map BA/"2"→A
  assert.equal(res.shuffled_position, 'BA');
  assert.equal(res.winner, 'A');
});

// ── 2. Position-bias un-shuffle: a clearly-better B returns "B" in BOTH slots

test('clearly-better candidate returns B when it lands in slot AB', async () => {
  const opts = {
    runSkill: markedRunSkill('base', 'lose-baseline', 'WIN-candidate'),
    judge: discriminatingJudge('WIN'),
  };

  // Act — AB ⇒ first=A(lose), second=B(WIN) ⇒ judge "2" ⇒ AB/"2"→B
  const res = await withRandom(0.9, () =>
    compareSkillVersions(CASE, 'base', 'cand', opts));

  assert.equal(res.shuffled_position, 'AB');
  assert.equal(res.winner, 'B');
});

test('clearly-better candidate STILL returns B when shuffled into slot BA', async () => {
  const opts = {
    runSkill: markedRunSkill('base', 'lose-baseline', 'WIN-candidate'),
    judge: discriminatingJudge('WIN'),
  };

  // Act — BA ⇒ first=B(WIN), second=A(lose) ⇒ judge "1" ⇒ BA/"1"→B
  const res = await withRandom(0, () =>
    compareSkillVersions(CASE, 'base', 'cand', opts));

  assert.equal(res.shuffled_position, 'BA');
  assert.equal(res.winner, 'B');
});

// ── 3. A genuine tie stays a tie, in either position (never a constant verdict)

test('a tie verdict returns tie regardless of shuffle position AB', async () => {
  const opts = {
    runSkill: markedRunSkill('base', 'equal', 'equal'),
    judge: async () => ({ winner: 'tie', confidence: 0.1, reasoning: 't', model: 'fake', stub: false }),
  };

  const res = await withRandom(0.9, () =>
    compareSkillVersions(CASE, 'base', 'cand', opts));

  assert.equal(res.shuffled_position, 'AB');
  assert.equal(res.winner, 'tie');
});

test('a tie verdict returns tie regardless of shuffle position BA', async () => {
  const opts = {
    runSkill: markedRunSkill('base', 'equal', 'equal'),
    judge: async () => ({ winner: 'tie', confidence: 0.1, reasoning: 't', model: 'fake', stub: false }),
  };

  const res = await withRandom(0, () =>
    compareSkillVersions(CASE, 'base', 'cand', opts));

  assert.equal(res.shuffled_position, 'BA');
  assert.equal(res.winner, 'tie');
});

// ── 4. Returned outputA/outputB are canonical (baseline/candidate), NOT shuffled

test('outputA is always baseline and outputB always candidate even when position is BA', async () => {
  // Arrange
  const opts = {
    runSkill: markedRunSkill('base', 'BASELINE-TEXT', 'CANDIDATE-TEXT'),
    judge: discriminatingJudge('none-present'),
  };

  // Act — BA shuffle: the judge saw them swapped, but the RESULT must stay canonical
  const res = await withRandom(0, () =>
    compareSkillVersions(CASE, 'base', 'cand', opts));

  // Assert — pins that outputA/outputB come from resultA/resultB, not first/second
  assert.equal(res.outputA, 'BASELINE-TEXT');
  assert.equal(res.outputB, 'CANDIDATE-TEXT');
});

// ── 5. Pass-through fields: confidence / reasoning / model come from the verdict

test('confidence, reasoning and judge_model are taken verbatim from the verdict', async () => {
  const opts = {
    runSkill: markedRunSkill('base', 'x', 'y'),
    judge: async () => ({ winner: 'tie', confidence: 0.61, reasoning: 'because-reasons', model: 'judge-model-z', stub: false }),
  };

  const res = await withRandom(0.9, () =>
    compareSkillVersions(CASE, 'base', 'cand', opts));

  assert.equal(res.confidence, 0.61);
  assert.equal(res.judge_reasoning, 'because-reasons');
  assert.equal(res.judge_model, 'judge-model-z');
});

// ── 6. The three-operand stub OR — each operand independently forces stub=true

test('stub is false only when neither result nor verdict is a stub', async () => {
  const opts = {
    runSkill: async (c, v) => ({ output: v, latency_ms: 0, stub: false, version: v }),
    judge: async () => ({ winner: 'tie', confidence: 0.5, reasoning: 'r', model: 'm', stub: false }),
  };
  const res = await withRandom(0.9, () => compareSkillVersions(CASE, 'base', 'cand', opts));
  assert.equal(res.stub, false);
});

test('stub is true when only resultA (first operand) is a stub', async () => {
  const opts = {
    runSkill: async (c, v) => ({ output: v, latency_ms: 0, stub: v === 'base', version: v }),
    judge: async () => ({ winner: 'tie', confidence: 0.5, reasoning: 'r', model: 'm', stub: false }),
  };
  const res = await withRandom(0.9, () => compareSkillVersions(CASE, 'base', 'cand', opts));
  assert.equal(res.stub, true);
});

test('stub is true when only resultB (second operand) is a stub', async () => {
  const opts = {
    runSkill: async (c, v) => ({ output: v, latency_ms: 0, stub: v === 'cand', version: v }),
    judge: async () => ({ winner: 'tie', confidence: 0.5, reasoning: 'r', model: 'm', stub: false }),
  };
  const res = await withRandom(0.9, () => compareSkillVersions(CASE, 'base', 'cand', opts));
  assert.equal(res.stub, true);
});

test('stub is true when only the verdict (third operand) is a stub', async () => {
  const opts = {
    runSkill: async (c, v) => ({ output: v, latency_ms: 0, stub: false, version: v }),
    judge: async () => ({ winner: 'tie', confidence: 0.5, reasoning: 'r', model: 'm', stub: true }),
  };
  const res = await withRandom(0.9, () => compareSkillVersions(CASE, 'base', 'cand', opts));
  assert.equal(res.stub, true);
});

// ── 7. Default-injection fallbacks (second operand of the `||`s): no opts given

test('compareSkillVersions uses the real stub runSkill/judge/logger when nothing is injected', async () => {
  // Arrange — no runSkill, no judge, no logger, no API key ⇒ real stub path
  // Act
  const res = await withApiKey(undefined, () =>
    withRandom(0.9, () => compareSkillVersions(CASE, 'main', 'HEAD')));

  // Assert — real judgeOutputs stub returns a low-confidence tie, stub=true
  assert.equal(res.winner, 'tie');
  assert.equal(res.stub, true);
  assert.equal(res.judge_model, 'stub');
  assert.equal(res.confidence, STUB_TIE_CONFIDENCE);
  assert.match(res.outputA, /STUB OUTPUT/);
  assert.match(res.outputB, /STUB OUTPUT/);
});

// ── 8. The injected logger (first operand of `logger ||`) receives the dispatch line

test('the injected logger records a dispatch line carrying the case id and shuffled position', async () => {
  // Arrange
  const lines = [];
  const logger = { info: (m) => lines.push(m), warn() {}, error() {} };
  const opts = {
    runSkill: markedRunSkill('base', 'x', 'y'),
    judge: async () => ({ winner: 'tie', confidence: 0.5, reasoning: 'r', model: 'm', stub: false }),
    logger,
  };

  // Act — force AB so the asserted position is deterministic
  await withRandom(0.9, () => compareSkillVersions(CASE, 'base', 'cand', opts));

  // Assert
  assert.equal(lines.length, 1);
  assert.match(lines[0], /case=case-42/);
  assert.match(lines[0], /pos=AB/);
});

// ── 9. runSkillOnCase stub mode — deterministic, version-discriminating fingerprint

test('runSkillOnCase stub returns a version-specific fingerprint when no API key is set', async () => {
  await withApiKey(undefined, async () => {
    // Arrange — the fingerprint the module should embed
    const expected = crypto.createHash('sha256')
      .update(`${CASE.id}|v1`).digest('hex').slice(0, 12);

    // Act
    const res = await runSkillOnCase(CASE, 'v1');

    // Assert
    assert.equal(res.stub, true);
    assert.equal(res.latency_ms, 0);
    assert.equal(res.version, 'v1');
    assert.match(res.output, new RegExp(`fingerprint: ${expected}`));
    assert.match(res.output, /case_id: case-42/);
    assert.match(res.output, /skill: skill-x/);
  });
});

test('runSkillOnCase stub produces DIFFERENT output for different versions (discrimination)', async () => {
  await withApiKey(undefined, async () => {
    const a = await runSkillOnCase(CASE, 'versionA');
    const b = await runSkillOnCase(CASE, 'versionB');
    assert.notEqual(a.output, b.output);
  });
});

// ── 10. runSkillOnCase live mode — honest throw, never a fabricated verdict

test('runSkillOnCase throws an actionable not-wired error when an API key IS present', async () => {
  await withApiKey('sk-not-a-real-key-fixture', async () => {
    await assert.rejects(
      () => runSkillOnCase(CASE, 'v1'),
      (err) => err instanceof Error && /live Anthropic/.test(err.message)
        && /not yet implemented/.test(err.message),
    );
  });
});

// ── 11. runSkillOnCase version validation (checked before the env gate)

test('runSkillOnCase rejects a non-string version', async () => {
  await assert.rejects(
    () => runSkillOnCase(CASE, 123),
    (err) => err instanceof TypeError && /non-empty version/.test(err.message),
  );
});

test('runSkillOnCase rejects an empty-string version', async () => {
  await assert.rejects(
    () => runSkillOnCase(CASE, ''),
    (err) => err instanceof TypeError && /non-empty version/.test(err.message),
  );
});

// ── 12. judgeOutputs stub mode — honest low-confidence tie, never a confident guess

test('judgeOutputs stub returns a low-confidence tie labelled model=stub when no API key', async () => {
  await withApiKey(undefined, async () => {
    // Act
    const v = await judgeOutputs('in', 'outA', 'outB');

    // Assert — the honest-fallback contract: tie, stub confidence, stub flag
    assert.equal(v.winner, 'tie');
    assert.equal(v.confidence, STUB_TIE_CONFIDENCE);
    assert.equal(v.model, 'stub');
    assert.equal(v.stub, true);
    assert.ok(v.reasoning.length > 0);
  });
});

// ── 13. judgeOutputs live mode — throw names the DEFAULT model and the OVERRIDE

test('judgeOutputs live throw names the default judge model (SUPPORTED_JUDGE_MODELS[0])', async () => {
  await withApiKey('sk-fixture', async () => {
    await assert.rejects(
      () => judgeOutputs('in', 'a', 'b'),
      (err) => err instanceof Error
        && err.message.includes(SUPPORTED_JUDGE_MODELS[0]),
    );
  });
});

test('judgeOutputs live throw names the overridden judge model (second operand of ||)', async () => {
  await withApiKey('sk-fixture', async () => {
    await assert.rejects(
      () => judgeOutputs('in', 'a', 'b', { judgeModel: 'custom-judge-99' }),
      (err) => err instanceof Error
        && err.message.includes('custom-judge-99'),
    );
  });
});

// ── 14. judgeOutputs input-type validation (each of the three type guards)

for (const { id, args, needle } of [
  { id: 'input-not-string', args: [123, 'a', 'b'], needle: /input must be a string/ },
  { id: 'outputA-not-string', args: ['in', 123, 'b'], needle: /outputA must be a string/ },
  { id: 'outputB-not-string', args: ['in', 'a', 123], needle: /outputB must be a string/ },
]) {
  test(`judgeOutputs rejects when ${id}`, async () => {
    await assert.rejects(
      () => judgeOutputs(...args),
      (err) => err instanceof TypeError && needle.test(err.message),
    );
  });
}

// ── 15. validateInputs — baseline/candidate version guards (via _internal)

for (const { id, baseline, candidate, needle } of [
  { id: 'empty-baseline', baseline: '', candidate: 'HEAD', needle: /baselineVersion/ },
  { id: 'non-string-baseline', baseline: 5, candidate: 'HEAD', needle: /baselineVersion/ },
  { id: 'empty-candidate', baseline: 'main', candidate: '', needle: /candidateVersion/ },
  { id: 'non-string-candidate', baseline: 'main', candidate: null, needle: /candidateVersion/ },
]) {
  test(`validateInputs throws for ${id}`, () => {
    assert.throws(
      () => _internal.validateInputs(CASE, baseline, candidate),
      (err) => err instanceof TypeError && needle.test(err.message),
    );
  });
}

test('validateInputs passes a fully valid triple', () => {
  assert.doesNotThrow(() => _internal.validateInputs(CASE, 'main', 'HEAD'));
});

// ── 16. validateCaseShape — every field guard (the bug-factory boundary)

for (const { id, value, needle } of [
  { id: 'null', value: null, needle: /non-null object/ },
  { id: 'number', value: 42, needle: /non-null object/ },
  { id: 'string', value: 'not-an-object', needle: /non-null object/ },
  { id: 'missing-id', value: { skill: 's', input: 'i' }, needle: /caseObj\.id/ },
  { id: 'empty-id', value: { id: '', skill: 's', input: 'i' }, needle: /caseObj\.id/ },
  { id: 'missing-skill', value: { id: 'x', input: 'i' }, needle: /caseObj\.skill/ },
  { id: 'empty-skill', value: { id: 'x', skill: '', input: 'i' }, needle: /caseObj\.skill/ },
  { id: 'missing-input', value: { id: 'x', skill: 's' }, needle: /caseObj\.input/ },
  { id: 'non-string-input', value: { id: 'x', skill: 's', input: 5 }, needle: /caseObj\.input/ },
]) {
  test(`validateCaseShape throws for ${id}`, () => {
    assert.throws(
      () => _internal.validateCaseShape(value),
      (err) => err instanceof TypeError && needle.test(err.message),
    );
  });
}

test('validateCaseShape passes a well-formed case (empty input string is allowed)', () => {
  // input only needs to be a string — the empty string is valid, unlike id/skill
  assert.doesNotThrow(() => _internal.validateCaseShape({ id: 'x', skill: 's', input: '' }));
});

// ── 17. nullLogger — shape + silent no-op methods
// NOTE: the three method BODIES are intentionally empty (info/warn/error are
// documented no-ops). There is no observable behaviour inside them to pin
// under mutation beyond "callable and returns undefined without throwing";
// that is asserted here. The empty statements themselves carry no branch.

test('nullLogger exposes info/warn/error as silent no-op functions', () => {
  const log = _internal.nullLogger();
  assert.equal(typeof log.info, 'function');
  assert.equal(typeof log.warn, 'function');
  assert.equal(typeof log.error, 'function');
  assert.equal(log.info('x'), undefined);
  assert.equal(log.warn('x'), undefined);
  assert.equal(log.error('x'), undefined);
});

// ── 18. Constant preference order the judge default depends on

test('SUPPORTED_JUDGE_MODELS is frozen and its first entry is the default judge', () => {
  assert.ok(Object.isFrozen(SUPPORTED_JUDGE_MODELS));
  assert.equal(SUPPORTED_JUDGE_MODELS[0], 'claude-opus-4-7');
});
