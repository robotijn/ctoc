/**
 * CU4a s4 — content-contract tests for the AI/ML fine-tuning & quantized-training
 * framework guides (accelerate.md, peft.md, trl.md, bitsandbytes.md, unsloth.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU4a acceptance criteria for
 * these five files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/memory
 *     section, Error Handling, Security/Dependency, Testing, Performance,
 *     Version-specific, References);
 *   - each guide names its own concrete fine-tuning-correctness identifiers
 *     (accelerate: `accelerate launch`, gradient_accumulation_steps, CWE-502;
 *      peft: lora_alpha, merge_and_unload, target_modules;
 *      trl: SFTTrainer, DPO, chat template;
 *      bitsandbytes: NF4, bnb_4bit_compute_dtype, CWE-502;
 *      unsloth: FastLanguageModel, load_in_4bit, max_seq_length);
 *   - >= 4 code fences (>= 2 fenced single-framework examples) per guide;
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (pypi.org JSON API for accelerate/peft/trl/bitsandbytes/
 * unsloth, huggingface.co docs, github.com release pages, cwe.mitre.org/502 & /94).
 * This test does NOT re-verify the facts; it guards the substance against a future
 * edit dropping it.
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
  accelerate: 'skills/frameworks/ai-ml/accelerate.md',
  peft: 'skills/frameworks/ai-ml/peft.md',
  trl: 'skills/frameworks/ai-ml/trl.md',
  bitsandbytes: 'skills/frameworks/ai-ml/bitsandbytes.md',
  unsloth: 'skills/frameworks/ai-ml/unsloth.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Memory', re: /^##.*(footgun|memory|launch|distributed|patch|adapter|trainer|quantiz|numerical)/im },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s4 — ai-ml fine-tuning guides are substantive (real files, zero doubles)', () => {
  for (const [fw, rel] of Object.entries(GUIDES)) {
    describe(`${fw} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~55-line stub floor', () => {
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

      it('carries at least two fenced code examples (footgun demos)', () => {
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
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Framework> CTO" H1 header');
      });
    });
  }

  it('accelerate names accelerate launch, gradient_accumulation_steps, FSDP/DeepSpeed, CWE-502, and a version token', () => {
    const md = read(GUIDES.accelerate);
    assert.match(md, /accelerate launch/, 'expected `accelerate launch` vs python content');
    assert.match(md, /gradient_accumulation_steps/, 'expected gradient_accumulation_steps content');
    assert.match(md, /accumulate\(/, 'expected accelerator.accumulate() coupling content');
    assert.match(md, /FSDP|DeepSpeed/, 'expected FSDP/DeepSpeed distributed content');
    assert.match(md, /device_map/, 'expected device_map offload content');
    assert.match(md, /CWE-502/, 'expected the CWE-502 deserialization token');
    assert.match(md, /accelerate 1\.\d|1\.14/i, 'expected an accelerate 1.x version token');
  });

  it('peft names lora_alpha, target_modules, merge_and_unload, k-bit prep, CWE-94, and a version token', () => {
    const md = read(GUIDES.peft);
    assert.match(md, /lora_alpha/, 'expected lora_alpha scaling content');
    assert.match(md, /target_modules/, 'expected target_modules content');
    assert.match(md, /merge_and_unload/, 'expected merge_and_unload vs keep-adapter content');
    assert.match(md, /modules_to_save/, 'expected modules_to_save head content');
    assert.match(md, /prepare_model_for_kbit_training/, 'expected QLoRA k-bit prep content');
    assert.match(md, /CWE-94/, 'expected the CWE-94 code-injection token');
    assert.match(md, /peft 0\.\d|0\.19/i, 'expected a PEFT 0.x version token');
  });

  it('trl names SFTTrainer, DPO, chat template, beta/KL, transformers coupling, and a version token', () => {
    const md = read(GUIDES.trl);
    assert.match(md, /SFTTrainer/, 'expected SFTTrainer content');
    assert.match(md, /DPO/, 'expected DPO content');
    assert.match(md, /chat.?template/i, 'expected chat-template mismatch content');
    assert.match(md, /beta|KL/, 'expected DPO beta/KL content');
    assert.match(md, /packing/i, 'expected packing footgun content');
    assert.match(md, /transformers/i, 'expected transformers coupling content');
    assert.match(md, /trl 1\.\d|1\.8/i, 'expected a TRL 1.x version token');
  });

  it('bitsandbytes names NF4, bnb_4bit_compute_dtype, double quant, 8-bit, CWE-502, and a version token', () => {
    const md = read(GUIDES.bitsandbytes);
    assert.match(md, /NF4/i, 'expected NF4 vs FP4 content');
    assert.match(md, /bnb_4bit_compute_dtype/, 'expected bnb_4bit_compute_dtype content');
    assert.match(md, /double.?quant/i, 'expected double-quantization content');
    assert.match(md, /8-bit|load_in_8bit/i, 'expected 8-bit optimizer/threshold content');
    assert.match(md, /CUDA/, 'expected CUDA-only requirement content');
    assert.match(md, /CWE-502/, 'expected the CWE-502 deserialization token');
    assert.match(md, /bitsandbytes 0\.\d|0\.49/i, 'expected a bitsandbytes 0.x version token');
  });

  it('unsloth names FastLanguageModel, load_in_4bit, max_seq_length, import-order, CWE-94, and a version token', () => {
    const md = read(GUIDES.unsloth);
    assert.match(md, /FastLanguageModel/, 'expected FastLanguageModel patch content');
    assert.match(md, /load_in_4bit/, 'expected load_in_4bit content');
    assert.match(md, /max_seq_length/, 'expected max_seq_length RoPE content');
    assert.match(md, /import.{0,40}before|before.{0,40}import|patch/i, 'expected import-order patching content');
    assert.match(md, /GGUF/, 'expected GGUF export correctness content');
    assert.match(md, /CWE-94/, 'expected the CWE-94 code-injection token');
    assert.match(md, /unsloth 2026|2026\.7/i, 'expected an Unsloth 2026.x version token');
  });
});
