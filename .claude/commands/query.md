# Run ClickHouse Query

Execute a SQL query against the local ClickHouse instance.

## Usage

Provide a SQL query to execute. Examples:

### Latest prices
```bash
curl -s "http://localhost:8123/?default_format=PrettyCompact&database=ieso" \
  --data "SELECT zone, price, timestamp FROM zonal_prices ORDER BY timestamp DESC LIMIT 10"
```

### Fuel mix
```bash
curl -s "http://localhost:8123/?default_format=PrettyCompact&database=ieso" \
  --data "SELECT fuel_type, output_mw FROM fuel_mix ORDER BY output_mw DESC LIMIT 10"
```

### Generator status
```bash
curl -s "http://localhost:8123/?default_format=PrettyCompact&database=ieso" \
  --data "SELECT generator, output_mw, capability_mw FROM generator_output WHERE fuel_type='NUCLEAR' ORDER BY generator LIMIT 20"
```

### Table row counts
```bash
curl -s "http://localhost:8123/?default_format=PrettyCompact&database=ieso" \
  --data "SELECT table, formatReadableQuantity(total_rows) as rows FROM system.tables WHERE database='ieso' ORDER BY total_rows DESC"
```
