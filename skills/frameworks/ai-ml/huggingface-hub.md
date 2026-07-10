# Hugging Face Hub CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install huggingface_hub
huggingface-cli login  # Required for uploads and gated models
# Verify: huggingface-cli whoami
```

## Claude's Common Mistakes
1. Missing model cards (README.md) for uploaded models
2. Not specifying license in uploads
3. Large files without Git LFS tracking
4. Exposing HF tokens in code
5. Missing repo_type causing wrong repository type

## Correct Patterns (2026)
```python
from huggingface_hub import HfApi, create_repo, upload_folder, ModelCard, ModelCardData

api = HfApi()

# Create repository
repo_id = "username/my-model"
create_repo(repo_id, repo_type="model", private=False)

# Create model card (required for discoverability)
card_data = ModelCardData(
    license="apache-2.0",
    language="en",
    library_name="transformers",
    tags=["text-classification", "bert"],
    datasets=["imdb"],
    metrics=[{"type": "accuracy", "value": 0.92}],
)

card = ModelCard.from_template(
    card_data,
    model_id=repo_id,
    model_description="BERT fine-tuned for sentiment analysis",
)
card.push_to_hub(repo_id)

# Upload model files
upload_folder(
    folder_path="./model",
    repo_id=repo_id,
    repo_type="model",
    commit_message="Upload model v1.0",
)

# Download with caching
from huggingface_hub import hf_hub_download, snapshot_download

model_file = hf_hub_download(repo_id=repo_id, filename="model.safetensors")
full_model = snapshot_download(repo_id=repo_id, cache_dir="./cache")
```

## Version Gotchas
- **Cache**: Default `~/.cache/huggingface/hub`, set `HF_HUB_CACHE` to change
- **Gated models**: Require `huggingface-cli login` and model approval
- **LFS**: Files >10MB automatically use Git LFS
- **repo_type**: Must specify "model", "dataset", or "space"

## What NOT to Do
- Do NOT upload without a model card
- Do NOT skip license specification
- Do NOT expose HF tokens in code - use `huggingface-cli login`
- Do NOT forget `repo_type` parameter
- Do NOT upload large files without LFS consideration

## Download Footguns
A download that "works" but resolves a **moving branch** (or symlinks a shared
cache) is the single most common non-determinism Claude ships here.

```python
from huggingface_hub import hf_hub_download, snapshot_download

# FOOTGUN: no revision → resolves the repo's moving `main`; a later push to the
# repo silently changes your file between runs (irreproducible builds, and — if
# the repo ships code — a supply-chain swap you never reviewed).
path = hf_hub_download("org/model", "model.safetensors")            # UNPINNED

# RIGHT: pin an IMMUTABLE commit SHA, not a mutable branch/tag.
path = hf_hub_download(
    "org/model", "model.safetensors",
    revision="a1b2c3d4e5f6",          # 40-hex commit SHA, never "main"
)
snap = snapshot_download("org/model", revision="a1b2c3d4e5f6")
```
- **`local_dir` vs cache symlinks**: by default the cache stores blobs once and
  `snapshot_download(..., local_dir=...)` used to symlink into the shared cache —
  deleting the cache breaks your `local_dir`. Pass `local_dir_use_symlinks=False`
  (or copy) when the directory must stand alone (e.g. a Docker layer).
- **Gated repos** (Llama, etc.) return **401/403 (`GatedRepoError`)** until you
  accept the license AND provide a token — a CI failure here is a missing
  `HF_TOKEN`, not a code bug.
- Source: huggingface.co manage-cache + download guides. See References.

## Reliability & Resume
```python
# Large downloads resume from the partial blob automatically on retry; the
# ETag HEAD can hang on a flaky proxy — bound it instead of blocking forever.
import os
os.environ["HF_HUB_ETAG_TIMEOUT"] = "30"      # seconds; default 10
os.environ["HF_HUB_DOWNLOAD_TIMEOUT"] = "60"  # per-chunk read timeout
# Offline / air-gapped: fail fast on a cache miss instead of hitting the network.
os.environ["HF_HUB_OFFLINE"] = "1"
```
- `hf_transfer` (`pip install hf_transfer`, `HF_HUB_ENABLE_HF_TRANSFER=1`) gives a
  Rust fast path for multi-GB pulls — but it disables the progress bar and some
  proxy configs, so keep it opt-in.

## Security & Dependency Gotchas
- **Hard-coded token (CWE-798)**: an `HfApi(token="hf_...")` literal or a token
  committed to git is CWE-798 "Use of Hard-coded Credentials" (cwe.mitre.org).
  Read it from the environment / the CLI-stored credential, never a literal:

```python
import os
from huggingface_hub import HfApi
api = HfApi(token=os.environ["HF_TOKEN"])   # env, or omit → uses `hf` CLI login
# NEVER: HfApi(token="hf_abcd...")          # CWE-798, leaks in git + logs
```
- **`trust_remote_code=True` is remote code execution (CWE-94)**: downstream
  libraries that consume a hub repo (transformers, custom pipelines) will run
  `*.py` **shipped in the repo** on your machine. That is CWE-94 "Improper Control
  of Generation of Code ('Code Injection')" (cwe.mitre.org). Only enable it for a
  repo you trust, and **pin `revision=<sha>`** so a later push cannot swap in code.
- **Prefer safetensors over pickle (CWE-502)**: `.bin`/`.pt`/`.ckpt` files are
  Python `pickle` — loading one executes arbitrary code (CWE-502 "Deserialization
  of Untrusted Data", cwe.mitre.org). Prefer repos shipping `*.safetensors`; the
  `safetensors` container cannot execute code. Scan a repo's file list before
  download and treat any `.bin`/`.ckpt` as untrusted.
- Source: cwe.mitre.org/94, /502, /798; huggingface.co security + safetensors
  docs. See References.

## Error Handling Idioms
```python
from huggingface_hub.errors import (
    GatedRepoError, RepositoryNotFoundError, RevisionNotFoundError,
)
try:
    path = hf_hub_download("org/model", "model.safetensors", revision=REV)
except GatedRepoError:
    raise SystemExit("accept the license + set HF_TOKEN")     # 401/403
except RepositoryNotFoundError:
    raise SystemExit("no such repo (or private without a token)")  # 404
except RevisionNotFoundError:
    raise SystemExit(f"no such revision {REV} — did the branch move?")
# A hang mid-download is usually the ETag HEAD on a flaky proxy — bound it with
# HF_HUB_ETAG_TIMEOUT rather than blocking forever (see Reliability & Resume).
```

## Performance Traps
- `snapshot_download` fetches EVERY file in the repo — pass
  `allow_patterns=["*.safetensors", "*.json"]` (or `ignore_patterns`) to skip the
  `.bin` duplicates and the training artifacts you don't need.
- The shared cache **deduplicates blobs across repos**; wiping it forces a full
  re-pull. Pre-warm `HF_HOME` on a fast disk in CI and reuse it.
- `hf_transfer` (Rust) is the fast path for multi-GB pulls; the pure-Python client
  is the bottleneck on a fat pipe.

## Testing Conventions
```python
def test_pins_immutable_revision():
    # a guide/test that pins `main` is a bug — assert a 40-hex SHA.
    import re
    assert re.fullmatch(r"[0-9a-f]{40}", REVISION), "pin a commit SHA, not a branch"

def test_no_token_literal(source: str):
    assert "hf_" not in source or "os.environ" in source   # no hard-coded token
```

## Version-Specific Gotchas (dated, sourced)
- **huggingface_hub 1.23.0** is the current stable release, uploaded
  **2026-07-09**, `requires_python >= 3.10`.
  [pypi.org/project/huggingface-hub, retrieved 2026-07-10]
- The **1.x line** dropped Python 3.9 and reorganized errors under
  `huggingface_hub.errors` (`GatedRepoError`, `RepositoryNotFoundError`) — import
  from there, not the old top-level names.
  [huggingface.co/docs/huggingface_hub, retrieved 2026-07-10]
- **safetensors 0.8.0** is current and is the preferred weight format — repos
  shipping only `.bin`/`.ckpt` carry the CWE-502 pickle risk.
  [pypi.org/project/safetensors, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- huggingface_hub releases (PyPI): https://pypi.org/project/huggingface-hub/
- huggingface_hub docs: https://huggingface.co/docs/huggingface_hub
- Manage cache / download: https://huggingface.co/docs/huggingface_hub/guides/manage-cache
- Environment variables: https://huggingface.co/docs/huggingface_hub/package_reference/environment_variables
- safetensors (safe serialization): https://huggingface.co/docs/safetensors
- safetensors releases (PyPI): https://pypi.org/project/safetensors/
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
- CWE-798 (Use of Hard-coded Credentials): https://cwe.mitre.org/data/definitions/798.html
