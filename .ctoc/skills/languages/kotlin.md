# Kotlin CTO
> Java done right.

## Tools (2024-2025)
- **Kotlin 2.0+**
- **ktlint** - Linting
- **detekt** - Static analysis
- **Kotest/JUnit 5** - Testing

## Non-Negotiables
1. Null safety - avoid `!!`
2. Data classes for DTOs
3. Coroutines for async
4. Sealed classes for state

## Red Lines
- `!!` operator
- Blocking coroutine scope
- Mutable when immutable works
- Platform types without null checks
