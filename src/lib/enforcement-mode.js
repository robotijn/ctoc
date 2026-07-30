'use strict';
/**
 * Enforcement mode resolver (plan 00069).
 *
 * The SINGLE source of truth for "how strictly does plan-coverage enforcement act
 * on file edits?". `CLAUDE.md` has documented `enforcement.mode: strict|soft|off`
 * for a long time and `init-project.js` writes it into every new project's
 * `.ctoc/settings.yaml`, but until this module NOTHING read it — a visible switch
 * wired to nothing. This resolves it, fail-closed, at the ONE decision point it
 * governs (step 5 of `PreToolUse.Edit.js`).
 *
 * FAIL-CLOSED CONTRACT (non-negotiable). `null` from any tier means "this tier said
 * nothing", never "permissive". The chain therefore terminates at the RESTRICTIVE
 * value `strict`. A parser whose no-match default is the permissive value cannot
 * distinguish "the user chose off" from "I could not read my input" — the precise
 * false-green shape this repository fences elsewhere (test-gate's `fail 0`). Every
 * failure path here resolves to `strict`. The module NEVER throws and writes nothing.
 *
 * RESOLUTION ORDER (highest wins), a strict superset of settings.js's documented order:
 *   1. .ctoc/settings.yaml → enforcement.mode        (the documented per-project override)
 *   2. .ctoc/settings.json → workflow.enforcementMode, explicit — via settings.getSetting
 *   3. environment profile (general.environment: dev → soft) — via settings.getSetting
 *   4. schema default `strict`                        — via settings.getSetting
 * Tiers 2-4 are ONE delegated `settings.getSetting` call, so the documented order is
 * preserved by construction rather than duplicated and drifted. The value ALWAYS
 * comes from getSetting (the authority); the raw reads below only LABEL the source,
 * so the label can never disagree with the value.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const settings = require('./settings');

/** The recognised enforcement modes, frozen. Anything else is treated as absent. */
const ENFORCEMENT_MODES = Object.freeze(['strict', 'soft', 'off']);

/** The restrictive default — the value every failure path resolves to. */
const DEFAULT_ENFORCEMENT_MODE = 'strict';

/**
 * Read the flat `enforcement.mode` value from settings.yaml contents, or null.
 *
 * Mirrors the established safety-critical-hook convention (stop-test-gate's
 * `readStopTestGate`): line-wise, dependency-free, section-tracking, direct-child
 * indent only. One linear per-line regex — no nested quantifier, no data-derived
 * RegExp — so there is no catastrophic-backtracking surface.
 *
 * Accepts `mode` ONLY as a DIRECT child of section `enforcement` at that section's
 * established child indent: `enforcement:\n  nested:\n    mode: off` is ignored, and
 * a `mode:` under any other section is ignored. Value is unquoted, trimmed, and
 * lowercased (so `OFF ` reads as `off` — legible human intent). Returns the value
 * iff it is a recognised mode, else null (absent / unparseable / unknown value).
 *
 * @param {string} content - raw settings.yaml contents
 * @returns {'strict'|'soft'|'off'|null}
 */
function readYamlEnforcementMode(content) {
  if (!content) return null;
  let section = null;      // current top-level section name
  let childIndent = null;  // indent of the FIRST key under that section
  for (const raw of content.split('\n')) {
    const line = raw.replace(/#.*$/, '');
    if (line.trim() === '') continue;
    const indent = raw.match(/^[ \t]*/)[0].length;
    const m = line.match(/^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
    if (indent === 0) {
      section = key;
      childIndent = null;    // reset — first nested key defines the child level
      continue;
    }
    if (section !== null && childIndent === null) childIndent = indent;
    if (section === 'enforcement' && key === 'mode' && indent === childIndent) {
      // The JSDoc cast is honest: `val` is confirmed to be one of the three literals
      // by the membership check, which `.includes` cannot narrow on its own.
      return ENFORCEMENT_MODES.includes(val)
        ? /** @type {'strict'|'soft'|'off'} */ (val)
        : null;
    }
  }
  return null;
}

/** Read .ctoc/settings.yaml contents, or null (absent / unreadable). */
function readYaml(projectRoot) {
  const p = path.join(projectRoot, '.ctoc', 'settings.yaml');
  if (!safeFs.existsSync(p)) return null;
  try { return safeFs.readFileSync(p, 'utf8'); } catch { return null; }
}

/**
 * Resolve the enforcement mode for a project, with the source that decided it.
 *
 * @param {string} projectRoot - the project root (process.cwd() on the hook path)
 * @returns {{mode:'strict'|'soft'|'off', source:'settings.yaml'|'settings.json'|'environment-profile'|'default'}}
 *   Never throws. Any error at any tier returns { mode: 'strict', source: 'default' }.
 */
function resolveEnforcementMode(projectRoot) {
  try {
    // Tier 1 — the documented per-project override.
    const yamlMode = readYamlEnforcementMode(readYaml(projectRoot));
    if (yamlMode) return { mode: yamlMode, source: 'settings.yaml' };

    // Tiers 2-4 — one delegated call to the settings authority (explicit >
    // environment profile > schema default). getSetting does NOT validate against
    // the schema options, so guard the value fail-closed.
    const resolved = settings.getSetting('workflow', 'enforcementMode', projectRoot);
    const mode = ENFORCEMENT_MODES.includes(resolved) ? resolved : DEFAULT_ENFORCEMENT_MODE;

    // Label the source honestly WITHOUT re-deciding the value.
    const raw = settings.readRawSettings(projectRoot);
    const rawMode = raw && raw.workflow && raw.workflow.enforcementMode;
    if (ENFORCEMENT_MODES.includes(rawMode)) return { mode, source: 'settings.json' };

    const env = settings.getEnvironment(projectRoot);
    if (env !== 'ask') {
      // Label 'environment-profile' ONLY when the chosen profile actually names
      // workflow.enforcementMode — otherwise the value came from the schema default,
      // not the profile, and calling it 'environment-profile' would be dishonest.
      // Read ENVIRONMENT_PROFILES directly (getEnvironment already validated `env`).
      const profile = settings.ENVIRONMENT_PROFILES[env] || {};
      if (profile.workflow && ENFORCEMENT_MODES.includes(profile.workflow.enforcementMode)) {
        return { mode, source: 'environment-profile' };
      }
    }
    return { mode, source: 'default' };
  } catch {
    return { mode: DEFAULT_ENFORCEMENT_MODE, source: 'default' };
  }
}

module.exports = { resolveEnforcementMode, ENFORCEMENT_MODES, DEFAULT_ENFORCEMENT_MODE };
