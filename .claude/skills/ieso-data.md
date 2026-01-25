# IESO Data Patterns

## Report URLs

Base: `https://reports-public.ieso.ca/public/`

| Report | Path | Format | Namespace |
|--------|------|--------|-----------|
| Zonal Prices | `RealtimeZonalEnergyPrices/PUB_RealtimeZonalEnergyPrices.xml` | XML | `http://www.ieso.ca/schema` |
| Zonal Demand | `RealtimeDemandZonal/PUB_RealtimeDemandZonal.csv` | CSV | N/A |
| Generator Output | `GenOutputCapability/PUB_GenOutputCapability.xml` | XML | `http://www.theIMO.com/schema` |
| Fuel Mix | `GenOutputbyFuelHourly/PUB_GenOutputbyFuelHourly.xml` | XML | `http://www.ieso.ca/schema` |
| Intertie Flow | `IntertieScheduleFlow/PUB_IntertieScheduleFlow.xml` | XML | `http://www.theIMO.com/schema` |

**Important:** Two different XML namespaces are used:
- `ieso.ca/schema` for prices and fuel mix
- `theIMO.com/schema` for generator output and intertie flow

## Actual XML Structures

### Zonal Prices (ieso.ca namespace)
```xml
<Document xmlns="http://www.ieso.ca/schema">
  <DocBody>
    <DELIVERYDATE>2026-01-25</DELIVERYDATE>
    <DELIVERYHOUR>15</DELIVERYHOUR>  <!-- 1-24 -->
    <ZonalPrices>
      <TransactionZone>
        <ZoneName>EAST:HUB</ZoneName>
        <IntervalPrice>
          <Interval>1</Interval>  <!-- 1-12, each is 5 minutes -->
          <ZonalPrice>629.6</ZonalPrice>
          <EnergyLossPrice>18.69</EnergyLossPrice>
          <EnergyCongPrice>0</EnergyCongPrice>
        </IntervalPrice>
      </TransactionZone>
    </ZonalPrices>
  </DocBody>
</Document>
```

### Generator Output (theIMO.com namespace)
```xml
<IMODocument xmlns="http://www.theIMO.com/schema">
  <IMODocBody>
    <Date>2026-01-25</Date>
    <Generators>
      <Generator>
        <GeneratorName>BRUCEA-G1</GeneratorName>
        <FuelType>NUCLEAR</FuelType>
        <Outputs>
          <Output><Hour>1</Hour><EnergyMW>820</EnergyMW></Output>
        </Outputs>
        <Capabilities>
          <Capability><Hour>1</Hour><EnergyMW>828</EnergyMW></Capability>
        </Capabilities>
      </Generator>
    </Generators>
  </IMODocBody>
</IMODocument>
```

### Fuel Mix (ieso.ca namespace)
```xml
<Document xmlns="http://www.ieso.ca/schema">
  <DocBody>
    <DailyData>
      <Day>2026-01-25</Day>
      <HourlyData>
        <Hour>1</Hour>
        <FuelTotal>
          <Fuel>NUCLEAR</Fuel>
          <EnergyValue><Output>9602</Output></EnergyValue>
        </FuelTotal>
      </HourlyData>
    </DailyData>
  </DocBody>
</Document>
```

### Intertie Flow (theIMO.com namespace)
```xml
<IMODocument xmlns="http://www.theIMO.com/schema">
  <IMODocBody>
    <Date>2026-01-25</Date>
    <IntertieZone>
      <IntertieZoneName>MANITOBA</IntertieZoneName>
      <Schedules>
        <Schedule><Hour>1</Hour><Import>58</Import><Export>24</Export></Schedule>
      </Schedules>
      <Actuals>
        <Actual><Hour>1</Hour><Interval>1</Interval><Flow>-19.8</Flow></Actual>
      </Actuals>
    </IntertieZone>
  </IMODocBody>
</IMODocument>
```

### Zonal Demand (CSV)
```
Date,Hour,Interval,Ontario Demand,NORTHWEST,NORTHEAST,OTTAWA,EAST,TORONTO,ESSA,BRUCE,SOUTHWEST,NIAGARA,WEST,Zones Total,DIFF
2026-01-23,20,1,21719,287,183,412,298,4521,1823,9,2891,892,503,21719,0
```
- Skip first 4 rows (metadata)
- Hour is 1-24, Interval is 1-12 (5-min)

## Zone Mappings

**9 Pricing Zones:** EAST, ESSA, NIAGARA, NORTHEAST, NORTHWEST, OTTAWA, SOUTHWEST, TORONTO, WEST

**10 Demand Zones:** Above + BRUCE

**Fuel Types:** NUCLEAR, GAS, HYDRO, WIND, SOLAR, BIOFUEL, OTHER

**Interties:** MANITOBA, MICHIGAN, MINNESOTA, NEW-YORK, PQ.AT, PQ.D4Z, PQ.D5A, PQ.H4Z, PQ.H9A, PQ.P33C, PQ.Q4C, PQ.X2Y

## ClickHouse Tables

```sql
-- Main tables (MergeTree)
ieso.zonal_prices      -- zone, price, energy_loss_price, congestion_price, timestamp
ieso.zonal_demand      -- zone, demand_mw, timestamp
ieso.generator_output  -- generator, fuel_type, output_mw, capability_mw, timestamp
ieso.fuel_mix          -- fuel_type, output_mw, timestamp
ieso.intertie_flow     -- intertie, scheduled_mw, actual_mw, timestamp

-- Kafka queue tables (for ingestion)
ieso.*_queue

-- Materialized views (auto-insert from Kafka to MergeTree)
ieso.*_mv
```

## Useful Queries

```sql
-- Latest price per zone
SELECT zone, argMax(price, timestamp) as price, max(timestamp) as ts
FROM ieso.zonal_prices WHERE timestamp > now() - INTERVAL 1 HOUR GROUP BY zone;

-- Current fuel mix
SELECT fuel_type, argMax(output_mw, timestamp) as output_mw
FROM ieso.fuel_mix WHERE timestamp > now() - INTERVAL 2 HOUR GROUP BY fuel_type ORDER BY output_mw DESC;

-- Ontario total demand
SELECT sum(demand_mw) as total FROM ieso.zonal_demand WHERE timestamp = (SELECT max(timestamp) FROM ieso.zonal_demand);

-- Generator utilization
SELECT generator, fuel_type, 
  argMax(output_mw, timestamp) as output,
  argMax(capability_mw, timestamp) as cap,
  round(argMax(output_mw, timestamp) / argMax(capability_mw, timestamp) * 100, 1) as util_pct
FROM ieso.generator_output WHERE timestamp > now() - INTERVAL 1 HOUR GROUP BY generator, fuel_type;
```
