#!/usr/bin/env bash
# Test all chat query patterns against ClickHouse
# Usage: ./scripts/test-chat-patterns.sh
#
# Known data pipeline limitations:
#   - generator_output can lag 2-3h behind other tables
#   - zonal_demand only has ONTARIO/GRID_LOAD rows (no per-zone data)
#   - price spikes depend on market conditions in the query window

set -euo pipefail

PASS=0; FAIL=0; WARN=0

run_test() {
  local name="$1" query="$2" min_rows="${3:-1}" known_issue="${4:-}"
  local count
  count=$(docker exec clickhouse clickhouse-client -q "$query" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" -ge "$min_rows" ]; then
    echo "  PASS  $name ($count rows)"
    PASS=$((PASS + 1))
  elif [ -n "$known_issue" ]; then
    echo "  WARN  $name ($count rows) — $known_issue"
    WARN=$((WARN + 1))
  else
    echo "  FAIL  $name ($count rows, expected >= $min_rows)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Ontario Grid Cockpit — Chat Query Pattern Validation ==="
echo ""

# Pattern 1: DA-OZP settlement prices
run_test "Pattern 1:  DA-OZP Today" \
  "SELECT zone, delivery_hour, round(zonal_price, 2) FROM ieso.v_da_ozp WHERE delivery_date = toDate(subtractHours(now(), 5)) LIMIT 500" \
  9

# Pattern 2: RT price snapshot
run_test "Pattern 2:  RT Snapshot" \
  "SELECT zone, argMax(price, timestamp) FROM ieso.v_zonal_prices WHERE timestamp > subtractHours(now(), 5) - INTERVAL 1 HOUR GROUP BY zone LIMIT 20" \
  9

# Pattern 3: 24h RT summary
run_test "Pattern 3:  24h RT Summary" \
  "SELECT zone, round(avg(price), 2) FROM ieso.v_zonal_prices WHERE timestamp > subtractHours(now(), 5) - INTERVAL 24 HOUR GROUP BY zone LIMIT 20" \
  9

# Pattern 4: Fuel mix (3h window for generator_output lag)
run_test "Pattern 4:  Current Fuel Mix" \
  "SELECT fuel_type, round(sum(output), 1) FROM (SELECT generator, fuel_type, argMax(output_mw, timestamp) AS output FROM ieso.v_generator_output WHERE timestamp > subtractHours(now(), 5) - INTERVAL 3 HOUR GROUP BY generator, fuel_type) GROUP BY fuel_type LIMIT 20" \
  3 "generator_output can lag 2-3h"

# Pattern 5: Ontario demand totals
run_test "Pattern 5:  Ontario Demand" \
  "SELECT zone, argMax(demand_mw, timestamp) FROM ieso.v_zonal_demand WHERE timestamp > subtractHours(now(), 5) - INTERVAL 1 HOUR AND zone IN ('ONTARIO', 'GRID_LOAD') GROUP BY zone LIMIT 20" \
  1 "only ONTARIO/GRID_LOAD available, no per-zone data"

# Pattern 6: Intertie flows (UTC table)
run_test "Pattern 6:  Intertie Flows" \
  "SELECT multiIf(startsWith(intertie, 'PQ'), 'QUEBEC', intertie IN ('MANITOBA', 'MANITOBA SK'), 'MANITOBA', intertie) AS jurisdiction, round(sum(actual_flow), 1) FROM (SELECT intertie, argMax(actual_mw, timestamp) AS actual_flow FROM ieso.v_intertie_flow WHERE timestamp > now() - INTERVAL 2 HOUR GROUP BY intertie) GROUP BY jurisdiction LIMIT 20" \
  3

# Pattern 7: Fuel comparison today vs yesterday
run_test "Pattern 7:  Fuel Today vs Yesterday" \
  "SELECT fuel_type, round(sumIf(output, period = 'today'), 1), round(sumIf(output, period = 'yesterday'), 1) FROM (SELECT fuel_type, avg(output_mw) AS output, if(toDate(timestamp) = toDate(subtractHours(now(), 5)), 'today', 'yesterday') AS period FROM ieso.v_fuel_mix WHERE timestamp > subtractHours(now(), 5) - INTERVAL 48 HOUR GROUP BY fuel_type, period) GROUP BY fuel_type LIMIT 20" \
  3

# Pattern 8: RT price spikes
run_test "Pattern 8:  RT Price Spikes" \
  "SELECT timestamp, zone, price FROM ieso.v_zonal_prices WHERE timestamp > subtractHours(now(), 5) - INTERVAL 7 DAY AND price > 100 ORDER BY price DESC LIMIT 10" \
  1 "depends on whether spikes occurred in last 7 days"

# Pattern 9: DA vs RT spread
run_test "Pattern 9:  DA vs RT Spread" \
  "SELECT da.zone, da.delivery_hour, round(da.zonal_price, 2) AS da_price, round(rt.rt_price, 2) AS rt_price FROM ieso.v_da_ozp da LEFT JOIN (SELECT zone, toHour(timestamp) + 1 AS delivery_hour, avg(price) AS rt_price FROM ieso.v_zonal_prices WHERE toDate(timestamp) = toDate(subtractHours(now(), 5)) GROUP BY zone, delivery_hour) rt ON da.zone = rt.zone AND da.delivery_hour = rt.delivery_hour WHERE da.delivery_date = toDate(subtractHours(now(), 5)) LIMIT 20" \
  9

# Pattern 10: DA today vs yesterday
run_test "Pattern 10: DA Today vs Yesterday" \
  "SELECT zone, round(avgIf(zonal_price, period = 'today'), 2), round(avgIf(zonal_price, period = 'yesterday'), 2) FROM (SELECT zone, zonal_price, if(delivery_date = toDate(subtractHours(now(), 5)), 'today', 'yesterday') AS period FROM ieso.v_da_ozp WHERE delivery_date >= toDate(subtractHours(now(), 5)) - 1 AND delivery_date <= toDate(subtractHours(now(), 5))) GROUP BY zone HAVING avgIf(zonal_price, period = 'yesterday') > 0 LIMIT 20" \
  9

# Pattern 11: Week-over-week fuel type
run_test "Pattern 11: Week-over-Week WIND" \
  "SELECT toDate(timestamp) AS day, round(avg(output_mw), 1) FROM ieso.v_fuel_mix WHERE timestamp > subtractHours(now(), 5) - INTERVAL 14 DAY AND fuel_type = 'WIND' GROUP BY day ORDER BY day LIMIT 500" \
  7

echo ""
echo "Results: $PASS passed, $FAIL failed, $WARN warnings"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
