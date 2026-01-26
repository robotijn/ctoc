# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Git Workflow Helpers (PowerShell)
#  Monobranch workflow: pull-rebase-commit-push with safety
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
#  Sync: Pull-Rebase-Push
# ═══════════════════════════════════════════════════════════════════════════════

function Invoke-Sync {
    param([switch]$DryRun)

    Write-Host "CTOC Sync Workflow" -ForegroundColor Blue
    Write-Host "═══════════════════════════════════════"

    # Check if in git repo
    try {
        git rev-parse --is-inside-work-tree 2>$null | Out-Null
    } catch {
        Write-Host "Not a git repository." -ForegroundColor Red
        exit 1
    }

    # Get current branch
    $branch = git rev-parse --abbrev-ref HEAD
    Write-Host "Branch: $branch"

    # Check for uncommitted changes
    $status = git status --porcelain
    if ($status) {
        Write-Host "Warning: You have uncommitted changes." -ForegroundColor Yellow
        $response = Read-Host "Continue anyway? (y/N)"
        if ($response -notmatch "^[Yy]$") {
            exit 1
        }
    }

    # Get remote
    $remote = git remote | Select-Object -First 1
    if (-not $remote) {
        Write-Host "No remote configured." -ForegroundColor Red
        exit 1
    }

    Write-Host "Remote: $remote"
    Write-Host ""

    # Step 1: Fetch
    Write-Host "Step 1: Fetching from $remote..." -ForegroundColor Blue
    if ($DryRun) {
        Write-Host "  [dry-run] git fetch $remote $branch"
    } else {
        git fetch $remote $branch --quiet 2>$null
    }

    # Step 2: Check if we need to rebase
    $localCommit = git rev-parse HEAD
    $remoteCommit = git rev-parse "$remote/$branch" 2>$null

    if (-not $remoteCommit) {
        Write-Host "No remote branch found. Will push new branch." -ForegroundColor Yellow
    } else {
        $baseCommit = git merge-base HEAD "$remote/$branch" 2>$null

        if ($localCommit -eq $remoteCommit) {
            Write-Host "Already up to date." -ForegroundColor Green
        } elseif ($baseCommit -eq $remoteCommit) {
            Write-Host "Local is ahead of remote. Ready to push."
        } else {
            Write-Host "Rebasing on remote changes..." -ForegroundColor Yellow
            if ($DryRun) {
                Write-Host "  [dry-run] git rebase $remote/$branch"
            } else {
                try {
                    git rebase "$remote/$branch"
                } catch {
                    Write-Host "Rebase failed. Resolve conflicts and run:" -ForegroundColor Red
                    Write-Host "  git rebase --continue"
                    Write-Host "  ctoc sync"
                    exit 1
                }
            }
        }
    }

    # Step 3: Push with --force-with-lease
    Write-Host ""
    Write-Host "Step 3: Pushing to $remote/$branch..." -ForegroundColor Blue
    if ($DryRun) {
        Write-Host "  [dry-run] git push $remote $branch --force-with-lease"
    } else {
        try {
            git push $remote $branch --force-with-lease
            Write-Host "Sync complete!" -ForegroundColor Green
        } catch {
            Write-Host "Push failed." -ForegroundColor Red
            Write-Host "If someone else pushed, run: ctoc sync"
            exit 1
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Commit: Validated commit with sync
# ═══════════════════════════════════════════════════════════════════════════════

function Invoke-Commit {
    param(
        [string]$Message,
        [switch]$NoSync
    )

    Write-Host "CTOC Commit Workflow" -ForegroundColor Blue
    Write-Host "═══════════════════════════════════════"

    # Check for changes
    $status = git status --porcelain
    if (-not $status) {
        Write-Host "No changes to commit." -ForegroundColor Yellow
        exit 0
    }

    # Stage all changes
    Write-Host ""
    Write-Host "Staging changes..." -ForegroundColor Blue
    git add -A

    # Show what will be committed
    Write-Host ""
    Write-Host "Changes to be committed:"
    git diff --cached --stat

    Write-Host ""
    $response = Read-Host "Commit these changes? (Y/n)"
    if ($response -match "^[Nn]$") {
        Write-Host "Aborted."
        git reset HEAD
        exit 1
    }

    # Commit
    Write-Host ""
    Write-Host "Committing..." -ForegroundColor Blue
    git commit -m "$Message`n`nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

    Write-Host "Committed!" -ForegroundColor Green

    # Sync unless skipped
    if (-not $NoSync) {
        Write-Host ""
        Invoke-Sync
    } else {
        Write-Host ""
        Write-Host "Changes committed locally. Run 'ctoc sync' to push."
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Quick Commit
# ═══════════════════════════════════════════════════════════════════════════════

function Invoke-QuickCommit {
    param([string]$Message)

    if ([string]::IsNullOrEmpty($Message)) {
        Write-Host "Commit message required." -ForegroundColor Red
        Write-Host "Usage: ctoc qc `"commit message`""
        exit 1
    }

    git add -A
    git commit -m "$Message`n`nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
    Invoke-Sync
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Check File Freshness
# ═══════════════════════════════════════════════════════════════════════════════

function Test-Freshness {
    param([string]$File)

    if (-not (Test-Path $File)) {
        Write-Host "File not found: $File" -ForegroundColor Red
        exit 1
    }

    $remote = git remote | Select-Object -First 1
    $branch = git rev-parse --abbrev-ref HEAD

    git fetch $remote $branch --quiet 2>$null

    $localHash = git hash-object $File
    $remoteHash = git show "$remote/${branch}:$File" 2>$null | git hash-object --stdin 2>$null

    if (-not $remoteHash) {
        Write-Host "${File}: New file (not on remote)" -ForegroundColor Green
        return
    }

    if ($localHash -eq $remoteHash) {
        Write-Host "${File}: Up to date" -ForegroundColor Green
    } else {
        Write-Host "${File}: Modified on remote!" -ForegroundColor Yellow
        Write-Host "Run 'ctoc sync' before editing to avoid conflicts."
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Status: Enhanced git status
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Status {
    Write-Host "CTOC Git Status" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════"

    $branch = git rev-parse --abbrev-ref HEAD 2>$null
    if (-not $branch) { $branch = "detached" }
    Write-Host "Branch: $branch"

    $remote = git remote | Select-Object -First 1
    if ($remote) {
        git fetch $remote --quiet 2>$null

        $localCommit = git rev-parse HEAD 2>$null
        $remoteCommit = git rev-parse "$remote/$branch" 2>$null

        if (-not $remoteCommit) {
            Write-Host "Remote: " -NoNewline
            Write-Host "No remote branch" -ForegroundColor Yellow
        } elseif ($localCommit -eq $remoteCommit) {
            Write-Host "Remote: " -NoNewline
            Write-Host "Synced" -ForegroundColor Green
        } else {
            $ahead = (git rev-list --count "$remote/${branch}..HEAD" 2>$null) -as [int]
            $behind = (git rev-list --count "HEAD..$remote/$branch" 2>$null) -as [int]

            Write-Host "Remote: " -NoNewline
            if ($behind -gt 0 -and $ahead -gt 0) {
                Write-Host "Diverged (↑$ahead ↓$behind)" -ForegroundColor Yellow
            } elseif ($ahead -gt 0) {
                Write-Host "Ahead by $ahead" -ForegroundColor Blue
            } else {
                Write-Host "Behind by $behind" -ForegroundColor Yellow
            }
        }
    }

    Write-Host ""

    $staged = (git diff --cached --name-only | Measure-Object).Count
    $unstaged = (git diff --name-only | Measure-Object).Count
    $untracked = (git ls-files --others --exclude-standard | Measure-Object).Count

    if ($staged -gt 0 -or $unstaged -gt 0 -or $untracked -gt 0) {
        Write-Host "Changes:"
        if ($staged -gt 0) { Write-Host "  Staged:    $staged files" -ForegroundColor Green }
        if ($unstaged -gt 0) { Write-Host "  Modified:  $unstaged files" -ForegroundColor Yellow }
        if ($untracked -gt 0) { Write-Host "  Untracked: $untracked files" -ForegroundColor Red }
    } else {
        Write-Host "Working tree: " -NoNewline
        Write-Host "Clean" -ForegroundColor Green
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Help
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Help {
    @"
CTOC Git Workflow Helpers

USAGE:
    ctoc sync [--dry-run]     Pull-rebase-push workflow
    ctoc commit "message"     Stage, validate, commit, and push
    ctoc qc "message"         Quick commit and push
    ctoc status               Enhanced git status
    ctoc lock-check <file>    Check if file is fresh

WORKFLOW:
    The monobranch workflow ensures clean, linear history:

    1. ctoc sync             # Pull and rebase before work
    2. ... make changes ...
    3. ctoc commit "msg"     # Validate, commit, and push

EXAMPLES:
    ctoc sync                           # Sync with remote
    ctoc sync --dry-run                 # Preview sync actions
    ctoc commit "feat: Add login"       # Full commit workflow
    ctoc qc "fix: Typo"                 # Quick commit
    ctoc lock-check src\main.py         # Check file freshness

"@
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

switch ($Command) {
    "sync" {
        $dryRun = $Arg1 -eq "--dry-run"
        Invoke-Sync -DryRun:$dryRun
    }
    "commit" {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc commit `"commit message`""
            exit 1
        }
        $noSync = $Arg2 -eq "--no-sync"
        Invoke-Commit -Message $Arg1 -NoSync:$noSync
    }
    { $_ -in "qc", "quick-commit" } {
        Invoke-QuickCommit -Message $Arg1
    }
    { $_ -in "lock-check", "freshness" } {
        if ([string]::IsNullOrEmpty($Arg1)) {
            Write-Host "Usage: ctoc lock-check <file>"
            exit 1
        }
        Test-Freshness -File $Arg1
    }
    "status" {
        Show-Status
    }
    { $_ -in "help", "--help", "-h" } {
        Show-Help
    }
    default {
        Write-Host "Unknown command: $Command"
        Write-Host "Run 'ctoc git help' for usage."
        exit 1
    }
}
