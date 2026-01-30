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

## Version Gotchas
- **PowerShell 7+**: Cross-platform, modern features
- **Pipeline**: Understand `$_` vs `$input` context
- **Arrays**: Use `@()` to force array context
- **ErrorAction**: `Stop` throws, `SilentlyContinue` swallows
- **With secrets**: Use SecretManagement module, not plaintext
