# Python CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
ruff check . --fix                     # Lint (auto-fix)
ruff format .                          # Format
pytest -v --cov=src --cov-report=term  # Test with coverage
python -m build                        # Build package
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **uv** - Package management (10-100x faster than pip)
- **Ruff** - Lint + format (replaces flake8, black, isort)
- **mypy** - Type checking (strict mode always)
- **pytest** - Testing with pytest-cov for coverage
- **bandit** - Security vulnerability scanning

## Project Structure
```
project/
├── src/project/       # Production code (src layout)
├── tests/             # Test files mirror src/
├── docs/              # Documentation
├── pyproject.toml     # Project config (PEP 621)
└── .python-version    # Python version (pyenv/uv)
```

## Non-Negotiables
1. Type hints everywhere - no untyped public APIs
2. No bare except - always specific exceptions
3. Context managers for resources (files, connections)
4. Tests for business logic (>80% coverage)

## Red Lines (Reject PR)
- `eval()` or `exec()` with user input
- SQL string concatenation (use parameterized queries)
- Mutable default arguments `def f(items=[]):`
- Secrets hardcoded in code
- Missing `if __name__ == "__main__":` guard

## Testing Strategy
- **Unit**: Pure functions, <100ms, mock I/O boundaries
- **Integration**: Real database, containers via testcontainers
- **E2E**: Critical user flows with pytest-playwright

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Late binding in closures | Use default args `lambda x=x: x` |
| Global state mutation | Use dependency injection |
| Import cycles | Restructure or TYPE_CHECKING imports |
| Silent failures in threads | Use concurrent.futures with exceptions |

## Performance Red Lines
- No O(n^2) in hot paths (check nested loops)
- No unbounded memory (use generators for large data)
- No blocking I/O in async code (use aiofiles, asyncpg)

## Security Checklist
- [ ] Input validated with Pydantic
- [ ] Outputs sanitized (XSS, injection)
- [ ] Secrets from environment (python-dotenv)
- [ ] Dependencies audited (`pip-audit` or `uv pip audit`)
