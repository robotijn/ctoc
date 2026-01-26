# Pulumi CTO
> Infrastructure as Code with real languages.

## Non-Negotiables
1. Stack organization (dev/staging/prod)
2. Component resources for abstraction
3. Config and secrets management
4. State backend (Pulumi Cloud or S3)
5. Policy as Code

## Red Lines
- Hardcoded secrets
- Local state in production
- Missing stack outputs
- No component abstractions
- Ignoring preview before up

## Pattern
```typescript
const bucket = new aws.s3.Bucket("my-bucket", {
  versioning: { enabled: true },
  tags: { Environment: pulumi.getStack() },
});

export const bucketName = bucket.id;
```
