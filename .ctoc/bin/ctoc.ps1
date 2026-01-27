# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - CTO Chief CLI (PowerShell)
#  Main entry point for skill management commands
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [Parameter(Position = 0)]
    [string]$Command = "help",

    [Parameter(Position = 1)]
    [string]$SubCommand = "",

    [Parameter(Position = 2, ValueFromRemainingArguments = $true)]
    [string[]]$Args = @()
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Version = "1.2.0"

# ═══════════════════════════════════════════════════════════════════════════════
#  Find skills index
# ═══════════════════════════════════════════════════════════════════════════════

function Get-SkillsIndex {
    if (Test-Path ".ctoc/skills.json") {
        return ".ctoc/skills.json"
    }
    $parentIndex = Join-Path (Split-Path -Parent $ScriptDir) "skills.json"
    if (Test-Path $parentIndex) {
        return $parentIndex
    }
    throw "skills.json not found"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Help
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Help {
    @"
CTOC - CTO Chief v$Version
Your army of virtual CTOs.

USAGE:
    ctoc <command> [options]

SKILL COMMANDS:
    skills list              List all available skills (261 total)
    skills active            Show skills downloaded for this project
    skills add <name>        Download and add a skill
    skills search <query>    Search skills by keyword
    skills sync              Detect and download needed skills
    skills info <name>       Show skill details
    skills feedback <name>   Open issue form to suggest skill improvement

PLAN COMMANDS:
    plan new <title>         Create a new functional plan
    plan propose <id>        Submit plan for review
    plan approve <id>        Approve a plan
    plan start <id>          Begin work on plan
    plan implement <id>      Create implementation plan
    plan complete <id>       Mark plan as implemented
    plan list [status]       List plans
    plan status              Show plan dashboard

AGENT COMMANDS:
    agent list               List all agents (60 total)
    agent info <name>        Show agent details
    agent upgrade <name>     Add capability to upgrade queue
    agent research <name>    Show research queries for agent
    agent check              Check for agent updates
    agent apply <name>       Apply pending upgrades

PROGRESS COMMANDS:
    progress                 Quick progress view
    dashboard                Full progress dashboard
    progress step <n>        Move to Iron Loop step
    progress complete <n>    Complete step and move to next

GIT WORKFLOW COMMANDS:
    sync                     Pull-rebase-push workflow
    commit "message"         Stage, validate, commit, and push
    qc "message"             Quick commit and push
    status                   Enhanced git status
    lock-check <file>        Check if file is fresh (alias for lock check)
    lock check [files]       Check file freshness
    lock resolve             Smart conflict resolution
    lock setup-rerere        Enable git rerere
    lock worktree new <br>   Create parallel workspace

COMMUNITY COMMANDS:
    process-issues           Fetch approved skill improvements for processing

RESEARCH COMMANDS:
    research status          Show current research configuration
    research on              Enable WebSearch (default)
    research off             Disable WebSearch
    research steps <list>    Set auto-research steps (comma-separated)

DETECTION COMMANDS:
    detect                   Detect technologies in current project
    detect languages         Detect only languages
    detect frameworks        Detect only frameworks

UPDATE COMMANDS:
    update                   Update CTOC to latest version
    update check             Check for updates

OTHER COMMANDS:
    help                     Show this help
    version                  Show version

EXAMPLES:
    ctoc skills list                    # See all available skills
    ctoc skills add langchain           # Add LangChain guidance
    ctoc skills sync                    # Auto-detect and download skills
    ctoc detect                         # See what technologies are detected
    ctoc plan new "Add authentication"  # Create a new plan
    ctoc plan status                    # View plan dashboard

"@
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Skills Commands
# ═══════════════════════════════════════════════════════════════════════════════

function Get-SkillsList {
    $indexPath = Get-SkillsIndex
    $index = Get-Content $indexPath -Raw | ConvertFrom-Json

    Write-Host "Available Skills:"
    Write-Host ""

    $langCount = ($index.skills.languages.PSObject.Properties | Measure-Object).Count
    Write-Host "Languages ($langCount):"
    $index.skills.languages.PSObject.Properties.Name | Sort-Object | ForEach-Object { Write-Host "  $_" }

    Write-Host ""
    Write-Host "Frameworks by Category:"

    foreach ($category in $index.skills.frameworks.PSObject.Properties) {
        $count = ($category.Value.PSObject.Properties | Measure-Object).Count
        Write-Host ""
        Write-Host "  $($category.Name) ($count):"
        $category.Value.PSObject.Properties.Name | Sort-Object | ForEach-Object { Write-Host "    $_" }
    }
}

function Get-ActiveSkills {
    if (-not (Test-Path ".ctoc/skills")) {
        Write-Host "No skills downloaded for this project."
        return
    }

    Write-Host "Active Skills:"
    Write-Host ""

    # Languages
    $langDir = ".ctoc/skills/languages"
    if (Test-Path $langDir) {
        $langs = Get-ChildItem $langDir -Filter "*.md" -ErrorAction SilentlyContinue
        if ($langs) {
            Write-Host "Languages:"
            $langs | ForEach-Object { Write-Host "  - $($_.BaseName)" }
        }
    }

    # Frameworks
    $frameworksDir = ".ctoc/skills/frameworks"
    if (Test-Path $frameworksDir) {
        foreach ($catDir in Get-ChildItem $frameworksDir -Directory -ErrorAction SilentlyContinue) {
            $files = Get-ChildItem $catDir.FullName -Filter "*.md" -ErrorAction SilentlyContinue
            if ($files) {
                Write-Host ""
                Write-Host "Frameworks ($($catDir.Name)):"
                $files | ForEach-Object { Write-Host "  - $($_.BaseName)" }
            }
        }
    }
}

function Add-Skill {
    param([string]$Name)
    & "$ScriptDir/download.ps1" "with-deps" $Name
}

function Search-Skills {
    param([string]$Query)

    $indexPath = Get-SkillsIndex
    $index = Get-Content $indexPath -Raw | ConvertFrom-Json

    Write-Host "Searching for: $Query"
    Write-Host ""

    Write-Host "Languages:"
    $index.skills.languages.PSObject.Properties |
        Where-Object { $_.Name -like "*$Query*" } |
        ForEach-Object { Write-Host "  - $($_.Name)" }

    Write-Host ""
    Write-Host "Frameworks:"
    foreach ($category in $index.skills.frameworks.PSObject.Properties) {
        foreach ($framework in $category.Value.PSObject.Properties) {
            $match = $framework.Name -like "*$Query*"
            if (-not $match -and $framework.Value.keywords) {
                $match = $framework.Value.keywords | Where-Object { $_ -like "*$Query*" }
            }
            if ($match) {
                Write-Host "  - $($framework.Name)"
            }
        }
    }
}

function Get-SkillInfo {
    param([string]$Name)

    $indexPath = Get-SkillsIndex
    $index = Get-Content $indexPath -Raw | ConvertFrom-Json

    # Try languages
    $info = $index.skills.languages.PSObject.Properties[$Name]

    # Try frameworks
    if (-not $info) {
        foreach ($category in $index.skills.frameworks.PSObject.Properties) {
            $info = $category.Value.PSObject.Properties[$Name]
            if ($info) { break }
        }
    }

    if (-not $info) {
        Write-Host "Skill not found: $Name"
        exit 1
    }

    Write-Host "Skill: $Name"
    $info.Value | ConvertTo-Json -Depth 5
}

function Sync-Skills {
    & "$ScriptDir/download.ps1" "sync"
}

function Open-SkillFeedback {
    param([string]$Name)

    $repo = if ($env:CTOC_REPO) { $env:CTOC_REPO } else { "theaiguys/ctoc" }
    $encodedName = [System.Web.HttpUtility]::UrlEncode($Name)
    $url = "https://github.com/$repo/issues/new?template=skill-improvement.yml&title=%5BSkill%5D+Update+$encodedName"

    Write-Host "Opening skill improvement form for: $Name"
    Write-Host ""

    Start-Process $url
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Community Commands
# ═══════════════════════════════════════════════════════════════════════════════

function Invoke-ProcessIssues {
    & "$ScriptDir/process-issues.ps1"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Update Check (once per day, silent on failure)
# ═══════════════════════════════════════════════════════════════════════════════

$updateCheckScript = Join-Path $ScriptDir "update-check.ps1"
if (Test-Path $updateCheckScript) {
    try {
        & $updateCheckScript -Silent:$false 2>$null
    } catch {
        # Ignore errors from update check
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

switch ($Command) {
    "skills" {
        switch ($SubCommand) {
            "list" { Get-SkillsList }
            "active" { Get-ActiveSkills }
            "add" {
                if ($Args.Count -eq 0) {
                    Write-Host "Usage: ctoc skills add <skill-name>"
                    exit 1
                }
                Add-Skill -Name $Args[0]
            }
            "search" {
                if ($Args.Count -eq 0) {
                    Write-Host "Usage: ctoc skills search <query>"
                    exit 1
                }
                Search-Skills -Query $Args[0]
            }
            "sync" { Sync-Skills }
            "info" {
                if ($Args.Count -eq 0) {
                    Write-Host "Usage: ctoc skills info <skill-name>"
                    exit 1
                }
                Get-SkillInfo -Name $Args[0]
            }
            "feedback" {
                if ($Args.Count -eq 0) {
                    Write-Host "Usage: ctoc skills feedback <skill-name>"
                    Write-Host "Opens a GitHub issue form to suggest improvements for the skill."
                    exit 1
                }
                Open-SkillFeedback -Name $Args[0]
            }
            "" { Get-SkillsList }
            default {
                Write-Host "Unknown skills command: $SubCommand"
                Write-Host "Available: list, active, add, search, sync, info, feedback"
                exit 1
            }
        }
    }

    "detect" {
        $mode = if ($SubCommand) { $SubCommand } else { "all" }
        & "$ScriptDir/detect.ps1" -Mode $mode
    }

    "research" {
        & "$ScriptDir/research.ps1" $SubCommand $Args
    }

    "plan" {
        & "$ScriptDir/plan.ps1" $SubCommand $Args
    }

    "progress" {
        & "$ScriptDir/progress.ps1" $SubCommand $Args
    }

    "dashboard" {
        & "$ScriptDir/progress.ps1" "dashboard"
    }

    "sync" {
        & "$ScriptDir/git-workflow.ps1" "sync" $SubCommand
    }

    "commit" {
        & "$ScriptDir/git-workflow.ps1" "commit" $SubCommand $Args
    }

    { $_ -in "qc", "quick-commit" } {
        & "$ScriptDir/git-workflow.ps1" "qc" $SubCommand
    }

    "status" {
        & "$ScriptDir/git-workflow.ps1" "status"
    }

    "lock-check" {
        & "$ScriptDir/file-lock.ps1" "check" $SubCommand
    }

    "lock" {
        & "$ScriptDir/file-lock.ps1" $SubCommand $Args
    }

    "agent" {
        & "$ScriptDir/upgrade-agent.ps1" $SubCommand $Args
    }

    "process-issues" {
        Invoke-ProcessIssues
    }

    "update" {
        switch ($SubCommand) {
            "check" {
                $env:CTOC_SKIP_UPDATE_CHECK = ""
                & "$ScriptDir/update-check.ps1" -Force
            }
            { $_ -in "now", "" } {
                Write-Host "Updating CTOC..."
                $repo = if ($env:CTOC_REPO) { $env:CTOC_REPO } else { "theaiguys/ctoc" }
                $branch = if ($env:CTOC_BRANCH) { $env:CTOC_BRANCH } else { "main" }
                $installUrl = "https://raw.githubusercontent.com/$repo/$branch/install.ps1"
                try {
                    $installer = Invoke-WebRequest -Uri $installUrl -UseBasicParsing
                    Invoke-Expression $installer.Content
                } catch {
                    Write-Host "Error: Failed to download installer" -ForegroundColor Red
                    exit 1
                }
            }
            default {
                Write-Host "Unknown update command: $SubCommand"
                Write-Host "Available: check, now"
                exit 1
            }
        }
    }

    { $_ -in "help", "--help", "-h" } {
        Show-Help
    }

    { $_ -in "version", "--version", "-v" } {
        Write-Host "CTOC v$Version"
    }

    default {
        Write-Host "Unknown command: $Command"
        Write-Host "Run 'ctoc help' for usage."
        exit 1
    }
}
