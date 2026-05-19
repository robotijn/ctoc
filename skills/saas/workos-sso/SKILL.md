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
  - "SCIM webhook"
  - "AuthKit"
related_skills:
  - saas/clerk-auth
  - saas/multi-tenancy-row-level
  - compliance/audit-log-checker
  - security/secrets-detector
effort_level: high
model_optimized_for: opus-4-7
model: opus
tools: Read, Write, Edit, Bash
---

# WorkOS SSO (saas skill)

> B2B authentication with enterprise SSO (SAML/OIDC) + Directory Sync. Default auth provider of the `saas/b2b-sales-led` template.

## Role

You are a B2B identity engineer wiring WorkOS into a SaaS so enterprise customers can sign in via their Okta / Google Workspace / Azure AD / Microsoft Entra / OneLogin / JumpCloud IdP. You treat every SAML assertion as attacker-influenced data, every SCIM webhook as unauthenticated until proven otherwise, and every deprovisioning failure as a compliance incident. Organization-scoped data, directory sync for user provisioning/deprovisioning, audit log for SOC2 / ISO 27001.

## 2026 Best Practices

- **Domain verification BEFORE SSO is enabled.** Before allowing a customer's organization to authenticate via SAML/OIDC on their email domain, the domain MUST be verified (DNS TXT or HTML file). Otherwise an attacker who registers an account under a victim's domain can hijack future sign-ins. WorkOS exposes this via Organization Domains — only `verified` domains route SSO.
- **Signed SAML assertions are mandatory.** Reject any SAML response whose `<Assertion>` is not signed, or whose signature does not match the IdP's certificate fingerprint configured for that organization. The SAML 2.0 web SSO profile mandates that response messages carrying assertions through the browser be signed via XML Signature. WorkOS validates this server-side; do not re-implement it on the SP unless you fully understand XMLDSig canonicalization pitfalls (XML Signature Wrapping attacks).
- **Validate the trio: Audience + Issuer + Signature.** Every accepted assertion must (a) be signed by the IdP cert pinned for this org, (b) have `<AudienceRestriction><Audience>` equal to your SP entity ID, (c) have `<Issuer>` equal to the IdP entityID configured for this org. Missing audience check = any IdP's assertion is accepted (cross-tenant impersonation). Missing issuer check = wrong-tenant assertion accepted.
- **SCIM webhook signature verification is non-negotiable.** Every WorkOS Directory Sync webhook (`dsync.user.created`, `dsync.user.updated`, `dsync.user.deleted`, `dsync.group.user_added`, `dsync.group.user_removed`) carries a `WorkOS-Signature` header. Verify it with `workos.webhooks.constructEvent` (or the equivalent HMAC check in your SDK) before doing ANYTHING with the payload. An unverified webhook handler lets anyone add admins to any org via a curl POST.
- **Deprovisioning on `dsync.user.deleted` is the SOC2 control.** When IT removes a user from Okta, the WorkOS Directory Sync emits `dsync.user.deleted`. You MUST revoke sessions, invalidate refresh tokens, mark the user `deleted_at`, and emit an `audit_log` row (cross-link `compliance/audit-log-checker`). A user removed from the IdP who can still log in is a documented compliance failure — auditors fail SOC2 CC6.3 on this.
- **Idempotent webhook processing keyed on `event.id`.** WorkOS retries webhooks on non-2xx or timeout. Without a `processed_webhooks(event_id)` UNIQUE table, retries cause double-provisioning, duplicate audit entries, and broken counters. Use the event id as the idempotency key; return 200 on the second hit without re-running the side effect.
- **RBAC on org-admin endpoints.** Endpoints like `/org/audit-log`, `/org/sso-config`, `/org/members`, `/org/billing` MUST check `user.role === 'admin' && user.organizationId === resource.organizationId`. Verify both ownership AND role — IDOR + privilege confusion are the two most common B2B SaaS bugs.
- **Redirect URI allowlist (server-side, exact match).** WorkOS rejects unregistered redirect URIs at the Dashboard level. In your code, never accept a `redirect_uri` from query string without validating against an exact allowlist. Open-redirect-into-OAuth-callback is a known account-takeover chain.
- **SP-initiated > IdP-initiated where possible.** IdP-initiated SAML cannot carry SP-side `RelayState` integrity. Where you must support IdP-initiated (some enterprises require it), pin the IdP cert per org and refuse any assertion whose `<Conditions>` lacks `<AudienceRestriction>` matching your SP entity ID.
- **Per-organization IdP certificate pinning.** Each org's SAML connection holds the IdP's X.509 cert. When an IdP rotates the cert (Okta only allows one active at a time), support a short overlap window with two valid certs configured, then drop the old one. Never accept any-cert-from-any-IdP.
- **Audit log every auth event.** `user.signed_in`, `user.signed_in_failed`, `user.password_reset`, `user.deprovisioned`, `org.sso_configured`, `org.scim_configured`, `org.admin_added`. Surface in customer-facing `/org/audit-log` (admin-only) for their compliance team.

## Implementation pattern

### 1. Install + environment

```bash
npm install @workos-inc/node
```

```env
# placeholders — never commit real keys
WORKOS_API_KEY=sk_test_PLACEHOLDER
WORKOS_CLIENT_ID=client_PLACEHOLDER
WORKOS_WEBHOOK_SECRET=whsec_PLACEHOLDER
WORKOS_COOKIE_PASSWORD=<32+ random bytes via openssl rand -hex 32>
WORKOS_REDIRECT_URI=https://yourapp.example.com/api/auth/callback
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

### 3. Callback handler with redirect URI allowlist

```typescript
// app/api/auth/callback/route.ts
import { WorkOS } from '@workos-inc/node';
import { cookies } from 'next/headers';

const workos = new WorkOS(process.env.WORKOS_API_KEY!);
const ALLOWED_RETURN_TO = new Set(['/dashboard', '/onboarding']);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (!code) return new Response('Missing code', { status: 400 });

  const { user, organizationId, accessToken, refreshToken } = await workos.userManagement.authenticateWithCode({
    clientId: process.env.WORKOS_CLIENT_ID!,
    code,
  });

  await upsertUserAndOrg({ user, organizationId });
  await emitAuditLog({ organizationId, userId: user.id, action: 'user.signed_in' });

  cookies().set('workos_session', encryptSession({ userId: user.id, organizationId }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  });

  const returnTo = url.searchParams.get('return_to') ?? '/dashboard';
  const safe = ALLOWED_RETURN_TO.has(returnTo) ? returnTo : '/dashboard';
  return Response.redirect(new URL(safe, req.url));
}
```

### 3a. Just-In-Time (JIT) user + organization provisioning

```typescript
// upsertUserAndOrg — runs on first successful SSO callback for a new user.
async function upsertUserAndOrg({ user, organizationId }: AuthResult) {
  // 1) Verify the org's domain BEFORE we create local records — refuse if unverified.
  const wos = await workos.organizations.getOrganization(organizationId);
  const verified = wos.domains.some((d) => d.state === 'verified' && d.domain === user.email.split('@')[1]);
  if (!verified) throw new Error('org domain not verified — SSO refused');

  // 2) Org provisioning (idempotent on workos_org_id).
  const org = await db.insert(organizations).values({
    workosOrgId: organizationId, name: wos.name, domain: wos.domains[0]?.domain,
    domainVerifiedAt: new Date(), ssoEnabled: true,
  }).onConflictDoUpdate({
    target: organizations.workosOrgId,
    set: { name: wos.name },
  }).returning();

  // 3) JIT user creation (idempotent on workos_user_id). Role defaults to 'member';
  //    org-admin promotion happens via SCIM group mapping or explicit /org/members admin action.
  await db.insert(users).values({
    workosUserId: user.id, organizationId: org[0].id, email: user.email, role: 'member',
  }).onConflictDoUpdate({
    target: users.workosUserId,
    set: { email: user.email, deletedAt: null },   // resurrect if previously soft-deleted
  });
}
```

### 4. Organization-scoped database schema

```typescript
// drizzle/schema.ts
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  workosOrgId: text('workos_org_id').notNull().unique(),
  name: text('name').notNull(),
  domain: text('domain'),
  domainVerifiedAt: timestamp('domain_verified_at'),   // SSO disabled until verified
  ssoEnabled: boolean('sso_enabled').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  workosUserId: text('workos_user_id').notNull().unique(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  email: text('email').notNull(),
  role: text('role').notNull(),
  deletedAt: timestamp('deleted_at'),   // soft-delete on dsync.user.deleted
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
});
```

### 5. RLS by organization

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON invoices
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true));
```

### 6. Directory Sync (SCIM) — idempotent + signature-verified

```typescript
// app/api/workos/webhook/route.ts
import { WorkOS } from '@workos-inc/node';

const workos = new WorkOS(process.env.WORKOS_API_KEY!);

export async function POST(req: Request) {
  const sig = req.headers.get('workos-signature');
  if (!sig) return new Response('missing signature', { status: 401 });

  const body = await req.text();
  let event;
  try {
    event = await workos.webhooks.constructEvent({
      payload: JSON.parse(body),
      sigHeader: sig,
      secret: process.env.WORKOS_WEBHOOK_SECRET!,
    });
  } catch {
    return new Response('invalid signature', { status: 401 });
  }

  // Idempotency — short-circuit if we've seen this event id before.
  const seen = await db.insert(processedWebhooks).values({ eventId: event.id })
    .onConflictDoNothing().returning();
  if (seen.length === 0) return new Response('duplicate', { status: 200 });

  switch (event.event) {
    case 'dsync.user.created':
      await provisionUser(event.data);
      break;
    case 'dsync.user.updated':
      await updateUser(event.data);
      break;
    case 'dsync.user.deleted':
      // SOC2 CC6.3 — IdP removal must revoke app access immediately.
      await deprovisionUser(event.data.id);
      break;
    case 'dsync.group.user_added':
      await addUserToGroup(event.data);
      break;
    case 'dsync.group.user_removed':
      await removeUserFromGroup(event.data);
      break;
  }
  return new Response('ok', { status: 200 });
}
```

### 7. Customer-facing audit log

```typescript
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

## Vulnerability Categories

> Internal triage tiers below. On the wire, every finding emits as `severity: critical` per warnings-are-critical.

### 1. Missing SAML assertion signature verification

```typescript
// BAD — accepting unsigned/unverified SAML responses (custom SP implementation)
function handleSamlResponse(samlResponseXml: string) {
  const assertion = parseXml(samlResponseXml).getElementsByTagName('Assertion')[0];
  const email = assertion.querySelector('Subject NameID').textContent;
  return loginUser(email);   // attacker forges any email — full impersonation
}

// SAFE — let WorkOS validate, OR if you must DIY, verify XMLDSig against the pinned cert
const { user, organizationId } = await workos.sso.getProfileAndToken({
  code: samlCode,
  clientId: process.env.WORKOS_CLIENT_ID!,
});
// WorkOS verifies signature, audience, issuer, NotBefore/NotOnOrAfter, replay (InResponseTo + IDs)
```

### 2. Missing audience / issuer check (accept any IdP)

```typescript
// BAD — only checking signature, not audience / issuer
function validateAssertion(assertion: SamlAssertion) {
  if (!verifySignature(assertion, idpCert)) throw new Error('bad sig');
  return assertion;   // any IdP that signs CAN impersonate any user
}

// SAFE
function validateAssertion(assertion: SamlAssertion, org: Org) {
  if (!verifySignature(assertion, org.pinnedIdpCert)) throw new Error('bad sig');
  if (assertion.issuer !== org.idpEntityId) throw new Error('issuer mismatch');
  if (!assertion.audiences.includes(process.env.SP_ENTITY_ID)) throw new Error('audience mismatch');
  if (assertion.notBefore > Date.now() || assertion.notOnOrAfter < Date.now()) throw new Error('expired');
  return assertion;
}
```

### 3. Unsigned SAML acceptance / XML Signature Wrapping

XML Signature Wrapping (XSW) attacks move signed elements while keeping the signature valid against a different (unsigned) payload. Mitigation: validate the signature **AND** assert the signed element is the one your parser reads (canonical ID match). Don't roll your own SAML parser — use battle-tested libraries (`@node-saml/node-saml`, `passport-saml`, OneLogin's python-saml, OpenSAML for Java/.NET).

### 4. SCIM webhook signature missing

```typescript
// BAD — accepts any POST
export async function POST(req: Request) {
  const event = await req.json();
  if (event.event === 'dsync.user.created') await provisionUser(event.data);
  return new Response('ok');   // anyone with the URL can add admins
}

// SAFE — verify signature first, then handle
const sig = req.headers.get('workos-signature');
if (!sig) return new Response('missing signature', { status: 401 });
const event = await workos.webhooks.constructEvent({
  payload: JSON.parse(await req.text()),
  sigHeader: sig,
  secret: process.env.WORKOS_WEBHOOK_SECRET!,
});
```

### 5. Deprovisioning skipped on user.deleted (compliance failure)

```typescript
// BAD — logs deletion but leaves user active
case 'dsync.user.deleted':
  console.log('user deleted:', event.data.id);
  break;

// SAFE — soft-delete, revoke sessions, audit
case 'dsync.user.deleted':
  await db.update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.workosUserId, event.data.id));
  await db.delete(sessions).where(eq(sessions.workosUserId, event.data.id));
  await db.delete(refreshTokens).where(eq(refreshTokens.workosUserId, event.data.id));
  await emitAuditLog({
    organizationId: event.data.organizationId,
    action: 'user.deprovisioned',
    metadata: { source: 'scim', triggeredBy: 'idp' },
  });
  break;
```

### 6. Missing org isolation (IDOR across tenants)

```typescript
// BAD
app.get('/api/invoices/:id', async (req, res) => {
  const invoice = await db.invoices.find(req.params.id);   // any user reads any invoice
  res.json(invoice);
});

// SAFE — scope by session org
app.get('/api/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await db.invoices.findFirst({
    where: and(eq(invoices.id, req.params.id),
               eq(invoices.organizationId, req.session.organizationId)),
  });
  if (!invoice) return res.status(404).end();
  res.json(invoice);
});
```

### 7. Hardcoded test IdP config in production

```typescript
// BAD — test IdP fingerprint shipped to prod
const IDP_CERT_FINGERPRINT = 'AA:BB:CC:00:11:22:33...';   // hardcoded test cert

// SAFE — fingerprint stored per-org in DB, configured via WorkOS Dashboard
const cert = await db.organizations.findFirst({ where: eq(organizations.id, orgId) }).pinnedIdpCert;
```

### 8. IdP-initiated SAML accepted without explicit SP allow

```typescript
// BAD — accept assertions even when no InResponseTo / no prior AuthnRequest
// Attacker triggers IdP-initiated flow at victim's IdP, then uses the assertion at SP.
function consumeAssertion(a: SamlAssertion) {
  return loginUser(a.subject.nameId);   // no replay or initiator check
}

// SAFE — prefer SP-initiated; if IdP-initiated is required for a specific org, opt-in per-org.
function consumeAssertion(a: SamlAssertion, org: Org) {
  const idpInitiated = !a.inResponseTo;
  if (idpInitiated && !org.allowIdpInitiated) throw new Error('IdP-initiated not allowed for this org');
  if (!idpInitiated && !sessionIndex.consumeOnce(a.inResponseTo!)) throw new Error('replay or unknown AuthnRequest');
  if (!a.audiences.includes(SP_ENTITY_ID)) throw new Error('audience mismatch');
  return loginUser(a.subject.nameId, org);
}
```

### 9. Missing redirect URI allowlist (open redirect → ATO)

```typescript
// BAD — redirect to whatever the query says
return Response.redirect(url.searchParams.get('return_to')!);

// SAFE — exact-match allowlist
const ALLOWED = new Set(['/dashboard', '/onboarding', '/billing']);
const target = ALLOWED.has(returnTo) ? returnTo : '/dashboard';
return Response.redirect(new URL(target, req.url));
```

## 7-language coverage

> SAML/OIDC callback + SCIM webhook BAD/SAFE pairs. C/C++ skipped (server-only B2B auth surface; native clients use OS keychains + OAuth via system browser).

### TypeScript — `@workos-inc/node` + Next.js middleware

```typescript
// BAD — SCIM webhook with no signature check, no idempotency
export async function POST(req: NextRequest) {
  const evt = await req.json();
  if (evt.event === 'dsync.user.deleted') {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.workosUserId, evt.data.id));
  }
  return NextResponse.json({ ok: true });
}

// SAFE — signature verified, idempotent, deprovisioning revokes sessions
import { WorkOS } from '@workos-inc/node';
const workos = new WorkOS(process.env.WORKOS_API_KEY!);

export async function POST(req: NextRequest) {
  const sig = req.headers.get('workos-signature');
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 401 });
  const body = await req.text();
  let evt;
  try {
    evt = await workos.webhooks.constructEvent({
      payload: JSON.parse(body), sigHeader: sig, secret: process.env.WORKOS_WEBHOOK_SECRET!,
    });
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }
  const inserted = await db.insert(processedWebhooks).values({ eventId: evt.id })
    .onConflictDoNothing().returning();
  if (inserted.length === 0) return NextResponse.json({ ok: true });   // already processed
  if (evt.event === 'dsync.user.deleted') {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ deletedAt: new Date() }).where(eq(users.workosUserId, evt.data.id));
      await tx.delete(sessions).where(eq(sessions.workosUserId, evt.data.id));
      await tx.delete(refreshTokens).where(eq(refreshTokens.workosUserId, evt.data.id));
      await tx.insert(auditLog).values({
        organizationId: evt.data.organizationId, action: 'user.deprovisioned',
        userId: evt.data.id, metadata: { source: 'scim' },
      });
    });
  }
  return NextResponse.json({ ok: true });
}
```

### C# / .NET 9 — WorkOS SDK + ASP.NET Core

```csharp
// BAD — minimal API accepts any POST as SCIM webhook
app.MapPost("/api/workos/webhook", async (HttpRequest req, AppDb db) =>
{
    var evt = await req.ReadFromJsonAsync<DSyncEvent>();
    if (evt!.Event == "dsync.user.deleted")
        await db.Users.Where(u => u.WorkosUserId == evt.Data.Id).ExecuteUpdateAsync(s => s.SetProperty(u => u.DeletedAt, DateTime.UtcNow));
    return Results.Ok();
});

// SAFE — verify HMAC signature (workos-node uses constant-time HMAC-SHA256 over timestamp + body)
app.MapPost("/api/workos/webhook", async (HttpRequest req, AppDb db, IConfiguration cfg) =>
{
    if (!req.Headers.TryGetValue("WorkOS-Signature", out var sigHeader))
        return Results.Unauthorized();

    using var reader = new StreamReader(req.Body);
    var body = await reader.ReadToEndAsync();
    if (!WorkOSWebhook.VerifySignature(body, sigHeader!, cfg["WORKOS_WEBHOOK_SECRET"]!, toleranceSeconds: 300))
        return Results.Unauthorized();

    var evt = JsonSerializer.Deserialize<DSyncEvent>(body)!;

    // Idempotency table — UNIQUE(event_id)
    var inserted = await db.ProcessedWebhooks
        .Where(p => p.EventId == evt.Id).AnyAsync();
    if (inserted) return Results.Ok();   // already handled
    db.ProcessedWebhooks.Add(new ProcessedWebhook { EventId = evt.Id });

    if (evt.Event == "dsync.user.deleted")
    {
        using var tx = await db.Database.BeginTransactionAsync();
        await db.Users.Where(u => u.WorkosUserId == evt.Data.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.DeletedAt, DateTime.UtcNow));
        await db.Sessions.Where(s => s.WorkosUserId == evt.Data.Id).ExecuteDeleteAsync();
        await db.RefreshTokens.Where(r => r.WorkosUserId == evt.Data.Id).ExecuteDeleteAsync();
        db.AuditLog.Add(new AuditEntry {
            OrganizationId = evt.Data.OrganizationId, UserId = evt.Data.Id,
            Action = "user.deprovisioned", Metadata = """{"source":"scim"}""",
        });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
    }
    return Results.Ok();
});
```

### Java 21+ — Spring Security SAML + Spring Boot

```java
// BAD — RelyingPartyRegistration without explicit AssertingPartyDetails verification
@Bean
RelyingPartyRegistrationRepository repo() {
    RelyingPartyRegistration rp = RelyingPartyRegistrations
        .fromMetadataLocation("https://idp.example.com/metadata")
        .registrationId("workos")
        .build();
    return new InMemoryRelyingPartyRegistrationRepository(rp);
}

// SAFE — explicit audience, issuer, signature, and required-signed-assertions
@Bean
RelyingPartyRegistrationRepository repo() {
    X509Certificate idpCert = loadPinnedCertForOrg(...);
    RelyingPartyRegistration rp = RelyingPartyRegistration.withRegistrationId("workos")
        .entityId("https://yourapp.example.com/saml/sp")           // your audience
        .assertionConsumerServiceLocation("https://yourapp.example.com/login/saml2/sso/workos")
        .assertingPartyDetails(party -> party
            .entityId("https://idp.example.com")                    // expected issuer
            .verificationX509Credentials(c -> c.add(Saml2X509Credential.verification(idpCert)))
            .wantAuthnRequestsSigned(true))
        .build();
    OpenSaml4AuthenticationProvider provider = new OpenSaml4AuthenticationProvider();
    provider.setAssertionValidator(OpenSaml4AuthenticationProvider
        .createDefaultAssertionValidatorWithParameters(p -> {
            p.put(SAML2AssertionValidationParameters.SIGNATURE_REQUIRED, true);
            p.put(SAML2AssertionValidationParameters.VALID_AUDIENCES, Set.of("https://yourapp.example.com/saml/sp"));
            p.put(SAML2AssertionValidationParameters.VALID_ISSUERS, Set.of("https://idp.example.com"));
        }));
    return new InMemoryRelyingPartyRegistrationRepository(rp);
}

// SAFE — SCIM webhook controller with HMAC + idempotency
@PostMapping("/api/workos/webhook")
ResponseEntity<Void> webhook(@RequestHeader("WorkOS-Signature") String sig,
                             @RequestBody String body) {
    if (!WorkOSWebhookVerifier.verify(body, sig, webhookSecret, Duration.ofMinutes(5)))
        return ResponseEntity.status(401).build();
    DSyncEvent evt = mapper.readValue(body, DSyncEvent.class);
    if (!processedRepo.insertIfAbsent(evt.id())) return ResponseEntity.ok().build();
    if ("dsync.user.deleted".equals(evt.event())) {
        userService.deprovision(evt.data().id());   // soft-delete + session revoke + audit
    }
    return ResponseEntity.ok().build();
}
```

### Python 3.12+ — `workos-python` + FastAPI

```python
# BAD — no signature check, no idempotency
@app.post("/api/workos/webhook")
async def webhook(req: Request):
    evt = await req.json()
    if evt["event"] == "dsync.user.deleted":
        await db.execute(update(users).where(users.c.workos_user_id == evt["data"]["id"])
                         .values(deleted_at=datetime.utcnow()))
    return {"ok": True}

# SAFE
import workos
from workos.exceptions import BadRequestException

client = workos.WorkOSClient(api_key=os.environ["WORKOS_API_KEY"],
                             client_id=os.environ["WORKOS_CLIENT_ID"])

@app.post("/api/workos/webhook")
async def webhook(req: Request):
    sig = req.headers.get("workos-signature")
    if not sig:
        raise HTTPException(401, "missing signature")
    body = await req.body()
    try:
        evt = client.webhooks.verify_event(
            payload=body.decode(), sig_header=sig,
            secret=os.environ["WORKOS_WEBHOOK_SECRET"], tolerance=300,
        )
    except BadRequestException:
        raise HTTPException(401, "invalid signature")
    async with db.begin() as tx:
        inserted = await tx.execute(
            insert(processed_webhooks).values(event_id=evt.id)
            .on_conflict_do_nothing()
        )
        if inserted.rowcount == 0:
            return {"ok": True}    # already processed
        if evt.event == "dsync.user.deleted":
            await tx.execute(update(users)
                .where(users.c.workos_user_id == evt.data.id)
                .values(deleted_at=datetime.utcnow()))
            await tx.execute(delete(sessions).where(sessions.c.workos_user_id == evt.data.id))
            await tx.execute(insert(audit_log).values(
                organization_id=evt.data.organization_id, action="user.deprovisioned",
                user_id=evt.data.id, metadata={"source": "scim"}))
    return {"ok": True}
```

### C / C++ — N/A (skipped)

WorkOS SSO is a server-side B2B flow. Native desktop / embedded clients should delegate to the OS browser + OAuth (RFC 8252) and never handle SAML/SCIM directly. If your C/C++ server needs WorkOS integration, expose it through a sidecar in Go/Node/Python rather than re-implementing XMLDSig and HMAC-SHA256 in C.

### SQL — schema for org-scoped users, SCIM soft-delete, audit log

```sql
-- Organizations with verified-domain gate before SSO enables.
CREATE TABLE organizations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workos_org_id       TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  domain              TEXT,
  domain_verified_at  TIMESTAMPTZ,                 -- NULL = SSO routing must be refused
  sso_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  scim_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Soft-delete users on dsync.user.deleted (audit preservation).
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workos_user_id    TEXT NOT NULL UNIQUE,
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  email             TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('admin','member')),
  deleted_at        TIMESTAMPTZ,                   -- SCIM soft-delete marker
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_org_active ON users(organization_id) WHERE deleted_at IS NULL;

-- Idempotency key for SCIM webhooks — UNIQUE(event_id) makes retries safe.
CREATE TABLE processed_webhooks (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sign-in / deprovisioning audit log (SOC2 / ISO 27001 evidence).
CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID REFERENCES users(id),
  action          TEXT NOT NULL,                   -- user.signed_in, user.signed_in_failed,
                                                    -- user.deprovisioned, org.sso_configured, ...
  resource_type   TEXT,
  resource_id     TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_org_action_time ON audit_log(organization_id, action, created_at DESC);

-- RLS — every tenant table scoped to current org.
ALTER TABLE users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation_users ON users
  FOR ALL USING (organization_id::text = current_setting('app.current_org_id', true));
CREATE POLICY org_isolation_audit ON audit_log
  FOR ALL USING (organization_id::text = current_setting('app.current_org_id', true));
```

## Tool Integration (2026)

| Tool | Purpose | When |
|------|---------|------|
| **WorkOS Dashboard** | Per-org SAML/SCIM config, IdP cert pinning, domain verification, webhook secret rotation, redirect URI allowlist | Configure every customer org here |
| **SAML tracer** (browser ext) | Inspect raw SAMLRequest / SAMLResponse during dev; decode base64, view XML, verify signature element layout | Debugging IdP integrations |
| **ngrok** (or Cloudflared Tunnel) | Expose local SCIM webhook endpoint to WorkOS during dev | Local SCIM development |
| **JWT.io** | Decode WorkOS-issued access tokens / refresh tokens; verify `iss`, `aud`, `exp` | Debugging OIDC / token issues |
| **WorkOS Vital (test IdP)** | Mock SAML IdP for end-to-end tests without standing up real Okta/Entra | CI / integration tests |
| **CodeQL `javascript-security-and-quality.qls`** | Catch missing signature checks, hardcoded secrets, IDOR patterns | PR gate |
| **Semgrep `p/owasp-top-ten`** | Org-isolation regressions, open-redirect, weak crypto in custom SP code | Every PR |

```bash
# Verify SCIM webhook locally
ngrok http 3000
# Set https://<id>.ngrok-free.app/api/workos/webhook in WorkOS Dashboard → Webhooks

# Lint for missing signature checks
semgrep --config=p/owasp-top-ten --config=p/jwt \
        --include='**/webhook/**' --include='**/saml/**' .

# CodeQL on SP code
codeql database create db --language=javascript --source-root=.
codeql database analyze db --format=sarif-latest --output=codeql.sarif \
        codeql/javascript-security-and-quality.qls
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** for your scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|------|----------|--------|
| CRITICAL | Missing SAML signature verification · accepting any-IdP (no audience/issuer check) · unsigned-SAML acceptance · SCIM webhook signature missing · cross-tenant IDOR · hardcoded prod webhook secret | BLOCK |
| HIGH | Deprovisioning skipped on `dsync.user.deleted` (SOC2 CC6.3 fail) · missing redirect URI allowlist · session not revoked on deprovisioning · missing org isolation on admin endpoint · IdP cert not pinned per org | BLOCK |
| MEDIUM | Missing idempotency on SCIM webhook · audit log missing on auth events · domain verification not enforced before SSO routing · IdP-initiated SAML accepted without explicit allow · missing role check (auth-but-not-authz) | Fix soon |
| LOW | Verbose error message on SAML failure (user-enumeration) · webhook tolerance window too wide (> 5 min) · missing rate limit on `/login` · audit log not surfaced in customer UI | Backlog |

## Letter schema (refinement-loop output contract)

```yaml
finding_id: <sha256(critic+file+line+type)[:12]>
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = corroborated by 2+ engines or runtime test
engine: workos-sso-skill | semgrep | codeql | manual
kind: missing_signature_verification | missing_audience_check | missing_issuer_check |
      unsigned_saml_accepted | scim_webhook_signature_missing | deprovisioning_skipped |
      missing_org_isolation | hardcoded_idp_config | missing_redirect_uri_allowlist |
      missing_idempotency | domain_not_verified | idp_cert_not_pinned
target_file: app/api/workos/webhook/route.ts
line: 14
suggested_fix: "Verify WorkOS-Signature with workos.webhooks.constructEvent before processing payload; return 401 on failure."
owasp: A01 | A02 | A07 | A08
cwe: CWE-287 | CWE-345 | CWE-347 | CWE-639
reference: https://workos.com/docs/sso/saml-security
```

## Sources

- [WorkOS SAML Security Considerations](https://workos.com/docs/sso/saml-security)
- [WorkOS SSO best practices](https://workos.com/guide/sso-best-practices)
- [WorkOS SCIM best practices](https://workos.com/guide/scim-best-practices)
- [WorkOS AuthKit](https://workos.com/docs/authkit)
- [WorkOS Directory Sync](https://workos.com/docs/directory-sync)
- [WorkOS audit logs](https://workos.com/docs/audit-logs)
- [WorkOS webhook signatures](https://workos.com/docs/events/data-syncing)
- [WorkOS SAML assertion failures debugging](https://workos.com/blog/saml-assertion-failures-debugging-guide)
- [SAML 2.0 Technical Overview — OASIS](https://docs.oasis-open.org/security/saml/Post2.0/sstc-saml-tech-overview-2.0.html)
- [Stytch — SCIM protocol explained](https://stytch.com/blog/scim-protocol-explained/)
- [SSOJet — SCIM provisioning best practices](https://ssojet.com/blog/scim-provisioning-best-practices)

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
