# {Agent Name}

---
name: {agent-name}
description: {One-line description of what the agent does}
tools: {Comma-separated list: Read, Write, Edit, Grep, Glob, Bash}
model: {opus|sonnet}
---

## Role

{2-3 sentences describing the agent's identity and expertise.
Include years of experience and areas of specialization.
State the core responsibility clearly.}

## Scope

### What This Agent Checks

{Bullet list of specific items this agent is responsible for checking.
Be exhaustive - cover ALL areas within scope.}

- {Check 1: specific description}
- {Check 2: specific description}
- {Check 3: specific description}

### Languages/Frameworks Supported

| Language | Frameworks | Tools Used |
|----------|------------|------------|
| {lang1} | {framework1, framework2} | {tool1, tool2} |
| {lang2} | {framework1} | {tool1} |

## Detection Methods

### {Detection Category 1}

**Method**: {How to detect - be specific}

```{language}
# Command or regex pattern
{exact command or pattern to use}
```

**Thresholds**:
- {metric1}: {exact number} (e.g., "max 50 lines per function")
- {metric2}: {exact number}

**Example (Bad)**:
```{language}
{code that would trigger this detection}
```

**Example (Good)**:
```{language}
{code that passes this check}
```

### {Detection Category 2}

{Repeat the same structure for each detection category}

## Anti-Scope (What This Agent Does NOT Check)

{Explicit list of what this agent defers to other agents.
This prevents overlap and ensures clear boundaries.}

- **{Check type}**: Deferred to `{other-agent-name}` because {reason}
- **{Check type}**: Deferred to `{other-agent-name}` because {reason}

## Output Format (MANDATORY)

```yaml
findings:
  - type: "{finding type from scope}"
    severity: "{critical|high|medium|low}"
    location:
      file: "{file path}"
      line: {line number}
      column: {column number, optional}
    message: "{clear, actionable description}"
    confidence: "{HIGH|MEDIUM|LOW}"
    context:
      code_snippet: |
        {relevant code}
      suggestion: |
        {how to fix}
    cwe: "{CWE-XXX if applicable}"
    tags: ["{tag1}", "{tag2}"]

self_assessment:
  coverage: "{percentage or description of code covered}"
  confidence: "{HIGH|MEDIUM|LOW}"
  limitations:
    - "{limitation 1}"
    - "{limitation 2}"
  false_positive_risk: "{LOW|MEDIUM|HIGH}"

escalation:
  to_agent: "{agent-name or null}"
  reason: "{why escalation needed or null}"
  findings_for_review: []

metadata:
  agent: "{this agent name}"
  version: "1.0"
  execution_time: "{duration}"
  files_analyzed: {count}
```

## Severity Classification

| Severity | Criteria | Example |
|----------|----------|---------|
| critical | {specific criteria} | {example} |
| high | {specific criteria} | {example} |
| medium | {specific criteria} | {example} |
| low | {specific criteria} | {example} |

## Confidence Scoring

- **HIGH**: {criteria for high confidence}
- **MEDIUM**: {criteria for medium confidence}
- **LOW**: {criteria for low confidence}

## Escalation Rules

Escalate to `{other-agent}` when:
- {condition 1}
- {condition 2}

Escalate to CTO Chief when:
- {condition requiring human review}

## Edge Cases

### {Edge Case 1}

**Scenario**: {description}
**Handling**: {how the agent handles this}

### {Edge Case 2}

**Scenario**: {description}
**Handling**: {how the agent handles this}

## Configuration

```yaml
# .ctoc/settings.yaml
{agent-name}:
  enabled: true
  thresholds:
    {threshold1}: {value}
    {threshold2}: {value}
  ignore_patterns:
    - "{pattern1}"
    - "{pattern2}"
```

## Integration

### CTO Chief Dispatch

This agent is dispatched by CTO Chief when:
- {trigger 1}
- {trigger 2}

### Related Agents

| Agent | Relationship |
|-------|--------------|
| `{agent1}` | {how they interact} |
| `{agent2}` | {how they interact} |

## Examples

### Example 1: {Scenario Name}

**Input**:
```{language}
{input code}
```

**Output**:
```yaml
findings:
  - type: "{type}"
    severity: "{severity}"
    message: "{message}"
```

### Example 2: {Scenario Name}

{Repeat structure}

## Known Limitations

- {Limitation 1}: {description and workaround if any}
- {Limitation 2}: {description and workaround if any}

---

## Template Notes (Remove Before Use)

1. Replace all `{placeholders}` with actual values
2. Remove any sections that don't apply
3. Add sections specific to this agent's domain
4. Ensure all examples are tested and accurate
5. Verify anti-scope doesn't overlap with other agents
6. Test output format with actual inputs
