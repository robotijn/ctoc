'use strict';

/**
 * FRAMEWORK-SECURITY CHECKER — DARK-BRANCH COVERAGE (companion to
 * framework-security-checker.test.js; targets branches that test leaves RED under
 * mutation but the existing suite does not reach).
 *
 * Every test here pins a NON-OBVIOUS branch: the regex quantifier that allows a
 * secret directly after the prefix, the `\b` that makes a benign metadata suffix
 * suppress ONLY when terminal, the dedup collapse, the report truncation, the three
 * bounded-walk caps (bytes / skip-dir / depth), and the three fail-soft error catches.
 * A mutant that misses a real leak, fabricates a warning on a safe var, or silences a
 * fail-soft path goes RED against one of these.
 *
 * Zero mocks of core logic. Real temp-dir fixtures on disk drive the real
 * FrameworkSecurityChecker; the only boundary faked is the filesystem itself (the
 * fixtures ARE the fs). Cleaned in finally/after.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  FrameworkSecurityChecker,
  SEVERITY
} = require('../src/lib/framework-security-checker');

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}
function writePkg(dir, deps) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.0', dependencies: deps }, null, 2),
    'utf8'
  );
}
const highsOf = res => res.findings.filter(f => f.severity === SEVERITY.HIGH);

// ───────────────────────────────────────────────────────────────────────────
// Cluster 1 — MATCHER PRECISION: regex-internal branches the existing suite skips.
// ───────────────────────────────────────────────────────────────────────────
describe('FrameworkSecurityChecker: matcher-precision dark branches', () => {
  /** One-file .env fixture under a detected framework; returns the run result. */
  async function envResult(deps, body) {
    const dir = mkTmp('ctoc-fwcov-m-');
    try {
      writePkg(dir, deps);
      fs.writeFileSync(path.join(dir, '.env'), body, 'utf8');
      return await new FrameworkSecurityChecker(dir).run();
    } finally { rm(dir); }
  }

  // The terminal `SECRET` sits behind `(?:[A-Za-z0-9]+_)*` — the `*` allows ZERO
  // leading segments, so the indicator may follow the prefix DIRECTLY. Mutating the
  // quantifier to `+` (require ≥1 leading segment) makes this real leak vanish → RED.
  it('flags NEXT_PUBLIC_SECRET when the terminal indicator directly follows the prefix (zero leading segments)', async () => {
    const res = await envResult({ next: '15.0.0' }, 'NEXT_PUBLIC_SECRET=leak\n');
    const highs = highsOf(res);
    assert.equal(highs.length, 1, `a bare terminal SECRET one segment after the prefix is a real leak; got ${JSON.stringify(res.findings)}`);
    assert.equal(highs[0].varName, 'NEXT_PUBLIC_SECRET');
  });

  // APIKEY is a distinct compound entry (no underscore between API and KEY). Dropping
  // it from COMPOUND_INDICATORS would silence this leak while API_KEY still fires → RED.
  it('flags NEXT_PUBLIC_APIKEY (the underscore-less APIKEY compound)', async () => {
    const res = await envResult({ next: '15.0.0' }, 'NEXT_PUBLIC_APIKEY=leak\n');
    const highs = highsOf(res);
    assert.equal(highs.length, 1, `APIKEY is a first-class compound indicator; got ${JSON.stringify(res.findings)}`);
    assert.equal(highs[0].varName, 'NEXT_PUBLIC_APIKEY');
  });

  // THE `\b` IN THE BENIGN-SUFFIX LOOKAHEAD. `_HEADER` suppresses API_KEY only when it
  // is the FINAL segment (`(?!(?:…_HEADER…)\b)`). Here `_HEADER` has a trailing `_URL`,
  // so no word boundary follows it → the negative lookahead does NOT match → the var
  // STILL fires. Dropping the `\b` would make `_HEADER` swallow the tail and wrongly
  // suppress this leak → RED. Its silent sibling (terminal `_HEADER`) is the existing
  // suite's round-5/6 case; this is the non-terminal partner that must FIRE.
  it('flags NEXT_PUBLIC_API_KEY_HEADER_URL — a benign suffix suppresses ONLY when terminal', async () => {
    const res = await envResult({ next: '15.0.0' }, 'NEXT_PUBLIC_API_KEY_HEADER_URL=leak\n');
    const highs = highsOf(res);
    assert.equal(highs.length, 1, `_HEADER is not terminal here (trailing _URL), so the metadata suppression must NOT apply; got ${JSON.stringify(res.findings)}`);
    assert.equal(highs[0].varName, 'NEXT_PUBLIC_API_KEY_HEADER_URL');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Cluster 2 — DEDUP: the `seen.has(key)` TRUE branch (a repeat is collapsed).
// ───────────────────────────────────────────────────────────────────────────
describe('FrameworkSecurityChecker: duplicate (file,line,varName) is deduped', () => {
  // Two identical var names on ONE physical line produce two raw matches with the same
  // (file,line,varName) key; deduplicateFindings must collapse them to one. Removing
  // the `if (!seen.has(key))` guard would report the leak twice → RED (length 2).
  it('reports one finding when the same var name appears twice on a single line', async () => {
    const dir = mkTmp('ctoc-fwcov-dup-');
    try {
      writePkg(dir, { next: '15.0.0' });
      fs.writeFileSync(path.join(dir, '.env'), 'NEXT_PUBLIC_API_SECRET=a NEXT_PUBLIC_API_SECRET=b\n', 'utf8');
      const res = await new FrameworkSecurityChecker(dir).run();
      assert.equal(res.findings.length, 1, `same var at same line must dedupe to one; got ${JSON.stringify(res.findings)}`);
      assert.equal(res.findings[0].varName, 'NEXT_PUBLIC_API_SECRET');
    } finally { rm(dir); }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Cluster 3 — REPORT TRUNCATION: the `findings.length > 10` slice + "… more" tail.
// ───────────────────────────────────────────────────────────────────────────
describe('FrameworkSecurityChecker: report truncates past ten findings', () => {
  // Eleven distinct leaks. generateReport lists the first ten and appends
  // "... and 1 more". Mutating `slice(0, 10)` or the `> 10` guard changes the tail →
  // RED. Also pins the summary total against the full (un-truncated) count.
  it('lists ten findings and appends "and 1 more" when eleven are found', async () => {
    const dir = mkTmp('ctoc-fwcov-rep-');
    try {
      writePkg(dir, { next: '15.0.0' });
      let body = '';
      for (let i = 0; i < 11; i++) body += `NEXT_PUBLIC_SVC${i}_API_SECRET=x\n`;
      fs.writeFileSync(path.join(dir, '.env'), body, 'utf8');
      const res = await new FrameworkSecurityChecker(dir).run();
      assert.equal(res.summary.total, 11, `all eleven distinct leaks are counted; got ${JSON.stringify(res.summary)}`);
      assert.match(res.message, /and 1 more/, `the eleventh finding must be summarised as "and 1 more"; got ${JSON.stringify(res.message)}`);
    } finally { rm(dir); }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Cluster 4 — BOUNDED-WALK CAPS: byte cap, skip-dir, depth cap. Each cap, when
// removed, would let a planted leak through → the "must NOT find" assertion goes RED.
// ───────────────────────────────────────────────────────────────────────────
describe('FrameworkSecurityChecker: the bounded walk drops files past its caps', () => {
  // Per-file byte cap: an oversized .env is skipped (with an error), so its planted
  // leak is NOT scanned. Dropping the `st.size > maxBytes` guard would surface the
  // leak → RED. scanned stays true (the framework is still detected).
  it('skips a file exceeding the per-file byte cap and records the skip as an error', async () => {
    const dir = mkTmp('ctoc-fwcov-byte-');
    try {
      writePkg(dir, { next: '15.0.0' });
      // Leak on line 1, then padding that pushes the file past the 50-byte cap.
      fs.writeFileSync(path.join(dir, '.env'), 'NEXT_PUBLIC_API_SECRET=leak\n' + '#'.repeat(5000) + '\n', 'utf8');
      const res = await new FrameworkSecurityChecker(dir, { maxBytes: 50 }).run();
      assert.equal(res.scanned, true, 'the framework is still detected → scanned:true');
      assert.equal(res.findings.length, 0, `an over-cap file must not be scanned; got ${JSON.stringify(res.findings)}`);
      assert.ok(
        res.errors.some(e => /exceeds .*byte cap/.test(e.error)),
        `the skip must be recorded as an honest error; got ${JSON.stringify(res.errors)}`
      );
    } finally { rm(dir); }
  });

  // SKIP_DIRS: a leak buried in node_modules must never be scanned. Removing the
  // `SKIP_DIRS.has(entry.name)` prune would descend into it and flag the leak → RED.
  it('does NOT descend into node_modules (a SKIP_DIRS entry)', async () => {
    const dir = mkTmp('ctoc-fwcov-skip-');
    try {
      writePkg(dir, { next: '15.0.0' });
      fs.mkdirSync(path.join(dir, 'node_modules'));
      fs.writeFileSync(path.join(dir, 'node_modules', '.env'), 'NEXT_PUBLIC_API_SECRET=leak\n', 'utf8');
      const res = await new FrameworkSecurityChecker(dir).run();
      assert.equal(res.scanned, true);
      assert.equal(res.findings.length, 0, `node_modules is pruned; a leak there must not flag; got ${JSON.stringify(res.findings)}`);
    } finally { rm(dir); }
  });

  // DEPTH CAP boundary (`depth > MAX_WALK_DEPTH`, MAX=12). A .env at exactly 12 nested
  // dirs is READ (found); at 13 it is skipped (not found). The pair pins `>` exactly:
  // `>=` breaks the 12-level find; removing the guard breaks the 13-level skip. One
  // subject (the depth boundary), so the two asserts belong together.
  it('reads a file at the depth cap but skips one beyond it (pins depth > MAX_WALK_DEPTH)', async () => {
    async function findingsAtDepth(levels) {
      const dir = mkTmp('ctoc-fwcov-depth-');
      try {
        writePkg(dir, { next: '15.0.0' });
        let cur = dir;
        for (let i = 0; i < levels; i++) { cur = path.join(cur, `d${i}`); fs.mkdirSync(cur); }
        fs.writeFileSync(path.join(cur, '.env'), 'NEXT_PUBLIC_API_SECRET=leak\n', 'utf8');
        const res = await new FrameworkSecurityChecker(dir).run();
        return res.findings.length;
      } finally { rm(dir); }
    }
    assert.equal(await findingsAtDepth(12), 1, 'a leak at exactly the depth cap must still be found');
    assert.equal(await findingsAtDepth(13), 0, 'a leak one level beyond the depth cap must be skipped');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Cluster 5 — FAIL-SOFT ERROR CATCHES: detection throw, unreadable dir, unreadable
// file. Each catch turns a real fs/type error into a soft skip, never a throw.
// ───────────────────────────────────────────────────────────────────────────
describe('FrameworkSecurityChecker: fail-soft error catches', () => {
  // relevantFrameworks() catch (detectStack throws). A non-string projectRoot makes
  // the real stack detector throw a TypeError; the catch records it and yields [],
  // so run() honestly reports scanned:false. Deleting the try/catch would let the
  // TypeError escape run() → the awaited call rejects → RED. Cross-platform (the throw
  // is a type error, not permission-dependent).
  it('records a detection failure and skips honestly when the project root is not a string', async () => {
    const checker = new FrameworkSecurityChecker(12345); // numeric root → detectStack throws
    const res = await checker.run();
    assert.equal(res.scanned, false, 'a detection failure yields an honest skip, never a throw');
    assert.equal(res.findings.length, 0);
    assert.ok(
      res.errors.some(e => /stack detection failed/.test(e.error)),
      `the detection failure must be recorded as an error; got ${JSON.stringify(res.errors)}`
    );
  });

  // collectFiles() readdir catch: an unreadable subdirectory is skipped, not thrown.
  // Adaptive so it never skips: on a platform where chmod 000 truly blocks the read
  // (POSIX) the planted leak is unreachable → assert absent (pins the catch); where
  // chmod is a no-op (Windows / root) the dir is readable → assert the leak IS found.
  // Either way a real assertion runs and the checker never throws.
  it('skips an unreadable subdirectory without throwing', async () => {
    const dir = mkTmp('ctoc-fwcov-rdir-');
    const sub = path.join(dir, 'locked');
    try {
      writePkg(dir, { next: '15.0.0' });
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, '.env'), 'NEXT_PUBLIC_API_SECRET=leak\n', 'utf8');
      try { fs.chmodSync(sub, 0o000); } catch { /* chmod unsupported */ }
      let dirBlocked = false;
      try { fs.readdirSync(sub); } catch { dirBlocked = true; }

      const res = await new FrameworkSecurityChecker(dir).run();
      assert.equal(res.scanned, true, 'detection still succeeds → scanned:true regardless of the locked dir');
      if (dirBlocked) {
        assert.equal(res.findings.length, 0, `an unreadable dir is skipped fail-soft; its leak is unreachable; got ${JSON.stringify(res.findings)}`);
      } else {
        assert.equal(res.findings.length, 1, 'platform left the dir readable → the leak is found normally');
      }
    } finally {
      try { fs.chmodSync(sub, 0o755); } catch { /* ignore */ }
      rm(dir);
    }
  });

  // run() per-file read catch: statSync succeeds (metadata needs dir-exec, not file-read
  // permission) but readFileSync throws EACCES, so the file is recorded as unreadable and
  // skipped. Adaptive, same rationale as the dir case — never skips, always asserts.
  it('records an unreadable file as an error and continues', async () => {
    const dir = mkTmp('ctoc-fwcov-rfile-');
    const envFile = path.join(dir, '.env');
    try {
      writePkg(dir, { next: '15.0.0' });
      fs.writeFileSync(envFile, 'NEXT_PUBLIC_API_SECRET=leak\n', 'utf8');
      try { fs.chmodSync(envFile, 0o000); } catch { /* chmod unsupported */ }
      let fileBlocked = false;
      try { fs.readFileSync(envFile, 'utf8'); } catch { fileBlocked = true; }

      const res = await new FrameworkSecurityChecker(dir).run();
      assert.equal(res.scanned, true);
      if (fileBlocked) {
        assert.equal(res.findings.length, 0, `an unreadable file is skipped; its leak is not scanned; got ${JSON.stringify(res.findings)}`);
        assert.ok(
          res.errors.some(e => /unreadable/.test(e.error)),
          `the unreadable file must be recorded as an error; got ${JSON.stringify(res.errors)}`
        );
      } else {
        assert.equal(res.findings.length, 1, 'platform left the file readable → the leak is found normally');
      }
    } finally {
      try { fs.chmodSync(envFile, 0o644); } catch { /* ignore */ }
      rm(dir);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Cluster 6 — DISCLOSURE MESSAGE: the `unscanned.length > 0` ternary SECOND operand.
// ───────────────────────────────────────────────────────────────────────────
describe('FrameworkSecurityChecker: the scan message discloses an unscannable co-framework', () => {
  // angular (no prefix mapping) beside next (scannable). The scan proceeds on next, but
  // the message must append a NOTE naming angular as NOT scanned. The existing FW3 test
  // asserts the `unscanned` array; this pins the MESSAGE ternary (`unscanned.length > 0
  // ? note : base`) — mutating it to always-base drops the NOTE while findings stay
  // identical, so only a message assertion catches it → RED. A plain-next control proves
  // the base branch omits the NOTE.
  it('appends a NOTE naming the unscannable framework, and omits it otherwise', async () => {
    async function messageFor(deps) {
      const dir = mkTmp('ctoc-fwcov-note-');
      try {
        writePkg(dir, deps);
        fs.writeFileSync(path.join(dir, '.env'), 'NEXT_PUBLIC_API_SECRET=leak\n', 'utf8');
        return (await new FrameworkSecurityChecker(dir).run()).message;
      } finally { rm(dir); }
    }
    const mixed = await messageFor({ '@angular/core': '18.0.0', next: '15.0.0' });
    assert.match(mixed, /NOT scanned/, 'the mixed repo must disclose the unscanned exposure path');
    assert.match(mixed, /angular/i, 'the NOTE must name the offending framework');

    const plain = await messageFor({ next: '15.0.0' });
    assert.doesNotMatch(plain, /NOT scanned/, 'a fully-scannable repo carries no unscanned NOTE (base ternary branch)');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DOCUMENTED UNREACHABLE — honestly named, NOT exercised with a vacuous test.
//
// Lines 452-453 — the `entry.isDirectory()/isFile()` catch in collectFiles. For a
// real Dirent returned by readdirSync({ withFileTypes: true }) these predicates are
// pure synchronous flag reads that never throw; an unknown-type entry returns false
// from both (skipped, no throw). No public-API path produces a Dirent whose method
// throws, so the catch is defensive-only and unreachable on real fs.
//
// Lines 318 / 503 — buildClientSecretRe's empty/non-array guard (`return null`) and
// scanContent's `if (!scanRe) return out`. run() builds the pattern only from the
// ACTIVE prefixes of the SCANNABLE frameworks, and returns scanned:false earlier when
// no framework is scannable; a scannable framework always contributes ≥1 prefix, so
// buildClientSecretRe never receives an empty set and scanContent never receives null.
// Both are reachable only with malformed internal state the public API cannot emit.
//
// These are left uncovered on purpose — a vacuous assert.ok(true) "covering" them
// would be the exact silent-green defect this skill exists to kill.
// ───────────────────────────────────────────────────────────────────────────
