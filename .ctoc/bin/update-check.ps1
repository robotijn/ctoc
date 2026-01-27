# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Update Checker (PowerShell)
#  Checks for updates once per day
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [switch]$Force,
    [switch]$Silent
)

$ErrorActionPreference = "SilentlyContinue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VersionFile = Join-Path $ScriptDir "..\VERSION"
if (-not (Test-Path $VersionFile)) {
    $VersionFile = Join-Path $ScriptDir "..\..\VERSION"
}
$LastCheckFile = Join-Path $env:USERPROFILE ".ctoc-last-update-check"
$Repo = if ($env:CTOC_REPO) { $env:CTOC_REPO } else { "theaiguys/ctoc" }
$Branch = if ($env:CTOC_BRANCH) { $env:CTOC_BRANCH } else { "main" }

function Get-LocalVersion {
    if (Test-Path $VersionFile) {
        return (Get-Content $VersionFile -Raw).Trim()
    }
    return "0.0.0"
}

function Get-RemoteVersion {
    $url = "https://raw.githubusercontent.com/$Repo/$Branch/VERSION"
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
        return $response.Content.Trim()
    } catch {
        return ""
    }
}

function Compare-Versions {
    param(
        [string]$v1,
        [string]$v2
    )

    $v1Parts = $v1.Split('.') | ForEach-Object { [int]$_ }
    $v2Parts = $v2.Split('.') | ForEach-Object { [int]$_ }

    for ($i = 0; $i -lt 3; $i++) {
        $p1 = if ($i -lt $v1Parts.Count) { $v1Parts[$i] } else { 0 }
        $p2 = if ($i -lt $v2Parts.Count) { $v2Parts[$i] } else { 0 }

        if ($p1 -gt $p2) { return 1 }
        if ($p1 -lt $p2) { return -1 }
    }

    return 0
}

function Test-ShouldCheck {
    if ($Force) { return $true }

    if (-not (Test-Path $LastCheckFile)) {
        return $true
    }

    $lastCheck = Get-Content $LastCheckFile -Raw
    $lastCheckTime = [DateTimeOffset]::FromUnixTimeSeconds([long]$lastCheck).DateTime
    $now = Get-Date

    # Check if more than 24 hours have passed
    return (($now - $lastCheckTime).TotalHours -gt 24)
}

function Update-LastCheck {
    $now = [DateTimeOffset]::Now.ToUnixTimeSeconds()
    $now | Out-File -FilePath $LastCheckFile -NoNewline
}

function Show-UpdatePrompt {
    param(
        [string]$RemoteVersion,
        [string]$LocalVersion
    )

    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║               CTOC Update Available!                           ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Current version: " -NoNewline
    Write-Host $LocalVersion -ForegroundColor Yellow
    Write-Host "  New version:     " -NoNewline
    Write-Host $RemoteVersion -ForegroundColor Green
    Write-Host ""

    # Check if running interactively
    if ([Environment]::UserInteractive -and -not $Silent) {
        $response = Read-Host "  Would you like to update now? [y/N]"
        if ($response -match '^[yY]') {
            Write-Host ""
            Write-Host "Starting update..." -ForegroundColor Green
            Invoke-Update
        } else {
            Write-Host ""
            Write-Host "  Skipping update. Run 'ctoc update' later to update."
        }
    } else {
        Write-Host "  Run 'ctoc update' to install the new version."
    }
    Write-Host ""
}

function Invoke-Update {
    $installUrl = "https://raw.githubusercontent.com/$Repo/$Branch/install.ps1"
    try {
        $installer = Invoke-WebRequest -Uri $installUrl -UseBasicParsing
        Invoke-Expression $installer.Content
    } catch {
        Write-Host "Error: Failed to download installer" -ForegroundColor Red
        exit 1
    }
}

function Test-ForUpdates {
    # Skip if CTOC_SKIP_UPDATE_CHECK is set
    if ($env:CTOC_SKIP_UPDATE_CHECK) {
        return
    }

    # Skip if not time for check
    if (-not (Test-ShouldCheck)) {
        return
    }

    # Update timestamp
    Update-LastCheck

    $localVersion = Get-LocalVersion
    $remoteVersion = Get-RemoteVersion

    if ([string]::IsNullOrEmpty($remoteVersion)) {
        # Couldn't reach GitHub, skip silently
        return
    }

    if ((Compare-Versions -v1 $remoteVersion -v2 $localVersion) -gt 0) {
        Show-UpdatePrompt -RemoteVersion $remoteVersion -LocalVersion $localVersion
    }
}

# Run check
Test-ForUpdates
