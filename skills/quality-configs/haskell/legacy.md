# Haskell Legacy Quality Config

Gradual adoption configuration for migrating existing Haskell projects to modern standards.

## Mode: Legacy

- Coverage: 50% minimum (baseline)
- Complexity: Relaxed limits
- Warnings allowed (not errors)
- Gradual strictness adoption

## HLint Config (`.hlint.yaml`)

```yaml
# HLint configuration - Legacy mode
# Save as .hlint.yaml in project root

- arguments: [--color]

# Enable default hints only
- group: {name: default, enabled: true}
- group: {name: generalise, enabled: false}  # Disabled for legacy
- group: {name: monomorphic, enabled: false}

# Partial functions as warnings (not errors)
- warn: {lhs: "head x", rhs: "safeHead x", note: "Consider safe alternative"}
- warn: {lhs: "tail x", rhs: "safeTail x", note: "Consider safe alternative"}
- warn: {lhs: "fromJust x", rhs: "fromMaybe defaultValue x", note: "Consider handling Nothing"}
- warn: {lhs: "x !! n", rhs: "x !? n", note: "Consider safe indexing"}

# Suggestions only (no enforcement)
- suggest: {lhs: "read x", rhs: "readMaybe x", note: "readMaybe is safer"}
- suggest: {lhs: "undefined", rhs: "", note: "Remove before production"}

# Allow String for legacy code
# No enforcement of Text

# Ignore common legacy patterns
- ignore: {name: "Use newtype instead of data"}
- ignore: {name: "Eta reduce"}
- ignore: {name: "Use <$>"}
- ignore: {name: "Redundant bracket"}
- ignore: {name: "Use &&"}
- ignore: {name: "Use ||"}
- ignore: {name: "Use if"}
- ignore: {name: "Use unless"}
- ignore: {name: "Use when"}

# Allow long modules during migration
- ignore: {name: "Use module export list"}
```

## GHC Options for Cabal (`package.cabal`)

```cabal
common legacy-warnings
    ghc-options:
        -- Minimal warnings set
        -Wall
        -Wcompat

        -- Explicitly disable strict warnings
        -Wno-missing-export-lists
        -Wno-missing-home-modules
        -Wno-missing-deriving-strategies
        -Wno-unused-packages
        -Wno-prepositive-qualified-module
        -Wno-missing-local-signatures

        -- Keep these for catching real bugs
        -Wincomplete-patterns
        -Wincomplete-record-updates
        -Wincomplete-uni-patterns

library
    import: legacy-warnings
    default-language: Haskell2010  -- Or GHC2021 for transitional
    default-extensions:
        OverloadedStrings
```

## GHC Options for Stack (`stack.yaml` / `package.yaml`)

```yaml
# stack.yaml
resolver: lts-22.0  # Older LTS for stability

ghc-options:
  "$locals": >-
    -Wall
    -Wcompat
    -Wno-missing-export-lists
    -Wno-missing-home-modules
    -Wno-missing-deriving-strategies
    -Wno-unused-packages
```

```yaml
# package.yaml (hpack)
default-extensions:
  - OverloadedStrings

ghc-options:
  - -Wall
  - -Wcompat
  - -Wno-missing-export-lists
  - -Wno-missing-home-modules
  - -Wno-missing-deriving-strategies
  - -Wno-unused-packages

language: Haskell2010
```

## Fourmolu Config (`fourmolu.yaml`)

```yaml
# fourmolu.yaml - Respectful formatting for legacy code
indentation: 2
function-arrows: trailing
comma-style: leading
import-export-style: leading  # More compatible with old code
indent-wheres: true
record-brace-space: false
newlines-between-decls: 1
haddock-style: single-line  # Simpler for legacy
haddock-style-module: null
let-style: auto
in-style: right-align
single-constraint-parens: auto
single-deriving-parens: auto
unicode: never
respectful: true  # Preserve existing formatting choices
fixities: []
reexports: []
```

## HSpec Test Config

```haskell
{-# OPTIONS_GHC -F -pgmF hspec-discover #-}
```

```haskell
-- test/YourModuleSpec.hs
module YourModuleSpec (spec) where

import Test.Hspec
import Test.QuickCheck

import YourModule

spec :: Spec
spec = do
  describe "YourFunction" $ do
    it "handles basic case" $
      yourFunction "input" `shouldBe` "expected"

    it "handles edge case" $
      yourFunction "" `shouldBe` ""
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Branches | 50% |
| Expressions | 50% |
| Top-level functions | 60% |

## Coverage Setup (`cabal.project`)

```
packages: .

-- Coverage optional, not enforced
-- coverage: True
```

```bash
# Generate coverage report (optional)
cabal test --enable-coverage || true
hpc report dist-newstyle/build/*/ghc-*/your-package-*/hpc/vanilla/tix/your-package-test/your-package-test.tix || echo "Coverage report unavailable"
```

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Function length | 80 lines |
| Module length | 800 lines |
| Pattern depth | 6 |
| Import count per module | 40 |
| Export count per module | 50 |
| Type signature complexity | 8 type variables |

## Install Commands

```bash
# Install tools (using ghcup)
ghcup install ghc 9.6.6  # Stable, not bleeding edge
ghcup install cabal 3.10
ghcup install hls 2.6

# Install formatters and linters
cabal install hlint fourmolu

# Or with stack
stack install hlint fourmolu
```

## Makefile / Script Commands

```makefile
.PHONY: lint format test quality

lint:
	hlint src/ test/ || true  # Don't fail on warnings

format:
	fourmolu --mode inplace src/ test/

format-check:
	fourmolu --mode check src/ test/ || echo "Formatting differences found"

test:
	cabal test || stack test

coverage:
	cabal test --enable-coverage || echo "Coverage report generated"

quality: lint test
	@echo "Basic quality checks completed"
```

## Upgrade Path

To gradually upgrade from Legacy to Strict mode:

### Phase 1: Fix Compilation Warnings (2-4 weeks)

```cabal
-- Add one warning at a time:
ghc-options:
    -Wall
    -Wincomplete-patterns      -- Week 1
    -Wincomplete-uni-patterns  -- Week 2
    -Wunused-binds             -- Week 3
    -Wunused-imports           -- Week 4
```

### Phase 2: Modernize Language Extensions (2-4 weeks)

```yaml
# Upgrade from Haskell2010 to GHC2021
language: GHC2021

# Add modern extensions one at a time:
default-extensions:
  - OverloadedStrings      # Already there
  - DerivingStrategies     # Week 1
  - LambdaCase             # Week 2
  - StrictData             # Week 3-4 (requires testing)
```

### Phase 3: Enforce HLint Rules (4-6 weeks)

```yaml
# .hlint.yaml - Progressive enforcement

# Week 1-2: Change suggestions to warnings
- warn: {lhs: "head x", rhs: "safeHead x"}

# Week 3-4: Change warnings to errors for partial functions
- error: {lhs: "head x", rhs: "safeHead x"}

# Week 5-6: Enable more groups
- group: {name: generalise, enabled: true}
```

### Phase 4: Increase Coverage (4-8 weeks)

```typescript
// Gradual coverage increase
Week 1-2: 50% -> 55%
Week 3-4: 55% -> 60%
Week 5-6: 60% -> 70%
Week 7-8: 70% -> 80%
```

### Phase 5: Migrate to Strict (Ongoing)

1. Enable `-Werror` for new modules only
2. Add strict warnings incrementally
3. Adopt custom safe prelude
4. Migrate from `String` to `Text`

## Migration Script

```bash
#!/bin/bash
# scripts/migrate-to-strict.sh

echo "Checking migration readiness..."

# Count hlint warnings
HLINT_WARNINGS=$(hlint src/ 2>&1 | grep -c "Warning\|Error" || echo "0")
echo "HLint warnings: $HLINT_WARNINGS"

# Count TODO/FIXME
TODOS=$(grep -r "TODO\|FIXME" src/ | wc -l)
echo "TODOs remaining: $TODOS"

# Check for partial functions
PARTIALS=$(grep -rE "\bhead\b|\btail\b|\bfromJust\b|\breadIO\b" src/ --include="*.hs" | wc -l)
echo "Partial function usages: $PARTIALS"

# Check for String usage
STRINGS=$(grep -r ":: String" src/ --include="*.hs" | wc -l)
echo "String type usages: $STRINGS"

echo ""
if [ "$HLINT_WARNINGS" -lt 20 ] && [ "$PARTIALS" -lt 10 ]; then
    echo "Ready for Phase 3 (Enforce HLint Rules)"
elif [ "$HLINT_WARNINGS" -lt 50 ]; then
    echo "Ready for Phase 2 (Modernize Extensions)"
else
    echo "Still in Phase 1 (Fix Warnings)"
fi
```

## Legacy Code Patterns to Preserve

```haskell
-- These patterns are OK in legacy mode:

-- String instead of Text (for now)
greet :: String -> String
greet name = "Hello, " ++ name

-- Partial functions with local safety
getFirst :: [a] -> a
getFirst xs = case xs of
  (x:_) -> x
  []    -> error "getFirst: empty list"  -- Document the invariant

-- Old-style deriving
data User = User String Int
  deriving (Show, Eq)  -- No deriving strategy required

-- Long modules (will be split later)
-- Module can exceed 400 lines during migration
```

## Pre-commit Hook (`.pre-commit-config.yaml`)

```yaml
repos:
  - repo: https://github.com/haskell/pre-commit-hooks
    rev: v0.6.0
    hooks:
      - id: hlint
        args: [--no-exit-code]  # Don't fail on warnings
      - id: fourmolu
        args: [--mode, check]
```
