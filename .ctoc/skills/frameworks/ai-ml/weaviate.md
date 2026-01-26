# Weaviate CTO
> Vector search with ML integration.

## Non-Negotiables
1. Schema definition
2. Vectorizer module selection
3. Multi-tenancy for scale
4. Hybrid search config
5. Backup strategy

## Red Lines
- Missing schema
- Wrong vectorizer
- No multi-tenancy for SaaS
- Ignoring hybrid search
- No RBAC setup

## Pattern
```python
import weaviate

client = weaviate.connect_to_local()
collection = client.collections.create(
    name="Document",
    vectorizer_config=Configure.Vectorizer.text2vec_openai(),
    properties=[Property(name="content", data_type=DataType.TEXT)]
)
```
