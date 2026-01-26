# Ember.js CTO
> Convention-driven ambitious applications - Octane, Glimmer, batteries included.

## Commands
```bash
# Setup | Dev | Test
npx ember-cli new myapp --embroider && cd myapp
ember serve
ember test
```

## Non-Negotiables
1. Follow Ember conventions strictly
2. Octane patterns with Glimmer components
3. Ember Data for model layer
4. Route-based architecture
5. Testing with QUnit built-in

## Red Lines
- Classic components - use Glimmer only
- Computed properties - use native getters
- Mixins - use decorators and composition
- Ignoring conventions - Ember is opinionated
- Observer patterns - use tracked properties

## Pattern: Octane Component
```javascript
// app/components/user-list.js
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class UserListComponent extends Component {
  @service store;
  @tracked searchTerm = '';

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

## Integrates With
- **API**: Ember Data with JSON:API or REST
- **Auth**: ember-simple-auth
- **Testing**: QUnit with ember-qunit
- **Styling**: ember-css-modules or Tailwind

## Common Errors
| Error | Fix |
|-------|-----|
| `Adapter error` | Check API endpoint matches adapter |
| `Template not found` | Check co-location or pods structure |
| `Property not reactive` | Add `@tracked` decorator |
| `Deprecation warning` | Update to Octane patterns |

## Prod Ready
- [ ] Embroider build for tree-shaking
- [ ] Code splitting enabled
- [ ] Fastboot for SSR (optional)
- [ ] Error tracking integrated
- [ ] Bundle size analyzed
- [ ] All deprecations resolved
