# GridGPT

Real-time electricity grid monitoring dashboard for Ontario, Canada.

`TypeScript` `Next.js 14` `ClickHouse` `Redpanda` `Claude API` `Blueprint.js`

---

## Overview

GridGPT is an open-source, real-time monitoring dashboard for Ontario's electricity grid. It ingests public data from the [Independent Electricity System Operator (IESO)](#ieso) and presents it in a dense, analyst-grade interface across nine [pricing zones](#pricing-zone). The dashboard covers zonal pricing, provincial demand, generation by fuel type, [intertie](#intertie) flows to neighbouring jurisdictions, weather overlays, and a [text-to-SQL](#text-to-sql) AI chatbot that can query any of the underlying data using natural language.

The project is a full-stack engineering portfolio piece built to demonstrate real-time data pipeline design, time-series analytics, and AI-augmented data exploration. Every layer — from the Python producer that parses IESO XML feeds, to the [ClickHouse](#clickhouse) [OLAP](#olap) storage, to the [SSE](#sse)-streamed chat interface — is designed for low-latency observability of a complex, always-on system.

---

## Why Blueprint.js?

[Blueprint.js](#blueprintjs) was chosen as the component library because it was purpose-built for data-dense enterprise applications — exactly the kind of interface an electricity grid dashboard needs.

- **Data-dense layouts** — Blueprint is designed for complex dashboards with tables, trees, and multi-panel views, not consumer landing pages. It doesn't waste space on oversized padding or rounded cards.
- **Dark-first design** — A native dark theme ships out of the box. No CSS override hacks, no theme provider workarounds. The dark theme is a first-class citizen.
- **TypeScript native** — Full type definitions for every component and prop, matching the strict TypeScript configuration used throughout this project.
- **500+ icons** — A comprehensive icon system for status indicators, navigation, fuel types, and controls without pulling in a separate icon library.

---

## System Architecture

Data flows through a streaming pipeline from IESO's public report servers into the dashboard. Each stage is designed for reliability and low latency.

```
IESO Report Servers (XML/CSV, 9 report types)
    │  5-min polling
    ▼
Python Producer (aiohttp + confluent-kafka + Pydantic)
    │  publishes to 10 topics
    ▼
┌─────────────────────────────────────────────┐
│  Docker Compose (Hetzner VPS)               │
│                                             │
│  Redpanda (Kafka-compatible streaming)      │
│      │  Kafka Engine materialized views     │
│      ▼                                      │
│  ClickHouse (8 dedup views)                 │
│      v_zonal_prices, v_zonal_demand,        │
│      v_generator_output, v_fuel_mix,        │
│      v_intertie_flow, v_adequacy,           │
│      v_da_ozp, v_weather                    │
│                                             │
│  Redis (cache) + init-kafka (provisioning)  │
└─────────────────────────────────────────────┘
    │  HTTP SQL queries
    ▼
Next.js API Routes (19 routes, Vercel serverless)
    │  REST + SSE
    ▼
Frontend (6 panels)
    ├── Fuel Mix (donut / table / radar)
    ├── Generation by Resource (area charts per plant)
    ├── Ontario Zone Map (Leaflet + WMS weather + animated interties)
    ├── Market Overview (dual-axis chart + day-ahead overlay)
    ├── Grid AI (text-to-SQL chatbot)
    └── Interties (flow table with carbon metrics)
```

A separate [WMS](#wms) connection to [ECCC](#eccc) (Environment and Climate Change Canada) feeds weather overlays — temperature, cloud cover, and precipitation — directly into the map component via GDPS forecast layers.

---

## Dashboard Panels

### Fuel Mix
**Data source:** `v_generator_output` aggregated by fuel type

Three views of Ontario's current generation: a donut chart showing the percentage split between [fuel types](#fuel-mix) (nuclear ~60%, hydro ~25%, gas, wind, solar, biofuel), a detailed table with per-fuel output and capability numbers, and a radar chart for comparing fuel contributions. The inner ring shows the energy flow direction.

### Generation by Resource
**Data source:** `v_generator_output` per plant

Area charts for each major generating station (Bruce, Darlington, Pickering, and more), grouped by fuel type with color coding. Each section — Renewables, Nuclear, Hydro, Gas — shows individual plant contributions. This table can lag ~2 hours behind other data sources.

### Ontario Zone Map
**Data source:** `v_zonal_prices` + `v_intertie_flow` + `v_generator_output` + ECCC WMS

An interactive Leaflet map with a [pricing zone](#pricing-zone) GeoJSON overlay using a 12-tier color scale, generation site markers sized by output, animated [intertie](#intertie) chevrons showing flow direction, and [ECCC](#eccc) weather [WMS](#wms) layers for temperature, cloud cover, and precipitation. A time scrubber allows historical replay of all map layers simultaneously.

### Market Overview
**Data source:** `v_da_ozp` + `v_zonal_prices` + `v_zonal_demand` + `v_adequacy`

A dual-axis Recharts chart with demand, supply, and grid load on the left [MW](#megawatt) axis and price on the right [$/MWh](#mwh) axis. Includes a [day-ahead](#day-ahead-market) overlay for both the current day (D) and tomorrow (D+1), plus a peak demand display. Supports 1-hour and full-day time ranges.

### Grid AI
**Data source:** All ClickHouse tables via `/api/chat`

A [text-to-SQL](#text-to-sql) chatbot powered by the Claude API. Users ask natural language questions like "What was the average price in Toronto this morning?" and the system generates validated SQL, executes it against ClickHouse, and streams back the answer with a strategy explanation. Chat history persists in localStorage.

### Interties
**Data source:** `v_intertie_flow`

Shows flows across Ontario's five [intertie](#intertie) connections: Quebec, Michigan, Minnesota, New York, and Manitoba. Displays actual flow in [MW](#megawatt), direction (positive = export, negative = import), and net flow summary.

---

## Grid AI: Text-to-SQL Architecture

Grid AI is a [context-grounded](#context-grounded) query assistant that translates natural language into validated ClickHouse SQL. Rather than relying on the LLM's general knowledge, every query is anchored in domain expertise assembled from four context layers.

### Context Layers

| Layer | Description |
|-------|-------------|
| **Schema Definitions** | 8 table structures with column names, types, and relationships. The LLM knows exactly what columns exist and how tables relate. |
| **Domain Knowledge** | IESO market rules, timezone handling (EST storage vs UTC queries), zone mappings, fuel type categories, and pricing model details. |
| **Query Patterns** | 11 validated SQL templates for common questions: current prices, demand trends, fuel mix breakdowns, intertie flows, and historical comparisons. |
| **Temporal Context** | EST timestamp storage rules, UTC conversion formulas, delivery hour calculations, and common pitfalls around timezone boundaries. |

### Tool Loop

The chat API uses Claude's tool-use capability with a `query_clickhouse` tool. On each turn, the model generates SQL plus a plain-English strategy explanation. The SQL passes through a safety validator (SELECT-only, LIMIT required, no `system.*` tables) before executing against ClickHouse. If the query returns an error or empty results, the model can retry with corrected SQL for up to 5 iterations.

### SSE Streaming

Results stream to the browser via [Server-Sent Events](#sse). The frontend receives four event types:

- `tool_use` — SQL query and strategy explanation
- `tool_result` — row count and execution duration
- `text_delta` — chunked natural language response
- `done` — stream completion signal

The Grid AI component renders tool badges, strategy text, markdown-formatted answers, and persists conversations in localStorage.

```
User Question (natural language)
    ▼
Context Assembly (schema + domain + patterns + temporal rules)
    ▼
Claude API (claude-sonnet-4, query_clickhouse tool)
    ▼
Tool Loop (up to 5 iterations):
    ├─ Generate SQL + strategy
    ├─ Safety validation (SELECT-only, LIMIT, no system.*)
    ├─ Execute against ClickHouse
    └─ Check results → retry if error/empty
    ▼
SSE Stream → GridChat Component
    ├─ tool_use (SQL + strategy)
    ├─ tool_result (row count + duration)
    ├─ text_delta (chunked response)
    └─ done
```

---

## API Reference

19 routes organized into 5 categories. All routes query ClickHouse directly and use `force-dynamic`.

### Core (6)

| Route | Description |
|-------|-------------|
| `/api/prices` | Latest zonal electricity prices |
| `/api/demand` | Current demand by zone |
| `/api/fuel-mix` | Fuel mix breakdown by type |
| `/api/generators` | Generator output and capability |
| `/api/interties` | Intertie flows by jurisdiction |
| `/api/weather` | Weather data by zone |

### Historical (6)

| Route | Description |
|-------|-------------|
| `/api/prices/history` | Price time series |
| `/api/demand/history` | Demand time series |
| `/api/supply/history` | Supply time series (supports by_fuel) |
| `/api/fuel-mix/history` | Fuel mix time series |
| `/api/generators/history` | Generator output time series |
| `/api/market/history` | Combined demand, supply, price series |

### Day-Ahead (2)

| Route | Description |
|-------|-------------|
| `/api/market/day-ahead` | Day-ahead demand, supply, and price forecasts |
| `/api/peak-demand` | Today and tomorrow peak demand |

### Time-Scrub (4)

| Route | Description |
|-------|-------------|
| `/api/prices/at-time` | Prices at a specific timestamp |
| `/api/weather/at-time` | Weather at a specific timestamp |
| `/api/interties/at-time` | Intertie flows at a specific timestamp |
| `/api/interties/prices` | Latest LMP prices at intertie zones |

### AI (1)

| Route | Description |
|-------|-------------|
| `/api/chat` | Text-to-SQL via Claude API (SSE streaming) |

---

## Weather Integration

The Ontario Zone Map displays weather overlays sourced from [ECCC](#eccc)'s Global Deterministic Prediction System (GDPS) via [WMS](#wms) tile layers. Three layers are available: surface temperature, cloud cover, and total precipitation.

Weather frames are snapped to 3-hour forecast boundaries (00Z, 03Z, 06Z, etc.) to match GDPS model runs. The map uses a [double-buffering](#double-buffering) technique: the next forecast image loads in a hidden layer while the current one displays, so transitions between time steps are smooth instead of flickering.

---

## Next.js Techniques

- **Dynamic imports for Leaflet** — The map component uses `next/dynamic` with `ssr: false` to avoid `window is not defined` errors during server-side rendering. Leaflet requires a browser environment.
- **`force-dynamic` on all API routes** — Every API route exports `export const dynamic = 'force-dynamic'` to ensure fresh ClickHouse queries on every request.
- **Revalidation on ClickHouse fetch** — The ClickHouse HTTP client uses `next: { revalidate: 5 }` to allow brief caching while keeping data near-real-time.
- **Client-side [hydration](#hydration) for suggested questions** — The Grid AI panel renders a deterministic set of suggested questions on the server, then randomizes them client-side after hydration to avoid mismatch errors.

---

## Hosting & Infrastructure

The system is split across two hosting providers, optimized for cost and reliability:

- **Frontend on Vercel** — The Next.js app runs as serverless functions for API routes and uses Vercel's edge CDN for static assets. This handles bursty user traffic with auto-scaling at near-zero idle cost.
- **Backend on Hetzner VPS** — A single VPS runs Docker Compose with 5 services: Redpanda, Redpanda Console, ClickHouse, Redis, and init-kafka. The Python producer runs on a cron schedule on the same machine. This provides persistent, always-on infrastructure for 24/7 data ingestion at ~$5–10/month.

The split rationale: Vercel handles user-facing traffic cheaply with auto-scaling, while Hetzner provides the stable, long-running services (Kafka, ClickHouse, Redis) that need to be online continuously regardless of user traffic.

---

## Built with Claude Code

GridGPT was developed using Claude Code as the primary development tool. The project leveraged several MCP (Model Context Protocol) integrations and custom Skills to accelerate development:

- **ClickHouse direct queries** — A custom `/query` Skill for running ad-hoc SQL against the live database during development, validating schema designs and query patterns in real time.
- **Context7 for documentation** — Used for looking up Blueprint.js component APIs, Recharts configuration, Leaflet plugin patterns, and Next.js App Router conventions.
- **Sequential Thinking for complex logic** — Applied to multi-step problems like the text-to-SQL context assembly, timezone conversion strategy, and deduplication view design.
- **Custom Skills** — `/dev` (start all infrastructure), `/query` (run ClickHouse SQL), and `/ingest` (trigger a producer run) provided one-command workflows during development.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), Blueprint.js 5.x, Recharts, Nivo, Leaflet |
| Language | TypeScript (strict), Python 3.11 |
| API | Next.js API routes, Server-Sent Events (SSE) |
| Database | ClickHouse (columnar OLAP) |
| Streaming | Redpanda (Kafka-compatible) |
| Cache | Redis |
| AI | Claude API (claude-sonnet-4, tool use) |
| Weather | ECCC GDPS via WMS |
| Maps | Leaflet + react-leaflet, GeoJSON, WMS tiles |
| Producer | Python 3.11, aiohttp, confluent-kafka, Pydantic v2 |
| Infrastructure | Docker Compose, Vercel, Hetzner VPS |
| Dev Tools | Claude Code, Context7, Sequential Thinking |

---

## Quick Start

```bash
# Start infrastructure
docker compose up -d

# Start frontend dev server
cd frontend && npm run dev

# Start producer (separate terminal, activate venv)
cd producer && source venv/bin/activate && python main.py

# Query ClickHouse directly
docker exec -it clickhouse clickhouse-client \
  -q "SELECT zone, price FROM ieso.v_zonal_prices \
      ORDER BY timestamp DESC LIMIT 9"
```

---

## IESO Data Sources

All data comes from [IESO](#ieso)'s public report server at `https://reports-public.ieso.ca/public/`. These reports are freely available and require no authentication.

| Report | Format | Frequency | Link |
|--------|--------|-----------|------|
| RealtimeZonalEnergyPrices | XML | 5-min | [Link](https://reports-public.ieso.ca/public/RealtimeZonalEnergyPrices/) |
| RealtimeDemandZonal | CSV | 5-min | [Link](https://reports-public.ieso.ca/public/RealtimeDemandZonal/) |
| GenOutputCapability | XML | 5-min | [Link](https://reports-public.ieso.ca/public/GenOutputCapability/) |
| GenOutputbyFuelHourly | XML | Hourly | [Link](https://reports-public.ieso.ca/public/GenOutputbyFuelHourly/) |
| IntertieScheduleFlow | XML | Hourly | [Link](https://reports-public.ieso.ca/public/IntertieScheduleFlow/) |
| DayAheadOntarioZonalPrice | XML | Daily | [Link](https://reports-public.ieso.ca/public/DayAheadOntarioZonalPrice/) |
| DayAheadIntertieLMP | XML | Daily | [Link](https://reports-public.ieso.ca/public/DayAheadIntertieLMP/) |
| RealtimeIntertieLMP | XML | 5-min | [Link](https://reports-public.ieso.ca/public/RealtimeIntertieLMP/) |
| Adequacy2 | XML | Daily | [Link](https://reports-public.ieso.ca/public/Adequacy2/) |

---

## Glossary

Plain-language definitions for terms used throughout this document.

<a name="intertie"></a>
**Intertie** — A power line that connects Ontario's electricity grid to another region like Quebec or Michigan. Power can flow in or out through these connections.

<a name="pricing-zone"></a>
**Pricing Zone** — An area of Ontario where electricity costs the same amount. Ontario has 9 pricing zones with names like TORONTO, OTTAWA, and NORTHWEST.

<a name="ieso"></a>
**IESO** — Independent Electricity System Operator. The organization that runs Ontario's power grid and shares public data about it.

<a name="megawatt"></a>
**Megawatt (MW)** — A unit of power. One megawatt can power about 1,000 homes at the same time.

<a name="mwh"></a>
**$/MWh** — Dollars per megawatt-hour. This is how electricity prices are measured — like a "price per gallon" for electricity.

<a name="fuel-mix"></a>
**Fuel Mix** — The combination of energy sources used to make electricity right now — things like nuclear, water (hydro), natural gas, wind, and solar.

<a name="day-ahead-market"></a>
**Day-Ahead Market** — A market where electricity prices are set one day before the power is actually used. This helps the grid plan ahead.

<a name="da-ozp"></a>
**DA-OZP** — Day-Ahead Ontario Zonal Price. The official price for electricity, decided one day in advance. This is what consumers actually pay.

<a name="settlement-price"></a>
**Settlement Price** — The final, official price used for billing. In Ontario, this is the [DA-OZP](#da-ozp) — not the real-time 5-minute price.

<a name="real-time-price"></a>
**Real-Time Price** — The live electricity price, updated every 5 minutes. Used for watching the grid, but not for billing.

<a name="baseload"></a>
**Baseload** — Power plants that run all the time, like nuclear plants. They provide steady, low-cost power around the clock.

<a name="peaker-plant"></a>
**Peaker Plant** — A power plant that only turns on when lots of people need electricity at the same time. Usually gas-powered and more expensive.

<a name="clickhouse"></a>
**ClickHouse** — A very fast database built for analyzing large amounts of data over time. GridGPT stores all IESO data here.

<a name="redpanda"></a>
**Redpanda** — A streaming platform that moves data in real-time — like a conveyor belt carrying information from the producer to the database.

<a name="text-to-sql"></a>
**Text-to-SQL** — Turning a plain English question (like "What's the price in Toronto?") into a database query that finds the answer.

<a name="context-grounded"></a>
**Context-Grounded** — An AI approach that uses specific domain knowledge (like IESO rules) instead of relying on general knowledge alone.

<a name="sse"></a>
**SSE** — Server-Sent Events. A way for the server to push live updates to your browser without you needing to refresh the page.

<a name="olap"></a>
**OLAP** — Online Analytical Processing. A type of database designed for fast, complex queries on historical data — perfect for time-series energy data.

<a name="blueprintjs"></a>
**Blueprint.js** — A design system made for building data-heavy dashboards. It provides ready-made dark theme components like tables, icons, and buttons.

<a name="materialized-view"></a>
**Materialized View** — A saved database query that updates itself automatically when new data arrives. Used to move data from Kafka into ClickHouse tables.

<a name="dedup-view"></a>
**Dedup View** — A database view that removes duplicate rows. When the producer re-fetches data, these views make sure you only see one copy of each record.

<a name="wms"></a>
**WMS** — Web Map Service. A standard way to serve map images over the internet. GridGPT uses this for weather overlays from Environment Canada.

<a name="eccc"></a>
**ECCC** — Environment and Climate Change Canada. The government agency that provides weather forecast data used on the map.

<a name="double-buffering"></a>
**Double-Buffering** — A technique where the next image loads in the background before being shown, so transitions look smooth instead of flickering.

<a name="hydration"></a>
**Hydration** — The process where a web page that was already drawn by the server becomes interactive once JavaScript loads in your browser.

---

Built by [Kaustav Sharma](https://github.com/kaustav927)
