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

## Concurrency / OTP Footguns
```elixir
# FOOTGUN 1: a GenServer is a SERIAL bottleneck. Every call/cast is handled one
# at a time; slow work in a handle_call blocks all callers and can trip the 5s
# call timeout. Don't funnel a hot read path through one GenServer.
def handle_call(:load, _from, state) do
  {:reply, expensive_io(), state}   # WRONG: serializes every caller
end
# SAFE: reply fast; do slow/independent work in a Task, or read from ETS.

# FOOTGUN 2: Task.async without Task.await LEAKS. The spawned task is LINKED to
# the caller; if you never await it and the caller lives on, results pile up and
# a task crash takes the caller down.
task = Task.async(fn -> work() end)   # must be awaited
result = Task.await(task, 30_000)     # or use Task.Supervisor for isolation
```
- **Unbounded mailbox:** a process receiving faster than it drains grows its
  mailbox without limit → memory blowup. Add backpressure (`GenStage`/`Flow`,
  bounded `poolboy`), not an ever-growing queue.
- **`Task.Supervisor`** isolates faults — supervise tasks so one crash doesn't
  propagate through a link into your caller; use `Task.async_stream` with
  `max_concurrency` for bounded parallel work.
- Source: hexdocs.pm/elixir Task / GenServer. See References.

## Error Handling Idioms
```elixir
# {:ok, v} | {:error, r} + with: chain fallible steps, short-circuit on error.
with {:ok, user}  <- fetch_user(id),
     {:ok, order} <- fetch_order(user) do
  {:ok, order}
else
  {:error, reason} -> {:error, reason}   # any failing step lands here
end

# try/rescue is for EXCEPTIONAL cases, not control flow:
try do
  risky!()
rescue
  e in File.Error -> {:error, e}
end
```
- Return `{:error, reason}` for recoverable/expected outcomes; reserve raising
  (and bang functions like `File.read!`, `Repo.get!`) for truly exceptional paths
  or scripts where a crash is acceptable. Using `File.read!` on a recoverable path
  turns a handleable error into a crash.
- Source: hexdocs.pm/elixir Kernel.SpecialForms.with, "try, catch, and rescue".
  See References.

## Security and Dependency Gotchas
- **Atom exhaustion (CWE-502-adjacent DoS):** atoms are never garbage-collected
  and the table is capped. `String.to_atom/1` / `List.to_atom/1` on user input
  will eventually crash the VM. Use `String.to_existing_atom/1`, which only
  resolves atoms that already exist.
```elixir
# DANGER: unbounded atom creation from user input.
# key = String.to_atom(params["type"])
# SAFE: only maps to pre-existing atoms; raises if the user sends a new one.
key = String.to_existing_atom(params["type"])
```
- **`:erlang.binary_to_term/1` on untrusted bytes** is deserialization of
  untrusted data (**CWE-502 "Deserialization of Untrusted Data"** —
  cwe.mitre.org/data/definitions/502.html): it can forge atoms and complex terms.
  Always pass `[:safe]` — `:erlang.binary_to_term(bin, [:safe])`. This also
  covers Phoenix cookies / any place terms round-trip through the client.
- **Dependencies:** commit `mix.lock`; audit with `mix hex.audit` (retired
  packages) and `mix deps.audit` (the `mix_audit` package, checks the Elixir
  security advisory DB). Verify package checksums on fetch.
- Source: cwe.mitre.org (CWE-502), hexdocs.pm/elixir String.to_existing_atom,
  github.com/mirego/mix_audit. See References.

## Testing Conventions
```elixir
defmodule MathTest do
  use ExUnit.Case, async: true            # async: true runs suites in parallel

  test "adds" do
    assert 2 + 2 == 4
  end

  test "raises on bad input" do
    assert_raise ArgumentError, fn -> String.to_integer("x") end   # error path
  end
end

# StreamData — property-based testing.
use ExUnitProperties
property "reverse twice is identity" do
  check all list <- list_of(integer()) do
    assert list == Enum.reverse(Enum.reverse(list))
  end
end
```
- **ExUnit** is built in (`use ExUnit.Case, async: true` for parallel suites);
  **StreamData** adds property testing; run coverage with `mix test --cover`.
  Assert error paths with `assert_raise`, not only the happy path.
- Source: hexdocs.pm/ex_unit, hexdocs.pm/stream_data. See References.

## Performance Traps
- **`Enum` vs `Stream`:** `Enum` is **eager** — chaining `Enum.map |> Enum.filter`
  materializes an intermediate list at each step. `Stream` is lazy and fuses the
  passes into one traversal; use it for large/infinite pipelines, then force with
  `Enum.to_list`/`Enum.reduce`.
- **`String.length/1` is O(n)** — it counts graphemes by walking the whole
  string; don't call it in a loop. Use `byte_size/1` (O(1)) when bytes suffice.
- **Building large binaries:** append with an **iodata** list and let the runtime
  flatten once, rather than `<<acc::binary, chunk::binary>>` in a loop (repeated
  copies).
- **GenServer as shared mutable state** serializes access — for read-heavy shared
  data use ETS (`:read_concurrency`) instead of routing every read through a
  process.

## Version-Specific Gotchas (dated, sourced)
- **Elixir 1.20.2** is the current release (published 2026-06-23); Elixir **1.20
  supports Erlang/OTP 27–29** per the official compatibility table.
  [github.com/elixir-lang/elixir releases + compatibility-and-deprecations
  (v1.20.2 tag), retrieved 2026-07-10]
- Elixir supports the last three OTP majors at release; pin both Elixir and OTP
  in CI (`.tool-versions` / `asdf`) — a mismatch outside the supported window
  fails to compile. [elixir-lang.org/install, retrieved 2026-07-10]
- **OTP 27+** ships a built-in `json` module and process labels; `Duration` and
  `Process.set_label/1` arrived in Elixir 1.17. [elixir-lang.org, retrieved
  2026-07-10]

## References (retrieved 2026-07-10)
- Elixir releases (current 1.20.2): https://github.com/elixir-lang/elixir/releases
- Elixir/OTP compatibility table: https://hexdocs.pm/elixir/compatibility-and-deprecations.html
- Install & OTP versions: https://elixir-lang.org/install.html
- Task / GenServer: https://hexdocs.pm/elixir/Task.html
- with / SpecialForms: https://hexdocs.pm/elixir/Kernel.SpecialForms.html
- String.to_existing_atom/1: https://hexdocs.pm/elixir/String.html#to_existing_atom/1
- ExUnit: https://hexdocs.pm/ex_unit/ExUnit.html
- StreamData: https://hexdocs.pm/stream_data/StreamData.html
- mix_audit: https://github.com/mirego/mix_audit
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
