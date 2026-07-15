/**
 * Framework Detector Tests
 * Tests for web framework auto-detection.
 *
 * ZERO doubles: every case builds a REAL tiny project on disk in os.tmpdir()
 * and runs the real detector against it. Ported to node:test so every case is a
 * discrete, gate-visible assertion (the old single-function runner reported the
 * whole file as one pass/fail and raced process.exit).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  FrameworkDetector,
  FRAMEWORKS,
  detectFramework,
  isWebApplication
} = require('../src/lib/framework-detector');

/** Make a fresh temp project dir. */
function makeProject(prefix = 'framework-test-') {
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

// ─────────────────────────────────────────────────────────────────────────────
// Ported baseline behaviour (previously a bespoke runner).
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: baseline detection', () => {
  let dir;
  beforeEach(() => { dir = makeProject(); });
  afterEach(() => { rm(dir); });

  it('FrameworkDetector is instantiable', () => {
    const detector = new FrameworkDetector(dir);
    assert.ok(detector, 'FrameworkDetector should be instantiable');
  });

  it('FRAMEWORKS constant contains the expected frameworks', () => {
    assert.ok(FRAMEWORKS, 'FRAMEWORKS should exist');
    for (const id of ['nextjs', 'vue', 'svelte', 'angular', 'astro', 'remix', 'react-vite', 'react-cra']) {
      assert.ok(FRAMEWORKS[id], `Should have ${id} framework`);
    }
  });

  it('detects Next.js by config file + dependency', () => {
    write(dir, 'next.config.js', 'module.exports = {}');
    write(dir, 'package.json', JSON.stringify({ dependencies: { next: '14.0.0', react: '18.0.0' } }));
    const result = new FrameworkDetector(dir).detect();
    assert.ok(result, 'Should detect a framework');
    assert.strictEqual(result.id, 'nextjs');
    assert.ok(result.confidence >= 40, 'Confidence should be at least 40');
  });

  it('detects Vue by dependency + vite config', () => {
    write(dir, 'vite.config.ts', 'export default {}');
    write(dir, 'package.json', JSON.stringify({ dependencies: { vue: '3.0.0' }, devDependencies: { vite: '5.0.0' } }));
    const result = new FrameworkDetector(dir).detect();
    assert.ok(result);
    assert.strictEqual(result.id, 'vue');
  });

  it('detects Angular by angular.json', () => {
    write(dir, 'angular.json', '{}');
    write(dir, 'package.json', JSON.stringify({ dependencies: { '@angular/core': '17.0.0' } }));
    const result = new FrameworkDetector(dir).detect();
    assert.ok(result);
    assert.strictEqual(result.id, 'angular');
  });

  it('returns null when no framework detected', () => {
    write(dir, 'package.json', JSON.stringify({ dependencies: { lodash: '4.0.0' } }));
    assert.strictEqual(new FrameworkDetector(dir).detect(), null);
  });

  it('isWebApp true for a React project', () => {
    write(dir, 'package.json', JSON.stringify({ dependencies: { react: '18.0.0' } }));
    assert.strictEqual(new FrameworkDetector(dir).isWebApp(), true);
  });

  it('isWebApp false for an Express-only project', () => {
    write(dir, 'package.json', JSON.stringify({ dependencies: { express: '4.0.0' } }));
    assert.strictEqual(new FrameworkDetector(dir).isWebApp(), false);
  });

  it('usesTypeScript detects TypeScript', () => {
    write(dir, 'tsconfig.json', '{}');
    write(dir, 'package.json', JSON.stringify({ dependencies: {} }));
    assert.strictEqual(new FrameworkDetector(dir).usesTypeScript(), true);
  });

  it('getPlaywrightConfig returns correct config for the framework', () => {
    write(dir, 'next.config.js', 'module.exports = {}');
    write(dir, 'package.json', JSON.stringify({ dependencies: { next: '14.0.0' } }));
    const config = new FrameworkDetector(dir).getPlaywrightConfig();
    assert.strictEqual(config.baseURL, 'http://localhost:3000');
    assert.ok(config.webServer);
    assert.strictEqual(config.webServer.command, 'npm run dev');
  });

  it('detectFramework helper works', () => {
    write(dir, 'svelte.config.js', 'export default {}');
    write(dir, 'package.json', JSON.stringify({ dependencies: { svelte: '4.0.0' }, devDependencies: { '@sveltejs/kit': '2.0.0' } }));
    const result = detectFramework(dir);
    assert.ok(result);
    assert.strictEqual(result.id, 'svelte');
  });

  it('isWebApplication helper works', () => {
    write(dir, 'package.json', JSON.stringify({ dependencies: { vue: '3.0.0' } }));
    assert.strictEqual(isWebApplication(dir), true);
  });

  it('getTestDirectory returns a framework-specific directory', () => {
    write(dir, 'angular.json', '{}');
    write(dir, 'package.json', JSON.stringify({ dependencies: { '@angular/core': '17.0.0' } }));
    assert.strictEqual(new FrameworkDetector(dir).getTestDirectory(), 'e2e');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FINDING 1 — Remix moved to Vite in v2 (2024). A modern Remix app has
// vite.config.ts + @remix-run/dev and NO remix.config.js, so it scores 100 as a
// generic react-vite SPA (config 50 + react 40 + vite devdep 10) while remix
// scored only 40. Detected as react-vite ⇒ the framework-security checker runs a
// client-only React SPA profile and SKIPS Remix's server surface (loaders,
// actions, session cookies, CSRF), and the run strategy is wrong. A Remix app
// must detect as `remix`.
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: a Remix v2 (Vite) layout detects as remix, not react-vite (FINDING 1)', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-remix-'); });
  afterEach(() => { rm(dir); });

  it('vite.config.ts + @remix-run/* deps, NO remix.config.js → remix', () => {
    write(dir, 'vite.config.ts', 'export default {}');
    write(dir, 'package.json', JSON.stringify({
      dependencies: {
        '@remix-run/node': '^2.11.0',
        '@remix-run/react': '^2.11.0',
        '@remix-run/serve': '^2.11.0',
        react: '^18.3.1',
        'react-dom': '^18.3.1'
      },
      devDependencies: {
        '@remix-run/dev': '^2.11.0',
        vite: '^5.4.0'
      }
    }));
    const result = new FrameworkDetector(dir).detect();
    assert.ok(result, 'a Remix v2 app must detect a framework');
    assert.strictEqual(result.id, 'remix', 'a Remix v2 Vite app must be remix, not react-vite');
  });

  it('minimal Remix v2 (vite.config.ts + only @remix-run/dev, no remix.config.js) → remix', () => {
    write(dir, 'vite.config.ts', 'export default {}');
    write(dir, 'package.json', JSON.stringify({
      dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
      devDependencies: { '@remix-run/dev': '^2.11.0', vite: '^5.4.0' }
    }));
    const result = new FrameworkDetector(dir).detect();
    assert.ok(result);
    assert.strictEqual(result.id, 'remix', 'the presence of @remix-run/dev makes this Remix, not react-vite');
  });

  it('classic Remix v1 (remix.config.js + @remix-run/react) still → remix', () => {
    write(dir, 'remix.config.js', 'module.exports = {}');
    write(dir, 'package.json', JSON.stringify({
      dependencies: { '@remix-run/react': '^1.19.0', '@remix-run/node': '^1.19.0', react: '^18' }
    }));
    const result = new FrameworkDetector(dir).detect();
    assert.ok(result);
    assert.strictEqual(result.id, 'remix');
  });

  it('REGRESSION: a plain React+Vite app (no @remix-run/*) still → react-vite', () => {
    write(dir, 'vite.config.ts', 'export default {}');
    write(dir, 'package.json', JSON.stringify({
      dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
      devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.0' }
    }));
    const result = new FrameworkDetector(dir).detect();
    assert.ok(result);
    assert.strictEqual(result.id, 'react-vite', 'a plain React+Vite SPA must stay react-vite');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FINDING 3 — a bare `react` dependency with NO Vite evidence scored exactly 40
// and was classified react-vite, handing back Vite's run strategy (port 5173,
// `npm run preview`) for a project that has no Vite. react-vite must require a
// Vite signal (a vite.config.* file OR a vite/@vitejs devDep); react-cra must
// require react-scripts. Without bundler evidence a bare react dep falls through
// to a generic/unknown React shape.
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: a bare react dep with no bundler is NOT react-vite (FINDING 3)', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-barereact-'); });
  afterEach(() => { rm(dir); });

  it('react + react-dom, no vite config and no vite/@vitejs devDep → NOT react-vite', () => {
    write(dir, 'package.json', JSON.stringify({ dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' } }));
    const result = new FrameworkDetector(dir).detect();
    assert.ok(!result || result.id !== 'react-vite',
      `a bare react dep must not be react-vite; got ${result && result.id}`);
    assert.ok(!result || result.id !== 'react-cra',
      `a bare react dep must not be react-cra either; got ${result && result.id}`);
  });

  it('REGRESSION: react + vite.config.ts → react-vite', () => {
    write(dir, 'vite.config.ts', 'export default {}');
    write(dir, 'package.json', JSON.stringify({ dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' } }));
    const result = new FrameworkDetector(dir).detect();
    assert.ok(result);
    assert.strictEqual(result.id, 'react-vite');
  });

  it('REGRESSION: react + vite devDep (no config file yet) → react-vite', () => {
    write(dir, 'package.json', JSON.stringify({
      dependencies: { react: '^18.3.1' },
      devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.0' }
    }));
    const result = new FrameworkDetector(dir).detect();
    assert.ok(result);
    assert.strictEqual(result.id, 'react-vite');
  });

  it('REGRESSION: a real Create React App (react + react-scripts) still → react-cra', () => {
    write(dir, 'package.json', JSON.stringify({
      dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
      devDependencies: { 'react-scripts': '5.0.1' }
    }));
    const result = new FrameworkDetector(dir).detect();
    assert.ok(result);
    assert.strictEqual(result.id, 'react-cra');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FINDING 5 — fail-open under-detection feeding a security router.
// (a) A malformed package.json made loadPackageJson return null and detect()
//     early-returned null EVEN with next.config.js present → a real web app read
//     as no-framework, security silently skipped. Fall back to config-file
//     presence.
// (b) hasDependency read only dependencies+devDependencies, missing peer/optional
//     dependencies. Include them.
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: robust under-detection guards (FINDING 5)', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-robust-'); });
  afterEach(() => { rm(dir); });

  it('malformed package.json + next.config.js → nextjs (config-file fallback)', () => {
    write(dir, 'package.json', '{ this is : not valid json ,,, }');
    write(dir, 'next.config.js', 'module.exports = {}');
    const result = new FrameworkDetector(dir).detect();
    assert.ok(result, 'a broken package.json must NOT make a real web app read as no-framework');
    assert.strictEqual(result.id, 'nextjs');
  });

  it('malformed package.json + angular.json → angular (config-file fallback)', () => {
    write(dir, 'package.json', 'not json at all');
    write(dir, 'angular.json', '{}');
    const result = new FrameworkDetector(dir).detect();
    assert.ok(result);
    assert.strictEqual(result.id, 'angular');
  });

  it('a framework declared only in peerDependencies is detected', () => {
    write(dir, 'vite.config.ts', 'export default {}');
    write(dir, 'package.json', JSON.stringify({ peerDependencies: { react: '^18.0.0' } }));
    const detector = new FrameworkDetector(dir);
    assert.strictEqual(detector.hasDependency('react'), true, 'peerDependencies must count');
    const result = detector.detect();
    assert.ok(result);
    assert.strictEqual(result.id, 'react-vite');
  });

  it('a framework declared only in optionalDependencies is detected', () => {
    write(dir, 'vite.config.ts', 'export default {}');
    write(dir, 'package.json', JSON.stringify({ optionalDependencies: { vue: '^3.0.0' } }));
    const detector = new FrameworkDetector(dir);
    assert.strictEqual(detector.hasDependency('vue'), true, 'optionalDependencies must count');
    const result = detector.detect();
    assert.ok(result);
    assert.strictEqual(result.id, 'vue');
  });

  it('isWebApp sees a framework in peerDependencies', () => {
    write(dir, 'package.json', JSON.stringify({ peerDependencies: { react: '^18.0.0' } }));
    assert.strictEqual(new FrameworkDetector(dir).isWebApp(), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FINDING 2 (support) — detectAll must find the web member of a monorepo. In a
// workspace/monorepo the framework dep lives in apps/web, not root, so a root-only
// detect returns null. detectAll() walks apps/packages/* and finds the web member.
// This proves the previously-DEAD detectAll surfaces the member; app-runner wires
// it (see tests/app-runner.test.js: detectAppShape monorepo → 'web').
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: detectAll finds the web member of a monorepo (FINDING 2)', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-monorepo-'); });
  afterEach(() => { rm(dir); });

  it('turbo monorepo with apps/web/next.config.js → detectAll surfaces the nextjs member', () => {
    write(dir, 'package.json', JSON.stringify({
      name: 'monorepo-root', private: true, workspaces: ['apps/*'],
      scripts: { dev: 'turbo dev', build: 'turbo build' },
      devDependencies: { turbo: '^2.0.0' }
    }));
    write(dir, path.join('apps', 'web', 'next.config.js'), 'module.exports = {}');
    write(dir, path.join('apps', 'web', 'package.json'), JSON.stringify({
      name: 'web', dependencies: { next: '^15.0.0', react: '^18', 'react-dom': '^18' }
    }));

    const detector = new FrameworkDetector(dir);
    assert.strictEqual(detector.detect(), null, 'the monorepo ROOT has no web framework of its own');

    const members = detector.detectAll();
    const web = members.find((m) => m.id === 'nextjs');
    assert.ok(web, `detectAll must surface the apps/web nextjs member; got ${JSON.stringify(members.map((m) => ({ path: m.path, id: m.id })))}`);
    assert.strictEqual(web.path, path.join('apps', 'web'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectAll must SKIP node_modules (and other excluded dirs). The monorepo walk
// instantiated a detector for EVERY immediate child of apps/packages/… including a
// node_modules dir — that is a per-installed-package detector (a performance cost)
// and a latent false positive (an installed package that itself carries a framework
// config would be surfaced as a bogus "workspace member").
// ─────────────────────────────────────────────────────────────────────────────
describe('framework-detector: detectAll skips node_modules (perf + false positives)', () => {
  let dir;
  beforeEach(() => { dir = makeProject('framework-nm-'); });
  afterEach(() => { rm(dir); });

  it('does not descend into packages/node_modules (an installed package is not a workspace member)', () => {
    // A genuine workspace member:
    write(dir, path.join('packages', 'frontend', 'next.config.js'), 'module.exports = {}');
    write(dir, path.join('packages', 'frontend', 'package.json'), JSON.stringify({
      name: 'frontend', dependencies: { next: '^15.0.0', react: '^18' }
    }));
    // An installed dependency that itself carries a framework config — must be ignored:
    write(dir, path.join('packages', 'node_modules', 'next.config.js'), 'module.exports = {}');
    write(dir, path.join('packages', 'node_modules', 'package.json'), JSON.stringify({
      name: 'installed-next', dependencies: { next: '^15.0.0' }
    }));

    const members = new FrameworkDetector(dir).detectAll();
    assert.ok(
      members.some((m) => m.path === path.join('packages', 'frontend')),
      'the real workspace member must still be surfaced'
    );
    assert.ok(
      !members.some((m) => m.path === path.join('packages', 'node_modules')),
      `detectAll must NOT surface an installed package under node_modules; got ${JSON.stringify(members.map((m) => m.path))}`
    );
  });
});
