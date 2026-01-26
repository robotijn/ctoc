# Apache Spark CTO
> Distributed data at scale.

## When to Use
- Data > 100GB
- Complex transformations at scale

## Non-Negotiables
1. DataFrame API, not RDDs
2. Proper partitioning
3. Cache strategically
4. Broadcast small tables
5. Avoid UDFs when built-ins work

## Red Lines
- RDDs for structured data
- Data skew without repartitioning
- Not using Spark UI
