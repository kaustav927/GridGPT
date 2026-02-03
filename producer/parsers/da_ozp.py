"""
Parser for IESO Day-Ahead Hourly Ontario Zonal Price XML report.
URL: https://reports-public.ieso.ca/public/DAHourlyOntarioZonalPrice/PUB_DAHourlyOntarioZonalPrice.xml

Published daily around 13:30 with next-day hourly Ontario-wide prices.
Note: Despite the name, this report only contains Ontario-wide average prices,
not zone-specific prices.
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

REPORT_URL = f"{settings.ieso_base_url}/DAHourlyOntarioZonalPrice/PUB_DAHourlyOntarioZonalPrice.xml"

# IESO XML namespace
NS = {"ieso": "http://www.ieso.ca/schema"}


class DaOzpRecord(TypedDict):
    """Schema for day-ahead Ontario zonal price records."""
    timestamp: str
    delivery_date: str
    delivery_hour: int
    zone: str
    zonal_price: float


async def fetch_da_ozp() -> list[DaOzpRecord]:
    """
    Fetch and parse the Day-Ahead Hourly Ontario Zonal Price report.

    Returns hourly price forecasts for the next delivery day.
    Note: This returns Ontario-wide average prices (zone="ONTARIO").

    Includes retry logic with exponential backoff for transient failures.
    """
    records: list[DaOzpRecord] = []

    # Use Eastern timezone (IESO's timezone) for timestamp
    now = now_eastern()
    current_hour = now.hour

    logger.debug(f"Fetching DA OZP report from {REPORT_URL}")

    # Retry loop with exponential backoff
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(
                timeout=settings.http_timeout,
                headers={"Cache-Control": "no-cache", "Pragma": "no-cache"}
            ) as client:
                response = await client.get(REPORT_URL)
                response.raise_for_status()

                root = etree.fromstring(response.content)
                logger.debug("Successfully fetched DA OZP report")
                break

        except httpx.TimeoutException as e:
            last_error = e
            logger.warning(f"Timeout fetching DA OZP (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAY_SECONDS * (attempt + 1))
            continue
        except httpx.HTTPError as e:
            last_error = e
            logger.warning(f"HTTP error fetching DA OZP (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAY_SECONDS * (attempt + 1))
            continue
        except Exception as e:
            last_error = e
            logger.error(f"Unexpected error fetching DA OZP: {e}")
            return records
    else:
        # All retries exhausted
        logger.error(f"Failed to fetch DA OZP after {MAX_RETRIES} attempts: {last_error}")
        return records

    # Get delivery date from DocBody
    doc_body = root.find(".//ieso:DocBody", NS)
    if doc_body is None:
        logger.error("DocBody not found in DA OZP XML")
        return records

    date_str = doc_body.findtext("ieso:DeliveryDate", namespaces=NS)
    if not date_str:
        logger.error("DeliveryDate not found in DA OZP XML")
        return records

    # Log the delivery date to help debug data freshness issues
    logger.info(f"DA OZP report contains data for delivery date: {date_str}")

    # Find all HourlyPriceComponents - each one contains a single hour's data
    for price_component in root.findall(".//ieso:HourlyPriceComponents", NS):
        # Get the pricing hour (this report uses PricingHour, not DeliveryHour)
        hour_str = price_component.findtext("ieso:PricingHour", namespaces=NS)
        # Get the zonal price (direct child, not nested)
        price_str = price_component.findtext("ieso:ZonalPrice", namespaces=NS)

        if not hour_str or not price_str:
            continue

        try:
            hour = int(hour_str)
            price = float(price_str)

            record: DaOzpRecord = {
                "timestamp": now.strftime("%Y-%m-%dT%H:%M:%S"),
                "delivery_date": date_str,
                "delivery_hour": hour,
                "zone": "ONTARIO",  # This report only has Ontario-wide prices
                "zonal_price": price,
            }
            records.append(record)
        except (ValueError, TypeError) as e:
            logger.warning(f"Failed to parse DA zonal price for hour {hour_str}: {e}")

    logger.info(f"Parsed {len(records)} day-ahead zonal price records")
    return records
