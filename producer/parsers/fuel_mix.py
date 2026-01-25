"""
Parser for IESO Generator Output by Fuel Type Hourly XML report.
URL: https://reports-public.ieso.ca/public/GenOutputbyFuelHourly/PUB_GenOutputbyFuelHourly.xml
"""

import logging
from datetime import datetime
from typing import TypedDict

import httpx
from lxml import etree

from config import settings

logger = logging.getLogger(__name__)

REPORT_URL = f"{settings.ieso_base_url}/GenOutputbyFuelHourly/PUB_GenOutputbyFuelHourly.xml"

# IESO XML namespace
NS = {"ieso": "http://www.ieso.ca/schema"}


class FuelMixRecord(TypedDict):
    """Schema for fuel mix records."""
    timestamp: str
    fuel_type: str
    output_mw: float


async def fetch_fuel_mix() -> list[FuelMixRecord]:
    """
    Fetch and parse the fuel mix report.
    
    Returns a list of fuel type output records.
    """
    records: list[FuelMixRecord] = []
    
    async with httpx.AsyncClient(timeout=settings.http_timeout) as client:
        response = await client.get(REPORT_URL)
        response.raise_for_status()
        
        # Parse XML
        root = etree.fromstring(response.content)
        
        # Find all DailyData sections
        for daily in root.findall(".//ieso:DailyData", NS):
            day_str = daily.findtext("ieso:Day", namespaces=NS)
            if not day_str:
                continue
            
            try:
                base_date = datetime.strptime(day_str, "%Y-%m-%d")
            except ValueError as e:
                logger.warning(f"Failed to parse day: {e}")
                continue
            
            # Find all HourlyData within this day
            for hourly in daily.findall("ieso:HourlyData", NS):
                hour_str = hourly.findtext("ieso:Hour", namespaces=NS)
                if not hour_str:
                    continue
                
                try:
                    hour = int(hour_str)
                    # IESO uses 1-24, convert to 0-23
                    timestamp = base_date.replace(hour=hour - 1, minute=0, second=0, microsecond=0)
                except ValueError:
                    continue
                
                # Find all FuelTotal entries
                for fuel_total in hourly.findall("ieso:FuelTotal", NS):
                    fuel_type = fuel_total.findtext("ieso:Fuel", namespaces=NS)
                    energy_value = fuel_total.find("ieso:EnergyValue", NS)
                    
                    if fuel_type and energy_value is not None:
                        output = energy_value.findtext("ieso:Output", namespaces=NS)
                        if output:
                            try:
                                record: FuelMixRecord = {
                                    "timestamp": timestamp.isoformat(),
                                    "fuel_type": fuel_type,
                                    "output_mw": float(output),
                                }
                                records.append(record)
                            except ValueError as e:
                                logger.warning(f"Failed to parse output for {fuel_type}: {e}")
    
    logger.info(f"Parsed {len(records)} fuel mix records")
    return records
