# C++ CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `new`/`delete` — use `make_unique`/`make_shared`
- Claude suggests C-style casts — use `static_cast`, `dynamic_cast`
- Claude forgets C++23 `import std;` is available
- Claude uses old error handling — consider `std::expected` (C++23)

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `c++23` / `c++26` | Modern standards | C++17 or older |
| `cmake 3.28+` | Build with presets | Older CMake |
| `clang-tidy` | Static analysis | Just compiler warnings |
| `catch2` / `gtest` | Testing | Ad-hoc tests |
| `vcpkg` / `conan` | Package management | Manual deps |

## Patterns Claude Should Use
```cpp
// C++23 patterns
import std;  // Import entire standard library

// std::expected for error handling (C++23)
std::expected<User, Error> fetchUser(int id) {
    if (id < 0) return std::unexpected(Error::InvalidId);
    return User{id, "name"};
}

// std::print for formatted output (C++23)
std::print("Hello, {}!\n", name);

// Deducing this (C++23)
struct Builder {
    template<typename Self>
    auto&& set_name(this Self&& self, string name) {
        self.name_ = move(name);
        return forward<Self>(self);
    }
};

// Smart pointers always
auto ptr = std::make_unique<Resource>();
```

## Anti-Patterns Claude Generates
- Raw `new`/`delete` — use smart pointers
- `(Type)expr` C-style cast — use `static_cast<Type>(expr)`
- `std::endl` in loops — use `'\n'` (no flush)
- Missing `noexcept` on move ops — prevents optimizations
- `virtual` without `override` — use `override` keyword

## Version Gotchas
- **C++26 (2026)**: Reflection, contracts, `std::execution`
- **C++23**: `import std;`, `std::expected`, `std::print`, deducing this
- **C++23**: Flat associative containers (`std::flat_map`)
- **With MSVC**: Check `/std:c++latest` for C++26 features
- **With modules**: Use `import std;` instead of `#include` where supported
- **Standard = ISO number, verify before quoting**: **C++20 is ISO/IEC
  14882:2020**, **C++23 is ISO/IEC 14882:2024** (published 2024, hence the year
  mismatch). **C++26** was feature-complete at the March 2026 ISO meeting but is
  not yet a published standard — treat it as a working draft (N5046), pass
  `-std=c++2c` / `/std:c++latest`.
  [isocpp.org/std/the-standard + en.wikipedia.org/wiki/C%2B%2B26, retrieved
  2026-07-09]
- **`import std;` availability caveat**: it is a C++23 feature but requires a
  recent toolchain *and* the standard-library module to be built/available (Clang
  ≥ 18 with libc++ modules, GCC ≥ 15, MSVC recent). Guard it or keep an
  `#include` fallback for portability.
  [en.wikipedia.org/wiki/C%2B%2B23 (Standard Library Module Support), retrieved
  2026-07-09]

## Undefined Behavior Classes (beyond C)
C++ inherits every C UB class (see the C guide: CWE-121/122 buffer overflow,
CWE-416 use-after-free, CWE-190 integer overflow) and adds its own. UB is
*silent* — code "works" until an optimizer or a new compiler miscompiles it.

- **Dangling reference / use-after-free (CWE-416).** Binding a reference or
  `string_view`/`span` to a temporary, or returning a reference to a local, reads
  freed memory. Classic trap: `const std::string& s = obj.get_name_by_value();` —
  the temporary is destroyed at the end of the full expression.
  [cwe.mitre.org/data/definitions/416.html, retrieved 2026-07-09]
- **Strict aliasing.** Reinterpreting memory through an incompatible pointer type
  (`float f; int i = *(int*)&f;`) is UB; `-O2` may assume the two never alias and
  reorder. Use `std::bit_cast<int>(f)` (C++20) or `memcpy`.
- **Uninitialized read.** Reading an uninitialized scalar/`bool` is UB (a `bool`
  that is neither 0 nor 1 breaks branch assumptions). Always initialize;
  `-Wuninitialized -Wmaybe-uninitialized` and MSan catch it.
- **Signed integer overflow (CWE-190).** UB in C++ (unlike unsigned, which wraps);
  the optimizer assumes it never happens. Use unsigned for wrap semantics or a
  checked-arithmetic helper. UBSan flags it.
  [cwe.mitre.org/data/definitions/190.html, retrieved 2026-07-09]

```cpp
// Dangling reference (CWE-416): reference bound to a temporary.
const std::string& name = user.full_name_by_value();  // WRONG: temp dies immediately
std::string name = user.full_name_by_value();          // SAFE: own the value

// Strict-aliasing-safe reinterpretation (C++20).
int bits = std::bit_cast<int>(some_float);             // SAFE: no aliasing UB
```

## RAII & Resource Leaks
- **RAII is the model**: acquire in a constructor, release in the destructor, let
  scope exit clean up — never rely on a manual `close()`/`delete` on every path
  (an exception skips it). Wrap raw handles (`FILE*`, sockets, `fd`, mutex locks)
  in a scope guard (`std::unique_ptr` with a custom deleter, `std::lock_guard`,
  `std::fstream`).
- **Rule of Zero**: prefer classes that own nothing raw, so the compiler-generated
  special members are correct. If you write one of destructor / copy / move, you
  usually need all five (Rule of Five).
- **Locks are RAII too**: `std::lock_guard`/`std::scoped_lock`, never manual
  `mutex.lock()` / `mutex.unlock()` (an early return or throw leaks the lock →
  deadlock).

## Smart-Pointer Misuse
- **`shared_ptr` reference cycles leak (CWE-401-class memory leak).** Two objects
  holding `shared_ptr` to each other never reach refcount 0 → the destructors
  never run. Break the cycle with **`weak_ptr`** on the back-edge; `lock()` it to
  use.
- **Don't wrap the same raw pointer twice.** `shared_ptr<T>(raw)` built twice from
  one `raw` gives two independent control blocks → double-free. Create with
  `make_shared`/`make_unique` and never touch the raw pointer again.
- **`unique_ptr::release()` vs `reset()`.** `release()` returns the raw pointer and
  gives up ownership **without** freeing — if you drop that return value you leak.
  Use `reset()` to free, `release()` only when handing ownership to another owner.
- **`shared_ptr` is atomic-refcounted (not free).** In hot single-threaded paths a
  `unique_ptr` or a value avoids the atomic increment.

```cpp
struct Node {
    std::shared_ptr<Node> next;   // owning forward edge
    std::weak_ptr<Node>   prev;   // SAFE: back-edge is weak → no cycle leak
};
```

## Iterator Invalidation
Mutating a container can invalidate outstanding iterators, references, and
pointers — using one afterward is UB (often a use-after-free, CWE-416).
- **`vector`**: any insert/`push_back` that **reallocates** (size > capacity)
  invalidates **all** iterators/refs; `erase` invalidates from the erase point on.
  `reserve()` up front, or re-fetch iterators after the op.
- **`string`**: same reallocation rule as `vector`.
- **`deque`**: insert/erase in the middle invalidates all iterators (refs may
  survive at the ends).
- **Node-based (`map`/`set`/`list`/`unordered_*`)**: insert does **not**
  invalidate other elements' iterators; `erase` invalidates only the erased node.
  `unordered_*` **rehash** invalidates iterators (but not references).
- **Erase-while-iterating**: use the return value — `it = v.erase(it);` — or the
  `std::erase`/`std::erase_if` (C++20) free functions.

## Sanitizers & Static Analysis
Same toolchain as the C guide (cross-referenced), verified against the LLVM
sanitizer docs, retrieved 2026-07-09.
- **AddressSanitizer** — `-fsanitize=address`: heap/stack overflow, use-after-free,
  use-after-return (`ASAN_OPTIONS=detect_stack_use_after_return=1`), leaks.
  [clang.llvm.org/docs/AddressSanitizer.html, retrieved 2026-07-09]
- **UndefinedBehaviorSanitizer** — `-fsanitize=undefined`: signed overflow, bad
  casts, misaligned access, invalid `enum`/`bool`. Add `-fsanitize=vptr` for bad
  polymorphic casts.
  [clang.llvm.org/docs/UndefinedBehaviorSanitizer.html, retrieved 2026-07-09]
- **ThreadSanitizer** — `-fsanitize=thread` for data races.
  [clang.llvm.org/docs/ThreadSanitizer.html, retrieved 2026-07-09]
- **Warnings/static** — `-Wall -Wextra -Wpedantic -Werror`, `clang-tidy`
  (`bugprone-*`, `cppcoreguidelines-*`), `cppcheck`, `include-what-you-use`.

## Testing
- **Catch2** (`TEST_CASE`/`REQUIRE`, header-only or CMake-integrated) or
  **GoogleTest** (`TEST`/`EXPECT_*`, `gmock` for mocks). Test the error path, not
  just the happy path; assert on thrown exceptions (`REQUIRE_THROWS_AS` /
  `EXPECT_THROW`). Run under ASan+UBSan in CI so tests double as UB probes.

## Performance
- **`std::endl` flushes** every call — use `'\n'` in loops, flush explicitly once.
- **Move semantics** — take sinks by value and `std::move`, or by `T&&`; mark move
  ctor/assign **`noexcept`** so `vector` can move (not copy) on reallocation.
- **Pass read-only params by `const&`** (or `std::string_view` / `std::span` for
  non-owning views), not by value, to avoid copies.

## References (retrieved 2026-07-09)
- CWE-416 Use After Free: https://cwe.mitre.org/data/definitions/416.html
- CWE-190 Integer Overflow or Wraparound: https://cwe.mitre.org/data/definitions/190.html
- CWE-401 Missing Release of Memory after Effective Lifetime: https://cwe.mitre.org/data/definitions/401.html
- C++ standard (ISO numbers): https://isocpp.org/std/the-standard
- C++23 (ISO/IEC 14882:2024): https://en.wikipedia.org/wiki/C%2B%2B23
- C++26 status (working draft N5046): https://en.wikipedia.org/wiki/C%2B%2B26
- AddressSanitizer (`-fsanitize=address`): https://clang.llvm.org/docs/AddressSanitizer.html
- UndefinedBehaviorSanitizer (`-fsanitize=undefined`): https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html
- ThreadSanitizer (`-fsanitize=thread`): https://clang.llvm.org/docs/ThreadSanitizer.html
