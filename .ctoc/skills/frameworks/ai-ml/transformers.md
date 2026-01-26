# Hugging Face Transformers CTO
> Access to 500,000+ pretrained models with unified APIs.

## Commands
```bash
# Setup | Dev | Test
pip install transformers[torch] datasets accelerate peft bitsandbytes
huggingface-cli login
pytest tests/ -v && python -c "from transformers import pipeline; print(pipeline('sentiment-analysis')('test'))"
```

## Non-Negotiables
1. `pipeline()` for quick inference tasks
2. `Trainer` class for fine-tuning workflows
3. `AutoClass` for model/tokenizer loading
4. `datasets` library for data handling
5. Quantization (GPTQ, AWQ, bitsandbytes) for production
6. Proper padding and attention masks

## Red Lines
- Mismatched tokenizer and model
- OOM without gradient checkpointing
- Slow inference without quantization or batching
- Missing `pad_token` causing errors
- Not using `accelerate` for multi-GPU
- Ignoring model-specific preprocessing

## Pattern: Production Fine-Tuning
```python
from transformers import (
    AutoModelForCausalLM, AutoTokenizer,
    TrainingArguments, Trainer, BitsAndBytesConfig
)
from peft import LoraConfig, get_peft_model
from datasets import load_dataset

# Load quantized model
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype="bfloat16",
)
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B",
    quantization_config=bnb_config,
    device_map="auto",
)
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3.1-8B")
tokenizer.pad_token = tokenizer.eos_token

# Add LoRA adapters
lora_config = LoraConfig(r=16, lora_alpha=32, target_modules=["q_proj", "v_proj"])
model = get_peft_model(model, lora_config)

# Training
args = TrainingArguments(
    output_dir="./output",
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    fp16=True,
    gradient_checkpointing=True,
)
trainer = Trainer(model=model, args=args, train_dataset=dataset)
trainer.train()
trainer.model.save_pretrained("./lora-adapter")
```

## Integrates With
- **Training**: Accelerate, DeepSpeed, FSDP
- **Optimization**: PEFT, bitsandbytes, Unsloth
- **Serving**: vLLM, TGI, Triton
- **Data**: datasets, evaluate

## Common Errors
| Error | Fix |
|-------|-----|
| `CUDA out of memory` | Enable `gradient_checkpointing`, use 4-bit quantization |
| `Token indices sequence length is longer than max` | Truncate inputs: `truncation=True, max_length=512` |
| `The model did not return a loss` | Ensure labels are passed or use correct task head |
| `RuntimeError: expected scalar type BFloat16` | Match `torch_dtype` with compute dtype |

## Prod Ready
- [ ] Model quantized for inference (4-bit or 8-bit)
- [ ] Tokenizer handles padding correctly
- [ ] Batch inference with dynamic batching
- [ ] Model card with usage documentation
- [ ] Pushed to HuggingFace Hub with proper tags
- [ ] Evaluation metrics logged with `evaluate`
