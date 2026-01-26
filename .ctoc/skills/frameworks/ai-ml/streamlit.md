# Streamlit CTO
> Build production ML dashboards and data apps in pure Python.

## Commands
```bash
# Setup | Dev | Test
pip install streamlit
streamlit run app.py --server.port 8501
streamlit run app.py --server.headless true --server.address 0.0.0.0
```

## Non-Negotiables
1. Use `st.cache_data` for expensive computations
2. Manage state with `st.session_state`
3. Use columns and tabs for layout
4. Deploy to Streamlit Cloud for sharing
5. Handle errors gracefully with try/except
6. Use `st.spinner` for long operations

## Red Lines
- Expensive computations without caching
- Global variables instead of session_state
- No loading indicators for slow operations
- Ignoring layout for user experience
- Hardcoded secrets in code
- No error handling in production

## Pattern: Production ML Dashboard
```python
import streamlit as st
import pandas as pd
from typing import Optional

st.set_page_config(page_title="ML Dashboard", layout="wide")

# Initialize session state
if "model" not in st.session_state:
    st.session_state.model = None
if "history" not in st.session_state:
    st.session_state.history = []

# Cached data loading
@st.cache_data(ttl=3600)
def load_data(path: str) -> pd.DataFrame:
    return pd.read_parquet(path)

# Cached model loading
@st.cache_resource
def load_model(model_path: str):
    import joblib
    return joblib.load(model_path)

# Sidebar configuration
with st.sidebar:
    st.title("Configuration")
    model_choice = st.selectbox("Model", ["Random Forest", "XGBoost"])
    threshold = st.slider("Confidence Threshold", 0.0, 1.0, 0.5)

# Main content with tabs
tab1, tab2, tab3 = st.tabs(["Predict", "History", "Metrics"])

with tab1:
    col1, col2 = st.columns(2)
    with col1:
        uploaded_file = st.file_uploader("Upload data", type=["csv", "parquet"])

    with col2:
        if uploaded_file:
            with st.spinner("Processing..."):
                data = pd.read_csv(uploaded_file)
                st.dataframe(data.head())

                if st.button("Predict", type="primary"):
                    try:
                        model = load_model(f"models/{model_choice.lower()}.joblib")
                        predictions = model.predict(data)
                        st.success(f"Predictions complete: {len(predictions)} rows")
                        st.session_state.history.append({"model": model_choice, "rows": len(predictions)})
                    except Exception as e:
                        st.error(f"Prediction failed: {e}")

with tab2:
    st.dataframe(pd.DataFrame(st.session_state.history))

with tab3:
    st.metric("Total Predictions", sum(h["rows"] for h in st.session_state.history))
```

## Integrates With
- **Data**: pandas, Polars, DuckDB
- **ML**: scikit-learn, PyTorch, TensorFlow
- **Viz**: Plotly, Altair, Matplotlib
- **Deploy**: Streamlit Cloud, Docker, AWS

## Common Errors
| Error | Fix |
|-------|-----|
| `DuplicateWidgetID` | Add unique `key` parameter to widgets |
| `SessionInfo not found` | Ensure code runs in Streamlit context |
| `CachedObjectMutationWarning` | Return new objects from cached functions |
| `MemoryError` | Use `st.cache_data` with `max_entries` limit |

## Prod Ready
- [ ] Expensive operations cached
- [ ] Session state manages all state
- [ ] Layout optimized with columns/tabs
- [ ] Error handling for all user actions
- [ ] Secrets stored in st.secrets
- [ ] Loading indicators for slow operations
