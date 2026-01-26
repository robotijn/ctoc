# Zola CTO
> Fast Rust static site generator.

## Non-Negotiables
1. Tera templating
2. Section organization
3. Taxonomies
4. Shortcodes
5. Sass compilation

## Red Lines
- Logic in templates
- Missing _index.md files
- No page metadata
- Ignoring syntax highlighting config

## Pattern
```toml
# config.toml
base_url = "https://example.com"
title = "My Site"

[markdown]
highlight_code = true

[extra]
author = "Your Name"
```
