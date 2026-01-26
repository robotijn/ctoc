# Angular CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install -g @angular/cli
ng new myapp --standalone --style=scss
# Angular 19+ components are standalone by default
ng serve
```

## Claude's Common Mistakes
1. **Using NgModules for new code** — Angular 19+ defaults to standalone components
2. **RxJS for simple state** — Use Signals for synchronous reactive state
3. **Default change detection** — Always use `OnPush` for performance
4. **Manual subscription cleanup** — Use `takeUntilDestroyed()` or async pipe
5. **Using deprecated TSLint** — Use ESLint with `@angular-eslint`

## Correct Patterns (2026)
```typescript
// Angular 19: Standalone + Signals
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-users',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <app-spinner />
    } @else {
      @for (user of filteredUsers(); track user.id) {
        <app-user-card [user]="user" />
      } @empty {
        <p>No users found</p>
      }
    }
  `,
})
export class UsersComponent {
  private userService = inject(UserService);

  // Convert Observable to Signal
  users = toSignal(this.userService.getUsers(), { initialValue: [] });
  searchTerm = signal('');

  // Computed signal (auto-tracks dependencies)
  filteredUsers = computed(() =>
    this.users().filter(u =>
      u.name.toLowerCase().includes(this.searchTerm().toLowerCase())
    )
  );
}

// Auto-cleanup with takeUntilDestroyed
private destroyRef = inject(DestroyRef);

ngOnInit() {
  this.data$.pipe(
    takeUntilDestroyed(this.destroyRef)
  ).subscribe(data => this.handleData(data));
}
```

## Version Gotchas
- **v18→v19**: Standalone is default; set `standalone: false` for NgModules
- **v18→v19**: Incremental hydration for SSR
- **v18→v19**: TypeScript 5.6 required
- **v18 EOL**: Full end of life reached in 2025
- **v19 EOL**: Security support ends May 2026

## What NOT to Do
- ❌ `@NgModule({ declarations: [...] })` for new code — Use standalone
- ❌ `ChangeDetectionStrategy.Default` — Use `OnPush`
- ❌ `ngOnDestroy() { this.sub.unsubscribe() }` — Use `takeUntilDestroyed`
- ❌ `*ngIf` and `*ngFor` — Use `@if` and `@for` control flow
- ❌ Zone.js for state in new apps — Use Signals

## Signals vs RxJS
| Use Case | Solution |
|----------|----------|
| Synchronous state | Signals |
| HTTP requests | RxJS (HttpClient) |
| Complex async flows | RxJS |
| Template binding | Signals preferred |
| Cross-component events | RxJS Subjects |

## Control Flow Syntax (v17+)
```html
<!-- Old syntax -->
<div *ngIf="condition">...</div>
<li *ngFor="let item of items">...</li>

<!-- New syntax (preferred) -->
@if (condition) { <div>...</div> }
@for (item of items; track item.id) { <li>...</li> }
```
