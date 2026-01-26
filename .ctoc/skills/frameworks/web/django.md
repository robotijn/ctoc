# Django CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Django 6.0 (latest) - requires Python 3.12+
pip install Django==6.0.1
# Django 5.2 LTS (stable) - supports Python 3.10-3.14
pip install Django==5.2.10
# Create project:
django-admin startproject myproject
python manage.py runserver
```

## Claude's Common Mistakes
1. **Using deprecated Python/DB versions** — Django 5.2+ requires PostgreSQL 14+, MySQL 8.0+
2. **Raw SQL without parameterization** — Use ORM or parameterized queries to prevent injection
3. **Synchronous views for I/O-heavy ops** — Use async views for external API calls
4. **Missing CSRF protection** — Always use `{% csrf_token %}` in forms
5. **N+1 queries** — Use `select_related()` and `prefetch_related()`

## Correct Patterns (2026)
```python
# Async view for external API calls
from django.http import JsonResponse
import httpx

async def fetch_external(request):
    async with httpx.AsyncClient() as client:
        response = await client.get('https://api.example.com/data')
    return JsonResponse(response.json())

# Proper query optimization
# Bad: N+1 queries
for book in Book.objects.all():
    print(book.author.name)  # Query per book

# Good: Single query with join
for book in Book.objects.select_related('author'):
    print(book.author.name)

# Safe parameterized raw SQL when needed
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute("SELECT * FROM app_user WHERE id = %s", [user_id])

# Django 5.2+ form field groups
{{ form.fieldname.as_field_group }}
```

## Version Gotchas
- **5.1→5.2**: PostgreSQL 13 dropped, requires 14+
- **5.1→5.2**: MySQL defaults to `utf8mb4` charset
- **5.1→5.2**: `HttpRequest.accepted_types` now sorted by client preference
- **5.1 EOL**: December 31, 2025 — upgrade to 5.2 LTS
- **Security**: Update for CVE patches (SQL injection, DoS fixes)

## What NOT to Do
- ❌ `cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")` — SQL injection
- ❌ `DEBUG = True` in production — Exposes sensitive data
- ❌ Sync views calling external APIs — Use `async def` views
- ❌ `Book.objects.all()` then accessing relations — Use `select_related`
- ❌ Python 3.9 with Django 5.2 — Requires Python 3.10+

## Django 5.2 LTS Timeline
| Event | Date |
|-------|------|
| Django 5.2 LTS release | April 2025 |
| Django 4.2 LTS EOL | April 2026 |
| Django 5.2 security support | Until April 2028 |

## Production Checklist
```python
# settings.py
DEBUG = False
ALLOWED_HOSTS = ['yourdomain.com']
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True
```
