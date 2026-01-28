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

function cmdUpdate() {
    print('');
    print(`${colors.cyan}Checking for updates...${colors.reset}`);

    try {
        process.chdir(REPO_ROOT);

        // Fetch latest
        execSync('git fetch --quiet', { encoding: 'utf8' });

        const localVersion = getVersion();
        let remoteVersion;
        try {
            remoteVersion = execSync('git show origin/main:VERSION', { encoding: 'utf8' }).trim();
        } catch (e) {
            remoteVersion = localVersion;
        }

        if (localVersion === remoteVersion) {
            print(`${colors.green}✓${colors.reset} Already up to date (v${localVersion})`);
            print('');
            return;
        }

        print(`Update available: ${localVersion} → ${remoteVersion}`);
        print('Updating...');

        // Pull latest
        execSync('git pull --rebase --quiet', { encoding: 'utf8' });

        const newVersion = getVersion();
        print('');
        print(`${colors.green}✓${colors.reset} Updated to v${newVersion}`);
        print('');

        // Show recent changes
        try {
            const changes = execSync(`git log --oneline v${localVersion}..HEAD 2>/dev/null | head -5`, { encoding: 'utf8' }).trim();
            if (changes) {
                print(`${colors.cyan}Recent changes:${colors.reset}`);
                for (const line of changes.split('\n')) {
                    print(`  • ${line}`);
                }
                print('');
            }
        } catch (e) {}

    } catch (e) {
        print(`${colors.red}Error:${colors.reset} Update failed`);
        print(e.message);
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
