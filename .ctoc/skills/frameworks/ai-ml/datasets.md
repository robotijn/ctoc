# Hugging Face Datasets CTO
> Efficient dataset loading, processing, and sharing for ML.

## Commands
```bash
# Setup | Dev | Test
pip install datasets
python -c "from datasets import load_dataset; print(load_dataset('squad', split='train[:10]'))"
huggingface-cli datasets upload my-dataset ./data
```

## Non-Negotiables
1. Streaming for large datasets
2. Memory mapping for efficiency
3. Proper train/validation/test splits
4. Arrow format for performance
5. Dataset versioning and caching
6. Batched processing with map()

## Red Lines
- Loading entire large dataset in memory
- Missing train/test splits
- No caching strategy
- Ignoring memory-mapped files
- Hardcoded local paths
- Processing without batching

## Pattern: Production Data Pipeline
```python
from datasets import load_dataset, Dataset, DatasetDict
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")

# Load with streaming for large datasets
dataset = load_dataset(
    "squad",
    split="train",
    streaming=True,
    trust_remote_code=True,
)

# Or load specific split with caching
dataset = load_dataset(
    "imdb",
    split="train",
    cache_dir="./cache",
)

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
    batched=True,
    batch_size=1000,
    num_proc=4,
    remove_columns=["text"],
)

# Create dataset from local data
data = {"text": texts, "label": labels}
dataset = Dataset.from_dict(data)

# Split into train/val/test
dataset = dataset.train_test_split(test_size=0.2, seed=42)
dataset = DatasetDict({
    "train": dataset["train"],
    "validation": dataset["test"].train_test_split(test_size=0.5, seed=42)["train"],
    "test": dataset["test"].train_test_split(test_size=0.5, seed=42)["test"],
})

# Push to Hub
dataset.push_to_hub("username/my-dataset", private=True)
```

## Integrates With
- **Training**: Transformers Trainer, PyTorch
- **Storage**: HuggingFace Hub, S3, local
- **Processing**: pandas, NumPy, Arrow
- **Streaming**: WebDataset, IterableDataset

## Common Errors
| Error | Fix |
|-------|-----|
| `MemoryError` | Use streaming=True or reduce batch_size |
| `FileNotFoundError` | Check dataset name, verify cache_dir |
| `KeyError: column` | Check column names with dataset.column_names |
| `Slow processing` | Enable batched=True, increase num_proc |

## Prod Ready
- [ ] Streaming enabled for large datasets
- [ ] Caching configured for repeated access
- [ ] Train/val/test splits created
- [ ] Batched processing with num_proc
- [ ] Dataset pushed to Hub with card
- [ ] Version tags for reproducibility
