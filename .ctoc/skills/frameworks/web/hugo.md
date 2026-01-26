# Hugo CTO
> Fastest static site generator.

## Non-Negotiables
1. Content organization
2. Proper templating (Go templates)
3. Taxonomy usage
4. Shortcodes for reuse
5. Asset pipeline

## Red Lines
- Logic in templates
- Missing archetypes
- No partials for reuse
- Ignoring page bundles

## Pattern
```go-html-template
{{ define "main" }}
<article>
  <h1>{{ .Title }}</h1>
  {{ .Content }}
  {{ range .Pages }}
    <a href="{{ .Permalink }}">{{ .Title }}</a>
  {{ end }}
</article>
{{ end }}
```
