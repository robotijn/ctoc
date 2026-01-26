# Lit CTO
> Fast web components.

## Non-Negotiables
1. Reactive properties
2. Shadow DOM encapsulation
3. Template literals
4. Proper lifecycle
5. Declarative event handling

## Red Lines
- Direct DOM manipulation
- Missing property decorators
- Ignoring shadow DOM styling
- No attribute reflection

## Pattern
```typescript
@customElement('my-element')
export class MyElement extends LitElement {
  @property() name = 'World';

  render() {
    return html`<h1>Hello, ${this.name}!</h1>`;
  }
}
```
