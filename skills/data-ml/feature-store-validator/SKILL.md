---
name: feature-store-validator
description: Validates feature store configurations, feature definitions, freshness, lineage, and online/offline consistency.
type: skill
when_to_load:
  - "feature store check"
  - "feature consistency"
  - "feature drift"
  - "feature store validation"
  - "feature store audit"
  - "feature lineage"
related_skills:
  - data-ml/data-quality-checker
  - data-ml/ml-model-validator
  - specialized/database-reviewer
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 50000
  max_tool_calls: 30
  max_subagents: 0
---

# Feature Store Validator (skill)

> Converted from agents/data-ml/feature-store-validator.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate feature store configurations, feature definitions, data quality, and ensure features are production-ready.

## 2026 Best Practices (Data/ML category)

- **ML-specific quality**: feature-store consistency is the #1 cause of training/serving skew. Pair with [[ml-model-validator]].
- **Online/offline parity**: every feature view must produce identical values from the online store and the offline store. Spot-check 1000 entities per feature view at validation time.
- **Validate at definition, not at consumption**: schema, owner, description, TTL required on every feature view.
- **Quarantine, don't drop**: failed materializations route to quarantine with original payload + reason.
- **Lineage is non-optional**: every feature names its source tables + transformations + dependencies. Lineage gaps = invisible debt.
- **Stale features = decay**: 90+ days unused → flag for deletion. Dead features rot the store.

## Feature Store Concepts

### Feature Definition (Feast)
```python
from feast import Entity, Feature, FeatureView, FileSource

driver_entity = Entity(
    name="driver_id",
    value_type=ValueType.INT64,
    description="Driver identifier"
)

driver_stats = FeatureView(
    name="driver_stats",
    entities=["driver_id"],
    ttl=timedelta(hours=24),
    features=[
        Feature(name="avg_rating", dtype=ValueType.FLOAT),
        Feature(name="total_trips", dtype=ValueType.INT64),
    ],
    source=driver_source
)
```

### Online vs Offline
| Store | Latency | Use Case |
|-------|---------|----------|
| Offline | Seconds-minutes | Training, batch inference |
| Online | Milliseconds | Real-time inference |

## What to Validate

### Feature Definition Quality
```python
feature_requirements = {
    "name": str,           # Unique identifier
    "dtype": ValueType,    # Data type
    "description": str,    # What it represents
    "owner": str,          # Who maintains it
    "source": str,         # Where it comes from
    "version": str,        # For tracking changes
    "ttl": timedelta,      # Time to live
}

naming_patterns = {
    "prefix": "{entity}_{domain}_{feature}",
    "no_spaces": True,
    "lowercase": True,
    "max_length": 64
}
```

### Feature Freshness
```python
def check_freshness(feature_view, max_age_hours=24):
    last_update = get_last_materialization(feature_view)
    age = datetime.now() - last_update
    if age > timedelta(hours=max_age_hours):
        return f"STALE: Last updated {age} ago"
```

### Online/Offline Consistency
```python
def check_consistency(entity_id, features):
    online_values = online_store.get(entity_id, features)
    offline_values = offline_store.get(entity_id, features)
    differences = []
    for feature in features:
        if online_values[feature] != offline_values[feature]:
            differences.append({
                "feature": feature,
                "online": online_values[feature],
                "offline": offline_values[feature]
            })
    return differences
```

## Output Format

```markdown
## Feature Store Validation Report

### Store Information
| Property | Value |
|----------|-------|
| Provider | Feast |
| Online Store | Redis |
| Offline Store | BigQuery |
| Feature Views | 25 |
| Total Features | 156 |

### Definition Quality
| Check | Pass | Fail |
|-------|------|------|
| Has description | 142 | 14 |
| Has owner | 156 | 0 |
| Valid naming | 150 | 6 |
| Has TTL | 148 | 8 |

### Freshness
| Feature View | TTL | Last Update | Status |
|--------------|-----|-------------|--------|
| user_profile | 24h | 2h ago | Fresh |
| order_stats | 6h | 8h ago | Stale |

### Online/Offline Consistency
| Feature View | Checked | Consistent | Mismatches |
|--------------|---------|------------|------------|
| user_profile | 1000 | 998 | 2 |
| order_stats | 1000 | 985 | 15 |

### Unused Features
| Feature | Last Accessed | Models Using |
|---------|---------------|--------------|
| legacy_score | 90d ago | 0 |
| temp_flag | 180d ago | 0 |

### Recommendations
1. Fix stale features — materialize order_stats and product_features
2. Add missing descriptions (14 features)
3. Fix naming conventions (6 features)
4. Remove unused features (3 features unused 90+ days)
5. Fix consistency issues — ensure online store materialized after offline updates
```

## Red Lines

- NEVER deploy a feature without owner + description + TTL
- NEVER allow online/offline mismatches > 1% on serving features
- NEVER allow circular lineage dependencies
- NEVER leave features unused for 90+ days without a deletion decision
