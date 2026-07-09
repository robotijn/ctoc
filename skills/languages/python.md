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

## Concurrency / Async Footguns
The GIL (Global Interpreter Lock) means CPU-bound work in threads does NOT run in
parallel on a stock CPython build — threads still serialize on the interpreter
lock. Free-threaded CPython removes the GIL and is now an **officially supported
build variant** (PEP 703 makes the GIL optional; PEP 779 defines the criteria for
supported status and is **Final** as of 3.14 — invoke via `python3.14t`). For
CPU-bound work on a GIL build, reach for `multiprocessing`/`ProcessPoolExecutor`,
not `threading`.

Async pitfalls Claude reliably generates:

```python
# FOOTGUN 1: asyncio.gather silently swallows failures with return_exceptions=True.
# One task raising is now an *element* in the results list, not a raised exception —
# a missing check turns a crash into silent data corruption.
results = await asyncio.gather(t1(), t2(), return_exceptions=True)
# If you don't inspect each item, exceptions vanish:
for r in results:
    if isinstance(r, Exception):
        raise r  # re-raise or handle — do NOT ignore

# SAFE: structured concurrency — TaskGroup (3.11+) cancels siblings on first failure
async with asyncio.TaskGroup() as tg:      # PEP 654 ExceptionGroup on failure
    tg.create_task(t1())
    tg.create_task(t2())

# FOOTGUN 2: a bare coroutine call does nothing without await — no error, no run.
fetch_data()          # WRONG: coroutine created and dropped ("coroutine was never awaited")
await fetch_data()    # RIGHT

# FOOTGUN 3: blocking the event loop. time.sleep / requests / heavy CPU freeze
# EVERY task on the loop. Use await asyncio.sleep(), an async client, or
# loop.run_in_executor() / asyncio.to_thread() for blocking calls.
```
- Cancellation: `asyncio.CancelledError` derives from `BaseException` (3.8+), so a
  broad `except Exception:` will NOT catch it — good, but do not `except BaseException`
  and swallow cancellation.
- Source: docs.python.org asyncio-task / PEP 654 / PEP 703 / PEP 779. See References.

## Error Handling Idioms
```python
# Bare / broad except hides bugs (KeyboardInterrupt, SystemExit, real errors):
try:
    do()
except Exception:        # too broad — narrow to the exception you expect
    pass                 # NEVER silently pass

# Preserve the cause chain — 'raise ... from' keeps the traceback:
try:
    parse(raw)
except ValueError as e:
    raise ConfigError("bad config") from e   # not a bare raise ConfigError(...)

# Suppress intentionally and explicitly:
from contextlib import suppress
with suppress(FileNotFoundError):
    os.remove(path)

# ExceptionGroup + except* (PEP 654, 3.11+) — handle several failures at once,
# the model TaskGroup raises:
try:
    async with asyncio.TaskGroup() as tg: ...
except* ValueError as eg:      # eg is an ExceptionGroup
    handle(eg.exceptions)
```
- Source: docs.python.org exceptions / PEP 654. See References.

## Security and Dependency Gotchas
- **Deserialization — `pickle` (CWE-502)**: never `pickle.load()` untrusted bytes;
  a crafted payload executes arbitrary code on load. Use `json` for data
  interchange; if you must serialize objects, sign/verify or use a safe format.
  (CWE-502 "Deserialization of Untrusted Data" — cwe.mitre.org.)
- **YAML**: `yaml.load(x)` without a safe loader can construct arbitrary Python
  objects — use `yaml.safe_load(x)`.
- **Command injection — `subprocess` (CWE-78)**: `subprocess.run(cmd, shell=True)`
  with interpolated input is OS command injection. Pass an argv **list** and keep
  `shell=False` (the default). Never `os.system(f"...{user}...")`.
  (CWE-78 "OS Command Injection" — cwe.mitre.org.)
- **PyPI supply chain**: typosquatting (`reqeusts` vs `requests`) and dependency
  confusion (a public package shadowing an internal name) are live attack classes.
  Pin by hash: `uv.lock` records hashes, or `pip install --require-hashes -r
  requirements.txt`. Audit with `pip-audit` (PyPA) against the Python advisory DB.
```python
# SAFE subprocess: argv list, shell=False (default)
subprocess.run(["git", "clone", url], check=True)   # url is an argument, not shell
```
- Source: cwe.mitre.org (CWE-502, CWE-78), pypi.org/project/pip-audit. See References.

## Testing Conventions
```python
import pytest

@pytest.fixture(scope="module")          # scope: function|class|module|session
def client():
    c = make_client(); yield c; c.close()

@pytest.mark.parametrize("n,expected", [(2, 4), (3, 9)])
def test_square(n, expected):
    assert square(n) == expected

def test_raises():
    with pytest.raises(ValueError, match="empty"):   # assert error paths, not just happy
        parse("")
```
- Gate coverage: `pytest --cov=pkg --cov-fail-under=80`. Prefer `pytest` over
  bare `unittest`; use `tmp_path` for filesystem tests, `monkeypatch` for env.

## Performance Traps
- **O(n²) membership**: `if x in a_list` inside a loop is linear each time — use a
  `set` / `dict` for O(1) lookup when checking membership repeatedly.
- **Materializing generators**: `list(map(...))` when you only iterate once wastes
  memory — keep it lazy. But do NOT reuse an exhausted generator (silently empty).
- **`functools.lru_cache`** for pure, hashable-argument functions; beware it pins
  arguments in memory (cache leak) and is not safe across processes.
- **CPU-bound**: on a GIL build, `ProcessPoolExecutor` (or `python3.14t`
  free-threaded), not `ThreadPoolExecutor`.

## Version-Specific Gotchas (dated, sourced)
- **3.14** released **2025-10-07**, latest 3.14.6 (2026-06-10); free-threaded
  (`python3.14t`) is officially supported per PEP 779 (Final).
  [endoflife.date/python, retrieved 2026-07-09]
- **3.13** released 2024-10-07 (EOL 2029-10-31); first free-threaded build
  (`python3.13t`, experimental at that release). [endoflife.date/python, 2026-07-09]
- **3.12** released 2023-10-02; the f-string tokenizer was rewritten (PEP 701),
  which changes some edge-case parsing; `distutils` was removed from the stdlib
  in 3.12. [endoflife.date/python, 2026-07-09; docs.python.org whatsnew/3.12]
- **PEP 695 type parameter syntax** (`class Box[T]:`, `type Alias[T] = ...`) landed
  in 3.12 — prefer it over the old `TypeVar` dance.
  [peps.python.org/pep-0695, retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- Python release status: https://endoflife.date/python
- asyncio tasks: https://docs.python.org/3/library/asyncio-task.html
- PEP 703 (make GIL optional): https://peps.python.org/pep-0703/
- PEP 779 (free-threaded supported status, Final): https://peps.python.org/pep-0779/
- PEP 654 (ExceptionGroup / except*): https://peps.python.org/pep-0654/
- PEP 695 (type parameter syntax): https://peps.python.org/pep-0695/
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
- CWE-78 (OS Command Injection): https://cwe.mitre.org/data/definitions/78.html
- pip-audit (PyPA): https://pypi.org/project/pip-audit/
