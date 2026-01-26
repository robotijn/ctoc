# Marko CTO
> Streaming UI framework.

## Non-Negotiables
1. Streaming SSR
2. Component-based architecture
3. Concise syntax
4. Proper state management
5. Islands architecture

## Red Lines
- Blocking render
- Client-only components
- Missing streaming benefits
- Ignoring compiler optimizations

## Pattern
```marko
class {
  onCreate() {
    this.state = { count: 0 };
  }
  increment() {
    this.state.count++;
  }
}

<button on-click('increment')>${state.count}</button>
```
