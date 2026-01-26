# bitsandbytes CTO
> Memory-efficient 8-bit and 4-bit quantization for LLMs.

## Commands
```bash
# Setup | Dev | Test
pip install bitsandbytes
python -c "import bitsandbytes as bnb; print(bnb.COMPILED_WITH_CUDA)"
python -c "from transformers import BitsAndBytesConfig; print('OK')"
```

## Non-Negotiables
1. 4-bit (NF4) for inference to minimize memory
2. 8-bit for training stability when needed
3. Use NF4 for better quality over FP4
4. Proper compute dtype (float16/bfloat16)
5. Double quantization for additional savings
6. Compatible PEFT integration

## Red Lines
- 4-bit training without proper setup (unstable)
- Missing compute dtype specification
- Ignoring memory savings opportunities
- No double quantization for large models
- Wrong quantization type for use case
- Incompatible CUDA versions

## Pattern: Production Quantization
```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import prepare_model_for_kbit_training, LoraConfig, get_peft_model

# 4-bit configuration for inference
bnb_config_4bit = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",  # NF4 for better quality
    bnb_4bit_compute_dtype=torch.bfloat16,  # Compute in bf16
    bnb_4bit_use_double_quant=True,  # Further memory savings
)

# 8-bit configuration for training stability
bnb_config_8bit = BitsAndBytesConfig(
    load_in_8bit=True,
    llm_int8_threshold=6.0,
    llm_int8_has_fp16_weight=False,
)

# Load model with 4-bit quantization
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B",
    quantization_config=bnb_config_4bit,
    device_map="auto",
    torch_dtype=torch.bfloat16,
)

# Prepare for k-bit training (QLoRA)
model = prepare_model_for_kbit_training(
    model,
    use_gradient_checkpointing=True,
)

# Add LoRA for fine-tuning quantized model
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    lora_dropout=0.05,
    bias="none",
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# Output: trainable params: 0.1% of total
```

## Integrates With
- **Training**: Transformers, PEFT, TRL
- **Models**: LLaMA, Mistral, BERT, T5
- **Hardware**: NVIDIA GPUs (Ampere+)
- **Inference**: vLLM (via conversion)

## Common Errors
| Error | Fix |
|-------|-----|
| `CUDA not available` | Install CUDA-compatible bitsandbytes |
| `Slow inference` | Check compute dtype matches model dtype |
| `OOM even with quantization` | Enable double_quant, reduce context |
| `NaN in training` | Switch to 8-bit or increase stability |

## Prod Ready
- [ ] Quantization type appropriate for use case
- [ ] Compute dtype matches training dtype
- [ ] Double quantization enabled for large models
- [ ] CUDA version compatible
- [ ] Memory savings validated
- [ ] PEFT integration tested
