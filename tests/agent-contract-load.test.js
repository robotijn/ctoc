'use strict';

// W03-s1 — Agent contract load at runtime.
//
// These tests read the REAL agent definition files from the repository (no
// fixtures, no doubles) and assert the loading contract the Claude Code plugin
// runtime actually applies: a YAML frontmatter block is only recognized when its
// opening `---\n` delimiter is at byte 0 of the file. A `# H1` heading before the
// frontmatter makes the runtime parse none of it, silently dropping the agent's
// declared tools/model/role.
//
// The runtime tool/model resolution is performed by the harness and is not
// invokable from `node --test`; the faithful in-reach proxy is to parse each file
// with the EXACT anchoring rule the runtime uses (byte-0 anchored, no `m` flag, no
// match-anywhere fallback). A byte-0 parse predicts harness registration; a lenient
// parse (the C7 defect) does not.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');

// Byte-0-anchored frontmatter parse — mirrors the runtime. NO `m` flag, NO
// match-anywhere fallback. Returns the raw frontmatter body string, or null if the
// file does not open with a frontmatter block at byte 0.
function parseByte0FM(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

// Walk `agents/**/*.md`, skipping `_`-prefixed directories (matches every other
// CTOC walker: iron-loop-enforcer.js:listAgents, agent-resolver.js). `_shared`
// prose fragments carry no frontmatter and are not dispatchable agents.
function listAgentFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_')) continue;
      out = out.concat(listAgentFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.md')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Parse a single `key: value` scalar line out of a frontmatter body string.
function fmScalar(fmBody, key) {
  const line = fmBody
    .split('\n')
    .find((l) => new RegExp(`^${key}:`).test(l));
  if (!line) return null;
  return line.slice(line.indexOf(':') + 1).trim();
}

test('byte-0 structural: every non-_shared agent file opens with frontmatter at byte 0', () => {
  const files = listAgentFiles(AGENTS_DIR);
  assert.ok(files.length > 0, 'expected to find agent files to check');

  const offenders = [];
  const wanted = Buffer.from('---\n', 'utf8');
  for (const file of files) {
    const head = Buffer.alloc(4);
    const fd = fs.openSync(file, 'r');
    try {
      fs.readSync(fd, head, 0, 4, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (!head.equals(wanted)) {
      offenders.push(path.relative(REPO_ROOT, file));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these agent files do not begin with the literal bytes "---\\n":\n${offenders.join('\n')}`
  );
});

test('cto-chief loads its declared tool contract via a byte-0 parse (runtime proxy)', () => {
  const file = path.join(AGENTS_DIR, 'coordinator', 'cto-chief.md');
  const fm = parseByte0FM(fs.readFileSync(file, 'utf8'));

  assert.notEqual(
    fm,
    null,
    'cto-chief frontmatter is not at byte 0 — the runtime would parse no tools/model/role'
  );

  const toolsRaw = fmScalar(fm, 'tools');
  assert.notEqual(toolsRaw, null, 'cto-chief declares no parseable `tools:` line');

  const tools = new Set(
    toolsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  );

  // Assert the ACTUAL declared set loads (W03 makes the existing declaration load;
  // it does NOT re-scope it). The live file declares: Read, Grep, Glob, Task, Bash.
  assert.deepEqual(
    [...tools].sort(),
    ['Bash', 'Glob', 'Grep', 'Read', 'Task'],
    `cto-chief tool set did not load as declared; got: ${[...tools].join(', ')}`
  );

  // The write-class tools must be absent. Bash is intentionally NOT asserted absent
  // here — the live declaration includes it, and re-scoping is out of W03 scope
  // (surfaced to the maintainer in the parent index, not changed here).
  for (const forbidden of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
    assert.ok(
      !tools.has(forbidden),
      `cto-chief must not declare the write-class tool ${forbidden}`
    );
  }
});

// DELETED by plan F3b (v6.12.79): a five-case loop over ['dep','lint','secret',
// 'syntax','test'] titled `<scout>-scout loads model: haiku via a byte-0 parse
// (runtime proxy)`. Each case asserted two things about agents/scouts/<n>-scout.md:
//   (a) its frontmatter parses at byte 0 (else the runtime would run it on the
//       session model rather than its declared one); and
//   (b) that byte-0 frontmatter declares `model: haiku`.
// Both contract a file that no longer exists — the five scouts are deleted. Left in
// place they would throw ENOENT rather than fail meaningfully.
//
// The byte-0 parse invariant these cases exercised is NOT lost: it remains asserted
// for the live agents above, and tests/no-tier-3.test.js uses the same byte-0
// anchored read to assert the INVERSE — that no agent anywhere declares model: haiku.
