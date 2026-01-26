# Yii CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
composer create-project --prefer-dist yiisoft/yii2-app-basic myapp
cd myapp && php yii serve
# Yii 2.x - high-performance PHP framework
```

## Claude's Common Mistakes
1. **Skipping AR validation** — Always call `$model->validate()`
2. **Missing RBAC checks** — Use `Yii::$app->user->can()`
3. **Business logic in views** — Keep views presentation-only
4. **Direct DB queries without AR** — Use ActiveRecord
5. **Ignoring Gii code generator** — Generate CRUD scaffolding

## Correct Patterns (2026)
```php
// controllers/UserController.php
namespace app\controllers;

use yii\rest\ActiveController;
use yii\filters\auth\HttpBearerAuth;
use yii\filters\AccessControl;

class UserController extends ActiveController
{
    public $modelClass = 'app\models\User';

    public function behaviors()
    {
        $behaviors = parent::behaviors();

        // Auth
        $behaviors['authenticator'] = [
            'class' => HttpBearerAuth::class,
        ];

        // RBAC
        $behaviors['access'] = [
            'class' => AccessControl::class,
            'rules' => [
                [
                    'allow' => true,
                    'roles' => ['admin'],
                ],
            ],
        ];

        return $behaviors;
    }

    public function actionCreate()
    {
        $model = new User();

        if ($model->load(Yii::$app->request->getBodyParams(), '') && $model->validate()) {
            if ($model->save()) {
                Yii::$app->response->setStatusCode(201);
                return $model;
            }
        }

        Yii::$app->response->setStatusCode(422);
        return ['errors' => $model->errors];
    }
}

// models/User.php
namespace app\models;

use yii\db\ActiveRecord;
use yii\behaviors\TimestampBehavior;

class User extends ActiveRecord
{
    public static function tableName()
    {
        return 'users';
    }

    public function behaviors()
    {
        return [
            TimestampBehavior::class,
        ];
    }

    public function rules()
    {
        return [
            [['email', 'password'], 'required'],
            ['email', 'email'],
            ['email', 'unique'],
            ['password', 'string', 'min' => 8],
        ];
    }

    public function beforeSave($insert)
    {
        if (parent::beforeSave($insert)) {
            if ($this->isAttributeChanged('password')) {
                $this->password = Yii::$app->security->generatePasswordHash($this->password);
            }
            return true;
        }
        return false;
    }
}
```

## Version Gotchas
- **Yii 2.x**: PHP 7.4+ required; Yii 3 is complete rewrite
- **ActiveRecord**: Define `rules()` for validation
- **Behaviors**: Use `TimestampBehavior`, `BlameableBehavior`
- **Gii**: Use web interface at `/gii` for code generation

## What NOT to Do
- ❌ Skip validation — Always call `$model->validate()`
- ❌ Missing RBAC — Use `Yii::$app->user->can()`
- ❌ Logic in views — Keep views presentation-only
- ❌ Raw SQL — Use ActiveRecord query builder
- ❌ Manual CRUD — Use Gii for scaffolding

## Common Errors
| Error | Fix |
|-------|-----|
| `Validation failed silently` | Check `rules()` in model |
| `RBAC permission denied` | Check role assignments |
| `Model not saving` | Check `validate()` before `save()` |
| `Attribute not safe` | Add to `rules()` or `scenarios()` |
