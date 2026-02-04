"""
Fetch weather data with 24-hour forecast from Open-Meteo.
Stores both current observations and hourly forecasts for time scrubber support.

API: Open-Meteo (free, no API key required)
URL: https://api.open-meteo.com/v1/forecast
"""

import logging
from datetime import datetime, timezone
from typing import TypedDict

import httpx

from config import settings, ZONE_CENTROIDS

logger = logging.getLogger(__name__)


class WeatherRecord(TypedDict):
    """Schema for weather records with forecast support."""
    fetch_timestamp: str
    valid_timestamp: str
    zone: str
    lat: float
    lng: float
    temperature: float
    wind_speed: float
    wind_direction: int
    cloud_cover: int
    precipitation: float
    is_forecast: int


async def fetch_weather_with_forecast() -> list[WeatherRecord]:
    """
    Fetch current + 24h forecast for all zone centroids from Open-Meteo API.

    Returns a list of weather records including:
    - Current observation (is_forecast=0)
    - Hourly forecasts for next 24 hours (is_forecast=1)
    - Past hour data for interpolation (is_forecast=0)
    """
    records: list[WeatherRecord] = []
    fetch_time = datetime.now(timezone.utc)

    async with httpx.AsyncClient(timeout=settings.http_timeout) as client:
        for zone, (lat, lng) in ZONE_CENTROIDS.items():
            url = (
                f"https://api.open-meteo.com/v1/forecast?"
                f"latitude={lat}&longitude={lng}"
                f"&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation"
                f"&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation"
                f"&forecast_hours=24"
                f"&past_hours=24"
                f"&timezone=UTC"
            )

            try:
                response = await client.get(url)
                if response.status_code != 200:
                    logger.warning(f"Failed to fetch weather for {zone}: HTTP {response.status_code}")
                    continue

                data = response.json()

                # Current observation
                current = data.get("current", {})
                records.append({
                    "fetch_timestamp": fetch_time.strftime("%Y-%m-%d %H:%M:%S"),
                    "valid_timestamp": fetch_time.strftime("%Y-%m-%d %H:%M:%S"),
                    "zone": zone,
                    "lat": lat,
                    "lng": lng,
                    "temperature": current.get("temperature_2m", 0.0) or 0.0,
                    "wind_speed": current.get("wind_speed_10m", 0.0) or 0.0,
                    "wind_direction": int(current.get("wind_direction_10m", 0) or 0),
                    "cloud_cover": int(current.get("cloud_cover", 0) or 0),
                    "precipitation": current.get("precipitation", 0.0) or 0.0,
                    "is_forecast": 0,
                })

                # Hourly data (past + forecast)
                hourly = data.get("hourly", {})
                times = hourly.get("time", [])
                temps = hourly.get("temperature_2m", [])
                winds = hourly.get("wind_speed_10m", [])
                wind_dirs = hourly.get("wind_direction_10m", [])
                clouds = hourly.get("cloud_cover", [])
                precips = hourly.get("precipitation", [])

                for i, time_str in enumerate(times):
                    try:
                        # Parse ISO time string
                        valid_time = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
                        if valid_time.tzinfo is None:
                            valid_time = valid_time.replace(tzinfo=timezone.utc)
                        is_future = valid_time > fetch_time

                        records.append({
                            "fetch_timestamp": fetch_time.strftime("%Y-%m-%d %H:%M:%S"),
                            "valid_timestamp": valid_time.strftime("%Y-%m-%d %H:%M:%S"),
                            "zone": zone,
                            "lat": lat,
                            "lng": lng,
                            "temperature": (temps[i] if i < len(temps) else 0.0) or 0.0,
                            "wind_speed": (winds[i] if i < len(winds) else 0.0) or 0.0,
                            "wind_direction": int((wind_dirs[i] if i < len(wind_dirs) else 0) or 0),
                            "cloud_cover": int((clouds[i] if i < len(clouds) else 0) or 0),
                            "precipitation": (precips[i] if i < len(precips) else 0.0) or 0.0,
                            "is_forecast": 1 if is_future else 0,
                        })
                    except (ValueError, TypeError) as e:
                        logger.debug(f"Error parsing hourly data for {zone}: {e}")
                        continue

            except Exception as e:
                logger.warning(f"Error fetching weather for {zone}: {e}")

    logger.info(f"Parsed {len(records)} weather records (current + forecast)")
    return records
