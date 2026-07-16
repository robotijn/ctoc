/**
 * Dark-branch coverage tests for src/lib/init-project.js
 *
 * These target the NON-OBVIOUS branches the existing tests/init-project.test.js
 * leaves dark: glob-style language markers, per-language framework detection
 * (Rust / Ruby / Java-Kotlin), the project-structure renderer (dir-first sort,
 * >20-entry truncation, directory line), the already-initialized idempotency
 * branches (IRON_LOOP.md and iron-loop.yaml are NOT clobbered), the second
 * operand of the .gitignore `||`, and the post-commit hook install decision
 * (installed / already-installed / throw). Every test pins a branch that goes
 * RED under mutation — not merely "no throw".
 *
 * Fakes only at the true boundary (real fs + real os.tmpdir fixtures); the
 * production module is loaded and driven for real. No mocking of core logic.
 *
 * DOCUMENTED UNREACHABLE (honestly not hit — no fabricated coverage):
 *   - 611-612 (else: "CLAUDE.md (template not found)"): templatePath resolves
 *     via __dirname to the real repo's .ctoc/templates/CLAUDE.md.template, which
 *     always exists in-tree. existsSync(templatePath) is unconditionally true
 *     here, so the not-found arm cannot fire without fs fault injection, which
 *     this file forbids.
 *   - 466-467 (generateProjectStructure catch): the only caller is initProject,
 *     which also writes CLAUDE.md into the same dir. Any state that makes
 *     readdirSync throw (missing dir / not-a-dir) also makes the CLAUDE.md write
 *     throw, so initProject cannot return with only the structure catch taken.
 *     Unreachable through the public API without fs fault injection.
 *   - 634-636, 659-661 (fail-open catches around the operating-lessons and
 *     operating-manual merges): both merges are internally fail-open and their
 *     inputs (a just-written CLAUDE.md + an in-tree template) are well-formed
 *     here, so neither require() nor the merge throws. Reachable only by
 *     corrupting the module cache or the filesystem mid-run — out of scope for
 *     a no-fs-fault-injection unit test.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  initProject,
  detectLanguages,
  detectFrameworks
} = require('../src/lib/init-project');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-initcov-'));
}
function removeTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* best-effort cleanup */ }
}

describe('init-project dark branches', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  // ---------------------------------------------------------------------------
  // Glob-style language markers (lines 235-243). Non-glob markers are exercised
  // by the existing suite; the `marker.includes('*')` arm — readdir + endsWith —
  // is dark. Mutating that arm (e.g. dropping the push) leaves the language
  // undetected, reddening these.
  // ---------------------------------------------------------------------------
  describe('detectLanguages via glob markers', () => {
    const globRows = [
      { id: 'csproj->csharp', file: 'Api.csproj', lang: 'csharp' },
      { id: 'sln->csharp', file: 'Solution.sln', lang: 'csharp' },
      { id: 'xcodeproj->swift', file: 'App.xcodeproj', lang: 'swift' }
    ];

    for (const row of globRows) {
      it(`should_detect_${row.lang}_when_glob_marker_${row.id}_present`, () => {
        // Arrange
        fs.writeFileSync(path.join(tempDir, row.file), '');

        // Act
        const langs = detectLanguages(tempDir);

        // Assert
        assert.ok(
          langs.includes(row.lang),
          `${row.file} should detect ${row.lang}, got ${JSON.stringify(langs)}`
        );
      });
    }

    it('should_not_detect_csharp_when_no_matching_glob_file_present', () => {
      // Arrange — a plain file whose extension does NOT match any glob marker.
      fs.writeFileSync(path.join(tempDir, 'notes.txt'), '');

      // Act
      const langs = detectLanguages(tempDir);

      // Assert — the endsWith predicate must reject non-matching extensions.
      assert.ok(!langs.includes('csharp'));
      assert.ok(!langs.includes('swift'));
    });
  });

  // ---------------------------------------------------------------------------
  // Rust framework detection (lines 354-370). Entirely dark in the old suite.
  // ---------------------------------------------------------------------------
  describe('detectFrameworks for Rust', () => {
    const rustRows = ['actix', 'axum', 'rocket', 'warp'];

    for (const fw of rustRows) {
      it(`should_detect_${fw}_when_cargo_toml_declares_it`, () => {
        // Arrange
        fs.writeFileSync(
          path.join(tempDir, 'Cargo.toml'),
          `[package]\nname = "app"\n[dependencies]\n${fw} = "1"\n`
        );

        // Act
        const frameworks = detectFrameworks(tempDir, ['rust']);

        // Assert
        assert.ok(frameworks.includes(fw), `expected ${fw}, got ${JSON.stringify(frameworks)}`);
      });
    }

    it('should_return_no_rust_framework_when_cargo_toml_has_none', () => {
      // Arrange — a dependency present but not in the known-framework set.
      fs.writeFileSync(
        path.join(tempDir, 'Cargo.toml'),
        '[package]\nname = "app"\n[dependencies]\nserde = "1"\n'
      );

      // Act
      const frameworks = detectFrameworks(tempDir, ['rust']);

      // Assert — kills an over-eager mutant that pushes unconditionally.
      assert.deepEqual(frameworks, []);
    });
  });

  // ---------------------------------------------------------------------------
  // Ruby framework detection (lines 373-383). Exercises BOTH quote styles of the
  // `content.includes("'rails'") || content.includes('"rails"')` guard.
  // ---------------------------------------------------------------------------
  describe('detectFrameworks for Ruby', () => {
    const rubyRows = [
      { id: 'rails-single', line: "gem 'rails'", fw: 'rails' },
      { id: 'rails-double', line: 'gem "rails"', fw: 'rails' },
      { id: 'sinatra-single', line: "gem 'sinatra'", fw: 'sinatra' },
      { id: 'hanami-double', line: 'gem "hanami"', fw: 'hanami' }
    ];

    for (const row of rubyRows) {
      it(`should_detect_${row.fw}_when_gemfile_has_${row.id}`, () => {
        // Arrange
        fs.writeFileSync(path.join(tempDir, 'Gemfile'), `source 'https://rubygems.org'\n${row.line}\n`);

        // Act
        const frameworks = detectFrameworks(tempDir, ['ruby']);

        // Assert
        assert.ok(frameworks.includes(row.fw), `expected ${row.fw}, got ${JSON.stringify(frameworks)}`);
      });
    }

    it('should_return_no_ruby_framework_when_gemfile_names_an_unknown_gem', () => {
      // Arrange
      fs.writeFileSync(path.join(tempDir, 'Gemfile'), "source 'x'\ngem 'rspec'\n");

      // Act
      const frameworks = detectFrameworks(tempDir, ['ruby']);

      // Assert
      assert.deepEqual(frameworks, []);
    });
  });

  // ---------------------------------------------------------------------------
  // Java / Kotlin framework detection (lines 386-400). Dark in the old suite.
  // Covers pom.xml + build.gradle marker files and each framework keyword.
  // ---------------------------------------------------------------------------
  describe('detectFrameworks for Java/Kotlin', () => {
    const jvmRows = [
      { id: 'spring-pom', file: 'pom.xml', body: '<dependency>spring-boot</dependency>', langs: ['java'], fw: 'spring' },
      { id: 'quarkus-gradle', file: 'build.gradle', body: "implementation 'io.quarkus:quarkus-core'", langs: ['java'], fw: 'quarkus' },
      { id: 'micronaut-gradle', file: 'build.gradle', body: "implementation 'io.micronaut:micronaut-core'", langs: ['java'], fw: 'micronaut' },
      { id: 'ktor-kts', file: 'build.gradle.kts', body: 'implementation("io.ktor:ktor-server-core")', langs: ['kotlin'], fw: 'ktor' }
    ];

    for (const row of jvmRows) {
      it(`should_detect_${row.fw}_when_${row.id}_declares_it`, () => {
        // Arrange
        fs.writeFileSync(path.join(tempDir, row.file), `plugins {}\n${row.body}\n`);

        // Act
        const frameworks = detectFrameworks(tempDir, row.langs);

        // Assert
        assert.ok(frameworks.includes(row.fw), `expected ${row.fw}, got ${JSON.stringify(frameworks)}`);
      });
    }

    it('should_return_no_jvm_framework_when_build_file_names_none', () => {
      // Arrange
      fs.writeFileSync(path.join(tempDir, 'pom.xml'), '<project><artifactId>plain</artifactId></project>');

      // Act
      const frameworks = detectFrameworks(tempDir, ['java']);

      // Assert
      assert.deepEqual(frameworks, []);
    });
  });

  // ---------------------------------------------------------------------------
  // generateProjectStructure — reached only through initProject, asserted on the
  // generated CLAUDE.md (lines 446-463). A directory named `zzdir` sorts AFTER
  // every `a*.txt` file alphabetically, so it can appear before the files ONLY
  // if the directories-first comparator (447-448) fires. With 22 non-ignored
  // entries the >20 truncation (461-463) also fires, and the directory-line
  // branch (455-456) prints `zzdir/`.
  // ---------------------------------------------------------------------------
  describe('generateProjectStructure through initProject', () => {
    function seedStructureFixture(dir) {
      fs.mkdirSync(path.join(dir, 'zzdir'));
      for (let i = 0; i < 21; i++) {
        const name = 'a' + String(i).padStart(2, '0') + '.txt';
        fs.writeFileSync(path.join(dir, name), '');
      }
    }

    it('should_list_directories_before_files_when_rendering_structure', () => {
      // Arrange
      seedStructureFixture(tempDir);

      // Act
      initProject(tempDir);
      const claudeMd = fs.readFileSync(path.join(tempDir, 'CLAUDE.md'), 'utf8');

      // Assert — dir line present AND ordered before the first file despite its
      // alphabetically-later name (pins the directories-first comparator).
      const dirIdx = claudeMd.indexOf('zzdir/');
      const fileIdx = claudeMd.indexOf('a00.txt');
      assert.ok(dirIdx !== -1, 'zzdir/ directory line must be rendered');
      assert.ok(fileIdx !== -1, 'a00.txt file line must be rendered');
      assert.ok(dirIdx < fileIdx, 'directory must be listed before files');
    });

    it('should_truncate_with_more_entries_note_when_over_twenty_entries', () => {
      // Arrange — 22 non-ignored entries (1 dir + 21 files) exceeds the cap of 20.
      seedStructureFixture(tempDir);

      // Act
      initProject(tempDir);
      const claudeMd = fs.readFileSync(path.join(tempDir, 'CLAUDE.md'), 'utf8');

      // Assert — exactly (22 - 20) = 2 more entries.
      assert.ok(/\.\.\. \(2 more entries\)/.test(claudeMd), 'truncation note must report 2 more entries');
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotency: a second init must NOT clobber an existing IRON_LOOP.md or
  // iron-loop.yaml (lines 674-676 and 712-714). These are the already-exists
  // skip arms; mutating them to overwrite reddens the content assertion.
  // ---------------------------------------------------------------------------
  describe('idempotency — existing artifacts are preserved', () => {
    it('should_skip_and_preserve_IRON_LOOP_md_when_it_already_exists', () => {
      // Arrange
      const ironPath = path.join(tempDir, 'IRON_LOOP.md');
      fs.writeFileSync(ironPath, '# hand-written iron loop notes');

      // Act
      const result = initProject(tempDir);

      // Assert
      assert.ok(result.skipped.some(s => s.includes('IRON_LOOP.md')), 'IRON_LOOP.md must be reported skipped');
      assert.equal(fs.readFileSync(ironPath, 'utf8'), '# hand-written iron loop notes');
    });

    it('should_skip_and_preserve_iron_loop_state_yaml_when_it_already_exists', () => {
      // Arrange — pre-seed the state file with a sentinel the generator never writes.
      fs.mkdirSync(path.join(tempDir, '.ctoc', 'state'), { recursive: true });
      const statePath = path.join(tempDir, '.ctoc', 'state', 'iron-loop.yaml');
      fs.writeFileSync(statePath, 'session:\n  status: ACTIVE_SENTINEL\n');

      // Act
      const result = initProject(tempDir);

      // Assert — the skip arm fires and the sentinel survives (no clobber).
      assert.ok(result.skipped.some(s => s.includes('iron-loop.yaml')), 'iron-loop.yaml must be reported skipped');
      assert.ok(fs.readFileSync(statePath, 'utf8').includes('ACTIVE_SENTINEL'));
    });
  });

  // ---------------------------------------------------------------------------
  // .gitignore update — the SECOND operand of the `||` (line 720). The existing
  // suite covers "neither present" and "both present"; the mixed case (logs/
  // present, state/ absent) is the dark operand. It must still trigger an update.
  // ---------------------------------------------------------------------------
  describe('.gitignore mixed-entry update', () => {
    it('should_append_ctoc_entries_when_only_logs_dir_present_but_state_dir_absent', () => {
      // Arrange — first `||` operand is false (logs present); second is true.
      fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules/\n.ctoc/logs/\n');

      // Act
      const result = initProject(tempDir);
      const content = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf8');

      // Assert — the state entry gets added and the update is reported.
      assert.ok(content.includes('.ctoc/state/'), 'missing state entry must be appended');
      assert.ok(result.created.some(s => s.includes('.gitignore')), 'gitignore update must be reported');
    });
  });

  // ---------------------------------------------------------------------------
  // Post-commit hook install decision (lines 734-746). Only runs when `.git`
  // exists. Three distinct outcomes: fresh install, already-installed skip, and
  // the fail-open throw path.
  // ---------------------------------------------------------------------------
  describe('post-commit hook installation', () => {
    it('should_install_post_commit_hook_when_git_dir_present_and_no_hook_yet', () => {
      // Arrange — a bare `.git` directory, no hooks yet.
      fs.mkdirSync(path.join(tempDir, '.git'));

      // Act
      const result = initProject(tempDir);

      // Assert — reported created AND the executable hook actually lands on disk.
      assert.ok(result.created.some(s => s.includes('post-commit')), 'install must be reported');
      const hookPath = path.join(tempDir, '.git', 'hooks', 'post-commit');
      assert.ok(fs.existsSync(hookPath), 'post-commit hook file must be written');
      assert.ok(fs.readFileSync(hookPath, 'utf8').includes('CTOC'), 'hook must carry the CTOC marker');
    });

    it('should_skip_post_commit_hook_when_a_ctoc_hook_is_already_installed', () => {
      // Arrange — a pre-existing REAL CTOC hook (carries the actual CTOC
      // invocation, not just a comment). Install ownership is now decided by the
      // CTOC invocation/sentinel, NOT by a bare "CTOC" mention — a foreign hook
      // that merely comments the word CTOC must no longer be treated as installed.
      const hooksDir = path.join(tempDir, '.git', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      const hookPath = path.join(hooksDir, 'post-commit');
      const existing = '#!/bin/sh\n# CTOC post-commit hook - triggers background quality agent\nnode ".ctoc/agent/post-commit.js" 2>/dev/null &\n';
      fs.writeFileSync(hookPath, existing);

      // Act
      const result = initProject(tempDir);

      // Assert — reported skipped, existing content untouched (idempotency).
      assert.ok(
        result.skipped.some(s => s.includes('post-commit') && s.includes('already installed')),
        'already-installed skip must be reported'
      );
      assert.equal(fs.readFileSync(hookPath, 'utf8'), existing);
    });

    it('should_fail_open_and_report_skip_when_hook_install_throws', () => {
      // Arrange — `.git` is a FILE (a worktree-style gitdir link), so building
      // the hooks directory (mkdir .git/hooks) raises ENOTDIR inside the
      // installer. init must swallow it and record a skip, never throw.
      fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /nonexistent\n');

      // Act
      const result = initProject(tempDir);

      // Assert — init still succeeds and the failure is surfaced as a skip.
      assert.equal(result.success, true);
      assert.ok(
        result.skipped.some(s => s.includes('post-commit')),
        'the install failure must be reported as a skip, not thrown'
      );
    });
  });
});
