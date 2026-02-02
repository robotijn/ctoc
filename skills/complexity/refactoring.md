# Complexity Refactoring Patterns
> Systematic techniques to reduce complexity with before/after examples. Updated February 2026.

## Quick Reference: Which Pattern to Use

| Symptom | Metric Violated | Recommended Pattern |
|---------|-----------------|---------------------|
| Long function | LOC, CC | Extract Method |
| Deep nesting | Nesting, Cognitive | Guard Clauses, Extract Method |
| Many branches | CC | Replace Conditional with Polymorphism |
| Conditional chains | CC, Cognitive | Decompose Conditional, Strategy |
| Many parameters | Params | Parameter Object, Builder |
| Large class | LOC, WMC | Extract Class |
| Low cohesion | LCOM | Move Method, Extract Class |
| High coupling | CBO | Dependency Injection, Facade |

---

## Pattern 1: Extract Method

### When to Use
- Function exceeds line limit (>30-50 lines)
- Block of code has a clear single purpose
- Same code appears multiple times
- Code block requires a comment to explain

### Complexity Reduction
- **CC**: Reduces by moving decision points to separate function
- **Cognitive**: Significant reduction by reducing nesting context
- **LOC**: Distributes lines across focused functions

### Example: Before (CC=12, Cognitive=18, LOC=45)
```python
def process_order(order):
    # Validate order
    if not order.customer_id:
        raise ValueError("Missing customer")
    if not order.items:
        raise ValueError("Empty order")
    if order.total < 0:
        raise ValueError("Invalid total")

    # Check inventory
    for item in order.items:
        stock = get_stock(item.sku)
        if stock < item.quantity:
            if item.allow_backorder:
                create_backorder(item)
            else:
                raise OutOfStockError(item.sku)

    # Calculate pricing
    subtotal = 0
    for item in order.items:
        price = item.unit_price * item.quantity
        if item.discount_percent:
            price = price * (1 - item.discount_percent / 100)
        subtotal += price

    # Apply order-level discount
    if order.coupon_code:
        coupon = get_coupon(order.coupon_code)
        if coupon and coupon.is_valid():
            if coupon.type == 'percent':
                subtotal = subtotal * (1 - coupon.value / 100)
            else:
                subtotal = subtotal - coupon.value

    tax = subtotal * 0.08
    total = subtotal + tax + order.shipping_cost
    return create_invoice(order, total)
```

### Example: After (CC=3, Cognitive=4, LOC=12)
```python
def process_order(order):
    validate_order(order)
    check_inventory(order.items)
    subtotal = calculate_subtotal(order.items)
    subtotal = apply_coupon(subtotal, order.coupon_code)
    total = calculate_total(subtotal, order.shipping_cost)
    return create_invoice(order, total)

def validate_order(order):
    """CC=3, Cognitive=3"""
    if not order.customer_id:
        raise ValueError("Missing customer")
    if not order.items:
        raise ValueError("Empty order")
    if order.total < 0:
        raise ValueError("Invalid total")

def check_inventory(items):
    """CC=3, Cognitive=4"""
    for item in items:
        stock = get_stock(item.sku)
        if stock < item.quantity:
            if item.allow_backorder:
                create_backorder(item)
            else:
                raise OutOfStockError(item.sku)

def calculate_subtotal(items):
    """CC=2, Cognitive=3"""
    subtotal = 0
    for item in items:
        price = item.unit_price * item.quantity
        if item.discount_percent:
            price = price * (1 - item.discount_percent / 100)
        subtotal += price
    return subtotal

def apply_coupon(subtotal, coupon_code):
    """CC=4, Cognitive=5"""
    if not coupon_code:
        return subtotal
    coupon = get_coupon(coupon_code)
    if not coupon or not coupon.is_valid():
        return subtotal
    if coupon.type == 'percent':
        return subtotal * (1 - coupon.value / 100)
    return subtotal - coupon.value

def calculate_total(subtotal, shipping_cost, tax_rate=0.08):
    """CC=1, Cognitive=0"""
    tax = subtotal * tax_rate
    return subtotal + tax + shipping_cost
```

---

## Pattern 2: Replace Nested Conditionals with Guard Clauses

### When to Use
- Function has deep nesting (>3 levels)
- Early exit conditions buried in else branches
- "Happy path" obscured by error handling

### Complexity Reduction
- **Cognitive**: Major reduction (eliminates nesting penalties)
- **Nesting**: Reduces max depth to 1-2
- **CC**: No change (same decision count)

### Example: Before (Cognitive=15, Nesting=5)
```python
def get_payment_method(user, order):
    if user is not None:
        if user.is_active:
            if order is not None:
                if order.total > 0:
                    if user.has_payment_method():
                        return user.default_payment_method()
                    else:
                        return None
                else:
                    return None
            else:
                return None
        else:
            return None
    else:
        return None
```

### Example: After (Cognitive=5, Nesting=1)
```python
def get_payment_method(user, order):
    if user is None:
        return None
    if not user.is_active:
        return None
    if order is None:
        return None
    if order.total <= 0:
        return None
    if not user.has_payment_method():
        return None

    return user.default_payment_method()
```

### Advanced: Combine Guards with Early Success
```python
def get_payment_method(user, order):
    # Guard: invalid inputs
    if not user or not user.is_active:
        return None
    if not order or order.total <= 0:
        return None

    # Main logic (single level)
    return user.default_payment_method() if user.has_payment_method() else None
```

---

## Pattern 3: Replace Conditional with Polymorphism

### When to Use
- Switch/if-else on type or category
- Same conditional structure repeated across methods
- Adding new types requires modifying existing code
- CC > 10 from type checking

### Complexity Reduction
- **CC**: Dramatic reduction (1 per class vs N in switch)
- **Cognitive**: Reduced (behavior co-located with type)
- **Maintainability**: Open/Closed principle satisfied

### Example: Before (CC=8)
```python
def calculate_shipping(order):
    if order.shipping_type == 'standard':
        if order.weight < 1:
            return 5.99
        elif order.weight < 5:
            return 8.99
        else:
            return 12.99
    elif order.shipping_type == 'express':
        if order.weight < 1:
            return 15.99
        elif order.weight < 5:
            return 22.99
        else:
            return 35.99
    elif order.shipping_type == 'overnight':
        return 49.99 + (order.weight * 2)
    else:
        raise ValueError(f"Unknown shipping type: {order.shipping_type}")
```

### Example: After (CC=2 per class)
```python
from abc import ABC, abstractmethod

class ShippingStrategy(ABC):
    @abstractmethod
    def calculate(self, weight: float) -> float:
        pass

class StandardShipping(ShippingStrategy):
    def calculate(self, weight: float) -> float:
        if weight < 1:
            return 5.99
        if weight < 5:
            return 8.99
        return 12.99

class ExpressShipping(ShippingStrategy):
    def calculate(self, weight: float) -> float:
        if weight < 1:
            return 15.99
        if weight < 5:
            return 22.99
        return 35.99

class OvernightShipping(ShippingStrategy):
    def calculate(self, weight: float) -> float:
        return 49.99 + (weight * 2)

# Usage
SHIPPING_STRATEGIES = {
    'standard': StandardShipping(),
    'express': ExpressShipping(),
    'overnight': OvernightShipping(),
}

def calculate_shipping(order):
    strategy = SHIPPING_STRATEGIES.get(order.shipping_type)
    if not strategy:
        raise ValueError(f"Unknown shipping type: {order.shipping_type}")
    return strategy.calculate(order.weight)
```

---

## Pattern 4: Decompose Conditional

### When to Use
- Complex boolean expressions (CC from && and ||)
- Condition logic obscures intent
- Same condition used in multiple places

### Complexity Reduction
- **Cognitive**: Reduced (named conditions are self-documenting)
- **CC**: Unchanged or slightly reduced
- **Maintainability**: Conditions become testable units

### Example: Before (Cognitive=8)
```python
def can_apply_discount(user, order, promotion):
    if (user.is_premium or user.total_orders > 10) and \
       order.total >= 50 and \
       promotion.is_active and \
       (promotion.min_items is None or len(order.items) >= promotion.min_items) and \
       user.created_at < promotion.start_date:
        return True
    return False
```

### Example: After (Cognitive=4)
```python
def can_apply_discount(user, order, promotion):
    return (
        is_eligible_user(user, promotion) and
        meets_order_minimum(order, promotion) and
        promotion_is_valid(promotion)
    )

def is_eligible_user(user, promotion):
    """User qualifies for promotional pricing."""
    is_premium_or_loyal = user.is_premium or user.total_orders > 10
    existed_before_promo = user.created_at < promotion.start_date
    return is_premium_or_loyal and existed_before_promo

def meets_order_minimum(order, promotion):
    """Order meets minimum requirements for promotion."""
    meets_value = order.total >= 50
    meets_items = promotion.min_items is None or len(order.items) >= promotion.min_items
    return meets_value and meets_items

def promotion_is_valid(promotion):
    """Promotion is currently active."""
    return promotion.is_active
```

---

## Pattern 5: Introduce Parameter Object

### When to Use
- Function has more than 4 parameters
- Same group of parameters passed together
- Parameters represent a concept (e.g., date range, address)

### Complexity Reduction
- **Params**: Dramatic reduction (N params -> 1 object)
- **Maintainability**: Easier to add/remove fields
- **Type Safety**: Object can validate its own state

### Example: Before (Params=8)
```python
def create_user(
    first_name,
    last_name,
    email,
    phone,
    street,
    city,
    state,
    zip_code
):
    user = User(
        name=f"{first_name} {last_name}",
        email=email,
        phone=phone
    )
    user.address = Address(
        street=street,
        city=city,
        state=state,
        zip_code=zip_code
    )
    return user
```

### Example: After (Params=2)
```python
from dataclasses import dataclass

@dataclass
class PersonalInfo:
    first_name: str
    last_name: str
    email: str
    phone: str

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

@dataclass
class Address:
    street: str
    city: str
    state: str
    zip_code: str

def create_user(personal_info: PersonalInfo, address: Address):
    user = User(
        name=personal_info.full_name,
        email=personal_info.email,
        phone=personal_info.phone
    )
    user.address = address
    return user
```

---

## Pattern 6: Extract Class

### When to Use
- Class has too many responsibilities (SRP violation)
- Groups of methods operate on same subset of fields
- Class exceeds line limit (>300-400 lines)
- High WMC (>35) or LCOM (low cohesion)

### Complexity Reduction
- **WMC**: Distributed across smaller classes
- **LCOM**: Each class more cohesive
- **LOC**: Smaller, focused classes

### Example: Before (WMC=45, 400 lines)
```python
class Order:
    def __init__(self, items, customer):
        self.items = items
        self.customer = customer
        self.shipping_address = None
        self.billing_address = None

    # Item management (10 methods)
    def add_item(self, item): ...
    def remove_item(self, item_id): ...
    def update_quantity(self, item_id, qty): ...
    def get_item(self, item_id): ...
    def clear_items(self): ...
    # ... more item methods

    # Pricing (8 methods)
    def calculate_subtotal(self): ...
    def calculate_tax(self): ...
    def calculate_shipping(self): ...
    def apply_discount(self, code): ...
    def calculate_total(self): ...
    # ... more pricing methods

    # Validation (6 methods)
    def validate(self): ...
    def validate_items(self): ...
    def validate_customer(self): ...
    def validate_addresses(self): ...
    # ... more validation methods

    # Shipping (5 methods)
    def set_shipping_method(self, method): ...
    def estimate_delivery(self): ...
    def get_shipping_options(self): ...
    # ... more shipping methods
```

### Example: After (WMC=10 each, ~100 lines each)
```python
class Order:
    """Coordinates order components. WMC=10"""
    def __init__(self, items, customer):
        self.items = OrderItems(items)
        self.customer = customer
        self.pricing = OrderPricing(self.items)
        self.shipping = OrderShipping()
        self.validator = OrderValidator(self)

    def add_item(self, item):
        self.items.add(item)
        self.pricing.invalidate_cache()

    def calculate_total(self):
        return self.pricing.calculate_total(self.shipping)

    def validate(self):
        return self.validator.validate_all()


class OrderItems:
    """Manages order line items. WMC=8"""
    def __init__(self, items=None):
        self._items = list(items) if items else []

    def add(self, item): ...
    def remove(self, item_id): ...
    def update_quantity(self, item_id, qty): ...
    def get(self, item_id): ...
    def clear(self): ...
    def __iter__(self): ...


class OrderPricing:
    """Calculates order pricing. WMC=10"""
    def __init__(self, items):
        self.items = items
        self._discount = None

    def calculate_subtotal(self): ...
    def calculate_tax(self, subtotal): ...
    def apply_discount(self, code): ...
    def calculate_total(self, shipping): ...
    def invalidate_cache(self): ...


class OrderShipping:
    """Manages shipping options. WMC=8"""
    def __init__(self):
        self.method = None
        self.address = None

    def set_method(self, method): ...
    def set_address(self, address): ...
    def calculate_cost(self): ...
    def estimate_delivery(self): ...
    def get_options(self): ...


class OrderValidator:
    """Validates order state. WMC=8"""
    def __init__(self, order):
        self.order = order

    def validate_all(self): ...
    def validate_items(self): ...
    def validate_customer(self): ...
    def validate_addresses(self): ...
```

---

## Pattern 7: Replace Loop with Pipeline

### When to Use
- Complex loops with multiple operations
- Nested loops for filtering and transformation
- Loop body has high cognitive complexity

### Complexity Reduction
- **Cognitive**: Reduced (declarative vs imperative)
- **CC**: May reduce if loop had conditionals
- **Readability**: Each step clearly named

### Example: Before (Cognitive=12)
```python
def get_premium_order_totals(orders):
    result = []
    for order in orders:
        if order.status == 'completed':
            if order.customer.is_premium:
                total = 0
                for item in order.items:
                    if not item.is_cancelled:
                        price = item.price * item.quantity
                        if item.discount:
                            price = price * (1 - item.discount)
                        total += price
                if total > 100:
                    result.append({
                        'order_id': order.id,
                        'total': total
                    })
    return sorted(result, key=lambda x: x['total'], reverse=True)
```

### Example: After (Cognitive=4)
```python
def get_premium_order_totals(orders):
    return (
        orders
        .filter(lambda o: o.status == 'completed')
        .filter(lambda o: o.customer.is_premium)
        .map(lambda o: {
            'order_id': o.id,
            'total': calculate_order_total(o)
        })
        .filter(lambda x: x['total'] > 100)
        .sort_by('total', descending=True)
        .to_list()
    )

# Or with Python's built-in tools:
def get_premium_order_totals(orders):
    completed_premium = (
        o for o in orders
        if o.status == 'completed' and o.customer.is_premium
    )

    order_totals = (
        {'order_id': o.id, 'total': calculate_order_total(o)}
        for o in completed_premium
    )

    significant_orders = (
        ot for ot in order_totals
        if ot['total'] > 100
    )

    return sorted(significant_orders, key=lambda x: x['total'], reverse=True)

def calculate_order_total(order):
    """Single responsibility: calculate one order's total."""
    return sum(
        calculate_item_price(item)
        for item in order.items
        if not item.is_cancelled
    )

def calculate_item_price(item):
    """Single responsibility: calculate one item's price."""
    price = item.price * item.quantity
    if item.discount:
        price *= (1 - item.discount)
    return price
```

---

## Pattern 8: Replace State-Modifying Loop with Recursion/Fold

### When to Use
- Loop accumulates state through multiple conditions
- State transitions based on complex conditions
- Functional language or functional style codebase

### Example: Before (CC=6, Cognitive=10)
```python
def parse_tokens(tokens):
    result = []
    current_group = None
    depth = 0

    for token in tokens:
        if token == '(':
            if current_group is None:
                current_group = []
            depth += 1
        elif token == ')':
            depth -= 1
            if depth == 0:
                result.append(current_group)
                current_group = None
        else:
            if current_group is not None:
                current_group.append(token)
            else:
                result.append(token)

    return result
```

### Example: After with State Object (CC=4, Cognitive=6)
```python
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class ParseState:
    result: List
    current_group: Optional[List]
    depth: int

    def process_token(self, token: str) -> 'ParseState':
        if token == '(':
            return self._open_group()
        elif token == ')':
            return self._close_group()
        else:
            return self._add_token(token)

    def _open_group(self) -> 'ParseState':
        new_group = self.current_group if self.current_group else []
        return ParseState(self.result, new_group, self.depth + 1)

    def _close_group(self) -> 'ParseState':
        new_depth = self.depth - 1
        if new_depth == 0:
            return ParseState(
                self.result + [self.current_group],
                None,
                new_depth
            )
        return ParseState(self.result, self.current_group, new_depth)

    def _add_token(self, token: str) -> 'ParseState':
        if self.current_group is not None:
            return ParseState(
                self.result,
                self.current_group + [token],
                self.depth
            )
        return ParseState(self.result + [token], None, self.depth)

def parse_tokens(tokens):
    from functools import reduce
    initial = ParseState([], None, 0)
    final = reduce(lambda state, token: state.process_token(token), tokens, initial)
    return final.result
```

---

## Pattern 9: Consolidate Duplicate Conditional Fragments

### When to Use
- Same code in all branches of conditional
- Code before/after conditional is duplicated in branches

### Example: Before (Cognitive=8)
```python
def process_payment(payment):
    if payment.type == 'credit':
        log_attempt(payment)
        result = process_credit(payment)
        log_result(result)
        send_notification(payment.user, result)
        return result
    elif payment.type == 'debit':
        log_attempt(payment)
        result = process_debit(payment)
        log_result(result)
        send_notification(payment.user, result)
        return result
    else:
        log_attempt(payment)
        result = process_bank_transfer(payment)
        log_result(result)
        send_notification(payment.user, result)
        return result
```

### Example: After (Cognitive=3)
```python
def process_payment(payment):
    log_attempt(payment)

    if payment.type == 'credit':
        result = process_credit(payment)
    elif payment.type == 'debit':
        result = process_debit(payment)
    else:
        result = process_bank_transfer(payment)

    log_result(result)
    send_notification(payment.user, result)
    return result
```

---

## Pattern 10: Table-Driven Methods

### When to Use
- Complex conditional logic maps inputs to outputs
- Logic is data-like (could be configured externally)
- Same structure repeated with different values

### Example: Before (CC=12)
```python
def get_tax_rate(state, product_type):
    if state == 'CA':
        if product_type == 'food':
            return 0.0
        elif product_type == 'medicine':
            return 0.0
        elif product_type == 'clothing':
            return 0.0725
        else:
            return 0.0725
    elif state == 'NY':
        if product_type == 'food':
            return 0.0
        elif product_type == 'medicine':
            return 0.0
        elif product_type == 'clothing':
            if price < 110:
                return 0.0
            return 0.08
        else:
            return 0.08
    elif state == 'TX':
        # ... more states
```

### Example: After (CC=2)
```python
TAX_RATES = {
    'CA': {
        'default': 0.0725,
        'exempt': {'food', 'medicine'},
    },
    'NY': {
        'default': 0.08,
        'exempt': {'food', 'medicine'},
        'clothing_threshold': 110,
    },
    'TX': {
        'default': 0.0625,
        'exempt': {'food', 'medicine'},
    },
}

def get_tax_rate(state, product_type, price=0):
    config = TAX_RATES.get(state, {'default': 0.0, 'exempt': set()})

    if product_type in config.get('exempt', set()):
        return 0.0

    # Special case: NY clothing threshold
    threshold = config.get('clothing_threshold')
    if threshold and product_type == 'clothing' and price < threshold:
        return 0.0

    return config['default']
```

---

## Complexity Reduction Cheat Sheet

| Starting CC | Pattern | Expected CC After |
|-------------|---------|-------------------|
| 15+ | Extract Method | 5-8 per extracted method |
| 10+ (nested) | Guard Clauses | Same CC, lower Cognitive |
| 8+ (switch) | Polymorphism | 1-3 per class |
| 6+ (boolean) | Decompose Conditional | 2-4 |
| High params | Parameter Object | N/A (param reduction) |
| 40+ (class) | Extract Class | 10-15 per class |
| 8+ (loop) | Pipeline/Fold | 3-5 |
| 10+ (table) | Table-Driven | 2-4 |

---

## Anti-Patterns to Avoid

### Don't Over-Extract
```python
# BAD: Extraction that hides complexity without reducing it
def check_a(): return a
def check_b(): return b
def check_c(): return c
def check_all(): return check_a() and check_b() and check_c()

# GOOD: Meaningful extraction
def is_valid_user(): return user.active and user.verified
def has_permission(): return user.role in allowed_roles
def can_proceed(): return is_valid_user() and has_permission()
```

### Don't Create Deep Hierarchies
```python
# BAD: Polymorphism creating 10 subclasses for simple variations
# GOOD: Use composition or data-driven approach for small variations
```

### Don't Sacrifice Clarity for Metrics
```python
# BAD: Technically lower CC but harder to understand
result = (a and b) or (c and d) or default

# GOOD: Clear intent even with slightly higher CC
if a and b:
    result = compute_ab()
elif c and d:
    result = compute_cd()
else:
    result = default
```
