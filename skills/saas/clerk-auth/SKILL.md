---
name: clerk-auth
description: Implement Clerk authentication for a B2C/B2B SaaS — server-side verification, signup, login, MFA/passkeys, organizations, webhooks, session management, route protection.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "clerk auth"
  - "clerk authentication"
  - "user signup"
  - "user login"
  - "session management"
  - "email verification"
  - "auth provider"
  - "B2C auth"
  - "B2B auth"
  - "passkey"
  - "MFA"
  - "JWT verification"
  - "organization management"
  - "clerk webhook"
related_skills:
  - saas/stripe-subscriptions
  - saas/multi-tenancy-row-level
  - security/input-validation-checker
  - security/sast-scanner
  - api/rate-limiting
effort_level: medium
model_optimized_for: opus-4-7
model: opus
tools: Read, Write, Edit, Bash
---

# Clerk Auth (saas skill)

> Implementation + audit guide for Clerk auth across Next.js 15, C# (.NET 9), Java 21+, Python 3.12+, and SQL. Used by the `saas/b2c-subscription` and `saas/b2b-sales-led` templates.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You implement Clerk auth correctly and audit existing Clerk integrations for the most common production failures: client-trust attacks, missing webhook verification, MFA gaps, and org-scoping holes that produce IDOR.

You assume every JWT, every webhook, every client-supplied claim is attacker-controlled until verified server-side.

## 2026 Best Practices (Clerk SaaS auth)

- **Server-side verify every request.** Never trust client-supplied `userId`, `orgId`, or `role` claims. Use `auth()` / `currentUser()` (Next.js) or `clerkClient.verifyToken()` / `authenticateRequest()` (backend SDKs) — these re-verify the JWT signature against Clerk's JWKS on every call. A decoded JWT body is data, not proof.
- **Networkless verification via `jwtKey`.** For high-throughput backends, pass the JWT signing key (`CLERK_JWT_KEY`, PEM-encoded public key) so `verifyToken()` validates the signature locally without a JWKS network call. Always pair with `authorizedParties` to bind tokens to your frontend origin.
- **Session tokens are short-lived (60 s).** Clerk session JWTs expire in ~60 seconds and refresh automatically via the SDK. Treat any token older than 60 s as expired — do not accept long-lived bearer tokens for user sessions. Use **machine-to-machine (M2M) tokens** with `clerkClient.m2m.verify()` for service-to-service.
- **Passkeys / WebAuthn are the default in 2026.** Enable passkeys in the Clerk Dashboard; they provide phishing-resistant MFA-by-default (device possession + biometric). Treat passwords as legacy fallback. Available on Clerk Pro and above.
- **Enforce MFA at the application layer for sensitive routes.** Turn on org-level MFA enforcement for admin roles in the Clerk Dashboard, AND re-check `user.twoFactorEnabled` server-side before billing, data export, email change, or admin actions. Dashboard enforcement alone is not sufficient — a user can bypass it on routes that don't check.
- **Webhook signature verification is mandatory.** Clerk webhooks are signed via Svix. Use Clerk's `verifyWebhook()` helper (or the raw Svix `Webhook` class) on every webhook handler. An unverified webhook endpoint is an open user-creation API.
- **Sync to your DB via webhooks; don't query Clerk per request.** On `user.created` / `user.updated` / `user.deleted` / `organization.created` / `organizationMembership.created`, persist `clerk_user_id`, `clerk_org_id`, `role`, and email denormalized into your DB. Query latency goes from ~100 ms (Clerk API) to ~1 ms (local DB).
- **Org-scope every query.** In multi-tenant apps, every SELECT/UPDATE/DELETE must filter by `clerk_org_id = current_org`. A missing scope is an IDOR (see [[sast-scanner]] §0). Pair with [[multi-tenancy-row-level]] for Postgres RLS.
- **Revoke sessions on suspicious activity.** Use `clerkClient.sessions.revokeSession(sessionId)` on password change, suspicious IP shift, or admin action. Build a "sign out everywhere" affordance.
- **Rate-limit auth endpoints.** Sign-in, sign-up, OTP, and webhook endpoints need per-IP and per-user rate limits — see [[rate-limiting]]. Clerk handles UI flows on hosted pages, but custom backends and webhook receivers do not.
- **Never hardcode keys.** `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` belong in environment variables and secret managers — never in source. See [[secrets-detector]].

## Vulnerability Categories

Categories below mirror the structure of [[sast-scanner]]. The clerk-auth skill is the canonical critic for findings in these categories.

### 0. Missing server-side verify (TOP PRIORITY)

The #1 Clerk failure: trusting client-supplied identity. The fix is always to round-trip through `auth()` / `verifyToken()` / `authenticateRequest()`.

```typescript
// BAD (Next.js Route Handler): trusts a userId header from the client
import { NextRequest, NextResponse } from 'next/server';
export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');   // attacker controls this
  const orders = await db.order.findMany({ where: { userId } });
  return NextResponse.json(orders);
}

// SAFE: verify via auth() — re-checks the JWT signature server-side
import { auth } from '@clerk/nextjs/server';
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const orders = await db.order.findMany({ where: { userId, orgId } });
  return NextResponse.json(orders);
}
```

```typescript
// BAD (Next.js Server Action): reads userId from form data
'use server';
export async function deleteOrder(formData: FormData) {
  const userId = formData.get('userId') as string;  // attacker controls
  const orderId = formData.get('orderId') as string;
  await db.order.delete({ where: { id: orderId, userId } });
}

// SAFE: re-derive identity from auth() inside the Server Action
'use server';
import { auth } from '@clerk/nextjs/server';
export async function deleteOrder(formData: FormData) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error('unauthorized');
  const orderId = formData.get('orderId') as string;
  // org-scope the delete — never trust the client's orgId either
  await db.order.delete({ where: { id: orderId, userId, orgId } });
}
```

### 1. Raw JWT trust (decode-without-verify)

Decoding a JWT body without verifying its signature is equivalent to no auth at all — an attacker forges any payload.

```csharp
// BAD (.NET 9): decoding the JWT body but never verifying the signature
using System.IdentityModel.Tokens.Jwt;
app.MapGet("/api/me", (HttpContext ctx) => {
    var auth = ctx.Request.Headers.Authorization.ToString().Replace("Bearer ", "");
    var token = new JwtSecurityToken(auth);          // parses, does NOT verify
    var sub = token.Claims.First(c => c.Type == "sub").Value;
    return Results.Ok(new { userId = sub });          // forged tokens pass
});

// SAFE (.NET 9): verify via Clerk JWKS using JwtBearer authentication
//
// In Program.cs:
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options => {
        // Clerk JWKS endpoint — find it under Clerk Dashboard > API Keys
        options.Authority = builder.Configuration["Clerk:Issuer"];   // e.g. https://your-instance.clerk.accounts.dev
        options.TokenValidationParameters = new TokenValidationParameters {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidAudiences = builder.Configuration.GetSection("Clerk:AuthorizedParties").Get<string[]>(),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(5),     // Clerk sessions are short-lived
        };
    });
builder.Services.AddAuthorization();

app.MapGet("/api/me", [Authorize] (ClaimsPrincipal user) => {
    var userId = user.FindFirstValue("sub");
    var orgId  = user.FindFirstValue("org_id");      // present when org-scoped session
    if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(orgId))
        return Results.Forbid();
    return Results.Ok(new { userId, orgId });
});
```

```java
// BAD (Java 21 / Spring Security 6.x): parsing without verification
import io.jsonwebtoken.Jwts;
@GetMapping("/api/me")
public Map<String,String> me(@RequestHeader("Authorization") String authz) {
    var token = authz.replace("Bearer ", "");
    var body  = Jwts.parser().parseClaimsJwt(token).getBody();  // parseClaimsJwt = unsigned parse
    return Map.of("userId", body.getSubject());                  // forged JWTs accepted
}

// SAFE (Java 21 / Spring Security 6.x): JWKS-backed resource server
//
// application.yml:
//   spring:
//     security:
//       oauth2:
//         resourceserver:
//           jwt:
//             jwk-set-uri: https://your-instance.clerk.accounts.dev/.well-known/jwks.json
//             issuer-uri:  https://your-instance.clerk.accounts.dev
//
// SecurityConfig.java:
@Configuration
@EnableWebSecurity
public class SecurityConfig {
  @Bean SecurityFilterChain api(HttpSecurity http) throws Exception {
    return http
      .authorizeHttpRequests(a -> a
        .requestMatchers("/api/clerk/webhook").permitAll()       // webhook handles its own signature
        .anyRequest().authenticated())
      .oauth2ResourceServer(o -> o.jwt(jwt -> jwt
        .jwtAuthenticationConverter(this::convert)))
      .csrf(csrf -> csrf.ignoringRequestMatchers("/api/clerk/webhook"))
      .build();
  }
  private AbstractAuthenticationToken convert(Jwt jwt) {
    String azp = jwt.getClaimAsString("azp");
    if (!"https://app.example.com".equals(azp))                 // pin authorized party
      throw new BadCredentialsException("untrusted azp");
    return new JwtAuthenticationToken(jwt);
  }
}

@GetMapping("/api/me")
public Map<String,String> me(@AuthenticationPrincipal Jwt jwt) {
    return Map.of(
      "userId", jwt.getSubject(),
      "orgId",  jwt.getClaimAsString("org_id"));
}
```

```python
# BAD (Python 3.12 / FastAPI): trusting an unverified JWT
from fastapi import FastAPI, Header
import jwt as pyjwt                                     # PyJWT
app = FastAPI()

@app.get("/api/me")
async def me(authorization: str = Header()):
    token = authorization.replace("Bearer ", "")
    body  = pyjwt.decode(token, options={"verify_signature": False})   # NEVER do this
    return {"userId": body["sub"]}                       # forged tokens accepted

# SAFE (Python 3.12 / FastAPI): clerk-backend-api with authenticate_request
from fastapi import FastAPI, Request, HTTPException, Depends
from clerk_backend_api import Clerk, AuthenticateRequestOptions
import os

app = FastAPI()
clerk = Clerk(bearer_auth=os.environ["CLERK_SECRET_KEY"])

async def require_clerk(request: Request):
    state = clerk.authenticate_request(
        request,
        AuthenticateRequestOptions(
            authorized_parties=["https://app.example.com"],   # MUST pin
            # jwt_key=os.environ["CLERK_JWT_KEY"],            # networkless mode
        ),
    )
    if not state.is_signed_in:
        raise HTTPException(401, "unauthorized")
    return state.payload                                       # verified claims

@app.get("/api/me")
async def me(claims: dict = Depends(require_clerk)):
    if not claims.get("org_id"):
        raise HTTPException(403, "org required")
    return {"userId": claims["sub"], "orgId": claims["org_id"]}
```

> **C / C++**: server-only language for native services. Clerk does not ship a first-party C SDK. If you must verify Clerk JWTs from C/C++, fetch the JWKS over HTTPS (libcurl), cache the keys, and verify the RS256 signature with OpenSSL (`EVP_DigestVerify*`) — but this is rarely the right architecture. Prefer a sidecar in TypeScript/Python/.NET that exposes verified identity over a local Unix socket. **Skip C/C++ unless explicitly required.**

### 2. Missing webhook signature verification

An unverified Clerk webhook handler is a free user-creation endpoint — attackers POST forged `user.created` events and become provisioned users in your DB.

```typescript
// BAD (Next.js): no signature check
export async function POST(req: NextRequest) {
  const body = await req.json();                         // attacker-crafted
  if (body.type === 'user.created') {
    await db.user.create({ data: { clerkId: body.data.id, email: body.data.email_addresses[0].email_address } });
  }
  return NextResponse.json({ ok: true });
}

// SAFE: Clerk's verifyWebhook helper (preferred — handles svix headers + secret loading)
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';

export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);                       // throws on bad signature
  } catch {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }

  switch (evt.type) {
    case 'user.created':
      await db.insert(users).values({
        clerkUserId: evt.data.id,
        email: evt.data.email_addresses[0].email_address,
        primaryOrgId: null,
      }).onConflictDoNothing();
      break;
    case 'user.updated':
      await db.update(users).set({
        email: evt.data.email_addresses[0].email_address,
      }).where(eq(users.clerkUserId, evt.data.id));
      break;
    case 'user.deleted':
      // soft-delete or anonymize per privacy policy / GDPR Art. 17
      await db.update(users).set({ deletedAt: new Date(), email: null })
              .where(eq(users.clerkUserId, evt.data.id!));
      break;
    case 'organization.created':
      await db.insert(organizations).values({
        clerkOrgId: evt.data.id,
        name: evt.data.name,
      }).onConflictDoNothing();
      break;
    case 'organizationMembership.created':
      await db.insert(memberships).values({
        clerkUserId: evt.data.public_user_data.user_id,
        clerkOrgId:  evt.data.organization.id,
        role:        evt.data.role,
      }).onConflictDoNothing();
      break;
  }
  return NextResponse.json({ ok: true });
}
```

```python
# SAFE (Python 3.12 / FastAPI): raw svix verification — same shape in Flask/Django
from fastapi import FastAPI, Request, HTTPException
from svix.webhooks import Webhook, WebhookVerificationError
import os, json

app = FastAPI()
wh  = Webhook(os.environ["CLERK_WEBHOOK_SIGNING_SECRET"])

@app.post("/api/clerk/webhook")
async def clerk_webhook(request: Request):
    body = await request.body()
    try:
        evt = wh.verify(body, dict(request.headers))      # svix-id / svix-timestamp / svix-signature
    except WebhookVerificationError:
        raise HTTPException(400, "bad signature")
    # ... dispatch evt["type"] ...
    return {"ok": True}
```

### 3. MFA not enforced for admin roles

Enabling MFA in the Clerk Dashboard is necessary but not sufficient — the server must re-check on protected routes.

```typescript
// BAD: admin route protected by role only, no MFA gate
import { auth, currentUser } from '@clerk/nextjs/server';
export async function POST() {
  const { orgRole } = await auth();
  if (orgRole !== 'admin') return new Response('forbidden', { status: 403 });
  // proceed with destructive admin action — but attacker who phished a password is now admin
}

// SAFE: require MFA on admin actions
export async function POST() {
  const { orgRole } = await auth();
  const user = await currentUser();
  if (orgRole !== 'admin') return new Response('forbidden', { status: 403 });
  if (!user?.twoFactorEnabled) {
    return new Response('mfa-required', { status: 403, headers: { 'X-Clerk-Hint': 'enroll-mfa' } });
  }
  // ... admin action ...
}
```

For C# / Java / Python, the equivalent check reads `two_factor_enabled` (or fetches the user via `clerkClient.users.getUser(userId)`) before any privileged action.

### 4. Missing org-isolation (IDOR risk)

Every DB query in a multi-tenant Clerk app must filter by `clerk_org_id`. A missing scope leaks across tenants.

```typescript
// BAD: returns ALL orders across ALL orgs — IDOR
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('unauthorized', { status: 401 });
  return Response.json(await db.order.findMany());        // no orgId filter
}

// BAD: trusts orgId from the URL — attacker swaps to another org
export async function GET(req: NextRequest, { params }: { params: { orgId: string } }) {
  return Response.json(await db.order.findMany({ where: { orgId: params.orgId } }));
}

// SAFE: derive orgId from auth(), never from the URL
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return new Response('forbidden', { status: 403 });
  return Response.json(await db.order.findMany({ where: { orgId } }));
}
```

```sql
-- SAFE: org-scoped query with parameter binding (Postgres / Drizzle / Prisma / EF Core all parameterize)
SELECT id, name, total_cents, created_at
FROM   orders
WHERE  clerk_org_id = $1                  -- always present in WHERE
  AND  deleted_at IS NULL
ORDER  BY created_at DESC
LIMIT  50;
```

### 5. Hardcoded keys

Treat `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, and `CLERK_WEBHOOK_SIGNING_SECRET` like database passwords. Catch leaks via [[secrets-detector]]; rotate immediately on exposure via the Clerk Dashboard.

Patterns to flag:
- `CLERK_SECRET_KEY = "sk_live_..."` literal in source (any language)
- `process.env.CLERK_SECRET_KEY || "sk_live_..."` fallback literal
- `.env` files committed to git
- Secret keys in client-side bundles (`NEXT_PUBLIC_CLERK_SECRET_KEY` — should never exist)

### 6. Missing rate-limiting on auth endpoints

Clerk's hosted UI handles its own rate limiting. Your custom auth endpoints (custom sign-up forms, OTP relays, M2M token mint, webhook receivers) do not. Pair with [[rate-limiting]].

Minimum bars:
- Sign-in / sign-up: 10 req / min / IP
- OTP / email verification resend: 3 req / min / user
- Webhook receiver: 1000 req / min / source (svix retries can spike)
- M2M token mint: 60 req / min / service identity

## Database schema (SQL)

Denormalize Clerk identity into your DB. This avoids a Clerk API round-trip on every request and lets you JOIN auth identity with your business data.

```sql
-- Postgres 16+ schema for a multi-tenant SaaS using Clerk + RLS
CREATE TABLE organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_org_id    text NOT NULL UNIQUE,             -- 'org_2abc...'
  name            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX idx_organizations_clerk_org_id ON organizations (clerk_org_id) WHERE deleted_at IS NULL;

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id   text NOT NULL UNIQUE,             -- 'user_2abc...'
  email           text,                              -- nullable to allow GDPR anonymize
  primary_org_id  uuid REFERENCES organizations(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX idx_users_clerk_user_id ON users (clerk_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_primary_org_id ON users (primary_org_id) WHERE deleted_at IS NULL;

CREATE TABLE organization_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id   text NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
  clerk_org_id    text NOT NULL REFERENCES organizations(clerk_org_id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('admin','basic_member','guest')),  -- mirror Clerk roles
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clerk_user_id, clerk_org_id)
);
CREATE INDEX idx_memberships_user_org ON organization_memberships (clerk_user_id, clerk_org_id);
CREATE INDEX idx_memberships_org_role ON organization_memberships (clerk_org_id, role);

-- Business tables denormalize clerk_org_id for cheap org-scoped queries
CREATE TABLE orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_org_id    text NOT NULL REFERENCES organizations(clerk_org_id) ON DELETE CASCADE,
  clerk_user_id   text NOT NULL REFERENCES users(clerk_user_id),
  total_cents     bigint NOT NULL CHECK (total_cents >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX idx_orders_org ON orders (clerk_org_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_user ON orders (clerk_user_id, created_at DESC) WHERE deleted_at IS NULL;

-- Row-level security: every query MUST set app.current_clerk_org_id (see multi-tenancy-row-level)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_org_isolation ON orders
  USING (clerk_org_id = current_setting('app.current_clerk_org_id', true));
```

## Implementation pattern (Next.js 15 — primary path)

### 1. Install + configure

```bash
npm install @clerk/nextjs svix
```

```env
# Placeholders — replace with real values from the Clerk Dashboard.
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_<REDACTED>
CLERK_SECRET_KEY=sk_live_<REDACTED>
CLERK_WEBHOOK_SIGNING_SECRET=whsec_<EXAMPLE>
CLERK_JWT_KEY=<PEM_PUBLIC_KEY>          # optional, enables networkless verifyToken
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding
```

### 2. Middleware (route protection)

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/account(.*)',
  '/settings(.*)',
  '/api/(?!stripe/webhook|clerk/webhook).*',  // protect all API except signed webhooks
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

### 3. Server-side auth in Route Handlers / Server Components

See "Missing server-side verify" above for the canonical `auth()` and `currentUser()` patterns.

### 4. UI components

```tsx
// app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs';
export default function Page() { return <SignIn />; }

// app/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs';
export default function Page() { return <SignUp />; }

// app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs';
export default function RootLayout({ children }) {
  return <ClerkProvider><html><body>{children}</body></html></ClerkProvider>;
}
```

### 5. User menu

```tsx
// components/UserMenu.tsx
import { UserButton, SignedIn, SignedOut, SignInButton, OrganizationSwitcher } from '@clerk/nextjs';
export function UserMenu() {
  return (
    <>
      <SignedIn>
        <OrganizationSwitcher />
        <UserButton />
      </SignedIn>
      <SignedOut><SignInButton /></SignedOut>
    </>
  );
}
```

## Critical pitfalls

1. **Middleware matcher misses API routes** — make sure `(api|trpc)(.*)` is in the matcher config.
2. **Webhook signing not verified** — use Clerk's `verifyWebhook()` or raw svix; verify `svix-id`, `svix-timestamp`, `svix-signature` headers.
3. **User created in Clerk but missing in your DB** — webhook race condition or replay failure; implement provision-on-first-access as a fallback (idempotent insert).
4. **Forgot to exclude webhooks from auth middleware** — exclude `/api/stripe/webhook` AND `/api/clerk/webhook` (signatures protect them, but `auth.protect()` will 401 them otherwise).
5. **Email verification not enforced** — turn on "require verification" in Clerk Dashboard; without it, anyone can sign up with `foo@victim.com`.
6. **Session expiry misconfigured** — Clerk default is short-lived 60 s session tokens with automatic refresh; don't extend session token TTL. The session itself (refresh) defaults to 7d.
7. **Trusting `orgId` from URL** — always pull `orgId` from `auth()`, never from `params`.
8. **No org sync on user.deleted** — orphans memberships, orders, and audit rows. Cascade or soft-delete.

## Test plan

```typescript
describe('Clerk integration', () => {
  it('protected route returns 401 without session', async () => { /* ... */ });
  it('protected route returns data with valid session', async () => { /* ... */ });
  it('webhook creates user in DB on user.created', async () => { /* ... */ });
  it('webhook creates organization on organization.created', async () => { /* ... */ });
  it('webhook creates membership on organizationMembership.created', async () => { /* ... */ });
  it('webhook rejects bad signature', async () => { /* ... */ });
  it('admin route rejects when twoFactorEnabled is false', async () => { /* ... */ });
  it('order list scoped by orgId from auth(), never URL params', async () => { /* ... */ });
  it('UserButton renders SignIn when signed out', async () => { /* ... */ });
});
```

## Choosing Clerk vs alternatives

| Provider | Best for | Trade-off |
|---|---|---|
| **Clerk** | B2C SaaS, fast launch, built-in passkeys + MFA + Organizations | Vendor lock-in, $ per MAU; passkeys/MFA require Pro plan |
| **WorkOS** | B2B with enterprise SSO (SAML/OIDC), SCIM, audit logs | More config; pricier; no consumer UI |
| **Supabase Auth** | When already on Supabase DB | Less polish than Clerk; no built-in passkeys until recently |
| **Auth.js** | Custom flows, OSS | More code to maintain; no hosted UI |
| **Lucia** | Self-hosted, modern | DIY UI; deprecated as of 2025 — use Better Auth instead |

For the `saas/b2c-subscription` template, **Clerk is the default**. For `saas/b2b-sales-led`, **WorkOS** if you need SAML/SCIM on day one; **Clerk + Organizations** if you're starting with PLG and SAML is post-PMF.

## Tool Integration (2026)

| Tool | Purpose | Notes |
|---|---|---|
| **Clerk CLI** (`@clerk/cli`) | Generate types, sync env, run local dev tunnel | `clerk dev` exposes a tunnel for webhook testing |
| **Clerk Dashboard** | Webhook setup, MFA enforcement, passkey enablement, org settings, JWT key export | Webhook signing secret rotates here — must redeploy after rotation |
| **Svix CLI** | Replay / inspect webhook deliveries | `svix listen` for local debugging |
| **ngrok / cloudflared** | Tunnel localhost for webhook receipt during dev | Use Clerk Dashboard "Test webhook" alongside; ngrok URLs change on free tier — pin a paid subdomain |
| **JWT.io** | Decode session tokens for debugging | Decode-only; do NOT paste production tokens (sensitive claims) |
| **Postman / Bruno** | Test M2M tokens via Bearer auth | Set `Authorization: Bearer <token>` and hit verified backend route |
| **MFA enforcement settings** | Clerk Dashboard > User & Authentication > Multi-factor | Enable TOTP + Passkey + Backup codes; enforce per role |
| **CodeQL / Semgrep** | Static analysis to flag missing `auth()` calls, unverified webhooks | Pair with [[sast-scanner]] rule packs |

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when this skill produces a human-readable scan report. When clerk-auth emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | Missing server-side verify on a protected route · raw JWT trust (decode-without-verify) · missing webhook signature verification · hardcoded `CLERK_SECRET_KEY` in source · missing org-isolation producing cross-tenant IDOR | BLOCK |
| HIGH | MFA not enforced for admin role · webhook handler not idempotent (replay-vulnerable) · orgId pulled from URL params instead of `auth()` · session revocation missing on password change | BLOCK |
| MEDIUM | Missing rate-limiting on custom sign-up endpoint · webhook handler missing for `user.deleted` (orphan rows) · `authorizedParties` not pinned · email verification not enforced in Dashboard | Fix soon |
| LOW | UserMenu missing `OrganizationSwitcher` · `CLERK_JWT_KEY` not set (networked verify works but adds latency) · ClerkProvider missing `appearance` theming | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = grep + dataflow corroborate; low = single signal
engine: clerk-auth | semgrep | codeql | manual
kind: missing-verify | raw-jwt-trust | missing-webhook-verify | mfa-not-enforced |
      missing-org-isolation | hardcoded-key | missing-rate-limit |
      webhook-not-idempotent | url-orgid-trust | session-not-revoked
target_file: app/api/orders/route.ts
target_line: 14
sink: "db.order.findMany"                           # the unsafe operation
source: "params.orgId" | "req.headers.x-user-id" | "JSON.parse(authHeader)"
suggested_fix: |
  Replace client-supplied identity with server-derived identity from `auth()`:
    const { userId, orgId } = await auth();
    if (!userId || !orgId) return new Response('forbidden', { status: 403 });
    return Response.json(await db.order.findMany({ where: { orgId } }));
owasp: A01           # Broken Access Control (most common mapping)
cwe: CWE-639         # Authorization Bypass Through User-Controlled Key
reference: https://clerk.com/docs/guides/sessions/manual-jwt-verification
```

The integrator uses `confidence` to weight findings — a `confidence: low` single-source finding doesn't block phase advancement on its own, but two corroborating signals (e.g., grep finds the pattern AND clerk-auth's dataflow walk confirms exploitable taint to a DB sink) escalate the finding.

## Sources

- [Clerk Next.js Quickstart](https://clerk.com/docs/quickstarts/nextjs)
- [Clerk: verifyToken() backend reference](https://clerk.com/docs/reference/backend/verify-token)
- [Clerk: authenticateRequest() backend reference](https://clerk.com/docs/reference/backend/authenticate-request)
- [Clerk: Manual JWT verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification)
- [Clerk: Session tokens](https://clerk.com/docs/guides/sessions/session-tokens)
- [Clerk: Webhooks overview](https://clerk.com/docs/guides/development/webhooks/overview)
- [Clerk: Organizations / multi-tenant B2B](https://clerk.com/docs/guides/organizations/overview)
- [Clerk: Multi-tenant architecture](https://clerk.com/docs/guides/how-clerk-works/multi-tenant-architecture)
- [Clerk: Passkeys in Next.js](https://clerk.com/blog/how-do-i-implement-passkeys-in-nextjs)
- [Clerk Python SDK (clerk-backend-api)](https://github.com/clerk/clerk-sdk-python)
- [Clerk C# SDK — Authentication & JWT Handling](https://deepwiki.com/clerk/clerk-sdk-csharp/3.2-authentication-and-jwt-handling)
- [How Clerk powers webhooks with Svix](https://www.svix.com/customers/clerk/)

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
