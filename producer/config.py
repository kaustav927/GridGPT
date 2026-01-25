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
