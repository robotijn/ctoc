# Kivy CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Use virtual environment
python -m venv venv && source venv/bin/activate
pip install kivy[full]
# For mobile builds
pip install buildozer  # Android
pip install kivy-ios   # iOS (macOS only)
```

## Claude's Common Mistakes
1. **Updates UI from background threads** - Must use `Clock.schedule_once`
2. **Uses PIL/Pillow directly** - Use Kivy's Image/Texture for compatibility
3. **Ignores Buildozer recipe requirements** - Pure Python libs may not work
4. **Deep widget nesting** - Causes severe performance issues
5. **Missing daemon=True on threads** - Blocks app exit

## Correct Patterns (2026)
```python
from kivy.app import App
from kivy.clock import Clock
from kivy.uix.boxlayout import BoxLayout
from threading import Thread

class MainScreen(BoxLayout):
    def fetch_data(self):
        def background_task():
            # Blocking operation in thread
            result = api_client.get_data()
            # CRITICAL: Schedule UI update on main thread
            Clock.schedule_once(lambda dt: self.on_data_loaded(result))

        Thread(target=background_task, daemon=True).start()

    def on_data_loaded(self, data):
        # Safe to update UI here
        self.ids.data_label.text = str(data)

# KV language for layout (keep Python for logic)
# main.kv
"""
MainScreen:
    orientation: 'vertical'
    Label:
        id: data_label
        text: 'Loading...'
    Button:
        text: 'Fetch'
        on_press: root.fetch_data()
"""

class MyApp(App):
    def build(self):
        return MainScreen()
```

## Version Gotchas
- **Kivy 2.3+**: Python 3.8+ required, some APIs changed
- **Buildozer**: Android SDK/NDK versions must match recipes
- **kivy-ios**: Requires macOS, Xcode command line tools
- **With NumPy**: Needs recipe in buildozer.spec requirements

## What NOT to Do
- Do NOT update widgets from background threads - causes crashes
- Do NOT use PIL directly - use Kivy's Image/AsyncImage
- Do NOT deep nest layouts - flatten for performance
- Do NOT forget `daemon=True` on threads - blocks app termination
- Do NOT ignore Buildozer recipe errors - add to spec requirements
