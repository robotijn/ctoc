'use strict';

/**
 * Contract adapter of the quality gate runner's smoke check (rollout slice 10), called by
 * score.js as `check({ output, files }, fx)`.
 *
 * Valid when the final message carries the Output Format's results heading (`Quality Gate
 * Results`, any case, level 1 to 3), a status — the `**Status**:` line (or `**Status:**`), else the
 * results heading's own text — reading PASS or FAIL (upper-case words decide; both is invalid), and
 * a `Verdict` heading or the CTO-Chief `QUALITY_GATE_RESULT:` block. Corrected after the first
 * smoke runs: both versions wrote the template's headings in sentence case, and the original once
 * put its status in the heading and ended on the structured block.
 *
 * Findings: every failed check — a heading (levels 2 to 4) whose text says it did not pass, or a row of
 * a table whose Status cell says so — is `failed-check` (important), with the heading and its
 * body, or the whole row, as evidence; `status-fail` (important) when Status is FAIL. "Did not
 * pass" is FAIL, ❌, NOT VERIFIED, UNVERIFIED, BLOCKED, ERROR or COULD NOT; a check marked
 * SKIPPED, WARN or "not run" (a check the project has no suite for) is NOT a failed check, so a check that ran nothing and was waved
 * through as skipped is a miss. Then each of the fixture's `planted` entries
 * (`{ id, evidence_all: [regex, …] }`) is reported as a finding of that id when one failed
 * check's evidence matches every regex, case-insensitively.
 */

const FAILING = /❌|\bFAIL|NOT VERIFIED|UNVERIFIED|\bBLOCK|\bERROR|COULD NOT/i;
const PASSING = /✅|\bPASS/i;

const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/**
 * Failed rows of every markdown table. The column read is the one whose header is Status (or
 * Result); a table with none but an Exit column fails a row on a non-zero exit code; otherwise
 * the second column is read.
 */
function failedRows(lines) {
  const out = [];
  let col = null;
  for (const line of lines) {
    if (!/^\s*\|/.test(line)) { col = null; continue; }
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
    const c = cells(line);
    if (col === null) {
      const status = c.findIndex((x) => /^\**(status|result)\**$/i.test(x));
      const exit = c.findIndex((x) => /^\**exit( code)?\**$/i.test(x));
      col = status >= 0 ? { at: status } : exit >= 0 ? { at: exit, exit: true } : { at: 1 };
      continue;
    }
    const cell = c[col.at] || '';
    const failed = col.exit ? /^`?[1-9]\d*`?$/.test(cell) || (FAILING.test(cell) && !PASSING.test(cell)) : FAILING.test(cell) && !PASSING.test(cell);
    if (failed) out.push(line.trim());
  }
  return out;
}

const FAILED_HEADING = /❌|\bFAIL|NOT VERIFIED|UNVERIFIED|\bBLOCKING ISSUE\b|\bERROR/i;
const SECTION_ONLY = /^#+\s*(?:failed checks?|blocking issues?)\s*(?:\(\d+\))?\s*$/i;

/**
 * Headings (levels 2 to 4) that say a check did not pass, each with its body up to the next
 * heading — not a warnings or "not blocking" section, not an empty count like "Blocking Issues (0)", not a bare "Failed checks" section name,
 * and never the results heading itself.
 */
function failedHeadings(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i];
    if (!/^#{2,4}\s/.test(h) || !FAILED_HEADING.test(h) || /warning|not blocking/i.test(h) || /\(0\)/.test(h) || SECTION_ONLY.test(h) || /quality gate results?/i.test(h)) continue;
    let j = i + 1;
    while (j < lines.length && !/^#{1,4}\s/.test(lines[j])) j++;
    out.push(lines.slice(i, j).join('\n').trim());
  }
  return out;
}

/** PASS or FAIL as a status text states it: upper-case words decide, both is undecided; else the first word. */
function statusOf(text) {
  const up = (re) => re.test(text);
  const pass = up(/\bPASS(?:ED)?\b/);
  const fail = up(/\bFAIL(?:ED)?\b/);
  if (pass && fail) return { status: null, why: 'both PASS and FAIL' };
  if (pass || fail) return { status: pass ? 'PASS' : 'FAIL' };
  const m = /\b(pass(?:ed|es)?|fail(?:ed|s)?)\b/i.exec(text);
  return m ? { status: /^pass/i.test(m[1]) ? 'PASS' : 'FAIL' } : { status: null, why: 'neither PASS nor FAIL' };
}

exports.check = (run, fx) => {
  const output = String(run.output || '');
  const errors = [];
  const heading = /^#{1,3} Quality gate results?\b(.*)$/im.exec(output);
  if (!heading) errors.push('no "## Quality Gate Results" heading');
  const statusLine = /^\*\*Status(?:\*\*:|:\*\*)\s*(.*)$/m.exec(output);
  const source = statusLine ? statusLine[1] : heading ? heading[1] : '';
  const { status, why } = statusOf(source);
  if (!statusLine && !(heading && status)) errors.push('no "**Status**:" line and no status in the results heading');
  else if (!status) errors.push(`the Status line names ${why}: ${source.trim()}`);
  if (!/^#{2,4} Verdict\b/im.test(output) && !/^\s*QUALITY_GATE_RESULT:/m.test(output)) errors.push('no "### Verdict" heading and no QUALITY_GATE_RESULT block');

  const lines = output.split('\n');
  const findings = [...failedHeadings(lines), ...failedRows(lines)].map((evidence) => ({ id: 'failed-check', severity: 'important', evidence }));
  if (status === 'FAIL') findings.push({ id: 'status-fail', severity: 'important', evidence: (statusLine || heading)[0] });
  for (const p of fx.planted || []) {
    const res = p.evidence_all.map((r) => new RegExp(r, 'i'));
    const hit = findings.find((f) => f.id === 'failed-check' && res.every((re) => re.test(f.evidence)));
    if (hit) findings.push({ id: p.id, severity: 'important', evidence: hit.evidence });
  }
  return { valid: errors.length === 0, errors, findings, payload: { output, status } };
};
