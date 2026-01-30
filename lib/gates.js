/**
 * Human Gates
 * Confirmation points requiring human approval before critical actions
 */

const readline = require('readline');
const { c, line } = require('./tui');

/**
 * Ask for human confirmation before proceeding
 * @param {string} title - Gate title
 * @param {string} summary - What's about to happen
 * @param {Array} options - Choices with labels
 * @returns {Promise<number>} - Selected option index (0-based)
 */
async function gate(title, summary, options = null) {
  const defaultOptions = [
    { label: 'Yes, proceed' },
    { label: 'Review first' },
    { label: 'Cancel' }
  ];

  const choices = options || defaultOptions;

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('');
    console.log(`${c.yellow}${c.bold}${title}${c.reset}`);
    console.log(line());
    console.log('');
    console.log(summary);
    console.log('');
    console.log(line());

    choices.forEach((opt, i) => {
      if (opt.danger) {
        console.log(`${c.red}${i + 1}. ${opt.label}${c.reset}`);
      } else {
        console.log(`${i + 1}. ${opt.label}`);
      }
    });

    console.log('');
    rl.question(`${c.dim}Enter 1-${choices.length}: ${c.reset}`, (answer) => {
      rl.close();
      const choice = parseInt(answer, 10) - 1;
      if (choice >= 0 && choice < choices.length) {
        resolve(choice);
      } else {
        resolve(choices.length - 1); // Default to last (usually cancel)
      }
    });
  });
}

/**
 * Gate before commit and push
 * @param {Object} changes - { files, insertions, deletions, version }
 * @returns {Promise<boolean>} - true if approved
 */
async function commitGate(changes) {
  const summary = `Files: ${changes.files} changed, ${changes.insertions} insertions, ${changes.deletions} deletions
Version: ${changes.version}`;

  const choice = await gate(
    '🚦 Ready to commit and push?',
    summary,
    [
      { label: 'Yes, commit and push' },
      { label: 'Show diff first' },
      { label: 'Cancel' }
    ]
  );

  return choice === 0;
}

/**
 * Gate before destructive action
 * @param {string} action - What's being done
 * @param {string} target - What it affects
 * @returns {Promise<boolean>} - true if approved
 */
async function destructiveGate(action, target) {
  const choice = await gate(
    `⚠️ ${action}`,
    `This will affect: ${target}`,
    [
      { label: 'Yes, proceed', danger: true },
      { label: 'Cancel' }
    ]
  );

  return choice === 0;
}

/**
 * Gate before release
 * @param {string} version - Version being released
 * @param {string} changelog - What's changing
 * @returns {Promise<boolean>} - true if approved
 */
async function releaseGate(version, changelog) {
  const choice = await gate(
    `🚀 Release v${version}?`,
    changelog,
    [
      { label: 'Yes, release' },
      { label: 'Review changes' },
      { label: 'Cancel' }
    ]
  );

  return choice === 0;
}

module.exports = {
  gate,
  commitGate,
  destructiveGate,
  releaseGate
};
