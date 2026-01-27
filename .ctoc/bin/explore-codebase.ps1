# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Codebase Explorer (PowerShell)
#  Generates PROJECT_MAP.md during ctoc init
# ═══════════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

# ═══════════════════════════════════════════════════════════════════════════════
#  Configuration
# ═══════════════════════════════════════════════════════════════════════════════

# Directories to ignore
$IgnoreDirs = @('node_modules', '__pycache__', '.git', '.next', 'dist', 'build', '.venv', 'venv', '.idea', '.vscode', 'coverage', '.pytest_cache', '.mypy_cache')

# File extensions to analyze
$CodeExtensions = @('*.py', '*.ts', '*.tsx', '*.js', '*.jsx', '*.go', '*.rs', '*.java', '*.rb', '*.php', '*.swift', '*.kt', '*.cs', '*.cpp', '*.c', '*.h')

# Output file
$OutputFile = ".ctoc/PROJECT_MAP.md"

# ═══════════════════════════════════════════════════════════════════════════════
#  Functions
# ═══════════════════════════════════════════════════════════════════════════════

function Get-FilteredItems {
    param (
        [string]$Path = ".",
        [int]$Depth = 3,
        [switch]$Directory
    )

    $items = if ($Directory) {
        Get-ChildItem -Path $Path -Recurse -Depth $Depth -Directory -ErrorAction SilentlyContinue
    } else {
        Get-ChildItem -Path $Path -Recurse -Depth $Depth -File -ErrorAction SilentlyContinue
    }

    $items | Where-Object {
        $fullPath = $_.FullName
        $shouldExclude = $false
        foreach ($ignore in $IgnoreDirs) {
            if ($fullPath -match [regex]::Escape($ignore)) {
                $shouldExclude = $true
                break
            }
        }
        -not $shouldExclude
    }
}

function Generate-Tree {
    param ([int]$Depth = 3)

    $output = @()
    $output += "## Directory Structure"
    $output += ""
    $output += '```'

    $dirs = Get-FilteredItems -Path "." -Depth $Depth -Directory | Sort-Object FullName

    foreach ($dir in $dirs) {
        $relativePath = $dir.FullName.Replace($PWD.Path, ".").Replace("\", "/")
        $level = ($relativePath.Split("/").Count - 1)
        $indent = "  " * $level
        $output += "$indent$($dir.Name)/"
    }

    $output += '```'
    $output += ""

    return $output -join "`n"
}

function Analyze-KeyFiles {
    $output = @()
    $output += "## Key Files"
    $output += ""
    $output += "| File | Purpose | Key Elements |"
    $output += "|------|---------|--------------|"

    $keyPatterns = @(
        "src/main.*",
        "src/app.*",
        "src/index.*",
        "main.*",
        "app.*",
        "index.*",
        "server.*",
        "routes.*"
    )

    $foundFiles = @()

    foreach ($ext in $CodeExtensions) {
        $files = Get-FilteredItems -Path "." -Depth 4 | Where-Object { $_.Name -like $ext }
        foreach ($file in $files) {
            $relativePath = $file.FullName.Replace($PWD.Path, ".").Replace("\", "/")

            # Determine purpose
            $purpose = switch -Regex ($relativePath) {
                'route|router' { "API routing" }
                'model' { "Data models" }
                'service' { "Business logic" }
                'util|helper' { "Utilities" }
                'config|settings' { "Configuration" }
                'main|app|index' { "Entry point" }
                'auth' { "Authentication" }
                'test|spec' { "Tests" }
                default { "Core logic" }
            }

            # Extract key elements (simplified)
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            $elements = @()

            if ($content) {
                # Match function/class definitions
                $matches = [regex]::Matches($content, '(?:def|class|function|const|export)\s+([a-zA-Z_][a-zA-Z0-9_]*)')
                $elements = $matches | Select-Object -First 5 | ForEach-Object { $_.Groups[1].Value }
            }

            $elementsStr = $elements -join ", "

            if (-not ($foundFiles -contains $relativePath)) {
                $foundFiles += $relativePath
                $output += "| ``$relativePath`` | $purpose | $elementsStr |"
            }

            if ($foundFiles.Count -ge 20) { break }
        }
        if ($foundFiles.Count -ge 20) { break }
    }

    $output += ""

    return $output -join "`n"
}

function Detect-Patterns {
    $output = @()
    $output += "## Patterns Used"
    $output += ""

    $patternsFound = $false
    $allContent = ""

    # Read some code files
    $codeFiles = Get-FilteredItems -Path "." -Depth 3 | Where-Object {
        $ext = $_.Extension
        $CodeExtensions | ForEach-Object { $_.Replace("*", "") } | Where-Object { $ext -eq $_ }
    } | Select-Object -First 50

    foreach ($file in $codeFiles) {
        $allContent += Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    }

    # Detect patterns
    if ($allContent -match "jwt|JWT|Bearer") {
        $output += "- **Authentication:** JWT tokens"
        $patternsFound = $true
    } elseif ($allContent -match "session") {
        $output += "- **Authentication:** Session-based"
        $patternsFound = $true
    }

    $orms = @("SQLAlchemy", "Prisma", "TypeORM", "Sequelize", "mongoose", "Hibernate", "ActiveRecord", "Diesel")
    foreach ($orm in $orms) {
        if ($allContent -match $orm) {
            $output += "- **Database:** $orm ORM"
            $patternsFound = $true
            break
        }
    }

    $frameworks = @("FastAPI", "Express", "Flask", "Django", "Rails", "Spring", "Gin", "Actix", "Axum")
    foreach ($fw in $frameworks) {
        if ($allContent -match $fw) {
            $output += "- **API:** $fw"
            $patternsFound = $true
            break
        }
    }

    $feFrameworks = @("React", "Vue", "Angular", "Svelte", "Next", "Nuxt")
    foreach ($fe in $feFrameworks) {
        if ($allContent -match $fe) {
            $output += "- **Frontend:** $fe"
            $patternsFound = $true
            break
        }
    }

    $testFrameworks = @("pytest", "jest", "mocha", "vitest", "rspec", "junit")
    foreach ($tf in $testFrameworks) {
        if ($allContent -match $tf) {
            $output += "- **Testing:** $tf"
            $patternsFound = $true
            break
        }
    }

    if (-not $patternsFound) {
        $output += "- No common patterns detected"
    }

    $output += ""

    return $output -join "`n"
}

function Generate-SearchReference {
    $output = @()
    $output += "## Quick Search Reference"
    $output += ""
    $output += "| Looking for... | Check these files |"
    $output += "|----------------|-------------------|"

    $categories = @{
        "User data" = @("user", "User")
        "API endpoints" = @("route", "api", "controller")
        "Auth logic" = @("auth", "login", "session")
        "Config" = @("config", "settings", ".env")
        "Database" = @("model", "schema", "migration")
        "Tests" = @("test", "spec", "__tests__")
        "Utils" = @("util", "helper", "lib")
    }

    foreach ($category in $categories.Keys) {
        $patterns = $categories[$category]
        $foundFiles = @()

        foreach ($pattern in $patterns) {
            $files = Get-FilteredItems -Path "." -Depth 3 | Where-Object { $_.Name -match $pattern -or $_.DirectoryName -match $pattern }
            foreach ($file in $files | Select-Object -First 2) {
                $relativePath = $file.FullName.Replace($PWD.Path, ".").Replace("\", "/")
                if (-not ($foundFiles -contains $relativePath)) {
                    $foundFiles += $relativePath
                }
            }
        }

        if ($foundFiles.Count -gt 0) {
            $filesStr = ($foundFiles | Select-Object -First 3) -join ", "
            $output += "| $category | ``$filesStr`` |"
        }
    }

    $output += ""

    return $output -join "`n"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

function Main {
    param ([string]$Command = "generate")

    switch ($Command) {
        "generate" {
            Write-Host "Exploring codebase..."

            # Create .ctoc directory if it doesn't exist
            if (-not (Test-Path ".ctoc")) {
                New-Item -ItemType Directory -Path ".ctoc" -Force | Out-Null
            }

            $content = @()
            $content += "# Project Map"
            $content += ""
            $content += "> Auto-generated during ctoc init. Quick reference for implementation."
            $content += ""

            $content += Generate-Tree
            $content += Analyze-KeyFiles
            $content += Detect-Patterns
            $content += Generate-SearchReference

            $content += "---"
            $content += ""
            $content += "*Generated by CTOC Codebase Explorer*"

            $content -join "`n" | Out-File -FilePath $OutputFile -Encoding UTF8

            Write-Host "Generated: $OutputFile"
        }

        { $_ -in "help", "--help", "-h" } {
            Write-Host "CTOC Codebase Explorer"
            Write-Host ""
            Write-Host "Usage: explore-codebase.ps1 [command]"
            Write-Host ""
            Write-Host "Commands:"
            Write-Host "  generate    Generate PROJECT_MAP.md (default)"
            Write-Host "  help        Show this help"
        }

        default {
            Write-Host "Unknown command: $Command"
            Write-Host "Run 'explore-codebase.ps1 help' for usage."
            exit 1
        }
    }
}

# Run main with command line arguments
Main @args
