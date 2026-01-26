# Backbone.js CTO
> MVC structure for JavaScript apps.

## Non-Negotiables
1. Model/Collection separation
2. Event-driven communication
3. View lifecycle management
4. Router for navigation
5. Proper cleanup on remove

## Red Lines
- Direct DOM in models
- Missing listenTo cleanup
- Zombie views
- Global event pollution

## Note
Consider migration to modern frameworks for new projects. Backbone best for maintenance.

## Pattern
```javascript
const UserView = Backbone.View.extend({
  events: { 'click .save': 'save' },
  initialize() {
    this.listenTo(this.model, 'change', this.render);
  },
  remove() {
    this.stopListening();
    Backbone.View.prototype.remove.call(this);
  }
});
```
