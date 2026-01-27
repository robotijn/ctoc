# CTOC Operations System

> Claude-powered agents replacing traditional bash scripts

---

## Overview

CTOC Operations are intelligent agents that replace traditional bash scripts with Claude-powered reasoning. Instead of pattern-matching and grep-based detection, operations provide genuine semantic understanding of codebases, commits, and workflows.

**The key insight:** Bash scripts are deterministic but shallow. Claude agents are intelligent but need guardrails. Operations combine both - Claude for reasoning, bash for execution.

```
Traditional:                    CTOC Operations:
┌──────────────┐               ┌──────────────┐
│  detect.sh   │               │  understand  │
│  grep *.py   │      →        │  agent       │
│  → "Python"  │               │  → semantic  │
└──────────────┘               │    analysis  │
                               └──────────────┘
```

---

## Core Principles

### 1. Never Block Humans

Operations advise and inform - they never prevent action. Users can always override with `--force`. The system empowers rather than gatekeeps.

```yaml
# Operations provide recommendations, not blocks
recommendation: "Consider splitting this commit"
proceed: true  # Always allow user to continue
```

### 2. Online-First Design

Operations leverage Claude's knowledge and web search capabilities. They research current best practices rather than relying on outdated static rules.

### 3. Quality Over Speed

A 500ms delay for genuine insight is preferable to instant shallow detection. Operations take time to understand deeply before responding.

### 4. Self-Improvement

Every operation can learn from its interactions. When encountering new patterns:
1. Research using WebSearch
2. Run self-critique loops
3. Propose learnings for review
4. Log the learning journey

### 5. The Determinism Rule

**Claude reasons, bash executes.**

Operations analyze and decide, but deterministic actions (git commits, file writes) are delegated to bash scripts. This ensures reproducibility and auditability.

```
┌─────────────────┐     ┌─────────────────┐
│   git-advisor   │────>│  git-atomic.sh  │
│   (reasoning)   │     │  (execution)    │
└─────────────────┘     └─────────────────┘
```

---

## Directory Structure

```
.ctoc/operations/
├── README.md              # This file
│
├── core/                  # Core operations (always available)
│   ├── understand.md      # Semantic codebase understanding
│   ├── plan-advisor.md    # Plan lifecycle management
│   └── git-advisor.md     # Git workflow assistance
│
├── setup/                 # Project initialization operations
│   └── (project-setup)    # Initial project configuration
│
└── workflow/              # Development workflow operations
    ├── (issue-processor)  # GitHub issue processing
    └── (progress-insights)# Progress tracking and insights
```

---

## Operation Agents

### Core Operations

| Agent | Purpose | Replaces |
|-------|---------|----------|
| **understand** | Semantic codebase analysis - identifies patterns, architecture, and potential issues | `detect.sh`, `explore-codebase.sh` |
| **plan-advisor** | Intelligent plan lifecycle guidance - assesses quality, identifies risks, customizes Iron Loop | `plan.sh` (reasoning portions) |
| **git-advisor** | Git workflow assistance - contextual secrets detection, commit quality analysis | `git-workflow.sh` (quality analysis) |

### Setup Operations

| Agent | Purpose | Replaces |
|-------|---------|----------|
| **project-setup** | Initial project configuration and scaffolding | `init.sh`, `setup.sh` |

### Workflow Operations

| Agent | Purpose | Replaces |
|-------|---------|----------|
| **issue-processor** | Process GitHub issues for skill improvements | `process-issues.sh` |
| **progress-insights** | Track and visualize Iron Loop progress | `progress.sh` |

---

## How Operations Are Invoked

Operations are invoked through CTOC commands, which route to the appropriate agent:

```bash
# Codebase understanding
ctoc detect              # → understand agent

# Plan management
ctoc plan new "title"    # → plan-advisor agent
ctoc plan propose 001    # → plan-advisor agent
ctoc plan start 001      # → plan-advisor agent

# Git workflow
ctoc commit "message"    # → git-advisor agent
ctoc sync                # → git-advisor agent

# Issue processing
ctoc process-issues      # → issue-processor agent

# Progress tracking
ctoc progress            # → progress-insights agent
```

### Invocation Flow

```
User Command
     │
     ▼
┌─────────────┐
│   ctoc.sh   │  (thin orchestrator)
└─────────────┘
     │
     ▼
┌─────────────┐     ┌─────────────────┐
│  Operation  │────>│  Bash Fallback  │
│   Agent     │     │  (if needed)    │
└─────────────┘     └─────────────────┘
     │
     ▼
   Output
```

---

## Cache System

Operations cache their outputs to avoid redundant computation. The cache lives in `.ctoc/cache/`.

### Cache Configuration

Each operation defines its cache behavior in metadata:

```yaml
cache:
  output: cache/understanding.yaml  # Where to store output
  ttl: 1h                           # Time-to-live
  invalidate_on:                    # File patterns that invalidate cache
    - "*.py"
    - "*.ts"
    - "package.json"
    - "pyproject.toml"
```

### Cache Lifecycle

1. **Check:** Before running, check if valid cache exists
2. **Use:** If valid, return cached result immediately
3. **Invalidate:** If source files changed, invalidate cache
4. **Regenerate:** Run operation and cache new result

### Cache Files

| File | Source Agent | Contains |
|------|--------------|----------|
| `understanding.yaml` | understand | Codebase analysis results |
| `plan-assessments/` | plan-advisor | Plan quality assessments |

---

## Self-Improvement System

Operations can learn from their interactions and improve over time.

### How It Works

1. **Encounter:** Agent encounters an unrecognized pattern
2. **Research:** Uses WebSearch to find authoritative information
3. **Validate:** Confirms understanding against multiple sources
4. **Critique:** Runs 5 self-critique loops questioning the understanding
5. **Propose:** Creates a learning proposal if confident
6. **Log:** Records in learning log for audit trail

### Self-Critique Loops

Each operation runs 5 critique loops before proposing learnings:

```
Loop 1: "Is this generalizable?"
Loop 2: "Is confidence justified?"
Loop 3: "What counter-evidence exists?"
Loop 4: "What am I missing?"
Loop 5: "Is this actionable?"
```

### Learning Proposal Format

```yaml
# .ctoc/learnings/2026-01-27-001.yaml
id: 2026-01-27-001
type: pattern_detection
source_agent: understand

learning:
  pattern: temporal_workflow
  detection:
    files: ["**/workflows/*.py", "**/activities/*.py"]
    imports: ["temporalio"]
  insight: "Temporal.io durable workflow orchestration"

confidence:
  initial: 0.87
  after_self_critique: 0.94
```

### Rate Limiting

To prevent runaway self-improvement:

```yaml
self_improvement:
  enabled: true
  critique_loops: 5
  rate_limit: 5/hour  # Max 5 learning proposals per hour
```

---

## Adding New Operations

### 1. Create the Operation File

Create a new `.md` file in the appropriate directory:

```
.ctoc/operations/
├── core/          # Always-available operations
├── setup/         # Project initialization
└── workflow/      # Development workflow
```

### 2. Define Metadata

Every operation must have a metadata block:

```yaml
# operation-name.md
---

## Metadata

```yaml
id: operation-name
version: 1.0.0
model_tier: moderate|complex    # Claude model to use
category: core|setup|workflow
tools: [Read, Grep, Glob, ...]  # Available tools
depends_on: [other-operation]   # Dependencies
replaces: [old-script.sh]       # Scripts this replaces
bash_fallback: script.sh        # Deterministic fallback

cache:
  output: cache/output.yaml
  ttl: 1h
  invalidate_on: ["*.py"]

self_improvement:
  enabled: true
  critique_loops: 5
  rate_limit: 5/hour
```

### 3. Define Identity

Clearly state the agent's purpose and personality:

```markdown
## Identity

You are the `operation-name` agent for CTOC. Your purpose is...

You embody [persona description].
```

### 4. Define Capabilities

List what the operation can do:

```markdown
## Capabilities

### 1. Capability Name

Description with examples showing OLD vs NEW approach.
```

### 5. Define Constraints

Specify what the operation must never do:

```markdown
## Constraints

### NEVER Block Humans
...

### Deterministic Execution
...
```

### 6. Define Output Format

Specify the YAML structure for outputs:

```markdown
## Output Format

```yaml
analysis:
  field: value
  ...
```

### 7. Register the Operation

Add the operation to `.ctoc/operations-registry.yaml`:

```yaml
operations:
  - id: operation-name
    path: workflow/operation-name.md
    commands:
      - ctoc command-name
```

---

## Model Tiers

Operations specify which Claude model tier to use:

| Tier | Use Case | Example Operations |
|------|----------|-------------------|
| **moderate** | Standard analysis, pattern matching | git-advisor |
| **complex** | Deep reasoning, architecture analysis | understand, plan-advisor |

---

## Best Practices

### For Operation Authors

1. **Start with Identity:** Clearly define who the agent is
2. **Show, Don't Tell:** Use OLD vs NEW examples
3. **Be Specific:** Provide concrete output formats
4. **Enable Learning:** Configure self-improvement appropriately
5. **Respect Determinism:** Delegate execution to bash

### For Operation Users

1. **Trust the Cache:** Let the cache do its job
2. **Use Force Wisely:** Override recommendations only when needed
3. **Check Learnings:** Review proposed learnings periodically
4. **Report Issues:** Help operations improve through feedback

---

## Related Documentation

- [CTOC README](/README.md) - Main documentation
- [Iron Loop](/templates/IRON_LOOP.md.template) - Development methodology
- [Skills System](/skills/README.md) - Language and framework profiles
