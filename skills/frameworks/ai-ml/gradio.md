# Gradio CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install gradio
# Run: python app.py
# Share publicly: gradio app.py --share
```

## Claude's Common Mistakes
1. Missing `queue()` for concurrent requests (blocks users)
2. No examples provided for user guidance
3. Using `Interface` when `Blocks` needed for complex UIs
4. Missing error handling with `gr.Error`
5. Not using streaming for LLM outputs

## Correct Patterns (2026)
```python
import gradio as gr
from typing import Generator

# Simple Interface with examples
def classify(image):
    if image is None:
        raise gr.Error("Please upload an image")
    return model.predict(image)

demo = gr.Interface(
    fn=classify,
    inputs=gr.Image(type="pil", label="Upload Image"),
    outputs=gr.Label(num_top_classes=5),
    examples=["examples/cat.jpg", "examples/dog.jpg"],  # Always provide examples
    title="Image Classifier",
)

# Complex Blocks with streaming
with gr.Blocks(theme=gr.themes.Soft()) as demo:
    gr.Markdown("# AI Assistant")

    with gr.Row():
        with gr.Column(scale=2):
            input_text = gr.Textbox(label="Input", lines=5)
            submit = gr.Button("Submit", variant="primary")
        with gr.Column(scale=3):
            output = gr.Textbox(label="Output", lines=10)

    # Streaming generator
    def generate(text: str) -> Generator[str, None, None]:
        response = ""
        for chunk in model.stream(text):
            response += chunk
            yield response  # Yield accumulated response

    submit.click(generate, inputs=input_text, outputs=output)

# ALWAYS enable queue for production
demo.queue(max_size=20).launch(server_name="0.0.0.0", server_port=7860)
```

## Version Gotchas
- **queue()**: Required for concurrent users - without it, requests block
- **Streaming**: Yield accumulated text, not just chunks
- **HuggingFace Spaces**: Deploy with `demo.launch()` in app.py
- **Auth**: Use `demo.launch(auth=("user", "pass"))` for basic auth

## What NOT to Do
- Do NOT skip `demo.queue()` in production
- Do NOT forget examples for inputs
- Do NOT use `Interface` for multi-step workflows
- Do NOT yield just chunks - yield accumulated response
- Do NOT skip error handling with `gr.Error`

## Component & Concurrency Footguns
The single most common Gradio bug Claude ships is **module-level mutable state**
shared across every visitor. A Gradio app runs one process serving many browser
sessions concurrently; a global list/dict is one object for ALL of them.

```python
import gradio as gr

# FOOTGUN: `history` is ONE global — user B sees user A's messages, and two
# requests mutating it concurrently race. Per-user state MUST live in gr.State.
history = []                       # WRONG: leaks across sessions

with gr.Blocks() as demo:
    # RIGHT: gr.State is instantiated per browser session, isolated + concurrency-safe.
    chat = gr.State([])            # each session gets its own list
    box = gr.Textbox()
    out = gr.Chatbot(type="messages")

    def respond(msg, hist):        # hist is THIS session's list, passed in/out
        hist = hist + [{"role": "user", "content": msg}]
        hist = hist + [{"role": "assistant", "content": model(msg)}]
        return hist, hist          # return updates BOTH the Chatbot and gr.State

    box.submit(respond, [box, chat], [out, chat])
```

- **`gr.State` is per-session, not global.** Anything a user should not see from
  another session (uploaded data, chat history, keys) belongs in `gr.State`, never
  a module global.
- **The queue is a bottleneck, not free parallelism.** `demo.queue()` serializes
  requests; a blocking function (a long `requests.get`, a sync model call) freezes
  the whole queue for every waiting user. Bound it explicitly and mark cheap
  event handlers so they bypass the queue:

```python
# concurrency_limit caps simultaneous executions of THIS fn; default_concurrency_limit
# sets the app-wide default. A slow fn with concurrency_limit=1 starves everyone else.
demo.queue(default_concurrency_limit=4, max_size=64)

# I/O-bound handlers: use `async def` so the event loop is not blocked while waiting.
async def fetch(url):              # await releases the loop for other requests
    return await async_client.get(url)

# Trivial UI updates should skip the queue entirely (queue=False) so they stay snappy.
btn.click(toggle_theme, inputs=None, outputs=theme, queue=False)
```
- **`gr.File` / `gr.UploadButton` write to a temp dir you must clean up.** Uploads
  land on disk (`GRADIO_TEMP_DIR`); an unbounded app fills the volume. Validate
  size/type in the handler — never trust the client-declared filename.
- Source: gradio.app queue + state docs. See References.

## Execution Model
Gradio serves from a single ASGI process behind the queue. Any **synchronous
blocking call inside an event handler blocks that worker** — CPU-bound work should
run in a thread/process pool or an external worker, and I/O-bound work should be
`async def` + `await`. Streaming outputs (generators / `yield`) release control
between chunks; a plain blocking function holds the slot until it returns.

## Error Handling Idioms
```python
import gradio as gr

# FOOTGUN: raising a bare Exception leaks the traceback (and file paths) into the
# UI when show_error=True, or silently 500s otherwise. Use gr.Error for a clean,
# user-facing message and gr.Warning/gr.Info for non-fatal notices.
def classify(image):
    if image is None:
        raise gr.Error("Please upload an image first.")   # shown to the user, no stack
    try:
        return model.predict(image)
    except ModelUnavailable:
        raise gr.Error("Model is warming up — retry in a few seconds.")

# A generator handler that raises mid-stream leaves the UI half-updated; yield a
# terminal error state instead of letting the exception escape the queue.
def stream(text):
    try:
        acc = ""
        for chunk in model.stream(text):
            acc += chunk
            yield acc
    except Exception:                       # log server-side, surface a clean line
        yield acc + "\n\n[generation failed — please retry]"
```
- Launch with `show_error=True` only in dev; in prod it exposes tracebacks. Log the
  real exception server-side and return a `gr.Error` string to the user.

## Security Gotchas
- **`share=True` opens a public tunnel to your machine (CWE-668, exposure of
  resource to wrong sphere).** `demo.launch(share=True)` publishes a
  `*.gradio.live` URL routing the open internet to a dev box that has NO auth by
  default. Never leave it on in anything but a throwaway demo; combine with
  `auth=` and treat the URL as a secret. HuggingFace Spaces and any prod deploy
  should serve behind a real reverse proxy, not the share tunnel.
- **Path traversal via the file routes (CWE-22).** Gradio serves files back to the
  browser, and multiple real advisories show the allowlist being bypassed so an
  attacker reads arbitrary files off the host:
  - **CVE-2023-51449** — the `/file` route was traversable in versions **prior to
    4.11.0**, allowing arbitrary file read on the host. [nvd.nist.gov, published
    2023-12-22]
  - **CVE-2024-47164** — the `is_in_or_equal` directory-traversal check could be
    bypassed with crafted payloads. [nvd.nist.gov, published 2024-10-10]
  - **CVE-2024-1728** — local file inclusion via the `UploadButton` component from
    improper validation of user-supplied input. [nvd.nist.gov, published 2024-04-10]

```python
# SAFE: run a current release and constrain file access explicitly.
demo.launch(
    allowed_paths=["/srv/app/assets"],   # ONLY these dirs are servable
    blocked_paths=["/srv/app/secrets"],  # explicit denies on top
    auth=("user", os.environ["GRADIO_PW"]),  # never hardcode
    share=False,                         # no public tunnel in prod
)
# Never build a servable path from raw user input:
#   open(user_supplied_name)             # WRONG — traversal (../../etc/passwd)
safe = os.path.join(ROOT, os.path.basename(user_supplied_name))  # strip the path
```
- Keep Gradio patched: these CWE-22 classes are fixed in newer releases — pin a
  current version and read the release security notes. CWE-22 authority:
  https://cwe.mitre.org/data/definitions/22.html
- Do NOT pass secrets through the URL or component defaults; read them from the
  environment. Do NOT run with `debug=True` + `share=True` in production.

## Testing Conventions
```python
# Gradio ships a test client that drives your app in-process — no browser.
from gradio_client import Client

def test_predict_endpoint():
    # `demo` is your gr.Blocks/Interface; launch on a random port for the test.
    _, local_url, _ = demo.launch(prevent_thread_lock=True, share=False)
    client = Client(local_url)
    out = client.predict("hello", api_name="/respond")
    assert out                                   # meaningful assertion, not just no-throw
    demo.close()

def test_state_is_isolated():
    # Two calls must not leak history through a module global (regression guard).
    fn = respond
    _, h1 = fn("a", [])
    _, h2 = fn("b", [])
    assert h1 != h2 and len(h1) == len(h2) == 2  # each call starts from its own []
```

## Performance Traps
- A blocking handler under `demo.queue()` serializes ALL users — profile the slow
  handler and push it off the request thread.
- Set `default_concurrency_limit` to your real hardware limit; the default lets
  one heavy fn saturate memory. `max_size` bounds the waiting line — past it,
  users get a "queue full" instead of a silent hang.
- Return `gr.update(...)` for partial UI changes instead of rebuilding whole
  components; re-emitting large `gr.Dataframe`/`gr.Gallery` payloads every event
  is the usual latency culprit.
- Cache expensive deterministic work (model load) at module import, once — not
  inside the handler (which re-runs per request).

## Version-Specific Gotchas (dated, sourced)
- **Gradio 6.20.0** is the current stable release on PyPI, uploaded **2026-07-07**,
  `requires_python >= 3.10`. [pypi.org/project/gradio, retrieved 2026-07-10]
- Gradio 4.x → 5.x → 6.x changed component/event APIs and tightened the default
  file-access allowlist; pin an explicit version and read the release notes before
  upgrading a running app. [github.com/gradio-app/gradio releases, retrieved 2026-07-10]
- The path-traversal advisories above (CVE-2023-51449, CVE-2024-47164,
  CVE-2024-1728) are fixed in current releases — running an old pin re-exposes
  them. [nvd.nist.gov, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Gradio releases (PyPI): https://pypi.org/project/gradio/
- Gradio release notes: https://github.com/gradio-app/gradio/releases
- Gradio queue / concurrency docs: https://www.gradio.app/guides/queuing
- Gradio State (per-session) docs: https://www.gradio.app/docs/gradio/state
- Gradio sharing / launch security: https://www.gradio.app/guides/sharing-your-app
- CVE-2023-51449 (path traversal, /file route): https://nvd.nist.gov/vuln/detail/CVE-2023-51449
- CVE-2024-47164 (is_in_or_equal traversal bypass): https://nvd.nist.gov/vuln/detail/CVE-2024-47164
- CVE-2024-1728 (UploadButton LFI): https://nvd.nist.gov/vuln/detail/CVE-2024-1728
- CWE-22 (Path Traversal): https://cwe.mitre.org/data/definitions/22.html
- CWE-668 (Exposure to Wrong Sphere): https://cwe.mitre.org/data/definitions/668.html
