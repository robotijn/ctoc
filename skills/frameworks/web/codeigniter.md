# CodeIgniter CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
composer create-project codeigniter4/appstarter myapp
cd myapp && php spark serve
# CodeIgniter 4.x - requires PHP 8.1+
```

## Claude's Common Mistakes
1. **Raw SQL queries** — Use Query Builder
2. **Missing validation** — Always validate with `$this->validate()`
3. **Business logic in views** — Keep views presentation-only
4. **Global helpers abuse** — Use dependency injection
5. **Skipping Model entities** — Use Entity classes for data

## Correct Patterns (2026)
```php
// app/Controllers/Users.php
namespace App\Controllers;

use App\Models\UserModel;
use CodeIgniter\HTTP\ResponseInterface;

class Users extends BaseController
{
    protected UserModel $userModel;

    public function __construct()
    {
        $this->userModel = new UserModel();
    }

    public function create(): ResponseInterface
    {
        $rules = [
            'email' => 'required|valid_email|is_unique[users.email]',
            'password' => 'required|min_length[8]'
        ];

        if (!$this->validate($rules)) {
            return $this->response
                ->setStatusCode(400)
                ->setJSON(['errors' => $this->validator->getErrors()]);
        }

        $id = $this->userModel->insert([
            'email' => $this->request->getPost('email'),
            'password' => password_hash($this->request->getPost('password'), PASSWORD_DEFAULT)
        ]);

        $user = $this->userModel->find($id);
        return $this->response
            ->setStatusCode(201)
            ->setJSON($user);
    }

    public function show(int $id): ResponseInterface
    {
        $user = $this->userModel->find($id);
        if (!$user) {
            return $this->response
                ->setStatusCode(404)
                ->setJSON(['error' => 'User not found']);
        }
        return $this->response->setJSON($user);
    }
}

// app/Models/UserModel.php
namespace App\Models;

use CodeIgniter\Model;

class UserModel extends Model
{
    protected $table = 'users';
    protected $primaryKey = 'id';
    protected $allowedFields = ['email', 'password'];
    protected $returnType = 'array';
    protected $useTimestamps = true;
}
```

## Version Gotchas
- **CodeIgniter 4.x**: PHP 8.1+ required; namespaced
- **Query Builder**: Use `$this->db->table()` or Model methods
- **Validation**: `$this->validate()` in controllers
- **Filters**: Middleware replacement via `app/Config/Filters.php`

## What NOT to Do
- ❌ Raw SQL strings — Use Query Builder
- ❌ Skipping validation — Security vulnerabilities
- ❌ Logic in views — Keep presentation-only
- ❌ `$_POST` directly — Use `$this->request->getPost()`
- ❌ Missing `allowedFields` — Mass assignment vulnerability

## Common Errors
| Error | Fix |
|-------|-----|
| `Class not found` | Check namespace and autoload |
| `Validation failed silently` | Check rule syntax |
| `Unable to insert` | Check `allowedFields` in Model |
| `CSRF token mismatch` | Include token in forms |
