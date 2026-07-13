'use strict';

/**
 * Unit tests for the LIVE half of the ask-me-questions evaluation harness.
 *
 * The evaluation transport is the `claude` binary in non-interactive print
 * mode — it uses the authentication the user's Claude Code session already
 * has. There is NO network interface key anywhere in this harness.
 *
 * These tests exercise the pure functions plus the real subprocess machinery
 * with zero test doubles of our own logic: the binary is stood in by a REAL
 * tiny node script written to a temporary directory and driven through a real
 * child process. No test here spawns the actual `claude` binary or spends a
 * token.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  runClaude,
  detectClaudeBinary,
  parseResultJson,
  extractJsonBlock
} = require('../evals/lib/runner.js');
const { buildJudgePrompt, parseJudgement } = require('../evals/lib/judge.js');
const { passThreshold } = require('../evals/ask-me-questions.eval.js');

const REPO_ROOT = path.join(__dirname, '..');
const RUN_JS = path.join(REPO_ROOT, 'evals', 'run.js');
const FIXTURES_DIR = path.join(REPO_ROOT, 'evals', 'fixtures', 'ask-me-questions');

// ---------------------------------------------------------------------------
// Real executable fixture: a tiny node script that stands in for `claude`.
// ---------------------------------------------------------------------------

/**
 * Write a real node script to a fresh temp directory and return its path.
 * The caller drives it as the fake binary via a spawnImpl that prepends the
 * real node interpreter — a genuine subprocess, cross-platform, no stub of the
 * runner's own logic.
 */
function writeFakeBinary(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-eval-'));
  const file = path.join(dir, 'fake-claude.js');
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

// A spawnImpl that runs the given node script as a real child process. The
// `bin` argument is ignored on purpose — the script stands in for the binary.
function nodeScriptSpawn(scriptPath) {
  return (bin, args, options) => spawnSync(process.execPath, [scriptPath, ...args], options);
}

const CANNED_RESULT = JSON.stringify({
  type: 'result',
  result: 'CANNED MODEL TEXT',
  usage: { input_tokens: 5, output_tokens: 7 },
  total_cost_usd: 0.0012,
  is_error: false
});

const OK_BINARY = `'use strict';
const args = process.argv.slice(2);
if (args.includes('--version')) { process.stdout.write('1.2.3 (fixture)\\n'); process.exit(0); }
process.stdout.write(${JSON.stringify(CANNED_RESULT)});
process.exit(0);
`;

// ---------------------------------------------------------------------------
// runClaude
// ---------------------------------------------------------------------------

test('runClaude parses the --output-format json object from the binary', () => {
  const bin = writeFakeBinary(OK_BINARY);
  const res = runClaude('render a decision', { spawnImpl: nodeScriptSpawn(bin) });
  assert.equal(res.text, 'CANNED MODEL TEXT');
  assert.equal(res.usageInputTokens, 5);
  assert.equal(res.usageOutputTokens, 7);
  assert.equal(res.costUsd, 0.0012);
  assert.equal(res.isError, false);
});

test('runClaude argv carries flags only; the PROMPT travels on stdin (leading dashes safe)', () => {
  // Echo BOTH the argv and the full stdin back, so one real subprocess proves
  // (a) the prompt is not an argv element and (b) it arrives intact on stdin —
  // including a prompt that BEGINS with "---", which as argv would be read by
  // the command line's option parser as an unknown option (the live failure).
  const ARGV_AND_STDIN_ECHO = `'use strict';
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const stdin = Buffer.concat(chunks).toString('utf8');
  const args = process.argv.slice(2);
  process.stdout.write(JSON.stringify({ result: JSON.stringify({ args, stdin }), usage: {}, is_error: false }));
  process.exit(0);
});
`;
  const bin = writeFakeBinary(ARGV_AND_STDIN_ECHO);
  const dashPrompt = '---\nname: starts-with-frontmatter\n---\nthe actual prompt body';
  const res = runClaude(dashPrompt, { model: 'claude-opus-4-8', spawnImpl: nodeScriptSpawn(bin) });
  const seen = JSON.parse(res.text);
  assert.deepEqual(seen.args, ['-p', '--output-format', 'json', '--model', 'claude-opus-4-8']);
  assert.equal(seen.stdin, dashPrompt);
  assert.equal(res.isError, false);
});

test('runClaude is LOUD on a non-zero exit: isError true, never an empty success', () => {
  const DYING_BINARY = `'use strict';
process.stderr.write("error: unknown option");
process.exit(1);
`;
  const bin = writeFakeBinary(DYING_BINARY);
  const res = runClaude('any prompt', { spawnImpl: nodeScriptSpawn(bin) });
  assert.equal(res.isError, true);
  assert.equal(res.exitStatus, 1);
  assert.match(res.stderr, /unknown option/);
});

test('runClaude is LOUD on unparseable stdout even with exit 0: isError true', () => {
  const GARBAGE_BINARY = `'use strict';
process.stdout.write("this is not the result json");
process.exit(0);
`;
  const bin = writeFakeBinary(GARBAGE_BINARY);
  const res = runClaude('any prompt', { spawnImpl: nodeScriptSpawn(bin) });
  assert.equal(res.isError, true);
  assert.equal(res.exitStatus, 0);
});

test('runClaude omits --model when no model is given', () => {
  const ARGV_ECHO = `'use strict';
const args = process.argv.slice(2);
process.stdout.write(JSON.stringify({ result: JSON.stringify(args), usage: {}, is_error: false }));
process.exit(0);
`;
  const bin = writeFakeBinary(ARGV_ECHO);
  const res = runClaude('p', { spawnImpl: nodeScriptSpawn(bin) });
  const argv = JSON.parse(res.text);
  assert.equal(argv.includes('--model'), false);
});

test('runClaude surfaces is_error true from the binary', () => {
  const ERR_BINARY = `'use strict';
process.stdout.write(JSON.stringify({ result: 'boom', is_error: true, usage: {} }));
process.exit(0);
`;
  const bin = writeFakeBinary(ERR_BINARY);
  const res = runClaude('p', { spawnImpl: nodeScriptSpawn(bin) });
  assert.equal(res.isError, true);
});

test('runClaude throws when the binary cannot be spawned', () => {
  const failingSpawn = () => ({ error: new Error('spawn ENOENT'), status: null, stdout: '', stderr: '' });
  assert.throws(
    () => runClaude('p', { spawnImpl: failingSpawn, claudeBin: '/nonexistent/claude' }),
    /nonexistent|spawn/i
  );
});

// ---------------------------------------------------------------------------
// detectClaudeBinary
// ---------------------------------------------------------------------------

test('detectClaudeBinary reports available and a version when --version succeeds', () => {
  const bin = writeFakeBinary(OK_BINARY);
  const detected = detectClaudeBinary({ spawnImpl: nodeScriptSpawn(bin) });
  assert.equal(detected.available, true);
  assert.ok(/1\.2\.3/.test(detected.version));
});

test('detectClaudeBinary reports unavailable when the binary is missing', () => {
  const failingSpawn = () => ({ error: new Error('spawn ENOENT'), status: null, stdout: '', stderr: '' });
  const detected = detectClaudeBinary({ spawnImpl: failingSpawn });
  assert.equal(detected.available, false);
  assert.equal(detected.version, null);
});

test('detectClaudeBinary reports unavailable on a non-zero exit', () => {
  const BAD_EXIT = `'use strict';
process.stderr.write('nope\\n');
process.exit(2);
`;
  const bin = writeFakeBinary(BAD_EXIT);
  const detected = detectClaudeBinary({ spawnImpl: nodeScriptSpawn(bin) });
  assert.equal(detected.available, false);
});

// ---------------------------------------------------------------------------
// parseResultJson (pure)
// ---------------------------------------------------------------------------

test('parseResultJson extracts text, usage and cost from a real result object', () => {
  const parsed = parseResultJson(CANNED_RESULT);
  assert.equal(parsed.text, 'CANNED MODEL TEXT');
  assert.equal(parsed.usageInputTokens, 5);
  assert.equal(parsed.usageOutputTokens, 7);
  assert.equal(parsed.costUsd, 0.0012);
  assert.equal(parsed.isError, false);
});

test('parseResultJson returns empty shapes on garbage and never throws', () => {
  for (const garbage of ['', 'not json', '{bad', null, undefined, '[]', '42']) {
    const parsed = parseResultJson(garbage);
    assert.equal(parsed.text, '');
    assert.equal(parsed.usageInputTokens, 0);
    assert.equal(parsed.usageOutputTokens, 0);
    assert.equal(parsed.costUsd, 0);
    assert.equal(parsed.isError, false);
  }
});

test('parseResultJson zeroes token counts when usage is missing', () => {
  const parsed = parseResultJson(JSON.stringify({ result: 'hi' }));
  assert.equal(parsed.text, 'hi');
  assert.equal(parsed.usageInputTokens, 0);
  assert.equal(parsed.usageOutputTokens, 0);
});

// ---------------------------------------------------------------------------
// extractJsonBlock (pure)
// ---------------------------------------------------------------------------

test('extractJsonBlock parses a fenced json block into an object', () => {
  const text = [
    'Here is the decision.',
    '',
    '```json',
    '{ "questions": [ { "question": "Which?", "header": "H", "options": [] } ] }',
    '```'
  ].join('\n');
  const obj = extractJsonBlock(text);
  assert.ok(obj);
  assert.ok(Array.isArray(obj.questions));
  assert.equal(obj.questions[0].header, 'H');
});

test('extractJsonBlock returns null when no fenced block is present', () => {
  assert.equal(extractJsonBlock('just prose, no fences here'), null);
});

test('extractJsonBlock returns null when the fenced block is not valid json', () => {
  const text = ['```json', '{ not: valid, json', '```'].join('\n');
  assert.equal(extractJsonBlock(text), null);
});

test('extractJsonBlock returns the LAST json-parseable fenced block (last fence wins)', () => {
  const text = [
    '```json',
    '{ "pick": "first" }',
    '```',
    'and later',
    '```json',
    '{ "pick": "second" }',
    '```'
  ].join('\n');
  const obj = extractJsonBlock(text);
  assert.equal(obj.pick, 'second');
});

// ---------------------------------------------------------------------------
// judge — prompt shape and parsing
// ---------------------------------------------------------------------------

test('buildJudgePrompt names the two semantic checks and the json reply contract', () => {
  const prompt = buildJudgePrompt({
    scenario: { title: 't', context: 'c', decision: 'd?', constraints: ['must be exact'] },
    candidateText: 'CANDIDATE',
    candidateCall: { questions: [] }
  });
  assert.ok(/recommendation_is_best/.test(prompt));
  assert.ok(/explanation_is_specific/.test(prompt));
  assert.ok(/must be exact/.test(prompt));
  assert.ok(/CANDIDATE/.test(prompt));
  assert.ok(/json/i.test(prompt));
});

test('parseJudgement reads booleans and reasons from a fenced json reply', () => {
  const text = [
    'Judgement below.',
    '```json',
    '{ "recommendation_is_best": true, "explanation_is_specific": false, "reasons": ["a", "b"] }',
    '```'
  ].join('\n');
  const judgement = parseJudgement(text);
  assert.equal(judgement.recommendationIsBest, true);
  assert.equal(judgement.explanationIsSpecific, false);
  assert.deepEqual(judgement.reasons, ['a', 'b']);
});

test('parseJudgement returns null when no json judgement is present (an error, not a pass)', () => {
  assert.equal(parseJudgement('I think it is fine, honestly.'), null);
});

test('parseJudgement returns null when the boolean fields are missing', () => {
  const text = ['```json', '{ "reasons": ["incomplete"] }', '```'].join('\n');
  assert.equal(parseJudgement(text), null);
});

// ---------------------------------------------------------------------------
// run.js — skip semantics as a real subprocess, no network touched
// ---------------------------------------------------------------------------

// Point the harness at a binary that does not exist so detection reports the
// claude binary unavailable. The env override is a real, documented seam.
function runCliWithoutClaude(extraArgs) {
  const env = { ...process.env, CTOC_EVAL_CLAUDE_BIN: path.join(os.tmpdir(), 'definitely-not-claude-xyz') };
  return spawnSync(process.execPath, [RUN_JS, ...extraArgs], { env, encoding: 'utf8' });
}

test('run.js prints an unmistakable SKIPPED banner and exits 0 when claude is unavailable', () => {
  const result = runCliWithoutClaude([]);
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(/SKIPPED/.test(result.stdout), `expected SKIPPED banner, got: ${result.stdout}`);
  assert.ok(/NOTHING WAS EVALUATED/.test(result.stdout));
  assert.ok(/not a (PASS|pass)/.test(result.stdout), 'banner must state this is a skip, not a pass');
});

test('run.js exits 1 under --require-claude when claude is unavailable', () => {
  const result = runCliWithoutClaude(['--require-claude']);
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(/SKIPPED/.test(result.stdout));
});

// ---------------------------------------------------------------------------
// Fixture integrity — real files on disk, no fabricated numbers
// ---------------------------------------------------------------------------

function readFixtureFiles() {
  const names = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
  return names.sort().map((name) => ({
    name,
    parsed: JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'))
  }));
}

test('there are exactly three ask-me-questions fixtures', () => {
  const files = readFixtureFiles();
  assert.equal(files.length, 3, `expected 3 fixtures, found ${files.map((f) => f.name).join(', ')}`);
});

test('every fixture has the required keys and a well-formed constraints array', () => {
  for (const { name, parsed } of readFixtureFiles()) {
    for (const key of ['id', 'title', 'context', 'decision', 'constraints']) {
      assert.ok(key in parsed, `${name} is missing required key "${key}"`);
    }
    assert.equal(typeof parsed.id, 'string');
    assert.ok(parsed.id.length > 0, `${name} has an empty id`);
    assert.equal(typeof parsed.title, 'string');
    assert.equal(typeof parsed.context, 'string');
    assert.equal(typeof parsed.decision, 'string');
    assert.ok(parsed.decision.trim().endsWith('?'), `${name} decision should be a real question`);
    assert.ok(Array.isArray(parsed.constraints), `${name} constraints must be an array`);
    assert.ok(parsed.constraints.length >= 2, `${name} needs at least two constraints`);
    for (const c of parsed.constraints) {
      assert.equal(typeof c, 'string');
      assert.ok(c.length > 0);
    }
  }
});

test('fixture ids are unique', () => {
  const ids = readFixtureFiles().map((f) => f.parsed.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate fixture ids: ${ids.join(', ')}`);
});

test('constraints contain no bare currency or percentage tokens (no fabricated numbers)', () => {
  // A bare currency amount ($5, €10) or a percentage (20%) would be a fabricated
  // numeric claim the model judge could not verify from this repository.
  const money = /[$€£¥]\s?\d/;
  const percent = /\d\s?%/;
  for (const { name, parsed } of readFixtureFiles()) {
    for (const c of parsed.constraints) {
      assert.ok(!money.test(c), `${name} constraint has a bare currency amount: "${c}"`);
      assert.ok(!percent.test(c), `${name} constraint has a bare percentage: "${c}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// pass-threshold math — ceil(runs * 2 / 3)
// ---------------------------------------------------------------------------

test('passThreshold is ceil(runs * 2 / 3)', () => {
  assert.equal(passThreshold(1), 1);
  assert.equal(passThreshold(3), 2);
  assert.equal(passThreshold(5), 4);
});
