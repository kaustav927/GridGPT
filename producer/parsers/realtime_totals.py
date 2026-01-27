"""
Parser for IESO Realtime Totals XML report.
URL: https://reports-public.ieso.ca/public/RealtimeTotals/PUB_RealtimeTotals.xml

Provides real-time Ontario-wide demand AND supply data updated every 5 minutes.
This replaces the stale CSV-based zonal demand data source.
"""

import logging
from datetime import datetime
from typing import TypedDict

import httpx
from lxml import etree

from config import settings

logger = logging.getLogger(__name__)

REPORT_URL = f"{settings.ieso_base_url}/RealtimeTotals/PUB_RealtimeTotals.xml"

# IESO XML namespace
NS = {"ieso": "http://www.ieso.ca/schema"}


class RealtimeDemandRecord(TypedDict):
    """Schema for realtime demand records."""
    timestamp: str
    zone: str  # Always "ONTARIO" for this report
    demand_mw: float


class RealtimeSupplyRecord(TypedDict):
    """Schema for realtime supply records (for fuel_mix table)."""
    timestamp: str
    fuel_type: str  # "REALTIME_TOTAL" for realtime supply
    output_mw: float


async def fetch_realtime_totals() -> tuple[list[RealtimeDemandRecord], list[RealtimeSupplyRecord]]:
    """
    Fetch and parse the realtime totals report.

    Returns:
        - Demand records: Ontario-wide demand with 5-minute granularity
        - Supply records: Total energy generation with 5-minute granularity

    This provides real-time data updated every 5 minutes.
    """
    demand_records: list[RealtimeDemandRecord] = []
    supply_records: list[RealtimeSupplyRecord] = []

    async with httpx.AsyncClient(timeout=settings.http_timeout) as client:
        response = await client.get(REPORT_URL)
        response.raise_for_status()

        # Parse XML
        root = etree.fromstring(response.content)

        # Get delivery date and hour from DocBody
        doc_body = root.find(".//ieso:DocBody", NS)
        if doc_body is None:
            logger.error("DocBody not found in XML")
            return demand_records, supply_records

        date_str = doc_body.findtext("ieso:DeliveryDate", namespaces=NS)
        hour = doc_body.findtext("ieso:DeliveryHour", namespaces=NS)

        if not date_str or not hour:
            logger.error(f"Missing date ({date_str}) or hour ({hour})")
            return demand_records, supply_records

        try:
            base_date = datetime.strptime(date_str, "%Y-%m-%d")
            hour_int = int(hour) - 1  # IESO uses 1-24, convert to 0-23
        except ValueError as e:
            logger.error(f"Failed to parse date/hour: {e}")
            return demand_records, supply_records

        # Process each interval
        for interval_energy in doc_body.findall(".//ieso:IntervalEnergy", NS):
            interval_num = interval_energy.findtext("ieso:Interval", namespaces=NS)
            if not interval_num:
                continue

            try:
                # Calculate timestamp: each interval is 5 minutes
                minute = (int(interval_num) - 1) * 5
                timestamp = base_date.replace(
                    hour=hour_int, minute=minute, second=0, microsecond=0
                )
                ts_str = timestamp.isoformat()
            except (ValueError, TypeError) as e:
                logger.warning(f"Failed to parse interval {interval_num}: {e}")
                continue

            # Extract all MQ values for this interval
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
                    # Total Energy = total generation (supply)
                    supply_records.append({
                        "timestamp": ts_str,
                        "fuel_type": "REALTIME_TOTAL",
                        "output_mw": mw_value,
                    })

    logger.info(f"Parsed {len(demand_records)} demand, {len(supply_records)} supply records")
    return demand_records, supply_records
