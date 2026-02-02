# MVC Pattern Family Deep Dive

> Model-View-Controller and its variants: MVP and MVVM. Classic patterns for separating UI from logic.

---

## Overview of MVC Variants

| Pattern | View-Model Link | Controller/Presenter Role | Best For |
|---------|-----------------|---------------------------|----------|
| **MVC** | View observes Model | Routes requests, updates Model | Web frameworks, server-rendered |
| **MVP** | Presenter updates View | All logic, View is passive | Desktop, Android (legacy), testable UI |
| **MVVM** | Two-way data binding | ViewModel exposes bindable data | WPF, Vue, Angular, SwiftUI |

---

## MVC (Model-View-Controller)

### Core Concept

```
     ┌─────────────────────────────────────────────────────────┐
     │                    User Action                          │
     │                        │                                │
     │                        ▼                                │
     │               ┌────────────────┐                        │
     │               │   Controller   │                        │
     │               │  (handles input,│                       │
     │               │   updates Model)│                       │
     │               └───────┬────────┘                        │
     │                       │                                 │
     │           ┌───────────┼───────────┐                     │
     │           │           │           │                     │
     │           ▼           │           ▼                     │
     │    ┌───────────┐      │    ┌───────────┐                │
     │    │   Model   │      │    │   View    │                │
     │    │ (business │◀─────┘    │ (renders  │                │
     │    │  data)    │ updates   │   data)   │                │
     │    └─────┬─────┘           └─────▲─────┘                │
     │          │                       │                      │
     │          └───────────────────────┘                      │
     │                notifies/observes                        │
     └─────────────────────────────────────────────────────────┘
```

### Components

#### Model
Represents data and business logic. Notifies observers (Views) of changes.

```typescript
// models/Order.ts
export class Order {
    private _status: OrderStatus = OrderStatus.PENDING;
    private observers: OrderObserver[] = [];

    constructor(
        public readonly id: string,
        public readonly customerId: string,
        private items: OrderItem[]
    ) {}

    get status(): OrderStatus {
        return this._status;
    }

    get total(): number {
        return this.items.reduce((sum, item) => sum + item.subtotal, 0);
    }

    addItem(item: OrderItem): void {
        this.items.push(item);
        this.notifyObservers();
    }

    confirm(): void {
        if (this._status !== OrderStatus.PENDING) {
            throw new Error('Order must be pending to confirm');
        }
        this._status = OrderStatus.CONFIRMED;
        this.notifyObservers();
    }

    addObserver(observer: OrderObserver): void {
        this.observers.push(observer);
    }

    private notifyObservers(): void {
        this.observers.forEach(obs => obs.onOrderChanged(this));
    }
}
```

#### View
Renders the Model's data. Observes Model for changes.

```typescript
// views/OrderView.ts
export class OrderView implements OrderObserver {
    constructor(private container: HTMLElement) {}

    render(order: Order): void {
        this.container.innerHTML = `
            <div class="order">
                <h2>Order #${order.id}</h2>
                <p>Status: ${order.status}</p>
                <p>Total: $${order.total.toFixed(2)}</p>
                <button id="confirm-btn" ${order.status !== 'pending' ? 'disabled' : ''}>
                    Confirm Order
                </button>
            </div>
        `;
    }

    onOrderChanged(order: Order): void {
        this.render(order);
    }

    bindConfirmButton(handler: () => void): void {
        this.container.querySelector('#confirm-btn')
            ?.addEventListener('click', handler);
    }
}
```

#### Controller
Handles user input, updates Model.

```typescript
// controllers/OrderController.ts
export class OrderController {
    private order: Order;
    private view: OrderView;

    constructor(order: Order, view: OrderView) {
        this.order = order;
        this.view = view;

        // Connect view to model
        this.order.addObserver(this.view);

        // Bind user actions
        this.view.bindConfirmButton(() => this.confirmOrder());

        // Initial render
        this.view.render(this.order);
    }

    confirmOrder(): void {
        try {
            this.order.confirm();
        } catch (error) {
            this.view.showError(error.message);
        }
    }

    addItem(productId: string, quantity: number): void {
        const item = new OrderItem(productId, quantity);
        this.order.addItem(item);
    }
}
```

### Web Framework MVC (Server-Side)

In web frameworks, MVC is often adapted:

```
Request → Router → Controller → Model → View → Response
```

#### Rails Example

```ruby
# app/controllers/orders_controller.rb
class OrdersController < ApplicationController
  def index
    @orders = Order.where(user: current_user)
  end

  def show
    @order = Order.find(params[:id])
  end

  def create
    @order = Order.new(order_params)
    @order.user = current_user

    if @order.save
      redirect_to @order, notice: 'Order created'
    else
      render :new
    end
  end

  def confirm
    @order = Order.find(params[:id])
    @order.confirm!
    redirect_to @order, notice: 'Order confirmed'
  end

  private

  def order_params
    params.require(:order).permit(:shipping_address, items_attributes: [:product_id, :quantity])
  end
end

# app/models/order.rb
class Order < ApplicationRecord
  belongs_to :user
  has_many :items, class_name: 'OrderItem'

  enum status: { pending: 0, confirmed: 1, shipped: 2, cancelled: 3 }

  def confirm!
    raise 'Order must be pending' unless pending?
    update!(status: :confirmed)
  end

  def total
    items.sum(&:subtotal)
  end
end

# app/views/orders/show.html.erb
<div class="order">
  <h1>Order #<%= @order.id %></h1>
  <p>Status: <%= @order.status %></p>
  <p>Total: <%= number_to_currency(@order.total) %></p>

  <% if @order.pending? %>
    <%= button_to 'Confirm', confirm_order_path(@order), method: :post %>
  <% end %>
</div>
```

#### Django Example (MTV - Model-Template-View)

```python
# models.py
from django.db import models

class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending'
        CONFIRMED = 'confirmed'
        SHIPPED = 'shipped'

    customer = models.ForeignKey('Customer', on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def total(self):
        return sum(item.subtotal for item in self.items.all())

    def confirm(self):
        if self.status != self.Status.PENDING:
            raise ValueError('Order must be pending to confirm')
        self.status = self.Status.CONFIRMED
        self.save()


# views.py (Django's "View" is actually Controller)
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages

def order_list(request):
    orders = Order.objects.filter(customer=request.user.customer)
    return render(request, 'orders/list.html', {'orders': orders})

def order_detail(request, order_id):
    order = get_object_or_404(Order, id=order_id)
    return render(request, 'orders/detail.html', {'order': order})

def order_confirm(request, order_id):
    order = get_object_or_404(Order, id=order_id)
    try:
        order.confirm()
        messages.success(request, 'Order confirmed')
    except ValueError as e:
        messages.error(request, str(e))
    return redirect('order_detail', order_id=order_id)


# templates/orders/detail.html (Django's "Template" is View)
{% extends 'base.html' %}

{% block content %}
<div class="order">
    <h1>Order #{{ order.id }}</h1>
    <p>Status: {{ order.status }}</p>
    <p>Total: ${{ order.total }}</p>

    {% if order.status == 'pending' %}
    <form method="post" action="{% url 'order_confirm' order.id %}">
        {% csrf_token %}
        <button type="submit">Confirm Order</button>
    </form>
    {% endif %}
</div>
{% endblock %}
```

---

## MVP (Model-View-Presenter)

### Core Concept

```
     ┌─────────────────────────────────────────────────────────┐
     │                                                         │
     │               ┌────────────────┐                        │
     │               │   Presenter    │                        │
     │               │ (all logic,    │                        │
     │               │  updates View) │                        │
     │               └───────┬────────┘                        │
     │                       │                                 │
     │           ┌───────────┼───────────┐                     │
     │           │           │           │                     │
     │           ▼           │           ▼                     │
     │    ┌───────────┐      │    ┌───────────┐                │
     │    │   Model   │      │    │   View    │                │
     │    │ (data)    │◀─────┘    │ (passive, │                │
     │    └───────────┘   reads   │  dumb UI) │                │
     │                            └─────┬─────┘                │
     │                                  │                      │
     │                      User events go to Presenter        │
     └─────────────────────────────────────────────────────────┘
```

### Key Difference from MVC
- View is **passive/dumb** - only renders what Presenter tells it
- All presentation logic is in Presenter
- View and Presenter communicate through **interfaces**
- Highly testable - Presenter can be tested without real View

### Components

#### View Interface
```typescript
// views/IOrderView.ts
export interface IOrderView {
    setOrderId(id: string): void;
    setStatus(status: string): void;
    setTotal(total: string): void;
    setConfirmButtonEnabled(enabled: boolean): void;
    showError(message: string): void;
    showSuccess(message: string): void;
}
```

#### View Implementation
```typescript
// views/OrderView.ts
export class OrderView implements IOrderView {
    private idElement: HTMLElement;
    private statusElement: HTMLElement;
    private totalElement: HTMLElement;
    private confirmButton: HTMLButtonElement;
    private presenter: OrderPresenter;

    constructor(container: HTMLElement) {
        this.idElement = container.querySelector('#order-id')!;
        this.statusElement = container.querySelector('#order-status')!;
        this.totalElement = container.querySelector('#order-total')!;
        this.confirmButton = container.querySelector('#confirm-btn')!;

        // Wire up events to presenter
        this.confirmButton.addEventListener('click', () => {
            this.presenter.onConfirmClicked();
        });
    }

    setPresenter(presenter: OrderPresenter): void {
        this.presenter = presenter;
    }

    setOrderId(id: string): void {
        this.idElement.textContent = id;
    }

    setStatus(status: string): void {
        this.statusElement.textContent = status;
    }

    setTotal(total: string): void {
        this.totalElement.textContent = total;
    }

    setConfirmButtonEnabled(enabled: boolean): void {
        this.confirmButton.disabled = !enabled;
    }

    showError(message: string): void {
        alert(`Error: ${message}`);
    }

    showSuccess(message: string): void {
        alert(message);
    }
}
```

#### Presenter
```typescript
// presenters/OrderPresenter.ts
export class OrderPresenter {
    constructor(
        private view: IOrderView,
        private orderService: OrderService,
        private orderId: string
    ) {}

    async initialize(): Promise<void> {
        try {
            const order = await this.orderService.getOrder(this.orderId);
            this.updateView(order);
        } catch (error) {
            this.view.showError('Failed to load order');
        }
    }

    async onConfirmClicked(): Promise<void> {
        try {
            const order = await this.orderService.confirmOrder(this.orderId);
            this.updateView(order);
            this.view.showSuccess('Order confirmed!');
        } catch (error) {
            this.view.showError(error.message);
        }
    }

    private updateView(order: Order): void {
        this.view.setOrderId(order.id);
        this.view.setStatus(this.formatStatus(order.status));
        this.view.setTotal(this.formatMoney(order.total));
        this.view.setConfirmButtonEnabled(order.status === 'pending');
    }

    private formatStatus(status: string): string {
        return status.charAt(0).toUpperCase() + status.slice(1);
    }

    private formatMoney(amount: number): string {
        return `$${amount.toFixed(2)}`;
    }
}
```

#### Testing the Presenter
```typescript
describe('OrderPresenter', () => {
    let presenter: OrderPresenter;
    let mockView: MockOrderView;
    let mockOrderService: MockOrderService;

    beforeEach(() => {
        mockView = new MockOrderView();
        mockOrderService = new MockOrderService();
        presenter = new OrderPresenter(mockView, mockOrderService, 'order-1');
    });

    it('should display order data on initialize', async () => {
        mockOrderService.setOrder({
            id: 'order-1',
            status: 'pending',
            total: 99.99
        });

        await presenter.initialize();

        expect(mockView.lastOrderId).toBe('order-1');
        expect(mockView.lastStatus).toBe('Pending');
        expect(mockView.lastTotal).toBe('$99.99');
        expect(mockView.confirmButtonEnabled).toBe(true);
    });

    it('should disable confirm button when not pending', async () => {
        mockOrderService.setOrder({
            id: 'order-1',
            status: 'confirmed',
            total: 99.99
        });

        await presenter.initialize();

        expect(mockView.confirmButtonEnabled).toBe(false);
    });

    it('should show error when confirm fails', async () => {
        mockOrderService.setOrder({ id: 'order-1', status: 'pending', total: 99.99 });
        mockOrderService.confirmWillFail('Already confirmed');

        await presenter.initialize();
        await presenter.onConfirmClicked();

        expect(mockView.lastError).toBe('Already confirmed');
    });
});
```

---

## MVVM (Model-View-ViewModel)

### Core Concept

```
     ┌─────────────────────────────────────────────────────────┐
     │                                                         │
     │               ┌────────────────┐                        │
     │               │   ViewModel    │                        │
     │               │ (bindable      │                        │
     │               │  properties)   │                        │
     │               └───────┬────────┘                        │
     │                       │                                 │
     │           ┌───────────┼───────────┐                     │
     │           │           │           │                     │
     │           ▼           │           ▼                     │
     │    ┌───────────┐      │    ┌───────────┐                │
     │    │   Model   │      │    │   View    │                │
     │    │ (data)    │◀─────┘    │ (binds to │                │
     │    └───────────┘   reads   │ViewModel) │                │
     │                            └─────┬─────┘                │
     │                                  │                      │
     │                     Two-way data binding                │
     │                     (automatic sync)                    │
     └─────────────────────────────────────────────────────────┘
```

### Key Difference from MVP
- **Data binding** instead of manual View updates
- ViewModel exposes **observable properties**
- View automatically updates when ViewModel changes
- Commands replace event handlers

### Vue.js Example

```typescript
// viewmodels/OrderViewModel.ts
import { reactive, computed, ref } from 'vue';

export function useOrderViewModel(orderService: OrderService, orderId: string) {
    // Reactive state
    const order = reactive<Order | null>(null);
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    // Computed properties (derived state)
    const formattedTotal = computed(() => {
        if (!order.value) return '$0.00';
        return `$${order.value.total.toFixed(2)}`;
    });

    const formattedStatus = computed(() => {
        if (!order.value) return '';
        return order.value.status.charAt(0).toUpperCase() + order.value.status.slice(1);
    });

    const canConfirm = computed(() => {
        return order.value?.status === 'pending' && !isLoading.value;
    });

    // Commands (actions)
    async function loadOrder(): Promise<void> {
        isLoading.value = true;
        error.value = null;
        try {
            order.value = await orderService.getOrder(orderId);
        } catch (e) {
            error.value = 'Failed to load order';
        } finally {
            isLoading.value = false;
        }
    }

    async function confirmOrder(): Promise<void> {
        if (!canConfirm.value) return;

        isLoading.value = true;
        error.value = null;
        try {
            order.value = await orderService.confirmOrder(orderId);
        } catch (e) {
            error.value = e.message;
        } finally {
            isLoading.value = false;
        }
    }

    // Initialize
    loadOrder();

    return {
        // State
        order,
        isLoading,
        error,

        // Computed
        formattedTotal,
        formattedStatus,
        canConfirm,

        // Commands
        confirmOrder
    };
}
```

```vue
<!-- views/OrderView.vue -->
<template>
    <div class="order" v-if="!isLoading">
        <h1>Order #{{ order?.id }}</h1>
        <p>Status: {{ formattedStatus }}</p>
        <p>Total: {{ formattedTotal }}</p>

        <button
            @click="confirmOrder"
            :disabled="!canConfirm"
        >
            Confirm Order
        </button>

        <p v-if="error" class="error">{{ error }}</p>
    </div>
    <div v-else>Loading...</div>
</template>

<script setup lang="ts">
import { useOrderViewModel } from '../viewmodels/OrderViewModel';
import { orderService } from '../services/orderService';

const props = defineProps<{ orderId: string }>();

const {
    order,
    isLoading,
    error,
    formattedTotal,
    formattedStatus,
    canConfirm,
    confirmOrder
} = useOrderViewModel(orderService, props.orderId);
</script>
```

### Angular Example

```typescript
// viewmodels/order.viewmodel.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class OrderViewModel {
    private orderSubject = new BehaviorSubject<Order | null>(null);
    private loadingSubject = new BehaviorSubject<boolean>(false);
    private errorSubject = new BehaviorSubject<string | null>(null);

    // Observable properties for binding
    order$ = this.orderSubject.asObservable();
    isLoading$ = this.loadingSubject.asObservable();
    error$ = this.errorSubject.asObservable();

    formattedTotal$: Observable<string> = this.order$.pipe(
        map(order => order ? `$${order.total.toFixed(2)}` : '$0.00')
    );

    formattedStatus$: Observable<string> = this.order$.pipe(
        map(order => order ? this.formatStatus(order.status) : '')
    );

    canConfirm$: Observable<boolean> = this.order$.pipe(
        map(order => order?.status === 'pending')
    );

    constructor(private orderService: OrderService) {}

    async loadOrder(orderId: string): Promise<void> {
        this.loadingSubject.next(true);
        this.errorSubject.next(null);

        try {
            const order = await this.orderService.getOrder(orderId).toPromise();
            this.orderSubject.next(order);
        } catch (e) {
            this.errorSubject.next('Failed to load order');
        } finally {
            this.loadingSubject.next(false);
        }
    }

    async confirmOrder(): Promise<void> {
        const order = this.orderSubject.value;
        if (!order || order.status !== 'pending') return;

        this.loadingSubject.next(true);
        this.errorSubject.next(null);

        try {
            const updated = await this.orderService.confirmOrder(order.id).toPromise();
            this.orderSubject.next(updated);
        } catch (e) {
            this.errorSubject.next(e.message);
        } finally {
            this.loadingSubject.next(false);
        }
    }

    private formatStatus(status: string): string {
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
}
```

```typescript
// views/order.component.ts
@Component({
    selector: 'app-order',
    template: `
        <div class="order" *ngIf="!(vm.isLoading$ | async)">
            <h1>Order #{{ (vm.order$ | async)?.id }}</h1>
            <p>Status: {{ vm.formattedStatus$ | async }}</p>
            <p>Total: {{ vm.formattedTotal$ | async }}</p>

            <button
                (click)="vm.confirmOrder()"
                [disabled]="!(vm.canConfirm$ | async)"
            >
                Confirm Order
            </button>

            <p *ngIf="vm.error$ | async as error" class="error">{{ error }}</p>
        </div>
        <div *ngIf="vm.isLoading$ | async">Loading...</div>
    `
})
export class OrderComponent implements OnInit {
    @Input() orderId!: string;

    constructor(public vm: OrderViewModel) {}

    ngOnInit(): void {
        this.vm.loadOrder(this.orderId);
    }
}
```

---

## Detection Patterns

### MVC Detection

```yaml
directory_patterns:
  web_frameworks:
    - app/controllers/ AND app/models/ AND app/views/     # Rails
    - Controllers/ AND Models/ AND Views/                  # ASP.NET MVC
    - src/Controller/ AND src/Entity/ AND templates/       # Symfony

  general:
    - controllers/ AND models/ AND views/
    - controller/ AND model/ AND view/

file_patterns:
  - "*Controller.rb", "*Controller.php", "*Controller.java", "*Controller.cs"
  - "*_controller.py" (Django views)

framework_indicators:
  - Rails (Gemfile with 'rails')
  - Django (settings.py, urls.py)
  - Laravel (artisan, composer.json with laravel)
  - ASP.NET MVC (*.csproj with Microsoft.AspNetCore.Mvc)
  - Spring MVC (@Controller, @RequestMapping)
```

### MVP Detection

```yaml
directory_patterns:
  - presenters/ AND views/
  - presenter/ AND view/
  - **/presenter/ AND **/view/

file_patterns:
  - "*Presenter.java", "*Presenter.kt", "*Presenter.ts"
  - "*View.java" (interface), "*ViewImpl.java"
  - "I*View.ts", "*View.ts" (interface + implementation)

code_patterns:
  # View interfaces
  - "interface.*View\\s*\\{"
  - "protocol.*View\\s*\\{"

  # Presenter holding view reference
  - "class.*Presenter.*\\{.*view:.*View"
  - "private.*view:.*View"

android_indicators:
  - "*Presenter.kt" with "*Activity.kt" or "*Fragment.kt"
  - Contract interface pattern (*.Contract.kt)
```

### MVVM Detection

```yaml
directory_patterns:
  - viewmodels/ OR view-models/ OR ViewModels/
  - **/viewmodel/ AND **/view/

file_patterns:
  - "*ViewModel.ts", "*ViewModel.swift", "*ViewModel.cs", "*ViewModel.kt"
  - "*.viewmodel.ts", "*-view-model.ts"

framework_indicators:
  vue:
    - "vue" in package.json
    - "ref(", "reactive(", "computed("
    - "v-model", "v-bind", "@click"

  angular:
    - "@angular/core" in package.json
    - "BehaviorSubject", "Observable"
    - "| async" in templates

  wpf_xamarin:
    - "INotifyPropertyChanged"
    - "ObservableCollection"
    - "ICommand", "RelayCommand"
    - ".xaml" files

  swiftui:
    - "@Published", "@ObservedObject", "@StateObject"
    - "ObservableObject"

code_patterns:
  # Observable properties
  - "@observable", "@Bindable", "@Published"
  - "BehaviorSubject<", "Observable<"
  - "ref\\(", "reactive\\("

  # Commands
  - "ICommand", "RelayCommand", "DelegateCommand"
```

### Import Analysis

```python
def detect_mvc_pattern(codebase):
    """
    Detect MVC/MVP/MVVM from directory structure and code patterns.
    """
    result = {
        'pattern': None,
        'confidence': 0,
        'evidence': []
    }

    # Check for framework-specific patterns
    if has_rails_structure(codebase):
        result['pattern'] = 'MVC'
        result['confidence'] = 0.95
        result['evidence'].append('Rails directory structure')
        return result

    if has_django_structure(codebase):
        result['pattern'] = 'MVC (MTV)'
        result['confidence'] = 0.95
        result['evidence'].append('Django project structure')
        return result

    # Check for viewmodels (MVVM)
    viewmodel_files = glob(codebase, '**/[Vv]iew[Mm]odel*')
    if viewmodel_files:
        result['pattern'] = 'MVVM'
        result['confidence'] = 0.85
        result['evidence'].append(f'Found {len(viewmodel_files)} ViewModel files')

        # Boost confidence with observable patterns
        if has_observable_patterns(codebase):
            result['confidence'] = 0.95
            result['evidence'].append('Observable/reactive patterns found')

        return result

    # Check for presenters (MVP)
    presenter_files = glob(codebase, '**/[Pp]resenter*')
    view_interfaces = find_view_interfaces(codebase)

    if presenter_files and view_interfaces:
        result['pattern'] = 'MVP'
        result['confidence'] = 0.90
        result['evidence'].append(f'Found {len(presenter_files)} Presenter files')
        result['evidence'].append(f'Found {len(view_interfaces)} View interfaces')
        return result

    # Check for basic MVC
    has_controllers = exists_any(codebase, ['controllers/', 'Controller/'])
    has_views = exists_any(codebase, ['views/', 'View/', 'templates/'])
    has_models = exists_any(codebase, ['models/', 'Model/', 'entities/'])

    if has_controllers and has_views and has_models:
        result['pattern'] = 'MVC'
        result['confidence'] = 0.75
        result['evidence'].append('controllers/, views/, models/ directories')
        return result

    return result
```

---

## Common Violations

### MVC Violations

```typescript
// VIOLATION: Controller with too much logic
class OrderController {
    async create(req, res) {
        // Business logic in controller
        const items = req.body.items;
        let total = 0;
        for (const item of items) {
            const product = await db.products.find(item.productId);
            if (!product) throw new Error('Product not found');
            if (product.stock < item.quantity) throw new Error('Insufficient stock');
            total += product.price * item.quantity;
        }
        // ... more logic
    }
}

// CORRECT: Controller delegates to Model/Service
class OrderController {
    async create(req, res) {
        const order = await this.orderService.createOrder(req.body);
        res.json(order);
    }
}
```

### MVP Violations

```typescript
// VIOLATION: View contains logic
class OrderView implements IOrderView {
    onConfirmClicked() {
        if (this.order.status === 'pending') {  // Logic in View!
            this.orderService.confirm(this.order.id);
        }
    }
}

// CORRECT: View delegates to Presenter
class OrderView implements IOrderView {
    onConfirmClicked() {
        this.presenter.onConfirmClicked();  // Just delegate
    }
}
```

### MVVM Violations

```typescript
// VIOLATION: View directly modifies Model
const OrderView = {
    template: `<button @click="order.confirm()">Confirm</button>`,
    // Directly calling model method from view
};

// CORRECT: View goes through ViewModel
const OrderView = {
    template: `<button @click="viewModel.confirmOrder()">Confirm</button>`,
    // ViewModel handles the action
};
```

---

## When to Use Each Pattern

| Pattern | Best For | Avoid When |
|---------|----------|------------|
| **MVC** | Server-rendered web apps, REST APIs | Rich client interactivity |
| **MVP** | Desktop apps, highly testable UI, Android (legacy) | Simple UIs, when binding is available |
| **MVVM** | Rich client apps with data binding, SPA frameworks | Server-rendered, no binding framework |

---

## References

- "Design Patterns" by Gang of Four (original MVC)
- Martin Fowler's GUI Architectures
- Microsoft MVVM documentation
- Android Architecture Components (MVP/MVVM)
