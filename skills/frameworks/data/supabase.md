# Supabase CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npx supabase init
npx supabase start  # Local development
# Client
npm install @supabase/supabase-js
```

## Claude's Common Mistakes
1. **RLS disabled on tables** - Row Level Security is essential for Supabase
2. **Service key in client code** - Service key bypasses RLS; server-only
3. **Missing RLS policies** - Tables with RLS need explicit policies
4. **Direct database URL in client** - Use Supabase client with anon key
5. **No policy for each operation** - Need SELECT, INSERT, UPDATE, DELETE

## Correct Patterns (2026)
```sql
-- ALWAYS enable RLS on tables
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Policy: Users read own posts
CREATE POLICY "Users read own posts" ON posts
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users insert own posts
CREATE POLICY "Users insert own posts" ON posts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users update own posts
CREATE POLICY "Users update own posts" ON posts
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Public readable (no auth required)
CREATE POLICY "Public profiles readable" ON profiles
    FOR SELECT USING (true);
```

```typescript
import { createClient } from '@supabase/supabase-js'

// Client with anon key (SAFE for browser)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  // NOT service key!
)

// Realtime subscription
const channel = supabase
  .channel('posts')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'posts' },
    (payload) => console.log('New post:', payload)
  )
  .subscribe()

// Query (RLS automatically filters to user's data)
const { data } = await supabase.from('posts').select('*')
```

## Version Gotchas
- **auth.uid()**: Returns current user's ID in RLS policies
- **Edge Functions**: Deno-based serverless functions
- **Realtime**: PostgreSQL LISTEN/NOTIFY for live updates
- **Storage**: S3-compatible with RLS-like policies

## What NOT to Do
- Do NOT disable RLS on production tables
- Do NOT expose service role key to clients
- Do NOT forget policies for each CRUD operation
- Do NOT use database URL directly (use Supabase client)

## RLS Footguns — the auth boundary IS Row-Level Security (CWE-284)
In Supabase, the client talks to Postgres through PostgREST using the **anon key**,
which is **shipped to the browser and is public by design**. The ONLY thing standing
between an anonymous request and your data is **Row-Level Security**. A table with RLS
disabled — or RLS enabled but with **no policies** — is therefore either fully readable
or fully locked. Exposing a table without correct policies is **CWE-284 "Improper
Access Control"** (cwe.mitre.org/data/definitions/284.html) — the single most common
Supabase data breach.

```sql
-- FOOTGUN (CWE-284): RLS never enabled -> every row is public via the anon key
CREATE TABLE profiles (id uuid PRIMARY KEY, user_id uuid, ssn text);
-- (anyone with the public anon key can `select * from profiles`)

-- RIGHT: enable RLS, then write an explicit policy per operation, scoped to auth.uid()
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own profile"   ON profiles FOR SELECT
    USING (auth.uid() = user_id);
CREATE POLICY "insert own profile" ON profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own profile" ON profiles FOR UPDATE
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```
- **`auth.uid()`** returns the JWT's user id inside a policy; scope every USING /
  WITH CHECK clause to it. `USING` filters what a row can be READ/matched; `WITH CHECK`
  validates what can be WRITTEN — you usually need BOTH on UPDATE.
- Enabling RLS with **zero policies denies all access** (deny-by-default) — safe, but it
  silently breaks reads until you add a policy. Add the policy in the same migration.
  [supabase.com database/postgres/row-level-security, retrieved 2026-07-10]

## Security — anon vs service_role key separation (CWE-798)
Supabase issues two keys. The **anon** key is public and RLS-constrained. The
**`service_role`** key **bypasses RLS entirely** — it is a full-access database
credential. Shipping `service_role` to the client is **CWE-798 "Use of Hard-coded
Credentials"** (cwe.mitre.org/data/definitions/798.html) and hands every attacker your
whole database.

```typescript
// SAFE in the browser: anon key, RLS-constrained
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,     // public, RLS applies
);

// FOOTGUN (CWE-798): service_role in client code -> RLS bypassed, total exposure
// const admin = createClient(url, process.env.SERVICE_ROLE_KEY!);  // NEVER in browser

// RIGHT: service_role ONLY on the server (route handler / edge function), never sent down
// server-only file:
const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,          // bypasses RLS — server trust boundary
);
```
- The `NEXT_PUBLIC_` prefix (or any client-bundled env) means the value ships to the
  browser — the `service_role` key must NEVER carry it. Keep it server-side only,
  rotate it if leaked, and treat a leak as a full-database compromise.
  [supabase.com api/api-keys, retrieved 2026-07-10]

## Realtime & RPC — RLS still governs
```typescript
// Realtime respects RLS via the "Authorization" flow: a channel only delivers rows
// the subscriber's JWT is allowed to see. Enabling Realtime on a table does NOT
// bypass its policies — but you must ADD a realtime authorization policy too.
const channel = supabase
  .channel('room-1', { config: { private: true } })   // private channel -> RLS-checked
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => render(payload))
  .subscribe();
```
```sql
-- Postgres functions callable via supabase.rpc() are parameterized (no CWE-89 via args),
-- but a function body that BUILDS dynamic SQL by concatenation reintroduces injection.
CREATE FUNCTION search_posts(q text) RETURNS SETOF posts LANGUAGE sql SECURITY INVOKER AS $$
  SELECT * FROM posts WHERE title ILIKE '%' || q || '%'   -- q is a bound arg, safe
$$;
-- Prefer SECURITY INVOKER so the caller's RLS applies; SECURITY DEFINER bypasses it.
```
- Realtime on a **private** channel enforces RLS; make sure a corresponding realtime
  authorization policy exists. RPC args are parameterized, but avoid building dynamic
  SQL by string concatenation inside the function body.
  [supabase.com realtime/authorization, retrieved 2026-07-10]

## Connection — the Supavisor pooler for serverless
```bash
# Serverless/edge functions must use the POOLER, not a direct 5432 connection.
# Transaction mode (port 6543) — one connection per statement, best for serverless:
#   postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres
# Session mode (port 5432 via pooler) — keeps a session; for migrations/prepared stmts.
```
- **Supavisor** is Supabase's connection pooler. Use **transaction mode (6543)** for
  serverless request traffic (session state — `SET`, prepared statements — is NOT
  preserved, same caveat as any transaction-mode pooler); use **session mode** for
  migrations. A direct `:5432` connection per lambda exhausts `max_connections`.
  [supabase.com database/connecting-to-postgres (Supavisor), retrieved 2026-07-10]

## Performance — RLS policy cost & the N+1 via PostgREST
```sql
-- FOOTGUN: an RLS policy that calls auth.uid() per row re-evaluates it for EVERY row.
CREATE POLICY p ON posts FOR SELECT USING (auth.uid() = user_id);

-- RIGHT: wrap the auth function in a scalar subquery so Postgres evaluates it ONCE.
CREATE POLICY p ON posts FOR SELECT USING ((SELECT auth.uid()) = user_id);
-- and index the column the policy + filters use:
CREATE INDEX idx_posts_user ON posts (user_id);
```
```typescript
// FOOTGUN (N+1 over PostgREST): fetch posts, then one request per post for its author.
// RIGHT: embed the related table in ONE request via the foreign-key relationship.
const { data } = await supabase.from('posts').select('*, author:profiles(*)');  // 1 request
```
- Wrapping `auth.uid()` / `auth.jwt()` in `(SELECT ...)` lets the planner evaluate it
  once instead of per row — a large, documented speedup on RLS-filtered tables. Index
  every column a policy references. Use PostgREST **embedded resource** selects
  (`select('*, rel(*)')`) to avoid the client-side N+1.
  [supabase.com database/postgres/row-level-security (performance) + rest/joins,
  retrieved 2026-07-10]

## Error Handling
```typescript
const { data, error } = await supabase.from('posts').insert({ title });
if (error) {
  // PostgREST surfaces the Postgres SQLSTATE in error.code
  if (error.code === '23505') handleDuplicate();     // unique_violation
  else if (error.code === '42501') handleRLSDenied(); // insufficient_privilege = RLS block
  else throw error;
}
```
- Supabase returns `{ data, error }` (it does NOT throw); ALWAYS check `error`. Branch
  on the **Postgres SQLSTATE** in `error.code` — `42501` (insufficient_privilege) is the
  tell that an **RLS policy denied** the operation, not a bug.
  [supabase.com javascript client error handling, retrieved 2026-07-10]

## Testing
```sql
-- FOOTGUN: testing as service_role (or in the SQL editor) BYPASSES RLS, so a broken
-- policy looks like it works. RIGHT: test policies AS the anon/authenticated role.
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
SELECT count(*) FROM profiles;          -- should return ONLY this user's rows
ROLLBACK;
```
- Assert policies **as the anon and authenticated roles**, never as `service_role` /
  the SQL editor (which bypass RLS). Supabase's `supabase test db` (pgTAP) runs these
  in CI. Verify both the allow path AND the deny path for each policy.
  [supabase.com database testing (pgTAP) + row-level-security, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **`@supabase/supabase-js` 2.110.2** is the current client, published **2026-07-09** to
  npm. [registry.npmjs.org/@supabase/supabase-js, retrieved 2026-07-10]
- **RLS is the authorization boundary** — the anon key is public by design and only RLS
  gates it; a table without policies is either fully open or fully denied (CWE-284).
  [supabase.com database/postgres/row-level-security, retrieved 2026-07-10]
- **`service_role` bypasses RLS** and must stay server-side (CWE-798); **Supavisor
  transaction mode (6543)** is the serverless connection path. [supabase.com api-keys +
  connecting-to-postgres, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- @supabase/supabase-js (npm): https://registry.npmjs.org/@supabase/supabase-js
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- API keys (anon vs service_role): https://supabase.com/docs/guides/api/api-keys
- Realtime authorization: https://supabase.com/docs/guides/realtime/authorization
- Connecting to Postgres (Supavisor pooler): https://supabase.com/docs/guides/database/connecting-to-postgres
- PostgREST joins & nesting (embedded selects): https://supabase.com/docs/guides/database/joins-and-nesting
- CWE-284 (Improper Access Control): https://cwe.mitre.org/data/definitions/284.html
- CWE-798 (Hard-coded Credentials): https://cwe.mitre.org/data/definitions/798.html
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
