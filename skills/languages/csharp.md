# C# CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `.Result`/`.Wait()` — always use `await`
- Claude forgets `field` keyword is preview in C# 13
- Claude ignores nullable reference types — enable project-wide
- Claude suggests `async void` — only valid for event handlers

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `.NET 8 LTS` / `.NET 9` | Latest runtime | .NET 6 or older |
| `C# 13` | New params, field keyword | Older C# |
| `Roslyn analyzers` | Static analysis | Just builds |
| `xUnit` + `NSubstitute` | Testing | MSTest |
| `HybridCache` | Caching (.NET 9) | IDistributedCache alone |

## Patterns Claude Should Use
```csharp
// C# 13: params with any collection type
void Log(params ReadOnlySpan<string> messages) { }

// C# 12+: Primary constructors
public class Service(ILogger logger, IRepository repo)
{
    public void Process() => logger.Log(repo.GetData());
}

// Collection expressions
int[] numbers = [1, 2, 3, 4, 5];
List<string> names = ["Alice", "Bob"];

// Proper async
await foreach (var item in GetItemsAsync(cancellationToken))
{
    await ProcessAsync(item, cancellationToken);
}
```

## Anti-Patterns Claude Generates
- `.Result` or `.Wait()` — causes deadlocks
- `async void` methods — unhandled exceptions
- Ignoring nullable warnings — enable `<Nullable>enable</Nullable>`
- `catch (Exception)` without rethrow — swallows errors
- LINQ multiple enumeration — call `.ToList()` once

## Version Gotchas
- **C# 13**: `field` keyword preview, `params` accepts spans/collections
- **C# 13**: Collection expression binding changes may break code
- **.NET 9**: `HybridCache` solves stampede problem
- **.NET 8 LTS**: Supported until November 2026
- **.NET 9**: Only 18 months support (ends before .NET 8!)

## Security and Dependency Gotchas
- **Deserialization (CWE-502)**: the same impact pattern as Java — untrusted bytes →
  arbitrary object construction → code execution. In .NET the historic offender is
  **`BinaryFormatter`**, plus `SoapFormatter`, `NetDataContractSerializer`, and
  `Newtonsoft.Json` with `TypeNameHandling.All`/`Auto` (embedded `$type` lets the
  payload pick the type to instantiate — a gadget hook). This is
  **CWE-502 "Deserialization of Untrusted Data"**.
  - **`BinaryFormatter` is gone**: starting **.NET 9** the runtime ships **no
    implementation** — the APIs remain but always throw `PlatformNotSupportedException`,
    regardless of project type. Do not try to re-enable it; migrate.
  - **Use `System.Text.Json`** (no polymorphic type resolution unless you opt in via
    `JsonDerivedType`, and even then it's allow-listed) instead of
    `Newtonsoft.Json` with open `TypeNameHandling`. Never bind `$type` from untrusted input.
- **NuGet audit**: `dotnet list package --vulnerable --include-transitive` reports
  known-vulnerable packages (including the transitive tree — that's where the risk
  hides). Enable build-time auditing with **`<NuGetAudit>true</NuGetAudit>`** and
  **`<NuGetAuditMode>all</NuGetAuditMode>`** in your `.csproj`/`Directory.Build.props`;
  set **`<TreatWarningsAsErrors>`** (or elevate NU1901–NU1904) to fail CI on a
  vulnerable dependency rather than merely warn. Warnings here are future incidents.
- Source: cwe.mitre.org (CWE-502), learn.microsoft.com BinaryFormatter migration
  guide + NuGet auditing. See References.

## Concurrency Footguns
```csharp
// FOOTGUN 1: async void — an unawaitable method whose exceptions escape to the
// SynchronizationContext and crash the process. ONLY valid signature: event handlers.
async void Handler(object s, EventArgs e) { await DoAsync(); }   // events only
async Task WorkAsync() { await DoAsync(); }                      // everything else: Task

// FOOTGUN 2: sync-over-async deadlock. .Result / .Wait() on a captured context
// (UI thread, classic ASP.NET) blocks the thread the continuation needs → deadlock.
var data = FetchAsync().Result;     // DEADLOCK risk — never block on async
var data = await FetchAsync();      // RIGHT: stay async all the way up
```
- **`ConfigureAwait(false)`**: in **library** code, `await x.ConfigureAwait(false)`
  so you don't capture and re-enter the caller's context (avoids the deadlock above
  and needless marshaling). In **application** code that genuinely needs the context
  (UI thread affinity), let it capture — the default. ASP.NET Core has no
  `SynchronizationContext`, so `ConfigureAwait(false)` is a micro-optimization there,
  still mandatory in a shared library that might run under a UI or legacy context.
- **`CancellationToken` propagation**: thread the token through EVERY async call
  (`await Foo(ct)`), and pass it to `Task.Delay(ms, ct)` and I/O — a token you accept
  but never forward is a cancellation that silently does nothing.
- **`Task.Run` around already-async I/O** wastes a thread-pool thread; only offload
  genuinely CPU-bound work with it.

## Nullable Reference Types
```csharp
// Enable project-wide, not per-file — half-annotated code hides the very bugs NRT finds.
<Nullable>enable</Nullable>   // in the .csproj / Directory.Build.props

string? maybe = GetOrNull();  // ? = may be null; compiler forces a check before deref
string  sure  = Require();     // no ? = contract says never null
```
- **`!` (null-forgiving) overuse defeats the feature.** `value!.Method()` tells the
  compiler "trust me" and silences the warning — every `!` is a place NRT can no
  longer protect you. Prefer a real null check or an invariant (`ArgumentNullException
  .ThrowIfNull(value)`) over sprinkling `!`.
- **Annotation gaps at boundaries**: a dependency compiled WITHOUT NRT gives you
  `~oblivious` types — the compiler can't warn. JSON/EF-materialized objects can hold
  null in a non-nullable property at runtime; NRT is compile-time only, so validate
  deserialized input.

## Performance Traps
- **LINQ multiple enumeration**: iterating an `IEnumerable<T>` twice re-runs the whole
  query (and re-hits the DB for an ORM). Materialize once with `.ToList()`/`.ToArray()`
  when you enumerate more than once — but NOT eagerly if you only iterate once (wasted
  allocation).
- **`Span<T>`/`Memory<T>` misuse**: a `Span<T>` is a stack-only `ref struct` — you
  cannot store it in a field, capture it in a lambda/`async`, or box it; use
  `Memory<T>` when the buffer must cross an `await`. Slicing avoids the copy that
  `Substring`/`Array.Copy` would make.
- **Struct copying**: passing a large `struct` by value copies it on every call and in
  every `foreach` over a `List<struct>`; use `in`/`ref readonly` parameters or `ref`
  iteration for hot paths — or make it a `class`/`record class`.

## Testing Conventions
```csharp
using Xunit;

[Theory]
[InlineData(2, 4)]
[InlineData(3, 9)]
public void Square(int input, int expected) => Assert.Equal(expected, Square(input));

[Fact]
public async Task ParseRejectsEmpty()
{
    // Assert error paths — ThrowsAsync awaits the throwing async call.
    var ex = await Assert.ThrowsAsync<ArgumentException>(() => Parser.ParseAsync(""));
    Assert.Contains("empty", ex.Message);
}
```
- **xUnit** (`[Fact]`/`[Theory]`) — `Assert.ThrowsAsync<T>` for async error paths, not
  `Assert.Throws` (which won't await). Prefer real behavior over over-mocking; mock
  only external boundaries (HTTP, clock), never the code under test.

## Version-Specific Gotchas (dated, sourced)
- **Current LTS is .NET 10**, released **2025-11-11** (EOL 2028-11-14) — it supersedes
  the ".NET 8 LTS / .NET 9" pairing above. **.NET 8** (released 2023-11-14) is LTS
  until 2026-11-10; **.NET 9** is STS and reaches EOL 2026-11-10 (an odd-numbered STS
  release has ~18 months support). Target .NET 10 for new work.
  [endoflife.date/dotnet, retrieved 2026-07-09]
- **C# 14 is the current language version**, shipping with the **.NET 10 SDK**. The
  **`field` keyword is now a stable feature** (field-backed properties) — the "preview
  in C# 13" note above is superseded; on C# 14 you can use `field` without preview
  flags. C# 14 also adds extension members, null-conditional assignment, and
  user-defined compound-assignment operators. [learn.microsoft.com/dotnet/csharp/whats-new/csharp-14, retrieved 2026-07-09]
- **`BinaryFormatter` throws `PlatformNotSupportedException` on .NET 9+** — code that
  relied on it will fail at runtime, not compile time. Audit for it before upgrading.
  [learn.microsoft.com BinaryFormatter migration guide, retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- .NET release status & LTS dates: https://endoflife.date/dotnet
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
- BinaryFormatter migration guide (.NET 9 removal): https://learn.microsoft.com/en-us/dotnet/standard/serialization/binaryformatter-migration-guide/
- What's new in C# 14: https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14
- NuGet: auditing package dependencies: https://learn.microsoft.com/en-us/nuget/concepts/auditing-packages
- NuGet audit warnings NU1901–NU1904: https://learn.microsoft.com/en-us/nuget/reference/errors-and-warnings/nu1901-nu1904
