# Haskell Strict Quality Config

Strict mode configuration for Haskell projects using GHC 9.10+ and modern tooling.

## Mode: Strict

- Coverage: 80% minimum
- Complexity: Standard limits
- Warnings: Treated as errors
- Uses GHC2024 edition

## HLint Config (`.hlint.yaml`)

```yaml
# HLint configuration - Strict mode
# Save as .hlint.yaml in project root

- arguments: [--color, --cross]

# Enable all default hints
- group: {name: default, enabled: true}
- group: {name: generalise, enabled: true}
- group: {name: monomorphic, enabled: true}

# Severity escalation - warnings as errors
- error: {lhs: "head x", rhs: "safeHead x", note: "Use safe alternatives"}
- error: {lhs: "tail x", rhs: "safeTail x", note: "Use safe alternatives"}
- error: {lhs: "fromJust x", rhs: "fromMaybe defaultValue x", note: "Handle Nothing case"}
- error: {lhs: "x !! n", rhs: "x !? n", note: "Use safe indexing"}

# Require safe alternatives
- warn: {lhs: "read x", rhs: "readMaybe x", note: "Prefer readMaybe from Text.Read"}
- warn: {lhs: "undefined", rhs: "", note: "Remove undefined before production"}

# Enforce Text over String in function types
- suggest: {lhs: "String -> String", rhs: "Text -> Text", note: "Prefer Text for performance"}

# Complexity hints
- warn: {name: "Use map once", note: "Combine multiple maps into one"}
- warn: {name: "Redundant bracket"}
- warn: {name: "Use camelCase"}

# Import style
- warn: {name: "Use import/export shortcut"}
- suggest: {name: "Qualified imports for common modules"}

# Ignore specific patterns if needed
# - ignore: {name: "Use newtype instead of data", within: [SomeModule]}
```

## GHC Options for Cabal (`package.cabal`)

```cabal
common warnings
    ghc-options:
        -- Standard warnings
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

        -- Strict mode additions
        -Wprepositive-qualified-module
        -Wmissing-local-signatures
        -Wmonomorphism-restriction
        -Wno-implicit-prelude

library
    import: warnings
    default-language: GHC2024
    default-extensions:
        DerivingStrategies
        LambdaCase
        OverloadedStrings
        StrictData
        TypeFamilies
```

## GHC Options for Stack (`stack.yaml` / `package.yaml`)

```yaml
# stack.yaml
resolver: lts-23.0  # GHC 9.10.x

ghc-options:
  "$locals": >-
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
```

```yaml
# package.yaml (hpack)
default-extensions:
  - DerivingStrategies
  - LambdaCase
  - OverloadedStrings
  - StrictData
  - TypeFamilies

ghc-options:
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

language: GHC2024
```

## Fourmolu Config (`fourmolu.yaml`)

```yaml
# fourmolu.yaml - Strict formatting
indentation: 2
function-arrows: trailing
comma-style: leading
import-export-style: diff-friendly
indent-wheres: true
record-brace-space: false
newlines-between-decls: 1
haddock-style: multi-line
haddock-style-module: null
let-style: auto
in-style: right-align
single-constraint-parens: auto
single-deriving-parens: auto
unicode: never
respectful: true
fixities: []
reexports: []
```

## HSpec Test Config (`test/Spec.hs`)

```haskell
{-# OPTIONS_GHC -F -pgmF hspec-discover #-}
```

```haskell
-- test/YourModule/Spec.hs
module YourModule.Spec (spec) where

import Test.Hspec
import Test.Hspec.QuickCheck (prop)
import Test.QuickCheck

import YourModule

spec :: Spec
spec = do
  describe "YourFunction" $ do
    it "handles basic case" $
      yourFunction "input" `shouldBe` "expected"

    prop "satisfies property" $ \x ->
      yourFunction (yourFunction x) == x

  describe "Edge cases" $ do
    it "handles empty input" $
      yourFunction "" `shouldBe` ""

    it "handles special characters" $
      yourFunction "test\n" `shouldBe` "expected\n"
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 80% |
| Expressions | 80% |
| Top-level functions | 100% |

## Coverage Setup (`cabal.project`)

```
packages: .

coverage: True

package *
  hpc: True
```

```bash
# Generate coverage report
cabal test --enable-coverage
hpc report dist-newstyle/build/*/ghc-*/your-package-*/hpc/vanilla/tix/your-package-test/your-package-test.tix

# Or with stack
stack test --coverage
stack hpc report
```

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Function length | 30 lines |
| Module length | 400 lines |
| Pattern depth | 4 |
| Import count per module | 20 |
| Export count per module | 25 |
| Type signature complexity | 5 type variables |

## Install Commands

```bash
# Install tools (using ghcup)
ghcup install ghc 9.10.1
ghcup install cabal 3.12
ghcup install hls 2.9

# Install formatters and linters
cabal install hlint fourmolu

# Or with stack
stack install hlint fourmolu
```

## Cabal Scripts

```cabal
-- In package.cabal
test-suite your-package-test
    type: exitcode-stdio-1.0
    main-is: Spec.hs
    hs-source-dirs: test
    build-depends:
        base ^>=4.20
      , hspec ^>=2.11
      , hspec-discover ^>=2.11
      , QuickCheck ^>=2.15
      , your-package
    default-language: GHC2024
    ghc-options: -threaded -rtsopts -with-rtsopts=-N
```

## Makefile / Script Commands

```makefile
.PHONY: lint format test coverage quality

lint:
	hlint src/ test/ --severity=error

format:
	fourmolu --mode inplace src/ test/

format-check:
	fourmolu --mode check src/ test/

test:
	cabal test

coverage:
	cabal test --enable-coverage
	@echo "Coverage threshold: 80%"

quality: format-check lint test coverage
	@echo "All quality checks passed"
```

## Pre-commit Hook (`.pre-commit-config.yaml`)

```yaml
repos:
  - repo: https://github.com/haskell/pre-commit-hooks
    rev: v0.6.0
    hooks:
      - id: hlint
        args: [--severity=error]
      - id: fourmolu
        args: [--mode, check]
      - id: cabal-fmt
```
