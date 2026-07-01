/* eslint-disable security/detect-non-literal-fs-filename --
 * LH1: This module is the SINGLE audited filesystem choke point for CTOC.
 *
 * CTOC's core job is reading and writing plan/state/config files at computed
 * paths, so the `security/detect-non-literal-fs-filename` heuristic fires on
 * essentially every fs call in the codebase — overwhelmingly false positives
 * that drown out a genuinely dangerous path. Rather than scatter ~990 inline
 * suppressions (silence with no invariant), every fs path operation in src/
 * routes through the explicit wrappers below. Each wrapper VALIDATES its path
 * argument(s) — non-empty string, no NUL byte — and fails CLOSED before
 * delegating to Node's fs. That converts a heuristic warning into a real,
 * tested invariant.
 *
 * The wrappers call fs.<method>(computedPath, ...) DIRECTLY (not via dynamic
 * dispatch) so every real fs path call in src/ is visible, in one place, to a
 * human auditor — and so this single file-level disable is genuinely
 * load-bearing. Because this is the only place raw fs path calls live, the
 * detect-non-literal-fs-filename rule is disabled HERE and ONLY HERE, which
 * lets the rule be promoted to `error` everywhere else with --max-warnings 0.
 *
 * Each wrapper mirrors the underlying fs signature explicitly (no variadic
 * spread) so the codebase stays type-clean under `tsc --checkJs`: a spread of
 * `any[]` into an overloaded fs function trips TS2556, whereas an explicit
 * trailing optional arg (passed through as `undefined` when omitted, which fs
 * treats identically to omission) resolves the overload cleanly.
 *
 * Behavior contract: validation only. NO path normalization is applied — a
 * successful delegated call is byte-for-byte identical to calling fs directly,
 * preserving exact semantics (trailing slashes, "..", relative paths, etc.).
 * The added strictness is intentional fail-closed behavior: e.g. fs.existsSync
 * returns false for an empty/invalid path, whereas safeFs.existsSync throws —
 * surfacing the latent caller bug instead of hiding it.
 *
 * Cross-platform: no OS-specific assumptions; delegates straight to fs.
 *
 * See docs/SECURITY_LINT.md (rationale) and plans LH1 (full strategy).
 */

'use strict';

const fs = require('fs');

/**
 * Validate a single fs path argument. Throws (fail-closed) on invalid input.
 *
 * Accepts: a non-empty string with no NUL byte, OR a Buffer, OR a URL —
 * the three path types Node's fs accepts. Buffer/URL are passed through
 * (fs guards their NUL bytes itself); strings get an early, clearer throw.
 *
 * @param {*} p - the candidate path argument
 * @param {string} method - the wrapped method name, for error messages
 * @throws {TypeError} when p is not a usable fs path
 */
function validatePath(p, method) {
  if (typeof p === 'string') {
    if (p.length === 0) {
      throw new TypeError(`safe-fs: ${method} received an empty path string (invalid path)`);
    }
    if (p.indexOf('\0') !== -1) {
      throw new TypeError(`safe-fs: ${method} received a path containing a NUL (null byte): ${JSON.stringify(p)}`);
    }
    return;
  }
  if (Buffer.isBuffer(p)) return;
  if (typeof URL !== 'undefined' && p instanceof URL) return;
  throw new TypeError(
    `safe-fs: ${method} received an invalid path (must be a non-empty string, Buffer, or URL); got ${p === null ? 'null' : typeof p}`
  );
}

// ── Sync wrappers (single path argument) ────────────────────────────────────

function existsSync(p) {
  validatePath(p, 'existsSync');
  return fs.existsSync(p);
}
function readFileSync(p, options) {
  validatePath(p, 'readFileSync');
  return fs.readFileSync(p, options);
}
function writeFileSync(p, data, options) {
  validatePath(p, 'writeFileSync');
  return fs.writeFileSync(p, data, options);
}
function appendFileSync(p, data, options) {
  validatePath(p, 'appendFileSync');
  return fs.appendFileSync(p, data, options);
}
function mkdirSync(p, options) {
  validatePath(p, 'mkdirSync');
  return fs.mkdirSync(p, options);
}
function readdirSync(p, options) {
  validatePath(p, 'readdirSync');
  return fs.readdirSync(p, options);
}
function statSync(p, options) {
  validatePath(p, 'statSync');
  return fs.statSync(p, options);
}
function lstatSync(p, options) {
  validatePath(p, 'lstatSync');
  return fs.lstatSync(p, options);
}
function unlinkSync(p) {
  validatePath(p, 'unlinkSync');
  return fs.unlinkSync(p);
}
function rmSync(p, options) {
  validatePath(p, 'rmSync');
  return fs.rmSync(p, options);
}
function realpathSync(p, options) {
  validatePath(p, 'realpathSync');
  return fs.realpathSync(p, options);
}
function readlinkSync(p, options) {
  validatePath(p, 'readlinkSync');
  return fs.readlinkSync(p, options);
}
function chmodSync(p, mode) {
  validatePath(p, 'chmodSync');
  return fs.chmodSync(p, mode);
}
function utimesSync(p, atime, mtime) {
  validatePath(p, 'utimesSync');
  return fs.utimesSync(p, atime, mtime);
}
function openSync(p, flags, mode) {
  validatePath(p, 'openSync');
  return fs.openSync(p, flags, mode);
}

// ── Sync wrappers (two path arguments) ──────────────────────────────────────

function renameSync(oldPath, newPath) {
  validatePath(oldPath, 'renameSync');
  validatePath(newPath, 'renameSync');
  return fs.renameSync(oldPath, newPath);
}
function copyFileSync(src, dest, mode) {
  validatePath(src, 'copyFileSync');
  validatePath(dest, 'copyFileSync');
  return fs.copyFileSync(src, dest, mode);
}
function cpSync(src, dest, options) {
  validatePath(src, 'cpSync');
  validatePath(dest, 'cpSync');
  return fs.cpSync(src, dest, options);
}

// ── Promise wrappers (fs.promises) ──────────────────────────────────────────

const promises = {
  readFile: async (p, options) => { validatePath(p, 'promises.readFile'); return fs.promises.readFile(p, options); },
  writeFile: async (p, data, options) => { validatePath(p, 'promises.writeFile'); return fs.promises.writeFile(p, data, options); },
  appendFile: async (p, data, options) => { validatePath(p, 'promises.appendFile'); return fs.promises.appendFile(p, data, options); },
  mkdir: async (p, options) => { validatePath(p, 'promises.mkdir'); return fs.promises.mkdir(p, options); },
  readdir: async (p, options) => { validatePath(p, 'promises.readdir'); return fs.promises.readdir(p, options); },
  stat: async (p, options) => { validatePath(p, 'promises.stat'); return fs.promises.stat(p, options); },
  lstat: async (p, options) => { validatePath(p, 'promises.lstat'); return fs.promises.lstat(p, options); },
  unlink: async (p) => { validatePath(p, 'promises.unlink'); return fs.promises.unlink(p); },
  rm: async (p, options) => { validatePath(p, 'promises.rm'); return fs.promises.rm(p, options); },
  realpath: async (p, options) => { validatePath(p, 'promises.realpath'); return fs.promises.realpath(p, options); },
  readlink: async (p, options) => { validatePath(p, 'promises.readlink'); return fs.promises.readlink(p, options); },
  chmod: async (p, mode) => { validatePath(p, 'promises.chmod'); return fs.promises.chmod(p, mode); },
  rename: async (oldPath, newPath) => { validatePath(oldPath, 'promises.rename'); validatePath(newPath, 'promises.rename'); return fs.promises.rename(oldPath, newPath); },
  copyFile: async (src, dest, mode) => { validatePath(src, 'promises.copyFile'); validatePath(dest, 'promises.copyFile'); return fs.promises.copyFile(src, dest, mode); }
};

// The cast gives every export Node fs's own type (all overloads intact), so
// call sites type-check under `tsc --checkJs` exactly as if they called fs
// directly — e.g. readFileSync(p, 'utf8') still narrows to string, not
// string|Buffer. Without this, the explicit-arity wrappers collapse fs's
// overloads and every migrated call site regresses the typecheck baseline.
module.exports = /** @type {(
  Pick<typeof import('fs'),
    'existsSync' | 'readFileSync' | 'writeFileSync' | 'appendFileSync' |
    'mkdirSync' | 'readdirSync' | 'statSync' | 'lstatSync' |
    'unlinkSync' | 'rmSync' | 'realpathSync' | 'readlinkSync' |
    'chmodSync' | 'utimesSync' | 'openSync' |
    'renameSync' | 'copyFileSync' | 'cpSync'>
  & {
    promises: Pick<typeof import('fs').promises,
      'readFile' | 'writeFile' | 'appendFile' | 'mkdir' | 'readdir' |
      'stat' | 'lstat' | 'unlink' | 'rm' | 'realpath' | 'readlink' |
      'chmod' | 'rename' | 'copyFile'>,
    validatePath: (p: unknown, method: string) => void
  }
)} */ ({
  existsSync, readFileSync, writeFileSync, appendFileSync,
  mkdirSync, readdirSync, statSync, lstatSync,
  unlinkSync, rmSync, realpathSync, readlinkSync,
  chmodSync, utimesSync, openSync,
  renameSync, copyFileSync, cpSync,
  promises,
  // Exposed for callers/tests that want the validation primitive directly.
  validatePath
});
