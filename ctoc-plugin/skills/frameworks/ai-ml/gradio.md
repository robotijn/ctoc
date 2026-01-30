# Gradio CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install gradio
# Run: python app.py
# Share publicly: gradio app.py --share
```

## Claude's Common Mistakes
1. Missing `queue()` for concurrent requests (blocks users)
2. No examples provided for user guidance
3. Using `Interface` when `Blocks` needed for complex UIs
4. Missing error handling with `gr.Error`
5. Not using streaming for LLM outputs

## Correct Patterns (2026)
```python
import gradio as gr
from typing import Generator

# Simple Interface with examples
def classify(image):
    if image is None:
        raise gr.Error("Please upload an image")
    return model.predict(image)

demo = gr.Interface(
    fn=classify,
    inputs=gr.Image(type="pil", label="Upload Image"),
    outputs=gr.Label(num_top_classes=5),
    examples=["examples/cat.jpg", "examples/dog.jpg"],  # Always provide examples
    title="Image Classifier",
)

# Complex Blocks with streaming
with gr.Blocks(theme=gr.themes.Soft()) as demo:
    gr.Markdown("# AI Assistant")

    with gr.Row():
        with gr.Column(scale=2):
            input_text = gr.Textbox(label="Input", lines=5)
            submit = gr.Button("Submit", variant="primary")
        with gr.Column(scale=3):
            output = gr.Textbox(label="Output", lines=10)

    # Streaming generator
    def generate(text: str) -> Generator[str, None, None]:
        response = ""
        for chunk in model.stream(text):
            response += chunk
            yield response  # Yield accumulated response

    submit.click(generate, inputs=input_text, outputs=output)

# ALWAYS enable queue for production
demo.queue(max_size=20).launch(server_name="0.0.0.0", server_port=7860)
```

## Version Gotchas
- **queue()**: Required for concurrent users - without it, requests block
- **Streaming**: Yield accumulated text, not just chunks
- **HuggingFace Spaces**: Deploy with `demo.launch()` in app.py
- **Auth**: Use `demo.launch(auth=("user", "pass"))` for basic auth

## What NOT to Do
- Do NOT skip `demo.queue()` in production
- Do NOT forget examples for inputs
- Do NOT use `Interface` for multi-step workflows
- Do NOT yield just chunks - yield accumulated response
- Do NOT skip error handling with `gr.Error`
