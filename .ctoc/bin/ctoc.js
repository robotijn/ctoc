#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
//  CTOC CLI - CTO Chief Command Line Interface
//  "You are the CTO Chief. Command your army of 80 AI agents."
// ═══════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// ─────────────────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT_DIR = __dirname;

// Detect directory structure
// Case 1: Running from ctoc repo directly: ctoc/.ctoc/bin/ctoc.js
//         SCRIPT_DIR = ctoc/.ctoc/bin, parent = ctoc/.ctoc, grandparent = ctoc (has VERSION)
// Case 2: Installed in project: project/.ctoc/repo/.ctoc/bin/ctoc.js
//         SCRIPT_DIR = project/.ctoc/repo/.ctoc/bin, need to go up to project/.ctoc/repo (has VERSION)

function detectPaths() {
    // Check if VERSION exists at different levels to determine structure
    const parentDir = path.dirname(SCRIPT_DIR);        // .ctoc
    const grandparentDir = path.dirname(parentDir);    // ctoc repo root OR project/.ctoc/repo

    // Case 1: Direct repo access (ctoc/.ctoc/bin/ctoc.js)
    // grandparentDir would be the ctoc repo with VERSION at root
    if (fs.existsSync(path.join(grandparentDir, 'VERSION'))) {
        return {
            REPO_ROOT: grandparentDir,                 // ctoc repo root
            CTOC_DIR: parentDir,                       // ctoc/.ctoc
            PROJECT_ROOT: grandparentDir               // Same as repo in dev mode
        };
    }

    // Case 2: Installed in project (project/.ctoc/repo/.ctoc/bin/ctoc.js)
    // grandparentDir = project/.ctoc/repo
    const projectCtocDir = path.dirname(grandparentDir);   // project/.ctoc
    const projectRoot = path.dirname(projectCtocDir);      // project

    return {
        REPO_ROOT: grandparentDir,                     // project/.ctoc/repo
        CTOC_DIR: projectCtocDir,                      // project/.ctoc
        PROJECT_ROOT: projectRoot                      // project
    };
}

const paths = detectPaths();
const REPO_ROOT = paths.REPO_ROOT;
const CTOC_DIR = paths.CTOC_DIR;
const PROJECT_ROOT = paths.PROJECT_ROOT;

// Colors (ANSI escape codes)
const colors = {
    red: '\x1b[0;31m',
    green: '\x1b[0;32m',
    yellow: '\x1b[1;33m',
    blue: '\x1b[0;34m',
    cyan: '\x1b[0;36m',
    bold: '\x1b[1m',
    reset: '\x1b[0m'
};

// ─────────────────────────────────────────────────────────────────────────────
//  Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

function print(msg) {
    console.log(msg);
}

function printStep(msg) {
    print(`  ${colors.green}✓${colors.reset} ${msg}`);
}

function printFail(msg) {
    print(`  ${colors.red}✗${colors.reset} ${msg}`);
}

function printWarn(msg) {
    print(`  ${colors.yellow}⚠${colors.reset} ${msg}`);
}

function printSection(title) {
    print('');
    print(`${colors.blue}[${title}]${colors.reset}`);
}

function getVersion() {
    const versionFile = path.join(REPO_ROOT, 'VERSION');
    try {
        return fs.readFileSync(versionFile, 'utf8').trim();
    } catch (e) {
        return 'unknown';
    }
}

function fileExists(filePath) {
    try {
        fs.accessSync(filePath);
        return true;
    } catch (e) {
        return false;
    }
}

function readYaml(filePath) {
    // Simple YAML parser for basic key-value pairs
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const result = {};
        const lines = content.split('\n');
        let currentSection = null;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('#') || trimmed === '') continue;

            // Check for section header (no value after colon, or just whitespace)
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex > 0) {
                const key = trimmed.substring(0, colonIndex).trim();
                const value = trimmed.substring(colonIndex + 1).trim();

                if (value === '' || value === '|' || value === '>') {
                    currentSection = key;
                    result[key] = {};
                } else if (line.startsWith('  ') && currentSection) {
                    result[currentSection][key] = value.replace(/^["']|["']$/g, '');
                } else {
                    result[key] = value.replace(/^["']|["']$/g, '');
                }
            }
        }
        return result;
    } catch (e) {
        return {};
    }
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return null;
    }
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function getStateFile() {
    return path.join(CTOC_DIR, 'state', 'iron-loop.json');
}

function getState() {
    const stateFile = getStateFile();
    if (fileExists(stateFile)) {
        return readJson(stateFile) || createDefaultState();
    }
    return createDefaultState();
}

function saveState(state) {
    const stateDir = path.join(CTOC_DIR, 'state');
    if (!fileExists(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
    }
    writeJson(getStateFile(), state);
}

function createDefaultState() {
    return {
        feature: null,
        step: 0,
        gate1_passed: false,
        gate2_passed: false,
        started_at: null,
        steps_completed: []
    };
}

function detectStack() {
    const indicators = {
        'Python': ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
        'TypeScript': ['tsconfig.json'],
        'JavaScript': ['package.json'],
        'Rust': ['Cargo.toml'],
        'Go': ['go.mod'],
        'Ruby': ['Gemfile'],
        'Java': ['pom.xml', 'build.gradle', 'build.gradle.kts'],
        'C#': ['*.csproj', '*.sln'],
        'PHP': ['composer.json'],
        'Elixir': ['mix.exs']
    };

    const detected = [];
    for (const [lang, files] of Object.entries(indicators)) {
        for (const file of files) {
            if (file.includes('*')) {
                // Glob pattern - check for any matching file
                const pattern = file.replace('*', '');
                try {
                    const entries = fs.readdirSync(PROJECT_ROOT);
                    if (entries.some(e => e.endsWith(pattern))) {
                        detected.push(lang);
                        break;
                    }
                } catch (e) {}
            } else if (fileExists(path.join(PROJECT_ROOT, file))) {
                detected.push(lang);
                break;
            }
        }
    }

    return detected.length > 0 ? detected.join('/') : 'unknown/none';
}

// ─────────────────────────────────────────────────────────────────────────────
//  Iron Loop Steps
// ─────────────────────────────────────────────────────────────────────────────

const IRON_LOOP_STEPS = [
    { num: 1, name: 'ASSESS', phase: 'Planning', desc: 'Understand the problem' },
    { num: 2, name: 'ALIGN', phase: 'Planning', desc: 'Business alignment' },
    { num: 3, name: 'CAPTURE', phase: 'Planning', desc: 'Gather requirements' },
    { num: 4, name: 'PLAN', phase: 'Planning', desc: 'Design solution' },
    { num: 5, name: 'DESIGN', phase: 'Planning', desc: 'Architecture decisions' },
    { num: 6, name: 'SPEC', phase: 'Planning', desc: 'Technical specification' },
    { num: 7, name: 'TEST', phase: 'Development', desc: 'Write tests first' },
    { num: 8, name: 'QUALITY', phase: 'Development', desc: 'Quality gates' },
    { num: 9, name: 'IMPLEMENT', phase: 'Development', desc: 'Write code' },
    { num: 10, name: 'REVIEW', phase: 'Development', desc: 'Self-review as CTO' },
    { num: 11, name: 'OPTIMIZE', phase: 'Delivery', desc: 'Performance tuning' },
    { num: 12, name: 'SECURE', phase: 'Delivery', desc: 'Security validation' },
    { num: 13, name: 'DOCUMENT', phase: 'Delivery', desc: 'Update docs' },
    { num: 14, name: 'VERIFY', phase: 'Delivery', desc: 'Final validation' },
    { num: 15, name: 'COMMIT', phase: 'Delivery', desc: 'Ship with confidence' }
];

function getStepInfo(stepNum) {
    return IRON_LOOP_STEPS.find(s => s.num === stepNum) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Commands
// ─────────────────────────────────────────────────────────────────────────────

function cmdStatus() {
    const version = getVersion();
    const stack = detectStack();
    const state = getState();

    print('');
    print(`${colors.cyan}════════════════════════════════════════════════════════════════${colors.reset}`);
    print(`${colors.bold}CTOC${colors.reset} - CTO Chief v${version}`);
    print(`${colors.cyan}════════════════════════════════════════════════════════════════${colors.reset}`);
    print('');
    print(`  Project: ${path.basename(PROJECT_ROOT)}`);
    print(`  Stack:   ${stack}`);
    print('');

    if (state.feature) {
        const stepInfo = getStepInfo(state.step) || { name: 'Not started', phase: '-' };
        print(`  Feature: ${colors.cyan}${state.feature}${colors.reset}`);
        print(`  Step:    ${state.step}/15 - ${stepInfo.name} (${stepInfo.phase})`);
        print(`  Gate 1:  ${state.gate1_passed ? colors.green + '✓ Passed' : colors.yellow + '○ Pending'}${colors.reset}`);
        print(`  Gate 2:  ${state.gate2_passed ? colors.green + '✓ Passed' : colors.yellow + '○ Pending'}${colors.reset}`);
    } else {
        print(`  ${colors.yellow}No feature being tracked${colors.reset}`);
        print(`  Use: ctoc start <feature-name>`);
    }
    print('');
}

function cmdVersion() {
    print(`CTOC v${getVersion()}`);
}

function cmdDoctor() {
    const version = getVersion();

    print('');
    print(`${colors.cyan}CTOC Doctor${colors.reset} - Installation Health Check`);
    print('');

    printSection('Core Files');

    // Check VERSION
    const versionFile = path.join(REPO_ROOT, 'VERSION');
    if (fileExists(versionFile)) {
        printStep(`VERSION file (v${version})`);
    } else {
        printFail('VERSION file missing');
    }

    // Check settings
    const settingsFile = path.join(CTOC_DIR, 'settings.yaml');
    if (fileExists(settingsFile)) {
        printStep('settings.yaml');
    } else {
        printWarn('settings.yaml missing (using defaults)');
    }

    // Check skills
    const skillsDir = path.join(CTOC_DIR, 'skills');
    if (fileExists(skillsDir)) {
        try {
            const langDir = path.join(skillsDir, 'languages');
            const fwDir = path.join(skillsDir, 'frameworks');
            let count = 0;
            if (fileExists(langDir)) {
                count += fs.readdirSync(langDir).filter(f => f.endsWith('.md')).length;
            }
            if (fileExists(fwDir)) {
                const categories = fs.readdirSync(fwDir);
                for (const cat of categories) {
                    const catPath = path.join(fwDir, cat);
                    if (fs.statSync(catPath).isDirectory()) {
                        count += fs.readdirSync(catPath).filter(f => f.endsWith('.md')).length;
                    }
                }
            }
            printStep(`Skills directory (${count} skills)`);
        } catch (e) {
            printStep('Skills directory');
        }
    } else {
        printWarn('Skills directory missing');
    }

    // Check agents
    const agentsDir = path.join(CTOC_DIR, 'agents');
    if (fileExists(agentsDir)) {
        try {
            let count = 0;
            const scan = (dir) => {
                const entries = fs.readdirSync(dir);
                for (const entry of entries) {
                    const entryPath = path.join(dir, entry);
                    if (fs.statSync(entryPath).isDirectory()) {
                        scan(entryPath);
                    } else if (entry.endsWith('.md')) {
                        count++;
                    }
                }
            };
            scan(agentsDir);
            printStep(`Agents directory (${count} agents)`);
        } catch (e) {
            printStep('Agents directory');
        }
    } else {
        printWarn('Agents directory missing');
    }

    printSection('Dependencies');

    // Check Node.js
    try {
        const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
        printStep(`Node.js ${nodeVersion}`);
    } catch (e) {
        printFail('Node.js not found');
    }

    // Check git
    try {
        const gitVersion = execSync('git --version', { encoding: 'utf8' }).trim();
        printStep(gitVersion);
    } catch (e) {
        printFail('git not found');
    }

    // Check claude
    try {
        execSync('which claude', { encoding: 'utf8' });
        printStep('Claude Code CLI');
    } catch (e) {
        printWarn('Claude Code CLI not found');
    }

    // Check jq
    try {
        execSync('which jq', { encoding: 'utf8' });
        printStep('jq');
    } catch (e) {
        printWarn('jq not found (optional)');
    }

    printSection('State');

    const state = getState();
    if (state.feature) {
        printStep(`Tracking: ${state.feature} (step ${state.step})`);
    } else {
        print('  No feature being tracked');
    }

    print('');
    print(`${colors.green}Doctor check complete${colors.reset}`);
    print('');
}

function cmdProgress() {
    const state = getState();

    print('');
    print(`${colors.cyan}Iron Loop Progress${colors.reset}`);
    print('');

    if (!state.feature) {
        print(`  ${colors.yellow}No feature being tracked${colors.reset}`);
        print('  Use: ctoc start <feature-name>');
        print('');
        return;
    }

    print(`  Feature: ${colors.bold}${state.feature}${colors.reset}`);
    print('');

    // Group steps by phase
    const phases = ['Planning', 'Development', 'Delivery'];

    for (const phase of phases) {
        const phaseSteps = IRON_LOOP_STEPS.filter(s => s.phase === phase);
        print(`  ${colors.bold}${phase}${colors.reset}`);

        for (const step of phaseSteps) {
            let status;
            if (state.steps_completed.includes(step.num)) {
                status = `${colors.green}✓${colors.reset}`;
            } else if (state.step === step.num) {
                status = `${colors.yellow}▶${colors.reset}`;
            } else {
                status = `${colors.reset}○${colors.reset}`;
            }

            const stepStr = `${step.num}`.padStart(2);
            print(`    ${status} ${stepStr}. ${step.name.padEnd(10)} ${colors.reset}${step.desc}`);
        }
        print('');
    }

    // Gates
    print(`  ${colors.bold}Gates${colors.reset}`);
    print(`    Gate 1 (after step 3): ${state.gate1_passed ? colors.green + '✓ Passed' : colors.yellow + '○ Pending'}${colors.reset}`);
    print(`    Gate 2 (after step 6): ${state.gate2_passed ? colors.green + '✓ Passed' : colors.yellow + '○ Pending'}${colors.reset}`);
    print('');
}

function cmdPlanStatus() {
    print('');
    print(`${colors.cyan}Plan Dashboard${colors.reset}`);
    print('');

    const plansDir = path.join(CTOC_DIR, 'plans');

    const checkDir = (name, subPath) => {
        const dir = path.join(plansDir, subPath);
        if (fileExists(dir)) {
            try {
                const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
                if (files.length > 0) {
                    print(`  ${colors.bold}${name}${colors.reset} (${files.length})`);
                    for (const file of files.slice(0, 5)) {
                        print(`    • ${file}`);
                    }
                    if (files.length > 5) {
                        print(`    ... and ${files.length - 5} more`);
                    }
                    print('');
                }
            } catch (e) {}
        }
    };

    checkDir('Functional Plans - Draft', 'functional/draft');
    checkDir('Functional Plans - Approved', 'functional/approved');
    checkDir('Implementation Plans - Draft', 'implementation/draft');
    checkDir('Implementation Plans - Approved', 'implementation/approved');
    checkDir('In Progress', 'in_progress');
    checkDir('In Review', 'review');
    checkDir('Done', 'done');

    const state = getState();
    if (state.feature) {
        print(`  ${colors.cyan}Currently tracking:${colors.reset} ${state.feature}`);
        print('');
    }
}

function cmdStart(featureName) {
    if (!featureName) {
        print(`${colors.red}Error:${colors.reset} Feature name required`);
        print('Usage: ctoc start <feature-name>');
        process.exit(1);
    }

    const state = createDefaultState();
    state.feature = featureName;
    state.step = 1;
    state.started_at = new Date().toISOString();
    saveState(state);

    print('');
    print(`${colors.green}Started tracking:${colors.reset} ${featureName}`);
    print(`${colors.cyan}Step 1: ASSESS${colors.reset} - Understand the problem`);
    print('');
    print('Begin by assessing the problem space. Ask:');
    print('  • What business problem are we solving?');
    print('  • Who is affected?');
    print('  • What does success look like?');
    print('');
}

function cmdStep(stepNum) {
    const num = parseInt(stepNum, 10);
    if (isNaN(num) || num < 1 || num > 15) {
        print(`${colors.red}Error:${colors.reset} Step must be between 1 and 15`);
        process.exit(1);
    }

    const state = getState();
    if (!state.feature) {
        print(`${colors.red}Error:${colors.reset} No feature being tracked`);
        print('Use: ctoc start <feature-name>');
        process.exit(1);
    }

    const prevStep = state.step;
    state.step = num;

    // Mark previous steps as completed if moving forward
    if (num > prevStep) {
        for (let i = prevStep; i < num; i++) {
            if (!state.steps_completed.includes(i)) {
                state.steps_completed.push(i);
            }
        }
    }

    // Check gates
    if (num > 3 && !state.gate1_passed) {
        print(`${colors.yellow}Note:${colors.reset} Gate 1 not yet passed (functional planning)`);
    }
    if (num > 6 && !state.gate2_passed) {
        print(`${colors.yellow}Note:${colors.reset} Gate 2 not yet passed (technical planning)`);
    }

    saveState(state);

    const stepInfo = getStepInfo(num);
    print('');
    print(`${colors.green}Moved to step ${num}:${colors.reset} ${stepInfo.name}`);
    print(`${stepInfo.desc}`);
    print('');
}

function cmdGate(gateNum) {
    const num = parseInt(gateNum, 10);
    if (num !== 1 && num !== 2) {
        print(`${colors.red}Error:${colors.reset} Gate must be 1 or 2`);
        process.exit(1);
    }

    const state = getState();
    if (!state.feature) {
        print(`${colors.red}Error:${colors.reset} No feature being tracked`);
        process.exit(1);
    }

    if (num === 1) {
        state.gate1_passed = true;
        print(`${colors.green}✓${colors.reset} Gate 1 passed - Functional planning complete`);
    } else {
        state.gate2_passed = true;
        print(`${colors.green}✓${colors.reset} Gate 2 passed - Technical planning complete`);
    }

    saveState(state);
}

function cmdReset() {
    const state = createDefaultState();
    saveState(state);
    print(`${colors.green}✓${colors.reset} Iron Loop state reset`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Update Command - Supports both git and tarball installation methods
// ─────────────────────────────────────────────────────────────────────────────

const GITHUB_REPO = 'robotijn/ctoc';
const TARBALL_URL = `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.tar.gz`;
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/**
 * Check if the CTOC installation is a git repository
 */
function isGitInstallation() {
    const gitPath = path.join(REPO_ROOT, '.git');
    return fileExists(gitPath);
}

/**
 * Backup user settings before update
 * Returns an object with backed up content
 */
function backupUserSettings() {
    const backup = {};

    // Backup settings.yaml
    const settingsPath = path.join(CTOC_DIR, 'settings.yaml');
    if (fileExists(settingsPath)) {
        backup.settings = fs.readFileSync(settingsPath);
        backup.settingsPath = settingsPath;
    }

    // Backup state directory
    const statePath = path.join(CTOC_DIR, 'state');
    if (fileExists(statePath)) {
        backup.stateDir = statePath;
        backup.stateFiles = {};
        try {
            const files = fs.readdirSync(statePath);
            for (const file of files) {
                const filePath = path.join(statePath, file);
                if (fs.statSync(filePath).isFile()) {
                    backup.stateFiles[file] = fs.readFileSync(filePath);
                }
            }
        } catch (e) {
            // Ignore errors reading state
        }
    }

    return backup;
}

/**
 * Restore user settings after update
 */
function restoreUserSettings(backup) {
    // Restore settings.yaml
    if (backup.settings && backup.settingsPath) {
        try {
            fs.writeFileSync(backup.settingsPath, backup.settings);
        } catch (e) {
            printWarn('Could not restore settings.yaml');
        }
    }

    // Restore state files
    if (backup.stateDir && backup.stateFiles) {
        try {
            if (!fileExists(backup.stateDir)) {
                fs.mkdirSync(backup.stateDir, { recursive: true });
            }
            for (const [file, content] of Object.entries(backup.stateFiles)) {
                fs.writeFileSync(path.join(backup.stateDir, file), content);
            }
        } catch (e) {
            printWarn('Could not restore state files');
        }
    }
}

/**
 * Update via git pull (for git-cloned installations)
 */
function updateViaGit(localVersion) {
    print('  Using git pull method...');

    // Fetch latest - use cwd option instead of process.chdir
    execSync('git fetch --quiet', { cwd: REPO_ROOT, encoding: 'utf8' });

    // Check remote version
    let remoteVersion;
    try {
        remoteVersion = execSync('git show origin/main:VERSION', {
            cwd: REPO_ROOT,
            encoding: 'utf8'
        }).trim();
    } catch (e) {
        remoteVersion = localVersion;
    }

    if (localVersion === remoteVersion) {
        print(`${colors.green}✓${colors.reset} Already up to date (v${localVersion})`);
        print('');
        return { updated: false, version: localVersion };
    }

    print(`  Update available: v${localVersion} → v${remoteVersion}`);
    print('  Pulling latest changes...');

    // Pull latest - use cwd option
    execSync('git pull --rebase --quiet', { cwd: REPO_ROOT, encoding: 'utf8' });

    const newVersion = getVersion();

    // Show recent changes
    try {
        const changes = execSync(
            `git log --oneline v${localVersion}..HEAD 2>/dev/null | head -5`,
            { cwd: REPO_ROOT, encoding: 'utf8' }
        ).trim();
        if (changes) {
            print('');
            print(`${colors.cyan}Recent changes:${colors.reset}`);
            for (const line of changes.split('\n')) {
                print(`  • ${line}`);
            }
        }
    } catch (e) {
        // Ignore errors showing changes
    }

    return { updated: true, version: newVersion };
}

/**
 * Update via tarball download (for non-git installations)
 */
function updateViaTarball(localVersion) {
    print('  Using tarball download method...');

    // Check if curl or wget is available
    let downloadCmd;
    try {
        execSync('which curl', { encoding: 'utf8' });
        downloadCmd = 'curl';
    } catch (e) {
        try {
            execSync('which wget', { encoding: 'utf8' });
            downloadCmd = 'wget';
        } catch (e2) {
            throw new Error('Neither curl nor wget found. Please install curl or wget to update.');
        }
    }

    // Create temp directory for download
    const os = require('os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-update-'));
    const tarballPath = path.join(tmpDir, 'ctoc.tar.gz');
    const extractDir = path.join(tmpDir, 'extracted');

    try {
        // Download tarball
        print('  Downloading latest release...');
        if (downloadCmd === 'curl') {
            execSync(`curl -sL "${TARBALL_URL}" -o "${tarballPath}"`, {
                encoding: 'utf8',
                timeout: 60000
            });
        } else {
            execSync(`wget -q "${TARBALL_URL}" -O "${tarballPath}"`, {
                encoding: 'utf8',
                timeout: 60000
            });
        }

        // Verify download
        if (!fileExists(tarballPath)) {
            throw new Error('Download failed - tarball not found');
        }

        const stats = fs.statSync(tarballPath);
        if (stats.size < 1000) {
            throw new Error('Download failed - tarball too small');
        }

        // Extract tarball
        print('  Extracting...');
        fs.mkdirSync(extractDir, { recursive: true });
        execSync(`tar -xzf "${tarballPath}" -C "${extractDir}"`, { encoding: 'utf8' });

        // Find extracted directory (usually ctoc-main)
        const extractedDirs = fs.readdirSync(extractDir);
        if (extractedDirs.length === 0) {
            throw new Error('Extraction failed - no files found');
        }
        const sourceDir = path.join(extractDir, extractedDirs[0]);

        // Read new version
        const newVersionPath = path.join(sourceDir, 'VERSION');
        if (!fileExists(newVersionPath)) {
            throw new Error('Invalid tarball - VERSION file not found');
        }
        const newVersion = fs.readFileSync(newVersionPath, 'utf8').trim();

        if (localVersion === newVersion) {
            print(`${colors.green}✓${colors.reset} Already up to date (v${localVersion})`);
            return { updated: false, version: localVersion };
        }

        print(`  Update available: v${localVersion} → v${newVersion}`);
        print('  Installing update...');

        // Copy new files to repo root (excluding user-specific files)
        const excludeFiles = ['.git', 'node_modules', '.ctoc/state', '.ctoc/settings.yaml'];

        function copyDir(src, dest) {
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }
            const entries = fs.readdirSync(src);
            for (const entry of entries) {
                // Skip excluded files at root level
                if (excludeFiles.includes(entry)) continue;

                const srcPath = path.join(src, entry);
                const destPath = path.join(dest, entry);
                const stat = fs.statSync(srcPath);

                if (stat.isDirectory()) {
                    copyDir(srcPath, destPath);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        }

        copyDir(sourceDir, REPO_ROOT);

        return { updated: true, version: newVersion };

    } finally {
        // Clean up temp directory
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

/**
 * Setup MCP server configuration
 */
function setupMcp() {
    const mcpDir = path.join(REPO_ROOT, 'mcp');
    const mcpIndex = path.join(mcpDir, 'index.js');

    if (!fileExists(mcpDir)) {
        return { success: false, error: 'MCP directory not found' };
    }

    // Install MCP dependencies
    try {
        print('  Installing MCP dependencies...');
        execSync('npm install --silent', { cwd: mcpDir, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
        return { success: false, error: 'Failed to install MCP dependencies' };
    }

    // MCP configuration
    const mcpConfig = {
        mcpServers: {
            ctoc: {
                command: 'node',
                args: [mcpIndex]
            }
        }
    };

    // Configure LOCAL .claude/settings.json
    const localClaudeDir = path.join(PROJECT_ROOT, '.claude');
    const localSettings = path.join(localClaudeDir, 'settings.json');

    if (!fileExists(localClaudeDir)) {
        fs.mkdirSync(localClaudeDir, { recursive: true });
    }

    try {
        let settings = {};
        if (fileExists(localSettings)) {
            settings = readJson(localSettings) || {};
        }
        settings.mcpServers = settings.mcpServers || {};
        settings.mcpServers.ctoc = mcpConfig.mcpServers.ctoc;
        writeJson(localSettings, settings);
        printStep('MCP configured in .claude/settings.json (local)');
    } catch (e) {
        printWarn('Could not configure local MCP settings');
    }

    // Configure GLOBAL ~/.claude/settings.json
    const os = require('os');
    const globalClaudeDir = path.join(os.homedir(), '.claude');
    const globalSettings = path.join(globalClaudeDir, 'settings.json');

    if (!fileExists(globalClaudeDir)) {
        fs.mkdirSync(globalClaudeDir, { recursive: true });
    }

    try {
        let settings = {};
        if (fileExists(globalSettings)) {
            settings = readJson(globalSettings) || {};
        }
        settings.mcpServers = settings.mcpServers || {};
        settings.mcpServers.ctoc = mcpConfig.mcpServers.ctoc;
        writeJson(globalSettings, settings);
        printStep('MCP configured in ~/.claude/settings.json (global)');
    } catch (e) {
        printWarn('Could not configure global MCP settings');
    }

    return { success: true };
}

/**
 * Main update command handler
 */
function cmdUpdate() {
    print('');
    print(`${colors.cyan}Checking for updates...${colors.reset}`);

    const localVersion = getVersion();

    try {
        // Backup user settings before update
        const backup = backupUserSettings();

        let result;
        if (isGitInstallation()) {
            result = updateViaGit(localVersion);
        } else {
            result = updateViaTarball(localVersion);
        }

        // Restore user settings after update
        restoreUserSettings(backup);

        // Setup MCP server after update
        print('');
        print(`${colors.cyan}Configuring MCP server...${colors.reset}`);
        const mcpResult = setupMcp();
        if (!mcpResult.success) {
            printWarn(`MCP setup: ${mcpResult.error}`);
        }

        if (result.updated) {
            print('');
            print(`${colors.green}✓${colors.reset} Updated to v${result.version}`);
            print('');
            print(`${colors.yellow}Restart Claude Code${colors.reset} to load MCP tools.`);
        }
        print('');

    } catch (e) {
        print(`${colors.red}Error:${colors.reset} Update failed`);
        print(`  ${e.message}`);
        print('');
        print('You can manually update by:');
        if (isGitInstallation()) {
            print(`  cd ${REPO_ROOT} && git pull`);
        } else {
            print('  curl -sL https://raw.githubusercontent.com/robotijn/ctoc/main/install.sh | bash');
        }
        print('');
        process.exit(1);
    }
}

function cmdHelp() {
    print('');
    print(`${colors.cyan}CTOC${colors.reset} - CTO Chief CLI`);
    print('');
    print('Usage: ctoc <command> [options]');
    print('');
    print('Commands:');
    print('  ctoc                    Show status');
    print('  ctoc doctor             Check installation health');
    print('  ctoc progress           Show Iron Loop progress');
    print('  ctoc plan status        Show plan dashboard');
    print('  ctoc start <feature>    Start tracking a feature');
    print('  ctoc step <n>           Move to Iron Loop step (1-15)');
    print('  ctoc gate <n>           Mark gate as passed (1 or 2)');
    print('  ctoc reset              Reset Iron Loop state');
    print('  ctoc update             Update CTOC to latest version');
    print('  ctoc version            Show version');
    print('  ctoc help               Show this help');
    print('');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
    const args = process.argv.slice(2);
    const command = args[0] || '';
    const subCommand = args[1] || '';

    switch (command) {
        case '':
        case 'status':
            cmdStatus();
            break;
        case 'version':
        case '--version':
        case '-v':
            cmdVersion();
            break;
        case 'doctor':
            cmdDoctor();
            break;
        case 'progress':
            cmdProgress();
            break;
        case 'plan':
            if (subCommand === 'status') {
                cmdPlanStatus();
            } else {
                print(`${colors.yellow}Usage:${colors.reset} ctoc plan status`);
            }
            break;
        case 'start':
            cmdStart(args.slice(1).join(' '));
            break;
        case 'step':
            cmdStep(subCommand);
            break;
        case 'gate':
            cmdGate(subCommand);
            break;
        case 'reset':
            cmdReset();
            break;
        case 'update':
            cmdUpdate();
            break;
        case 'help':
        case '--help':
        case '-h':
            cmdHelp();
            break;
        default:
            print(`${colors.red}Unknown command:${colors.reset} ${command}`);
            print('Run: ctoc help');
            process.exit(1);
    }
}

main();
