# Python CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude suggests `pip install` — use `uv` instead (10-100x faster)
- Claude uses old `setup.py` patterns — use `pyproject.toml` (PEP 621)
- Claude forgets free-threaded Python exists (3.13t/3.14t) for true parallelism
- Claude defaults to `requirements.txt` — prefer `uv.lock` for reproducibility

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `uv` | Package management, venvs | `pip`, `pipenv`, `poetry` |
| `ruff` | Lint + format (one tool) | `flake8` + `black` + `isort` |
| `mypy --strict` | Type checking | Skipping types |
| `pytest-cov` | Testing | `unittest` alone |
| `python3.14t` | Free-threaded builds | GIL-bound threading |

## Patterns Claude Should Use
```python
# Modern Python 3.14+ patterns
from typing import Self

class Config:
    def with_timeout(self, timeout: int) -> Self:
        self.timeout = timeout
        return self

# Use structural pattern matching
match response.status:
    case 200: handle_success(response)
    case 404: raise NotFound()
    case _: raise UnexpectedStatus(response.status)
```

## Anti-Patterns Claude Generates
- `def f(items=[]):` — mutable default argument
- `except:` or `except Exception:` — swallows everything
- `import *` — pollutes namespace
- Missing `if __name__ == "__main__":` guard
- `os.system()` — use `subprocess.run()` with shell=False

## Version Gotchas
- **3.14**: Current stable (Jan 2026), free-threaded mode (`python3.14t`), improved error messages
- **3.13**: Free-threaded mode (`python3.13t`), requires `pip>=24.1` for C extensions
- **3.12**: f-string parser rewrite, may break edge cases
- **With asyncio**: Never `time.sleep()` — use `await asyncio.sleep()`
- **With typing**: Use `X | Y` not `Union[X, Y]` (3.10+)
