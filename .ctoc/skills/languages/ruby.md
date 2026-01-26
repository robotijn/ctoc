# Ruby CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
bundle exec rubocop -a                 # Lint (auto-fix)
bundle exec rubocop -A                 # Format (unsafe fixes)
bundle exec rspec --format progress    # Test
bundle exec rake build                 # Build gem
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Ruby 3.3+** - YJIT enabled by default
- **RuboCop** - Linting and formatting
- **Sorbet/RBS** - Type checking (gradual typing)
- **RSpec** - BDD testing framework
- **Bundler** - Dependency management

## Project Structure
```
project/
├── lib/               # Production code
├── spec/              # RSpec tests
├── sig/               # RBS type signatures
├── Gemfile            # Dependencies
├── Gemfile.lock       # Locked versions
└── .rubocop.yml       # RuboCop config
```

## Non-Negotiables
1. # frozen_string_literal: true in every file
2. Follow Ruby style guide conventions
3. No monkey patching core classes in gems
4. RSpec tests with good coverage

## Red Lines (Reject PR)
- `eval` or `send` with user input
- Monkey patching core classes (String, Array, etc.)
- N+1 queries (use includes/preload)
- Bare rescue without specific exception class
- Secrets hardcoded in code
- Missing frozen_string_literal pragma

## Testing Strategy
- **Unit**: RSpec, <100ms, mock external services
- **Integration**: Database cleaner, VCR for HTTP
- **E2E**: Capybara for web, request specs for API

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| N+1 queries | Use includes(), bullet gem |
| Memory bloat | Streaming, batch processing |
| Thread safety | Mutex, thread-local variables |
| Mutable default args | Use .freeze or nil default |

## Performance Red Lines
- No O(n^2) in hot paths
- No unbounded memory (use find_each for batches)
- No blocking in async (use async gem or Ractors)

## Security Checklist
- [ ] Input validated with strong parameters
- [ ] Outputs escaped (ERB auto-escapes, sanitize)
- [ ] Secrets from environment (ENV[], credentials)
- [ ] Dependencies audited (`bundle audit`)
