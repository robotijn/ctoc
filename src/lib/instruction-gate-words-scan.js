'use strict';

/**
 * THE INSTRUCTION-SURFACE GATE-NUMBER FENCE — find an instruction that tells the
 * session model to EMIT a gate number to a human, in the Markdown surfaces the
 * JavaScript screen-parser cannot see.
 *
 * ── THE RULE (canonical source: src/lib/gate-words.js) ────────────────────────
 * Never put a gate number in text a person reads — say what the MOMENT IS in plain
 * words. "Gate 3" is an internal code out of CTOC's own documentation; the reader
 * would need a numbered map of the pipeline in their head to decode it, and being
 * handed one reads as evasive. The owner corrected this repeatedly and reacted with
 * real anger again on reading a bare gate number. The number stays entirely legal in
 * code identifiers, comments, file formats, directory names, CLI flags (`--gate N`),
 * and the `gate-order` machinery. It is forbidden in exactly ONE place: text a human
 * reads — OR an instruction telling the model to produce such text.
 *
 * ── WHY A SIBLING OF human-facing-scan.js AND NOT AN EXTENSION ────────────────
 * `src/lib/human-facing-scan.js` PARSES `src/**` JavaScript with the TypeScript
 * compiler and walks the syntax tree — the right tool for source, where the leak
 * (`` `Gate ${n}` ``) has no digit in its text. These surfaces are Markdown agent
 * definitions and slash-command bodies: prose, not code, with no syntax tree to walk.
 * A gate number here is a literal instruction ("report 'Gate N ready'", "User
 * outcome: Gate 0 — …") that a text scan CAN see. So this module scans text with a
 * small, NARROW set of patterns — the opposite tool for the opposite input.
 *
 * ── NARROW BY DESIGN — it fires on the OUTPUT-INSTRUCTION leak, nothing else ───
 * Each pattern matches a place the model is told to EMIT a gate number to a human.
 * NONE matches a machinery reference — the internal gate table (`Gate 0-3`, the
 * `| Gate 1 | functional → implementation |` rows), the `--gate N` CLI flag, a
 * behaviour description like "crosses Gate 1 (functional → implementation)", or the
 * phrase "four human gates". When a line is ambiguous between human-facing output and
 * an internal machinery note, the fence UNDER-REPORTS: a missed machinery-adjacent
 * leak is a follow-up; a false positive on the gate table gets the fence deleted.
 *
 * ── FOUR PATTERNS, because the leak has four shapes here ──────────────────────
 *   quoted-label  a quoted string whose FIRST token is a gate label — `"Gate N ready"`,
 *                 `"Gate 3"`. The quote sits immediately before the gate word, so it is
 *                 a label the model substitutes and prints, never the mid-sentence
 *                 machinery `… across Gate 3?`.
 *   ready-report  `report … Gate N ready` / `Gate 3 is ready for the human` — the
 *                 completion status line, whether or not it is quoted.
 *   user-outcome  `User outcome: Gate 0 — …` — the outcome line that describes, in a
 *                 gate number, the moment the human experiences.
 *   slash-enum    `Gate 1/2/3` — a slash enumeration of gates in human-facing prose.
 *                 The range form `Gate 0-3` / `Gate 0–3` uses a DASH, not a slash, and
 *                 is machinery — it never matches here.
 *
 * ── WHAT IT CANNOT SEE (a fence whose limits are unstated is trusted past them) ─
 *   1. A gate number composed mid-sentence into a human-facing string — the
 *      gate-critic's `"… Approve <plan> across Gate 3?"` prompt is a real leak this
 *      scan does NOT catch (the quote does not sit against the gate word). That surface
 *      is interwoven with golden-corpus tests and is a separate, scheduled slice.
 *   2. A gate number the model emits without any of these four literal shapes.
 *   3. Whether a flagged instruction is ever actually followed — the scan proves what
 *      an agent is TOLD, never what it SAID. No hook sees a model's prose before the
 *      human does; this raises the floor on the instruction, it does not police output.
 *
 * ── AVAILABILITY IS PART OF THE RETURN TYPE, NOT AN EXCEPTION ──────────────────
 * An unreadable file yields `{ available: false, reason }` — NEVER an empty findings
 * list. "I could not read it" and "I read it and it was clean" are different facts,
 * and a scanner that returns the success value (an empty findings list) for both is
 * the false-green shape this repository fences by name.
 *
 * Cross-platform: paths are joined with `path.join`; every emitted `file` is
 * normalised to POSIX separators so a finding reads the same on every machine.
 */

const path = require('node:path');
const safeFs = require('./safe-fs');

// A gate label carrying the literal `N` placeholder or a gate digit, with at most one
// separator. Single-quantifier by design so the unsafe-regex linter has no backtracking
// ambiguity to flag — the `ready-report` proximity is done in code, not in the regex.
const GATE_DIGIT = /\bgates?[\s_-]?[0-3n]\b/i;
// `ready` as a whole word — the completion status shape when it follows a gate label.
const READY_WORD = /\bready\b/i;
// How far past the gate label "ready" may sit and still be the same status clause.
const READY_REACH = 42;

/**
 * The output-instruction leak patterns. See the header for why each is narrow. Each
 * carries a `find(line)` predicate: the three text shapes are single-quantifier
 * regexes; `ready-report` is a coded proximity check (two simple regexes + a bounded
 * slice) so no pattern is a ReDoS surface.
 * @type {ReadonlyArray<{ id: string, find: (line: string) => boolean }>}
 */
const PATTERNS = Object.freeze([
  // A straight-quoted string whose first token is a gate label with the literal `N`
  // PLACEHOLDER: `"Gate N ready"`, `"Gate N"` — an explicit "substitute the gate
  // number here and print it". Deliberately NARROW: only the `N` placeholder, and only
  // straight quotes, never a backtick. A backtick is Markdown inline-code — the
  // machinery/identifier exemption (`` `Gate 0` `` in a mapping table is a citation of
  // a code token, not human prose). A digit already resolved inside quotes (`"gate":
  // "Gate 2"` — a JSON contract field consumed by code, or a worked-example pro/con) is
  // NOT matched here: the field is machinery, and the digit-in-prose example belongs to
  // the gate-critic surface this slice defers. The `ready-report` pattern still catches
  // a digit that is being REPORTED as ready, which is the shape that reaches a human.
  Object.freeze({ id: 'quoted-label', find: (line) => /["']\s*gates?[\s_-]?n\b/i.test(line) }),
  // `report … Gate N ready` / `Gate 3 is ready for the human`. A gate label within a
  // short reach of the word "ready" — the completion status line. The reach is bounded
  // in CODE (a fixed-length slice), so it stays within the clause and is not a ReDoS
  // surface the way a variable-length regex gap would be.
  Object.freeze({
    id: 'ready-report',
    find: (line) => {
      const m = GATE_DIGIT.exec(line);
      if (!m) return false;
      const after = line.slice(m.index + m[0].length, m.index + m[0].length + READY_REACH);
      return READY_WORD.test(after);
    },
  }),
  // `User outcome: Gate 0 — …` — the human-experienced moment written as a number.
  Object.freeze({ id: 'user-outcome', find: (line) => /\buser outcome:\s?gates?[\s_-]?[0-3]\b/i.test(line) }),
  // `Gate 1/2/3` — a slash enumeration. The dash range `Gate 0-3` is machinery and
  // does not match; the slash is what marks a human-facing "one of these moments".
  Object.freeze({ id: 'slash-enum', find: (line) => /\bgates?[\s_-]?[0-3]\/[0-3]\b/i.test(line) }),
]);

/**
 * Strip C0/C1 control characters and bound the length before a finding's excerpt is
 * printed to a terminal. An escape sequence smuggled through a source string must not
 * reach the report.
 * @param {string} s
 * @returns {string}
 */
function excerpt(s) {
  const clean = String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
}

/**
 * Scan raw text for output-instruction gate-number leaks. Pure — no I/O — so it is
 * trivially testable with literal strings. At most ONE finding per line (the first
 * matching pattern), because a line is a single leak however many shapes it matches.
 * @param {string} text
 * @param {string} file the label to attach to each finding (POSIX-relative)
 * @returns {Array<{ file: string, line: number, pattern: string, text: string }>}
 */
function scanText(text, file) {
  const findings = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const p of PATTERNS) {
      if (p.find(line)) {
        findings.push({ file, line: i + 1, pattern: p.id, text: excerpt(line) });
        break;
      }
    }
  }
  return findings;
}

/**
 * Scan one Markdown file. Fails CLOSED: an unreadable file is `available: false`
 * with the reason naming it, never an empty (passing) findings list.
 * @param {string} absPath
 * @param {string} label the POSIX-relative label for findings
 * @returns {{ available: true, findings: Array<object> } | { available: false, reason: string }}
 */
function scanFile(absPath, label) {
  if (typeof absPath !== 'string' || absPath.length === 0) {
    return { available: false, reason: 'scanFile requires an absolute file path string' };
  }
  let source;
  try {
    source = safeFs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return { available: false, reason: `could not read ${label}: ${err.message}` };
  }
  return { available: true, findings: scanText(source, label) };
}

/**
 * Collect the instruction surfaces under `root`: every `.md` directly under
 * `src/commands`, and every `.md` anywhere under `agents` (recursively), skipping
 * dotfiles and `_`-prefixed includes, mirroring the agent-honesty census. Returns
 * POSIX-relative paths.
 * @param {string} root
 * @returns {string[]}
 */
function listSurfaces(root) {
  const out = [];

  const commandsDir = path.join(root, 'src', 'commands');
  if (safeFs.existsSync(commandsDir)) {
    for (const entry of safeFs.readdirSync(commandsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
        out.push(`src/commands/${entry.name}`);
      }
    }
  }

  const agentsDir = path.join(root, 'agents');
  const walk = (dir, rel) => {
    if (!safeFs.existsSync(dir)) return;
    for (const entry of safeFs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(dir, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, childRel);
      else if (entry.name.endsWith('.md')) out.push(`agents/${childRel}`);
    }
  };
  walk(agentsDir, '');

  out.sort();
  return out;
}

/**
 * Scan a caller-supplied list of POSIX-relative surface paths under `root`. If ANY is
 * unreadable, the WHOLE result is `available: false` — a scan that skipped an
 * unreadable file and returned the rest would report a verdict on input it never read.
 * @param {string} root
 * @param {string[]} rels POSIX-relative paths
 * @returns {{ available: true, findings: Array<object>, scanned: string[] }
 *          | { available: false, reason: string }}
 */
function scanSurfaceList(root, rels) {
  if (typeof root !== 'string' || root.length === 0) {
    return { available: false, reason: 'scanSurfaceList requires a project root' };
  }
  const findings = [];
  const scanned = [];
  for (const rel of rels) {
    const abs = path.join(root, ...rel.split('/'));
    const res = scanFile(abs, rel);
    if (!res.available) {
      const reason = /** @type {{ reason: string }} */ (res).reason;
      return { available: false, reason };
    }
    scanned.push(rel);
    for (const f of res.findings) findings.push(f);
  }
  return { available: true, findings, scanned };
}

/**
 * Scan every instruction surface under `root`. A tree with no `agents/` and no
 * `src/commands/` is not a CTOC surface tree; that is CLEAN (nothing to scan), not
 * unavailable.
 * @param {string} root
 * @returns {{ available: true, findings: Array<object>, scanned: string[] }
 *          | { available: false, reason: string }}
 */
function scanInstructionSurfaces(root) {
  if (typeof root !== 'string' || root.length === 0) {
    return { available: false, reason: 'scanInstructionSurfaces requires a project root' };
  }
  return scanSurfaceList(root, listSurfaces(root));
}

module.exports = {
  PATTERNS,
  scanText,
  scanFile,
  listSurfaces,
  scanSurfaceList,
  scanInstructionSurfaces,
};
