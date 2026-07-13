/**
 * W11-s7 — Dead agent-init wrapper removal guard (finding B2).
 *
 * src/lib/actions.js defined and exported five one-line "init an agent" wrappers
 * with ZERO call sites anywhere in src/ or tests/:
 *   initResearchAgent, initCriticAgent, initDecomposerAgent,
 *   initProductOwnerAgent, initReviewAgent.
 * The two real state-transition spawns (approvePlan, completeExecution) call the
 * generic initBackgroundAgent() directly, bypassing all five. This permanent
 * regression guard asserts the dead wrappers are gone AND the live generic spawn
 * survives — so the dead code cannot silently reappear.
 *
 * It FAILS on the pre-fix tree (the five names are present as definitions and
 * exports) and PASSES once they are deleted.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DEAD_WRAPPERS = [
  'initResearchAgent',
  'initCriticAgent',
  'initDecomposerAgent',
  'initProductOwnerAgent',
  'initReviewAgent'
];

// Roots to sweep. This guard test's own file is excluded (it names the wrappers
// as string literals on purpose).
const SRC_DIR = path.join(__dirname, '..', 'src');
const TESTS_DIR = __dirname;
const SELF = path.basename(__filename);

// Recursively collect *.js files under a directory.
function collectJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== SELF) {
      out.push(full);
    }
  }
  return out;
}

describe('W11-s7 dead-export guard (B2) — 5 agent-init wrappers stay deleted', () => {
  it('no source or test file references any of the 5 dead wrapper names', () => {
    const files = [...collectJsFiles(SRC_DIR), ...collectJsFiles(TESTS_DIR)];
    const offenders = [];

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const name of DEAD_WRAPPERS) {
        // Word-bounded match so a longer identifier can never partial-match.
        const re = new RegExp(`\\b${name}\\b`);
        if (re.test(src)) {
          offenders.push(`${path.relative(path.join(__dirname, '..'), file)} references ${name}`);
        }
      }
    }

    assert.deepEqual(
      offenders, [],
      offenders.length === 0
        ? 'no dead-wrapper references remain'
        : `B2 VIOLATION: dead agent-init wrappers are still referenced:\n  ${offenders.join('\n  ')}`
    );
  });

  it('the live generic spawn initBackgroundAgent is still exported', () => {
    const actions = require('../src/lib/actions');
    assert.equal(typeof actions.initBackgroundAgent, 'function',
      'initBackgroundAgent (the live generic spawn) must remain exported');
  });

  it('none of the 5 dead wrappers are exported from actions.js', () => {
    const actions = require('../src/lib/actions');
    for (const name of DEAD_WRAPPERS) {
      assert.equal(actions[name], undefined, `${name} must NOT be exported`);
    }
  });
});
