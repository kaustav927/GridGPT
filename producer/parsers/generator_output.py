"""
Parser for IESO Generator Output Capability XML report.
URL: https://reports-public.ieso.ca/public/GenOutputCapability/PUB_GenOutputCapability.xml

Note: This report uses a different namespace (theIMO.com) and provides hourly data.
"""

import logging
from datetime import datetime
from typing import TypedDict

import httpx
from lxml import etree

from config import settings

logger = logging.getLogger(__name__)

REPORT_URL = f"{settings.ieso_base_url}/GenOutputCapability/PUB_GenOutputCapability.xml"

# IESO/IMO XML namespace (different from other reports!)
NS = {"imo": "http://www.theIMO.com/schema"}


class GeneratorOutputRecord(TypedDict):
    """Schema for generator output records."""
    timestamp: str
    generator: str
    fuel_type: str
    output_mw: float
    capability_mw: float


async def fetch_generator_output() -> list[GeneratorOutputRecord]:
    """
    Fetch and parse the generator output capability report.
    
    Returns a list of generator records with output and capability per hour.
    """
    records: list[GeneratorOutputRecord] = []
    
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
        
        # Find all Generators
        for gen in root.findall(".//imo:Generator", NS):
            gen_name = gen.findtext("imo:GeneratorName", namespaces=NS)
            fuel_type = gen.findtext("imo:FuelType", namespaces=NS)
            
            if not gen_name:
                continue
            
            # Build dictionaries of output and capability by hour
            outputs_by_hour: dict[int, float] = {}
            capabilities_by_hour: dict[int, float] = {}
            
            # Parse Outputs
            for output in gen.findall(".//imo:Output", NS):
                hour = output.findtext("imo:Hour", namespaces=NS)
                energy = output.findtext("imo:EnergyMW", namespaces=NS)
                if hour and energy:
                    try:
                        outputs_by_hour[int(hour)] = float(energy)
                    except ValueError:
                        pass
            
            # Parse Capabilities
            for cap in gen.findall(".//imo:Capability", NS):
                hour = cap.findtext("imo:Hour", namespaces=NS)
                energy = cap.findtext("imo:EnergyMW", namespaces=NS)
                if hour and energy:
                    try:
                        capabilities_by_hour[int(hour)] = float(energy)
                    except ValueError:
                        pass
            
            # Create records for each hour that has data
            all_hours = set(outputs_by_hour.keys()) | set(capabilities_by_hour.keys())
            for hour in sorted(all_hours):
                try:
                    # IESO uses 1-24 hours, convert to 0-23
                    timestamp = base_date.replace(hour=hour - 1, minute=0, second=0, microsecond=0)
                    
                    record: GeneratorOutputRecord = {
                        "timestamp": timestamp.isoformat(),
                        "generator": gen_name,
                        "fuel_type": fuel_type or "OTHER",
                        "output_mw": outputs_by_hour.get(hour, 0.0),
                        "capability_mw": capabilities_by_hour.get(hour, 0.0),
                    }
                    records.append(record)
                except ValueError as e:
                    logger.warning(f"Failed to create record for {gen_name} hour {hour}: {e}")
    
    logger.info(f"Parsed {len(records)} generator output records")
    return records
