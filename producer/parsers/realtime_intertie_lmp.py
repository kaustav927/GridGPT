"""
Parser for IESO Realtime Intertie LMP XML report.
URL: https://reports-public.ieso.ca/public/RealTimeIntertieLMP/PUB_RealTimeIntertieLMP.xml

Extracts the "Intertie LMP" component from each intertie point and maps
individual IESO intertie names to zone groups (QUEBEC, NEW-YORK, MICHIGAN,
MINNESOTA, MANITOBA).
"""

import logging
from datetime import datetime
from typing import TypedDict

import httpx
from lxml import etree

from config import settings

logger = logging.getLogger(__name__)

REPORT_URL = f"{settings.ieso_base_url}/RealTimeIntertieLMP/PUB_RealTimeIntertieLMP.xml"

NS = {"ieso": "http://www.ieso.ca/schema"}


class RealtimeIntertieLmpRecord(TypedDict):
    timestamp: str
    intertie_zone: str
    lmp: float


def _map_zone(name: str) -> str:
    """Map IESO intertie point name to flow zone group."""
    clean = name.replace(":LMP", "")
    if clean.startswith("PQ.") or "_PQ" in clean:
        return "QUEBEC"
    suffix = clean.split("_")[-1] if "_" in clean else ""
    return {
        "NYSI": "NEW-YORK",
        "MISI": "MICHIGAN",
        "MNSI": "MINNESOTA",
        "MBSK": "MANITOBA",
        "MBSI": "MANITOBA",
    }.get(suffix, clean)


async def fetch_realtime_intertie_lmp() -> list[RealtimeIntertieLmpRecord]:
    """
    Fetch and parse the realtime intertie LMP report.

    Returns a list of records with timestamp, intertie_zone, and lmp.
    Only extracts the "Intertie LMP" component (skips congestion, loss, etc.).
    """
    records: list[RealtimeIntertieLmpRecord] = []

    async with httpx.AsyncClient(timeout=settings.http_timeout) as client:
        response = await client.get(REPORT_URL)
        response.raise_for_status()

        root = etree.fromstring(response.content)

        doc_body = root.find(".//ieso:DocBody", NS)
        if doc_body is None:
            logger.error("DocBody not found in RealTimeIntertieLMP XML")
            return records

        date_str = doc_body.findtext("ieso:DeliveryDate", namespaces=NS)
        hour_str = doc_body.findtext("ieso:DeliveryHour", namespaces=NS)

        if not date_str or not hour_str:
            logger.error(f"Missing date ({date_str}) or hour ({hour_str})")
            return records

        try:
            base_date = datetime.strptime(date_str, "%Y-%m-%d")
            hour_int = int(hour_str) - 1  # IESO uses 1-24
        except ValueError as e:
            logger.error(f"Failed to parse date/hour: {e}")
            return records

        for intertie_el in root.findall(".//ieso:IntertieLMPrice", NS):
            pl_name = intertie_el.findtext("ieso:IntertiePLName", namespaces=NS)
            if not pl_name:
                continue

            zone = _map_zone(pl_name)

            # Find the "Intertie LMP" component (skip congestion, loss, etc.)
            for component in intertie_el.findall("ieso:Components", NS):
                comp_name = component.findtext("ieso:LMPComponent", namespaces=NS)
                if comp_name != "Intertie LMP":
                    continue

                for interval_el in component.findall("ieso:IntervalLMP", NS):
                    interval_num = interval_el.findtext("ieso:Interval", namespaces=NS)
                    lmp_val = interval_el.findtext("ieso:LMP", namespaces=NS)

                    if not interval_num or not lmp_val:
                        continue

                    try:
                        minute = (int(interval_num) - 1) * 5
                        timestamp = base_date.replace(
                            hour=hour_int, minute=minute, second=0, microsecond=0
                        )

                        records.append({
                            "timestamp": timestamp.isoformat(),
                            "intertie_zone": zone,
                            "lmp": float(lmp_val),
                        })
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Failed to parse interval for {pl_name}: {e}")

    logger.info(f"Parsed {len(records)} realtime intertie LMP records")
    return records
