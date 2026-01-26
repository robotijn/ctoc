# PowerShell CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```powershell
# Daily workflow
git status; git diff --stat            # Check state
Invoke-ScriptAnalyzer -Path . -Recurse # Lint
Invoke-Formatter -ScriptDefinition (Get-Content .) # Format
Invoke-Pester -Output Detailed         # Test
# Build (modules)
git add -p; git commit -m "feat: x"    # Commit
```

## Tools (2024-2025)
- **PowerShell 7+** - Cross-platform
- **PSScriptAnalyzer** - Static analysis
- **Pester 5** - Testing framework
- **platyPS** - Documentation generation
- **PSReadLine** - Enhanced editing

## Project Structure
```
project/
├── src/               # Module source
├── tests/             # Pester tests
├── docs/              # Help documentation
├── Module.psd1        # Module manifest
└── Module.psm1        # Module file
```

## Non-Negotiables
1. Use approved verbs (Get-, Set-, New-)
2. Parameter validation attributes
3. Proper error handling (-ErrorAction)
4. Comment-based help for all functions

## Red Lines (Reject PR)
- Aliases in scripts (use full cmdlet names)
- Missing -ErrorAction handling
- Hardcoded credentials/secrets
- Write-Host for output (use Write-Output)
- Missing parameter validation
- Invoke-Expression with user input

## Testing Strategy
- **Unit**: Pester mocks, <100ms
- **Integration**: Real cmdlet tests
- **E2E**: Full workflow validation

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Pipeline confusion | Understand $_ vs $input |
| Array unwrapping | Use @() to force array |
| Error swallowing | Use -ErrorAction Stop |
| Remote session state | Use implicit remoting |

## Performance Red Lines
- No O(n^2) with large collections
- No excessive pipeline overhead
- No blocking GUI thread

## Security Checklist
- [ ] Input validated with ValidateSet/Pattern
- [ ] No Invoke-Expression with user input
- [ ] Secrets from SecretManagement module
- [ ] Execution policy considered
