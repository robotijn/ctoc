# PowerShell CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses aliases — use full cmdlet names in scripts
- Claude uses `Write-Host` — use `Write-Output` for pipeline
- Claude ignores `-ErrorAction` — always handle errors explicitly
- Claude uses `Invoke-Expression` with input — command injection

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `powershell 7+` | Cross-platform | Windows PowerShell 5.1 |
| `PSScriptAnalyzer` | Static analysis | No linting |
| `Pester 5` | Testing | Ad-hoc tests |
| `platyPS` | Help generation | Manual docs |
| `SecretManagement` | Secrets handling | Plain text |

## Patterns Claude Should Use
```powershell
# Use approved verbs and full names
function Get-UserData {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$UserId
    )

    # Explicit error handling
    try {
        $result = Invoke-RestMethod -Uri $uri -ErrorAction Stop
        Write-Output $result  # NOT Write-Host
    }
    catch {
        Write-Error "Failed to fetch user: $_"
        return $null
    }
}

# Force array context
$items = @(Get-ChildItem -Path $path)

# Secrets from SecretManagement
$secret = Get-Secret -Name 'ApiKey' -AsPlainText
```

## Anti-Patterns Claude Generates
- Aliases in scripts (`ls`, `cd`) — use `Get-ChildItem`, `Set-Location`
- `Write-Host` for output — use `Write-Output` for pipeline
- Missing `-ErrorAction` — errors silently continue
- `Invoke-Expression $userInput` — command injection
- Missing `[CmdletBinding()]` — loses advanced features

## Pipeline / Concurrency Footguns
PowerShell pipes **objects**, not text — filtering on formatted strings is the classic
mistake. Parallelism runs in separate runspaces with their own variable scope.

- **`ForEach-Object -Parallel` (7+) runs each iteration in a fresh runspace.** Outer-scope
  variables are NOT visible — you must reference them with the **`$using:`** modifier
  (`$using:config`). Mutating a shared variable from parallel iterations is a race; collect
  results from the pipeline instead. Bound concurrency with `-ThrottleLimit`.
- **`Start-Job` spawns a whole child process** (slow, serializes objects); `Start-ThreadJob`
  / `ForEach-Object -Parallel` use threads and are far lighter for in-process work.
- **Filter on objects, early.** `Get-Process | Where-Object CPU -gt 100` filters the object,
  not its text rendering.

```powershell
$config = @{ Timeout = 30 }
# WRONG — $config is empty inside the parallel runspace
$results = 1..10 | ForEach-Object -Parallel { Invoke-Work $_ -Timeout $config.Timeout }

# RIGHT — import the outer variable with $using:, cap concurrency
$results = 1..10 | ForEach-Object -Parallel {
    Invoke-Work $_ -Timeout ($using:config).Timeout
} -ThrottleLimit 4
```

## Error Handling Idioms
PowerShell has **terminating** and **non-terminating** errors, and by default most cmdlet
errors are non-terminating — `try/catch` won't catch them unless you make them terminate.

- **Set `$ErrorActionPreference = 'Stop'`** (or `-ErrorAction Stop` per cmdlet) so errors
  become terminating and reach your `catch`.
- **`try { } catch { } finally { }`** — catch typed exceptions (`catch [System.IO.IOException]`)
  before the generic `catch`.
- **Native commands don't throw** — check **`$LASTEXITCODE`** (external exe) and **`$?`**
  (last operation success) after calling them; a failed `git`/`curl` won't hit `catch`.

```powershell
$ErrorActionPreference = 'Stop'
try {
    $data = Invoke-RestMethod -Uri $uri            # now terminating
    & git push                                     # native cmd — check exit code
    if ($LASTEXITCODE -ne 0) { throw "git push failed ($LASTEXITCODE)" }
}
catch [System.Net.Http.HttpRequestException] { Write-Error "network: $_" }
catch { Write-Error "unexpected: $_"; throw }
finally { $ErrorActionPreference = 'Continue' }
```

## Security and Dependency Gotchas
- **Execution policy is NOT a security boundary.** `Set-ExecutionPolicy` is a convenience
  guardrail against accidentally double-clicking a script — it is trivially bypassed with
  `powershell -ExecutionPolicy Bypass -File …` or by piping the script to stdin. Microsoft
  documents this explicitly. Never rely on it to keep untrusted code from running.
- **`Invoke-Expression` / `iex` on untrusted input is code/command injection — CWE-94
  (Improper Control of Generation of Code) / CWE-78 (OS Command Injection).** `iex $userInput`
  runs whatever the user supplies. There is almost never a legitimate reason to `iex`
  external data — call the cmdlet directly with parameters, or use a scriptblock with typed
  parameters.
- **Handle credentials as `SecureString`/`PSCredential`**, never plaintext strings (they land
  in history, logs, and memory dumps). Use the **SecretManagement** module for retrieval.
- **Constrained Language Mode** limits what a session can run (defense in depth with
  AppLocker/WDAC). **Sign modules** and **pin `PSGallery` versions** (`-RequiredVersion`) to
  avoid pulling a compromised update.

```powershell
# WRONG — CWE-94/CWE-78: user input executed as code
Invoke-Expression $userInput

# RIGHT — call the command directly; pass data as a typed parameter
Get-Content -LiteralPath $userPath          # no code generation, no shell
```

## Testing Conventions
- **Pester** is the standard framework: `Describe` / `Context` / `It` with `Should`
  assertions (`Should -Be`, `Should -Throw`). Run with `Invoke-Pester`.
- Pester produces **code coverage** (`-CodeCoverage`) and NUnit XML for CI.
- **PSScriptAnalyzer** (`Invoke-ScriptAnalyzer`) lints for style and known anti-patterns
  (aliases, unapproved verbs, plaintext creds) — run it in CI as a gate.

```powershell
Describe 'Get-UserData' {
    It 'throws on empty id' {
        { Get-UserData -UserId '' } | Should -Throw
    }
    It 'returns an object for a valid id' {
        (Get-UserData -UserId '42').Id | Should -Be 42
    }
}
# Invoke-Pester -CodeCoverage ./Get-UserData.ps1
# Invoke-ScriptAnalyzer -Path . -Recurse
```

## Performance Traps
- **`$arr += $item` in a loop reallocates the entire array every iteration** — O(n²). Use a
  `[System.Collections.Generic.List[T]]` (`.Add()`), an `ArrayList`, or just emit to the
  pipeline and collect once.
- **`Write-Host` bypasses the pipeline** — its output can't be captured or redirected; use
  `Write-Output` (or bare expressions) for data, `Write-Host` only for user-facing color.
- **`Select-Object *` and format cmdlets mid-pipeline** materialize/format objects you then
  re-process — keep `Format-*` at the very end of a pipeline only.

```powershell
# WRONG — O(n^2) reallocation
$out = @(); foreach ($x in $big) { $out += Transform $x }

# RIGHT — typed list, O(n)
$out = [System.Collections.Generic.List[object]]::new()
foreach ($x in $big) { $out.Add((Transform $x)) }
```

## Version-Specific Gotchas
- **PowerShell 7.x (cross-platform, the `pwsh` binary)** is the current product; **7.6 is
  the LTS** (built on .NET 10) and **7.4 remains a supported LTS** (.NET 8). **Windows
  PowerShell 5.1** is the legacy, Windows-only edition built on .NET Framework — it is *not*
  the same product and diverges (no `ForEach-Object -Parallel`, `?:`/`??` operators, or
  cross-platform cmdlets). Source: https://endoflife.date/powershell (retrieved 2026-07-10);
  cross-check https://learn.microsoft.com/powershell/.
- **Pipeline**: understand `$_` (current object) vs `$input` (enumerator).
- **Arrays**: `@()` forces array context for single-item results.
- **ErrorAction**: `Stop` throws (catchable); `SilentlyContinue` swallows.
- **Secrets**: SecretManagement module, never plaintext.

## References
- PowerShell release/support (7.6 LTS, 7.4 LTS, 5.1 legacy) — https://endoflife.date/powershell (retrieved 2026-07-10)
- PowerShell docs (editions, execution policy) — https://learn.microsoft.com/powershell/ (retrieved 2026-07-10)
- CWE-94 Code Injection — https://cwe.mitre.org/data/definitions/94.html (CWE 4.20, retrieved 2026-07-10)
- CWE-78 OS Command Injection — https://cwe.mitre.org/data/definitions/78.html (CWE 4.20, retrieved 2026-07-10)
