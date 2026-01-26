# D CTO
> Systems programming with modern ergonomics.

## Tools (2024-2025)
- **DMD** - Reference compiler
- **LDC** - LLVM-based (optimized)
- **DUB** - Package manager
- **D-Scanner** - Static analysis
- **dfmt** - Code formatter

## Non-Negotiables
1. @safe by default
2. RAII over manual memory
3. Ranges over raw pointers
4. Template constraints
5. Unit tests in source files

## Red Lines
- @trusted without careful review
- Raw pointers in @safe code
- GC in performance-critical paths without profiling
- Missing scope guards for cleanup
- Unconstrained templates
