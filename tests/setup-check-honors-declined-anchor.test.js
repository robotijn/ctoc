'use strict';

/**
 * THE SETUP CHECK HONORS THE DECLINED ANCHOR CTOC ITSELF WROTE.
 *
 * A live user opened CTOC on a project that had explicitly DECLINED a compliance
 * regime — recorded by CTOC's own setup as `declined: true`, the correct choice
 * for a demo with no regulated data — and the setup-completeness check reported
 * "no usable regulatory_regime.active_profiles anchor", flagged the project "not
 * fully set up", and ran the pipeline half-alive (no questions, no
 * implementation). The owner's words: "how can it use the old settings after an
 * update? that is soooo wrong."
 *
 * THE DEFECT. `complianceAnchorUsable` in `src/commands/start.js` imports
 * `regulatory-regime.loadActiveProfiles` — the READER OF RECORD, which it even
 * names `readerOfRecord` — then IGNORES that reader's verdict and re-derives a
 * stricter one: it demands a literal non-empty inline `active_profiles:` line and
 * returns `false` when that line is absent. But the reader treats `declined:
 * true` as a first-class, COMPLETE "None" anchor. So the completeness check
 * rejects the exact value CTOC's own writer produces and CTOC's own reader
 * honors. Two predicates for one fact, disagreeing.
 *
 * THE CONTRACT (from the plan). An anchor is USABLE when the reader of record can
 * determine the regime from it: EITHER `declined === true`, OR an
 * `active_profiles` line is present (a non-empty inline list, OR an explicit
 * empty `[]` meaning "none selected"). It is NOT usable ONLY when the block
 * carries NEITHER an active_profiles line NOR `declined: true` — a genuinely
 * unconfigured anchor. Closing the disagreement is the fix; this is not loosening
 * a check to go green.
 *
 * These tests drive the REAL exported `verifySetup` and assert what a HUMAN'S
 * setup verdict IS: whether the settings file is flagged missing FOR THE ANCHOR
 * REASON. `verifySetup` also checks state/stage-dir artifacts, so each fixture
 * writes only settings and we assert on the presence/absence of the anchor-reason
 * entry in `missing` — that isolates the anchor verdict from the rest of setup.
 * Zero doubles: every fixture is a real settings file on disk driven through the
 * real predicate.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { verifySetup } = require('../src/commands/start.js');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-declined-anchor-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

/** Write a `.ctoc/settings.yaml` with the given body at the project root. */
function writeSettings(body) {
  const p = path.join(dir, '.ctoc', 'settings.yaml');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, 'utf8');
}

/**
 * Did `verifySetup` flag the settings file FOR THE ANCHOR REASON? The anchor
 * message is the only `missing` entry that names `regulatory_regime`; state and
 * stage-dir entries never do, so this cleanly isolates the anchor verdict.
 */
function anchorFlagged(root) {
  const { missing } = verifySetup(root);
  return missing.some((m) => m.includes('regulatory_regime'));
}

describe('setup check honors the declined anchor CTOC itself wrote', () => {
  it('declined: true with NO active_profiles line — anchor USABLE, not flagged (THE DEFECT: red pre-fix)', () => {
    // Exactly what CTOC's own writer produces when the human declines a regime.
    writeSettings('regulatory_regime:\n  declined: true\n');
    assert.equal(
      anchorFlagged(dir),
      false,
      'a declined regime is a COMPLETE choice CTOC wrote and its reader honors; ' +
        'the completeness check must not flag the settings as missing an anchor',
    );
  });

  it('active_profiles: [gdpr] inline non-empty — usable, not flagged (regression guard)', () => {
    writeSettings('regulatory_regime:\n  active_profiles: [gdpr]\n');
    assert.equal(anchorFlagged(dir), false, 'a non-empty inline profile list is a usable anchor');
  });

  it('active_profiles: [] explicit empty — usable, not flagged (the explicit-none case the live patch used)', () => {
    writeSettings('regulatory_regime:\n  active_profiles: []\n');
    assert.equal(
      anchorFlagged(dir),
      false,
      'an explicit empty list means "none selected" — the reader determines the regime, so it is usable',
    );
  });

  it('block with NEITHER active_profiles NOR declined — NOT usable, flagged (keeps its teeth)', () => {
    // A regulatory_regime block that carries neither marker: genuinely unconfigured.
    writeSettings('regulatory_regime:\n  overrides:\n    gdpr_dpo: someone\n');
    assert.equal(
      anchorFlagged(dir),
      true,
      'neither an active_profiles line nor declined:true — the reader cannot determine a regime, so it is not usable',
    );
  });

  it('no regulatory_regime block at all — NOT usable, flagged (keeps its teeth)', () => {
    writeSettings('enforcement:\n  mode: strict\n');
    assert.equal(
      anchorFlagged(dir),
      true,
      'no regulatory_regime block — nothing to determine a regime from, so it is not usable',
    );
  });
});
