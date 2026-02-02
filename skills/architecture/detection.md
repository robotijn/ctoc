# Architecture Detection System

> How to automatically detect and classify software architecture patterns from codebase analysis.

---

## Detection Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ARCHITECTURE DETECTION PIPELINE                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Directory  │    │   Import     │    │   Naming     │          │
│  │   Structure  │    │   Graph      │    │   Patterns   │          │
│  │   Analysis   │    │   Analysis   │    │   Analysis   │          │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘          │
│         │                   │                   │                   │
│         └───────────────────┼───────────────────┘                   │
│                             │                                       │
│                             ▼                                       │
│                    ┌────────────────┐                               │
│                    │   Framework    │                               │
│                    │   Detection    │                               │
│                    └────────┬───────┘                               │
│                             │                                       │
│                             ▼                                       │
│                    ┌────────────────┐                               │
│                    │ Configuration  │                               │
│                    │    Analysis    │                               │
│                    └────────┬───────┘                               │
│                             │                                       │
│                             ▼                                       │
│                    ┌────────────────┐                               │
│                    │  Confidence    │                               │
│                    │   Scoring      │                               │
│                    └────────┬───────┘                               │
│                             │                                       │
│                             ▼                                       │
│                    ┌────────────────┐                               │
│                    │    Pattern     │                               │
│                    │ Classification │                               │
│                    └────────────────┘                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Directory Structure Analysis

### Purpose
Identify architecture from folder organization, which is the most visible signal.

### Core Detection Rules

```yaml
# Each pattern has characteristic directories
pattern_signatures:

  layered:
    required: 2 of [controllers, services, repositories, models]
    optional: [api, presentation, business, persistence, data, domain]
    negative: [features, modules, ports, adapters]

  hexagonal:
    required: [domain OR core] AND [adapters OR (ports AND infrastructure)]
    structure:
      - adapters/
          - in/ OR driving/
          - out/ OR driven/
      - ports/
      - domain/ OR core/

  clean:
    required: [entities OR domain] AND [usecases OR application]
    structure:
      - entities/
      - usecases/ OR interactors/
      - adapters/ OR interface_adapters/
      - frameworks/ OR infrastructure/

  vertical_slices:
    required: features/ OR modules/ OR slices/
    each_subdirectory_contains:
      - handler OR service
      - command OR query OR dto
      - (optional) repository
    negative: [global controllers/, global services/]

  microservices:
    required: multiple_service_directories
    each_service_has:
      - own build file (package.json, pom.xml, go.mod, Cargo.toml)
      - Dockerfile OR containerization

  modular_monolith:
    required: modules/
    each_module_has:
      - internal/ OR private/
      - public/ OR api/
    single_root_build_file: true
```

### Directory Scanning Algorithm

```python
def analyze_directory_structure(root_path):
    """
    Scan directory structure and identify architecture signals.
    """
    signals = {
        'directories': [],
        'depth_analysis': {},
        'file_distribution': {},
        'build_files': []
    }

    # First pass: collect all directories
    for path in walk(root_path):
        if is_ignored(path):  # .git, node_modules, vendor, etc.
            continue

        rel_path = relative(path, root_path)
        depth = count_separators(rel_path)
        dir_name = basename(path)

        signals['directories'].append({
            'path': rel_path,
            'name': dir_name,
            'depth': depth,
            'file_count': count_files(path),
            'has_code': has_code_files(path)
        })

        # Track build files for microservices detection
        if is_build_file(path):
            signals['build_files'].append(rel_path)

    # Second pass: analyze patterns
    signals['layer_candidates'] = find_layer_directories(signals['directories'])
    signals['feature_candidates'] = find_feature_directories(signals['directories'])
    signals['module_candidates'] = find_module_directories(signals['directories'])

    return signals
```

### Key Directory Patterns

| Directory Name | Indicates | Confidence |
|---------------|-----------|------------|
| `controllers/` | Layered or MVC | High |
| `services/` | Layered | Medium |
| `repositories/` | Layered | High |
| `domain/` | DDD, Hexagonal, Clean | Medium |
| `ports/` | Hexagonal | High |
| `adapters/` | Hexagonal | High |
| `usecases/` | Clean | High |
| `features/` | Vertical Slices | High |
| `modules/` | Modular Monolith or Slices | Medium |
| `commands/` | CQRS | High |
| `queries/` | CQRS | High |
| `events/` | Event-Driven | High |
| `handlers/` | CQRS or Event-Driven | Medium |

---

## 2. Import/Dependency Graph Building

### Purpose
Analyze code dependencies to understand architectural layers and boundaries.

### Import Extraction by Language

```yaml
javascript_typescript:
  patterns:
    - "import .* from ['\"](.+)['\"]"
    - "require\\(['\"](.+)['\"]\\)"
    - "import\\(['\"](.+)['\"]\\)"
  relative_marker: "./"

python:
  patterns:
    - "from (\\S+) import"
    - "import (\\S+)"
  package_marker: "."

java:
  patterns:
    - "import (\\S+);"
    - "import static (\\S+);"
  package_marker: "."

go:
  patterns:
    - "import \"(.+)\""
    - "import \\([^)]*\"(.+)\"[^)]*\\)"
  module_path: go.mod

rust:
  patterns:
    - "use (\\S+)::"
    - "mod (\\S+);"
  crate_marker: "crate::"

csharp:
  patterns:
    - "using (\\S+);"
  namespace_marker: "."
```

### Dependency Graph Construction

```python
def build_dependency_graph(codebase):
    """
    Build a directed graph of file/module dependencies.
    """
    graph = DirectedGraph()

    for file in codebase.code_files:
        module = file_to_module(file)
        graph.add_node(module, file=file)

        imports = extract_imports(file)
        for imp in imports:
            target = resolve_import(imp, file)
            if target:
                graph.add_edge(module, target, import_statement=imp)

    return graph

def analyze_layer_dependencies(graph, layer_mapping):
    """
    Check if dependencies follow layer rules.
    """
    violations = []

    for edge in graph.edges:
        source_layer = layer_mapping.get(edge.source)
        target_layer = layer_mapping.get(edge.target)

        if source_layer and target_layer:
            if not is_allowed_dependency(source_layer, target_layer):
                violations.append({
                    'source': edge.source,
                    'target': edge.target,
                    'source_layer': source_layer,
                    'target_layer': target_layer,
                    'rule': f"{source_layer} should not import {target_layer}"
                })

    return violations
```

### Layer Dependency Rules

```yaml
layered:
  allowed:
    presentation: [application, domain]
    application: [domain, infrastructure]  # debatable
    domain: []  # nothing
    infrastructure: [domain]
  violations:
    - domain imports infrastructure
    - domain imports presentation
    - application imports presentation

hexagonal:
  allowed:
    adapters.driving: [ports, domain, application]
    adapters.driven: [ports, domain]
    application: [ports, domain]
    ports: [domain]
    domain: []
  violations:
    - domain imports adapters
    - domain imports ports (depends on interpretation)
    - ports imports adapters

clean:
  allowed:
    frameworks: [adapters, usecases, entities]
    adapters: [usecases, entities]
    usecases: [entities]
    entities: []
  violations:
    - entities imports anything
    - usecases imports adapters or frameworks
    - inner layer imports outer layer
```

### Metrics from Dependency Graph

| Metric | Formula | Indicates |
|--------|---------|-----------|
| Afferent Coupling (Ca) | Incoming edges | Responsibility/stability |
| Efferent Coupling (Ce) | Outgoing edges | Dependencies |
| Instability (I) | Ce / (Ca + Ce) | Change likelihood |
| Abstractness (A) | Interfaces / Total | Abstraction level |
| Distance (D) | \|A + I - 1\| | Deviation from ideal |
| Cyclic Dependencies | Cycles in graph | Architecture violation |

---

## 3. Naming Convention Patterns

### Purpose
Detect architecture from class, file, and function naming patterns.

### Pattern Detection Rules

```yaml
naming_patterns:

  layered:
    controllers:
      - "*Controller"
      - "*Handler"
      - "*Endpoint"
    services:
      - "*Service"
      - "*Manager"
      - "*Facade"
    repositories:
      - "*Repository"
      - "*Repo"
      - "*DAO"
      - "*Store"
    models:
      - "*Entity"
      - "*Model"
      - "*DTO"

  hexagonal:
    ports:
      - "*Port"
      - "*Gateway"
      - "I*"  # Interface prefix
      - "*Interface"
    adapters:
      - "*Adapter"
      - "*Impl"
      - "*Implementation"

  clean:
    usecases:
      - "*UseCase"
      - "*Interactor"
      - "*Command"
      - "*Query"
    boundaries:
      - "*InputPort"
      - "*OutputPort"
      - "*InputBoundary"
      - "*OutputBoundary"
    presenters:
      - "*Presenter"
      - "*ViewModel"

  cqrs:
    commands:
      - "*Command"
      - "Create*"
      - "Update*"
      - "Delete*"
    queries:
      - "*Query"
      - "Get*"
      - "Find*"
      - "List*"
    handlers:
      - "*Handler"
      - "*CommandHandler"
      - "*QueryHandler"

  event_driven:
    events:
      - "*Event"
      - "*Occurred"
      - "*Happened"
    handlers:
      - "*EventHandler"
      - "*Subscriber"
      - "*Listener"
    aggregates:
      - "*Aggregate"
      - "*AggregateRoot"
```

### Naming Analysis Algorithm

```python
def analyze_naming_patterns(codebase):
    """
    Analyze naming conventions to detect architecture patterns.
    """
    patterns_found = defaultdict(list)

    for file in codebase.code_files:
        # Analyze file name
        file_name = basename(file)
        for pattern, arch_type in FILE_PATTERNS.items():
            if matches(file_name, pattern):
                patterns_found[arch_type].append(file_name)

        # Analyze class/function names within file
        symbols = extract_symbols(file)
        for symbol in symbols:
            for pattern, arch_type in SYMBOL_PATTERNS.items():
                if matches(symbol.name, pattern):
                    patterns_found[arch_type].append({
                        'symbol': symbol.name,
                        'file': file,
                        'type': symbol.type
                    })

    return patterns_found

def calculate_naming_confidence(patterns_found):
    """
    Calculate confidence scores based on naming pattern prevalence.
    """
    scores = {}

    for arch_type, matches in patterns_found.items():
        # Count matches in different categories
        unique_files = len(set(m['file'] if isinstance(m, dict) else m
                              for m in matches))
        total_matches = len(matches)

        # Higher confidence with more consistent naming
        scores[arch_type] = {
            'count': total_matches,
            'files': unique_files,
            'confidence': calculate_confidence(total_matches, unique_files)
        }

    return scores
```

---

## 4. Framework Detection

### Purpose
Identify frameworks that imply specific architectural patterns.

### Framework-Architecture Mappings

```yaml
framework_implications:

  # Web Frameworks with MVC
  mvc_frameworks:
    ruby:
      - rails: MVC + ActiveRecord
    python:
      - django: MVC (MTV)
      - flask: flexible (often layered)
    php:
      - laravel: MVC + layered
      - symfony: layered + DI
    java:
      - spring_mvc: MVC + layered
      - spring_boot: layered + DI
    csharp:
      - asp_net_mvc: MVC
      - asp_net_core: layered

  # Frontend Frameworks
  frontend_frameworks:
    javascript:
      - angular: MVVM + modules
      - vue: MVVM
      - react: component-based (varies)
      - svelte: component-based

  # DDD/Clean Frameworks
  ddd_frameworks:
    java:
      - axon: CQRS + Event Sourcing
    csharp:
      - mediatr: CQRS
      - eventstore: Event Sourcing
    typescript:
      - nestjs: modular + DI
      - "@nestjs/cqrs": CQRS

  # Microservices Frameworks
  microservices_frameworks:
    java:
      - spring_cloud: microservices
      - micronaut: microservices
      - quarkus: microservices
    go:
      - go_kit: microservices
      - go_micro: microservices
```

### Framework Detection Algorithm

```python
def detect_frameworks(codebase):
    """
    Detect frameworks from dependencies and configuration.
    """
    frameworks = []

    # Check package managers
    package_files = {
        'package.json': parse_npm_packages,
        'pom.xml': parse_maven_dependencies,
        'build.gradle': parse_gradle_dependencies,
        'Cargo.toml': parse_cargo_dependencies,
        'go.mod': parse_go_modules,
        'requirements.txt': parse_pip_requirements,
        'Pipfile': parse_pipfile,
        'Gemfile': parse_bundler,
        'composer.json': parse_composer
    }

    for file_name, parser in package_files.items():
        if exists(join(codebase.root, file_name)):
            deps = parser(join(codebase.root, file_name))
            for dep in deps:
                framework = identify_framework(dep)
                if framework:
                    frameworks.append(framework)

    # Check for framework-specific files
    framework_indicators = {
        'angular.json': 'angular',
        'next.config.js': 'nextjs',
        'nuxt.config.js': 'nuxt',
        'vue.config.js': 'vue',
        'rails': 'rails',
        'manage.py': 'django',
        'artisan': 'laravel'
    }

    for indicator, framework in framework_indicators.items():
        if exists(join(codebase.root, indicator)):
            frameworks.append(framework)

    return frameworks

def infer_architecture_from_frameworks(frameworks):
    """
    Infer likely architecture patterns from detected frameworks.
    """
    implications = []

    for framework in frameworks:
        if framework in FRAMEWORK_IMPLICATIONS:
            implications.append({
                'framework': framework,
                'implied_architecture': FRAMEWORK_IMPLICATIONS[framework],
                'confidence': 'medium'  # Framework doesn't guarantee pattern
            })

    return implications
```

---

## 5. Configuration File Analysis

### Purpose
Extract architectural insights from configuration and infrastructure files.

### Configuration Indicators

```yaml
configuration_signals:

  dependency_injection:
    files:
      - "inversify.config.ts"
      - "di.config.ts"
      - "ApplicationContext.java"
      - "Startup.cs"
      - "container.php"
    implies: [layered, hexagonal, clean]
    reason: "DI enables loose coupling between layers"

  api_gateway:
    files:
      - "gateway.config.yml"
      - "kong.yml"
      - "traefik.toml"
      - "nginx.conf" (with upstream blocks)
    implies: [microservices]
    reason: "API gateway indicates service routing"

  message_broker:
    files:
      - "kafka.properties"
      - "rabbitmq.config"
      - "application.yml" (with spring.kafka/rabbitmq)
    implies: [event_driven, microservices]
    reason: "Message brokers enable async communication"

  container_orchestration:
    files:
      - "docker-compose.yml" (multiple services)
      - "kubernetes/*.yaml"
      - "helm/Chart.yaml"
      - "skaffold.yaml"
    implies: [microservices]
    reason: "Container orchestration for service management"

  database_separation:
    files:
      - Multiple database configs
      - Read replica configuration
    implies: [cqrs]
    reason: "Separate read/write databases"

  module_configuration:
    files:
      - "modules.config.ts"
      - "@Module decorators"
    implies: [modular_monolith, vertical_slices]
    reason: "Explicit module boundaries"
```

### Configuration Analysis Algorithm

```python
def analyze_configuration_files(codebase):
    """
    Analyze configuration files for architecture signals.
    """
    signals = []

    # Docker Compose analysis
    compose_file = find_file(codebase.root, 'docker-compose.yml')
    if compose_file:
        compose = parse_yaml(compose_file)
        services = compose.get('services', {})

        if len(services) > 1:
            # Check if services are actual microservices (not just db, redis)
            app_services = [s for s in services
                          if not is_infrastructure_service(s)]
            if len(app_services) > 1:
                signals.append({
                    'type': 'microservices',
                    'evidence': f"{len(app_services)} application services",
                    'confidence': 'high'
                })

    # Kubernetes analysis
    k8s_files = glob(join(codebase.root, 'kubernetes/**/*.yaml'))
    if k8s_files:
        deployments = [f for f in k8s_files if 'deployment' in read(f).lower()]
        if len(deployments) > 1:
            signals.append({
                'type': 'microservices',
                'evidence': f"{len(deployments)} Kubernetes deployments",
                'confidence': 'high'
            })

    # DI container analysis
    di_indicators = find_di_configuration(codebase)
    if di_indicators:
        signals.append({
            'type': 'interface_based',
            'evidence': 'Dependency injection configuration found',
            'confidence': 'medium',
            'compatible_with': ['layered', 'hexagonal', 'clean']
        })

    return signals
```

---

## 6. Confidence Scoring System

### Scoring Model

```yaml
confidence_levels:
  definitive: 0.9 - 1.0   # Multiple strong signals align
  high:       0.7 - 0.9   # Clear pattern with minor gaps
  medium:     0.5 - 0.7   # Pattern visible but incomplete
  low:        0.3 - 0.5   # Some hints but unclear
  uncertain:  0.0 - 0.3   # Inconclusive

signal_weights:
  directory_structure: 0.30
  import_analysis:     0.25
  naming_patterns:     0.20
  framework:           0.15
  configuration:       0.10
```

### Confidence Calculation

```python
def calculate_architecture_confidence(signals):
    """
    Calculate overall confidence score for each architecture pattern.
    """
    pattern_scores = defaultdict(lambda: {
        'directory': 0,
        'imports': 0,
        'naming': 0,
        'framework': 0,
        'configuration': 0,
        'violations': 0
    })

    # Process directory signals
    for signal in signals['directory']:
        pattern = signal['pattern']
        strength = signal['strength']  # 0-1
        pattern_scores[pattern]['directory'] = max(
            pattern_scores[pattern]['directory'],
            strength
        )

    # Process import signals
    for signal in signals['imports']:
        pattern = signal['pattern']
        # Check for violations which reduce confidence
        if signal.get('violation'):
            pattern_scores[pattern]['violations'] += 0.1
        else:
            pattern_scores[pattern]['imports'] = max(
                pattern_scores[pattern]['imports'],
                signal['strength']
            )

    # Process naming signals
    for signal in signals['naming']:
        pattern = signal['pattern']
        pattern_scores[pattern]['naming'] = max(
            pattern_scores[pattern]['naming'],
            signal['strength']
        )

    # Process framework signals
    for signal in signals['framework']:
        for pattern in signal.get('implied_patterns', []):
            pattern_scores[pattern]['framework'] = max(
                pattern_scores[pattern]['framework'],
                signal['strength']
            )

    # Process configuration signals
    for signal in signals['configuration']:
        for pattern in signal.get('compatible_with', [signal['type']]):
            pattern_scores[pattern]['configuration'] = max(
                pattern_scores[pattern]['configuration'],
                signal['strength']
            )

    # Calculate weighted scores
    final_scores = {}
    for pattern, scores in pattern_scores.items():
        weighted = (
            scores['directory'] * 0.30 +
            scores['imports'] * 0.25 +
            scores['naming'] * 0.20 +
            scores['framework'] * 0.15 +
            scores['configuration'] * 0.10
        )

        # Apply violation penalty
        penalty = min(scores['violations'], 0.3)
        final_score = max(0, weighted - penalty)

        final_scores[pattern] = {
            'score': final_score,
            'confidence_level': score_to_level(final_score),
            'breakdown': scores
        }

    return final_scores

def score_to_level(score):
    if score >= 0.9:
        return 'definitive'
    elif score >= 0.7:
        return 'high'
    elif score >= 0.5:
        return 'medium'
    elif score >= 0.3:
        return 'low'
    else:
        return 'uncertain'
```

### Confidence Boosters and Penalties

```yaml
boosters:
  - Multiple signals agree: +0.1 per aligned signal
  - No layer violations found: +0.1
  - Framework matches pattern: +0.1
  - Configuration confirms pattern: +0.1
  - Consistent naming across codebase: +0.05

penalties:
  - Layer violation detected: -0.1 per violation (max -0.3)
  - Mixed patterns in same area: -0.1
  - Inconsistent naming: -0.05
  - Missing expected components: -0.05 per missing
  - Circular dependencies: -0.15
```

---

## 7. Final Classification Output

### Output Format

```json
{
  "primary_architecture": {
    "pattern": "hexagonal",
    "confidence": 0.85,
    "confidence_level": "high"
  },
  "secondary_patterns": [
    {
      "pattern": "cqrs",
      "confidence": 0.72,
      "confidence_level": "high",
      "scope": "application layer"
    }
  ],
  "evidence": {
    "directory_structure": [
      {
        "path": "src/domain/",
        "indicates": "hexagonal",
        "strength": 0.9
      },
      {
        "path": "src/adapters/in/",
        "indicates": "hexagonal",
        "strength": 0.95
      },
      {
        "path": "src/adapters/out/",
        "indicates": "hexagonal",
        "strength": 0.95
      }
    ],
    "import_analysis": {
      "violations": [],
      "conformance": 0.95,
      "layer_mapping": {
        "domain": ["src/domain/**"],
        "ports": ["src/ports/**"],
        "adapters": ["src/adapters/**"],
        "application": ["src/application/**"]
      }
    },
    "naming_patterns": {
      "ports": ["OrderPort", "PaymentPort", "NotificationPort"],
      "adapters": ["PostgresAdapter", "StripeAdapter", "SnsAdapter"]
    },
    "frameworks": ["nestjs"],
    "configuration": {
      "dependency_injection": true,
      "module_boundaries": true
    }
  },
  "recommendations": [
    "Consider adding interface definitions in ports/ for type safety",
    "Some domain logic detected in adapters - consider refactoring"
  ],
  "anti_patterns_detected": []
}
```

---

## Edge Cases and Disambiguation

### Layered vs. Clean Architecture
Both have layers, but:
- **Clean**: Has `usecases/` or `interactors/`, entities are isolated
- **Layered**: Has `services/` with business logic, entities may have ORM

### Hexagonal vs. Clean
Both isolate domain, but:
- **Hexagonal**: Explicit `ports/` and `adapters/` directories
- **Clean**: `usecases/` with input/output boundaries

### Vertical Slices vs. Microservices
Both have isolated features, but:
- **Vertical Slices**: Single deployment, `features/` or `modules/` directory
- **Microservices**: Multiple deployments, separate build files, Dockerfiles

### Modular Monolith vs. Vertical Slices
Both organize by module, but:
- **Modular Monolith**: Explicit `public/` and `internal/` separation
- **Vertical Slices**: Feature-complete slices without internal/public

### CQRS vs. Simple Separation
Both separate reads/writes, but:
- **True CQRS**: `commands/` and `queries/` directories, handlers, potentially different models
- **Simple**: Different methods in same service, shared models

---

## Detection Limitations

### What Detection Cannot Determine

1. **Intent vs. Implementation**: Code may be structured a certain way by accident
2. **Partial Adoption**: Team may have started but not completed a pattern
3. **Custom Variations**: Teams often adapt patterns to their needs
4. **Runtime Behavior**: Static analysis cannot see runtime patterns
5. **Implicit Architecture**: Some architectures are conventions, not enforced

### Handling Ambiguity

```python
def handle_ambiguous_detection(scores):
    """
    When multiple patterns have similar scores, provide nuanced output.
    """
    sorted_patterns = sorted(scores.items(), key=lambda x: x[1]['score'], reverse=True)

    top_score = sorted_patterns[0][1]['score']
    top_pattern = sorted_patterns[0][0]

    # Check for close competitors
    close_patterns = [
        (pattern, data) for pattern, data in sorted_patterns[1:4]
        if data['score'] > top_score - 0.15
    ]

    if close_patterns:
        return {
            'status': 'ambiguous',
            'most_likely': top_pattern,
            'alternatives': [p[0] for p in close_patterns],
            'recommendation': 'Manual review recommended',
            'distinguishing_questions': generate_disambiguation_questions(
                top_pattern,
                [p[0] for p in close_patterns]
            )
        }

    return {
        'status': 'confident',
        'pattern': top_pattern,
        'score': top_score
    }
```

---

## Quick Reference: Detection Commands

```bash
# Analyze directory structure
find . -type d -name "controllers" -o -name "services" -o -name "repositories"
find . -type d -name "ports" -o -name "adapters" -o -name "domain"
find . -type d -name "features" -o -name "modules" -o -name "usecases"

# Count pattern matches
grep -r "Controller" --include="*.ts" -l | wc -l
grep -r "Service" --include="*.java" -l | wc -l
grep -r "Repository" --include="*.py" -l | wc -l

# Check for microservices indicators
find . -name "Dockerfile" | wc -l
find . -name "docker-compose.yml" -exec grep -l "services:" {} \;

# Analyze imports (TypeScript example)
grep -rh "^import" --include="*.ts" | sort | uniq -c | sort -rn | head -20
```

---

## References

- Fundamentals of Software Architecture (Richards & Ford)
- Clean Architecture (Robert C. Martin)
- Building Evolutionary Architectures (Ford, Parsons, Kua)
- Software Architecture Patterns (Mark Richards)
