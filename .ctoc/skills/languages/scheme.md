# Scheme CTO
> Elegant Lisp for education and research.

## Tools (2024-2025)
- **Racket** - Full-featured ecosystem
- **Guile** - GNU extension language
- **Chez Scheme** - High performance
- **Chicken** - Compiles to C
- **MIT/GNU Scheme** - Classic implementation

## Non-Negotiables
1. Proper tail calls for iteration
2. Hygenic macros (syntax-rules/syntax-case)
3. Lexical scoping discipline
4. Continuation-passing where appropriate
5. R7RS compatibility for portability

## Red Lines
- set! overuse (prefer functional)
- Non-tail recursion for loops
- Unhygienic macro hacks
- eval for metaprogramming
- Global mutable state
