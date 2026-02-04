"""
Parser for IESO Day-Ahead Hourly Virtual Zonal Energy Price Report.
URL: https://reports-public.ieso.ca/public/DAHourlyZonal/PUB_DAHourlyZonal.xml

Published daily around 13:30 ET with next-day hourly prices per zone.
This report contains per-zone prices (EAST, ESSA, NIAGARA, etc.) unlike
the DAHourlyOntarioZonalPrice report which only has province-wide average.

Zone names in XML have :HUB suffix (e.g., "EAST:HUB") which we strip
to match our standard zone naming convention.
"""

import asyncio
import logging
from typing import TypedDict

import httpx
from lxml import etree

from config import settings
from utils.timezone import now_eastern

logger = logging.getLogger(__name__)

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 5

REPORT_URL = f"{settings.ieso_base_url}/DAHourlyZonal/PUB_DAHourlyZonal.xml"

# IESO XML namespace
NS = {"ieso": "http://www.ieso.ca/schema"}


class DaZonalRecord(TypedDict):
    """Schema for day-ahead zonal price records."""
    timestamp: str
    delivery_date: str
    delivery_hour: int
    zone: str
    zonal_price: float


async def fetch_da_hourly_zonal() -> list[DaZonalRecord]:
    """
    Fetch and parse the Day-Ahead Hourly Virtual Zonal Energy Price report.

    Returns hourly price forecasts for each zone for the next delivery day.
    Zones: EAST, ESSA, NIAGARA, NORTHEAST, NORTHWEST, OTTAWA, SOUTHWEST, TORONTO, WEST

    Includes retry logic with exponential backoff for transient failures.
    """
    records: list[DaZonalRecord] = []

    # Use Eastern timezone (IESO's timezone) for timestamp
    now = now_eastern()

    logger.debug(f"Fetching DA Hourly Zonal report from {REPORT_URL}")

    # Retry loop with exponential backoff
    last_error = None
    root = None
    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(
                timeout=settings.http_timeout,
                headers={"Cache-Control": "no-cache", "Pragma": "no-cache"}
            ) as client:
                response = await client.get(REPORT_URL)
                response.raise_for_status()

                root = etree.fromstring(response.content)
                logger.debug("Successfully fetched DA Hourly Zonal report")
                break

        except httpx.TimeoutException as e:
            last_error = e
            logger.warning(f"Timeout fetching DA Hourly Zonal (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAY_SECONDS * (attempt + 1))
            continue
        except httpx.HTTPError as e:
            last_error = e
            logger.warning(f"HTTP error fetching DA Hourly Zonal (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAY_SECONDS * (attempt + 1))
            continue
        except Exception as e:
            last_error = e
            logger.error(f"Unexpected error fetching DA Hourly Zonal: {e}")
            return records
    else:
        # All retries exhausted
        logger.error(f"Failed to fetch DA Hourly Zonal after {MAX_RETRIES} attempts: {last_error}")
        return records

    if root is None:
        return records

    # Get delivery date from DocBody
    doc_body = root.find(".//ieso:DocBody", NS)
    if doc_body is None:
        logger.error("DocBody not found in DA Hourly Zonal XML")
        return records

    date_str = doc_body.findtext("ieso:DeliveryDate", namespaces=NS)
    if not date_str:
        logger.error("DeliveryDate not found in DA Hourly Zonal XML")
        return records

    # Log the delivery date to help debug data freshness issues
    logger.info(f"DA Hourly Zonal report contains data for delivery date: {date_str}")

    # Find all TransactionZone elements
    for transaction_zone in root.findall(".//ieso:TransactionZone", NS):
        zone_name_el = transaction_zone.find("ieso:ZoneName", NS)
        if zone_name_el is None or not zone_name_el.text:
            continue

        # Strip :HUB suffix to match standard zone names
        zone_name = zone_name_el.text.replace(":HUB", "")

        # Find the "Zonal Price" component (skip Energy Loss Price and Energy Congestion Price)
        for components in transaction_zone.findall("ieso:Components", NS):
            price_component = components.findtext("ieso:PriceComponent", namespaces=NS)
            if price_component != "Zonal Price":
                continue

            # Parse each hour's price
            for delivery_hour in components.findall("ieso:DeliveryHour", NS):
                hour_str = delivery_hour.findtext("ieso:Hour", namespaces=NS)
                price_str = delivery_hour.findtext("ieso:LMP", namespaces=NS)

                if not hour_str or not price_str:
                    continue

                try:
                    hour = int(hour_str)
                    price = float(price_str)

                    record: DaZonalRecord = {
                        "timestamp": now.strftime("%Y-%m-%dT%H:%M:%S"),
                        "delivery_date": date_str,
                        "delivery_hour": hour,
                        "zone": zone_name,
                        "zonal_price": price,
                    }
                    records.append(record)
                except (ValueError, TypeError) as e:
                    logger.warning(f"Failed to parse DA zonal price for {zone_name} hour {hour_str}: {e}")

    zones_parsed = len(set(r["zone"] for r in records))
    logger.info(f"Parsed {len(records)} day-ahead zonal price records across {zones_parsed} zones")
    return records
