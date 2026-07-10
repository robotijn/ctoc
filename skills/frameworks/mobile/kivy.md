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

## Threading & Main-Thread Footguns
Kivy's graphics + event loop run on the **main thread** only. Touching a widget, its `canvas`, or any
Kivy property from another thread is undefined behavior — it corrupts the OpenGL state and crashes.

- **Marshal UI work back to the main thread.** From a worker thread, either wrap the handler with the
  `@mainthread` decorator or schedule it with `Clock.schedule_once(callback, 0)`. Both defer execution
  into the Kivy event loop on the main thread. Never assign `widget.text`/`widget.pos` directly from a
  `threading.Thread`.
- **`Clock` scheduling** — `Clock.schedule_once(cb, dt)` runs once; `Clock.schedule_interval(cb, dt)`
  repeats until the callback returns `False` (or you `Clock.unschedule` it). A callback that returns a
  truthy value from `schedule_interval` keeps running — a common leak. Use `Clock` for animation/polling,
  not `time.sleep`, which blocks the whole UI.
- **`daemon=True` on worker threads** — a non-daemon thread blocks app exit; always set `daemon=True`
  (or join explicitly on stop).

```python
from kivy.clock import Clock

# BAD: worker thread mutates a widget directly -> GL corruption / crash
def worker(self):
    result = requests.get(url).json()
    self.ids.label.text = str(result)   # WRONG THREAD

# GOOD: schedule the UI update onto the main thread
from kivy.clock import mainthread
def worker(self):
    result = requests.get(url).json()
    @mainthread
    def apply():
        self.ids.label.text = str(result)
    apply()
    # equivalent: Clock.schedule_once(lambda dt: setattr(self.ids.label, 'text', str(result)))
```

## KV Language & Property Binding
- **KV language** (`.kv` files / `Builder`) declaratively binds widget properties; `on_press`,
  `text: root.value` etc. auto-bind to Kivy `Property` objects. Keep layout in KV, logic in Python — do
  not build large widget trees imperatively in a loop (it defeats KV's binding cache and is slower).
- **Bind to `Property` objects, not plain attributes** — only `NumericProperty`/`StringProperty`/
  `ObjectProperty` (etc.) fire `bind()` callbacks. A plain Python attribute will not trigger UI updates.

## Performance
- **Widget count is the cost driver** — every widget is an OpenGL-drawn object. Flatten deep layout
  nesting; use `RecycleView` for long/scrolling lists (it recycles a small pool of view widgets instead
  of instantiating thousands). Batch `canvas` instructions; avoid rebuilding the canvas each frame.

## Security — Untrusted KV / Input
- **Never `Builder.load_string`/`eval` untrusted KV or expressions.** KV supports Python expressions in
  bindings; loading KV text from a network/user source lets an attacker execute arbitrary Python
  (**CWE-94: Improper Control of Generation of Code / Code Injection**). Ship KV as static bundled
  assets; never construct it from user input. Likewise avoid `eval`/`exec` on any user-supplied string.

## Testing
- Use **pytest** with Kivy's headless providers: set `KIVY_WINDOW=mock` (or `os.environ['KIVY_NO_ARGS']`)
  so tests run without a real GL window in CI. Test Python logic and `Property` bindings directly; drive
  event-loop code by advancing `Clock` with `Clock.tick()` rather than sleeping. `kivy.tests` ships
  helpers (e.g. `GraphicUnitTest`) for widget-level tests.

## Version-specific (verified 2026-07-10)
- **Kivy 2.3.1** is the current PyPI release (published 2024-12-26); requires **Python 3.8+**. Install
  with `pip install "kivy[full]"`.
- **Buildozer 1.6.0** is the current Android packaging tool; its SDK/NDK and python-for-android recipe
  versions must match — pure-Python deps usually work, C-extension deps need a recipe in
  `buildozer.spec` `requirements`.
- **kivy-ios** requires macOS + Xcode command-line tools for iOS builds.
- With NumPy or other C-extension libs, add the matching recipe to `buildozer.spec` requirements or the
  build fails.

## References (retrieved 2026-07-10)
- Kivy 2.3.1 on PyPI (release date) — https://pypi.org/pypi/kivy/json
- Kivy documentation (Clock, `@mainthread`, KV language) — https://kivy.org/doc/stable/
- Kivy `@mainthread` / Clock reference — https://kivy.org/doc/stable/api-kivy.clock.html
- Buildozer 1.6.0 on PyPI — https://pypi.org/pypi/buildozer/json
- CWE-94: Improper Control of Generation of Code ('Code Injection') — https://cwe.mitre.org/data/definitions/94.html
