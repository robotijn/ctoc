# Yii CTO
> High-performance PHP framework.

## Non-Negotiables
1. Active Record patterns
2. Gii code generation
3. Behaviors for reuse
4. RBAC authorization
5. Widget architecture

## Red Lines
- Skipping AR validation
- Missing RBAC checks
- Logic in views
- Direct DB queries without AR

## Pattern
```php
class UserController extends Controller
{
    public function actionCreate()
    {
        $model = new User();
        if ($model->load(Yii::$app->request->post()) && $model->save()) {
            return $this->asJson($model);
        }
        return $this->asJson($model->errors, 422);
    }
}
```
