# Stencil CTO
> Web component compiler.

## Non-Negotiables
1. TypeScript decorators
2. JSX templating
3. Lazy loading
4. Framework integration
5. Proper prop/state separation

## Red Lines
- Mutable props
- Missing @Watch handlers
- Ignoring component lifecycle
- No lazy loading strategy

## Pattern
```typescript
@Component({
  tag: 'my-component',
  shadow: true,
})
export class MyComponent {
  @Prop() name: string;
  @State() count = 0;

  render() {
    return <button onClick={() => this.count++}>{this.count}</button>;
  }
}
```
