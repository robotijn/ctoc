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
- **Compiler-default standard differs by toolchain** — do NOT assume: **GCC 15
  defaults to `-std=gnu23` (C23)**, but **Clang still defaults to `-std=gnu17`
  (C17)**. Pass `-std=c23`/`-std=c17` explicitly for portable builds.
  [gcc.gnu.org/gcc-15/changes.html + clang.llvm.org/docs/CommandGuide/clang.html,
  retrieved 2026-07-09]

## Memory-Safety CWE Classes
C has no bounds checking, no lifetime tracking, and no format-string typing — the
compiler will happily emit code that corrupts memory. These are the five classes
that dominate C CVEs; each names its **canonical MITRE identifier** (verified
against the CWE catalog v4.20, cwe.mitre.org) and its impact pattern.

- **CWE-121 — Stack-based Buffer Overflow.** Writing past a fixed stack array
  overwrites the saved return address / adjacent locals → control-flow hijack.
  Trigger: `strcpy`/`sprintf`/`gets`/unbounded `scanf("%s")` into a `char buf[N]`.
  Fix: bounded APIs (`snprintf`, `strncpy` **with explicit NUL**, `fgets`), and
  build with stack canaries (`-fstack-protector-strong`).
  [cwe.mitre.org/data/definitions/121.html, retrieved 2026-07-09]
- **CWE-122 — Heap-based Buffer Overflow.** Writing past a `malloc`'d region
  corrupts heap metadata / adjacent chunks → RCE or crash. Trigger: off-by-one,
  wrong length, unchecked `memcpy` size. Fix: compute sizes with overflow checks
  (below), `-D_FORTIFY_SOURCE=2` (or `=3` on recent GCC/Clang) to add runtime
  bounds checks to `mem*`/`str*`.
  [cwe.mitre.org/data/definitions/122.html, retrieved 2026-07-09]
- **CWE-416 — Use After Free.** Dereferencing a pointer after `free()` reads/writes
  reallocated memory → info leak or arbitrary write (double-free is the sibling).
  Fix: **null the pointer after free** (`free(p); p = NULL;`), single-owner
  discipline, and run **ASan** which catches UAF deterministically.
  [cwe.mitre.org/data/definitions/416.html, retrieved 2026-07-09]
- **CWE-134 — Use of Externally-Controlled Format String.** `printf(user_input)`
  lets an attacker inject `%n`/`%s` to read the stack or write memory. Fix: the
  format string is **always a literal** — `printf("%s", user_input)`, never
  `printf(user_input)`. `-Wformat -Wformat-security` flags it.
  [cwe.mitre.org/data/definitions/134.html, retrieved 2026-07-09]
- **CWE-190 — Integer Overflow or Wraparound.** `size_t n = a * b;` wraps silently,
  so `malloc(n)` under-allocates and the following write overflows the heap
  (CWE-122). Fix: **overflow-checked arithmetic** — C23 `ckd_mul(&r, a, b)`, or
  `calloc(count, size)` (which checks the product internally), or a pre-multiply
  guard (`if (b && a > SIZE_MAX / b) abort();`).
  [cwe.mitre.org/data/definitions/190.html, retrieved 2026-07-09]

```c
// CWE-190 → CWE-122 chain: overflow the size, under-allocate, overflow the heap.
void *bad = malloc(count * size);           // WRONG: count*size can wrap to a tiny value
// SAFE: calloc checks count*size for overflow and zero-initializes.
void *ok = calloc(count, size);             // returns NULL on overflow — check it
if (!ok) return -1;                         // CWE-476-style null-deref guard

// CWE-134: never pass attacker data as the format string.
printf(user_input);                         // WRONG: %n/%s injection
printf("%s", user_input);                   // SAFE: format is a literal
```

## Sanitizers & Static Analysis
Compile-time flags catch a large fraction of the CWE classes above at test time.
All flags verified against the LLVM sanitizer docs, retrieved 2026-07-09.

- **AddressSanitizer** — `-fsanitize=address -g -O1`. Catches CWE-121/122
  (out-of-bounds), CWE-416 (use-after-free), double-free, and leaks. Roughly 2×
  slowdown; test-only, never ship an ASan binary as production.
  [clang.llvm.org/docs/AddressSanitizer.html, retrieved 2026-07-09]
- **UndefinedBehaviorSanitizer** — `-fsanitize=undefined`. Catches signed
  overflow, null deref, misaligned access, and (with `-fsanitize=integer`)
  unsigned wraparound. Add `-fno-sanitize-recover=all` to fail loudly.
  [clang.llvm.org/docs/UndefinedBehaviorSanitizer.html, retrieved 2026-07-09]
- **Warnings as errors** — `-Wall -Wextra -Wformat=2 -Werror`. Treat every
  warning as a bug (a warning today is a CVE tomorrow).
- **Static analysis** — `clang-tidy` (with `clang-analyzer-*`), `cppcheck`, GCC
  `-fanalyzer`. **Fuzzing** — libFuzzer / **OSS-Fuzz** for continuous coverage.

## Concurrency Footguns
- **Data races are UB** — two threads, one write, no synchronization → the
  optimizer may tear or reorder. `volatile` is **NOT** a concurrency primitive
  (it prevents compiler caching, not CPU reordering or atomicity).
- **Use `<stdatomic.h>`** — `atomic_int`, `atomic_fetch_add`,
  `atomic_load_explicit(&x, memory_order_acquire)` for lock-free state; a mutex
  (`pthread_mutex_t`) otherwise.
- **ThreadSanitizer** — `-fsanitize=thread` detects data races at runtime
  (mutually exclusive with ASan).
  [clang.llvm.org/docs/ThreadSanitizer.html, retrieved 2026-07-09]
- **Signal safety** — a signal handler may only call **async-signal-safe**
  functions (`write`, not `printf`/`malloc`). Install handlers with `sigaction()`
  (portable, `SA_RESTART`), not the racy legacy `signal()`.

## Error Handling Idioms
- **Check every allocation and I/O return.** `malloc`/`calloc`/`realloc` return
  `NULL` on failure; `fopen` returns `NULL`; most syscalls return `-1` and set
  `errno`. Dereferencing an unchecked `NULL` is CWE-476 (null-pointer deref).
- **`realloc` trap** — `p = realloc(p, n);` leaks the original block if `realloc`
  fails and returns `NULL`. Use a temp: `void *t = realloc(p, n); if (!t) { free(p);
  return -1; } p = t;`.
- **`errno` discipline** — read `errno` **immediately** after the failing call
  (any later library call may clobber it); use `strerror`/`perror` to report.
- **No silent truncation** — `snprintf` returns the length it *would* have
  written; if that ≥ buffer size, the output was truncated — check it.

## References (retrieved 2026-07-09)
- CWE-121 Stack-based Buffer Overflow: https://cwe.mitre.org/data/definitions/121.html
- CWE-122 Heap-based Buffer Overflow: https://cwe.mitre.org/data/definitions/122.html
- CWE-416 Use After Free: https://cwe.mitre.org/data/definitions/416.html
- CWE-134 Externally-Controlled Format String: https://cwe.mitre.org/data/definitions/134.html
- CWE-190 Integer Overflow or Wraparound: https://cwe.mitre.org/data/definitions/190.html
- CWE-476 NULL Pointer Dereference: https://cwe.mitre.org/data/definitions/476.html
- GCC 15 C23 default (`-std=gnu23`): https://gcc.gnu.org/gcc-15/changes.html
- Clang C dialect default (`-std=gnu17`): https://clang.llvm.org/docs/CommandGuide/clang.html
- AddressSanitizer (`-fsanitize=address`): https://clang.llvm.org/docs/AddressSanitizer.html
- UndefinedBehaviorSanitizer (`-fsanitize=undefined`): https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html
- ThreadSanitizer (`-fsanitize=thread`): https://clang.llvm.org/docs/ThreadSanitizer.html
- glibc source fortification (`_FORTIFY_SOURCE`): https://www.gnu.org/software/libc/manual/html_node/Source-Fortification.html
