export interface TableSchema {
  name: string;
  description: string;
  frequency: string;
  columns: { name: string; type: string; description: string }[];
}

export const IESO_TABLES: TableSchema[] = [
  {
    name: 'v_zonal_prices',
    description: 'Deduplicated real-time 5-minute zonal energy prices — monitoring data showing live grid conditions (NOT the settlement price; use v_da_ozp for settlement)',
    frequency: '5-minute',
    columns: [
      { name: 'timestamp', type: 'DateTime', description: 'EST timestamp (naive DateTime, no tz metadata) of the price interval' },
      { name: 'zone', type: 'String', description: 'Pricing zone: EAST, ESSA, NIAGARA, NORTHEAST, NORTHWEST, OTTAWA, SOUTHWEST, TORONTO, WEST' },
      { name: 'price', type: 'Float32', description: 'Zonal energy price in $/MWh' },
      { name: 'energy_loss_price', type: 'Float32', description: 'Transmission loss component in $/MWh' },
      { name: 'congestion_price', type: 'Float32', description: 'Congestion component in $/MWh' },
    ],
  },
  {
    name: 'v_zonal_demand',
    description: 'Deduplicated real-time 5-minute electricity demand by zone',
    frequency: '5-minute',
    columns: [
      { name: 'timestamp', type: 'DateTime', description: 'EST timestamp (naive DateTime, no tz metadata) of the demand reading' },
      { name: 'zone', type: 'String', description: 'Demand zone: EAST, ESSA, NIAGARA, NORTHEAST, NORTHWEST, OTTAWA, SOUTHWEST, TORONTO, WEST, BRUCE. Also ONTARIO (total) and GRID_LOAD' },
      { name: 'demand_mw', type: 'Float32', description: 'Electricity demand in MW' },
    ],
  },
  {
    name: 'v_generator_output',
    description: 'Deduplicated real-time 5-minute individual generator output and capability',
    frequency: '5-minute',
    columns: [
      { name: 'timestamp', type: 'DateTime', description: 'EST timestamp (naive DateTime, no tz metadata) of the reading' },
      { name: 'generator', type: 'String', description: 'Generator name/identifier' },
      { name: 'fuel_type', type: 'String', description: 'Fuel type: NUCLEAR, GAS, HYDRO, WIND, SOLAR, BIOFUEL' },
      { name: 'output_mw', type: 'Float32', description: 'Current output in MW' },
      { name: 'capability_mw', type: 'Float32', description: 'Maximum capability in MW' },
    ],
  },
  {
    name: 'v_fuel_mix',
    description: 'Deduplicated hourly aggregated generation output by fuel type',
    frequency: 'Hourly',
    columns: [
      { name: 'timestamp', type: 'DateTime', description: 'EST timestamp (naive DateTime, no tz metadata, hour boundary)' },
      { name: 'fuel_type', type: 'String', description: 'Fuel type: NUCLEAR, GAS, HYDRO, WIND, SOLAR, BIOFUEL' },
      { name: 'output_mw', type: 'Float32', description: 'Total generation output for this fuel type in MW' },
    ],
  },
  {
    name: 'v_intertie_flow',
    description: 'Deduplicated hourly scheduled and actual power flows on interties with neighboring jurisdictions',
    frequency: 'Hourly',
    columns: [
      { name: 'timestamp', type: 'DateTime', description: 'UTC timestamp (hour boundary)' },
      { name: 'intertie', type: 'String', description: 'Intertie name (e.g., MICHIGAN, MANITOBA, PQ.AT, PQ.B5D, PQ.D4Z, PQ.D5A, PQ.H4Z, PQ.H9A, PQ.P33C, PQ.Q4C, PQ.X2Y, MANITOBA SK, MINNESOTA, NEW-YORK)' },
      { name: 'scheduled_mw', type: 'Float32', description: 'Scheduled power flow in MW' },
      { name: 'actual_mw', type: 'Float32', description: 'Actual power flow in MW. Positive = export from Ontario, negative = import to Ontario' },
    ],
  },
  {
    name: 'v_adequacy',
    description: 'Deduplicated hourly demand and supply forecasts for system adequacy (latest forecast per delivery slot)',
    frequency: 'Hourly',
    columns: [
      { name: 'delivery_date', type: 'Date', description: 'Date the forecast applies to' },
      { name: 'delivery_hour', type: 'UInt8', description: 'Hour-ending (1-24) in EST the forecast applies to' },
      { name: 'forecast_demand_mw', type: 'Float32', description: 'Forecast demand in MW (latest published value)' },
      { name: 'forecast_supply_mw', type: 'Float32', description: 'Forecast available supply in MW (latest published value)' },
      { name: 'publish_timestamp', type: 'DateTime', description: 'EST timestamp of the latest forecast publish for this delivery slot' },
    ],
  },
  {
    name: 'v_da_ozp',
    description: 'Deduplicated Day-Ahead Ontario Zonal Prices — the PRIMARY settlement price for Ontario electricity (OEMP basis). Published daily ~1:30 PM EST.',
    frequency: 'Daily (~13:30 EST)',
    columns: [
      { name: 'delivery_date', type: 'Date', description: 'Date the prices apply to' },
      { name: 'delivery_hour', type: 'UInt8', description: 'Hour-ending (1-24) in EST. Hour 20 = 7pm-8pm EST' },
      { name: 'zone', type: 'String', description: 'Pricing zone (same 9 zones as v_zonal_prices)' },
      { name: 'zonal_price', type: 'Float32', description: 'Day-ahead zonal price in $/MWh (latest published value)' },
      { name: 'publish_timestamp', type: 'DateTime', description: 'EST timestamp of the latest DA price publish for this delivery slot' },
    ],
  },
  {
    name: 'v_weather',
    description: 'Deduplicated weather data from Open-Meteo for Ontario zones. IMPORTANT: Contains both observations AND forecasts (up to 24h ahead). Always filter valid_timestamp <= now() to get current/past observations only.',
    frequency: '15-minute',
    columns: [
      { name: 'valid_timestamp', type: 'DateTime', description: 'UTC timestamp of the weather data point. May be in the future for forecast rows — filter valid_timestamp <= now() for observations only' },
      { name: 'zone', type: 'String', description: 'Ontario zone name' },
      { name: 'lat', type: 'Float32', description: 'Latitude of the zone weather station' },
      { name: 'lng', type: 'Float32', description: 'Longitude of the zone weather station' },
      { name: 'temperature', type: 'Float32', description: 'Temperature in Celsius' },
      { name: 'wind_speed', type: 'Float32', description: 'Wind speed in m/s' },
      { name: 'wind_direction', type: 'UInt16', description: 'Wind direction in degrees (0-360)' },
      { name: 'cloud_cover', type: 'UInt8', description: 'Cloud cover percentage (0-100)' },
    ],
  },
];

export function formatSchemaForPrompt(): string {
  return IESO_TABLES.map((table) => {
    const cols = table.columns
      .map((c) => `    ${c.name} ${c.type} -- ${c.description}`)
      .join('\n');
    return `TABLE: ieso.${table.name} (${table.frequency})\n  ${table.description}\n  COLUMNS:\n${cols}`;
  }).join('\n\n');
}
