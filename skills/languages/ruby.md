# Ruby CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude forgets YJIT is now default in Rails 7.2+ production
- Claude uses bare `rescue` — always specify exception class
- Claude suggests N+1 patterns — use `includes()` or `preload()`
- Claude misses `# frozen_string_literal: true` pragma

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `ruby 3.4+` | YJIT enabled | Ruby 3.2 or older |
| `--yjit` or `RUBY_YJIT_ENABLE=1` | JIT compilation | Interpreter only |
| `rubocop` | Linting + formatting | Manual style |
| `rspec` + `vcr` | Testing with HTTP recording | Manual mocks |
| `bundle audit` | Security scanning | Manual checks |

## Patterns Claude Should Use
```ruby
# frozen_string_literal: true

# YJIT-friendly patterns (avoid redefining core methods)
# Ruby 3.4+ YJIT delivers substantial speedups over the interpreter on real-world Rails workloads — enable it in production

# Proper eager loading
users = User.includes(:posts, :comments).where(active: true)

# Batch processing for large datasets
User.find_each(batch_size: 1000) do |user|
  process(user)
end

# Pattern matching (Ruby 3.0+)
case response
in { status: 200, body: }
  process(body)
in { status: 404 }
  raise NotFoundError
end
```

## Anti-Patterns Claude Generates
- Bare `rescue` — catches everything including syntax errors
- N+1 queries — use `includes()`, install bullet gem
- Monkey patching core classes — breaks YJIT optimizations
- Mutable default args — use `.freeze` or nil default
- `eval` with user input — code injection

## Version Gotchas
- **Ruby 3.4**: YJIT substantially faster on real-world Rails workloads, `--yjit-mem-size` option
- **Ruby 3.3**: YJIT default in Rails 7.2+ production
- **YJIT memory**: ~3-4x of `--yjit-exec-mem-size` overhead
- **Ruby 3.5 (Q4 2025)**: Cross-method inlining, ARM64 improvements
- **With Rails 7.2+**: YJIT auto-enabled after boot

## Concurrency Footguns
- **The GVL (Global VM Lock) means threads do NOT run Ruby code in parallel** on CRuby.
  `Thread` gives you concurrency for I/O-bound work (the GVL is released around blocking
  I/O), never CPU parallelism. For CPU-bound parallelism you need processes or Ractors.
- **Ractors** are Ruby's actor-model parallelism (introduced experimental in Ruby 3.0).
  Only **shareable** objects cross a Ractor boundary: immutable/frozen objects, `Ractor`,
  and a few classes. Passing a mutable object either copies it or moves ownership. Most
  of the stdlib is **not** Ractor-safe — treat "runs under multiple Ractors" as something
  you must test, not assume.
- **Ruby 4.0 (2025-12-25)** added `Ractor::Port` (a dedicated send/receive synchronization
  primitive) and `Ractor.shareable_proc`, and reduced internal global-lock contention so
  Ractors scale better across cores. Ractor is still labelled experimental; the team aims
  to drop that label the following year. — https://www.ruby-lang.org/en/news/2025/12/25/ruby-4-0-0-released/ (retrieved 2026-07-10)
- **`Mutex`, `Queue`, `ConditionVariable`** guard shared state between threads. A `Thread`
  that raises an unhandled exception dies silently unless `Thread.abort_on_exception` or
  `Thread#report_on_exception` is set — a classic "why did my worker just stop" trap.
- **Fiber scheduler** (`Fiber.set_scheduler`) enables non-blocking I/O concurrency; libraries
  like `async` build on it. Blocking C calls inside a fiber still block the whole thread.

```ruby
# Only frozen/shareable data crosses a Ractor boundary.
CONFIG = { workers: 4 }.freeze          # frozen => shareable
r = Ractor.new(CONFIG) do |cfg|
  cfg[:workers] * 2                      # OK: cfg is frozen and shared
end
r.take                                   # => 8

# GVL reality: threads help I/O, not CPU math.
# CPU-bound work should use Ractors or processes, not Thread.new { heavy_compute }.
```

## Error Handling Idioms
- **Bare `rescue` rescues `StandardError`, NOT `Exception`.** That is usually what you want:
  `Exception` includes `SignalException`, `SystemExit`, and `NoMemoryError` — rescuing it
  swallows Ctrl-C and OOM signals. Only ever rescue `Exception` in a top-level supervisor
  that immediately re-raises.
- Always name the class and capture: `rescue SomeError => e`. Writing `rescue StandardError => e`
  explicitly documents the intent; re-raise with bare `raise` inside a `rescue` to preserve
  the original backtrace.
- `ensure` runs whether or not an exception fired — use it for cleanup (closing files,
  releasing locks). A `return`/`next` inside `ensure` silently discards a pending exception.
- `retry` restarts the `begin` block — always cap it with a counter or you get an infinite
  loop against a permanently failing dependency.

```ruby
def fetch(url, attempts: 3)
  tries = 0
  begin
    HTTP.get(url)
  rescue Net::OpenTimeout, Net::ReadTimeout => e   # specific, not bare
    tries += 1
    retry if tries < attempts
    raise                                           # bare raise keeps original backtrace
  ensure
    log_metric(:fetch_attempts, tries)
  end
end
# NEVER: rescue Exception  # swallows SignalException (Ctrl-C) and SystemExit
```

## Security and Dependency Gotchas
- **`Marshal.load`, `YAML.load`, and `Psych.load` on untrusted input are deserialization
  RCE — CWE-502 (Deserialization of Untrusted Data).** They can instantiate arbitrary
  objects and trigger gadget chains. Use `YAML.safe_load` (or `YAML.safe_load_file`), which
  only permits a whitelist of simple types by default. Never `Marshal.load` attacker-controlled
  bytes. — https://cwe.mitre.org/data/definitions/502.html (retrieved 2026-07-10)
- **SQL injection (CWE-89)**: never interpolate into `where("name = '#{params[:q]}'")`.
  Use parameter binding: `where("name = ?", params[:q])` or `where(name: params[:q])`.
  — https://cwe.mitre.org/data/definitions/89.html (retrieved 2026-07-10)
- **Mass assignment**: `Model.new(params)` with unfiltered params lets an attacker set
  `admin: true`. Always use strong parameters (`params.require(:user).permit(:name, :email)`).
- **Dependency auditing**: run `bundle audit` (bundler-audit) in CI against the ruby-advisory-db,
  and commit `Gemfile.lock` so builds are reproducible and pinned.

```ruby
# SAFE: whitelist deserialization + bound parameters.
config = YAML.safe_load(File.read(path), permitted_classes: [Symbol])  # not YAML.load
User.where("email = ?", params[:email])                                 # not "#{params[:email]}"
params.require(:user).permit(:name, :email)                             # not User.new(params)
```

## Testing Conventions
- **RSpec** (`describe`/`context`/`it`, `expect(...).to`) or **Minitest** (`assert_equal`,
  ships with Ruby). Prefer `let`/`subject` over instance-variable setup to avoid stale state.
- **Factories** (`factory_bot`) beat fixtures for readable, minimal test data. Avoid
  `build_stubbed` when you actually need persistence, and vice-versa.
- **Coverage** via `simplecov` — gate CI at your threshold; watch for false-green when a
  branch is executed but never asserted.
- **N+1 detection**: the `bullet` gem flags N+1 queries in test/dev; fix them with
  `includes(:association)` / `preload` / `eager_load`. An N+1 that passes tests still melts
  production.

## Performance Traps
- **YJIT is not a free lunch.** It compiles hot paths but can *deopt* (fall back to the
  interpreter) on megamorphic call sites, `define_method`/`method_missing` metaprogramming,
  and core-method monkey-patching. Measure real effectiveness with
  `RubyVM::YJIT.runtime_stats` rather than assuming it engaged. — https://www.ruby-lang.org/en/news/2024/12/25/ruby-3-4-0-released/ (retrieved 2026-07-10)
- **Object allocation churn** is the usual GC pressure culprit — reuse buffers, prefer
  `<<`/`concat` over building intermediate arrays, and avoid `map.flatten` when `flat_map`
  does it in one pass.
- **`# frozen_string_literal: true`** avoids re-allocating identical string literals every
  call. In Ruby 3.4 unfrozen literals that are mutated emit a "chilled string" deprecation
  path toward frozen-by-default. — https://www.ruby-lang.org/en/news/2024/12/25/ruby-3-4-0-released/ (retrieved 2026-07-10)
- **N+1 queries** are the dominant real-world Rails performance bug — always eager-load.

## Version-Specific Gotchas (Ruby 3.4+)
- **Ruby 3.4.0 (released 2024-12-24/25)** made **Prism the default parser** (replacing
  parse.y), added the **`it` block parameter** (an alias for `_1` in single-arg blocks —
  code that used a local method/variable named `it` inside a block changes meaning), and
  moved further toward frozen string literals ("chilled strings"). — https://www.ruby-lang.org/en/news/2024/12/25/ruby-3-4-0-released/ (retrieved 2026-07-10)
- **`--yjit-mem-size`** (default 128 MiB) replaces the older `--yjit-exec-mem-size` as a
  unified YJIT memory cap. — https://www.ruby-lang.org/en/news/2024/12/25/ruby-3-4-0-released/ (retrieved 2026-07-10)
- **Ruby 4.0.0 (2025-12-25)** introduced **"Ruby Box"** namespaces and **ZJIT**, a
  next-generation JIT compiler after YJIT (requires Rust 1.85.0+ to build with `--zjit`;
  currently faster than the interpreter but not yet as fast as YJIT — do not deploy to
  production yet). — https://www.ruby-lang.org/en/news/2025/12/25/ruby-4-0-0-released/ (retrieved 2026-07-10)
- **Bundler compatibility**: pin `bundler` in CI; a newer Bundler resolving against an old
  `Gemfile.lock` format is a common CI-vs-local drift.

## References
- Ruby 3.4.0 release notes — https://www.ruby-lang.org/en/news/2024/12/25/ruby-3-4-0-released/ (retrieved 2026-07-10)
- Ruby 4.0.0 release notes — https://www.ruby-lang.org/en/news/2025/12/25/ruby-4-0-0-released/ (retrieved 2026-07-10)
- Ruby release list — https://www.ruby-lang.org/en/downloads/releases/ (retrieved 2026-07-10)
- CWE-502 Deserialization of Untrusted Data — https://cwe.mitre.org/data/definitions/502.html (retrieved 2026-07-10)
- CWE-89 SQL Injection — https://cwe.mitre.org/data/definitions/89.html (retrieved 2026-07-10)
