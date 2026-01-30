# Stencil CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm init stencil component myapp && cd myapp
npm start
# Stencil 4.x - web component compiler
```

## Claude's Common Mistakes
1. **Mutating props directly** — Props are immutable; use State
2. **Missing `@Watch` for prop changes** — Handle prop updates explicitly
3. **Ignoring lifecycle methods** — Use `componentWillLoad`, `componentDidLoad`
4. **No lazy loading strategy** — Use component splitting
5. **Shadow DOM conflicts** — Understand styling encapsulation

## Correct Patterns (2026)
```typescript
import { Component, Prop, State, Watch, h } from '@stencil/core';

@Component({
  tag: 'user-card',
  styleUrl: 'user-card.css',
  shadow: true,  // Encapsulated styling
})
export class UserCard {
  // Props are IMMUTABLE
  @Prop() userId: string;
  @Prop() name: string;

  // State is MUTABLE
  @State() loading: boolean = false;
  @State() user: User | null = null;

  // Watch for prop changes
  @Watch('userId')
  async userIdChanged(newId: string) {
    await this.loadUser(newId);
  }

  // Lifecycle
  async componentWillLoad() {
    if (this.userId) {
      await this.loadUser(this.userId);
    }
  }

  private async loadUser(id: string) {
    this.loading = true;
    try {
      const response = await fetch(`/api/users/${id}`);
      this.user = await response.json();
    } finally {
      this.loading = false;
    }
  }

  render() {
    if (this.loading) {
      return <div class="loading">Loading...</div>;
    }

    if (!this.user) {
      return <div class="error">User not found</div>;
    }

    return (
      <div class="user-card">
        <h2>{this.user.name}</h2>
        <p>{this.user.email}</p>
        <slot name="actions"></slot>
      </div>
    );
  }
}
```

## Version Gotchas
- **Stencil 4.x**: TypeScript 5+; improved hydration
- **Props**: Immutable; use `@State` for mutable data
- **@Watch**: Required to react to prop changes
- **Shadow DOM**: Styles are encapsulated by default

## What NOT to Do
- ❌ `this.prop = value` — Props are immutable
- ❌ Ignoring `@Watch` — Prop changes not detected
- ❌ Missing lifecycle methods — Load data in `componentWillLoad`
- ❌ CSS outside shadow DOM — Use `::part()` for external styling
- ❌ No lazy loading — Bundle size grows

## Common Errors
| Error | Fix |
|-------|-----|
| `Prop mutation` | Use `@State` for mutable data |
| `Prop change not detected` | Add `@Watch` decorator |
| `Style not applied` | Check shadow DOM encapsulation |
| `Component not rendering` | Check lifecycle, ensure `render()` returns |
