/**
 * Tools Tab — dark-branch coverage (src/tabs/tools.js)
 *
 * These tests load the REAL module (no domain mocking) and drive it against real
 * os.tmpdir() project fixtures. They deliberately target the NON-OBVIOUS data/logic
 * decisions the render + handleKey state machine makes — the branches the existing
 * tests/tab-modules.test.js suite leaves dark (whole-suite scoped baseline for this
 * file: line 87.62 / branch 86.30, uncovered 86, 98-119, 145-150, 208-209, 271-279).
 *
 * Boundary fakes only (never core logic):
 *   - os.homedir is redirected to a tmp dir for the forceUpdate path so the DESTRUCTIVE
 *     rmSync operates on a throwaway tree, NEVER the real ~/.claude plugin cache.
 *   - safeFs.readFileSync is thrown from once, scoped, to exercise the getVersion catch
 *     (the real repo VERSION file always exists, so the catch is otherwise unreachable).
 *
 * AI-authored, human-reviewed line-by-line (assertions pin semantic content — counts,
 * labels, ON/OFF, arrow position, the second operand of ||/??, the state machine — never
 * "a string was produced").
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const TOOLS_PATH = require.resolve('../src/tabs/tools');
const SYNC_PATH = require.resolve('../src/lib/sync');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// tools.js emits SGR colour codes; strip them so assertions read the plain text.
const ANSI = /\x1b\[[0-9;]*m/g;
const strip = (s) => s.replace(ANSI, '');

const tmpDirs = [];
function makeTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

/**
 * A tmp project directory. opts:
 *   settingsFile: false (none) | object (written to .ctoc/settings.json)
 *   plans: true|false (create plans/ dir)
 */
function makeProject({ settingsFile = false, plans = false } = {}) {
  const d = makeTmp('ctoc-tools-');
  if (settingsFile) {
    fs.mkdirSync(path.join(d, '.ctoc'), { recursive: true });
    fs.writeFileSync(
      path.join(d, '.ctoc', 'settings.json'),
      JSON.stringify(settingsFile, null, 2)
    );
  }
  if (plans) fs.mkdirSync(path.join(d, 'plans'), { recursive: true });
  return d;
}

// Fresh, isolated copy of tools + its sync module so the process-global `lastSync`
// in sync.js cannot leak between tests (FIRST.Independent).
function freshTools() {
  delete require.cache[TOOLS_PATH];
  delete require.cache[SYNC_PATH];
  return require('../src/tabs/tools');
}

function makeApp(overrides = {}) {
  return {
    projectPath: makeProject(),
    toolIndex: 0,
    toolMode: null,
    settingsTabIndex: 0,
    settingIndex: 0,
    doctorInput: '',
    updateMessage: null,
    latestVersion: null,
    message: null,
    ...overrides
  };
}

// Minimal key event matching what src/menu passes to handleKey.
function key(name, seq) {
  return { name, sequence: seq !== undefined ? seq : (name && name.length === 1 ? name : ''), ctrl: false };
}

after(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* fixture cleanup best-effort */ }
  }
});

// ===========================================================================
// render() — the selection arrow is a DATA decision, not decoration
// ===========================================================================
describe('tools.render() selection arrow', () => {
  test('arrow marks exactly the selected tool row and no other', () => {
    // Arrange
    const tools = freshTools();
    const app = makeApp({ toolIndex: 1 }); // Update is index 1

    // Act
    const lines = strip(tools.render(app)).split('\n');

    // Assert — arrow (→) sits on the Update row; the Doctor row keeps the space marker.
    const updateLine = lines.find((l) => l.includes('Update'));
    const doctorLine = lines.find((l) => l.includes('Doctor'));
    assert.match(updateLine, /^→ 2\. Update/, 'selected row (index 1) must carry the → arrow');
    assert.match(doctorLine, /^ {2}1\. Doctor/, 'unselected row must carry the space marker, not →');
  });
});

// ===========================================================================
// renderDoctor() — the all-pass aggregation + the last-sync presence branch
// ===========================================================================
describe('tools.renderDoctor() health aggregation', () => {
  test('all checks pass verdict when settings file AND plans dir both exist', () => {
    // Arrange — plugin + hooks + node checks pass from the repo; supply the two
    // project-scoped checks so every one of the five passes.
    const tools = freshTools();
    const app = makeApp({ projectPath: makeProject({ settingsFile: { general: {} }, plans: true }) });

    // Act
    const out = strip(tools.renderDoctor(app));

    // Assert — the aggregate verdict is the AND of every check.
    assert.match(out, /All checks passed\./);
    assert.doesNotMatch(out, /Some checks failed\./);
  });

  test('some-failed verdict when the project is missing settings and plans', () => {
    // Arrange — a bare project: Settings-file and Plans-dir checks both fail.
    const tools = freshTools();
    const app = makeApp({ projectPath: makeProject() });

    // Act
    const out = strip(tools.renderDoctor(app));

    // Assert
    assert.match(out, /Some checks failed\./);
    assert.doesNotMatch(out, /All checks passed\./);
    assert.match(out, /Settings file exists/, 'the specific failing check must be listed');
    assert.match(out, /Plans directory exists/);
  });

  test('last-sync line is absent until a sync has happened this session', () => {
    // Arrange — fresh sync module: process-global lastSync starts null.
    const tools = freshTools();
    const app = makeApp({ projectPath: makeProject({ plans: true }) });

    // Act
    const out = strip(tools.renderDoctor(app));

    // Assert — the `if (lastSync)` guard is false, so no timestamp line renders.
    assert.doesNotMatch(out, /Last sync:/);
  });

  test('last-sync line appears after a successful clean sync sets the timestamp', () => {
    // Arrange — a real, clean git repo with a plans/ dir: syncPlans reports
    // "no changes" and stamps lastSync (sync.js line 85). Drive it through the
    // real doctor "3 = Sync now" handler, not a mock.
    const tools = freshTools();
    const project = makeProject({ plans: true });
    fs.writeFileSync(path.join(project, 'plans', '.keep'), '');
    execSync('git init -q && git add -A && git -c user.email=a@b.c -c user.name=t commit -qm init', { cwd: project });
    const app = makeApp({ projectPath: project, toolMode: '1' });

    // Act — the sync side effect, then the render that reads it.
    tools.handleKey(key('sync', '3'), app);
    const out = strip(tools.renderDoctor(app));

    // Assert — now the truthy branch renders the timestamp line.
    assert.match(out, /Last sync:/);
  });
});

// ===========================================================================
// handleKey Doctor mode — the manualSync message uses the SECOND operand of ||
// ===========================================================================
describe('tools.handleKey() doctor sync message fallbacks', () => {
  test('non-git project surfaces the error (reason absent, || falls to error)', () => {
    // Arrange — no git repo → syncPlans throws → { synced:false, error }, reason undefined.
    const tools = freshTools();
    const app = makeApp({ projectPath: makeProject(), toolMode: '1' });

    // Act
    const handled = tools.handleKey(key('sync', '3'), app);

    // Assert — `result.reason || result.error`: reason is undefined so the error operand shows.
    assert.equal(handled, true);
    assert.match(app.message, /^Sync: /);
    assert.match(app.message, /git|repository|fatal/i, 'the error string (not "no changes") must reach the message');
  });

  test('clean git project surfaces the "no changes" reason (first operand of ||)', () => {
    // Arrange
    const tools = freshTools();
    const project = makeProject({ plans: true });
    fs.writeFileSync(path.join(project, 'plans', '.keep'), '');
    execSync('git init -q && git add -A && git -c user.email=a@b.c -c user.name=t commit -qm init', { cwd: project });
    const app = makeApp({ projectPath: project, toolMode: '1' });

    // Act
    tools.handleKey(key('sync', '3'), app);

    // Assert — reason is truthy so it wins the || and error is never consulted.
    assert.equal(app.message, 'Sync: no changes');
  });
});

// ===========================================================================
// renderUpdate() — version comparison, message vs affordance, real getVersion
// ===========================================================================
describe('tools.renderUpdate() version + affordance branches', () => {
  test('shows the real repo VERSION as the current version', () => {
    // Arrange
    const tools = freshTools();
    const real = fs.readFileSync(path.join(REPO, 'VERSION'), 'utf8').trim();

    // Act
    const out = strip(tools.renderUpdate(makeApp()));

    // Assert — getVersion() reads the real file (not a stubbed constant).
    assert.match(out, new RegExp(`Current version:\\s+${real.replace(/\./g, '\\.')}`));
  });

  test('"Update available!" shown only when latestVersion differs from current', () => {
    // Arrange
    const tools = freshTools();
    const current = fs.readFileSync(path.join(REPO, 'VERSION'), 'utf8').trim();

    // Act — different vs identical latest version
    const differs = strip(tools.renderUpdate(makeApp({ latestVersion: '999.0.0' })));
    const same = strip(tools.renderUpdate(makeApp({ latestVersion: current })));

    // Assert — the `latestVersion !== current` branch flips both ways.
    assert.match(differs, /Update available!/);
    assert.doesNotMatch(same, /Update available!/, 'equal versions must NOT claim an update is available');
  });

  test('update message replaces the force-update affordance when present', () => {
    // Arrange
    const tools = freshTools();

    // Act
    const withMsg = strip(tools.renderUpdate(makeApp({ updateMessage: 'Cache already clear.' })));
    const noMsg = strip(tools.renderUpdate(makeApp({ updateMessage: null })));

    // Assert — the if/else: message path hides the "Force update" option; else path shows it.
    assert.match(withMsg, /Cache already clear\./);
    assert.doesNotMatch(withMsg, /Force update/, 'affordance must be suppressed while a message is shown');
    assert.match(noMsg, /1\. .*Force update/);
    assert.match(noMsg, /clears the plugin cache/);
  });

  test('getVersion falls back to 0.0.0 when the VERSION file read throws', () => {
    // Arrange — throw from the fs boundary only (safe-fs is the true boundary).
    const tools = freshTools();
    const safeFs = require('../src/lib/safe-fs');
    const orig = safeFs.readFileSync;
    safeFs.readFileSync = () => { throw new Error('simulated missing VERSION'); };

    try {
      // Act
      const out = strip(tools.renderUpdate(makeApp()));

      // Assert — the catch returns the sentinel version.
      assert.match(out, /Current version:\s+0\.0\.0/);
    } finally {
      safeFs.readFileSync = orig;
    }
  });
});

// ===========================================================================
// forceUpdate() via the Update-mode "1" handler — DESTRUCTIVE path, redirected
// to a tmp home so the real ~/.claude plugin cache is NEVER touched.
// ===========================================================================
describe('tools.handleKey() force-update (os.homedir redirected to tmp)', () => {
  function withFakeHome(fn) {
    const fakeHome = makeTmp('ctoc-home-');
    const origHome = os.homedir;
    os.homedir = () => fakeHome; // forceUpdate reads os.homedir() at call time
    try { return fn(fakeHome); } finally { os.homedir = origHome; }
  }

  test('clears existing cache + marketplace dirs and reports both', () => {
    withFakeHome((fakeHome) => {
      // Arrange — both robotijn dirs present under the fake home.
      const tools = freshTools();
      const base = path.join(fakeHome, '.claude', 'plugins');
      const cacheDir = path.join(base, 'cache', 'robotijn');
      const marketDir = path.join(base, 'marketplaces', 'robotijn');
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.mkdirSync(marketDir, { recursive: true });
      const app = makeApp({ toolMode: '2' });

      // Act — the real force-update key.
      const handled = tools.handleKey(key('one', '1'), app);

      // Assert — both existsSync branches taken, both push()es fired; dirs are gone.
      assert.equal(handled, true);
      assert.match(strip(app.updateMessage), /Cache cleared\./);
      assert.equal(fs.existsSync(cacheDir), false, 'cache dir must be removed');
      assert.equal(fs.existsSync(marketDir), false, 'marketplace dir must be removed');
    });
  });

  test('reports already-clear when neither dir exists (empty cleared list)', () => {
    withFakeHome(() => {
      // Arrange — fake home with no robotijn dirs at all.
      const tools = freshTools();
      const app = makeApp({ toolMode: '2' });

      // Act
      tools.handleKey(key('one', '1'), app);

      // Assert — cleared.length === 0 → the else branch message.
      assert.match(strip(app.updateMessage), /Cache already clear\./);
    });
  });
});

// ===========================================================================
// renderSettings() — the value-formatting switch is pure DATA→label mapping
// ===========================================================================
describe('tools.renderSettings() value-type formatting', () => {
  test('toggle renders ON for a truthy stored value', () => {
    // Arrange — default general.syncEnabled is true.
    const tools = freshTools();
    const out = strip(tools.renderSettings(makeApp({ settingsTabIndex: 0 })));

    // Assert — General category shows the toggle in the ON state.
    assert.match(out, /General Settings/);
    assert.match(out, /Auto-sync enabled\s+ON/i);
  });

  test('toggle renders OFF when the stored value is false', () => {
    // Arrange — override syncEnabled to false in the real settings file.
    const tools = freshTools();
    const project = makeProject({ settingsFile: { general: { syncEnabled: false } } });
    const out = strip(tools.renderSettings(makeApp({ projectPath: project, settingsTabIndex: 0 })));

    // Assert — the ternary flips to the OFF label.
    assert.match(out, /Auto-sync enabled\s+OFF/i);
    assert.doesNotMatch(out, /Auto-sync enabled\s+ON/i);
  });

  test('list type renders the item count, and the count is data-driven', () => {
    // Arrange — workflow (index 2) holds escapePhrases (a list). Default has 4 items.
    const tools = freshTools();
    const defaults = strip(tools.renderSettings(makeApp({ settingsTabIndex: 2 })));

    const oneItem = strip(tools.renderSettings(makeApp({
      projectPath: makeProject({ settingsFile: { workflow: { escapePhrases: ['only'] } } }),
      settingsTabIndex: 2
    })));

    // Assert — `[N items]` where N is value.length (0/1/many boundary between the two).
    assert.match(defaults, /\[4 items\]/, 'default escapePhrases length is 4');
    assert.match(oneItem, /\[1 items\]/, 'count must reflect the actual list length');
  });

  test('select and number/string types render their concrete value', () => {
    // Arrange — general.environment (select), syncInterval (number), timezone (string).
    const tools = freshTools();
    const project = makeProject({
      settingsFile: { general: { environment: 'prod', syncInterval: 42, timezone: 'Europe/Amsterdam' } }
    });

    // Act
    const out = strip(tools.renderSettings(makeApp({ projectPath: project, settingsTabIndex: 0 })));

    // Assert — the select branch and the else (number/string) branch echo the stored values.
    assert.match(out, /Environment\s+prod/i);
    assert.match(out, /Sync interval[^\n]*42/i);
    assert.match(out, /Timezone[^\n]*Europe\/Amsterdam/i);
  });

  test('settings sub-tabs render every category and the active label', () => {
    // Arrange
    const tools = freshTools();

    // Act
    const out = strip(tools.renderSettings(makeApp({ settingsTabIndex: 2 })));

    // Assert — the tab strip lists all categories; the active schema label is Workflow.
    for (const name of ['General', 'Agents', 'Workflow', 'Learning', 'Git', 'Privacy']) {
      assert.match(out, new RegExp(name), `category tab ${name} must appear`);
    }
    assert.match(out, /Workflow Settings/);
  });
});

// ===========================================================================
// handleKey() — the tools-list + settings state machine (non-destructive)
// ===========================================================================
describe('tools.handleKey() tool-list navigation + entry', () => {
  test('down/up clamp at the list boundaries', () => {
    // Arrange
    const tools = freshTools();
    const app = makeApp({ toolIndex: 2 }); // last tool (Settings)

    // Act — down at the bottom must clamp; up decrements.
    tools.handleKey(key('down'), app);
    assert.equal(app.toolIndex, 2, 'must not advance past the last tool (Math.min clamp)');
    tools.handleKey(key('up'), app);
    assert.equal(app.toolIndex, 1);
  });

  test('Enter opens the highlighted tool via TOOLS[toolIndex].key', () => {
    // Arrange — highlight Update (index 1).
    const tools = freshTools();
    const app = makeApp({ toolIndex: 1 });

    // Act — the return branch of the toolKey ternary reads TOOLS[index].key.
    tools.handleKey(key('return'), app);

    // Assert
    assert.equal(app.toolMode, '2');
  });

  test('number 3 opens Settings and resets both settings indices', () => {
    // Arrange — dirty indices that entry must reset.
    const tools = freshTools();
    const app = makeApp({ settingsTabIndex: 4, settingIndex: 9 });

    // Act
    tools.handleKey(key('three', '3'), app);

    // Assert — the sequence branch of the ternary + the toolKey==='3' reset block.
    assert.equal(app.toolMode, '3');
    assert.equal(app.settingsTabIndex, 0);
    assert.equal(app.settingIndex, 0);
  });

  test('number 2 opens Update and clears any stale update message', () => {
    // Arrange
    const tools = freshTools();
    const app = makeApp({ updateMessage: 'stale' });

    // Act
    tools.handleKey(key('two', '2'), app);

    // Assert — toolKey==='2' block nulls updateMessage.
    assert.equal(app.toolMode, '2');
    assert.equal(app.updateMessage, null);
  });

  test('digit above the range (4) is not a tool-open and is left unhandled', () => {
    // Arrange
    const tools = freshTools();
    const app = makeApp();

    // Act — boundary: sequence '4' fails `<= '3'`.
    const handled = tools.handleKey(key('four', '4'), app);

    // Assert — no tool opened; the final `return false` is reached.
    assert.equal(handled, false);
    assert.equal(app.toolMode, null);
  });
});

describe('tools.handleKey() doctor input editing', () => {
  test('typable char appends but reserved digits 1-3 and ctrl combos do not', () => {
    // Arrange
    const tools = freshTools();
    const app = makeApp({ toolMode: '1', doctorInput: '' });

    // Act + Assert — plain char appends.
    tools.handleKey(key('x', 'x'), app);
    assert.equal(app.doctorInput, 'x');

    // '1' is reserved (menu shortcut) → excluded by !'123'.includes(seq).
    tools.handleKey(key('one', '1'), app);
    assert.equal(app.doctorInput, 'x', 'digit 1 must not be typed into the doctor question');

    // Ctrl-modified char excluded by !key.ctrl.
    tools.handleKey({ name: 'c', sequence: 'c', ctrl: true }, app);
    assert.equal(app.doctorInput, 'x', 'ctrl combos must not be typed');
  });

  test('backspace on an undefined input coerces to empty string (|| fallback)', () => {
    // Arrange — doctorInput deliberately undefined to exercise `(app.doctorInput || '')`.
    const tools = freshTools();
    const app = makeApp({ toolMode: '1' });
    delete app.doctorInput;

    // Act
    const handled = tools.handleKey(key('backspace'), app);

    // Assert
    assert.equal(handled, true);
    assert.equal(app.doctorInput, '');
  });

  test('b exits doctor mode and clears the question buffer', () => {
    // Arrange
    const tools = freshTools();
    const app = makeApp({ toolMode: '1', doctorInput: 'half typed' });

    // Act
    tools.handleKey(key('b'), app);

    // Assert
    assert.equal(app.toolMode, null);
    assert.equal(app.doctorInput, '');
  });
});

describe('tools.handleKey() update mode exit', () => {
  test('sequence 0 exits update mode and clears its message', () => {
    // Arrange
    const tools = freshTools();
    const app = makeApp({ toolMode: '2', updateMessage: 'something' });

    // Act — the third operand of the exit `||` (key.sequence === '0').
    tools.handleKey(key('zero', '0'), app);

    // Assert
    assert.equal(app.toolMode, null);
    assert.equal(app.updateMessage, null);
  });
});

describe('tools.handleKey() settings mode state machine', () => {
  test('left wraps from the first category to the last', () => {
    // Arrange — 6 real categories; left at index 0 wraps to 5.
    const tools = freshTools();
    const app = makeApp({ toolMode: '3', settingsTabIndex: 0, settingIndex: 3 });

    // Act — (idx - 1 + len) % len modular wrap.
    tools.handleKey(key('left'), app);

    // Assert
    assert.equal(app.settingsTabIndex, 5, 'must wrap to the last category');
    assert.equal(app.settingIndex, 0, 'switching category resets the setting cursor');
  });

  test('right wraps from the last category back to the first', () => {
    // Arrange
    const tools = freshTools();
    const app = makeApp({ toolMode: '3', settingsTabIndex: 5 });

    // Act
    tools.handleKey(key('right'), app);

    // Assert
    assert.equal(app.settingsTabIndex, 0);
  });

  test('up moves the setting cursor toward the top and clamps at zero', () => {
    // Arrange — cursor mid-list, then already at the top.
    const tools = freshTools();
    const app = makeApp({ toolMode: '3', settingsTabIndex: 0, settingIndex: 2 });

    // Act — Math.max(0, idx - 1): decrement then clamp.
    tools.handleKey(key('up'), app);
    assert.equal(app.settingIndex, 1);
    app.settingIndex = 0;
    tools.handleKey(key('up'), app);

    // Assert — must not go negative.
    assert.equal(app.settingIndex, 0);
  });

  test('down clamps at the last setting of the active category', () => {
    // Arrange — general has 5 settings; cursor starts on the last one.
    const tools = freshTools();
    const app = makeApp({ toolMode: '3', settingsTabIndex: 0, settingIndex: 4 });

    // Act — Math.min(schema.settings.length - 1, idx + 1) clamp.
    tools.handleKey(key('down'), app);

    // Assert
    assert.equal(app.settingIndex, 4, 'must not run past the last setting');
  });

  test('Enter on a toggle setting persists the flipped value', () => {
    // Arrange — general.syncEnabled (a toggle) currently true; find its index.
    const tools = freshTools();
    const settings = require('../src/lib/settings');
    const toggleIdx = settings.getCategorySchema('general').settings.findIndex((s) => s.key === 'syncEnabled');
    assert.ok(toggleIdx >= 0, 'sanity: syncEnabled toggle exists in the general schema');
    const project = makeProject({ settingsFile: { general: { syncEnabled: true } } });
    const app = makeApp({ projectPath: project, toolMode: '3', settingsTabIndex: 0, settingIndex: toggleIdx });

    // Act — the real toggleSetting writes the tmp project's settings.json.
    const handled = tools.handleKey(key('return'), app);

    // Assert — persisted value flipped to false (behaviour, not a call spy).
    assert.equal(handled, true);
    assert.equal(settings.loadSettings(project).general.syncEnabled, false);
  });

  test('Enter on a select setting CYCLES to the next allowed option and persists', () => {
    // Arrange — agents.defaultModel is a clean select ['opus','sonnet','haiku'] with
    // no environment-profile side effects. Current 'opus' → Enter should cycle to 'sonnet'.
    const tools = freshTools();
    const settings = require('../src/lib/settings');
    const agentsTabIdx = settings.SETTINGS_TABS.findIndex((t) => t.id === 'agents');
    const selectIdx = settings.getCategorySchema('agents').settings.findIndex((s) => s.key === 'defaultModel');
    assert.ok(agentsTabIdx >= 0 && selectIdx >= 0, 'sanity: agents.defaultModel select exists');
    const project = makeProject({ settingsFile: { agents: { defaultModel: 'opus' } } });
    const app = makeApp({ projectPath: project, toolMode: '3', settingsTabIndex: agentsTabIdx, settingIndex: selectIdx });

    // Act — Enter cycles the select and persists via setSetting.
    const handled = tools.handleKey(key('return'), app);

    // Assert — value advanced to the next option and was written to disk (behaviour).
    assert.equal(handled, true);
    assert.equal(settings.loadSettings(project).agents.defaultModel, 'sonnet', 'cycled opus → sonnet');
  });

  test('Enter on a select setting WRAPS from the last option back to the first', () => {
    // Arrange — 'haiku' is the last option; Enter must wrap to 'opus'.
    const tools = freshTools();
    const settings = require('../src/lib/settings');
    const agentsTabIdx = settings.SETTINGS_TABS.findIndex((t) => t.id === 'agents');
    const selectIdx = settings.getCategorySchema('agents').settings.findIndex((s) => s.key === 'defaultModel');
    const project = makeProject({ settingsFile: { agents: { defaultModel: 'haiku' } } });
    const app = makeApp({ projectPath: project, toolMode: '3', settingsTabIndex: agentsTabIdx, settingIndex: selectIdx });

    // Act
    tools.handleKey(key('return'), app);

    // Assert — wrapped around.
    assert.equal(settings.loadSettings(project).agents.defaultModel, 'opus', 'wrapped haiku → opus');
  });

  test('Enter on a number setting is NOT a silent no-op — it surfaces a hint and does not falsely change the value', () => {
    // Arrange — agents.maxParallelAgents is a number setting. Enter must give visible
    // feedback (a hint pointing at the file to edit) and must NOT mutate the value.
    const tools = freshTools();
    const settings = require('../src/lib/settings');
    const agentsTabIdx = settings.SETTINGS_TABS.findIndex((t) => t.id === 'agents');
    const numIdx = settings.getCategorySchema('agents').settings.findIndex((s) => s.key === 'maxParallelAgents');
    assert.ok(numIdx >= 0, 'sanity: agents.maxParallelAgents number exists');
    const project = makeProject({ settingsFile: { agents: { maxParallelAgents: 2 } } });
    const app = makeApp({ projectPath: project, toolMode: '3', settingsTabIndex: agentsTabIdx, settingIndex: numIdx });

    // Act
    const handled = tools.handleKey(key('return'), app);

    // Assert — consumed, an observable hint was set, value unchanged (no false "changed").
    assert.equal(handled, true);
    assert.match(strip(app.message || ''), /settings\.json/, 'non-silent hint points at the editable file');
    assert.equal(settings.loadSettings(project).agents.maxParallelAgents, 2, 'number value untouched');
  });

  test('b exits settings mode', () => {
    // Arrange
    const tools = freshTools();
    const app = makeApp({ toolMode: '3' });

    // Act
    tools.handleKey(key('b'), app);

    // Assert
    assert.equal(app.toolMode, null);
  });
});

describe('tools.handleKey() unhandled input', () => {
  test('an unmapped key in the tools list returns false', () => {
    // Arrange
    const tools = freshTools();
    const app = makeApp();

    // Act — 'z' matches no branch → the trailing `return false`.
    const handled = tools.handleKey(key('z', 'z'), app);

    // Assert
    assert.equal(handled, false);
  });
});
