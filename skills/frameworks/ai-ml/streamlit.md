# Streamlit CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install streamlit
# Run: streamlit run app.py
# Production: streamlit run app.py --server.headless true --server.address 0.0.0.0
```

## Claude's Common Mistakes
1. Missing `@st.cache_data` for expensive computations
2. Using global variables instead of `st.session_state`
3. No loading indicators for slow operations
4. Duplicate widget keys causing errors
5. Not using `st.secrets` for API keys

## Correct Patterns (2026)
```python
import streamlit as st
import pandas as pd

st.set_page_config(page_title="ML Dashboard", layout="wide")

# Initialize session state FIRST
if "predictions" not in st.session_state:
    st.session_state.predictions = []

# Cache data loading (TTL in seconds)
@st.cache_data(ttl=3600)
def load_data(path: str) -> pd.DataFrame:
    return pd.read_parquet(path)

# Cache model loading (use cache_resource for objects)
@st.cache_resource
def load_model(path: str):
    import joblib
    return joblib.load(path)

# Sidebar configuration
with st.sidebar:
    model_choice = st.selectbox("Model", ["RF", "XGBoost"], key="model_select")
    threshold = st.slider("Threshold", 0.0, 1.0, 0.5, key="threshold_slider")

# Main content with tabs
tab1, tab2 = st.tabs(["Predict", "History"])

with tab1:
    uploaded = st.file_uploader("Upload CSV", type=["csv"], key="uploader")
    if uploaded:
        with st.spinner("Processing..."):  # Always show loading state
            data = pd.read_csv(uploaded)
            st.dataframe(data.head())

        if st.button("Predict", type="primary", key="predict_btn"):
            try:
                model = load_model(f"models/{model_choice}.joblib")
                preds = model.predict(data)
                st.success(f"Predicted {len(preds)} rows")
                st.session_state.predictions.append({"model": model_choice, "n": len(preds)})
            except Exception as e:
                st.error(f"Failed: {e}")

# Access secrets: st.secrets["OPENAI_API_KEY"]
```

## Version Gotchas
- **cache_data**: For data (serializable), replaces `@st.cache`
- **cache_resource**: For models/connections (non-serializable)
- **session_state**: Persists across reruns, not across sessions
- **Secrets**: Use `.streamlit/secrets.toml` or Streamlit Cloud

## What NOT to Do
- Do NOT skip `@st.cache_data` for expensive operations
- Do NOT use global variables - use `st.session_state`
- Do NOT forget unique `key` parameter for widgets
- Do NOT skip `st.spinner()` for slow operations
- Do NOT hardcode secrets - use `st.secrets`

## Rerun Model Footguns
The one mental model that unbreaks 90% of Streamlit bugs: **the entire script
re-runs top-to-bottom on every widget interaction.** There is no callback-only
region and no persistent local scope — a local variable is reborn each run, so
"my counter resets to 0" is not a bug, it's the model. Persistence lives ONLY in
`st.session_state`.

```python
import streamlit as st

# FOOTGUN: `count` is re-initialised to 0 every rerun — the button never appears
# to work. Local variables do NOT survive a rerun.
count = 0                          # WRONG: reset on every interaction
if st.button("add"):
    count += 1
st.write(count)                    # always 0 or 1

# RIGHT: session_state is the only thing that persists across reruns.
if "count" not in st.session_state:   # guard: initialise ONCE
    st.session_state.count = 0
if st.button("add", key="add_btn"):
    st.session_state.count += 1
st.write(st.session_state.count)
```

- **Widgets rerun the whole script; batch with `st.form`.** Every keystroke/slider
  drag triggers a full rerun. Wrap multi-field input in `st.form` so the script
  only reruns once, on submit — not on each field:

```python
with st.form("params"):
    lr = st.number_input("lr", value=1e-3)
    epochs = st.number_input("epochs", value=10)
    go = st.form_submit_button("train")   # ONE rerun happens here, not per field
if go:
    train(lr, epochs)                     # runs only after submit
```

- **`@st.cache_data` vs `@st.cache_resource` — pick wrong and you get staleness or
  corruption.** `cache_data` returns a *copy* each call (safe for DataFrames /
  serializable values; mutate freely). `cache_resource` returns the *same shared
  object* (models, DB connections) — mutating it corrupts it for every session and
  every rerun. Using `cache_data` on an unpicklable model errors; using
  `cache_resource` on a DataFrame you then mutate silently poisons the cache.

```python
@st.cache_data(ttl=3600)          # returns a COPY; TTL bounds staleness
def load_frame(path): return pd.read_parquet(path)

@st.cache_resource                # returns THE SAME object; never mutate it
def get_model():
    # NOTE: joblib.load unpickles -> arbitrary code execution on untrusted files
    # (CWE-502). Only load your OWN trusted artifact; never a user upload.
    return joblib.load("m.joblib")

# STALENESS TRAP: a cached fn keyed only on `path` will not notice the file changed
# on disk. Key on a content hash / mtime, or set a TTL, when the source can change.
```

## Execution Model
Each rerun executes your script **synchronously on a single thread**; a long task
(model training, a big query) blocks that run and the UI freezes until it returns.
Show `st.spinner()` / `st.status()` for feedback, and push genuinely long work to a
background thread or job queue, writing results into `st.session_state` — do not
`time.sleep`/train inline and expect a responsive page.

## Error Handling Idioms
```python
import streamlit as st

# FOOTGUN: an unhandled exception in the script run replaces the WHOLE page with a
# red traceback (and, if `client.showErrorDetails` is on, leaks internals to the
# user). Wrap fallible work and surface a clean message; keep the app rendered.
try:
    model = get_model()
    preds = model.predict(data)
    st.success(f"Predicted {len(preds)} rows")
except FileNotFoundError:
    st.error("Model artifact missing — run training first.")   # page stays usable
    st.stop()                                                  # halt THIS rerun cleanly
except Exception:
    st.error("Prediction failed — check the logs.")   # clean, user-facing message
    # log the real exception server-side, not to the browser

# st.stop() ends the current run without a traceback — use it after a validation
# failure instead of letting the rest of the script run on bad state.
if uploaded is None:
    st.info("Upload a CSV to begin.")
    st.stop()
```
- Set `client.showErrorDetails = "none"` (or `false`) in production config so
  tracebacks never reach the browser; log them server-side instead.

## Security Gotchas
- **`unsafe_allow_html=True` is a stored/reflected XSS hole (CWE-79).**
  `st.markdown(user_text, unsafe_allow_html=True)` injects raw HTML/JS into the
  page. If `user_text` is anything a user or a database can influence, an attacker
  runs script in every viewer's browser. Streamlit has shipped real XSS fixes —
  **CVE-2023-27494** was a reflected XSS in hosted Streamlit apps (versions 0.63.0
  through 0.80.0). [nvd.nist.gov, published 2023-03-16]

```python
# WRONG: renders attacker-controlled markup verbatim.
st.markdown(user_bio, unsafe_allow_html=True)          # XSS (CWE-79)

# RIGHT: default escapes HTML; if you MUST allow rich text, sanitise first.
st.markdown(user_bio)                                   # escaped, safe
import bleach
st.markdown(bleach.clean(user_bio, tags=["b","i","a"]), unsafe_allow_html=True)
# CWE-79 authority: https://cwe.mitre.org/data/definitions/79.html
```

- **Secrets belong in `st.secrets`, never in code (CWE-798, use of hard-coded
  credentials).** Committing an API key inlines it into git history and every
  deploy. Put keys in `.streamlit/secrets.toml` (git-ignored) or the Cloud secrets
  UI and read `st.secrets["OPENAI_API_KEY"]`.
  CWE-798 authority: https://cwe.mitre.org/data/definitions/798.html
- **`st.file_uploader` returns bytes, not a trusted path (CWE-22).** Never build a
  filesystem path from the uploaded `.name`; strip it with `os.path.basename` and
  write under a fixed dir. Streamlit itself patched a static-file path-traversal —
  **CVE-2024-42474** (path traversal via the static file sharing feature on Windows
  hosts). [nvd.nist.gov, published 2024-08-12]

```python
up = st.file_uploader("csv", type=["csv"])
if up:
    # WRONG: open(up.name)  -> traversal if name is "../../etc/passwd"
    dest = os.path.join(UPLOAD_DIR, os.path.basename(up.name))  # RIGHT
    with open(dest, "wb") as f:
        f.write(up.getbuffer())
```

## Testing Conventions
```python
# Streamlit ships an official headless harness: AppTest drives the script with
# no browser, so widget logic and reruns are unit-testable.
from streamlit.testing.v1 import AppTest

def test_counter_persists_across_rerun():
    at = AppTest.from_file("app.py").run()
    at.button[0].click().run()          # simulate a click -> one rerun
    at.button[0].click().run()
    assert at.session_state["count"] == 2   # meaningful assertion on persisted state

def test_no_exception_on_load():
    at = AppTest.from_file("app.py").run()
    assert not at.exception               # the script ran clean
```

## Performance Traps
- Cache the expensive deterministic work: `@st.cache_data` for data,
  `@st.cache_resource` for the model/connection — an uncached load re-runs on EVERY
  interaction (that is the classic "why is my app slow" cause).
- A widget without a stable `key=` can lose its value or duplicate-key-error across
  reruns; give every widget a unique key.
- Prefer `st.form` to collapse many-field input into a single rerun; without it,
  each keystroke re-executes the whole script (and any uncached work in it).
- `st.dataframe` streams large tables efficiently; do not `st.write` a
  multi-hundred-thousand-row DataFrame — paginate or sample.

## Version-Specific Gotchas (dated, sourced)
- **Streamlit 1.59.1** is the current stable release on PyPI, uploaded
  **2026-07-08**, `requires_python >= 3.10`. [pypi.org/project/streamlit, retrieved
  2026-07-10]
- `@st.cache_data` / `@st.cache_resource` replaced the deprecated `@st.cache`; the
  old decorator is removed in modern releases — do not suggest `@st.cache`.
  [docs.streamlit.io caching, retrieved 2026-07-10]
- Security fixes ship in point releases — CVE-2023-27494 (XSS) and CVE-2024-42474
  (path traversal) are patched in current versions; an old pin re-exposes them.
  [nvd.nist.gov, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Streamlit releases (PyPI): https://pypi.org/project/streamlit/
- Streamlit changelog / release notes: https://docs.streamlit.io/develop/quick-reference/changelog
- Caching (cache_data vs cache_resource): https://docs.streamlit.io/develop/concepts/architecture/caching
- Session state / rerun model: https://docs.streamlit.io/develop/concepts/architecture/session-state
- AppTest (headless testing): https://docs.streamlit.io/develop/api-reference/app-testing/st.testing.v1.apptest
- Secrets management: https://docs.streamlit.io/develop/concepts/connections/secrets-management
- CVE-2023-27494 (reflected XSS): https://nvd.nist.gov/vuln/detail/CVE-2023-27494
- CVE-2024-42474 (static-file path traversal): https://nvd.nist.gov/vuln/detail/CVE-2024-42474
- CWE-79 (Cross-site Scripting): https://cwe.mitre.org/data/definitions/79.html
- CWE-798 (Hard-coded Credentials): https://cwe.mitre.org/data/definitions/798.html
- CWE-22 (Path Traversal): https://cwe.mitre.org/data/definitions/22.html
