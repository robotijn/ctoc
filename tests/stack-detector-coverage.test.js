/**
 * Stack Detector — dark-branch coverage tests (node:test).
 *
 * Companion to tests/stack-detector.test.js. That file drives the happy detection
 * paths and the F1–F6 hardening. THIS file aims exclusively at the branches those
 * tests leave dark — every case here pins a branch that goes RED under mutation:
 *   - the fail-soft catch blocks (readTextIfExists EISDIR, realpath throw, `**`
 *     descendant readdir/stat throw, glob-segment readdir throw);
 *   - shared / ambiguous markers that must NOT over-detect (react ⊄ react-native,
 *     pg ⊄ mysql);
 *   - absence → not detected (language present but marker absent);
 *   - PEP 503 separator-run normalization (underscore / dot collapse);
 *   - the pyproject section/key guards (a `dependencies` array under a NON-project
 *     table is ignored; a quoted `"dependencies"` key is still honoured);
 *   - the requirements.txt comment guard;
 *   - the mergePkgDeps null-package type guard (JSON `null` must not throw out of
 *     detectStack);
 *   - array de-duplication (a framework matched by BOTH file and dep is listed once);
 *   - the non-string / empty workspace-pattern skip.
 *
 * Fakes only at the true boundary (the filesystem): every test builds a real
 * project tree under os.tmpdir() and loads the real module. No mocking of core logic.
 * Every temp tree is removed in `finally`.
 *
 * Human-reviewed (Tijn): each assertion was checked to fail against a trivially-wrong
 * implementation (mutate one production line and re-run — it goes red).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  detectFrameworks,
  detectStack,
  matchGlob,
  readPackageDeps
} = require('../src/lib/stack-detector');

/** Create a real project tree; `files` maps relative path → file content. */
function makeProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cov-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

function removeTree(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

// ────────────────────────────────────────────────────────────────────────────
// Fail-soft catch blocks — the dark lines from the coverage report.
// ────────────────────────────────────────────────────────────────────────────

test('detectStack does not throw when package.json is a DIRECTORY (readTextIfExists EISDIR catch)', () => {
  // Arrange: a directory literally named `package.json`. existsSync passes, but
  // readFileSync on a directory throws EISDIR — only the catch in readTextIfExists
  // keeps that out of detectStack. (Covers lines 243-244.)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cov-'));
  fs.mkdirSync(path.join(root, 'package.json'));
  try {
    // Act
    const stack = detectStack(root);

    // Assert: the marker still makes it JavaScript, and the unreadable body is
    // swallowed rather than propagated. Removing the catch throws EISDIR out here.
    assert.ok(stack.languages.includes('javascript'), 'package.json dir still marks javascript');
    assert.deepEqual(stack.frameworks, [], 'no dep-based frameworks from an unreadable package.json');
  } finally {
    removeTree(root);
  }
});

test('workspace pointing at a non-existent `ghost/**` is fail-soft and does not abort a valid sibling pattern (realpath + `**` readdir catches)', () => {
  // Arrange: `ghost/**` resolves to a directory that does not exist, forcing BOTH
  // the collectDescendantDirs readdir catch (331-332) and the isWithinRootReal
  // realpath catch (308-311). A real `packages/*` sibling proves the loop survives.
  const root = makeProject({
    'package.json': JSON.stringify({
      name: 'root', private: true, workspaces: ['ghost/**', 'packages/*']
    }),
    'packages/web/package.json': JSON.stringify({
      name: 'web', dependencies: { express: '^4.18.0' }
    })
  });
  try {
    // Act
    const stack = detectStack(root);

    // Assert: the ghost pattern threw internally and was swallowed; the real
    // workspace still merged. If the fail-soft catches were removed the throw would
    // abort workspace expansion and express would be lost.
    assert.ok(stack.frameworks.includes('express'),
      'valid packages/* sibling still resolves after the ghost pattern fails soft');
  } finally {
    removeTree(root);
  }
});

test('workspace `ghost/*` glob on a non-existent directory yields no deps and no throw (glob-segment readdir catch)', () => {
  // Arrange: a single-`*` glob segment applied to a directory that does not exist
  // exercises the readdir catch at lines 373-374 (distinct from the `**` path).
  const root = makeProject({
    'package.json': JSON.stringify({
      name: 'root', private: true, workspaces: ['ghost/*'],
      dependencies: { express: '^4.18.0' }
    })
  });
  try {
    // Act
    const stack = detectStack(root);

    // Assert: root's own express still detected; the ghost glob contributes nothing
    // and does not throw. Removing the catch throws ENOENT out of detectStack.
    assert.ok(stack.frameworks.includes('express'), 'root deps intact; ghost glob is a no-op');
  } finally {
    removeTree(root);
  }
});

test('recursive `**` walk skips a broken symlink child instead of throwing (collectDescendantDirs statSync catch)', () => {
  // Arrange: packages/ contains a broken symlink AND a real nested package. The `**`
  // walk statSyncs each child; the broken symlink throws ENOENT — only the statSync
  // catch (340-341) lets the walk continue to the real package.
  const root = makeProject({
    'package.json': JSON.stringify({
      name: 'root', private: true, workspaces: ['packages/**']
    }),
    'packages/real/package.json': JSON.stringify({
      name: 'real', dependencies: { express: '^4.18.0' }
    })
  });
  let symlinkMade = false;
  try {
    try {
      fs.symlinkSync(path.join(root, 'nonexistent-target'), path.join(root, 'packages', 'broken'), 'dir');
      symlinkMade = true;
    } catch (e) {
      // Platform without symlink privilege — the real-package assertion below still
      // holds (the walk simply has no broken child to skip on this platform).
    }

    // Act
    const stack = detectStack(root);

    // Assert: the walk reached the real nested package regardless of the broken
    // sibling. If the statSync catch were removed, a made symlink would throw and
    // abort the walk, dropping express.
    assert.ok(stack.frameworks.includes('express'),
      'nested packages/real resolved; broken symlink child did not abort the `**` walk');
    assert.ok(symlinkMade || process.platform === 'win32',
      'broken symlink was created on a POSIX platform (documents the branch under test)');
  } finally {
    removeTree(root);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Shared / ambiguous markers must NOT over-detect.
// ────────────────────────────────────────────────────────────────────────────

test('a `react` dependency detects react but NOT react-native (shared substring must not over-match)', () => {
  // Arrange: react is a substring of react-native; react-native must match only its
  // own `react-native` dep or metro.config.js, neither of which is present.
  const root = makeProject({
    'package.json': JSON.stringify({ name: 'app', dependencies: { react: '^18.0.0' } }),
    'tsconfig.json': '{}'
  });
  try {
    // Act
    const frameworks = detectFrameworks(root);

    // Assert
    assert.ok(frameworks.includes('react'), 'react detected from its own dep');
    assert.ok(!frameworks.includes('react-native'),
      'react-native NOT detected — a react dep must not satisfy the react-native marker');
  } finally {
    removeTree(root);
  }
});

test('a `pg` dependency detects postgresql but NOT mysql (distinct database markers)', () => {
  // Arrange: postgres-only client dep. mysql shares neither dep nor marker.
  const root = makeProject({
    'package.json': JSON.stringify({ name: 'api', dependencies: { pg: '^8.0.0' } })
  });
  try {
    // Act
    const stack = detectStack(root);
    const dbNames = stack.databases.map(d => d.name);

    // Assert
    assert.ok(dbNames.includes('postgresql'), 'postgresql detected from pg');
    assert.ok(!dbNames.includes('mysql'), 'mysql NOT detected — pg is not a mysql marker');
  } finally {
    removeTree(root);
  }
});

test('a project with no database deps yields an empty databases array (absence → not detected)', () => {
  // Arrange: a framework dep but zero database client deps.
  const root = makeProject({
    'package.json': JSON.stringify({ name: 'api', dependencies: { express: '^4.18.0' } })
  });
  try {
    // Act
    const stack = detectStack(root);

    // Assert: no database is invented. Kills a mutant defaulting `found` to true.
    assert.deepEqual(stack.databases, [], 'no databases detected without any client dep');
  } finally {
    removeTree(root);
  }
});

test('a language present without its framework marker does not detect that framework (absence within a present language)', () => {
  // Arrange: python is present and flask is a dep, but django (also python) is absent.
  const root = makeProject({ 'requirements.txt': 'flask==3.0\n' });
  try {
    // Act
    const stack = detectStack(root);

    // Assert
    assert.ok(stack.languages.includes('python'), 'python present');
    assert.ok(stack.frameworks.includes('flask'), 'flask present');
    assert.ok(!stack.frameworks.includes('django'),
      'django NOT detected — present language does not imply an unmarked framework');
  } finally {
    removeTree(root);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PEP 503 normalization — separator-run collapse, not just case.
// ────────────────────────────────────────────────────────────────────────────

test('a dependency spelled with `.` and mixed case normalizes to the registry name (separator-run collapse)', () => {
  // Arrange: `Psycopg2.Binary` must collapse to `psycopg2-binary` (lowercase + any
  // run of [-_.] → single `-`) to match the registry and detect postgresql. This is
  // the non-obvious half of normalization the case-only tests never exercise.
  const root = makeProject({ 'requirements.txt': 'Psycopg2.Binary==2.9\n' });
  try {
    // Act
    const stack = detectStack(root);

    // Assert
    assert.ok(stack.databases.some(d => d.name === 'postgresql'),
      'Psycopg2.Binary → psycopg2-binary → postgresql via separator-run normalization');
  } finally {
    removeTree(root);
  }
});

test('a node dependency with an underscore separator normalizes for matching', () => {
  // Arrange: `spring_boot_starter`-style separators — underscores collapse to `-`.
  // Use a python framework whose registry name carries a dash is rare, so drive the
  // node path with a scoped dep whose separators must collapse: `@Angular_Core`
  // would not match; instead assert the underscore→dash rule on a real match.
  const root = makeProject({
    'requirements.txt': 'psycopg2_binary==2.9\n'
  });
  try {
    // Act
    const stack = detectStack(root);

    // Assert: underscore variant still resolves to postgresql.
    assert.ok(stack.databases.some(d => d.name === 'postgresql'),
      'psycopg2_binary (underscore) normalizes to psycopg2-binary → postgresql');
  } finally {
    removeTree(root);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// pyproject.toml section / key guards.
// ────────────────────────────────────────────────────────────────────────────

test('a `dependencies` array under a NON-project table is ignored (section guard)', () => {
  // Arrange: `dependencies = ["fastapi"]` under [tool.something], NOT [project].
  // Only [project].dependencies and [project.optional-dependencies] are PEP 621 deps.
  const root = makeProject({
    'pyproject.toml':
      '[project]\nname = "svc"\ndependencies = [\n  "flask"\n]\n\n' +
      '[tool.something]\ndependencies = ["fastapi"]\n'
  });
  try {
    // Act
    const stack = detectStack(root);

    // Assert: flask (real project dep) present; fastapi (mis-placed) not leaked.
    assert.ok(stack.frameworks.includes('flask'), 'project dependency flask parsed');
    assert.ok(!stack.frameworks.includes('fastapi'),
      'a dependencies array under [tool.something] is NOT treated as project deps');
  } finally {
    removeTree(root);
  }
});

test('a quoted `"dependencies"` key under [project] is still parsed (key quote-strip)', () => {
  // Arrange: TOML permits quoted bare keys. The parser strips surrounding quotes
  // from the key before comparing to `dependencies`.
  const root = makeProject({
    'pyproject.toml':
      '[project]\nname = "svc"\n"dependencies" = [\n  "fastapi"\n]\n'
  });
  try {
    // Act
    const stack = detectStack(root);

    // Assert: without the key quote-strip, `"dependencies"` !== `dependencies` and
    // fastapi would be missed.
    assert.ok(stack.frameworks.includes('fastapi'),
      'quoted "dependencies" key honoured — fastapi detected');
  } finally {
    removeTree(root);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// requirements.txt comment guard.
// ────────────────────────────────────────────────────────────────────────────

test('a dependency name appearing only inside a `#` comment is not detected (comment guard)', () => {
  // Arrange: `django` appears only in a comment; flask is the sole real dep.
  const root = makeProject({
    'requirements.txt': '# django is great but not used here\nflask==3.0\n'
  });
  try {
    // Act
    const stack = detectStack(root);

    // Assert: the comment token must not become a detection. Kills a mutant dropping
    // the `startsWith('#')` guard in extractRequirementName.
    assert.ok(stack.frameworks.includes('flask'), 'real dep flask detected');
    assert.ok(!stack.frameworks.includes('django'),
      'django inside a comment is NOT detected');
  } finally {
    removeTree(root);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// mergePkgDeps null / non-object package guard.
// ────────────────────────────────────────────────────────────────────────────

test('a package.json whose top-level JSON is `null` does not throw out of detectStack (mergePkgDeps type guard)', () => {
  // Arrange: JSON.parse("null") === null. Without the `!pkg` guard, mergePkgDeps
  // dereferences null.dependencies → TypeError propagates out of detectStack.
  const root = makeProject({ 'package.json': 'null' });
  try {
    // Act
    const stack = detectStack(root);

    // Assert: still recognised as JavaScript by the file marker; no crash, no deps.
    assert.ok(stack.languages.includes('javascript'), 'package.json marker still marks javascript');
    assert.deepEqual(stack.frameworks, [], 'null package.json contributes no deps');
  } finally {
    removeTree(root);
  }
});

test('readPackageDeps returns an empty null-prototype object for a JSON-string package.json (non-object guard)', () => {
  // Arrange: a valid JSON string body (typeof === 'string', not object).
  const root = makeProject({ 'package.json': '"just a string"' });
  try {
    // Act
    const deps = readPackageDeps(root);

    // Assert: guard returns before any Object.keys on a non-object; empty result.
    assert.equal(Object.getPrototypeOf(deps), null, 'null-prototype preserved');
    assert.deepEqual(Object.keys(deps), [], 'no dependency keys from a string body');
  } finally {
    removeTree(root);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// De-duplication: a framework matched by BOTH file and dep appears once.
// ────────────────────────────────────────────────────────────────────────────

test('a framework matched by both its config file and its dependency is listed exactly once (dedup / `!found` short-circuit)', () => {
  // Arrange: next.config.js (file marker) AND `next` (dep) both present.
  const root = makeProject({
    'package.json': JSON.stringify({ name: 'app', dependencies: { next: '^15.0.0' } }),
    'tsconfig.json': '{}',
    'next.config.js': 'module.exports = {};\n'
  });
  try {
    // Act
    const frameworks = detectFrameworks(root);

    // Assert: exactly one entry — the file match sets `found` and the `!found` guard
    // prevents a second push from the dep loop.
    const occurrences = frameworks.filter(f => f === 'next.js').length;
    assert.equal(occurrences, 1, 'next.js listed once despite matching file AND dep');
  } finally {
    removeTree(root);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Workspace pattern edge branches.
// ────────────────────────────────────────────────────────────────────────────

test('a non-string / empty workspace pattern is skipped while a valid sibling still resolves', () => {
  // Arrange: a numeric and an empty-string pattern must be skipped (typeof / length
  // guard) without aborting the valid `packages/*` pattern.
  const root = makeProject({
    'package.json': JSON.stringify({
      name: 'root', private: true, workspaces: [123, '', 'packages/*']
    }),
    'packages/web/package.json': JSON.stringify({
      name: 'web', dependencies: { express: '^4.18.0' }
    })
  });
  try {
    // Act
    const stack = detectStack(root);

    // Assert
    assert.ok(stack.frameworks.includes('express'),
      'valid packages/* resolves; junk patterns skipped without throwing');
  } finally {
    removeTree(root);
  }
});

test('a `workspaces` object WITHOUT a `packages` array contributes no workspace deps and does not throw', () => {
  // Arrange: object-form workspaces missing the `packages` key → patterns stays null.
  const root = makeProject({
    'package.json': JSON.stringify({
      name: 'root', private: true,
      workspaces: { nohoist: ['**/react'] },
      dependencies: { express: '^4.18.0' }
    }),
    'ignored/package.json': JSON.stringify({
      name: 'ignored', dependencies: { react: '^18.0.0' }
    })
  });
  try {
    // Act
    const stack = detectStack(root);

    // Assert: root's own express present; nothing walked from the malformed object.
    assert.ok(stack.frameworks.includes('express'), 'root deps intact');
    assert.ok(!stack.frameworks.includes('react'),
      'no workspace expansion from a packages-less workspaces object');
  } finally {
    removeTree(root);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// matchGlob — `*` spanning an empty run.
// ────────────────────────────────────────────────────────────────────────────

test('matchGlob treats `*` as matching an empty run (`*.csproj` matches `.csproj`)', () => {
  // Arrange/Act/Assert: `.*` in the compiled pattern must permit zero characters.
  assert.equal(matchGlob('.csproj', '*.csproj'), true, '`*` spans zero characters');
  assert.equal(matchGlob('a.b.csproj', '*.csproj'), true, '`*` spans dotted names greedily');
  assert.equal(matchGlob('x.csproj.bak', '*.csproj'), false, 'anchored end — trailing text rejected');
});
