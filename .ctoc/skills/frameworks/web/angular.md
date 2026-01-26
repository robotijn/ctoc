# Angular CTO
> Enterprise frontend platform - signals and standalone components for modern Angular.

## Commands
```bash
# Setup | Dev | Test
ng new myapp --standalone --style=scss --routing
ng serve
ng test --code-coverage --watch=false
```

## Non-Negotiables
1. Standalone components (Angular 17+) - no NgModules for new code
2. Signals for reactive state - replace RxJS for simple cases
3. Proper dependency injection with `inject()` function
4. Lazy loading routes with `loadComponent`
5. OnPush change detection by default

## Red Lines
- Default change detection everywhere - use `ChangeDetectionStrategy.OnPush`
- Massive modules with dozens of declarations
- Missing subscription cleanup - use `takeUntilDestroyed()`
- Direct DOM manipulation - use renderer or directives
- `any` type in TypeScript - strict mode always

## Pattern: Signal-Based Component
```typescript
// user-list.component.ts
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { UserService } from './user.service';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [AsyncPipe, UserCardComponent],
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
export class UserListComponent {
  private userService = inject(UserService);

  users = toSignal(this.userService.getUsers(), { initialValue: [] });
  searchTerm = signal('');
  loading = signal(true);

  filteredUsers = computed(() =>
    this.users().filter(u =>
      u.name.toLowerCase().includes(this.searchTerm().toLowerCase())
    )
  );
}
```

## Integrates With
- **HTTP**: `HttpClient` with interceptors for auth and error handling
- **State**: NgRx SignalStore or Akita for complex state
- **Forms**: Reactive Forms with typed `FormGroup`
- **UI**: Angular Material or PrimeNG component libraries

## Common Errors
| Error | Fix |
|-------|-----|
| `NullInjectorError: No provider` | Add to `providers` array or use `providedIn: 'root'` |
| `ExpressionChangedAfterChecked` | Move logic to `ngOnInit` or use `ChangeDetectorRef` |
| `Cannot find module` | Check import path and tsconfig paths |
| `Observable not completing` | Use `take(1)`, `first()`, or `takeUntilDestroyed()` |

## Prod Ready
- [ ] AOT compilation enabled (default in production)
- [ ] Bundle budget configured in `angular.json`
- [ ] Lazy loading for all feature routes
- [ ] Service worker for offline support
- [ ] Internationalization with `@angular/localize`
- [ ] Security: sanitization, CSP headers, HTTPS only
