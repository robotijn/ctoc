/**
 * EC2-s4 — gdpr-agent-runner LIVE wiring tests.
 *
 * PI4: the human-facing surface wires LIVE, and its test drives the REAL flow.
 * No mock stands in for the gate or the Inbox:
 *   - the gate is the REAL `shouldRunGdpr` reading a REAL tmp `.ctoc/settings.yaml`
 *     (+ a copy of the shipped regulatory-regimes/ so loadActiveProfiles sees gdpr.yaml);
 *   - the Inbox is the REAL `src/lib/inbox.js` — assertions read the created
 *     question file(s) back from `.ctoc/inbox/questions/` on disk;
 *   - routing/validation/normalization are the REAL EC2-s1 helpers.
 *
 * Proves: gate OFF ⇒ no-op (no Inbox write); gate ON ⇒ plan-stage finding lands
 * in the real Inbox; code-stage finding is RETURNED (letter path) and NOT Inbox'd;
 * severity is normalized to critical; unknown gdpr_article throws before emission;
 * the registry gained the gdpr-agent entry and its enforcement/operations region
 * is untouched (gate-safety).
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const runner = require('../src/lib/gdpr-agent-runner');

const REPO_ROOT = path.join(__dirname, '..');
const REGIMES_SRC = path.join(REPO_ROOT, '.ctoc', 'regulatory-regimes');
const REGISTRY = path.join(REPO_ROOT, '.ctoc', 'operations-registry.yaml');

function settingsYaml(activeProfilesLine) {
  return [
    'timezone: "UTC"',
    '',
    'regulatory_regime:',
    `  active_profiles: ${activeProfilesLine}`,
    '  overrides: {}',
    '',
    'enforcement:',
    '  mode: strict',
    '',
  ].join('\n');
}

const tmpDirs = [];

// Build a tmp project with a real .ctoc/settings.yaml AND a copy of the shipped
// regulatory-regimes/ dir so the REAL shouldRunGdpr gate resolves gdpr.yaml.
function projectWith(activeProfilesLine) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdpr-runner-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc', 'regulatory-regimes'), { recursive: true });
  for (const f of fs.readdirSync(REGIMES_SRC)) {
    if (f.endsWith('.yaml')) {
      fs.copyFileSync(path.join(REGIMES_SRC, f), path.join(dir, '.ctoc', 'regulatory-regimes', f));
    }
  }
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), settingsYaml(activeProfilesLine));
  return dir;
}

function questionsDir(root) {
  return path.join(root, '.ctoc', 'inbox', 'questions');
}

function listQuestionFiles(root) {
  const dir = questionsDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
}

after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

// ─────────────────────────────────────────────────────────────────────
// 1. Gate OFF ⇒ no output, NO Inbox writes (parent Scenario "Profile absent")
// ─────────────────────────────────────────────────────────────────────

describe('runGdprFindings — gate OFF is a no-op', () => {
  it('1. active_profiles: [] ⇒ {ran:false}, empty results, NO question file written', () => {
    const root = projectWith('[]');
    const res = runner.runGdprFindings(root, [
      { gdpr_article: 'GDPR-13', message: 'email collected — Art.13 notice required' },
    ]);
    assert.equal(res.ran, false);
    assert.deepEqual(res.inbox, []);
    assert.deepEqual(res.letter, []);
    // REAL filesystem proof: nothing was written to the Inbox.
    assert.deepEqual(listQuestionFiles(root), [], 'no Inbox question file on disk when gate off');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2, 6. Gate ON + plan-stage finding ⇒ REAL Inbox question (disk readback)
// ─────────────────────────────────────────────────────────────────────

describe('runGdprFindings — gate ON routes plan-stage findings to the REAL Inbox', () => {
  it('2. plan-stage finding lands in the real Inbox; readback carries message + source_step + article', () => {
    const root = projectWith('[gdpr]');
    const res = runner.runGdprFindings(root, [
      {
        gdpr_article: 'GDPR-13',
        message: 'email collected — Art.13 notice required',
        confidence: 'medium',
        plan: 'signup-flow',
      },
    ]);
    assert.equal(res.ran, true);
    assert.equal(res.inbox.length, 1, 'one Inbox id returned');
    assert.deepEqual(res.letter, [], 'plan-stage finding does not go to the letter path');

    const files = listQuestionFiles(root);
    assert.equal(files.length, 1, 'exactly one question file written to disk');
    const body = fs.readFileSync(path.join(questionsDir(root), files[0]), 'utf8');
    assert.match(body, /email collected — Art\.13 notice required/, 'message in the question body');
    assert.match(body, /source_step:\s*compliance-gdpr/, 'source_step frontmatter set');
    assert.match(body, /source_plan:\s*signup-flow/, 'source_plan frontmatter carried through');
    assert.match(body, /GDPR-13/, 'article appears in the context');
  });

  it('6. GDPR-9 special-category finding flows end-to-end (s1 enum extension proof)', () => {
    const root = projectWith('[gdpr]');
    const res = runner.runGdprFindings(root, [
      { gdpr_article: 'GDPR-9', message: 'health data collected', confidence: 'medium' },
    ]);
    assert.equal(res.ran, true);
    assert.equal(res.inbox.length, 1);
    const files = listQuestionFiles(root);
    assert.equal(files.length, 1);
    const body = fs.readFileSync(path.join(questionsDir(root), files[0]), 'utf8');
    assert.match(body, /health data collected/);
    assert.match(body, /GDPR-9/, 'GDPR-9 passes validateFindingSchema and reaches the Inbox');
    assert.match(body, /critical/, 'severity normalized to critical in context');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3, 4. Gate ON + code-stage finding ⇒ letter route (returned, NOT Inbox'd)
// ─────────────────────────────────────────────────────────────────────

describe('runGdprFindings — code-stage findings take the letter path', () => {
  it('4. code-stage finding is returned in letter[] (severity:critical) and NOT Inbox\'d', () => {
    const root = projectWith('[gdpr]');
    const res = runner.runGdprFindings(root, [
      {
        gdpr_article: 'GDPR-17',
        kind: 'soft-delete-no-purge-schedule',
        target_file: 'src/x.ts',
        target_line: 10,
        message: 'soft-delete without purge schedule',
      },
    ]);
    assert.equal(res.ran, true);
    assert.deepEqual(res.inbox, [], 'no Inbox question created for a code-stage finding');
    assert.equal(res.letter.length, 1, 'code-stage finding returned for the letter path');
    assert.equal(res.letter[0].severity, 'critical', 'severity normalized to critical');
    assert.equal(res.letter[0].target_file, 'src/x.ts', 'code coordinates preserved');
    // REAL filesystem proof: nothing landed in the Inbox for the letter finding.
    assert.deepEqual(listQuestionFiles(root), [], 'no question file on disk for a letter finding');
  });

  it('3. severity is normalized to critical even when the input says medium', () => {
    const root = projectWith('[gdpr]');
    const res = runner.runGdprFindings(root, [
      {
        gdpr_article: 'GDPR-17',
        severity: 'medium',
        target_file: 'src/y.ts',
        target_line: 5,
        message: 'erasure gap',
      },
    ]);
    assert.equal(res.letter.length, 1);
    assert.equal(res.letter[0].severity, 'critical', 'medium upgraded to critical');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Gate ON + unknown gdpr_article ⇒ throws, nothing emitted
// ─────────────────────────────────────────────────────────────────────

describe('runGdprFindings — unknown gdpr_article throws before emission', () => {
  it('5. GDPR-99 ⇒ throws naming the code; NO question file written', () => {
    const root = projectWith('[gdpr]');
    assert.throws(
      () => runner.runGdprFindings(root, [{ gdpr_article: 'GDPR-99', message: 'x' }]),
      /GDPR-99/,
      'thrown message names the offending code',
    );
    assert.deepEqual(listQuestionFiles(root), [], 'no Inbox write for a rejected finding');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Fail-open / defensive input handling
// ─────────────────────────────────────────────────────────────────────

describe('runGdprFindings — fail-open on bad input', () => {
  it('non-array findings ⇒ {ran:true} with empty results (gate on)', () => {
    const root = projectWith('[gdpr]');
    let res;
    assert.doesNotThrow(() => { res = runner.runGdprFindings(root, /** @type {any} */ (null)); });
    assert.equal(res.ran, true);
    assert.deepEqual(res.inbox, []);
    assert.deepEqual(res.letter, []);
    assert.deepEqual(listQuestionFiles(root), []);
  });

  it('missing findings argument ⇒ {ran:true} empty (gate on)', () => {
    const root = projectWith('[gdpr]');
    const res = runner.runGdprFindings(root);
    assert.equal(res.ran, true);
    assert.deepEqual(res.inbox, []);
    assert.deepEqual(res.letter, []);
  });

  it('non-string root ⇒ gate resolves false ⇒ {ran:false}, no throw', () => {
    let res;
    assert.doesNotThrow(() => { res = runner.runGdprFindings(undefined, [{ gdpr_article: 'GDPR-13', message: 'x' }]); });
    assert.equal(res.ran, false);
    assert.deepEqual(res.inbox, []);
    assert.deepEqual(res.letter, []);
  });

  it('mixed batch (plan + code + gate on) routes each independently', () => {
    const root = projectWith('[gdpr]');
    const res = runner.runGdprFindings(root, [
      { gdpr_article: 'GDPR-13', message: 'email plan finding', confidence: 'low' },
      { gdpr_article: 'GDPR-17', target_file: 'src/z.ts', target_line: 3, message: 'code finding' },
    ]);
    assert.equal(res.ran, true);
    assert.equal(res.inbox.length, 1, 'the plan-stage finding was Inbox\'d');
    assert.equal(res.letter.length, 1, 'the code-stage finding took the letter path');
    assert.equal(listQuestionFiles(root).length, 1, 'exactly one question on disk');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7, 8. Registry: gdpr-agent entry present + enforcement region untouched
// ─────────────────────────────────────────────────────────────────────

describe('operations-registry — gdpr-agent LIVE wiring + gate-safety', () => {
  const registrySrc = fs.readFileSync(REGISTRY, 'utf8');

  it('7. registry contains a gdpr-agent entry CTO Chief can discover', () => {
    assert.match(registrySrc, /^\s{2}gdpr-agent:/m, 'gdpr-agent key present under agents:');
    // The entry resolves to the real agent definition path.
    assert.match(registrySrc, /path:\s*agents\/compliance\/gdpr-agent\.md/, 'path resolves to the agent file');
    assert.match(registrySrc, /category:\s*compliance/, 'category: compliance');
    // The agent file the registry points at actually exists on disk.
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, 'agents', 'compliance', 'gdpr-agent.md')),
      'the registered agent definition file exists',
    );
  });

  it('8. registry enforcement/operations region is untouched (no human gate weakened)', () => {
    // The additive entry must not disturb the hook-critical config blocks. The
    // registry has no `enforcement:` block; the gate-safety invariant here is
    // that the quality_matrix + iron_loop human_gate structure is intact and the
    // Core Principles banner ("NEVER block humans") is present unchanged.
    assert.match(registrySrc, /1\. NEVER block humans/, 'Core Principles banner intact');
    // Iron Loop human gates unchanged (three human_gate: true markers on steps 3/6/15).
    const humanGates = [...registrySrc.matchAll(/human_gate:\s*true/g)];
    assert.equal(humanGates.length, 3, 'exactly the three iron-loop human gates remain');
    // The additive entry did not turn the advisory registry into a blocking one.
    // Scoped to the gdpr-agent ENTRY BLOCK (same isolation as the eu-ai-act twin
    // test): an unbounded `gdpr-agent:[\s\S]*?review_gate: true` span would
    // false-positive on the legitimate review_gate markers in the iron_loop
    // section hundreds of lines later.
    const entryRe = /^\s{2}gdpr-agent:\s*$([\s\S]*?)(?=^\s{2}[a-z#]|^[a-z#]|^\s*$)/m;
    const entry = registrySrc.match(entryRe);
    assert.ok(entry, 'gdpr-agent entry block isolated');
    assert.doesNotMatch(entry[0], /review_gate:\s*true/, 'gdpr-agent adds no review gate');
  });
});
