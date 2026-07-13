'use strict';

/**
 * Self-linter for the ask-me-questions skill.
 *
 * The skill file ships a worked example — a heading, an explanation paragraph,
 * and a box-drawing decision matrix. This test reads that example straight off
 * disk and holds it to the skill's own machine-checkable rules: it must pass
 * gradeMatrix and gradeNoAbbreviations. If the skill's own example does not
 * obey the skill's own rules, that is a real finding — the fix is to correct
 * the skill, never to weaken the grader.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  gradeMatrix,
  gradeNoAbbreviations,
  extractFencedBlocks
} = require('../evals/lib/graders.js');

const SKILL_PATH = path.join(__dirname, '..', 'skills', 'ask-me-questions', 'SKILL.md');

/**
 * Pull the worked example out of the skill file. The example is the fenced
 * block whose content contains the box-drawing vertical line — the outer
 * wrapper that carries the heading, the explanation paragraph, and the inner
 * matrix. Returning that block's content gives us the exact text a reader sees
 * as the canonical example.
 */
function readWorkedExample() {
  const source = fs.readFileSync(SKILL_PATH, 'utf8');
  const { blocks } = extractFencedBlocks(source);
  const example = blocks.find((b) => b.content.includes('│'));
  assert.ok(
    example,
    'Could not locate the worked example (a fenced block containing a box-drawing matrix) in the skill file.'
  );
  return example.content;
}

test('the skill worked example is present and extractable', () => {
  const example = readWorkedExample();
  assert.ok(example.length > 0);
  assert.ok(example.includes('### Question 1'), 'worked example should carry the question heading');
});

test('the skill worked example passes gradeMatrix (its own matrix rules)', () => {
  const example = readWorkedExample();
  const result = gradeMatrix(example);
  assert.equal(
    result.pass,
    true,
    `The skill's own worked example violates gradeMatrix — real finding, fix the skill: ${result.reasons.join(' | ')}`
  );
});

test('the skill worked example passes gradeNoAbbreviations (its own no-abbreviation rule)', () => {
  const example = readWorkedExample();
  const result = gradeNoAbbreviations(example);
  assert.equal(
    result.pass,
    true,
    `The skill's own worked example contains a banned abbreviation — real finding, fix the skill: ${result.reasons.join(' | ')}`
  );
});
