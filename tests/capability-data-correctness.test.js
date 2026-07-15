'use strict';

/**
 * CAPABILITY DATA CORRECTNESS — an adversarial review of the shipped capability DATA
 * found 7 real defects that produce WRONG or FAILING pipelines (the registry returns
 * the static command string verbatim; a command that ERRORS as written is a broken
 * phase, not a phase result). Each test below reproduces the CORRECT post-fix data.
 *
 * Every claim is WEB-VERIFIED (July 2026) or honestly flagged UNVERIFIED — never
 * fabricated. A linter is never dressed up as a SAST.
 *
 * ZERO DOUBLES: every filesystem case builds a REAL project dir on disk and reads the
 * REAL bundled seed YAML through the real engine. Nothing is mocked.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../src/lib/capability-registry');

/** Make a fresh temp project dir. */
function makeProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** Remove a temp dir, best-effort. */
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('DEF 1: commands that ERROR as written are fixed or made honest', () => {
  it('c + cpp security is `cppcheck --enable=all .` — cppcheck REQUIRES a path (matches bandit -r .)', () => {
    for (const lang of ['c', 'cpp']) {
      const sec = registry.toolchainFor(lang, 'security');
      assert.ok(sec, `${lang} must declare a security phase`);
      assert.equal(sec.cmd, 'cppcheck --enable=all .',
        `${lang} security must give cppcheck a path — a bare \`cppcheck --enable=all\` errors "no C or C++ source files found"`);
      assert.equal(sec.verified, 'web-2026-07', `${lang} cppcheck-with-path is web-verified`);
    }
  });

  it('c + cpp lint (clang-tidy) is HONEST: needs a compile database → UNVERIFIED, with a standalone cppcheck altCmd', () => {
    for (const lang of ['c', 'cpp']) {
      const lint = registry.toolchainFor(lang, 'lint');
      assert.ok(lint, `${lang} must declare a lint phase`);
      assert.equal(lint.tool, 'clang-tidy', `${lang} lint tool stays clang-tidy`);
      // A bare `clang-tidy` errors "no input files"; the honest form documents the
      // compile-database requirement via -p and is flagged UNVERIFIED (compile_commands.json
      // may not exist in an arbitrary repo).
      assert.match(lint.cmd, /clang-tidy -p /,
        `${lang} lint must document the compile-database requirement (-p), never a bare clang-tidy that errors`);
      assert.equal(lint.verified, 'UNVERIFIED',
        `${lang} clang-tidy cannot run zero-config — its lint claim must be UNVERIFIED`);
      assert.equal(lint.altCmd, 'cppcheck --enable=all .',
        `${lang} lint must offer cppcheck as the zero-config standalone alternative`);
    }
  });

  it('objectivec lint + security are HONEST: OCLint needs a compile DB → UNVERIFIED (no bare oclint that errors)', () => {
    for (const phase of ['lint', 'security']) {
      const entry = registry.toolchainFor('objectivec', phase);
      assert.ok(entry, `objectivec must declare a ${phase} phase`);
      assert.equal(entry.tool, 'oclint', `objectivec ${phase} tool is oclint`);
      // OCLint needs a compile-command database + files; the honest form is the
      // oclint-json-compilation-database wrapper, flagged UNVERIFIED.
      assert.match(entry.cmd, /oclint-json-compilation-database/,
        `objectivec ${phase} must use the compile-DB wrapper, never a bare oclint that errors`);
      assert.equal(entry.verified, 'UNVERIFIED',
        `objectivec ${phase} (OCLint needs a compile DB) must be UNVERIFIED`);
    }
  });

  it('c test (ctest) is HONEST: it needs a configured build dir → --test-dir build, UNVERIFIED', () => {
    const t = registry.toolchainFor('c', 'test');
    assert.ok(t, 'c must declare a test phase');
    assert.equal(t.tool, 'ctest', 'c test tool is ctest');
    assert.match(t.cmd, /ctest --test-dir/,
      'a bare `ctest` in the project root reports "No tests were found" — it needs a configured build dir');
    assert.equal(t.verified, 'UNVERIFIED',
      'ctest requires a pre-configured build directory that may not exist — UNVERIFIED');
  });
});

describe('DEF 2: osv-scanner is the consistent v2 `scan` CLI across every file', () => {
  it('c + cpp depsAudit use the v2 `osv-scanner scan -r .` (the flat `osv-scanner -r .` is superseded v1)', () => {
    for (const lang of ['c', 'cpp']) {
      const dep = registry.toolchainFor(lang, 'depsAudit');
      assert.ok(dep, `${lang} must declare a depsAudit phase`);
      assert.equal(dep.cmd, 'osv-scanner scan -r .',
        `${lang} depsAudit must be the osv-scanner v2 subcommand form`);
    }
  });

  it('java depsAudit altCmd uses the v2 `osv-scanner scan -r .`', () => {
    const dep = registry.toolchainFor('java', 'depsAudit');
    assert.ok(dep, 'java must declare a depsAudit phase');
    assert.equal(dep.altCmd, 'osv-scanner scan -r .',
      'the java osv-scanner altCmd must be the v2 subcommand form, consistent with c/cpp');
  });

  it('dart + kotlin already use the v2 `osv-scanner scan --lockfile=` form — consistent across all five', () => {
    const dart = registry.toolchainFor('dart', 'depsAudit');
    const kotlin = registry.toolchainFor('kotlin', 'depsAudit');
    assert.match(dart.cmd, /^osv-scanner scan --lockfile=/, 'dart osv-scanner is the v2 scan form');
    assert.match(kotlin.cmd, /^osv-scanner scan --lockfile=/, 'kotlin osv-scanner is the v2 scan form');
  });
});

describe('DEF 3: web-fullstack project type — Next/Nuxt/Remix/SvelteKit get security:required', () => {
  it('web-fullstack loads with security REQUIRED and beats web-frontend/static-site in priority', () => {
    const { projectTypes, warnings } = registry.loadProjectTypes();
    assert.deepEqual(warnings, [], 'adding web-fullstack must not introduce any warning');
    const fs2 = projectTypes['web-fullstack'];
    assert.ok(fs2, 'web-fullstack must be a registered project type');
    assert.equal(fs2.phases.security, 'required',
      'a fullstack app has server-side surface (ssrf, auth-middleware, csrf) — security is REQUIRED');
    assert.ok(fs2.priority > projectTypes['web-frontend'].priority,
      'web-fullstack must outrank web-frontend so a Next app is not mis-classified as a frontend');
    assert.ok(fs2.priority > projectTypes['static-site'].priority,
      'web-fullstack must outrank static-site');
  });

  it('a next.config.js repo classifies as web-fullstack (security required), NOT web-frontend', () => {
    const dir = makeProject('ctoc-fs-next-');
    try {
      fs.writeFileSync(path.join(dir, 'next.config.js'), 'module.exports = {};\n');
      assert.equal(registry.projectTypeFor(dir), 'web-fullstack',
        'a Next.js app is fullstack — it renders on the server and must get security:required');
      const p = registry.pipelineFor('typescript', 'web-fullstack');
      assert.ok(p, 'the typescript/web-fullstack merge must resolve');
      assert.equal(p.phases.security.relevance, 'required',
        'the merged fullstack pipeline treats security as required');
    } finally { rm(dir); }
  });

  it('a plain Svelte+Vite SPA (root svelte.config.js, no SvelteKit) is web-frontend, NOT web-fullstack', () => {
    // The official create-vite --template svelte SPA ships a root svelte.config.js for
    // vitePreprocess with NO server and dev/build/preview scripts (no `start`). Routing on
    // that shared filename to web-fullstack drives a broken `npm start` reported honest:true.
    // svelte.config.js is therefore NOT a fullstack marker; SvelteKit is detected by its dep.
    const dir = makeProject('ctoc-svelte-spa-');
    try {
      fs.writeFileSync(path.join(dir, 'svelte.config.js'), 'export default {};\n');
      fs.writeFileSync(path.join(dir, 'vite.config.ts'), 'export default {};\n');
      assert.equal(registry.projectTypeFor(dir), 'web-frontend',
        'a plain Svelte+Vite SPA must not be mis-classified as fullstack (broken npm start)');
    } finally { rm(dir); }
  });

  it('a nuxt.config.ts and a remix.config.js also classify as web-fullstack', () => {
    for (const marker of ['nuxt.config.ts', 'remix.config.js']) {
      const dir = makeProject('ctoc-fs-marker-');
      try {
        fs.writeFileSync(path.join(dir, marker), 'export default {};\n');
        assert.equal(registry.projectTypeFor(dir), 'web-fullstack',
          `${marker} is a fullstack framework config — it must classify as web-fullstack`);
      } finally { rm(dir); }
    }
  });

  it('the fullstack markers are REMOVED from web-frontend (they no longer mis-route there)', () => {
    const { projectTypes } = registry.loadProjectTypes();
    const feMarkers = projectTypes['web-frontend'].detectionMarkers;
    for (const m of ['next.config.js', 'next.config.mjs', 'svelte.config.js']) {
      assert.ok(!feMarkers.includes(m),
        `web-frontend must NOT carry the fullstack marker ${m} — it belongs to web-fullstack`);
    }
    // web-frontend still detects a genuine SPA (vite).
    assert.ok(feMarkers.includes('vite.config.ts'), 'web-frontend keeps its genuine SPA markers');
  });

  it('a plain Vite SPA (vite.config.ts only) still resolves to web-frontend, not web-fullstack', () => {
    const dir = makeProject('ctoc-fs-vite-');
    try {
      fs.writeFileSync(path.join(dir, 'vite.config.ts'), 'export default {};\n');
      assert.equal(registry.projectTypeFor(dir), 'web-frontend',
        'a bare Vite SPA has no fullstack marker — it must remain web-frontend');
    } finally { rm(dir); }
  });
});

describe('DEF 4: C# security slot is a real SAST (security-code-scan), not SCA dressed up', () => {
  it('csharp security is security-code-scan (Roslyn SAST), flagged UNVERIFIED — not `dotnet list package --vulnerable`', () => {
    const sec = registry.toolchainFor('csharp', 'security');
    assert.ok(sec, 'csharp must declare a security phase');
    assert.match(sec.cmd, /security-code-scan/,
      'the SAST slot must invoke the genuine C# Roslyn SAST (security-code-scan), not an SCA command');
    assert.doesNotMatch(sec.cmd, /dotnet list package/,
      'an SCA command (dependency-CVE audit) must NOT masquerade as SAST in the security slot');
    assert.equal(sec.verified, 'UNVERIFIED',
      'security-code-scan is a Roslyn analyzer whose CLI integration varies — honestly UNVERIFIED');
  });

  it('the SCA (dependency-CVE) command lives ONLY in depsAudit, with --include-transitive', () => {
    const dep = registry.toolchainFor('csharp', 'depsAudit');
    assert.ok(dep, 'csharp must declare a depsAudit phase');
    assert.equal(dep.cmd, 'dotnet list package --vulnerable --include-transitive',
      'the dependency-CVE audit belongs in depsAudit (SCA), not the SAST slot');
  });
});

describe('DEF 5: dead/fabricated detection markers are removed', () => {
  it('web-backend no longer carries the fabricated fastify.config.js marker', () => {
    const { projectTypes } = registry.loadProjectTypes();
    assert.ok(!projectTypes['web-backend'].detectionMarkers.includes('fastify.config.js'),
      'fastify.config.js can never fire (fastify.yaml declares files: []) — it must be removed');
    // web-backend still detects a genuine backend.
    assert.ok(projectTypes['web-backend'].detectionMarkers.includes('nest-cli.json'),
      'web-backend keeps its genuine markers');
  });

  it('data-science no longer carries the fabricated papermill.yaml marker; keeps dvc.yaml', () => {
    const { projectTypes } = registry.loadProjectTypes();
    const markers = projectTypes['data-science'].detectionMarkers;
    assert.ok(!markers.includes('papermill.yaml'),
      'papermill has no root config-file convention — papermill.yaml can never fire and must be removed');
    assert.ok(markers.includes('dvc.yaml'), 'dvc.yaml is a real data-science marker and must stay');
  });

  it('a dvc.yaml still detects data-science (detection survives the marker removal)', () => {
    const dir = makeProject('ctoc-ds-dvc-');
    try {
      fs.writeFileSync(path.join(dir, 'dvc.yaml'), 'stages: {}\n');
      assert.equal(registry.projectTypeFor(dir), 'data-science',
        'dvc.yaml must still detect data-science after papermill.yaml is removed');
    } finally { rm(dir); }
  });
});

describe('DEF 6: phoenix is honestly UNDETECTABLE (not merely "limited")', () => {
  it('phoenix declares files:[] and verified UNVERIFIED — detection is impossible until a mix.exs parser exists', () => {
    const phoenix = registry.frameworkCapability('phoenix');
    assert.ok(phoenix, 'phoenix must load');
    assert.deepEqual(phoenix.files, [], 'phoenix ships no unique root marker → files must be empty');
    assert.equal(phoenix.verified, 'UNVERIFIED',
      'phoenix deps live in an un-parsed mix.exs — its detection is honestly UNVERIFIED');
  });
});

describe('DEF 7: schema doc states the real invariant (test optional for non-runnable config languages)', () => {
  it('schema.md no longer claims test is required for EVERY language', () => {
    const schema = fs.readFileSync(
      path.join(__dirname, '..', '.ctoc', 'capabilities', 'schema.md'), 'utf8');
    assert.doesNotMatch(schema, /`lint` and `test` are required for every language/,
      'the old invariant is false — dockerfile/github-actions/shell/yaml deliberately omit test');
    assert.match(schema, /test/i, 'the schema still documents the test phase');
  });
});
