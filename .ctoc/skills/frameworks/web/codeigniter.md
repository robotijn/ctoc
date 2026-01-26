# CodeIgniter CTO
> Lightweight PHP framework.

## Non-Negotiables
1. MVC architecture
2. Query Builder usage
3. Form validation
4. Model entities
5. Filters for middleware

## Red Lines
- Raw query strings
- Missing validation
- Logic in views
- Global helpers abuse

## Pattern
```php
class Users extends BaseController
{
    public function create()
    {
        $rules = ['name' => 'required|min_length[3]'];
        if (!$this->validate($rules)) {
            return $this->fail($this->validator->getErrors());
        }
        $user = $this->model->insert($this->request->getPost());
        return $this->respondCreated($user);
    }
}
```
