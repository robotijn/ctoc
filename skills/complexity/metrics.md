# Complexity Metrics
> Precise formulas and measurement techniques for code complexity. Updated February 2026.

## Cyclomatic Complexity (McCabe, 1976)

### Definition
Measures the number of linearly independent paths through a program's source code.

### Formula
```
CC = E - N + 2P

Where:
- E = Number of edges in the control flow graph
- N = Number of nodes in the control flow graph
- P = Number of connected components (usually 1 for a single function)
```

### Simplified Counting Method
For most languages, count decision points and add 1:
```
CC = 1 + (if) + (elif/else if) + (for) + (while) + (case) + (catch) + (and) + (or) + (?)

Each of these adds 1:
- if statement
- elif/else if clause
- for loop
- while loop
- case in switch/match
- catch/except clause
- && or and operator
- || or or operator
- ternary ? operator
- null-coalescing ?? operator
```

### Interpretation
| CC Value | Risk Level | Testability |
|----------|-----------|-------------|
| 1-4 | Low | Easy to test |
| 5-7 | Moderate | Needs careful testing |
| 8-10 | High | Difficult to test |
| 11-20 | Very High | Test coverage becomes impractical |
| 21+ | Critical | Untestable, must refactor |

### Why It Matters
- **Test Cases**: Minimum CC tests needed for full branch coverage
- **Maintainability**: Higher CC = harder to understand and modify
- **Bug Correlation**: Studies show CC > 10 correlates with higher defect density

---

## Cognitive Complexity (SonarSource, 2017)

### Definition
Measures the mental effort required to understand code, penalizing nested structures more than sequential ones.

### Three Core Rules

**Rule 1: Increment for Breaks in Linear Flow**
```
+1 for each: if, else if, else, switch, for, while, do-while,
             catch, goto, break to label, continue to label,
             recursion, binary logical operators in conditions
```

**Rule 2: Increment for Nesting**
```
+1 additional for each level of nesting when:
- Control structures are nested inside other control structures
- Lambda/anonymous functions are nested
```

**Rule 3: No Penalty for Shorthand**
```
No increment for:
- Null-coalescing operators (??, ?:)
- Null-safe navigation (?.)
- Simple ternary when used for assignment
```

### Calculation Example
```python
def process_order(order):                      # +0 (method declaration)
    if order.is_valid():                       # +1 (if)
        for item in order.items:               # +1 (for) +1 (nesting=1)
            if item.in_stock():                # +1 (if) +2 (nesting=2)
                if item.quantity > 100:        # +1 (if) +3 (nesting=3)
                    apply_bulk_discount(item)
                else:                          # +1 (else)
                    process_standard(item)
            else:                              # +1 (else)
                backorder(item)
    else:                                      # +1 (else)
        reject_order(order)
                                               # Total: 13
```

### Key Difference from Cyclomatic
```python
# Same Cyclomatic (4), Different Cognitive

# Cognitive = 4 (sequential)
def sequential():
    if a: do_a()
    if b: do_b()
    if c: do_c()
    if d: do_d()

# Cognitive = 10 (nested, harder to understand)
def nested():
    if a:
        if b:
            if c:
                if d: do_abcd()
```

### Interpretation
| Cognitive | Assessment |
|-----------|------------|
| 0-8 | Low - easy to understand |
| 9-15 | Moderate - acceptable |
| 16-24 | High - should simplify |
| 25+ | Critical - must refactor |

---

## Lines of Code Metrics

### Types of LOC
| Metric | Definition | Use Case |
|--------|-----------|----------|
| **Physical LOC** | Total lines including blanks and comments | File size estimation |
| **Logical LOC** | Executable statements | Effort estimation |
| **Source LOC (SLOC)** | Non-blank, non-comment lines | Productivity metrics |
| **Effective LOC** | SLOC minus boilerplate | True code volume |

### Function Length Guidelines
| Strictness | Max Lines | Rationale |
|------------|-----------|-----------|
| Strict | 30 | Fits on one screen |
| Standard | 50 | One concept per function |
| Legacy | 100 | Practical limit for maintenance |

### File Length Guidelines
| Strictness | Max Lines | Rationale |
|------------|-----------|-----------|
| Strict | 300 | Single responsibility |
| Standard | 400 | Cohesive module |
| Legacy | 600 | Practical reading limit |

---

## Halstead Complexity Measures (1977)

### Primitives
```
n1 = number of distinct operators
n2 = number of distinct operands
N1 = total number of operators
N2 = total number of operands
```

### Derived Metrics
| Metric | Formula | Meaning |
|--------|---------|---------|
| **Vocabulary** | n = n1 + n2 | Unique elements used |
| **Length** | N = N1 + N2 | Total elements |
| **Volume** | V = N * log2(n) | Information content in bits |
| **Difficulty** | D = (n1/2) * (N2/n2) | Error proneness |
| **Effort** | E = D * V | Mental effort to understand |
| **Time** | T = E / 18 | Estimated seconds to understand |
| **Bugs** | B = V / 3000 | Estimated bug count |

### Example
```python
def area(h, w):     # operators: def, (, ), :, *, return = 6 distinct
    return h * w    # operands: h, w, area = 3 distinct
                    # N1=6, N2=4, n1=6, n2=3
                    # V = 10 * log2(9) = 31.7 bits
```

### Thresholds
| Volume | Maintainability |
|--------|-----------------|
| 0-100 | Simple function |
| 100-1000 | Module |
| 1000-8000 | Complex subsystem |
| 8000+ | Needs decomposition |

---

## Maintainability Index (MI)

### Original Formula (SEI, 1992)
```
MI = 171 - 5.2 * ln(avgV) - 0.23 * avgCC - 16.2 * ln(avgLOC)

Where:
- avgV = Average Halstead Volume per function
- avgCC = Average Cyclomatic Complexity per function
- avgLOC = Average Lines of Code per function
```

### Microsoft Visual Studio Formula
```
MI = max(0, (171 - 5.2 * ln(V) - 0.23 * CC - 16.2 * ln(LOC)) * 100 / 171)

Scaled to 0-100 range
```

### With Comments Factor
```
MI = 171 - 5.2*ln(V) - 0.23*CC - 16.2*ln(LOC) + 50*sin(sqrt(2.4*CM))

Where CM = percentage of comment lines
```

### Interpretation
| MI Score | Rating | Action |
|----------|--------|--------|
| 85-100 | Excellent | Highly maintainable |
| 65-84 | Good | Moderate maintainability |
| 40-64 | Fair | Difficult to maintain |
| 20-39 | Poor | Needs improvement |
| 0-19 | Critical | Must refactor |

---

## Object-Oriented Metrics

### Depth of Inheritance Tree (DIT)
```
DIT = Maximum length from class to root of hierarchy

Guidelines:
- DIT = 0-2: Good
- DIT = 3-4: Acceptable
- DIT = 5+: Consider composition over inheritance
```

### Coupling Between Objects (CBO)
```
CBO = Number of classes a class is coupled to

Guidelines:
- CBO = 0-4: Low coupling, good
- CBO = 5-8: Moderate coupling
- CBO = 9+: High coupling, refactor
```

### Lack of Cohesion in Methods (LCOM)
```
LCOM = |P| - |Q| if |P| > |Q|, else 0

Where:
- P = pairs of methods that don't share instance variables
- Q = pairs of methods that share instance variables

Interpretation:
- LCOM = 0: Cohesive class
- LCOM > 0: Class may have multiple responsibilities
- High LCOM: Consider splitting the class
```

### Weighted Methods per Class (WMC)
```
WMC = Sum of cyclomatic complexity of all methods

Guidelines:
- WMC = 1-20: Good
- WMC = 21-50: Complex, review needed
- WMC = 50+: Too complex, split class
```

---

## Nesting Depth

### Definition
Maximum level of control structure nesting in a code block.

### Counting
```python
def example():                    # Depth 0
    if condition1:                # Depth 1
        for item in items:        # Depth 2
            if condition2:        # Depth 3
                while processing: # Depth 4
                    if error:     # Depth 5 <- Maximum
                        handle()
```

### Guidelines
| Depth | Assessment | Action |
|-------|------------|--------|
| 0-2 | Excellent | No action needed |
| 3 | Good | Acceptable for complex logic |
| 4 | Moderate | Consider extracting methods |
| 5+ | High | Must refactor |

---

## Parameter Count

### Definition
Number of parameters a function accepts.

### Guidelines
| Count | Assessment | Notes |
|-------|------------|-------|
| 0-2 | Ideal | Easy to call and test |
| 3 | Acceptable | Consider parameter object |
| 4 | Borderline | Use parameter object |
| 5+ | Excessive | Must refactor |

### Solutions for High Parameter Count
1. **Parameter Object**: Group related params into a class/struct
2. **Builder Pattern**: For optional parameters
3. **Method Chaining**: Fluent interface pattern
4. **Dependency Injection**: For service dependencies

---

## Composite Metrics

### Technical Debt Ratio
```
TDR = (Remediation Cost / Development Cost) * 100%

Where:
- Remediation Cost = Estimated time to fix all issues
- Development Cost = Estimated time to rebuild from scratch
```

### Code Health Score
```
Health = 100 - (Debt% * 0.4) - (Coverage Gap% * 0.3) - (Complexity Penalty * 0.3)

Where:
- Debt% = Technical debt ratio
- Coverage Gap% = 100 - Test coverage %
- Complexity Penalty = % of functions exceeding CC threshold
```

---

## Tool Reference

### Multi-Language
| Tool | Languages | Metrics |
|------|-----------|---------|
| SonarQube | 25+ | All metrics |
| CodeClimate | 10+ | CC, Cognitive, Duplication |
| Lizard | 20+ | CC, LOC, Parameters |

### Python
| Tool | Command | Metrics |
|------|---------|---------|
| radon | `radon cc -a -s src/` | CC, MI, Halstead |
| xenon | `xenon --max-absolute B src/` | CC thresholds |
| wily | `wily build src/` | Historical tracking |

### JavaScript/TypeScript
| Tool | Command | Metrics |
|------|---------|---------|
| eslint-plugin-complexity | ESLint rule | CC per function |
| plato | `plato -r -d report src/` | Full report |
| complexity-report | `cr src/` | CC, Halstead |

### Go
| Tool | Command | Metrics |
|------|---------|---------|
| gocyclo | `gocyclo -over 10 .` | Cyclomatic |
| gocognit | `gocognit -over 15 .` | Cognitive |
| goreporter | `goreporter -p .` | Full report |

### Java
| Tool | Command | Metrics |
|------|---------|---------|
| PMD | `pmd check -R category/java/design.xml` | CC, NCSS |
| JaCoCo | Build integration | Coverage + CC |
| Checkstyle | `checkstyle -c checks.xml` | All metrics |

### C#
| Tool | Command | Metrics |
|------|---------|---------|
| Roslyn Analyzers | Built-in | CC, MI, CBO |
| NDepend | IDE integration | All metrics |
| ReSharper | IDE integration | Complexity |

### Rust
| Tool | Command | Metrics |
|------|---------|---------|
| rust-code-analysis | `rust-code-analysis -m .` | CC, Cognitive, LOC |
| cargo-complexity | `cargo complexity` | Function complexity |
