# The Dependency Rule

> Source code dependencies must point inward only. Inner layers know nothing about outer layers.

---

## The Core Principle

The Dependency Rule is the **most important rule** in Clean Architecture and its variants (Hexagonal, Onion). It states:

> **Source code dependencies can only point inward.**

Nothing in an inner circle can know anything at all about something in an outer circle. This includes:
- Functions
- Classes
- Variables
- Data formats
- Framework types

```
┌─────────────────────────────────────────────────────────────────────┐
│                      OUTER LAYER (Frameworks)                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    OUTER LAYER (Adapters)                     │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │                 INNER LAYER (Use Cases)                 │  │  │
│  │  │  ┌───────────────────────────────────────────────────┐  │  │  │
│  │  │  │              INNERMOST (Entities)                 │  │  │  │
│  │  │  │                                                   │  │  │  │
│  │  │  │        Dependencies point INWARD ←←←←←←          │  │  │  │
│  │  │  │                                                   │  │  │  │
│  │  │  └───────────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Dependency Inversion Principle (DIP)

The Dependency Rule is enforced through **Dependency Inversion**:

> High-level modules should not depend on low-level modules. Both should depend on abstractions.

### Without DIP (Violates Dependency Rule)

```typescript
// domain/OrderService.ts
import { PostgresOrderRepository } from '../infrastructure/PostgresOrderRepository'; // VIOLATION!

class OrderService {
    constructor() {
        this.repository = new PostgresOrderRepository(); // Depends on concrete implementation
    }

    createOrder(data) {
        // Domain depends on infrastructure
        return this.repository.save(new Order(data));
    }
}
```

### With DIP (Follows Dependency Rule)

```typescript
// domain/ports/OrderRepository.ts (Inner layer defines interface)
export interface OrderRepository {
    save(order: Order): Promise<Order>;
    findById(id: OrderId): Promise<Order | null>;
}

// domain/OrderService.ts (Inner layer uses interface)
import { OrderRepository } from './ports/OrderRepository';

class OrderService {
    constructor(private repository: OrderRepository) {} // Depends on abstraction

    createOrder(data): Promise<Order> {
        const order = new Order(data);
        return this.repository.save(order); // Uses interface, not implementation
    }
}

// infrastructure/PostgresOrderRepository.ts (Outer layer implements interface)
import { OrderRepository } from '../domain/ports/OrderRepository';
import { Order } from '../domain/Order';

class PostgresOrderRepository implements OrderRepository {
    async save(order: Order): Promise<Order> {
        // PostgreSQL-specific implementation
    }

    async findById(id: OrderId): Promise<Order | null> {
        // PostgreSQL-specific implementation
    }
}
```

---

## Import Direction Rules

### The Import Graph

```
                          Allowed Imports
                          ─────────────────

Frameworks/Drivers ──────────────────────────────────────▶ Everything
       │
       │
       ▼
  Adapters ──────────────────────────────────────────────▶ Use Cases, Entities
       │
       │
       ▼
  Use Cases ─────────────────────────────────────────────▶ Entities Only
       │
       │
       ▼
  Entities ──────────────────────────────────────────────▶ NOTHING
```

### Explicit Rules by Layer

```yaml
entities:
  can_import:
    - Language primitives (string, number, etc.)
    - Other entities
    - Value objects
    - Domain events
  cannot_import:
    - Use cases
    - Adapters
    - Frameworks
    - Database types
    - HTTP types
    - Any external library

use_cases:
  can_import:
    - Entities
    - Port interfaces (which they define)
  cannot_import:
    - Adapters
    - Frameworks
    - Concrete implementations

adapters:
  can_import:
    - Entities (for mapping)
    - Use cases (to call them)
    - Port interfaces (to implement them)
    - Framework types
  cannot_import:
    - Other adapters (generally)

frameworks:
  can_import:
    - Everything above
  cannot_import:
    - N/A (outermost layer)
```

---

## Detecting Violations

### Static Analysis Approach

```python
def analyze_dependency_violations(codebase, layer_config):
    """
    Analyze import statements to find dependency rule violations.
    """
    violations = []

    # Map files to layers
    file_layers = {}
    for file in codebase.files:
        layer = determine_layer(file, layer_config)
        file_layers[file] = layer

    # Analyze each file's imports
    for file, source_layer in file_layers.items():
        imports = extract_imports(file)

        for imp in imports:
            target_file = resolve_import(imp, file)
            if not target_file:
                continue

            target_layer = file_layers.get(target_file)
            if not target_layer:
                continue

            # Check if import violates rules
            if is_violation(source_layer, target_layer, layer_config):
                violations.append({
                    'file': file,
                    'import': imp,
                    'source_layer': source_layer,
                    'target_layer': target_layer,
                    'rule': f"{source_layer} cannot import from {target_layer}"
                })

    return violations

def is_violation(source_layer, target_layer, config):
    """
    Check if an import from source_layer to target_layer violates the dependency rule.
    """
    layer_order = config['layer_order']  # e.g., ['entities', 'usecases', 'adapters', 'frameworks']

    source_index = layer_order.index(source_layer)
    target_index = layer_order.index(target_layer)

    # Inner layers (lower index) cannot import from outer layers (higher index)
    return source_index < target_index
```

### Import Pattern Detection

```yaml
violation_patterns:

  entity_violations:
    patterns:
      - "from.*repository import"
      - "from.*service import"
      - "import.*Repository"
      - "import.*Service"
      - "from sqlalchemy"
      - "import typeorm"
      - "@Entity"
      - "@Column"
    in_files:
      - "**/domain/**"
      - "**/entities/**"
      - "**/model/**"

  usecase_violations:
    patterns:
      - "from.*adapter import"
      - "from.*infrastructure import"
      - "import.*Controller"
      - "import.*Handler"  # (HTTP handler, not use case handler)
      - "from fastapi"
      - "from express"
      - "import { Request, Response }"
    in_files:
      - "**/usecases/**"
      - "**/application/**"

  adapter_to_adapter:
    patterns:
      - Adapters importing other adapters
    detection:
      - Check adapters/in/* imports adapters/out/*
      - Check adapters/out/* imports adapters/in/*
```

### Language-Specific Detection

```python
# TypeScript/JavaScript
def detect_ts_violations(file_content, file_path, layer):
    violations = []

    # Extract imports
    import_regex = r"import\s+.*\s+from\s+['\"]([^'\"]+)['\"]"
    imports = re.findall(import_regex, file_content)

    for imp in imports:
        # Check for framework imports in inner layers
        if layer in ['entities', 'domain', 'usecases']:
            framework_imports = [
                'express', 'fastify', 'nestjs', 'typeorm', 'prisma',
                'mongoose', 'sequelize', '@angular', 'react', 'vue'
            ]
            for framework in framework_imports:
                if framework in imp:
                    violations.append({
                        'type': 'framework_in_domain',
                        'import': imp,
                        'framework': framework
                    })

        # Check for relative imports going outward
        if imp.startswith('.'):
            target_layer = resolve_relative_import_layer(imp, file_path)
            if is_outer_layer(target_layer, layer):
                violations.append({
                    'type': 'outward_dependency',
                    'import': imp,
                    'from_layer': layer,
                    'to_layer': target_layer
                })

    return violations
```

---

## Violation Categories

### Category 1: Direct Framework Import in Domain

```typescript
// domain/Order.ts
import { Column, Entity } from 'typeorm'; // VIOLATION: ORM in domain

@Entity()
export class Order {
    @Column()
    status: string;
}
```

**Fix**: Separate domain entity from persistence entity.

```typescript
// domain/Order.ts
export class Order {
    constructor(
        public readonly id: OrderId,
        private status: OrderStatus
    ) {}
}

// infrastructure/entities/OrderEntity.ts
import { Column, Entity } from 'typeorm';

@Entity('orders')
export class OrderEntity {
    @Column()
    status: string;
}
```

### Category 2: Use Case Imports Adapter

```typescript
// usecases/CreateOrder.ts
import { PostgresOrderRepository } from '../adapters/persistence/PostgresOrderRepository'; // VIOLATION

export class CreateOrderUseCase {
    constructor() {
        this.repository = new PostgresOrderRepository();
    }
}
```

**Fix**: Depend on port interface, inject implementation.

```typescript
// usecases/CreateOrder.ts
import { OrderRepository } from '../ports/OrderRepository';

export class CreateOrderUseCase {
    constructor(private repository: OrderRepository) {} // Interface, not implementation
}
```

### Category 3: Entity Returns Infrastructure Type

```typescript
// domain/Order.ts
import { OrderEntity } from '../infrastructure/entities/OrderEntity';

export class Order {
    toEntity(): OrderEntity { // VIOLATION: Domain returns infrastructure type
        return new OrderEntity(this.id, this.status);
    }
}
```

**Fix**: Mapping belongs in adapter, not domain.

```typescript
// adapters/persistence/OrderMapper.ts
import { Order } from '../../domain/Order';
import { OrderEntity } from './entities/OrderEntity';

export class OrderMapper {
    static toEntity(order: Order): OrderEntity {
        return new OrderEntity(order.id.value, order.status);
    }

    static toDomain(entity: OrderEntity): Order {
        return Order.reconstitute({
            id: OrderId.from(entity.id),
            status: entity.status as OrderStatus
        });
    }
}
```

### Category 4: Domain Event with Framework Types

```typescript
// domain/events/OrderCreated.ts
import { EventEmitter } from 'events'; // VIOLATION: Node.js framework in domain

export class OrderCreated extends EventEmitter {
    constructor(public orderId: string) {
        super();
    }
}
```

**Fix**: Pure domain event, framework adapter handles emission.

```typescript
// domain/events/OrderCreated.ts
export class OrderCreated implements DomainEvent {
    readonly occurredAt = new Date();

    constructor(
        public readonly orderId: OrderId,
        public readonly customerId: CustomerId
    ) {}
}

// adapters/events/NodeEventEmitter.ts
import { EventEmitter } from 'events';
import { DomainEvent } from '../../domain/events/DomainEvent';

export class NodeEventEmitter implements EventPublisher {
    private emitter = new EventEmitter();

    publish(event: DomainEvent): void {
        this.emitter.emit(event.constructor.name, event);
    }
}
```

### Category 5: Cross-Adapter Dependencies

```typescript
// adapters/in/rest/OrderController.ts
import { PostgresOrderRepository } from '../../out/persistence/PostgresOrderRepository'; // VIOLATION

export class OrderController {
    constructor(private repo: PostgresOrderRepository) {}
}
```

**Fix**: Driving adapter uses application service, not driven adapter directly.

```typescript
// adapters/in/rest/OrderController.ts
import { OrderService } from '../../../ports/in/OrderService';

export class OrderController {
    constructor(private orderService: OrderService) {} // Port interface
}
```

---

## Import Graph Analysis

### Building the Graph

```python
def build_import_graph(codebase):
    """
    Build a directed graph of module dependencies.
    """
    graph = DirectedGraph()

    for file in codebase.code_files:
        module_id = file_to_module(file)
        layer = determine_layer(file)

        graph.add_node(module_id, {
            'file': file,
            'layer': layer
        })

        for imp in extract_imports(file):
            target_module = resolve_import(imp, file)
            if target_module:
                graph.add_edge(module_id, target_module, {
                    'import_statement': imp
                })

    return graph
```

### Detecting Cycles

```python
def find_dependency_cycles(graph):
    """
    Find circular dependencies in the import graph.
    """
    cycles = []

    def dfs(node, path, visited):
        if node in path:
            cycle_start = path.index(node)
            cycles.append(path[cycle_start:] + [node])
            return

        if node in visited:
            return

        visited.add(node)
        path.append(node)

        for neighbor in graph.neighbors(node):
            dfs(neighbor, path, visited)

        path.pop()

    visited = set()
    for node in graph.nodes:
        dfs(node, [], visited)

    return cycles
```

### Identifying Layer Crossings

```python
def find_layer_crossings(graph, layer_order):
    """
    Find all imports that cross from inner to outer layers.
    """
    crossings = []

    for edge in graph.edges:
        source_layer = graph.nodes[edge.source]['layer']
        target_layer = graph.nodes[edge.target]['layer']

        source_index = layer_order.index(source_layer)
        target_index = layer_order.index(target_layer)

        if source_index < target_index:
            crossings.append({
                'source': edge.source,
                'target': edge.target,
                'source_layer': source_layer,
                'target_layer': target_layer,
                'severity': target_index - source_index  # How many layers crossed
            })

    return sorted(crossings, key=lambda x: -x['severity'])
```

---

## Metrics and Reporting

### Dependency Metrics

```yaml
metrics:

  afferent_coupling:
    description: "Number of modules that depend on this module"
    formula: "count(incoming_edges)"
    interpretation:
      high: "Highly responsible, changes affect many"
      low: "Independent, isolated"

  efferent_coupling:
    description: "Number of modules this module depends on"
    formula: "count(outgoing_edges)"
    interpretation:
      high: "Highly dependent, fragile"
      low: "Independent, stable"

  instability:
    description: "Likelihood of change"
    formula: "Ce / (Ca + Ce)"
    interpretation:
      1.0: "Maximally unstable (all outgoing)"
      0.0: "Maximally stable (all incoming)"

  abstractness:
    description: "Ratio of abstract types"
    formula: "abstract_types / total_types"
    interpretation:
      high: "Policy layer, interfaces"
      low: "Implementation layer, concrete"

  distance_from_main_sequence:
    description: "Balance between abstractness and stability"
    formula: "|A + I - 1|"
    interpretation:
      0: "Ideal balance"
      high: "Zone of pain (too concrete and stable) or zone of uselessness (too abstract and unstable)"
```

### Violation Report Format

```json
{
  "summary": {
    "total_files_analyzed": 150,
    "total_imports": 723,
    "violations": 12,
    "violation_rate": "1.7%"
  },
  "violations_by_category": {
    "framework_in_domain": 5,
    "outward_dependency": 4,
    "cross_adapter": 2,
    "circular_dependency": 1
  },
  "violations": [
    {
      "file": "src/domain/Order.ts",
      "line": 3,
      "import": "import { Entity } from 'typeorm'",
      "category": "framework_in_domain",
      "source_layer": "domain",
      "severity": "high",
      "suggestion": "Move ORM decorators to infrastructure/entities/OrderEntity.ts"
    },
    {
      "file": "src/usecases/CreateOrder.ts",
      "line": 5,
      "import": "import { PostgresOrderRepository } from '../adapters/persistence/...'",
      "category": "outward_dependency",
      "source_layer": "usecases",
      "target_layer": "adapters",
      "severity": "high",
      "suggestion": "Inject OrderRepository interface instead"
    }
  ],
  "dependency_graph": {
    "layers": ["entities", "usecases", "adapters", "frameworks"],
    "layer_metrics": {
      "entities": { "modules": 15, "violations": 0, "abstractness": 0.1 },
      "usecases": { "modules": 25, "violations": 3, "abstractness": 0.4 },
      "adapters": { "modules": 40, "violations": 2, "abstractness": 0.2 },
      "frameworks": { "modules": 70, "violations": 0, "abstractness": 0.0 }
    }
  }
}
```

---

## Enforcement Strategies

### 1. ESLint Rules (TypeScript)

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'import/no-restricted-paths': ['error', {
      zones: [
        // Domain cannot import from adapters or infrastructure
        {
          target: './src/domain/**',
          from: './src/adapters/**',
          message: 'Domain cannot depend on adapters'
        },
        {
          target: './src/domain/**',
          from: './src/infrastructure/**',
          message: 'Domain cannot depend on infrastructure'
        },
        // Use cases cannot import from adapters
        {
          target: './src/usecases/**',
          from: './src/adapters/**',
          message: 'Use cases cannot depend on adapters'
        }
      ]
    }]
  }
};
```

### 2. ArchUnit (Java)

```java
@AnalyzeClasses(packages = "com.example")
public class DependencyRulesTest {

    @ArchTest
    static final ArchRule domain_should_not_depend_on_infrastructure =
        noClasses()
            .that().resideInAPackage("..domain..")
            .should().dependOnClassesThat().resideInAPackage("..infrastructure..");

    @ArchTest
    static final ArchRule domain_should_not_depend_on_adapters =
        noClasses()
            .that().resideInAPackage("..domain..")
            .should().dependOnClassesThat().resideInAPackage("..adapters..");

    @ArchTest
    static final ArchRule usecases_should_not_depend_on_adapters =
        noClasses()
            .that().resideInAPackage("..usecases..")
            .should().dependOnClassesThat().resideInAPackage("..adapters..");

    @ArchTest
    static final ArchRule layers_should_be_free_of_cycles =
        slices()
            .matching("com.example.(*)..")
            .should().beFreeOfCycles();
}
```

### 3. Python Import Linter

```python
# .importlinter
[importlinter]
root_package = myapp

[importlinter:contract:1]
name = Domain should not import infrastructure
type = forbidden
source_modules =
    myapp.domain
forbidden_modules =
    myapp.infrastructure
    myapp.adapters

[importlinter:contract:2]
name = Use cases should not import adapters
type = forbidden
source_modules =
    myapp.usecases
forbidden_modules =
    myapp.adapters

[importlinter:contract:3]
name = Layers should be free of cycles
type = layers
layers =
    domain
    usecases
    adapters
    infrastructure
```

### 4. Go Module Boundaries

```go
// Using go-arch-lint or depguard

// .go-arch-lint.yml
version: 1.0
allow:
  internal.domain: []
  internal.usecases:
    - internal.domain
  internal.adapters:
    - internal.domain
    - internal.usecases
    - internal.ports
  internal.infrastructure:
    - internal.domain
    - internal.ports
```

---

## Fixing Violations

### Step-by-Step Refactoring

1. **Identify the violation**
   ```
   src/domain/Order.ts imports from src/infrastructure/database.ts
   ```

2. **Extract an interface in the inner layer**
   ```typescript
   // src/domain/ports/OrderRepository.ts
   export interface OrderRepository {
       save(order: Order): Promise<void>;
   }
   ```

3. **Update the inner layer to use the interface**
   ```typescript
   // src/domain/OrderService.ts
   import { OrderRepository } from './ports/OrderRepository';

   export class OrderService {
       constructor(private repo: OrderRepository) {}
   }
   ```

4. **Move implementation to outer layer**
   ```typescript
   // src/infrastructure/PostgresOrderRepository.ts
   import { OrderRepository } from '../domain/ports/OrderRepository';

   export class PostgresOrderRepository implements OrderRepository {
       // Implementation
   }
   ```

5. **Configure dependency injection**
   ```typescript
   // src/main.ts
   const orderRepository = new PostgresOrderRepository(database);
   const orderService = new OrderService(orderRepository);
   ```

---

## Quick Reference Commands

```bash
# Find potential domain violations (TypeScript)
grep -r "import.*from.*infrastructure" src/domain/
grep -r "import.*from.*adapters" src/domain/

# Find use case violations
grep -r "import.*from.*adapters" src/usecases/

# Find framework imports in domain
grep -r "import.*typeorm\|import.*prisma\|import.*mongoose" src/domain/

# Count violations by layer
find src/domain -name "*.ts" -exec grep -l "infrastructure\|adapters" {} \; | wc -l
```

---

## References

- Clean Architecture (Robert C. Martin)
- Dependency Inversion Principle (SOLID)
- Hexagonal Architecture (Alistair Cockburn)
- ArchUnit documentation
- Import Linter documentation
