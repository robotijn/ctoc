# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Project Technology Detection (PowerShell)
#  Detects languages and frameworks used in the current project
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [string]$Mode = "all",
    [string]$OutputFormat = "text"
)

$ErrorActionPreference = "Stop"

# Find skills index
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CtocDir = Split-Path -Parent $ScriptDir

if (Test-Path ".ctoc/skills.json") {
    $SkillsIndex = ".ctoc/skills.json"
} elseif (Test-Path "$CtocDir/skills.json") {
    $SkillsIndex = "$CtocDir/skills.json"
} else {
    Write-Error "skills.json not found"
    exit 1
}

# Load skills index
$Index = Get-Content $SkillsIndex -Raw | ConvertFrom-Json

# ═══════════════════════════════════════════════════════════════════════════════
#  Detect Languages
# ═══════════════════════════════════════════════════════════════════════════════

function Get-DetectedLanguages {
    $detected = @()

    foreach ($lang in $Index.skills.languages.PSObject.Properties) {
        $name = $lang.Name
        $triggers = $lang.Value.triggers

        foreach ($trigger in $triggers) {
            if ([string]::IsNullOrEmpty($trigger)) { continue }

            if ($trigger -match '\*') {
                # Glob pattern - search for matching files
                $pattern = $trigger -replace '^\*', ''
                $files = Get-ChildItem -Path . -Filter "*$pattern" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($files) {
                    $detected += $name
                    break
                }
            } else {
                # Exact file match
                if (Test-Path $trigger) {
                    $detected += $name
                    break
                }
            }
        }
    }

    return $detected | Sort-Object -Unique
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Detect Frameworks
# ═══════════════════════════════════════════════════════════════════════════════

function Get-DetectedFrameworks {
    $detected = @()

    # Common config files
    $configFiles = @(
        "pyproject.toml", "requirements.txt", "setup.py",
        "package.json", "package-lock.json",
        "Cargo.toml", "go.mod", "go.sum",
        "pom.xml", "build.gradle", "build.gradle.kts",
        "Gemfile", "composer.json", "pubspec.yaml",
        "mix.exs", "deps.edn", "project.clj",
        "Pipfile", "poetry.lock"
    )

    # Read all config file contents
    $configContent = ""
    foreach ($file in $configFiles) {
        if (Test-Path $file) {
            $configContent += Get-Content $file -Raw -ErrorAction SilentlyContinue
        }
    }

    if ([string]::IsNullOrEmpty($configContent)) {
        return $detected
    }

    # Check each framework's keywords
    foreach ($category in $Index.skills.frameworks.PSObject.Properties) {
        foreach ($framework in $category.Value.PSObject.Properties) {
            $name = $framework.Name
            $keywords = $framework.Value.keywords

            foreach ($keyword in $keywords) {
                if ([string]::IsNullOrEmpty($keyword)) { continue }

                if ($configContent -match [regex]::Escape($keyword)) {
                    $detected += $name
                    break
                }
            }
        }
    }

    return $detected | Sort-Object -Unique
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

switch ($Mode) {
    "languages" {
        Get-DetectedLanguages
    }
    "frameworks" {
        Get-DetectedFrameworks
    }
    default {
        $languages = Get-DetectedLanguages
        $frameworks = Get-DetectedFrameworks

        if ($OutputFormat -eq "json") {
            @{
                languages = $languages
                frameworks = $frameworks
            } | ConvertTo-Json
        } else {
            if ($languages.Count -gt 0) {
                Write-Host "Languages:"
                $languages | ForEach-Object { Write-Host "  - $_" }
            }
            if ($frameworks.Count -gt 0) {
                Write-Host "Frameworks:"
                $frameworks | ForEach-Object { Write-Host "  - $_" }
            }
            if ($languages.Count -eq 0 -and $frameworks.Count -eq 0) {
                Write-Host "No technologies detected."
            }
        }
    }
}
