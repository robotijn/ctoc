# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Progress Tracking (PowerShell)
#  Tracks plan progress and provides dashboard views
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [Parameter(Position = 0)]
    [string]$Command = "show",

    [Parameter(Position = 1)]
    [string]$Arg1 = ""
)

$ErrorActionPreference = "Stop"

# Progress directories
$ProgressDir = Join-Path $env:USERPROFILE ".ctoc\progress"
$ProjectHash = (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($PWD.Path))) -Algorithm MD5).Hash.Substring(0, 32)
$ProgressFile = Join-Path $ProgressDir "$ProjectHash.yaml"
$LocalProgress = ".ctoc\progress.yaml"

# Step names
$StepNames = @("ASSESS", "ALIGN", "CAPTURE", "PLAN", "DESIGN", "SPEC", "TEST", "QUALITY", "IMPLEMENT", "REVIEW", "OPTIMIZE", "SECURE", "DOCUMENT", "VERIFY", "COMMIT")

# ═══════════════════════════════════════════════════════════════════════════════
#  Initialize Progress Tracking
# ═══════════════════════════════════════════════════════════════════════════════

function Initialize-Progress {
    if (-not (Test-Path $ProgressDir)) {
        New-Item -ItemType Directory -Path $ProgressDir -Force | Out-Null
    }

    if (-not (Test-Path $LocalProgress)) {
        if (-not (Test-Path ".ctoc")) {
            New-Item -ItemType Directory -Path ".ctoc" -Force | Out-Null
        }

        $date = Get-Date -Format "o"
        @"
# CTOC Local Progress
current_step: 1
step_name: ASSESS
started: $date
"@ | Out-File -FilePath $LocalProgress -Encoding utf8
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Get Current Step
# ═══════════════════════════════════════════════════════════════════════════════

function Get-CurrentStep {
    Initialize-Progress

    $content = Get-Content $LocalProgress -Raw
    if ($content -match "current_step:\s*(\d+)") {
        return [int]$Matches[1]
    }
    return 1
}

function Get-StepName {
    param([int]$Step)
    return $StepNames[$Step - 1]
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Update Step Progress
# ═══════════════════════════════════════════════════════════════════════════════

function Set-Step {
    param([int]$Step)

    if ($Step -lt 1 -or $Step -gt 15) {
        Write-Host "Invalid step: $Step (must be 1-15)" -ForegroundColor Red
        return
    }

    Initialize-Progress

    $stepName = Get-StepName -Step $Step
    $content = Get-Content $LocalProgress -Raw
    $content = $content -replace "current_step:\s*\d+", "current_step: $Step"
    $content = $content -replace "step_name:\s*\w+", "step_name: $stepName"
    $content | Out-File -FilePath $LocalProgress -Encoding utf8

    Write-Host "Progress updated: Step $Step ($stepName)" -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Complete Step
# ═══════════════════════════════════════════════════════════════════════════════

function Complete-Step {
    param([int]$Step)

    $currentStep = Get-CurrentStep

    if ($Step -ne $currentStep) {
        Write-Host "Warning: Completing step $Step but current step is $currentStep" -ForegroundColor Yellow
    }

    $nextStep = $Step + 1
    if ($nextStep -le 15) {
        Set-Step -Step $nextStep
        Write-Host "Moving to step $nextStep" -ForegroundColor Green
    } else {
        Write-Host "All steps completed!" -ForegroundColor Green
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Dashboard
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Dashboard {
    Initialize-Progress

    $projectName = Split-Path -Leaf (Get-Location)
    $currentStep = Get-CurrentStep
    $stepName = Get-StepName -Step $currentStep
    $progress = [math]::Round($currentStep * 100 / 15)

    # Get git stats if available
    $gitCommits = 0
    $gitChanged = 0
    try {
        $gitCommits = (git rev-list --count HEAD 2>$null) -as [int]
        $gitChanged = ((git diff --name-only HEAD~10 2>$null) | Measure-Object).Count
    } catch { }

    Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║                    CTOC Progress Dashboard                   ║
╠══════════════════════════════════════════════════════════════╣
"@ -ForegroundColor Cyan

    Write-Host ("║ Project: {0,-50} ║" -f $projectName)
    Write-Host ("║ Status: Step {0}/15 ({1}) - {2}% complete{3}║" -f $currentStep, $stepName, $progress, (" " * (21 - $stepName.Length)))

    Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
    Write-Host "║ Iron Loop Progress                                           ║"

    # Progress bar
    $filled = [math]::Floor($progress / 5)
    $empty = 20 - $filled
    $bar = ("█" * $filled) + ("░" * $empty)
    Write-Host ("║ {0} {1,3}% (Step {2}/15)                 ║" -f $bar, $progress, $currentStep)

    Write-Host "║                                                              ║"

    # Step status - first row (1-6)
    Write-Host -NoNewline "║ "
    for ($i = 1; $i -le 6; $i++) {
        if ($i -lt $currentStep) {
            Write-Host -NoNewline "[✓]" -ForegroundColor Green
        } elseif ($i -eq $currentStep) {
            Write-Host -NoNewline "[▶]" -ForegroundColor Yellow
        } else {
            Write-Host -NoNewline "[ ]"
        }
        Write-Host -NoNewline (" {0,-7} " -f $StepNames[$i-1])
    }
    Write-Host "      ║"

    # Second row (7-12)
    Write-Host -NoNewline "║ "
    for ($i = 7; $i -le 12; $i++) {
        if ($i -lt $currentStep) {
            Write-Host -NoNewline "[✓]" -ForegroundColor Green
        } elseif ($i -eq $currentStep) {
            Write-Host -NoNewline "[▶]" -ForegroundColor Yellow
        } else {
            Write-Host -NoNewline "[ ]"
        }
        Write-Host -NoNewline (" {0,-7} " -f $StepNames[$i-1])
    }
    Write-Host "      ║"

    # Third row (13-15)
    Write-Host -NoNewline "║ "
    for ($i = 13; $i -le 15; $i++) {
        if ($i -lt $currentStep) {
            Write-Host -NoNewline "[✓]" -ForegroundColor Green
        } elseif ($i -eq $currentStep) {
            Write-Host -NoNewline "[▶]" -ForegroundColor Yellow
        } else {
            Write-Host -NoNewline "[ ]"
        }
        Write-Host -NoNewline (" {0,-7} " -f $StepNames[$i-1])
    }
    Write-Host "                              ║"

    Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
    Write-Host ("║ Lifetime Stats                                               ║")
    Write-Host ("║ Commits: {0,-6} | Files Changed: {1,-5}                      ║" -f $gitCommits, $gitChanged)
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Quick Progress View
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Quick {
    Initialize-Progress

    $currentStep = Get-CurrentStep
    $stepName = Get-StepName -Step $currentStep
    $progress = [math]::Round($currentStep * 100 / 15)

    Write-Host "Iron Loop: Step " -NoNewline
    Write-Host "$currentStep/15" -ForegroundColor Cyan -NoNewline
    Write-Host " ($stepName) - $progress% complete"

    $phase = switch ($currentStep) {
        { $_ -le 6 } { "Planning" }
        { $_ -le 10 } { "Development" }
        default { "Delivery" }
    }

    Write-Host "Phase: " -NoNewline
    Write-Host $phase -ForegroundColor Yellow
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Reset Progress
# ═══════════════════════════════════════════════════════════════════════════════

function Reset-Progress {
    if (Test-Path $LocalProgress) {
        Remove-Item $LocalProgress -Force
        Write-Host "Local progress reset." -ForegroundColor Green
    }
    Initialize-Progress
    Write-Host "Progress initialized to Step 1 (ASSESS)."
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Help
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Help {
    @"
CTOC Progress Tracking

USAGE:
    ctoc progress [command]
    ctoc dashboard

COMMANDS:
    show                  Quick progress view (default)
    dashboard             Full progress dashboard
    step <n>              Move to step n
    complete <n>          Complete step n and move to next
    reset                 Reset progress for current work

IRON LOOP STEPS:
    Planning:    1-ASSESS  2-ALIGN  3-CAPTURE  4-PLAN  5-DESIGN  6-SPEC
    Development: 7-TEST  8-QUALITY  9-IMPLEMENT  10-REVIEW
    Delivery:    11-OPTIMIZE  12-SECURE  13-DOCUMENT  14-VERIFY  15-COMMIT

EXAMPLES:
    ctoc progress                 # Quick view
    ctoc dashboard                # Full dashboard
    ctoc progress step 7          # Move to TEST step
    ctoc progress complete 6      # Complete SPEC, move to TEST

"@
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

switch ($Command) {
    { $_ -in "show", "quick" } {
        Show-Quick
    }
    { $_ -in "dashboard", "full" } {
        Show-Dashboard
    }
    "step" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc progress step <step-number>"
            exit 1
        }
        Set-Step -Step ([int]$Arg1)
    }
    "complete" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc progress complete <step-number>"
            exit 1
        }
        Complete-Step -Step ([int]$Arg1)
    }
    "reset" {
        Reset-Progress
    }
    { $_ -in "help", "--help", "-h" } {
        Show-Help
    }
    default {
        Write-Host "Unknown command: $Command"
        Write-Host "Run 'ctoc progress help' for usage."
        exit 1
    }
}
