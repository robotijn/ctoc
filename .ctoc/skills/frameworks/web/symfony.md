# Symfony CTO
> Enterprise PHP framework.

## Non-Negotiables
1. Dependency injection
2. Doctrine ORM patterns
3. Form validation
4. Security component
5. Event system

## Red Lines
- Service locator anti-pattern
- Missing form validation
- Raw SQL without query builder
- Controllers as services abuse

## Pattern
```php
#[Route('/users', methods: ['POST'])]
public function create(
    Request $request,
    UserService $service,
    ValidatorInterface $validator
): JsonResponse {
    $user = $service->create($request->toArray());
    return $this->json($user, Response::HTTP_CREATED);
}
```
