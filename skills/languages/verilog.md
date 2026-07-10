# Verilog CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses blocking assigns in sequential blocks — use `<=`
- Claude creates incomplete sensitivity lists — causes sim/synth mismatch
- Claude generates latches — complete all if/case branches
- Claude forgets clock domain crossing — use synchronizers

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `verilator` | Fast simulation/lint | Slow simulators |
| `verible` | Linting and formatting | No linting |
| `icarus verilog` | Open source simulation | Vendor-only |
| `yosys` | Synthesis suite | Vendor-only flow |
| `cocotb` | Python testbenches | Manual testbenches |

## Patterns Claude Should Use
```verilog
// Proper sequential logic with non-blocking assigns
always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        counter <= 8'b0;
        data_out <= 32'b0;
    end else begin
        counter <= counter + 1'b1;  // Non-blocking!
        data_out <= data_in;
    end
end

// Complete case statement to avoid latches
always @(*) begin
    case (state)
        IDLE:    next_state = start ? RUNNING : IDLE;
        RUNNING: next_state = done ? DONE : RUNNING;
        DONE:    next_state = IDLE;
        default: next_state = IDLE;  // Required!
    endcase
end

// Clock domain crossing
reg [1:0] sync_ff;
always @(posedge clk_dst) begin
    sync_ff <= {sync_ff[0], async_input};
end
assign sync_output = sync_ff[1];
```

## Anti-Patterns Claude Generates
- `=` in sequential blocks — use `<=` (non-blocking)
- Incomplete sensitivity lists — use `always @(*)`
- Missing `default` in case — causes latches
- Single-flop CDC — use double-flop synchronizer
- Magic delays `#10` in RTL — only in testbenches

## Version Gotchas
- **SystemVerilog**: Preferred for new designs
- **Latches**: Avoided by complete if/case branches
- **CDC**: Always use multi-flop synchronizers
- **Reset**: Prefer synchronous reset for FPGA
- **With cocotb**: Python-based verification is powerful

## Concurrency / Assignment Footguns (Verilog is inherently parallel)
Every `always` block runs concurrently — Verilog is not sequential software. The single
worst Claude failure is **mixing blocking (`=`) and non-blocking (`<=`) assignments**,
which creates a simulation race and a **simulation-vs-synthesis mismatch**: the code
simulates one way and synthesizes to different hardware.

```verilog
// FOOTGUN: blocking (=) in a clocked block. q and q_next update in-order within the
// timestep, so the pipeline collapses in simulation and races against synthesis.
always @(posedge clk) begin
    q      = d;        // WRONG: blocking in sequential logic
    q_next = q;        // reads the just-written q, not the previous cycle's
end

// SAFE: non-blocking (<=) in sequential logic — all RHS sampled, then all LHS updated,
// modelling real flip-flop behaviour. Use always_ff (SystemVerilog) to make the tool
// ENFORCE that this is sequential logic and reject a stray blocking assign.
always_ff @(posedge clk) begin
    q      <= d;
    q_next <= q;       // reads the previous-cycle q, as real hardware does
end
```
- **Rule**: `<=` (non-blocking) in **sequential** (`always_ff`) blocks; `=` (blocking) in
  **combinational** (`always_comb`) blocks. Never mix them in one block.
- **`always_comb` / `always_ff`** (IEEE 1800 SystemVerilog) let the tool check intent and
  build a correct, complete sensitivity list for you — plain `always @(*)` cannot flag a
  latch. This is **CWE-1298 Hardware Logic Contains Race Conditions** territory.
- Sources: cwe.mitre.org/data/definitions/1298.html, IEEE 1800-2023. See References.

## Error Handling / Verification Idioms
Hardware has no exceptions — "error handling" is **assertions + X-propagation checks** in
the testbench. SystemVerilog Assertions (SVA) catch protocol violations at the point they
occur, not three cycles later when the symptom appears.

```systemverilog
// SVA concurrent assertion: req must be granted within 4 cycles, else fail loudly.
property req_granted;
    @(posedge clk) disable iff (!rst_n) req |-> ##[1:4] gnt;
endproperty
assert property (req_granted) else $error("req not granted within 4 cycles");

// Testbench severity tasks — $fatal aborts the sim; $error records and continues.
if (checksum !== expected) $error("checksum mismatch: got %h", checksum);
```
- **`assert property` (SVA)**, immediate `assert`, and `$error`/`$fatal`/`$display` are the
  verification vocabulary. Check for **X-propagation** (unknown `x` leaking through logic
  masks real bugs — an uninitialized reg reads `x`, not 0).

## Design-Safety and Hazard Gotchas (the security-equivalent)
- **Unintended latch inference — CWE-1245 Improper Finite State Machines (FSMs) in Hardware
  Logic.** An incomplete `if` or `case` in combinational logic makes the tool infer a
  **latch** to "remember" the unassigned case — a level-sensitive storage element that
  breaks timing and leaks state. Fix: assign a default at the top of the block, and provide
  a `default:` in every `case`.
- **Incomplete `case` without `default`** is the most common latch source (see the complete
  FSM in Patterns above). `always_comb` + full assignment eliminates it.
- **Clock-domain-crossing (CDC) metastability**: a signal sampled by a different clock can
  settle to an unpredictable value. Use a **two-flop synchronizer** for single-bit control
  and a proper async FIFO / gray-code for buses — a single flop is not enough.
- **Reset strategy — CWE-1271 Uninitialized Value on Reset for Registers Holding Security
  Settings**: registers not reset can power up in an unknown state; reset every state-
  bearing register that gates behavior.
- Sources: cwe.mitre.org/data/definitions/1245.html, /1271.html. See References.

## Testing / Simulation Conventions
```verilog
// Minimal self-checking testbench with $monitor + $display.
module tb;
  reg clk = 0, rst_n = 0;
  always #5 clk = ~clk;                    // 100 MHz clock
  initial begin
    $monitor("t=%0t state=%0d", $time, dut.state);
    rst_n = 0; #20 rst_n = 1;
    #200 $finish;
  end
endmodule
```
- Simulate with **Icarus Verilog (`iverilog`)** or **Verilator** (compiled, very fast);
  lint with `verilator --lint-only` or `verible`. Drive Python testbenches with **cocotb**.
  UVM is the industry framework for large-block verification. Prefer self-checking benches
  (`$error` on mismatch) over eyeballing waveforms.

## Performance / Synthesis Traps
- **A `for` loop unrolls into parallel hardware** — it is not a runtime loop. A loop with a
  large bound generates a large combinational cone (area + timing blow-up).
- **Logic depth kills timing closure**: deep combinational chains between flops miss the
  clock period — pipeline (register intermediate results) to close timing.
- **Non-synthesizable constructs in RTL**: `#delay`, `initial`, `fork/join`, and unbounded
  `while` belong in testbenches only — a synthesis tool ignores or rejects them, so RTL
  containing them simulates differently than it builds. Register your outputs.

## Version-Specific Gotchas (verified 2026-07-10)
- **Verilog is standardized as IEEE 1364** (last standalone revision IEEE 1364-2005); it was
  **merged into SystemVerilog IEEE 1800**, whose current revision is **IEEE 1800-2023**
  [en.wikipedia.org/wiki/SystemVerilog, retrieved 2026-07-10].
- **SystemVerilog constructs** (`always_ff`, `always_comb`, `logic`, SVA) require IEEE 1800
  support — confirm your simulator/synthesis tool enables the SystemVerilog dialect (e.g.
  `iverilog -g2012`, Verilator is SV-native).
- Prefer `logic` over `reg`/`wire` (SystemVerilog) — it removes the reg-vs-wire confusion
  and lets the tool infer the driver.

## References (retrieved 2026-07-10)
- IEEE 1800 SystemVerilog (current 1800-2023): https://en.wikipedia.org/wiki/SystemVerilog
- IEEE 1364 Verilog standard: https://en.wikipedia.org/wiki/Verilog
- CWE-1298 Hardware Logic Contains Race Conditions: https://cwe.mitre.org/data/definitions/1298.html
- CWE-1245 Improper Finite State Machines in Hardware Logic: https://cwe.mitre.org/data/definitions/1245.html
- CWE-1271 Uninitialized Value on Reset: https://cwe.mitre.org/data/definitions/1271.html
- Verilator (lint + fast sim): https://www.veripool.org/verilator/
- Icarus Verilog (iverilog): https://steveicarus.github.io/iverilog/
- cocotb (Python testbenches): https://www.cocotb.org/
