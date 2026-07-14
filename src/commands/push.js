#!/usr/bin/env node
/**
 * /ctoc:push — real entry point behind the push slash command.
 *
 * Runs Tier-1 (blocking) quality checks, then `git push` ONLY when they pass.
 * Reuses the check/push building blocks exported by src/lib/quality-agent.js
 * (this file owns the documented flag semantics; the engine owns the runners).
 *
 * Documented flags (mirrors src/commands/push.md):
 *   (none)        run quality checks, push on success
 *   --force       push even with Tier-2 warnings (NEVER overrides a Tier-1 fail)
 *   --skip-tests  omit ONLY the test runner (lint + typecheck + security still run)
 *   --dry-run     run checks but do not push ("Would push to <remote/branch>")
 *
 * Testability: `run(opts, deps)` is a dependency-injection seam. The test injects
 * fake check runners and a fake pusher so no real suite runs and no network push
 * happens. Each dep defaults to the real quality-agent / tool-detector function.
 *
 * Cross-platform: no bash. The only process spawn lives in the reused
 * pushToRemote() (`git push`), which interpolates no flag. The silent
 * pull-rebase-retry it used to perform on rejection is GONE (R3-C): a machine
 * never rewrites the human's history unattended. This command IS the human's
 * push ship gate — the one sanctioned, ungated push path in CTOC.
 */

const qualityAgent = require('../lib/quality-agent');
const toolDetector = require('../lib/tool-detector');

/**
 * Parse the documented push flags. Unrecognized `--flags` are collected in
 * `unknown` so main() can exit non-zero naming them — nothing is silently ignored.
 * @param {string[]} argv
 * @returns {{ force: boolean, skipTests: boolean, dryRun: boolean, unknown: string[] }}
 */
function parsePushArgs(argv = []) {
  const opts = { force: false, skipTests: false, dryRun: false, unknown: [] };
  for (const arg of argv) {
    switch (arg) {
      case '--force':
        opts.force = true;
        break;
      case '--skip-tests':
        opts.skipTests = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      default:
        if (arg.startsWith('-')) {
          opts.unknown.push(arg);
        }
        // Bare positional args are ignored (push takes none); only stray
        // `--flags` are treated as errors so a typo never passes silently.
        break;
    }
  }
  return opts;
}

/**
 * Run the check-then-push flow.
 * @param {{ force?: boolean, skipTests?: boolean, dryRun?: boolean,
 *   projectRoot?: string }} opts - `projectRoot` scopes the security scan to the
 *   right tree (defaults to process.cwd() in main()); without it the scan ran
 *   against whatever cwd happened to be, not the repo being pushed.
 * @param {object} deps injectable seam; each defaults to the real function.
 * @returns {Promise<{ ok: boolean, pushed: boolean, blockedBy: string[],
 *   tier: (1|2|null), dryRun: boolean, text: string }>}
 */
async function run(opts = {}, deps = {}) {
  const d = {
    detect: deps.detect || (() => toolDetector.detectTools()),
    runLint: deps.runLint || qualityAgent.runLint,
    runTypecheck: deps.runTypecheck || qualityAgent.runTypecheck,
    runSmartTests: deps.runSmartTests || qualityAgent.runSmartTests,
    runSecurityScan: deps.runSecurityScan || qualityAgent.runSecurityScan,
    pushToRemote: deps.pushToRemote || qualityAgent.pushToRemote,
    logger: deps.logger || console
  };

  const lines = [];
  const say = (s) => {
    lines.push(s);
    d.logger.log(s);
  };

  const detection = d.detect() || {};
  const tools = detection.tools || {};

  // Tier-1 (blocking) checks, in the engine's order. `--skip-tests` omits ONLY
  // the test runner. Every failure is recorded in `blockedBy`.
  const blockedBy = [];

  const lint = await d.runLint(tools);
  if (!lint.passed) blockedBy.push('lint');

  const typecheck = await d.runTypecheck(tools);
  if (!typecheck.passed) blockedBy.push('typecheck');

  if (!opts.skipTests) {
    const tests = await d.runSmartTests(tools);
    if (!tests.passed) blockedBy.push('tests');
  }

  // Scope the security scan to the repo being pushed (its LIVE default delta path).
  const security = await d.runSecurityScan(tools, opts.projectRoot ? { projectRoot: opts.projectRoot } : {});
  if (!security.passed) blockedBy.push('security');

  // Tier-1 failure ALWAYS blocks — `--force` affects Tier-2 warnings only and
  // never flips a Tier-1 block (push.md: "Fail (Tier 1): Block push").
  if (blockedBy.length > 0) {
    say(`Quality checks failed (Tier 1): ${blockedBy.join(', ')}. Not pushing.`);
    return {
      ok: false,
      pushed: false,
      blockedBy,
      tier: 1,
      dryRun: !!opts.dryRun,
      text: lines.join('\n')
    };
  }

  // Tier-1 passed. `--dry-run` reports intent without pushing.
  if (opts.dryRun) {
    say('Quality checks passed. Would push to origin (current branch). (dry run — not pushing)');
    return {
      ok: true,
      pushed: false,
      blockedBy: [],
      tier: null,
      dryRun: true,
      text: lines.join('\n')
    };
  }

  // Clean Tier-1 pass → push.
  const pushed = d.pushToRemote() === true;
  if (pushed) {
    say('Pushed to remote.');
  } else {
    say('Quality checks passed, but git push failed.');
  }
  return {
    ok: pushed,
    pushed,
    blockedBy: [],
    tier: null,
    dryRun: false,
    text: lines.join('\n')
  };
}

/**
 * CLI entry: parse flags, reject unknowns non-zero, run, print, set exit code.
 * @param {string[]} argv defaults to process.argv.slice(2)
 */
async function main(argv = process.argv.slice(2)) {
  const opts = parsePushArgs(argv);

  if (opts.unknown.length > 0) {
    console.error(`Unknown flag(s): ${opts.unknown.join(', ')}`);
    console.error('Valid flags: --force, --skip-tests, --dry-run');
    process.exitCode = 2;
    return;
  }

  // The live /ctoc:push scopes every check to the repo it is invoked in.
  const result = await run({ ...opts, projectRoot: process.cwd() });
  process.exitCode = result.ok ? 0 : 1;
  return result;
}

module.exports = { parsePushArgs, run, main };

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error('push error:', err);
    process.exitCode = 1;
  });
}
