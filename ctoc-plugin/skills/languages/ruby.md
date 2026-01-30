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
# Ruby 3.4+ YJIT is ~92% faster than interpreter

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
- **Ruby 3.4**: YJIT ~92% faster, `--yjit-mem-size` option
- **Ruby 3.3**: YJIT default in Rails 7.2+ production
- **YJIT memory**: ~3-4x of `--yjit-exec-mem-size` overhead
- **Ruby 3.5 (Q4 2025)**: Cross-method inlining, ARM64 improvements
- **With Rails 7.2+**: YJIT auto-enabled after boot
