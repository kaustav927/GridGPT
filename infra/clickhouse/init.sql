-- Ontario Grid Cockpit - ClickHouse Schema
-- Includes Kafka engine tables for real-time ingestion

-- ============================================================
-- ZONAL PRICES (5-minute data)
-- ============================================================

-- Kafka consumer table
CREATE TABLE IF NOT EXISTS ieso.zonal_prices_queue (
    timestamp DateTime,
    zone String,
    price Float32,
    energy_loss_price Float32,
    congestion_price Float32
) ENGINE = Kafka
SETTINGS 
    kafka_broker_list = 'redpanda:9092',
    kafka_topic_list = 'ieso.realtime.zonal-prices',
    kafka_group_name = 'clickhouse-zonal-prices',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1;

-- Storage table (MergeTree)
CREATE TABLE IF NOT EXISTS ieso.zonal_prices (
    timestamp DateTime,
    zone String,
    price Float32,
    energy_loss_price Float32,
    congestion_price Float32
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (zone, timestamp)
TTL timestamp + INTERVAL 90 DAY;

-- Materialized view to auto-insert from Kafka
CREATE MATERIALIZED VIEW IF NOT EXISTS ieso.zonal_prices_mv TO ieso.zonal_prices AS
SELECT * FROM ieso.zonal_prices_queue;

-- ============================================================
-- ZONAL DEMAND (5-minute data)
-- ============================================================

CREATE TABLE IF NOT EXISTS ieso.zonal_demand_queue (
    timestamp DateTime,
    zone String,
    demand_mw Float32
) ENGINE = Kafka
SETTINGS 
    kafka_broker_list = 'redpanda:9092',
    kafka_topic_list = 'ieso.realtime.zonal-demand',
    kafka_group_name = 'clickhouse-zonal-demand',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1;

CREATE TABLE IF NOT EXISTS ieso.zonal_demand (
    timestamp DateTime,
    zone String,
    demand_mw Float32
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (zone, timestamp)
TTL timestamp + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS ieso.zonal_demand_mv TO ieso.zonal_demand AS
SELECT * FROM ieso.zonal_demand_queue;

-- ============================================================
-- GENERATOR OUTPUT (5-minute data)
-- ============================================================

CREATE TABLE IF NOT EXISTS ieso.generator_output_queue (
    timestamp DateTime,
    generator String,
    fuel_type String,
    output_mw Float32,
    capability_mw Float32
) ENGINE = Kafka
SETTINGS 
    kafka_broker_list = 'redpanda:9092',
    kafka_topic_list = 'ieso.realtime.generator-output',
    kafka_group_name = 'clickhouse-generator-output',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1;

CREATE TABLE IF NOT EXISTS ieso.generator_output (
    timestamp DateTime,
    generator String,
    fuel_type String,
    output_mw Float32,
    capability_mw Float32
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (fuel_type, generator, timestamp)
TTL timestamp + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS ieso.generator_output_mv TO ieso.generator_output AS
SELECT * FROM ieso.generator_output_queue;

-- ============================================================
-- FUEL MIX (Hourly data)
-- ============================================================

CREATE TABLE IF NOT EXISTS ieso.fuel_mix_queue (
    timestamp DateTime,
    fuel_type String,
    output_mw Float32
) ENGINE = Kafka
SETTINGS 
    kafka_broker_list = 'redpanda:9092',
    kafka_topic_list = 'ieso.hourly.fuel-mix',
    kafka_group_name = 'clickhouse-fuel-mix',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1;

CREATE TABLE IF NOT EXISTS ieso.fuel_mix (
    timestamp DateTime,
    fuel_type String,
    output_mw Float32
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (fuel_type, timestamp)
TTL timestamp + INTERVAL 1 YEAR;

CREATE MATERIALIZED VIEW IF NOT EXISTS ieso.fuel_mix_mv TO ieso.fuel_mix AS
SELECT * FROM ieso.fuel_mix_queue;

-- ============================================================
-- INTERTIE FLOW (Hourly data)
-- ============================================================

CREATE TABLE IF NOT EXISTS ieso.intertie_flow_queue (
    timestamp DateTime,
    intertie String,
    scheduled_mw Float32,
    actual_mw Float32
) ENGINE = Kafka
SETTINGS 
    kafka_broker_list = 'redpanda:9092',
    kafka_topic_list = 'ieso.hourly.intertie-flow',
    kafka_group_name = 'clickhouse-intertie-flow',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1;

CREATE TABLE IF NOT EXISTS ieso.intertie_flow (
    timestamp DateTime,
    intertie String,
    scheduled_mw Float32,
    actual_mw Float32
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (intertie, timestamp)
TTL timestamp + INTERVAL 1 YEAR;

CREATE MATERIALIZED VIEW IF NOT EXISTS ieso.intertie_flow_mv TO ieso.intertie_flow AS
SELECT * FROM ieso.intertie_flow_queue;

-- ============================================================
-- ADEQUACY (Hourly demand and supply forecasts)
-- ============================================================

CREATE TABLE IF NOT EXISTS ieso.adequacy_queue (
    timestamp DateTime,
    delivery_date Date,
    delivery_hour UInt8,
    forecast_demand_mw Float32,
    forecast_supply_mw Float32
) ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'redpanda:9092',
    kafka_topic_list = 'ieso.hourly.adequacy',
    kafka_group_name = 'clickhouse-adequacy-v3',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1,
    kafka_skip_broken_messages = 100000;

CREATE TABLE IF NOT EXISTS ieso.adequacy (
    timestamp DateTime,
    delivery_date Date,
    delivery_hour UInt8,
    forecast_demand_mw Float32,
    forecast_supply_mw Float32
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (delivery_date, delivery_hour)
TTL timestamp + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS ieso.adequacy_mv TO ieso.adequacy AS
SELECT * FROM ieso.adequacy_queue;

-- ============================================================
-- DAY-AHEAD ONTARIO ZONAL PRICES (Daily ~13:30)
-- ============================================================

CREATE TABLE IF NOT EXISTS ieso.da_ozp_queue (
    timestamp DateTime,
    delivery_date Date,
    delivery_hour UInt8,
    zone String,
    zonal_price Float32
) ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'redpanda:9092',
    kafka_topic_list = 'ieso.hourly.da-ozp',
    kafka_group_name = 'clickhouse-da-ozp-v2',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1,
    kafka_skip_broken_messages = 100000;

CREATE TABLE IF NOT EXISTS ieso.da_ozp (
    timestamp DateTime,
    delivery_date Date,
    delivery_hour UInt8,
    zone String,
    zonal_price Float32
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (zone, delivery_date, delivery_hour)
TTL timestamp + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS ieso.da_ozp_mv TO ieso.da_ozp AS
SELECT * FROM ieso.da_ozp_queue;

-- ============================================================
-- TTL UPDATES FOR STORAGE OPTIMIZATION
-- ============================================================
-- Note: These ALTER statements will run after initial table creation
-- and optimize storage by reducing retention where appropriate

-- Reduce generator_output from 90 to 30 days (high volume, rarely need history)
-- ALTER TABLE ieso.generator_output MODIFY TTL timestamp + INTERVAL 30 DAY;

-- Reduce fuel_mix from 1 year to 6 months
-- ALTER TABLE ieso.fuel_mix MODIFY TTL timestamp + INTERVAL 180 DAY;

-- Reduce intertie_flow from 1 year to 6 months
-- ALTER TABLE ieso.intertie_flow MODIFY TTL timestamp + INTERVAL 180 DAY;

-- Views will be created later via queries
-- Base tables and Kafka consumers are ready

-- ============================================================
-- WEATHER DATA WITH FORECAST (15-minute data from Open-Meteo)
-- ============================================================

-- Kafka consumer table for weather with forecast support
CREATE TABLE IF NOT EXISTS ieso.weather_queue (
    fetch_timestamp DateTime,     -- When we fetched this data
    valid_timestamp DateTime,     -- When this data is valid for
    zone String,
    lat Float32,
    lng Float32,
    temperature Float32,          -- Celsius
    wind_speed Float32,           -- m/s
    wind_direction UInt16,        -- degrees (0-360)
    cloud_cover UInt8,            -- percentage (0-100)
    precipitation Float32,        -- mm/h
    is_forecast UInt8             -- 0 = observed, 1 = forecast
) ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'redpanda:9092',
    kafka_topic_list = 'ieso.weather.forecast',
    kafka_group_name = 'clickhouse-weather-forecast',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1;

-- Persistent storage with forecast-aware schema
CREATE TABLE IF NOT EXISTS ieso.weather (
    fetch_timestamp DateTime,
    valid_timestamp DateTime,
    zone String,
    lat Float32,
    lng Float32,
    temperature Float32,
    wind_speed Float32,
    wind_direction UInt16,
    cloud_cover UInt8,
    precipitation Float32,
    is_forecast UInt8
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(valid_timestamp)
ORDER BY (zone, valid_timestamp, fetch_timestamp)
TTL fetch_timestamp + INTERVAL 7 DAY;

-- Auto-insert from Kafka
CREATE MATERIALIZED VIEW IF NOT EXISTS ieso.weather_mv TO ieso.weather
AS SELECT * FROM ieso.weather_queue;

-- ============================================================
-- DEDUP VIEWS (query these instead of raw tables)
-- Producer backfills create duplicate rows in MergeTree tables.
-- These views GROUP BY natural keys to collapse duplicates.
-- ============================================================

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
SELECT valid_timestamp, zone,
  avg(lat) AS lat,
  avg(lng) AS lng,
  avg(temperature) AS temperature,
  avg(wind_speed) AS wind_speed,
  avg(wind_direction) AS wind_direction,
  avg(cloud_cover) AS cloud_cover
FROM ieso.weather
GROUP BY valid_timestamp, zone;