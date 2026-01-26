# Phalcon CTO
> C-extension PHP framework.

## Non-Negotiables
1. Volt templating
2. DI container
3. Model behaviors
4. PHQL for queries
5. Cache strategies

## Red Lines
- Raw PHP in Volt templates
- Skipping DI
- Missing model events
- Ignoring caching

## Pattern
```php
class UsersController extends Controller
{
    public function createAction()
    {
        $user = new Users();
        $user->assign($this->request->getJsonRawBody(true));
        if ($user->save()) {
            return $this->response->setJsonContent($user);
        }
        return $this->response->setStatusCode(422)
                              ->setJsonContent($user->getMessages());
    }
}
```
