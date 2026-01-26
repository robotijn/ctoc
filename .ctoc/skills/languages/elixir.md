# Elixir CTO
> Fault-tolerant by design.

## Tools (2024-2025)
- **Elixir 1.16+**
- **mix format** - Formatting
- **Credo** - Static analysis
- **Dialyzer** - Type checking
- **ExUnit** - Testing

## Non-Negotiables
1. Supervision trees for fault tolerance
2. Pattern matching everywhere
3. Immutable data
4. OTP patterns

## Red Lines
- Mutable state outside GenServer
- Missing supervision
- Synchronous calls that should be async
- Not using Dialyzer specs
