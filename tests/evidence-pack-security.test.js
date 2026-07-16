'use strict';

// ===========================================================================
// DEFECT 1 regression — evidence-pack's tar step must NOT shell out.
//
// The archive path (tarPath) is derived from the --since=/--until= CLI args,
// which parseArgs captures with a `(.+)` group and NO validation, then
// path.join's into a filename. The old code interpolated tarPath into a
// double-quoted shell string passed to execSync:
//     execSync(`tar -czf "${tarPath}" -T "${listFile}"`, ...)
// `$(...)` command substitution fires INSIDE double quotes, so an --until of
//     $(touch SENTINEL)
// executed arbitrary shell during packing (proven: the sentinel was created).
//
// The fix routes packing through execFileSync('tar', [...argv]) — no shell —
// so the metacharacters arrive as a single literal filename argument and can
// never be interpreted. This test drives packWithTar with an injection payload
// in tarPath and asserts the sentinel file is NOT created.
// ===========================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { packWithTar } = require('../src/scripts/evidence-pack');

test('packWithTar does not execute shell command substitution in the archive path', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-evpack-sec-'));
  try {
    const sentinel = path.join(tmp, 'SENTINEL');
    // tarPath carries a $(...) command-substitution payload. Under the old
    // execSync shell string, the shell would run `touch <sentinel>` while
    // parsing the command; under execFileSync it is an inert literal filename.
    const tarPath = path.join(tmp, `$(touch ${sentinel}).tar.gz`);

    // A real, listable input so tar has something to attempt to read.
    const realFile = path.join(tmp, 'input.txt');
    fs.writeFileSync(realFile, 'evidence\n');
    const listFile = path.join(tmp, 'pack.list');
    fs.writeFileSync(listFile, 'input.txt\n');

    // Act — run from tmp so the relative listFile entry resolves. tar itself
    // may succeed or fail on the odd filename; that is irrelevant. The security
    // property is: NO shell expansion of the $(...) in tarPath ever happens.
    try {
      packWithTar(tarPath, listFile, tmp);
    } catch (_e) {
      // tar's own exit status does not matter for this assertion.
    }

    // Assert — the command substitution never ran: the sentinel does not exist.
    assert.equal(
      fs.existsSync(sentinel),
      false,
      'shell command substitution executed — tarPath was interpolated into a shell string (injection)'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('packWithTar produces a real gzip archive on a normal path (no regression)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-evpack-ok-'));
  try {
    const realFile = path.join(tmp, 'input.txt');
    fs.writeFileSync(realFile, 'evidence-body\n');
    const listFile = path.join(tmp, 'pack.list');
    fs.writeFileSync(listFile, 'input.txt\n');
    const tarPath = path.join(tmp, 'pack.tar.gz');

    packWithTar(tarPath, listFile, tmp);

    assert.equal(fs.existsSync(tarPath), true, 'archive was written');
    const head = fs.readFileSync(tarPath);
    // gzip magic bytes 0x1f 0x8b — proves a genuine gzip stream was produced.
    assert.equal(head[0], 0x1f, 'gzip magic byte 0');
    assert.equal(head[1], 0x8b, 'gzip magic byte 1');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
