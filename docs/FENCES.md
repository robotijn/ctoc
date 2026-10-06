# Fences — checks, baselines and their histories

This text was moved word for word out of this repository's `CLAUDE.md` on 2026-10-06, keeping its original headings, so that `CLAUDE.md` stays small. Read it before you touch any check, baseline or fence: `.ctoc/*-baseline.json`, `src/scripts/test-gate.js`, the coverage floor, reachability, the stale detector, guide claims, shipped recipes or compliance.

## Test & Verify

**The gate FAILS CLOSED when it cannot read its own instrument.** `test-gate.js` strips ANSI before parsing and returns `null` — never `0` — when a counter is unreadable, so an unparseable run is a loud failure instead of a silent green: a parser whose no-match default is the success value cannot tell "everything passed" from "I could not read my input" (it once reported `fail 0` over 8 real failures under `FORCE_COLOR`).

**The false-green fence — a check that reports a verdict on input it never received.**
That defect class shipped five times: a parser whose no-match default was the SUCCESS
value `0`; a verdict parsed off a copy of the output truncated to 4000 characters, when
the runner prints its verdict LAST; `process.exit` discarding ~1.4MB of pending piped
writes (invisible interactively, because terminal writes are synchronous — only an
automated caller ever sees it); an `execSync` overflowing its default 1MB `maxBuffer`,
throwing, and recording a PASSING suite as a failure. Every one passed review and a
green suite, because the instrument was blind and the blindness itself was reported as a
value. `src/lib/false-green-scan.js` scans `src/` for the five signatures
(`parse-default`, `truncate-then-parse`, `exit-with-pending-writes`,
`unbounded-capture`, `silent-catch`); `tests/false-green-fence.test.js` is the ratchet
and `iron-loop-enforcer`'s `false-green-fence` check surfaces the same truth on demand
in thorough mode. `.ctoc/false-green-baseline.json` holds TWO deliberately separate
structures: `findings` is pre-existing DEBT that may only ever SHRINK (no per-entry
justification — requiring one for each of 220 sites would mean the fence never lands),
and `whitelist` is a PERMANENT exemption that starts EMPTY and requires a written
justification per entry. Conflating them is what kills a fence. The fixed exemplars are
the specification: `src/scripts/test-gate.js` (parsers return `null`, never `0`) and
`src/lib/request-exit.js` (`process.exitCode` + return, so Node drains before exiting).

**The agent-honesty fence — what an agent is TOLD, not what it SAID.** An agent asked for
status with no data invented "your session's compliance gate is at 11:15" — an invented
time, an invented schedule, and a subsystem (`isControlEnabled`, zero callers in `src/`)
named as running, none of it produced by any string in the repository. No fence can reach
that surface: a model's prose streams straight to the terminal, past every hook. The lever
is the instruction the model carries BEFORE it speaks. `skills/agent-fragments/honest-status.md`
states it (assert only what you verified; when you have no data say you have none; never
invent a time, a deadline or a subsystem's activity), every dispatchable agent references
it, and `src/lib/agent-honesty-scan.js` fences that the reference is present and the fragment
is substantive — wired as the `agent-honesty-fence` check in `iron-loop-enforcer.js`. Like
`stale-detector.js`, the census FAILS CLOSED: an unreadable definition or a dispatchable
count below the non-vacuity floor (100) returns `available: false`, never a passing empty
`missing` list, and a hollow fragment (marker present, sections gone) FAILS. **It proves a
reference, never obedience** — it cannot reach into a generation, and Operating Lesson 18 is
the only thing that touches the session model's own prose.

**The unexecutable-order fence — an order to an agent to run code its tools give it no way
to run.** An agent definition is a set of orders, and its `tools:` frontmatter is the
complete list of what it can do. When the body says *call this JavaScript function* —
`call \`shouldRunGdpr(projectRoot)\`` — and the grant holds no way to execute JavaScript
(in practice, no `Bash`), the order is IMPOSSIBLE: the agent skips the part it cannot do
and returns a result that reads like success. Five agent definitions carried exactly this
(two advisory compliance agents, the web-only recommender, and both planning agents), and
one of them, `initProductOwnerAgent`, propped up dead exports whose only "caller" was that
impossible order. `src/lib/unexecutable-instruction-scan.js` finds such orders across
`agents/**/*.md`, following the same discipline as `src/lib/reachability.js` — **a citation
is not an invocation**: a bare backticked name, a `file#name` anchor, a third-person
description, fenced example code, and a callee whose name is itself a granted tool are NOT
findings. Three signatures fire (an imperative call verb, a second-person sentence, a
capability manifest); it UNDER-reports by design rather than cry wolf.
`.ctoc/unexecutable-instruction-baseline.json` holds the same TWO separate structures as
the false-green baseline — `debt` (real orders being paid down, may only SHRINK) and
`exemptions` (the detector is wrong, a written reason per entry, ships EMPTY);
`tests/unexecutable-instruction-fence.test.js` is the ratchet and `iron-loop-enforcer`'s
`unexecutable-instruction-fence` check (thorough mode) is the live call site.

**A check with zero detected tools reports NOT VERIFIED and FAILS its tier — it does not
pass.** In the quality agent (`src/lib/quality-agent.js`), `runLint`/`runTypecheck` carry a
`ran` count: `passed:true` requires `ran >= 1` with no command failure, and a zero-tool
detection returns `{ passed:false, undetermined:true, ran:0, errors:null }` — the same
false-green class as the parsers above, one field to the left. `errors` is `null` on that
path, never `0`, because `0` is a measurement and nothing was measured; the not-verified
message ("lint NOT VERIFIED — ...") is deliberately distinct from the passing message so a
non-run never reads as a clean run. The two `setCompleted` fallbacks for a missing result
object are failure-shaped (`notVerifiedLint`/`notVerifiedTypecheck`) for the same reason: a
check that produced no result did not pass. Enforced by `tests/vacuous-verification.test.js`.
This makes a project with no linter fail loudly rather than receive a green tick — which
checks a project treats as optional is a per-project policy decision left to the human, not
softened here.

**The golden-corpus fence — a synthetic-only test for a module that reads a persisted
real-world contract.** In the human's words: "the matrix fix passed its own tests while
your screen was still unreadable. It only broke when rendered against the real question
files in your store." A decision-matrix renderer was fixed test-first, four SYNTHETIC
tests passed, and the human's screen was still unreadable — because the real question
file in `.ctoc/streaming/questions/` carries option fields over a thousand characters
long, full of file-and-line citations, and against that shape the matrix wrapped ~20
lines down a narrow column, split `src/lib/task-reconcile.js` mid-word, and duplicated a
cell. There is no shape in source that says "this test is synthetic", so this fence
cannot scan for one: it HOLDS the real data. `src/lib/golden-corpus-scan.js` carries a
curated registry of five persisted contracts (streaming-questions, verify-evidence,
approval-ledger, task-registry, plan-frontmatter) and detects, by two signals
(reader-import OR inline path-build-plus-parse), a `src/**` module that consumes one; a
module linked by no test naming its corpus directory is a finding. The LOAD-BEARING half
is not that static scan — it is `tests/golden-corpus-fence.test.js`, which drives every
BYTE-FOR-BYTE captured sample in `tests/fixtures/golden-corpus/` through its canonical
reader, plus the EXTREMES RATCHET (the measured longest field / bytes / depth / array
length may only ever GROW — shorten a sample and the fence fails by name), and
`tests/real-question-file-render.test.js`, which renders the real question file through
the public `planDecisionScreen` and is RED against the pre-fix renderer. Captures are
never redacted or shortened — REDACTION IS SANITISATION, the exact defect — so a contract
whose real instances cannot be committed is recorded as an uncaptured variant in
`tests/fixtures/golden-corpus/manifest.yaml`, never faked. `.ctoc/golden-corpus-baseline.json`
holds the same TWO separate structures as its siblings: `findings` is DEBT that may only
SHRINK, `exemptions` is a PERMANENT exemption that starts EMPTY. Wired live in
`iron-loop-enforcer`'s `golden-corpus-fence` check (thorough mode).

**The stale scan says when it could not look — and `unreadCount === 0` is the only
thing that licenses reading a zero.** `scanCheapCandidates` in `src/lib/stale-detector.js`
runs on the menu hot path (`src/lib/inbox.js`, `src/lib/menu-screens.js`) and skips an
input at four points: an unreadable stage directory (which drops an ENTIRE stage — up to
a third of the backlog), a failed `lstat`, a plan above the 1 MiB `MAX_PLAN_BYTES` gate,
and a failed read. Each skip is correct — a plan that vanishes mid-scan must never crash
the menu — but the result had nowhere to put them, so `{ candidates: [], count: 0 }` from
a scan that read NOTHING was byte-identical to the same result from a complete scan of a
clean backlog. An unreadable `plans/review/` rendered as "no stale plans": the sixth
instance of the false-green class, on the hot path. The result now carries
`unread: [{ path, stage, reason }]` and `unreadCount`. **`unreadCount === 0` means the
walk completed and ONLY THEN does `count === 0` mean the backlog is clean;
`unreadCount > 0` means the result is PARTIAL.** `reason` is a CLOSED enum —
`stage-unreadable` · `stat-failed` · `oversized` · `read-failed` — never a raw error
string, because the value is rendered on a dashboard and a filesystem error carries
absolute paths and user names; `path` is repository-relative for the same reason. A
`stage-unreadable` entry stands for a WHOLE stage, since the scan cannot know how many
plans it failed to read and inventing a count would be the very defect being fixed.
**TWO SKIPS ARE DELIBERATELY NOT FAULTS, and must not be "fixed" into faults.** A
non-regular file (a directory or a SYMLINK) is a security exclusion — a symlink could
point outside root, so the scan refuses to follow it — not a failure to look; reporting
it would make every repository containing a symlinked plan permanently "partial" and
devalue the signal into noise. An ABSENT stage directory is not a fault either: there are
no plans there to fail to read, so reporting it would be a FALSE partial, the mirror
image of the defect. The enum stays closed at four for this reason.
**NOT YET DISPLAYED, and that is not finished.** `unreadCount` is produced and tested; no
consumer renders it, so until `inbox.js` and `menu-screens.js` are wired the menu still
shows a partial scan as a clean one. The data says otherwise; the screen does not. An
undisplayed honest signal beats a displayed dishonest one — it is not a substitute for
one. Enforced by `tests/stale-scan-says-when-it-could-not-look.test.js`, whose
permission-dependent cases skip LOUDLY with a printed reason on Windows and as root,
because a permissions test that silently no-ops is itself a check reporting a verdict it
never earned.

**A pre-Gate-2 plan's missing files are not abandonment.** `NOT_STARTED_STAGES` in
`src/lib/stale-detector.js` is the allowlist of stages where declared files are NOT yet
expected to exist, and it did not contain `implementation` — a stage that IS scanned
(`GATE_SOURCE_STAGES`) but sits BEFORE Gate 2, has never entered the todo queue, and has
therefore never been executed. Its declared `files:` are the files it INTENDS to create,
so they are supposed to be missing. That one set membership made every unbuilt
implementation plan classify as `dead-on-arrival`: measured on this repository, 8 of 21
candidates (38%) were unbuilt plans reported as abandoned work, and it was the detector's
loudest output. It is a correction of SCOPE, not a deletion — `missing-files` keeps full
teeth at `review`, and the not-started gate still exempts `explicitlyRejected`, so
positive death evidence reaches dead-on-arrival at every stage. The cheap pass stays a
broad generator (stage polarity lives downstream in `classifyStaleCandidate`, locked by
the SP5 regression T3b); `implementation` now behaves exactly as `functional` already
did — one rule for pre-build stages, not two.

**The dead-code fence — the count is DEBT, not a regression.** A module is done when
a human can REACH it, not when its test passes (a test IS a caller).
`src/lib/reachability.js` computes that, `tests/reachability.test.js` ratchets it, and
`.ctoc/reachability-baseline.json` records **26 unreachable files** today. That number
rose from 0 on 2026-07-19 and **not one file died**: the fence had been crediting two
things that are not calls. Any quoted string ending in `.js` became a call edge matched
by BASENAME — so `iron-loop-enforcer.js`'s `REQUIRED_LIBS` array, a list of paths handed
to `existsSync`, manufactured eight edges and kept `quality-gate.js`, `v8-dispatcher.js`
and `product-loop.js` "live" on the strength of a presence check — and any `src/**.js`
path MENTIONED in any markdown became an execution ROOT, bare prose included, which made
roughly a third of the library a root because an agent definition described it in a
sentence. Comments were scanned too, so a `require` inside a comment was an edge. **A
citation is not an invocation** — the sibling EXPORT fence twenty lines away in the same
module had always said so, and the two now agree: a path is an edge only when something
SPAWNS it, and a root only when a shipped instruction RUNS it (`node <path>` /
`require('<path>')`). The baseline holds the same TWO separate structures as the
false-green baseline — `unreachable` is DEBT that may only SHRINK (exits are wire or
delete), `whitelist` is a PERMANENT exemption mapping file → written justification in ONE
object, and it is EMPTY. A file genuinely executed by an invisible mechanism goes to
`.ctoc/reachability-roots.json` as a declared ROOT with a reason naming that mechanism
(today: `src/hooks/post-commit.js`, run by git via the hook `hooks-installer.js`
installs) — a stronger, more reviewable claim than an exemption. **The analyzer FAILS
LOUD:** every read path used to degrade silently toward "unreachable" (an unreadable
hooks manifest became `''`, killing every hook root at once), so one unreadable file
could have nominated live code for deletion. Unreadable now throws and names the path;
ABSENT keeps its own meaning, and `analyze()` returns `readErrors` so a seeding run can
prove it read everything it judged (`seedReadErrors: 0`).

**The compliance-claims fence — a claim of active enforcement requires a real
evaluator.** A false claim that the product ENFORCES a regulatory control it does not
enforce is the one defect that can hurt a user legally.
`tests/compliance-claims-match-code.test.js` makes it mechanical: a control is ENFORCED
only where its name is a string-literal argument to a real `isControlEnabled(` call (in
comment-stripped `src/**/*.js` or a FENCED code block of a shipped instruction surface —
a comment and a prose citation are not callers, the same discipline the reachability
fence uses). Every naming of a NOT-enforced control across the WHOLE claim surface
(`agents/**/*.md`, `docs/*.md`, `README.md`, this file) must carry the literal marker
`NOT ENFORCED`: a table row and a list item are marked in place, a heading or prose
paragraph is covered by a marker in its section, and a marker must never sit on an
enforced control's own block (a stale marker is removed when the control is finally
wired). Fenced code and settings examples are not claim surface; a zero-controls,
zero-files, empty-ENFORCED or unreadable-doc scan FAILS rather than reporting "honest".
Today the one enforced control is Independent Verification and Validation (the IV&V
chief's activation call); every other named control carries the marker.

**The compliance seam is EXECUTABLE, not merely named.** At the
functional→implementation transition CTO Chief dispatches the compliance seam through
two shipped `node -e` recipes in `agents/coordinator/cto-chief.md` (the coordinator
holds `Bash`): the first RUNS `src/lib/iron-loop-compliance-trigger.js`'s
`evaluateComplianceTrigger`, the second — only when the trigger reports a regime on —
RUNS `src/lib/compliance-integration.js`'s `runComplianceForTransition`, passing the
agents' findings argv-JSON (never string-interpolated). A named function in a prose
sentence is a citation the reachability fence does not credit; a literal program is an
invocation it does, so converting the two calls to recipes moved the seam's seven-file
closure out of the dead list (24→17). The seam remains ADVISORY: findings attach to the
Inbox, it moves no plan and adds no human gate. Proven by RUNNING both recipes as child
processes in `tests/compliance-seam-is-executable.test.js`.

**The recipe-execution fence — a shipped recipe is proven by RUNNING it.** A static
check cannot catch the defect class this fence exists for: the broken `cleanup-exec`
recipe (00185) passed a string where a proposal OBJECT belonged — three arguments to
`executeCleanup(proposal, root, deps = {})`, whose `Function.prototype.length === 2`.
That call is arity-legal in every sense a static checker can measure; it was wrong in the
MEANING of an argument, and JavaScript carries no type at that boundary to compare
against. So the mechanism EXECUTES rather than reads: `src/lib/recipe-harness.js`
extracts each shipped `node -e`/`node <script>` recipe out of `src/commands/start.md` and
runs it against a fixture seeded so a specific observable change MUST occur, then asserts
the change occurred. `tests/shipped-recipes-execute.test.js` is the ratchet and
`.ctoc/recipe-coverage.json` holds the same TWO separate structures as the reachability
baseline: `covered` (recipes with a fixture and an assertion — proven by running them,
may only GROW) and `uncovered` (state-changing recipes that exist and have no fixture
yet, each with a one-line reason, may only SHRINK). A new state-changing recipe in
`start.md` absent from BOTH lists FAILS, so the fence catches the ARRIVAL of an unchecked
recipe. **Scope is state-changing recipes only** — one that moves a plan, writes a
setting, writes a ledger entry, writes to `.ctoc/`, or deletes a file; a read-only recipe
is out of scope because its failure is visible on the screen the moment a human uses it.
It deliberately does **not** cover read-only recipes, agent-definition surfaces under
`agents/**`, or a recipe that runs correctly but does the WRONG thing (the fixture
asserts the effect its author declared). The harness commits none of the five false-green
signatures: no silent catch, explicit `maxBuffer` with an overflow reported as a FAILURE,
no memoization (a cached execution is a recipe that was not executed), no shell (argument
array, so a program containing `&&` or `|` is a parse-time failure), and a LOUD throw when
its target file is missing — a zero-recipe extraction FAILS rather than passing on an
empty match, because the recipe surface was renamed once already (`menu.md` → `start.md`).

**Coverage floor — the shipped truth.** Step 14 VERIFY enforces the coverage floor
recorded in `.ctoc/coverage-baseline.json`, which is **99** today (real src line
coverage measured 99.37%, SCOPED to `src/**`). The gate scopes coverage with
`--test-coverage-include=src/**`; WITHOUT that scope node's `--experimental-test-coverage`
reports a meaningless ~40% (the denominator is inflated by every file the 277-file test
run transitively loads — that broken number, not real coverage, is why the old floor was
40). Only `npm test` (via `src/scripts/test-gate.js`) runs that gate and the zero-skipped
gate; `node --test tests/*.test.js` BYPASSES both. The floor is a ratchet — RAISE it as
coverage improves, never lower it to make a run pass. The VERSION file is the single
source of truth for version numbers. Do NOT use `run-all.js` (it doesn't exist).

**The ratchet's DIRECTION is now a check, and an unreadable floor REFUSES.** Both
halves were prose before. `tests/coverage-ratchet-direction.test.js` states the floor a
second time in `HISTORICAL_FLOOR`, so lowering `minPct` requires editing two places,
one of them a test whose name and failure message both say not to. And
`resolveThreshold` used to return the default 80 on ANY read failure: file absent,
file corrupt, `minPct` given as the string `"99"` rather than the number `99`, or a
value outside (0, 100] — a nineteen-point drop from the real floor, after which the
gate printed "threshold 80%" and PASSED. **ABSENT and UNREADABLE are different facts.**
A project with no baseline legitimately has no measured floor: it keeps the 80% default
but the gate now ANNOUNCES that it is defaulting. A baseline that EXISTS but cannot be
read, parsed, or trusted is a broken instrument, and the gate exits non-zero before it
runs the suite rather than enforcing a weaker floor it never read. Same discipline as
the parsers above it in that file: never return a number you did not read.

**Guides DECLARE their checkable claims, and the corpus reports how many it has.**
The ~61 structural corpus tests guard against a future edit THINNING a guide; they
never check whether a guide is TRUE. `src/lib/claim-extractor.js` adds that orthogonal
axis. A guide declares its version/link claims in an HTML comment block — invisible to
a markdown renderer and to an agent reading the guide as context:
```
<!-- ctoc:claims
- id: duckdb-python-version
  kind: registry-version            # registry-version | url-live (closed enum)
  source: https://pypi.org/pypi/duckdb/json   # https only, no userinfo, no port
  select: info.version              # registry-version only; rejects __proto__/constructor/prototype
  expect: 1.5.4                     # registry-version only
  retrieved: 2026-07-10             # YYYY-MM-DD
-->
```
Claims are DECLARED, never inferred from prose — a mis-parsed claim is a FALSE
refutation, worse than no check. A malformed record is NEVER dropped: it is returned
with a closed-enum reason (`unknown-kind` · `missing-field` · `duplicate-id` ·
`insecure-source` · `unsafe-source` · `unsafe-selector` · `bad-date`). A guide with NO
block is `declared: false` (nobody looked) — distinct from an EMPTY block
(`declared: true`, an author looked and found nothing checkable). `censusCorpus` walks
`skills/**/*.md` and, like the stale detector, reports `unreadableCount` — `undeclaredFiles
=== 0` means "the whole corpus declares claims" ONLY when `unreadableCount === 0`. The
declared-file count is a one-directional floor in `.ctoc/claim-coverage-baseline.json`
(`minDeclaredFiles`, ratchet-up only, an unreadable baseline BLOCKS), enforced live by
`tests/claim-census.test.js` and the `iron-loop-enforcer` `claim-census` check. Slice
00136 fetches; 00138 surfaces the census to the menu. **No network fetch happens here,
and this does not verify prose, recommendations, or code-example correctness — the great
majority of the corpus by volume stays unverified, and the census reports the uncovered
remainder as a number so nobody mistakes partial coverage for coverage.**

**The verdict reaches a human on the Doctor screen, and the check has a documented
command to run.** `src/tabs/tools.js` (reached from `/ctoc:start` → Tools → Doctor)
renders one row off the ledger — `verified N  refuted N  unverifiable N   last verified
Nd ago (horizon Nd)` — reading `.ctoc/verification/claims-ledger.json` OFF DISK with **no
network**. All three counts always render, zeros included; a refutation names its guide
path. ABSENT (`never verified — run [5]`), CORRUPT (`unreadable — see [5]`) and CLEAN are
three DISTINCT strings — a display that collapses them is the false-green shape
`stale-detector.js` documents against its own still-unrendered `unreadCount`, and this
slice does not repeat it. Doctor action `[5]` runs the verifier in the BACKGROUND.

The scheduled half is **`node src/scripts/verify-claims.js`** — cross-platform, no shell,
the only network path in the repository. Exit codes: **`0` clean, non-zero when any claim
is `REFUTED`**. The staleness horizon defaults to **7 days**, so a **weekly run with
margin** keeps the ledger fresh. **`npm test` performs NO network access** — it reads and
enforces the committed ledger only. **A stale ledger is a build failure BY DESIGN; you
clear it by RUNNING the command, NEVER by widening the horizon** — widening it is the
cheapest way to turn red green and silently destroys the one property that makes a
scheduled check trustworthy (Operating Lesson 14). **Which scheduler runs it is the
human's decision and is deliberately not made here.**

---

## Iron Loop Summary

**The Step 7 refinement rounds are AGENT-driven, and no JavaScript scores a plan.** `src/lib/iron-loop.js` appends the Steps 8-16 execution section and returns the single status `not-evaluated` (`evaluated: false`, `stub: true`, `scores: null`) — plus checkable structural facts: which canonical step labels are missing, which are present under a wrong label, how many IMPLEMENT steps exist. It formerly returned five 1-to-5 dimension scores, but computed them by grepping the boilerplate template it had itself just appended to the same plan, so every plan received the same numbers and a plan whose entire body was "This plan says nothing" averaged 4.6 and passed. Those scores are deleted; the honest verdict is written into the plan so the human at Gate 2 reads that nothing machine-checked it. A real automated critic is separate work.
