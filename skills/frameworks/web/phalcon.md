# Phalcon CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pecl install phalcon
composer create-project phalcon/devtools
vendor/bin/phalcon create-project myapp
# Phalcon 5.x - C-extension PHP framework
```

## Claude's Common Mistakes
1. **Skipping DI container** — All services need DI registration
2. **Raw PHP in Volt templates** — Use Volt syntax only
3. **Missing model events** — Use behaviors for lifecycle hooks
4. **Raw SQL queries** — Use PHQL or Query Builder
5. **No caching strategy** — Phalcon excels with caching

## Correct Patterns (2026)
```php
// app/controllers/UsersController.php
use Phalcon\Mvc\Controller;

class UsersController extends Controller
{
    public function createAction()
    {
        $data = $this->request->getJsonRawBody(true);

        $user = new Users();
        $user->assign($data, ['email', 'password']);  // Whitelist fields

        if (!$user->validation()) {
            return $this->response
                ->setStatusCode(422)
                ->setJsonContent(['errors' => $user->getMessages()]);
        }

        if ($user->save()) {
            return $this->response
                ->setStatusCode(201)
                ->setJsonContent($user->toArray());
        }

        return $this->response
            ->setStatusCode(500)
            ->setJsonContent(['error' => 'Failed to save']);
    }

    public function showAction($id)
    {
        $user = Users::findFirst([
            'conditions' => 'id = :id:',
            'bind' => ['id' => $id]
        ]);

        if (!$user) {
            return $this->response
                ->setStatusCode(404)
                ->setJsonContent(['error' => 'Not found']);
        }

        return $this->response->setJsonContent($user->toArray());
    }
}

// app/models/Users.php
use Phalcon\Mvc\Model;
use Phalcon\Filter\Validation;
use Phalcon\Filter\Validation\Validator\Email;
use Phalcon\Filter\Validation\Validator\StringLength;

class Users extends Model
{
    public function validation()
    {
        $validator = new Validation();
        $validator->add('email', new Email(['message' => 'Invalid email']));
        $validator->add('password', new StringLength(['min' => 8]));
        return $this->validate($validator);
    }

    public function beforeSave()
    {
        $this->password = $this->getDI()->get('security')->hash($this->password);
    }
}
```

## Version Gotchas
- **Phalcon 5.x**: PHP 8.0+ required; full PSR compliance
- **DI Container**: Register all services in `services.php`
- **PHQL**: Type-safe queries; use instead of raw SQL
- **Volt**: Template engine compiled to PHP; fast runtime

## What NOT to Do
- ❌ Skipping DI registration — Services fail to resolve
- ❌ Raw PHP in Volt — Use Volt syntax
- ❌ `assign()` without whitelist — Mass assignment vulnerability
- ❌ Raw SQL — Use PHQL for type safety
- ❌ No caching — Wastes Phalcon's performance advantage

## Common Errors
| Error | Fix |
|-------|-----|
| `Service not found` | Register in DI container |
| `Volt syntax error` | Check Volt templating syntax |
| `Model validation failed` | Check validation() rules |
| `PHQL error` | Check model relationships |
