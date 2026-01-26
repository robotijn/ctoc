# C++ CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
clang-tidy src/*.cpp --fix             # Lint (auto-fix)
clang-format -i src/*.cpp src/*.h      # Format
ctest --output-on-failure              # Test
cmake --build build --config Release   # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **C++20/23** - Modern standard (concepts, ranges, modules)
- **CMake 3.25+** - Build system with presets
- **clang-format** - Formatting
- **clang-tidy** - Static analysis (modernize checks)
- **Catch2/GoogleTest** - Testing frameworks

## Project Structure
```
project/
├── src/               # Production code
├── include/project/   # Public headers
├── tests/             # Test files
├── CMakeLists.txt     # Build config
├── CMakePresets.json  # Build presets
└── .clang-format      # Format config
```

## Non-Negotiables
1. Smart pointers only - no raw new/delete
2. RAII for all resource management
3. Use STL containers and algorithms
4. const correctness everywhere

## Red Lines (Reject PR)
- Raw new/delete (use make_unique/make_shared)
- Manual memory management
- C-style casts (use static_cast, etc.)
- Undefined behavior (UBSan clean)
- Missing virtual destructor in base class
- Secrets hardcoded in source

## Testing Strategy
- **Unit**: Catch2/GoogleTest, <100ms, mock interfaces
- **Integration**: Real system resources with fixtures
- **Fuzzing**: libFuzzer for parsing/input handling

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Use-after-free | Smart pointers, RAII |
| Iterator invalidation | Range-for or indices |
| Dangling references | Return by value, avoid refs to locals |
| Exception safety | RAII, noexcept where appropriate |

## Performance Red Lines
- No O(n^2) in hot paths
- No unnecessary copies (move semantics, string_view)
- No heap allocation in tight loops

## Security Checklist
- [ ] Input bounds checked (no buffer overflows)
- [ ] Format strings validated (no printf with user input)
- [ ] Secrets from environment variables
- [ ] Dependencies audited (vcpkg audit, Conan)
