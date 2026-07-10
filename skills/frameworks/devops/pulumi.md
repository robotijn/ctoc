# Pulumi CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Install CLI
curl -fsSL https://get.pulumi.com | sh
# Or specific version
curl -fsSL https://get.pulumi.com | sh -s -- --version 3.217.0
# Create new project
pulumi new typescript
# Python requires 3.10+
```

## Claude's Common Mistakes
1. **Hardcodes secrets in code** - Must use pulumi.secret() or config
2. **Uses local state for production** - Remote backend required
3. **Missing stack outputs** - Breaks cross-stack references
4. **Skips preview before up** - Changes without review
5. **Uses Pulumi 2.x patterns** - v3 has breaking changes

## Correct Patterns (2026)
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

interface WebAppArgs {
  instanceType?: string;
  environment: string;
}

// Component resource for reusability
class WebApp extends pulumi.ComponentResource {
  public readonly url: pulumi.Output<string>;
  public readonly instanceId: pulumi.Output<string>;

  constructor(name: string, args: WebAppArgs, opts?: pulumi.ComponentResourceOptions) {
    super("custom:app:WebApp", name, {}, opts);

    const config = new pulumi.Config();
    // Secrets handled properly
    const dbPassword = config.requireSecret("dbPassword");

    const instance = new aws.ec2.Instance(`${name}-server`, {
      instanceType: args.instanceType ?? "t3.micro",
      ami: "ami-0123456789",
      tags: {
        Environment: args.environment,
        ManagedBy: "Pulumi",
        Name: name,
      },
    }, { parent: this });

    this.url = pulumi.interpolate`http://${instance.publicIp}`;
    this.instanceId = instance.id;

    // Register outputs for stack references
    this.registerOutputs({
      url: this.url,
      instanceId: this.instanceId,
    });
  }
}

// Usage
const app = new WebApp("myapp", { environment: pulumi.getStack() });
export const appUrl = app.url;
export const instanceId = app.instanceId;
```

## Version Gotchas
- **Pulumi 3.x**: Python 3.10+ required
- **Pulumi v1/v2**: No longer supported, migrate to v3
- **State backends**: Pulumi Cloud, S3, Azure Blob, GCS supported
- **With CrossGuard**: Policy as Code for compliance

## What NOT to Do
- Do NOT hardcode secrets - use `pulumi.secret()` or config
- Do NOT use local state in production - use remote backend
- Do NOT skip `pulumi preview` before `pulumi up`
- Do NOT forget stack outputs for cross-stack references
- Do NOT use v1/v2 patterns - migrate to v3

## State & Secrets Footguns
The single most common Pulumi security defect Claude ships is a **secret written
in cleartext into the state file** — this is CWE-312 "Cleartext Storage of
Sensitive Information" (cwe.mitre.org/312). Any plain string you put on a
resource input lands in the state backend **unencrypted**. A value is only
encrypted at rest in state when it is a *Pulumi secret*.

```bash
# FOOTGUN: this writes the DB password to state IN PLAINTEXT (CWE-312).
pulumi config set dbPassword "s3cr3t"          # cleartext in Pulumi.<stack>.yaml + state

# RIGHT: --secret encrypts it with the stack's secrets provider.
pulumi config set --secret dbPassword "s3cr3t" # ciphertext at rest
```

- **Secrets provider** — the default provider derives the encryption key from a
  passphrase (`PULUMI_CONFIG_PASSPHRASE`). Lose it and the stack's secrets are
  unrecoverable. For teams, pin a managed KMS provider at stack init so rotation
  and access are auditable:
  ```bash
  pulumi stack init prod --secrets-provider="awskms://alias/pulumi?region=us-east-1"
  # also: azurekeyvault://…, gcpkms://…, hashivault://…
  ```
- **`Output<T>` is async, not a string** — outputs resolve *during* the deploy.
  Never `String(output)` or template-interpolate a raw `Output` into another
  resource's input; you get `Calling [toString] on an [Output<T>]` and a
  literal placeholder in the cloud. Compose with `pulumi.interpolate` or
  `.apply()`:
  ```typescript
  const url = pulumi.interpolate`https://${bucket.bucketDomainName}`;   // right
  const arn = role.arn.apply(a => a.toUpperCase());                     // right
  // secrets stay secret across apply(): the result is still a secret Output
  ```
- **Stack references** cross the stack boundary; a secret read via
  `StackReference.getOutput()` comes back as a plain value unless you use
  `requireOutputValue`/`getOutputDetails` — treat any imported credential as
  secret again on the consuming side.
- **`protect: true`** on stateful resources (databases, buckets) blocks
  `pulumi destroy` from deleting them by accident — opt in explicitly.

## Correctness & Drift — Replacement on Immutable Change
Editing an **immutable** provider property (an EC2 AMI, an RDS engine, a name that
forces new) does NOT update in place — Pulumi schedules a **replace** (create new,
delete old). On a stateful resource that is silent data loss.

```typescript
// Read the preview: `+-` means REPLACE. Guard the order of operations:
const db = new aws.rds.Instance("db", {/* … */}, {
  deleteBeforeReplace: false,          // create the replacement FIRST (default)
  ignoreChanges: ["engineVersion"],    // stop out-of-band drift forcing a replace
});
```
Always read `pulumi preview` for `+-` (replace) and `-` (delete) markers before
`pulumi up` in production; `--diff` shows the exact property forcing it.

## Security — Provider Credentials & Supply Chain
- **Never hard-code cloud credentials** in the program — that is CWE-798 "Use of
  Hard-coded Credentials" (cwe.mitre.org/798). Source them from the environment /
  OIDC / an instance role; Pulumi reads the same credential chain as the native
  cloud SDK. In CI, use short-lived OIDC federation, not a long-lived static key.
- **Pin plugin/provider versions** in `package.json` / `requirements.txt` and the
  `Pulumi.yaml` plugin block so a compromised or yanked provider release cannot be
  silently pulled at deploy time.
- **`pulumi import`** writes the imported resource's current state — review the
  generated code for embedded secrets before committing it.

## Testing Conventions
```typescript
// Unit test with mocks — no cloud calls (pulumi.runtime.setMocks).
import * as pulumi from "@pulumi/pulumi";
pulumi.runtime.setMocks({
  newResource: (args) => ({ id: `${args.name}-id`, state: args.inputs }),
  call: (args) => args.inputs,
});
// then assert on resource inputs, e.g. that tags.Environment is set and that
// a secret input is actually marked secret (isSecret).
```
Policy-as-code with **CrossGuard** (`@pulumi/policy`) enforces org rules
(no public S3, encryption required) at `preview`/`up` time — run it in CI.

## Version-Specific Gotchas (dated, sourced)
- **Pulumi (Python SDK) 3.251.0** is the current release, uploaded
  **2026-07-08**; the CLI tracks the same 3.x line. Python SDK requires
  Python 3.9+. [pypi.org/project/pulumi, retrieved 2026-07-10]
- **v1/v2 are end-of-life** — migrate to v3; state and provider protocols changed.
  [pulumi.com/docs, retrieved 2026-07-10]
- **Secrets provider is chosen at `stack init`** and is awkward to change later —
  pick KMS over passphrase up front for team stacks.
  [pulumi.com/docs/concepts/secrets, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Pulumi CLI / SDK releases (PyPI): https://pypi.org/project/pulumi/
- Secrets & secrets providers: https://www.pulumi.com/docs/concepts/secrets/
- Inputs & Outputs (`apply`/`interpolate`): https://www.pulumi.com/docs/concepts/inputs-outputs/
- Stack references: https://www.pulumi.com/docs/concepts/stack/#stackreferences
- Testing (mocks / property tests): https://www.pulumi.com/docs/using-pulumi/testing/
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
- CWE-798 (Use of Hard-coded Credentials): https://cwe.mitre.org/data/definitions/798.html
