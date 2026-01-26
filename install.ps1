#Requires -Version 5.1
<#
.SYNOPSIS
    CTOC - CTO Chief Installation Script for Windows
.DESCRIPTION
    Installs CTOC (CTO Chief) - Your Army of Virtual CTOs
.EXAMPLE
    irm https://raw.githubusercontent.com/theaiguys/ctoc/main/install.ps1 | iex
#>

$ErrorActionPreference = "Stop"
$CTOC_VERSION = "1.0.0"
$CTOC_REPO = "https://github.com/theaiguys/ctoc"
$CTOC_RAW = "https://raw.githubusercontent.com/theaiguys/ctoc/main"

function Write-Banner {
    Write-Host @"

   _____ _______ ____   _____ 
  / ____|__   __/ __ \ / ____|
 | |       | | | |  | | |     
 | |       | | | |  | | |     
 | |____   | | | |__| | |____ 
  \_____|  |_|  \____/ \_____|
                              
  CTO Chief - Your Army of Virtual CTOs
  Version $CTOC_VERSION

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

function Test-Directory {
    if (Test-Path "CLAUDE.md") {
        Write-Warning "CLAUDE.md already exists in this directory."
        $response = Read-Host "Overwrite? (y/N)"
        if ($response -ne 'y' -and $response -ne 'Y') {
            Write-Host "Aborted."
            exit 1
        }
    }
}

function Install-Skills {
    Write-Step "Downloading CTOC skills library..."
    
    # Create directory structure
    $dirs = @(
        ".ctoc\skills\languages",
        ".ctoc\skills\frameworks\web",
        ".ctoc\skills\frameworks\mobile",
        ".ctoc\skills\frameworks\data",
        ".ctoc\skills\frameworks\ai-ml",
        ".ctoc\templates"
    )
    
    foreach ($dir in $dirs) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    
    # Try git clone first
    if (Get-Command git -ErrorAction SilentlyContinue) {
        try {
            Write-Step "Cloning repository..."
            git clone --depth 1 $CTOC_REPO .ctoc-temp 2>$null
            if (Test-Path ".ctoc-temp\.ctoc") {
                Copy-Item -Recurse -Force ".ctoc-temp\.ctoc\*" ".ctoc\"
                Remove-Item -Recurse -Force ".ctoc-temp"
                Write-Success "Skills library installed via git"
                return
            }
        } catch {
            Write-Warning "Git clone failed, downloading manually..."
        }
    }
    
    # Fallback: Download templates at minimum
    Write-Step "Downloading templates..."
    try {
        Invoke-WebRequest -Uri "$CTOC_RAW/.ctoc/templates/CLAUDE.md.template" -OutFile ".ctoc\templates\CLAUDE.md.template" -UseBasicParsing
        Invoke-WebRequest -Uri "$CTOC_RAW/.ctoc/templates/IRON_LOOP.md.template" -OutFile ".ctoc\templates\IRON_LOOP.md.template" -UseBasicParsing
        Invoke-WebRequest -Uri "$CTOC_RAW/.ctoc/templates/PLANNING.md.template" -OutFile ".ctoc\templates\PLANNING.md.template" -UseBasicParsing
    } catch {
        Write-Warning "Could not download all templates. For full skills library, clone the repo manually."
    }
    
    Write-Success "Skills library structure created"
}

function Get-ProjectSetup {
    Write-Step "Setting up your project..."
    Write-Host ""
    
    # Project name
    $defaultName = Split-Path -Leaf (Get-Location)
    $projectName = Read-Host "Project name [$defaultName]"
    if ([string]::IsNullOrWhiteSpace($projectName)) { $projectName = $defaultName }
    
    # Language selection
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
    
    # Framework
    Write-Host ""
    $framework = Read-Host "Primary framework (optional, e.g., FastAPI, React, Django)"
    
    # Description
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
    
    $frameworkLine = if ($Project.Framework) { "- **Framework:** $($Project.Framework)" } else { "" }
    $frameworkSkill = if ($Project.Framework) { "- ``.ctoc/skills/frameworks/*/$($Project.Framework.ToLower()).md`` - $($Project.Framework) CTO standards" } else { "" }
    
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

Reference skills from ``.ctoc/skills/`` for language and framework-specific guidance:
- ``.ctoc/skills/languages/$($Project.Language.ToLower()).md`` - $($Project.Language) CTO standards
$frameworkSkill

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

## Iron Loop Methodology

Follow the 12-step Iron Loop for all implementation:

1. **ASSESS** - Understand the problem
2. **PLAN** - Design the solution
3. **RISKS** - Identify what could go wrong
4. **PREPARE** - Set up environment
5. **ITERATE** - Build incrementally
6. **VALIDATE** - Test thoroughly
7. **DOCUMENT** - Explain decisions
8. **REVIEW** - Self-review as CTO
9. **SHIP** - Deploy confidently
10. **MONITOR** - Watch for issues
11. **LEARN** - Retrospective
12. **IMPROVE** - Apply lessons

See ``IRON_LOOP.md`` for current project status.
See ``PLANNING.md`` for feature backlog.
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

> Track progress through the 12-step methodology

## Current Status

| Step | Status | Notes |
|------|--------|-------|
| 1. ASSESS | 🟡 In Progress | Initial project setup |
| 2. PLAN | ⚪ Pending | |
| 3. RISKS | ⚪ Pending | |
| 4. PREPARE | ⚪ Pending | |
| 5. ITERATE | ⚪ Pending | |
| 6. VALIDATE | ⚪ Pending | |
| 7. DOCUMENT | ⚪ Pending | |
| 8. REVIEW | ⚪ Pending | |
| 9. SHIP | ⚪ Pending | |
| 10. MONITOR | ⚪ Pending | |
| 11. LEARN | ⚪ Pending | |
| 12. IMPROVE | ⚪ Pending | |

## Legend
- ⚪ Pending
- 🟡 In Progress
- 🟢 Complete
- 🔴 Blocked

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

# Main execution
Write-Banner
Test-Directory
Install-Skills
$project = Get-ProjectSetup
New-ClaudeMd -Project $project
New-IronLoopMd -Project $project
New-PlanningMd -Project $project

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  CTOC installed successfully!" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Files created:"
Write-Host "    • CLAUDE.md     - CTO instructions for Claude"
Write-Host "    • IRON_LOOP.md  - Progress tracking"
Write-Host "    • PLANNING.md   - Feature backlog"
Write-Host "    • .ctoc\        - Skills library (103 CTO personas)"
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    1. Review and customize CLAUDE.md"
Write-Host "    2. Run 'claude' in this directory"
Write-Host "    3. Claude is now your CTO!"
Write-Host ""
