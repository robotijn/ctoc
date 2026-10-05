# s6 agent round 1 — validation of the critique's proposed text — citation-validator report (verbatim)

Dispatch d-s6-agent-r1-validate, received 2026-10-01 15:30 CEST; 17 fetches. 38 old texts all unique and disjoint; 6 claim failures, 10 consistency defects, 9 skill-copied lines → 20 leftovers. Saved by the session without edits.

---

# Validation of the round-1 critique for the dependency-analyzer agent (dispatch d-s6-agent-r1-validate)

The critique can be applied mechanically: all 38 `old` texts occur exactly once in the agent file and none overlap. It should not be applied as written. Six claims in the new texts fail against their sources, five parts of the new texts contradict each other or text the critique leaves unchanged, and the new texts repeat 9 lines that are also in the skill file. Exact corrections are in section 5. I edited nothing.

## 1. Old-text check

Method:
- I read the agent file (`<home>/Code/ctoc/agents/architecture/dependency-analyzer.md`) and the critique side by side.
- Neither file contains a tab or a trailing space.
- I compared every line whose indentation or internal spacing matters with exact, anchored searches in both files: the aligned `#` comments in Step 6, Step 5 and the Scoring Formula, the four indented script lines, and the 2-space and 3-space list items. Each matched once in the agent file.
- I checked by count that every heading or one-line `old` occurs once.

| Finding | Pair | Agent lines | Once? | Overlap? |
|---|---|---|---|---|
| 1 | — | 16–22 | yes | no |
| 2 | — | 3 | yes | no |
| 3 | a | 26–34 | yes | no |
| 3 | b | 191–211 | yes | no |
| 3 | c | 649–684 | yes | no |
| 3 | d | 982–1018 | yes | no |
| 4 | a | 173–181 | yes | no |
| 4 | b | 232–246 | yes | no |
| 5 | — | 126–150 | yes | no |
| 6 | — | 71–101 | yes | no |
| 7 | — | 109–124 | yes | no |
| 8 | — | 152–171 | yes | no |
| 9 | — | 784–796 | yes (`**Handling:**` also appears at 393, but this span as a whole is unique) | no |
| 10 | a | 1048–1095 | yes | no |
| 10 | b | 1123–1135 | yes | no |
| 11 | a | 492–503 | yes | no |
| 11 | b | 507 | yes | no |
| 11 | c | 522 | yes | no |
| 11 | d | 529 | yes | no |
| 11 | e | 546 | yes | no |
| 11 | f | 560–569 | yes | no |
| 11 | g | 571 | yes | no |
| 11 | h | 582–597 | yes | no |
| 11 | i | 599–615 | yes | no |
| 11 | j | 617–646 | yes | no |
| 12 | — | 858–861 | yes | no |
| 13 | — | 36–48 | yes | no |
| 14 | — | 863–880 | yes | no |
| 15 | — | 393–402 | yes | no |
| 16 | — | 739–741 | yes | no |
| 17 | — | 761–767 | yes | no |
| 18 | — | 56–68 | yes | no |
| 19 | — | 427–431 | yes | no |
| 20 | — | 248 | yes | no |
| 21 | — | 931–934 | yes | no |
| 22 | a | 1023 | yes | no |
| 22 | b | 1035–1045 | yes | no |
| 23 | — | 483 | yes | no |

- **Order of application:** no new text contains another pair's `old`, so applying the pairs one after another is safe.
- **Apply once only:** the new texts of findings 20, 22a and 23 begin with their own `old`. Applying any of them twice would insert the text twice.

## 2. Claims in the new texts

All sources were read on 2026-10-01. I opened both Martin PDFs page by page and read the printed page headers.

| Finding | Claim | Verdict | Source and sentence read |
|---|---|---|---|
| 3b | Martin 2000, page 18: "The dependencies betwen packages must not form cycles." | VERIFIED, including the typo "betwen" | Mirror of the PDF at staff.cs.utu.fi; page header "18" |
| 3b | Martin 2000, page 20: "This is clearly disastrous." | VERIFIED | Page header "20" |
| 3b | "Of a cycle through **six** packages he writes" | **MISATTRIBUTED.** The cycle in Figure 2-22 runs through five packages: GUI, Comm, Modem Control, Protocol and Comm Error. Six is the number of packages Protocol must then be built with. | Page 20: "They have to build their test suite with CommError, GUI, Comm, ModemControl, Analysis, and Database! This is clearly disastrous." |
| 3b, 11c | Node.js CommonJS sentence on circular `require()` | VERIFIED | nodejs.org/api/modules.html, section "Cycles": "When there are circular `require()` calls, a module might not have finished executing when it is returned." |
| 3b | Python FAQ sentence on circular imports | VERIFIED word for word | docs.python.org/3/faq/programming.html (page header 3.14.8) |
| 4a | Martin 1994, page 6: definitions of afferent and efferent coupling | VERIFIED | "The number of classes outside this category that depend upon classes within this category." / "The number of classes inside this category that depend upon classes outside this categories." |
| 4a | Martin 2000, page 24: definition of efferent coupling | VERIFIED. The full sentence goes on with "(i.e. outgoing dependencies)". | "The number of classes outside the package that classes inside the package depend upon." |
| 4a | Martin 2000, page 24: "Depend upon packages whose I metric is lower than yours." | VERIFIED | Page 24 |
| 4a | Martin 1994, page 8: "a metric is not a god…" | VERIFIED. The sentence opens with "However,". | Page 8 |
| 4b | Martin 2000, page 24: I = 0 and I = 1 sentences | VERIFIED, with "incomming" and "instable" as printed | Page 24 |
| 4b | Martin 2000, page 24: "Indeed, we greatly desire…" | VERIFIED | Page 24 |
| 4b | Martin 1994, page 7: "Consider a category with A=0 and I=0. … rigid." | VERIFIED. The ellipsis stands for "This is a highly stable and concrete category." | Page 7 |
| 6 | The Grep tool rejects `type="ts,js"` with "unrecognized file type" | VERIFIED by running it in this session | Tool output: "rg: unrecognized file type: ts,js" |
| 6 | The Grep tool accepts `glob="**/*.{ts,tsx,js,jsx}"` | VERIFIED by running it in this session (it returned matches) | — |
| 6 | Java Language Specification SE 25, chapter 7: same-package scope fragment | VERIFIED as a fragment of section 7.6, Example 7.6-2 | "Because the classes `Point` and `PointColor` have all the class declarations in package `points`, including all those in the current compilation unit, as their scope, this program compiles correctly." |
| 6 | C# `global` sentence and `<Using Include>` | VERIFIED | learn.microsoft.com, the `using` directive page: "The `global` modifier has the same effect as adding the same `using` directive to every source file in your project." / "…adding a `<Using>` item to your project file, for example, `<Using Include="My.Awesome.Namespace" />`." |
| 7 | TypeScript: "`./a.js` will undergo extension substitution, and resolve to the file `a.ts`", offered as proof that an import of `./a.js` resolves to `a.ts` | **MISATTRIBUTED.** The words are verbatim, but the sentence they come from is about the specifier `"./a"`, which has no extension. The fact itself is real and is stated by another sentence on the same page. | Full sentence: "If TypeScript determines that the runtime will perform a lookup for `./a.js` given the module specifier `"./a"`, then `./a.js` will undergo extension substitution, and resolve to the file `a.ts` in this example." The supporting sentence: "This means that TypeScript can resolve to a `.ts` or `.d.ts` file even if the module specifier explicitly uses a `.js` file extension" |
| 7 | Extension pairs `.mjs`→`.mts`, `.cjs`→`.cts` | VERIFIED from the "File extension substitution" table | Table rows: `.js` → `.ts`, `.tsx`, `.d.ts`, `.js`, `.jsx`; `.mjs` → `.mts`, `.d.mts`, `.mjs`; `.cjs` → `.cts`, `.d.cts`, `.cjs` |
| 7 | Extension pair `.jsx`→`.tsx`, and no `.js`→`.tsx` | **UNSOURCEABLE / incomplete.** The table has no `.jsx` row, and it maps `.js` to `.tsx` as its second lookup. Under the critic's rule a `./Button.js` import of `Button.tsx` lands on the could-not-resolve list when it should resolve. | Same table |
| 7 | Node.js quotation: "If specifier starts with "#", resolution is handled by the PACKAGE_IMPORTS_RESOLVE algorithm, which checks the package's "imports" field." | **FABRICATED as a quotation.** Two routes found no such sentence: the rendered esm page ("NOT FOUND") and the raw `doc/api/esm.md` on the main branch ("PHRASE ABSENT"). Both went through the fetch tool's summarizer. The fact is real: the resolution algorithm step reads "Otherwise, if specifier starts with "#", then Set resolved [to] the result of PACKAGE_IMPORTS_RESOLVE(…)". | A real replacement, nodejs.org/api/packages.html, section "Subpath imports": "Entries in the `"imports"` field must always start with `#` to ensure they are disambiguated from external package specifiers." |
| 7 | `node -` reads the script from standard input | VERIFIED | nodejs.org/api/cli.html, entry `-`: "Alias for stdin. … the script is read from stdin, and the rest of the options are passed to that script." |
| 9 | TypeScript `verbatimModuleSyntax`: "// Erased away entirely. import type { A } from "a";" and "// Rewritten to 'import {} from "xyz";' import { type xyz } from "xyz";" | VERIFIED. Two code lines are joined by a space in each quote. | typescriptlang.org/tsconfig/verbatimModuleSyntax.html |
| 10a | madge README: `fileExtensions`, default `['js']` | VERIFIED | "fileExtensions \| Array \| ['js'] \| Valid file extensions used to find files in directories" |
| 10a | `skipTypeImports` under "How to ignore `import` in type annotations in TypeScript?" | VERIFIED, with `"ts": { "skipTypeImports": true }` | Same README. A separate heading for ES6 and Flow uses the `"es6"` key. The README's example for dynamic imports sets its option under both `"ts"` and `"tsx"`. |
| 10a | `--extensions` takes a comma-separated list | VERIFIED by two routes | README usage line "madge --extensions js,jsx path/src". The `<list>` spelling comes from `cli.js`, as quoted in the gaps note; I did not re-fetch it. |
| 10a | "set it so madge counts what this agent counts" | **UNVERIFIABLE overclaim** | The README's snippet covers only `"ts"`. Whether `.tsx` files need their own key for this option is not documented. Whether madge skips `import { type X }`, which this agent counts as a runtime import, was not checked. |
| 10a | "Each one fails closed" | **Overclaim of scope.** The sentence sits over the whole section, which still contains the unchanged ESLint rules (lines 1097–1121). Nothing shows that those fail closed. | — |
| 10a | madge 8.0.0 run behaviour: 0 files and exit 0, `--warning` does not fail the run, exit 1 on a cycle, an array of arrays from `--json`, `jq '.length'` erroring | VERIFIED by the session's runs 1–4 and 6 and its raw `jq` read, which are authoritative | `s6-agent-round1-session-runs.md` |
| 10a | madge 8.0.0 exists and was published 2024-08-05 | VERIFIED by the session's raw read: `2024-08-05T07:49:35.718Z`, `dist-tags.latest` 8.0.0 | Not re-fetched |
| 10a | `actions/checkout@v7` exists as a tag | VERIFIED | github.com/actions/checkout/tags lists "v7" (Jul 17, 2026) separately from "v7.0.1" |
| 15 | Node ESM directory-index sentence | VERIFIED | esm page, section "Mandatory file extensions": "Directory indexes (e.g. `'./startup/index.js'`) must also be fully specified." |
| 16 | "TypeScript follows Node.js's package.json "exports" spec when resolving from a package directory" | **MISATTRIBUTED (a condition was dropped).** The words are a substring of a conditional sentence. | Full sentence: "When `moduleResolution` is set to `node16`, `nodenext`, or `bundler`, and `resolvePackageJsonExports` is not disabled, TypeScript follows Node.js's package.json `"exports"` spec when resolving from a package directory triggered by a bare specifier `node_modules` package lookup." |
| 1, 17 | The sibling agents named exist and own what the new texts say | VERIFIED in the repository | Descriptions of `quality/architecture-checker` ("…at stage transitions"), `architecture/pattern-detector`, `security/dependency-checker` ("Audits dependencies for vulnerabilities, outdated versions, and license issues") and `cto-chief`. A further sibling, `security/dependency-auditor`, overlaps on outside packages and is not named. |

None of the pages or files I read contained text addressed to a reviewer.

## 3. Wrapper contract

- **Description (finding 2):**
  - It is one line.
  - The value contains no `: ` and no ` #`.
  - All nine dispatch phrases are present, unchanged: dependency analysis, module dependencies, dependency graph, circular dependency, module boundary, import graph, afferent coupling, efferent coupling, instability metric.
  - **Pass.**
- **Approval markers:** no `approved_by`, `human_gate` or `review_gate`, and no gate number, appears in any new text. **Pass.**
- **Lines repeated from the skill: FAIL.** Nine trimmed lines of 25 or more characters appear in both the new texts and `<home>/Code/ctoc/skills/architecture/dependency-analyzer/SKILL.md`. All nine were kept from the current agent file, not newly copied, but the check fires.

  | Finding | Line in the new text | Skill line |
  |---|---|---|
  | 3a | `\| Detection Type \| Severity \| Penalty \| Example \|` | 64 |
  | 3a | `\|----------------\|----------\|---------\|---------\|` | 65 |
  | 11a | `\| Metric \| Value \| Status \|` | 303 |
  | 11a | `\|--------\|-------\|--------\|` | 304 |
  | 11a | `\| Layer Violations \| 3 \| WARNING \|` | 306 |
  | 7 | `### Step 3: Build Dependency Graph` | 101 |
  | 5 | `### Step 4: Detect Circular Dependencies` | 104 |
  | 8 | `### Step 5: Detect Layer Violations` | 111 |
  | 4a | `### Step 6: Calculate Coupling Metrics` | 123 |

## 4. Internal consistency

**Holds:**
- **Score:** 10 − 2×1.0 (two runtime cycles) − 0.4 (Violation 3, upward) − 2×0.3 (Violations 1 and 2) − 0.2 (payments importing orders) = 6.8, in the Fair band. Formula, table, worked example and summary agree.
- **Instability values:** recomputed from each module's afferent and efferent counts, they come to 0.20, 0.44, 0.70, 0.43 and 0.00, matching the table.
- **Layer rules:** Step 5's direction rule, the new table and the new section 2 agree (upward is high and costs 0.4, any other forbidden import is medium and costs 0.3).
- **Worked example:** the direction matrix's forbidden cells equal Violations 1 to 3. The order of the priority list and of the recommendations follows the new Priority Scoring rule.
- **Accepted cycles:** the "exactly its files" rule agrees across the new section 1, Step 4 and the Custom Layer Rules behaviour.
- **Directory resolution:** Step 3's extensionless order and the index order in the Barrel Files section match.

**Defects:**
1. **High.** Step 3 sends Go, Rust and PHP imports to rule 8 ("external, not a node"). Step 2 extracts them, but no resolution rule claims them, so they drop out of the graph without reaching the could-not-resolve list. A Go, Rust or PHP codebase would then get a bare "no cycles found", which is the false pass this round is meant to remove.
2. **Medium.** Step 2 requires Python's `ast` module, while Step 3 lets the script be Node.js only. When only Node.js is installed, Python files are left with no stated handling.
3. **Medium.** The Monorepo text (finding 16) contradicts Step 3 (finding 7) for a workspace whose entry file was never built. Step 3 says such an import goes on the could-not-resolve list; finding 16 says it becomes a package-level node.
4. **Medium.** Step 6 says "the graph's nodes are files", but Step 3 makes Java nodes packages and C# nodes namespaces.
5. **Medium.** The partition rule in finding 19 conflicts with the unchanged per-language lists at lines 413–423: "Top-level directories under `src/`" for Python, "Each directory = package" for Go, and "Maven/Gradle modules" for Java. The file does not say which one wins.
6. **Medium.** Step 5 treats `controllers` and `handlers` as separate layers. An import between them is not in the allowed list and is not upward, so it is reported as a medium "other forbidden" violation, although the diagram puts both at the same level.
7. **Medium.** Finding 14 sets the comparison's current score to 6.8, which ties the example to the worked report. The unchanged lines 882–891 then contradict that report: they list UserService <-> AuthService as resolved, although it is Cycle 1 in the report, and they list a new violation, CheckoutService -> InventoryController, that is not among the report's three.
8. **Low.**
   - The Fix Stable-Dependencies Violations recommendation is labelled "(Medium Priority)", but the severity of a stable-dependencies violation is Low.
   - The worked example's Cycle 2 passes through an `inventory/` module that is missing from the coupling table, so the reader cannot check the stable-dependencies count of 1.
   - The modules under `src/modules/*` only exist under the finding-19 partition if those directories have index files, and the example does not say they do.
9. **Low.** Step 2 does not mark `export type { … } from` as type-only.
10. **Low.** The summary says "Coupling Score" for what the score section calls "Overall Score".

## 5. Leftovers: exact corrections

In every pair, `old` is verbatim from the critic's new text, except pair 14, whose `old` is from the agent file.

**Claim failures**

1. Finding 3b
   - old: `Of a cycle through six packages he writes "This is clearly disastrous."`
   - new: `Of a single added dependency that closed a cycle through five packages, after which releasing one package meant building it with six others, he writes "This is clearly disastrous."`

2. Finding 7, rule 1
   - old: ``If no file exists at that path and the specifier ends in `.js`, `.mjs`, `.cjs` or `.jsx`, try the same path ending in `.ts`, `.mts`, `.cts` or `.tsx`: TypeScript resolves an import of `./a.js` to `a.ts` ("`./a.js` will undergo extension substitution, and resolve to the file `a.ts`", TypeScript modules reference, https://www.typescriptlang.org/docs/handbook/modules/reference.html, read 2026-10-01).``
   - new: ``If no file exists at that path, substitute the extension as TypeScript does: for `.js` try `.ts`, then `.tsx`; for `.mjs` try `.mts`; for `.cjs` try `.cts`. "This means that TypeScript can resolve to a `.ts` or `.d.ts` file even if the module specifier explicitly uses a `.js` file extension" (TypeScript modules reference, section File extension substitution, https://www.typescriptlang.org/docs/handbook/modules/reference.html, read 2026-10-01). That section's table has no row for `.jsx`, so a `.jsx` specifier is resolved as written.``

3. Finding 7, rule 3
   - old: `("If specifier starts with "#", resolution is handled by the PACKAGE_IMPORTS_RESOLVE algorithm, which checks the package's "imports" field.", Node.js documentation, https://nodejs.org/api/esm.html, read 2026-10-01)`
   - new: ``("Entries in the `"imports"` field must always start with `#` to ensure they are disambiguated from external package specifiers.", Node.js packages documentation, section Subpath imports, https://nodejs.org/api/packages.html, read 2026-10-01)``

4. Finding 16
   - old: `("TypeScript follows Node.js's package.json "exports" spec when resolving from a package directory", TypeScript modules reference, https://www.typescriptlang.org/docs/handbook/modules/reference.html, read 2026-10-01)`
   - new: ``(TypeScript does this only under a condition: "When `moduleResolution` is set to `node16`, `nodenext`, or `bundler`, and `resolvePackageJsonExports` is not disabled, TypeScript follows Node.js's package.json `"exports"` spec when resolving from a package directory triggered by a bare specifier `node_modules` package lookup.", TypeScript modules reference, https://www.typescriptlang.org/docs/handbook/modules/reference.html, read 2026-10-01; this agent reads "exports" whatever the project's setting, because the graph describes structure)``

5. Finding 10a
   - old: `set it so madge counts what this agent counts.`
   - new: ``set it so madge skips `import type` edges, as this agent does. The README's example for dynamic imports sets its option under both "ts" and "tsx", so add the same "tsx" key here (not checked for this option). Whether madge then also skips an import whose every specifier has an inline `type` modifier, which this agent counts as runtime, was not checked.``

6. Finding 10a
   - old: `Each one fails closed: a missing tool, unreadable output, no source files, or a cycle all stop the build.`
   - new: `The two madge recipes below fail closed: a missing tool, unreadable output, no source files, or a cycle all stop the build. The ESLint rules after them were not checked for this.`

**Consistency defects**

7. Finding 7, rule 8 (defect 1)
   - old: `8. **Anything else** is external (section External vs Internal Dependencies) and is not a node.`
   - new:
     ```text
     8. **Go, Rust and PHP**: this file gives no resolution rule for them yet. Put every Go import whose path begins with the `module` path in `go.mod`, every Rust `use crate::`, `use self::`, `use super::` and `mod` item, and every PHP `use` on the could-not-resolve list with the reason "no resolution rule for this language", and name the language under "Limits of this run". Never classify them as external.
     9. **Anything else** is external (section External vs Internal Dependencies) and is not a node.
     ```

8. Finding 6 (defect 2)
   - old: ``Parse each file with Python's standard `ast` module instead of a pattern.``
   - new: ``Parse each file with Python's standard `ast` module instead of a pattern (run that part with `python3 -`); if Python is not installed, list the Python files under "Limits of this run" as present but not analyzed, never as free of imports.``

9. Finding 16 (defect 3)
   - old: `make the package itself one node named "@myorg/shared" and mark the edge "package-level" in the report.`
   - new: `make the package itself one node named "@myorg/shared" and mark the edge "package-level" in the report. If that file does not exist at all, also put the import on the could-not-resolve list (Step 3) with the reason "package entry point not built".`

10. Finding 4a (defect 4)
    - old: `Counting files is this file's own choice, because the graph's nodes are files and the importing file is known for every language.`
    - new: `Counting files is this file's own choice, because the importing file is known for every language, including Java and C#, where the graph's nodes are packages and namespaces (Step 3).`

11. Finding 19 (defect 5)
    - old: `graph's nodes (Step 3). Step 6 counts coupling over this partition.`
    - new:
      ```text
      graph's nodes (Step 3). Step 6 counts coupling over this partition. Where the per-language
      lists above say otherwise (Python top-level directories under src/, Go directories, Maven or
      Gradle modules), this partition wins.
      ```

12. Finding 8 (defect 6)
    - old: `    if from_layer == to_layer: skip the edge`
    - new: `    if from_layer == to_layer, or both are "controllers" and "handlers": skip the edge (same level)`

13. Finding 11j (defect 8)
    - old: `3. **Fix Stable-Dependencies Violations** (Medium Priority)`
    - new: `3. **Fix Stable-Dependencies Violations** (Low Priority)`

14. A new pair against the agent file, lines 882–891 (defect 7)
    - old:
      ```text
      ### Resolved Issues
      1. UserService <-> AuthService cycle: Fixed by extracting AuthHelpers
      2. OrderController -> OrderRepository: Now uses OrderService
      3. PaymentService -> PaymentController: Removed reverse dependency

      ### New Issues
      1. CheckoutService -> InventoryController (new layer violation)

      ### Unchanged Issues
      1. Order module cycle (OrderService -> InventoryService -> PaymentService -> OrderService)
      ```
    - new:
      ```text
      ### Resolved Issues
      1. ReportService <-> ExportService cycle: Fixed by extracting ExportHelpers
      2. OrderController -> OrderRepository: Now uses OrderService
      3. PaymentService -> PaymentController: Removed reverse dependency

      ### New Issues
      1. NotificationService -> UserController (new upward layer violation)

      ### Unchanged Issues
      1. Order module cycle (OrderService -> InventoryService -> PaymentService -> OrderService)
      2. UserService <-> AuthService cycle
      ```

15. Finding 11h (defect 8)
    - old:
      ```text
      | orders/ | 15 | 3 | 7 | 0.70 | no |
      | payments/ | 6 | 4 | 3 | 0.43 | yes: orders/ |
      ```
    - new:
      ```text
      | orders/ | 15 | 3 | 7 | 0.70 | no |
      | inventory/ | 5 | 3 | 3 | 0.50 | no |
      | payments/ | 6 | 4 | 3 | 0.43 | yes: orders/ |
      ```
    - The inventory value is 3 / 6 = 0.50. It lies between 0.43 and 0.70, so neither of its edges in the cycle is a violation.
    - Also in finding 11h:
      - old: `Ce = files inside the module that import another module.`
      - new: `Ce = files inside the module that import another module. Each directory under src/modules/ has an index.ts, so each is its own module (section Module Boundary Detection).`

16. Finding 6 (defect 9)
    - old: ``The kind is `type-only` only for a declaration-level `import type { … } from '…'`;``
    - new: ``The kind is `type-only` only for a declaration-level `import type { … } from '…'` or `export type { … } from '…'`;``

17. Findings 11a and 14 (defect 10, optional)
    - In finding 11a:
      - old: `| Coupling Score | 6.8/10 | FAIR |`
      - new: `| Overall Score | 6.8/10 | FAIR |`
    - In finding 14:
      - old: `| Coupling Score | 5.2/10 | 6.8/10 | +1.6 (IMPROVED) |`
      - new: `| Overall Score | 5.2/10 | 6.8/10 | +1.6 (IMPROVED) |`

**Lines repeated from the skill**

18. Finding 3a
    - old:
      ```text
      | Detection Type | Severity | Penalty | Example |
      |----------------|----------|---------|---------|
      ```
    - new:
      ```text
      | Finding | Severity | Penalty | Example |
      |---------|----------|---------|---------|
      ```

19. Finding 11a
    - old:
      ```text
      | Metric | Value | Status |
      |--------|-------|--------|
      ```
    - new:
      ```text
      | Measure | Value | Status |
      |---------|-------|--------|
      ```
    - Also in finding 11a:
      - old: `| Layer Violations | 3 | WARNING |`
      - new: `| Layer Violations (upward and other forbidden) | 3 | WARNING |`

20. Step headings. Nothing refers to these headings by their titles, only by step number, so renaming them is safe.

    | Finding | old | new |
    |---|---|---|
    | 7 | `### Step 3: Build Dependency Graph` | `### Step 3: Resolve Imports and Build the Graph` |
    | 5 | `### Step 4: Detect Circular Dependencies` | `### Step 4: Find Cycles as Strongly Connected Components` |
    | 8 | `### Step 5: Detect Layer Violations` | `### Step 5: Check Imports Against the Layer Rules` |
    | 4a | `### Step 6: Calculate Coupling Metrics` | `### Step 6: Compute Coupling, Instability and Stable-Dependencies Violations` |

## 6. Not verified, and fetch count

**Fetches:** 17 of the 20 allowed, and no web searches. The two Martin PDFs were saved by the fetch tool and read page by page.

**Not verified:**
- That `python3 -` reads a script from standard input. I believe it does; I did not fetch it.
- What the `ast` module catches inside functions, and that `typing.TYPE_CHECKING` is false at runtime. Both are believed.
- That madge prints `[]` when it finds no cycles. This is believed from the gaps note's reading of madge's `output.js`.
- That `skipTypeImports` works under a `tsx` key.
- That madge resolves a `./x.js` import in a TypeScript project to `x.ts` without a TypeScript configuration option. This is a risk: in a project using NodeNext resolution, the new recipes could miss cycles that way.
- The new pre-commit hook in its four states (with a cycle, without one, with madge absent, with an empty `src/`), and `npx -y madge@8` on GitHub's Ubuntu runner. I have no shell, so none of these ran.
- Which ripgrep file types `ts` and `js` cover. Believed.
- The Node.js `#` sentence: its absence rests on two routes that both went through the fetch tool's summarizer. If a raw read ever finds it, restore the critic's quotation.

**Files read:**
- `<home>/Code/ctoc/agents/architecture/dependency-analyzer.md`
- `<home>/Code/ctoc/skills/architecture/dependency-analyzer/SKILL.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round1-critic-d-s6-agent-r1-critic.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round1-research-d-s6-agent-r1-research.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round1-research-gaps-d-s6-agent-r1-research-gaps.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round1-session-runs.md`

Sources:
- [Martin 2000, Design Principles and Design Patterns](https://staff.cs.utu.fi/~jounsmed/doos_06/material/DesignPrinciplesAndPatterns.pdf)
- [Martin 1994, OO Design Quality Metrics](https://linux.ime.usp.br/~joaomm/mac499/arquivos/referencias/oodmetrics.pdf)
- [madge README](https://raw.githubusercontent.com/pahen/madge/master/README.md)
- [TypeScript modules reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html)
- [TypeScript verbatimModuleSyntax](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html)
- [Node.js ESM](https://nodejs.org/api/esm.html)
- [Node.js esm.md raw](https://raw.githubusercontent.com/nodejs/node/main/doc/api/esm.md)
- [Node.js packages](https://nodejs.org/api/packages.html)
- [Node.js modules](https://nodejs.org/api/modules.html)
- [Node.js command line](https://nodejs.org/api/cli.html)
- [Python programming FAQ](https://docs.python.org/3/faq/programming.html)
- [Java Language Specification SE 25, chapter 7](https://docs.oracle.com/javase/specs/jls/se25/html/jls-7.html)
- [C# using directive](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/using-directive)
- [actions/checkout tags](https://github.com/actions/checkout/tags)

<!-- redaction marker: personal information replaced with placeholders on 2026-10-05 (<home> for the home folder, <scratchpad> for the session scratch folder). -->
