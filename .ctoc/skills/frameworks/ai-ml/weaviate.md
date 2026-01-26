# Weaviate CTO
> AI-native vector database with built-in ML model integration.

## Commands
```bash
# Setup | Dev | Test
pip install weaviate-client
docker run -d -p 8080:8080 semitechnologies/weaviate:latest
python -c "import weaviate; print(weaviate.connect_to_local().is_ready())"
```

## Non-Negotiables
1. Explicit schema definition with properties
2. Appropriate vectorizer module selection
3. Multi-tenancy for SaaS applications
4. Hybrid search configuration (vector + keyword)
5. Backup and restore strategy
6. RBAC setup for production

## Red Lines
- Missing schema causing auto-generation issues
- Wrong vectorizer for content type
- No multi-tenancy for multi-customer apps
- Ignoring hybrid search capabilities
- No access control in production
- Missing backup configuration

## Pattern: Production Vector Store
```python
import weaviate
from weaviate.classes.config import Configure, Property, DataType
from weaviate.classes.query import MetadataQuery, Filter

# Connect to Weaviate
client = weaviate.connect_to_local(
    headers={"X-OpenAI-Api-Key": "your-key"}
)

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
        Property(name="date", data_type=DataType.DATE),
    ],
    # Enable multi-tenancy
    multi_tenancy_config=Configure.multi_tenancy(enabled=True),
)

# Create tenant
collection.tenants.create("tenant_a")

# Insert with tenant
tenant_collection = collection.with_tenant("tenant_a")
tenant_collection.data.insert_many([
    {"title": "Doc 1", "content": "Content here", "source": "web"},
    {"title": "Doc 2", "content": "More content", "source": "api"},
])

# Hybrid search (vector + keyword)
results = tenant_collection.query.hybrid(
    query="machine learning basics",
    alpha=0.5,  # Balance vector/keyword
    limit=10,
    filters=Filter.by_property("source").equal("web"),
    return_metadata=MetadataQuery(score=True, distance=True),
)

# Generative search (RAG)
response = tenant_collection.generate.near_text(
    query="Explain machine learning",
    limit=3,
    grouped_task="Summarize these documents into a cohesive answer",
)
print(response.generated)

# Backup
client.backup.create(
    backup_id="backup-2024",
    backend="filesystem",
    include_collections=["Document"],
)

client.close()
```

## Integrates With
- **Vectorizers**: OpenAI, Cohere, HuggingFace, custom
- **Frameworks**: LangChain, LlamaIndex
- **Deployment**: Docker, Kubernetes, Weaviate Cloud
- **Auth**: OIDC, API keys, RBAC

## Common Errors
| Error | Fix |
|-------|-----|
| `Schema validation error` | Check property types and names |
| `Vectorizer module not enabled` | Enable in Docker config |
| `Tenant not found` | Create tenant before inserting |
| `Rate limit on vectorizer` | Use batch imports, add delays |

## Prod Ready
- [ ] Schema explicitly defined
- [ ] Vectorizer configured for content type
- [ ] Multi-tenancy enabled for SaaS
- [ ] Hybrid search configured
- [ ] RBAC configured
- [ ] Backup strategy implemented
