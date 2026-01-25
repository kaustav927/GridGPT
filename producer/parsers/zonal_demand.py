"""
Parser for IESO Realtime Demand Zonal CSV report.
URL: https://reports-public.ieso.ca/public/RealtimeDemandZonal/PUB_RealtimeDemandZonal.csv
"""

import csv
import logging
from datetime import datetime
from io import StringIO
from typing import TypedDict

import httpx

from config import settings

logger = logging.getLogger(__name__)

REPORT_URL = f"{settings.ieso_base_url}/RealtimeDemandZonal/PUB_RealtimeDemandZonal.csv"

# Column mapping (0-indexed after skipping header rows)
ZONE_COLUMNS = {
    'NORTHWEST': 4,
    'NORTHEAST': 5,
    'OTTAWA': 6,
    'EAST': 7,
    'TORONTO': 8,
    'ESSA': 9,
    'BRUCE': 10,
    'SOUTHWEST': 11,
    'NIAGARA': 12,
    'WEST': 13,
}


class ZonalDemandRecord(TypedDict):
    """Schema for zonal demand records."""
    timestamp: str
    zone: str
    demand_mw: float


async def fetch_zonal_demand() -> list[ZonalDemandRecord]:
    """
    Fetch and parse the zonal demand report.
    
    Returns a list of demand records with timestamp, zone, and MW.
    """
    records: list[ZonalDemandRecord] = []
    
    async with httpx.AsyncClient(timeout=settings.http_timeout) as client:
        response = await client.get(REPORT_URL)
        response.raise_for_status()
        
        # Parse CSV (skip first 4 header rows)
        content = response.text
        reader = csv.reader(StringIO(content))
        
        # Skip metadata rows
        for _ in range(4):
            next(reader, None)
        
        for row in reader:
            if len(row) < 14:
                continue
                
            try:
                # Parse date and time
                date_str = row[0].strip()
                hour = int(row[1].strip())
                interval = int(row[2].strip())
                
                # Build timestamp
                date = datetime.strptime(date_str, '%Y-%m-%d')
                # Each interval is 5 minutes: interval 1 = :00, interval 2 = :05, etc.
                minute = (interval - 1) * 5
                timestamp = date.replace(hour=hour - 1, minute=minute, second=0, microsecond=0)
                
                # Extract demand for each zone
                for zone, col_idx in ZONE_COLUMNS.items():
                    try:
                        demand = float(row[col_idx].strip()) if row[col_idx].strip() else 0.0
                        record: ZonalDemandRecord = {
                            'timestamp': timestamp.isoformat(),
                            'zone': zone,
                            'demand_mw': demand,
                        }
                        records.append(record)
                    except (ValueError, IndexError) as e:
                        logger.warning(f"Failed to parse demand for {zone}: {e}")
                        
            except (ValueError, IndexError) as e:
                logger.warning(f"Failed to parse row: {e}")
                continue
    
    logger.info(f"Parsed {len(records)} zonal demand records")
    return records
