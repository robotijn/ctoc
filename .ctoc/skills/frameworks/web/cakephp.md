# CakePHP CTO
> Rapid PHP development framework.

## Non-Negotiables
1. Bake for scaffolding
2. ORM associations
3. Validation in tables
4. Component reuse
5. Proper authentication

## Red Lines
- Skipping bake conventions
- Missing table validations
- Logic in templates
- Raw SQL queries

## Pattern
```php
class UsersController extends AppController
{
    public function add()
    {
        $user = $this->Users->newEmptyEntity();
        if ($this->request->is('post')) {
            $user = $this->Users->patchEntity($user, $this->request->getData());
            if ($this->Users->save($user)) {
                return $this->response->withStatus(201);
            }
        }
    }
}
```
