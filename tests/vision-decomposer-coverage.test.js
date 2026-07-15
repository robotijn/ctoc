/**
 * Vision Decomposer — dark-branch coverage tests
 *
 * Drives the REAL src/lib/vision-decomposer module against REAL os.tmpdir()
 * fixtures (zero mocks of core logic — the module is pure logic + filesystem, so
 * the filesystem itself is the only boundary and the temp dir is the fixture).
 *
 * These tests deliberately target the branches the existing suite leaves dark
 * (measured uncovered lines 43-44, 76-122, 156-157, 212-227, 257-258, 276-303):
 *   - parseCanvas throw on a missing file + the `|| 'lean'` type default
 *   - validateVisionReadiness — the entire error/warning matrix
 *   - createStub — the mkdir branch, the dependsOn ternary (join / empty / absent),
 *     and the scope `||` default
 *   - decomposeVision — the scope/dependsOn `||` fallbacks + the empty-goals boundary
 *   - completeVision — the NO-frontmatter prepend else-branch + the already-`type: vision`
 *     "do not add a second marker" false-branch
 *   - listStubs — the parent_vision filter, the scope-match-else, and the
 *     metadata `|| 'none'` / `|| 'stub'` defaults
 *
 * Every assertion pins a branch that goes RED under mutation of the production
 * line it targets; none would still pass against a happy-path-only implementation.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const decomposer = require('../src/lib/vision-decomposer');

// ---------------------------------------------------------------------------
// Fixture helpers — real temp projects on disk, tracked for teardown.
// ---------------------------------------------------------------------------

/** @type {string[]} */
const roots = [];

/** Make a fresh temp project root (tracked so `after` removes it). */
function mkRoot(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ctoc-vd-${label}-`));
  roots.push(root);
  return root;
}

/** Write a vision file under plans/vision/<name>.md and return its path. */
function writeVision(root, name, content) {
  const vdir = path.join(root, 'plans', 'vision');
  fs.mkdirSync(vdir, { recursive: true });
  const p = path.join(vdir, `${name}.md`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

after(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

// ===========================================================================
// parseCanvas — throw path (lines 43-44) + the `canvas_type || 'lean'` default
// ===========================================================================

describe('parseCanvas', () => {
  test('throws a named error when the canvas file does not exist', () => {
    // Arrange
    const missing = path.join(mkRoot('canvas-missing'), 'plans', 'canvas', 'ghost.md');

    // Act + Assert — the `!existsSync` guard must throw, not read undefined bytes.
    assert.throws(
      () => decomposer.parseCanvas(missing),
      /Canvas file not found: .*ghost\.md/,
      'missing canvas must raise the not-found error'
    );
  });

  test('defaults type to "lean" when frontmatter omits canvas_type', () => {
    // Arrange — a canvas with frontmatter but NO canvas_type key.
    const root = mkRoot('canvas-default');
    const cdir = path.join(root, 'plans', 'canvas');
    fs.mkdirSync(cdir, { recursive: true });
    const cpath = path.join(cdir, 'no-type.md');
    fs.writeFileSync(cpath, '---\ntitle: "No Type"\n---\n\n## Problem\nfolks lose data\n', 'utf8');

    // Act
    const parsed = decomposer.parseCanvas(cpath);

    // Assert — pins the SECOND operand of `metadata.canvas_type || 'lean'`.
    assert.equal(parsed.type, 'lean');
    assert.equal(parsed.blocks.Problem, 'folks lose data');
  });
});

// ===========================================================================
// validateVisionReadiness — the whole error/warning matrix (lines 76-122)
// ===========================================================================

describe('validateVisionReadiness', () => {
  const PROBLEM_MSG = 'Missing problem statement. Add a section describing the problem this vision solves.';
  const AUDIENCE_MSG = 'Missing target audience. Add a section describing who this vision serves.';
  const SUCCESS_MSG = 'Missing success criteria. Add a section describing what success looks like.';
  const SCOPE_MSG = 'Missing scope/boundaries definition. Consider adding what is and is not in scope.';
  const MARKER_MSG = 'No vision type marker found. Consider adding "type: vision" to frontmatter.';

  test('reports the file does not exist and returns before reading content', () => {
    // Arrange
    const missing = path.join(mkRoot('vr-missing'), 'plans', 'vision', 'nope.md');

    // Act
    const result = decomposer.validateVisionReadiness(missing);

    // Assert — the early-return guard: exactly one error, ready false, no warnings.
    assert.equal(result.ready, false);
    assert.deepEqual(result.errors, ['Vision file does not exist']);
    assert.deepEqual(result.warnings, []);
  });

  test('a fully-specified vision is ready with zero errors', () => {
    // Arrange — problem, audience, success, scope, and the type:vision marker all present.
    const p = writeVision(mkRoot('vr-ready'), 'ready',
      '---\ntype: vision\n---\n# Idea\nThe problem is exports fail.\n' +
      'Target users are developers.\nSuccess looks like one-click export.\nScope: the export module.\n');

    // Act
    const result = decomposer.validateVisionReadiness(p);

    // Assert
    assert.equal(result.ready, true);
    assert.deepEqual(result.errors, []);
  });

  test('missing problem statement blocks readiness with only the problem error', () => {
    // Arrange — audience/success/scope/marker present; the word "problem" is absent.
    const p = writeVision(mkRoot('vr-noproblem'), 'v',
      '# Idea\nTarget users are developers.\nSuccess looks like shipping.\nScope: the module.\n## Vision: X\n');

    // Act
    const result = decomposer.validateVisionReadiness(p);

    // Assert — the hasProblem branch, in isolation from the sibling checks.
    assert.equal(result.ready, false);
    assert.ok(result.errors.includes(PROBLEM_MSG), 'problem error raised');
    assert.ok(!result.errors.includes(AUDIENCE_MSG), 'audience not falsely flagged');
    assert.ok(!result.errors.includes(SUCCESS_MSG), 'success not falsely flagged');
  });

  test('missing target audience blocks readiness with only the audience error', () => {
    // Arrange — no "target/audience/users/for whom" token anywhere.
    const p = writeVision(mkRoot('vr-noaudience'), 'v',
      '# Idea\nThe problem is exports fail.\nSuccess looks like one-click export.\nScope: the module.\n## Vision: X\n');

    // Act
    const result = decomposer.validateVisionReadiness(p);

    // Assert
    assert.equal(result.ready, false);
    assert.ok(result.errors.includes(AUDIENCE_MSG), 'audience error raised');
    assert.ok(!result.errors.includes(PROBLEM_MSG), 'problem not falsely flagged');
  });

  test('missing success criteria blocks readiness with only the success error', () => {
    // Arrange — the word "success" is absent.
    const p = writeVision(mkRoot('vr-nosuccess'), 'v',
      '# Idea\nThe problem is exports fail.\nTarget users are developers.\nScope: the module.\n## Vision: X\n');

    // Act
    const result = decomposer.validateVisionReadiness(p);

    // Assert
    assert.equal(result.ready, false);
    assert.ok(result.errors.includes(SUCCESS_MSG), 'success error raised');
    assert.ok(!result.errors.includes(PROBLEM_MSG), 'problem not falsely flagged');
  });

  test('missing scope is a WARNING that does not block readiness', () => {
    // Arrange — problem/audience/success/marker present; no scope/boundaries token.
    const p = writeVision(mkRoot('vr-noscope'), 'v',
      '# Idea\nThe problem is exports fail.\nTarget users are developers.\n' +
      'Success looks like one-click export.\n## Vision: X\n');

    // Act
    const result = decomposer.validateVisionReadiness(p);

    // Assert — scope routes to warnings, NOT errors, so ready stays true.
    assert.equal(result.ready, true, 'a missing scope must not block');
    assert.ok(result.warnings.includes(SCOPE_MSG), 'scope warning raised');
    assert.ok(!result.errors.includes(SCOPE_MSG), 'scope is never an error');
  });

  test('an in-body "## Vision:" heading satisfies the marker without frontmatter', () => {
    // Arrange — no `type: vision` frontmatter, but the `## Vision:` heading is present.
    const p = writeVision(mkRoot('vr-heading-marker'), 'v',
      '# Idea\nThe problem is exports fail.\nTarget users are developers.\n' +
      'Success looks like one-click export.\nScope: the module.\n## Vision: The Grand Plan\n');

    // Act
    const result = decomposer.validateVisionReadiness(p);

    // Assert — pins the SECOND operand of `type === 'vision' || /## Vision:/i.test()`.
    assert.ok(!result.warnings.includes(MARKER_MSG), 'heading marker suppresses the warning');
  });

  test('no frontmatter marker AND no "## Vision:" heading raises the marker warning', () => {
    // Arrange — neither marker form present.
    const p = writeVision(mkRoot('vr-nomarker'), 'v',
      '# Idea\nThe problem is exports fail.\nTarget users are developers.\n' +
      'Success looks like one-click export.\nScope: the module.\n');

    // Act
    const result = decomposer.validateVisionReadiness(p);

    // Assert — both operands false → warning present (ready still true, all dims met).
    assert.equal(result.ready, true);
    assert.ok(result.warnings.includes(MARKER_MSG), 'marker warning raised when neither form present');
  });
});

// ===========================================================================
// createStub — mkdir branch (156-157), dependsOn ternary, scope default
// ===========================================================================

describe('createStub', () => {
  test('creates the functional directory when it does not yet exist', () => {
    // Arrange — a pristine root with no plans/functional dir.
    const root = mkRoot('cs-mkdir');
    const vp = writeVision(root, 'the-vision', '# Vision: v\n');
    const functionalDir = path.join(root, 'plans', 'functional');
    assert.ok(!fs.existsSync(functionalDir), 'precondition: no functional dir');

    // Act
    const stub = decomposer.createStub('the-vision', { title: 'First Goal', scope: 'ship it' }, vp, root);

    // Assert — the mkdir branch ran and produced a real file.
    assert.ok(fs.existsSync(functionalDir), 'functional dir created');
    assert.equal(stub.name, 'the-vision-first-goal');
    assert.ok(fs.existsSync(stub.path), 'stub file written to disk');
  });

  test('joins a non-empty dependsOn list into the depends_on field', () => {
    // Arrange
    const root = mkRoot('cs-depjoin');
    const vp = writeVision(root, 'v', '# Vision: v\n');

    // Act
    const stub = decomposer.createStub('v', { title: 'G', scope: 's', dependsOn: ['a-plan', 'b-plan'] }, vp, root);

    // Assert — the TRUE arm of `dependsOn && dependsOn.length > 0 ? join : 'none'`.
    const body = fs.readFileSync(stub.path, 'utf8');
    assert.match(body, /depends_on: "a-plan, b-plan"/);
  });

  test('an EMPTY dependsOn array falls back to "none" (length-boundary)', () => {
    // Arrange
    const root = mkRoot('cs-depempty');
    const vp = writeVision(root, 'v', '# Vision: v\n');

    // Act
    const stub = decomposer.createStub('v', { title: 'G', scope: 's', dependsOn: [] }, vp, root);

    // Assert — `.length > 0` is false for [], so the ternary picks 'none'.
    const body = fs.readFileSync(stub.path, 'utf8');
    assert.match(body, /depends_on: "none"/);
  });

  test('an ABSENT dependsOn falls back to "none" (short-circuit first operand)', () => {
    // Arrange
    const root = mkRoot('cs-depabsent');
    const vp = writeVision(root, 'v', '# Vision: v\n');

    // Act
    const stub = decomposer.createStub('v', { title: 'G', scope: 's' }, vp, root);

    // Assert — `goal.dependsOn && ...` short-circuits to falsy → 'none'.
    const body = fs.readFileSync(stub.path, 'utf8');
    assert.match(body, /depends_on: "none"/);
  });

  test('an absent scope falls back to the "Extracted from parent vision" placeholder', () => {
    // Arrange
    const root = mkRoot('cs-scopedefault');
    const vp = writeVision(root, 'v', '# Vision: v\n');

    // Act
    const stub = decomposer.createStub('v', { title: 'Goal Without Scope' }, vp, root);

    // Assert — the SECOND operand of `goal.scope || '...'`.
    const body = fs.readFileSync(stub.path, 'utf8');
    assert.match(body, /## Problem Statement\nExtracted from parent vision\. Needs refinement by Product Owner\./);
  });

  test('a provided scope becomes the Problem Statement body (first operand)', () => {
    // Arrange
    const root = mkRoot('cs-scopegiven');
    const vp = writeVision(root, 'v', '# Vision: v\n');

    // Act
    const stub = decomposer.createStub('v', { title: 'Goal', scope: 'users cannot export data' }, vp, root);

    // Assert
    const body = fs.readFileSync(stub.path, 'utf8');
    assert.match(body, /## Problem Statement\nusers cannot export data/);
  });
});

// ===========================================================================
// decomposeVision — scope/dependsOn `||` fallbacks + empty-goals (212-227)
// ===========================================================================

describe('decomposeVision', () => {
  test('produces one stub per goal, deriving the slug from the vision basename', () => {
    // Arrange
    const root = mkRoot('dv-multi');
    const vp = writeVision(root, 'my-big-idea', '# Vision: v\n');

    // Act
    const { stubs } = decomposer.decomposeVision(vp, [
      { title: 'Alpha', scope: 'alpha scope', dependsOn: ['x'] },
      { title: 'Beta', scope: 'beta scope', dependsOn: [] }
    ], root);

    // Assert — real files, slug carries the vision basename.
    assert.equal(stubs.length, 2);
    assert.equal(stubs[0].name, 'my-big-idea-alpha');
    assert.equal(stubs[1].name, 'my-big-idea-beta');
    assert.ok(stubs.every(s => fs.existsSync(s.path)), 'every stub written to disk');
  });

  test('a goal without scope/dependsOn yields empty-string scope and empty-array deps', () => {
    // Arrange
    const root = mkRoot('dv-fallback');
    const vp = writeVision(root, 'idea', '# Vision: v\n');

    // Act — goal carries neither scope nor dependsOn.
    const { stubs } = decomposer.decomposeVision(vp, [{ title: 'Bare Goal' }], root);

    // Assert — pins `goal.scope || ''` and `goal.dependsOn || []`.
    assert.equal(stubs.length, 1);
    assert.equal(stubs[0].scope, '', 'scope defaults to empty string');
    assert.deepEqual(stubs[0].dependsOn, [], 'dependsOn defaults to empty array');
  });

  test('an empty goals array produces an empty stubs array and writes nothing', () => {
    // Arrange
    const root = mkRoot('dv-empty');
    const vp = writeVision(root, 'idea', '# Vision: v\n');

    // Act — the empty-collection boundary: map over [].
    const { stubs } = decomposer.decomposeVision(vp, [], root);

    // Assert
    assert.deepEqual(stubs, []);
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'functional')), 'no functional dir created for zero goals');
  });
});

// ===========================================================================
// completeVision — no-frontmatter prepend (257-258) + already-vision false arm
// ===========================================================================

describe('completeVision', () => {
  test('prepends a full frontmatter block to a vision that has none', () => {
    // Arrange — a plain vision doc with NO leading `---` fence.
    const root = mkRoot('cv-nofm');
    const vp = writeVision(root, 'plain', '# Vision: Plain Idea\n\nSome body text.\n');

    // Act
    const { newPath } = decomposer.completeVision(vp, root);

    // Assert — the else-branch injected the block; original body survives; moved to done/.
    const out = fs.readFileSync(newPath, 'utf8');
    assert.ok(out.startsWith('---\ntype: vision\nstatus: decomposed\ndecomposed_at: "'), 'block prepended');
    assert.match(out, /# Vision: Plain Idea/, 'original body preserved');
    assert.ok(newPath.includes(path.join('plans', 'done')), 'moved into plans/done');
  });

  test('does NOT add a second type marker when the vision is already type: vision', () => {
    // Arrange — frontmatter already declares type: vision.
    const root = mkRoot('cv-alreadyvision');
    const vp = writeVision(root, 'marked', '---\ntype: vision\ntitle: "Marked"\n---\n# body\n');

    // Act
    const { newPath } = decomposer.completeVision(vp, root);

    // Assert — the `metadata.type !== 'vision'` guard is FALSE, so exactly one marker.
    const out = fs.readFileSync(newPath, 'utf8');
    const markerCount = (out.match(/type: vision/g) || []).length;
    assert.equal(markerCount, 1, 'no duplicate type marker inserted');
    assert.match(out, /status: decomposed/, 'decomposition status still stamped');
  });
});

// ===========================================================================
// listStubs — parent_vision filter, scope-match else, metadata defaults (276-303)
// ===========================================================================

describe('listStubs', () => {
  test('returns only stubs whose parent_vision matches the requested slug', () => {
    // Arrange — two stubs under different parent visions in the same functional dir.
    const root = mkRoot('ls-filter');
    const alphaVision = writeVision(root, 'alpha-vision', '# Vision: A\n');
    const betaVision = writeVision(root, 'beta-vision', '# Vision: B\n');
    decomposer.createStub('alpha-vision', { title: 'First Goal', scope: 'ship exports' }, alphaVision, root);
    decomposer.createStub('beta-vision', { title: 'Other Goal', scope: 'unrelated' }, betaVision, root);

    // Act
    const stubs = decomposer.listStubs('alpha-vision', root);

    // Assert — the `parentVision.includes(visionSlug)` filter excludes beta.
    assert.equal(stubs.length, 1, 'only the alpha stub is listed');
    const s = stubs[0];
    assert.equal(s.name, 'alpha-vision-first-goal');
    assert.equal(s.scope, 'ship exports', 'scope pulled from the Problem Statement first line');
    assert.equal(s.status, 'stub');
    assert.equal(s.dependsOn, 'none');
  });

  test('falls back to empty scope and default metadata for a bare functional plan', () => {
    // Arrange — a hand-written plan: parent_vision matches, but there is NO
    // depends_on/status key and NO "## Problem Statement" section.
    const root = mkRoot('ls-fallback');
    const fdir = path.join(root, 'plans', 'functional');
    fs.mkdirSync(fdir, { recursive: true });
    fs.writeFileSync(
      path.join(fdir, 'bare-plan.md'),
      '---\ntitle: "Bare"\nparent_vision: "vision/gamma-vision.md"\n---\n\n# Bare\n\nno problem section here\n',
      'utf8'
    );

    // Act
    const stubs = decomposer.listStubs('gamma-vision', root);

    // Assert — scope-match ternary FALSE arm + `depends_on || 'none'` + `status || 'stub'`.
    assert.equal(stubs.length, 1);
    assert.equal(stubs[0].scope, '', 'no Problem Statement → empty scope');
    assert.equal(stubs[0].dependsOn, 'none', 'absent depends_on defaults to none');
    assert.equal(stubs[0].status, 'stub', 'absent status defaults to stub');
  });

  test('returns an empty list when no functional plan matches the slug', () => {
    // Arrange — a stub exists, but under a different vision.
    const root = mkRoot('ls-nomatch');
    const vp = writeVision(root, 'delta-vision', '# Vision: D\n');
    decomposer.createStub('delta-vision', { title: 'G', scope: 's' }, vp, root);

    // Act
    const stubs = decomposer.listStubs('epsilon-vision', root);

    // Assert
    assert.deepEqual(stubs, []);
  });
});
