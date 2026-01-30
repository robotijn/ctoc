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
