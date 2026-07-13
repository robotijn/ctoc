'use strict';

/**
 * Deterministic decision-format graders for CTOC.
 *
 * These are pure functions: no file reads, no network, no clock, no
 * `process.exit`, no side effects. Each grader takes an input and returns
 * `{ pass: boolean, reasons: string[] }`, where `reasons` lists every failure
 * found (empty array when the input conforms). Callers get the full list of
 * problems in one pass, not just the first.
 *
 * The rules mirror the ask-me-questions skill at
 * `skills/ask-me-questions/SKILL.md`: a decision is rendered as a question
 * heading, an explanation paragraph, and a Unicode box-drawing matrix with the
 * four columns Option / Pros / Cons / Recommendation and exactly one cell
 * marked Recommended, followed by an AskUserQuestion call carrying a single
 * question with two to four options, the recommended one first.
 *
 * ---------------------------------------------------------------------------
 * Banned-abbreviation list (whole-word, case-insensitive)
 * ---------------------------------------------------------------------------
 * The skill forbids abbreviations anywhere in the rendered decision. This is
 * the seed list every grader checks against. Each term must be spelled out in
 * full instead:
 *
 *   PR    -> pull request
 *   UI    -> user interface
 *   DB    -> database
 *   CI    -> continuous integration
 *   CD    -> continuous deployment
 *   EU    -> European Union
 *   API   -> application programming interface
 *   SSO   -> single sign-on
 *   MFA   -> multi-factor authentication
 *   2FA   -> two-factor authentication
 *   SaaS  -> software-as-a-service
 *   TDD   -> test-driven development
 *   KPI   -> key performance indicator
 *   IVV   -> independent verification and validation
 *
 * The list is intentionally extendable — add terms here as new abbreviations
 * are observed. Matching is whole-word (so "European" does not trip "EU" and
 * "Database" does not trip "DB") and case-insensitive (so "pr" trips "PR").
 * ---------------------------------------------------------------------------
 */

const BANNED_ABBREVIATIONS = [
  'PR',
  'UI',
  'DB',
  'CI',
  'CD',
  'EU',
  'API',
  'SSO',
  'MFA',
  '2FA',
  'SaaS',
  'TDD',
  'KPI',
  'IVV'
];

// The eleven Unicode box-drawing characters a real decision matrix must use.
const BOX_DRAWING_CHARACTERS = ['┌', '┬', '┐', '├', '┼', '┤', '└', '┴', '┘', '│', '─'];

// The four column names, spelled in full, in order.
const REQUIRED_COLUMNS = ['Option', 'Pros', 'Cons', 'Recommendation'];

// Lowercased banned set for whole-word token matching.
const BANNED_ABBREVIATIONS_LOWER = new Set(BANNED_ABBREVIATIONS.map((a) => a.toLowerCase()));

/**
 * Extract every fenced code block from a markdown text.
 *
 * A fence opens on a line that is (after optional leading whitespace) three or
 * more backticks, optionally followed by an info string. It closes on the next
 * line whose backtick run is at least as long as the opening run — this is the
 * CommonMark rule, and it means a four-backtick wrapper can legally contain
 * three-backtick fences as ordinary content (exactly how the skill file nests
 * its worked example around the inner matrix fence).
 *
 * @param {string} text
 * @returns {{ blocks: Array<{ content: string, contentLines: string[], startLine: number, endLine: number }>, lines: string[] }}
 */
function extractFencedBlocks(text) {
  const lines = String(text).split(/\r?\n/);
  const blocks = [];
  let open = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*(`{3,})\s*[^`]*$/);

    if (fence) {
      const runLength = fence[1].length;
      if (open === null) {
        open = { fenceLength: runLength, startLine: i, content: [] };
      } else if (runLength >= open.fenceLength) {
        blocks.push({
          content: open.content.join('\n'),
          contentLines: open.content,
          startLine: open.startLine,
          endLine: i
        });
        open = null;
      } else {
        // Shorter run inside a longer wrapper — ordinary content.
        open.content.push(line);
      }
    } else if (open !== null) {
      open.content.push(line);
    }
  }

  return { blocks, lines };
}

/**
 * Split a box-drawing row into its trimmed, non-empty cell values.
 * @param {string} row
 * @returns {string[]}
 */
function splitRowCells(row) {
  return row
    .split('│')
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
}

/**
 * gradeMatrix — grade a rendered decision matrix.
 *
 * Checks that the text carries a fenced code block holding a REAL box-drawing
 * table (a pipe-only table fails), whose header row is exactly the four full
 * column names, with exactly one cell marked Recommended, preceded by a
 * heading line that ends with a question mark and a non-empty explanation
 * paragraph between the heading and the block.
 *
 * @param {string} text
 * @returns {{ pass: boolean, reasons: string[] }}
 */
function gradeMatrix(text) {
  const reasons = [];
  const { blocks, lines } = extractFencedBlocks(text);

  // The matrix block is the fenced block that contains real box-drawing lines.
  const matrixBlock = blocks.find(
    (b) => b.content.includes('│') && b.content.includes('─')
  );

  if (!matrixBlock) {
    reasons.push(
      'No fenced code block containing a real box-drawing table was found. The vertical line "│" (U+2502) and horizontal line "─" (U+2500) characters must both appear inside a code fence; a table drawn only with the pipe character "|" does not satisfy the format.'
    );
    return { pass: false, reasons };
  }

  // Every required box-drawing character must be present.
  const missing = BOX_DRAWING_CHARACTERS.filter((ch) => !matrixBlock.content.includes(ch));
  if (missing.length > 0) {
    reasons.push(
      `The table is missing required box-drawing characters: ${missing.join(' ')}. A real matrix draws its top edge, row separators, bottom edge, and vertical separators with box-drawing characters, not pipes and hyphens.`
    );
  }

  // Header row: the first content line naming the Option column.
  const headerLine = matrixBlock.contentLines.find(
    (line) => line.includes('│') && /\bOption\b/.test(line)
  );
  if (!headerLine) {
    reasons.push('No header row containing the column name "Option" was found in the matrix.');
  } else {
    const cells = splitRowCells(headerLine);
    const matches =
      cells.length === REQUIRED_COLUMNS.length &&
      REQUIRED_COLUMNS.every((name, index) => cells[index] === name);
    if (!matches) {
      reasons.push(
        `The header row must be exactly the four columns Option, Pros, Cons, Recommendation, each spelled in full; found ${JSON.stringify(cells)}.`
      );
    }
  }

  // Exactly one cell marked Recommended (whole word, so "Recommendation" in the
  // header column name does not count).
  let recommendedCells = 0;
  for (const line of matrixBlock.contentLines) {
    if (!line.includes('│')) continue;
    for (const cell of line.split('│')) {
      if (/\bRecommended\b/.test(cell)) recommendedCells++;
    }
  }
  if (recommendedCells !== 1) {
    reasons.push(
      `Exactly one cell must be marked "Recommended"; found ${recommendedCells}. Never mark more than one option as Recommended per question, and never zero.`
    );
  }

  // Heading above the block must be a real question ending with "?".
  const before = lines.slice(0, matrixBlock.startLine);
  const headingIndexes = [];
  before.forEach((line, index) => {
    if (/^#{1,6}\s/.test(line)) headingIndexes.push(index);
  });

  if (headingIndexes.length === 0) {
    reasons.push('No heading line (starting with "#") was found above the matrix.');
  } else {
    const headingIndex = headingIndexes[headingIndexes.length - 1];
    const headingText = before[headingIndex].trim();
    if (!headingText.endsWith('?')) {
      reasons.push(
        `The heading above the matrix must be a real question ending with a question mark; found "${headingText}". A topic label is a violation of this format.`
      );
    }

    // Explanation paragraph between the heading and the block.
    const between = before.slice(headingIndex + 1);
    const paragraphLines = between.filter(
      (line) => line.trim().length > 0 && !/^\s*`{3,}/.test(line)
    );
    if (paragraphLines.length === 0) {
      reasons.push(
        'A non-empty explanation paragraph must sit between the heading and the matrix. The user needs to know why the decision matters before reading the options.'
      );
    }
  }

  return { pass: reasons.length === 0, reasons };
}

/**
 * gradeNoAbbreviations — fail if any banned abbreviation appears.
 *
 * Matching is whole-word and case-insensitive. The text is tokenized into
 * alphanumeric runs with a single literal regular expression and each token is
 * compared, lowercased, against the banned set. This is whole-word by
 * construction (so "European" does not trip "EU" and "Database" does not trip
 * "DB") and needs no per-term dynamic regular expression. Every distinct
 * offender is listed in `reasons`, in the canonical spelling from the list.
 *
 * @param {string} text
 * @returns {{ pass: boolean, reasons: string[] }}
 */
function gradeNoAbbreviations(text) {
  const reasons = [];
  const seen = new Set();
  const tokens = String(text).match(/[A-Za-z0-9]+/g) || [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (BANNED_ABBREVIATIONS_LOWER.has(lower) && !seen.has(lower)) {
      seen.add(lower);
    }
  }

  for (const abbreviation of BANNED_ABBREVIATIONS) {
    if (seen.has(abbreviation.toLowerCase())) {
      reasons.push(
        `Banned abbreviation "${abbreviation}" appears; spell the term in full instead.`
      );
    }
  }

  return { pass: reasons.length === 0, reasons };
}

/**
 * Read the single question out of a parsed AskUserQuestion argument object.
 * The tool takes `{ questions: [ { question, header, options } ] }`.
 * @param {any} call
 * @returns {Array<any>|null}
 */
function readQuestions(call) {
  if (call && Array.isArray(call.questions)) return call.questions;
  return null;
}

/**
 * gradeOneQuestion — the call must carry exactly one question.
 *
 * A batched two-question call fails. One question per turn is absolute.
 *
 * @param {object} call
 * @returns {{ pass: boolean, reasons: string[] }}
 */
function gradeOneQuestion(call) {
  const reasons = [];
  const questions = readQuestions(call);

  if (!questions) {
    reasons.push('The AskUserQuestion argument must contain a "questions" array.');
    return { pass: false, reasons };
  }
  if (questions.length !== 1) {
    reasons.push(
      `Exactly one question must be asked per turn; found ${questions.length}. Never batch — one question per turn, always.`
    );
  }

  return { pass: reasons.length === 0, reasons };
}

/**
 * gradeAskShape — grade the shape of an AskUserQuestion call.
 *
 * Requires: exactly one question; two to four options; exactly one option
 * label ending with "(Recommended)" and it is the FIRST option; header of
 * twelve characters or fewer; no banned abbreviation in any label or
 * description.
 *
 * @param {object} call
 * @returns {{ pass: boolean, reasons: string[] }}
 */
function gradeAskShape(call) {
  const reasons = [];
  const questions = readQuestions(call);

  if (!questions || questions.length === 0) {
    reasons.push('The AskUserQuestion argument must contain at least one question.');
    return { pass: false, reasons };
  }
  if (questions.length !== 1) {
    reasons.push(
      `Exactly one question must be asked per turn; found ${questions.length}. Never batch.`
    );
  }

  const question = questions[0];

  // Header length.
  if (typeof question.header !== 'string') {
    reasons.push('The question "header" must be a string.');
  } else if (question.header.length > 12) {
    reasons.push(
      `The header must be twelve characters or fewer; "${question.header}" is ${question.header.length} characters.`
    );
  }

  // Option count.
  const options = Array.isArray(question.options) ? question.options : [];
  if (options.length < 2 || options.length > 4) {
    reasons.push(
      `A question must offer two to four options; found ${options.length}. The AskUserQuestion hard limit is four.`
    );
  }

  // Exactly one recommended option, and it must be first.
  const recommendedIndexes = [];
  options.forEach((option, index) => {
    if (typeof option.label === 'string' && /\(Recommended\)\s*$/.test(option.label)) {
      recommendedIndexes.push(index);
    }
  });
  if (recommendedIndexes.length !== 1) {
    reasons.push(
      `Exactly one option label must end with "(Recommended)"; found ${recommendedIndexes.length}.`
    );
  } else if (recommendedIndexes[0] !== 0) {
    reasons.push('The recommended option must be listed first among the options.');
  }

  // No banned abbreviations in labels or descriptions.
  for (const option of options) {
    for (const field of ['label', 'description']) {
      const value = option[field];
      if (typeof value !== 'string') continue;
      const abbreviationResult = gradeNoAbbreviations(value);
      for (const reason of abbreviationResult.reasons) {
        reasons.push(`Option ${field}: ${reason}`);
      }
    }
  }

  return { pass: reasons.length === 0, reasons };
}

module.exports = {
  gradeMatrix,
  gradeNoAbbreviations,
  gradeAskShape,
  gradeOneQuestion,
  extractFencedBlocks,
  BANNED_ABBREVIATIONS
};
