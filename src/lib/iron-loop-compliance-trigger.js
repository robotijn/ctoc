/**
 * Iron Loop compliance-trigger EMITTER (EC5-s4).
 *
 * The load-bearing invariant (parent adversarial review): LIBRARY CODE MUST NOT
 * DISPATCH AGENTS. At the functional→implementation seam the Iron Loop needs to
 * communicate WHETHER the compliance agents should run — but the decision to
 * actually spawn an agent belongs to CTO Chief (Tier 0), the sole dispatcher
 * (EC5-s5). This module therefore only EMITS a trigger CONDITION: it evaluates
 * the two regime gates and produces a plain descriptor object, and can write
 * that descriptor into a plan's frontmatter for CTO Chief to read. It spawns no
 * process, requires no agent runner, moves no plan, and touches no human gate.
 *
 * The `dispatcher: 'cto-chief'` field is the machine-checkable proof that
 * dispatch is delegated: this module never names the Iron Loop itself as the
 * dispatcher.
 *
 * Advisory + fail-open: a wrong/missing project root yields an all-false
 * trigger (never a throw); a missing plan file / absent frontmatter / any fs
 * error in the writer returns `{ ok: false }` without corrupting the file. This
 * module ADDS and WEAKENS no gate; it names no gate key and imports no hook.
 *
 * Deliberately SEPARATE from `src/lib/iron-loop.js` (the Integrator+Critic
 * step-scoring engine): bolting compliance-trigger logic onto that file would
 * violate single-responsibility and risk the load-bearing step-label
 * validation. The trigger seam lives here, isolated and independently testable.
 *
 * Dependency direction: lib → lib only. Imports `compliance-regime`
 * (the ONE source of truth for the gates) and `safe-fs` (the audited fs choke
 * point) and NOTHING from hooks, commands, or any agent runner.
 *
 * Cross-platform: `safe-fs` for all fs; CRLF-tolerant static frontmatter regex;
 * absolute `planPath` supplied by the caller (no path concatenation).
 */

'use strict';

const safeFs = require('./safe-fs');
const { shouldRunGdpr, shouldRunEuAiAct } = require('./compliance-regime');

/**
 * The sole dispatcher for the emitted trigger. Always this literal — never the
 * Iron Loop itself. CTO Chief (Tier 0) reads the trigger and dispatches; the
 * Iron Loop library never spawns an agent itself.
 * @type {'cto-chief'}
 */
const DISPATCHER = 'cto-chief';

/**
 * Evaluate the compliance trigger condition for a project.
 *
 * Reads the two regime gates via the compliance-regime resolver (one source of
 * truth) and returns a plain descriptor. NEVER dispatches. `dispatcher` is
 * ALWAYS the literal `'cto-chief'`. A non-string / empty root fails open to an
 * all-false trigger (the gate helpers already return `false` for a bad root;
 * this is belt-and-suspenders and documents the contract at this layer).
 *
 * @param {*} projectRoot - absolute project root; a bad value yields all-false
 * @returns {{ runGdpr: boolean, runEuAiAct: boolean, dispatcher: 'cto-chief' }}
 */
function evaluateComplianceTrigger(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    return { runGdpr: false, runEuAiAct: false, dispatcher: DISPATCHER };
  }
  return {
    runGdpr: shouldRunGdpr(projectRoot) === true,
    runEuAiAct: shouldRunEuAiAct(projectRoot) === true,
    dispatcher: DISPATCHER,
  };
}

/**
 * Render the trigger as an indented YAML `compliance_trigger:` block (no
 * trailing newline — the caller controls surrounding newlines). Values are
 * booleans and a fixed literal, so this is injection-free by construction.
 *
 * @param {{ runGdpr: boolean, runEuAiAct: boolean, dispatcher: string }} t
 * @returns {string}
 */
function renderTriggerBlock(t) {
  return [
    'compliance_trigger:',
    `  runGdpr: ${t.runGdpr}`,
    `  runEuAiAct: ${t.runEuAiAct}`,
    `  dispatcher: ${t.dispatcher}`,
  ].join('\n');
}

/**
 * Upsert the `compliance_trigger:` block inside a frontmatter body, line by
 * line (no backtracking regex, so ReDoS-safe). If a `compliance_trigger:`
 * header exists, its header line plus the immediately following indented child
 * lines are replaced in place (never duplicated); otherwise the block is
 * appended. All other lines are preserved byte-identically.
 *
 * @param {string} fmBody - the frontmatter body (between the --- delimiters)
 * @param {string} block - the rendered `compliance_trigger:` block
 * @returns {string} the updated frontmatter body
 */
function upsertTriggerBlock(fmBody, block) {
  const lines = fmBody.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => /^[ \t]*compliance_trigger:/.test(l));

  if (headerIdx === -1) {
    // Append as the last key inside the frontmatter, preserving the body's
    // existing trailing whitespace before the closing delimiter.
    const sep = fmBody.endsWith('\n') || fmBody.length === 0 ? '' : '\n';
    return `${fmBody}${sep}${block}`;
  }

  // Consume the header's indented child lines (start with whitespace).
  let endIdx = headerIdx + 1;
  while (endIdx < lines.length && /^[ \t]+\S/.test(lines[endIdx])) endIdx++;

  const before = lines.slice(0, headerIdx);
  const after = lines.slice(endIdx);
  return [...before, ...block.split('\n'), ...after].join('\n');
}

/**
 * Compute the trigger for `projectRoot` and write it into `planPath`'s YAML
 * frontmatter under `compliance_trigger:` via a TARGETED upsert: if the block
 * already exists it is replaced in place (never duplicated); otherwise the
 * block is appended as the last key inside the frontmatter. All other
 * frontmatter keys and the entire body stay byte-identical. Mirrors
 * `compliance-regime.js:writeActiveProfiles`'s surgical-replacement discipline.
 *
 * DISPATCHES NOTHING — it only computes and persists a descriptor.
 *
 * Fail-open: non-string `planPath`, missing file, absent frontmatter block, or
 * any fs error ⇒ `{ ok: false, trigger }` WITHOUT corrupting or creating a
 * file. Never throws for these expected inputs.
 *
 * @param {string} planPath - absolute path to the plan file
 * @param {*} projectRoot - absolute project root
 * @returns {{ ok: boolean, trigger: { runGdpr: boolean, runEuAiAct: boolean, dispatcher: 'cto-chief' } }}
 */
function writeComplianceTrigger(planPath, projectRoot) {
  const trigger = evaluateComplianceTrigger(projectRoot);

  if (typeof planPath !== 'string' || planPath.length === 0) {
    return { ok: false, trigger };
  }

  try {
    if (!safeFs.existsSync(planPath)) return { ok: false, trigger };

    const content = safeFs.readFileSync(planPath, 'utf8');

    // Isolate the FIRST frontmatter block (--- ... ---). CRLF-tolerant.
    const fm = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
    if (!fm) return { ok: false, trigger };

    const [, open, fmBody, close] = fm;
    const block = renderTriggerBlock(trigger);
    const newBody = upsertTriggerBlock(fmBody, block);

    // Function replacement so any `$` in the frontmatter is treated literally
    // (a string replacement would interpret `$&`, `$1`, etc.).
    const rebuilt = `${open}${newBody}${close}`;
    const updated = content.replace(fm[0], () => rebuilt);
    safeFs.writeFileSync(planPath, updated);

    return { ok: true, trigger };
  } catch {
    // fs / parse error ⇒ fail-open; never corrupt the plan.
    return { ok: false, trigger };
  }
}

module.exports = {
  evaluateComplianceTrigger,
  writeComplianceTrigger,
};
