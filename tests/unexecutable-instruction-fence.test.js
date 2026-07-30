/**
 * THE UNEXECUTABLE-ORDER FENCE (plan 00110).
 *
 * The invariant, in plain words: an agent definition must never ORDER the agent to
 * execute JavaScript that its own `tools:` grant gives it no way to execute. An agent
 * whose tools are `Read, Grep` cannot run a `node` process, so an order to
 * "call `shouldRunGdpr(projectRoot)`" silently does nothing — the agent does the parts
 * it can and returns a result that reads like success.
 *
 * DEBT vs EXEMPTION — two structures, two meanings, kept as separate keys in
 * `.ctoc/unexecutable-instruction-baseline.json`:
 *   • `debt`       — a REAL order that cannot execute today, being paid down. No
 *                    per-entry justification. May only ever SHRINK. `maxDebt` ratchets
 *                    down only.
 *   • `exemptions` — NOT a defect; the detector is wrong about this one. Requires a
 *                    written `reason` of >= 20 characters per entry. Ships EMPTY.
 * Anything in neither list FAILS the build.
 *
 * A CITATION IS NOT AN INVOCATION: a bare backticked name with no call parenthesis, a
 * `file#name` anchor, a third-person description, fenced example code, and a callee
 * whose bare name is itself a granted tool are NOT findings. This follows the same
 * strip-first, parenthesis-required, under-reporting discipline as src/lib/reachability.js.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { scan } = require('../src/lib/unexecutable-instruction-scan');

const ROOT = path.join(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, '.ctoc', 'unexecutable-instruction-baseline.json');

const FIVE_CORRECTED = [
  'agents/compliance/eu-ai-act-agent.md',
  'agents/compliance/gdpr-agent.md',
  'agents/compliance/eu-solution-recommender.md',
  'agents/planning/vision-decomposer.md',
  'agents/planning/product-owner.md',
];

// ── temp-fixture plumbing ────────────────────────────────────────────────────
let tmpRoot;
before(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'uif-')); });
after(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

let seq = 0;
/** Create a throwaway project root holding one agent file, return {root, findings}. */
function scanFixture(agentRelDir, filename, contents) {
  const root = path.join(tmpRoot, `f${seq++}`);
  const dir = path.join(root, agentRelDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), contents);
  return { root, result: scan(root) };
}

function agent(tools, body) {
  return `---\nname: fixture\ntools: ${tools}\n---\n\n# Fixture\n\n${body}\n`;
}

describe('unexecutable-instruction fence', () => {
  it('1. non-vacuity: a scan that read nothing must fail loudly, not pass silently', () => {
    const { scanned } = scan(ROOT);
    assert.ok(scanned.agents >= 100, `expected >=100 agents scanned, got ${scanned.agents}`);
    assert.ok(scanned.withGrant >= 100, `expected >=100 agents with a tools grant, got ${scanned.withGrant}`);
  });

  it('2. s1 fires on a real historical order (call `shouldRunGdpr(projectRoot)`)', () => {
    const { result } = scanFixture('agents/compliance', 'g.md', agent('Read, Grep',
      'Before any finding, call `shouldRunGdpr(projectRoot)` from the regime module.'));
    assert.equal(result.findings.length, 1);
    const f = result.findings[0];
    assert.equal(f.signature, 's1');
    assert.equal(f.callee, 'shouldRunGdpr');
    assert.ok(f.key.endsWith('::instruction-tool::shouldRunGdpr'), f.key);
    assert.equal(f.file, 'agents/compliance/g.md');
  });

  it('3. s2 fires where s1 cannot (a "You … via `createFetcher(…)`" sentence, no call verb)', () => {
    const { result } = scanFixture('agents/compliance', 'r.md', agent('WebSearch, WebFetch',
      'You construct your fetcher exactly once, via `createFetcher(WebSearch, WebFetch)`.'));
    assert.equal(result.findings.length, 1);
    // Signature s2 (not s1) proves the imperative-call signature did NOT claim it —
    // there is no call/invoke/drive-via verb, only the second-person subject.
    assert.equal(result.findings[0].signature, 's2');
    assert.equal(result.findings[0].callee, 'createFetcher');
  });

  it('4. s3 fires on a capability manifest (a `Tools Used` list of library functions)', () => {
    const { result } = scanFixture('agents/planning', 'd.md', agent('Read, Write',
      '## Tools Used\n\n- `validateVisionReadiness(visionPath)` -- gate\n- `createStub(visionSlug, goal)` -- create'));
    const callees = result.findings.map((f) => f.callee).sort();
    assert.deepEqual(callees, ['createStub', 'validateVisionReadiness']);
    for (const f of result.findings) assert.equal(f.signature, 's3');
  });

  it('5. CITATION IS NOT INVOCATION — a name without a parenthesis is never flagged', () => {
    const { result } = scanFixture('agents/iron-loop', 'c.md', agent('Read',
      'The gate is `shouldRunLoop` (see `src/lib/refinement-loop.js#shouldRunLoop`).'));
    assert.equal(result.findings.length, 0);
  });

  it('6. LIVE NEGATIVE CONTROL — the real iron-loop-integrator.md yields zero findings', () => {
    const found = scan(ROOT).findings.filter((f) => f.file === 'agents/iron-loop/iron-loop-integrator.md');
    assert.deepEqual(found, [], `integrator must be clean, got ${JSON.stringify(found)}`);
  });

  it('7. a third-person description ("The decomposer will call `fn(…)`") is not flagged', () => {
    const { result } = scanFixture('agents/planning', 'a.md', agent('Read',
      'The decomposer will call `validateVisionReadiness(visionPath)` before it proceeds.'));
    assert.equal(result.findings.length, 0);
  });

  it('8. satisfied-by-tool — `Call `Read(…)`` where the agent holds Read is not flagged', () => {
    // The real vision-advisor holds Read + Write and orders `Read(…)` / `Write(…)`.
    const found = scan(ROOT).findings.filter((f) => f.file === 'agents/planning/vision-advisor.md');
    assert.deepEqual(found, [], `vision-advisor must be clean (Read/Write are its own tools), got ${JSON.stringify(found)}`);
    // Direct: a granted-tool callee is excused.
    const { result } = scanFixture('agents/planning', 'v.md', agent('Read, Write, AskUserQuestion',
      "Call `Read('.ctoc/learnings/vision.md')` and then `Write(path, body)`."));
    assert.equal(result.findings.length, 0);
  });

  it('9. fenced code is never an order, and line numbers after the fence stay correct', () => {
    const body = [
      'Intro line.',
      '```js',
      "call `runThing(x)` here",   // inside a fence — must be ignored
      '```',
      'You then call `afterFence(y)` for real.',   // line 11 of the file
    ].join('\n');
    const { result } = scanFixture('agents/planning', 'p.md', agent('Read', body));
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].callee, 'afterFence');
    // "# Fixture" is line 6; body starts line 8; the afterFence line is body line 5 → file line 12.
    assert.equal(result.findings[0].line, 12);
  });

  it('10. only the FIRST frontmatter block gives the grant (an embedded tools: example is ignored)', () => {
    // Models implementation-planner.md, which carries a second `tools:` line inside an
    // embedded agent-definition example. If the scanner read the embedded `tools: Bash`
    // it would wrongly see the order as executable; reading the FIRST block (Read) fires.
    const body = 'You must call `helperFn(arg)` now.\n\n```yaml\ntools: Bash\n```\n';
    const { result } = scanFixture('agents/planning', 'ip.md', agent('Read', body));
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].callee, 'helperFn');
    // And the real file is clean.
    const realFound = scan(ROOT).findings.filter((f) => f.file === 'agents/planning/implementation-planner.md');
    assert.deepEqual(realFound, []);
  });

  it('11. THE FIVE ARE FIXED — the corrected agent files yield zero findings', () => {
    const found = scan(ROOT).findings.filter((f) => FIVE_CORRECTED.includes(f.file));
    assert.deepEqual(found, [], `the five corrected agents must be clean, got ${JSON.stringify(found)}`);
  });

  it('12. the deleted product-owner init wrapper is gone from the agent corpus (regression guard)', () => {
    // Built dynamically so this file never contains the contiguous token — the
    // sibling actions-dead-exports-guard sweeps src/ and tests/ for that literal, and
    // this test closes the gap it leaves by never scanning agents/.
    const FORBIDDEN = 'initProductOwner' + 'Agent';
    const offenders = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.md') && fs.readFileSync(p, 'utf8').includes(FORBIDDEN)) {
          offenders.push(path.relative(ROOT, p));
        }
      }
    })(path.join(ROOT, 'agents'));
    assert.deepEqual(offenders, []);
  });

  // ── baseline discipline ──────────────────────────────────────────────────
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const liveFindings = scan(ROOT).findings;

  it('13. NO NEW ENTRY — every live finding is in debt or exemptions', () => {
    const known = new Set([
      ...baseline.debt,
      ...baseline.exemptions.map((e) => e.key),
    ]);
    const fresh = liveFindings.filter((f) => !known.has(f.key));
    assert.deepEqual(
      fresh.map((f) => f.key), [],
      fresh.map((f) => `NEW: ${f.message}\n  FIX: ${f.fix}`).join('\n')
    );
  });

  it('14. RATCHET ONLY TIGHTENS — live findings never exceed maxDebt', () => {
    assert.ok(liveFindings.length <= baseline.maxDebt,
      `${liveFindings.length} live findings > maxDebt ${baseline.maxDebt}`);
  });

  it('15. CLAIM YOUR PROGRESS — findings.length === maxDebt exactly', () => {
    assert.equal(liveFindings.length, baseline.maxDebt,
      liveFindings.length < baseline.maxDebt
        ? `you fixed ${baseline.maxDebt - liveFindings.length} — now lower maxDebt to ${liveFindings.length} and remove the fixed keys`
        : 'live findings exceed maxDebt');
  });

  it('16. BASELINE IS HONEST — no dead file, no line number in any key', () => {
    for (const key of baseline.debt) {
      const file = key.split('::')[0];
      assert.ok(fs.existsSync(path.join(ROOT, file)), `debt names a file that no longer exists: ${file}`);
      assert.doesNotMatch(key, /:\d+/, `a baseline key must not contain a line number: ${key}`);
    }
  });

  it('17. EXEMPTIONS ARE JUSTIFIED AND EMPTY', () => {
    assert.deepEqual(baseline.exemptions, []);
    for (const e of baseline.exemptions) {
      assert.ok(typeof e.reason === 'string' && e.reason.length >= 20, `exemption ${e.key} needs a >=20 char reason`);
    }
  });

  it('18. WIRED — the enforcer registers the fence and runs it without throwing', () => {
    const enforcerSrc = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'iron-loop-enforcer.js'), 'utf8');
    assert.match(enforcerSrc, /unexecutable-instruction-fence/, 'CHECKS must register the fence');
    const { checkAllInvariants } = require('../src/lib/iron-loop-enforcer');
    const report = checkAllInvariants({ root: ROOT, mode: 'thorough' });
    const mine = report.findings.find((f) => f.id === 'unexecutable-instruction-fence');
    // Clean tree → the check emits no finding (it is absent from the report) or a
    // non-error verdict. It must never be recorded as an error/throw.
    if (mine) assert.notEqual(mine.severity, 'error', `fence check errored: ${mine.message}`);
  });

  it('19. error path — scan(null) throws TypeError; a missing agents/ dir yields agents:0', () => {
    assert.throws(() => scan(null), TypeError);
    assert.throws(() => scan(''), TypeError);
    const empty = path.join(tmpRoot, 'no-agents');
    fs.mkdirSync(empty, { recursive: true });
    const r = scan(empty);
    assert.equal(r.scanned.agents, 0);
    assert.deepEqual(r.findings, []);
  });
});
