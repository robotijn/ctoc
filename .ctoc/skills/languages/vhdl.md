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
