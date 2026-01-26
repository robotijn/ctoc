# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Plan Lifecycle Management (PowerShell)
#  Manages plan states: DRAFT → PROPOSED → APPROVED → IN_PROGRESS → IMPLEMENTED
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [Parameter(Position = 0)]
    [string]$Command = "help",

    [Parameter(Position = 1)]
    [string]$Arg1 = "",

    [Parameter(Position = 2)]
    [string]$Arg2 = ""
)

$ErrorActionPreference = "Stop"

# Plan directories
$PlansDir = ".ctoc\plans"
$FunctionalDir = "$PlansDir\functional"
$ImplementationDir = "$PlansDir\implementation"
$IndexFile = "$PlansDir\index.yaml"

# ═══════════════════════════════════════════════════════════════════════════════
#  Initialize Plans Directory
# ═══════════════════════════════════════════════════════════════════════════════

function Initialize-Plans {
    New-Item -ItemType Directory -Path $FunctionalDir -Force | Out-Null
    New-Item -ItemType Directory -Path $ImplementationDir -Force | Out-Null

    if (-not (Test-Path $IndexFile)) {
        @"
# CTOC Plan Index
# Tracks all plans and their statuses

plans: []
last_plan_number: 0
"@ | Out-File -FilePath $IndexFile -Encoding utf8
        Write-Host "Plans directory initialized." -ForegroundColor Green
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Generate Plan ID
# ═══════════════════════════════════════════════════════════════════════════════

function Get-NextPlanId {
    param([string]$Prefix = "PLAN")

    if (-not (Test-Path $IndexFile)) {
        return "$Prefix-001"
    }

    $content = Get-Content $IndexFile -Raw
    if ($content -match "last_plan_number:\s*(\d+)") {
        $lastNum = [int]$Matches[1]
    } else {
        $lastNum = 0
    }

    $nextNum = $lastNum + 1
    return "{0}-{1:D3}" -f $Prefix, $nextNum
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create New Plan
# ═══════════════════════════════════════════════════════════════════════════════

function New-Plan {
    param(
        [string]$Title,
        [string]$Type = "functional",
        [string]$Parent = ""
    )

    Initialize-Plans

    $prefix = if ($Type -eq "implementation") { "IMPL" } else { "PLAN" }
    $targetDir = if ($Type -eq "implementation") { $ImplementationDir } else { $FunctionalDir }

    $planId = Get-NextPlanId -Prefix $prefix

    $filename = ($Title.ToLower() -replace ' ', '-' -replace '[^a-z0-9-]', '').Substring(0, [Math]::Min(50, $Title.Length))
    $filename = "$planId-$filename.md"
    $filepath = Join-Path $targetDir $filename

    $date = Get-Date -Format "yyyy-MM-dd"
    $author = $env:USERNAME

    $parentLine = if ($Parent) { "parent_plan: $Parent" } else { "" }

    $content = @"
---
id: $planId
title: "$Title"
status: draft
type: $Type
created: $date
author: $author
approvers: []
$parentLine
branch: null
pr: null
commits: []
---

# $Title

## Summary

*TODO: Brief description of what this plan achieves*

## Background

*TODO: Context and motivation for this plan*

## Requirements

### Functional Requirements
- [ ] *TODO: Add requirements*

### Non-Functional Requirements
- [ ] *TODO: Add requirements*

## Design

*TODO: Technical design and approach*

## Implementation Steps

1. *TODO: Step 1*
2. *TODO: Step 2*
3. *TODO: Step 3*

## Testing Strategy

*TODO: How will this be tested?*

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| *TODO* | *TODO* |

## Dependencies

*TODO: What does this depend on?*

## Timeline

*TODO: Milestones and estimates (if applicable)*

---

## Approval History

| Approver | Date | Status | Notes |
|----------|------|--------|-------|
| | | | |
"@

    $content | Out-File -FilePath $filepath -Encoding utf8

    # Update index
    $indexContent = Get-Content $IndexFile -Raw
    $indexContent = $indexContent -replace "last_plan_number:\s*\d+", "last_plan_number: $($planId -replace '\D', '')"

    $indexContent += @"

- id: $planId
  title: "$Title"
  status: draft
  type: $Type
  file: $filepath
  created: $date
"@

    $indexContent | Out-File -FilePath $IndexFile -Encoding utf8

    Write-Host "Created plan: $planId" -ForegroundColor Green
    Write-Host "  File: $filepath"
    Write-Host "  Status: DRAFT"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Edit $filepath to fill in details"
    Write-Host "  2. Run 'ctoc plan propose $planId' when ready for review"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Update Plan Status
# ═══════════════════════════════════════════════════════════════════════════════

function Set-PlanStatus {
    param(
        [string]$PlanId,
        [string]$NewStatus
    )

    $validStatuses = @("draft", "proposed", "approved", "in_progress", "implemented", "superseded")
    if ($validStatuses -notcontains $NewStatus) {
        Write-Host "Invalid status: $NewStatus" -ForegroundColor Red
        Write-Host "Valid statuses: $($validStatuses -join ', ')"
        return
    }

    $planFile = Get-ChildItem -Path $PlansDir -Recurse -Filter "$PlanId*.md" -ErrorAction SilentlyContinue | Select-Object -First 1

    if (-not $planFile) {
        Write-Host "Plan not found: $PlanId" -ForegroundColor Red
        return
    }

    # Update status in plan file
    $content = Get-Content $planFile.FullName -Raw
    $content = $content -replace "status:\s*\w+", "status: $NewStatus"
    $content | Out-File -FilePath $planFile.FullName -Encoding utf8

    # Update status in index
    $indexContent = Get-Content $IndexFile -Raw
    $indexContent = $indexContent -replace "(?m)(id:\s*$PlanId[\s\S]*?status:\s*)\w+", "`$1$NewStatus"
    $indexContent | Out-File -FilePath $IndexFile -Encoding utf8

    Write-Host "Plan $PlanId status updated to: $NewStatus" -ForegroundColor Green

    switch ($NewStatus) {
        "approved" {
            Write-Host ""
            Write-Host "Plan approved! Next steps:"
            Write-Host "  1. Run 'ctoc plan implement $PlanId' to create implementation plan"
            Write-Host "  2. Or run 'ctoc plan start $PlanId' to begin work directly"
        }
        "in_progress" {
            $branchName = "feature/$PlanId"
            Write-Host "Consider creating branch: $branchName"
        }
        "implemented" {
            Write-Host ""
            Write-Host "Plan marked as implemented."
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  List Plans
# ═══════════════════════════════════════════════════════════════════════════════

function Get-Plans {
    param([string]$Filter = "all")

    if (-not (Test-Path $IndexFile)) {
        Write-Host "No plans found. Create one with: ctoc plan new `"Plan Title`""
        return
    }

    Write-Host "CTOC Plans" -ForegroundColor Cyan
    Write-Host "════════════════════════════════════════════════════════"
    Write-Host ""

    $content = Get-Content $IndexFile -Raw
    $planPattern = "- id:\s*(\S+)[\s\S]*?title:\s*`"([^`"]+)`"[\s\S]*?status:\s*(\w+)[\s\S]*?type:\s*(\w+)"

    $matches = [regex]::Matches($content, $planPattern)
    foreach ($match in $matches) {
        $id = $match.Groups[1].Value
        $title = $match.Groups[2].Value
        $status = $match.Groups[3].Value
        $type = $match.Groups[4].Value

        if ($Filter -eq "all" -or $Filter -eq $status) {
            $color = switch ($status) {
                "draft" { "Yellow" }
                "proposed" { "Blue" }
                "approved" { "Green" }
                "in_progress" { "Cyan" }
                "implemented" { "Green" }
                "superseded" { "Red" }
                default { "White" }
            }

            $titleDisplay = if ($title.Length -gt 48) { $title.Substring(0, 48) } else { $title }
            Write-Host ("  {0,-12} {1,-50} " -f $id, $titleDisplay) -NoNewline
            Write-Host ("{0,-12}" -f $status) -ForegroundColor $color -NoNewline
            Write-Host " [$type]"
        }
    }

    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Plan Status Dashboard
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Status {
    Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║                    CTOC Plan Dashboard                       ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

    if (-not (Test-Path $IndexFile)) {
        Write-Host "No plans yet. Create one with: ctoc plan new `"Plan Title`""
        return
    }

    $content = Get-Content $IndexFile -Raw

    $draftCount = ([regex]::Matches($content, "status:\s*draft")).Count
    $proposedCount = ([regex]::Matches($content, "status:\s*proposed")).Count
    $approvedCount = ([regex]::Matches($content, "status:\s*approved")).Count
    $inProgressCount = ([regex]::Matches($content, "status:\s*in_progress")).Count
    $implementedCount = ([regex]::Matches($content, "status:\s*implemented")).Count

    Write-Host "Plan Statistics:"
    Write-Host "  Draft:       $draftCount"
    Write-Host "  Proposed:    $proposedCount"
    Write-Host "  Approved:    $approvedCount"
    Write-Host "  In Progress: $inProgressCount"
    Write-Host "  Implemented: $implementedCount"
    Write-Host ""

    if ($inProgressCount -gt 0) {
        Write-Host "Active Plans:" -ForegroundColor Yellow
        Get-Plans -Filter "in_progress"
    }

    if ($approvedCount -gt 0) {
        Write-Host "Ready to Start:" -ForegroundColor Green
        Get-Plans -Filter "approved"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Help
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Help {
    @"
CTOC Plan Management

USAGE:
    ctoc plan <command> [options]

COMMANDS:
    new <title>           Create a new functional plan
    propose <id>          Submit plan for review (DRAFT → PROPOSED)
    approve <id>          Approve a plan (PROPOSED → APPROVED)
    start <id>            Begin work on plan (APPROVED → IN_PROGRESS)
    implement <id>        Create implementation plan from functional plan
    complete <id>         Mark plan as implemented
    transition <id> <s>   Change plan status manually
    list [status]         List plans (filter by status)
    status                Show plan dashboard
    show <id>             Show plan details

PLAN LIFECYCLE:
    DRAFT → PROPOSED → APPROVED → IN_PROGRESS → IMPLEMENTED

EXAMPLES:
    ctoc plan new "Add user authentication"
    ctoc plan propose PLAN-001
    ctoc plan approve PLAN-001
    ctoc plan start PLAN-001
    ctoc plan list in_progress
    ctoc plan status

"@
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

switch ($Command) {
    "new" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan new <title>"
            exit 1
        }
        New-Plan -Title $Arg1
    }
    "propose" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan propose <plan-id>"
            exit 1
        }
        Set-PlanStatus -PlanId $Arg1 -NewStatus "proposed"
        Write-Host ""
        Write-Host "Plan submitted for review."
    }
    "approve" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan approve <plan-id>"
            exit 1
        }
        Set-PlanStatus -PlanId $Arg1 -NewStatus "approved"
    }
    "start" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan start <plan-id>"
            exit 1
        }
        Set-PlanStatus -PlanId $Arg1 -NewStatus "in_progress"
    }
    "implement" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan implement <parent-plan-id>"
            exit 1
        }
        $parentFile = Get-ChildItem -Path $PlansDir -Recurse -Filter "$Arg1*.md" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($parentFile) {
            $content = Get-Content $parentFile.FullName -Raw
            if ($content -match 'title:\s*"([^"]+)"') {
                $title = $Matches[1]
                New-Plan -Title "Implementation: $title" -Type "implementation" -Parent $Arg1
            }
        } else {
            Write-Host "Parent plan not found: $Arg1" -ForegroundColor Red
        }
    }
    "complete" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan complete <plan-id>"
            exit 1
        }
        Set-PlanStatus -PlanId $Arg1 -NewStatus "implemented"
    }
    "transition" {
        if ([string]::IsNullOrEmpty($Arg1) -or [string]::IsNullOrEmpty($Arg2)) {
            Write-Host "Usage: ctoc plan transition <plan-id> <status>"
            exit 1
        }
        Set-PlanStatus -PlanId $Arg1 -NewStatus $Arg2
    }
    "list" {
        Get-Plans -Filter $(if ($Arg1) { $Arg1 } else { "all" })
    }
    "status" {
        Show-Status
    }
    "show" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan show <plan-id>"
            exit 1
        }
        $planFile = Get-ChildItem -Path $PlansDir -Recurse -Filter "$Arg1*.md" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($planFile) {
            Get-Content $planFile.FullName
        } else {
            Write-Host "Plan not found: $Arg1" -ForegroundColor Red
        }
    }
    { $_ -in "help", "--help", "-h" } {
        Show-Help
    }
    default {
        Write-Host "Unknown command: $Command"
        Write-Host "Run 'ctoc plan help' for usage."
        exit 1
    }
}
