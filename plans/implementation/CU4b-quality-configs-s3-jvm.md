---
approved_by: human
approved_at: 2026-07-08T20:52:40.442Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4b s3 — java quality-configs (legacy · strictest) → JVM-toolchain depth"
type: implementation
parent_plan: CU4b-quality-configs
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/quality-configs/java/legacy.md
  - skills/quality-configs/java/strictest.md
  - tests/cu4b-jvm-configs.test.js
---

# CU4b s3 — java quality-configs → JVM-toolchain sibling depth

> Slice 3 of the CU4b decomposition (SIP1). Upgrade the two thin java quality-config
> guides using the SAME-FAMILY template `java/strict.md` (7 sections — SOLID, READ-ONLY).
> Inherits the parent's Gate-1 `approved_by: human` marker; Gate 2 & 3 batch via
> `approveSubplans('CU4b-quality-configs', …)`. **HARD RULES:** **(1) NO STUBS** — real
> Checkstyle/SpotBugs/PMD/JaCoCo rules/rationale/versions, each file `> 5` `##` sections.
> **(2) NO FABRICATED versions/rules** — every Checkstyle/SpotBugs/PMD/JaCoCo version and
> rule name WEB-VERIFIED against official docs at edit time, inline dated http source
> ≥ 2025-01-01; unverifiable → omit. **(3) ZERO TEST DOUBLES** — the content-contract test
> reads the REAL java config files off disk. **(4) STRUCTURAL TEMPLATING** — copy
> java/strict's STRUCTURE, author Java-correct values; NO Kotlin/detekt or Scala value.

Satisfies CU4b acceptance criteria: **"all 9 thin configs reach sibling-family depth"**
(the 2 java files), **"config values are language-correct"**, **"every section names a
technology-specific identifier"**, **"all version claims carry dated sources"**.

## Implementation Details

### Architecture Decision

Both java variants are thin (read-fresh 2026-07-09): legacy = 5 `##`/45 lines, strictest =
5 `##`/63 lines. A rich SAME-family sibling exists — **`skills/quality-configs/java/strict.md`**
(7 `##`: Mode / Checkstyle(`checkstyle.xml`) / SpotBugs / Maven(`pom.xml`) / Coverage /
Complexity / Commands). That is the STRUCTURE template (SOLID, READ-ONLY). The thin files
already carry Checkstyle fragments + coverage/complexity tables; the upgrade wraps those in
the java/strict structure and adds the missing surfaces (SpotBugs, PMD, JaCoCo enforcement,
build config, commands, CI).

**Strictness gradient (real correctness axis):**
- **strictest**: Checkstyle `severity=error` (or the max ruleset), full
  `CyclomaticComplexity max=7` / `MethodLength max=30` / `ParameterNumber max=3` /
  `NestedIfDepth max=3` + Javadoc modules (already present — keep), `-Xlint:all -Werror`
  compiler gate (already present — keep), SpotBugs `effort=Max`/`threshold=Low`, PMD
  quickstart+ ruleset, JaCoCo coverage 90% with `check` goal failing the build.
- **legacy**: Checkstyle `severity=warning` (already present), relaxed limits
  (`CyclomaticComplexity max=15`, `MethodLength max=100`, `ParameterNumber max=6` — keep),
  JaCoCo coverage 50% (non-failing baseline), gradual-adoption note.

### Dependency Graph

```
skills/quality-configs/java/legacy.md     (MODIFY) ─┐
skills/quality-configs/java/strictest.md  (MODIFY) ─┴─ structure from ─▶ java/strict.md (READ-ONLY, same-family)
tests/cu4b-jvm-configs.test.js  (CREATE, reads the 2 real files — zero doubles)
```

Disjoint from every other slice. No cycle. `depends_on: none`.

### File Specifications

#### Files: `java/legacy.md`, `java/strictest.md`
**Action:** MODIFY (add sections to reach `> 5` `##`; keep every existing section).
**Purpose:** each becomes a substantive JVM correction surface at `checkstyle.xml` /
`pom.xml` edit time.
**Change Type:** structural depth expansion (java/strict structure, Java values).

Each file, after upgrade, must carry at minimum (structure mirrors java/strict):
1. **Mode** (keep).
2. **Checkstyle Config (`checkstyle.xml`)** — severity (error strictest / warning legacy)
   + the complexity/Javadoc modules (keep existing fragments; strictest keeps the tight
   limits, legacy the relaxed ones).
3. **SpotBugs** — plugin config, `effort`/`threshold`, exclude filter note.
4. **PMD** — ruleset reference (`category/java/*.xml`) and the pmd-check goal.
5. **Maven Configuration (`pom.xml`)** — `maven-checkstyle-plugin`,
   `spotbugs-maven-plugin`, `maven-pmd-plugin`, `jacoco-maven-plugin` with the coverage
   `check` execution + the `maven-compiler-plugin` `-Xlint:all`/`-Werror` (strictest;
   keep the existing compiler-flags block).
6. **Coverage Requirements** (keep/extend) — JaCoCo; 90% strictest / 50% legacy.
7. **Complexity Limits** (keep) — the existing tables.
8. **Commands / CI** — `mvn verify`, GitHub Actions (`actions/setup-java@v4`,
   Temurin 21) running checkstyle/spotbugs/pmd/jacoco.

Every added section names ≥ 1 identifier (a Checkstyle module like `CyclomaticComplexity`,
`SpotBugs`, `PMD`, `JaCoCo`, `jacoco-maven-plugin`, a Java/`-Xlint` token, `Temurin 21`).
Every version/tool claim carries an inline dated http source ≥ 2025-01-01
(checkstyle.org / spotbugs.readthedocs.io / pmd.github.io / jacoco.org / maven plugin pages).

#### File: `tests/cu4b-jvm-configs.test.js`
**Action:** CREATE. **Framework:** `node:test`. **Zero doubles** — reads the 2 real files
via `fs.readFileSync`.

**Test cases (per java file):**
1. `> 5` `##` sections (both start at 5 — asserting `> 5` proves real additions).
2. `> 90` lines (well past the ~54-line floor).
3. required sections: Checkstyle, SpotBugs, PMD, Maven OR Gradle, Coverage (JaCoCo),
   Complexity, Commands OR CI (case-insensitive regex).
4. names Java identifiers: `Checkstyle`, `SpotBugs`, `PMD`, `JaCoCo`, a
   `CyclomaticComplexity`/Checkstyle-module token, an `-Xlint`/`maven`/`jacoco-maven-plugin`
   token.
5. ≥ 4 code fences (checkstyle + spotbugs/pmd + pom/CI blocks).
6. ≥ 1 dated source: `20(2[5-9]|[3-9]\d)` token AND `https?://`.
7. **cross-language guard:** must NOT contain Kotlin/Scala signature tokens (`detekt`,
   `ktlint`, `build.gradle.kts`, `scalafmt`, `scalastyle`).
8. gradient guard: strictest contains `90%` and a tight limit (`max="7"` or
   `MethodLength`/`max="30"`); legacy contains `50%` and `severity` `warning`.

### Test Plan

Step 8 RED: both java files fail `> 5` sections + SpotBugs/PMD/JaCoCo required-section +
identifier assertions before upgrade. After upgrade all pass; `node --test tests/*.test.js`
→ `# fail 0`.

### Security Review

- Content-only edits to 2 markdown files + one test file; no runtime path handling.
- Source URLs official public domains (checkstyle.org, spotbugs.readthedocs.io,
  pmd.github.io, jacoco.org, maven.apache.org) — no secrets.
- Only the 3 enumerated files touched.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write `tests/cu4b-jvm-configs.test.js` — reads the 2 REAL files, zero doubles;
      asserts `>5` sections, required sections, Java identifiers, `>=4` fences, dated http
      source, NO Kotlin/Scala tokens, gradient tokens.
- [ ] Run — expect RED.

### Step 9: PREPARE
- [ ] READ `java/strict.md` (structure template) fresh off disk.
- [ ] **WEB-VERIFY at edit time** (no invented versions): current Checkstyle, SpotBugs,
      PMD, JaCoCo versions + the maven plugin coordinates/versions, JDK 21 (Temurin) facts,
      the Checkstyle module names used. Capture each source URL + retrieval date ≥ 2025-01-01.

### Step 10: IMPLEMENT
- [ ] Expand BOTH java configs to `> 5` `##` sections using java/strict STRUCTURE with
      Java-correct values; keep the strict/legacy gradient. ONE step. No Kotlin/Scala value.
      Each section identifier-bearing; each version inline-dated-sourced.

### Step 11: REVIEW
- [ ] Self-review: gradient correct; no Kotlin/Scala token; each section identifier-bearing;
      each version sourced; existing Checkstyle/compiler-flags/coverage/complexity retained.

### Step 12: OPTIMIZE
- [ ] Density at java/strict level; tables where java/strict uses tables; no filler.

### Step 13: SECURE
- [ ] All source URLs official; only the 3 files edited.

### Step 14: VERIFY
- [ ] `node --test tests/cu4b-jvm-configs.test.js` → GREEN.
- [ ] `node --test tests/*.test.js` → `# fail 0`, 0 skipped.

### Step 15: DOCUMENT
- [ ] Append to `## Decisions Taken Under Ambiguity`: UPGRADED verdict for java/legacy,
      java/strictest; template = java/strict (same-family, structure); each Checkstyle/
      SpotBugs/PMD/JaCoCo/JDK version with its dated source URL.

### Step 16: FINAL-REVIEW
- [ ] Only the 3 enumerated files changed; nothing fabricated; java/strict read but NOT
      edited (no-churn).

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Kotlin/Scala value leaks into a Java guide (HIGH) | Test asserts NO `detekt`/`ktlint`/`build.gradle.kts`/`scalafmt` tokens; extend from java/strict values | Step 10, 11, test |
| Invented Checkstyle/SpotBugs/PMD/JaCoCo version | Web-verify at edit time; inline dated official URL | Step 9, 15 |
| Section inflation without depth | Test asserts identifier + `>=4` fences + dated source per file | Step 14 |

## Decisions Taken Under Ambiguity

(To be completed by the executor at Step 15 — must record: the UPGRADED verdict for
java/legacy.md and java/strictest.md; template used = java/strict.md (same-family,
STRUCTURE only); and each web-verified Checkstyle / SpotBugs / PMD / JaCoCo / JDK version
with its dated http source URL and retrieval date ≥ 2025-01-01. Never invent a version.)
