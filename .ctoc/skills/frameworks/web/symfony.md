# Symfony CTO
> Enterprise PHP framework - components, bundles, and full-stack for serious applications.

## Commands
```bash
# Setup | Dev | Test
composer create-project symfony/skeleton myapp && cd myapp
symfony server:start
php bin/phpunit
```

## Non-Negotiables
1. Dependency injection via autowiring
2. Doctrine ORM with repository pattern
3. Form component for validation
4. Security component for auth
5. Event system for decoupling

## Red Lines
- Service locator anti-pattern - use constructor injection
- Missing form/input validation
- Raw SQL without query builder
- Controllers as fat services
- Ignoring Symfony conventions

## Pattern: Controller with Validation
```php
// src/Controller/UserController.php
namespace App\Controller;

use App\Dto\CreateUserDto;
use App\Service\UserService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/users')]
class UserController extends AbstractController
{
    public function __construct(
        private readonly UserService $userService,
    ) {}

    #[Route('', methods: ['POST'])]
    public function create(
        #[MapRequestPayload] CreateUserDto $dto,
    ): JsonResponse {
        $user = $this->userService->create($dto);
        return $this->json($user, Response::HTTP_CREATED);
    }
}

// src/Dto/CreateUserDto.php
namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;

class CreateUserDto
{
    public function __construct(
        #[Assert\NotBlank]
        #[Assert\Email]
        public readonly string $email,

        #[Assert\NotBlank]
        #[Assert\Length(min: 8)]
        public readonly string $password,
    ) {}
}
```

## Integrates With
- **DB**: Doctrine ORM with migrations
- **Auth**: Security bundle with voters
- **Queue**: Messenger component
- **Cache**: Cache component with pools

## Common Errors
| Error | Fix |
|-------|-----|
| `Service not found` | Check autowiring, add service tag |
| `Validation failed` | Check DTO constraints |
| `Entity not persisted` | Call `$em->flush()` |
| `Route not found` | Clear cache: `php bin/console cache:clear` |

## Prod Ready
- [ ] `APP_ENV=prod` in production
- [ ] Cache warmed: `cache:warmup`
- [ ] Doctrine migrations applied
- [ ] Secrets managed with Vault
- [ ] Monolog configured for logs
- [ ] Health check endpoint
