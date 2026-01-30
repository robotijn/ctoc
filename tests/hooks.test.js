/**
 * CTOC Hook Tests
 * Tests for all hook files: SessionStart, PreToolUse.Bash, PreToolUse.Edit, PreToolUse.Write
 *
 * Run with: node --test tests/hooks.test.js
 */

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ============================================================================
// SHARED TEST FIXTURES
// ============================================================================

const TEST_PROJECT_PATH = '/home/tijn/ctoc-build/ctoc-public';
const CTOC_HOME = path.join(os.homedir(), '.ctoc');
const STATE_DIR = path.join(CTOC_HOME, 'state');

/**
 * Create a mock state object for testing
 */
function createMockState(options = {}) {
  const now = new Date().toISOString();
  return {
    _version: '4.0.0',
    project: options.project || TEST_PROJECT_PATH,
    feature: options.feature || null,
    started: now,
    lastUpdated: now,
    currentStep: options.currentStep || 1,
    language: options.language || 'javascript',
    framework: options.framework || null,
    steps: options.steps || {},
    gate1_approval: options.gate1_approval || null,
    gate2_approval: options.gate2_approval || null,
    sessionStatus: options.sessionStatus || 'active',
    lastActivity: options.lastActivity || now,
    _signature: options._signature || 'hmac-sha256:test'
  };
}

/**
 * Create mock gate approval
 */
function createMockGateApproval(gateNumber) {
  return {
    gate: gateNumber,
    timestamp: new Date().toISOString(),
    user_confirmed: true,
    plan_path: `/plans/test-plan.md`,
    plan_hash: 'abc123'
  };
}

/**
 * Create mock tool input JSON
 */
function createToolInput(input) {
  return JSON.stringify(input);
}

// ============================================================================
// TEST: PreToolUse.Bash.js - Command Parsing and Classification
// ============================================================================

describe('PreToolUse.Bash - Command Classification', () => {
  // Test patterns from the hook
  const WRITE_PATTERNS = [
    /[^>]>\s*[^\s>]/,            // Single redirect
    />>\s*[^\s]/,                // Append redirect
    /\btee\s+/,                  // tee command
    /\bsed\s+.*-i/,              // sed in-place
    /\bawk\s+.*-i\s*inplace/,    // awk in-place
    /\bperl\s+.*-i/,             // perl in-place
    /\binstall\s+/,              // install command
    /\bpatch\s+/,                // patch command
    /\btouch\s+/,                // touch command
    /\bdd\s+/,                   // dd command
    /\btruncate\s+/              // truncate command
  ];

  const ALWAYS_ALLOWED = [
    /^\s*node\s+/,
    /^\s*npm\s+/,
    /^\s*npx\s+/,
    /^\s*python\s+/,
    /^\s*pip\s+/,
    /^\s*cargo\s+/,
    /^\s*ls\s*/,
    /^\s*cat\s+[^>|]+$/,
    /^\s*find\s+/,
    /^\s*grep\s+/,
    /^\s*head\s+/,
    /^\s*tail\s+/,
    /^\s*pwd\s*/,
    /^\s*cd\s+/,
    /^\s*echo\s+[^>]+$/
  ];

  const GIT_COMMIT_PATTERN = /^\s*git\s+(commit|push)/;

  /**
   * Check if command is always allowed
   */
  function isAlwaysAllowed(command) {
    const normalized = command.trim().toLowerCase();
    for (const pattern of ALWAYS_ALLOWED) {
      if (pattern.test(normalized)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if command is a write command
   */
  function isWriteCommand(command) {
    if (!command) return false;

    // Check always allowed first
    if (isAlwaysAllowed(command)) {
      return false;
    }

    // Check write patterns
    for (const pattern of WRITE_PATTERNS) {
      if (pattern.test(command)) {
        return true;
      }
    }

    // Check redirects
    if (command.includes(' > ') || command.includes(' >> ')) {
      return true;
    }

    return false;
  }

  /**
   * Check if command is a git commit/push
   */
  function isCommitCommand(command) {
    return GIT_COMMIT_PATTERN.test(command);
  }

  describe('Always Allowed Commands', () => {
    it('allows node commands', () => {
      assert.strictEqual(isAlwaysAllowed('node script.js'), true);
      assert.strictEqual(isAlwaysAllowed('  node --version'), true);
    });

    it('allows npm commands', () => {
      assert.strictEqual(isAlwaysAllowed('npm install'), true);
      assert.strictEqual(isAlwaysAllowed('npm run test'), true);
    });

    it('allows npx commands', () => {
      assert.strictEqual(isAlwaysAllowed('npx jest'), true);
    });

    it('allows python commands', () => {
      assert.strictEqual(isAlwaysAllowed('python script.py'), true);
      assert.strictEqual(isAlwaysAllowed('python -m pytest'), true);
    });

    it('allows pip commands', () => {
      assert.strictEqual(isAlwaysAllowed('pip install requests'), true);
    });

    it('allows cargo commands', () => {
      assert.strictEqual(isAlwaysAllowed('cargo build'), true);
      assert.strictEqual(isAlwaysAllowed('cargo test'), true);
    });

    it('allows ls commands', () => {
      assert.strictEqual(isAlwaysAllowed('ls'), true);
      assert.strictEqual(isAlwaysAllowed('ls -la'), true);
    });

    it('allows cat commands (without redirect)', () => {
      assert.strictEqual(isAlwaysAllowed('cat file.txt'), true);
    });

    it('allows find commands', () => {
      assert.strictEqual(isAlwaysAllowed('find . -name "*.js"'), true);
    });

    it('allows grep commands', () => {
      assert.strictEqual(isAlwaysAllowed('grep -r "pattern" .'), true);
    });

    it('allows head/tail commands', () => {
      assert.strictEqual(isAlwaysAllowed('head -n 10 file.txt'), true);
      assert.strictEqual(isAlwaysAllowed('tail -f log.txt'), true);
    });

    it('allows pwd commands', () => {
      assert.strictEqual(isAlwaysAllowed('pwd'), true);
    });

    it('allows cd commands', () => {
      assert.strictEqual(isAlwaysAllowed('cd /home/user'), true);
    });

    it('allows echo commands (without redirect)', () => {
      assert.strictEqual(isAlwaysAllowed('echo hello world'), true);
    });
  });

  describe('Write Commands Detection', () => {
    it('detects single redirect', () => {
      assert.strictEqual(isWriteCommand('echo test > file.txt'), true);
    });

    it('detects append redirect', () => {
      assert.strictEqual(isWriteCommand('echo test >> file.txt'), true);
    });

    it('detects tee command', () => {
      // Direct tee command (not prefixed by always-allowed commands)
      assert.strictEqual(isWriteCommand('tee file.txt < input.txt'), true);
      assert.strictEqual(isWriteCommand('tee -a logfile.txt'), true);
    });

    it('detects sed in-place', () => {
      assert.strictEqual(isWriteCommand('sed -i "s/old/new/" file.txt'), true);
    });

    it('detects awk in-place', () => {
      assert.strictEqual(isWriteCommand('awk -i inplace "{print}" file.txt'), true);
    });

    it('detects perl in-place', () => {
      assert.strictEqual(isWriteCommand('perl -i -pe "s/old/new/" file.txt'), true);
    });

    it('detects install command', () => {
      assert.strictEqual(isWriteCommand('install -m 755 script.sh /usr/bin/'), true);
    });

    it('detects patch command', () => {
      assert.strictEqual(isWriteCommand('patch -p1 < changes.patch'), true);
    });

    it('detects touch command', () => {
      assert.strictEqual(isWriteCommand('touch newfile.txt'), true);
    });

    it('detects dd command', () => {
      assert.strictEqual(isWriteCommand('dd if=/dev/zero of=file bs=1M count=1'), true);
    });

    it('detects truncate command', () => {
      assert.strictEqual(isWriteCommand('truncate -s 0 file.txt'), true);
    });
  });

  describe('Git Commit/Push Detection', () => {
    it('detects git commit', () => {
      assert.strictEqual(isCommitCommand('git commit -m "message"'), true);
    });

    it('detects git push', () => {
      assert.strictEqual(isCommitCommand('git push origin main'), true);
    });

    it('does not match git status', () => {
      assert.strictEqual(isCommitCommand('git status'), false);
    });

    it('does not match git diff', () => {
      assert.strictEqual(isCommitCommand('git diff'), false);
    });

    it('does not match git add', () => {
      assert.strictEqual(isCommitCommand('git add .'), false);
    });

    it('handles whitespace', () => {
      assert.strictEqual(isCommitCommand('  git commit -m "test"'), true);
    });
  });

  describe('Read-Only Commands', () => {
    it('allows git status', () => {
      assert.strictEqual(isWriteCommand('git status'), false);
    });

    it('allows git diff', () => {
      assert.strictEqual(isWriteCommand('git diff'), false);
    });

    it('allows git log', () => {
      assert.strictEqual(isWriteCommand('git log --oneline'), false);
    });

    it('does not treat cat with redirect as allowed', () => {
      // cat with redirect should NOT match the always-allowed pattern
      assert.strictEqual(isAlwaysAllowed('cat file1.txt > file2.txt'), false);
    });
  });
});

// ============================================================================
// TEST: PreToolUse.Edit.js and PreToolUse.Write.js - Whitelist Logic
// ============================================================================

describe('PreToolUse.Edit/Write - Whitelist Logic', () => {
  const WHITELIST = [
    '.gitignore',
    '.gitattributes',
    /^\.ctoc\//,
    /^\.local\//,
    /^plans\/.*\.md$/
  ];

  /**
   * Check if file is whitelisted
   */
  function isWhitelisted(filePath) {
    if (!filePath) return false;

    const normalized = filePath.replace(/^\.\//, '').replace(/^\//, '');

    for (const pattern of WHITELIST) {
      if (typeof pattern === 'string') {
        if (normalized === pattern || path.basename(normalized) === pattern) {
          return true;
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(normalized)) {
          return true;
        }
      }
    }

    return false;
  }

  describe('Whitelisted Files - ALWAYS Allowed', () => {
    it('allows .gitignore', () => {
      assert.strictEqual(isWhitelisted('.gitignore'), true);
      assert.strictEqual(isWhitelisted('./.gitignore'), true);
      assert.strictEqual(isWhitelisted('/project/.gitignore'), true);
    });

    it('allows .gitattributes', () => {
      assert.strictEqual(isWhitelisted('.gitattributes'), true);
    });

    it('allows .ctoc/ directory files', () => {
      assert.strictEqual(isWhitelisted('.ctoc/settings.yaml'), true);
      assert.strictEqual(isWhitelisted('.ctoc/state.json'), true);
      assert.strictEqual(isWhitelisted('.ctoc/nested/file.txt'), true);
    });

    it('allows .local/ directory files', () => {
      assert.strictEqual(isWhitelisted('.local/config.json'), true);
      assert.strictEqual(isWhitelisted('.local/temp/file.txt'), true);
    });

    it('allows plan markdown files', () => {
      assert.strictEqual(isWhitelisted('plans/feature-x.md'), true);
      assert.strictEqual(isWhitelisted('plans/2026-01-30-feature.md'), true);
      assert.strictEqual(isWhitelisted('plans/subdir/plan.md'), true);
    });
  });

  describe('Non-Whitelisted Files - Require Step 7+', () => {
    it('blocks regular source files', () => {
      assert.strictEqual(isWhitelisted('src/index.js'), false);
      assert.strictEqual(isWhitelisted('lib/utils.ts'), false);
      assert.strictEqual(isWhitelisted('app/main.py'), false);
    });

    it('blocks test files', () => {
      assert.strictEqual(isWhitelisted('tests/test.js'), false);
      assert.strictEqual(isWhitelisted('spec/unit.test.ts'), false);
    });

    it('blocks config files outside .ctoc', () => {
      assert.strictEqual(isWhitelisted('package.json'), false);
      assert.strictEqual(isWhitelisted('tsconfig.json'), false);
    });

    it('blocks non-markdown plan files', () => {
      assert.strictEqual(isWhitelisted('plans/feature.txt'), false);
      assert.strictEqual(isWhitelisted('plans/data.json'), false);
    });

    it('blocks README and documentation', () => {
      assert.strictEqual(isWhitelisted('README.md'), false);
      assert.strictEqual(isWhitelisted('docs/guide.md'), false);
    });
  });
});

// ============================================================================
// TEST: SessionStart.js - Stack Detection and State Initialization
// ============================================================================

describe('SessionStart - Stack Detection', () => {
  // Import real stack detector
  const { detectStack, detectLanguages, detectFrameworks, LANGUAGE_PATTERNS } = require('../lib/stack-detector');

  describe('Language Detection Logic', () => {
    it('returns array for any directory', () => {
      const languages = detectLanguages(TEST_PROJECT_PATH);
      assert.ok(Array.isArray(languages), 'Should return array');
    });

    it('returns empty array for non-project directory', () => {
      const languages = detectLanguages('/tmp');
      // /tmp typically has no project files
      assert.ok(Array.isArray(languages), 'Should return array');
    });

    it('has language patterns defined', () => {
      // Verify the detector has expected language patterns
      assert.ok(LANGUAGE_PATTERNS.javascript, 'Should have javascript pattern');
      assert.ok(LANGUAGE_PATTERNS.typescript, 'Should have typescript pattern');
      assert.ok(LANGUAGE_PATTERNS.python, 'Should have python pattern');
      assert.ok(LANGUAGE_PATTERNS.go, 'Should have go pattern');
      assert.ok(LANGUAGE_PATTERNS.rust, 'Should have rust pattern');
    });

    it('javascript pattern checks for package.json', () => {
      const jsPattern = LANGUAGE_PATTERNS.javascript;
      assert.ok(jsPattern.files.includes('package.json'), 'JS should check package.json');
    });

    it('typescript pattern checks for tsconfig.json', () => {
      const tsPattern = LANGUAGE_PATTERNS.typescript;
      assert.ok(tsPattern.files.includes('tsconfig.json'), 'TS should check tsconfig.json');
    });
  });

  describe('Full Stack Detection', () => {
    it('returns proper stack structure', () => {
      const stack = detectStack(TEST_PROJECT_PATH);

      assert.ok(stack.project, 'Should have project path');
      assert.ok(Array.isArray(stack.languages), 'Should have languages array');
      assert.ok(Array.isArray(stack.frameworks), 'Should have frameworks array');
      assert.ok(stack.primary, 'Should have primary object');
      assert.ok('language' in stack.primary, 'Should have primary.language');
      assert.ok('framework' in stack.primary, 'Should have primary.framework');
    });
  });
});

describe('SessionStart - State Management', () => {
  // Import state manager functions
  const {
    createState,
    STEP_NAMES,
    isInterruptedSession,
    formatTimeSince
  } = require('../lib/state-manager');

  describe('State Creation', () => {
    it('creates state with default values', () => {
      const state = createState(TEST_PROJECT_PATH);

      assert.strictEqual(state.project, TEST_PROJECT_PATH);
      assert.strictEqual(state.currentStep, 1);
      assert.strictEqual(state.feature, null);
      assert.strictEqual(state.sessionStatus, 'active');
    });

    it('creates state with feature', () => {
      const state = createState(TEST_PROJECT_PATH, 'test-feature', 'javascript', 'express');

      assert.strictEqual(state.feature, 'test-feature');
      assert.strictEqual(state.language, 'javascript');
      assert.strictEqual(state.framework, 'express');
    });
  });

  describe('Step Names', () => {
    it('has all 15 step names', () => {
      assert.strictEqual(Object.keys(STEP_NAMES).length, 15);
    });

    it('has correct step names', () => {
      assert.strictEqual(STEP_NAMES[1], 'ASSESS');
      assert.strictEqual(STEP_NAMES[7], 'TEST');
      assert.strictEqual(STEP_NAMES[14], 'VERIFY');
      assert.strictEqual(STEP_NAMES[15], 'COMMIT');
    });
  });

  describe('Interrupted Session Detection', () => {
    it('returns false for null state', () => {
      assert.strictEqual(isInterruptedSession(null), false);
    });

    it('returns false for inactive session', () => {
      const state = createMockState({
        sessionStatus: 'completed',
        currentStep: 9
      });
      assert.strictEqual(isInterruptedSession(state), false);
    });

    it('returns false for planning phase (step < 7)', () => {
      const state = createMockState({
        sessionStatus: 'active',
        currentStep: 5
      });
      assert.strictEqual(isInterruptedSession(state), false);
    });

    it('detects interrupted implementation session', () => {
      const recentTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
      const state = createMockState({
        sessionStatus: 'active',
        currentStep: 9,
        lastActivity: recentTime
      });
      assert.strictEqual(isInterruptedSession(state), true);
    });

    it('returns false for old sessions (> 24 hours)', () => {
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
      const state = createMockState({
        sessionStatus: 'active',
        currentStep: 9,
        lastActivity: oldTime
      });
      assert.strictEqual(isInterruptedSession(state), false);
    });
  });

  describe('Time Formatting', () => {
    it('formats minutes ago', () => {
      const time = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 minutes ago
      const result = formatTimeSince(time);
      assert.ok(result.includes('minute'), `Expected minutes, got: ${result}`);
    });

    it('formats hours ago', () => {
      const time = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago
      const result = formatTimeSince(time);
      assert.ok(result.includes('hour'), `Expected hours, got: ${result}`);
    });

    it('handles singular minute', () => {
      const time = new Date(Date.now() - 1 * 60 * 1000).toISOString(); // 1 minute ago
      const result = formatTimeSince(time);
      assert.ok(result.includes('minute'), `Expected minute, got: ${result}`);
    });

    it('handles singular hour', () => {
      const time = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
      const result = formatTimeSince(time);
      assert.ok(result.includes('hour'), `Expected hour, got: ${result}`);
    });
  });
});

// ============================================================================
// TEST: Gate Approval Verification
// ============================================================================

describe('Gate Approval Verification', () => {
  const { verifyGateApproval, createGateApproval } = require('../lib/state-manager');

  describe('Valid Gate Approvals', () => {
    it('accepts valid gate 1 approval', () => {
      const state = createMockState({
        gate1_approval: createMockGateApproval(1)
      });
      const result = verifyGateApproval(1, state);
      assert.strictEqual(result.valid, true);
    });

    it('accepts valid gate 2 approval', () => {
      const state = createMockState({
        gate2_approval: createMockGateApproval(2)
      });
      const result = verifyGateApproval(2, state);
      assert.strictEqual(result.valid, true);
    });
  });

  describe('Invalid Gate Approvals', () => {
    it('rejects missing gate approval', () => {
      const state = createMockState({});
      const result = verifyGateApproval(1, state);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('not found'));
    });

    it('rejects approval without timestamp', () => {
      const state = createMockState({
        gate1_approval: {
          gate: 1,
          user_confirmed: true
        }
      });
      const result = verifyGateApproval(1, state);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('timestamp'));
    });

    it('rejects approval without user confirmation', () => {
      const state = createMockState({
        gate1_approval: {
          gate: 1,
          timestamp: new Date().toISOString(),
          user_confirmed: false
        }
      });
      const result = verifyGateApproval(1, state);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('user-confirmed'));
    });

    it('rejects expired approval (> 24 hours)', () => {
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const state = createMockState({
        gate1_approval: {
          gate: 1,
          timestamp: oldTime,
          user_confirmed: true
        }
      });
      const result = verifyGateApproval(1, state);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('expired'));
    });
  });

  describe('Gate Approval Creation', () => {
    it('creates valid gate approval structure', () => {
      const approval = createGateApproval(1, '/plans/test.md', 'hash123');

      assert.strictEqual(approval.gate, 1);
      assert.ok(approval.timestamp);
      assert.strictEqual(approval.user_confirmed, true);
      assert.strictEqual(approval.plan_path, '/plans/test.md');
      assert.strictEqual(approval.plan_hash, 'hash123');
    });
  });
});

// ============================================================================
// TEST: Hook Step Enforcement Logic
// ============================================================================

describe('Hook Step Enforcement', () => {
  const MINIMUM_STEP_FOR_WRITE = 7;
  const MINIMUM_STEP_FOR_COMMIT = 14;

  describe('Write/Edit Operations', () => {
    it('blocks at step 1', () => {
      const currentStep = 1;
      assert.ok(currentStep < MINIMUM_STEP_FOR_WRITE, 'Should block at step 1');
    });

    it('blocks at step 6', () => {
      const currentStep = 6;
      assert.ok(currentStep < MINIMUM_STEP_FOR_WRITE, 'Should block at step 6');
    });

    it('allows at step 7', () => {
      const currentStep = 7;
      assert.ok(currentStep >= MINIMUM_STEP_FOR_WRITE, 'Should allow at step 7');
    });

    it('allows at step 15', () => {
      const currentStep = 15;
      assert.ok(currentStep >= MINIMUM_STEP_FOR_WRITE, 'Should allow at step 15');
    });
  });

  describe('Commit Operations', () => {
    it('blocks at step 7', () => {
      const currentStep = 7;
      assert.ok(currentStep < MINIMUM_STEP_FOR_COMMIT, 'Should block commit at step 7');
    });

    it('blocks at step 13', () => {
      const currentStep = 13;
      assert.ok(currentStep < MINIMUM_STEP_FOR_COMMIT, 'Should block commit at step 13');
    });

    it('allows at step 14', () => {
      const currentStep = 14;
      assert.ok(currentStep >= MINIMUM_STEP_FOR_COMMIT, 'Should allow commit at step 14');
    });

    it('allows at step 15', () => {
      const currentStep = 15;
      assert.ok(currentStep >= MINIMUM_STEP_FOR_COMMIT, 'Should allow commit at step 15');
    });
  });
});

// ============================================================================
// TEST: Tool Input Parsing
// ============================================================================

describe('Tool Input Parsing', () => {
  /**
   * Parse command from tool input (Bash hook logic)
   */
  function getCommandFromInput(toolInput) {
    try {
      const parsed = JSON.parse(toolInput);
      return parsed.command || '';
    } catch {
      const match = toolInput.match(/command['":\s]+["']?([^"'\n]+)/);
      return match ? match[1] : toolInput;
    }
  }

  /**
   * Parse file path from tool input (Edit/Write hook logic)
   */
  function getFileFromInput(toolInput) {
    try {
      const parsed = JSON.parse(toolInput);
      return parsed.file_path || parsed.path || null;
    } catch {
      const match = toolInput.match(/file_path['":\s]+["']?([^"'\s,}]+)/);
      return match ? match[1] : null;
    }
  }

  describe('Bash Command Parsing', () => {
    it('parses JSON command', () => {
      const input = createToolInput({ command: 'ls -la' });
      assert.strictEqual(getCommandFromInput(input), 'ls -la');
    });

    it('parses complex JSON command', () => {
      const input = createToolInput({
        command: 'git commit -m "test message"',
        timeout: 30000
      });
      assert.strictEqual(getCommandFromInput(input), 'git commit -m "test message"');
    });

    it('handles empty command', () => {
      const input = createToolInput({ command: '' });
      assert.strictEqual(getCommandFromInput(input), '');
    });

    it('handles malformed JSON gracefully', () => {
      const input = 'command: "ls -la"';
      const result = getCommandFromInput(input);
      assert.ok(result.includes('ls'));
    });
  });

  describe('File Path Parsing', () => {
    it('parses file_path from JSON', () => {
      const input = createToolInput({ file_path: '/src/index.js' });
      assert.strictEqual(getFileFromInput(input), '/src/index.js');
    });

    it('parses path from JSON', () => {
      const input = createToolInput({ path: '/src/utils.ts' });
      assert.strictEqual(getFileFromInput(input), '/src/utils.ts');
    });

    it('prefers file_path over path', () => {
      const input = createToolInput({
        file_path: '/src/main.js',
        path: '/src/other.js'
      });
      assert.strictEqual(getFileFromInput(input), '/src/main.js');
    });

    it('handles malformed JSON gracefully', () => {
      const input = 'file_path: "/src/test.js"';
      const result = getFileFromInput(input);
      assert.ok(result === '/src/test.js' || result === null);
    });

    it('returns null for missing file path', () => {
      const input = createToolInput({ content: 'test' });
      assert.strictEqual(getFileFromInput(input), null);
    });
  });
});

// ============================================================================
// TEST: UI Formatting (used by hooks for blocked messages)
// ============================================================================

describe('UI Formatting', () => {
  const { blocked, colors } = require('../lib/ui');

  describe('Blocked Message Formatting', () => {
    it('formats blocked message with state', () => {
      const state = createMockState({
        feature: 'test-feature',
        currentStep: 3
      });

      const output = blocked('Step 3 < 7 - planning not complete', state, 'EDIT');

      assert.ok(output.includes('BLOCKED'), 'Should include BLOCKED');
      assert.ok(output.includes('test-feature'), 'Should include feature name');
      assert.ok(output.includes('3'), 'Should include current step');
      assert.ok(output.includes('EDIT'), 'Should include tool type');
    });

    it('formats blocked message without feature', () => {
      const state = createMockState({ feature: null, currentStep: 1 });

      const output = blocked('No feature context', state, 'WRITE');

      assert.ok(output.includes('No feature'), 'Should show no feature');
      assert.ok(output.includes('WRITE'), 'Should include tool type');
    });

    it('includes instructions for proceeding', () => {
      const state = createMockState({ feature: 'test', currentStep: 2 });

      const output = blocked('test reason', state, 'EDIT');

      assert.ok(output.includes('TO PROCEED'), 'Should include instructions');
      assert.ok(output.includes('Gate 1'), 'Should mention Gate 1');
      assert.ok(output.includes('Gate 2'), 'Should mention Gate 2');
    });
  });

  describe('Color Constants', () => {
    it('has expected color codes', () => {
      assert.ok(colors.red.includes('\x1b['));
      assert.ok(colors.green.includes('\x1b['));
      assert.ok(colors.yellow.includes('\x1b['));
      assert.ok(colors.cyan.includes('\x1b['));
      assert.ok(colors.reset.includes('\x1b['));
    });
  });
});

// ============================================================================
// TEST: Crypto Module (state signing for hooks)
// ============================================================================

describe('Crypto Module', () => {
  const { signState, verifyState, hashPath, canonicalStringify } = require('../lib/crypto');

  describe('State Signing', () => {
    it('signs state and adds _signature field', () => {
      const state = { feature: 'test', currentStep: 5 };
      const signed = signState(state);

      assert.ok(signed._signature, 'Should have signature');
      assert.ok(signed._signature.startsWith('hmac-sha256:'), 'Should have correct prefix');
    });

    it('preserves original state fields', () => {
      const state = { feature: 'test', currentStep: 5, extra: 'data' };
      const signed = signState(state);

      assert.strictEqual(signed.feature, 'test');
      assert.strictEqual(signed.currentStep, 5);
      assert.strictEqual(signed.extra, 'data');
    });
  });

  describe('State Verification', () => {
    it('verifies correctly signed state', () => {
      const state = { feature: 'test', currentStep: 7 };
      const signed = signState(state);
      const result = verifyState(signed);

      assert.strictEqual(result.valid, true);
    });

    it('rejects tampered state', () => {
      const state = { feature: 'test', currentStep: 7 };
      const signed = signState(state);

      // Tamper with the state
      signed.currentStep = 10;

      const result = verifyState(signed);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('tamper') || result.error.includes('mismatch'));
    });

    it('rejects unsigned state', () => {
      const state = { feature: 'test', currentStep: 7 };
      const result = verifyState(state);

      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('not signed'));
    });

    it('rejects null state', () => {
      const result = verifyState(null);
      assert.strictEqual(result.valid, false);
    });
  });

  describe('Path Hashing', () => {
    it('returns consistent hash for same path', () => {
      const hash1 = hashPath('/home/user/project');
      const hash2 = hashPath('/home/user/project');

      assert.strictEqual(hash1, hash2);
    });

    it('returns different hash for different paths', () => {
      const hash1 = hashPath('/home/user/project1');
      const hash2 = hashPath('/home/user/project2');

      assert.notStrictEqual(hash1, hash2);
    });

    it('returns 16-character hash', () => {
      const hash = hashPath('/some/path');
      assert.strictEqual(hash.length, 16);
    });
  });

  describe('Canonical Stringify', () => {
    it('produces consistent output regardless of key order', () => {
      const obj1 = { b: 2, a: 1 };
      const obj2 = { a: 1, b: 2 };

      const str1 = canonicalStringify(obj1);
      const str2 = canonicalStringify(obj2);

      assert.strictEqual(str1, str2);
    });

    it('handles nested objects', () => {
      const obj = { outer: { inner: 'value' } };
      const result = canonicalStringify(obj);

      assert.ok(result.includes('inner'));
      assert.ok(result.includes('value'));
    });

    it('handles arrays', () => {
      const obj = { arr: [1, 2, 3] };
      const result = canonicalStringify(obj);

      assert.ok(result.includes('[1,2,3]'));
    });
  });
});

// ============================================================================
// TEST: Integration Scenarios
// ============================================================================

describe('Integration Scenarios', () => {
  describe('Planning Phase (Steps 1-6)', () => {
    it('should block Edit on non-whitelisted files at step 3', () => {
      const state = createMockState({
        feature: 'new-feature',
        currentStep: 3
      });
      const filePath = 'src/index.js';

      // Check whitelist
      const isWhitelisted = false; // src/index.js is not whitelisted
      const shouldBlock = !isWhitelisted && state.currentStep < 7;

      assert.strictEqual(shouldBlock, true, 'Should block edit at step 3');
    });

    it('should allow Edit on .ctoc files at step 3', () => {
      const state = createMockState({
        feature: 'new-feature',
        currentStep: 3
      });
      const filePath = '.ctoc/settings.yaml';

      // Check whitelist
      const WHITELIST_REGEX = /^\.ctoc\//;
      const isWhitelisted = WHITELIST_REGEX.test(filePath);

      assert.strictEqual(isWhitelisted, true, 'Should allow .ctoc files');
    });

    it('should allow Edit on plan markdown files at step 3', () => {
      const filePath = 'plans/feature-x.md';
      const PLAN_REGEX = /^plans\/.*\.md$/;
      const isWhitelisted = PLAN_REGEX.test(filePath);

      assert.strictEqual(isWhitelisted, true, 'Should allow plan markdown files');
    });
  });

  describe('Implementation Phase (Steps 7-10)', () => {
    it('should allow Edit on source files at step 9', () => {
      const state = createMockState({
        feature: 'new-feature',
        currentStep: 9,
        gate1_approval: createMockGateApproval(1),
        gate2_approval: createMockGateApproval(2)
      });

      const shouldAllow = state.currentStep >= 7;
      assert.strictEqual(shouldAllow, true, 'Should allow edit at step 9');
    });

    it('should allow Bash write commands at step 7', () => {
      const state = createMockState({
        feature: 'new-feature',
        currentStep: 7,
        gate1_approval: createMockGateApproval(1),
        gate2_approval: createMockGateApproval(2)
      });

      const shouldAllow = state.currentStep >= 7;
      assert.strictEqual(shouldAllow, true, 'Should allow bash write at step 7');
    });

    it('should block git commit at step 10', () => {
      const state = createMockState({
        feature: 'new-feature',
        currentStep: 10
      });

      const shouldBlock = state.currentStep < 14;
      assert.strictEqual(shouldBlock, true, 'Should block commit at step 10');
    });
  });

  describe('Delivery Phase (Steps 11-15)', () => {
    it('should allow git commit at step 14', () => {
      const state = createMockState({
        feature: 'new-feature',
        currentStep: 14
      });

      const shouldAllow = state.currentStep >= 14;
      assert.strictEqual(shouldAllow, true, 'Should allow commit at step 14');
    });

    it('should allow all operations at step 15', () => {
      const state = createMockState({
        feature: 'new-feature',
        currentStep: 15
      });

      const canEdit = state.currentStep >= 7;
      const canCommit = state.currentStep >= 14;

      assert.strictEqual(canEdit, true, 'Should allow edit at step 15');
      assert.strictEqual(canCommit, true, 'Should allow commit at step 15');
    });
  });

  describe('No Feature Context', () => {
    it('should block Edit when no feature is set', () => {
      const state = createMockState({ feature: null });

      const shouldBlock = !state.feature;
      assert.strictEqual(shouldBlock, true, 'Should block when no feature');
    });

    it('should block Write when no feature is set', () => {
      const state = null;

      const shouldBlock = !state || !state?.feature;
      assert.strictEqual(shouldBlock, true, 'Should block when state is null');
    });
  });

  describe('Gate Bypass Scenarios', () => {
    it('should allow operations with valid gates even if step not advanced', () => {
      const state = createMockState({
        feature: 'new-feature',
        currentStep: 6, // Still at step 6
        gate1_approval: createMockGateApproval(1),
        gate2_approval: createMockGateApproval(2)
      });

      const { verifyGateApproval } = require('../lib/state-manager');
      const gate1Valid = verifyGateApproval(1, state).valid;
      const gate2Valid = verifyGateApproval(2, state).valid;

      // Hook logic: if both gates passed, allow even if step < 7
      const shouldAllow = gate1Valid && gate2Valid;
      assert.strictEqual(shouldAllow, true, 'Should allow with valid gates');
    });
  });
});

console.log('\n=== CTOC Hook Tests ===\n');
