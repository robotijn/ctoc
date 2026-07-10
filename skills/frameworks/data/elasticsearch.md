# Elasticsearch CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Server (security enabled by default in v8+)
docker run -d --name elastic -p 9200:9200 \
  -e "discovery.type=single-node" \
  -e "xpack.security.enabled=false" \
  elasticsearch:8.17.0

# Clients
pip install elasticsearch    # Python
npm install @elastic/elasticsearch  # Node.js
```

## Claude's Common Mistakes
1. **Dynamic mapping in production** - Explicit mappings prevent type conflicts
2. **Using v7 client on v8 cluster** - Client v9 requires ES v9; use compatibility mode
3. **Wildcard queries on text fields** - Extremely slow; use keyword subfields
4. **Missing ILM policies** - Indices grow unbounded without lifecycle management
5. **Security disabled carelessly** - v8+ has security ON by default

## Correct Patterns (2026)
```python
from elasticsearch import Elasticsearch

# v8+ connection (security enabled by default)
es = Elasticsearch(
    "https://localhost:9200",
    api_key="your-api-key",  # Preferred over basic auth
    verify_certs=True,
)

# Explicit mapping (never rely on dynamic mapping)
es.indices.create(index="products", body={
    "settings": {"number_of_shards": 3, "refresh_interval": "30s"},
    "mappings": {
        "properties": {
            "name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "category": {"type": "keyword"},
            "price": {"type": "float"},
            "created_at": {"type": "date"}
        }
    }
})

# Optimized query: filters before full-text
results = es.search(index="products", body={
    "query": {
        "bool": {
            "filter": [
                {"term": {"category": "electronics"}},
                {"range": {"price": {"gte": 100, "lte": 500}}}
            ],
            "must": [{"match": {"name": "wireless headphones"}}]
        }
    }
})
```

## Version Gotchas
- **v8->v9**: Client v9 only works with ES v9; use compatibility mode for v8
- **v8 security**: TLS and auth enabled by default; cannot be disabled in cloud
- **ILM required**: Set index lifecycle policies for time-series data
- **Shard sizing**: Target 10-50GB per shard; avoid oversharding

## What NOT to Do
- Do NOT use dynamic mapping in production (type conflicts)
- Do NOT run wildcard queries on analyzed text fields
- Do NOT use elasticsearch-py v9 with ES v8 cluster
- Do NOT skip ILM policies for growing indices

## Mapping Footguns (text vs keyword, mapping explosion, analyzers)
The mapping is the single largest source of "works in dev, wrong in prod" bugs.

```python
# FOOTGUN: a bare `text` field cannot be aggregated or sorted, and dynamic
# mapping guesses `text`+`keyword` for EVERY string — an unbounded field count.
es.indices.create(index="events", body={
    "settings": {
        # RIGHT: cap the field explosion; a document with 1000s of unique JSON
        # keys (e.g. user-supplied objects) otherwise creates 1000s of fields
        # and can OOM the cluster ("mapping explosion").
        "index.mapping.total_fields.limit": 2000,
    },
    "mappings": {
        # RIGHT: turn OFF dynamic mapping for user-controlled sub-objects.
        "dynamic": "strict",
        "properties": {
            # `text` = analyzed (full-text search). `keyword` = exact (aggs/sort/term).
            "status": {"type": "keyword"},                    # aggregate/sort/filter
            "title": {                                         # search AND aggregate
                "type": "text",
                "fields": {"raw": {"type": "keyword", "ignore_above": 256}},
            },
        },
    },
})
```
- **`text` vs `keyword` is the classic trap.** Aggregations, `sort`, and `term`
  queries require `keyword` (doc-values); running them on `text` errors or is
  disabled via `fielddata` (which blows up heap). Full-text `match` requires
  `text`. Give search-and-facet fields BOTH via a `keyword` sub-field.
- **Analyzer mismatch (index vs query).** The `search_analyzer` must be
  compatible with the `analyzer` used at index time or queries silently miss
  hits (e.g. an `edge_ngram` index analyzer must NOT also be the search
  analyzer, or every query fans out into ngrams). Test the analyzer with the
  `_analyze` API before shipping.
- **Mapping explosion / dynamic mapping.** Indexing user-controlled JSON with
  `dynamic: true` creates a field per key; the cluster state grows unbounded and
  a coordinating node can OOM. Use `dynamic: "strict"` (reject) or
  `dynamic: false` (store, don't index) plus `index.mapping.total_fields.limit`.
  [elastic.co mapping "explosion" / dynamic mapping docs, retrieved 2026-07-10; see References]

## Deep Pagination & Correctness (search_after, PIT, refresh_interval)
```python
# FOOTGUN: from+size deep pagination re-sorts (from+size) docs on EVERY shard.
# Past index.max_result_window (default 10 000) it throws; before that it is O(N)
# heap on each shard for large offsets.
es.search(index="products", body={"from": 50000, "size": 20, ...})  # rejected / slow

# RIGHT: search_after with a Point-In-Time (PIT) for stable, cheap deep scroll.
pit = es.open_point_in_time(index="products", keep_alive="2m")["id"]
page = es.search(body={
    "size": 20, "pit": {"id": pit, "keep_alive": "2m"},
    "sort": [{"created_at": "desc"}, {"_shard_doc": "asc"}],  # tiebreaker required
    "search_after": last_sort_values,   # cursor from the previous page's last hit
})
```
- **`from`+`size` is only safe for shallow paging.** The default
  `index.max_result_window` is **10 000**; raising it just moves the cliff and
  costs heap. Use **`search_after`** (with a PIT so the view is consistent across
  pages) for deep pagination, and legacy `scroll` only for full exports.
- **`refresh_interval` controls near-real-time visibility.** Indexed docs are NOT
  searchable until a refresh (default **1s**). Do NOT call `?refresh=true` per
  write in bulk ingest — it forces a segment flush per request and destroys
  throughput; set `refresh_interval: "30s"` (or `-1` during bulk load, then
  reset) instead.
- **Shard sizing.** Target **10–50 GB per shard** and keep shard count bounded
  (~20 shards per GB of JVM heap on a node); over-sharding balloons cluster state
  and slows every query.
  [elastic.co paginate-search-results (search_after / max_result_window) +
  near-real-time + size-your-shards docs, retrieved 2026-07-10; see References]

## Security (never expose unauthenticated; query-DSL & script injection)
```python
# FOOTGUN: string-building a query_string from user input — an attacker can inject
# operators, wildcards, or a heavy regexp (ReDoS-class denial) into the DSL.
q = {"query": {"query_string": {"query": user_input}}}   # UNSAFE

# RIGHT: use the typed `match`/`term` DSL and pass user text as a VALUE, never as
# query syntax; disallow `query_string`/`script` from untrusted callers.
q = {"query": {"match": {"title": {"query": user_input}}}}   # value, not syntax
```
- **Never expose an unauthenticated cluster to the network.** ES 8+ ships with
  the Security features (TLS + auth) ON by default; the recurring breach class is
  a cluster bound to `0.0.0.0` with `xpack.security.enabled=false` on the public
  internet, leaking every index. Bind to localhost/private subnet and use
  **API keys** (least-privilege, per-index) over basic auth.
- **Painless / stored-script injection.** Do not build `script` source from user
  input; parameterize via the `params` map. Restrict script contexts and consider
  disabling dynamic scripting for untrusted query paths. Hard-coded API keys in
  source are **CWE-798** (Use of Hard-coded Credentials) — inject via env/secret
  store. [cwe.mitre.org/data/definitions/798.html, retrieved 2026-07-10]

## Testing & Error Handling
```python
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk

# Bulk indexing MUST inspect per-item failures — bulk() returns (ok, errors) and
# a partial failure does NOT raise. Silently dropping the errors loses documents.
ok, errors = bulk(es, actions, raise_on_error=False, stats_only=False)
assert not errors, f"bulk indexing had failures: {errors[:3]}"

# Make writes visible in an integration test WITHOUT the per-write refresh footgun.
es.indices.refresh(index="products")   # explicit, once, after the test's writes
```
- Assert on `bulk()` errors — the happy path "succeeds" while dropping docs.
- In tests, index then call `indices.refresh()` once; never sprinkle
  `?refresh=true` (that is a production anti-pattern smuggled into tests).

## Performance Traps
- **Filter context caches; query context scores.** Put exact predicates
  (`term`/`range`/`bool.filter`) in filter context — they skip scoring and are
  cached in the filter bitset. Reserve `must`/`should` (query context) for
  full-text relevance only.
- **`_source` fetch + large `size`** re-materializes whole documents; request only
  needed fields (`_source` includes/excludes or `fields`) for wide docs.
- **`refresh=true` per write** and **deep `from`+`size`** are the two most common
  latency cliffs (see above).

## Version-Specific Gotchas (dated, sourced)
- **Elasticsearch 9.4.3** is the current stable release, published **2026-06-30**.
  The v9 clients (`elasticsearch-py` / `@elastic/elasticsearch` v9) target v9
  clusters; use the client's **compatibility mode** header to talk to a v8 cluster
  during migration. [github.com/elastic/elasticsearch/releases/latest, retrieved 2026-07-10]
- **Licensing fork.** Elasticsearch is NOT Apache-2.0: it ships under the
  **Elastic License 2.0 / SSPL**, and Elastic re-added an **AGPLv3** option in
  2024 ("open source again"). This is why OpenSearch exists as an Apache-2.0 fork
  of ES 7.10 — audit your license obligations before embedding.
  [elastic.co/blog "Elasticsearch is Open Source, Again", retrieved 2026-07-10]
- **Security on by default (8+).** TLS + auth cannot be silently disabled in Cloud;
  the `xpack.security.enabled=false` dev shortcut is not a production option.

## References (retrieved 2026-07-10)
- Elasticsearch releases: https://github.com/elastic/elasticsearch/releases/latest
- Paginate search results (search_after / max_result_window): https://www.elastic.co/guide/en/elasticsearch/reference/current/paginate-search-results.html
- Near real-time search: https://www.elastic.co/guide/en/elasticsearch/reference/current/near-real-time.html
- Size your shards: https://www.elastic.co/guide/en/elasticsearch/reference/current/size-your-shards.html
- Mapping / dynamic mapping: https://www.elastic.co/guide/en/elasticsearch/reference/current/dynamic-mapping.html
- Point in time API: https://www.elastic.co/guide/en/elasticsearch/reference/current/point-in-time-api.html
- "Elasticsearch is Open Source, Again" (license): https://www.elastic.co/blog/elasticsearch-is-open-source-again
- CWE-798 Use of Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
