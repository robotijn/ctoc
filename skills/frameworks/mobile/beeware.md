# BeeWare CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Create virtual environment
python -m venv venv && source venv/bin/activate
# Install Briefcase (packaging tool)
pip install briefcase
# Create new project
briefcase new
# Run in dev mode
briefcase dev
```

## Claude's Common Mistakes
1. **Assumes all widgets available on all platforms** - Toga widgets vary by platform
2. **Uses CPython-only libraries** - Must check mobile compatibility
3. **Blocks event loop** - Heavy computation blocks UI
4. **Ignores Briefcase packaging** - Testing without packaging misses issues
5. **Uses asyncio incorrectly** - Must use `add_background_task` pattern

## Correct Patterns (2026)
```python
import toga
from toga.style import Pack
from toga.style.pack import COLUMN
import asyncio

class DataApp(toga.App):
    def startup(self):
        self.main_window = toga.MainWindow(title=self.formal_name)
        self.label = toga.Label('Loading...', style=Pack(padding=10))
        self.main_window.content = toga.Box(
            children=[self.label],
            style=Pack(direction=COLUMN)
        )
        self.main_window.show()
        # Use add_background_task for async operations
        self.add_background_task(self.load_data)

    async def load_data(self, widget):
        # Yield to event loop first
        await asyncio.sleep(0)
        try:
            data = await self.fetch_from_api()
            # Safe to update UI - we're on main thread
            self.label.text = f'Loaded: {data}'
        except Exception as e:
            self.label.text = f'Error: {e}'

    async def fetch_from_api(self):
        # Use httpx for async HTTP
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get('https://api.example.com/data')
            return response.json()
```

## Version Gotchas
- **Toga 0.4+**: Widget API changes, check migration guide
- **Briefcase 0.3.18+**: pyproject.toml format changes
- **iOS**: Requires macOS with Xcode command line tools
- **Android**: Requires Java 17+ for Gradle builds

## What NOT to Do
- Do NOT assume widget availability - check Toga platform support
- Do NOT use requests library - use httpx for async HTTP
- Do NOT block main thread - use `add_background_task`
- Do NOT test only with `briefcase dev` - test packaged builds
- Do NOT use libraries with C extensions without checking mobile support

## Packaging Footguns (Briefcase)
BeeWare's **Briefcase** wraps your app into a native installer per platform, and each backend has its
own gotchas. The commands run in sequence: `create` → `build` → `run` → `package`, plus `update` to
re-sync your code into an existing scaffold.

- **`briefcase dev` is NOT a packaged build.** It runs your code against the host CPython and skips
  packaging, code-signing, and platform bundling entirely — so a dependency that fails to bundle, a
  missing platform recipe, or a signing problem will pass `dev` and fail `run`/`package`. Always test
  `briefcase run <platform>` and `briefcase package` before shipping.
- **Per-platform packaging differs** — iOS needs macOS + Xcode; Android needs the Android SDK and
  **Java 17+** for Gradle; each has distinct signing (Apple provisioning profiles vs. Android keystore).
  After changing dependencies you often need `briefcase update -r` (or `create` fresh) so the new
  requirements are re-bundled — Briefcase does not auto-pick-up new `pyproject.toml` requirements on a
  plain `run`.
- **Python-runtime bundling size** — Briefcase ships a full Python runtime + your deps inside the app;
  binary/C-extension wheels must exist for the target (iOS/Android) or the build fails. Pure-Python and
  packages with published mobile wheels bundle cleanly; heavy scientific stacks may not.

```toml
# BAD assumption: this "works" because `briefcase dev` runs fine on the desktop CPython
# but `numpy` (C-extension) may lack an iOS/Android wheel -> `briefcase package` fails.
requires = ["numpy"]

# GOOD: after editing requires, re-sync into the scaffold, then test the PACKAGED build
#   briefcase update -r        # re-bundle new requirements
#   briefcase run iOS          # not `dev` — exercises the real bundle
#   briefcase package android  # produce + sign the artifact
```

## Toga — Native-Widget Parity & Main-Thread UI
- **Toga widgets map to native controls, so parity is not guaranteed across platforms.** A widget or a
  style option available on desktop may be missing or behave differently on iOS/Android. Check the Toga
  supported-widgets matrix per platform before relying on one; degrade gracefully with a feature check.
- **UI mutations must happen on the main/event-loop thread.** Toga runs an `asyncio` event loop on the
  main thread; do heavy work in a coroutine and never touch widgets from a raw `threading.Thread`.

## Correctness — async Event Loop
- **Do not block the event loop.** A synchronous long-running call freezes the UI. Use
  `App.add_background_task(coro)` (or an `async def` handler) and `await` I/O with async libraries
  (`httpx`, not `requests`). Yield with `await asyncio.sleep(0)` in long loops so the UI stays
  responsive.

```python
# BAD: blocks the asyncio event loop -> frozen UI
def on_press(self, widget):
    data = requests.get(url).json()   # synchronous, blocks main loop
    self.label.text = str(data)

# GOOD: async handler off the event loop, non-blocking I/O
async def on_press(self, widget):
    import httpx
    async with httpx.AsyncClient() as client:
        r = await client.get(url)
    self.label.text = str(r.json())   # safe: back on the main thread
```

## Performance — Bundle Size & Startup
- **App size and cold-start are dominated by the bundled Python runtime + dependencies.** Every extra
  dependency inflates the installer and slows first launch (the runtime unpacks on start). Trim
  `requires` to what you actually import, prefer pure-Python or slim wheels, and lazy-import heavy modules
  inside the function that needs them rather than at module top level so startup stays fast.
- Keep per-frame/UI work off the event loop (see async section) — a blocked loop reads to the user as
  jank even when the app is small.

## Security — Bundled-Dependency Provenance
- **Every dependency you list is bundled into the shipped app**, so its provenance is your supply chain
  (**CWE-1357: Reliance on Insufficiently Trustworthy Component**; **CWE-829: Inclusion of Functionality
  from Untrusted Control Sphere**). Pin versions, prefer wheels from trusted indexes, and audit
  transitive deps — a compromised transitive package ships to every user's device. Do not bundle
  credentials or private keys inside the app; extract secrets at runtime from a backend.

## Testing
- Test app logic with **pytest** against the Toga **dummy backend** (`toga_dummy`), which records widget
  interactions without a real GUI — CI-friendly and fast. Drive async handlers with
  `pytest.mark.asyncio` / `asyncio.run`. Keep business logic separate from Toga widgets so it is unit
  testable without a backend, then smoke-test the packaged build with `briefcase run`.

## Version-specific (verified 2026-07-10)
- **Toga 0.5.6** and **Briefcase 0.4.4** are the current PyPI releases (both published 2026-07-08).
- **Toga 0.4+ → 0.5.x**: widget/style API evolved across the 0.4→0.5 line — check the migration notes
  when upgrading; APIs are still pre-1.0 and can change between minors.
- **Briefcase 0.4.x** uses the `pyproject.toml` `[tool.briefcase]` config format; re-run
  `briefcase create`/`update` after upgrading Briefcase.
- **iOS**: macOS + Xcode command-line tools required. **Android**: **Java 17+** for Gradle builds.

## References (retrieved 2026-07-10)
- Toga 0.5.6 on PyPI (release date) — https://pypi.org/pypi/toga/json
- Briefcase 0.4.4 on PyPI (release date) — https://pypi.org/pypi/briefcase/json
- Briefcase documentation (create/build/run/package, per-platform) — https://briefcase.readthedocs.io/en/stable/
- Toga documentation (supported widgets by platform, dummy backend) — https://toga.readthedocs.io/en/stable/
- CWE-1357: Reliance on Insufficiently Trustworthy Component — https://cwe.mitre.org/data/definitions/1357.html
- CWE-829: Inclusion of Functionality from Untrusted Control Sphere — https://cwe.mitre.org/data/definitions/829.html
