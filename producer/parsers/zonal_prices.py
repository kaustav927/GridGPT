"""
Parser for IESO Realtime Zonal Energy Prices XML report.
URL: https://reports-public.ieso.ca/public/RealtimeZonalEnergyPrices/PUB_RealtimeZonalEnergyPrices.xml
"""

import logging
from datetime import datetime
from typing import TypedDict

import httpx
from lxml import etree

from config import settings

logger = logging.getLogger(__name__)

REPORT_URL = f"{settings.ieso_base_url}/RealtimeZonalEnergyPrices/PUB_RealtimeZonalEnergyPrices.xml"

# IESO XML namespace
NS = {"ieso": "http://www.ieso.ca/schema"}


class ZonalPriceRecord(TypedDict):
    """Schema for zonal price records."""
    timestamp: str
    zone: str
    price: float
    energy_loss_price: float
    congestion_price: float


async def fetch_zonal_prices() -> list[ZonalPriceRecord]:
    """
    Fetch and parse the zonal energy prices report.
    
    Returns a list of price records with timestamp, zone, and prices.
    """
    records: list[ZonalPriceRecord] = []
    
    async with httpx.AsyncClient(timeout=settings.http_timeout) as client:
        response = await client.get(REPORT_URL)
        response.raise_for_status()
        
        # Parse XML
        root = etree.fromstring(response.content)
        
        # Get delivery date and hour from DocBody
        doc_body = root.find(".//ieso:DocBody", NS)
        if doc_body is None:
            logger.error("DocBody not found in XML")
            return records
        
        date_str = doc_body.findtext("ieso:DELIVERYDATE", namespaces=NS)
        hour = doc_body.findtext("ieso:DELIVERYHOUR", namespaces=NS)
        
        if not date_str or not hour:
            logger.error(f"Missing date ({date_str}) or hour ({hour})")
            return records
        
        try:
            base_date = datetime.strptime(date_str, "%Y-%m-%d")
            hour_int = int(hour) - 1  # IESO uses 1-24, convert to 0-23
        except ValueError as e:
            logger.error(f"Failed to parse date/hour: {e}")
            return records
        
        # Find all TransactionZones
        for zone in root.findall(".//ieso:TransactionZone", NS):
            zone_name_el = zone.find("ieso:ZoneName", NS)
            if zone_name_el is None or not zone_name_el.text:
                continue
            
            # Extract zone name (e.g., "EAST:HUB" -> "EAST")
            zone_name = zone_name_el.text.replace(":HUB", "")
            
            # Process each interval
            for interval in zone.findall("ieso:IntervalPrice", NS):
                interval_num = interval.findtext("ieso:Interval", namespaces=NS)
                price = interval.findtext("ieso:ZonalPrice", namespaces=NS)
                loss_price = interval.findtext("ieso:EnergyLossPrice", namespaces=NS)
                cong_price = interval.findtext("ieso:EnergyCongPrice", namespaces=NS)
                
                # Skip empty intervals (interval 12 might be empty if not yet available)
                if not interval_num or not price:
                    continue
                
                try:
                    # Calculate timestamp: each interval is 5 minutes
                    # Interval 1 = :00, Interval 2 = :05, etc.
                    minute = (int(interval_num) - 1) * 5
                    timestamp = base_date.replace(hour=hour_int, minute=minute, second=0, microsecond=0)
                    
                    record: ZonalPriceRecord = {
                        "timestamp": timestamp.isoformat(),
                        "zone": zone_name,
                        "price": float(price),
                        "energy_loss_price": float(loss_price) if loss_price else 0.0,
                        "congestion_price": float(cong_price) if cong_price else 0.0,
                    }
                    records.append(record)
                except (ValueError, TypeError) as e:
                    logger.warning(f"Failed to parse interval for {zone_name}: {e}")
    
    logger.info(f"Parsed {len(records)} zonal price records")
    return records
