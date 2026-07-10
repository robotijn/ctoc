# Couchbase CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name couchbase -p 8091-8096:8091-8096 -p 11210:11210 couchbase:enterprise-7.2
# Web console at http://localhost:8091
# Python SDK
pip install couchbase
```

## Claude's Common Mistakes
1. **Missing GSI indexes** - Full bucket scans without indexes
2. **No prepared statements** - Prevents query plan caching
3. **Document design without type** - Use type field for filtering
4. **Large documents (>20MB)** - Exceeds practical limits
5. **Ignoring N1QL explain** - Check index usage before production

## Correct Patterns (2026)
```sql
-- Document key design: type::id
-- Key: "user::123"
{
  "type": "user",
  "email": "alice@example.com",
  "name": "Alice"
}

-- Create GSI for queries (REQUIRED)
CREATE INDEX idx_users_email ON bucket(email) WHERE type = "user";
CREATE INDEX idx_orders_user ON bucket(userId, createdAt DESC) WHERE type = "order";

-- Prepared statement for hot queries
PREPARE user_by_email AS
SELECT META().id, * FROM bucket
WHERE type = "user" AND email = $email;

EXECUTE user_by_email USING {"email": "alice@example.com"};

-- N1QL with proper index usage
SELECT o.*, u.name AS customerName
FROM bucket o
JOIN bucket u ON KEYS "user::" || o.userId
WHERE o.type = "order" AND o.status = "pending"
ORDER BY o.createdAt DESC
LIMIT 20;
```

## Version Gotchas
- **v7.2+**: Vector search support, improved SQL++ (N1QL)
- **Capella**: Managed cloud service with auto-scaling
- **Eventing**: Server-side functions for triggers
- **Mobile**: Couchbase Lite for offline-first apps

## What NOT to Do
- Do NOT query without GSI indexes (full bucket scan)
- Do NOT skip prepared statements for repeated queries
- Do NOT store documents >20MB
- Do NOT ignore EXPLAIN output for queries

## Modeling Footguns (buckets → scopes → collections, KV vs query)
Couchbase 7.x organizes data as **bucket → scope → collection** (analogous to a
database → schema → table). Collections give you per-entity isolation, RBAC scope,
and independent indexes — dumping every document into `_default._default` with a
`type` field is the legacy pattern and costs you all of that.

```python
from couchbase.cluster import Cluster
from couchbase.auth import PasswordAuthenticator
from couchbase.options import ClusterOptions

cluster = Cluster('couchbase://localhost',
                  ClusterOptions(PasswordAuthenticator('app', 'secret')))
bucket = cluster.bucket('app')
users = bucket.scope('ecommerce').collection('users')   # scoped collection

# KV (key-value) path — direct, sub-millisecond, NO index needed. Use it whenever
# you have the document key. Reaching for N1QL to fetch by id is the top waste.
doc = users.get('user::123').content_as[dict]           # RIGHT: KV get by key

# Sub-document op — mutate ONE field without reading/rewriting the whole document.
from couchbase.subdocument import upsert as sd_upsert
users.mutate_in('user::123', [sd_upsert('last_login', '2026-07-10')])
```

- **KV vs query:** if you know the key, use a **KV get/upsert** (no index, no query
  service). N1QL/SQL++ is for *ad-hoc predicates you don't have a key for* — and it
  **requires an index or it does a full collection scan** (or errors if no primary
  index exists).
- **Sub-document operations** (`lookup_in`/`mutate_in`) fetch/patch a path inside a
  document — far cheaper than read-modify-write of a whole doc, and they avoid
  lost-update races on unrelated fields.
- Keep documents well under the **20 MB** hard limit; model large collections as
  separate documents keyed for KV access rather than one giant array.
  [docs.couchbase.com — scopes & collections / SDK KV & subdoc, retrieved
  2026-07-10; see References]

## Indexing — N1QL requires an index (else full scan)
```sql
-- FOOTGUN: a query with no covering index → full collection scan (or "No index
-- available" error if there's no primary index). Never ship a primary-index-only
-- query to production.
SELECT name FROM `app`.ecommerce.users WHERE email = "a@b.com";  -- scan without idx

-- RIGHT: a GSI on the predicate columns; INCLUDE the projected cols to make it a
-- COVERING index (served entirely from the index, no KV fetch).
CREATE INDEX idx_users_email
  ON `app`.ecommerce.users(email) INCLUDE (name);

-- Always EXPLAIN before shipping — confirm an IndexScan, not a PrimaryScan/fetch.
EXPLAIN SELECT name FROM `app`.ecommerce.users WHERE email = "a@b.com";
```
- A **primary index is a convenience for dev, an anti-pattern in prod** — it makes
  every unindexed query "work" by scanning everything. Drop it in production and
  create purpose-built GSIs.

## Consistency — scan_consistency (index staleness)
Couchbase's Global Secondary Indexes are updated **asynchronously**, so a query
right after a KV write may not see it. `scan_consistency` controls the tradeoff:

```python
from couchbase.options import QueryOptions
from couchbase.n1ql import QueryScanConsistency

# NOT_BOUNDED (default): fastest, may read a STALE index (miss a just-written doc).
scope = bucket.scope('ecommerce')
scope.query("SELECT name FROM users WHERE email=$e",
            QueryOptions(named_parameters={'e': email}))

# REQUEST_PLUS: index is brought up to date with all mutations issued BEFORE the
# query — read-your-writes, at a latency cost. Use for correctness-critical reads.
scope.query("SELECT name FROM users WHERE email=$e",
            QueryOptions(named_parameters={'e': email},
                         scan_consistency=QueryScanConsistency.REQUEST_PLUS))
```
- Default **`NOT_BOUNDED`** is fine for dashboards/analytics; use **`REQUEST_PLUS`**
  when a user must see their own just-made change. Don't blanket-set `REQUEST_PLUS`
  — it serializes queries behind index maintenance.
- **Durability** on writes: `PersistTo`/`ReplicateTo` or the 7.x majority-based
  durability (`durability_level=MAJORITY`) trade write latency for the guarantee
  the mutation survived a node loss. Speed vs safety is an explicit per-write choice.
  [docs.couchbase.com — scan consistency & durability, retrieved 2026-07-10; see References]

## Security — parameterized N1QL & RBAC (CWE-943)
N1QL/SQL++ is a query language over documents, so string-building a query with user
input is **CWE-943** (Improper Neutralization of Special Elements in Data Query
Logic — the NoSQL-injection class).

```python
# FOOTGUN (CWE-943): user input concatenated into N1QL → NoSQL injection
q = f'SELECT * FROM users WHERE email = "{email}"'   # "" OR 1=1 -- → data leak
scope.query(q)

# RIGHT: named or positional parameters — the SDK/query service binds them safely
scope.query('SELECT * FROM users WHERE email = $email',
            QueryOptions(named_parameters={'email': email}))
scope.query('SELECT * FROM users WHERE email = $1',
            QueryOptions(positional_parameters=[email]))
```
- **RBAC:** grant roles scoped to the exact bucket/scope/collection
  (`query_select[app:ecommerce:users]`), never the `Admin` role to an app. Create a
  dedicated least-privilege user per service.
- Enable TLS (`couchbases://`) and rotate credentials; never embed the admin
  password in the connection string checked into source. [cwe.mitre.org/data/definitions/943.html
  + docs.couchbase.com RBAC, retrieved 2026-07-10; see References]

## Testing
```python
import pytest
from testcontainers.couchbase import CouchbaseContainer
from couchbase.cluster import Cluster
from couchbase.auth import PasswordAuthenticator
from couchbase.options import ClusterOptions, QueryOptions
from couchbase.n1ql import QueryScanConsistency

@pytest.fixture(scope="session")
def scope():
    with CouchbaseContainer("couchbase:community-7.6") as cb:
        cluster = Cluster(cb.get_connection_string(),
                          ClusterOptions(PasswordAuthenticator(
                              cb.username, cb.password)))
        yield cluster.bucket('app').scope('_default')

def test_read_your_writes_needs_request_plus(scope):
    coll = scope.collection('_default')
    coll.upsert('user::42', {'email': 'x@y.z'})
    # REQUEST_PLUS guarantees the just-upserted doc is visible to the index query
    res = scope.query('SELECT email FROM _default WHERE META().id = "user::42"',
                      QueryOptions(scan_consistency=QueryScanConsistency.REQUEST_PLUS))
    assert [r for r in res]   # non-empty: read-your-writes held
```
- Use a real Couchbase container — index async behavior, `scan_consistency`, and KV
  vs query semantics cannot be mocked faithfully. Test the staleness contract you rely on.

## Performance
- **Prefer KV** for key-known access (sub-millisecond, index-free); reserve N1QL for
  ad-hoc predicates.
- **Covering indexes** (`INCLUDE` the projected columns) serve the whole query from
  the index memory, skipping the KV fetch — the biggest N1QL speedup.
- **Prepared / adhoc=False** statements cache the query plan; re-parsing a hot query
  every call is pure overhead.
- Keep documents small and use **sub-document ops** to avoid shipping/rewriting whole
  documents. Watch index memory (GSIs are memory-optimized by default in 7.x).

## Version-Specific Gotchas (dated, sourced)
- **Couchbase Server 7.x** is the current major line: scopes/collections, SQL++
  (the N1QL superset), and vector search on the 7.6 releases. The 7.x
  bucket→scope→collection hierarchy replaces the old flat `type`-field pattern.
  [docs.couchbase.com 7.x release notes, retrieved 2026-07-10; see References]
- **couchbase (Python SDK) 4.6.2**, uploaded **2026-06-18** — the SDK 4.x line uses
  the Couchbase++ core and exposes `scope.query(...)`, sub-document ops, and
  `QueryScanConsistency`. [pypi.org/project/couchbase JSON API, retrieved 2026-07-10]
- **GSIs are eventually consistent** — `scan_consistency=REQUEST_PLUS` is the only
  way to get read-your-writes from a query (KV reads are always consistent).
- **Primary indexes are dev-only** — remove them in production and rely on
  purpose-built GSIs (see Indexing).

## References (retrieved 2026-07-10)
- couchbase Python SDK releases (PyPI JSON): https://pypi.org/pypi/couchbase/json
- Scopes & collections: https://docs.couchbase.com/server/current/learn/data/scopes-and-collections.html
- SQL++ (N1QL) indexing & EXPLAIN: https://docs.couchbase.com/server/current/n1ql/n1ql-language-reference/index.html
- Scan consistency (index staleness): https://docs.couchbase.com/python-sdk/current/howtos/n1ql-queries-with-sdk.html
- Durability: https://docs.couchbase.com/server/current/learn/data/durability.html
- RBAC roles: https://docs.couchbase.com/server/current/learn/security/roles.html
- CWE-943 (NoSQL/data-query injection): https://cwe.mitre.org/data/definitions/943.html
