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

## Evaluation / Space-Leak Footguns
Haskell is lazy by default, so the single most common Claude-generated bug is a
**thunk pile-up** — an accumulator that is never forced grows an O(n) chain of
unevaluated closures and blows the heap. `-O2` does NOT fix this; it is
algorithmic, not an optimizer's job.

```haskell
-- FOOTGUN: lazy foldl builds n nested thunks, then forces them all at the end.
total = foldl (+) 0 [1..10_000_000]     -- space leak / stack blowup

-- SAFE: foldl' (Data.List) forces the accumulator at each step — strict spine.
import Data.List (foldl')
total = foldl' (+) 0 [1..10_000_000]     -- constant space

-- Strict fields stop leaks in accumulating records:
{-# LANGUAGE BangPatterns #-}
data Stats = Stats { !count :: !Int, !sumX :: !Double }   -- ! = strict field
```
- **Lazy `Map` accumulators leak**: `Data.Map.insertWith (+)` on the lazy
  `Data.Map` retains thunks in every value. Use **`Data.Map.Strict`** (values
  forced to WHNF on insert) for counters/accumulators.
- `seq` forces to weak-head normal form only (one constructor deep); use
  `Control.DeepSeq.deepseq`/`force` to force a whole structure (e.g. before
  handing work to another thread or writing a checkpoint).
- A lazy field can pin a huge structure alive through a tiny visible value
  (retention). When in doubt, make record fields strict (`!`) and turn on
  `-Wall` + `-fprof-late` when hunting a leak.
- Source: GHC User's Guide, "Strictness" / `Data.List.foldl'` haddock. See References.

## Error Handling Idioms
Prefer **total functions**. Partial functions (`head`, `tail`, `fromJust`, `!!`)
throw at runtime with no type-level warning — they are bombs.

```haskell
-- FOOTGUN: partial functions throw on empty / Nothing.
first = head xs          -- *** Exception: Prelude.head: empty list
x     = fromJust m       -- *** Exception: Maybe.fromJust: Nothing

-- SAFE: encode failure in the type.
import Data.Maybe (listToMaybe)
import qualified Data.List.NonEmpty as NE
firstSafe = listToMaybe xs           -- Maybe a
-- or take a NonEmpty and get a total head:
firstNE  = NE.head neList            -- total: NonEmpty guarantees an element

-- Expected failures -> Either / ExceptT, not exceptions:
parseAge :: String -> Either String Int
parseAge s = maybe (Left ("bad age: " <> s)) Right (readMaybe s)
```
- **Resource safety**: use `Control.Exception.bracket acquire release use` (or
  `bracket_`, `finally`) so the release runs even on exception/async-exception —
  never a bare `open ... close` pair.
- `error` and `undefined` abort the program with a call stack; never reach for
  them in library code — return `Either`/`Maybe` or throw a typed exception.
- Source: `Control.Exception` haddock (`bracket`), `Data.List.NonEmpty`. See References.

## Security and Dependency Gotchas
- **Hackage supply chain**: pin every dependency. `cabal freeze` writes
  `cabal.project.freeze` locking exact versions; commit it. `cabal outdated`
  reports drift. For reproducible builds prefer an explicit `index-state:` in
  `cabal.project` so a re-solve can't silently pull a newer, compromised release.
- **Advisories**: the Haskell Security Response Team publishes the community
  advisory database (`haskell/security-advisories`); scan your build plan with
  **`cabal-audit`** / the `hsec-tools` toolchain against it.
- Untrusted input: `read`-based parsing and `Data.Binary`/`Data.Serialize`
  decoders will happily construct values from adversarial bytes — validate
  sizes/shape before decoding; do not `read` untrusted strings.
- Source: haskell/security-advisories (GitHub advisory DB), cabal User's Guide
  (`freeze`, `index-state`). See References.

## Testing Conventions
```haskell
-- hspec structure + QuickCheck property tests (the Haskell standard):
import Test.Hspec
import Test.QuickCheck

main :: IO ()
main = hspec $ do
  describe "reverse" $ do
    it "is its own inverse" $ property $
      \xs -> reverse (reverse xs) == (xs :: [Int])   -- property, not one example
    it "preserves length" $ property $
      \xs -> length (reverse xs) == length (xs :: [Int])
```
- **`QuickCheck`** drives property-based tests (generate + shrink counterexamples);
  pair with **`hspec`** or **`tasty`** as the runner. Test error paths with
  `evaluate x \`shouldThrow\` anyException`.
- Coverage via **HPC**: build with `--enable-coverage` (`cabal test
  --enable-coverage`) to emit `.tix` and an HTML report.

## Performance Traps
- **`String` is `[Char]`** — a linked list of boxed chars. For real text use
  **`Data.Text`**; for bytes use **`Data.ByteString`**. `String` concatenation and
  I/O are pathologically slow.
- **List as a queue** is O(n) per append (`xs ++ [x]`); use `Data.Sequence`
  (`Seq`, amortized O(1) both ends) or a difference list for accumulation.
- **`Data.Map` vs `Data.HashMap`**: ordered `Map` is O(log n); if you only need
  lookup and keys are hashable, `unordered-containers` `HashMap` is faster.
- Numeric hot loops: use **unboxed vectors** (`Data.Vector.Unboxed`) to avoid
  per-element boxing; `-O2` plus strictness annotations matter here.

## Version-Specific Gotchas (dated, sourced)
- **GHC 9.14.1** released **2025-12-19** is the current stable line (marked the
  current supported/LTS release). [endoflife.date/ghc, retrieved 2026-07-10]
- **GHC 9.12.4** (2026-03-27) and **GHC 9.10.3** (2025-09-11) are the prior
  still-supported minor lines. [endoflife.date/ghc, retrieved 2026-07-10]
- **GHC2024** is the current language edition (`{-# LANGUAGE GHC2024 #-}` or
  `default-language: GHC2024`) — it turns on a modern extension set by default;
  prefer it over `Haskell2010`/`GHC2021` for new code.
  [GHC User's Guide, control-over-extensions, retrieved 2026-07-10]
- **`RequiredTypeArguments`** (`forall a -> ...` visible type args) landed in the
  GHC 9.10 series. [GHC 9.10 release notes, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- GHC release status: https://endoflife.date/ghc
- GHC User's Guide (extensions, strictness): https://downloads.haskell.org/ghc/latest/docs/users_guide/
- `Data.List` (`foldl'`): https://hackage.haskell.org/package/base/docs/Data-List.html
- `Control.Exception` (`bracket`): https://hackage.haskell.org/package/base/docs/Control-Exception.html
- Haskell Security Advisory DB: https://github.com/haskell/security-advisories
- QuickCheck: https://hackage.haskell.org/package/QuickCheck
