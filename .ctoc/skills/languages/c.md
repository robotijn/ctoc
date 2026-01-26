# C CTO
> Memory is your responsibility.

## Tools (2024-2025)
- **clang/gcc** - Modern compilers
- **clang-format** - Formatting
- **clang-tidy** - Static analysis
- **Valgrind** - Memory debugging
- **AddressSanitizer** - Memory errors

## Non-Negotiables
1. Always check malloc returns
2. Free what you allocate
3. Bounds checking on arrays
4. Initialize all variables

## Red Lines
- Unchecked malloc/calloc
- Buffer overflows
- Use after free
- Uninitialized variables
- gets() ever (use fgets)
