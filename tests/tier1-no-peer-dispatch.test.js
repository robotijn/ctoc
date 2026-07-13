'use strict';

/**
 * Tier-1 no-peer-dispatch text invariant (W04 · s3).
 *
 * Architecture rule (single-dispatcher invariant): no Tier-1 sub-orchestrator
 * dispatches a sibling agent directly — every cross-agent dispatch is routed
 * through CTO Chief. This test guards that rule as a TEXT INVARIANT across the
 * live Tier-1 agent tree: it reads the REAL agent files read-only (no fixtures,
 * no doubles), so it tracks reality and catches drift on every run.
 *
 * A Tier-1 file is one that declares `tier: 1` in its frontmatter, plus — read
 * defensively — every agent file under the known Tier-1 directories
 * (`agents/planning`, `agents/iron-loop`, `agents/pipeline`) and
 * `agents/coordinator/synthesizer.md`. The CTO Chief coordinator
 * (`agents/coordinator/cto-chief.md`) is Tier 0, the sole dispatcher, and is
 * deliberately NOT in this set: it is ALLOWED to dispatch.
 *
 * The violation is an IMPERATIVE peer-dispatch directive — a directive line that
 * tells the agent to itself dispatch a named sibling (`Dispatch <name>`). The
 * pattern is CASE-SENSITIVE so it fires on the imperative capital-D "Dispatch
 * <name>" but NOT on compliant lowercase mentions ("does not itself dispatch",
 * "recommend dispatches; CTO Chief executes", "1-3 dispatches"), on the
 * "Dispatched OUTSIDE ..." Product-Loop note (no whitespace after "Dispatch"),
 * or on `dispatch_id:` audit fields.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(ROOT, 'agents');

// The imperative peer-dispatch directive. Case-sensitive capital-D "Dispatch"
// followed by whitespace and a lowercase agent-name token, optionally preceded
// by a list marker and/or bold markers. Matches `2. **Dispatch stack-chooser**`
// (pre-fix); does NOT match lowercase "dispatch", "Dispatched", or plain nouns.
const VIOLATION = /(?:^|\n)\s*(?:[-*]|\d+\.)?\s*\*{0,2}Dispatch\s+`?[a-z][a-z0-9-]*`?/;

// The one Tier-1 directory the coordinator lives in is agents/coordinator, but
// only its synthesizer is Tier 1; cto-chief and ivv-chief are handled by their
// own frontmatter (ivv-chief is tier:1 and IS included; cto-chief is Tier 0 and
// is NOT — it never declares tier:1).
const KNOWN_TIER1_DIRS = ['planning', 'iron-loop', 'pipeline'].map((d) =>
  path.join(AGENTS_DIR, d));
const EXTRA_TIER1_FILES = [path.join(AGENTS_DIR, 'coordinator', 'synthesizer.md')];

const IMPL_PLANNER = path.join(AGENTS_DIR, 'planning', 'implementation-planner.md');

// Normalize CRLF -> LF so the line-anchored regex and section parsing behave
// identically on a Windows (autocrlf) checkout. (split on /\r?\n/ per the
// cross-platform requirement.)
function readNormalized(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).join('\n');
}

// Tolerant frontmatter strip — matches an anchored `---` block first, then a
// mid-file block as a fallback, so W03's heading-first defect (a leading `# H1`
// before the `---`) does not couple this test to that separate defect. Returns
// the body AFTER the frontmatter block (or the whole content if none).
function bodyOf(content) {
  const anchored = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (anchored) return content.slice(anchored[0].length);
  const mid = content.match(/\n---\n[\s\S]*?\n---\n?/);
  if (mid) return content.slice(content.indexOf(mid[0]) + mid[0].length);
  return content;
}

// Read the frontmatter block body (tolerant), for the `tier:` probe.
function frontmatterOf(content) {
  const fm = content.match(/^---\n([\s\S]*?)\n---/) || content.match(/\n---\n([\s\S]*?)\n---/);
  return fm ? fm[1] : null;
}

function declaresTier1(content) {
  const fm = frontmatterOf(content);
  if (!fm) return false;
  return /^tier:\s*1\s*$/m.test(fm);
}

// Build the Tier-1 file set: every agent file declaring `tier: 1`, UNION every
// .md under the known Tier-1 dirs, UNION the extra explicit files. Returns a
// sorted array of absolute paths (deduplicated).
function tier1Files() {
  const set = new Set();

  // 1. Every agent file that declares tier: 1 in frontmatter.
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        if (declaresTier1(fs.readFileSync(full, 'utf8'))) set.add(full);
      }
    }
  })(AGENTS_DIR);

  // 2. Every .md under the known Tier-1 dirs (defensive — matches the plan).
  for (const dir of KNOWN_TIER1_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) set.add(path.join(dir, entry.name));
    }
  }

  // 3. Extra explicit Tier-1 files.
  for (const f of EXTRA_TIER1_FILES) if (fs.existsSync(f)) set.add(f);

  return [...set].sort();
}

// Extract the "## Step 0: Template selection" section of a body, up to the next
// top-level `## ` heading (or end of file).
function stepZeroSection(body) {
  const start = body.indexOf('## Step 0: Template selection');
  if (start === -1) return null;
  const rest = body.slice(start + 1);
  const nextHeading = rest.search(/\n## /);
  return nextHeading === -1 ? body.slice(start) : body.slice(start, start + 1 + nextHeading);
}

// Split a Step-0 section into its numbered list items (top-level `N. ` markers).
function numberedItems(section) {
  // Each item begins at a line that starts with `<digits>. `. Split on those
  // boundaries, keeping the marker with its item.
  const parts = section.split(/\n(?=\d+\.\s)/);
  return parts.filter((p) => /^\d+\.\s/.test(p.trimStart()));
}

// ---------------------------------------------------------------------------

describe('tier1-no-peer-dispatch — text invariant across all Tier-1 agents', () => {
  it('case 1: no Tier-1 agent body contains an imperative peer-dispatch directive', () => {
    const offenders = [];
    for (const file of tier1Files()) {
      const body = bodyOf(readNormalized(file));
      if (VIOLATION.test(body)) {
        const line = (body.match(VIOLATION) || [''])[0].trim();
        offenders.push(`${path.relative(ROOT, file)} :: ${line}`);
      }
    }
    assert.deepEqual(
      offenders, [],
      `Tier-1 agent(s) with a direct peer-dispatch directive (must route via CTO Chief):\n  ${offenders.join('\n  ')}`,
    );
  });

  it('case 2: implementation-planner Step 0 still routes stack-chooser through CTO Chief', () => {
    const body = bodyOf(readNormalized(IMPL_PLANNER));
    const section = stepZeroSection(body);
    assert.ok(section, 'implementation-planner has no "## Step 0: Template selection" section');

    // The capability is preserved: stack-chooser is still referenced ...
    assert.ok(
      /stack-chooser/.test(section),
      'Step 0 no longer references stack-chooser — the capability was lost, not just rerouted',
    );

    // ... and the SAME numbered item that names stack-chooser also names CTO
    // Chief / cto-chief, i.e. the dispatch is explicitly routed through the
    // sole dispatcher rather than performed peer-to-peer.
    const stackItem = numberedItems(section).find((it) => /stack-chooser/.test(it));
    assert.ok(stackItem, 'no numbered Step 0 item references stack-chooser');
    assert.ok(
      /CTO Chief|cto-chief/.test(stackItem),
      'the stack-chooser Step 0 item does not route through CTO Chief:\n' + stackItem,
    );
  });

  it('case 3: red-before-fix proof — the detector fires on the pre-fix directive', () => {
    // Self-contained proof that the VIOLATION scan detects the defect it is
    // meant to catch, independent of the current tree state.
    const PRE_FIX = '2. **Dispatch stack-chooser** (`agents/planning/stack-chooser.md`):';
    assert.equal(VIOLATION.test(PRE_FIX), true, 'detector failed to flag the known pre-fix directive');

    // And compliant phrasings must NOT trip it (guards against a too-greedy
    // pattern that would false-positive the whole tree green-or-red by accident).
    const COMPLIANT = [
      'does not itself dispatch a peer',
      'recommend dispatches; CTO Chief executes',
      'start small (1-3 dispatches)',
      'Dispatched OUTSIDE the CTO Chief technical chain by the founder',
      'Recommend that CTO Chief dispatch `stack-chooser`',
    ];
    for (const c of COMPLIANT) {
      assert.equal(VIOLATION.test(c), false, `detector false-positived a compliant phrase: "${c}"`);
    }
  });
});
