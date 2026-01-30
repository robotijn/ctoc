# Flask CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install flask
# Flask 3.1.x - requires Python 3.9+
# With common extensions:
pip install flask-sqlalchemy flask-migrate python-dotenv
flask run --debug
```

## Claude's Common Mistakes
1. **Debug mode in production** — Never `FLASK_DEBUG=1` or `app.run(debug=True)` in prod
2. **Business logic in routes** — Extract to service layer; routes only orchestrate
3. **Missing CSRF protection** — Use Flask-WTF for forms with `{{ form.csrf_token }}`
4. **Raw SQL without parameterization** — Use SQLAlchemy ORM or parameterized queries
5. **Circular imports** — Use application factory pattern with blueprints

## Correct Patterns (2026)
```python
# Application factory pattern (prevents circular imports)
# app/__init__.py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def create_app(config_class='config.Config'):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)

    from app.routes import users_bp
    app.register_blueprint(users_bp, url_prefix='/api/users')

    return app

# Service layer (not in routes)
# app/services/user_service.py
class UserService:
    @staticmethod
    def create_user(data: dict) -> User:
        user = User(**data)
        db.session.add(user)
        db.session.commit()
        return user

# Routes call services
@bp.post('/')
def create_user():
    data = request.get_json()
    # Validate with Marshmallow or Pydantic
    user = UserService.create_user(data)
    return jsonify(user.to_dict()), 201
```

## Version Gotchas
- **Flask 2.x→3.x**: `before_first_request` removed; use app context setup
- **Flask 3.0+**: Requires Python 3.8+, but 3.9+ recommended
- **With SQLAlchemy 2.0**: Use `db.session.execute(select(...))` not legacy query
- **Werkzeug 3.x**: Some internal APIs changed

## What NOT to Do
- ❌ `app.run(debug=True)` in production — Security vulnerability
- ❌ `@app.route` with business logic — Use service layer
- ❌ `cursor.execute(f"SELECT * WHERE id={id}")` — SQL injection
- ❌ Imports at module level causing circular deps — Use factory pattern
- ❌ Flask's dev server in production — Use Gunicorn/uWSGI

## Production Deployment
```bash
# Production with Gunicorn (workers = 2 * CPU + 1)
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 "app:create_app()"
```

## Security Checklist
```python
# Secure configuration
app.config['SECRET_KEY'] = os.environ['SECRET_KEY']
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
```
