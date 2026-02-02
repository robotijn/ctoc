# Architecture Pattern Catalog

> Comprehensive reference for software architecture patterns with detection markers.

---

## Pattern Overview Matrix

| Pattern | Scale | Complexity | Best For | Detection Difficulty |
|---------|-------|------------|----------|---------------------|
| Layered (N-tier) | Small-Large | Low | CRUD apps, APIs | Easy |
| Hexagonal | Medium-Large | Medium | Domain-rich apps | Medium |
| Clean Architecture | Medium-Large | High | Enterprise apps | Medium |
| Onion Architecture | Medium-Large | Medium | DDD projects | Medium |
| Vertical Slices | Medium-Large | Low | Feature teams | Easy |
| MVC/MVP/MVVM | Small-Medium | Low | UI applications | Easy |
| Microservices | Large | High | Distributed systems | Easy |
| Modular Monolith | Medium-Large | Medium | Growing monoliths | Medium |
| Event-Driven | Medium-Large | High | Async workflows | Hard |
| CQRS | Medium-Large | High | Read/write split | Medium |

---

## 1. Layered Architecture (N-tier)

### Definition
Organizes code into horizontal layers where each layer has a specific responsibility. Dependencies flow downward only.

### Canonical Layers
```
┌─────────────────────────────────┐
│       Presentation Layer        │  ← Controllers, Views, DTOs
├─────────────────────────────────┤
│        Application Layer        │  ← Use cases, Orchestration
├─────────────────────────────────┤
│         Business Layer          │  ← Domain logic, Services
├─────────────────────────────────┤
│       Persistence Layer         │  ← Repositories, DAOs
├─────────────────────────────────┤
│       Infrastructure Layer      │  ← Database, External APIs
└─────────────────────────────────┘
```

### Use Cases
- Traditional enterprise applications
- REST APIs with CRUD operations
- Applications with clear separation needs
- Teams familiar with layered thinking

### Pros
- Simple mental model
- Clear separation of concerns
- Easy to understand and onboard
- Well-documented patterns

### Cons
- Can lead to anemic domain models
- Changes often ripple through layers
- Horizontal coupling within layers
- Difficult to extract features

### Detection Markers
```yaml
directory_patterns:
  - controllers/ OR api/ OR presentation/ OR web/
  - services/ OR application/ OR business/
  - repositories/ OR persistence/ OR data/ OR dao/
  - models/ OR entities/ OR domain/

import_patterns:
  - controllers import services
  - services import repositories
  - repositories import models
  - NO reverse imports (repositories → services)

naming_conventions:
  - "*Controller", "*Service", "*Repository"
  - "*DTO", "*Entity", "*Model"
  - "*Handler", "*Manager", "*Provider"

confidence_indicators:
  high:
    - 3+ layer directories present
    - Consistent naming (*Service, *Repository)
    - Clear import direction
  medium:
    - 2 layer directories
    - Mixed naming conventions
  low:
    - Single layer hints
    - Inconsistent structure
```

---

## 2. Hexagonal Architecture (Ports & Adapters)

### Definition
Places domain logic at the center, surrounded by ports (interfaces) that define how the outside world interacts with the domain. Adapters implement these ports for specific technologies.

### Structure
```
                    ┌─────────────┐
                    │   Driving   │
                    │  Adapters   │
                    │ (REST, CLI) │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Driving   │
                    │    Ports    │
                    │ (Interfaces)│
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │                         │
              │      Domain Core        │
              │   (Business Logic)      │
              │                         │
              └────────────┬────────────┘
                           │
                    ┌──────▼──────┐
                    │   Driven    │
                    │    Ports    │
                    │ (Interfaces)│
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Driven    │
                    │  Adapters   │
                    │ (DB, APIs)  │
                    └─────────────┘
```

### Use Cases
- Applications requiring technology independence
- Systems with multiple entry points (API, CLI, events)
- Projects planning database or framework migration
- Domain-driven design implementations

### Pros
- Technology-agnostic domain
- Easy to test in isolation
- Swap implementations freely
- Clear dependency direction

### Cons
- More initial boilerplate
- Requires discipline to maintain boundaries
- Can be overkill for simple CRUD
- Learning curve for teams

### Detection Markers
```yaml
directory_patterns:
  - domain/ OR core/
  - ports/ OR interfaces/
  - adapters/ (with in/ and out/ OR driving/ and driven/)
  - application/ OR usecases/
  - infrastructure/

file_patterns:
  - *Port.java, *Port.ts, *_port.py
  - *Adapter.java, *Adapter.ts, *_adapter.py
  - domain/model/, domain/service/

import_patterns:
  - adapters import ports
  - adapters import domain
  - domain imports NOTHING from adapters
  - ports are interfaces/protocols

configuration:
  - Dependency injection setup
  - Interface bindings to implementations

confidence_indicators:
  high:
    - Explicit ports/ and adapters/ directories
    - Domain has zero infrastructure imports
    - Port interfaces with adapter implementations
  medium:
    - Ports exist but implicit (interfaces in domain)
    - Adapters not clearly separated
  low:
    - Interface-based design without clear hexagonal intent
```

---

## 3. Clean Architecture

### Definition
Concentric circles where dependencies point inward. Inner circles contain business rules, outer circles contain mechanisms. The Dependency Rule is absolute.

### Layers (Inside to Outside)
```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │                                           │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │                                     │  │  │
│  │  │  ┌───────────────────────────────┐  │  │  │
│  │  │  │         Entities              │  │  │  │
│  │  │  │    (Enterprise Business)      │  │  │  │
│  │  │  └───────────────────────────────┘  │  │  │
│  │  │         Use Cases                   │  │  │
│  │  │    (Application Business)           │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  │         Interface Adapters                │  │
│  │    (Controllers, Presenters, Gateways)    │  │
│  └───────────────────────────────────────────┘  │
│         Frameworks & Drivers                    │
│    (Web, DB, Devices, External Interfaces)      │
└─────────────────────────────────────────────────┘
```

### Use Cases
- Complex enterprise applications
- Long-lived systems requiring maintainability
- Applications with multiple delivery mechanisms
- Teams adopting Uncle Bob's principles

### Pros
- Independent of frameworks
- Highly testable
- Independent of UI and database
- Business rules are isolated

### Cons
- Significant boilerplate
- Steep learning curve
- May slow initial development
- Requires strict discipline

### Detection Markers
```yaml
directory_patterns:
  - entities/ OR domain/entities/
  - usecases/ OR application/usecases/ OR interactors/
  - adapters/ OR interface_adapters/ OR controllers/ + presenters/ + gateways/
  - frameworks/ OR infrastructure/ OR drivers/

file_patterns:
  - "*UseCase.java", "*Interactor.ts", "*_use_case.py"
  - "*Presenter.java", "*Gateway.ts"
  - "*InputPort", "*OutputPort", "*InputBoundary", "*OutputBoundary"

import_patterns:
  - entities import nothing external
  - usecases import only entities
  - adapters import usecases and entities
  - frameworks import adapters

configuration:
  - Dependency injection with interface bindings
  - Clear module/package boundaries

confidence_indicators:
  high:
    - usecases/ directory with InputPort/OutputPort pattern
    - Entities have zero external imports
    - Presenter/Gateway separation
  medium:
    - UseCase classes but no port separation
    - Entities have some infrastructure leakage
  low:
    - Service classes without clear boundaries
```

---

## 4. Onion Architecture

### Definition
Similar to Clean Architecture but emphasizes domain model at the core with application services, domain services, and infrastructure as concentric layers.

### Layers
```
┌─────────────────────────────────────────────────┐
│              Infrastructure                     │
│  ┌───────────────────────────────────────────┐  │
│  │         Application Services              │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │       Domain Services               │  │  │
│  │  │  ┌───────────────────────────────┐  │  │  │
│  │  │  │       Domain Model            │  │  │  │
│  │  │  │   (Entities, Value Objects)   │  │  │  │
│  │  │  └───────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Use Cases
- Domain-Driven Design projects
- Applications with rich domain logic
- .NET ecosystem (common pattern)
- Enterprise applications

### Pros
- Domain is truly independent
- Promotes rich domain models
- Natural fit with DDD
- Easy to test domain in isolation

### Cons
- Can be confused with Clean Architecture
- Infrastructure can become bloated
- Requires DDD knowledge
- Layer definitions can blur

### Detection Markers
```yaml
directory_patterns:
  - Core/ OR Domain/ containing:
    - Entities/
    - ValueObjects/
    - DomainServices/
    - Interfaces/
  - Application/ containing services
  - Infrastructure/ containing implementations

file_patterns:
  - ValueObject base classes
  - Entity base classes with Id
  - IRepository interfaces in Core/Domain
  - Repository implementations in Infrastructure

import_patterns:
  - Domain imports nothing
  - DomainServices import Domain
  - ApplicationServices import Domain + DomainServices
  - Infrastructure implements interfaces from Domain

naming_conventions:
  - "I*Repository" in Core
  - "*Repository" in Infrastructure
  - "*Service" in Application

confidence_indicators:
  high:
    - Core/ with DomainServices/ and Interfaces/
    - IRepository pattern with Infrastructure implementation
    - ValueObjects/ directory
  medium:
    - Domain separation but no DomainServices
    - Repository interfaces in wrong layer
  low:
    - Generic layered structure
```

---

## 5. Vertical Slices

### Definition
Organizes code by feature/use case rather than technical layer. Each slice contains all layers needed for that feature.

### Structure
```
src/
├── features/
│   ├── create-order/
│   │   ├── CreateOrderCommand.ts
│   │   ├── CreateOrderHandler.ts
│   │   ├── CreateOrderValidator.ts
│   │   └── CreateOrderRepository.ts
│   ├── get-order/
│   │   ├── GetOrderQuery.ts
│   │   ├── GetOrderHandler.ts
│   │   └── GetOrderReadModel.ts
│   └── cancel-order/
│       ├── CancelOrderCommand.ts
│       ├── CancelOrderHandler.ts
│       └── OrderCancellationService.ts
└── shared/
    ├── domain/
    └── infrastructure/
```

### Use Cases
- Feature-team organizations
- Microservices extraction candidates
- Applications with many independent features
- Teams wanting minimal cross-cutting concerns

### Pros
- Changes localized to slice
- Easy to understand feature scope
- Natural path to microservices
- Minimal merge conflicts

### Cons
- Potential code duplication
- Shared concerns need thought
- Can lead to inconsistency
- Cross-cutting features awkward

### Detection Markers
```yaml
directory_patterns:
  - features/ OR modules/ OR slices/ OR usecases/
  - Each subdirectory contains multiple layer files
  - shared/ OR common/ for cross-cutting

file_patterns:
  - *Command.ts + *Handler.ts in same directory
  - *Query.ts + *Handler.ts in same directory
  - Feature-specific repositories in feature folder

import_patterns:
  - Minimal imports between features/
  - Features import from shared/
  - No feature imports another feature (ideally)

structure_indicators:
  - Each feature directory is self-contained
  - 3+ files per feature directory
  - No global controllers/ or services/ directory

confidence_indicators:
  high:
    - features/ with self-contained subdirectories
    - Command/Query + Handler pattern per feature
    - Minimal cross-feature imports
  medium:
    - Feature folders but shared services outside
    - Some cross-feature dependencies
  low:
    - Module folders but layered within
```

---

## 6. MVC/MVP/MVVM

### MVC (Model-View-Controller)
```
     User Action
          │
          ▼
    ┌─────────────┐     Updates     ┌─────────────┐
    │ Controller  │────────────────▶│    Model    │
    └─────────────┘                 └─────────────┘
          │                               │
          │ Selects                       │ Notifies
          ▼                               ▼
    ┌─────────────┐◀────────────────┌─────────────┐
    │    View     │    Observes     │    Model    │
    └─────────────┘                 └─────────────┘
```

### MVP (Model-View-Presenter)
```
    ┌─────────────┐     Updates     ┌─────────────┐
    │  Presenter  │────────────────▶│    Model    │
    └─────────────┘                 └─────────────┘
          ▲                               │
          │ User Events                   │ Data
          │                               ▼
    ┌─────────────┐◀────────────────┌─────────────┐
    │    View     │    Updates      │  Presenter  │
    └─────────────┘                 └─────────────┘
```

### MVVM (Model-View-ViewModel)
```
    ┌─────────────┐     Updates     ┌─────────────┐
    │  ViewModel  │────────────────▶│    Model    │
    └─────────────┘                 └─────────────┘
          ▲                               │
          │ Data Binding                  │ Data
          │ (Two-way)                     ▼
    ┌─────────────┐◀────────────────┌─────────────┐
    │    View     │                 │  ViewModel  │
    └─────────────┘                 └─────────────┘
```

### Use Cases
- **MVC**: Web applications, Rails, Django, ASP.NET MVC
- **MVP**: Desktop apps, Android (legacy), testable UIs
- **MVVM**: WPF, Xamarin, Vue.js, Angular, SwiftUI

### Detection Markers
```yaml
mvc_patterns:
  directories:
    - controllers/ AND views/ AND models/
    - app/controllers/ AND app/views/ AND app/models/
  frameworks:
    - Rails, Django, Laravel, ASP.NET MVC, Spring MVC
  files:
    - "*Controller.rb", "*Controller.php", "*Controller.java"

mvp_patterns:
  directories:
    - presenters/ AND views/ AND models/
  files:
    - "*Presenter.java", "*Presenter.kt"
    - "*View.java" (interface), "*ViewImpl.java"
  indicators:
    - View interfaces
    - Presenter holds View reference

mvvm_patterns:
  directories:
    - viewmodels/ OR view-models/
    - views/ AND models/
  files:
    - "*ViewModel.ts", "*ViewModel.swift", "*ViewModel.cs"
  frameworks:
    - WPF, Xamarin, Vue.js, Angular, SwiftUI
  indicators:
    - Observable/reactive properties
    - Data binding in views
    - @observable, @Bindable, @Published decorators

confidence_indicators:
  high:
    - Framework-specific conventions (Rails, Angular)
    - Clear directory structure
    - Naming conventions match pattern
  medium:
    - Partial directory structure
    - Mixed naming
  low:
    - Single pattern hint
```

---

## 7. Microservices

### Definition
Application as a suite of small, independently deployable services, each running its own process and communicating via lightweight mechanisms.

### Structure
```
project/
├── services/
│   ├── order-service/
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── README.md
│   ├── payment-service/
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── pom.xml
│   └── notification-service/
│       ├── src/
│       ├── Dockerfile
│       └── go.mod
├── api-gateway/
├── docker-compose.yml
└── kubernetes/
```

### Use Cases
- Large-scale applications
- Multiple team ownership
- Polyglot environments
- Independent scaling needs

### Pros
- Independent deployment
- Technology diversity
- Fault isolation
- Team autonomy

### Cons
- Distributed system complexity
- Network latency
- Data consistency challenges
- Operational overhead

### Detection Markers
```yaml
directory_patterns:
  - services/ OR microservices/ with multiple subdirectories
  - Each subdirectory has own build file (package.json, pom.xml, go.mod)
  - api-gateway/ OR gateway/
  - kubernetes/ OR k8s/ OR helm/

file_patterns:
  - Multiple Dockerfile files (one per service)
  - docker-compose.yml with multiple services
  - Service-specific configuration files

configuration:
  - Service discovery configuration
  - API gateway routes
  - Message broker setup (Kafka, RabbitMQ)

infrastructure_indicators:
  - kubernetes/*.yaml with multiple deployments
  - Terraform/Pulumi for multiple services
  - CI/CD pipelines per service

confidence_indicators:
  high:
    - Multiple services with own Dockerfile
    - docker-compose.yml or kubernetes configs
    - Independent build files per service
  medium:
    - services/ directory but shared build
    - Some containerization
  low:
    - Modular monolith with service naming
```

---

## 8. Modular Monolith

### Definition
A single deployable unit organized into well-defined, loosely coupled modules with clear boundaries and explicit dependencies.

### Structure
```
src/
├── modules/
│   ├── ordering/
│   │   ├── internal/
│   │   ├── public/
│   │   └── module.ts
│   ├── inventory/
│   │   ├── internal/
│   │   ├── public/
│   │   └── module.ts
│   └── shipping/
│       ├── internal/
│       ├── public/
│       └── module.ts
├── shared/
└── main.ts
```

### Use Cases
- Monoliths needing better structure
- Teams considering future microservices
- Medium-sized applications
- Single deployment requirement

### Pros
- Simpler deployment than microservices
- Clear module boundaries
- Easier refactoring
- Path to microservices if needed

### Cons
- Requires discipline for boundaries
- Still single deployment
- Can regress to big ball of mud
- Shared database challenges

### Detection Markers
```yaml
directory_patterns:
  - modules/ with multiple subdirectories
  - Each module has internal/ and public/ (or api/)
  - shared/ OR common/ OR kernel/
  - Single build file at root

file_patterns:
  - module.ts, Module.java, __init__.py per module
  - Public API exports from each module
  - Internal implementations hidden

import_patterns:
  - Modules import only from other modules' public/
  - Internal imports stay within module
  - No cross-module internal imports

configuration:
  - Module registration in main entry
  - Dependency injection per module
  - Single deployment configuration

confidence_indicators:
  high:
    - modules/ with internal/public separation
    - Explicit module exports
    - Import restrictions enforced
  medium:
    - modules/ directory but no internal/public
    - Some cross-module violations
  low:
    - Package/folder organization without module contracts
```

---

## 9. Event-Driven Architecture

### Definition
Components communicate through events (facts about what happened). Decouples producers from consumers.

### Patterns
```
Event Sourcing:
┌─────────┐    Command    ┌─────────┐    Event    ┌─────────┐
│ Client  │──────────────▶│ Handler │────────────▶│  Store  │
└─────────┘               └─────────┘             └─────────┘
                                                       │
                                                       ▼
                          ┌─────────┐    Event    ┌─────────┐
                          │ Projec- │◀────────────│  Store  │
                          │  tion   │             └─────────┘
                          └─────────┘

Pub/Sub:
┌─────────┐    Publish    ┌─────────┐   Deliver   ┌─────────┐
│Producer │──────────────▶│  Broker │────────────▶│Consumer │
└─────────┘               └─────────┘             └─────────┘
                               │
                               ├────────────────▶ Consumer 2
                               └────────────────▶ Consumer 3
```

### Use Cases
- Audit trails
- Complex workflows
- Integration between systems
- Real-time processing

### Pros
- Loose coupling
- Audit trail built-in
- Temporal queries (event sourcing)
- Scalable consumers

### Cons
- Eventual consistency
- Debugging complexity
- Event versioning challenges
- Learning curve

### Detection Markers
```yaml
directory_patterns:
  - events/ OR domain-events/
  - handlers/ OR event-handlers/ OR subscribers/
  - projections/ OR read-models/
  - sagas/ OR process-managers/

file_patterns:
  - "*Event.ts", "*Event.java", "*_event.py"
  - "*Handler.ts", "*Subscriber.java"
  - "*Projection.ts", "*ReadModel.java"
  - "*Saga.ts", "*ProcessManager.java"

code_patterns:
  - Event classes with timestamp, aggregateId
  - EventStore or EventRepository
  - @EventHandler, @Subscribe decorators
  - publish(), emit(), dispatch() methods

infrastructure:
  - Kafka, RabbitMQ, EventStoreDB configuration
  - Message broker connection strings
  - Event serialization/deserialization

confidence_indicators:
  high:
    - events/ + handlers/ directories
    - EventStore or event sourcing library
    - Saga/ProcessManager pattern
  medium:
    - Event classes but no clear store
    - Pub/sub without full event sourcing
  low:
    - Observer pattern or callbacks
```

---

## 10. CQRS (Command Query Responsibility Segregation)

### Definition
Separates read and write operations into different models. Commands mutate state, Queries return data.

### Structure
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────┐                         ┌──────────┐          │
│  │  Client  │                         │  Client  │          │
│  └────┬─────┘                         └────┬─────┘          │
│       │ Command                            │ Query          │
│       ▼                                    ▼                │
│  ┌──────────┐                         ┌──────────┐          │
│  │ Command  │                         │  Query   │          │
│  │ Handler  │                         │ Handler  │          │
│  └────┬─────┘                         └────┬─────┘          │
│       │                                    │                │
│       ▼                                    ▼                │
│  ┌──────────┐      Sync/Event        ┌──────────┐          │
│  │  Write   │─────────────────────▶  │  Read    │          │
│  │  Model   │                        │  Model   │          │
│  └──────────┘                        └──────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Use Cases
- Read-heavy applications
- Complex domain writes
- Different scaling needs for read/write
- Event sourcing complement

### Pros
- Optimized read models
- Simplified write models
- Independent scaling
- Flexible querying

### Cons
- Increased complexity
- Eventual consistency
- More code to maintain
- Synchronization challenges

### Detection Markers
```yaml
directory_patterns:
  - commands/ AND queries/
  - write/ OR write-model/ AND read/ OR read-model/
  - handlers/ with command and query subdirectories

file_patterns:
  - "*Command.ts", "*Query.ts"
  - "*CommandHandler.ts", "*QueryHandler.ts"
  - "*WriteModel.ts", "*ReadModel.ts"
  - "*Projection.ts" (if with event sourcing)

code_patterns:
  - Command classes (imperative naming: CreateOrder)
  - Query classes (interrogative: GetOrderById)
  - Separate repositories for read/write
  - Mediator pattern (MediatR, etc.)

infrastructure:
  - Different databases for read/write
  - Synchronization mechanisms
  - Read replica configurations

confidence_indicators:
  high:
    - commands/ AND queries/ directories
    - Separate read/write models
    - CommandHandler/QueryHandler pattern
  medium:
    - Command classes but shared models
    - Query separation but same database
  low:
    - Service method separation only
```

---

## Pattern Combinations

Patterns are often combined:

| Combination | Description |
|-------------|-------------|
| Clean + CQRS | Clean Architecture with command/query separation |
| Hexagonal + Event-Driven | Ports for events, adapters for message brokers |
| Microservices + Event-Driven | Services communicate via events |
| Vertical Slices + CQRS | Each slice handles specific commands/queries |
| Modular Monolith + Clean | Modules with clean architecture internally |

### Detection of Combinations
```yaml
clean_cqrs:
  - usecases/commands/ AND usecases/queries/
  - entities/ at core

hexagonal_events:
  - ports/events/ OR ports/messaging/
  - adapters/kafka/ OR adapters/rabbitmq/

microservices_events:
  - Multiple services with event directories
  - Message broker configuration
  - Event contracts shared

vertical_cqrs:
  - features/*/commands/ AND features/*/queries/
  - Feature-scoped handlers
```

---

## Quick Detection Algorithm

```
1. Check for microservices indicators:
   - Multiple Dockerfiles → MICROSERVICES
   - docker-compose with multiple services → MICROSERVICES

2. Check for feature organization:
   - features/ with self-contained dirs → VERTICAL_SLICES

3. Check for CQRS:
   - commands/ AND queries/ → CQRS

4. Check for event-driven:
   - events/ + handlers/ + EventStore → EVENT_DRIVEN

5. Check for hexagonal/clean/onion:
   - ports/ + adapters/ → HEXAGONAL
   - usecases/ + entities/ → CLEAN
   - Core/ with DomainServices/ → ONION

6. Check for modular:
   - modules/ with internal/public → MODULAR_MONOLITH

7. Check for MVC variants:
   - controllers/ + views/ + models/ → MVC
   - viewmodels/ → MVVM
   - presenters/ → MVP

8. Default check for layered:
   - services/ + repositories/ → LAYERED

9. Multiple patterns detected:
   - Report as combination
```

---

## References

- Martin Fowler's Architecture Patterns
- Uncle Bob's Clean Architecture
- Alistair Cockburn's Hexagonal Architecture
- Domain-Driven Design (Eric Evans)
- Building Microservices (Sam Newman)
- Implementing Domain-Driven Design (Vaughn Vernon)
