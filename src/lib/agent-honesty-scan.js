'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  THE LIMIT, STATED FIRST — read this before trusting anything below.
//
//  This scans agent DEFINITIONS. It does NOT and CANNOT check agent OUTPUT.
//  A model's prose reaches the human directly — no hook, no compile step, no
//  interception point, and there never will be one. This module raises the floor
//  on what agents are TOLD. It proves nothing about what any agent actually SAID.
//
//  Its one job: census the dispatchable definitions, report which lack the shared
//  honest-status instruction, and — the discipline this whole plan is about —
//  FAIL LOUD on any file it could not read. "I could not read it" and "I read it
//  and it complies" are different facts; a scanner that returns the success value
//  for both is this repository's central defect class, and it would be a stupid
//  one to commit inside a plan about agents asserting things they never verified.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const safeFs = require('./safe-fs');

// The reference every dispatchable definition must carry. Matched as a literal
// substring — the target is documentation text, so a text scan is honest here.
const FRAGMENT_REF = 'honest-status.md';

// The fragment's own marker and the six points it must cover. Anchors are literal
// lowercased substrings, not English guesses: a referenced fragment that has been
// emptied out passes every reference check while teaching nothing (plan case 4).
const FRAGMENT_MARKER = 'HONEST STATUS';
const REQUIRED_SECTIONS = [
  'assertion rule',
  'absence rule',
  'temporal structure',
  'subsystem',
  'vocabulary',
  'worked example',
];

// Below this many dispatchable definitions, a census has a broken glob, not a
// shrunken repository — and would otherwise report a clean pass over files it
// never read. Deliberately well below the true count (124 today) so ordinary
// growth and pruning never trip it. This is the guard that makes the fence fail
// loud on input it cannot enumerate.
const NON_VACUITY_FLOOR = 100;

/**
 * True when a definition's YAML frontmatter carries a `name:` key. Shared
 * fragments and non-dispatchable includes have none. Mechanical scope test — not
 * a filename convention, not a hand-kept list that would rot silently.
 * @param {string} content
 * @returns {boolean}
 */
function isDispatchable(content) {
  if (typeof content !== 'string') return false;
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return false;
  return /^name:\s*\S/m.test(m[1]);
}

/**
 * Scan one agent definition. NEVER throws, NEVER returns a passing result for a
 * file it could not understand.
 * @param {string} absPath
 * @returns {{available:true, dispatchable:boolean, hasFragmentRef:boolean}
 *          |{available:false, reason:string}}
 */
function scanAgentFile(absPath) {
  let content;
  try {
    if (!safeFs.existsSync(absPath)) {
      return { available: false, reason: `unreadable: ${path.basename(absPath)} does not exist` };
    }
    content = safeFs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return { available: false, reason: `unreadable: ${path.basename(absPath)} (${err.message})` };
  }
  if (!content.trim()) {
    return { available: false, reason: `empty: ${path.basename(absPath)}` };
  }
  if (!/^---\r?\n[\s\S]*?\r?\n---/.test(content)) {
    return { available: false, reason: `no frontmatter: ${path.basename(absPath)}` };
  }
  return {
    available: true,
    dispatchable: isDispatchable(content),
    hasFragmentRef: content.includes(FRAGMENT_REF),
  };
}

// Walk agents/ for .md files, skipping dotfiles and underscore-prefixed includes
// (mirrors iron-loop-enforcer.listAgents). Confined under `root`: readdir names
// are joined onto the resolved base, never followed as arbitrary paths.
function listAgentFiles(root) {
  const out = [];
  const base = path.join(root, 'agents');
  function walk(dir) {
    if (!safeFs.existsSync(dir)) return;
    for (const entry of safeFs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) out.push(full);
    }
  }
  walk(base);
  return out;
}

/**
 * Census the dispatchable definitions. If ANY file is unavailable, or the
 * dispatchable count falls below the non-vacuity floor, the whole result is
 * `available:false` — never a passing empty `missing` list over files it did not
 * read.
 * @param {string} root
 * @param {{minDispatchable?:number}} [opts]
 * @returns {{available:true, total:number, dispatchable:number, missing:string[], scanned:string[]}
 *          |{available:false, reason:string}}
 */
function censusAgents(root, opts = {}) {
  const floor = typeof opts.minDispatchable === 'number' ? opts.minDispatchable : NON_VACUITY_FLOOR;
  const files = listAgentFiles(root);
  const missing = [];
  const scanned = [];
  let dispatchable = 0;

  for (const file of files) {
    const res = scanAgentFile(file);
    if (!res.available) {
      // One unavailable file poisons the whole census — the plan's central rule.
      // checkJs widens `available:true` to boolean, so the union does not narrow;
      // cast to the unavailable arm exactly as iron-loop-enforcer's fences do.
      const reason = /** @type {{ reason: string }} */ (res).reason;
      return { available: false, reason: `${reason} — census cannot be trusted` };
    }
    scanned.push(file);
    if (res.dispatchable) {
      dispatchable++;
      if (!res.hasFragmentRef) missing.push(file);
    }
  }

  if (dispatchable < floor) {
    return {
      available: false,
      reason: `non-vacuity floor: found ${dispatchable} dispatchable definition(s), expected >= ${floor} — a broken glob, not a shrunken repository`,
    };
  }

  return { available: true, total: files.length, dispatchable, missing, scanned };
}

/**
 * The shared fragment exists, carries the marker, and covers all six required
 * points. A referenced fragment emptied to a heading would otherwise pass every
 * reference check while teaching nothing.
 * @param {string} root
 * @returns {{available:true, ok:boolean, missingSections:string[]}
 *          |{available:false, reason:string}}
 */
function fragmentIsSubstantive(root) {
  const file = path.join(root, 'skills', 'agent-fragments', 'honest-status.md');
  let body;
  try {
    if (!safeFs.existsSync(file)) {
      return { available: false, reason: 'the honest-status fragment does not exist' };
    }
    body = safeFs.readFileSync(file, 'utf8');
  } catch (err) {
    return { available: false, reason: `the honest-status fragment is unreadable (${err.message})` };
  }
  const lower = body.toLowerCase();
  const missingSections = REQUIRED_SECTIONS.filter((s) => !lower.includes(s));
  const ok = body.includes(FRAGMENT_MARKER) && missingSections.length === 0;
  return { available: true, ok, missingSections };
}

module.exports = {
  isDispatchable,
  scanAgentFile,
  censusAgents,
  fragmentIsSubstantive,
  FRAGMENT_REF,
  NON_VACUITY_FLOOR,
};
