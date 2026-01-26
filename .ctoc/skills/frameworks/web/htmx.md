# HTMX CTO
> HTML-driven interactivity - server renders HTML, hypermedia as the engine.

## Commands
```bash
# Setup | Dev | Test (with any backend)
# Add to HTML: <script src="https://unpkg.com/htmx.org@2"></script>
# Backend-specific dev server
# Test with any testing framework for your backend
```

## Non-Negotiables
1. Server renders HTML fragments - no JSON APIs for UI
2. Use hx-attributes declaratively, not imperatively
3. Progressive enhancement - base functionality without JS
4. HATEOAS principles - server controls navigation
5. Loading indicators with `hx-indicator`

## Red Lines
- JSON APIs when HTML fragments work
- Over-engineering simple interactions
- Client-side state management - server is the source of truth
- Missing loading states on slow operations
- Ignoring accessibility

## Pattern: CRUD with Partial Updates
```html
<!-- List with inline editing -->
<table id="users-table" hx-get="/users" hx-trigger="load" hx-swap="innerHTML">
  <tbody id="users-body"></tbody>
</table>

<!-- Server returns this partial -->
<tr id="user-1" hx-target="this" hx-swap="outerHTML">
  <td>john@example.com</td>
  <td>
    <button hx-get="/users/1/edit" hx-target="#user-1">Edit</button>
    <button hx-delete="/users/1"
            hx-confirm="Delete this user?"
            hx-target="closest tr"
            hx-swap="delete">Delete</button>
  </td>
</tr>

<!-- Edit form partial returned by /users/1/edit -->
<tr id="user-1">
  <td colspan="2">
    <form hx-put="/users/1" hx-target="#user-1" hx-swap="outerHTML">
      <input name="email" value="john@example.com" />
      <button type="submit">Save</button>
      <button hx-get="/users/1" hx-target="#user-1">Cancel</button>
    </form>
  </td>
</tr>

<!-- Add form with out-of-band swap -->
<form hx-post="/users" hx-target="#users-body" hx-swap="beforeend">
  <input name="email" placeholder="Email" required />
  <button type="submit">
    <span class="htmx-indicator">Adding...</span>
    <span>Add User</span>
  </button>
</form>
```

## Integrates With
- **Backend**: Any server that renders HTML (Django, Rails, Flask, Go, etc.)
- **Validation**: Server-side validation, return error HTML
- **Auth**: Session cookies, server manages state
- **Extensions**: `hx-boost`, `hx-push-url`, `htmx-ext-*`

## Common Patterns
| Pattern | Implementation |
|---------|----------------|
| Infinite scroll | `hx-get="/items?page=2" hx-trigger="revealed" hx-swap="afterend"` |
| Search debounce | `hx-trigger="keyup changed delay:300ms"` |
| Modal | `hx-target="#modal" hx-swap="innerHTML"` + show modal |
| Polling | `hx-trigger="every 5s"` |

## Common Errors
| Error | Fix |
|-------|-----|
| Content not updating | Check `hx-target` selector, inspect swap |
| CSRF token missing | Include token in form or `hx-headers` |
| Flash of unstyled content | Add `htmx.config.defaultSwapStyle = 'morph'` |
| Back button broken | Use `hx-push-url="true"` |

## Prod Ready
- [ ] Error responses return user-friendly HTML
- [ ] Loading indicators on all slow operations
- [ ] `hx-boost` for SPA-like navigation
- [ ] CSRF protection on all mutations
- [ ] Graceful fallback without JavaScript
- [ ] Request deduplication with `hx-sync`
