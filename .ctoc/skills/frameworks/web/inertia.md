# Inertia.js CTO
> Modern monolith SPA bridge - server routing, client rendering.

## Commands
```bash
# Setup (Laravel + Vue)
composer require inertiajs/inertia-laravel
npm install @inertiajs/vue3
# Setup (Rails + React)
bundle add inertia_rails
npm install @inertiajs/react
```

## Non-Negotiables
1. Server-side routing - no client router
2. Shared data via middleware for global props
3. Proper page props validation
4. Partial reloads for efficiency
5. Form helpers for submissions

## Red Lines
- Client-side routing duplicating server routes
- API endpoints for page data
- Missing shared data for auth/flash
- No progress indicators on navigation
- Ignoring Inertia's form helpers

## Pattern: Full Stack Flow
```php
// Laravel Controller
class UserController extends Controller
{
    public function index(Request $request)
    {
        return Inertia::render('Users/Index', [
            'users' => User::query()
                ->when($request->search, fn($q, $s) => $q->where('name', 'like', "%{$s}%"))
                ->paginate()
                ->withQueryString(),
            'filters' => $request->only(['search']),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email|unique:users',
            'password' => 'required|min:8',
        ]);

        User::create($validated);

        return redirect()->route('users.index')
            ->with('success', 'User created!');
    }
}

// HandleInertiaRequests Middleware
public function share(Request $request): array
{
    return [
        'auth' => ['user' => $request->user()],
        'flash' => ['success' => session('success')],
    ];
}
```

```vue
<!-- resources/js/Pages/Users/Index.vue -->
<script setup>
import { Head, Link, router, useForm } from '@inertiajs/vue3';

const props = defineProps(['users', 'filters']);

const form = useForm({ email: '', password: '' });

function submit() {
  form.post('/users', {
    onSuccess: () => form.reset(),
  });
}

// Partial reload for search
function search(value) {
  router.get('/users', { search: value }, {
    preserveState: true,
    replace: true,
  });
}
</script>

<template>
  <Head title="Users" />
  <input :value="filters.search" @input="search($event.target.value)" />
  <form @submit.prevent="submit">
    <input v-model="form.email" />
    <input v-model="form.password" type="password" />
    <button :disabled="form.processing">Create</button>
  </form>
  <ul>
    <li v-for="user in users.data" :key="user.id">{{ user.email }}</li>
  </ul>
</template>
```

## Integrates With
- **Backend**: Laravel, Rails, or any server framework
- **Frontend**: Vue, React, or Svelte
- **Auth**: Server sessions, shares via middleware
- **Validation**: Server-side, errors passed to client

## Common Errors
| Error | Fix |
|-------|-----|
| `Page not found` | Check Inertia middleware, page component path |
| `Props undefined` | Check controller returns, middleware shares |
| `Form errors not showing` | Access `form.errors.field` |
| `No progress bar` | Configure NProgress in app setup |

## Prod Ready
- [ ] SSR configured for SEO
- [ ] Shared data minimized
- [ ] Code splitting per page
- [ ] Progress bar visible
- [ ] Form validation displays errors
- [ ] Flash messages handled
