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
from parsers.adequacy import fetch_adequacy, _fetch_single_adequacy_report
from parsers.da_ozp import fetch_da_ozp
from parsers.da_hourly_zonal import fetch_da_hourly_zonal
from parsers.weather_forecast import fetch_weather_with_forecast
from parsers.realtime_intertie_lmp import fetch_realtime_intertie_lmp, _map_zone
from parsers.da_intertie_lmp import fetch_da_intertie_lmp
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


async def fetch_rt_intertie_lmp_archive(
    client: httpx.AsyncClient,
    date_compact: str,
    hour: int,
) -> list[dict]:
    """
    Fetch and parse a single hourly RealTimeIntertieLMP archive.

    Same XML structure as the live report but with hourly filenames:
    PUB_RealTimeIntertieLMP_{YYYYMMDD}{HH}.xml
    """
    records: list[dict] = []

    filename = f"PUB_RealTimeIntertieLMP_{date_compact}{hour:02d}.xml"
    url = f"{settings.ieso_base_url}/RealTimeIntertieLMP/{filename}"

    try:
        response = await client.get(url)
        if response.status_code == 404:
            return records
        response.raise_for_status()

        root = etree.fromstring(response.content)
        doc_body = root.find(".//ieso:DocBody", NS)
        if doc_body is None:
            return records

        date_str = doc_body.findtext("ieso:DeliveryDate", namespaces=NS)
        hour_str = doc_body.findtext("ieso:DeliveryHour", namespaces=NS)

        if not date_str or not hour_str:
            return records

        base_date = datetime.strptime(date_str, "%Y-%m-%d")
        hour_int = int(hour_str) - 1  # IESO uses 1-24

        for intertie_el in root.findall(".//ieso:IntertieLMPrice", NS):
            pl_name = intertie_el.findtext("ieso:IntertiePLName", namespaces=NS)
            if not pl_name:
                continue

            zone = _map_zone(pl_name)

            for component in intertie_el.findall("ieso:Components", NS):
                comp_name = component.findtext("ieso:LMPComponent", namespaces=NS)
                if comp_name != "Intertie LMP":
                    continue

                for interval_el in component.findall("ieso:IntervalLMP", NS):
                    interval_num = interval_el.findtext("ieso:Interval", namespaces=NS)
                    lmp_val = interval_el.findtext("ieso:LMP", namespaces=NS)

                    if not interval_num or not lmp_val:
                        continue

                    try:
                        minute = (int(interval_num) - 1) * 5
                        timestamp = base_date.replace(
                            hour=hour_int, minute=minute, second=0, microsecond=0
                        )
                        records.append({
                            "timestamp": timestamp.isoformat(),
                            "intertie_zone": zone,
                            "lmp": float(lmp_val),
                        })
                    except (ValueError, TypeError):
                        pass

    except Exception as e:
        logger.debug(f"Could not fetch RT intertie LMP archive for hour {hour}: {e}")

    return records


async def fetch_da_intertie_lmp_archive(
    client: httpx.AsyncClient,
    date_compact: str,
) -> list[dict]:
    """
    Fetch and parse a daily DAHourlyIntertieLMP archive.

    Filename: PUB_DAHourlyIntertieLMP_{YYYYMMDD}.xml
    The date in the filename is the publication date; the report contains
    delivery_date = next day.
    """
    records: list[dict] = []

    filename = f"PUB_DAHourlyIntertieLMP_{date_compact}.xml"
    url = f"{settings.ieso_base_url}/DAHourlyIntertieLMP/{filename}"

    try:
        response = await client.get(url)
        if response.status_code == 404:
            return records
        response.raise_for_status()

        root = etree.fromstring(response.content)

        # Get report creation time from DocHeader
        created_at = root.findtext(".//ieso:DocHeader/ieso:CreatedAt", namespaces=NS)
        if created_at:
            try:
                report_ts = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                ts_str = report_ts.strftime("%Y-%m-%dT%H:%M:%S")
            except ValueError:
                ts_str = datetime.utcnow().isoformat()
        else:
            ts_str = datetime.utcnow().isoformat()

        doc_body = root.find(".//ieso:DocBody", NS)
        if doc_body is None:
            return records

        date_str = doc_body.findtext("ieso:DeliveryDate", namespaces=NS)
        if not date_str:
            return records

        for intertie_el in root.findall(".//ieso:IntertieLMPrice", NS):
            pl_name = intertie_el.findtext("ieso:IntertiePLName", namespaces=NS)
            if not pl_name:
                continue

            zone = _map_zone(pl_name)

            for component in intertie_el.findall("ieso:Components", NS):
                comp_name = component.findtext("ieso:LMPComponent", namespaces=NS)
                if comp_name != "Intertie LMP":
                    continue

                for hourly_el in component.findall("ieso:HourlyLMP", NS):
                    hour_str = hourly_el.findtext("ieso:DeliveryHour", namespaces=NS)
                    lmp_val = hourly_el.findtext("ieso:LMP", namespaces=NS)

                    if not hour_str or not lmp_val:
                        continue

                    try:
                        records.append({
                            "timestamp": ts_str,
                            "delivery_date": date_str,
                            "delivery_hour": int(hour_str),
                            "intertie_zone": zone,
                            "lmp": float(lmp_val),
                        })
                    except (ValueError, TypeError):
                        pass

    except Exception as e:
        logger.debug(f"Could not fetch DA intertie LMP archive for {date_compact}: {e}")

    return records


async def fetch_da_ozp_archive(
    client: httpx.AsyncClient,
    date_compact: str,
) -> list[dict]:
    """
    Fetch and parse a daily DAHourlyOntarioZonalPrice archive.

    Filename: PUB_DAHourlyOntarioZonalPrice_{YYYYMMDD}.xml
    The date in the filename is the publication date; the report contains
    delivery_date = next day.
    """
    records: list[dict] = []

    filename = f"PUB_DAHourlyOntarioZonalPrice_{date_compact}.xml"
    url = f"{settings.ieso_base_url}/DAHourlyOntarioZonalPrice/{filename}"

    try:
        response = await client.get(url)
        if response.status_code == 404:
            return records
        response.raise_for_status()

        root = etree.fromstring(response.content)

        # Get report creation time from DocHeader
        created_at = root.findtext(".//ieso:DocHeader/ieso:CreatedAt", namespaces=NS)
        if created_at:
            try:
                report_ts = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                ts_str = report_ts.strftime("%Y-%m-%dT%H:%M:%S")
            except ValueError:
                ts_str = datetime.utcnow().isoformat()
        else:
            ts_str = datetime.utcnow().isoformat()

        doc_body = root.find(".//ieso:DocBody", NS)
        if doc_body is None:
            return records

        date_str = doc_body.findtext("ieso:DeliveryDate", namespaces=NS)
        if not date_str:
            return records

        for price_component in root.findall(".//ieso:HourlyPriceComponents", NS):
            hour_str = price_component.findtext("ieso:PricingHour", namespaces=NS)
            price_str = price_component.findtext("ieso:ZonalPrice", namespaces=NS)

            if not hour_str or not price_str:
                continue

            try:
                records.append({
                    "timestamp": ts_str,
                    "delivery_date": date_str,
                    "delivery_hour": int(hour_str),
                    "zone": "ONTARIO",
                    "zonal_price": float(price_str),
                })
            except (ValueError, TypeError):
                pass

    except Exception as e:
        logger.debug(f"Could not fetch DA OZP archive for {date_compact}: {e}")

    return records


async def fetch_da_hourly_zonal_archive(
    client: httpx.AsyncClient,
    date_compact: str,
) -> list[dict]:
    """
    Fetch and parse a daily DAHourlyZonal archive.

    Filename: PUB_DAHourlyZonal_{YYYYMMDD}.xml
    The date in the filename is the publication date; the report contains
    delivery_date = next day.
    """
    records: list[dict] = []

    filename = f"PUB_DAHourlyZonal_{date_compact}.xml"
    url = f"{settings.ieso_base_url}/DAHourlyZonal/{filename}"

    try:
        response = await client.get(url)
        if response.status_code == 404:
            return records
        response.raise_for_status()

        root = etree.fromstring(response.content)

        # Get report creation time from DocHeader
        created_at = root.findtext(".//ieso:DocHeader/ieso:CreatedAt", namespaces=NS)
        if created_at:
            try:
                report_ts = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                ts_str = report_ts.strftime("%Y-%m-%dT%H:%M:%S")
            except ValueError:
                ts_str = datetime.utcnow().isoformat()
        else:
            ts_str = datetime.utcnow().isoformat()

        doc_body = root.find(".//ieso:DocBody", NS)
        if doc_body is None:
            return records

        date_str = doc_body.findtext("ieso:DeliveryDate", namespaces=NS)
        if not date_str:
            return records

        for transaction_zone in root.findall(".//ieso:TransactionZone", NS):
            zone_name_el = transaction_zone.find("ieso:ZoneName", NS)
            if zone_name_el is None or not zone_name_el.text:
                continue

            zone_name = zone_name_el.text.replace(":HUB", "")

            for components in transaction_zone.findall("ieso:Components", NS):
                price_component = components.findtext("ieso:PriceComponent", namespaces=NS)
                if price_component != "Zonal Price":
                    continue

                for delivery_hour in components.findall("ieso:DeliveryHour", NS):
                    hour_str = delivery_hour.findtext("ieso:Hour", namespaces=NS)
                    price_str = delivery_hour.findtext("ieso:LMP", namespaces=NS)

                    if not hour_str or not price_str:
                        continue

                    try:
                        records.append({
                            "timestamp": ts_str,
                            "delivery_date": date_str,
                            "delivery_hour": int(hour_str),
                            "zone": zone_name,
                            "zonal_price": float(price_str),
                        })
                    except (ValueError, TypeError):
                        pass

    except Exception as e:
        logger.debug(f"Could not fetch DA Hourly Zonal archive for {date_compact}: {e}")

    return records


async def fetch_fuel_mix_archive(
    client: httpx.AsyncClient,
    date_compact: str,
) -> list[dict]:
    """
    Fetch and parse a daily GenOutputbyFuelHourly archive.

    Filename: PUB_GenOutputbyFuelHourly_{YYYYMMDD}.xml
    """
    records: list[dict] = []

    filename = f"PUB_GenOutputbyFuelHourly_{date_compact}.xml"
    url = f"{settings.ieso_base_url}/GenOutputbyFuelHourly/{filename}"

    try:
        response = await client.get(url)
        if response.status_code == 404:
            return records
        response.raise_for_status()

        root = etree.fromstring(response.content)

        for daily in root.findall(".//ieso:DailyData", NS):
            day_str = daily.findtext("ieso:Day", namespaces=NS)
            if not day_str:
                continue

            try:
                base_date = datetime.strptime(day_str, "%Y-%m-%d")
            except ValueError:
                continue

            for hourly in daily.findall("ieso:HourlyData", NS):
                hour_str = hourly.findtext("ieso:Hour", namespaces=NS)
                if not hour_str:
                    continue

                try:
                    hour = int(hour_str)
                    timestamp = base_date.replace(hour=hour - 1, minute=0, second=0, microsecond=0)
                except ValueError:
                    continue

                for fuel_total in hourly.findall("ieso:FuelTotal", NS):
                    fuel_type = fuel_total.findtext("ieso:Fuel", namespaces=NS)
                    energy_value = fuel_total.find("ieso:EnergyValue", NS)

                    if fuel_type and energy_value is not None:
                        output = energy_value.findtext("ieso:Output", namespaces=NS)
                        if output:
                            try:
                                records.append({
                                    "timestamp": timestamp.isoformat(),
                                    "fuel_type": fuel_type,
                                    "output_mw": float(output),
                                })
                            except ValueError:
                                pass

    except Exception as e:
        logger.debug(f"Could not fetch fuel mix archive for {date_compact}: {e}")

    return records


async def fetch_intertie_flow_archive(
    client: httpx.AsyncClient,
    date_compact: str,
) -> list[dict]:
    """
    Fetch and parse a daily IntertieScheduleFlow archive.

    Filename: PUB_IntertieScheduleFlow_{YYYYMMDD}.xml
    Note: Uses theIMO.com namespace (different from other IESO reports).
    Timestamps are converted from EPT to UTC for storage consistency.
    """
    from zoneinfo import ZoneInfo

    records: list[dict] = []
    IMO_NS = {"imo": "http://www.theIMO.com/schema"}

    filename = f"PUB_IntertieScheduleFlow_{date_compact}.xml"
    url = f"{settings.ieso_base_url}/IntertieScheduleFlow/{filename}"

    try:
        response = await client.get(url)
        if response.status_code == 404:
            return records
        response.raise_for_status()

        root = etree.fromstring(response.content)

        doc_body = root.find(".//imo:IMODocBody", IMO_NS)
        if doc_body is None:
            return records

        date_str = doc_body.findtext("imo:Date", namespaces=IMO_NS)
        if not date_str:
            return records

        try:
            base_date = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            return records

        for zone in root.findall(".//imo:IntertieZone", IMO_NS):
            zone_name = zone.findtext("imo:IntertieZoneName", namespaces=IMO_NS)
            if not zone_name:
                continue

            schedules_by_hour: dict[int, float] = {}
            for schedule in zone.findall(".//imo:Schedule", IMO_NS):
                hour = schedule.findtext("imo:Hour", namespaces=IMO_NS)
                import_mw = schedule.findtext("imo:Import", namespaces=IMO_NS)
                export_mw = schedule.findtext("imo:Export", namespaces=IMO_NS)

                if hour:
                    try:
                        h = int(hour)
                        imp = float(import_mw) if import_mw else 0.0
                        exp = float(export_mw) if export_mw else 0.0
                        schedules_by_hour[h] = imp - exp
                    except ValueError:
                        pass

            actuals: dict[tuple[int, int], float] = {}
            for actual in zone.findall(".//imo:Actual", IMO_NS):
                hour = actual.findtext("imo:Hour", namespaces=IMO_NS)
                interval = actual.findtext("imo:Interval", namespaces=IMO_NS)
                flow = actual.findtext("imo:Flow", namespaces=IMO_NS)

                if hour and interval and flow:
                    try:
                        actuals[(int(hour), int(interval))] = float(flow)
                    except ValueError:
                        pass

            ept = ZoneInfo("America/Toronto")
            utc = ZoneInfo("UTC")
            for (hour, interval), actual_flow in sorted(actuals.items()):
                try:
                    minute = (interval - 1) * 5
                    naive_ts = base_date.replace(hour=hour - 1, minute=minute, second=0, microsecond=0)
                    timestamp = naive_ts.replace(tzinfo=ept).astimezone(utc)

                    records.append({
                        "timestamp": timestamp.strftime("%Y-%m-%dT%H:%M:%S"),
                        "intertie": zone_name,
                        "scheduled_mw": schedules_by_hour.get(hour, 0.0),
                        "actual_mw": actual_flow,
                    })
                except ValueError:
                    pass

    except Exception as e:
        logger.debug(f"Could not fetch intertie flow archive for {date_compact}: {e}")

    return records


async def backfill_on_startup(producer: KafkaProducerClient) -> None:
    """
    Backfill missing data from IESO archives on startup.

    Fetches hourly archives for the last 30 days to fill gaps from deploys,
    restarts, or other interruptions. Backfills ALL report types:
    - RT prices, demand, supply (hourly archives)
    - RT intertie LMP (hourly archives)
    - DA intertie LMP, DA-OZP, DA zonal prices (daily archives)
    - Adequacy, fuel mix, intertie flow (daily archives)

    Generator output is NOT backfilled because IESO does not provide
    hourly archives for GenOutputCapability - it's a rolling snapshot only.
    """
    logger.info("Checking for data gaps and backfilling (30 days)...")

    # Use Eastern timezone (IESO's timezone) to get correct dates
    now = now_eastern()
    current_hour = now.hour + 1  # IESO uses 1-24

    all_demand: list[dict] = []
    all_supply: list[dict] = []
    all_prices: list[dict] = []
    all_rt_lmp: list[dict] = []
    all_da_lmp: list[dict] = []
    all_da_ozp: list[dict] = []
    all_adequacy: list[dict] = []
    all_fuel_mix: list[dict] = []
    all_intertie_flow: list[dict] = []

    # Semaphore to limit concurrent requests (avoid overwhelming IESO)
    sem = asyncio.Semaphore(10)

    async def fetch_with_sem(coro):
        async with sem:
            return await coro

    async with httpx.AsyncClient(timeout=30) as client:
        # Build list of (date, hour) tuples for hourly archives
        fetch_list: list[tuple[str, int]] = []
        for days_ago in range(29, -1, -1):  # 30 days
            target_date = now - timedelta(days=days_ago)
            date_compact = target_date.strftime("%Y%m%d")

            # For today (days_ago=0), only fetch up to current hour
            max_hour = 24 if days_ago > 0 else current_hour

            for hour in range(1, max_hour + 1):
                fetch_list.append((date_compact, hour))

        logger.info(f"Backfilling {len(fetch_list)} hours (30 days)...")

        # --- Hourly archives (RT prices, demand/supply, RT LMP) ---
        # Process in batches of 10 concurrent requests
        batch_size = 10
        for i in range(0, len(fetch_list), batch_size):
            batch = fetch_list[i:i + batch_size]

            demand_tasks = [fetch_with_sem(fetch_hourly_archive(client, date, hour)) for date, hour in batch]
            price_tasks = [fetch_with_sem(fetch_price_archive(client, date, hour)) for date, hour in batch]
            rt_lmp_tasks = [fetch_with_sem(fetch_rt_intertie_lmp_archive(client, date, hour)) for date, hour in batch]

            results = await asyncio.gather(
                *demand_tasks, *price_tasks, *rt_lmp_tasks,
                return_exceptions=True
            )

            # Split results: first batch_len are demand, next are prices, last are RT LMP
            batch_len = len(batch)
            for j, result in enumerate(results[:batch_len]):
                if isinstance(result, Exception):
                    continue
                demand, supply = result
                all_demand.extend(demand)
                all_supply.extend(supply)

            for result in results[batch_len:batch_len * 2]:
                if isinstance(result, Exception):
                    continue
                all_prices.extend(result)

            for result in results[batch_len * 2:]:
                if isinstance(result, Exception):
                    continue
                all_rt_lmp.extend(result)

        # --- Daily archives (DA-OZP, DA zonal, DA LMP, adequacy, fuel mix, intertie flow) ---
        logger.info("Backfilling daily archives (30 days)...")
        for days_ago in range(29, -1, -1):
            target_date = now - timedelta(days=days_ago)
            date_compact = target_date.strftime("%Y%m%d")

            daily_tasks = [
                fetch_with_sem(fetch_da_intertie_lmp_archive(client, date_compact)),
                fetch_with_sem(fetch_da_ozp_archive(client, date_compact)),
                fetch_with_sem(fetch_da_hourly_zonal_archive(client, date_compact)),
                fetch_with_sem(fetch_fuel_mix_archive(client, date_compact)),
                fetch_with_sem(fetch_intertie_flow_archive(client, date_compact)),
            ]

            daily_results = await asyncio.gather(*daily_tasks, return_exceptions=True)

            if not isinstance(daily_results[0], Exception):
                all_da_lmp.extend(daily_results[0])
            if not isinstance(daily_results[1], Exception):
                all_da_ozp.extend(daily_results[1])
            if not isinstance(daily_results[2], Exception):
                all_da_ozp.extend(daily_results[2])  # DA zonal goes to same topic
            if not isinstance(daily_results[3], Exception):
                all_fuel_mix.extend(daily_results[3])
            if not isinstance(daily_results[4], Exception):
                all_intertie_flow.extend(daily_results[4])

            # Adequacy: reuse existing parser which already accepts date_compact
            try:
                adequacy_result = await fetch_with_sem(
                    _fetch_single_adequacy_report(date_compact, now)
                )
                if not isinstance(adequacy_result, Exception):
                    all_adequacy.extend(adequacy_result)
            except Exception:
                pass

    total = (len(all_demand) + len(all_supply) + len(all_prices) +
             len(all_rt_lmp) + len(all_da_lmp) + len(all_da_ozp) +
             len(all_adequacy) + len(all_fuel_mix) + len(all_intertie_flow))

    if total == 0:
        logger.info("No backfill data available")
        return

    logger.info(
        f"Backfilling {len(all_demand)} demand, {len(all_supply)} supply, "
        f"{len(all_prices)} price, {len(all_rt_lmp)} RT LMP, {len(all_da_lmp)} DA LMP, "
        f"{len(all_da_ozp)} DA-OZP, {len(all_adequacy)} adequacy, "
        f"{len(all_fuel_mix)} fuel mix, {len(all_intertie_flow)} intertie flow records..."
    )

    if all_demand:
        await producer.publish_batch("ieso.realtime.zonal-demand", all_demand)

    if all_supply:
        await producer.publish_batch("ieso.hourly.fuel-mix", all_supply)

    if all_prices:
        await producer.publish_batch("ieso.realtime.zonal-prices", all_prices)

    if all_rt_lmp:
        await producer.publish_batch("ieso.realtime.intertie-lmp", all_rt_lmp)

    if all_da_lmp:
        await producer.publish_batch("ieso.hourly.da-intertie-lmp", all_da_lmp)

    if all_da_ozp:
        await producer.publish_batch("ieso.hourly.da-ozp", all_da_ozp)

    if all_adequacy:
        await producer.publish_batch("ieso.hourly.adequacy", all_adequacy)

    if all_fuel_mix:
        await producer.publish_batch("ieso.hourly.fuel-mix", all_fuel_mix)

    if all_intertie_flow:
        await producer.publish_batch("ieso.hourly.intertie-flow", all_intertie_flow)

    logger.info("Backfill complete!")


async def fetch_all_reports(producer: KafkaProducerClient) -> None:
    """Fetch all IESO reports and publish to Kafka."""
    
    logger.info("Starting data fetch cycle...")
    start_time = datetime.now()
    
    try:
        # Fetch 5-minute data in parallel
        zonal_prices, realtime_totals, generator_output, rt_intertie_lmp = await asyncio.gather(
            fetch_zonal_prices(),
            fetch_realtime_totals(),
            fetch_generator_output(),
            fetch_realtime_intertie_lmp(),
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

        if not isinstance(rt_intertie_lmp, Exception):
            await producer.publish_batch("ieso.realtime.intertie-lmp", rt_intertie_lmp)
            logger.info(f"Published {len(rt_intertie_lmp)} realtime intertie LMP records")
        else:
            logger.error(f"Failed to fetch realtime intertie LMP: {rt_intertie_lmp}")

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
        # Two sources: province-wide (ONTARIO) and per-zone (EAST, WEST, etc.)
        try:
            da_ozp = await fetch_da_ozp()
            if da_ozp:
                dates_fetched = set(r['delivery_date'] for r in da_ozp)
                logger.info(f"DA OZP (province-wide) data fetched for dates: {dates_fetched}")
                await producer.publish_batch("ieso.hourly.da-ozp", da_ozp)
                logger.info(f"Published {len(da_ozp)} province-wide day-ahead price records")
            else:
                logger.warning("No DA OZP data returned - report may not be published yet")
        except Exception as e:
            logger.error(f"Failed to fetch DA OZP: {e}")

        # Fetch per-zone day-ahead prices (same topic, different zones)
        try:
            da_zonal = await fetch_da_hourly_zonal()
            if da_zonal:
                zones_fetched = set(r['zone'] for r in da_zonal)
                dates_fetched = set(r['delivery_date'] for r in da_zonal)
                logger.info(f"DA Hourly Zonal data fetched for zones: {zones_fetched}, dates: {dates_fetched}")
                await producer.publish_batch("ieso.hourly.da-ozp", da_zonal)
                logger.info(f"Published {len(da_zonal)} per-zone day-ahead price records")
            else:
                logger.warning("No DA Hourly Zonal data returned - report may not be published yet")
        except Exception as e:
            logger.error(f"Failed to fetch DA Hourly Zonal: {e}")

        # Fetch day-ahead intertie LMP (published daily)
        try:
            da_lmp = await fetch_da_intertie_lmp()
            if da_lmp:
                zones_fetched = set(r['intertie_zone'] for r in da_lmp)
                logger.info(f"DA Intertie LMP data fetched for zones: {zones_fetched}")
                await producer.publish_batch("ieso.hourly.da-intertie-lmp", da_lmp)
                logger.info(f"Published {len(da_lmp)} DA intertie LMP records")
            else:
                logger.warning("No DA Intertie LMP data returned - report may not be published yet")
        except Exception as e:
            logger.error(f"Failed to fetch DA Intertie LMP: {e}")

        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"Fetch cycle completed in {elapsed:.2f}s")
        
    except Exception as e:
        logger.exception(f"Error in fetch cycle: {e}")


async def fetch_weather_loop(producer: KafkaProducerClient) -> None:
    """Fetch weather with forecast on a 15-minute schedule."""
    weather_interval = 900  # 15 minutes in seconds

    while True:
        try:
            weather = await fetch_weather_with_forecast()
            if weather:
                await producer.publish_batch("ieso.weather.forecast", weather)
                logger.info(f"Published {len(weather)} weather forecast records")
        except Exception as e:
            logger.error(f"Weather fetch error: {e}")

        await asyncio.sleep(weather_interval)


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

    # Start weather fetch loop (15-minute interval, runs in background)
    weather_task = asyncio.create_task(fetch_weather_loop(producer))

    # Main polling loop (5-minute interval for IESO data)
    try:
        while True:
            await fetch_all_reports(producer)

            # Wait for next interval
            logger.info(f"Sleeping for {settings.poll_interval}s...")
            await asyncio.sleep(settings.poll_interval)
    finally:
        weather_task.cancel()
        try:
            await weather_task
        except asyncio.CancelledError:
            pass


def main() -> None:
    """Entry point."""
    try:
        asyncio.run(run_scheduler())
    except KeyboardInterrupt:
        logger.info("Shutting down producer...")


if __name__ == "__main__":
    main()
