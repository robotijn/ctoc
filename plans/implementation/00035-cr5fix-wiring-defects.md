---
title: "CR5-FIX — 5 wiring defects from adversarial review"
type: implementation
parent_plan: ctoc-capability-registry
depends_on: 00034-cr5-s4-stack-detector-registry
priority: HIGH
program: ctoc-capability-registry
iron_loop: true
files:
  - ".ctoc/capabilities/languages/c.yaml"
  - ".ctoc/capabilities/languages/objectivec.yaml"
  - "tests/capability-registry-top20.test.js"
  - "src/scripts/build-coverage-map.js"
  - "src/lib/quality-agent.js"
  - "src/lib/tool-detector.js"
  - "tests/tool-detector-registry.test.js"
  - "tests/quality-fleet-wiring.test.js"
---

# CR5-FIX — fix 5 confirmed wiring/ordering/honesty defects

An adversarial review of the CR5 wiring found 5 defects, ALL reproduced by direct
execution. The registry primitives are sound; every defect is in ordering, consumer
wiring, or over-broad data. Fix them before CR5 is trusted.

## TDD-Red FIRST for each behavioral fix, then implement.

### F1 (HIGH) + F2 (MEDIUM) — over-broad language markers → wrong `[0]` → wrong coverage command
CONFIRMED: a JS/TS project with a root `Makefile` detects as `[c, javascript, typescript]`
(registry ordered first, `c.yaml` sorts first), so `build-coverage-map.js:354`
(`Object.keys(tools.tools)[0]` → `c`) runs `lcov` on a Jest project — the real
`npx jest --coverage` never runs.

TWO fixes (do BOTH — narrow the data AND harden the consumer):
1. **Narrow the weak markers** (they assert a language on a generic/ambiguous file):
   - `c.yaml`: `detectionMarkers: [Makefile, "*.c", "*.h"]` → `["*.c", "*.h"]` (Makefile is
     a generic build tool used by C/C++/Go/Rust/anything; C is detected by its source
     extension). Update the header comment.
   - `objectivec.yaml`: `[Podfile, "*.m", "*.xcodeproj"]` → `["*.m"]` (Podfile means
     "uses CocoaPods" — Swift too; `*.xcodeproj` is shared with Swift). `*.m` is the
     Objective-C source extension (best available signal). Update the header comment.
   - Leave `r.yaml` (`DESCRIPTION` is R's canonical package descriptor) UNCHANGED.
   - Update `tests/capability-registry-top20.test.js` detection fixtures: the map at
     ~line 59/68 uses `c: 'Makefile'` and `objectivec: 'Podfile'` — change to a file that
     the NARROWED markers match (`c: 'main.c'`, `objectivec: 'foo.m'`). Grep the whole
     test for any other Makefile/Podfile→c/objc assumption and fix consistently.
2. **Harden `build-coverage-map.js`** so it does not blindly trust `[0]`: pick the
   PRIMARY language from `require('../lib/stack-detector').detectStack(projectPath).primary.language`
   (framework-aware, and its ordering is safe — it prepends its own results), then read
   the coverage command from `detectTools(...).tools[primary]?.coverage`. If the primary
   has no coverage command, fall back to the first detected language that DOES have one.
   Never silently run a coverage command for a language that isn't the project's primary.

### F3 (MEDIUM) — quality-agent SAST honesty gap for parser-less languages
CONFIRMED: `quality-agent.js:508` computes `scannable` from `TOOL_CONFIGS[l].primary`
availability (`spotbugs`→`mvn --version`), NOT from the honest router. A Java+Python repo
with Maven-but-no-semgrep marks java scannable, yet `runLanguageScanner('java')` returns
false (spotbugs has no parser) and semgrep is absent → java scanned by NOTHING, no skip
printed, `scanned:true`.
FIX: compute `scannable` from `sast.securityRouteFor(l)`:
```
const scannable = languages.filter(l => {
  const route = sast.securityRouteFor(l);
  return route.native ? sast.isToolAvailable(route.native) : semgrep;
});
```
So a parser-less-tool language (java, rust, php, …) is scannable ONLY when semgrep is
installed; otherwise it prints the honest "no scanner" skip. Keep the belt-and-suspenders
`res.scanned===false` check. Add/extend a test in `tests/quality-fleet-wiring.test.js`
that a java-present, semgrep-absent case yields an honest skip (mock `isToolAvailable`).

### F4 (LOW) — registry reloaded 4×/language in toolsFromRegistry
`toolsFromRegistry` calls `registry.toolchainFor` 4× per language, each re-running
`load()` (readdir+stat+read+parse of ~20 YAMLs). FIX: load the registry ONCE per
`detectTools` call and look up phases from that single load — respects the read-fresh
rule (one fresh read per invocation, not a cross-call cache). Use `registry.load(projectPath)`
once and read `languages[lang].toolchain[phase].cmd`, or add a registry helper that
returns a full toolchain object in one call. Behavior identical; fewer file ops.

### F5 (LOW) — `./gradlew` override is not cross-platform
`tool-detector.js` Java-Gradle branch hardcodes `./gradlew …`; on Windows the wrapper is
`gradlew.bat` and `commandExists('where ./gradlew')` always fails. FIX: pick the wrapper
by `process.platform` (`gradlew.bat` on win32, `./gradlew` otherwise). CTOC cross-platform
rule. Document as a decision.

## VERIFY (Step 14) — paste verbatim
`node --test tests/capability-registry-top20.test.js tests/tool-detector-registry.test.js
tests/quality-fleet-wiring.test.js tests/capability-registry.test.js tests/security.test.js
tests/stack-detector.test.js` all green; a hand-run proving the F1 repro is fixed
(JS+Makefile → `[0]`/primary is javascript, coverage is the JS command); eslint clean on
every touched file; `tsc --noEmit` 0; dead-export fence + iron-loop-enforcer 0 block; NO
git; do not move the plan. Step 16: before→after for each of the 5, and confirm no other
test regressed (run the FULL suite once and report the totals).
