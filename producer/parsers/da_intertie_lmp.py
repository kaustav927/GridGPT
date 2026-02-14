"""
Parser for IESO Day-Ahead Hourly Intertie LMP XML report.
URL: https://reports-public.ieso.ca/public/DAHourlyIntertieLMP/PUB_DAHourlyIntertieLMP.xml

Extracts the "Intertie LMP" component from each intertie point for all 24
delivery hours. Maps individual IESO intertie names to zone groups (QUEBEC,
NEW-YORK, MICHIGAN, MINNESOTA, MANITOBA).
"""

import logging
from datetime import datetime
from typing import TypedDict

import httpx
from lxml import etree

from config import settings
from parsers.realtime_intertie_lmp import _map_zone

logger = logging.getLogger(__name__)

REPORT_URL = f"{settings.ieso_base_url}/DAHourlyIntertieLMP/PUB_DAHourlyIntertieLMP.xml"

NS = {"ieso": "http://www.ieso.ca/schema"}


class DaIntertieLmpRecord(TypedDict):
    timestamp: str
    delivery_date: str
    delivery_hour: int
    intertie_zone: str
    lmp: float


async def fetch_da_intertie_lmp() -> list[DaIntertieLmpRecord]:
    """
    Fetch and parse the day-ahead hourly intertie LMP report.

    Returns a list of records with timestamp (report creation time),
    delivery_date, delivery_hour, intertie_zone, and lmp.
    Only extracts the "Intertie LMP" component.
    """
    records: list[DaIntertieLmpRecord] = []

    async with httpx.AsyncClient(timeout=settings.http_timeout) as client:
        response = await client.get(REPORT_URL)
        response.raise_for_status()

        root = etree.fromstring(response.content)

        # Get report creation time from DocHeader
        created_at = root.findtext(".//ieso:DocHeader/ieso:CreatedAt", namespaces=NS)
        if created_at:
            try:
                report_ts = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                ts_str = report_ts.strftime("%Y-%m-%dT%H:%M:%S")
            except ValueError:
                ts_str = datetime.utcnow().isoformat()
        else:
            ts_str = datetime.utcnow().isoformat()

        doc_body = root.find(".//ieso:DocBody", NS)
        if doc_body is None:
            logger.error("DocBody not found in DAHourlyIntertieLMP XML")
            return records

        date_str = doc_body.findtext("ieso:DeliveryDate", namespaces=NS)
        if not date_str:
            logger.error("Missing DeliveryDate in DAHourlyIntertieLMP")
            return records

        for intertie_el in root.findall(".//ieso:IntertieLMPrice", NS):
            pl_name = intertie_el.findtext("ieso:IntertiePLName", namespaces=NS)
            if not pl_name:
                continue

            zone = _map_zone(pl_name)

            # Find the "Intertie LMP" component
            for component in intertie_el.findall("ieso:Components", NS):
                comp_name = component.findtext("ieso:LMPComponent", namespaces=NS)
                if comp_name != "Intertie LMP":
                    continue

                for hourly_el in component.findall("ieso:HourlyLMP", NS):
                    hour_str = hourly_el.findtext("ieso:DeliveryHour", namespaces=NS)
                    lmp_val = hourly_el.findtext("ieso:LMP", namespaces=NS)

                    if not hour_str or not lmp_val:
                        continue

                    try:
                        records.append({
                            "timestamp": ts_str,
                            "delivery_date": date_str,
                            "delivery_hour": int(hour_str),
                            "intertie_zone": zone,
                            "lmp": float(lmp_val),
                        })
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Failed to parse hour for {pl_name}: {e}")

    logger.info(f"Parsed {len(records)} DA intertie LMP records")
    return records
