export const DOMAIN_KNOWLEDGE = `
## IESO Domain Knowledge

### Timezone Rules
- IESO operates on EST (Eastern Standard Time, UTC-5). The Ontario electricity market does NOT observe DST.
- IMPORTANT — Timestamp storage is NOT uniform across tables:
  - MOST tables (v_zonal_prices, v_zonal_demand, v_generator_output, v_fuel_mix, v_adequacy, v_da_ozp) store timestamps in EST (as naive DateTime, no timezone metadata). These timestamps are ALREADY in EST — do NOT subtract 5 hours.
  - EXCEPTION: v_intertie_flow stores timestamps in UTC. For this table only, subtract 5 to display EST: subtractHours(timestamp, 5).
- ClickHouse now() returns UTC. To get "now in EST": subtractHours(now(), 5).
- For time-range filters on EST tables: WHERE timestamp > subtractHours(now(), 5) - INTERVAL 1 HOUR (NOT now() - INTERVAL 1 HOUR, which is 5 hours ahead of the data).
- For time-range filters on v_intertie_flow (UTC): WHERE timestamp > now() - INTERVAL 1 HOUR.
- da_ozp uses delivery_date (EST date) and delivery_hour (hour-ending convention, 1-24): delivery_hour 1 = midnight-1am EST, delivery_hour 20 = 7pm-8pm EST, delivery_hour 21 = 8pm-9pm EST.
- Current delivery hour = toHour(subtractHours(now(), 5)) + 1. Example: at 8:40pm EST, toHour() = 20, +1 = delivery_hour 21.
- Today's EST date: toDate(subtractHours(now(), 5)).
- When users ask about "today" or "this morning", use toDate(subtractHours(now(), 5)) for date comparisons, or subtractHours(now(), 5) as the EST-equivalent base time for INTERVAL arithmetic.

### Zone Mappings
- 9 Pricing Zones: EAST, ESSA, NIAGARA, NORTHEAST, NORTHWEST, OTTAWA, SOUTHWEST, TORONTO, WEST
- 10 Demand Zones: Same 9 + BRUCE (BRUCE demand is separate; for pricing, BRUCE is merged into SOUTHWEST)
- Special demand zones: ONTARIO = province-wide total, GRID_LOAD = total grid load. Exclude these when comparing individual zones.
- NOTE: zonal_demand currently only contains ONTARIO (province total) and GRID_LOAD rows. Per-zone demand breakdown is not yet available in the data pipeline.

### Fuel Types
- NUCLEAR: Baseload ~60% of Ontario generation (Bruce, Darlington, Pickering)
- HYDRO: ~25%, dispatchable, large facilities like Niagara, Sir Adam Beck
- GAS: Peaker plants, ramp up during high demand periods
- WIND: Variable, concentrated in SOUTHWEST and EAST zones
- SOLAR: Variable, growing capacity, peak midday
- BIOFUEL: Small contribution, includes biomass facilities

### Intertie Conventions
- Positive actual_mw = Ontario is EXPORTING power
- Negative actual_mw = Ontario is IMPORTING power
- PQ.* interties (PQ.AT, PQ.B5D, PQ.D4Z, PQ.D5A, PQ.H4Z, PQ.H9A, PQ.P33C, PQ.Q4C, PQ.X2Y) should be grouped as QUEBEC
- MANITOBA and MANITOBA SK should be grouped as MANITOBA
- Other interties: MICHIGAN, MINNESOTA, NEW-YORK (each standalone)

### Deduplication
- Raw tables may contain duplicate rows from producer backfills.
- Always query the deduplicated views (v_zonal_prices, v_zonal_demand, etc.) — these are the table names in the schema above.
- The views handle dedup via GROUP BY on natural keys. No manual dedup subqueries needed.
- For time-series aggregations, still bucket by hour first: toStartOfHour(timestamp) with avg().

### IESO Public Report URLs (for source citations)
When presenting data, link to the specific report file, not just the catalogue page.
Use the URL patterns below. Only Realtime Zonal Prices uses YYYYMMDDHH (date + hour-ending 01-24). All other reports use YYYYMMDD only.
For multi-day queries (week-over-week, trends), link to the most recent day's report file rather than listing every day.
- Realtime Zonal Prices (per hour): https://reports-public.ieso.ca/public/RealtimeZonalEnergyPrices/PUB_RealtimeZonalEnergyPrices_YYYYMMDDHH.xml
- Generator Output (latest): https://reports-public.ieso.ca/public/GenOutputCapability/PUB_GenOutputCapability.xml
- Fuel Mix hourly (daily): https://reports-public.ieso.ca/public/GenOutputbyFuelHourly/PUB_GenOutputbyFuelHourly_YYYYMMDD.xml
- Intertie Flow (daily): https://reports-public.ieso.ca/public/IntertieScheduleFlow/PUB_IntertieScheduleFlow_YYYYMMDD.xml
- Adequacy Forecast (daily): https://reports-public.ieso.ca/public/Adequacy3/PUB_Adequacy3_YYYYMMDD.xml
- Day-Ahead Zonal Prices (daily): https://reports-public.ieso.ca/public/DAHourlyZonal/PUB_DAHourlyZonal_YYYYMMDD.xml
- Realtime Demand (daily CSV): https://reports-public.ieso.ca/public/RealtimeDemandZonal/PUB_RealtimeDemandZonal_YYYYMMDD.csv
Example: For Feb 06, 2026 Hour 15 prices → https://reports-public.ieso.ca/public/RealtimeZonalEnergyPrices/PUB_RealtimeZonalEnergyPrices_2026020615.xml

### Ontario Electricity Pricing (Single Schedule Market, effective May 2025)
- Ontario replaced the legacy HOEP with the Ontario Energy Market Price (OEMP).
- OEMP = Day-Ahead Ontario Zonal Price (DA-OZP) + Load Forecast Deviation Adjustment (LFDA).
- DA-OZP (in v_da_ozp) is the PRIMARY settlement price for non-dispatchable load (consumers, LDCs). Use this when users ask "what's the price?" or "how much does electricity cost?".
- DA-OZP is published daily ~1:30 PM EST for the next delivery day. It is hourly (24 hours × 9 zones).
- Real-time 5-minute prices (in v_zonal_prices) are monitoring data — they show grid conditions in real-time but are NOT the settlement price. Use these for: real-time snapshots, congestion analysis, spike detection.
- DO NOT compute "hourly prices" by averaging 12 five-minute RT intervals. That was the legacy HOEP method and is no longer how Ontario prices work.
- When comparing prices across days or hours, use DA-OZP (v_da_ozp) as the authoritative source.
- For DA-vs-RT spread analysis, compare DA-OZP to the avg of RT 5-min prices in the same hour.

### Price Interpretation
- DA-OZP (settlement price): Normal range $5-50/MWh. High (>$100) indicates forecast supply stress.
- RT 5-minute prices (monitoring): Can spike to $1,000+/MWh for individual intervals due to real-time congestion — this does NOT mean the settlement price is that high.
- Negative prices: Possible during surplus generation (wind/nuclear overnight) in both DA and RT.
- Congestion prices: Show transmission bottlenecks between zones (available in RT data).
- DA vs RT spread: DA-OZP minus avg RT price; large positive = DA over-forecast demand; large negative = RT stress beyond DA forecast.

### Common Query Pitfalls
- Do NOT use standard SQL window functions like ROW_NUMBER() OVER - prefer ClickHouse-native argMax(), argMin()
- Use toStartOfHour(), toStartOfDay() for time bucketing, NOT date_trunc()
- For conditional aggregation use sumIf(), countIf(), avgIf() - NOT CASE WHEN inside SUM()
- String comparison in ClickHouse is case-sensitive
- Always include LIMIT clause (max 500)
`;
