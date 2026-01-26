# PyTorch CTO
> Deep learning leader.

## Non-Negotiables
1. PyTorch Lightning for training
2. torch.compile() (2.0+)
3. DataLoader with num_workers
4. Mixed precision (AMP)
5. Gradient checkpointing

## Red Lines
- Manual training loops when Lightning works
- Not using inference_mode()
- GPU memory leaks
- Missing random seeds

## Pattern
```python
model = torch.compile(Model())
trainer = L.Trainer(precision="16-mixed")
trainer.fit(model, dataloader)
```
