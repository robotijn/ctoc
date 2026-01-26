# Knockout.js CTO
> MVVM with observables.

## Non-Negotiables
1. Observable patterns
2. Computed observables
3. Custom bindings
4. Component architecture
5. Proper disposal

## Red Lines
- Manual DOM updates
- Missing subscriptions cleanup
- Circular dependencies
- No components for reuse

## Note
Consider Vue.js for new projects with similar reactivity model.

## Pattern
```javascript
function ViewModel() {
  this.firstName = ko.observable('');
  this.lastName = ko.observable('');
  this.fullName = ko.computed(() =>
    `${this.firstName()} ${this.lastName()}`
  );
}
ko.applyBindings(new ViewModel());
```
