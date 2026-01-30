# MongoDB CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Server
docker run -d --name mongo -p 27017:27017 mongo:7

# Drivers
pip install pymongo[srv]   # Python (includes DNS for Atlas)
npm install mongodb        # Node.js official driver
```

## Claude's Common Mistakes
1. **New connection per request** - Reuse client instance (singleton pattern)
2. **Missing compound indexes** - Queries scan entire collection
3. **Unbounded arrays** - Arrays that grow indefinitely cause document bloat
4. **No write concern for critical data** - Data loss on replica failover
5. **Using $where with user input** - JavaScript injection vulnerability

## Correct Patterns (2026)
```javascript
// Singleton client (reuse across requests)
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGO_URI, {
  maxPoolSize: 50,              // Connection pool size
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,       // 2-3x slowest query
  compressors: ['zstd'],        // Compression (MongoDB 4.2+)
});

// Ensure indexes before queries
await db.orders.createIndex({ customerId: 1, createdAt: -1 });
await db.orders.createIndex({ status: 1, createdAt: -1 });

// Aggregation with early filtering
const topProducts = await db.orders.aggregate([
  { $match: { createdAt: { $gte: new Date('2025-01-01') } } },
  { $unwind: '$items' },
  { $group: { _id: '$items.productId', revenue: { $sum: '$items.price' } } },
  { $sort: { revenue: -1 } },
  { $limit: 10 }
]).toArray();

// Write concern for critical operations
await db.orders.insertOne(order, {
  writeConcern: { w: 'majority', j: true }
});
```

## Version Gotchas
- **v7**: Improved queryable encryption, time series collections
- **Atlas**: Use `mongodb+srv://` connection string for DNS seedlist
- **Mongoose 8**: Now ESM-first; uses `mongodb` driver v6 internally
- **Motor (Python async)**: Use with asyncio, not pymongo for async

## What NOT to Do
- Do NOT create new MongoClient per request
- Do NOT use $where with untrusted input (injection risk)
- Do NOT design unbounded arrays (16MB doc limit)
- Do NOT skip compound indexes on filtered+sorted queries
