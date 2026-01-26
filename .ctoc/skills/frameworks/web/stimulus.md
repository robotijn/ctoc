# Stimulus CTO
> Modest JavaScript for HTML you already have - controllers, targets, values.

## Commands
```bash
# Setup | Dev | Test
npm install @hotwired/stimulus
# Rails: rails stimulus:install
# Webpack/Vite: import and register controllers
```

## Non-Negotiables
1. Controller organization by behavior
2. Targets for DOM element references
3. Values for reactive state
4. Actions for event bindings
5. Outlets for cross-controller communication

## Red Lines
- DOM queries in controllers - use targets
- Missing target definitions in static
- State outside values - loses reactivity
- Complex JavaScript logic - keep it simple
- Not using data attributes properly

## Pattern: Interactive Component
```javascript
// controllers/users_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["list", "form", "input", "count"]
  static values = {
    url: String,
    loading: { type: Boolean, default: false }
  }

  connect() {
    this.load()
  }

  async load() {
    this.loadingValue = true
    try {
      const response = await fetch(this.urlValue)
      const html = await response.text()
      this.listTarget.innerHTML = html
      this.updateCount()
    } finally {
      this.loadingValue = false
    }
  }

  async submit(event) {
    event.preventDefault()
    const formData = new FormData(this.formTarget)

    const response = await fetch(this.urlValue, {
      method: 'POST',
      body: formData,
      headers: { 'Accept': 'text/html' }
    })

    if (response.ok) {
      this.formTarget.reset()
      this.load()
    }
  }

  updateCount() {
    const count = this.listTarget.querySelectorAll('li').length
    this.countTarget.textContent = count
  }

  // Reactive callback when value changes
  loadingValueChanged() {
    this.element.classList.toggle('loading', this.loadingValue)
  }
}
```

```html
<!-- HTML with Stimulus attributes -->
<div data-controller="users"
     data-users-url-value="/api/users">

  <span data-users-target="count">0</span> users

  <form data-users-target="form"
        data-action="submit->users#submit">
    <input data-users-target="input" name="email" />
    <button type="submit">Add User</button>
  </form>

  <ul data-users-target="list"></ul>

  <button data-action="click->users#load">Refresh</button>
</div>
```

## Integrates With
- **Turbo**: Natural pairing for Hotwire stack
- **Rails**: `stimulus-rails` gem
- **Backend**: Any HTML-rendering server
- **CSS**: Toggle classes for state changes

## Common Errors
| Error | Fix |
|-------|-----|
| `Target not found` | Check `data-{name}-target` attribute |
| `Controller not connecting` | Check `data-controller` attribute |
| `Value not updating` | Check `{name}ValueChanged` callback |
| `Action not firing` | Check `data-action` syntax |

## Prod Ready
- [ ] Controllers lazy-loaded
- [ ] Targets properly defined
- [ ] Values for all state
- [ ] Disconnect cleanup
- [ ] Error handling in async
- [ ] Accessible interactions
