'use strict';

/**
 * EXPANSION WAVE 1 — config/infra language capabilities (shell, dockerfile, terraform).
 *
 * The registry seeded the top-20 PROGRAMMING languages (CR1/CR2) but missed the
 * three config/infra languages that appear in nearly every real repo: shell scripts,
 * Dockerfiles, and Terraform/HCL. This wave adds them as three ordinary
 * `.ctoc/capabilities/languages/*.yaml` entries — no engine change; the schema already
 * supports "omit a phase the language genuinely lacks" (an absent phase is honest N/A,
 * never a stub).
 *
 * These tests assert the DATA is present, honest, and web-grounded, and that the three
 * new languages detect from their real markers through the REAL engine:
 *
 *   • LOAD CLEAN — all three load; the registry now carries 23 languages with ZERO
 *     warnings (the shipped seed data must never warn).
 *   • DETECTABLE — detectLanguages finds shell from deploy.sh (glob *.sh), dockerfile
 *     from Dockerfile (exact), terraform from main.tf (exact + glob *.tf), via a real
 *     on-disk fixture.
 *   • HONEST PROVENANCE — every present toolchain phase carries `verified` that is
 *     exactly `web-2026-07` or `UNVERIFIED` (never empty, never "guessed"). shell's
 *     security reuses its linter (shellcheck) and is honestly UNVERIFIED — a linter is
 *     not a dedicated SAST.
 *   • CORRECT SECURITY TOOL — terraform and dockerfile security is `trivy config`
 *     (Trivy absorbed tfsec in 2023 — tfsec is DEPRECATED and must never appear).
 *   • HONEST RUN — shell.run.honest === true (bash genuinely runs); terraform.run.honest
 *     === false (`terraform plan` is a dry run, no launched app); dockerfile.run.honest
 *     === "build-is-last-mile" (an image is built, not launched).
 *   • NO REGRESSION — a JS repo that also has a Dockerfile still has `javascript` as
 *     its stack-detector primary.language; `dockerfile` is an ADDITIONAL detected
 *     language, not the primary.
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
const stackDetector = require('../src/lib/stack-detector');

const NEW_LANGS = ['shell', 'dockerfile', 'terraform'];
const ALLOWED_VERIFIED = new Set(['web-2026-07', 'UNVERIFIED']);
// tfsec was folded into Trivy in 2023 and is deprecated — it must never appear in any
// terraform/dockerfile command. Every SAST/IaC scan command must be `trivy config`.
const DEPRECATED_TOOLS = /tfsec/i;

/** Make a fresh temp project dir. */
function makeProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** Remove a temp dir, best-effort. */
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
/** Collect every command STRING an entry exposes (cmd + altCmd + run shape values). */
function allCommandsFor(cap) {
  const cmds = [];
  if (cap.toolchain && typeof cap.toolchain === 'object') {
    for (const entry of Object.values(cap.toolchain)) {
      if (entry && typeof entry.cmd === 'string') cmds.push(entry.cmd);
      if (entry && typeof entry.altCmd === 'string') cmds.push(entry.altCmd);
    }
  }
  if (cap.run && cap.run.shapes && typeof cap.run.shapes === 'object') {
    for (const v of Object.values(cap.run.shapes)) {
      if (typeof v === 'string') cmds.push(v);
    }
  }
  return cmds;
}

describe('config/infra languages: load clean (registry now carries 23, zero warnings)', () => {
  it('all three new languages load from the bundled data', () => {
    const reg = registry.load();
    for (const lang of NEW_LANGS) {
      assert.ok(reg.languages[lang], `bundled data must include ${lang}`);
    }
  });

  it('the shipped seed data loads with ZERO warnings and exactly 23 languages', () => {
    const reg = registry.load();
    assert.deepEqual(reg.warnings, [], 'the shipped seed data must load with zero warnings');
    assert.equal(Object.keys(reg.languages).length, 23,
      'the top-20 programming languages + the 3 config/infra languages = 23');
  });

  it('exactly 3 new config/infra YAML files ship on disk (shell, dockerfile, terraform)', () => {
    const dir = path.join(__dirname, '..', '.ctoc', 'capabilities', 'languages');
    const files = new Set(fs.readdirSync(dir));
    for (const lang of NEW_LANGS) {
      assert.ok(files.has(`${lang}.yaml`), `${lang}.yaml must ship in the bundled directory`);
    }
  });
});

describe('config/infra languages: detection via real on-disk markers', () => {
  it('detects shell from a deploy.sh (glob *.sh marker)', () => {
    const dir = makeProject('ctoc-cfg-shell-');
    try {
      fs.writeFileSync(path.join(dir, 'deploy.sh'), '#!/usr/bin/env bash\necho hi\n');
      assert.ok(registry.detectLanguages(dir).includes('shell'),
        'a deploy.sh must detect shell via the *.sh glob marker');
    } finally { rm(dir); }
  });

  it('detects dockerfile from a Dockerfile (exact marker)', () => {
    const dir = makeProject('ctoc-cfg-docker-');
    try {
      fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM alpine:3.20\n');
      assert.ok(registry.detectLanguages(dir).includes('dockerfile'),
        'a Dockerfile must detect dockerfile via the exact marker');
    } finally { rm(dir); }
  });

  it('detects terraform from a main.tf (exact + glob *.tf marker)', () => {
    const dir = makeProject('ctoc-cfg-tf-');
    try {
      fs.writeFileSync(path.join(dir, 'main.tf'), 'terraform {\n}\n');
      assert.ok(registry.detectLanguages(dir).includes('terraform'),
        'a main.tf must detect terraform');
    } finally { rm(dir); }
  });
});

describe('config/infra languages: honest provenance (never empty, never "guessed")', () => {
  const reg = registry.load();

  for (const lang of NEW_LANGS) {
    it(`${lang}: lint present; every phase has a real cmd + tool + honest provenance`, () => {
      const cap = reg.languages[lang];
      assert.ok(cap, `${lang} must be present`);
      assert.ok(cap.toolchain && typeof cap.toolchain === 'object', `${lang} must declare a toolchain`);
      // lint is the one phase all three config/infra languages genuinely have.
      assert.ok(cap.toolchain.lint, `${lang} must declare a lint phase`);
      for (const [phase, entry] of Object.entries(cap.toolchain)) {
        assert.equal(typeof entry.cmd, 'string', `${lang}.${phase}.cmd must be a string`);
        assert.ok(entry.cmd.trim().length > 0, `${lang}.${phase}.cmd must not be empty`);
        assert.ok(entry.tool && String(entry.tool).trim().length > 0, `${lang}.${phase}.tool must be named`);
        assert.ok(
          ALLOWED_VERIFIED.has(entry.verified),
          `${lang}.${phase}.verified must be web-2026-07 or UNVERIFIED, never "${entry.verified}"`
        );
      }
    });
  }

  it('no new entry (toolchain or top-level) is ever flagged "guessed"', () => {
    for (const lang of NEW_LANGS) {
      const cap = reg.languages[lang];
      assert.notEqual(cap.verified, 'guessed', `${lang} top-level provenance must never be "guessed"`);
      for (const entry of Object.values(cap.toolchain)) {
        assert.notEqual(entry.verified, 'guessed', `${lang} phase provenance must never be "guessed"`);
      }
    }
  });
});

describe('config/infra languages: correct + honest toolchain specifics', () => {
  const reg = registry.load();

  it('shell security reuses shellcheck and is honestly UNVERIFIED (a linter, not a SAST)', () => {
    const sec = reg.languages.shell.toolchain.security;
    assert.ok(sec, 'shell must declare a security phase');
    assert.equal(sec.tool, 'shellcheck', 'shell security reuses the shellcheck linter');
    assert.equal(sec.verified, 'UNVERIFIED',
      'shellcheck is a linter that catches SOME injection, not a dedicated SAST — UNVERIFIED');
  });

  it('terraform + dockerfile security is `trivy config` — tfsec is DEPRECATED and must never appear', () => {
    for (const lang of ['terraform', 'dockerfile']) {
      const sec = reg.languages[lang].toolchain.security;
      assert.ok(sec, `${lang} must declare a security phase`);
      assert.match(sec.cmd, /^trivy config/, `${lang} security must be a \`trivy config\` invocation`);
    }
    // No command anywhere in the two IaC languages may mention the deprecated tfsec.
    for (const lang of ['terraform', 'dockerfile']) {
      for (const cmd of allCommandsFor(reg.languages[lang])) {
        assert.ok(!DEPRECATED_TOOLS.test(cmd),
          `${lang} must never reference the deprecated tfsec (folded into Trivy in 2023): "${cmd}"`);
      }
    }
  });

  it('terraform declares the native `terraform test` (native since Terraform 1.6)', () => {
    const t = reg.languages.terraform.toolchain.test;
    assert.ok(t, 'terraform must declare a test phase');
    assert.equal(t.cmd, 'terraform test', 'terraform test is the native test runner');
  });

  it('shell + dockerfile honestly OMIT the phases they lack (absent, not stubbed)', () => {
    // shell is untyped with no std test/pkg-mgr/build; dockerfile has no std formatter
    // and its image dep-scan is a different runtime target. Absent phases are honest N/A.
    assert.equal(reg.languages.shell.toolchain.test, undefined, 'shell must omit test');
    assert.equal(reg.languages.shell.toolchain.build, undefined, 'shell must omit build');
    assert.equal(reg.languages.dockerfile.toolchain.test, undefined, 'dockerfile must omit test');
    assert.equal(reg.languages.dockerfile.toolchain.format, undefined, 'dockerfile must omit format');
  });
});

describe('config/infra languages: HONEST run flags', () => {
  it('shell.run.honest === true (bash genuinely runs), cli shape is bash', () => {
    const cap = registry.capabilitiesFor('shell');
    assert.ok(cap.run && typeof cap.run === 'object', 'shell must carry a run block');
    assert.equal(cap.run.honest, true, 'a shell script genuinely runs');
    const s = registry.runStrategyFor('shell', 'cli');
    assert.ok(s, 'shell must expose a cli run shape');
    assert.equal(s.command, 'bash', 'shell cli run command is bash');
  });

  it('terraform.run.honest === false (terraform plan is a dry run, no launched app)', () => {
    const cap = registry.capabilitiesFor('terraform');
    assert.ok(cap.run && typeof cap.run === 'object', 'terraform must carry a run block');
    assert.equal(cap.run.honest, false,
      'terraform plan is a dry run, not a launched application — honest must be false');
    const shapes = cap.run.shapes && typeof cap.run.shapes === 'object' ? cap.run.shapes : {};
    assert.equal(Object.keys(shapes).length, 0, 'terraform declares no runnable shape');
    assert.equal(registry.runStrategyFor('terraform', 'cli'), null, 'terraform has no runnable shape');
  });

  it('dockerfile.run.honest === "build-is-last-mile" (an image is built, not launched)', () => {
    const cap = registry.capabilitiesFor('dockerfile');
    assert.ok(cap.run && typeof cap.run === 'object', 'dockerfile must carry a run block');
    assert.equal(cap.run.honest, 'build-is-last-mile',
      'an image is built, not launched — building the image is the CI-safe last mile');
  });
});

describe('config/infra languages: NO regression to stack-detector primary language', () => {
  it('a JS repo that ALSO has a Dockerfile keeps javascript as primary; dockerfile is additional', () => {
    const dir = makeProject('ctoc-cfg-jsdocker-');
    try {
      fs.writeFileSync(path.join(dir, 'package.json'),
        JSON.stringify({ name: 'x', scripts: { dev: 'node s.js' } }));
      fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:22-alpine\n');
      const stack = stackDetector.detectStack(dir);
      assert.equal(stack.primary.language, 'javascript',
        'package.json must remain the primary language even when a Dockerfile is present');
      assert.ok(stack.languages.includes('dockerfile'),
        'dockerfile must be detected as an ADDITIONAL language, never the primary');
    } finally { rm(dir); }
  });
});
