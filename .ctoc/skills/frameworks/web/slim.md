# Slim CTO
> Micro PHP framework for APIs - PSR-7/15 compliant, middleware-focused.

## Commands
```bash
# Setup | Dev | Test
composer require slim/slim slim/psr7
php -S localhost:8080 -t public
./vendor/bin/phpunit
```

## Non-Negotiables
1. PSR-7 request/response handling
2. Middleware pipeline for cross-cutting
3. Dependency container for services
4. Route groups for organization
5. Proper error handling middleware

## Red Lines
- Echo statements in routes - use Response
- Missing middleware for auth/logging
- Global state instead of container
- No container usage for dependencies
- Skipping input validation

## Pattern: Structured API
```php
<?php
// public/index.php
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;
use DI\Container;

require __DIR__ . '/../vendor/autoload.php';

$container = new Container();
$container->set(UserService::class, fn() => new UserService());

AppFactory::setContainer($container);
$app = AppFactory::create();

// Middleware
$app->addBodyParsingMiddleware();
$app->addRoutingMiddleware();
$app->addErrorMiddleware(true, true, true);

// Routes
$app->group('/api', function ($group) {
    $group->post('/users', function (Request $request, Response $response) {
        $data = $request->getParsedBody();

        if (empty($data['email'])) {
            $response->getBody()->write(json_encode(['error' => 'Email required']));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }

        $userService = $this->get(UserService::class);
        $user = $userService->create($data);

        $response->getBody()->write(json_encode($user));
        return $response->withStatus(201)->withHeader('Content-Type', 'application/json');
    });

    $group->get('/users/{id}', function (Request $request, Response $response, array $args) {
        $userService = $this->get(UserService::class);
        $user = $userService->find($args['id']);

        if (!$user) {
            $response->getBody()->write(json_encode(['error' => 'Not found']));
            return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
        }

        $response->getBody()->write(json_encode($user));
        return $response->withHeader('Content-Type', 'application/json');
    });
});

$app->run();
```

## Integrates With
- **DB**: Eloquent, Doctrine, or PDO
- **DI**: PHP-DI or Pimple
- **Validation**: Respect/Validation or custom
- **Auth**: JWT middleware or sessions

## Common Errors
| Error | Fix |
|-------|-----|
| `Route not found` | Check route registration order |
| `Container entry not found` | Register in container first |
| `Headers already sent` | Don't echo before response |
| `Body not parsed` | Add `addBodyParsingMiddleware()` |

## Prod Ready
- [ ] Error middleware configured
- [ ] CORS middleware added
- [ ] Container for all dependencies
- [ ] Validation on all inputs
- [ ] Logging middleware
- [ ] Health check endpoint
