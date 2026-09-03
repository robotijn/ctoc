---
iron_loop_verdict: true
title: "The evidence pack tells the truth about the right repository — the five fixes and the six tightened pins"
type: implementation
iron_loop: true
parent_plan: the-evidence-pack-tells-the-truth-about-the-right-repository
depends_on: none
priority: high
effort: medium
files:
  - src/scripts/evidence-pack.js
  - tests/evidence-pack-main.test.js
  - tests/evidence-pack-collect.test.js
  - tests/evidence-pack-security.test.js
approved_by: human
approved_at: 2026-09-03T11:43:00.476Z
gate_crossed: review → done
---

# The evidence pack tells the truth about the right repository — the five fixes and the six tightened pins

One script and its three test files are one unit of work, so this is the parent's
only slice.

## Drift found by reading the code (the plan's memory was wrong on two counts)

Both corrections were established by reading the files, not by recall. The
executor builds to THIS section where it disagrees with the parent.

1. **THREE collectors ignore the window, not two.** In
   `src/scripts/evidence-pack.js`, `collectInputs` pushes unconditionally at
   three sites:
   - collector 2, the audit chain log (line 81): `if (safeFs.existsSync(chainPath)) inputs.push(chainPath);`
   - collector 6, the provenance event log (line 108): `if (safeFs.existsSync(provPath)) inputs.push(provPath);`
   - collector 7, each version's configuration baseline manifest (line 115): `if (safeFs.existsSync(mPath)) inputs.push(mPath);`

   The wave's pin case named only the chain log and the baseline manifest because
   its fixture never seeded `.ctoc/ai-provenance.jsonl`, and this repository has
   no such file either (`Glob .ctoc/ai-provenance.jsonl` → no match), so
   collector 6's push line has never executed under any test. It is window-blind
   by exactly the same shape as the other two and is fixed with them.

2. **SIX cases in `tests/evidence-pack-main.test.js` encode pinned behaviour, not
   three.** The parent counts the three cases whose comments say "pinned"; the
   file's own header (lines 46–61) lists four pinned behaviours, a fifth case pins
   the window-blindness, and a sixth pins the byte shape of the broken window
   block. Every one is listed with its replacement in
   [Tightened pins](#tightened-pins-operating-lesson-14) below.

## Implementation Details

### Dependency graph

```
src/scripts/evidence-pack.js
  ├── requires ../lib/safe-fs            (existing)
  ├── requires ../lib/request-exit       (NEW — requestExit, for both non-zero exits)
  └── requires ../lib/regulatory-regime  (existing, lazy inside readActiveRegimes)

tests/evidence-pack-main.test.js      --spawns--> src/scripts/evidence-pack.js (child process)
                                      --requires-> js-yaml (round-trip oracle, already used here)
tests/evidence-pack-collect.test.js   --requires-> src/scripts/evidence-pack.js (parseArgs, collectInputs)
tests/evidence-pack-security.test.js  --requires-> src/scripts/evidence-pack.js (packWithTar)
```

No cycles. No new module. No new package dependency.

---

### File: `src/scripts/evidence-pack.js`

**Action:** MODIFY · **Change type:** five behaviour fixes in place.

#### Fix 1 — root resolution becomes explicit and refuses loudly

Replace `resolveRoot` (lines 31–43, comment block included) and move
`EVIDENCE_DIR` into `main`:

```js
// The project the evidence pack is ABOUT, in strict precedence:
//   1. CTOC_EVIDENCE_ROOT — an explicit project, resolved as given.
//   2. process.cwd() — but ONLY when it holds a .ctoc/ DIRECTORY, i.e. the
//      caller is standing in a CTOC project.
//   3. null — the command refuses. It does NOT fall back to the script's own
//      location: installed from the marketplace that is the plugin cache, so
//      the pack would describe the plugin instead of the user's project and
//      would say so in a compliance artifact.
function resolveRoot() {
  const override = process.env.CTOC_EVIDENCE_ROOT;
  if (override) return path.resolve(override);
  const cwd = process.cwd();
  const dotCtoc = path.join(cwd, '.ctoc');
  if (safeFs.existsSync(dotCtoc) && safeFs.statSync(dotCtoc).isDirectory()) return path.resolve(cwd);
  return null;
}

// ONE encoding of the refusal, shared by the command and the exported collector.
const NO_ROOT_MESSAGE =
  'evidence-pack: refusing to run — cannot tell which project this pack is about. ' +
  'Run it from a project root (a directory containing .ctoc/), ' +
  'or set CTOC_EVIDENCE_ROOT to that project.';

const ROOT = resolveRoot();
```

- Delete the module-level `const EVIDENCE_DIR = path.join(ROOT, ...)` (line 43) —
  it would throw on a null ROOT at require time, which would take the two
  helper test files down with it. Declare it as a local inside `main`, after the
  guard: `const EVIDENCE_DIR = path.join(ROOT, '.ctoc', 'evidence-packs');`
- First statement of `main()`:
  ```js
  if (ROOT === null) {
    console.error(NO_ROOT_MESSAGE);
    requestExit(1);
    return;
  }
  ```
  It precedes `ensureDir`, so **nothing is written** on the refusal path.
- First statement of `collectInputs(since, until)`:
  `if (ROOT === null) throw new Error(NO_ROOT_MESSAGE);` — the function is
  exported and reads a ROOT frozen at require time; without this a caller
  outside a project gets `TypeError: The "path" argument must be of type string.
  Received null` from deep inside `path.join`, which names neither the cause nor
  the remedy.
- Update the file's header comment: the `Environment:` block (lines 13–17) still
  documents "Unset … the pack covers the repository this script lives in", which
  becomes false. Replace with the three-step precedence above.
- `packWithTar`'s `cwd = ROOT` default parameter is unchanged: `main` only calls
  it after the guard, and the security test passes `cwd` explicitly.

#### Fix 2 — the manifest is the first member of the archive

In `main`, inside the `try`, the list file is built from `relInputs`. Prepend the
manifest's ROOT-relative path so it is written first and tar reads it first:

```js
const manifestRel = path.relative(ROOT, manifestPath);
const relInputs = inputs.map(p => path.relative(ROOT, p));
safeFs.writeFileSync(listFile, [manifestRel, ...relInputs].join('\n'));
```

The manifest is already written (line 203) before the `try`, so the file exists
when tar reads the list. The member's NAME stays its ROOT-relative path —
`.ctoc/evidence-packs/<since>_to_<until>.manifest.yaml` — deliberately: renaming
it to a bare `manifest.yaml` needs GNU tar's `--transform`, and macOS ships
bsdtar, which does not have it. A portable archive with a correctly-pathed
manifest beats a prettier member name that fails on half the platforms.

The `if (inputs.length > 0)` guard stays as it is: an empty window produces a
manifest and no archive (existing behaviour, asserted by the empty-window case).

#### Fix 3 — a missing `tar` exits non-zero, keeping the salvage bundle

Replace the catch (lines 213–218) and the two trailing `console.log`s:

```js
let degraded = null;                       // the bundle path, when tar failed
try {
  /* unchanged packing */
} catch (e) {
  const bundlePath = tarPath.replace(/\.tar\.gz$/, '.json');
  const bundle = {};
  for (const p of inputs) bundle[path.relative(ROOT, p)] = safeFs.readFileSync(p, 'utf8');
  safeFs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
  degraded = bundlePath;
  console.error(
    `tar failed (${e.message}); the archive was NOT produced in the promised format. ` +
    `A JSON bundle was written as salvage: ${path.relative(ROOT, bundlePath)}`
  );
  requestExit(1);
}

console.log(`Manifest: ${path.relative(ROOT, manifestPath)}`);
console.log(degraded
  ? `Archive:  NOT PRODUCED — salvage bundle at ${path.relative(ROOT, degraded)}`
  : `Archive:  ${path.relative(ROOT, tarPath)}`);
```

Two properties this must keep: the bundle is still written (salvage is valuable
in an incident), and the final line must not name a `.tar.gz` that does not
exist — today it does, which is the same silent-failure shape one line further
on.

**Exit mechanism:** `requestExit(1)` from `src/lib/request-exit.js`, never
`process.exit`. `main` prints before exiting and its stdout is a pipe under the
test runner; `process.exit` discards pending pipe writes, which is a documented
defect this repository has already paid for. Add
`const { requestExit } = require('../lib/request-exit');` to the imports.

#### Fix 4 — the manifest is valid YAML

`yamlify` (lines 224–237) emits two malformed shapes, both confirmed by reading
the writer and by the existing pin case:

| Shape | Emitted today | Why it is not YAML |
|---|---|---|
| nested map | `window:  since: 2026-09-01\n  until: …` | the map's first key sits on its parent's line, and the next line is indented under a scalar |
| empty list | `active_regulatory_regimes:[]` | no space after the colon |

Two edits, nothing else:

```js
function yamlify(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return ' []';                     // was '[]'
    return '\n' + obj.map(item => `${pad}- ${typeof item === 'object' ? yamlify(item, indent + 1).trimStart() : item}`).join('\n');
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).map(([k, v]) => {
      if (Array.isArray(v)) return `${pad}${k}:${yamlify(v, indent + 1)}`;      // ' []' or '\n  - …'
      if (v && typeof v === 'object') return `${pad}${k}:\n${yamlify(v, indent + 1)}`;  // was `:${…}`
      return `${pad}${k}: ${v === null ? 'null' : JSON.stringify(v).replace(/^"|"$/g, '')}`;
    }).join('\n');
  }
  return String(obj);
}
```

Everything else is left alone on purpose. The `artifacts:` list already renders
correctly (`  - path: X` with continuation keys at four spaces), the `null`
scalar arm already renders the literal `null`, and the unreachable
`return String(obj)` arm stays — deleting a line is its own decision, as the
test file's header records.

Resulting manifest, which is what the round-trip case parses:

```yaml
pack_id: 2026-09-01_2026-09-05
window:
  since: 2026-09-01
  until: 2026-09-05
generated_at: 2026-09-03T…Z
chain_head_at_pack_time: abc123
active_regulatory_regimes: []
artifact_count: 6
artifacts:
  - path: .ctoc/audit/chain.jsonl
    sha256: …
    size_bytes: 42
```

**Round-trip oracle: `js-yaml`.** Chosen over the two hand-rolled readers, and
the choice is load-bearing because a weak oracle would refute nothing:

- `src/lib/budget.js` `parseYaml` never throws — on today's broken manifest it
  returns a garbage object rather than refusing, and on the `- path:` list lines
  it takes `"- path"` as a key. It cannot tell valid YAML from invalid, so it
  cannot be the oracle for a "the manifest is machine-readable" claim.
- `src/lib/v8-dispatcher.js` `parseYaml` is the same shape ("Hand-rolled parser.
  Limited to the shape our writer produces").
- `js-yaml` is a real parser, is required unconditionally by first-party shipped
  code (`src/lib/circuit-breaker.js:62`), resolves in this repository
  (`node_modules/js-yaml/package.json` present, transitively via eslint), and is
  **already required by the case being replaced**
  (`tests/evidence-pack-main.test.js:373`). Using it adds no dependency and no
  new risk; it flips an existing `assert.throws` into an `assert.deepEqual`.

#### Fix 5 — every collector honours the window

Add one helper next to `collectAllInWindow` and use it at the three
unconditional push sites (one fix, three call sites — the bounds stay identical
to the ones `collectAllInWindow` already applies, `>= sinceMs && <= untilMs`):

```js
function pushIfInWindow(file, sinceMs, untilMs, out) {
  if (!safeFs.existsSync(file)) return;
  const stat = safeFs.statSync(file);
  if (stat.mtimeMs >= sinceMs && stat.mtimeMs <= untilMs) out.push(file);
}
```

| Collector | Line today | Becomes |
|---|---|---|
| 2 — audit chain log | `if (safeFs.existsSync(chainPath)) inputs.push(chainPath);` | `pushIfInWindow(chainPath, sinceMs, untilMs, inputs);` |
| 6 — provenance events | `if (safeFs.existsSync(provPath)) inputs.push(provPath);` | `pushIfInWindow(provPath, sinceMs, untilMs, inputs);` |
| 7 — baseline manifest | `if (safeFs.existsSync(mPath)) inputs.push(mPath);` | `pushIfInWindow(mPath, sinceMs, untilMs, inputs);` |

Collector 7 keeps its `readdirSync(baselinesRoot)` loop over versions; only the
per-version manifest push changes. Nothing else in `collectInputs` moves.

#### Error handling and cross-platform notes

- Refusal and degradation both go to stderr and both set the exit code through
  `requestExit`; neither throws, so no stack trace is printed at a user.
- Every path is built with `path.join` / `path.relative`; the tar member list is
  newline-joined ROOT-relative paths exactly as today.
- `tar` remains invoked through `execFileSync` with an argv array — the security
  property the security test guards is untouched by every change above.

---

### Tightened pins (Operating Lesson 14)

The contract change comes from **outside the tests**: the human's order in the
parent plan, approved on 2026-09-03. Each replacement asserts strictly more than
the case it replaces — an exact-set or exact-value assertion in every instance,
never a widened one. No assertion in
`tests/evidence-pack-collect.test.js` or `tests/evidence-pack-security.test.js`
is touched (both stay green; see the Test Plan).

| # | Case (current title) | Old assertion | New, strictly stronger assertion | Justification |
|---|---|---|---|---|
| 1 | `writes a manifest describing the window it was given` | `text.includes('window:  since: <S>\n  until: <U>\n')` — the malformed bytes | `text.includes('window:\n  since: <S>\n  until: <U>\n')` — the correct bytes, plus everything the case already asserts | defect 4 fixed by the human's order; the byte assertion moves from the broken shape to the fixed one, same exactness |
| 6 | `packs an archive whose members are exactly the collected artifacts — and NOT the manifest` | `assert.ok(!members.includes(manifestRel))` | `assert.equal(members[0], manifestRel)` (FIRST member) **and** the remaining members deep-equal the artifact list **and** the manifest extracted from the archive (`tar -xzOf`) byte-equals the on-disk manifest | defect 2 fixed; an absence assertion becomes a presence-plus-position-plus-content assertion, and the member list is still exact |
| 7 | `falls back to a JSON bundle and still exits 0 when tar cannot be found` | `assert.equal(res.status, 0, 'the documented behaviour is a FALLBACK, not a failure')` | `assert.equal(res.status, 1)` **and** stderr matches `/archive was NOT produced in the promised format/` **and** every bundle assertion the case already makes is kept verbatim | defect 3 fixed; a compliance artifact that degraded its format must not report success |
| 9 | `pins which collectors ignore the window: the chain log and the baseline manifest` | exact set `[chain.jsonl, baselines/6.14.36/manifest.yaml]` for a 1970 window | exact set `[]` for the same 1970 window, `artifact_count` `'0'`, and no archive | defect 5 fixed; retitled `the window binds every collector — a 1970 window collects nothing` |
| 10 | `pins a manifest.yaml that no YAML parser will read` | `assert.throws(() => yaml.load(text), /bad indentation/)` and `text.includes('active_regulatory_regimes:[]')` | `yaml.load(text)` succeeds and the parsed object is asserted field by field (window, artifact_count, artifacts, regimes) — see the round-trip case below | defect 4 fixed; a refutation becomes a positive round-trip |
| 11 | `defaults to the repository the script ships in when no root is named` | writes into the REPOSITORY and asserts the pack landed there | replaced by two cases: unset variable with `cwd` = fixture packs the FIXTURE, and unset variable with a non-project `cwd` refuses | defect 1 fixed; the case asserted the wrong-repository behaviour by name. Its `assert.ok(removed.length > 0)` cleanup assertion goes with it because **no case writes into the repository any more** — keeping it would assert a leak that must not happen. `sweepRepoEvidenceDir()` stays and every case keeps asserting it returns `[]`. |

---

### Wiring — the live call sites

Nothing new to wire; every change is inside an already-live command.

- `src/scripts/evidence-pack.js` is executed by a human as
  `node src/scripts/evidence-pack.js`, is a declared execution root in
  `.ctoc/reachability-roots.json` (line 6, verified), and is named as the
  continuous-controls-monitoring evidence command in
  `agents/coordinator/cto-chief.md:886`. That invocation is run from a project
  root, so the new precedence resolves at step 2 and its behaviour there is
  unchanged.
- `pushIfInWindow` is called from `collectInputs` at three sites in the same
  slice; `NO_ROOT_MESSAGE` is read by `main` and `collectInputs` in the same
  slice. No function is added without a caller.
- `.ctoc/reachability-roots.json` already lists the script and its missing
  `reasons` note is **not** written here: that file is not in this slice's
  declared `files:`, so the executor has no write permission for it and must not
  request one. It is a one-line cleanup the parent marked as allowed but not
  required.

## Test Plan (test-driven — every case red before the fix)

Framework `node:test`, the existing style: the command is spawned as a real
child process against a seeded fixture, never simulated.

### Shared fixture and helper changes (`tests/evidence-pack-main.test.js`)

1. `buildFixture()` gains one line —
   `write(['.ctoc', 'ai-provenance.jsonl'], '{"event":"generation","model":"opus"}\n');`
   — and `FIXTURE_ARTIFACTS` gains `path.join('.ctoc', 'ai-provenance.jsonl')`.
   Both are shared constants, so cases 1 and 7 tighten with them (each lists one
   more artifact it must find). This is the first time collector 6's push line
   executes under any test.
2. `run({ … })` gains an optional `cwd` (default: unchanged, so every existing
   call behaves exactly as today) and an optional `expectRoot`-free shape:
   `spawnSync(process.execPath, [SCRIPT, …], { env: childEnv, cwd, encoding: 'utf8' })`.

### Cases, mapped to the parent's acceptance scenarios

| # | Case | Scenario | Red today, on which assertion |
|---|---|---|---|
| A | `packs the working directory when it holds .ctoc and no root is named` — `run({ root: null, cwd: fix })`; manifest exists at `fix/.ctoc/evidence-packs/…`, lists exactly `FIXTURE_ARTIFACTS`, `sweepRepoEvidenceDir()` returns `[]` | "The pack describes the caller's project" | RED — today `ROOT` is the script's repository, so the fixture manifest does not exist (`fs.existsSync` false) and the run leaves files in the repository |
| B | `refuses a working directory that is not a project` — temp dir, no `.ctoc`, no variable: `status === 1`, stderr matches `/CTOC_EVIDENCE_ROOT/` **and** `/\.ctoc\//`, `fs.readdirSync(tmp)` is `[]`. Second act: a temp dir where `.ctoc` is a FILE, not a directory — same refusal | "The pack refuses the wrong directory" | RED — today it exits 0 and packs the plugin/repository instead |
| C | `puts its own manifest first in the archive` (replaces case 6) — `members[0] === manifestRel`, `members.slice(1).sort()` deep-equals the artifact list, and `spawnSync('tar', ['-xzOf', archive, manifestRel])` stdout equals the on-disk manifest bytes | "The archive stands alone" | RED — `members[0]` is an artifact; the manifest is not a member at all |
| D | `exits non-zero and names the degradation when tar cannot be found` (replaces case 7) — `status === 1`, stderr matches `/archive was NOT produced in the promised format/`, no `.tar.gz`, bundle keys deep-equal `FIXTURE_ARTIFACTS`, each value verbatim | "A degraded format is loud" | RED on `status === 1` (today 0) and on the stderr wording |
| E | `the manifest parses, and the parsed window is the window that was asked for` (replaces case 10) — `yaml.load(text)`; `deepEqual(parsed.window, { since: SINCE, until: UNTIL })`; `parsed.artifact_count === parsed.artifacts.length`; `deepEqual(parsed.active_regulatory_regimes, [])`; every `parsed.artifacts[i].sha256` matches the file's real hash | "The manifest is machine-readable" | RED — `yaml.load` throws `bad indentation` on today's bytes |
| F | `the window binds every collector` — fixture, then `fs.utimesSync` on `.ctoc/audit/chain.jsonl`, `.ctoc/ai-provenance.jsonl` and `.ctoc/baselines/6.14.36/manifest.yaml` to 2020-01-01; run the ±2-day window: those three are ABSENT from the manifest, the other four are present | "The window binds every collector" | RED — all three are collected today regardless of mtime (three sites, one of them never before exercised) |
| G | `a 1970 window collects nothing` (replaces case 9) — exact set `[]`, `artifact_count` `'0'`, no archive, no bundle | "The window binds every collector" | RED — today the set is exactly the chain log plus the baseline manifest |
| H | `writes the manifest with a nested, parseable window block` (case 1, tightened) — the corrected byte assertion plus the artifact list it already checks | "The manifest is machine-readable" | RED on the `window:\n  since:` substring |
| I | `collectInputs refuses when no project can be resolved` — a child `node -e` that requires the script from a non-project cwd with the variable unset and calls `collectInputs('1970-01-01','1970-01-02')`; the child exits non-zero and its stderr names `CTOC_EVIDENCE_ROOT` | guards the exported seam | RED — today it returns `[]` from the script's own repository |

Cases 2, 3, 4, 5 and 8 of the existing file are **untouched** and must stay
green: hashes and sizes, the chain head plus its `null` arm, the `approved_by`
filter, the baseline-and-nested walk (its fixture files are written now, so they
remain inside the ±2-day window after fix 5), and the empty-window manifest.

### The two sibling test files

- `tests/evidence-pack-collect.test.js` — **no edit expected, and it must stay
  green.** It requires the script at load and calls `collectInputs` against the
  module-level `ROOT`. Under `npm test` the working directory is the repository
  root, which holds `.ctoc/`, so the new precedence resolves to the same
  absolute path `path.resolve(__dirname, '..', '..')` produced before. Its
  1970-window emptiness assertion is unaffected: this repository has no
  `.ctoc/audit/chain.jsonl`, no `.ctoc/ai-provenance.jsonl` and no
  `.ctoc/baselines/**/manifest.yaml` (verified by glob — no match), so nothing
  the fix newly excludes was ever collected. Its wide-window assertions are
  satisfied by dispatch entries and approved plans, whose mtimes are recent. If a
  case does turn red, that is a finding to report, not an assertion to relax.
- `tests/evidence-pack-security.test.js` — **no edit expected, and it must stay
  green.** It drives `packWithTar` with an explicit `cwd`, so the ROOT default
  parameter is never evaluated, and no change touches `execFileSync` or its argv
  array.

### Coverage

Every line this slice adds has a case that executes it: the refusal arm (B), the
`collectInputs` throw (I), both `pushIfInWindow` arms plus its absent-file arm
(F, G, and the empty-window case), the degraded exit and its message (D), the
corrected `yamlify` arms (E, H, and the empty-regimes list in every case). Step
14 runs the full `npm test` gate — coverage at or above the floor recorded in
`.ctoc/coverage-baseline.json`, 0 skipped, `# fail 0`.

## Security Review

- **Command injection** — unchanged and re-checked: `packWithTar` keeps
  `execFileSync('tar', [...argv])` with no shell. The manifest path prepended to
  the list file is derived from `--since`/`--until` exactly as the artifact paths
  already are, and reaches tar through the same `-T listFile` channel, never
  through argv or a shell string.
- **Path traversal** — `CTOC_EVIDENCE_ROOT` is resolved with `path.resolve` as
  before; the new `process.cwd()` branch resolves the caller's own working
  directory, which is not attacker-supplied in any way it was not already.
- **Writes** — the refusal path writes nothing at all. Every other write stays
  inside `<ROOT>/.ctoc/evidence-packs/`.
- **Error messages** — the refusal and degradation messages name rules and a
  repository-relative bundle path; no absolute path, no environment value, and
  no file contents are printed.
- **Secrets** — the JSON salvage bundle inlines collected artifacts exactly as it
  does today; this slice does not change what is collected.
- **Prototype pollution / injection into YAML** — `js-yaml` is used in the tests
  only, with `load` on a file the test itself just produced;
  `src/lib/circuit-breaker.js`'s note applies (js-yaml 4 default schema has no
  `!!js/*` constructors).

## Decisions Taken Under Ambiguity

1. **`js-yaml` is the round-trip oracle.** The two hand-rolled readers in the
   repository (`src/lib/budget.js`, `src/lib/v8-dispatcher.js`) never throw —
   they would "parse" today's broken manifest into a garbage object and refute
   nothing, which is the false-green shape this repository fences. `js-yaml` is a
   real parser, already required by first-party shipped code and by the very case
   being replaced, and is present in `node_modules`. It is a devDependency-tree
   resolution rather than a declared dependency; that is pre-existing and
   unchanged by this slice, and declaring it is out of scope (`package.json` is
   not in this slice's files).
2. **The manifest keeps its ROOT-relative member name inside the archive.**
   Renaming the member to a bare `manifest.yaml` requires GNU tar's
   `--transform`, which macOS bsdtar does not have. A portable archive whose
   manifest carries its real path is worth more than a prettier member name that
   fails on a platform this project supports.
3. **`ROOT === null` throws from `collectInputs` rather than degrading.** The
   function is exported and reads a ROOT frozen at require time; a null there
   would otherwise surface as a `path.join` TypeError naming neither the cause
   nor the remedy. One shared message constant, so the command and the exported
   seam cannot drift.
4. **`EVIDENCE_DIR` moves inside `main`.** Left at module scope it would throw at
   require time whenever the root cannot be resolved, taking down the two test
   files that only want `parseArgs`, `collectInputs` and `packWithTar`. A
   permission-shaped module must not make requiring it fail.
5. **An empty window still produces a manifest and no archive.** Fix 2 makes the
   manifest the first member *of an archive that is produced*; when there is
   nothing to pack, the `inputs.length > 0` guard still skips tar entirely. The
   existing empty-window case stays green unweakened.
6. **The final `Archive:` line tells the truth when tar failed.** Today it prints
   the path of a `.tar.gz` that does not exist. Naming the salvage bundle instead
   is inside the parent's "the message names the degradation" and is one
   conditional; leaving it would ship a second silent-failure line one below the
   one being fixed.
7. **The `reasons` note for `.ctoc/reachability-roots.json` is NOT written.** The
   parent marks it allowed but not required, and the file is not in this slice's
   declared `files:` — an executor that needs it must go through the scope-growth
   door, not amend the plan.
8. **Three collectors are fixed, not two, and six cases are tightened, not
   three.** Both counts come from reading the current files (see the Drift
   section); the parent's numbers were its recollection of the wave's report,
   which itself missed the provenance collector because no fixture ever seeded
   that file.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80% (floor is 99; measured 99.9)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

### Step 8 — TEST (test-driven RED, recorded before any source edit)

Command: `node --test tests/evidence-pack-main.test.js tests/evidence-pack-collect.test.js tests/evidence-pack-security.test.js`

Nine cases RED in `tests/evidence-pack-main.test.js`, each on the assertion the
plan predicted. The two sibling test files were GREEN before the source edit
(9 of 9 cases passing) and no assertion in either was touched.

| Case | First failing assertion (verbatim message) |
|---|---|
| writes the manifest with a nested, parseable window block | `the window is a nested block map` |
| puts its own manifest first in the archive, and the member is the manifest verbatim | `the manifest is the FIRST member of the archive it describes` |
| exits non-zero and names the degradation when tar cannot be found | `a degraded format must exit non-zero; stderr: tar failed (spawnSync tar ENOENT); writing JSON bundle instead.` |
| the window binds every collector — a 1970 window collects nothing | `deepEqual` — actual was the chain log plus the baseline manifest, expected `[]` |
| the window binds every collector — the three formerly unconditional ones included | `only the artifacts whose mtime falls inside the window are collected` |
| the manifest parses, and the parsed window is the window that was asked for | `an empty list carries a space after the colon` |
| packs the working directory when it holds .ctoc and no root is named | `the pack lands under the working directory` |
| refuses a working directory that is not a project, and writes nothing | `an unresolvable root must refuse` — the command exited 0 and packed 28 artifacts from the script own repository |
| collectInputs refuses when no project can be resolved, naming the cause | `collectInputs must refuse` — the child exited 0 |

The five untouched cases of the main file (hashes and sizes, the chain head and
its `null` arm, the `approved_by` filter, the baseline-and-nested walk, and the
empty-window manifest) stayed GREEN through the red run.

### Steps 9-13 — PREPARE, IMPLEMENT, REVIEW, OPTIMIZE, SECURE

**Step 9 PREPARE.** No dependency installed and none added. `js-yaml` resolves in
this repository at version 4.2.0 (checked by requiring it), and
`src/lib/request-exit.js` exports `requestExit` as the plan describes. No
directory or configuration was created.

**Step 10 IMPLEMENT.** All five fixes landed in `src/scripts/evidence-pack.js`:

1. `resolveRoot()` is now `CTOC_EVIDENCE_ROOT` → a working directory holding a
   `.ctoc/` DIRECTORY → `null`. The `__dirname` fallback is gone.
   `NO_ROOT_MESSAGE` is the one encoding of the refusal, read by `main` and by
   `collectInputs`. `EVIDENCE_DIR` moved inside `main`, after the guard.
2. The manifest's ROOT-relative path is prepended to the tar list file, so it is
   the archive's first member.
3. The tar-absent path writes the salvage bundle, prints a message naming the
   degradation, and calls `requestExit(1)`. The final `Archive:` line names the
   bundle instead of a `.tar.gz` that was never produced.
4. `yamlify` breaks the line before a nested block map and writes ` []` for an
   empty sequence. The array arm is dispatched before the object arm so a list
   value never takes the newline path.
5. `pushIfInWindow(file, sinceMs, untilMs, out)` replaces the three
   unconditional pushes — the audit chain log, the provenance event log, and
   each version's baseline manifest — using the same `>= sinceMs && <= untilMs`
   bounds `collectAllInWindow` already applied.

Nothing outside the four declared files was touched; no scope-growth request was
needed.

**Step 11 REVIEW.** Read back in full. `pushIfInWindow` is a function
declaration, so its three call sites earlier in `collectInputs` resolve by
hoisting. `packWithTar`'s `cwd = ROOT` default is evaluated only on `main`'s call
site, which is past the guard; the security test passes `cwd` explicitly, so a
null ROOT can never reach it. `readActiveRegimes` and `readChainHead` read ROOT
and are called only from `main`, past the guard. The exported surface is
unchanged (`packWithTar`, `parseArgs`, `collectInputs`).

**Step 12 OPTIMIZE.** The change is net-simplifying: three duplicated
exists-then-push sequences collapse into one helper with one bounds expression.
No redundant read was added — `pushIfInWindow` stats a file only after
confirming it exists, exactly as the sibling walker does.

**Step 13 SECURE.** `execFileSync('tar', [...argv])` with no shell is untouched,
and the security regression test passes unmodified. The manifest path reaches tar
through the same `-T listFile` channel as every artifact path, never through argv
and never through a shell string. The refusal path writes nothing at all (the
guard precedes `ensureDir` and the first `console.log`); the test asserts the
directory is still empty afterwards. Messages name rules and a repository-relative
bundle path — no absolute path, no environment value, no file contents. `js-yaml`
is used in the test only, with `load` on a file the test itself just produced;
js-yaml 4's default schema has no `!!js/*` constructors, so no type is
constructed from the document (a plugin hook flagged `yaml.load` on the pattern
of Python's PyYAML `load`, which is a different library with a different default
— noted and checked rather than ignored).

## Verification Evidence

**Step 14 VERIFY — `npm test` from the repository root, captured to a file and
read from the last lines.**

```
[CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
```

- suite totals: `tests 11983`, `pass 11983`, `fail 0`, `skipped 0`, `todo 0`
- exit status of the unpiped run: `0`
- lint: `npx eslint` over the four declared files exits 0 with no output.
- `src/scripts/evidence-pack.js` line coverage rose 98.76% → **99.05%**. The two
  uncovered lines are the SAME two the test file's header already declares and
  justifies, at their new numbers: 205-206 (`readActiveRegimes`' catch arm) and
  311 (`yamlify`'s unreachable scalar arm). No previously covered line was
  orphaned, and the header's stale numbers were corrected to match.
- the three evidence-pack files alone: 23 cases, 23 pass, 0 skipped. The two
  sibling test files needed no edit and stayed green, as the plan predicted.

## Decisions Taken Under Ambiguity

9. **The parsed window is compared as calendar days, not by object identity.**
   The plan wrote the round-trip assertion as
   `deepEqual(parsed.window, { since: SINCE, until: UNTIL })`. Measured rather
   than assumed: js-yaml 4.2.0's DEFAULT schema resolves an unquoted `2026-09-01`
   to a JavaScript `Date` (the YAML 1.1 timestamp type), so that literal
   comparison would fail against a correct manifest. The case therefore loads with
   the default schema — which is the direct inversion of the old
   `assert.throws(…, /bad indentation/)` and the strongest form of "a real parser
   reads it" — and compares `toISOString().slice(0, 10)`, which is exactly what
   `--since`/`--until` name. Quoting the dates in the manifest was the
   alternative and was rejected: it changes the on-disk format of a compliance
   artifact for the convenience of a test.
10. **The dropped `assert.ok(removed.length > 0)` from the old default-root
    case.** That assertion existed because exactly one case deliberately wrote
    into the repository — the one pinning the wrong-repository default. With that
    behaviour fixed, no case writes into the repository any more, so keeping the
    assertion would demand a leak that must not happen. `sweepRepoEvidenceDir()`
    stays, and every case still asserts it returns `[]` — the leak check is
    strengthened, not removed: it went from "one case must leak" to "no case may
    leak."
11. **`main`'s final line asserts on stdout as well.** The plan named the stderr
    wording; the case also asserts `Archive:  NOT PRODUCED` on stdout, because the
    silent-failure shape being fixed was a line naming an archive that does not
    exist, and only a stdout assertion can catch its return.

## Execution Record — continued

**Step 15 DOCUMENT.** The script's `Environment:` header block now states the
three-step precedence (it previously documented the deleted `__dirname`
fallback). JSDoc added to `resolveRoot` (with its `{string|null}` return) and to
`pushIfInWindow`. The nested-map and empty-sequence fixes in `yamlify` carry
one-line comments naming what was wrong. The test file's header no longer says it
PINS five defects — it records what each pin was replaced by and why, which is
the Operating Lesson 14 justification kept next to the assertions themselves.
This repository has no `CHANGELOG.md`, so none was updated.

**Step 16 FINAL-REVIEW.** Steps 8-15 complete with evidence above. Every box in
the Execution Plan is ticked. Four declared files changed and nothing else. No
stub, no TODO, no baseline touched, no coverage floor moved, no assertion
weakened beyond the six justified tightenings and the one justified drop recorded
above. Not committed and not pushed — the session owns git.
