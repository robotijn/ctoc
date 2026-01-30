# Inertia.js CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Laravel + Vue
composer require inertiajs/inertia-laravel
npm install @inertiajs/vue3
# Laravel + React
npm install @inertiajs/react
```

## Claude's Common Mistakes
1. **Building separate API endpoints** — Inertia replaces API; return page components
2. **Client-side routing** — Server handles routing; no Vue Router/React Router
3. **Missing shared data** — Auth, flash messages via middleware
4. **No progress indicator** — Users need navigation feedback
5. **Ignoring form helpers** — `useForm()` handles errors and state

## Correct Patterns (2026)
```php
// Laravel Controller
class UserController extends Controller
{
    public function index(Request $request)
    {
        return Inertia::render('Users/Index', [
            'users' => User::query()
                ->when($request->search, fn($q, $s) =>
                    $q->where('name', 'like', "%{$s}%")
                )
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

// HandleInertiaRequests Middleware (shared data)
public function share(Request $request): array
{
    return [
        'auth' => ['user' => $request->user()],
        'flash' => ['success' => session('success')],
    ];
}
```

```vue
<!-- Pages/Users/Index.vue -->
<script setup>
import { router, useForm } from '@inertiajs/vue3';

const props = defineProps(['users', 'filters']);

// Form helper handles state, errors, processing
const form = useForm({ email: '', password: '' });

function submit() {
  form.post('/users', {
    onSuccess: () => form.reset(),
  });
}

// Partial reload (preserves scroll, state)
function search(value) {
  router.get('/users', { search: value }, {
    preserveState: true,
    replace: true,
  });
}
</script>

<template>
  <input :value="filters.search" @input="search($event.target.value)" />

  <form @submit.prevent="submit">
    <input v-model="form.email" />
    <span v-if="form.errors.email">{{ form.errors.email }}</span>
    <input v-model="form.password" type="password" />
    <button :disabled="form.processing">Create</button>
  </form>

  <ul>
    <li v-for="user in users.data" :key="user.id">{{ user.email }}</li>
  </ul>
</template>
```

## Version Gotchas
- **Inertia 2.x**: Current; improved TypeScript, async rendering
- **Server routing**: All routes defined server-side
- **Shared data**: Passed via middleware to every page
- **Validation**: Server-side; errors returned to `form.errors`

## What NOT to Do
- ❌ `/api/users` endpoint for page data — Use `Inertia::render()`
- ❌ Vue Router / React Router — Server handles routing
- ❌ `axios.post()` for forms — Use `form.post()` helper
- ❌ Missing progress bar — Configure in app bootstrap
- ❌ Accessing `$page` without shared middleware — Data undefined

## SSR Setup
```bash
# Enable server-side rendering
npm install @inertiajs/vue3 @vue/server-renderer
php artisan inertia:start-ssr
```
