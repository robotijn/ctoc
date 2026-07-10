# Typesense CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name typesense -p 8108:8108 \
  typesense/typesense:26.0 \
  --data-dir=/data --api-key=xyz
# Health check: http://localhost:8108/health
```

## Claude's Common Mistakes
1. **Missing schema field definitions** - Typesense requires explicit schema
2. **No facet on filter fields** - Must set `facet: true` in schema
3. **Admin key exposed to clients** - Generate search-only API keys
4. **Single node in production** - Use 3+ nodes for HA
5. **Pagination missing** - Always use per_page and page

## Correct Patterns (2026)
```javascript
import Typesense from 'typesense';

const client = new Typesense.Client({
  nodes: [{ host: 'localhost', port: 8108, protocol: 'http' }],
  apiKey: 'xyz',
});

// Create collection with explicit schema
await client.collections().create({
  name: 'products',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'name', type: 'string' },
    { name: 'description', type: 'string' },
    { name: 'category', type: 'string', facet: true },
    { name: 'brand', type: 'string', facet: true },
    { name: 'price', type: 'float', facet: true },
    { name: 'in_stock', type: 'bool', facet: true },
    { name: 'popularity', type: 'int32' },
    { name: 'embedding', type: 'float[]', num_dim: 384, optional: true },
  ],
  default_sorting_field: 'popularity',
});

// Search with filters and facets
const results = await client.collections('products').documents().search({
  q: 'wireless headphones',
  query_by: 'name,description,brand',
  filter_by: 'category:=electronics && price:<500 && in_stock:true',
  facet_by: 'category,brand',
  sort_by: 'popularity:desc',
  per_page: 20,
  page: 1,
});

// Curation rules for search quality
await client.collections('products').overrides().upsert('promote-featured', {
  rule: { query: 'headphones', match: 'contains' },
  includes: [{ id: 'featured-123', position: 1 }],
});
```

## Version Gotchas
- **v26+**: Native vector search with embedding field type
- **Conversational search**: Built-in RAG support
- **Geo search**: Built-in with geopoint field type
- **HA**: 3+ nodes with Raft consensus

## What NOT to Do
- Do NOT skip explicit schema definition
- Do NOT forget `facet: true` on filter fields
- Do NOT expose admin API key to clients
- Do NOT run single node in production (no HA)

## Schema Footguns (typed fields, sort/facet flags, default_sorting_field)
Typesense enforces a typed schema up front — the footguns are declaring the wrong
flags, which produce *silent* "field is not X"-style query rejections at runtime.

```javascript
await client.collections().create({
  name: 'products',
  fields: [
    { name: 'name',        type: 'string'  },
    { name: 'brand',       type: 'string', facet: true },   // facet:true REQUIRED to facet_by
    { name: 'price',       type: 'float',  facet: true, sort: true },
    // int32/float are sortable by default; STRING fields need sort:true explicitly
    { name: 'sku',         type: 'string', sort: true },
    { name: 'created_at',  type: 'int64'   },                // store dates as epoch for range/sort
    { name: 'popularity',  type: 'int32'   },
    { name: 'tags',        type: 'string[]', facet: true },
  ],
  // default_sorting_field MUST be a numeric, non-optional field, else creation fails
  default_sorting_field: 'popularity',
});
```
- **`facet: true` gates `facet_by`; `sort: true` gates string sorting.** Numeric
  fields sort by default, but a `string` field errors on `sort_by` unless declared
  `sort: true`. Faceting a field without `facet: true` returns an error, not empty.
- **`default_sorting_field` must be a numeric, required field** — pointing it at an
  `optional` or string field fails collection creation.
- **Missing/extra fields.** With the default schema, documents with unknown fields
  are rejected; use a `.*` wildcard field or `auto` types deliberately, not by
  accident. Changing a field's type requires re-creating (or aliasing) the
  collection — plan an alias swap for zero-downtime reindex.
  [typesense.org api/collections (schema, sort, facet, default_sorting_field) docs, retrieved 2026-07-10; see References]

## Correctness (query_by weights, filter_by, typo tolerance, pagination)
```javascript
const results = await client.collections('products').documents().search({
  q: 'wireles hedphones',                      // typos tolerated (see num_typos)
  query_by: 'name,brand,description',           // ORDER = search priority
  query_by_weights: '4,2,1',                    // name matches outrank description
  filter_by: 'price:<500 && brand:=[Sony,Bose] && in_stock:true',
  sort_by: '_text_match:desc,popularity:desc',  // relevance then tiebreak
  num_typos: '2,1,0',                           // per-field typo budget
  typo_tokens_threshold: 1,
  per_page: 24, page: 3,                         // page-based; max window applies
});
```
- **`query_by` order and `query_by_weights` drive relevance.** Listing fields in
  the wrong order (or omitting weights) makes a description match outrank an exact
  name match. `filter_by` uses `:=` for exact, `:` for match, `[]` for OR, `&&`
  for AND — mixing `:` and `:=` on a `string` facet is a common silent mis-filter.
- **Typo tolerance is per-field via `num_typos`** (and `typo_tokens_threshold`);
  set `num_typos: 0` on codes/SKUs so a "typo-corrected" SKU doesn't match the
  wrong product. `symbols_to_index` controls whether `+`, `#`, etc. are searchable
  (e.g. index `#` to search `c#`).
- **Pagination is `page`/`per_page`**; there is a bounded result window — for very
  deep pagination prefer a narrower `filter_by` or exhaustive export, not page
  10 000.
  [typesense.org api/search (query_by / filter_by / num_typos / symbols_to_index) docs, retrieved 2026-07-10; see References]

## Security (scoped search-only API keys — never expose the admin key)
```javascript
// FOOTGUN: shipping the admin (bootstrap) key to a browser = full read/write to
// every collection. This is CWE-798 (Use of Hard-coded Credentials) when embedded.
const client = new Typesense.Client({ apiKey: ADMIN_KEY /* in frontend */ });  // UNSAFE

// RIGHT: (1) create a search-ONLY key server-side, (2) derive a SCOPED key that
// embeds a mandatory filter so a tenant can only ever see its own documents.
const searchKey = (await admin.keys().create({
  description: 'search-only',
  actions: ['documents:search'],
  collections: ['products'],
})).value;

// Scoped key = HMAC of an embedded search params object; the filter cannot be
// removed by the client. Safe to ship to the browser.
const scoped = Typesense.Client.prototype
  .keys()
  .generateScopedSearchKey(searchKey, { filter_by: `tenant_id:=${tenantId}` });
```
- **Never send the admin key to a client.** Create a key with only
  `documents:search` scoped to specific collections, then derive a **scoped search
  key** that embeds a mandatory `filter_by` (e.g. `tenant_id`) — the browser gets
  the scoped key and cannot widen its access. Hard-coding the admin key in source
  or a bundle is **CWE-798**. [cwe.mitre.org/data/definitions/798.html, retrieved 2026-07-10]
- Serve Typesense over TLS; rotate keys via the Keys API rather than restarting
  with a new `--api-key`.

## Testing & Error Handling
```javascript
import { ObjectNotFound, RequestMalformed } from 'typesense/lib/Typesense/Errors';

try {
  await client.collections('products').documents().import(batch, { action: 'upsert' });
} catch (e) {
  // import() returns a per-line result array; a partial failure does NOT throw as
  // one error — inspect each line's { success } and surface the failures.
  if (e instanceof RequestMalformed) throw e;   // schema mismatch — fail loudly
}
const res = await client.collections('products').documents().import(batch, { action: 'upsert' });
const failures = res.filter((r) => !r.success);
assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 3)));
```
- **`import()` reports per-document success** — a bad row in a batch does not throw;
  assert every line's `success` or you silently drop documents.
- Catch `ObjectNotFound` / `RequestMalformed` explicitly; a malformed schema should
  fail the test, not be swallowed.

## Performance Traps
- **`query_by` field count and `**highlight**` fields** cost per query — search only
  the fields you rank on, not every string field.
- **Faceting high-cardinality fields** (e.g. a unique id) is expensive; facet only
  low-cardinality attributes and use `max_facet_values`.
- **Deep `page`** re-materializes the window each request — narrow with `filter_by`.

## Version-Specific Gotchas (dated, sourced)
- **Typesense v30.2** is the current stable release, published **2026-04-19**
  (the project versions its server independently of client SDKs). Pin the Docker
  tag (`typesense/typesense:30.2`) rather than `latest` so a schema-affecting bump
  is explicit. [github.com/typesense/typesense/releases/latest, retrieved 2026-07-10]
- **Native vector search** (`float[]` field + `num_dim`) and conversational/RAG
  search are built in on modern (v26+) servers; do not add an external vector store
  for basic semantic search. [typesense.org vector-search docs, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Typesense releases: https://github.com/typesense/typesense/releases/latest
- Collections / schema: https://typesense.org/docs/latest/api/collections.html
- Search (query_by / filter_by / typo): https://typesense.org/docs/latest/api/search.html
- API keys (scoped search keys): https://typesense.org/docs/latest/api/api-keys.html
- Vector search: https://typesense.org/docs/latest/api/vector-search.html
- CWE-798 Use of Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
