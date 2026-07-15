/**
 * Framework Detector — dark-branch coverage tests.
 *
 * Companion to tests/framework-detector.test.js. That file pins the shape
 * decisions that prior fixes hardened (Remix-over-react-vite override, the
 * "web only when launchable" bundler gate, config-file fallback, monorepo walk,
 * node_modules skip). THIS file aims exclusively at the branches that file
 * leaves dark, and every test is written to go RED under mutation of the exact
 * line it targets — not merely to raise line coverage.
 *
 * ZERO doubles: every case builds a real tiny project on disk under os.tmpdir()
 * and runs the real detector against it. Temp dirs are removed in afterEach.
 * node:assert/strict throughout.
 *
 * Human-reviewed: every assertion below was read line-by-line against the
 * production source; each pins a user-visible outcome (the returned shape / run
 * target / boolean), not a call sequence.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  FrameworkDetector,
  detectFramework
} = require('../src/lib/framework-detector');

/** Make a fresh temp project dir. */
function makeProject(prefix = 'framework-cov-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Remove a temp dir, best-effort. */
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

/** Write a file into a project dir (creating parent dirs as needed). */
function write(dir, name, content) {
  const full = path.join(dir, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/** Write package.json from an object. */
function writePkg(dir, obj) {
  write(dir, 'package.json', JSON.stringify(obj));
}

// ─────────────────────────────────────────────────────────────────────────────
// detect(): the >= 40 confidence FLOOR. A project whose ONLY signal is a `vite`
// devDependency (no framework dep, no config file) still produces a non-null
// bestMatch internally — vue scores 10 (its packageDevDeps list contains 'vite')
// and wins the priority walk over react-vite (also 10). detect() must still
// return null because 10 < 40. This kills a mutant that loosens `>= 40` to
// `>= 0` / `> 0` (which would leak the vue@10 match) and a mutant that drops the
// bestMatch guard.
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: a below-threshold match (score 10) is rejected, not returned', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-floor-'); });
  afterEach(() => { rm(dir); });

  it('a lone vite devDependency (no framework dep, no config) → null despite a non-null internal match', () => {
    // Arrange — vite devdep alone gives vue/react-vite a packageDevDeps score of 10.
    writePkg(dir, { devDependencies: { vite: '5.0.0' } });

    // Act
    const result = new FrameworkDetector(dir).detect();

    // Assert — 10 is below the 40 floor, so nothing ships.
    assert.equal(result, null);
  });

  it('a project just below the floor via a framework dep alone is still returned (40 is the boundary)', () => {
    // Arrange — a bare astro dep scores exactly 40 (packageDeps hit), the floor.
    writePkg(dir, { dependencies: { astro: '4.0.0' } });

    // Act
    const result = new FrameworkDetector(dir).detect();

    // Assert — 40 >= 40 passes the floor; boundary must be inclusive.
    assert.ok(result, 'confidence of exactly 40 must pass the >= 40 floor');
    assert.equal(result.id, 'astro');
    assert.equal(result.confidence, 40);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasViteSignal(): the individual `||` operands. The existing suite exercises
// only vite.config.ts and the `vite` devDep, each of which short-circuits the
// chain — leaving vite.config.js, vite.config.mjs and @vitejs/plugin-react dark.
// Each row below carries EXACTLY ONE Vite signal so the react-vite shape is
// rescued (from disqualification) by that operand alone; removing that operand
// from hasViteSignal() reds the row.
//
// vite.config.mjs is the sharpest: react-vite's OWN configFiles list is only
// ['vite.config.ts','vite.config.js'] — a .mjs config scores 0 there, so the
// match survives purely because hasViteSignal() recognises .mjs. Its confidence
// is 40 (dep only), proving the config file did not contribute score and only
// the guard kept it alive.
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: each isolated Vite signal rescues the react-vite shape', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-vite-'); });
  afterEach(() => { rm(dir); });

  it('react + only vite.config.js (no .ts) → react-vite', () => {
    // Arrange
    write(dir, 'vite.config.js', 'export default {}');
    writePkg(dir, { dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' } });

    // Act
    const result = new FrameworkDetector(dir).detect();

    // Assert
    assert.ok(result);
    assert.equal(result.id, 'react-vite');
  });

  it('react + only vite.config.mjs → react-vite, kept alive solely by hasViteSignal (confidence 40, no config score)', () => {
    // Arrange — react-vite's configFiles does NOT list .mjs, so score stays 40.
    write(dir, 'vite.config.mjs', 'export default {}');
    writePkg(dir, { dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' } });

    // Act
    const result = new FrameworkDetector(dir).detect();

    // Assert
    assert.ok(result, '.mjs config must not disqualify react-vite via the Vite gate');
    assert.equal(result.id, 'react-vite');
    assert.equal(result.confidence, 40, 'a .mjs config scores 0 for react-vite; only the dep (40) counts');
  });

  it('react + only @vitejs/plugin-react devDep (no vite dep, no config) → react-vite', () => {
    // Arrange — isolates the LAST operand of hasViteSignal, which the existing
    // "react + vite devDep" test never reaches (vite short-circuits first).
    writePkg(dir, {
      dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
      devDependencies: { '@vitejs/plugin-react': '^4.3.0' }
    });

    // Act
    const result = new FrameworkDetector(dir).detect();

    // Assert — dep 40 + @vitejs/plugin-react devdep 10 = 50.
    assert.ok(result);
    assert.equal(result.id, 'react-vite');
    assert.equal(result.confidence, 50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getPlaywrightConfig(): the `!framework` default branch. The existing suite
// only asserts the detected-framework config (Next.js). An unknown/no-framework
// project must yield the localhost:3000 / webServer:null / framework:'unknown'
// default. Kills a mutant that inverts the `!framework` guard or alters the
// default object.
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: getPlaywrightConfig default for an undetectable project', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-pw-'); });
  afterEach(() => { rm(dir); });

  it('a project with no framework → the unknown default config (no webServer)', () => {
    // Arrange — a non-web dependency; detect() returns null.
    writePkg(dir, { dependencies: { lodash: '4.0.0' } });

    // Act
    const config = new FrameworkDetector(dir).getPlaywrightConfig();

    // Assert — one subject: the default config shape.
    assert.deepEqual(config, {
      baseURL: 'http://localhost:3000',
      webServer: null,
      framework: 'unknown'
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// usesTypeScript(): the SECOND operand of the `||`. The existing suite only
// proves the tsconfig.json path (first operand true, short-circuits). The
// `typescript` dependency path is dark, and so is the all-false result.
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: usesTypeScript falls through to the typescript dependency', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-ts-'); });
  afterEach(() => { rm(dir); });

  it('typescript in devDependencies with NO tsconfig.json → true (second || operand)', () => {
    // Arrange — no tsconfig, so the first operand is false.
    writePkg(dir, { devDependencies: { typescript: '5.4.0' } });

    // Act + Assert
    assert.equal(new FrameworkDetector(dir).usesTypeScript(), true);
  });

  it('neither tsconfig.json nor a typescript dependency → false', () => {
    // Arrange
    writePkg(dir, { dependencies: { lodash: '4.0.0' } });

    // Act + Assert — pins that usesTypeScript is not vacuously true.
    assert.equal(new FrameworkDetector(dir).usesTypeScript(), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTestDirectory(): the no-framework fallback. The existing suite only proves
// the framework-specific map (angular → 'e2e'). When detect() returns null the
// method scans commonDirs, and finally defaults to 'e2e'. Both are dark.
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: getTestDirectory fallback when no framework is detected', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-td-'); });
  afterEach(() => { rm(dir); });

  it('no framework but an existing test/ directory → returns the discovered dir, not the default', () => {
    // Arrange — non-web project (detect() null) with only a `test` dir present.
    writePkg(dir, { dependencies: { lodash: '4.0.0' } });
    fs.mkdirSync(path.join(dir, 'test'));

    // Act
    const result = new FrameworkDetector(dir).getTestDirectory();

    // Assert — commonDirs order is [e2e, tests/e2e, test/e2e, tests, test];
    // only `test` exists, so the scan must return it.
    assert.equal(result, 'test');
  });

  it('no framework and no test directories → the e2e default', () => {
    // Arrange
    writePkg(dir, { dependencies: { lodash: '4.0.0' } });

    // Act + Assert — the final fallthrough.
    assert.equal(new FrameworkDetector(dir).getTestDirectory(), 'e2e');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasDependency(): the SECOND `||` operand (devDependencies). The existing suite
// covers dependencies (obvious), peerDependencies and optionalDependencies
// (FINDING 5), but never a dep found ONLY in devDependencies via hasDependency.
// Proven both directly and end-to-end through detect().
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: hasDependency reads the devDependencies map', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-dep-'); });
  afterEach(() => { rm(dir); });

  it('a dependency present only in devDependencies is seen by hasDependency', () => {
    // Arrange
    writePkg(dir, { devDependencies: { 'some-lib': '1.0.0' } });

    // Act + Assert — second operand of the || chain.
    assert.equal(new FrameworkDetector(dir).hasDependency('some-lib'), true);
  });

  it('a framework whose package dep sits in devDependencies still drives detection', () => {
    // Arrange — `next` in devDependencies + config file → hasDependency('next')
    // must resolve via the devDependencies operand for the +40 to land.
    write(dir, 'next.config.js', 'module.exports = {}');
    writePkg(dir, { devDependencies: { next: '15.0.0' } });

    // Act
    const result = detectFramework(dir);

    // Assert — config 50 + dep-via-devDeps 40 = 90.
    assert.ok(result);
    assert.equal(result.id, 'nextjs');
    assert.equal(result.confidence, 90);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectAll(): the hidden-directory skip via `!entry.name.startsWith('.')`. A
// `.secret` dir is NOT a member of EXCLUDED_MEMBER_DIRS, so ONLY the dotfile
// guard can skip it. It carries a full, valid framework layout: if the guard is
// removed the walk descends and surfaces `apps/.secret` as a bogus member. The
// sibling real member proves the walk is otherwise working.
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: detectAll skips dot-directories that are not in the excluded set', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-dot-'); });
  afterEach(() => { rm(dir); });

  it('a valid framework inside apps/.secret is skipped by the startsWith(".") guard', () => {
    // Arrange — a legitimate member and a dot-dir member with identical contents.
    write(dir, path.join('apps', 'real', 'next.config.js'), 'module.exports = {}');
    write(dir, path.join('apps', 'real', 'package.json'), JSON.stringify({ dependencies: { next: '^15.0.0', react: '^18' } }));
    write(dir, path.join('apps', '.secret', 'next.config.js'), 'module.exports = {}');
    write(dir, path.join('apps', '.secret', 'package.json'), JSON.stringify({ dependencies: { next: '^15.0.0', react: '^18' } }));

    // Act
    const members = new FrameworkDetector(dir).detectAll();

    // Assert — real member surfaces; the dot-dir does not.
    assert.ok(
      members.some((m) => m.path === path.join('apps', 'real')),
      'the ordinary member must be surfaced'
    );
    assert.ok(
      !members.some((m) => m.path === path.join('apps', '.secret')),
      `a dot-directory must never be surfaced as a workspace member; got ${JSON.stringify(members.map((m) => m.path))}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectAll(): the ROOT-member push. Every existing detectAll test uses a
// monorepo whose root has no framework of its own, so the `if (rootFramework)`
// push at the top of detectAll is dark. A single-package web app at the root
// must appear as the '.' member. Kills a mutant that drops the root push.
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: detectAll includes the root when the root is itself a web app', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-root-'); });
  afterEach(() => { rm(dir); });

  it('a root Next.js app appears as the "." member', () => {
    // Arrange — a plain single-package app, framework at the root.
    write(dir, 'next.config.js', 'module.exports = {}');
    writePkg(dir, { dependencies: { next: '^15.0.0', react: '^18' } });

    // Act
    const members = new FrameworkDetector(dir).detectAll();

    // Assert — the root itself is the surfaced member.
    const root = members.find((m) => m.path === '.');
    assert.ok(root, `detectAll must surface the root app; got ${JSON.stringify(members.map((m) => m.path))}`);
    assert.equal(root.id, 'nextjs');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectAll(): a monorepo location NAME that resolves to a FILE, and a FILE
// entry inside a location dir. These are robustness paths (the try/catch and the
// isDirectory guards keep the walk from throwing); the guard removal is masked
// by the surrounding catch so this is a line-coverage + no-crash test, not a
// mutation kill — labelled honestly.
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: detectAll tolerates non-directory names on the walk', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-file-'); });
  afterEach(() => { rm(dir); });

  it('a plain file named like a monorepo location (web) and a file entry inside apps are ignored', () => {
    // Arrange — `web` is a monorepo location name but here it is a FILE, and
    // apps/README.md is a file entry alongside a real member.
    write(dir, 'web', 'not a directory');
    write(dir, path.join('apps', 'README.md'), '# docs');
    write(dir, path.join('apps', 'site', 'nuxt.config.ts'), 'export default {}');
    write(dir, path.join('apps', 'site', 'package.json'), JSON.stringify({ dependencies: { nuxt: '^3.0.0' } }));

    // Act — must not throw on the file-as-location or the file entry.
    const members = new FrameworkDetector(dir).detectAll();

    // Assert — only the genuine directory member is surfaced.
    assert.ok(members.some((m) => m.path === path.join('apps', 'site') && m.id === 'nuxt'));
    assert.ok(!members.some((m) => m.path === 'web'));
    assert.ok(!members.some((m) => m.path === path.join('apps', 'README.md')));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateConfidence(): the `checks > 0 ? ... : 0` ternary. Its false arm is
// unreachable through detect() (every entry in FRAMEWORKS declares packageDeps,
// so `checks` is always >= 1). calculateConfidence is a public method, so the
// zero-marker contract is pinned directly. Also pins the config-file +50 weight
// and the >= 40 shape so a weight mutation is caught at the unit level.
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: calculateConfidence scoring contract', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-conf-'); });
  afterEach(() => { rm(dir); });

  it('a framework definition with NO markers scores 0 (checks === 0 arm)', () => {
    // Arrange
    writePkg(dir, { dependencies: {} });
    const detector = new FrameworkDetector(dir);

    // Act + Assert — the ternary's false arm; a mutant returning 100 here reds.
    assert.equal(detector.calculateConfidence({}), 0);
  });

  it('a present config file contributes exactly 50', () => {
    // Arrange
    write(dir, 'my.config.js', '// present');
    writePkg(dir, { dependencies: {} });
    const detector = new FrameworkDetector(dir);

    // Act
    const score = detector.calculateConfidence({ configFiles: ['absent.js', 'my.config.js'] });

    // Assert — the loop must find the second entry and add 50 once.
    assert.equal(score, 50);
  });

  it('a config file that is absent contributes 0 (the fileExists guard, not the mere presence of configFiles)', () => {
    // Arrange — configFiles declared but none on disk.
    writePkg(dir, { dependencies: {} });
    const detector = new FrameworkDetector(dir);

    // Act + Assert — kills a mutant that scores on configFiles presence alone.
    assert.equal(detector.calculateConfidence({ configFiles: ['nope.js'] }), 0);
  });
});
