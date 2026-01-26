# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Skill Downloader (PowerShell)
#  Downloads individual skills from the CTOC repository
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [Parameter(Position = 0)]
    [string]$Command = "",

    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$Args = @()
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CtocRaw = "https://raw.githubusercontent.com/theaiguys/ctoc/main"

# Find skills index
$CtocDir = Split-Path -Parent $ScriptDir
if (Test-Path ".ctoc/skills.json") {
    $SkillsIndex = ".ctoc/skills.json"
} elseif (Test-Path "$CtocDir/skills.json") {
    $SkillsIndex = "$CtocDir/skills.json"
} else {
    Write-Error "skills.json not found"
    exit 1
}

$Index = Get-Content $SkillsIndex -Raw | ConvertFrom-Json
$SkillsDir = ".ctoc/skills"

# ═══════════════════════════════════════════════════════════════════════════════
#  Find skill path in index
# ═══════════════════════════════════════════════════════════════════════════════

function Get-SkillPath {
    param([string]$Name)

    # Try languages first
    if ($Index.skills.languages.PSObject.Properties[$Name]) {
        return $Index.skills.languages.$Name.file
    }

    # Try frameworks
    foreach ($category in $Index.skills.frameworks.PSObject.Properties) {
        if ($category.Value.PSObject.Properties[$Name]) {
            return $category.Value.$Name.file
        }
    }

    return $null
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Download a single skill
# ═══════════════════════════════════════════════════════════════════════════════

function Get-Skill {
    param(
        [string]$Name,
        [switch]$Quiet
    )

    $path = Get-SkillPath -Name $Name

    if (-not $path) {
        if (-not $Quiet) { Write-Warning "Unknown skill: $Name" }
        return $false
    }

    $localPath = Join-Path $SkillsDir $path

    # Check if already downloaded
    if (Test-Path $localPath) {
        if (-not $Quiet) { Write-Host "Already have: $Name" }
        return $true
    }

    # Create directory
    $dir = Split-Path $localPath -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    # Download
    $url = "$CtocRaw/.ctoc/skills/$path"
    try {
        Invoke-WebRequest -Uri $url -OutFile $localPath -ErrorAction Stop
        if (-not $Quiet) { Write-Host "✓ Downloaded: $Name" }
        return $true
    } catch {
        if (-not $Quiet) { Write-Warning "✗ Failed to download: $Name" }
        if (Test-Path $localPath) { Remove-Item $localPath -Force }
        return $false
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Download skills and their dependencies
# ═══════════════════════════════════════════════════════════════════════════════

function Get-SkillWithDeps {
    param([string]$Name)

    $downloaded = @()

    # Get required languages
    foreach ($category in $Index.skills.frameworks.PSObject.Properties) {
        $skill = $category.Value.PSObject.Properties[$Name]
        if ($skill -and $skill.Value.requires) {
            foreach ($req in $skill.Value.requires) {
                $langPath = Join-Path $SkillsDir "languages/$req.md"
                if (-not (Test-Path $langPath)) {
                    if (Get-Skill -Name $req -Quiet) {
                        $downloaded += $req
                    }
                }
            }
        }
    }

    # Download main skill
    if (Get-Skill -Name $Name -Quiet) {
        $downloaded += $Name
    }

    if ($downloaded.Count -gt 0) {
        Write-Host "Downloaded: $($downloaded -join ', ')"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Sync - Detect and download all needed skills
# ═══════════════════════════════════════════════════════════════════════════════

function Sync-Skills {
    Write-Host "Scanning project..."

    # Run detection
    $detected = & "$ScriptDir/detect.ps1" -Mode all -OutputFormat json | ConvertFrom-Json

    $toDownload = @()

    # Check languages
    foreach ($lang in $detected.languages) {
        if (-not $lang) { continue }
        $langPath = Join-Path $SkillsDir "languages/$lang.md"
        if (-not (Test-Path $langPath)) {
            $toDownload += $lang
        }
    }

    # Check frameworks
    foreach ($framework in $detected.frameworks) {
        if (-not $framework) { continue }
        $path = Get-SkillPath -Name $framework
        if ($path) {
            $localPath = Join-Path $SkillsDir $path
            if (-not (Test-Path $localPath)) {
                $toDownload += $framework

                # Also check required languages
                foreach ($category in $Index.skills.frameworks.PSObject.Properties) {
                    $skill = $category.Value.PSObject.Properties[$framework]
                    if ($skill -and $skill.Value.requires) {
                        foreach ($req in $skill.Value.requires) {
                            $reqPath = Join-Path $SkillsDir "languages/$req.md"
                            if (-not (Test-Path $reqPath) -and $toDownload -notcontains $req) {
                                $toDownload += $req
                            }
                        }
                    }
                }
            }
        }
    }

    if ($toDownload.Count -eq 0) {
        Write-Host "✓ All needed skills already downloaded"
        return
    }

    Write-Host "Downloading $($toDownload.Count) skill(s)..."
    foreach ($skill in $toDownload) {
        Get-Skill -Name $skill
    }

    Write-Host "✓ Skills synchronized"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

switch ($Command) {
    "skill" {
        if ($Args.Count -eq 0) {
            Write-Host "Usage: download.ps1 skill <name> [name...]"
            exit 1
        }
        foreach ($name in $Args) {
            Get-Skill -Name $name
        }
    }
    "with-deps" {
        if ($Args.Count -eq 0) {
            Write-Host "Usage: download.ps1 with-deps <name>"
            exit 1
        }
        Get-SkillWithDeps -Name $Args[0]
    }
    "sync" {
        Sync-Skills
    }
    "" {
        Write-Host "Usage: download.ps1 <skill|with-deps|sync> [args...]"
    }
    default {
        # Treat as skill name
        Get-Skill -Name $Command
    }
}
