# Haskell Strictest Quality Config

Maximum strictness configuration for Haskell projects. Zero tolerance for warnings.

## Mode: Strictest

- Coverage: 90% minimum
- Complexity: Tight limits
- All warnings as errors (`-Werror`)
- All HLint suggestions enforced
- Strict evaluation by default

## HLint Config (`.hlint.yaml`)

```yaml
# HLint configuration - Strictest mode
# Save as .hlint.yaml in project root

- arguments: [--color, --cross, --error=suggestion]

# Enable ALL hint groups
- group: {name: default, enabled: true}
- group: {name: generalise, enabled: true}
- group: {name: monomorphic, enabled: true}
- group: {name: codemodel, enabled: true}
- group: {name: generalise-for-conciseness, enabled: true}
- group: {name: future, enabled: true}

# All partial functions are ERRORS
- error: {lhs: "head x", rhs: "NE.head x", note: "Use NonEmpty.head"}
- error: {lhs: "tail x", rhs: "NE.tail x", note: "Use NonEmpty.tail"}
- error: {lhs: "init x", rhs: "NE.init x", note: "Use NonEmpty.init"}
- error: {lhs: "last x", rhs: "NE.last x", note: "Use NonEmpty.last"}
- error: {lhs: "fromJust x", rhs: "", note: "Never use fromJust - pattern match"}
- error: {lhs: "x !! n", rhs: "", note: "Use safe indexing or NonEmpty"}
- error: {lhs: "read x", rhs: "", note: "Never use read - use readMaybe"}
- error: {lhs: "undefined", rhs: "", note: "Never use undefined"}
- error: {lhs: "error x", rhs: "", note: "Use typed errors, not error"}
- error: {lhs: "fail x", rhs: "", note: "Use typed errors, not fail"}

# Enforce Text over String everywhere
- error: {lhs: "String", rhs: "Text", note: "Use Text, not String"}
- error: {lhs: "[Char]", rhs: "Text", note: "Use Text, not [Char]"}

# Strict data by default
- error: {name: "Use strict Maybe"}
- error: {name: "Use strict tuple"}

# Enforce modern patterns
- error: {lhs: "fmap f x", rhs: "f <$> x", note: "Use <$> operator"}
- error: {lhs: "pure x >>= f", rhs: "f x", note: "Simplify pure >>= to function application"}
- error: {lhs: "return x >>= f", rhs: "f x", note: "Simplify return >>= to function application"}

# Import hygiene
- error: {name: "Redundant import"}
- error: {name: "Use fewer imports"}

# No lazy patterns in strict code
- warn: {lhs: "~(x, y)", rhs: "(x, y)", note: "Avoid lazy patterns in strict code"}

# Enforce point-free where clear
- suggest: {name: "Eta reduce"}
- suggest: {name: "Use section"}
```

## GHC Options for Cabal (`package.cabal`)

```cabal
common strictest-warnings
    ghc-options:
        -- Treat all warnings as errors
        -Werror

        -- All standard warnings
        -Wall
        -Wcompat
        -Widentities
        -Wincomplete-record-updates
        -Wincomplete-uni-patterns
        -Wmissing-deriving-strategies
        -Wmissing-export-lists
        -Wmissing-home-modules
        -Wpartial-fields
        -Wredundant-constraints
        -Wunused-packages

        -- Additional strict warnings
        -Wprepositive-qualified-module
        -Wmissing-local-signatures
        -Wmonomorphism-restriction
        -Wno-implicit-prelude
        -Wmissing-safe-haskell-mode
        -Wunused-type-patterns
        -Wforall-identifier
        -Wgadt-mono-local-binds
        -Wtype-equality-out-of-scope
        -Wtype-equality-requires-operators
        -Wincomplete-record-selectors
        -Wterm-variable-capture

        -- Optimization for catching more issues
        -O2
        -fexpose-all-unfoldings

library
    import: strictest-warnings
    default-language: GHC2024
    default-extensions:
        BangPatterns
        DerivingStrategies
        DerivingVia
        DuplicateRecordFields
        LambdaCase
        NoImplicitPrelude
        OverloadedStrings
        RecordWildCards
        StrictData
        TypeFamilies
        ViewPatterns
```

## GHC Options for Stack (`stack.yaml` / `package.yaml`)

```yaml
# stack.yaml
resolver: lts-23.0  # GHC 9.10.x

ghc-options:
  "$locals": >-
    -Werror
    -Wall
    -Wcompat
    -Widentities
    -Wincomplete-record-updates
    -Wincomplete-uni-patterns
    -Wmissing-deriving-strategies
    -Wmissing-export-lists
    -Wmissing-home-modules
    -Wpartial-fields
    -Wredundant-constraints
    -Wunused-packages
    -Wprepositive-qualified-module
    -Wmissing-local-signatures
    -Wmonomorphism-restriction
    -Wmissing-safe-haskell-mode
    -Wunused-type-patterns
    -O2
```

```yaml
# package.yaml (hpack)
default-extensions:
  - BangPatterns
  - DerivingStrategies
  - DerivingVia
  - DuplicateRecordFields
  - LambdaCase
  - NoImplicitPrelude
  - OverloadedStrings
  - RecordWildCards
  - StrictData
  - TypeFamilies
  - ViewPatterns

ghc-options:
  - -Werror
  - -Wall
  - -Wcompat
  - -Widentities
  - -Wincomplete-record-updates
  - -Wincomplete-uni-patterns
  - -Wmissing-deriving-strategies
  - -Wmissing-export-lists
  - -Wmissing-home-modules
  - -Wpartial-fields
  - -Wredundant-constraints
  - -Wunused-packages
  - -Wprepositive-qualified-module
  - -Wmissing-local-signatures
  - -Wmonomorphism-restriction
  - -Wmissing-safe-haskell-mode
  - -Wunused-type-patterns
  - -O2

language: GHC2024
```

## Fourmolu Config (`fourmolu.yaml`)

```yaml
# fourmolu.yaml - Strictest formatting (no flexibility)
indentation: 2
function-arrows: trailing
comma-style: leading
import-export-style: diff-friendly
indent-wheres: true
record-brace-space: false
newlines-between-decls: 1
haddock-style: multi-line
haddock-style-module: multi-line
let-style: auto
in-style: right-align
single-constraint-parens: always
single-deriving-parens: always
unicode: never
respectful: false  # Enforce consistent formatting
fixities: []
reexports: []
```

## HSpec Test Config

```haskell
{-# OPTIONS_GHC -F -pgmF hspec-discover #-}
```

```haskell
-- test/YourModule/Spec.hs
{-# LANGUAGE GHC2024 #-}
{-# LANGUAGE OverloadedStrings #-}

module YourModule.Spec (spec) where

import Prelude hiding (head, tail, init, last)

import Test.Hspec
import Test.Hspec.QuickCheck (modifyMaxSuccess, prop)
import Test.QuickCheck

import YourModule

spec :: Spec
spec = do
  describe "YourFunction" $ do
    it "handles basic case" $
      yourFunction "input" `shouldBe` "expected"

    -- More QuickCheck iterations for strictest mode
    modifyMaxSuccess (const 1000) $ do
      prop "satisfies identity property" $ \x ->
        yourFunction (inverse x) == x

      prop "is total (no bottom)" $ \x ->
        total (yourFunction x)

  describe "Error handling" $ do
    it "returns Left on invalid input" $
      yourFunction "" `shouldSatisfy` isLeft

    it "never throws exceptions" $
      evaluate (yourFunction "any") `shouldReturn` ()

  describe "Performance properties" $ do
    prop "runs in linear time" $ \xs ->
      length xs > 0 ==>
        within 1000000 (yourFunction xs `seq` True)

-- Helper to check totality
total :: a -> Bool
total x = x `seq` True
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 90% |
| Expressions | 90% |
| Top-level functions | 100% |
| Module coverage | 100% |

## Coverage Setup with Enforcement

```bash
#!/bin/bash
# scripts/check-coverage.sh

set -e

cabal test --enable-coverage

# Parse HPC report and check thresholds
COVERAGE=$(hpc report dist-newstyle/build/*/ghc-*/your-package-*/hpc/vanilla/tix/your-package-test/your-package-test.tix 2>/dev/null | grep -E "expressions used" | grep -oE "[0-9]+%" | head -1 | tr -d '%')

if [ "$COVERAGE" -lt 90 ]; then
    echo "ERROR: Coverage $COVERAGE% is below 90% threshold"
    exit 1
fi

echo "Coverage check passed: $COVERAGE%"
```

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Function length | 20 lines |
| Module length | 300 lines |
| Pattern depth | 3 |
| Import count per module | 15 |
| Export count per module | 20 |
| Type signature complexity | 4 type variables |
| Nesting depth | 3 |
| Parameters per function | 4 |

## Required Custom Prelude

```haskell
-- src/Prelude.hs (re-export safe prelude)
{-# LANGUAGE NoImplicitPrelude #-}
{-# LANGUAGE PackageImports #-}

module Prelude
  ( module BasePrelude
  , module SafePrelude
  ) where

import "base" Prelude as BasePrelude hiding
  ( head
  , tail
  , init
  , last
  , (!!)
  , read
  , undefined
  , error
  , fail
  )

import qualified Data.List.NonEmpty as NE
import Data.Maybe (fromMaybe)
import Data.Text (Text)
import qualified Data.Text as T

-- Safe alternatives
safeHead :: [a] -> Maybe a
safeHead [] = Nothing
safeHead (x:_) = Just x

safeTail :: [a] -> Maybe [a]
safeTail [] = Nothing
safeTail (_:xs) = Just xs

safeIndex :: [a] -> Int -> Maybe a
safeIndex xs n
  | n < 0     = Nothing
  | otherwise = go n xs
  where
    go _ []     = Nothing
    go 0 (x:_)  = Just x
    go i (_:ys) = go (i-1) ys
```

## Install Commands

```bash
# Install tools (using ghcup)
ghcup install ghc 9.10.1
ghcup install cabal 3.12
ghcup install hls 2.9

# Install formatters and linters
cabal install hlint-3.8 fourmolu-0.16 weeder stan

# Or with stack
stack install hlint fourmolu weeder stan
```

## Additional Static Analysis

```bash
# Run weeder to find dead code
weeder --config weeder.toml

# Run stan for additional static analysis
stan --config .stan.toml
```

```toml
# weeder.toml
roots = ["Main.main", "YourModule.exported"]
type-class-roots = true

# .stan.toml
[check]
enable = ["ALL"]

[ignore]
ids = []
```

## Makefile / Script Commands

```makefile
.PHONY: lint format test coverage quality all

lint:
	hlint src/ test/ --error
	stan --config .stan.toml

format:
	fourmolu --mode inplace src/ test/

format-check:
	fourmolu --mode check src/ test/

test:
	cabal test --test-option=--fail-on-focused

coverage:
	./scripts/check-coverage.sh

dead-code:
	weeder --config weeder.toml

quality: format-check lint dead-code test coverage
	@echo "All strictest quality checks passed"

all: quality
```

## CI Pipeline (GitHub Actions)

```yaml
name: Strictest Quality

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: haskell-actions/setup@v2
        with:
          ghc-version: '9.10.1'
          cabal-version: '3.12'

      - name: Cache
        uses: actions/cache@v4
        with:
          path: ~/.cabal
          key: ${{ runner.os }}-cabal-${{ hashFiles('**/*.cabal') }}

      - name: Install tools
        run: cabal install hlint fourmolu weeder stan

      - name: Format check
        run: fourmolu --mode check src/ test/

      - name: Lint
        run: hlint src/ test/ --error

      - name: Build
        run: cabal build -Werror

      - name: Test with coverage
        run: |
          cabal test --enable-coverage
          ./scripts/check-coverage.sh

      - name: Dead code analysis
        run: weeder

      - name: Static analysis
        run: stan
```

## Pre-commit Hook (`.pre-commit-config.yaml`)

```yaml
repos:
  - repo: https://github.com/haskell/pre-commit-hooks
    rev: v0.6.0
    hooks:
      - id: hlint
        args: [--error]
      - id: fourmolu
        args: [--mode, check]
      - id: cabal-fmt
      - id: ormolu-check

  - repo: local
    hooks:
      - id: weeder
        name: weeder
        entry: weeder
        language: system
        files: '\.hs$'
        pass_filenames: false
```
