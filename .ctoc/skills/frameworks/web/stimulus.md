# Stimulus CTO
> Modest JavaScript for HTML you have.

## Non-Negotiables
1. Controller organization
2. Targets for DOM references
3. Values for state
4. Actions for events
5. Outlets for cross-controller

## Red Lines
- DOM queries in controllers
- Missing target definitions
- State outside values
- Complex JavaScript logic

## Pattern
```javascript
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["output"]
  static values = { count: Number }

  increment() {
    this.countValue++
    this.outputTarget.textContent = this.countValue
  }
}
```
