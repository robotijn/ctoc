# s6 agent round 1 — research (primary publications and vendor documentation) — citation-validator report (verbatim)

Dispatch d-s6-agent-r1-research, received 2026-10-01 14:56 CEST. The agent hit its turn limit and was told to stop fetching and write; 27 fetches, 7 searches. Saved by the session without edits.

---

# Dependency-analyzer agent: citation check, round 1 (primary publications and vendor documentation)

All sources were read on 2026-10-01. I used 27 web fetches (two were PDFs, which I read from the saved file) and 7 web searches, so I stayed under the 30-fetch cap. I edited nothing.

**Bottom line:** the agent's instability formula matches Robert C. Martin's text. Almost everything built on top of that formula does not:
- **Thresholds:** the 0.3, 0.7 and 0.8 instability cut-offs appear in neither of Martin's papers, and two of them contradict each other inside the agent.
- **Counting unit:** Martin counts classes; the agent counts files in one place and modules in another.
- **The stable-dependencies check is missing:** it is the real check Martin defines, and the agent never runs it.
- **Wrong runtime claim:** the inline `type` import example is not type-only at runtime.
- **The cycle-check recipe can falsely pass:** run on a TypeScript tree, the shipped madge command scans only `.js` files and reports zero cycles.

## 1. Claims and verdicts

Martin's 1994 paper is "OO Design Quality Metrics: An Analysis of Dependencies" (mirror at https://linux.ime.usp.br/~joaomm/mac499/arquivos/referencias/oodmetrics.pdf). His 2000 text is "Design Principles and Design Patterns" (mirror at https://staff.cs.utu.fi/~jounsmed/doos_06/material/DesignPrinciplesAndPatterns.pdf; the page header reads "www.objectmentor.com" and "Copyright (c) 2000 by Robert C. Martin"). Both are university course mirrors, not the publisher's copy.

| Agent line(s) | Claim | Verdict | Source | Sentence read |
|---|---|---|---|---|
| 178, 238 | `I = Ce / (Ca + Ce)`; 0 = stable, 1 = unstable | VERIFIED | Martin 1994, page 6 | "I : Instability : (Ce ÷ (Ca+Ce)) : This metric has the range [0,1]. I=0 indicates a maximally stable category. I=1 indicates a maximally instable category." |
| 176–177, 236–237 | Afferent count = "files that import M" (line 176) and "Number of modules that depend on this one" (line 236); efferent count = "files M imports" and "modules this one depends on" | MISATTRIBUTED. Martin's unit is classes, and only dependencies crossing the category boundary count. The agent uses two different units and never says "outside". Martin's own efferent definition changes between his two texts. | Martin 1994, page 6; Martin 2000, page 24 | 1994: "The number of classes outside this category that depend upon classes within this category." / "The number of classes inside this category that depend upon classes outside this categories." 2000: "The number of classes outside the package that classes inside the package depend upon. (i.e. outgoing dependencies)" |
| 241–242 | "I = 0: … many depend on it, hard to change"; "I = 1: … depends on many" | Partly REFUTED. I = 0 means no outgoing dependencies, and I = 1 means no incoming ones. Neither value says "many". | Martin 2000, page 24 | "If there are no outgoing dependencies, then I will be zero and the package is stable. If there are no incomming dependencies then I will be one and the package is instable." |
| 243 | "Ideal: Core modules I < 0.3, feature modules I > 0.7" | UNSOURCEABLE. Neither paper gives a numeric threshold. Recommended action: strip the specificity. | Martin 1994, page 8 | "a metric is not a god; it is merely a measurement against an arbitrary standard." |
| 32, 673 | "High coupling module … I > 0.8" costs 0.2 points | UNSOURCEABLE threshold. It contradicts line 243 (I > 0.7 is called ideal) and Martin's point that some packages should be unstable. Instability also is not "coupling". | Martin 2000, page 24 | "Indeed, we greatly desire that portions of our software be instable." |
| 590, 597 | "utils/ … I = 0.00 … perfect stability – Good!" | REFUTED. A concrete, maximally stable package is Martin's "zone of pain". The agent never computes abstractness, so it cannot call this good. | Martin 1994, page 7 | "Consider a category with A=0 and I=0. … Such a category is not desirable because it is rigid." |
| Frontmatter line 3 | Agent "detects … instability mismatches" | REFUTED by its own body. No step computes abstractness, distance from the main sequence, or the stable-dependencies rule. | Martin 2000, page 24 | Stable-dependencies rule restated: "Depend upon packages whose I metric is lower than yours." |
| 195–197, 655–661 | Cycle severity falls with length: 2 nodes high, 3 medium, 4 or more low | UNSOURCEABLE. It also runs against Martin's own example, where one six-package cycle is called "clearly disastrous". | Martin 2000, pages 18 and 20 | "The dependencies betwen packages must not form cycles." / "This is clearly disastrous." / "breaking cycles wherever they appear." |
| 200 | `import type { X }` does not count toward cycles | VERIFIED | TypeScript `verbatimModuleSyntax` page; eslint-plugin-import `no-cycle` page | "// Erased away entirely. import type { A } from "a";" / "This rule ignores type-only imports in Flow and TypeScript syntax (`import type` and `import typeof`), which have no runtime effect." |
| 789–794 | `import { type UserService } from './services'` is type-only and does not count for runtime cycles | REFUTED. Under `verbatimModuleSyntax` the import statement stays, so the module still loads and runs. | https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html | "// Rewritten to 'import {} from "xyz";' import { type xyz } from "xyz";" |
| 522 | Cycle impact: "may cause initialization issues" | VERIFIED for CommonJS | https://nodejs.org/api/modules.html | "When there are circular `require()` calls, a module might not have finished executing when it is returned." |
| 522 | Cycle impact: "cannot be tree-shaken" | UNSOURCEABLE. I read no bundler documentation. Recommended action: strip. | — | — |
| 1066, 1074, 1087 | `npx madge --circular --warning src/`, `--json` | Flags VERIFIED. As a TypeScript recipe it is REFUTED: by default madge scans only `.js` files, so on a `.ts` tree it reports zero cycles. Correct to add `--extensions ts,tsx`. | https://raw.githubusercontent.com/pahen/madge/master/README.md | "madge --circular path/src/app.js" / "Run madge with the `--warning` option to see skipped files." / "`fileExtensions` \| Array \| ['js'] \| Valid file extensions used to find files in directories" |
| 1074, 1087 | `madge --circular --json … \| jq '.length'` gives the cycle count | UNVERIFIED. The README does not describe the output shape of `--circular --json`. | same README | — |
| 200 vs 1066 | Type-only imports "don't count", yet the recommended madge gate counts them | Contradiction, VERIFIED. madge ignores type imports only when configured to. | same README | `"detectiveOptions": { "ts": { "skipTypeImports": true } }` (given under "How to ignore `import` in type annotations in TypeScript?") |
| 1087–1092 | Pre-commit hook `2>/dev/null \| jq '.length'` followed by `[ "$CYCLES" -gt "0" ]` | Believed false-green; I did not execute it. If madge fails, `CYCLES` is empty, the `[` test errors and counts as false, and the hook prints "Dependency check passed". | Shell behaviour, reasoned | — |
| 1101 | `"import/no-cycle": "error"` | VERIFIED | https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md | "Ensures that there is no resolvable path back to this module via its dependencies." |
| 1102–1117 | `import/no-restricted-paths` with zones `target` / `from` / `message` | VERIFIED | https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md | "message: Optional. Displayed in case of rule violation." / "it's matched against the path to the imported file after it's been resolved against `basePath`." / "The default for `basePath` is the current working directory." |
| 645 | "Add eslint-plugin-import rules" | VERIFIED that the tool exists. Latest release v2.32.0, dated "June 20" (the page shows no year; a search result says 2025). There has been no release since. | https://github.com/import-js/eslint-plugin-import/releases | "v2.30.0 … add support for Flat Config" / "v2.31.0 … support eslint v9" |
| 937, 940 | `dot -Tpng f.dot -o f.png`, `dot -Tsvg` | VERIFIED | https://graphviz.org/doc/info/command.html | -T: "Set output language to one of the supported formats." / -o: "Write output to file outfile." |
| 704–716 | Resolve aliases through tsconfig `paths` | VERIFIED as compile-time resolution, but the graph it produces is not the runtime graph | https://www.typescriptlang.org/docs/handbook/modules/reference.html | "The `paths` option does _not_ change the import path in the code emitted by TypeScript. Consequently, it's very easy to create path aliases that appear to work in TypeScript but will crash at runtime" |
| 708 | `babel-plugin-module-resolver` | Exists according to a search listing only (snippet says 5.0.3); not fetched | npmjs.com search result | — |
| 739–740 | `"@myorg/shared"` resolves to `packages/shared/src/index.ts` | REFUTED as a general rule. Bare specifiers resolve through the package's `"exports"` field. | https://nodejs.org/api/esm.html; TypeScript modules reference | "Including the file extension is only necessary for packages without an `"exports"` field." / "TypeScript follows Node.js's package.json `"exports"` spec when resolving from a package directory" |
| 394 | A directory import resolves to `index.ts` / `index.js` | Partly VERIFIED: true for CommonJS, after `package.json` `"main"` is checked. REFUTED for Node's native modules (ESM). | https://nodejs.org/api/modules.html; https://nodejs.org/api/esm.html | "…then Node.js will attempt to load an `index.js` or `index.node` file out of that directory." / "Directory indexes (e.g. `'./startup/index.js'`) must also be fully specified." |
| 761–762 | Internal = relative, `@/` alias, or workspace; external = npm packages and Node built-ins | Incomplete. `#` subpath imports are internal and are missing. | https://nodejs.org/api/esm.html | "If specifier starts with "#", resolution is handled by the PACKAGE_IMPORTS_RESOLVE algorithm, which checks the package's `"imports"` field." |
| 1061 | `actions/checkout@v4` | VERIFIED as still maintained (v4.4.0 released 20 Jul). Outdated: the current major is v7.0.1. | https://github.com/actions/checkout/releases | release list |
| 26–34, 649–684 | 0–10 score, penalty weights, score bands | Internal heuristic with no external source. Not a citation, but inconsistent: line 180 `10 - (violations * penalty)` differs from the Scoring Formula section; the deep-cycle penalty (-0.25) and the low-severity layer penalty (-0.1) are missing from the quick-reference table. | — | — |

## 2. Tools: current version, date and address

GitHub release pages leave the year off current-year dates, so a date with no year is believed to be 2026.

| Tool | Named by agent? | Version / date | Address | Status |
|---|---|---|---|---|
| madge | yes | 8.0.0 (npm `dist-tags.latest`); date not obtained (registry JSON truncated) | registry.npmjs.org/madge | Exists. Default extensions `['js']`. Repository has no GitHub releases. |
| eslint-plugin-import | yes | v2.32.0, June 20 (2025 per search) | github.com/import-js/eslint-plugin-import/releases | Exists. ESLint 9 supported since v2.31.0. ESLint 10 compatibility not verified. |
| eslint-plugin-import-x (maintained fork) | no | 4.17.1 per search snippet only | npmjs.com/package/eslint-plugin-import-x | Not fetched |
| dependency-cruiser | no (the skill and the architecture-checker agent name it) | v18.5.0, 30 Sep | github.com/sverweij/dependency-cruiser/releases | v18.3.0: "adds support recognizing type-only imports" |
| Graphviz `dot` | yes | 16.1.0 per search only; the documentation page's example output shows 2.47.1 | graphviz.org/doc/info/command.html | Flags verified; version not fetched |
| babel-plugin-module-resolver | yes | 5.0.3 per search snippet only | npmjs.com | Not fetched |
| actions/checkout | yes | v7.0.1 (20 Jul); v4.4.0 (20 Jul) | github.com/actions/checkout/releases | `@v4` is live but three majors behind, and pinned by tag rather than commit |
| import-linter (Python) | no | 2.15, released Sep 4, 2026; Requires-Python >=3.10 | pypi.org/project/import-linter/ | "allows you to impose constraints on the imports between your Python modules." Contract types not listed on the page. |
| pydeps (Python) | no | — | pypi.org/project/pydeps/ | Fetch failed (error page) |
| ArchUnit (Java) | no | 1.5.1, 25 Sep; 1.5.0 (04 Aug): "Support Java 27 / class file major version 71" | github.com/TNG/ArchUnit/releases | Exists |
| JDepend (Java) | no | No version or date shown | github.com/clarkware/jdepend | "JDepend traverses Java class and source file directories and generates design quality metrics for each Java package." Lists Ca, Ce, A, I, D and "Package Dependency Cycles". |
| ArchUnitNET (C#) | no | 0.13.4, 19 Aug | github.com/TNG/ArchUnitNET/releases | Exists |
| include-what-you-use (C/C++) | no | 0.26, 22 Mar, "Compatible with Clang 22." | github.com/include-what-you-use/include-what-you-use/releases | Exists |

The agent names no tool for Python, Java, C#, C or C++. It names only JavaScript-ecosystem tools plus Graphviz.

## 3. Module-resolution facts the agent's rules depend on

- **TypeScript `.js` specifiers.** The agent's Step 3 says only "Resolve I to absolute path", so every `./x.js` import in a TypeScript project under `nodenext` resolution points at a file that does not exist. The edge is silently dropped. This is the same defect as the repository's earlier grep-based dead-code scan, which ignored the `.js` specifier.
  > "If TypeScript determines that the runtime will perform a lookup for `./a.js` given the module specifier `"./a"`, then `./a.js` will undergo extension substitution, and resolve to the file `a.ts`"
- **TypeScript inline `type` modifier.** See the claims table: `import { type xyz } from "xyz"` is rewritten to `import {} from "xyz"`.
  > "any imports or exports without a `type` modifier are left around. Anything that uses the `type` modifier is dropped entirely."
- **Node's native modules (ESM).**
  > "A file extension must be provided when using the `import` keyword to resolve relative or absolute specifiers. Directory indexes (e.g. `'./startup/index.js'`) must also be fully specified."
- **CommonJS cycles.**
  > "Careful planning is required to allow cyclic module dependencies to work correctly within an application."
- **Python cycles: which import form fails** (https://docs.python.org/3/faq/programming.html, page header Python 3.14.8).
  > "Circular imports are fine where both modules use the "import <module>" form of import. They fail when the 2nd module wants to grab a name out of the first ("from module import name") and the import is at the top level."
  > "It is sometimes necessary to move imports to a function or class to avoid problems with circular imports."

  The agent's patterns `^from (\S+) import` and `^import (\S+)` only match imports at column 0. They miss exactly these function-level imports and every `if TYPE_CHECKING:` block, which the agent never mentions.
- **Go.** The compiler already rejects package cycles, so a Go cycle finding can only come from a mis-resolved graph. My spec fetch was truncated; this sentence comes from a search snippet of go.dev/ref/spec:
  > "It is illegal for a package to import itself, directly or indirectly, or to directly import a package without referring to any of its exported identifiers."
- **Java** (https://docs.oracle.com/javase/specs/jls/se25/html/jls-7.html).
  - Module cycles are a compile-time error: "if the current module directly or indirectly expresses a dependence on itself."
  - Same-package types need no import: "…have all the class declarations in package `points`, including all those in the current compilation unit, as their scope". `^import (\S+);` therefore misses every same-package edge.
  - Step 2 omits `import static`, although the later pattern list includes it.
  - The agent never mentions `module-info.java` or `requires`.
- **C#** (https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/using-directive).
  - A `using` names a namespace, not a file: "The `using` directive enables you to use types defined in a namespace without specifying the fully qualified namespace of that type."
  - "The `global` modifier has the same effect as adding the same `using` directive to every source file in your project."
  - Namespaces can also come from the project file: "`<Using Include="My.Awesome.Namespace" />`".
  - "The .NET 6 SDK also adds a set of *implicit* `global using` directives".
  - `^using (\S+);` misses `global using` and `using static`, and "resolve to absolute path" has no defined meaning for a namespace.

## 4. Who owns circular-dependency findings

The three agents do not agree. Two of them claim circular dependencies, and all three claim layer violations.

- **This agent (`agents/architecture/dependency-analyzer.md`)** claims cycles in its description and Role. It grades them by cycle length and says nothing about new versus pre-existing cycles.
- **`agents/quality/architecture-checker.md`** also claims them: description, Check 1, `type: "circular_dependency"`, and "Block if new cycles introduced". It has no length grading. Its Related Agents table lists `dependency-analyzer` only as "Detailed dependency graph analysis" and cedes nothing.
- **`agents/architecture/pattern-detector.md`** does not emit cycle findings. It uses "Circular dependencies between modules" only as a sign of spaghetti code. It does detect layer violations itself (Step 3, "Record violations of layer rules").
- **The dependency-analyzer skill** says architecture-checker owns the rules and the skill is the "detection layer". The architecture-checker agent itself contradicts that split.

Their verdicts conflict in four ways:
1. **Layer models and configuration files differ.** This agent uses `.dependency-rules.json` with controllers, services, repositories, domain, models and utils. Architecture-checker uses `.ctoc/architecture-rules.yaml` with presentation, business, data and shared.
2. **Domain is treated oppositely.** Architecture-checker puts domain in "business", which may import "data" (repositories). This agent forbids that edge.
3. **Severity of controller-to-repository differs.** This agent rates it high; architecture-checker's example rates "Presentation layer directly imports Data layer" medium.
4. **Architecture-checker contradicts itself on import depth:** "Max 5 levels" in one place, "Import depth > 7 | WARN" in another.

## 5. Gaps

**Missing failure classes**
- **Unresolved imports vanish silently.** The agent has no "could not resolve" bucket, so an unresolvable import disappears from the graph and "no cycles" can mean "could not look". madge's `--warning` exists for exactly this.
- **Dynamic imports.** Only literal `import('…')` is caught; computed specifiers are invisible. There is no counterpart to madge's `skipAsyncImports` or ESLint's `allowUnsafeDynamicCyclicDependency`.
- **Conditional and late imports** (Python imports inside functions, `TYPE_CHECKING`, try/except, `require` inside functions) are missed.
- **Side-effect imports.** Line 262 says `import './x.css'` counts as a dependency, but the Step 2 pattern requires `from`, so it misses the agent's own example.
- **Multi-line imports and exports** are missed: the patterns are line-based.
- **Barrel files.** There is no rule for whether a cycle that exists only through a barrel file counts.
- **Monorepos.** `exports` maps, `#` subpath imports and TypeScript project references are not handled.
- **Generated code** is not in the default exclusions; it appears only in the example custom-rules file.
- **Isolated modules.** I = Ce/(Ca+Ce) is undefined when Ca + Ce = 0. Martin does not address it either, so the agent has to define it.

**Martin's metrics only half applied**
- The stable-dependencies check (each edge must point to lower I), abstractness and distance from the main sequence are all missing. The agent computes I and then penalises its magnitude, which no source supports.
- Martin's caveat goes unrespected: "I would deeply regret it if anybody suddenly decided that all their designs must unconditionally be conformant". The agent applies hard thresholds anyway.

**Internal contradictions**
- In the default layer table, no layer lists `domain` as importable. Every import of domain is therefore a violation, while the diagram allows imports to flow down into it.
- The "infrastructure" violation example cannot be produced by the default rules, which have no infrastructure layer.
- The direction matrix's three highlighted violations differ from the three violations listed in the report.
- A reverse (upward) import is rated medium, while a downward import that skips a layer is rated high.
- The depth-first search pseudocode does not list every distinct cycle and reports rotations of the same cycle as separate cycles.

**Orders the tools cannot carry out, or that the body never instructs**
- The cycle search and the metrics need real computation. Only `Bash` can provide that, and the body never says to write and run a script.
- "Cache dependency graph between runs", Comparison Mode and the recency bonus all need stored earlier runs or git history. No storage location or command is named.
- `Grep(…, type="ts,js")` passes a comma list where the tool takes a single ripgrep type. I believe this is invalid; I did not run it.

**Running-mechanism claims**
- This agent claims no running refinement loop.
- The skill does: "Refinement Loop — critic mode" and "Findings block phase advancement". `docs/REFINEMENT_LOOP.md` line 8 says the loop is "**NOT RUNNING** today". Flag this for the skill round.

**Untrusted input**
- The agent never says that file contents are data and never instructions.
- `.dependency-rules.json` → `allowedCycles` lets the scanned repository suppress cycle findings. The header only reports "which rules are being used", not what they suppressed.

**Labels and gate numbers**
- No gate numbers appear in the agent. The skill has "BLOCK at Gate 3" (its line 41). Architecture-checker uses "Tier 3" and `ctoc quality --tier3`, a command I believe does not exist; not checked.
- The agent's prose uses "CI/CD", "DFS", "CQRS" and "repos" unexpanded. These are common acronyms, not invented ones, but the house rule says to spell them out.

**Language coverage**
- The agent has no C, C++ or SQL; the skill does. It covers Go, Rust and PHP instead.
- The PHP pattern treats a `namespace` declaration as a dependency (my reasoning; PHP documentation not read).

## 6. Not verified, for the gaps pass

Fetch count: 27 of 32 (one failed: pydeps; two fetches of the madge README were needed to get usable text). Web searches: 7.

**Claims**
- madge 8.0.0 release date, the output shape of `--circular --json`, and madge's exit code when it finds cycles.
- The year of eslint-plugin-import 2.32.0 (search says 2025), and its ESLint 10 compatibility (search only).
- The Go spec sentence (search snippet only; the fetch was truncated).
- "cannot be tree-shaken" (no bundler documentation read).
- The false-green in the pre-commit hook, and the invalid Grep `type` list (both reasoned, not executed).
- Java 25 `import module` declarations.
- C# `<ProjectReference>` cycles in MSBuild.
- Cargo and Rust cycle rules.
- PHP `use` and `namespace` semantics.
- C and C++ `#include` and C++20 `import`.

**Martin's other primary texts**
- The 1997 "Stability" C++ Report and the "Agile Software Development" and "Clean Architecture" chapters. I used the 1994 paper and the 2000 text instead.

**Tools not reached**
- JavaScript ecosystem: eslint-plugin-import-x (search only), skott, knip, `jq`, Mermaid.
- Workspace files: lerna.json, pnpm-workspace.yaml, npm `"workspaces"`.
- Graphviz version (search only) and babel-plugin-module-resolver (search only).
- Python: pydeps (fetch failed), tach, pylint cyclic-import, grimp.
- Java: jdeps, jQAssistant, Sonar.
- C# and .NET: NDepend, NsDepCop, dotnet-depends.
- C and C++: cppdepend, clang-tidy misc-include-cleaner, CMake `--graphviz`, cinclude2dot, cpp-dependencies.

Files read:
- <home>/Code/ctoc/agents/architecture/dependency-analyzer.md
- <home>/Code/ctoc/skills/architecture/dependency-analyzer/SKILL.md
- <home>/Code/ctoc/agents/quality/architecture-checker.md
- <home>/Code/ctoc/agents/architecture/pattern-detector.md
- <home>/Code/ctoc/docs/REFINEMENT_LOOP.md

Sources:
- [Martin 1994, OO Design Quality Metrics](https://linux.ime.usp.br/~joaomm/mac499/arquivos/referencias/oodmetrics.pdf)
- [Martin 2000, Design Principles and Design Patterns](https://staff.cs.utu.fi/~jounsmed/doos_06/material/DesignPrinciplesAndPatterns.pdf)
- [madge README](https://raw.githubusercontent.com/pahen/madge/master/README.md)
- [madge registry](https://registry.npmjs.org/madge)
- [import/no-cycle](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md)
- [import/no-restricted-paths](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md)
- [eslint-plugin-import releases](https://github.com/import-js/eslint-plugin-import/releases)
- [libraries.io eslint-plugin-import](https://libraries.io/npm/eslint-plugin-import)
- [eslint-plugin-import-x on npm](https://www.npmjs.com/package/eslint-plugin-import-x)
- [TypeScript verbatimModuleSyntax](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html)
- [TypeScript modules reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html)
- [Node.js ESM](https://nodejs.org/api/esm.html)
- [Node.js modules](https://nodejs.org/api/modules.html)
- [Python programming FAQ](https://docs.python.org/3/faq/programming.html)
- [Go specification](https://go.dev/ref/spec)
- [Java Language Specification SE 25, chapter 7](https://docs.oracle.com/javase/specs/jls/se25/html/jls-7.html)
- [C# using directive](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/using-directive)
- [Graphviz command line](https://graphviz.org/doc/info/command.html)
- [Graphviz download](https://graphviz.org/download/)
- [babel-plugin-module-resolver on npm](https://www.npmjs.com/package/babel-plugin-module-resolver)
- [dependency-cruiser releases](https://github.com/sverweij/dependency-cruiser/releases)
- [import-linter on PyPI](https://pypi.org/project/import-linter/)
- [actions/checkout releases](https://github.com/actions/checkout/releases)
- [ArchUnit releases](https://github.com/TNG/ArchUnit/releases)
- [JDepend](https://github.com/clarkware/jdepend)
- [ArchUnitNET releases](https://github.com/TNG/ArchUnitNET/releases)
- [include-what-you-use releases](https://github.com/include-what-you-use/include-what-you-use/releases)

<!-- redaction marker: personal information replaced with placeholders on 2026-10-05 (<home> for the home folder, <scratchpad> for the session scratch folder). -->
