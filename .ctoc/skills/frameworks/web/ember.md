# Ember.js CTO
> Convention-driven ambitious applications.

## Non-Negotiables
1. Ember conventions
2. Octane patterns (Glimmer)
3. Ember Data for models
4. Route-based architecture
5. Testing with QUnit

## Red Lines
- Classic components (use Glimmer)
- Computed properties (use getters)
- Mixins (use decorators)
- Ignoring conventions

## Pattern
```javascript
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class Counter extends Component {
  @tracked count = 0;

  @action increment() {
    this.count++;
  }
}
```
