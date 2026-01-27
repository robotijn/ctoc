# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Plan Lifecycle Management (PowerShell)
#  Folder-based organization: plans move between status folders
#  Naming: {4-digit-counter}-{slug}.md (e.g., 0052-landing-page-login-button.md)
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

# Plan directories - folder per status
$PlansDir = ".ctoc\plans"
$IndexFile = "$PlansDir\index.yaml"

# Status folders (source of truth)
$StatusFolders = @("draft", "proposed", "approved", "in_progress", "implemented", "superseded")

# ═══════════════════════════════════════════════════════════════════════════════
#  Initialize Plans Directory
# ═══════════════════════════════════════════════════════════════════════════════

function Initialize-Plans {
    # Create status folders
    foreach ($status in $StatusFolders) {
        $folder = Join-Path $PlansDir $status
        if (-not (Test-Path $folder)) {
            New-Item -ItemType Directory -Path $folder -Force | Out-Null
        }
    }

    if (-not (Test-Path $IndexFile)) {
        @"
# CTOC Plan Index
# Counter tracks next plan number
# Plans organized by status folders (source of truth)

next_counter: 1
"@ | Out-File -FilePath $IndexFile -Encoding utf8
        Write-Host "Plans directory initialized." -ForegroundColor Green
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Get Next Counter
# ═══════════════════════════════════════════════════════════════════════════════

function Get-NextCounter {
    if (-not (Test-Path $IndexFile)) {
        return "0001"
    }

    $content = Get-Content $IndexFile -Raw
    if ($content -match "next_counter:\s*(\d+)") {
        $counter = [int]$Matches[1]
    } else {
        $counter = 1
    }

    return "{0:D4}" -f $counter
}

function Update-Counter {
    if (-not (Test-Path $IndexFile)) {
        return
    }

    $content = Get-Content $IndexFile -Raw
    if ($content -match "next_counter:\s*(\d+)") {
        $current = [int]$Matches[1]
    } else {
        $current = 1
    }

    $next = $current + 1
    $content = $content -replace "next_counter:\s*\d+", "next_counter: $next"
    $content | Out-File -FilePath $IndexFile -Encoding utf8
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create Slug from Title
# ═══════════════════════════════════════════════════════════════════════════════

function New-Slug {
    param([string]$Title)

    # Lowercase, replace spaces with dashes, remove special chars, limit length
    $slug = $Title.ToLower() -replace '\s+', '-' -replace '[^a-z0-9-]', ''
    if ($slug.Length -gt 60) {
        $slug = $slug.Substring(0, 60)
    }
    return $slug
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Find Plan by ID (counter prefix)
# ═══════════════════════════════════════════════════════════════════════════════

function Find-Plan {
    param([string]$Id)

    # Normalize ID to 4 digits
    try {
        $normalizedId = "{0:D4}" -f [int]$Id
    } catch {
        $normalizedId = $Id
    }

    # Search in all status folders
    foreach ($status in $StatusFolders) {
        $folder = Join-Path $PlansDir $status
        if (Test-Path $folder) {
            $found = Get-ChildItem -Path $folder -Filter "$normalizedId-*.md" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) {
                return $found.FullName
            }
        }
    }

    return $null
}

function Get-PlanStatus {
    param([string]$FilePath)

    # Extract status from path (parent folder name)
    $parent = Split-Path -Parent $FilePath
    return Split-Path -Leaf $parent
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create New Plan
# ═══════════════════════════════════════════════════════════════════════════════

function New-Plan {
    param(
        [string]$Title,
        [string]$Type = "functional",
        [string]$ParentId = ""
    )

    Initialize-Plans

    $counter = Get-NextCounter
    $slug = New-Slug -Title $Title
    $filename = "$counter-$slug.md"
    $filepath = Join-Path $PlansDir "draft" $filename

    $date = Get-Date -Format "yyyy-MM-dd"
    $author = $env:USERNAME

    # Resolve parent info if provided
    $parentLine = ""
    $parentTitleLine = ""
    if ($ParentId) {
        $parentFile = Find-Plan -Id $ParentId
        if ($parentFile) {
            $parentContent = Get-Content $parentFile -Raw
            if ($parentContent -match 'title:\s*"([^"]+)"') {
                $parentTitle = $Matches[1]
                $parentLine = "parent_id: $ParentId"
                $parentTitleLine = "parent_title: `"$parentTitle`""
            }
        }
    }

    $content = @"
---
id: $counter
title: "$Title"
type: $Type
created: $date
author: $author
$parentLine
$parentTitleLine
approvers: []
branch: null
pr: null
---

# $Title

## Summary

*Brief description of what this plan achieves*

## Background

*Context and motivation for this plan*

## Requirements

### Functional Requirements
- [ ] Requirement 1
- [ ] Requirement 2

### Non-Functional Requirements
- [ ] Performance:
- [ ] Security:

## Design

*Technical design and approach*

## Implementation Steps

1. Step 1
2. Step 2
3. Step 3

## Testing Strategy

*How will this be tested?*

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| | | | |

## Dependencies

*What does this depend on?*

---

## Approval History

| Approver | Date | Decision | Notes |
|----------|------|----------|-------|
"@

    # Clean up empty lines from parent fields
    $content = $content -replace "(?m)^\s*$\n(?=\s*$)", ""

    $content | Out-File -FilePath $filepath -Encoding utf8

    Update-Counter

    Write-Host "Created plan: $counter" -ForegroundColor Green
    Write-Host "  File: $filepath"
    Write-Host "  Status: draft"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Edit $filepath to fill in details"
    Write-Host "  2. Run 'ctoc plan propose $counter' when ready for review"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Move Plan Between Status Folders
# ═══════════════════════════════════════════════════════════════════════════════

function Move-Plan {
    param(
        [string]$PlanId,
        [string]$NewStatus
    )

    # Validate status
    if ($StatusFolders -notcontains $NewStatus) {
        Write-Host "Invalid status: $NewStatus" -ForegroundColor Red
        Write-Host "Valid statuses: $($StatusFolders -join ', ')"
        exit 1
    }

    # Find current plan location
    $planFile = Find-Plan -Id $PlanId

    if (-not $planFile) {
        Write-Host "Plan not found: $PlanId" -ForegroundColor Red
        exit 1
    }

    $currentStatus = Get-PlanStatus -FilePath $planFile

    if ($currentStatus -eq $NewStatus) {
        Write-Host "Plan $PlanId is already in $NewStatus"
        return
    }

    # Move to new folder
    $filename = Split-Path -Leaf $planFile
    $newPath = Join-Path $PlansDir $NewStatus $filename

    Move-Item -Path $planFile -Destination $newPath -Force

    Write-Host "Plan $PlanId: $currentStatus -> $NewStatus" -ForegroundColor Green
    Write-Host "  File: $newPath"

    # Handle status-specific actions
    switch ($NewStatus) {
        "approved" {
            Write-Host ""
            Write-Host "Plan approved! Next steps:"
            Write-Host "  - Run 'ctoc plan implement $PlanId' to create implementation plan"
            Write-Host "  - Or run 'ctoc plan start $PlanId' to begin work directly"
        }
        "in_progress" {
            $branchName = "plan-$PlanId"
            Write-Host ""
            Write-Host "Suggested branch: $branchName"
            # Update frontmatter with branch
            $content = Get-Content $newPath -Raw
            $content = $content -replace "branch:\s*null", "branch: $branchName"
            $content | Out-File -FilePath $newPath -Encoding utf8
        }
        "implemented" {
            Write-Host ""
            Write-Host "Plan completed!"
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Plan Lifecycle Commands
# ═══════════════════════════════════════════════════════════════════════════════

function Submit-Plan {
    param([string]$PlanId)

    Move-Plan -PlanId $PlanId -NewStatus "proposed"
    Write-Host ""
    Write-Host "Plan submitted for review."
}

function Approve-Plan {
    param(
        [string]$PlanId,
        [string]$Approver = ""
    )

    if (-not $Approver) {
        $Approver = $env:USERNAME
    }

    $planFile = Find-Plan -Id $PlanId

    if (-not $planFile) {
        Write-Host "Plan not found: $PlanId" -ForegroundColor Red
        exit 1
    }

    $date = Get-Date -Format "yyyy-MM-dd"

    # Add approval to history table
    $content = Get-Content $planFile -Raw
    $approvalLine = "| $Approver | $date | Approved | |"
    $content = $content -replace "(\| Approver \| Date \| Decision \| Notes \|[\r\n]+\|[-\s|]+\|)", "`$1`n$approvalLine"
    $content | Out-File -FilePath $planFile -Encoding utf8

    Move-Plan -PlanId $PlanId -NewStatus "approved"
}

function Start-Plan {
    param([string]$PlanId)

    Move-Plan -PlanId $PlanId -NewStatus "in_progress"
}

function Complete-Plan {
    param([string]$PlanId)

    Move-Plan -PlanId $PlanId -NewStatus "implemented"
}

function Set-Superseded {
    param(
        [string]$PlanId,
        [string]$Reason = "Superseded by newer plan"
    )

    $planFile = Find-Plan -Id $PlanId

    if ($planFile) {
        # Add superseded note
        $date = Get-Date -Format "yyyy-MM-dd"
        $note = @"

## Superseded

**Date:** $date
**Reason:** $Reason
"@
        Add-Content -Path $planFile -Value $note
    }

    Move-Plan -PlanId $PlanId -NewStatus "superseded"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create Implementation Plan
# ═══════════════════════════════════════════════════════════════════════════════

function New-ImplementationPlan {
    param([string]$ParentId)

    $parentFile = Find-Plan -Id $ParentId

    if (-not $parentFile) {
        Write-Host "Parent plan not found: $ParentId" -ForegroundColor Red
        exit 1
    }

    $parentContent = Get-Content $parentFile -Raw
    if ($parentContent -match 'title:\s*"([^"]+)"') {
        $parentTitle = $Matches[1]
    } else {
        $parentTitle = "Unknown"
    }

    Write-Host "Creating implementation plan for: $parentTitle"
    New-Plan -Title "impl-$parentTitle" -Type "implementation" -ParentId $ParentId
}

# ═══════════════════════════════════════════════════════════════════════════════
#  List Plans
# ═══════════════════════════════════════════════════════════════════════════════

function Get-Plans {
    param([string]$Filter = "all")

    Initialize-Plans

    Write-Host "CTOC Plans" -ForegroundColor Cyan
    Write-Host "════════════════════════════════════════════════════════════════════"
    Write-Host ""

    if ($Filter -eq "all") {
        foreach ($status in $StatusFolders) {
            Show-StatusFolder -Status $status
        }
    } else {
        Show-StatusFolder -Status $Filter
    }
}

function Show-StatusFolder {
    param([string]$Status)

    $folder = Join-Path $PlansDir $Status

    if (-not (Test-Path $folder)) {
        return
    }

    $files = Get-ChildItem -Path $folder -Filter "*.md" -ErrorAction SilentlyContinue | Sort-Object Name

    if (-not $files -or $files.Count -eq 0) {
        return
    }

    # Status color
    $statusColor = switch ($Status) {
        "draft" { "Yellow" }
        "proposed" { "Blue" }
        "approved" { "Green" }
        "in_progress" { "Cyan" }
        "implemented" { "Green" }
        "superseded" { "Red" }
        default { "White" }
    }

    Write-Host "[$Status]" -ForegroundColor $statusColor

    foreach ($file in $files) {
        $filename = $file.BaseName
        $id = $filename.Split('-')[0]

        $content = Get-Content $file.FullName -Raw
        if ($content -match 'title:\s*"([^"]+)"') {
            $title = $Matches[1]
        } else {
            $title = $filename
        }

        if ($content -match 'type:\s*(\w+)') {
            $planType = $Matches[1]
        } else {
            $planType = "functional"
        }

        $typeBadge = ""
        if ($planType -eq "implementation") {
            $typeBadge = " [impl]"
        }

        $titleDisplay = if ($title.Length -gt 53) { $title.Substring(0, 53) } else { $title }
        Write-Host ("  {0}  {1,-55}{2}" -f $id, $titleDisplay, $typeBadge)
    }

    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Plan Status Dashboard
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Dashboard {
    Initialize-Plans

    Write-Host @"
╔══════════════════════════════════════════════════════════════════╗
║                      CTOC Plan Dashboard                         ║
╚══════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

    # Count by status
    Write-Host "Plan Statistics:"
    Write-Host ""

    $total = 0
    foreach ($status in $StatusFolders) {
        $folder = Join-Path $PlansDir $status
        if (Test-Path $folder) {
            $count = (Get-ChildItem -Path $folder -Filter "*.md" -ErrorAction SilentlyContinue | Measure-Object).Count
        } else {
            $count = 0
        }

        $statusColor = switch ($status) {
            "draft" { "Yellow" }
            "proposed" { "Blue" }
            "approved" { "Green" }
            "in_progress" { "Cyan" }
            "implemented" { "Green" }
            "superseded" { "Red" }
            default { "White" }
        }

        Write-Host ("  {0,-14} " -f "${status}:") -NoNewline
        Write-Host $count -ForegroundColor $statusColor
        $total += $count
    }

    Write-Host "  ──────────────────"
    Write-Host ("  {0,-14} {1}" -f "Total:", $total)
    Write-Host ""

    # Show active plans
    $inProgressFolder = Join-Path $PlansDir "in_progress"
    if (Test-Path $inProgressFolder) {
        $inProgressCount = (Get-ChildItem -Path $inProgressFolder -Filter "*.md" -ErrorAction SilentlyContinue | Measure-Object).Count
        if ($inProgressCount -gt 0) {
            Write-Host "Active Plans:" -ForegroundColor Cyan
            Show-StatusFolder -Status "in_progress"
        }
    }

    # Show ready plans
    $approvedFolder = Join-Path $PlansDir "approved"
    if (Test-Path $approvedFolder) {
        $approvedCount = (Get-ChildItem -Path $approvedFolder -Filter "*.md" -ErrorAction SilentlyContinue | Measure-Object).Count
        if ($approvedCount -gt 0) {
            Write-Host "Ready to Start:" -ForegroundColor Green
            Show-StatusFolder -Status "approved"
        }
    }

    # Show pending review
    $proposedFolder = Join-Path $PlansDir "proposed"
    if (Test-Path $proposedFolder) {
        $proposedCount = (Get-ChildItem -Path $proposedFolder -Filter "*.md" -ErrorAction SilentlyContinue | Measure-Object).Count
        if ($proposedCount -gt 0) {
            Write-Host "Pending Review:" -ForegroundColor Blue
            Show-StatusFolder -Status "proposed"
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Plan Details
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Plan {
    param([string]$PlanId)

    $planFile = Find-Plan -Id $PlanId

    if (-not $planFile) {
        Write-Host "Plan not found: $PlanId" -ForegroundColor Red
        exit 1
    }

    $status = Get-PlanStatus -FilePath $planFile

    Write-Host "Plan $PlanId" -ForegroundColor Cyan -NoNewline
    Write-Host " [$status]"
    Write-Host "File: $planFile"
    Write-Host "════════════════════════════════════════════════════════════════════"
    Write-Host ""
    Get-Content $planFile
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Help
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Help {
    @"
CTOC Plan Management

Plans are organized by status folders. Moving between statuses = moving files.
Naming: {4-digit-counter}-{slug}.md (e.g., 0052-landing-page-login-button.md)

USAGE:
    ctoc plan <command> [options]

COMMANDS:
    new <title>           Create a new plan (starts in draft/)
    propose <id>          Submit for review (draft/ -> proposed/)
    approve <id>          Approve plan (proposed/ -> approved/)
    start <id>            Begin work (approved/ -> in_progress/)
    complete <id>         Mark done (in_progress/ -> implemented/)
    supersede <id>        Replace with newer (any -> superseded/)
    implement <id>        Create implementation plan from functional plan
    move <id> <status>    Move plan to any status folder
    list [status]         List plans (or filter by status)
    status                Show dashboard
    show <id>             Show plan details

PLAN LIFECYCLE:
    draft/ -> proposed/ -> approved/ -> in_progress/ -> implemented/
                                              |
                                        superseded/

FOLDER STRUCTURE:
    .ctoc/plans/
    |-- draft/              New plans start here
    |-- proposed/           Awaiting review
    |-- approved/           Ready to implement
    |-- in_progress/        Currently being worked on
    |-- implemented/        Completed
    +-- superseded/         Replaced by newer plans

EXAMPLES:
    ctoc plan new "Landing page login button"
    ctoc plan propose 52
    ctoc plan approve 52
    ctoc plan start 52
    ctoc plan complete 52
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
        $type = if ($Arg2) { $Arg2 } else { "functional" }
        $parent = if ($Arg3) { $Arg3 } else { "" }
        New-Plan -Title $Arg1 -Type $type -ParentId $parent
    }
    "propose" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan propose <plan-id>"
            exit 1
        }
        Submit-Plan -PlanId $Arg1
    }
    "approve" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan approve <plan-id>"
            exit 1
        }
        Approve-Plan -PlanId $Arg1 -Approver $Arg2
    }
    "start" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan start <plan-id>"
            exit 1
        }
        Start-Plan -PlanId $Arg1
    }
    "complete" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan complete <plan-id>"
            exit 1
        }
        Complete-Plan -PlanId $Arg1
    }
    "supersede" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan supersede <plan-id> [reason]"
            exit 1
        }
        $reason = if ($Arg2) { $Arg2 } else { "Superseded by newer plan" }
        Set-Superseded -PlanId $Arg1 -Reason $reason
    }
    "implement" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan implement <parent-plan-id>"
            exit 1
        }
        New-ImplementationPlan -ParentId $Arg1
    }
    { $_ -in "move", "transition" } {
        if ([string]::IsNullOrEmpty($Arg1) -or [string]::IsNullOrEmpty($Arg2)) {
            Write-Host "Usage: ctoc plan move <plan-id> <status>"
            Write-Host "Statuses: $($StatusFolders -join ', ')"
            exit 1
        }
        Move-Plan -PlanId $Arg1 -NewStatus $Arg2
    }
    "list" {
        $filter = if ($Arg1) { $Arg1 } else { "all" }
        Get-Plans -Filter $filter
    }
    "status" {
        Show-Dashboard
    }
    "show" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan show <plan-id>"
            exit 1
        }
        Show-Plan -PlanId $Arg1
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
