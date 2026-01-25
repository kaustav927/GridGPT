"""
Ontario Grid Cockpit - IESO Data Producer

Fetches data from IESO public reports and publishes to Kafka topics.
Runs on a 5-minute schedule to match IESO data refresh rate.
"""

import asyncio
import logging
from datetime import datetime

from config import settings
from producers.kafka_producer import KafkaProducerClient
from parsers.zonal_prices import fetch_zonal_prices
from parsers.zonal_demand import fetch_zonal_demand
from parsers.generator_output import fetch_generator_output
from parsers.fuel_mix import fetch_fuel_mix
from parsers.intertie_flow import fetch_intertie_flow

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def fetch_all_reports(producer: KafkaProducerClient) -> None:
    """Fetch all IESO reports and publish to Kafka."""
    
    logger.info("Starting data fetch cycle...")
    start_time = datetime.now()
    
    try:
        # Fetch 5-minute data in parallel
        zonal_prices, zonal_demand, generator_output = await asyncio.gather(
            fetch_zonal_prices(),
            fetch_zonal_demand(),
            fetch_generator_output(),
            return_exceptions=True
        )
        
        # Publish 5-minute data
        if not isinstance(zonal_prices, Exception):
            await producer.publish_batch("ieso.realtime.zonal-prices", zonal_prices)
            logger.info(f"Published {len(zonal_prices)} zonal price records")
        else:
            logger.error(f"Failed to fetch zonal prices: {zonal_prices}")
            
        if not isinstance(zonal_demand, Exception):
            await producer.publish_batch("ieso.realtime.zonal-demand", zonal_demand)
            logger.info(f"Published {len(zonal_demand)} zonal demand records")
        else:
            logger.error(f"Failed to fetch zonal demand: {zonal_demand}")
            
        if not isinstance(generator_output, Exception):
            await producer.publish_batch("ieso.realtime.generator-output", generator_output)
            logger.info(f"Published {len(generator_output)} generator output records")
        else:
            logger.error(f"Failed to fetch generator output: {generator_output}")
        
        # Fetch hourly data (less frequent)
        fuel_mix, intertie_flow = await asyncio.gather(
            fetch_fuel_mix(),
            fetch_intertie_flow(),
            return_exceptions=True
        )
        
        if not isinstance(fuel_mix, Exception):
            await producer.publish_batch("ieso.hourly.fuel-mix", fuel_mix)
            logger.info(f"Published {len(fuel_mix)} fuel mix records")
        else:
            logger.error(f"Failed to fetch fuel mix: {fuel_mix}")
            
        if not isinstance(intertie_flow, Exception):
            await producer.publish_batch("ieso.hourly.intertie-flow", intertie_flow)
            logger.info(f"Published {len(intertie_flow)} intertie flow records")
        else:
            logger.error(f"Failed to fetch intertie flow: {intertie_flow}")
        
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"Fetch cycle completed in {elapsed:.2f}s")
        
    except Exception as e:
        logger.exception(f"Error in fetch cycle: {e}")


async def run_scheduler() -> None:
    """Run the producer on a schedule."""
    
    producer = KafkaProducerClient(
        bootstrap_servers=settings.kafka_broker,
    )
    
    logger.info(f"Starting producer with {settings.poll_interval}s interval")
    logger.info(f"Kafka broker: {settings.kafka_broker}")
    
    while True:
        await fetch_all_reports(producer)
        
        # Wait for next interval
        logger.info(f"Sleeping for {settings.poll_interval}s...")
        await asyncio.sleep(settings.poll_interval)


def main() -> None:
    """Entry point."""
    try:
        asyncio.run(run_scheduler())
    except KeyboardInterrupt:
        logger.info("Shutting down producer...")


if __name__ == "__main__":
    main()
