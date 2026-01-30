# Hugging Face Datasets CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install datasets
# Verify: python -c "from datasets import load_dataset; print('OK')"
```

## Claude's Common Mistakes
1. Loading entire large dataset into memory (use streaming)
2. Processing without batching (slow)
3. Missing `num_proc` for parallel processing
4. Not using `remove_columns` to clean up after map
5. Forgetting `trust_remote_code=True` for custom datasets

## Correct Patterns (2026)
```python
from datasets import load_dataset, Dataset, DatasetDict
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")

# Stream large datasets (memory efficient)
dataset = load_dataset("wikipedia", "20220301.en", split="train", streaming=True)

# Or load with caching
dataset = load_dataset("imdb", split="train", cache_dir="./cache")

# Efficient batched processing
def tokenize_batch(examples):
    return tokenizer(
        examples["text"],
        truncation=True,
        padding="max_length",
        max_length=512,
    )

tokenized = dataset.map(
    tokenize_batch,
    batched=True,           # Process in batches
    batch_size=1000,        # Batch size
    num_proc=4,             # Parallel workers
    remove_columns=["text"], # Clean up original columns
)

# Create dataset from local data
data = {"text": texts, "label": labels}
dataset = Dataset.from_dict(data)

# Proper train/val/test split
splits = dataset.train_test_split(test_size=0.2, seed=42)
val_test = splits["test"].train_test_split(test_size=0.5, seed=42)

dataset_dict = DatasetDict({
    "train": splits["train"],
    "validation": val_test["train"],
    "test": val_test["test"],
})

# Push to Hub
dataset_dict.push_to_hub("username/my-dataset", private=True)
```

## Version Gotchas
- **streaming=True**: Required for datasets larger than RAM
- **trust_remote_code**: Required for some custom dataset scripts
- **Arrow format**: Datasets use Apache Arrow for efficiency
- **num_proc**: Use for CPU-bound preprocessing, not GPU

## What NOT to Do
- Do NOT load large datasets without `streaming=True`
- Do NOT skip `batched=True` in map operations
- Do NOT forget `num_proc` for parallel processing
- Do NOT leave unused columns after map
- Do NOT skip proper train/val/test splits
