# Slim CTO
> Micro PHP framework for APIs.

## Non-Negotiables
1. PSR-7 request/response
2. Middleware pipeline
3. Dependency container
4. Route groups
5. Proper error handling

## Red Lines
- Echo statements in routes
- Missing middleware
- Global state
- No container usage

## Pattern
```php
$app->post('/users', function (Request $request, Response $response) {
    $data = $request->getParsedBody();
    $user = $this->get(UserService::class)->create($data);
    $response->getBody()->write(json_encode($user));
    return $response->withStatus(201)
                    ->withHeader('Content-Type', 'application/json');
});
```
