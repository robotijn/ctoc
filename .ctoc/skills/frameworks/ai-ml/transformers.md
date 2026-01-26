# Hugging Face Transformers CTO
> 200,000+ pretrained models.

## Non-Negotiables
1. pipeline() for inference
2. Trainer for fine-tuning
3. AutoClass for loading
4. datasets library
5. Quantization for production

## Red Lines
- Wrong tokenizer
- OOM without checkpointing
- Slow inference without quantization

## Pattern
```python
classifier = pipeline("text-classification")
result = classifier("This is great!")
```
