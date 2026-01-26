# Gradio CTO
> Build and share ML demos in minutes with production-ready interfaces.

## Commands
```bash
# Setup | Dev | Test
pip install gradio
python app.py  # Local development
gradio app.py --share  # Public URL for testing
```

## Non-Negotiables
1. Use `Interface` for simple single-function demos
2. Use `Blocks` for complex multi-component UIs
3. Include examples for better UX
4. Deploy to HuggingFace Spaces for hosting
5. Add input validation and error handling
6. Use `queue()` for concurrent requests

## Red Lines
- No examples for user guidance
- Blocking functions without queue()
- Missing error handling
- No input validation
- Exposing sensitive model internals
- Not using progress indicators for slow ops

## Pattern: Production ML Demo
```python
import gradio as gr
from typing import Generator

# Simple Interface
def classify(image):
    # Validation
    if image is None:
        raise gr.Error("Please upload an image")

    result = model.predict(image)
    return {label: float(score) for label, score in result}

demo = gr.Interface(
    fn=classify,
    inputs=gr.Image(type="pil", label="Upload Image"),
    outputs=gr.Label(num_top_classes=5),
    examples=["examples/cat.jpg", "examples/dog.jpg"],
    title="Image Classifier",
    description="Upload an image to classify",
)

# Complex Blocks layout
with gr.Blocks(theme=gr.themes.Soft()) as demo:
    gr.Markdown("# ML Assistant")

    with gr.Row():
        with gr.Column(scale=2):
            input_text = gr.Textbox(label="Input", lines=5)
            with gr.Row():
                submit_btn = gr.Button("Submit", variant="primary")
                clear_btn = gr.Button("Clear")

        with gr.Column(scale=3):
            output_text = gr.Textbox(label="Output", lines=10)
            confidence = gr.Slider(label="Confidence", interactive=False)

    # Streaming output
    def generate(text: str) -> Generator[str, None, None]:
        for chunk in model.stream(text):
            yield chunk

    submit_btn.click(generate, inputs=input_text, outputs=output_text)
    clear_btn.click(lambda: ("", ""), outputs=[input_text, output_text])

demo.queue().launch(server_name="0.0.0.0", server_port=7860)
```

## Integrates With
- **Hosting**: HuggingFace Spaces, Docker
- **Models**: PyTorch, TensorFlow, Transformers
- **APIs**: FastAPI, Flask
- **Auth**: HuggingFace OAuth, custom auth

## Common Errors
| Error | Fix |
|-------|-----|
| `Queue full` | Increase `max_size` in queue() |
| `Timeout` | Increase default timeout, use streaming |
| `Memory error` | Clear GPU cache between requests |
| `CORS error` | Set allowed_paths in launch() |

## Prod Ready
- [ ] Examples provided for all inputs
- [ ] Queue enabled for concurrent requests
- [ ] Error handling for all user inputs
- [ ] Progress indicators for slow operations
- [ ] Deployed to HuggingFace Spaces
- [ ] Authentication configured if needed
