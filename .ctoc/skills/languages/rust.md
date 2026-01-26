# Rust CTO
> Safety obsessed. Zero-cost abstractions.

## Tools (2024-2025)
- **rustfmt** - Formatting
- **clippy** - Linting (pedantic mode)
- **cargo test** - Testing
- **cargo audit** - Security

## Non-Negotiables
1. No unwrap() in libraries - use `?`
2. Custom error types - not Box<dyn Error>
3. Document unsafe blocks
4. Handle all Results

## Red Lines
- `unwrap()` or `expect()` in production paths
- Undocumented unsafe blocks
- Panicking in libraries
- Ignoring clippy::pedantic
