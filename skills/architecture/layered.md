# Layered Architecture (N-Tier) Deep Dive

> The most common architecture pattern: horizontal layers with dependencies flowing downward.

---

## Core Concept

Layered architecture divides an application into horizontal layers, each with a specific responsibility. Dependencies flow in one direction: **outer layers depend on inner layers, never the reverse**.

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                          │
│  Controllers, Views, DTOs, API Endpoints, CLI, UI               │
├─────────────────────────────────────────────────────────────────┤
│                     APPLICATION LAYER                           │
│  Use Cases, Orchestration, Application Services, Transactions   │
├─────────────────────────────────────────────────────────────────┤
│                      BUSINESS LAYER                             │
│  Domain Logic, Business Rules, Domain Services, Entities        │
├─────────────────────────────────────────────────────────────────┤
│                     PERSISTENCE LAYER                           │
│  Repositories, DAOs, Data Mappers, ORM Configurations           │
├─────────────────────────────────────────────────────────────────┤
│                   INFRASTRUCTURE LAYER                          │
│  Database, File System, External APIs, Message Queues           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer Definitions

### Presentation Layer
**Purpose**: Handle external interface (HTTP, CLI, UI)

```typescript
// controllers/OrderController.ts
@Controller('/orders')
export class OrderController {
    constructor(private orderService: OrderService) {}

    @Post()
    async createOrder(@Body() dto: CreateOrderDto): Promise<OrderResponse> {
        const order = await this.orderService.createOrder(dto);
        return OrderResponse.fromDomain(order);
    }

    @Get(':id')
    async getOrder(@Param('id') id: string): Promise<OrderResponse> {
        const order = await this.orderService.findById(id);
        if (!order) throw new NotFoundException();
        return OrderResponse.fromDomain(order);
    }
}
```

**Responsibilities**:
- Request/response handling
- Input validation (format, not business rules)
- DTO transformation
- Error handling and HTTP status codes
- Authentication/authorization checks

**Should NOT contain**:
- Business logic
- Direct database access
- Complex calculations

### Application Layer
**Purpose**: Orchestrate use cases and coordinate work

```typescript
// services/OrderService.ts
@Injectable()
export class OrderService {
    constructor(
        private orderRepository: OrderRepository,
        private inventoryService: InventoryService,
        private paymentService: PaymentService,
        private notificationService: NotificationService
    ) {}

    async createOrder(dto: CreateOrderDto): Promise<Order> {
        // Orchestration logic
        const inventory = await this.inventoryService.checkAvailability(dto.items);
        if (!inventory.available) {
            throw new InsufficientInventoryError(inventory.missing);
        }

        const order = Order.create(dto.customerId, dto.items);

        // Transaction boundary
        await this.orderRepository.save(order);
        await this.inventoryService.reserve(order.id, dto.items);

        // Side effects
        await this.notificationService.sendOrderConfirmation(order);

        return order;
    }
}
```

**Responsibilities**:
- Use case orchestration
- Transaction management
- Cross-cutting concerns coordination
- Calling domain services
- Event publishing

**Should NOT contain**:
- Business rules (delegate to domain)
- Direct SQL/database queries
- HTTP-specific logic

### Business/Domain Layer
**Purpose**: Encapsulate business rules and domain logic

```typescript
// domain/Order.ts
export class Order {
    private constructor(
        public readonly id: OrderId,
        public readonly customerId: CustomerId,
        private items: OrderItem[],
        private status: OrderStatus,
        public readonly createdAt: Date
    ) {}

    static create(customerId: CustomerId, items: OrderItemDto[]): Order {
        if (items.length === 0) {
            throw new EmptyOrderError();
        }

        const orderItems = items.map(item => OrderItem.create(item));

        return new Order(
            OrderId.generate(),
            customerId,
            orderItems,
            OrderStatus.PENDING,
            new Date()
        );
    }

    get total(): Money {
        return this.items.reduce(
            (sum, item) => sum.add(item.subtotal),
            Money.zero()
        );
    }

    confirm(): void {
        if (this.status !== OrderStatus.PENDING) {
            throw new InvalidOrderStateError(
                `Cannot confirm order in ${this.status} state`
            );
        }
        this.status = OrderStatus.CONFIRMED;
    }

    cancel(reason: string): void {
        if (this.status === OrderStatus.SHIPPED) {
            throw new InvalidOrderStateError('Cannot cancel shipped order');
        }
        this.status = OrderStatus.CANCELLED;
    }
}
```

**Responsibilities**:
- Business rules and validation
- Domain calculations
- State transitions
- Invariant enforcement

**Should NOT contain**:
- Infrastructure concerns
- HTTP/database knowledge
- External service calls

### Persistence Layer
**Purpose**: Abstract data storage operations

```typescript
// repositories/OrderRepository.ts
export interface OrderRepository {
    save(order: Order): Promise<void>;
    findById(id: OrderId): Promise<Order | null>;
    findByCustomer(customerId: CustomerId): Promise<Order[]>;
    findByStatus(status: OrderStatus): Promise<Order[]>;
}

// repositories/impl/PostgresOrderRepository.ts
@Injectable()
export class PostgresOrderRepository implements OrderRepository {
    constructor(private dataSource: DataSource) {}

    async save(order: Order): Promise<void> {
        const entity = this.toEntity(order);
        await this.dataSource.getRepository(OrderEntity).save(entity);
    }

    async findById(id: OrderId): Promise<Order | null> {
        const entity = await this.dataSource
            .getRepository(OrderEntity)
            .findOne({ where: { id: id.value } });

        return entity ? this.toDomain(entity) : null;
    }

    private toEntity(order: Order): OrderEntity {
        // Map domain to persistence model
    }

    private toDomain(entity: OrderEntity): Order {
        // Map persistence to domain model
    }
}
```

**Responsibilities**:
- CRUD operations
- Query construction
- Domain ↔ Persistence mapping
- Connection management

**Should NOT contain**:
- Business logic
- HTTP knowledge
- Direct entity exposure to upper layers

---

## Layer Boundaries and Rules

### The Dependency Rule

```
┌─────────────────────────────────────────────────────────────────┐
│  PRESENTATION                                                   │
│       │                                                         │
│       │ depends on                                              │
│       ▼                                                         │
│  APPLICATION                                                    │
│       │                                                         │
│       │ depends on                                              │
│       ▼                                                         │
│  DOMAIN                                                         │
│       │                                                         │
│       │ depends on (via interfaces)                             │
│       ▼                                                         │
│  INFRASTRUCTURE (implements domain interfaces)                  │
└─────────────────────────────────────────────────────────────────┘
```

### Allowed Imports

```yaml
presentation:
  can_import:
    - application (services)
    - domain (entities, value objects for DTOs)
  cannot_import:
    - persistence (repositories)
    - infrastructure

application:
  can_import:
    - domain (entities, domain services)
    - persistence (repository interfaces)
  cannot_import:
    - presentation
    - infrastructure (directly)

domain:
  can_import:
    - nothing external
    - only domain primitives and interfaces
  cannot_import:
    - presentation
    - application
    - persistence
    - infrastructure

persistence:
  can_import:
    - domain (to implement repository interfaces)
  cannot_import:
    - presentation
    - application
```

### Interface Boundaries

```typescript
// Domain layer defines interface
// domain/ports/OrderRepository.ts
export interface OrderRepository {
    save(order: Order): Promise<void>;
    findById(id: OrderId): Promise<Order | null>;
}

// Infrastructure layer implements it
// infrastructure/persistence/PostgresOrderRepository.ts
export class PostgresOrderRepository implements OrderRepository {
    // Implementation
}

// Application layer uses interface (injected)
// application/OrderService.ts
export class OrderService {
    constructor(private orderRepository: OrderRepository) {}
    // Uses repository through interface
}
```

---

## Common Violations

### 1. Controller Directly Accessing Repository

```typescript
// VIOLATION: Presentation layer bypasses service layer
@Controller('/orders')
export class OrderController {
    constructor(private orderRepository: OrderRepository) {} // WRONG!

    @Get(':id')
    async getOrder(@Param('id') id: string) {
        return this.orderRepository.findById(id); // Bypasses business logic
    }
}

// CORRECT: Go through service layer
@Controller('/orders')
export class OrderController {
    constructor(private orderService: OrderService) {} // Correct

    @Get(':id')
    async getOrder(@Param('id') id: string) {
        return this.orderService.findById(id);
    }
}
```

### 2. Domain Entity with ORM Decorators

```typescript
// VIOLATION: Domain polluted with infrastructure concerns
@Entity()
export class Order {
    @PrimaryColumn()
    id: string;

    @Column()
    status: string;

    @ManyToOne(() => Customer)  // Infrastructure leaking into domain
    customer: Customer;
}

// CORRECT: Separate domain entity from persistence entity
// domain/Order.ts (pure domain)
export class Order {
    constructor(
        public readonly id: OrderId,
        private status: OrderStatus
    ) {}
}

// infrastructure/entities/OrderEntity.ts (persistence)
@Entity('orders')
export class OrderEntity {
    @PrimaryColumn()
    id: string;

    @Column()
    status: string;
}
```

### 3. Business Logic in Controller

```typescript
// VIOLATION: Business rules in presentation layer
@Controller('/orders')
export class OrderController {
    @Post()
    async createOrder(@Body() dto: CreateOrderDto) {
        // Business logic leaked into controller
        if (dto.total > 1000 && !dto.customerId.startsWith('VIP')) {
            throw new BadRequestException('Non-VIP limit exceeded');
        }

        const discount = dto.total > 500 ? 0.1 : 0;
        dto.total = dto.total * (1 - discount);

        return this.orderRepository.save(dto);
    }
}

// CORRECT: Business logic in domain/service
export class Order {
    static create(dto: CreateOrderDto): Order {
        if (!dto.isVip && dto.total > 1000) {
            throw new OrderLimitExceededError();
        }
        // Domain handles business rules
    }

    get discount(): number {
        return this.total.amount > 500 ? 0.1 : 0;
    }
}
```

### 4. Service Returning Entities Directly

```typescript
// VIOLATION: Domain entities exposed to presentation
@Controller('/orders')
export class OrderController {
    @Get(':id')
    async getOrder(@Param('id') id: string): Promise<Order> {
        return this.orderService.findById(id); // Exposes internal structure
    }
}

// CORRECT: Use DTOs for layer boundary
@Controller('/orders')
export class OrderController {
    @Get(':id')
    async getOrder(@Param('id') id: string): Promise<OrderResponse> {
        const order = await this.orderService.findById(id);
        return OrderResponse.fromDomain(order); // Map to DTO
    }
}
```

### 5. Circular Dependencies Between Layers

```typescript
// VIOLATION: Service imports controller types
// services/OrderService.ts
import { CreateOrderDto } from '../controllers/dto/CreateOrderDto'; // WRONG!

// CORRECT: Shared DTOs or service-specific types
// services/OrderService.ts
import { CreateOrderCommand } from './commands/CreateOrderCommand';
// OR
import { CreateOrderDto } from '../dto/CreateOrderDto'; // Shared module
```

---

## Detection Patterns

### Directory Structure Indicators

```yaml
strong_indicators:
  presence_of:
    - controllers/ OR api/ OR presentation/ OR web/
    - services/ OR application/ OR business/
    - repositories/ OR persistence/ OR data/ OR dao/
    - models/ OR entities/ OR domain/

  minimum_match: 3 of 4

moderate_indicators:
  presence_of:
    - handlers/ (without commands/queries separation)
    - providers/
    - managers/

negative_indicators:
  presence_of:
    - ports/ AND adapters/  # Suggests hexagonal
    - features/ (self-contained) # Suggests vertical slices
    - usecases/ # Suggests clean architecture
```

### Import Pattern Detection

```python
def detect_layered_architecture(codebase):
    """
    Detect layered architecture from import patterns.
    """
    # Define expected layer directories
    layer_dirs = {
        'presentation': ['controllers', 'api', 'web', 'presentation'],
        'application': ['services', 'application', 'business'],
        'domain': ['domain', 'models', 'entities'],
        'persistence': ['repositories', 'persistence', 'data', 'dao']
    }

    # Find matching directories
    found_layers = {}
    for layer, dirs in layer_dirs.items():
        for d in dirs:
            if exists(join(codebase.root, 'src', d)):
                found_layers[layer] = d
                break

    if len(found_layers) < 3:
        return {'detected': False, 'reason': 'Insufficient layer directories'}

    # Analyze import directions
    violations = []

    for file in codebase.files:
        file_layer = determine_layer(file, found_layers)
        imports = extract_imports(file)

        for imp in imports:
            imp_layer = determine_layer(imp, found_layers)
            if not is_valid_layer_dependency(file_layer, imp_layer):
                violations.append({
                    'file': file,
                    'imports': imp,
                    'violation': f'{file_layer} -> {imp_layer}'
                })

    return {
        'detected': True,
        'layers': found_layers,
        'violations': violations,
        'conformance': 1 - (len(violations) / max(1, len(codebase.files)))
    }
```

### Naming Convention Patterns

```yaml
controller_patterns:
  - "*Controller.ts"
  - "*Controller.java"
  - "*_controller.py"
  - "*_controller.rb"
  - "*Controller.cs"

service_patterns:
  - "*Service.ts"
  - "*Service.java"
  - "*_service.py"
  - "*_service.rb"
  - "*Service.cs"
  - "*Manager.ts"
  - "*Facade.java"

repository_patterns:
  - "*Repository.ts"
  - "*Repository.java"
  - "*_repository.py"
  - "*_repo.rb"
  - "*Repository.cs"
  - "*DAO.java"
  - "*Dao.java"

entity_patterns:
  - "*Entity.ts"
  - "*Entity.java"
  - "*Model.ts"
  - "*Model.py"
```

### Framework-Specific Detection

```yaml
spring_boot:
  indicators:
    - "@Controller", "@RestController"
    - "@Service"
    - "@Repository"
    - "@Entity"
  structure:
    - src/main/java/{package}/controller/
    - src/main/java/{package}/service/
    - src/main/java/{package}/repository/
    - src/main/java/{package}/entity/

nestjs:
  indicators:
    - "@Controller()"
    - "@Injectable()"
    - "@InjectRepository()"
  structure:
    - src/{module}/controllers/
    - src/{module}/services/
    - src/{module}/entities/

django:
  indicators:
    - views.py
    - models.py
    - serializers.py
  structure:
    - {app}/views.py
    - {app}/models.py
    - {app}/services.py (if exists)

rails:
  indicators:
    - app/controllers/
    - app/models/
    - app/services/ (if exists)
  structure:
    - Follows Rails conventions
```

---

## Code Examples by Language

### Java (Spring Boot)

```java
// Controller Layer
@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderService orderService;

    @PostMapping
    public ResponseEntity<OrderResponse> createOrder(@RequestBody CreateOrderRequest request) {
        Order order = orderService.createOrder(request.toCommand());
        return ResponseEntity.ok(OrderResponse.from(order));
    }
}

// Service Layer
@Service
@Transactional
public class OrderService {
    private final OrderRepository orderRepository;
    private final InventoryClient inventoryClient;

    public Order createOrder(CreateOrderCommand command) {
        inventoryClient.reserve(command.items());
        Order order = Order.create(command);
        return orderRepository.save(order);
    }
}

// Domain Layer
public class Order {
    private OrderId id;
    private CustomerId customerId;
    private List<OrderItem> items;
    private OrderStatus status;

    public static Order create(CreateOrderCommand command) {
        // Domain validation and creation
    }
}

// Repository Layer
@Repository
public class JpaOrderRepository implements OrderRepository {
    private final JpaOrderEntityRepository jpaRepository;

    @Override
    public Order save(Order order) {
        OrderEntity entity = OrderMapper.toEntity(order);
        jpaRepository.save(entity);
        return order;
    }
}
```

### Python (FastAPI)

```python
# Controller/Router Layer
# api/routes/orders.py
from fastapi import APIRouter, Depends
from app.services.order_service import OrderService
from app.api.schemas import CreateOrderRequest, OrderResponse

router = APIRouter(prefix="/orders")

@router.post("/", response_model=OrderResponse)
async def create_order(
    request: CreateOrderRequest,
    order_service: OrderService = Depends()
):
    order = await order_service.create_order(request.to_command())
    return OrderResponse.from_domain(order)


# Service Layer
# services/order_service.py
from app.domain.order import Order
from app.repositories.order_repository import OrderRepository

class OrderService:
    def __init__(self, order_repository: OrderRepository):
        self.order_repository = order_repository

    async def create_order(self, command: CreateOrderCommand) -> Order:
        order = Order.create(command)
        await self.order_repository.save(order)
        return order


# Domain Layer
# domain/order.py
from dataclasses import dataclass
from typing import List
from app.domain.value_objects import OrderId, CustomerId

@dataclass
class Order:
    id: OrderId
    customer_id: CustomerId
    items: List[OrderItem]
    status: OrderStatus

    @classmethod
    def create(cls, command: CreateOrderCommand) -> "Order":
        if not command.items:
            raise EmptyOrderError()
        return cls(
            id=OrderId.generate(),
            customer_id=command.customer_id,
            items=[OrderItem.create(i) for i in command.items],
            status=OrderStatus.PENDING
        )


# Repository Layer
# repositories/order_repository.py
from sqlalchemy.orm import Session
from app.domain.order import Order

class SqlAlchemyOrderRepository(OrderRepository):
    def __init__(self, session: Session):
        self.session = session

    async def save(self, order: Order) -> None:
        entity = self._to_entity(order)
        self.session.add(entity)
        await self.session.commit()
```

### Go

```go
// Controller Layer
// internal/api/handlers/order_handler.go
type OrderHandler struct {
    orderService *services.OrderService
}

func (h *OrderHandler) CreateOrder(w http.ResponseWriter, r *http.Request) {
    var req CreateOrderRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    order, err := h.orderService.CreateOrder(r.Context(), req.ToCommand())
    if err != nil {
        handleError(w, err)
        return
    }

    json.NewEncoder(w).Encode(NewOrderResponse(order))
}


// Service Layer
// internal/services/order_service.go
type OrderService struct {
    orderRepo repositories.OrderRepository
    inventory InventoryClient
}

func (s *OrderService) CreateOrder(ctx context.Context, cmd CreateOrderCommand) (*domain.Order, error) {
    if err := s.inventory.Reserve(ctx, cmd.Items); err != nil {
        return nil, fmt.Errorf("reserve inventory: %w", err)
    }

    order, err := domain.NewOrder(cmd.CustomerID, cmd.Items)
    if err != nil {
        return nil, err
    }

    if err := s.orderRepo.Save(ctx, order); err != nil {
        return nil, fmt.Errorf("save order: %w", err)
    }

    return order, nil
}


// Domain Layer
// internal/domain/order.go
type Order struct {
    ID         OrderID
    CustomerID CustomerID
    Items      []OrderItem
    Status     OrderStatus
    CreatedAt  time.Time
}

func NewOrder(customerID CustomerID, items []OrderItemInput) (*Order, error) {
    if len(items) == 0 {
        return nil, ErrEmptyOrder
    }

    orderItems := make([]OrderItem, len(items))
    for i, item := range items {
        orderItems[i] = NewOrderItem(item)
    }

    return &Order{
        ID:         NewOrderID(),
        CustomerID: customerID,
        Items:      orderItems,
        Status:     OrderStatusPending,
        CreatedAt:  time.Now(),
    }, nil
}


// Repository Layer
// internal/repositories/postgres_order_repository.go
type PostgresOrderRepository struct {
    db *sql.DB
}

func (r *PostgresOrderRepository) Save(ctx context.Context, order *domain.Order) error {
    query := `INSERT INTO orders (id, customer_id, status, created_at) VALUES ($1, $2, $3, $4)`
    _, err := r.db.ExecContext(ctx, query, order.ID, order.CustomerID, order.Status, order.CreatedAt)
    return err
}
```

---

## Anti-Pattern Detection Rules

```yaml
anti_patterns:

  anemic_domain:
    description: "Domain entities are just data bags with no behavior"
    detection:
      - Entity classes have only getters/setters
      - All logic in services
      - Domain methods just return fields
    example:
      # Bad: Anemic
      class Order:
          def __init__(self):
              self.id = None
              self.status = None

      class OrderService:
          def cancel(self, order):
              if order.status == "pending":
                  order.status = "cancelled"

      # Good: Rich domain
      class Order:
          def cancel(self):
              if self.status != Status.PENDING:
                  raise InvalidStateError()
              self.status = Status.CANCELLED

  fat_controller:
    description: "Controller contains business logic"
    detection:
      - Controller methods > 20 lines
      - Controller imports repository
      - Multiple service calls with logic between

  leaky_abstraction:
    description: "Infrastructure leaks into domain"
    detection:
      - ORM decorators in domain entities
      - SQL in domain/service layer
      - Framework types in domain

  service_explosion:
    description: "Too many small services with no cohesion"
    detection:
      - Services with single method
      - Services named *HelperService, *UtilService
      - Circular service dependencies
```

---

## Refactoring Toward Clean Layers

### Step 1: Identify Layer Violations

```bash
# Find controller files that import repositories
grep -r "Repository" --include="*Controller*" -l

# Find domain files with ORM imports
grep -r "@Entity\|@Column\|from sqlalchemy" --include="*domain*" -l

# Find services with HTTP-specific code
grep -r "HttpResponse\|@RequestBody\|request\." --include="*Service*" -l
```

### Step 2: Extract Interfaces

```typescript
// Before: Direct implementation dependency
class OrderService {
    constructor(private orderRepo: PostgresOrderRepository) {}
}

// After: Interface dependency
interface OrderRepository {
    save(order: Order): Promise<void>;
    findById(id: OrderId): Promise<Order | null>;
}

class OrderService {
    constructor(private orderRepo: OrderRepository) {}
}
```

### Step 3: Separate Domain from Persistence

```typescript
// Before: Mixed concerns
@Entity()
class Order {
    @PrimaryColumn()
    id: string;

    cancel() { this.status = 'cancelled'; }
}

// After: Separated
// domain/Order.ts
class Order {
    constructor(public readonly id: OrderId) {}
    cancel() { this.status = Status.CANCELLED; }
}

// persistence/entities/OrderEntity.ts
@Entity()
class OrderEntity {
    @PrimaryColumn()
    id: string;
}

// persistence/mappers/OrderMapper.ts
class OrderMapper {
    static toDomain(entity: OrderEntity): Order { ... }
    static toEntity(domain: Order): OrderEntity { ... }
}
```

---

## Testing Strategy by Layer

```yaml
presentation_layer:
  test_type: Integration tests
  mock: Application services
  verify:
    - HTTP status codes
    - Request validation
    - Response format
    - Error handling

application_layer:
  test_type: Integration tests
  mock: Repositories, external services
  verify:
    - Use case orchestration
    - Transaction boundaries
    - Service coordination

domain_layer:
  test_type: Unit tests
  mock: Nothing (pure domain)
  verify:
    - Business rules
    - State transitions
    - Invariants
    - Calculations

persistence_layer:
  test_type: Integration tests
  mock: Nothing (use test database)
  verify:
    - CRUD operations
    - Query correctness
    - Mapping accuracy
```

---

## References

- Patterns of Enterprise Application Architecture (Martin Fowler)
- Domain-Driven Design (Eric Evans)
- Clean Architecture (Robert C. Martin)
