# Elixir CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude spawns processes without supervision — always supervise
- Claude raises exceptions for expected errors — return `{:error, reason}`
- Claude uses mutable state patterns — use GenServer/Agent
- Claude forgets Dialyzer typespecs on public functions

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `elixir 1.19+` | OTP 28 support | Elixir 1.16 or older |
| `mix format` | Built-in formatting | Manual style |
| `credo --strict` | Static analysis | No linting |
| `dialyxir` | Type checking | No types |
| `mox` | Behavior-based mocking | Ad-hoc mocks |

## Patterns Claude Should Use
```elixir
# Always supervise processes
defmodule MyApp.Application do
  use Application

  def start(_type, _args) do
    children = [
      {MyApp.Worker, []},
      {MyApp.Cache, []}
    ]
    Supervisor.start_link(children, strategy: :one_for_one)
  end
end

# Return tuples for expected errors (don't raise)
def fetch_user(id) do
  case Repo.get(User, id) do
    nil -> {:error, :not_found}
    user -> {:ok, user}
  end
end

# Set-theoretic types in patterns (1.17+)
@spec process(list(integer())) :: integer()
def process(numbers) when is_list(numbers) do
  Enum.sum(numbers)
end

# Process labels for debugging (1.17+)
Process.set_label(:my_worker)
```

## Anti-Patterns Claude Generates
- Spawning without supervision — use Supervisor
- `raise` for expected errors — return `{:error, reason}`
- Blocking GenServer callbacks — use `handle_continue`
- Missing `@spec` on public functions — Dialyzer needs them
- Unbounded message queues — use GenStage/backpressure

## Version Gotchas
- **1.17+**: Set-theoretic types, `Duration` type, `Process.set_label/1`
- **1.18+**: WERL removed on Windows, use OTP 26+
- **1.19+**: Requires Erlang/OTP 28.1+
- **OTP 27**: Built-in `json` module
- **With Phoenix**: Use LiveView for real-time, not polling
