# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Process Skill Improvement Issues (PowerShell)
#  Fetches approved issues for Claude Code to process
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [string]$Repo = "theaiguys/ctoc",
    [string]$OutputFile = "$env:TEMP\ctoc-issues-to-process.json",
    [int]$Limit = 10
)

$ErrorActionPreference = "Stop"

# Check for gh CLI
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "Error: GitHub CLI (gh) is required but not installed." -ForegroundColor Red
    Write-Host "Install it from: https://cli.github.com/"
    exit 1
}

# Check gh auth
try {
    gh auth status 2>&1 | Out-Null
} catch {
    Write-Host "Error: Not authenticated with GitHub CLI." -ForegroundColor Red
    Write-Host "Run: gh auth login"
    exit 1
}

Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Blue
Write-Host "  CTOC - Skill Improvement Issue Processor" -ForegroundColor Blue
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Blue
Write-Host ""

# Fetch issues
Write-Host "Fetching approved skill improvement issues from $Repo..." -ForegroundColor Yellow
Write-Host ""

$IssuesJson = gh issue list --repo $Repo `
    --label "ready-to-process" `
    --label "skill-improvement" `
    --state open `
    --json number,title,body,author,labels,reactions,createdAt `
    --limit $Limit 2>$null

if (-not $IssuesJson -or $IssuesJson -eq "[]") {
    Write-Host "No issues ready to process." -ForegroundColor Green
    Write-Host ""
    Write-Host "Issues need:"
    Write-Host "  1. 'skill-improvement' label"
    Write-Host "  2. 'ready-to-process' label (added after 5+ community votes)"
    Write-Host "  3. To be in 'open' state"
    Write-Host ""
    Write-Host "Check pending issues: " -NoNewline
    Write-Host "gh issue list --repo $Repo --label skill-improvement" -ForegroundColor Blue
    exit 0
}

$Issues = $IssuesJson | ConvertFrom-Json
$IssueCount = $Issues.Count

Write-Host "Found $IssueCount issue(s) ready to process:" -ForegroundColor Green
Write-Host ""

foreach ($Issue in $Issues) {
    Write-Host "  #$($Issue.number): $($Issue.title)"
}
Write-Host ""

# Show vote counts
Write-Host "Vote counts:" -ForegroundColor Yellow
foreach ($Issue in $Issues) {
    $votes = if ($Issue.reactions.'+1') { $Issue.reactions.'+1' } else { 0 }
    Write-Host "  #$($Issue.number): $votes votes"
}
Write-Host ""

# Save to file
$IssuesJson | Out-File -FilePath $OutputFile -Encoding utf8

Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Blue
Write-Host "Issue data saved to: $OutputFile" -ForegroundColor Green
Write-Host ""
Write-Host "Claude Code should now:"
Write-Host ""
Write-Host "  1. Read the issues file"
Write-Host "  2. For each issue:"
Write-Host "     a. Parse the skill name and improvement details"
Write-Host "     b. Read the current skill file"
Write-Host "     c. Research current best practices"
Write-Host "     d. Update the skill file"
Write-Host "     e. Commit with message: 'skill: update {name} (fixes #{issue})'"
Write-Host "  3. Create PR(s) for the changes"
Write-Host "  4. Comment on issues linking to the PR"
Write-Host ""
Write-Host "Tip: Review the issues above before processing to skip any suspicious ones." -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Blue
