#!/usr/bin/env node
/**
 * CTOC v7 PreToolUse Enforcement Hook — Edit/Write/MultiEdit/NotebookEdit
 *
 * REPLACES the legacy step-based hook with plan-coverage logic (per C1).
 *
 * Flow:
 *   1. Whitelist check          (allow infrastructure files)
 *   2. Is project CTOC?         (silent pass if not)
 *   3. Plan-coverage check      (allow if covered)
 *   4. Escape-phrase check      (allow if user said hotfix/trivial/etc.)
 *   5. Block + log
 *
 * Fails OPEN on internal error (better to skip enforcement than break flow).
 *
 * Exit codes: 0 = allowed, 1 = blocked.
 */

const path = require('path');
const fs = require('fs');
const safeFs = require('../lib/safe-fs');

// These four sibling modules are loaded fail-soft (a missing/broken module
// degrades enforcement rather than crashing the hook). Each is a LITERAL
// require in its own try/catch — no dynamic require(variable) surface — so the
// module graph is statically analyzable and security/detect-non-literal-require
// stays clean.
let detector = null;
try { detector = require('../lib/ctoc-project-detector'); } catch { detector = null; }
let coverage = null;
try { coverage = require('../lib/plan-coverage'); } catch { coverage = null; }
let enforcementLog = null;
try { enforcementLog = require('../lib/enforcement-log'); } catch { enforcementLog = null; }
let escapePhrases = null;
try { escapePhrases = require('../lib/escape-phrases'); } catch { escapePhrases = null; }

const WHITELIST = [
  '.gitignore',
  '.gitattributes',
  /^\.ctoc\//,
  /^\.local\//,
  /^plans\/.*\.md$/,
  /^VERSION$/,
];

function isWhitelisted(filePath) {
  if (!filePath) return false;
  // Claude Code passes ABSOLUTE file paths; relativize against the project root
  // so the anchored patterns (^plans/.*\.md$, ^VERSION$, ^\.ctoc/) match. Without
  // this, every whitelisted file was wrongly blocked in production.
  let norm = filePath;
  if (path.isAbsolute(norm)) {
    norm = path.relative(process.cwd(), norm);
  }
  norm = norm.replace(/\\/g, '/').replace(/^\.\//, '');
  // Reject any path that escapes the project root via traversal — otherwise a
  // crafted target like ".ctoc/../src/lib/x.js" or "plans/../../outside.md"
  // would match a whitelist prefix yet resolve to an arbitrary file.
  if (norm === '' || norm === '..' || norm.startsWith('../') || norm.includes('/../')) return false;
  norm = path.posix.normalize(norm);
  if (norm.startsWith('../')) return false;
  for (const pattern of WHITELIST) {
    if (typeof pattern === 'string') {
      if (norm === pattern || path.basename(norm) === pattern) return true;
    } else if (pattern.test(norm)) return true;
  }
  return false;
}

function readStdinJson() {
  try {
    const buf = fs.readFileSync(0, 'utf8');
    return buf ? JSON.parse(buf) : null;
  } catch { return null; }
}

function getTargetFile(stdinJson) {
  const fromEnv = process.env.CLAUDE_TOOL_INPUT || '';
  try {
    const parsed = JSON.parse(fromEnv);
    if (parsed.file_path) return parsed.file_path;
    if (parsed.path) return parsed.path;
    if (parsed.notebook_path) return parsed.notebook_path;
  } catch { /* fall through */ }

  if (stdinJson && stdinJson.tool_input) {
    return stdinJson.tool_input.file_path || stdinJson.tool_input.path || stdinJson.tool_input.notebook_path || null;
  }

  // Best-effort regex
  const m = fromEnv.match(/file_path['":\s]+["']?([^"'\s,}]+)/);
  return m ? m[1] : null;
}

function readTranscript(stdinJson) {
  // Claude Code hook protocol passes transcript_path in stdin JSON
  if (!stdinJson || !stdinJson.transcript_path) return null;
  try { return safeFs.readFileSync(stdinJson.transcript_path, 'utf8'); } catch { return null; }
}

function findEscapeInTranscript(transcript) {
  if (!transcript || !escapePhrases) return null;
  // Crude: read last ~5KB and grep for any escape phrase
  const tail = transcript.slice(-5000);
  return escapePhrases.matchEscapePhrase(tail);
}

function block(reason, info) {
  process.stderr.write(`\n[CTOC v7] Edit BLOCKED: ${reason}\n`);
  process.stderr.write(`  Target: ${info.target_file || '(unknown)'}\n`);
  process.stderr.write(`  Project: ${info.project_root || process.cwd()}\n\n`);
  process.stderr.write(`  Resolution:\n`);
  process.stderr.write(`  - Run /ctoc:menu to create or activate a plan that covers this file, OR\n`);
  process.stderr.write(`  - Use an escape phrase (hotfix, trivial fix, urgent) if this is genuinely small.\n\n`);
  if (info.project_root && enforcementLog) {
    try {
      enforcementLog.logEnforcement({
        tool: info.tool || 'Edit',
        target_file: info.target_file,
        project_is_ctoc: true,
        plan_matched: null,
        escape_phrase: null,
        outcome: 'block',
      }, info.project_root);
    } catch { /* fail open on log error */ }
  }
  process.exit(1);
}

function allow(outcome, info) {
  if (info.project_root && enforcementLog) {
    try {
      enforcementLog.logEnforcement({
        tool: info.tool || 'Edit',
        target_file: info.target_file,
        project_is_ctoc: info.project_is_ctoc,
        plan_matched: info.plan_matched || null,
        escape_phrase: info.escape_phrase || null,
        outcome,
      }, info.project_root);
    } catch { /* fail open on log error */ }
  }
  process.exit(0);
}

(async function main() {
  try {
    const root = process.cwd();
    const stdinJson = readStdinJson();
    const tool = (stdinJson && stdinJson.tool_name) || 'Edit';
    const targetFile = getTargetFile(stdinJson);

    // 1. Whitelist (infrastructure files always allowed)
    if (targetFile && isWhitelisted(targetFile)) {
      return allow('whitelist', { tool, target_file: targetFile, project_root: root });
    }

    // 2. CTOC project? If not, silent pass.
    if (!detector) return process.exit(0); // libs missing — fail open
    const detect = detector.isCtocProject(root);
    if (!detect.isCtoc) {
      return allow('silent-passthrough', { tool, target_file: targetFile, project_root: root, project_is_ctoc: false });
    }

    // 3. Plan-coverage?
    if (coverage && targetFile) {
      const match = coverage.findCoveringPlan(targetFile, root);
      if (match) {
        return allow('allow', {
          tool, target_file: targetFile, project_root: root,
          project_is_ctoc: true, plan_matched: match.plan,
        });
      }
    }

    // 4. Escape phrase?
    const transcript = readTranscript(stdinJson);
    const escape = findEscapeInTranscript(transcript);
    if (escape) {
      return allow('escape', {
        tool, target_file: targetFile, project_root: root,
        project_is_ctoc: true, escape_phrase: escape,
      });
    }

    // 5. Block
    return block('no active plan covers this file and no escape phrase used', {
      tool, target_file: targetFile, project_root: root,
    });
  } catch (err) {
    // Fail OPEN — never break the user's flow due to a hook bug
    process.stderr.write(`[CTOC v7] enforcement hook error (failing open): ${err.message}\n`);
    process.exit(0);
  }
})();
