# F# CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `null` — use `Option` types in F#
- Claude uses `Option.get` — use pattern matching instead
- Claude confuses `async`/`task` — use `task` CE for C# interop
- Claude ignores exhaustiveness warnings — handle all DU cases

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `F# 10` / `.NET 10` | Latest with parallel compilation | Older versions |
| `fantomas` | Official formatting | Manual style |
| `fsharplint` | Linting | No linting |
| `expecto` or `xunit` | Testing | Ad-hoc tests |
| `ionide` | VS Code extension | No IDE support |

## Patterns Claude Should Use
```fsharp
// Use Option, not null
let findUser id : User option =
    users |> List.tryFind (fun u -> u.Id = id)

// Pattern matching, not Option.get
match findUser id with
| Some user -> processUser user
| None -> handleNotFound ()

// F# 10: Struct optional parameters (less allocation)
let greet ([<Struct>] ?name: string) =
    printfn "Hello, %s" (defaultArg name "World")

// Railway-oriented programming
let validateAndSave input =
    input
    |> validate
    |> Result.bind transform
    |> Result.bind save

// Task CE for C# interop
task {
    let! data = httpClient.GetStringAsync(url)
    return processData data
}
```

## Anti-Patterns Claude Generates
- Using `null` — use `Option` types
- `Option.get` — pattern match instead
- `async` when calling C# — use `task` CE
- Incomplete pattern matches — handle all cases
- `.Result`/`.Wait()` on async — use `let!` binding

## Version Gotchas
- **F# 10**: `#warnon` directive, struct optional params, parallel compilation
- **ParallelCompilation**: Enable in project for faster builds
- **Task CE**: Preferred for C# interop over async CE
- **Null from C#**: Wrap external nullable values in `Option`
- **With C# libs**: F# on inside (domain), C# on outside (framework)

## Concurrency / Async Footguns
F# has TWO async models and Claude mixes them: the F#-native **`async { }`**
computation expression (cold, cancellation-token-threaded, `Async.*`) and the
.NET **`task { }`** CE (hot `Task`, for C#/`await` interop). Pick one per surface.

```fsharp
// async { } is COLD: nothing runs until you start it.
let job = async { return! fetch url }   // not running yet
let r = job |> Async.RunSynchronously   // FOOTGUN: blocks; deadlocks on a
                                        // single-thread sync context (UI/ASP.NET legacy)

// SAFE: stay async to the edge; only block at a true top-level entry point.
let r2 = job |> Async.StartAsTask       // -> Task, for interop
async {
    let! data = fetchAsync url          // let! awaits without blocking
    return process data
}

// task { } is HOT and interop-friendly (equivalent to C# await):
task {
    let! s = httpClient.GetStringAsync url   // real Task; no ConfigureAwait needed in F#
    return s.Length
}
```
- **`Async.RunSynchronously` / `.Result` / `.Wait()` deadlock** when a captured
  synchronization context can't re-enter — the classic sync-over-async hang. Keep
  the whole call chain async; block only once, at `main`.
- Don't `let! x = someTask` inside an `async { }` and expect `Async` semantics —
  convert with `Async.AwaitTask`; conversely use `task { }` when the callee
  returns `Task`.
- Source: learn.microsoft.com F# async programming / task expressions. See References.

## Error Handling Idioms
Model expected failures with **`Result<'T,'TError>`** and `Option`, not
exceptions. Compose with `Result.bind` (railway-oriented programming).

```fsharp
// Railway: short-circuit on the first Error; happy path stays linear.
let validateAndSave input =
    input
    |> validate                 // 'In -> Result<'V, Err>
    |> Result.bind transform    // 'V  -> Result<'T, Err>
    |> Result.bind save         // 'T  -> Result<'Id, Err>

// Exhaustive match on a DU: the incomplete-match warning (FS0025) catches gaps.
let describe status =
    match status with
    | Active   -> "on"
    | Inactive -> "off"
    | Pending  -> "wait"        // omit a case -> compiler warns FS0025
```
- Avoid `failwith`/`raise` for control flow; reserve exceptions for genuinely
  unexpected conditions. Wrap C# APIs that return `null` in `Option`.
- Treat the **incomplete-match warning (FS0025)** as an error
  (`<WarningsAsErrors>25</WarningsAsErrors>` or `--warnaserror:25`) so a
  non-exhaustive `match` fails the build.
- Source: learn.microsoft.com F# `Result`/pattern matching. See References.

## Security and Dependency Gotchas
- **Deserialization — CWE-502 applies to .NET-hosted F#.** `BinaryFormatter`
  is dangerous by design (arbitrary code execution on deserializing untrusted
  data) and is **removed/obsoleted** in modern .NET; likewise `NetDataContract`,
  `SoapFormatter`, and unsafe `JavaScriptSerializer`/`TypeNameHandling` in
  Newtonsoft. Use **`System.Text.Json`** with concrete types. (CWE-502
  "Deserialization of Untrusted Data" — cwe.mitre.org/data/definitions/502.html.)
- **NuGet supply chain**: scan with `dotnet list package --vulnerable
  --include-transitive` (queries the GitHub Advisory DB) and pin with a
  lock file (`<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>` +
  committed `packages.lock.json`). Enable NuGet package signature verification.
- Source: learn.microsoft.com BinaryFormatter security guide; cwe.mitre.org
  CWE-502. See References.

## Testing Conventions
```fsharp
// Expecto + FsCheck property test (generate + shrink):
open Expecto
open FsCheck

let props =
  testList "list" [
    testProperty "reverse is involutive" <| fun (xs: int list) ->
        List.rev (List.rev xs) = xs           // property, not one example
  ]

[<EntryPoint>]
let main argv = runTestsWithCLIArgs [] argv props
```
- Run via **`dotnet test`** with **Expecto** (F#-idiomatic) or **xUnit**;
  **`FsCheck`** drives property-based tests. Measure coverage with **coverlet**
  (`dotnet test --collect:"XPlat Code Coverage"`).

## Performance Traps
- **`seq` is lazy AND re-evaluates.** Enumerating the same `seq` twice runs the
  pipeline twice (and any side effects twice). Materialize with `List.ofSeq` /
  `Array.ofSeq` if you iterate more than once or need a stable snapshot.
- **Struct vs reference tuples**: default tuples heap-allocate; annotate hot-path
  tuples/records with `[<Struct>]` to keep them on the stack and cut GC pressure.
- **`List` vs `Array`**: F# `list` is a singly linked list — O(n) index, poor
  cache locality; use `Array` for random access and numeric loops.
- Closures capturing variables allocate; in tight loops prefer explicit
  parameters or `[<Struct>]` delegates.

## Version-Specific Gotchas (dated, sourced)
- **.NET 10** is the current **LTS**, released **2025-11-11** (latest patch
  **10.0.9**, 2026-06-09; supported until 2028-11-14).
  [endoflife.date/dotnet, retrieved 2026-07-10]
- **F# 10** is the language version that ships with the .NET 10 SDK.
  [learn.microsoft.com/dotnet/fsharp/whats-new/fsharp-10, retrieved 2026-07-10]
- **.NET 9** (2024-11-12, F# 9) is STS and reaches end of support **2026-11-10** —
  move off it. [endoflife.date/dotnet, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- .NET release status: https://endoflife.date/dotnet
- F# 10 what's new: https://learn.microsoft.com/en-us/dotnet/fsharp/whats-new/fsharp-10
- F# async programming: https://learn.microsoft.com/en-us/dotnet/fsharp/tutorials/asynchronous-and-concurrent-programming/async
- BinaryFormatter security guide: https://learn.microsoft.com/en-us/dotnet/standard/serialization/binaryformatter-security-guide
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
- FsCheck: https://fscheck.github.io/FsCheck/
