# Vertical Slices Architecture Deep Dive

> Organize by feature, not by layer. Each slice is self-contained with minimal cross-slice dependencies.

---

## Core Concept

Vertical Slices Architecture organizes code by **feature or use case** rather than by technical layer. Each slice contains everything needed to implement a single feature, from API endpoint to database access.

```
Traditional Layered:                    Vertical Slices:
┌────────────────────┐                 ┌────────┬────────┬────────┐
│    Controllers     │                 │Create  │ Get    │Cancel  │
├────────────────────┤                 │Order   │ Order  │Order   │
│     Services       │                 ├────────┼────────┼────────┤
├────────────────────┤                 │Handler │Handler │Handler │
│   Repositories     │                 │Service │Service │Service │
├────────────────────┤                 │Repo    │Repo    │Repo    │
│     Entities       │                 │DTO     │DTO     │DTO     │
└────────────────────┘                 └────────┴────────┴────────┘
```

---

## Key Principles

### 1. Feature Cohesion Over Layer Cohesion
Everything related to a feature lives together. When you change a feature, you change files in one place.

### 2. Minimal Coupling Between Slices
Slices should not depend on each other. If they must communicate, use:
- Shared domain models
- Events/messages
- Dedicated shared modules

### 3. Duplication Over Wrong Abstraction
Prefer duplicating code between slices over creating premature abstractions. Extract shared code only when patterns emerge clearly.

### 4. Right-Sized Slices
A slice handles one user action or use case. Not too big (entire module), not too small (single method).

---

## Directory Structure

### Canonical Structure

```
src/
├── features/                              # All features
│   ├── orders/
│   │   ├── create-order/
│   │   │   ├── CreateOrderCommand.ts      # Input model
│   │   │   ├── CreateOrderHandler.ts      # Business logic
│   │   │   ├── CreateOrderValidator.ts    # Input validation
│   │   │   ├── CreateOrderEndpoint.ts     # HTTP endpoint
│   │   │   └── CreateOrderRepository.ts   # Data access (optional)
│   │   │
│   │   ├── get-order/
│   │   │   ├── GetOrderQuery.ts
│   │   │   ├── GetOrderHandler.ts
│   │   │   ├── GetOrderEndpoint.ts
│   │   │   └── OrderReadModel.ts
│   │   │
│   │   ├── cancel-order/
│   │   │   ├── CancelOrderCommand.ts
│   │   │   ├── CancelOrderHandler.ts
│   │   │   ├── CancelOrderEndpoint.ts
│   │   │   └── CancelOrderPolicy.ts
│   │   │
│   │   └── ship-order/
│   │       ├── ShipOrderCommand.ts
│   │       ├── ShipOrderHandler.ts
│   │       └── ShipOrderEndpoint.ts
│   │
│   ├── customers/
│   │   ├── register-customer/
│   │   ├── update-profile/
│   │   └── get-customer/
│   │
│   └── payments/
│       ├── process-payment/
│       ├── refund-payment/
│       └── get-payment-status/
│
├── shared/                                # Cross-cutting concerns
│   ├── domain/                            # Shared domain models
│   │   ├── Order.ts
│   │   ├── Customer.ts
│   │   └── Money.ts
│   ├── infrastructure/                    # Shared infrastructure
│   │   ├── database/
│   │   ├── messaging/
│   │   └── logging/
│   └── middleware/                        # Shared middleware
│       ├── auth/
│       └── validation/
│
└── main.ts                                # Application entry
```

### Alternative Naming

```yaml
feature_directory_names:
  - features/
  - slices/
  - modules/
  - usecases/
  - handlers/

slice_structure_variants:
  # Flat structure (simpler)
  flat:
    - CreateOrder.ts          # Contains command, handler, endpoint
    - GetOrder.ts
    - CancelOrder.ts

  # Separated concerns
  separated:
    - commands/CreateOrderCommand.ts
    - handlers/CreateOrderHandler.ts
    - endpoints/CreateOrderEndpoint.ts

  # CQRS style
  cqrs:
    - commands/
        - CreateOrder/
        - CancelOrder/
    - queries/
        - GetOrder/
        - ListOrders/
```

---

## Slice Anatomy

### Complete Slice Example

```typescript
// features/orders/create-order/CreateOrderCommand.ts
export interface CreateOrderCommand {
    customerId: string;
    items: Array<{
        productId: string;
        quantity: number;
    }>;
    shippingAddress: {
        street: string;
        city: string;
        postalCode: string;
        country: string;
    };
}

// features/orders/create-order/CreateOrderValidator.ts
import { z } from 'zod';

export const CreateOrderCommandSchema = z.object({
    customerId: z.string().uuid(),
    items: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive()
    })).min(1),
    shippingAddress: z.object({
        street: z.string().min(1),
        city: z.string().min(1),
        postalCode: z.string().min(1),
        country: z.string().length(2)
    })
});

export function validateCreateOrderCommand(command: unknown): CreateOrderCommand {
    return CreateOrderCommandSchema.parse(command);
}

// features/orders/create-order/CreateOrderHandler.ts
import { Order } from '../../../shared/domain/Order';
import { OrderRepository } from '../../../shared/infrastructure/repositories/OrderRepository';
import { EventBus } from '../../../shared/infrastructure/messaging/EventBus';

export class CreateOrderHandler {
    constructor(
        private orderRepository: OrderRepository,
        private customerRepository: CustomerRepository,
        private inventoryService: InventoryService,
        private eventBus: EventBus
    ) {}

    async handle(command: CreateOrderCommand): Promise<string> {
        // Validate customer exists
        const customer = await this.customerRepository.findById(command.customerId);
        if (!customer) {
            throw new CustomerNotFoundError(command.customerId);
        }

        // Check inventory
        const availability = await this.inventoryService.checkAvailability(command.items);
        if (!availability.allAvailable) {
            throw new InsufficientInventoryError(availability.unavailable);
        }

        // Create order
        const order = Order.create({
            customerId: command.customerId,
            items: command.items,
            shippingAddress: command.shippingAddress
        });

        // Persist
        await this.orderRepository.save(order);

        // Reserve inventory
        await this.inventoryService.reserve(order.id, command.items);

        // Publish event
        await this.eventBus.publish(new OrderCreatedEvent(order.id, order.customerId));

        return order.id;
    }
}

// features/orders/create-order/CreateOrderEndpoint.ts
import { Router, Request, Response } from 'express';
import { CreateOrderHandler } from './CreateOrderHandler';
import { validateCreateOrderCommand } from './CreateOrderValidator';

export function createOrderEndpoint(handler: CreateOrderHandler): Router {
    const router = Router();

    router.post('/orders', async (req: Request, res: Response) => {
        try {
            const command = validateCreateOrderCommand(req.body);
            const orderId = await handler.handle(command);

            res.status(201).json({
                id: orderId,
                message: 'Order created successfully'
            });
        } catch (error) {
            if (error instanceof CustomerNotFoundError) {
                res.status(404).json({ error: 'Customer not found' });
            } else if (error instanceof InsufficientInventoryError) {
                res.status(409).json({ error: 'Insufficient inventory', items: error.items });
            } else if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation failed', details: error.errors });
            } else {
                throw error;
            }
        }
    });

    return router;
}

// features/orders/create-order/index.ts (optional barrel export)
export { CreateOrderCommand } from './CreateOrderCommand';
export { CreateOrderHandler } from './CreateOrderHandler';
export { createOrderEndpoint } from './CreateOrderEndpoint';
```

---

## Command/Query Pattern with Slices

### MediatR-Style Implementation

```typescript
// shared/infrastructure/mediator/Mediator.ts
export interface IRequest<TResponse> {
    // Marker interface
}

export interface IRequestHandler<TRequest extends IRequest<TResponse>, TResponse> {
    handle(request: TRequest): Promise<TResponse>;
}

export class Mediator {
    private handlers = new Map<string, IRequestHandler<any, any>>();

    register<TRequest extends IRequest<TResponse>, TResponse>(
        requestType: new (...args: any[]) => TRequest,
        handler: IRequestHandler<TRequest, TResponse>
    ): void {
        this.handlers.set(requestType.name, handler);
    }

    async send<TResponse>(request: IRequest<TResponse>): Promise<TResponse> {
        const handler = this.handlers.get(request.constructor.name);
        if (!handler) {
            throw new Error(`No handler registered for ${request.constructor.name}`);
        }
        return handler.handle(request);
    }
}

// features/orders/create-order/CreateOrderCommand.ts
import { IRequest } from '../../../shared/infrastructure/mediator/Mediator';

export class CreateOrderCommand implements IRequest<string> {
    constructor(
        public readonly customerId: string,
        public readonly items: OrderItemInput[],
        public readonly shippingAddress: AddressInput
    ) {}
}

// features/orders/create-order/CreateOrderHandler.ts
import { IRequestHandler } from '../../../shared/infrastructure/mediator/Mediator';
import { CreateOrderCommand } from './CreateOrderCommand';

export class CreateOrderHandler implements IRequestHandler<CreateOrderCommand, string> {
    async handle(command: CreateOrderCommand): Promise<string> {
        // Implementation
    }
}

// Usage in controller
@Controller('/orders')
export class OrdersController {
    constructor(private mediator: Mediator) {}

    @Post()
    async createOrder(@Body() body: CreateOrderRequest): Promise<{ id: string }> {
        const command = new CreateOrderCommand(
            body.customerId,
            body.items,
            body.shippingAddress
        );

        const orderId = await this.mediator.send(command);
        return { id: orderId };
    }
}
```

---

## Handling Cross-Slice Communication

### Pattern 1: Shared Domain

```
features/
├── orders/create-order/
│   └── CreateOrderHandler.ts    → uses shared Order
├── payments/process-payment/
│   └── ProcessPaymentHandler.ts → uses shared Order
└── shared/
    └── domain/
        └── Order.ts             → shared domain model
```

```typescript
// shared/domain/Order.ts
export class Order {
    // Shared domain model used by multiple slices
}

// features/orders/create-order/CreateOrderHandler.ts
import { Order } from '../../../shared/domain/Order';

// features/payments/process-payment/ProcessPaymentHandler.ts
import { Order } from '../../../shared/domain/Order';
```

### Pattern 2: Events

```typescript
// features/orders/create-order/CreateOrderHandler.ts
export class CreateOrderHandler {
    async handle(command: CreateOrderCommand): Promise<string> {
        const order = Order.create(command);
        await this.orderRepository.save(order);

        // Publish event instead of calling other slices
        await this.eventBus.publish(new OrderCreatedEvent(order.id, order.total));

        return order.id;
    }
}

// features/inventory/reserve-inventory/ReserveInventoryOnOrderCreated.ts
export class ReserveInventoryOnOrderCreated {
    constructor(private inventoryService: InventoryService) {}

    @OnEvent('OrderCreated')
    async handle(event: OrderCreatedEvent): Promise<void> {
        await this.inventoryService.reserve(event.orderId, event.items);
    }
}
```

### Pattern 3: Shared Services (Use Sparingly)

```typescript
// shared/services/InventoryService.ts
export interface InventoryService {
    checkAvailability(items: ItemInput[]): Promise<AvailabilityResult>;
    reserve(orderId: string, items: ItemInput[]): Promise<void>;
}

// features/orders/create-order/CreateOrderHandler.ts
import { InventoryService } from '../../../shared/services/InventoryService';

export class CreateOrderHandler {
    constructor(private inventoryService: InventoryService) {}
    // Uses shared service
}
```

---

## Slice Independence Rules

### What Each Slice Should Contain

```yaml
slice_contents:
  required:
    - Input model (Command/Query/Request)
    - Handler (business logic)
    - Endpoint/Entry point

  optional:
    - Validator
    - Response model
    - Slice-specific repository methods
    - Slice-specific DTOs

  should_not_contain:
    - Shared domain logic
    - Infrastructure implementations
    - Cross-cutting concerns
```

### Slice Coupling Rules

```yaml
allowed_dependencies:
  - shared/domain/           # Shared domain models
  - shared/infrastructure/   # Database, messaging, etc.
  - shared/services/         # Cross-cutting services (sparingly)

forbidden_dependencies:
  - features/other-feature/  # No direct slice-to-slice imports
  - ../sibling-slice/        # No sibling imports

communication_patterns:
  - Events for async coordination
  - Shared domain for data
  - API calls for synchronous needs (if absolutely required)
```

### Detection of Violations

```python
def detect_slice_coupling_violations(codebase):
    """
    Detect when slices import from other slices.
    """
    violations = []
    feature_dirs = find_directories(codebase, 'features')

    for feature_dir in feature_dirs:
        slices = get_subdirectories(feature_dir)

        for slice_dir in slices:
            for file in get_files(slice_dir):
                imports = extract_imports(file)

                for imp in imports:
                    # Check if import is from another slice
                    if is_slice_import(imp, slices, slice_dir):
                        violations.append({
                            'file': file,
                            'imports': imp,
                            'violation': 'Slice imports from another slice'
                        })

                    # Check if import is from another feature's slice
                    if is_cross_feature_slice_import(imp, feature_dirs, feature_dir):
                        violations.append({
                            'file': file,
                            'imports': imp,
                            'violation': 'Cross-feature slice import'
                        })

    return violations
```

---

## Detection Patterns

### Directory Structure Detection

```yaml
high_confidence:
  indicators:
    - features/ directory with subdirectories
    - Each subdirectory contains 2+ files
    - Files follow Command/Handler/Endpoint pattern
    - No global controllers/ or services/ directory

  structure_check:
    - features/
        - {feature}/
            - {action}/
                - *Command.ts OR *Query.ts
                - *Handler.ts
                - *Endpoint.ts OR *Controller.ts

medium_confidence:
  indicators:
    - modules/ or slices/ directory
    - Self-contained module directories
    - Some shared infrastructure

low_confidence:
  indicators:
    - Feature folders but also global layers
    - Mixed organization
```

### Import Pattern Detection

```python
def detect_vertical_slices(codebase):
    """
    Detect vertical slices architecture from structure and imports.
    """
    # Look for feature directories
    feature_patterns = ['features', 'slices', 'modules', 'usecases']
    feature_dir = None

    for pattern in feature_patterns:
        if exists(join(codebase.root, 'src', pattern)):
            feature_dir = join(codebase.root, 'src', pattern)
            break

    if not feature_dir:
        return {'detected': False, 'reason': 'No feature directory found'}

    # Analyze slice structure
    slices = []
    for feature in listdir(feature_dir):
        feature_path = join(feature_dir, feature)
        if isdir(feature_path):
            slice_dirs = [d for d in listdir(feature_path) if isdir(join(feature_path, d))]

            for slice_name in slice_dirs:
                slice_path = join(feature_path, slice_name)
                files = get_code_files(slice_path)

                slice_info = {
                    'feature': feature,
                    'name': slice_name,
                    'path': slice_path,
                    'files': files,
                    'has_handler': any('handler' in f.lower() for f in files),
                    'has_command_or_query': any(
                        'command' in f.lower() or 'query' in f.lower()
                        for f in files
                    )
                }
                slices.append(slice_info)

    # Check for global layer directories (anti-pattern)
    global_layers = ['controllers', 'services', 'repositories']
    has_global_layers = any(
        exists(join(codebase.root, 'src', layer))
        for layer in global_layers
    )

    # Calculate confidence
    well_formed_slices = [s for s in slices if s['has_handler']]
    confidence = len(well_formed_slices) / max(1, len(slices))

    if has_global_layers:
        confidence *= 0.5  # Reduce confidence if global layers exist

    return {
        'detected': True,
        'slices': slices,
        'well_formed_count': len(well_formed_slices),
        'total_count': len(slices),
        'has_global_layers': has_global_layers,
        'confidence': confidence
    }
```

### File Naming Pattern Detection

```yaml
slice_file_patterns:
  commands:
    - "*Command.ts", "*Command.java", "*_command.py"
    - "Create*.ts", "Update*.ts", "Delete*.ts"

  queries:
    - "*Query.ts", "*Query.java", "*_query.py"
    - "Get*.ts", "Find*.ts", "List*.ts"

  handlers:
    - "*Handler.ts", "*Handler.java", "*_handler.py"
    - "*CommandHandler.ts", "*QueryHandler.ts"

  endpoints:
    - "*Endpoint.ts", "*Controller.ts"
    - "*Route.ts", "*Router.ts"

  validators:
    - "*Validator.ts", "*Validation.ts"
    - "*Schema.ts"

naming_convention_score:
  high: 3+ pattern matches per slice
  medium: 2 pattern matches per slice
  low: 1 pattern match per slice
```

---

## Code Examples by Language

### TypeScript (NestJS)

```typescript
// features/orders/create-order/create-order.command.ts
export class CreateOrderCommand {
    constructor(
        public readonly customerId: string,
        public readonly items: OrderItemDto[],
        public readonly shippingAddress: AddressDto
    ) {}
}

// features/orders/create-order/create-order.handler.ts
@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
    constructor(
        private orderRepository: OrderRepository,
        private eventBus: EventBus
    ) {}

    async execute(command: CreateOrderCommand): Promise<string> {
        const order = Order.create(command);
        await this.orderRepository.save(order);
        await this.eventBus.publish(new OrderCreatedEvent(order.id));
        return order.id;
    }
}

// features/orders/create-order/create-order.controller.ts
@Controller('orders')
export class CreateOrderController {
    constructor(private commandBus: CommandBus) {}

    @Post()
    async createOrder(@Body() dto: CreateOrderDto): Promise<{ id: string }> {
        const command = new CreateOrderCommand(
            dto.customerId,
            dto.items,
            dto.shippingAddress
        );
        const id = await this.commandBus.execute(command);
        return { id };
    }
}

// features/orders/create-order/create-order.module.ts
@Module({
    controllers: [CreateOrderController],
    providers: [CreateOrderHandler]
})
export class CreateOrderModule {}
```

### Python (FastAPI)

```python
# features/orders/create_order/command.py
from dataclasses import dataclass
from typing import List

@dataclass
class CreateOrderCommand:
    customer_id: str
    items: List[OrderItemInput]
    shipping_address: AddressInput


# features/orders/create_order/handler.py
from shared.domain.order import Order
from shared.infrastructure.repositories import OrderRepository

class CreateOrderHandler:
    def __init__(
        self,
        order_repository: OrderRepository,
        event_bus: EventBus
    ):
        self.order_repository = order_repository
        self.event_bus = event_bus

    async def handle(self, command: CreateOrderCommand) -> str:
        order = Order.create(
            customer_id=command.customer_id,
            items=command.items,
            shipping_address=command.shipping_address
        )

        await self.order_repository.save(order)
        await self.event_bus.publish(OrderCreatedEvent(order.id))

        return order.id


# features/orders/create_order/endpoint.py
from fastapi import APIRouter, Depends
from .command import CreateOrderCommand
from .handler import CreateOrderHandler

router = APIRouter()

@router.post("/orders")
async def create_order(
    request: CreateOrderRequest,
    handler: CreateOrderHandler = Depends()
) -> CreateOrderResponse:
    command = CreateOrderCommand(
        customer_id=request.customer_id,
        items=request.items,
        shipping_address=request.shipping_address
    )

    order_id = await handler.handle(command)
    return CreateOrderResponse(id=order_id)


# features/orders/create_order/__init__.py
from .command import CreateOrderCommand
from .handler import CreateOrderHandler
from .endpoint import router as create_order_router
```

### Go

```go
// features/orders/createorder/command.go
package createorder

type Command struct {
    CustomerID      string
    Items           []OrderItemInput
    ShippingAddress AddressInput
}

// features/orders/createorder/handler.go
package createorder

type Handler struct {
    orderRepo OrderRepository
    eventBus  EventBus
}

func NewHandler(orderRepo OrderRepository, eventBus EventBus) *Handler {
    return &Handler{
        orderRepo: orderRepo,
        eventBus:  eventBus,
    }
}

func (h *Handler) Handle(ctx context.Context, cmd Command) (string, error) {
    order, err := domain.NewOrder(cmd.CustomerID, cmd.Items, cmd.ShippingAddress)
    if err != nil {
        return "", fmt.Errorf("create order: %w", err)
    }

    if err := h.orderRepo.Save(ctx, order); err != nil {
        return "", fmt.Errorf("save order: %w", err)
    }

    if err := h.eventBus.Publish(ctx, OrderCreatedEvent{OrderID: order.ID}); err != nil {
        return "", fmt.Errorf("publish event: %w", err)
    }

    return order.ID, nil
}

// features/orders/createorder/endpoint.go
package createorder

func RegisterEndpoint(router *chi.Mux, handler *Handler) {
    router.Post("/orders", func(w http.ResponseWriter, r *http.Request) {
        var req CreateOrderRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            http.Error(w, "Invalid request", http.StatusBadRequest)
            return
        }

        cmd := Command{
            CustomerID:      req.CustomerID,
            Items:           req.Items,
            ShippingAddress: req.ShippingAddress,
        }

        orderID, err := handler.Handle(r.Context(), cmd)
        if err != nil {
            handleError(w, err)
            return
        }

        json.NewEncoder(w).Encode(CreateOrderResponse{ID: orderID})
    })
}
```

---

## Testing Strategy

### Unit Testing Slices

```typescript
describe('CreateOrderHandler', () => {
    let handler: CreateOrderHandler;
    let orderRepository: MockOrderRepository;
    let eventBus: MockEventBus;

    beforeEach(() => {
        orderRepository = new MockOrderRepository();
        eventBus = new MockEventBus();
        handler = new CreateOrderHandler(orderRepository, eventBus);
    });

    it('should create order and publish event', async () => {
        const command = new CreateOrderCommand(
            'customer-1',
            [{ productId: 'prod-1', quantity: 2 }],
            { street: '123 Main', city: 'NYC', postalCode: '10001', country: 'US' }
        );

        const orderId = await handler.handle(command);

        expect(orderId).toBeDefined();
        expect(orderRepository.saved).toHaveLength(1);
        expect(eventBus.published).toContainEqual(
            expect.objectContaining({ type: 'OrderCreated' })
        );
    });

    it('should validate customer exists', async () => {
        const command = new CreateOrderCommand('invalid-customer', [], {});

        await expect(handler.handle(command))
            .rejects.toThrow(CustomerNotFoundError);
    });
});
```

### Integration Testing Endpoints

```typescript
describe('POST /orders', () => {
    it('should create order via HTTP', async () => {
        const response = await request(app)
            .post('/orders')
            .send({
                customerId: 'cust-1',
                items: [{ productId: 'prod-1', quantity: 2 }],
                shippingAddress: { street: '123 Main', city: 'NYC' }
            });

        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
    });
});
```

---

## Benefits of Vertical Slices

1. **Feature Isolation**: Changes to one feature don't affect others
2. **Easy to Understand**: All code for a feature is in one place
3. **Parallel Development**: Teams can work on different slices independently
4. **Natural Microservices Path**: Slices can become services
5. **Reduced Merge Conflicts**: Developers work in different directories

## When to Use Vertical Slices

- Feature-based team organization
- Applications with many independent features
- Systems being prepared for microservices extraction
- Projects where features have different complexity levels

## When to Avoid

- Small applications with few features
- Highly interconnected domains
- When team prefers traditional layering
- Simple CRUD with no complex business logic

---

## References

- "Vertical Slice Architecture" by Jimmy Bogard
- "CQRS Documents" by Greg Young
- MediatR pattern and implementation
