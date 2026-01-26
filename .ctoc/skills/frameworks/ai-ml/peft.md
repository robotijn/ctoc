# PEFT CTO
> Parameter-efficient fine-tuning for large language models.

## Commands
```bash
# Setup | Dev | Test
pip install peft transformers accelerate bitsandbytes
python -c "from peft import LoraConfig, get_peft_model; print('OK')"
pytest tests/ -v
```

## Non-Negotiables
1. LoRA as default for most fine-tuning tasks
2. Proper rank (r) selection based on task complexity
3. Correct target module selection for model architecture
4. Adapter merging strategy for deployment
5. Quantization compatibility (QLoRA)
6. Save and load adapters separately

## Red Lines
- Full fine-tuning when PEFT works
- Too high rank wasting resources
- Too low rank losing capacity
- Wrong target modules for architecture
- Missing base model reference
- Not saving adapters separately

## Pattern: Production QLoRA Fine-Tuning
```python
from peft import (
    LoraConfig, get_peft_model, prepare_model_for_kbit_training,
    TaskType, PeftModel
)
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
import torch

# Quantization config
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

# Load quantized base model
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B",
    quantization_config=bnb_config,
    device_map="auto",
)
model = prepare_model_for_kbit_training(model)

# LoRA configuration
lora_config = LoraConfig(
    r=16,  # Rank
    lora_alpha=32,  # Scaling factor
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type=TaskType.CAUSAL_LM,
)

# Apply PEFT
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()  # ~0.1% of total

# Training happens here with Trainer...

# Save adapter only
model.save_pretrained("./lora-adapter")

# Load for inference
base_model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B")
model = PeftModel.from_pretrained(base_model, "./lora-adapter")

# Merge and unload for deployment
merged_model = model.merge_and_unload()
merged_model.save_pretrained("./merged-model")
```

## Integrates With
- **Training**: Transformers Trainer, TRL, Accelerate
- **Quantization**: bitsandbytes, GPTQ, AWQ
- **Models**: LLaMA, Mistral, BERT, T5
- **Deployment**: vLLM, TGI, Ollama

## Common Errors
| Error | Fix |
|-------|-----|
| `Target modules not found` | Check model architecture for correct module names |
| `Incompatible adapter` | Verify base model matches adapter |
| `OOM during training` | Use gradient checkpointing, reduce batch size |
| `Merge failed` | Ensure model is on same device, check dtypes |

## Prod Ready
- [ ] LoRA rank tuned for task complexity
- [ ] Target modules verified for architecture
- [ ] Adapter saved separately from base model
- [ ] Merge tested for deployment
- [ ] Quantization compatible (QLoRA)
- [ ] Trainable parameters < 1% of total
