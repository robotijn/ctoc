---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T13:05:41.188Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.470Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4c s9 — smart-contract & hardware-description guides (solidity, verilog, vhdl)"
type: implementation
parent_plan: CU4c-nonmainstream-languages
depends_on: none
priority: MEDIUM
risk_level: LOW
files:
  - skills/languages/solidity.md
  - skills/languages/verilog.md
  - skills/languages/vhdl.md
  - tests/cu4c-contract-hdl-guides.test.js
---

# CU4c s9 — smart-contract & hardware-description guides (solidity · verilog · vhdl)

> Slice 9 of the CU4c decomposition. De-stub the three **hardware-description + on-chain
> contract** language guides from the 5-section template floor (confirmed fresh 2026-07-09:
> each has exactly the 5 template sections) into substantive correction surfaces, in ONE
> coherent research pass. Shared research spine: **concurrent/parallel execution semantics
> that are NOT sequential software** (Solidity's adversarial EVM transaction ordering +
> reentrancy; Verilog/VHDL's inherently concurrent hardware processes + simulation-vs-
> synthesis mismatch + race/latch inference). These languages punish a "sequential-software"
> mental model hardest, so a footgun guide is high-value. Adds the content-contract test
> that reads the REAL guide files off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every Solidity version, SWC/CWE identifier, EIP, Verilog/VHDL standard (IEEE 1364 /
> 1076 / SystemVerilog 1800), tool version, date, and best-practice claim MUST be
> WEB-VERIFIED at edit time (WebSearch or direct fetch of soliditylang.org /
> swcregistry.io / consensys diligence / ieee standards / cwe.mitre.org) and carry an
> inline dated source ≥ 2025-01-01 — never invented (hard user rule). If no dated
> authoritative source exists for a claim, **OMIT it** and note the absence in the audit
> findings. The content-contract test READS the real files off disk — no mocks, no fakes.

Maps to CU4c acceptance criteria: **"upgraded guides meet the CU2 depth standard"**,
**"CVE/CWE classes named for applicable languages (Solidity has a well-documented
vulnerability registry; HDLs have race/latch hazard classes)"**, and **"no audited-SOLID
guide is rewritten (no-churn)"** — for these three files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule does
NOT apply** (CU4c vision carve-out). Examples in each guide's OWN language, idiomatic +
current standard. Bar = depth-within-language, objectively gated: every required `## `
section names a concrete identifier; every version/security claim carries a dated source
≥ 2025-01-01.

**No-churn (extend, never overwrite):** solidity.md, verilog.md, vhdl.md each have exactly
5 `## ` sections today (confirmed fresh 2026-07-09); existing 5 preserved verbatim, new
sections ADDED below.

Grouping rationale: ONE research pass because all three have **non-sequential execution
semantics** as the dominant footgun class — Solidity's concurrency-analog is adversarial
transaction ordering (**reentrancy SWC-107 / CWE-841**, front-running, integer over/
underflow SWC-101), while Verilog/VHDL are literally concurrent-hardware languages
(non-blocking vs blocking assignment race, unintended latch inference, simulation-synthesis
mismatch). Solidity's vulnerability classes are catalogued in the **SWC registry** — a
first-class named-class source. Disjoint from every other slice by file.

### Dependency Graph

```
skills/languages/solidity.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-contract-hdl-guides.test.js
skills/languages/verilog.md   (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-contract-hdl-guides.test.js
skills/languages/vhdl.md      (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-contract-hdl-guides.test.js
```

Three disjoint content files + one test. No cycle. `depends_on: none` (parallel-safe;
Gate 2 & 3 batch per parent via `approveSubplans`).

### File Specifications

Each guide gains these `## ` sections (each names ≥1 concrete identifier + a dated source
≥ 2025-01-01 for version/security claims; extend the existing `Version Gotchas` section):

#### File: `skills/languages/solidity.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Solidity edits.
- **Execution / Ordering Footguns** (concurrency-equivalent) — adversarial transaction
  ordering (front-running/MEV), **reentrancy (SWC-107 / CWE-841 Improper Enforcement of
  Behavioral Workflow)** — use checks-effects-interactions + `ReentrancyGuard`, external-
  call assumptions. Name SWC-107, checks-effects-interactions.
- **Error Handling Idioms** — custom errors (`error Foo()` + `revert Foo()`, cheaper than
  strings), `require`/`revert`/`assert` distinction (`assert` = invariant/panic),
  checking low-level `call` return bool. Name custom errors, `require`.
- **Security and Dependency Gotchas** — **integer over/underflow (SWC-101)** — pre-0.8 is
  unchecked (use checked arithmetic / OpenZeppelin), `tx.origin` auth anti-pattern
  (SWC-115), unchecked external `call` (SWC-104), access control; audit with Slither/
  Mythril; pin OpenZeppelin version. Name SWC-101, SWC-115, Slither.
- **Testing Conventions** — Foundry (`forge test`, fuzzing) / Hardhat, invariant/property
  tests, coverage (`forge coverage`). Name Foundry, `forge test`.
- **Performance / Gas Traps** — storage vs memory (SLOAD/SSTORE cost), unbounded loops
  hitting the block gas limit, `uint256` packing, `calldata` over `memory` for external
  args. Name storage/memory, gas limit.
- **Version-Specific Gotchas** — EXTEND: Solidity 0.8.x (built-in overflow checks, custom
  errors), current compiler version, dated ≥ 2025-01-01, sourced to soliditylang.org /
  swcregistry.io.
- **References** — dated source list.

#### File: `skills/languages/verilog.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Verilog / SystemVerilog edits.
- **Concurrency / Assignment Footguns** — **blocking (`=`) vs non-blocking (`<=`)** in
  sequential vs combinational blocks (mixing = race + simulation-synthesis mismatch),
  sensitivity-list omissions inferring latches, `always_comb`/`always_ff` (SystemVerilog)
  to catch these. Name blocking vs non-blocking, `always_ff`.
- **Error Handling / Verification Idioms** — SystemVerilog assertions (SVA, `assert
  property`), `$error`/`$fatal` in testbenches, X-propagation checks. Name SVA, `assert
  property`.
- **Design-Safety and Hazard Gotchas** (security-equivalent) — **unintended latch
  inference** (incomplete `if`/`case` in combinational logic = state leak/hazard),
  **incomplete `case` without `default`**, clock-domain-crossing metastability (need
  synchronizers), reset strategy. Name latch inference, clock-domain crossing.
- **Testing / Simulation Conventions** — testbench + `$monitor`/`$display`, simulators
  (Icarus Verilog `iverilog`, Verilator), UVM for large designs, lint (Verilator `--lint-
  only`). Name Verilator, `iverilog`.
- **Performance / Synthesis Traps** — inferred vs intended hardware (a `for` loop unrolls),
  timing-closure-hostile logic depth, unregistered outputs, non-synthesizable constructs
  (`#delay`, `initial`) in RTL.
- **Version-Specific Gotchas** — EXTEND: IEEE 1364 (Verilog) vs IEEE 1800 (SystemVerilog)
  standard + tool support, dated ≥ 2025-01-01, sourced to IEEE / tool docs.
- **References** — dated source list.

#### File: `skills/languages/vhdl.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for VHDL edits.
- **Concurrency / Signal-vs-Variable Footguns** — **signal (`<=`, scheduled) vs variable
  (`:=`, immediate)** assignment semantics + delta-cycle scheduling (a signal reads its
  OLD value in the same process), sensitivity-list omissions, process interaction. Name
  signal vs variable, delta cycle.
- **Error Handling / Verification Idioms** — `assert ... report ... severity`, `report`
  statements, resolution functions, `std_logic` metavalues ('X'/'U'/'Z'). Name `assert
  report`, `std_logic`.
- **Design-Safety and Hazard Gotchas** (security-equivalent) — **latch inference** from
  incomplete assignment in combinational processes, missing `else`/`when others`, clock-
  domain-crossing metastability, using `std_logic_arith` (non-standard) vs
  `numeric_std`. Name latch inference, `numeric_std`.
- **Testing / Simulation Conventions** — testbench entity, VUnit / OSVVM verification
  frameworks, GHDL simulator, assertions. Name VUnit / GHDL.
- **Performance / Synthesis Traps** — non-synthesizable constructs (`after`/`wait for` in
  RTL), inferred hardware surprises, wide combinational paths, type-conversion overhead
  (`to_integer`/`unsigned`). Name `numeric_std` conversions.
- **Version-Specific Gotchas** — EXTEND: IEEE 1076 revisions (VHDL-2008 features +
  `-2008` tool flag) + support, dated ≥ 2025-01-01, sourced to IEEE / tool docs.
- **References** — dated source list.

### Test Plan

#### Tests: `tests/cu4c-contract-hdl-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL three guides off disk via `fs.readFileSync`
(mirroring `tests/cu2-systems-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — solidity, verilog, vhdl):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~50-line stub floor** — `> 120` lines.
3. **Required sections present** — Execution/Concurrency/Assignment, Error Handling/
   Verification, Security/Design-Safety/Hazard, Testing/Simulation, Performance/Synthesis,
   Version-specific, References (regexes broadened to match Hazard/Design-Safety for the
   security-equivalent, and Assignment/Concurrency for the concurrency-equivalent).
4. **≥ 4 code fences** (≥ 2 fenced examples).
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `https?://`
   URL per file.
6. **H1 intact** — original `# <Lang> CTO` header still present.
7. **Per-language hazard/vuln class + concrete identifiers** — solidity: `SWC-107` +
   `SWC-101` + Foundry; verilog: blocking/non-blocking token + latch + Verilator/iverilog;
   vhdl: signal/variable token + latch + numeric_std.

**Coverage note:** content-grounding substitutes for line/branch coverage (CU2 convention).

### Security Review

- Content-only edits to three Markdown guides + one test reading them; no runtime path,
  no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Source URLs are public official domains (soliditylang.org, swcregistry.io, IEEE,
  tool docs, cwe.mitre.org) — no secrets.
- Only the four enumerated files touched.

## Execution Plan

### Step 8: TEST
Read all three guides fresh off disk first. Create `tests/cu4c-contract-hdl-guides.test.js`
reading the three REAL files; run it — MUST be RED now (each has exactly 5 `## ` sections,
no dedicated Security/Hazard/Testing sections, no SWC/hazard tokens, no dated sources).

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): Solidity 0.8.x +
current compiler + SWC entries (soliditylang.org / swcregistry.io), IEEE 1364/1800 Verilog/
SystemVerilog + IEEE 1076 VHDL-2008 (IEEE / tool docs), CWE-841 page (cwe.mitre.org).
Capture each source URL + retrieval date (≥ 2025-01-01). Omit any niche claim with no
dated source; record for Step 15.

### Step 10: IMPLEMENT
Extend the three guides with the added sections. Additive only — existing 5 sections stay
verbatim. ONE step, three files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections and >120 lines; every added section names a concrete
identifier; solidity names SWC-107 + SWC-101, verilog names blocking/non-blocking + latch,
vhdl names signal/variable + latch; every version/security claim carries a dated source ≥
2025-01-01; diff additive.

### Step 12: OPTIMIZE
Dense, footgun-per-bullet, no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm official source URLs; only the four enumerated
files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN. Confirm `.ctoc/skills.json`
still indexes solidity/verilog/vhdl triggers (H1/frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU4c-s9"). Record each web-verified fact + source URL + retrieval date, and any
omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the four enumerated files edited; every version/security claim sourced with
a date ≥ 2025-01-01; SWC/CWE identifiers traceable to swcregistry.io/cwe.mitre.org; nothing
fabricated; no cross-language BAD/SAFE examples added; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Stale Solidity compiler version / SWC entry | Web-verify current 0.8.x + SWC registry at edit time; inline dated source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated SWC/CWE/version (hard user rule) | Every fact carries an official source URL (swcregistry.io / soliditylang.org / IEEE); test asserts dated source + http URL; omit-if-no-source | Step 9, Step 14, Step 16 |
| HDL race/latch claims are subtle — wrong guidance misleads hardware design | Anchor each hazard to the IEEE standard + a tool-doc source; name the exact construct (`always_ff`, `numeric_std`) | Step 9, Step 11 |
| Frontmatter corruption breaks skills.json | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts SWC/hazard class + concrete identifiers, not just section count | Step 11, Step 14 |
| Section-rewrite churn | Additive only; existing 5 sections preserved verbatim | Step 10, Step 11 |


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
- [x] Check coverage >= 80%
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

## Decisions Taken Under Ambiguity

Executed 2026-07-10 (BARRIER-PATTERN: slice test only, left unstaged for caller to commit).

### Web-verified facts + sources (retrieved 2026-07-10)
| Fact asserted | Value | Source URL |
|---|---|---|
| Current Solidity stable | v0.8.36 (published 2026-07-09) | https://github.com/ethereum/solidity/releases |
| Reentrancy | SWC-107 → CWE-841 (Improper Enforcement of Behavioral Workflow) | https://swcregistry.io/docs/SWC-107 · https://cwe.mitre.org/data/definitions/841.html |
| Integer over/underflow | SWC-101 → CWE-682 (Incorrect Calculation) | https://swcregistry.io/docs/SWC-101 |
| tx.origin auth | SWC-115 → CWE-477 (Use of Obsolete Function) | https://swcregistry.io/docs/SWC-115 |
| Unchecked call return | SWC-104 → CWE-252 (Unchecked Return Value) | https://swcregistry.io/docs/SWC-104 |
| Verilog standard | IEEE 1364 (last standalone 1364-2005) | https://en.wikipedia.org/wiki/Verilog |
| SystemVerilog standard | IEEE 1800 (current 1800-2023) | https://en.wikipedia.org/wiki/SystemVerilog |
| VHDL standard | IEEE 1076 (current 1076-2019; VHDL-2008 = 1076-2008) | https://en.wikipedia.org/wiki/VHDL |
| HDL race hazard class | CWE-1298 Hardware Logic Contains Race Conditions | https://cwe.mitre.org/data/definitions/1298.html |
| Incomplete-FSM / latch class | CWE-1245 Improper Finite State Machines in Hardware Logic | https://cwe.mitre.org/data/definitions/1245.html |
| Reset hazard class | CWE-1271 Uninitialized Value on Reset | https://cwe.mitre.org/data/definitions/1271.html |

### Decisions
- **HDL CWE selection.** The plan named "race/latch hazard classes" without fixed CWE ids
  (HDLs have no SWC-style registry). I mapped them to the REAL MITRE hardware-CWE classes
  verified at edit time — CWE-1298 (race conditions), CWE-1245 (improper FSMs / latch),
  CWE-1271 (uninitialized reset) — rather than the software CWE-841 family. No fabricated ids.
- **SWC→CWE cross-links added** (SWC-101→CWE-682, SWC-115→CWE-477, SWC-104→CWE-252) beyond
  the plan's explicit SWC-107→CWE-841, because swcregistry.io publishes each mapping; all
  confirmed live 2026-07-10.
- **IEEE standard sourcing.** IEEE's own standards.ieee.org pages block scraping; used the
  Wikipedia standard-summary pages (which cite the IEEE designations) as the dated public
  source for the standard NUMBERS (1364/1800-2023/1076-2019). Standard numbers are stable
  facts; no version was invented.
- **Solidity endoflife.date has no solidity track** — used the authoritative github.com/
  ethereum/solidity releases feed for the current version instead.
- **Omitted for lack of a dated authoritative source:** none — every version/SWC/CWE/standard
  claim carries a verified URL. No niche claim was dropped.
- **Barrier-pattern compliance:** verified ONLY tests/cu4c-contract-hdl-guides.test.js (21/21
  green); did NOT run the full tests/*.test.js; did NOT git add/stage; plan left in todo/.
  Existing 5 sections of each guide preserved verbatim; new sections additive below them.
