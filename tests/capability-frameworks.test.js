'use strict';

/**
 * THE FRAMEWORKS CAPABILITY DIMENSION — wave 1 (data + enrichment + live wiring).
 *
 * Mirrors the databases sub-program EXACTLY. A framework's capability data
 * (category + language + security concerns + config scaffold) lives in the registry
 * as 18 web-grounded 2026 YAMLs; stack-detector enriches a detected framework with
 * that record and detectStack surfaces it as an ADDITIVE `frameworkCapabilities`
 * field (the legacy `frameworks: string[]` shape is untouched). This wave proves
 * three things end to end:
 *
 *   • DATA — all 18 framework YAMLs load with ZERO warnings and carry category,
 *     language, security.concerns and configScaffold.
 *   • ENRICHMENT — a project's deps/config markers map each framework to its
 *     capability (a `next` dep → nextjs enriched with its security concerns; a
 *     manage.py/django project → django enriched).
 *   • WIRING — detectStack gains an additive `frameworkCapabilities` field; the
 *     existing `frameworks` (string[]) and `languages` are UNCHANGED (wired-is-done:
 *     the registry data flows registry → stack-detector → detectStack → SessionStart,
 *     never dead).
 *
 * ZERO DOUBLES: every case builds a REAL project dir on disk and reads the REAL
 * bundled seed YAML. Nothing is mocked.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../src/lib/capability-registry');
const stackDetector = require('../src/lib/stack-detector');

const THE_18 = [
  'nextjs', 'react', 'vue', 'angular', 'svelte', 'astro', 'nuxt', 'remix',
  'express', 'nestjs', 'fastify',
  'django', 'fastapi', 'flask',
  'rails', 'laravel', 'spring-boot', 'phoenix'
];
const ALLOWED_VERIFIED = new Set(['web-2026-07', 'UNVERIFIED']);
const ALLOWED_CATEGORY = new Set(['web-frontend', 'web-backend', 'web-fullstack', 'api', 'test']);

/** Make a fresh temp project dir. */
function makeProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** Remove a temp dir, best-effort. */
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
/** Write a file into a project, creating parent dirs. */
function writeFile(dir, name, body) {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

describe('frameworks: loadFrameworks() — data-driven, fail-open', () => {
  it('loads all 18 bundled frameworks with ZERO warnings', () => {
    const reg = registry.loadFrameworks();
    assert.ok(reg && typeof reg === 'object', 'loadFrameworks must return an object');
    assert.ok(reg.frameworks && typeof reg.frameworks === 'object', 'must return a frameworks map');
    for (const fw of THE_18) {
      assert.ok(reg.frameworks[fw], `bundled data must include ${fw}`);
    }
    assert.ok(Array.isArray(reg.warnings), 'must expose a warnings array');
    assert.deepEqual(reg.warnings, [], 'the shipped seed data must load with zero warnings');
  });

  it('every framework carries category, language, security.concerns and configScaffold', () => {
    const { frameworks } = registry.loadFrameworks();
    for (const name of THE_18) {
      const fw = frameworks[name];
      assert.equal(fw.framework, name, `${name}: framework key must match filename`);
      assert.ok(ALLOWED_CATEGORY.has(fw.category), `${name}: category must be a known token (got ${fw.category})`);
      assert.ok(typeof fw.language === 'string' && fw.language.length > 0, `${name}: language required`);
      assert.ok(fw.security && typeof fw.security === 'object', `${name}: must carry a security object`);
      assert.ok(Array.isArray(fw.security.concerns) && fw.security.concerns.length > 0,
        `${name}: security.concerns must be a non-empty array`);
      assert.ok(Array.isArray(fw.configScaffold) && fw.configScaffold.length > 0,
        `${name}: configScaffold must be a non-empty array`);
      assert.ok(typeof fw.test === 'string' && fw.test.length > 0, `${name}: test hint required`);
      assert.ok(Array.isArray(fw.deps) && fw.deps.length > 0,
        `${name}: deps must be a non-empty array (enrichment depends on it)`);
      assert.ok(ALLOWED_VERIFIED.has(fw.verified),
        `${name}: verified must be web-2026-07 or UNVERIFIED (got ${fw.verified})`);
    }
  });

  it('a malformed override is SKIPPED + warned; valid ones still load', () => {
    const dir = makeProject('ctoc-fw-bad-');
    try {
      writeFile(dir, '.ctoc/capabilities/frameworks/broken.yaml', ':::not yaml at all\n\t- [unclosed\n');
      writeFile(dir, '.ctoc/capabilities/frameworks/solid.yaml',
        'framework: solid\n' +
        'category: web-frontend\n' +
        'language: typescript\n' +
        'deps: [solid-js]\n' +
        'files: [vite.config.ts]\n' +
        'security:\n' +
        '  concerns: [xss, env-exposure]\n' +
        'test: "vitest"\n' +
        'configScaffold: [vite.config.ts, .env.example]\n' +
        'verified: UNVERIFIED\n');
      const reg = registry.loadFrameworks(dir);
      assert.ok(reg.frameworks.solid, 'the valid override must load');
      assert.ok(reg.frameworks.nextjs, 'bundled frameworks must still load alongside overrides');
      assert.ok(reg.warnings.length >= 1, 'the malformed entry must warn');
      assert.ok(reg.warnings.some((w) => /broken\.yaml/.test(JSON.stringify(w))), 'the warning must name the offending file');
    } finally { rm(dir); }
  });
});

describe('frameworks: frameworkCapability(name)', () => {
  it('returns the full capability for a known framework, null for unknown', () => {
    const next = registry.frameworkCapability('nextjs');
    assert.ok(next, 'nextjs must resolve');
    assert.equal(next.category, 'web-fullstack');
    assert.ok(Array.isArray(next.security.concerns) && next.security.concerns.length > 0, 'nextjs carries concerns');
    assert.equal(registry.frameworkCapability('no-such-framework'), null, 'unknown framework resolves to null');
  });
});

describe('frameworks: frameworkCapabilities() — enriched from deps/markers', () => {
  it('a package.json with `next` enriches nextjs with its security concerns', () => {
    const dir = makeProject('ctoc-fw-next-');
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'x', dependencies: { next: '^15.0.0' } }));
      const fcs = stackDetector.frameworkCapabilities(dir);
      const next = fcs.find((f) => f.name === 'nextjs');
      assert.ok(next, 'must enrich nextjs from the `next` dependency');
      assert.equal(next.category, 'web-fullstack');
      assert.equal(next.language, 'typescript');
      assert.ok(Array.isArray(next.security.concerns) && next.security.concerns.length > 0, 'nextjs concerns present');
    } finally { rm(dir); }
  });

  it('a manage.py + django requirement enriches django', () => {
    const dir = makeProject('ctoc-fw-django-');
    try {
      writeFile(dir, 'requirements.txt', 'django==5.0\n');
      writeFile(dir, 'manage.py', '#!/usr/bin/env python\n');
      const fcs = stackDetector.frameworkCapabilities(dir);
      const dj = fcs.find((f) => f.name === 'django');
      assert.ok(dj, 'must enrich django from manage.py / django requirement');
      assert.equal(dj.category, 'web-fullstack');
      assert.equal(dj.language, 'python');
      assert.ok(dj.security.concerns.includes('csrf'), 'django carries csrf as a concern');
    } finally { rm(dir); }
  });

  it('returns an empty array for a project with no framework deps/markers', () => {
    const dir = makeProject('ctoc-fw-empty-');
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'x', dependencies: { lodash: '^4.0.0' } }));
      const fcs = stackDetector.frameworkCapabilities(dir);
      assert.deepEqual(fcs, [], 'no framework deps/markers → empty array');
    } finally { rm(dir); }
  });
});

describe('frameworks: detectStack adds `frameworkCapabilities` ADDITIVELY', () => {
  it('a next + tsconfig project keeps frameworks/languages and gains frameworkCapabilities', () => {
    const dir = makeProject('ctoc-fw-stack-');
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'x', dependencies: { next: '^15.0.0', react: '^18.0.0' } }));
      writeFile(dir, 'tsconfig.json', '{}');
      const stack = stackDetector.detectStack(dir);

      // Existing contract UNCHANGED.
      assert.ok(Array.isArray(stack.languages), 'languages preserved');
      assert.ok(stack.languages.includes('typescript'), 'typescript still detected');
      assert.ok(Array.isArray(stack.frameworks), 'frameworks preserved (string[])');
      assert.ok(stack.frameworks.every((f) => typeof f === 'string'), 'frameworks stays a string[]');
      assert.ok(stack.frameworks.includes('next.js'), 'legacy next.js name still in frameworks[]');
      assert.ok(stack.primary && 'language' in stack.primary && 'framework' in stack.primary, 'primary preserved');

      // Additive field.
      assert.ok(Array.isArray(stack.frameworkCapabilities), 'detectStack gains a frameworkCapabilities array');
      assert.ok(stack.frameworkCapabilities.some((f) => f.name === 'nextjs'), 'nextjs present in stack.frameworkCapabilities');
    } finally { rm(dir); }
  });

  it('a django project keeps languages and gains django in frameworkCapabilities', () => {
    const dir = makeProject('ctoc-fw-stack-dj-');
    try {
      writeFile(dir, 'requirements.txt', 'django==5.0\n');
      writeFile(dir, 'manage.py', '#!/usr/bin/env python\n');
      const stack = stackDetector.detectStack(dir);
      assert.ok(stack.languages.includes('python'), 'python still detected');
      assert.ok(stack.frameworks.includes('django'), 'django still in frameworks[] (string)');
      assert.ok(Array.isArray(stack.frameworkCapabilities), 'frameworkCapabilities is an array');
      assert.ok(stack.frameworkCapabilities.some((f) => f.name === 'django'), 'django enriched in frameworkCapabilities');
    } finally { rm(dir); }
  });

  it('a project with no framework deps still returns frameworkCapabilities: []', () => {
    const dir = makeProject('ctoc-fw-stack-empty-');
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'x', dependencies: { lodash: '^4.0.0' } }));
      const stack = stackDetector.detectStack(dir);
      assert.ok(Array.isArray(stack.frameworkCapabilities), 'frameworkCapabilities is always an array');
      assert.deepEqual(stack.frameworkCapabilities, [], 'no framework deps → empty frameworkCapabilities');
    } finally { rm(dir); }
  });
});
