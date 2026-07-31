'use strict';

/**
 * THE PHANTOM-COMMAND FENCE.
 *
 * Root cause this closes: CTOC's docs name a family of commands — `ctoc quality`,
 * `ctoc quality status`, `ctoc push`, `ctoc push --dry-run`, `ctoc validate`,
 * `ctoc doctor`, `ctoc process-issues` — as if a `ctoc <word>` executable reached
 * them. It does not. `package.json` declares NO `bin`, so no `ctoc` binary is ever
 * installed. CTOC ships exactly THREE surfaces, all Claude Code slash commands:
 * `/ctoc:start`, `/ctoc:push`, `/ctoc:update`. The sharpest instance shipped inside a
 * failure-recovery message (`src/commands/push.md`, the Network Failure block) that
 * told a human whose push just failed to "Retry with: ctoc push" — a command that
 * does not exist, printed at the reader's least patient moment.
 *
 * THE CONTRACT — what is phantom, what is acceptable:
 *   - ACCEPTABLE: the three real slash commands in `/ctoc:<name>` form
 *     (`/ctoc:start`, `/ctoc:push`, `/ctoc:update`). These contain `ctoc:` (a colon),
 *     never `ctoc ` (a space), so PHANTOM_RE below never matches them.
 *   - PHANTOM: a bare `ctoc <word>` with a SPACE — `ctoc push`, `ctoc quality`,
 *     `ctoc validate`, `ctoc doctor`, `ctoc process-issues`. Each implies an installed
 *     CLI subcommand that has no binary behind it. A human who types it fails.
 *
 * THE SCOPE — honestly partitioned, because this slice edits only two docs:
 *   - CLEANED SURFACE (zero-tolerance): `src/commands/push.md`. This slice removes
 *     EVERY phantom reference from it; the fence FAILS on even one.
 *   - DEBT SURFACE (shrink-only ceiling, REPORTED never silently passed): `CLAUDE.md`,
 *     `README.md`, `src/commands/start.md`, `src/commands/update.md`. This slice does
 *     NOT clean these (CLAUDE.md is edited only for one unrelated entry-point row;
 *     README/start/update are outside the declared file set). Their phantom references
 *     are real debt — the fence prints every one and asserts the total may only
 *     SHRINK, never grow. It makes NO "no phantom commands" claim over them.
 *
 * The fence FAILS on a phantom reference in the cleaned surface, on debt GROWTH in the
 * debt surface, and on an unreadable/empty target — never silently passes.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runVerify } = require('../src/lib/step-13-verify.js');

const ROOT = path.join(__dirname, '..');

// A bare `ctoc <word>` with a space. `/ctoc:push` (colon) never matches — that is the
// acceptable slash-command form. Case-sensitive: prose "CTOC" is not a command.
const PHANTOM_RE = /\bctoc [a-z][\w-]*/g;

// The file this slice fully cleans of the phantom family. Zero tolerance.
const CLEANED = ['src/commands/push.md'];

// Files this slice does NOT clean. Their phantom references are documented DEBT: the
// fence reports every one and holds a shrink-only ceiling so the count can never grow.
const DEBT = ['CLAUDE.md', 'README.md', 'src/commands/start.md', 'src/commands/update.md'];

// The phantom-debt ceiling, MEASURED on disk on 2026-07-31: CLAUDE.md carries 2
// (`ctoc validate`, `ctoc process-issues`) and README.md carries 4 (`ctoc doctor` x2,
// `ctoc process-issues`, `ctoc validate`); start.md and update.md carry 0. Total 6.
// SHRINK-ONLY: lower this as a follow-up cleans a debt file; NEVER raise it. Raising it
// is how a new phantom command gets waved through — the exact defect this fence exists
// to stop.
const PHANTOM_DEBT_CEILING = 6;

/** Read a repo file, FAILING LOUDLY (never returning empty) when it is missing or blank. */
function readOrFail(rel) {
  const abs = path.join(ROOT, rel);
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    assert.fail(`phantom-fence: required file could not be read: ${rel} (${e.message})`);
  }
  assert.ok(text.trim().length > 0, `phantom-fence: required file is empty: ${rel}`);
  return text;
}

/** Every phantom `ctoc <word>` hit in `text`, as {rel, line, text}. */
function scanPhantom(rel, text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    PHANTOM_RE.lastIndex = 0;
    while ((m = PHANTOM_RE.exec(line)) !== null) {
      hits.push({ rel, line: i + 1, text: m[0] });
    }
  }
  return hits;
}

function fmt(hits) {
  return hits.map((h) => `  ${h.rel}:${h.line}  "${h.text}"`).join('\n');
}

/** Recursively list every .js file under a directory (shell-free, cross-platform). */
function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('phantom-command fence', () => {
  it('case 1 — the binary state is read from package.json, not assumed', () => {
    const raw = readOrFail('package.json');
    const pkg = JSON.parse(raw);
    // Recorded for the cases that branch on it. `bin` may be a string or an object.
    const hasBin = Object.prototype.hasOwnProperty.call(pkg, 'bin')
      && pkg.bin != null
      && (typeof pkg.bin === 'string' ? pkg.bin.trim().length > 0 : Object.keys(pkg.bin).length > 0);
    // Enumerated fact today: no bin field. Every phantom claim rests on this.
    assert.equal(hasBin, false, 'phantom-fence: package.json unexpectedly declares a bin — cases 2/3 must be re-read');
  });

  it('case 2 — the CLEANED surface has ZERO phantom commands, and DEBT may only shrink', () => {
    // The cleaned file must be spotless. Any hit names file, line and exact text.
    const cleanedHits = [];
    for (const rel of CLEANED) cleanedHits.push(...scanPhantom(rel, readOrFail(rel)));
    assert.equal(
      cleanedHits.length, 0,
      `phantom-fence: ${cleanedHits.length} phantom command(s) in the CLEANED surface — none allowed:\n${fmt(cleanedHits)}`
    );

    // The debt surface is reported in full and held to a shrink-only ceiling. Missing
    // debt files (start.md/update.md) legitimately exist; readOrFail fails loudly if not.
    const debtHits = [];
    for (const rel of DEBT) debtHits.push(...scanPhantom(rel, readOrFail(rel)));
    // Printed unconditionally so the record always states the honest remaining size.
    console.log(`phantom-fence: ${debtHits.length} phantom reference(s) remain in undeclared/uncleaned docs (ceiling ${PHANTOM_DEBT_CEILING}):\n${fmt(debtHits)}`);
    assert.ok(
      debtHits.length <= PHANTOM_DEBT_CEILING,
      `phantom-fence: debt GREW to ${debtHits.length} (> ${PHANTOM_DEBT_CEILING}). A new phantom command entered a doc:\n${fmt(debtHits)}`
    );
  });

  it('case 3 — a bin field flips the rule from "no such command" to "match the binary"', () => {
    const pkg = JSON.parse(readOrFail('package.json'));
    const hasBin = Object.prototype.hasOwnProperty.call(pkg, 'bin')
      && pkg.bin != null
      && (typeof pkg.bin === 'string' ? pkg.bin.trim().length > 0 : Object.keys(pkg.bin).length > 0);
    if (hasBin) {
      // Good-news direction: a binary now exists, so the documented commands are no
      // longer phantom IF they match its name. This slice's cleaned surface must then
      // reference that binary. Caught here rather than left stale.
      const names = typeof pkg.bin === 'string' ? ['ctoc'] : Object.keys(pkg.bin);
      assert.ok(names.length > 0, 'phantom-fence: bin declared but names nothing');
      // The contract inverts; a human must re-derive the cleaned/debt split for the new
      // binary. This assertion exists to make that moment loud.
      assert.fail(`phantom-fence: a bin was added (${names.join(', ')}). Re-derive the phantom contract: bare "ctoc <word>" may now be real.`);
    } else {
      assert.equal(hasBin, false);
    }
  });

  it('case 4 — the entry-point row carries NOT WIRED for exactly as long as it is unreachable', () => {
    const baseline = JSON.parse(readOrFail('.ctoc/reachability-baseline.json'));
    const unreachable = Array.isArray(baseline.unreachable) ? baseline.unreachable : [];
    const inBaseline = unreachable.includes('src/lib/quality-gate.js');

    const claude = readOrFail('CLAUDE.md');
    const row = claude.split('\n').find((l) => l.includes('`src/lib/quality-gate.js`') && l.includes('|'));
    assert.ok(row, 'phantom-fence: CLAUDE.md has no "Key entry points" row for src/lib/quality-gate.js');
    const marked = /NOT WIRED/.test(row);

    if (inBaseline) {
      assert.ok(marked, `phantom-fence: quality-gate.js is in the unreachable baseline but its entry-point row omits NOT WIRED:\n  ${row.trim()}`);
    } else {
      assert.ok(!marked, `phantom-fence: quality-gate.js left the unreachable baseline — its row must drop NOT WIRED:\n  ${row.trim()}`);
    }
  });

  it('case 5 — class QualityGate is still constructed nowhere in src/', () => {
    // Shell-free scan of every src/ .js file; a `new QualityGate` hit means case 4's
    // NOT WIRED premise changed and the marker must go.
    const hits = [];
    for (const file of walkJs(path.join(ROOT, 'src'))) {
      const text = fs.readFileSync(file, 'utf8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/\bnew QualityGate\b/.test(lines[i])) {
          hits.push(`  ${path.relative(ROOT, file)}:${i + 1}  ${lines[i].trim()}`);
        }
      }
    }
    assert.equal(hits.length, 0, `phantom-fence: QualityGate is now constructed — case 4's NOT WIRED premise changed:\n${hits.join('\n')}`);
  });

  it('case 6 — Step 14 VERIFY still takes the fallback path (no ctoc quality binary)', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'phantom-fence-'));
    // Security (Step 13): the run happens strictly under os.tmpdir(), never the repo.
    assert.ok(fixture.startsWith(os.tmpdir()), 'phantom-fence: fixture escaped os.tmpdir()');
    try {
      const result = runVerify(fixture);
      assert.equal(
        result.method, 'fallback-direct',
        `phantom-fence: VERIFY reported method="${result.method}" — a ctoc quality binary exists somewhere and every claim in this slice must be re-read`
      );
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('case 7 — the push.md recovery instruction is a runnable node invocation', () => {
    const push = readOrFail('src/commands/push.md');
    const retryLine = push.split('\n').find((l) => /Retry with:/i.test(l));
    assert.ok(retryLine, 'phantom-fence: push.md has no "Retry with:" recovery line');
    assert.match(
      retryLine,
      /node\s+"[^"]*src\/commands\/[a-z]+\.js"/,
      `phantom-fence: the recovery line does not name a runnable node invocation:\n  ${retryLine.trim()}`
    );
  });
});
