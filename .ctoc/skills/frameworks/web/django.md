# Django CTO
> Batteries included, used wisely.

## Non-Negotiables
1. select_related/prefetch_related always
2. Fat models or service layer, thin views
3. Custom user model from start
4. Split settings (base/dev/prod)

## Red Lines
- N+1 queries
- Business logic in views
- Missing indexes
- DEBUG=True in production
