# Django CTO
> Batteries included Python framework - use the conventions, ship faster.

## Commands
```bash
# Setup | Dev | Test
pip install django djangorestframework django-environ
python manage.py runserver
pytest --ds=config.settings.test --reuse-db -v
```

## Non-Negotiables
1. `select_related`/`prefetch_related` on every queryset with relations
2. Custom User model from project start - never change later
3. Fat models or service layer, thin views - no logic in views
4. Split settings: `base.py`, `local.py`, `production.py`
5. Form/Serializer validation before any save operation

## Red Lines
- N+1 queries - use Django Debug Toolbar to catch them
- Business logic in views or serializers
- Missing database indexes on filtered/ordered fields
- `DEBUG=True` anywhere near production
- Raw SQL without parameterized queries

## Pattern: Service Layer
```python
# services/user_service.py
from django.db import transaction
from django.core.exceptions import ValidationError
from apps.users.models import User
from apps.notifications.tasks import send_welcome_email

class UserService:
    @staticmethod
    @transaction.atomic
    def create_user(email: str, password: str, **kwargs) -> User:
        if User.objects.filter(email=email).exists():
            raise ValidationError("Email already registered")

        user = User.objects.create_user(email=email, password=password, **kwargs)
        send_welcome_email.delay(user.id)
        return user
```

## Integrates With
- **DB**: PostgreSQL with `django-postgres-extra` for advanced features
- **Auth**: `django-allauth` for social, `djangorestframework-simplejwt` for API
- **Cache**: Redis with `django-redis`, cache querysets aggressively
- **Tasks**: Celery with Redis broker, `django-celery-beat` for scheduling

## Common Errors
| Error | Fix |
|-------|-----|
| `OperationalError: no such table` | Run `python manage.py migrate` |
| `ImproperlyConfigured: SECRET_KEY` | Set `DJANGO_SECRET_KEY` env var |
| `RelatedObjectDoesNotExist` | Check ForeignKey exists before access |
| `TransactionManagementError` | Don't mix `atomic()` with manual commits |

## Prod Ready
- [ ] `ALLOWED_HOSTS` explicitly set
- [ ] Static files served via WhiteNoise or CDN
- [ ] Database connection pooling with `pgbouncer`
- [ ] Sentry for error tracking
- [ ] Gunicorn with `--workers` = (2 * CPU) + 1
- [ ] Health check endpoint for load balancer
