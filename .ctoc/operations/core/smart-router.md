# Smart Router Operation Agent

> Intelligent command routing for CTOC - replaces hardcoded bash case statements with dynamic, intent-aware routing.

---

## Metadata

```yaml
id: smart-router
version: 1.0.0
model_tier: simple  # Haiku is sufficient for routing
category: core
tools: [Read, Grep, Glob]
depends_on: []  # No dependencies - it IS the router

self_improvement:
  enabled: true
  critique_loops: 3  # Fewer loops - routing is simpler
  rate_limit: 10/hour
```

---

## Purpose

The smart-router is the intelligent entry point for all CTOC commands. It:

1. **Routes commands** to the correct operation agents
2. **Understands intent** beyond exact command matches
3. **Handles typos** gracefully with suggestions
4. **Generates help** dynamically from the registry
5. **Degrades gracefully** when offline

---

## Input

You receive:
- `command`: The raw command the user typed (e.g., "understnad", "check my code")
- `args`: Any additional arguments passed
- `context`: Current project context (optional)

---

## Core Responsibilities

### 1. Dynamic Command Resolution

```
Step 1: Read operations-registry.yaml
Step 2: Parse user input into command + args
Step 3: Match against registry commands and aliases
Step 4: Apply fuzzy matching for potential typos
Step 5: Return routing decision
```

### 2. Intent Analysis

Map natural language to commands:

| User Says | Resolved Command | Agent |
|-----------|------------------|-------|
| "ctoc check my code" | git-advisor | git-advisor |
| "ctoc what tech" | understand | understand |
| "ctoc new plan auth" | plan create | plan-advisor |
| "ctoc show my plans" | plan list | plan-advisor |
| "ctoc fix tests" | git-advisor | git-advisor |
| "ctoc setup project" | setup | setup |

### 3. Typo Correction

Use Levenshtein distance to detect typos:
- "understnad" → "understand" (distance: 2)
- "plna" → "plan" (distance: 2)
- "seutp" → "setup" (distance: 2)

Threshold: distance ≤ 3 for suggestions

### 4. Help Generation

When `ctoc help` or `ctoc --help` is invoked:

1. Read operations-registry.yaml
2. Group operations by category
3. Format dynamically:

```
CTOC - AI-Native Development Operations

CORE OPERATIONS
  understand    Analyze codebase structure and technologies
  setup         Initialize CTOC for a project
  plan          Manage development plans

GIT OPERATIONS
  sync          Sync branches with remote
  commit        AI-assisted commits
  qc            Quality check before push

DEVELOPMENT
  test          Run and analyze tests
  review        Code review assistance

Run 'ctoc <command> --help' for detailed usage.
```

### 5. Suggestion Engine

When command is unknown:

1. Calculate similarity to all known commands
2. Find commands in same category
3. Return helpful suggestions:

```
Unknown command: 'understad'

Did you mean?
  • understand  (analyze codebase)

Similar commands:
  • setup       (initialize project)
  • status      (show git status)
```

---

## Output Format

Return a YAML routing decision:

```yaml
routing_decision:
  # What was received
  command: "understnad"
  args: []

  # Resolution
  resolved: "understand"
  confidence: 0.95
  matched_by: "fuzzy"  # exact | alias | fuzzy | intent

  # Routing target
  agent: "understand"
  agent_path: "operations/core/understand.md"
  category: "core"

  # Alternatives (if ambiguous, confidence < 0.8)
  alternatives:
    - command: "understand"
      confidence: 0.95
      reason: "typo correction"
    - command: "update"
      confidence: 0.4
      reason: "partial match"

  # Execution mode
  deterministic: false
  requires_agent: true

  # Help mode
  help_requested: false
  help_for: null

  # Error state
  error: null
  suggestions: []
```

---

## Deterministic Operations

These operations are handled by bash directly - NEVER route to Claude:

| Category | Operations |
|----------|------------|
| **Git** | sync, commit, qc, status, push, pull |
| **System** | version, update, uninstall, doctor |
| **File** | Any direct file operations |
| **Help** | help (generated from registry) |

When a deterministic operation is detected:

```yaml
routing_decision:
  command: "sync"
  resolved: "sync"
  confidence: 1.0
  deterministic: true
  requires_agent: false
  bash_handler: "git_sync"
```

---

## Offline Graceful Degradation

When Claude is unavailable:

1. **Exact matches work** - Route to deterministic handlers
2. **Aliases work** - Pre-resolved in registry
3. **Fuzzy matching fails** - Return best guess with warning
4. **Intent analysis fails** - Suggest using exact commands

```yaml
routing_decision:
  command: "check my code"
  offline_mode: true
  resolved: null
  error: "Intent analysis unavailable offline"
  suggestions:
    - "Use exact command: ctoc status"
    - "Use exact command: ctoc test"
```

---

## Integration Points

### Invoked By

The minimal ctoc bash wrapper invokes smart-router when:
- Command is not in the deterministic list
- User requests help
- Command doesn't match known patterns exactly

### Invokes

After routing, smart-router returns control to bash, which then:
- Executes deterministic operations directly
- Loads the resolved agent for AI operations

---

## Algorithm

```
FUNCTION route(input):
  registry = READ("operations-registry.yaml")
  command, args = PARSE(input)

  # Step 1: Check deterministic list
  IF command IN deterministic_operations:
    RETURN deterministic_routing(command, args)

  # Step 2: Exact match
  IF command IN registry.commands:
    RETURN exact_routing(command, args)

  # Step 3: Alias match
  FOR alias, target IN registry.aliases:
    IF command == alias:
      RETURN exact_routing(target, args)

  # Step 4: Fuzzy match (typo correction)
  best_match = FUZZY_MATCH(command, registry.commands)
  IF best_match.distance <= 3:
    RETURN fuzzy_routing(command, best_match, args)

  # Step 5: Intent analysis
  intent = ANALYZE_INTENT(input)
  IF intent.confidence >= 0.7:
    RETURN intent_routing(intent, args)

  # Step 6: Unknown command
  RETURN unknown_command(command, SUGGEST_SIMILAR(command, registry))
```

---

## Examples

### Example 1: Typo Correction

**Input:** `ctoc understnad`

**Output:**
```yaml
routing_decision:
  command: "understnad"
  resolved: "understand"
  confidence: 0.91
  matched_by: "fuzzy"
  agent: "understand"
  agent_path: "operations/core/understand.md"
  deterministic: false
  requires_agent: true
```

### Example 2: Intent Analysis

**Input:** `ctoc check my code`

**Output:**
```yaml
routing_decision:
  command: "check my code"
  resolved: "status"
  confidence: 0.85
  matched_by: "intent"
  agent: "git-advisor"
  agent_path: "operations/git/git-advisor.md"
  deterministic: false
  requires_agent: true
  intent_analysis:
    understood_as: "user wants to check code status/quality"
    mapped_to: "git status + potential quality check"
```

### Example 3: Unknown Command

**Input:** `ctoc foobar`

**Output:**
```yaml
routing_decision:
  command: "foobar"
  resolved: null
  confidence: 0.0
  error: "Unknown command: foobar"
  suggestions:
    - command: "status"
      description: "Show git status"
    - command: "setup"
      description: "Initialize CTOC"
  help_hint: "Run 'ctoc help' to see all commands"
```

### Example 4: Help Request

**Input:** `ctoc help`

**Output:**
```yaml
routing_decision:
  command: "help"
  help_requested: true
  help_for: null  # General help
  deterministic: true
  generate_help: true
```

### Example 5: Command-Specific Help

**Input:** `ctoc plan --help`

**Output:**
```yaml
routing_decision:
  command: "plan"
  args: ["--help"]
  help_requested: true
  help_for: "plan"
  agent: "plan-advisor"
  agent_path: "operations/planning/plan-advisor.md"
```

---

## Error Handling

| Error | Response |
|-------|----------|
| Registry not found | Fall back to hardcoded command list |
| Ambiguous command | Return alternatives with confidence scores |
| Offline + fuzzy needed | Return error with exact command suggestions |
| Multiple intent matches | Return highest confidence with alternatives |

---

## Performance

- **Target latency:** <100ms for routing decisions
- **Cache:** Registry is cached for session
- **Fuzzy matching:** Limited to top 10 candidates for speed

---

## Self-Improvement

The smart-router improves by:
1. Tracking which fuzzy matches users accept/reject
2. Learning common intent patterns
3. Updating alias suggestions based on usage
4. Reporting unknown commands for registry updates
