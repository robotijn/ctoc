# Hugging Face Hub CTO
> The central repository for ML models, datasets, and Spaces.

## Commands
```bash
# Setup | Dev | Test
pip install huggingface_hub
huggingface-cli login
huggingface-cli repo create model-name --type model
huggingface-cli upload model-name ./local-path --repo-type model
```

## Non-Negotiables
1. Model cards with documentation and usage
2. Proper licensing for all uploads
3. Version control with meaningful commits
4. Gated models for sensitive content
5. Spaces for interactive demos
6. Dataset cards with data documentation

## Red Lines
- Missing model cards
- No license specification
- Large files without Git LFS
- Exposing API tokens in code
- No dataset documentation
- Private models without access control

## Pattern: Production Model Upload
```python
from huggingface_hub import (
    HfApi, create_repo, upload_folder,
    ModelCard, ModelCardData
)

api = HfApi()

# Create repository
repo_id = "org/model-name"
create_repo(repo_id, repo_type="model", private=False)

# Create model card
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
    training_procedure="Fine-tuned on IMDB dataset for 3 epochs",
    evaluation_results="Accuracy: 92% on test set",
)
card.push_to_hub(repo_id)

# Upload model files
upload_folder(
    folder_path="./model",
    repo_id=repo_id,
    repo_type="model",
    commit_message="Upload fine-tuned model v1.0",
)

# Download with caching
from huggingface_hub import hf_hub_download, snapshot_download

model_path = hf_hub_download(repo_id=repo_id, filename="model.safetensors")
full_model = snapshot_download(repo_id=repo_id, cache_dir="./cache")
```

## Integrates With
- **Libraries**: Transformers, Diffusers, PEFT
- **Hosting**: Spaces, Inference Endpoints
- **CI/CD**: GitHub Actions, webhooks
- **Storage**: Git LFS, S3 backends

## Common Errors
| Error | Fix |
|-------|-----|
| `Repository not found` | Check repo_id format: "username/repo-name" |
| `Authentication required` | Run `huggingface-cli login` |
| `File too large` | Use Git LFS for files >10MB |
| `Rate limit exceeded` | Use token with higher limits |

## Prod Ready
- [ ] Model card with full documentation
- [ ] License specified in model card
- [ ] Large files tracked with Git LFS
- [ ] API token stored securely
- [ ] Version tags for releases
- [ ] Space demo linked to model
