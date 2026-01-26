# Laravel CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Laravel 12 (latest) or Laravel 11
composer create-project laravel/laravel myapp
# Requires PHP 8.2+
cd myapp && php artisan serve
# With starter kit:
composer create-project laravel/laravel myapp
cd myapp && php artisan breeze:install
```

## Claude's Common Mistakes
1. **Using seconds for rate limiting** — Laravel 11 changed to seconds from minutes
2. **Named arguments with Laravel methods** — Not covered by BC; can break on updates
3. **Forgetting package migrations** — Cashier, Passport, Sanctum require manual publish in Laravel 11
4. **Readonly properties in job classes** — PHP 8.2 readonly breaks Laravel job serialization
5. **N+1 queries** — Use `with()` for eager loading; check with Debugbar

## Correct Patterns (2026)
```php
// Laravel 11: Rate limiting with seconds (not minutes)
RateLimiter::for('api', function (Request $request) {
    return Limit::perSecond(1)->by($request->user()?->id);
});

// Action class pattern (instead of fat controllers)
// app/Actions/Users/CreateUserAction.php
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

// Proper eager loading
// Bad: N+1
$posts = Post::all();
foreach ($posts as $post) {
    echo $post->author->name;  // Query per post
}

// Good: Eager load
$posts = Post::with('author')->get();
```

## Version Gotchas
- **Laravel 10→11**: Rate limiter uses seconds, not minutes
- **Laravel 11**: Streamlined app structure (fewer default files)
- **Laravel 11**: Package migrations must be published manually
- **Laravel 11 EOL**: Bug fixes until Sept 2025, security until March 2026
- **Laravel 12**: Released Feb 2025; minimal breaking changes from 11

## What NOT to Do
- ❌ `Limit::perMinute(60)` for per-second limits — Use `perSecond(1)`
- ❌ `User::create(name: $name)` — Named args may break; use array
- ❌ `readonly` properties in Job classes — Breaks serialization
- ❌ `APP_DEBUG=true` in production — Exposes sensitive data
- ❌ Raw queries without bindings — SQL injection risk

## Laravel 11 Structure Changes
```
# New streamlined structure (fewer files)
app/
├── Http/
│   └── Controllers/
├── Models/
├── Providers/
│   └── AppServiceProvider.php  # Single provider by default
bootstrap/
├── app.php
├── providers.php  # Register providers here
```

## Production Checklist
```bash
php artisan config:cache
php artisan route:cache
php artisan view:cache
# Set in .env
APP_DEBUG=false
APP_ENV=production
```
