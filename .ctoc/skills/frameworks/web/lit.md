# Lit CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm init @open-wc
# Or manually:
npm install lit
# Lit 3.x - fast web components
```

## Claude's Common Mistakes
1. **Missing `@property()` decorator** — Properties won't be reactive without it
2. **Forgetting `reflect: true`** — Attributes won't sync to element
3. **CSS outside Shadow DOM** — Use `:host` and `::slotted()` selectors
4. **Events not bubbling** — Add `bubbles: true, composed: true` to CustomEvent
5. **Direct DOM manipulation** — Use reactive properties and templates

## Correct Patterns (2026)
```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('user-card')
export class UserCard extends LitElement {
  // Scoped styles (Shadow DOM)
  static styles = css`
    :host { display: block; padding: 1rem; }
    :host([selected]) { border: 2px solid blue; }
    .name { font-weight: bold; }
  `;

  // Public property (reactive, reflected to attribute)
  @property({ type: Object }) user?: User;
  @property({ type: Boolean, reflect: true }) selected = false;

  // Private state (reactive, not reflected)
  @state() private _editing = false;

  render() {
    if (!this.user) return html`<p>No user</p>`;

    return html`
      <div class="name">${this.user.name}</div>
      <div>${this.user.email}</div>
      <button @click=${this._handleEdit}>Edit</button>
      ${this._editing ? html`
        <input .value=${this.user.name} @input=${this._handleInput} />
      ` : ''}
    `;
  }

  private _handleEdit() {
    this._editing = !this._editing;
  }

  private _handleInput(e: InputEvent) {
    const input = e.target as HTMLInputElement;
    // Dispatch with bubbles + composed for Shadow DOM
    this.dispatchEvent(new CustomEvent('user-updated', {
      detail: { ...this.user, name: input.value },
      bubbles: true,
      composed: true,  // Required to cross Shadow DOM
    }));
  }
}
```

## Version Gotchas
- **Lit 3.x**: Current stable; smaller bundle
- **Shadow DOM**: Styles are encapsulated; use `:host` for element styling
- **Decorators**: Require TypeScript or Babel plugin
- **SSR**: Use `@lit-labs/ssr` for server rendering

## What NOT to Do
- ❌ Missing `@property()` — Property changes won't trigger render
- ❌ `reflect: false` on state attributes — Won't sync to HTML
- ❌ `document.querySelector()` in component — Use `this.shadowRoot`
- ❌ `composed: false` on events — Won't bubble through Shadow DOM
- ❌ Global CSS expecting to style component — Shadow DOM blocks it

## Property Decorators
| Decorator | Use For |
|-----------|---------|
| `@property()` | Public reactive props |
| `@state()` | Private reactive state |
| `@query()` | Shadow DOM element refs |
| `@queryAll()` | Multiple element refs |

## Shadow DOM Styling
```css
:host { }                    /* The element itself */
:host([attr]) { }            /* With attribute */
:host-context(.dark) { }     /* Parent has class */
::slotted(p) { }             /* Slotted content */
```
