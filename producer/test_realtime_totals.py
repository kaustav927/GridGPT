#!/usr/bin/env python
"""
Quick test script to verify the realtime_totals parser works correctly.
Run: python test_realtime_totals.py
"""

import asyncio
import sys
from parsers.realtime_totals import fetch_realtime_totals


async def main():
    print("Fetching RealtimeTotals from IESO...")
    print("-" * 60)

    try:
        demand_records, supply_records = await fetch_realtime_totals()

        if not demand_records:
            print("ERROR: No demand records returned!")
            sys.exit(1)

        print(f"SUCCESS: Parsed {len(demand_records)} demand, {len(supply_records)} supply records\n")

        print("Demand records:")
        print("-" * 60)
        for r in demand_records[:5]:
            print(f"  {r['timestamp']} | {r['zone']:8} | {r['demand_mw']:,.1f} MW")
        if len(demand_records) > 5:
            print(f"  ... and {len(demand_records) - 5} more")

        print("\nSupply records:")
        print("-" * 60)
        for r in supply_records[:5]:
            print(f"  {r['timestamp']} | {r['fuel_type']:15} | {r['output_mw']:,.1f} MW")
        if len(supply_records) > 5:
            print(f"  ... and {len(supply_records) - 5} more")

        print("-" * 60)

        # Verify data quality
        demand_values = [r['demand_mw'] for r in demand_records]
        supply_values = [r['output_mw'] for r in supply_records]

        print(f"\nData Quality Check:")
        print(f"  Demand range: {min(demand_values):,.1f} - {max(demand_values):,.1f} MW")
        print(f"  Supply range: {min(supply_values):,.1f} - {max(supply_values):,.1f} MW")
        print(f"  Supply > Demand: {supply_values[0] > demand_values[0]} (expected: True)")

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
