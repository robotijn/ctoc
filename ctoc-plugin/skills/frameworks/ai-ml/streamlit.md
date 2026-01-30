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
