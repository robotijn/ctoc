// Compliance-claims-match-code fence.
//
// The one defect in this repository that can hurt a user LEGALLY is a claim that
// the product ENFORCES a regulatory control it does not enforce. This fence makes
// that claim impossible to reintroduce silently.
//
// The rule is a MARKER requirement, not a natural-language judgement (a fence that
// guesses at English cries wolf and gets deleted). It has two mechanical halves:
//
//   1. ENFORCED is COMPUTED from the code. A control is enforced iff its name is a
//      string-literal argument to `isControlEnabled(` in either (a) comment-stripped
//      `src/**/*.js`, or (b) a FENCED code block of a shipped instruction surface
//      (`agents/**/*.md`, `src/commands/*.md`, `skills/**/SKILL.md`). A COMMENT is not
//      a caller (`four-eyes.js:24`); a prose CITATION outside a fence is not a caller
//      either — same discipline the reachability fence uses.
//   2. Every claim-surface BLOCK naming a NOT-enforced control must carry the literal
//      marker `NOT ENFORCED`. Blocks: a table row and a list item are their own unit
//      (marked in-place); a heading or prose paragraph is covered by a marker anywhere
//      in its heading-delimited section. Fenced code and settings/YAML examples are
//      NOT claim surface. And a marker must NEVER sit on an ENFORCED control's own
//      block (a stale marker gets removed when a control is finally wired).
//
// Zero-controls-found, zero-files-scanned, empty-ENFORCED, or an unreadable doc all
// FAIL — a blind scan that reports "honest" is exactly the false-green shape this
// repository fences elsewhere.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Control list — parsed from the KNOWN_CONTROLS Set literal in the live source.
// ---------------------------------------------------------------------------
function parseControls(regSource) {
  const start = regSource.indexOf('const KNOWN_CONTROLS');
  if (start === -1) throw new Error('KNOWN_CONTROLS not found in regulatory-regime.js');
  const end = regSource.indexOf(']);', start);
  if (end === -1) throw new Error('KNOWN_CONTROLS set literal is not closed');
  const body = regSource.slice(start, end);
  const names = new Set();
  for (const m of body.matchAll(/'([a-z0-9_]+)'/g)) names.add(m[1]);
  return names;
}

// ---------------------------------------------------------------------------
// JavaScript comment stripper (a comment is not a caller). A compact state
// machine over code / line-comment / block-comment / string / template, so a
// `require` or `isControlEnabled(` inside a comment does not resurrect a control.
// Line structure is preserved so a comment cannot merge two code lines.
// ---------------------------------------------------------------------------
function stripJsComments(src) {
  let out = '';
  let state = 'code';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = i + 1 < src.length ? src[i + 1] : '';
    if (state === 'code') {
      if (c === '/' && n === '/') { state = 'line'; i++; continue; }
      if (c === '/' && n === '*') { state = 'block'; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { state = c; out += c; continue; }
      out += c; continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; out += '\n'; } continue; }
    if (state === 'block') { if (c === '*' && n === '/') { state = 'code'; i++; } else if (c === '\n') out += '\n'; continue; }
    // inside a string / template literal
    if (c === '\\') { out += c + n; i++; continue; }
    if (c === state) { state = 'code'; out += c; continue; }
    out += c;
  }
  return out;
}

// Lines of a Markdown file that lie INSIDE a fenced code block (``` … ```),
// including the two fence delimiter lines themselves.
function fencedMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { mask[i] = true; inFence = !inFence; continue; }
    mask[i] = inFence;
  }
  return mask;
}

const CALL_RE = /isControlEnabled\s*\(\s*[A-Za-z_$][\w$.]*\s*,\s*['"]([a-z0-9_]+)['"]/g;

function collectFiles(root, subdir, filter) {
  const base = path.join(root, subdir);
  const out = [];
  if (!fs.existsSync(base)) return out;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && filter(full)) out.push(full);
    }
  };
  walk(base);
  return out;
}

// ENFORCED = every control name consulted by a real `isControlEnabled(` call.
function computeEnforced(root) {
  const enforced = new Set();
  // (a) JS sources — comment-stripped.
  for (const f of collectFiles(root, 'src', (p) => p.endsWith('.js'))) {
    const code = stripJsComments(fs.readFileSync(f, 'utf8'));
    for (const m of code.matchAll(CALL_RE)) enforced.add(m[1]);
  }
  // (b) Shipped instruction surfaces — only INSIDE fenced code blocks (a call the
  //     session RUNS lives in a recipe; a prose citation is not a call).
  const surfaces = [
    ...collectFiles(root, 'agents', (p) => p.endsWith('.md')),
    ...collectFiles(root, path.join('src', 'commands'), (p) => p.endsWith('.md')),
    ...collectFiles(root, 'skills', (p) => p.endsWith('SKILL.md')),
  ];
  for (const f of surfaces) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    const fenced = fencedMask(lines);
    for (let i = 0; i < lines.length; i++) {
      if (!fenced[i]) continue;
      for (const m of lines[i].matchAll(CALL_RE)) enforced.add(m[1]);
    }
  }
  return enforced;
}

// Claim surfaces (Case-4 scope): all agent + doc + top-level README/CLAUDE prose.
function collectClaimFiles(root) {
  const files = [
    ...collectFiles(root, 'agents', (p) => p.endsWith('.md')),
    ...collectFiles(root, 'docs', (p) => p.endsWith('.md') && path.dirname(p) === path.join(root, 'docs')),
  ];
  for (const name of ['README.md', 'CLAUDE.md']) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) files.push(p);
  }
  return files;
}

const MARKER = 'NOT ENFORCED';

function lineType(line) {
  if (/^\s*#{1,6}\s/.test(line)) return 'heading';
  if (/^\s*\|/.test(line)) return 'table';
  if (/^\s*([-*+]|\d+[.)])\s/.test(line)) return 'list';
  if (line.trim() === '') return 'blank';
  return 'prose';
}

// The fine block of line i: a table row is itself; a list item is itself plus its
// indented continuation lines; a prose line is its blank-delimited paragraph; a
// heading is itself.
function fineBlock(lines, fenced, i) {
  const t = lineType(lines[i]);
  if (t === 'table' || t === 'heading') return [i, i];
  if (t === 'list') {
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (fenced[j] || lineType(lines[j]) !== 'prose') break;
      end = j;
    }
    return [i, end];
  }
  // prose: expand to the surrounding paragraph
  let start = i, end = i;
  while (start - 1 >= 0 && !fenced[start - 1] && lineType(lines[start - 1]) === 'prose') start--;
  while (end + 1 < lines.length && !fenced[end + 1] && lineType(lines[end + 1]) === 'prose') end++;
  return [start, end];
}

function rangeHasMarker(lines, [a, b]) {
  for (let i = a; i <= b; i++) if (lines[i].includes(MARKER)) return true;
  return false;
}

// Section of line i: the heading-delimited range [start, end] (a section runs from
// its heading line to the line before the next heading; pre-first-heading content
// is its own leading section).
function section(lines, fenced, i) {
  let start = i;
  while (start >= 0) {
    if (!fenced[start] && lineType(lines[start]) === 'heading') break;
    start--;
  }
  if (start < 0) start = 0;
  let end = lines.length - 1;
  for (let j = i + 1; j < lines.length; j++) {
    if (!fenced[j] && lineType(lines[j]) === 'heading') { end = j - 1; break; }
  }
  return [start, end];
}

// Scan one claim file's text. PURE — controls/enforced are supplied so fixtures
// can prove the logic without the live repo's wording. Returns violations:
//   { rule: 1, ... }  an unenforced control named in a block with no marker
//   { rule: 2, ... }  a marker sitting on an ENFORCED control's own block
function scanClaimFile(text, controls, enforced, file) {
  const lines = text.split('\n');
  const fenced = fencedMask(lines);
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const t = lineType(lines[i]);
    if (t === 'blank') continue;
    for (const control of controls) {
      if (!lines[i].includes(control)) continue;
      if (enforced.has(control)) {
        // Rule 2: the enforced control's own block must not carry a stale marker.
        if (rangeHasMarker(lines, fineBlock(lines, fenced, i))) {
          violations.push({ rule: 2, file, line: i + 1, control, blockType: t });
        }
        continue;
      }
      // Rule 1: an unenforced control's claim must carry the marker.
      const marked = (t === 'table' || t === 'list')
        ? rangeHasMarker(lines, fineBlock(lines, fenced, i))
        : rangeHasMarker(lines, section(lines, fenced, i));
      if (!marked) violations.push({ rule: 1, file, line: i + 1, control, blockType: t });
    }
  }
  return violations;
}

function runFence(root) {
  const controls = parseControls(fs.readFileSync(path.join(root, 'src/lib/regulatory-regime.js'), 'utf8'));
  const enforced = computeEnforced(root);
  const claimFiles = collectClaimFiles(root);
  const violations = [];
  const filesWithTokens = new Set();
  for (const f of claimFiles) {
    const text = fs.readFileSync(f, 'utf8'); // throws on unreadable — fail closed
    const rel = path.relative(root, f);
    const v = scanClaimFile(text, controls, enforced, rel);
    if (v.length) violations.push(...v);
    const lines = text.split('\n');
    const fenced = fencedMask(lines);
    const hasToken = lines.some((ln, idx) => !fenced[idx] && [...controls].some((c) => ln.includes(c)));
    if (hasToken) filesWithTokens.add(rel);
  }
  return { controls, enforced, claimFiles, filesWithTokens, violations };
}

// ---------------------------------------------------------------------------

describe('compliance claims match code — the marker fence', () => {
  const result = runFence(REPO);

  it('Case 1 — the analysis is non-vacuous (a blind scan must FAIL, never pass)', () => {
    assert.ok(result.controls.size > 20, `control list is degenerate: ${result.controls.size}`);
    assert.ok(result.claimFiles.length > 5, `too few claim files scanned: ${result.claimFiles.length}`);
    assert.ok(result.filesWithTokens.size > 5, `too few files carry a control token: ${result.filesWithTokens.size}`);
    assert.ok(result.enforced.size > 0, 'ENFORCED is empty — the code-side scan is blind');
    assert.ok(result.enforced.has('independent_verification_validation'),
      'the one wired control is not detected as enforced');
  });

  it('Case 2 — ENFORCED is computed from a real call, not hardcoded', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-enf-'));
    fs.mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'lib', 'x.js'),
      "if (isControlEnabled(root, 'planted_control')) { doThing(); }\n");
    assert.ok(computeEnforced(dir).has('planted_control'));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('Case 3 — a comment cannot enforce a control (the four-eyes.js:24 shape)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-cmt-'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'y.js'),
      " /* isControlEnabled(root, 'ghost_control') */\n// isControlEnabled(root, 'ghost_control')\n");
    assert.ok(!computeEnforced(dir).has('ghost_control'));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('Case 4 — the repository is honest today (every unenforced claim carries the marker)', () => {
    const bad = result.violations
      .map((v) => `  ${v.file}:${v.line} rule${v.rule} [${v.blockType}] ${v.control}`)
      .join('\n');
    assert.equal(result.violations.length, 0,
      `unmarked / mis-marked control claims:\n${bad}`);
  });

  it('Case 5 — a re-introduced bare claim FAILS (the regression this fence exists for)', () => {
    const doc = [
      '## Four-eyes at Gate 3',
      '',
      'Gate 3 requires two distinct approvers when `four_eyes_gate3` is active.',
      '',
    ].join('\n');
    const v = scanClaimFile(doc, new Set(['four_eyes_gate3']), new Set(), 'fixture.md');
    assert.ok(v.some((x) => x.rule === 1 && x.control === 'four_eyes_gate3'),
      'a bare unenforced claim must be flagged');
  });

  it('Case 6 — a stale marker on an ENFORCED control also FAILS', () => {
    const doc = [
      '- The `independent_verification_validation` control. **NOT ENFORCED**: wrong.',
      '',
    ].join('\n');
    const v = scanClaimFile(doc, new Set(['independent_verification_validation']),
      new Set(['independent_verification_validation']), 'fixture.md');
    assert.ok(v.some((x) => x.rule === 2 && x.control === 'independent_verification_validation'),
      'a marker on an enforced control must be flagged as stale');
  });

  it('Case 6b — an enforced control WITHOUT a stray marker is clean', () => {
    const doc = '- The `independent_verification_validation` control re-runs Steps 11/13/14.\n';
    const v = scanClaimFile(doc, new Set(['independent_verification_validation']),
      new Set(['independent_verification_validation']), 'fixture.md');
    assert.equal(v.length, 0);
  });

  it('Case 7 — the hook really does not consult four-eyes (pins the doc mis-statement)', () => {
    const hook = fs.readFileSync(path.join(REPO, 'src/hooks/human-gate-check.js'), 'utf8');
    assert.ok(!/four.?eyes/i.test(hook), 'human-gate-check.js must not reference four-eyes');
    assert.ok(!/four_eyes_gate3/.test(hook));
    assert.ok(!/verifyFourEyes/.test(hook));
  });

  it('Case 8 — the menu tells the truth (RECORDED, not ENFORCED)', () => {
    const { attachComplianceQuestion } = require('../src/commands/start.js');
    const r = { text: 'BASE-DASHBOARD', ask: { questions: [] }, actions: {} };
    attachComplianceQuestion(r, path.join(os.tmpdir(), 'nope'));
    assert.match(r.text, /NOT ENFORCED/, 'banner must say the controls are NOT ENFORCED');
    assert.match(r.text, /RECORDED/, 'banner must say the regime is RECORDED');
    const q = r.ask.questions.find((x) => x.header === 'Compliance');
    assert.ok(q, 'compliance question present');
    assert.deepEqual(q.options.map((o) => o.label), ['None', 'GDPR', 'EU AI Act', 'Both']);
    for (const a of ['none', 'gdpr', 'eu-ai-act', 'both']) {
      assert.ok(Object.values(r.actions).includes(`claude:set-compliance-regime ${a}`),
        `action ${a} preserved`);
    }
  });

  it('Case 9 — the compliance DISPATCH recipe is untouched (the one wired path)', () => {
    const chief = fs.readFileSync(path.join(REPO, 'agents/coordinator/cto-chief.md'), 'utf8');
    assert.ok(chief.includes('runComplianceForTransition('), 'dispatch recipe present');
    assert.ok(chief.includes('evaluateComplianceTrigger('), 'trigger recipe present');
    assert.ok(chief.includes('dispatcher: "cto-chief"'), 'dispatcher literal present');
  });
});
