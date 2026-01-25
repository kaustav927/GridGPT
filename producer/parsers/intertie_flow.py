"""
Parser for IESO Intertie Schedule and Flow XML report.
URL: https://reports-public.ieso.ca/public/IntertieScheduleFlow/PUB_IntertieScheduleFlow.xml

Note: Uses theIMO.com namespace. Has hourly schedules (Import/Export) and 5-min actuals (Flow).
Positive flow = import into Ontario, Negative = export from Ontario.
"""

import logging
from datetime import datetime
from typing import TypedDict

import httpx
from lxml import etree

from config import settings

logger = logging.getLogger(__name__)

REPORT_URL = f"{settings.ieso_base_url}/IntertieScheduleFlow/PUB_IntertieScheduleFlow.xml"

# IESO/IMO XML namespace
NS = {"imo": "http://www.theIMO.com/schema"}


class IntertieFlowRecord(TypedDict):
    """Schema for intertie flow records."""
    timestamp: str
    intertie: str
    scheduled_mw: float
    actual_mw: float


async def fetch_intertie_flow() -> list[IntertieFlowRecord]:
    """
    Fetch and parse the intertie schedule and flow report.
    
    Returns a list of intertie flow records with scheduled and actual values.
    Net scheduled = Import - Export (positive = net import)
    """
    records: list[IntertieFlowRecord] = []
    
    async with httpx.AsyncClient(timeout=settings.http_timeout) as client:
        response = await client.get(REPORT_URL)
        response.raise_for_status()
        
        # Parse XML
        root = etree.fromstring(response.content)
        
        # Get date from IMODocBody
        doc_body = root.find(".//imo:IMODocBody", NS)
        if doc_body is None:
            logger.error("IMODocBody not found in XML")
            return records
        
        date_str = doc_body.findtext("imo:Date", namespaces=NS)
        if not date_str:
            logger.error("Date not found in XML")
            return records
        
        try:
            base_date = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError as e:
            logger.error(f"Failed to parse date: {e}")
            return records
        
        # Find all IntertieZones
        for zone in root.findall(".//imo:IntertieZone", NS):
            zone_name = zone.findtext("imo:IntertieZoneName", namespaces=NS)
            if not zone_name:
                continue
            
            # Build schedule dictionary (hourly net: import - export)
            schedules_by_hour: dict[int, float] = {}
            for schedule in zone.findall(".//imo:Schedule", NS):
                hour = schedule.findtext("imo:Hour", namespaces=NS)
                import_mw = schedule.findtext("imo:Import", namespaces=NS)
                export_mw = schedule.findtext("imo:Export", namespaces=NS)
                
                if hour:
                    try:
                        h = int(hour)
                        imp = float(import_mw) if import_mw else 0.0
                        exp = float(export_mw) if export_mw else 0.0
                        schedules_by_hour[h] = imp - exp  # Net scheduled
                    except ValueError:
                        pass
            
            # Build actuals dictionary (5-min intervals)
            # Key = (hour, interval), value = flow
            actuals: dict[tuple[int, int], float] = {}
            for actual in zone.findall(".//imo:Actual", NS):
                hour = actual.findtext("imo:Hour", namespaces=NS)
                interval = actual.findtext("imo:Interval", namespaces=NS)
                flow = actual.findtext("imo:Flow", namespaces=NS)
                
                if hour and interval and flow:
                    try:
                        actuals[(int(hour), int(interval))] = float(flow)
                    except ValueError:
                        pass
            
            # Create records - one per 5-min interval with actual data
            for (hour, interval), actual_flow in sorted(actuals.items()):
                try:
                    # IESO uses 1-24 hours, convert to 0-23
                    # Interval 1 = :00, Interval 2 = :05, etc.
                    minute = (interval - 1) * 5
                    timestamp = base_date.replace(hour=hour - 1, minute=minute, second=0, microsecond=0)
                    
                    record: IntertieFlowRecord = {
                        "timestamp": timestamp.isoformat(),
                        "intertie": zone_name,
                        "scheduled_mw": schedules_by_hour.get(hour, 0.0),
                        "actual_mw": actual_flow,
                    }
                    records.append(record)
                except ValueError as e:
                    logger.warning(f"Failed to create record for {zone_name}: {e}")
    
    logger.info(f"Parsed {len(records)} intertie flow records")
    return records
