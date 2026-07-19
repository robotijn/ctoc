'use strict';

/**
 * TWO GUARANTEES, DELIBERATELY IN ONE FILE.
 *
 * 1. NO SOURCE FILE UNDER `src/` CONTAINS A RAW NUL BYTE. A single NUL flips a file
 *    to "binary" for every content-search tool. A single-FILE search at least prints
 *    a `binary file matches` notice; a PROJECT-WIDE search does not — the file simply
 *    drops out of the result list, indistinguishable from a file that genuinely has
 *    no match. `src/lib/approval-ledger.js`, the single source of approval truth for
 *    CTOC's human gates, was invisible to every such search: a search for `require(`
 *    across `src/**` returned 139 files and omitted it, though it requires `crypto`.
 *    That is this repository's central defect class — a report about input that was
 *    never read — wearing a different coat.
 *
 * 2. THE SPECIFICATION DIGEST DID NOT MOVE. The repair for guarantee 1 rewrites the
 *    hash domain separators in `computeSpecHash` from an embedded control character
 *    to the `\x00` escape. In JavaScript those produce an IDENTICAL string, therefore
 *    an identical digest — but "identical by language semantics" is an argument, not
 *    evidence, and a digest that moved would silently invalidate EVERY existing
 *    approval record in the repository. `GOLDEN` below was recorded from the
 *    UNMODIFIED code before the repair and pins the identity byte-for-byte.
 *
 * They live together because guarantee 1 is only safe to ship if guarantee 2 holds.
 * Separating them would let the searchability repair land without its safety proof.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { computeSpecHash } = require('../src/lib/approval-ledger');

const SRC_ROOT = path.join(__dirname, '..', 'src');
const REPO_ROOT = path.join(__dirname, '..');

/**
 * The digest of FIXTURE produced by the code as it stood BEFORE the separator
 * repair. Recorded verbatim from the first (red) run of this file. If this ever
 * fails, the specification hash has moved and every approval record in
 * `.ctoc/approvals/` written under `hash_scope: 'specification'` has silently become
 * unverifiable. That is a STOP-AND-REPORT condition, never an assertion to update.
 */
const GOLDEN = '962db885f1696906a82b2aa3d35540cbbcec2038db9238286fc013bdd0dadcc7';

/**
 * A plan-shaped fixture written inline so it can never drift with a file on disk.
 * It carries frontmatter, ordinary body prose, an execution section the hash must
 * EXCLUDE, and `- [x]` completion records the hash must also exclude.
 */
const FIXTURE = [
  '---',
  'title: "a fixture plan"',
  'type: implementation',
  'files:',
  '  - "src/lib/example.js"',
  '---',
  '',
  '# A fixture plan',
  '',
  'Body prose that IS part of the specification.',
  '',
  '## Implementation Details',
  '',
  '- src/lib/example.js — a plain bullet, which is specification and stays hashed.',
  '',
  '## Execution Plan (Steps 8-16)',
  '',
  'Everything under this heading is the executor log and is excluded.',
  '',
  '- [x] a completion record',
  '- [ ] an open record',
  '',
  '## Decisions Taken Under Ambiguity',
  '',
  '1. This section is ALSO an excluded execution section (see EXECUTION_SECTIONS),',
  '   so the executor can record decisions here without invalidating the approval.',
  '',
].join('\n');

/**
 * Enumerate every `.js` file under `dir`, recursively.
 *
 * @param {string} dir - directory to walk
 * @returns {string[]} absolute paths
 */
function enumerateJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...enumerateJsFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * Read every `.js` file under `dir` as a Buffer and report the ones containing a raw
 * NUL byte.
 *
 * FAILS LOUD, NEVER CLEAN. A file that cannot be read RETHROWS with its path
 * attached — there is no `catch {}`, no skip and no default-to-clean, because a
 * scanner reporting "no NUL bytes found" over files it never opened would be a fresh
 * instance of the exact defect this fence exists to catch. `filesRead` is returned so
 * a caller can assert the scan actually looked at the tree it claims to judge.
 *
 * @param {string} dir - directory to scan
 * @returns {{filesRead: number, findings: Array<{file: string, offset: number}>}}
 */
function scanForNulBytes(dir) {
  const files = enumerateJsFiles(dir);
  const findings = [];
  let filesRead = 0;
  for (const file of files) {
    let buf;
    try {
      buf = fs.readFileSync(file);
    } catch (err) {
      throw new Error(`NUL-byte scan could not read ${file}: ${err.message}`);
    }
    filesRead++;
    const offset = buf.indexOf(0);
    if (offset !== -1) {
      findings.push({ file: path.relative(REPO_ROOT, file), offset });
    }
  }
  return { filesRead, findings };
}

test('the specification digest is unchanged by the separator repair', () => {
  const res = computeSpecHash(FIXTURE);
  assert.strictEqual(res.ok, true, `computeSpecHash failed: ${res.reason}`);
  assert.strictEqual(
    res.hash,
    GOLDEN,
    'THE SPECIFICATION DIGEST MOVED. Every approval record written under '
      + `hash_scope: 'specification' is now unverifiable. Expected ${GOLDEN}, got `
      + `${res.hash}. STOP AND REPORT — do not update this constant.`,
  );
});

test('domain separation still bites: same concatenation, different split, different digest', () => {
  // Both fixtures concatenate to the same frontmatter+body bytes ('abc'); only the
  // split point differs. Without the separators between the two derived regions
  // these would hash identically, which is the collision the separators exist to
  // stop. Asserted directly rather than trusted.
  const splitEarly = ['---', 'a', '---', 'bc', ''].join('\n');
  const splitLate = ['---', 'ab', '---', 'c', ''].join('\n');

  const a = computeSpecHash(splitEarly);
  const b = computeSpecHash(splitLate);
  assert.strictEqual(a.ok, true);
  assert.strictEqual(b.ok, true);

  // Sanity, so this test cannot pass for the wrong reason: the two fixtures really
  // are split differently, and the two hashed regions really do concatenate to the
  // same bytes. Without the separators between them, that concatenation is all the
  // digest would see, and the two would collide.
  assert.strictEqual(a.frontmatter, 'a');
  assert.strictEqual(b.frontmatter, 'ab');
  assert.strictEqual(a.frontmatter + 'bc\n', b.frontmatter + 'c\n');

  assert.notStrictEqual(
    a.hash,
    b.hash,
    'Two different frontmatter/body splits of the SAME bytes produced the same '
      + 'digest — domain separation is gone and the ledger has a collision.',
  );
});

test('the frontmatter length prefix still bites', () => {
  // A second, independent pair: frontmatter one character longer, body correspondingly
  // shorter. Note these two mechanisms — the length prefix and the NUL separator —
  // are JOINTLY but not INDEPENDENTLY falsifiable from plan-shaped input, because a
  // real plan's frontmatter cannot contain a NUL byte to forge the separator with.
  // This asserts the composite property, which is the one the ledger relies on.
  const longerFrontmatter = ['---', 'key: value', '---', 'body', ''].join('\n');
  const shorterFrontmatter = ['---', 'key: valu', '---', 'ebody', ''].join('\n');

  const a = computeSpecHash(longerFrontmatter);
  const b = computeSpecHash(shorterFrontmatter);
  assert.strictEqual(a.ok, true);
  assert.strictEqual(b.ok, true);
  assert.notStrictEqual(a.frontmatter.length, b.frontmatter.length, 'sanity: lengths differ');
  assert.notStrictEqual(
    a.hash,
    b.hash,
    'Shifting one character across the frontmatter/body boundary did not change the '
      + 'digest — the length prefix is gone.',
  );
});

test('no file under src/ contains a NUL byte', () => {
  const { findings } = scanForNulBytes(SRC_ROOT);
  const detail = findings
    .map((f) => `  ${f.file} — first NUL at byte offset ${f.offset}`)
    .join('\n');
  assert.deepStrictEqual(
    findings,
    [],
    'Source file(s) contain a raw NUL byte, which makes them BINARY to every content '
      + 'search. A project-wide search drops them SILENTLY — no notice, no match, '
      + 'indistinguishable from a genuine miss:\n'
      + detail
      + '\nWrite the byte as the \\x00 escape instead: identical at runtime, ordinary '
      + 'text on disk.',
  );
});

test('the fence can read what it claims to judge', () => {
  const enumerated = enumerateJsFiles(SRC_ROOT);
  const { filesRead } = scanForNulBytes(SRC_ROOT);
  assert.ok(filesRead > 0, 'the NUL scan read ZERO files — a clean verdict over nothing is a lie');
  assert.strictEqual(
    filesRead,
    enumerated.length,
    `the NUL scan read ${filesRead} files but the tree holds ${enumerated.length} — `
      + 'a file was skipped, so the clean verdict does not cover the tree',
  );
});

test('a scan of a tree with no source files is caught, not reported clean', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ctoc-nul-empty-'));
  try {
    const { filesRead, findings } = scanForNulBytes(dir);
    assert.strictEqual(findings.length, 0);
    assert.strictEqual(filesRead, 0);
    // This is the vacuity proof: the guard in the test above is what turns this
    // zero-file "clean" result into a loud failure rather than a pass.
    assert.throws(
      () => assert.ok(filesRead > 0, 'the NUL scan read ZERO files'),
      /read ZERO files/,
    );
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('the fence bites: a file containing a NUL is reported by the same scan', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ctoc-nul-fixture-'));
  try {
    const clean = path.join(dir, 'clean.js');
    const dirty = path.join(dir, 'dirty.js');
    await fsp.writeFile(clean, "'use strict';\nmodule.exports = {};\n", 'utf8');
    await fsp.writeFile(dirty, Buffer.from("'use strict';\nconst sep = '\0';\n", 'utf8'));

    const { filesRead, findings } = scanForNulBytes(dir);
    assert.strictEqual(filesRead, 2);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].file, path.relative(REPO_ROOT, dirty));
    assert.ok(findings[0].offset > 0, 'the finding carries a byte offset');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
