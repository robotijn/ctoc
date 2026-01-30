# Weaviate CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install weaviate-client
# Docker: docker run -d -p 8080:8080 semitechnologies/weaviate:latest
# Verify: python -c "import weaviate; print(weaviate.__version__)"
```

## Claude's Common Mistakes
1. Using v3 API instead of v4 (`weaviate.connect_to_*`)
2. Missing vectorizer module configuration
3. Not enabling multi-tenancy for SaaS applications
4. Forgetting to close client connection
5. Using near_text without vectorizer configured

## Correct Patterns (2026)
```python
import weaviate
from weaviate.classes.config import Configure, Property, DataType
from weaviate.classes.query import MetadataQuery, Filter

# Connect (v4 API)
client = weaviate.connect_to_local(
    headers={"X-OpenAI-Api-Key": os.environ["OPENAI_API_KEY"]}
)
# Or: client = weaviate.connect_to_weaviate_cloud(cluster_url, auth_credentials)

try:
    # Create collection with schema
    collection = client.collections.create(
        name="Document",
        vectorizer_config=Configure.Vectorizer.text2vec_openai(
            model="text-embedding-3-small"
        ),
        generative_config=Configure.Generative.openai(model="gpt-4o"),
        properties=[
            Property(name="title", data_type=DataType.TEXT),
            Property(name="content", data_type=DataType.TEXT),
            Property(name="source", data_type=DataType.TEXT, skip_vectorization=True),
        ],
        multi_tenancy_config=Configure.multi_tenancy(enabled=True),
    )

    # Create tenant and insert
    collection.tenants.create("tenant_a")
    tenant_col = collection.with_tenant("tenant_a")

    tenant_col.data.insert_many([
        {"title": "Doc 1", "content": "Content here", "source": "web"},
    ])

    # Hybrid search (vector + keyword)
    results = tenant_col.query.hybrid(
        query="machine learning",
        alpha=0.5,  # 0=keyword, 1=vector
        limit=10,
        return_metadata=MetadataQuery(score=True),
    )

    # RAG with generative search
    response = tenant_col.generate.near_text(
        query="Explain ML",
        limit=3,
        grouped_task="Summarize these documents",
    )
    print(response.generated)

finally:
    client.close()  # ALWAYS close connection
```

## Version Gotchas
- **v4**: New API - use `weaviate.connect_to_*` not `Client()`
- **Vectorizers**: Must configure for near_text queries
- **Multi-tenancy**: Enable at collection creation time
- **Generative**: Requires generative module configured

## What NOT to Do
- Do NOT use v3 `Client()` API - use v4 `connect_to_*`
- Do NOT forget to close client connection
- Do NOT use near_text without vectorizer configured
- Do NOT skip multi-tenancy for SaaS applications
- Do NOT forget to create tenant before inserting
