#!/usr/bin/env python
"""
Backfill script to fetch historical RealtimeTotals data from IESO hourly archives.

IESO keeps hourly archives at:
  https://reports-public.ieso.ca/public/RealtimeTotals/PUB_RealtimeTotals_YYYYMMDDHH.xml

This script fetches all available archives for a given date and publishes
the demand and supply data to Kafka, filling in any gaps from when the
producer wasn't running.

Usage:
  python backfill_realtime_totals.py              # Backfill today
  python backfill_realtime_totals.py 2026-01-26   # Backfill specific date
"""

import asyncio
import logging
import sys
from datetime import datetime
from typing import TypedDict

import httpx
from lxml import etree

from config import settings
from producers.kafka_producer import KafkaProducerClient

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

BASE_URL = settings.ieso_base_url
NS = {"ieso": "http://www.ieso.ca/schema"}


class DemandRecord(TypedDict):
    timestamp: str
    zone: str
    demand_mw: float


class SupplyRecord(TypedDict):
    timestamp: str
    fuel_type: str
    output_mw: float


async def fetch_hourly_archive(client: httpx.AsyncClient, date: str, hour: int) -> tuple[list[DemandRecord], list[SupplyRecord]]:
    """Fetch and parse a single hourly archive."""
    demand_records: list[DemandRecord] = []
    supply_records: list[SupplyRecord] = []

    # Format: PUB_RealtimeTotals_YYYYMMDDHH.xml
    filename = f"PUB_RealtimeTotals_{date}{hour:02d}.xml"
    url = f"{BASE_URL}/RealtimeTotals/{filename}"

    try:
        response = await client.get(url)
        if response.status_code == 404:
            return demand_records, supply_records
        response.raise_for_status()

        root = etree.fromstring(response.content)
        doc_body = root.find(".//ieso:DocBody", NS)
        if doc_body is None:
            return demand_records, supply_records

        date_str = doc_body.findtext("ieso:DeliveryDate", namespaces=NS)
        hour_str = doc_body.findtext("ieso:DeliveryHour", namespaces=NS)

        if not date_str or not hour_str:
            return demand_records, supply_records

        base_date = datetime.strptime(date_str, "%Y-%m-%d")
        hour_int = int(hour_str) - 1  # IESO uses 1-24

        for interval_energy in doc_body.findall(".//ieso:IntervalEnergy", NS):
            interval_num = interval_energy.findtext("ieso:Interval", namespaces=NS)
            if not interval_num:
                continue

            minute = (int(interval_num) - 1) * 5
            timestamp = base_date.replace(hour=hour_int, minute=minute, second=0, microsecond=0)
            ts_str = timestamp.isoformat()

            for mq in interval_energy.findall("ieso:MQ", NS):
                market_qty = mq.findtext("ieso:MarketQuantity", namespaces=NS)
                energy_mw = mq.findtext("ieso:EnergyMW", namespaces=NS)

                if not energy_mw:
                    continue

                try:
                    mw_value = float(energy_mw)
                except (ValueError, TypeError):
                    continue

                if market_qty == "ONTARIO DEMAND":
                    demand_records.append({
                        "timestamp": ts_str,
                        "zone": "ONTARIO",
                        "demand_mw": mw_value,
                    })
                elif market_qty == "Total Energy":
                    supply_records.append({
                        "timestamp": ts_str,
                        "fuel_type": "REALTIME_TOTAL",
                        "output_mw": mw_value,
                    })

        logger.info(f"  Hour {hour:02d}: {len(demand_records)} demand, {len(supply_records)} supply records")

    except httpx.HTTPError as e:
        logger.warning(f"  Hour {hour:02d}: HTTP error - {e}")
    except Exception as e:
        logger.warning(f"  Hour {hour:02d}: Parse error - {e}")

    return demand_records, supply_records


async def backfill_date(date_str: str) -> None:
    """Backfill all available hourly archives for a given date."""
    # Parse date to get YYYYMMDD format
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        date_compact = date_obj.strftime("%Y%m%d")
    except ValueError:
        logger.error(f"Invalid date format: {date_str}. Use YYYY-MM-DD")
        return

    logger.info(f"Backfilling RealtimeTotals for {date_str}...")

    all_demand: list[DemandRecord] = []
    all_supply: list[SupplyRecord] = []

    async with httpx.AsyncClient(timeout=30) as client:
        # Fetch all 24 hours (some may not exist yet)
        for hour in range(1, 25):  # IESO uses 1-24
            demand, supply = await fetch_hourly_archive(client, date_compact, hour)
            all_demand.extend(demand)
            all_supply.extend(supply)

    if not all_demand and not all_supply:
        logger.warning("No data found for backfill!")
        return

    logger.info(f"Total: {len(all_demand)} demand, {len(all_supply)} supply records")

    # Publish to Kafka
    logger.info("Publishing to Kafka...")
    producer = KafkaProducerClient(bootstrap_servers=settings.kafka_broker)

    if all_demand:
        await producer.publish_batch("ieso.realtime.zonal-demand", all_demand)
        logger.info(f"Published {len(all_demand)} demand records")

    if all_supply:
        await producer.publish_batch("ieso.hourly.fuel-mix", all_supply)
        logger.info(f"Published {len(all_supply)} supply records")

    logger.info("Backfill complete!")


async def main():
    # Default to today if no date specified
    if len(sys.argv) > 1:
        date_str = sys.argv[1]
    else:
        date_str = datetime.now().strftime("%Y-%m-%d")

    await backfill_date(date_str)


if __name__ == "__main__":
    asyncio.run(main())
