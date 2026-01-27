# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Smart CLAUDE.md Integration (PowerShell)
#  Merges CTOC sections with existing CLAUDE.md content
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [Parameter(Position = 0)]
    [string]$Command = "help",

    [Parameter(Position = 1)]
    [string]$Arg1 = "",

    [Parameter(Position = 2)]
    [string]$Arg2 = "",

    [Parameter(Position = 3)]
    [string]$Arg3 = ""
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# CTOC markers
$CTOC_START = "<!-- CTOC:START - Do not edit below this line -->"
$CTOC_END = "<!-- CTOC:END -->"

# ═══════════════════════════════════════════════════════════════════════════════
#  GitHub CLI Setup
# ═══════════════════════════════════════════════════════════════════════════════

function Test-GitHubCLI {
    Write-Host "Checking GitHub CLI..." -ForegroundColor Blue

    # Check if gh is installed
    $ghInstalled = Get-Command gh -ErrorAction SilentlyContinue

    if (-not $ghInstalled) {
        Write-Host ""
        Write-Host "GitHub CLI (gh) not found." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "CTOC can automatically create improvement issues and PRs."
        Write-Host "This requires GitHub CLI."
        Write-Host ""
        $response = Read-Host "Install GitHub CLI? (Y/n)"

        if ($response -notmatch "^[Nn]$") {
            Install-GitHubCLI
        } else {
            Write-Host "Skipped. You can install later: https://cli.github.com/" -ForegroundColor Yellow
            Write-Host "Without GitHub CLI, you'll need to post issues manually."
            return $false
        }
    }

    # Check authentication
    $ghInstalled = Get-Command gh -ErrorAction SilentlyContinue
    if ($ghInstalled) {
        $authStatus = gh auth status 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host ""
            Write-Host "GitHub CLI installed but not authenticated." -ForegroundColor Yellow
            Write-Host "Authenticate to enable automatic issue/PR creation."
            Write-Host ""
            $response = Read-Host "Authenticate now? (Y/n)"

            if ($response -notmatch "^[Nn]$") {
                gh auth login
            } else {
                Write-Host ""
                Write-Host "Skipped. Authenticate later with: gh auth login" -ForegroundColor Yellow
                Write-Host "Without authentication, you'll need to post issues manually."
                return $false
            }
        } else {
            Write-Host "GitHub CLI authenticated." -ForegroundColor Green
            return $true
        }
    }

    return $false
}

function Install-GitHubCLI {
    Write-Host "Installing GitHub CLI..."

    # Check for winget (Windows 10/11)
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        winget install --id GitHub.cli
        Write-Host "GitHub CLI installed successfully." -ForegroundColor Green
        return
    }

    # Check for chocolatey
    $choco = Get-Command choco -ErrorAction SilentlyContinue
    if ($choco) {
        choco install gh -y
        Write-Host "GitHub CLI installed successfully." -ForegroundColor Green
        return
    }

    # Check for scoop
    $scoop = Get-Command scoop -ErrorAction SilentlyContinue
    if ($scoop) {
        scoop install gh
        Write-Host "GitHub CLI installed successfully." -ForegroundColor Green
        return
    }

    Write-Host "Please install GitHub CLI manually: https://cli.github.com/" -ForegroundColor Yellow
    Write-Host "You can install via:"
    Write-Host "  winget install --id GitHub.cli"
    Write-Host "  choco install gh"
    Write-Host "  scoop install gh"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  CLAUDE.md Analysis
# ═══════════════════════════════════════════════════════════════════════════════

function Get-ClaudeMdAnalysis {
    param([string]$FilePath)

    if (-not (Test-Path $FilePath)) {
        return @{
            file_exists = $false
            has_ctoc_markers = $false
            sections = @{
                commands = $false
                testing = $false
                style = $false
                structure = $false
            }
            line_count = 0
            has_explicit_rules = $false
        }
    }

    $content = Get-Content $FilePath -Raw -ErrorAction SilentlyContinue

    # Detect sections
    $hasCommands = $content -match "## commands|## scripts|npm run|pytest|cargo|go test"
    $hasTesting = $content -match "## test|testing|jest|pytest|vitest"
    $hasStyle = $content -match "## style|## code style|eslint|prettier|ruff"
    $hasStructure = $content -match "## structure|## project|├──|└──"

    # Check for CTOC markers
    $hasCtocMarkers = $content -match [regex]::Escape($CTOC_START)

    # Check for explicit rules
    $hasExplicitRules = $content -match "(MUST|NEVER|ALWAYS|DO NOT|REQUIRED)"

    $lineCount = (Get-Content $FilePath -ErrorAction SilentlyContinue | Measure-Object -Line).Lines

    return @{
        file_exists = $true
        has_ctoc_markers = $hasCtocMarkers
        sections = @{
            commands = $hasCommands
            testing = $hasTesting
            style = $hasStyle
            structure = $hasStructure
        }
        line_count = $lineCount
        has_explicit_rules = $hasExplicitRules
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Project Convention Detection
# ═══════════════════════════════════════════════════════════════════════════════

function Get-ProjectConventions {
    $conventions = @{}

    # Detect from package.json
    if (Test-Path "package.json") {
        try {
            $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json

            if ($packageJson.scripts) {
                $conventions["npm_scripts"] = $packageJson.scripts.PSObject.Properties.Name -join ", "
            }

            # Detect test framework
            $devDeps = $packageJson.devDependencies
            $deps = $packageJson.dependencies
            if ($devDeps.jest -or $deps.jest) {
                $conventions["test_framework"] = "jest"
            } elseif ($devDeps.vitest -or $deps.vitest) {
                $conventions["test_framework"] = "vitest"
            }

            # Detect linting
            if ($devDeps.eslint -or $deps.eslint) {
                $conventions["linter"] = "eslint"
            }
        } catch { }
    }

    # Detect from pyproject.toml
    if (Test-Path "pyproject.toml") {
        $pyprojectContent = Get-Content "pyproject.toml" -Raw -ErrorAction SilentlyContinue

        if ($pyprojectContent -match "pytest") {
            $conventions["test_framework"] = "pytest"
        }
        if ($pyprojectContent -match "ruff") {
            $conventions["linter"] = "ruff"
        } elseif ($pyprojectContent -match "flake8") {
            $conventions["linter"] = "flake8"
        }
        if ($pyprojectContent -match "black") {
            $conventions["formatter"] = "black"
        }
    }

    # Detect from Cargo.toml
    if (Test-Path "Cargo.toml") {
        $conventions["build_system"] = "cargo"
        $conventions["test_command"] = "cargo test"
    }

    # Detect from go.mod
    if (Test-Path "go.mod") {
        $conventions["build_system"] = "go"
        $conventions["test_command"] = "go test ./..."
    }

    return $conventions
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Smart Merge
# ═══════════════════════════════════════════════════════════════════════════════

function Merge-ClaudeMd {
    param(
        [string]$ExistingFile,
        [string]$CtocContent,
        [string]$OutputFile
    )

    if (-not (Test-Path $ExistingFile)) {
        $CtocContent | Out-File -FilePath $OutputFile -Encoding utf8
        return
    }

    $existingContent = Get-Content $ExistingFile -Raw

    # Check if already has CTOC markers
    if ($existingContent -match [regex]::Escape($CTOC_START)) {
        # Replace content between markers
        $pattern = "(?s)$([regex]::Escape($CTOC_START)).*?$([regex]::Escape($CTOC_END))"
        $replacement = "$CTOC_START`n$CtocContent`n$CTOC_END"
        $newContent = $existingContent -replace $pattern, $replacement
        $newContent | Out-File -FilePath $OutputFile -Encoding utf8
    } else {
        # No markers, add CTOC content at the end with markers
        $newContent = @"
$existingContent

$CTOC_START
$CtocContent
$CTOC_END
"@
        $newContent | Out-File -FilePath $OutputFile -Encoding utf8
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Generate CTOC Section
# ═══════════════════════════════════════════════════════════════════════════════

function New-CtocSection {
    param(
        [string]$ProjectName,
        [string]$Language,
        [string]$Framework = ""
    )

    $langLower = $Language.ToLower() -replace ' ', '-'
    $frameworkSection = ""
    $frameworkLine = ""

    if ($Framework) {
        $fwLower = $Framework.ToLower() -replace ' ', '-'
        $frameworkSection = @"

### Framework: $Framework
See ``.ctoc/skills/frameworks/*/$fwLower.md`` for framework-specific guidance.
"@
        $frameworkLine = "- **Framework:** $Framework"
    }

    return @"
## CTO Persona

You are a **Senior CTO** with 20+ years of experience in $Language$(if($Framework){" and $Framework"}).
You have built and scaled systems at companies like Google, Stripe, and Airbnb.
Your role is to ensure this project meets the highest standards of engineering excellence.

## Technical Stack

- **Primary Language:** $Language
$frameworkLine

## Skills Library

Reference skills from ``.ctoc/skills/`` for language and framework-specific guidance.

**Active Skills:**
- ``.ctoc/skills/languages/$langLower.md`` - $Language CTO standards
$frameworkSection

**Skill Management:**
``````powershell
.ctoc\bin\ctoc.ps1 skills list       # See all 261 available skills
.ctoc\bin\ctoc.ps1 skills add NAME   # Add a specific skill
.ctoc\bin\ctoc.ps1 skills sync       # Auto-detect & download skills
``````

## Your Standards

### Non-Negotiables (Will Block PR)
1. Type safety / static analysis enabled
2. Tests for business logic
3. No secrets in code
4. Proper error handling
5. Documentation for public APIs

### Red Lines (Never Approve)
- Security vulnerabilities
- Untested critical paths
- Hardcoded configuration
- Missing input validation
- N+1 queries

## Iron Loop - 15-Step Methodology

| Step | Phase | Description |
|------|-------|-------------|
| 1. ASSESS | Planning | Understand the problem |
| 2. ALIGN | Planning | Business alignment |
| 3. CAPTURE | Planning | Gather requirements |
| 4. PLAN | Planning | Design solution |
| 5. DESIGN | Planning | Architecture decisions |
| 6. SPEC | Planning | Technical specification |
| 7. TEST | Development | Write tests first |
| 8. QUALITY | Development | Quality gates |
| 9. IMPLEMENT | Development | Write code |
| 10. REVIEW | Development | Self-review as CTO |
| 11. OPTIMIZE | Delivery | Performance tuning |
| 12. SECURE | Delivery | Security validation |
| 13. DOCUMENT | Delivery | Update docs |
| 14. VERIFY | Delivery | Final validation |
| 15. COMMIT | Delivery | Ship with confidence |

See ``IRON_LOOP.md`` for current project status.
See ``PLANNING.md`` for feature backlog.

## Parallel Execution Guidelines

### Subagent Parallelism Formula
Use: ``max(2, CPU_CORES - 4)`` concurrent subagents

### Safe Parallelization Matrix

| Operation Type | Parallel Safe? | Notes |
|----------------|----------------|-------|
| WebSearch | Yes | No state modification |
| Read/Glob/Grep | Yes | Read-only |
| WebFetch | Yes | External fetch |
| Analysis | Yes | Results can merge |
| Edit/Write | NO | Serialize by file |
| Bash (read) | Yes | ls, cat, etc. |
| Bash (write) | NO | Serialize |
| Git operations | NO | Use worktrees for parallelism |

### Research Phase Pattern
When exploring a problem, use parallel research:

``````
Launch in parallel (up to max agents):
├── Agent 1: WebSearch "official docs {topic}"
├── Agent 2: WebSearch "GitHub implementations {topic}"
├── Agent 3: WebSearch "security considerations {topic}"
├── Agent 4: Grep codebase for existing patterns
└── Agent 5: Read related files

Wait for all results, then synthesize.
``````

## Commands

| Command | Description |
|---------|-------------|
| ``ctoc skills sync`` | Download skills for detected technologies |
| ``ctoc skills feedback <name>`` | Suggest skill improvement |
| ``ctoc plan new`` | Create a new plan |
| ``ctoc sync`` | Pull-rebase-push workflow |
| ``ctoc dashboard`` | View progress |
| ``ctoc research status`` | Show WebSearch config |
| ``ctoc process-issues`` | Process community suggestions |

## Quality Gates

Before committing:
1. All tests pass
2. No linting errors
3. Iron Loop step 14 (VERIFY) complete
4. Documentation updated

## Skill Auto-Sync

When you notice the project using a new technology (new dependencies, new file types),
automatically run skill sync to download relevant guidance:

``````powershell
.ctoc\bin\ctoc.ps1 skills sync
``````
"@
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main Integration Flow
# ═══════════════════════════════════════════════════════════════════════════════

function Invoke-Integration {
    param(
        [string]$ProjectName,
        [string]$Language,
        [string]$Framework = ""
    )

    Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Blue
    Write-Host "  CTOC - Smart CLAUDE.md Integration" -ForegroundColor Blue
    Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Blue
    Write-Host ""

    # Analyze existing CLAUDE.md
    $analysis = Get-ClaudeMdAnalysis "CLAUDE.md"

    if ($analysis.file_exists) {
        Write-Host "Existing CLAUDE.md found ($($analysis.line_count) lines)" -ForegroundColor Yellow
        Write-Host ""

        if ($analysis.has_ctoc_markers) {
            Write-Host "CTOC markers detected. Will update CTOC section only."
            Write-Host ""
            $response = Read-Host "Update CTOC section? (Y/n)"
            if ($response -match "^[Nn]$") {
                return
            }
        } else {
            Write-Host "Choose integration method:"
            Write-Host "  [1] Smart merge - Add CTOC sections, keep your content (Recommended)"
            Write-Host "  [2] Replace - Start fresh with CTOC template"
            Write-Host "  [3] Backup & replace - Save existing as CLAUDE.md.backup"
            Write-Host "  [4] Cancel"
            Write-Host ""
            $choice = Read-Host "Choice [1]"
            if ([string]::IsNullOrEmpty($choice)) { $choice = "1" }

            switch ($choice) {
                "1" {
                    Write-Host "Smart merge selected."
                }
                "2" {
                    Write-Host "Replacing CLAUDE.md..."
                    Remove-Item "CLAUDE.md" -Force -ErrorAction SilentlyContinue
                }
                "3" {
                    Write-Host "Backing up to CLAUDE.md.backup..."
                    Copy-Item "CLAUDE.md" "CLAUDE.md.backup" -Force
                    Remove-Item "CLAUDE.md" -Force
                }
                "4" {
                    Write-Host "Cancelled."
                    return
                }
                default {
                    Write-Host "Invalid choice. Using smart merge."
                }
            }
        }
    }

    # Detect project conventions
    $conventions = Get-ProjectConventions

    # Store detected conventions
    if (-not (Test-Path ".ctoc")) {
        New-Item -ItemType Directory -Path ".ctoc" -Force | Out-Null
    }
    $conventions | ConvertTo-Json | Out-File ".ctoc\detected_conventions.json" -Encoding utf8

    # Generate CTOC section
    $ctocSection = New-CtocSection -ProjectName $ProjectName -Language $Language -Framework $Framework

    # Merge or create
    if (Test-Path "CLAUDE.md") {
        Merge-ClaudeMd -ExistingFile "CLAUDE.md" -CtocContent $ctocSection -OutputFile "CLAUDE.md.new"
        Move-Item "CLAUDE.md.new" "CLAUDE.md" -Force
        Write-Host "CLAUDE.md updated with CTOC integration." -ForegroundColor Green
    } else {
        # Create new with markers
        $newContent = @"
# $ProjectName

<!-- Add your project-specific instructions here -->

$CTOC_START
$ctocSection
$CTOC_END
"@
        $newContent | Out-File -FilePath "CLAUDE.md" -Encoding utf8
        Write-Host "CLAUDE.md created with CTOC integration." -ForegroundColor Green
    }

    # Setup GitHub CLI
    Write-Host ""
    Test-GitHubCLI | Out-Null

    Write-Host ""
    Write-Host "CLAUDE.md integration complete." -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Help
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Help {
    @"
CTOC - Smart CLAUDE.md Integration

USAGE:
    init-claude-md.ps1 <command> [options]

COMMANDS:
    integrate <name> <lang> [framework]   Integrate CTOC into CLAUDE.md
    analyze [file]                        Analyze existing CLAUDE.md
    detect-conventions                    Detect project conventions
    setup-gh                              Setup GitHub CLI
    help                                  Show this help

EXAMPLES:
    init-claude-md.ps1 integrate "My Project" python fastapi
    init-claude-md.ps1 analyze CLAUDE.md
    init-claude-md.ps1 setup-gh
"@
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Entry Point
# ═══════════════════════════════════════════════════════════════════════════════

switch ($Command) {
    "integrate" {
        $projectName = if ($Arg1) { $Arg1 } else { Split-Path -Leaf (Get-Location) }
        $language = $Arg2
        $framework = $Arg3
        Invoke-Integration -ProjectName $projectName -Language $language -Framework $framework
    }
    "analyze" {
        $file = if ($Arg1) { $Arg1 } else { "CLAUDE.md" }
        $analysis = Get-ClaudeMdAnalysis $file
        $analysis | ConvertTo-Json -Depth 3
    }
    "detect-conventions" {
        $conventions = Get-ProjectConventions
        $conventions | ConvertTo-Json -Depth 3
    }
    "setup-gh" {
        Test-GitHubCLI
    }
    { $_ -in "help", "--help", "-h" } {
        Show-Help
    }
    default {
        Write-Host "Unknown command: $Command"
        Write-Host "Run 'init-claude-md.ps1 help' for usage."
        exit 1
    }
}
