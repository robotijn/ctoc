# MongoDB CTO
> Document database for flexible schemas and horizontal scaling.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name mongo -p 27017:27017 mongo:7
mongosh --eval "db.adminCommand('ping')"
mongosh --file tests/queries.js
```

## Non-Negotiables
1. Schema design: embed (1:few) vs reference (1:many)
2. Compound indexes aligned with query patterns
3. Aggregation pipelines for complex queries
4. Replica sets for high availability
5. Sharding for horizontal scale (>100GB)
6. Write concern configured for durability

## Red Lines
- Unbounded arrays growing indefinitely
- Missing indexes on query predicates
- `$where` with untrusted input (injection risk)
- No connection pooling in application
- Ignoring write concern for critical data

## Pattern: Production Data Modeling
```javascript
// Schema design: embed when accessed together
const orderSchema = {
  _id: ObjectId(),
  customerId: ObjectId(),
  status: "pending",
  items: [  // Bounded array, always accessed with order
    { productId: ObjectId(), name: "Widget", quantity: 2, price: 29.99 }
  ],
  shipping: { address: "123 Main St", city: "NYC" },
  createdAt: new Date()
};

// Compound index for common query pattern
db.orders.createIndex({ customerId: 1, createdAt: -1 });
db.orders.createIndex({ status: 1, createdAt: -1 });

// Aggregation pipeline for reporting
db.orders.aggregate([
  { $match: { createdAt: { $gte: ISODate("2024-01-01") } } },
  { $unwind: "$items" },
  { $group: {
      _id: "$items.productId",
      totalQuantity: { $sum: "$items.quantity" },
      revenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } }
  }},
  { $sort: { revenue: -1 } },
  { $limit: 10 }
]);

// Write with appropriate concern
db.orders.insertOne(order, { writeConcern: { w: "majority", j: true } });
```

## Integrates With
- **Drivers**: Official drivers for all major languages
- **ODM**: Mongoose (Node.js), Motor (Python async)
- **Cloud**: MongoDB Atlas for managed deployments

## Common Errors
| Error | Fix |
|-------|-----|
| `BSON too large` | Document >16MB, redesign schema |
| `Index not used` | Check explain(), ensure index covers query |
| `Connection pool exhausted` | Increase maxPoolSize |
| `Write concern timeout` | Check replica set health |

## Prod Ready
- [ ] Indexes on all query patterns
- [ ] Replica set with read preference
- [ ] Connection pooling configured
- [ ] Schema validation rules
- [ ] Monitoring via Atlas or Ops Manager
