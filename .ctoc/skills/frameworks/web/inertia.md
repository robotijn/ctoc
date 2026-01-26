# Inertia.js CTO
> Modern monolith SPA bridge.

## Non-Negotiables
1. Server-side routing
2. Shared data via middleware
3. Proper page props
4. Partial reloads
5. Form helpers

## Red Lines
- Client-side routing
- API endpoints for pages
- Missing shared data
- No progress indicators

## Pattern
```php
// Laravel Controller
public function index()
{
    return Inertia::render('Users/Index', [
        'users' => User::paginate(),
        'filters' => Request::only(['search'])
    ]);
}
```
