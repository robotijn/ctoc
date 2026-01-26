# Ember.js CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx ember-cli new my-app --embroider
cd my-app && ember serve
# Ember 5.x - Octane is the only pattern
```

## Claude's Common Mistakes
1. **Classic components** — Always use Glimmer components
2. **Computed properties** — Use native getters with `@tracked`
3. **Mixins** — Use composition and decorators instead
4. **Observer patterns** — Use `@tracked` properties
5. **Ignoring conventions** — Ember is opinionated; follow conventions

## Correct Patterns (2026)
```javascript
// app/components/user-list.js (Glimmer, NOT classic)
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class UserListComponent extends Component {
  @service store;
  @tracked searchTerm = '';

  // Native getter (NOT computed property)
  get filteredUsers() {
    const { users } = this.args;
    if (!this.searchTerm) return users;
    return users.filter(u =>
      u.name.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  @action
  updateSearch(event) {
    this.searchTerm = event.target.value;
  }

  @action
  async deleteUser(user) {
    await user.destroyRecord();
  }
}

// app/components/user-list.hbs
<input
  value={{this.searchTerm}}
  {{on "input" this.updateSearch}}
  placeholder="Search..."
/>

{{#each this.filteredUsers as |user|}}
  <div>
    <span>{{user.name}}</span>
    <button {{on "click" (fn this.deleteUser user)}}>Delete</button>
  </div>
{{/each}}
```

## Version Gotchas
- **Ember 5.x**: Octane is mandatory; classic deprecated
- **Embroider**: Required for tree-shaking, code splitting
- **Glimmer**: Components are default; no classic components
- **@tracked**: Replaces computed properties

## What NOT to Do
- ❌ `extend(Component, { ... })` — Use `class extends Component`
- ❌ `computed('dep', function() {})` — Use native getters
- ❌ `Ember.Mixin.create()` — Use composition
- ❌ `observes('prop')` — Use `@tracked` reactivity
- ❌ Custom folder structure — Follow Ember conventions

## Octane Patterns
| Classic (WRONG) | Octane (CORRECT) |
|-----------------|------------------|
| `computed()` | Native getter |
| `observer()` | `@tracked` |
| `Mixin` | Composition |
| `this.set()` | Direct assignment |
| `@ember/component` | `@glimmer/component` |

## Route Data Loading
```javascript
// app/routes/users.js
import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class UsersRoute extends Route {
  @service store;

  model() {
    return this.store.findAll('user');
  }
}
```
