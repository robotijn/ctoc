# PyTorch CTO
> The industry standard for deep learning research and production deployment.

## Commands
```bash
# Setup | Dev | Test
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
python -m torch.distributed.launch --nproc_per_node=4 train.py
pytest tests/ -v --tb=short && python -m torch.utils.benchmark
```

## Non-Negotiables
1. Use `torch.compile()` for 2x speedup on PyTorch 2.0+
2. PyTorch Lightning for structured training loops
3. DataLoader with `num_workers > 0` and `pin_memory=True`
4. Mixed precision training with `torch.amp` for memory efficiency
5. Gradient checkpointing for large models
6. Set deterministic seeds for reproducibility

## Red Lines
- Manual training loops when Lightning handles it
- Using `.cuda()` instead of `.to(device)` for portability
- Not using `torch.inference_mode()` during evaluation
- GPU memory leaks from not clearing cache
- Missing `model.eval()` before inference
- Hardcoded batch sizes without gradient accumulation

## Pattern: Production Training Pipeline
```python
import torch
import lightning as L
from torch.utils.data import DataLoader

class LitModel(L.LightningModule):
    def __init__(self, model):
        super().__init__()
        self.model = torch.compile(model)

    def training_step(self, batch, batch_idx):
        x, y = batch
        loss = self.model(x, y)
        self.log("train_loss", loss, prog_bar=True)
        return loss

    def configure_optimizers(self):
        return torch.optim.AdamW(self.parameters(), lr=1e-4)

trainer = L.Trainer(
    precision="16-mixed",
    gradient_clip_val=1.0,
    accumulate_grad_batches=4,
    callbacks=[L.callbacks.EarlyStopping("val_loss")],
)
trainer.fit(model, train_loader, val_loader)
```

## Integrates With
- **Data**: HuggingFace Datasets, WebDataset for streaming
- **Tracking**: W&B, MLflow, TensorBoard
- **Serving**: TorchServe, Triton, ONNX Runtime
- **Distributed**: DeepSpeed, FSDP, torchrun

## Common Errors
| Error | Fix |
|-------|-----|
| `CUDA out of memory` | Reduce batch size, enable gradient checkpointing, use mixed precision |
| `Expected all tensors on same device` | Use `.to(device)` consistently, check DataLoader |
| `RuntimeError: grad can be implicitly created only for scalar outputs` | Call `.backward()` on scalar loss, use `loss.mean()` |
| `DataLoader worker exited unexpectedly` | Reduce `num_workers`, check shared memory limits |

## Prod Ready
- [ ] Model compiled with `torch.compile()`
- [ ] Mixed precision enabled for GPU efficiency
- [ ] Checkpointing saves optimizer state and scheduler
- [ ] Inference uses `torch.inference_mode()` context
- [ ] Model exported to TorchScript or ONNX
- [ ] GPU memory profiled with `torch.cuda.memory_summary()`
