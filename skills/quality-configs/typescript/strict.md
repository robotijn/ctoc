# TypeScript Strict Quality Config

Strict mode configuration for TypeScript projects with ESLint 9 flat config.

## Mode: Strict

- Coverage: 80% minimum
- Complexity: Standard limits
- Warnings: Treated as errors

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
      // Strict mode: warnings as errors
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',

      // Complexity limits
      'complexity': ['error', { max: 10 }],
      'max-depth': ['error', { max: 4 }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', { max: 4 }],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['error', { max: 4 }],

      // Architecture (prevent circular dependencies)
      'import/no-cycle': 'error',
      'import/no-self-import': 'error',
      'import/no-useless-path-segments': 'error',
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
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
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

## Prettier Config (`.prettierrc`)

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 80% |
| Functions | 80% |
| Statements | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| Cognitive | 15 |
| Function length | 50 lines |
| File length | 400 lines |
| Parameters | 4 |
| Nesting depth | 4 |

## Install Command

```bash
npm install -D typescript eslint @eslint/js typescript-eslint \
  eslint-config-prettier eslint-plugin-import \
  vitest @vitest/coverage-v8 prettier
```

## Package.json Scripts

```json
{
  "scripts": {
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write src/",
    "format:check": "prettier --check src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "quality": "npm run lint && npm run typecheck && npm run test:coverage"
  }
}
```
