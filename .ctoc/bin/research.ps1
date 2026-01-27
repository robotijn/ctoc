# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Research Configuration (PowerShell)
#  Toggle and configure WebSearch for Iron Loop steps
# ═══════════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

$SettingsFile = ".ctoc/settings.yaml"

# ═══════════════════════════════════════════════════════════════════════════════
#  Help
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Help {
    @"
CTOC Research Configuration

Manage WebSearch integration for Iron Loop steps.
WebSearch is ENABLED by default and runs automatically at high-value steps.

USAGE:
    ctoc research <command> [options]

COMMANDS:
    status              Show current research configuration
    on                  Enable WebSearch (default)
    off                 Disable WebSearch
    steps <list>        Set auto-research steps (comma-separated)

AUTO-RESEARCH STEPS (default: 1,2,5,12):
    1  ASSESS   - Problem domain, existing solutions
    2  ALIGN    - Business patterns, UX research
    5  DESIGN   - Architecture patterns, scalability
    12 SECURE   - CVE lookup, security advisories

OPTIONAL STEPS (available on request: 4,6,11,13):
    4  PLAN     - Find similar implementations
    6  SPEC     - Validate API design standards
    11 OPTIMIZE - Performance benchmarks
    13 DOCUMENT - Documentation standards

EXAMPLES:
    ctoc research status          # Show current config (default: ON)
    ctoc research off             # Disable WebSearch
    ctoc research on              # Re-enable WebSearch
    ctoc research steps 1,2,5,12  # Customize auto-research steps

DISABLE FOR:
    - Offline environments
    - Confidential projects
    - Speed optimization
"@
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Utility Functions
# ═══════════════════════════════════════════════════════════════════════════════

function Ensure-Settings {
    if (-not (Test-Path $SettingsFile)) {
        Write-Host "Error: Settings file not found at $SettingsFile"
        Write-Host "Run 'ctoc init' first to initialize your project."
        exit 1
    }
}

function Get-ResearchEnabled {
    $content = Get-Content $SettingsFile -Raw -ErrorAction SilentlyContinue
    if ($content -match "enabled:\s*false") {
        return $false
    }
    return $true
}

function Get-AutoSteps {
    $content = Get-Content $SettingsFile -Raw -ErrorAction SilentlyContinue
    if ($content -match "auto_steps:\s*\[([^\]]+)\]") {
        return $matches[1].Trim()
    }
    return "1, 2, 5, 12"
}

function Set-ResearchEnabled {
    param ([bool]$Enabled)

    $content = Get-Content $SettingsFile -Raw
    $value = if ($Enabled) { "true" } else { "false" }

    if ($content -match "enabled:\s*(true|false)") {
        $content = $content -replace "enabled:\s*(true|false)", "enabled: $value"
    }

    $content | Out-File -FilePath $SettingsFile -Encoding UTF8 -NoNewline
}

function Set-AutoSteps {
    param ([string]$Steps)

    $content = Get-Content $SettingsFile -Raw
    $stepsArray = "[$Steps]"

    if ($content -match "auto_steps:\s*\[[^\]]*\]") {
        $content = $content -replace "auto_steps:\s*\[[^\]]*\]", "auto_steps: $stepsArray"
    }

    $content | Out-File -FilePath $SettingsFile -Encoding UTF8 -NoNewline
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Commands
# ═══════════════════════════════════════════════════════════════════════════════

function Research-Status {
    Ensure-Settings

    $enabled = Get-ResearchEnabled
    $steps = Get-AutoSteps

    Write-Host "CTOC Research Configuration"
    Write-Host "═══════════════════════════════════════"
    Write-Host ""

    if ($enabled) {
        Write-Host "  Status:     ENABLED (default)"
        Write-Host "  Auto-steps: $steps"
        Write-Host ""
        Write-Host "WebSearch runs automatically at these Iron Loop steps:"
        Write-Host ""

        $stepArray = $steps -split ',' | ForEach-Object { $_.Trim() }
        foreach ($step in $stepArray) {
            switch ($step) {
                "1"  { Write-Host "  ✓ Step 1 (ASSESS)   - Problem domain research" }
                "2"  { Write-Host "  ✓ Step 2 (ALIGN)    - Business patterns, UX" }
                "4"  { Write-Host "  ✓ Step 4 (PLAN)     - Similar implementations" }
                "5"  { Write-Host "  ✓ Step 5 (DESIGN)   - Architecture patterns" }
                "6"  { Write-Host "  ✓ Step 6 (SPEC)     - API design standards" }
                "11" { Write-Host "  ✓ Step 11 (OPTIMIZE) - Performance benchmarks" }
                "12" { Write-Host "  ✓ Step 12 (SECURE)   - CVE lookup, advisories" }
                "13" { Write-Host "  ✓ Step 13 (DOCUMENT) - Documentation standards" }
            }
        }
    } else {
        Write-Host "  Status:     DISABLED"
        Write-Host ""
        Write-Host "WebSearch is disabled. Run 'ctoc research on' to enable."
    }

    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  ctoc research on              Enable WebSearch"
    Write-Host "  ctoc research off             Disable WebSearch"
    Write-Host "  ctoc research steps 1,2,5,12  Set auto-research steps"
}

function Research-On {
    Ensure-Settings
    Set-ResearchEnabled $true
    Write-Host "WebSearch enabled."
    Write-Host "Auto-research will run at configured Iron Loop steps."
}

function Research-Off {
    Ensure-Settings
    Set-ResearchEnabled $false
    Write-Host "WebSearch disabled."
    Write-Host "No automatic research will be performed."
}

function Research-Steps {
    param ([string]$Steps)

    if ([string]::IsNullOrWhiteSpace($Steps)) {
        Write-Host "Usage: ctoc research steps <comma-separated-steps>"
        Write-Host "Example: ctoc research steps 1,2,5,12"
        exit 1
    }

    # Validate steps
    $stepArray = $Steps -split ',' | ForEach-Object { $_.Trim() }
    foreach ($step in $stepArray) {
        $stepNum = [int]$step
        if ($stepNum -lt 1 -or $stepNum -gt 15) {
            Write-Host "Error: Invalid step '$step'. Steps must be 1-15."
            exit 1
        }
    }

    Ensure-Settings
    Set-AutoSteps $Steps
    Write-Host "Auto-research steps set to: $Steps"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

function Main {
    param (
        [string]$Command = "status",
        [string]$Arg1 = ""
    )

    switch ($Command) {
        "status" {
            Research-Status
        }
        { $_ -in "on", "enable" } {
            Research-On
        }
        { $_ -in "off", "disable" } {
            Research-Off
        }
        "steps" {
            Research-Steps $Arg1
        }
        { $_ -in "help", "--help", "-h" } {
            Show-Help
        }
        default {
            Write-Host "Unknown command: $Command"
            Write-Host "Run 'ctoc research help' for usage."
            exit 1
        }
    }
}

# Parse arguments
$cmd = if ($args.Count -gt 0) { $args[0] } else { "status" }
$arg1 = if ($args.Count -gt 1) { $args[1] } else { "" }

Main $cmd $arg1
