# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Hybrid File Locking System (PowerShell)
#  Optimistic locking + Git Rerere + Smart Conflict Recovery
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

# ═══════════════════════════════════════════════════════════════════════════════
#  Setup Git Rerere
# ═══════════════════════════════════════════════════════════════════════════════

function Initialize-Rerere {
    Write-Host "Setting up Git Rerere (Reuse Recorded Resolution)" -ForegroundColor Blue
    Write-Host "═══════════════════════════════════════"

    git config --global rerere.enabled true
    git config --global rerere.autoupdate true

    Write-Host "Git rerere enabled." -ForegroundColor Green
    Write-Host ""
    Write-Host "Rerere will automatically:"
    Write-Host "  - Record how you resolve conflicts"
    Write-Host "  - Replay those resolutions in future conflicts"
    Write-Host "  - Save you time on repeated merge/rebase operations"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Check File Freshness
# ═══════════════════════════════════════════════════════════════════════════════

function Test-FileFreshness {
    param([string]$File)

    if (-not (Test-Path $File)) {
        Write-Host "File not found: $File" -ForegroundColor Red
        return $false
    }

    # Check if in git repo
    try {
        git rev-parse --is-inside-work-tree 2>$null | Out-Null
    } catch {
        Write-Host "Not a git repository - skipping freshness check" -ForegroundColor Yellow
        return $true
    }

    $remote = git remote | Select-Object -First 1
    if (-not $remote) {
        return $true
    }

    $branch = git rev-parse --abbrev-ref HEAD
    git fetch $remote $branch --quiet 2>$null

    $localHash = git hash-object $File 2>$null
    $remoteHash = git show "$remote/${branch}:$File" 2>$null | git hash-object --stdin 2>$null

    # Check if file is tracked
    try {
        git ls-files --error-unmatch $File 2>$null | Out-Null
    } catch {
        Write-Host "${File}: Untracked (new file)" -ForegroundColor Green
        return $true
    }

    if (-not $remoteHash) {
        Write-Host "${File}: Not on remote (new to remote)" -ForegroundColor Green
        return $true
    }

    $committedHash = git show "HEAD:$File" 2>$null | git hash-object --stdin 2>$null

    if ($committedHash -eq $remoteHash) {
        if ($localHash -eq $committedHash) {
            Write-Host "${File}: Fresh (no changes)" -ForegroundColor Green
        } else {
            Write-Host "${File}: Local changes (safe to commit)" -ForegroundColor Blue
        }
        return $true
    } else {
        Write-Host "WARNING: $File has been modified on remote!" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Options:"
        Write-Host "  1. Run 'ctoc sync' to get remote changes first"
        Write-Host "  2. Continue editing (may cause conflict)"
        return $false
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Check Multiple Files
# ═══════════════════════════════════════════════════════════════════════════════

function Test-Files {
    param([string[]]$Files)

    if (-not $Files -or $Files.Count -eq 0) {
        $Files = git diff --name-only 2>$null
        if (-not $Files) {
            Write-Host "No modified files to check."
            return $true
        }
    }

    Write-Host "Checking file freshness..." -ForegroundColor Blue
    Write-Host ""

    $staleCount = 0
    foreach ($file in $Files) {
        if (-not (Test-FileFreshness -File $file)) {
            $staleCount++
        }
    }

    Write-Host ""
    if ($staleCount -gt 0) {
        Write-Host "$staleCount file(s) have remote changes." -ForegroundColor Yellow
        Write-Host "Run 'ctoc sync' to update before editing."
        return $false
    } else {
        Write-Host "All files are fresh." -ForegroundColor Green
        return $true
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Smart Conflict Resolution
# ═══════════════════════════════════════════════════════════════════════════════

function Resolve-Conflict {
    param([string]$File)

    if (-not $File) {
        $conflicted = git diff --name-only --diff-filter=U 2>$null
        if (-not $conflicted) {
            Write-Host "No conflicts detected."
            return
        }
        Write-Host "Conflicted files:" -ForegroundColor Yellow
        Write-Host $conflicted
        Write-Host ""
    }

    # Check rerere
    $rerereStatus = git rerere status 2>$null
    if ($rerereStatus) {
        Write-Host "Rerere has recorded resolutions for:" -ForegroundColor Green
        Write-Host $rerereStatus
        Write-Host ""
        Write-Host "Applying remembered resolutions..."
        git rerere
    }

    Write-Host "Conflict Resolution Options:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [1] Keep ours (your local changes)"
    Write-Host "  [2] Keep theirs (remote changes)"
    Write-Host "  [3] Manual merge (open in editor)"
    Write-Host "  [4] Show diff"
    Write-Host "  [5] Abort operation"
    Write-Host ""

    $choice = Read-Host "Choice [1-5]"

    switch ($choice) {
        "1" {
            if ($File) {
                git checkout --ours $File
                git add $File
                Write-Host "Kept our version of $File" -ForegroundColor Green
            } else {
                $conflicted = git diff --name-only --diff-filter=U
                foreach ($f in $conflicted) {
                    git checkout --ours $f
                    git add $f
                }
                Write-Host "Kept our versions of all conflicted files" -ForegroundColor Green
            }
        }
        "2" {
            if ($File) {
                git checkout --theirs $File
                git add $File
                Write-Host "Kept their version of $File" -ForegroundColor Green
            } else {
                $conflicted = git diff --name-only --diff-filter=U
                foreach ($f in $conflicted) {
                    git checkout --theirs $f
                    git add $f
                }
                Write-Host "Kept their versions of all conflicted files" -ForegroundColor Green
            }
        }
        "3" {
            if ($File) {
                & notepad $File
            } else {
                Write-Host "Open each conflicted file in your editor to resolve:"
                git diff --name-only --diff-filter=U
            }
        }
        "4" {
            if ($File) {
                git diff $File
            } else {
                git diff
            }
        }
        "5" {
            Write-Host "Aborting..."
            git rebase --abort 2>$null
            git merge --abort 2>$null
        }
        default {
            Write-Host "Invalid choice."
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Worktrees
# ═══════════════════════════════════════════════════════════════════════════════

function New-Worktree {
    param(
        [string]$Branch,
        [string]$Dir
    )

    if (-not $Dir) {
        $Dir = ".ctoc\worktrees\$Branch"
    }

    Write-Host "Creating worktree for: $Branch" -ForegroundColor Blue

    $remote = git remote | Select-Object -First 1
    $baseBranch = git rev-parse --abbrev-ref HEAD

    New-Item -ItemType Directory -Path (Split-Path $Dir -Parent) -Force | Out-Null

    try {
        git worktree add $Dir -b $Branch "$remote/$baseBranch"
        Write-Host "Created worktree at: $Dir" -ForegroundColor Green
        Write-Host ""
        Write-Host "To work in this worktree:"
        Write-Host "  cd $Dir"
    } catch {
        try {
            git worktree add $Dir $Branch
            Write-Host "Created worktree at: $Dir" -ForegroundColor Green
        } catch {
            Write-Host "Failed to create worktree." -ForegroundColor Red
        }
    }
}

function Get-Worktrees {
    Write-Host "Git Worktrees:" -ForegroundColor Cyan
    Write-Host ""
    git worktree list
}

function Remove-Worktree {
    param([string]$Branch)

    $dir = ".ctoc\worktrees\$Branch"

    if (-not (Test-Path $dir)) {
        Write-Host "Worktree not found for: $Branch" -ForegroundColor Red
        git worktree list
        return
    }

    Write-Host "Removing worktree: $dir" -ForegroundColor Blue
    git worktree remove $dir
    Write-Host "Worktree removed." -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Help
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Help {
    @"
CTOC Hybrid File Locking System

USAGE:
    ctoc lock <command> [options]

COMMANDS:
    check [file...]       Check file freshness (optimistic locking)
    resolve [file]        Smart conflict resolution
    setup-rerere          Enable git rerere globally
    worktree new <branch> Create a worktree for parallel work
    worktree list         List all worktrees
    worktree remove <br>  Remove a worktree

EXAMPLES:
    ctoc lock check src\main.py       # Check single file
    ctoc lock check                   # Check all modified files
    ctoc lock resolve                 # Interactive conflict resolution
    ctoc lock setup-rerere            # Enable rerere
    ctoc lock worktree new feature-x  # Create parallel workspace

"@
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

switch ($Command) {
    "check" {
        if ($Arg1) {
            Test-Files -Files @($Arg1)
        } else {
            Test-Files
        }
    }
    "resolve" {
        Resolve-Conflict -File $Arg1
    }
    "setup-rerere" {
        Initialize-Rerere
    }
    "worktree" {
        switch ($Arg1) {
            { $_ -in "new", "create", "add" } {
                if ([string]::IsNullOrEmpty($Arg2)) {
                    Write-Host "Usage: ctoc lock worktree new <branch-name>"
                    exit 1
                }
                New-Worktree -Branch $Arg2
            }
            "list" {
                Get-Worktrees
            }
            { $_ -in "remove", "rm", "delete" } {
                if ([string]::IsNullOrEmpty($Arg2)) {
                    Write-Host "Usage: ctoc lock worktree remove <branch-name>"
                    exit 1
                }
                Remove-Worktree -Branch $Arg2
            }
            default {
                Get-Worktrees
            }
        }
    }
    { $_ -in "help", "--help", "-h" } {
        Show-Help
    }
    default {
        Write-Host "Unknown command: $Command"
        Write-Host "Run 'ctoc lock help' for usage."
        exit 1
    }
}
