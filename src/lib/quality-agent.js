#!/usr/bin/env node
/**
 * Background Quality Agent
 *
 * Runs all quality checks asynchronously after commit.
 * Auto-pushes on success, notifies on failure.
 *
 * Features:
 * - Detects test frameworks automatically
 * - Runs only affected tests when possible (smart test selection)
 * - Uses lockfile to prevent concurrent runs
 * - Self-heals from interrupted runs
 * - Terminal notifications
 * - Tiered execution (Tier 1 blocking, Tier 2 warning)
 * - Pull-rebase-push on remote conflict
 *
 * Dual role: this file is BOTH a script and a library.
 *  - As a script (run directly): a `require.main === module` guard runs main().
 *  - As a library (require'd): it exports the reusable check/push building blocks
 *    (runLint, runTypecheck, runSmartTests, runFullTests, runSecurityScan,
 *    runTieredChecks, pushToRemote, printSummary) with NO auto-run side effect.
 *    Consumed by src/commands/push.js.
 */

const { execSync } = require('child_process');
const path = require('path');
const safeFs = require('./safe-fs');

const qualityState = require('./quality-state');
const toolDetector = require('./tool-detector');
const { findChangedFiles } = require('./hash-utils');
const { findAffectedTests } = require('./coverage-map');

// The real security fleet — wired into the live quality path (push.js →
// runSecurityScan) so Iron Loop Step 13 SECURE performs a genuine scan instead
// of the six naive inline regexes that used to live here. Each scanner degrades
// LOUDLY: a missing external tool is announced as a skip, never a silent pass,
// and never a crash.
const { SecretsScanner } = require('./secrets-scanner');
const { DependencyAuditor, auditedLanguagesFor } = require('./dependency-auditor');
const { SASTRunner, TOOL_CONFIGS } = require('./sast-runner');
const { SCARunner } = require('./sca-runner');
const { MigrationSafetyChecker } = require('./migration-safety-checker');
const { FrameworkSecurityChecker } = require('./framework-security-checker');

// R3-C: the push ship gate. The quality agent runs UNATTENDED after every commit;
// it may check, it may report, it may NOT ship. `isAutoPushEnabled` is the only
// authority for a machine push and is false unless the human opted in.
const { isAutoPushEnabled } = require('./settings');

/**
 * Parse CLI arguments.
 *
 * SHIP GATE (R3-C): `onSuccess` now defaults to 'none', never 'push'. A machine
 * that pushes because nobody passed a flag is a machine crossing a human ship gate
 * by default. Even an explicit `--on-success=push` is not sufficient — the argv
 * only expresses INTENT; `maybePushOnSuccess` consults the canonical setting
 * (`git.autoPushEnabled`) for AUTHORITY.
 *
 * @param {string[]} [argv=process.argv.slice(2)] - argument vector (injectable for tests)
 * @returns {{triggeredBy: string, onSuccess: string, verbose: boolean}}
 */
function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    triggeredBy: 'manual',
    onSuccess: 'none',
    verbose: false
  };

  for (const arg of argv) {
    if (arg.startsWith('--triggered-by=')) {
      args.triggeredBy = arg.split('=')[1];
    } else if (arg.startsWith('--on-success=')) {
      args.onSuccess = arg.split('=')[1];
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    }
  }

  return args;
}

/**
 * Run a shell command and capture output
 */
function runCommand(cmd, options = {}) {
  // A quality check must never hang the gate forever. Every subprocess is bounded;
  // 300000ms (5 min) matches the SAST default. A command that a caller expects to
  // watch/tail/wait-on-stdin would otherwise pin the gate indefinitely.
  const { silent = false, allowFail = false, timeout = 300000 } = options;

  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout
    });
    return { success: true, output: output?.trim() || '' };
  } catch (err) {
    // A timeout (execSync sets err.killed / err.signal='SIGTERM', or code ETIMEDOUT)
    // is a LOUD failure, never a swallow.
    const timedOut = Boolean(err.killed) || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT';
    if (allowFail) {
      const result = { success: false, output: err.stdout || '', error: err.message };
      if (timedOut) result.timedOut = true;
      return result;
    }
    // Non-allowFail callers (e.g. pushToRemote's `git push`) rely on throw-to-fail;
    // returning here would let them mistake a timeout for success. Re-throw loudly.
    throw err;
  }
}

/**
 * Run lint check
 */
async function runLint(tools) {
  console.log('\n  Running lint...');

  for (const [_lang, langTools] of Object.entries(tools)) {
    if (!langTools.lint) continue;

    const result = runCommand(langTools.lint, { allowFail: true, silent: true });
    if (!result.success) {
      return {
        passed: false,
        errors: 1,
        warnings: 0,
        output: result.output || result.error
      };
    }
  }

  console.log('   Lint passed');
  return { passed: true, errors: 0, warnings: 0 };
}

/**
 * Run type check
 */
async function runTypecheck(tools) {
  console.log('\n  Running type check...');

  for (const [_lang, langTools] of Object.entries(tools)) {
    if (!langTools.typecheck) continue;

    const result = runCommand(langTools.typecheck, { allowFail: true, silent: true });
    if (!result.success) {
      return {
        passed: false,
        errors: 1,
        output: result.output || result.error
      };
    }
  }

  console.log('   Type check passed');
  return { passed: true, errors: 0 };
}

/**
 * Run specific test files using the appropriate framework command
 * @param {Object} tools - Detected tools per language
 * @param {string[]} testFiles - Specific test file paths
 * @returns {Object} Test result
 */
function runSpecificTests(tools, testFiles) {
  let totalPassed = 0;
  let totalFailed = 0;

  for (const [_lang, langTools] of Object.entries(tools)) {
    if (!langTools.test) continue;

    let cmd;
    if (langTools.testFramework === 'jest') {
      cmd = `npx jest ${testFiles.join(' ')}`;
    } else if (langTools.testFramework === 'vitest') {
      cmd = `npx vitest run ${testFiles.join(' ')}`;
    } else if (langTools.testFramework === 'pytest') {
      cmd = `pytest ${testFiles.join(' ')}`;
    } else if (langTools.testFramework === 'go') {
      // For Go, convert file paths to package paths. Go import paths are ALWAYS
      // forward-slashed, so normalize both separators to '/' FIRST (a Windows
      // coverage map yields backslash paths) and take the directory with posix
      // semantics — deterministic and identical on every platform. Using the
      // platform path.dirname here would emit `./pkg\sub/...` on Windows.
      const packages = [...new Set(testFiles.map(f => {
        const unix = f.split(/[\\/]+/).join('/');
        return './' + path.posix.dirname(unix) + '/...';
      }))];
      cmd = `go test ${packages.join(' ')}`;
    } else {
      // Fallback: run full suite
      cmd = langTools.test;
    }

    const result = runCommand(cmd, { allowFail: true, silent: true });

    if (!result.success) {
      return {
        passed: false,
        passCount: totalPassed,
        failed: totalFailed + 1,
        skipped: 0,
        flaky: 0,
        output: result.output || result.error
      };
    }

    // Try to parse pass count from output
    const passMatch = result.output?.match(/(\d+)\s*(passed|passing)/i);
    if (passMatch) {
      totalPassed += parseInt(passMatch[1]);
    }
  }

  return {
    passed: true,
    passCount: totalPassed,
    failed: 0,
    skipped: 0,
    flaky: 0
  };
}

/**
 * Run all tests (full suite fallback)
 */
async function runFullTests(tools) {
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const [lang, langTools] of Object.entries(tools)) {
    if (!langTools.test) continue;

    console.log(`   Running full ${lang} test suite...`);
    const result = runCommand(langTools.test, { allowFail: true, silent: true });

    if (!result.success) {
      const output = result.output || result.error || '';

      // Check for flaky indicators
      if (output.includes('flaky') || output.includes('retry')) {
        console.log('   Flaky tests detected - 0 tolerance policy');
        return {
          passed: false,
          passCount: totalPassed,
          failed: totalFailed + 1,
          skipped: totalSkipped,
          flaky: 1,
          output
        };
      }

      return {
        passed: false,
        passCount: totalPassed,
        failed: totalFailed + 1,
        skipped: totalSkipped,
        flaky: 0,
        output
      };
    }

    // Try to parse pass count from output
    const passMatch = result.output?.match(/(\d+)\s*(passed|passing)/i);
    if (passMatch) {
      totalPassed += parseInt(passMatch[1]);
    }
  }

  console.log(`   Tests passed (${totalPassed} total)`);
  return {
    passed: true,
    passCount: totalPassed,
    failed: 0,
    skipped: 0,
    flaky: 0
  };
}

/**
 * Run smart tests - only tests affected by changed files
 * Uses hash-based change detection and coverage map for test selection.
 */
async function runSmartTests(tools) {
  console.log('\n  Running tests...');

  // 1. Get changed files from git
  const changedResult = runCommand('git diff HEAD~1 --name-only', { silent: true, allowFail: true });
  const gitChangedFiles = (changedResult.output || '').split('\n').filter(f => f.trim());

  if (gitChangedFiles.length === 0) {
    console.log('   No changed files detected.');
    return { passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0, cached: true };
  }

  // 2. Compare hashes to find actually-changed files
  const cachedHashes = qualityState.getFileHashes();
  const hashResult = findChangedFiles(
    gitChangedFiles.map(f => path.resolve(f)),
    cachedHashes
  );

  if (hashResult.changed.length === 0) {
    console.log('   No file content changes detected. Cache valid.');
    return { passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0, cached: true };
  }

  console.log(`   ${hashResult.changed.length} file(s) changed`);

  // 3. Find affected tests via coverage map
  const affected = findAffectedTests(hashResult.changed, cachedHashes);

  if (affected.requiresFullSuite) {
    console.log(`   Full suite required: ${affected.reason}`);
    const result = await runFullTests(tools);

    // Update hash cache on success
    if (result.passed) {
      qualityState.updateFileHashes(hashResult.currentHashes);
    }

    return result;
  }

  if (affected.tests.length === 0) {
    console.log('   No tests affected by changes.');

    // Update hash cache
    qualityState.updateFileHashes(hashResult.currentHashes);

    return { passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0 };
  }

  // 4. Run only affected tests
  console.log(`   Running ${affected.tests.length} affected test(s)...`);
  const result = runSpecificTests(tools, affected.tests);

  // 5. Update hash cache on success
  if (result.passed) {
    qualityState.updateFileHashes(hashResult.currentHashes);
  }

  return result;
}

/**
 * List the files THIS PUSH introduces, relative to the project root — the real
 * push delta, scoped to what has NOT yet reached the upstream branch.
 *
 * R4-A finding: the old scope was `git diff HEAD~1` — the LAST COMMIT only. A
 * secret committed two commits back and not yet pushed was NEVER scanned, and the
 * gate was effectively blind to everything but the tip commit. The correct delta
 * is `@{upstream}..HEAD` (every commit on HEAD the remote does not yet have). When
 * there is no upstream (a brand-new branch with nothing to diff against), the
 * whole push is new, so ALL tracked files are the delta. Returns null only when
 * git itself is unavailable, so the caller falls back to a whole-project scan.
 *
 * @param {string} projectRoot
 * @returns {string[]|null}
 */
function getPushChangedFiles(projectRoot) {
  const gitOut = (args) => execSync(args, { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe' });
  try {
    // An upstream must exist for @{upstream} to resolve; probe it explicitly so
    // "no upstream" is handled deterministically rather than via a diff error.
    let hasUpstream = false;
    try {
      gitOut('git rev-parse --abbrev-ref --symbolic-full-name @{upstream}');
      hasUpstream = true;
    } catch {
      hasUpstream = false;
    }

    if (hasUpstream) {
      const out = gitOut('git diff @{upstream}..HEAD --name-only');
      return out.split('\n').map(f => f.trim()).filter(Boolean);
    }

    // No upstream → the entire branch is unpushed; every tracked file is new to
    // the remote. Scan them all rather than diffing against a nonexistent base.
    const tracked = gitOut('git ls-files');
    return tracked.split('\n').map(f => f.trim()).filter(Boolean);
  } catch {
    return null; // no git at all → caller scans the whole project directory
  }
}

/**
 * Run the real security scan (Iron Loop Step 13 SECURE).
 *
 * Aggregates four genuine scanners, each degrading LOUDLY:
 *   1. Secrets  — pure-JS SecretsScanner (no external tool). Always runs.
 *                 Scoped to the push delta by default; whole project when
 *                 `opts.allFiles` is set or git history is unavailable.
 *   2. Deps     — DependencyAuditor (npm/pip/go/cargo/... audit). Runs when a
 *                 package manager + its audit tool is present; otherwise the
 *                 absence is reported as an explicit skip.
 *   3. SAST     — SASTRunner (semgrep/bandit/gosec/eslint-security). Runs when a
 *                 scanner is available for a detected language; otherwise the
 *                 absence is reported as an explicit skip.
 *   4. SCA      — SCARunner (registry-driven dependency-CVE audit). npm audit /
 *                 pip-audit / cargo audit are parsed natively; every other
 *                 ecosystem routes to the osv-scanner universal pass. Runs when a
 *                 parseable scanner is available; otherwise a per-language skip.
 *
 * A finding at CRITICAL or HIGH severity from ANY scanner fails the gate. A
 * missing tool or a scanner that throws becomes a loud skip — it NEVER silently
 * passes and NEVER crashes the push.
 *
 * @param {Object} [_tools] detected tools (unused; scanners self-detect). Present
 *   for signature-compatibility with the other tiered runners.
 * @param {Object} [opts]
 * @param {string} [opts.projectRoot=process.cwd()]
 * @param {boolean} [opts.allFiles=false] scan the whole tree, not just the delta
 * @returns {Promise<{passed:boolean, critical:number, high:number, medium:number,
 *   details:string, skipped:string[]}>}
 */
async function runSecurityScan(_tools, opts = {}) {
  console.log('\n  Running security scan...');

  const projectRoot = opts.projectRoot || process.cwd();
  const skipped = [];
  const detail = [];
  let critical = 0;
  let high = 0;
  let medium = 0;

  const bump = (sev) => {
    if (sev === 'CRITICAL') critical++;
    else if (sev === 'HIGH') high++;
    else medium++; // MEDIUM/MODERATE/LOW/INFO surfaced but non-blocking
  };

  // 1. SECRETS — always runs (pure JS, no external dependency).
  try {
    const scanner = new SecretsScanner(projectRoot);
    const changed = opts.allFiles ? null : getPushChangedFiles(projectRoot);

    if (changed === null) {
      await scanner.run(); // whole project → populates scanner.findings
    } else {
      for (const rel of changed) {
        const abs = path.resolve(projectRoot, rel);
        if (!safeFs.existsSync(abs)) continue; // deleted/renamed in the delta
        if (!scanner.shouldScan(abs)) continue;
        scanner.findings.push(...scanner.scanFile(abs));
        scanner.scannedFiles++;
      }
    }

    const secretFindings = scanner.deduplicateFindings();
    for (const f of secretFindings) {
      bump(f.severity);
      detail.push(`secret[${f.severity}] ${f.name || f.type} at ${f.file}:${f.line}`);
    }
    console.log(secretFindings.length
      ? `   Secrets: ${secretFindings.length} finding(s)`
      : '   Secrets: none');

    // File-level skips the scanner RECORDED (an oversized file past maxFileSize, an
    // unreadable file, or an unreadable directory) are folded into skipped[] so a
    // file that was too large or unreadable to scan is VISIBLE — not a silent clean
    // pass. The gate is unchanged: a skip is not a finding and does NOT block (no
    // severity bump); the summary just stops erasing that N files went unscanned.
    // scanner.errors entries are {file|path|tool, error}; the location is relativized
    // to projectRoot for a legible, host-independent message.
    for (const e of (scanner.errors || [])) {
      const where = e.file || e.path || e.tool || 'unknown';
      const loc = (e.file || e.path)
        ? path.relative(projectRoot, where) || where
        : where;
      const msg = `secrets scan skipped file (NOT scanned): ${loc} — ${e.error}`;
      skipped.push(msg);
      console.log(`   ${msg}`);
    }
  } catch (err) {
    const msg = `secrets scan skipped (error, NOT a pass): ${err.message}`;
    skipped.push(msg);
    console.log(`   ${msg}`);
  }

  // 2. DEPENDENCIES — runs when a package-manager audit tool is present.
  try {
    const auditor = new DependencyAuditor(projectRoot);
    const managers = auditor.detectPackageManagers();
    if (managers.length === 0) {
      console.log('   Dependencies: no package manager detected — nothing to audit');
    } else {
      const available = managers.filter(m => auditor.isToolAvailable(m));
      const missing = managers.filter(m => !auditor.isToolAvailable(m));
      for (const m of missing) {
        const msg = `dependency audit skipped: ${m} audit tool not installed`;
        skipped.push(msg);
        console.log(`   ${msg}`);
      }
      if (available.length > 0) {
        const res = await auditor.run();
        for (const v of (res.vulnerabilities || [])) {
          bump(v.severity === 'MODERATE' ? 'MEDIUM' : v.severity);
          detail.push(`dependency[${v.severity}] ${v.package || v.name || 'unknown'}: ${v.title || v.advisory || ''}`.trim());
        }
        // Tool-level errors (e.g. registry unreachable) are loud skips, never
        // silent passes.
        for (const e of (res.errors || [])) {
          const msg = `dependency audit skipped (${e.manager || 'tool'}): ${e.error}`;
          skipped.push(msg);
          console.log(`   ${msg}`);
        }
        console.log(`   Dependencies: ${(res.vulnerabilities || []).length} vulnerability(ies)`);
      }
    }
  } catch (err) {
    const msg = `dependency audit skipped (error, NOT a pass): ${err.message}`;
    skipped.push(msg);
    console.log(`   ${msg}`);
  }

  // 3. SAST — runs when a static-analysis scanner is available.
  try {
    const sast = new SASTRunner(projectRoot);
    const languages = sast.detectLanguages();
    if (languages.length === 0) {
      console.log('   SAST: no supported language detected — nothing to scan');
    } else {
      // A language is scannable iff a scanner that can ACTUALLY parse its result is
      // installed — decided by the honest router, not by raw primary-tool presence.
      // securityRouteFor(l).native is a scanner this runner has a parser for (bandit/
      // gosec/eslint) or null; when it is null the only real coverage is the
      // multi-language semgrep universal pass. So a parser-less-tool language (java→
      // spotbugs, rust→cargo-audit, php→psalm, …) is scannable ONLY when semgrep is
      // installed — otherwise its "primary" (e.g. `mvn --version`) being present used
      // to mark it scannable while runLanguageScanner() then scanned it with NOTHING,
      // producing a silent scanned:true. Any unscannable language is a loud skip.
      const semgrep = sast.isToolAvailable('semgrep');
      const scannable = languages.filter(l => {
        const route = sast.securityRouteFor(l);
        return route.native ? sast.isToolAvailable(route.native) : semgrep;
      });
      const unscannable = languages.filter(l => !scannable.includes(l));
      for (const l of unscannable) {
        const tool = TOOL_CONFIGS[l] ? TOOL_CONFIGS[l].primary : 'a scanner';
        const msg = `SAST skipped for ${l}: no scanner installed (need semgrep or ${tool})`;
        skipped.push(msg);
        console.log(`   ${msg}`);
      }
      if (scannable.length > 0) {
        const res = await sast.run();
        // Belt-and-suspenders over the scannable filter above: if the runner itself
        // reports that no scanner actually ran, that is a loud skip, never a pass.
        if (res && res.scanned === false) {
          const msg = `SAST skipped: ${res.reason || 'no scanner ran'}`;
          skipped.push(msg);
          console.log(`   ${msg}`);
        }
        for (const f of (res.findings || [])) {
          bump(f.severity);
          detail.push(`sast[${f.severity}] ${f.rule || f.check || f.title || 'finding'} at ${f.file || '?'}:${f.line || 0}`);
        }
        for (const e of (res.errors || [])) {
          const msg = `SAST skipped (${e.tool || 'tool'}): ${e.error}`;
          skipped.push(msg);
          console.log(`   ${msg}`);
        }
        console.log(`   SAST: ${(res.findings || []).length} finding(s)`);
      }
    }
  } catch (err) {
    const msg = `SAST skipped (error, NOT a pass): ${err.message}`;
    skipped.push(msg);
    console.log(`   ${msg}`);
  }

  // 4. SCA — dependency-CVE audit (the composition half of security). Runs when a
  //    parseable SCA scanner is available for a detected language, mirroring the
  //    SAST step's honest routing exactly. osv-scanner is the universal engine; a
  //    language routes to a native parser (npm audit / pip-audit / cargo audit)
  //    only when this runner actually has one, otherwise to osv-scanner. A language
  //    with neither installed is a LOUD per-language skip, never a silent pass.
  try {
    // F2 partition: DependencyAuditor (step 2 above) already audits its covered
    // ecosystems (js/ts, python, go, rust, java, ruby, php). Handing SCA the same
    // languages would count the SAME CVE twice into the human-facing critical/high
    // tally and run the audit twice. SCA is therefore the osv-universal EXTENDER for
    // the long-tail ecosystems ONLY — it defers every DependencyAuditor-covered
    // language. The exclusion set is read from DependencyAuditor, never hardcoded.
    // F1 (coverage hole): deferral must key on what DependencyAuditor GENUINELY
    // audits FOR THIS PROJECT, not the static COVERED_LANGUAGES. The static set marks
    // python "covered" unconditionally (because `pip` is implemented), so a pipenv-
    // only (Pipfile.lock) project — whose detected manager `pipenv` DependencyAuditor
    // does NOT implement — had python deferred here and then hit the languages.length
    // === 0 short-circuit: sca.run() was NEVER called and the Pipfile.lock dependency
    // set was audited by NEITHER runner while the gate returned passed:true.
    // auditedLanguagesFor keys on DETECTED ∩ IMPLEMENTED per project, so an
    // unimplemented-manager ecosystem now flows to a real SCA scan (or an honest
    // scanned:false loud skip), while a genuinely audited ecosystem stays deferred
    // exactly once. sca.run() derives the identical per-project deferral internally,
    // so no excludeLanguages option is passed (the constructor ignores it anyway).
    const sca = new SCARunner(projectRoot);
    const detected = sca.detectLanguages();
    const audited = auditedLanguagesFor(projectRoot);
    const deferred = detected.filter((l) => audited.has(l));
    const languages = detected.filter((l) => !audited.has(l));
    if (deferred.length) {
      console.log(`   SCA: ${deferred.join(', ')} deferred to DependencyAuditor above (no double-count)`);
    }
    if (detected.length === 0) {
      console.log('   SCA: no supported language detected — no dependencies to audit');
    } else if (languages.length === 0) {
      console.log('   SCA: all detected ecosystems covered by DependencyAuditor — nothing further to audit');
    } else {
      // A language is scannable iff a scanner that can ACTUALLY parse its result is
      // installed — decided by the honest router. A native-routed language needs its
      // native tool; an osv-routed language needs osv-scanner. Never mark a language
      // scannable on the strength of a tool this runner cannot parse.
      const osvAvailable = sca.isToolAvailable('osv-scanner');
      const scannable = languages.filter((l) => {
        const route = sca.scaRouteFor(l);
        return route.native ? sca.isToolAvailable(route.native) : osvAvailable;
      });
      const unscannable = languages.filter((l) => !scannable.includes(l));
      for (const l of unscannable) {
        const route = sca.scaRouteFor(l);
        const need = route.native ? `${route.native} or osv-scanner` : 'osv-scanner';
        const msg = `SCA skipped for ${l}: no dependency scanner installed (need ${need})`;
        skipped.push(msg);
        console.log(`   ${msg}`);
      }
      if (scannable.length > 0) {
        const res = await sca.run();
        // Belt-and-suspenders over the scannable filter: if the runner itself reports
        // that no scanner actually ran, that is a loud skip, never a pass.
        if (res && res.scanned === false) {
          const msg = `SCA skipped: ${res.reason || 'no scanner ran'}`;
          skipped.push(msg);
          console.log(`   ${msg}`);
        }
        for (const f of (res.findings || [])) {
          bump(f.severity);
          detail.push(`sca[${f.severity}] ${f.package || 'dependency'}${f.advisory ? ` (${f.advisory})` : ''}: ${f.title || ''}`.trim());
        }
        for (const e of (res.errors || [])) {
          const msg = `SCA skipped (${e.tool || 'tool'}): ${e.error}`;
          skipped.push(msg);
          console.log(`   ${msg}`);
        }
        console.log(`   SCA: ${(res.findings || []).length} dependency finding(s)`);
      }
    }
  } catch (err) {
    const msg = `SCA skipped (error, NOT a pass): ${err.message}`;
    skipped.push(msg);
    console.log(`   ${msg}`);
  }

  // 5. MIGRATION SAFETY — destructive-DDL static scan (the databases-dimension
  //    consumer). Mirrors the SCA step's honesty exactly: a repo with NO migrations
  //    is a LOUD informational skip (scanned:false), NEVER a silent clean pass, and a
  //    HIGH destructive finding (DROP TABLE/COLUMN, ALTER…DROP, TRUNCATE, DROP
  //    DATABASE/SCHEMA) bumps the CRITICAL/HIGH gate tally — a migration that drops a
  //    table blocks like any other HIGH. Static core executes nothing (reads + regex).
  try {
    const migration = new MigrationSafetyChecker(projectRoot);
    const res = await migration.run();
    if (res && res.scanned === false) {
      const msg = `migration safety: ${res.reason || 'no migrations detected'} — informational, not a failure`;
      skipped.push(msg);
      console.log(`   ${msg}`);
    } else {
      for (const f of (res.findings || [])) {
        bump(f.severity);
        detail.push(`migration[${f.severity}] ${f.rule || 'destructive DDL'} at ${f.file || '?'}:${f.line || 0}`);
      }
      // Atlas (or file-read) errors are loud skips, never silent passes.
      for (const e of (res.errors || [])) {
        const msg = `migration safety skipped (${e.tool || 'tool'}): ${e.error}`;
        skipped.push(msg);
        console.log(`   ${msg}`);
      }
      console.log(`   Migration safety: ${(res.findings || []).length} destructive finding(s)`);
    }
  } catch (err) {
    const msg = `migration safety skipped (error, NOT a pass): ${err.message}`;
    skipped.push(msg);
    console.log(`   ${msg}`);
  }

  // 6. FRAMEWORK SECURITY — client-exposed-secret static scan (the frameworks-
  //    dimension consumer, "concerns → checks"). Mirrors the migration-safety step's
  //    honesty exactly: a repo with NO env-exposure framework is a LOUD informational
  //    skip (scanned:false), NEVER a silent clean pass, and a HIGH client-exposed
  //    secret (a public-prefixed env var whose NAME signals a secret — e.g.
  //    NEXT_PUBLIC_API_SECRET, inlined into the browser bundle) bumps the CRITICAL/
  //    HIGH gate tally: it blocks like any other HIGH. It reads NAMES only and never
  //    inspects or logs a value; executes nothing (reads + regex).
  try {
    const frameworkSec = new FrameworkSecurityChecker(projectRoot);
    const res = await frameworkSec.run();
    if (res && res.scanned === false) {
      const msg = `framework security: ${res.reason || 'no env-exposure framework detected'} — informational, not a failure`;
      skipped.push(msg);
      console.log(`   ${msg}`);
    } else {
      for (const f of (res.findings || [])) {
        bump(f.severity);
        detail.push(`framework-security[${f.severity}] ${f.varName || 'client-exposed secret'} at ${f.file || '?'}:${f.line || 0}`);
      }
      // File-read errors are loud skips, never silent passes.
      for (const e of (res.errors || [])) {
        const msg = `framework security skipped (${e.tool || 'tool'}): ${e.error}`;
        skipped.push(msg);
        console.log(`   ${msg}`);
      }
      console.log(`   Framework security: ${(res.findings || []).length} client-exposed secret(s)`);
    }
  } catch (err) {
    const msg = `framework security skipped (error, NOT a pass): ${err.message}`;
    skipped.push(msg);
    console.log(`   ${msg}`);
  }

  const passed = critical === 0 && high === 0;
  if (skipped.length) {
    console.log(`   Security: ${skipped.length} scanner(s) skipped (see above) — not counted as pass`);
  }
  console.log(passed
    ? `   Security scan clean (${medium} non-blocking finding(s))`
    : `   Security scan FAILED: ${critical} critical, ${high} high`);

  return {
    passed,
    critical,
    high,
    medium,
    details: detail.join('\n'),
    skipped
  };
}

/**
 * Run tiered quality checks
 * Tier 1: BLOCKING (must pass before push)
 * Tier 2: WARNING (should fix, does not block)
 */
async function runTieredChecks(tools) {
  // Tier 1: BLOCKING
  const tier1 = {
    lint: await runLint(tools),
    typecheck: await runTypecheck(tools),
    tests: await runSmartTests(tools),
    security: await runSecurityScan()
  };

  const tier1Passed = Object.values(tier1).every(r => r.passed);
  qualityState.updateTierStatus('tier1', {
    status: tier1Passed ? 'pass' : 'fail',
    checks: tier1
  });

  if (!tier1Passed) {
    return { tier1, tier2: null, allPassed: false, action: 'block' };
  }

  // Tier 2: WARNING (run only if Tier 1 passed)
  // Tier 2 checks are aspirational for v1; start with empty
  const tier2 = {};
  qualityState.updateTierStatus('tier2', {
    status: 'pass',
    checks: tier2
  });

  return { tier1, tier2, allPassed: true, action: 'push' };
}

/**
 * Push to remote.
 *
 * This is the MECHANISM, not the gate. Its only sanctioned automatic caller is
 * {@link maybePushOnSuccess}, which asks the ship gate first. Its other caller is
 * `src/commands/push.js` — the human's own `/ctoc:push`, where the keypress IS the
 * gate decision.
 *
 * R3-C removed the pull-rebase-retry (old "Decision 15"). On a rejected push the
 * agent used to run `git pull --rebase` and push again — a machine rewriting the
 * human's history unattended, in the background, after a commit hook. It now fails
 * LOUDLY and hands the branch back to the human, who decides how to reconcile.
 *
 * @returns {boolean} true iff the push succeeded
 */
function pushToRemote() {
  console.log('\n  Pushing to remote...');

  try {
    runCommand('git push', { silent: false });
    console.log('   Pushed successfully!');
    return true;
  } catch (err) {
    const errMsg = (err.message || err.error || '').toLowerCase();

    if (errMsg.includes('rejected') || errMsg.includes('non-fast-forward') || errMsg.includes('failed to push')) {
      console.log('   PUSH REJECTED: the remote is ahead of your branch.');
      console.log('   CTOC will NOT rebase your history unattended. Reconcile yourself:');
      console.log('     git pull --rebase    (then re-run /ctoc:push)');
      return false;
    }

    console.log('   Push failed:', err.message || err);
    return false;
  }
}

/**
 * THE PUSH SHIP GATE, at the one place the quality agent could ship (R3-C).
 *
 * The agent runs unattended in the background after every commit. Before this
 * function existed it pushed whenever the checks were green and argv said 'push' —
 * and the post-commit hook hardcoded exactly that argv, so a machine crossed the
 * human's ship gate on every green commit. Push is now authorized by ONE key
 * (`git.autoPushEnabled`, default false) and by nothing else: not argv, not an
 * environment variable, not an environment profile.
 *
 * @param {{onSuccess?: string}} args - parsed CLI args (intent)
 * @param {string} [projectPath] - project root (authority is read from here)
 * @returns {{pushed: boolean, reason: string}}
 */
function maybePushOnSuccess(args, projectPath = process.cwd()) {
  if (!args || args.onSuccess !== 'push') {
    return { pushed: false, reason: 'on-success is not push' };
  }

  if (!isAutoPushEnabled(projectPath)) {
    console.log('\n  Checks green. NOT pushing: push is a human ship gate.');
    console.log('   Ship it yourself with /ctoc:push, or opt a machine push in via');
    console.log('   Settings → Git → "Let CTOC push" (git.autoPushEnabled).');
    return {
      pushed: false,
      reason: 'auto-push disabled (ship gate) — the human ships via /ctoc:push'
    };
  }

  const ok = pushToRemote();
  return { pushed: ok, reason: ok ? 'auto-push enabled by the human' : 'push failed' };
}

/**
 * Print summary
 */
function printSummary(results, duration) {
  console.log('\n' + '='.repeat(50));
  console.log('                 QUALITY SUMMARY');
  console.log('='.repeat(50));

  const status = results.allPassed ? 'ALL CHECKS PASSED' : 'CHECKS FAILED';
  console.log(`\n  ${status}`);
  console.log(`  Duration: ${(duration / 1000).toFixed(1)}s\n`);

  const tier1 = results.tier1;
  if (tier1) {
    console.log('  Tier 1 (blocking):');
    console.log('    Lint:      ' + (tier1.lint.passed ? 'PASS' : 'FAIL'));
    console.log('    Typecheck: ' + (tier1.typecheck.passed ? 'PASS' : 'FAIL'));
    console.log('    Tests:     ' + (tier1.tests.passed ? 'PASS' : 'FAIL'));
    // F2 (honesty): the per-scanner console lines above are honest about skips, but
    // the SUMMARY the human acts on erased them — "Security: PASS" read identically
    // whether every scanner ran clean or N scanners never ran (tool absent, or the
    // F1 hole). Surface the skip count so the summary reflects PARTIAL coverage. The
    // gate is unchanged: skips legitimately do not block; the box just stops hiding.
    const securitySkips = Array.isArray(tier1.security.skipped) ? tier1.security.skipped.length : 0;
    const securityStatus = tier1.security.passed ? 'PASS' : 'FAIL';
    console.log('    Security:  ' + securityStatus + (securitySkips
      ? ` (${securitySkips} scanner(s) skipped — see log)`
      : ''));

    if (tier1.tests.passed && tier1.tests.passCount) {
      console.log(`\n  Tests: ${tier1.tests.passCount} passed`);
    }
  }

  if (results.tier2 && Object.keys(results.tier2).length > 0) {
    console.log('\n  Tier 2 (warnings):');
    for (const [name, check] of Object.entries(results.tier2)) {
      console.log(`    ${name}: ${check.passed ? 'PASS' : 'WARN'}`);
    }
  }

  console.log('\n' + '='.repeat(50));
}

/**
 * Main entry point
 */
async function main() {
  const args = parseArgs();
  const startTime = Date.now();

  console.log('\n  CTOC Quality Agent');
  console.log(`   Triggered by: ${args.triggeredBy}`);
  console.log(`   On success: ${args.onSuccess}`);

  // Recover from any interrupted runs
  qualityState.recoverIfNeeded();

  // Try to acquire lock
  if (!qualityState.acquireLock()) {
    console.log('\n  Another quality check is running. Exiting.');
    process.exit(0);
  }

  try {
    // Set running state (now includes gitHead tracking)
    qualityState.setRunning(args.triggeredBy);

    // Detect tools
    console.log('\n  Detecting tools...');
    const detection = toolDetector.detectTools();

    if (detection.languages.length === 0) {
      console.log('   No supported languages detected');
      qualityState.setCompleted(true, {});
      return;
    }

    console.log(`   Languages: ${detection.languages.join(', ')}`);

    // Check for missing tools
    if (detection.missing.length > 0) {
      console.log('\n  Missing tools:');
      for (const m of detection.missing) {
        console.log(`   - ${m.tool}: ${m.install}`);
      }
    }

    // Run tiered checks
    const results = await runTieredChecks(detection.tools);

    const duration = Date.now() - startTime;

    // Build summary for quality state. `runTieredChecks` returns a dynamically
    // shaped result whose per-tool sub-objects checkJs cannot infer — typed `any`.
    const tier1 = /** @type {any} */ (results.tier1 || {});
    qualityState.setCompleted(results.allPassed, {
      tests: tier1.tests || { passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0 },
      coverage: 0, // TODO: implement coverage
      lint: tier1.lint || { passed: true, errors: 0, warnings: 0 },
      typecheck: tier1.typecheck || { passed: true, errors: 0 },
      security: tier1.security || { passed: true, critical: 0, high: 0, medium: 0 }
    });

    // Print summary
    printSummary(results, duration);

    // Handle success/failure. The push decision is the ship gate's, not argv's.
    if (results.allPassed) {
      maybePushOnSuccess(args, process.cwd());
    } else {
      console.log('\n  Fix the issues above and commit again to retry.');
    }

  } finally {
    qualityState.releaseLock();
  }
}

// Run as a script only when invoked directly (guard the side-effect so that
// `require('./quality-agent')` reuses the check/push blocks WITHOUT starting a
// quality run or a real `git push`). Same proven pattern as the hooks.
if (require.main === module) {
  main().catch(err => {
    console.error('Quality agent error:', err);
    qualityState.releaseLock();
    process.exit(1);
  });
}

// Library surface — reusable check/push building blocks (consumed by
// src/commands/push.js). Exporting these does not change the script path above.
module.exports = {
  parseArgs,
  runCommand,
  runLint,
  runTypecheck,
  runSpecificTests,
  runSmartTests,
  runFullTests,
  runSecurityScan,
  runTieredChecks,
  pushToRemote,
  maybePushOnSuccess,
  printSummary
};
