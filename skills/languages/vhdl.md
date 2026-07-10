# VHDL CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude forgets `others` in case statements — causes latches
- Claude uses `wait` in synthesizable code — not synthesizable
- Claude creates incomplete signal assignments — latch inference
- Claude uses shared variables for communication — race conditions

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `ghdl` | Open source simulation | Vendor-only |
| `nvc` | Modern VHDL compiler | Ancient tools |
| `vunit` | Testing framework | Manual testbenches |
| `vivado`/`quartus` | FPGA synthesis | Academic only |
| `symbiyosys` | Formal verification | Just simulation |

## Patterns Claude Should Use
```vhdl
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter is
    port (
        clk     : in  std_logic;
        rst_n   : in  std_logic;
        count   : out unsigned(7 downto 0)
    );
end entity counter;

architecture rtl of counter is
    signal counter_reg : unsigned(7 downto 0);
begin
    -- Sequential process with proper reset
    process(clk, rst_n)
    begin
        if rst_n = '0' then
            counter_reg <= (others => '0');
        elsif rising_edge(clk) then
            counter_reg <= counter_reg + 1;
        end if;
    end process;

    -- Combinational with default values
    process(all)  -- VHDL-2008 all sensitivity
    begin
        -- Default assignment prevents latches
        next_state <= current_state;

        case current_state is
            when IDLE    => if start = '1' then next_state <= RUN; end if;
            when RUN     => if done = '1' then next_state <= IDLE; end if;
            when others  => next_state <= IDLE;  -- Required!
        end case;
    end process;

    count <= counter_reg;
end architecture rtl;
```

## Anti-Patterns Claude Generates
- Missing `when others` — causes latches
- `wait` in synthesizable code — simulation only
- No default signal values — latch inference
- `shared variable` for communication — use signals
- Missing process sensitivity — use `all` (VHDL-2008)

## Version Gotchas
- **VHDL-2008**: Use `all` in sensitivity lists
- **numeric_std**: Use instead of std_logic_arith
- **Latches**: Prevent with default signal assignments
- **Delta cycles**: Understand signal vs variable timing
- **With VUnit**: Structured testing recommended

## Concurrency / Signal-vs-Variable Footguns (VHDL is inherently parallel)
Every process and concurrent statement runs in parallel. The Claude-killer is confusing
**signal assignment (`<=`, scheduled)** with **variable assignment (`:=`, immediate)**: a
signal keeps its **old value until the process suspends** and the next **delta cycle**
begins — reading it back in the same process sees the OLD value, not the just-written one.

```vhdl
-- FOOTGUN: reading a signal you just assigned in the same process. `tmp` still holds
-- its previous-delta value here, so `y` is one cycle stale, not `a + b + 1`.
process(a, b)
begin
    tmp <= a + b;        -- signal: scheduled, NOT visible yet
    y   <= tmp + 1;      -- WRONG: reads OLD tmp (previous delta cycle)
end process;

-- SAFE: use a variable for intra-process intermediate results — `:=` updates immediately.
process(a, b)
    variable t : unsigned(7 downto 0);
begin
    t := a + b;          -- variable: immediate
    y <= t + 1;          -- correct: sees the value just computed
end process;
```
- **`<=` (signal, delta-scheduled)** vs **`:=` (variable, immediate)** — use a variable for
  a value you compute and consume within one process pass; use a signal to communicate
  BETWEEN processes / to represent a wire or register.
- **Delta cycles**: a signal update is scheduled for the next delta, not applied inline.
  This is the model behind "signal reads its old value." Racing two processes that write
  the same signal is **CWE-1298 Hardware Logic Contains Race Conditions**.
- Sources: cwe.mitre.org/data/definitions/1298.html, IEEE 1076-2019. See References.

## Error Handling / Verification Idioms
VHDL has no exceptions — verification is **`assert ... report ... severity`** plus the
`std_logic` metavalue checks. A failed `assert` with `severity failure` halts the sim.

```vhdl
-- Self-checking assertion in a testbench.
assert count = expected
    report "count mismatch: got " & integer'image(to_integer(count))
    severity error;   -- note | warning | error | failure

-- Guard against metavalues: 'U' (uninitialized) or 'X' (unknown) leaking into control.
assert not is_x(ctrl)
    report "control line is X/U — uninitialized logic" severity failure;
```
- **`assert ... report ... severity`** (note/warning/error/failure) is the core check;
  **resolution functions** resolve multiple drivers on a `std_logic` signal.
- **`std_logic` metavalues** `'U'` (uninitialized), `'X'` (unknown/conflict), `'Z'`
  (high-impedance) are real values — an uninitialized register reads `'U'`, not `'0'`.
  Check for them rather than assuming a clean `'0'`/`'1'`.

## Design-Safety and Hazard Gotchas (the security-equivalent)
- **Unintended latch inference — CWE-1245 Improper Finite State Machines (FSMs) in Hardware
  Logic.** An incomplete assignment in a **combinational** process (a missing `else`, or a
  `case` without `when others`) makes the tool infer a **latch** to hold the unassigned
  value. Fix: a **default signal assignment** at the top of the process (see Patterns) plus
  `when others` on every `case`.
- **Missing `else` / `when others`** is the dominant latch source in combinational logic.
- **Clock-domain-crossing metastability**: sampling a signal on a foreign clock can settle
  unpredictably — use a two-flop synchronizer / async FIFO, never a single flop.
- **`numeric_std` over `std_logic_arith`**: `std_logic_arith`/`std_logic_unsigned` are
  **non-standard Synopsys packages** with conflicting overloads; use the IEEE-standard
  **`numeric_std`** (`unsigned`/`signed`) for portable, unambiguous arithmetic.
- **Reset — CWE-1271 Uninitialized Value on Reset for Registers Holding Security Settings**:
  reset every state-bearing register that gates behavior; otherwise it powers up as `'U'`.
- Sources: cwe.mitre.org/data/definitions/1245.html, /1271.html. See References.

## Testing / Simulation Conventions
```vhdl
-- Testbench entity has no ports; it instantiates the DUT and drives stimulus.
entity counter_tb is end entity;

architecture sim of counter_tb is
    signal clk : std_logic := '0';
begin
    clk <= not clk after 5 ns;           -- 100 MHz clock (sim-only: `after`)
    -- ... instantiate DUT, drive resets, assert on outputs ...
end architecture sim;
```
- Simulate with **GHDL** (open-source, `ghdl -a/-e/-r`, VHDL-2008 via `--std=08`); structure
  benches with **VUnit** or **OSVVM** for constrained-random + functional coverage. Prefer
  self-checking benches (`assert ... severity error`) over manual waveform inspection.

## Performance / Synthesis Traps
- **Non-synthesizable constructs in RTL**: `wait for` / `after` (delays) and file I/O belong
  in testbenches — a synthesis tool ignores or rejects them, so RTL containing them builds
  differently than it simulates.
- **Wide combinational paths** between registers miss timing — pipeline deep logic.
- **Type-conversion overhead / mistakes**: convert explicitly via `numeric_std`
  (`to_integer(unsigned(x))`, `std_logic_vector(to_unsigned(n, w))`) — implicit or wrong
  conversions between `std_logic_vector`, `unsigned`, and `integer` are a top bug source.

## Version-Specific Gotchas (verified 2026-07-10)
- **VHDL is standardized as IEEE 1076**; the current revision is **IEEE 1076-2019**, and
  **VHDL-2008 is IEEE 1076-2008** [en.wikipedia.org/wiki/VHDL, retrieved 2026-07-10].
- **VHDL-2008 features** Claude forgets: `process(all)` (automatic complete sensitivity
  list — kills whole classes of latch/sim-synth bugs), unary reduction operators, and
  matching `case?`/`when` selectors. Enable with the **`--std=08`** tool flag (GHDL) or the
  equivalent 2008 switch in your vendor tool — older tools default to VHDL-93.
- Prefer `numeric_std` (IEEE standard) over the legacy `std_logic_arith` packages.

## References (retrieved 2026-07-10)
- IEEE 1076 VHDL (current 1076-2019; VHDL-2008 = 1076-2008): https://en.wikipedia.org/wiki/VHDL
- CWE-1298 Hardware Logic Contains Race Conditions: https://cwe.mitre.org/data/definitions/1298.html
- CWE-1245 Improper Finite State Machines in Hardware Logic: https://cwe.mitre.org/data/definitions/1245.html
- CWE-1271 Uninitialized Value on Reset: https://cwe.mitre.org/data/definitions/1271.html
- GHDL simulator (VHDL-2008 via --std=08): https://ghdl.github.io/ghdl/
- VUnit verification framework: https://vunit.github.io/
- OSVVM (constrained-random + coverage): https://osvvm.org/
