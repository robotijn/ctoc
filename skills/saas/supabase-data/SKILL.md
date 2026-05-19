---
name: supabase-data
description: Postgres + storage + realtime via Supabase — connection pooling, migrations, RLS, storage buckets, backups, edge functions.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "supabase"
  - "postgres database"
  - "database setup"
  - "RLS policy"
  - "storage bucket"
  - "realtime subscriptions"
  - "drizzle migration"
  - "edge function deno"
  - "supavisor pooling"
  - "postgrest rpc"
  - "service role key"
related_skills:
  - saas/multi-tenancy-row-level
  - saas/clerk-auth
  - specialized/database-reviewer
  - security/secrets-detector
  - security/sast-scanner
effort_level: high
model_optimized_for: opus-4-7
model: opus
tools: Read, Write, Edit, Bash
---

# Supabase Data (saas skill)

> Postgres + Storage + Realtime + Edge Functions via Supabase. Default DB host of `saas/b2c-subscription`.

## Role

You set up Supabase as the data layer of a SaaS — Postgres (pooled), migrations, RLS policies that are enabled AND forced, storage buckets with policies matching table RLS, custom JWT claims for org membership, Edge Functions for privileged operations, Realtime channels that honor RLS, and backups. You assume every client-shipped key is hostile and every RLS-off table is a public dump.

## 2026 Best Practices

- **Anon key is client-side only.** It identifies the project; it is not a secret, but it MUST be paired with RLS and least-privilege grants on every table. If RLS is off on a table the anon key holds, the table is world-readable/writable. Per Supabase docs ([Securing your API](https://supabase.com/docs/guides/api/securing-your-api)), the anon role respects RLS; the service_role does not.
- **Service-role key is server-side only.** It bypasses RLS. Never ship in a browser bundle, never put it behind a `NEXT_PUBLIC_` prefix, never embed in a Vite `import.meta.env` exposed to the client, never log it. Use only from Server Components, Route Handlers / API routes, Edge Functions, background jobs, and migrations.
- **RLS enabled AND forced on every user-data table.** `ENABLE ROW LEVEL SECURITY` lets table owners and service_role bypass; `FORCE ROW LEVEL SECURITY` makes even the table owner subject to policies. Forcing matters when the table owner runs jobs against the same DB. See [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security).
- **Custom JWT claims for org membership.** Use a Custom Access Token Auth Hook (Postgres function or HTTP endpoint) to inject `org_id`, `role`, and other org-scoped claims into the JWT at issuance. Policies read them via `(auth.jwt() ->> 'org_id')`. Per [Custom Claims docs](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac), never put authorization claims in `user_metadata` — end users can modify that. Use `app_metadata` or claims injected by the hook.
- **Edge Functions for privileged ops.** Anything that requires bypassing RLS (Stripe webhooks, admin reports, cross-tenant aggregation) runs in a Deno Edge Function with the service_role key loaded from `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` — never from a body parameter, header, or query string. The function MUST verify caller authorization before doing privileged work.
- **Storage policies mirror table RLS.** Storage uses `storage.objects` with the same Postgres RLS engine. A user who can read row `tenants.id = X` should also read `bucket_id = 'tenant-X-files'`. Per [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control), define policies on `storage.objects` filtered by `(storage.foldername(name))[1]` or a custom column.
- **Use Supavisor (transaction mode, port 6543) for serverless.** Serverless functions create short-lived connections that exhaust Postgres `max_connections` quickly. Supavisor (Cloudflare-fronted) pools at the cluster layer. The direct port (5432) is for long-lived processes (migrations, workers). Per [Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI), transaction mode is incompatible with prepared statements — set `prepare: false` in postgres-js / disable in Prisma.
- **Realtime subscriptions enforce RLS.** Realtime temporarily assumes the subscriber's identity and runs an internal query to check if their RLS policies would let them see the changed row before broadcasting. RLS-off table = real-time changes broadcast to everyone subscribed. RLS-on with broken policy = nothing broadcast. Test both branches.
- **PostgREST RPC functions must be RLS-aware.** A `SECURITY DEFINER` function runs with the definer's privileges (often `postgres`), bypassing the caller's RLS. Either avoid `SECURITY DEFINER` for user-facing RPC, or inside the function explicitly check `auth.uid()` / `(auth.jwt() ->> 'org_id')` and re-filter every query. Every `SECURITY DEFINER` function MUST also `SET search_path = ''` (or to a pinned schema list) and reference all objects with fully qualified names — otherwise a search_path hijack lets a low-priv role shadow `public.foo` with a malicious table and capture definer privileges.
- **Never invent substitutes for `auth.uid()`.** Don't pass `user_id` as a function parameter and trust it; don't read it from a header; don't read it from a body field. Read from `auth.uid()` (set by GoTrue from the verified JWT) or `auth.jwt()`. Anything else is forgeable.
- **Index every column referenced in an RLS policy.** RLS policies run on every row read; an unindexed `user_id`/`org_id` reference on a 1M-row table is the #1 source of Supabase performance complaints. Wrap `auth.uid()` in `(select auth.uid())` so the planner caches it once per query (Supabase performance docs).
- **Separate Supabase projects per environment.** Production, staging, preview each get their own project — separate URL, keys, DB. A staging bug must never touch prod data.
- **Migrations are versioned.** Use Supabase CLI (`supabase db diff` → `supabase migration new`) or Drizzle/Prisma. Never edit prod schema in the Studio UI without capturing it as a migration. CI should fail on drift.
- **Backups verified.** Pro tier: daily backups, 7-day retention. Team+: PITR. Run a restore drill at least quarterly; an untested backup is a wish.

## Implementation pattern

### 1. Create project + grab connection info

```
1. supabase.com → New Project
2. Name: yourapp-prod (or yourapp-staging)
3. Database password: generate strong, store in 1Password / Vault
4. Region: closest to your Vercel / Cloudflare deploy region
5. Wait ~2 min for provisioning
6. Grab: DATABASE_URL (pooled, 6543), DIRECT_DATABASE_URL (5432),
        SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY
```

### 2. Environment variables (placeholders only)

```env
# Pooled (Supavisor, transaction mode) — use this for serverless / edge
DATABASE_URL=postgres://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true

# Direct — migrations only, long-lived workers
DIRECT_DATABASE_URL=postgres://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres

# Public — browser-safe; respects RLS
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_JWT_PLACEHOLDER>

# Server-only — bypasses RLS, NEVER exposed to browser
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_JWT_PLACEHOLDER>
```

CI guardrail: a pre-build step that greps the client bundle for the literal substring "service_role" and fails the build on hit.

### 3. supabase-js v2 client (browser + server)

```typescript
// lib/supabase/browser.ts — anon key only, RLS-protected
import { createBrowserClient } from '@supabase/ssr';

export const browserClient = () => createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

```typescript
// lib/supabase/server.ts — anon key, cookie-bound to user session, RLS enforced
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const serverClient = async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)),
      },
    },
  );
};
```

```typescript
// lib/supabase/admin.ts — service_role, RLS-bypassing, server-only
import { createClient } from '@supabase/supabase-js';
import 'server-only';                              // throws if imported in client bundle

export const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,          // server-only env, no public prefix
  { auth: { persistSession: false, autoRefreshToken: false } },
);
```

### 4. RLS policy patterns

```sql
-- Enable AND force RLS — both are required
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

-- Index every column referenced in a policy
CREATE INDEX IF NOT EXISTS invoices_org_id_idx ON invoices (org_id);

-- Policy: tenant isolation via JWT custom claim
CREATE POLICY invoices_tenant_isolation ON invoices
  FOR ALL
  TO authenticated                                 -- restrict by role; prevents anon match
  USING (org_id = ((select auth.jwt()) ->> 'org_id')::uuid)
  WITH CHECK (org_id = ((select auth.jwt()) ->> 'org_id')::uuid);

-- Custom claim hook (postgres-function-style) — runs at token issuance
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  claims jsonb;
  v_org uuid;
BEGIN
  SELECT org_id INTO v_org
    FROM public.org_members
    WHERE user_id = (event ->> 'user_id')::uuid
    LIMIT 1;
  claims := event -> 'claims';
  IF v_org IS NOT NULL THEN
    claims := jsonb_set(claims, '{org_id}', to_jsonb(v_org::text));
  END IF;
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
```

Register the hook in Dashboard → Authentication → Hooks → Custom Access Token.

### 5. Storage buckets with policies that mirror table RLS

```sql
-- Bucket policy: only members of org_id can read their org's files
CREATE POLICY "org_files_read" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'org-files'
    AND (storage.foldername(name))[1] = ((select auth.jwt()) ->> 'org_id')
  );

CREATE POLICY "org_files_write" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'org-files'
    AND (storage.foldername(name))[1] = ((select auth.jwt()) ->> 'org_id')
  );
```

### 6. Edge Functions (Deno) — privileged operations

```typescript
// supabase/functions/stripe-webhook/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  // 1. Verify caller (here: Stripe signature; for user-callable, verify Supabase JWT)
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Unauthorized', { status: 401 });
  // ... verify Stripe signature against STRIPE_WEBHOOK_SECRET ...

  // 2. service_role from env — NEVER from request
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // 3. Do the privileged write
  const body = await req.json();
  const { error } = await admin
    .from('subscriptions')
    .upsert({ stripe_id: body.id, status: body.status });

  return new Response(JSON.stringify({ ok: !error }), {
    headers: { 'content-type': 'application/json' },
    status: error ? 500 : 200,
  });
});
```

Deploy: `supabase functions deploy stripe-webhook --no-verify-jwt` (only when the function does its own auth, e.g., Stripe signature verification). For user-callable functions, omit the flag so GoTrue verifies the bearer JWT first.

### 7. Realtime — subscriptions honor RLS

```typescript
import { createBrowserClient } from '@supabase/ssr';

const supa = createBrowserClient(URL, ANON_KEY);

supa.channel('invoices-mine')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'invoices',
    // Filter is a hint to the server; RLS is still enforced on top
  }, (payload) => console.log('new invoice:', payload.new))
  .subscribe();
```

Realtime checks RLS per subscriber per row before broadcasting (Supabase docs). If RLS is off, all subscribers see all changes — treat any "subscribers seeing each other's data" report as an RLS bug, not a Realtime bug.

### 8. PostgREST RPC — safe `SECURITY INVOKER` pattern

```sql
-- SAFE: SECURITY INVOKER (default) — runs with caller privileges, RLS applies
CREATE OR REPLACE FUNCTION public.org_dashboard_counts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'invoices', (SELECT count(*) FROM public.invoices),
    'members',  (SELECT count(*) FROM public.org_members)
  );
$$;
GRANT EXECUTE ON FUNCTION public.org_dashboard_counts() TO authenticated;

-- DANGEROUS PATTERN to avoid: SECURITY DEFINER without internal RLS checks
-- Such functions run as `postgres`, bypassing the caller's RLS.
```

### 9. Migrations (Supabase CLI)

```bash
supabase db diff -f add_invoices_table        # capture schema delta as migration
supabase migration new manual_data_fix         # hand-write migration
supabase db push                               # apply to linked project
supabase functions deploy <name>
```

### 10. Drizzle migrations (alternative)

```bash
npx drizzle-kit generate                       # generate from schema
npx drizzle-kit migrate                        # apply versioned
npx drizzle-kit check                          # CI: fail on drift
```

```typescript
// db/client.ts — Vercel-safe pooled connection (Supavisor transaction mode)
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const queryClient = postgres(process.env.DATABASE_URL!, {
  prepare: false,                                  // required for transaction-mode pooler
  max: 1,                                          // serverless: 1 conn per invocation
});
export const db = drizzle(queryClient);
```

### 11. Backups + restore drill

Pro: daily backups, 7-day retention. Team+: PITR up to 14 days.

```
Quarterly restore drill:
1. Spin a fresh Supabase project (staging-restore).
2. Initiate restore-from-backup to that project.
3. Run smoke tests + a row-count comparison vs prod (or a sampled checksum).
4. Document time-to-restore in runbook.
```

## 7-Language coverage — BAD/SAFE pairs

The same Supabase data-access patterns appear across language stacks. The BAD/SAFE pairs below mirror the SAST exemplar layout.

### TypeScript / JavaScript (supabase-js v2)

```typescript
// BAD: service_role key in a browser file — anything with NEXT_PUBLIC_ ships to client
// app/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
export const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!,   // CATASTROPHIC: leaks to browser bundle
);

// BAD: trusting a client-supplied user_id (forgeable)
export async function getInvoices(userId: string) {
  return await supa.from('invoices').select('*').eq('user_id', userId);
}
```

```typescript
// SAFE: separate browser / server / admin clients; admin is server-only
// lib/supabase/admin.ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';
export const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,              // no NEXT_PUBLIC_ prefix
  { auth: { persistSession: false } },
);

// SAFE: server-side handler reads auth.uid() from the session, not the request
export async function GET() {
  const supa = await serverClient();                   // cookie-bound anon
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  // RLS policy filters by auth.uid() automatically
  const { data } = await supa.from('invoices').select('*');
  return Response.json(data);
}
```

```typescript
// SAFE: Edge Function reading service_role from Deno.env, not from request
// supabase/functions/admin-report/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
Deno.serve(async (req) => {
  const jwt = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!jwt) return new Response('Unauthorized', { status: 401 });
  // verify caller is admin via anon client + auth.getUser(jwt) BEFORE using service_role
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: { user } } = await anon.auth.getUser(jwt);
  if (!user || user.app_metadata?.role !== 'admin') return new Response('Forbidden', { status: 403 });
  // only now load service_role
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // ... privileged work ...
});
```

### Python (supabase-py + FastAPI; postgres-py for direct Postgres)

```python
# BAD: service_role key used from a route accessible to the client
# main.py
from fastapi import FastAPI
from supabase import create_client
import os

app = FastAPI()
supa = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],                 # bypasses RLS for everyone hitting this app
)

@app.get("/invoices/{user_id}")
def list_invoices(user_id: str):
    # trusts client-supplied user_id; admin-key + no auth = full data exfil
    return supa.table("invoices").select("*").eq("user_id", user_id).execute().data
```

```python
# SAFE: two clients — anon for user-scoped reads (forwards caller JWT, RLS applies),
# admin for explicit privileged paths after authorization check.
from fastapi import FastAPI, Depends, Header, HTTPException
from supabase import create_client, Client
import os

app = FastAPI()

def supa_user(authorization: str = Header(...)) -> Client:
    """Anon client bound to caller's JWT — RLS enforced as that user."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing bearer")
    c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
    c.postgrest.auth(authorization.removeprefix("Bearer "))
    return c

@app.get("/invoices")
def list_invoices(supa: Client = Depends(supa_user)):
    # No user_id parameter; RLS policy filters by auth.uid()/jwt
    return supa.table("invoices").select("*").execute().data
```

```python
# Direct Postgres (psycopg) — use the pooled URL for serverless, prepare=False
import psycopg
conn = psycopg.connect(os.environ["DATABASE_URL"], prepare_threshold=None)  # PgBouncer-safe
```

### C# / .NET 9 (supabase-csharp or direct PostgREST)

```csharp
// BAD: Service role key registered into DI of an ASP.NET Core app that also serves the SPA.
// Program.cs
builder.Services.AddScoped(_ => new Supabase.Client(
    builder.Configuration["Supabase:Url"]!,
    builder.Configuration["Supabase:ServiceRoleKey"]!));        // RLS bypassed for ALL requests

app.MapGet("/api/invoices/{userId}", async (Guid userId, Supabase.Client db) =>
{
    // trusts route param; admin key + no auth = exfil
    var res = await db.From<Invoice>().Where(i => i.UserId == userId).Get();
    return Results.Ok(res.Models);
});
```

```csharp
// SAFE: anon client forwarded with caller bearer; service_role only inside guarded admin handlers
// Program.cs
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<Supabase.Client>(sp =>
{
    var http = sp.GetRequiredService<IHttpContextAccessor>().HttpContext!;
    var jwt = http.Request.Headers.Authorization.ToString().Replace("Bearer ", "");
    var client = new Supabase.Client(
        builder.Configuration["Supabase:Url"]!,
        builder.Configuration["Supabase:AnonKey"]!,             // anon, not service_role
        new SupabaseOptions { Headers = new() { ["Authorization"] = $"Bearer {jwt}" } });
    return client;
});

app.MapGet("/api/invoices",
    [Authorize] async (Supabase.Client db) =>
    {
        // RLS policy filters by auth.uid() against caller's JWT
        var res = await db.From<Invoice>().Get();
        return Results.Ok(res.Models);
    });

// SAFE: admin operations isolated, service_role loaded from server-only config
internal sealed class AdminSupabaseFactory(IConfiguration cfg)
{
    public Supabase.Client Create() => new(
        cfg["Supabase:Url"]!,
        cfg["Supabase:ServiceRoleKey"]!,                        // server-only; never sent to client
        new SupabaseOptions { AutoRefreshToken = false });
}
```

### Java 21+ (direct PostgREST via HttpClient or supabase-java)

```java
// BAD: hardcoded service_role JWT secret, mass-trust of body field
// InvoiceController.java
@RestController
public class InvoiceController {
    private final String SERVICE_ROLE = "<HARDCODED_SERVICE_ROLE_JWT>";   // committed secret

    @GetMapping("/api/invoices")
    public ResponseEntity<String> list(@RequestParam String userId) throws Exception {
        var req = HttpRequest.newBuilder(URI.create(
            "https://<PROJECT_REF>.supabase.co/rest/v1/invoices?user_id=eq." + userId))
            .header("apikey", SERVICE_ROLE)                                // RLS bypassed
            .header("Authorization", "Bearer " + SERVICE_ROLE)
            .build();
        return ResponseEntity.ok(HttpClient.newHttpClient().send(req, BodyHandlers.ofString()).body());
    }
}
```

```java
// SAFE: anon key + forward caller bearer; service_role only via Vault-injected admin bean
@RestController
@RequiredArgsConstructor
public class InvoiceController {
    private final SupabaseProps props;        // anon-key only; from env

    @GetMapping("/api/invoices")
    public ResponseEntity<String> list(@RequestHeader("Authorization") String bearer) throws Exception {
        if (!bearer.startsWith("Bearer ")) return ResponseEntity.status(401).build();
        var req = HttpRequest.newBuilder(URI.create(props.url() + "/rest/v1/invoices?select=*"))
            .header("apikey", props.anonKey())          // anon
            .header("Authorization", bearer)            // forward caller JWT — RLS by auth.uid()
            .build();
        return ResponseEntity.ok(HttpClient.newHttpClient().send(req, BodyHandlers.ofString()).body());
    }
}

// Direct Postgres pool (Supavisor transaction mode): HikariCP with prepStmtCacheSize=0
HikariConfig cfg = new HikariConfig();
cfg.setJdbcUrl(System.getenv("DATABASE_URL"));     // 6543 pooled URL
cfg.addDataSourceProperty("prepareThreshold", "0"); // disable server-side prepares for PgBouncer
```

### C / C++ — skip (server-only, niche)

Supabase REST/Realtime clients in C/C++ are non-canonical (no official SDK). Server-side native code typically uses libpq against Postgres directly — covered by the standard `PQexecParams` parameterized-query pattern in [security/sast-scanner SKILL.md](../../security/sast-scanner/SKILL.md). If a project genuinely needs Supabase from C/C++, treat the REST endpoint as any other HTTPS API: never embed the service_role key, validate TLS, forward the caller's JWT.

### SQL (foundational — RLS, view contracts, custom claims, SECURITY DEFINER, storage policies)

```sql
-- BAD: RLS enabled but no policies — anon role gets nothing, but you forgot FORCE
--       and the table owner can still bypass when running maintenance jobs.
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- (no FORCE, no policy)

-- BAD: SECURITY DEFINER RPC with no internal RLS-aware filtering
CREATE OR REPLACE FUNCTION public.export_all_invoices()
RETURNS SETOF public.invoices LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM public.invoices;     -- runs as postgres, RLS bypassed, returns every row
$$;
GRANT EXECUTE ON FUNCTION public.export_all_invoices() TO authenticated;

-- BAD: storage policy references user_metadata (user-modifiable)
CREATE POLICY bad_user_metadata_check ON storage.objects FOR SELECT
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');   -- forgeable

-- BAD: policy with no role restriction — anon matches too
CREATE POLICY no_role_restriction ON public.invoices FOR SELECT
  USING (user_id = auth.uid());                                    -- TO authenticated missing
```

```sql
-- SAFE: enable AND force RLS, write explicit policies, index policy columns
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE  ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS projects_org_id_idx ON public.projects (org_id);

CREATE POLICY projects_tenant_read ON public.projects
  FOR SELECT
  TO authenticated
  USING (org_id = ((select auth.jwt()) ->> 'org_id')::uuid);

CREATE POLICY projects_tenant_write ON public.projects
  FOR ALL
  TO authenticated
  USING (org_id = ((select auth.jwt()) ->> 'org_id')::uuid)
  WITH CHECK (org_id = ((select auth.jwt()) ->> 'org_id')::uuid);

-- SAFE: SECURITY INVOKER RPC — caller's RLS still applies
CREATE OR REPLACE FUNCTION public.my_invoice_total()
RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(sum(amount), 0) FROM public.invoices;            -- RLS filters automatically
$$;
GRANT EXECUTE ON FUNCTION public.my_invoice_total() TO authenticated;

-- SAFE: SECURITY DEFINER ONLY when needed; explicit internal authz + RLS-aware filter
CREATE OR REPLACE FUNCTION public.org_invoice_export(p_org uuid)
RETURNS SETOF public.invoices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- explicit caller check; do not trust p_org alone
  IF p_org <> ((select auth.jwt()) ->> 'org_id')::uuid THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.invoices WHERE org_id = p_org;
END;
$$;
REVOKE ALL ON FUNCTION public.org_invoice_export(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.org_invoice_export(uuid) TO authenticated;

-- SAFE: storage policy keyed off app_metadata (server-controlled) + folder
CREATE POLICY org_files_read ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'org-files'
    AND (storage.foldername(name))[1] = ((select auth.jwt()) ->> 'org_id')
  );
```

## Categories — Supabase-specific findings (mirrors SAST category style)

> Each category emits as `severity: critical` on the wire per warnings-are-bugs (see footer). The triage column drives report ordering only.

| # | Category | Example | Triage |
|---|---|---|---|
| 1 | `service_role` in browser bundle | `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, service_role used in a React component, service_role key in Vite/Webpack output | CRITICAL — full data compromise |
| 2 | RLS off on user-data table | `pg_tables` shows `rowsecurity = false` for a table with `auth.uid()`-scoped data; or `ENABLE` without `FORCE` | CRITICAL — table is world-readable via anon |
| 3 | Missing storage policies | bucket exists, RLS on `storage.objects` has no policy covering it = no access at all; or wildcard policy `USING (true)` = world access | CRITICAL (either failure mode) |
| 4 | Edge Function with no auth check | `Deno.serve` reads `service_role` from env and writes to DB without verifying caller JWT or webhook signature | CRITICAL |
| 5 | Realtime channel without RLS | table broadcasting `postgres_changes` has RLS off; subscribers see each other's rows | CRITICAL |
| 6 | PostgREST RPC bypasses RLS | `SECURITY DEFINER` function with no internal authorization check, granted to `authenticated` or `public` | CRITICAL — IDOR via RPC |
| 7 | Hardcoded JWT / service_role secret | service_role JWT or DB password committed to source, env file checked in, key visible in Sentry / log | CRITICAL |
| 8 | Missing pooled connection in serverless | direct port 5432 from Vercel / Lambda / Cloudflare Worker; DB exhaustion under load | HIGH (CRITICAL on incident) |
| 9 | Prepared statements + transaction-pool | postgres-js without `prepare: false`; Prisma without `?pgbouncer=true`; HikariCP without `prepareThreshold=0` | HIGH — sporadic query failure |
| 10 | RLS column unindexed | EXPLAIN shows seq scan on a column referenced by an RLS policy | MEDIUM — perf cliff at scale |
| 11 | `user_metadata` used in policies | policy checks `(auth.jwt() -> 'user_metadata' ->> 'role')`; users can self-promote | CRITICAL |
| 12 | Forgeable user_id in handler | server reads `req.body.user_id` instead of `auth.uid()` / session | CRITICAL |
| 13 | Cross-environment data leak | staging DB credentials in prod env file, single Supabase project for multiple envs | HIGH |
| 14 | Backup not exercised | no documented restore drill in last 90 days | MEDIUM |

## Tool Integration (2026)

| Tool | Purpose | Where it fits |
|------|---------|---------------|
| **Supabase CLI** | local dev DB, `db diff`, `migration new`, `functions deploy`, `db push`, `gen types typescript` | every PR (diff/check) + deploy |
| **`supabase db diff`** | compare local vs linked → emit migration file | on schema change |
| **`supabase migration new`** | hand-write a migration | data fixes, RLS policies |
| **`supabase functions deploy`** | push Deno Edge Function | on function change |
| **supabase-js v2** | client SDK (browser + server + Deno via `npm:@supabase/supabase-js@2`) | runtime |
| **`@supabase/ssr`** | Next.js / SvelteKit / Remix cookie-bound server client | every server handler |
| **Drizzle Kit / Prisma migrate** | typed schema-first migrations | alternative / supplement to CLI migrations |
| **pgmustard** | explain-plan analyzer; flags missing indexes on RLS-referenced columns | when an RLS query is slow |
| **Supabase Studio policy editor** | visual policy authoring with preview | drafting policies |
| **Inngest / QStash** | durable queue for jobs that need service_role; the queue holds the secret, your app doesn't | every workflow that needs RLS bypass |
| **`pgaudit`** | DB-side audit logging for service_role activity | compliance / SOC2 |

```bash
# Local dev cycle
supabase start                                  # local Postgres + Studio + GoTrue + Storage + Realtime
supabase db diff -f add_org_invoices            # capture schema delta
supabase db push                                # apply to linked remote
supabase gen types typescript --linked > db/types.ts
supabase functions deploy stripe-webhook --no-verify-jwt

# Drizzle CI guard — fail on drift
npx drizzle-kit check

# pgmustard / EXPLAIN — find missing indexes on RLS columns
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM invoices WHERE org_id = '<uuid>';
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used in scan reports. When this skill emits a letter to CTO Chief via the refinement loop, **every finding — regardless of triage tier — becomes `severity: critical`** per warnings-are-bugs. There is no soft tier on the wire. Triage tiers stay in the report body for prioritization; the letter's `severity` is always `critical`.

**Reconciliation rule:** triage CRITICAL/HIGH → wire `critical` (always). Triage MEDIUM/LOW → wire `critical` with `confidence: low` AND `delta_to_baseline: new` only if the finding is genuinely new; otherwise still `critical` but the integrator may defer if `confidence: low` and corroboration is single-source. The integrator never auto-downgrades; only the user can waive via the plan's `## Decisions Taken Under Ambiguity` section.

| Triage tier | Examples | Internal action | Wire severity |
|-------------|----------|-----------------|---------------|
| CRITICAL | service_role in client bundle, RLS off, wildcard storage policy, SECURITY DEFINER without authz, hardcoded service_role JWT, forgeable user_id, `user_metadata` in policy, Edge Function without caller auth, search_path-hijack-vulnerable definer function | BLOCK | `critical` |
| HIGH | direct-port DB connection on serverless, prepared statements with transaction-pool, single project for multi-env | BLOCK | `critical` |
| MEDIUM | unindexed RLS column, missing FORCE on enabled RLS, no quarterly restore drill | Fix soon | `critical` |
| LOW | missing `ON DELETE` clarification, missing types regen in CI | Backlog | `critical` |

## Letter schema (refinement-loop output contract)

```yaml
finding_id: <sha256(critic+file+line+type)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low
engine: supabase-cli | semgrep | manual | drizzle-check | sql-static
kind: rls_disabled | service_role_in_client | storage_policy_missing
     | edge_fn_no_auth | realtime_rls_off | rpc_security_definer_bypass
     | hardcoded_secret | unpooled_serverless_conn | prepared_stmt_pgbouncer
     | unindexed_rls_column | user_metadata_in_policy | forgeable_user_id
     | single_project_multi_env | backup_drill_stale
target_file: src/app/api/invoices/route.ts | supabase/migrations/202605...sql
target_line: 42
sink: "createClient(... , SERVICE_ROLE)"
source: "request.body.user_id"
suggested_fix: "Replace service_role client with cookie-bound serverClient(); rely on auth.uid() in RLS policy."
owasp: A01 | A02 | A05 | A07
cwe: CWE-285 | CWE-639 | CWE-798 | CWE-862
reference: https://supabase.com/docs/guides/database/postgres/row-level-security
```

The integrator uses `confidence` to weight findings: a `confidence: low` single-source finding doesn't block phase advancement alone, but two corroborating engines escalate it. All wire-level severity stays `critical`.

## Critical pitfalls (condensed)

1. **service_role in browser bundle** — any `NEXT_PUBLIC_` prefix on service_role, or import in a client component, leaks admin access. CI grep guard.
2. **RLS enabled but not forced** — owner can bypass; jobs running as table owner read everything. Use `FORCE ROW LEVEL SECURITY`.
3. **Wildcard storage policy** — `USING (true)` on `storage.objects` is world-readable. Scope to bucket + folder + `auth.jwt()` claim.
4. **SECURITY DEFINER RPC** — runs as `postgres`, bypassing RLS. Add internal authz check or use SECURITY INVOKER.
5. **`user_metadata` in policies** — users can modify it. Use `app_metadata` or custom claims injected via Auth Hook.
6. **Forgeable user_id** — reading `user_id` from request body / header / param. Always use `auth.uid()`.
7. **Direct port 5432 on serverless** — connection exhaustion. Use Supavisor 6543 with `?pgbouncer=true` and `prepare: false`.
8. **Production = staging = preview** — single project for multiple envs leaks data. One project per env.
9. **Realtime on RLS-off table** — subscribers cross-read. Test with two distinct users.
10. **Migration drift via Studio UI** — schema diverges from repo. `supabase db diff` in CI; fail on uncommitted delta.
11. **Backups untested** — quarterly restore drill is mandatory; an untested backup is a hope.
12. **Edge Function loads service_role + no caller check** — function is a public RLS bypass. Verify caller before privileged work.

## Drift detection in CI

```bash
# Schema drift
supabase db diff --linked            # non-empty = drift, fail the build
npx drizzle-kit check                # alternative: Drizzle-managed schemas

# Client-bundle leak grep (run after build)
rg "service_role|SERVICE_ROLE_KEY|sb_secret_" .next/ dist/ build/ && exit 1 || exit 0

# RLS audit — every public table must have RLS on AND at least one policy
psql "$DIRECT_DATABASE_URL" -f scripts/rls-audit.sql
```

`scripts/rls-audit.sql`:
```sql
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  count(p.polname) AS policy_count
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
HAVING NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR count(p.polname) = 0;
-- Any rows = build fails.
```

## Sources

- [Supabase RLS — official docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing your API — official docs](https://supabase.com/docs/guides/api/securing-your-api)
- [Securing your data](https://supabase.com/docs/guides/database/secure-data)
- [Understanding API keys](https://supabase.com/docs/guides/api/api-keys)
- [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)
- [Edge Functions — official docs](https://supabase.com/docs/guides/functions)
- [Edge Functions Architecture](https://supabase.com/docs/guides/functions/architecture)
- [Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI)
- [RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [Supabase Drizzle integration](https://orm.drizzle.team/docs/get-started/supabase-new)
- [Supabase RLS Best Practices (MakerKit)](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [Supabase Anonymous Key Security (AuditYourApp)](https://www.audityour.app/guides/supabase-anonymous-key-security-guide)

---

## Refinement Loop — critic mode (v6.9.8+)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
