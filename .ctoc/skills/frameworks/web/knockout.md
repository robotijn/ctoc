# Knockout.js CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install knockout
# Knockout 3.5.x - legacy MVVM; maintenance mode
```

## Claude's Common Mistakes
1. **Suggesting Knockout for new projects** — Recommend Vue.js instead
2. **Manual DOM updates** — Let observables handle reactivity
3. **Missing subscription cleanup** — Memory leaks in SPAs
4. **Circular computed dependencies** — Causes infinite loops
5. **No component architecture** — Hard to maintain large apps

## Correct Patterns (2026)
```javascript
// ViewModel with observables
function UserViewModel() {
  const self = this;

  // Observables for reactive data
  self.firstName = ko.observable('');
  self.lastName = ko.observable('');
  self.email = ko.observable('');

  // Computed observable (auto-updates)
  self.fullName = ko.computed(() =>
    `${self.firstName()} ${self.lastName()}`
  );

  // Observable array for lists
  self.users = ko.observableArray([]);

  // Methods
  self.loadUsers = async function() {
    const response = await fetch('/api/users');
    const data = await response.json();
    self.users(data);
  };

  self.saveUser = async function() {
    const user = {
      firstName: self.firstName(),
      lastName: self.lastName(),
      email: self.email()
    };
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
  };
}

// Component registration
ko.components.register('user-card', {
  viewModel: function(params) {
    this.user = params.user;
  },
  template: '<div class="card"><h3 data-bind="text: user.fullName"></h3></div>'
});

// Apply bindings
const vm = new UserViewModel();
ko.applyBindings(vm);

// Cleanup on page unload (IMPORTANT)
window.addEventListener('beforeunload', () => {
  ko.cleanNode(document.body);
});
```

## Version Gotchas
- **Knockout 3.5.x**: Maintenance mode; no major updates
- **Observables**: Call as function to read/write: `name()` / `name('value')`
- **Computed**: Auto-tracks dependencies; don't create circular refs
- **Components**: Use for reusable UI pieces

## What NOT to Do
- ❌ Knockout for new projects — Use Vue.js (similar reactivity)
- ❌ Manual DOM manipulation — Use data-bind attributes
- ❌ Forgetting to cleanup subscriptions — Memory leaks
- ❌ Circular computed dependencies — Infinite loops
- ❌ Monolithic ViewModels — Use components

## Common Errors
| Error | Fix |
|-------|-----|
| `Observable not updating` | Call as function: `obs()` not `obs` |
| `Infinite loop` | Check circular computed dependencies |
| `Memory leak` | Call `ko.cleanNode()` on removal |
| `Component not found` | Register before `applyBindings` |

## Migration Note
Knockout is in maintenance mode. For new projects:
- **Vue.js** — Similar reactivity model, modern tooling
- **React** — Component-based, large ecosystem
- **Svelte** — Compiler-based, minimal runtime
