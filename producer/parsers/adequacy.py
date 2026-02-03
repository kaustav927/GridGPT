"""
Parser for IESO Adequacy3 XML report (demand and supply forecast).
URL: https://reports-public.ieso.ca/public/Adequacy3/PUB_Adequacy3_YYYYMMDD.xml

Fetches BOTH today's and tomorrow's Adequacy3 reports which contain:
- ForecastOntDemand: Hourly Ontario demand forecast
- Energies: Hourly scheduled energy (supply forecast)

Today's report is available throughout the day.
Tomorrow's report becomes available after ~13:00 ET when DAM runs.
"""

import asyncio
import logging
from datetime import timedelta
from typing import TypedDict

import httpx
from lxml import etree

from config import settings
from utils.timezone import now_eastern

logger = logging.getLogger(__name__)

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 5

# IESO XML namespace
NS = {"ieso": "http://www.ieso.ca/schema"}


class AdequacyRecord(TypedDict):
    """Schema for adequacy (demand and supply forecast) records."""
    timestamp: str
    delivery_date: str
    delivery_hour: int
    forecast_demand_mw: float
    forecast_supply_mw: float


async def _fetch_single_adequacy_report(date_compact: str, now) -> list[AdequacyRecord]:
    """
    Fetch and parse a single dated Adequacy3 report.

    Args:
        date_compact: Date in YYYYMMDD format
        now: Current datetime in Eastern timezone

    Returns:
        List of AdequacyRecord for each hour in the report
    """
    records: list[AdequacyRecord] = []
    date_str = f"{date_compact[:4]}-{date_compact[4:6]}-{date_compact[6:]}"
    report_url = f"{settings.ieso_base_url}/Adequacy3/PUB_Adequacy3_{date_compact}.xml"

    logger.info(f"Fetching Adequacy3 report for {date_str} from {report_url}")

    # Retry loop with exponential backoff
    root = None
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(
                timeout=settings.http_timeout,
                headers={"Cache-Control": "no-cache", "Pragma": "no-cache"}
            ) as client:
                response = await client.get(report_url)

                if response.status_code == 404:
                    logger.debug(f"Adequacy3 report for {date_str} not available (404)")
                    return records

                response.raise_for_status()

                # Success - parse the response
                root = etree.fromstring(response.content)
                logger.info(f"Successfully fetched Adequacy3 report for {date_str}")
                break

        except httpx.TimeoutException as e:
            last_error = e
            logger.warning(f"Timeout fetching Adequacy3 for {date_str} (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAY_SECONDS * (attempt + 1))
            continue
        except httpx.HTTPError as e:
            last_error = e
            logger.warning(f"HTTP error fetching Adequacy3 for {date_str} (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAY_SECONDS * (attempt + 1))
            continue
        except Exception as e:
            last_error = e
            logger.error(f"Unexpected error fetching Adequacy3 for {date_str}: {e}")
            return records

    if root is None:
        logger.error(f"Failed to fetch Adequacy3 for {date_str} after {MAX_RETRIES} attempts: {last_error}")
        return records

    # Get delivery date from DocBody (top-level, not nested in sections)
    doc_body = root.find(".//ieso:DocBody", NS)
    if doc_body is None:
        logger.error(f"DocBody not found in Adequacy3 XML for {date_str}")
        return records

    delivery_date = doc_body.findtext("ieso:DeliveryDate", namespaces=NS)
    if not delivery_date:
        logger.error(f"DeliveryDate not found in DocBody for {date_str}")
        return records

    # Parse demand from ForecastOntDemand/Demand
    demand_by_hour: dict[int, float] = {}
    demand_elements = root.findall(".//ieso:ForecastOntDemand/ieso:Demand", NS)
    logger.debug(f"Found {len(demand_elements)} demand elements for {date_str}")

    for demand in demand_elements:
        hour_str = demand.findtext("ieso:DeliveryHour", namespaces=NS)
        energy_str = demand.findtext("ieso:EnergyMW", namespaces=NS)

        if hour_str and energy_str:
            try:
                demand_by_hour[int(hour_str)] = float(energy_str)
            except (ValueError, TypeError) as e:
                logger.warning(f"Failed to parse demand for {date_str}: {e}")

    # Parse supply from Energies/Energy (scheduled energy = supply forecast)
    supply_by_hour: dict[int, float] = {}
    supply_elements = root.findall(".//ieso:Energies/ieso:Energy", NS)
    logger.debug(f"Found {len(supply_elements)} supply elements for {date_str}")

    for energy in supply_elements:
        hour_str = energy.findtext("ieso:DeliveryHour", namespaces=NS)
        energy_str = energy.findtext("ieso:EnergyMWhr", namespaces=NS)

        if hour_str and energy_str:
            try:
                supply_by_hour[int(hour_str)] = float(energy_str)
            except (ValueError, TypeError) as e:
                logger.warning(f"Failed to parse supply for {date_str}: {e}")

    # Combine demand and supply into records
    all_hours = set(demand_by_hour.keys()) | set(supply_by_hour.keys())
    timestamp_str = now.strftime("%Y-%m-%dT%H:%M:%S")  # ClickHouse-compatible format
    for hour in sorted(all_hours):
        record: AdequacyRecord = {
            "timestamp": timestamp_str,
            "delivery_date": delivery_date,
            "delivery_hour": hour,
            "forecast_demand_mw": demand_by_hour.get(hour, 0.0),
            "forecast_supply_mw": supply_by_hour.get(hour, 0.0),
        }
        records.append(record)

    if records:
        peak = max(records, key=lambda r: r['forecast_demand_mw'])
        logger.info(f"Parsed {len(records)} records for {date_str}, peak: {peak['forecast_demand_mw']:.0f} MW @ hour {peak['delivery_hour']}")

    return records


async def fetch_adequacy() -> list[AdequacyRecord]:
    """
    Fetch and parse BOTH today's and tomorrow's Adequacy3 reports.

    Returns hourly demand and supply forecast records for:
    - Today: Always fetched (available throughout the day)
    - Tomorrow: Fetched after 13:00 ET when DAM engine publishes forecasts

    Includes retry logic with exponential backoff for transient failures.
    """
    records: list[AdequacyRecord] = []

    # Use Eastern timezone (IESO's timezone) to get correct dates
    now = now_eastern()
    current_hour = now.hour

    # Always fetch today's report (available throughout the day)
    today = now.strftime("%Y%m%d")
    today_records = await _fetch_single_adequacy_report(today, now)
    records.extend(today_records)
    logger.info(f"Fetched {len(today_records)} records for today ({today})")

    # After 13:00 ET, tomorrow's report becomes available
    if current_hour >= 13:
        tomorrow = (now + timedelta(days=1)).strftime("%Y%m%d")
        tomorrow_records = await _fetch_single_adequacy_report(tomorrow, now)
        records.extend(tomorrow_records)
        logger.info(f"Fetched {len(tomorrow_records)} records for tomorrow ({tomorrow})")
    else:
        logger.debug(f"Tomorrow's forecast not yet available (current hour: {current_hour}, available after 13:00 ET)")

    # Summary logging
    if records:
        dates = set(r['delivery_date'] for r in records)
        logger.info(f"Adequacy data fetched for dates: {dates}")
        logger.info(f"Published {len(records)} adequacy (demand forecast) records")

    return records
