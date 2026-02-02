# TypeScript Strictest Quality Config

Maximum strictness configuration for TypeScript projects.

## Mode: Strictest

- Coverage: 90% minimum
- Complexity: Tight limits
- No `any` anywhere
- All warnings as errors

## ESLint Config (`eslint.config.js`)

```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // Strictest: Zero tolerance for any
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // Strictest type safety
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: false,
        allowTypedFunctionExpressions: false,
      }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/strict-boolean-expressions': ['error', {
        allowNullableBoolean: false,
        allowNullableString: false,
        allowNullableNumber: false,
      }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-inferrable-types': 'off', // Require explicit types

      // Strictest complexity limits
      'complexity': ['error', { max: 7 }],
      'max-depth': ['error', { max: 3 }],
      'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', { max: 3 }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['error', { max: 3 }],
      'max-statements': ['error', { max: 15 }],

      // Architecture
      'import/no-cycle': 'error',
      'import/no-self-import': 'error',
      'import/no-useless-path-segments': 'error',
      'import/no-default-export': 'error', // Prefer named exports
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '*.config.js'],
  }
);
```

## TypeScript Config (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],

    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,

    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitOverride": true,

    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,

    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Vitest Config (`vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.*',
        '**/*.d.ts',
        '**/types/',
      ],
    },
  },
});
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 90% |
| Functions | 90% |
| Statements | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 7 |
| Cognitive | 10 |
| Function length | 30 lines |
| File length | 300 lines |
| Parameters | 3 |
| Nesting depth | 3 |
| Statements per function | 15 |

## Install Command

```bash
npm install -D typescript eslint @eslint/js typescript-eslint \
  eslint-config-prettier eslint-plugin-import \
  vitest @vitest/coverage-v8 prettier
```
