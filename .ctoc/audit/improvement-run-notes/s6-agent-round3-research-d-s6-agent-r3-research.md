# s6 agent round 3 — research (raw re-reads, adversarial, regulators, consistency) — citation-validator report (verbatim)

Dispatch d-s6-agent-r3-research, received 2026-10-02 10:01 CEST; 16 fetches, 1 search. Saved by the session without edits.

---

# Dependency-analyzer agent, round 3 research: raw re-reads, adversarial inputs, regulators, consistency

All five load-bearing citations match their sources, apart from two newlines that the file renders as spaces. The re-reads did turn up one wrong claim: rule 1 says it substitutes extensions "as TypeScript does", but TypeScript tries `.ts` before the path as written and the file does the reverse. The adversarial pass found **three silent-loss paths**, where an import drops out of the graph with no trace:
- An unread or inherited `tsconfig` alias falls through to "external".
- A C# `using` inside a namespace that names a namespace relative to the enclosing one is treated as external.
- The madge recipes pass a cycle that closes through an alias.

It also found one **false "isolated" claim**: a Go, Rust or PHP module whose imports are all unresolved is reported as isolated. The text says nothing about how the script behaves at large scale (timeout, recursion depth, output that gets cut). Twelve consistency pairs follow. I edited nothing, made 16 web fetches and 1 web search, and had no shell.

## 1. Raw re-reads

I could not run curl. The PDFs were saved as raw bytes and I read their pages as images, with no summariser. The Markdown sources came from raw GitHub addresses but passed through the fetch tool's model.

| Quote in file | At the source | Verdict |
|---|---|---|
| Martin 1994, page 6, afferent coupling: "The number of classes outside this category that depend upon classes within this category." | "Ca : Afferent Couplings : The number of classes outside this category that depend upon classes within this category." | Match |
| Martin 1994, page 6, efferent coupling: "…inside this category that depend upon classes outside this categories." | Same, including the source's typo "categories" | Match |
| Martin 1994, page 8: "a metric is not a god; it is merely a measurement against an arbitrary standard." | "However, a metric is not a god; it is merely a measurement against an arbitrary standard." | Match (the lowercase "a" is correct mid-sentence) |
| Martin 1994, page 7 (extra): "Consider a category with A=0 and I=0. … Such a category is not desirable because it is rigid." | The ellipsis drops "This is a highly stable and concrete category." | Match |
| TypeScript `verbatimModuleSyntax`: "// Erased away entirely. import type { A } from "a";" | `// Erased away entirely.` then a **line break**, then `import type { A } from "a";` | Differs only in that the newline is written as a space |
| "// Rewritten to 'import {} from "xyz";' import { type xyz } from "xyz";" | The same comment, then a **line break**, then the import | Same newline-to-space difference |
| Node.js `packages.md`: "Entries in the `"imports"` field must always start with `#` to ensure they are disambiguated from external package specifiers." | Identical, with a soft wrap after "they are" | Match |
| Object Management Group, clause 9.1, page 229: "Detection pattern score is the count of occurrences, / Weakness score is its detection pattern score, / Quality characteristic score is the sum of its weakness scores." | Three bullets with exactly these words and trailing punctuation. The clause is headed "9.1 Calculation of the Base Measures (Normative)". | Match. The " / " separators are the file's own. |
| Clause 10.1, page 231 (extra): "…not derived from any existing standards and are therefore not normative." | Identical. Table 6's caption is "Informative Weighting Schemes for Security Measurement". | Match |
| Falleri, page 2: "does not provide further information to understand and remove the cycles" | "The above algorithm becomes useless in such cases as it does not provide further information to understand and remove the cycles." "Dozens of packages" and "without much consequences" are also present. | Match |
| Falleri, page 5: "for each dependency one of the shortest cycles going through the dependency" | "Therefore our final solution is to select for each dependency **one of the shortest cycles going through the dependency**." (the bold is the source's) | Match |
| Falleri, page 5 (extras): "can be exponential"; "a long cycle is harder to understand than a short one" | Both verbatim | Match |
| Martin 2000, pages 18, 20 and 24 (extra): "betwen", "This is clearly disastrous.", the efferent-coupling definition, "incomming… instable", the stable-dependencies rule, "Indeed, we greatly desire…" | All verbatim. Figure 2-22 and the list "CommError, GUI, Comm, ModemControl, Analysis, and Database" confirm the file's paraphrase (two rings of four, five packages, six others). | Match |
| TypeScript modules reference (extra): "This means that TypeScript can resolve to a `.ts` or `.d.ts` file…"; the `exports` sentence | Both verbatim; the source ends the first with ":" | Match. **But the table under the first sentence contradicts rule 1's order: see consistency pair C10.** |
| Java Language Specification SE 25 (extra): "…as their scope" | Verbatim, in section 7.6, Example 7.6-2 | Match |

## 2. Adversarial inputs

| Input | What the text says | Gap | Minimal sentence |
|---|---|---|---|
| Both `.dependency-rules.json` and `.ctoc/architecture-rules.yaml` exist | Nothing about the YAML file. `agents/quality/architecture-checker.md` lines 75–94 and 257 read the YAML, with a different schema and a different layer design: it puts `src/models/**` in a "data" layer that presentation may not import. This file's defaults allow a controller to import a model (line 184). | The two agents give opposite layer verdicts on the same import, and neither says so. Which file wins is a decision across agents, so it goes to you; I make no recommendation. | "This agent does not read `.ctoc/architecture-rules.yaml`, the rules file of `quality/architecture-checker`; when it exists, the report header says so, because the checker's layer verdicts come from it and can differ from this report's." |
| An `allowedCycles` entry that holds a glob or a `..` path | "exactly its `files` list" (line 897) | A glob never equals a path, so the cycle stays high. That fails safe. But no rule normalises a `./` prefix or `..`, so a correct entry can silently never match, and nothing reports an entry that matched nothing. A script that expands globs could accept too much. | "Compare `files` entries as repository-relative paths after removing a leading `./` and resolving `..`; an entry containing `*`, `?` or `[`, or one that leaves the repository, matches nothing; list every entry that matched no cycle under "Limits of this run"." |
| Overlapping `paths` patterns `@/*` and `@/lib/*` | "Replace alias with mapped path" (line 737 and after); no precedence | `@/lib/x` can map through `@/*`. TypeScript: "When multiple patterns match a module specifier, the pattern with the longest matching prefix before any `*` token is used"; "If resolution fails for one path, the next one in the array will be attempted…"; values are resolved against `baseUrl`, "Otherwise… relative to the `tsconfig.json` file that defines them." | "When several `paths` patterns match, use the one with the longest prefix before `*`, try each path in its array in order, and resolve them against `baseUrl`, else against the tsconfig file that defines them." |
| A `tsconfig.json` with comments, or with `paths` inherited through `extends`, or one per package | Silent | **Silent loss.** If the aliases are not read, rule 9 makes `@/x` external. It is not on the could-not-resolve list, so the report says a bare "no cycles found". I believe TypeScript accepts comments in tsconfig but did not verify it. | Rule 9 and the External section: "A bare specifier is external only when its package name is in a `package.json` dependency field or is a Node.js built-in module; any other goes on the could-not-resolve list with the reason "bare specifier that is not a declared dependency"." Plus: "Read tsconfig.json and jsconfig.json allowing comments and trailing commas, follow `extends`, and use the nearest one above the importing file." |
| An `exports` map with conditions, none of which names a scanned file | It becomes a package-level node, then "If that file does not exist at all…" (line 774) | "That file" is undefined when there are several conditions. The fallback "else its "main" field" (line 773) is wrong for a subpath. Node.js: "When the `"exports"` field is defined, all subpaths of the package are encapsulated and no longer available to importers." Pattern keys such as `./*` are not handled, and `#` imports with conditions are not either. | "When no condition names a scanned file, the file it names is the value of the first key, in object order, among `node`, `import`, `require` and `default` (Node.js: "earlier entries have higher priority"); a subpath that `"exports"` does not list, directly or through a `*` pattern, goes on the could-not-resolve list with the reason "not exported", never to `"main"`." |
| A Python namespace package (no `__init__.py`) | Rule 5 knows only `.py` files and `__init__.py` | `import a.b` lands on the could-not-resolve list: noise, not loss. Python also allows one namespace package to be split across several directories. In a monorepo the parts outside `src/` or the root are silently treated as external. | "A directory without `__init__.py` that an import names is a namespace package: importing it runs no file, so it gives no edge and is not an unresolved import." This is grounded in the Python reference, 5.2.2: "With namespace packages, there is no `parent/__init__.py` file. In fact, there may be multiple `parent` directories found during import search, where each one is provided by a different portion." |
| Java files in the default (unnamed) package | Silent. The node is named after the package, and this package has no name. | The node is undefined. Java Language Specification SE 25, 7.4.2: "A compact compilation unit, or an ordinary compilation unit that has no `package` declaration but has at least one other kind of declaration, is part of an _unnamed package_." | "A Java file with no `package` declaration belongs to one node named `(unnamed package)`; its uses of other unnamed-package types need no import and are not in the graph." |
| A C# file with several `namespace` blocks, nested blocks, or a file-scoped namespace | The script records "each namespace a C# file declares" (line 87) | Five things are undefined:<br>• which node a file-level `using` comes from;<br>• the name of a nested `namespace A { namespace B`;<br>• a node for types outside any namespace;<br>• **silent loss** when a `using` inside `namespace Company.App` names a namespace relative to it, such as `Services`, which rule 7 matches literally and sends to external. The specification resolves the name "as if the immediately containing compilation unit or namespace body had no *using_directive*s", which I take to mean normal lookup from the enclosing namespace. That reading is inferred, not taken from an example.<br>• A file-scoped namespace is simple: "You can't declare a nested namespace or a second file-scoped namespace". | "A `using` before the first namespace declaration gives an edge from every namespace the file declares; one inside a namespace block, or after a file-scoped namespace declaration, gives an edge from that namespace only and is resolved first as `<enclosing namespace>.<name>`, then against each shorter prefix of it, then as written; `namespace A { namespace B` declares `A.B`; types outside any namespace belong to one node named `(global namespace)`." |
| Two workspace packages that share a basename | "Module name = directory name or package name from manifest" (line 460). The worked table uses basenames such as `user/`. | Two `utils/` modules merge or overwrite each other's rows. | "Key every module by its repository-relative directory path; show a short name only when no other module has it." |
| (Found in passing) A root `package.json` in a single-package repository | The general heuristic: a manifest marks a boundary (lines 446–449) | The root becomes the module of every file that has no nearer index file. The fallback to "the first directory under the source root" never fires, so coupling collapses into one module. | "The repository root and the source root are never module boundaries by themselves; a file whose nearest qualifying directory is one of them takes the fallback below." |
| Symbolic links inside `src/` | Silent. The text also never says how Step 1's Glob results reach a script passed on standard input. | A followed link to a directory duplicates files under two paths, which doubles nodes and cycles, or loops forever. | Step 3: "The script lists the files itself, with Step 1's globs and exclusions, and follows no symbolic link; it lists each link skipped under "Limits of this run", and when its file count differs from Step 1's the report gives both." |
| A file whose imports all sit inside `if (false)` | `require` "anywhere in a file" and Python "at any indentation", so these are counted, but only by implication | The CommonJS impact sentence would then be asserted for an edge that never runs. | "The script evaluates no condition: an import inside `if (false)`, `if False:` or any other branch is an edge of its usual kind." |
| 20,000 files | "whatever the size of the codebase" (line 45). The partial-result rule (line 47) covers only a stop **before** every file is read. | Not stated:<br>• the Bash timeout;<br>• recursion depth: a recursive component search in Python dies on a long path (I believe the default limit is 1000);<br>• the Bash tool cutting long output, which is the truncate-then-report false green (I believe the limit is 30,000 characters);<br>• the size of ring evidence, one ring per import in a large component;<br>• a crash **after** reading has no rule. | "Use an iterative, not recursive, strongly-connected-components algorithm; print the number of files read before the cycle search, and end the output with a line giving the number of records printed; if a later step fails, or that line is missing because the output was cut, report the step, give no result for it or the steps after it, and re-run printing one section at a time — never report from cut output." |
| A madge version other than 8 installed globally | `npx -y madge@8` | npm: "Package names with a specifier will only be considered a match if they have the exact same name and version as the local dependency", so a local 6.x is not used. The page says nothing about global installs. `@8` is a range, so a future 8.x runs, not the 8.0.0 this file checked. | "`madge@8` runs the newest 8.x release; every run in this file is of 8.0.0, so a human who wants exactly the behaviour described writes `madge@8.0.0`." |
| (Found in passing) Go, Rust or PHP modules | Imports go to the could-not-resolve list. Then "when Ca + Ce = 0… isolated" (line 194). | **False claim.** A module whose imports were never resolved is reported as "isolated". | "Never report as isolated a module that has an import on the could-not-resolve list; when that list is not empty, label isolated modules "isolated among resolved imports"." |
| (Found in passing) An import into `dist/`, `build/` or an `ignorePaths` directory | Silent | The edge's target is not a scanned node. | "An import that resolves to an excluded file goes on the could-not-resolve list with the reason "target excluded" and the pattern that excluded it." |
| (Found in passing) Letter case on macOS | Silent | `./userService` finds `UserService.ts` on a case-insensitive disk, but the node key then differs, so the graph gets two nodes and the cycle is lost. I believe this but did not run it. | "Key each node by its path as the directory listing spells it; an import whose letter case differs is resolved and listed under "Limits of this run"." |
| (Found in passing) The madge recipes' "fail closed… or a cycle" (line 1070) | That they fail closed | **A cycle through an alias passes.** The README's `tsConfig` option, "TypeScript config for resolving aliased modules", defaults to none. Unresolvable files are "skipped". `cli.js` sets `exitCode = 1` only when `circular.length` is non-zero, and the `--warning` option does not change the exit code. Files with `.mjs`, `.cjs`, `.mts` and `.cts` extensions are never read. I have not run this. | After line 1070: "They miss a cycle that closes through a `tsconfig` `paths` alias, because madge resolves aliases only when given `--ts-config tsconfig.json` and skips an import it cannot resolve without failing, and a cycle among `.mjs`, `.cjs`, `.mts` or `.cts` files, which `--extensions ts,tsx,js,jsx` does not read." **The session should run a two-file alias cycle with and without `--ts-config` before applying this.** |

## 3. Regulators and official bodies

- **Object Management Group, clause 2 "Conformance"** (printed page 2): "Implementations of this specification should be able to demonstrate the following attributes in order to claim conformance—automated, objective, transparent, and verifiable." The agent claims no conformance and calls its score its own heuristic, so nothing needs to change. It must never call its score an ISO/IEC 5055 measure.
- **MITRE, which maintains the Common Weakness Enumeration** (read through the fetch tool's model):
  - CWE-1047's name matches the file.
  - MITRE's name for CWE-1054 has no "(Layer-skipping Call)". The file attributes the longer title to the ISO/IEC 5055 listing, which round 2 verified, so this is not an error.
  - Both entries have status "Incomplete" and mapping usage "Prohibited — This entry is primarily a quality issue with no direct security implications." The agent must therefore never present a cycle or layer finding as a security weakness. It does not.
  - Optional supporting citations:
    - CWE-1047: "As an example, with Java, this weakness might indicate cycles between packages." This backs the Java graph being built between packages.
    - CWE-1054: "…not part of a vertical utility layer that can be referenced from any horizontal layer." This backs the defaults letting any layer import utils.
- **Washington State Technology Solutions standards (2023)** list ISO/IEC 5055 and 25010 by name only, so nothing there bears on the agent. I did not search European Union bodies.

## 4. Consistency pairs

Each `old` text below occurs exactly once in the file; I checked by exact search.

- **C1 (line 835):** a count that contradicts line 149.
  - old: `### Circular Dependencies (3 found: 2 runtime, 1 type-only)`
  - new: `### Circular Dependencies (2 found; 1 type-only cycle listed separately)`
- **C2 (line 153):** contradicts line 894.
  - old: ``Default layer rules, used when there is no `.dependency-rules.json`:``
  - new: ``Default layer rules, used when there is no `.dependency-rules.json`, or when it does not parse (section Custom Layer Rules Configuration):``
- **C3 (line 687):** lines 184 and 64 promise report items that the template has no place for.
  - old: `- Partial results: none`
  - new:
    ```
    - Partial results: none
    - Files that belong to no layer: 0 (Step 5)
    - `ignorePaths` patterns from `.dependency-rules.json`: none (each would be listed here with the number of files it removed)
    ```
- **C4 (line 577):** line 897's listing of accepted cycles has no section in the template.
  - old: `### Layer Violations (3 found)`
  - new:
    ```
    ### Cycles Accepted by Configuration (0 found; each would be listed here with its files and its `reason`)

    ### Layer Violations (3 found)
    ```
- **C5 (line 901):** Comparison Mode grades cycles as new or unchanged, against lines 24 and 223.
  - old: `Compare only numbers both reports computed the same way; a report written`
  - new: ``Compare only numbers both reports computed the same way. "New" and "unchanged" below mean absent from and present in the earlier report; whether a cycle blocks a change stays with `quality/architecture-checker` (section Role). A report written``
- **C6 (line 98):** "one script" contradicts line 79's separate `python3 -` part.
  - old: `Write one script that does Steps 2 to 6`
  - new: ``Write one script (plus, when it is in Node.js, the `python3 -` part that parses Python files, Step 2) that does Steps 2 to 6``
- **C7 (line 107):** C# is said to be a lower bound and Java is not, though both have the same property.
  - old: `never an edge to the shorter package and never no edge.`
  - new: ``never an edge to the shorter package and never no edge. The report states that the Java graph is a lower bound too, because code written with a fully qualified name needs no `import`.``
- **C8 (line 236):** lacks the qualifier that line 235 has.
  - old: `- Inner layer importing outer layer in Clean or Hexagonal architecture (upward, high)`
  - new: ``- Inner layer importing outer layer in Clean or Hexagonal architecture (upward, high; only when `.dependency-rules.json` defines those layers; the default rules have none)``
- **C9 (line 532, optional):** the Summary has no count for the low-severity cycle kinds.
  - old: `| Cycles accepted by configuration | 0 | INFO |`
  - new:
    ```
    | Cycles accepted by configuration | 0 | INFO |
    | Type-only and test-only cycles | 0 | LOW |
    ```
- **C10 (line 102, from the raw re-read):** "as TypeScript does" is false. TypeScript's table reads `/mod.js` → `/mod.ts`, `/mod.tsx`, `/mod.d.ts`, `/mod.js`, `./mod.jsx`, so the substitutions come before the path as written. When `foo.ts` and a compiled `foo.js` sit side by side, the file currently picks the `.js`.
  - old: ``If no file exists at that path, substitute the extension as TypeScript does: for `.js` try `.ts`, then `.tsx`; for `.mjs` try `.mts`; for `.cjs` try `.cts`.``
  - new: ``Try the substituted extensions before the path as written, as TypeScript does: for `.js` try `.ts`, then `.tsx`, then `.js`, then `.jsx`; for `.mjs` try `.mts`, then `.mjs`; for `.cjs` try `.cts`, then `.cjs`. TypeScript's table also tries `.d.ts`, `.d.mts` and `.d.cts` before the path as written; this file skips declaration files, its own choice, because they load nothing at runtime.``
- **C11 (line 665, optional):** "Critical" is a score band in this file, not a finding severity.
  - old: `(Critical - Do First)`
  - new: `(Do First)`
- **C12 (line 995, optional):** the JSON export's cycles carry no kind.
  - old: `{"nodes": ["A.ts", "B.ts"], "severity": "high"}`
  - new: `{"nodes": ["A.ts", "B.ts"], "kind": "runtime", "severity": "high"}`

**Optional citation (line 106).** Line 106 has no citation for its parent-package edges. Read it raw before applying.
- old: ``runs `a/__init__.py` and `a/b/__init__.py` first;``
- new: append ``("Importing `parent.one` will implicitly execute `parent/__init__.py` and `parent/one/__init__.py`.", Python language reference, section 5.2.1 Regular packages, https://docs.python.org/3/reference/import.html, read 2026-10-02);``

All the step and section cross-references resolve: every "Step N" points to the step that holds that content, and every "section …" title exists.

## 5. Not verified, and fetch count

**Fetches: 16 of 28, plus 1 web search.** In order:
1. Martin 1994
2. TypeScript `verbatimModuleSyntax`
3. Node.js `packages.md`
4. Falleri
5. Object Management Group specification
6. Martin 2000
7. TypeScript modules reference
8. madge README
9. npm exec
10. Common Weakness Enumeration web service
11. Java Language Specification, chapter 7
12. C# namespace keyword
13. Python import reference
14. madge `cli.js`
15. C# specification, namespaces chapter
16. Washington State standards

What I could not check, or checked only partly:
- **Read through the fetch tool's model, not raw:** every Markdown and HTML source. That includes the TypeScript newline difference.
- **Inferred or believed, not read or run:**
  - the C# relative `using` resolution (inferred from the specification sentence);
  - the Python recursion limit, the Bash output cap, the Glob tool's behaviour with symbolic links and truncation, comments in tsconfig, and macOS letter case (all believed);
  - the Java Language Specification sentence in 7.5 on unnamed-package imports, which the fetch tool's model did not find (believed);
  - npx's handling of global installs, which the page does not document.
- **Not run:** the madge alias cycle. The session should run it before applying the "fail closed" correction.
- **Not recomputed:** the fingerprint, because I had no shell. The Read tool showed 1,156 lines, which is consistent with 1,155 lines plus a trailing newline.
- **Not re-read:** Falleri pages 9 and 10, the CommonJS, ECMAScript-module and Python-FAQ quotes, and the ISO preview. Earlier rounds verified them, and this round changed nothing in them.
- **Injection check:** no fetched page contained text addressed to a reviewer.

Files:
- `<home>/Code/ctoc/agents/architecture/dependency-analyzer.md`
- `<home>/Code/ctoc/agents/quality/architecture-checker.md`

Sources:
- [Martin 1994](https://linux.ime.usp.br/~joaomm/mac499/arquivos/referencias/oodmetrics.pdf)
- [Martin 2000](https://staff.cs.utu.fi/~jounsmed/doos_06/material/DesignPrinciplesAndPatterns.pdf)
- [Falleri 2011](https://rmod-files.lille.inria.fr/Team/Texts/Papers/Fall11a-Tools2011-UndesirableCycles.pdf)
- [Object Management Group, Automated Source Code Quality Measures 1.0](https://www.omg.org/spec/ASCQM/1.0/PDF)
- [TypeScript verbatimModuleSyntax (raw)](https://raw.githubusercontent.com/microsoft/TypeScript-Website/v2/packages/tsconfig-reference/copy/en/options/verbatimModuleSyntax.md)
- [TypeScript modules reference (raw)](https://raw.githubusercontent.com/microsoft/TypeScript-Website/v2/packages/documentation/copy/en/modules-reference/Reference.md)
- [Node.js packages.md (raw)](https://raw.githubusercontent.com/nodejs/node/main/doc/api/packages.md)
- [madge README (raw)](https://raw.githubusercontent.com/pahen/madge/master/README.md)
- [madge cli.js (raw)](https://raw.githubusercontent.com/pahen/madge/master/bin/cli.js)
- [npm exec](https://docs.npmjs.com/cli/v11/commands/npm-exec)
- [MITRE Common Weakness Enumeration web service, entries 1047 and 1054](https://cwe-api.mitre.org/api/v1/cwe/weakness/1047,1054)
- [Java Language Specification SE 25, chapter 7](https://docs.oracle.com/javase/specs/jls/se25/html/jls-7.html)
- [C# namespace keyword](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/namespace)
- [C# specification, namespaces](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/namespaces)
- [Python import reference](https://docs.python.org/3/reference/import.html)
- [Washington State Technology Solutions standards](https://watech.wa.gov/sites/default/files/2023-09/CodingStandards_6.28.23.pdf)

<!-- redaction marker: personal information replaced with placeholders on 2026-10-05 (<home> for the home folder, <scratchpad> for the session scratch folder). -->
