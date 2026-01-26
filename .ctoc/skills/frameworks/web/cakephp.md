# CakePHP CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
composer create-project --prefer-dist cakephp/app myapp
cd myapp && bin/cake server
# CakePHP 5.x - requires PHP 8.1+
```

## Claude's Common Mistakes
1. **Skipping Bake scaffolding** — Use `bin/cake bake` for consistency
2. **Missing Table validations** — Always validate in Table classes
3. **Business logic in templates** — Keep templates presentation-only
4. **Raw SQL queries** — Use ORM query builder
5. **Ignoring associations** — Use `contain()` for eager loading

## Correct Patterns (2026)
```php
// src/Controller/UsersController.php
namespace App\Controller;

use Cake\Http\Response;

class UsersController extends AppController
{
    public function add(): ?Response
    {
        $user = $this->Users->newEmptyEntity();

        if ($this->request->is('post')) {
            $user = $this->Users->patchEntity(
                $user,
                $this->request->getData()
            );

            if ($this->Users->save($user)) {
                return $this->response
                    ->withStatus(201)
                    ->withType('application/json')
                    ->withStringBody(json_encode($user));
            }

            return $this->response
                ->withStatus(422)
                ->withType('application/json')
                ->withStringBody(json_encode(['errors' => $user->getErrors()]));
        }

        $this->set(compact('user'));
    }

    public function view(int $id): void
    {
        // Eager load associations with contain()
        $user = $this->Users->get($id, contain: ['Posts', 'Comments']);
        $this->set(compact('user'));
    }
}

// src/Model/Table/UsersTable.php
namespace App\Model\Table;

use Cake\ORM\Table;
use Cake\Validation\Validator;

class UsersTable extends Table
{
    public function validationDefault(Validator $validator): Validator
    {
        $validator
            ->email('email')
            ->requirePresence('email', 'create')
            ->notEmptyString('email')
            ->add('email', 'unique', ['rule' => 'validateUnique', 'provider' => 'table']);

        $validator
            ->scalar('password')
            ->minLength('password', 8)
            ->requirePresence('password', 'create');

        return $validator;
    }
}
```

## Version Gotchas
- **CakePHP 5.x**: PHP 8.1+ required; named arguments
- **Bake**: `bin/cake bake` for scaffolding
- **Associations**: Use `contain:` named argument in v5
- **Validation**: Define in Table classes, not controllers

## What NOT to Do
- ❌ Skipping Bake conventions — Inconsistent code
- ❌ Validation in controllers — Put in Table classes
- ❌ Raw SQL — Use query builder
- ❌ Logic in templates — Keep presentation-only
- ❌ Missing `contain()` — N+1 queries

## Common Errors
| Error | Fix |
|-------|-----|
| `Entity not modified` | Check `accessible` in Entity |
| `Validation failed` | Check `validationDefault()` rules |
| `Missing association` | Define in Table `initialize()` |
| `N+1 queries` | Add `contain: ['Relation']` |
