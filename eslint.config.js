/**
 * ESLint flat config for CTOC.
 *
 * CTOC is a Node.js CommonJS Claude Code plugin with no build step. This config
 * targets real bugs (undefined variables, unused variables, unsafe patterns) and
 * deliberately avoids pure-style/formatting churn.
 *
 * Composition (per 2025 flat-config best practice):
 *   - @eslint/js          : eslint:recommended (core correctness rules)
 *   - eslint-plugin-n     : Node.js-specific correctness rules
 *   - eslint-plugin-security : security smell detection (injection, fs, child_process)
 *
 * Sources:
 *   - https://eslint.org/blog/2022/08/new-config-system-part-2/  (flat config, sourceType: "commonjs")
 *   - https://github.com/eslint-community/eslint-plugin-n        (n/recommended-script for CJS)
 *   - https://www.npmjs.com/package/eslint-plugin-security       (configs.recommended)
 */

'use strict';

const js = require('@eslint/js');
const nodePlugin = require('eslint-plugin-n');
const security = require('eslint-plugin-security');

module.exports = [
  // Ignore generated, vendored, and non-plugin-distribution code.
  {
    ignores: [
      'node_modules/**',
      'examples/**', // gitignored Next.js/TS demo apps — not part of the plugin
      'plans/**',
      '.ctoc/state/**',
      '.ctoc/quality-state/**',
      'evals/**/fixtures/**'
    ]
  },

  // Core correctness baseline.
  js.configs.recommended,

  // Node.js correctness rules. recommended-script is the CommonJS variant.
  nodePlugin.configs['flat/recommended-script'],

  // Security smell detection (all rules ship as "warn" in the recommended config).
  security.configs.recommended,

  // Project-wide language options and rule tuning.
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js runtime globals.
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'writable',
        require: 'readonly',
        exports: 'writable',
        global: 'readonly',
        globalThis: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        queueMicrotask: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        structuredClone: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly'
      }
    },
    rules: {
      // --- Real-bug rules (errors) ---
      'no-unused-vars': [
        'error',
        {
          args: 'none', // signature params often document an interface
          varsIgnorePattern: '^_',
          caughtErrors: 'none', // `catch (e)` left unused is idiomatic here
          ignoreRestSiblings: true
        }
      ],
      'no-undef': 'error',
      'no-fallthrough': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-self-assign': 'error',
      'no-unsafe-negation': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
      // The codebase intentionally strips/measures ANSI color codes with the
      // canonical /\x1b\[[0-9;]*m/g pattern for terminal UI. The \x1b control
      // char is the whole point; flagging it is a false positive. Off with cause.
      'no-control-regex': 'off',

      // --- Node correctness: keep as errors, but allow patterns this repo relies on ---
      // Plugin loads peer deps and Node built-ins dynamically; dependency graph is
      // intentionally loose (no package.json deps section). These would be all noise.
      'n/no-missing-require': 'off',
      'n/no-unpublished-require': 'off',
      'n/no-extraneous-require': 'off',
      // The repo targets modern Node (engines >=18) and uses current APIs deliberately.
      'n/no-unsupported-features/node-builtins': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      'n/no-process-exit': 'off', // CLI entry points and hooks exit by design
      'n/hashbang': 'off', // executable hooks/scripts use shebangs intentionally

      // --- Security: child_process is the highest-signal rule for this codebase ---
      // Surface every spawn/exec call for human review; keep as warn so the suite
      // can still pass while making the surface visible.
      'security/detect-child-process': 'warn',
      // Dynamic fs paths are pervasive and intentional (plan/state file I/O driven
      // by user input by design). Keeping as warn avoids hundreds of unactionable
      // errors while still flagging the pattern. Justification: this repo's core job
      // is reading/writing plan files at computed paths; these are not bugs.
      'security/detect-non-literal-fs-filename': 'warn',
      // Dynamic require is used for optional/peer module loading — warn, not error.
      'security/detect-non-literal-require': 'warn',
      // Regex from variables appears in detectors; warn (potential ReDoS surface).
      'security/detect-non-literal-regexp': 'warn',
      // Object-injection is extremely noisy and low-signal on trusted internal data.
      // Justification: nearly every bracket access on an object trips this; it does
      // not distinguish trusted keys from attacker-controlled ones. Downgraded to off
      // to avoid mass false positives that would drown real findings.
      'security/detect-object-injection': 'off'
    }
  },

  // Tests may use additional globals from node:test and assert-style patterns.
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly'
      }
    },
    rules: {
      // Tests legitimately exercise child_process and dynamic paths against fixtures.
      'security/detect-child-process': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-require': 'off'
    }
  }
];
