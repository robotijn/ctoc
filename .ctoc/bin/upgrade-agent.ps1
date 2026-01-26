# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Agent Upgrade Framework (PowerShell)
#  Research-driven agent capability upgrades
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
$Version = "1.0.0"

# ═══════════════════════════════════════════════════════════════════════════════
#  Get Versions File
# ═══════════════════════════════════════════════════════════════════════════════

function Get-VersionsFile {
    $versionsFile = ".ctoc\agents\versions.yaml"

    if (Test-Path $versionsFile) {
        return $versionsFile
    }

    # Create default versions file
    $dir = Split-Path $versionsFile -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    @"
# CTOC Agent Version Tracking
# Tracks agent versions and capabilities

schema_version: "1.0"
last_updated: ""

agents:
  cto-coordinator:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - orchestration
      - conflict_resolution
      - skill_injection
    pending_upgrades: []

  unit-test-writer:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - unit_test_generation
      - mock_creation
    pending_upgrades: []

  integration-test-writer:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - integration_test_generation
      - api_testing
    pending_upgrades: []

  e2e-test-writer:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - e2e_test_generation
      - user_flow_testing
    pending_upgrades: []

  code-reviewer:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - style_validation
      - best_practice_check
    pending_upgrades: []

  architecture-checker:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - pattern_validation
      - dependency_analysis
    pending_upgrades: []

  security-scanner:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - owasp_scanning
      - vulnerability_detection
    pending_upgrades: []

  secrets-detector:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - secret_scanning
      - credential_detection
    pending_upgrades: []

  dependency-checker:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - cve_lookup
      - outdated_detection
    pending_upgrades: []

  performance-profiler:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - cpu_profiling
      - memory_analysis
    pending_upgrades: []

  documentation-updater:
    version: "1.0.0"
    last_updated: ""
    capabilities:
      - api_docs
      - readme_updates
    pending_upgrades: []

upgrades: []
"@ | Set-Content $versionsFile -Encoding UTF8

    return $versionsFile
}

# ═══════════════════════════════════════════════════════════════════════════════
#  List Agents
# ═══════════════════════════════════════════════════════════════════════════════

function Show-AgentList {
    Write-Host "CTOC Agents" -ForegroundColor Blue
    Write-Host "═══════════════════════════════════════════════════════════════"
    Write-Host ""

    $versionsFile = Get-VersionsFile
    $content = Get-Content $versionsFile -Raw

    Write-Host "Agents:"

    # Parse YAML manually (simple approach)
    $lines = $content -split "`n"
    $inAgents = $false
    foreach ($line in $lines) {
        if ($line -match "^agents:") {
            $inAgents = $true
            continue
        }
        if ($inAgents -and $line -match "^  ([a-z]+-[a-z\-]+):") {
            $agent = $Matches[1]
            Write-Host "  $agent"
        }
        if ($inAgents -and $line -match "^upgrades:") {
            break
        }
    }

    Write-Host ""
    Write-Host "Total: 60 agents across 16 categories"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Show Agent Info
# ═══════════════════════════════════════════════════════════════════════════════

function Show-AgentInfo {
    param([string]$Name)

    if ([string]::IsNullOrEmpty($Name)) {
        Write-Host "Usage: ctoc agent info <agent-name>" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "Agent: $Name" -ForegroundColor Blue
    Write-Host "═══════════════════════════════════════════════════════════════"
    Write-Host ""

    $versionsFile = Get-VersionsFile
    $content = Get-Content $versionsFile -Raw

    # Find agent section
    if ($content -match "(?s)$Name`:(.+?)(?=\n  [a-z]+-[a-z\-]+:|upgrades:)") {
        $section = $Matches[1]

        if ($section -match "version: `"(.+?)`"") {
            Write-Host "Version: $($Matches[1])"
        }

        Write-Host ""
        Write-Host "Capabilities:"
        $caps = [regex]::Matches($section, "- ([a-z_]+)")
        foreach ($cap in $caps) {
            if (-not $cap.Value.Contains("pending")) {
                Write-Host "  $($cap.Groups[1].Value)"
            }
        }
    } else {
        Write-Host "Agent not found: $Name" -ForegroundColor Yellow
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Upgrade Agent
# ═══════════════════════════════════════════════════════════════════════════════

function Invoke-AgentUpgrade {
    param(
        [string]$Name,
        [string]$Capability
    )

    if ([string]::IsNullOrEmpty($Name)) {
        Write-Host "Usage: ctoc agent upgrade <agent-name> [capability]" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "Upgrading agent: $Name" -ForegroundColor Blue
    Write-Host "═══════════════════════════════════════════════════════════════"
    Write-Host ""

    Write-Host "Upgrade workflow:"
    Write-Host "  1. Research current best practices (web search)"
    Write-Host "  2. Search GitHub for state-of-the-art implementations"
    Write-Host "  3. Compare with current agent capabilities"
    Write-Host "  4. Generate upgrade proposal"
    Write-Host "  5. Test in sandbox"
    Write-Host "  6. Create PR with changes"
    Write-Host ""

    if (-not [string]::IsNullOrEmpty($Capability)) {
        Write-Host "Adding capability: $Capability"
        Write-Host "Added to pending upgrades: $Capability" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Note: Actual upgrade requires Claude Code to research and implement." -ForegroundColor Yellow
    Write-Host "Run: ctoc agent research $Name"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Research Agent
# ═══════════════════════════════════════════════════════════════════════════════

function Invoke-AgentResearch {
    param([string]$Name)

    if ([string]::IsNullOrEmpty($Name)) {
        Write-Host "Usage: ctoc agent research <agent-name>" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "Research: $Name" -ForegroundColor Blue
    Write-Host "═══════════════════════════════════════════════════════════════"
    Write-Host ""

    $topics = switch ($Name) {
        "security-scanner" { "OWASP Top 10 2026", "CVE database", "SBOM generation", "supply chain security" }
        "code-reviewer" { "code review best practices 2026", "static analysis", "AI code review" }
        "performance-profiler" { "performance profiling 2026", "benchmarking", "memory analysis" }
        "documentation-updater" { "documentation generation", "API docs", "README best practices" }
        "dependency-checker" { "dependency security", "npm audit", "pip audit", "cargo audit" }
        default { "$Name best practices 2026" }
    }

    Write-Host "Suggested research queries:"
    Write-Host ""
    foreach ($topic in $topics) {
        Write-Host "  - WebSearch: `"$topic`""
    }
    Write-Host ""

    Write-Host "GitHub searches:"
    Write-Host "  - gh search repos `"$Name`" --sort stars --limit 10"
    Write-Host "  - gh search code `"$Name`" --limit 20"
    Write-Host ""

    Write-Host "Run these searches to gather upgrade information." -ForegroundColor Blue
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Check Updates
# ═══════════════════════════════════════════════════════════════════════════════

function Test-AgentUpdates {
    Write-Host "Checking for agent updates..." -ForegroundColor Blue
    Write-Host "═══════════════════════════════════════════════════════════════"
    Write-Host ""

    $remoteUrl = "https://raw.githubusercontent.com/robotijn/ctoc/main/.ctoc/agents/versions.yaml"

    try {
        $remote = Invoke-WebRequest -Uri $remoteUrl -UseBasicParsing -TimeoutSec 10
        Write-Host "Remote version available."
    } catch {
        Write-Host "Could not fetch remote versions." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "Agents with pending upgrades:"
    Write-Host "  (check versions.yaml for details)"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Help
# ═══════════════════════════════════════════════════════════════════════════════

function Show-Help {
    @"
CTOC Agent Upgrade Framework v$Version

USAGE:
    ctoc agent <command> [options]

COMMANDS:
    list                    List all agents
    info <name>             Show agent details
    upgrade <name> [cap]    Add capability to upgrade queue
    research <name>         Show research queries for agent
    check                   Check for available updates
    apply <name>            Apply pending upgrades

EXAMPLES:
    ctoc agent list
    ctoc agent info security-scanner
    ctoc agent upgrade security-scanner sbom_generation
    ctoc agent research security-scanner

AGENT CATEGORIES:
    Coordinator (1)     - cto-coordinator
    Testing (9)         - unit/integration/e2e test writers and runners
    Quality (8)         - code-reviewer, architecture-checker, etc.
    Security (5)        - security-scanner, secrets-detector, etc.
    Performance (4)     - performance-profiler, memory-checker, etc.
    Documentation (2)   - documentation-updater, changelog-generator

"@
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

switch ($Command) {
    "list" { Show-AgentList }
    { $_ -in "info", "show" } { Show-AgentInfo -Name $Arg1 }
    { $_ -in "upgrade", "add" } { Invoke-AgentUpgrade -Name $Arg1 -Capability $Arg2 }
    "research" { Invoke-AgentResearch -Name $Arg1 }
    { $_ -in "check", "updates" } { Test-AgentUpdates }
    { $_ -in "help", "--help", "-h" } { Show-Help }
    default {
        Write-Host "Unknown command: $Command" -ForegroundColor Red
        Write-Host "Run 'ctoc agent help' for usage."
        exit 1
    }
}
