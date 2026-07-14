---
title: "CR5-s1 — glob-aware detection in the capability registry"
type: implementation
parent_plan: ctoc-capability-registry
depends_on: 00030-cr3fix-detection-honesty
priority: HIGH
program: ctoc-capability-registry
iron_loop: true
files:
  - "src/lib/capability-registry.js"
  - "tests/capability-registry.test.js"
---

# CR5-s1 — make the registry the STRONGEST detector, so the surfaces can consume it

CR5 replaces the four duplicate language tables (stack-detector, tool-detector,
sast-runner, app-runner) with the one registry. But the registry today detects by
EXACT filename only — weaker than `tool-detector` (which matches `*.csproj`,
`*.gemspec` globs on a readdir). Wiring the surfaces to today's exact-match engine
would REGRESS csharp/ruby/C detection. This slice fixes that first: the registry
gains glob-marker detection, becoming at least as strong as the surfaces it replaces.

## The change (src/lib/capability-registry.js, `detectLanguages` only)

The language YAMLs already carry glob markers in `detectionMarkers` (e.g. c.yaml
`["Makefile", "*.c", "*.h"]`, csharp `["global.json", "*.csproj", "*.sln"]`,
objectivec `["Podfile", "*.m"]`). Today the engine does `existsSync(join(root,
marker))`, so a literal `*.c` never matches. Fix `detectLanguages` to:

1. For a marker containing `*`: readdir the project ROOT (via `safeFs.readdirSync`,
   fail-soft to `[]`) and match filenames with a SAFE regex built exactly like
   `tool-detector.js:88-92` — `safeRegExp(escapeRegExp(marker).replace(/\\\*/g,
   '.*'))`. NO raw RegExp (ReDoS guard). Anchor the match to the whole filename.
2. For a marker without `*`: keep the current exact `existsSync` behavior UNCHANGED.
3. Preserve DECLARATION ORDER of the returned array and the existing dedupe — app-
   runner consumes `detectLanguages(...)[0]`, so the first detected language must not
   shift for any project that already detects today.

Do NOT add file-EXTENSION-tree-walking in this slice (that is stack-detector's
concern, handled in CR5-s4). Root-level glob + exact markers only — this is exactly
`tool-detector`'s detection power, which is what s2/s3 need to not regress.

### C-vs-C++ disambiguation (closes the CR3-FIX deferred item)
With globs live, a `.c` file now detects `c` and a `.cpp` file detects `cpp`. But
`CMakeLists.txt` is a `cpp` exact-marker and `Makefile` a `c` exact-marker, so a C
project using CMake still mis-detects as cpp. Add the minimal data fix in the YAMLs
IS OUT OF SCOPE here (languages/*.yaml not in this slice's files). Instead, the ENGINE
must let the glob evidence win: when BOTH `c` and `cpp` would be detected, keep both
(they are genuinely both present is possible); when only `*.c`/`*.h` match and no
`*.cpp`/`*.hpp`, `c` is detected and `cpp` is not (and vice-versa). Verify this falls
out naturally from per-marker glob matching — do NOT add special-case C/C++ logic.
If it does not fall out naturally, STOP and report rather than hardcoding.

## TDD-Red FIRST (Step 8)
Add tests to `tests/capability-registry.test.js` (real temp-dir fixtures, zero
mocks) asserting, RED before the code change:
- A dir with a real file named `Foo.csproj` → `detectLanguages` includes `csharp`
  (glob `*.csproj`). Today: FAILS (exact-match misses it).
- A dir with `lib.gemspec` → includes `ruby`.
- A dir with `main.c` + `util.h` → includes `c`, does NOT include `cpp`.
- A dir with `app.cpp` → includes `cpp`, does NOT include `c`.
- A dir with `main.c` AND `app.cpp` → includes BOTH.
- REGRESSION GUARDS (must stay green): the existing exact-marker fixtures
  (`Cargo.toml`→rust, `pubspec.yaml`→dart, `go.mod`→go, etc.) unchanged; declaration
  order preserved so `detectLanguages(dir)[0]` is stable for a Rust project.

## Steps 11-16
Step 11 REVIEW (no raw RegExp; readdir fail-soft; order preserved; no C/C++ special-
case). Step 13 SECURE (glob regex is ReDoS-safe via safeRegExp+escapeRegExp; engine
still never executes). Step 14 VERIFY: `capability-registry.test.js` +
`capability-registry-top20.test.js` + `capability-project-types.test.js` +
`app-runner.test.js` green; the RCE-guard test still green; eslint clean; 20 langs +
13 types still load 0 warnings; NO git. Step 16 REPORT: before→after for each glob
case, confirm app-runner `detectLanguages[0]` stability, and that s2/s3 can now
consume `detectLanguages` without losing csharp/ruby/C.

## Wiring
No new exports; `detectLanguages` is already live (app-runner). Behavior strengthens;
reachability baselines unchanged.
