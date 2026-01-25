# ClickHouse Patterns

## Next.js Client

```typescript
// src/lib/clickhouse.ts
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || 'http://localhost:8123';
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER || 'default';
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || '';
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || 'ieso';

export async function query<T>(sql: string): Promise<T[]> {
  const url = new URL(CLICKHOUSE_URL);
  url.searchParams.set('default_format', 'JSON');
  url.searchParams.set('database', CLICKHOUSE_DATABASE);
  
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}`).toString('base64')}`,
      'Content-Type': 'text/plain',
    },
    body: sql,
    next: { revalidate: 5 } // Cache for 5 seconds
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ClickHouse error: ${error}`);
  }
  
  const json = await response.json();
  return json.data as T[];
}
```

## Common Queries

### Latest Value per Zone
```sql
SELECT 
    zone,
    argMax(price, timestamp) as price,
    max(timestamp) as timestamp
FROM ieso.zonal_prices
WHERE timestamp > now() - INTERVAL 1 HOUR
GROUP BY zone
```

### Time Series (24 hours, 5-min buckets)
```sql
SELECT 
    toStartOfFiveMinutes(timestamp) as bucket,
    zone,
    avg(price) as avg_price,
    min(price) as min_price,
    max(price) as max_price
FROM ieso.zonal_prices
WHERE timestamp > now() - INTERVAL 24 HOUR
GROUP BY bucket, zone
ORDER BY bucket
```

### Fuel Mix Totals
```sql
SELECT 
    fuel_type,
    argMax(output_mw, timestamp) as output_mw
FROM ieso.fuel_mix
WHERE timestamp > now() - INTERVAL 2 HOUR
GROUP BY fuel_type
ORDER BY output_mw DESC
```

### Generator Status
```sql
SELECT 
    generator,
    fuel_type,
    argMax(output_mw, timestamp) as output_mw,
    argMax(capability_mw, timestamp) as capability_mw,
    round(argMax(output_mw, timestamp) / argMax(capability_mw, timestamp) * 100, 1) as utilization_pct
FROM ieso.generator_output
WHERE timestamp > now() - INTERVAL 1 HOUR
  AND fuel_type = 'NUCLEAR'
GROUP BY generator, fuel_type
ORDER BY generator
```

### Sparkline Data (24 hours for a zone)
```sql
SELECT 
    toStartOfFiveMinutes(timestamp) as t,
    avg(price) as price
FROM ieso.zonal_prices
WHERE zone = 'TORONTO'
  AND timestamp > now() - INTERVAL 24 HOUR
GROUP BY t
ORDER BY t
```

### Ontario Total Demand
```sql
SELECT 
    toStartOfFiveMinutes(timestamp) as bucket,
    sum(demand_mw) as total_demand
FROM ieso.zonal_demand
WHERE timestamp > now() - INTERVAL 24 HOUR
GROUP BY bucket
ORDER BY bucket
```

### Net Intertie Flow
```sql
SELECT 
    intertie,
    argMax(actual_mw, timestamp) as flow_mw,
    max(timestamp) as timestamp
FROM ieso.intertie_flow
WHERE timestamp > now() - INTERVAL 2 HOUR
GROUP BY intertie
```

## API Route Pattern

```typescript
// src/app/api/prices/route.ts
import { query } from '@/lib/clickhouse';
import { NextResponse } from 'next/server';

interface ZonalPrice {
  zone: string;
  price: number;
  timestamp: string;
}

export async function GET() {
  try {
    const data = await query<ZonalPrice>(`
      SELECT 
        zone,
        argMax(price, timestamp) as price,
        max(timestamp) as timestamp
      FROM ieso.zonal_prices
      WHERE timestamp > now() - INTERVAL 1 HOUR
      GROUP BY zone
    `);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('ClickHouse error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
```

## MergeTree Best Practices

- `ORDER BY` should match common `WHERE`/`GROUP BY` patterns
- Partition by month for large tables: `PARTITION BY toYYYYMM(timestamp)`
- Use `TTL` for automatic data expiration
- Use `argMax(value, timestamp)` to get latest value per group
- Avoid `SELECT *` - always specify columns

## ClickHouse Gotchas

**Don't nest aggregates in WHERE:** This fails:
```sql
-- BAD: aggregate in WHERE clause context
SELECT zone, argMax(price, timestamp) as price, max(timestamp) as timestamp  -- naming conflict!
FROM table WHERE timestamp > now() - INTERVAL 1 HOUR GROUP BY zone;
```

**Rename output columns to avoid conflicts:**
```sql
-- GOOD: use different name for output column
SELECT zone, argMax(price, timestamp) as price, max(timestamp) as last_updated
FROM table WHERE timestamp > now() - INTERVAL 1 HOUR GROUP BY zone;
```

**Don't use `if(argMax(...))` in views** - causes ILLEGAL_AGGREGATION errors. Calculate status in application code instead.
