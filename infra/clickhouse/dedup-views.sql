-- Dedup views for Ontario Grid Cockpit
-- Run against existing ClickHouse instance:
--   docker exec -i clickhouse clickhouse-client < infra/clickhouse/dedup-views.sql

CREATE VIEW IF NOT EXISTS ieso.v_zonal_prices AS
SELECT timestamp, zone,
  avg(price) AS price,
  avg(energy_loss_price) AS energy_loss_price,
  avg(congestion_price) AS congestion_price
FROM ieso.zonal_prices
GROUP BY timestamp, zone;

CREATE VIEW IF NOT EXISTS ieso.v_zonal_demand AS
SELECT timestamp, zone,
  avg(demand_mw) AS demand_mw
FROM ieso.zonal_demand
GROUP BY timestamp, zone;

CREATE VIEW IF NOT EXISTS ieso.v_generator_output AS
SELECT timestamp, generator,
  argMax(fuel_type, timestamp) AS fuel_type,
  avg(output_mw) AS output_mw,
  avg(capability_mw) AS capability_mw
FROM ieso.generator_output
GROUP BY timestamp, generator;

CREATE VIEW IF NOT EXISTS ieso.v_fuel_mix AS
SELECT timestamp, fuel_type,
  avg(output_mw) AS output_mw
FROM ieso.fuel_mix
GROUP BY timestamp, fuel_type;

CREATE VIEW IF NOT EXISTS ieso.v_intertie_flow AS
SELECT timestamp, intertie,
  avg(scheduled_mw) AS scheduled_mw,
  avg(actual_mw) AS actual_mw
FROM ieso.intertie_flow
GROUP BY timestamp, intertie;

CREATE VIEW IF NOT EXISTS ieso.v_adequacy AS
SELECT delivery_date, delivery_hour,
  argMax(forecast_demand_mw, timestamp) AS forecast_demand_mw,
  argMax(forecast_supply_mw, timestamp) AS forecast_supply_mw,
  max(timestamp) AS publish_timestamp
FROM ieso.adequacy
GROUP BY delivery_date, delivery_hour;

CREATE VIEW IF NOT EXISTS ieso.v_da_ozp AS
SELECT delivery_date, delivery_hour, zone,
  argMax(zonal_price, timestamp) AS zonal_price,
  max(timestamp) AS publish_timestamp
FROM ieso.da_ozp
GROUP BY delivery_date, delivery_hour, zone;

CREATE VIEW IF NOT EXISTS ieso.v_weather AS
SELECT timestamp, zone,
  avg(lat) AS lat,
  avg(lng) AS lng,
  avg(temperature) AS temperature,
  avg(wind_speed) AS wind_speed,
  avg(wind_direction) AS wind_direction,
  avg(cloud_cover) AS cloud_cover
FROM ieso.weather
GROUP BY timestamp, zone;
