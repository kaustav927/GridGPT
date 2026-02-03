"""
Timezone utilities for IESO data producer.

IESO operates in Eastern Time (America/Toronto), which observes:
- EST (UTC-5) during standard time
- EDT (UTC-4) during daylight saving time

All date/time operations should use these utilities to ensure correct
timezone handling regardless of the server's local timezone.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

# IESO operates in Eastern Time (Toronto)
IESO_TZ = ZoneInfo("America/Toronto")


def now_eastern() -> datetime:
    """
    Get current time in Eastern timezone (IESO's timezone).

    Returns:
        Timezone-aware datetime in America/Toronto timezone
    """
    return datetime.now(IESO_TZ)


def today_eastern_str() -> str:
    """
    Get today's date in Eastern timezone as YYYYMMDD string.

    Returns:
        Date string in compact format for IESO report URLs
    """
    return now_eastern().strftime("%Y%m%d")


def today_eastern_date() -> str:
    """
    Get today's date in Eastern timezone as YYYY-MM-DD string.

    Returns:
        Date string in ISO format
    """
    return now_eastern().strftime("%Y-%m-%d")
