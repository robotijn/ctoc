# C CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `sprintf` — use `snprintf` with explicit buffer size
- Claude forgets C23 is now default in GCC 15
- Claude uses old malloc patterns — check returns, use `memset_explicit`
- Claude suggests `gets()` — removed entirely, use `fgets`

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `gcc 15` / `clang 18` | C23 default | Older compilers |
| `-std=c23` | Modern standard | C99/C11 unless required |
| `clang-tidy` | Static analysis | Just compiler warnings |
| `AddressSanitizer` | Memory debugging | Valgrind alone |
| `OSS-Fuzz` | Continuous fuzzing | Ad-hoc testing |

## Patterns Claude Should Use
```c
// C23 modern patterns
#include <stdbit.h>

// nullptr instead of NULL (C23)
int *ptr = nullptr;

// Binary literals with separators (C23)
int flags = 0b1010'1100;

// typeof for type inference (C23)
typeof(x) copy = x;

// Secure memory clearing (C23)
memset_explicit(password, 0, sizeof(password));

// Overflow-checked arithmetic (C23)
bool overflow;
int result = ckd_add(&overflow, a, b);

// Always bounds-check
char buf[256];
snprintf(buf, sizeof(buf), "user: %s", input);
```

## Anti-Patterns Claude Generates
- `sprintf(buf, ...)` — use `snprintf(buf, sizeof(buf), ...)`
- `strcpy(dst, src)` — use `strncpy` or `strlcpy`
- `malloc` without NULL check — always check return
- `printf(user_input)` — format string vulnerability
- `gets()` — use `fgets(buf, size, stdin)`

## Version Gotchas
- **C23 (GCC 15 default)**: `nullptr`, `constexpr`, `typeof`, `#embed`
- **C23**: `memset_explicit()` for secure clearing
- **C23**: Overflow-checked arithmetic (`ckd_add`, etc.)
- **Security deadline**: CISA memory safety roadmaps due Jan 1, 2026
- **With signals**: Use `sigaction()` not `signal()`
