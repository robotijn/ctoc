# Stimulus CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install @hotwired/stimulus
# Rails: rails stimulus:install
```

## Claude's Common Mistakes
1. **DOM queries in controllers** — Use targets, not `querySelector`
2. **State outside values** — Values are reactive; plain properties aren't
3. **Missing `static targets`** — Targets must be declared
4. **Complex logic in controllers** — Keep controllers focused and simple
5. **Not cleaning up in `disconnect()`** — Remove listeners, timers

## Correct Patterns (2026)
```javascript
// controllers/users_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  // Declare targets (not querySelector!)
  static targets = ["list", "form", "input", "count"]

  // Declare values (reactive state)
  static values = {
    url: String,
    loading: { type: Boolean, default: false }
  }

  connect() {
    this.load()
  }

  async load() {
    this.loadingValue = true  // Reactive; triggers callback
    try {
      const response = await fetch(this.urlValue)
      const html = await response.text()
      this.listTarget.innerHTML = html  // Use target, not querySelector
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
    })

    if (response.ok) {
      this.formTarget.reset()
      this.load()
    }
  }

  updateCount() {
    this.countTarget.textContent = this.listTarget.children.length
  }

  // Reactive callback (fires when value changes)
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

## Version Gotchas
- **Stimulus 3.x**: Outlets for cross-controller communication
- **Targets**: Must be in `static targets` array
- **Values**: Must be in `static values` object
- **TypeScript**: Use `@stimulus-vite-helpers` for types

## What NOT to Do
- ❌ `this.element.querySelector('.list')` — Use `this.listTarget`
- ❌ `this.loading = true` — Use `this.loadingValue` for reactivity
- ❌ Missing `static targets = [...]` — Targets won't work
- ❌ Complex business logic — Extract to services
- ❌ Event listeners without cleanup — Use `disconnect()`

## Data Attributes
| Attribute | Purpose |
|-----------|---------|
| `data-controller` | Attach controller |
| `data-[name]-target` | Mark target element |
| `data-[name]-[key]-value` | Set value |
| `data-action` | Bind event to method |

## Pairs With
| Tool | Purpose |
|------|---------|
| Turbo | HTML-over-the-wire |
| Rails | Server framework |
| Any backend | Server-rendered HTML |
