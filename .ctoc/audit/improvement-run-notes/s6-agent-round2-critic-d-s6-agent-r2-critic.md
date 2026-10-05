# s6 agent round 2 — critique — agent-critic report (verbatim)

Dispatch d-s6-agent-r2-critic, received 2026-10-01 16:24 CEST. 11 findings, 22 pairs; current file scored 6.7/10. Saved by the session without edits.

---

**Verdict: REFINE.** I score the current file (fingerprint `fcd68643…`, 1,132 lines) at **6.7 out of 10**, up from 3.5 before round 1. There are 11 findings below, with 22 replacement pairs.

- **Checks on the pairs.** Every `old` text is copied verbatim from the current file. I confirmed each one occurs exactly once, by an exact search on 2026-10-01. No two `old` texts overlap. No `new` text contains another pair's `old`.
- **Gaps pass folded in.** I read the round-2 gaps pass and built on it:
  - The ISO/IEC 5055 clauses are cited as 7.1.11 and 7.1.25, not by detection-pattern numbers.
  - The layer finding says the layer design is this file's own default.
  - The scoring text cites the unweighted count (clause 9.1).
- **Not cited:** Melton and Tempero, Al-Mutawa, SonarQube, dependency-cruiser and ArchUnit's count unit.
- **Unchanged:** no frontmatter line changes, and no tool is added.

## Findings

### f-s6-agent-r2-1: one path per component explains almost nothing in a large component, and "test-only" is undefined where the nodes are packages
- **Marked:** correction-of-round-1 (f-s6-agent-r1-5).
- **Dimension:** actionability, specificity and completeness. **Severity:** high. **Confidence:** high.
- **Evidence:**
  - **Lines 127–131** report each component with one shortest path from its first sorted node. The round-2 research (row for lines 124–138) reads "Correct for counting, not enough as evidence". Falleri and others (2011) write, on page 2: "does not provide further information to understand and remove the cycles". On page 5: "select for each dependency one of the shortest cycles going through the dependency".
  - **Line 138 and line 199** define test-only as "every node is a test file". For Java and C#, Step 3 (line 98) makes the nodes packages and namespaces, which are not files. A test file shares its node with the code it tests, so the rule cannot be evaluated there. A ring that closes only through an import written in a test file would then be graded high.
  - **Line 124** counts "a file that imports itself", but the pseudocode on lines 128 and 134 says "2 or more nodes".
- **Decision:**
  - For every component, list every import inside it, plus one shortest ring through each import. The rings are deduplicated and listed shortest first. This costs one breadth-first search per import, which is polynomial.
  - Java and C# get a separate pass that classifies test-only cycles.
  - Self-imports become explicit.
  - Hand check, not run: on the session's six-file tree (round 2, run 2) this rule gives exactly the four rings madge printed.

(a) old:
````text
runtime_graph = the graph with only runtime edges
for each strongly connected component C of runtime_graph with 2 or more nodes:
    start = the first node of C in sorted order
    path  = the shortest import path from start back to start inside C (breadth-first search)
    report one runtime cycle: every node of C, and path with the import line of each edge

full_graph = the graph with runtime and type-only edges
for each strongly connected component D of full_graph with 2 or more nodes:
    if D's set of nodes equals that of a runtime component: skip it (already reported)
    else: report D once as a type-only cycle, with a path found as above
```
Then give each cycle its kind (section Detection Types, 1. Circular Dependencies): test-only when every node is a test file, accepted when `.dependency-rules.json` lists exactly its nodes. "Circular Dependencies" in the report counts runtime components, not paths through them.
````
new:
````text
component = a strongly connected component with 2 or more nodes, or one node that imports itself

pass 1, runtime: every runtime edge; for Java and C#, leave out each edge whose importing file is a test file
    each component -> one runtime cycle finding (its kind is set below)
pass 2, Java and C# only: every runtime edge, including those whose importing file is a test file
    each component whose set of nodes pass 1 did not report -> one test-only cycle finding
pass 3, type-only: every edge, runtime and type-only
    each component whose set of nodes no earlier pass reported -> one type-only cycle finding

evidence for each finding, over the edges of the pass that found it:
    imports = every edge with both ends inside the component, with its importing file, line and kind,
              sorted by importing file, then line
    for each import u -> v in imports:
        ring = u -> v, then the shortest import path from v back to u inside the component
               (breadth-first search)
    write each ring starting at its first node in sorted order, and keep each written ring once
    report the component's nodes, every import in imports, and every ring, shortest ring first
```
Why every import, and a ring through each: a component can hold dozens of files, and one path through it leaves most of its imports unexplained. Falleri and others found real systems whose packages formed a single component of dozens of packages, where the component alone "does not provide further information to understand and remove the cycles", and they select "for each dependency one of the shortest cycles going through the dependency" ("Efficient Retrieval and Ranking of Undesired Package Cycles in Large Software Systems", TOOLS 2011, pages 2 and 5, https://rmod-files.lille.inria.fr/Team/Texts/Papers/Fall11a-Tools2011-UndesirableCycles.pdf, read 2026-10-01). One breadth-first search per import keeps the work polynomial. Never try to list every cycle in a component instead: "the number of elementary cycles in a directed graph can be exponential" (same paper, page 5). When a component's imports form a single ring, as in both cycles of the worked report (section Output Format), that ring shows every import and is the whole evidence.

Then give each runtime cycle finding its kind (section Detection Types, 1. Circular Dependencies): in the languages whose nodes are files, test-only when every node is a test file; accepted when `.dependency-rules.json` lists exactly its nodes (for Java and C#, by package or namespace name). "Circular Dependencies" in the report counts runtime components, one per finding, never the rings inside them; a tool that counts rings, such as madge, can give a larger number for the same code (section Continuous Integration and Pre-Commit Checks).
````

(b) old:
````text
- **Runtime cycle** — every edge is a runtime import (Step 2) and at least one file is not a test file: high, whatever the number of files.
- **Type-only cycle** — the ring closes only through at least one type-only edge: low, listed separately.
- **Test-only cycle** — every file in it is a test file (section File and Directory Exclusions): low.
````
new:
````text
- **Runtime cycle** — every edge is a runtime import (Step 2) and the cycle is not test-only: high, whatever the number of files.
- **Type-only cycle** — the ring closes only through at least one type-only edge: low, listed separately.
- **Test-only cycle** — every file in it is a test file (section File and Directory Exclusions); for Java and C#, whose nodes are packages and namespaces that can hold a test file and the code it tests in one node, a cycle that closes only through imports written in test files (Step 4, pass 2): low.
````
- **Expected outcome:** a component of any size comes with evidence that names every import a fix could cut. A Java or C# cycle made only by tests is graded low.

### f-s6-agent-r2-2: the length rule gets its empirical basis, the published counter-position, and the standard's name
- **Marked:** new.
- **Dimension:** research grounding and calibration. **Severity:** medium. **Confidence:** high.
- **Evidence:**
  - Line 194 grounds "never its length" only in Martin.
  - The research row for line 194 reads "Supported on length; qualified on location; the literature disagrees with itself":
    - 2015, abstract: "neither subtype knowledge nor the location of the cycle within the package containment tree are suitable criteria…"
    - Falleri 2011, page 10: "We assume that the further away are the packages…"
    - The 2013 row: "…either directly or indirectly".
  - Gaps pass, row 3b: clause 7.1.25 is CWE-1047, and the detection pattern has "No length, size or grading".
  - Research row 198–199: the one other kind the 2015 study tested (subtype) "did not discriminate".
- **Decision:**
  - State both research positions and say they are not settled.
  - Keep "every runtime cycle high", because it follows the 2015 result.
  - Name CWE-1047.

old:
````text
So severity follows the kind of cycle, never its length; a longer cycle ties more files together, not fewer.

**Kinds and severity** (this file's own weighting):
````
new:
````text
So severity follows the kind of cycle, never its length; a longer cycle ties more files together, not fewer. ISO/IEC 5055:2021 lists circular dependencies as a maintainability weakness, Common Weakness Enumeration entry CWE-1047 "Modules with Circular Dependencies" (clause 7.1.25, contents pages of the preview at https://cdn.standards.iteh.ai/samples/80623/df09ef29b30644ae9921f30c955fa939/ISO-IEC-5055-2021.pdf, read 2026-10-01), and the detection pattern for it in the Object Management Group text the standard was prepared from sets no length, size or grade (Automated Source Code Quality Measures 1.0, clause 7.1.25, https://www.omg.org/spec/ASCQM/1.0/PDF, read 2026-10-01).

Severity does not follow where a cycle sits in the directory or package tree either, and this is where published work disagrees. A study of change-proneness found that "neither subtype knowledge nor the location of the cycle within the package containment tree are suitable criteria to distinguish between critical and harmless cycles" (Oyetoyan, Dietrich, Falleri and Jezek, "Circular dependencies and change-proneness: An empirical study", 2015, digital object identifier 10.1109/SANER.2015.7081834, abstract at https://api.archives-ouvertes.fr/search/?q=halId_s:hal-01203525&fl=abstract_s, read 2026-10-01), and an earlier study of defects found that "most defects and defective components are concentrated in cyclic-dependent components, either directly or indirectly" (Oyetoyan, Cruzes and Conradi, "A study of cyclic dependencies on defect profile of software components", Journal of Systems and Software 86(12), 2013, digital object identifier 10.1016/j.jss.2013.07.039, https://www.sintef.no/en/publications/publication/1061195/, read 2026-10-01). The published counter-position ranks cycles by that location: "We assume that the further away are the packages involved in a cycle, the more undesired the cycle seems." (Falleri, Denier, Laval, Vismara and Ducasse, TOOLS 2011, page 10, https://rmod-files.lille.inria.fr/Team/Texts/Papers/Fall11a-Tools2011-UndesirableCycles.pdf, read 2026-10-01), because a package such as `ui.internal` can be in a cycle with `ui` "without much consequences" (page 2). The sources read for this file do not settle the question. This file follows the 2015 result and rates every runtime cycle high; never call a runtime cycle harmless because its files sit close together in the tree.

**Kinds and severity** (this file's own weighting; no study read for this file tested type-only or test-only cycles, and the one other kind the 2015 study tested, subtype dependencies, did not separate critical cycles from harmless ones):
````
- **Expected outcome:** the rule shows its evidence and the disagreement in the literature. A model reading it has a literal order: never call a runtime cycle harmless because its files sit close together.

### f-s6-agent-r2-3: the "most files first" priority departs from the one published ranking without saying so, and the use of importer counts is uncited
- **Marked:** new. It keeps the order from round 1 (f-s6-agent-r1-3, part (d), and f-s6-agent-r1-28, pair 26).
- **Dimension:** calibration and research grounding. **Severity:** low. **Confidence:** high.
- **Evidence:**
  - Lines 1003 and 1008.
  - Research row 1003: "Own choice, and the published ranking is the opposite". Falleri, page 10: "(the less packages it has, the better it is ranked)". Page 5: "a long cycle is harder to understand than a short one".
  - Research gap 7: harm reaching the importers "is currently uncited".
- **Decision:**
  - Keep the order, as a deliberate departure with its reason. Falleri's tie-break measures how easy a ring is to understand, which is effort. This agent ranks whole components, not single rings.
  - Inside a component, finding 1 already lists the shortest rings first.
  - Cite both studies for the importer counts, and say that using them to break ties is this file's own step.

old:
````text
1. Runtime cycles, the one with the most files first.
2. Upward layer violations.
3. Other forbidden layer imports.
4. Stable-dependencies violations, the largest difference in instability first.

Where that order leaves a tie, and as the only order in groups 2 and 3, put first the finding whose files are imported by the most other files (the afferent count from the graph). This agent does not rank by effort, recency or how often a file changes: it does not compute them.
````
new:
````text
1. Runtime cycles, the one with the most files first.
2. Upward layer violations.
3. Other forbidden layer imports.
4. Stable-dependencies violations, the largest difference in instability first.

"The most files first" deliberately departs from the one published ranking read for this file. Falleri and others rank cycles by how far apart their packages sit in the package tree and, on a tie, put the smaller cycle first: "the less packages it has, the better it is ranked" (TOOLS 2011, page 10, https://rmod-files.lille.inria.fr/Team/Texts/Papers/Fall11a-Tools2011-UndesirableCycles.pdf, read 2026-10-01), because "a long cycle is harder to understand than a short one" (page 5). That orders single rings by how easy they are to understand, which is effort, and this agent does not rank by effort. Its findings are whole components, in which every file reaches every other through imports, so a larger component ties more files together (section Detection Types, 1. Circular Dependencies). Inside each component, Step 4 already lists the shortest rings first.

Where that order leaves a tie, and as the only order in groups 2 and 3, put first the finding whose files are imported by the most other files (the afferent count from the graph). The reason is this file's reading of two studies: defects concentrate in cyclic components "either directly or indirectly" (Oyetoyan, Cruzes and Conradi 2013, https://www.sintef.no/en/publications/publication/1061195/, read 2026-10-01), and cycles affect "the change proneness of the classes near these cycles" (Oyetoyan and others 2015, https://api.archives-ouvertes.fr/search/?q=halId_s:hal-01203525&fl=abstract_s, read 2026-10-01). Neither study ranks findings, and neither studied layer violations; using importer counts to break ties is this file's own step. This agent does not rank by effort, recency or how often a file changes: it does not compute them.
````

### f-s6-agent-r2-4: the madge configuration advice over-claims in the dangerous direction, and the hook's count is in a different unit from this agent's
- **Marked:** correction-of-round-1 (f-s6-agent-r1-28, pair 27, and f-s6-agent-r1-10).
- **Dimension:** robustness and research grounding. **Severity:** high. **Confidence:** high, verified by runs.
- **Evidence:**
  - **Line 1053** says the setting makes the recipes "skip such edges as this agent does". That is wrong:
    - Round-2 session run 1: with `skipTypeImports`, a cycle closed by `import { type T } from './h'` was not reported; without it, it was.
    - Research row for line 1053: detective-typescript's `isTypeNode` skips declaration-level type imports and exports, and also those whose every specifier is `type`.
  - **The `tsx` key:** line 1053 says "(not checked for this option)". The end of the round-1 session runs settles it: the `ts` key alone did not cover `.tsx` files, and both keys did.
  - **Count unit:** lines 1095 and 1099 print "circular dependencies". Round-2 session run 2: madge printed "Found 4 circular dependencies!" for 2 components.
- **Decision:**
  - Keep the recipes unset. As shipped, they never pass a cycle this agent rates high.
  - Correct the claim about what the setting skips, and state the `tsx` fact as verified.
  - Label the hook's number as madge's count of cycles.
  - The executor re-runs the hook in its four states (A to D) and `sh -n`. Only the two `echo` strings change.

(a) old:
````text
The recipes below do not set it, so they also stop the build on a cycle that closes only through an `import type` edge, which this agent rates low; to make them skip such edges as this agent does, put that setting in a `.madgerc` file at the project root ("You can use configuration file either in `.madgerc` in your project or home folder or directly in `package.json`.", same README, read 2026-10-01). The README's example for dynamic imports sets its option under both "ts" and "tsx", so add the same "tsx" key here (not checked for this option). Whether madge then also skips an import whose every specifier has an inline `type` modifier, which this agent counts as runtime, was not checked.
````
new:
````text
The recipes below do not set it, so they also stop the build on a cycle that closes only through an `import type` edge, which this agent rates low. Never tell the human that the setting makes madge count what this agent counts: it skips more. madge's TypeScript parser skips a declaration written `import type` or `export type`, and also an import or re-export whose every name carries an inline `type` modifier (detective-typescript, function `isTypeNode`, https://unpkg.com/detective-typescript/index.js, read 2026-10-01). This agent counts the last kind as a runtime edge marked `inline-type`. In a run of madge 8.0.0 on 2026-10-01, a cycle closed by `import { type T } from './h'` was reported without the setting and not reported with it, so with the setting the recipes can pass a cycle this agent rates high. A human who adds the setting anyway puts it in a `.madgerc` file at the project root ("You can use configuration file either in `.madgerc` in your project or home folder or directly in `package.json`.", same README, read 2026-10-01), under both a "ts" and a "tsx" key: in a run of madge 8.0.0 on 2026-10-01, the "ts" key alone left the `import type` edges of `.tsx` files counted, and adding the "tsx" key removed them.
- madge counts cycles, and this agent counts components, one per cycle finding (Step 4), so the two numbers differ for the same code: on six files forming two components, madge 8.0.0 printed "Found 4 circular dependencies!" in a run on 2026-10-01. The number the pre-commit hook below prints is madge's count of cycles. Never report it as this agent's number of cycle findings, and never compare the two.
````

(b) old:
````text
if [ "$CYCLES" -gt 0 ]; then
    echo "ERROR: $CYCLES circular dependencies. Run 'npx -y madge@8 --circular --extensions ts,tsx,js,jsx src/' for details."
    exit 1
fi

echo "Dependency check passed: 0 circular dependencies."
````
new:
````text
if [ "$CYCLES" -gt 0 ]; then
    echo "ERROR: cycle count from madge: $CYCLES. Run 'npx -y madge@8 --circular --extensions ts,tsx,js,jsx src/' for details."
    exit 1
fi

echo "Dependency check passed: cycle count from madge: 0."
````

### f-s6-agent-r2-5: the controller-to-repository finding has a standard name, and the default layer design should be stated as the file's own
- **Marked:** new.
- **Dimension:** research grounding. **Severity:** low. **Confidence:** high.
- **Evidence:**
  - Line 169.
  - Research row 169: clause 7.1.11 is "Invocation of a Control Element at an Unnecessarily Deep Horizontal Layer (Layer-skipping Call)".
  - Gaps pass, row 3c: round 2's gap 6 is "overstated". The detection pattern reads "The architectural blueprint defining layers, components, or subsystems is application dependent."
- **Decision:** name CWE-1054, and state that the defaults (any higher layer may import domain, models and utils) are this file's own design. Do not call the other allowed imports misaligned with the standard.

old:
````text
The one downward import the defaults forbid is a controller or handler importing a repository: it must go through a service.
````
new:
````text
The one downward import the defaults forbid is a controller or handler importing a repository: it must go through a service. ISO/IEC 5055:2021 lists this kind of import as Common Weakness Enumeration entry CWE-1054, "Invocation of a Control Element at an Unnecessarily Deep Horizontal Layer (Layer-skipping Call)" (clause 7.1.11, contents pages of the preview at https://cdn.standards.iteh.ai/samples/80623/df09ef29b30644ae9921f30c955fa939/ISO-IEC-5055-2021.pdf, read 2026-10-01). Which imports count as skipping a layer depends on the application's own layer design, not on the standard: "The architectural blueprint defining layers, components, or subsystems is application dependent." (Object Management Group, Automated Source Code Quality Measures 1.0, the detection pattern clause 7.1.11 names, https://www.omg.org/spec/ASCQM/1.0/PDF, read 2026-10-01). The defaults are this file's own design: they let any higher layer import domain, models and utils directly, so a controller importing a model is not a violation; a `.dependency-rules.json` replaces that design.
````

### f-s6-agent-r2-6: a file that fails to parse disappears silently
- **Marked:** new.
- **Dimension:** robustness. **Severity:** medium. **Confidence:** high.
- **Evidence:**
  - Research gap 9: "Nothing says what happens when a Python file raises a syntax error in `ast` … It should go under 'Limits of this run' and never be dropped silently."
  - Line 47 covers only a stop of the whole run.
  - The session's `python3` is 3.9.6 (round-1 session runs). `ast` uses the grammar of the interpreter running it, which I believe but did not verify.
  - Line 79 recognises only a bare `if TYPE_CHECKING:`.
- **Decision:**
  - A per-file failure goes under the limits, never with source text, which could hold a secret.
  - Counts are qualified as "among the files that parsed".
  - If every file fails, give no count and no score.
  - Add the `typing.TYPE_CHECKING` form.

(a) old:
````text
An import inside an `if TYPE_CHECKING:` block is `type-only`; an import inside a function is `runtime` and is marked `deferred` in the report.
````
new:
````text
An import inside an `if TYPE_CHECKING:` or `if typing.TYPE_CHECKING:` block is `type-only`; an import inside a function is `runtime` and is marked `deferred` in the report. The `ast` module parses with the grammar of the `python3` that runs it, so a file written for a newer Python than the one `python3 --version` shows can fail to parse.

**A file the script cannot read or parse**, in any language (a Python `SyntaxError`, bytes that cannot be decoded, a read error), goes under "Limits of this run" with its path, the line the error names, and the error's type, never its source text. Its imports are missing from the graph: "Files Analyzed" counts only the files read and parsed, and every count and "none found" in the report then means "among the files that parsed". If no file parsed, list them all and report no count and no score. Never drop such a file silently, and never treat it as a file with no imports.
````

(b) old:
````text
- Languages present but not analyzed: none
````
new:
````text
- Languages present but not analyzed: none
- Files that could not be read or parsed: none (each would be listed here with its path, the line the error names and the error's type)
````

### f-s6-agent-r2-7: test-file recognition, and tests distorting coupling and instability
- **Marked:** new.
- **Dimension:** completeness and calibration. **Severity:** medium. **Confidence:** medium. The exclusion is the file's own choice.
- **Evidence:**
  - **Pattern lines:** lines 492–493 have no citation.
  - **pytest** (round-2 session run 3, read raw): "test_*.py or *_test.py files, imported by their test package name." Both are already covered. `conftest.py` is a fixture file, not a test.
  - **.NET:** a test project directory such as `MyApp.Tests/` is unmatched (research gap 8). This is believed only.
  - **Step 6** (line 172) counts edges from test files. Tests import the code they test, which raises Ca for every tested module and moves its instability. That feeds the scored stable-dependencies check (line 180).
  - **Report wording:** line 178 tells the report to state the counting rule, so the rule's text must change with it.
- **Decision:**
  - Add the .NET directory pattern, labelled as the file's own choice.
  - Cite pytest.
  - Name `conftest.py` honestly and treat it as test code, as the file's own choice.
  - Leave test files out of Step 6, and say so in the report.

(a) old:
````text
- Files in `**/__tests__/**`, `**/test/**`, `**/tests/**`, `**/spec/**`
- Files matching `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.py`
````
new:
````text
- Files in `**/__tests__/**`, `**/test/**`, `**/tests/**`, `**/spec/**`, `**/*.Tests/**` and `**/*.Test/**` (the last two match a .NET test project directory such as `MyApp.Tests/`; this pattern is this file's own choice, and no .NET convention document was read for it)
- Files matching `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.py`. The last two cover pytest's default discovery of "test_*.py or *_test.py files, imported by their test package name." (pytest good practices, https://docs.pytest.org/en/stable/explanation/goodpractices.html, read 2026-10-01)
- `conftest.py`, which is not a test file under that convention (pytest loads it as a fixture file); this file treats it as test code, its own choice, because it exists to serve the tests
````

(b) old:
````text
In the script, for each module M (section Module Boundary Detection), over internal edges only:
````
new:
````text
In the script, for each module M (section Module Boundary Detection), over internal edges only, leaving out every edge whose importing file is a test file (section File and Directory Exclusions) and leaving test files out of each module's file count. Tests import the code they test, so counting them would move the instability of every tested module for a reason that is not its design; this is this file's own choice:
````

(c) old:
````text
Counted in files, 1994 definitions: Ca = files outside the module that import it; Ce = files inside the module that import another module.
````
new:
````text
Counted in files, 1994 definitions, test files left out: Ca = files outside the module that import it; Ce = files inside the module that import another module.
````

(d) old:
````text
so the report states "counted in files, 1994 definitions".
````
new:
````text
so the report states "counted in files, 1994 definitions, test files left out".
````

### f-s6-agent-r2-8: Java and C# resolution silently loses edges and invents self-cycles
- **Marked:** correction-of-round-1 (f-s6-agent-r1-7).
- **Dimension:** specificity and completeness. **Severity:** medium. **Confidence:** high, from the file's own logic.
- **Evidence:**
  - **Line 105** "all give an edge to package `a.b`". That works by cutting one part off the name. An import of a nested class, such as `a.b.C.Inner`, then gives `a.b.C`, which no file declares, so rule 9 (line 108) makes it external. The edge is dropped without appearing on the could-not-resolve list.
  - **Line 106**, C#: `using Alias = A.B.C` where `C` is a type has the same problem.
  - **Self-cycles:** an import of a file's own package or namespace (legal and redundant) would become a one-node cycle under finding 1's self-import rule.
  - **Layers:** `get_layer` (lines 156–158) is defined for files only, while the target node in Java and C# is a package or a namespace.
- **Decision:**
  - Resolve to the longest leading part of the name that a scanned file declares.
  - An import of the file's own package or namespace gives no edge.
  - `get_layer` uses the dotted name for package and namespace nodes.

(a) old:
````text
6. **Java**: `a.b.C`, `a.b.*`, `import static a.b.C.m` and `import static a.b.C.*` all give an edge to package `a.b`. A package is internal when some scanned file declares it.
````
new:
````text
6. **Java**: the edge goes to the longest leading part of the imported name that some scanned file declares as its package. With `package a.b;` declared, `a.b.C`, `a.b.*`, `a.b.C.Inner` (a nested class), `import static a.b.C.m` and `import static a.b.C.*` all give an edge to package `a.b`. Never cut a fixed number of parts off the name: `a.b.C.Inner` cut by one part gives `a.b.C`, which no file declares, and the edge would be lost as external. An import of the importing file's own package gives no edge, because both ends are one node. An import with no declared leading part is external.
````

(b) old:
````text
7. **C#**: the edge goes to the namespace the directive names (for `using static A.B.C`, namespace `A.B`). A namespace is internal when some scanned file declares it.
````
new:
````text
7. **C#**: the edge goes to the longest leading part of the name in the directive that some scanned file declares as a namespace: `using A.B;` gives `A.B`, and `using static A.B.C;` or `using Alias = A.B.C;`, where `C` is a type, give `A.B`. A directive naming the importing file's own namespace gives no edge. A directive with no declared leading part is external.
````

(c) old:
````text
                  Example: src/api/handlers/OrderHandler.ts -> "handlers".
````
new:
````text
                  Example: src/api/handlers/OrderHandler.ts -> "handlers".
                  For Java and C#, whose imported nodes are packages and namespaces, to_layer is
                  the last part of the dotted name that is such a key: com.app.services -> "services".
````

### f-s6-agent-r2-9: Python `from M import n` points at the wrong file
- **Marked:** correction-of-round-1 (f-s6-agent-r1-7).
- **Dimension:** specificity. **Severity:** medium. **Confidence:** medium. The Python import facts are believed and await the validator.
- **Evidence:**
  - **Line 104** maps a dotted name to a file or to `__init__.py`. So `from . import n` and `from models import user` resolve to the package's `__init__.py`.
  - **What that misses:** the edge to `n.py` itself.
  - **What it invents:** a cycle with any `__init__.py` that re-exports from the importing file.
  - **Parent packages:** importing `a.b.c` from outside `a` also runs `a/__init__.py` and `a/b/__init__.py` first, and no rule adds those edges.
- **Decision:**
  - Point the edge at the submodule when a file exists for it.
  - Add edges to the `__init__.py` of each parent package that does not contain the importing file. Skip the packages that do contain it, because they are already being imported; otherwise every package that re-exports from its submodules would show a false cycle.

old:
````text
5. **Python**: a dotted name maps to a `.py` file or a package's `__init__.py` under `src/` if it exists, otherwise under the repository root; a relative import (`.x`, `..x`) resolves against the importing file's package.
````
new:
````text
5. **Python**: a dotted name maps to a `.py` file or a package's `__init__.py` under `src/` if it exists, otherwise under the repository root; a relative import (`.x`, `..x`) resolves against the importing file's package. For `from M import n`, including `from . import n`, the edge goes to the file of module `M.n` when one exists (`M/n.py` or `M/n/__init__.py`), and otherwise to M's own file: resolving `from . import n` to the package's `__init__.py` alone misses the edge to `n` and can invent a cycle with an `__init__.py` that re-exports from the importing file. An import of a dotted name also gives an edge to the `__init__.py` of each package on that name's path that does not contain the importing file, because importing `a.b.c` runs `a/__init__.py` and `a/b/__init__.py` first; a package that contains the importing file is already being imported when that file runs, so it gets no such edge.
````

### f-s6-agent-r2-10: the scoring section can cite the standard's unweighted count
- **Marked:** new.
- **Dimension:** calibration and research grounding. **Severity:** low. **Confidence:** high.
- **Evidence:** line 672. Gaps pass, row 3a: clause 9.1 (page 229) and clause 10.1 (page 231), "not normative".
- **Decision:** cite the standard's measure and make the per-kind counts mandatory beside the score. The Summary table already gives them.

old:
````text
The score, its weights and its bands are this file's own heuristic for summarizing a report; no published source defines them. Every finding is reported in full whatever the score.
````
new:
````text
The score, its weights and its bands are this file's own heuristic for summarizing a report; no published source defines them. The Object Management Group measure that ISO/IEC 5055 was prepared from counts and does not weigh: "Detection pattern score is the count of occurrences, / Weakness score is its detection pattern score, / Quality characteristic score is the sum of its weakness scores." (Automated Source Code Quality Measures 1.0, clause 9.1, page 229, https://www.omg.org/spec/ASCQM/1.0/PDF, read 2026-10-01). It names weighting by severity only to add that "these weighting schemes are not derived from any existing standards and are therefore not normative." (clause 10.1, page 231). So the Summary always gives the count of each kind of finding beside the score, and the score never replaces those counts. Every finding is reported in full whatever the score.
````

### f-s6-agent-r2-11: empirical support for "no threshold on I"
- **Marked:** new.
- **Dimension:** research grounding. **Severity:** low. **Confidence:** high.
- **Evidence:** line 181. Gaps pass, row 7a: the 2020 study gives no instability threshold, and its abstract reads "Our results show that architecture has an inconsistent impact on defect–proneness."

old:
````text
- Use no threshold on I. Neither source gives one, and Martin warns that "a metric is not a god; it is merely a measurement against an arbitrary standard." (1994, page 8, https://linux.ime.usp.br/~joaomm/mac499/arquivos/referencias/oodmetrics.pdf, read 2026-10-01).
````
new:
````text
- Use no threshold on I. Neither source gives one, and Martin warns that "a metric is not a god; it is merely a measurement against an arbitrary standard." (1994, page 8, https://linux.ime.usp.br/~joaomm/mac499/arquivos/referencias/oodmetrics.pdf, read 2026-10-01). A 2020 study of faults against Martin's design metrics gives no threshold on I either, and reports that "architecture has an inconsistent impact on defect–proneness." (Petrić, Hall and Bowes, 2020, abstract, https://eprints.lancs.ac.uk/id/eprint/148032/1/QUATIC_2020_Relationship_Between_Faults_and_Design_Metrics.pdf, read 2026-10-01).
````

### Wrapper contract, checked against the new text
- **Frontmatter:** untouched, including the description (one line, no ": " and no " #", all nine dispatch phrases). There is no `approved_by`, `human_gate` or `review_gate`. The honest-status reference is unchanged.
- **Copy from the skill:** none of the new lines of 25 characters or more appears in `skills/architecture/dependency-analyzer/SKILL.md`. That skill has nothing on rings, CWE, Falleri, Oyetoyan, `isTypeNode`, `conftest.py`, the longest declared prefix or the cycle count from madge. I checked this by reading the skill, not with a script.
- **Wording:** no gate numbers. No invented abbreviations: "digital object identifier" and "Common Weakness Enumeration" are spelled out, and SCC, ASCQM and SANER are avoided outside addresses.
- **Tools:** every order stays within Read, Grep, Glob and Bash.

### Considered and not applied
- **NIST SP 800-218 PW.4.4.** It supports treating third-party package risk as a separate concern. The boundary is already stated on line 24, and which agent owns the concern is a design choice, so the citation would be decoration.
- **Excluded by the gaps pass:** SonarQube's rules, Melton and Tempero, Al-Mutawa, dependency-cruiser and ArchUnit's count unit are not used.

## Score of the current file, before these edits

I classified this as a review agent, as round 1 did: specificity +0.25, calibration +0.5, robustness −0.25, divisor 9.5.

| Dimension | Score | Anchor matched |
|---|---|---|
| Specificity | 7 | Exact script, resolution order, pseudocode and formulas, with a worked report. The gaps: per-component evidence, Java nested-class resolution, Python submodule resolution, and package graphs. |
| Completeness | 6 | The core scope is covered. Of the seven house languages, four are analysed. Go, Rust and PHP go to the could-not-resolve list, and C, C++ and SQL are only detected. There is no rule for a file that fails to parse. |
| Boundaries | 7 | It names the architecture checker, the pattern detector and the dependency checker, and it is read-only. The checker's own side is still unresolved (a round-1 item for the human). |
| Actionability | 7 | Findings carry file and line, and there is a priority list and an impact list. A large component gives the fixer one path. |
| Integration | 6 | Fixed template, header counts and a "Limits of this run" block (acting as a self-assessment), with cto-chief named. There is no confidence per finding (the graph facts are deterministic) and no structured schema. No fix is proposed, because adding a schema is the wrapper-structure decision already with the human (f-s6-agent-r1-27). |
| Robustness | 7 | Empty input, untrusted content, partial runs, unresolved imports and the rules file are handled. Missing: per-file parse failure, and the over-claim in the madge recipe advice. |
| Calibration | 7 | Weights are labelled as the file's own, thresholds are removed, the formula and rounding are explicit, and the worked score matches. The priority departure is unstated. |
| Research grounding | 7 | Martin, Node.js, Python, TypeScript, the Java specification, C# and madge runs, all cited with quotes. No empirical cycle literature, no standard names, and the `skipTypeImports` claim is partly refuted. |

- **Overall:** 6.7 on the base weights (60.5 / 9) and 6.7 adjusted (64.0 / 9.5). **REFINE.** It is above 3, so there is no escalation.
- **Expected after these 11 findings:** about 7.5. That is a guess until round 3 scores it. Integration stays at 6 unless the human decides the schema question.
- **Bias check:** the file's length earned no credit, and I scored unique coverage.

**Seven languages.** The domain applies to all seven, because each has an import or include mechanism.
- **Analysed:** JavaScript and TypeScript, Python, Java and C#. This round corrects Java and C# resolution and test classification, and Python's submodule resolution.
- **Detected but not analysed:** C, C++ and SQL (Step 1). No round-2 source gives a verified rule for `#include`, C++ modules or foreign keys, so they wait on such a source.
- **Code:** no new code example in any language. Java and C# are not compiled (no JDK and no .NET here).

**For the human**
1. **How to tell whether a cycle is new.** The architecture checker decides whether a cycle is new or already existed. This agent reports one finding per component (its node set, its imports and its rings), while madge reports rings. A new ring added inside an existing component leaves this agent's count unchanged. Which unit the checker compares is a decision across agents, and the checker is in the slice for the architecture checker. The options, with no recommendation:
   - (a) The checker compares component node sets.
     - For: stable, and matches this agent's count.
     - Against: misses a new ring inside an old component.
   - (b) The checker compares rings.
     - For: catches new rings.
     - Against: the number of rings can grow exponentially.
   - (c) The checker compares the imports inside components.
     - For: catches any added import that keeps a cycle.
     - Against: noisier when a file moves.

**For this slice's own skill rounds** (not decisions):
- the inline-`type` over-skip and the `tsx` key;
- madge's count unit;
- the disagreement in the literature about location;
- CWE-1047 and CWE-1054;
- per-import ring evidence.

These come on top of the items already listed in round 1: grading by length, `I > 0.7`, and `jdeps --check`.

## Not verified
- **Oyetoyan, Cruzes and Conradi 2013:** the sentence came through the fetch tool's summarizer only. The validator should read it raw.
- **ISO/IEC 5055 (findings 2 and 5):** the clause titles come from the contents pages of the preview; the body text is unread. The Object Management Group sentences are attributed to that document, because it carrying over into the ISO text is believed (gaps pass).
- **madge's handling of `export type` (finding 4):** taken from the latest detective-typescript source, not necessarily the version madge 8.0.0 installs. Only the two import cases were confirmed by runs.
- **The edited hook (finding 4b):** not run. The executor should run `sh -n` and the four states A to D on the session's scratch tree.
- **Python facts in findings 9 and 6:** believed and not read this round. They are that `from M import n` loads the submodule, that importing `a.b.c` runs the parent packages' `__init__.py` first, and that `ast` uses the running interpreter's grammar. The validator should check https://docs.python.org/3/reference/import.html, section "Regular packages". The session can also run python3 3.9.6 on a scratch package and on a file containing a `match` statement.
- **Java and C# forms (finding 8):** that a nested class may be imported, and the C# alias form, are believed. They were not compiled.
- **.NET test directories (finding 7):** no convention document was read. The new text says so.
- **Finding 1's rings:** checked by hand on the round-2 six-file tree only, not run.
- **Copy check:** done by reading, not by the executor's script. The executor should re-run its 25-character comparison against the skill.
- **Not recomputed:** the line count was not recomputed. The fingerprint was not checked, because I have no shell.

Files read:
- `<home>/Code/ctoc/agents/architecture/dependency-analyzer.md`
- `<home>/Code/ctoc/skills/architecture/dependency-analyzer/SKILL.md`
- `<home>/Code/ctoc/plans/in-progress/00266-every-agent-and-specialist-skill-improved-three-times-s6-dependency-analyzer.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round1-critic-d-s6-agent-r1-critic.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round1-revalidate-d-s6-agent-r1-revalidate.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round1-session-runs.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round2-research-d-s6-agent-r2-research.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round2-session-runs.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round2-research-gaps-d-s6-agent-r2-research-gaps.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round1-research-gaps-d-s6-agent-r1-research-gaps.md` (searched only)

<!-- redaction marker: personal information replaced with placeholders on 2026-10-05 (<home> for the home folder, <scratchpad> for the session scratch folder). -->
