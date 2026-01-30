# Crystal CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude abuses `.not_nil!` — use proper nil checks
- Claude blocks fibers — use non-blocking I/O
- Claude creates complex macros — keep macros simple
- Claude ignores ameba warnings — fix all warnings

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `crystal 1.x+` | Latest stable | Older versions |
| `crystal tool format` | Built-in formatting | Manual style |
| `ameba` | Static analysis | No linting |
| `spec` | Built-in testing | External frameworks |
| `shards` | Dependency management | Manual deps |

## Patterns Claude Should Use
```crystal
# Proper nil handling with type narrowing
def process(user : User?)
  return unless user  # user is now User, not User?
  puts user.name
end

# Use case for exhaustive checks
def handle(status : Status)
  case status
  when .pending?
    process_pending
  when .active?
    process_active
  when .completed?
    process_completed
  end
end

# Fibers with channels for concurrency
channel = Channel(String).new
spawn do
  channel.send(fetch_data)
end
result = channel.receive

# Timeout with select
select
when result = channel.receive
  process(result)
when timeout(5.seconds)
  raise "Timeout waiting for data"
end
```

## Anti-Patterns Claude Generates
- `.not_nil!` abuse — use type narrowing or guards
- Blocking main fiber — use spawn for I/O
- Complex macros — keep simple, use macro puts to debug
- Ignoring ameba — fix all static analysis warnings
- Missing specs — write tests for public APIs

## Version Gotchas
- **Nil safety**: Compiler enforces nil checks
- **Fibers**: Cooperative, not preemptive
- **Macros**: Compile-time metaprogramming
- **C bindings**: Use `GC.add_finalizer` for cleanup
- **With shards**: Lock versions with `shards.lock`
