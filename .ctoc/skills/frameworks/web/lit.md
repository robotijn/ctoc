# Lit CTO
> Fast web components - small, efficient, standards-based.

## Commands
```bash
# Setup | Dev | Test
npm init @open-wc && cd myapp
npm run dev
npm test
```

## Non-Negotiables
1. Reactive properties with decorators
2. Shadow DOM for style encapsulation
3. Template literals with `html` tag
4. Proper lifecycle callbacks
5. Declarative event handling

## Red Lines
- Direct DOM manipulation - use reactive properties
- Missing property decorators
- Ignoring Shadow DOM styling constraints
- No attribute reflection when needed
- Blocking render with sync operations

## Pattern: Custom Element
```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

interface User {
  id: number;
  name: string;
  email: string;
}

@customElement('user-card')
export class UserCard extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 1rem;
      border: 1px solid #ccc;
    }
    .name { font-weight: bold; }
  `;

  @property({ type: Object }) user?: User;
  @property({ type: Boolean, reflect: true }) selected = false;
  @state() private _editing = false;

  render() {
    if (!this.user) return html`<p>No user</p>`;

    return html`
      <div class="name">${this.user.name}</div>
      <div>${this.user.email}</div>
      <button @click=${this._handleEdit}>
        ${this._editing ? 'Cancel' : 'Edit'}
      </button>
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
    this.dispatchEvent(new CustomEvent('user-updated', {
      detail: { ...this.user, name: input.value },
      bubbles: true,
      composed: true,
    }));
  }
}
```

## Integrates With
- **Routing**: Vaadin Router, or custom
- **State**: Lit Context, or external stores
- **Styling**: CSS-in-JS via `css` tag, or external CSS
- **Build**: Vite, Rollup, or Webpack

## Common Errors
| Error | Fix |
|-------|-----|
| `Property not reactive` | Add `@property()` decorator |
| `Styles not applying` | Check Shadow DOM, use `:host` |
| `Event not bubbling` | Add `composed: true` to CustomEvent |
| `Attribute not syncing` | Add `reflect: true` to property |

## Prod Ready
- [ ] Bundle size optimized
- [ ] SSR with `@lit-labs/ssr`
- [ ] Accessible: proper ARIA roles
- [ ] Properties documented
- [ ] Custom elements manifest generated
- [ ] Works in all modern browsers
