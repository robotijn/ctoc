# detect

Auto-detect project characteristics and suggest the appropriate quality mode.

## Usage

```bash
ctoc detect [action] [options]
```

## Actions

### detect (default)

Full project analysis with mode suggestion.

```bash
ctoc detect
```

Analyzes:
- Languages and frameworks
- Codebase size and structure
- Current quality metrics
- Testing setup
- Linting configuration
- Security posture
- Architecture patterns
- Technical debt

Outputs:
- Quality score (0-100)
- Recommended quality mode
- Evidence supporting the recommendation
- Quick wins for improvement

### detect quality

Quality score analysis only.

```bash
ctoc detect quality
```

Returns:
- Overall quality score
- Component breakdown scores
- Coverage percentage
- Technical debt assessment

### detect mode

Mode suggestion only (faster than full analysis).

```bash
ctoc detect mode
```

Returns:
- Recommended mode (strict/strictest/legacy)
- Confidence level
- Alternative mode
- Supporting evidence
- Prioritized fixes

### detect upgrade

Generate upgrade roadmap between quality modes.

```bash
ctoc detect upgrade
ctoc detect upgrade --plan
ctoc detect upgrade --team-size 3
```

Returns:
- Upgrade phases with tasks
- Time estimates
- Quick wins
- Potential blockers
- Success criteria

### detect fix

Show and optionally apply automatic fixes.

```bash
# Show available fixes
ctoc detect fix

# Apply safe and low-risk fixes
ctoc detect fix --fix

# Preview changes without applying
ctoc detect fix --fix --dry-run

# Include medium-risk fixes
ctoc detect fix --fix --risk medium
```

## Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--verbose` | Verbose output with details |
| `--plan` | Include detailed upgrade plan |
| `--team-size N` | Team size for effort estimates (default: 1) |
| `--fix` | Apply auto-fixes |
| `--dry-run` | Preview fixes without applying |
| `--risk LEVEL` | Max risk level: safe, low, medium, high (default: low) |

## Quality Modes

### Strict (Default for New Projects)

- 80% coverage required
- Zero lint errors
- Zero critical/high security vulnerabilities
- Complexity limits enforced (cyclomatic <= 10)

### Strictest (High-Stakes Projects)

- 90% coverage required
- Zero lint errors AND warnings
- No `any` types (TypeScript)
- Complexity <= 7
- 100% documentation coverage
- Architecture enforcement

### Legacy (Existing Codebases)

- 50% coverage baseline
- Baseline existing lint errors
- Focus on new code quality
- Gradual improvement path

## Detection Heuristics

### Suggests Strict When

- New project (< 6 months, based on git history)
- Already has > 70% coverage
- Has linter configured
- Has CI/CD pipeline
- Uses modern tooling

### Suggests Strictest When

- Financial domain (payment, transaction, banking)
- Healthcare domain (patient, medical, HIPAA)
- Security domain (auth, crypto, password)
- Already meets strict requirements
- Has architecture enforcement

### Suggests Legacy When

- No tests or < 30% coverage
- No linter configuration
- Large codebase with minimal quality tooling
- Dormant/abandoned project

## Examples

```bash
# Full analysis
ctoc detect

# Quick mode check
ctoc detect mode

# Generate upgrade plan for 3-person team
ctoc detect upgrade --team-size 3 --plan

# See available auto-fixes
ctoc detect fix

# Apply auto-fixes (dry run first)
ctoc detect fix --fix --dry-run
ctoc detect fix --fix

# JSON output for scripting
ctoc detect --json | jq '.suggestion.recommended'
```

## Auto-Fix Categories

| Category | Risk | Examples |
|----------|------|----------|
| Config | Safe | Add .editorconfig, .gitignore entries |
| Formatting | Low | Prettier format, gofmt |
| Linting | Low | ESLint --fix, Ruff --fix |
| Dependencies | Medium | Update patch versions |
| TypeScript | Medium | Enable strict mode |

## Accuracy

Detection accuracy targets:

- Language detection: > 99%
- Framework detection: > 95%
- Mode suggestion: > 90%
- Domain detection: > 85%

False positive mitigations:
- Excludes node_modules, vendor, generated code
- Requires confidence thresholds for suggestions
- Multiple signals required for strictest recommendation

## Output Format

### Quality Score Interpretation

| Score | Meaning |
|-------|---------|
| 90-100 | Excellent - ready for strictest |
| 70-89 | Good - meets strict requirements |
| 50-69 | Moderate - needs improvement |
| 30-49 | Poor - significant work needed |
| 0-29 | Critical - major quality investment required |

### Confidence Levels

| Level | Meaning |
|-------|---------|
| High | Strong signals, high certainty |
| Medium | Good signals, some uncertainty |
| Low | Weak signals, consider alternatives |

## See Also

- `ctoc quality` - Quality configuration management
- `ctoc quality init` - Initialize quality mode
- [Quality Modes](../skills/modes.md) - Mode definitions
- [Upgrade Paths](../skills/upgrade-paths.md) - Upgrade strategies
