export const QUERY_PATTERNS = `
## Validated Query Patterns
All queries use deduplicated v_* views — no manual dedup subqueries needed.
IMPORTANT: Most tables store timestamps in EST (not UTC). Use subtractHours(now(), 5) as "current EST time" for filters.
Exception: v_intertie_flow stores timestamps in UTC — use now() directly for filtering that table, but always convert to ET (subtractHours(timestamp, 5)) when selecting timestamps for display.

### 1. Current Settlement Prices by Zone (DA-OZP, delivery_date = today's EST date)
SELECT zone, delivery_hour, round(zonal_price, 2) AS da_price
FROM ieso.v_da_ozp
WHERE delivery_date = toDate(subtractHours(now(), 5))
ORDER BY zone, delivery_hour
LIMIT 500

### 2. Real-Time Price Snapshot (latest 5-min monitoring price per zone — NOT settlement)
SELECT
  zone,
  argMax(price, timestamp) AS price,
  argMax(energy_loss_price, timestamp) AS energy_loss_price,
  argMax(congestion_price, timestamp) AS congestion_price,
  max(timestamp) AS latest_timestamp
FROM ieso.v_zonal_prices
WHERE timestamp > subtractHours(now(), 5) - INTERVAL 1 HOUR
GROUP BY zone
ORDER BY zone
LIMIT 20

### 3. 24-Hour RT Price Summary (monitoring data, not settlement)
SELECT zone, round(avg(price), 2) AS avg_price, min(price) AS min_price, max(price) AS max_price
FROM ieso.v_zonal_prices
WHERE timestamp > subtractHours(now(), 5) - INTERVAL 24 HOUR
GROUP BY zone
ORDER BY avg_price DESC
LIMIT 20

### 4. Current Fuel Mix (latest output per generator, grouped by fuel type)
-- NOTE: generator_output data can lag 2-3h behind other tables. 3h window ensures data availability.
SELECT fuel_type, round(sum(output), 1) AS total_mw, count() AS generator_count
FROM (
  SELECT generator, fuel_type, argMax(output_mw, timestamp) AS output
  FROM ieso.v_generator_output
  WHERE timestamp > subtractHours(now(), 5) - INTERVAL 3 HOUR
  GROUP BY generator, fuel_type
)
GROUP BY fuel_type
ORDER BY total_mw DESC
LIMIT 20

### 5. Current Ontario Demand
-- NOTE: zonal_demand currently only contains ONTARIO and GRID_LOAD totals (no per-zone breakdown).
SELECT zone, argMax(demand_mw, timestamp) AS demand_mw, max(timestamp) AS latest
FROM ieso.v_zonal_demand
WHERE timestamp > subtractHours(now(), 5) - INTERVAL 1 HOUR
  AND zone IN ('ONTARIO', 'GRID_LOAD')
GROUP BY zone
ORDER BY demand_mw DESC
LIMIT 20

### 6. Net Intertie Flows Grouped by Jurisdiction (NOTE: v_intertie_flow uses UTC timestamps)
SELECT
  multiIf(
    startsWith(intertie, 'PQ'), 'QUEBEC',
    intertie IN ('MANITOBA', 'MANITOBA SK'), 'MANITOBA',
    intertie
  ) AS jurisdiction,
  round(sum(actual_flow), 1) AS net_actual_mw,
  round(sum(scheduled_flow), 1) AS net_scheduled_mw
FROM (
  SELECT intertie, argMax(actual_mw, timestamp) AS actual_flow, argMax(scheduled_mw, timestamp) AS scheduled_flow
  FROM ieso.v_intertie_flow
  WHERE timestamp > now() - INTERVAL 2 HOUR
  GROUP BY intertie
)
GROUP BY jurisdiction
ORDER BY jurisdiction
LIMIT 20

### 7. Today vs Yesterday Fuel Mix Comparison
SELECT
  fuel_type,
  round(sumIf(output, period = 'today'), 1) AS today_avg_mw,
  round(sumIf(output, period = 'yesterday'), 1) AS yesterday_avg_mw,
  round(sumIf(output, period = 'today') - sumIf(output, period = 'yesterday'), 1) AS change_mw
FROM (
  SELECT
    fuel_type,
    avg(output_mw) AS output,
    if(toDate(timestamp) = toDate(subtractHours(now(), 5)), 'today', 'yesterday') AS period
  FROM ieso.v_fuel_mix
  WHERE timestamp > subtractHours(now(), 5) - INTERVAL 48 HOUR
  GROUP BY fuel_type, period
)
GROUP BY fuel_type
ORDER BY today_avg_mw DESC
LIMIT 20

### 8. RT Price Spikes in Last Week (5-min monitoring prices > $100/MWh)
SELECT
  timestamp AS est_time,
  zone,
  price,
  congestion_price,
  energy_loss_price
FROM ieso.v_zonal_prices
WHERE timestamp > subtractHours(now(), 5) - INTERVAL 7 DAY
  AND price > 100
ORDER BY price DESC
LIMIT 100

### 9. Day-Ahead vs Realtime Price Spread (delivery_date = today's EST date vs today's RT)
SELECT
  da.zone,
  da.delivery_hour,
  round(da.zonal_price, 2) AS da_price,
  round(rt.rt_price, 2) AS rt_price,
  round(da.zonal_price - rt.rt_price, 2) AS spread
FROM ieso.v_da_ozp da
LEFT JOIN (
  SELECT
    zone,
    toHour(timestamp) + 1 AS delivery_hour,
    avg(price) AS rt_price
  FROM ieso.v_zonal_prices
  WHERE toDate(timestamp) = toDate(subtractHours(now(), 5))
  GROUP BY zone, delivery_hour
) rt ON da.zone = rt.zone AND da.delivery_hour = rt.delivery_hour
WHERE da.delivery_date = toDate(subtractHours(now(), 5))
ORDER BY da.zone, da.delivery_hour
LIMIT 500

### 10. Today vs Yesterday DA Settlement Price Comparison (delivery_date = today and yesterday EST dates)
SELECT
  zone,
  round(avgIf(zonal_price, period = 'today'), 2) AS today_avg,
  round(avgIf(zonal_price, period = 'yesterday'), 2) AS yesterday_avg,
  round(avgIf(zonal_price, period = 'today') - avgIf(zonal_price, period = 'yesterday'), 2) AS change,
  round(
    (avgIf(zonal_price, period = 'today') - avgIf(zonal_price, period = 'yesterday'))
    / avgIf(zonal_price, period = 'yesterday') * 100, 1
  ) AS pct_change
FROM (
  SELECT zone, zonal_price,
    if(delivery_date = toDate(subtractHours(now(), 5)), 'today', 'yesterday') AS period
  FROM ieso.v_da_ozp
  WHERE delivery_date >= toDate(subtractHours(now(), 5)) - 1
    AND delivery_date <= toDate(subtractHours(now(), 5))
)
GROUP BY zone
HAVING avgIf(zonal_price, period = 'yesterday') > 0
ORDER BY change DESC
LIMIT 20

### 11. This Week vs Last Week Generation by Fuel Type (daily breakdown)
-- For comparing specific fuel types across weeks. Replace 'WIND' with the target fuel type.
-- For all fuel types combined, remove the fuel_type = 'WIND' filter.
SELECT
  fuel_type,
  toDate(timestamp) AS day,
  round(avg(output_mw), 1) AS avg_mw,
  round(min(output_mw), 1) AS min_mw,
  round(max(output_mw), 1) AS max_mw,
  if(toDate(timestamp) >= toDate(subtractHours(now(), 5)) - 6, 'this_week', 'last_week') AS period
FROM ieso.v_fuel_mix
WHERE timestamp > subtractHours(now(), 5) - INTERVAL 14 DAY
  AND fuel_type = 'WIND'
GROUP BY fuel_type, day, period
ORDER BY day
LIMIT 500

### 12. Adequacy / Supply-Demand Margin (today's forecast)
SELECT
  delivery_hour,
  round(forecast_demand_mw, 0) AS demand_mw,
  round(forecast_supply_mw, 0) AS supply_mw,
  round(forecast_supply_mw - forecast_demand_mw, 0) AS surplus_mw
FROM ieso.v_adequacy
WHERE delivery_date = toDate(subtractHours(now(), 5))
ORDER BY delivery_hour
LIMIT 50

### 13. Intertie Flows — Quebec & New York Detail (NOTE: v_intertie_flow uses UTC timestamps)
SELECT
  intertie,
  round(argMax(actual_mw, timestamp), 1) AS actual_mw,
  round(argMax(scheduled_mw, timestamp), 1) AS scheduled_mw
FROM ieso.v_intertie_flow
WHERE timestamp > now() - INTERVAL 2 HOUR
  AND (startsWith(intertie, 'PQ') OR intertie = 'NEW-YORK')
GROUP BY intertie
ORDER BY intertie
LIMIT 20

### 14. Current Intertie LMP by Zone (real-time, EST timestamps)
SELECT
  intertie_zone,
  round(argMax(lmp, timestamp), 2) AS lmp,
  max(timestamp) AS latest_timestamp
FROM ieso.v_realtime_intertie_lmp
WHERE timestamp > subtractHours(now(), 5) - INTERVAL 1 HOUR
GROUP BY intertie_zone
ORDER BY intertie_zone
LIMIT 20

### 15. Intertie LMP Comparison: Real-Time vs Day-Ahead
SELECT
  rt.intertie_zone,
  round(rt.rt_lmp, 2) AS rt_lmp,
  round(da.da_lmp, 2) AS da_lmp,
  round(rt.rt_lmp - da.da_lmp, 2) AS spread
FROM (
  SELECT intertie_zone, argMax(lmp, timestamp) AS rt_lmp
  FROM ieso.v_realtime_intertie_lmp
  WHERE timestamp > subtractHours(now(), 5) - INTERVAL 1 HOUR
  GROUP BY intertie_zone
) rt
LEFT JOIN (
  SELECT intertie_zone, lmp AS da_lmp
  FROM ieso.v_da_intertie_lmp
  WHERE delivery_date = toDate(subtractHours(now(), 5))
    AND delivery_hour = toHour(subtractHours(now(), 5)) + 1
) da ON rt.intertie_zone = da.intertie_zone
ORDER BY rt.intertie_zone
LIMIT 20

### 16. 24-Hour Intertie LMP Trend (hourly average by zone, EST timestamps)
SELECT
  toStartOfHour(timestamp) AS hour,
  intertie_zone,
  round(avg(lmp), 2) AS avg_lmp
FROM ieso.v_realtime_intertie_lmp
WHERE timestamp > subtractHours(now(), 5) - INTERVAL 24 HOUR
GROUP BY hour, intertie_zone
ORDER BY hour, intertie_zone
LIMIT 500

### 17. Current Weather Across Ontario Zones (NOTE: v_weather uses UTC timestamps — subtract 5h for EST display)
SELECT
  subtractHours(valid_timestamp, 5) AS est_time,
  zone,
  round(temperature, 1) AS temperature_c,
  round(wind_speed, 1) AS wind_speed_ms,
  wind_direction AS wind_dir_deg,
  cloud_cover AS cloud_pct
FROM ieso.v_weather
-- IMPORTANT: v_weather contains forecasts up to 24h ahead. Filter <= now() for observations only.
WHERE valid_timestamp = (SELECT max(valid_timestamp) FROM ieso.v_weather WHERE valid_timestamp <= now())
ORDER BY zone
LIMIT 20
`;
