# LlamaIndex CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Core + OpenAI integration (most common)
pip install llama-index llama-index-llms-openai llama-index-embeddings-openai
# Note: llama-index-core and llama-index are separate packages
# Verify: python -c "from llama_index.core import VectorStoreIndex; print('OK')"
```

## Claude's Common Mistakes
1. Using old `from llama_index import` instead of `from llama_index.core`
2. Missing provider packages (`llama-index-llms-openai` etc.)
3. Not configuring `Settings` global for LLM/embedding defaults
4. Using deprecated agent classes (FunctionCallingAgent, AgentRunner removed)
5. Default chunk sizes without tuning for content type

## Correct Patterns (2026)
```python
from llama_index.core import VectorStoreIndex, Settings, SimpleDirectoryReader
from llama_index.core.node_parser import SentenceSplitter
from llama_index.llms.openai import OpenAI
from llama_index.embeddings.openai import OpenAIEmbedding

# Configure global settings (required in 2026)
Settings.llm = OpenAI(model="gpt-4o", temperature=0)
Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")
Settings.node_parser = SentenceSplitter(chunk_size=512, chunk_overlap=50)

# Build index
documents = SimpleDirectoryReader("./data").load_data()
index = VectorStoreIndex.from_documents(documents)

# Query with reranking
from llama_index.core.postprocessor import SentenceTransformerRerank
reranker = SentenceTransformerRerank(model="cross-encoder/ms-marco-MiniLM-L-6-v2", top_n=3)

query_engine = index.as_query_engine(
    similarity_top_k=10,
    node_postprocessors=[reranker],
)
response = query_engine.query("What are the key findings?")
```

## Version Gotchas
- **2025-2026**: `llama-index-workflows` bumped to v2.0 (breaking)
- **Removed**: FunctionCallingAgent, AgentRunner, OpenAIAgent - use Workflows
- **Imports**: Always use `from llama_index.core` not `from llama_index`
- **Providers**: Each LLM/embedding needs separate package install

## What NOT to Do
- Do NOT use `from llama_index import` - use `from llama_index.core`
- Do NOT skip `Settings` configuration for LLM/embeddings
- Do NOT use deprecated agent classes - use Workflows API
- Do NOT use default chunk sizes without testing retrieval quality
- Do NOT forget to install provider packages separately
