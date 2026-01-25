# Ontario Grid Cockpit

Real-time electricity grid monitoring dashboard for Ontario using IESO public data. Palantir-inspired dark theme.

## Current State

**Infrastructure:** ✅ Working (Docker Compose with Redpanda, ClickHouse, Redis)
**Data Pipeline:** ✅ Working (Python producer fetching IESO data → Kafka → ClickHouse)
**Frontend:** 🚧 Next.js 14 scaffolded, needs components

Data volumes per fetch cycle:
- Zonal Prices: ~108 records (9 zones × 12 intervals)
- Zonal Demand: ~69,000 records (historical CSV)
- Generator Output: ~2,600 records (hourly per generator)
- Fuel Mix: ~4,000 records (hourly per fuel type)
- Intertie Flow: ~2,300 records (5-min actuals)

## Quick Commands

```bash
# Start infrastructure (from project root)
docker compose up -d

# Start frontend dev server
cd frontend && npm run dev

# Start producer (WSL terminal, activate venv first)
cd producer && source venv/bin/activate && python main.py

# Query ClickHouse
docker exec -it clickhouse clickhouse-client -q "SELECT zone, price FROM ieso.zonal_prices ORDER BY timestamp DESC LIMIT 9"

# Check Kafka topics
# Open http://localhost:8080 (Redpanda Console)
```

## Project Structure

```
ontario-grid-cockpit/
├── frontend/           # Next.js 14 + Blueprint.js + Recharts
│   ├── src/app/        # Pages and API routes
│   ├── src/components/ # React components
│   └── src/lib/        # Utilities, types, ClickHouse client
├── producer/           # Python Kafka producer
│   ├── parsers/        # IESO XML/CSV parsers
│   └── producers/      # Kafka topic producers
├── infra/              # Docker init scripts
│   ├── clickhouse/     # SQL schemas
│   └── redpanda/       # Topic setup
└── docker-compose.yml  # Local infrastructure
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), Blueprint.js 5.x, Recharts, TypeScript |
| API | Next.js API routes, Server-Sent Events (SSE) |
| Database | ClickHouse (time-series OLAP) |
| Streaming | Redpanda (Kafka-compatible) |
| Cache | Redis |
| Producer | Python 3.11, aiohttp, confluent-kafka, Pydantic |

## IESO Data Sources

Base URL: `https://reports-public.ieso.ca/public/`

| Report | Format | Frequency | Kafka Topic |
|--------|--------|-----------|-------------|
| RealtimeZonalEnergyPrices | XML | 5-min | `ieso.realtime.zonal-prices` |
| RealtimeDemandZonal | CSV | 5-min | `ieso.realtime.zonal-demand` |
| GenOutputCapability | XML | 5-min | `ieso.realtime.generator-output` |
| GenOutputbyFuelHourly | XML | Hourly | `ieso.hourly.fuel-mix` |
| IntertieScheduleFlow | XML | Hourly | `ieso.hourly.intertie-flow` |

## Zone Mappings

**9 Pricing Zones:** EAST, ESSA, NIAGARA, NORTHEAST, NORTHWEST, OTTAWA, SOUTHWEST, TORONTO, WEST

**10 Demand Zones:** Above + BRUCE (separate for demand, merged with SOUTHWEST for pricing)

## Design System

```
Background:  #0D1117    Surface:     #161B22    Border:      #30363D
Blue:        #58A6FF    Cyan:        #39D5FF    
Green:       #3FB950    Yellow:      #D29922    Red:         #F85149
Text:        #E6EDF3    Text Muted:  #8B949E
```

- Sharp corners (no border-radius)
- Monospace numbers with `font-variant-numeric: tabular-nums`
- Thin 1px borders
- Data-dense layouts

## Code Patterns

### TypeScript
- Strict mode, Zod for validation
- `const` + arrow functions, ES modules only

### Python
- Type hints, Pydantic v2, async/await

### ClickHouse Query Pattern
```typescript
import { query } from '@/lib/clickhouse';
const data = await query<ZonalPrice>(`SELECT * FROM zonal_prices WHERE timestamp > now() - INTERVAL 24 HOUR`);
```

## Don'ts

- Don't use `require()` - ES modules only
- Don't query ClickHouse on every render - use SWR
- Don't store secrets in code - use `.env.local`
- Don't use rounded corners - sharp edges only
