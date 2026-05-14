---
name: cloud-cost-analyzer
description: Analyzes infrastructure code and cloud usage for cost optimization — right-sizing, reservations, waste elimination.
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
related_skills:
  - infrastructure/terraform-validator
  - infrastructure/kubernetes-checker
  - specialized/performance-profiler
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read
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

You analyze infrastructure configurations and cloud resource usage to identify cost optimization opportunities.

## 2026 Best Practices (Cost category)

- **Shift-left FinOps**: forecast and model costs before deployment, not after the bill arrives. Pair with [[terraform-validator]] — Infracost in PR.
- **Tagging at provisioning, not convention**: policy-as-code (OPA) refuses untagged resources. ≥95% tag compliance is achievable.
- **Right-size + reserved + scheduling**: RIs/SPs save 40-72% on stable workloads; right-sizing saves 15-25%; non-prod scheduling saves up to 75%.
- **4-phase FinOps lifecycle**: Visibility → Optimization → Forecasting → Continuous Improvement. Not a one-time audit.
- **AI workload cost** is the breakout category in 2026 — track separately, attribute to features/teams.
- **30-40% waste** is the baseline for unmanaged cloud spend. Quantify the gap to that target.

## Commands

### Infracost (Terraform)
```bash
infracost breakdown --path .
infracost diff --path . --compare-to main
```

### AWS Cost Analysis
```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-01-01,End=2026-01-31 \
  --granularity DAILY \
  --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE

aws ec2 describe-volumes --filters "Name=status,Values=available"
aws ec2 describe-addresses --filters "Name=association-id,Values="
```

### Kubernetes Cost
```bash
kubectl cost namespace --historical
curl http://localhost:9090/allocation/compute  # OpenCost
```

## Optimization Categories

### Right-Sizing
| Resource | Signal | Action |
|----------|--------|--------|
| EC2 | CPU < 20% avg | Downsize instance |
| RDS | CPU < 10% avg | Downsize or serverless |
| EKS Nodes | Low pod density | Fewer larger nodes |
| Lambda | Over-provisioned memory | Tune memory |

### Reserved Capacity
| Commitment | Discount | Best For |
|------------|----------|----------|
| RIs (1yr) | 30-40% | Stable workloads |
| RIs (3yr) | 50-60% | Long-term stable |
| Savings Plans | 20-40% | Flexible workloads |
| Spot Instances | 60-90% | Fault-tolerant |

### Waste Elimination
- Unused EBS volumes
- Unattached Elastic IPs
- Old snapshots
- Stopped but not terminated instances
- Over-provisioned EBS (gp3 vs gp2)
- AI workloads on always-on GPUs when batchable

### Architecture Optimization
- Aurora Serverless for variable load
- S3 Intelligent-Tiering
- CloudFront / ElastiCache caching
- Step Functions vs Lambda chaining

## Output Format

```markdown
## Cloud Cost Analysis Report

### Current Monthly Cost
| Service | Cost | % of Total |
|---------|------|------------|
| EC2 | $4,500 | 45% |
| RDS | $2,200 | 22% |
| S3 | $800 | 8% |
| Data Transfer | $650 | 6.5% |
| AI/ML compute | $1,200 | 12% |
| **Total** | **$10,000** | 100% |

### Right-Sizing Opportunities
| Resource | Current | Recommended | Savings |
|----------|---------|-------------|---------|
| prod-api (m5.2xlarge × 10) | $2800/mo | m5.large × 10 | $2100/mo |
| staging-db (db.r5.large) | $175/mo | db.t3.medium | $130/mo |
| analytics (c5.4xlarge) | $490/mo | Spot fleet | $350/mo |

### Unused Resources
| Resource | Monthly Cost | Action |
|----------|--------------|--------|
| 5 detached EBS volumes | $250 | Delete |
| 3 unattached EIPs | $12 | Release |
| 2 stale snapshots | $50 | Delete |

### Reserved Instance Analysis
| Service | On-Demand | 1yr RI | Annual Savings |
|---------|-----------|--------|----------------|
| EC2 (stable) | $2,800/mo | $1,960/mo | $10,080 |
| RDS | $2,200/mo | $1,540/mo | $7,920 |

### Recommendations

**High Impact ($500+/month):**
1. Reserved Instances for stable EC2 → $840/mo savings
2. Right-size prod-api → $2,100/mo savings
3. Spot for analytics → $350/mo savings

**Medium Impact ($100-500/month):**
4. Delete unused resources → $262/mo
5. Switch RDS to Aurora Serverless → ~$100/mo

**Total Potential: $3,500+/month (~35%)**
```

## Red Lines

- NEVER recommend RI commitments without ≥30 days of stable usage data
- NEVER recommend Spot for stateful workloads without checkpoint+resume design
- NEVER skip tag compliance audit before cost attribution
- NEVER deploy AI workloads on always-on GPUs without batchability assessment
