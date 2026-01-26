# VHDL CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
nvc --std=2008 -a src/*.vhd            # Analyze
ghdl -a --std=08 src/*.vhd             # Alternative analyze
nvc -e -r testbench                    # Simulate
yosys -m ghdl -p "ghdl src/top.vhd"   # Synthesize
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **GHDL** - Open source simulator
- **NVC** - Modern VHDL compiler
- **Vivado/Quartus** - FPGA synthesis
- **ModelSim** - Industry simulation
- **VUnit** - Testing framework

## Project Structure
```
project/
├── rtl/               # RTL source (.vhd)
├── tb/                # Testbenches
├── sim/               # Simulation outputs
├── syn/               # Synthesis outputs
└── constraints/       # Timing/pinout
```

## Non-Negotiables
1. Entity/architecture separation
2. Proper use of packages
3. Complete process sensitivity lists
4. Standard logic types (std_logic)

## Red Lines (Reject PR)
- Incomplete case statements (use others)
- Missing default signal values
- Wait statements in synthesizable code
- Shared variables for communication
- Non-synthesizable constructs in RTL
- Unregistered combinational outputs

## Testing Strategy
- **Unit**: VUnit test cases
- **Integration**: Full system simulation
- **Formal**: GHDL with formal extensions

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Latch inference | Default values in processes |
| Delta cycle issues | Understand signal updates |
| Type conversion | Use conversion functions |
| Package visibility | Use properly in entities |

## Performance Red Lines
- No combinational loops
- No excessive process complexity
- No unregistered long paths

## Security Checklist
- [ ] Reset values defined for all signals
- [ ] No debug code in production
- [ ] Secure state machine encoding
- [ ] Fault injection considerations
