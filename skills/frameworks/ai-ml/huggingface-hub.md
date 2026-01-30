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
