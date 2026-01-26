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
