# Hugging Face Datasets CTO
> Efficient dataset loading and processing.

## Non-Negotiables
1. Streaming for large datasets
2. Memory mapping
3. Proper data splits
4. Arrow format benefits
5. Dataset versioning

## Red Lines
- Loading entire dataset in memory
- Missing train/test splits
- No caching strategy
- Ignoring memory-mapped files
- Hardcoded local paths

## Pattern
```python
from datasets import load_dataset

dataset = load_dataset("squad", split="train", streaming=True)
dataset = dataset.map(preprocess, batched=True)
```
