'use strict';
/**
 * The write protection for the approval records, the check records and the owner's
 * answers — `src/hooks/protect-records.js`, the ONE CTOC hook registered in
 * `hooks/hooks.json` (plan "the approval records, the check records and the owner's
 * answers are write-protected").
 *
 * Every case spawns the REAL entry the way Claude Code does — the PreToolUse payload as
 * JSON on stdin — and reads the exit code and stdout. "Refused" is exit 2 and stdout
 * exactly the deny decision JSON carrying the refusal sentence; "allowed" is exit 0 and
 * empty stdout. Case numbers match the plan's test plan.
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const ENTRY = path.join(REPO, 'src', 'hooks', 'protect-records.js');
const MENU_MD = path.join(REPO, 'src', 'commands', 'start.md');

const REFUSAL = 'CTOC refused this call because it writes, or could write, the approval records in '
  + ".ctoc/approvals/ or the check records in .ctoc/state/verify/, which only CTOC's menu writes; "
  + 'finish your work, report it, and let the menu record the result.';
const REFUSAL_UNCHECKED = 'CTOC refused this call because it mentions the approval or check records '
  + "and CTOC's protection for them failed to run; tell the human that this protection is broken.";

let project;

function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-rec-')));
  for (const d of [
    ['.ctoc', 'approvals'], ['.ctoc', 'state', 'verify'], ['.ctoc', 'streaming', 'questions', 'pending'],
    ['src'], ['plans', 'review'],
  ]) fs.mkdirSync(path.join(dir, ...d), { recursive: true });
  return dir;
}

beforeEach(() => { project = makeProject(); });
afterEach(() => { fs.rmSync(project, { recursive: true, force: true }); project = null; });

function payload(toolName, toolInput, cwd = project) {
  return {
    session_id: 't', transcript_path: path.join(project, 't.jsonl'), cwd,
    permission_mode: 'default', hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput,
  };
}

function run(input, { cwd = project, entry = ENTRY } = {}) {
  return spawnSync(process.execPath, [entry], {
    cwd, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8',
  });
}

const p = (...parts) => path.join(project, ...parts);
const write = (file, cwd) => payload('Write', { file_path: file, content: '{}' }, cwd);
const bash = (command, cwd) => payload('Bash', { command, description: 'd' }, cwd);

function deny(sentence) {
  return JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: sentence,
  } });
}

function assertRefused(res, what, sentence = REFUSAL) {
  assert.equal(res.status, 2, `${what}: expected exit 2, got ${res.status}; stderr: ${res.stderr}`);
  assert.equal(res.stdout, deny(sentence), `${what}: stdout must be exactly the deny decision`);
}

function assertAllowed(res, what) {
  assert.equal(res.status, 0, `${what}: expected exit 0, got ${res.status}; stdout: ${res.stdout}; stderr: ${res.stderr}`);
  assert.equal(res.stdout, '', `${what}: an allow prints nothing on stdout`);
}

const refusedBash = (command, opts) => assertRefused(run(bash(command, opts && opts.cwd)), command);
const allowedBash = (command) => assertAllowed(run(bash(command)), command);

describe('editing tools — refused', () => {
  test('1 · Write to <project>/.ctoc/approvals/x.json', () => {
    assertRefused(run(write(p('.ctoc', 'approvals', 'x.json'))), 'case 1');
  });
  test('2 · Edit of <project>/.ctoc/state/verify/x.json', () => {
    assertRefused(run(payload('Edit', { file_path: p('.ctoc', 'state', 'verify', 'x.json'), old_string: 'a', new_string: 'b' })), 'case 2');
  });
  test('3 · MultiEdit of a relative .ctoc/approvals/x.json', () => {
    assertRefused(run(payload('MultiEdit', { file_path: '.ctoc/approvals/x.json', edits: [{ old_string: 'a', new_string: 'b' }] })), 'case 3');
  });
  test('4 · NotebookEdit of <project>/.ctoc/state/verify/n.ipynb', () => {
    assertRefused(run(payload('NotebookEdit', { notebook_path: p('.ctoc', 'state', 'verify', 'n.ipynb'), new_source: 'x' })), 'case 4');
  });
  test('5 · letter case: <project>/.CTOC/Approvals/x.json', () => {
    assertRefused(run(write(p('.CTOC', 'Approvals', 'x.json'))), 'case 5');
  });
  test('6 · Windows separators: .ctoc\\state\\verify\\x.json', () => {
    assertRefused(run(write('.ctoc\\state\\verify\\x.json')), 'case 6');
  });
  test('7 · `..`: <project>/src/../.ctoc/approvals/x.json', () => {
    assertRefused(run(write(`${project}/src/../.ctoc/approvals/x.json`)), 'case 7');
  });
  test('8 · a symbolic link src/link → .ctoc/state/verify', () => {
    fs.symlinkSync(p('.ctoc', 'state', 'verify'), p('src', 'link'), 'junction');
    assertRefused(run(write(p('src', 'link', 'x.json'))), 'case 8');
  });
  test('9 · session working directory is <project>/src', () => {
    assertRefused(run(write(p('.ctoc', 'approvals', 'x.json'), p('src')), { cwd: p('src') }), 'case 9');
  });
});

describe('editing tools — allowed', () => {
  test('10 · a source file in a project with no plan and no Iron Loop state', () => {
    assertAllowed(run(write(p('src', 'x.js'))), 'case 10');
  });
  test('11 · the waiting folder for new questions', () => {
    assertAllowed(run(write(p('.ctoc', 'streaming', 'questions', 'pending', 'implementation__x.md.json'))), 'case 11');
  });
  test('12 · same-prefix siblings', () => {
    assertAllowed(run(write(p('.ctoc', 'approvals-summary.md'))), 'case 12a');
    assertAllowed(run(write(p('.ctoc', 'state', 'verify-notes.md'))), 'case 12b');
  });
  test('13 · .ctoc/approvals/../settings.yaml resolves out of the folder', () => {
    assertAllowed(run(write(`${project}/.ctoc/approvals/../settings.yaml`)), 'case 13');
  });
  test('14 · a plan file', () => {
    assertAllowed(run(write(p('plans', 'review', 'x.md'))), 'case 14');
  });
});

describe('shell — refused', () => {
  test('15 · redirect into the check records', () => refusedBash(`echo '{"passed":true}' > .ctoc/state/verify/x.json`));
  test('16 · append into the approval records', () => refusedBash('cat forged.json >> .ctoc/approvals/x.json'));
  test('17 · tee', () => refusedBash('tee .ctoc/approvals/x.json < forged.json'));
  test('18 · cp', () => refusedBash('cp /tmp/f.json .ctoc/state/verify/x.json'));
  test('19 · mv', () => refusedBash('mv f.json .ctoc/approvals/x.json'));
  test('20 · rm', () => refusedBash('rm .ctoc/state/verify/x.json'));
  test('21 · sed -i', () => refusedBash(`sed -i '' 's/false/true/' .ctoc/state/verify/x.json`));
  test('22 · touch', () => refusedBash('touch .ctoc/approvals/x.json'));
  test('23 · python one-liner', () => refusedBash(`python3 -c "open('.ctoc/state/verify/x.json','w').write('{}')"`));
  test('24 · node one-liner', () => refusedBash(`node -e "require('fs').writeFileSync('.ctoc/approvals/x.json','{}')"`));
  test('25 · cd split', () => refusedBash('cd .ctoc && echo x > state/verify/x.json'));
  test('26 · cd split, deeper', () => refusedBash('cd .ctoc/state && cp f.json verify/x.json'));
  test('27 · quote split', () => refusedBash('echo x > .ctoc"/"state/verify/x.json'));
  test('28 · letter case', () => refusedBash('echo x > .CTOC/APPROVALS/x.json'));
  test('29 · Windows separators', () => refusedBash('echo x > .ctoc\\\\state\\\\verify\\\\x.json'));
  test('30 · `..`', () => refusedBash('echo x > src/../.ctoc/approvals/x.json'));
  test('31 · through a symbolic link to .ctoc/state/verify', () => {
    fs.symlinkSync(p('.ctoc', 'state', 'verify'), p('src', 'link'), 'junction');
    refusedBash('echo x > src/link/x.json');
  });
  test('32 · creating a link to the approval records', () => refusedBash('ln -s ../.ctoc/approvals src/l'));
  test('33 · the session already stands in .ctoc', () => refusedBash('echo x > approvals/x.json', { cwd: p('.ctoc') }));
  test('34 · backfill --plan --stage done', () => refusedBash('node src/scripts/ledger-backfill.js --plan plans/review/x.md --stage done'));
  test('35 · backfill --mark-migrated --force', () => refusedBash('node "${CLAUDE_PLUGIN_ROOT}/src/scripts/ledger-backfill.js" --mark-migrated --force'));
  test('36 · backfill --vision with an extra --root', () => refusedBash('node src/scripts/ledger-backfill.js --vision --root /elsewhere'));
  test('37 · an inline script running the backfill', () => refusedBash(`node -e "require('./src/scripts/ledger-backfill').run(['--plan','x','--stage','todo'])"`));
  test('38 · approvePlan inline', () => refusedBash(`node -e "require('./src/lib/actions').approvePlan('review/x.md','done')"`));
  test('39 · persistVerifyResult inline', () => refusedBash(`node -e "require('./src/lib/step-13-verify').persistVerifyResult(process.cwd(),'x')"`));
  test('40 · crossBySufficiency inline', () => refusedBash(`node -e "require('./src/lib/streaming-gate').crossBySufficiency(process.cwd(),'p','implementation/p.md','implementation','todo',{enough:true})"`));
  test('41 · streamApprove inline', () => refusedBash(`node -e "require('./src/lib/streaming-gate').streamApprove('review/x.md',process.cwd())"`));
  test('42 · decoded payload into node', () => refusedBash('echo bm9kZQ== | base64 -d | node'));
  test('43 · a menu call hiding a command substitution', () => refusedBash(
    'node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" menu task complete t1 --summary "$(echo x > .ctoc/approvals/a.json)"'));
  test('44 · a menu call followed by a write', () => refusedBash('node src/commands/start.js menu; echo x > .ctoc/approvals/a.json'));
  test('45 · git diff --output into the records', () => refusedBash('git diff --output=.ctoc/approvals/x.json'));
  test('46 · git checkout of a record', () => refusedBash('git checkout -- .ctoc/approvals/x.json'));
});

describe('shell — allowed', () => {
  test('47 · reads', () => {
    allowedBash('ls .ctoc/approvals');
    allowedBash('cat .ctoc/state/verify/x.json');
    allowedBash('grep -r passed .ctoc/state/verify');
  });
  test('48 · the test suite', () => {
    allowedBash('npm test');
    allowedBash('node --test tests/ledger-backfill-coverage.test.js');
  });
  test('49 · a menu call whose summary names both folders', () => allowedBash(
    'node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" menu task complete t1 --summary "wrote .ctoc/state/verify/x.json and .ctoc/approvals/y.json"'));
  test('50 · the --vision backfill recipe, with and without --dry-run', () => {
    allowedBash('node "${CLAUDE_PLUGIN_ROOT}/src/scripts/ledger-backfill.js" --vision');
    allowedBash('node "${CLAUDE_PLUGIN_ROOT}/src/scripts/ledger-backfill.js" --vision --dry-run');
    allowedBash('node "${CLAUDE_PLUGIN_ROOT}/src/scripts/ledger-backfill.js" --dry-run --vision');
  });
  test('51 · every node -e recipe in the live start.md', () => {
    const md = fs.readFileSync(MENU_MD, 'utf8');
    const recipes = [];
    const re = /`(node\s+-e\s+"[^`]*")`/g;
    let m;
    while ((m = re.exec(md)) !== null) recipes.push(m[1]);
    assert.ok(recipes.length >= 5, `expected at least 5 recipes, found ${recipes.length}`);
    for (const r of recipes) allowedBash(r);
  });
  test('52 · staging and committing records by name', () => allowedBash(
    'git add .ctoc/approvals/00001-x.json .ctoc/state/verify/x.json && git commit -m "records"'));
  test('53 · a source write in a project with no plan and no Iron Loop state', () => allowedBash('echo x > src/x.js'));
  test('54 · reading and staging the backfill script', () => {
    allowedBash('cat src/scripts/ledger-backfill.js');
    allowedBash('git add src/scripts/ledger-backfill.js');
  });
});

describe('when the protection cannot run (a release missing its dependencies)', () => {
  let plugin;
  let brokenEntry;
  beforeEach(() => {
    plugin = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-plug-')));
    fs.mkdirSync(path.join(plugin, 'src', 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(plugin, 'src', 'lib'), { recursive: true });
    brokenEntry = path.join(plugin, 'src', 'hooks', 'protect-records.js');
    fs.copyFileSync(ENTRY, brokenEntry);
    fs.copyFileSync(path.join(REPO, 'src', 'lib', 'hook-deny-signal.js'), path.join(plugin, 'src', 'lib', 'hook-deny-signal.js'));
  });
  afterEach(() => fs.rmSync(plugin, { recursive: true, force: true }));

  test('55 · a shell write naming the records is refused with the second sentence', () => {
    assertRefused(run(bash('echo x > .ctoc/approvals/a.json'), { entry: brokenEntry }), 'case 55', REFUSAL_UNCHECKED);
  });
  test('56 · a Write to the check records is refused with the second sentence', () => {
    assertRefused(run(write(p('.ctoc', 'state', 'verify', 'x.json')), { entry: brokenEntry }), 'case 56', REFUSAL_UNCHECKED);
  });
  test('57 · an ordinary call is allowed', () => {
    assertAllowed(run(bash('ls'), { entry: brokenEntry }), 'case 57');
  });
});

describe('payloads', () => {
  test('58 · empty stdin is allowed', () => assertAllowed(run(''), 'case 58'));
  test('59 · non-JSON stdin: refused when it mentions the records, allowed otherwise', () => {
    assertRefused(run('not json .ctoc/approvals'), 'case 59a', REFUSAL_UNCHECKED);
    assertAllowed(run('not json ls'), 'case 59b');
  });
});

describe('registration', () => {
  test('60 · hooks/hooks.json registers exactly the one protection', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'hooks', 'hooks.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.hooks), ['PreToolUse']);
    const groups = manifest.hooks.PreToolUse;
    assert.equal(groups.length, 1);
    assert.equal(groups[0].hooks.length, 1);
    const matcher = new RegExp(`^(?:${groups[0].matcher})$`);
    for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash']) assert.ok(matcher.test(tool), `matches ${tool}`);
    for (const tool of ['Read', 'Task', 'Agent', 'Glob', 'Grep']) assert.ok(!matcher.test(tool), `does not match ${tool}`);
    const hook = groups[0].hooks[0];
    assert.equal(hook.type, 'command');
    assert.equal(hook.command, 'node "${CLAUDE_PLUGIN_ROOT}/src/hooks/protect-records.js"');
    const script = hook.command.replace('${CLAUDE_PLUGIN_ROOT}', REPO).match(/^node "([^"]+)"$/)[1];
    assert.equal(path.relative(REPO, script).split(path.sep).join('/'), 'src/hooks/protect-records.js');
    assert.ok(fs.existsSync(script), 'the registered command names an existing file');
  });
  test('61 · .claude-plugin/plugin.json has no hooks key', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'plugin.json'), 'utf8'));
    assert.ok(!Object.prototype.hasOwnProperty.call(manifest, 'hooks'));
  });
});

describe("the owner's answers and the live question files", () => {
  test('62 · Write to the answers log', () => {
    assertRefused(run(write(p('.ctoc', 'streaming', 'answers.jsonl'))), 'case 62');
  });
  test('63 · Edit of a live question file', () => {
    assertRefused(run(payload('Edit', { file_path: p('.ctoc', 'streaming', 'questions', 'review__x.md.json'), old_string: 'a', new_string: 'b' })), 'case 63');
  });
  test('64 · a Write that normalises out of the waiting folder', () => {
    assertRefused(run(write(`${project}/.ctoc/streaming/questions/pending/../review__x.md.json`)), 'case 64');
  });
  test('65 · shell append to the answers log is refused; reading it is allowed', () => {
    refusedBash(`echo '{}' >> .ctoc/streaming/answers.jsonl`);
    allowedBash('cat .ctoc/streaming/answers.jsonl');
  });
  test('66 · streamAnswer inline', () => refusedBash(
    `node -e "require('./src/lib/streaming-gate').streamAnswer('review/x.md','q1','a',process.cwd())"`));
  test('67 · the menu route that records an answer', () => allowedBash(
    'node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" stream answer review/x.md q1 a'));
  test('68 · the waiting folder stays writable', () => {
    assertAllowed(run(write(p('.ctoc', 'streaming', 'questions', 'pending', 'implementation__y.md.json'))), 'case 68');
  });
});
