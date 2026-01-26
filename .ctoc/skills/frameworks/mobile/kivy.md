# Kivy CTO
> Python-powered cross-platform apps with custom UI

## Non-Negotiables
1. Use KV language for UI layout, Python for logic
2. Implement proper widget recycling with RecycleView for lists
3. Use Clock.schedule_once for UI updates from background threads
4. Build with Buildozer for Android, kivy-ios for iOS
5. Profile with Kivy's built-in tools before optimizing

## Red Lines
- Never update UI directly from a background thread
- Don't use PIL/Pillow for images; use Kivy's Image and Texture
- Avoid deep widget nesting; flatten layouts where possible
- Never block the main loop with synchronous operations
- Don't ignore touch event propagation rules

## Pattern
```python
# Proper background task with UI update
from kivy.clock import Clock
from threading import Thread

def fetch_data(self):
    def background():
        result = api.get_data()  # blocking call
        Clock.schedule_once(lambda dt: self.update_ui(result))
    Thread(target=background).start()
```
