# HTMX CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```html
<!-- CDN (simplest) -->
<script src="https://unpkg.com/htmx.org@2"></script>
<!-- Or npm -->
npm install htmx.org
```

## Claude's Common Mistakes
1. **Using external URLs** — Only use relative URLs; external responses can inject malicious scripts
2. **JSON APIs for UI** — HTMX expects HTML fragments, not JSON
3. **Client-side state management** — Server is source of truth; avoid Redux patterns
4. **Missing CSRF tokens** — Include in forms or `hx-headers` for all mutations
5. **Forgetting loading indicators** — Use `hx-indicator` for slow operations

## Correct Patterns (2026)
```html
<!-- Relative URLs only (security) -->
<button hx-get="/api/users" hx-target="#users-list">
  Load Users
</button>

<!-- CRUD with partials -->
<tr id="user-1" hx-target="this" hx-swap="outerHTML">
  <td>john@example.com</td>
  <td>
    <button hx-get="/users/1/edit">Edit</button>
    <button hx-delete="/users/1"
            hx-confirm="Delete this user?"
            hx-swap="delete">Delete</button>
  </td>
</tr>

<!-- Form with CSRF and loading indicator -->
<form hx-post="/users" hx-target="#users-body" hx-swap="beforeend">
  <input type="hidden" name="_csrf" value="{{ csrf_token }}">
  <input name="email" required>
  <button type="submit">
    <span class="htmx-indicator">Adding...</span>
    Add User
  </button>
</form>

<!-- Search with debounce -->
<input type="search"
       hx-get="/search"
       hx-trigger="keyup changed delay:300ms"
       hx-target="#results">
```

## Version Gotchas
- **HTMX 2.x**: Current stable; check extensions compatibility
- **Security**: Never fetch from external domains; XSS risk
- **CSP**: Configure Content Security Policy for HTMX
- **Real-time**: Use polling (`hx-trigger="every 5s"`) or SSE

## What NOT to Do
- ❌ `hx-get="https://external-api.com/data"` — XSS vulnerability
- ❌ JSON API endpoints for HTMX — Return HTML fragments
- ❌ Redux/client state for server data — Server is truth
- ❌ Forms without CSRF protection — Security risk
- ❌ Slow ops without `hx-indicator` — Bad UX

## Common Patterns
| Pattern | HTMX |
|---------|------|
| Infinite scroll | `hx-trigger="revealed" hx-swap="afterend"` |
| Search debounce | `hx-trigger="keyup changed delay:300ms"` |
| Modal | `hx-target="#modal" hx-swap="innerHTML"` |
| Polling | `hx-trigger="every 5s"` |
| History | `hx-push-url="true"` |

## Security Checklist
```html
<!-- Always include CSRF -->
<meta name="csrf-token" content="{{ csrf_token }}">
<script>
  htmx.config.headers = {
    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
  };
</script>

<!-- Whitelist allowed attributes/tags when escaping -->
<!-- Use layered security: validation + encoding + CSP -->
```

## When to Use HTMX
| Good Fit | Bad Fit |
|----------|---------|
| CRUD dashboards | Real-time collaboration |
| Content sites | Offline-first apps |
| Forms & tables | Heavy client interactivity |
| Internal tools | Complex state machines |
