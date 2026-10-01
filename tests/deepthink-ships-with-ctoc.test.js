'use strict';

/**
 * Deepthink ships with CTOC — the plan's own checks
 * (parent plan: plans/implementation/deepthink-ships-with-ctoc.md).
 *
 * This file grows one group per slice. The first group, written before the
 * decision-question format was edited, holds the fold-in: CTOC's decision
 * format (skills/ask-me-questions/SKILL.md) carries the three rules that only
 * the owner's personal copy had — the lettered menu last on screen, the
 * new-ideas block, and the wait-until-satisfied rule — and loses none of its
 * own headings or key sentences.
 *
 * The group reads skills/ask-me-questions/SKILL.md only. The byte identity of
 * that file and its mirror .ctoc/ask-me-questions.md is already asserted by
 * tests/ask-me-questions-skill.test.js and tests/readme-numbers.test.js and is
 * not restated here.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { gradeNoAbbreviations, extractFencedBlocks } = require('../evals/lib/graders.js');

const SKILL_PATH = path.join(__dirname, '..', 'skills', 'ask-me-questions', 'SKILL.md');

// Restated, not imported: `GATE_DIGIT` in src/lib/instruction-gate-words-scan.js is
// not exported. Keep this identical to that source pattern.
const GATE_DIGIT = /\bgates?[\s_-]?[0-3n]\b/i;

// Words of two or more capital letters allowed in the added passages, each with its reason.
const CAPITAL_WORD_ALLOW_LIST = Object.freeze({
  CTOC: "the product's own name, not an abbreviation a reader must decode",
});

// Every heading line and every bold span in skills/ask-me-questions/SKILL.md as it
// stood before the fold-in, captured from disk by a throwaway program at the start
// of the slice and pasted here as literals. Each must survive every later edit.
const PRE_CHANGE_LIST = [
  '# ask-me-questions — Structured Decision Elicitation',
  '## The paramount principle — maximize information gain, minimize user interactions',
  '## The non-negotiable principle — a foregone answer is not a question (Tijn, 2026-07-29)',
  '## When to use this format',
  '## When NOT to use this format',
  '## The two-step flow',
  '### Step 1 — Render the question, the explanation, and the decision matrix in the text response',
  '### Step 2 — Invoke AskUserQuestion (matrix is forbidden inside)',
  '## Sequencing — one question per turn, always',
  '## More than four candidate options',
  '## Empty state',
  '## Minimum-viable example',
  '### Question 1 — Which email delivery provider should the project use?',
  '## What NOT to do',
  '**This is the most important rule of all, and it governs every other rule below.**',
  '**maximize the information you get from each question, and therefore minimize the\ntotal number of user interactions.**',
  '**Ask the highest-information question first.**',
  '**most CRITICAL issues first, then IMPORTANT, then work toward\n   the clearer and smaller ones.**',
  '**Pack each question to harvest the most.**',
  '**Never ask what can be inferred, defaulted, or read from the source.**',
  '**Minimize round-trips.**',
  '**If you present the obvious as though there were one good option and one bad option,\nit is not a real choice — and therefore not a conversation. It is manipulation.**',
  '**The rigged binary.**',
  '**If the answer is genuinely obvious, DO NOT ASK — act, and report what you did.**',
  '**Manufacturing a recommendation on a decision the user owns.**',
  "**user's alone**",
  '**Heading line.**',
  '**Explanation paragraph.**',
  '**The decision matrix.**',
  '**The verbatim question sentence.**',
  '**Never use abbreviations anywhere.**',
  '**Decide first whether this decision even HAS a best answer — most do not.**',
  '**Quality decision**',
  '**Owner decision**',
  '**every Recommendation cell is EMPTY.**',
  '**always the highest-quality option**',
  '**Surface cost transparently, never editorialize about it.**',
  '**One question per turn. Never batch.**',
  '**Never present a foregone answer as a real choice.**',
  '**Never rig a binary:**',
  '**Never manufacture a recommendation on an owner decision**',
];

// The added passages, as they are found: two by their headings, one by its first sentence.
const LETTERED_MENU_HEADING = '### The lettered menu, last on screen, on every question (Tijn, 2026-09-07)';
const NEW_IDEAS_HEADING = '### New ideas are proposals to check, never facts (Tijn, 2026-09-07)';
const SATISFIED_FIRST_SENTENCE =
  'Never move to the next question until the user has answered the current one and says they are satisfied, and never answer or decide on the user\'s behalf.';

const LETTERED_MENU_SENTENCE =
  'The menu is the last thing on screen on every question, in every mode, including plain text where the AskUserQuestion widget is not used.';
const NOTHING_UNCONFIRMED_SENTENCE = 'Nothing the user has not confirmed is recorded as decided.';
// Added at review: the insertions made Step 1's "has four parts" false and left Step 2
// pointing at "the previous paragraph", which became the new-ideas subsection.
const STEP_ONE_OPENING_SENTENCE =
  'The text response that precedes the AskUserQuestion call opens with four parts in this exact order:';
const STEP_TWO_QUESTION_BULLET =
  '- `question`: the verbatim question sentence from Step 1, written after the matrix.';
// Added at the security scan: the two-reply offer must never sit beside the decision
// menu, never record a decision, and must bring the unanswered question's menu back.
const SATISFIED_SEPARATION_SENTENCE =
  'When the user asks for a further explanation, give it, then stop and offer two replies, `a) satisfied, next` and `b) more on this`, with no decision menu on the same screen; a reply to these two never records a decision, and when the user replies `satisfied, next` to a question not yet answered, show that question\'s lettered menu again, last, and wait for a letter.';
const NEW_IDEAS_PROVENANCE = 'lists each such element in one line, with where it came from';
// Added at the final review: the menu rule names its one exception, so it no longer
// contradicts the two-reply screen under Sequencing.
const MENU_EXCEPTION_SENTENCE =
  'The one exception is the screen after a further explanation the user asked for, described under Sequencing, which offers two replies and carries no decision menu.';
const MENU_EXCEPTION_WHAT_NOT =
  'except the screen after a further explanation, which offers two replies and carries no decision menu.';
// Added at the narrow security scan: the wider trigger is the half of the new-ideas fix
// that covers untrusted input, so it is pinned too.
const NEW_IDEAS_TRIGGER = "whether the model thought of it or took it from a file, a web page or another agent's report";
// The worked example's options, in the one order the matrix, the menu and the widget share.
const EXAMPLE_OPTION_ORDER = ['Postmark', 'Resend', 'Amazon Simple Email Service'];

/** The decision format as text, with Windows line endings folded to "\n" so the checks hold on every platform. */
function readSkill() {
  return fs.readFileSync(SKILL_PATH, 'utf8').replace(/\r\n/g, '\n');
}

/** The text from a heading line up to (not including) the next heading line; null when absent. */
function sectionByHeading(source, heading) {
  const lines = source.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !/^#{1,6}\s/.test(lines[end])) end++;
  return lines.slice(start, end).join('\n');
}

/** The paragraph (up to the next blank line) that begins with the given sentence; null when absent. */
function paragraphStartingWith(source, sentence) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.startsWith(sentence));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && lines[end].trim() !== '') end++;
  return lines.slice(start, end).join('\n');
}

/** The text with every fenced block and every inline code span removed. */
function outsideBackticks(text) {
  const { blocks, lines } = extractFencedBlocks(text);
  const drop = new Set();
  for (const block of blocks) {
    for (let i = block.startLine; i <= block.endLine; i++) drop.add(i);
  }
  return lines
    .filter((_, index) => !drop.has(index))
    .join('\n')
    .replace(/`[^`\n]*`/g, ' ');
}

/** Standalone words of two or more capital letters, outside backticks, not on the allow-list. */
function unexplainedCapitalWords(text) {
  const words = outsideBackticks(text).match(/\b[A-Z]{2,}\b/g) || [];
  return [...new Set(words)].filter((word) => !Object.hasOwn(CAPITAL_WORD_ALLOW_LIST, word));
}

/** The worked example, found exactly as tests/ask-me-questions-format.test.js finds it. */
function readWorkedExample(source) {
  const { blocks } = extractFencedBlocks(source);
  const example = blocks.find((b) => b.content.includes('│'));
  assert.ok(example, 'Could not locate the worked example (a fenced block containing a box-drawing matrix).');
  return example.content;
}

describe('the decision-question format carries the three rules and loses none of its own', () => {
  test('1. nothing CTOC carried is removed: every pre-change heading and bold span is still present', () => {
    const source = readSkill();
    const missing = PRE_CHANGE_LIST.filter((literal) => !source.includes(literal));
    assert.deepEqual(missing, [], `Removed from the decision format: ${JSON.stringify(missing)}`);
  });

  test('2. the lettered menu rule is present', () => {
    const source = readSkill();
    assert.ok(source.includes(LETTERED_MENU_SENTENCE), 'the sentence making the lettered menu last on screen on every question, in every mode, is missing');
    assert.ok(source.includes('Reply with a letter.'), 'the literal "Reply with a letter." is missing');
    assert.ok(source.includes(STEP_ONE_OPENING_SENTENCE), 'Step 1 must say the text response opens with its four parts, because the new-ideas block and the lettered menu follow them');
    assert.ok(source.includes(STEP_TWO_QUESTION_BULLET), 'Step 2 must name the question sentence; "the previous paragraph" is now the new-ideas subsection');
    assert.ok(source.includes(MENU_EXCEPTION_SENTENCE), 'the lettered-menu rule must name its one exception, or it contradicts the Sequencing rule');
    assert.ok(source.includes(MENU_EXCEPTION_WHAT_NOT), 'the "What NOT to do" menu line must carry the same exception');
  });

  test('3. the new-ideas block is present', () => {
    const source = readSkill();
    assert.ok(source.includes('New ideas in this question, for you to check'), 'the new-ideas block title is missing');
    assert.ok(source.includes(NOTHING_UNCONFIRMED_SENTENCE), 'the sentence that nothing unconfirmed is recorded as decided is missing');
    assert.ok(source.includes(NEW_IDEAS_PROVENANCE), 'the new-ideas block must say where each new idea came from');
    assert.ok(source.includes(NEW_IDEAS_TRIGGER), "the new-ideas trigger must cover ideas taken from a file, a web page or another agent's report");
  });

  test('4. the wait-until-satisfied rule is present', () => {
    const source = readSkill();
    assert.ok(source.includes(SATISFIED_FIRST_SENTENCE), 'the sentence that the next question waits until the user is satisfied is missing');
    assert.ok(source.includes('satisfied, next'), 'the literal "satisfied, next" is missing');
    assert.ok(source.includes('more on this'), 'the literal "more on this" is missing');
    assert.ok(source.includes(SATISFIED_SEPARATION_SENTENCE), 'the two-reply offer must keep the decision menu off its screen, record no decision, and bring back an unanswered question\'s menu');
  });

  test('5. the worked example ends with the lettered menu', () => {
    const example = readWorkedExample(readSkill());
    const nonEmpty = example.split('\n').filter((line) => line.trim() !== '');
    assert.equal(nonEmpty[nonEmpty.length - 1], 'Reply with a letter.', 'the worked example must end with "Reply with a letter."');
    const matrixRows = example
      .split('\n')
      .filter((line) => line.startsWith('│'))
      .map((line) => line.split('│')[1].trim())
      .filter((cell) => cell !== '' && cell !== 'Option');
    const menuLines = example
      .split('\n')
      .map((line) => /^\*\*[a-d]\)\*\* (.+?) — /.exec(line))
      .filter(Boolean)
      .map((match) => match[1]);
    assert.deepEqual(matrixRows, EXAMPLE_OPTION_ORDER, 'the worked example matrix must list its options in the menu order');
    assert.deepEqual(menuLines, EXAMPLE_OPTION_ORDER, 'the worked example menu must list its options in the matrix order');
  });

  test('6. the added passages are in plain words', () => {
    // The instruments must fire on known-bad text, or a clean result proves nothing.
    assert.equal(gradeNoAbbreviations('open a PR').pass, false, 'gradeNoAbbreviations must flag a banned abbreviation');
    assert.deepEqual(unexplainedCapitalWords('the UI and the `API` and CTOC'), ['UI'], 'the capital-word check must flag prose and skip backticks and the allow-list');
    assert.ok(GATE_DIGIT.test('crossed Gate 3'), 'the gate word-and-digit pattern must match a gate number');
    assert.ok(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'instruction-gate-words-scan.js'), 'utf8').includes('const GATE_DIGIT = ' + String(GATE_DIGIT) + ';'),
      'the restated GATE_DIGIT has drifted from its source'
    );

    const source = readSkill();
    const passages = {
      'the lettered menu subsection': sectionByHeading(source, LETTERED_MENU_HEADING),
      'the new-ideas subsection': sectionByHeading(source, NEW_IDEAS_HEADING),
      'the wait-until-satisfied paragraph': paragraphStartingWith(source, SATISFIED_FIRST_SENTENCE),
    };
    for (const [name, text] of Object.entries(passages)) {
      assert.ok(text, `${name} was not found, so its words cannot be checked`);
      const graded = gradeNoAbbreviations(text);
      assert.equal(graded.pass, true, `${name}: ${graded.reasons.join(' | ')}`);
      assert.deepEqual(unexplainedCapitalWords(text), [], `${name} carries a word of capital letters that is not on the allow-list`);
      assert.equal(GATE_DIGIT.test(text), false, `${name} carries a gate number`);
    }
  });
});
