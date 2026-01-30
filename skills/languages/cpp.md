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
