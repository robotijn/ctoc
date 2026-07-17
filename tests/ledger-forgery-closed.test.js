'use strict';

/**
 * R3-A — THE FORGERY TEST.
 *
 * The approval ledger's header claims agent writes to `.ctoc/approvals/` are
 * DENIED. Before this slice that claim was FALSE: the deny lived only in
 * PreToolUse.Edit.js, while PreToolUse.Bash.js never mentioned `.ctoc/approvals`
 * and its ALWAYS_ALLOWED list matched /^\s*node\s+/ FIRST — so
 *
 *     node -e "require('./src/lib/approval-ledger').writeEntry(...)"
 *
 * minted a human-kind approval entry for any plan and forged Gate 2 or Gate 3.
 * A `cat > .ctoc/approvals/x.json` did the same with no node at all.
 *
 * These tests SPAWN THE REAL HOOK PROCESS (never a re-implemented regex) and
 * assert the REAL harness deny signal (`hookSpecificOutput.permissionDecision`
 * === "deny" on stdout, exit 2 — src/lib/hook-deny-signal.js). The counterpart
 * assertion is just as load-bearing: EVERY `node -e` recipe extracted VERBATIM
 * from src/commands/menu.md must still be ALLOWED — a false positive that breaks
 * a menu recipe is a CRITICAL regression, so the recipes are parsed out of the
 * live file rather than copied into the test (they cannot drift apart).
 *
 * State is planted at step 10 with a feature, so the write/commit gates would
 * ALLOW every command here: any deny observed is the ledger guard, nothing else.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Bash.js');
const MENU_MD = path.join(REPO, 'src', 'commands', 'menu.md');
const stateManager = require(path.join(REPO, 'src', 'lib', 'state-manager'));

const ledger = require('../src/lib/approval-ledger');
const gate = require('../src/hooks/human-gate-check.js');
const compliance = require('../src/lib/compliance-regime');
const staleDetector = require('../src/lib/stale-detector');
const backfill = require('../src/scripts/ledger-backfill.js');

// --- hermetic project + signed state ----------------------------------------

let project;

function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-r3a-')));
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# CTOC Project Instructions\n');
  for (const stage of ['vision', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  return dir;
}

function cleanupProject(dir) {
  if (!dir) return;
  try { fs.rmSync(stateManager.getStatePath(dir), { force: true }); } catch { /* none */ }
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Plant valid signed state: step 10, feature set ⇒ write + commit gates allow. */
function setState(step = 10, feature = 'r3a-forgery-test') {
  const state = stateManager.createState(project, feature, 'javascript', null);
  state.currentStep = step;
  stateManager.saveState(project, state);
}

/** Run the REAL hook with `command` on STDIN (the harness's real transport). */
function runHook(command) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: project,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    encoding: 'utf8',
  });
}

/**
 * The deny decision on stdout, or null when the hook ALLOWED the command.
 * The hook writes its human banner to STDERR and ONLY the decision JSON to STDOUT
 * (src/lib/hook-deny-signal.js), so stdout is parsed from its FIRST `{` — an allow
 * is exit-0-silent with no JSON at all.
 */
function denyOf(res) {
  const out = String(res.stdout || '');
  const start = out.indexOf('{');
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(out.slice(start));
    const d = parsed && parsed.hookSpecificOutput;
    return d && d.permissionDecision === 'deny' ? d : null;
  } catch { return null; }
}

const assertDenied = (command, why) => {
  const d = denyOf(runHook(command));
  assert.ok(d, `FORGERY NOT BLOCKED (${why}): ${command}`);
  return d;
};

const assertAllowed = (command, why) => {
  const res = runHook(command);
  const d = denyOf(res);
  assert.equal(d, null,
    `FALSE POSITIVE — legitimate command denied (${why}): ${command}\n  reason: ${d && d.permissionDecisionReason}`);
};

/** Every `node -e "…"` recipe VERBATIM from menu.md (parsed from the live file). */
function menuRecipes() {
  const md = fs.readFileSync(MENU_MD, 'utf8');
  const out = [];
  const re = /`(node\s+-e\s+"[^`]*")`/g;
  let m;
  while ((m = re.exec(md)) !== null) out.push(m[1]);
  return out;
}

beforeEach(() => { project = makeProject(); setState(10); });
afterEach(() => { cleanupProject(project); project = null; });

// =============================================================================
// 1. THE FORGERY — inline evaluation that reaches the ledger
// =============================================================================

describe('R3-A item 1 — Bash parity: the ledger forgery is DENIED', () => {
  const FORGE = `node -e "require('./src/lib/approval-ledger').writeEntry('x',{content_sha256:'a',stage_from:'review',stage_to:'done'},process.cwd())"`;

  test('the exact forging command is denied, and the deny names the sanctioned path', () => {
    const d = assertDenied(FORGE, 'canonical node -e ledger write');
    assert.match(d.permissionDecisionReason, /ledger-backfill/,
      'the deny message must name the sanctioned writer (src/scripts/ledger-backfill.js)');
  });

  test('every inline-eval variant of the forgery is denied', () => {
    const variants = [
      `node --eval "require('./src/lib/approval-ledger').writeEntry('x',{},'.')"`,
      `node -p "require('./src/lib/approval-ledger').writeEntry('x',{},'.')"`,
      `node --print "require('./src/lib/approval-ledger').backfillEntry('.','plans/done/x.md',{stage_to:'done'})"`,
      `node  -e  "require('./src/lib/approval-ledger').writeEntry('x',{},'.')"`,   // double space
      `env node -e "require('./src/lib/approval-ledger').writeEntry('x',{},'.')"`,
      `/usr/bin/node -e "require('./src/lib/approval-ledger').writeEntry('x',{},'.')"`,
      `bash -c "node -e \\"require('./src/lib/approval-ledger').writeEntry('x',{},'.')\\""`,
      `echo "require('./src/lib/approval-ledger').writeEntry('x',{},'.')" | node`,
      `node <<'EOF'\nrequire('./src/lib/approval-ledger').writeEntry('x',{},'.')\nEOF`,
      `cd /tmp && node -e "require('./src/lib/approval-ledger').writeEntry('x',{},'.')"`,
      `node -e 'require("./src/lib/approval-ledger").writeEntry("x",{},".")'`,       // single-quoted
      `node -e "require('./src/lib/approval-ledger.js').writeEntry('x',{},'.')"`,    // .js suffix
      `node -e "require('${'$'}{PWD}/src/lib/approval-ledger').writeEntry('x',{},'.')"`,
    ];
    for (const v of variants) assertDenied(v, 'inline-eval forgery variant');
  });

  test('inline eval that writes the ledger directory directly is denied', () => {
    assertDenied(
      `node -e "require('fs').writeFileSync('.ctoc/approvals/x.json','{}')"`,
      'inline eval writing the ledger path with fs',
    );
  });

  test('inline eval that crosses a gate through actions is denied', () => {
    assertDenied(
      `node -e "require('./src/lib/actions').approvePlan('todo/x.md', process.cwd())"`,
      'node -e approvePlan forges the gate crossing itself',
    );
    assertDenied(
      `node -e "require('./src/lib/actions').approveSubplans('p','review')"`,
      'node -e approveSubplans batch-crosses Gate 3',
    );
  });

  test('inline eval that cannot be statically cleared is denied (obfuscation)', () => {
    const opaque = [
      `node -e "$(cat /tmp/payload.js)"`,                         // command substitution
      'node -e "`cat /tmp/payload.js`"',                          // backtick substitution
      `node -e "require('./src/lib/approval-' + 'ledger').writeEntry('x',{},'.')"`, // split token
      `echo cmVxdWlyZQ== | base64 -d | node`,                     // base64 into node
      `echo cmVxdWlyZQ== | base64 --decode | bash`,               // base64 into bash
    ];
    for (const c of opaque) assertDenied(c, 'unstatically-clearable inline eval');
  });
});

// =============================================================================
// 2. Raw file writes to the ledger directory
// =============================================================================

describe('R3-A item 1 — raw writes to .ctoc/approvals are DENIED', () => {
  test('redirect / tee / cp / mv / sed / python forgeries are denied', () => {
    const writes = [
      `cat > .ctoc/approvals/x.json`,
      `echo '{"approved_by":"human"}' > .ctoc/approvals/x.json`,
      `echo '{}' >> .ctoc/approvals/x.json`,
      `echo '{}' | tee .ctoc/approvals/x.json`,
      `cp /tmp/forged.json .ctoc/approvals/x.json`,
      `mv /tmp/forged.json .ctoc/approvals/x.json`,
      `sed -i s/a/b/ .ctoc/approvals/x.json`,
      `python3 -c "open('.ctoc/approvals/x.json','w').write('{}')"`,
      `touch .ctoc/approvals/x.json`,
      `rm .ctoc/approvals/x.json`,
      `printf '{}' > "./.ctoc/approvals/x.json"`,                 // quoted + ./ prefix
      `echo '{}' > .ctoc"/"approvals/x.json`,                     // quote-split path
      `install -m 644 /tmp/f.json .ctoc/approvals/x.json`,
      `mkdir -p .ctoc/approvals && cp /tmp/f.json .ctoc/approvals/`,
    ];
    for (const w of writes) assertDenied(w, 'raw ledger write');
  });

  test('read-only inspection of the ledger stays ALLOWED', () => {
    fs.writeFileSync(path.join(project, '.ctoc', 'approvals', 'x.json'), '{}');
    assertAllowed('cat .ctoc/approvals/x.json', 'reading a ledger entry is not forgery');
    assertAllowed('ls .ctoc/approvals', 'listing the ledger is not forgery');
    assertAllowed('grep -rn stage_to .ctoc/approvals', 'grepping the ledger is not forgery');
  });

  // Re-attack: the literal-path deny above is bypassed by splitting `.ctoc/` and
  // `approvals` across a `cd`, since cp/mv are not write-patterns and the adjacency
  // regex no longer matches. These MUST be denied identically to their literal form.
  test('cd-boundary ledger writes (path split across a cd) are DENIED', () => {
    const bypasses = [
      `cd .ctoc && cp /tmp/forged.json approvals/x.json`,
      `cd .ctoc && mv /tmp/forged.json approvals/x.json`,
      `cd .ctoc/approvals && cp /tmp/forged.json x.json`,
      `cd .ctoc/approvals && mv /tmp/forged.json x.json`,
      `cd .ctoc && echo '{}' > approvals/x.json`,
      `cd .ctoc && echo '{}' | tee approvals/x.json`,
      `cd .ctoc && touch approvals/x.json`,
      `cd '.ctoc' && cp /tmp/forged.json approvals/x.json`,   // quoted cd target
      `pushd .ctoc && cp /tmp/forged.json approvals/x.json`,  // pushd, not cd
      // Re-attack: a `~`/`~user` home prefix must NOT discard the ledger suffix —
      // strip only the tilde+user+slash, keep the remainder as a rooted prefix.
      `cd ~/Code/ctoc/.ctoc/approvals && tee evil.json`,
      `cd ~/.ctoc/approvals && cp /tmp/forged.json evil.json`,
      `cd ~user/x/.ctoc/approvals && cp f evil.json`,
    ];
    for (const w of bypasses) assertDenied(w, 'cd-boundary ledger write');
  });

  test('cd-boundary READS and unrelated cd writes stay ALLOWED (no false positives)', () => {
    fs.writeFileSync(path.join(project, '.ctoc', 'approvals', 'x.json'), '{}');
    assertAllowed('cd .ctoc && cat approvals/x.json', 'reading via cd is not forgery');
    assertAllowed('cd .ctoc/approvals && ls', 'listing via cd is not forgery');
    assertAllowed('cd src && cp a.js b.js', 'unrelated cd + copy is not a ledger write');
    assertAllowed('cd .ctoc && cp a.json approvals-summary/x.json', 'approvals-summary is not the ledger dir');
  });

  // Re-attack fix: the ADJACENCY check must be path-BOUNDED — a sibling under
  // `.ctoc/` whose name merely starts with "approvals" is NOT the ledger directory
  // and must not be false-blocked. (The unbounded `.ctoc/+approvals` regex denied
  // these; the bounded LEDGER_SEGMENT_RE requires a whole path component.)
  test('sibling .ctoc/approvals* paths (not the ledger dir) stay ALLOWED', () => {
    assertAllowed('cp /tmp/f.json .ctoc/approvals-summary/report.json', 'approvals-summary/ is a different dir');
    assertAllowed('mv /tmp/f.json .ctoc/approvals-archive.json', 'approvals-archive.json is a different file');
    assertAllowed('cp /tmp/f.json .ctoc/approvalsdata.txt', 'approvalsdata.txt is a different file');
    assertAllowed('cat .ctoc/approvals-summary/report.json', 'reading a sibling is fine');
    // ...while the real ledger directory is still DENIED (guard intact):
    assertDenied('cp /tmp/f.json .ctoc/approvals/x.json', 'the real ledger dir');
  });

  // Re-attack: `cd` accepts OPTIONS (-L, -P, -e, -@, combined -LP) and a `--`
  // end-of-options marker BEFORE the directory operand. The old matcher captured
  // the FIRST token after `cd` as the directory, so `cd -- .ctoc/approvals` set
  // the prefix to the literal `--` (and `cd -L …` to `-L`), the following write
  // resolved under `--/…` / `-L/…`, never matched the ledger, and the forgery was
  // ALLOWED. The cd branch also `continue`s before the adjacency check runs, so the
  // literal `.ctoc/approvals` on the cd line itself was skipped too. All of these
  // MUST be denied identically to `cd .ctoc/approvals && <write>`.
  test('cd OPTION / -- bypasses (options before the dir operand) are DENIED', () => {
    const bypasses = [
      `cd -- .ctoc/approvals && tee evil.json`,       // `--` end-of-options marker
      `cd -- .ctoc/approvals && cp /tmp/forged.json x.json`,
      `cd -L .ctoc/approvals && cp x y`,              // -L logical option
      `cd -P .ctoc/approvals && tee z`,               // -P physical option
      `cd -e .ctoc/approvals && touch x.json`,        // -e option
      `cd -@ .ctoc/approvals && cp f x.json`,         // -@ option (extended attrs)
      `cd -LP .ctoc/approvals && tee z`,              // combined short cluster
      `cd -P -- .ctoc/approvals && cp f x.json`,      // option THEN `--` THEN dir
      `pushd -- .ctoc/approvals && cp /tmp/f.json x.json`, // pushd + `--`
    ];
    for (const w of bypasses) assertDenied(w, 'cd option/-- bypass');
  });

  // After `--`, the NEXT token is the directory even if it starts with `-`: `cd -- -`
  // means a directory literally named `-`, NOT the previous-directory shortcut. So
  // stepping into `.ctoc/approvals` then `cd -- -` lands in `.ctoc/approvals/-`, still
  // inside the ledger — a following write there MUST be denied (proves `-` after `--`
  // is a literal subdir, does not reset the prefix, and does not crash).
  test('cd -- - is a LITERAL dir (not previous-dir); write under it stays DENIED', () => {
    assertDenied('cd .ctoc/approvals && cd -- - && tee evil.json',
      '`cd -- -` is a literal subdir of the ledger, not a reset');
    // And it must not crash on its own with a harmless read.
    assertAllowed('cd -- - && ls', '`cd -- -` alone with a read does not crash / is not a write');
  });

  // Re-attack (adjacent hole left by the option-skip wave): the `tok === '--'`
  // separator check and the option regex ran on the RAW token, BEFORE quote-
  // stripping. So a QUOTED `"--"` / `'--'` was NOT `=== '--'`, was taken as the
  // directory LITERAL (`--`), and the real `.ctoc/approvals` operand was discarded
  // — yet real bash HONORS a quoted `--` as the end-of-options separator and cds
  // into the ledger (`cd "--" .ctoc/approvals && pwd` → …/.ctoc/approvals). Same
  // for quoted options `"-L"`/`"-P"`. These MUST be denied identically to their
  // unquoted forms. Dequote each token FIRST, then apply the option/`--` logic.
  test('QUOTED `--` / quoted-option cd bypasses are DENIED (dequote-first)', () => {
    const bypasses = [
      `cd "--" .ctoc/approvals && tee evil.json`,        // quoted end-of-options marker
      `cd '--' .ctoc/approvals && cp x y`,               // single-quoted `--`
      `cd '--' .ctoc/approvals && cp /tmp/forged.json x.json`,
      `cd "-L" .ctoc/approvals && tee z`,                // quoted -L option
      `cd '-P' .ctoc/approvals && cp x y`,               // single-quoted -P option
      `cd "-P" -- .ctoc/approvals && cp a b`,            // quoted option THEN `--` THEN dir
      `pushd "--" .ctoc/approvals && cp /tmp/f.json x.json`, // pushd + quoted `--`
    ];
    for (const w of bypasses) assertDenied(w, 'quoted cd option/-- bypass');
  });

  // Re-attack (empty-operand hole): after dequoting, `cd ""` / `cd ''` / `cd -- ""`
  // yield an EMPTY dir string. The old code treated an empty dir like a bare `cd -`
  // and RESET the accumulated prefix to root — but in real bash `cd ""` is a NO-OP:
  // it stays in the current directory and returns exit 0, so the `&&` chain
  // continues from the SAME cwd. So `cd .ctoc/approvals && cd "" && tee evil.json`
  // actually writes to `.ctoc/approvals/evil.json` while the hook — having reset the
  // prefix — resolved it to root and ALLOWED it. An empty operand must LEAVE the
  // prefix UNCHANGED so the ledger prefix persists and the following write is DENIED.
  test('empty-operand cd ("" / \'\' / -- "") is a NO-OP; write after it stays DENIED', () => {
    const bypasses = [
      `cd .ctoc/approvals && cd "" && tee evil.json`,          // double-quoted empty operand
      `cd .ctoc/approvals && cd '' && cp x y`,                 // single-quoted empty operand
      `cd .ctoc/approvals && cd -- "" && echo x > evil.json`,  // `--` then empty operand
    ];
    for (const w of bypasses) assertDenied(w, 'empty-operand cd no-op bypass');
  });

  // Regression net — every one of these MUST keep its pre-fix outcome.
  test('cd option-skip fix preserves all existing cd outcomes (regression)', () => {
    fs.writeFileSync(path.join(project, '.ctoc', 'approvals', 'x.json'), '{}');
    // Plain (no options) ledger writes still DENIED.
    assertDenied('cd .ctoc/approvals && tee evil.json', 'plain cd into ledger + tee');
    // Reads via a plain cd still ALLOWED.
    assertAllowed('cd .ctoc/approvals && ls', 'plain cd + ls is a read');
    assertAllowed('cd .ctoc/approvals && cat x.json', 'plain cd + cat is a read');
    // Reads via an OPTION cd still ALLOWED (option-skip must not turn a read into a deny).
    assertAllowed('cd -- .ctoc/approvals && ls', '`cd --` + ls is still just a read');
    assertAllowed('cd -P .ctoc/approvals && cat x.json', '`cd -P` + cat is still just a read');
    // Bare `-` WITHOUT `--` is the previous-dir shortcut → prefix reset → ALLOWED.
    assertAllowed('cd .ctoc/approvals && cd - && tee evil.json',
      'bare `cd -` resets to the previous dir (out of the ledger)');
    // Absolute path into the ledger still DENIED.
    assertDenied('cd /abs/.ctoc/approvals && cp f evil.json', 'absolute cd into ledger + cp');
    // A normal, non-ledger cd + build command still ALLOWED.
    assertAllowed('cd src && node build.js', 'ordinary cd + node build is not a ledger write');
  });
});

// =============================================================================
// 3. NO COLLATERAL DAMAGE — every real menu.md recipe still works
// =============================================================================

describe('R3-A item 1 — no false positives (menu.md recipes must survive)', () => {
  test('menu.md contains node -e recipes to check (the guard-rail is real)', () => {
    assert.ok(menuRecipes().length >= 5,
      'expected the menu.md node -e recipes to be parsed; a zero count would make this suite vacuous');
  });

  test('EVERY node -e recipe in menu.md is ALLOWED, verbatim', () => {
    for (const recipe of menuRecipes()) assertAllowed(recipe, 'menu.md recipe');
  });

  test('the sanctioned backfill script is ALLOWED', () => {
    assertAllowed('node src/scripts/ledger-backfill.js --vision', 'sanctioned ledger writer');
    assertAllowed('node "${CLAUDE_PLUGIN_ROOT}/src/scripts/ledger-backfill.js" --plan plans/done/x.md --stage done --reason legacy',
      'sanctioned ledger writer, plugin-root form');
  });

  test('ordinary development commands are ALLOWED', () => {
    assertAllowed('node --test tests/approval-ledger.test.js', 'a test file named after the ledger is not a forgery');
    assertAllowed('node src/commands/menu.js', 'the menu itself');
    assertAllowed('npm test', 'npm');
    assertAllowed('git status', 'git status');
  });
});

// =============================================================================
// 4. item 3 — the vision exemption is GONE; done/ residency is ledger-driven
// =============================================================================

describe('R3-A item 3 — vision exemption killed', () => {
  const visionPlan = (slug) => {
    const p = path.join(project, 'plans', 'done', `${slug}.md`);
    fs.writeFileSync(p, `---\ntype: vision\nstatus: decomposed\n---\n\n# ${slug}\n`);
    return p;
  };

  test('a type: vision plan squatting in done/ with NO ledger entry is FLAGGED', () => {
    visionPlan('squatted-vision');
    const flagged = gate.checkFolder('done', project).map(v => v.file);
    assert.ok(flagged.includes('squatted-vision.md'),
      'the vision exemption let any agent squat done/ with one frontmatter line — it must be gone');
  });

  test('the isVisionExempt escape hatch no longer exists on the module', () => {
    assert.equal(typeof gate.isVisionExempt, 'undefined',
      'isVisionExempt must be removed from the acceptance path entirely');
  });

  test('a decomposed vision WITH a pipeline entry is ACCEPTED', () => {
    const p = visionPlan('ledgered-vision');
    ledger.writeVisionArchiveEntry(project, p);
    const flagged = gate.checkFolder('done', project).map(v => v.file);
    assert.ok(!flagged.includes('ledgered-vision.md'),
      'a vision archive vouched for by a pipeline-kind ledger entry occupies done/ legitimately');
  });

  test('the vision archive entry is pipeline-kind and carries vision-decomposed evidence', () => {
    const p = visionPlan('evidence-vision');
    const entry = ledger.writeVisionArchiveEntry(project, p);
    assert.equal(entry.advanced_by, 'pipeline');
    assert.equal(entry.evidence, 'vision-decomposed');
    assert.equal(entry.stage_from, 'vision');
    assert.equal(entry.stage_to, 'done');
    assert.equal(ledger.entryKind(entry), 'pipeline');
  });

  test('an EDITED vision archive is flagged again (invalidate-on-edit still holds)', () => {
    const p = visionPlan('edited-vision');
    ledger.writeVisionArchiveEntry(project, p);
    fs.appendFileSync(p, '\nforged extra line\n');
    const flagged = gate.checkFolder('done', project).map(v => v.file);
    assert.ok(flagged.includes('edited-vision.md'), 'done/ stays hash-sensitive for vision archives too');
  });
});

// =============================================================================
// 5. item 2 — the sanctioned backfill script (argv-driven, no eval)
// =============================================================================

describe('R3-A item 2 — ledger-backfill.js', () => {
  test('--vision ledgers every un-ledgered decomposed vision archive in done/', () => {
    fs.writeFileSync(path.join(project, 'plans', 'done', 'v1.md'), '---\ntype: vision\nstatus: decomposed\n---\n\nbody\n');
    fs.writeFileSync(path.join(project, 'plans', 'done', 'v2.md'), '---\ntype: vision\n---\n\nbody\n');
    fs.writeFileSync(path.join(project, 'plans', 'done', 'code.md'), '---\ntype: implementation\n---\n\nbody\n');

    const res = backfill.run(['--vision', '--root', project]);
    assert.equal(res.ok, true);
    assert.deepEqual(res.ledgered.sort(), ['v1', 'v2'], 'only type: vision archives are ledgered');

    assert.equal(ledger.entryKind(ledger.readEntry('v1', project)), 'pipeline');
    assert.equal(ledger.readEntry('code', project), null, 'a code plan is never auto-ledgered');

    const flagged = gate.checkFolder('done', project).map(v => v.file);
    assert.ok(!flagged.includes('v1.md') && !flagged.includes('v2.md'), 'the migrated archives are accepted');
    assert.ok(flagged.includes('code.md'), 'a bare code plan in done/ is still a violation');
  });

  test('--vision is idempotent (a re-run does not clobber or throw)', () => {
    fs.writeFileSync(path.join(project, 'plans', 'done', 'v1.md'), '---\ntype: vision\n---\n\nbody\n');
    backfill.run(['--vision', '--root', project]);
    const first = ledger.readEntry('v1', project);
    const res = backfill.run(['--vision', '--root', project]);
    assert.equal(res.ok, true);
    assert.deepEqual(res.ledgered, [], 'an already-ledgered archive is skipped');
    assert.deepEqual(ledger.readEntry('v1', project), first, 'the existing entry is untouched');
  });

  test('--plan/--stage backfills one legacy plan as a human-kind BACKFILLED entry', () => {
    const p = path.join(project, 'plans', 'done', 'legacy.md');
    fs.writeFileSync(p, '---\ntype: implementation\n---\n\nbody\n');
    const res = backfill.run(['--plan', p, '--stage', 'done', '--reason', '2026-07-14 legacy migration', '--root', project]);
    assert.equal(res.ok, true);
    const entry = ledger.readEntry('legacy', project);
    assert.equal(entry.backfilled, true);
    assert.equal(entry.backfill_reason, '2026-07-14 legacy migration');
    assert.ok(!gate.checkFolder('done', project).map(v => v.file).includes('legacy.md'));
  });

  test('bad argv fails LOUDLY (never a silent no-op)', () => {
    const res = backfill.run(['--plan', path.join(project, 'plans', 'done', 'nope.md'), '--stage', 'done', '--root', project]);
    assert.equal(res.ok, false);
    assert.match(res.error, /nope\.md|ENOENT|not found/i);

    const noMode = backfill.run(['--root', project]);
    assert.equal(noMode.ok, false, 'no mode selected must be an error, not a silent success');
  });

  test('the script contains NO eval surface', () => {
    const src = fs.readFileSync(path.join(REPO, 'src', 'scripts', 'ledger-backfill.js'), 'utf8');
    assert.ok(!/\beval\s*\(|new Function\s*\(/.test(src), 'the sanctioned writer must be argv-driven, never eval-driven');
  });

  test('menu.md references the script (instruction-surface reachability root)', () => {
    const md = fs.readFileSync(MENU_MD, 'utf8');
    assert.match(md, /src\/scripts\/ledger-backfill\.js/, 'the sanctioned writer must be reachable from the menu');
  });
});

// =============================================================================
// 6. item 5 — backfilled ≠ human at the gate (honest classification)
// =============================================================================

describe('R3-A item 5 — the backfilled kind is honest', () => {
  test('entryKind reports backfilled, pipeline, human distinctly', () => {
    assert.equal(ledger.entryKind({ approved_by: 'human' }), 'human');
    assert.equal(ledger.entryKind({ approved_by: 'human', backfilled: true }), 'backfilled');
    assert.equal(ledger.entryKind({ advanced_by: 'pipeline', evidence: 'x' }), 'pipeline');
    assert.equal(ledger.entryKind(null), null);
  });

  test('classifyResidency accepts a backfilled entry but REPORTS its real kind', () => {
    const p = path.join(project, 'plans', 'done', 'migrated.md');
    fs.writeFileSync(p, '---\ntype: implementation\n---\n\nbody\n');
    ledger.backfillEntry(project, p, { stage_to: 'done', reason: 'legacy' });

    const verdict = gate.classifyResidency(p, 'done', project);
    assert.equal(verdict.accepted, true, 'the human ordered the migration — acceptance is not weakened');
    assert.equal(verdict.kind, 'backfilled', 'but an audit can tell a migrated entry from a live human approval');
  });

  test('a live human approval classifies as human, not backfilled', () => {
    const p = path.join(project, 'plans', 'todo', 'live.md');
    const content = '---\ntype: implementation\n---\n\nbody\n';
    fs.writeFileSync(p, content);
    ledger.writeEntry('live', {
      content_sha256: ledger.computeContentHash(content),
      stage_from: 'implementation',
      stage_to: 'todo',
    }, project);
    const verdict = gate.classifyResidency(p, 'todo', project);
    assert.equal(verdict.accepted, true);
    assert.equal(verdict.kind, 'human');
  });
});

// =============================================================================
// 7. item 4 (partial) — the case-collision guard fires on the write path
// =============================================================================

describe('R3-A item 4 — case-collision guard', () => {
  test('two case-differing plans collide on the canonical key and the write THROWS', () => {
    const a = path.join(project, 'plans', 'done', 'Collide-Me.md');
    const b = path.join(project, 'plans', 'done', 'collide-me.md');
    fs.writeFileSync(a, 'a\n');
    ledger.backfillEntry(project, a, { stage_to: 'done', reason: 'legacy' });
    fs.writeFileSync(b, 'b\n');
    assert.throws(() => ledger.backfillEntry(project, b, { stage_to: 'done', reason: 'legacy' }),
      /slug collision/i, 'a silent overwrite would erase one plan’s provenance');
  });

  test('a pipeline entry carrying plan_basename is collision-guarded too', () => {
    ledger.writePipelineEntry('dup', {
      content_sha256: 'a'.repeat(64), stage_from: 'vision', stage_to: 'done',
      evidence: 'vision-decomposed', plan_basename: 'Dup',
    }, project);
    assert.throws(() => ledger.writePipelineEntry('dup', {
      content_sha256: 'b'.repeat(64), stage_from: 'vision', stage_to: 'done',
      evidence: 'vision-decomposed', plan_basename: 'dup',
    }, project), /slug collision/i);
  });
});

// =============================================================================
// 8. item 6 — compliance charset gate + scoped declined regex
// =============================================================================

describe('R3-A item 6 — compliance profile hardening', () => {
  const SETTINGS = `general:\n  environment: dev\nenforcement:\n  mode: strict\nregulatory_regime:\n  active_profiles: []\noperations:\n  x: 1\n`;
  const settingsPath = () => path.join(project, '.ctoc', 'settings.yaml');

  test('a profile name outside the closed charset is REFUSED and nothing is written', () => {
    fs.writeFileSync(settingsPath(), SETTINGS);
    const before = fs.readFileSync(settingsPath(), 'utf8');

    const res = compliance.writeActiveProfiles(project, ['x]\nenforcement:\n  mode: off']);
    assert.equal(res.ok, false, 'a YAML-injecting profile name must be refused');
    assert.ok(res.error, 'the refusal names the offending value');
    assert.equal(fs.readFileSync(settingsPath(), 'utf8'), before,
      'settings.yaml must be byte-identical on disk — the injection never lands');
  });

  test('other invalid charsets are refused; the real profiles still write', () => {
    fs.writeFileSync(settingsPath(), SETTINGS);
    for (const bad of ['GDPR', 'gdpr profile', '-leading', 'a_b', '../x', 'a,b']) {
      assert.equal(compliance.writeActiveProfiles(project, [bad]).ok, false, `must refuse ${JSON.stringify(bad)}`);
    }
    const ok = compliance.writeActiveProfiles(project, ['gdpr', 'eu-ai-act-high-risk']);
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.profiles, ['gdpr', 'eu-ai-act-high-risk']);
  });

  test('declineComplianceRegime scopes its declined: regex to the regulatory_regime block', () => {
    // NOTE the trailing `enforcement:` block: the reader of record
    // (src/lib/regulatory-regime.js:177) anchors its non-greedy block body on a
    // FOLLOWING top-level key, so a settings.yaml whose regulatory_regime block is
    // LAST cannot be parsed by it at all. That is a pre-existing limitation of a
    // file outside this slice's scope (reported, not silently worked around); the
    // fixture mirrors a real settings.yaml, where other blocks always follow.
    const withOtherDeclined = `operations:\n  declined: false\nregulatory_regime:\n  active_profiles: []\nenforcement:\n  mode: strict\n`;
    fs.writeFileSync(settingsPath(), withOtherDeclined);

    const res = compliance.declineComplianceRegime(project);
    assert.equal(res.ok, true, 'the decline must persist');

    const after = fs.readFileSync(settingsPath(), 'utf8');
    assert.match(after, /operations:\n {2}declined: false/, 'an unrelated declined: line in another block is UNTOUCHED');
    assert.match(after, /regulatory_regime:\n(?:.*\n)*?\s*declined: true/, 'the marker lands inside regulatory_regime');
  });

  test('an existing declined marker inside the block is set true (idempotent)', () => {
    fs.writeFileSync(settingsPath(), `regulatory_regime:\n  declined: false\n  active_profiles: []\noperations:\n  x: 1\n`);
    assert.equal(compliance.declineComplianceRegime(project).ok, true);
    assert.equal(compliance.declineComplianceRegime(project).ok, true, 'idempotent');
  });
});

// =============================================================================
// 9. item 7 — store hardening: the dismissal read is size-gated
// =============================================================================

describe('R3-A item 7 — oversized dismissal store fails open', () => {
  test('an oversized store is skipped: no crash, no filtering, the scan still returns candidates', () => {
    const storePath = path.join(project, '.ctoc', 'state', 'stale-dismissals.json');
    // > 1 MiB of valid JSON: a size gate must refuse to read it into memory.
    const dismissed = {};
    for (let i = 0; i < 60000; i++) dismissed[`review/plan-${i}.md`] = 1234567890123;
    fs.writeFileSync(storePath, JSON.stringify({ dismissed }));
    assert.ok(fs.statSync(storePath).size > (1 << 20), 'the fixture must actually be oversized');

    const old = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const p = path.join(project, 'plans', 'review', 'ancient.md');
    fs.writeFileSync(p, '---\ntype: implementation\n---\n\nbody\n');
    fs.utimesSync(p, old, old);

    let out;
    assert.doesNotThrow(() => { out = staleDetector.scanCheapCandidates(project); },
      'an oversized store must never crash the scan');
    assert.ok(Array.isArray(out.candidates), 'the scan still returns candidates (fail-open = keep nagging)');
  });
});

// =============================================================================
// 10. X5 — provenance is a POSITIVE claim, never a fallthrough
//
// `entryKind` classified ANY unrecognised provenance as 'human', and
// `classifyResidency` guarded ONLY 'pipeline' — so an entry carrying
// `advanced_by: 'sufficiency-gate'` was classified as the human, skipped the
// guard, and was ACCEPTED at every gate including `todo`, with no evidence.
// That is the mechanism behind the 26 forged approvals removed from this repo.
// =============================================================================

describe('X5 — an unrecognised provenance is NOT the human', () => {
  // --- Case 1: the bug, at the classifier ------------------------------------
  test('case 1: an entry with an unrecognised advanced_by is NOT classified as human', () => {
    const kind = ledger.entryKind({ advanced_by: 'sufficiency-gate', stage_to: 'todo' });
    assert.notEqual(kind, 'human',
      'an unrecognised advanced_by is the ABSENCE of human evidence, never the human');
    assert.equal(kind, 'unknown',
      'it must classify as unknown — a new provenance is added deliberately, in the open, with its own guard');
  });

  // --- Case 2: the bug that matters, at the gate ------------------------------
  test('case 2: an unrecognised provenance is REJECTED by the gate hook at every gate', () => {
    for (const folder of ['todo', 'review', 'done']) {
      const p = path.join(project, 'plans', folder, `sufficiency-${folder}.md`);
      const content = `---\ntype: implementation\n---\n\nbody ${folder}\n`;
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
      // Plant the entry directly: this is the shape a not-yet-recognised writer
      // would mint. It carries a real hash and the right edge, so ONLY the
      // provenance classification can reject it.
      fs.writeFileSync(
        path.join(project, '.ctoc', 'approvals', `sufficiency-${folder}.json`),
        JSON.stringify({
          content_sha256: ledger.computeContentHash(content),
          stage_from: 'implementation',
          stage_to: folder,
          approved_at: new Date().toISOString(),
          advanced_by: 'sufficiency-gate',
        }, null, 2),
      );

      const verdict = gate.classifyResidency(p, folder, project);
      assert.equal(verdict.accepted, false,
        `an unrecognised provenance must NEVER be accepted — it was waved through at ${folder}/`);
      assert.equal(verdict.reason, 'unknown-provenance', `wrong reason at ${folder}/`);
      assert.equal(verdict.kind, 'unknown', `wrong kind at ${folder}/`);
    }
  });

  // --- Case 3: the forgery shape — Decision 3, the whole fix ------------------
  test('case 3: an entry carrying BOTH advanced_by and approved_by:human is unknown, not human', () => {
    // A machine cross wearing the human's marker. `advanced_by` MUST be checked
    // BEFORE `approved_by`; check `approved_by` first and this is accepted.
    assert.equal(
      ledger.entryKind({ advanced_by: 'sufficiency-gate', approved_by: 'human' }),
      'unknown',
      'advanced_by must be checked FIRST — this ordering is the whole fix',
    );

    const p = path.join(project, 'plans', 'todo', 'wearing-the-marker.md');
    const content = '---\ntype: implementation\n---\n\nbody\n';
    fs.writeFileSync(p, content);
    fs.writeFileSync(
      path.join(project, '.ctoc', 'approvals', 'wearing-the-marker.json'),
      JSON.stringify({
        content_sha256: ledger.computeContentHash(content),
        stage_from: 'implementation',
        stage_to: 'todo',
        approved_by: 'human',
        advanced_by: 'sufficiency-gate',
      }, null, 2),
    );
    const verdict = gate.classifyResidency(p, 'todo', project);
    assert.equal(verdict.accepted, false, 'the forgery shape must be rejected at the gate');
    assert.equal(verdict.kind, 'unknown');
  });

  // --- Case 4: the proof that NO migration is needed --------------------------
  test('case 4: all real ledger entries in this repo keep their current classification', () => {
    const realDir = path.join(REPO, '.ctoc', 'approvals');
    const files = fs.readdirSync(realDir).filter(f => f.endsWith('.json'));
    // Non-vacuous: an empty or truncated directory must NOT pass this test.
    assert.ok(files.length > 200,
      `the real ledger must be present and populated (found ${files.length})`);

    const tally = {};
    for (const f of files) {
      let entry;
      assert.doesNotThrow(() => { entry = JSON.parse(fs.readFileSync(path.join(realDir, f), 'utf8')); },
        `real ledger entry ${f} must parse`);
      const kind = ledger.entryKind(entry);
      tally[kind] = (tally[kind] || 0) + 1;
    }

    assert.equal(tally.unknown, undefined,
      `NO real entry may become unknown — every existing entry already carries its own ` +
      `evidence, so the honest classifier reclassifies nothing (got ${JSON.stringify(tally)})`);
    assert.ok(tally.backfilled > 200, `backfilled count moved: ${JSON.stringify(tally)}`);
    assert.ok(tally.human > 40, `human count moved: ${JSON.stringify(tally)}`);
    assert.equal(tally.backfilled + (tally.human || 0) + (tally.pipeline || 0), files.length,
      'every real entry must classify into a recognised kind');
  });

  // --- Case 5: the no-false-red guard ----------------------------------------
  test('case 5: a real human entry is still accepted', () => {
    const p = path.join(project, 'plans', 'todo', 'genuine.md');
    const content = '---\ntype: implementation\n---\n\nbody\n';
    fs.writeFileSync(p, content);
    ledger.writeEntry('genuine', {
      content_sha256: ledger.computeContentHash(content),
      stage_from: 'implementation',
      stage_to: 'todo',
      approved_by: 'human',
    }, project);
    const verdict = gate.classifyResidency(p, 'todo', project);
    assert.equal(verdict.accepted, true, 'a genuine human crossing must never be flagged');
    assert.equal(verdict.kind, 'human');
    assert.equal(verdict.reason, null);
  });

  // --- Case 6: pipeline keeps its existing guards ----------------------------
  test('case 6: pipeline provenance still obeys its existing guards', () => {
    const mk = (slug, folder, evidence) => {
      const p = path.join(project, 'plans', folder, `${slug}.md`);
      const content = `---\ntype: implementation\n---\n\n${slug}\n`;
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
      fs.writeFileSync(path.join(project, '.ctoc', 'approvals', `${slug}.json`),
        JSON.stringify({
          content_sha256: ledger.computeContentHash(content),
          stage_from: folder === 'done' ? 'review' : 'implementation',
          stage_to: folder,
          advanced_by: 'pipeline',
          ...(evidence !== undefined ? { evidence } : {}),
        }, null, 2));
      return p;
    };

    const okDone = gate.classifyResidency(mk('pipe-done', 'done', 'stale-reconciliation'), 'done', project);
    assert.equal(okDone.accepted, true, 'pipeline + evidence at done/ stays accepted');
    assert.equal(okDone.kind, 'pipeline');

    const atTodo = gate.classifyResidency(mk('pipe-todo', 'todo', 'stale-reconciliation'), 'todo', project);
    assert.equal(atTodo.accepted, false, 'todo/ stays human-only');
    assert.equal(atTodo.reason, 'pipeline-not-allowed');
    assert.equal(atTodo.kind, 'pipeline');

    const noEv = gate.classifyResidency(mk('pipe-noev', 'done', undefined), 'done', project);
    assert.equal(noEv.accepted, false, 'pipeline without evidence stays rejected');
    assert.equal(noEv.reason, 'pipeline-no-evidence');
    assert.equal(noEv.kind, 'pipeline');
  });

  // --- Case 7: Decision 1's guard — the 210 must not move --------------------
  test('case 7: backfilled entries are still accepted at every gate', () => {
    for (const folder of ['todo', 'done']) {
      const p = path.join(project, 'plans', folder, `migrated-${folder}.md`);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, `---\ntype: implementation\n---\n\nmigrated ${folder}\n`);
      ledger.backfillEntry(project, p, { stage_to: folder, reason: 'legacy' });

      const verdict = gate.classifyResidency(p, folder, project);
      assert.equal(verdict.accepted, true,
        `the human ordered the migration — a backfilled entry must stay accepted at ${folder}/`);
      assert.equal(verdict.kind, 'backfilled', 'and it is still reported honestly as backfilled');
    }
  });
});

// =============================================================================
// 11. X6 — THE SUFFICIENCY KIND crosses the PRE-BUILD gates by itself.
//
// A sufficiency entry (advanced_by:'sufficiency' + evidence) is the machine
// recording that a plan had ENOUGH INFORMATION to be built without guessing.
// The gate hook accepts it ONLY at the PRE-BUILD gate destinations (derived
// from the code: implementation, todo) and ONLY with evidence — and REJECTS it
// at done/, where the question is "was this built correctly?", answered by
// review and the 14 quality dimensions, not by an answered-question log.
//
// The pre-build gate names are read from gate-order, not hardcoded here — the
// same derivation the hook itself uses.
// =============================================================================

describe('X6 — a sufficiency entry crosses the pre-build gates, never done/', () => {
  const gateOrder = require(path.join(REPO, 'src', 'lib', 'gate-order.js'));
  const buildStart = gateOrder.STAGE_ORDER.indexOf('in-progress');
  const PRE_BUILD = gateOrder.GATE_DESTINATIONS.filter(
    d => gateOrder.STAGE_ORDER.indexOf(d) < buildStart);

  // --- Case 5: accepted at every pre-build gate, with evidence ----------------
  test('case 5: a sufficiency entry with evidence is ACCEPTED at every pre-build gate', () => {
    assert.deepEqual(PRE_BUILD, ['implementation', 'todo'],
      'sanity: the pre-build gate destinations derived from the code');
    for (const folder of PRE_BUILD) {
      const slug = `suff-${folder}`;
      const p = path.join(project, 'plans', folder, `${slug}.md`);
      const content = `---\ntype: implementation\n---\n\nbody ${folder}\n`;
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
      // Drive the REAL writer — no hand-planted JSON.
      ledger.writeSufficiencyEntry(slug, {
        content_sha256: ledger.computeContentHash(content),
        stage_from: gateOrder.sourceOf(folder),
        stage_to: folder,
        evidence: `sufficiency: ${folder}/${slug}.md — 1 answered (db)`,
      }, project);

      const verdict = gate.classifyResidency(p, folder, project);
      assert.equal(verdict.accepted, true, `enough information must cross the pre-build gate ${folder}/`);
      assert.equal(verdict.kind, 'sufficiency', `kind reported honestly at ${folder}/`);
      assert.equal(verdict.reason, null, `no reason on acceptance at ${folder}/`);
    }
  });

  // --- Case 6: REJECTED at done/ (Decision 1) --------------------------------
  test('case 6: a sufficiency entry is REJECTED at done/ — Gate 3 is not an information gate', () => {
    const slug = 'suff-done';
    const p = path.join(project, 'plans', 'done', `${slug}.md`);
    const content = '---\ntype: implementation\n---\n\ndone body\n';
    fs.writeFileSync(p, content);
    ledger.writeSufficiencyEntry(slug, {
      content_sha256: ledger.computeContentHash(content),
      stage_from: 'review',
      stage_to: 'done',
      evidence: 'sufficiency: done/suff-done.md — 1 answered (db)',
    }, project);

    const verdict = gate.classifyResidency(p, 'done', project);
    assert.equal(verdict.accepted, false, 'sufficiency must NEVER cross Gate 3 (review → done)');
    assert.equal(verdict.reason, 'sufficiency-not-allowed');
    assert.equal(verdict.kind, 'sufficiency', 'still classified honestly, just not accepted here');
  });

  // --- Case 7: a sufficiency entry with NO evidence is rejected everywhere -----
  test('case 7: a sufficiency entry with no evidence is REJECTED at every gate', () => {
    // The real writer REFUSES a no-evidence write, so this malformed shape can only
    // be hand-planted — exactly what a not-yet-trusted writer might mint. The gate
    // must reject it on its own, regardless.
    for (const folder of ['implementation', 'todo', 'done']) {
      const slug = `suff-noev-${folder}`;
      const p = path.join(project, 'plans', folder, `${slug}.md`);
      const content = `---\ntype: implementation\n---\n\nno-ev ${folder}\n`;
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
      fs.writeFileSync(
        path.join(project, '.ctoc', 'approvals', `${slug}.json`),
        JSON.stringify({
          content_sha256: ledger.computeContentHash(content),
          stage_from: folder === 'done' ? 'review' : gateOrder.sourceOf(folder),
          stage_to: folder,
          advanced_by: 'sufficiency', // NO evidence
        }, null, 2),
      );

      const verdict = gate.classifyResidency(p, folder, project);
      assert.equal(verdict.accepted, false, `a no-evidence sufficiency entry must be rejected at ${folder}/`);
      assert.equal(verdict.kind, 'sufficiency');
      // At a pre-build gate the miss is the evidence; at done/ it is not-allowed (checked first).
      const expected = PRE_BUILD.includes(folder) ? 'sufficiency-no-evidence' : 'sufficiency-not-allowed';
      assert.equal(verdict.reason, expected, `wrong rejection reason at ${folder}/`);
    }
  });

  // --- The no-false-red guard: a REAL human/pipeline/backfilled entry unaffected
  test('case 5b: adding sufficiency did not disturb the other kinds at these gates', () => {
    // A genuine human crossing into todo still accepted.
    const p = path.join(project, 'plans', 'todo', 'still-human.md');
    const content = '---\ntype: implementation\n---\n\nhuman\n';
    fs.writeFileSync(p, content);
    ledger.writeEntry('still-human', {
      content_sha256: ledger.computeContentHash(content),
      stage_from: 'implementation', stage_to: 'todo', approved_by: 'human',
    }, project);
    const verdict = gate.classifyResidency(p, 'todo', project);
    assert.equal(verdict.accepted, true);
    assert.equal(verdict.kind, 'human');
  });
});
