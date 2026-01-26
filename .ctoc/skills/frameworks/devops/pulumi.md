# Pulumi CTO
> Infrastructure-as-code leader demanding real programming languages with type-safe resource management.

## Commands
```bash
# Setup | Dev | Test
pulumi new typescript --name myinfra
pulumi preview --diff
pulumi up --yes && pulumi stack export > backup.json
```

## Non-Negotiables
1. Stack organization for environment separation (dev/staging/prod)
2. Component resources for abstraction and reusability
3. Config and secrets via pulumi config with encryption
4. Remote state backend (Pulumi Cloud, S3, or Azure Blob)
5. Policy as Code with CrossGuard for compliance

## Red Lines
- Hardcoded secrets in code - use pulumi.secret() or config
- Local state files in production - remote backend required
- Missing stack outputs for cross-stack references
- No component abstractions for repeated patterns
- Ignoring preview before up - always review changes

## Pattern: Component Resource with Config
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

interface WebAppArgs {
  instanceType?: string;
  environment: string;
}

class WebApp extends pulumi.ComponentResource {
  public readonly url: pulumi.Output<string>;

  constructor(name: string, args: WebAppArgs, opts?: pulumi.ComponentResourceOptions) {
    super("custom:app:WebApp", name, {}, opts);

    const config = new pulumi.Config();
    const dbPassword = config.requireSecret("dbPassword");

    const instance = new aws.ec2.Instance(`${name}-server`, {
      instanceType: args.instanceType ?? "t3.micro",
      ami: "ami-0123456789",
      tags: {
        Environment: args.environment,
        ManagedBy: "Pulumi",
      },
    }, { parent: this });

    this.url = pulumi.interpolate`http://${instance.publicIp}`;
    this.registerOutputs({ url: this.url });
  }
}

export const app = new WebApp("myapp", { environment: pulumi.getStack() });
export const appUrl = app.url;
```

## Integrates With
- **DB**: RDS/CloudSQL resources with secret config for passwords
- **Auth**: IAM roles/policies as code with least privilege
- **Cache**: ElastiCache/Memorystore with security group rules

## Common Errors
| Error | Fix |
|-------|-----|
| `error: resource already exists` | Import existing resource with `pulumi import` |
| `secret config value required` | Set with `pulumi config set --secret KEY VALUE` |
| `checkpoint file locked` | Cancel pending operation with `pulumi cancel` |

## Prod Ready
- [ ] Stack policies enforced via CrossGuard
- [ ] Drift detection enabled with scheduled previews
- [ ] State backed up with stack export automation
- [ ] CI/CD pipeline uses service principal, not personal tokens
