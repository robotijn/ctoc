# Pelican CTO
> Python static site generator.

## Non-Negotiables
1. Jinja2 templating
2. Settings organization
3. Plugin system
4. Content metadata
5. Proper output structure

## Red Lines
- Logic in templates
- Missing pelicanconf.py settings
- No theme customization
- Ignoring cache

## Pattern
```python
# pelicanconf.py
AUTHOR = 'Your Name'
SITENAME = 'My Site'
PATH = 'content'
ARTICLE_PATHS = ['blog']
PAGE_PATHS = ['pages']
STATIC_PATHS = ['images']
```
