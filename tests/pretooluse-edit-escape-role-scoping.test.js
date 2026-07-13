/**
 * W08-s1 — Escape-phrase matcher scans only genuinely user-*typed* transcript
 * entries (audit finding H4 / Defect 1 of ctoc-audit-w08-enforcement-honest).
 *
 * The bug: findEscapeInTranscript() used to grep the raw transcript tail across
 * ALL roles, so CTOC's own block message (which listed "hotfix, trivial fix,
 * urgent") — or a `Read` of CLAUDE.md (which documents all seven phrases) —
 * landed in the transcript as a tool_result and unlocked the very next edit.
 *
 * The fix: extractUserTypedText() parses the transcript as JSONL and keeps text
 * ONLY from genuine `type:"user"` entries (string content or `text` content
 * blocks); every `tool_result` block, every assistant/metadata entry, is
 * excluded. buildBlockMessage() no longer emits the verbatim phrase list.
 *
 * These are in-process unit tests against the exported functions (importing the
 * module never runs enforcement — it is guarded by require.main === module — so
 * no subprocess and no process.exit is triggered here). Fixtures are synthetic
 * JSONL strings built in-test; no real transcript, no filesystem. No test
 * doubles: the real hook functions and the real escape-phrases matcher run.
 *
 * Cross-platform: pure string fixtures, no paths, no OS-specific behavior.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const {
  findEscapeInTranscript,
  extractUserTypedText,
  buildBlockMessage,
} = require(path.join(REPO, 'src', 'hooks', 'PreToolUse.Edit.js'));
const {
  ESCAPE_PHRASES,
  matchEscapePhrase,
} = require(path.join(REPO, 'src', 'lib', 'escape-phrases'));

/** Join entries as a JSONL transcript string (one JSON object per line). */
function jsonl(...entries) {
  return entries
    .map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
    .join('\n');
}

/** A genuine user turn with plain string content. */
function userString(text) {
  return { type: 'user', message: { role: 'user', content: text } };
}

/** A tool_result entry — carries role:"user" too, but is NOT user-typed. */
function toolResult(text) {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', content: text }],
    },
  };
}

/** An assistant turn with a text block. */
function assistantText(text) {
  return {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  };
}

describe('W08-s1: findEscapeInTranscript — role-scoped extraction', () => {
  it("1. CTOC's own block-message text (as a tool_result) cannot self-unlock", () => {
    const transcript = jsonl(
      userString('please create a plan for the parser refactor'),
      toolResult(
        '[CTOC v7] Edit BLOCKED. Use an escape phrase (hotfix, trivial fix, ' +
        'urgent) if this is genuinely small.',
      ),
    );
    assert.equal(findEscapeInTranscript(transcript), null,
      "a phrase inside CTOC's own denial (a tool_result) must NOT unlock");
  });

  it('2. a Read of CLAUDE.md (tool_result listing all seven phrases) cannot unlock', () => {
    const claudeMd = ESCAPE_PHRASES.join(', ');
    const transcript = jsonl(
      userString('read CLAUDE.md so I understand enforcement'),
      toolResult(`Mandatory Pipeline Use: escape phrases are ${claudeMd}.`),
    );
    assert.equal(findEscapeInTranscript(transcript), null,
      'a Read of CLAUDE.md (tool_result) that lists every phrase must NOT unlock');
  });

  it('3. a genuinely user-typed phrase still unlocks (regression guard)', () => {
    const transcript = jsonl(userString('please hotfix this'));
    assert.equal(findEscapeInTranscript(transcript), 'hotfix',
      'a phrase the user themselves typed must still unlock');
  });

  it('4. a later non-user occurrence does not override an earlier user phrase', () => {
    const transcript = jsonl(
      userString('hotfix'),
      toolResult('the system says this is urgent and must ship now'),
    );
    assert.equal(findEscapeInTranscript(transcript), 'hotfix',
      "recency of a non-user hit is moot once non-user text is excluded");
  });

  it('5. assistant text never unlocks', () => {
    const transcript = jsonl(
      userString('what are my options here?'),
      assistantText('you could use hotfix here to skip the pipeline'),
    );
    assert.equal(findEscapeInTranscript(transcript), null,
      'a phrase the assistant emitted must NOT unlock');
  });

  it('6a. a mixed user entry honors the text block', () => {
    const mixed = {
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'skip iron loop' },
          { type: 'tool_result', tool_use_id: 't2', content: 'the log says urgent' },
        ],
      },
    };
    assert.equal(findEscapeInTranscript(jsonl(mixed)), 'skip iron loop',
      'the user-typed text block must be honored');
  });

  it('6b. a mixed user entry does NOT honor the tool_result block', () => {
    const mixed = {
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'please review this diff carefully' },
          { type: 'tool_result', tool_use_id: 't3', content: 'this is urgent' },
        ],
      },
    };
    assert.equal(findEscapeInTranscript(jsonl(mixed)), null,
      'a phrase present ONLY in the tool_result block must NOT unlock');
  });

  it('7. malformed / metadata lines are skipped, never thrown on', () => {
    const transcript = jsonl(
      { type: 'last-prompt' },            // metadata: no message
      'not json at all',                  // non-JSON line
      { type: 'mode', mode: 'default' },  // metadata: no message
      userString('quick fix'),
    );
    let result;
    assert.doesNotThrow(() => { result = findEscapeInTranscript(transcript); },
      'a malformed/metadata line must degrade to skipped, never throw');
    assert.equal(result, 'quick fix',
      'a valid user phrase after malformed lines must still be found');
  });

  it('handles empty / null transcript without throwing', () => {
    assert.equal(findEscapeInTranscript(''), null);
    assert.equal(findEscapeInTranscript(null), null);
    assert.equal(findEscapeInTranscript(undefined), null);
  });

  it('backward-compat: a plaintext (non-JSONL) user transcript still unlocks', () => {
    // The pre-existing subprocess suites (e2e-enforcement-and-gates,
    // w01-edit-write-deny-protocol) feed a simplified plaintext transcript.
    // Production transcripts are JSONL — assistant turns and tool results always
    // arrive as JSON objects and are role-classified out — so treating a
    // non-JSON line as user-typed text is safe there and preserves this contract.
    const transcript = 'user: please apply this hotfix to the parser, it is breaking prod\n';
    assert.equal(findEscapeInTranscript(transcript), 'hotfix',
      'a plaintext user transcript must still honor a user-typed phrase');
  });
});

describe('W08-s1: extractUserTypedText', () => {
  it('8. keeps user string content, drops assistant and tool_result text', () => {
    const transcript = jsonl(
      userString('USER_MARKER_TEXT'),
      assistantText('ASSISTANT_MARKER_TEXT'),
      toolResult('TOOLRESULT_MARKER_TEXT'),
    );
    const text = extractUserTypedText(transcript);
    assert.ok(text.includes('USER_MARKER_TEXT'), 'user-typed text must be kept');
    assert.ok(!text.includes('ASSISTANT_MARKER_TEXT'), 'assistant text must be excluded');
    assert.ok(!text.includes('TOOLRESULT_MARKER_TEXT'), 'tool_result text must be excluded');
  });

  it('excludes a user entry whose role is explicitly non-user', () => {
    const spoofed = { type: 'user', message: { role: 'assistant', content: 'hotfix' } };
    assert.equal(extractUserTypedText(jsonl(spoofed)), '',
      'an entry whose message.role is not "user" must be excluded');
  });

  it('returns empty string for empty / non-string input', () => {
    assert.equal(extractUserTypedText(''), '');
    assert.equal(extractUserTypedText(null), '');
    assert.equal(extractUserTypedText(undefined), '');
  });
});

describe('W08-s1: buildBlockMessage — phrase-free and still helpful', () => {
  const info = { target_file: 'src/lib/x.js', project_root: '/repo' };

  it('9. contains none of the seven canonical escape phrases', () => {
    const msg = buildBlockMessage('no covering plan', info);
    for (const p of ESCAPE_PHRASES) {
      assert.equal(matchEscapePhrase(msg) === p, false,
        `block message must not contain the canonical phrase "${p}"`);
    }
    assert.equal(matchEscapePhrase(msg), null,
      'the block message must contain no canonical escape phrase at all');
  });

  it('10. still points to /ctoc:menu and names the target (stays actionable)', () => {
    const msg = buildBlockMessage('no covering plan', info);
    assert.ok(msg.includes('/ctoc:menu'), 'block message must point to /ctoc:menu');
    assert.ok(msg.includes('src/lib/x.js'), 'block message must name the target file');
    assert.ok(msg.includes('BLOCKED'), 'block message must still announce it BLOCKED');
  });

  it('degrades gracefully when info fields are missing', () => {
    const msg = buildBlockMessage('r', {});
    assert.ok(msg.includes('(unknown)'), 'missing target renders as (unknown)');
    assert.equal(matchEscapePhrase(msg), null, 'still phrase-free with empty info');
  });
});
