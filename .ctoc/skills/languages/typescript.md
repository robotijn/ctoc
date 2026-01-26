# TypeScript CTO
> Strict mode or nothing.

## Tools (2024-2025)
- **TypeScript 5.x** - Strict mode always
- **ESLint** - With typescript-eslint
- **Prettier** - Consistent formatting
- **Vitest** - Fast testing

## Non-Negotiables
1. Never use `any` - use `unknown`
2. Explicit return types on exported functions
3. Discriminated unions for state
4. Type guards over assertions

## Red Lines
- `any` type anywhere
- `@ts-ignore` without justification
- Non-null assertion `!` without reason
- Unhandled Promise rejections
