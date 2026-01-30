# Haskell CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses partial functions (`head`, `tail`) — use safe alternatives
- Claude uses `String` for text — use `Text` or `ByteString`
- Claude forgets strict evaluation — causes space leaks
- Claude uses old `*` kind syntax — use `Type` instead

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `ghc 9.10+` | GHC2024 edition | Older GHC |
| `cabal` or `stack` | Build tools | Manual ghc |
| `hlint` | Linting | No linting |
| `fourmolu` | Formatting | ormolu (less features) |
| `hspec` + `QuickCheck` | Testing | Ad-hoc tests |

## Patterns Claude Should Use
```haskell
{-# LANGUAGE GHC2024 #-}

-- Use Type instead of *
import Data.Kind (Type)

-- Safe alternatives to partial functions
import Data.Maybe (listToMaybe)
safeHead :: [a] -> Maybe a
safeHead = listToMaybe

-- Strict fields to avoid space leaks
data User = User
  { name :: !Text
  , age  :: !Int
  }

-- Required type arguments (GHC 9.10+)
idVis :: forall a -> a -> a
idVis _ x = x

-- Use Text, not String
import Data.Text (Text)
import qualified Data.Text as T

processText :: Text -> Text
processText = T.toUpper
```

## Anti-Patterns Claude Generates
- Partial functions: `head`, `tail`, `!!` — use safe alternatives
- `String` for text — use `Text` or `ByteString`
- Lazy fields in data — use `!` for strict fields
- `*` for kinds — use `Type` from `Data.Kind`
- Incomplete pattern matches — handle all cases

## Version Gotchas
- **GHC 9.10**: GHC2024 edition, RequiredTypeArguments
- **GHC2024**: Recommended for new code, more extensions enabled
- **Type vs ***: Use `Type` from `Data.Kind` in modern code
- **LLVM backend**: Can produce faster code for numeric work
- **With effects**: Consider `effectful` over monad transformers
