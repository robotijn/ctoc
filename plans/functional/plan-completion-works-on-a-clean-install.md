---
title: "A plan completion and the inbox escalation read work on a clean install, and a check loads the shipped tree with no installed packages"
type: functional
status: functional
created: 2026-09-30
priority: high
effort: medium
depends_on: none
---

# A plan completion and the inbox escalation read work on a clean install, and a check loads the shipped tree with no installed packages

## Problem Statement

CTOC's circuit breaker (`src/lib/circuit-breaker.js`) requires the package `js-yaml` at the top of the file. CTOC declares no runtime dependencies: `package.json` holds development dependencies only, `node_modules` is ignored by git, and a plugin installed from the marketplace has no `node_modules`. In this repository the package is present only by accident. Per the session's `npm ls` output (taken from the brief, not re-run by me), it arrives through the code-style checker's own dependencies, a development-only chain. That accident is why the tests that load the circuit breaker are green here.

On a project with CTOC 6.14.67 installed from the marketplace, a completion that the circuit breaker had to count failed with a missing-module error. The reporting session worked around it by copying the package into the installed plugin directory by hand. The next plugin update removes that copy.

Who has the problem: a person running CTOC in any project that installed it from the marketplace. What it costs: a plan that keeps failing is supposed to be counted, and after the fourth kickback to one step or the sixth in total, the human is told. On a clean install that promise is not kept. The counting call throws instead, and the inbox that should show the escalation shows nothing, without saying it could not look.

This plan fixes that defect, and adds the check that would have caught it: one that loads the product the way it ships, not the way this machine happens to be set up.

## Business Alignment

**Job to Be Done:** When a plan I sent to be built keeps failing its completion checks in a project where CTOC was installed from the marketplace, I want the failure to be counted and the plan escalated to me, so I can step in before an unattended loop retries it forever.

**Impact Map:**
- **Goal:** The pipeline's promises hold in every project CTOC is installed into, not only in the repository that builds CTOC (the circuit breaker promise in `CLAUDE.md`: maximum 3 kickbacks to one step, 5 in total, then the human is told).
- **Actor:** The human CTO running CTOC in a marketplace-installed project; and the maintainer of CTOC who ships it.
- **Impact:** A blocked or failing completion is counted and shown as an escalation instead of throwing an error the human cannot act on; and no future module can reach a release depending on a package that exists only on the maintainer's machine.
- **Deliverable:** A circuit breaker that reads its one legacy field without any package; and a runtime check that loads a copy of exactly what ships, with no installed packages, and drives the two real routes that were broken.

## User Stories

**As a** person running CTOC in a project installed from the marketplace, **I want** a blocked or failing plan completion to be counted by the circuit breaker, **so that** a plan that keeps failing reaches me as an escalation instead of an error I cannot act on.

**As a** person running CTOC in a project installed from the marketplace, **I want** the inbox to list the escalations that were recorded, **so that** a plan the circuit breaker has stopped is visible to me and is never shown as "no escalations".

**As the** maintainer who ships CTOC, **I want** the test gate to load and drive the product from a copy that contains only what ships, **so that** a dependency that exists only on my machine can never pass review again.

Scenario count note: the scenarios below exceed the two-to-five per story guideline because the request asked for the fix and its proof in one plan. The implementation planner splits them into small cohesive slices (the reader with its tests; the shipped-tree check with its wiring; the static-rule measurement).

## What is true on disk today

Everything below was read from the files named, at version 6.14.71 (the repository moved from 6.14.70 while this plan was being written; the files below were re-read after the move). Nothing was run: the agent that wrote this plan holds no way to execute programs. Every statement about behaviour is "by reading", not "observed". The brief's runtime reproduction was done by the coordinating session; I did not repeat it.

**1. The require and its only use.** In `src/lib/circuit-breaker.js`:

```
61  const path = require('path');
62  const yaml = require('js-yaml');
63  const safeFs = require('./safe-fs');
...
161  for (const fmText of frontmatterBlocks(raw)) {
162    let parsed;
163    try {
164      parsed = yaml.load(fmText);
165    } catch {
166      continue; // malformed block contributes nothing
167    }
168    const counts = normalizeCounts(parsed && parsed.kickback_counts);
```

That is the only use of the package in that file. From the brief, taken as given because I hold no text-search tool: it is the only file under `src/` that requires the package. I did find one other direct requirer by reading: a test (fact 5).

**2. The value shapes the circuit breaker reads.** Of the whole parsed frontmatter block, only the key `kickback_counts` is used, and of that only `by_step` (a map from step key to a count) and `total`. `normalizeCounts` then turns each value with `Number(...)`, keeps finite values above zero, floors them, and refuses the keys `__proto__`, `prototype` and `constructor`. Everything else in the block is discarded. The shapes that occur in the repository's own tests and comments:

```
kickback_counts:
  by_step:
    "10": 3        <- double-quoted step key (test fixtures)
    '14': 1        <- single-quoted step key (a comment in src/lib/frontmatter-merge.js)
  total: 5
```

The counter now lives in a sidecar file, `.ctoc/state/kickbacks/<slug>.json`, and no code writes the frontmatter counter any more. The frontmatter read survives only as a migration floor: a plan that still carries a legacy counter must not silently restart from zero. The block is read across every leading frontmatter block of a plan (a human-approval crossing prepends a counter-less block on top) and the largest value per step and the largest total win.

**3. No reader already in the repository can read that field.** By reading:

- `parseMetadata` in `src/lib/state.js` is a flat line reader. It splits every line at its first colon, whatever the indentation. For the block above it yields (by reading, not run):

```
kickback_counts  -> ""
by_step          -> ""
"10"  (the key keeps its quote marks)  -> 3
total            -> 5     (indistinguishable from a top-level total key)
```

  It also merges the leading blocks by "later duplicate wins", where the circuit breaker needs "largest wins". It cannot replace the package for this field.
- `parseFrontmatter` in `src/lib/frontmatter.js` reads only the first block and returns its text and lines. It has no requires. It finds nothing the circuit breaker's own block splitter (`frontmatterBlocks`) does not already find.
- `src/lib/frontmatter-merge.js` exports two functions only, `upsertMarkerFields` and `mergeStackedFrontmatter`. Its helper that groups a top-level key with its indented lines is private, and the merge it exports keeps the first occurrence of a key, which for this field would keep the topmost block's counter instead of the largest.

So the answer to "can the in-repository reader replace the package here" is no, for this field. What can be reused is the circuit breaker's own block splitter (unchanged) and its own normalization (unchanged). Only the step that turns one block's text into the `kickback_counts` value needs replacing.

**4. Where the missing package bites.** In `src/lib/actions.js`:

```
1492 function recordStepKickback(planPath, step, root) {
1493   const cb = require('./circuit-breaker');
1494   const slug = path.basename(planPath, '.md');
1495   try {
```

The require sits outside the `try`. A failed load therefore throws out of `recordStepKickback`. It has two callers in `completeExecution`: a blocked pre-review validation (line 1029) and a failing verification run after the plan has moved to review (line 1149). A completion that passes validation and whose verification passes never calls it. By reading, then, the module is loaded only on a kickback completion. The report said "every plan completion failed"; that is consistent with completions that were kickbacks, and I did not see the reporting project's output.

In `src/lib/inbox.js`:

```
278 function listEscalations(root) {
279   try {
280     const { getEscalations } = require('./circuit-breaker');
281     const all = getEscalations(root);
282     return Array.isArray(all) ? all.filter((e) => e && !e.acknowledged) : [];
283   } catch {
284     return [];
285   }
286 }
```

Here the failure is not loud. The catch turns a failed load into an empty list, which is byte-identical to "no escalations". On a clean install the inbox therefore does not fail; it reports zero, which is the false-green shape this repository fences. The function `getEscalations` handles a missing or corrupt log itself and returns an empty list, so this catch guards nothing except a failed load.

**5. Both are invisible in the development tree, and one test relies on the accident directly.** Per the brief the package is installed here, so both routes work here. The test `tests/ctoc-audit-w05-circuit-breaker.test.js` (line 29) requires the package directly, for a helper (lines 53–58) that reads the first frontmatter block and checks title, type, and the absence of a counter. That test is the one other place the accident is relied on.

**6. The lint rules that exist for this were switched off.** `eslint.config.js`, lines 111–116:

```
// --- Node correctness: keep as errors, but allow patterns this repo relies on ---
// Plugin loads peer deps and Node built-ins dynamically; dependency graph is
// intentionally loose (no package.json deps section). These would be all noise.
'n/no-missing-require': 'off',
'n/no-unpublished-require': 'off',
'n/no-extraneous-require': 'off',
```

The reason given is an assertion ("would be all noise"). I found no recorded count of what the rules report. The same file sets `security/detect-non-literal-require` to error (line 135), so requires in `src` are meant to be string literals, which a static rule can read wherever they sit, including inside function bodies. By my belief (not verified) the extraneous-require rule is the one that would have flagged the package, because the package is listed nowhere in `package.json`; the unpublished-require rule is about development-only packages required from shipped files.

**7. What `package.json` says.** `private: true`, `engines.node >= 18`, six development dependencies, no `dependencies` key, no `files` field. A lockfile exists (`package-lock.json`); I did not read it.

**8. Whether a marketplace install runs a package install is not settled by the brief, and the evidence I found points both ways.** Search-result summaries of the Claude Code documentation, read today (the pages themselves were not opened), say:

```
"When Claude Code copies a plugin into the cache, it also installs the plugin's
 Node.js package dependencies there, so the plugin's hooks and MCP servers can load them."
"For a marketplace-installed plugin, Claude Code installs eligible Node.js package
 dependencies automatically when it caches the plugin."
"A plugin with a package.json and no lockfile is skipped without a log entry."
```

Two things follow and one does not. First, an install step exists for at least some plugins, so the session's working assumption that it never runs is not safe to state as fact. Second, "eligible" is not defined in what I read, the skip is silent, and the observed installed copy of this plugin held no `node_modules`. So either CTOC is ineligible as it is packaged today, or the step did not run for that user's version of the Claude Code command-line tool; I cannot tell which. What does not follow: that declaring the package in `package.json` would fix the defect. Sources: https://code.claude.com/docs/en/plugins-reference and https://code.claude.com/docs/en/discover-plugins.

**9. What ships.** I believe (not verified) that a marketplace install is a clone of the committed files, so ignored files (`node_modules`, `.ctoc/state`, `.ctoc/logs`) are absent. `CLAUDE.md` describes the marketplace and cache directories that way. A file-name listing of `src` found 190 JavaScript files there. By directory listing: 17 hook files, 3 command files, 10 script files, 4 tab files and 5 area files; the rest are under `src/lib`. `.claude-plugin/hooks.json` registers 15 of the 17 hook files, each run as `node "${CLAUDE_PLUGIN_ROOT}/src/hooks/<name>.js"` (the two not registered are `post-commit.js`, run by git, and `validate-plan-steps.js`, a standalone script). `.ctoc/settings.json` declares no entry point (it has `general.environment: dev` and no `entry_point` key).

**10. Where sibling fences live.** `src/lib/iron-loop-enforcer.js` holds a `CHECKS` registry (lines 686–715). Each of the fences from the same defect family that I read (false-green, golden-corpus, unexecutable-instruction, recipe-execution) has a library module in `src/lib`, a test in `tests`, a check function in the enforcer marked thorough mode, and a ledger file under `.ctoc` with two separate structures: debt that may only shrink, and permanent exemptions that each need a written reason and ship empty. The enforcer's comments state that the library module is reached from the enforcer, because a test is not a caller under the reachability fence.

**11. The real plan frontmatter in the golden corpus carries no counter.** The two captured samples under `tests/fixtures/golden-corpus/plan-frontmatter/` (a review-stage plan and an implementation-stage plan with a multi-entry `files:` list and a long quoted title containing a colon) have no `kickback_counts` and no nested map; the manifest records `maxDepth: 0` for the contract. The manifest already records one uncaptured variant for this contract (stacked leading blocks) and states that an uncaptured shape is recorded, never invented. So real bytes prove the replaced reader does not misread ordinary frontmatter as a counter; they cannot prove it reads a real nested counter. Whether any real plan under `plans/` still carries a legacy counter block is not known to me.

**12. The existing circuit-breaker tests.** Five files: `ctoc-audit-w05-circuit-breaker`, `circuit-breaker-block-prepend`, `circuit-breaker-malformed-frontmatter`, `circuit-breaker-wiring` and `circuit-breaker-coverage`, all under `tests`. I read all five and ran none. By reading they pin, with synthetic bytes: the fold across prepended blocks, the migration seed, malformed frontmatter (an unterminated quote), a bare-scalar frontmatter, an unreadable sidecar, and the live completion route (`completeExecution` on a plan with a missing step). By reading, each imports the circuit breaker directly or through `actions.js`, so each would fail at load in a tree without the package; none has been run in such a tree, so that is a reading, not an observation.

## Approach

### The fix

Replace the single call that turns a block's text into a value with a small reader written for exactly the field the circuit breaker uses, inside `src/lib/circuit-breaker.js`. Keep the block splitter, the fold across blocks, the normalization and every threshold unchanged. Remove the package require and the header note about it.

Behaviour of the reader, as functional rules:

- It looks only at a top-level key (first character of the line) named `kickback_counts`, and only in the leading frontmatter blocks. The words in a plan body, or inside a quoted title, are never read.
- It reads the indented lines under that key: a `by_step` map whose entries are a step key (plain, single-quoted or double-quoted) and a value, and a `total`.
- It works on a plan with Windows line endings exactly as on its Unix twin.
- It never throws. Anything it cannot read contributes zero for that entry, as the package-based version does for a block it cannot parse.

**Differences from the package that the plan resolves explicitly.** The package parses the whole block; the reader looks at one field. So they can disagree, and the following table records each case, the direction, and the decision. Entries marked "believed" are my expectations about the package's behaviour; the build replaces each with an observed result by running both readers on a planted sample in the development tree, where the package is installed.

```
Case                                              Package (believed)   New reader        Direction
-------------------------------------------------------------------------------------------------
invalid YAML elsewhere in the block, valid counter  block dropped: zero  counter read      toward escalating
duplicate key inside the counter                    parse error: zero    larger value      toward escalating
count written as a quoted number or a float         Number, then floor   same              equal
count written as a boolean                          true counts as 1     zero              toward less
flow-style map: by_step: { "10": 3 }                read                 zero              toward less
anchors, aliases, multi-line scalars                read                 zero              toward less
```

Decision rule stated in advance: wherever the two readers disagree, the new reader must read at least as much as the package for any shape a writer of this repository could ever have produced. The last three rows are shapes no writer produced (the removed writer used the package's default block style, believed, not verified). If the differential measurement (scenario 6) finds a real plan file where the new reader reads less than the package, that is a stop-and-report item for the build, not something to explain away.

### The check

The defect was invisible because the development tree contains the package. A text search for `require(` answers "is this string present". The question that matters is "does the product that ships load and run". So the load-bearing check is a runtime one:

1. **Copy exactly what ships.** List the files version control knows (tracked, plus untracked files that are not ignored, so a module the current build has just created and not yet committed is included) and copy them into a fresh temporary directory. The listing command runs with an argument list, never a shell. Files the listing names that no longer exist on disk (deleted in the working tree) are counted as deleted, not copied; any other copy error is a failure. Tests and fixtures are copied too, so the covering tests can run there. No `node_modules` is copied or created.
2. **Prove the environment is clean, do not assume it.** Node also resolves packages from parent directories, from `NODE_PATH`, and from global folders, none of which can be switched off. So the check scrubs `NODE_PATH` and `NODE_OPTIONS`, points the child's home directory into the temporary directory, and before anything else asks the child to resolve the package `js-yaml` and every name in `devDependencies`. If any resolves, the check fails and names what resolved and from where. A check that cannot establish its own cleanliness must not report a pass.
3. **Load every module under `src` in its own process.** One process per module, so a failure is attributed to the module and one module's side effects cannot hide another. Library modules are required. Entry programs are handled by reading each first: a hook is run exactly as `hooks.json` runs it, with a minimal valid event on standard input, and judged by the audit in step 4, never by its exit status (hooks deny with a non-zero status by design and fail open on internal error). A script or command that is neither inert to require nor safe to run is listed by name in the check's output on every run, as "not reached at runtime", and is left to the static rule.
4. **Record swallowed failures too.** A preload script, loaded into every child (and, through `NODE_OPTIONS`, into any Node process the child starts), wraps the module resolver and appends to a results file, synchronously, every resolution that fails where the request is a package name or a relative path and the requesting file is under `src`. The results file, not standard output, carries the verdict, so nothing is lost to truncation or to a hook that exits early. This catches the inbox shape: a failure that the code itself catches and turns into an empty list.
5. **Reach the lazy requires by driving the real routes in that copy.** Inside the clean copy, run the tests that drive the two routes that broke: the five circuit-breaker test files (the wiring test drives the real completion route on a plan whose validation fails, which is the kickback path) and one new test that seeds an escalation log and asks the inbox for its escalations. These run with the preload, so an in-function require that the routes reach is either resolved or recorded.
6. **Static guard for what the runtime cannot reach.** Measure the three lint rules, scoped to `src`, and turn on each that can be on without a pile of suppressions (see the lint scenarios).

**Exemptions.** A legitimately optional require (a package the code tries and does without) would show up in step 4 as a finding. The mechanism is a permanent exemption list, one entry per request with a written justification that the fallback is real and tested; it ships empty, matching the sibling fences. There is no debt list: the tree has to load fully today, and any other finding the first run turns up is fixed in the same unit of work or exempted with its reason, in the plan's record.

**What the check still cannot reach, said plainly:**

1. A require inside a function that no driven route and no covering test executes. The runtime check cannot enumerate these; only the static rule reads every require call, and only if the rule can be turned on.
2. A require whose specifier is computed. The security rule forbids these in `src` (error level), by reading the configuration; I did not search for exceptions.
3. A dynamic `import()` of a package. The resolver wrapper covers the CommonJS resolver only. I did not search for any.
4. Non-Node child processes, and anything the installer does beyond copying files. If the marketplace does run a package install for an eligible plugin, real installs are less strict than this check; the check deliberately models the stricter case.
5. Behaviour that differs by operating system: the check runs on the machine it runs on.
6. The failing-verification call site (line 1149 of `actions.js`). It calls the same function as the driven blocked-completion path, but reaching it end to end runs the project's whole quality gate, which needs development tools. It is covered by calling the function directly, not by driving the route.
7. The resolver function the wrapper hooks is an internal one, not a documented interface. A Node upgrade could stop it from firing. A self-test with a planted failing require proves the wrapper fires, and the check's report records the Node major version it ran on, so a change fails by name instead of turning blind.

### Real data

The replaced reader is driven with the two captured plan frontmatter samples from the golden corpus, byte for byte, in the corpus exercise the golden-corpus fence already runs. For the nested counter shape, which no captured sample has, the plan searches every plan file for a real legacy block (an exact-presence search for the literal key is a legitimate use of a text search). If one exists, it is captured byte for byte into the corpus and the manifest. If none exists, the manifest records "a legacy counter block" as an uncaptured variant with the reason, and the positive-case tests use bytes shaped like the documented writer output and are labelled synthetic in their comments.

### Sequencing fact for the human (stated, not decided)

This fix reaches another project only after three things happen: the change is pushed, the plugin is updated from the marketplace, and the session is restarted. Until then, the copy of the package that was placed by hand in the installed plugin directory on this machine is what keeps completions working there. A plugin update run before the fix has shipped removes that copy and brings the failure back. When to push and update is yours; nothing in this plan does either.

## Acceptance Criteria

Each scenario is a runnable test or a recorded output. Scenarios marked "seen failing first" must be run and their failure recorded before the source is changed, because they are the only ones that can be red before the fix: the reader scenarios are expected to pass in the development tree both before and after the change, since the package is installed there by accident, and they prove parity, not that the defect is fixed. The build must say so in its own record and account for every test that is green before its implementation exists.

### The fix: counting works without the package

- [ ] **Scenario 1: A blocked completion is counted in a clean copy** (seen failing first)
  Given a copy of the shipped tree with no installed packages and a plan that is missing a required step
  When the real completion route runs on it
  Then the result is blocked, the kickback is recorded as `recorded: true` with `byStep: 1` and `total: 1`, and the sidecar file exists in the copy's `.ctoc/state/kickbacks`
  Proof: the existing wiring test, run inside the clean copy. By reading it must fail today with a missing-module error thrown out of `recordStepKickback`; that failure is observed and recorded before the source changes.

- [ ] **Scenario 2: The fourth kickback to one step escalates in a clean copy**
  Given the same clean copy and four blocked completions on the same step
  When the fourth runs
  Then an escalation of type `same-step` with count 4 is appended to `.ctoc/logs/escalations.json` in the copy
  Proof: the same wiring test.

- [ ] **Scenario 3: The reader takes the largest counter across stacked blocks, in every quote style**
  Given a plan whose counter is in a deeper block behind a prepended approval block, with step keys double-quoted, single-quoted and plain
  When the counts are read
  Then the per-step values and the total are the largest found in any block, identical to the fold today
  Proof: the existing block-prepend and migration tests, expected to stay green unmodified, plus one added row per quote style. Synthetic bytes, labelled as such.

- [ ] **Scenario 4: Unreadable or hostile shapes never throw and never lower a floor**
  Given counter blocks that are malformed, a bare scalar, a `__proto__` step key, a negative count, a non-numeric count, a plan with Windows line endings, and a plan whose body or quoted title merely mentions the key
  When the counts are read
  Then nothing throws, the prototype of plain objects is untouched, a mention outside a top-level key in a leading block is never read as a counter, and the Windows plan reads the same counts as its Unix twin
  Proof: table-driven tests. The existing malformed-frontmatter and coverage tests are expected to stay green unmodified.

- [ ] **Scenario 5: Where the reader disagrees with the package, the disagreement is the recorded, chosen one**
  Given the table of cases in the approach section
  When each case is run through both readers in the development tree
  Then every row of the table is replaced by its observed result, and every row where the new reader reads less than the package for a shape a writer could have produced is reported by name and stops the build
  Proof: a recorded measurement (kept in the plan's record), and permanent tests pinning the chosen behaviour for each row.

- [ ] **Scenario 6: Every real plan file reads the same under both readers**
  Given every plan file under `plans/` in every stage and every test fixture that contains frontmatter
  When both the package-based reading and the new reader run on each
  Then the record states the number of files read, the number carrying a legacy counter, and the number of disagreements, and each disagreement is listed by file name
  Proof: a recorded measurement run once in the development tree with a throwaway script kept out of the repository. The counts are outputs, not targets; a nonzero count of disagreements where the new reader reads less blocks completion of the build.

### The inbox: the escalation read works and cannot silently read as none

- [ ] **Scenario 7: The inbox returns a seeded escalation in a clean copy** (seen failing first)
  Given a clean copy and an escalation log holding one unacknowledged and one acknowledged entry
  When the inbox's escalation read runs
  Then exactly the unacknowledged entry is returned, and the count the inbox reports is 1
  Proof: one new test, run in the clean copy. By reading it returns an empty list today without any error; asserting the seeded entry, not "does not throw", is what makes the failure visible.

- [ ] **Scenario 8: The wrapper sees a failure the code swallows**
  Given a clean copy of the tree as it is today, before the fix
  When the inbox read runs under the preload
  Then the results file lists the failed request for `js-yaml` from `src/lib/circuit-breaker.js`, even though the inbox's own catch discarded the error
  Proof: recorded output of the run against the unchanged tree (seen failing first); after the fix the same run lists no failed request from `src`.

### Real data through the replaced parse

- [ ] **Scenario 9: The two captured plans read as zero counts and no field is taken for a count**
  Given the two real plan frontmatter samples in `tests/fixtures/golden-corpus/plan-frontmatter/`, byte for byte
  When the replaced reader reads their counts
  Then both give zero for every step and zero total, nothing throws, and the multi-entry file list, the depends-on value and the long quoted title (which contains a colon) are not taken as counter entries; and the result equals the package-based reading of the same bytes
  Proof: driven inside the golden-corpus exercise so the fence's linkage sees it; the equality is part of the recorded measurement in scenario 6.

- [ ] **Scenario 10: The nested counter shape is covered by real bytes or recorded as uncaptured**
  Given the search of every plan file for a legacy counter block
  When it finds one or more
  Then one is captured byte for byte into the corpus and driven through the reader; and when it finds none, the manifest gains an uncaptured-variant entry stating that no real instance exists, and the positive-case tests say in a comment that their bytes are synthetic
  Proof: the manifest diff and the corpus fence staying green.

### The shipped tree loads, and the check is not a placebo

- [ ] **Scenario 11: Every module under `src` loads in the clean copy** (seen failing first)
  Given a fresh temporary copy of the tracked and not-ignored files, with no `node_modules`
  When each `.js` file under `src` is loaded in its own process
  Then the check reports every module by name, the number attempted equals the number enumerated, and it passes only if all loaded and the results file records no failed request from `src`
  Proof: recorded output against the tree as it is today, which must fail naming `src/lib/circuit-breaker.js` and the package; then green after the fix.

- [ ] **Scenario 12: A planted missing package fails by name, at load and lazily**
  Given a small fixture tree with one module that requires a missing package at its top, one that requires it inside a function that a driven route calls, and one clean module
  When the check runs on the fixture
  Then the first two are named as failures and the third is not
  Proof: a test that plants the defects in a temporary fixture tree.

- [ ] **Scenario 13: A lazy require nothing reaches is caught by the static rule and not by the runtime check**
  Given a fixture module with a missing-package require inside a function that no driven route calls
  When the runtime check runs
  Then it reports no failure for it, and the check's output states that lazy requires no route reaches are covered only by the static rule; and when the static rule is on, linting the same fixture with the repository configuration reports it
  Proof: a test asserting both halves, so the limit is documented by an executable, not only by prose.

- [ ] **Scenario 14: The check fails, not passes, when it cannot look**
  Given each of these cases: a root that is not a version-control working tree; a listing that returns no files; a `src` directory with no `.js` files; a copy step that cannot write; a child that crashes; a child that times out; a results file that is missing or cannot be parsed
  When the check runs
  Then each case is a failure with a distinct named reason, and none is a pass or a skip
  Proof: one test per case.

- [ ] **Scenario 15: A leaking environment is detected**
  Given a temporary parent directory that holds a fake `node_modules` with a package named `js-yaml`, and the copy placed beneath it
  When the check runs
  Then it fails and names the package and the path it resolved from
  Proof: a test with a controlled parent directory. This is the proof the cleanliness check is not decorative.

- [ ] **Scenario 16: The wrapper fires on a planted failing require, and the report names the Node version**
  Given a planted module that requires a missing package inside a try and swallows the error
  When it is loaded under the preload
  Then the results file records the failed request, and the check's report states the Node major version it ran on
  Proof: a test; if a future Node stops the wrapper from firing, this test fails by name.

- [ ] **Scenario 17: An exemption without a written reason is refused**
  Given an exemption entry with an empty justification
  When the check reads the exemption list
  Then it fails, and an entry with a justification suppresses only its own request
  Proof: a test; the shipped list is empty.

### Wiring, cost and the static guard

- [ ] **Scenario 18: A human can reach the check, and the test gate runs it**
  Given the enforcer's registry and the test glob that `npm test` uses
  When the self-check runs in thorough mode and when `npm test` runs
  Then the enforcer runs a new check that is clean on the fixed tree, block-severity and naming the module on the planted-defect tree, and block-severity when the check cannot look; and the new test file is executed by `npm test`, with the coverage floor unchanged and no skipped test
  Proof: an enforcer test that drives the check on both trees, and the full `npm test` gate. The reachability fence stays at its recorded baseline: the library module is reached from the enforcer, not only from its test.

- [ ] **Scenario 19: The cost is measured and reported, never silently reduced**
  Given the check on this repository
  When it runs
  Then the record states its duration, the number of modules it loaded, the number of entry programs it ran, the number listed as "not reached at runtime" by name, and the Node major version
  Proof: a recorded measurement in the build's record. If the duration makes the gate materially slower, it is surfaced as a decision, not solved by lowering what is loaded.

- [ ] **Scenario 20: Each of the three lint rules is measured, and only clean ones are turned on**
  Given the three rules run against `src` with the fix in place, and against the tree as it is today
  When the counts are recorded
  Then the record lists, per rule, the count and each distinct finding kind, and confirms which rule reports the original defect on today's tree (seen failing first); a rule that reports zero after the fix is switched on for `src` at error level with no suppression, a rule that reports anything else is fixed at its findings or stays off, and the stale comment in `eslint.config.js` is replaced by the measured reason
  Proof: recorded output; and, for each rule switched on, a test that lints a planted file with the repository configuration and expects the report.

- [ ] **Scenario 21: The test suite no longer depends on the accident**
  Given `tests/ctoc-audit-w05-circuit-breaker.test.js`
  When its direct require of the package is replaced by the in-repository reader for the title and type it checks (the byte-identity assertions beside it already prove no counter is written)
  Then the test still asserts at least what it asserted, and no file under `src` or `tests` requires the package
  Proof: the test, plus an exact-presence search for the package name across `src` and `tests` (a legitimate use of a text search: is the literal gone). The change to the test carries the written justification Operating Lesson 14 requires: the contract from outside the test is that the package is not a declared dependency; why the test and not the code: the code no longer uses it; what newly fails: nothing.

## Definition of Done

- Scenarios 1 to 21 pass as committed tests, or exist as recorded output in the build's record where the scenario says so.
- Scenarios 1, 7, 8, 11 and 20 were run and seen failing against the unchanged tree first, and that failure is recorded, not described.
- `npm test` passes the whole gate: the coverage floor in `.ctoc/coverage-baseline.json` unchanged (`CLAUDE.md` states 99 today), no skipped test, no flaky test; the lint and typecheck commands pass with no new suppression.
- The clean-copy check is reachable from the enforcer in thorough mode and from the test gate in the same unit of work that creates it.
- `package.json` has no new dependency, and no file under `src` or `tests` requires `js-yaml`.
- The differential measurement (scenario 6) reports zero files where the new reader reads less than the package.
- A human can read the result: the check's output names each module that failed to load and why, and names each entry program it did not reach.
- The build's record states that the change reaches other projects only after the push, the plugin update and the session restart.

## Scope

### In Scope

- A reader for the legacy counter inside `src/lib/circuit-breaker.js`, replacing the package, with its decided differences (scenarios 3 to 6).
- Removing the package require and the header note about it.
- The clean-copy runtime check: copy, cleanliness canary, per-module load, resolver preload, covering tests of the two broken routes, one new inbox test, exemption list, report (scenarios 7 to 17, 19).
- Wiring the check into the test gate and into the enforcer's thorough mode (scenario 18).
- Measuring the three lint rules and switching on those that are clean for `src` (scenario 20).
- Real plan frontmatter through the replaced reader, and the corpus manifest entry (scenarios 9, 10).
- Replacing the one direct require in a test (scenario 21).
- Documented counts in `CLAUDE.md` (and any other file that carries the counts) for the new test file and library module.

### Out of Scope

- Declaring `js-yaml` under `dependencies` in `package.json`. Not chosen; reasons under decision 1. Whether to do it in addition is the human's call and is not assumed.
- Vendoring the package into the repository.
- Changing the circuit breaker's thresholds, its sidecar, or its escalation log.
- Making the inbox distinguish "could not read escalations" from "none". That changes what a screen shows on the menu's hot path; it is open question 2.
- Running the whole existing test suite inside the clean copy. Open question 1.
- The hand-copied package in the installed plugin directory on this machine, and any other machine state outside the repository.
- Any hook, the approval ledger, the human gates, or `src/scripts/test-gate.js`. Nothing here changes gate logic or hook behaviour; the new enforcer check is an added self-check, not an approval predicate.

## Risks

### Technical Risks

- The new reader disagrees with the package on a real legacy block.
  - Likelihood: LOW. Impact: HIGH (a false zero would suppress an escalation).
  - Mitigation: Run both readers over every real plan file and every fixture (scenario 6) and stop the build on any file where the new reader reads less.
- The resolver wrapper stops firing on a future Node version and the check goes blind without failing.
  - Likelihood: MEDIUM. Impact: HIGH.
  - Mitigation: Plant a failing require in a self-test (scenario 16) and record the Node major version in every report.
- The development machine leaks a package through a parent directory or a global folder, so the check fails on that machine for a reason that is not the code.
  - Likelihood: MEDIUM. Impact: LOW (loud, named, fixable).
  - Mitigation: Print the package name and the resolved path in the failure (scenario 15).
- One process per module makes the check slow enough to hurt the test gate.
  - Likelihood: UNKNOWN (not measured). Impact: MEDIUM.
  - Mitigation: Measure and record the duration (scenario 19), bound concurrency, and surface any cost problem as a decision instead of loading less.
- Requiring or running an entry program has a side effect, or reaches the network.
  - Likelihood: MEDIUM. Impact: MEDIUM.
  - Mitigation: Read each entry program first, run it with a temporary home directory, a scrubbed environment and closed standard input, and list any program that is neither inert nor safe as "not reached at runtime". `CLAUDE.md` records `src/scripts/verify-claims.js` as the only network path; it is never run unless it is inert to require.
- The first run finds a legitimate optional require somewhere in `src`.
  - Likelihood: LOW (the two plan-index files I read, the in-process embedder and the embedder façade, import only repository modules). Impact: LOW.
  - Mitigation: Fix it or record an exemption with a written reason, in the same unit of work.

### Business Risks

- The fix does not reach anyone until push, plugin update and session restart, and an update before it ships removes the hand-copied package that currently works on this machine.
  - Likelihood: HIGH (it is how the plugin works). Impact: MEDIUM.
  - Mitigation: State the order to the human in the build's record and in the report, and change nothing on the machine.
- The inbox keeps showing "no escalations" for any future unloadable module, because its catch is untouched.
  - Likelihood: LOW after this fix. Impact: MEDIUM.
  - Mitigation: Assert a seeded escalation, not "no error" (scenario 7), and put the choice to the human (open question 2).

### Dependency Risks

- Enumerating files needs version control on the machine that runs the check.
  - Likelihood: LOW. Impact: LOW.
  - Mitigation: Fail with a named reason when the root is not a working tree (scenario 14).
- The new test file and library module move documented counts. The implementation-to-queue validator refuses a plan that creates such a file without declaring `CLAUDE.md` (read in `validateForQueue`). I believe, from another plan I read, that a test also checks documented numbers in `README.md`.
  - Likelihood: HIGH. Impact: LOW.
  - Mitigation: Declare `CLAUDE.md` and `README.md` in the implementation plans that create those files.
- The enforcer, `eslint.config.js` and `CLAUDE.md` may be declared by other plans in flight. The scheduler serialises plans that declare the same file.
  - Likelihood: MEDIUM. Impact: LOW.
  - Mitigation: Let the scheduler order them; do not declare files this plan does not edit.

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: 2 -- independent, runs in parallel with other work.
- Business Impact: 3 -- a promised safety mechanism does not work in any marketplace-installed project, and the failure is quiet on the inbox side.
- Technical Risk: 2 -- a small parser and a process-management harness; the harness is the moderately complex part.

## Technical dependencies (stated as facts, not as a schedule)

- The clean-copy check has to exist and be run against the unchanged tree before the source changes, because the red recordings in the Definition of Done are taken from it.
- The reader must exist, with its scenario 3 to 6 tests, before the package require is removed.
- The library module for the check must exist before the enforcer registry entry that calls it, and both in the same unit of work as the test, or the reachability fence flags the module.
- The differential measurement needs the package, which is only present in the development tree; it must run there, before the package is removed from the one test that requires it.
- Any plan that creates a counted artifact must declare `CLAUDE.md` (see the dependency risk above).
- Effects on other projects need the published plugin (see the sequencing fact).

## Candidate files (grounded by reading; not a declaration, the implementation planner fixes the list)

```
src/lib/circuit-breaker.js                   replace the parse call with the reader; drop the require and the header note
tests/ctoc-audit-w05-circuit-breaker.test.js remove the direct require (import at line 29, helper at lines 53-58)
tests/circuit-breaker-*.test.js              the other four: expected unmodified
(new) a library in src/lib                   copy, cleanliness canary, per-module load, preload, report; name chosen by the planner
(new) a resolver preload script              written into the temporary directory outside the copy
(new) a test for that library                scenarios 11-17, 19, plus the planted-defect fixtures
(new) a test for the inbox read              scenario 7
src/lib/iron-loop-enforcer.js                one thorough-mode entry in CHECKS (registry at lines 686-715)
eslint.config.js                             rules at lines 111-116, set per the measurement in scenario 20
tests/fixtures/golden-corpus/manifest.yaml   the legacy counter variant, captured or recorded as uncaptured
tests/fixtures/golden-corpus/plan-frontmatter/ a real capture only if one is found
an exemptions file under .ctoc               ships empty, one written reason per entry (sibling pattern)
CLAUDE.md, README.md                         documented counts for the new test files and library module
NOT changed: package.json dependencies, src/scripts/test-gate.js, the coverage baseline, any hook, the approval ledger
```

## What was not verified

- Nothing was executed. I hold no way to run a program. Every behavioural statement, including which lines throw and what the flat reader returns, is from reading. I ran none of the existing tests, so nothing here says they pass. The coordinating session's runtime reproduction is theirs; I did not repeat it.
- That `src/lib/circuit-breaker.js` is the only file under `src` that requires the package. Taken from the brief. I have no text-search tool and did not read all 190 files under `src`. The runtime check in scenario 11 is the real answer; the build also records an exact-presence search result.
- That no test besides `tests/ctoc-audit-w05-circuit-breaker.test.js` requires the package. I read only the five circuit-breaker test files.
- Whether the marketplace install runs a package install for this plugin, and what "eligible" means. The evidence is search-result summaries of the documentation, not the pages themselves. Nothing observed on the reporting machine tells which case applies, and I do not know that machine's Claude Code version.
- That a marketplace install copies only committed files.
- What the package does with each unusual shape in the differences table. The entries marked "believed" are expectations, replaced by observation in scenario 5.
- Whether any real plan under `plans/` still carries a legacy counter block, and whether the removed writer ever emitted flow style.
- What the three lint rules report today, and which of them flags the original defect. My statement about the extraneous-require rule is a belief. I did not read the plugin's documentation for its dependency-field handling.
- Whether requiring each hook, command and script is inert, whether the declared-entry-point command line runs cleanly in a sandbox, and the duration of any part of the check.
- That the internal resolver function exists and fires on the installed Node version. I did not check the installed Node version.
- The contents of `package-lock.json`, `.ctoc/coverage-baseline.json` itself (the floor of 99 is what `CLAUDE.md` states), and the function that validates the move from functional to implementation.
- That the reporting project's failing completions were kickbacks. By reading, only kickbacks load the module; I did not see the project's output.
- The brief's `npm ls` result and the claim that the installed plugin held no `node_modules` before the workaround: both taken from the brief.

## Decisions Taken Under Ambiguity

1. **Fix: a reader written for the one field, inside the circuit breaker.** Grounded in fact 3: no reader in the repository reads a nested map. Not chosen, with cost:
   - *Declare the package under `dependencies`.* It is correct only if an install step runs for this plugin. Evidence says one exists for some marketplace plugins, "eligible" is undefined in what I read, the skip is silent, and the observed install had no packages. Its success cannot be tested by this repository's own suite, and if the step is skipped the defect returns silently. The repository's own settings module documents the project's stance as flat and dependency-free. Cost of my choice: a small reader to maintain. If the human wants the declaration as well, it is additive.
   - *Copy the package into the repository.* A full YAML parser and its licence notice, kept current by hand, for one legacy field.
   - *Delete the legacy read.* The header calls the fold a deliberate floor against a silent reset to zero, and three existing tests pin the migration. Removing it could restart a plan's count from zero.
   - *Move the require inside a function with a catch.* It hides the defect and repeats the false-green shape.
2. **Reader grammar:** block-style maps, plain or quoted keys, numeric values; anything else contributes zero for that entry, silently, as an unparseable block does today. Cost: a shape no writer produced reads as zero. Bounded by scenario 6.
3. **Where the reader and the package disagree, err toward escalating.** The counter is read even when unrelated lines in the block are malformed (the package would drop the whole block); a duplicate key takes the larger value. Cost: this is a behaviour change on inputs that never occur in the existing tests; it is pinned by tests.
4. **The block splitter and normalization stay as they are.** Not chosen: reuse the splitter in `frontmatter-merge.js` (private, and it recovers unterminated blocks, which would change which blocks are read) or the flat reader in `state.js` (fact 3). The reader is private to the circuit breaker; nothing new is exported, which also keeps the dead-export fence quiet.
5. **The test that requires the package is rewired, not given a declared development dependency.** Cost: a justified test change (scenario 21). Not chosen: declaring the package as a development dependency, which changes `package.json` and the lockfile to keep a helper that checks two scalars.
6. **What ships means tracked plus untracked-not-ignored files.** Not chosen: copying the whole directory minus `node_modules` (includes ignored local state that a clone does not have), or the last commit only (misses the module the current build just created). Cost: needs version control on the machine.
7. **One process per module, scrubbed environment, canary for cleanliness.** Not chosen: one process for all modules (a module that exits or has side effects on load takes the rest down and hides failures). Cost: process start-up per module, unmeasured.
8. **Entry programs are run as registered or listed as not reached; success is judged by the resolver audit, not the exit status.** Hooks exit non-zero by design and fail open on internal error, so their exit status carries no information about a missing module.
9. **Verdicts travel through a file written synchronously.** Not chosen: parsing standard output (the truncate-then-parse and pending-write families this repository fences).
10. **The failing-verification call site is covered by calling the function, not by driving the route.** Reason: driving it runs the project's whole quality gate.
11. **Exemptions ship empty and need a written reason; there is no debt list.** Reason: a load failure is binary and the tree must load fully now. Anything else found is fixed or exempted with its reason in the same unit of work.
12. **Lint rules are measured first and switched on per rule, scoped to `src`.** Not chosen: switching all three on repository-wide (tests legitimately require development packages) or leaving all off (the comment is an unmeasured claim).
13. **The inbox's catch is left as is.** Reason: changing what the menu shows on its hot path is a build decision, put as open question 2. The fix removes the trigger, and scenario 7 asserts a seeded entry so a repeat cannot pass as "none".
14. **Scenario count exceeds the per-story guideline.** Reason: the request asked for the fix and its proof; the implementation planner slices it.
15. **The plan file carries candidate files in a fenced block, not a `files:` declaration.** The declared list is a write permission and is fixed by the implementation plan.

## Open Questions For The Human

**Question 1 — How much of the existing test suite runs inside the clean copy, beyond the module load and the two driven routes?**

The base design loads every module under `src`, runs the five circuit-breaker test files and one new inbox test in the clean copy, and leaves any other lazy require to the static rule. Options, laid out flat:

| Option | What runs in the clean copy | Pros | Cons |
|---|---|---|---|
| A. The base design only | Load, resolver audit, the five circuit-breaker tests, the new inbox test. | Cheapest; the check stays fast enough to sit in the test gate. | A lazy require in any other module is covered only by the static rule, and only if a rule can be switched on. |
| B. Plus the tests of every module that has an in-function require | A list of those modules and their covering tests, produced by measurement. | Reaches every lazy require that a test already exercises. | Needs the list built and kept current; cost grows with the list. |
| C. The whole suite | Every test file, counting only failures whose requesting file is under `src`. | Widest reach; the recorded coverage floor of 99 percent suggests most lazy requires execute somewhere in the suite. | Adds a second full run of the suite to the gate (duration not measured); tests that need development packages fail there and must each be excluded by name with a reason. |

This is your decision about cost and risk; I make no recommendation.

**Question 2 — When the circuit breaker module cannot be loaded, what should the inbox show?**

Today it shows zero escalations, identical to "none". With this fix the trigger is gone, and scenario 7 would catch a repeat in the test gate. Options, laid out flat:

| Option | What the inbox does | Pros | Cons |
|---|---|---|---|
| A. Leave the catch | Shows zero when the module fails to load, as today. | No change to the menu's hot path or its screens. | A future load failure is invisible to the person using the menu; only the test gate can notice. |
| B. Report "could not read escalations" | A distinct value that the count and the screen show in place of a number. | The human is told when it could not look. | Touches the inbox counts and their rendering; every reader of the count must handle a third state. |

This is your decision about what to build and how much surface to touch; I make no recommendation.
