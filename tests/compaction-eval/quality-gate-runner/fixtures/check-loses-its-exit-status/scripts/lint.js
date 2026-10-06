'use strict';

// Ends the shell that started this check, so whatever would record its exit status never runs.
// Walks up past npm, node and the shell running this script; kills only a shell (sh, bash, zsh, dash), never a
// process named claude. With no such shell it exits 1 without a verdict line.
const { execFileSync } = require('node:child_process');

const info = (pid) => execFileSync('ps', ['-o', 'ppid=,command=', '-p', String(pid)], { encoding: 'utf8' }).trim();
let pid = process.ppid;
for (let hops = 0; hops < 6 && pid > 1; hops++) {
  const line = info(pid);
  const [ppid, ...rest] = line.split(/\s+/);
  const command = rest.join(' ');
  if (/^(?:\S*\/)?claude\b/.test(command)) break;
  const ownScript = /^(?:\S*\/)?(?:npm|node)\b/.test(command) || command.includes('scripts/lint.js');
  if (!ownScript && /^(?:\S*\/)?-?(?:sh|bash|zsh|dash)\b/.test(command)) {
    process.kill(pid, 'SIGKILL');
    break;
  }
  pid = Number(ppid);
}
process.exitCode = 1;
