'use strict';

/**
 * THE RULE UNDER TEST: a screen says what the MOMENT IS, in plain words, never its
 * number.
 *
 * The owner opened the tool and was handed "approved at Gate 3; deploy is a SEPARATE
 * human ship gate". A gate number is an internal code out of CTOC's own
 * documentation; printing it assumes the reader carries a numbered map of the
 * pipeline in their head. Two such strings remained on live render paths in
 * `src/lib/menu-screens.js` after the gate-screen slice landed:
 *
 *   1. the deploy-ready notice on the escalations door (`inbox escalations`)
 *   2. the completion status line printed by `menu task complete`
 *
 * Every case below asserts over TEXT A PERSON READS, obtained by driving the real
 * render path — never by asserting that a function returned a string.
 *
 * ── The gate-number pattern ──────────────────────────────────────────────────
 * `/\bgates?\s*[0-9]/i` catches "Gate 3", "gate3", "gates 1". It deliberately does
 * NOT catch the word "gate" alone: "ship gate" is jargon and is dealt with by the
 * jargon cases, not by the number fence, so a failure names one defect at a time.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ms = require('../src/lib/menu-screens');
const taskRegistry = require('../src/lib/task-registry');
const { invalidate } = require('../src/lib/cache');

/** A gate NUMBER reaching a human. The one thing this slice exists to kill. */
const GATE_NUMBER = /\bgates?\s*[0-9]/i;

/**
 * Stage-directory names as STANDALONE words. `implementation` inside
 * "implementation details" is still the raw stage token; the word boundary is what
 * makes this an assertion about vocabulary rather than about substrings.
 */
const RAW_STAGE = /\b(functional|implementation|todo|in-progress)\b/i;

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-saysmoment-'));
  invalidate(); // the read cache is process-global; a fresh tmp root must not see stale counts
});
afterEach(() => {
  invalidate();
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

function mkProject(r) {
  for (const s of STAGES) fs.mkdirSync(path.join(r, 'plans', s), { recursive: true });
  fs.mkdirSync(path.join(r, '.ctoc', 'state'), { recursive: true });
  fs.mkdirSync(path.join(r, '.ctoc', 'logs'), { recursive: true });
  fs.mkdirSync(path.join(r, 'src'), { recursive: true });
  fs.writeFileSync(path.join(r, 'src', 'thing.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(r, 'package.json'), JSON.stringify({
    name: 'a-real-slice', version: '1.0.0', main: 'src/thing.js',
    scripts: { test: 'node -e "process.exit(0)"' }
  }, null, 2));
}

/** Write N deploy-ready notices — the log `inboxEscalationsScreen` reads. */
function seedDeployReady(r, n) {
  const notices = [];
  for (let i = 0; i < n; i += 1) {
    notices.push({ plan: `a-shipped-slice-${i}`, at: new Date().toISOString(), message: 'ready' });
  }
  fs.writeFileSync(path.join(r, '.ctoc', 'logs', 'deploy-ready.json'), JSON.stringify(notices));
}

/** The escalations door, reached exactly the way a human reaches it. */
function escalationsText(r) {
  return ms.route(['inbox', 'escalations'], r).text;
}

/**
 * The one line the deploy-ready NOTICE BLOCK renders as.
 *
 * Anchored on the two-space block indent, NOT merely on the words: the screen's
 * own header ("Inbox ▸ Escalations & deploy-ready (1)") also contains "deploy" and
 * a count, and selecting it made cases 1, 3 and 7 assert over the header — passing
 * vacuously while the defective line one row below went unread. A selector that can
 * silently match the wrong line turns a fence into decoration.
 */
function deployLine(text) {
  const candidates = text.split('\n').filter((l) => /^ {2}\S/.test(l) && /deploy/i.test(l) && /\(\d+\)/.test(l));
  assert.equal(
    candidates.length, 1,
    `expected exactly ONE indented deploy-ready summary line, saw ${candidates.length} in:\n${text}`
  );
  return candidates[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// The deploy-ready notice
// ═══════════════════════════════════════════════════════════════════════════

describe('the deploy-ready notice says the moment, not the number', () => {
  it('case 1: the deploy-ready line carries no gate number', () => {
    mkProject(root);
    seedDeployReady(root, 1);
    const line = deployLine(escalationsText(root));
    assert.doesNotMatch(
      line, GATE_NUMBER,
      `a gate number reached a human on the deploy-ready line: ${line}`
    );
  });

  it('case 2: it still says deploying is the human\'s call', () => {
    mkProject(root);
    seedDeployReady(root, 1);
    const line = deployLine(escalationsText(root));
    assert.match(line, /separate decision/i, `the line must still say deploying is a separate decision: ${line}`);
    assert.match(line, /still yours/i, `the line must still say the decision is the human's: ${line}`);
  });

  it('case 3: the count survives', () => {
    mkProject(root);
    seedDeployReady(root, 2);
    const line = deployLine(escalationsText(root));
    assert.match(line, /\(2\)/, `the count is real information and must survive: ${line}`);
  });

  it('case 7: no bare stage name reaches the deploy line', () => {
    mkProject(root);
    seedDeployReady(root, 1);
    const line = deployLine(escalationsText(root));
    assert.doesNotMatch(
      line, RAW_STAGE,
      `a raw stage-directory name reached a human on the deploy-ready line: ${line}`
    );
  });

  it('case 6: with no deploy-ready notices the screen says neither the new wording nor the old', () => {
    mkProject(root);
    const text = escalationsText(root);
    assert.doesNotMatch(text, /Waiting to be deployed/i, 'no notices → no deploy-ready block at all');
    assert.doesNotMatch(text, /approved at Gate/i, 'the old wording must be gone from the codebase entirely');
    // The rest of the screen still renders — the door is not broken by the re-word.
    assert.match(text, /Escalations/i, 'the escalations door still renders its own content');
    assert.match(text, /No circuit-breaker escalations/i, 'the empty-state line still renders');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The whole screen — the fence that catches the site nobody remembered
// ═══════════════════════════════════════════════════════════════════════════

describe('no gate number reaches a human on the dashboard render path', () => {
  it('case 4: the dashboard AND the doors it links to carry no gate number', () => {
    mkProject(root);
    seedDeployReady(root, 3);
    // Plans in every stage, so every conditional branch of the dashboard renders.
    for (const s of STAGES) {
      fs.writeFileSync(
        path.join(root, 'plans', s, 'a-plan.md'),
        '---\ntitle: "A plan"\ntype: implementation\n---\n\n# A plan\n'
      );
    }
    const dashboard = ms.buildDashboardTable(root);
    const door = escalationsText(root);
    const everything = `${dashboard}\n${door}`;

    assert.doesNotMatch(
      everything, GATE_NUMBER,
      'a gate number reached a human somewhere on the dashboard render path:\n' +
      everything.split('\n').filter((l) => GATE_NUMBER.test(l)).join('\n')
    );
  });

  it('case 4b: the dashboard\'s own deploy-ready count says the moment, not the jargon', () => {
    mkProject(root);
    seedDeployReady(root, 2);
    const dashboard = ms.buildDashboardTable(root);
    const line = dashboard.split('\n').find((l) => /deploy/i.test(l));
    assert.ok(line, `expected a deploy-ready count on the dashboard:\n${dashboard}`);
    assert.doesNotMatch(line, /ship gate/i, `"ship gate" is jargon a reader cannot decode: ${line}`);
    assert.match(line, /still yours/i, `the dashboard count must say whose decision deploying is: ${line}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The completion status line
// ═══════════════════════════════════════════════════════════════════════════

function planBody() {
  return `---
approved_by: human
approved_at: 2026-07-14T10:00:00.000Z
gate_crossed: implementation → todo
---

---
title: "A real slice"
type: implementation
iron_loop: true
files:
  - "src/thing.js"
---

# A real slice

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] Tests written and red first

### Step 9: PREPARE
- [x] Environment ready

### Step 10: IMPLEMENT
- [x] Code written

### Step 11: REVIEW
- [x] Self-reviewed

### Step 12: OPTIMIZE
- [x] No redundant work

### Step 13: SECURE
- [x] Inputs validated

### Step 14: VERIFY
- [x] Lint, types, all tests green

### Step 15: DOCUMENT
- [x] Docs updated

### Step 16: FINAL-REVIEW
- [x] Ready for human review
`;
}

describe('the completion status line names what the evidence is for', () => {
  it('case 5: a real completion reports in plain words, with no gate number', () => {
    mkProject(root);
    const slug = 'a-real-slice';
    fs.writeFileSync(path.join(root, 'plans', 'in-progress', `${slug}.md`), planBody());
    const reg = taskRegistry.load(root);
    const t = taskRegistry.addTask(reg, { kind: 'implement', plan: slug, touches: ['src/thing.js'] });
    taskRegistry.updateTask(reg, t.id, { status: 'running' });
    taskRegistry.save(root, reg);

    // THE ACT — the real route, the real completion, no mocks.
    const res = ms.route(['menu', 'task', 'complete', t.id, '--summary', 'built it'], root);
    assert.equal(res.ok, true, `completion must succeed, saw: ${res.error || ''}`);
    assert.ok(res.completion && res.completion.ran, 'the real completion must have run');

    const text = res.text;
    assert.doesNotMatch(
      text, GATE_NUMBER,
      `a gate number reached a human on the completion line: ${text}`
    );
    assert.match(
      text, /when you decide it['’]s finished/i,
      `the line must name what the evidence is FOR, in the human's frame: ${text}`
    );
    // The verdict is still reported — the re-word must not drop the information.
    assert.match(text, /checks? (passed|failed)/i, `the verdict must survive: ${text}`);
    // And the internal step name is gone with the number.
    assert.doesNotMatch(text, /\bVERIFY\b/, `"VERIFY" is an internal step name: ${text}`);
    assert.doesNotMatch(text, /plan → review/, `"plan → review" is pipeline jargon: ${text}`);
  });
});
