# TypeScript Legacy Quality Config

Gradual adoption configuration for migrating existing TypeScript projects.

## Mode: Legacy

- Coverage: 50% minimum (baseline)
- Complexity: Relaxed limits
- Warnings allowed (not errors)
- Gradual strictness adoption

## ESLint Config (`eslint.config.js`)

```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Legacy mode: warnings for gradual adoption
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',

      // Relaxed complexity limits
      'complexity': ['warn', { max: 15 }],
      'max-depth': ['warn', { max: 6 }],
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', { max: 6 }],
      'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['warn', { max: 6 }],
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
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2020"],

    "strict": false,
    "noImplicitAny": false,
    "strictNullChecks": false,

    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,

    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,

    "declaration": true,
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
        lines: 50,
        branches: 50,
        functions: 50,
        statements: 50,
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
| Lines | 50% |
| Branches | 50% |
| Functions | 50% |
| Statements | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 15 |
| Cognitive | 20 |
| Function length | 100 lines |
| File length | 600 lines |
| Parameters | 6 |
| Nesting depth | 6 |

## Upgrade Path

To gradually upgrade from Legacy to Strict mode:

1. **Fix all errors first**
   - Address any existing lint errors
   - Fix TypeScript compilation errors

2. **Enable strict TypeScript options one by one**
   ```json
   // Add these incrementally:
   "strictNullChecks": true,
   "noImplicitAny": true,
   "strict": true
   ```

3. **Convert warnings to errors**
   - Change `'warn'` to `'error'` in ESLint config
   - One rule at a time

4. **Increase coverage thresholds**
   - 50% -> 60% -> 70% -> 80%

5. **Tighten complexity limits**
   - Reduce max values gradually

## Install Command

```bash
npm install -D typescript eslint @eslint/js typescript-eslint \
  eslint-config-prettier vitest @vitest/coverage-v8 prettier
```
