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
