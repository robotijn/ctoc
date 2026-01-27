#Requires -Version 5.1
<#
.SYNOPSIS
    CTOC - CTO Chief Installation Script for Windows
.DESCRIPTION
    Installs CTOC (CTO Chief) - Your Army of Virtual CTOs
    Smart skill loading: Downloads only the skills your project needs.
.EXAMPLE
    irm https://raw.githubusercontent.com/robotijn/ctoc/main/install.ps1 | iex
#>

$ErrorActionPreference = "Stop"

$CTOC_VERSION = "1.1.0"
$CTOC_REPO = "https://github.com/robotijn/ctoc"
$CTOC_RAW = "https://raw.githubusercontent.com/robotijn/ctoc/main"

# ═══════════════════════════════════════════════════════════════════════════════
#  Helper Functions
# ═══════════════════════════════════════════════════════════════════════════════

function Write-Banner {
    Write-Host @"

   _____ _______ ____   _____
  / ____|__   __/ __ \ / ____|
 | |       | | | |  | | |
 | |       | | | |  | | |
 | |____   | | | |__| | |____
  \_____|  |_|  \____/ \_____|

  CTO Chief - Your Army of Virtual CTOs

"@ -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Message)
    Write-Host "▶ $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Check Directory
# ═══════════════════════════════════════════════════════════════════════════════

function Test-Directory {
    # Directory check - allow existing CLAUDE.md (will be smart-merged)
    if (-not (Test-Path ".git")) {
        Write-Warning "Not a git repository. CTOC works best with git."
        $response = Read-Host "Continue anyway? (Y/n)"
        if ($response -match "^[Nn]$") {
            Write-Host "Initialize git first: git init"
            exit 1
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Download Core Files
# ═══════════════════════════════════════════════════════════════════════════════

function Get-CoreFiles {
    Write-Step "Downloading CTOC core files..."

    # Create directories
    New-Item -ItemType Directory -Path ".ctoc\bin" -Force | Out-Null
    New-Item -ItemType Directory -Path ".ctoc\skills\languages" -Force | Out-Null
    New-Item -ItemType Directory -Path ".ctoc\skills\frameworks" -Force | Out-Null
    New-Item -ItemType Directory -Path ".ctoc\templates" -Force | Out-Null
    New-Item -ItemType Directory -Path ".ctoc\agents" -Force | Out-Null
    New-Item -ItemType Directory -Path ".ctoc\plans" -Force | Out-Null

    # Download bin scripts
    $binFiles = @("ctoc.ps1", "detect.ps1", "download.ps1", "init-claude-md.ps1", "process-issues.ps1", "plan.ps1", "progress.ps1", "git-workflow.ps1", "file-lock.ps1", "upgrade-agent.ps1", "explore-codebase.ps1", "research.ps1", "update-check.ps1")
    foreach ($file in $binFiles) {
        try {
            Invoke-WebRequest -Uri "$CTOC_RAW/.ctoc/bin/$file" -OutFile ".ctoc\bin\$file" -UseBasicParsing -ErrorAction Stop
        } catch {
            Write-Warning "Failed to download $file"
        }
    }

    # Download skills index
    try {
        Invoke-WebRequest -Uri "$CTOC_RAW/.ctoc/skills.json" -OutFile ".ctoc\skills.json" -UseBasicParsing -ErrorAction Stop
    } catch {
        Write-Error "Failed to download skills.json"
        exit 1
    }

    # Download VERSION file for update checking
    try {
        Invoke-WebRequest -Uri "$CTOC_RAW/VERSION" -OutFile ".ctoc\VERSION" -UseBasicParsing -ErrorAction SilentlyContinue
    } catch { }

    # Download templates
    try {
        Invoke-WebRequest -Uri "$CTOC_RAW/.ctoc/templates/CLAUDE.md.template" -OutFile ".ctoc\templates\CLAUDE.md.template" -UseBasicParsing -ErrorAction SilentlyContinue
        Invoke-WebRequest -Uri "$CTOC_RAW/.ctoc/templates/IRON_LOOP.md.template" -OutFile ".ctoc\templates\IRON_LOOP.md.template" -UseBasicParsing -ErrorAction SilentlyContinue
        Invoke-WebRequest -Uri "$CTOC_RAW/.ctoc/templates/PLANNING.md.template" -OutFile ".ctoc\templates\PLANNING.md.template" -UseBasicParsing -ErrorAction SilentlyContinue
    } catch { }

    # Download agent versions
    try {
        Invoke-WebRequest -Uri "$CTOC_RAW/.ctoc/agents/versions.yaml" -OutFile ".ctoc\agents\versions.yaml" -UseBasicParsing -ErrorAction SilentlyContinue
    } catch { }

    Write-Success "Core files installed"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Detect and Download Skills
# ═══════════════════════════════════════════════════════════════════════════════

function Get-DetectedSkills {
    # Load skills index
    $index = Get-Content ".ctoc\skills.json" -Raw | ConvertFrom-Json

    $languages = @()
    $frameworks = @()

    # Detect languages
    foreach ($lang in $index.skills.languages.PSObject.Properties) {
        $name = $lang.Name
        foreach ($trigger in $lang.Value.triggers) {
            if ([string]::IsNullOrEmpty($trigger)) { continue }

            if ($trigger -match '\*') {
                $pattern = $trigger -replace '^\*', ''
                $files = Get-ChildItem -Path . -Filter "*$pattern" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($files) {
                    $languages += $name
                    break
                }
            } else {
                if (Test-Path $trigger) {
                    $languages += $name
                    break
                }
            }
        }
    }

    # Detect frameworks
    $configFiles = @(
        "pyproject.toml", "requirements.txt", "setup.py",
        "package.json", "package-lock.json",
        "Cargo.toml", "go.mod", "go.sum",
        "pom.xml", "build.gradle", "build.gradle.kts",
        "Gemfile", "composer.json", "pubspec.yaml",
        "mix.exs", "deps.edn", "project.clj"
    )

    $configContent = ""
    foreach ($file in $configFiles) {
        if (Test-Path $file) {
            $configContent += Get-Content $file -Raw -ErrorAction SilentlyContinue
        }
    }

    if ($configContent) {
        foreach ($category in $index.skills.frameworks.PSObject.Properties) {
            foreach ($framework in $category.Value.PSObject.Properties) {
                foreach ($keyword in $framework.Value.keywords) {
                    if ([string]::IsNullOrEmpty($keyword)) { continue }
                    if ($configContent -match [regex]::Escape($keyword)) {
                        $frameworks += $framework.Name
                        break
                    }
                }
            }
        }
    }

    return @{
        Languages = $languages | Sort-Object -Unique
        Frameworks = $frameworks | Sort-Object -Unique
    }
}

function Install-Skills {
    Write-Step "Detecting project technologies..."

    $detected = Get-DetectedSkills
    $index = Get-Content ".ctoc\skills.json" -Raw | ConvertFrom-Json

    if ($detected.Languages.Count -eq 0 -and $detected.Frameworks.Count -eq 0) {
        Write-Warning "No technologies detected. Skills can be added later with: ctoc skills add <name>"
        return
    }

    Write-Host ""
    Write-Host "Detected technologies:"
    foreach ($lang in $detected.Languages) {
        Write-Host "  - $lang (language)"
    }
    foreach ($framework in $detected.Frameworks) {
        Write-Host "  - $framework (framework)"
    }
    Write-Host ""

    Write-Step "Downloading detected skills..."

    $downloadCount = 0
    $totalSize = 0

    # Download languages
    foreach ($lang in $detected.Languages) {
        $langInfo = $index.skills.languages.$lang
        if ($langInfo) {
            $path = $langInfo.file
            $localPath = ".ctoc\skills\$($path -replace '/', '\')"
            $dir = Split-Path $localPath -Parent
            if (-not (Test-Path $dir)) {
                New-Item -ItemType Directory -Path $dir -Force | Out-Null
            }
            try {
                Invoke-WebRequest -Uri "$CTOC_RAW/.ctoc/skills/$path" -OutFile $localPath -UseBasicParsing -ErrorAction Stop
                Write-Host "  ✓ $lang"
                $downloadCount++
                $totalSize += $langInfo.size
            } catch {
                Write-Host "  ✗ $lang (failed)"
            }
        }
    }

    # Download frameworks and their dependencies
    foreach ($framework in $detected.Frameworks) {
        # Find framework info
        $frameworkInfo = $null
        foreach ($category in $index.skills.frameworks.PSObject.Properties) {
            if ($category.Value.$framework) {
                $frameworkInfo = $category.Value.$framework
                break
            }
        }

        if ($frameworkInfo) {
            # Download required languages first
            if ($frameworkInfo.requires) {
                foreach ($req in $frameworkInfo.requires) {
                    $reqPath = ".ctoc\skills\languages\$req.md"
                    if (-not (Test-Path $reqPath)) {
                        $reqInfo = $index.skills.languages.$req
                        if ($reqInfo) {
                            $dir = Split-Path $reqPath -Parent
                            if (-not (Test-Path $dir)) {
                                New-Item -ItemType Directory -Path $dir -Force | Out-Null
                            }
                            try {
                                Invoke-WebRequest -Uri "$CTOC_RAW/.ctoc/skills/$($reqInfo.file)" -OutFile $reqPath -UseBasicParsing -ErrorAction Stop
                                Write-Host "  ✓ $req (dependency)"
                                $downloadCount++
                            } catch { }
                        }
                    }
                }
            }

            # Download framework
            $path = $frameworkInfo.file
            $localPath = ".ctoc\skills\$($path -replace '/', '\')"
            $dir = Split-Path $localPath -Parent
            if (-not (Test-Path $dir)) {
                New-Item -ItemType Directory -Path $dir -Force | Out-Null
            }
            try {
                Invoke-WebRequest -Uri "$CTOC_RAW/.ctoc/skills/$path" -OutFile $localPath -UseBasicParsing -ErrorAction Stop
                Write-Host "  ✓ $framework"
                $downloadCount++
                $totalSize += $frameworkInfo.size
            } catch {
                Write-Host "  ✗ $framework (failed)"
            }
        }
    }

    Write-Host ""
    Write-Success "Downloaded $downloadCount skills (~$([math]::Round($totalSize / 1024))KB)"

    # Store detected info for later use
    $script:DetectedLanguages = $detected.Languages
    $script:DetectedFrameworks = $detected.Frameworks
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Project Setup
# ═══════════════════════════════════════════════════════════════════════════════

function Get-ProjectSetup {
    Write-Step "Setting up your project..."
    Write-Host ""

    # Get project name
    $defaultName = Split-Path -Leaf (Get-Location)
    $projectName = Read-Host "Project name [$defaultName]"
    if ([string]::IsNullOrEmpty($projectName)) {
        $projectName = $defaultName
    }

    # Get primary language
    $detectedLang = if ($script:DetectedLanguages.Count -gt 0) { $script:DetectedLanguages[0] } else { $null }

    if ($detectedLang) {
        Write-Host ""
        Write-Host "Detected primary language: $detectedLang"
        $response = Read-Host "Use this language? (Y/n)"
        if ($response -match "^[Nn]$") {
            $detectedLang = $null
        }
    }

    if (-not $detectedLang) {
        Write-Host ""
        Write-Host "Primary language:"
        Write-Host "  1) Python      6) Go          11) Swift"
        Write-Host "  2) TypeScript  7) Rust        12) Kotlin"
        Write-Host "  3) JavaScript  8) C#          13) Other"
        Write-Host "  4) Java        9) PHP"
        Write-Host "  5) Ruby       10) Elixir"
        Write-Host ""
        $langChoice = Read-Host "Select [1-13]"

        $language = switch ($langChoice) {
            "1" { "Python" }
            "2" { "TypeScript" }
            "3" { "JavaScript" }
            "4" { "Java" }
            "5" { "Ruby" }
            "6" { "Go" }
            "7" { "Rust" }
            "8" { "C#" }
            "9" { "PHP" }
            "10" { "Elixir" }
            "11" { "Swift" }
            "12" { "Kotlin" }
            default { Read-Host "Enter language" }
        }
    } else {
        $language = $detectedLang
    }

    # Get framework
    $detectedFramework = if ($script:DetectedFrameworks.Count -gt 0) { $script:DetectedFrameworks[0] } else { $null }

    if ($detectedFramework) {
        Write-Host ""
        Write-Host "Detected framework: $detectedFramework"
        $response = Read-Host "Use this framework? (Y/n)"
        if ($response -match "^[Nn]$") {
            $detectedFramework = $null
        }
    }

    if (-not $detectedFramework) {
        Write-Host ""
        $framework = Read-Host "Primary framework (optional, e.g., FastAPI, React, Django)"
    } else {
        $framework = $detectedFramework
    }

    # Get description
    Write-Host ""
    $description = Read-Host "One-line project description"

    return @{
        Name = $projectName
        Language = $language
        Framework = $framework
        Description = $description
    }
}

function New-ClaudeMd {
    param($Project)

    Write-Step "Generating CLAUDE.md..."

    $langLower = $Project.Language.ToLower() -replace ' ', '-'
    $frameworkSkillPath = ""

    if ($Project.Framework) {
        $fwLower = $Project.Framework.ToLower() -replace ' ', '-'
        $index = Get-Content ".ctoc\skills.json" -Raw | ConvertFrom-Json
        foreach ($category in $index.skills.frameworks.PSObject.Properties) {
            if ($category.Value.$fwLower) {
                $frameworkSkillPath = $category.Value.$fwLower.file
                break
            }
        }
    }

    $frameworkLine = if ($Project.Framework) { "- **Framework:** $($Project.Framework)" } else { "" }
    $frameworkSkillLine = if ($frameworkSkillPath) { "- ``.ctoc/skills/$frameworkSkillPath`` - $($Project.Framework) CTO standards" } else { "" }

    $content = @"
# $($Project.Name)

> $($Project.Description)

## CTO Persona

You are a **Senior CTO** with 20+ years of experience in $($Project.Language)$(if($Project.Framework){" and $($Project.Framework)"}).
You have built and scaled systems at companies like Google, Stripe, and Airbnb.
Your role is to ensure this project meets the highest standards of engineering excellence.

## Technical Stack

- **Primary Language:** $($Project.Language)
$frameworkLine

## Skills Library

Reference skills from ``.ctoc/skills/`` for language and framework-specific guidance.

**Active Skills:**
- ``.ctoc/skills/languages/$langLower.md`` - $($Project.Language) CTO standards
$frameworkSkillLine

**Skill Management:**
``````powershell
# See all available skills (261 total)
.ctoc\bin\ctoc.ps1 skills list

# Add a new skill
.ctoc\bin\ctoc.ps1 skills add <skill-name>

# Auto-detect and sync skills
.ctoc\bin\ctoc.ps1 skills sync
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

## Commands

| Command | Action |
|---------|--------|
| ``ctoc plan`` | Enter planning mode - analyze requirements, create technical design |
| ``ctoc implement`` | Enter implementation mode - write code following Iron Loop |
| ``ctoc review`` | Enter review mode - CTO code review |
| ``ctoc improve`` | Suggest improvements to current code |
| ``ctoc skills feedback`` | Suggest skill improvements |

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
| Edit/Write | NO | Serialize by file |
| Git operations | NO | Use worktrees for parallelism |

## Skill Auto-Sync

When you notice the project using a new technology (new dependencies, new file types),
automatically run skill sync to download relevant guidance:

``````powershell
.ctoc\bin\ctoc.ps1 skills sync
``````
"@

    $content | Out-File -FilePath "CLAUDE.md" -Encoding utf8
    Write-Success "CLAUDE.md created"
}

function New-IronLoopMd {
    param($Project)

    Write-Step "Generating IRON_LOOP.md..."

    $date = Get-Date -Format "yyyy-MM-dd"
    $frameworkLine = if ($Project.Framework) { "- Framework: $($Project.Framework)" } else { "" }

    $content = @"
# Iron Loop - $($Project.Name)

> Track progress through the 15-step methodology

## Current Status

| Step | Phase | Status | Notes |
|------|-------|--------|-------|
| 1. ASSESS | Planning | In Progress | Understand the problem |
| 2. ALIGN | Planning | Pending | Business alignment |
| 3. CAPTURE | Planning | Pending | Gather requirements |
| 4. PLAN | Planning | Pending | Design solution |
| 5. DESIGN | Planning | Pending | Architecture decisions |
| 6. SPEC | Planning | Pending | Technical specification |
| 7. TEST | Development | Pending | Write tests first |
| 8. QUALITY | Development | Pending | Quality gates |
| 9. IMPLEMENT | Development | Pending | Write code |
| 10. REVIEW | Development | Pending | Self-review as CTO |
| 11. OPTIMIZE | Delivery | Pending | Performance tuning |
| 12. SECURE | Delivery | Pending | Security validation |
| 13. DOCUMENT | Delivery | Pending | Update docs |
| 14. VERIFY | Delivery | Pending | Final validation |
| 15. COMMIT | Delivery | Pending | Ship with confidence |

## Legend
- Pending
- In Progress
- Complete
- Blocked

## Research Protocol

Before implementing, use parallel web search agents for:
1. **Validate assumptions** - Search for current best practices (2026)
2. **Check dependencies** - Search for security advisories
3. **Find patterns** - Search for similar implementations
4. **Verify APIs** - Search for current documentation

**Subagent count:** max(2, CPU_CORES - 4)

## Session Log

### $date
- CTOC initialized
- Project: $($Project.Name)
- Language: $($Project.Language)
$frameworkLine
"@

    $content | Out-File -FilePath "IRON_LOOP.md" -Encoding utf8
    Write-Success "IRON_LOOP.md created"
}

function New-PlanningMd {
    param($Project)

    Write-Step "Generating PLANNING.md..."

    $frameworkLine = if ($Project.Framework) { "| Framework | $($Project.Framework) | *TODO* |" } else { "" }

    $content = @"
# Planning - $($Project.Name)

> $($Project.Description)

## Vision

*TODO: Define the vision for this project*

## Architecture

*TODO: High-level architecture decisions*

## Feature Backlog

### Phase 1: Foundation
- [ ] Project setup
- [ ] Core architecture
- [ ] Basic functionality

### Phase 2: Core Features
- [ ] *TODO: Define features*

### Phase 3: Polish
- [ ] Testing
- [ ] Documentation
- [ ] Performance optimization

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | $($Project.Language) | *TODO* |
$frameworkLine

## Dependencies

*TODO: Key dependencies and why*

## Open Questions

- *TODO: Questions to resolve*
"@

    $content | Out-File -FilePath "PLANNING.md" -Encoding utf8
    Write-Success "PLANNING.md created"
}

function New-ProjectMap {
    Write-Step "Generating PROJECT_MAP.md..."

    $exploreScript = ".ctoc\bin\explore-codebase.ps1"
    if (Test-Path $exploreScript) {
        try {
            & $exploreScript "generate" 2>$null
            Write-Success "PROJECT_MAP.md created"
        } catch {
            Write-Warning "Could not generate PROJECT_MAP.md (explore-codebase failed)"
        }
    } else {
        Write-Warning "explore-codebase.ps1 not found, skipping PROJECT_MAP.md"
    }
}

function Update-Gitignore {
    Write-Step "Updating .gitignore..."

    $gitignoreContent = @"

# CTOC - Skills library (optional: can be tracked or ignored)
# .ctoc/
"@

    if (Test-Path ".gitignore") {
        $existing = Get-Content ".gitignore" -Raw -ErrorAction SilentlyContinue
        if ($existing -notmatch "\.ctoc/") {
            Add-Content -Path ".gitignore" -Value $gitignoreContent
        }
    } else {
        $gitignoreContent.Trim() | Out-File -FilePath ".gitignore" -Encoding utf8
    }

    Write-Success ".gitignore updated"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

Write-Banner
Write-Host "Version $CTOC_VERSION - Smart Skill Loading"
Write-Host ""

Test-Directory
Get-CoreFiles
Install-Skills
$project = Get-ProjectSetup
New-ClaudeMd -Project $project
New-IronLoopMd -Project $project
New-PlanningMd -Project $project
New-ProjectMap
Update-Gitignore

# Count downloaded skills
$skillCount = 0
if (Test-Path ".ctoc\skills") {
    $skillCount = (Get-ChildItem ".ctoc\skills" -Recurse -Filter "*.md" -ErrorAction SilentlyContinue | Measure-Object).Count
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  CTOC v$CTOC_VERSION installed successfully!" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Files created/updated:"
Write-Host "    • CLAUDE.md          - CTO instructions (smart-merged)"
Write-Host "    • IRON_LOOP.md       - 15-step progress tracking"
Write-Host "    • PLANNING.md        - Feature backlog"
Write-Host "    • .ctoc\PROJECT_MAP.md - Codebase quick reference"
Write-Host "    • .ctoc\             - Skills library ($skillCount skills downloaded)"
Write-Host ""
Write-Host "  Research (WebSearch enabled by default):"
Write-Host "    • .ctoc\bin\ctoc.ps1 research status  - Show research config"
Write-Host "    • .ctoc\bin\ctoc.ps1 research off     - Disable WebSearch"
Write-Host "    • .ctoc\bin\ctoc.ps1 research on      - Re-enable WebSearch"
Write-Host ""
Write-Host "  Skill commands:"
Write-Host "    • .ctoc\bin\ctoc.ps1 skills list       - See all 261 available skills"
Write-Host "    • .ctoc\bin\ctoc.ps1 skills add NAME   - Add a specific skill"
Write-Host "    • .ctoc\bin\ctoc.ps1 skills sync       - Auto-detect & download skills"
Write-Host "    • .ctoc\bin\ctoc.ps1 skills feedback   - Suggest skill improvements"
Write-Host ""
Write-Host "  GitHub integration (requires gh CLI):"
Write-Host "    • .ctoc\bin\ctoc.ps1 process-issues   - Process community suggestions"
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    1. Review and customize CLAUDE.md"
Write-Host "    2. Run 'claude' in this directory"
Write-Host "    3. Claude is now your CTO!"
Write-Host ""
Write-Host "  Iron Loop: Use many parallel subagents for research phases!"
Write-Host "    Subagent count: max(2, CPU_CORES - 4)"
Write-Host ""
