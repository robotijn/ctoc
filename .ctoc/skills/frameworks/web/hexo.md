# Hexo CTO
> Node.js blog framework.

## Non-Negotiables
1. EJS/Pug templating
2. Proper tag plugins
3. Asset management
4. Theme development
5. Generator plugins

## Red Lines
- Hard-coded paths
- Missing helpers
- No asset pipeline
- Ignoring draft workflow

## Pattern
```yaml
# _config.yml
title: My Blog
url: https://example.com
theme: my-theme
permalink: :year/:month/:day/:title/
new_post_name: :year-:month-:day-:title.md
```
