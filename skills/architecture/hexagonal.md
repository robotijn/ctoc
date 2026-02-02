# Hexagonal Architecture (Ports & Adapters) Deep Dive

> Architecture that puts domain logic at the center, isolated from infrastructure through ports and adapters.

---

## Core Concept

Hexagonal Architecture (originally called "Ports and Adapters" by Alistair Cockburn) isolates the application core from external concerns. The domain doesn't know about the outside world; it only knows about ports (interfaces) that adapters implement.

```
                         ┌─────────────────────────┐
                         │     REST Controller     │
                         │    (Driving Adapter)    │
                         └───────────┬─────────────┘
                                     │
                         ┌───────────▼─────────────┐
                         │    HTTP Input Port      │
                         │     (Interface)         │
                         └───────────┬─────────────┘
                                     │
     ┌──────────────────────────────────────────────────────────────┐
     │                                                              │
     │                    APPLICATION CORE                          │
     │  ┌────────────────────────────────────────────────────────┐  │
     │  │                                                        │  │
     │  │                    DOMAIN MODEL                        │  │
     │  │              (Entities, Value Objects,                 │  │
     │  │               Domain Services, Rules)                  │  │
     │  │                                                        │  │
     │  └────────────────────────────────────────────────────────┘  │
     │  ┌────────────────────────────────────────────────────────┐  │
     │  │                APPLICATION SERVICES                    │  │
     │  │           (Use Cases, Orchestration)                   │  │
     │  └────────────────────────────────────────────────────────┘  │
     │                                                              │
     └──────────────────────────────────────────────────────────────┘
                                     │
                         ┌───────────▼─────────────┐
                         │  Persistence Port       │
                         │    (Interface)          │
                         └───────────┬─────────────┘
                                     │
                         ┌───────────▼─────────────┐
                         │   PostgreSQL Adapter    │
                         │   (Driven Adapter)      │
                         └─────────────────────────┘
```

---

## Key Terminology

| Term | Definition | Example |
|------|------------|---------|
| **Port** | Interface defining how the application interacts with outside world | `OrderRepository`, `PaymentGateway` |
| **Adapter** | Implementation of a port for specific technology | `PostgresOrderRepository`, `StripePaymentGateway` |
| **Driving Adapter** | Initiates interaction with the application (primary) | REST Controller, CLI, Message Consumer |
| **Driven Adapter** | Called by the application (secondary) | Database, External API, Message Publisher |
| **Application Core** | Domain + Application Services, technology-agnostic | Business rules, use cases |

---

## Directory Structure

### Canonical Structure

```
src/
├── domain/                          # Pure business logic
│   ├── model/
│   │   ├── Order.ts
│   │   ├── OrderItem.ts
│   │   └── Customer.ts
│   ├── value-objects/
│   │   ├── OrderId.ts
│   │   ├── Money.ts
│   │   └── Email.ts
│   ├── services/
│   │   └── PricingService.ts
│   ├── events/
│   │   ├── OrderCreated.ts
│   │   └── OrderShipped.ts
│   └── errors/
│       ├── OrderError.ts
│       └── ValidationError.ts
│
├── application/                     # Use cases, orchestration
│   ├── services/
│   │   └── OrderApplicationService.ts
│   ├── commands/
│   │   └── CreateOrderCommand.ts
│   └── queries/
│       └── GetOrderQuery.ts
│
├── ports/                           # Interfaces (contracts)
│   ├── in/                          # Driving ports (primary)
│   │   ├── OrderService.ts          # Use case interface
│   │   └── OrderQueryService.ts
│   └── out/                         # Driven ports (secondary)
│       ├── OrderRepository.ts
│       ├── PaymentGateway.ts
│       ├── NotificationSender.ts
│       └── EventPublisher.ts
│
└── adapters/                        # Implementations
    ├── in/                          # Driving adapters
    │   ├── rest/
    │   │   ├── OrderController.ts
    │   │   └── dto/
    │   │       ├── CreateOrderRequest.ts
    │   │       └── OrderResponse.ts
    │   ├── graphql/
    │   │   └── OrderResolver.ts
    │   └── cli/
    │       └── OrderCommands.ts
    └── out/                         # Driven adapters
        ├── persistence/
        │   ├── PostgresOrderRepository.ts
        │   └── entities/
        │       └── OrderEntity.ts
        ├── payment/
        │   └── StripePaymentGateway.ts
        ├── notification/
        │   └── SendGridNotificationSender.ts
        └── messaging/
            └── KafkaEventPublisher.ts
```

### Alternative Naming Conventions

```yaml
driving_port_names:
  - ports/in/
  - ports/primary/
  - ports/driving/
  - ports/input/
  - ports/api/

driven_port_names:
  - ports/out/
  - ports/secondary/
  - ports/driven/
  - ports/output/
  - ports/spi/

adapter_names:
  - adapters/in/, adapters/out/
  - adapters/primary/, adapters/secondary/
  - adapters/driving/, adapters/driven/
  - infrastructure/input/, infrastructure/output/
```

---

## Driving Ports and Adapters

### Driving Port (Primary Port)
Defines what the application offers to the outside world.

```typescript
// ports/in/OrderService.ts
export interface OrderService {
    createOrder(command: CreateOrderCommand): Promise<OrderId>;
    getOrder(id: OrderId): Promise<OrderReadModel | null>;
    cancelOrder(id: OrderId, reason: string): Promise<void>;
    shipOrder(id: OrderId, trackingNumber: string): Promise<void>;
}

// ports/in/CreateOrderCommand.ts
export interface CreateOrderCommand {
    readonly customerId: string;
    readonly items: ReadonlyArray<{
        productId: string;
        quantity: number;
    }>;
    readonly shippingAddress: Address;
}
```

### Driving Adapter (Primary Adapter)
Translates external input into calls to the driving port.

```typescript
// adapters/in/rest/OrderController.ts
@Controller('/orders')
export class OrderController {
    constructor(
        // Inject port interface, not implementation
        @Inject('OrderService') private orderService: OrderService
    ) {}

    @Post()
    async createOrder(@Body() request: CreateOrderRequest): Promise<OrderResponse> {
        // Translate REST request to command
        const command: CreateOrderCommand = {
            customerId: request.customerId,
            items: request.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity
            })),
            shippingAddress: Address.create(request.shippingAddress)
        };

        // Call the port
        const orderId = await this.orderService.createOrder(command);

        // Translate result to REST response
        return new OrderResponse(orderId.value);
    }

    @Get(':id')
    async getOrder(@Param('id') id: string): Promise<OrderResponse> {
        const order = await this.orderService.getOrder(OrderId.from(id));
        if (!order) throw new NotFoundException('Order not found');
        return OrderResponse.fromReadModel(order);
    }
}
```

### CLI Driving Adapter

```typescript
// adapters/in/cli/OrderCommands.ts
@Command('orders')
export class OrderCommands {
    constructor(
        @Inject('OrderService') private orderService: OrderService
    ) {}

    @SubCommand('create')
    async createOrder(
        @Option('customer') customerId: string,
        @Option('product') productId: string,
        @Option('qty') quantity: number
    ): Promise<void> {
        const command: CreateOrderCommand = {
            customerId,
            items: [{ productId, quantity }],
            shippingAddress: await this.promptForAddress()
        };

        const orderId = await this.orderService.createOrder(command);
        console.log(`Order created: ${orderId.value}`);
    }
}
```

---

## Driven Ports and Adapters

### Driven Port (Secondary Port)
Defines what the application needs from the outside world.

```typescript
// ports/out/OrderRepository.ts
export interface OrderRepository {
    save(order: Order): Promise<void>;
    findById(id: OrderId): Promise<Order | null>;
    findByCustomer(customerId: CustomerId): Promise<Order[]>;
    nextId(): OrderId;
}

// ports/out/PaymentGateway.ts
export interface PaymentGateway {
    charge(payment: PaymentRequest): Promise<PaymentResult>;
    refund(transactionId: TransactionId, amount: Money): Promise<RefundResult>;
}

// ports/out/NotificationSender.ts
export interface NotificationSender {
    sendOrderConfirmation(order: Order, customer: Customer): Promise<void>;
    sendShippingNotification(order: Order, tracking: TrackingInfo): Promise<void>;
}

// ports/out/EventPublisher.ts
export interface EventPublisher {
    publish(event: DomainEvent): Promise<void>;
}
```

### Driven Adapter (Secondary Adapter)

```typescript
// adapters/out/persistence/PostgresOrderRepository.ts
@Injectable()
export class PostgresOrderRepository implements OrderRepository {
    constructor(
        @InjectRepository(OrderEntity)
        private repository: Repository<OrderEntity>
    ) {}

    async save(order: Order): Promise<void> {
        const entity = this.toEntity(order);
        await this.repository.save(entity);
    }

    async findById(id: OrderId): Promise<Order | null> {
        const entity = await this.repository.findOne({
            where: { id: id.value },
            relations: ['items']
        });
        return entity ? this.toDomain(entity) : null;
    }

    nextId(): OrderId {
        return OrderId.generate();
    }

    private toEntity(order: Order): OrderEntity {
        const entity = new OrderEntity();
        entity.id = order.id.value;
        entity.customerId = order.customerId.value;
        entity.status = order.status;
        entity.items = order.items.map(item => this.toItemEntity(item));
        return entity;
    }

    private toDomain(entity: OrderEntity): Order {
        return Order.reconstitute({
            id: OrderId.from(entity.id),
            customerId: CustomerId.from(entity.customerId),
            status: entity.status as OrderStatus,
            items: entity.items.map(item => this.toItemDomain(item))
        });
    }
}

// adapters/out/payment/StripePaymentGateway.ts
@Injectable()
export class StripePaymentGateway implements PaymentGateway {
    constructor(private stripe: Stripe) {}

    async charge(payment: PaymentRequest): Promise<PaymentResult> {
        try {
            const intent = await this.stripe.paymentIntents.create({
                amount: payment.amount.cents,
                currency: payment.amount.currency.toLowerCase(),
                customer: payment.customerId,
                metadata: { orderId: payment.orderId }
            });

            return PaymentResult.success(
                TransactionId.from(intent.id),
                payment.amount
            );
        } catch (error) {
            if (error instanceof Stripe.errors.StripeCardError) {
                return PaymentResult.declined(error.message);
            }
            throw error;
        }
    }

    async refund(transactionId: TransactionId, amount: Money): Promise<RefundResult> {
        const refund = await this.stripe.refunds.create({
            payment_intent: transactionId.value,
            amount: amount.cents
        });
        return RefundResult.success(RefundId.from(refund.id));
    }
}
```

---

## Application Core

### Application Service (Use Case Implementation)

```typescript
// application/services/OrderApplicationService.ts
@Injectable()
export class OrderApplicationService implements OrderService {
    constructor(
        // Driven ports injected
        private readonly orderRepository: OrderRepository,
        private readonly paymentGateway: PaymentGateway,
        private readonly notificationSender: NotificationSender,
        private readonly eventPublisher: EventPublisher,
        private readonly customerRepository: CustomerRepository
    ) {}

    async createOrder(command: CreateOrderCommand): Promise<OrderId> {
        // Validate customer exists
        const customer = await this.customerRepository.findById(
            CustomerId.from(command.customerId)
        );
        if (!customer) {
            throw new CustomerNotFoundError(command.customerId);
        }

        // Create order (domain logic)
        const orderId = this.orderRepository.nextId();
        const order = Order.create({
            id: orderId,
            customerId: customer.id,
            items: command.items,
            shippingAddress: command.shippingAddress
        });

        // Process payment through port
        const paymentResult = await this.paymentGateway.charge({
            orderId: orderId.value,
            customerId: customer.paymentCustomerId,
            amount: order.total
        });

        if (!paymentResult.success) {
            throw new PaymentFailedError(paymentResult.error);
        }

        order.markPaid(paymentResult.transactionId);

        // Persist through port
        await this.orderRepository.save(order);

        // Publish events through port
        for (const event of order.domainEvents) {
            await this.eventPublisher.publish(event);
        }

        // Notify through port
        await this.notificationSender.sendOrderConfirmation(order, customer);

        return orderId;
    }

    async cancelOrder(id: OrderId, reason: string): Promise<void> {
        const order = await this.orderRepository.findById(id);
        if (!order) {
            throw new OrderNotFoundError(id);
        }

        // Domain logic handles rules
        order.cancel(reason);

        // Refund through port
        if (order.isPaid) {
            await this.paymentGateway.refund(
                order.paymentTransactionId!,
                order.total
            );
        }

        await this.orderRepository.save(order);

        for (const event of order.domainEvents) {
            await this.eventPublisher.publish(event);
        }
    }
}
```

### Domain Model

```typescript
// domain/model/Order.ts
export class Order extends AggregateRoot {
    private constructor(
        public readonly id: OrderId,
        public readonly customerId: CustomerId,
        private items: OrderItem[],
        private status: OrderStatus,
        private shippingAddress: Address,
        private paymentTransactionId: TransactionId | null
    ) {
        super();
    }

    static create(props: CreateOrderProps): Order {
        if (props.items.length === 0) {
            throw new EmptyOrderError();
        }

        const order = new Order(
            props.id,
            props.customerId,
            props.items.map(item => OrderItem.create(item)),
            OrderStatus.PENDING,
            props.shippingAddress,
            null
        );

        order.addDomainEvent(new OrderCreated(order.id, order.customerId));

        return order;
    }

    static reconstitute(props: OrderProps): Order {
        return new Order(
            props.id,
            props.customerId,
            props.items,
            props.status,
            props.shippingAddress,
            props.paymentTransactionId
        );
    }

    get total(): Money {
        return this.items.reduce(
            (sum, item) => sum.add(item.subtotal),
            Money.zero()
        );
    }

    get isPaid(): boolean {
        return this.paymentTransactionId !== null;
    }

    markPaid(transactionId: TransactionId): void {
        if (this.status !== OrderStatus.PENDING) {
            throw new InvalidOrderStateError('Order must be pending to mark paid');
        }
        this.paymentTransactionId = transactionId;
        this.status = OrderStatus.PAID;
        this.addDomainEvent(new OrderPaid(this.id, transactionId));
    }

    cancel(reason: string): void {
        if (this.status === OrderStatus.SHIPPED) {
            throw new InvalidOrderStateError('Cannot cancel shipped order');
        }
        this.status = OrderStatus.CANCELLED;
        this.addDomainEvent(new OrderCancelled(this.id, reason));
    }

    ship(trackingNumber: string): void {
        if (this.status !== OrderStatus.PAID) {
            throw new InvalidOrderStateError('Order must be paid to ship');
        }
        this.status = OrderStatus.SHIPPED;
        this.addDomainEvent(new OrderShipped(this.id, trackingNumber));
    }
}
```

---

## Dependency Injection Configuration

```typescript
// Bootstrap/DI configuration
@Module({
    providers: [
        // Application service implementing driving port
        {
            provide: 'OrderService',
            useClass: OrderApplicationService
        },

        // Driven adapters implementing driven ports
        {
            provide: 'OrderRepository',
            useClass: PostgresOrderRepository
        },
        {
            provide: 'PaymentGateway',
            useClass: StripePaymentGateway
        },
        {
            provide: 'NotificationSender',
            useClass: SendGridNotificationSender
        },
        {
            provide: 'EventPublisher',
            useClass: KafkaEventPublisher
        }
    ]
})
export class OrderModule {}
```

---

## The Dependency Rule

### Core Principle
**Dependencies point inward. Nothing in an inner circle can know about something in an outer circle.**

```
                     ADAPTERS
                         │
                         │ depends on
                         ▼
                      PORTS
                         │
                         │ depends on
                         ▼
                   APPLICATION
                         │
                         │ depends on
                         ▼
                      DOMAIN
                         │
                         │ depends on
                         ▼
                      NOTHING
```

### Import Rules

```yaml
domain:
  can_import:
    - Only language primitives
    - Other domain classes
    - Domain events
  cannot_import:
    - ports/
    - adapters/
    - application/
    - Any framework
    - Any infrastructure

application:
  can_import:
    - domain/
    - ports/out/ (interfaces)
  cannot_import:
    - adapters/
    - ports/in/ (it implements these)

ports/in:
  can_import:
    - domain/ (for types in signatures)
    - application/ (read models, commands)
  cannot_import:
    - adapters/
    - ports/out/

ports/out:
  can_import:
    - domain/ (for types in signatures)
  cannot_import:
    - adapters/
    - application/
    - ports/in/

adapters/in:
  can_import:
    - ports/in/
    - domain/ (for mapping)
    - application/ (commands, queries)
  cannot_import:
    - adapters/out/

adapters/out:
  can_import:
    - ports/out/
    - domain/ (for mapping)
  cannot_import:
    - adapters/in/
    - application/
```

---

## Common Violations

### 1. Domain Importing Infrastructure

```typescript
// VIOLATION: Domain depends on ORM
// domain/model/Order.ts
import { Entity, Column } from 'typeorm'; // WRONG!

@Entity()
export class Order {
    @Column()
    status: string;
}

// CORRECT: Pure domain
// domain/model/Order.ts
export class Order {
    private status: OrderStatus;

    // No framework dependencies
}
```

### 2. Application Service Importing Adapter

```typescript
// VIOLATION: Application knows about specific adapter
// application/services/OrderService.ts
import { PostgresOrderRepository } from '../../adapters/out/persistence/PostgresOrderRepository';

// CORRECT: Application only knows port interface
// application/services/OrderService.ts
import { OrderRepository } from '../../ports/out/OrderRepository';

export class OrderApplicationService {
    constructor(private orderRepository: OrderRepository) {} // Interface, not implementation
}
```

### 3. Port Returning Infrastructure Types

```typescript
// VIOLATION: Port exposes database entity
// ports/out/OrderRepository.ts
import { OrderEntity } from '../../adapters/out/persistence/entities/OrderEntity';

export interface OrderRepository {
    findById(id: string): Promise<OrderEntity>; // WRONG! Returns infrastructure type
}

// CORRECT: Port returns domain type
// ports/out/OrderRepository.ts
import { Order, OrderId } from '../../domain/model/Order';

export interface OrderRepository {
    findById(id: OrderId): Promise<Order | null>; // Domain type
}
```

### 4. Adapter-to-Adapter Communication

```typescript
// VIOLATION: Driving adapter calls driven adapter directly
// adapters/in/rest/OrderController.ts
import { PostgresOrderRepository } from '../../out/persistence/PostgresOrderRepository';

export class OrderController {
    constructor(private repo: PostgresOrderRepository) {} // WRONG!
}

// CORRECT: Communication through application core
// adapters/in/rest/OrderController.ts
import { OrderService } from '../../../ports/in/OrderService';

export class OrderController {
    constructor(private orderService: OrderService) {} // Port interface
}
```

### 5. Leaking Domain Events to Adapters

```typescript
// VIOLATION: Adapter creates domain events
// adapters/in/rest/OrderController.ts
const event = new OrderCreated(orderId); // WRONG! Adapter creating domain event
await eventBus.publish(event);

// CORRECT: Domain creates events, application publishes
// domain/model/Order.ts
order.addDomainEvent(new OrderCreated(order.id));

// application/services/OrderService.ts
await this.eventPublisher.publish(order.domainEvents);
```

---

## Detection Patterns

### Directory Structure Detection

```yaml
high_confidence:
  # Explicit ports and adapters
  required:
    - ports/ OR port/ AND (adapters/ OR adapter/)
  structure:
    - ports/in/ OR ports/primary/ OR ports/driving/
    - ports/out/ OR ports/secondary/ OR ports/driven/
    - adapters/in/ OR adapters/primary/
    - adapters/out/ OR adapters/secondary/
  optional:
    - domain/ OR core/
    - application/

medium_confidence:
  # Implied hexagonal (ports without explicit naming)
  required:
    - domain/ AND infrastructure/
  indicators:
    - Repository interfaces in domain/
    - Repository implementations in infrastructure/
    - Clean import direction

low_confidence:
  # Weak hexagonal signals
  indicators:
    - Interface-based design
    - Some abstraction of infrastructure
    - But no clear port/adapter separation
```

### Import Analysis Detection

```python
def detect_hexagonal_architecture(codebase):
    """
    Detect hexagonal architecture through import analysis.
    """
    # Find port and adapter directories
    ports_dir = find_directory(codebase, ['ports', 'port'])
    adapters_dir = find_directory(codebase, ['adapters', 'adapter'])
    domain_dir = find_directory(codebase, ['domain', 'core'])

    if not (ports_dir or (domain_dir and has_interfaces(domain_dir))):
        return {'detected': False, 'reason': 'No ports directory found'}

    # Verify domain isolation
    domain_files = get_files(domain_dir)
    domain_violations = []

    for file in domain_files:
        imports = extract_imports(file)
        for imp in imports:
            if is_infrastructure_import(imp) or is_adapter_import(imp):
                domain_violations.append({
                    'file': file,
                    'import': imp,
                    'violation': 'Domain imports infrastructure'
                })

    # Verify adapter implements port
    port_implementations = []
    adapter_files = get_files(adapters_dir)

    for file in adapter_files:
        implemented_interfaces = extract_implemented_interfaces(file)
        for interface in implemented_interfaces:
            if is_in_ports(interface, ports_dir):
                port_implementations.append({
                    'adapter': file,
                    'port': interface
                })

    return {
        'detected': True,
        'domain_violations': domain_violations,
        'port_implementations': port_implementations,
        'confidence': calculate_confidence(domain_violations, port_implementations)
    }
```

### Naming Pattern Detection

```yaml
port_patterns:
  file_names:
    - "*Port.ts", "*Port.java", "*_port.py"
    - "*Gateway.ts", "*Gateway.java"
    - "*Repository.ts" (in ports directory)
    - "I*.ts", "I*.cs" (interface prefix convention)

  interface_names:
    - "*Port"
    - "*Gateway"
    - "*Repository" (when interface)
    - "*Sender", "*Publisher", "*Client"

adapter_patterns:
  file_names:
    - "*Adapter.ts", "*Adapter.java", "*_adapter.py"
    - "*Impl.ts", "*Impl.java"
    - "Postgres*", "Mongo*", "Redis*"
    - "Stripe*", "SendGrid*", "Kafka*"

  class_names:
    - "*Adapter"
    - "*Implementation"
    - Technology prefix + interface name
```

---

## Testing Strategy

### Port-Based Testing

```typescript
// Unit test with fake adapter
describe('OrderApplicationService', () => {
    let orderService: OrderService;
    let fakeOrderRepository: FakeOrderRepository;
    let fakePaymentGateway: FakePaymentGateway;

    beforeEach(() => {
        fakeOrderRepository = new FakeOrderRepository();
        fakePaymentGateway = new FakePaymentGateway();

        orderService = new OrderApplicationService(
            fakeOrderRepository,
            fakePaymentGateway,
            new FakeNotificationSender(),
            new FakeEventPublisher()
        );
    });

    it('should create order and process payment', async () => {
        fakePaymentGateway.willSucceed();

        const orderId = await orderService.createOrder({
            customerId: 'customer-1',
            items: [{ productId: 'prod-1', quantity: 2 }],
            shippingAddress: testAddress
        });

        expect(orderId).toBeDefined();
        expect(fakeOrderRepository.saved).toHaveLength(1);
        expect(fakePaymentGateway.charges).toHaveLength(1);
    });

    it('should not save order when payment fails', async () => {
        fakePaymentGateway.willFail('Card declined');

        await expect(orderService.createOrder(command))
            .rejects.toThrow(PaymentFailedError);

        expect(fakeOrderRepository.saved).toHaveLength(0);
    });
});

// Fake adapter for testing
class FakeOrderRepository implements OrderRepository {
    public saved: Order[] = [];

    async save(order: Order): Promise<void> {
        this.saved.push(order);
    }

    async findById(id: OrderId): Promise<Order | null> {
        return this.saved.find(o => o.id.equals(id)) ?? null;
    }
}
```

### Integration Testing Adapters

```typescript
describe('PostgresOrderRepository', () => {
    let repository: PostgresOrderRepository;
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDatabase();
        repository = new PostgresOrderRepository(dataSource);
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('should persist and retrieve order', async () => {
        const order = Order.create({
            id: OrderId.generate(),
            customerId: CustomerId.from('cust-1'),
            items: [testItem],
            shippingAddress: testAddress
        });

        await repository.save(order);

        const retrieved = await repository.findById(order.id);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.id.equals(order.id)).toBe(true);
        expect(retrieved!.items).toHaveLength(1);
    });
});
```

---

## Benefits of Hexagonal Architecture

1. **Technology Independence**: Swap databases, frameworks, or APIs without touching domain
2. **Testability**: Test domain in isolation with fake adapters
3. **Flexibility**: Multiple entry points (REST, CLI, events) share same core
4. **Clear Boundaries**: Ports define explicit contracts
5. **Gradual Migration**: Replace adapters one at a time

## When to Use Hexagonal

- Applications with complex business logic
- Systems requiring multiple entry/exit points
- Projects planning infrastructure changes
- Teams practicing DDD
- Long-lived enterprise applications

## When to Avoid

- Simple CRUD applications
- Prototypes or MVPs
- Small scripts or utilities
- When team lacks experience with the pattern

---

## References

- Alistair Cockburn's original Hexagonal Architecture article
- "Get Your Hands Dirty on Clean Architecture" by Tom Hombergs
- Domain-Driven Design (Eric Evans)
- Implementing Domain-Driven Design (Vaughn Vernon)
