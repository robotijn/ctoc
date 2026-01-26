# Slim CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
composer require slim/slim slim/psr7 php-di/php-di
php -S localhost:8080 -t public
# Slim 4.x - PSR-7/15 PHP micro-framework
```

## Claude's Common Mistakes
1. **Echo instead of Response** — Always return PSR-7 Response
2. **Missing body parsing middleware** — Add `addBodyParsingMiddleware()`
3. **No DI container** — Use PHP-DI for service management
4. **Skipping route groups** — Organize routes with groups
5. **No error middleware** — Add `addErrorMiddleware()`

## Correct Patterns (2026)
```php
<?php
// public/index.php
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;
use DI\Container;

require __DIR__ . '/../vendor/autoload.php';

// DI Container
$container = new Container();
$container->set(UserService::class, fn() => new UserService());

AppFactory::setContainer($container);
$app = AppFactory::create();

// Middleware (ORDER MATTERS)
$app->addBodyParsingMiddleware();  // REQUIRED for JSON
$app->addRoutingMiddleware();
$app->addErrorMiddleware(true, true, true);

// Routes with groups
$app->group('/api', function ($group) {
    $group->post('/users', function (Request $request, Response $response) {
        $data = $request->getParsedBody();

        if (empty($data['email'])) {
            $response->getBody()->write(json_encode(['error' => 'Email required']));
            return $response->withStatus(400)
                            ->withHeader('Content-Type', 'application/json');
        }

        $userService = $this->get(UserService::class);
        $user = $userService->create($data);

        $response->getBody()->write(json_encode($user));
        return $response->withStatus(201)
                        ->withHeader('Content-Type', 'application/json');
    });

    $group->get('/users/{id}', function (Request $request, Response $response, array $args) {
        $userService = $this->get(UserService::class);
        $user = $userService->find($args['id']);

        if (!$user) {
            $response->getBody()->write(json_encode(['error' => 'Not found']));
            return $response->withStatus(404)
                            ->withHeader('Content-Type', 'application/json');
        }

        $response->getBody()->write(json_encode($user));
        return $response->withHeader('Content-Type', 'application/json');
    });
});

$app->run();
```

## Version Gotchas
- **Slim 4.x**: PHP 8.0+ required; PSR-7/15 compliant
- **Body parsing**: `addBodyParsingMiddleware()` for JSON
- **Container**: Use PHP-DI; register before `AppFactory::create()`
- **Response**: Always return Response; never echo

## What NOT to Do
- ❌ `echo` in routes — Write to `$response->getBody()`
- ❌ Missing `addBodyParsingMiddleware()` — JSON not parsed
- ❌ Global state — Use DI container
- ❌ Flat routes — Use `$app->group()` for organization
- ❌ Missing error middleware — Silent failures

## Common Errors
| Error | Fix |
|-------|-----|
| `Route not found` | Check route registration order |
| `Container entry not found` | Register in container first |
| `Headers already sent` | Don't echo before response |
| `Body not parsed` | Add `addBodyParsingMiddleware()` |
