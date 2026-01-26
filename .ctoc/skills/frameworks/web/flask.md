# Flask CTO
> Micro framework, macro discipline - add structure yourself, stay consistent.

## Commands
```bash
# Setup | Dev | Test
pip install flask flask-sqlalchemy flask-migrate python-dotenv
flask run --debug
pytest tests/ -v --cov=app
```

## Non-Negotiables
1. Application factory pattern with `create_app()`
2. Blueprints organize routes by feature domain
3. Configuration from environment variables, never hardcoded
4. SQLAlchemy models in separate module, not in routes
5. Error handlers return consistent JSON structure

## Red Lines
- Circular imports - use factory pattern and blueprints properly
- Business logic in route handlers - extract to services
- Hardcoded configuration values
- Missing CSRF protection on forms
- Raw SQL without parameterized queries

## Pattern: Application Factory
```python
# app/__init__.py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from config import Config

db = SQLAlchemy()
migrate = Migrate()

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)

    from app.api import bp as api_bp
    app.register_blueprint(api_bp, url_prefix='/api')

    from app.errors import register_error_handlers
    register_error_handlers(app)

    return app

# app/api/users.py
from flask import Blueprint, request, jsonify
from app.services.user_service import UserService
from app.schemas.user import CreateUserSchema

bp = Blueprint('users', __name__, url_prefix='/users')
user_service = UserService()

@bp.post('/')
def create_user():
    data = CreateUserSchema().load(request.json)
    user = user_service.create(data)
    return jsonify(user.to_dict()), 201
```

## Integrates With
- **DB**: SQLAlchemy with Flask-Migrate for migrations
- **Auth**: Flask-Login for sessions, Flask-JWT-Extended for APIs
- **Cache**: Flask-Caching with Redis backend
- **Validation**: Marshmallow or Pydantic for schemas

## Common Errors
| Error | Fix |
|-------|-----|
| `RuntimeError: Working outside of application context` | Use `with app.app_context():` or `current_app` |
| `ImportError: circular import` | Move imports inside functions or restructure |
| `BuildError: Could not build url` | Check blueprint registration and endpoint names |
| `sqlalchemy.exc.DetachedInstanceError` | Access relationships within session scope |

## Prod Ready
- [ ] Gunicorn with `--workers` = (2 * CPU) + 1
- [ ] WSGI middleware for request ID tracing
- [ ] Structured logging with `structlog`
- [ ] Health endpoint at `/health`
- [ ] Rate limiting with `flask-limiter`
- [ ] CORS configured for allowed origins only
