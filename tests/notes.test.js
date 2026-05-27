/**
 * Tests for notes.js — user-facing inbox surface (user → Claude).
 *
 * NOTES.md lives at the project root; the web client appends timestamped
 * bullets to it. Distinct from .ctoc/inbox/ which is agent → user.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { getNotesCount, readNotes } = require('../src/lib/notes');

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-notes-'));
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

describe('getNotesCount', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  it('returns 0 when NOTES.md does not exist', () => {
    assert.equal(getNotesCount(root), 0);
  });

  it('returns 0 when NOTES.md exists but contains only the header', () => {
    fs.writeFileSync(path.join(root, 'NOTES.md'),
      '# Notes\n\nUser-submitted notes from the web client. Claude reads these at session start.\n\n');
    assert.equal(getNotesCount(root), 0);
  });

  it('counts bullet lines under the header', () => {
    fs.writeFileSync(path.join(root, 'NOTES.md'),
      '# Notes\n\n- 2026-05-27 21:01 — idea one\n- 2026-05-27 21:02 — idea two\n- 2026-05-27 21:03 — idea three\n');
    assert.equal(getNotesCount(root), 3);
  });

  it('ignores non-bullet lines (prose, blank, etc.)', () => {
    fs.writeFileSync(path.join(root, 'NOTES.md'),
      '# Notes\n\nSome prose paragraph that is not a note.\n\n- only this counts\n\nMore prose.\n');
    assert.equal(getNotesCount(root), 1);
  });

  it('handles malformed file gracefully (returns 0, does not throw)', () => {
    // Pass a directory as a file path → readFileSync will throw EISDIR
    fs.mkdirSync(path.join(root, 'NOTES.md'));
    assert.doesNotThrow(() => getNotesCount(root));
    assert.equal(getNotesCount(root), 0);
  });
});

describe('readNotes', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  it('returns null when NOTES.md does not exist', () => {
    assert.equal(readNotes(root), null);
  });

  it('returns full file contents as a string when present', () => {
    const content = '# Notes\n\n- 2026-05-27 21:01 — idea\n';
    fs.writeFileSync(path.join(root, 'NOTES.md'), content);
    assert.equal(readNotes(root), content);
  });

  it('returns null when file is unreadable (does not throw)', () => {
    fs.mkdirSync(path.join(root, 'NOTES.md'));
    assert.doesNotThrow(() => readNotes(root));
    assert.equal(readNotes(root), null);
  });
});
