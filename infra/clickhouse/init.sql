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

-- Views will be created later via queries
-- Base tables and Kafka consumers are ready