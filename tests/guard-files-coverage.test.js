/**
 * Coverage-hardening for src/hooks/guard-files.js — the PreToolUse secret-guard.
 *
 * This is a PROTECTIVE hook: it BLOCKS (the harness deny protocol —
 * permissionDecision:"deny" on stdout + exit 2, via emitDeny) any tool call whose
 * target path or Bash command points at a secret-bearing file, and ALLOWS (exit 0) anything
 * else. The load-bearing behavior is the BLOCK-vs-ALLOW decision boundary — for
 * every guarded pattern there is an allow-list carve-out or word-boundary that a
 * mutant could wrongly flip. Each test below pins one such boundary so that
 * removing a pattern, dropping a `\b`, deleting the negative-lookahead, changing
 * a `||`/`&&`, or skipping the backslash normalization turns the test RED.
 *
 * Every expected value in this file was verified against the REAL module before
 * being written (not derived from reading the regex) — see the two probes run
 * during authoring. Notably `app.token` is ALLOWED (the `\.token` alternative
 * requires a `/_.-`/start separator immediately before the dot), so the token
 * block cases use `.token` at a segment start, never mid-word.
 *
 * TWO execution surfaces:
 *   1. The exported pure matcher `isSecretTarget` — required in-process, fast,
 *      drives every pattern and its negation.
 *   2. The hook as a real process — spawned with a PreToolUse JSON payload on
 *      stdin and/or CLAUDE_TOOL_INPUT in env, asserting the real exit code and
 *      stderr. This is the only way to exercise the un-exported readStdinJson,
 *      getTarget, and main (guarded by `require.main === module`). Child V8
 *      coverage is aggregated back through the inherited NODE_V8_COVERAGE env.
 *
 * DOCUMENTED UNREACHABLE (honesty clause — never fabricated a hit):
 *   Lines 122-125, the outer `catch (err)` fail-open in main(), cannot be
 *   reached through the hook's real invocation. Everything inside main()'s try
 *   swallows its own errors: readStdinJson has an internal try/catch, getTarget
 *   wraps its JSON.parse in try/catch, and isSecretTarget only does String(...)
 *   + RegExp.test(...) which never throw. process.exit / process.stderr.write do
 *   not throw for a piped child. No public input makes the try body throw, so
 *   the fail-open branch is defensive-only. It is left uncovered by design.
 *
 * Run: node --test tests/guard-files-coverage.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'guard-files.js');
const { isSecretTarget, PROTECTED_PATTERNS } = require(HOOK);

// ---------------------------------------------------------------------------
// Cluster 1 — isSecretTarget BLOCK decisions: each row proves one pattern is
// load-bearing. A mutant that deletes the pattern makes exactly its rows fail.
// The target values are chosen so ONLY the intended pattern matches (earlier
// `.test()` calls in `.some()` return false), which also walks the `.some()`
// short-circuit forward to the later patterns.
// ---------------------------------------------------------------------------
describe('isSecretTarget — guarded targets are BLOCKED', () => {
  const BLOCKED = [
    { id: 'dotenv-bare', target: '.env' },
    { id: 'dotenv-local', target: 'app/.env.local' },
    { id: 'dotenv-production', target: '.env.production' }, // NOT an exempt suffix
    { id: 'direnv-envrc', target: 'project/.envrc' },       // only pattern 2 catches this
    { id: 'secrets-json', target: 'config/secrets.json' },
    { id: 'secret-yaml', target: 'secret.yaml' },
    { id: 'secrets-yml', target: 'secrets.yml' },
    { id: 'secret-toml', target: 'secret.toml' },
    { id: 'credentials-file-json', target: 'aws/credentials.json' },
    { id: 'credentials-dotfile', target: '.credentials' },
    { id: 'credentials-at-start', target: 'credentials' },
    { id: 'id_rsa', target: 'home/.ssh/id_rsa' },
    { id: 'id_ed25519', target: 'id_ed25519' },
    { id: 'id_wildcard-branch', target: 'id_custom' },      // the `\w+` alternation
    { id: 'pem-file', target: 'server.pem' },
    { id: 'key-file-with-suffix', target: 'server.key.backup' }, // `\b` after key
    { id: 'kube-config', target: 'home/.kube/config' },
    { id: 'aws-dir', target: '.aws/credentials' },
    { id: 'ssh-dir', target: '.ssh/known_hosts' },
    { id: 'access_token-underscore', target: 'access_token' },
    { id: 'refresh-token-dash', target: 'refresh-token' },
    { id: 'auth_token-underscore', target: 'auth_token' },
    { id: 'dot-token-at-start', target: '.token' },
    { id: 'dot-token-after-slash', target: 'config/.token' },
    { id: 'tokens-json', target: 'tokens.json' },
    { id: 'token-txt', target: 'token.txt' },
  ];

  for (const { id, target } of BLOCKED) {
    it(`should_block_when_target_is_${id}`, () => {
      // Act
      const blocked = isSecretTarget(target);

      // Assert — the guard must classify this as a secret target
      assert.equal(blocked, true, `${target} must be blocked`);
    });
  }
});

// ---------------------------------------------------------------------------
// Cluster 2 — isSecretTarget ALLOW carve-outs & boundaries. These are the
// non-obvious negations: a mutant that drops the negative-lookahead, a `\b`,
// the `(?:^|[/\\])` anchor, or the `[_-]` separator would WRONGLY block these
// innocuous targets, turning exactly these rows RED. This is the security-vs-
// usability boundary the hook exists to get right.
// ---------------------------------------------------------------------------
describe('isSecretTarget — innocuous targets are ALLOWED (carve-outs)', () => {
  const ALLOWED = [
    { id: 'env-example', target: '.env.example' },          // negative-lookahead exemption
    { id: 'env-sample', target: '.env.sample' },
    { id: 'env-template', target: '.env.template' },
    { id: 'environment-word', target: '.environment' },     // `\b` after env blocks a false hit
    { id: 'secrets-txt-wrong-ext', target: 'secrets.txt' }, // ext not in (yaml|json|toml)
    { id: 'source-about-credentials', target: 'src/get-credentials.ts' }, // `-` not an anchor
    { id: 'mycredentials-no-anchor', target: 'foo/mycredentials' },
    { id: 'keystore-boundary', target: '.keystore' },       // `.key\b` — no boundary before `store`
    { id: 'monkey-no-dotkey', target: 'monkey.txt' },
    { id: 'refreshToken-camelcase', target: 'src/auth/refreshToken.js' }, // needs `_`/`-`, not camelCase
    { id: 'tokenizer-source', target: 'lib/tokenizer.js' },
    { id: 'mytoken-source', target: 'mytoken.js' },
    { id: 'app-dot-token-midword', target: 'app.token' },   // `.token` needs separator before the dot
    { id: 'plain-readme', target: 'README.md' },
    { id: 'plain-source', target: 'src/index.js' },
  ];

  for (const { id, target } of ALLOWED) {
    it(`should_allow_when_target_is_${id}`, () => {
      // Act
      const blocked = isSecretTarget(target);

      // Assert — the guard must NOT flag an innocuous target
      assert.equal(blocked, false, `${target} must be allowed`);
    });
  }
});

// ---------------------------------------------------------------------------
// Cluster 3 — cross-platform normalization + the falsy guard. Kills the mutant
// that removes `.replace(/\\/g, '/')` (Windows backslash paths would then slip
// past `.kube/config`, `.aws/`, `.ssh/`) and the mutant that removes the
// `if (!target) return false` short-circuit.
// ---------------------------------------------------------------------------
describe('isSecretTarget — normalization and falsy guard', () => {
  it('should_block_windows_backslash_kube_config_after_normalization', () => {
    // Arrange — a Windows-style path with backslash separators
    const winPath = 'C:\\Users\\me\\.kube\\config';

    // Act
    const blocked = isSecretTarget(winPath);

    // Assert — `\.kube\/config` only matches once backslashes become slashes
    assert.equal(blocked, true);
  });

  it('should_block_windows_backslash_aws_dir_after_normalization', () => {
    const blocked = isSecretTarget('C:\\Users\\me\\.aws\\credentials');
    assert.equal(blocked, true);
  });

  it('should_block_windows_backslash_ssh_dir_after_normalization', () => {
    const blocked = isSecretTarget('C:\\Users\\me\\.ssh\\id_rsa');
    assert.equal(blocked, true);
  });

  const FALSY = [
    { id: 'empty-string', target: '' },
    { id: 'undefined', target: undefined },
    { id: 'null', target: null },
  ];
  for (const { id, target } of FALSY) {
    it(`should_allow_when_target_is_falsy_${id}`, () => {
      // Act
      const blocked = isSecretTarget(target);

      // Assert — a missing target is never a secret; the guard fails open here
      assert.equal(blocked, false);
    });
  }

  it('should_export_a_nonempty_frozen_pattern_list', () => {
    // Guards against an accidental empty-array mutation that would disable the hook.
    assert.ok(Array.isArray(PROTECTED_PATTERNS));
    assert.ok(PROTECTED_PATTERNS.length >= 10, 'pattern list must not be gutted');
    assert.ok(PROTECTED_PATTERNS.every(p => p instanceof RegExp));
  });
});

// ---------------------------------------------------------------------------
// Cluster 4 — the hook as a REAL process. Exercises readStdinJson, getTarget,
// and main (all un-exported, guarded by require.main === module). Each test
// asserts the harness-visible contract: BLOCK = permissionDecision:"deny" on
// stdout + exit 2 (emitDeny) + stderr banner; ALLOW = exit 0 silent.
// process.env is spread so the child inherits
// NODE_V8_COVERAGE and its coverage is aggregated.
// ---------------------------------------------------------------------------
describe('guard-files hook process — getTarget source resolution + exit codes', () => {
  /** Spawn the real hook. `env` may override CLAUDE_TOOL_INPUT; stdin carries `input`. */
  function runHook({ toolInput = '', envToolInput = '' }) {
    return spawnSync(process.execPath, [HOOK], {
      input: toolInput,
      env: { ...process.env, CLAUDE_TOOL_INPUT: envToolInput },
      encoding: 'utf8',
    });
  }

  it('should_exit_1_and_warn_when_stdin_file_path_is_secret', () => {
    // Arrange — a PreToolUse payload on stdin; env carries no tool input
    const payload = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '.env' } });

    // Act
    const res = runHook({ toolInput: payload });

    // Assert — the REAL harness block: permissionDecision:"deny" on stdout (the
    // only signal the harness treats as blocking) + the human banner on stderr.
    // A bare exit 1 with empty stdout let the secret access proceed.
    assert.equal(res.status, 2); // BLOCK = harness deny exit code (emitDeny)
    assert.match(res.stdout, /"permissionDecision":"deny"/);
    assert.match(res.stderr, /guard-files BLOCKED/);
  });

  it('should_exit_0_when_stdin_file_path_is_innocuous', () => {
    const payload = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'README.md' } });

    const res = runHook({ toolInput: payload });

    assert.equal(res.status, 0);
    assert.doesNotMatch(res.stderr || '', /BLOCKED/);
  });

  it('should_exit_1_when_env_CLAUDE_TOOL_INPUT_file_path_is_secret', () => {
    // env branch of getTarget: JSON.parse(CLAUDE_TOOL_INPUT) succeeds and wins
    const res = runHook({ envToolInput: JSON.stringify({ file_path: 'config/secrets.json' }) });

    assert.equal(res.status, 2); // BLOCK = harness deny exit code (emitDeny); a bare exit 1 was NON-blocking
  });

  it('should_exit_1_when_target_is_a_bash_command_reading_a_secret', () => {
    // command extraction path: `cat .env` with an empty file_path
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'cat .env' } });

    const res = runHook({ toolInput: payload });

    assert.equal(res.status, 2); // BLOCK = harness deny exit code (emitDeny); a bare exit 1 was NON-blocking
  });

  it('should_resolve_env_path_field_via_second_or_operand', () => {
    // getTarget: parsed.path is the 2nd operand of `file_path || path || notebook_path`
    const res = runHook({ envToolInput: JSON.stringify({ path: '.aws/credentials' }) });

    assert.equal(res.status, 2); // BLOCK = harness deny exit code (emitDeny); a bare exit 1 was NON-blocking
  });

  it('should_resolve_env_notebook_path_field_via_third_or_operand', () => {
    // getTarget: parsed.notebook_path is the 3rd operand — a mutant dropping it would allow this
    const res = runHook({ envToolInput: JSON.stringify({ notebook_path: 'id_rsa' }) });

    assert.equal(res.status, 2); // BLOCK = harness deny exit code (emitDeny); a bare exit 1 was NON-blocking
  });

  it('should_resolve_stdin_path_field_when_env_absent', () => {
    // stdin fallback, 2nd operand: tool_input.path
    const payload = JSON.stringify({ tool_input: { path: '.ssh/id_rsa' } });

    const res = runHook({ toolInput: payload });

    assert.equal(res.status, 2); // BLOCK = harness deny exit code (emitDeny); a bare exit 1 was NON-blocking
  });

  it('should_resolve_stdin_notebook_path_field_when_env_absent', () => {
    // stdin fallback, 3rd operand: tool_input.notebook_path
    const payload = JSON.stringify({ tool_input: { notebook_path: 'model.pem' } });

    const res = runHook({ toolInput: payload });

    assert.equal(res.status, 2); // BLOCK = harness deny exit code (emitDeny); a bare exit 1 was NON-blocking
  });

  it('should_fall_through_to_stdin_when_env_json_is_malformed', () => {
    // getTarget: JSON.parse('not json{') throws -> catch -> stdin is consulted
    const payload = JSON.stringify({ tool_input: { file_path: '.env' } });

    const res = runHook({ toolInput: payload, envToolInput: 'not json{' });

    assert.equal(res.status, 2); // BLOCK = harness deny exit code (emitDeny); a bare exit 1 was NON-blocking
  });

  it('should_NOT_consult_stdin_when_env_supplies_a_command', () => {
    // The `(!filePath && !command)` gate: a non-secret env command short-circuits
    // the stdin fallback, so the secret file_path on stdin is never seen -> ALLOW.
    const res = runHook({
      envToolInput: JSON.stringify({ command: 'echo safe' }),
      toolInput: JSON.stringify({ tool_input: { file_path: '.env' } }),
    });

    assert.equal(res.status, 0);
  });

  it('should_exit_0_when_both_stdin_and_env_are_empty', () => {
    // readStdinJson: empty buffer -> null; getTarget env '' -> parse throws -> stdin null
    const res = runHook({ toolInput: '', envToolInput: '' });

    assert.equal(res.status, 0);
  });

  it('should_exit_0_when_stdin_json_has_no_tool_input', () => {
    // getTarget: `stdinJson && stdinJson.tool_input` is falsy -> no fallback extraction
    const res = runHook({ toolInput: JSON.stringify({ tool_name: 'Read' }) });

    assert.equal(res.status, 0);
  });

  it('should_exit_0_when_stdin_json_is_malformed', () => {
    // readStdinJson: JSON.parse('{bad') throws -> internal catch -> null -> ALLOW (fails open)
    const res = runHook({ toolInput: '{bad' });

    assert.equal(res.status, 0);
  });
});
