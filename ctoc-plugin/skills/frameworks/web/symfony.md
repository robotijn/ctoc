# Symfony CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
composer create-project symfony/skeleton myapp
cd myapp
symfony server:start
# Requires PHP 8.2+
```

## Claude's Common Mistakes
1. **Service locator pattern** — Use constructor injection, not `$container->get()`
2. **Fat controllers** — Delegate to services; controllers orchestrate only
3. **Raw SQL without query builder** — Use Doctrine ORM or DBAL
4. **Missing input validation** — Use DTO classes with constraints
5. **Ignoring autowiring** — Let Symfony inject dependencies automatically

## Correct Patterns (2026)
```php
// DTO with validation constraints
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

// Controller with automatic DTO mapping
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
    // Constructor injection (autowired)
    public function __construct(
        private readonly UserService $userService,
    ) {}

    #[Route('', methods: ['POST'])]
    public function create(
        #[MapRequestPayload] CreateUserDto $dto,  // Auto-validated
    ): JsonResponse {
        $user = $this->userService->create($dto);
        return $this->json($user, Response::HTTP_CREATED);
    }
}

// Service with Doctrine
// src/Service/UserService.php
class UserService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly UserPasswordHasherInterface $hasher,
    ) {}

    public function create(CreateUserDto $dto): User
    {
        $user = new User();
        $user->setEmail($dto->email);
        $user->setPassword($this->hasher->hashPassword($user, $dto->password));
        $this->em->persist($user);
        $this->em->flush();
        return $user;
    }
}
```

## Version Gotchas
- **Symfony 7.x**: Requires PHP 8.2+; uses attributes heavily
- **Doctrine ORM 3.x**: Stricter typing, no more proxy class issues
- **MapRequestPayload**: Auto-validates and deserializes request body
- **Autowiring**: Default; no need for manual service registration

## What NOT to Do
- ❌ `$container->get('service')` — Use constructor injection
- ❌ `$em->getRepository()->findBy()` in controller — Use service layer
- ❌ Raw `$_POST` or `$_GET` — Use Request object or DTOs
- ❌ Missing `#[Assert\*]` on DTOs — Validation won't run
- ❌ Manual service wiring — Let autowiring handle it

## Common Errors
| Error | Fix |
|-------|-----|
| `Service not found` | Check autowiring, add service tag |
| `Validation failed` | Check DTO constraint attributes |
| `Entity not persisted` | Call `$em->flush()` |
| `Route not found` | Clear cache: `bin/console cache:clear` |

## Production Checklist
```bash
APP_ENV=prod
bin/console cache:clear
bin/console cache:warmup
bin/console doctrine:migrations:migrate
```
