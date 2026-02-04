"""
Configuration settings for the IESO data producer.
Uses Pydantic for validation and environment variable loading.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Kafka
    kafka_broker: str = "localhost:19092"
    kafka_schema_registry: str = "http://localhost:18081"
    
    # IESO
    ieso_base_url: str = "https://reports-public.ieso.ca/public"
    
    # Producer
    poll_interval: int = 300  # 5 minutes in seconds
    log_level: str = "info"
    
    # Timeouts
    http_timeout: int = 30  # seconds
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Global settings instance
settings = Settings()

# Zone centroid coordinates (approximate center of each pricing zone)
# Used for weather data fetching from Open-Meteo API
ZONE_CENTROIDS: dict[str, tuple[float, float]] = {
    "TORONTO": (43.65, -79.38),
    "EAST": (44.23, -76.48),      # Kingston area
    "OTTAWA": (45.42, -75.69),
    "ESSA": (44.30, -79.72),      # Barrie area
    "NIAGARA": (43.10, -79.07),
    "SOUTHWEST": (42.98, -81.25), # London area
    "WEST": (43.45, -80.48),      # Kitchener area
    "BRUCE": (44.32, -81.60),     # Bruce Peninsula
    "NORTHEAST": (46.49, -81.00), # Sudbury area
    "NORTHWEST": (48.38, -89.25), # Thunder Bay area
}
