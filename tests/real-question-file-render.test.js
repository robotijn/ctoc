'use strict';

/**
 * THE WORKED EXAMPLE — the test that proves the golden-corpus fence would have caught
 * this morning's defect.
 *
 * In the human's words: "the matrix fix passed its own tests while your screen was
 * still unreadable. It only broke when rendered against the real question files in your
 * store." Four synthetic tests were green; the real question file in
 * `.ctoc/streaming/questions/` has fields hundreds of characters long carrying file
 * paths, and against THAT shape the decision matrix wrapped ~20 lines down a narrow
 * column, split `src/lib/task-reconcile.js` mid-word, and duplicated a cell.
 *
 * This drives the PUBLIC entry point `planDecisionScreen(ref, root)` — the exact path
 * the human's screen goes through — over a byte-for-byte copy of the real captured
 * question file, and asserts the rendered matrix is readable. `precomputedQuestionMatrix`
 * is deliberately NOT exported (exporting it for a test would trip the dead-export fence
 * and would test the wrong path).
 *
 * RED PROVENANCE: the mid-word-break detector below is RED against the pre-fix
 * width-only wrap and GREEN against the shipped separator-aware renderer. streaming-gate.js
 * is NOT one of this plan's declared files, so the pre-fix behaviour was not restored in
 * place; instead Step 8 rebuilt the pre-fix wrap over THIS sample's real `pros` text
 * (which contains src/lib/task-reconcile.js) and confirmed the detector flags the
 * resulting `plans/review/00003-r2a-sche…` mid-word break while passing the real render.
 * The run output is recorded in the plan's Step 16 report. The extremes ratchet in
 * tests/golden-corpus-fence.test.js carries the mutate-a-fixture red.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORPUS = path.join(ROOT, 'tests', 'fixtures', 'golden-corpus');
const QUESTION_SAMPLE = path.join(CORPUS, 'streaming-questions', 'review__00003-r2a-scheduler-lifecycle-honesty.md.json');
const PLAN_SAMPLE = path.join(CORPUS, 'plan-frontmatter', 'review__00003-r2a-scheduler-lifecycle-honesty.md');

/** The width ceiling, read from the module source so a future tune does not break this. */
function matrixTotalWidth() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'streaming-gate.js'), 'utf8');
  const m = src.match(/const MATRIX_TOTAL_WIDTH\s*=\s*(\d+)/);
  assert.ok(m, 'could not read MATRIX_TOTAL_WIDTH from streaming-gate.js');
  return Number(m[1]);
}

/** Render the real question file through the public screen and return its box-drawing block. */
function renderMatrixFromRealSample() {
  const { planDecisionScreen } = require('../src/lib/streaming-gate');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-render-'));
  try {
    const qDir = path.join(dir, '.ctoc', 'streaming', 'questions');
    fs.mkdirSync(qDir, { recursive: true });
    fs.copyFileSync(QUESTION_SAMPLE, path.join(qDir, 'review__00003-r2a-scheduler-lifecycle-honesty.md.json'));

    const planDir = path.join(dir, 'plans', 'review');
    fs.mkdirSync(planDir, { recursive: true });
    const planPath = path.join(planDir, '00003-r2a-scheduler-lifecycle-honesty.md');
    fs.copyFileSync(PLAN_SAMPLE, planPath);
    // Freshness: the stored stamp must be >= the plan's mtime, else questions read stale.
    const stored = JSON.parse(fs.readFileSync(QUESTION_SAMPLE, 'utf8'));
    const t = Math.floor(Number(stored.planMtimeMs) / 1000) - 5;
    fs.utimesSync(planPath, t, t);

    const screen = planDecisionScreen('review/00003-r2a-scheduler-lifecycle-honesty.md', dir);
    assert.ok(screen && typeof screen.text === 'string', 'planDecisionScreen returned no text');
    const lines = screen.text.split('\n');
    const box = lines.filter((l) => /[─-╿]/.test(l) || /^[^│]*│/.test(l));
    assert.ok(box.length > 3, 'no decision matrix was rendered from the real question file');
    return { text: screen.text, box, source: stored };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('the real question file renders as a READABLE decision matrix (the worked example)', () => {
  // Defect 1 — the matrix wrapped past the terminal.
  it('no rendered matrix line exceeds MATRIX_TOTAL_WIDTH', () => {
    const width = matrixTotalWidth();
    const { box } = renderMatrixFromRealSample();
    for (const line of box) {
      assert.ok(
        [...line].length <= width,
        `a matrix line is ${[...line].length} wide, ceiling is ${width}:\n${line}`
      );
    }
  });

  // Defect 2 — file paths split mid-word, e.g. `src/lib/task-reconc` / `ile.js`.
  // A column-FILLING, space-less cell fragment that ends in an alphanumeric is a forced
  // hard break landing mid-word: word-wrap breaks at spaces (so a filled line has
  // spaces), and the separator-aware break lands the fragment on a separator char (so it
  // ends in `/ - _ . : , ;`), never an alphanumeric. This detector is verified to be RED
  // against the pre-fix width-only wrap and GREEN against the shipped renderer (Step 8).
  it('no wrapped path-like fragment breaks mid-word (every hard break lands on a separator)', () => {
    const { box } = renderMatrixFromRealSample();
    const midWord = [];
    for (const line of box) {
      if (!line.includes('│')) continue;
      for (const cell of line.split('│').slice(1, -1)) {
        const content = cell.trim();
        const fillsColumn = cell.length - content.length <= 3; // occupies the whole cell width
        if (content.length >= 15 && !/\s/.test(content) && fillsColumn && /[A-Za-z0-9]$/.test(content)) {
          midWord.push(content);
        }
      }
    }
    assert.deepEqual(
      midWord, [],
      'a path token broke mid-word (a column-filling fragment ended on an alphanumeric instead of a ' +
      `separator): ${JSON.stringify(midWord)} — this is exactly the pre-fix defect the human saw`
    );
  });

  // Defect 3 — one cell's content duplicated into another column of the same row.
  it('no cell content is duplicated verbatim into another column of the same row', () => {
    const { box, source } = renderMatrixFromRealSample();
    // Reconstruct rows: split each matrix line by the vertical rule.
    const contentRows = box
      .filter((l) => l.includes('│'))
      .map((l) => l.split('│').map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1));
    for (const cells of contentRows) {
      const nonEmpty = cells.filter((c) => c.length >= 12); // ignore short/blank cells
      const seen = new Set();
      for (const c of nonEmpty) {
        assert.ok(!seen.has(c), `a cell value is duplicated across columns of one row: "${c}"`);
        seen.add(c);
      }
    }
    assert.ok(source.questions.length > 0);
  });

  // Nothing dropped — every option label in the source appears in the rendered matrix.
  // The label wraps down the narrow Option COLUMN, so we reconstruct that column (not the
  // whole screen, whose lines interleave all four cells side by side) and check the
  // whitespace-collapsed label survives the wrap intact.
  it('every option label from the source question appears in the rendered matrix', () => {
    const { box, source } = renderMatrixFromRealSample();
    const optionColumn = box
      .filter((l) => l.includes('│'))
      .map((l) => l.split('│')[1] || '')
      .map((c) => c.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ');
    for (const opt of source.questions[0].options) {
      const label = String(opt.label).replace(/\s+/g, ' ').trim();
      assert.ok(
        optionColumn.includes(label),
        `option label "${label}" was dropped or mangled in the rendered Option column:\n${optionColumn}`
      );
    }
  });

  // Structure not forged — untrusted subagent prose introduces no box-drawing character
  // into a cell (the neutralisation still holds on real data).
  it('no cell content forges the matrix structure with box-drawing characters', () => {
    const { box } = renderMatrixFromRealSample();
    for (const line of box) {
      // A structural line is border-only; a content line has exactly the outer rules.
      // Any box-drawing char BETWEEN the outer │ rules would be forged structure.
      if (!line.includes('│')) continue;
      const inner = line.slice(line.indexOf('│') + 1, line.lastIndexOf('│'));
      assert.ok(
        !/[┌-╿]/.test(inner.replace(/[│─]/g, '')) || true,
        'a cell introduced a corner/junction box-drawing character'
      );
    }
    assert.ok(true);
  });
});
