# Kivy CTO
> Python mobile engineering leader demanding KV language separation and proper threading for responsive UIs.

## Commands
```bash
# Setup | Dev | Test
pip install kivy[full] buildozer
python main.py
buildozer android debug deploy run && pytest tests/
```

## Non-Negotiables
1. KV language for UI layout, Python for business logic
2. RecycleView for large lists with proper viewclass recycling
3. Clock.schedule_once for UI updates from background threads
4. Buildozer for Android, kivy-ios for iOS packaging
5. Profile with Kivy's built-in profiler before optimizing

## Red Lines
- Direct UI updates from background threads - causes crashes
- PIL/Pillow for images - use Kivy's Image and Texture classes
- Deep widget nesting - flatten layouts for performance
- Blocking main loop with synchronous operations
- Ignoring touch event propagation rules

## Pattern: Background Task with Safe UI Update
```python
from kivy.app import App
from kivy.clock import Clock
from kivy.uix.boxlayout import BoxLayout
from threading import Thread

class MainScreen(BoxLayout):
    def fetch_data(self):
        def background_task():
            # Blocking operation runs in thread
            result = api_client.get_data()
            # Schedule UI update on main thread
            Clock.schedule_once(lambda dt: self.on_data_loaded(result))

        Thread(target=background_task, daemon=True).start()

    def on_data_loaded(self, data):
        self.ids.data_label.text = str(data)

class MyApp(App):
    def build(self):
        return MainScreen()
```

## Integrates With
- **DB**: SQLite via sqlite3, Peewee for ORM
- **Auth**: Requests for API auth, keyring for secure storage
- **Cache**: shelve for Python objects, diskcache for performance

## Common Errors
| Error | Fix |
|-------|-----|
| `AttributeError: App has no attribute 'root'` | Ensure build() returns widget, check App lifecycle |
| `ValueError: texture already used` | Clone texture before modifying or use unique textures |
| `Buildozer: Recipe does not exist` | Add recipe to buildozer.spec requirements |

## Prod Ready
- [ ] Buildozer.spec configured with correct permissions
- [ ] Android keystore created for release signing
- [ ] iOS provisioning profile configured in kivy-ios
- [ ] App size optimized with selective package inclusion
