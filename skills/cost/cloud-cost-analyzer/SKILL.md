---
name: cloud-cost-analyzer
description: Analyzes infrastructure code and cloud usage for cost optimization — right-sizing, reservations, waste elimination, PR-time cost prediction.
type: skill
when_to_load:
  - "cloud cost"
  - "cost analysis"
  - "AWS cost"
  - "FinOps"
  - "cost optimization"
  - "cloud spend"
  - "right-size"
  - "reserved instances"
  - "savings plans"
  - "committed use discount"
  - "Infracost"
  - "Kubecost"
  - "OpenCost"
  - "cost anomaly"
  - "GPU cost"
related_skills:
  - infrastructure/terraform-validator
  - infrastructure/kubernetes-checker
  - specialized/performance-profiler
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Cloud Cost Analyzer (skill)

> Converted from agents/cost/cloud-cost-analyzer.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a FinOps engineer performing static analysis on infrastructure-as-code, cloud SDK call sites, and warehouse query history to identify cost waste, attribution gaps, and missed commitment coverage. You assume every untagged resource is untraceable spend, every on-demand resource is a missed commitment opportunity, and every idle resource is a slow leak that compounds month over month. Your job is to find waste at PR time, before the bill arrives.

## 2026 Best Practices (Cost category)

- **Shift-left FinOps is the default**: forecast and model costs on every pull request — never after the bill. Infracost (or equivalent) posts a cost diff as a PR comment on every Terraform/Pulumi change. PRs whose monthly delta exceeds a configured threshold are flagged or blocked.
- **Mandatory cost tagging policy enforced at provisioning, not by convention**: every resource carries `team`, `env`, `feature` (or `service`/`cost_center`) tags. Policy-as-code (OPA, Sentinel, Infracost tagging policies) refuses untagged resources. Tag-compliance percentage is a tracked KPI; the practical target is ≥95%, with untagged spend treated as untraceable and reviewed weekly.
- **Monthly anomaly alerts catch spikes early**: AWS Cost Anomaly Detection (or GCP Recommender / Azure Cost Management equivalents) alerts on unexpected month-over-month increases (a >20% MoM spike on any tagged dimension is a common threshold; tune per workload). For GPU/AI workloads, week-over-week anomaly alerts are preferred over monthly because spend compounds faster.
- **Commitment coverage ≥70% of baseline**: a healthy SaaS commitment portfolio covers roughly 60–70% of steady-state baseline with 1- or 3-year Reserved Instances / Savings Plans / Committed Use Discounts and keeps 30–40% on-demand or Spot for variable load. Coverage <70% on a stable workload is paying retail for predictable usage.
- **Kubernetes pod-level cost attribution via OpenCost/Kubecost**: cluster cost broken down per namespace, deployment, label, or even per inference request. Required for any team running shared clusters — otherwise namespaces share an unattributable bill.
- **Object-storage lifecycle policies**: S3 / GCS / Azure Blob objects transition automatically (Standard → Infrequent Access → Glacier / Archive / Cold) based on access age. Missing lifecycle on logs/backups/snapshots is a slow-bleed waste class. Intelligent-Tiering on S3 automates the access-pattern decision.
- **Idle resource sweep is continuous, not annual**: unattached EBS/Persistent Disks, stopped EC2 with retained volumes (you pay for storage even when stopped), orphan Elastic IPs (charged when unassociated), old snapshots, idle load balancers, and idle NAT gateways are all detectable from cloud APIs and IaC drift.
- **AI/GPU cost is the breakout category in 2026**: track GPU spend per feature/team separately from general compute. Strategy: commit 60–70% of baseline GPU spend (Reserved/Savings Plans/CUDs) for steady inference, run training and batch on Spot/preemptible with checkpointing, never use on-demand GPUs for steady workloads. Quarterly audit: any GPU instance averaging <50% utilization is a right-sizing or consolidation candidate.
- **FinOps team rituals**: FinOps follows the FinOps Framework lifecycle (Inform → Optimize → Operate). Weekly: anomaly review + commitment-coverage check. Monthly: tag-compliance KPI + right-sizing pass. Quarterly: commitment renewal + architecture review for newly-stable workloads.

## Cost-detection patterns by language

The patterns below are what this skill greps for at PR time. Terraform is the foundational target — most cloud cost decisions are encoded in IaC, and Infracost reads Terraform directly. The other languages cover application-layer cost SDKs and warehouse query history.

### Terraform — foundational (cost-tagging policy, lifecycle, commitment)

```hcl
# BAD: no tags, no lifecycle, on-demand, unattached-volume risk
resource "aws_instance" "web" {
  ami           = "ami-0abcd1234"
  instance_type = "m5.2xlarge"
}

resource "aws_ebs_volume" "data" {
  availability_zone = "us-east-1a"
  size              = 500
  # no tags → untraceable; no lifecycle attachment guarantee
}

resource "aws_s3_bucket" "logs" {
  bucket = "app-logs"
  # no lifecycle → logs stay in Standard storage forever
}

# SAFE: mandatory tags via policy, lifecycle, capacity reservation context
resource "aws_instance" "web" {
  ami           = "ami-0abcd1234"
  instance_type = "m5.large"           # right-sized per Compute Optimizer
  tags = {
    team    = "platform"
    env     = "prod"
    feature = "checkout-api"
    cost_center = "eng-platform"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    id     = "logs-tiering"
    status = "Enabled"
    transition { days = 30  storage_class = "STANDARD_IA" }
    transition { days = 90  storage_class = "GLACIER" }
    expiration { days = 365 }
  }
}
```

Flag patterns: `resource "aws_(instance|db_instance|eks_cluster|s3_bucket|ebs_volume)"` blocks without a `tags =` attribute; `aws_s3_bucket` without a corresponding `aws_s3_bucket_lifecycle_configuration`; instance types in the `*xlarge`/`*2xlarge`/`*4xlarge` family without an explicit Reserved Instance / Savings Plan reference in the same module; `aws_eip` without `instance` or `network_interface` association; `aws_db_instance` with `instance_class` larger than `db.t3.medium` and no commitment.

Run `infracost diff --path . --compare-to <baseline-branch>` on every PR and post the cost delta as a PR comment.

### TypeScript / JavaScript — cloud SDK cost queries

```ts
// BAD: untagged resource creation, no commitment context
import { EC2Client, RunInstancesCommand } from "@aws-sdk/client-ec2";
const ec2 = new EC2Client({});
await ec2.send(new RunInstancesCommand({
  ImageId: "ami-0abcd1234",
  InstanceType: "m5.2xlarge",
  MinCount: 1, MaxCount: 1,
  // no TagSpecifications → untraceable spend
}));

// SAFE: tag at provisioning + pull cost data for the dashboard
import { CostExplorerClient, GetCostAndUsageCommand, GetAnomaliesCommand } from "@aws-sdk/client-cost-explorer";
const ce = new CostExplorerClient({ region: "us-east-1" });
const usage = await ce.send(new GetCostAndUsageCommand({
  TimePeriod: { Start: "2026-04-01", End: "2026-05-01" },
  Granularity: "DAILY",
  Metrics: ["UnblendedCost"],
  GroupBy: [{ Type: "TAG", Key: "team" }, { Type: "DIMENSION", Key: "SERVICE" }],
}));
const anomalies = await ce.send(new GetAnomaliesCommand({
  DateInterval: { StartDate: "2026-04-01", EndDate: "2026-05-01" },
}));
```

Flag patterns: `RunInstancesCommand` / `CreateVolumeCommand` / `CreateBucketCommand` calls without a `TagSpecifications` or equivalent tags field; `@google-cloud/billing` queries missing label filters; `@azure/arm-costmanagement` clients used without `dimensions` grouping by team/env.

### Python — boto3 / google-cloud-billing / azure-mgmt cost queries

```python
# BAD: untagged provisioning, no anomaly polling
import boto3
ec2 = boto3.client("ec2")
ec2.run_instances(ImageId="ami-0abcd1234", InstanceType="m5.2xlarge", MinCount=1, MaxCount=1)

# SAFE: provisioning with tags + Cost Explorer + Anomaly Detection
ec2.run_instances(
    ImageId="ami-0abcd1234",
    InstanceType="m5.large",
    MinCount=1, MaxCount=1,
    TagSpecifications=[{
        "ResourceType": "instance",
        "Tags": [
            {"Key": "team",    "Value": "platform"},
            {"Key": "env",     "Value": "prod"},
            {"Key": "feature", "Value": "checkout-api"},
        ],
    }],
)

ce = boto3.client("ce")
usage = ce.get_cost_and_usage(
    TimePeriod={"Start": "2026-04-01", "End": "2026-05-01"},
    Granularity="DAILY",
    Metrics=["UnblendedCost"],
    GroupBy=[{"Type": "TAG", "Key": "team"}, {"Type": "DIMENSION", "Key": "SERVICE"}],
)
anoms = ce.get_anomalies(DateInterval={"StartDate": "2026-04-01", "EndDate": "2026-05-01"})

# GCP — google-cloud-billing
from google.cloud import billing_budgets_v1
client = billing_budgets_v1.BudgetServiceClient()
budgets = client.list_budgets(parent="billingAccounts/REDACTED")

# Azure — azure-mgmt-costmanagement
from azure.mgmt.costmanagement import CostManagementClient
# (auth omitted) — query() with grouping by tag dimension
```

Flag patterns: `boto3.client("ec2").run_instances(...)` or `create_volume(...)` without `TagSpecifications`; any `google.cloud.compute_v1` `insert(...)` without `labels=`; `azure.mgmt.compute` `virtual_machines.begin_create_or_update` without `tags=`.

### Java — cloud SDK queries

```java
// BAD: no tags at provisioning
RunInstancesRequest req = RunInstancesRequest.builder()
    .imageId("ami-0abcd1234").instanceType("m5.2xlarge")
    .minCount(1).maxCount(1).build();
ec2.runInstances(req);

// SAFE: tag specs + Cost Explorer
TagSpecification tagSpec = TagSpecification.builder()
    .resourceType(ResourceType.INSTANCE)
    .tags(Tag.builder().key("team").value("platform").build(),
          Tag.builder().key("env").value("prod").build(),
          Tag.builder().key("feature").value("checkout-api").build())
    .build();
RunInstancesRequest req = RunInstancesRequest.builder()
    .imageId("ami-0abcd1234").instanceType("m5.large")
    .minCount(1).maxCount(1)
    .tagSpecifications(tagSpec)
    .build();
ec2.runInstances(req);

CostExplorerClient ce = CostExplorerClient.builder().region(Region.US_EAST_1).build();
GetCostAndUsageRequest cur = GetCostAndUsageRequest.builder()
    .timePeriod(DateInterval.builder().start("2026-04-01").end("2026-05-01").build())
    .granularity(Granularity.DAILY).metrics("UnblendedCost")
    .groupBy(GroupDefinition.builder().type(GroupDefinitionType.TAG).key("team").build())
    .build();
ce.getCostAndUsage(cur);
```

Flag patterns: `RunInstancesRequest.builder()` without `.tagSpecifications(...)`; `CreateBucketRequest` without a corresponding `PutBucketLifecycleConfigurationRequest`; AWS SDK v1 (`com.amazonaws.services.*`) without v2 migration plan — v1 entered maintenance mode in 2024.

### C# / .NET — Azure Cost Management SDK

```csharp
// BAD: untagged resource creation via Azure.ResourceManager.Compute
var vm = new VirtualMachineData(AzureLocation.EastUS) {
    HardwareProfile = new VirtualMachineHardwareProfile { VmSize = "Standard_D8s_v5" },
    // no Tags → untraceable
};
await vmCollection.CreateOrUpdateAsync(WaitUntil.Completed, "vm-prod-01", vm);

// SAFE: mandatory tags + Cost Management query
var vm = new VirtualMachineData(AzureLocation.EastUS) {
    HardwareProfile = new VirtualMachineHardwareProfile { VmSize = "Standard_D2s_v5" },
    Tags = {
        ["team"]    = "platform",
        ["env"]     = "prod",
        ["feature"] = "checkout-api",
    },
};
await vmCollection.CreateOrUpdateAsync(WaitUntil.Completed, "vm-prod-01", vm);

// Cost query via Azure.ResourceManager.CostManagement
var scope = new ResourceIdentifier($"/subscriptions/{subId}");
var query = new QueryDefinition(ExportType.ActualCost, TimeframeType.MonthToDate, new QueryDataset {
    Granularity = GranularityType.Daily,
    Aggregation = { ["totalCost"] = new QueryAggregation("Cost", FunctionType.Sum) },
    Grouping = { new QueryGrouping(QueryColumnType.Tag, "team") },
});
await armClient.GetGenericResource(scope).GetCostManagementQueryAsync(scope, query);
```

Flag patterns: `VirtualMachineData(...)` / `StorageAccountData(...)` constructors followed by `CreateOrUpdateAsync` without `Tags = { ... }`; `BlobServiceClient` calls that create containers without a lifecycle management policy applied via `BlobManagementPoliciesClient`.

### SQL — warehouse cost (Snowflake / BigQuery / Redshift query history)

```sql
-- Snowflake — find the top 20 most expensive queries last 7 days (warehouse credits → $)
SELECT
    user_name,
    warehouse_name,
    query_text,
    execution_time / 1000 AS exec_seconds,
    credits_used_cloud_services,
    bytes_scanned,
    rows_produced
FROM snowflake.account_usage.query_history
WHERE start_time >= DATEADD(day, -7, CURRENT_TIMESTAMP())
ORDER BY credits_used_cloud_services DESC
LIMIT 20;

-- Snowflake — warehouse idle time (you pay per second the warehouse is RUNNING, not per query)
SELECT
    warehouse_name,
    SUM(credits_used) AS credits,
    SUM(credits_used) * 3 AS approx_usd        -- $3/credit Standard edition; adjust for your contract
FROM snowflake.account_usage.warehouse_metering_history
WHERE start_time >= DATEADD(day, -7, CURRENT_TIMESTAMP())
GROUP BY warehouse_name
ORDER BY credits DESC;

-- BigQuery — top-spend queries by slot-ms (on-demand: $ per TB scanned; flat-rate: slot-ms)
SELECT
    user_email,
    job_id,
    total_bytes_billed / POW(1024, 4) AS tb_billed,
    total_slot_ms,
    creation_time
FROM `region-us`.INFORMATION_SCHEMA.JOBS_BY_PROJECT
WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  AND state = 'DONE'
ORDER BY total_bytes_billed DESC
LIMIT 20;
```

Flag patterns: Snowflake warehouses with `AUTO_SUSPEND` > 60 seconds (idle warehouse burning credits); `SELECT *` queries against large fact tables (scanning everything when you need a column subset); BigQuery jobs missing `--maximum_bytes_billed` cap; missing `cluster_by` / partitioning on tables > 1 TB.

### C/C++ — skipped (rationale)

C and C++ application code rarely calls cloud cost-management APIs directly: cloud SDK ergonomics, retry/backoff, and JSON handling push teams to higher-level languages. When C/C++ services do run in the cloud, their cost is governed by the IaC (Terraform) that provisions them and by the runtime infrastructure (EC2 / GKE / AKS), both of which this skill already covers. Adding a C/C++ pattern table would expand surface area without expanding coverage. If a team runs C/C++ workloads, scan the IaC and the container/VM resource declarations, not the application source.

## Optimization Categories

### Missing cost tags (untraceable spend)

| Resource | Required tags | Detection |
|---|---|---|
| EC2 / EBS / S3 / RDS / ELB | `team`, `env`, `feature`, `cost_center` | IaC scan, AWS Resource Groups Tagging API |
| GCP Compute / GKE / Cloud Storage | `team`, `env`, `feature` labels | IaC scan, `gcloud asset search-all-resources` |
| Azure VMs / Storage / SQL | `team`, `env`, `feature` tags | IaC scan, `az resource list --query "[?tags==null]"` |
| Kubernetes pods | `team`, `app`, `feature` labels | OpenCost/Kubecost cost-allocation view |

Tracked as a **tag-compliance KPI** — target ≥95%. Untagged resources roll up to an "Untagged" bucket and are reviewed weekly.

### No commitment coverage (paying on-demand for baseline)

| Workload pattern | Signal | Action |
|---|---|---|
| EC2/EKS/RDS running ≥30 days at stable shape | On-demand bill | 1yr Savings Plan or RI; aim for 60–70% baseline coverage |
| GPU inference traffic baseline | Always-on g5/p5 | Compute Savings Plan for the baseline; Spot for burst |
| GCP Compute steady use | On-demand | 1yr or 3yr Committed Use Discount |
| Azure VM steady use | Pay-as-you-go | 1yr or 3yr Azure Reserved VM Instance |

Coverage <70% on a stable workload is the single largest waste signal in most cloud bills.

### Idle resources (slow leak)

| Resource | How charged when idle | Detection |
|---|---|---|
| Unattached EBS / Persistent Disk | Full storage rate | `aws ec2 describe-volumes --filters Name=status,Values=available` |
| Stopped EC2 with attached EBS | Storage rate only (compute is free) | `aws ec2 describe-instances --filters Name=instance-state-name,Values=stopped` |
| Unassociated Elastic IP / static public IP | Hourly charge for the unused address | `aws ec2 describe-addresses --filters Name=association-id,Values=` |
| Orphan snapshots | Storage rate | `aws ec2 describe-snapshots --owner-ids self` |
| Idle load balancers (zero traffic ≥7 days) | Hourly + LCU/data charges | CloudWatch `RequestCount` metric per ALB/NLB |
| Idle NAT gateway | Hourly + data processing | VPC flow logs / CloudWatch `BytesOutToDestination` |
| Idle RDS / Aurora replicas | Full instance rate | CloudWatch `DatabaseConnections` ~ 0 |

### Missing lifecycle policy

| Object store | Default behavior | Lifecycle action |
|---|---|---|
| S3 | Standard forever | Transition to Standard-IA at 30d, Glacier at 90d, Deep Archive at 180d, expiry per data class |
| GCS | Standard forever | Transition to Nearline / Coldline / Archive |
| Azure Blob | Hot tier forever | Lifecycle rule to Cool / Cold / Archive |

Logs, backups, and old snapshots are the highest-impact classes for lifecycle migration.

### Oversized instance (underutilized)

| Resource | Signal | Action |
|---|---|---|
| EC2 | CPU < 20% avg over 7d | Downsize one family step or move to Graviton |
| RDS | CPU < 10% avg + low IOPS | Downsize or move to Aurora Serverless v2 |
| EKS node | Pod density low (CPU/mem requests << allocatable) | Fewer larger nodes, or Karpenter for bin-packing |
| Lambda | Provisioned memory under-used | Tune via Lambda Power Tuning |
| GPU instance | Avg utilization < 50% | Right-size, share across workloads, or move to fractional GPU |

### Missing anomaly alert

| Surface | Detector | Threshold |
|---|---|---|
| AWS account | AWS Cost Anomaly Detection (free) | Default ML model + your alert subscription |
| GCP project | Cloud Billing budgets + Recommender | Threshold per budget |
| Azure subscription | Azure Cost Management alerts | Threshold per scope |
| GPU/AI spend | Custom — week-over-week | >25% WoW is a common GPU alert threshold |

### No PR-time cost preview

If the repo has Terraform/Pulumi/CloudFormation but no Infracost (or equivalent) GitHub Action wired into PR checks, that is a finding. Cost surprises caught at PR time are materially cheaper to fix than after deploy — the resource has not yet been provisioned, no production traffic depends on it, and the engineer who introduced the change is still in context.

### AI/GPU on-demand for steady workload

| Pattern | Anti-pattern | 2026 strategy |
|---|---|---|
| Steady inference traffic | On-demand g5/p4d/p5 | Reserved/Savings Plans for the baseline (60–70%) |
| Training jobs | On-demand without checkpointing | Spot/preemptible with checkpointing |
| Notebooks / dev GPUs | Always-on | Auto-stop after idle threshold; nightly shutdown |
| LLM inference | Single dedicated instance | Batch / fractional GPU / inference framework with autoscale |

### Cost spike unattributed

A spike that can't be attributed to a `team`/`feature`/`env` tag is a process failure — the tagging policy didn't enforce, or a resource was created out-of-band. Surface as `severity: critical` because untraceable spend cannot be controlled.

## Tool Integration (2026)

Cost optimization in 2026 is a layered stack: native cloud tools for the per-cloud truth, IaC tools for PR-time prevention, Kubernetes tools for pod attribution, and multi-cloud platforms for portfolio-level rollups.

| Tool | Layer | Strengths | When |
|---|---|---|---|
| **Infracost** | IaC / PR-time | Cost diff comment on every Terraform PR; tagging policies; 70+ Well-Architected checks | Every PR touching IaC |
| **Kubecost / OpenCost** | Kubernetes | Per-namespace / per-pod / per-label cost; supports custom queries (e.g. cost per inference). Kubecost was acquired by IBM in Sep 2024 and built on OpenCost. | Any shared K8s cluster |
| **Finout** | Multi-cloud platform | Cross-cloud cost rollup, virtual tagging, alerting | Org-level FinOps reporting |
| **AWS Cost Explorer + Compute Optimizer** | Native AWS | 13 months history; rightsizing recommendations; Cost Anomaly Detection (free) | All AWS accounts |
| **GCP Recommender** | Native GCP | Idle VM, idle disk, rightsize, CUD recommendations | All GCP projects |
| **Azure Cost Management + Advisor** | Native Azure | Cost analysis, budgets, advisor rightsizing | All Azure subscriptions |
| **Vantage** | Multi-cloud platform | Multi-cloud cost dashboards, anomaly detection | Org-level FinOps reporting |
| **Cloudability** (Apptio) | Multi-cloud platform | Enterprise FinOps, showback/chargeback, commitments | Enterprise FinOps |

Recommended baseline pipeline:

```bash
# PR-time — Infracost cost diff posted to PR
infracost breakdown --path . --format json --out-file infracost.json
infracost diff --path . --compare-to <baseline-branch> --format github-comment
infracost diff --path . --compare-to <baseline-branch> \
    --policy-path ./infracost-policies   # tagging policy, region/family constraints

# Cluster-time — OpenCost / Kubecost
kubectl cost namespace --historical --window 7d
curl http://opencost.kubecost.svc:9003/allocation/compute?window=7d

# Account-time — native cloud
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-05-01 \
  --granularity DAILY --metrics UnblendedCost \
  --group-by Type=TAG,Key=team Type=DIMENSION,Key=SERVICE
aws ce get-anomalies --date-interval StartDate=2026-04-01,EndDate=2026-05-01
aws ec2 describe-volumes --filters Name=status,Values=available
aws ec2 describe-addresses --query "Addresses[?AssociationId==null]"

# GCP
gcloud recommender recommendations list \
  --project=<project> --location=global \
  --recommender=google.compute.instance.IdleResourceRecommender

# Azure
az consumption usage list --top 100
az advisor recommendation list --category Cost
```

## Output Format

```markdown
## Cloud Cost Analysis Report

### Current Monthly Cost (illustrative example)
| Service | Cost | % of Total |
|---|---|---|
| EC2 | $4,500 | 45% |
| RDS | $2,200 | 22% |
| AI/ML compute (GPU) | $1,200 | 12% |
| S3 | $800 | 8% |
| Data Transfer | $650 | 6.5% |
| Untagged | $650 | 6.5% |
| **Total** | **$10,000** | 100% |

### Tag Compliance
- Tagged resources: 87% (target ≥95%)
- Untagged spend: $650/mo (untraceable)
- Action: enforce tagging via OPA / Infracost policy

### Right-Sizing Opportunities (illustrative)
| Resource | Current | Recommended | Monthly Savings |
|---|---|---|---|
| prod-api (m5.2xlarge × 10) | $2,800 | m5.large × 10 | $2,100 |
| staging-db (db.r5.large) | $175  | db.t3.medium | $130 |
| analytics (c5.4xlarge)    | $490  | Spot fleet   | $350 |

### Idle Resources
| Resource | Monthly Cost | Action |
|---|---|---|
| 5 detached EBS volumes | $250 | Delete |
| 3 unattached Elastic IPs | $12 | Release |
| 2 stale snapshots | $50 | Delete |
| 1 idle NAT gateway (zero data) | $32 | Delete |

### Commitment Coverage
| Service | On-Demand baseline | Covered | Coverage % |
|---|---|---|---|
| EC2 stable | $2,800/mo | $0 | 0% (target ≥70%) |
| RDS | $2,200/mo | $0 | 0% (target ≥70%) |
| GPU baseline | $800/mo | $0 | 0% (target ≥70%) |

### Recommendations
**High Impact (≥$500/mo):**
1. 1yr Savings Plan covering 70% of stable EC2 → est. ~$840/mo savings
2. Right-size prod-api per Compute Optimizer → est. ~$2,100/mo savings
3. Move analytics to Spot fleet → est. ~$350/mo savings

**Medium Impact ($100–500/mo):**
4. Delete idle resources → est. $344/mo
5. Aurora Serverless v2 for variable RDS → est. ~$100/mo

**Process gaps (no $/mo, but unblock the above):**
6. Add Infracost GitHub Action for PR-time cost diff
7. Add S3 lifecycle policies to log buckets
8. Enable AWS Cost Anomaly Detection on the production account

Numbers above are illustrative — populate with actual cost-explorer output.
```

## Red Lines

- NEVER recommend RI / Savings Plan / CUD commitments without ≥30 days of stable usage data.
- NEVER recommend Spot for stateful workloads without explicit checkpoint+resume design.
- NEVER skip the tag-compliance audit before reporting cost attribution — untagged spend invalidates the rollup.
- NEVER deploy AI/GPU workloads on always-on on-demand GPUs for steady-state inference without a documented commitment plan.
- NEVER invent commitment-coverage targets per workload without checking the FinOps Framework — the 60–70% baseline guidance is a starting point, not a contract; tune per business volatility.
- NEVER fabricate cloud account IDs, tag values, or customer-specific dollar figures in reports. The dollar figures in the Output Format are illustrative placeholders.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable cost report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | Material untagged spend (untraceable rollup); commitment coverage near 0% on a stable, sizeable workload; AI/GPU always-on on-demand for steady traffic; missing PR-time cost preview on an IaC repo; unattributed cost spike | BLOCK / fix immediately |
| HIGH | Idle resources with non-trivial monthly cost; oversized production instances; missing S3 lifecycle on log/backup buckets; no anomaly detection enabled | Fix this sprint |
| MEDIUM | Small right-sizing candidates; partial tag gaps; AUTO_SUSPEND set too long on Snowflake warehouses | Backlog |
| LOW | Old snapshots; legacy gp2 volumes that could be gp3; idle ALB that is business-required for failover | Backlog / review quarterly |

**Reconciliation rule**: dollar thresholds intentionally omitted from this table — they are workload-specific. The integrator interprets "material" / "non-trivial" against the project's own monthly bill (e.g. 1% of bill = material at scale, immaterial at $100/mo). On the wire, every finding emitted via the refinement loop is `severity: critical` regardless of triage tier — the table above only governs internal report prioritization. The bridge between internal triage and wire severity is the warnings-are-bugs rule: today's MEDIUM is next quarter's CRITICAL once spend compounds.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = corroborated; low = single-tool unverified
engine: infracost | kubecost | opencost | aws-ce | aws-compute-optimizer | gcp-recommender | azure-advisor | manual
kind: missing_tag | no_commitment_coverage | idle_resource | missing_lifecycle | oversized_instance | missing_anomaly_alert | no_pr_cost_preview | ai_gpu_on_demand_steady | cost_spike_unattributed
target_file: infra/terraform/web.tf                 # path to the IaC/source file (if traceable)
line: 42                                            # line number (if traceable)
monthly_cost_estimate: 250.00                       # USD/month; null if not yet quantified
confidence_in_estimate: high | medium | low
suggested_fix: "Add tags { team, env, feature } to aws_instance.web; enforce via Infracost tagging policy."
reference: https://www.finops.org/framework/capabilities/allocation/
corroborated_by: [<other engines that also flagged this>]   # empty list if single-source
```

The integrator uses `confidence` and `corroborated_by` to weight findings. A `confidence: low` single-source finding doesn't block phase advancement on its own, but two engines agreeing escalates it. `monthly_cost_estimate: null` (not yet quantified) is allowed for `missing_tag` findings where the spend cannot be attributed until tagging exists.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every cost-tagging gap, missed commitment, idle resource, missing lifecycle, oversized instance, missing anomaly alert, missing PR-time cost preview, AI/GPU on-demand-for-steady-workload finding, and unattributed cost spike emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Cost findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: an untagged resource today is unattributable spend tomorrow. An uncommitted baseline this quarter is on-demand retail next quarter. Code that ships with no PR-time cost preview ships with known latent cost regressions.
