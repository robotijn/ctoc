# Backbone.js CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install backbone underscore
# Backbone 1.6.x - legacy MVC; maintenance mode only
```

## Claude's Common Mistakes
1. **Suggesting Backbone for new projects** — Recommend modern alternatives
2. **Missing `listenTo` cleanup** — Creates memory leaks
3. **Direct DOM manipulation in models** — Keep models data-only
4. **Global event pollution** — Use scoped events
5. **Zombie views** — Always call `remove()` properly

## Correct Patterns (2026)
```javascript
// View with proper cleanup
const UserView = Backbone.View.extend({
  tagName: 'div',
  className: 'user-view',

  events: {
    'click .save': 'onSave',
    'click .delete': 'onDelete'
  },

  initialize() {
    // Use listenTo (NOT on) for automatic cleanup
    this.listenTo(this.model, 'change', this.render);
    this.listenTo(this.model, 'destroy', this.remove);
  },

  render() {
    this.$el.html(this.template(this.model.toJSON()));
    return this;
  },

  onSave() {
    this.model.save(null, {
      success: () => this.trigger('saved'),
      error: (model, response) => this.trigger('error', response)
    });
  },

  // CRITICAL: Proper cleanup
  remove() {
    this.stopListening();  // Remove all listenTo bindings
    Backbone.View.prototype.remove.call(this);
  }
});

// Model - data only, no DOM
const User = Backbone.Model.extend({
  urlRoot: '/api/users',
  defaults: { name: '', email: '' },
  validate(attrs) {
    if (!attrs.email) return 'Email required';
  }
});
```

## Version Gotchas
- **Backbone 1.6.x**: Maintenance mode; no active development
- **Underscore**: Still required dependency
- **Migration**: Consider React, Vue, or Svelte for new projects

## What NOT to Do
- ❌ Backbone for new projects — Use modern frameworks
- ❌ `this.model.on('change', this.render)` — Use `listenTo`
- ❌ DOM manipulation in models — Keep models data-only
- ❌ Forgetting `remove()` — Causes memory leaks
- ❌ Global `Backbone.Events` abuse — Scope events to views

## Common Errors
| Error | Fix |
|-------|-----|
| Memory leak | Use `listenTo`, call `remove()` |
| Zombie views | Always cleanup in `remove()` |
| Event not firing | Check `listenTo` vs `on` binding |
| Model sync failed | Check `urlRoot` and server response |

## Migration Note
Backbone is in maintenance mode. For new projects:
- **React** — Component-based UI
- **Vue** — Progressive framework
- **Svelte** — Compiler-based approach
