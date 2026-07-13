'use strict';

/**
 * Unit tests for the deterministic decision-format graders.
 *
 * These tests use real fixture strings and real argument objects — zero test
 * doubles, no mocks. Each grader is exercised with a conforming fixture that
 * must pass and one or more non-conforming fixtures that must fail, with the
 * failure reason asserted where the task calls for a named offender.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  gradeMatrix,
  gradeNoAbbreviations,
  gradeAskShape,
  gradeOneQuestion
} = require('../evals/lib/graders.js');

// ---------------------------------------------------------------------------
// Fixtures — matrices
// ---------------------------------------------------------------------------

// A conforming response: a real question heading, an explanation paragraph, a
// box-drawing matrix inside a fenced code block with exactly the four columns
// spelled in full and exactly one cell marked Recommended.
const GOOD_MATRIX = [
  '### Question 1 — Which relational database engine should the service use?',
  '',
  'The storage engine is wired in early and is costly to swap later. Read patterns and durability guarantees decide the choice for a transactional workload.',
  '',
  '```',
  '┌────────────┬──────────────────────────┬──────────────────────────┬──────────────────────────────────┐',
  '│ Option     │ Pros                     │ Cons                     │ Recommendation                   │',
  '├────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────────────┤',
  '│ PostgreSQL │ Strong durability.       │ Heavier to operate.      │ Recommended — strongest          │',
  '│            │ Rich query planner.      │                          │ durability and query planner.    │',
  '├────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────────────┤',
  '│ SQLite     │ Zero operational cost.   │ Single-writer only.      │                                  │',
  '└────────────┴──────────────────────────┴──────────────────────────┴──────────────────────────────────┘',
  '```',
  '',
  'Which relational database engine should the service use?',
  ''
].join('\n');

// A markdown pipe-character table inside a fence — no box-drawing characters.
// This MUST fail: pipes are not the required vertical line character.
const PIPE_ONLY_MATRIX = [
  '### Question 1 — Which relational database engine should the service use?',
  '',
  'The storage engine is wired in early and is costly to swap later.',
  '',
  '```',
  '| Option     | Pros            | Cons           | Recommendation           |',
  '|------------|-----------------|----------------|--------------------------|',
  '| PostgreSQL | Strong.         | Heavy.         | Recommended — strongest. |',
  '| SQLite     | Simple.         | Single-writer. |                          |',
  '```',
  '',
  'Which relational database engine should the service use?',
  ''
].join('\n');

// Two cells marked Recommended — must fail.
const TWO_RECOMMENDED_MATRIX = GOOD_MATRIX.replace(
  '│ SQLite     │ Zero operational cost.   │ Single-writer only.      │                                  │',
  '│ SQLite     │ Zero operational cost.   │ Single-writer only.      │ Recommended — simplest.          │'
);

// Heading is a topic label with no question mark — must fail.
const NO_QUESTION_HEADING_MATRIX = GOOD_MATRIX.replace(
  '### Question 1 — Which relational database engine should the service use?',
  '### Question 1 — Relational database engine choice'
);

// Heading present and a question, but no explanation paragraph between it and
// the matrix — must fail.
const NO_PARAGRAPH_MATRIX = [
  '### Question 1 — Which relational database engine should the service use?',
  '',
  '```',
  '┌────────────┬──────────────────────────┬──────────────────────────┬──────────────────────────────────┐',
  '│ Option     │ Pros                     │ Cons                     │ Recommendation                   │',
  '├────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────────────┤',
  '│ PostgreSQL │ Strong durability.       │ Heavier to operate.      │ Recommended — strongest.         │',
  '├────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────────────┤',
  '│ SQLite     │ Zero operational cost.   │ Single-writer only.      │                                  │',
  '└────────────┴──────────────────────────┴──────────────────────────┴──────────────────────────────────┘',
  '```',
  ''
].join('\n');

// Header row abbreviates a column name — must fail (columns not spelled in full).
const ABBREVIATED_HEADER_MATRIX = GOOD_MATRIX.replace(
  '│ Option     │ Pros                     │ Cons                     │ Recommendation                   │',
  '│ Option     │ Pros                     │ Cons                     │ Rec                              │'
);

// ---------------------------------------------------------------------------
// gradeMatrix
// ---------------------------------------------------------------------------

test('gradeMatrix passes a conforming box-drawing matrix', () => {
  const result = gradeMatrix(GOOD_MATRIX);
  assert.equal(result.pass, true, `expected pass, got reasons: ${result.reasons.join(' | ')}`);
  assert.deepEqual(result.reasons, []);
});

test('gradeMatrix fails a pipe-only table (no box-drawing characters)', () => {
  const result = gradeMatrix(PIPE_ONLY_MATRIX);
  assert.equal(result.pass, false);
  assert.ok(result.reasons.length > 0);
  assert.ok(
    result.reasons.some((r) => /box-drawing/i.test(r)),
    `expected a box-drawing reason, got: ${result.reasons.join(' | ')}`
  );
});

test('gradeMatrix fails when two cells are marked Recommended', () => {
  const result = gradeMatrix(TWO_RECOMMENDED_MATRIX);
  assert.equal(result.pass, false);
  assert.ok(
    result.reasons.some((r) => /Recommended/.test(r) && /2/.test(r)),
    `expected a two-Recommended reason, got: ${result.reasons.join(' | ')}`
  );
});

test('gradeMatrix fails a heading with no question mark', () => {
  const result = gradeMatrix(NO_QUESTION_HEADING_MATRIX);
  assert.equal(result.pass, false);
  assert.ok(
    result.reasons.some((r) => /question mark/i.test(r)),
    `expected a question-mark reason, got: ${result.reasons.join(' | ')}`
  );
});

test('gradeMatrix fails when the explanation paragraph is missing', () => {
  const result = gradeMatrix(NO_PARAGRAPH_MATRIX);
  assert.equal(result.pass, false);
  assert.ok(
    result.reasons.some((r) => /explanation paragraph/i.test(r)),
    `expected an explanation-paragraph reason, got: ${result.reasons.join(' | ')}`
  );
});

test('gradeMatrix fails an abbreviated header column name', () => {
  const result = gradeMatrix(ABBREVIATED_HEADER_MATRIX);
  assert.equal(result.pass, false);
  assert.ok(
    result.reasons.some((r) => /header row/i.test(r)),
    `expected a header-row reason, got: ${result.reasons.join(' | ')}`
  );
});

// ---------------------------------------------------------------------------
// gradeNoAbbreviations
// ---------------------------------------------------------------------------

test('gradeNoAbbreviations passes fully spelled-out prose', () => {
  const text = 'We merged the pull request after the continuous integration run went green.';
  const result = gradeNoAbbreviations(text);
  assert.equal(result.pass, true, `expected pass, got reasons: ${result.reasons.join(' | ')}`);
  assert.deepEqual(result.reasons, []);
});

test('gradeNoAbbreviations fails "we merged the PR" and names PR', () => {
  const result = gradeNoAbbreviations('we merged the PR');
  assert.equal(result.pass, false);
  assert.ok(
    result.reasons.some((r) => /\bPR\b/.test(r)),
    `expected PR to be named, got: ${result.reasons.join(' | ')}`
  );
});

test('gradeNoAbbreviations detects multiple offenders and lists each', () => {
  const result = gradeNoAbbreviations('The API and the UI both call the DB.');
  assert.equal(result.pass, false);
  assert.ok(result.reasons.some((r) => /\bAPI\b/.test(r)));
  assert.ok(result.reasons.some((r) => /\bUI\b/.test(r)));
  assert.ok(result.reasons.some((r) => /\bDB\b/.test(r)));
});

test('gradeNoAbbreviations matches whole words only, not substrings', () => {
  // "Europe" must not trip the "EU" rule; "Database" must not trip "DB".
  const result = gradeNoAbbreviations('The European Database serves users worldwide.');
  assert.equal(result.pass, true, `expected pass, got reasons: ${result.reasons.join(' | ')}`);
});

// ---------------------------------------------------------------------------
// gradeAskShape / gradeOneQuestion fixtures
// ---------------------------------------------------------------------------

function goodCall() {
  return {
    questions: [
      {
        question: 'Which relational database engine should the service use?',
        header: 'Database',
        multiSelect: false,
        options: [
          {
            label: 'PostgreSQL (Recommended)',
            description: 'Strongest durability and query planner for a transactional workload.'
          },
          {
            label: 'SQLite',
            description: 'Zero operational cost for small single-writer workloads.'
          }
        ]
      }
    ]
  };
}

// ---------------------------------------------------------------------------
// gradeAskShape
// ---------------------------------------------------------------------------

test('gradeAskShape passes a conforming AskUserQuestion argument', () => {
  const result = gradeAskShape(goodCall());
  assert.equal(result.pass, true, `expected pass, got reasons: ${result.reasons.join(' | ')}`);
  assert.deepEqual(result.reasons, []);
});

test('gradeAskShape fails a five-option question', () => {
  const call = goodCall();
  call.questions[0].options = [
    { label: 'PostgreSQL (Recommended)', description: 'Strongest durability.' },
    { label: 'SQLite', description: 'Zero operational cost.' },
    { label: 'MySQL', description: 'Broad hosting availability.' },
    { label: 'MariaDB', description: 'Community-maintained fork.' },
    { label: 'CockroachDB', description: 'Horizontal scaling.' }
  ];
  const result = gradeAskShape(call);
  assert.equal(result.pass, false);
  assert.ok(
    result.reasons.some((r) => /two to four options/i.test(r)),
    `expected an option-count reason, got: ${result.reasons.join(' | ')}`
  );
});

test('gradeAskShape fails when the recommended option is not first', () => {
  const call = goodCall();
  call.questions[0].options = [
    { label: 'SQLite', description: 'Zero operational cost.' },
    { label: 'PostgreSQL (Recommended)', description: 'Strongest durability.' }
  ];
  const result = gradeAskShape(call);
  assert.equal(result.pass, false);
  assert.ok(
    result.reasons.some((r) => /must be listed first/i.test(r)),
    `expected a first-option reason, got: ${result.reasons.join(' | ')}`
  );
});

test('gradeAskShape fails a header longer than twelve characters', () => {
  const call = goodCall();
  call.questions[0].header = 'Database engine choice';
  const result = gradeAskShape(call);
  assert.equal(result.pass, false);
  assert.ok(
    result.reasons.some((r) => /twelve characters/i.test(r)),
    `expected a header-length reason, got: ${result.reasons.join(' | ')}`
  );
});

test('gradeAskShape fails a banned abbreviation in an option description', () => {
  const call = goodCall();
  call.questions[0].options[1].description = 'Talks to the DB directly.';
  const result = gradeAskShape(call);
  assert.equal(result.pass, false);
  assert.ok(
    result.reasons.some((r) => /\bDB\b/.test(r)),
    `expected DB to be named, got: ${result.reasons.join(' | ')}`
  );
});

test('gradeAskShape fails when no option is marked Recommended', () => {
  const call = goodCall();
  call.questions[0].options[0].label = 'PostgreSQL';
  const result = gradeAskShape(call);
  assert.equal(result.pass, false);
  assert.ok(
    result.reasons.some((r) => /\(Recommended\)/.test(r)),
    `expected a recommended-marker reason, got: ${result.reasons.join(' | ')}`
  );
});

// ---------------------------------------------------------------------------
// gradeOneQuestion
// ---------------------------------------------------------------------------

test('gradeOneQuestion passes a single-question call', () => {
  const result = gradeOneQuestion(goodCall());
  assert.equal(result.pass, true, `expected pass, got reasons: ${result.reasons.join(' | ')}`);
  assert.deepEqual(result.reasons, []);
});

test('gradeOneQuestion fails a batched two-question call', () => {
  const call = goodCall();
  call.questions.push({
    question: 'Which caching layer should the service use?',
    header: 'Cache',
    multiSelect: false,
    options: [
      { label: 'Redis (Recommended)', description: 'Mature and widely supported.' },
      { label: 'Memcached', description: 'Simple and fast.' }
    ]
  });
  const result = gradeOneQuestion(call);
  assert.equal(result.pass, false);
  assert.ok(
    result.reasons.some((r) => /never batch/i.test(r) || /exactly one question/i.test(r)),
    `expected a batching reason, got: ${result.reasons.join(' | ')}`
  );
});
