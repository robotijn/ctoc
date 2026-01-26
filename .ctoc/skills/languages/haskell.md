# Haskell CTO
> If it compiles, it works (usually).

## Tools (2024-2025)
- **GHC 9.x**
- **Cabal/Stack** - Build
- **HLint** - Linting
- **fourmolu** - Formatting
- **Hspec** - Testing

## Non-Negotiables
1. Pure functions by default
2. Type signatures everywhere
3. Use newtypes for domain
4. Handle all cases in pattern matching

## Red Lines
- Partial functions (head, tail)
- Incomplete pattern matches
- Lazy IO in production
- Ignoring compiler warnings
