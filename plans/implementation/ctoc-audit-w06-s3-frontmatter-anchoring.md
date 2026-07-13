---
title: "W06-s3 — Frontmatter is parsed only when anchored at line 1"
type: feature
parent_plan: "ctoc-audit-w06-truthful-tests"
depends_on: none
files:
  - tests/architecture-invariants.test.js
priority: HIGH
---

# W06-s3 — Frontmatter is parsed only when anchored at line 1

**Story:** part of S5 lineage — finding **C7**.
**Pairing:** SIBLING-PAIRED with **W03 (Agent contracts load at runtime)**. This slice
anchors the test's parser and thereby flips the invariant RED on today's tree; W03's
production fix (moving the 19 agents' YAML to line 1) turns it GREEN. W06 does **not**
move any agent YAML — that is W03's file surface.

## Implementation Details

### Architecture Decision

`readFM` in `tests/architecture-invariants.test.js` currently matches YAML frontmatter
**anywhere** in a file:

```js
const m = content.match(/^---\n([\s\S]*?)\n---/m) ||   // anchored (correct)
          content.match(/\n---\n([\s\S]*?)\n---/);       // match-anywhere (the bug)
```

The `/m` flag on the first pattern already lets `^---` match at any line start, and the
second pattern is an explicit anywhere-fallback. Together they read a YAML block that
follows an `# H1` heading — frontmatter **the Claude Code runtime never parses**, because
the runtime only honours frontmatter at byte 0. So the 19 heading-first agent files
(`cto-chief` + the 5 scouts among them) have their declared `tools:`/`model:`/`tier:`
read by the test but ignored by the runtime, and the invariant is certified green while
`cto-chief` runs with all tools and the scouts run on the session model.

The fix (this slice): make `readFM` parse frontmatter **only when it starts at byte 0**,
matching the runtime. Concretely, replace the two-alternative match with a single
top-anchored parse that does **not** use `/m` and requires the file to begin with `---\n`:

```js
function readFM(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const m = /^---\n([\s\S]*?)\n---/.exec(content); // anchored at byte 0, no /m
  return { fm: m ? m[1] : '', body: content };
}
```

Once anchored, the 19 heading-first files return `fm === ''`, so the existing assertions
(`cto-chief` read-only tools / `top_level: true`; scouts `tier: 3` / `model: haiku`; etc.)
**fail** — which is the correct, currently-present defect surfacing. Well-formed agents
(YAML at line 1) still match, so they do not regress.

### Windows note (deliberately out of scope here)
`^---\n` assumes `\n` line endings. CRLF-safe parsing (`/\r?\n/`) is **W07's** surface;
this slice keeps the existing `\n` convention to avoid colliding with W07's file. Named
so the executor does not "helpfully" add CRLF handling and cross a workstream boundary.

### Dependency Graph

```
tests/architecture-invariants.test.js (readFM) --reads--> agents/**/*.md, skills/**/*.md
  (behavior change is confined to this one file; no src/ edit; no other slice touches it)
```

### File Specification

#### `tests/architecture-invariants.test.js` (MODIFY)
- Replace the `readFM` body's two-alternative match with the single byte-0-anchored,
  non-`/m` regex above. No other function changes.
- Do **not** alter any assertion body — the point is that anchoring alone flips the 19
  files RED. If anchoring surfaces an assertion that was *only ever* green because of the
  match-anywhere read (i.e. a well-formed file that nonetheless failed), treat that as a
  real finding and record it under Decisions rather than loosening the assertion.

### RED-now evidence
- `readFM` line 20 today carries the match-anywhere fallback.
- 19 agent files begin with `#` (H1) before their YAML (verified 2026-07-13). After
  anchoring, their `fm` is empty and the `cto-chief`/scout/tier assertions FAIL → the
  invariant test goes RED on today's tree.

### Test Plan
The modified invariant test **is** the deliverable. RED-now: after the edit, run
`node --test tests/architecture-invariants.test.js` on today's tree → FAILS, naming the
heading-first agents whose contract no longer parses. GREEN-after: once **W03** moves the
19 files' YAML to line 1, the same run passes with no other invariant regressing.

### Security Review
- [x] Read-only over the agent/skill tree; no writes outside the one test file.
- [x] No user input, no network, no `execSync`.
- [x] Anchoring makes the parser **stricter** (fail-louder), the safe direction.

## Execution Plan

### Step 8: TEST
Apply the `readFM` anchoring edit. Run `node --test tests/architecture-invariants.test.js`
and **capture the RED output** listing the heading-first agents whose frontmatter no longer
parses. This RED is the acceptance evidence for finding C7. State explicitly in the run
log: "GREEN pairing is W03 moving the 19 agents' YAML to line 1."

### Step 9: PREPARE
Confirm the 19 heading-first files exist (verified). Confirm no other test file imports
`readFM` from this module (it is file-local) so the change is contained.

### Step 10: IMPLEMENT
One step, one file:
- [ ] `tests/architecture-invariants.test.js` — anchor `readFM` to a single byte-0
  `^---\n` match, drop the match-anywhere fallback and the `/m` flag.

### Step 11: REVIEW
Confirm only `readFM` changed. Confirm well-formed agents (YAML at line 1) still parse
(spot-check `cto-chief` after W03, and any already-correct agent now) so the anchoring
does not over-reject.

### Step 12: OPTIMIZE
Single regex, single read — already minimal. Remove the now-dead second `.match(...)`
alternative entirely (dead code removal).

### Step 13: SECURE
Confirm the stricter parser cannot be satisfied by frontmatter placed mid-file (the exact
loophole that hid C7). No path escapes the repo tree.

### Step 14: VERIFY
Today's tree: `node --test tests/architecture-invariants.test.js` → **RED** (expected;
paired fix pending W03). No *other* test file regresses (run the full suite; only
architecture-invariants goes red, and only on the C7 assertions). Record the RED output
as the paired-fix witness.

### Step 15: DOCUMENT
Inline comment at `readFM` noting: "Anchored at byte 0 to match the Claude Code runtime
(finding C7); match-anywhere previously certified inert frontmatter. GREEN when W03 moves
heading-first agents' YAML to line 1."

### Step 16: FINAL-REVIEW
Confirm: parser anchored; RED captured on today's tree with the heading-first agents named;
no unrelated regressions; W03 pairing documented. Ready for the batched Gate 2.

## Decisions Taken Under Ambiguity
- **Anchor by removing `/m` + the fallback, not by adding a `.startsWith('---')` guard.**
  A single byte-0 regex is the minimal, clearest expression of "runtime parses only
  line-1 frontmatter" and removes the dead alternative in one edit.
- **CRLF handling deliberately not added here** — it is W07's surface; adding `\r?\n`
  now would edit the same parser two workstreams intend to touch and blur the boundary.
- **Assertions left byte-for-byte unchanged** — the slice must flip RED via anchoring
  alone; loosening any assertion would defeat the witness.
