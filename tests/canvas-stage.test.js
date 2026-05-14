/**
 * Tests for the Canvas stage (A1 — CTOC v7)
 *
 * Covers:
 * - Lean Canvas + BMC templates exist with 9 expected blocks each
 * - plans/canvas/ stage directory recognized by state machine
 * - createCanvas() writes a canvas file from template
 * - getCanvasForVision() locates canvas by parent_vision
 * - parseCanvas() returns {type, blocks} structure
 * - getPlanCounts() includes canvas
 * - vision-decomposer JS module exposes canvas helpers
 *
 * Per A1 functional plan FR-1..FR-8 and impl plan ADRs 1-3.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = path.join(__dirname, '..');
const templatesDir = path.join(projectRoot, '.ctoc', 'templates');

function createTempProject() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-canvas-test-'));
  // Create plan stage dirs
  ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done']
    .forEach(stage => fs.mkdirSync(path.join(tempDir, 'plans', stage), { recursive: true }));
  // Copy templates so createCanvas can find them
  const tempTemplatesDir = path.join(tempDir, '.ctoc', 'templates');
  fs.mkdirSync(tempTemplatesDir, { recursive: true });
  ['lean-canvas.md.template', 'business-model-canvas.md.template'].forEach(f => {
    const src = path.join(templatesDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(tempTemplatesDir, f));
    }
  });
  return tempDir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('canvas templates', () => {
  it('Lean Canvas template exists', () => {
    const p = path.join(templatesDir, 'lean-canvas.md.template');
    assert.ok(fs.existsSync(p), 'lean-canvas.md.template must exist at .ctoc/templates/');
  });

  it('Lean Canvas template has all 9 expected blocks', () => {
    const p = path.join(templatesDir, 'lean-canvas.md.template');
    const content = fs.readFileSync(p, 'utf8');
    const expectedBlocks = [
      'Problem',
      'Customer Segments',
      'Unique Value Proposition',
      'Solution',
      'Channels',
      'Revenue Streams',
      'Cost Structure',
      'Key Metrics',
      'Unfair Advantage'
    ];
    for (const block of expectedBlocks) {
      assert.match(content, new RegExp(`^##\\s+${block}`, 'm'), `Lean Canvas should have ## ${block} block`);
    }
  });

  it('BMC template exists', () => {
    const p = path.join(templatesDir, 'business-model-canvas.md.template');
    assert.ok(fs.existsSync(p), 'business-model-canvas.md.template must exist at .ctoc/templates/');
  });

  it('BMC template has all 9 expected blocks', () => {
    const p = path.join(templatesDir, 'business-model-canvas.md.template');
    const content = fs.readFileSync(p, 'utf8');
    const expectedBlocks = [
      'Key Partners',
      'Key Activities',
      'Key Resources',
      'Value Propositions',
      'Customer Relationships',
      'Channels',
      'Customer Segments',
      'Cost Structure',
      'Revenue Streams'
    ];
    for (const block of expectedBlocks) {
      assert.match(content, new RegExp(`^##\\s+${block}`, 'm'), `BMC should have ## ${block} block`);
    }
  });

  it('both templates declare YAML frontmatter with type: canvas', () => {
    for (const file of ['lean-canvas.md.template', 'business-model-canvas.md.template']) {
      const content = fs.readFileSync(path.join(templatesDir, file), 'utf8');
      assert.match(content, /^---/, `${file} starts with frontmatter`);
      assert.match(content, /type:\s*canvas/, `${file} declares type: canvas`);
      assert.match(content, /canvas_type:\s*(lean|bmc|\{\{TYPE\}\})/, `${file} declares canvas_type`);
    }
  });
});

describe('createCanvas (actions.js)', () => {
  let tempDir;
  beforeEach(() => { tempDir = createTempProject(); });
  afterEach(() => { cleanup(tempDir); });

  it('creates a lean canvas file at plans/canvas/<slug>.md', () => {
    const { createCanvas } = require('../src/lib/actions');
    const result = createCanvas('my-test-vision', 'lean', tempDir);
    assert.ok(result.path, 'createCanvas returns a path');
    assert.ok(fs.existsSync(result.path), 'canvas file is written to disk');
    assert.match(result.path, /plans[\\/]canvas[\\/]my-test-vision\.md$/, 'file is at plans/canvas/<slug>.md');
  });

  it('lean canvas file content has correct frontmatter and 9 blocks', () => {
    const { createCanvas } = require('../src/lib/actions');
    const result = createCanvas('vision-x', 'lean', tempDir);
    const content = fs.readFileSync(result.path, 'utf8');
    assert.match(content, /type:\s*canvas/, 'has type: canvas');
    assert.match(content, /canvas_type:\s*lean/, 'has canvas_type: lean');
    assert.match(content, /parent_vision:\s*["']?vision-x["']?/, 'has parent_vision: vision-x');
    // 9 H2 blocks
    const h2Count = (content.match(/^##\s+/gm) || []).length;
    assert.equal(h2Count, 9, 'lean canvas has exactly 9 H2 blocks');
  });

  it('BMC file content has correct frontmatter and 9 blocks', () => {
    const { createCanvas } = require('../src/lib/actions');
    const result = createCanvas('vision-y', 'bmc', tempDir);
    const content = fs.readFileSync(result.path, 'utf8');
    assert.match(content, /canvas_type:\s*bmc/, 'has canvas_type: bmc');
    assert.match(content, /parent_vision:\s*["']?vision-y["']?/, 'has parent_vision: vision-y');
    const h2Count = (content.match(/^##\s+/gm) || []).length;
    assert.equal(h2Count, 9, 'BMC has exactly 9 H2 blocks');
  });

  it('rejects invalid canvas type', () => {
    const { createCanvas } = require('../src/lib/actions');
    assert.throws(
      () => createCanvas('vision-z', 'invalid-type', tempDir),
      /canvas type|invalid/i,
      'should reject canvas types other than lean or bmc'
    );
  });

  it('rejects unsafe vision slug (path traversal)', () => {
    const { createCanvas } = require('../src/lib/actions');
    assert.throws(
      () => createCanvas('../etc/passwd', 'lean', tempDir),
      /slug|invalid/i,
      'should reject slugs containing path-traversal characters'
    );
  });

  it('creates plans/canvas/ directory if missing', () => {
    const { createCanvas } = require('../src/lib/actions');
    fs.rmSync(path.join(tempDir, 'plans', 'canvas'), { recursive: true, force: true });
    const result = createCanvas('vision-fresh', 'lean', tempDir);
    assert.ok(fs.existsSync(result.path), 'creates canvas file even if dir was missing');
  });

  it('I1: warns when parent vision does not exist', () => {
    const { createCanvas } = require('../src/lib/actions');
    const result = createCanvas('orphan-vision', 'lean', tempDir);
    assert.ok(Array.isArray(result.warnings), 'returns warnings array');
    assert.ok(result.warnings.length > 0, 'has a warning about missing vision');
    assert.match(result.warnings[0], /vision/i, 'warning mentions vision');
  });

  it('I1: no warning when parent vision exists', () => {
    const { createCanvas } = require('../src/lib/actions');
    const visionPath = path.join(tempDir, 'plans', 'vision', 'real-vision.md');
    fs.writeFileSync(visionPath, '---\ntype: vision\n---\n# Real Vision\n');
    const result = createCanvas('real-vision', 'lean', tempDir);
    assert.equal(result.warnings.length, 0, 'no warning when vision exists');
  });

  it('I2: refuses to overwrite existing canvas without explicit flag', () => {
    const { createCanvas } = require('../src/lib/actions');
    createCanvas('protected-vision', 'lean', tempDir);
    assert.throws(
      () => createCanvas('protected-vision', 'lean', tempDir),
      /already exists/i,
      'should reject second creation without overwrite option'
    );
  });

  it('I2: overwrite: true replaces existing canvas', () => {
    const { createCanvas } = require('../src/lib/actions');
    createCanvas('replace-test', 'lean', tempDir);
    const result = createCanvas('replace-test', 'bmc', tempDir, { overwrite: true });
    const content = fs.readFileSync(result.path, 'utf8');
    assert.match(content, /canvas_type:\s*bmc/, 'canvas was replaced with BMC type');
  });
});

describe('getCanvasForVision (vision-decomposer.js)', () => {
  let tempDir;
  beforeEach(() => { tempDir = createTempProject(); });
  afterEach(() => { cleanup(tempDir); });

  it('returns canvas path when one exists for vision', () => {
    const { createCanvas } = require('../src/lib/actions');
    const { getCanvasForVision } = require('../src/lib/vision-decomposer');
    createCanvas('vision-with-canvas', 'lean', tempDir);
    const canvasPath = getCanvasForVision('vision-with-canvas', tempDir);
    assert.ok(canvasPath, 'returns a path when canvas exists');
    assert.ok(fs.existsSync(canvasPath), 'returned path is a real file');
  });

  it('returns null when no canvas exists for vision', () => {
    const { getCanvasForVision } = require('../src/lib/vision-decomposer');
    const canvasPath = getCanvasForVision('vision-without-canvas', tempDir);
    assert.equal(canvasPath, null, 'returns null when no canvas exists');
  });
});

describe('parseCanvas (vision-decomposer.js)', () => {
  let tempDir;
  beforeEach(() => { tempDir = createTempProject(); });
  afterEach(() => { cleanup(tempDir); });

  it('returns {type, blocks} for a lean canvas', () => {
    const { createCanvas } = require('../src/lib/actions');
    const { parseCanvas } = require('../src/lib/vision-decomposer');
    const { path: canvasPath } = createCanvas('parse-test', 'lean', tempDir);
    const parsed = parseCanvas(canvasPath);
    assert.equal(parsed.type, 'lean', 'type is lean');
    assert.ok(parsed.blocks, 'blocks object is present');
    assert.ok('Problem' in parsed.blocks, 'has Problem block');
    assert.ok('Customer Segments' in parsed.blocks, 'has Customer Segments block');
    assert.ok('Unfair Advantage' in parsed.blocks, 'has Unfair Advantage block');
  });

  it('returns {type, blocks} for a BMC', () => {
    const { createCanvas } = require('../src/lib/actions');
    const { parseCanvas } = require('../src/lib/vision-decomposer');
    const { path: canvasPath } = createCanvas('parse-bmc', 'bmc', tempDir);
    const parsed = parseCanvas(canvasPath);
    assert.equal(parsed.type, 'bmc', 'type is bmc');
    assert.ok('Key Partners' in parsed.blocks, 'has Key Partners block');
    assert.ok('Value Propositions' in parsed.blocks, 'has Value Propositions block');
  });

  it('I3: handles empty block (heading with no body)', () => {
    const { parseCanvas } = require('../src/lib/vision-decomposer');
    const canvasPath = path.join(tempDir, 'plans', 'canvas', 'edge-empty.md');
    fs.writeFileSync(canvasPath, `---
type: canvas
canvas_type: lean
---

# Test

## Problem

## Customer Segments
Some segment.

## Unique Value Proposition
`);
    const parsed = parseCanvas(canvasPath);
    assert.ok('Problem' in parsed.blocks, 'parses empty Problem block');
    assert.equal(parsed.blocks['Problem'], '', 'empty block body is empty string');
    assert.equal(parsed.blocks['Customer Segments'], 'Some segment.', 'non-empty block parsed');
  });

  it('I3: handles whitespace-only block body', () => {
    const { parseCanvas } = require('../src/lib/vision-decomposer');
    const canvasPath = path.join(tempDir, 'plans', 'canvas', 'edge-ws.md');
    fs.writeFileSync(canvasPath, `---
type: canvas
canvas_type: lean
---

# Test

## Problem


## Solution
ok
`);
    const parsed = parseCanvas(canvasPath);
    assert.equal(parsed.blocks['Problem'], '', 'whitespace-only block trims to empty');
    assert.equal(parsed.blocks['Solution'], 'ok', 'subsequent block parsed correctly');
  });

  it('I3: handles last block at end of file (no trailing ##)', () => {
    const { parseCanvas } = require('../src/lib/vision-decomposer');
    const canvasPath = path.join(tempDir, 'plans', 'canvas', 'edge-last.md');
    fs.writeFileSync(canvasPath, `---
type: canvas
canvas_type: lean
---

# Test

## Unfair Advantage
Patent on the core algorithm`);
    const parsed = parseCanvas(canvasPath);
    assert.equal(parsed.blocks['Unfair Advantage'], 'Patent on the core algorithm', 'last block at end of file');
  });
});

describe('plan counts (state.js)', () => {
  let tempDir;
  beforeEach(() => { tempDir = createTempProject(); });
  afterEach(() => { cleanup(tempDir); });

  it('getPlanCounts includes canvas count', () => {
    const { getPlanCounts } = require('../src/lib/state');
    const { createCanvas } = require('../src/lib/actions');
    createCanvas('count-test-1', 'lean', tempDir);
    createCanvas('count-test-2', 'bmc', tempDir);
    const counts = getPlanCounts(tempDir);
    assert.equal(counts.canvas, 2, 'canvas count is 2 after creating 2 canvases');
  });

  it('canvas count is 0 when no canvases exist', () => {
    const { getPlanCounts } = require('../src/lib/state');
    const counts = getPlanCounts(tempDir);
    assert.equal(counts.canvas, 0, 'canvas count is 0 in fresh project');
  });
});
