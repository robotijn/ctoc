# Elixir CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
mix credo --strict                     # Lint
mix format                             # Format
mix test --cover                       # Test with coverage
mix release                            # Build release
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Elixir 1.16+** - Set-theoretic types coming
- **mix format** - Built-in formatting
- **Credo** - Static analysis
- **Dialyzer** - Type checking via dialyxir
- **ExUnit** - Testing framework

## Project Structure
```
project/
├── lib/project/       # Production code
├── test/              # Test files
├── config/            # Configuration
├── mix.exs            # Project definition
└── .formatter.exs     # Formatter config
```

## Non-Negotiables
1. Supervision trees for fault tolerance
2. Pattern matching for all data handling
3. Immutable data structures everywhere
4. OTP patterns (GenServer, Supervisor)

## Red Lines (Reject PR)
- Mutable state outside GenServer/Agent
- Missing supervision for processes
- Synchronous calls that should be async (cast vs call)
- Missing Dialyzer typespecs on public functions
- Secrets hardcoded in code
- Process spawning without supervision

## Testing Strategy
- **Unit**: ExUnit, <100ms, mock with Mox
- **Integration**: Ecto sandbox for database
- **Property**: StreamData for property-based tests

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Process mailbox overflow | Use GenStage, backpressure |
| ETS table leaks | Proper cleanup on terminate |
| Large binary copies | Use iodata, binary references |
| Blocking GenServer | Use handle_continue, Task |

## Performance Red Lines
- No O(n^2) in hot paths
- No blocking in GenServer callbacks
- No unbounded message queues (use backpressure)

## Security Checklist
- [ ] Input validated with Ecto changesets
- [ ] SQL uses Ecto parameterized queries
- [ ] Secrets from environment/runtime config
- [ ] Dependencies audited (`mix deps.audit`)
