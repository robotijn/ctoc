# Verilog CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
verilator --lint-only -Wall src/*.v    # Lint
# (Format with IDE or verible)
verilator --cc src/top.v && make -C obj_dir  # Simulate
yosys -p "synth_ice40" src/top.v       # Synthesize
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Verilator** - Fast simulation/lint
- **Icarus Verilog** - Open source simulator
- **Yosys** - Synthesis suite
- **Vivado/Quartus** - FPGA vendor tools
- **cocotb** - Python testbench framework

## Project Structure
```
project/
├── rtl/               # RTL source (.v/.sv)
├── tb/                # Testbenches
├── sim/               # Simulation outputs
├── syn/               # Synthesis outputs
└── constraints/       # Timing/pinout
```

## Non-Negotiables
1. Synchronous design principles
2. Proper reset handling (sync preferred)
3. Avoid latches (complete if/case)
4. Clock domain crossing protocols

## Red Lines (Reject PR)
- Incomplete sensitivity lists
- Blocking assigns in sequential blocks
- Multiple drivers on signals
- Unregistered outputs
- Magic timing delays in RTL
- Combinational loops

## Testing Strategy
- **Unit**: Verilator/Icarus simulation
- **Integration**: cocotb testbenches
- **Formal**: SymbiYosys for verification

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Latch inference | Complete all branches |
| Clock domain crossing | Use sync FIFOs |
| Metastability | Multi-flop synchronizers |
| Timing violations | Proper constraints |

## Performance Red Lines
- No combinational loops
- No excessive logic depth
- No unregistered long paths

## Security Checklist
- [ ] Reset values defined
- [ ] No debug logic in production
- [ ] Secure boot if applicable
- [ ] Side-channel considerations
