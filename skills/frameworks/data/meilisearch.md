# Meilisearch CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name meilisearch -p 7700:7700 \
  -e MEILI_MASTER_KEY=masterkey \
  getmeili/meilisearch:v1.6
# Dashboard at http://localhost:7700
```

## Claude's Common Mistakes
1. **All attributes searchable** - Configure searchableAttributes for relevance
2. **Filtering without filterableAttributes** - Must set before querying
3. **No API key in production** - Master key required; generate search keys
4. **Sorting without sortableAttributes** - Must configure explicitly
5. **Large documents** - Split or reduce document size

## Correct Patterns (2026)
```javascript
import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({
  host: 'http://localhost:7700',
  apiKey: 'masterkey',
});

// Configure index settings (order matters for relevance!)
await client.index('products').updateSettings({
  searchableAttributes: ['name', 'description', 'category', 'brand'],
  filterableAttributes: ['category', 'brand', 'price', 'in_stock'],
  sortableAttributes: ['price', 'created_at', 'popularity'],
  rankingRules: [
    'words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'
  ],
});

// Add documents
await client.index('products').addDocuments(products);

// Search with filters and facets
const results = await client.index('products').search('wireless headphones', {
  filter: ['category = electronics', 'price < 500', 'in_stock = true'],
  facets: ['brand', 'category'],
  sort: ['price:asc'],
  limit: 20,
  offset: 0,
});
```

## Version Gotchas
- **v1.6+**: Hybrid search (keyword + vector) support
- **v1.6+**: Multi-index search in single query
- **Typo tolerance**: Built-in; configurable per attribute
- **Instant Search**: InstantSearch.js components work out of box

## What NOT to Do
- Do NOT leave all attributes searchable (poor relevance)
- Do NOT filter without setting filterableAttributes first
- Do NOT expose master key to clients (generate search-only keys)
- Do NOT skip pagination (use limit/offset)

## Settings Footguns (declare attributes; settings vs documents)
In Meilisearch the *index settings* are a separate resource from the *documents*.
Forgetting to declare an attribute is the #1 "why is my filter/sort ignored" bug.

```javascript
// FOOTGUN: filtering/sorting on an attribute you never declared -> the query
// FAILS with "attribute X is not filterable", not a silent empty result.
await client.index('products').search('shoes', { filter: 'price < 500' });  // errors

// RIGHT: declare filterable/sortable/searchable BEFORE (or alongside) indexing.
await client.index('products').updateSettings({
  searchableAttributes: ['name', 'description', 'brand'],  // ORDER = attribute ranking
  filterableAttributes: ['category', 'brand', 'price', 'in_stock'],
  sortableAttributes: ['price', 'created_at', 'popularity'],
  distinctAttribute: 'sku',                                 // de-dup variants
  // rankingRules ORDER matters — see below.
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
});
```
- **Attributes must be declared to be usable.** `filterableAttributes`,
  `sortableAttributes`, and `searchableAttributes` are index settings; querying an
  undeclared attribute raises. Leaving `searchableAttributes` at the default `["*"]`
  makes every field searchable and wrecks relevance — list only the fields you
  rank on, in priority order.
- **Settings updates are async tasks.** `updateSettings` returns a `taskUid`;
  the change (and any re-index it triggers) is not applied until the task
  finishes — `await client.waitForTask(task.taskUid)` before asserting in tests.
- **Settings live independently of documents** — re-adding documents does not
  reset settings, and updating settings on a large index re-indexes in the
  background.
  [meilisearch.com filtering/sorting/searchable-attributes docs, retrieved 2026-07-10; see References]

## Correctness (ranking rules order, typo tolerance, pagination cap)
```javascript
// Ranking rules are applied TOP-DOWN as tiebreakers; reordering changes results.
await client.index('products').updateSettings({
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 },
    disableOnAttributes: ['sku'],           // never typo-correct exact codes
  },
});

const res = await client.index('products').search('wireles', {
  filter: 'price < 500 AND in_stock = true',
  sort: ['price:asc'],
  limit: 20, offset: 40,                     // offset pagination is capped, see below
});
```
- **`rankingRules` order is the relevance contract** — moving `sort` above
  `exactness`, or dropping `words`/`typo`, silently changes result ordering.
  Put custom rules (e.g. `popularity:desc`) at the position that should break ties.
- **Typo tolerance** is tunable via `minWordSizeForTypos` and
  `disableOnAttributes` — disable it on SKUs/ids so a typo-correction doesn't match
  the wrong document.
- **Offset pagination is capped by `maxTotalHits`** (default **1000**). `offset`
  past that returns nothing; for exhaustive/deep traversal use keyset-style
  filtering or raise `maxTotalHits` deliberately (it costs memory/latency).
  [meilisearch.com ranking-rules + typo-tolerance + pagination docs, retrieved 2026-07-10; see References]

## Security (tenant tokens & scoped keys — never expose the master key)
```javascript
// FOOTGUN: shipping the master key to a browser = full admin (create/delete
// indexes, read every tenant). Embedding it in a bundle is CWE-798.
const client = new MeiliSearch({ host, apiKey: MASTER_KEY /* in frontend */ });  // UNSAFE

// RIGHT: (1) derive a search API key from the master key server-side, (2) mint a
// TENANT TOKEN that embeds a mandatory filter — a tenant can only see its rows.
const searchKey = (await admin.getKeys()).results
  .find((k) => k.actions.includes('search')).uid;

const tenantToken = await admin.generateTenantToken(searchKey, {
  products: { filter: `tenant_id = ${tenantId}` },     // enforced server-side
}, { expiresAt: new Date(Date.now() + 3600_000) });
// Ship tenantToken to the browser; the filter cannot be removed by the client.
```
- **Never expose the master key.** Derive least-privilege API keys (scoped to
  `search` on specific indexes) and, for multi-tenant search, mint **tenant
  tokens** that embed a mandatory `filter` and an expiry — the client cannot widen
  its scope. Hard-coding the master key in source/bundle is **CWE-798** (Use of
  Hard-coded Credentials). [cwe.mitre.org/data/definitions/798.html, retrieved 2026-07-10]
- Serve over TLS; rotate keys via the Keys API rather than restarting with a new
  `MEILI_MASTER_KEY`.

## Testing & Error Handling
```javascript
import { MeiliSearchApiError } from 'meilisearch';

// Indexing and settings are ASYNC tasks — you MUST await the task, or assertions
// race the (not-yet-applied) change and pass/fail nondeterministically.
const task = await client.index('products').addDocuments(docs);
const done = await client.waitForTask(task.taskUid);
assert.equal(done.status, 'succeeded', JSON.stringify(done.error));

try {
  await client.index('products').search('x', { filter: 'undeclared > 1' });
} catch (e) {
  assert.ok(e instanceof MeiliSearchApiError);   // undeclared filterable -> fail loudly
}
```
- **Always `waitForTask`** on add/update/settings — every write is a background
  task; skipping the wait is the classic flaky-test cause here.
- Assert `task.status === 'succeeded'` and surface `task.error`; a failed task does
  NOT throw at enqueue time.

## Performance Traps
- **`searchableAttributes: ["*"]`** searches every field — restrict to ranked
  fields for both relevance and speed.
- **High `maxTotalHits` + deep `offset`** re-scans the window each request; cap the
  window and paginate shallowly or filter down.
- **Large documents** inflate the index — store only searchable/returnable fields,
  keep blobs elsewhere.

## Version-Specific Gotchas (dated, sourced)
- **Meilisearch v1.49.0** is the current stable release, published **2026-07-06**.
  Pin the Docker tag (`getmeili/meilisearch:v1.49`) rather than `latest` so a
  settings-affecting bump is explicit.
  [github.com/meilisearch/meilisearch/releases/latest, retrieved 2026-07-10]
- **Hybrid (keyword + vector) search** and multi-index (`multiSearch`) queries are
  supported on modern 1.x servers; you do not need a separate vector store for
  basic semantic search. [meilisearch.com hybrid-search / multi-search docs, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Meilisearch releases: https://github.com/meilisearch/meilisearch/releases/latest
- Filtering & sorting (declare attributes): https://www.meilisearch.com/docs/learn/filtering_and_sorting/filter_search_results
- Ranking rules: https://www.meilisearch.com/docs/learn/relevancy/ranking_rules
- Typo tolerance: https://www.meilisearch.com/docs/learn/relevancy/typo_tolerance_settings
- Pagination (maxTotalHits): https://www.meilisearch.com/docs/learn/front_end/pagination
- Tenant tokens: https://www.meilisearch.com/docs/learn/security/tenant_tokens
- CWE-798 Use of Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
