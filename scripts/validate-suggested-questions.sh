#!/usr/bin/env bash
# Validate that every suggested chat question has answerable data in ClickHouse.
# Each question is tested with a representative SQL query.
# Usage: ./scripts/validate-suggested-questions.sh
#
# Exit code 1 on any FAIL.

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

echo "=== Suggested Questions — Data Availability Validation ==="
echo ""
echo "--- Set 1 ---"

# Q1: "Why are prices high right now?" → RT zonal prices (Pattern 2)
run_test "Q1:  Why are prices high right now?" \
  "SELECT zone, argMax(price, timestamp) FROM ieso.v_zonal_prices WHERE timestamp > subtractHours(now(), 5) - INTERVAL 1 HOUR GROUP BY zone LIMIT 20" \
  9

# Q2: "What is the current fuel mix?" → Fuel mix (Pattern 4)
run_test "Q2:  What is the current fuel mix?" \
  "SELECT fuel_type, round(sum(output), 1) FROM (SELECT generator, fuel_type, argMax(output_mw, timestamp) AS output FROM ieso.v_generator_output WHERE timestamp > subtractHours(now(), 5) - INTERVAL 3 HOUR GROUP BY generator, fuel_type) GROUP BY fuel_type LIMIT 20" \
  3 "generator_output can lag 2-3h"

# Q3: "Is there enough supply to meet forecast demand?" → Adequacy (Pattern 12)
run_test "Q3:  Is there enough supply to meet forecast demand?" \
  "SELECT delivery_hour, round(forecast_demand_mw, 0), round(forecast_supply_mw, 0) FROM ieso.v_adequacy WHERE delivery_date = toDate(subtractHours(now(), 5)) LIMIT 50" \
  10

# Q4: "Are we importing or exporting power?" → Intertie flows (Pattern 6)
run_test "Q4:  Are we importing or exporting power?" \
  "SELECT multiIf(startsWith(intertie, 'PQ'), 'QUEBEC', intertie IN ('MANITOBA', 'MANITOBA SK'), 'MANITOBA', intertie) AS jurisdiction, round(sum(actual_flow), 1) FROM (SELECT intertie, argMax(actual_mw, timestamp) AS actual_flow FROM ieso.v_intertie_flow WHERE timestamp > now() - INTERVAL 2 HOUR GROUP BY intertie) GROUP BY jurisdiction LIMIT 20" \
  3

echo ""
echo "--- Set 2 ---"

# Q5: "Compare today's prices to yesterday" → DA today vs yesterday (Pattern 10)
run_test "Q5:  Compare today's prices to yesterday" \
  "SELECT zone, round(avgIf(zonal_price, period = 'today'), 2), round(avgIf(zonal_price, period = 'yesterday'), 2) FROM (SELECT zone, zonal_price, if(delivery_date = toDate(subtractHours(now(), 5)), 'today', 'yesterday') AS period FROM ieso.v_da_ozp WHERE delivery_date >= toDate(subtractHours(now(), 5)) - 1 AND delivery_date <= toDate(subtractHours(now(), 5))) GROUP BY zone HAVING avgIf(zonal_price, period = 'yesterday') > 0 LIMIT 20" \
  9

# Q6: "Which zone has the cheapest day-ahead price today?" → DA-OZP (Pattern 1)
run_test "Q6:  Which zone has the cheapest day-ahead price today?" \
  "SELECT zone, round(avg(zonal_price), 2) AS avg_price FROM ieso.v_da_ozp WHERE delivery_date = toDate(subtractHours(now(), 5)) GROUP BY zone ORDER BY avg_price ASC LIMIT 9" \
  9

# Q7: "How much power are we trading with Quebec and New York?" → Intertie QC/NY (Pattern 13)
run_test "Q7:  How much power are we trading with Quebec and New York?" \
  "SELECT intertie, round(argMax(actual_mw, timestamp), 1) FROM ieso.v_intertie_flow WHERE timestamp > now() - INTERVAL 2 HOUR AND (startsWith(intertie, 'PQ') OR intertie = 'NEW-YORK') GROUP BY intertie LIMIT 20" \
  2

# Q8: "What does the day-ahead market look like?" → DA-OZP (Pattern 1)
run_test "Q8:  What does the day-ahead market look like?" \
  "SELECT zone, delivery_hour, round(zonal_price, 2) FROM ieso.v_da_ozp WHERE delivery_date = toDate(subtractHours(now(), 5)) LIMIT 500" \
  9

echo ""
echo "--- Set 3 ---"

# Q9: "Show me price spikes in the last week" → RT spikes (Pattern 8)
run_test "Q9:  Show me price spikes in the last week" \
  "SELECT timestamp, zone, price FROM ieso.v_zonal_prices WHERE timestamp > subtractHours(now(), 5) - INTERVAL 7 DAY AND price > 100 ORDER BY price DESC LIMIT 10" \
  1 "depends on whether spikes occurred in last 7 days"

# Q10: "How does wind generation compare to last week?" → Fuel mix weekly (Pattern 11)
run_test "Q10: How does wind generation compare to last week?" \
  "SELECT toDate(timestamp) AS day, round(avg(output_mw), 1) FROM ieso.v_fuel_mix WHERE timestamp > subtractHours(now(), 5) - INTERVAL 14 DAY AND fuel_type = 'WIND' GROUP BY day ORDER BY day LIMIT 500" \
  7

# Q11: "What's the weather across Ontario?" → No ClickHouse table (uses weather API)
run_test "Q11: What's the weather across Ontario?" \
  "SELECT 1" \
  1 "weather uses external API, not ClickHouse — always passes"

# Q12: "What is the DA vs realtime price spread?" → DA vs RT spread (Pattern 9)
run_test "Q12: What is the DA vs realtime price spread?" \
  "SELECT da.zone, da.delivery_hour, round(da.zonal_price, 2) AS da_price FROM ieso.v_da_ozp da WHERE da.delivery_date = toDate(subtractHours(now(), 5)) LIMIT 20" \
  9

echo ""
echo "Results: $PASS passed, $FAIL failed, $WARN warnings"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
