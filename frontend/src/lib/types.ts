export interface ZonalPrice {
  zone: string;
  price: number;
  timestamp: string;
}

export interface ZonalDemand {
  zone: string;
  demand_mw: number;
  timestamp: string;
}

export interface FuelMix {
  fuel_type: string;
  output_mw: number;
  timestamp: string;
}

export interface GeneratorOutput {
  generator: string;
  fuel_type: string;
  output_mw: number;
  capability_mw: number;
  utilization_pct: number;
  timestamp: string;
}

export interface IntertieFlow {
  intertie: string;
  scheduled_mw: number;
  actual_mw: number;
  timestamp: string;
}

// Market History Types (for charting)
export interface DemandHistoryPoint {
  timestamp: string;
  demand_mw: number;
}

export interface PriceHistoryPoint {
  timestamp: string;
  price: number;
}

export interface SupplyHistoryPoint {
  timestamp: string;
  total_mw: number;
}

export interface GridLoadHistoryPoint {
  timestamp: string;
  grid_load_mw: number;
}

export interface MarketHistoryResponse {
  demand: DemandHistoryPoint[];
  gridLoad: GridLoadHistoryPoint[];
  price: PriceHistoryPoint[];
  supply: SupplyHistoryPoint[];
  hours: number;
  timestamp: string;
}

// Combined chart data point
export interface MarketChartDataPoint {
  timestamp: string;
  time: string;
  demand_mw: number | null;
  price: number | null;
  supply_mw: number | null;
}

// Zone boundary for map
export interface ZoneBoundary {
  zone: string;
  coordinates: [number, number][][]; // GeoJSON polygon coordinates
}

export interface ZoneData {
  zone: string;
  price: number;
  demand_mw: number;
  last_updated: string;
}

// Day-Ahead Types
export interface DayAheadDataPoint {
  timestamp: string;
  da_demand_mw: number | null;
  da_supply_mw: number | null;
  da_price: number | null;
}

export interface DayAheadResponse {
  data: DayAheadDataPoint[];
  today: string;
  tomorrow: string;
  timestamp: string;
}

// Peak Demand Types
export interface PeakForecast {
  peakMw: number;
  peakHour: number;
}

export interface PeakDemandResponse {
  today: PeakForecast;
  tomorrow: PeakForecast | null;
}

// Intertie Price Types
export interface IntertiePriceData {
  intertie_zone: string;
  lmp: number;
  timestamp: string;
}

// Weather Data Types
export interface WeatherData {
  zone: string;
  temperature: number;
  wind_speed: number;
  wind_direction: number;
  cloud_cover: number;
  precipitation?: number;
  last_updated: string;
}

export interface WeatherDataMap {
  [zone: string]: WeatherData;
}
