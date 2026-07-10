# OpenSearch CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name opensearch -p 9200:9200 -p 9600:9600 \
  -e "discovery.type=single-node" \
  -e "OPENSEARCH_INITIAL_ADMIN_PASSWORD=Admin123!" \
  opensearchproject/opensearch:2.11
# Dashboards available separately
```

## Claude's Common Mistakes
1. **Elasticsearch patterns without adaptation** - ISM replaces ILM
2. **Security plugin disabled** - Required in production (enabled by default)
3. **No ISM policies** - Index State Management is OpenSearch's lifecycle
4. **Dynamic mapping in production** - Explicit mappings required
5. **Ignoring Performance Analyzer** - Built-in monitoring tool

## Correct Patterns (2026)
```json
// Index template with ISM policy
PUT _index_template/logs_template
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 2,
      "plugins.index_state_management.policy_id": "logs_policy"
    },
    "mappings": {
      "properties": {
        "timestamp": { "type": "date" },
        "level": { "type": "keyword" },
        "message": { "type": "text" },
        "service": { "type": "keyword" }
      }
    }
  }
}

// ISM policy (OpenSearch's ILM equivalent)
PUT _plugins/_ism/policies/logs_policy
{
  "policy": {
    "states": [
      {
        "name": "hot",
        "actions": [{ "rollover": { "min_size": "30gb" } }],
        "transitions": [{ "state_name": "warm", "conditions": { "min_index_age": "7d" } }]
      },
      {
        "name": "warm",
        "actions": [{ "replica_count": { "number_of_replicas": 0 } }],
        "transitions": [{ "state_name": "delete", "conditions": { "min_index_age": "30d" } }]
      },
      { "name": "delete", "actions": [{ "delete": {} }] }
    ]
  }
}
```

## Version Gotchas
- **vs Elasticsearch**: ISM not ILM; _plugins API paths differ
- **Security**: Always on; configure users/roles via Security plugin
- **ML Commons**: Built-in ML framework for embeddings/anomaly detection
- **k-NN**: Native vector search plugin

## What NOT to Do
- Do NOT assume Elasticsearch API paths work (use _plugins)
- Do NOT disable security plugin in production
- Do NOT skip ISM policies for time-series indices
- Do NOT use dynamic mapping in production

## Mapping Footguns (text vs keyword, analyzers, mapping explosion)
OpenSearch is an Apache-2.0 fork of Elasticsearch 7.10, so the mapping model —
and its footguns — are the same, but the `_plugins` API paths and defaults differ.

```json
PUT products
{
  "settings": {
    "index.mapping.total_fields.limit": 2000,   // cap dynamic mapping explosion
    "refresh_interval": "30s"
  },
  "mappings": {
    "dynamic": "strict",                          // reject unknown user-supplied keys
    "properties": {
      "status":  { "type": "keyword" },           // aggregate / sort / term
      "title":   {                                 // full-text AND facet
        "type": "text",
        "fields": { "raw": { "type": "keyword", "ignore_above": 256 } }
      }
    }
  }
}
```
- **`text` vs `keyword` — identical trap to Elasticsearch.** Aggregations, `sort`,
  and `term` need `keyword` (doc-values); `match` full-text needs `text`. Facet
  fields get a `keyword` sub-field. Enabling `fielddata` on `text` to "make aggs
  work" blows up heap — do not.
- **Analyzer mismatch (index vs query).** The `search_analyzer` must be compatible
  with the index-time `analyzer`; verify with the `_analyze` API. An `edge_ngram`
  index analyzer used as the search analyzer explodes each query into ngrams.
- **Mapping explosion.** Dynamic mapping over user-controlled JSON grows cluster
  state unbounded; use `dynamic: "strict"`/`false` + `total_fields.limit`.
  [opensearch.org mapping / index-templates docs, retrieved 2026-07-10; see References]

## Deep Pagination, k-NN & ISM Correctness
```json
// FOOTGUN: from+size deep pagination re-sorts (from+size) docs per shard and is
// rejected past index.max_result_window (default 10 000).
GET products/_search { "from": 50000, "size": 20 }        // slow / rejected

// RIGHT: search_after with a Point-In-Time for stable, cheap deep pagination.
POST /products/_search/point_in_time?keep_alive=2m
GET products/_search
{
  "size": 20,
  "pit": { "id": "<pit_id>", "keep_alive": "2m" },
  "sort": [ { "created_at": "desc" }, { "_shard_doc": "asc" } ],
  "search_after": [ 1720000000000, 42 ]
}

// k-NN vector field (native OpenSearch plugin — NOT the same as ES dense_vector).
PUT vectors
{
  "settings": { "index.knn": true },
  "mappings": { "properties": {
    "embedding": { "type": "knn_vector", "dimension": 384,
      "method": { "engine": "faiss", "name": "hnsw", "space_type": "l2" } } } }
}
```
- **Deep pagination.** `from`+`size` past `index.max_result_window` (default
  **10 000**) throws; use **`search_after`** with a **PIT** for consistent deep
  paging, `scroll` only for exports.
- **k-NN plugin for vectors.** Vector search uses the native **k-NN** plugin
  (`knn_vector` + `index.knn: true`), engine `faiss`/`nmslib`/`lucene`; the ES
  `dense_vector` mapping is NOT the same API. ML Commons adds embedding pipelines.
- **ISM, not ILM.** Lifecycle is **Index State Management** under
  `_plugins/_ism/policies/*` — copying an Elasticsearch ILM policy path silently
  no-ops. `refresh_interval` near-real-time semantics match ES (default 1s; don't
  `?refresh=true` per bulk write).
  [opensearch.org k-NN + ISM + search_after docs, retrieved 2026-07-10; see References]

## Security (Security plugin: RBAC/TLS, no public bind, script injection)
```json
// RIGHT: define a least-privilege role scoped to one index + document-level FLS.
PUT _plugins/_security/api/roles/readonly_products
{
  "cluster_permissions": [],
  "index_permissions": [
    { "index_patterns": ["products"],
      "allowed_actions": ["read"] }        // no write/manage
  ]
}
```
- **Security plugin is ON by default** (RBAC, TLS node-to-node + REST, audit log).
  The recurring breach class is a demo cluster started with
  `DISABLE_SECURITY_PLUGIN=true` bound to a public interface — every index is then
  readable. Keep the plugin enabled; issue least-privilege roles/users.
- **No public bind.** Do not expose 9200 to `0.0.0.0` on the internet; front with
  TLS and auth. Hard-coded admin credentials in code/images are **CWE-798** — use
  a secret store. [cwe.mitre.org/data/definitions/798.html, retrieved 2026-07-10]
- **Script injection.** Painless scripts built from untrusted input are injectable;
  parameterize via `params` and restrict script contexts on public query paths.

## Testing & Error Handling
```python
from opensearchpy import OpenSearch, helpers

client = OpenSearch(hosts=[{"host": "localhost", "port": 9200}],
                    http_auth=("admin", "..."), use_ssl=True, verify_certs=True)

# Bulk helper returns (success_count, errors); a partial failure does NOT raise.
success, errors = helpers.bulk(client, actions, raise_on_error=False)
assert not errors, f"bulk had failures: {errors[:3]}"

client.indices.refresh(index="products")   # make writes visible once, explicitly
```
- Inspect `helpers.bulk()` errors — partial failures drop docs without raising.
- Refresh once after test writes; never smuggle `?refresh=true` per write.

## Performance Traps
- **Filter context is cached and unscored** — put `term`/`range`/`bool.filter`
  predicates there; reserve query context for full-text relevance.
- **Deep `from`+`size`** and **per-write `?refresh=true`** are the two dominant
  latency cliffs (see above).
- **Over-sharding** balloons cluster state — target 10–50 GB per shard.

## Version-Specific Gotchas (dated, sourced)
- **OpenSearch 3.7.0** is the current stable release, published **2026-06-09**.
  [github.com/opensearch-project/OpenSearch/releases/latest, retrieved 2026-07-10]
- **License / lineage.** OpenSearch is **Apache 2.0**, a community fork of
  **Elasticsearch 7.10** created after Elastic moved ES to Elastic License/SSPL.
  This is why ES clients and `_plugins` API paths diverge — do NOT assume an
  Elasticsearch client or ILM policy path works unchanged against OpenSearch.
  [opensearch.org "About OpenSearch" / FAQ, retrieved 2026-07-10]
- **Security always on.** The Security plugin ships enabled; the
  `DISABLE_SECURITY_PLUGIN` dev shortcut is not a production option.

## References (retrieved 2026-07-10)
- OpenSearch releases: https://github.com/opensearch-project/OpenSearch/releases/latest
- About OpenSearch (license/lineage): https://opensearch.org/about.html
- Paginate results (search_after): https://opensearch.org/docs/latest/search-plugins/searching-data/paginate/
- k-NN vector search: https://opensearch.org/docs/latest/search-plugins/knn/index/
- Index State Management (ISM): https://opensearch.org/docs/latest/im-plugin/ism/index/
- Security plugin: https://opensearch.org/docs/latest/security/index/
- CWE-798 Use of Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
