#!/usr/bin/env node
/**
 * CTOC guard-files — PreToolUse hook (matcher: Read|Edit|Write|Bash)
 *
 * Ported from the opus-pack guard-files.sh. Blocks access to secret-bearing
 * targets in a file path (Read/Edit/Write) OR in a Bash command (e.g.
 * `cat .env`, `grep KEY config/secrets.json`). Permission deny-rules and
 * .claudeignore can be bypassed by indexing; this hook fires on every matching
 * tool call and cannot be.
 *
 * I/O convention (matches src/hooks/PreToolUse.Edit.js):
 *   - reads BOTH the env var CLAUDE_TOOL_INPUT (JSON string) AND stdin JSON.
 *   - Exit 0 = ALLOWED, Exit 1 = BLOCKED.
 *   - FAILS OPEN (exit 0) on any internal error — never break the user's flow
 *     because of a hook bug.
 *
 * Secret patterns are ported verbatim as literal, case-insensitive RegExps
 * (no dynamic/data-derived RegExp construction) — secrets are referenced by
 * NAME, never by value.
 *
 * Cross-platform: path separators are normalized (`\` -> `/`) before matching
 * so `.aws/`, `.ssh/`, `.kube/config` also match Windows-style backslash paths.
 */

const fs = require('fs');

/**
 * Secret-bearing target patterns (ported verbatim from guard-files.sh).
 * Literal, case-insensitive RegExps — no interpolation of untrusted data.
 */
const PROTECTED_PATTERNS = [
  // .env family — BLOCK .env / .env.local / .env.production / .envrc (direnv),
  // but EXCLUDE committable templates (.env.example / .env.sample / .env.template).
  // Negative lookahead on the template suffixes; \b keeps `.env` boundary-safe.
  // No greedy suffix capture (ReDoS-safe): the word boundary + lookahead suffice.
  /\.env(?!\.(?:example|sample|template)\b)\b/i,
  /\.envrc\b/i,
  /secrets?\.(ya?ml|json|toml)/i,
  // credentials as a FILE target (`.credentials`, `credentials`, `credentials.json`)
  // — NOT source files named ABOUT credentials (`get-credentials.ts` ALLOWED).
  // Anchored to a path-segment start (`/`, `\`, or string start) + optional dot;
  // the trailing \b (ReDoS-safe, no optional suffix group) ends the token.
  /(?:^|[/\\])\.?credentials\b/i,
  // private keys: rsa/dsa/ed25519/ecdsa + any other id_* key file
  /id_(rsa|dsa|ed25519|ecdsa|\w+)/i,
  // .pem / .key anywhere in a path segment (so `server.key.backup` blocks too).
  /\.(pem|key)\b/i,
  /\.kube\/config/i,
  /\.aws\//i,
  /\.ssh\//i,
  // secret TOKEN files/contexts only — NOT `tokenizer.js` / `refreshToken.js`.
  // Requires an EXPLICIT `_`/`-` separator (access_token, refresh-token,
  // auth_token) so camelCase `refreshToken` does not match; plus `.token` and
  // `token(s).<secret-ext>` file forms (access_token.json, api_token.txt, …).
  /(^|[/_.-])((access|refresh|auth)[_-]token|\.token|tokens?\.(json|ya?ml|txt|env))\b/i,
];

/**
 * True when the (path + command) target string matches any secret pattern.
 * Normalizes backslashes to forward slashes for cross-platform matching.
 * @param {string} target
 * @returns {boolean}
 */
function isSecretTarget(target) {
  if (!target) return false;
  const normalized = String(target).replace(/\\/g, '/');
  return PROTECTED_PATTERNS.some(p => p.test(normalized));
}

/** Read + parse stdin JSON (best-effort; null on any error). */
function readStdinJson() {
  try {
    const buf = fs.readFileSync(0, 'utf8');
    return buf ? JSON.parse(buf) : null;
  } catch { return null; }
}

/**
 * Extract the secret-guard target = "<file_path> <command>" from BOTH the env
 * var CLAUDE_TOOL_INPUT and stdin JSON (mirrors PreToolUse.Edit.js). Either
 * source may carry the payload depending on how Claude Code invokes the hook.
 * @param {object|null} stdinJson
 * @returns {string}
 */
function getTarget(stdinJson) {
  let filePath = '';
  let command = '';

  const fromEnv = process.env.CLAUDE_TOOL_INPUT || '';
  try {
    const parsed = JSON.parse(fromEnv);
    filePath = parsed.file_path || parsed.path || parsed.notebook_path || '';
    command = parsed.command || '';
  } catch { /* fall through to stdin */ }

  if ((!filePath && !command) && stdinJson && stdinJson.tool_input) {
    const ti = stdinJson.tool_input;
    filePath = ti.file_path || ti.path || ti.notebook_path || '';
    command = ti.command || '';
  }

  return `${filePath || ''} ${command || ''}`;
}

function main() {
  try {
    const stdinJson = readStdinJson();
    const target = getTarget(stdinJson);

    if (isSecretTarget(target)) {
      process.stderr.write(
        '\n[CTOC] guard-files BLOCKED: target matches a secret pattern ' +
        '(.env / credentials / id_rsa / *.pem / *.key / .aws/ / .ssh/ / ' +
        '.kube/config / secrets.* / token).\n' +
        'Secrets are referenced by name, never by value. If access is genuinely ' +
        'needed, the human handles it outside the session.\n\n'
      );
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    // Fail OPEN — never break the user's flow because of a hook bug.
    try { process.stderr.write(`[CTOC] guard-files error (failing open): ${err.message}\n`); } catch { /* swallow */ }
    process.exit(0);
  }
}

// Export the pure matcher for testing; run main() only as a script.
module.exports = { isSecretTarget, PROTECTED_PATTERNS };

if (require.main === module) {
  main();
}
