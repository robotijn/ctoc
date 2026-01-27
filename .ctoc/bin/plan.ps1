# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Plan Lifecycle Management (PowerShell) v1.3.0
#
#  Folder-based lifecycle with Iron Loop injection:
#    functional/draft → functional/approved → implementation/draft →
#    implementation/approved → todo (Iron Loop injected) → in_progress →
#    review → done
#
#  Naming: YYYY-MM-DD-NNN-module-feature.md
#  Concurrency: Git push is the atomic operation (no local locks)
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

# Plan directories - ROOT level (git tracked)
$PlansDir = "plans"
$SettingsFile = ".ctoc\settings.yaml"
$CounterFile = ".ctoc\counter"

# Status folders - the lifecycle stages
$LifecycleFolders = @(
    "functional\draft",
    "functional\approved",
    "implementation\draft",
    "implementation\approved",
    "todo",
    "in_progress",
    "review",
    "done"
)

# ═══════════════════════════════════════════════════════════════════════════════
#  Initialize Plans Directory
# ═══════════════════════════════════════════════════════════════════════════════

function Initialize-Plans {
    foreach ($folder in $LifecycleFolders) {
        $path = Join-Path $PlansDir $folder
        if (-not (Test-Path $path)) {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }
    }

    # Ensure counter file exists
    if (-not (Test-Path $CounterFile)) {
        $ctocDir = Split-Path $CounterFile -Parent
        if (-not (Test-Path $ctocDir)) {
            New-Item -ItemType Directory -Path $ctocDir -Force | Out-Null
        }
        $tz = "UTC"
        if (Test-Path $SettingsFile) {
            $content = Get-Content $SettingsFile -Raw
            if ($content -match 'timezone:\s*"?([^"\r\n]+)"?') {
                $tz = $Matches[1].Trim()
            }
        }
        $today = Get-Date -Format "yyyy-MM-dd"
        "${today}:0:${tz}" | Out-File -FilePath $CounterFile -Encoding utf8
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Get Next Plan ID (YYYY-MM-DD-NNN format)
# ═══════════════════════════════════════════════════════════════════════════════

function Get-NextId {
    $tz = "UTC"
    if (Test-Path $SettingsFile) {
        $content = Get-Content $SettingsFile -Raw
        if ($content -match 'timezone:\s*"?([^"\r\n]+)"?') {
            $tz = $Matches[1].Trim()
        }
    }

    $today = Get-Date -Format "yyyy-MM-dd"

    # Read counter: "YYYY-MM-DD:N:timezone"
    $counterDate = ""
    $counterNum = 0

    if (Test-Path $CounterFile) {
        $counterContent = Get-Content $CounterFile -Raw
        $parts = $counterContent.Trim().Split(':')
        if ($parts.Count -ge 2) {
            $counterDate = $parts[0]
            $counterNum = [int]$parts[1]
        }
    }

    # Reset counter if new day
    if ($counterDate -ne $today) {
        $counterNum = 0
    }

    # Increment
    $counterNum++

    # Save counter
    "${today}:${counterNum}:${tz}" | Out-File -FilePath $CounterFile -Encoding utf8

    # Return formatted ID
    return "{0}-{1:D3}" -f $today, $counterNum
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create Slug from Title
# ═══════════════════════════════════════════════════════════════════════════════

function New-Slug {
    param([string]$Title)

    # Replace spaces with underscores, lowercase, remove special chars, limit length
    $slug = $Title.ToLower() -replace '\s+', '_' -replace '[^a-z0-9_-]', ''
    if ($slug.Length -gt 40) {
        $slug = $slug.Substring(0, 40)
    }
    return $slug
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Find Plan by ID (prefix match)
# ═══════════════════════════════════════════════════════════════════════════════

function Find-Plan {
    param([string]$Id)

    # Search in all lifecycle folders
    foreach ($folder in $LifecycleFolders) {
        $path = Join-Path $PlansDir $folder
        if (Test-Path $path) {
            $found = Get-ChildItem -Path $path -Filter "$Id*.md" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) {
                return $found.FullName
            }
        }
    }

    return $null
}

function Get-PlanStage {
    param([string]$FilePath)

    # Extract stage from path (e.g., "plans\functional\draft\..." → "functional\draft")
    $relPath = $FilePath.Replace("$PlansDir\", "").Replace("$PlansDir/", "")
    $parts = $relPath.Split([IO.Path]::DirectorySeparatorChar)
    if ($parts.Count -ge 2) {
        return "$($parts[0])\$($parts[1])"
    } elseif ($parts.Count -eq 1) {
        return $parts[0].Replace([IO.Path]::DirectorySeparatorChar.ToString() + (Split-Path $relPath -Leaf), "")
    }
    return Split-Path (Split-Path $FilePath -Parent) -Leaf
}

function Get-StageColor {
    param([string]$Stage)

    switch -Wildcard ($Stage) {
        "functional\draft" { return "Yellow" }
        "functional\approved" { return "Green" }
        "implementation\draft" { return "Blue" }
        "implementation\approved" { return "Cyan" }
        "todo" { return "Cyan" }
        "in_progress" { return "Yellow" }
        "review" { return "Blue" }
        "done" { return "Green" }
        default { return "White" }
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Create New Plan
# ═══════════════════════════════════════════════════════════════════════════════

function New-Plan {
    param(
        [string]$Title,
        [string]$Module = "general"
    )

    Initialize-Plans

    $id = Get-NextId
    $slug = New-Slug -Title "$Module-$Title"
    $filename = "$id-$slug.md"
    $filepath = Join-Path $PlansDir "functional\draft" $filename

    $date = Get-Date -Format "yyyy-MM-dd"
    $author = $env:USERNAME

    $content = @"
---
id: $id
title: "$Title"
module: $Module
type: functional
created: $date
author: $author
depends_on: []
approvers: []
---

# $Title

## Summary

*Brief description of what this feature achieves*

## Business Value

*Why should we build this? What problem does it solve?*

## User Story

As a [user type], I want to [action], so that [benefit].

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Out of Scope

*What this feature will NOT include*

## Dependencies

*What must be completed before this can start?*

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| | | | |

---

## Approval History

| Approver | Date | Decision | Notes |
|----------|------|----------|-------|
"@

    $content | Out-File -FilePath $filepath -Encoding utf8

    Write-Host "Created plan: $id" -ForegroundColor Green
    Write-Host "  File: $filepath"
    Write-Host "  Stage: functional\draft"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Edit $filepath to fill in details"
    Write-Host "  2. Run 'ctoc plan propose $id' when ready for review"
    Write-Host ""
    Write-Host "Tip: After finalizing the plan, consider running '/clear' to" -ForegroundColor Cyan
    Write-Host "     clear context before starting implementation."
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Move Plan Between Stages
# ═══════════════════════════════════════════════════════════════════════════════

function Move-Plan {
    param(
        [string]$PlanId,
        [string]$NewStage
    )

    # Validate stage
    $valid = $false
    foreach ($stage in $LifecycleFolders) {
        if ($stage -eq $NewStage -or $stage -eq $NewStage.Replace("/", "\")) {
            $valid = $true
            $NewStage = $stage
            break
        }
    }

    if (-not $valid) {
        Write-Host "Invalid stage: $NewStage" -ForegroundColor Red
        Write-Host "Valid stages: $($LifecycleFolders -join ', ')"
        exit 1
    }

    # Find current plan location
    $planFile = Find-Plan -Id $PlanId

    if (-not $planFile) {
        Write-Host "Plan not found: $PlanId" -ForegroundColor Red
        exit 1
    }

    $currentStage = Get-PlanStage -FilePath $planFile

    if ($currentStage -eq $NewStage) {
        Write-Host "Plan $PlanId is already in $NewStage"
        return
    }

    # Check dependencies before moving to todo
    if ($NewStage -eq "todo") {
        Test-Dependencies -PlanFile $planFile
    }

    # Move to new folder
    $filename = Split-Path $planFile -Leaf
    $newPath = Join-Path $PlansDir $NewStage $filename

    Move-Item -Path $planFile -Destination $newPath -Force

    $color = Get-StageColor -Stage $NewStage
    Write-Host "Plan $PlanId: $currentStage -> " -NoNewline
    Write-Host $NewStage -ForegroundColor $color
    Write-Host "  File: $newPath"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Check Dependencies
# ═══════════════════════════════════════════════════════════════════════════════

function Test-Dependencies {
    param([string]$PlanFile)

    $content = Get-Content $PlanFile -Raw

    # Extract depends_on from frontmatter
    if ($content -match 'depends_on:\s*\[([^\]]*)\]') {
        $depsRaw = $Matches[1]
        if ([string]::IsNullOrWhiteSpace($depsRaw)) {
            return
        }

        $deps = $depsRaw -replace '"', '' -replace "'", '' -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }

        $blocked = $false
        foreach ($dep in $deps) {
            # Check if dependency is in done/
            $doneFolder = Join-Path $PlansDir "done"
            $found = Get-ChildItem -Path $doneFolder -Filter "$dep*.md" -ErrorAction SilentlyContinue | Select-Object -First 1
            if (-not $found) {
                Write-Host "Blocked: Dependency '$dep' is not in done/" -ForegroundColor Red
                $blocked = $true
            }
        }

        if ($blocked) {
            Write-Host ""
            Write-Host "Complete all dependencies before moving to todo."
            exit 1
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Plan Lifecycle Commands
# ═══════════════════════════════════════════════════════════════════════════════

function Submit-Plan {
    param([string]$PlanId)

    $planFile = Find-Plan -Id $PlanId
    $currentStage = Get-PlanStage -FilePath $planFile

    switch -Wildcard ($currentStage) {
        "functional\draft" {
            Move-Plan -PlanId $PlanId -NewStage "functional\approved"
            Write-Host ""
            Write-Host "Functional plan submitted for business approval."
        }
        "implementation\draft" {
            Move-Plan -PlanId $PlanId -NewStage "implementation\approved"
            Write-Host ""
            Write-Host "Implementation plan submitted for technical approval."
        }
        default {
            Write-Host "Cannot propose from stage: $currentStage" -ForegroundColor Red
            Write-Host "Only plans in draft stages can be proposed."
            exit 1
        }
    }
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

    $currentStage = Get-PlanStage -FilePath $planFile
    $date = Get-Date -Format "yyyy-MM-dd"

    # Add approval to history table
    $content = Get-Content $planFile -Raw
    $approvalLine = "| $Approver | $date | Approved | |"
    $content = $content -replace "(\| Approver \| Date \| Decision \| Notes \|[\r\n]+\|[-\s|]+\|)", "`$1`r`n$approvalLine"
    $content | Out-File -FilePath $planFile -Encoding utf8

    switch -Wildcard ($currentStage) {
        "functional\approved" {
            Write-Host "Functional plan approved!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Next: Run 'ctoc plan implement $PlanId' to create technical implementation plan."
        }
        "implementation\approved" {
            Write-Host "Implementation plan approved!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Next: Run 'ctoc plan start $PlanId' to inject Iron Loop and move to todo."
        }
        default {
            Write-Host "Plan approved in stage: $currentStage"
        }
    }
}

function Start-Plan {
    param([string]$PlanId)

    $planFile = Find-Plan -Id $PlanId

    if (-not $planFile) {
        Write-Host "Plan not found: $PlanId" -ForegroundColor Red
        exit 1
    }

    $currentStage = Get-PlanStage -FilePath $planFile

    if ($currentStage -notlike "*implementation\approved*" -and $currentStage -ne "implementation/approved") {
        Write-Host "Can only start plans from implementation\approved" -ForegroundColor Red
        Write-Host "Current stage: $currentStage"
        exit 1
    }

    # Inject Iron Loop steps 7-15
    Add-IronLoop -PlanFile $planFile

    # Move to todo
    Move-Plan -PlanId $PlanId -NewStage "todo"

    Write-Host ""
    Write-Host "Iron Loop steps 7-15 injected!" -ForegroundColor Cyan
    Write-Host "Plan is now ready for execution in todo/"
    Write-Host ""
    Write-Host "Next: Run 'ctoc plan claim $PlanId' to start working on it."
}

function Invoke-ClaimPlan {
    param([string]$PlanId)

    $planFile = Find-Plan -Id $PlanId

    if (-not $planFile) {
        Write-Host "Plan not found: $PlanId" -ForegroundColor Red
        exit 1
    }

    $currentStage = Get-PlanStage -FilePath $planFile

    if ($currentStage -ne "todo") {
        Write-Host "Can only claim plans from todo/" -ForegroundColor Red
        Write-Host "Current stage: $currentStage"
        exit 1
    }

    # Git-based atomic claim
    Write-Host "Claiming plan $PlanId..."

    # 1. Pull latest
    try {
        git pull --rebase 2>$null
    } catch {
        Write-Host "Warning: Could not pull latest changes" -ForegroundColor Yellow
    }

    # 2. Check if still in todo/
    $planFile = Find-Plan -Id $PlanId
    $currentStage = Get-PlanStage -FilePath $planFile

    if ($currentStage -ne "todo") {
        Write-Host "Plan already claimed by someone else!" -ForegroundColor Red
        exit 1
    }

    # 3. Move to in_progress
    $filename = Split-Path $planFile -Leaf
    $newPath = Join-Path $PlansDir "in_progress" $filename

    try {
        git mv $planFile $newPath 2>$null
    } catch {
        Move-Item -Path $planFile -Destination $newPath -Force
    }

    # 4. Commit
    try {
        git add $newPath 2>$null
        git commit -m "claim: $PlanId" 2>$null
    } catch {
        # Ignore commit errors
    }

    # 5. Push (atomic moment)
    $pushResult = git push 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Plan claimed successfully!" -ForegroundColor Green
        Write-Host "  File: $newPath"
        Write-Host ""
        Write-Host "You now own this plan. Work through the Iron Loop steps."
        Write-Host "When done, run 'ctoc plan complete $PlanId'"
    } else {
        Write-Host "Push failed - someone else may have claimed it" -ForegroundColor Red
        # Reset
        try {
            git reset --hard HEAD~1 2>$null
            git pull --rebase 2>$null
        } catch {}
        Write-Host ""
        Write-Host "Try claiming a different plan, or check 'ctoc plan list todo'"
        exit 1
    }
}

function Complete-Plan {
    param([string]$PlanId)

    Move-Plan -PlanId $PlanId -NewStage "review"
    Write-Host ""
    Write-Host "Plan moved to review/"
    Write-Host "Awaiting business review. Run 'ctoc plan accept $PlanId' when approved."
}

function Accept-Plan {
    param([string]$PlanId)

    Move-Plan -PlanId $PlanId -NewStage "done"
    Write-Host ""
    Write-Host "Plan completed!" -ForegroundColor Green
}

function Reject-Plan {
    param(
        [string]$PlanId,
        [string]$Reason = "Needs revision"
    )

    $planFile = Find-Plan -Id $PlanId

    if ($planFile) {
        # Add rejection note
        $date = Get-Date -Format "yyyy-MM-dd"
        $note = @"

## Rejection Feedback

**Date:** $date
**Reason:** $Reason
"@
        Add-Content -Path $planFile -Value $note
    }

    Move-Plan -PlanId $PlanId -NewStage "functional\draft"
    Write-Host ""
    Write-Host "Plan returned to functional\draft for revision."
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

    $parentStage = Get-PlanStage -FilePath $parentFile

    if ($parentStage -notlike "*functional\approved*" -and $parentStage -ne "functional/approved") {
        Write-Host "Can only create implementation plans from functional\approved" -ForegroundColor Red
        Write-Host "Current stage: $parentStage"
        exit 1
    }

    $parentContent = Get-Content $parentFile -Raw
    $parentTitle = "Unknown"
    $parentModule = "general"

    if ($parentContent -match 'title:\s*"([^"]+)"') {
        $parentTitle = $Matches[1]
    }
    if ($parentContent -match 'module:\s*(\S+)') {
        $parentModule = $Matches[1]
    }

    Initialize-Plans

    $id = Get-NextId
    $slug = New-Slug -Title "$parentModule-impl-$parentTitle"
    $filename = "$id-$slug.md"
    $filepath = Join-Path $PlansDir "implementation\draft" $filename

    $date = Get-Date -Format "yyyy-MM-dd"
    $author = $env:USERNAME

    $content = @"
---
id: $id
title: "Implementation: $parentTitle"
module: $parentModule
type: implementation
parent_id: $ParentId
created: $date
author: $author
depends_on: []
approvers: []
---

# Implementation: $parentTitle

## Parent Plan

- ID: $ParentId
- Title: $parentTitle
- File: $parentFile

## Technical Summary

*Brief description of the technical approach*

## Architecture

*High-level architecture decisions*

### Components Affected

- [ ] Component 1
- [ ] Component 2

### Data Model Changes

*Database/schema changes if any*

### API Changes

*API changes if any*

## Implementation Steps

### Phase 1: Foundation
1. Step 1
2. Step 2

### Phase 2: Core Logic
1. Step 1
2. Step 2

### Phase 3: Integration
1. Step 1
2. Step 2

## Testing Strategy

### Unit Tests
- [ ] Test case 1
- [ ] Test case 2

### Integration Tests
- [ ] Test case 1

### E2E Tests
- [ ] Test case 1

## Rollback Plan

*How to rollback if something goes wrong*

## Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| | | | |

---

## Approval History

| Approver | Date | Decision | Notes |
|----------|------|----------|-------|
"@

    $content | Out-File -FilePath $filepath -Encoding utf8

    Write-Host "Created implementation plan: $id" -ForegroundColor Green
    Write-Host "  File: $filepath"
    Write-Host "  Parent: $ParentId"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Edit $filepath with technical details"
    Write-Host "  2. Run 'ctoc plan propose $id' when ready for technical review"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Inject Iron Loop (Steps 7-15)
# ═══════════════════════════════════════════════════════════════════════════════

function Add-IronLoop {
    param([string]$PlanFile)

    Write-Host "Injecting Iron Loop steps 7-15..."

    $content = Get-Content $PlanFile -Raw
    $id = "unknown"
    if ($content -match 'id:\s*(\S+)') {
        $id = $Matches[1]
    }

    $ironLoop = @"

---

## Iron Loop Execution (Steps 7-15)

> This section was auto-injected when the plan moved to todo/.
> Work through each step in order. Check off items as you complete them.

### Step 7: TEST (Write Tests First)

*Write tests before implementation. TDD ensures we build the right thing.*

- [ ] Write unit tests for core functionality
- [ ] Write integration tests for component interactions
- [ ] Write E2E tests for critical user flows
- [ ] Ensure tests fail (proving they test something)

### Step 8: QUALITY (Run Quality Gates)

*All quality checks must pass before proceeding.*

- [ ] Run linters and fix all issues
- [ ] Run formatters
- [ ] Run type checkers (if applicable)
- [ ] Address all warnings (not just errors)

### Step 9: IMPLEMENT (Write Code)

*Implement until all tests pass.*

- [ ] Write minimal code to pass tests
- [ ] Follow existing patterns in codebase
- [ ] No shortcuts on error handling
- [ ] Refactor as needed (tests protect you)

### Step 10: REVIEW (Self-Review as CTO)

*Review your own code with senior engineer standards.*

- [ ] Code is readable and self-documenting
- [ ] No unnecessary complexity
- [ ] Error handling is comprehensive
- [ ] Edge cases are handled
- [ ] No hardcoded values that should be configurable

### Step 11: OPTIMIZE (Performance)

*Only optimize what needs optimizing.*

- [ ] Profile if performance-sensitive
- [ ] Check for N+1 queries
- [ ] Verify no memory leaks
- [ ] Check bundle size (if frontend)
- [ ] Document performance characteristics

### Step 12: SECURE (Security Validation)

*Security is non-negotiable.*

- [ ] No secrets in code
- [ ] Input validation complete
- [ ] Auth/authz properly checked
- [ ] SQL injection prevention
- [ ] XSS prevention (if applicable)
- [ ] CSRF protection (if applicable)
- [ ] Check OWASP top 10

### Step 13: DOCUMENT (Update Docs)

*If it's not documented, it doesn't exist.*

- [ ] Update API documentation
- [ ] Add inline comments where non-obvious
- [ ] Update README if needed
- [ ] Update CHANGELOG
- [ ] Document breaking changes

### Step 14: VERIFY (Final Validation)

*The final gate before shipping.*

- [ ] All tests pass
- [ ] All linters pass
- [ ] Manual testing complete
- [ ] Acceptance criteria from plan verified
- [ ] Demo to stakeholder (if applicable)

### Step 15: COMMIT (Ship It)

*Ship with confidence.*

- [ ] Commit with descriptive message
- [ ] Link to plan ID in commit: "implements $id"
- [ ] PR created (if workflow requires)
- [ ] CI/CD passes
- [ ] Ready for review stage
"@

    Add-Content -Path $PlanFile -Value $ironLoop -Encoding utf8
    Write-Host "Iron Loop injected." -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Abandon Plan (Release from in_progress)
# ═══════════════════════════════════════════════════════════════════════════════

function Invoke-AbandonPlan {
    param([string]$PlanId)

    $planFile = Find-Plan -Id $PlanId

    if (-not $planFile) {
        Write-Host "Plan not found: $PlanId" -ForegroundColor Red
        exit 1
    }

    $currentStage = Get-PlanStage -FilePath $planFile

    if ($currentStage -ne "in_progress") {
        Write-Host "Plan is not in in_progress/"
        exit 1
    }

    Move-Plan -PlanId $PlanId -NewStage "todo"

    # Commit and push (so others can claim)
    try {
        git add $PlansDir 2>$null
        git commit -m "abandon: $PlanId (returning to todo)" 2>$null
        git push 2>$null
    } catch {}

    Write-Host ""
    Write-Host "Plan returned to todo/ and is available for others to claim."
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
        foreach ($stage in $LifecycleFolders) {
            Show-StageFolder -Stage $stage
        }
    } else {
        Show-StageFolder -Stage $Filter
    }
}

function Show-StageFolder {
    param([string]$Stage)

    $folder = Join-Path $PlansDir $Stage

    if (-not (Test-Path $folder)) {
        return
    }

    $files = Get-ChildItem -Path $folder -Filter "*.md" -ErrorAction SilentlyContinue | Sort-Object Name

    if (-not $files -or $files.Count -eq 0) {
        return
    }

    $color = Get-StageColor -Stage $Stage
    Write-Host "[$Stage]" -ForegroundColor $color

    foreach ($file in $files) {
        $filename = $file.BaseName
        $parts = $filename.Split('-')
        $id = "$($parts[0])-$($parts[1])-$($parts[2])-$($parts[3])"  # YYYY-MM-DD-NNN

        $content = Get-Content $file.FullName -Raw
        $title = $filename
        if ($content -match 'title:\s*"([^"]+)"') {
            $title = $Matches[1]
        }

        $planType = "functional"
        if ($content -match 'type:\s*(\w+)') {
            $planType = $Matches[1]
        }

        $typeBadge = ""
        if ($planType -eq "implementation") {
            $typeBadge = " [impl]"
        }

        $titleDisplay = if ($title.Length -gt 48) { $title.Substring(0, 48) } else { $title }
        Write-Host ("  {0}  {1,-50}{2}" -f $id, $titleDisplay, $typeBadge)
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

    # Count by stage
    Write-Host "Plan Statistics:"
    Write-Host ""

    $total = 0
    foreach ($stage in $LifecycleFolders) {
        $folder = Join-Path $PlansDir $stage
        $count = 0
        if (Test-Path $folder) {
            $count = (Get-ChildItem -Path $folder -Filter "*.md" -ErrorAction SilentlyContinue | Measure-Object).Count
        }

        $color = Get-StageColor -Stage $stage
        Write-Host ("  {0,-25} " -f "${stage}:") -NoNewline
        Write-Host $count -ForegroundColor $color
        $total += $count
    }

    Write-Host "  ─────────────────────────────"
    Write-Host ("  {0,-25} {1}" -f "Total:", $total)
    Write-Host ""

    # Show active plans
    $inProgressFolder = Join-Path $PlansDir "in_progress"
    if (Test-Path $inProgressFolder) {
        $inProgressCount = (Get-ChildItem -Path $inProgressFolder -Filter "*.md" -ErrorAction SilentlyContinue | Measure-Object).Count
        if ($inProgressCount -gt 0) {
            Write-Host "Active Plans (in_progress):" -ForegroundColor Yellow
            Show-StageFolder -Stage "in_progress"
        }
    }

    # Show ready plans
    $todoFolder = Join-Path $PlansDir "todo"
    if (Test-Path $todoFolder) {
        $todoCount = (Get-ChildItem -Path $todoFolder -Filter "*.md" -ErrorAction SilentlyContinue | Measure-Object).Count
        if ($todoCount -gt 0) {
            Write-Host "Ready to Claim (todo):" -ForegroundColor Cyan
            Show-StageFolder -Stage "todo"
        }
    }

    # Show pending review
    $reviewFolder = Join-Path $PlansDir "review"
    if (Test-Path $reviewFolder) {
        $reviewCount = (Get-ChildItem -Path $reviewFolder -Filter "*.md" -ErrorAction SilentlyContinue | Measure-Object).Count
        if ($reviewCount -gt 0) {
            Write-Host "Pending Review:" -ForegroundColor Blue
            Show-StageFolder -Stage "review"
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

    $stage = Get-PlanStage -FilePath $planFile
    $color = Get-StageColor -Stage $stage

    Write-Host "Plan $PlanId" -ForegroundColor Cyan -NoNewline
    Write-Host " [" -NoNewline
    Write-Host $stage -ForegroundColor $color -NoNewline
    Write-Host "]"
    Write-Host "File: $planFile"
    Write-Host "════════════════════════════════════════════════════════════════════"
    Write-Host ""
    Get-Content $planFile
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Migration from Old Structure
# ═══════════════════════════════════════════════════════════════════════════════

function Invoke-Migrate {
    Write-Host "Checking for plans to migrate..."

    # Old structure: .ctoc\plans\{draft,proposed,approved,...}
    if (Test-Path ".ctoc\plans\draft") {
        Write-Host "Found old plan structure in .ctoc\plans\"
        Write-Host "Migrating to new structure (plans\)..."

        Initialize-Plans

        # Map old folders to new lifecycle stages
        $migrations = @{
            ".ctoc\plans\draft" = "functional\draft"
            ".ctoc\plans\proposed" = "functional\approved"
            ".ctoc\plans\approved" = "implementation\approved"
            ".ctoc\plans\in_progress" = "in_progress"
            ".ctoc\plans\implemented" = "done"
            ".ctoc\plans\superseded" = "done"
        }

        foreach ($old in $migrations.Keys) {
            if (Test-Path $old) {
                $new = Join-Path $PlansDir $migrations[$old]
                $files = Get-ChildItem -Path $old -Filter "*.md" -ErrorAction SilentlyContinue
                foreach ($file in $files) {
                    Move-Item -Path $file.FullName -Destination $new -Force -ErrorAction SilentlyContinue
                }
                Write-Host "  Moved $old -> $($migrations[$old])"
            }
        }

        # Clean up old structure
        Remove-Item -Path ".ctoc\plans" -Recurse -Force -ErrorAction SilentlyContinue

        Write-Host ""
        Write-Host "Migration complete!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Plans are now in $PlansDir\ (git-tracked)"
    } else {
        Write-Host "No old structure found. Nothing to migrate."
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Help
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Help {
    @"
CTOC Plan Management v1.3.0

Plans follow a lifecycle from idea to implementation to completion.
Naming: YYYY-MM-DD-NNN-module-feature.md

USAGE:
    ctoc plan <command> [options]

LIFECYCLE:
    functional\draft -> functional\approved -> implementation\draft ->
    implementation\approved -> todo (Iron Loop injected) -> in_progress ->
    review -> done

COMMANDS:
    new <title> [module]    Create new functional plan in functional\draft\
    propose <id>            Submit for approval (draft -> approved)
    approve <id>            Approve plan (for next stage)
    implement <id>          Create implementation plan from functional plan
    start <id>              Inject Iron Loop, move to todo\ (from impl\approved)
    claim <id>              Claim plan from todo\ (git-atomic)
    complete <id>           Move to review\ (from in_progress\)
    accept <id>             Accept and move to done\ (from review\)
    reject <id> [reason]    Return to functional\draft with feedback
    abandon <id>            Release plan back to todo\ (from in_progress\)
    move <id> <stage>       Move plan to any stage
    list [stage]            List plans (or filter by stage)
    status                  Show dashboard
    show <id>               Show plan details
    migrate                 Migrate from old .ctoc\plans structure

STAGES:
    functional\draft        New feature ideas being written
    functional\approved     Business-approved features
    implementation\draft    Technical design in progress
    implementation\approved Technical design approved
    todo                    Ready to work (Iron Loop injected)
    in_progress             Currently being worked on (claimed)
    review                  Awaiting final business review
    done                    Completed

CONCURRENCY:
    Multiple Claude instances can work on different plans safely.
    The 'claim' command uses git push as an atomic lock.
    If someone else claims a plan first, your push will fail.

EXAMPLES:
    ctoc plan new "User authentication" auth
    ctoc plan propose 2026-01-27-001
    ctoc plan approve 2026-01-27-001
    ctoc plan implement 2026-01-27-001
    ctoc plan start 2026-01-27-002
    ctoc plan claim 2026-01-27-002
    ctoc plan complete 2026-01-27-002
    ctoc plan accept 2026-01-27-002
    ctoc plan list todo
    ctoc plan status

"@
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

switch ($Command) {
    "new" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan new <title> [module]"
            exit 1
        }
        $module = if ($Arg2) { $Arg2 } else { "general" }
        New-Plan -Title $Arg1 -Module $module
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
    "implement" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan implement <parent-plan-id>"
            exit 1
        }
        New-ImplementationPlan -ParentId $Arg1
    }
    "start" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan start <plan-id>"
            exit 1
        }
        Start-Plan -PlanId $Arg1
    }
    "claim" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan claim <plan-id>"
            exit 1
        }
        Invoke-ClaimPlan -PlanId $Arg1
    }
    "complete" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan complete <plan-id>"
            exit 1
        }
        Complete-Plan -PlanId $Arg1
    }
    "accept" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan accept <plan-id>"
            exit 1
        }
        Accept-Plan -PlanId $Arg1
    }
    "reject" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan reject <plan-id> [reason]"
            exit 1
        }
        $reason = if ($Arg2) { $Arg2 } else { "Needs revision" }
        Reject-Plan -PlanId $Arg1 -Reason $reason
    }
    "abandon" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc plan abandon <plan-id>"
            exit 1
        }
        Invoke-AbandonPlan -PlanId $Arg1
    }
    { $_ -in "move", "transition" } {
        if ([string]::IsNullOrEmpty($Arg1) -or [string]::IsNullOrEmpty($Arg2)) {
            Write-Host "Usage: ctoc plan move <plan-id> <stage>"
            Write-Host "Stages: $($LifecycleFolders -join ', ')"
            exit 1
        }
        Move-Plan -PlanId $Arg1 -NewStage $Arg2
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
    "migrate" {
        Invoke-Migrate
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
