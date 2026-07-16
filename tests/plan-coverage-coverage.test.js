/**
 * Coverage + mutation tests for src/lib/plan-coverage.js
 *
 * This module drives the mandatory-pipeline enforcement decision: a wrong glob
 * match wrongly ALLOWS an edit that no plan covers, or wrongly BLOCKS an edit a
 * plan does cover. Every test below pins a branch that goes RED under mutation of
 * the production code — not line-coverage theater. The aim points where the bugs
 * live: the `*`-vs-`**` segment boundary, the `?` single-char class, metachar
 * escaping, stage-priority ordering (in-progress > todo > implementation),
 * most-specific-glob-wins, malformed/absent `files:` handling, the next-top-level
 * -key break in the frontmatter walk, and the bidirectional `||` in touchesOverlap.
 *
 * Fixtures are real os.tmpdir() directories, cleaned in finally/after. The real
 * module is loaded — no mocking of core logic; the only boundary is the filesystem
 * and we use real temp files there (fakes, not mocks).
 *
 * AI-generated, human-reviewed line-by-line per the unit-test-writer skill.
 *
 * DOCUMENTED UNREACHABLE (honesty clause — no fabricated hit):
 *   plan-coverage.js — the `catch { return true; }` inside touchesOverlap. It
 *   fires only when `globToRegex(a).test(b)` (or the b→a direction) THROWS.
 *   globToRegex now compiles the glob into a linear-time matcher (tokenize +
 *   bottom-up dynamic program — NO `new RegExp`, no backtracking); both
 *   tokenize and match are TOTAL functions that never throw for any input
 *   (`.test` even coerces a non-string arg via String()). The two loop guards
 *   above it (`typeof a !== 'string'`) additionally skip every non-string entry
 *   before it can reach globToRegex, so no public-API call can make it throw.
 *   Reaching the catch would require monkeypatching the module internals, which
 *   the public surface never emits. Documented, not faked.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  findCoveringPlan,
  readPlanFiles,
  globToRegex,
  touchesOverlap,
} = require('../src/lib/plan-coverage');

// ---------------------------------------------------------------------------
// Fixture helpers — real temp dirs, selective stage creation.
// ---------------------------------------------------------------------------

/**
 * Create a temp project root. `stages` controls WHICH plans/<stage> dirs exist,
 * so a test can omit a stage dir to exercise the "stage dir missing → continue"
 * branch in findCoveringPlan.
 */
function makeRoot(stages = ['in-progress', 'todo', 'implementation']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-plancov-'));
  for (const s of stages) fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  return dir;
}

function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

/** Write a plan with a `files:` block into plans/<stage>/<name>.md. */
function writePlan(root, stage, name, files) {
  const yaml = files.map(f => `  - "${f}"`).join('\n');
  const content = `---\ntitle: "${name}"\nprogram: ctoc-v7\nfiles:\n${yaml}\n---\n# ${name}\n`;
  fs.writeFileSync(path.join(root, 'plans', stage, `${name}.md`), content);
}

/** Write arbitrary raw content to plans/<stage>/<name.ext>. */
function writeRaw(root, stage, filename, content) {
  const p = path.join(root, 'plans', stage, filename);
  fs.writeFileSync(p, content);
  return p;
}

// ===========================================================================
// globToRegex — the segment-boundary semantics that decide every match.
// KILLS: swapping `[^/]*`↔`.*`, `[^/]`↔`.`, dropping the `**/` slash-consume,
//        dropping the metachar escape.
// ===========================================================================

describe('globToRegex', () => {
  it('single_star_does_not_cross_a_slash', () => {
    // `*` must be [^/]* — matches within one path segment only.
    const re = globToRegex('src/*.js');

    assert.equal(re.test('src/foo.js'), true, 'src/*.js matches src/foo.js');
    assert.equal(re.test('src/lib/foo.js'), false, 'src/*.js must NOT cross the slash into src/lib/foo.js');
  });

  it('double_star_crosses_slashes', () => {
    // `**` must be .* — matches across path separators.
    const re = globToRegex('src/**');

    assert.equal(re.test('src/lib/deep/x.js'), true, 'src/** matches nested path');
    assert.equal(re.test('lib/x.js'), false, 'src/** is still anchored at src/');
  });

  it('double_star_slash_consume_matches_zero_intermediate_segments', () => {
    // Pins line 50: after `**` a following `/` is consumed, so `a/**/b` matches
    // `a/b` (zero middle segments) AND `a/x/y/b` (many). A mutant that drops the
    // slash-consume leaves `a/.*/b` which cannot match `a/b`.
    const re = globToRegex('a/**/b.js');

    assert.equal(re.test('a/b.js'), true, 'a/**/b.js matches a/b.js (zero middle segments)');
    assert.equal(re.test('a/x/y/b.js'), true, 'a/**/b.js matches a/x/y/b.js (many segments)');
  });

  it('leading_double_star_slash_matches_root_level', () => {
    // The documented "**/x matches x" case (line 50 comment).
    const re = globToRegex('**/x.md');

    assert.equal(re.test('x.md'), true, '**/x.md matches a root-level x.md');
    assert.equal(re.test('deep/nested/x.md'), true, '**/x.md matches a nested x.md');
  });

  it('question_mark_matches_exactly_one_non_slash_char', () => {
    // `?` must be [^/]: exactly one char, never a slash, never zero, never two.
    // The slash-rejection is load-bearing: it is the ONLY input that distinguishes
    // [^/] from a bare `.` — a `?`->`.` mutant matches a slash and is caught only
    // here, not by the count assertions (`.` also matches exactly one char).
    const re = globToRegex('src/?.js');

    assert.equal(re.test('src/a.js'), true, '? matches a single char');
    assert.equal(re.test('src/ab.js'), false, '? does not match two chars');
    assert.equal(re.test('src/.js'), false, '? does not match zero chars');
    assert.equal(globToRegex('a?b').test('a/b'), false, '? does NOT match a slash (kills ?->. )');
  });

  it('literal_dot_is_escaped_not_a_wildcard', () => {
    // The metachar-escape branch (line 58): a literal `.` in the glob must match
    // only a real dot. A mutant that drops escaping turns `.` into "any char".
    const re = globToRegex('src/a.js');

    assert.equal(re.test('src/a.js'), true, 'literal dot matches a real dot');
    assert.equal(re.test('src/aXjs'), false, 'escaped dot does NOT match an arbitrary char');
  });

  it('is_fully_anchored_no_substring_match', () => {
    // `^...$` anchoring — a covered glob must not match by prefix/suffix.
    const re = globToRegex('src/foo.js');

    assert.equal(re.test('xsrc/foo.js'), false, 'not a suffix match');
    assert.equal(re.test('src/foo.jsx'), false, 'not a prefix match');
  });

  it('globstar_then_star_mixed_matches_across_and_within_segments', () => {
    // Pins the linear matcher on the exact case a naive single-star-backtrack
    // matcher gets WRONG: `**/*x` = globstar (crosses `/`) then star (one
    // segment) then a literal. The old `.*[^/]*x` regex handled it; the linear
    // dynamic program must reproduce it EXACTLY — an earlier globstar has to be
    // able to absorb a `/` so a later slash-bounded `*` can still land the
    // literal. Semantics: `^.*[^/]*x$`.
    const re = globToRegex('**/*x');

    assert.equal(re.test('x'), true, '** and * both empty, literal x lands');
    assert.equal(re.test('a/bx'), true, '** absorbs "a/", * absorbs "b", then x');
    assert.equal(re.test('a/b/cx'), true, '** absorbs "a/b/", * absorbs "c", then x');
    assert.equal(re.test('a/bxy'), false, 'must END at the literal x (anchored)');
  });

  it('an_adversarial_star_literal_glob_matches_in_linear_time_not_redos', () => {
    // ReDoS regression (HIGH). A plan `files:` entry is author-controlled — LLM
    // agents (an in-model taint source) or anyone who can drop a plan .md — and
    // is `.test()`-ed on EVERY file edit by the PreToolUse enforcement hook
    // (PreToolUse.Edit → findCoveringPlan → globToRegex → test). The former
    // glob→regex path emitted `^([^/]*a){15}$` — textbook catastrophic
    // backtracking: `*a`×N against `a`×M + a trailing `/` (which forces total
    // failure, so the engine explores every wildcard distribution) is
    // exponential in N. Measured against the old code: `*a`×10 vs `a`×40 + "/"
    // took ~5.1–5.7s and roughly DOUBLED per added `*a`, so a ~40-char entry
    // hangs the hook indefinitely. The hook fails OPEN only on a thrown error;
    // a HANG is neither an error nor time-bounded, so it stalls every edit in
    // the project. The linear (O(tokens × chars)) matcher has no backtracking,
    // so this must complete essentially instantly regardless of glob shape.
    const glob = '*a'.repeat(15); // 30-char author-controlled files: entry
    const input = 'a'.repeat(40) + '/'; // non-matching: trailing '/' can't be [^/]*
    const re = globToRegex(glob);

    const t0 = Date.now();
    const result = re.test(input);
    const elapsed = Date.now() - t0;

    assert.equal(result, false, 'the adversarial glob does not match the non-matching input');
    assert.ok(
      elapsed < 50,
      `glob matching must be linear-time (< 50ms); took ${elapsed}ms — catastrophic backtracking`
    );
  });
});

// ===========================================================================
// touchesOverlap — the file-conflict safety oracle. Bidirectional predicate.
// KILLS: dropping either operand of the `||`, the array/empty guards, the
//        empty-string/non-string entry skips, the a===b fast path.
// ===========================================================================

describe('touchesOverlap', () => {
  it('returns_false_when_either_side_is_not_an_array', () => {
    // Line 89 guard. Non-array input must never be treated as overlapping.
    assert.equal(touchesOverlap('src/x.js', ['src/x.js']), false, 'string aList → false');
    assert.equal(touchesOverlap(['src/x.js'], null), false, 'null bList → false');
    assert.equal(touchesOverlap(null, null), false, 'both null → false');
  });

  it('returns_false_when_either_side_is_empty', () => {
    // Line 90 guard — an empty declaration overlaps with nothing.
    assert.equal(touchesOverlap([], ['src/x.js']), false, 'empty aList → false');
    assert.equal(touchesOverlap(['src/x.js'], []), false, 'empty bList → false');
  });

  it('matches_on_exact_string_equality_skipping_empty_and_non_string_entries', () => {
    // Exercises the `a === b` fast path (line 95) AND the per-entry skips for
    // empty strings / non-strings (lines 92 & 94) that precede a real match.
    const result = touchesOverlap(['', 42, 'src/x.js'], [null, '', 'src/x.js']);

    assert.equal(result, true, 'exact literal equality overlaps despite junk entries');
  });

  it('detects_overlap_when_a_glob_matches_b_as_literal', () => {
    // FIRST operand of the || (globToRegex(a).test(b)).
    const result = touchesOverlap(['src/**'], ['src/lib/auth.js']);

    assert.equal(result, true, 'glob on aList side matches literal on bList side');
  });

  it('detects_overlap_when_b_glob_matches_a_as_literal', () => {
    // SECOND operand of the || (globToRegex(b).test(a)) — the one the first
    // operand short-circuits dark. A mutant deleting it reds this test.
    const result = touchesOverlap(['src/lib/auth.js'], ['src/**']);

    assert.equal(result, true, 'glob on bList side matches literal on aList side');
  });

  it('returns_false_when_no_pair_overlaps', () => {
    // The fall-through `return false` (line 104): disjoint declarations.
    const result = touchesOverlap(['src/a.js', 'src/*.ts'], ['tests/b.js', 'docs/**']);

    assert.equal(result, false, 'disjoint file sets do not overlap');
  });
});

// ===========================================================================
// readPlanFiles — the frontmatter `files:` parser.
// KILLS: read-error path, no-frontmatter path, absent-files path, the
//        next-top-level-key break, the blank-line-continue-not-break.
// ===========================================================================

describe('readPlanFiles', () => {
  let root;
  before(() => { root = makeRoot(['todo']); });
  after(() => { rm(root); });

  it('returns_empty_array_when_file_cannot_be_read', () => {
    // Line 116 catch — a path that does not exist.
    const missing = path.join(root, 'plans', 'todo', 'does-not-exist.md');

    assert.deepEqual(readPlanFiles(missing), []);
  });

  it('returns_empty_array_when_document_has_no_frontmatter', () => {
    // Line 123 — no leading --- fence.
    const p = writeRaw(root, 'todo', 'no-fm.md', '# Just a heading\n\nfiles:\n  - "src/x.js"\n');

    assert.deepEqual(readPlanFiles(p), [], 'a files: line in the BODY is not frontmatter');
  });

  it('returns_empty_array_when_frontmatter_has_no_files_key', () => {
    // Line 127 — frontmatter present but no `files:` block.
    const p = writeRaw(root, 'todo', 'no-files.md', '---\ntitle: "x"\nprogram: ctoc-v7\n---\n# body\n');

    assert.deepEqual(readPlanFiles(p), []);
  });

  it('parses_quoted_unquoted_and_single_quoted_entries', () => {
    const p = writeRaw(
      root, 'todo', 'mixed-quotes.md',
      '---\nfiles:\n  - "src/a.js"\n  - src/b.js\n  - \'src/c.js\'\n---\n# body\n'
    );

    assert.deepEqual(readPlanFiles(p), ['src/a.js', 'src/b.js', 'src/c.js']);
  });

  it('stops_collecting_at_the_next_top_level_key', () => {
    // Line 135 break: a sibling top-level key that itself has a list must NOT
    // bleed its entries into files:. Without the break, "src/LEAK.js" is wrongly
    // collected.
    const p = writeRaw(
      root, 'todo', 'sibling-key.md',
      '---\nfiles:\n  - "src/a.js"\nother:\n  - "src/LEAK.js"\n---\n# body\n'
    );

    const result = readPlanFiles(p);
    assert.deepEqual(result, ['src/a.js'], 'entries under a later key are not part of files:');
    assert.equal(result.includes('src/LEAK.js'), false, 'the break stopped the leak');
  });

  it('continues_past_a_blank_line_within_the_files_block', () => {
    // Pins that the break condition is specifically `^\S` (next key), NOT "any
    // non-matching line". A blank line between entries must NOT stop collection.
    const p = writeRaw(
      root, 'todo', 'blank-line.md',
      '---\nfiles:\n  - "src/a.js"\n\n  - "src/b.js"\ntitle: after\n---\n# body\n'
    );

    assert.deepEqual(readPlanFiles(p), ['src/a.js', 'src/b.js']);
  });
});

// ===========================================================================
// findCoveringPlan — the enforcement decision itself.
// KILLS: stage-priority ordering, most-specific-wins, the `*` non-crossing in a
//        real decision, the .md/.gitkeep filter, missing-stage-dir continue,
//        absolute-path support, and the "no coverage → null" default.
// ===========================================================================

describe('findCoveringPlan', () => {
  it('returns_null_when_no_plan_covers_the_target', () => {
    const root = makeRoot();
    try {
      writePlan(root, 'todo', 'plan-a', ['src/foo.js']);

      assert.equal(findCoveringPlan('src/bar.js', root), null);
    } finally { rm(root); }
  });

  it('covers_a_target_and_returns_stage_plan_and_matching_glob', () => {
    const root = makeRoot();
    try {
      writePlan(root, 'todo', 'plan-a', ['src/foo.js']);

      const match = findCoveringPlan('src/foo.js', root);
      assert.deepEqual(
        { stage: match.stage, glob: match.glob, plan: match.plan },
        { stage: 'todo', glob: 'src/foo.js', plan: 'todo/plan-a' }
      );
    } finally { rm(root); }
  });

  it('single_star_glob_does_not_cover_a_nested_file', () => {
    // A real enforcement decision riding on the [^/]* semantics: `src/*.js` must
    // NOT authorize an edit to src/lib/deep.js. Mutant `[^/]*`→`.*` reds this.
    const root = makeRoot();
    try {
      writePlan(root, 'todo', 'shallow', ['src/*.js']);

      assert.equal(findCoveringPlan('src/foo.js', root).glob, 'src/*.js', 'covers same-segment file');
      assert.equal(findCoveringPlan('src/lib/deep.js', root), null, 'does NOT cover a nested file');
    } finally { rm(root); }
  });

  it('in_progress_wins_over_todo_and_implementation', () => {
    // Stage priority ordering (STAGE_PRIORITY[0]). All three declare the target.
    const root = makeRoot();
    try {
      writePlan(root, 'implementation', 'impl', ['src/x.js']);
      writePlan(root, 'todo', 'td', ['src/x.js']);
      writePlan(root, 'in-progress', 'inp', ['src/x.js']);

      assert.equal(findCoveringPlan('src/x.js', root).stage, 'in-progress');
    } finally { rm(root); }
  });

  it('todo_wins_over_implementation', () => {
    // The MIDDLE of the priority ordering — pins that todo precedes implementation,
    // not merely that in-progress precedes everything. Mutant swapping the last
    // two STAGE_PRIORITY entries reds this.
    const root = makeRoot();
    try {
      writePlan(root, 'implementation', 'impl', ['src/y.js']);
      writePlan(root, 'todo', 'td', ['src/y.js']);

      assert.equal(findCoveringPlan('src/y.js', root).stage, 'todo');
    } finally { rm(root); }
  });

  it('falls_through_to_implementation_when_it_is_the_only_covering_stage', () => {
    // Pins that implementation IS considered (not dropped): a lower-priority stage
    // still covers when no higher stage does.
    const root = makeRoot();
    try {
      writePlan(root, 'implementation', 'impl', ['src/z.js']);

      assert.equal(findCoveringPlan('src/z.js', root).stage, 'implementation');
    } finally { rm(root); }
  });

  it('most_specific_glob_wins_within_a_stage', () => {
    // specificity() + `score > best.score` (lines 179-181). Two plans in ONE
    // stage both match; the concrete path must beat the `**` wildcard regardless
    // of readdir order. Mutant flipping the comparator reds this.
    const root = makeRoot();
    try {
      writePlan(root, 'todo', 'broad', ['src/**']);
      writePlan(root, 'todo', 'exact', ['src/lib/foo.js']);

      assert.equal(findCoveringPlan('src/lib/foo.js', root).glob, 'src/lib/foo.js');
    } finally { rm(root); }
  });

  it('ignores_non_markdown_and_gitkeep_files_in_a_stage_dir', () => {
    // The `.endsWith('.md') && f !== '.gitkeep'` filter (line 170). A .txt file
    // with a valid-looking files: block must NOT be honored as a plan.
    const root = makeRoot();
    try {
      writeRaw(root, 'todo', 'notes.txt', '---\nfiles:\n  - "src/leak.js"\n---\n');
      writeRaw(root, 'todo', '.gitkeep', '');

      assert.equal(findCoveringPlan('src/leak.js', root), null, 'a .txt plan is not enforced');
    } finally { rm(root); }
  });

  it('skips_a_missing_stage_directory_without_throwing', () => {
    // Line 169 continue: only plans/todo exists; in-progress and implementation
    // dirs are absent. The walk must skip them and still find the todo plan.
    const root = makeRoot(['todo']);
    try {
      writePlan(root, 'todo', 'only', ['src/w.js']);

      const match = findCoveringPlan('src/w.js', root);
      assert.equal(match.stage, 'todo', 'found despite absent higher-priority stage dirs');
    } finally { rm(root); }
  });

  it('accepts_an_absolute_target_path', () => {
    // Line 164 branch: path.isAbsolute(targetFile) === true. The absolute target
    // is relativized against root before matching.
    const root = makeRoot(['todo']);
    try {
      writePlan(root, 'todo', 'abs', ['src/abs.js']);
      const absTarget = path.join(root, 'src', 'abs.js');

      const match = findCoveringPlan(absTarget, root);
      assert.equal(match.glob, 'src/abs.js', 'absolute target resolves to the same coverage');
    } finally { rm(root); }
  });

  it('returns_null_when_no_stage_directories_exist_at_all', () => {
    // No plans/* dirs — every existsSync is false, the loop yields nothing.
    const root = makeRoot([]);
    try {
      assert.equal(findCoveringPlan('src/anything.js', root), null);
    } finally { rm(root); }
  });
});

// ===========================================================================
// findCoveringPlan — ROOT CONFINEMENT (out-of-repo write prevention).
// A plan whose `files:` declares a root-escaping glob (e.g. "../../**") must
// NEVER vouch for a path outside the project tree. The coverage oracle backs
// the Edit hook's allow-decision; without confinement, an agent-authored plan
// (plans/**.md are edit-whitelisted) could authorize an arbitrary out-of-repo
// file write. Two independent guards: (1) reject an escaping relTarget, and
// (2) ignore any plan glob that itself contains a `..` path segment.
// ===========================================================================

describe('findCoveringPlan — root confinement', () => {
  it('returns_null_for_an_out_of_repo_absolute_target_even_when_a_traversal_plan_covers_it', () => {
    // The core CVE: a plan declaring files: ["../../**"] must not authorize a
    // write to a path OUTSIDE root. Under the unpatched oracle, relTarget is
    // "../../../../etc/passwd" and globToRegex("../../**") → /^\.\./\.\./.*$/
    // matches it, so the plan is (wrongly) returned. The confinement guard must
    // reject the escaping target and return null.
    const root = makeRoot(['todo']);
    try {
      writePlan(root, 'todo', 'traversal', ['../../**']);
      const outside = path.resolve(root, '..', '..', '..', '..', 'etc', 'passwd');

      assert.equal(
        findCoveringPlan(outside, root),
        null,
        'an out-of-repo target must never be covered, regardless of a traversal plan'
      );
    } finally { rm(root); }
  });

  it('returns_null_for_a_relative_traversal_target', () => {
    // Same guard via a relative "../../etc/x" target string (path.join then
    // path.relative still yields a "../"-prefixed relTarget).
    const root = makeRoot(['todo']);
    try {
      writePlan(root, 'todo', 'traversal', ['../../**']);

      assert.equal(
        findCoveringPlan('../../etc/x', root),
        null,
        'a relative traversal target escapes root and must not be covered'
      );
    } finally { rm(root); }
  });

  it('ignores_a_traversal_glob_so_it_never_covers_even_an_in_repo_path', () => {
    // Defense in depth: a `..`-containing glob is skipped entirely. It must not
    // cover an in-repo file either (a glob like "../<root-basename>/src/x.js"
    // could otherwise resolve back inside the tree). The plan declares only the
    // escaping glob, so nothing it lists is honored.
    const root = makeRoot(['todo']);
    try {
      const base = path.basename(root);
      writePlan(root, 'todo', 'sneaky', [`../${base}/src/x.js`]);

      assert.equal(
        findCoveringPlan('src/x.js', root),
        null,
        'a glob containing a ".." segment is ignored and covers nothing'
      );
    } finally { rm(root); }
  });

  it('a_non_escaping_dotdot_glob_STILL_covers_its_in_repo_file', () => {
    // Re-attack fix: a `..` SEGMENT is not an ESCAPE. `src/mod/../mod/**`
    // normalizes back inside the tree to `src/mod/**` and must keep covering
    // `src/mod/thing.js` — the confinement guard must not over-block it.
    const root = makeRoot(['todo']);
    try {
      writePlan(root, 'todo', 'noesc', ['src/mod/../mod/**']);
      const hit = findCoveringPlan('src/mod/thing.js', root);
      assert.ok(hit, 'a non-escaping ".."-glob still covers its in-repo file');
      assert.equal(hit.plan, 'todo/noesc');
    } finally { rm(root); }
  });

  it('still_covers_an_in_repo_file_via_a_legit_glob_no_regression', () => {
    // The confinement must NOT disturb normal in-repo coverage: a plan covering
    // src/** still covers src/lib/x.js exactly as before.
    const root = makeRoot(['todo']);
    try {
      writePlan(root, 'todo', 'legit', ['src/**']);

      const match = findCoveringPlan('src/lib/x.js', root);
      assert.equal(match && match.glob, 'src/**', 'in-repo coverage is unchanged by confinement');
    } finally { rm(root); }
  });
});
