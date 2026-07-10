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

## Loading Footguns
`streaming=True` returns an **`IterableDataset`, a different type with a
different API** than the map-style `Dataset` — code written for one silently
misbehaves on the other.

```python
from datasets import load_dataset

# streaming=True → IterableDataset: lazy, single-pass, NO len(), NO random index.
it = load_dataset("HuggingFaceFW/fineweb", split="train", streaming=True)
# FOOTGUN: len(it) / it[0] raise — IterableDataset has neither.
first = next(iter(it))                 # RIGHT: iterate; do not index.

# map-style Dataset: fully materialized, len() + ds[i] work, cached on disk.
ds = load_dataset("imdb", split="train")     # NOT streaming
row = ds[0]                                   # random access OK
```
- **`map` caches by a fingerprint of the function + args**: a change that the
  hasher can't see (a closed-over global, a lambda, an un-picklable callable)
  reuses a **stale cache** or disables caching entirely. Pass
  `load_from_cache_file=False` to force recompute, or bump `new_fingerprint=`.
- **`num_proc`** shards `map` across processes — great for CPU tokenization, but
  each worker re-imports the module, so keep heavy setup under `if __name__ ==
  "__main__":`. Do NOT set `num_proc` for GPU work (workers contend for one GPU).
- **Arrow memory-mapping**: a `Dataset` is memory-mapped from disk, so it does NOT
  load fully into RAM — but `.to_pandas()` / `[:]` **materializes the whole thing**
  and can OOM. Slice or stream instead of collecting.

## Correctness — Splits, Shuffle & Cache
```python
# Streaming shuffle is a BUFFERED approximation, not a global shuffle:
it = it.shuffle(seed=42, buffer_size=10_000)   # only reorders within the buffer
# For a true split, materialize then split (streaming has no train_test_split):
ds = load_dataset("imdb", split="train")
splits = ds.train_test_split(test_size=0.2, seed=42)   # deterministic with seed
```
- **Cache invalidation**: the on-disk cache is keyed by the load args + script
  revision. Editing a local loading script without bumping the revision can serve
  the OLD Arrow file — clear `~/.cache/huggingface/datasets` when a change seems
  ignored.

## Security & Dependency Gotchas
- **A dataset with a loading *script* executes arbitrary code (CWE-94)**: some hub
  datasets ship a `*.py` builder that `load_dataset` runs on your machine —
  CWE-94 "Improper Control of Generation of Code ('Code Injection')"
  (cwe.mitre.org). `datasets 4.0` removed script execution by default; where it is
  still reachable it is gated behind `trust_remote_code=True`.

```python
# FOOTGUN: enabling script execution on an untrusted repo = arbitrary code run.
ds = load_dataset("some/scripted-dataset", trust_remote_code=True)   # audit first!

# SAFE: trust only a repo you reviewed, and PIN an immutable revision so a later
# push cannot swap in new builder code you never saw.
ds = load_dataset(
    "some/scripted-dataset",
    trust_remote_code=True,
    revision="a1b2c3d4e5f6",          # commit SHA, never "main"
)
# SAFEST: prefer no-script datasets — pure Parquet/Arrow repos run no code.
```
- Pin `revision=<sha>` for reproducibility even on script-free datasets: a moving
  `main` changes the data under you between runs.
- Source: cwe.mitre.org/94; huggingface.co/docs/datasets loading + security docs.
  See References.

## Error Handling Idioms
```python
from datasets import load_dataset
from huggingface_hub.errors import GatedRepoError

try:
    ds = load_dataset("some/gated-dataset", split="train", revision=REV)
except GatedRepoError:
    raise SystemExit("accept the dataset license + set HF_TOKEN")   # 401/403
except ValueError as e:
    # a bad split string ("train[:200%]") or missing config raises ValueError,
    # not a network error — check the split/config name, not your connection.
    raise SystemExit(f"bad split/config: {e}")
# Silent OOM on `.to_pandas()` / full slice is not an exception — it's the kernel
# killing the process. Slice or stream instead of materializing (see Loading).
```

## Testing Conventions
```python
def test_stream_is_iterable_not_indexable():
    from datasets import IterableDataset
    it = load_dataset("imdb", split="train", streaming=True)
    assert isinstance(it, IterableDataset)
    # never assert len(it) / it[0] — IterableDataset supports neither.

def test_split_is_deterministic():
    ds = load_dataset("imdb", split="train[:1000]")
    a = ds.train_test_split(test_size=0.2, seed=42)["test"][0]
    b = ds.train_test_split(test_size=0.2, seed=42)["test"][0]
    assert a == b                       # same seed → same split
```

## Performance Traps
- `streaming=True` avoids the multi-GB local download but re-fetches every epoch;
  for repeated passes, materialize once and cache locally.
- `batched=True` + a large `batch_size` amortizes Python-call overhead in `map`;
  unbatched `map` on a big dataset is the classic slow path.
- `.with_format("torch")` / `.set_format` returns tensors with zero-copy from
  Arrow — collecting to Python lists first wastes memory and time.

## Version-Specific Gotchas (dated, sourced)
- **datasets 5.0.0** is the current stable release, uploaded **2026-06-05**,
  `requires_python >= 3.10`. [pypi.org/project/datasets, retrieved 2026-07-10]
- **datasets 4.0** removed dataset-loading-**script** execution by default
  (a security-motivated breaking change) — script datasets now require explicit
  `trust_remote_code=True`, and pure Parquet/Arrow repos are preferred.
  [huggingface.co/docs/datasets, retrieved 2026-07-10]
- Datasets are stored as **Apache Arrow** and memory-mapped; `.to_pandas()` /
  full-slice materialization can OOM on large splits.
  [huggingface.co/docs/datasets/about_arrow, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- datasets releases (PyPI): https://pypi.org/project/datasets/
- datasets docs: https://huggingface.co/docs/datasets
- Stream (IterableDataset): https://huggingface.co/docs/datasets/stream
- Process / map / cache: https://huggingface.co/docs/datasets/process
- Arrow & memory-mapping: https://huggingface.co/docs/datasets/about_arrow
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
