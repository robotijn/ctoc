/**
 * CU4c s9 — content-contract tests for the smart-contract + hardware-description
 * language guides (solidity.md, verilog.md, vhdl.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-systems-guides.test.js and the sibling CU4c content tests)
 * and asserts substantive structure — no mocks, no fixtures, no fakes. It guards
 * the CU4c acceptance criteria for these three non-sequential-execution guides:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~50-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (Concurrency/Assignment,
 *     Error Handling/Verification, Security/Design-Safety/Hazard, Testing/Simulation,
 *     Performance/Synthesis, Version, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced examples);
 *   - each guide carries at least one dated source (>= 2025) with an http URL;
 *   - the original H1 header is intact (skills.json indexing not corrupted);
 *   - each guide names its own concrete hazard/vuln class + identifiers:
 *       solidity — SWC-107 + SWC-101 + a CWE + Foundry;
 *       verilog  — blocking/non-blocking + latch + a hardware CWE + Verilator/iverilog;
 *       vhdl     — signal/variable + latch + a hardware CWE + numeric_std.
 *
 * Every version/SWC/CWE/standard/tool fact these guides assert is web-verified
 * against official sources at edit time (github.com/ethereum/solidity release,
 * swcregistry.io, cwe.mitre.org, IEEE 1364/1800/1076). This test does NOT
 * re-verify the facts against the network; it guards the substance on disk
 * against a future edit dropping it.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}

const GUIDES = {
  solidity: 'skills/languages/solidity.md',
  verilog: 'skills/languages/verilog.md',
  vhdl: 'skills/languages/vhdl.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// Regexes broadened to match the concurrency-equivalent (Assignment/Concurrency/
// Ordering) and the security-equivalent (Hazard/Design-Safety/Security) headings.
const REQUIRED_SECTIONS = [
  { name: 'Concurrency/Assignment/Ordering', re: /^##.*(concurren|assignment|ordering|signal|footgun)/im },
  { name: 'Error Handling/Verification', re: /^##.*(error.?handling|verification)/im },
  { name: 'Security/Design-Safety/Hazard', re: /^##.*(security|design.?safety|hazard)/im },
  { name: 'Testing/Simulation', re: /^##.*(test|simulation)/im },
  { name: 'Performance/Synthesis', re: /^##.*(performance|synthesis)/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4c s9 — contract/HDL guides are substantive (real files, zero doubles)', () => {
  for (const [lang, rel] of Object.entries(GUIDES)) {
    describe(`${lang} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~50-line stub floor', () => {
        const md = read(rel);
        const lines = md.split('\n').length;
        assert.ok(lines > 120, `expected > 120 lines (de-stubbed), found ${lines}`);
      });

      it('has all required correction-surface sections', () => {
        const md = read(rel);
        for (const { name, re } of REQUIRED_SECTIONS) {
          assert.match(md, re, `missing required section: ${name}`);
        }
      });

      it('carries >= 4 code fences (>= 2 fenced examples)', () => {
        const md = read(rel);
        const fences = (md.match(/^```/gm) || []).length;
        assert.ok(fences >= 4, `expected >= 4 code fences (>= 2 blocks), found ${fences}`);
      });

      it('carries at least one dated source (>= 2025) with an http URL', () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, 'expected a date token >= 2025');
        assert.match(md, /https?:\/\//, 'expected at least one http(s) source URL');
      });

      it('keeps its original H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Lang> CTO" H1 header');
      });
    });
  }

  it('solidity names SWC-107, SWC-101, a CWE class, checks-effects-interactions, and Foundry', () => {
    const md = read(GUIDES.solidity);
    assert.match(md, /SWC-107/, 'expected SWC-107 reentrancy');
    assert.match(md, /SWC-101/, 'expected SWC-101 integer over/underflow');
    assert.match(md, /CWE-(841|682|477|252)/, 'expected a mapped CWE class (841/682/477/252)');
    assert.match(md, /checks-effects-interactions/i, 'expected the checks-effects-interactions ordering rule');
    assert.match(md, /Foundry|forge test/i, 'expected the Foundry / forge test convention');
    assert.match(md, /swcregistry\.io/, 'expected the swcregistry.io source URL');
    assert.match(md, /0\.8\.\d/, 'expected a Solidity 0.8.x version token');
  });

  it('verilog names blocking/non-blocking, latch inference, a hardware CWE, and a simulator', () => {
    const md = read(GUIDES.verilog);
    assert.match(md, /non-?blocking/i, 'expected blocking vs non-blocking assignment');
    assert.match(md, /latch/i, 'expected unintended latch inference');
    assert.match(md, /CWE-(1298|1245|1271)/, 'expected a hardware CWE (race/FSM/reset)');
    assert.match(md, /always_ff|always_comb/, 'expected SystemVerilog always_ff/always_comb');
    assert.match(md, /Verilator|iverilog|Icarus/i, 'expected Verilator / iverilog simulator');
    assert.match(md, /1364|1800/, 'expected an IEEE 1364/1800 standard token');
  });

  it('vhdl names signal/variable, latch inference, a hardware CWE, numeric_std, and delta cycle', () => {
    const md = read(GUIDES.vhdl);
    assert.match(md, /signal.{0,20}variable|variable.{0,20}signal/i, 'expected signal vs variable semantics');
    assert.match(md, /latch/i, 'expected unintended latch inference');
    assert.match(md, /CWE-(1298|1245|1271)/, 'expected a hardware CWE (race/FSM/reset)');
    assert.match(md, /numeric_std/, 'expected numeric_std over std_logic_arith');
    assert.match(md, /delta.?cycle/i, 'expected delta-cycle scheduling');
    assert.match(md, /1076|VHDL-2008/, 'expected an IEEE 1076 / VHDL-2008 standard token');
  });
});
