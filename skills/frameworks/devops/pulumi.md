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
