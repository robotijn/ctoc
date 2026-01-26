# Laravel CTO
> Elegant PHP framework - expressive syntax, robust tooling, ship confidently.

## Commands
```bash
# Setup | Dev | Test
composer create-project laravel/laravel myapp && cd myapp
php artisan serve
php artisan test --parallel --coverage
```

## Non-Negotiables
1. Eloquent relationships with eager loading (`with()`)
2. Form Requests for validation - never validate in controllers
3. Policies for authorization - gate every resource access
4. Queues for any operation over 200ms
5. Blade components for reusable UI

## Red Lines
- N+1 queries - use Laravel Debugbar to catch
- Business logic in controllers - use Actions or Services
- Missing validation on user input
- Raw queries without parameter binding
- Storing secrets in `.env` committed to git

## Pattern: Action Class
```php
// app/Actions/Users/CreateUserAction.php
namespace App\Actions\Users;

use App\Models\User;
use App\Notifications\WelcomeNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class CreateUserAction
{
    public function execute(array $data): User
    {
        return DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => Hash::make($data['password']),
            ]);

            $user->notify(new WelcomeNotification());

            return $user;
        });
    }
}

// In Controller
public function store(CreateUserRequest $request, CreateUserAction $action): JsonResponse
{
    $user = $action->execute($request->validated());
    return response()->json(new UserResource($user), 201);
}
```

## Integrates With
- **DB**: MySQL/PostgreSQL with Eloquent, use migrations and seeders
- **Auth**: Laravel Sanctum for SPA/API, Socialite for OAuth
- **Cache**: Redis with `Cache` facade, tagged caching for invalidation
- **Queue**: Redis or SQS with Laravel Horizon for monitoring

## Common Errors
| Error | Fix |
|-------|-----|
| `SQLSTATE[42S02]: Table not found` | Run `php artisan migrate` |
| `Class not found` | Run `composer dump-autoload` |
| `419 Page Expired` | Add `@csrf` to forms |
| `Target class does not exist` | Check namespace and service provider bindings |

## Prod Ready
- [ ] `APP_DEBUG=false` and `APP_ENV=production`
- [ ] `php artisan config:cache` and `route:cache`
- [ ] Horizon or queue workers supervised with systemd
- [ ] Database indexes on foreign keys and `where` columns
- [ ] Laravel Telescope disabled in production
- [ ] Error tracking with Sentry or Flare
