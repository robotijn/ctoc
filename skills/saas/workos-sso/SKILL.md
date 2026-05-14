---
name: workos-sso
description: B2B SSO (SAML / OIDC) + Directory Sync via WorkOS — organization-scoped auth, audit log, multi-IdP support.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "workos"
  - "SAML SSO"
  - "OIDC SSO"
  - "B2B authentication"
  - "directory sync"
  - "enterprise auth"
  - "okta integration"
related_skills:
  - saas/clerk-auth
  - saas/multi-tenancy-row-level
  - compliance/audit-log-checker
effort_level: high
model_optimized_for: opus-4-7
model: opus
tools: Read, Write, Edit, Bash
---

# WorkOS SSO (saas skill)

> B2B authentication with enterprise SSO (SAML/OIDC) + Directory Sync. Default auth provider of the `saas/b2b-sales-led` template.

## Role

You set up WorkOS so enterprise customers can sign in via their Okta/Google Workspace/Azure AD/Microsoft Entra. Organization-scoped data, directory sync for user provisioning/deprovisioning, audit log for compliance.

## 2026 Best Practices

- **WorkOS for B2B SSO** — Clerk's B2B is good but WorkOS is more mature for enterprise (SCIM, Directory Sync).
- **Organization-first data model** — every row scoped to `organization_id`, not just `user_id`.
- **SCIM (Directory Sync)** for auto-provisioning — IT admin removes user in Okta → SCIM event removes from your app.
- **AuthKit (hosted UI)** for fastest integration — WorkOS provides the login page.
- **Audit Log via WorkOS API** — track auth events, surface in customer-facing audit log table.
- **Multi-IdP per organization** — large customers may have multiple IdPs; WorkOS handles routing.
- **Magic Link fallback** for non-SSO orgs (smaller customers without IdP).

## Implementation pattern

### 1. Install + environment

```bash
npm install @workos-inc/node
```

```env
WORKOS_API_KEY=sk_live_...
WORKOS_CLIENT_ID=client_...
WORKOS_COOKIE_PASSWORD=<32+ random bytes>
WORKOS_REDIRECT_URI=https://yourapp.com/api/auth/callback
```

### 2. AuthKit (hosted login UI)

```typescript
// app/sign-in/page.tsx
import { WorkOS } from '@workos-inc/node';

const workos = new WorkOS(process.env.WORKOS_API_KEY!);

export default async function SignIn() {
  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    provider: 'authkit',
    redirectUri: process.env.WORKOS_REDIRECT_URI!,
    clientId: process.env.WORKOS_CLIENT_ID!,
  });
  return redirect(authorizationUrl);
}
```

### 3. Callback handler

```typescript
// app/api/auth/callback/route.ts
import { WorkOS } from '@workos-inc/node';
import { cookies } from 'next/headers';

const workos = new WorkOS(process.env.WORKOS_API_KEY!);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (!code) return new Response('Missing code', { status: 400 });

  const { user, organizationId, accessToken, refreshToken } = await workos.userManagement.authenticateWithCode({
    clientId: process.env.WORKOS_CLIENT_ID!,
    code,
  });

  // Upsert user + organization in your DB
  await upsertUserAndOrg({ user, organizationId });

  // Set session cookie (encrypted)
  cookies().set('workos_session', encryptSession({ userId: user.id, organizationId }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,   // 7 days
  });

  return Response.redirect(new URL('/dashboard', req.url));
}
```

### 4. Organization-scoped database schema

```typescript
// drizzle/schema.ts
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  workosOrgId: text('workos_org_id').notNull().unique(),
  name: text('name').notNull(),
  domain: text('domain'),   // their email domain
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  workosUserId: text('workos_user_id').notNull().unique(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  email: text('email').notNull(),
  role: text('role').notNull(),   // 'admin' | 'member'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// EVERY data table scoped to organization_id
export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  // ... rest
});
```

### 5. RLS by organization

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON invoices
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true));
```

Set the session var on every request:

```typescript
const db = getDb(orgId);
await sql`SELECT set_config('app.current_org_id', ${orgId}, true)`;
```

### 6. Directory Sync (SCIM) — auto-provisioning

```typescript
// app/api/workos/webhook/route.ts
import { WorkOS } from '@workos-inc/node';

const workos = new WorkOS(process.env.WORKOS_API_KEY!);

export async function POST(req: Request) {
  const sig = req.headers.get('workos-signature');
  const body = await req.text();

  const event = await workos.webhooks.constructEvent({
    payload: JSON.parse(body),
    sigHeader: sig!,
    secret: process.env.WORKOS_WEBHOOK_SECRET!,
  });

  switch (event.event) {
    case 'dsync.user.created':
      await provisionUser(event.data);
      break;
    case 'dsync.user.deleted':
      // CRITICAL: when IT removes user from Okta, remove from your app
      await deprovisionUser(event.data.id);
      break;
    case 'dsync.group.user_added':
      await addUserToGroup(event.data);
      break;
  }

  return new Response('ok');
}
```

### 7. Customer-facing audit log (compliance requirement)

```typescript
// On every sensitive action
await db.insert(auditLog).values({
  organizationId,
  userId,
  action: 'invoice.created',
  resourceType: 'invoice',
  resourceId: invoice.id,
  metadata: { amount: invoice.amount },
  ipAddress: req.headers.get('x-forwarded-for'),
  userAgent: req.headers.get('user-agent'),
  createdAt: new Date(),
});
```

Surface in customer dashboard at `/org/audit-log` (admins only).

### 8. Multi-IdP routing

In WorkOS Dashboard: per-organization, configure the IdP (Okta / Azure AD / Google Workspace). When a user enters their email, WorkOS detects the domain and routes to the right IdP.

```typescript
// At login, you can pre-fill the org
const authorizationUrl = workos.userManagement.getAuthorizationUrl({
  provider: 'authkit',
  organizationId: 'org_...',   // optional — pre-selects IdP
  redirectUri: process.env.WORKOS_REDIRECT_URI!,
  clientId: process.env.WORKOS_CLIENT_ID!,
});
```

## Critical pitfalls

1. **Forgot organization_id on a table** — user A in Org X reads data from Org Y. Catastrophic data leak. Every table MUST have org_id.
2. **No SCIM deprovisioning** — user removed in Okta but still active in your app. Compliance failure.
3. **Audit log missing for sensitive actions** — SOC2 audit fails. Log auth events + every data modification.
4. **Single shared IdP** — assuming everyone uses Okta. Enterprise customers have varied IdPs.
5. **Session cookie not encrypted** — `WORKOS_COOKIE_PASSWORD` must be set + used to encrypt session contents.
6. **Webhook signature not verified** — anyone can POST fake SCIM events and add users.

## Test plan

```typescript
describe('WorkOS SSO', () => {
  it('authorizes via AuthKit and redirects', async () => { ... });
  it('callback creates user + organization on first login', async () => { ... });
  it('SCIM user.deleted deprovisions user from DB', async () => { ... });
  it('audit log entry created on invoice creation', async () => { ... });
  it('user from Org X cannot read Org Y data via API', async () => { ... });
});
```

## Sources

- [WorkOS AuthKit](https://workos.com/docs/authkit)
- [WorkOS Directory Sync](https://workos.com/docs/directory-sync)
- [WorkOS audit logs](https://workos.com/docs/audit-logs)
- [WorkOS webhook signatures](https://workos.com/docs/events/data-syncing)
