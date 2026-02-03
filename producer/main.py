"""
Ontario Grid Cockpit - IESO Data Producer

Fetches data from IESO public reports and publishes to Kafka topics.
Runs on a 5-minute schedule to match IESO data refresh rate.

On startup, automatically backfills any missing data from IESO hourly archives.
This handles gaps from laptop sleep, restarts, or other interruptions.

Note: Generator output (GenOutputCapability) is NOT backfilled because IESO
does not provide hourly archives for this report - it's a rolling snapshot only.
"""

import asyncio
import logging
from datetime import datetime, timedelta

import httpx
from lxml import etree

from config import settings
from producers.kafka_producer import KafkaProducerClient
from parsers.zonal_prices import fetch_zonal_prices
from parsers.realtime_totals import fetch_realtime_totals
from parsers.generator_output import fetch_generator_output
from parsers.fuel_mix import fetch_fuel_mix
from parsers.intertie_flow import fetch_intertie_flow
from parsers.adequacy import fetch_adequacy
from parsers.da_ozp import fetch_da_ozp
from utils.timezone import now_eastern

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# IESO XML namespace for backfill parsing
NS = {"ieso": "http://www.ieso.ca/schema"}


async def fetch_price_archive(
    client: httpx.AsyncClient,
    date_compact: str,
    hour: int
) -> list[dict]:
    """
    Fetch and parse a single hourly RealtimeZonalEnergyPrices archive.

    Args:
        client: HTTP client
        date_compact: Date in YYYYMMDD format
        hour: Hour in IESO format (1-24)

    Returns:
        List of price records
    """
    records: list[dict] = []

    filename = f"PUB_RealtimeZonalEnergyPrices_{date_compact}{hour:02d}.xml"
    url = f"{settings.ieso_base_url}/RealtimeZonalEnergyPrices/{filename}"

    try:
        response = await client.get(url)
        if response.status_code == 404:
            return records
        response.raise_for_status()

        root = etree.fromstring(response.content)
        doc_body = root.find(".//ieso:DocBody", NS)
        if doc_body is None:
            return records

        date_str = doc_body.findtext("ieso:DELIVERYDATE", namespaces=NS)
        hour_str = doc_body.findtext("ieso:DELIVERYHOUR", namespaces=NS)

        if not date_str or not hour_str:
            return records

        base_date = datetime.strptime(date_str, "%Y-%m-%d")
        hour_int = int(hour_str) - 1  # IESO uses 1-24

        for zone in root.findall(".//ieso:TransactionZone", NS):
            zone_name_el = zone.find("ieso:ZoneName", NS)
            if zone_name_el is None or not zone_name_el.text:
                continue

            zone_name = zone_name_el.text.replace(":HUB", "")

            for interval in zone.findall("ieso:IntervalPrice", NS):
                interval_num = interval.findtext("ieso:Interval", namespaces=NS)
                price = interval.findtext("ieso:ZonalPrice", namespaces=NS)
                loss_price = interval.findtext("ieso:EnergyLossPrice", namespaces=NS)
                cong_price = interval.findtext("ieso:EnergyCongPrice", namespaces=NS)

                if not interval_num or not price:
                    continue

                try:
                    minute = (int(interval_num) - 1) * 5
                    timestamp = base_date.replace(hour=hour_int, minute=minute, second=0, microsecond=0)

                    records.append({
                        "timestamp": timestamp.isoformat(),
                        "zone": zone_name,
                        "price": float(price),
                        "energy_loss_price": float(loss_price) if loss_price else 0.0,
                        "congestion_price": float(cong_price) if cong_price else 0.0,
                    })
                except (ValueError, TypeError):
                    pass

    except Exception as e:
        logger.debug(f"Could not fetch price archive for hour {hour}: {e}")

    return records


async def fetch_hourly_archive(
    client: httpx.AsyncClient,
    date_compact: str,
    hour: int
) -> tuple[list[dict], list[dict]]:
    """
    Fetch and parse a single hourly RealtimeTotals archive.

    Args:
        client: HTTP client
        date_compact: Date in YYYYMMDD format
        hour: Hour in IESO format (1-24)

    Returns:
        Tuple of (demand_records, supply_records)
    """
    demand_records: list[dict] = []
    supply_records: list[dict] = []

    filename = f"PUB_RealtimeTotals_{date_compact}{hour:02d}.xml"
    url = f"{settings.ieso_base_url}/RealtimeTotals/{filename}"

    try:
        response = await client.get(url)
        if response.status_code == 404:
            return demand_records, supply_records
        response.raise_for_status()

        root = etree.fromstring(response.content)
        doc_body = root.find(".//ieso:DocBody", NS)
        if doc_body is None:
            return demand_records, supply_records

        date_str = doc_body.findtext("ieso:DeliveryDate", namespaces=NS)
        hour_str = doc_body.findtext("ieso:DeliveryHour", namespaces=NS)

        if not date_str or not hour_str:
            return demand_records, supply_records

        base_date = datetime.strptime(date_str, "%Y-%m-%d")
        hour_int = int(hour_str) - 1  # IESO uses 1-24

        for interval_energy in doc_body.findall(".//ieso:IntervalEnergy", NS):
            interval_num = interval_energy.findtext("ieso:Interval", namespaces=NS)
            if not interval_num:
                continue

            minute = (int(interval_num) - 1) * 5
            timestamp = base_date.replace(hour=hour_int, minute=minute, second=0, microsecond=0)
            ts_str = timestamp.isoformat()

            for mq in interval_energy.findall("ieso:MQ", NS):
                market_qty = mq.findtext("ieso:MarketQuantity", namespaces=NS)
                energy_mw = mq.findtext("ieso:EnergyMW", namespaces=NS)

                if not energy_mw:
                    continue

                try:
                    mw_value = float(energy_mw)
                except (ValueError, TypeError):
                    continue

                if market_qty == "ONTARIO DEMAND":
                    demand_records.append({
                        "timestamp": ts_str,
                        "zone": "ONTARIO",
                        "demand_mw": mw_value,
                    })
                elif market_qty == "Total Energy":
                    supply_records.append({
                        "timestamp": ts_str,
                        "fuel_type": "REALTIME_TOTAL",
                        "output_mw": mw_value,
                    })

    except Exception as e:
        logger.debug(f"Could not fetch archive for hour {hour}: {e}")

    return demand_records, supply_records


async def backfill_on_startup(producer: KafkaProducerClient) -> None:
    """
    Backfill missing data from IESO hourly archives on startup.

    Fetches hourly archives for YESTERDAY and TODAY to fill gaps from
    overnight laptop sleep. IESO keeps ~7 days of hourly archives.

    Backfills demand, supply, and prices. Generator output is NOT backfilled
    because IESO does not provide hourly archives for GenOutputCapability -
    it's a rolling snapshot document only. Generator data will be fresh
    from the 5-minute polling cycle.
    """
    logger.info("Checking for data gaps and backfilling...")

    # Use Eastern timezone (IESO's timezone) to get correct dates
    now = now_eastern()
    today = now.strftime("%Y%m%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y%m%d")
    current_hour = now.hour + 1  # IESO uses 1-24

    all_demand: list[dict] = []
    all_supply: list[dict] = []
    all_prices: list[dict] = []

    async with httpx.AsyncClient(timeout=30) as client:
        # Build list of (date, hour) tuples to fetch
        # Yesterday: all 24 hours
        # Today: hours 1 to current hour
        fetch_list: list[tuple[str, int]] = []
        for hour in range(1, 25):
            fetch_list.append((yesterday, hour))
        for hour in range(1, min(current_hour + 1, 25)):
            fetch_list.append((today, hour))

        logger.info(f"Backfilling {len(fetch_list)} hours (yesterday + today)...")

        # Fetch demand/supply archives in parallel
        demand_tasks = [fetch_hourly_archive(client, date, hour) for date, hour in fetch_list]
        demand_results = await asyncio.gather(*demand_tasks, return_exceptions=True)

        for result in demand_results:
            if isinstance(result, Exception):
                continue
            demand, supply = result
            all_demand.extend(demand)
            all_supply.extend(supply)

        # Fetch price archives in parallel
        price_tasks = [fetch_price_archive(client, date, hour) for date, hour in fetch_list]
        price_results = await asyncio.gather(*price_tasks, return_exceptions=True)

        for result in price_results:
            if isinstance(result, Exception):
                continue
            all_prices.extend(result)

    if not all_demand and not all_supply and not all_prices:
        logger.info("No backfill data available")
        return

    logger.info(f"Backfilling {len(all_demand)} demand, {len(all_supply)} supply, {len(all_prices)} price records...")

    if all_demand:
        await producer.publish_batch("ieso.realtime.zonal-demand", all_demand)

    if all_supply:
        await producer.publish_batch("ieso.hourly.fuel-mix", all_supply)

    if all_prices:
        await producer.publish_batch("ieso.realtime.zonal-prices", all_prices)

    logger.info("Backfill complete!")


async def fetch_all_reports(producer: KafkaProducerClient) -> None:
    """Fetch all IESO reports and publish to Kafka."""
    
    logger.info("Starting data fetch cycle...")
    start_time = datetime.now()
    
    try:
        # Fetch 5-minute data in parallel
        zonal_prices, realtime_totals, generator_output = await asyncio.gather(
            fetch_zonal_prices(),
            fetch_realtime_totals(),
            fetch_generator_output(),
            return_exceptions=True
        )
        
        # Publish 5-minute data
        if not isinstance(zonal_prices, Exception):
            await producer.publish_batch("ieso.realtime.zonal-prices", zonal_prices)
            logger.info(f"Published {len(zonal_prices)} zonal price records")
        else:
            logger.error(f"Failed to fetch zonal prices: {zonal_prices}")
            
        if not isinstance(realtime_totals, Exception):
            demand_records, supply_records = realtime_totals
            await producer.publish_batch("ieso.realtime.zonal-demand", demand_records)
            logger.info(f"Published {len(demand_records)} realtime demand records")
            # Also publish realtime supply to fuel-mix topic
            await producer.publish_batch("ieso.hourly.fuel-mix", supply_records)
            logger.info(f"Published {len(supply_records)} realtime supply records")
        else:
            logger.error(f"Failed to fetch realtime totals: {realtime_totals}")
            
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

        # Fetch adequacy (tomorrow's demand forecast from dated Adequacy3 report)
        try:
            adequacy = await fetch_adequacy()
            if adequacy:
                dates_fetched = set(r['delivery_date'] for r in adequacy)
                logger.info(f"Adequacy data fetched for dates: {dates_fetched}")
                await producer.publish_batch("ieso.hourly.adequacy", adequacy)
                logger.info(f"Published {len(adequacy)} adequacy (demand forecast) records")
            else:
                logger.warning("No adequacy data returned - report may not be published yet")
        except Exception as e:
            logger.error(f"Failed to fetch adequacy: {e}")

        # Fetch day-ahead zonal prices (published daily around 13:30 ET)
        try:
            da_ozp = await fetch_da_ozp()
            if da_ozp:
                dates_fetched = set(r['delivery_date'] for r in da_ozp)
                logger.info(f"DA OZP data fetched for dates: {dates_fetched}")
                await producer.publish_batch("ieso.hourly.da-ozp", da_ozp)
                logger.info(f"Published {len(da_ozp)} day-ahead zonal price records")
            else:
                logger.warning("No DA OZP data returned - report may not be published yet")
        except Exception as e:
            logger.error(f"Failed to fetch DA OZP: {e}")

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

    # Backfill any missing data from today's hourly archives
    # This catches up on gaps from laptop sleep, restarts, etc.
    try:
        await backfill_on_startup(producer)
    except Exception as e:
        logger.warning(f"Backfill failed (continuing anyway): {e}")

    # Main polling loop
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
